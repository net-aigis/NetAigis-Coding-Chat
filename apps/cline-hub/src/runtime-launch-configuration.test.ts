import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
	loadRuntimeLaunchConfiguration,
	parseRuntimeLaunchConfiguration,
	readPrivateRuntimeJson,
} from "./runtime-launch-configuration";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
function configuration(root = "/fixture") {
	return {
		version: 1,
		storageRoot: join(root, "netaigis.netaigis-coding-chat/home"),
		workspaceRoot: root,
		actorTokensFile: join(root, "actors.json"),
		hubPort: 25463,
		dashboard: {
			host: "127.0.0.1",
			port: 8787,
			publicUrl: "https://127.0.0.1:8787",
			roomSecret: "fixture-room-credential-not-a-live-secret",
			certFile: join(root, "cert.pem"),
			keyFile: join(root, "key.pem"),
		},
	};
}

it("retains explicit endpoints/storage and never selects a model or creates a credential", () => {
	const input = configuration();
	expect(parseRuntimeLaunchConfiguration(input)).toEqual(input);
	expect(input).not.toHaveProperty("model");
});

it.each([
	{ hubPort: 8787 },
	{ hubPort: 0 },
	{ hubPort: 65536 },
	{ version: 2 },
	{ storageRoot: "/fixture/../other" },
	{ actorTokensFile: "relative" },
	{ storageRoot: "/fixture/saoudrizwan.claude-dev/home" },
])("refuses an inconsistent launch configuration (%j)", (change) => {
	expect(() =>
		parseRuntimeLaunchConfiguration({ ...configuration(), ...change }),
	).toThrow("credentials withheld");
});

it.each([
	{ publicUrl: "http://127.0.0.1:8787" },
	{ publicUrl: "https://127.0.0.1:8787?token=fixture-hidden" },
	{ publicUrl: "https://user:fixture-hidden@127.0.0.1:8787" },
	{ publicUrl: "https://127.0.0.1:9999" },
	{ host: "192.168.1.2" },
	{ host: "0.0.0.0" },
	{ roomSecret: "short" },
	{ keyFile: "relative" },
])("rejects insecure or ambiguous browser configuration without disclosing values (%j)", (change) => {
	const input = configuration();
	try {
		parseRuntimeLaunchConfiguration({
			...input,
			dashboard: { ...input.dashboard, ...change },
		});
		throw new Error("Unexpected acceptance");
	} catch (error) {
		expect(String(error)).toContain("credentials withheld");
		expect(String(error)).not.toContain("fixture-hidden");
	}
});

it("requires private regular files, refuses symlinks and hides malformed JSON contents", async () => {
	const root = await mkdtemp(join(tmpdir(), "netaigis-runtime-config-"));
	roots.push(root);
	const file = join(root, "launch.json");
	await writeFile(file, JSON.stringify(configuration(root)), { mode: 0o600 });
	expect(await readPrivateRuntimeJson(file)).toEqual(configuration(root));
	await chmod(file, 0o644);
	await expect(readPrivateRuntimeJson(file)).rejects.toThrow(
		"insufficiently protected",
	);
	await chmod(file, 0o600);
	const alias = join(root, "alias.json");
	await symlink(file, alias);
	await expect(readPrivateRuntimeJson(alias)).rejects.toThrow(
		"insufficiently protected",
	);
	await writeFile(file, '{"fixture-hidden-malformed-credential');
	await expect(readPrivateRuntimeJson(file)).rejects.toThrow(
		"credentials withheld",
	);
});

it("requires the existing own storage to be protected and does not create missing data roots", async () => {
	const root = await mkdtemp(join(tmpdir(), "netaigis-runtime-root-"));
	roots.push(root);
	const input = configuration(root),
		file = join(root, "launch.json");
	await writeFile(file, JSON.stringify(input), { mode: 0o600 });
	await expect(loadRuntimeLaunchConfiguration(file)).rejects.toThrow();
	await mkdir(input.storageRoot, { recursive: true, mode: 0o700 });
	await expect(loadRuntimeLaunchConfiguration(file)).resolves.toEqual(input);
	await chmod(input.storageRoot, 0o755);
	await expect(loadRuntimeLaunchConfiguration(file)).rejects.toThrow();
});
