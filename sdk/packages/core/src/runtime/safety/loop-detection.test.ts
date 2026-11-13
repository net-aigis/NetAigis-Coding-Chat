import { describe, expect, it } from "vitest";
import {
	buildBlockedToolStatus,
	checkRepeatedToolCall,
	createLoopDetectionState,
	LoopDetectionTracker,
} from "./loop-detection";

describe("softThreshold clamp (P0)", () => {
	it("never soft-blocks the first distinct call even if softThreshold is 1", () => {
		const state = createLoopDetectionState();
		const first = checkRepeatedToolCall(
			state,
			"run_commands",
			"run:a",
			{ softThreshold: 1, hardThreshold: 2 },
		);
		expect(first).toMatchObject({
			softWarning: false,
			hardEscalation: false,
			skipCall: false,
		});
		const second = checkRepeatedToolCall(
			state,
			"run_commands",
			"run:a",
			{ softThreshold: 1, hardThreshold: 2 },
		);
		expect(second.softWarning).toBe(true);
		expect(second.hardEscalation).toBe(false);
	});

	it("buildBlockedToolStatus keeps model context short and structured", () => {
		const status = buildBlockedToolStatus({
			toolName: "run_commands",
			count: 2,
			kind: "soft",
			toolCallId: "tc-1",
		});
		expect(status).toMatchObject({
			status: "blocked",
			reason: "identical_tool_call",
			tool: "run_commands",
			toolCallId: "tc-1",
		});
		expect(String(status.summary).length).toBeLessThan(200);
		expect(JSON.stringify(status)).not.toContain("MUST change approach");
	});
});

describe("wait-only tool loop guard", () => {
	it("counts changing sleep durations as the same nonproductive operation", () => {
		const tracker = new LoopDetectionTracker({
			softThreshold: 2,
			hardThreshold: 3,
		});
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: ["sleep 1"] },
			}).kind,
		).toBe("ok");
		// 2nd identical wait poll: soft-skip + recovery (no second dump).
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: ["sleep 2"] },
			}),
		).toMatchObject({ kind: "soft", skip: true });
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: ["sleep 3"] },
			}),
		).toMatchObject({ kind: "hard", skip: true });
	});

	it("recognizes structured sleep arguments without executing a command", () => {
		const tracker = new LoopDetectionTracker({ hardThreshold: 2 });
		tracker.inspect({
			name: "run_commands",
			input: { commands: [{ command: "/bin/sleep", args: [".5s"] }] },
		});
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: [{ command: "sleep", args: ["2"] }] },
			}).skip,
		).toBe(true);
	});

	it("does not collapse a command with an actual operation into a sleep loop", () => {
		const tracker = new LoopDetectionTracker({ hardThreshold: 2 });
		tracker.inspect({ name: "run_commands", input: { commands: ["sleep 1"] } });
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: ["sleep 2", "git status --short"] },
			}).skip,
		).toBe(false);
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: ["sleep 3"] },
			}).skip,
		).toBe(false);
	});
});
