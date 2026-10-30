/** Reads the existing append-only TOTAL RECALL journal. No invented server routes. */
import type { CoreSessionSnapshot, ITelemetryService } from "@cline/core"
import { fetch } from "@/shared/net"
import type { RecallConfiguration } from "./recall-outbox"

export interface TotalRecallConversation {
	conversationId: string
	title?: string
	projectId: string
	actorId?: string
	lastUpdated?: string
	sessionCount?: number
	eventCount: number
	lastSeq: number
}
export interface TotalRecallJournalEvent {
	seq: number
	event_id: string
	project_id: string
	conversation_id: string
	actor_id: string
	kind: string
	payload: unknown
	created_at: string
}
export interface TotalRecallSessionSnapshot {
	conversationId: string
	sessionId?: string
	/** Original server events with immutable authorship, not reconstructed chat turns. */
	messages: TotalRecallJournalEvent[]
	recordedSnapshot?: CoreSessionSnapshot
	recordedSnapshotSeq?: number
	metadata?: { createdAt?: string; updatedAt?: string; actorId?: string; title?: string }
	checkpointRunCount?: number
	currentActorId?: string
	lockedBy?: string
	lockExpiresAt?: string
}
export interface SessionTakeoverResult {
	success: boolean
	sessionId?: string
	error?: string
	actorSwitched?: boolean
}
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid TOTAL RECALL API response")
	return value as Record<string, unknown>
}
function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}
const WRITER_COORDINATION_UNAVAILABLE =
	"TOTAL RECALL has no verified writer-ownership/handover API. A running task cannot safely be taken over through the event journal."

export class TotalRecallSessionHost {
	private initialized = false
	constructor(
		private readonly configManager: () => Promise<RecallConfiguration | undefined>,
		_telemetry?: ITelemetryService,
	) {}
	async initialize(_config: RecallConfiguration): Promise<void> {
		this.initialized = true
	}
	private async configuration(): Promise<RecallConfiguration> {
		if (!this.initialized) throw new Error("TotalRecallSessionHost not initialized")
		const config = await this.configManager()
		if (!config?.enabled) throw new Error("TOTAL RECALL configuration unavailable or disabled")
		return { ...config }
	}
	private async request(
		route: "events" | "conversations",
		parameters: Record<string, string>,
		config: RecallConfiguration,
	): Promise<Record<string, unknown>> {
		const url = new URL(config.baseUrl.replace(/\/+$/, "") + "/internal/recall/" + route)
		for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
		const response = await fetch(url.toString(), {
			headers: { Authorization: "Bearer " + config.token },
			signal: AbortSignal.timeout(15000),
		})
		if (!response.ok) throw new Error("TOTAL RECALL HTTP " + response.status)
		return object(await response.json())
	}
	async listConversations(projectId?: string, actorId?: string): Promise<TotalRecallConversation[]> {
		const config = await this.configuration()
		if (projectId !== undefined && projectId !== config.project)
			throw new Error("TOTAL RECALL project differs from configured project")
		const data = await this.request("conversations", { project_id: config.project }, config)
		if (!Array.isArray(data.conversations)) throw new Error("Invalid TOTAL RECALL conversation list")
		const conversations = data.conversations.map((raw): TotalRecallConversation => {
			const item = object(raw)
			if (
				!nonEmpty(item.conversation_id) ||
				!Number.isSafeInteger(item.event_count) ||
				Number(item.event_count) < 0 ||
				!Number.isSafeInteger(item.last_seq) ||
				Number(item.last_seq) < 0
			)
				throw new Error("Invalid TOTAL RECALL conversation record")
			return {
				conversationId: item.conversation_id,
				projectId: config.project,
				eventCount: Number(item.event_count),
				lastSeq: Number(item.last_seq),
			}
		})
		// Actor is not a server-side conversations query. Filter actual authors,
		// never label the most recent author as an exclusive writer/owner.
		if (actorId === undefined) return conversations
		const selected: TotalRecallConversation[] = []
		for (const conversation of conversations) {
			const journal = await this.readEvents(conversation.conversationId, config)
			if (journal.some((event) => event.actor_id === actorId)) selected.push(conversation)
		}
		return selected
	}
	private async readEvents(conversationId: string, config: RecallConfiguration): Promise<TotalRecallJournalEvent[]> {
		if (!conversationId) throw new Error("TOTAL RECALL conversation ID required")
		const data = await this.request("events", { project_id: config.project, conversation_id: conversationId }, config)
		if (!Array.isArray(data.events)) throw new Error("Invalid TOTAL RECALL journal")
		let previous = 0
		return data.events.map((raw) => {
			const event = object(raw)
			if (
				!Number.isSafeInteger(event.seq) ||
				Number(event.seq) <= previous ||
				event.project_id !== config.project ||
				event.conversation_id !== conversationId ||
				![event.event_id, event.actor_id, event.kind, event.created_at].every(nonEmpty) ||
				!("payload" in event)
			)
				throw new Error("Invalid or mis-scoped TOTAL RECALL event")
			previous = Number(event.seq)
			return event as unknown as TotalRecallJournalEvent
		})
	}
	async getSessionSnapshot(conversationId: string, _actorId?: string): Promise<TotalRecallSessionSnapshot> {
		const events = await this.readEvents(conversationId, await this.configuration())
		let recordedSnapshot: CoreSessionSnapshot | undefined
		let recordedSnapshotSeq: number | undefined
		for (const event of events) {
			if (event.kind !== "cline.sdk.event" || !event.payload || typeof event.payload !== "object") continue
			const sdkEvent = (event.payload as Record<string, unknown>).sdk_event as Record<string, unknown> | undefined
			if (sdkEvent?.type !== "session_snapshot") continue
			const payload = sdkEvent.payload as Record<string, unknown> | undefined
			const snapshot = payload?.snapshot as CoreSessionSnapshot | undefined
			if (payload?.sessionId !== conversationId || snapshot?.sessionId !== conversationId)
				throw new Error("TOTAL RECALL snapshot session ID mismatch")
			if (snapshot.version === 1 && Array.isArray(snapshot.messages)) {
				recordedSnapshot = snapshot
				recordedSnapshotSeq = event.seq
			}
		}
		return {
			conversationId,
			sessionId: recordedSnapshot?.sessionId,
			messages: events,
			recordedSnapshot,
			recordedSnapshotSeq,
			metadata: { createdAt: events[0]?.created_at, updatedAt: events.at(-1)?.created_at, actorId: events[0]?.actor_id },
		}
	}
	async takeOverSession(
		_conversationId: string,
		_newActorId: string,
		_checkpointRunCount?: number,
	): Promise<SessionTakeoverResult> {
		return { success: false, error: WRITER_COORDINATION_UNAVAILABLE }
	}
	async releaseSession(_conversationId: string, _currentActorId?: string): Promise<boolean> {
		return false
	}
	async getSessionLockStatus(
		_conversationId: string,
	): Promise<{ locked?: boolean; verified: false; reason: string; lockedBy?: string; lockExpiresAt?: string }> {
		return { verified: false, reason: WRITER_COORDINATION_UNAVAILABLE }
	}
	async getCurrentActorId(_conversationId: string): Promise<string | undefined> {
		return undefined
	}
}
