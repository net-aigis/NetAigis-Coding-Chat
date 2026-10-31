/** Explicit frozen Phase-2 data only. Never reads live credentials or mutates the backup. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const [backup, destination] = process.argv.slice(2)
if (!backup || !destination) throw new Error("Supply the existing Phase-2 backup and an empty isolated test directory")
const root = path.resolve(destination),
	app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
if (!fs.statSync(root).isDirectory() || fs.readdirSync(root).length) throw new Error("Test destination must be empty")
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const manifestPath = "manifests/home-state-consistent-restored.json"
const manifestBytes = fs.readFileSync(path.join(backup, manifestPath))
const seal = fs
	.readFileSync(path.join(backup, "SHA256SUMS.phase2"), "utf8")
	.split("\n")
	.find((line) => line.slice(66).replace(/^\.\//, "") === manifestPath)
assert.ok(seal && seal.slice(0, 64) === digest(manifestBytes), "Phase-2 source manifest seal differs")
const sourceManifest = JSON.parse(manifestBytes)
let verifiedSourceFiles = 0
function checkSource(directory) {
	for (const name of fs.readdirSync(directory)) {
		const file = path.join(directory, name),
			st = fs.lstatSync(file)
		assert.ok(!st.isSymbolicLink(), "Frozen source has a symlink")
		if (st.isDirectory()) checkSource(file)
		else {
			const key = path.relative(path.join(backup, "restore-probe/consistent"), file)
			assert.equal(
				digest(fs.readFileSync(file)),
				sourceManifest[key]?.sha256,
				"Frozen input differs from its Phase-2 manifest",
			)
			verifiedSourceFiles++
		}
	}
}
const source = path.join(backup, "restore-probe/consistent/home/friseer")
const home = path.join(root, "source/home"),
	legacy = path.join(root, "source/legacy"),
	target = path.join(root, "target")
for (const [relative, to] of [
	[".cline/data/sessions", path.join(home, "data/sessions")],
	[".cline/data/db", path.join(home, "data/db")],
	[".config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks", path.join(legacy, "tasks")],
]) {
	checkSource(path.join(source, relative))
	fs.cpSync(path.join(source, relative), to, { recursive: true, dereference: false })
}
const transfer = path.join(root, "transfer")
fs.mkdirSync(transfer, { mode: 0o700 })
const bundle = path.join(root, "migration.cjs")
await esbuild.build({
	entryPoints: [path.join(app, "src/hosts/vscode/fork-identity-migration.ts")],
	outfile: bundle,
	bundle: true,
	platform: "node",
	format: "cjs",
	external: ["vscode"],
	tsconfig: path.join(app, "tsconfig.json"),
})
const migration = createRequire(import.meta.url)(bundle)
function context(id, directory) {
	const values = new Map(),
		memento = () => ({ keys: () => [], get: () => undefined, update: async () => {} })
	return {
		extension: { id },
		globalStorageUri: { fsPath: directory },
		globalState: memento(),
		workspaceState: memento(),
		secrets: {
			get: async (key) => values.get(key),
			store: async (key, value) => values.set(key, value),
			delete: async (key) => values.delete(key),
		},
	}
}
const before = new DatabaseSync(path.join(home, "data/db/sessions.db"), { readOnly: true })
const rows = before.prepare("SELECT * FROM sessions").all()
before.close()
await migration.exportIdentityTransfer(context("saoudrizwan.claude-dev", legacy), {
	directory: transfer,
	roots: [
		{ from: home, to: "home", originalFrom: "/home/friseer/.cline" },
		{ from: legacy, to: "legacy", originalFrom: "/home/friseer/.config/Code/User/globalStorage/saoudrizwan.claude-dev" },
	],
	secretKeys: [],
})
await migration.importIdentityTransfer(context("netaigis.netaigis-coding-chat", target), transfer)
const after = new DatabaseSync(path.join(target, "home/data/db/sessions.db"), { readOnly: true })
const restored = after.prepare("SELECT * FROM sessions").all()
after.close()
assert.equal(restored.length, rows.length)
let messages = 0
for (const row of rows) {
	const next = restored.find((item) => item.session_id === row.session_id)
	assert.ok(next)
	for (const key of ["session_id", "provider", "model", "pid", "status", "exit_code", "prompt", "conversation_id"])
		assert.equal(
			digest(JSON.stringify(next[key]) ?? "undefined"),
			digest(JSON.stringify(row[key]) ?? "undefined"),
			"Stored session identity, model or execution state changed",
		)
	if (row.messages_path) {
		assert.ok(
			next.messages_path.startsWith(target + path.sep),
			"Stored original artifact path was not relocated into the target",
		)
		const old = path.join(home, path.relative("/home/friseer/.cline", row.messages_path))
		assert.equal(digest(fs.readFileSync(next.messages_path)), digest(fs.readFileSync(old)))
		messages++
	}
}
let legacyCanonicalArtifacts = 0,
	legacySettingsVerified = 0
for (const task of fs.readdirSync(path.join(legacy, "tasks"))) {
	const directory = path.join(legacy, "tasks", task)
	for (const name of fs.readdirSync(directory))
		if (/(messages|conversation_history|context_history)/.test(name)) {
			assert.equal(
				digest(fs.readFileSync(path.join(directory, name))),
				digest(fs.readFileSync(path.join(target, "legacy/tasks", task, name))),
			)
			legacyCanonicalArtifacts++
		} else if (name.endsWith(".json")) {
			assert.equal(
				digest(JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")))),
				digest(JSON.stringify(JSON.parse(fs.readFileSync(path.join(target, "legacy/tasks", task, name), "utf8")))),
			)
			legacySettingsVerified++
		}
}
const { CoreSessionService, SqliteSessionStore } = await import("@cline/core")
const store = new SqliteSessionStore({ sessionsDir: path.join(target, "home/data/db") })
const service = new CoreSessionService(store, { sessionArtifactsDir: path.join(target, "home/data/sessions") })
for (const row of restored) {
	const manifest = service.readSessionManifest(row.session_id)
	assert.ok(
		manifest && manifest.messages_path === row.messages_path,
		"Actual SDK persistence reader could not resolve the restored manifest",
	)
}
store.close()
const summary = {
	verifiedSourceFiles,
	legacyCanonicalArtifacts,
	legacySettingsVerified,
	sessions: rows.length,
	canonicalArtifactsVerified: messages,
	verified: true,
	nativeCredentials: "Separate real ExtensionHost fixture test; no productive credentials copied",
}
fs.writeFileSync(path.join(root, "result.json"), JSON.stringify(summary, null, 2), { mode: 0o600 })
console.log(JSON.stringify(summary))
