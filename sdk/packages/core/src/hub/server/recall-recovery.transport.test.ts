/** Real authenticated sockets/native persistence; Recall HTTP and agent/model are fixtures. */
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { ClineCore } from "../../ClineCore";
import { LocalRuntimeHost } from "../../runtime/host/local-runtime-host";
import { signRuntimeRecallRecord } from "../../services/recall-archive-proof";
import { FileSessionService } from "../../session/services/file-session-service";
import { createCoreSessionSnapshot } from "../../session/session-snapshot";
import { NodeHubClient } from "../client";
import { HubRuntimeHost } from "../runtime-host/hub-runtime-host";
import { startHubWebSocketServer } from "./hub-websocket-server";

async function fixture(
	layout:
		| "same"
		| "nested"
		| "sibling-prefix"
		| "symlink-escape"
		| "cwd-outside-project" = "same",
) {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "recall-recovery-wire-"),
	);
	const id = "saved-shared-session";
	let authorizedRoot = root,
		projectRoot = root,
		projectCwd = root;
	if (layout !== "same") {
		authorizedRoot = join(root, "authorized");
		await mkdir(authorizedRoot);
		projectRoot = join(authorizedRoot, "project");
		if (layout === "sibling-prefix")
			projectRoot = join(root, "authorized-other");
		if (layout === "symlink-escape") {
			const outside = join(root, "outside");
			await mkdir(outside);
			await symlink(outside, projectRoot);
		} else await mkdir(projectRoot);
		projectCwd =
			layout === "cwd-outside-project" ? authorizedRoot : projectRoot;
	}
	const service = new FileSessionService(join(root, "sessions"));
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture-agent",
				getConversationId: () => id,
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const local = new LocalRuntimeHost({
		distinctId: "fixture-recall-recovery",
		sessionService: service,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
		createAgent,
	});
	const key = Buffer.alloc(32, 7);
	const snapshot = createCoreSessionSnapshot({
		session: {
			sessionId: id,
			source: "vscode",
			status: "idle",
			interactive: true,
			startedAt: "2026-10-30T12:00:00Z",
			updatedAt: "2026-10-31T12:00:00Z",
			provider: "fixture-saved-provider",
			model: "fixture-selected-model",
			cwd: projectCwd,
			workspaceRoot: projectRoot,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			isSubagent: false,
		},
		messages: [
			{
				role: "user",
				id: "original",
				content: "Original accepted task",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				role: "user",
				id: "correction",
				content: "Accepted correction",
				metadata: { author: { actorId: "jimmi" } },
			},
		] as never,
	});
	let event = {
		...signRuntimeRecallRecord(
			{
				event_id: "fixture-snapshot",
				project_id: "fixture-project",
				conversation_id: id,
				actor_id: "Friseer",
				kind: "cline.sdk.event",
				payload: {
					sdk_event: {
						type: "session_snapshot",
						payload: { sessionId: id, snapshot },
					},
				},
			},
			key,
		),
		seq: 11,
		created_at: "2026-10-31T12:00:01Z",
	};
	const readActors: string[] = [];
	const server = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: authorizedRoot,
		owner: {
			ownerId: "fixture-recall-recovery",
			discoveryPath: join(root, "hub.json"),
		},
		actorTokens: {
			Friseer: "fixture-login-friseer",
			jimmi: "fixture-login-jimmi",
		},
		sessionHost: local,
		runtimeHandlers: {
			startSession: vi.fn(),
			sendSession: vi.fn(),
			stopSession: vi.fn(),
			abortSession: vi.fn(),
		},
		scheduleOptions: { dbPath: ":memory:" },
		taskOptions: {
			dbPath: join(root, "tasks.db"),
			globalSpecsDir: join(root, "specs"),
			watchFiles: false,
		},
		eventLog: false,
		runQueue: false,
		recall: {
			archiveSigningKey: key,
			directory: join(root, "outbox"),
			actorTokens: { jimmi: "fixture-recall-jimmi" },
			getConfiguration: async () => ({
				enabled: true,
				baseUrl: "http://recall-fixture.invalid:11436",
				project: "fixture-project",
				actor: "Friseer",
				token: "fixture-recall-friseer",
			}),
			fetch: async (input, init) => {
				if (init?.method === "POST") return new Response("{}", { status: 503 });
				const auth = new Headers(init?.headers).get("Authorization");
				if (auth === "Bearer fixture-recall-jimmi") readActors.push("jimmi");
				else if (auth === "Bearer fixture-recall-friseer")
					readActors.push("Friseer");
				else return new Response("{}", { status: 403 });
				const url = new URL(String(input));
				if (url.pathname.endsWith("/projects"))
					return Response.json({
						projects: [
							{
								project_id: "fixture-project",
								event_count: 1,
								conversation_count: 1,
								last_seq: 11,
							},
						],
					});
				return Response.json(
					url.pathname.endsWith("/conversations")
						? {
								conversations: [
									{ conversation_id: id, event_count: 1, last_seq: 11 },
								],
							}
						: {
								events:
									Number(url.searchParams.get("after_seq") ?? 0) < 11
										? [event]
										: [],
							},
				);
			},
		},
	});
	const browser = new NodeHubClient({
		url: server.url,
		authToken: "fixture-login-jimmi",
		clientId: "fixture-browser-recovery",
		workspaceRoot: root,
	});
	const vscode = new HubRuntimeHost({
		url: server.url,
		authToken: "fixture-login-friseer",
		clientType: "vscode",
	});
	return {
		url: server.url,
		root,
		id,
		service,
		local,
		createAgent,
		snapshot,
		key,
		browser,
		vscode,
		readActors,
		setEvent: (next: typeof event) => {
			event = next;
		},
		getEvent: () => event,
		close: async () => {
			await browser.close();
			await vscode.dispose();
			await server.close();
			await rm(root, { recursive: true, force: true });
		},
	};
}

