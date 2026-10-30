import type { ModelInfo, ToolResultContent } from "@cline/llms";
import {
	CHARS_PER_TOKEN,
	createImageAwareReplacer,
	ESTIMATED_TOKENS_PER_IMAGE,
	estimateTokens,
	type MessageWithMetadata,
} from "@cline/shared";

export { CHARS_PER_TOKEN, estimateTokens };

import type { CoreCompactionSummarizerConfig } from "../../types/config";
import type { ProviderConfig } from "../../types/provider-settings";
import { getUserRunSpan } from "../../session/user-run-messages";

export const DEFAULT_MAX_INPUT_TOKENS = 128_000;
/** Estimate the usable input share when only a context window is reported. */
export const CONTEXT_WINDOW_INPUT_RATIO = 0.9;
/** Compact once the transcript consumes this share of the usable input budget. */
export const COMPACTION_TRIGGER_RATIO = 0.9;
/**
 * Upper bound on how far the provider's actual input count may scale the
 * compaction budget down relative to the character-based estimate. Dense
 * content realistically tokenizes ~2-3x denser than the 3-chars-per-token
 * assumption; the cap stops a pathologically small estimate from collapsing
 * the budget and compacting every turn.
 */
export const MAX_INPUT_UNDERESTIMATE_FACTOR = 4;
export const DEFAULT_TARGET_RATIO = 0.7;
export const DEFAULT_PRESERVE_RECENT_TOKENS = 20_000;
// Headroom for the summarizer's output. Raised from 4096: models that reason
// by default can spend part of a tight budget on thinking and return no
// summary text at all, which skips compaction entirely. 8192 leaves room for a
// real summary even when some reasoning slips through.
export const DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS = 8_192;
export const TOOL_RESULT_CHAR_LIMIT = 2_000;
export const FILE_CONTENT_CHAR_LIMIT = 2_000;
export const MIN_TRUNCATED_MESSAGE_TOKENS = 8;

export interface FileOperationSummary {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface CompactionSummaryMetadata {
	kind: "compaction_summary";
	displayRole: "system";
	userRunSpan: number;
	summary: string;
	details: FileOperationSummary;
	tokensBefore: number;
	generatedAt: number;
	continuity?: CompactionContinuity;
}

/** Deterministic records inside the existing summary, never a second store. */
export interface CompactionContinuity {
	version: 1;
	requests: MessageWithMetadata[];
	toolObservations: Array<{
		toolUseId: string;
		query?: unknown;
		reportedSuccess?: boolean;
		execution?: Record<string, unknown>;
	}>;
}

function readContinuity(value: unknown): CompactionContinuity | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	if (
		record.version !== 1 ||
		!Array.isArray(record.requests) ||
		!Array.isArray(record.toolObservations)
	)
		return undefined;
	if (
		!record.requests.every(
			(message) =>
				message?.role === "user" && typeof message.content === "string",
		)
	)
		return undefined;
	if (
		!record.toolObservations.every(
			(item) => item && typeof item.toolUseId === "string",
		)
	)
		return undefined;
	return JSON.parse(JSON.stringify(record)) as CompactionContinuity;
}

export type EstimateMessageTokens = (message: MessageWithMetadata) => number;

function isPositiveFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Resolve the model's usable prompt budget. A reported input limit is
 * authoritative but cannot exceed the context window. When the model only
 * reports a context window, retain a conservative margin for request overhead.
 */
export function resolveEffectiveMaxInputTokens(
	input: Pick<ModelInfo, "maxInputTokens" | "contextWindow">,
): number | undefined {
	const contextWindow = isPositiveFiniteNumber(input.contextWindow)
		? input.contextWindow
		: undefined;
	const maxInputTokens = isPositiveFiniteNumber(input.maxInputTokens)
		? input.maxInputTokens
		: undefined;

	if (maxInputTokens !== undefined) {
		return contextWindow === undefined
			? maxInputTokens
			: Math.min(maxInputTokens, contextWindow);
	}

	return contextWindow === undefined
		? undefined
		: contextWindow * CONTEXT_WINDOW_INPUT_RATIO;
}

