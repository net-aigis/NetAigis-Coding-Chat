/** A transport connection to the existing SDK hub, separate from model routing. */
import { StateManager } from "@/core/storage/StateManager"

const CONNECTION_KEY = "shared-session-hub_connection"
export interface SharedSessionHubConnection {
	endpoint: string
	authToken: string
}

export function validateSharedSessionHubConnection(value: SharedSessionHubConnection): SharedSessionHubConnection {
	let endpoint: URL
	try {
		endpoint = new URL(value.endpoint)
	} catch {
		throw new Error("Shared session hub requires an explicit WebSocket endpoint")
	}
	if (
		!["ws:", "wss:"].includes(endpoint.protocol) ||
		!endpoint.hostname ||
		endpoint.username ||
		endpoint.password ||
		endpoint.search ||
		endpoint.hash ||
		typeof value.authToken !== "string" ||
		!value.authToken.trim()
	) {
		// Never include the supplied endpoint, token or JSON in an exception.
		throw new Error("Shared session hub requires a WebSocket endpoint and a separate credential")
	}
	return { endpoint: value.endpoint, authToken: value.authToken }
}

export function getSharedSessionHubConnection(): SharedSessionHubConnection | undefined {
	const serialized = StateManager.get().getSecretKey(CONNECTION_KEY)
	if (serialized === undefined) return undefined
	try {
		const value: unknown = JSON.parse(serialized)
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid connection")
		return validateSharedSessionHubConnection(value as SharedSessionHubConnection)
	} catch {
		// Invalid saved selection must not silently create a local conversation.
		throw new Error("Saved shared-session connection is invalid; no replacement runtime was selected")
	}
}

export async function saveSharedSessionHubConnection(value: SharedSessionHubConnection): Promise<void> {
	const configuration = validateSharedSessionHubConnection(value)
	const state = StateManager.get()
	state.setSecret(CONNECTION_KEY, JSON.stringify(configuration))
	await state.flushPendingState()
}
