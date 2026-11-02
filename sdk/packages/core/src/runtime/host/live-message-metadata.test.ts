/** Real saved history; fixture agent exposes a working copy without final metadata. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageWithMetadata } from "@cline/llms";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import { CoreSessionService } from "../../session/services/session-service";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	"files",
	"sqlite",
] as const)("retains final %s metadata while reading actual live continuation", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "live-metadata-"),
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
	let working: MessageWithMetadata[] = [];
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-live-metadata",
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
		createAgent: vi.fn((config: AgentConfig) => {
			working = structuredClone(config.initialMessages ?? []).map((m) => ({
				...m,
				metrics: undefined,
				modelInfo: undefined,
				metadata: undefined,
			}));
			return {
				getAgentId: () => "fixture",
				getConversationId: () => "same-id",
				getMessages: () => structuredClone(working),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			} as never;
		}),
	});
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
		});
		await service.persistSessionMessages("same-id", [
			{
				id: "original",
				role: "user",
				content: "Original task",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				id: "reply",
				role: "assistant",
				content: "Last response",
				metrics: {
					inputTokens: 3,
					outputTokens: 2,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					cost: 0,
				},
				modelInfo: { id: "saved-model", provider: "saved-provider" },
			},
		] as never);
		const savedBytes = await readFile(artifact.messagesPath);
		const saved = JSON.parse(savedBytes.toString()).messages;
		await host.resumeSession({ config: { sessionId: "same-id" } as never });
		expect(await host.readLiveSessionMessages("same-id")).toEqual(saved);
		const tail: MessageWithMetadata[] = [
			{
				id: "continuation",
				role: "user",
				content: "Continue",
				metadata: { author: { actorId: "jimmi" } },
			},
			{ id: "stream", role: "assistant", content: "Partial live response" },
		];
		working.push(...tail);
		const live = await host.readLiveSessionMessages("same-id");
		expect(live).toEqual([...saved, ...tail]);
		live[0].metadata!.author = { actorId: "must-not-alias" };
		expect(
			(await host.readLiveSessionMessages("same-id"))[0].metadata?.author,
		).toEqual({ actorId: "Friseer" });
		expect(await readFile(artifact.messagesPath)).toEqual(savedBytes);
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});
