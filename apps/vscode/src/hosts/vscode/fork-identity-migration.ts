/** Explicit, verified transfer. Source context owns old secrets; importer never reads them through the new ID. */

import { createHash, randomUUID } from "node:crypto"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import type * as vscode from "vscode"
import { FORK_IDENTITY, LEGACY_EXTENSION_ID } from "../../shared/fork-identity"

const MANIFEST = "identity-transfer.json"
const RECEIPT = "identity-migration.json"
const JOURNAL = "identity-migration-journal.json"
type NativeContext = Pick<
	vscode.ExtensionContext,
	"extension" | "globalStorageUri" | "secrets" | "globalState" | "workspaceState"
>
type Entry = { path: string; sha256: string; executable: boolean; sqlite?: boolean }
interface Transfer {
	version: 1
	sourceId: string
	targetId: string
	files: Entry[]
	roots: { from: string; to: string }[]
	native: { secrets: Record<string, string>; globalState: Record<string, unknown>; workspaceState: Record<string, unknown> }
	secretKeysChecked: string[]
}
interface Journal {
	version: 1
	targetId: string
	digest: string
	files: { path: string; before?: string; after: string; executable: boolean }[]
	secrets: { key: string; before?: string; after: string }[]
	mementos: { scope: "globalState" | "workspaceState"; key: string; before?: unknown; after: unknown }[]
}
function decode(text: string) {
	try {
		return JSON.parse(text)
	} catch {
		throw new Error("Migration JSON is invalid; content withheld")
	}
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
function own(context: NativeContext) {
	if (context.extension.id !== FORK_IDENTITY.id) throw new Error("Migration target is not the approved fork identity")
}
function safe(root: string, relative: string): string {
	if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error("Migration root is a symlink")
	if (
		!relative ||
		relative.includes("\\") ||
		path.isAbsolute(relative) ||
		relative.split("/").some((p) => p === ".." || p === "." || !p)
	)
		throw new Error("Unsafe migration path")
	const result = path.resolve(root, relative)
	if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error("Migration path escapes its owner")
	let at = path.dirname(result)
	while (at !== path.resolve(root)) {
		if (fs.existsSync(at) && fs.lstatSync(at).isSymbolicLink()) throw new Error("Migration path traverses a symlink")
		at = path.dirname(at)
	}
	if (fs.existsSync(result) && fs.lstatSync(result).isSymbolicLink()) throw new Error("Migration file is a symlink")
	return result
}
function atomic(file: string, bytes: string | Buffer, executable = false) {
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
	const temp = `${file}.${randomUUID()}.tmp`
	try {
		const fd = fs.openSync(temp, "wx", executable ? 0o700 : 0o600)
		try {
			fs.writeFileSync(fd, bytes)
			fs.fsyncSync(fd)
		} finally {
			fs.closeSync(fd)
		}
		fs.renameSync(temp, file)
		const dir = fs.openSync(path.dirname(file), "r")
		try {
			fs.fsyncSync(dir)
		} finally {
			fs.closeSync(dir)
		}
	} finally {
		if (fs.existsSync(temp)) fs.unlinkSync(temp)
	}
}
function privateFile(file: string) {
	const st = fs.lstatSync(file)
	if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || (process.getuid && st.uid !== process.getuid()))
		throw new Error("Migration artifact must be an owner-private regular file")
}
function walk(root: string, relative = ""): string[] {
	if (!fs.existsSync(root)) return []
	const result: string[] = []
	for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
		const rel = relative ? `${relative}/${name}` : name,
			file = safe(root, rel),
			st = fs.lstatSync(file)
		if (st.isSymbolicLink()) throw new Error("Snapshot contains a symlink; no incomplete transfer was acknowledged")
		if (st.isDirectory()) result.push(...walk(root, rel))
		else if (st.isFile()) result.push(rel)
		else throw new Error("Snapshot contains an unsupported special file")
	}
	return result
}
function memento(source: vscode.Memento): Record<string, unknown> {
	return Object.fromEntries(source.keys().map((key) => [key, source.get(key)]))
}

