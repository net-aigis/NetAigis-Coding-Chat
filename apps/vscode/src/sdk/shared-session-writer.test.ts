import type { SessionWriterControl } from "@cline/core/hub"
import { beforeEach, expect, it, vi } from "vitest"
import { SdkSessionLifecycle } from "./sdk-session-lifecycle"

const mock = vi.hoisted(() => ({ create: vi.fn(), selected: true }))
vi.mock("./vscode-session-host", () => ({ VscodeSessionHost: { create: mock.create } }))
vi.mock("@/core/storage/StateManager", () => ({
	StateManager: {
		get: () => ({
			getGlobalSettingsKey: () => undefined,
			getSecretKey: () =>
				mock.selected
					? JSON.stringify({ endpoint: "ws://127.0.0.1:25463/hub", authToken: "fixture-personal" })
					: undefined,
		}),
	},
}))
beforeEach(() => {
	vi.resetAllMocks()
	mock.selected = true
})

function fixture() {
	const control: SessionWriterControl = { version: 1, revision: 4 }
	const host = {
		get: vi.fn(async () => ({ metadata: { title: "Existing", recallProjectId: undefined as string | undefined } })),
		update: vi.fn(async (_id: string, _updates: unknown) => ({ updated: true })),
		getSessionControl: vi.fn(async () => control),
		getAuthenticatedActorId: vi.fn((): string | undefined => "Friseer"),
		claimSessionControl: vi.fn(async (_id: string, _revision: number) => ({
			...control,
			revision: 5,
			writer: { actorId: "Friseer", clientId: "same-runtime-client", connectionId: "same-connection" },
		})),
		releaseSessionControl: vi.fn(async () => ({ ...control, revision: 5 })),
		subscribe: vi.fn(() => () => {}),
		start: vi.fn(async () => ({ sessionId: "same-existing-session" })),
		stop: vi.fn(async () => {}),
		dispose: vi.fn(async () => {}),
	}
	mock.create.mockResolvedValue(host)
	const lifecycle = new SdkSessionLifecycle({
		mcpHub: {} as never,
		requestToolApproval: vi.fn(),
		askQuestion: vi.fn(),
		onSessionEvent: vi.fn(),
		onSendComplete: vi.fn(),
		onSendError: vi.fn(),
	})
	const input = { sessionId: "same-existing-session", isCurrent: () => true }
	return { host, lifecycle, input }
}
it("claims on the same Runtime client later used for the existing canonical session", async () => {
	const { host, lifecycle, input } = fixture()
	const result = await lifecycle.controlSharedSessionWriter({ ...input, action: "claim", expectedRevision: 4 })
	expect(result).toMatchObject({
		sessionId: input.sessionId,
		actorId: "Friseer",
		control: { revision: 5, writer: { actorId: "Friseer" } },
	})
	await lifecycle.startNewSession({ config: { sessionId: input.sessionId } } as never)
	expect(mock.create).toHaveBeenCalledOnce()
	expect(lifecycle.getActiveSession()?.sdkHost).toBe(host)
	expect(host.claimSessionControl).toHaveBeenCalledExactlyOnceWith(input.sessionId, 4)
	expect(host.stop).not.toHaveBeenCalled()
})
it("binds an explicit Recall project through the owning authenticated client without replaying history", async () => {
	const { host, lifecycle, input } = fixture()
	host.getSessionControl.mockResolvedValue({
		version: 1,
		revision: 4,
		writer: { actorId: "Friseer", clientId: "same", connectionId: "same" },
	})
	host.get
		.mockResolvedValueOnce({ metadata: { title: "Existing", recallProjectId: undefined } })
		.mockResolvedValueOnce({ metadata: { title: "Existing", recallProjectId: "NetAigisOS" } })
	expect(await lifecycle.configureSharedSessionRecallProject({ ...input, projectId: "NetAigisOS" })).toEqual({
		sessionId: input.sessionId,
		actorId: "Friseer",
		projectId: "NetAigisOS",
	})
	expect(host.update).toHaveBeenCalledExactlyOnceWith(input.sessionId, { metadata: { recallProjectId: "NetAigisOS" } })
	expect(host.start).not.toHaveBeenCalled()
	expect(host.claimSessionControl).not.toHaveBeenCalled()
	expect(host.stop).not.toHaveBeenCalled()
})
it("reads current Recall binding without assigning a global default", async () => {
	const { host, lifecycle, input } = fixture()
	expect(await lifecycle.configureSharedSessionRecallProject(input)).toEqual({
		sessionId: input.sessionId,
		actorId: "Friseer",
		projectId: undefined,
	})
	expect(host.update).not.toHaveBeenCalled()
})
it("refuses Recall reassignment or missing writer authority without mutating the session", async () => {
	const { host, lifecycle, input } = fixture()
	host.get.mockResolvedValue({ metadata: { title: "Existing", recallProjectId: "NetAigisOS" } })
	await expect(lifecycle.configureSharedSessionRecallProject({ ...input, projectId: "Different" })).rejects.toThrow("bereits")
	host.get.mockResolvedValue({ metadata: { title: "Existing", recallProjectId: undefined } })
	await expect(lifecycle.configureSharedSessionRecallProject({ ...input, projectId: "NetAigisOS" })).rejects.toThrow(
		"Schreibrecht",
	)
	expect(host.update).not.toHaveBeenCalled()
	expect(host.claimSessionControl).not.toHaveBeenCalled()
})
it("does not bind after selection changes or report success after uncertain acknowledgement", async () => {
	const { host, lifecycle, input } = fixture()
	let current = true
	host.get.mockImplementationOnce(async () => {
		current = false
		return { metadata: { title: "Existing", recallProjectId: undefined } }
	})
	await expect(
		lifecycle.configureSharedSessionRecallProject({ ...input, projectId: "NetAigisOS", isCurrent: () => current }),
	).rejects.toThrow("stabil")
	expect(host.update).not.toHaveBeenCalled()
	current = true
	host.getSessionControl.mockResolvedValue({
		version: 1,
		revision: 4,
		writer: { actorId: "Friseer", clientId: "same", connectionId: "same" },
	})
	host.update.mockRejectedValue(new Error("fixture uncertain acknowledgement"))
	await expect(lifecycle.configureSharedSessionRecallProject({ ...input, projectId: "NetAigisOS" })).rejects.toThrow(
		"uncertain",
	)
	expect(host.update).toHaveBeenCalledOnce()
})
it("reads and releases without starting, stopping, aborting or replaying a turn", async () => {
	const { host, lifecycle, input } = fixture()
	await lifecycle.controlSharedSessionWriter({ ...input, action: "get" })
	expect(host.claimSessionControl).not.toHaveBeenCalled()
	await lifecycle.controlSharedSessionWriter({ ...input, action: "release", expectedRevision: 4 })
	expect(host.releaseSessionControl).toHaveBeenCalledExactlyOnceWith(input.sessionId, 4)
	expect(host.start).not.toHaveBeenCalled()
	expect(host.stop).not.toHaveBeenCalled()
})
it("refuses absent personal identity before any claim or release", async () => {
	const { host, lifecycle, input } = fixture()
	host.getAuthenticatedActorId.mockReturnValue(undefined)
	await expect(lifecycle.controlSharedSessionWriter({ ...input, action: "claim", expectedRevision: 4 })).rejects.toThrow(
		"persönliche",
	)
	expect(host.claimSessionControl).not.toHaveBeenCalled()
})
it("keeps the inspected revision and never retries a denied or uncertain handover", async () => {
	const { host, lifecycle, input } = fixture()
	host.claimSessionControl.mockRejectedValue(new Error("fixture unknown process state or lost acknowledgement"))
	await expect(lifecycle.controlSharedSessionWriter({ ...input, action: "claim", expectedRevision: 3 })).rejects.toThrow(
		"fixture",
	)
	expect(host.claimSessionControl).toHaveBeenCalledExactlyOnceWith(input.sessionId, 3)
	expect(host.start).not.toHaveBeenCalled()
	expect(host.dispose).not.toHaveBeenCalled()
})
it("does not mutate after the selected history changed while reading server state", async () => {
	const { host, lifecycle, input } = fixture()
	let current = true
	host.getSessionControl.mockImplementationOnce(async () => {
		current = false
		return { version: 1, revision: 4 }
	})
	await expect(
		lifecycle.controlSharedSessionWriter({ ...input, isCurrent: () => current, action: "claim", expectedRevision: 4 }),
	).rejects.toThrow("nicht stabil")
	expect(host.claimSessionControl).not.toHaveBeenCalled()
})
it("refuses local mode, invalid revisions and a different active session before making a claim", async () => {
	const { host, lifecycle, input } = fixture()
	mock.selected = false
	await expect(lifecycle.controlSharedSessionWriter({ ...input, action: "get" })).rejects.toThrow("verbinden")
	expect(mock.create).not.toHaveBeenCalled()
	mock.selected = true
	await expect(lifecycle.controlSharedSessionWriter({ ...input, action: "claim", expectedRevision: -1 })).rejects.toThrow(
		"revision",
	)
	await lifecycle.startNewSession({} as never)
	await expect(
		lifecycle.controlSharedSessionWriter({ ...input, sessionId: "different", action: "claim", expectedRevision: 4 }),
	).rejects.toThrow("nicht stabil")
	expect(host.claimSessionControl).not.toHaveBeenCalled()
	expect(host.stop).not.toHaveBeenCalled()
})
