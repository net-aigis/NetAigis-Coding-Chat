/** Serializable writer state in the existing session metadata. No new store. */
export interface SessionWriterControl {
	version: 1;
	revision: number;
	writer?: { actorId: string; clientId: string; connectionId: string };
	lastChange?: {
		actorId: string;
		clientId: string;
		requestId: string;
		at: string;
	};
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export function parseSessionWriterControl(
	value: unknown,
): SessionWriterControl {
	if (value === undefined) return { version: 1, revision: 0 };
	const c = record(value),
		writer = record(c.writer);
	if (
		c.version !== 1 ||
		!Number.isSafeInteger(c.revision) ||
		Number(c.revision) < 0 ||
		(c.writer !== undefined &&
			(typeof writer.actorId !== "string" ||
				!writer.actorId ||
				typeof writer.clientId !== "string" ||
				!writer.clientId ||
				typeof writer.connectionId !== "string" ||
				!writer.connectionId))
	)
		throw new Error(
			"Stored session control is invalid; ownership was not reset",
		);
	return structuredClone(c) as unknown as SessionWriterControl;
}
