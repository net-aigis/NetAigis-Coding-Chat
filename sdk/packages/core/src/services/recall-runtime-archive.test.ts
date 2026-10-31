import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { RuntimeHost } from "../runtime/host/runtime-host";
import type { CoreSessionEvent } from "../types/events";
import { RuntimeRecallArchive } from "./recall-runtime-archive";

const config = {
	baseUrl: "http://recall-fixture.invalid",
	project: "fixture-project",
	actor: "Friseer",
	token: "fixture-token",
	enabled: true,
};
const event = {
	type: "session_snapshot",
	payload: {
		sessionId: "existing",
		snapshot: { version: 1, sessionId: "existing", status: "running" },
	},
} as CoreSessionEvent;

it("awaits pending transcript capture on shutdown without waiting for a stalled network", async () => {
	const directory = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "recall-shutdown-"),
	);
	let release!: (messages: []) => void;
	const transcript = new Promise<[]>((resolve) => {
		release = resolve;
	});
	let finishNetwork!: (response: Response) => void;
	const network = new Promise<Response>((resolve) => {
		finishNetwork = resolve;
	});
	const transport = vi.fn(async () => network);
	const archive = new RuntimeRecallArchive(
		{ readLiveSessionMessages: () => transcript } as unknown as RuntimeHost,
		{ directory, getConfiguration: async () => config, fetch: transport },
	);
	try {
		await archive.start();
		archive.observe(event);
		expect(archive.status().pendingCaptures).toBe(1);
		let stopped = false;
		const stopping = archive.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		release([]);
		await stopping;
		const files = (await readdir(directory)).filter((name) =>
			name.endsWith(".json"),
		);
		expect(files).toHaveLength(1);
		expect(
			JSON.parse(await readFile(join(directory, files[0]), "utf8")),
		).toMatchObject({
			conversation_id: "existing",
			payload: { sdk_event: { payload: { snapshot: { messages: [] } } } },
		});
		expect(archive.status()).toMatchObject({
			configured: false,
			pendingCaptures: 0,
		});
	} finally {
		finishNetwork(new Response("{}", { status: 503 }));
		await archive.stop();
		await rm(directory, { recursive: true, force: true });
	}
});

it("keeps a failed transcript capture visible even if network delivery also fails", async () => {
	const directory = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "recall-capture-failure-"),
	);
	const transport = vi.fn(async () => new Response("{}", { status: 503 }));
	const archive = new RuntimeRecallArchive(
		{
			readLiveSessionMessages: async () => {
				throw new Error("transcript unavailable");
			},
		} as unknown as RuntimeHost,
		{ directory, getConfiguration: async () => config, fetch: transport },
	);
	try {
		await archive.start();
		archive.observe(event);
		await archive.flush();
		await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
		const files = (await readdir(directory)).filter((name) =>
			name.endsWith(".json"),
		);
		const record = JSON.parse(
			await readFile(join(directory, files[0]), "utf8"),
		);
		expect(record.payload.sdk_event.payload.snapshot).not.toHaveProperty(
			"messages",
		);
		expect(archive.status()).toMatchObject({
			configured: true,
			pendingCaptures: 0,
			lastFailure: "capture_failed",
		});
	} finally {
		await archive.stop();
		await rm(directory, { recursive: true, force: true });
	}
});

