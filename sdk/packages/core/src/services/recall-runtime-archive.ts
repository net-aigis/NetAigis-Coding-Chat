/** Archive the owning runtime's events; client presence and UI subscriptions are irrelevant. */
import { join } from "node:path";
import { resolveClineDir } from "@cline/shared/storage";
import { parseSessionWriterControl } from "../hub/session-control";
import type { RuntimeHost } from "../runtime/host/runtime-host";
import { createCoreSessionSnapshot } from "../session/session-snapshot";
import type { CoreSessionEvent } from "../types/events";
import {
	copyRecallArchiveKey,
	recallArchiveKeyId,
} from "./recall-archive-proof";
import {
	DurableRecallOutbox,
	type RecallConfiguration,
	type RecallDeliveryConfiguration,
	type RecallFetch,
} from "./recall-outbox";
import { TotalRecallSessionHost } from "./recall-session-reader";
import { readSessionRecallProject } from "./recall-project";

export interface RuntimeRecallArchiveOptions {
	/** Runtime-only producer key; independent of actor/API/login credentials. */
	archiveSigningKey?: Uint8Array;
	getConfiguration: () => Promise<RecallConfiguration | undefined>;
	/** Session-scoped deployment has credentials but no universal project. */
	getConnection?: () => Promise<
		Omit<RecallConfiguration, "project"> | undefined
	>;
	/** Recall API keys, independent of the Hub's own login tokens. No key reuse is inferred. */
	actorTokens?: Readonly<Record<string, string>>;
	directory?: string;
	fetch?: RecallFetch;
}
export class RuntimeRecallArchive {
	private readonly queue: DurableRecallOutbox;
	private readonly signingKey?: Buffer;
	private captures = Promise.resolve();
	private readonly writers = new Map<string, string>();
	private stopReplay?: () => void;
	private active = false;
	private pendingCaptures = 0;
	private captureFailed = false;
	private deliveryPending = false;
	constructor(
		private readonly runtime: Pick<
			RuntimeHost,
			"getSession" | "readLiveSessionMessages"
		>,
		private readonly options: RuntimeRecallArchiveOptions,
	) {
		this.signingKey = options.archiveSigningKey
			? copyRecallArchiveKey(options.archiveSigningKey)
			: undefined;
		this.queue = new DurableRecallOutbox(
			options.directory ?? join(resolveClineDir(), "netaigis-recall-outbox"),
			options.fetch,
			async (actor, project, sessionId) => {
				const config = await this.configuration(actor, sessionId, project);
				return config?.project === project ? config : undefined;
			},
		);
	}
	private async connection(
		actor?: string,
	): Promise<RecallDeliveryConfiguration | undefined> {
		const config = this.options.getConnection
			? await this.options.getConnection()
			: await this.options.getConfiguration();
		if (!config?.enabled) return undefined;
		if (
			this.options.getConnection &&
			"project" in config &&
			config.project !== undefined
		)
			throw new Error(
				"Session-scoped Recall connection cannot select a global project",
			);
		if (!actor || actor === config.actor) return { ...config };
		// Keep the true actor even while its key is unavailable. Never submit with another actor's key.
		return { ...config, actor, token: this.options.actorTokens?.[actor] ?? "" };
	}
	private async configuration(
		actor?: string,
		sessionId?: string,
		queuedProject?: string,
	): Promise<RecallConfiguration | undefined> {
		const base = await this.connection(actor);
		if (!base) return undefined;
		if (base.project !== undefined) return { ...base, project: base.project };
		if (!sessionId) return undefined;
		const session = await this.runtime.getSession(sessionId);
		// A deleted local task must not strand its already bound durable journal.
		// This hint comes only from an existing private outbox record, never a client/default.
		const project = session
			? readSessionRecallProject(session.metadata)
			: queuedProject;
		return project ? { ...base, project } : undefined;
	}

