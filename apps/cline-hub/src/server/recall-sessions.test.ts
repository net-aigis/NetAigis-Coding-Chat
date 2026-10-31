import { expect, it, vi } from "vitest";
import { handleBrowserRecall } from "./recall-sessions";
import type { HubContext } from "./state";
import type { BrowserPeer } from "./types";

function fixture() {
	const runtime = {
		recall: {
			list: vi.fn(async () => [{ conversationId: "original" }]),
			read: vi.fn(async (id: string) => ({
				conversationId: id,
				journalSeq: 19,
				sourceVerified: true,
				restoration: { available: true },
			})),
			restore: vi.fn(async (id: string, _seq: number) => id),
		},
	};
	const observer = {
		recall: { list: vi.fn(), read: vi.fn(), restore: vi.fn() },
	};
	const peer = {
		actorRuntime: runtime,
		actorGeneration: 1,
		sending: false,
	} as unknown as BrowserPeer;
	const ctx = {
		externalHub: true,
		cline: observer,
		send: vi.fn(),
	} as unknown as HubContext;
	return { runtime, observer, peer, ctx };
}
it("uses the authenticated actor and the inspected server watermark without starting a second conversation", async () => {
	const f = fixture();
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "list",
	});
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		conversationId: "original",
	});
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "restore",
		conversationId: "original",
	});
	expect(f.runtime.recall.restore).toHaveBeenCalledExactlyOnceWith(
		"original",
		19,
	);
	expect(f.ctx.send).toHaveBeenLastCalledWith(f.peer, {
		type: "recall_restored",
		sessionId: "original",
	});
	expect(f.observer.recall.list).not.toHaveBeenCalled();
	expect(f.observer.recall.restore).not.toHaveBeenCalled();
	expect(f.peer.recallSelection).toBeUndefined();
});
it("does not fall back to the observer and refuses restoration before a verified inspection", async () => {
	const f = fixture();
	await expect(
		handleBrowserRecall(f.ctx, f.peer, {
			type: "recallSessions",
			action: "restore",
			conversationId: "original",
		}),
	).rejects.toThrow("Read a verified");
	f.peer.actorRuntime = undefined;
	await expect(
		handleBrowserRecall(f.ctx, f.peer, {
			type: "recallSessions",
			action: "list",
		}),
	).rejects.toThrow("Authenticate your own actor");
	expect(f.observer.recall.list).not.toHaveBeenCalled();
});
it("does not publish or admit an archive read after an actor switch", async () => {
	const f = fixture();
	let resolve!: (
		value: Awaited<ReturnType<typeof f.runtime.recall.read>>,
	) => void;
	f.runtime.recall.read.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const pending = handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		conversationId: "original",
	});
	f.peer.actorGeneration = 2;
	resolve({
		conversationId: "original",
		journalSeq: 19,
		sourceVerified: true,
		restoration: { available: true },
	});
	await pending;
	expect(f.ctx.send).not.toHaveBeenCalled();
	expect(f.peer.recallSelection).toBeUndefined();
});
it("keeps the latest selected inspection when older reads arrive later", async () => {
	const f = fixture();
	let resolve!: (
		value: Awaited<ReturnType<typeof f.runtime.recall.read>>,
	) => void;
	f.runtime.recall.read.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const older = handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		conversationId: "older",
	});
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		conversationId: "newer",
	});
	resolve({
		conversationId: "older",
		journalSeq: 18,
		sourceVerified: true,
		restoration: { available: true },
	});
	await older;
	expect(f.peer.recallSelection?.conversationId).toBe("newer");
	expect(f.ctx.send).toHaveBeenCalledOnce();
});
