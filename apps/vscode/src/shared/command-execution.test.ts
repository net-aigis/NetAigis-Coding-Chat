import { describe, expect, it } from "vitest"
import { COMMAND_OUTPUT_STRING } from "./combineCommandSequences"
import { commandHasConfirmedExit, commandStatusText, commandUiState, extractCommandExecution } from "./command-execution"

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
