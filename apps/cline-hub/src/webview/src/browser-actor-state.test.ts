import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.resetModules();
});

it("reconnects automatically after close and only reattaches the same session, without replaying a sent command", async () => {
	const sockets: Socket[] = [];
	class Socket extends EventTarget {
		static OPEN = 1;
		static CONNECTING = 0;
		readyState = 0;
		constructor(_url: string) {
			super();
			sockets.push(this);
		}
		send = vi.fn();
		close() {
			this.readyState = 3;
			this.dispatchEvent(new Event("close"));
		}
	}
	const target = Object.assign(new EventTarget(), {
		location: new URL("https://fixture.invalid/chat?id=same-session"),
		localStorage: { getItem: () => null, setItem: vi.fn() },
	});
	vi.stubGlobal("window", target);
	vi.stubGlobal("WebSocket", Socket);
	const adapter = await import("./vscode");
	adapter.postToHost({ type: "ready" });
	sockets[0].readyState = 1;
	sockets[0].dispatchEvent(new Event("open"));
	adapter.postToHost({ type: "attachSession", sessionId: "same-session" });
	adapter.postToHost({ type: "send", prompt: "Send once" });
	sockets[0].close();
	await vi.advanceTimersByTimeAsync(1000);
	expect(sockets).toHaveLength(2);
	sockets[1].readyState = 1;
	sockets[1].dispatchEvent(new Event("open"));
	const replay = sockets[1].send.mock.calls.map(([data]) => JSON.parse(data));
	expect(replay).toContainEqual({ type: "ready" });
	expect(replay).toContainEqual({
		type: "attachSession",
		sessionId: "same-session",
	});
	expect(replay.some((frame) => frame.type === "send")).toBe(false);
	sockets[1].dispatchEvent(
		new MessageEvent("message", {
			data: JSON.stringify({ type: "shared_actor", actorId: "Friseer" }),
		}),
	);
	expect(adapter.getConfirmedBrowserActorId()).toBe("Friseer");
});

it("replaces a stale open socket after the screen becomes visible without requiring personal keys", async () => {
	const sockets: Socket[] = [];
	class Socket extends EventTarget {
		static OPEN = 1;
		static CONNECTING = 0;
		readyState = 0;
		constructor(_url: string) {
			super();
			sockets.push(this);
		}
		send = vi.fn();
		close() {
			this.readyState = 3;
			this.dispatchEvent(new Event("close"));
		}
	}
	const target = Object.assign(new EventTarget(), {
		location: new URL("https://fixture.invalid/chat?id=same-session"),
		localStorage: { getItem: () => null, setItem: vi.fn() },
	});
	const document = Object.assign(new EventTarget(), {
		visibilityState: "visible",
	});
	vi.stubGlobal("window", target);
	vi.stubGlobal("document", document);
	vi.stubGlobal("WebSocket", Socket);
	const adapter = await import("./vscode");
	adapter.postToHost({ type: "ready" });
	sockets[0].readyState = 1;
	sockets[0].dispatchEvent(new Event("open"));
	document.visibilityState = "hidden";
	document.dispatchEvent(new Event("visibilitychange"));
	document.visibilityState = "visible";
	document.dispatchEvent(new Event("visibilitychange"));
	expect(sockets).toHaveLength(2);
	expect(sockets[0].readyState).toBe(3);
	sockets[1].readyState = 1;
	sockets[1].dispatchEvent(new Event("open"));
	expect(
		sockets[1].send.mock.calls.map(([data]) => JSON.parse(data)),
	).toContainEqual({ type: "attachSession", sessionId: "same-session" });
});
it("keeps the server-confirmed actor for a header that mounts after cookie authentication and clears it on disconnect", async () => {
	const sockets: Socket[] = [];
	class Socket extends EventTarget {
		static OPEN = 1;
		static CONNECTING = 0;
		readyState = 0;
		constructor(_url: string) {
			super();
			sockets.push(this);
		}
		send = vi.fn();
	}
	const target = Object.assign(new EventTarget(), {
		location: new URL("https://fixture.invalid/chat"),
		localStorage: { getItem: () => null, setItem: vi.fn() },
	});
	vi.stubGlobal("window", target);
	vi.stubGlobal("WebSocket", Socket);
	const adapter = await import("./vscode");
	adapter.postToHost({ type: "ready" });
	sockets[0].dispatchEvent(
		new MessageEvent("message", {
			data: JSON.stringify({ type: "shared_actor", actorId: "Friseer" }),
		}),
	);
	expect(adapter.getConfirmedBrowserActorId()).toBe("Friseer");
	sockets[0].dispatchEvent(new Event("close"));
	expect(adapter.getConfirmedBrowserActorId()).toBeUndefined();
});
it("does not let a late close from an obsolete socket erase the current actor or queued messages", async () => {
	const sockets: Socket[] = [];
	class Socket extends EventTarget {
		static OPEN = 1;
		static CONNECTING = 0;
		readyState = 0;
		constructor(_url: string) {
			super();
			sockets.push(this);
		}
		send = vi.fn();
	}
	const target = Object.assign(new EventTarget(), {
		location: new URL("https://fixture.invalid/chat"),
		localStorage: { getItem: () => null, setItem: vi.fn() },
	});
	vi.stubGlobal("window", target);
	vi.stubGlobal("WebSocket", Socket);
	const adapter = await import("./vscode");
	adapter.postToHost({ type: "ready" });
	sockets[0].readyState = 3;
	adapter.postToHost({ type: "ready" });
	sockets[1].dispatchEvent(
		new MessageEvent("message", {
			data: JSON.stringify({ type: "shared_actor", actorId: "Friseer" }),
		}),
	);
	sockets[0].dispatchEvent(new Event("close"));
	expect(adapter.getConfirmedBrowserActorId()).toBe("Friseer");
	sockets[1].readyState = 1;
	sockets[1].dispatchEvent(new Event("open"));
	expect(sockets[1].send).toHaveBeenCalled();
});

