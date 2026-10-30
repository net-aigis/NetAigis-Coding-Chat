import { zodToJsonSchema } from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import { normalizeRunCommandsInput, withTimeout } from "./helpers";
import { RunCommandsInputSchema } from "./schemas";

describe("normalizeRunCommandsInput", () => {
	it("accepts the documented shapes", () => {
		expect(normalizeRunCommandsInput({ commands: ["ls", "pwd"] })).toEqual([
			"ls",
			"pwd",
		]);
		expect(normalizeRunCommandsInput({ commands: "ls" })).toEqual(["ls"]);
		expect(normalizeRunCommandsInput(["ls"])).toEqual(["ls"]);
		expect(normalizeRunCommandsInput("ls")).toEqual(["ls"]);
		expect(normalizeRunCommandsInput({ command: "ls" })).toEqual(["ls"]);
		expect(
			normalizeRunCommandsInput({ command: "git", args: ["status"] }),
		).toEqual([{ command: "git", args: ["status"] }]);
	});

	it.each([
		{ label: "an object with an empty commands list", input: { commands: [] } },
		{ label: "a bare empty list", input: [] },
	])("rejects $label instead of reporting an empty success", ({ input }) => {
		expect(() => normalizeRunCommandsInput(input)).toThrow(
			"run_commands requires at least one command",
		);
	});
});

describe("RunCommandsInputSchema", () => {
	it("advertises the command list as non-empty", () => {
		const schema = zodToJsonSchema(RunCommandsInputSchema) as {
			properties: { commands: { minItems?: number } };
		};
		expect(schema.properties.commands.minItems).toBe(1);
	});
});

describe("tool deadline cleanup", () => {
	it("releases the timeout after a tool has already settled", async () => {
		vi.useFakeTimers();
		try {
			await expect(withTimeout(Promise.resolve("done"), 30_000, "expired")).resolves.toBe("done");
			expect(vi.getTimerCount()).toBe(0);
			await expect(withTimeout(Promise.reject(new Error("failed")), 30_000, "expired")).rejects.toThrow("failed");
			expect(vi.getTimerCount()).toBe(0);
		} finally { vi.useRealTimers(); }
	});
});
