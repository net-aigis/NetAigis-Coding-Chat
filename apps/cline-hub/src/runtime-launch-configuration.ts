/** Launch the existing Hub/dashboard against the own extension's canonical storage. */
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface RuntimeLaunchConfiguration {
	version: 1;
	storageRoot: string;
	workspaceRoot: string;
	actorTokensFile: string;
	hubPort: number;
	dashboard: {
		host: string;
		port: number;
		publicUrl: string;
		roomSecret: string;
		certFile: string;
		keyFile: string;
	};
}

/** Only for the standalone own process, never VS Code's shared extension host.
 * Packaged SDK export bundles can hold distinct module-local storage overrides.
 * Bind their lazy path readers to the same selected root before importing them.
 */
export function ownRuntimeStorageEnvironment(
	storageRoot: string,
): Record<string, string> {
	const data = join(storageRoot, "data");
	const db = join(data, "db");
	const settings = join(data, "settings");
	return {
		CLINE_DIR: storageRoot,
		CLINE_DATA_DIR: data,
		CLINE_DB_DATA_DIR: db,
		CLINE_SESSION_DATA_DIR: join(data, "sessions"),
		CLINE_TEAM_DATA_DIR: join(data, "teams"),
		CLINE_CONNECTOR_DATA_DIR: join(data, "connectors"),
		CLINE_CONNECTOR_SETTINGS_PATH: join(data, "connectors", "settings.json"),
		CLINE_CONNECTORS_DB_PATH: join(db, "connectors.db"),
		CLINE_CRON_DB_PATH: join(db, "cron.db"),
		CLINE_TASKS_DB_PATH: join(db, "tasks.db"),
		CLINE_PROVIDER_SETTINGS_PATH: join(settings, "providers.json"),
		CLINE_GLOBAL_SETTINGS_PATH: join(settings, "global-settings.json"),
		CLINE_MCP_SETTINGS_PATH: join(settings, "cline_mcp_settings.json"),
	};
}

function invalid(): never {
	throw new Error(
		"Shared runtime launch configuration is invalid; credentials withheld",
	);
}

function absolute(value: unknown): string {
	if (
		typeof value !== "string" ||
		!isAbsolute(value) ||
		value !== resolve(value)
	)
		invalid();
	return value;
}

function port(value: unknown): number {
	if (
		!Number.isSafeInteger(value) ||
		Number(value) < 1 ||
		Number(value) > 65535
	)
		invalid();
	return Number(value);
}

export function parseRuntimeLaunchConfiguration(
	value: unknown,
): RuntimeLaunchConfiguration {
	try {
		if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
		const v = value as Record<string, unknown>;
		if (
			v.version !== 1 ||
			!v.dashboard ||
			typeof v.dashboard !== "object" ||
			Array.isArray(v.dashboard)
		)
			invalid();
		const d = v.dashboard as Record<string, unknown>;
		const storageRoot = absolute(v.storageRoot);
		if (
			basename(storageRoot) !== "home" ||
			basename(dirname(storageRoot)) !== "netaigis.netaigis-coding-chat"
		)
			invalid();
		if (
			typeof d.host !== "string" ||
			(!isIP(d.host) && d.host !== "localhost") ||
			["0.0.0.0", "::"].includes(d.host)
		)
			invalid();
		const dashboardPort = port(d.port),
			hubPort = port(v.hubPort);
		if (hubPort === dashboardPort || typeof d.publicUrl !== "string") invalid();
		const url = new URL(d.publicUrl);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== "/" ||
			url.hostname.replace(/^\[|\]$/g, "") !== d.host ||
			Number(url.port || 443) !== dashboardPort
		)
			invalid();
		if (
			typeof d.roomSecret !== "string" ||
			d.roomSecret.trim() !== d.roomSecret ||
			d.roomSecret.length < 32
		)
			invalid();
		return {
			version: 1,
			storageRoot,
			workspaceRoot: absolute(v.workspaceRoot),
			actorTokensFile: absolute(v.actorTokensFile),
			hubPort,
			dashboard: {
				host: d.host,
				port: dashboardPort,
				publicUrl: url.origin,
				roomSecret: d.roomSecret,
				certFile: absolute(d.certFile),
				keyFile: absolute(d.keyFile),
			},
		};
	} catch {
		return invalid();
	}
}

/** Read existing private files only. Never creates credentials, data paths or services. */
export async function readPrivateRuntimeJson(path: string): Promise<unknown> {
	try {
		absolute(path);
		if ((await lstat(path)).isSymbolicLink() || (await realpath(path)) !== path)
			invalid();
		const file = await open(
			path,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
		);
		try {
			const info = await file.stat();
			if (
				!info.isFile() ||
				info.size > 65536 ||
				info.mode & 0o077 ||
				(process.getuid && info.uid !== process.getuid())
			)
				invalid();
			return JSON.parse(await file.readFile("utf8"));
		} finally {
			await file.close();
		}
	} catch {
		throw new Error(
			"Private shared runtime file is unreadable, invalid or insufficiently protected; credentials withheld",
		);
	}
}

export async function loadRuntimeLaunchConfiguration(
	path: string,
): Promise<RuntimeLaunchConfiguration> {
	const configuration = parseRuntimeLaunchConfiguration(
		await readPrivateRuntimeJson(path),
	);
	for (const directory of [
		configuration.storageRoot,
		configuration.workspaceRoot,
	]) {
		const info = await lstat(directory);
		if (
			!info.isDirectory() ||
			info.isSymbolicLink() ||
			(await realpath(directory)) !== directory
		)
			invalid();
		if (
			directory === configuration.storageRoot &&
			(info.mode & 0o077 || (process.getuid && info.uid !== process.getuid()))
		)
			invalid();
	}
	return configuration;
}
