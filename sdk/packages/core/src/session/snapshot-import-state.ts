/** A partial native import is inspectable, but must not execute or be silently replaced. */
export const SNAPSHOT_IMPORT_METADATA_KEY = "runtimeSnapshotImport";

export function assertSnapshotImportComplete(
	metadata: Record<string, unknown> | null | undefined,
): void {
	if (!metadata || !Object.hasOwn(metadata, SNAPSHOT_IMPORT_METADATA_KEY))
		return;
	const state = metadata[SNAPSHOT_IMPORT_METADATA_KEY] as Record<
		string,
		unknown
	> | null;
	if (!state || state.version !== 1 || state.state !== "complete")
		throw new Error(
			"Native session import is incomplete; original source and partial target were retained",
		);
}

export function assertSafeImportSessionId(id: string): void {
	if (
		!id ||
		id !== id.trim() ||
		[".", ".."].includes(id) ||
		/[/\\]/.test(id) ||
		Array.from(id).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
	)
		throw new Error("Unsafe archive session ID; no target was created");
}
