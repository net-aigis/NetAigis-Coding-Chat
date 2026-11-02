/** Actual native file/SQLite state; fixture agent, no provider/model request. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig, AgentResult } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import { CoreSessionService } from "../../session/services/session-service";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	["files", false],
	["files", true],
	["sqlite", false],
	["sqlite", true],
] as const)("preserves idle %s task on runtime disposal after prior turn=%s", async (kind, previousTurn) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "dispose-state-"),
	);
	const db =
		kind === "sqlite"
			? new SqliteSessionStore({ sessionsDir: join(root, "db") })
			: undefined;
	const service = db
		? new CoreSessionService(db, {
				sessionArtifactsDir: join(root, "sessions"),
			})
		: new FileSessionService(join(root, "sessions"));
	const finish = vi.fn(
		async (messages: AgentResult["messages"]): Promise<AgentResult> => ({
			text: "fixture reply",
			usage: { inputTokens: 0, outputTokens: 0, totalCost: 0 },
			messages,
			toolCalls: [],
			iterations: 1,
			finishReason: "completed",
			model: { id: "interchangeable-model", provider: "configured-provider" },
			startedAt: new Date(),
			endedAt: new Date(),
			durationMs: 0,
		}),
	);
	const createAgent = vi.fn((config: AgentConfig) => {
		const messages = structuredClone(config.initialMessages ?? []);
		return {
			getAgentId: () => "fixture-dispose",
			getConversationId: () => config.sessionId,
			getMessages: () => structuredClone(messages),
			canStartRun: () => true,
			subscribeEvents: () => () => {},
			run: () => finish(messages),
			continue: () => finish(messages),
			shutdown: async () => {},
		} as never;
	});
	const options = {
		sessionService: service,
		distinctId: "fixture-dispose-state",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	};
	const host = new LocalRuntimeHost(options);
	let resumed: LocalRuntimeHost | undefined;
	try {
		const artifact = await service.createRootSessionWithArtifacts({
			sessionId: "same-id",
			source: "vscode",
			pid: process.pid,
			status: "idle",
			interactive: true,
			provider: "configured-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			metadata: {
				originalInstruction: "Retain accepted work",
				corrections: ["Keep authors"],
			},
		});
		await service.persistSessionMessages("same-id", [
			{
				role: "user",
				content: "Retain accepted work",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				role: "user",
				content: "Keep authors",
				metadata: { author: { actorId: "jimmi" } },
			},
		] as never);
		await host.resumeSession({ config: { sessionId: "same-id" } as never });
		if (previousTurn)
			await host.runTurn({
				sessionId: "same-id",
				prompt: "fixture reply only",
			});
		expect((await host.getSession("same-id"))?.status).toBe("idle");
		const messagesBefore = await readFile(artifact.messagesPath);
		const manifestBefore = await readFile(artifact.manifestPath);
		const turns = finish.mock.calls.length;
		await host.dispose("hub_restart");
		expect(await readFile(artifact.manifestPath)).toEqual(manifestBefore);
		expect(await readFile(artifact.messagesPath)).toEqual(messagesBefore);
		resumed = new LocalRuntimeHost(options);
		await resumed.resumeSession({ config: { sessionId: "same-id" } as never });
		expect((await resumed.getSession("same-id"))?.status).toBe("idle");
		expect(finish.mock.calls).toHaveLength(turns);
		expect(await readFile(artifact.messagesPath)).toEqual(messagesBefore);
	} finally {
		await resumed?.dispose();
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});
