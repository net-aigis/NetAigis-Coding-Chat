/** Real child exit and private log file, with a deterministically delayed log sink. */
import * as fs from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { expect, it, vi } from "vitest";
import { createShellExecutor } from "./bash";
import { RunCommandExecutionController } from "./run-command-execution-controller";

vi.mock("node:fs", async (original) => {
	const actual = await original<typeof fs>();
	return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});

it.each([
	false,
	true,
])("publishes detached log completion only after successful output flush (sink fails: %s)", async (sinkFails) => {
	let releaseWrite: (() => void) | undefined,
		flushing = false;
	let endRequested!: () => void;
	const ending = new Promise<void>((resolve) => {
		endRequested = resolve;
	});
	let logClosed!: () => void;
	const closed = new Promise<void>((resolve) => {
		logClosed = resolve;
	});
	const create = (await vi.importActual<typeof fs>("node:fs"))
		.createWriteStream;
	const spy = vi
		.mocked(fs.createWriteStream)
		.mockImplementation((path, options) => {
			if (!String(path).includes("cline-command-"))
				return create(path, options);
			const stream = new Writable({
				write(chunk, _encoding, done) {
					const write = () => {
						if (releaseWrite === write) releaseWrite = undefined;
						if (sinkFails) {
							done(new Error("Fixture log sink failed"));
							return;
						}
						fs.appendFileSync(path, chunk, { mode: 0o600 });
						done();
					};
					if (flushing) write();
					else releaseWrite = write;
				},
			});
			stream.once("close", logClosed);
			const end = stream.end.bind(stream);
			vi.spyOn(stream, "end").mockImplementation(
				(...args: Parameters<typeof stream.end>) => {
					const result = end(...args);
					endRequested();
					return result;
				},
			);
			return stream as ReturnType<typeof create>;
		});
	const controller = new RunCommandExecutionController();
	let ready!: () => void;
	const started = new Promise<void>((resolve) => {
		ready = resolve;
	});
	let outputReady = false,
		detachable = false,
		logDirectory: string | undefined;
	const executor = createShellExecutor({
		timeoutMs: null,
		executionController: controller,
		detachedLogRetentionMs: 60_000,
		processStartTokenProbe: (pid) => ({
			status: "found",
			token: `fixture-${pid}`,
		}),
	});
	const execution = executor(
		{
			command: process.execPath,
			args: [
				"-e",
				"process.stdout.write('ready');setTimeout(()=>{process.stdout.write('final output');process.exit(0)},500)",
			],
		},
		process.cwd(),
		{
			agentId: "fixture-agent",
			conversationId: "fixture-session",
			sessionId: "fixture-session",
			toolCallId: "fixture-call",
			iteration: 1,
			emitUpdate(update) {
				const value = update as { chunk?: string; detachable?: boolean };
				if (value.chunk?.includes("ready")) outputReady = true;
				if (value.detachable === true) detachable = true;
				if (outputReady && detachable) ready();
			},
		},
	);
	try {
		await started;
		expect(
			controller.proceedWhileRunning("fixture-session", "fixture-call"),
		).toBe(1);
		const result = await execution;
		const path = /Output will continue in (.+?)\]/.exec(result)?.[1];
		expect(path).toBeDefined();
		logDirectory = dirname(path!);
		await ending;
		expect(
			controller.observations("fixture-session")[0].execution,
		).toMatchObject({ state: "completed", exitCode: 0 });
		expect(fs.existsSync(join(logDirectory, "completed-at"))).toBe(false);
		flushing = true;
		releaseWrite!();
		await closed;
		if (sinkFails) {
			expect(fs.existsSync(join(logDirectory, "completed-at"))).toBe(false);
			expect(fs.existsSync(join(logDirectory, "active-command.json"))).toBe(
				true,
			);
			return;
		}
		await vi.waitFor(() =>
			expect(fs.existsSync(join(logDirectory!, "completed-at"))).toBe(true),
		);
		const text = await readFile(path!, "utf8");
		expect(text).toContain("ready");
		expect(text).toContain("final output");
		expect(text).toContain("[Command exited with code 0]");
	} finally {
		flushing = true;
		releaseWrite?.();
		spy.mockRestore();
		await execution.catch(() => {});
		if (logDirectory) await rm(logDirectory, { recursive: true, force: true });
	}
});
