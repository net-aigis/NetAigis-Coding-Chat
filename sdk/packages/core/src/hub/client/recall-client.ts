/** One RPC contract for the existing owning runtime, shared by VS Code and browser clients. */
import type { HubCommandName } from "@cline/shared";
import type {
	TotalRecallConversation,
	TotalRecallProject,
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
	async listProjects(): Promise<TotalRecallProject[]> {
		const result = await this.request("session.recall.projects", {});
		if (
			!Array.isArray(result.projects) ||
			result.projects.some(
				(project) =>
					!project ||
					typeof project.projectId !== "string" ||
					!project.projectId.trim(),
			) ||
			new Set(result.projects.map((project) => project.projectId)).size !==
				result.projects.length
		)
			throw new Error("Runtime Recall project list was not confirmed");
		return result.projects as TotalRecallProject[];
	}
	async listConversations(
		projectId?: string,
	): Promise<TotalRecallConversation[]> {
		const result = await this.request(
			"session.recall.list",
			projectId === undefined ? {} : { projectId },
		);
		if (
			!Array.isArray(result.conversations) ||
			(projectId !== undefined &&
				result.conversations.some(
					(conversation) =>
						!conversation || conversation.projectId !== projectId,
				))
		)
			throw new Error("Runtime Recall list was not confirmed");
		return result.conversations as TotalRecallConversation[];
	}
	async getSessionSnapshot(
		conversationId: string,
		projectId?: string,
	): Promise<TotalRecallSessionSnapshot> {
		const result = await this.request(
			"session.recall.inspect",
			{ conversationId, ...(projectId === undefined ? {} : { projectId }) },
			conversationId,
		);
		const value = result.snapshot as TotalRecallSessionSnapshot | undefined;
		if (
			!value ||
			value.conversationId !== conversationId ||
			(projectId !== undefined && value.projectId !== projectId) ||
			!Number.isSafeInteger(value.journalSeq) ||
			typeof value.sourceVerified !== "boolean"
		)
			throw new Error("Runtime Recall snapshot was not confirmed");
		return value;
	}
	async restoreSession(
		conversationId: string,
		expectedJournalSeq: number,
		projectId?: string,
	): Promise<string> {
		const result = await this.request(
			"session.recall.restore",
			{
				conversationId,
				expectedJournalSeq,
				...(projectId === undefined ? {} : { projectId }),
			},
			conversationId,
		);
		if (
			result.sessionId !== conversationId ||
			(projectId !== undefined && result.projectId !== projectId) ||
			result.imported !== true ||
			result.writerGranted !== false ||
			result.runtimeResident !== false
		)
			throw new Error("Runtime Recall import was not confirmed");
		return conversationId;
	}
}
