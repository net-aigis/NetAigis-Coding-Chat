import { describe, expect, it } from "vitest";
import { includeConfiguredModel } from "./configured-model-catalog";

describe("configured endpoint model catalog", () => {
	it("keeps a manually configured local model selectable without a bundled entry", () => {
		const bundled = [{ id: "gpt-4o", name: "GPT-4o" }];
		expect(includeConfiguredModel(bundled, "local-interchangeable-model")).toEqual([
			{ id: "local-interchangeable-model", name: "local-interchangeable-model" },
			...bundled,
		]);
		expect(bundled).toHaveLength(1);
	});
	it("preserves authoritative metadata and avoids duplicate entries", () => {
		const models = [{ id: "local", name: "Local", supportsReasoning: true }];
		expect(includeConfiguredModel(models, "local")).toBe(models);
	});
	it("does not invent a default model when none is configured", () => {
		const models: [] = [];
		expect(includeConfiguredModel(models, undefined)).toBe(models);
		expect(includeConfiguredModel(models, "  ")).toBe(models);
	});
});
