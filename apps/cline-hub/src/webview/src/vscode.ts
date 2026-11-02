import type {
	WebviewInboundMessage,
	WebviewOutboundMessage,
} from "../../webview-protocol";

type VsCodeApi = {
	postMessage(message: WebviewInboundMessage): void;
	getState(): unknown;
	setState(state: unknown): void;
};

declare global {
	interface Window {
		acquireVsCodeApi?: () => VsCodeApi;
	}
}

let cachedApi: VsCodeApi | undefined;
let browserSocket: WebSocket | undefined;
const pendingMessages: WebviewInboundMessage[] = [];
const stateKey = "cline-hub-webview-state";
let pendingActorCredential:
	| { credential: string; authRequestId: string }
	| undefined;
let actorPersistence: Promise<void> = Promise.resolve();
let actorPersistenceGeneration = 0;
let confirmedBrowserActorId: string | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let hadBrowserConnection = false;
let selectedBrowserSessionId: string | undefined;
let needsFreshConnection = false;

function browserHidden(): boolean {
	return (
		typeof document !== "undefined" && document.visibilityState === "hidden"
	);
}

function scheduleBrowserReconnect(): void {
	if (reconnectTimer !== undefined || browserHidden()) return;
	const delay = Math.min(30_000, 500 * 2 ** Math.min(reconnectAttempt++, 6));
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		if (!browserHidden()) createBrowserSocket();
	}, delay);
}

function clearBrowserConnectionState(): void {
	pendingActorCredential = undefined;
	// A sent or interrupted write is never replayed after an uncertain delivery.
	pendingMessages.splice(0);
	dispatchHostMessage({ type: "shared_actor" });
	dispatchHostMessage({
		type: "status",
		text: "Disconnected from the Cline Hub server.",
	});
}

function resumeBrowserConnection(): void {
	if (browserHidden()) return;
	if (needsFreshConnection && browserSocket) {
		const old = browserSocket;
		browserSocket = undefined;
		clearBrowserConnectionState();
		old.close();
	}
	needsFreshConnection = false;
	createBrowserSocket();
}

function installBrowserWakeHandlers(): void {
	if (typeof document !== "undefined") {
		needsFreshConnection = browserHidden();
		document.addEventListener("visibilitychange", () => {
			if (browserHidden()) {
				needsFreshConnection = true;
				if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
				reconnectTimer = undefined;
			} else resumeBrowserConnection();
		});
	}
	window.addEventListener("offline", () => {
		needsFreshConnection = true;
	});
	window.addEventListener("online", resumeBrowserConnection);
	window.addEventListener("focus", resumeBrowserConnection);
	window.addEventListener("pageshow", (event) => {
		if ("persisted" in event && event.persisted) needsFreshConnection = true;
		resumeBrowserConnection();
	});
}

/** Display state only, from this socket's server acknowledgements; never a credential or writer grant. */
export function getConfirmedBrowserActorId(): string | undefined {
	return confirmedBrowserActorId;
}

function actorSessionUrl(): string {
	const url = new URL("/actor-session", window.location.origin);
	const invite = readBrowserRoomSecret();
	if (invite) url.searchParams.set("roomSecret", invite);
	return url.toString();
}

function rememberConfirmedActor(actorId: string, authRequestId?: string): void {
	if (!authRequestId || pendingActorCredential?.authRequestId !== authRequestId)
		return;
	const credential = pendingActorCredential.credential;
	pendingActorCredential = undefined;
	if (!credential || window.location.protocol !== "https:") return;
	const generation = actorPersistenceGeneration;
	actorPersistence = actorPersistence
		.catch(() => {})
		.then(async () => {
			if (generation !== actorPersistenceGeneration) return;
			const response = await fetch(actorSessionUrl(), {
				method: "POST",
				credentials: "same-origin",
				redirect: "error",
				cache: "no-store",
				headers: {
					"Content-Type": "application/json",
					"X-NetAigis-Auth-Request": authRequestId,
				},
				body: JSON.stringify({ credential }),
			});
			if (!response.ok || (await response.json()).actorId !== actorId)
				throw new Error();
		})
		.catch(() => {
			dispatchHostMessage({
				type: "error",
				text: "Die persönliche Verbindung funktioniert, konnte aber nicht für das Neuladen gespeichert werden. Erneut anmelden.",
			});
		});
}

export async function forgetBrowserActor(): Promise<void> {
	++actorPersistenceGeneration;
	pendingActorCredential = undefined;
	await actorPersistence;
	const response = await fetch(actorSessionUrl(), {
		method: "DELETE",
		credentials: "same-origin",
		redirect: "error",
		cache: "no-store",
	});
	if (!response.ok)
		throw new Error("Die Browser-Anmeldung konnte nicht gelöscht werden.");
	browserSocket?.close();
	dispatchHostMessage({ type: "shared_actor" });
}

