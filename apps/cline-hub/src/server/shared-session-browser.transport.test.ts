/** Real Bun dashboard, browser-compatible WebSocket, SDK hub and client. Model execution is a fixture. */
import { spawn } from "node:child_process";
import { createPrivateKey } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { fileURLToPath } from "node:url";
import type { SendSessionInput, SessionMessageAuthor } from "@cline/core";
import { NodeHubClient, startHubWebSocketServer } from "@cline/core/hub";
import { expect, it, vi } from "vitest";

const BrowserSocket = globalThis.WebSocket as unknown as new (
	url: string,
	options: { headers: Record<string, string> },
) => WebSocket;

it.each([
	"http",
	"https",
] as const)("%s browser transport uses jimmi's credential for the existing session and survives that browser disconnecting during a turn", async (protocol) => {
	const root = await mkdtemp(join(tmpdir(), "cline-browser-actor-")),
		id = "same-existing-session";
	let certificate: Buffer | undefined;
	const certFile = join(root, "fixture-cert.pem"),
		keyFile = join(root, "fixture-key.pem");
	if (protocol === "https") {
		certificate = await readFile(
			new URL(
				"../../../../sdk/packages/core/src/hub/client/__fixtures__/localhost-cert.pem",
				import.meta.url,
			),
		);
		const key = createPrivateKey({
			key: await readFile(
				new URL(
					"../../../../sdk/packages/core/src/hub/client/__fixtures__/localhost-key.der",
					import.meta.url,
				),
			),
			format: "der",
			type: "pkcs8",
		}).export({ format: "pem", type: "pkcs8" });
		await writeFile(certFile, certificate, { mode: 0o600 });
		await writeFile(keyFile, key, { mode: 0o600 });
	}
	const row = {
		sessionId: id,
		source: "vscode",
		status: "idle",
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		interactive: true,
		provider: "fixture-provider",
		model: "fixture-model",
		cwd: root,
		workspaceRoot: root,
		metadata: {
			hubCapabilityOwnerClientId: "vscode",
			hubCapabilityOwnerActorId: "Friseer",
		},
	};
	const messages: Array<{
		role: string;
		content: string;
		metadata?: { author: SessionMessageAuthor };
	}> = [{ role: "user", content: "Original task remains" }];
	let gate: Promise<void> | undefined;
	const runtime = {
		subscribe: () => () => {},
		getSession: async () => row,
		listSessions: async () => [row],
		getAccumulatedUsage: async () => undefined,
		readSessionMessages: async () => messages,
		readLiveSessionMessages: async () => structuredClone(messages),
		pendingPrompts: { list: async () => [] },
		updateSession: async (
			_id: string,
			updates: { metadata: typeof row.metadata },
		) => {
			row.metadata = structuredClone(updates.metadata);
			return { updated: true };
		},
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
		abort: vi.fn(),
		stopSession: vi.fn(),
		dispose: async () => {},
	};
	const hub = await startHubWebSocketServer({
		host: "127.0.0.1",
		port: 0,
		workspaceRoot: root,
		actorTokens: {
			Friseer: "fixture-friseer-browser-transport",
			jimmi: "fixture-jimmi-browser-transport",
		},
		owner: {
			ownerId: "fixture-browser-transport",
			discoveryPath: join(root, "hub.json"),
		},
		sessionHost: runtime as never,
		runtimeHandlers: {
			startSession: vi.fn(),
			sendSession: vi.fn(),
			stopSession: vi.fn(),
			abortSession: vi.fn(),
		},
		taskOptions: {
			dbPath: join(root, "tasks.db"),
			globalSpecsDir: join(root, "specs"),
			watchFiles: false,
		},
		scheduleOptions: { dbPath: ":memory:" },
		eventLog: { dbPath: ":memory:" },
		runQueue: { dbPath: ":memory:" },
	});
	const reserve = createServer();
	await new Promise<void>((resolve, reject) =>
		reserve.once("error", reject).listen(0, "127.0.0.1", () => resolve()),
	);
	const port = (reserve.address() as { port: number }).port;
	await new Promise<void>((resolve) => reserve.close(() => resolve()));
	const appRoot = fileURLToPath(new URL("../", import.meta.url));
	const script =
		'const {startClineHubDashboardServer}=await import("./server.ts");const server=await startClineHubDashboardServer();process.on("SIGTERM",async()=>{await server.stop();process.exit(0)});process.stdout.write("DASHBOARD_READY\\n");';
	const child = spawn("bun", ["--eval", script], {
		cwd: appRoot,
		env: {
			...process.env,
			HOST: "127.0.0.1",
			CLINE_HUB_DASHBOARD_TLS_CERT_FILE: certificate ? certFile : undefined,
			CLINE_HUB_DASHBOARD_TLS_KEY_FILE: certificate ? keyFile : undefined,
			CLINE_HUB_DASHBOARD_PORT: String(port),
			PUBLIC_URL: `${protocol}://127.0.0.1:${port}`,
			ROOM_SECRET: "",
			WORKSPACE_ROOT: root,
			CLINE_SHARED_SESSION_HUB_ENDPOINT: hub.url,
			CLINE_SHARED_SESSION_HUB_TOKEN: hub.authToken,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "",
		stderr = "";
	child.stdout.on("data", (chunk) => {
		output += String(chunk);
	});
	child.stderr.on("data", (chunk) => {
		stderr += String(chunk);
	});
	const vscode = new NodeHubClient({
		url: hub.url,
		clientId: "vscode",
		authToken: "fixture-friseer-browser-transport",
		workspaceRoot: root,
	});
	let browser: WebSocket | undefined, resolveRun: (() => void) | undefined;
	let previousCas: string[] | undefined;
	try {
		await vi.waitFor(
			() => {
				expect(child.exitCode, stderr).toBeNull();
				expect(output).toContain("DASHBOARD_READY");
			},
			{ timeout: 15_000 },
		);
		await vscode.command("session.control.claim", { expectedRevision: 0 }, id);
		if (certificate) {
			// The Vitest worker uses Node's browser-compatible WebSocket, not Bun's
			// constructor. Trust the existing fixture CA only in this worker, and
			// restore it below; no disabled TLS validation or system trust change.
			previousCas = getCACertificates();
			setDefaultCACertificates([...previousCas, certificate.toString("utf8")]);
		}
		browser = new BrowserSocket(
			`${certificate ? "wss" : "ws"}://127.0.0.1:${port}/browser`,
			{
				headers: { Origin: `${protocol}://127.0.0.1:${port}` },
			},
		);
		const frames: Array<Record<string, unknown>> = [];
		browser.addEventListener("message", (event) =>
			frames.push(JSON.parse(String(event.data))),
		);
		await new Promise<void>((resolve, reject) => {
			browser!.addEventListener("open", () => resolve(), { once: true });
			browser!.addEventListener(
				"error",
				(event) =>
					reject(
						new Error(
							String(
								(event as ErrorEvent).message ??
									"Browser TLS/WebSocket connection failed",
							),
						),
					),
				{ once: true },
			);
		});
		const send = (value: unknown) => browser!.send(JSON.stringify(value));
		send({ type: "attachSession", sessionId: id });
		await vi.waitFor(
			() =>
				expect(frames).toContainEqual(
					expect.objectContaining({ type: "session_hydrated", sessionId: id }),
				),
			{ timeout: 5000 },
		);
		send({ type: "send", prompt: "unauthenticated write" });
		await vi.waitFor(() =>
			expect(frames).toContainEqual(
				expect.objectContaining({
					type: "error",
					text: expect.stringContaining("Authenticate your own actor"),
				}),
			),
		);
		expect(runtime.runTurn).not.toHaveBeenCalled();
		send({
			type: "authenticateActor",
			credential: "fixture-jimmi-browser-transport",
		});
		await vi.waitFor(
			() =>
				expect(frames).toContainEqual({
					type: "shared_actor",
					actorId: "jimmi",
				}),
			{ timeout: 5000 },
		);
		send({
			type: "sessionControl",
			action: "claim",
			sessionId: id,
			expectedRevision: 1,
		});
		await vi.waitFor(() =>
			expect(frames).toContainEqual(
				expect.objectContaining({
					type: "session_control",
					control: expect.objectContaining({
						revision: 2,
						writer: expect.objectContaining({ actorId: "jimmi" }),
					}),
				}),
			),
		);
		await expect(
			vscode.command("run.start", { prompt: "old writer" }, id),
		).rejects.toMatchObject({ code: "session_not_writer" });
		gate = new Promise<void>((resolve) => {
			resolveRun = resolve;
		});
		send({ type: "send", prompt: "jimmi continues original task" });
		await vi.waitFor(() => expect(runtime.runTurn).toHaveBeenCalledOnce());
		expect(messages.at(-1)?.metadata?.author).toMatchObject({
			actorId: "jimmi",
			source: "hub-authenticated",
		});
		const closed = new Promise<void>((resolve) =>
			browser!.addEventListener("close", () => resolve(), { once: true }),
		);
		browser.close();
		await closed;
		expect(row.status).toBe("running");
		expect(runtime.abort).not.toHaveBeenCalled();
		expect(runtime.stopSession).not.toHaveBeenCalled();
		resolveRun!();
		await vi.waitFor(() => expect(row.status).toBe("idle"));
		await vscode.command("session.control.claim", { expectedRevision: 2 }, id);
		expect(messages[0].content).toBe("Original task remains");
		expect(messages.at(-1)?.metadata?.author?.actorId).toBe("jimmi");
	} finally {
		if (previousCas) setDefaultCACertificates(previousCas);
		resolveRun?.();
		browser?.close();
		vscode.close();
		if (child.exitCode === null) {
			const exit = new Promise<void>((resolve) =>
				child.once("exit", () => resolve()),
			);
			child.kill("SIGTERM");
			const deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
			await exit;
			clearTimeout(deadline);
		}
		await hub.close();
		await rm(root, { recursive: true, force: true });
	}
}, 30_000);
