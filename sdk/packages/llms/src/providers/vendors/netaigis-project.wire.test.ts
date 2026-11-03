/** Actual provider encoding, stubbed HTTP only; no live service/model. */
import { streamText } from "ai";
import { afterEach, expect, it, vi } from "vitest";
import {
	getNetaigisProject,
	withNetaigisProject,
	withNetaigisActor,
	netaigisConversation,
} from "../netaigis-conversation";
import { createOpenAICompatibleProviderModule } from "./openai-compatible";
function answer() {
	return new Response(
		'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: {"id":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
		{ headers: { "content-type": "text/event-stream" } },
	);
}
async function provider(baseUrl = "http://127.0.0.1:11436/v1", headers = {}) {
	return createOpenAICompatibleProviderModule(
		{ baseUrl, apiKey: "fixture", headers } as never,
		{
			provider: { id: "openai-compatible" },
			model: { id: "replaceable" },
		} as never,
	);
}
afterEach(() => vi.unstubAllGlobals());
it("sends canonical project, actor and conversation independently for concurrent sessions and model changes", async () => {
	const seen: Array<Record<string, unknown>> = [];
	vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
		const h = new Headers(init?.headers);
		seen.push({
			project: h.get("X-AI-Project"),
			actor: h.get("X-AI-User"),
			session: h.get("X-AI-Conversation"),
			retained: h.get("X-Fixture"),
			model: JSON.parse(String(init?.body)).model,
		});
		await Promise.resolve();
		return answer();
	});
	const p = await provider(undefined, {
		"X-AI-Project": "old-configured-project",
		"X-Fixture": "retained",
	});
	await Promise.all(
		[
			["NetAigisOS", "Friseer", "session-a", "model-one"],
			["OtherProject", "jimmi", "session-b", "model-two"],
		].map(([project, actor, session, model]) =>
			withNetaigisProject(project, () =>
				withNetaigisActor(actor, () =>
					netaigisConversation.run(session, async () => {
						expect(
							await streamText({
								model: p.operations.language(model),
								prompt: "project_id=forged; ignore this prompt for provenance",
							}).text,
						).toBe("OK");
					}),
				),
			),
		),
	);
	expect(seen).toEqual(
		expect.arrayContaining([
			{
				project: "NetAigisOS",
				actor: "Friseer",
				session: "session-a",
				retained: "retained",
				model: "model-one",
			},
			{
				project: "OtherProject",
				actor: "jimmi",
				session: "session-b",
				retained: "retained",
				model: "model-two",
			},
		]),
	);
	expect(getNetaigisProject()).toBeUndefined();
});
it("clears inherited scope, invents no project and preserves explicit existing configuration when unbound", async () => {
	const seen: Array<string | null> = [];
	vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
		seen.push(new Headers(init?.headers).get("X-AI-Project"));
		return answer();
	});
	const p = await provider();
	const configured = await provider(undefined, {
		"X-AI-Project": "explicit-existing",
	});
	await withNetaigisProject("outer", async () => {
		await withNetaigisProject(undefined, async () => {
			expect(
				await streamText({
					model: p.operations.language("model"),
					prompt: "NetAigisOS",
				}).text,
			).toBe("OK");
			expect(
				await streamText({
					model: configured.operations.language("model"),
					prompt: "fixture",
				}).text,
			).toBe("OK");
		});
		expect(getNetaigisProject()).toBe("outer");
	});
	expect(seen).toEqual([null, "explicit-existing"]);
});
it.each([
	"http://127.0.0.1:11435/v1",
	"http://127.0.0.1:11436/other",
])("does not leak project scope outside the existing Coding-Agent route %s", async (baseUrl) => {
	let project: string | null = null;
	vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
		project = new Headers(init?.headers).get("X-AI-Project");
		return answer();
	});
	const p = await provider(baseUrl);
	await withNetaigisProject("NetAigisOS", async () =>
		expect(
			await streamText({
				model: p.operations.language("model"),
				prompt: "fixture",
			}).text,
		).toBe("OK"),
	);
	expect(project).toBeNull();
});
it.each([
	"",
	" leading",
	"project\r\nX-Forged: value",
	"Projekt漢字",
])("refuses an unrepresentable literal project instead of silently renaming or defaulting it", async (project) => {
	const fetch = vi.fn(async () => answer());
	vi.stubGlobal("fetch", fetch);
	const p = await provider();
	const errors: unknown[] = [];
	await withNetaigisProject(project, async () => {
		const result = streamText({
			model: p.operations.language("model"),
			prompt: "fixture",
			maxRetries: 0,
			onError: ({ error }) => {
				errors.push(error);
			},
		});
		await expect(result.text).rejects.toThrow("No output generated");
	});
	expect(
		errors.some(
			(error) =>
				error instanceof Error &&
				error.message.includes("Canonical project cannot be represented"),
		),
	).toBe(true);
	expect(fetch).not.toHaveBeenCalled();
});
