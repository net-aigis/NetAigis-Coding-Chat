import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { SdkTaskHistory } from "./sdk-task-history"

const mock = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock("./vscode-session-host", () => ({ VscodeSessionHost: { create: mock.create } }))
vi.mock("./legacy-state-reader", () => ({ readTaskHistory: () => [] }))

const histories: SdkTaskHistory[] = []
beforeEach(() => {
	vi.resetAllMocks()
})
afterEach(async () => {
	await Promise.all(histories.splice(0).map((history) => history.dispose()))
})

function fixture(active = false) {
	const history = new SdkTaskHistory({
		mcpHub: {} as never,
		sessions: { getActiveSession: () => (active ? { sdkHost: { listHistory: vi.fn() } } : undefined) } as never,
	})
	histories.push(history)
	return history
}
function host(sessionId: string) {
	return {
		dispose: vi.fn(async () => {}),
		listHistory: vi.fn(async () => [{ sessionId, metadata: {}, status: "completed", updatedAt: "2026-11-01T00:00:00Z" }]),
	}
}
it("invalidates the old read-only host and metadata cache without copying, creating or stopping a session", async () => {
	const history = fixture(),
		old = host("existing-session"),
		next = host("existing-session")
	mock.create.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
	await history.listHistory({ hydrate: false })
	const configure = vi.fn(async () => {
		expect(old.dispose).toHaveBeenCalledExactlyOnceWith("taskHistory:runtimeSelection")
	})
	await history.configureRuntime(configure)
	expect(configure).toHaveBeenCalledOnce()
	expect((await history.listHistory({ hydrate: false }))[0].sessionId).toBe("existing-session")
	expect(next.listHistory).toHaveBeenCalledOnce()
})
it("does not release a host being created or an in-flight history read", async () => {
	const history = fixture(),
		current = host("existing-session")
	let finishCreate!: (value: ReturnType<typeof host>) => void
	mock.create.mockReturnValue(
		new Promise((resolve) => {
			finishCreate = resolve
		}),
	)
	const reading = history.listHistory({ hydrate: false })
	const configure = vi.fn(async () => {})
	await expect(history.configureRuntime(configure)).rejects.toThrow()
	// The lazy import need not have completed before the configuration guard is checked.
	await vi.waitFor(() => expect(mock.create).toHaveBeenCalledOnce())
	finishCreate(current)
	await reading
	expect(configure).not.toHaveBeenCalled()
	expect(current.dispose).not.toHaveBeenCalled()
})
it("blocks cached and new reads during a connection change, then reads the selected history", async () => {
	const history = fixture(),
		old = host("same-session"),
		next = host("same-session")
	mock.create.mockResolvedValueOnce(old).mockResolvedValueOnce(next)
	await history.listHistory({ hydrate: false })
	let release!: () => void
	const configuring = history.configureRuntime(
		() =>
			new Promise<void>((resolve) => {
				release = resolve
			}),
	)
	await vi.waitFor(() => expect(old.dispose).toHaveBeenCalledOnce())
	await expect(history.listHistory({ hydrate: false })).rejects.toThrow("Verbindungswechsel")
	await expect(history.configureRuntime(async () => {})).rejects.toThrow()
	await vi.waitFor(() => expect(release).toBeTypeOf("function"))
	release()
	await configuring
	await history.listHistory({ hydrate: false })
	expect(next.listHistory).toHaveBeenCalledOnce()
})
it("does not select a new runtime if read-only host disposal fails", async () => {
	const history = fixture(),
		old = host("same-session")
	mock.create.mockResolvedValueOnce(old)
	await history.listHistory({ hydrate: false })
	old.dispose.mockRejectedValue(new Error("fixture disposal failure"))
	const configure = vi.fn(async () => {})
	await expect(history.configureRuntime(configure)).rejects.toThrow("fixture disposal failure")
	expect(configure).not.toHaveBeenCalled()
	old.dispose.mockResolvedValue(undefined)
})
it("does not dispose or change a host of an active session", async () => {
	const history = fixture(true),
		configure = vi.fn(async () => {})
	await expect(history.configureRuntime(configure)).rejects.toThrow()
	expect(configure).not.toHaveBeenCalled()
	expect(mock.create).not.toHaveBeenCalled()
})
it("releases the history guard after authentication fails without recreating an empty conversation", async () => {
	const history = fixture()
	await expect(
		history.configureRuntime(async () => {
			throw new Error("fixture authentication failed")
		}),
	).rejects.toThrow()
	mock.create.mockResolvedValueOnce(host("original-session"))
	expect((await history.listHistory({ hydrate: false }))[0].sessionId).toBe("original-session")
})
