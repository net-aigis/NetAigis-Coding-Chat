/**
 * TotalRecallSessionCommands - VS Code Command Palette integration for TOTAL RECALL session discovery and restore
 */

// biome-ignore-all plugin: direct vscode usage acceptable for TOTAL RECALL new feature
import * as vscode from "vscode"
import { Logger } from "@/shared/services/Logger"
import type { RecallConfiguration } from "@/sdk/recall-outbox"

export interface RecallSessionInfo {
	conversationId: string
	title?: string
	projectId: string
	actorId: string
	lastUpdated?: string
	sessionCount?: number
	lockedBy?: string
	lockExpiresAt?: string
}

const RECALL_VIEW_ID = "recall-session-view"
let recallPanel: vscode.WebviewPanel | undefined
let recallViewProvider: RecallSessionViewProvider | undefined

export class RecallSessionViewProvider implements vscode.WebviewViewProvider {
	constructor(private readonly extensionUri: vscode.Uri) {}

	async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): Promise<void> {
		this._view = webviewView
		webviewView.webview.options = { enableScripts: true }
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case "list-sessions":
					await listTotalRecallSessions()
					break
				case "restore-session":
					await restoreTotalRecallSession(message.conversationId)
					break
				case "takeover-session":
					await takeOverSession(message.conversationId)
					break
				case "refresh-config":
					await handleRefreshConfig()
					break
			}
		}, undefined)
	}

	private _view?: vscode.WebviewView
	protected get view(): vscode.WebviewView | undefined {
		return this._view
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>TOTAL RECALL</title>
<style>body{font-family:var(--vscode-font-family);padding:10px;background:var(--vscode-editor-background);color:var(--vscode-foreground)}h1{border-bottom:1px solid var(--vscode-panel-border);padding-bottom:5px}.list{list-style:none;padding:0}.item{margin:8px 0;padding:10px;background:var(--vscode-editor-inactiveSelectionBackground);border-radius:4px;cursor:pointer}.meta{font-size:12px;color:var(--vscode-descriptionForeground)}.badge{display:inline-block;padding:2px 6px;background:#c95a5a;border-radius:3px;margin-left:8px;font-size:10px;color:white}.buttons{margin-top:8px}button{padding:4px 8px;margin-right:4px;cursor:pointer;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:2px;font-size:12px}</style>
</head><body><h1>TOTAL RECALL - Session Browser</h1><ul class="list" id="list"></ul>
<script>const vscode=acquireVsCodeApi();function render(data){const l=document.getElementById('list');l.innerHTML='';if(!data||!data.length){l.innerHTML='<li>No sessions found</li>';return}data.forEach(s=>{const li=document.createElement('li');li.className='item';const title=s.title||s.conversationId;const locked=s.lockedBy?' (LOCKED)':'';const meta='<span class="meta">ID:'+s.conversationId+'|'+s.projectId+'</span>';const btns='<div class="buttons"><button onclick="vscode.postMessage({command:\'restore\',id:\''+s.conversationId+'\'})">Restore</button><button onclick="vscode.postMessage({command:\'takeover\',id:\''+s.conversationId+'\'})">Take Over</button></div>';li.innerHTML='<div><b>'+title+locked+'</b><br/>'+meta+btns+'</div>';l.appendChild(li)})}window.addEventListener('message',e=>{const d=e.data;if(d.cmd==='render'){render(d.sessions);status('OK','success')}else if(d.cmd==='msg'){status(d.msg,d.type||'info');}})function status(m,t){setTimeout(()=>{},1000)};window.refresh=()=>vscode.postMessage({command:'list'})</script></body></html>`
	}
}

export function registerTotalRecallCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = []
	recallViewProvider = new RecallSessionViewProvider(context.extensionUri)
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(RECALL_VIEW_ID, recallViewProvider))
	disposables.push(vscode.commands.registerCommand("cline.recall.listSessions", openRecallSessionView))
	disposables.push(vscode.commands.registerCommand("cline.recall.quickPick", quickPickRecallSession))
	Logger.info("[TOTAL RECALL] Commands registered")
	return disposables
}

export async function openRecallSessionView(): Promise<void> {
	if (!recallPanel) {
		recallPanel = vscode.window.createWebviewPanel(
			RECALL_VIEW_ID,
			"TOTAL RECALL - Session Browser",
			vscode.ViewColumn.Beside,
			{ enableScripts: true },
		)
		recallPanel.onDidChangeViewState((e) => {
			if (e.webviewPanel.visible && recallPanel) void listTotalRecallSessions()
		})
		recallPanel.onDidDispose(() => {
			recallPanel = undefined
		})
	}
	recallPanel.reveal(vscode.ViewColumn.Beside)
	await listTotalRecallSessions()
}

async function listTotalRecallSessions(): Promise<void> {
	const { getRecallConfiguration } = await import("@/sdk/recall-config-manager")
	const config = await getRecallConfiguration()
	if (!config) {
		vscode.window.showErrorMessage("TOTAL RECALL not configured")
		return
	}
	try {
		const { TotalRecallSessionHost } = await import("@/sdk/recall-session-host")
		const sessionHost = new TotalRecallSessionHost(async () => config)
		await sessionHost.initialize(config as RecallConfiguration)
		const conversations = await sessionHost.listConversations()
		if (recallPanel?.webview) recallPanel.webview.postMessage({ cmd: "render", sessions: conversations })
	} catch (e) {
		Logger.error("[TOTAL RECALL] Failed to list:", e)
		vscode.window.showErrorMessage(String(e))
	}
}

async function restoreTotalRecallSession(conversationId: string): Promise<void> {
	const { getRecallConfiguration } = await import("@/sdk/recall-config-manager")
	const config = await getRecallConfiguration()
	if (!config) {
		vscode.window.showErrorMessage("TOTAL RECALL not configured")
		return
	}
	try {
		const { TotalRecallSessionHost } = await import("@/sdk/recall-session-host")
		const sessionHost = new TotalRecallSessionHost(async () => config)
		await sessionHost.initialize(config as RecallConfiguration)
		const snapshot = await sessionHost.getSessionSnapshot(conversationId)
		Logger.info(`[TOTAL RECALL] Session ${conversationId} restored, ${snapshot.messages.length} messages`)
		vscode.window.showInformationMessage(`Session ${conversationId}: ${snapshot.messages.length} events`)
	} catch (e) {
		Logger.error("[TOTAL RECALL] Restore failed:", e)
		vscode.window.showErrorMessage(String(e))
	}
}

async function takeOverSession(conversationId: string): Promise<void> {
	const { getRecallConfiguration } = await import("@/sdk/recall-config-manager")
	const config = await getRecallConfiguration()
	if (!config) {
		vscode.window.showErrorMessage("TOTAL RECALL not configured")
		return
	}
	try {
		const { TotalRecallSessionHost } = await import("@/sdk/recall-session-host")
		const sessionHost = new TotalRecallSessionHost(async () => config)
		await sessionHost.initialize(config as RecallConfiguration)
		const currentActor = config.actor
		const result = await sessionHost.takeOverSession(conversationId, currentActor)
		if (result.success) {
			vscode.window.showInformationMessage(`Session ${conversationId} taken over`)
		} else {
			vscode.window.showErrorMessage(`Takeover failed: ${result.error}`)
		}
	} catch (e) {
		Logger.error("[TOTAL RECALL] Takeover failed:", e)
		vscode.window.showErrorMessage(String(e))
	}
}

async function handleRefreshConfig(): Promise<void> {
	const { refreshRecallConfiguration, clearRecallConfigurationCache } = await import("@/sdk/recall-config-manager")
	await refreshRecallConfiguration()
	clearRecallConfigurationCache()
	vscode.window.showInformationMessage("TOTAL RECALL config refreshed")
}

async function quickPickRecallSession(): Promise<void> {
	const { getRecallConfiguration } = await import("@/sdk/recall-config-manager")
	const config = await getRecallConfiguration()
	if (!config) {
		vscode.window.showErrorMessage("TOTAL RECALL not configured")
		return
	}
	try {
		const { TotalRecallSessionHost } = await import("@/sdk/recall-session-host")
		const sessionHost = new TotalRecallSessionHost(async () => config)
		await sessionHost.initialize(config as RecallConfiguration)
		const conversations = await sessionHost.listConversations()
		const items: vscode.QuickPickItem[] = conversations.map((s) => ({
			label: s.title || s.conversationId,
			description: `Actor: ${s.actorId}`,
		}))
		const selected = await vscode.window.showQuickPick(items, { title: "TOTAL RECALL Sessions" })
		if (selected) {
			const conv = conversations.find((c) => c.title === selected.label || c.conversationId === selected.label)
			if (conv) restoreTotalRecallSession(conv.conversationId)
		}
	} catch (e) {
		Logger.error("[TOTAL RECALL] Quick pick failed:", e)
	}
}
