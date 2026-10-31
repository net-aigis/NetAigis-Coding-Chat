import { describe, expect, it } from "vitest"
import { COMMAND_OUTPUT_STRING } from "./combineCommandSequences"
import {
	commandHasConfirmedExit,
	commandStatusText,
	commandUiState,
	extractCommandExecution,
	mergeCommandObservationJournals,
	reconcileCommandMessage,
} from "./command-execution"
import type { ClineMessage } from "./ExtensionMessage"

describe("factual command status projection", () => {
	it("does not invent exit zero from success, stdout or a legacy completion flag", () => {
		const execution = extractCommandExecution([{ success: true, result: "tests passed" }])
		expect(execution).toEqual({ state: "unknown", commands: [{ state: "unknown" }] })
		expect(commandHasConfirmedExit(execution)).toBe(false)
		expect(commandUiState({ commandCompleted: true, partial: false })).toBe("unknown")
		expect(extractCommandExecution('{"execution":{"state":"completed","exitCode":0}}').state).toBe("unknown")
	})
	it.each([0, 1])("preserves actual numeric exit %s without trusting a contradictory success flag", (exitCode) => {
		const execution = extractCommandExecution([{ success: true, execution: { state: "completed", exitCode } }])
		expect(execution.state).toBe(exitCode === 0 ? "completed" : "failed")
		expect(execution.commands[0].exitCode).toBe(exitCode)
		expect(commandHasConfirmedExit(execution)).toBe(true)
	})
	it("keeps a command batch running while any process still runs and preserves each exit separately", () => {
		const execution = extractCommandExecution([
			{ execution: { state: "completed", exitCode: 0 } },
			{ execution: { state: "running", pid: 123 } },
		])
		expect(execution.state).toBe("running")
		expect(commandHasConfirmedExit(execution)).toBe(false)
		expect(execution.commands[1]).not.toHaveProperty("exitCode")
	})
	it.each(["aborted", "timed_out"])("distinguishes requested %s from confirmed termination", (state) => {
		expect(extractCommandExecution([{ execution: { state } }]).state).toBe("unknown")
		const confirmed = extractCommandExecution([{ execution: { state, terminationConfirmed: true } }])
		expect(confirmed.state).toBe(state)
		expect(commandHasConfirmedExit(confirmed)).toBe(true)
		expect(confirmed.commands[0]).not.toHaveProperty("exitCode")
	})
	it("keeps a signal and observation failure distinct from success", () => {
		const signalled = extractCommandExecution([{ execution: { state: "terminated", signal: "SIGTERM" } }])
		expect(signalled.state).toBe("terminated")
		expect(signalled.commands[0]).not.toHaveProperty("exitCode")
		const failed = extractCommandExecution([{ execution: { state: "unknown", observationFailed: true } }])
		expect(failed.state).toBe("observation_failed")
		expect(commandStatusText(failed.state)).toBe("Observation failed")
		expect(commandHasConfirmedExit(failed)).toBe(false)
	})
	it("keeps an empty output marker pending without inventing a running process", () => {
		expect(commandUiState({ partial: true, text: `command\n${COMMAND_OUTPUT_STRING}\n` })).toBe("pending")
		expect(commandUiState({ partial: true, text: `command\n${COMMAND_OUTPUT_STRING}\nline` })).toBe("running")
	})
	it("rejects absent/string exit codes and incomplete stored projections", () => {
		for (const exitCode of [undefined, "0", Number.NaN])
			expect(extractCommandExecution([{ execution: { state: "completed", exitCode } }]).state).toBe("unknown")
		expect(commandUiState({ commandExecution: { state: "completed" } as never })).toBe("unknown")
	})
})

describe("later runtime observations without rewriting history", () => {
	it("refreshes a live unknown observation without treating the same stored running record as proof of liveness", () => {
		const message: ClineMessage = {
			ts: 1,
			type: "say",
			say: "command",
			text: "retained",
			commandExecution: {
				state: "unknown",
				commands: [{ state: "unknown", executionId: "exec", pid: 42, observedAtMs: 10 }],
			},
		}
		const journal = {
			version: 1,
			entries: [
				{
					source: "child_process",
					sessionId: "session",
					runtimeInstanceId: "runtime",
					sequence: 2,
					executionId: "exec",
					execution: { state: "running", pid: 42, observedAtMs: 20 },
				},
			],
		}
		expect(reconcileCommandMessage(message, "session", journal).commandExecution?.state).toBe("running")
		expect(reconcileCommandMessage(message, "session", journal, true).commandExecution?.state).toBe("unknown")
	})
	const pending: ClineMessage = {
		ts: 42,
		type: "say",
		say: "command",
		text: "kept output",
		partial: false,
		commandCompleted: false,
		commandExecution: { state: "running", commands: [{ state: "running", executionId: "exec", pid: 123, observedAtMs: 10 }] },
	}
	const entry = {
		sessionId: "session",
		source: "child_process",
		runtimeInstanceId: "runtime",
		sequence: 2,
		executionId: "exec",
		execution: { state: "completed", exitCode: 0, pid: 123, observedAtMs: 20 },
	}
	it("projects only a matching later confirmed exit and leaves the input untouched", () => {
		const journal = { version: 1, entries: [entry] }
		const projected = reconcileCommandMessage(pending, "session", journal, true)
		expect(projected.commandExecution?.state).toBe("completed")
		expect(projected.commandCompleted).toBe(true)
		expect(projected.text).toBe("kept output")
		expect(pending.commandExecution?.state).toBe("running")
		for (const changed of [
			{ sessionId: "foreign" },
			{ executionId: "other" },
			{ source: "client" },
			{ execution: { ...entry.execution, pid: 124 } },
			{ execution: { ...entry.execution, observedAtMs: 9 } },
			{ execution: { state: "completed", observedAtMs: 20 } },
		])
			expect(
				reconcileCommandMessage(pending, "session", { version: 1, entries: [{ ...entry, ...changed }] }, true)
					.commandExecution?.state,
			).toBe("unknown")
	})
	it("does not claim an old running record is still alive when reopening history", () => {
		expect(reconcileCommandMessage(pending, "session", undefined, true).commandExecution?.state).toBe("unknown")
		expect(reconcileCommandMessage(pending, "session", undefined)).toBe(pending)
	})
	it("retains confirmed evidence across old snapshots, and never merges another runtime into the same execution", () => {
		const final = { version: 1, entries: [entry] }
		const stale = { version: 1, entries: [{ ...entry, sequence: 1, execution: { state: "running", observedAtMs: 10 } }] }
		const merged = mergeCommandObservationJournals(final, stale, "session")
		expect(reconcileCommandMessage(pending, "session", merged).commandExecution?.state).toBe("completed")
		const old = mergeCommandObservationJournals(
			stale,
			{ version: 1, entries: [{ ...entry, runtimeInstanceId: "other" }] },
			"session",
		)
		expect(reconcileCommandMessage(pending, "session", old).commandExecution?.state).toBe("running")
	})
})
