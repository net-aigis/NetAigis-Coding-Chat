/**
 * Session-scoped ledger of tool outcomes by call fingerprint.
 *
 * Purpose (P0 M23/M24):
 * - After a successful `run_commands`, an identical model retry must reuse the
 *   prior result instead of re-executing or soft-blocking into a mistake spiral.
 * - Blocked fingerprints are recorded once; further identical blocks escalate
 *   to a tool-path stop without dumping duplicate errors into the model context.
 * - Full original evidence stays in the first tool result / host logs; the
 *   model only sees short structured references.
 */

import {
	normalizeRunCommandsSignature,
	toolCallSignature,
} from "./loop-detection";

/** Exact M23/M24 shell from the Coding Chat protocol (2026-11-13). */
export const M23_M24_COMMAND =
	"timeout 25 ssh -o BatchMode=yes friseer@192.168.178.43 'echo ===APPRQSTATE===; cat /srv/ai-learning/queue/approve-when-ki-active.json' > /tmp/netaigis-chat-belege/M23.txt 2>&1; wc -l < /tmp/netaigis-chat-belege/M23.txt && timeout 25 ssh -o BatchMode=yes friseer@192.168.178.43 'echo ===AGENTLIVELOG===; journalctl -u ai-agent.service --no-pager --since \"17:15\" 2>/dev/null | tail -10' > /tmp/netaigis-chat-belege/M24.txt 2>&1; wc -l < /tmp/netaigis-chat-belege/M24.txt";

export type ToolOutcomeKind = "completed" | "blocked" | "failed";

export interface StoredToolOutcome {
	fingerprint: string;
	toolName: string;
	toolCallId: string;
	kind: ToolOutcomeKind;
	/** Short model-facing payload; never a full dump. */
	modelPayload: Record<string, unknown>;
	/** Clipped successful output for reuse (optional). */
	outputPreview?: unknown;
	/** How many times this fingerprint was seen after the first record. */
	repeatCount: number;
}

const PREVIEW_CHARS = 1_200;

export function toolCallFingerprint(
	toolName: string,
	input: unknown,
): string {
	if (toolName === "run_commands") {
		return `run:${normalizeRunCommandsSignature(input)}`;
	}
	return `input:${toolCallSignature(input)}`;
}

function clipPreview(output: unknown): unknown {
	if (output == null) return undefined;
	if (typeof output === "string") {
		return output.length <= PREVIEW_CHARS
			? output
			: `${output.slice(0, PREVIEW_CHARS - 1)}…`;
	}
	try {
		const raw = JSON.stringify(output);
		if (raw.length <= PREVIEW_CHARS) return output;
		return {
			status: "completed",
			truncated: true,
			preview: `${raw.slice(0, PREVIEW_CHARS - 1)}…`,
		};
	} catch {
		return undefined;
	}
}

export function buildReusedToolResult(
	stored: StoredToolOutcome,
): Record<string, unknown> {
	return {
		status: "completed",
		reason: "reused_prior_result",
		tool: stored.toolName,
		priorToolCallId: stored.toolCallId,
		summary: `Reusing prior ${stored.toolName} result (${stored.toolCallId}); not re-executed.`,
		guidance: [
			"Do not resubmit the same shell block.",
			"Use this prior result, or change tool/args for a different path.",
		],
		execution: { state: "executed" },
		resultRef: { toolCallId: stored.toolCallId },
		...(stored.outputPreview !== undefined
			? { priorOutput: stored.outputPreview }
			: {}),
	};
}

export function buildDedupedBlockedStatus(input: {
	toolName: string;
	toolCallId?: string;
	priorToolCallId: string;
	count: number;
}): Record<string, unknown> {
	return {
		status: "blocked",
		reason: "identical_tool_call_deduped",
		tool: input.toolName,
		count: input.count,
		...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
		priorToolCallId: input.priorToolCallId,
		summary: `Already blocked identical ${input.toolName}; not re-executed (×${input.count}).`,
		guidance: [
			"Stop this tool path.",
			"Use a different tool/args, or finish the step from prior results.",
		],
		execution: { state: "blocked" },
	};
}

/**
 * Per-session outcome ledger. Survives turns within a run; cleared on
 * conversation-boundary reset (continue / new user message).
 */
export class ToolCallOutcomeStore {
	private readonly byFingerprint = new Map<string, StoredToolOutcome>();

	lookup(toolName: string, input: unknown): StoredToolOutcome | undefined {
		return this.byFingerprint.get(toolCallFingerprint(toolName, input));
	}

	recordCompleted(
		toolName: string,
		input: unknown,
		toolCallId: string,
		output: unknown,
	): StoredToolOutcome {
		const fingerprint = toolCallFingerprint(toolName, input);
		const existing = this.byFingerprint.get(fingerprint);
		const stored: StoredToolOutcome = {
			fingerprint,
			toolName,
			toolCallId,
			kind: "completed",
			modelPayload: {
				status: "completed",
				toolCallId,
				execution: { state: "executed" },
			},
			outputPreview: clipPreview(output),
			repeatCount: existing ? existing.repeatCount + 1 : 0,
		};
		this.byFingerprint.set(fingerprint, stored);
		return stored;
	}

	/**
	 * Record a block. Returns `{ escalate: true }` when this fingerprint was
	 * already blocked — caller must stop the tool path.
	 */
	recordBlocked(
		toolName: string,
		input: unknown,
		toolCallId: string,
		blockedStatus: Record<string, unknown>,
	): { stored: StoredToolOutcome; escalate: boolean } {
		const fingerprint = toolCallFingerprint(toolName, input);
		const existing = this.byFingerprint.get(fingerprint);
		if (existing?.kind === "blocked") {
			const stored: StoredToolOutcome = {
				...existing,
				repeatCount: existing.repeatCount + 1,
				toolCallId,
				modelPayload: buildDedupedBlockedStatus({
					toolName,
					toolCallId,
					priorToolCallId: existing.toolCallId,
					count: existing.repeatCount + 2,
				}),
			};
			this.byFingerprint.set(fingerprint, stored);
			return { stored, escalate: true };
		}
		const stored: StoredToolOutcome = {
			fingerprint,
			toolName,
			toolCallId,
			kind: "blocked",
			modelPayload: {
				...blockedStatus,
				status: "blocked",
				execution: { state: "blocked" },
			},
			repeatCount: 0,
		};
		this.byFingerprint.set(fingerprint, stored);
		return { stored, escalate: false };
	}

	reset(): void {
		this.byFingerprint.clear();
	}
}
