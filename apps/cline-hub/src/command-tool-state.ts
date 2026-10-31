/** UI projection only; the runtime remains the process authority. */
import {
	type CommandExecution,
	extractCommandExecution,
	isCommandTool,
	projectCommandExecution,
	reconcileCommandExecution,
} from "@cline/shared";
import type { WebviewChatMessage, WebviewToolEvent } from "./webview-protocol";

export function commandPartState(
	execution: CommandExecution,
): "input-available" | "output-available" | "output-error" {
	if (execution.state === "completed") return "output-available";
	if (["running", "not_started"].includes(execution.state))
		return "input-available";
	return "output-error";
}
export function toolEventExecution(
	event: WebviewToolEvent | undefined,
	fallbackName?: string,
): CommandExecution | undefined {
	if (!isCommandTool(event?.toolName ?? fallbackName)) return undefined;
	return event?.execution && Array.isArray(event.execution.commands)
		? extractCommandExecution(
				event.execution.commands.map((execution) => ({ execution })),
			)
		: extractCommandExecution(event?.output);
}

export function reconcileBrowserCommandMessages(
	messages: WebviewChatMessage[],
	sessionId: string,
	journal: unknown,
	history = false,
): WebviewChatMessage[] {
	const project = (
		event: NonNullable<WebviewChatMessage["toolEvents"]>[number],
	) => {
		if (!isCommandTool(event.name)) return event;
		const execution = event.execution
			? reconcileCommandExecution(event.execution, sessionId, journal, history)
			: projectCommandExecution(
					event.output,
					sessionId,
					event.toolCallId,
					journal,
					history,
				);
		return { ...event, execution, state: commandPartState(execution) };
	};
	return messages.map((message) => ({
		...message,
		...(message.toolEvents
			? { toolEvents: message.toolEvents.map(project) }
			: {}),
		...(message.blocks
			? {
					blocks: message.blocks.map((block) =>
						block.type === "tool"
							? { ...block, toolEvent: project(block.toolEvent) }
							: block,
					),
				}
			: {}),
	}));
}
