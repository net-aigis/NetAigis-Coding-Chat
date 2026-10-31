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
import type { AgentConfig, AgentResult } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import type { SessionPersistenceAdapter } from "../../session/services/persistence-service";
import { CoreSessionService } from "../../session/services/session-service";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	"files",
	"sqlite",
] as const)("retains but refuses cold %s history with an unverified legacy terminal return", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "legacy-command-admission-"),
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
	const build = vi.fn(),
		createAgent = vi.fn();
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-legacy-command",
		createAgent,
		runtimeBuilder: { build } as never,
	});
	try {
		const artifacts = await service.createRootSessionWithArtifacts({
			sessionId: "legacy-session",
			source: "vscode",
			status: "idle",
			pid: 0,
			interactive: true,
			provider: "configured-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
		});
		await service.persistSessionMessages("legacy-session", [
			{
				role: "user",
				content: "Original order",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "legacy-call",
						name: "execute_command",
						input: {},
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "legacy-call",
						content: "Completed",
					},
				],
				metadata: { author: { actorId: "jimmi" } },
			},
		] as never);
		const history = await readFile(artifacts.messagesPath),
			manifest = await readFile(artifacts.manifestPath);
		await expect(
			host.resumeSession({ config: { sessionId: "legacy-session" } as never }),
		).rejects.toThrow("Saved tool execution remains unconfirmed");
		expect(build).not.toHaveBeenCalled();
		expect(createAgent).not.toHaveBeenCalled();
		expect(await readFile(artifacts.messagesPath)).toEqual(history);
		expect(await readFile(artifacts.manifestPath)).toEqual(manifest);
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});

it("reattaches during the initial prompt without waiting for or ending that pending turn", async () => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "initial-turn-reattach-"),
	);
	const service = new FileSessionService(join(root, "sessions"));
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let running = false,
		firstSettled = false,
		secondSettled = false;
	const run = vi.fn(async (): Promise<AgentResult> => {
		running = true;
		await gate;
		running = false;
		return {
			text: "fixture",
			usage: { inputTokens: 0, outputTokens: 0, totalCost: 0 },
			messages: [],
			toolCalls: [],
			iterations: 1,
			finishReason: "completed",
			model: { id: "interchangeable-model", provider: "configured-provider" },
			startedAt: new Date(),
			endedAt: new Date(),
			durationMs: 0,
		};
	});
	const createAgent = vi.fn(
		() =>
			({
				getAgentId: () => "fixture",
				getConversationId: () => "same-session",
				getMessages: () => [],
				canStartRun: () => !running,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
				run,
			}) as never,
	);
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-initial-turn",
		createAgent,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	});
	const starts: Promise<unknown>[] = [];
	try {
		starts.push(
			host
				.startSession({
					config: {
						sessionId: "same-session",
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
					prompt: "Original accepted instruction",
				})
				.finally(() => {
					firstSettled = true;
				}),
		);
		for (const start of starts) void start.catch(() => {});
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		starts.push(
			host
				.resumeSession({ config: { sessionId: "same-session" } as never })
				.then((result) => {
					secondSettled = true;
					return result;
				}),
		);
		void starts[1].catch(() => {});
		await vi.waitFor(() => expect(secondSettled).toBe(true));
		expect(firstSettled).toBe(false);
		expect(running).toBe(true);
		expect(createAgent).toHaveBeenCalledOnce();
		expect((await host.getSession("same-session"))?.status).toBe("running");
		release();
		await Promise.all(starts);
	} finally {
		release();
		await Promise.allSettled(starts);
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

it.each([
	"files",
	"sqlite",
] as const)("admits concurrent starts of the same %s session once without losing the resident runtime", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "concurrent-admission-"),
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
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const build = vi.fn(async () => {
		await gate;
		return { tools: [], shutdown: async () => {} };
	});
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
		distinctId: "fixture-concurrent-admission",
		createAgent,
		runtimeBuilder: { build } as never,
	});
	const starts: Promise<unknown>[] = [];
	try {
		const input = {
			config: {
				sessionId: "same-session",
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
				{
					id: "original",
					role: "user",
					content: "Original accepted instruction",
				},
			] as never,
		};
		starts.push(host.startSession(input));
		await vi.waitFor(() => expect(build).toHaveBeenCalledOnce());
		starts.push(
			host.startSession({
				...input,
				initialMessages: [
					{ role: "user", content: "stale concurrent client copy" },
				] as never,
			}),
		);
		for (const start of starts) void start.catch(() => {});
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(build).toHaveBeenCalledOnce();
		release();
		const results = await Promise.all(starts);
		expect(results).toMatchObject([
			{ sessionId: "same-session" },
			{ sessionId: "same-session" },
		]);
		expect(createAgent).toHaveBeenCalledOnce();
		expect(host.isSessionResident("same-session")).toBe(true);
		expect(
			(await host.readLiveSessionMessages("same-session"))[0].content,
		).toBe("Original accepted instruction");
		expect(await service.listSessions(10)).toHaveLength(1);
	} finally {
		release();
		await Promise.allSettled(starts);
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});

it.each([
	"files",
	"sqlite",
] as const)("retains the actual agent's initial message identities in %s across a cold resume without a model request", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "agent-seed-identities-"),
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
	const network = vi
		.spyOn(globalThis, "fetch")
		.mockRejectedValue(
			new Error("No model/provider request is allowed in this admission test"),
		);
	const options = {
		sessionService: service,
		distinctId: "fixture-real-agent-identities",
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
	};
	const host = new LocalRuntimeHost(options);
	let cold: LocalRuntimeHost | undefined;
	try {
		const input = {
			config: {
				sessionId: "same-session",
				providerId: "openai",
				modelId: "gpt-4.1",
				apiKey: "fixture-no-model-request",
				baseUrl: "http://127.0.0.1:9/v1",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			interactive: true,
			initialMessages: [
				{ role: "user", content: "Original order" },
				{ role: "assistant", content: "Original response" },
			] as never,
		};
		const callerHistory = JSON.stringify(input.initialMessages);
		const result = await host.startSession(input);
		expect(JSON.stringify(input.initialMessages)).toBe(callerHistory);
		const live = await host.readLiveSessionMessages(result.sessionId);
		const stored = JSON.parse(
			await readFile(result.messagesPath, "utf8"),
		).messages;
		expect(live.map((message) => message.id)).toEqual(
			stored.map((message: { id: string }) => message.id),
		);
		expect(live.map((message) => message.content)).toEqual([
			"Original order",
			"Original response",
		]);
		const before = await readFile(result.messagesPath);
		await host.dispose();
		expect(await readFile(result.messagesPath)).toEqual(before);
		cold = new LocalRuntimeHost(options);
		await cold.startSession({ ...input, initialMessages: [] });
		expect(
			(await cold.readLiveSessionMessages(result.sessionId)).map(
				(message) => message.id,
			),
		).toEqual(stored.map((message: { id: string }) => message.id));
		expect(network).not.toHaveBeenCalled();
	} finally {
		await cold?.dispose();
		await host.dispose();
		db?.close();
		network.mockRestore();
		await rm(root, { recursive: true, force: true });
	}
});

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
