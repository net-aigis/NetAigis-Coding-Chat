/** Explicit setup of the existing shared Runtime; credentials never enter command arguments. */
import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"
import {
	SharedRuntimeConfigurationError,
	type SharedSessionHubConnection,
	type SharedSessionWriterSnapshot,
} from "@/sdk/shared-session-hub"

export function registerSharedRuntimeCommand(
	configure: (connection: SharedSessionHubConnection) => Promise<string>,
): vscode.Disposable {
	return vscode.commands.registerCommand(ExtensionRegistryInfo.commands.ConfigureSharedRuntime, async () => {
		try {
			const endpoint = await vscode.window.showInputBox({
				title: "NetAigis Coding Chat – gemeinsame Runtime",
				prompt: "WebSocket-Endpunkt der bereits eingerichteten Runtime (wss:// oder lokaler Loopback)",
				ignoreFocusOut: true,
			})
			if (endpoint === undefined) return
			const authToken = await vscode.window.showInputBox({
				title: "Gemeinsame Runtime – persönlicher Zugang",
				prompt: "Persönlicher Runtime-Token; keinen Modell- oder TOTAL-RECALL-Token verwenden",
				password: true,
				ignoreFocusOut: true,
			})
			if (authToken === undefined) return
			const actor = await configure({ endpoint, authToken })
			await vscode.window.showInformationMessage(
				`Gemeinsame Runtime als ${actor} ausgewählt. Schreibrechte werden getrennt vergeben.`,
			)
		} catch (error) {
			await vscode.window.showErrorMessage(
				error instanceof SharedRuntimeConfigurationError
					? error.message
					: "Die gemeinsame Runtime konnte nicht ausgewählt werden. Es wurde keine erfolgreiche Verbindung bestätigt.",
			)
		}
	})
}

export function registerSharedSessionWriterCommands(
	control: (
		action: "get" | "claim" | "release",
		expectedRevision?: number,
		expectedSessionId?: string,
	) => Promise<SharedSessionWriterSnapshot>,
): vscode.Disposable[] {
	return (["claim", "release"] as const).map((action) => {
		const command =
			action === "claim"
				? ExtensionRegistryInfo.commands.ClaimSharedSession
				: ExtensionRegistryInfo.commands.ReleaseSharedSession
		return vscode.commands.registerCommand(command, async () => {
			try {
				const inspected = await control("get")
				const button = action === "claim" ? "Schreibrecht übernehmen" : "Schreibrecht freigeben"
				const confirmed = await vscode.window.showInformationMessage(
					`${button} für Sitzung ${inspected.sessionId} als ${inspected.actorId}? Aktuelle Zuständigkeit: ${inspected.control.writer?.actorId ?? "frei"}.`,
					{ modal: true },
					button,
				)
				if (confirmed !== button) return
				const result = await control(action, inspected.control.revision, inspected.sessionId)
				if (
					result.sessionId !== inspected.sessionId ||
					result.actorId !== inspected.actorId ||
					(action === "claim" ? result.control.writer?.actorId !== result.actorId : result.control.writer !== undefined)
				) {
					throw new SharedRuntimeConfigurationError(
						"Die angeforderte Schreibzuständigkeit wurde nicht bestätigt. Aktuellen Zustand erneut lesen.",
					)
				}
				await vscode.window.showInformationMessage(`${button} bestätigt: ${result.sessionId} (${result.actorId}).`)
			} catch (error) {
				await vscode.window.showErrorMessage(
					error instanceof SharedRuntimeConfigurationError
						? error.message
						: "Schreibübergabe nicht bestätigt. Zuständigkeit und tatsächlichen Prozesszustand prüfen; es wurde kein automatischer Wiederholungsversuch ausgeführt.",
				)
			}
		})
	})
}
