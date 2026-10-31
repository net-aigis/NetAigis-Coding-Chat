/** Real authenticated WebSockets and hub handlers; the executing runtime is a fixture. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HubReplyEnvelope, HubTransportFrame } from "@cline/shared";
import { expect, it, vi } from "vitest";
import type { CoreSessionEvent } from "../../types/events";
import { startHubWebSocketServer } from "./hub-websocket-server";

it("two browser-compatible clients observe one running session and survive the other client disconnecting", async () => {
	const root = await mkdtemp(join(tmpdir(), "cline-shared-session-"));
	const sessionId = "existing-live-session";
	const messages = [
		{
			role: "user",
			content: "original order",
			metadata: { author: "Friseer" },
		},
		{
			role: "user",
			content: "accepted correction",
			metadata: { author: "jimmi" },
		},
		{
			role: "tool",
			content: JSON.stringify({
				execution: { state: "unknown", observationFailed: true },
			}),
		},
	];
	const record = {
		sessionId,
		source: "vscode",
		status: "running",
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		interactive: true,
		provider: "fixture-local-provider",
		model: "fixture-125b",
		cwd: root,
		workspaceRoot: root,
	};
	const listeners = new Set<(event: CoreSessionEvent) => void>();
	const runtime = {
		subscribe: (listener: (event: CoreSessionEvent) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSession: async (id: string) => (id === sessionId ? record : undefined),
		listSessions: async () => [record],
		getAccumulatedUsage: async () => undefined,
		readSessionMessages: vi.fn(async () => messages.slice(0, 1)),
		readLiveSessionMessages: vi.fn(async () => structuredClone(messages)),
		startSession: vi.fn(),
		stopSession: vi.fn(),
		abort: vi.fn(),
		dispose: vi.fn(async () => {}),
	};
	const server = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		owner: {
			ownerId: "fixture-shared-session",
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
			dbPath: join(root, "tasks.db"),
			globalSpecsDir: join(root, "specs"),
			watchFiles: false,
		},
		eventLog: { dbPath: ":memory:" },
		runQueue: { dbPath: ":memory:" },
	});
	const sockets: WebSocket[] = [];
	async function peer(clientId: string) {
		const socket = new WebSocket(server.url, [
			`cline-hub-auth.${server.authToken}`,
		]);
		sockets.push(socket);
		const pending = new Map<string, (reply: HubReplyEnvelope) => void>();
		const events: HubTransportFrame[] = [];
		let next = 0;
		socket.addEventListener("message", (event) => {
			const frame = JSON.parse(String(event.data)) as HubTransportFrame;
			if (frame.kind === "reply") {
				const requestId = frame.envelope.requestId;
				if (requestId) pending.get(requestId)?.(frame.envelope);
			} else events.push(frame);
		});
		await new Promise<void>((resolve, reject) => {
			socket.addEventListener("open", () => resolve(), { once: true });
			socket.addEventListener(
				"error",
				() => reject(new Error("fixture socket connection failed")),
				{ once: true },
			);
		});
		function command(
			command: string,
			payload: Record<string, unknown> = {},
			target?: string,
		) {
			const requestId = `${clientId}-${++next}`;
			const reply = new Promise<HubReplyEnvelope>((resolve) =>
				pending.set(requestId, resolve),
			);
			socket.send(
				JSON.stringify({
					kind: "command",
					envelope: {
						version: "v1",
						requestId,
						clientId,
						command,
						payload,
						...(target ? { sessionId: target } : {}),
					},
				}),
			);
			return reply.finally(() => pending.delete(requestId));
		}
		expect(
			await command("client.register", {
				clientId,
				clientType: "fixture-browser",
				displayName: clientId,
			}),
		).toMatchObject({ ok: true });
		expect(
			await command("session.attach", { sessionId }, sessionId),
		).toMatchObject({ ok: true });
		socket.send(
			JSON.stringify({ kind: "stream.subscribe", clientId, sessionId }),
		);
		await command("session.get", { sessionId }, sessionId);
		return { socket, events, command };
	}
	try {
		const vscode = await peer("vscode-client"),
			android = await peer("android-browser-client");
		for (const client of [vscode, android]) {
			const reply = await client.command(
				"session.messages",
				{ sessionId, live: true },
				sessionId,
			);
			expect(reply).toMatchObject({
				ok: true,
				payload: { sessionId, view: "live", messages },
			});
		}
		for (const listener of listeners)
			listener({ type: "status", payload: { sessionId, status: "running" } });
		await vi.waitFor(() => {
			for (const client of [vscode, android])
				expect(client.events).toContainEqual(
					expect.objectContaining({
						kind: "event",
						envelope: expect.objectContaining({
							event: "session.updated",
							sessionId,
						}),
					}),
				);
		});
		const disconnected = new Promise<void>((resolve) =>
			vscode.socket.addEventListener("close", () => resolve(), { once: true }),
		);
		vscode.socket.close();
		await disconnected;
		expect(
			await android.command(
				"session.messages",
				{ sessionId, live: true },
				sessionId,
			),
		).toMatchObject({ ok: true, payload: { messages } });
		expect(runtime.startSession).not.toHaveBeenCalled();
		expect(runtime.stopSession).not.toHaveBeenCalled();
		expect(runtime.abort).not.toHaveBeenCalled();
		expect(record.status).toBe("running");
		// The independent history search index may read persisted messages;
		// the three client replies above must all use the confirmed live path.
		expect(runtime.readLiveSessionMessages).toHaveBeenCalledTimes(3);
	} finally {
		for (const socket of sockets) socket.close();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
