import { beforeEach, expect, it, vi } from "vitest"
import { RecallRuntimeClient } from "./recall-runtime-client"

const mocks = vi.hoisted(() => ({ command: vi.fn(), close: vi.fn(), construct: vi.fn() }))
vi.mock("@cline/core/hub", async (original) => ({
	...(await original<typeof import("@cline/core/hub")>()),
	NodeHubClient: class {
		constructor(options: unknown) {
			mocks.construct(options)
		}
		command = mocks.command
		close = mocks.close
	},
}))
beforeEach(() => {
	vi.clearAllMocks()
	mocks.command.mockReset()
})
const connection = { endpoint: "wss://runtime-fixture.invalid/transport", authToken: "fixture-actor-login" }
it("sends only an inspected reference to the existing runtime and closes its temporary client", async () => {
	mocks.command.mockResolvedValue({
		ok: true,
		payload: { sessionId: "same-session", imported: true, writerGranted: false, runtimeResident: false },
	})
	const client = new RecallRuntimeClient(connection)
	expect(await client.restoreSession("same-session", 17)).toBe("same-session")
	expect(mocks.command).toHaveBeenCalledExactlyOnceWith(
		"session.recall.restore",
		{ conversationId: "same-session", expectedJournalSeq: 17 },
		"same-session",
		{ retryAfterDispatch: false },
	)
	expect(mocks.close).toHaveBeenCalledOnce()
	expect(mocks.construct).toHaveBeenCalledWith(
		expect.objectContaining({ url: connection.endpoint, authToken: connection.authToken, allowLocalHubRecovery: false }),
	)
})
it("keeps the selected connection and propagates a lost response without fallback, retry or a claimed success", async () => {
	mocks.command.mockRejectedValue(new Error("fixture lost response"))
	const mutable = { ...connection },
		client = new RecallRuntimeClient(mutable)
	mutable.authToken = "fixture-changed"
	expect(client.matchesConnection(mutable)).toBe(false)
	await expect(client.restoreSession("same-session", 17)).rejects.toThrow("fixture lost response")
	expect(mocks.command).toHaveBeenCalledOnce()
	expect(mocks.close).toHaveBeenCalledOnce()
})
it("does not accept a mismatched snapshot or an unconfirmed import acknowledgement", async () => {
	mocks.command.mockResolvedValueOnce({
		ok: true,
		payload: { snapshot: { conversationId: "other", journalSeq: 17, sourceVerified: true } },
	})
	const client = new RecallRuntimeClient(connection)
	await expect(client.getSessionSnapshot("same-session")).rejects.toThrow("not confirmed")
	mocks.command.mockResolvedValueOnce({
		ok: true,
		payload: { sessionId: "same-session", imported: true, writerGranted: true, runtimeResident: false },
	})
	await expect(client.restoreSession("same-session", 17)).rejects.toThrow("not confirmed")
	expect(mocks.close).toHaveBeenCalledTimes(2)
})
