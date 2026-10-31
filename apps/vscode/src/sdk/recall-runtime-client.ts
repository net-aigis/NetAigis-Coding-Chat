/** Archive operations on the explicitly selected owning runtime; never spawns a Hub. */
import type { TotalRecallConversation, TotalRecallSessionSnapshot } from "@cline/core"
import { NodeHubClient } from "@cline/core/hub"
import type { HubCommandName } from "@cline/shared"
import { type SharedSessionHubConnection, validateSharedSessionHubConnection } from "./shared-session-hub"

export class RecallRuntimeClient {
	private readonly connection: SharedSessionHubConnection
	constructor(connection: SharedSessionHubConnection) {
		this.connection = validateSharedSessionHubConnection(connection)
	}
	matchesConnection(connection: SharedSessionHubConnection | undefined): boolean {
		return connection?.endpoint === this.connection.endpoint && connection.authToken === this.connection.authToken
	}
	private async request(command: HubCommandName, payload: Record<string, unknown>, id?: string) {
		const client = new NodeHubClient({
			url: this.connection.endpoint,
			authToken: this.connection.authToken,
			clientType: "vscode",
			displayName: "NetAigis Coding Chat – TOTAL RECALL",
		})
		try {
			const reply = await client.command(command, payload, id, { retryAfterDispatch: command !== "session.recall.restore" })
			if (!reply.ok || !reply.payload) throw new Error("Runtime Recall operation was not confirmed")
			return reply.payload
		} finally {
			client.close()
		}
	}
	async listConversations(): Promise<TotalRecallConversation[]> {
		const result = await this.request("session.recall.list", {})
		if (!Array.isArray(result.conversations)) throw new Error("Runtime Recall list was not confirmed")
		return result.conversations as TotalRecallConversation[]
	}
	async getSessionSnapshot(conversationId: string): Promise<TotalRecallSessionSnapshot> {
		const result = await this.request("session.recall.inspect", { conversationId }, conversationId)
		const value = result.snapshot as TotalRecallSessionSnapshot | undefined
		if (
			!value ||
			value.conversationId !== conversationId ||
			!Number.isSafeInteger(value.journalSeq) ||
			typeof value.sourceVerified !== "boolean"
		)
			throw new Error("Runtime Recall snapshot was not confirmed")
		return value
	}
	async restoreSession(conversationId: string, expectedJournalSeq: number): Promise<string> {
		const result = await this.request("session.recall.restore", { conversationId, expectedJournalSeq }, conversationId)
		if (
			result.sessionId !== conversationId ||
			result.imported !== true ||
			result.writerGranted !== false ||
			result.runtimeResident !== false
		)
			throw new Error("Runtime Recall import was not confirmed")
		return conversationId
	}
}