it("does not announce a fresh login as ready before its reload ticket is committed", async () => {
	const sockets: Socket[] = [];
	class Socket extends EventTarget {
		static OPEN = 1;
		static CONNECTING = 0;
		readyState = 1;
		constructor(_url: string) {
			super();
			sockets.push(this);
		}
		send = vi.fn();
	}
	const target = Object.assign(new EventTarget(), {
		location: new URL("https://fixture.invalid/chat?id=same-session"),
		localStorage: { getItem: () => null, setItem: vi.fn() },
	});
	vi.stubGlobal("window", target);
	vi.stubGlobal("WebSocket", Socket);
	let complete!: (value: Response) => void;
	const fetch = vi.fn(
		() =>
			new Promise<Response>((resolve) => {
				complete = resolve;
			}),
	);
	vi.stubGlobal("fetch", fetch);
	const adapter = await import("./vscode");
	adapter.postToHost({
		type: "authenticateActor",
		credential: "fixture-personal-key",
	});
	const request = JSON.parse(sockets[0].send.mock.calls[0][0]);
	const acknowledgement = {
		type: "shared_actor",
		actorId: "Friseer",
		authRequestId: request.authRequestId,
	};
	sockets[0].dispatchEvent(
		new MessageEvent("message", { data: JSON.stringify(acknowledgement) }),
	);
	await vi.advanceTimersByTimeAsync(0);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(adapter.getConfirmedBrowserActorId()).toBeUndefined();
	// A duplicate acknowledgement must not start another credential POST or
	// publish the actor while the original response is still pending.
	sockets[0].dispatchEvent(
		new MessageEvent("message", { data: JSON.stringify(acknowledgement) }),
	);
	await vi.advanceTimersByTimeAsync(0);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(adapter.getConfirmedBrowserActorId()).toBeUndefined();
	complete(
		new Response(JSON.stringify({ actorId: "Friseer" }), { status: 200 }),
	);
	await vi.advanceTimersByTimeAsync(0);
	expect(adapter.getConfirmedBrowserActorId()).toBe("Friseer");
	const stale = {
		...acknowledgement,
		actorId: "jimmi",
		authRequestId: "obsolete-request",
	};
	sockets[0].dispatchEvent(
		new MessageEvent("message", { data: JSON.stringify(stale) }),
	);
	expect(adapter.getConfirmedBrowserActorId()).toBe("Friseer");
	adapter.postToHost({ type: "authenticateActor", credential: "fixture-second-key" });
	const second = JSON.parse(sockets[0].send.mock.calls.at(-1)![0]);
	sockets[0].dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "shared_actor", actorId: "jimmi", authRequestId: second.authRequestId }) }));
	await vi.advanceTimersByTimeAsync(0);
	expect(fetch).toHaveBeenCalledTimes(2);
	sockets[0].readyState = 3;
	sockets[0].dispatchEvent(new Event("close"));
	complete(new Response(JSON.stringify({ actorId: "jimmi" }), { status: 200 }));
	await vi.advanceTimersByTimeAsync(0);
	expect(adapter.getConfirmedBrowserActorId()).toBeUndefined();
});
