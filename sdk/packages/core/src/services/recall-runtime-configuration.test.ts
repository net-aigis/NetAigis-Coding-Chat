import { expect, it } from "vitest";
import { readRuntimeRecallConfiguration } from "./recall-runtime-configuration";

it("does not select a default Recall endpoint, project, actor or model", () => {
	expect(
		readRuntimeRecallConfiguration({ RECALL_API_TOKEN: "fixture-only" }),
	).toBeUndefined();
});
it("uses the existing actor-to-token mapping without borrowing Hub credentials", async () => {
	const env = {
		CLINE_HUB_RECALL_URL: "http://recall-fixture.invalid:11436/",
		CLINE_HUB_RECALL_PROJECT: "existing-project",
		CLINE_HUB_RECALL_ACTOR: "Friseer",
		RECALL_ACTOR_TOKENS_JSON: JSON.stringify({
			Friseer: "fixture-Friseer",
			jimmi: "fixture-jimmi",
		}),
		CLINE_HUB_ACTOR_TOKENS_FILE: "/fixture/unrelated-login.json",
	};
	const options = readRuntimeRecallConfiguration(env)!;
	expect(await options.getConfiguration()).toMatchObject({
		actor: "Friseer",
		token: "fixture-Friseer",
		project: "existing-project",
		baseUrl: "http://recall-fixture.invalid:11436",
	});
	expect(options.actorTokens).toEqual({
		Friseer: "fixture-Friseer",
		jimmi: "fixture-jimmi",
	});
});
it("rejects partial or malformed settings without echoing any supplied credential", () => {
	expect(() =>
		readRuntimeRecallConfiguration({
			CLINE_HUB_RECALL_URL: "http://fixture.invalid",
		}),
	).toThrow("configuration is incomplete or invalid");
	const error = () =>
		readRuntimeRecallConfiguration({
			CLINE_HUB_RECALL_URL: "http://fixture.invalid",
			CLINE_HUB_RECALL_PROJECT: "project",
			CLINE_HUB_RECALL_ACTOR: "Friseer",
			RECALL_ACTOR_TOKENS_JSON: "fixture-credential-must-not-be-echoed",
		});
	expect(error).toThrow("credentials withheld");
	try {
		error();
	} catch (error) {
		expect(String(error)).not.toContain(
			"fixture-credential-must-not-be-echoed",
		);
	}
});

it("accepts only an explicit valid producer key, without deriving one from login or Recall tokens", async () => {
	const key = Buffer.alloc(32, 9);
	const env = {
		CLINE_HUB_RECALL_URL: "http://recall-fixture.invalid",
		CLINE_HUB_RECALL_PROJECT: "project",
		CLINE_HUB_RECALL_ACTOR: "Friseer",
		RECALL_API_TOKEN: "fixture-api-token",
	};
	expect(
		readRuntimeRecallConfiguration(env)?.archiveSigningKey,
	).toBeUndefined();
	expect(
		readRuntimeRecallConfiguration({
			...env,
			CLINE_HUB_RECALL_ARCHIVE_KEY: key.toString("base64url"),
		})?.archiveSigningKey,
	).toEqual(key);
	for (const value of [
		"",
		"invalid-key-must-not-echo",
		key.toString("base64"),
	]) {
		let error: unknown;
		try {
			readRuntimeRecallConfiguration({
				...env,
				CLINE_HUB_RECALL_ARCHIVE_KEY: value,
			});
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(Error);
		expect(String(error)).toContain("credentials withheld");
		if (value) expect(String(error)).not.toContain(value);
	}
});
