import type { HubCommandEnvelope } from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import type { HubConnectionAuthority } from "./command-transport";
import type { HubTransportContext } from "./handlers/context";
import {
	authenticatedTurnAuthor,
	HubSessionAccess,
	hasUnresolvedCommandObservation,
	SESSION_CONTROL_METADATA_KEY,
} from "./session-access";

const friseer: HubConnectionAuthority = {
	clientId: "vscode",
	actorId: "Friseer",
	connectionId: "friseer-socket",
};
const jimmi: HubConnectionAuthority = {
	clientId: "android",
	actorId: "jimmi",
	connectionId: "jimmi-socket",
};
function fixture() {
	const row = {
		sessionId: "same-session",
		status: "idle",
		metadata: {
			title: "original task",
			hubCapabilityOwnerClientId: "vscode",
			hubCapabilityOwnerActorId: "Friseer",
			[SESSION_CONTROL_METADATA_KEY]: {
				version: 1,
				revision: 1,
				writer: {
					actorId: "Friseer",
					clientId: "vscode",
					connectionId: "friseer-socket",
				},
			},
		},
	};
	const messages: unknown[] = [
		{
			role: "user",
			content: "original order",
			metadata: { author: { actorId: "Friseer" } },
		},
	];
	const runtime = {
		getSession: vi.fn(async () => row),
		listSessions: vi.fn(async () => [row]),
		readLiveSessionMessages: vi.fn(async () => messages),
		pendingPrompts: { list: vi.fn(async () => [] as unknown[]) },
		updateSession: vi.fn(
			async (_id: string, updates: { metadata: typeof row.metadata }) => {
				row.metadata = structuredClone(updates.metadata);
				return { updated: true };
			},
		),
	};
	const ctx = {
		sessionHost: runtime,
		clients: new Map(),
		pendingApprovals: new Map(),
		pendingCapabilityRequests: new Map(),
	} as unknown as HubTransportContext;
	const policy = new HubSessionAccess(ctx);
	const dispatch = vi.fn(async (e: HubCommandEnvelope) => ({
		version: "v1" as const,
		ok: true,
		payload: { author: authenticatedTurnAuthor(e) },
	}));
	const command = (
		name: HubCommandEnvelope["command"],
		who = friseer,
		payload: Record<string, unknown> = {},
	) =>
		policy.execute(
			{
				version: "v1",
				command: name,
				sessionId: "same-session",
				clientId: who.clientId,
				requestId: "fixture-request",
				payload,
			},
			who,
			dispatch,
		);
	return { row, messages, runtime, ctx, policy, dispatch, command };
}
describe("authenticated writer handover in existing session metadata", () => {
	it("admits a separate existing-session resume only for the confirmed writer and revision", async () => {
		const f = fixture();
		const resume = "session.resume" as HubCommandEnvelope["command"];
		expect(
			await f.command(resume, jimmi, { controlRevision: 1 }),
		).toMatchObject({
			ok: false,
			error: { code: "session_not_writer" },
		});
		expect(
			await f.command(resume, friseer, { controlRevision: 0 }),
		).toMatchObject({
			ok: false,
			error: { code: "control_revision_conflict" },
		});
		expect(
			await f.command(resume, friseer, { controlRevision: 1 }),
		).toMatchObject({ ok: true });
		expect(f.dispatch).toHaveBeenCalledOnce();
	});
	it("keeps approvals with the new writer and actual tool observations with the original execution actor", async () => {
		const f = fixture();
		await f.command("session.control.claim", jimmi, { expectedRevision: 1 });
		f.ctx.pendingApprovals.set("approval", {
			sessionId: "same-session",
			resolve: () => {},
		});
		expect(
			await f.command("approval.respond", friseer, {
				approvalId: "approval",
				controlRevision: 1,
			}),
		).toMatchObject({ ok: false, error: { code: "approval_writer_mismatch" } });
		expect(
			await f.command("approval.respond", jimmi, {
				approvalId: "approval",
				controlRevision: 2,
			}),
		).toMatchObject({ ok: true });
		expect(
			await f.command("approval.respond", jimmi, {
				approvalId: "another-session-approval",
				controlRevision: 2,
			}),
		).toMatchObject({ ok: false });
		expect(await f.command("capability.respond", jimmi, {})).toMatchObject({
			ok: false,
			error: { code: "capability_actor_mismatch" },
		});
		expect(await f.command("capability.respond", friseer, {})).toMatchObject({
			ok: true,
		});
	});
	it("rejects a claimed name without a server-authenticated actor", async () => {
		const f = fixture();
		expect(
			await f.command(
				"run.start",
				{ clientId: "vscode" },
				{ controlRevision: 1, actorId: "Friseer" },
			),
		).toMatchObject({
			ok: false,
			error: { code: "actor_authentication_required" },
		});
		expect(f.dispatch).not.toHaveBeenCalled();
	});
	it("allows exactly the actor, client, connection and revision that own the writer role", async () => {
		const f = fixture();
		expect(
			await f.command("run.start", jimmi, {
				controlRevision: 1,
				actorId: "Friseer",
			}),
		).toMatchObject({ ok: false, error: { code: "session_not_writer" } });
		expect(
			await f.command(
				"run.start",
				{ ...friseer, connectionId: "copied-client-id" },
				{ controlRevision: 1 },
			),
		).toMatchObject({ ok: false, error: { code: "session_not_writer" } });
		expect(
			await f.command("run.start", friseer, { controlRevision: 0 }),
		).toMatchObject({
			ok: false,
			error: { code: "control_revision_conflict" },
		});
		expect(
			await f.command("run.start", friseer, {
				controlRevision: 1,
				author: { actorId: "jimmi" },
			}),
		).toMatchObject({
			ok: true,
			payload: {
				author: {
					actorId: "Friseer",
					clientId: "vscode",
					source: "hub-authenticated",
				},
			},
		});
	});
	it("hands the same idle session to jimmi and back, retaining original history and denying stale writers", async () => {
		const f = fixture(),
			before = structuredClone(f.messages);
		expect(
			await f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
		).toMatchObject({
			ok: true,
			payload: {
				sessionId: "same-session",
				control: { revision: 2, writer: { actorId: "jimmi" } },
			},
		});
		expect(
			await f.command("run.start", friseer, { controlRevision: 1 }),
		).toMatchObject({ ok: false });
		expect(
			await f.command("run.start", jimmi, { controlRevision: 2 }),
		).toMatchObject({ ok: true, payload: { author: { actorId: "jimmi" } } });
		expect(
			await f.command("session.control.claim", friseer, {
				expectedRevision: 2,
			}),
		).toMatchObject({
			ok: true,
			payload: { control: { revision: 3, writer: { actorId: "Friseer" } } },
		});
		expect(f.messages).toEqual(before);
		expect(f.row.sessionId).toBe("same-session");
	});
	it("admits only one of two simultaneous claims for the same revision", async () => {
		const f = fixture();
		const replies = await Promise.all([
			f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
			f.command("session.control.claim", friseer, { expectedRevision: 1 }),
		]);
		expect(replies.filter((r) => r.ok)).toHaveLength(1);
		expect(replies.find((r) => !r.ok)).toMatchObject({
			error: { code: "control_revision_conflict" },
		});
	});
	it("never acknowledges a handover after a failed persistence operation", async () => {
		const f = fixture();
		f.runtime.updateSession.mockResolvedValueOnce({ updated: false });
		expect(
			await f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
		).toMatchObject({
			ok: false,
			error: { code: "control_persistence_failed" },
		});
		expect(f.row.metadata.sharedSessionControl.revision).toBe(1);
	});
	it("refuses transfer while the runtime or pending queue is busy", async () => {
		const f = fixture();
		f.row.status = "running";
		expect(
			await f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
		).toMatchObject({ ok: false, error: { code: "session_not_quiescent" } });
		f.row.status = "idle";
		f.runtime.pendingPrompts.list.mockResolvedValueOnce([{}]);
		expect(
			await f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
		).toMatchObject({ ok: false, error: { code: "session_not_quiescent" } });
	});
	it("keeps admitted work fenced even if the runtime's status read is stale", async () => {
		const f = fixture();
		let resolve!: (value: Awaited<ReturnType<typeof f.dispatch>>) => void;
		const promise = new Promise<Awaited<ReturnType<typeof f.dispatch>>>((r) => {
			resolve = r;
		});
		f.dispatch.mockImplementationOnce(() => promise);
		const work = f.command("run.start", friseer, { controlRevision: 1 });
		await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledOnce());
		expect(
			await f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
		).toMatchObject({ ok: false, error: { code: "session_not_quiescent" } });
		resolve({ version: "v1", ok: true, payload: { author: undefined } });
		await work;
	});
	it("refuses unknown process observations and unfinished tool calls", async () => {
		const f = fixture();
		f.messages.push(
			{
				role: "assistant",
				content: [{ type: "tool_use", id: "cmd", name: "run_commands" }],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "cmd",
						content: JSON.stringify({
							execution: { state: "unknown", observationFailed: true },
						}),
					},
				],
			},
		);
		expect(
			await f.command("session.control.claim", jimmi, { expectedRevision: 1 }),
		).toMatchObject({ ok: false, error: { code: "session_not_quiescent" } });
		expect(
			hasUnresolvedCommandObservation([
				{
					role: "assistant",
					content: [{ type: "tool_use", id: "cmd", name: "run_commands" }],
				},
			]),
		).toBe(true);
	});
	it("does not accept client supplied process observations as new-session authority", async () => {
		const f = fixture();
		f.runtime.getSession.mockImplementation(async (id?: string) =>
			id === "new-session" ? (undefined as never) : f.row,
		);
		await f.command("session.create", friseer, {
			sessionConfig: { sessionId: "new-session" },
			metadata: {
				runtimeCommandObservations: { version: 1, entries: [{ forged: true }] },
			},
		});
		expect(
			(f.dispatch.mock.calls[0][0].payload?.metadata as Record<string, unknown>)
				.runtimeCommandObservations,
		).toBeUndefined();
	});
	it("prevents metadata writes from replacing writer or execution-owner identity", async () => {
		const f = fixture();
		await f.command("session.update", friseer, {
			controlRevision: 1,
			metadata: {
				sharedSessionControl: { revision: 999 },
				runtimeCommandObservations: { version: 1, entries: [{ forged: true }] },
				hubCapabilityOwnerActorId: "jimmi",
			},
		});
		expect(f.dispatch.mock.calls[0][0].payload?.metadata).toMatchObject({
			sharedSessionControl: { revision: 1 },
			hubCapabilityOwnerActorId: "Friseer",
		});
		expect(
			(f.dispatch.mock.calls[0][0].payload?.metadata as Record<string, unknown>)
				.runtimeCommandObservations,
		).toBeUndefined();
	});
	it("checks modern tool-result records and requires a numeric exit code for completion", () => {
		const tool = (result: unknown) => [
			{
				role: "assistant",
				content: [
					{ type: "tool-call", toolCallId: "cmd", toolName: "run_commands" },
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "cmd",
						toolName: "run_commands",
						result,
					},
				],
			},
		];
		expect(
			hasUnresolvedCommandObservation(
				tool([{ execution: { state: "unknown" } }]),
			),
		).toBe(true);
		expect(
			hasUnresolvedCommandObservation(
				tool({ execution: { state: "unknown" } }),
			),
		).toBe(true);
		expect(
			hasUnresolvedCommandObservation(
				tool({ execution: { state: "aborted", terminationConfirmed: false } }),
			),
		).toBe(true);
		expect(
			hasUnresolvedCommandObservation(
				tool({ execution: { state: "timed_out", terminationConfirmed: true } }),
			),
		).toBe(false);
		expect(
			hasUnresolvedCommandObservation(
				tool({ execution: { state: "completed" }, exitCode: null }),
			),
		).toBe(true);
		expect(
			hasUnresolvedCommandObservation(
				tool({ execution: { state: "completed" }, exitCode: 0 }),
			),
		).toBe(false);
	});
	it("does not let registration metadata invent an authenticated actor", async () => {
		const f = fixture();
		await f.command(
			"client.register",
			{ clientId: "observer" },
			{ metadata: { authenticatedActorId: "Friseer" } },
		);
		expect(f.dispatch.mock.calls[0][0].payload?.metadata).not.toHaveProperty(
			"authenticatedActorId",
		);
		await f.command("client.update", jimmi, {
			metadata: { authenticatedActorId: "Friseer" },
		});
		expect(f.dispatch.mock.calls[1][0].payload?.metadata).toMatchObject({
			authenticatedActorId: "jimmi",
		});
	});
	it("refuses another actor using a known execution client ID", async () => {
		const f = fixture();
		expect(
			await f.command("client.register", { ...jimmi, clientId: "vscode" }, {}),
		).toMatchObject({ ok: false, error: { code: "client_actor_mismatch" } });
	});
	it("denies unregistered mutations of other clients", async () => {
		const f = fixture();
		expect(
			await f.policy.execute(
				{ version: "v1", command: "client.unregister", clientId: "vscode" },
				undefined,
				f.dispatch,
			),
		).toMatchObject({ ok: false, error: { code: "client_not_registered" } });
		expect(f.dispatch).not.toHaveBeenCalled();
	});
});
