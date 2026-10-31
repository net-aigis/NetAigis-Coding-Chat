import type { SessionLineage, SessionRuntimeRecordShape } from "@cline/shared";
import type { SessionSource, SessionStatus } from "./common";

export interface SessionMessageAuthor {
	readonly actorId: string;
	readonly clientId: string;
	readonly requestId: string;
	readonly receivedAt: string;
	readonly source: "hub-authenticated";
}

export interface SessionUsageMetadata {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalCost: number;
}

export interface SessionRef extends SessionLineage {
	sessionId: string;
}

export interface SessionRecord
	extends SessionRef,
		Omit<SessionRuntimeRecordShape, "source" | "status"> {
	source: SessionSource;
	status: SessionStatus;
}

export interface SessionHistoryMetadata extends Record<string, unknown> {
	title?: string;
	git?: {
		url?: string;
		branch?: string;
	};
	totalCost?: number;
	aggregatedAgentsCost?: number;
	usage?: SessionUsageMetadata;
	aggregateUsage?: SessionUsageMetadata;
	checkpoint?: {
		latest?: {
			ref?: string;
			createdAt?: number;
			runCount?: number;
		};
		history?: Array<{
			ref?: string;
			createdAt?: number;
			runCount?: number;
		}>;
	};
}

export interface SessionHistoryRecord extends Omit<SessionRecord, "metadata"> {
	metadata?: SessionHistoryMetadata;
}
