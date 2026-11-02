import { expect, it, vi } from "vitest";
import { handleBrowserRecall } from "./recall-sessions";
import type { HubContext } from "./state";
import type { BrowserPeer } from "./types";

function fixture() {
	const runtime = {
		recall: {
			projects: vi.fn(async () => [{ projectId: "project" }]),
			list: vi.fn(async () => [
				{ projectId: "project", conversationId: "original" },
			]),
			read: vi.fn(async (id: string, _projectId?: string) => ({
				projectId: "project",
				conversationId: id,
				journalSeq: 19,
				sourceVerified: true,
				restoration: { available: true },
			})),
			restore: vi.fn(
				async (id: string, _seq: number, _projectId?: string) => id,
			),
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
it("keeps the inspected project's identity when another project contains the same conversation ID", async () => {
	const f = fixture();
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		conversationId: "original",
		projectId: "project",
	});
	await expect(
		handleBrowserRecall(f.ctx, f.peer, {
			type: "recallSessions",
			action: "restore",
			conversationId: "original",
			projectId: "OtherProject",
		}),
	).rejects.toThrow("Read a verified");
	expect(f.runtime.recall.restore).not.toHaveBeenCalled();
	expect(f.runtime.recall.read).toHaveBeenCalledExactlyOnceWith(
		"original",
		"project",
	);
});
it("uses the authenticated actor and the inspected server watermark without starting a second conversation", async () => {
	const f = fixture();
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "list",
	});
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		projectId: "project",
		conversationId: "original",
	});
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "restore",
		projectId: "project",
		conversationId: "original",
	});
	expect(f.runtime.recall.restore).toHaveBeenCalledExactlyOnceWith(
		"original",
		19,
		"project",
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
			projectId: "project",
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
		projectId: "project",
		conversationId: "original",
	});
	f.peer.actorGeneration = 2;
	resolve({
		projectId: "project",
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
		projectId: "project",
		conversationId: "older",
	});
	await handleBrowserRecall(f.ctx, f.peer, {
		type: "recallSessions",
		action: "inspect",
		projectId: "project",
		conversationId: "newer",
	});
	resolve({
		projectId: "project",
		conversationId: "older",
		journalSeq: 18,
		sourceVerified: true,
		restoration: { available: true },
	});
	await older;
	expect(f.peer.recallSelection?.conversationId).toBe("newer");
	expect(f.ctx.send).toHaveBeenCalledOnce();
});
