import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DurableRecallOutbox, type RecallConfiguration } from "./recall-outbox";

it("isolates delivery backoff between projects while retaining order inside the failed project", async () => {
	const root = await directory();
	const calls: string[] = [];
	const send = vi.fn<typeof fetch>(async (_url, init) => {
		const event = JSON.parse(String(init?.body));
		calls.push(event.project_id);
		return event.project_id === "ProjectA"
			? new Response("{}", { status: 503 })
			: Response.json({ event_id: event.event_id, inserted: true });
	});
	const queue = new DurableRecallOutbox(root, send, async (actor, project) => ({
		...config,
		actor,
		project,
	}));
	for (const project of ["ProjectA", "ProjectA", "ProjectB"])
		await queue.archiveSdkEvent(
			{ sessionId: project },
			{ ...config, project },
			{ deferDelivery: true },
		);
	const { project: _unused, ...connection } = config;
	expect(await queue.drainRecallOutbox(connection)).toMatchObject({
		sent: 1,
		pending: 2,
		blocked: "delivery_failed",
	});
	expect(calls).toEqual(["ProjectA", "ProjectB"]);
	await queue.archiveSdkEvent(
		{ sessionId: "ProjectB" },
		{ ...config, project: "ProjectB" },
		{ deferDelivery: true },
	);
	expect(
		await queue.drainRecallOutbox(connection, { respectBackoff: true }),
	).toMatchObject({ sent: 1, pending: 2 });
	expect(calls).toEqual(["ProjectA", "ProjectB", "ProjectB"]);
});

it("replays interleaved durable project scopes after restart without retagging authors or session IDs", async () => {
	const root = await directory();
	const first = { ...config, project: "NetAigisOS" };
	const second = { ...jimmi, project: "OtherProject" };
	const offline = new DurableRecallOutbox(root);
	await offline.archiveSdkEvent({ sessionId: "first" }, first, {
		deferDelivery: true,
	});
	await offline.archiveSdkEvent({ sessionId: "second" }, second, {
		deferDelivery: true,
	});
	const { project: _unused, ...connection } = config;
	const send = transport();
	const resolve = vi.fn(async (actor: string, project: string, id: string) =>
		actor === "Friseer" && project === "NetAigisOS" && id === "first"
			? first
			: actor === "jimmi" && project === "OtherProject" && id === "second"
				? second
				: undefined,
	);
	const restarted = new DurableRecallOutbox(root, send, resolve);
	expect(await restarted.drainRecallOutbox(connection)).toMatchObject({
		sent: 2,
		pending: 0,
	});
	expect(resolve).toHaveBeenNthCalledWith(1, "Friseer", "NetAigisOS", "first");
	expect(resolve).toHaveBeenNthCalledWith(2, "jimmi", "OtherProject", "second");
	expect(
		send.mock.calls.map((call) => {
			const event = JSON.parse(String(call[1]?.body));
			return [event.project_id, event.conversation_id, event.actor_id];
		}),
	).toEqual([
		["NetAigisOS", "first", "Friseer"],
		["OtherProject", "second", "jimmi"],
	]);
});