export function truncateText(text: string, limit: number): string {
	if (text.length <= limit) {
		return text;
	}
	return `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`;
}

export function resolveProviderMaxInputTokens(
	providerConfig: ProviderConfig,
): number | undefined {
	const modelInfoLimit = resolveEffectiveMaxInputTokens({
		maxInputTokens:
			providerConfig.maxInputTokens ?? providerConfig.modelInfo?.maxInputTokens,
		contextWindow: providerConfig.modelInfo?.contextWindow,
	});
	if (modelInfoLimit !== undefined) return modelInfoLimit;
	const knownModelInfo = providerConfig.knownModels?.[providerConfig.modelId];
	return resolveEffectiveMaxInputTokens({
		maxInputTokens: knownModelInfo?.maxInputTokens,
		contextWindow: knownModelInfo?.contextWindow,
	});
}

export function flattenToolResultContent(
	content: ToolResultContent["content"],
): string {
	const truncated = truncateToolResultContentForCompaction(content);
	if (typeof truncated === "string") {
		return truncated;
	}
	return truncated
		.map((block) => {
			switch (block.type) {
				case "text":
					return block.text;
				case "file":
					return `<file path="${block.path}">\n${block.content}\n</file>`;
				case "image":
					return `[image:${block.mediaType}]`;
				default:
					return "";
			}
		})
		.join("\n");
}

export function truncateToolResultContentForCompaction(
	content: ToolResultContent["content"],
): ToolResultContent["content"] {
	if (typeof content === "string") {
		return truncateText(content, TOOL_RESULT_CHAR_LIMIT);
	}
	return content.map((block) => {
		switch (block.type) {
			case "text":
				return {
					...block,
					text: truncateText(block.text, TOOL_RESULT_CHAR_LIMIT),
				};
			case "file":
				return {
					...block,
					content: truncateText(block.content, FILE_CONTENT_CHAR_LIMIT),
				};
			case "image":
				return block;
			default:
				return block;
		}
	});
}

export function formatToolInput(input: Record<string, unknown>): string {
	return Object.entries(input)
		.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
		.join(", ");
}

export function serializeMessage(message: MessageWithMetadata): string {
	if (typeof message.content === "string") {
		return `[${message.role === "user" ? "User" : "Bot"}]: ${message.content}`;
	}
	const lines: string[] = [];
	for (const block of message.content) {
		switch (block.type) {
			case "text":
				lines.push(
					`[${message.role === "user" ? "User" : "Bot"}]: ${block.text}`,
				);
				break;
			case "thinking":
				lines.push(`[Bot thinking]: ${truncateText(block.thinking, 2_000)}`);
				break;
			case "redacted_thinking":
				lines.push("[Bot thinking]: [redacted]");
				break;
			case "tool_use":
				lines.push(
					`[Bot tool calls]: ${block.name}(${formatToolInput(block.input)})`,
				);
				break;
			case "tool_result":
				lines.push(`[Tool result]: ${flattenToolResultContent(block.content)}`);
				break;
			case "file":
				lines.push(
					`[${message.role === "user" ? "User" : "Bot"} file ${block.path}]: ${truncateText(block.content, FILE_CONTENT_CHAR_LIMIT)}`,
				);
				break;
			case "image":
				lines.push(
					`[${message.role === "user" ? "User" : "Bot"} image]: ${block.mediaType}`,
				);
				break;
			case "media":
				lines.push(
					`[Bot generated ${block.media.modality}]: ${block.media.mediaType}`,
				);
				break;
		}
	}
	return lines.join("\n");
}

export function serializeConversation(messages: MessageWithMetadata[]): string {
	return messages.map(serializeMessage).join("\n\n").trim();
}

