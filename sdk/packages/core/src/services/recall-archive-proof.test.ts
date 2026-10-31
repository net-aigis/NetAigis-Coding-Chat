import { expect, it } from "vitest";
import {
	decodeRecallArchiveKey,
	recallArchiveKeyId,
	signRuntimeRecallRecord,
	verifyRuntimeRecallRecord,
} from "./recall-archive-proof";
import type { RecallEvent } from "./recall-outbox";

const key = Buffer.alloc(32, 7);
const event: RecallEvent = {
	event_id: "unique-event",
	project_id: "project",
	conversation_id: "session",
	actor_id: "jimmi",
	kind: "cline.sdk.event",
	payload: {
		sdk_event: {
			type: "session_snapshot",
			payload: {
				sessionId: "session",
				snapshot: {
					messages: [
						{
							role: "user",
							content: "Original",
							metadata: { author: { actorId: "Friseer" } },
						},
					],
				},
			},
		},
		captured_at: "2026-10-31T12:00:00Z",
	},
};
it("authenticates the original authors and complete payload without modifying it or leaking the key", () => {
	const before = JSON.stringify(event);
	const signed = signRuntimeRecallRecord(event, key);
	expect(verifyRuntimeRecallRecord(signed, key)).toBe(true);
	expect(JSON.stringify(event)).toBe(before);
	expect(JSON.stringify(signed)).not.toContain(key.toString("base64url"));
	expect(JSON.stringify(signed)).not.toContain(key.toString("hex"));
});
it("is stable across JSON key order and server-added sequence/time fields", () => {
	const signed = signRuntimeRecallRecord(event, key);
	const reordered = JSON.parse(JSON.stringify(signed));
	reordered.payload = Object.fromEntries(
		Object.entries(reordered.payload).reverse(),
	);
	reordered.seq = 123;
	reordered.created_at = "2026-10-31T13:00:00Z";
	expect(verifyRuntimeRecallRecord(reordered, key)).toBe(true);
});
it.each([
	"event_id",
	"project_id",
	"conversation_id",
	"actor_id",
	"kind",
] as const)("rejects copied proof after changing %s", (field) => {
	const signed = signRuntimeRecallRecord(event, key);
	expect(
		verifyRuntimeRecallRecord({ ...signed, [field]: "different" }, key),
	).toBe(false);
});
it("rejects changed nested author, process evidence, unsigned records, wrong keys and malformed proof", () => {
	const signed = signRuntimeRecallRecord(event, key);
	const forged = structuredClone(event.payload.sdk_event) as {
		payload: {
			snapshot: {
				messages: Array<{ metadata: { author: { actorId: string } } }>;
			};
		};
	};
	forged.payload.snapshot.messages[0].metadata.author.actorId = "jimmi";
	for (const payload of [
		{ ...signed.payload, sdk_event: forged },
		{ ...signed.payload, extra_process_exit: 0 },
		{
			...signed.payload,
			runtime_archive_proof: { version: 1, mac: "not-a-proof" },
		},
	])
		expect(verifyRuntimeRecallRecord({ ...signed, payload }, key)).toBe(false);
	expect(verifyRuntimeRecallRecord(event, key)).toBe(false);
	expect(verifyRuntimeRecallRecord(signed, Buffer.alloc(32, 8))).toBe(false);
});
it("validates encoded keys without echoing them", () => {
	expect(decodeRecallArchiveKey(key.toString("base64url"))).toEqual(key);
	expect(recallArchiveKeyId(key)).toHaveLength(64);
	for (const value of [
		"fixture-secret-must-not-echo",
		"",
		key.toString("base64"),
		Buffer.alloc(31).toString("base64url"),
	]) {
		const result = (() => {
			try {
				return decodeRecallArchiveKey(value);
			} catch (error) {
				return error;
			}
		})();
		expect(result).toBeInstanceOf(Error);
		expect(String(result)).toContain("Invalid runtime archive key");
		if (value) expect(String(result)).not.toContain(value);
	}
});
