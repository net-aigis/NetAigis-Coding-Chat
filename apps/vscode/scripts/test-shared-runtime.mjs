/** Native package smoke: real daemon, TLS dashboard and mobile browser; no model/provider fixture or inference. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash, createPrivateKey, randomBytes, X509Certificate } from "node:crypto"
import { once } from "node:events"
import fs from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect } from "@playwright/test"
import { chromium } from "playwright"

const sourceExtension = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const extension = process.env.NETAIGIS_RUNTIME_TEST_EXTENSION_ROOT || sourceExtension
const repository = path.resolve(sourceExtension, "../..")
const identity = JSON.parse(await fs.readFile(path.join(extension, "package.json"), "utf8"))
assert.equal(`${identity.publisher}.${identity.name}`, "netaigis.netaigis-coding-chat")
assert.equal(identity.version, "0.1.0")
const root = process.env.CLINE_DATA_DIR
assert(root && path.isAbsolute(root), "An isolated CLINE_DATA_DIR is required")
const stat = await fs.lstat(root)
assert(
	stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid(),
	"Test root must already be private",
)
assert(!root.startsWith(path.join(process.env.HOME, ".config")), "Productive profiles cannot be test roots")
const storage = path.join(root, "netaigis.netaigis-coding-chat/home")
await fs.mkdir(storage, { recursive: true, mode: 0o700 })
const tokens = { Friseer: randomBytes(32).toString("hex"), jimmi: randomBytes(32).toString("hex") }
const actors = path.join(root, "actors.json"),
	file = path.join(root, "launch.json")
await fs.writeFile(actors, JSON.stringify(tokens), { flag: "wx", mode: 0o600 })
const cert = await fs.readFile(path.join(repository, "sdk/packages/core/src/hub/client/__fixtures__/localhost-cert.pem"))
const key = createPrivateKey({
	key: await fs.readFile(path.join(repository, "sdk/packages/core/src/hub/client/__fixtures__/localhost-key.der")),
	format: "der",
	type: "pkcs8",
}).export({ format: "pem", type: "pkcs8" })
const certFile = path.join(root, "cert.pem"),
	keyFile = path.join(root, "key.pem")
await fs.writeFile(certFile, cert, { flag: "wx", mode: 0o600 })
await fs.writeFile(keyFile, key, { flag: "wx", mode: 0o600 })
async function reservePort() {
	const socket = createServer()
	await new Promise((resolve, reject) => socket.once("error", reject).listen(0, "127.0.0.1", resolve))
	const port = socket.address().port
	await new Promise((resolve) => socket.close(resolve))
	return port
}
const hubPort = await reservePort(),
	dashboardPort = await reservePort()
assert.notEqual(hubPort, dashboardPort)
await fs.writeFile(
	file,
	JSON.stringify({
		version: 1,
		storageRoot: storage,
		workspaceRoot: root,
		actorTokensFile: actors,
		hubPort,
		dashboard: {
			host: "127.0.0.1",
			port: dashboardPort,
			publicUrl: `https://127.0.0.1:${dashboardPort}`,
			roomSecret: randomBytes(32).toString("hex"),
			certFile,
			keyFile,
		},
	}),
	{ flag: "wx", mode: 0o600 },
)
const config = JSON.parse(await fs.readFile(file, "utf8"))
const ownershipOnly = process.env.NETAIGIS_RUNTIME_PACKAGE_OWNERSHIP_ONLY === "1"
const report = {
	ok: false,
	actualPackagedRuntime: true,
	actualBrowser: !ownershipOnly,
	physicalAndroid: false,
	modelRequest: false,
	productiveFilesModified: false,
}
const children = []
let browser
function start(mode) {
	const child = spawn("bun", ["--no-env-file", path.join(extension, "dist/shared-runtime/netaigis-runtime.mjs"), mode, file], {
		cwd: root,
		env: { ...process.env, OTEL_SDK_DISABLED: "true" },
		stdio: ["ignore", "pipe", "pipe"],
	})
	const state = { mode, child, stdout: "", stderr: "" }
	child.stdout.on("data", (data) => {
		state.stdout += data
	})
	child.stderr.on("data", (data) => {
		state.stderr += data
	})
	children.push(state)
	return state
}
async function stop(state) {
	if (state.child.exitCode === null && state.child.signalCode === null) {
		const ended = once(state.child, "exit")
		state.child.kill("SIGTERM")
		await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 5000))])
		if (state.child.exitCode === null && state.child.signalCode === null) {
			state.forced = true
			state.child.kill("SIGKILL")
			await ended
		}
	}
	assert(!state.forced && state.child.exitCode === (state.expectedExit ?? 0), `${state.mode} did not exit as expected`)
}
try {
	const daemon = start("daemon")
	const discovery = path.join(storage, "data/locks/hub/production.json")
	await expect
		.poll(
			async () => {
				assert.equal(daemon.child.exitCode, null, "Packaged daemon exited early")
				return fs
					.readFile(discovery, "utf8")
					.then((raw) => JSON.parse(raw).url)
					.catch(() => undefined)
			},
			{ timeout: 20000 },
		)
		.toBe(`ws://127.0.0.1:${hubPort}/hub`)
	report.canonicalDiscoveryConfirmed = true
	if (ownershipOnly) {
		const before = JSON.parse(await fs.readFile(discovery, "utf8"))
		const duplicate = start("daemon")
		duplicate.expectedExit = 3
		await expect.poll(() => duplicate.child.exitCode, { timeout: 15000 }).toBe(3)
		assert.equal(daemon.child.exitCode, null)
		assert.equal(JSON.parse(await fs.readFile(discovery, "utf8")).hubId, before.hubId)
		report.duplicateOwnerRefusedWithoutReplacingRuntime = true
		await stop(daemon)
		const missing = start("dashboard")
		missing.expectedExit = 1
		await expect.poll(() => missing.child.exitCode, { timeout: 10000 }).toBe(1)
		await assert.rejects(fs.readFile(discovery, "utf8"), { code: "ENOENT" })
		report.missingRuntimeRefusedWithoutFallback = true
	} else {
		const dashboard = start("dashboard")
		await expect
			.poll(
				() => {
					assert.equal(dashboard.child.exitCode, null, "Packaged dashboard exited early")
					return dashboard.stdout.includes('"event":"netaigis.shared_runtime.ready"')
				},
				{ timeout: 20000 },
			)
			.toBeTruthy()
		const pin = createHash("sha256")
			.update(new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" }))
			.digest("base64")
		browser = await chromium.launchPersistentContext(path.join(root, "browser"), {
			executablePath: "/usr/bin/chromium",
			headless: true,
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
			args: ["--no-sandbox", `--ignore-certificate-errors-spki-list=${pin}`],
		})
		const page = browser.pages()[0]
		await page.goto(`${config.dashboard.publicUrl}/chat?roomSecret=${config.dashboard.roomSecret}`, {
			waitUntil: "domcontentloaded",
		})
		await page.getByLabel("Eigener Sitzungszugang", { exact: true }).fill(tokens.Friseer)
		await page.getByRole("button", { name: "Verbinden", exact: true }).click()
		await expect(page.getByText("Bestätigter Akteur: Friseer", { exact: true })).toBeVisible({ timeout: 15000 })
		report.packagedAssetsAndPersonalAuthenticationConfirmed = true
		await browser.close()
		browser = undefined
		await stop(dashboard)
		assert.equal(daemon.child.exitCode, null)
		assert.equal(daemon.child.signalCode, null)
		report.runtimeSurvivesBrowserAndDashboardClose = true
		const restarted = start("dashboard")
		await expect
			.poll(
				() => {
					assert.equal(restarted.child.exitCode, null)
					return restarted.stdout.includes('"event":"netaigis.shared_runtime.ready"')
				},
				{ timeout: 15000 },
			)
			.toBeTruthy()
		await stop(restarted)
		await stop(daemon)
		report.dashboardRestartConfirmed = true
		report.cleanDaemonShutdownConfirmed = true
	}
	report.ok = true
} catch (error) {
	report.failureClass = error?.constructor?.name
	report.error = String(error?.message || error)
		.replaceAll(config.dashboard.roomSecret, "[withheld]")
		.replaceAll(tokens.Friseer, "[withheld]")
		.replaceAll(tokens.jimmi, "[withheld]")
		.slice(0, 1600)
} finally {
	await browser?.close().catch(() => {})
	for (const child of children.toReversed()) {
		try {
			await stop(child)
		} catch {
			report.ok = false
		}
	}
	report.children = children.map(({ mode, child, forced }) => ({
		mode,
		pid: child.pid,
		exitCode: child.exitCode,
		signal: child.signalCode,
		forced: Boolean(forced),
	}))
	report.closedDatabaseError = children.some((child) => child.stderr.includes("database is not open"))
	if (report.closedDatabaseError) report.ok = false
	await fs.writeFile(path.join(root, "result.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 })
	for (const [index, child] of children.entries())
		await fs.writeFile(path.join(root, `child-${index}.log`), child.stdout + child.stderr, { flag: "wx", mode: 0o600 })
	console.log(JSON.stringify(report))
}
if (!report.ok) process.exitCode = 1