export function createTokenEstimator(): EstimateMessageTokens {
	const cache = new WeakMap<object, number>();
	return (message) => {
		const ref = message as unknown as object;
		const cached = cache.get(ref);
		if (typeof cached === "number") {
			return cached;
		}
		const { replacer, imageCount } = createImageAwareReplacer();
		let serialized: string;
		// Only trust imageCount() when the replacer-driven pass actually
		// finished; see the matching comment in estimateRequestInputTokens.
		let images = 0;
		try {
			serialized = JSON.stringify(message, replacer);
			images = imageCount();
		} catch {
			serialized = serializeMessage(message);
		}
		const value =
			estimateTokens(serialized.length) + images * ESTIMATED_TOKENS_PER_IMAGE;
		cache.set(ref, value);
		return value;
	};
}

export function isCompactionSummaryMessage(
	message: MessageWithMetadata,
): boolean {
	return (
		(message.metadata as { kind?: string } | undefined)?.kind ===
		"compaction_summary"
	);
}

export function getCompactionSummaryMetadata(
	message: MessageWithMetadata,
): CompactionSummaryMetadata | undefined {
	if (!isCompactionSummaryMessage(message)) {
		return undefined;
	}
	const metadata = message.metadata as Record<string, unknown> | undefined;
	if (!metadata) {
		return undefined;
	}
	const details = metadata.details as Record<string, unknown> | undefined;
	const continuity = readContinuity(metadata.continuity);
	return {
		kind: "compaction_summary",
		displayRole: "system",
		userRunSpan:
			typeof metadata.userRunSpan === "number" &&
			Number.isInteger(metadata.userRunSpan) &&
			metadata.userRunSpan >= 0
				? metadata.userRunSpan
				: 1,
		summary: String(metadata.summary ?? ""),
		details: {
			readFiles: Array.isArray(details?.readFiles)
				? details.readFiles
						.filter((value): value is string => typeof value === "string")
						.map((value) => value.trim())
						.filter((value) => value.length > 0)
				: [],
			modifiedFiles: Array.isArray(details?.modifiedFiles)
				? details.modifiedFiles
						.filter((value): value is string => typeof value === "string")
						.map((value) => value.trim())
						.filter((value) => value.length > 0)
				: [],
		},
		tokensBefore: Number(metadata.tokensBefore ?? 0),
		generatedAt: Number(metadata.generatedAt ?? 0),
		...(continuity ? { continuity } : {}),
	};
}

export function collectCompactionContinuity(
	messages: readonly MessageWithMetadata[],
): CompactionContinuity {
	const result: CompactionContinuity = {
		version: 1,
		requests: [],
		toolObservations: [],
	};
	const commandIds = new Set<string>();
	for (const message of messages) {
		// A projection notice is rebuilt from canonical history at the outer
		// boundary. Folding it again would recursively duplicate its records.
		if (message.metadata?.kind === "task_continuity") continue;
		const previous = readContinuity(message.metadata?.continuity);
		if (previous) {
			result.requests.push(...previous.requests);
			result.toolObservations.push(...previous.toolObservations);
			continue;
		}
		if (
			isTurnStartMessage(message) &&
			getUserRunSpan(message) > 0 &&
			message.metadata?.displayRole !== "system"
		) {
			// Keep literal text and its existing authorship/envelope. Old media
			// payloads stay in canonical history, not duplicated into summaries.
			const text =
				typeof message.content === "string"
					? message.content
					: message.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n");
			if (text) result.requests.push({ ...message, content: text });
		}
		if (!Array.isArray(message.content)) continue;
		for (const block of message.content) {
			if (block.type === "tool_use" && block.name === "run_commands")
				commandIds.add(block.id);
			if (
				block.type !== "tool_result" ||
				(!commandIds.has(block.tool_use_id) && block.name !== "run_commands")
			)
				continue;
			const texts =
				typeof block.content === "string"
					? [block.content]
					: block.content
							.filter((part) => part.type === "text")
							.map((part) => part.text);
			for (const text of texts) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(text);
				} catch {
					continue;
				}
				for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
					if (!item || typeof item !== "object") continue;
					const record = item as Record<string, unknown>;
					if (typeof record.success !== "boolean" && !record.execution)
						continue;
					result.toolObservations.push({
						toolUseId: block.tool_use_id,
						...(record.query !== undefined ? { query: record.query } : {}),
						...(typeof record.success === "boolean"
							? { reportedSuccess: record.success }
							: {}),
						...(record.execution &&
						typeof record.execution === "object" &&
						!Array.isArray(record.execution)
							? { execution: record.execution as Record<string, unknown> }
							: {}),
					});
				}
			}
		}
	}
	return JSON.parse(JSON.stringify(result)) as CompactionContinuity;
}

