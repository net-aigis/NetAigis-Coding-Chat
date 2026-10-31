import { expect, it } from "vitest";
import { assertSnapshotImportComplete } from "../../session/snapshot-import-state";
import {
	hasUnconfirmedRuntimeOwner,
	hasUnresolvedCommandObservation,
} from "./command-observations";

it("treats lost legacy and current owner state as unknown, while undefined optional metadata stays absent", () => {
	expect(
		hasUnconfirmedRuntimeOwner({ runtimeOwnerObservation: undefined }),
	).toBe(false);
	expect(() =>
		assertSnapshotImportComplete({ runtimeSnapshotImport: undefined }),
	).not.toThrow();
	for (const metadata of [
		{
			terminal_marker_source: "stale_session_reconciler",
			terminal_marker: "failed_external_process_exit",
		},
		{
			runtimeOwnerObservation: {
				version: 1,
				state: "unknown",
				exitConfirmed: false,
			},
		},
		{
			runtimeOwnerObservation: { version: 1, state: "completed", exitCode: 0 },
		},
		{ runtimeOwnerObservation: null },
	])
		expect(hasUnconfirmedRuntimeOwner(metadata)).toBe(true);
});

const messages = [
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
				content: [
					{
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
const entry = {
	sessionId: "s",
	executionId: "exec",
	toolCallId: "call",
	source: "child_process",
	runtimeInstanceId: "runtime",
	sequence: 2,
	execution: { state: "completed", pid: 42, exitCode: 0, observedAtMs: 20 },
};
it("reconciles only the matching process's confirmed later exit", () => {
	const check = (value: unknown) =>
		hasUnresolvedCommandObservation(
			messages,
			{ version: 1, entries: [value] },
			"s",
		);
	expect(check(entry)).toBe(false);
	for (const changed of [
		{ executionId: "other" },
		{ toolCallId: "other" },
		{ sessionId: "other" },
		{ source: "client" },
		{ runtimeInstanceId: "" },
		{ execution: { ...entry.execution, pid: 43 } },
		{ execution: { ...entry.execution, observedAtMs: 9 } },
		{ execution: { state: "completed", observedAtMs: 20 } },
	])
		expect(check({ ...entry, ...changed })).toBe(true);
	expect(
		hasUnresolvedCommandObservation(
			[],
			{
				version: 1,
				entries: [
					{ ...entry, execution: { state: "running", observedAtMs: 20 } },
				],
			},
			"s",
		),
	).toBe(true);
	expect(hasUnresolvedCommandObservation(messages)).toBe(true);
});
it("keeps lost process state unknown and rejects damaged journals", () => {
	for (const journal of [
		null,
		{},
		{ version: 2, entries: [] },
		{ version: 1, entries: [null] },
	])
		expect(hasUnresolvedCommandObservation([], journal, "s")).toBe(true);
});
