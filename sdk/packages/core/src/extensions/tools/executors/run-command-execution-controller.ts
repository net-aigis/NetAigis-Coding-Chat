import { randomUUID } from "node:crypto";
import type { ToolOperationResult } from "../types";

export const COMMAND_OBSERVATIONS_METADATA_KEY = "runtimeCommandObservations";
export interface CommandProcessObservation {
	executionId: string;
	sessionId: string;
	toolCallId?: string;
	processStartToken?: string;
	execution: NonNullable<ToolOperationResult["execution"]>;
}
export interface RuntimeCommandObservation extends CommandProcessObservation {
	source: "child_process";
	runtimeInstanceId: string;
	sequence: number;
}
/** Exit proof comes from a ChildProcess event, never from PID absence or a timer. */
export function isConfirmedCommandExit(
	execution: CommandProcessObservation["execution"],
): boolean {
	if (execution.observationFailed === true) return false;
	if (["completed", "failed"].includes(execution.state))
		return Number.isSafeInteger(execution.exitCode);
	if (execution.state === "terminated") return Boolean(execution.signal);
	return (
		["aborted", "timed_out"].includes(execution.state) &&
		execution.terminationConfirmed === true
	);
}

export interface RunningCommandRegistration {
	executionId: string;
	sessionId: string;
	toolCallId?: string;
	detach: () => boolean;
}

/**
 * Tracks shell processes that can release their owning tool call while the
 * process keeps running. The controller is host-scoped so hub commands can
 * target only commands owned by a particular session/tool call.
 */
export class RunCommandExecutionController {
	private readonly commands = new Map<string, RunningCommandRegistration>();
	private readonly instanceId = randomUUID();
	private sequence = 0;
	private readonly journal = new Map<string, RuntimeCommandObservation>();
	private readonly writes = new Map<string, Promise<void>>();
	private readonly writeErrors = new Map<string, unknown>();
	constructor(
		private readonly persist?: (
			sessionId: string,
			observations: RuntimeCommandObservation[],
		) => Promise<void>,
	) {}

	/** Called only by the owning executor's actual process callbacks. */
	observe(input: CommandProcessObservation): void {
		const previous = this.journal.get(input.executionId);
		if (
			previous &&
			(previous.sessionId !== input.sessionId ||
				isConfirmedCommandExit(previous.execution) ||
				(previous.execution.observedAtMs ?? 0) >
					(input.execution.observedAtMs ?? 0))
		)
			return;
		this.journal.set(
			input.executionId,
			structuredClone({
				...previous,
				...input,
				source: "child_process",
				runtimeInstanceId: this.instanceId,
				sequence: ++this.sequence,
			}),
		);
		if (!this.persist) return;
		const entries = this.observations(input.sessionId);
		const tail = this.writes.get(input.sessionId) ?? Promise.resolve();
		const next = tail
			.then(() => this.persist!(input.sessionId, entries))
			.then(
				() => {
					this.writeErrors.delete(input.sessionId);
				},
				(error: unknown) => {
					this.writeErrors.set(input.sessionId, error);
				},
			);
		this.writes.set(input.sessionId, next);
	}
	observations(sessionId: string): RuntimeCommandObservation[] {
		return structuredClone(
			[...this.journal.values()].filter(
				(entry) => entry.sessionId === sessionId,
			),
		);
	}
	async flush(sessionId: string): Promise<void> {
		let pending: Promise<void> | undefined;
		do {
			pending = this.writes.get(sessionId);
			await pending;
		} while (pending !== this.writes.get(sessionId));
		if (this.writeErrors.has(sessionId)) throw this.writeErrors.get(sessionId);
	}

	register(command: RunningCommandRegistration): () => void {
		this.commands.set(command.executionId, command);
		return () => {
			if (this.commands.get(command.executionId) === command) {
				this.commands.delete(command.executionId);
			}
		};
	}

	proceedWhileRunning(sessionId: string, toolCallId?: string): number {
		let detachedCount = 0;
		for (const command of [...this.commands.values()]) {
			if (
				command.sessionId !== sessionId ||
				(toolCallId !== undefined && command.toolCallId !== toolCallId)
			) {
				continue;
			}
			try {
				if (command.detach()) detachedCount += 1;
			} catch {
				// Detaching one command can fail while preparing its log. Continue so
				// parallel commands from the same tool call still get a chance to detach.
			}
		}
		return detachedCount;
	}
}