function renderContinuity(
	continuity: CompactionContinuity | undefined,
): string {
	if (!continuity) return "";
	return `\n\n## Recorded task continuity\nThese records come from stored messages, independently of the generated summary. User instructions remain verbatim and chronological. Recorded tool outcomes are historical observations, not proof of current liveness. An unknown outcome must not be treated as completed. Follow these requests and verified evidence; do not invent a resumption point.\n\n${continuity.requests.map(({ content, ...source }) => `Source: ${JSON.stringify(source)}\n${content}`).join("\n\n")}\n\nRecorded command outcomes:\n${JSON.stringify(continuity.toolObservations)}`;
}

/** Rebuild the provider projection from canonical evidence on each turn. */
export function withCompactionContinuity(
	messages: readonly MessageWithMetadata[],
	canonicalMessages: readonly MessageWithMetadata[],
	maxInputTokens?: number,
): MessageWithMetadata[] {
	const continuity = collectCompactionContinuity(canonicalMessages);
	const projection = messages.filter(
		(message) => message.metadata?.kind !== "task_continuity",
	);
	// A new summary may already render these exact records. Trust its
	// records for deduplication only while that literal rendering survives;
	// retained metadata alone cannot prove that a truncated body contains it.
	const embedded = projection.flatMap((message) => {
		const records = readContinuity(message.metadata?.continuity);
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("\n");
		return records && text.includes(renderContinuity(records).trim())
			? [records]
			: [];
	});
	// Consume matches individually: identical repeated requests must retain
	// their occurrence count. Different metadata keeps the source record.
	const visibleRequests = projection
		.filter(isTurnStartMessage)
		.map((message) => ({
			...message,
			content:
				typeof message.content === "string"
					? message.content
					: message.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n"),
		}));
	visibleRequests.push(
		...embedded
			.flatMap((records) => records.requests)
			.map((message) => ({ ...message, content: String(message.content) })),
	);
	const key = (message: MessageWithMetadata) =>
		JSON.stringify([
			message.content,
			message.agent,
			message.sessionId,
			message.metadata,
		]);
	continuity.requests = continuity.requests.filter((request) => {
		const index = visibleRequests.findIndex(
			(message) => key(message) === key(request),
		);
		if (index < 0) return true;
		visibleRequests.splice(index, 1);
		return false;
	});
	const visibleObservations = [
		...embedded.flatMap((records) => records.toolObservations),
		...collectCompactionContinuity(
			projection.filter((message) => !message.metadata?.continuity),
		).toolObservations,
	];
	continuity.toolObservations = continuity.toolObservations.filter(
		(observation) => {
			const index = visibleObservations.findIndex(
				(visible) => JSON.stringify(visible) === JSON.stringify(observation),
			);
			if (index < 0) return true;
			visibleObservations.splice(index, 1);
			return false;
		},
	);
	if (!continuity.requests.length && !continuity.toolObservations.length)
		return projection;
	const notice: MessageWithMetadata = {
		role: "user",
		content: renderContinuity(continuity).trim(),
		metadata: {
			kind: "task_continuity",
			displayRole: "system",
			userRunSpan: 0,
			continuity,
		},
	};
	if (
		maxInputTokens !== undefined &&
		createTokenEstimator()(notice) > maxInputTokens
	) {
		throw new Error(
			"Recorded user instructions and process states exceed the model input budget; canonical history is preserved and instructions were not silently truncated.",
		);
	}
	return [notice, ...projection];
}

