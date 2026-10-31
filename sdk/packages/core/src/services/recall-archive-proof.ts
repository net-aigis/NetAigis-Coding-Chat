/** Producer authentication inside the existing Recall payload; keys never enter the journal. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { RecallEvent } from "./recall-outbox";

const FIELD = "runtime_archive_proof";
export function copyRecallArchiveKey(key: Uint8Array): Buffer {
	if (!(key instanceof Uint8Array) || key.byteLength !== 32)
		throw new Error("Invalid runtime archive key; key withheld");
	return Buffer.from(key);
}
export function decodeRecallArchiveKey(encoded: string): Buffer {
	if (!/^[A-Za-z0-9_-]{43}$/.test(encoded))
		throw new Error("Invalid runtime archive key; key withheld");
	const key = copyRecallArchiveKey(Buffer.from(encoded, "base64url"));
	if (key.toString("base64url") !== encoded)
		throw new Error("Invalid runtime archive key; key withheld");
	return key;
}
export function recallArchiveKeyId(key: Uint8Array): string {
	return createHash("sha256").update(copyRecallArchiveKey(key)).digest("hex");
}
function canonical(value: unknown): unknown {
	if (value === null || typeof value === "string" || typeof value === "boolean")
		return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [
					key,
					canonical((value as Record<string, unknown>)[key]),
				]),
		);
	throw new Error("Runtime archive contains invalid JSON");
}
function body(record: RecallEvent): string {
	const payload = { ...record.payload };
	delete payload[FIELD];
	return JSON.stringify(
		canonical({
			version: 1,
			event_id: record.event_id,
			project_id: record.project_id,
			conversation_id: record.conversation_id,
			actor_id: record.actor_id,
			kind: record.kind,
			payload,
		}),
	);
}
export function signRuntimeRecallRecord(
	record: RecallEvent,
	key: Uint8Array,
): RecallEvent {
	const secret = copyRecallArchiveKey(key);
	const mac = createHmac("sha256", secret).update(body(record)).digest("hex");
	return {
		...record,
		payload: {
			...record.payload,
			[FIELD]: {
				version: 1,
				algorithm: "HMAC-SHA256",
				key_id: recallArchiveKeyId(secret),
				mac,
			},
		},
	};
}
export function verifyRuntimeRecallRecord(
	value: unknown,
	key: Uint8Array,
): boolean {
	try {
		if (!value || typeof value !== "object" || Array.isArray(value))
			return false;
		const record = value as RecallEvent;
		if (
			![
				record.event_id,
				record.project_id,
				record.conversation_id,
				record.actor_id,
				record.kind,
			].every((field) => typeof field === "string" && field.length > 0) ||
			!record.payload ||
			typeof record.payload !== "object" ||
			Array.isArray(record.payload)
		)
			return false;
		const proof = record.payload?.[FIELD] as
			| Record<string, unknown>
			| undefined;
		if (
			!proof ||
			proof.version !== 1 ||
			proof.algorithm !== "HMAC-SHA256" ||
			proof.key_id !== recallArchiveKeyId(key) ||
			typeof proof.mac !== "string" ||
			!/^[0-9a-f]{64}$/.test(proof.mac)
		)
			return false;
		const expected = createHmac("sha256", copyRecallArchiveKey(key))
			.update(body(record))
			.digest();
		return timingSafeEqual(expected, Buffer.from(proof.mac, "hex"));
	} catch {
		return false;
	}
}
