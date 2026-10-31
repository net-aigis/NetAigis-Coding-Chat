import { COMMAND_OBSERVATIONS_METADATA_KEY } from "../../extensions/tools/executors/run-command-execution-controller";
import {
	hasUnconfirmedRuntimeOwner,
	hasUnresolvedCommandObservation,
	RUNTIME_OWNER_METADATA_FIELDS,
} from "../../runtime/host/command-observations";
import {
	assertSnapshotImportComplete,
	SNAPSHOT_IMPORT_METADATA_KEY,
} from "../../session/snapshot-import-state";

export { hasUnresolvedCommandObservation } from "../../runtime/host/command-observations";

/** Authenticated control of the existing runtime/session store, without a second journal. */
import { randomUUID } from "node:crypto";
import {
	createSessionId,
	type HubCommandEnvelope,
	type HubReplyEnvelope,
} from "@cline/shared";
import {
	parseSessionWriterControl,
	type SessionWriterControl,
} from "../session-control";
import type { HubConnectionAuthority } from "./command-transport";
import {
	errorReply,
	extractSessionId,
	type HubTransportContext,
	okReply,
} from "./handlers/context";

export const SESSION_CONTROL_METADATA_KEY = "sharedSessionControl";
export interface AuthenticatedTurnAuthor {
	actorId: string;
	clientId: string;
	requestId: string;
	receivedAt: string;
	source: "hub-authenticated";
}
const authors = new WeakMap<HubCommandEnvelope, AuthenticatedTurnAuthor>();
export function authenticatedTurnAuthor(
	envelope: HubCommandEnvelope,
): AuthenticatedTurnAuthor | undefined {
	return authors.get(envelope);
}

