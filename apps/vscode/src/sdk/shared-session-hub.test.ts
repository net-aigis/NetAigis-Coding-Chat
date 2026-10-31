import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	getSharedSessionHubConnection,
	saveSharedSessionHubConnection,
	validateSharedSessionHubConnection,
} from "./shared-session-hub"

const state = vi.hoisted(() => ({ value: undefined as string | undefined, set: vi.fn(), flush: vi.fn(async () => {}) }))
vi.mock("@/core/storage/StateManager", () => ({
	StateManager: { get: () => ({ getSecretKey: () => state.value, setSecret: state.set, flushPendingState: state.flush }) },
}))
beforeEach(() => {
	state.value = undefined
	vi.clearAllMocks()
})
describe("explicit shared-session transport configuration", () => {
	it("keeps the existing local runtime when no shared runtime was selected", () => {
		expect(getSharedSessionHubConnection()).toBeUndefined()
		expect(state.set).not.toHaveBeenCalled()
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
