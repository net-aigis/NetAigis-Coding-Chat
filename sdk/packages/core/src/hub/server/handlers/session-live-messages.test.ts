import type { HubCommandEnvelope } from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import type { HubTransportContext } from "./context";
import { handleSessionMessages } from "./session-handlers";

function fixture() {
	const live = [
		{
			role: "user",
			content: "original order",
			metadata: { author: "Friseer" },
		},
		{
			role: "user",
			content: "current correction",
			metadata: { author: "jimmi" },
		},
	];
	const persisted = live.slice(0, 1);
	const runtime = {
		getSession: vi.fn(async () => ({
			sessionId: "same-session",
			status: "running",
		})),
		readSessionMessages: vi.fn(async () => persisted),
		readLiveSessionMessages: vi.fn(async () => live),
	};
	const ctx = {
		sessionHost: runtime,
		sessionState: new Map(),
	} as unknown as HubTransportContext;
	const envelope: HubCommandEnvelope = {
		version: "v1",
		command: "session.messages",
		requestId: "read",
		clientId: "android-client",
		sessionId: "same-session",
		payload: { live: true },
	};
	return { live, persisted, runtime, ctx, envelope };
}
describe("live session messages through the existing hub command", () => {
	it("reads the canonical running conversation without replacing the session or changing authors", async () => {
		const f = fixture();
		expect(await handleSessionMessages(f.ctx, f.envelope)).toMatchObject({
			ok: true,
			payload: { sessionId: "same-session", view: "live", messages: f.live },
		});
		expect(f.runtime.readLiveSessionMessages).toHaveBeenCalledWith(
			"same-session",
		);
		expect(f.runtime.readSessionMessages).not.toHaveBeenCalled();
	});
	it("keeps the established persisted-history request unchanged", async () => {
		const f = fixture();
		f.envelope.payload = {};
		expect(await handleSessionMessages(f.ctx, f.envelope)).toMatchObject({
			ok: true,
			payload: { sessionId: "same-session", messages: f.persisted },
		});
		expect(f.runtime.readLiveSessionMessages).not.toHaveBeenCalled();
	});
	it("refuses to describe a persisted fallback as confirmed live history", async () => {
		const f = fixture();
		Reflect.deleteProperty(f.runtime, "readLiveSessionMessages");
		expect(await handleSessionMessages(f.ctx, f.envelope)).toMatchObject({
			ok: false,
			error: { code: "live_history_unavailable" },
		});
		expect(f.runtime.readSessionMessages).not.toHaveBeenCalled();
	});
});
