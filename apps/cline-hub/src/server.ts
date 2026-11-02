import { CORE_BUILD_VERSION } from "@cline/core";
import { isNonLocalBindHost } from "./options";
import {
	handleToolApprovalResponse,
	rejectOrphanedApprovals,
} from "./server/approvals";
import { isAuthorizedBrowserToDesktopRequest } from "./server/browser-auth";
import {
	BrowserActorSessions,
	readActorCredential,
} from "./server/browser-actor-sessions";
import {
	browserConfig,
	host,
	inviteUrl,
	options,
	port,
	publicUrl,
	roomSecret,
	webviewDistDir,
} from "./server/deps";
import { handleDesktopCommand } from "./server/desktop-commands";
import {
	createJsonResponse,
	isWebviewRoute,
	WebviewAssets,
} from "./server/http";
import {
	attachHub,
	detachHub,
	restartHub,
	syncHubClientsAndSessions,
	syncHubHealth,
} from "./server/hub";
import { fetchMarketplaceCatalog } from "./server/marketplace";
import {
	loadModels,
	runProviderOAuthLogin,
	saveProviderSettings,
	sendProviderCatalog,
} from "./server/providers";
import { handleBrowserRecall } from "./server/recall-sessions";
import {
	abortPeerTurn,
	deleteSession,
	forkPeerSession,
	initializePeer,
	resetPeer,
	restorePeerSession,
	selectSession,
	sendMessage,
} from "./server/sessions";
import {
	assertSharedBrowserFrame,
	authenticateBrowserActor,
	disposeBrowserActor,
	runtimeForPeer,
	updateBrowserSessionControl,
	verifyBrowserActorCredential,
} from "./server/shared-session-access";
import { HubContext } from "./server/state";
import { broadcastHubState, hubStatusPayload } from "./server/state-payloads";
import { loadDashboardTls } from "./server/tls";
import type { BrowserFrame, BrowserPeer } from "./server/types";

export interface ClineHubDashboardServer {
	listenUrl: string;
	publicUrl: string;
	inviteUrl: string;
	bindHost: string;
	inviteRequired: boolean;
	hubUrl: string | undefined;
	stop: () => Promise<void>;
}

const PUBLIC_BROWSER_PATHS = new Set([
	"/version",
	"/health",
	"/config.json",
	"/api/marketplace/catalog",
	"/icon.png",
	"/icon.svg",
	"/icon.ico",
	"/32x32.png",
	"/cline-logo-filled.svg",
	"/favicon.svg",
]);

function isPublicStaticAssetPath(pathname: string): boolean {
	return pathname.startsWith("/assets/") || PUBLIC_BROWSER_PATHS.has(pathname);
}

function isPublicBrowserRoute(_req: Request, url: URL): boolean {
	return isWebviewRoute(url.pathname) || isPublicStaticAssetPath(url.pathname);
}

