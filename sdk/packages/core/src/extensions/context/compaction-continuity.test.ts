import type { MessageWithMetadata } from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import {
	createSessionCompactionState,
	projectSessionCompactionState,
} from "../../session/models/session-compaction";
import type { CoreCompactionContext } from "../../types/config";
import { runAgenticCompaction } from "./agentic-compaction";
import { runBasicCompaction } from "./basic-compaction";
import { createCompactionStateAwarePrepareTurn } from "./compaction";
import { withCompactionContinuity } from "./compaction-shared";

vi.mock("./summary-generation", () => ({
	generateSummary: vi.fn(async () => ({
		text: "Generic summary omitting original constraints and process states",
		reasoningChars: 0,
	})),
}));

const original =
	"Original: retain our independent fork; phases 1–3 are finished.";
const correction =
	"Correction: do not install or restart any productive service.";
const messages: MessageWithMetadata[] = [
	{
		id: "original",
		role: "user",
		content: original,
		metadata: { author: "Friseer" },
	},
	{ role: "assistant", content: "Decision recorded: repair worktree only." },
	{
		role: "assistant",
		content: [
			{
				type: "tool_use",
				id: "sleep-attempt",
				name: "run_commands",
				input: { commands: ["sleep 60"] },
			},
		],
	},
	{
		role: "user",
		content: [
			{
				type: "tool_result",
				tool_use_id: "sleep-attempt",
				name: "run_commands",
				content: JSON.stringify([
					{
						query: "sleep 60",
						result: "partial output",
						success: false,
						execution: { state: "unknown", observationFailed: true },
					},
				]),
			},
		],
	},
	{
		id: "correction",
		role: "user",
		content: correction,
		metadata: { author: "jimmi" },
	},
	{ role: "assistant", content: "Continue with the pending repair." },
	{
		id: "latest",
		role: "user",
		content: "Continue phase 4 with the same original task.",
	},
	{ role: "assistant", content: "Most recent work." },
];

const options = (history: MessageWithMetadata[]) => ({
	context: {
		agentId: "fixture",
		conversationId: "same-conversation",
		parentAgentId: null,
		iteration: 1,
		messages: history,
		model: { id: "local-model", provider: "openai-compatible" },
		mode: "manual",
		budget: {
			request: {
				inputTokens: 9000,
				maxInputTokens: 10000,
				triggerTokens: 9000,
				targetTokens: 7000,
				overheadTokens: 0,
				thresholdRatio: 0.9,
				utilizationRatio: 0.9,
			},
			messages: { inputTokens: 9000, triggerTokens: 9000, targetTokens: 7000 },
		},
	} satisfies CoreCompactionContext,
	providerConfig: {
		providerId: "openai-compatible",
		modelId: "local-model",
		modelInfo: { id: "local-model", maxInputTokens: 10000 },
	},
	preserveRecentTokens: 1,
	estimateMessageTokens: () => 100,
});
const compact = (history: MessageWithMetadata[]) =>
	runAgenticCompaction(options(history));

