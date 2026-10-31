/** Model IDs are fixtures. Real stores/runtime lifecycle, no model or backend requests. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import { CoreSessionService } from "../../session/services/session-service";
import * as atomicFile from "../../session/stores/atomic-file";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	"files",
	"sqlite",
] as const)("retains an explicitly selected interchangeable model in the %s index, manifest and cold resume without rewriting old turns", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "model-selection-"),
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
	const updateConnection = vi.fn();
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture-agent",
				getConversationId: () => "same-session",
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
				updateConnection,
			}) as never,
	);
	const options = {
		sessionService: service,
		distinctId: "fixture-model-selection",
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
		createAgent,
	};
	const host = new LocalRuntimeHost(options);
	let cold: LocalRuntimeHost | undefined;
	try {
		const artifact = await service.createRootSessionWithArtifacts({
			sessionId: "same-session",
			source: "vscode",
			pid: process.pid,
			interactive: true,
			provider: "configured-provider",
			model: "initial-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			status: "idle",
		});
		await service.persistSessionMessages("same-session", [
			{
				id: "original",
				role: "user",
				content: "Original accepted task",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				id: "original-reply",
				role: "assistant",
				content: "Earlier response",
				modelInfo: { id: "initial-model", provider: "configured-provider" },
			},
		] as never);
		const before = await readFile(artifact.messagesPath);
		const input = {
			config: {
				sessionId: "same-session",
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			} as never,
			interactive: true,
		};
		await host.resumeSession(input);
		const manifestBefore = await readFile(artifact.manifestPath);
		const failure = vi
			.spyOn(atomicFile, "writeFileAtomic")
			.mockRejectedValueOnce(new Error("fixture manifest commit failure"));
		try {
			await expect(
				host.updateSessionConnection("same-session", {
					modelId: "replacement-model",
				}),
			).rejects.toThrow("fixture manifest commit failure");
			expect(updateConnection).not.toHaveBeenCalled();
			expect((await host.getSession("same-session"))?.model).toBe(
				"initial-model",
			);
			expect((await service.listSessions(10))[0].model).toBe("initial-model");
			expect(await readFile(artifact.manifestPath)).toEqual(manifestBefore);
		} finally {
			failure.mockRestore();
		}
		await host.updateSessionConnection("same-session", {
			modelId: "replacement-model",
		});
		expect(updateConnection).toHaveBeenCalledWith({
			modelId: "replacement-model",
		});
		expect((await service.listSessions(10))[0].model).toBe("replacement-model");
		expect(service.readSessionManifest("same-session")?.model).toBe(
			"replacement-model",
		);
		await host.stopSession("same-session");
		expect((await host.getSession("same-session"))?.model).toBe(
			"replacement-model",
		);
		expect(await readFile(artifact.messagesPath)).toEqual(before);
		cold = new LocalRuntimeHost(options);
		await cold.resumeSession(input);
		expect(createAgent.mock.calls.at(-1)?.[0].modelId).toBe(
			"replacement-model",
		);
		expect(await cold.readSessionMessages("same-session")).toEqual(
			JSON.parse(before.toString()).messages,
		);
		expect(await readFile(artifact.messagesPath)).toEqual(before);
	} finally {
		await cold?.dispose();
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});