export function isToolResultOnlyUserMessage(
	message: MessageWithMetadata,
): boolean {
	if (message.role !== "user" || !Array.isArray(message.content)) {
		return false;
	}
	return (
		message.content.length > 0 &&
		message.content.every((block) => block.type === "tool_result")
	);
}

export function isTurnStartMessage(message: MessageWithMetadata): boolean {
	return (
		message.role === "user" &&
		message.metadata?.userRunSpan !== 0 &&
		!isToolResultOnlyUserMessage(message) &&
		!isCompactionSummaryMessage(message)
	);
}

export function findFirstUserMessageIndex(
	messages: MessageWithMetadata[],
): number {
	for (let index = 0; index < messages.length; index += 1) {
		if (isTurnStartMessage(messages[index])) {
			return index;
		}
	}
	return -1;
}

export function findLastTurnStartIndex(
	messages: MessageWithMetadata[],
): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (isTurnStartMessage(messages[index])) {
			return index;
		}
	}
	return 0;
}

export function findLastAssistantIndex(
	messages: MessageWithMetadata[],
): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].role === "assistant") {
			return index;
		}
	}
	return -1;
}

export function findLatestSummaryIndex(
	messages: MessageWithMetadata[],
): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (isCompactionSummaryMessage(messages[index])) {
			return index;
		}
	}
	return -1;
}

/**
 * A cut boundary is safe when starting the preserved tail there cannot
 * orphan half of a tool_use/tool_result pair. Typed user turns qualify,
 * and so do assistant messages: an assistant's tool_use keeps its results
 * in the user message that follows it, so both halves stay on the same
 * side of the cut. A tool_result-only user message is never safe — its
 * matching tool_use sits in the preceding assistant message and would be
 * folded into the summary, leaving an orphaned tool_result the provider
 * rejects.
 */
function isSafeCutBoundary(message: MessageWithMetadata): boolean {
	return message.role === "assistant" || isTurnStartMessage(message);
}

export function findCutIndex(
	messages: MessageWithMetadata[],
	preserveRecentTokens: number,
	estimateMessageTokens: EstimateMessageTokens,
): number {
	let total = 0;
	let candidate = messages.length;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		total += estimateMessageTokens(messages[index]);
		candidate = index;
		if (total >= preserveRecentTokens) {
			break;
		}
	}

	if (candidate <= 0) {
		return 0;
	}

	// Never summarize away the latest typed user prompt: when one exists
	// past index 0, the cut stays at or before it so that whole turn
	// survives verbatim. Transcripts without a later typed turn (a single
	// task followed by one long tool loop, or a projection that starts
	// with a compaction summary) still cut at the token-budget candidate.
	const lastTurnStartIndex = findLastTurnStartIndex(messages);
	let cut =
		lastTurnStartIndex > 0
			? Math.min(candidate, lastTurnStartIndex)
			: candidate;
	while (cut > 0 && !isSafeCutBoundary(messages[cut])) {
		cut -= 1;
	}
	return cut;
}

export function collectPaths(value: unknown): string[] {
	if (typeof value === "string" && value.trim().length > 0) {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item) => collectPaths(item));
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const paths: string[] = [];
		for (const key of [
			"path",
			"file_path",
			"target_file",
			"new_file_path",
			"old_file_path",
		]) {
			paths.push(...collectPaths(record[key]));
		}
		if (Array.isArray(record.files)) {
			for (const item of record.files) {
				if (item && typeof item === "object") {
					paths.push(...collectPaths((item as Record<string, unknown>).path));
				}
			}
		}
		if (Array.isArray(record.file_paths)) {
			paths.push(...collectPaths(record.file_paths));
		}
		return paths;
	}
	return [];
}

