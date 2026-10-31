/** Real native persistence and local admission; agent fixture makes no model requests. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import { CoreSessionService } from "../../session/services/session-service";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	"files",
	"sqlite",
] as const)("reattaches and resumes canonical %s history without accepting stale client state or replacing an idle agent", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "local-admission-"),
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
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture-agent",
				getConversationId: () => config.sessionId,
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const options = {
		sessionService: service,
		distinctId: "fixture-local-admission",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	};
	const host = new LocalRuntimeHost(options);
	let cold: LocalRuntimeHost | undefined;
	try {
		const artifact = await service.createRootSessionWithArtifacts({
			sessionId: "same-session",
			source: "vscode",
			pid: process.pid,
			status: "idle",
			interactive: true,
			provider: "configured-provider",
			model: "saved-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			metadata: {
				title: "saved title",
				originalInstruction: "Original accepted order",
				corrections: ["Keep all completed steps"],
				checkpoint: { latest: { ref: "retained-fixture-ref" } },
			},
		});
		const messages = [
			{
				id: "original",
				role: "user",
				content: "Original accepted order",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				id: "correction",
				role: "user",
				content: "Keep all completed steps",
				metadata: { author: { actorId: "jimmi" } },
			},
		];
		await service.persistSessionMessages("same-session", messages as never);
		const bytes = await readFile(artifact.messagesPath),
			manifestBytes = await readFile(artifact.manifestPath);
		const input = {
			config: {
				sessionId: "same-session",
				providerId: "stale-provider",
				modelId: "stale-model",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			interactive: true,
			initialMessages: [
				{ role: "user", content: "obsolete browser copy" },
			] as never,
			sessionMetadata: {
				title: "stale client title",
				originalInstruction: "obsolete replacement",
			},
		};
		await host.startSession(input);
		expect(createAgent).toHaveBeenCalledOnce();
		expect(createAgent.mock.calls[0][0]).toMatchObject({
			providerId: "configured-provider",
			modelId: "saved-model",
			initialMessages: messages,
		});
		expect((await host.getSession("same-session"))?.metadata).toMatchObject({
			title: "saved title",
			originalInstruction: "Original accepted order",
		});
		expect(await readFile(artifact.messagesPath)).toEqual(bytes);
		expect(await readFile(artifact.manifestPath)).toEqual(manifestBytes);
		await host.startSession({ ...input, initialMessages: [] });
		expect(createAgent).toHaveBeenCalledOnce();
		await expect(
			host.startSession({ ...input, prompt: "send separately" }),
		).rejects.toThrow("already exists");
		expect(createAgent).toHaveBeenCalledOnce();
		await host.dispose();
		cold = new LocalRuntimeHost(options);
		const afterStop = await readFile(artifact.manifestPath);
		await expect(
			cold.startSession({ ...input, prompt: "must not replace" }),
		).rejects.toThrow("already exists");
		expect(createAgent).toHaveBeenCalledOnce();
		expect(await readFile(artifact.messagesPath)).toEqual(bytes);
		expect(await readFile(artifact.manifestPath)).toEqual(afterStop);
		await writeFile(artifact.messagesPath, "invalid retained transcript\n");
		await expect(cold.startSession(input)).rejects.toThrow();
		expect(createAgent).toHaveBeenCalledOnce();
		expect(await readFile(artifact.messagesPath, "utf8")).toBe(
			"invalid retained transcript\n",
		);
	} finally {
		await cold?.dispose();
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});
