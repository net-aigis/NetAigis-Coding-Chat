import type { DynamicContextInfo, ModelInfo } from "@shared/api"

type Endpoint = { providerId: string; baseUrl?: string; apiKey?: string; headers?: Readonly<Record<string, string>> }

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function positiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

/** Accept only the selected endpoint's explicit versioned capability, never model-name heuristics. */
export function parseDynamicContext(listing: unknown, modelId: string, now = Date.now()): DynamicContextInfo | undefined {
	const entries = record(listing).data
	if (!Array.isArray(entries)) return undefined
	const matches = entries.filter((entry) => record(entry).id === modelId)
	if (matches.length !== 1) return undefined
	const value = record(record(matches[0]).netaigis_context)
	if (value.version !== 1 || value.state !== "ready" || value.allocation !== "on_demand") return undefined
	const { loaded_capacity: loadedCapacity, request_limit: requestLimit, tiers } = value
	if (!positiveInteger(loadedCapacity) || !positiveInteger(requestLimit) || !Array.isArray(tiers) || !tiers.length)
		return undefined
	if (tiers.some((tier, index) => !positiveInteger(tier) || (index > 0 && tier <= tiers[index - 1]))) return undefined
	if (tiers.at(-1) !== requestLimit) return undefined
	return { loadedCapacity, requestLimit, tiers: [...tiers], observedAtMs: now }
}

export async function readDynamicContext(
	endpoint: Endpoint,
	modelId: string,
	requestFetch: typeof fetch = globalThis.fetch,
): Promise<DynamicContextInfo | undefined> {
	if (!["openai", "openai-compatible"].includes(endpoint.providerId) || !endpoint.baseUrl || !modelId) return undefined
	try {
		const url = new URL(`${endpoint.baseUrl.replace(/\/+$/, "")}/models`)
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
			return undefined
		const response = await requestFetch(url, {
			headers: { ...endpoint.headers, ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}) },
			redirect: "error",
			signal: AbortSignal.timeout(3000),
		})
		if (!response.ok || !response.body) return undefined
		const reader = response.body.getReader()
		const chunks: Uint8Array[] = []
		let size = 0
		try {
			while (true) {
				const chunk = await reader.read()
				if (chunk.done) break
				size += chunk.value.byteLength
				if (size > 1_048_576) return undefined
				chunks.push(chunk.value)
			}
		} finally {
			await reader.cancel().catch(() => {})
			reader.releaseLock()
		}
		const bytes = new Uint8Array(size)
		let offset = 0
		for (const chunk of chunks) {
			bytes.set(chunk, offset)
			offset += chunk.byteLength
		}
		return parseDynamicContext(JSON.parse(new TextDecoder().decode(bytes)), modelId)
	} catch {
		// Keep ordinary providers usable. Never log URLs, headers or response bodies.
		return undefined
	}
}

export async function withDynamicContext(endpoint: Endpoint, modelId: string, info: ModelInfo): Promise<ModelInfo> {
	const dynamicContext = await readDynamicContext(endpoint, modelId)
	// A failed current observation must not preserve a previously cached live claim.
	const { dynamicContext: _previous, ...base } = info
	return dynamicContext ? { ...base, dynamicContext } : base
}
