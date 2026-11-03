/** Missing telemetry is unknown, never a measured zero. */
export function formatTurnSummary(
	finishReason: string,
	iterations: number,
	usage?: { inputTokens?: number; outputTokens?: number },
): string {
	const count = (value: number | undefined): string =>
		typeof value === "number" && Number.isFinite(value) && value >= 0
			? String(value)
			: "nicht gemeldet";
	return `Turn ended (${finishReason}) • iterations=${iterations} • input=${count(usage?.inputTokens)} output=${count(usage?.outputTokens)}`;
}
