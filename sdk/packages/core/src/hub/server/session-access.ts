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

/** Explicit unknown/running observations and unfinished tool calls block a handover. */
export function hasUnresolvedCommandObservation(
	messages: readonly unknown[],
): boolean {
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
					continue;
				}
			}
			const output = record(content),
				results = Array.isArray(content)
					? content
					: Array.isArray(output.results)
						? output.results
						: [output];
			for (const result of results) {
				const execution = record(record(result).execution);
				if (
					execution.state === "unknown" ||
					execution.state === "running" ||
					execution.observationFailed === true ||
					(["aborted", "timed_out"].includes(String(execution.state)) &&
						execution.terminationConfirmed !== true) ||
					(execution.state === "completed" &&
						!Number.isInteger(record(result).exitCode ?? execution.exitCode))
				)
					return true;
			}
		}
	}
	return pending.size > 0;
}

export class HubSessionAccess {
	private readonly locks = new Map<string, Promise<unknown>>();
	private readonly activeWrites = new Map<string, number>();
	private readonly clientActors = new Map<string, string>();
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
		const { session } = await this.state(id);
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
		if (
			(command === "client.register" || command === "client.update") &&
			authority
		) {
			return this.locked(`client/${authority.clientId}`, async () => {
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
				return dispatch({
					...envelope,
					payload: { ...envelope.payload, metadata },
				});
			});
		}
		if (
			[
				"capability.respond",
				"capability.progress",
				"approval.respond",
			].includes(command)
		) {
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
							...record(envelope.payload?.metadata),
							[SESSION_CONTROL_METADATA_KEY]: control,
							hubCapabilityOwnerActorId: authority.actorId,
						},
					},
				});
			});
		}
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
				if (!(await this.quiescent(id)))
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
				["session.delete", "session.restore"].includes(command) &&
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
							[SESSION_CONTROL_METADATA_KEY]: control,
							hubCapabilityOwnerClientId:
								session.metadata?.hubCapabilityOwnerClientId,
							hubCapabilityOwnerActorId:
								session.metadata?.hubCapabilityOwnerActorId,
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