/** Run only in the old extension's context, against explicit quiescent snapshot roots. No source writes. */
export async function exportIdentityTransfer(
	context: NativeContext,
	options: {
		directory: string
		roots: { from: string; to: string; originalFrom?: string }[]
		secretKeys: readonly string[]
	},
): Promise<{ files: number; digest: string }> {
	if (context.extension.id !== LEGACY_EXTENSION_ID)
		throw new Error("Old native secrets must be exported by their owning extension context")
	const dir = path.resolve(options.directory),
		st = fs.lstatSync(dir)
	if (!st.isDirectory() || st.isSymbolicLink() || st.mode & 0o077 || fs.readdirSync(dir).length)
		throw new Error("Select an existing empty private transfer directory")
	const native: Transfer["native"] = {
		secrets: Object.create(null),
		globalState: memento(context.globalState),
		workspaceState: memento(context.workspaceState),
	}
	const storage = context.secrets as typeof context.secrets & { keys?: () => Thenable<string[]> }
	const secretKeys = [...new Set([...options.secretKeys, ...(storage.keys ? await storage.keys() : [])])]
	for (const key of secretKeys) {
		try {
			const value = await context.secrets.get(key)
			if (value !== undefined) native.secrets[key] = value
		} catch {
			throw new Error("An old native secret could not be exported; transfer was not acknowledged")
		}
	}
	const entries: Entry[] = [],
		originals: { file: string; digest: string }[] = [],
		sourceListings: { root: string; files: string[] }[] = []
	for (const source of options.roots) {
		if (source.originalFrom && !path.isAbsolute(source.originalFrom))
			throw new Error("Original snapshot path must be absolute")
		if (!(source.to === "home" || source.to === "legacy" || source.to.startsWith("home/")))
			throw new Error("Unexpected source mapping")
		const from = path.resolve(source.from)
		safe(dir, `payload/${source.to}/probe`)
		if (!fs.existsSync(from))
			throw new Error("An explicit migration source is missing; no incomplete transfer was acknowledged")
		if (fs.lstatSync(from).isSymbolicLink() || dir.startsWith(from + path.sep)) throw new Error("Unsafe snapshot source")
		const listing = walk(from)
		sourceListings.push({ root: from, files: listing })
		for (const rel of listing) {
			if (rel.endsWith("-wal") || rel.endsWith("-shm")) {
				const base = safe(from, rel.slice(0, -4))
				if (fs.existsSync(base) && fs.readFileSync(base).subarray(0, 16).toString() === "SQLite format 3\0") continue
			} // Only actual SQLite sidecars are subsumed by the Backup API.
			const file = safe(from, rel),
				bytes = fs.readFileSync(file)
			if (rel.endsWith("objects/info/alternates") && bytes.toString().trim())
				throw new Error("Checkpoint has external Git objects; include a self-contained checkpoint snapshot")
			const destination = `${source.to}/${rel}`,
				target = safe(dir, `payload/${destination}`)
			if (entries.some((e) => e.path === destination)) throw new Error("Two snapshot sources overlap")
			const sqlite = bytes.subarray(0, 16).toString() === "SQLite format 3\0"
			const executable = !!(fs.statSync(file).mode & 0o100)
			if (sqlite) {
				fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
				const sqlite = (await import("node:sqlite")) as typeof import("node:sqlite") & {
					backup?: (db: import("node:sqlite").DatabaseSync, target: string) => Promise<unknown>
				}
				const { DatabaseSync, backup } = sqlite
				if (!backup) throw new Error("This host lacks the SQLite Backup API; no unsafe database copy was made")
				const db = new DatabaseSync(file, { readOnly: true })
				try {
					await backup(db, target)
				} finally {
					db.close()
				}
				fs.chmodSync(target, 0o600)
				checkDatabase(target)
			} else {
				atomic(target, bytes)
				originals.push({ file, digest: hash(bytes) })
			}
			entries.push({
				path: destination,
				sha256: hash(fs.readFileSync(target)),
				executable,
				...(sqlite ? { sqlite: true } : {}),
			})
		}
	}
	for (const source of sourceListings)
		if (JSON.stringify(walk(source.root)) !== JSON.stringify(source.files))
			throw new Error("Source files changed during export; use a quiescent snapshot")
	for (const item of originals)
		if (hash(fs.readFileSync(item.file)) !== item.digest)
			throw new Error("Source changed during export; use a quiescent snapshot")
	const transfer: Transfer = {
		version: 1,
		sourceId: LEGACY_EXTENSION_ID,
		targetId: FORK_IDENTITY.id,
		files: entries,
		// Snapshot locations differ from the original absolute pointers stored in session metadata.
		roots: options.roots.map((r) => ({ to: r.to, from: path.resolve(r.originalFrom ?? r.from) })),
		native,
		secretKeysChecked: secretKeys,
	}
	const json = JSON.stringify(transfer)
	atomic(path.join(dir, MANIFEST), json)
	return { files: entries.length, digest: hash(json) }
}
function readTransfer(directory: string): { transfer: Transfer; digest: string } {
	privateFile(path.join(directory, MANIFEST))
	const text = fs.readFileSync(path.join(directory, MANIFEST), "utf8"),
		transfer = decode(text) as Transfer
	if (
		transfer.version !== 1 ||
		transfer.sourceId !== LEGACY_EXTENSION_ID ||
		transfer.targetId !== FORK_IDENTITY.id ||
		!Array.isArray(transfer.files) ||
		!Array.isArray(transfer.roots) ||
		!transfer.native?.secrets ||
		!Array.isArray(transfer.secretKeysChecked)
	)
		throw new Error("Invalid identity transfer manifest")
	const paths = new Set<string>()
	for (const item of transfer.files) {
		if (!/^(home|legacy)\//.test(item.path) || paths.has(item.path)) throw new Error("Unexpected or duplicate transfer path")
		paths.add(item.path)
		const file = safe(directory, `payload/${item.path}`)
		privateFile(file)
		if (hash(fs.readFileSync(file)) !== item.sha256) throw new Error("Identity transfer checksum mismatch")
		if (item.sqlite) checkDatabase(file)
	}
	return { transfer, digest: hash(text) }
}
export function inspectIdentityTransfer(directory: string) {
	const { transfer, digest } = readTransfer(directory)
	return {
		sourceId: transfer.sourceId,
		targetId: transfer.targetId,
		files: transfer.files.length,
		secrets: Object.keys(transfer.native.secrets).length,
		digest,
	}
}
export async function inspectIdentityTarget(context: NativeContext, directory: string) {
	own(context)
	const { transfer } = readTransfer(directory)
	let existingNativeKeys = 0
	for (const key of Object.keys(transfer.native.secrets))
		if ((await context.secrets.get(key)) !== undefined) existingNativeKeys++
	return { ...inspectIdentityTransfer(directory), existingNativeKeys }
}
function checkDatabase(file: string) {
	// Loaded only when a database is actually transferred; never copy an active DB as ordinary bytes.
	const { DatabaseSync } = createRequire(path.join(process.cwd(), "identity-migration.cjs"))(
		"node:sqlite",
	) as typeof import("node:sqlite")
	const db = new DatabaseSync(file, { readOnly: true })
	try {
		if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
			throw new Error("SQLite migration integrity check failed")
	} finally {
		db.close()
	}
}
function rewritePath(value: string, roots: Transfer["roots"], target: string): string {
	for (const root of [...roots].sort((a, b) => b.from.length - a.from.length)) {
		if (value === root.from || value.startsWith(root.from + path.sep))
			return path.join(target, root.to, path.relative(root.from, value))
	}
	return value
}
function relocateMetadata(value: unknown, roots: Transfer["roots"], target: string): unknown {
	if (Array.isArray(value)) return value.map((v) => relocateMetadata(v, roots, target))
	if (!value || typeof value !== "object") return value
	return Object.fromEntries(
		Object.entries(value).map(([key, v]) => [
			key,
			typeof v === "string" &&
			/^(messages_?path|manifest_?path|compaction_?path|checkpoint_?path|shadowRepoPath)$/i.test(key)
				? rewritePath(v, roots, target)
				: relocateMetadata(v, roots, target),
		]),
	)
}

export function identityMigrationComplete(root: string): boolean {
	const file = path.join(root, RECEIPT)
	if (!fs.existsSync(file)) return false
	privateFile(file)
	const value = decode(fs.readFileSync(file, "utf8"))
	if (value.version !== 1 || value.targetId !== FORK_IDENTITY.id || value.complete !== true)
		throw new Error("Identity migration receipt is invalid")
	return true
}

/** A stale owner may only be recovered by explicit rollback, never silently replayed. */
function migrationLock(root: string, recover = false): () => void {
	const file = path.join(root, "identity-migration.lock")
	if (recover && fs.existsSync(file)) {
		privateFile(file)
		const owner = decode(fs.readFileSync(file, "utf8"))
		if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
			throw new Error("Invalid migration lock; preserve artifacts for recovery")
		try {
			process.kill(owner.pid, 0)
			throw new Error("A migration owner is still alive; rollback refused")
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
		}
		fs.unlinkSync(file)
	}
	const fd = fs.openSync(file, "wx", 0o600),
		nonce = randomUUID()
	try {
		fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce }))
		fs.fsyncSync(fd)
	} finally {
		fs.closeSync(fd)
	}
	return () => {
		if (fs.existsSync(file) && decode(fs.readFileSync(file, "utf8")).nonce === nonce) fs.unlinkSync(file)
	}
}

