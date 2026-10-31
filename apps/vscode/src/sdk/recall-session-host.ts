/** App transport for the shared reader of the existing TOTAL RECALL journal. */
import { TotalRecallSessionHost as CoreRecallReader, type ITelemetryService, type RecallConfiguration } from "@cline/core"
import { fetch } from "@/shared/net"

export type {
	SessionTakeoverResult,
	TotalRecallConversation,
	TotalRecallJournalEvent,
	TotalRecallSessionSnapshot,
} from "@cline/core"
export class TotalRecallSessionHost extends CoreRecallReader {
	constructor(configuration: () => Promise<RecallConfiguration | undefined>, telemetry?: ITelemetryService) {
		super(configuration, telemetry, fetch)
	}
}
