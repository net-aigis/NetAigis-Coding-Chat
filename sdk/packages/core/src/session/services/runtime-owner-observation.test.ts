/** Missing OS owner is observable; its exit code and child outcomes are not. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { LocalRuntimeHost } from "../../runtime/host/local-runtime-host";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "./file-session-service";
import type { SessionPersistenceAdapter } from "./persistence-service";
import { CoreSessionService } from "./session-service";

it.each([
	"files",
	"sqlite",
] as const)("retains a saved idle %s session without treating its old PID as an interrupted run", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "idle-owner-"),
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
				getAgentId: () => "fixture-idle-agent",
				getConversationId: () => config.sessionId,
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-idle-owner",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	});
	try {
		for (const scenario of ["idle", "became-idle", "idle-unconfirmed-tool"]) {
			const artifacts = await service.createRootSessionWithArtifacts({
				sessionId: scenario,
				source: "vscode",
				pid: 999_999_999,
				status: scenario === "became-idle" ? "running" : "idle",
				interactive: true,
				provider: "configured-provider",
				model: "interchangeable-model",
				cwd: root,
				workspaceRoot: root,
				enableTools: false,
				enableSpawn: false,
				enableTeams: false,
			});
			await service.persistSessionMessages(scenario, [
				{
					role: "user",
					content: "Original task",
					metadata: { author: { actorId: "Friseer" } },
				},
				...(scenario === "idle-unconfirmed-tool"
					? [
							{
								role: "assistant",
								content: [
									{
										type: "tool_use",
										id: "unconfirmed",
										name: "run_commands",
										input: {},
									},
								],
							},
						]
					: []),
			] as never);
			const messages = await readFile(artifacts.messagesPath);
			let manifestBefore = await readFile(artifacts.manifestPath);
			const adapter = Reflect.get(
				service,
				"adapter",
			) as SessionPersistenceAdapter;
			const originalGet = adapter.getSession.bind(adapter);
			const spy =
				scenario === "became-idle"
					? vi
							.spyOn(adapter, "getSession")
							.mockImplementationOnce(async (id) => {
								await service.updateSessionStatus(id, "idle");
								const manifest = service.readSessionManifest(id)!;
								service.writeSessionManifest(artifacts.manifestPath, {
									...manifest,
									status: "idle",
								});
								manifestBefore = await readFile(artifacts.manifestPath);
								return originalGet(id);
							})
					: undefined;
			try {
				expect(await service.reconcileDeadSessions()).toBe(0);
			} finally {
				spy?.mockRestore();
			}
			const row = (await service.listSessions(10)).find(
				(r) => r.sessionId === scenario,
			)!;
			expect(row.status).toBe("idle");
			expect(row.metadata?.runtimeOwnerObservation).toBeUndefined();
			expect(row.exitCode ?? null).toBeNull();
			expect(await readFile(artifacts.manifestPath)).toEqual(manifestBefore);
			const input = {
				config: { sessionId: scenario, systemPrompt: "fixture" } as never,
				interactive: true,
			};
			if (scenario === "idle-unconfirmed-tool") {
				const calls = createAgent.mock.calls.length;
				await expect(host.resumeSession(input)).rejects.toThrow(
					"Saved tool execution remains unconfirmed",
				);
				expect(createAgent).toHaveBeenCalledTimes(calls);
			} else {
				await host.resumeSession(input);
				expect(createAgent.mock.calls.at(-1)?.[0].modelId).toBe(
					"interchangeable-model",
				);
				expect(await host.readSessionMessages(scenario)).toEqual(
					JSON.parse(messages.toString()).messages,
				);
			}
			expect(await readFile(artifacts.messagesPath)).toEqual(messages);
		}
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});

it.each([
	"files",
	"sqlite",
] as const)("does not invent an exit code for an unavailable %s runtime owner or resume its unconfirmed work", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "owner-observation-"),
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
	const createAgent = vi.fn();
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-owner-observation",
		createAgent,
	});
	try {
		const artifact = await service.createRootSessionWithArtifacts({
			sessionId: "interrupted",
			source: "vscode",
			pid: 999_999_999,
			interactive: true,
			provider: "configured-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
		});
		await service.persistSessionMessages("interrupted", [
			{
				role: "user",
				content: "Keep original task and received partial output",
				metadata: { author: { actorId: "Friseer" } },
			},
		] as never);
		const before = await readFile(artifact.messagesPath);
		expect(await service.reconcileDeadSessions()).toBe(1);
		const row = (await service.listSessions(10))[0];
		expect(row.status).toBe("failed");
		expect(row.exitCode ?? null).toBeNull();
		expect(row.metadata?.runtimeOwnerObservation).toMatchObject({
			version: 1,
			state: "unknown",
			pid: 999_999_999,
			exitConfirmed: false,
		});
		const manifest = service.readSessionManifest("interrupted")!;
		expect(manifest.exit_code ?? null).toBeNull();
		await expect(
			host.resumeSession({
				config: { sessionId: "interrupted" } as never,
				interactive: true,
			}),
		).rejects.toThrow("Runtime owner exit is unconfirmed");
		expect(createAgent).not.toHaveBeenCalled();
		expect(await readFile(artifact.messagesPath)).toEqual(before);
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});
