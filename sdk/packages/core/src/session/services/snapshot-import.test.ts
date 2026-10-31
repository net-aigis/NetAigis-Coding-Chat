/** Real native stores and files; producer/API/model inputs remain fixtures. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { LocalRuntimeHost } from "../../runtime/host/local-runtime-host";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import type { SessionPersistenceAdapter } from "../../types/session";
import { createCoreSessionSnapshot } from "../session-snapshot";
import { SNAPSHOT_IMPORT_METADATA_KEY } from "../snapshot-import-state";
import { FileSessionService } from "./file-session-service";
import { CoreSessionService } from "./session-service";
import type { NativeSnapshotImportInput } from "./snapshot-import";

async function fixture(kind: "files" | "sqlite") {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "native-import-"),
	);
	const db =
		kind === "sqlite"
			? new SqliteSessionStore({ sessionsDir: join(root, "db") })
			: undefined;
	const service = db
		? new CoreSessionService(db, {
				sessionArtifactsDir: join(root, "sessions"),
			})
		: new FileSessionService(join(root, "sessions"));
	const host = new LocalRuntimeHost({
		distinctId: "fixture-import",
		sessionService: service,
	});
	const snapshot = createCoreSessionSnapshot({
		session: {
			sessionId: "original-session",
			source: "vscode",
			status: "completed",
			interactive: true,
			startedAt: "2026-10-30T12:00:00Z",
			updatedAt: "2026-10-31T12:00:00Z",
			provider: "configured-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			isSubagent: false,
			metadata: {
				title: "Original task",
				originalOrder: "retain literally",
				checkpoint: {
					history: [{ ref: "retained-source-ref", runCount: 1, createdAt: 1 }],
				},
				sharedSessionControl: {
					version: 1,
					revision: 4,
					writer: {
						actorId: "Friseer",
						clientId: "old-vscode",
						connectionId: "old-connection",
					},
				},
				hubCapabilityOwnerClientId: "old-vscode",
				autoApproveTools: true,
			},
		},
		messages: [
			{
				role: "user",
				content: "Original accepted order",
				id: "original-order",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				role: "user",
				content: "Accepted correction",
				id: "correction",
				metadata: { author: { actorId: "jimmi" } },
			},
		] as never,
	});
	const input: NativeSnapshotImportInput = {
		snapshot,
		source: {
			kind: "recall",
			projectId: "project",
			conversationId: snapshot.sessionId,
			eventId: "fixture-event",
			journalSeq: 8,
			producerKeyId: "a".repeat(64),
		},
		requestedBy: {
			actorId: "jimmi",
			clientId: "fixture-android",
			requestId: "fixture-request",
		},
	};
	return {
		root,
		service,
		host,
		input,
		adapter: Reflect.get(service, "adapter") as SessionPersistenceAdapter,
		close: async () => {
			await host.dispose();
			db?.close();
			await rm(root, { recursive: true, force: true });
		},
	};
}

it.each([
	"files",
	"sqlite",
] as const)("imports canonical %s history once without reassigning authors, model or session ID", async (kind) => {
	const f = await fixture(kind);
	try {
		const source = structuredClone(f.input);
		const result = await f.host.importSessionSnapshot(f.input);
		const transcript = await readFile(result.messagesPath);
		expect(JSON.parse(transcript.toString()).messages).toEqual(
			source.snapshot.messages,
		);
		expect(result.manifest.session_id).toBe(source.snapshot.sessionId);
		expect(result.manifest.provider).toBe(source.snapshot.model.providerId);
		expect(result.manifest.model).toBe(source.snapshot.model.modelId);
		expect(result.manifest.exit_code).toBeUndefined(); // no synthetic successful process exit
		expect(result.manifest.metadata?.sharedSessionControl).toEqual({
			version: 1,
			revision: 0,
		});
		expect(
			result.manifest.metadata?.hubCapabilityOwnerClientId,
		).toBeUndefined();
		expect(result.manifest.metadata?.autoApproveTools).toBeUndefined();
		expect(result.manifest.metadata?.checkpoint).toEqual(
			source.snapshot.metadata?.checkpoint,
		);
		expect(f.input).toEqual(source);
		const again = await f.host.importSessionSnapshot(f.input);
		expect(again.messagesPath).toBe(result.messagesPath);
		expect(await readFile(result.messagesPath)).toEqual(transcript);
		expect(await f.host.readSessionMessages(source.snapshot.sessionId)).toEqual(
			source.snapshot.messages,
		);
	} finally {
		await f.close();
	}
});

it.each([
	"files",
	"sqlite",
] as const)("retains a failed %s commit, blocks runtime admission and completes only the exact staged import", async (kind) => {
	const f = await fixture(kind);
	try {
		const update = vi
			.spyOn(f.adapter, "updateSession")
			.mockRejectedValueOnce(new Error("fixture index failure"));
		await expect(f.host.importSessionSnapshot(f.input)).rejects.toThrow(
			"fixture index failure",
		);
		const staged = await f.host.getSession(f.input.snapshot.sessionId);
		expect(staged?.metadata?.[SNAPSHOT_IMPORT_METADATA_KEY]).toMatchObject({
			state: "staging",
		});
		const path = join(
			f.root,
			"sessions",
			f.input.snapshot.sessionId,
			`${f.input.snapshot.sessionId}.messages.json`,
		);
		const bytes = await readFile(path);
		await expect(
			f.host.resumeSession({
				config: { sessionId: f.input.snapshot.sessionId } as never,
				interactive: true,
			}),
		).rejects.toThrow("import is incomplete");
		await expect(
			f.host.deleteSession(f.input.snapshot.sessionId),
		).rejects.toThrow("import is incomplete");
		const changed = structuredClone(f.input);
		changed.snapshot.messages![0].content = "forged replacement";
		await expect(f.host.importSessionSnapshot(changed)).rejects.toThrow(
			"already exists",
		);
		expect(await readFile(path)).toEqual(bytes);
		update.mockRestore();
		await f.host.importSessionSnapshot(f.input);
		expect(
			(await f.host.getSession(f.input.snapshot.sessionId))?.metadata?.[
				SNAPSHOT_IMPORT_METADATA_KEY
			],
		).toMatchObject({ state: "complete" });
		expect(await readFile(path)).toEqual(bytes);
	} finally {
		await f.close();
	}
});

it("keeps externally modified partial artifacts instead of deleting or replacing them", async () => {
	const f = await fixture("files");
	try {
		vi.spyOn(f.adapter, "updateSession").mockRejectedValueOnce(
			new Error("fixture commit failure"),
		);
		await expect(f.host.importSessionSnapshot(f.input)).rejects.toThrow();
		const path = join(
			f.root,
			"sessions",
			f.input.snapshot.sessionId,
			`${f.input.snapshot.sessionId}.messages.json`,
		);
		await writeFile(path, "unrecognised local modification\n");
		await expect(f.host.importSessionSnapshot(f.input)).rejects.toThrow(
			"differs from verified source",
		);
		expect(await readFile(path, "utf8")).toBe(
			"unrecognised local modification\n",
		);
	} finally {
		await f.close();
	}
});
it("serializes identical concurrent imports without truncation", async () => {
	const f = await fixture("files");
	try {
		const results = await Promise.all([
			f.host.importSessionSnapshot(f.input),
			f.host.importSessionSnapshot(f.input),
		]);
		expect(results[0].messagesPath).toBe(results[1].messagesPath);
		expect(
			JSON.parse(await readFile(results[0].messagesPath, "utf8")).messages,
		).toEqual(f.input.snapshot.messages);
	} finally {
		await f.close();
	}
});
it("retains an archived idle state without inventing a live process or an exit on listing", async () => {
	const f = await fixture("files");
	try {
		f.input.snapshot.status = "idle";
		await f.host.importSessionSnapshot(f.input);
		const row = (await f.service.listSessions(10))[0];
		expect(row.status).toBe("idle");
		expect(row.pid).toBe(0);
		expect(row.exitCode ?? null).toBeNull();
		expect(row.metadata?.[SNAPSHOT_IMPORT_METADATA_KEY]).toMatchObject({
			state: "complete",
		});
	} finally {
		await f.close();
	}
});
it.each([
	"running",
	"pending",
] as const)("refuses an archived %s session before creating a target", async (status) => {
	const f = await fixture("files");
	try {
		f.input.snapshot.status = status;
		await expect(f.host.importSessionSnapshot(f.input)).rejects.toThrow(
			"active_session",
		);
		expect(await f.service.listSessions(10)).toEqual([]);
	} finally {
		await f.close();
	}
});
