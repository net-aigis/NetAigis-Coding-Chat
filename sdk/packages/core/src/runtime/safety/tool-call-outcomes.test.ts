import { describe, expect, it } from "vitest";
import {
	buildReusedToolResult,
	M23_M24_COMMAND,
	ToolCallOutcomeStore,
	toolCallFingerprint,
} from "./tool-call-outcomes";

describe("ToolCallOutcomeStore (P0 M23/M24)", () => {
	it("fingerprints the M23/M24 command stably", () => {
		const a = toolCallFingerprint("run_commands", {
			commands: [M23_M24_COMMAND],
		});
		const b = toolCallFingerprint("run_commands", {
			commands: [M23_M24_COMMAND],
		});
		expect(a).toBe(b);
		expect(a.startsWith("run:")).toBe(true);
	});

	it("reuses a completed result instead of allowing a second execution", () => {
		const store = new ToolCallOutcomeStore();
		const input = { commands: [M23_M24_COMMAND] };
		store.recordCompleted("run_commands", input, "call_m23_first", {
			results: [{ stdout: "6\n2\n", execution: { state: "completed" } }],
		});
		const prior = store.lookup("run_commands", input);
		expect(prior?.kind).toBe("completed");
		expect(prior?.toolCallId).toBe("call_m23_first");
		const reused = buildReusedToolResult(prior!);
		expect(reused).toMatchObject({
			status: "completed",
			reason: "reused_prior_result",
			priorToolCallId: "call_m23_first",
			execution: { state: "executed" },
		});
		expect(String(reused.summary)).not.toContain("15 errors");
	});

	it("escalates on a second identical block without duplicating full error text", () => {
		const store = new ToolCallOutcomeStore();
		const input = { commands: [M23_M24_COMMAND] };
		const first = store.recordBlocked("run_commands", input, "call_block_1", {
			status: "blocked",
			reason: "identical_tool_call",
			summary: "Blocked identical run_commands (×2)",
		});
		expect(first.escalate).toBe(false);
		const second = store.recordBlocked("run_commands", input, "call_block_2", {
			status: "blocked",
			reason: "identical_tool_call",
			summary: "Blocked identical run_commands (×2)",
		});
		expect(second.escalate).toBe(true);
		expect(second.stored.modelPayload).toMatchObject({
			status: "blocked",
			reason: "identical_tool_call_deduped",
			priorToolCallId: "call_block_1",
		});
		const dumped = JSON.stringify(second.stored.modelPayload);
		expect(dumped).not.toContain("MUST change approach");
		expect(dumped.length).toBeLessThan(500);
	});
});
