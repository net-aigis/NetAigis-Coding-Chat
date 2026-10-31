/** Real saved transcript and runtime bootstrap; the agent/model are fixtures. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import { createSessionCompactionState } from "../../session/models/session-compaction";
import type { SessionManifest } from "../../session/models/session-manifest";
import { LocalRuntimeHost } from "./local-runtime-host";

it.each([
	false,
	true,
])("activates canonical saved history (empty=%s) without overwriting it, then reattaches to that same resident agent", async (empty) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "canonical-resume-"),
	);
	const path = join(root, "existing.messages.json");
	const canonical = empty
		? []
		: [
				{
					role: "user",
					content: "Original order",
					metadata: { author: { actorId: "Friseer" } },
				},
				{
					role: "user",
					content: "Accepted correction",
					metadata: { author: { actorId: "jimmi" } },
				},
			];
	const manifest: SessionManifest = {
		version: 1,
		session_id: "existing",
		source: "vscode",
		pid: 1,
		started_at: "2026-10-30T10:00:00Z",
		status: "completed",
		interactive: true,
		provider: "saved-provider",
		model: "saved-model",
		cwd: root,
		workspace_root: root,
		enable_tools: false,
		enable_spawn: false,
		enable_teams: false,
		messages_path: path,
		metadata: {
			title: "Saved original",
			checkpoint: { latest: { ref: "retained-checkpoint" } },
			systemPrompt: "saved system instructions",
		},
	};
	const compaction = createSessionCompactionState({
		sourceMessages: canonical as never,
		compactedMessages: canonical as never,
		conversationId: "existing",
	});
	const service = {
		readSessionCompactionState: vi.fn(async () => compaction),
		ensureSessionsDir: async () => root,
		readSessionManifest: async () => structuredClone(manifest),
		listSessions: async () => [],
		createRootSessionWithArtifacts: vi.fn(),
		persistSessionMessages: vi.fn(),
		updateSession: vi.fn(async () => ({ updated: true })),
		updateSessionStatus: vi.fn(async () => ({ updated: true })),
		writeSessionManifest: vi.fn(),
	};
	const agent = {
		getAgentId: () => "fixture-agent",
		getConversationId: () => "existing",
		getMessages: () => structuredClone(canonical),
		canStartRun: () => true,
		subscribeEvents: () => () => {},
		shutdown: async () => {},
	};
	const createAgent = vi.fn((_config: AgentConfig) => agent as never);
	const host = new LocalRuntimeHost({
		distinctId: "fixture-resume",
		sessionService: service as never,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
		createAgent,
	});
	try {
		await writeFile(path, JSON.stringify({ version: 1, messages: canonical }));
		const original = await readFile(path);
		const input = {
			config: {
				sessionId: "existing",
				providerId: "client-stale-provider",
				baseUrl: "http://unrelated-fixture.invalid",
				apiKey: "fixture-old-selection",
				headers: { "X-Fixture-Stale": "unrelated" },
				modelId: "client-stale-model",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "stale system instructions",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			initialMessages: [
				{ role: "user" as const, content: "stale client copy" },
			],
			sessionMetadata: { title: "stale title" },
		};
		const result = await host.resumeSession(input);
		expect(result).toMatchObject({
			sessionId: "existing",
			manifest: {
				model: "saved-model",
				started_at: manifest.started_at,
				metadata: manifest.metadata,
			},
		});
		expect(service.readSessionCompactionState).toHaveBeenCalledWith("existing");
		expect(await host.readSessionCompactionState("existing")).toEqual(
			compaction,
		);
		expect(createAgent).toHaveBeenCalledOnce();
		expect(createAgent.mock.calls[0][0]).toMatchObject({
			initialMessages: canonical,
			systemPrompt: "saved system instructions",
		});
		expect(createAgent.mock.calls[0][0].baseUrl).not.toBe(
			"http://unrelated-fixture.invalid",
		);
		expect(createAgent.mock.calls[0][0].apiKey).not.toBe(
			"fixture-old-selection",
		);
		expect(await readFile(path)).toEqual(original);
		expect(service.createRootSessionWithArtifacts).not.toHaveBeenCalled();
		expect(service.persistSessionMessages).not.toHaveBeenCalled();
		await host.resumeSession(input);
		expect(createAgent).toHaveBeenCalledOnce();
	} finally {
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses uncertain saved process state and invalid transcripts before constructing a replacement runtime", async () => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "unsafe-resume-"),
	);
	const path = join(root, "messages.json");
	const manifest = {
		session_id: "existing",
		messages_path: path,
		status: "running",
	};
	const createAgent = vi.fn();
	const host = new LocalRuntimeHost({
		distinctId: "fixture-resume",
		sessionService: { readSessionManifest: async () => manifest } as never,
		runtimeBuilder: { build: vi.fn() } as never,
		createAgent,
	});
	const input = {
		config: {
			sessionId: "existing",
			providerId: "existing",
			modelId: "existing",
			enableTools: false,
			enableSpawnAgent: false,
			enableAgentTeams: false,
			systemPrompt: "",
		},
	};
	try {
		await expect(host.resumeSession(input)).rejects.toThrow(
			"not confirmed quiescent",
		);
		manifest.status = "completed";
		await expect(host.resumeSession(input)).rejects.toThrow("not replaced");
		await writeFile(path, "{damaged");
		await expect(host.resumeSession(input)).rejects.toThrow("not replaced");
		await writeFile(
			path,
			JSON.stringify([
				{
					role: "assistant",
					content: [
						{ type: "tool_use", id: "still-running", name: "run_commands" },
					],
				},
			]),
		);
		await expect(host.resumeSession(input)).rejects.toThrow(
			"execution remains unconfirmed",
		);
		expect(createAgent).not.toHaveBeenCalled();
		expect(await readFile(path, "utf8")).toContain("still-running");
	} finally {
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
