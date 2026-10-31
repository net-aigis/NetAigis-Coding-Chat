/** Actual file persistence, LocalRuntimeHost and authenticated sockets; model/agent are fixtures. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { LocalRuntimeHost } from "../../runtime/host/local-runtime-host";
import { FileSessionService } from "../../session/services/file-session-service";
import { NodeHubClient } from "../client";
import { HubRuntimeHost } from "../runtime-host/hub-runtime-host";
import { startHubWebSocketServer } from "./hub-websocket-server";

it("resumes real saved history through writer admission and shares one resident runtime with a second actor", async () => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "shared-resume-wire-"),
	);
	const service = new FileSessionService(join(root, "sessions"));
	const canonical = [
		{
			role: "user" as const,
			content: "Original accepted task",
			metadata: { author: { actorId: "Friseer" } },
		},
		{
			role: "user" as const,
			content: "Correction accepted",
			metadata: { author: { actorId: "jimmi" } },
		},
	];
	const artifacts = await service.createRootSessionWithArtifacts({
		sessionId: "already-saved",
		source: "vscode",
		pid: process.pid,
		interactive: true,
		provider: "saved-local-provider",
		model: "saved-local-model",
		cwd: root,
		workspaceRoot: root,
		enableTools: false,
		enableSpawn: false,
		enableTeams: false,
		status: "idle",
		metadata: { title: "Original task" },
	});
	await service.persistSessionMessages("already-saved", canonical);
	const original = await readFile(artifacts.messagesPath);
	const storedCanonical = JSON.parse(original.toString("utf8")).messages;
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture-agent",
				getConversationId: () => "already-saved",
				getMessages: () => structuredClone(config.initialMessages || []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const local = new LocalRuntimeHost({
		distinctId: "fixture-resume-wire",
		sessionService: service,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
		createAgent,
	});
	const server = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		owner: {
			ownerId: "fixture-canonical-resume",
			discoveryPath: join(root, "hub.json"),
		},
		actorTokens: { Friseer: "fixture-friseer", jimmi: "fixture-jimmi" },
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
	});
	const vscode = new HubRuntimeHost({
		url: server.url,
		authToken: "fixture-friseer",
		clientType: "vscode",
	});
	const android = new NodeHubClient({
		url: server.url,
		authToken: "fixture-jimmi",
		clientId: "fixture-browser",
		workspaceRoot: root,
	});
	try {
		const result = await vscode.startSession({
			config: {
				sessionId: "already-saved",
				providerId: "client-stale",
				modelId: "client-stale",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			initialMessages: [{ role: "user", content: "older client copy" }],
			interactive: true,
		});
		expect(result.sessionId).toBe("already-saved");
		expect(createAgent).toHaveBeenCalledOnce();
		expect(createAgent.mock.calls[0][0].initialMessages).toEqual(
			storedCanonical,
		);
		expect(await vscode.readLiveSessionMessages(result.sessionId)).toEqual(
			storedCanonical,
		);
		await android.command(
			"session.attach",
			{ sessionId: result.sessionId },
			result.sessionId,
		);
		const messages = await android.command(
			"session.messages",
			{ live: true },
			result.sessionId,
		);
		expect(messages.payload?.messages).toEqual(storedCanonical);
		const control = await vscode.getSessionControl(result.sessionId);
		await android.command(
			"session.control.claim",
			{ expectedRevision: control.revision },
			result.sessionId,
		);
		expect(createAgent).toHaveBeenCalledOnce();
		expect(await readFile(artifacts.messagesPath)).toEqual(original);
		expect((await local.listSessions()).map((row) => row.sessionId)).toEqual([
			"already-saved",
		]);
	} finally {
		await vscode.dispose();
		await android.dispose();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
