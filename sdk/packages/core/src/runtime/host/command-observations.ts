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

/** Losing a runtime owner is not a waitpid result for that owner or its tools. */
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
	return (
		metadata.runtimeOwnerObservation !== undefined ||
		(metadata.terminal_marker_source === "stale_session_reconciler" &&
			metadata.terminal_marker === "failed_external_process_exit")
	);
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
				const execution = record(record(result).execution);
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
				if (
					!isConfirmedCommandExit({
						...execution,
						exitCode: execution.exitCode ?? record(result).exitCode,
					} as RuntimeCommandObservation["execution"])
				)
					return true;
			}
		}
	}
	return pending.size > 0;
}
