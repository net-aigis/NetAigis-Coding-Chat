/** Missing OS owner is observable; its exit code and child outcomes are not. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { LocalRuntimeHost } from "../../runtime/host/local-runtime-host";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "./file-session-service";
import { CoreSessionService } from "./session-service";

it.each([
	"files",
	"sqlite",
] as const)("does not invent an exit code for an unavailable %s runtime owner or resume its unconfirmed work", async (kind) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "owner-observation-"),
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
	const createAgent = vi.fn();
	const host = new LocalRuntimeHost({
		sessionService: service,
		distinctId: "fixture-owner-observation",
		createAgent,
	});
	try {
		const artifact = await service.createRootSessionWithArtifacts({
			sessionId: "interrupted",
			source: "vscode",
			pid: 999_999_999,
			interactive: true,
			provider: "configured-provider",
			model: "interchangeable-model",
			cwd: root,
			workspaceRoot: root,
			enableTools: false,
			enableSpawn: false,
			enableTeams: false,
		});
		await service.persistSessionMessages("interrupted", [
			{
				role: "user",
				content: "Keep original task and received partial output",
				metadata: { author: { actorId: "Friseer" } },
			},
		] as never);
		const before = await readFile(artifact.messagesPath);
		expect(await service.reconcileDeadSessions()).toBe(1);
		const row = (await service.listSessions(10))[0];
		expect(row.status).toBe("failed");
		expect(row.exitCode ?? null).toBeNull();
		expect(row.metadata?.runtimeOwnerObservation).toMatchObject({
			version: 1,
			state: "unknown",
			pid: 999_999_999,
			exitConfirmed: false,
		});
		const manifest = service.readSessionManifest("interrupted")!;
		expect(manifest.exit_code ?? null).toBeNull();
		await expect(
			host.resumeSession({
				config: { sessionId: "interrupted" } as never,
				interactive: true,
			}),
		).rejects.toThrow("Runtime owner exit is unconfirmed");
		expect(createAgent).not.toHaveBeenCalled();
		expect(await readFile(artifact.messagesPath)).toEqual(before);
	} finally {
		await host.dispose();
		db?.close();
		await rm(root, { recursive: true, force: true });
	}
});
