import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	handleToolApprovalResponse,
	requestToolApprovalFromWebview,
} from "./approvals";
import { sendMessage } from "./sessions";
import {
	assertSharedBrowserFrame,
	authenticateBrowserActor,
	disposeBrowserActor,
	updateBrowserSessionControl,
} from "./shared-session-access";
import type { HubContext } from "./state";
import type { BrowserPeer } from "./types";

const create = vi.hoisted(() => vi.fn());
vi.mock("@cline/core", async (original) => ({
	...(await original<typeof import("@cline/core")>()),
	ClineCore: { create },
}));
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
	const runtime = {
		list: vi.fn(async () => []),
		send: vi.fn(),
		dispose: vi.fn(async () => {}),
		sessionControl: {
			actorId: () => "jimmi",
			get: vi.fn(async () => ({ version: 1, revision: 2 })),
			claim: vi.fn(async () => ({
				version: 1,
				revision: 3,
				writer: { actorId: "jimmi" },
			})),
			release: vi.fn(),
		},
	};
	const observer = { send: vi.fn(), start: vi.fn() };
	const peer = {
		selectedSessionId: "same-session",
		secureTransport: true,
		sending: false,
	} as BrowserPeer;
	const ctx = {
		externalHub: true,
		hubUrl: "ws://127.0.0.1:25463/hub",
		cline: observer,
		send: vi.fn(),
		sendToSelectedPeers: vi.fn(),
		peers: new Set([peer]),
		pendingToolApprovals: new Map(),
		pushEvent: vi.fn(),
		broadcast: vi.fn(),
		clients: new Map(),
		sessions: new Map(),
		events: [],
		hasSelectedPeer: () => true,
	} as unknown as HubContext;
	create.mockResolvedValue(runtime);
	return { runtime, observer, peer, ctx };
}
beforeEach(() => create.mockReset());
describe("separate actor connections for the existing shared browser session", () => {
	it("never falls back to the dashboard credential for a browser write", async () => {
		const f = fixture();
		await expect(sendMessage(f.ctx, f.peer, "correction")).rejects.toThrow(
			"Authenticate your own actor",
		);
		expect(f.observer.send).not.toHaveBeenCalled();
		expect(f.observer.start).not.toHaveBeenCalled();
	});
	it("requires a confirmed server actor, then sends through that private connection under the same session ID", async () => {
		const f = fixture();
		await authenticateBrowserActor(f.ctx, f.peer, "fixture-jimmi-token");
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				backendMode: "remote",
				remote: expect.objectContaining({
					endpoint: f.ctx.hubUrl,
					authToken: "fixture-jimmi-token",
				}),
			}),
		);
		expect(f.ctx.send).toHaveBeenCalledWith(f.peer, {
			type: "shared_actor",
			actorId: "jimmi",
		});
		await sendMessage(f.ctx, f.peer, "correction");
		expect(f.runtime.send).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "same-session",
				prompt: "correction",
			}),
		);
		expect(f.observer.send).not.toHaveBeenCalled();
	});
	it("does not mistake a shared/observer token for an actor identity", async () => {
		const f = fixture();
		f.runtime.sessionControl.actorId = () => undefined as unknown as string;
		await expect(
			authenticateBrowserActor(f.ctx, f.peer, "fixture-observer-token"),
		).rejects.toThrow("not confirmed");
		expect(f.peer.actorRuntime).toBeUndefined();
		expect(f.runtime.dispose).toHaveBeenCalledOnce();
		expect(f.ctx.send).not.toHaveBeenCalledWith(
			f.peer,
			expect.objectContaining({ actorId: expect.any(String) }),
		);
	});
	it("requires a secure credential transport and does not echo rejected credentials", async () => {
		const f = fixture();
		f.peer.secureTransport = false;
		await expect(
			authenticateBrowserActor(f.ctx, f.peer, "fixture-private-token"),
		).rejects.toThrow("HTTPS");
		expect(create).not.toHaveBeenCalled();
		f.peer.secureTransport = true;
		create.mockRejectedValueOnce(new Error("fixture-private-token"));
		try {
			await authenticateBrowserActor(f.ctx, f.peer, "fixture-private-token");
			throw new Error("expected failure");
		} catch (error) {
			expect(String(error)).not.toContain("fixture-private-token");
		}
	});
	it("cleans up a connection authenticated only after its browser disconnected", async () => {
		const f = fixture();
		let resolve!: () => void;
		f.runtime.list.mockImplementationOnce(
			() =>
				new Promise<never[]>((r) => {
					resolve = () => r([]);
				}),
		);
		const pending = authenticateBrowserActor(f.ctx, f.peer, "fixture-token");
		await vi.waitFor(() => expect(f.runtime.list).toHaveBeenCalledOnce());
		await disposeBrowserActor(f.peer);
		resolve();
		await pending;
		expect(f.peer.actorRuntime).toBeUndefined();
		expect(f.runtime.dispose).toHaveBeenCalledOnce();
	});
	it("uses explicit revisions and refuses a control command for a different selection", async () => {
		const f = fixture();
		await authenticateBrowserActor(f.ctx, f.peer, "fixture-token");
		await expect(
			updateBrowserSessionControl(f.ctx, f.peer, "claim", "another", 2),
		).rejects.toThrow("Select the existing");
		await updateBrowserSessionControl(
			f.ctx,
			f.peer,
			"claim",
			"same-session",
			2,
		);
		expect(f.runtime.sessionControl.claim).toHaveBeenCalledWith(
			"same-session",
			2,
		);
		expect(f.ctx.send).toHaveBeenCalledWith(f.peer, {
			type: "session_control",
			sessionId: "same-session",
			control: { version: 1, revision: 3, writer: { actorId: "jimmi" } },
		});
	});
	it("refuses shared browser mutations through global observer commands", () => {
		const f = fixture();
		for (const type of [
			"desktopCommand",
			"saveProviderSettings",
			"runProviderOAuthLogin",
			"restart_hub",
			"forkSession",
			"restore",
		])
			expect(() => assertSharedBrowserFrame(f.ctx, type)).toThrow(
				"cannot change",
			);
		expect(() =>
			assertSharedBrowserFrame(f.ctx, "attachSession"),
		).not.toThrow();
	});
	it("scopes an approval to the authenticated browser that received it", async () => {
		const f = fixture();
		const result = requestToolApprovalFromWebview(
			f.ctx,
			{
				sessionId: "same-session",
				agentId: "agent",
				conversationId: "conversation",
				iteration: 1,
				toolCallId: "tool",
				toolName: "run_commands",
				input: { commands: ["fixture-command"] },
				policy: { autoApprove: false },
			},
			f.peer,
		);
		const id = [...f.ctx.pendingToolApprovals.keys()][0];
		expect(() =>
			handleToolApprovalResponse(
				f.ctx,
				{ type: "approval_response", approvalId: id, approved: true },
				{} as BrowserPeer,
			),
		).toThrow("another authenticated");
		handleToolApprovalResponse(
			f.ctx,
			{ type: "approval_response", approvalId: id, approved: true },
			f.peer,
		);
		await expect(result).resolves.toMatchObject({ approved: true });
	});
});
