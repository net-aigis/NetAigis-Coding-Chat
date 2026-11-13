import type { ConsecutiveMistakeLimitContext } from "./types";

/**
 * The sentence the desktop shows when the task stops. The phone reads the
 * same string from the shared transcript, so the two screens do not diverge.
 */
export function visibleMistakeLimitText(
	input: Pick<
		ConsecutiveMistakeLimitContext,
		"consecutiveMistakes" | "reason" | "details" | "iteration"
	>,
): string {
	const details = input.details?.trim();
	const latest = details
		? `${input.reason}: ${details}`
		: `${input.reason} at iteration ${input.iteration}`;
	return `NetAigis Coding Chat ran into ${input.consecutiveMistakes} errors in a row and stopped the task.\n\nLatest: ${latest}\n\nSend a message to give NetAigis Coding Chat guidance and continue the task.`;
}
