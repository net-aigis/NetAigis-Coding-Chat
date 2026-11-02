import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
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