const READ_COMMANDS = new Set([
	"client.register",
	"client.update",
	"client.unregister",
	"client.list",
	"session.attach",
	"session.detach",
	"session.get",
	"session.messages",
	"session.list",
	"session.recall.list",
	"session.recall.inspect",
	"session.search",
	"session.compaction.get",
	"session.pending_prompts",
	"session.mcp_apps.resolve_tool",
	"session.mcp_apps.read_resource",
	"run.list",
	"hub.status",
	"catalog.list",
	"prompt_commands.list",
	"mention_files.search",
	"settings.get",
	"settings.list",
	"settings.snapshot",
	"ui.notify",
	"ui.show_window",
	"approval.respond",
	"capability.respond",
	"capability.progress",
]);
const WRITES = new Set([
	"session.resume",
	"run.start",
	"session.send_input",
	"session.update",
	"session.update_connection",
	"session.compaction.update",
	"session.steer_first_pending_prompt",
	"session.update_pending_prompt",
	"session.remove_pending_prompt",
	"session.delete",
	"session.restore",
	"run.abort",
	"run.proceed_while_running",
	"session.mcp_apps.call_tool",
	"session.hook",
]);
const RUNS = new Set(["run.start", "session.send_input"]);

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export class HubSessionAccess {
	private readonly locks = new Map<string, Promise<unknown>>();
	private readonly activeWrites = new Map<string, number>();
	private readonly clientActors = new Map<string, string>();
	private readonly connectedConnections = new Map<string, string>();
	constructor(private readonly ctx: HubTransportContext) {}
	private async locked<T>(id: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.locks.get(id) ?? Promise.resolve();
		const run = previous.catch(() => {}).then(operation);
		this.locks.set(id, run);
		try {
			return await run;
		} finally {
			if (this.locks.get(id) === run) this.locks.delete(id);
		}
	}
	private async state(id: string) {
		const session = await this.ctx.sessionHost.getSession(id);
		if (!session) throw new Error("Session does not exist in this runtime");
		return {
			session,
			control: parseSessionWriterControl(
				session.metadata?.[SESSION_CONTROL_METADATA_KEY],
			),
		};
	}
	private owns(
		control: SessionWriterControl,
		authority: HubConnectionAuthority,
	): boolean {
		return (
			!!control.writer &&
			control.writer.actorId === authority.actorId &&
			control.writer.clientId === authority.clientId &&
			control.writer.connectionId === authority.connectionId
		);
	}
	private async quiescent(id: string): Promise<boolean> {
		if (this.activeWrites.get(id)) return false;
		if (
			[
				...(this.ctx.pendingApprovals?.values() ?? []),
				...(this.ctx.pendingCapabilityRequests?.values() ?? []),
			].some((request) => request.sessionId === id)
		)
			return false;
		const { session } = await this.state(id);
		assertSnapshotImportComplete(session.metadata);
		if (hasUnconfirmedRuntimeOwner(session.metadata)) return false;
		if (
			![
				"idle",
				"completed",
				"cancelled",
				"aborted",
				"error",
				"failed",
			].includes(session.status)
		)
			return false;
		if (
			!this.ctx.sessionHost.pendingPrompts?.list ||
			(await this.ctx.sessionHost.pendingPrompts.list({ sessionId: id })).length
		)
			return false;
		if (!this.ctx.sessionHost.readLiveSessionMessages) return false;
		return !hasUnresolvedCommandObservation(
			await this.ctx.sessionHost.readLiveSessionMessages(id),
			session.metadata?.[COMMAND_OBSERVATIONS_METADATA_KEY],
			id,
		);
	}
	async execute(
		envelope: HubCommandEnvelope,
		authority: HubConnectionAuthority | undefined,
		dispatch: (e: HubCommandEnvelope) => Promise<HubReplyEnvelope>,
	): Promise<HubReplyEnvelope> {
		const command = envelope.command;
		if (!authority || envelope.clientId !== authority.clientId)
			return errorReply(
				envelope,
				"client_not_registered",
				"Register this connection before accessing the shared runtime",
			);
		const isStaleConnection = () =>
			this.connectedConnections.has(authority.clientId) &&
			this.connectedConnections.get(authority.clientId) !==
				authority.connectionId;
		if (command !== "client.register" && isStaleConnection())
			return errorReply(
				envelope,
				"client_connection_mismatch",
				"This connection no longer owns the registered client",
			);
		if (command === "client.unregister")
			return this.locked(`client/${authority.clientId}`, async () => {
				if (isStaleConnection())
					return errorReply(
						envelope,
						"client_connection_mismatch",
						"A stale connection cannot unregister its replacement",
					);
				const reply = await dispatch(envelope);
				if (reply.ok) this.connectedConnections.delete(authority.clientId);
				return reply;
			});
		if (
			(command === "client.register" || command === "client.update") &&
			authority
		) {
			return this.locked(`client/${authority.clientId}`, async () => {
				if (command !== "client.register" && isStaleConnection())
					return errorReply(
						envelope,
						"client_connection_mismatch",
						"This connection no longer owns the registered client",
					);
				const previous = this.clientActors.get(authority.clientId);
				if (previous && previous !== authority.actorId)
					return errorReply(
						envelope,
						"client_actor_mismatch",
						"This client identity belongs to another actor",
					);
				if (
					command === "client.register" &&
					this.ctx.clients.has(authority.clientId)
				)
					return errorReply(
						envelope,
						"client_already_connected",
						"This execution client already has a connected owner",
					);
				for (const session of await this.ctx.sessionHost.listSessions(10000)) {
					if (
						session.metadata?.hubCapabilityOwnerClientId ===
							authority.clientId &&
						session.metadata.hubCapabilityOwnerActorId !== authority.actorId
					)
						return errorReply(
							envelope,
							"client_actor_mismatch",
							"This client identity is reserved by a session's original actor",
						);
				}
				if (authority.actorId)
					this.clientActors.set(authority.clientId, authority.actorId);
				const metadata = { ...record(envelope.payload?.metadata) };
				delete metadata.authenticatedActorId;
				if (authority.actorId)
					metadata.authenticatedActorId = authority.actorId;
				const reply = await dispatch({
					...envelope,
					payload: { ...envelope.payload, metadata },
				});
				if (reply.ok && command === "client.register" && authority.connectionId)
					this.connectedConnections.set(
						authority.clientId,
						authority.connectionId,
					);
				return reply.ok && authority.actorId
					? {
							...reply,
							payload: {
								...reply.payload,
								authenticatedActorId: authority.actorId,
								authenticatedConnectionId: authority.connectionId,
							},
						}
					: reply;
			});
		}
		if (["capability.respond", "capability.progress"].includes(command)) {
			const target = extractSessionId(envelope);
			if (!authority?.actorId || !target)
				return errorReply(
					envelope,
					"actor_authentication_required",
					"Tool observations require the authenticated execution owner",
				);
			const { session } = await this.state(target);
			if (session.metadata?.hubCapabilityOwnerActorId !== authority.actorId)
				return errorReply(
					envelope,
					"capability_actor_mismatch",
					"Another actor cannot supply this execution owner's observations",
				);
		}
		if (command === "approval.respond") {
			const target = extractSessionId(envelope),
				{ control } = await this.state(target);
			const pending = this.ctx.pendingApprovals.get(
				String(envelope.payload?.approvalId ?? ""),
			);
			if (!this.owns(control, authority) || pending?.sessionId !== target)
				return errorReply(
					envelope,
					"approval_writer_mismatch",
					"Only the current session writer can answer its actual pending approval",
				);
			if (envelope.payload?.controlRevision !== control.revision)
				return errorReply(
					envelope,
					"control_revision_conflict",
					"Approval uses an outdated writer revision",
				);
		}
		if (READ_COMMANDS.has(command)) return dispatch(envelope);
		const id = extractSessionId(envelope);
		if (command === "session.control.get") {
			const { control } = await this.state(id);
			return okReply(envelope, { sessionId: id, control });
		}
		if (
			!authority?.actorId ||
			!authority.connectionId ||
			envelope.clientId !== authority.clientId
		)
			return errorReply(
				envelope,
				"actor_authentication_required",
				"An authenticated actor connection is required to write",
			);
		if (command === "session.create") {
			const config = record(envelope.payload?.sessionConfig),
				sessionId =
					typeof config.sessionId === "string" && config.sessionId
						? config.sessionId
						: createSessionId();
			return this.locked(sessionId, async () => {
				if (await this.ctx.sessionHost.getSession(sessionId))
					return errorReply(
						envelope,
						"existing_session_requires_resume",
						"An existing session cannot be recreated through new-session input",
					);
				if (
					Array.isArray(envelope.payload?.initialMessages) &&
					envelope.payload.initialMessages.length
				)
					return errorReply(
						envelope,
						"session_import_required",
						"Existing history requires a verified session import",
					);
				const metadata = { ...record(envelope.payload?.metadata) };
				delete metadata[COMMAND_OBSERVATIONS_METADATA_KEY];
				delete metadata[SNAPSHOT_IMPORT_METADATA_KEY];
				for (const field of RUNTIME_OWNER_METADATA_FIELDS)
					delete metadata[field];
				const control: SessionWriterControl = {
					version: 1,
					revision: 1,
					writer: {
						actorId: authority.actorId!,
						clientId: authority.clientId,
						connectionId: authority.connectionId!,
					},
				};
				return dispatch({
					...envelope,
					payload: {
						...envelope.payload,
						sessionConfig: { ...config, sessionId },
						metadata: {
							...metadata,
							[SESSION_CONTROL_METADATA_KEY]: control,
							hubCapabilityOwnerActorId: authority.actorId,
						},
					},
				});
			});
		}
		if (command === "session.recall.restore")
			return this.locked(id, () => dispatch(envelope));
		if (
			command === "session.control.claim" ||
			command === "session.control.release"
		)
			return this.locked(id, async () => {
				const { session, control } = await this.state(id);
				if (envelope.payload?.expectedRevision !== control.revision)
					return errorReply(
						envelope,
						"control_revision_conflict",
						"Session control changed; read it before retrying",
					);
				if (
					command === "session.control.release" &&
					!this.owns(control, authority)
				)
					return errorReply(
						envelope,
						"session_not_writer",
						"Only the current writer can release this session",
					);
				// Reconnecting the same authenticated execution client is not a handover.
				// Exclusive registration fenced its old socket; active work remains owned
				// by the runtime and is neither aborted nor replayed by this rebind.
				const rebind =
					command === "session.control.claim" &&
					control.writer !== undefined &&
					control.writer.actorId === authority.actorId &&
					control.writer.clientId === authority.clientId &&
					control.writer.connectionId !== authority.connectionId &&
					this.connectedConnections.get(authority.clientId) ===
						authority.connectionId;
				if (!rebind && !(await this.quiescent(id)))
					return errorReply(
						envelope,
						"session_not_quiescent",
						"Running, pending or unconfirmed work prevents a safe handover",
					);
				const next: SessionWriterControl = {
					version: 1,
					revision: control.revision + 1,
					...(command === "session.control.claim"
						? {
								writer: {
									actorId: authority.actorId!,
									clientId: authority.clientId,
									connectionId: authority.connectionId!,
								},
							}
						: {}),
					lastChange: {
						actorId: authority.actorId!,
						clientId: authority.clientId,
						requestId: envelope.requestId ?? randomUUID(),
						at: new Date().toISOString(),
					},
				};
				const result = await this.ctx.sessionHost.updateSession(id, {
					metadata: {
						...session.metadata,
						[SESSION_CONTROL_METADATA_KEY]: next,
					},
				});
				if (!result.updated)
					return errorReply(
						envelope,
						"control_persistence_failed",
						"Session control was not persisted; handover was not acknowledged",
					);
				if (rebind) {
					for (const pending of this.ctx.pendingApprovals.values()) {
						if (pending.sessionId !== id || !pending.requestedEvent) continue;
						pending.requestedEvent = this.ctx.buildEvent(
							"approval.requested",
							{
								...pending.requestedEvent.payload,
								targetClientId: next.writer!.clientId,
								controlRevision: next.revision,
							},
							id,
						);
						this.ctx.publish(pending.requestedEvent);
					}
				}
				return okReply(envelope, { sessionId: id, control: next });
			});
		if (!WRITES.has(command))
			return errorReply(
				envelope,
				"actor_command_forbidden",
				"This command is not available to an actor connection",
			);
		const run = RUNS.has(command);
		const admit = async (): Promise<HubReplyEnvelope | undefined> => {
			const { session, control } = await this.state(id);
			assertSnapshotImportComplete(session.metadata);
			if (!this.owns(control, authority))
				return errorReply(
					envelope,
					"session_not_writer",
					"This actor/client does not own the session writer role",
				);
			if (envelope.payload?.controlRevision !== control.revision)
				return errorReply(
					envelope,
					"control_revision_conflict",
					"The write uses an outdated session control revision",
				);
			if (
				["session.delete", "session.restore", "session.resume"].includes(
					command,
				) &&
				!(await this.quiescent(id))
			)
				return errorReply(
					envelope,
					"session_not_quiescent",
					"Stop and confirm the existing work before changing session state",
				);
			if (
				command === "session.update" &&
				envelope.payload?.metadata !== undefined
			) {
				envelope = {
					...envelope,
					payload: {
						...envelope.payload,
						metadata: {
							...session.metadata,
							...record(envelope.payload.metadata),
							...Object.fromEntries(
								RUNTIME_OWNER_METADATA_FIELDS.map((field) => [
									field,
									session.metadata?.[field],
								]),
							),
							[SESSION_CONTROL_METADATA_KEY]: control,
							hubCapabilityOwnerClientId:
								session.metadata?.hubCapabilityOwnerClientId,
							hubCapabilityOwnerActorId:
								session.metadata?.hubCapabilityOwnerActorId,
							[COMMAND_OBSERVATIONS_METADATA_KEY]:
								session.metadata?.[COMMAND_OBSERVATIONS_METADATA_KEY],
							[SNAPSHOT_IMPORT_METADATA_KEY]:
								session.metadata?.[SNAPSHOT_IMPORT_METADATA_KEY],
						},
					},
				};
			}
			if (run) {
				this.activeWrites.set(id, (this.activeWrites.get(id) ?? 0) + 1);
				authors.set(
					envelope,
					Object.freeze({
						actorId: authority.actorId!,
						clientId: authority.clientId,
						requestId: envelope.requestId ?? randomUUID(),
						receivedAt: new Date().toISOString(),
						source: "hub-authenticated",
					}),
				);
			}
			return undefined;
		};
		if (!run)
			return this.locked(
				id,
				async () => (await admit()) ?? (await dispatch(envelope)),
			);
		const refusal = await this.locked(id, admit);
		if (refusal) return refusal;
		try {
			return await dispatch(envelope);
		} finally {
			this.activeWrites.set(
				id,
				Math.max(0, (this.activeWrites.get(id) ?? 1) - 1),
			);
		}
	}
}
