/** Short-lived opaque browser tickets. Personal Hub credentials never enter browser storage. */
import { randomBytes } from "node:crypto";

const NAME = "__Host-netaigis_actor";
const LIFETIME = 12 * 60 * 60 * 1000;
interface ActorSession {
	actorId: string;
	credential: string;
	expires: number;
}

export class BrowserActorSessions {
	private readonly sessions = new Map<string, ActorSession>();
	constructor(private readonly now: () => number = Date.now) {}
	private id(request: Request): string | undefined {
		const matches = (request.headers.get("cookie") ?? "")
			.split(";")
			.map((part) => part.trim())
			.filter((part) => part.startsWith(`${NAME}=`));
		if (matches.length !== 1) return;
		const value = matches[0].slice(NAME.length + 1);
		return /^[a-f0-9]{64}$/.test(value) ? value : undefined;
	}
	read(request: Request): (ActorSession & { id: string }) | undefined {
		const id = this.id(request);
		if (!id) return;
		return this.lookup(id);
	}
	lookup(id: string): (ActorSession & { id: string }) | undefined {
		const value = this.sessions.get(id);
		if (!value) return;
		if (value.expires <= this.now()) {
			this.sessions.delete(id);
			return;
		}
		return { ...value, id };
	}
	issue(request: Request, actorId: string, credential: string): string {
		if (!actorId || !credential || credential.length > 4096)
			throw new Error("Invalid confirmed browser actor");
		this.remove(request);
		for (const [id, value] of this.sessions)
			if (value.expires <= this.now()) this.sessions.delete(id);
		// Bound retained credentials even if a client repeatedly authenticates without cookies.
		if (this.sessions.size >= 256)
			this.sessions.delete(this.sessions.keys().next().value!);
		const id = randomBytes(32).toString("hex");
		this.sessions.set(id, {
			actorId,
			credential,
			expires: this.now() + LIFETIME,
		});
		return `${NAME}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${LIFETIME / 1000}`;
	}
	remove(request: Request): string {
		const id = this.id(request);
		if (id) this.sessions.delete(id);
		return `${NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
	}
	clear(): void {
		this.sessions.clear();
	}
	revoke(id: string): void {
		this.sessions.delete(id);
	}
}

/** Bounded private JSON, independent of the dashboard's other request sizes. */
export async function readActorCredential(request: Request): Promise<string> {
	if (
		!request.headers
			.get("content-type")
			?.toLowerCase()
			.startsWith("application/json")
	)
		throw new Error("Invalid browser authentication request");
	const reader = request.body?.getReader();
	if (!reader) throw new Error("Invalid browser authentication request");
	try {
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > 8192) {
				await reader.cancel();
				throw new Error();
			}
			chunks.push(value);
		}
		const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (
			!body ||
			typeof body.credential !== "string" ||
			!body.credential.trim() ||
			body.credential.length > 4096
		)
			throw new Error();
		return body.credential;
	} catch {
		throw new Error("Invalid browser authentication request");
	} finally {
		reader.releaseLock();
	}
}
