import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	getSharedSessionHubConnection,
	saveSharedSessionHubConnection,
	validateSharedSessionHubConnection,
	verifySharedSessionHubActor,
} from "./shared-session-hub"

const state = vi.hoisted(() => ({
	value: undefined as string | undefined,
	set: vi.fn(),
	flush: vi.fn(async () => {}),
	manager: {} as {
		getSecretKey: () => string | undefined
		setSecret: (key: string, value: string | undefined) => void
		flushPendingState: () => Promise<void>
	},
}))
const transport = vi.hoisted(() => ({ connect: vi.fn(), actor: vi.fn(), close: vi.fn(), create: vi.fn() }))
vi.mock("@cline/core/hub", () => ({
	NodeHubClient: class {
		constructor(options: unknown) {
			transport.create(options)
		}
		connect = transport.connect
		getAuthenticatedActorId = transport.actor
		close = transport.close
	},
}))
vi.mock("@/core/storage/StateManager", () => ({
	StateManager: { get: () => state.manager },
}))
beforeEach(() => {
	state.value = undefined
	vi.clearAllMocks()
	state.set.mockImplementation((_key, value) => {
		state.value = value
	})
	state.flush.mockReset().mockResolvedValue(undefined)
	state.manager = { getSecretKey: () => state.value, setSecret: state.set, flushPendingState: state.flush }
	transport.connect.mockReset().mockResolvedValue(undefined)
	transport.actor.mockReset().mockReturnValue("Friseer")
})
describe("explicit shared-session transport configuration", () => {
	it("keeps the existing local runtime when no shared runtime was selected", () => {
		expect(getSharedSessionHubConnection()).toBeUndefined()
		expect(state.set).not.toHaveBeenCalled()
	})
	it.each([
		"ws://192.168.178.43:25463/hub",
		"ws://127.0.0.2/hub",
		"ws://localhost.evil.invalid/hub",
	])("refuses plaintext personal credentials outside explicit loopback (%#)", (endpoint) => {
		expect(() => validateSharedSessionHubConnection({ endpoint, authToken: "fixture-secret" })).toThrow()
	})
	it.each([
		"ws://127.0.0.1:25463/hub",
		"ws://localhost:25463/hub",
		"ws://[::1]:25463/hub",
	])("retains the existing loopback transport (%#)", (endpoint) => {
		expect(validateSharedSessionHubConnection({ endpoint, authToken: "fixture-secret" }).endpoint).toBe(endpoint)
	})
	it("verifies personal identity on the selected server without a write or replacement runtime", async () => {
		const config = { endpoint: "wss://explicit-fixture.invalid/hub", authToken: "fixture-secret" }
		expect(await verifySharedSessionHubActor(config)).toBe("Friseer")
		expect(transport.create).toHaveBeenCalledWith(
			expect.objectContaining({ url: config.endpoint, authToken: config.authToken, allowLocalHubRecovery: false }),
		)
		expect(transport.close).toHaveBeenCalledOnce()
		expect(state.set).not.toHaveBeenCalled()
	})
	it("refuses an administrator-only token without a server-confirmed author", async () => {
		transport.actor.mockReturnValue(undefined)
		await expect(
			verifySharedSessionHubActor({ endpoint: "ws://127.0.0.1/hub", authToken: "fixture-secret" }),
		).rejects.toThrow("persönliche")
		expect(transport.close).toHaveBeenCalledOnce()
		expect(state.set).not.toHaveBeenCalled()
	})
	it("does not echo transport errors or credentials", async () => {
		transport.connect.mockRejectedValue(new Error("fixture-secret wss://sensitive-fixture.invalid"))
		await expect(
			verifySharedSessionHubActor({ endpoint: "ws://127.0.0.1/hub", authToken: "fixture-secret" }),
		).rejects.not.toThrow("fixture-secret")
		expect(transport.close).toHaveBeenCalledOnce()
	})
	it("retains the previous connection after a failed persistence attempt", async () => {
		const previous = JSON.stringify({ endpoint: "ws://127.0.0.1/hub", authToken: "fixture-previous" })
		state.value = previous
		state.flush.mockRejectedValueOnce(new Error("fixture storage failure"))
		await expect(
			saveSharedSessionHubConnection({ endpoint: "wss://new-fixture.invalid/hub", authToken: "fixture-secret" }),
		).rejects.toThrow()
		expect(state.value).toBe(previous)
		expect(state.flush).toHaveBeenCalledTimes(2)
	})
	it("reports an unverified disk rollback instead of claiming a successful selection", async () => {
		state.value = "previous-value"
		state.flush.mockRejectedValue(new Error("fixture-secret storage failure"))
		await expect(
			saveSharedSessionHubConnection({ endpoint: "ws://127.0.0.1/hub", authToken: "fixture-secret" }),
		).rejects.toThrow("vor weiterer Nutzung prüfen")
		expect(state.value).toBe("previous-value")
		expect(state.flush).toHaveBeenCalledTimes(2)
		expect(() => getSharedSessionHubConnection()).toThrow("ungeklärt")
	})
	it("does not redirect this window when shared storage is refreshed elsewhere", async () => {
		const original = { endpoint: "ws://127.0.0.1/hub", authToken: "fixture-original" }
		state.value = JSON.stringify(original)
		expect(getSharedSessionHubConnection()).toEqual(original)
		const next = { endpoint: "wss://next-fixture.invalid/hub", authToken: "fixture-next" }
		state.value = JSON.stringify(next)
		expect(getSharedSessionHubConnection()).toEqual(original)
		const returned = getSharedSessionHubConnection()
		if (returned) returned.authToken = "fixture-mutated"
		expect(getSharedSessionHubConnection()).toEqual(original)
		await saveSharedSessionHubConnection(next)
		expect(getSharedSessionHubConnection()).toEqual(next)
	})
	it("keeps an already selected local runtime until this window explicitly configures another", async () => {
		expect(getSharedSessionHubConnection()).toBeUndefined()
		const next = { endpoint: "wss://next-fixture.invalid/hub", authToken: "fixture-next" }
		state.value = JSON.stringify(next)
		expect(getSharedSessionHubConnection()).toBeUndefined()
		await saveSharedSessionHubConnection(next)
		expect(getSharedSessionHubConnection()).toEqual(next)
	})
	it("loads and stores only the explicitly configured protected connection", async () => {
		const config = { endpoint: "wss://explicit-fixture.invalid/hub", authToken: "fixture-secret" }
		await saveSharedSessionHubConnection(config)
		expect(state.set).toHaveBeenCalledWith("shared-session-hub_connection", JSON.stringify(config))
		expect(state.flush).toHaveBeenCalledOnce()
		state.value = JSON.stringify(config)
		expect(getSharedSessionHubConnection()).toEqual(config)
	})
	it.each([
		"",
		"{}",
		"null",
		"broken",
		JSON.stringify({ endpoint: "http://fixture.invalid", authToken: "fixture-secret" }),
	])("does not fall back or echo a malformed saved value (%#)", (serialized) => {
		state.value = serialized
		expect(() => getSharedSessionHubConnection()).toThrow("no replacement runtime")
	})
	it.each([
		"ws://user:fixture-secret@fixture.invalid/hub",
		"ws://fixture.invalid/hub?token=fixture-secret",
		"ws://fixture.invalid/hub#fixture-secret",
	])("does not accept credentials in a shareable endpoint (%#)", (endpoint) => {
		expect(() => validateSharedSessionHubConnection({ endpoint, authToken: "fixture-secret" })).toThrow("separate credential")
		try {
			validateSharedSessionHubConnection({ endpoint, authToken: "fixture-secret" })
		} catch (error) {
			expect(String(error)).not.toContain("fixture-secret")
		}
	})
})