export async function importIdentityTransfer(
	context: NativeContext,
	directory: string,
): Promise<{ files: number; repeated: boolean }> {
	own(context)
	const target = context.globalStorageUri.fsPath,
		{ transfer, digest } = readTransfer(directory)

	fs.mkdirSync(target, { recursive: true, mode: 0o700 })
	const unlock = migrationLock(target)
	const journal: Journal = { version: 1, targetId: FORK_IDENTITY.id, digest, files: [], secrets: [], mementos: [] }
	try {
		if (identityMigrationComplete(target)) {
			if (decode(fs.readFileSync(path.join(target, RECEIPT), "utf8")).digest !== digest)
				throw new Error("Another transfer is already committed; existing data preserved")
			return { files: transfer.files.length, repeated: true }
		}
		if (fs.existsSync(path.join(target, JOURNAL)))
			throw new Error("An interrupted migration requires checked rollback before retry")
		const output = new Map<string, { bytes: Buffer; executable: boolean }>()
		for (const file of transfer.files) {
			let bytes = fs.readFileSync(safe(directory, `payload/${file.path}`))
			if (
				!file.sqlite &&
				file.path.endsWith(".json") &&
				!/(messages|conversation_history|context_history)/.test(path.basename(file.path))
			) {
				try {
					bytes = Buffer.from(JSON.stringify(relocateMetadata(decode(bytes.toString()), transfer.roots, target)))
				} catch {
					throw new Error("Snapshot JSON is invalid; no migration acknowledged")
				}
			}
			output.set(file.path, { bytes, executable: file.executable })
		}
		for (const [rel, values] of [
			["home/data/globalState.json", transfer.native.globalState],
			["home/data/secrets.json", transfer.native.secrets],
		] as const) {
			const source = output.get(rel),
				existing = source ? decode(source.bytes.toString()) : {}
			output.set(rel, { bytes: Buffer.from(JSON.stringify({ ...values, ...existing })), executable: false })
		}
		for (const file of transfer.files.filter((e) => e.sqlite)) {
			const staged = safe(target, `identity-stage-${randomUUID()}.sqlite`)
			atomic(staged, output.get(file.path)!.bytes)
			const destination = staged
			try {
				const { DatabaseSync } = await import("node:sqlite"),
					db = new DatabaseSync(destination)
				try {
					const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
					for (const { name } of tables) {
						if (!/^[a-zA-Z0-9_]+$/.test(name)) continue
						const columns = db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]
						for (const { name: column } of columns.filter((c) =>
							/^(messages_path|transcript_path|manifest_path|compaction_path|metadata_json)$/.test(c.name),
						)) {
							const rows = db.prepare(`SELECT rowid AS rid,"${column}" AS val FROM "${name}"`).all() as {
								rid: number
								val: unknown
							}[]
							for (const row of rows)
								if (typeof row.val === "string")
									db.prepare(`UPDATE "${name}" SET "${column}"=? WHERE rowid=?`).run(
										column === "metadata_json"
											? JSON.stringify(relocateMetadata(decode(row.val), transfer.roots, target))
											: rewritePath(row.val, transfer.roots, target),
										row.rid,
									)
						}
					}
				} finally {
					db.close()
				}
				checkDatabase(destination)
				output.get(file.path)!.bytes = fs.readFileSync(destination)
			} finally {
				for (const suffix of ["", "-wal", "-shm", "-journal"])
					if (fs.existsSync(staged + suffix)) fs.unlinkSync(staged + suffix)
			}
		}
		for (const [rel, item] of output) {
			const file = safe(target, rel),
				before = fs.existsSync(file) ? fs.readFileSync(file) : undefined
			if (before && !before.equals(item.bytes)) {
				if (rel !== "home/data/globalState.json" && rel !== "home/data/secrets.json")
					throw new Error("Existing target data conflicts with snapshot; both copies preserved")
				item.bytes = Buffer.from(JSON.stringify({ ...decode(item.bytes.toString()), ...decode(before.toString()) }))
			}
			journal.files.push({
				path: rel,
				...(before ? { before: before.toString("base64") } : {}),
				after: hash(item.bytes),
				executable: item.executable,
			})
		}
		const effectiveSecrets = decode(output.get("home/data/secrets.json")!.bytes.toString()) as Record<string, string>
		for (const [key, value] of Object.entries(effectiveSecrets)) {
			if (typeof value !== "string") throw new Error("Invalid secret value in transfer")
			const before = await context.secrets.get(key)
			if (before !== undefined && before !== value)
				throw new Error("An existing target native secret differs; existing credentials preserved")
			journal.secrets.push({ key, before, after: value })
		}
		for (const scope of ["globalState", "workspaceState"] as const)
			for (const [key, after] of Object.entries(transfer.native[scope])) {
				const before = context[scope].get(key)
				if (before === undefined) journal.mementos.push({ scope, key, before, after })
			}
		atomic(path.join(target, JOURNAL), JSON.stringify(journal))
		for (const [rel, item] of output) atomic(safe(target, rel), item.bytes, item.executable)
		for (const item of journal.secrets) if (item.before === undefined) await context.secrets.store(item.key, item.after)
		for (const item of journal.mementos) await context[item.scope].update(item.key, item.after)
		for (const item of journal.secrets)
			if ((await context.secrets.get(item.key)) !== item.after)
				throw new Error("Native secret restoration was not confirmed")

		atomic(path.join(target, JOURNAL), JSON.stringify(journal))
		for (const item of journal.files)
			if (hash(fs.readFileSync(safe(target, item.path))) !== item.after) throw new Error("Restored file checksum mismatch")
		atomic(
			path.join(target, RECEIPT),
			JSON.stringify({ version: 1, complete: true, targetId: FORK_IDENTITY.id, digest, files: journal.files.length }),
		)
		return { files: transfer.files.length, repeated: false }
	} catch (error) {
		if (journal.files.length && fs.existsSync(path.join(target, JOURNAL))) await restoreJournal(context)
		throw error instanceof Error ? error : new Error("Identity migration failed; no success acknowledged")
	} finally {
		unlock()
	}
}

