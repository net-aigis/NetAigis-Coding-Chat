import { AsyncLocalStorage } from "node:async_hooks";

// NETAIGIS_CONVERSATION_HEADER_V1
export const netaigisConversation =
    new AsyncLocalStorage<string | undefined>();

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
