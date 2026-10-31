/** Archive operations on the explicitly selected owning runtime; never spawns a Hub. */
import type { TotalRecallConversation, TotalRecallSessionSnapshot } from "@cline/core"
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
	listConversations(): Promise<TotalRecallConversation[]> {
		return this.usingClient((client) => client.listConversations())
	}
	getSessionSnapshot(id: string): Promise<TotalRecallSessionSnapshot> {
		return this.usingClient((client) => client.getSessionSnapshot(id))
	}
	restoreSession(id: string, seq: number): Promise<string> {
		return this.usingClient((client) => client.restoreSession(id, seq))
	}
}
