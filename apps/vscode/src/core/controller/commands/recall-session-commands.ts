/** VS Code entry points for the existing TOTAL RECALL journal. */
// biome-ignore-all plugin: VS Code owns command registration and browser panels.
import * as vscode from "vscode"
import { getRecallConfigManager, getRecallConfiguration } from "@/sdk/recall-config-manager"
import { drainRecallOutbox } from "@/sdk/recall-outbox"
import { RecallRuntimeClient } from "@/sdk/recall-runtime-client"
import { renderRecallSessionBrowser } from "@/sdk/recall-session-browser"
import { TotalRecallSessionHost } from "@/sdk/recall-session-host"
import { getSharedSessionHubConnection } from "@/sdk/shared-session-hub"
import { Logger } from "@/shared/services/Logger"

let recallPanel: vscode.WebviewPanel | undefined
let selectedSnapshot: { conversationId: string; journalSeq: number; eligible: boolean; runtime?: RecallRuntimeClient } | undefined
async function host(): Promise<TotalRecallSessionHost | RecallRuntimeClient> {
	const shared = getSharedSessionHubConnection()
	if (shared) return new RecallRuntimeClient(shared)
	const config = await getRecallConfiguration()
	if (!config?.enabled) throw new Error("TOTAL RECALL ist nicht konfiguriert oder deaktiviert")
	const client = new TotalRecallSessionHost(getRecallConfiguration)
	await client.initialize(config)
	return client
}
async function showError(): Promise<void> {
	selectedSnapshot = undefined
	Logger.error("[TOTAL RECALL] Browser operation failed; no successful restore or takeover was reported")
	const message = "TOTAL RECALL konnte die Aktion nicht bestätigen. Konfiguration, Verbindung und geschützte Outbox prüfen."
	await recallPanel?.webview.postMessage({ cmd: "msg", msg: message })
	await vscode.window.showErrorMessage(message)
}
export function registerTotalRecallCommands(_context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables = [
		vscode.commands.registerCommand("netaigis-coding-chat.recall.listSessions", openRecallSessionView),
		vscode.commands.registerCommand("netaigis-coding-chat.recall.quickPick", quickPickRecallSession),
		vscode.commands.registerCommand("netaigis-coding-chat.recall.configure", configureTotalRecall),
		{ dispose: () => recallPanel?.dispose() },
	]
	return disposables
}
export async function openRecallSessionView(): Promise<void> {
	if (!recallPanel) {
		const panel = vscode.window.createWebviewPanel(
			"netaigis-coding-chat.recall-session-view",
			"TOTAL RECALL",
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				localResourceRoots: [],
			},
		)
		recallPanel = panel
		panel.webview.html = renderRecallSessionBrowser()
		const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
			if (!message || typeof message !== "object") return
			const input = message as Record<string, unknown>
			try {
				if (input.command === "list-sessions") await listTotalRecallSessions()
				else if (input.command === "configure") await configureTotalRecall()
				else if (
					input.command === "read-session" &&
					typeof input.conversationId === "string" &&
					input.conversationId.length > 0
				)
					await readTotalRecallSession(input.conversationId)
				else if (input.command === "restore-session") {
					const selected = selectedSnapshot
					if (!selected?.eligible || selected.conversationId !== input.conversationId)
						throw new Error("Inspect an eligible archive before recovery")
					const runtime = selected.runtime
					if (!runtime?.matchesConnection(getSharedSessionHubConnection()))
						throw new Error("Shared runtime changed; inspect the archive again")
					const sessionId = await runtime.restoreSession(selected.conversationId, selected.journalSeq)
					selectedSnapshot = undefined
					await panel.webview.postMessage({ cmd: "restored", sessionId })
				} else if (input.command === "takeover-session") {
					await panel.webview.postMessage({
						cmd: "msg",
						msg: "Keine bestätigte Schreibübergabe verfügbar. Keine laufende Aufgabe wurde übernommen.",
					})
				}
			} catch {
				await showError()
			}
		})
		panel.onDidDispose(() => {
			messages.dispose()
			selectedSnapshot = undefined
			if (recallPanel === panel) recallPanel = undefined
		})
	}
	recallPanel.reveal(vscode.ViewColumn.Beside)
	try {
		await listTotalRecallSessions()
	} catch {
		await showError()
	}
}
async function listTotalRecallSessions(): Promise<void> {
	selectedSnapshot = undefined
	const sessions = await (await host()).listConversations()
	await recallPanel?.webview.postMessage({ cmd: "render", sessions })
}
async function readTotalRecallSession(conversationId: string): Promise<void> {
	selectedSnapshot = undefined
	const runtime = await host()
	const snapshot = await runtime.getSessionSnapshot(conversationId)
	const eligible =
		runtime instanceof RecallRuntimeClient && snapshot.sourceVerified === true && snapshot.restoration?.available === true
	selectedSnapshot = {
		conversationId,
		journalSeq: snapshot.journalSeq,
		eligible,
		...(runtime instanceof RecallRuntimeClient ? { runtime } : {}),
	}
	await recallPanel?.webview.postMessage({ cmd: "snapshot", snapshot, canRestore: eligible })
}
async function quickPickRecallSession(): Promise<void> {
	try {
		const sessions = await (await host()).listConversations()
		const items = sessions.map((session) => ({
			label: session.title || session.conversationId,
			description: session.projectId,
			detail: session.conversationId,
			conversationId: session.conversationId,
		}))
		const selection = await vscode.window.showQuickPick(items, { title: "TOTAL RECALL – gemeinsamen Verlauf lesen" })
		if (selection) {
			await openRecallSessionView()
			await readTotalRecallSession(selection.conversationId)
		}
	} catch {
		await showError()
	}
}
export async function configureTotalRecall(): Promise<void> {
	if (getSharedSessionHubConnection()) {
		await vscode.window.showInformationMessage(
			"TOTAL RECALL wird für diese Verbindung durch die gemeinsame Runtime verwaltet.",
		)
		return
	}
	const existing = await getRecallConfiguration()
	const baseUrl = await vscode.window.showInputBox({
		title: "TOTAL RECALL – vorhandener API-Endpunkt",
		value: existing?.baseUrl,
		ignoreFocusOut: true,
	})
	if (baseUrl === undefined) return
	const project = await vscode.window.showInputBox({
		title: "TOTAL RECALL – Projekt-ID",
		value: existing?.project,
		ignoreFocusOut: true,
	})
	if (project === undefined) return
	const actor = await vscode.window.showInputBox({
		title: "TOTAL RECALL – eigene Akteur-ID",
		value: existing?.actor,
		ignoreFocusOut: true,
	})
	if (actor === undefined) return
	const token = await vscode.window.showInputBox({
		title: "TOTAL RECALL – zugehöriger API-Token",
		password: true,
		ignoreFocusOut: true,
	})
	if (token === undefined) return
	try {
		await getRecallConfigManager().configure({ baseUrl, project, actor, token })
		const result = await drainRecallOutbox(await getRecallConfiguration())
		await vscode.window.showInformationMessage(
			result.blocked
				? "TOTAL RECALL gespeichert; ausstehende Ereignisse bleiben geschützt in der Outbox."
				: "TOTAL RECALL gespeichert.",
		)
		if (recallPanel) await listTotalRecallSessions()
	} catch {
		await showError()
	}
}
