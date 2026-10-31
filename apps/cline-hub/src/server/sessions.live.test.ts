import { describe, expect, it, vi } from "vitest";
import { resetPeer, selectSession } from "./sessions";
import type { HubContext } from "./state";
import type { BrowserPeer } from "./types";

vi.mock("./deps", () => ({
	providerSettingsManager: { getLastUsedProviderSettings: () => undefined },
	workspaceRoot: "/fixture",
}));
vi.mock("./providers", () => ({
	loadProviders: async () => {},
	resolveBrowserDefaults: () => ({}),
	sendProviderCatalog: () => {},
}));

function fixture() {
	const messages = [
		{
			role: "user",
			content: "original order",
			metadata: { author: "Friseer" },
		},
		{
			role: "user",
			content: "in-flight correction",
			metadata: { author: "jimmi" },
		},
	];
	const cline = {
		get: vi.fn(async (id: string) => ({ sessionId: id, status: "running" })),
		readMessages: vi.fn(async () => messages.slice(0, 1)),
		readLiveMessages: vi.fn(async () => messages),
		start: vi.fn(),
		abort: vi.fn(),
		restore: vi.fn(),
	};
	const send = vi.fn();
	const ctx = {
		cline,
		sessions: new Map(),
		pendingToolApprovals: new Map(),
		send,
	} as unknown as HubContext;
	const peer = { selectedSessionId: "previous-session" } as BrowserPeer;
	return { messages, cline, ctx, peer, send };
}
describe("browser joins the existing live session", () => {
	it("does not reopen a pending selection after the browser clears its view", async () => {
		const f = fixture();
		const gate = Promise.withResolvers<typeof f.messages>();
		f.cline.readLiveMessages.mockImplementationOnce(() => gate.promise);
		const pending = selectSession(f.ctx, f.peer, "shared-session");
		await vi.waitFor(() =>
			expect(f.cline.readLiveMessages).toHaveBeenCalledOnce(),
		);
		await resetPeer(f.ctx, f.peer);
		gate.resolve(f.messages);
		await pending;
		expect(f.peer.selectedSessionId).toBeUndefined();
		expect(
			f.send.mock.calls.some(
				([, message]) => message.type === "session_hydrated",
			),
		).toBe(false);
	});
	it("hydrates the current conversation without starting, stopping or forking another session", async () => {
		const f = fixture();
		await selectSession(f.ctx, f.peer, "shared-session");
		expect(f.cline.readLiveMessages).toHaveBeenCalledWith("shared-session");
		expect(f.cline.readMessages).not.toHaveBeenCalled();
		expect(f.peer.selectedSessionId).toBe("shared-session");
		expect(f.send).toHaveBeenCalledWith(
			f.peer,
			expect.objectContaining({
				type: "session_hydrated",
				sessionId: "shared-session",
				status: "running",
				messages: expect.arrayContaining([
					expect.objectContaining({ text: "in-flight correction" }),
				]),
			}),
		);
		for (const method of [f.cline.start, f.cline.abort, f.cline.restore])
			expect(method).not.toHaveBeenCalled();
	});
	it("leaves the current selection intact if the live read fails", async () => {
		const f = fixture();
		f.cline.readLiveMessages.mockRejectedValueOnce(
			new Error("fixture read failed"),
		);
		await expect(
			selectSession(f.ctx, f.peer, "shared-session"),
		).rejects.toThrow("fixture read failed");
		expect(f.peer.selectedSessionId).toBe("previous-session");
		expect(f.send).not.toHaveBeenCalled();
	});
	it("does not invent a new session when the selected ID is absent", async () => {
		const f = fixture();
		f.cline.get.mockResolvedValueOnce(undefined as never);
		await expect(
			selectSession(f.ctx, f.peer, "missing-session"),
		).rejects.toThrow();
		expect(f.peer.selectedSessionId).toBe("previous-session");
		expect(f.cline.start).not.toHaveBeenCalled();
	});
	it("does not replace a newer selection when an older live read finishes late", async () => {
		const f = fixture();
		const gate = Promise.withResolvers<typeof f.messages>();
		f.cline.readLiveMessages.mockImplementationOnce(() => gate.promise);
		const older = selectSession(f.ctx, f.peer, "older-session");
		await vi.waitFor(() =>
			expect(f.cline.readLiveMessages).toHaveBeenCalledOnce(),
		);
		await selectSession(f.ctx, f.peer, "newer-session");
		gate.resolve(f.messages);
		await older;
		expect(f.peer.selectedSessionId).toBe("newer-session");
		expect(
			f.send.mock.calls.filter(
				([, message]) => message.type === "session_started",
			),
		).toHaveLength(1);
	});
});
