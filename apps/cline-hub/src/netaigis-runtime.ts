/** Packaged entry for the existing Core daemon and dashboard, outside VS Code's process. */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setIsolatedStorageRoot } from "@cline/shared/storage";
import {
	loadRuntimeLaunchConfiguration,
	ownRuntimeRecallEnvironment,
	ownRuntimeStorageEnvironment,
	readPrivateRuntimeJson,
} from "./runtime-launch-configuration";

export async function launchOwnSharedRuntime(
	mode: string,
	configurationFile: string,
): Promise<void> {
	if (mode !== "daemon" && mode !== "dashboard")
		throw new Error("Select daemon or dashboard");
	const config = await loadRuntimeLaunchConfiguration(configurationFile);
	process.umask(0o077);
	Object.assign(process.env, ownRuntimeStorageEnvironment(config.storageRoot));
	setIsolatedStorageRoot(config.storageRoot);
	process.env.NODE_ENV = "production";
	process.env.CLINE_BUILD_ENV = "production";
	if (mode === "daemon") {
		if (config.recall) {
			const actors = await readPrivateRuntimeJson(config.actorTokensFile);
			const environment = ownRuntimeRecallEnvironment(config.recall, actors);
			// Explicit session mode cannot inherit a former fixed project from a login shell.
			delete process.env.CLINE_HUB_RECALL_PROJECT;
			Object.assign(process.env, environment);
		}
		process.env.CLINE_HUB_ACTOR_TOKENS_FILE = config.actorTokensFile;
		process.env.CLINE_HUB_DISCOVERY_PATH = join(
			config.storageRoot,
			"data/locks/hub/production.json",
		);
		process.argv = [
			process.argv[0],
			process.argv[1],
			"--no-connectors",
			"--cwd",
			config.workspaceRoot,
			"--host",
			"127.0.0.1",
			"--port",
			String(config.hubPort),
			"--pathname",
			"/hub",
		];
		await import("@cline/core/hub/daemon-entry");
		return;
	}
	const record = (await readPrivateRuntimeJson(
		join(config.storageRoot, "data/locks/hub/production.json"),
	)) as Record<string, unknown>;
	const expected = `ws://127.0.0.1:${config.hubPort}/hub`;
	if (
		record.url !== expected ||
		typeof record.authToken !== "string" ||
		!record.authToken ||
		typeof record.hubId !== "string"
	)
		throw new Error(
			"The selected canonical runtime discovery is invalid; no fallback started",
		);
	const health = await fetch(`http://127.0.0.1:${config.hubPort}/health`, {
		signal: AbortSignal.timeout(5000),
		redirect: "error",
	});
	if (
		!health.ok ||
		((await health.json()) as { hubId?: string }).hubId !== record.hubId
	)
		throw new Error(
			"The selected canonical runtime identity was not confirmed; no fallback started",
		);
	Object.assign(process.env, {
		HOST: config.dashboard.host,
		CLINE_HUB_DASHBOARD_PORT: String(config.dashboard.port),
		PUBLIC_URL: config.dashboard.publicUrl,
		ROOM_SECRET: config.dashboard.roomSecret,
		WORKSPACE_ROOT: config.workspaceRoot,
		CLINE_SHARED_SESSION_HUB_ENDPOINT: expected,
		CLINE_SHARED_SESSION_HUB_TOKEN: record.authToken,
		CLINE_HUB_DASHBOARD_TLS_CERT_FILE: config.dashboard.certFile,
		CLINE_HUB_DASHBOARD_TLS_KEY_FILE: config.dashboard.keyFile,
	});
	if (process.env.NETAIGIS_PACKAGED_RUNTIME === "true") {
		process.env.CLINE_HUB_WEBVIEW_DIST_DIR = fileURLToPath(
			new URL("./webview/", import.meta.url),
		);
	}
	// Configuration must precede importing the dashboard's existing dependency module.
	const { startClineHubDashboardServer } = await import("./server");
	const server = await startClineHubDashboardServer();
	let closing: Promise<void> | undefined;
	const close = () => {
		closing ??= server.stop();
		void closing.catch(() => {
			process.exitCode = 1;
		});
	};
	process.on("SIGINT", close);
	process.on("SIGTERM", close);
	console.log(
		JSON.stringify({
			event: "netaigis.shared_runtime.ready",
			mode,
			publicUrl: server.publicUrl,
		}),
	);
}

if (import.meta.main) {
	try {
		await launchOwnSharedRuntime(process.argv[2], process.argv[3]);
	} catch {
		console.error(
			"NetAigis shared runtime could not start; inspect the protected configuration and runtime state",
		);
		process.exitCode = 1;
	}
}
