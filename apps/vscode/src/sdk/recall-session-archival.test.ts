import type { CoreSessionEvent } from "@cline/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { VscodeSessionHost } from "./vscode-session-host"

const mocks = vi.hoisted(() => ({
	listeners: new Set<(event: CoreSessionEvent) => void>(),
	archive: vi.fn(async () => {}),
	messages: vi.fn(async () => [{ role: "user", content: "original order", metadata: { author: "Friseer" } }]),
	dispose: vi.fn(async () => {}),
	stopReplay: vi.fn(),
	startReplay: vi.fn(),
	unsubscribe: vi.fn(),
	ownership: vi.fn(async () => ({ configured: false })),
	config: {
		baseUrl: "http://recall-fixture.invalid",
		token: "fixture-token",
		project: "independent-project",
		actor: "Friseer",
		enabled: true,
	},
}))
vi.mock("@cline/core", async (original) => ({
	...(await original<typeof import("@cline/core")>()),
	ClineCore: {
		create: async () => ({
			subscribe(listener: (event: CoreSessionEvent) => void) {
				mocks.listeners.add(listener)
				return () => {
					mocks.listeners.delete(listener)
					mocks.unsubscribe()
				}
			},
			dispose: () => mocks.dispose(),
			getRecallArchiveStatus: () => mocks.ownership(),
			readLiveMessages: (...args: unknown[]) => mocks.messages(...(args as [])),
		}),
	},
}))
vi.mock("@/services/logging/distinctId", () => ({ getDistinctId: () => "fixture-id" }))
vi.mock("@/core/storage/StateManager", () => ({
	StateManager: { get: () => ({ getGlobalStateKey: () => undefined, getSecretKey: () => undefined }) },
}))
vi.mock("./vscode-runtime-builder", () => ({ createVscodeExtraTools: async () => [] }))
vi.mock("./recall-config-manager", () => ({ getRecallConfiguration: async () => mocks.config }))
vi.mock("./recall-outbox", () => ({
	archiveSdkEvent: (...args: unknown[]) => mocks.archive(...(args as [])),
	drainRecallOutbox: vi.fn(async () => {}),
	startRecallOutbox: (...args: unknown[]) => {
		mocks.startReplay(...args)
		return mocks.stopReplay
	},
	flushRecallOutboxWrites: async () => {},
}))
beforeEach(() => {
	vi.clearAllMocks()
	mocks.listeners.clear()
	mocks.ownership.mockResolvedValue({ configured: false })
})

describe("TOTAL RECALL runtime event subscription", () => {
	const sharedSessionHub = { endpoint: "ws://127.0.0.1:12345", authToken: "fixture-hub-token" }
	it("leaves archival to the owning runtime while still delivering UI events", async () => {
		mocks.ownership.mockResolvedValueOnce({ configured: true })
		const host = await VscodeSessionHost.create({ mcpHub: {} as never, sharedSessionHub })
		const ui = vi.fn()
		host.subscribe(ui)
		const event: CoreSessionEvent = { type: "status", payload: { sessionId: "same-session", status: "running" } }
		for (const listener of mocks.listeners) listener(event)
		expect(mocks.ownership).toHaveBeenCalledOnce()
		expect(ui).toHaveBeenCalledExactlyOnceWith(event)
		expect(mocks.archive).not.toHaveBeenCalled()
		await host.dispose()
	})

	it("fails closed on a failed shared-runtime ownership query without starting a local archive", async () => {
		mocks.ownership.mockRejectedValueOnce(new Error("hub disconnected"))
		await expect(VscodeSessionHost.create({ mcpHub: {} as never, sharedSessionHub })).rejects.toThrow("hub disconnected")
		expect(mocks.dispose).toHaveBeenCalledOnce()
		expect(mocks.startReplay).not.toHaveBeenCalled()
		expect(mocks.listeners.size).toBe(0)
	})

	it("archives each Core event once, independently of the number of UI subscribers", async () => {
		const host = await VscodeSessionHost.create({ mcpHub: {} as never })
		const first = vi.fn(),
			second = vi.fn()
		const unsubscribeFirst = host.subscribe(first),
			unsubscribeSecond = host.subscribe(second)
		const event: CoreSessionEvent = { type: "status", payload: { sessionId: "actual-session", status: "running" } }
		for (const listener of mocks.listeners) listener(event)
		expect(first).toHaveBeenCalledExactlyOnceWith(event)
		expect(second).toHaveBeenCalledExactlyOnceWith(event)
		await vi.waitFor(() => expect(mocks.archive).toHaveBeenCalledOnce())
		expect(mocks.archive).toHaveBeenCalledWith(event, mocks.config)
		unsubscribeFirst()
		unsubscribeSecond()
		await host.dispose()
	})

	it("archives the canonical transcript omitted by Core's notification snapshot", async () => {
		const host = await VscodeSessionHost.create({ mcpHub: {} as never })
		const event = {
			type: "session_snapshot",
			payload: { sessionId: "stable-session", snapshot: { version: 1, sessionId: "stable-session", status: "completed" } },
		} as CoreSessionEvent
		for (const listener of mocks.listeners) listener(event)
		await vi.waitFor(() => expect(mocks.archive).toHaveBeenCalledOnce())
		expect(mocks.messages).toHaveBeenCalledWith("stable-session")
		expect(mocks.archive).toHaveBeenCalledWith(
			{
				...event,
				payload: {
					...event.payload,
					snapshot: {
						...(event as any).payload.snapshot,
						messages: [{ role: "user", content: "original order", metadata: { author: "Friseer" } }],
					},
				},
			},
			mocks.config,
		)
		expect((event as any).payload.snapshot).not.toHaveProperty("messages")
		await host.dispose()
	})

	it("captures final disposal state before releasing the journal subscription", async () => {
		const event: CoreSessionEvent = { type: "status", payload: { sessionId: "stable-session", status: "aborted" } }
		mocks.dispose.mockImplementationOnce(async () => {
			for (const listener of mocks.listeners) listener(event)
		})
		const host = await VscodeSessionHost.create({ mcpHub: {} as never })
		await host.dispose()
		expect(mocks.archive).toHaveBeenCalledWith(event, mocks.config)
		expect(mocks.listeners.size).toBe(0)
	})

	it("starts configured replay and releases its own subscriptions on disposal", async () => {
		const host = await VscodeSessionHost.create({ mcpHub: {} as never })
		expect(mocks.startReplay).toHaveBeenCalledOnce()
		await host.dispose()
		expect(mocks.stopReplay).toHaveBeenCalledOnce()
		expect(mocks.listeners.size).toBe(0)
	})
})
