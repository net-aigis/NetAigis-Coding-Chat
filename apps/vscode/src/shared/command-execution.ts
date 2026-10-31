/** Process evidence shared by extension and webview. Never infer an exit from stdout text. */
import { COMMAND_OUTPUT_STRING } from "./combineCommandSequences"
import type { ClineMessage } from "./ExtensionMessage"

export type CommandExecutionState =
	| "running"
	| "completed"
	| "failed"
	| "terminated"
	| "aborted"
	| "timed_out"
	| "unknown"
	| "observation_failed"
	| "not_started"
export interface CommandObservation {
	state: CommandExecutionState
	exitCode?: number
	signal?: string
	terminationConfirmed?: boolean
	observationFailed?: boolean
	executionId?: string
	pid?: number
}
export interface CommandExecution {
	state: CommandExecutionState
	commands: CommandObservation[]
}
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
function observation(value: unknown): CommandObservation {
	const raw = record(value)
	let state = raw.state as CommandExecutionState
	if (
		![
			"running",
			"completed",
			"failed",
			"terminated",
			"aborted",
			"timed_out",
			"unknown",
			"observation_failed",
			"not_started",
		].includes(state)
	)
		state = "unknown"
	const exitCode = Number.isSafeInteger(raw.exitCode) ? Number(raw.exitCode) : undefined
	const signal = typeof raw.signal === "string" && raw.signal ? raw.signal : undefined
	if (raw.observationFailed === true) state = "observation_failed"
	else if (state === "completed") state = exitCode === undefined ? "unknown" : exitCode === 0 ? "completed" : "failed"
	else if (state === "failed" && exitCode === undefined) state = "unknown"
	else if (["aborted", "timed_out"].includes(state) && raw.terminationConfirmed !== true) state = "unknown"
	else if (state === "terminated" && !signal) state = "unknown"
	return {
		state,
		...(exitCode === undefined ? {} : { exitCode }),
		...(signal ? { signal } : {}),
		...(raw.terminationConfirmed === true ? { terminationConfirmed: true } : {}),
		...(raw.observationFailed === true ? { observationFailed: true } : {}),
		...(typeof raw.executionId === "string" ? { executionId: raw.executionId } : {}),
		...(Number.isSafeInteger(raw.pid) ? { pid: Number(raw.pid) } : {}),
	}
}
function aggregate(commands: CommandObservation[]): CommandExecutionState {
	if (!commands.length) return "unknown"
	for (const state of [
		"observation_failed",
		"unknown",
		"running",
		"failed",
		"timed_out",
		"aborted",
		"terminated",
		"not_started",
	] as const)
		if (commands.some((command) => command.state === state)) return state
	return "completed"
}
export function extractCommandExecution(output: unknown): CommandExecution {
	const rows = Array.isArray(output)
		? output
		: Array.isArray(record(output).results)
			? (record(output).results as unknown[])
			: output && typeof output === "object"
				? [output]
				: []
	const commands = rows.map((row) => observation(record(row).execution))
	return { state: aggregate(commands), commands }
}
export function commandHasConfirmedExit(execution: CommandExecution): boolean {
	return (
		execution.commands.length > 0 &&
		execution.commands.every((command) =>
			["completed", "failed", "terminated", "aborted", "timed_out"].includes(observation(command).state),
		)
	)
}
export function commandUiState(
	message: Pick<ClineMessage, "commandExecution" | "commandCompleted" | "partial" | "text">,
): CommandExecutionState | "pending" {
	if (message.commandExecution)
		return Array.isArray(message.commandExecution.commands)
			? aggregate(message.commandExecution.commands.map(observation))
			: "unknown"
	// Older completion flags carry no numeric exit proof. Do not invent one on reload.
	if (message.partial === true && !message.commandCompleted) {
		const text = message.text ?? "",
			marker = text.indexOf(COMMAND_OUTPUT_STRING)
		return marker >= 0 && text.slice(marker + COMMAND_OUTPUT_STRING.length).trim() ? "running" : "pending"
	}
	return "unknown"
}
export function commandStatusText(state: ReturnType<typeof commandUiState>): string {
	return {
		running: "Running",
		pending: "Pending",
		completed: "Completed",
		failed: "Failed",
		terminated: "Terminated",
		aborted: "Aborted",
		timed_out: "Timed out",
		unknown: "Status unknown",
		observation_failed: "Observation failed",
		not_started: "Not started",
	}[state]
}
