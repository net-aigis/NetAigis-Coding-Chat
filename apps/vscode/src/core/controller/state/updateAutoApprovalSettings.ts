import { Empty } from "@shared/proto/cline/common"
import { AutoApprovalSettingsRequest } from "@shared/proto/cline/state"
import { Controller } from ".."

/**
 * Updates the auto approval settings
 * @param controller The controller instance
 * @param request The auto approval settings request
 * @returns Empty response
 */
export async function updateAutoApprovalSettings(controller: Controller, request: AutoApprovalSettingsRequest): Promise<Empty> {
	// Keep the version check and cache write in one synchronous turn. Awaiting
	// a complete webview state here lets two requests accept the same version.
	const currentSettings = controller.stateManager.getGlobalSettingsKey("autoApprovalSettings")
	const incomingVersion = request.version
	const currentVersion = currentSettings?.version ?? 1

	if (!Number.isSafeInteger(incomingVersion) || incomingVersion < 1) throw new Error("Invalid auto-approval settings version")
	if (incomingVersion <= currentVersion) {
		await controller.postStateToWebview()
		throw new Error("auto_approval_version_conflict")
	}

	// Only update if incoming version is higher
	if (incomingVersion > currentVersion) {
		// Merge with current settings to preserve unspecified fields
		const settings = {
			...currentSettings,
			...(request.version !== undefined && { version: request.version }),
			...(request.enableNotifications !== undefined && { enableNotifications: request.enableNotifications }),
			actions: {
				...currentSettings.actions,
				...(request.actions
					? Object.fromEntries(Object.entries(request.actions).filter(([_, v]) => v !== undefined))
					: {}),
			},
		}

		controller.stateManager.setGlobalState("autoApprovalSettings", settings)
		if (controller.task?.taskId) {
			controller.stateManager.setTaskSettings(controller.task.taskId, "autoApprovalSettings", settings)
		}

		await controller.postStateToWebview()
	}

	return Empty.create()
}
