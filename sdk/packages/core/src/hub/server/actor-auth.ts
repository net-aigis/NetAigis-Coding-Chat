import { timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

/** Optional path is supplied by the operator; no default store or credentials are created. */
export async function readProtectedActorTokens(
	path: string | undefined,
): Promise<Readonly<Record<string, string>> | undefined> {
	if (path === undefined) return undefined;
	try {
		if (!path.trim() || (await lstat(path)).isSymbolicLink()) throw new Error();
		const handle = await open(
			path,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
		);
		try {
			const stat = await handle.stat();
			if (
				!stat.isFile() ||
				stat.size > 65536 ||
				(stat.mode & 0o077) !== 0 ||
				(process.getuid && stat.uid !== process.getuid())
			)
				throw new Error();
			const tokens: Readonly<Record<string, string>> = JSON.parse(
				await handle.readFile("utf8"),
			);
			new HubActorRegistry(tokens);
			return tokens;
		} finally {
			await handle.close();
		}
	} catch {
		throw new Error(
			"Protected actor authentication configuration is unreadable, invalid or insufficiently protected",
		);
	}
}

/** Supplied by the owning process from protected configuration; never client metadata. */
export class HubActorRegistry {
	private readonly actors: Array<{ actorId: string; token: Buffer }> = [];
	constructor(tokens: Readonly<Record<string, string>>) {
		if (
			!tokens ||
			typeof tokens !== "object" ||
			Array.isArray(tokens) ||
			!Object.keys(tokens).length
		)
			throw new Error(
				"Actor authentication requires a nonempty protected token registry",
			);
		const seen = new Set<string>();
		for (const [actorId, token] of Object.entries(tokens)) {
			if (
				!actorId ||
				actorId !== actorId.trim() ||
				typeof token !== "string" ||
				!token.trim() ||
				token !== token.trim() ||
				seen.has(token)
			)
				throw new Error(
					"Actor authentication configuration is invalid or ambiguous",
				);
			seen.add(token);
			this.actors.push({ actorId, token: Buffer.from(token) });
		}
	}
	resolve(token: string | null): string | undefined {
		if (!token) return undefined;
		const candidate = Buffer.from(token);
		let actor: string | undefined;
		for (const entry of this.actors) {
			if (
				candidate.length === entry.token.length &&
				timingSafeEqual(candidate, entry.token)
			)
				actor = entry.actorId;
		}
		return actor;
	}
}
