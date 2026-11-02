/** Project binding in the existing canonical session metadata, never a second store. */
import { SNAPSHOT_IMPORT_METADATA_KEY } from "../session/snapshot-import-state";

export const RECALL_PROJECT_METADATA_KEY = "recallProjectId";

export function readSessionRecallProject(
	metadata: Record<string, unknown> | null | undefined,
): string | undefined {
	const explicit = metadata?.[RECALL_PROJECT_METADATA_KEY];
	if (
		explicit !== undefined &&
		(typeof explicit !== "string" || !explicit.trim())
	)
		throw new Error("Canonical Recall project binding is invalid");
	const imported = metadata?.[SNAPSHOT_IMPORT_METADATA_KEY] as
		| { state?: unknown; source?: { kind?: unknown; projectId?: unknown } }
		| undefined;
	const source =
		imported?.state === "complete" && imported.source?.kind === "recall"
			? imported.source.projectId
			: undefined;
	if (source !== undefined && (typeof source !== "string" || !source.trim()))
		throw new Error("Imported Recall project binding is invalid");
	if (explicit !== undefined && source !== undefined && explicit !== source)
		throw new Error("Canonical and imported Recall project bindings disagree");
	return (explicit as string | undefined) ?? (source as string | undefined);
}

export function preserveSessionRecallProject(
	previous: Record<string, unknown> | null | undefined,
	next: Record<string, unknown>,
): Record<string, unknown> {
	const existing = readSessionRecallProject(previous);
	const requested = readSessionRecallProject(next);
	if (existing && requested && existing !== requested)
		throw new Error(
			"An existing canonical Recall project cannot be reassigned",
		);
	return existing ? { ...next, [RECALL_PROJECT_METADATA_KEY]: existing } : next;
}
