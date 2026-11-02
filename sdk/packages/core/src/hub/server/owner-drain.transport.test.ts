/** Real authenticated local HTTP/WS maintenance, fixture runtime only; no model. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { NodeHubClient } from "../client";
import { startHubWebSocketServer } from "./hub-websocket-server";

it.each([false, true])("keeps owner HTTP drain authenticated while actor authentication is %s", async (actors) => {
	const root = await mkdtemp(
		join(process.env.CLINE_DATA_DIR || tmpdir(), "owner-drain-"),
	);
	const runtime = {
		subscribe: () => () => {},
		listSessions: async () => [],
		getSession: async () => undefined,
		startSession: vi.fn(),
		dispose: async () => {},
	};
	const server = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		...(actors
			? {
					actorTokens: {
						Friseer: "fixture-personal-friseer",
						jimmi: "fixture-personal-jimmi",
					},
				}
			: {}),
		owner: {
			ownerId: "fixture-owner-drain",
			discoveryPath: join(root, "hub.json"),
		},
		sessionHost: runtime as never,
		runtimeHandlers: {
			startSession: vi.fn(),
			sendSession: vi.fn(),
			stopSession: vi.fn(),
			abortSession: vi.fn(),
		},
		scheduleOptions: { dbPath: ":memory:" },
		taskOptions: {
			dbPath: ":memory:",
			globalSpecsDir: join(root, "specs"),
			watchFiles: false,
		},
		eventLog: false,
		runQueue: false,
	});
	const clients: NodeHubClient[] = [];
	const url = new URL(server.url);
	url.protocol = "http:";
	url.pathname = "/drain";
	const post = (token?: string) =>
		fetch(url, {
			method: "POST",
			redirect: "error",
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		});
	try {
		expect((await post()).status).toBe(401);
		expect((await post("fixture-invalid-owner")).status).toBe(401);
		if (actors) {
			expect((await post("fixture-personal-friseer")).status).toBe(401);
			expect((await post("fixture-personal-jimmi")).status).toBe(401);
			for (const token of [server.authToken, "fixture-personal-friseer"]) {
				const client = new NodeHubClient({
					url: server.url,
					authToken: token,
					allowLocalHubRecovery: false,
				});
				clients.push(client);
				await expect(client.command("hub.drain", {})).rejects.toBeDefined();
			}
		}
		const accepted = await post(server.authToken);
		expect(accepted.status).toBe(200);
		expect(await accepted.json()).toMatchObject({
			draining: true,
			idle: true,
			activeRpcTurns: 0,
			pendingRuns: 0,
		});
		const health = new URL(url);
		health.pathname = "/health";
		expect(await (await fetch(health)).json()).toMatchObject({
			draining: true,
		});
		expect(runtime.startSession).not.toHaveBeenCalled();
		url.search = "?off";
		const reopened = await post(server.authToken);
		expect(reopened.status).toBe(200);
		expect(await reopened.json()).toMatchObject({ draining: false });
	} finally {
		for (const client of clients) client.close();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
