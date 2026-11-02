import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { toSessionRecord } from "../../services/session-data";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "../../session/services/file-session-service";
import { CoreSessionService } from "../../session/services/session-service";
import { SessionSource } from "../../types/common";
import { LocalRuntimeHost } from "./local-runtime-host";

it("lists the existing file-backed history through the SQLite owner without rewriting or reauthoring it", async () => {
	const root = await mkdtemp(join(tmpdir(), "file-history-handoff-"));
	const sessions = join(root, "sessions");
	const store = new SqliteSessionStore({ sessionsDir: join(root, "db") });
	const service = new CoreSessionService(store, {
		sessionArtifactsDir: sessions,
	});
	const host = new LocalRuntimeHost({ sessionService: service });
	try {
		const file = new FileSessionService(sessions);
		const artifacts = await file.createRootSessionWithArtifacts({
			sessionId: "canonical-existing",
			source: SessionSource.VSCODE,
			pid: process.pid,
			status: "idle",
			interactive: true,
			provider: "existing-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: true,
			enableSpawn: false,
			enableTeams: false,
		});
		await file.persistSessionMessages("canonical-existing", [
			{
				role: "user",
				content: "Original order",
				metadata: { author: { actorId: "Friseer" } },
			},
			{
				role: "user",
				content: "Correction",
				metadata: { author: { actorId: "jimmi" } },
			},
		]);
		const before = await readFile(artifacts.messagesPath);
		const manifest = await readFile(artifacts.manifestPath);
		const index = await readFile(join(sessions, "sessions.index.json"));
		for (const rootOnly of [false, true]) {
			const listed = await host.listSessions(10, { rootOnly });
			expect(listed).toEqual([
				expect.objectContaining({
					sessionId: "canonical-existing",
					status: "idle",
					pid: process.pid,
				}),
			]);
		}
		expect(await host.readSessionMessages("canonical-existing")).toEqual(
			JSON.parse(before.toString()).messages,
		);
		expect(await readFile(artifacts.messagesPath)).toEqual(before);
		expect(await readFile(artifacts.manifestPath)).toEqual(manifest);
		expect(await readFile(join(sessions, "sessions.index.json"))).toEqual(
			index,
		);
		expect(store.queryAll("SELECT session_id FROM sessions")).toEqual([]);
		expect(await host.listSessions(0)).toEqual([]);
		// Once the new owner has an index row, the obsolete file index must not
		// replace its confirmed state, even in a root-only listing.
		const [old] = await file.listPersistedSessions(10);
		store.create({
			...toSessionRecord(old),
			status: "failed",
			pid: 456,
			metadata: { owner: "sqlite" },
		});
		expect(await host.listSessions(10, { rootOnly: true })).toEqual([
			expect.objectContaining({
				sessionId: "canonical-existing",
				status: "failed",
				pid: 456,
				metadata: { owner: "sqlite" },
			}),
		]);
	} finally {
		await host.dispose();
		store.close();
		await rm(root, { recursive: true, force: true });
	}
});

it("atomically adopts a missing SQLite row on the first real running transition and preserves canonical messages", async () => {
	const root = await mkdtemp(join(tmpdir(), "file-owner-adoption-"));
	const sessions = join(root, "sessions");
	const store = new SqliteSessionStore({ sessionsDir: join(root, "db") });
	try {
		const file = new FileSessionService(sessions);
		const artifacts = await file.createRootSessionWithArtifacts({
			sessionId: "existing-idle",
			source: SessionSource.VSCODE,
			pid: 123,
			status: "idle",
			interactive: true,
			provider: "existing-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			metadata: { checkpoint: "retained", originalOrder: "retained" },
		});
		await file.persistSessionMessages("existing-idle", [
			{
				role: "user",
				content: "Retain verbatim",
				metadata: { author: { actorId: "jimmi" } },
			},
		]);
		const before = await readFile(artifacts.messagesPath);
		const service = new CoreSessionService(store, {
			sessionArtifactsDir: sessions,
		});
		expect(
			await service.updateSessionStatus(
				"existing-idle",
				"running",
				null,
				process.pid,
			),
		).toMatchObject({ updated: true });
		const row = store.queryOne<{
			pid: number;
			status: string;
			metadata: string;
		}>(
			"SELECT pid, status, metadata_json AS metadata FROM sessions WHERE session_id = ?",
			["existing-idle"],
		);
		expect(row).toMatchObject({ pid: process.pid, status: "running" });
		if (!row) throw new Error("Adopted row is missing");
		expect(JSON.parse(row.metadata)).toMatchObject({
			checkpoint: "retained",
			originalOrder: "retained",
		});
		expect(await readFile(artifacts.messagesPath)).toEqual(before);
		// The owning host writes its acknowledged manifest after this atomic row
		// transition. The persistence call itself never edits old artifacts.
		expect(service.readSessionManifest("existing-idle")).toMatchObject({
			pid: 123,
			status: "idle",
		});
	} finally {
		store.close();
		await rm(root, { recursive: true, force: true });
	}
});

it("does not reconcile a file-only running owner during browsing or replace a concurrent SQLite adoption", async () => {
	const root = await mkdtemp(join(tmpdir(), "file-adoption-race-"));
	const sessions = join(root, "sessions");
	const store = new SqliteSessionStore({ sessionsDir: join(root, "db") });
	const service = new CoreSessionService(store, {
		sessionArtifactsDir: sessions,
	});
	const host = new LocalRuntimeHost({ sessionService: service });
	try {
		const file = new FileSessionService(sessions);
		const artifacts = await file.createRootSessionWithArtifacts({
			sessionId: "unconfirmed-running",
			source: SessionSource.VSCODE,
			pid: 2147483647,
			status: "running",
			interactive: true,
			provider: "existing-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
			metadata: { originalOrder: "retained" },
		});
		const before = await readFile(artifacts.manifestPath);
		expect(await host.listSessions(10)).toEqual([
			expect.objectContaining({
				sessionId: "unconfirmed-running",
				status: "running",
				pid: 2147483647,
				exitCode: null,
			}),
		]);
		expect(await readFile(artifacts.manifestPath)).toEqual(before);
		const [old] = await file.listPersistedSessions(10);
		const run = store.run.bind(store);
		let injected = false;
		vi.spyOn(store, "run").mockImplementation((sql, params) => {
			if (!injected && sql.startsWith("INSERT OR IGNORE INTO sessions")) {
				injected = true;
				store.create({
					...toSessionRecord(old),
					status: "idle",
					metadata: { concurrentOwner: "retained" },
				});
			}
			return run(sql, params);
		});
		await service.persistSessionMessages("unconfirmed-running", [
			{ role: "user", content: "Existing API write" },
		]);
		expect(injected).toBe(true);
		expect(
			store.queryOne(
				"SELECT metadata_json FROM sessions WHERE session_id = ?",
				["unconfirmed-running"],
			),
		).toEqual({
			metadata_json: JSON.stringify({ concurrentOwner: "retained" }),
		});
	} finally {
		vi.restoreAllMocks();
		await host.dispose();
		store.close();
		await rm(root, { recursive: true, force: true });
	}
});
