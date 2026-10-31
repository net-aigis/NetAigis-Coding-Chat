/** Native persistence admission. Caller must establish source authority before calling. */
import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { sessionSnapshotRecoveryProblem } from "../../services/recall-session-reader";
import { assertSafeSessionArtifactId } from "../../services/session-artifacts";
import {
	buildManifestFromRow,
	buildMessagesFilePayload,
	resolveMessagesFileContext,
} from "../../services/session-data";
import type { SessionPersistenceAdapter } from "../../types/session";
import type { RootSessionArtifacts, SessionRow } from "../models/session-row";
import {
	type CoreSessionSnapshot,
	coreSessionSnapshotToRecord,
} from "../session-snapshot";
import { SNAPSHOT_IMPORT_METADATA_KEY } from "../snapshot-import-state";
import { writeFileAtomic } from "../stores/atomic-file";
import type { SessionManifestStore } from "../stores/session-manifest-store";

export interface NativeSnapshotImportInput {
	snapshot: CoreSessionSnapshot;
	/** Runtime-established evidence, never a substitute for verifying a remote producer. */
	source: {
		kind: "recall";
		projectId: string;
		conversationId: string;
		eventId: string;
		journalSeq: number;
		producerKeyId: string;
	};
	requestedBy: { actorId: string; clientId: string; requestId: string };
}
function encode(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}
function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function exclusiveFile(path: string, contents: string): void {
	const fd = openSync(path, "wx", 0o600);
	try {
		writeFileSync(fd, contents, "utf8");
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}
function assertFile(path: string, expected: string): void {
	const stat = lstatSync(path);
	if (
		!stat.isFile() ||
		stat.isSymbolicLink() ||
		readFileSync(path, "utf8") !== expected
	)
		throw new Error(
			"Import artifact differs from verified source; target retained without replacement",
		);
}

/** Idempotent recovery only of this exact import. There is no destructive rollback. */
export async function importNativeSessionSnapshot(
	adapter: SessionPersistenceAdapter,
	store: SessionManifestStore,
	input: NativeSnapshotImportInput,
): Promise<RootSessionArtifacts> {
	// Freeze the checked request across async writes; caller mutation cannot change authors.
	const { snapshot, source, requestedBy } = JSON.parse(
		JSON.stringify(input),
	) as NativeSnapshotImportInput;
	assertSafeSessionArtifactId(snapshot.sessionId);
	const problem = sessionSnapshotRecoveryProblem(snapshot);
	if (problem) throw new Error(`Snapshot cannot be imported: ${problem}`);
	if (
		source.kind !== "recall" ||
		source.conversationId !== snapshot.sessionId ||
		![
			source.projectId,
			source.eventId,
			requestedBy.actorId,
			requestedBy.clientId,
			requestedBy.requestId,
		].every((v) => typeof v === "string" && v.trim().length > 0) ||
		!Number.isSafeInteger(source.journalSeq) ||
		source.journalSeq < 1 ||
		!/^[a-f0-9]{64}$/.test(source.producerKeyId)
	)
		throw new Error("Verified import provenance is incomplete");
	if (!adapter.insertSessionIfAbsent)
		throw new Error("Session backend cannot admit a non-replacing import");
	const id = snapshot.sessionId;
	const dir = store.artifacts.sessionArtifactsDir(id);
	const manifestPath = store.artifacts.sessionManifestPath(id);
	const messagesPath = store.artifacts.sessionMessagesPath(id);
	const hash = digest({ snapshot, source });
	const old = await adapter.getSession(id);
	const marker = old?.metadata?.[SNAPSHOT_IMPORT_METADATA_KEY] as
		| Record<string, unknown>
		| undefined;
	if (
		old &&
		(!marker ||
			marker.version !== 1 ||
			marker.digest !== hash ||
			!["staging", "complete"].includes(String(marker.state)))
	)
		throw new Error("Session target already exists; history was not replaced");
	const state = marker ?? {
		version: 1,
		state: "staging",
		digest: hash,
		source,
		requestedBy,
		importedAt: new Date().toISOString(),
		originalControl: snapshot.metadata?.sharedSessionControl ?? null,
		originalCapabilityOwner: {
			clientId: snapshot.metadata?.hubCapabilityOwnerClientId ?? null,
			actorId: snapshot.metadata?.hubCapabilityOwnerActorId ?? null,
		},
	};
	const metadata: Record<string, unknown> = {
		...snapshot.metadata,
		[SNAPSHOT_IMPORT_METADATA_KEY]: state,
		sharedSessionControl: { version: 1, revision: 0 },
	};
	// Persisted archive routing/capability ownership never authenticates this runtime.
	delete metadata.hubCapabilityOwnerClientId;
	delete metadata.hubCapabilityOwnerActorId;
	delete metadata.autoApproveTools;
	const row: SessionRow = {
		...coreSessionSnapshotToRecord(snapshot),
		pid: 0,
		statusLock: 0,
		metadata,
		messagesPath,
		hookPath: "",
	};
	const stagedManifest = buildManifestFromRow(row);
	const payload = buildMessagesFilePayload({
		updatedAt: snapshot.updatedAt,
		context: resolveMessagesFileContext(row),
		messages: [],
	});
	// Deliberately bypass normalisation: canonical IDs, authors and original fields survive exactly.
	payload.messages = snapshot.messages!;
	const transcript = encode(payload);
	if (old && marker?.state === "complete") {
		assertFile(messagesPath, transcript);
		const manifest = store.readSessionManifest(id);
		if (
			!manifest ||
			(
				manifest.metadata?.[SNAPSHOT_IMPORT_METADATA_KEY] as Record<
					string,
					unknown
				>
			)?.state !== "complete"
		)
			throw new Error("Import commit is incomplete; target retained");
		return { manifestPath, messagesPath, manifest };
	}
	if (!old) {
		// Existing unknown directories, symlinks and files are never adopted.
		mkdirSync(dir, { mode: 0o700 });
		// The staged row is visible before any transcript exists and blocks runtime admission.
		if (!(await adapter.insertSessionIfAbsent(row)))
			throw new Error(
				"Session target already exists; reserved directory retained",
			);
	} else {
		if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())
			throw new Error("Import target directory changed");
		if (
			Object.entries(row).some(
				([key, expected]) =>
					key !== "statusLock" &&
					JSON.stringify(
						(old as unknown as Record<string, unknown>)[key] ?? null,
					) !== JSON.stringify(expected ?? null),
			)
		)
			throw new Error("Staged import row changed; target retained");
	}
	const complete = { ...state, state: "complete" };
	const committedMetadata = {
		...metadata,
		[SNAPSHOT_IMPORT_METADATA_KEY]: complete,
	};
	const manifest = buildManifestFromRow({
		...row,
		metadata: committedMetadata,
	});
	if (existsSync(manifestPath)) {
		try {
			assertFile(manifestPath, encode(stagedManifest));
		} catch {
			assertFile(manifestPath, encode(manifest));
		}
	} else exclusiveFile(manifestPath, encode(stagedManifest));
	if (existsSync(messagesPath)) assertFile(messagesPath, transcript);
	else exclusiveFile(messagesPath, transcript);
	// Manifest commits first. A still-staged index continues to block execution after a crash.
	await writeFileAtomic(manifestPath, encode(manifest), 0o600);
	const result = await adapter.updateSession({
		sessionId: id,
		metadata: committedMetadata,
		expectedStatusLock: old?.statusLock ?? 0,
	});
	if (!result.updated)
		throw new Error("Import index commit was not confirmed; target retained");
	return { manifestPath, messagesPath, manifest };
}
