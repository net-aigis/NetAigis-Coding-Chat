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
	const layoutSessionId = "mobile-composer-layout"
	if (process.env.NETAIGIS_RUNTIME_MOBILE_COMPOSER === "1") {
		// Native persisted history with no agent, inference or tool execution.
		const { CoreSessionService, SqliteSessionStore } = await import(path.join(extension, "dist/plugin-runtime/node_modules/@cline/core/dist/index.js"))
		const db = new SqliteSessionStore({ sessionsDir: path.join(storage, "data/db") })
		try {
			const service = new CoreSessionService(db, { sessionArtifactsDir: path.join(storage, "data/sessions") })
			for (const sessionId of [layoutSessionId, `${layoutSessionId}-other`]) {
			await service.createRootSessionWithArtifacts({ sessionId, source: "vscode", pid: 0, status: "idle", interactive: true,
				provider: "openai-compatible", model: "layout-model", cwd: root, workspaceRoot: root, enableTools: false, enableSpawn: false, enableTeams: false })
			await service.persistSessionMessages(sessionId, Array.from({ length: 16 }, (_, index) => ({ id: `layout-${index}`, role: index % 2 ? "assistant" : "user",
				content: `Mobile layout history ${index}. ` + "Retained history. ".repeat(20), metadata: { author: { actorId: index % 4 ? "jimmi" : "Friseer" } } })))
		}
		} finally { db.close() }
	}
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
		let releaseAuthTicket
		let authPostWaiting = false
		if (process.env.NETAIGIS_RUNTIME_AUTH_COMMIT === "1") {
			const gate = new Promise(resolve => { releaseAuthTicket = resolve })
			let intercepted = false
			await page.route("**/actor-session?*", async route => {
				if (route.request().method() === "POST" && !intercepted) {
					intercepted = true
					authPostWaiting = true
					await gate
				}
				await route.continue()
			})
		}
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
		if (releaseAuthTicket) {
			await expect.poll(() => authPostWaiting && actorSockets.some(state => state.actor === "Friseer"), { timeout: 10000 }).toBe(true)
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).not.toHaveText(/Friseer/)
			releaseAuthTicket()
			report.explicitLoginWaitsForActualCookieCommit = true
		}
		await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
		if (process.env.NETAIGIS_RUNTIME_MOBILE_COMPOSER === "1") {
			await page.goto(`${config.dashboard.publicUrl}/chat?roomSecret=${config.dashboard.roomSecret}&id=${layoutSessionId}`, { waitUntil: "domcontentloaded" })
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
			await expect(page.getByRole("button", { name: "Übernehmen", exact: true })).toBeEnabled({ timeout: 15000 })
			const input = page.getByPlaceholder("Type @ for context and / for skills", { exact: true })
			await expect(input).toBeEnabled({ timeout: 15000 })
			const measurements = []
			for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 390, height: 430 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
				await page.setViewportSize(viewport)
				await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
				for (const [label, locator] of [["input", input], ["send", page.getByRole("button", { name: "Nachricht senden", exact: true })]]) {
					const geometry = await locator.evaluate(el => {
						const r = el.getBoundingClientRect()
						const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
						return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, reachable: hit === el || el.contains(hit) }
					})
					measurements.push({ label, ...geometry })
					assert(geometry.y >= 0 && geometry.x >= 0 && geometry.bottom <= geometry.height && geometry.right <= geometry.width && geometry.reachable,
						`${label} is clipped or unreachable at ${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`)
				}
				await input.tap()
				await input.fill("Unsent mobile layout test")
				await expect(input).toHaveValue("Unsent mobile layout test")
				const draftSend = await page.getByRole("button", { name: "Nachricht senden", exact: true }).boundingBox()
				assert(draftSend && draftSend.x >= 0 && draftSend.x + draftSend.width <= viewport.width && draftSend.y + draftSend.height <= viewport.height, "Draft notice or model label must not push Send outside the viewport")
				await input.fill("")
			}
			await page.setViewportSize({ width: 390, height: 844 })
			report.composerAndSendReachableWithoutScrollingAtFiveViewportSizes = measurements
			report.mobileDraftTypingWithoutSubmissionPassed = true
		}
		if (process.env.NETAIGIS_RUNTIME_COMPACT_MOBILE === "1") {
			const sizes = []
			for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 390, height: 430 }, { width: 844, height: 390 }]) {
				await page.setViewportSize(viewport)
				const log = page.getByRole("log")
				const box = await log.boundingBox()
				assert(box && box.height >= viewport.height * (viewport.height >= 640 ? 0.45 : 0.25), `Chat area too small at ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`)
				sizes.push({ ...viewport, chatHeight: box.height })
				const trigger = page.getByRole("button", { name: "Modell und Einstellungen", exact: true })
				await trigger.click()
				const dialog = page.getByRole("dialog", { name: "Modell und Einstellungen", exact: true })
				await expect(dialog).toBeVisible()
				const scroll = dialog.getByRole("region", { name: "Chat-Einstellungen", exact: true })
				const scrollState = await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; return { height: el.clientHeight, total: el.scrollHeight, top: el.scrollTop } })
				assert(scrollState.height > 0 && (scrollState.total <= scrollState.height || scrollState.top > 0), "Settings body cannot scroll to bottom")
				await expect(dialog.getByText("Auto-approves", { exact: true })).toBeVisible()
				const close = dialog.getByRole("button", { name: "Einstellungen schließen", exact: true })
				const visible = await close.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && (hit === el || el.contains(hit)) })
				assert(visible, "Settings close button clipped or covered after scroll")
				await close.click()
				await expect(dialog).toBeHidden()
				await trigger.click()
				await page.keyboard.press("Escape")
				await expect(dialog).toBeHidden()
				await expect(page.getByPlaceholder("Type @ for context and / for skills", { exact: true })).toBeEnabled()
			}
			report.compactChatAndScrollableClosableSettings = sizes
			await page.setViewportSize({ width: 390, height: 844 })
		}
		if (process.env.NETAIGIS_RUNTIME_WRITER_STATUS === "1") {
			await expect(page.getByRole("status", { name: "Schreibzugriff dieses Geräts", exact: true })).toHaveText("Lesend")
			await page.getByRole("button", { name: "Übernehmen", exact: true }).click()
			await expect(page.getByRole("status", { name: "Schreibzugriff dieses Geräts", exact: true })).toHaveText("Schreiben")
			await expect(page.getByRole("button", { name: "Übernehmen", exact: true })).toBeDisabled()
			await page.reload({ waitUntil: "domcontentloaded" })
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
			await expect(page.getByRole("status", { name: "Schreibzugriff dieses Geräts", exact: true })).toHaveText("Lesend")
			await page.getByRole("button", { name: "Übernehmen", exact: true }).click()
			await expect(page.getByRole("status", { name: "Schreibzugriff dieses Geräts", exact: true })).toHaveText("Schreiben")
			await page.getByText("Sitzungsdetails", { exact: true }).click()
			await page.getByRole("button", { name: "Freigeben", exact: true }).click()
			await page.getByText("Sitzungsdetails", { exact: true }).click()
			await expect(page.getByRole("status", { name: "Schreibzugriff dieses Geräts", exact: true })).toHaveText("Lesend")
			report.deviceWriterStatusClaimReloadAndReleasePassed = true
		}
		if (process.env.NETAIGIS_RUNTIME_BROWSER_DRAFT === "1") {
			const input = page.getByPlaceholder("Type @ for context and / for skills", { exact: true })
			const first = "Friseer: ungesendeter Entwurf mit Korrektur äöü"
			const second = "Zweite Sitzung: eigener Entwurf"
			let sent = 0
			page.on("websocket", socket => socket.on("framesent", event => { try { if (JSON.parse(String(event.payload)).type === "send") sent++ } catch {} }))
			await input.fill(first)
			await page.reload({ waitUntil: "domcontentloaded" })
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/, { timeout: 15000 })
			await expect(input).toHaveValue(first, { timeout: 15000 })
			const chooser = page.locator("select").first()
			await chooser.selectOption(`${layoutSessionId}-other`)
			await expect(input).toBeEnabled()
			await expect(input).toHaveValue("")
			await input.fill(second)
			await chooser.selectOption(layoutSessionId)
			await expect(input).toBeEnabled()
			await expect(input).toHaveValue(first)
			await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
			await page.getByRole("button", { name: "Abmelden", exact: true }).click()
			await expect(input).toHaveValue("")
			await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
			await page.getByLabel("Eigener Sitzungszugang", { exact: true }).fill(tokens.jimmi)
			await page.getByRole("button", { name: "Verbinden", exact: true }).click()
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/jimmi/)
			await expect(input).toHaveValue("")
			await input.fill("jimmi: eigener Entwurf")
			await page.reload({ waitUntil: "domcontentloaded" })
			await expect(input).toHaveValue("jimmi: eigener Entwurf", { timeout: 15000 })
			await input.fill("")
			await page.reload({ waitUntil: "domcontentloaded" })
			await expect(input).toBeEnabled()
			await expect(input).toHaveValue("")
			assert.equal(sent, 0, "Restoring a draft must never submit or replay a model turn")
			const contrasts = []
			for (const dark of [false, true]) {
				await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark)
				const contrast = await page.evaluate(() => {
					const input = document.querySelector('textarea[placeholder="Type @ for context and / for skills"]')
					const button = document.querySelector('button[aria-label="Nachricht senden"]')
					const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true })
					function color(css) { context.clearRect(0, 0, 1, 1); context.fillStyle = css; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
					function luminance(rgb) { return rgb.slice(0, 3).map(x => { const v = x / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0) }
					function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
					const style = getComputedStyle(button), bg = color(getComputedStyle(document.body).backgroundColor)
					return { buttonRatio: ratio(color(style.color), color(style.backgroundColor)), placeholderRatio: ratio(color(getComputedStyle(input, "::placeholder").color), bg), visibleSendLabel: button.textContent.includes("Senden") }
				})
				assert(contrast.visibleSendLabel && contrast.buttonRatio >= 4.5 && contrast.placeholderRatio >= 4.5, `Insufficient contrast: ${JSON.stringify(contrast)}`)
				contrasts.push({ dark, ...contrast })
			}
			await page.evaluate(() => document.documentElement.classList.remove("dark"))
			report.actualRenderedComposerContrast = contrasts
			report.unsentDraftReloadSessionActorAndLogoutIsolationPassed = true
			report.draftRestorationNeverSubmittedAMessage = true
			// Return to the existing Friseer auth/wake smoke contract.
			await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
			await page.getByRole("button", { name: "Abmelden", exact: true }).click()
			await page.getByRole("button", { name: "Sitzungszugang", exact: true }).click()
			await page.getByLabel("Eigener Sitzungszugang", { exact: true }).fill(tokens.Friseer)
			await page.getByRole("button", { name: "Verbinden", exact: true }).click()
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/)
			await expect(input).toHaveValue("")
		}
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
		await page.setViewportSize({ width: 1280, height: 800 })
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
		const png = await fs.readFile(path.join(sourceExtension, "assets/icons/netaigis-coding-chat.png"))
		assert.deepEqual(await fs.readFile(path.join(extension, "dist/shared-runtime/webview/icon.png")), png)
		await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/icon.png")
		const image = page.locator('header[aria-label="NetAigis Coding Chat Kopfbereich"] img')
		await expect(image).toBeVisible()
		assert(await image.evaluate(el => el.complete && el.naturalWidth === 1254 && el.naturalHeight === 1254), "User-supplied NetAigis logo did not decode")
		const downloaded = await image.evaluate(async el => {
			// Use the actual browser's narrowly pinned fixture TLS context, not
			// Playwright's separate HTTP client with different trust settings.
			const response = await fetch(el.currentSrc, { cache: "no-store" })
			const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer())
			return { status: response.status, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("") }
		})
		assert.equal(downloaded.status, 200)
		assert.equal(downloaded.sha256, createHash("sha256").update(await fs.readFile(path.join(sourceExtension, "assets/icons/netaigis-coding-chat-large.png"))).digest("hex"))
		report.actualUserSuppliedPngIconsDecodedAndMatched = true
		report.ownBrowserIdentityAndSharedRuntimeControlsConfirmed = true
		if (process.env.NETAIGIS_RUNTIME_BROWSER_DRAFT === "1") {
			await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Blocked test storage", "SecurityError") } }))
			await page.goto(`${config.dashboard.publicUrl}/chat?roomSecret=${config.dashboard.roomSecret}&id=${layoutSessionId}`, { waitUntil: "domcontentloaded" })
			const input = page.getByPlaceholder("Type @ for context and / for skills", { exact: true })
			await expect(page.getByRole("button", { name: "Sitzungszugang", exact: true })).toHaveText(/Friseer/)
			await expect(input).toBeEnabled()
			await input.fill("Entwurf bei gesperrtem Browserspeicher")
			await expect(input).toHaveValue("Entwurf bei gesperrtem Browserspeicher")
			await expect(page.getByText("Entwurf ungesichert", { exact: true })).toBeVisible()
			report.blockedBrowserStorageKeepsTypingAndShowsUnsavedWarning = true
		}

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
		.replaceAll(/__Host-netaigis_actor=[a-f0-9]+/g, "__Host-netaigis_actor=[withheld]")
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
