/** Explicit setup of the existing shared Runtime; credentials never enter command arguments. */
import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"
import { SharedRuntimeConfigurationError, type SharedSessionHubConnection } from "@/sdk/shared-session-hub"

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
