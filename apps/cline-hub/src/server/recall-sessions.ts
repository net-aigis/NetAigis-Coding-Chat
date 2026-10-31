/** Browser commands use the authenticated actor's existing Core facade, never the observer. */
import type { WebviewInboundMessage } from "../webview-protocol";
import { runtimeForPeer } from "./shared-session-access";
import type { HubContext } from "./state";
import type { BrowserPeer } from "./types";

export async function handleBrowserRecall(
	ctx: HubContext,
	peer: BrowserPeer,
	frame: Extract<WebviewInboundMessage, { type: "recallSessions" }>,
): Promise<void> {
	if (!ctx.externalHub || !peer.actorRuntime || peer.closed)
		throw new Error(
			"Authenticate your own actor in the selected shared runtime before using Recall",
		);
	const runtime = runtimeForPeer(ctx, peer),
		generation = peer.actorGeneration;
	const readGeneration = (peer.recallGeneration ?? 0) + 1;
	peer.recallGeneration = readGeneration;
	const current = () =>
		!peer.closed &&
		peer.actorRuntime === runtime &&
		peer.actorGeneration === generation &&
		peer.recallGeneration === readGeneration;
	if (frame.action === "list") {
		peer.recallSelection = undefined;
		const conversations = await runtime.recall.list();
		if (current()) ctx.send(peer, { type: "recall_sessions", conversations });
		return;
	}
	if (typeof frame.conversationId !== "string" || !frame.conversationId)
		throw new Error("Select a Recall conversation first");
	if (frame.action === "inspect") {
		peer.recallSelection = undefined;
		const snapshot = await runtime.recall.read(frame.conversationId);
		if (!current()) return;
		peer.recallSelection = {
			conversationId: snapshot.conversationId,
			journalSeq: snapshot.journalSeq,
			eligible:
				snapshot.sourceVerified === true &&
				snapshot.restoration.available === true,
		};
		ctx.send(peer, { type: "recall_snapshot", snapshot });
		return;
	}
	if (frame.action !== "restore") throw new Error("Unknown Recall operation");
	if (peer.sending)
		throw new Error(
			"Finish the current request before recovering another session",
		);
	const selection = peer.recallSelection;
	if (!selection?.eligible || selection.conversationId !== frame.conversationId)
		throw new Error(
			"Read a verified recoverable archive before requesting recovery",
		);
	peer.recallSelection = undefined;
	const id = await runtime.recall.restore(
		selection.conversationId,
		selection.journalSeq,
	);
	if (current()) ctx.send(peer, { type: "recall_restored", sessionId: id });
	// The existing UI opens/attaches this same ID. No second chat or implicit writer claim.
}
