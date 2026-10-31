/** Actual child process/tool and authenticated sockets; session/model orchestration is a fixture. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createBuiltinTools } from "../../extensions/tools";
import { RunCommandExecutionController } from "../../extensions/tools/executors/run-command-execution-controller";
import type { ToolOperationResult } from "../../extensions/tools/types";
import { NodeHubClient } from "../client";
import { startHubWebSocketServer } from "./hub-websocket-server";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

it("keeps an actual command alive after writer disconnect and a second client's next request, then confirms its exit", async () => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "shared-command-"),
	);
	const id = "one-running-session";
	const row = {
		sessionId: id,
		source: "vscode",
		status: "idle",
		interactive: true,
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		provider: "fixture-provider",
		model: "fixture-model",
		cwd: root,
		workspaceRoot: root,
		metadata: {} as Record<string, unknown>,
	};
	const abort = new AbortController();
	const started = deferred<void>();
	const finished = deferred<ToolOperationResult[]>();
	void finished.promise.catch(() => {});
	const observations: Record<string, unknown>[] = [];
	let output = "",
		toolReturnedAt: number | undefined,
		runStarted = false;
	const tool = createBuiltinTools({
		cwd: root,
		executorOptions: {
			bash: {
				timeoutMs: null,
				executionController: new RunCommandExecutionController(),
			},
		},
	}).find((candidate) => candidate.name === "run_commands");
	if (!tool) throw new Error("Expected runtime command tool");
	const runtime = {
		subscribe: () => () => {},
		getSession: async () => row,
		isSessionResident: () => true,
		listSessions: async () => [row],
		getAccumulatedUsage: async () => undefined,
		readLiveSessionMessages: async () => [],
		pendingPrompts: { list: async () => [] },
		updateSession: async (
			_id: string,
			update: { metadata: Record<string, unknown> },
		) => {
			row.metadata = structuredClone(update.metadata);
			return { updated: true };
		},
		runTurn: async () => {
			runStarted = true;
			row.status = "running";
			try {
				const result = await tool.execute(
					{
						commands: [
							{
								command: process.execPath,
								args: [
									"-e",
									"process.stdout.write('alive:'+process.pid+':'+Date.now()+'\\n'); setTimeout(()=>process.stdout.write('done:'+Date.now()+'\\n'),6000)",
								],
							},
						],
					},
					{
						agentId: "fixture-agent",
						sessionId: id,
						conversationId: id,
						toolCallId: "same-command",
						iteration: 1,
						signal: abort.signal,
						emitUpdate: (update) => {
							const observation = update as Record<string, unknown>;
							observations.push(structuredClone(observation));
							if (typeof observation.chunk === "string")
								output += observation.chunk;
							if (output.includes("alive:")) started.resolve();
						},
					},
				);
				toolReturnedAt = Date.now();
				row.status = "idle";
				finished.resolve(result as ToolOperationResult[]);
			} catch (error) {
				finished.reject(error);
				throw error;
			}
			return undefined;
		},
		abort: async () => abort.abort(),
		stopSession: vi.fn(),
		dispose: async () => abort.abort(),
	};
	const server = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		owner: {
			ownerId: "fixture-shared-command",
			discoveryPath: join(root, "hub.json"),
		},
		actorTokens: { Friseer: "fixture-friseer", jimmi: "fixture-jimmi" },
		sessionHost: runtime as never,
		runtimeHandlers: {
			startSession: vi.fn(),
			sendSession: vi.fn(),
			stopSession: vi.fn(),
			abortSession: vi.fn(),
		},
		scheduleOptions: { dbPath: ":memory:" },
		taskOptions: {
			dbPath: join(root, "tasks.db"),
			globalSpecsDir: join(root, "specs"),
			watchFiles: false,
		},
		eventLog: false,
		runQueue: false,
	});
	const writer = new NodeHubClient({
		url: server.url,
		authToken: "fixture-friseer",
		clientId: "fixture-vscode",
		workspaceRoot: root,
	});
	const browser = new NodeHubClient({
		url: server.url,
		authToken: "fixture-jimmi",
		clientId: "fixture-browser",
		workspaceRoot: root,
	});
	try {
		await writer.command("session.control.claim", { expectedRevision: 0 }, id);
		const pending = writer
			.command("run.start", { input: "fixture actual command" }, id, {
				timeoutMs: null,
			})
			.catch(() => undefined);
		await started.promise;
		const match = output.match(/alive:(\d+):(\d+)/);
		if (!match) throw new Error("Missing actual process start");
		const pid = Number(match[1]),
			processStartedAt = Number(match[2]);
		const disconnectedAt = Date.now();
		await writer.dispose();
		await pending;
		const nextRequestAt = Date.now();
		const state = await browser.command(
			"session.get",
			{ includeSnapshot: true },
			id,
		);
		expect(state.payload?.snapshot).toMatchObject({
			sessionId: id,
			status: "running",
		});
		expect(toolReturnedAt).toBeUndefined();
		expect(() => process.kill(pid, 0)).not.toThrow();
		const result = await finished.promise;
		expect(result).toMatchObject([
			{ success: true, result: expect.stringContaining("done:") },
		]);
		const end = observations.find((item) => item.observation === "process_exit")
			?.execution as Record<string, unknown> | undefined;
		expect(end).toMatchObject({ state: "completed", exitCode: 0, pid });
		expect(Number(end?.observedAtMs) - processStartedAt).toBeGreaterThanOrEqual(
			5900,
		);
		expect(toolReturnedAt).toBeGreaterThanOrEqual(Number(end?.observedAtMs));
		if (process.env.CLINE_DATA_DIR)
			await writeFile(
				join(process.env.CLINE_DATA_DIR, "shared-command-timing.json"),
				JSON.stringify(
					{
						processStartedAt,
						disconnectedAt,
						nextRequestAt,
						processExitObservedAt: end?.observedAtMs,
						toolReturnedAt,
						confirmedExitCode: end?.exitCode,
						processSurvivedNextRequest: true,
					},
					null,
					2,
				),
				{ flag: "wx", mode: 0o600 },
			);
	} finally {
		abort.abort();
		await writer.dispose();
		await browser.dispose();
		if (runStarted) await finished.promise.catch(() => {});
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