it("archives the final persisted session after ended, preserving both authors and flushing it before shutdown without a UI client", async () => {
	const { FileSessionService } = await import(
		"../session/services/file-session-service"
	);
	const { LocalRuntimeHost } = await import(
		"../runtime/host/local-runtime-host"
	);
	const { TotalRecallSessionHost } = await import("./recall-session-reader");
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "recall-final-persisted-"),
	);
	const directory = join(root, "outbox");
	const service = new FileSessionService(join(root, "sessions"));
	const artifacts = await service.createRootSessionWithArtifacts({
		sessionId: "existing",
		source: "vscode",
		pid: process.pid,
		status: "completed",
		interactive: true,
		provider: "configured-provider",
		model: "interchangeable-model",
		cwd: root,
		workspaceRoot: root,
		enableTools: false,
		enableSpawn: false,
		enableTeams: false,
		metadata: {
			sharedSessionControl: {
				version: 1,
				revision: 3,
				writer: {
					actorId: "jimmi",
					clientId: "android",
					connectionId: "fixture",
				},
			},
		},
	});
	await service.persistSessionMessages("existing", [
		{
			role: "user",
			content: "Original",
			metadata: { author: { actorId: "Friseer" } },
		},
		{
			role: "user",
			content: "Accepted correction",
			metadata: { author: { actorId: "jimmi" } },
		},
	] as never);
	const before = await readFile(artifacts.messagesPath);
	const local = new LocalRuntimeHost({
		distinctId: "fixture-final-archive",
		sessionService: service,
	});
	const messages = await local.readLiveSessionMessages("existing");
	let release!: (value: typeof messages) => void;
	const delayed = new Promise<typeof messages>((resolve) => {
		release = resolve;
	});
	const archive = new RuntimeRecallArchive(
		{
			getSession: local.getSession.bind(local),
			readLiveSessionMessages: () => delayed,
		},
		{
			directory,
			getConfiguration: async () => config,
			actorTokens: { jimmi: "fixture-jimmi" },
			fetch: async () => new Response("{}", { status: 503 }),
		},
	);
	try {
		await archive.start();
		archive.observe({
			type: "ended",
			payload: { sessionId: "existing", reason: "disposed", ts: Date.now() },
		});
		let stopped = false;
		const stopping = archive.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		release(messages);
		await stopping;
		const files = (await readdir(directory))
			.filter((name) => name.endsWith(".json"))
			.sort();
		expect(files).toHaveLength(2);
		const records = await Promise.all(
			files.map(async (name) =>
				JSON.parse(await readFile(join(directory, name), "utf8")),
			),
		);
		expect(records[0].payload.sdk_event.type).toBe("ended");
		expect(records[1]).toMatchObject({
			actor_id: "jimmi",
			conversation_id: "existing",
			payload: {
				sdk_event: {
					type: "session_snapshot",
					payload: { snapshot: { status: "completed", messages } },
				},
			},
		});
		expect(await readFile(artifacts.messagesPath)).toEqual(before);
		const reader = new TotalRecallSessionHost(
			async () => config,
			undefined,
			async (input) =>
				new Response(
					JSON.stringify(
						String(input).includes("/conversations")
							? {
									conversations: [
										{
											conversation_id: "existing",
											event_count: 2,
											last_seq: 2,
										},
									],
								}
							: {
									events: records.map(
										({ _outbox: _private, ...record }, index) => ({
											...record,
											seq: index + 1,
											created_at: "2026-10-31T11:00:00Z",
										}),
									),
								},
					),
					{ status: 200 },
				),
		);
		await reader.initialize(config);
		expect(await reader.getSessionSnapshot("existing")).toMatchObject({
			restoration: { available: true },
			recordedSnapshot: { messages },
		});
		expect(archive.status().lastFailure).not.toBe("capture_failed");
	} finally {
		release(messages);
		await archive.stop();
		await local.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

it.each([
	"missing",
	"changed",
])("retains the raw end event and capture failure if final state is %s instead of inventing empty history", async (mode) => {
	const directory = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "recall-final-failed-"),
	);
	const getSession =
		mode === "missing"
			? vi.fn(async () => undefined)
			: vi
					.fn()
					.mockResolvedValueOnce({
						sessionId: "existing",
						status: "completed",
						metadata: { revision: 1 },
					})
					.mockResolvedValueOnce({
						sessionId: "existing",
						status: "running",
						metadata: { revision: 2 },
					});
	const archive = new RuntimeRecallArchive(
		{
			getSession,
			readLiveSessionMessages: async () => [],
		} as unknown as RuntimeHost,
		{
			directory,
			getConfiguration: async () => config,
			fetch: async () => new Response("{}", { status: 503 }),
		},
	);
	try {
		await archive.start();
		archive.observe({
			type: "ended",
			payload: { sessionId: "existing", reason: "disposed", ts: Date.now() },
		});
		await archive.stop();
		const files = (await readdir(directory)).filter((name) =>
			name.endsWith(".json"),
		);
		expect(files).toHaveLength(1);
		expect(
			JSON.parse(await readFile(join(directory, files[0]), "utf8")).payload
				.sdk_event.type,
		).toBe("ended");
		expect(archive.status()).toMatchObject({
			pendingCaptures: 0,
			lastFailure: "capture_failed",
		});
	} finally {
		await archive.stop();
		await rm(directory, { recursive: true, force: true });
	}
});
