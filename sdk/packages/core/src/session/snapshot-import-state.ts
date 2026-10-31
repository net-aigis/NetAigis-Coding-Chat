/** A partial native import is inspectable, but must not execute or be silently replaced. */
export const SNAPSHOT_IMPORT_METADATA_KEY = "runtimeSnapshotImport";

export function assertSnapshotImportComplete(
	metadata: Record<string, unknown> | null | undefined,
): void {
	if (!metadata || metadata[SNAPSHOT_IMPORT_METADATA_KEY] === undefined) return;
	const state = metadata[SNAPSHOT_IMPORT_METADATA_KEY] as Record<
		string,
		unknown
	> | null;
	if (!state || state.version !== 1 || state.state !== "complete")
		throw new Error(
			"Native session import is incomplete; original source and partial target were retained",
		);
}