export function mergeUnique(base: string[], next: Iterable<string>): string[] {
	const seen = new Set(base);
	for (const value of next) {
		const trimmed = value.trim();
		if (!trimmed) {
			continue;
		}
		seen.add(trimmed);
	}
	return [...seen].sort((a, b) => a.localeCompare(b));
}

export function extractFileOps(
	messages: MessageWithMetadata[],
): FileOperationSummary {
	let readFiles: string[] = [];
	let modifiedFiles: string[] = [];
	for (const message of messages) {
		const summaryMetadata = getCompactionSummaryMetadata(message);
		if (summaryMetadata) {
			readFiles = mergeUnique(readFiles, summaryMetadata.details.readFiles);
			modifiedFiles = mergeUnique(
				modifiedFiles,
				summaryMetadata.details.modifiedFiles,
			);
			continue;
		}
		if (!Array.isArray(message.content)) {
			continue;
		}
		for (const block of message.content) {
			if (block.type === "file") {
				readFiles = mergeUnique(readFiles, [block.path]);
				continue;
			}
			if (block.type !== "tool_use") {
				continue;
			}
			const paths = collectPaths(block.input);
			if (block.name === "read_files") {
				readFiles = mergeUnique(readFiles, paths);
				continue;
			}
			if (block.name === "editor" || block.name === "apply_patch") {
				modifiedFiles = mergeUnique(modifiedFiles, paths);
			}
		}
	}
	return { readFiles, modifiedFiles };
}

/** Commands longer than this are truncated in dropped-work summaries. */
export const COMMAND_SUMMARY_CHAR_LIMIT = 100;

/**
 * Compact record of the tool work performed inside a span of dropped
 * messages: which files were read and edited (with line ranges when
 * known) and which commands ran.
 */
export interface ToolActivitySummary {
	readFiles: string[];
	editedFiles: string[];
	commands: string[];
	toolObservations?: CompactionContinuity["toolObservations"];
}

export function hasToolActivity(summary: ToolActivitySummary): boolean {
	return (
		summary.readFiles.length > 0 ||
		summary.editedFiles.length > 0 ||
		summary.commands.length > 0 ||
		(summary.toolObservations?.length ?? 0) > 0
	);
}

function pushUniqueEntry(list: string[], value: string): void {
	const trimmed = value.trim();
	if (trimmed && !list.includes(trimmed)) {
		list.push(trimmed);
	}
}

function truncateCommandForSummary(command: string): string {
	if (command.length <= COMMAND_SUMMARY_CHAR_LIMIT) {
		return command;
	}
	return `${command.slice(0, COMMAND_SUMMARY_CHAR_LIMIT)}...`;
}

function formatReadFileEntry(
	record: Record<string, unknown>,
): string | undefined {
	const path = typeof record.path === "string" ? record.path.trim() : "";
	if (!path) {
		return undefined;
	}
	const start = record.start_line;
	const end = record.end_line;
	if (typeof start === "number" && typeof end === "number") {
		return `${path}:${start}-${end}`;
	}
	return path;
}

/**
 * Pull the edited line range out of an editor tool result. Editor results
 * embed a numbered diff (`-467: ...` / `+467: ...`), usually inside a
 * JSON-encoded payload's `result` field; the range is the min/max line
 * number seen. Returns undefined when no diff line numbers are found.
 */
function extractDiffLineRange(
	content: ToolResultContent["content"],
): { start: number; end: number } | undefined {
	let text =
		typeof content === "string"
			? content
			: content
					.map((block) =>
						block.type === "text"
							? block.text
							: block.type === "file"
								? block.content
								: "",
					)
					.join("\n");
	try {
		const parsed = JSON.parse(text) as { result?: unknown };
		if (parsed && typeof parsed.result === "string") {
			text = parsed.result;
		}
	} catch {
		// Not JSON-encoded; scan the raw text.
	}
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;
	for (const match of text.matchAll(/(?:^|\n|\\n)[-+](\d+): /g)) {
		const line = Number(match[1]);
		if (!Number.isFinite(line)) {
			continue;
		}
		start = Math.min(start, line);
		end = Math.max(end, line);
	}
	return start <= end ? { start, end } : undefined;
}

