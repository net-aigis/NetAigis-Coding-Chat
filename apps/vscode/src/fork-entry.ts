/** Own-ID bootstrap. No SDK/config services are initialized before storage isolation and migration checks. */

import { randomUUID } from "node:crypto"
import * as fs from "node:fs"
import { homedir } from "node:os"
import * as path from "node:path"
import * as vscode from "vscode"
import {
	identityMigrationComplete,
	importIdentityTransfer,
	inspectIdentityTarget,
	rollbackIdentityTransfer,
} from "./hosts/vscode/fork-identity-migration"
import { FORK_IDENTITY, LEGACY_EXTENSION_ID } from "./shared/fork-identity"

let runtime: typeof import("./extension") | undefined
export async function activate(context: vscode.ExtensionContext) {
	if (context.extension.id !== FORK_IDENTITY.id) throw new Error("Unexpected product identity")
	const root = context.globalStorageUri.fsPath
	const plans = new Map<string, { directory: string; digest?: string }>()
	context.subscriptions.push(
		vscode.commands.registerCommand(`${FORK_IDENTITY.name}.migration.preview`, async (directory: string) => {
			const summary = await inspectIdentityTarget(context, directory),
				ticket = randomUUID()
			plans.set(ticket, { directory, digest: summary.digest })
			return { ...summary, target: root, ticket }
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(`${FORK_IDENTITY.name}.migration.rollbackPreview`, () => {
			if (runtime) throw new Error("Restart in migration-only mode before rollback")
			const ticket = randomUUID()
			plans.set(ticket, { directory: "rollback" })
			return { target: root, ticket }
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(`${FORK_IDENTITY.name}.migration.rollbackApply`, async (ticket: string) => {
			if (runtime || plans.get(ticket)?.directory !== "rollback") throw new Error("Preview rollback before applying it")
			plans.delete(ticket)
			await rollbackIdentityTransfer(context)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(`${FORK_IDENTITY.name}.migration.apply`, async (ticket: string) => {
			const plan = plans.get(ticket)
			if (!plan?.digest) throw new Error("Preview this exact transfer before applying it")
			plans.delete(ticket)
			if (runtime) throw new Error("Restart in migration mode before changing active session storage")
			if ((await inspectIdentityTarget(context, plan.directory)).digest !== plan.digest)
				throw new Error("Transfer changed after preview; inspect it again")
			return importIdentityTransfer(context, plan.directory)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(`${FORK_IDENTITY.name}.migration.rollback`, async () => {
			if (runtime) throw new Error("Close the running fork before rolling back migration storage")
			const answer = await vscode.window.showWarningMessage(
				"Restore only unchanged migration-owned data? Source extension data remains intact.",
				{ modal: true },
				"Restore",
			)
			if (answer === "Restore") await rollbackIdentityTransfer(context)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(`${FORK_IDENTITY.name}.migration.import`, async () => {
			const selection = await vscode.window.showOpenDialog({
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				title: "Verified identity transfer",
			})
			if (!selection?.[0]) return
			const plan = await vscode.commands.executeCommand<{ ticket: string; files: number; secrets: number }>(
				`${FORK_IDENTITY.name}.migration.preview`,
				selection[0].fsPath,
			)
			if (!plan) return
			const answer = await vscode.window.showWarningMessage(
				`Import ${plan.files} verified files and ${plan.secrets} native secrets into ${FORK_IDENTITY.displayName}? Sources are retained.`,
				{ modal: true },
				"Import",
			)
			if (answer === "Import") {
				await vscode.commands.executeCommand(`${FORK_IDENTITY.name}.migration.apply`, plan.ticket)
				await vscode.window.showInformationMessage("Migration verified. Reload this test window to start the fork.")
			}
		}),
	)
	const status = () => ({
		identity: FORK_IDENTITY.id,
		migrationComplete: identityMigrationComplete(root),
		storageRoot: root,
		mode: runtime ? "runtime" : "migration",
	})
	const legacyRoot = path.join(path.dirname(root), LEGACY_EXTENSION_ID)
	// An existing legacy namespace requires an explicit verified import. Never silently start a blank replacement.
	const oldData =
		process.env.CLINE_DATA_DIR?.trim() || path.join(process.env.CLINE_DIR?.trim() || path.join(homedir(), ".cline"), "data")
	const hasOldFiles = fs.existsSync(oldData) && fs.readdirSync(oldData).length > 0
	if (
		process.env.NETAIGIS_IDENTITY_MIGRATION_ONLY === "1" ||
		(!identityMigrationComplete(root) &&
			(vscode.extensions.getExtension(LEGACY_EXTENSION_ID) || fs.existsSync(legacyRoot) || hasOldFiles))
	) {
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider(`${FORK_IDENTITY.name}.SidebarProvider`, {
				resolveWebviewView(view) {
					view.webview.html = `<!doctype html><html><body><h1>${FORK_IDENTITY.displayName}</h1><p>Verified data transfer is required before starting. Export native secrets in the old extension context, then run Import verified identity transfer.</p></body></html>`
				},
			}),
		)
		return { identityMigrationStatus: status }
	}
	// Module-local overrides; process.env remains shared with Original Cline and is never rewritten.
	const sdkStorage = await import("@cline/shared/storage")
	sdkStorage.setIsolatedStorageRoot(path.join(root, "home"))
	const storage = await import("./shared/storage/storage-context")
	storage.setExtensionStorageRoot(path.join(root, "home"))
	const candidate = await import("./extension")
	const legacyUri = vscode.Uri.joinPath(context.globalStorageUri, "legacy")
	const isolatedContext = new Proxy(context, {
		get(target, key) {
			if (key === "globalStorageUri") return legacyUri
			if (key === "globalStoragePath") return legacyUri.fsPath
			return Reflect.get(target, key, target)
		},
	})
	const api = await candidate.activate(isolatedContext)
	runtime = candidate
	return { ...api, identityMigrationStatus: status }
}
export async function deactivate() {
	await runtime?.deactivate()
}
