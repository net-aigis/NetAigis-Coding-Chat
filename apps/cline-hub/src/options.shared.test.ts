import { describe, expect, it } from "vitest";
import { resolveClineHubServerOptions } from "./options";

describe("explicit shared runtime configuration", () => {
	it("retains an explicitly selected endpoint and separate credential", () => {
		expect(
			resolveClineHubServerOptions({
				HOST: "127.0.0.1",
				CLINE_SHARED_SESSION_HUB_ENDPOINT: "wss://fixture.invalid/hub",
				CLINE_SHARED_SESSION_HUB_TOKEN: "fixture-key",
			}).sessionHub,
		).toEqual({
			endpoint: "wss://fixture.invalid/hub",
			authToken: "fixture-key",
		});
	});
	it.each([
		{ CLINE_SHARED_SESSION_HUB_ENDPOINT: "ws://fixture.invalid/hub" },
		{ CLINE_SHARED_SESSION_HUB_TOKEN: "fixture-key" },
		{
			CLINE_SHARED_SESSION_HUB_ENDPOINT:
				"ws://fixture.invalid/hub?token=fixture-key",
			CLINE_SHARED_SESSION_HUB_TOKEN: "fixture-key",
		},
	])("rejects incomplete or URL-embedded credentials without echoing them (%#)", (value) => {
		expect(() =>
			resolveClineHubServerOptions({ HOST: "127.0.0.1", ...value }),
		).toThrow("shared session");
		try {
			resolveClineHubServerOptions({ HOST: "127.0.0.1", ...value });
		} catch (error) {
			expect(String(error)).not.toContain("fixture-key");
		}
	});
});