	/** The owning runtime selects credentials and producer verification; clients cannot supply either. */
	async sessionReader(actor: string): Promise<TotalRecallSessionHost> {
		const config = await this.connection(actor);
		if (!config?.enabled || !config.token || config.actor !== actor)
			throw new Error(
				"Runtime Recall credentials unavailable for authenticated actor",
			);
		const reader = new TotalRecallSessionHost(
			() => this.connection(actor),
			undefined,
			this.options.fetch,
			{
				verificationKey: this.signingKey,
				requireVerifiedSource: true,
			},
		);
		await reader.initialize(config);
		return reader;
	}
	async start(): Promise<void> {
		const config = await this.connection();
		if (!config) return;
		const url = new URL(config.baseUrl);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			!config.actor ||
			(!this.options.getConnection && !config.project) ||
			!config.token
		)
			throw new Error("Invalid runtime Recall configuration");
		if (
			this.signingKey &&
			[config.token, ...Object.values(this.options.actorTokens ?? {})].includes(
				this.signingKey.toString("base64url"),
			)
		)
			throw new Error(
				"Runtime archive producer key must be independent of API credentials",
			);
		this.active = true;
		this.stopReplay = this.queue.startRecallOutbox(() => this.connection());
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
		const configuration = this.configuration(actor, id).then(
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
				await this.stageEvent(capture.value, config);
			})
			.catch(() => {
				this.captureFailed = true;
			})
			.finally(() => {
				this.pendingCaptures--;
			});
		if (copied.type === "ended") this.captureFinalSnapshot(id, configuration);
	}

	private captureFinalSnapshot(
		id: string,
		configuration: Promise<{ value?: RecallConfiguration }>,
	): void {
		// Begin the canonical read immediately; stage it after the raw ended event.
		const captured = (async (): Promise<
			Extract<CoreSessionEvent, { type: "session_snapshot" }>
		> => {
			const before = await this.runtime.getSession(id);
			if (!before || !this.runtime.readLiveSessionMessages)
				throw new Error("Final session state unavailable");
			const messages = await this.runtime.readLiveSessionMessages(id);
			const after = await this.runtime.getSession(id);
			if (!after || JSON.stringify(before) !== JSON.stringify(after))
				throw new Error("Session state changed during final capture");
			return {
				type: "session_snapshot",
				payload: {
					sessionId: id,
					snapshot: createCoreSessionSnapshot({ session: after, messages }),
				},
			};
		})().then(
			(value) => ({ value }),
			() => ({ value: undefined }),
		);
		this.pendingCaptures++;
		this.captures = this.captures
			.then(async () => {
				const [capture, selected] = await Promise.all([
					captured,
					configuration,
				]);
				if (!capture.value || !selected.value) {
					this.captureFailed = true;
					return;
				}
				const snapshot = capture.value.payload.snapshot;
				const actor = parseSessionWriterControl(
					snapshot.metadata?.sharedSessionControl,
				).writer?.actorId;
				const base = selected.value;
				const config =
					actor && actor !== base.actor
						? { ...base, actor, token: this.options.actorTokens?.[actor] ?? "" }
						: base;
				await this.stageEvent(capture.value, config);
			})
			.catch(() => {
				this.captureFailed = true;
			})
			.finally(() => {
				this.pendingCaptures--;
			});
	}

	private async stageEvent(
		event: CoreSessionEvent,
		config: RecallConfiguration,
	): Promise<void> {
		await this.queue.archiveSdkEvent(event, config, {
			deferDelivery: true,
			archiveSigningKey: this.signingKey,
		});
		void this.connection()
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
	}
	status() {
		const lastFailure = this.captureFailed
			? "capture_failed"
			: this.deliveryPending
				? "delivery_pending"
				: undefined;
		return {
			configured: this.active,
			...(this.signingKey
				? { producerKeyId: recallArchiveKeyId(this.signingKey) }
				: {}),
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
