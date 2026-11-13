import {
	isConfirmedCommandExit,
	type RuntimeCommandObservation,
} from "../../extensions/tools/executors/run-command-execution-controller";

/** Process observations shared by resume admission and authenticated handover. */
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export const RUNTIME_OWNER_METADATA_FIELDS = [
	"runtimeOwnerObservation",
	"terminal_marker",
	"terminal_marker_at",
	"terminal_marker_pid",
	"terminal_marker_source",
] as const;

/**
 * True when a live owner may still exist and resume must not invent an exit.
 * False when the owner is confirmed gone — including after a host crash where
 * the stale-session reconciler recorded `runtime_pid_unavailable` / failed
 * external process exit. Those markers used to block every interactive resume
 * (Retry loop); they mean "abandon and continue", not "wait for waitpid".
 */
export function hasUnconfirmedRuntimeOwner(
	metadata: Record<string, unknown> | null | undefined,
): boolean {
	if (!metadata) return false;
	const value = record(metadata.runtimeOwnerObservation);
	if (
		value.version === 1 &&
		value.state === "terminated" &&
		value.terminationConfirmed === true
	)
		return false;
	const staleAbandoned =
		metadata.terminal_marker_source === "stale_session_reconciler" &&
		metadata.terminal_marker === "failed_external_process_exit";
	const pidUnavailable =
		value.reason === "runtime_pid_unavailable" ||
		(value.state === "unknown" && value.exitConfirmed === false);
	if (staleAbandoned || pidUnavailable) return false;
	return metadata.runtimeOwnerObservation !== undefined;
}

export function assertRuntimeOwnerConfirmed(
	metadata: Record<string, unknown> | null | undefined,
): void {
	if (hasUnconfirmedRuntimeOwner(metadata))
		throw new Error(
			"Runtime owner exit is unconfirmed; saved work was retained without automatic replay",
		);
}
/** The runtime-only metadata is protected from remote session.update/create writes. */
export function readCommandObservationJournal(
	value: unknown,
	sessionId: string,
): RuntimeCommandObservation[] {
	if (value === undefined) return [];
	const journal = record(value);
	if (journal.version !== 1 || !Array.isArray(journal.entries))
		throw new Error("Invalid command observation journal");
	for (const raw of journal.entries) {
		const entry = record(raw);
		if (
			entry.sessionId !== sessionId ||
			entry.source !== "child_process" ||
			typeof entry.executionId !== "string" ||
			!entry.executionId ||
			typeof entry.runtimeInstanceId !== "string" ||
			!entry.runtimeInstanceId ||
			!Number.isSafeInteger(entry.sequence) ||
			Number(entry.sequence) < 1 ||
			!Number.isSafeInteger(record(entry.execution).observedAtMs)
		)
			throw new Error("Invalid command observation entry");
	}
	return structuredClone(journal.entries) as RuntimeCommandObservation[];
}

/** Explicit unknown/running observations and unfinished tool calls block a handover. */
export function hasUnresolvedCommandObservation(
	messages: readonly unknown[],
	journal?: unknown,
	sessionId = "",
): boolean {
	let observations: RuntimeCommandObservation[];
	try {
		observations = readCommandObservationJournal(journal, sessionId);
	} catch {
		return true;
	}
	// Unfinished owned processes block transfer even if their tool result is not yet saved.
	if (observations.some((entry) => !isConfirmedCommandExit(entry.execution)))
		return true;
	const pending = new Map<string, string>();
	for (const raw of messages) {
		const m = record(raw);
		if (!Array.isArray(m.content)) continue;
		for (const rawPart of m.content) {
			const part = record(rawPart);
			const callId = part.id ?? part.toolCallId;
			if (
				(part.type === "tool_use" || part.type === "tool-call") &&
				typeof callId === "string"
			)
				pending.set(callId, String(part.name ?? part.toolName));
			if (part.type !== "tool_result" && part.type !== "tool-result") continue;
			const id = String(part.tool_use_id ?? part.toolCallId ?? ""),
				name = String(part.name ?? part.toolName ?? pending.get(id) ?? "");
			pending.delete(id);
			if (!["run_commands", "bash", "execute_command"].includes(name)) continue;
			let content = part.content ?? part.output ?? part.result;
			if (
				Array.isArray(content) &&
				content.every((part) => record(part).type === "text")
			)
				content = content.map((p) => record(p).text ?? "").join("");
			if (typeof content === "string") {
				try {
					content = JSON.parse(content);
				} catch {
					content = undefined;
				}
			}
			const matchingExit = observations.some(
				(entry) =>
					entry.toolCallId === id && isConfirmedCommandExit(entry.execution),
			);
			const output = record(content),
				results = Array.isArray(content)
					? content
					: Array.isArray(output.results)
						? output.results
						: [output];
			if (!results.length && !matchingExit) return true;
			for (const result of results) {
				const resultRecord = record(result);
				const execution = record(resultRecord.execution);
				// Legacy text and empty records cannot prove an exit. The protected
				// journal may independently identify this exact tool call's processes.
				if (!Object.keys(execution).length && matchingExit) continue;
				const confirmed = observations.find(
					(entry) =>
						entry.executionId === execution.executionId &&
						entry.toolCallId === id &&
						(execution.pid === undefined ||
							execution.pid === entry.execution.pid) &&
						entry.execution.observedAtMs! >=
							Number(execution.observedAtMs ?? 0) &&
						isConfirmedCommandExit(entry.execution),
				);
				if (confirmed) continue;
				if (
					execution.state === "not_started" &&
					execution.pid === undefined &&
					execution.observationFailed !== true
				)
					continue;
				// "Proceed while running" leaves state=unknown + detached without a
				// later waitpid. After a host restart that is abandoned work, not a
				// live process fence — admit resume instead of Retry loops.
				if (execution.state === "unknown" && execution.detached === true)
					continue;
				// Explicit empty `execution: {}` has no pid/state to wait on.
				// Blocking resume only produces Retry loops after host restarts.
				// Missing execution on legacy/unstructured results still fences.
				if (
					Object.keys(execution).length === 0 &&
					Object.hasOwn(resultRecord, "execution")
				)
					continue;
				// Tool-level validation failures never started a process. Keeping
				// them unresolved forces Retry loops with nothing to waitpid.
				if (
					typeof resultRecord.error === "string" &&
					resultRecord.error.length > 0 &&
					!Object.hasOwn(resultRecord, "execution") &&
					!Array.isArray(resultRecord.results)
				)
					continue;
				if (
					!isConfirmedCommandExit({
						...execution,
						exitCode: execution.exitCode ?? resultRecord.exitCode,
					} as RuntimeCommandObservation["execution"])
				)
					return true;
			}
		}
	}
	return pending.size > 0;
}
