/** A transport connection to the existing SDK hub, separate from model routing. */
import { NodeHubClient, type SessionWriterControl } from "@cline/core/hub"
import { StateManager } from "@/core/storage/StateManager"

const CONNECTION_KEY = "shared-session-hub_connection"
export interface SharedSessionHubConnection {
	endpoint: string
	authToken: string
}
export interface SharedSessionWriterSnapshot {
	sessionId: string
	actorId: string
	control: SessionWriterControl
}
export interface SharedSessionRecallProjectSnapshot {
	sessionId: string
	actorId: string
	projectId?: string
}

/** Only these fixed, credential-free messages may be displayed by the setup command. */
export class SharedRuntimeConfigurationError extends Error {}

// A storage refresh in another window must not redirect this window's history
// or Recall reads away from its already selected owning Runtime.
const selectedConnections = new WeakMap<StateManager, { connection?: SharedSessionHubConnection; uncertain?: true }>()

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
	if (endpoint.protocol === "ws:" && !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) {
		throw new SharedRuntimeConfigurationError(
			"Persönliche Runtime-Zugänge benötigen TLS oder einen lokalen Loopback-Endpunkt.",
		)
	}
	return { endpoint: value.endpoint, authToken: value.authToken }
}

/** Authentication probe only: no session start, writer claim, discovery or local fallback. */
export async function verifySharedSessionHubActor(value: SharedSessionHubConnection): Promise<string> {
	const configuration = validateSharedSessionHubConnection(value)
	const client = new NodeHubClient({
		url: configuration.endpoint,
		authToken: configuration.authToken,
		allowLocalHubRecovery: false,
		clientType: "vscode",
		displayName: "NetAigis Coding Chat – Verbindungsprüfung",
	})
	try {
		await client.connect()
		const actor = client.getAuthenticatedActorId()
		if (!actor?.trim()) {
			throw new SharedRuntimeConfigurationError("Die Runtime hat keine persönliche Benutzeridentität bestätigt.")
		}
		return actor
	} catch (error) {
		if (error instanceof SharedRuntimeConfigurationError) throw error
		throw new SharedRuntimeConfigurationError(
			"Die persönliche Anmeldung an der gewählten Runtime konnte nicht bestätigt werden.",
		)
	} finally {
		client.close()
	}
}

export function getSharedSessionHubConnection(): SharedSessionHubConnection | undefined {
	const state = StateManager.get()
	const selected = selectedConnections.get(state)
	if (selected?.uncertain) {
		throw new SharedRuntimeConfigurationError(
			"Der gespeicherte Runtime-Zustand ist ungeklärt; den geschützten Konfigurationsspeicher prüfen.",
		)
	}
	if (selected) return selected.connection ? { ...selected.connection } : undefined
	const serialized = state.getSecretKey(CONNECTION_KEY)
	if (serialized === undefined) {
		selectedConnections.set(state, {})
		return undefined
	}
	try {
		const value: unknown = JSON.parse(serialized)
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid connection")
		const connection = validateSharedSessionHubConnection(value as SharedSessionHubConnection)
		selectedConnections.set(state, { connection })
		return { ...connection }
	} catch {
		// Invalid saved selection must not silently create a local conversation.
		throw new Error("Saved shared-session connection is invalid; no replacement runtime was selected")
	}
}

export async function saveSharedSessionHubConnection(value: SharedSessionHubConnection): Promise<void> {
	const configuration = validateSharedSessionHubConnection(value)
	const state = StateManager.get()
	const previous = state.getSecretKey(CONNECTION_KEY)
	state.setSecret(CONNECTION_KEY, JSON.stringify(configuration))
	try {
		await state.flushPendingState()
		selectedConnections.set(state, { connection: configuration })
	} catch {
		// setSecret updates the cache before writing. Do not leave a failed selection
		// active in memory or queued for a later debounced write.
		state.setSecret(CONNECTION_KEY, previous)
		try {
			await state.flushPendingState()
		} catch {
			selectedConnections.set(state, { uncertain: true })
			throw new SharedRuntimeConfigurationError(
				"Runtime-Auswahl und Wiederherstellung konnten nicht gespeichert werden. Den geschützten Konfigurationsspeicher vor weiterer Nutzung prüfen.",
			)
		}
		throw new SharedRuntimeConfigurationError(
			"Die Runtime-Auswahl wurde nicht gespeichert; die bisherige Auswahl wurde wiederhergestellt.",
		)
	}
}
