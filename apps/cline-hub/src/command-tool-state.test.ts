import { expect, it } from "vitest";
import {
	reconcileBrowserCommandMessages,
	toolEventExecution,
} from "./command-tool-state";
import { mapHistoryToWebviewMessages } from "./server/session-mapping";

const history = [
	{
		id: "request",
		role: "assistant",
		content: [
			{
				type: "tool_use",
				id: "call",
				name: "run_commands",
				input: { commands: ["fixture-only"] },
			},
		],
	},
	{
		id: "result",
		role: "user",
		content: [
			{
				type: "tool_result",
				tool_use_id: "call",
				content: [
					{
						result: "partial output retained",
						pending: true,
						success: false,
						execution: {
							state: "running",
							executionId: "exec",
							pid: 42,
							observedAtMs: 10,
						},
					},
				],
			},
		],
	},
];
const journal = (execution: Record<string, unknown>) => ({
	version: 1,
	entries: [
		{
			source: "child_process",
			sessionId: "session",
			runtimeInstanceId: "runtime",
			sequence: 2,
			executionId: "exec",
			toolCallId: "call",
			execution: { observedAtMs: 20, pid: 42, ...execution },
		},
	],
});
it("history does not claim a persisted running process is currently alive, and later actual exit resolves that same row", () => {
	const original = structuredClone(history);
	const mapped = mapHistoryToWebviewMessages(history);
	expect(mapped[0].toolEvents?.[0]).toMatchObject({
		toolCallId: "call",
		execution: { state: "unknown" },
	});
	const confirmed = reconcileBrowserCommandMessages(
		mapped,
		"session",
		journal({ state: "completed", exitCode: 0 }),
	);
	expect(confirmed[0].id).toBe(mapped[0].id);
	expect(confirmed[0].toolEvents?.[0]).toMatchObject({
		execution: { state: "completed", commands: [{ exitCode: 0 }] },
		output: expect.arrayContaining([
			expect.objectContaining({
				result: "partial output retained",
				execution: {
					state: "running",
					executionId: "exec",
					pid: 42,
					observedAtMs: 10,
				},
				pending: true,
				success: false,
			}),
		]),
	});
	expect(
		confirmed[0].blocks?.find((block) => block.type === "tool"),
	).toMatchObject({ toolEvent: { execution: { state: "completed" } } });
	expect(history).toEqual(original);
	const stale = structuredClone(confirmed);
	stale[0].toolEvents![0].execution = {
		state: "running",
		commands: [
			{ state: "running", executionId: "exec", pid: 42, observedAtMs: 10 },
		],
	};
	const reconciled = reconcileBrowserCommandMessages(
		stale,
		"session",
		journal({ state: "completed", exitCode: 0 }),
	);
	expect(reconciled[0].toolEvents?.[0].execution?.state).toBe("completed");
	expect(reconciled[0].id).toBe(mapped[0].id);
});
it("uses a protected matching journal for legacy result text without parsing stdout as process proof", () => {
	const legacy = [
		{
			role: "assistant",
			content: [{ type: "tool_use", id: "call", name: "run_commands" }],
		},
		{
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "call",
					content: '{"execution":{"state":"completed","exitCode":0}}',
				},
			],
		},
	];
	const unproven = mapHistoryToWebviewMessages(legacy);
	expect(unproven[0].toolEvents?.[0].execution?.state).toBe("unknown");
	const proven = mapHistoryToWebviewMessages(legacy, {
		sessionId: "session",
		journal: journal({ state: "failed", exitCode: 7 }),
	});
	expect(proven[0].toolEvents?.[0].execution?.state).toBe("failed");
	expect(proven[0].toolEvents?.[0].output).toBe(
		'{"execution":{"state":"completed","exitCode":0}}',
	);
});
it("keeps the command status independent of generic tool-end and legacy completion labels", () => {
	expect(
		toolEventExecution({
			toolName: "run_commands",
			status: "completed",
			output: { success: true },
		})?.state,
	).toBe("unknown");
	expect(toolEventExecution(undefined, "run_commands")?.state).toBe("unknown");
	expect(
		toolEventExecution({ toolName: "read_files", status: "completed" }),
	).toBeUndefined();
});

it("does not revive a buffered running observation after a transport failure", () => {
	const mapped = mapHistoryToWebviewMessages(history);
	const live = reconcileBrowserCommandMessages(
		mapped,
		"session",
		journal({ state: "running" }),
	);
	expect(live[0].toolEvents?.[0].execution?.state).toBe("running");
	const disconnected = reconcileBrowserCommandMessages(
		live,
		"session",
		journal({ state: "running" }),
		true,
	);
	expect(disconnected[0].toolEvents?.[0].execution?.state).toBe("unknown");
});
