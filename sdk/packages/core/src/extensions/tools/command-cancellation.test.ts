import type { AgentToolContext } from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import {
	createBuiltinTools,
	createShellExecutor,
	createShellTool,
} from "../../index";

const context: AgentToolContext = {
	agentId: "command-regression",
	conversationId: "isolated-regression",
	iteration: 1,
};
const pendingCommand = {
	command: process.execPath,
	args: [
		"-e",
		"require('node:fs').writeSync(1,'retained stdout'); require('node:fs').writeSync(2,'retained stderr'); setInterval(() => {}, 1000)",
	],
};

describe("command cancellation contract", () => {
	it("retains both streams and distinguishes a timeout without inventing an exit code", async () => {
		const executor = createShellExecutor({ timeoutMs: 500 });
		const error = await executor(pendingCommand, process.cwd(), context).catch(
			(e: unknown) => e,
		);
		expect(error).toMatchObject({
			name: "CommandTimeoutError",
			output: expect.stringContaining("retained stdout"),
			execution: { state: "timed_out", terminationConfirmed: true },
		});
		expect(error).toHaveProperty(
			"output",
			expect.stringContaining("retained stderr"),
		);
		expect(error).not.toHaveProperty("exitCode");
	});

	it("retains received output when the caller aborts and finishes process cleanup", async () => {
		const abort = new AbortController();
		const executor = createShellExecutor({ timeoutMs: 3000 });
		const error = await executor(pendingCommand, process.cwd(), {
			...context,
			signal: abort.signal,
			emitUpdate(update) {
				if ((update as { chunk?: string }).chunk?.includes("retained stderr"))
					abort.abort();
			},
		}).catch((e: unknown) => e);
		expect(error).toMatchObject({
			name: "AbortError",
			execution: { state: "aborted", terminationConfirmed: true },
		});
		expect(error).toHaveProperty(
			"output",
			expect.stringContaining("retained stdout"),
		);
		expect(error).toHaveProperty(
			"output",
			expect.stringContaining("retained stderr"),
		);
		expect(error).not.toHaveProperty("exitCode");
	});

	it("cancels the executor when the public tool deadline expires and preserves its output", async () => {
		let signal: AbortSignal | undefined;
		const executor = vi.fn(async (_command: unknown, _cwd: string, ctx: AgentToolContext) => {
			signal = ctx.signal;
			ctx.emitUpdate?.({ stream: "stdout", chunk: "already received" });
			return new Promise<string>((_resolve, reject) => {
				ctx.signal?.addEventListener(
					"abort",
					() => reject(new Error("executor aborted")),
					{ once: true },
				);
			});
		});
		const tool = createShellTool(executor, { bashTimeoutMs: 20 });
		const result = await tool.execute({ commands: ["fixture"] }, context);
		expect(signal?.aborted).toBe(true);
		expect(result[0]).toMatchObject({
			success: false,
			result: expect.stringContaining("already received"),
			execution: { state: "timed_out" },
		});
	});

	it("returns the real timeout and buffered output across the public builtin boundary", async () => {
		const tool = createBuiltinTools({ bashTimeoutMs: 500 }).find(
			(t) => t.name === "run_commands",
		)!;
		const result = await tool.execute({ commands: [pendingCommand] }, context);
		expect(result).toMatchObject([
			{
				success: false,
				result: expect.stringContaining("retained stdout"),
				execution: { state: "timed_out", terminationConfirmed: true },
			},
		]);
		expect(result).toMatchObject([
			{ result: expect.stringContaining("retained stderr") },
		]);
	});
});
