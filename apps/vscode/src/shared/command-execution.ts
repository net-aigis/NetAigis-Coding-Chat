/** Process evidence shared by extension and webview. Never infer an exit from stdout text. */

import {
	aggregateCommandObservations as aggregate,
	type CommandExecutionState,
	commandHasConfirmedExit,
	normalizeCommandObservation as observation,
	reconcileCommandExecution,
} from "@cline/shared"
import { COMMAND_OUTPUT_STRING } from "./combineCommandSequences"
import type { ClineMessage } from "./ExtensionMessage"

export type { CommandExecution, CommandExecutionState, CommandObservation } from "@cline/shared"
export { commandHasConfirmedExit, extractCommandExecution, mergeCommandObservationJournals } from "@cline/shared"

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
		blocked: "Blocked",
		executed: "Executed",
	}[state]
}

export function reconcileCommandMessage(
	message: ClineMessage,
	sessionId: string,
	journal: unknown,
	history = false,
): ClineMessage {
	if (message.say !== "command" || !Array.isArray(message.commandExecution?.commands)) return message
	const commandExecution = reconcileCommandExecution(message.commandExecution, sessionId, journal, history)
	if (JSON.stringify(commandExecution) === JSON.stringify(message.commandExecution)) return message
	return { ...message, commandExecution, commandCompleted: commandHasConfirmedExit(commandExecution) }
}
