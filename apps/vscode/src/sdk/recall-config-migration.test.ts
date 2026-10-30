import { mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type * as vscode from "vscode"
import { exportVSCodeStorageToSharedFiles, migrateLegacyRecallSecrets } from "@/hosts/vscode/vscode-to-file-migration"
import { ClineFileStorage } from "@/shared/storage/ClineFileStorage"

vi.mock("@/shared/services/Logger", () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/hosts/vscode/mcp-settings-legacy-migration", () => ({
	migrateLegacyMcpSettings: async () => ({ serversAdded: 0, serversSkippedExisting: 0 }),
}))
let directory: string | undefined
afterEach(async () => {
	if (directory) await rm(directory, { recursive: true, force: true })
	directory = undefined
})

describe("legacy Recall credentials migration", () => {
	it("does not resurrect cleared Recall keys during the independent general migration", async () => {
		const values = new Map<string, string>([
			["netaigis-recall_migration_v1", "1"],
			["netaigis-recall_enabled", "false"],
		])
		const secrets = {
			get: (key: string) => values.get(key),
			setBatch: (batch: Record<string, string>) => {
				for (const [key, value] of Object.entries(batch)) values.set(key, value)
			},
		}
		const native = vi.fn(async (key: string) => (key.startsWith("netaigis-recall_") ? "old-native-value" : undefined))
		const globals = new Map<string, unknown>()
		const storage = {
			secrets,
			globalState: {
				get: (key: string) => globals.get(key),
				setBatch: (batch: Record<string, unknown>) => {
					for (const [key, value] of Object.entries(batch)) globals.set(key, value)
				},
			},
			workspaceState: { get: () => undefined, setBatch: () => {} },
		}
		const context = {
			secrets: { get: native },
			globalState: { get: () => undefined },
			workspaceState: { get: () => undefined },
		}
		await exportVSCodeStorageToSharedFiles(context as unknown as vscode.ExtensionContext, storage as never)
		expect(native.mock.calls.some(([key]) => key.startsWith("netaigis-recall_"))).toBe(false)
		expect(values.get("netaigis-recall_token")).toBeUndefined()
		expect(values.get("netaigis-recall_enabled")).toBe("false")
	})

	it("keeps file values, retains native originals and actually persists a protected restart-readable copy", async () => {
		directory = await mkdtemp(path.join(os.tmpdir(), "cline-recall-migration-"))
		const target = path.join(directory, "secrets.json")
		const secrets = new ClineFileStorage<string>(target, "Secrets", { fileMode: 0o600 })
		await secrets.setBatch({ "netaigis-recall_project": "existing-independent-project" })
		const legacy: Record<string, string> = {
			base_url: "http://recall-fixture.invalid:11436",
			token: "fixture-credential",
			project: "older-project",
			actor: "Friseer",
		}
		const native = {
			get: vi.fn(async (key: string) => legacy[key.replace("netaigis-recall_", "")]),
			store: vi.fn(),
			delete: vi.fn(),
		}
		const context = { secrets: native } as unknown as vscode.ExtensionContext
		expect(await migrateLegacyRecallSecrets(context, { secrets })).toBe(3)
		expect(secrets.get("netaigis-recall_project")).toBe("existing-independent-project")
		expect(new ClineFileStorage<string>(target).get("netaigis-recall_token")).toBe("fixture-credential")
		expect((await stat(target)).mode & 0o777).toBe(0o600)
		expect(native.store).not.toHaveBeenCalled()
		expect(native.delete).not.toHaveBeenCalled()
		native.get.mockClear()
		expect(await migrateLegacyRecallSecrets(context, { secrets })).toBe(0)
		expect(native.get).not.toHaveBeenCalled()
	})

	it("keeps a failed migration retryable without writing a completion sentinel", async () => {
		const values = new Map<string, string>()
		const setBatch = vi.fn()
		const context = {
			secrets: {
				get: vi.fn(async () => {
					throw new Error("keyring unavailable")
				}),
			},
		} as unknown as vscode.ExtensionContext
		const storage = { secrets: { get: (key: string) => values.get(key), setBatch } } as unknown as Parameters<
			typeof migrateLegacyRecallSecrets
		>[1]
		await expect(migrateLegacyRecallSecrets(context, storage)).rejects.toThrow("keyring unavailable")
		expect(setBatch).not.toHaveBeenCalled()
	})
})
