/** Real persistence backends, private fixture files; no productive data. */
import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { SqliteSessionStore } from "../../services/storage/sqlite-session-store";
import { FileSessionService } from "./file-session-service";
import { CoreSessionService } from "./session-service";

const input = {
	sessionId: "same-session",
	source: "vscode" as const,
	pid: process.pid,
	interactive: true,
	provider: "configured-provider",
	model: "interchangeable-model",
	cwd: "/fixture/project",
	workspaceRoot: "/fixture/project",
	enableTools: false,
	enableSpawn: false,
	enableTeams: false,
	status: "completed" as const,
	metadata: { title: "original" },
};
async function fixture(kind: "files" | "sqlite") {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "session-create-"),
	);
	const sessionsDir = join(root, "sessions");
	const store =
		kind === "sqlite"
			? new SqliteSessionStore({ sessionsDir: join(root, "db") })
			: undefined;
	const service = store
		? new CoreSessionService(store, { sessionArtifactsDir: sessionsDir })
		: new FileSessionService(sessionsDir);
	return {
		root,
		sessionsDir,
		service,
		close: async () => {
			store?.close();
			await rm(root, { recursive: true, force: true });
		},
	};
}
it.each([
	"files",
	"sqlite",
] as const)("never replaces an existing %s row, transcript or manifest, including default or requested replacement", async (kind) => {
	const f = await fixture(kind);
	try {
		const original = await f.service.createRootSessionWithArtifacts(input);
		await f.service.persistSessionMessages(input.sessionId, [
			{
				role: "user",
				content: "Original accepted order",
				metadata: { author: { actorId: "Friseer" } },
			},
		] as never);
		const row = (await f.service.listSessions(10)).find(
			(row) => row.sessionId === input.sessionId,
		);
		const before = await Promise.all([
			readFile(original.messagesPath),
			readFile(original.manifestPath),
		]);
		for (const ifAbsent of [true, undefined, false])
			await expect(
				f.service.createRootSessionWithArtifacts({
					...input,
					metadata: { title: "replacement" },
					ifAbsent,
				}),
			).rejects.toThrow();
		expect(
			(await f.service.listSessions(10)).find(
				(row) => row.sessionId === input.sessionId,
			),
		).toEqual(row);
		expect(
			await Promise.all([
				readFile(original.messagesPath),
				readFile(original.manifestPath),
			]),
		).toEqual(before);
	} finally {
		await f.close();
	}
});
it.each([
	["files", true],
	["sqlite", true],
	["files", undefined],
	["sqlite", undefined],
] as const)("admits only one concurrent %s creator for the same ID (ifAbsent=%s)", async (kind, ifAbsent) => {
	const f = await fixture(kind);
	try {
		const results = await Promise.allSettled([
			f.service.createRootSessionWithArtifacts({ ...input, ifAbsent }),
			f.service.createRootSessionWithArtifacts({ ...input, ifAbsent }),
		]);
		expect(
			results.filter((value) => value.status === "fulfilled"),
		).toHaveLength(1);
		expect(results.filter((value) => value.status === "rejected")).toHaveLength(
			1,
		);
	} finally {
		await f.close();
	}
});
it("does not adopt or alter an unknown artifact directory", async () => {
	const f = await fixture("files");
	try {
		const dir = join(f.sessionsDir, input.sessionId);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "user-artifact.txt"), "retain exactly");
		await expect(
			f.service.createRootSessionWithArtifacts({ ...input, ifAbsent: true }),
		).rejects.toThrow();
		expect(await readFile(join(dir, "user-artifact.txt"), "utf8")).toBe(
			"retain exactly",
		);
		expect(
			(await f.service.listSessions(10)).find(
				(row) => row.sessionId === input.sessionId,
			),
		).toBeUndefined();
	} finally {
		await f.close();
	}
});
it("does not replace an unreadable existing file index while importing a new ID", async () => {
	const f = await fixture("files");
	try {
		await mkdir(f.sessionsDir, { recursive: true });
		const index = join(f.sessionsDir, "sessions.index.json");
		await writeFile(index, "unreadable-original-index\n");
		await expect(
			f.service.createRootSessionWithArtifacts({ ...input, ifAbsent: true }),
		).rejects.toThrow();
		expect(await readFile(index, "utf8")).toBe("unreadable-original-index\n");
	} finally {
		await f.close();
	}
});

it.each([
	"files",
	"sqlite",
] as const)("does not replace an existing %s row even when its artifact directory is absent", async (kind) => {
	const f = await fixture(kind);
	try {
		const original = await f.service.createRootSessionWithArtifacts(input);
		const row = (await f.service.listSessions(10)).find(
			(value) => value.sessionId === input.sessionId,
		);
		const retained = join(f.root, "retained-original-artifacts");
		await rename(join(f.sessionsDir, input.sessionId), retained);
		const bytes = await readFile(join(retained, `${input.sessionId}.json`));
		await expect(
			f.service.createRootSessionWithArtifacts({ ...input, ifAbsent: true }),
		).rejects.toThrow("already exists");
		expect(
			(await f.service.listSessions(10)).find(
				(value) => value.sessionId === input.sessionId,
			),
		).toEqual(row);
		expect(await readFile(join(retained, `${input.sessionId}.json`))).toEqual(
			bytes,
		);
		await expect(readFile(original.manifestPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	} finally {
		await f.close();
	}
});
it("does not follow an existing artifact symlink or accept a path outside the target root", async () => {
	const f = await fixture("files");
	try {
		const target = join(f.root, "retained-target");
		await mkdir(target);
		await writeFile(join(target, "marker.txt"), "retained");
		await mkdir(f.sessionsDir);
		await symlink(target, join(f.sessionsDir, input.sessionId), "dir");
		await expect(
			f.service.createRootSessionWithArtifacts({ ...input, ifAbsent: true }),
		).rejects.toThrow();
		for (const sessionId of [
			"../retained-target",
			"a/b",
			"..",
			"",
			" same-session",
		])
			await expect(
				f.service.createRootSessionWithArtifacts({
					...input,
					sessionId,
					ifAbsent: true,
				}),
			).rejects.toThrow("Unsafe session ID");
		expect(await readFile(join(target, "marker.txt"), "utf8")).toBe("retained");
	} finally {
		await f.close();
	}
});

it("protects default creation from artifact symlinks and relative path IDs", async () => {
	const f = await fixture("files");
	try {
		const target = join(f.root, "retained-target");
		await mkdir(target);
		await writeFile(join(target, "marker.txt"), "retained");
		await mkdir(f.sessionsDir);
		await symlink(target, join(f.sessionsDir, input.sessionId), "dir");
		await expect(
			f.service.createRootSessionWithArtifacts(input),
		).rejects.toThrow();
		for (const sessionId of [
			"../retained-target",
			"a/b",
			"..",
			" same-session",
		])
			await expect(
				f.service.createRootSessionWithArtifacts({ ...input, sessionId }),
			).rejects.toThrow("Unsafe");
		expect(await readFile(join(target, "marker.txt"), "utf8")).toBe("retained");
		expect(await f.service.listSessions(10)).toEqual([]);
	} finally {
		await f.close();
	}
});
