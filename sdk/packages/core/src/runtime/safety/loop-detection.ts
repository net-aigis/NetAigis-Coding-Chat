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

/**
 * Collapse volatile wait / clock noise so observation polls that only change
 * `sleep N` still count as the same loop (otherwise 5× near-identical dumps
 * fill the context before hard stop).
 */
export function normalizeRunCommandsSignature(input: unknown): string {
	const stripVolatile = (text: string): string =>
		text
			.replace(/\bsleep\s+(?:\d+(?:\.\d+)?|\.\d+)[smhd]?\b/giu, "sleep <n>")
			.replace(/\btimeout\s+(?:\d+(?:\.\d+)?|\.\d+)[smhd]?\b/giu, "timeout <n>")
			.replace(/\b\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|s|sec)\b/giu, "<n>s")
			.replace(/"[^"]*sleep[^"]*"/giu, '"<sleep>"')
			.replace(/; *echo +EXIT=\$\?/giu, "")
			.replace(/\s+/gu, " ")
			.trim();

	const normalizeOne = (command: unknown): unknown => {
		if (typeof command === "string") return stripVolatile(command);
		if (!command || typeof command !== "object") return command;
		const value = { ...(command as Record<string, unknown>) };
		if (typeof value.command === "string") {
			value.command = stripVolatile(value.command);
		}
		if (Array.isArray(value.args)) {
			value.args = value.args.map((arg) =>
				typeof arg === "string" &&
				/^(?:\d+(?:\.\d+)?|\.\d+)[smhd]?$/u.test(arg)
					? "<n>"
					: arg,
			);
		}
		return value;
	};

	if (input && typeof input === "object" && "commands" in input) {
		const commands = (input as { commands: unknown }).commands;
		if (Array.isArray(commands)) {
			return toolCallSignature({
				...(input as Record<string, unknown>),
				commands: commands.map(normalizeOne),
			});
		}
	}
	if (Array.isArray(input)) {
		return toolCallSignature(input.map(normalizeOne));
	}
	return toolCallSignature(normalizeOne(input));
}

/**
 * run_commands dumps large outputs — intervene sooner than generic tools.
 * Soft at 2: refuse the identical *repeat* and inject short recovery guidance.
 * Hard at 3: stop the run.
 *
 * softThreshold MUST be >= 2. soft=1 skipped the first real command (P0 bug:
 * every new shell looked like "1 consecutive identical" and never executed).
 */
const RUN_COMMANDS_CONFIG: LoopDetectionConfig = {
	softThreshold: 2,
	hardThreshold: 3,
};

