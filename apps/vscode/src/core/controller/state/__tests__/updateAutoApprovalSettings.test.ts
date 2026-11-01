import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Controller } from "@/core/controller"
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@/shared/AutoApprovalSettings"
import { AutoApprovalSettingsRequest } from "@/shared/proto/cline/state"
import { updateAutoApprovalSettings } from "../updateAutoApprovalSettings"

describe("auto-approval update version ownership", () => {
	let stored: typeof DEFAULT_AUTO_APPROVAL_SETTINGS
	let controller: Controller
	const post = vi.fn(async () => {})
	const setTask = vi.fn()
	beforeEach(() => {
		vi.clearAllMocks()
		stored = structuredClone(DEFAULT_AUTO_APPROVAL_SETTINGS)
		controller = {
			getStateToPostToWebview: async () => ({ autoApprovalSettings: structuredClone(stored) }),
			postStateToWebview: post,
			stateManager: {
				getGlobalSettingsKey: () => stored,
				setGlobalState: (_key: string, value: typeof stored) => {
					stored = value
				},
				setTaskSettings: setTask,
			},
		} as unknown as Controller
	})

	it("does not let two concurrent requests commit the same version", async () => {
		const results = await Promise.allSettled([
			updateAutoApprovalSettings(
				controller,
				AutoApprovalSettingsRequest.create({
					version: 2,
					actions: { ...stored.actions, readFiles: false },
				}),
			),
			updateAutoApprovalSettings(
				controller,
				AutoApprovalSettingsRequest.create({
					version: 2,
					actions: { ...stored.actions, executeSafeCommands: true },
				}),
			),
		])
		expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"])
		expect(stored.actions.readFiles).toBe(false)
		expect(stored.actions.executeSafeCommands).toBe(false)
		expect(stored.version).toBe(2)
	})

	it("returns current state and rejects a stale grant without altering permissions", async () => {
		const before = structuredClone(stored)
		await expect(
			updateAutoApprovalSettings(
				controller,
				AutoApprovalSettingsRequest.create({
					version: stored.version,
					actions: { executeSafeCommands: true },
				}),
			),
		).rejects.toThrow("auto_approval_version_conflict")
		expect(stored).toEqual(before)
		expect(post).toHaveBeenCalledTimes(1)
	})

	it("updates active-task and global settings together", async () => {
		Object.assign(controller, { task: { taskId: "current-task" } })
		await updateAutoApprovalSettings(
			controller,
			AutoApprovalSettingsRequest.create({
				version: 2,
				actions: { executeSafeCommands: true },
			}),
		)
		expect(setTask).toHaveBeenCalledWith("current-task", "autoApprovalSettings", stored)
		expect(stored.actions.executeSafeCommands).toBe(true)
	})
})
