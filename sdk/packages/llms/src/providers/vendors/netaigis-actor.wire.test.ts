/** Real provider adapter, stubbed HTTP. No model service is contacted. */
import { streamText } from "ai";
import { expect, it, vi } from "vitest";
import {
	getNetaigisActor,
	netaigisConversation,
	withNetaigisActor,
} from "../netaigis-conversation";
import { createOpenAICompatibleProviderModule } from "./openai-compatible";

function answer(): Response {
	return new Response(
		'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: {"id":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
		{ headers: { "content-type": "text/event-stream" } },
	);
}
it("keeps two authenticated actors separate on one session across interchangeable model IDs", async () => {
	const seen: Array<{
		user: string | null;
		conversation: string | null;
		model: string;
		retained: string | null;
	}> = [];
	const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		seen.push({
			user: headers.get("X-AI-User"),
			conversation: headers.get("X-AI-Conversation"),
			model: JSON.parse(String(init?.body)).model,
			retained: headers.get("X-Fixture"),
		});
		await Promise.resolve();
		return answer();
	});
	vi.stubGlobal("fetch", fetchStub);
	try {
		const provider = await createOpenAICompatibleProviderModule(
			{
				baseUrl: "http://127.0.0.1:11436/v1",
				apiKey: "fixture-key",
				headers: { "X-AI-User": "Friseer", "X-Fixture": "retained" },
			} as never,
			{
				provider: { id: "openai-compatible" },
				model: { id: "configured-model" },
			} as never,
		);
		await Promise.all(
			[
				["Friseer", "model-before-change"],
				["jimmi", "model-after-change"],
			].map(([actor, model]) =>
				withNetaigisActor(actor, () =>
					netaigisConversation.run("one-shared-session", async () => {
						const result = streamText({
							model: provider.operations.language(model),
							prompt: "fixture",
						});
						expect(await result.text).toBe("OK");
					}),
				),
			),
		);
		expect(seen).toEqual(
			expect.arrayContaining([
				{
					user: "Friseer",
					conversation: "one-shared-session",
					model: "model-before-change",
					retained: "retained",
				},
				{
					user: "jimmi",
					conversation: "one-shared-session",
					model: "model-after-change",
					retained: "retained",
				},
			]),
		);
		expect(getNetaigisActor()).toBeUndefined();
	} finally {
		vi.unstubAllGlobals();
	}
});
it.each([
	"http://127.0.0.1:11435/v1",
	"http://127.0.0.1:11436/other",
])("does not send scoped actor/conversation headers outside the existing Coding-Agent route %s", async (baseUrl) => {
	let headers = new Headers();
	vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
		headers = new Headers(init?.headers);
		return answer();
	});
	try {
		const provider = await createOpenAICompatibleProviderModule(
			{ baseUrl, apiKey: "fixture-key" } as never,
			{
				provider: { id: "openai-compatible" },
				model: { id: "model" },
			} as never,
		);
		await withNetaigisActor("jimmi", () =>
			netaigisConversation.run("session", async () => {
				expect(
					await streamText({
						model: provider.operations.language("model"),
						prompt: "fixture",
					}).text,
				).toBe("OK");
			}),
		);
		expect(headers.has("X-AI-User")).toBe(false);
		expect(headers.has("X-AI-Conversation")).toBe(false);
	} finally {
		vi.unstubAllGlobals();
	}
});
it("clears inherited actor identity in an unsigned scope and refuses unsafe header values", async () => {
	await withNetaigisActor("Friseer", async () => {
		await Promise.resolve();
		expect(getNetaigisActor()).toBe("Friseer");
		withNetaigisActor(undefined, () =>
			expect(getNetaigisActor()).toBeUndefined(),
		);
		expect(getNetaigisActor()).toBe("Friseer");
	});
	for (const actor of ["", " jimmy", "jimmi\r\nX-Forged: actor", "Friseer\t"])
		expect(() => withNetaigisActor(actor, () => {})).toThrow(
			"Invalid authenticated actor",
		);
	expect(getNetaigisActor()).toBeUndefined();
});
