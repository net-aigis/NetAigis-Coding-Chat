import { describe, expect, it, vi } from "vitest";
import { RunCommandExecutionController } from "./run-command-execution-controller";

describe("RunCommandExecutionController", () => {
	it("continues detaching matching commands after one command fails", () => {
		const controller = new RunCommandExecutionController();
		const successfulDetach = vi.fn(() => true);
		const otherSessionDetach = vi.fn(() => true);
		controller.register({
			executionId: "failing",
			sessionId: "session-1",
			toolCallId: "call-1",
			detach: () => {
				throw new Error("log unavailable");
			},
		});
		controller.register({
			executionId: "successful",
			sessionId: "session-1",
			toolCallId: "call-1",
			detach: successfulDetach,
		});
		controller.register({
			executionId: "other-session",
			sessionId: "session-2",
			toolCallId: "call-1",
			detach: otherSessionDetach,
		});

		expect(controller.proceedWhileRunning("session-1", "call-1")).toBe(1);
		expect(successfulDetach).toHaveBeenCalledOnce();
		expect(otherSessionDetach).not.toHaveBeenCalled();
	});
});

it("retains a detached process until its own confirmed exit, with immutable observations and a persistence gate", async () => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const write = vi.fn(async () => {
		await held;
	});
	const controller = new RunCommandExecutionController(write);
	controller.observe({
		sessionId: "s",
		toolCallId: "t",
		executionId: "e",
		execution: { state: "running", pid: 42, observedAtMs: 10 },
	});
	const running = controller.observations("s");
	let flushed = false;
	const flush = controller.flush("s").then(() => {
		flushed = true;
	});
	await Promise.resolve();
	expect(flushed).toBe(false);
	release();
	await flush;
	controller.observe({
		sessionId: "s",
		toolCallId: "t",
		executionId: "e",
		execution: { state: "completed", pid: 42, exitCode: 0, observedAtMs: 20 },
	});
	await controller.flush("s");
	expect(controller.observations("s")[0].execution).toMatchObject({
		state: "completed",
		exitCode: 0,
	});
	expect(running[0].execution).toEqual({
		state: "running",
		pid: 42,
		observedAtMs: 10,
	});
	expect(controller.observations("other")).toEqual([]);
	// A stale progress callback cannot overwrite terminal evidence.
	controller.observe({
		sessionId: "s",
		toolCallId: "t",
		executionId: "e",
		execution: { state: "running", pid: 42, observedAtMs: 30 },
	});
	expect(controller.observations("s")[0].execution.state).toBe("completed");
});

it("fails a durable status read if the observation could not be persisted", async () => {
	const controller = new RunCommandExecutionController(async () => {
		throw new Error("fixture disk unavailable");
	});
	controller.observe({
		sessionId: "s",
		executionId: "e",
		execution: { state: "running", pid: 42, observedAtMs: 10 },
	});
	await expect(controller.flush("s")).rejects.toThrow(
		"fixture disk unavailable",
	);
});
