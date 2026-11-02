/** Existing HTTP contract only: simulated server pages, no production requests. */
import { expect, it, vi } from "vitest";
import { createCoreSessionSnapshot } from "../session/session-snapshot";
import { TotalRecallSessionHost } from "./recall-session-reader";

it("discovers only stored exact project IDs through personal authentication without a global scope", async () => {
	const fetch = vi.fn(
		async () =>
			new Response(
				JSON.stringify({
					projects: [
						{
							project_id: "NetAigisOS",
							event_count: 2,
							conversation_count: 1,
							last_seq: 2,
						},
						{
							project_id: "OtherProject",
							event_count: 3,
							conversation_count: 2,
							last_seq: 9,
						},
					],
				}),
			),
	);
	const host = new TotalRecallSessionHost(async () => config, undefined, fetch);
	await host.initialize(config);
	expect(await host.listProjects()).toEqual([
		{
			projectId: "NetAigisOS",
			eventCount: 2,
			conversationCount: 1,
			lastSeq: 2,
		},
		{
			projectId: "OtherProject",
			eventCount: 3,
			conversationCount: 2,
			lastSeq: 9,
		},
	]);
	const [url, options] = fetch.mock.calls[0] as unknown as [
		string,
		RequestInit,
	];
	expect(new URL(url).pathname).toBe("/internal/recall/projects");
	expect(new URL(url).search).toBe("");
	expect(options.headers).toEqual({ Authorization: "Bearer fixture-token" });
});

it("reads a selected project's canonical conversation without changing the configured project or authors", async () => {
	const calls: URL[] = [];
	const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
		const url = new URL(String(input));
		calls.push(url);
		const value = url.pathname.endsWith("/projects")
			? {
					projects: [
						{
							project_id: "OtherProject",
							event_count: 1,
							conversation_count: 1,
							last_seq: 7,
						},
					],
				}
			: url.pathname.endsWith("/conversations")
				? {
						conversations: [
							{ conversation_id: "session", event_count: 1, last_seq: 7 },
						],
					}
				: { events: [{ ...event(7), project_id: "OtherProject" }] };
		return new Response(JSON.stringify(value));
	});
	const host = new TotalRecallSessionHost(
		async () => config,
		undefined,
		fetch,
		{ requireVerifiedSource: false },
	);
	await host.initialize(config);
	const saved = await host.getSessionSnapshot(
		"session",
		undefined,
		"OtherProject",
	);
	expect(saved.projectId).toBe("OtherProject");
	expect(saved.messages[0].actor_id).toBe("Friseer");
	expect(saved.recordedSnapshot?.messages).toEqual(snapshot().messages);
	expect(
		calls
			.filter((url) => !url.pathname.endsWith("/projects"))
			.every((url) => url.searchParams.get("project_id") === "OtherProject"),
	).toBe(true);
	expect(config.project).toBe("project");
});

it("does not substitute another project after missing discovery or an unknown ID", async () => {
	for (const status of [200, 404]) {
		const fetch = vi.fn(
			async () => new Response(JSON.stringify({ projects: [] }), { status }),
		);
		const host = new TotalRecallSessionHost(
			async () => config,
			undefined,
			fetch,
		);
		await host.initialize(config);
		await expect(host.listConversations("UnknownProject")).rejects.toThrow();
		expect(fetch).toHaveBeenCalledTimes(1);
	}
});

it("keeps an empty discovered store empty without inventing default, local or global IDs", async () => {
	const host = new TotalRecallSessionHost(
		async () => config,
		undefined,
		async () => new Response(JSON.stringify({ projects: [] })),
	);
	await host.initialize(config);
	expect(await host.listProjects()).toEqual([]);
});

it.each([
	[
		{
			project_id: "NetAigisOS",
			event_count: 1,
			conversation_count: 1,
			last_seq: 1,
		},
		{
			project_id: "NetAigisOS",
			event_count: 1,
			conversation_count: 1,
			last_seq: 1,
		},
	],
	[{ project_id: "", event_count: 1, conversation_count: 1, last_seq: 1 }],
	[
		{
			project_id: "OtherProject",
			event_count: 1,
			conversation_count: 2,
			last_seq: 1,
		},
	],
	[
		{
			project_id: "OtherProject",
			event_count: "1",
			conversation_count: 1,
			last_seq: 1,
		},
	],
])("rejects ambiguous or malformed project catalog %#", async (...projects) => {
	const host = new TotalRecallSessionHost(
		async () => config,
		undefined,
		async () => new Response(JSON.stringify({ projects })),
	);
	await host.initialize(config);
	await expect(host.listProjects()).rejects.toThrow(
		"Invalid TOTAL RECALL project record",
	);
});

