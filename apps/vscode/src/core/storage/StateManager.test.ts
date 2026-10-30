import { afterEach, describe, expect, it, mock, spyOn } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import chokidar from "chokidar"
import { ClineFileStorage } from "@/shared/storage/ClineFileStorage"
import { createStorageContext } from "@/shared/storage/storage-context"

// Keep host services out of this node-side storage test.
mock.module("@/services/logging/distinctId", () => ({ initializeDistinctId: async () => {} }))
mock.module("./disk", () => ({
	readTaskSettingsFromStorage: async () => ({}),
	writeTaskSettingsToStorage: async () => {},
}))
mock.module("./remote-config/utils", () => ({ filterAllowedRemoteConfigFields: () => ({}) }))

describe("StateManager initialization", () => {
	let temporaryDirectory: string | undefined

	afterEach(async () => {
		const { StateManager } = await import("./StateManager")
		const instance = Reflect.get(StateManager, "instance")
		if (instance) Reflect.get(instance, "dispose").call(instance)
		Reflect.set(StateManager, "instance", undefined)
		mock.restore()
		if (temporaryDirectory) {
			await fs.rm(temporaryDirectory, { recursive: true, force: true })
		}
	})

	it("loads and persists state without reading or watching legacy agent configs", async () => {
		temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cline-state-manager-"))
		const agentsDirectory = path.join(temporaryDirectory, "Documents", "Cline", "Agents")
		await fs.mkdir(agentsDirectory, { recursive: true })
		const agentFile = path.join(agentsDirectory, "legacy.yaml")
		const legacyConfig = "---\nname: Legacy\ndescription: Old config\ntools: focus_chain\n---\nLegacy prompt\n"
		await fs.writeFile(agentFile, legacyConfig)

		spyOn(os, "homedir").mockReturnValue(temporaryDirectory)
		const readDirectory = spyOn(fs, "readdir")
		const watch = spyOn(chokidar, "watch").mockImplementation(() => {
			throw new Error("State initialization must not start an agent config watcher")
		})
		const storage = createStorageContext({ clineDir: path.join(temporaryDirectory, ".cline") })
		storage.globalStateBackingStore.set("clineVersion", "saved-version")
		storage.secrets.set("apiKey", "test-api-key")
		storage.workspaceState.set("localClineRulesToggles", { "rule.md": true })

		const { StateManager } = await import("./StateManager")
		const stateManager = await StateManager.initialize(storage)
		expect(stateManager.getGlobalStateKey("clineVersion")).toBe("saved-version")
		expect(stateManager.getSecretKey("apiKey")).toBe("test-api-key")
		expect(stateManager.getWorkspaceStateKey("localClineRulesToggles")).toEqual({ "rule.md": true })

		stateManager.setGlobalState("clineVersion", "updated-version")
		await stateManager.flushPendingState()
		const savedState = new ClineFileStorage<string>(path.join(storage.dataDir, "globalState.json"))
		const savedVersion = savedState.get("clineVersion")
		expect(savedVersion).toBe("updated-version")
		await stateManager.reInitialize()
		expect(stateManager.getGlobalStateKey("clineVersion")).toBe("updated-version")

		expect(readDirectory).not.toHaveBeenCalled()
		expect(watch).not.toHaveBeenCalled()
		expect(await fs.readFile(agentFile, "utf8")).toBe(legacyConfig)
	})

	it("keeps Recall credentials in protected storage and out of model API configuration", async () => {
		temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cline-recall-state-"))
		const storage = createStorageContext({ clineDir: temporaryDirectory })
		await storage.secrets.setBatch({ apiKey: "fixture-model-key", "netaigis-recall_token": "fixture-recall-key", "netaigis-recall_actor": "Friseer" })
		const { StateManager } = await import("./StateManager")
		const manager = await StateManager.initialize(storage)
		expect(manager.getSecretKey("netaigis-recall_token")).toBe("fixture-recall-key")
		expect(manager.getApiConfiguration().apiKey).toBe("fixture-model-key")
		expect(manager.getApiConfiguration()).not.toHaveProperty("netaigis-recall_token")
		expect(manager.getApiConfiguration()).not.toHaveProperty("netaigis-recall_actor")
	})
})
