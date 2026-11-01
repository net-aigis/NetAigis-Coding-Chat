import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveModelInfo } from "@/core/controller/models/resolveModelInfo"
import { fromProtobufModelInfo, toProtobufModelInfo } from "@/shared/proto-conversions/models/typeConversion"
import { parseDynamicContext, readDynamicContext, withDynamicContext } from "./dynamic-context"

function listing(model = "selected-model", extra = {}) {
	return {
		data: [
			{
				id: model,
				netaigis_context: {
					version: 1,
					state: "ready",
					allocation: "on_demand",
					loaded_capacity: 32768,
					request_limit: 1000000,
					tiers: [32768, 65536, 1000000],
					...extra,
				},
			},
		],
	}
}

afterEach(() => vi.unstubAllGlobals())

describe("live model-neutral context capability", () => {
	it("separates loaded allocation from requested ceiling for interchangeable model IDs", () => {
		for (const model of ["selected-model", "next-generation"]) {
			expect(parseDynamicContext(listing(model), model, 100)).toEqual({
				loadedCapacity: 32768,
				requestLimit: 1000000,
				tiers: [32768, 65536, 1000000],
				observedAtMs: 100,
			})
		}
	})

	it.each([
		{ state: "unknown" },
		{ allocation: "unavailable" },
		{ version: 2 },
		{ loaded_capacity: true },
		{ request_limit: 999999 },
		{ tiers: [32768, 32768, 1000000] },
		{ tiers: [65536, 32768, 1000000] },
		{ tiers: [] },
	])("rejects an unconfirmed or inconsistent capability %j", (value) => {
		expect(parseDynamicContext(listing("selected-model", value), "selected-model")).toBeUndefined()
	})

	it("never uses another model's capability or a duplicated catalog record", () => {
		expect(parseDynamicContext(listing("other-model"), "selected-model")).toBeUndefined()
		const value = listing()
		value.data.push(value.data[0])
		expect(parseDynamicContext(value, "selected-model")).toBeUndefined()
	})

	it("queries only the existing configured models endpoint with the existing credentials", async () => {
		const request = vi.fn(async () => Response.json(listing()))
		const value = await readDynamicContext(
			{ providerId: "openai", baseUrl: "http://127.0.0.1:12345/v1/", apiKey: "fixture", headers: { "X-Actor": "fixture" } },
			"selected-model",
			request as unknown as typeof fetch,
		)
		expect(value?.requestLimit).toBe(1000000)
		expect(request.mock.calls[0]).toEqual([
			new URL("http://127.0.0.1:12345/v1/models"),
			expect.objectContaining({
				redirect: "error",
				headers: { Authorization: "Bearer fixture", "X-Actor": "fixture" },
			}),
		])
	})

	it("does not contact an implicit provider endpoint or unrelated provider", async () => {
		const request = vi.fn()
		for (const endpoint of [{ providerId: "openai" }, { providerId: "anthropic", baseUrl: "http://127.0.0.1:12345/v1" }])
			expect(await readDynamicContext(endpoint, "selected-model", request as unknown as typeof fetch)).toBeUndefined()
		expect(request).not.toHaveBeenCalled()
	})

	it("retains ordinary metadata and drops stale live claims after a failed observation", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("private transport failure")
			}),
		)
		const info = {
			supportsPromptCache: false,
			contextWindow: 32768,
			dynamicContext: parseDynamicContext(listing(), "selected-model"),
		}
		expect(
			await withDynamicContext({ providerId: "openai", baseUrl: "http://127.0.0.1:12345/v1" }, "selected-model", info),
		).toEqual({ supportsPromptCache: false, contextWindow: 32768 })
	})

	it("preserves the observation through the actual host/webview protobuf conversion", () => {
		const info = {
			supportsPromptCache: false,
			contextWindow: 32768,
			dynamicContext: parseDynamicContext(listing(), "selected-model", 100),
		}
		expect(fromProtobufModelInfo(toProtobufModelInfo(info)).dynamicContext).toEqual(info.dynamicContext)
	})

	it("refreshes an old committed display limit from the actual host RPC without changing the selection", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(listing())),
		)
		const selection = { modelId: "selected-model", modelInfo: { contextWindow: 32768, supportsPromptCache: false } }
		const response = await resolveModelInfo(
			{
				getProviderConfigStore: () => ({
					read: () => ({ providerId: "openai", baseUrl: "http://127.0.0.1:12345/v1" }),
					readSelection: () => selection,
				}),
			} as never,
			{ providerId: "openai", modelId: "selected-model" },
		)
		expect(response.modelInfo?.dynamicContext?.requestLimit).toBe(1000000)
		expect(response.modelInfo?.dynamicContext?.loadedCapacity).toBe(32768)
		expect(selection.modelInfo).toEqual({ contextWindow: 32768, supportsPromptCache: false })
		expect(response.modelId).toBe("selected-model")
	})
})
