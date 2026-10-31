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
