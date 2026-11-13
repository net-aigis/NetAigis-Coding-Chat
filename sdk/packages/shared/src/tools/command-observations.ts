/** Browser-safe projection of structured process evidence; never parse stdout as proof. */
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
	| "blocked"
	| "executed";
export interface CommandObservation {
	state: CommandExecutionState;
	exitCode?: number;
	signal?: string;
	terminationConfirmed?: boolean;
	observationFailed?: boolean;
	executionId?: string;
	pid?: number;
	observedAtMs?: number;
}
export interface CommandExecution {
	state: CommandExecutionState;
	commands: CommandObservation[];
}

export function isCommandTool(name: string | undefined): boolean {
	return ["run_commands", "bash", "execute_command"].includes(name ?? "");
}
export function commandExecutionStatusText(
	state: CommandExecutionState,
): string {
	return {
		running: "Running",
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
	}[state];
}
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export function normalizeCommandObservation(
	value: unknown,
): CommandObservation {
	const raw = record(value);
	let state = raw.state as CommandExecutionState;
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
			"blocked",
			"executed",
		].includes(state)
	)
		state = "unknown";
	const exitCode = Number.isSafeInteger(raw.exitCode)
		? Number(raw.exitCode)
		: undefined;
	const signal =
		typeof raw.signal === "string" && raw.signal ? raw.signal : undefined;
	if (raw.observationFailed === true) state = "observation_failed";
	else if (state === "completed")
		state =
			exitCode === undefined
				? "unknown"
				: exitCode === 0
					? "completed"
					: "failed";
	else if (state === "failed" && exitCode === undefined) state = "unknown";
	else if (
		["aborted", "timed_out"].includes(state) &&
		raw.terminationConfirmed !== true
	)
		state = "unknown";
	else if (state === "terminated" && !signal) state = "unknown";
	return {
		state,
		...(exitCode === undefined ? {} : { exitCode }),
		...(signal ? { signal } : {}),
		...(raw.terminationConfirmed === true
			? { terminationConfirmed: true }
			: {}),
		...(raw.observationFailed === true ? { observationFailed: true } : {}),
		...(typeof raw.executionId === "string"
			? { executionId: raw.executionId }
			: {}),
		...(Number.isSafeInteger(raw.pid) ? { pid: Number(raw.pid) } : {}),
		...(Number.isSafeInteger(raw.observedAtMs)
			? { observedAtMs: Number(raw.observedAtMs) }
			: {}),
	};
}
export function aggregateCommandObservations(
	commands: CommandObservation[],
): CommandExecutionState {
	if (!commands.length) return "unknown";
	for (const state of [
		"observation_failed",
		"unknown",
		"running",
		"failed",
		"timed_out",
		"aborted",
		"terminated",
		"blocked",
		"not_started",
		"executed",
	] as const)
		if (commands.some((command) => command.state === state)) return state;
	return "completed";
}
export function extractCommandExecution(output: unknown): CommandExecution {
	const top = record(output);
	// Soft loop-block payload: { status: "blocked", execution: { state: "blocked" } }
	if (top.status === "blocked") {
		const blocked = normalizeCommandObservation(
			top.execution ?? { state: "blocked" },
		);
		return {
			state: "blocked",
			commands: [{ ...blocked, state: "blocked" }],
		};
	}
	const rows = Array.isArray(output)
		? output
		: Array.isArray(top.results)
			? (top.results as unknown[])
			: output && typeof output === "object"
				? [output]
				: [];
	const commands = rows.map((row) =>
		normalizeCommandObservation(record(row).execution),
	);
	return { state: aggregateCommandObservations(commands), commands };
}
export function commandHasConfirmedExit(execution: CommandExecution): boolean {
	return (
		execution.commands.length > 0 &&
		execution.commands.every((command) =>
			["completed", "failed", "terminated", "aborted", "timed_out"].includes(
				normalizeCommandObservation(command).state,
			),
		)
	);
}
/** A projection cache, not a process authority or a second persistent store. */
export function mergeCommandObservationJournals(
	previous: unknown,
	next: unknown,
	sessionId: string,
): unknown {
	const entries = new Map<string, Record<string, unknown>>();
	for (const journal of [previous, next]) {
		const raw = record(journal);
		if (raw.version !== 1 || !Array.isArray(raw.entries)) continue;
		for (const value of raw.entries) {
			const entry = record(value);
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
				continue;
			const old = entries.get(entry.executionId);
			if (
				old &&
				(old.runtimeInstanceId !== entry.runtimeInstanceId ||
					Number(old.sequence) >= Number(entry.sequence) ||
					commandHasConfirmedExit({
						state: "unknown",
						commands: [normalizeCommandObservation(old.execution)],
					}))
			)
				continue;
			entries.set(entry.executionId, entry);
		}
	}
	return { version: 1, entries: [...entries.values()] };
}

export function reconcileCommandExecution(
	execution: CommandExecution,
	sessionId: string,
	journal: unknown,
	history = false,
): CommandExecution {
	const validated = record(
		mergeCommandObservationJournals(undefined, journal, sessionId),
	).entries as Record<string, unknown>[];
	const commands = execution.commands.map((old) => {
		if (
			commandHasConfirmedExit({
				state: old.state,
				commands: [normalizeCommandObservation(old)],
			})
		)
			return old;
		const entry = validated.find(
			(candidate) =>
				candidate.executionId === old.executionId &&
				(old.pid === undefined ||
					old.pid === record(candidate.execution).pid) &&
				Number(record(candidate.execution).observedAtMs) >=
					(old.observedAtMs ?? 0),
		);
		const current = entry
			? normalizeCommandObservation({
					...record(entry.execution),
					executionId: entry.executionId,
				})
			: undefined;
		// A live protected observation may refresh current state. Historical running
		// records never establish liveness; confirmed terminal evidence is immutable.
		if (
			current &&
			(commandHasConfirmedExit({ state: current.state, commands: [current] }) ||
				!history ||
				current.state !== "running")
		)
			return current;
		if (history && old.state === "running")
			return { ...old, state: "unknown" as const };
		return old;
	});
	const commandExecution = {
		state: aggregateCommandObservations(commands),
		commands,
	};
	return commandExecution;
}

/** The protected runtime journal may identify a legacy tool result without parsing its text. */
export function projectCommandExecution(
	output: unknown,
	sessionId: string,
	toolCallId: string | undefined,
	journal?: unknown,
	history = false,
): CommandExecution {
	const validated = record(
		mergeCommandObservationJournals(undefined, journal, sessionId),
	).entries as Record<string, unknown>[];
	const matching = toolCallId
		? validated.filter((entry) => entry.toolCallId === toolCallId)
		: [];
	const observed = extractCommandExecution(output);
	const initial =
		matching.length &&
		observed.commands.every(
			(command) => command.state === "unknown" && !command.executionId,
		)
			? {
					state: "unknown" as const,
					commands: matching.map((entry) =>
						normalizeCommandObservation({
							...record(entry.execution),
							executionId: entry.executionId,
						}),
					),
				}
			: observed;
	return reconcileCommandExecution(initial, sessionId, journal, history);
}