function dispatchHostMessage(message: WebviewOutboundMessage): void {
	if (message.type === "shared_actor")
		confirmedBrowserActorId = message.actorId;
	window.dispatchEvent(new MessageEvent("message", { data: message }));
}

function readBrowserRoomSecret(): string | undefined {
	const roomSecret = new URLSearchParams(window.location.search)
		.get("roomSecret")
		?.trim();
	return roomSecret || undefined;
}

function createBrowserSocket(): WebSocket {
	if (
		browserSocket &&
		(browserSocket.readyState === WebSocket.OPEN ||
			browserSocket.readyState === WebSocket.CONNECTING)
	) {
		return browserSocket;
	}

	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
	reconnectTimer = undefined;
	const params = new URLSearchParams();
	const roomSecret = readBrowserRoomSecret();
	if (roomSecret) {
		params.set("roomSecret", roomSecret);
	}
	const query = params.toString();
	const socketUrl = `${protocol}//${window.location.host}/browser${query ? `?${query}` : ""}`;
	const socket = new WebSocket(socketUrl);
	browserSocket = socket;
	socket.addEventListener("open", () => {
		if (browserSocket !== socket) return;
		if (hadBrowserConnection) {
			dispatchHostMessage({
				type: "status",
				text: "Verbindung wiederhergestellt.",
			});
			// Cookie authentication is revalidated by the server. Only reads resume.
			socket.send(JSON.stringify({ type: "ready" }));
			if (selectedBrowserSessionId)
				socket.send(
					JSON.stringify({
						type: "attachSession",
						sessionId: selectedBrowserSessionId,
					}),
				);
		}
		hadBrowserConnection = true;
		for (const message of pendingMessages.splice(0)) {
			socket.send(JSON.stringify(message));
		}
	});
	socket.addEventListener("message", (event) => {
		if (browserSocket !== socket) return;
		try {
			const message = JSON.parse(String(event.data)) as WebviewOutboundMessage;
			reconnectAttempt = 0;
			if (
				message.type === "session_started" ||
				message.type === "session_hydrated"
			)
				selectedBrowserSessionId = message.sessionId;
			if (message.type === "reset_done") selectedBrowserSessionId = undefined;
			if (message.type === "shared_actor" && message.actorId)
				rememberConfirmedActor(message.actorId, message.authRequestId);
			if (message.type === "error") pendingActorCredential = undefined;
			dispatchHostMessage(message);
		} catch {
			pendingMessages.splice(0);
			dispatchHostMessage({
				type: "error",
				text: "Received an invalid message from the Cline Hub server.",
			});
		}
	});
	socket.addEventListener("close", () => {
		if (browserSocket !== socket) return;
		clearBrowserConnectionState();
		scheduleBrowserReconnect();
	});
	socket.addEventListener("error", () => {
		if (browserSocket !== socket) return;
		pendingMessages.splice(0);
		dispatchHostMessage({
			type: "error",
			text: "Failed to connect to the Cline Hub server.",
		});
	});
	return browserSocket;
}

function createBrowserApi(): VsCodeApi {
	selectedBrowserSessionId =
		new URLSearchParams(window.location.search).get("id") || undefined;
	installBrowserWakeHandlers();
	return {
		postMessage(message) {
			if (message.type === "attachSession")
				selectedBrowserSessionId = message.sessionId;
			if (message.type === "authenticateActor") {
				const authRequestId = crypto.randomUUID();
				pendingActorCredential = {
					credential: message.credential,
					authRequestId,
				};
				message = { ...message, authRequestId };
				++actorPersistenceGeneration;
			}
			const socket = createBrowserSocket();
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify(message));
				return;
			}
			pendingMessages.push(message);
		},
		getState() {
			try {
				const raw = window.localStorage.getItem(stateKey);
				return raw ? JSON.parse(raw) : undefined;
			} catch {
				return undefined;
			}
		},
		setState(state) {
			try {
				window.localStorage.setItem(stateKey, JSON.stringify(state ?? {}));
			} catch {
				// Browser persistence is best-effort.
			}
		},
	};
}

export function getVsCodeApi(): VsCodeApi | undefined {
	if (cachedApi) {
		return cachedApi;
	}
	if (typeof window.acquireVsCodeApi === "function") {
		cachedApi = window.acquireVsCodeApi();
		return cachedApi;
	}
	cachedApi = createBrowserApi();
	return cachedApi;
}

export function postToHost(message: WebviewInboundMessage): void {
	getVsCodeApi()?.postMessage(message);
}

export type { WebviewOutboundMessage };
