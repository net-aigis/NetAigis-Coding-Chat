/** Real loopback WebSockets/handlers. The executing runtime and credentials are fixtures. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { SendSessionInput } from "../../runtime/host/runtime-host";
import type { SessionMessageAuthor } from "../../types/sessions";
import { NodeHubClient } from "../client";
import { startHubWebSocketServer } from "./hub-websocket-server";

it("authenticates Friseer/jimmi separately, hands one history both ways, and fences old/disconnected writers", async () => {
	const root = await mkdtemp(join(tmpdir(), "cline-actor-transport-"));
	const id = "one-existing-session";
	const row = {
		sessionId: id,
		source: "vscode",
		status: "idle",
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		interactive: true,
		provider: "fixture-local-provider",
		model: "fixture-local-model",
		cwd: root,
		workspaceRoot: root,
		metadata: {
			hubCapabilityOwnerClientId: "vscode",
			hubCapabilityOwnerActorId: "Friseer",
		} as Record<string, unknown>,
	};
	const messages: Array<{
		role: string;
		content: unknown;
		metadata?: { author: SessionMessageAuthor | { actorId: string } };
	}> = [
		{
			role: "user",
			content: "original accepted task",
			metadata: { author: { actorId: "Friseer" } },
		},
	];
	let gate: Promise<void> | undefined;
	const runtime = {
		subscribe: () => () => {},
		getSession: async (sessionId: string) =>
			sessionId === id ? row : undefined,
		listSessions: async () => [row],
		getAccumulatedUsage: async () => undefined,
		readSessionMessages: async () => structuredClone(messages),
		readLiveSessionMessages: async () => structuredClone(messages),
		pendingPrompts: { list: async () => [] },
		updateSession: vi.fn(
			async (
				_sessionId: string,
				updates: { metadata: Record<string, unknown> },
			) => {
				row.metadata = structuredClone(updates.metadata);
				return { updated: true };
			},
		),
		runTurn: vi.fn(async (input: SendSessionInput) => {
			row.status = "running";
			messages.push({
				role: "user",
				content: input.prompt,
				metadata: { author: structuredClone(input.author!) },
			});
			await gate;
			row.status = "idle";
			return undefined;
		}),
		startSession: vi.fn(),
		stopSession: vi.fn(),
		abort: vi.fn(),
		dispose: async () => {},
	};
	const server = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		actorTokens: {
			Friseer: "fixture-friseer-token",
			jimmi: "fixture-jimmi-token",
		},
		owner: {
			ownerId: "fixture-authenticated-handover",
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
	const clients: NodeHubClient[] = [];
	function peer(clientId: string, authToken: string) {
		const c = new NodeHubClient({
			url: server.url,
			clientId,
			authToken,
			workspaceRoot: root,
		});
		clients.push(c);
		return c;
	}
	const friseer = peer("vscode", "fixture-friseer-token"),
		jimmi = peer("android", "fixture-jimmi-token"),
		observer = peer("observer", server.authToken);
	try {
		const invalid = peer("invalid", "fixture-incorrect-token");
		await expect(invalid.command("hub.status")).rejects.toThrow();
		const OriginSocket = globalThis.WebSocket as unknown as new (
			url: string,
			options: { headers: Record<string, string> },
		) => WebSocket;
		await expect(
			new Promise<void>((resolve, reject) => {
				const probe = new OriginSocket(server.url, {
					headers: { Origin: "http://localhost" },
				});
				probe.addEventListener(
					"open",
					() => {
						probe.close();
						resolve();
					},
					{ once: true },
				);
				probe.addEventListener(
					"error",
					() => reject(new Error("Unauthenticated origin refused")),
					{ once: true },
				);
			}),
		).rejects.toThrow("Unauthenticated origin refused");
		await expect(
			observer.command("session.control.claim", { expectedRevision: 0 }, id),
		).rejects.toMatchObject({ code: "actor_authentication_required" });
		await expect(
			friseer.command("session.control.claim", { expectedRevision: 0 }, id),
		).resolves.toMatchObject({
			payload: {
				sessionId: id,
				control: { revision: 1, writer: { actorId: "Friseer" } },
			},
		});
		await expect(
			friseer.command("session.control.claim", { expectedRevision: 1 }, id),
		).resolves.toMatchObject({ payload: { control: { revision: 1 } } });
		await expect(
			jimmi.command(
				"run.start",
				{
					prompt: "forged",
					author: { actorId: "Friseer" },
					controlRevision: 1,
				},
				id,
			),
		).rejects.toMatchObject({ code: "session_not_writer" });
		await friseer.command(
			"run.start",
			{ prompt: "Friseer correction", author: { actorId: "jimmi" } },
			id,
		);
		expect(messages.at(-1)?.metadata?.author).toMatchObject({
			actorId: "Friseer",
			clientId: "vscode",
			source: "hub-authenticated",
		});
		const old = structuredClone(messages);
		expect(friseer.getAuthenticatedActorId()).toBe("Friseer");
		expect(jimmi.getAuthenticatedActorId()).toBe("jimmi");
		expect(observer.getAuthenticatedActorId()).toBeUndefined();
		await jimmi.command("session.control.claim", { expectedRevision: 1 }, id);
		await expect(
			friseer.command("run.start", { prompt: "stale" }, id),
		).rejects.toMatchObject({ code: "session_not_writer" });
		await jimmi.command("run.start", { prompt: "jimmi correction" }, id);
		expect(messages.slice(0, -1)).toEqual(old);
		expect(messages.at(-1)?.metadata?.author).toMatchObject({
			actorId: "jimmi",
			clientId: "android",
		});
		let resolve!: () => void;
		gate = new Promise<void>((r) => {
			resolve = r;
		});
		const running = jimmi
			.command("run.start", { prompt: "running task" }, id)
			.catch(() => undefined);
		await vi.waitFor(() => expect(runtime.runTurn).toHaveBeenCalledTimes(3));
		await jimmi.dispose();
		const reconnected = peer("android", "fixture-jimmi-token");
		await reconnected.command(
			"session.control.claim",
			{ expectedRevision: 2 },
			id,
		);
		expect(reconnected.getAuthenticatedConnectionId()).toBeTruthy();
		expect(row.status).toBe("running");
		expect(runtime.runTurn).toHaveBeenCalledTimes(3);
		expect(runtime.abort).not.toHaveBeenCalled();
		await expect(
			friseer.command("session.control.claim", { expectedRevision: 3 }, id),
		).rejects.toMatchObject({ code: "session_not_quiescent" });
		resolve();
		await running;
		await vi.waitFor(() => expect(row.status).toBe("idle"));
		gate = undefined;
		await friseer.command("session.control.claim", { expectedRevision: 3 }, id);
		await friseer.dispose();
		const replacement = peer("vscode", "fixture-friseer-token");
		await expect(
			replacement.command(
				"run.start",
				{ prompt: "copied client id", controlRevision: 4 },
				id,
			),
		).rejects.toMatchObject({ code: "session_not_writer" });
		await replacement.command(
			"session.control.claim",
			{ expectedRevision: 4 },
			id,
		);
		await replacement.command(
			"run.start",
			{ prompt: "explicit reconnect" },
			id,
		);
		const impersonator = peer("vscode", "fixture-jimmi-token");
		await expect(impersonator.command("hub.status")).rejects.toMatchObject({
			code: "client_actor_mismatch",
		});
		for (const client of [reconnected, replacement])
			expect(
				(await client.command("session.messages", { live: true }, id)).payload,
			).toMatchObject({ sessionId: id, view: "live", messages });
		expect(runtime.startSession).not.toHaveBeenCalled();
		expect(runtime.abort).not.toHaveBeenCalled();
		expect(runtime.stopSession).not.toHaveBeenCalled();
	} finally {
		for (const client of clients) client.close();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
}, 20_000);
