/** Durable replay of the existing TOTAL RECALL event API, with original attribution. */
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fetch } from "@/shared/net"
import { getExtensionStorageRoot } from "@/shared/storage/storage-context"

export interface RecallEvent {
	event_id: string
	project_id: string
	conversation_id: string
	actor_id: string
	kind: string
	payload: Record<string, unknown>
}
export interface RecallConfiguration {
	baseUrl: string
	token: string
	project: string
	actor: string
	enabled: boolean
}
interface QueuedRecallEvent extends RecallEvent {
	_outbox: { version: 1; destination: string }
}
export interface RecallDrainResult {
	sent: number
	pending: number
	blocked?: "unbound_legacy" | "invalid_record" | "delivery_failed"
}
const queueDir = getExtensionStorageRoot()
	? path.join(getExtensionStorageRoot()!, "netaigis-recall-outbox")
	: process.env.NETAIGIS_RECALL_QUEUE_DIR || path.join(os.homedir(), ".cline", "netaigis-recall-outbox")
let writes = Promise.resolve()
let activeDrain: Promise<RecallDrainResult> | undefined
let lastStamp = 0
const retry = new Map<string, { next: number; delay: number }>()
const providers = new Set<() => Promise<RecallConfiguration | undefined>>()
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retryAt = 0

function endpoint(config: RecallConfiguration): string {
	return config.baseUrl.replace(/\/+$/, "")
}
function scope(config: RecallConfiguration): string {
	return createHash("sha256")
		.update(JSON.stringify([endpoint(config), config.project, config.actor]))
		.digest("hex")
}
function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { value }
}
export function getRecallSessionId(event: unknown): string | undefined {
	const record = asRecord(event)
	const payload = asRecord(record.payload)
	// Core's payload sessionId is the host-owned ID; do not substitute the
	// agent runtime's independently generated conversationId for it.
	for (const value of [record.sessionId, payload.sessionId, record.taskId, record.conversationId]) {
		if (typeof value === "string" && value) return value
	}
	return record.event && typeof record.event === "object" ? getRecallSessionId(record.event) : undefined
}

function scheduleRetry(at: number): void {
	if (!providers.size || (retryTimer && retryAt <= at)) return
	if (retryTimer) clearTimeout(retryTimer)
	retryAt = at
	retryTimer = setTimeout(
		() => {
			retryTimer = undefined
			retryAt = 0
			void replayConfigured().catch(() => {})
		},
		Math.max(1, at - Date.now()),
	)
	retryTimer.unref?.()
}
async function replayConfigured(): Promise<void> {
	for (const getConfig of providers) {
		const config = await getConfig()
		if (!config?.enabled) continue
		const next = retry.get(scope(config))?.next ?? 0
		if (next > Date.now()) scheduleRetry(next)
		else await drainRecallOutbox(config)
	}
}
export function startRecallOutbox(getConfig: () => Promise<RecallConfiguration | undefined>): () => void {
	providers.add(getConfig)
	void replayConfigured().catch(() => {})
	return () => {
		providers.delete(getConfig)
		if (!providers.size && retryTimer) {
			clearTimeout(retryTimer)
			retryTimer = undefined
			retryAt = 0
		}
	}
}
export async function flushRecallOutboxWrites(): Promise<void> {
	await writes
}

function validRecord(record: unknown): record is QueuedRecallEvent {
	if (!record || typeof record !== "object") return false
	const value = record as QueuedRecallEvent
	return [value.event_id, value.project_id, value.conversation_id, value.actor_id, value.kind].every(
		(field) => typeof field === "string" && field.length > 0,
	)
}
async function send(record: QueuedRecallEvent, config: RecallConfiguration): Promise<void> {
	const { _outbox, ...event } = record
	const response = await fetch(`${endpoint(config)}/internal/recall/events`, {
		method: "POST",
		headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
		body: JSON.stringify(event),
		signal: AbortSignal.timeout(10000),
	})
	if (!response.ok) throw new Error(`TOTAL RECALL HTTP ${response.status}`)
	const acknowledgement = asRecord(await response.json())
	// The server also acknowledges an identical, already inserted event with
	// inserted:false. An unrelated 200 response is not proof of durable receipt.
	if (acknowledgement.event_id !== record.event_id || typeof acknowledgement.inserted !== "boolean") {
		throw new Error("TOTAL RECALL event acknowledgement missing or mismatched")
	}
}