/** Clip a command snippet for recovery notices (keep context small). */
function clipCommandSnippet(input: unknown, max = 240): string {
	const raw =
		input && typeof input === "object" && "commands" in input
			? JSON.stringify((input as { commands: unknown }).commands)
			: typeof input === "string"
				? input
				: input == null
					? ""
					: JSON.stringify(input);
	const oneLine = raw.replace(/\s+/gu, " ").trim();
	if (oneLine.length <= max) return oneLine;
	return `${oneLine.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Short structured status for the model context (full text stays out of turns).
 */
export function buildBlockedToolStatus(input: {
	toolName: string;
	count: number;
	kind: "soft" | "hard";
	waitOnly?: boolean;
	toolCallId?: string;
}): Record<string, unknown> {
	const label = input.waitOnly ? "wait_only" : "identical";
	return {
		status: "blocked",
		reason:
			input.kind === "hard"
				? "identical_tool_call_hard"
				: "identical_tool_call",
		tool: input.toolName,
		count: input.count,
		label,
		...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
		summary:
			input.kind === "hard"
				? `Blocked ${label} ${input.toolName} (×${input.count}); stop retrying — summarize or ask.`
				: `Blocked ${label} ${input.toolName} (×${input.count}); not executed — change tool/args or use prior result.`,
		guidance:
			input.toolName === "run_commands"
				? [
						"Do not resubmit the same shell block.",
						"Prefer read_files/search or a different path/pattern.",
						"For writes (e.g. /learning/pending/.../approve): GET the rule state first; do not re-POST blindly after timeout/block.",
					]
				: ["Change tool or arguments; do not repeat the same call."],
	};
}

/**
 * Actionable recovery text so the model changes the command/tool instead of
 * retrying the same failing shell block (e.g. grep exit 1).
 * Keep this short — full dumps pollute the model context.
 */
export function buildLoopRecoveryMessage(input: {
	toolName: string;
	count: number;
	kind: "soft" | "hard";
	waitOnly?: boolean;
	toolInput?: unknown;
}): string {
	const status = buildBlockedToolStatus(input);
	const snippet =
		input.kind === "soft" && input.toolName === "run_commands"
			? clipCommandSnippet(input.toolInput, 120)
			: "";
	const parts = [
		String(status.summary),
		...(Array.isArray(status.guidance)
			? (status.guidance as string[]).map((line) => `- ${line}`)
			: []),
	];
	if (snippet) parts.push(`Blocked command: ${snippet}`);
	return parts.join("\n");
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

	const count = state.consecutiveIdenticalCount;
	const soft = Math.max(2, config.softThreshold);
	const hard = Math.max(soft + 1, config.hardThreshold);
	return {
		// Range, not equality: counts between soft and hard stay refused.
		softWarning: count >= soft && count < hard,
		hardEscalation: count >= hard,
		skipCall: count >= hard,
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
	/** Structured blocked status for the tool result (short; model-facing). */
	blockedStatus?: Record<string, unknown>;
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
	toolCallId?: string;
}

/** Generic tools: warn at 2, hard-stop at 3 (was 3/5 — too late after context pollution). */
const DEFAULT_CONFIG: LoopDetectionConfig = {
	softThreshold: 2,
	hardThreshold: 3,
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
		const runCommands = call.name === "run_commands";
		const signature = waitOnly
			? "wait-only-sleep"
			: runCommands
				? `run:${normalizeRunCommandsSignature(call.input)}`
				: `input:${toolCallSignature(call.input)}`;
		// Command polls dump large tool results; always warn/stop at 2 identical
		// calls regardless of a looser session config (soft=1 would skip the
		// first real command).
		const config = runCommands ? RUN_COMMANDS_CONFIG : this.config;
		const result = checkRepeatedToolCall(
			this.state,
			call.name,
			signature,
			config,
		);
		if (result.hardEscalation) {
			const blockedStatus = buildBlockedToolStatus({
				toolName: call.name,
				count: this.state.consecutiveIdenticalCount,
				kind: "hard",
				waitOnly,
				toolCallId: call.toolCallId,
			});
			return {
				kind: "hard",
				message: buildLoopRecoveryMessage({
					toolName: call.name,
					count: this.state.consecutiveIdenticalCount,
					kind: "hard",
					waitOnly,
					toolInput: call.input,
				}),
				blockedStatus,
				skip: result.skipCall,
			};
		}
		if (result.softWarning) {
			const blockedStatus = buildBlockedToolStatus({
				toolName: call.name,
				count: this.state.consecutiveIdenticalCount,
				kind: "soft",
				waitOnly,
				toolCallId: call.toolCallId,
			});
			return {
				kind: "soft",
				message: buildLoopRecoveryMessage({
					toolName: call.name,
					count: this.state.consecutiveIdenticalCount,
					kind: "soft",
					waitOnly,
					toolInput: call.input,
				}),
				blockedStatus,
				// Soft used to still execute and dump another full tool result into
				// context. For command polls that is the pollution; skip the call
				// but keep the run alive so the recovery text can steer the model.
				skip: runCommands,
			};
		}
		return { kind: "ok", skip: false };
	}

	reset(): void {
		resetLoopDetectionState(this.state);
	}
}
