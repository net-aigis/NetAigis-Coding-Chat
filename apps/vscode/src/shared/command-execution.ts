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
	observedAtMs?: number
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
		...(Number.isSafeInteger(raw.observedAtMs) ? { observedAtMs: Number(raw.observedAtMs) } : {}),
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

/** A projection cache, not a process authority or a second persistent store. */
export function mergeCommandObservationJournals(previous: unknown, next: unknown, sessionId: string): unknown {
	const entries = new Map<string, Record<string, unknown>>()
	for (const journal of [previous, next]) {
		const raw = record(journal)
		if (raw.version !== 1 || !Array.isArray(raw.entries)) continue
		for (const value of raw.entries) {
			const entry = record(value)
			if (
				entry.source !== "child_process" ||
				entry.sessionId !== sessionId ||
				typeof entry.executionId !== "string" ||
				!entry.executionId ||
				typeof entry.runtimeInstanceId !== "string" ||
				!entry.runtimeInstanceId ||
				!Number.isSafeInteger(entry.sequence) ||
				Number(entry.sequence) < 1 ||
				!Number.isSafeInteger(record(entry.execution).observedAtMs)
			)
				continue
			const old = entries.get(entry.executionId)
			if (
				old &&
				(old.runtimeInstanceId !== entry.runtimeInstanceId ||
					Number(old.sequence) >= Number(entry.sequence) ||
					commandHasConfirmedExit({ state: "unknown", commands: [observation(old.execution)] }))
			)
				continue
			entries.set(entry.executionId, entry)
		}
	}
	return { version: 1, entries: [...entries.values()] }
}

export function reconcileCommandMessage(
	message: ClineMessage,
	sessionId: string,
	journal: unknown,
	history = false,
): ClineMessage {
	if (message.say !== "command" || !Array.isArray(message.commandExecution?.commands)) return message
	const validated = record(mergeCommandObservationJournals(undefined, journal, sessionId)).entries as Record<string, unknown>[]
	const commands = message.commandExecution.commands.map((old) => {
		const entry = validated.find(
			(candidate) =>
				candidate.executionId === old.executionId &&
				(old.pid === undefined || old.pid === record(candidate.execution).pid) &&
				Number(record(candidate.execution).observedAtMs) >= (old.observedAtMs ?? 0),
		)
		const current = entry ? observation({ ...record(entry.execution), executionId: entry.executionId }) : undefined
		// Only an actual terminal observation can resolve a historical running result.
		if (current && commandHasConfirmedExit({ state: current.state, commands: [current] })) return current
		if (history && old.state === "running") return { ...old, state: "unknown" as const }
		return old
	})
	const commandExecution = { state: aggregate(commands), commands }
	if (JSON.stringify(commandExecution) === JSON.stringify(message.commandExecution)) return message
	return { ...message, commandExecution, commandCompleted: commandHasConfirmedExit(commandExecution) }
}
