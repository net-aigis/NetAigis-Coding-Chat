import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type FetchCall = (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>

let queue: string
const configuration = {
	baseUrl: "http://recall-fixture.invalid:11436",
	token: "fixture-token",
	project: "independent-project",
	actor: "Friseer",
	enabled: true,
}

beforeEach(async () => {
	queue = await mkdtemp(path.join(os.tmpdir(), "cline-recall-contract-"))
	vi.resetModules()
	vi.stubEnv("NETAIGIS_RECALL_QUEUE_DIR", queue)
})

afterEach(async () => {
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
	await rm(queue, { recursive: true, force: true })
})

describe("preserved TOTAL RECALL event API contract", () => {
	it("keeps the configured endpoint, actor, project and conversation", async () => {
		const fetch = vi.fn<FetchCall>(async () => new Response("{}", { status: 200 }))
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent } = await import("./recall-outbox")
		await archiveSdkEvent({ sessionId: "existing-session", type: "fixture-event" }, configuration)
		expect(fetch).toHaveBeenCalledOnce()
		const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
		expect(url).toBe(configuration.baseUrl + "/internal/recall/events")
		expect(new Headers(options.headers).get("Authorization")).toBe("Bearer fixture-token")
		expect(JSON.parse(String(options.body))).toMatchObject({
			project_id: "independent-project",
			conversation_id: "existing-session",
			actor_id: "Friseer",
			kind: "cline.sdk.event",
		})
		expect(await readdir(queue)).toEqual([])
	})

	it("preserves the event ID and original attribution when delivery is retried", async () => {
		const fetch = vi.fn<FetchCall>(async () => new Response("{}", { status: 503 }))
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent, drainRecallOutbox } = await import("./recall-outbox")
		await archiveSdkEvent({ sessionId: "existing-session" }, configuration)
		const files = await readdir(queue)
		expect(files).toHaveLength(1)
		const original = JSON.parse(await readFile(path.join(queue, files[0]), "utf8"))
		fetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))
		await drainRecallOutbox({ ...configuration, actor: "jimmi" })
		const options = fetch.mock.calls[1]?.[1] as unknown as RequestInit
		expect(JSON.parse(String(options.body))).toEqual(original)
		expect(original.actor_id).toBe("Friseer")
		expect(await readdir(queue)).toEqual([])
	})

	it("does not invent a conversation ID for an unmapped event", async () => {
		const fetch = vi.fn<FetchCall>()
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent } = await import("./recall-outbox")
		await archiveSdkEvent({ type: "no-session-mapping" }, configuration)
		expect(fetch).not.toHaveBeenCalled()
		expect(await readdir(queue)).toEqual([])
	})
})
