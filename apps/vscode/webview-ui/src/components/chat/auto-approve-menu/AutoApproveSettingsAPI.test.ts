import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAutoApproveActions } from "@/hooks/useAutoApproveActions"
import { StateServiceClient } from "@/services/grpc-client"
import { isToolAutoApproved } from "../../../../../src/sdk/sdk-tool-policies"
import { ACTION_METADATA } from "./constants"

vi.mock("@/services/grpc-client", () => ({
	StateServiceClient: { getLatestState: vi.fn(), updateAutoApprovalSettings: vi.fn() },
}))
const context = vi.hoisted(() => ({ settings: undefined as unknown }))
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ autoApprovalSettings: context.settings }),
}))

describe("auto-approval checkbox updates", () => {
	let stored: typeof DEFAULT_AUTO_APPROVAL_SETTINGS
	beforeEach(() => {
		vi.clearAllMocks()
		stored = {
			...DEFAULT_AUTO_APPROVAL_SETTINGS,
			version: 1,
			actions: {
				readFiles: false,
				editFiles: false,
				executeSafeCommands: false,
				executeAllCommands: false,
				useBrowser: false,
				useMcp: false,
			},
		}
		// Keep the old rendered snapshot until the asynchronous host state arrives.
		context.settings = stored
		vi.mocked(StateServiceClient.getLatestState).mockImplementation(async () => ({
			stateJson: JSON.stringify({ autoApprovalSettings: stored }),
		}))
		vi.mocked(StateServiceClient.updateAutoApprovalSettings).mockImplementation(async (request) => {
			// Existing host behavior: a second request with the same version is ignored.
			if (request.version > stored.version)
				stored = { ...stored, ...request, actions: { ...stored.actions, ...request.actions } }
			return {}
		})
	})

	it("retains all five grants when checkboxes are changed before the preceding state update arrives", async () => {
		const { result } = renderHook(useAutoApproveActions)
		await act(async () => {
			await Promise.all(ACTION_METADATA.map((action) => result.current.updateAction(action, true)))
		})
		const keys = ["readFiles", "editFiles", "executeSafeCommands", "useBrowser", "useMcp"] as const
		for (const key of keys) expect(stored.actions[key]).toBe(true)
		expect(stored.version).toBe(6)
		for (const tool of ["read_files", "editor", "run_commands", "fetch_web_content", "fixture__echo"])
			expect(isToolAutoApproved(tool, stored)).toBe(true)
	})

	it("does not leave a failed request blocking later permission changes", async () => {
		const { result } = renderHook(useAutoApproveActions)
		vi.mocked(StateServiceClient.updateAutoApprovalSettings).mockRejectedValueOnce(new Error("transport unavailable"))
		await expect(result.current.updateAction(ACTION_METADATA[1], true)).rejects.toThrow("transport unavailable")
		await act(async () => result.current.updateAction(ACTION_METADATA[4], true))
		expect(stored.actions.useMcp).toBe(true)
		expect(stored.actions.editFiles).toBe(false)
	})

	it("reapplies only the requested change after a concurrent window commits another setting", async () => {
		const { result } = renderHook(useAutoApproveActions)
		vi.mocked(StateServiceClient.updateAutoApprovalSettings).mockImplementationOnce(async () => {
			stored = { ...stored, version: stored.version + 1, actions: { ...stored.actions, readFiles: true } }
			throw new Error("auto_approval_version_conflict")
		})
		await act(async () => result.current.updateAction(ACTION_METADATA[1], true))
		expect(stored.actions.readFiles).toBe(true)
		expect(stored.actions.editFiles).toBe(true)
	})
})
