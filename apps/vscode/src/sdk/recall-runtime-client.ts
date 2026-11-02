/** Archive operations on the explicitly selected owning runtime; never spawns a Hub. */
import type { TotalRecallConversation, TotalRecallProject, TotalRecallSessionSnapshot } from "@cline/core"
import { HubRecallClient, NodeHubClient } from "@cline/core/hub"
import { type SharedSessionHubConnection, validateSharedSessionHubConnection } from "./shared-session-hub"

export class RecallRuntimeClient {
	private readonly connection: SharedSessionHubConnection
	constructor(connection: SharedSessionHubConnection) {
		this.connection = validateSharedSessionHubConnection(connection)
	}
	matchesConnection(connection: SharedSessionHubConnection | undefined): boolean {
		return connection?.endpoint === this.connection.endpoint && connection.authToken === this.connection.authToken
	}
	private async usingClient<T>(operation: (recall: HubRecallClient) => Promise<T>): Promise<T> {
		const client = new NodeHubClient({
			url: this.connection.endpoint,
			allowLocalHubRecovery: false,
			authToken: this.connection.authToken,
			clientType: "vscode",
			displayName: "NetAigis Coding Chat – TOTAL RECALL",
		})
		try {
			return await operation(new HubRecallClient(client))
		} finally {
			client.close()
		}
	}
	listProjects(): Promise<TotalRecallProject[]> {
		return this.usingClient((client) => client.listProjects())
	}
	listConversations(projectId?: string): Promise<TotalRecallConversation[]> {
		return this.usingClient((client) => client.listConversations(projectId))
	}
	getSessionSnapshot(id: string, projectId?: string): Promise<TotalRecallSessionSnapshot> {
		return this.usingClient((client) => client.getSessionSnapshot(id, projectId))
	}
	restoreSession(id: string, seq: number, projectId?: string): Promise<string> {
		return this.usingClient((client) => client.restoreSession(id, seq, projectId))
	}
}
