/** One RPC contract for the existing owning runtime, shared by VS Code and browser clients. */
import type { HubCommandName } from "@cline/shared";
import type {
	TotalRecallConversation,
	TotalRecallSessionSnapshot,
} from "../../services/recall-session-reader";
import type { NodeHubClient } from "./index";

export class HubRecallClient {
	constructor(private readonly client: Pick<NodeHubClient, "command">) {}
	private async request(
		command: HubCommandName,
		payload: Record<string, unknown>,
		id?: string,
	) {
		const reply = await this.client.command(command, payload, id, {
			retryAfterDispatch: command !== "session.recall.restore",
		});
		if (!reply.ok || !reply.payload)
			throw new Error("Runtime Recall operation was not confirmed");
		return reply.payload;
	}
	async listConversations(): Promise<TotalRecallConversation[]> {
		const result = await this.request("session.recall.list", {});
		if (!Array.isArray(result.conversations))
			throw new Error("Runtime Recall list was not confirmed");
		return result.conversations as TotalRecallConversation[];
	}
	async getSessionSnapshot(
		conversationId: string,
	): Promise<TotalRecallSessionSnapshot> {
		const result = await this.request(
			"session.recall.inspect",
			{ conversationId },
			conversationId,
		);
		const value = result.snapshot as TotalRecallSessionSnapshot | undefined;
		if (
			!value ||
			value.conversationId !== conversationId ||
			!Number.isSafeInteger(value.journalSeq) ||
			typeof value.sourceVerified !== "boolean"
		)
			throw new Error("Runtime Recall snapshot was not confirmed");
		return value;
	}
	async restoreSession(
		conversationId: string,
		expectedJournalSeq: number,
	): Promise<string> {
		const result = await this.request(
			"session.recall.restore",
			{ conversationId, expectedJournalSeq },
			conversationId,
		);
		if (
			result.sessionId !== conversationId ||
			result.imported !== true ||
			result.writerGranted !== false ||
			result.runtimeResident !== false
		)
			throw new Error("Runtime Recall import was not confirmed");
		return conversationId;
	}
}
