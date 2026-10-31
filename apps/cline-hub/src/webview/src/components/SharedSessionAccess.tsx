import type { SessionWriterControl } from "@cline/core";
import { useEffect, useState } from "react";
import type { WebviewOutboundMessage } from "../../../webview-protocol";
import { postToHost } from "../vscode";
import { RecallSessions } from "./RecallSessions";

/** Actor credentials stay in this connection's memory, outside URLs and persisted UI state. */
export function SharedSessionAccess({
	sessionId,
	onOpenSession,
}: {
	sessionId?: string;
	onOpenSession?: (id: string) => void;
}) {
	const [credential, setCredential] = useState("");
	const [actorId, setActorId] = useState<string>();
	const [control, setControl] = useState<SessionWriterControl>();
	const [pending, setPending] = useState(false);
	const secure = window.isSecureContext;
	useEffect(() => {
		setControl(undefined);
		if (actorId && sessionId)
			postToHost({ type: "sessionControl", action: "get", sessionId });
	}, [actorId, sessionId]);
	useEffect(() => {
		const onMessage = (event: MessageEvent<WebviewOutboundMessage>) => {
			const message = event.data;
			if (message?.type === "shared_actor") {
				setActorId(message.actorId);
				setCredential("");
				setControl(undefined);
				setPending(false);
			} else if (
				message?.type === "session_control" &&
				message.sessionId === sessionId
			) {
				setControl(message.control);
				setPending(false);
			} else if (message?.type === "error") setPending(false);
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [sessionId]);
	function request(action: "get" | "claim" | "release") {
		if (!sessionId) return;
		setPending(true);
		postToHost({
			type: "sessionControl",
			action,
			sessionId,
			expectedRevision: control?.revision,
		});
	}
	return (
		<section
			className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
			aria-label="Gemeinsame Sitzung"
		>
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (!secure || !credential.trim()) return;
					postToHost({ type: "authenticateActor", credential });
					setCredential("");
					setPending(true);
				}}
			>
				<label htmlFor="shared-actor-credential">Eigener Sitzungszugang</label>
				<input
					id="shared-actor-credential"
					className="min-w-0 rounded border bg-transparent px-2 py-1"
					type="password"
					autoComplete="off"
					value={credential}
					onChange={(event) => setCredential(event.target.value)}
					disabled={!secure || pending}
				/>
				<button
					type="submit"
					disabled={!secure || !credential.trim() || pending}
				>
					Verbinden
				</button>
			</form>
			<span>
				{actorId ? `Bestätigter Akteur: ${actorId}` : "Lesender Zugang"}
			</span>
			{!secure && <span>Für die Anmeldung ist HTTPS erforderlich.</span>}
			{actorId && <RecallSessions onOpenSession={onOpenSession} />}
			{sessionId && actorId && (
				<>
					<span>
						Zuletzt bestätigtes Schreibrecht:{" "}
						{control
							? `${control.writer?.actorId ?? "frei"} · Revision ${control.revision}`
							: "ungeprüft"}
					</span>
					<button
						type="button"
						disabled={pending}
						onClick={() => request("get")}
					>
						Prüfen
					</button>
					<button
						type="button"
						disabled={pending || !control}
						onClick={() => request("claim")}
					>
						Übernehmen
					</button>
					<button
						type="button"
						disabled={pending || control?.writer?.actorId !== actorId}
						onClick={() => request("release")}
					>
						Freigeben
					</button>
				</>
			)}
		</section>
	);
}
