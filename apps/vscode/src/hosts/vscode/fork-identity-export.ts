/** Minimal old-ID export helper. Use against an isolated copy of the old profile, never install over production. */

import { createHash } from "node:crypto"
import * as path from "node:path"
import type * as vscode from "vscode"
import { LEGACY_EXTENSION_ID } from "../../shared/fork-identity"
import { SecretKeys } from "../../shared/storage/state-keys"
import { exportIdentityTransfer } from "./fork-identity-migration"

export function activate(context: vscode.ExtensionContext) {
	if (context.extension.id !== LEGACY_EXTENSION_ID) throw new Error("Export helper must run under the source identity")
	return {
		exportIdentityTransfer: (
			options: Omit<Parameters<typeof exportIdentityTransfer>[1], "secretKeys"> & { legacyOriginalFrom?: string },
		) => {
			const { legacyOriginalFrom, ...transferOptions } = options
			if (legacyOriginalFrom !== undefined && !path.isAbsolute(legacyOriginalFrom))
				throw new Error("Original legacy storage path must be absolute")
			return exportIdentityTransfer(context, {
				...transferOptions,
				roots: [
					...transferOptions.roots,
					{ from: context.globalStorageUri.fsPath, to: "legacy", originalFrom: legacyOriginalFrom },
				],
				secretKeys: SecretKeys,
			})
		},
		// Digest-only diagnostic lets an isolated test verify retention without returning plaintext credentials.
		secretDigest: async (key: string) => {
			const value = await context.secrets.get(key)
			return value === undefined ? undefined : createHash("sha256").update(value).digest("hex")
		},
	}
}
