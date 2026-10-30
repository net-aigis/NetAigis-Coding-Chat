import { describe, expect, it } from "vitest";
import { LoopDetectionTracker } from "./loop-detection";

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
		expect(
			tracker.inspect({
				name: "run_commands",
				input: { commands: ["sleep 2"] },
			}).kind,
		).toBe("soft");
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
