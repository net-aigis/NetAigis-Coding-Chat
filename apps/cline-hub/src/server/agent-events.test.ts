import type { CoreSessionEvent } from "@cline/core";
import { describe, expect, it, vi } from "vitest";
import type { HubContext } from "./state";

// agent-events.ts only needs these siblings at runtime; mocking them keeps the
// test from loading @cline/core (state-payloads imports it at module scope),
// whose transitive provider deps do not survive vitest's module interop.
vi.mock("./approvals", () => ({ rejectPendingApprovalsForSession: vi.fn() }));
vi.mock("./state-payloads", () => ({ broadcastHubState: vi.fn() }));

import { handleSessionEvent } from "./agent-events";

function makeContextWithPeer(sessionId: string): {
	ctx: HubContext;
	sent: unknown[];
} {
	const sent: unknown[] = [];
	const ctx = {
		peers: new Set([{ selectedSessionId: sessionId }]),
		sessions: new Map(),
		send: (_peer: unknown, payload: unknown) => sent.push(payload),
		sendToSelectedPeers(id: string, payload: unknown) {
			if (id === sessionId) sent.push(payload);
		},
	} as unknown as HubContext;
	return { ctx, sent };
}

function agentErrorEvent(
	sessionId: string,
	recoverable: boolean,
): CoreSessionEvent {
	return {
		type: "agent_event",
		payload: {
			sessionId,
			event: {
				type: "error",
				error: new Error(
					"1 tool call(s) failed: [run_commands] Command not executed",
				),
				recoverable,
				iteration: 1,
			},
		},
	};
}

describe("handleSessionEvent — agent error events", () => {
	it("forwards later protected command observations to the selected existing session", () => {
		const { ctx, sent } = makeContextWithPeer("session-1");
		const journal = { version: 1, entries: [] };
		handleSessionEvent(ctx, {
			type: "session_snapshot",
			payload: {
				sessionId: "session-1",
				snapshot: { metadata: { runtimeCommandObservations: journal } },
			},
		} as never);
		expect(sent).toEqual([
			{ type: "command_observations", sessionId: "session-1", journal },
		]);
	});
	it.each([
		[{ execution: { state: "running", pid: 42 } }, "running"],
		[{ success: true, completed: true }, "unknown"],
		[{ execution: { state: "completed" } }, "unknown"],
		[{ execution: { state: "completed", exitCode: 0 } }, "completed"],
		[{ execution: { state: "completed", exitCode: 7 } }, "failed"],
		[
			{ execution: { state: "aborted", terminationConfirmed: true } },
			"aborted",
		],
		[
			{ execution: { state: "timed_out", terminationConfirmed: false } },
			"unknown",
		],
		[
			{ execution: { state: "unknown", observationFailed: true } },
			"observation_failed",
		],
		['{"execution":{"state":"completed","exitCode":0}}', "unknown"],
	] as const)("projects command tool return from structured process evidence: %j -> %s", (output, expected) => {
		const { ctx, sent } = makeContextWithPeer("session-1");
		handleSessionEvent(ctx, {
			type: "agent_event",
			payload: {
				sessionId: "session-1",
				event: {
					type: "content_end",
					contentType: "tool",
					toolName: "run_commands",
					toolCallId: "tool-1",
					output,
					iteration: 1,
				},
			},
		} as never);
		expect(sent[0]).toMatchObject({
			type: "tool_event",
			event: { status: expected },
		});
		if (expected !== "completed")
			expect((sent[0] as { text: string }).text).not.toContain("completed");
	});
	it("does not turn a known failed session into completed when its runtime ends", () => {
		const { ctx } = makeContextWithPeer("session-1");
		ctx.sessions.set("session-1", { status: "failed", updatedAt: 0 } as never);
		handleSessionEvent(ctx, {
			type: "ended",
			payload: { sessionId: "session-1", reason: "error", ts: 1 },
		});
		expect(ctx.sessions.get("session-1")?.status).toBe("failed");
	});
	it("forwards recoverable errors flagged as in-run notices, not turn outcomes", () => {
		const { ctx, sent } = makeContextWithPeer("session-1");

		handleSessionEvent(ctx, agentErrorEvent("session-1", true));

		expect(sent).toEqual([
			{
				type: "error",
				text: "1 tool call(s) failed: [run_commands] Command not executed",
				recoverable: true,
			},
		]);
	});

	it("forwards non-recoverable errors unflagged", () => {
		const { ctx, sent } = makeContextWithPeer("session-1");

		handleSessionEvent(ctx, agentErrorEvent("session-1", false));

		expect(sent).toEqual([
			{
				type: "error",
				text: "1 tool call(s) failed: [run_commands] Command not executed",
				recoverable: false,
			},
		]);
	});
});
