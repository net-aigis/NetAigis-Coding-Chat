/** Archive the owning runtime's events; client presence and UI subscriptions are irrelevant. */
import { join } from "node:path";
import { resolveClineDir } from "@cline/shared/storage";
import { parseSessionWriterControl } from "../hub/session-control";
import type { RuntimeHost } from "../runtime/host/runtime-host";
import type { CoreSessionEvent } from "../types/events";
import {
	DurableRecallOutbox,
	type RecallConfiguration,
	type RecallFetch,
} from "./recall-outbox";

export interface RuntimeRecallArchiveOptions {
	getConfiguration: () => Promise<RecallConfiguration | undefined>;
	/** Recall API keys, independent of the Hub's own login tokens. No key reuse is inferred. */
	actorTokens?: Readonly<Record<string, string>>;
	directory?: string;
	fetch?: RecallFetch;
}
export class RuntimeRecallArchive {
	private readonly queue: DurableRecallOutbox;
	private captures = Promise.resolve();
	private readonly writers = new Map<string, string>();
	private stopReplay?: () => void;
	private active = false;
	private pendingCaptures = 0;
	private captureFailed = false;
	private deliveryPending = false;
	constructor(
		private readonly runtime: RuntimeHost,
		private readonly options: RuntimeRecallArchiveOptions,
	) {
		this.queue = new DurableRecallOutbox(
			options.directory ?? join(resolveClineDir(), "netaigis-recall-outbox"),
			options.fetch,
			(actor) => this.configuration(actor),
		);
	}
	private async configuration(
		actor?: string,
	): Promise<RecallConfiguration | undefined> {
		const config = await this.options.getConfiguration();
		if (!config?.enabled) return undefined;
		if (!actor || actor === config.actor) return { ...config };
		// Keep the true actor even while its key is unavailable. Never submit with another actor's key.
		return { ...config, actor, token: this.options.actorTokens?.[actor] ?? "" };
	}
	async start(): Promise<void> {
		const config = await this.configuration();
		if (!config) return;
		const url = new URL(config.baseUrl);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			!config.actor ||
			!config.project ||
			!config.token
		)
			throw new Error("Invalid runtime Recall configuration");
		this.active = true;
		this.stopReplay = this.queue.startRecallOutbox(() => this.configuration());
	}
	observe(event: CoreSessionEvent): void {
		if (!this.active) return;
		try {
			this.capture(event);
		} catch {
			this.captureFailed = true;
		}
	}
	private capture(event: CoreSessionEvent): void {
		const copied = structuredClone(event),
			id = copied.payload.sessionId;
		if (copied.type === "session_snapshot") {
			const actor = parseSessionWriterControl(
				copied.payload.snapshot.metadata?.sharedSessionControl,
			).writer?.actorId;
			if (actor) this.writers.set(id, actor);
		}
		const actor = this.writers.get(id);
		// Read immediately, before another turn can replace the live transcript. Do not mutate the broadcast event.
		const liveRead =
			copied.type === "session_snapshot"
				? this.runtime.readLiveSessionMessages?.(id)
				: undefined;
		const captured =
			copied.type === "session_snapshot"
				? (
						liveRead ?? Promise.reject(new Error("Live transcript unavailable"))
					).then((messages) => ({
						...copied,
						payload: {
							...copied.payload,
							snapshot: {
								...copied.payload.snapshot,
								messages: structuredClone(messages),
							},
						},
					}))
				: Promise.resolve(copied);
		// Observe rejections immediately while preserving event order in the serialization queue.
		const observation = captured.then(
			(value) => ({ value }),
			() => ({ value: copied, incomplete: true }),
		);
		const configuration = this.configuration(actor).then(
			(value) => ({ value }),
			() => ({ value: undefined }),
		);
		this.pendingCaptures++;
		this.captures = this.captures
			.then(async () => {
				const [capture, configurationResult] = await Promise.all([
					observation,
					configuration,
				]);
				const config = configurationResult.value;
				if (!config) {
					this.captureFailed = true;
					return;
				}
				if ("incomplete" in capture) this.captureFailed = true;
				await this.queue.archiveSdkEvent(capture.value, config, {
					deferDelivery: true,
				});
				void this.configuration()
					.then((base) =>
						this.queue.drainRecallOutbox(base, { respectBackoff: true }),
					)
					.then(
						(result) => {
							this.deliveryPending = Boolean(result.blocked);
						},
						() => {
							this.deliveryPending = true;
						},
					);
			})
			.catch(() => {
				this.captureFailed = true;
			})
			.finally(() => {
				this.pendingCaptures--;
			});
	}
	status() {
		const lastFailure = this.captureFailed
			? "capture_failed"
			: this.deliveryPending
				? "delivery_pending"
				: undefined;
		return {
			configured: this.active,
			pendingCaptures: this.pendingCaptures,
			...(lastFailure ? { lastFailure } : {}),
		};
	}
	async flush(): Promise<void> {
		let captures: Promise<void>;
		do {
			captures = this.captures;
			await captures;
		} while (captures !== this.captures);
		await this.queue.flushRecallOutboxWrites();
	}
	async stop(): Promise<void> {
		this.active = false;
		this.stopReplay?.();
		this.stopReplay = undefined;
		await this.flush();
	}
}
