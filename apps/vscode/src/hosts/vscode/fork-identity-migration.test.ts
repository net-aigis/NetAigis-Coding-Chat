import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it, vi } from "vitest"
import type * as vscode from "vscode"
// Use built public SDK exports rather than the app test harness's @cline/core fixture alias.
import { CoreSessionService, SqliteSessionStore } from "../../../../../sdk/packages/core/dist/index.js"
import { FORK_IDENTITY, LEGACY_EXTENSION_ID } from "../../shared/fork-identity"
import {
	exportIdentityTransfer,
	identityMigrationComplete,
	importIdentityTransfer,
	inspectIdentityTransfer,
	rollbackIdentityTransfer,
} from "./fork-identity-migration"

const cleanup: string[] = []
afterEach(() => {
	for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true })
})
function context(id: string, dir: string) {
	const secrets = new Map<string, string>(),
		global = new Map<string, unknown>(),
		workspace = new Map<string, unknown>()
	const memento = (map: Map<string, unknown>) => ({
		keys: () => [...map.keys()],
		get: (key: string) => map.get(key),
		update: async (key: string, v: unknown) => {
			if (v === undefined) map.delete(key)
			else map.set(key, v)
		},
	})
	const ctx = {
		extension: { id },
		globalStorageUri: { fsPath: dir },
		globalState: memento(global),
		workspaceState: memento(workspace),
		secrets: {
			get: vi.fn(async (key: string) => secrets.get(key)),
			store: vi.fn(async (key: string, v: string) => {
				secrets.set(key, v)
			}),
			delete: vi.fn(async (key: string) => {
				secrets.delete(key)
			}),
		},
	}
	return { ctx: ctx as unknown as vscode.ExtensionContext, secrets, global, workspace, api: ctx }
}
function fixture() {
	const root = mkdtempSync(join(process.env.CLINE_DATA_DIR || tmpdir(), "identity-"))
	cleanup.push(root)
	const home = join(root, "old-home"),
		legacy = join(root, "old-native"),
		bundle = join(root, "transfer"),
		target = join(root, "new-native")
	for (const dir of [home, legacy, bundle]) mkdirSync(dir, { mode: 0o700 })
	mkdirSync(join(home, "data"))
	mkdirSync(join(legacy, "tasks"))
	writeFileSync(
		join(home, "data/globalState.json"),
		JSON.stringify({ openAiBaseUrl: "http://fixture-local.invalid:11436/v1", actModeApiProvider: "openai-compatible" }),
	)
	writeFileSync(join(home, "data/secrets.json"), JSON.stringify({ openAiApiKey: "fixture-file-key" }))
	const messages = [
		{
			id: "source-user",
			role: "user",
			content: "Original task and correction",
			metadata: { author: { actorId: "Friseer" } },
		},
		{
			id: "source-tool",
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "cmd",
					content: JSON.stringify({ execution: { state: "unknown", observationFailed: true } }),
				},
			],
		},
	]
	writeFileSync(join(legacy, "tasks/history.messages.json"), JSON.stringify(messages))
	const old = context(LEGACY_EXTENSION_ID, legacy),
		next = context(FORK_IDENTITY.id, target)
	old.secrets.set("openAiApiKey", "fixture-native-older")
	old.secrets.set("netaigis-recall_token", "fixture-recall-key")
	old.global.set("originalOrder", "Keep Friseer and jimmi authors")
	old.workspace.set("enabled", true)
	const options = {
		directory: bundle,
		roots: [
			{ from: home, to: "home" },
			{ from: legacy, to: "legacy" },
		],
		secretKeys: ["openAiApiKey", "netaigis-recall_token"],
	}
	return { root, home, legacy, bundle, target, old, next, options }
}
describe("explicit own-ID transfer and rollback", () => {
	it("cannot export another identity's native secrets through the new context", async () => {
		const f = fixture()
		await expect(exportIdentityTransfer(f.next.ctx, f.options)).rejects.toThrow("owning extension")
	})
	it("preserves IDs, authors, unknown process state, configuration and native source values", async () => {
		const f = fixture()
		const original = readFileSync(join(f.legacy, "tasks/history.messages.json"))
		await exportIdentityTransfer(f.old.ctx, f.options)
		expect(inspectIdentityTransfer(f.bundle).secrets).toBe(2)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		expect(readFileSync(join(f.target, "legacy/tasks/history.messages.json"))).toEqual(original)
		expect(f.next.secrets.get("openAiApiKey")).toBe("fixture-file-key")
		expect(f.old.secrets.get("openAiApiKey")).toBe("fixture-native-older")
		expect(f.next.secrets.get("netaigis-recall_token")).toBe("fixture-recall-key")
		expect(JSON.parse(readFileSync(join(f.target, "home/data/globalState.json"), "utf8"))).toMatchObject({
			openAiBaseUrl: "http://fixture-local.invalid:11436/v1",
			originalOrder: "Keep Friseer and jimmi authors",
		})
		expect(f.next.workspace.get("enabled")).toBe(true)
		expect(identityMigrationComplete(f.target)).toBe(true)
	})
	it("is idempotent and does not replace later target settings on another import", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		const file = join(f.target, "home/data/globalState.json")
		writeFileSync(file, '{"user_changed":true}')
		expect(await importIdentityTransfer(f.next.ctx, f.bundle)).toMatchObject({ repeated: true })
		expect(readFileSync(file, "utf8")).toBe('{"user_changed":true}')
	})
	it("rejects a damaged snapshot before writing target credentials or files", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		writeFileSync(join(f.bundle, "payload/home/data/secrets.json"), "{}")
		await expect(importIdentityTransfer(f.next.ctx, f.bundle)).rejects.toThrow("checksum")
		expect(f.next.api.secrets.store).not.toHaveBeenCalled()
		expect(existsSync(f.target)).toBe(false)
	})
	it("rolls back newly copied data and secrets when native persistence fails", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		f.next.api.secrets.store.mockRejectedValueOnce(new Error("fixture native persistence failed"))
		await expect(importIdentityTransfer(f.next.ctx, f.bundle)).rejects.toThrow("fixture native persistence failed")
		expect(identityMigrationComplete(f.target)).toBe(false)
		expect(existsSync(join(f.target, "home/data/secrets.json"))).toBe(false)
		expect(f.old.secrets.get("netaigis-recall_token")).toBe("fixture-recall-key")
	})
	it("can roll back committed output while keeping the old native and file stores usable", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		await rollbackIdentityTransfer(f.next.ctx)
		expect(f.next.secrets.size).toBe(0)
		expect(identityMigrationComplete(f.target)).toBe(false)
		expect(existsSync(join(f.legacy, "tasks/history.messages.json"))).toBe(true)
	})
	it("refuses rollback that would discard post-migration user work", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		const file = join(f.target, "legacy/tasks/history.messages.json")
		writeFileSync(file, '[{"content":"new work"}]')
		await expect(rollbackIdentityTransfer(f.next.ctx)).rejects.toThrow("new work")
		expect(identityMigrationComplete(f.target)).toBe(true)
	})
	it("refuses overlapping existing session data and symlinked snapshot inputs", async () => {
		const f = fixture()
		symlinkSync(join(f.home, "data"), join(f.legacy, "unsafe"))
		await expect(exportIdentityTransfer(f.old.ctx, f.options)).rejects.toThrow(/symlink/)
	})
	it("backs up committed SQLite WAL rows through the actual Backup API and relocates artifact paths", async () => {
		const f = fixture(),
			dbFile = join(f.home, "data/sessions.db"),
			db = new DatabaseSync(dbFile)
		try {
			db.exec(
				"PRAGMA journal_mode=WAL;CREATE TABLE sessions(id TEXT,messages_path TEXT);INSERT INTO sessions VALUES ('same-session','pending')",
			)
			db.prepare("UPDATE sessions SET messages_path=?").run(join(f.legacy, "tasks/history.messages.json"))
			await exportIdentityTransfer(f.old.ctx, f.options)
			await importIdentityTransfer(f.next.ctx, f.bundle)
			const restored = new DatabaseSync(join(f.target, "home/data/sessions.db"), { readOnly: true })
			try {
				expect(restored.prepare("SELECT * FROM sessions").get()).toMatchObject({
					id: "same-session",
					messages_path: join(f.target, "legacy/tasks/history.messages.json"),
				})
			} finally {
				restored.close()
			}
		} finally {
			db.close()
		}
	})
	it("exports additional native keys when the host can enumerate SecretStorage", async () => {
		const f = fixture()
		f.old.secrets.set("future-plugin-token", "fixture-future-token")
		Object.assign(f.old.api.secrets, { keys: async () => [...f.old.secrets.keys()] })
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		expect(f.next.secrets.get("future-plugin-token")).toBe("fixture-future-token")
	})
	it("recovers an interrupted commit only through checked rollback, preserving the source", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		unlinkSync(join(f.target, "identity-migration.json"))
		writeFileSync(
			join(f.target, "identity-migration.lock"),
			JSON.stringify({ pid: 2147483647, nonce: "fixture-dead-owner" }),
			{ mode: 0o600 },
		)
		await expect(importIdentityTransfer(f.next.ctx, f.bundle)).rejects.toThrow()
		await rollbackIdentityTransfer(f.next.ctx)
		expect(f.next.secrets.size).toBe(0)
		expect(await importIdentityTransfer(f.next.ctx, f.bundle)).toMatchObject({ repeated: false })
	})
	it("does not roll back while another migration owner is alive", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		writeFileSync(
			join(f.target, "identity-migration.lock"),
			JSON.stringify({ pid: process.pid, nonce: "fixture-live-owner" }),
			{ mode: 0o600 },
		)
		await expect(rollbackIdentityTransfer(f.next.ctx)).rejects.toThrow("still alive")
		expect(identityMigrationComplete(f.target)).toBe(true)
	})
	it("reads a migrated modern session through the real persistence service and restores Git checkpoint contents", async () => {
		const f = fixture(),
			sessions = join(f.home, "data/sessions"),
			store = new SqliteSessionStore({ sessionsDir: join(f.home, "data/db") }),
			service = new CoreSessionService(store, { sessionArtifactsDir: sessions })
		const artifacts = await service.createRootSessionWithArtifacts({
			sessionId: "same-live-session",
			source: "vscode",
			pid: process.pid,
			interactive: true,
			provider: "openai-compatible",
			model: "local-125b",
			cwd: f.root,
			workspaceRoot: f.root,
			enableTools: true,
			enableSpawn: false,
			enableTeams: false,
			prompt: "Original task",
			metadata: { sessionControl: { actorId: "Friseer", revision: 7 }, originalAuthor: "jimmi" },
		})
		const canonical = readFileSync(join(f.legacy, "tasks/history.messages.json"))
		writeFileSync(artifacts.messagesPath, canonical)
		const checkpoint = join(f.legacy, "checkpoints/shadow.git"),
			recovery = join(f.root, "restored-files")
		mkdirSync(recovery)
		mkdirSync(checkpoint, { recursive: true })
		const git = (args: string[], input?: string) =>
			execFileSync("git", ["--git-dir", checkpoint, ...args], {
				encoding: "utf8",
				input,
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "Migration Fixture",
					GIT_AUTHOR_EMAIL: "fixture@example.invalid",
					GIT_COMMITTER_NAME: "Migration Fixture",
					GIT_COMMITTER_EMAIL: "fixture@example.invalid",
				},
			}).trim()
		git(["init", "--bare", checkpoint])
		const blob = git(["hash-object", "-w", "--stdin"], "recoverable checkpoint bytes\n")
		const tree = git(["mktree"], `100644 blob ${blob}\tfile.txt\n`),
			commit = git(["commit-tree", tree, "-m", "Fixture checkpoint"])
		git(["update-ref", "refs/heads/checkpoint", commit])
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		const restoredStore = new SqliteSessionStore({ sessionsDir: join(f.target, "home/data/db") }),
			restored = new CoreSessionService(restoredStore, { sessionArtifactsDir: join(f.target, "home/data/sessions") }),
			manifest = restored.readSessionManifest("same-live-session")
		expect(manifest).toMatchObject({
			session_id: "same-live-session",
			status: "running",
			pid: process.pid,
			model: "local-125b",
			metadata: { originalAuthor: "jimmi", sessionControl: { actorId: "Friseer", revision: 7 } },
		})
		expect(manifest!.messages_path).toBe(artifacts.messagesPath.replace(f.home, join(f.target, "home")))
		expect(readFileSync(manifest!.messages_path!)).toEqual(canonical)
		expect(
			restoredStore.queryOne<{ messages_path: string }>("SELECT messages_path FROM sessions WHERE session_id=?", [
				"same-live-session",
			])!.messages_path,
		).toBe(manifest!.messages_path)
		store.close()
		restoredStore.close()
		const restoredGit = join(f.target, "legacy/checkpoints/shadow.git")
		const archive = execFileSync("git", ["--git-dir", restoredGit, "archive", commit])
		execFileSync("tar", ["-xf", "-", "-C", recovery], { input: archive })
		expect(readFileSync(join(recovery, "file.txt"), "utf8")).toBe("recoverable checkpoint bytes\n")
		expect(execFileSync("git", ["--git-dir", restoredGit, "fsck", "--full"], { encoding: "utf8" })).not.toMatch(/error/)
	})
	it("does not acknowledge an idempotent import while a migration owner holds the lock", async () => {
		const f = fixture()
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		writeFileSync(join(f.target, "identity-migration.lock"), JSON.stringify({ pid: process.pid, nonce: "active" }), {
			mode: 0o600,
		})
		await expect(importIdentityTransfer(f.next.ctx, f.bundle)).rejects.toThrow()
	})
	it("preserves ordinary artifacts with a WAL-like name and the Recall outbox destination", async () => {
		const f = fixture()
		mkdirSync(join(f.home, "netaigis-recall-outbox"))
		const bytes = JSON.stringify({
			conversation_id: "same-live-session",
			event_id: "immutable-event",
			actor_id: "Friseer",
			payload: { author: { actorId: "jimmi" } },
			baseUrl: "http://fixture-local.invalid:11436",
		})
		writeFileSync(join(f.home, "netaigis-recall-outbox/event.json"), bytes)
		writeFileSync(join(f.home, "notes-wal"), "ordinary user artifact")
		await exportIdentityTransfer(f.old.ctx, f.options)
		await importIdentityTransfer(f.next.ctx, f.bundle)
		expect(readFileSync(join(f.target, "home/netaigis-recall-outbox/event.json"), "utf8")).toBe(bytes)
		expect(readFileSync(join(f.target, "home/notes-wal"), "utf8")).toBe("ordinary user artifact")
	})
	it("refuses to acknowledge a transfer when an explicit source is missing", async () => {
		const f = fixture()
		f.options.roots.push({ from: join(f.root, "missing-source"), to: "home/documents" })
		await expect(exportIdentityTransfer(f.old.ctx, f.options)).rejects.toThrow("source is missing")
		expect(existsSync(join(f.bundle, "identity-transfer.json"))).toBe(false)
	})
})
