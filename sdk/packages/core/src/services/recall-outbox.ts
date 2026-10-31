/** Existing durable TOTAL RECALL outbox, shared by local clients and the owning runtime. */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { signRuntimeRecallRecord } from "./recall-archive-proof";
export type RecallFetch = (
	...args: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;
export interface RecallEvent {
	event_id: string;
	project_id: string;
	conversation_id: string;
	actor_id: string;
	kind: string;
	payload: Record<string, unknown>;
}

export interface RecallConfiguration {
	baseUrl: string;
	token: string;
	project: string;
	actor: string;
	enabled: boolean;
}

interface QueuedRecallEvent extends RecallEvent {
	_outbox: {
		version: 1;
		destination: string;
	};
}

export interface RecallDrainResult {
	sent: number;
	pending: number;
	blocked?: "unbound_legacy" | "invalid_record" | "delivery_failed";
}

function endpoint(config: RecallConfiguration): string {
	return config.baseUrl.replace(/\/+$/, "");
}

function scope(config: RecallConfiguration): string {
	return createHash("sha256")
		.update(JSON.stringify([endpoint(config), config.project, config.actor]))
		.digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: { value };
}

export function getRecallSessionId(event: unknown): string | undefined {
	const record = asRecord(event);
	const payload = asRecord(record.payload);
	// Core's payload sessionId is the host-owned ID; do not substitute the
	// agent runtime's independently generated conversationId for it.
	for (const value of [
		record.sessionId,
		payload.sessionId,
		record.taskId,
		record.conversationId,
	]) {
		if (typeof value === "string" && value) return value;
	}
	return record.event && typeof record.event === "object"
		? getRecallSessionId(record.event)
		: undefined;
}

function validRecord(record: unknown): record is QueuedRecallEvent {
	if (!record || typeof record !== "object") return false;
	const value = record as QueuedRecallEvent;
	return [
		value.event_id,
		value.project_id,
		value.conversation_id,
		value.actor_id,
		value.kind,
	].every((field) => typeof field === "string" && field.length > 0);
}

export function recallEnabled(config?: RecallConfiguration): boolean {
	return config?.enabled === true;
}
export class DurableRecallOutbox {
	private writes: Promise<void> = Promise.resolve();
	private activeDrain: Promise<RecallDrainResult> | undefined;
	private lastStamp = 0;
	private readonly retry = new Map<string, { next: number; delay: number }>();
	private readonly providers = new Set<
		() => Promise<RecallConfiguration | undefined>
	>();
	private retryTimer: ReturnType<typeof setTimeout> | undefined;
	private retryAt = 0;
	constructor(
		private readonly queueDir: string,
		private readonly transportFetch: RecallFetch = (...args) =>
			globalThis.fetch(...args),
		private readonly resolveActorConfiguration?: (
			actor: string,
		) => Promise<RecallConfiguration | undefined>,
	) {}
	private scheduleRetry(at: number): void {
		if (!this.providers.size || (this.retryTimer && this.retryAt <= at)) return;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryAt = at;
		this.retryTimer = setTimeout(
			() => {
				this.retryTimer = undefined;
				this.retryAt = 0;
				void this.replayConfigured().catch(() => {});
			},
			Math.max(1, at - Date.now()),
		);
		this.retryTimer.unref?.();
	}

	private async replayConfigured(): Promise<void> {
		for (const getConfig of this.providers) {
			const config = await getConfig();
			if (!config?.enabled) continue;
			const next = this.retry.get(scope(config))?.next ?? 0;
			if (next > Date.now()) this.scheduleRetry(next);
			else await this.drainRecallOutbox(config);
		}
	}

	startRecallOutbox(
		getConfig: () => Promise<RecallConfiguration | undefined>,
	): () => void {
		this.providers.add(getConfig);
		void this.replayConfigured().catch(() => {});
		return () => {
			this.providers.delete(getConfig);
			if (!this.providers.size && this.retryTimer) {
				clearTimeout(this.retryTimer);
				this.retryTimer = undefined;
				this.retryAt = 0;
			}
		};
	}

	async flushRecallOutboxWrites(): Promise<void> {
		await this.writes;
	}

	private async send(
		record: QueuedRecallEvent,
		config: RecallConfiguration,
	): Promise<void> {
		if (!config.token)
			throw new Error(
				"TOTAL RECALL actor credential unavailable; event retained",
			);
		const { _outbox, ...event } = record;
		const response = await this.transportFetch(
			`${endpoint(config)}/internal/recall/events`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${config.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(event),
				signal: AbortSignal.timeout(10000),
			},
		);
		if (!response.ok) throw new Error(`TOTAL RECALL HTTP ${response.status}`);
		const acknowledgement = asRecord(await response.json());
		// The server also acknowledges an identical, already inserted event with
		// inserted:false. An unrelated 200 response is not proof of durable receipt.
		if (
			acknowledgement.event_id !== record.event_id ||
			typeof acknowledgement.inserted !== "boolean"
		) {
			throw new Error(
				"TOTAL RECALL event acknowledgement missing or mismatched",
			);
		}
	}

	async drainRecallOutbox(
		config?: RecallConfiguration,
		options: { respectBackoff?: boolean } = {},
	): Promise<RecallDrainResult> {
		if (!config?.enabled) return { sent: 0, pending: 0 };
		await this.writes;
		if (this.activeDrain) {
			await this.activeDrain;
			return this.drainRecallOutbox(config, options);
		}
		const activeConfig = { ...config };
		const run = async (): Promise<RecallDrainResult> => {
			await fs.mkdir(this.queueDir, { recursive: true, mode: 0o700 });
			const files = (await fs.readdir(this.queueDir))
				.filter((name) => name.endsWith(".json"))
				.sort();
			const result: RecallDrainResult = { sent: 0, pending: files.length };
			if (
				options.respectBackoff &&
				(this.retry.get(scope(activeConfig))?.next ?? 0) > Date.now()
			)
				return { ...result, blocked: "delivery_failed" };
			for (const file of files) {
				const target = path.join(this.queueDir, file);
				let data: QueuedRecallEvent;
				try {
					if (!(await fs.lstat(target)).isFile()) {
						result.blocked = "invalid_record";
						break;
					}
					data = JSON.parse(await fs.readFile(target, "utf8"));
					if (!validRecord(data)) {
						result.blocked = "invalid_record";
						break;
					}
				} catch {
					result.blocked = "invalid_record";
					break;
				}
				// The actor token is bound server-side. Retain other actors' work;
				// never retag it or submit it with the currently selected actor's key.
				if (
					data.project_id !== activeConfig.project ||
					(data.actor_id !== activeConfig.actor &&
						!this.resolveActorConfiguration)
				)
					continue;
				if (!data._outbox || data._outbox.version !== 1) {
					result.blocked = "unbound_legacy";
					break;
				}
				if (data._outbox.destination !== endpoint(activeConfig)) continue;
				try {
					const selected =
						data.actor_id === activeConfig.actor
							? activeConfig
							: await this.resolveActorConfiguration?.(data.actor_id);
					if (
						!selected ||
						selected.actor !== data.actor_id ||
						selected.project !== data.project_id ||
						endpoint(selected) !== data._outbox.destination
					)
						throw new Error(
							"TOTAL RECALL actor configuration unavailable; ordered event retained",
						);
					await this.send(data, selected);
					await fs.unlink(target);
					result.sent++;
					result.pending--;
					this.retry.delete(scope(activeConfig));
				} catch {
					result.blocked = "delivery_failed";
					const key = scope(activeConfig),
						delay = Math.min(300000, (this.retry.get(key)?.delay ?? 15000) * 2);
					const next = Date.now() + delay;
					this.retry.set(key, { delay, next });
					this.scheduleRetry(next);
					break;
				}
			}
			return result;
		};
		const promise = run();
		this.activeDrain = promise;
		try {
			return await promise;
		} finally {
			if (this.activeDrain === promise) this.activeDrain = undefined;
		}
	}

	async archiveSdkEvent(
		event: unknown,
		config?: RecallConfiguration,
		options: { deferDelivery?: boolean; archiveSigningKey?: Uint8Array } = {},
	): Promise<void> {
		if (!config?.enabled) return;
		const sessionId = getRecallSessionId(event);
		if (!sessionId) return;
		const activeConfig = { ...config };
		const id = randomUUID();
		const record: QueuedRecallEvent = {
			event_id: id,
			project_id: activeConfig.project,
			conversation_id: sessionId,
			actor_id: activeConfig.actor,
			kind: "cline.sdk.event",
			payload: {
				sdk_event: JSON.parse(JSON.stringify(asRecord(event))),
				captured_at: new Date().toISOString(),
			},
			_outbox: { version: 1, destination: endpoint(activeConfig) },
		};
		if (options.archiveSigningKey)
			record.payload = signRuntimeRecallRecord(
				record,
				options.archiveSigningKey,
			).payload;
		const stage = this.writes
			.catch(() => {})
			.then(async () => {
				await fs.mkdir(this.queueDir, { recursive: true, mode: 0o700 });
				// Pending records also fence the local sort counter after a restart
				// or a clock step backwards. This is queue order, not an invented time.
				const pending = (await fs.readdir(this.queueDir)).filter((name) =>
					name.endsWith(".json"),
				);
				for (const name of pending) {
					const stamp = Number(name.split("-")[0]);
					if (Number.isFinite(stamp))
						this.lastStamp = Math.max(this.lastStamp, stamp);
				}
				this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
				const target = path.join(
						this.queueDir,
						`${String(this.lastStamp).padStart(13, "0")}-${id}.json`,
					),
					temp = `${target}.tmp`;
				try {
					const handle = await fs.open(temp, "wx", 0o600);
					try {
						await handle.writeFile(JSON.stringify(record), "utf8");
						await handle.sync();
					} finally {
						await handle.close();
					}
					await fs.rename(temp, target);
					const directory = await fs.open(this.queueDir, "r");
					try {
						await directory.sync();
					} finally {
						await directory.close();
					}
				} finally {
					await fs.unlink(temp).catch(() => {});
				}
			});
		this.writes = stage;
		await stage;
		if (
			!options.deferDelivery &&
			(this.retry.get(scope(activeConfig))?.next ?? 0) <= Date.now()
		)
			await this.drainRecallOutbox(activeConfig);
	}
}