/**
 * Summarize the tool work inside a span of messages that compaction is
 * dropping. Read ranges come from read_files inputs; edited ranges come
 * from the numbered diff in the matching editor result when present.
 */
export function summarizeToolActivity(
	messages: MessageWithMetadata[],
): ToolActivitySummary {
	const readFiles: string[] = [];
	const editedFiles: string[] = [];
	const commands: string[] = [];
	const editorPathsByToolUseId = new Map<string, string>();
	for (const message of messages) {
		if (!Array.isArray(message.content)) {
			continue;
		}
		for (const block of message.content) {
			if (block.type === "tool_use") {
				const input = (block.input ?? {}) as Record<string, unknown>;
				if (block.name === "read_files") {
					if (Array.isArray(input.files)) {
						for (const file of input.files) {
							if (file && typeof file === "object") {
								const entry = formatReadFileEntry(
									file as Record<string, unknown>,
								);
								if (entry) {
									pushUniqueEntry(readFiles, entry);
								}
							}
						}
					} else {
						for (const path of collectPaths(input)) {
							pushUniqueEntry(readFiles, path);
						}
					}
					continue;
				}
				if (block.name === "editor" || block.name === "apply_patch") {
					const path = collectPaths(input)[0];
					if (path) {
						editorPathsByToolUseId.set(block.id, path);
					}
					continue;
				}
				if (block.name === "run_commands") {
					const commandList = Array.isArray(input.commands)
						? input.commands
						: [];
					for (const command of commandList) {
						if (typeof command === "string" && command.trim()) {
							pushUniqueEntry(
								commands,
								truncateCommandForSummary(command.trim()),
							);
						}
					}
				}
				continue;
			}
			if (block.type === "tool_result") {
				const path = editorPathsByToolUseId.get(block.tool_use_id);
				if (!path) {
					continue;
				}
				const range = extractDiffLineRange(block.content);
				pushUniqueEntry(
					editedFiles,
					range ? `${path}:${range.start}-${range.end}` : path,
				);
				editorPathsByToolUseId.delete(block.tool_use_id);
			}
		}
	}
	// Editor calls whose results fell outside the span still count as edits.
	for (const path of editorPathsByToolUseId.values()) {
		pushUniqueEntry(editedFiles, path);
	}
	const toolObservations =
		collectCompactionContinuity(messages).toolObservations;
	return {
		readFiles,
		editedFiles,
		commands,
		...(toolObservations.length ? { toolObservations } : {}),
	};
}

export function formatToolActivitySummary(
	summary: ToolActivitySummary,
): string {
	return [
		`Files read:\n${summary.readFiles.join("\n")}`,
		`Files edited:\n${summary.editedFiles.join("\n")}`,
		`Commands ran:\n${summary.commands.join("\n")}`,
		...(summary.toolObservations?.length
			? [
					`Recorded command outcomes (historical; unknown is not completed):\n${JSON.stringify(summary.toolObservations)}`,
				]
			: []),
	].join("\n\n");
}

export function renderFilesSection(fileOps: FileOperationSummary): string {
	const readLines =
		fileOps.readFiles.length > 0
			? fileOps.readFiles.map((path) => `- ${path}`).join("\n")
			: "- none";
	const modifiedLines =
		fileOps.modifiedFiles.length > 0
			? fileOps.modifiedFiles.map((path) => `- ${path}`).join("\n")
			: "- none";
	return `## Files\nRead:\n${readLines}\nModified:\n${modifiedLines}`;
}

export function ensureFilesSection(
	summary: string,
	fileOps: FileOperationSummary,
): string {
	if (/^## Files$/im.test(summary)) {
		return summary.trim();
	}
	return `${summary.trim()}\n\n${renderFilesSection(fileOps)}`.trim();
}

