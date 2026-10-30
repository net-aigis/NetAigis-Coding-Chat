/**
 * TotalRecallConfigManager - Manages TOTAL RECALL configuration in VS Code SecretStorage
 */

import { Logger } from "@/shared/services/Logger"
import type { RecallConfiguration } from "./recall-outbox"
import * as vscode from "vscode"

export const TOTAL_RECALL_SECRET_PREFIX = "netaigis-recall"

export interface TotalRecallConfigSecrets {
  baseUrl?: string
  token?: string
  project?: string
  actor?: string
}

/**
 * Manages TOTAL RECALL configuration securely in VS Code SecretStorage.
 */
export class TotalRecallConfigManager {
  private static readonly CONFIG_KEYS = ["base_url", "token", "project", "actor"] as const

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Initializes TOTAL RECALL configuration from SecretStorage.
   */
  async initialize(): Promise<RecallConfiguration | undefined> {
    try {
      const baseUrl = await this.context.secrets.get(`${TOTAL_RECALL_SECRET_PREFIX}_base_url`)
      const token = await this.context.secrets.get(`${TOTAL_RECALL_SECRET_PREFIX}_token`)
      const project = await this.context.secrets.get(`${TOTAL_RECALL_SECRET_PREFIX}_project`)
      const actor = await this.context.secrets.get(`${TOTAL_RECALL_SECRET_PREFIX}_actor`)

      if (!baseUrl || !token || !project || !actor) {
        return undefined
      }

      try {
        new URL(baseUrl)
      } catch {
        Logger.error("[TOTAL RECALL] Invalid base URL format")
        return undefined
      }

      const config: RecallConfiguration = {
        baseUrl: baseUrl.replace(/\/+$/, ""),
        token,
        project,
        actor,
        enabled: true,
      }

      Logger.info("[TOTAL RECALL] Configuration initialized successfully")
      return config
    } catch (error) {
      Logger.error("[TOTAL RECALL] Failed to load configuration:", error)
      return undefined
    }
  }

  async isConfigured(): Promise<boolean> {
    const config = await this.initialize()
    return !!config && config.enabled
  }

  async storeSecret(key: (typeof TotalRecallConfigManager.CONFIG_KEYS)[number], value: string): Promise<void> {
    const secretKey = `${TOTAL_RECALL_SECRET_PREFIX}_${key}`
    await this.context.secrets.store(secretKey, value)
    Logger.info(`[TOTAL RECALL] Stored ${key} successfully`)
  }

  async clear(): Promise<void> {
    for (const key of TotalRecallConfigManager.CONFIG_KEYS) {
      const secretKey = `${TOTAL_RECALL_SECRET_PREFIX}_${key}`
      await this.context.secrets.delete(secretKey)
    }
    Logger.info("[TOTAL RECALL] Configuration cleared")
  }

  async validate(): Promise<{ valid: boolean; errors?: string[] }> {
    const config = await this.initialize()
    if (!config) {
      return { valid: false, errors: ["Not fully configured"] }
    }

    const errors: string[] = []

    try {
      new URL(config.baseUrl)
    } catch {
      errors.push("Invalid base URL format")
    }

    if (!config.token || config.token.length < 16) {
      errors.push("Token too short or missing")
    }

    if (!config.project || config.project.trim().length === 0) {
      errors.push("Project ID missing")
    }

    if (!config.actor || config.actor.trim().length === 0) {
      errors.push("Actor ID missing")
    }

    return { valid: errors.length === 0, errors }
  }
}

let recallConfigManager: TotalRecallConfigManager | undefined
let cachedRecallConfig: RecallConfiguration | undefined

export function getRecallConfigManager(context: vscode.ExtensionContext): TotalRecallConfigManager {
  if (!recallConfigManager) {
    recallConfigManager = new TotalRecallConfigManager(context)
  }
  return recallConfigManager
}

export async function getRecallConfiguration(): Promise<RecallConfiguration | undefined> {
  if (!recallConfigManager) return undefined
  return await recallConfigManager.initialize()
}

export async function refreshRecallConfiguration(): Promise<void> {
  const config = await getRecallConfiguration()
  if (config) {
    cachedRecallConfig = config
    Logger.info("[TOTAL RECALL] Configuration refreshed")
  }
}

export function clearRecallConfigurationCache(): void {
  cachedRecallConfig = undefined
}
