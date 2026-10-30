import { expect, test } from "vitest";
import { streamText } from "ai";
import { netaigisConversation } from "../netaigis-conversation";
import { createOpenAICompatibleProviderModule } from "./openai-compatible";

// NETAIGIS_CONVERSATION_WIRE_TEST_V1
test("NetAigis session context survives real provider streaming", async () => {
    const originalFetch = globalThis.fetch;
    const seen: Array<string | null> = [];

    globalThis.fetch = async (_input, init) => {
        seen.push(new Headers(init?.headers).get("X-AI-Conversation"));

        const chunks = [
            {
                id: "netaigis-test",
                object: "chat.completion.chunk",
                choices: [{
                    index: 0,
                    delta: { content: "OK" },
                    finish_reason: null,
                }],
            },
            {
                id: "netaigis-test",
                object: "chat.completion.chunk",
                choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: "stop",
                }],
            },
        ];

        return new Response(
            chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
                "data: [DONE]\n\n",
            {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            },
        );
    };

    try {
        const config = {
            baseUrl: "http://192.168.178.43:11436/v1",
            apiKey: "test-key",
        };

        const context = {
            provider: { id: "openai-compatible" },
            model: { id: "test-model" },
        };

        const result = await createOpenAICompatibleProviderModule(
            config as never,
            context as never,
        );

        async function check(id: string | undefined) {
            const response = netaigisConversation.run(id, () =>
                streamText({
                    model: result.operations.language("test-model"),
                    prompt: "Test",
                }),
            );

            // Start the lazy AI SDK request and inspect the actual HTTP call.
            // A header alone is insufficient: the complete mocked provider
            // stream must parse successfully on the upgraded AI SDK as well.
            expect(await response.text).toBe("OK");

            expect(seen.at(-1)).toBe(id ?? null);
        }

        await check("netaigis-session-A");
        await check("netaigis-session-B");
        await check(undefined);

        console.log("NETAIGIS_HEADERS:", JSON.stringify(seen));

        expect(seen).toEqual([
            "netaigis-session-A",
            "netaigis-session-B",
            null,
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
