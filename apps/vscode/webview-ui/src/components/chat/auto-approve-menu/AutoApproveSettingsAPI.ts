import type { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { StateServiceClient } from "@/services/grpc-client"

// Shared by all checkbox hook instances in this webview. Rendered state may
// lag several clicks behind the host; apply each intent to the latest state.
let pendingUpdate: Promise<void> = Promise.resolve()

export function updateAutoApproveSettings(change: (current: AutoApprovalSettings) => AutoApprovalSettings): Promise<void> {
	const update = pendingUpdate.then(async () => {
		for (let attempt = 0; attempt < 3; attempt++) {
			const response = await StateServiceClient.getLatestState({ metadata: {} })
			let current: AutoApprovalSettings
			try {
				current = JSON.parse(response.stateJson).autoApprovalSettings
			} catch {
				throw new Error("Current auto-approval settings could not be read")
			}
			if (
				!current ||
				!Number.isSafeInteger(current.version) ||
				current.version < 1 ||
				current.version >= 2_147_483_647 ||
				!current.actions ||
				typeof current.actions !== "object" ||
				Array.isArray(current.actions)
			)
				throw new Error("Current auto-approval settings are invalid")

			try {
				await StateServiceClient.updateAutoApprovalSettings({
					metadata: {},
					...change(current),
					version: current.version + 1,
				})
				return
			} catch (error) {
				if (!(error instanceof Error) || !error.message.includes("auto_approval_version_conflict")) throw error
			}
		}
		throw new Error("Auto-approval settings changed concurrently; try again")
	})
	// A failed RPC remains visible to its caller without poisoning later clicks.
	pendingUpdate = update.catch(() => {})
	return update
}
