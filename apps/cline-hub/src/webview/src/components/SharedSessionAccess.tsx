import type { SessionWriterControl } from "@cline/core";
import { useEffect, useState } from "react";
import type { WebviewOutboundMessage } from "../../../webview-protocol";
import {
	forgetBrowserActor,
	getConfirmedBrowserActorId,
	postToHost,
} from "../vscode";
import { RecallSessions } from "./RecallSessions";

export function useBrowserActor() {
	const [actorId, setActorId] = useState<string | undefined>(
		getConfirmedBrowserActorId,
	);
	useEffect(() => {
		const receive = (event: MessageEvent<WebviewOutboundMessage>) => {
			if (event.data?.type === "shared_actor") setActorId(event.data.actorId);
		};
		window.addEventListener("message", receive);
		setActorId(getConfirmedBrowserActorId());
		return () => window.removeEventListener("message", receive);
	}, []);
	return actorId;
}

/** Personal keys remain transient; the server retains only a protected browser ticket. */
export function SharedActorAccess() {
	const actorId = useBrowserActor();
	const [open, setOpen] = useState(false);
	const [credential, setCredential] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const secure = window.isSecureContext;
	useEffect(() => {
		const receive = (event: MessageEvent<WebviewOutboundMessage>) => {
			const message = event.data;
			if (message?.type === "shared_actor" && message.actorId) {
				setCredential("");
				setPending(false);
				setError("");
				setOpen(false);
			} else if (message?.type === "error") setPending(false);
		};
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, []);
	return (
		<div className="relative ml-auto shrink-0 text-sm">
			<button
				type="button"
				className="rounded border px-3 py-2"
				aria-label="Sitzungszugang"
				aria-expanded={open}
				aria-controls="shared-actor-menu"
				onClick={() => setOpen(!open)}
			>
				{actorId ?? "Verbinden"} <span aria-hidden="true">▾</span>
			</button>
			{open && (
				<div
					id="shared-actor-menu"
					className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-background p-4 shadow-lg"
				>
					<span>
						{actorId ? `Bestätigter Akteur: ${actorId}` : "Lesender Zugang"}
					</span>
					{!actorId && (
						<form
							className="mt-3 grid min-w-0 gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (!secure || !credential.trim() || pending) return;
								setPending(true);
								setError("");
								postToHost({ type: "authenticateActor", credential });
								setCredential("");
							}}
						>
							<label htmlFor="shared-actor-credential">
								Eigener Sitzungszugang
							</label>
							<input
								id="shared-actor-credential"
								className="min-w-0 w-full rounded border bg-transparent px-2 py-1"
								type="password"
								autoComplete="off"
								value={credential}
								onChange={(event) => setCredential(event.target.value)}
								disabled={!secure || pending}
							/>
							<button
								type="submit"
								className="rounded border px-3 py-2"
								disabled={!secure || !credential.trim() || pending}
							>
								Verbinden
							</button>
						</form>
					)}
					{actorId && (
						<button
							type="button"
							className="mt-3 rounded border px-3 py-2"
							disabled={pending}
							onClick={() => {
								setPending(true);
								setError("");
								void forgetBrowserActor()
									.then(() => {
										setPending(false);
										setOpen(false);
									})
									.catch(() => {
										setError(
											"Abmeldung nicht bestätigt. Verbindung prüfen und erneut abmelden.",
										);
										setPending(false);
									});
							}}
						>
							Abmelden
						</button>
					)}
					{!secure && <p>Für die Anmeldung ist HTTPS erforderlich.</p>}
					{error && <p role="alert">{error}</p>}
				</div>
			)}
		</div>
	);
}

export function SharedSessionAccess({
	sessionId,
	onOpenSession,
}: {
	sessionId?: string;
	onOpenSession?: (id: string) => void;
}) {
	const actorId = useBrowserActor();
	const [control, setControl] = useState<SessionWriterControl>();
	const [pending, setPending] = useState(false);
	const [writerConfirmed, setWriterConfirmed] = useState(false);
	useEffect(() => {
		setControl(undefined);
		setWriterConfirmed(false);
		setPending(false);
		if (actorId && sessionId)
			postToHost({ type: "sessionControl", action: "get", sessionId });
	}, [actorId, sessionId]);
	useEffect(() => {
		const receive = (event: MessageEvent<WebviewOutboundMessage>) => {
			const message = event.data;
			if (
				message?.type === "session_control" &&
				message.sessionId === sessionId
			) {
				setControl(message.control);
				setWriterConfirmed(message.writerConfirmed === true);
				setPending(false);
			} else if (message?.type === "error") setPending(false);
		};
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [sessionId]);
	function request(action: "get" | "claim" | "release") {
		if (!sessionId || pending || (action === "claim" && writerConfirmed))
			return;
		setPending(true);
		postToHost({
			type: "sessionControl",
			action,
			sessionId,
			expectedRevision: control?.revision,
		});
	}
	if (!actorId) return null;
	return (
		<section
			className="flex max-h-[35%] min-h-0 shrink-0 flex-wrap items-center gap-2 overflow-y-auto border-b px-4 py-2 text-sm"
			aria-label="Gemeinsame Sitzung"
		>
			<RecallSessions onOpenSession={onOpenSession} />
			{sessionId && (
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
						disabled={pending || !control || writerConfirmed}
						onClick={() => request("claim")}
					>
						Übernehmen
					</button>
					<button
						type="button"
						disabled={pending || !writerConfirmed}
						onClick={() => request("release")}
					>
						Freigeben
					</button>
				</>
			)}
		</section>
	);
}
