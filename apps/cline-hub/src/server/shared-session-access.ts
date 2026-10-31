/** Per-browser credentials select an authenticated actor in the existing shared Hub. */
import { ClineCore } from "@cline/core";
import { requestToolApprovalFromWebview } from "./approvals";
import type { HubContext } from "./state";
import type { BrowserPeer } from "./types";

export function runtimeForPeer(ctx: HubContext, peer: BrowserPeer): ClineCore {
	const runtime = ctx.externalHub ? peer.actorRuntime : ctx.cline;
	if (!runtime)
		throw new Error(
			ctx.externalHub
				? "Authenticate your own actor before writing to this shared session"
				: "Hub is not connected",
		);
	return runtime;
}

export async function authenticateBrowserActor(
	ctx: HubContext,
	peer: BrowserPeer,
	credential: string,
): Promise<void> {
	if (!ctx.externalHub)
		throw new Error(
			"Actor authentication requires an explicitly selected shared runtime",
		);
	if (!peer.secureTransport)
		throw new Error(
			"Actor credentials require HTTPS or a loopback browser connection",
		);
	const endpoint = new URL(ctx.hubUrl);
	if (
		endpoint.protocol !== "wss:" &&
		!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
	)
		throw new Error(
			"Actor credentials require an encrypted or loopback connection to the shared runtime",
		);
	if (peer.sending)
		throw new Error(
			"Finish the active request before changing the actor connection",
		);
	const generation = (peer.actorGeneration ?? 0) + 1;
	peer.actorGeneration = generation;
	const previous = peer.actorRuntime;
	peer.actorRuntime = undefined;
	await previous?.dispose();
	ctx.send(peer, { type: "shared_actor" });
	let runtime: ClineCore | undefined;
	try {
		if (typeof credential !== "string" || !credential.trim()) throw new Error();
		runtime = await ClineCore.create({
			backendMode: "remote",
			clientName: "cline-hub-browser",
			remote: {
				endpoint: ctx.hubUrl,
				authToken: credential,
				clientType: "cline-hub-browser",
			},
			capabilities: {
				requestToolApproval: (request) =>
					requestToolApprovalFromWebview(ctx, request, peer),
			},
		});
		await runtime.list(1);
		const actorId = runtime.sessionControl.actorId();
		if (!actorId) throw new Error();
		if (peer.closed || peer.actorGeneration !== generation) {
			await runtime.dispose();
			return;
		}
		peer.actorRuntime = runtime;
		ctx.send(peer, { type: "shared_actor", actorId });
	} catch {
		if (peer.actorRuntime === runtime) peer.actorRuntime = undefined;
		await runtime?.dispose().catch(() => {});
		if (peer.actorGeneration === generation && !peer.closed)
			ctx.send(peer, { type: "shared_actor" });
		throw new Error(
			"Actor authentication was not confirmed by the selected shared runtime",
		);
	}
	if (peer.selectedSessionId)
		await updateBrowserSessionControl(ctx, peer, "get", peer.selectedSessionId);
}

export async function updateBrowserSessionControl(
	ctx: HubContext,
	peer: BrowserPeer,
	action: "get" | "claim" | "release",
	sessionId: string,
	expectedRevision?: number,
): Promise<void> {
	if (!sessionId || sessionId !== peer.selectedSessionId)
		throw new Error("Select the existing session before changing its writer");
	if (
		!["get", "claim", "release"].includes(action) ||
		(action !== "get" &&
			(!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0))
	)
		throw new Error(
			"Read the confirmed writer revision before requesting a handover",
		);
	const runtime = runtimeForPeer(ctx, peer);
	const control =
		action === "get"
			? await runtime.sessionControl.get(sessionId)
			: await runtime.sessionControl[action](
					sessionId,
					expectedRevision as number,
				);
	if (
		peer.closed ||
		peer.selectedSessionId !== sessionId ||
		peer.actorRuntime !== runtime
	)
		return;
	ctx.send(peer, { type: "session_control", sessionId, control });
}

export async function disposeBrowserActor(peer: BrowserPeer): Promise<void> {
	peer.closed = true;
	peer.actorGeneration = (peer.actorGeneration ?? 0) + 1;
	const runtime = peer.actorRuntime;
	peer.actorRuntime = undefined;
	await runtime?.dispose();
}

/** Shared browser clients cannot mutate global services/settings via the observer client. */
export function assertSharedBrowserFrame(ctx: HubContext, type: string): void {
	if (
		ctx.externalHub &&
		![
			"ready",
			"attachSession",
			"send",
			"abort",
			"reset",
			"deleteSession",
			"updateSessionMetadata",
			"loadModels",
			"loadProviderCatalog",
			"approval_response",
			"authenticateActor",
			"sessionControl",
		].includes(type)
	)
		throw new Error(
			"This shared browser connection cannot change workspace settings or global services",
		);
}
