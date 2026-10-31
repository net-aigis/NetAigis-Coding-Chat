/** Real process and existing file persistence; the agent/model are fixtures. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createBuiltinTools } from "../../extensions/tools";
import {
	COMMAND_OBSERVATIONS_METADATA_KEY as KEY,
	type RunCommandExecutionController,
} from "../../extensions/tools/executors/run-command-execution-controller";
import { FileSessionService } from "../../session/services/file-session-service";
import { hasUnresolvedCommandObservation } from "./command-observations";
import { LocalRuntimeHost } from "./local-runtime-host";

it("persists a detached command's own exit without rewriting history, keeps concurrent writer metadata, and survives a fresh host read", async () => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "command-journal-"),
	);
	const service = new FileSessionService(join(root, "sessions"));
	let controller!: RunCommandExecutionController;
	let messages: unknown[] = [];
	const options = {
		distinctId: "fixture-command-journal",
		sessionService: service,
		runtimeBuilder: {
			build: async (input: {
				runCommandExecutionController: RunCommandExecutionController;
			}) => {
				controller = input.runCommandExecutionController;
				return { tools: [], shutdown: async () => {} };
			},
		} as never,
		createAgent: () =>
			({
				getAgentId: () => "fixture-agent",
				getConversationId: () => "journal-session",
				getMessages: () => messages,
				updateConnection: () => {},
				canStartRun: () => true,
				subscribeEvents: () => () => {},
				shutdown: async () => {},
			}) as never,
	};
	const host = new LocalRuntimeHost(options);
	const abort = new AbortController();
	let ready!: () => void, exited!: () => void;
	const didStart = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const didExit = new Promise<void>((resolve) => {
		exited = resolve;
	});
	let outputReady = false,
		detachable = false;
	try {
		await host.startSession({
			config: {
				sessionId: "journal-session",
				providerId: "fixture-provider",
				modelId: "fixture-model",
				cwd: root,
				workspaceRoot: root,
				systemPrompt: "fixture",
				enableTools: false,
				enableSpawnAgent: false,
				enableAgentTeams: false,
			},
			interactive: true,
		});
		await host.updateSession("journal-session", {
			metadata: { title: "original", sharedSessionControl: { revision: 2 } },
		});
		const tool = createBuiltinTools({
			executorOptions: {
				bash: { timeoutMs: null, executionController: controller },
			},
		}).find((entry) => entry.name === "run_commands")!;
		const pending = Promise.resolve(
			tool.execute(
				{
					commands: [
						{
							command: process.execPath,
							args: [
								"-e",
								"process.stdout.write('ready');setTimeout(()=>{},1200)",
							],
						},
					],
				},
				{
					agentId: "fixture-agent",
					sessionId: "journal-session",
					conversationId: "journal-session",
					toolCallId: "actual-command",
					iteration: 1,
					signal: abort.signal,
					emitUpdate(update) {
						const value = update as {
							chunk?: string;
							detachable?: boolean;
							execution?: { state: string };
						};
						if (value.chunk?.includes("ready")) outputReady = true;
						if (value.detachable) detachable = true;
						if (outputReady && detachable) ready();
						if (value.execution?.state === "completed") exited();
					},
				},
			),
		);
		await didStart;
		expect(
			controller.proceedWhileRunning("journal-session", "actual-command"),
		).toBe(1);
		const result = await pending;
		expect(result).toMatchObject([
			{ pending: true, success: false, execution: { state: "running" } },
		]);
		messages = [
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "actual-command",
						name: "run_commands",
						input: {},
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "actual-command",
						content: result,
					},
				],
			},
		];
		await service.persistSessionMessages("journal-session", messages as never);
		const manifest = await service.readSessionManifest("journal-session");
		if (!manifest?.messages_path)
			throw new Error("Fixture session did not materialize its transcript");
		const messagesPath = manifest.messages_path;
		const before = await readFile(messagesPath);
		const row = await host.getSession("journal-session");
		expect(
			hasUnresolvedCommandObservation(
				messages,
				row!.metadata?.[KEY],
				"journal-session",
			),
		).toBe(true);
		await Promise.all([
			host.updateSession("journal-session", {
				metadata: {
					title: "writer correction",
					sharedSessionControl: { revision: 3 },
					[KEY]: { version: 1, entries: [] },
				},
			}),
			host.updateSessionConnection("journal-session", {
				modelId: "another-interchangeable-model",
			}),
		]);
		expect(
			(await host.getSession("journal-session"))!.metadata?.[KEY],
		).toMatchObject({ entries: [{ execution: { state: "running" } }] });
		await didExit;
		const ended = await host.getSession("journal-session");
		expect(ended!.metadata).toMatchObject({
			title: "writer correction",
			sharedSessionControl: { revision: 3 },
			[KEY]: { entries: [{ execution: { state: "completed", exitCode: 0 } }] },
		});
		expect(
			hasUnresolvedCommandObservation(
				messages,
				ended!.metadata?.[KEY],
				"journal-session",
			),
		).toBe(false);
		expect(await readFile(messagesPath)).toEqual(before);
		const fresh = new LocalRuntimeHost(options);
		try {
			expect(
				(await fresh.getSession("journal-session"))!.metadata?.[KEY],
			).toEqual(ended!.metadata?.[KEY]);
			expect(
				(await service.readSessionManifest("journal-session"))?.model,
			).toBe("another-interchangeable-model");
		} finally {
			await fresh.dispose();
		}
	} finally {
		abort.abort();
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
