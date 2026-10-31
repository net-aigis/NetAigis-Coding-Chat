import { isIP } from "node:net";

export interface ClineHubServerOptions {
	host: string;
	port: number;
	publicUrl: string;
	roomSecret?: string;
	workspaceRoot: string;
	/** Explicit existing shared runtime; distinct from the browser HTTP listener. */
	sessionHub?: { endpoint: string; authToken: string };
	tls?: { certFile: string; keyFile: string };
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DASHBOARD_PORT_ENV = "CLINE_HUB_DASHBOARD_PORT";

function parsePort(value: string | undefined): number {
	if (!value?.trim()) return DEFAULT_PORT;
	const port = Number.parseInt(value, 10);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(
			`${DASHBOARD_PORT_ENV} must be an integer from 1 to 65535, got ${value}`,
		);
	}
	return port;
}

function normalizeHost(value: string | undefined): string {
	return value?.trim() || DEFAULT_HOST;
}

function normalizePublicUrl(
	value: string | undefined,
	host: string,
	port: number,
): string {
	const fallbackHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
	const raw = value?.trim() || `http://${fallbackHost}:${port}`;
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch (error) {
		throw new Error(
			`PUBLIC_URL must be a valid http(s) URL, got ${raw}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(
			`PUBLIC_URL must use http: or https:, got ${parsed.protocol}`,
		);
	}
	if (shouldAddDashboardPortToPublicUrl(parsed, port)) {
		parsed.port = String(port);
	}
	parsed.hash = "";
	return parsed.toString().replace(/\/$/, "");
}

function normalizeRoomSecret(value: string | undefined): string | undefined {
	const secret = value?.trim();
	return secret ? secret : undefined;
}

function isLocalBindHost(host: string): boolean {
	return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function isNonLocalBindHost(host: string): boolean {
	return !isLocalBindHost(host);
}

export function resolveClineHubServerOptions(
	env: NodeJS.ProcessEnv = process.env,
): ClineHubServerOptions {
	const host = normalizeHost(env.HOST);
	const port = parsePort(env[DASHBOARD_PORT_ENV]);
	const certFile = env.CLINE_HUB_DASHBOARD_TLS_CERT_FILE?.trim(),
		keyFile = env.CLINE_HUB_DASHBOARD_TLS_KEY_FILE?.trim();
	let tls: ClineHubServerOptions["tls"];
	if (
		env.CLINE_HUB_DASHBOARD_TLS_CERT_FILE !== undefined ||
		env.CLINE_HUB_DASHBOARD_TLS_KEY_FILE !== undefined
	) {
		if (!certFile || !keyFile)
			throw new Error(
				"Dashboard TLS requires both existing certificate and private key files",
			);
		tls = { certFile, keyFile };
	}
	const publicUrl = normalizePublicUrl(env.PUBLIC_URL, host, port);
	const tlsPublicUrl =
		tls && !env.PUBLIC_URL ? publicUrl.replace(/^http:/, "https:") : publicUrl;
	if (tls && new URL(tlsPublicUrl).protocol !== "https:")
		throw new Error("A TLS dashboard requires an HTTPS public URL");
	const roomSecret = normalizeRoomSecret(env.ROOM_SECRET);
	const endpoint = env.CLINE_SHARED_SESSION_HUB_ENDPOINT;
	const authToken = env.CLINE_SHARED_SESSION_HUB_TOKEN;
	let sessionHub: ClineHubServerOptions["sessionHub"];
	if (endpoint !== undefined || authToken !== undefined) {
		try {
			const url = new URL(endpoint ?? "");
			if (
				!endpoint ||
				!authToken?.trim() ||
				!["ws:", "wss:"].includes(url.protocol) ||
				url.username ||
				url.password ||
				url.search ||
				url.hash
			) {
				throw new Error("Invalid connection");
			}
			sessionHub = { endpoint, authToken };
		} catch {
			throw new Error(
				"The shared session hub requires an explicit WebSocket endpoint and a separate credential",
			);
		}
	}
	if (isNonLocalBindHost(host) && !roomSecret) {
		throw new Error(
			`ROOM_SECRET is required when HOST=${host}. Use HOST=127.0.0.1 for local-only development or set ROOM_SECRET before exposing this example on a LAN/tunnel.`,
		);
	}
	return {
		host,
		port,
		publicUrl: tlsPublicUrl,
		roomSecret,
		workspaceRoot: env.WORKSPACE_ROOT?.trim() || process.cwd(),
		...(sessionHub ? { sessionHub } : {}),
		...(tls ? { tls } : {}),
	};
}

function isDefaultProtocolPort(url: URL, port: number): boolean {
	return (
		(url.protocol === "http:" && port === 80) ||
		(url.protocol === "https:" && port === 443)
	);
}

function shouldAddDashboardPortToPublicUrl(url: URL, port: number): boolean {
	if (url.port || isDefaultProtocolPort(url, port)) return false;
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	return hostname === "localhost" || isIP(hostname) !== 0;
}

export function buildInviteUrl(
	publicUrl: string,
	roomSecret: string | undefined,
): string {
	const url = new URL(publicUrl);
	if (roomSecret) {
		url.searchParams.set("roomSecret", roomSecret);
	}
	return url.toString();
}
