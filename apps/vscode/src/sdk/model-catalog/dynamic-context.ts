import { parseDynamicModelContext, readDynamicModelContext } from "@cline/core"
import type { ModelInfo } from "@shared/api"

// One protocol implementation shared with local/Hub saved-session bootstrap.
export const parseDynamicContext = parseDynamicModelContext
export const readDynamicContext = readDynamicModelContext

export async function withDynamicContext(
	endpoint: Parameters<typeof readDynamicContext>[0],
	modelId: string,
	info: ModelInfo,
): Promise<ModelInfo> {
	const dynamicContext = await readDynamicContext(endpoint, modelId)
	// A failed current observation must not preserve a previously cached live claim.
	const { dynamicContext: _previous, ...base } = info
	return dynamicContext ? { ...base, dynamicContext } : base
}
