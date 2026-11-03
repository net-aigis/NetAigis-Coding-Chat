import { expect, it } from "vitest";
import { formatTurnSummary } from "./turn-summary";

it("does not claim zero consumption when a completed turn omits telemetry", () => {
	expect(formatTurnSummary("completed", 1)).toBe(
		"Turn ended (completed) • iterations=1 • input=nicht gemeldet output=nicht gemeldet",
	);
});
it("preserves measured zero and independently reports missing or invalid counters", () => {
	expect(formatTurnSummary("aborted", 2, { inputTokens: 0, outputTokens: 7 })).toContain("input=0 output=7");
	expect(formatTurnSummary("completed", 1, { inputTokens: 123 })).toContain("input=123 output=nicht gemeldet");
	for (const outputTokens of [NaN, Infinity, -1]) {
		expect(formatTurnSummary("error", 1, { outputTokens })).toContain("output=nicht gemeldet");
	}
});
