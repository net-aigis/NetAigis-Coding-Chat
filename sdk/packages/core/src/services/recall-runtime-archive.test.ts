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
