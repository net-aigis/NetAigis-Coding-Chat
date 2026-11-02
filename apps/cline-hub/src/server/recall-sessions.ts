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
		const projects = await runtime.recall.projects();
		const conversations = [];
		for (const project of projects) {
			if (!current()) return;
			conversations.push(...(await runtime.recall.list(project.projectId)));
		}
		if (current()) ctx.send(peer, { type: "recall_sessions", conversations });
		return;
	}
	if (typeof frame.conversationId !== "string" || !frame.conversationId)
		throw new Error("Select a Recall conversation first");
	if (typeof frame.projectId !== "string" || !frame.projectId.trim())
		throw new Error("Select the exact Recall project first");
	if (frame.action === "inspect") {
		peer.recallSelection = undefined;
		const snapshot = await runtime.recall.read(
			frame.conversationId,
			frame.projectId,
		);
		if (!current()) return;
		if (
			snapshot.projectId !== frame.projectId ||
			snapshot.conversationId !== frame.conversationId
		)
			throw new Error(
				"Recall snapshot did not confirm the selected project and conversation",
			);
		peer.recallSelection = {
			conversationId: snapshot.conversationId,
			projectId: snapshot.projectId,
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
	if (
		!selection?.eligible ||
		selection.conversationId !== frame.conversationId ||
		selection.projectId !== frame.projectId
	)
		throw new Error(
			"Read a verified recoverable archive before requesting recovery",
		);
	peer.recallSelection = undefined;
	const id = await runtime.recall.restore(
		selection.conversationId,
		selection.journalSeq,
		selection.projectId,
	);
	if (current()) ctx.send(peer, { type: "recall_restored", sessionId: id });
	// The existing UI opens/attaches this same ID. No second chat or implicit writer claim.
}
