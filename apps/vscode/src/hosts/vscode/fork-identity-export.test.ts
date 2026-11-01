import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { activate } from "./fork-identity-export"
import { importIdentityTransfer } from "./fork-identity-migration"

const directories: string[] = []
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "netaigis-export-source-"))
	directories.push(root)
	const source = join(root, "snapshot", "legacy"),
		transfer = join(root, "transfer"),
		target = join(root, "target")
	for (const directory of [source, transfer, target]) mkdirSync(directory, { recursive: true, mode: 0o700 })
	const memento = () => ({ keys: () => [], get: () => undefined, update: async () => {} })
	const context = (id: string, fsPath: string) =>
		({
			extension: { id },
			globalStorageUri: { fsPath },
			globalState: memento(),
			workspaceState: memento(),
			secrets: { get: async () => undefined, keys: async () => [], store: async () => {}, delete: async () => {} },
		}) as unknown as vscode.ExtensionContext
	return { source, transfer, target, context }
}
describe("old-context export from a restored profile", () => {
	test("relocates legacy checkpoint paths from their original location, not the snapshot location", async () => {
		const f = fixture(),
			original = "/original-user/globalStorage/saoudrizwan.claude-dev"
		mkdirSync(join(f.source, "checkpoints"))
		writeFileSync(join(f.source, "task.json"), JSON.stringify({ shadowRepoPath: `${original}/checkpoints` }))
		await activate(f.context("saoudrizwan.claude-dev", f.source)).exportIdentityTransfer({
			directory: f.transfer,
			roots: [],
			legacyOriginalFrom: original,
		})
		await importIdentityTransfer(f.context("netaigis.netaigis-coding-chat", f.target), f.transfer)
		expect(JSON.parse(readFileSync(join(f.target, "legacy/task.json"), "utf8")).shadowRepoPath).toBe(
			join(f.target, "legacy/checkpoints"),
		)
	})
	test("keeps direct isolated exports compatible without an original-path override", async () => {
		const f = fixture()
		writeFileSync(join(f.source, "task.json"), JSON.stringify({ shadowRepoPath: join(f.source, "checkpoints") }))
		await activate(f.context("saoudrizwan.claude-dev", f.source)).exportIdentityTransfer({ directory: f.transfer, roots: [] })
		await importIdentityTransfer(f.context("netaigis.netaigis-coding-chat", f.target), f.transfer)
		expect(JSON.parse(readFileSync(join(f.target, "legacy/task.json"), "utf8")).shadowRepoPath).toBe(
			join(f.target, "legacy/checkpoints"),
		)
	})
	test("rejects an ambiguous original path before publishing a transfer", () => {
		const f = fixture(),
			api = activate(f.context("saoudrizwan.claude-dev", f.source))
		for (const value of ["relative/legacy", ""])
			expect(() => api.exportIdentityTransfer({ directory: f.transfer, roots: [], legacyOriginalFrom: value })).toThrow(
				"must be absolute",
			)
		expect(readdirSync(f.transfer)).toEqual([])
	})
})
