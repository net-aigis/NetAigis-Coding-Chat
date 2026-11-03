import { AsyncLocalStorage } from "node:async_hooks";

// NETAIGIS_CONVERSATION_HEADER_V1
export const netaigisConversation = new AsyncLocalStorage<string | undefined>();

export function netaigisConversationId(
	metadata: Record<string, unknown> | undefined,
): string | undefined {
	for (const key of ["sessionId", "conversationId"]) {
		const value = metadata?.[key];
		if (
			typeof value === "string" &&
			value.trim().length > 0 &&
			!/[\r\n]/.test(value)
		) {
			return value;
		}
	}
	return undefined;
}

// Trusted host provenance is separate from model request metadata and prompts.
const actorContext = new AsyncLocalStorage<string | undefined>();
export function withNetaigisActor<T>(
	actorId: string | undefined,
	operation: () => T,
): T {
	if (
		actorId !== undefined &&
		(!actorId || actorId.trim() !== actorId || /[^\x20-\x7e]/.test(actorId))
	)
		throw new Error("Invalid authenticated actor header value");
	return actorContext.run(actorId, operation);
}
export function getNetaigisActor(): string | undefined {
	return actorContext.getStore();
}

// Canonical session binding, supplied by the host; never inferred from prompts.
const projectContext = new AsyncLocalStorage<string | undefined>();
export function withNetaigisProject<T>(
	projectId: string | undefined,
	operation: () => T,
): T {
	return projectContext.run(projectId, operation);
}
export function getNetaigisProject(): string | undefined {
	return projectContext.getStore();
}
