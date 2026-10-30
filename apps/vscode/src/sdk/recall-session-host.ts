/**
 * TotalRecallSessionHost - Manages TOTAL RECALL session discovery and restoration
 */
import { type ITelemetryService } from "@cline/core"
import { Logger } from "@/shared/services/Logger"
import type { RecallConfiguration } from "./recall-outbox"

export interface TotalRecallConversation {
  conversationId: string
  title?: string
  projectId: string
  actorId: string
  lastUpdated?: string
  sessionCount?: number
}

export interface TotalRecallSessionSnapshot {
  conversationId: string
  sessionId?: string
  messages: Array<{
    event_id: string
    kind: string
    payload: Record<string, unknown>
    timestamp?: string
  }>
  metadata?: {
    createdAt?: string
    updatedAt?: string
    actorId?: string
    title?: string
  }
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

export class TotalRecallSessionHost {
  private recallConfig: RecallConfiguration | undefined
  private baseUrl: string = ""

  constructor(
    private readonly configManager: () => Promise<RecallConfiguration | undefined>,
    private readonly telemetry?: ITelemetryService,
  ) {}

  async initialize(config: RecallConfiguration): Promise<void> {
    this.recallConfig = config
    this.baseUrl = config.baseUrl.replace(/\/+$/, "")
    Logger.info(`[TOTAL RECALL] SessionHost initialized with base URL: ${this.baseUrl}`)
  }

  async listConversations(projectId?: string, actorId?: string): Promise<TotalRecallConversation[]> {
    if (!this.recallConfig) throw new Error("TotalRecallSessionHost not initialized")
    try {
      const url = new URL(`${this.baseUrl}/internal/recall/conversations`)
      if (projectId) url.searchParams.set("project_id", projectId)
      if (actorId) url.searchParams.set("actor_id", actorId)
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.recallConfig.token}` },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`TOTAL RECALL API error: ${response.status}`)
      const data = await response.json()
      const conversations = Array.isArray(data) ? data : (data as any).conversations || []
      Logger.info(`[TOTAL RECALL] Retrieved ${conversations.length} conversations`)
      return conversations.map((c: any) => ({
        conversationId: c.conversation_id || c.conversationId,
        title: c.title,
        projectId: c.project_id || c.projectId,
        actorId: c.actor_id || c.actorId,
        lastUpdated: c.last_updated || c.lastUpdated,
        sessionCount: c.session_count ?? c.sessionCount,
      }))
    } catch (error) {
      Logger.error("[TOTAL RECALL] Failed to list conversations:", error)
      throw error
    }
  }

  async getSessionSnapshot(conversationId: string, actorId?: string): Promise<TotalRecallSessionSnapshot> {
    if (!this.recallConfig) throw new Error("TotalRecallSessionHost not initialized")
    try {
      const url = new URL(`${this.baseUrl}/internal/recall/conversations/${encodeURIComponent(conversationId)}/snapshot`)
      if (actorId) url.searchParams.set("actor_id", actorId)
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.recallConfig.token}` },
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`TOTAL RECALL API error ${response.status}`)
      const snapshot = await response.json()
      return {
        conversationId,
        sessionId: (snapshot as any).session_id || (snapshot as any).sessionId,
        messages: Array.isArray((snapshot as any).events) ? (snapshot as any).events.map((e: any) => ({
          event_id: e.event_id || e.eventId,
          kind: e.kind,
          payload: e.payload,
          timestamp: e.timestamp || e.captured_at,
        })) : [],
        metadata: {
          createdAt: (snapshot as any).created_at,
          updatedAt: (snapshot as any).updated_at,
          actorId: (snapshot as any).actor_id || (snapshot as any).actorId,
          title: (snapshot as any).title,
        },
        checkpointRunCount: (snapshot as any).checkpoint_run_count ?? (snapshot as any).checkpointRunCount,
        currentActorId: (snapshot as any).current_actor_id || (snapshot as any).currentActorId,
        lockedBy: (snapshot as any).locked_by || (snapshot as any).lockedBy,
        lockExpiresAt: (snapshot as any).lock_expires_at || (snapshot as any).lockExpiresAt,
      }
    } catch (error) {
      Logger.error("[TOTAL RECALL] Failed to get session snapshot:", error)
      throw error
    }
  }

  async takeOverSession(conversationId: string, newActorId: string, checkpointRunCount?: number): Promise<SessionTakeoverResult> {
    if (!this.recallConfig) return { success: false, error: "TotalRecallSessionHost not initialized" }
    try {
      const url = new URL(`${this.baseUrl}/internal/recall/conversations/${encodeURIComponent(conversationId)}/takeover`)
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.recallConfig.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ actor_id: newActorId, checkpoint_run_count: checkpointRunCount }),
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { success: false, error: `Takeover failed: ${errorData.error || response.statusText}` }
      }
      const result = await response.json()
      Logger.info(`[TOTAL RECALL] Session ${conversationId} taken over by actor ${newActorId}`)
      return { success: true, sessionId: (result as any).session_id || (result as any).sessionId, actorSwitched: true }
    } catch (error) {
      Logger.error("[TOTAL RECALL] Failed to takeover session:", error)
      return { success: false, error: String(error) }
    }
  }

  async releaseSession(conversationId: string, currentActorId?: string): Promise<boolean> {
    if (!this.recallConfig) return false
    try {
      const url = new URL(`${this.baseUrl}/internal/recall/conversations/${encodeURIComponent(conversationId)}/release`)
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.recallConfig.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ actor_id: currentActorId }),
        signal: AbortSignal.timeout(15000),
      })
      const success = response.ok
      if (success) Logger.info(`[TOTAL RECALL] Session ${conversationId} released`)
      return success
    } catch (error) {
      Logger.error("[TOTAL RECALL] Failed to release session:", error)
      return false
    }
  }

  async getSessionLockStatus(conversationId: string): Promise<{ locked: boolean; lockedBy?: string; lockExpiresAt?: string }> {
    const snapshot = await this.getSessionSnapshot(conversationId)
    return { locked: !!snapshot.lockedBy, lockedBy: snapshot.lockedBy, lockExpiresAt: snapshot.lockExpiresAt }
  }

  async getCurrentActorId(conversationId: string): Promise<string | undefined> {
    const snapshot = await this.getSessionSnapshot(conversationId)
    return snapshot.currentActorId || snapshot.metadata?.actorId
  }
}
