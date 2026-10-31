import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolveClineHubServerOptions } from "../options";
import { loadDashboardTls } from "./tls";

it("makes TLS explicit without generating credentials or changing the existing listener port", () => {
	expect(() =>
		resolveClineHubServerOptions({
			CLINE_HUB_DASHBOARD_TLS_CERT_FILE: "/fixture/cert",
		}),
	).toThrow("both");
	expect(() =>
		resolveClineHubServerOptions({
			CLINE_HUB_DASHBOARD_TLS_CERT_FILE: "/fixture/cert",
			CLINE_HUB_DASHBOARD_TLS_KEY_FILE: "/fixture/key",
			PUBLIC_URL: "http://localhost:8787",
		}),
	).toThrow("HTTPS");
	expect(
		resolveClineHubServerOptions({
			CLINE_HUB_DASHBOARD_TLS_CERT_FILE: "/fixture/cert",
			CLINE_HUB_DASHBOARD_TLS_KEY_FILE: "/fixture/key",
		}),
	).toMatchObject({
		port: 8787,
		publicUrl: "https://127.0.0.1:8787",
		tls: { certFile: "/fixture/cert", keyFile: "/fixture/key" },
	});
});

it("requires an owner-private regular key and does not chmod or expose rejected key material", async () => {
	const root = await mkdtemp(join(tmpdir(), "cline-dashboard-tls-")),
		keyFile = join(root, "key"),
		certFile = join(root, "cert");
	try {
		await expect(loadDashboardTls(undefined)).resolves.toBeUndefined();
		await writeFile(keyFile, "fixture-private-key", { mode: 0o600 });
		await writeFile(certFile, "fixture-certificate");
		expect(
			(await loadDashboardTls({ keyFile, certFile }))?.key.toString(),
		).toBe("fixture-private-key");
		await chmod(keyFile, 0o644);
		await expect(loadDashboardTls({ keyFile, certFile })).rejects.toThrow(
			"insufficiently protected",
		);
		const alias = join(root, "alias");
		await symlink(keyFile, alias);
		await expect(
			loadDashboardTls({ keyFile: alias, certFile }),
		).rejects.toThrow("insufficiently protected");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
