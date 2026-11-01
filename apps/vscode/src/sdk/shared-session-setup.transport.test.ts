/** Real loopback authentication; no model, productive store or session execution. */
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startHubWebSocketServer } from "@cline/core/hub"
import { expect, it, vi } from "vitest"
import { verifySharedSessionHubActor } from "./shared-session-hub"

it("confirms Friseer and jimmi through real registration and rejects admin-only and invalid credentials", async () => {
	const root = await mkdtemp(join(process.env.CLINE_DIR ?? tmpdir(), "shared-runtime-setup-"))
	const runtime = {
		subscribe: () => () => {},
		listSessions: async () => [],
		getSession: async () => undefined,
		startSession: vi.fn(),
		runTurn: vi.fn(),
		stopSession: vi.fn(),
		abort: vi.fn(),
		dispose: async () => {},
	}
	const hub = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		actorTokens: { Friseer: "fixture-personal-friseer-setup", jimmi: "fixture-personal-jimmi-setup" },
		owner: { ownerId: "fixture-vscode-setup", discoveryPath: join(root, "hub.json") },
		sessionHost: runtime as never,
		runtimeHandlers: { startSession: vi.fn(), sendSession: vi.fn(), stopSession: vi.fn(), abortSession: vi.fn() },
		scheduleOptions: { dbPath: ":memory:" },
		taskOptions: { dbPath: join(root, "tasks.db"), globalSpecsDir: join(root, "specs"), watchFiles: false },
		eventLog: { dbPath: ":memory:" },
		runQueue: { dbPath: ":memory:" },
	})
	try {
		expect(await verifySharedSessionHubActor({ endpoint: hub.url, authToken: "fixture-personal-friseer-setup" })).toBe(
			"Friseer",
		)
		expect(await verifySharedSessionHubActor({ endpoint: hub.url, authToken: "fixture-personal-jimmi-setup" })).toBe("jimmi")
		await expect(verifySharedSessionHubActor({ endpoint: hub.url, authToken: hub.authToken })).rejects.toThrow(
			"persönliche Benutzeridentität",
		)
		await expect(verifySharedSessionHubActor({ endpoint: hub.url, authToken: "fixture-wrong-personal" })).rejects.toThrow(
			"nicht bestätigt",
		)
		expect(runtime.startSession).not.toHaveBeenCalled()
		expect(runtime.runTurn).not.toHaveBeenCalled()
		expect(runtime.stopSession).not.toHaveBeenCalled()
		expect(runtime.abort).not.toHaveBeenCalled()
	} finally {
		await hub.close()
	}
})
