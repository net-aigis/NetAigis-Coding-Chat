/** Process observations shared by resume admission and authenticated handover. */
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
/** Explicit unknown/running observations and unfinished tool calls block a handover. */
export function hasUnresolvedCommandObservation(
	messages: readonly unknown[],
): boolean {
	const pending = new Map<string, string>();
	for (const raw of messages) {
		const m = record(raw);
		if (!Array.isArray(m.content)) continue;
		for (const rawPart of m.content) {
			const part = record(rawPart);
			const callId = part.id ?? part.toolCallId;
			if (
				(part.type === "tool_use" || part.type === "tool-call") &&
				typeof callId === "string"
			)
				pending.set(callId, String(part.name ?? part.toolName));
			if (part.type !== "tool_result" && part.type !== "tool-result") continue;
			const id = String(part.tool_use_id ?? part.toolCallId ?? ""),
				name = String(part.name ?? part.toolName ?? pending.get(id) ?? "");
			pending.delete(id);
			if (!["run_commands", "bash", "execute_command"].includes(name)) continue;
			let content = part.content ?? part.output ?? part.result;
			if (
				Array.isArray(content) &&
				content.every((part) => record(part).type === "text")
			)
				content = content.map((p) => record(p).text ?? "").join("");
			if (typeof content === "string") {
				try {
					content = JSON.parse(content);
				} catch {
					continue;
				}
			}
			const output = record(content),
				results = Array.isArray(content)
					? content
					: Array.isArray(output.results)
						? output.results
						: [output];
			for (const result of results) {
				const execution = record(record(result).execution);
				if (
					execution.state === "unknown" ||
					execution.state === "running" ||
					execution.observationFailed === true ||
					(["aborted", "timed_out"].includes(String(execution.state)) &&
						execution.terminationConfirmed !== true) ||
					(execution.state === "completed" &&
						!Number.isInteger(record(result).exitCode ?? execution.exitCode))
				)
					return true;
			}
		}
	}
	return pending.size > 0;
}
