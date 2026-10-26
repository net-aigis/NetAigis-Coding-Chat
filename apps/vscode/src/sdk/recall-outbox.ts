/** Optional TOTAL RECALL event mirror. Never alters SDK event delivery. */

import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

interface RecallEvent {
	event_id: string
	project_id: string
	conversation_id: string
	actor_id: string
	kind: string
	payload: Record<string, unknown>
}

const baseUrl = process.env.NETAIGIS_RECALL_URL?.replace(/\/+$/, "")
const token = process.env.NETAIGIS_RECALL_TOKEN
const project = process.env.NETAIGIS_RECALL_PROJECT
const actor = process.env.NETAIGIS_RECALL_ACTOR
const enabled = Boolean(baseUrl && token && project && actor)
const queueDir = process.env.NETAIGIS_RECALL_QUEUE_DIR || path.join(os.homedir(), ".cline", "netaigis-recall-outbox")
let draining = false

function asRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
	return { value }
}

function getSessionId(event: unknown): string | undefined {
	const obj = asRecord(event)
	for (const field of ["sessionId", "conversationId", "taskId"]) {
		if (typeof obj[field] === "string" && obj[field]) return obj[field] as string
	}
	const nested = obj.event
	if (nested && typeof nested === "object") return getSessionId(nested)
	return undefined
}

async function send(event: RecallEvent): Promise<void> {
	const response = await fetch(`${baseUrl}/internal/recall/events`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify(event),
		signal: AbortSignal.timeout(10000),
	})
	if (!response.ok) throw new Error(`TOTAL RECALL HTTP ${response.status}`)
}

export async function drainRecallOutbox(): Promise<void> {
	if (!enabled || draining) return
	draining = true
	try {
		await fs.mkdir(queueDir, { recursive: true, mode: 0o700 })
		const files = (await fs.readdir(queueDir)).filter((name) => name.endsWith(".json")).sort()
		for (const file of files) {
			const fullPath = path.join(queueDir, file)
			try {
				const data = JSON.parse(await fs.readFile(fullPath, "utf8")) as RecallEvent
				await send(data)
				await fs.unlink(fullPath)
			} catch {
				// Preserve the record; retry on the next event or extension start.
				break
			}
		}
	} finally {
		draining = false
	}
}

/** Durable local staging before network transmission, with retry-stable event IDs. */
export async function archiveSdkEvent(event: unknown): Promise<void> {
	if (!enabled) return
	const sessionId = getSessionId(event)
	if (!sessionId) {
		// Do not invent a session identifier: this event needs an explicit mapping.
		return
	}
	const id = randomUUID()
	const record: RecallEvent = {
		event_id: id,
		project_id: project!,
		conversation_id: sessionId,
		actor_id: actor!,
		kind: "cline.sdk.event",
		payload: { sdk_event: asRecord(event), captured_at: new Date().toISOString() },
	}
	await fs.mkdir(queueDir, { recursive: true, mode: 0o700 })
	const target = path.join(queueDir, `${Date.now().toString().padStart(13, "0")}-${id}.json`)
	const temp = `${target}.tmp`
	try {
		await fs.writeFile(temp, JSON.stringify(record), { encoding: "utf8", mode: 0o600, flag: "wx" })
		await fs.rename(temp, target)
	} finally {
		await fs.unlink(temp).catch(() => {})
	}
	await drainRecallOutbox()
}

export function recallEnabled(): boolean {
	return enabled
}