export async function startClineHubDashboardServer(): Promise<ClineHubDashboardServer> {
	const ctx = new HubContext();
	const assets = new WebviewAssets(webviewDistDir);
	const syncClientsAndSessions = () => syncHubClientsAndSessions(ctx);
	let stopped = false;
	const tls = await loadDashboardTls(options.tls);
	const browserSessions = new BrowserActorSessions();

	await attachHub(ctx);
	const healthInterval = setInterval(() => {
		void (async () => {
			await syncHubHealth(ctx);
			broadcastHubState(ctx);
		})();
	}, 5_000);

	const startServer = () =>
		Bun.serve<BrowserPeer>({
			...(tls ? { tls } : {}),
			port,
			hostname: host,
			async fetch(req, server) {
				const url = new URL(req.url);
				if (
					!isAuthorizedBrowserToDesktopRequest(
						req,
						url,
						{
							bindHost: host,
							port,
							publicUrl,
							roomSecret,
						},
						isPublicBrowserRoute,
					)
				) {
					return createJsonResponse({ error: "unauthorized_browser" }, 403);
				}
				if (url.pathname === "/version") {
					return createJsonResponse({ coreVersion: CORE_BUILD_VERSION });
				}
				if (url.pathname === "/actor-session") {
					const headers = {
						"Cache-Control": "no-store",
						"Content-Type": "application/json",
					};
					if (!tls || url.protocol !== "https:")
						return new Response('{"error":"https_required"}', {
							status: 403,
							headers,
						});
					if (req.method === "DELETE") {
						const previous = browserSessions.read(req);
						const cookie = browserSessions.remove(req);
						for (const peer of ctx.peers)
							if (previous && peer.browserSessionId === previous.id)
								peer.socket.close(1000, "Signed out");
						return new Response('{"ok":true}', {
							headers: { ...headers, "Set-Cookie": cookie },
						});
					}
					if (req.method !== "POST")
						return new Response('{"error":"method_not_allowed"}', {
							status: 405,
							headers,
						});
					try {
						const claim = req.headers.get("x-netaigis-auth-request");
						if (!claim || !/^[a-zA-Z0-9-]{1,64}$/.test(claim))
							throw new Error();
						const peer = [...ctx.peers].find(
							(peer) =>
								!peer.closed &&
								peer.browserAuthRequestId === claim &&
								peer.actorRuntime,
						);
						if (!peer) throw new Error();
						const generation = peer.actorGeneration;
						const runtime = peer.actorRuntime;
						const credential = await readActorCredential(req);
						const actorId = await verifyBrowserActorCredential(ctx, credential);
						if (
							peer.closed ||
							peer.actorGeneration !== generation ||
							peer.actorRuntime !== runtime ||
							peer.browserAuthRequestId !== claim ||
							runtime?.sessionControl.actorId() !== actorId
						)
							throw new Error();
						const cookie = browserSessions.issue(req, actorId, credential);
						peer.browserSessionId = cookie.split(/[=;]/)[1];
						return new Response(JSON.stringify({ ok: true, actorId }), {
							headers: { ...headers, "Set-Cookie": cookie },
						});
					} catch {
						return new Response(
							'{"error":"personal_authentication_not_confirmed"}',
							{ status: 401, headers },
						);
					}
				}
				if (url.pathname === "/health") {
					await syncHubHealth(ctx);
					return createJsonResponse(hubStatusPayload(ctx));
				}
				if (url.pathname === "/browser") {
					const displayName = `Browser ${Math.random().toString(36).slice(2, 6)}`;
					const data = {
						browserSessionId: tls ? browserSessions.read(req)?.id : undefined,
						secureTransport:
							url.protocol === "https:" ||
							["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
						socket: undefined as never,
						displayName,
						sending: false,
					};
					if (server.upgrade(req, { data })) return undefined;
					return new Response("upgrade failed", { status: 400 });
				}
				if (url.pathname === "/config.json") {
					return createJsonResponse(browserConfig);
				}
				if (url.pathname === "/api/marketplace/catalog") {
					try {
						return createJsonResponse(await fetchMarketplaceCatalog());
					} catch (error) {
						return createJsonResponse(
							{
								error:
									error instanceof Error
										? error.message
										: "Failed to fetch marketplace catalog",
							},
							502,
						);
					}
				}
				return assets.serve(url.pathname);
			},
			websocket: {
				async open(socket) {
					const peer = socket.data;
					peer.socket = socket;
					ctx.peers.add(peer);
					const saved = peer.browserSessionId
						? browserSessions.lookup(peer.browserSessionId)
						: undefined;
					if (saved) {
						peer.restoringActor = authenticateBrowserActor(
							ctx,
							peer,
							saved.credential,
							undefined,
							saved.actorId,
						)
							.catch(() => {
								if (peer.browserSessionId)
									browserSessions.revoke(peer.browserSessionId);
								ctx.send(peer, { type: "shared_actor" });
							})
							.finally(() => {
								peer.restoringActor = undefined;
							});
						await peer.restoringActor;
					}
				},
				async message(socket, raw) {
					const peer = socket.data;
					try {
						await peer.restoringActor;
						const frame = JSON.parse(String(raw)) as BrowserFrame;
						assertSharedBrowserFrame(ctx, frame.type);
						if (frame.type === "authenticateActor") {
							if (peer.browserSessionId)
								browserSessions.revoke(peer.browserSessionId);
							peer.browserSessionId = undefined;
							peer.browserAuthRequestId = undefined;
							await authenticateBrowserActor(
								ctx,
								peer,
								frame.credential,
								frame.authRequestId,
							);
							return;
						}
						if (frame.type === "sessionControl") {
							await updateBrowserSessionControl(
								ctx,
								peer,
								frame.action,
								frame.sessionId,
								frame.expectedRevision,
							);
							return;
						}
						if (frame.type === "recallSessions") {
							await handleBrowserRecall(ctx, peer, frame);
							return;
						}
						if (frame.type === "desktopCommand") {
							try {
								const result = await handleDesktopCommand(
									ctx,
									frame.command,
									frame.args,
								);
								ctx.send(peer, {
									type: "desktopCommandResult",
									id: frame.id,
									ok: true,
									result,
								});
							} catch (error) {
								ctx.send(peer, {
									type: "desktopCommandResult",
									id: frame.id,
									ok: false,
									error: error instanceof Error ? error.message : String(error),
								});
							}
						} else if (frame.type === "ready") {
							await initializePeer(ctx, peer, syncClientsAndSessions);
						} else if (frame.type === "loadModels") {
							await loadModels(ctx, peer, frame.providerId);
						} else if (frame.type === "loadProviderCatalog") {
							await sendProviderCatalog(ctx, peer);
						} else if (frame.type === "saveProviderSettings") {
							await saveProviderSettings(ctx, peer, frame);
						} else if (frame.type === "runProviderOAuthLogin") {
							await runProviderOAuthLogin(ctx, peer, frame.providerId);
						} else if (frame.type === "attachSession") {
							await selectSession(ctx, peer, frame.sessionId);
						} else if (frame.type === "deleteSession") {
							await deleteSession(ctx, peer, frame.sessionId);
						} else if (frame.type === "updateSessionMetadata") {
							const runtime = runtimeForPeer(ctx, peer);
							const session = await runtime.get(frame.sessionId);
							const metadata =
								session?.metadata && typeof session.metadata === "object"
									? (session.metadata as Record<string, unknown>)
									: {};
							await runtime.update(frame.sessionId, {
								metadata: { ...metadata, ...frame.metadata },
							});
							await syncHubClientsAndSessions(ctx);
							broadcastHubState(ctx);
						} else if (frame.type === "approval_response") {
							handleToolApprovalResponse(ctx, frame, peer);
						} else if (frame.type === "abort") {
							await abortPeerTurn(ctx, peer);
						} else if (frame.type === "reset") {
							await resetPeer(ctx, peer);
						} else if (frame.type === "send") {
							if (peer.sending) {
								ctx.send(peer, {
									type: "status",
									text: "A turn is already in progress.",
								});
								return;
							}
							peer.sending = true;
							try {
								await sendMessage(
									ctx,
									peer,
									frame.prompt,
									frame.config,
									frame.attachments,
								);
							} finally {
								peer.sending = false;
							}
						} else if (frame.type === "forkSession") {
							await forkPeerSession(ctx, peer, syncClientsAndSessions);
						} else if (frame.type === "restore") {
							await restorePeerSession(
								ctx,
								peer,
								frame.checkpointRunCount,
								syncClientsAndSessions,
							);
						} else if (frame.type === "restart_hub") {
							await restartHub(ctx);
						}
					} catch (error) {
						ctx.send(peer, {
							type: "error",
							text: error instanceof Error ? error.message : String(error),
						});
					}
				},
				close(socket) {
					const peer = socket.data;
					void disposeBrowserActor(peer).catch(() => {});
					peer.selectionGeneration = (peer.selectionGeneration ?? 0) + 1;
					peer.unsubscribeEvents?.();
					ctx.peers.delete(peer);
					rejectOrphanedApprovals(ctx);
				},
			},
		});

	let server: ReturnType<typeof startServer>;
	try {
		server = startServer();
	} catch (error) {
		clearInterval(healthInterval);
		await detachHub(ctx);
		throw error;
	}
	return {
		listenUrl: server.url.toString(),
		publicUrl,
		inviteUrl,
		bindHost: host,
		inviteRequired: Boolean(roomSecret),
		hubUrl: ctx.hubUrl,
		stop: async () => {
			if (stopped) return;
			stopped = true;
			clearInterval(healthInterval);
			browserSessions.clear();
			try {
				server.stop(true);
			} finally {
				await detachHub(ctx);
			}
		},
	};
}

export function printClineHubDashboardServerInfo(
	server: ClineHubDashboardServer,
): void {
	console.log(`Cline Hub dashboard listening: ${server.listenUrl}`);
	console.log(`Cline Hub public URL: ${server.publicUrl}`);
	console.log(`hub endpoint: ${server.hubUrl}`);
	if (server.inviteRequired) {
		console.log(`Cline Hub invite URL: ${server.inviteUrl}`);
	} else if (isNonLocalBindHost(server.bindHost)) {
		console.warn("WARNING: non-local bind without ROOM_SECRET is not allowed.");
	} else {
		console.log(
			"ROOM_SECRET is not set; this local-only instance accepts browser connections without an invite token.",
		);
	}
}

if (import.meta.main) {
	const server = await startClineHubDashboardServer();
	printClineHubDashboardServerInfo(server);
}
