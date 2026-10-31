/** Reads the existing append-only TOTAL RECALL journal. No invented server routes. */
import type { ITelemetryService } from "@cline/shared";
import { hasUnresolvedCommandObservation } from "../runtime/host/command-observations";
import type { CoreSessionSnapshot } from "../session/session-snapshot";
import {
	copyRecallArchiveKey,
	recallArchiveKeyId,
	verifyRuntimeRecallRecord,
} from "./recall-archive-proof";
import type { RecallConfiguration, RecallFetch } from "./recall-outbox";

export interface TotalRecallConversation {
	conversationId: string;
	title?: string;
	projectId: string;
	actorId?: string;
	lastUpdated?: string;
	sessionCount?: number;
	eventCount: number;
	lastSeq: number;
}
export interface TotalRecallJournalEvent {
	seq: number;
	event_id: string;
	project_id: string;
	conversation_id: string;
	actor_id: string;
	kind: string;
	payload: unknown;
	created_at: string;
}
export interface TotalRecallSessionSnapshot {
	conversationId: string;
	sessionId?: string;
	/** Original server events with immutable authorship, not reconstructed chat turns. */
	messages: TotalRecallJournalEvent[];
	recordedSnapshot?: CoreSessionSnapshot;
	recordedSnapshotSeq?: number;
	metadata?: {
		createdAt?: string;
		updatedAt?: string;
		actorId?: string;
		title?: string;
	};
	checkpointRunCount?: number;
	/** Captured append-only high-water mark; later writes belong to a later read. */
	journalSeq: number;
	sourceVerified: boolean;
	sourceKeyId?: string;
	/** Archive eligibility only; does not grant runtime ownership or restore a task. */
	restoration: {
		available: boolean;
		reason?:
			| "no_snapshot"
			| "incomplete_tail"
			| "invalid_snapshot"
			| "active_session"
			| "unconfirmed_process"
			| "unverified_source";
	};
	currentActorId?: string;
	lockedBy?: string;
	lockExpiresAt?: string;
}
export interface SessionTakeoverResult {
	success: boolean;
	sessionId?: string;
	error?: string;
	actorSwitched?: boolean;
}
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid TOTAL RECALL API response");
	return value as Record<string, unknown>;
}
function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function validRecoveryShape(snapshot: CoreSessionSnapshot): boolean {
	return (
		[
			snapshot.createdAt,
			snapshot.updatedAt,
			snapshot.source,
			snapshot.model?.providerId,
			snapshot.model?.modelId,
			snapshot.workspace?.cwd,
			snapshot.workspace?.root,
		].every(nonEmpty) &&
		[snapshot.createdAt, snapshot.updatedAt].every((time) =>
			Number.isFinite(Date.parse(time)),
		) &&
		typeof snapshot.lineage?.isSubagent === "boolean" &&
		typeof snapshot.interactive === "boolean" &&
		typeof snapshot.capabilities?.enableTools === "boolean" &&
		typeof snapshot.capabilities.enableSpawn === "boolean" &&
		typeof snapshot.capabilities.enableTeams === "boolean" &&
		Array.isArray(snapshot.messages) &&
		snapshot.messages.every((value) => {
			if (!value || typeof value !== "object") return false;
			const message = value as unknown as Record<string, unknown>;
			return (
				["user", "assistant", "system", "tool"].includes(
					String(message.role),
				) &&
				(typeof message.content === "string" || Array.isArray(message.content))
			);
		})
	);
}

/** Structural/process eligibility only. Producer authentication is a separate gate. */
export function sessionSnapshotRecoveryProblem(
	snapshot: CoreSessionSnapshot,
): TotalRecallSessionSnapshot["restoration"]["reason"] {
	if (!snapshot || snapshot.version !== 1 || !validRecoveryShape(snapshot))
		return "invalid_snapshot";
	if (
		!["idle", "completed", "cancelled", "aborted", "error", "failed"].includes(
			snapshot.status,
		)
	)
		return "active_session";
	if (
		hasUnresolvedCommandObservation(
			snapshot.messages!,
			snapshot.metadata?.runtimeCommandObservations,
			snapshot.sessionId,
		)
	)
		return "unconfirmed_process";
	return undefined;
}

const WRITER_COORDINATION_UNAVAILABLE =
	"TOTAL RECALL has no verified writer-ownership/handover API. A running task cannot safely be taken over through the event journal.";

