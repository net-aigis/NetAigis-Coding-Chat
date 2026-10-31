/** Real native persistence and local admission; agent fixture makes no model requests. */
import {
	mkdtemp,
	readFile,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import type { SessionPersistenceAdapter } from "../../session/services/persistence-service";
import { CoreSessionService } from "../../session/services/session-service";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	"symlink",
	"changed-file",
])("does not publish an initial transcript replaced by %s after its write", async (replacement) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "seed-file-boundary-"),
	);
	const service = new FileSessionService(join(root, "sessions"));
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture",
				getConversationId: () => config.sessionId,
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-seed-file",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	});
	try {
		const unrelated = join(root, "unrelated-fixture-history.json");
		const unrelatedBytes = JSON.stringify({
			version: 1,
			messages: [{ role: "user", content: "Keep this separate fixture" }],
		});
		await writeFile(unrelated, unrelatedBytes);
		const originalPersist = service.persistSessionMessages.bind(service);
		vi.spyOn(service, "persistSessionMessages").mockImplementationOnce(
			async (...args) => {
				await originalPersist(...args);
				const target = service.readSessionManifest(args[0])!.messages_path!;
				if (replacement === "symlink") {
					await rename(target, `${target}.retained-seed`);
					await symlink(unrelated, target);
				} else await writeFile(target, unrelatedBytes);
			},
		);
		await expect(
			host.startSession({
				config: {
					sessionId: "same-seed",
					providerId: "configured-provider",
					modelId: "interchangeable-model",
					cwd: root,
					workspaceRoot: root,
					systemPrompt: "fixture",
					enableTools: false,
					enableSpawnAgent: false,
					enableAgentTeams: false,
				},
				interactive: true,
				initialMessages: [
					{ id: "original", role: "user", content: "Original instruction" },
				],
			}),
		).rejects.toThrow(/Initial history/i);
		expect(host.isSessionResident("same-seed")).toBe(false);
		expect(
			(await service.listSessions(10))[0].metadata?.runtimeSnapshotImport,
		).toMatchObject({ state: "staging" });
		expect(await readFile(unrelated, "utf8")).toBe(unrelatedBytes);
	} finally {
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

it.each([
	"files",
	"sqlite",
] as const)("publishes full %s initial history and retains the admission fence if the final index acknowledgement fails", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "seed-publication-"),
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
				getAgentId: () => "fixture",
				getConversationId: () => config.sessionId,
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const options = {
		sessionService: service,
		distinctId: "fixture-seed-publication",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	};
	const host = new LocalRuntimeHost(options);
	try {
		const messages = [
			{
				id: "original",
				role: "user",
				content: "Original accepted instruction",
				metadata: { author: { actorId: "Friseer" } },
			},
		];
		const input = {
			config: {
				sessionId: "successful-seed",
				providerId: "configured-provider",
				modelId: "interchangeable-model",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			interactive: true,
			initialMessages: messages as never,
		};
		const result = await host.startSession(input);
		expect(result.manifest.metadata?.runtimeSnapshotImport).toBeUndefined();
		expect(
			(await service.listSessions(10)).find(
				(row) => row.sessionId === result.sessionId,
			)?.metadata?.runtimeSnapshotImport,
		).toBeUndefined();
		expect(
			JSON.parse(await readFile(result.messagesPath, "utf8")).messages,
		).toEqual(messages);
		const adapter = Reflect.get(
			service,
			"adapter",
		) as SessionPersistenceAdapter;
		const originalUpdate = adapter.updateSession.bind(adapter);
		vi.spyOn(adapter, "updateSession").mockImplementationOnce(
			async (update) => {
				if (update.sessionId === "unacknowledged-seed")
					return { updated: false, statusLock: 0 };
				return originalUpdate(update);
			},
		);
		await expect(
			host.startSession({
				...input,
				config: { ...input.config, sessionId: "unacknowledged-seed" },
			}),
		).rejects.toThrow("index commit was not confirmed");
		expect(host.isSessionResident("unacknowledged-seed")).toBe(false);
		const partial = (await service.listSessions(10)).find(
			(row) => row.sessionId === "unacknowledged-seed",
		)!;
		expect(partial.metadata?.runtimeSnapshotImport).toMatchObject({
			state: "staging",
		});
		// The file committed first; its index still prevents another actor/runtime from admission.
		expect(
			service.readSessionManifest("unacknowledged-seed")?.metadata
				?.runtimeSnapshotImport,
		).toBeUndefined();
		const count = createAgent.mock.calls.length;
		await expect(
			host.resumeSession({
				config: { sessionId: "unacknowledged-seed" } as never,
			}),
		).rejects.toThrow("import is incomplete");
		expect(createAgent).toHaveBeenCalledTimes(count);
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});

it.each([
	"files",
	"sqlite",
] as const)("rejects a failed initial-history write in %s, releases its runtime and keeps the partial target blocked", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "seed-failure-"),
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
	const agentShutdown = vi.fn(async () => {}),
		runtimeShutdown = vi.fn(async () => {}),
		run = vi.fn();
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture-seed-agent",
				getConversationId: () => config.sessionId,
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: agentShutdown,
				run,
			}) as never,
	);
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-seed-failure",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: runtimeShutdown }),
		} as never,
	});
	try {
		const initialMessages = [
			{
				id: "original",
				role: "user",
				content: "Retain the original order",
				metadata: { author: { actorId: "Friseer" } },
			},
		];
		const source = JSON.stringify(initialMessages);
		await writeFile(join(root, "source-history.json"), source);
		const failure = new Error("fixture seed write failure");
		vi.spyOn(service, "persistSessionMessages").mockRejectedValueOnce(failure);
		const input = {
			config: {
				sessionId: "new-seeded-session",
				providerId: "configured-provider",
				modelId: "interchangeable-model",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			interactive: true,
			initialMessages: initialMessages as never,
		};
		await expect(host.startSession(input)).rejects.toBe(failure);
		expect(host.isSessionResident("new-seeded-session")).toBe(false);
		expect(agentShutdown).toHaveBeenCalledOnce();
		expect(runtimeShutdown).toHaveBeenCalledOnce();
		expect(run).not.toHaveBeenCalled();
		const row = (await service.listSessions(10))[0];
		expect(row.metadata?.runtimeSnapshotImport).toMatchObject({
			version: 1,
			state: "staging",
			source: { kind: "initial-history" },
		});
		await expect(host.startSession(input)).rejects.toThrow(
			"import is incomplete",
		);
		expect(createAgent).toHaveBeenCalledOnce();
		expect(JSON.stringify(initialMessages)).toBe(source);
		expect(await readFile(join(root, "source-history.json"), "utf8")).toBe(
			source,
		);
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});

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
