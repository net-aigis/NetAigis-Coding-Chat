/** Resume must obtain allocation policy from the runtime's provider, never a client snapshot. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "@cline/shared";
import { expect, it, vi } from "vitest";
import type { SessionManifest } from "../../session/models/session-manifest";
import { LocalRuntimeHost } from "./local-runtime-host";

it("resumes with live server-owned dynamic capacity while retaining canonical history and ignoring client connection/metadata", async () => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "resume-allocation-"),
	);
	const path = join(root, "messages.json");
	const model = "interchangeable-saved-model";
	const messages = [
		{
			id: "original-message",
			role: "user",
			content: "Retain the original order",
			metadata: { author: { actorId: "Friseer" } },
		},
	];
	const manifest: SessionManifest = {
		version: 1,
		session_id: "saved",
		source: "vscode",
		pid: 1,
		started_at: "2026-10-30T10:00:00Z",
		status: "idle",
		interactive: true,
		provider: "openai-compatible",
		model,
		cwd: root,
		workspace_root: root,
		enable_tools: false,
		enable_spawn: false,
		enable_teams: false,
		messages_path: path,
	};
	const service = {
		ensureSessionsDir: async () => root,
		readSessionManifest: async () => structuredClone(manifest),
		listSessions: async () => [],
		updateSession: vi.fn(async () => ({ updated: true })),
		updateSessionStatus: vi.fn(async () => ({ updated: true })),
		writeSessionManifest: vi.fn(),
		persistSessionMessages: vi.fn(),
	};
	const createAgent = vi.fn(
		(config: AgentConfig) =>
			({
				getAgentId: () => "fixture-agent",
				getConversationId: () => "saved",
				getMessages: () => structuredClone(config.initialMessages ?? []),
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	);
	const fetch = vi.fn(
		async (
			_input: Parameters<typeof globalThis.fetch>[0],
			_init?: Parameters<typeof globalThis.fetch>[1],
		) =>
			Response.json({
				data: [
					{
						id: model,
						netaigis_context: {
							version: 1,
							state: "ready",
							allocation: "on_demand",
							loaded_capacity: 32768,
							request_limit: 1000000,
							tiers: [32768, 65536, 1000000],
						},
					},
				],
			}),
	);
	const host = new LocalRuntimeHost({
		distinctId: "fixture-resume-allocation",
		sessionService: service as never,
		providerSettingsManager: {
			getProviderSettings: () => ({
				provider: "openai-compatible",
				model,
				baseUrl: "http://configured-runtime.invalid/v1",
				apiKey: "fixture-server-key",
			}),
		} as never,
		fetch: fetch as unknown as typeof globalThis.fetch,
		runtimeBuilder: {
			build: async () => ({ tools: [], shutdown: async () => {} }),
		} as never,
		createAgent,
	});
	try {
		await writeFile(path, JSON.stringify({ version: 1, messages }));
		const original = await readFile(path);
		await host.resumeSession({
			config: {
				sessionId: "saved",
				providerId: "openai-compatible",
				modelId: model,
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
				baseUrl: "http://unrelated-client.invalid/v1",
				apiKey: "fixture-untrusted-client-key",
				knownModels: { [model]: { id: model, contextWindow: 16000000 } },
			},
		});
		expect(
			createAgent.mock.calls[0][0].knownModels?.[model]?.contextWindow,
		).toBe(1000000);
		expect(createAgent.mock.calls[0][0].baseUrl).toBe(
			"http://configured-runtime.invalid/v1",
		);
		expect(createAgent.mock.calls[0][0].apiKey).toBe("fixture-server-key");
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			"http://configured-runtime.invalid/v1/models",
		);
		expect(await readFile(path)).toEqual(original);
		expect(service.persistSessionMessages).not.toHaveBeenCalled();
	} finally {
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
