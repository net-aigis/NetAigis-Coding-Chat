/** Host path/config adapter for the existing shared durable Recall outbox. */

import os from "node:os"
import path from "node:path"
import type { RecallConfiguration } from "@cline/core"
import { DurableRecallOutbox, getRecallSessionId } from "@cline/core"
import { fetch } from "@/shared/net"
import { getExtensionStorageRoot } from "@/shared/storage/storage-context"

export type { RecallConfiguration, RecallDrainResult, RecallEvent } from "@cline/core"
export { getRecallSessionId }
const root = getExtensionStorageRoot()
const queue = new DurableRecallOutbox(
	root
		? path.join(root, "netaigis-recall-outbox")
		: process.env.NETAIGIS_RECALL_QUEUE_DIR || path.join(os.homedir(), ".cline", "netaigis-recall-outbox"),
	(...args) => fetch(...args),
)
export const archiveSdkEvent = (event: unknown, config?: RecallConfiguration) => queue.archiveSdkEvent(event, config)
export const drainRecallOutbox = (config?: RecallConfiguration) => queue.drainRecallOutbox(config)
export const flushRecallOutboxWrites = () => queue.flushRecallOutboxWrites()
export const startRecallOutbox = (provider: () => Promise<RecallConfiguration | undefined>) => queue.startRecallOutbox(provider)
export function recallEnabled(config?: RecallConfiguration): boolean {
	return config?.enabled === true
}
