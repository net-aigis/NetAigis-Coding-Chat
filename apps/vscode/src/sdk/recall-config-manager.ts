/** TOTAL RECALL uses the existing shared, protected file-backed secret store. */
import type * as vscode from "vscode"
import { StateManager } from "@/core/storage/StateManager"
import { Logger } from "@/shared/services/Logger"
import type { RecallConfiguration } from "./recall-outbox"

export const TOTAL_RECALL_SECRET_PREFIX = "netaigis-recall"
const CONFIG_KEYS = ["base_url", "token", "project", "actor"] as const
export interface TotalRecallConfigSecrets {
	baseUrl?: string
	token?: string
	project?: string
	actor?: string
}

export class TotalRecallConfigManager {
	// Retain the old construction API. Native storage is read only by the
	// dedicated migration before StateManager is initialized.
	constructor(_context?: vscode.ExtensionContext) {}

	async initialize(): Promise<RecallConfiguration | undefined> {
		try {
			const state = StateManager.get()
			const baseUrl = state.getSecretKey("netaigis-recall_base_url")
			const token = state.getSecretKey("netaigis-recall_token")
			const project = state.getSecretKey("netaigis-recall_project")
			const actor = state.getSecretKey("netaigis-recall_actor")
			if (!baseUrl || !token || !project?.trim() || !actor?.trim()) return undefined
			const url = new URL(baseUrl)
			if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
			return {
				baseUrl: baseUrl.replace(/\/+$/, ""),
				token,
				project,
				actor,
				enabled: state.getSecretKey("netaigis-recall_enabled") !== "false",
			}
		} catch {
			// Do not log configuration objects, invalid URL inputs or credentials.
			Logger.error("[TOTAL RECALL] Configuration unavailable or invalid")
			return undefined
		}
	}

	async isConfigured(): Promise<boolean> {
		return Boolean((await this.initialize())?.enabled)
	}

	async storeSecret(key: (typeof CONFIG_KEYS)[number], value: string): Promise<void> {
		const state = StateManager.get()
		state.setSecret(`${TOTAL_RECALL_SECRET_PREFIX}_${key}`, value)
		await state.flushPendingState()
	}

	async configure(config: Required<TotalRecallConfigSecrets>): Promise<void> {
		const url = new URL(config.baseUrl)
		if (!["http:", "https:"].includes(url.protocol) || !config.token || !config.project.trim() || !config.actor.trim()) {
			throw new Error("TOTAL RECALL requires a valid HTTP endpoint, credential, project and actor")
		}
		const state = StateManager.get()
		state.setSecretsBatch({
			"netaigis-recall_base_url": config.baseUrl.replace(/\/+$/, ""),
			"netaigis-recall_token": config.token,
			"netaigis-recall_project": config.project,
			"netaigis-recall_actor": config.actor,
			"netaigis-recall_enabled": "true",
			"netaigis-recall_migration_v1": "1",
		})
		await state.flushPendingState()
	}

	async setEnabled(enabled: boolean): Promise<void> {
		const state = StateManager.get()
		state.setSecret("netaigis-recall_enabled", String(enabled))
		await state.flushPendingState()
	}

	async clear(): Promise<void> {
		const state = StateManager.get()
		for (const key of CONFIG_KEYS) state.setSecret(`${TOTAL_RECALL_SECRET_PREFIX}_${key}`, undefined)
		state.setSecret("netaigis-recall_enabled", "false")
		state.setSecret("netaigis-recall_migration_v1", "1")
		await state.flushPendingState()
	}

	async validate(): Promise<{ valid: boolean; errors?: string[] }> {
		return (await this.initialize()) ? { valid: true } : { valid: false, errors: ["Configuration incomplete or invalid"] }
	}
}

let recallConfigManager: TotalRecallConfigManager | undefined
export function getRecallConfigManager(context?: vscode.ExtensionContext): TotalRecallConfigManager {
	return (recallConfigManager ??= new TotalRecallConfigManager(context))
}
export async function getRecallConfiguration(): Promise<RecallConfiguration | undefined> {
	return getRecallConfigManager().initialize()
}
export async function refreshRecallConfiguration(): Promise<void> {
	await getRecallConfiguration()
}
export function clearRecallConfigurationCache(): void {
	recallConfigManager = undefined
}
