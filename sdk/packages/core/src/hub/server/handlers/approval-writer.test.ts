import { expect, it, vi } from "vitest";
import {
	handleApprovalRespond,
	requestToolApproval,
} from "./approval-handlers";
import type { HubTransportContext } from "./context";

it("targets the current writer for a tool decision without changing the execution owner", async () => {
	const publish = vi.fn();
	const ctx = {
		sessionHost: {
			getSession: async () => ({
				metadata: {
					sharedSessionControl: {
						version: 1,
						revision: 2,
						writer: {
							actorId: "jimmi",
							clientId: "android",
							connectionId: "socket",
						},
					},
					hubCapabilityOwnerActorId: "Friseer",
				},
			}),
		},
		sessionState: new Map(),
		pendingApprovals: new Map(),
		publish,
		buildEvent: (event: string, payload: unknown, sessionId: string) => ({
			version: "v1",
			event,
			payload,
			sessionId,
		}),
	} as unknown as HubTransportContext;
	const request = requestToolApproval(ctx, {
		sessionId: "one-session",
		agentId: "agent",
		conversationId: "conversation",
		iteration: 1,
		toolCallId: "tool",
		toolName: "run_commands",
		input: { commands: ["fixture-command"] },
		policy: { autoApprove: false },
	});
	await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
	const event = publish.mock.calls[0][0];
	expect(event.payload).toMatchObject({
		targetClientId: "android",
		controlRevision: 2,
	});
	await handleApprovalRespond(ctx, {
		version: "v1",
		command: "approval.respond",
		sessionId: "one-session",
		payload: { approvalId: event.payload.approvalId, approved: true },
	});
	await expect(request).resolves.toMatchObject({ approved: true });
});
