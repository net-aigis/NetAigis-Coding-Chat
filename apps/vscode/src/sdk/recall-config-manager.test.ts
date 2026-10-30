import { beforeEach, describe, expect, it, vi } from "vitest"
import type * as vscode from "vscode"

const mocks = vi.hoisted(() => ({ values: new Map<string, string>(), flush: vi.fn(async () => {}) }))
vi.mock("@/core/storage/StateManager", () => ({
	StateManager: {
		get: () => ({
			getSecretKey: (key: string) => mocks.values.get(key),
			setSecret: (key: string, value?: string) =>
				value === undefined ? mocks.values.delete(key) : mocks.values.set(key, value),
			setSecretsBatch: (batch: Record<string, string>) => {
				for (const [key, value] of Object.entries(batch)) mocks.values.set(key, value)
			},
			flushPendingState: mocks.flush,
		}),
	},
}))
vi.mock("@/shared/services/Logger", () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const context = {
	secrets: { get: vi.fn(async () => "legacy-value"), store: vi.fn(), delete: vi.fn() },
} as unknown as vscode.ExtensionContext
beforeEach(() => {
	vi.resetModules()
	vi.clearAllMocks()
	mocks.values.clear()
	for (const [key, value] of Object.entries({
		base_url: "http://recall-fixture.invalid:11436",
		token: "fixture-credential",
		project: "independent-project",
		actor: "Friseer",
	}))
		mocks.values.set(`netaigis-recall_${key}`, value)
})

describe("file-backed TOTAL RECALL configuration", () => {
	it("reads existing file-backed values without accessing native VS Code secrets", async () => {
		const { TotalRecallConfigManager } = await import("./recall-config-manager")
		const config = await new TotalRecallConfigManager(context).initialize()
		expect(config).toMatchObject({
			baseUrl: "http://recall-fixture.invalid:11436",
			project: "independent-project",
			actor: "Friseer",
			enabled: true,
		})
		expect(context.secrets.get).not.toHaveBeenCalled()
	})

	it("loads configuration for SDK event archival before any command creates a manager", async () => {
		const { getRecallConfiguration } = await import("./recall-config-manager")
		expect(await getRecallConfiguration()).toMatchObject({ actor: "Friseer", project: "independent-project" })
	})

	it("clears the shared file values and does not resurrect legacy native credentials", async () => {
		const { TotalRecallConfigManager } = await import("./recall-config-manager")
		const manager = new TotalRecallConfigManager(context)
		await manager.clear()
		expect(mocks.values.has("netaigis-recall_token")).toBe(false)
		expect(await manager.initialize()).toBeUndefined()
		expect(context.secrets.delete).not.toHaveBeenCalled()
		expect(mocks.flush).toHaveBeenCalled()
	})
	it("saves only an explicit, complete configuration and preserves unrelated provider credentials", async () => {
		const { TotalRecallConfigManager } = await import("./recall-config-manager")
		const manager = new TotalRecallConfigManager()
		mocks.values.set("openAiApiKey", "fixture-model-credential")
		const config = {
			baseUrl: "http://explicit-fixture.invalid/recall-root/",
			token: "fixture-new-credential",
			project: "another-independent-project",
			actor: "jimmi",
		}
		await manager.configure(config)
		expect(await manager.initialize()).toEqual({
			...config,
			baseUrl: "http://explicit-fixture.invalid/recall-root",
			enabled: true,
		})
		expect(mocks.values.get("openAiApiKey")).toBe("fixture-model-credential")
		expect(mocks.flush).toHaveBeenCalledOnce()
		const before = new Map(mocks.values)
		await expect(manager.configure({ ...config, project: "" })).rejects.toThrow()
		expect(mocks.values).toEqual(before)
	})
})
