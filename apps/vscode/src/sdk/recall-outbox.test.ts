import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type FetchCall = (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>
const acknowledge: FetchCall = async (_url, options) =>
	new Response(
		JSON.stringify({
			event_id: JSON.parse(String(options?.body)).event_id,
			inserted: true,
		}),
		{ status: 200 },
	)

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
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
	await rm(queue, { recursive: true, force: true })
})

describe("preserved TOTAL RECALL event API contract", () => {
	it("retains a staged event when HTTP success does not acknowledge its exact event ID", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchCall>(async () => new Response("{}", { status: 200 })),
		)
		const { archiveSdkEvent } = await import("./recall-outbox")
		await archiveSdkEvent({ sessionId: "stable-session" }, configuration)
		expect(await readdir(queue)).toHaveLength(1)
	})

	it("keeps the configured endpoint, actor, project and conversation", async () => {
		const fetch = vi.fn<FetchCall>(acknowledge)
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
		await drainRecallOutbox({ ...configuration, actor: "jimmi" })
		expect(fetch).toHaveBeenCalledTimes(1)
		expect(JSON.parse(await readFile(path.join(queue, files[0]), "utf8"))).toEqual(original)
		fetch.mockImplementationOnce(acknowledge)
		await drainRecallOutbox(configuration)
		const options = fetch.mock.calls[1]?.[1] as unknown as RequestInit
		expect(JSON.parse(String(options.body))).toMatchObject({
			event_id: original.event_id,
			actor_id: original.actor_id,
			payload: original.payload,
		})
		expect(original.actor_id).toBe("Friseer")
		expect(await readdir(queue)).toEqual([])
	})

	it("maps a real Core event payload to its stable session ID", async () => {
		const fetch = vi.fn<FetchCall>(acknowledge)
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent } = await import("./recall-outbox")
		await archiveSdkEvent(
			{ type: "agent_event", payload: { sessionId: "stable-session", event: { conversationId: "runtime-conversation" } } },
			configuration,
		)
		expect(fetch).toHaveBeenCalledOnce()
		expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ conversation_id: "stable-session" })
	})

	it("does not replay stored data to a different configured destination", async () => {
		const fetch = vi.fn<FetchCall>(async () => new Response("{}", { status: 503 }))
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent, drainRecallOutbox } = await import("./recall-outbox")
		await archiveSdkEvent({ sessionId: "stable-session" }, configuration)
		await drainRecallOutbox({ ...configuration, baseUrl: "http://different-fixture.invalid" })
		expect(fetch).toHaveBeenCalledTimes(1)
		expect(await readdir(queue)).toHaveLength(1)
	})

	it("keeps event order when several events are staged during the same millisecond", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1793395200000)
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchCall>(async () => new Response("{}", { status: 503 })),
		)
		const { archiveSdkEvent } = await import("./recall-outbox")
		await Promise.all([
			archiveSdkEvent({ sessionId: "stable-session", index: 1 }, configuration),
			archiveSdkEvent({ sessionId: "stable-session", index: 2 }, configuration),
		])
		const files = (await readdir(queue)).filter((name) => name.endsWith(".json")).sort()
		expect(Number(files[1].split("-")[0])).toBeGreaterThan(Number(files[0].split("-")[0]))
		const events = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(queue, name), "utf8"))))
		expect(events.map((event) => event.payload.sdk_event.index)).toEqual([1, 2])
	})

	it("accepts a server-confirmed identical event on retry", async () => {
		const fetch = vi.fn<FetchCall>(async () => new Response("{}", { status: 503 }))
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent, drainRecallOutbox } = await import("./recall-outbox")
		await archiveSdkEvent({ sessionId: "stable-session" }, configuration)
		fetch.mockImplementationOnce(
			async (_url, options) =>
				new Response(JSON.stringify({ event_id: JSON.parse(String(options?.body)).event_id, inserted: false }), {
					status: 200,
				}),
		)
		expect(await drainRecallOutbox(configuration)).toMatchObject({ sent: 1, pending: 0 })
	})

	it("protects durable staged content and does not mutate original attribution or include credentials", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchCall>(async () => new Response("{}", { status: 503 })),
		)
		const { archiveSdkEvent } = await import("./recall-outbox")
		const event = { sessionId: "stable-session", payload: { text: "literal original" } }
		const pending = archiveSdkEvent(event, configuration)
		event.payload.text = "later mutation"
		await pending
		const file = path.join(queue, (await readdir(queue))[0])
		const text = await readFile(file, "utf8")
		expect(JSON.parse(text).payload.sdk_event.payload.text).toBe("literal original")
		expect(text).not.toContain(configuration.token)
		expect((await stat(file)).mode & 0o777).toBe(0o600)
	})

	it("retains legacy records without guessing their destination", async () => {
		const record = {
			event_id: "legacy",
			project_id: configuration.project,
			conversation_id: "stable-session",
			actor_id: configuration.actor,
			kind: "cline.sdk.event",
			payload: {},
		}
		const file = path.join(queue, "0000000000001-legacy.json")
		await writeFile(file, JSON.stringify(record), { mode: 0o600 })
		const fetch = vi.fn<FetchCall>()
		vi.stubGlobal("fetch", fetch)
		const { drainRecallOutbox } = await import("./recall-outbox")
		expect(await drainRecallOutbox(configuration)).toEqual({ sent: 0, pending: 1, blocked: "unbound_legacy" })
		expect(JSON.parse(await readFile(file, "utf8"))).toEqual(record)
		expect(fetch).not.toHaveBeenCalled()
	})

	it("automatically retries a staged event after backoff, without an incoming UI event", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
		const fetch = vi.fn<FetchCall>(async () => new Response("{}", { status: 503 }))
		vi.stubGlobal("fetch", fetch)
		const { archiveSdkEvent, startRecallOutbox } = await import("./recall-outbox")
		await archiveSdkEvent({ sessionId: "stable-session" }, configuration)
		fetch.mockImplementation(acknowledge)
		const stop = startRecallOutbox(async () => configuration)
		try {
			await vi.advanceTimersByTimeAsync(29999)
			expect(fetch).toHaveBeenCalledTimes(1)
			await vi.advanceTimersByTimeAsync(1)
			await vi.waitFor(async () => expect(await readdir(queue)).toEqual([]))
			expect(fetch).toHaveBeenCalledTimes(2)
		} finally {
			stop()
			vi.useRealTimers()
		}
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
