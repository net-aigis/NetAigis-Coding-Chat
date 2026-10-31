import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolContext } from "@cline/shared";
import { describe, expect, it } from "vitest";
import {
	CommandSpawnError,
	CommandTerminationError,
	createBuiltinTools,
	createShellExecutor,
} from "../../index";
import { RunCommandExecutionController } from "./executors/run-command-execution-controller";

const context: AgentToolContext = {
	agentId: "agent-1",
	conversationId: "conversation-1",
	iteration: 1,
};

describe("public shell error boundary", () => {
	it("returns pending process evidence rather than success when the user proceeds while it still runs", async () => {
		const controller = new RunCommandExecutionController();
		const abort = new AbortController();
		let ready!: () => void, exited!: () => void;
		const canDetach = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const didExit = new Promise<void>((resolve) => {
			exited = resolve;
		});
		let detachable = false,
			hasOutput = false,
			pid = 0;
		const tool = createBuiltinTools({
			executorOptions: {
				bash: { timeoutMs: null, executionController: controller },
			},
		}).find((candidate) => candidate.name === "run_commands");
		if (!tool) throw new Error("Expected shell tool");
		const execution = tool.execute(
			{
				commands: [
					{
						command: process.execPath,
						args: [
							"-e",
							"process.stdout.write('ready'); setTimeout(()=>{},2000)",
						],
					},
				],
			},
			{
				...context,
				sessionId: "pending-session",
				toolCallId: "pending-call",
				signal: abort.signal,
				emitUpdate(update) {
					const value = update as {
						detachable?: boolean;
						chunk?: string;
						execution?: { state?: string; pid?: number; exitCode?: number };
					};
					if (value.detachable) detachable = true;
					if (value.chunk?.includes("ready")) hasOutput = true;
					if (value.execution?.pid) pid = value.execution.pid;
					if (detachable && hasOutput) ready();
					if (
						value.execution?.state === "completed" &&
						value.execution.exitCode === 0
					)
						exited();
				},
			},
		);
		try {
			await canDetach;
			expect(
				controller.proceedWhileRunning("pending-session", "pending-call"),
			).toBe(1);
			const result = await execution;
			expect(result).toMatchObject([
				{
					success: false,
					pending: true,
					execution: { state: "running", detached: true, pid },
				},
			]);
			expect(
				(result as Array<{ execution: unknown }>)[0].execution,
			).not.toHaveProperty("exitCode");
			expect(() => process.kill(pid, 0)).not.toThrow();
			await didExit;
			expect(
				(result as Array<{ execution: { state: string } }>)[0].execution.state,
			).toBe("running");
		} finally {
			abort.abort();
			await Promise.resolve(execution).catch(() => {});
		}
	});
	it("rejects at the executor but returns a failed run_commands result for a missing shell", async () => {
		const shell = join(tmpdir(), `cline-missing-shell-${randomUUID()}`);
		const executor = createShellExecutor({ shell });
		const error = await executor("echo ok", process.cwd(), context).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(CommandSpawnError);
		expect(error).toMatchObject({ code: "ENOENT", missing: "executable" });
		expect(error).not.toHaveProperty("exitCode");

		const tool = createBuiltinTools({ shell, cwd: process.cwd() }).find(
			(candidate) => candidate.name === "run_commands",
		);
		if (!tool) throw new Error("Expected run_commands tool");
		await expect(
			tool.execute({ commands: ["echo ok"] }, context),
		).resolves.toEqual([
			{
				query: "echo ok",
				result: "",
				error: expect.stringContaining("Failed to execute command:"),
				success: false,
			},
		]);
	});

	it.skipIf(process.platform === "win32")(
		"preserves signal termination and captured output across the public tool boundary",
		async () => {
			const command = {
				command: process.execPath,
				args: [
					"-e",
					"require('node:fs').writeSync(1, 'partial output'); require('node:fs').writeSync(2, 'partial error'); process.kill(process.pid, 'SIGTERM')",
				],
			};
			const executor = createShellExecutor();
			const error = await executor(command, process.cwd(), context).catch(
				(caught: unknown) => caught,
			);
			expect(error).toBeInstanceOf(CommandTerminationError);
			expect(error).not.toHaveProperty("exitCode");
			expect(error).toHaveProperty(
				"output",
				expect.stringContaining("partial output"),
			);

			const tool = createBuiltinTools({ cwd: process.cwd() }).find(
				(candidate) => candidate.name === "run_commands",
			);
			if (!tool) throw new Error("Expected run_commands tool");
			await expect(
				tool.execute({ commands: [command] }, context),
			).resolves.toEqual([
				{
					query: expect.any(String),
					result:
						"[Command terminated by signal SIGTERM]\npartial output\n[stderr]\npartial error",
					error: "Command terminated by signal SIGTERM",
					success: false,
					execution: { state: "terminated", signal: "SIGTERM" },
				},
			]);
		},
	);
});
