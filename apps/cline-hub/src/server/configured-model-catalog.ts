import type { WebviewProviderModel } from "../webview-protocol";

/** A manually configured endpoint model need not exist in the bundled catalog. */
export function includeConfiguredModel(
	models: WebviewProviderModel[],
	configuredModel: string | undefined,
): WebviewProviderModel[] {
	const id = configuredModel?.trim();
	if (!id || models.some((model) => model.id === id)) return models;
	// Do not invent context limits, modalities, or reasoning capabilities.
	return [{ id, name: id }, ...models];
}
