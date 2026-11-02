import type {
	TotalRecallConversation,
	TotalRecallSessionSnapshot,
} from "@cline/core";
import { useEffect, useState } from "react";
import type { WebviewOutboundMessage } from "../../../webview-protocol";
import { postToHost } from "../vscode";

export function RecallSessions({
	onOpenSession,
}: {
	onOpenSession?: (id: string) => void;
}) {
	const [conversations, setConversations] =
		useState<TotalRecallConversation[]>();
	const [snapshot, setSnapshot] = useState<TotalRecallSessionSnapshot>();
	const [pending, setPending] = useState(false);
	const [status, setStatus] = useState("");
	useEffect(() => {
		const receive = (event: MessageEvent<WebviewOutboundMessage>) => {
			const value = event.data;
			if (value?.type === "recall_sessions") {
				setConversations(value.conversations);
				setSnapshot(undefined);
				setPending(false);
			} else if (value?.type === "recall_snapshot") {
				setSnapshot(value.snapshot);
				setPending(false);
			} else if (value?.type === "recall_restored") {
				setSnapshot(undefined);
				setPending(false);
				setStatus(
					"Gespeicherten Verlauf bereitgestellt; Sitzung wird unter derselben ID geöffnet.",
				);
				onOpenSession?.(value.sessionId);
			} else if (value?.type === "shared_actor") {
				setConversations(undefined);
				setSnapshot(undefined);
				setPending(false);
				setStatus("");
			} else if (value?.type === "error") {
				setPending(false);
				setSnapshot(undefined);
				setStatus(value.text);
			}
		};
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [onOpenSession]);
	return (
		<details
			className="w-full"
			onToggle={(event) => {
				if (event.currentTarget.open && !conversations && !pending) {
					setPending(true);
					postToHost({ type: "recallSessions", action: "list" });
				}
			}}
		>
			<summary>TOTAL RECALL – gespeicherte Sitzungen</summary>
			<button
				type="button"
				disabled={pending}
				onClick={() => {
					setPending(true);
					setSnapshot(undefined);
					postToHost({ type: "recallSessions", action: "list" });
				}}
			>
				Aktualisieren
			</button>
			<ul>
				{conversations?.map((item) => (
					<li key={JSON.stringify([item.projectId, item.conversationId])}>
						<span>
							{item.projectId} · {item.title || item.conversationId} ·{" "}
							{item.eventCount} Ereignisse{" "}
						</span>
						<button
							type="button"
							disabled={pending}
							onClick={() => {
								setPending(true);
								setSnapshot(undefined);
								postToHost({
									type: "recallSessions",
									action: "inspect",
									conversationId: item.conversationId,
									projectId: item.projectId,
								});
							}}
						>
							Verlauf lesen
						</button>
					</li>
				))}
			</ul>
			{snapshot && (
				<section>
					<p>
						{snapshot.projectId &&
						snapshot.sourceVerified &&
						snapshot.restoration.available
							? "Geprüfter gespeicherter Verlauf verfügbar."
							: "Dieser Archivstand kann gelesen, aber noch nicht sicher wiederaufgenommen werden."}
					</p>
					<button
						type="button"
						disabled={
							pending ||
							!snapshot.projectId ||
							!snapshot.sourceVerified ||
							!snapshot.restoration.available
						}
						onClick={() => {
							if (!snapshot.projectId) return;
							setPending(true);
							postToHost({
								type: "recallSessions",
								action: "restore",
								conversationId: snapshot.conversationId,
								projectId: snapshot.projectId,
							});
						}}
					>
						In derselben Sitzung bereitstellen
					</button>
					<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">
						{JSON.stringify(
							snapshot.recordedSnapshot?.messages ?? snapshot.messages,
							null,
							2,
						)}
					</pre>
				</section>
			)}
			<output>{status}</output>
		</details>
	);
}