/** Explicit calls retry immediately; automatic event delivery observes backoff. */
export async function drainRecallOutbox(config?: RecallConfiguration): Promise<RecallDrainResult> {
	if (!config?.enabled) return { sent: 0, pending: 0 }
	await writes
	if (activeDrain) {
		await activeDrain
		return drainRecallOutbox(config)
	}
	const activeConfig = { ...config }
	const run = async (): Promise<RecallDrainResult> => {
		await fs.mkdir(queueDir, { recursive: true, mode: 0o700 })
		const files = (await fs.readdir(queueDir)).filter((name) => name.endsWith(".json")).sort()
		const result: RecallDrainResult = { sent: 0, pending: files.length }
		for (const file of files) {
			const target = path.join(queueDir, file)
			let data: QueuedRecallEvent
			try {
				if (!(await fs.lstat(target)).isFile()) {
					result.blocked = "invalid_record"
					break
				}
				data = JSON.parse(await fs.readFile(target, "utf8"))
				if (!validRecord(data)) {
					result.blocked = "invalid_record"
					break
				}
			} catch {
				result.blocked = "invalid_record"
				break
			}
			// The actor token is bound server-side. Retain other actors' work;
			// never retag it or submit it with the currently selected actor's key.
			if (data.actor_id !== activeConfig.actor || data.project_id !== activeConfig.project) continue
			if (!data._outbox || data._outbox.version !== 1) {
				result.blocked = "unbound_legacy"
				break
			}
			if (data._outbox.destination !== endpoint(activeConfig)) continue
			try {
				await send(data, activeConfig)
				await fs.unlink(target)
				result.sent++
				result.pending--
				retry.delete(scope(activeConfig))
			} catch {
				result.blocked = "delivery_failed"
				const key = scope(activeConfig),
					delay = Math.min(300000, (retry.get(key)?.delay ?? 15000) * 2)
				const next = Date.now() + delay
				retry.set(key, { delay, next })
				scheduleRetry(next)
				break
			}
		}
		return result
	}
	const promise = run()
	activeDrain = promise
	try {
		return await promise
	} finally {
		if (activeDrain === promise) activeDrain = undefined
	}
}

/** Stage atomically before transmission. A successful stage is synced to disk. */
export async function archiveSdkEvent(event: unknown, config?: RecallConfiguration): Promise<void> {
	if (!config?.enabled) return
	const sessionId = getRecallSessionId(event)
	if (!sessionId) return
	const activeConfig = { ...config }
	const id = randomUUID()
	const record: QueuedRecallEvent = {
		event_id: id,
		project_id: activeConfig.project,
		conversation_id: sessionId,
		actor_id: activeConfig.actor,
		kind: "cline.sdk.event",
		payload: { sdk_event: JSON.parse(JSON.stringify(asRecord(event))), captured_at: new Date().toISOString() },
		_outbox: { version: 1, destination: endpoint(activeConfig) },
	}
	const stage = writes
		.catch(() => {})
		.then(async () => {
			await fs.mkdir(queueDir, { recursive: true, mode: 0o700 })
			// Pending records also fence the local sort counter after a restart
			// or a clock step backwards. This is queue order, not an invented time.
			const pending = (await fs.readdir(queueDir)).filter((name) => name.endsWith(".json"))
			for (const name of pending) {
				const stamp = Number(name.split("-")[0])
				if (Number.isFinite(stamp)) lastStamp = Math.max(lastStamp, stamp)
			}
			lastStamp = Math.max(Date.now(), lastStamp + 1)
			const target = path.join(queueDir, `${String(lastStamp).padStart(13, "0")}-${id}.json`),
				temp = `${target}.tmp`
			try {
				const handle = await fs.open(temp, "wx", 0o600)
				try {
					await handle.writeFile(JSON.stringify(record), "utf8")
					await handle.sync()
				} finally {
					await handle.close()
				}
				await fs.rename(temp, target)
				const directory = await fs.open(queueDir, "r")
				try {
					await directory.sync()
				} finally {
					await directory.close()
				}
			} finally {
				await fs.unlink(temp).catch(() => {})
			}
		})
	writes = stage
	await stage
	if ((retry.get(scope(activeConfig))?.next ?? 0) <= Date.now()) await drainRecallOutbox(activeConfig)
}
export function recallEnabled(config?: RecallConfiguration): boolean {
	return config?.enabled === true
}
