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
	const env = { ...process.env, OTEL_SDK_DISABLED: "true", CLINE_DIR: path.join(root, "unselected-storage") }
	for (const key of ["CLINE_DATA_DIR", "CLINE_DB_DATA_DIR", "CLINE_SESSION_DATA_DIR", "CLINE_TEAM_DATA_DIR",
		"CLINE_CONNECTOR_DATA_DIR", "CLINE_CONNECTOR_SETTINGS_PATH", "CLINE_CONNECTORS_DB_PATH", "CLINE_CRON_DB_PATH",
		"CLINE_TASKS_DB_PATH", "CLINE_PROVIDER_SETTINGS_PATH", "CLINE_GLOBAL_SETTINGS_PATH", "CLINE_MCP_SETTINGS_PATH"])
		delete env[key]
	const child = spawn("bun", ["--no-env-file", path.join(extension, "dist/shared-runtime/netaigis-runtime.mjs"), mode, file], {
		cwd: root,
		env,
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
	if (process.env.NETAIGIS_RUNTIME_OWNER_DRAIN === "1") {
		const owner = JSON.parse(await fs.readFile(discovery, "utf8"))
		const endpoint = `http://127.0.0.1:${hubPort}/drain`
		const drain = (token, suffix = "") => fetch(endpoint + suffix, {
			method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		})
		assert.equal((await drain()).status, 401)
		assert.equal((await drain(tokens.Friseer)).status, 401)
		assert.equal((await drain(tokens.jimmi)).status, 401)
		const closed = await drain(owner.authToken)
		assert.equal(closed.status, 200)
		const status = await closed.json()
		assert.equal(status.draining, true)
		assert.equal(status.idle, true)
		assert.equal(daemon.child.exitCode, null, "Drain must not terminate the runtime")
		const reopened = await drain(owner.authToken, "?off")
		assert.equal(reopened.status, 200)
		assert.equal((await reopened.json()).draining, false)
		report.existingOwnerHttpDrainConfirmedWithActorAuthentication = true
		report.personalHttpTokensCannotDrain = true
	}
	if (process.platform === "linux") {
		const directory = `/proc/${daemon.child.pid}/fd`
		const descriptors = await fs.readdir(directory)
		const targets = await Promise.all(descriptors.map((name) => fs.readlink(path.join(directory, name)).catch(() => "")))
		const databases = targets.filter((file) => /\.db(?:-wal|-shm)?$/.test(file))
		assert(databases.length > 0, "No actual database descriptor was observed")
		assert(databases.every((file) => file.startsWith(`${storage}/data/`)), "Packaged runtime opened an unselected storage root")
		report.actualDatabasePathsBoundToSelectedOwnStorage = true
	}
	await assert.rejects(fs.stat(path.join(root, "unselected-storage")), { code: "ENOENT" })
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
		const actorSockets = []
		page.on("websocket", socket => {
			if (!socket.url().includes("/browser")) return
			const state = { socket, actor: undefined }
			actorSockets.push(state)
			socket.on("framereceived", event => {
				try { const frame = JSON.parse(String(event.payload)); if (frame.type === "shared_actor") state.actor = frame.actorId } catch {}
			})
		})
		await page.goto(`${config.dashboard.publicUrl}/chat?roomSecret=${config.dashboard.roomSecret}`, {
			waitUntil: "domcontentloaded",
		})
		await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
		await page.getByLabel("Eigener Sitzungszugang", { exact: true }).fill(tokens.Friseer)
		await page.getByRole("button", { name: "Verbinden", exact: true }).click()
		await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
		if (process.env.NETAIGIS_RUNTIME_BROWSER_WAKE === "1") {
			const account = page.getByRole("button", { name: "Sitzungszugang", exact: true })
			const header = page.getByRole("banner", { name: "NetAigis Coding Chat Kopfbereich" })
			const bounds = await account.boundingBox()
			assert(bounds && bounds.y < 24 && bounds.x + bounds.width > 360, "Account control must be at the top right of the mobile viewport")
			await account.click()
			await expect(header.getByRole("button", { name: "Abmelden", exact: true })).toBeVisible()
			await account.click()
			const beforeWake = actorSockets.length
			await page.evaluate(() => {
				let visibility = "hidden"
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
				document.dispatchEvent(new Event("visibilitychange"))
				visibility = "visible"
				document.dispatchEvent(new Event("visibilitychange"))
				delete document.visibilityState
			})
			await expect.poll(() => actorSockets.slice(beforeWake).some(state => state.actor === "Friseer"), { timeout: 15000 }).toBe(true)
			await expect(account).toHaveText(/Friseer/)
			report.accountMenuAtTopRightWithLogoutInsideHeader = true
			report.simulatedScreenWakeCreatedNewSocketAndReauthenticatedPersonalActor = true
			report.physicalScreenWakeTested = false
		}
		if (process.env.NETAIGIS_RUNTIME_BROWSER_RELOAD === "1") {
			await expect.poll(async () => (await browser.cookies()).some(cookie => cookie.name === "__Host-netaigis_actor" && cookie.httpOnly && cookie.secure && cookie.sameSite === "Strict"), { timeout: 10000 }).toBe(true)
			const storageValues = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, readableCookie: document.cookie }))
			assert(!storageValues.includes(tokens.Friseer) && !storageValues.includes(tokens.jimmi) && !storageValues.includes("__Host-netaigis_actor"), "Personal browser credential or private cookie is script-readable")
			await page.reload({ waitUntil: "domcontentloaded" })
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
			await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
			await page.getByRole("button", { name: "Abmelden", exact: true }).click()
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Verbinden/)
			await page.reload({ waitUntil: "domcontentloaded" })
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Verbinden/)
			assert(!(await browser.cookies()).some(cookie => cookie.name === "__Host-netaigis_actor"))
			await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
			await page.getByLabel("Eigener Sitzungszugang", { exact: true }).fill(tokens.Friseer)
			await page.getByRole("button", { name: "Verbinden", exact: true }).click()
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
			report.browserReloadReauthenticatesSamePersonalActor = true
			report.browserCookieHttpOnlySecureStrictWithoutPersonalKeyStorage = true
			report.browserLogoutRevokedAndRemainsSignedOutAfterReload = true
		}
		report.packagedAssetsAndPersonalAuthenticationConfirmed = true
		await expect(page).toHaveTitle(identity.displayName)
		await page.getByRole("button", { name: "Home", exact: true }).click()
		await expect(page.getByRole("heading", { name: identity.displayName, exact: true })).toBeVisible()
		await expect(page.getByText(`v${identity.version}`, { exact: true })).toBeVisible()
		await expect(page.getByRole("link", { name: "Repository", exact: true })).toHaveAttribute(
			"href", "https://git.wittmer.software/AIGIS/cline",
		)
		await expect(page.getByRole("button", { name: "Restart", exact: true })).toHaveCount(0)
		await expect(page.getByRole("button", { name: "Account", exact: true })).toHaveCount(0)
		for (const asset of ["icon.svg", "favicon.svg", "cline-logo-filled.svg"]) {
			assert.deepEqual(
				await fs.readFile(path.join(extension, "dist/shared-runtime/webview", asset)),
				await fs.readFile(path.join(sourceExtension, "assets/icons/netaigis-coding-chat.svg")),
			)
		}
		report.ownBrowserIdentityAndSharedRuntimeControlsConfirmed = true
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