/** Restore only unchanged migration-owned output. Never delete later user work or old source data. */
export async function rollbackIdentityTransfer(context: NativeContext): Promise<void> {
	own(context)
	const unlock = migrationLock(context.globalStorageUri.fsPath, true)
	try {
		if (fs.existsSync(path.join(context.globalStorageUri.fsPath, JOURNAL))) await restoreJournal(context)
	} finally {
		unlock()
	}
}

async function restoreJournal(context: NativeContext): Promise<void> {
	own(context)
	const root = context.globalStorageUri.fsPath,
		file = path.join(root, JOURNAL)
	privateFile(file)
	const journal = decode(fs.readFileSync(file, "utf8")) as Journal
	if (journal.version !== 1 || journal.targetId !== FORK_IDENTITY.id) throw new Error("Invalid migration rollback journal")
	for (const item of journal.files) {
		const target = safe(root, item.path)
		if (
			fs.existsSync(target) &&
			hash(fs.readFileSync(target)) !== item.after &&
			(item.before === undefined || fs.readFileSync(target).toString("base64") !== item.before)
		)
			throw new Error("Target changed after migration; rollback will not discard new work")
	}
	for (const item of journal.secrets) {
		const actual = await context.secrets.get(item.key)
		if (actual !== undefined && actual !== item.after && actual !== item.before)
			throw new Error("Target native secret changed; rollback refused")
	}
	for (const item of journal.mementos) {
		const current = context[item.scope].get(item.key)
		if (JSON.stringify(current) !== JSON.stringify(item.after) && JSON.stringify(current) !== JSON.stringify(item.before))
			throw new Error("Target settings changed; rollback refused")
	}
	for (const item of [...journal.files].reverse()) {
		const target = safe(root, item.path)
		if (item.before !== undefined) atomic(target, Buffer.from(item.before, "base64"), item.executable)
		else if (fs.existsSync(target)) fs.unlinkSync(target)
	}
	for (const item of journal.secrets) if (item.before === undefined) await context.secrets.delete(item.key)
	for (const item of journal.mementos) await context[item.scope].update(item.key, item.before)
	if (fs.existsSync(path.join(root, RECEIPT))) fs.unlinkSync(path.join(root, RECEIPT))
	fs.unlinkSync(file)
}