const config = {
	enabled: true,
	baseUrl: "http://recall-fixture.invalid:11436",
	token: "fixture-token",
	actor: "jimmi",
	project: "project",
};
function snapshot() {
	return createCoreSessionSnapshot({
		session: {
			sessionId: "session",
			source: "vscode",
			status: "idle",
			interactive: true,
			startedAt: "2026-10-31T10:00:00Z",
			updatedAt: "2026-10-31T11:00:00Z",
			provider: "configured-provider",
			model: "interchangeable-model",
			cwd: "/fixture/workspace",
			workspaceRoot: "/fixture/workspace",
			enableTools: true,
			enableSpawn: false,
			enableTeams: false,
			isSubagent: false,
		},
		messages: [
			{
				role: "user",
				content: "Original accepted order",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				role: "user",
				content: "Accepted correction",
				metadata: { author: { actorId: "jimmi" } },
			},
		] as never,
	});
}
function event(seq: number, value: unknown = snapshot()) {
	return {
		seq,
		event_id: `event-${seq}`,
		project_id: config.project,
		conversation_id: "session",
		actor_id: "Friseer",
		kind: "cline.sdk.event",
		created_at: "2026-10-31T11:00:00Z",
		payload: {
			sdk_event: {
				type: "session_snapshot",
				payload: { sessionId: "session", snapshot: value },
			},
		},
	};
}
async function reader(
	pages: unknown[][],
	count = pages.flat().length,
	last = count,
) {
	const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
		const url = new URL(String(input));
		return new Response(
			JSON.stringify(
				url.pathname.endsWith("/conversations")
					? {
							conversations: [
								{
									conversation_id: "session",
									event_count: count,
									last_seq: last,
								},
							],
						}
					: { events: pages.shift() ?? [] },
			),
			{ status: 200 },
		);
	});
	const host = new TotalRecallSessionHost(
		async () => config,
		undefined,
		fetch,
		{ requireVerifiedSource: false },
	);
	await host.initialize(config);
	return { host, fetch };
}
it("reads all verified pages to a captured watermark, preserves authors and ignores later concurrent inserts", async () => {
	const pages = [[event(2)], [event(5)], [event(7), event(9)]];
	const { host, fetch } = await reader(pages, 3, 7);
	const value = await host.getSessionSnapshot("session");
	expect(value.messages.map((item) => item.seq)).toEqual([2, 5, 7]);
	expect(value.recordedSnapshot?.messages).toEqual(snapshot().messages);
	expect(value).toMatchObject({
		journalSeq: 7,
		recordedSnapshotSeq: 7,
		restoration: { available: true },
	});
	expect(
		fetch.mock.calls
			.slice(1)
			.map(([url]) => new URL(String(url)).searchParams.get("after_seq")),
	).toEqual(["0", "2", "5"]);
	expect(value.currentActorId).toBeUndefined();
});
it.each([
	{
		value: { version: 1, sessionId: "session", status: "running" },
		reason: "incomplete_tail",
	},
	{ value: { ...snapshot(), status: "running" }, reason: "active_session" },
	{
		value: {
			...snapshot(),
			messages: [
				...snapshot().messages!,
				{
					role: "assistant",
					content: [
						{ type: "tool_use", id: "legacy-command", name: "execute_command" },
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "legacy-command",
							content: "Completed",
						},
					],
				},
			],
		},
		reason: "unconfirmed_process",
	},
	{ value: { ...snapshot(), lineage: undefined }, reason: "invalid_snapshot" },
	{
		value: { ...snapshot(), createdAt: "invalid-time" },
		reason: "invalid_snapshot",
	},
	{
		value: { ...snapshot(), workspace: undefined },
		reason: "invalid_snapshot",
	},
	{
		value: {
			...snapshot(),
			metadata: {
				runtimeCommandObservations: {
					version: 1,
					entries: [
						{
							source: "child_process",
							sessionId: "session",
							runtimeInstanceId: "runtime",
							executionId: "exec",
							sequence: 1,
							execution: { state: "running", pid: 42, observedAtMs: 10 },
						},
					],
				},
			},
		},
		reason: "unconfirmed_process",
	},
])("does not advertise an unsafe archive candidate ($reason)", async ({
	value,
	reason,
}) => {
	const { host } = await reader([[event(1), event(2, value)]], 2, 2);
	expect(await host.getSessionSnapshot("session")).toMatchObject({
		restoration: { available: false, reason },
	});
});
it.each([
	{ pages: [[event(1)], [event(1)]], count: 2, last: 2 },
	{ pages: [[event(1)], []], count: 2, last: 2 },
	{ pages: [[event(1), event(2)]], count: 3, last: 2 },
	{
		pages: [[event(1), { ...event(2), event_id: "event-1" }]],
		count: 2,
		last: 2,
	},
	{ pages: [[{ ...event(1), project_id: "foreign" }]], count: 1, last: 1 },
])("fails on stalled, missing, duplicated or mis-scoped pages", async ({
	pages,
	count,
	last,
}) => {
	const { host, fetch } = await reader(pages, count, last);
	await expect(host.getSessionSnapshot("session")).rejects.toThrow();
	expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
});
it("does not invent a successful empty result for a missing conversation", async () => {
	const { host } = await reader([], 1, 1);
	await expect(host.getSessionSnapshot("other-session")).rejects.toThrow(
		"not found",
	);
});

it.each([
	undefined,
	{ requireVerifiedSource: true },
])("does not trust an unsigned actor-supplied snapshot when restore requires a verified producer (%j)", async (options) => {
	const fetch = vi.fn(
		async (input: Parameters<typeof globalThis.fetch>[0]) =>
			new Response(
				JSON.stringify(
					String(input).includes("/conversations")
						? {
								conversations: [
									{ conversation_id: "session", event_count: 1, last_seq: 1 },
								],
							}
						: { events: [{ ...event(1), actor_id: "jimmi" }] },
				),
				{ status: 200 },
			),
	);
	const host = new TotalRecallSessionHost(
		async () => config,
		undefined,
		fetch,
		options,
	);
	await host.initialize(config);
	expect(await host.getSessionSnapshot("session")).toMatchObject({
		sourceVerified: false,
		restoration: { available: false, reason: "unverified_source" },
	});
});
