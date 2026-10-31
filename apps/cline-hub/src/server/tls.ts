import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import type { ClineHubServerOptions } from "../options";

/** Consume operator-selected existing TLS files. Never generate or chmod production keys. */
export async function loadDashboardTls(
	options: ClineHubServerOptions["tls"],
): Promise<{ key: Buffer; cert: Buffer } | undefined> {
	if (!options) return undefined;
	try {
		if ((await lstat(options.keyFile)).isSymbolicLink()) throw new Error();
		const handle = await open(
			options.keyFile,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
		);
		try {
			const stat = await handle.stat();
			if (
				!stat.isFile() ||
				(stat.mode & 0o077) !== 0 ||
				stat.size > 65536 ||
				(process.getuid && stat.uid !== process.getuid())
			)
				throw new Error();
			return {
				key: await handle.readFile(),
				cert: await readFile(options.certFile),
			};
		} finally {
			await handle.close();
		}
	} catch {
		throw new Error(
			"Dashboard TLS files are unreadable or the private key is insufficiently protected",
		);
	}
}
