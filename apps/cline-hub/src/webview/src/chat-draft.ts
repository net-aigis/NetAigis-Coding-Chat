/** Tab-local UI drafts; never a transcript, credential store or send queue. */
const prefix = "netaigis-chat-draft-v1:";
export function chatDraftKey(
	actorId?: string,
	sessionId?: string,
	workspaceRoot?: string,
): string | undefined {
	if (!actorId || (!sessionId && !workspaceRoot)) return undefined;
	return (
		prefix +
		JSON.stringify([
			actorId,
			sessionId ? "session" : "new",
			sessionId || workspaceRoot,
		])
	);
}
export function browserDraftStorage(): Storage | undefined {
	try {
		return window.sessionStorage;
	} catch {
		return undefined;
	}
}
export class ChatDrafts {
	private readonly memory = new Map<string, string>();
	private readonly failed = new Set<string>();
	private readonly storage: () => Storage | undefined;
	constructor(storage: () => Storage | undefined = browserDraftStorage) {
		this.storage = storage;
	}
	read(key?: string): { text: string; persistent: boolean } {
		if (!key) return { text: "", persistent: false };
		try {
			const store = this.storage();
			if (this.memory.has(key))
				return {
					text: this.memory.get(key)!,
					persistent: !!store && !this.failed.has(key),
				};
			const raw = store?.getItem(key);
			if (raw) {
				const value: unknown = JSON.parse(raw);
				if (
					!value ||
					typeof value !== "object" ||
					!("version" in value) ||
					value.version !== 1 ||
					!("text" in value) ||
					typeof value.text !== "string"
				)
					throw new Error("Unreadable draft");
				this.memory.set(key, value.text);
			}
			return { text: this.memory.get(key) ?? "", persistent: !!store };
		} catch {
			return { text: this.memory.get(key) ?? "", persistent: false };
		}
	}
	write(key: string | undefined, text: string): boolean {
		if (!key) return false;
		this.memory.set(key, text);
		try {
			const store = this.storage();
			if (!store) {
				this.failed.add(key);
				return false;
			}
			if (text) store.setItem(key, JSON.stringify({ version: 1, text }));
			else store.removeItem(key);
			this.failed.delete(key);
			return true;
		} catch {
			this.failed.add(key);
			return false;
		}
	}
}
/** Explicit sign-out removes only this actor's tab drafts; connection loss does not. */
export function forgetActorDrafts(actorId?: string): void {
	if (!actorId) return;
	try {
		const store = browserDraftStorage();
		if (!store) return;
		const keys = Array.from({ length: store.length }, (_, index) =>
			store.key(index),
		);
		for (const key of keys) {
			if (!key?.startsWith(prefix)) continue;
			try {
				const scope: unknown = JSON.parse(key.slice(prefix.length));
				if (Array.isArray(scope) && scope[0] === actorId) store.removeItem(key);
			} catch {
				/* Preserve unknown browser state. */
			}
		}
	} catch {
		/* Blocked tab storage must not prevent logout. */
	}
}