describe("deterministic compaction continuity", () => {
	it("does not promote an injected resumption hint to an original user instruction", () => {
		const history: MessageWithMetadata[] = [
			{ role: "user", content: "Actual original task" },
			{ role: "user", content: "[TASK RESUMPTION] guessed starting point" },
		];
		const projection = withCompactionContinuity(
			[{ role: "user", content: "summary" }],
			history,
		);
		expect(JSON.stringify(projection)).toContain("Actual original task");
		expect(JSON.stringify(projection)).not.toContain("guessed starting point");
	});

	it("does not duplicate records already rendered intact in a new summary", async () => {
		const compacted = await compact(messages);
		const projected = withCompactionContinuity(compacted!.messages, messages);
		expect(
			projected.filter(
				(message) => message.metadata?.kind === "task_continuity",
			),
		).toHaveLength(0);
		expect(JSON.stringify(projected)).toContain(original);
	});

	it("retains identical request occurrences without duplicating the live tail", () => {
		const repeated: MessageWithMetadata = {
			role: "user",
			content: "Same literal instruction",
		};
		const result = withCompactionContinuity([repeated], [repeated, repeated]);
		expect(
			(result[0].metadata?.continuity as { requests: unknown[] }).requests,
		).toHaveLength(1);
		expect(result[1]).toBe(repeated);
	});

	it("stops explicitly if mandatory records alone exceed the actual model budget", () => {
		const source: MessageWithMetadata[] = [
			{ role: "user", content: "literal original instruction ".repeat(1000) },
		];
		const before = JSON.stringify(source);
		expect(() =>
			withCompactionContinuity(
				[{ role: "user", content: "summary" }],
				source,
				100,
			),
		).toThrow("instructions were not silently truncated");
		expect(JSON.stringify(source)).toBe(before);
	});

	it("rebuilds one continuity projection without accumulating notices on repeated preparation", async () => {
		let state = createSessionCompactionState({
			sourceMessages: messages,
			compactedMessages: [{ role: "user", content: "summary" }],
		});
		const prepare = createCompactionStateAwarePrepareTurn({
			getState: () => state,
			prepareApiMessages: async (projection) => projection,
			compact: async (context) => ({ messages: context.messages }),
			saveState: (next) => {
				state = next;
			},
		});
		let size: number | undefined;
		for (let iteration = 1; iteration <= 5; iteration++) {
			const result = await prepare({
				...options(messages).context,
				iteration,
				apiMessages: messages,
				abortSignal: new AbortController().signal,
				systemPrompt: "fixture",
				tools: [],
			});
			expect(
				result!.messages.filter(
					(message) => message.metadata?.kind === "task_continuity",
				),
			).toHaveLength(1);
			const currentSize = JSON.stringify(result!.messages).length;
			if (size !== undefined) expect(currentSize).toBe(size);
			size = currentSize;
		}
	});

	it("rehydrates requests and command states when resuming an older generic sidecar", async () => {
		const state = createSessionCompactionState({
			sourceMessages: messages,
			compactedMessages: [{ role: "user", content: "Older generic summary" }],
		});
		const prepare = createCompactionStateAwarePrepareTurn({
			getState: () => state,
			prepareApiMessages: async (projection) => projection,
		});
		const result = await prepare({
			...options(messages).context,
			apiMessages: messages,
			abortSignal: new AbortController().signal,
			systemPrompt: "fixture",
			tools: [],
		});
		expect(JSON.stringify(result?.messages)).toContain(original);
		expect(JSON.stringify(result?.messages)).toContain(correction);
		expect(JSON.stringify(result?.messages)).toContain("sleep-attempt");
	});

	it("retains recorded process states in basic compaction as well", () => {
		const input = options(messages);
		input.context.budget.messages.targetTokens = 1000;
		const result = runBasicCompaction({
			...input,
			estimateMessageTokens: (message) => JSON.stringify(message).length,
		});
		expect(result).toBeDefined();
		expect(JSON.stringify(result!.messages)).toContain("unknown");
		expect(JSON.stringify(result!.messages)).toContain("observationFailed");
	});

	it("retains literal original requests, corrections and authors independently of the summary model", async () => {
		const result = await compact(messages);
		const summary = result!.messages[0];
		expect(JSON.stringify(summary.content)).toContain(original);
		expect(JSON.stringify(summary.content)).toContain(correction);
		expect(summary.metadata?.continuity).toMatchObject({
			requests: [
				expect.objectContaining({
					content: original,
					metadata: { author: "Friseer" },
				}),
				expect.objectContaining({
					content: correction,
					metadata: { author: "jimmi" },
				}),
			],
		});
	});

	it("keeps an unconfirmed process outcome distinct from completed work", async () => {
		const result = await compact(messages);
		expect(JSON.stringify(result!.messages[0].content)).toContain("unknown");
		expect(result!.messages[0].metadata?.continuity).toMatchObject({
			toolObservations: [
				expect.objectContaining({
					toolUseId: "sleep-attempt",
					query: "sleep 60",
					reportedSuccess: false,
					execution: { state: "unknown", observationFailed: true },
				}),
			],
		});
	});

	it("preserves these records through a second compaction and an actual JSON sidecar projection", async () => {
		const first = await compact(messages);
		const tail: MessageWithMetadata[] = [
			{ id: "later", role: "user", content: "Keep all previous constraints." },
			{ role: "assistant", content: "Pending work continues." },
		];
		const next = await compact([...first!.messages, ...tail]);
		const state = createSessionCompactionState({
			sourceMessages: [...messages, ...tail],
			compactedMessages: next!.messages,
		});
		const restored = projectSessionCompactionState(
			JSON.parse(JSON.stringify(state)),
			JSON.parse(JSON.stringify([...messages, ...tail])),
		);
		expect(JSON.stringify(restored)).toContain(original);
		expect(JSON.stringify(restored)).toContain(correction);
		expect(JSON.stringify(restored)).toContain("sleep-attempt");
		expect(JSON.stringify(messages)).toContain("partial output");
	});
});
