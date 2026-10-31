import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
	resolveClineDataDir,
	resolveClineDir,
	resolveDbDataDir,
	resolveDocumentsClineDirectoryPath,
	resolveProviderSettingsPath,
	resolveSessionDataDir,
	setIsolatedStorageRoot,
} from "./paths";

afterEach(() => {
	setIsolatedStorageRoot(undefined);
	vi.unstubAllEnvs();
});

it("isolates an embedded extension without rewriting another extension's environment", () => {
	vi.stubEnv("CLINE_DIR", "/fixture/original");
	vi.stubEnv("CLINE_DATA_DIR", "/fixture/original-data");
	vi.stubEnv("CLINE_SESSION_DATA_DIR", "/fixture/original-sessions");
	vi.stubEnv("CLINE_DB_DATA_DIR", "/fixture/original-db");
	vi.stubEnv("CLINE_PROVIDER_SETTINGS_PATH", "/fixture/original-provider.json");
	const environment = { ...process.env };
	const root = join("/fixture", "own-extension", "home");
	setIsolatedStorageRoot(root);
	expect(resolveClineDir()).toBe(root);
	expect(resolveClineDataDir()).toBe(join(root, "data"));
	expect(resolveSessionDataDir()).toBe(join(root, "data", "sessions"));
	expect(resolveDbDataDir()).toBe(join(root, "data", "db"));
	expect(resolveProviderSettingsPath()).toBe(
		join(root, "data", "settings", "providers.json"),
	);
	expect(resolveDocumentsClineDirectoryPath()).toBe(join(root, "documents"));
	expect(process.env).toEqual(environment);
	setIsolatedStorageRoot(undefined);
	expect(resolveClineDataDir()).toBe("/fixture/original-data");
	expect(resolveSessionDataDir()).toBe("/fixture/original-sessions");
	expect(resolveProviderSettingsPath()).toBe("/fixture/original-provider.json");
});
