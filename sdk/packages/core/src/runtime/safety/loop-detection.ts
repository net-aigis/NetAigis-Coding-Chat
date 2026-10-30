/**
 * Repeated tool-call loop detection.
 *
 * @see PLAN.md §3.1 — helpers moved from `packages/agents/src/context/loop-detection.ts`.
 * @see PLAN.md §3.2.3 — public surface of `LoopDetectionTracker`.
 *
 * The pure helpers (`createLoopDetectionState`, `resetLoopDetectionState`,
 * `toolCallSignature`, `checkRepeatedToolCall`) are ported verbatim. The
 * `LoopDetectionTracker` class is a thin wrapper that owns a
 * `LoopDetectionState` and exposes the `inspect()` / `reset()` surface that
 * `SessionRuntime` installs as a `beforeTool` hook per §3.2.3.
 */

import type { LoopDetectionConfig } from "@cline/shared";

// =============================================================================
// Pure helpers (verbatim port)
// =============================================================================

export interface LoopDetectionState {
	lastToolName: string;
	lastToolSignature: string;
	consecutiveIdenticalCount: number;
}

export function createLoopDetectionState(): LoopDetectionState {
	return {
		lastToolName: "",
		lastToolSignature: "",
		consecutiveIdenticalCount: 0,
	};
}

export function resetLoopDetectionState(state: LoopDetectionState): void {
	state.lastToolName = "";
	state.lastToolSignature = "";
	state.consecutiveIdenticalCount = 0;
}

function sortKeys(value: unknown): unknown {
	if (value == null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(sortKeys);
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(value as Record<string, unknown>).sort()) {
		sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
	}
	return sorted;
}

export function toolCallSignature(input: unknown): string {
	if (input == null) return "null";
	if (typeof input === "string") return input;
	if (typeof input !== "object") return String(input);
	try {
		return JSON.stringify(sortKeys(input));
	} catch {
		return String(input);
	}
}

/** Pure wait-only commands have no progress even when their duration changes. */
function isWaitOnlyInput(input: unknown): boolean {
	const duration = /^(?:\d+(?:\.\d+)?|\.\d+)[smhd]?$/u;
	const sleepLine =
		/^(?:\/[^\s;|&]+\/)?sleep\s+((?:\d+(?:\.\d+)?|\.\d+)[smhd]?)\s*$/u;
	const isWait = (command: unknown): boolean => {
		if (typeof command === "string") return sleepLine.test(command.trim());
		if (!command || typeof command !== "object") return false;
		const value = command as { command?: unknown; args?: unknown };
		if (!Object.hasOwn(value, "args")) return isWait(value.command);
		return (
			typeof value.command === "string" &&
			/(?:^|\/)sleep$/u.test(value.command) &&
			Array.isArray(value.args) &&
			value.args.length > 0 &&
			value.args.every((arg) => typeof arg === "string" && duration.test(arg))
		);
	};
	const commands =
		input && typeof input === "object" && "commands" in input
			? (input as { commands: unknown }).commands
			: input;
	return Array.isArray(commands)
		? commands.length > 0 && commands.every(isWait)
		: isWait(commands);
}

export interface LoopCheckResult {
	softWarning: boolean;
	hardEscalation: boolean;
	/**
	 * True when the consecutive-identical count is at or above `hardThreshold`
	 * — i.e. this call and every call back to the start of the streak must be
	 * refused, not just the one that tripped the threshold. The legacy
	 * `agent.ts` loop guard skipped every call from the hard threshold onward;
	 * a bare `>=` verdict alone let calls at counts 6, 7, 8... execute again
	 * while the abort raced ahead of them, which is how repeated `grep`/`cat`
	 * commands kept running in a loop.
	 */
	skipCall: boolean;
}

export function checkRepeatedToolCall(
	state: LoopDetectionState,
	toolName: string,
	signature: string,
	config: LoopDetectionConfig,
): LoopCheckResult {
	if (
		toolName === state.lastToolName &&
		signature === state.lastToolSignature
	) {
		state.consecutiveIdenticalCount++;
	} else {
		state.consecutiveIdenticalCount = 1;
	}
	state.lastToolName = toolName;
	state.lastToolSignature = signature;

	return {
		softWarning: state.consecutiveIdenticalCount === config.softThreshold,
		hardEscalation: state.consecutiveIdenticalCount >= config.hardThreshold,
		skipCall: state.consecutiveIdenticalCount >= config.hardThreshold,
	};
}

// =============================================================================
// Class wrapper (new — per PLAN.md §3.2.3)
// =============================================================================

/**
 * Verdict returned by {@link LoopDetectionTracker.inspect}.
 *
 * - `"ok"`   — no repeated call detected.
 * - `"soft"` — soft-warning threshold reached; SessionRuntime may surface a
 *              recovery notice but should not block the call.
 * - `"hard"` — hard-escalation threshold reached; SessionRuntime should
 *              stop the run with the provided `message`.
 */
export interface LoopDetectionVerdict {
	kind: "ok" | "soft" | "hard";
	message?: string;
	/**
	 * Set when the repeated call must not execute at all. `SessionRuntime`
	 * feeds this to its `beforeTool` hook so identical calls past the hard
	 * threshold are refused instead of running one more time while the
	 * mistake-tracker abort settles.
	 */
	skip: boolean;
}

/** Minimal call shape the tracker needs; matches `AgentToolCallPart` subset. */
export interface LoopDetectionCall {
	name: string;
	input: unknown;
}

const DEFAULT_CONFIG: LoopDetectionConfig = {
	softThreshold: 3,
	hardThreshold: 5,
};

/**
 * Per-session repeated-tool-call detector.
 *
 * `SessionRuntime` owns the instance and installs a `beforeTool` hook
 * (see `AgentRuntimeHooks.beforeTool`) that calls `inspect()` to decide
 * whether to return `{ skip, stop, reason }`.
 */
export class LoopDetectionTracker {
	private readonly config: LoopDetectionConfig;
	private readonly state: LoopDetectionState = createLoopDetectionState();

	constructor(config?: Partial<LoopDetectionConfig>) {
		this.config = {
			softThreshold: config?.softThreshold ?? DEFAULT_CONFIG.softThreshold,
			hardThreshold: config?.hardThreshold ?? DEFAULT_CONFIG.hardThreshold,
		};
	}

	inspect(call: LoopDetectionCall): LoopDetectionVerdict {
		const waitOnly =
			call.name === "run_commands" && isWaitOnlyInput(call.input);
		const signature = waitOnly
			? "wait-only-sleep"
			: `input:${toolCallSignature(call.input)}`;
		const result = checkRepeatedToolCall(
			this.state,
			call.name,
			signature,
			this.config,
		);
		if (result.hardEscalation) {
			return {
				kind: "hard",
				message: `Detected ${this.state.consecutiveIdenticalCount} consecutive ${waitOnly ? "wait-only" : "identical"} calls to \`${call.name}\`; stopping to avoid a loop.`,
				skip: result.skipCall,
			};
		}
		if (result.softWarning) {
			return {
				kind: "soft",
				message: `Detected ${this.state.consecutiveIdenticalCount} consecutive ${waitOnly ? "wait-only" : "identical"} calls to \`${call.name}\`; consider trying a different approach.`,
				skip: false,
			};
		}
		return { kind: "ok", skip: false };
	}

	reset(): void {
		resetLoopDetectionState(this.state);
	}
}
