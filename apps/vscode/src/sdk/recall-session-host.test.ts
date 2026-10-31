import { afterEach, describe, expect, it, vi } from "vitest"
import { TotalRecallSessionHost } from "./recall-session-host"

vi.mock("@/shared/net", () => ({ fetch: (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args) }))

type FetchCall = (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>
const config = {
	baseUrl: "http://recall-fixture.invalid:11436",
	token: "fixture-token",
	project: "independent-project",
	actor: "jimmi",
	enabled: true,
}
const event = {
	seq: 4,
	event_id: "original-event",
	project_id: config.project,
	conversation_id: "stable-session",
	actor_id: "Friseer",
	kind: "cline.sdk.event",
	created_at: "2026-10-30T16:00:00Z",
	payload: {
		sdk_event: {
			type: "session_snapshot",
			payload: {
				sessionId: "stable-session",
				snapshot: {
					version: 1,
					sessionId: "stable-session",
					status: "completed",
					messages: [{ role: "user", content: "original order", metadata: { author: "Friseer" } }],
				},
			},
		},
	},
}
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})
async function host() {
	const host = new TotalRecallSessionHost(async () => config)
	await host.initialize(config)
	return host
}

describe("existing productive TOTAL RECALL API", () => {
	it("lists the configured project using the actual server response", async () => {
		const fetch = vi.fn<FetchCall>(
			async () =>
				new Response(
					JSON.stringify({ conversations: [{ conversation_id: "stable-session", event_count: 5, last_seq: 9 }] }),
					{ status: 200 },
				),
		)
		vi.stubGlobal("fetch", fetch)
		const sessions = await (await host()).listConversations()
		const url = new URL(String(fetch.mock.calls[0][0]))
		expect(url.pathname).toBe("/internal/recall/conversations")
		expect(url.searchParams.get("project_id")).toBe(config.project)
		expect(url.searchParams.has("actor_id")).toBe(false)
		expect(sessions).toMatchObject([
			{ conversationId: "stable-session", projectId: config.project, eventCount: 5, lastSeq: 9 },
		])
	})
	it("reads the real event journal and retains the original author without inventing a snapshot endpoint", async () => {
		const fetch = vi.fn<FetchCall>(
			async (input) =>
				new Response(
					JSON.stringify(
						String(input).includes("/conversations")
							? { conversations: [{ conversation_id: "stable-session", event_count: 1, last_seq: 4 }] }
							: { events: [event] },
					),
					{ status: 200 },
				),
		)
		vi.stubGlobal("fetch", fetch)
		const snapshot = await (await host()).getSessionSnapshot("stable-session")
		const request = fetch.mock.calls.find(([input]) => String(input).includes("/events"))
		if (!request) throw new Error("Expected actual event page request")
		const url = new URL(String(request[0]))
		expect(url.pathname).toBe("/internal/recall/events")
		expect(url.searchParams.get("project_id")).toBe(config.project)
		expect(url.searchParams.get("conversation_id")).toBe("stable-session")
		expect(snapshot.messages).toEqual([event])
		expect(snapshot.recordedSnapshot?.messages).toEqual(event.payload.sdk_event.payload.snapshot.messages)
		expect(snapshot.metadata?.actorId).toBe("Friseer")
		expect(snapshot.currentActorId).toBeUndefined()
	})
	it("rejects malformed responses and records from another project rather than showing an empty successful result", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchCall>(
				async (input) =>
					new Response(
						JSON.stringify(
							String(input).includes("/conversations")
								? { conversations: [{ conversation_id: "stable-session", event_count: 1, last_seq: 4 }] }
								: { events: [{ ...event, project_id: "different-project" }] },
						),
						{ status: 200 },
					),
			),
		)
		await expect((await host()).getSessionSnapshot("stable-session")).rejects.toThrow("mis-scoped")
	})
	it("does not claim an actor lease or successful takeover through nonexistent server routes", async () => {
		const fetch = vi.fn()
		vi.stubGlobal("fetch", fetch)
		const client = await host()
		expect(await client.takeOverSession("stable-session", config.actor)).toMatchObject({ success: false })
		expect(await client.releaseSession("stable-session", config.actor)).toBe(false)
		expect(await client.getSessionLockStatus("stable-session")).toMatchObject({ verified: false })
		expect(fetch).not.toHaveBeenCalled()
	})
})

it("does not expose an earlier full snapshot as a safe restore after a later incomplete capture", async () => {
	const tail = {
		...event,
		seq: 5,
		event_id: "later-incomplete",
		payload: {
			sdk_event: {
				type: "session_snapshot",
				payload: {
					sessionId: "stable-session",
					snapshot: { version: 1, sessionId: "stable-session", status: "running" },
				},
			},
		},
	}
	vi.stubGlobal(
		"fetch",
		vi.fn<FetchCall>(
			async (input) =>
				new Response(
					JSON.stringify(
						String(input).includes("/conversations")
							? { conversations: [{ conversation_id: "stable-session", event_count: 2, last_seq: 5 }] }
							: { events: [event, tail] },
					),
					{ status: 200 },
				),
		),
	)
	expect(await (await host()).getSessionSnapshot("stable-session")).toMatchObject({
		restoration: { available: false, reason: "incomplete_tail" },
	})
})
it("reads the captured journal watermark through after_seq pages instead of silently truncating history", async () => {
	const second = { ...event, seq: 5, event_id: "last-full" }
	const fetch = vi.fn<FetchCall>(async (input) => {
		const url = new URL(String(input))
		return new Response(
			JSON.stringify(
				url.pathname.endsWith("/conversations")
					? { conversations: [{ conversation_id: "stable-session", event_count: 2, last_seq: 5 }] }
					: { events: url.searchParams.get("after_seq") === "4" ? [second] : [event] },
			),
			{ status: 200 },
		)
	})
	vi.stubGlobal("fetch", fetch)
	const snapshot = await (await host()).getSessionSnapshot("stable-session")
	expect(snapshot.messages).toEqual([event, second])
	expect(snapshot).toMatchObject({ journalSeq: 5 })
})
