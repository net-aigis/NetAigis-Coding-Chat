import { decodeRecallArchiveKey } from "./recall-archive-proof";
import type { RuntimeRecallArchiveOptions } from "./recall-runtime-archive";

/** Explicit Hub deployment settings. Existing Recall actor keys are reused only for that same Recall API. */
export function readRuntimeRecallConfiguration(
	environment: NodeJS.ProcessEnv = process.env,
): RuntimeRecallArchiveOptions | undefined {
	const baseUrl = environment.CLINE_HUB_RECALL_URL,
		project = environment.CLINE_HUB_RECALL_PROJECT,
		actor = environment.CLINE_HUB_RECALL_ACTOR;
	if (
		baseUrl === undefined &&
		project === undefined &&
		actor === undefined &&
		environment.CLINE_HUB_RECALL_ARCHIVE_KEY === undefined
	)
		return undefined;
	try {
		if (!baseUrl || !project?.trim() || !actor?.trim()) throw new Error();
		const url = new URL(baseUrl);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new Error();
		const tokens: unknown = JSON.parse(
			environment.RECALL_ACTOR_TOKENS_JSON ?? "{}",
		);
		if (
			!tokens ||
			typeof tokens !== "object" ||
			Array.isArray(tokens) ||
			Object.entries(tokens).some(
				([key, value]) =>
					!key.trim() || typeof value !== "string" || !value.trim(),
			)
		)
			throw new Error();
		const actorTokens = tokens as Record<string, string>,
			token = actorTokens[actor] ?? environment.RECALL_API_TOKEN;
		if (!token) throw new Error();
		const configuration = {
			baseUrl: baseUrl.replace(/\/+$/, ""),
			project,
			actor,
			token,
			enabled: true,
		};
		const archiveSigningKey = environment.CLINE_HUB_RECALL_ARCHIVE_KEY;
		return {
			...(archiveSigningKey !== undefined
				? { archiveSigningKey: decodeRecallArchiveKey(archiveSigningKey) }
				: {}),
			actorTokens: { ...actorTokens },
			getConfiguration: async () => ({ ...configuration }),
		};
	} catch {
		throw new Error(
			"Runtime Recall configuration is incomplete or invalid; credentials withheld",
		);
	}
}
