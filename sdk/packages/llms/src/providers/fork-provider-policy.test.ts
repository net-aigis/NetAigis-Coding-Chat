import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDER_MANIFESTS_BY_ID } from "./builtins";

const preserved = JSON.parse(
	readFileSync(
		new URL("./__fixtures__/fork-provider-defaults.json", import.meta.url),
		"utf8",
	),
);

describe("independent fork integration policy", () => {
	it("preserves every existing default model and provider endpoint", () => {
		const actual = Object.fromEntries(
			Object.entries(BUILTIN_PROVIDER_MANIFESTS_BY_ID).map(([id, provider]) => [
				id,
				{
					defaultModelId: provider.defaultModelId ?? null,
					api: provider.api ?? null,
				},
			]),
		);
		expect(actual).toEqual(preserved);
	});

	it("keeps upstream provenance separate from an unapproved fork release", () => {
		const provenance = JSON.parse(
			readFileSync(
				new URL("../../../../../fork-provenance.json", import.meta.url),
				"utf8",
			),
		);
		expect(provenance.repository).toBe(
			"https://git.wittmer.software/AIGIS/cline.git",
		);
		expect(provenance.upstream.tag).toBe("v4.1.26");
		expect(provenance.forkReleaseVersion).toBeNull();
		expect(provenance.monitoring.insideCline).toBe(false);
	});
});