it("discovers the same projects for both personal clients and rejects unknown project scope without starting work", async () => {
	const f = await fixture();
	try {
		const browser = await f.browser.command("session.recall.projects", {});
		expect(browser.ok).toBe(true);
		const projects = await f.vscode.listRecallProjects();
		expect(projects).toEqual(browser.payload?.projects);
		expect(projects[0].projectId).toBe("fixture-project");
		expect(f.readActors).toContain("Friseer");
		expect(f.readActors).toContain("jimmi");
		await expect(
			f.browser.command("session.recall.list", {
				projectId: "UnknownProject",
			}),
		).rejects.toThrow();
		await expect(
			f.browser.command("session.recall.list", {
				projectId: {},
			}),
		).rejects.toThrow();
		expect(f.createAgent).not.toHaveBeenCalled();
	} finally {
		await f.close();
	}
});

it("recovers one verified canonical session through authenticated writer admission, then attaches a second actor to the same resident runtime", async () => {
	const f = await fixture();
	try {
		const listed = await f.browser.command("session.recall.list", {});
		expect(listed.ok).toBe(true);
		expect(listed.payload?.conversations).toMatchObject([
			{ conversationId: f.id },
		]);
		const inspected = await f.browser.command(
			"session.recall.inspect",
			{ conversationId: f.id },
			f.id,
		);
		expect(inspected.payload?.snapshot).toMatchObject({
			sourceVerified: true,
			journalSeq: 11,
			restoration: { available: true },
		});
		await expect(
			f.browser.command(
				"session.recall.restore",
				{ conversationId: f.id, expectedJournalSeq: 10 },
				f.id,
			),
		).rejects.toMatchObject({ code: "recall_revision_conflict" });
		await expect(
			f.browser.command(
				"session.recall.restore",
				{
					conversationId: f.id,
					expectedJournalSeq: 11,
					snapshot: { messages: [] },
				},
				f.id,
			),
		).rejects.toMatchObject({ code: "invalid_recall_request" });
		expect(await f.local.getSession(f.id)).toBeUndefined();
		const restored = await f.browser.command(
			"session.recall.restore",
			{ conversationId: f.id, expectedJournalSeq: 11 },
			f.id,
		);
		expect(restored).toMatchObject({
			ok: true,
			payload: {
				sessionId: f.id,
				imported: true,
				runtimeResident: false,
				writerGranted: false,
			},
		});
		expect(f.createAgent).not.toHaveBeenCalled();
		expect(f.readActors.every((actor) => actor === "jimmi")).toBe(true);
		const path = join(f.root, "sessions", f.id, `${f.id}.messages.json`),
			canonical = await readFile(path);
		expect(JSON.parse(canonical.toString()).messages).toEqual(
			f.snapshot.messages,
		);
		await expect(
			f.browser.command(
				"session.update",
				{ sessionId: f.id, title: "must not write" },
				f.id,
			),
		).rejects.toMatchObject({ code: "session_not_writer" });
		const start = await f.vscode.startSession({
			config: {
				sessionId: f.id,
				cwd: f.root,
				workspaceRoot: f.root,
				providerId: "client-stale",
				modelId: "client-stale",
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			interactive: true,
		});
		expect(start.sessionId).toBe(f.id);
		expect(f.createAgent).toHaveBeenCalledOnce();
		expect(f.createAgent.mock.calls[0][0].initialMessages).toEqual(
			f.snapshot.messages,
		);
		expect(f.createAgent.mock.calls[0][0].modelId).toBe(
			f.snapshot.model.modelId,
		);
		expect(await f.vscode.readLiveSessionMessages(f.id)).toEqual(
			f.snapshot.messages,
		);
		const attached = await f.browser.command(
			"session.attach",
			{ sessionId: f.id },
			f.id,
		);
		expect(attached.ok).toBe(true);
		expect(f.createAgent).toHaveBeenCalledOnce();
		const control = await f.browser.command("session.control.get", {}, f.id);
		const revision = (control.payload?.control as { revision: number })
			.revision;
		const takeover = await f.browser.command(
			"session.control.claim",
			{ expectedRevision: revision },
			f.id,
		);
		expect(takeover.payload?.control).toMatchObject({
			revision: revision + 1,
			writer: { actorId: "jimmi" },
		});
		expect(await f.vscode.readLiveSessionMessages(f.id)).toEqual(
			f.snapshot.messages,
		);
		await expect(
			f.browser.command(
				"session.recall.restore",
				{ conversationId: f.id, expectedJournalSeq: 11 },
				f.id,
			),
		).rejects.toMatchObject({ code: "recall_operation_failed" });
		expect(f.createAgent).toHaveBeenCalledOnce();
		expect(await readFile(path)).toEqual(canonical);
	} finally {
		await f.close();
	}
});

it("exposes the owning runtime's Recall through the actual Core facade without a replacement conversation", async () => {
	const f = await fixture();
	let core: ClineCore | undefined;
	try {
		core = await ClineCore.create({
			backendMode: "remote",
			remote: {
				endpoint: f.url,
				authToken: "fixture-login-jimmi",
				clientType: "fixture-browser-facade",
			},
		});
		expect((await core.recall.list())[0].conversationId).toBe(f.id);
		const saved = await core.recall.read(f.id);
		expect(saved.sourceVerified).toBe(true);
		expect(await core.recall.restore(f.id, saved.journalSeq)).toBe(f.id);
		expect(await core.readMessages(f.id)).toEqual(f.snapshot.messages);
		expect(f.createAgent).not.toHaveBeenCalled();
		expect(f.readActors.every((actor) => actor === "jimmi")).toBe(true);
	} finally {
		await core?.dispose();
		await f.close();
	}
});

it("restores a signed project below the authorized runtime root without starting work", async () => {
	const f = await fixture("nested");
	try {
		const reply = await f.browser.command(
			"session.recall.restore",
			{ conversationId: f.id, expectedJournalSeq: 11 },
			f.id,
		);
		expect(reply.payload).toMatchObject({
			imported: true,
			writerGranted: false,
			runtimeResident: false,
		});
		expect(await f.local.readSessionMessages(f.id)).toEqual(
			f.snapshot.messages,
		);
		expect((await f.local.getSession(f.id))?.workspaceRoot).toBe(
			f.snapshot.workspace.root,
		);
		expect(f.createAgent).not.toHaveBeenCalled();
	} finally {
		await f.close();
	}
});

it.each([
	"sibling-prefix",
	"symlink-escape",
	"cwd-outside-project",
] as const)("refuses %s project recovery without creating native history", async (layout) => {
	const f = await fixture(layout);
	try {
		await expect(
			f.browser.command(
				"session.recall.restore",
				{ conversationId: f.id, expectedJournalSeq: 11 },
				f.id,
			),
		).rejects.toMatchObject({ code: "recall_workspace_mismatch" });
		expect(await f.local.getSession(f.id)).toBeUndefined();
		expect(f.createAgent).not.toHaveBeenCalled();
	} finally {
		await f.close();
	}
});

it.each([
	"unsigned",
	"changed-author",
	"wrong-workspace",
] as const)("refuses %s recovery without creating or replacing native history", async (mode) => {
	const f = await fixture();
	try {
		const event = structuredClone(f.getEvent());
		if (mode === "unsigned") delete event.payload.runtime_archive_proof;
		if (mode === "changed-author")
			(
				event.payload.sdk_event as never as {
					payload: { snapshot: typeof f.snapshot };
				}
			).payload.snapshot.messages![0].metadata = {
				author: { actorId: "jimmi" },
			} as never;
		if (mode === "wrong-workspace") {
			const value = (
				event.payload.sdk_event as never as {
					payload: { snapshot: typeof f.snapshot };
				}
			).payload.snapshot;
			value.workspace.root = join(f.root, "sessions");
			const resigned = signRuntimeRecallRecord(event, f.key);
			event.payload = resigned.payload;
		}
		f.setEvent(event);
		await expect(
			f.browser.command(
				"session.recall.restore",
				{ conversationId: f.id, expectedJournalSeq: 11 },
				f.id,
			),
		).rejects.toMatchObject({
			code:
				mode === "wrong-workspace"
					? "recall_workspace_mismatch"
					: "recall_not_recoverable",
		});
		expect(await f.service.listSessions(10)).toEqual([]);
		expect(f.createAgent).not.toHaveBeenCalled();
	} finally {
		await f.close();
	}
});