export function buildSummaryRequest(options: {
	previousSummary?: string;
	conversationText: string;
	fileOps: FileOperationSummary;
}): string {
	const parts: string[] = [
		`Summarize this session for continuation. Be concise and factual.

## Goal
One sentence: what is being built or fixed.

## State
- Done: completed steps
- In Progress: current work
- Blocked: blockers or open questions

## Highlights
Key technical choices or notable findings (omit if none).

## Next
Immediate next steps.

## Files
Read: ${options.fileOps.readFiles.join(", ") || "none"}
Edited: ${options.fileOps.modifiedFiles.join(", ") || "none"}`,
	];

	if (options.previousSummary?.trim()) {
		parts.push(`Previous summary:\n${options.previousSummary.trim()}`);
	}

	parts.push(`Conversation:\n${options.conversationText || "(empty)"}`);

	return parts.join("\n\n");
}

/**
 * The summarizer output budget is a cap, not a target: reasoning models need
 * headroom beyond their thinking output or no summary text ever arrives and
 * compaction is skipped. An explicit configuration wins as-is; otherwise the
 * default applies, with model metadata (`maxTokens` is reported capability,
 * not a product default) only ever lowering it.
 */
function resolveSummaryMaxOutputTokens(config: ProviderConfig): number {
	if (isPositiveFiniteNumber(config.maxOutputTokens)) {
		return Math.floor(config.maxOutputTokens);
	}
	const modelMaxTokens =
		config.modelInfo?.maxTokens ??
		config.knownModels?.[config.modelId]?.maxTokens;
	if (isPositiveFiniteNumber(modelMaxTokens)) {
		return Math.min(
			DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS,
			Math.floor(modelMaxTokens),
		);
	}
	return DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS;
}

export function resolveSummarizerConfig(options: {
	activeProviderConfig: ProviderConfig;
	summarizer?: CoreCompactionSummarizerConfig;
}): ProviderConfig {
	const summarizer = options.summarizer;
	const withSummarizerDefaults = (config: ProviderConfig): ProviderConfig => {
		if (config.providerId === "openai-codex") {
			const { maxOutputTokens: _maxOutputTokens, ...rest } = config;
			return {
				...rest,
				thinking: false,
			};
		}
		return {
			...config,
			maxOutputTokens: resolveSummaryMaxOutputTokens(config),
			thinking: false,
		};
	};
	if (!summarizer) {
		return withSummarizerDefaults(options.activeProviderConfig);
	}
	const baseProviderConfig =
		summarizer.providerConfig?.providerId === summarizer.providerId
			? summarizer.providerConfig
			: undefined;
	return withSummarizerDefaults({
		...(baseProviderConfig ?? {}),
		providerId: summarizer.providerId,
		modelId: summarizer.modelId,
		apiKey: summarizer.apiKey ?? baseProviderConfig?.apiKey,
		baseUrl: summarizer.baseUrl ?? baseProviderConfig?.baseUrl,
		headers: summarizer.headers ?? baseProviderConfig?.headers,
		modelInfo: summarizer.modelInfo ?? baseProviderConfig?.modelInfo,
		knownModels: summarizer.knownModels ?? baseProviderConfig?.knownModels,
		maxOutputTokens:
			summarizer.maxOutputTokens ?? baseProviderConfig?.maxOutputTokens,
	});
}

export function buildSummaryMessage(options: {
	summary: string;
	fileOps: FileOperationSummary;
	tokensBefore: number;
	userRunSpan: number;
	continuity?: CompactionContinuity;
}): MessageWithMetadata {
	return {
		role: "user",
		content: [
			{
				type: "text",
				text: `Context summary:\n\n${options.summary}${renderContinuity(options.continuity)}`,
			},
		],
		metadata: {
			kind: "compaction_summary",
			displayRole: "system",
			userRunSpan: options.userRunSpan,
			summary: options.summary,
			details: options.fileOps,
			tokensBefore: options.tokensBefore,
			generatedAt: Date.now(),
			...(options.continuity ? { continuity: options.continuity } : {}),
		} satisfies CompactionSummaryMetadata,
	};
}