export interface RecallSessionReadOptions {
	verificationKey?: Uint8Array;
	/** Only explicit read-only inspection may opt out; write admission must require proof. */
	requireVerifiedSource?: boolean;
}
export class TotalRecallSessionHost {
	private initialized = false;
	private readonly verificationKey?: Buffer;
	private readonly requireVerifiedSource: boolean;
	constructor(
		private readonly configManager: () => Promise<
			RecallConfiguration | undefined
		>,
		_telemetry?: ITelemetryService,
		private readonly fetch: RecallFetch = globalThis.fetch,
		options: RecallSessionReadOptions = {},
	) {
		this.verificationKey = options.verificationKey
			? copyRecallArchiveKey(options.verificationKey)
			: undefined;
		this.requireVerifiedSource = options.requireVerifiedSource !== false;
	}
	async initialize(_config: RecallConfiguration): Promise<void> {
		this.initialized = true;
	}
	private async configuration(): Promise<RecallConfiguration> {
		if (!this.initialized)
			throw new Error("TotalRecallSessionHost not initialized");
		const config = await this.configManager();
		if (!config?.enabled)
			throw new Error("TOTAL RECALL configuration unavailable or disabled");
		return { ...config };
	}
	private async request(
		route: "events" | "conversations",
		parameters: Record<string, string>,
		config: RecallConfiguration,
		signal?: AbortSignal,
	): Promise<Record<string, unknown>> {
		const url = new URL(
			config.baseUrl.replace(/\/+$/, "") + "/internal/recall/" + route,
		);
		for (const [key, value] of Object.entries(parameters))
			url.searchParams.set(key, value);
		const response = await this.fetch(url.toString(), {
			headers: { Authorization: "Bearer " + config.token },
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(15000)])
				: AbortSignal.timeout(15000),
		});
		if (!response.ok) throw new Error("TOTAL RECALL HTTP " + response.status);
		return object(await response.json());
	}
	private async readConversations(
		config: RecallConfiguration,
	): Promise<TotalRecallConversation[]> {
		const data = await this.request(
			"conversations",
			{ project_id: config.project },
			config,
		);
		if (!Array.isArray(data.conversations))
			throw new Error("Invalid TOTAL RECALL conversation list");
		const seen = new Set<string>();
		return data.conversations.map((raw): TotalRecallConversation => {
			const item = object(raw);
			if (
				!nonEmpty(item.conversation_id) ||
				seen.has(item.conversation_id) ||
				!Number.isSafeInteger(item.event_count) ||
				Number(item.event_count) < 1 ||
				!Number.isSafeInteger(item.last_seq) ||
				Number(item.last_seq) < 1
			)
				throw new Error("Invalid TOTAL RECALL conversation record");
			seen.add(item.conversation_id);
			return {
				conversationId: item.conversation_id,
				projectId: config.project,
				eventCount: Number(item.event_count),
				lastSeq: Number(item.last_seq),
			};
		});
	}
	async listConversations(
		projectId?: string,
		actorId?: string,
	): Promise<TotalRecallConversation[]> {
		const config = await this.configuration();
		if (projectId !== undefined && projectId !== config.project)
			throw new Error("TOTAL RECALL project differs from configured project");
		const conversations = await this.readConversations(config);
		if (actorId === undefined) return conversations;
		const selected: TotalRecallConversation[] = [];
		for (const conversation of conversations) {
			const journal = await this.readEvents(conversation, config);
			if (journal.some((event) => event.actor_id === actorId))
				selected.push(conversation);
		}
		return selected;
	}
	private async readEvents(
		conversation: TotalRecallConversation,
		config: RecallConfiguration,
	): Promise<TotalRecallJournalEvent[]> {
		const events: TotalRecallJournalEvent[] = [];
		const deadline = AbortSignal.timeout(30_000);
		let after = 0;
		while (after < conversation.lastSeq) {
			deadline.throwIfAborted();
			const data = await this.request(
				"events",
				{
					project_id: config.project,
					conversation_id: conversation.conversationId,
					after_seq: String(after),
				},
				config,
				deadline,
			);
			if (!Array.isArray(data.events) || !data.events.length)
				throw new Error(
					"Incomplete TOTAL RECALL journal before captured watermark",
				);
			let previous = after;
			for (const raw of data.events) {
				const event = object(raw);
				if (
					!Number.isSafeInteger(event.seq) ||
					Number(event.seq) <= previous ||
					event.project_id !== config.project ||
					event.conversation_id !== conversation.conversationId ||
					![event.event_id, event.actor_id, event.kind, event.created_at].every(
						nonEmpty,
					) ||
					!("payload" in event)
				)
					throw new Error("Invalid, repeated or mis-scoped TOTAL RECALL event");
				previous = Number(event.seq);
				if (previous <= conversation.lastSeq)
					events.push(event as unknown as TotalRecallJournalEvent);
			}
			after = events.at(-1)?.seq ?? after;
			if (previous > conversation.lastSeq && after < conversation.lastSeq)
				throw new Error("TOTAL RECALL captured watermark is missing");
			if (events.length > conversation.eventCount)
				throw new Error(
					"TOTAL RECALL journal count differs from captured watermark",
				);
		}
		if (
			events.length !== conversation.eventCount ||
			new Set(events.map((event) => event.event_id)).size !== events.length
		)
			throw new Error(
				"TOTAL RECALL journal is incomplete or contains duplicate event IDs",
			);
		return events;
	}

	async getSessionSnapshot(
		conversationId: string,
		_actorId?: string,
	): Promise<TotalRecallSessionSnapshot> {
		if (!nonEmpty(conversationId))
			throw new Error("TOTAL RECALL conversation ID required");
		const config = await this.configuration();
		const conversation = (await this.readConversations(config)).find(
			(item) => item.conversationId === conversationId,
		);
		if (!conversation)
			throw new Error(
				"TOTAL RECALL conversation was not found in the configured project",
			);
		const events = await this.readEvents(conversation, config);
		let recordedSnapshot: CoreSessionSnapshot | undefined;
		let recordedSnapshotSeq: number | undefined;
		for (const event of events) {
			if (
				event.kind !== "cline.sdk.event" ||
				!event.payload ||
				typeof event.payload !== "object"
			)
				continue;
			const sdkEvent = (event.payload as Record<string, unknown>).sdk_event as
				| Record<string, unknown>
				| undefined;
			if (sdkEvent?.type !== "session_snapshot") continue;
			const payload = sdkEvent.payload as Record<string, unknown> | undefined;
			const snapshot = payload?.snapshot as CoreSessionSnapshot | undefined;
			if (
				payload?.sessionId !== conversationId ||
				snapshot?.sessionId !== conversationId
			)
				throw new Error("TOTAL RECALL snapshot session ID mismatch");
			if (snapshot.version === 1 && Array.isArray(snapshot.messages)) {
				recordedSnapshot = snapshot;
				recordedSnapshotSeq = event.seq;
			}
		}
		const sourceVerified =
			!!this.verificationKey &&
			verifyRuntimeRecallRecord(
				events.find((event) => event.seq === recordedSnapshotSeq),
				this.verificationKey,
			);
		let reason: TotalRecallSessionSnapshot["restoration"]["reason"];
		if (!recordedSnapshot) reason = "no_snapshot";
		else if (recordedSnapshotSeq !== conversation.lastSeq)
			reason = "incomplete_tail";
		else if (!validRecoveryShape(recordedSnapshot)) reason = "invalid_snapshot";
		else if (this.requireVerifiedSource && !sourceVerified)
			reason = "unverified_source";
		else reason = sessionSnapshotRecoveryProblem(recordedSnapshot);
		return {
			conversationId,
			journalSeq: conversation.lastSeq,
			sourceVerified,
			...(sourceVerified
				? { sourceKeyId: recallArchiveKeyId(this.verificationKey!) }
				: {}),
			restoration: { available: !reason, ...(reason ? { reason } : {}) },
			sessionId: recordedSnapshot?.sessionId,
			messages: events,
			recordedSnapshot,
			recordedSnapshotSeq,
			metadata: {
				createdAt: events[0]?.created_at,
				updatedAt: events.at(-1)?.created_at,
				actorId: events[0]?.actor_id,
			},
		};
	}
	async takeOverSession(
		_conversationId: string,
		_newActorId: string,
		_checkpointRunCount?: number,
	): Promise<SessionTakeoverResult> {
		return { success: false, error: WRITER_COORDINATION_UNAVAILABLE };
	}
	async releaseSession(
		_conversationId: string,
		_currentActorId?: string,
	): Promise<boolean> {
		return false;
	}
	async getSessionLockStatus(_conversationId: string): Promise<{
		locked?: boolean;
		verified: false;
		reason: string;
		lockedBy?: string;
		lockExpiresAt?: string;
	}> {
		return { verified: false, reason: WRITER_COORDINATION_UNAVAILABLE };
	}
	async getCurrentActorId(
		_conversationId: string,
	): Promise<string | undefined> {
		return undefined;
	}
}
