/** Runtime fixture, real Hub lifecycle and durable filesystem outbox; no productive model requests. */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { CoreSessionEvent } from "../../types/events";
import type { HubWebSocketServerOptions } from "./hub-server-options";
import { HubServerTransport } from "./hub-server-transport";

it("stages canonical shared-runtime history when no VS Code or browser client is connected", async () => {
	const root = await mkdtemp(
			join(process.env.CLINE_DATA_DIR || tmpdir(), "recall-runtime-"),
		),
		directory = join(root, "outbox");
	const listeners = new Set<(event: CoreSessionEvent) => void>();
	const messages = [
		{
			role: "user",
			content: "Original order",
			metadata: { author: { actorId: "Friseer", source: "hub-authenticated" } },
		},
		{
			role: "user",
			content: "Correction",
			metadata: { author: { actorId: "jimmi", source: "hub-authenticated" } },
		},
	];
	const runtime = {
		subscribe: (listener: (event: CoreSessionEvent) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		listSessions: async () => [],
		readLiveSessionMessages: async () => structuredClone(messages),
		getSession: async () => undefined,
		dispose: async () => {},
	};
	const configuration = {
		baseUrl: "http://recall-fixture.invalid:11436",
		project: "independent-project",
		actor: "jimmi",
		token: "fixture-jimmi",
		enabled: true,
	};
	const transport = new HubServerTransport({
		sessionHost: runtime,
		workspaceRoot: root,
		runtimeHandlers: {},
		scheduleOptions: { dbPath: ":memory:" },
		taskOptions: {
			dbPath: join(root, "tasks.db"),
			globalSpecsDir: join(root, "specs"),
			watchFiles: false,
		},
		eventLog: false,
		runQueue: false,
		recall: {
			directory,
			getConfiguration: async () => configuration,
			fetch: async () => new Response("{}", { status: 503 }),
		},
	} as unknown as HubWebSocketServerOptions);
	try {
		await transport.start();
		const snapshot = {
			type: "session_snapshot",
			payload: {
				sessionId: "same-existing-session",
				snapshot: {
					version: 1,
					sessionId: "same-existing-session",
					status: "completed",
					source: "vscode",
					createdAt: "2026-10-31T12:00:00Z",
					updatedAt: "2026-10-31T12:00:01Z",
					interactive: true,
					workspace: { cwd: root, root },
					model: { providerId: "fixture-local", modelId: "fixture-model" },
					capabilities: {
						enableTools: true,
						enableSpawn: false,
						enableTeams: false,
					},
					lineage: { isSubagent: false },
					metadata: {
						sharedSessionControl: {
							version: 1,
							revision: 4,
							writer: {
								actorId: "jimmi",
								clientId: "android",
								connectionId: "connection",
							},
						},
					},
				},
			},
		} satisfies CoreSessionEvent;
		for (const listener of listeners) listener(snapshot);
		await vi.waitFor(
			async () =>
				expect(
					(await readdir(directory)).filter((name) => name.endsWith(".json")),
				).toHaveLength(1),
			{ timeout: 1000 },
		);
		const file = (await readdir(directory)).find((name) =>
			name.endsWith(".json"),
		)!;
		const event = JSON.parse(await readFile(join(directory, file), "utf8"));
		expect(event).toMatchObject({
			actor_id: "jimmi",
			conversation_id: "same-existing-session",
			payload: { sdk_event: { payload: { snapshot: { messages } } } },
		});
		expect(snapshot.payload.snapshot).not.toHaveProperty("messages");
	} finally {
		await transport.stop();
		await rm(root, { recursive: true, force: true });
	}
});