it("retains queued scope when credentials resolve another project and cannot stage a connection without any project", async () => {
	const root = await directory();
	const send = transport();
	const queue = new DurableRecallOutbox(root, send, async () => ({
		...config,
		project: "WrongProject",
	}));
	await queue.archiveSdkEvent({ sessionId: "first" }, config, {
		deferDelivery: true,
	});
	const { project: _unused, ...connection } = config;
	expect(await queue.drainRecallOutbox(connection)).toMatchObject({
		sent: 0,
		pending: 1,
		blocked: "delivery_failed",
	});
	expect(send).not.toHaveBeenCalled();
	await expect(
		queue.archiveSdkEvent({ sessionId: "unbound" }, { ...config, project: "" }),
	).rejects.toThrow("canonical Recall project");
	expect(
		(await readdir(root)).filter((file) => file.endsWith(".json")),
	).toHaveLength(1);
});

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
const config: RecallConfiguration = {
	baseUrl: "http://recall-fixture.invalid:11436",
	actor: "Friseer",
	project: "existing-project",
	token: "fixture-Friseer",
	enabled: true,
};
async function directory() {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "runtime-recall-outbox-"),
	);
	roots.push(root);
	return root;
}
const jimmi = { ...config, actor: "jimmi", token: "fixture-jimmi" };
function transport() {
	return vi.fn<typeof fetch>(async (_url, request) => {
		const event = JSON.parse(String(request?.body));
		expect(new Headers(request?.headers).get("Authorization")).toBe(
			"Bearer fixture-" + event.actor_id,
		);
		return new Response(
			JSON.stringify({ event_id: event.event_id, inserted: true }),
			{ status: 200 },
		);
	});
}
it("delivers interleaved writers in original queue order with the matching actor key", async () => {
	const root = await directory(),
		send = transport();
	const queue = new DurableRecallOutbox(root, send, async (actor) =>
		actor === "jimmi" ? jimmi : undefined,
	);
	for (const [index, configuration] of [config, jimmi, config].entries())
		await queue.archiveSdkEvent(
			{ sessionId: "same-session", index },
			configuration,
			{ deferDelivery: true },
		);
	expect(send).not.toHaveBeenCalled();
	expect(await queue.drainRecallOutbox(config)).toMatchObject({
		sent: 3,
		pending: 0,
	});
	expect(
		send.mock.calls.map(
			(call) => JSON.parse(String(call[1]?.body)).payload.sdk_event.index,
		),
	).toEqual([0, 1, 2]);
	expect(
		send.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).actor_id),
	).toEqual(["Friseer", "jimmi", "Friseer"]);
});
it("retains a missing actor key and later events, then resumes the same event IDs after restart", async () => {
	const root = await directory(),
		send = transport(),
		queue = new DurableRecallOutbox(root, send, async () => undefined);
	for (const [index, configuration] of [config, jimmi, config].entries())
		await queue.archiveSdkEvent(
			{ sessionId: "same-session", index },
			configuration,
			{ deferDelivery: true },
		);
	expect(await queue.drainRecallOutbox(config)).toMatchObject({
		sent: 1,
		pending: 2,
		blocked: "delivery_failed",
	});
	const files = (await readdir(root)).filter((f) => f.endsWith(".json")).sort(),
		pending = await Promise.all(
			files.map(async (f) => JSON.parse(await readFile(join(root, f), "utf8"))),
		);
	expect(pending.map((record) => record.actor_id)).toEqual([
		"jimmi",
		"Friseer",
	]);
	for (const record of pending)
		expect(JSON.stringify(record)).not.toContain("fixture-");
	const restarted = new DurableRecallOutbox(root, send, async (actor) =>
		actor === "jimmi" ? jimmi : undefined,
	);
	expect(await restarted.drainRecallOutbox(config)).toMatchObject({
		sent: 2,
		pending: 0,
	});
	expect(
		send.mock.calls
			.slice(1)
			.map((call) => JSON.parse(String(call[1]?.body)).event_id),
	).toEqual(pending.map((record) => record.event_id));
});
it("keeps staging while automatic delivery respects the existing failure backoff", async () => {
	const root = await directory(),
		send = vi.fn<typeof fetch>(async () => new Response("{}", { status: 503 })),
		queue = new DurableRecallOutbox(root, send);
	await queue.archiveSdkEvent({ sessionId: "same-session", index: 0 }, config);
	for (let index = 1; index <= 5; index++) {
		await queue.archiveSdkEvent({ sessionId: "same-session", index }, config, {
			deferDelivery: true,
		});
		await queue.drainRecallOutbox(config, { respectBackoff: true });
	}
	expect(send).toHaveBeenCalledOnce();
	expect((await readdir(root)).filter((f) => f.endsWith(".json"))).toHaveLength(
		6,
	);
});
