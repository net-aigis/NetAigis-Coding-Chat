/** Real ExtensionHost tests; all credentials/data below are explicit fixtures. */
import * as assert from "node:assert/strict"
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"

const OLD = "saoudrizwan.claude-dev",
	OWN = "netaigis.netaigis-coding-chat",
	PREFIX = "netaigis-coding-chat"
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
export async function run() {
	const root = process.env.IDENTITY_TEST_ROOT!,
		phase = process.env.IDENTITY_TEST_PHASE!,
		checks: string[] = []
	const mark = (name: string) => checks.push(name)
	const transfer = process.env.IDENTITY_TEST_TRANSFER || path.join(root, "transfer"),
		home = process.env.IDENTITY_TEST_HOME || path.join(root, "source-home"),
		profile = process.env.IDENTITY_TEST_PROFILE_ROOT || path.join(root, "user-data"),
		suffix = process.env.IDENTITY_TEST_RESULT_SUFFIX || ""
	try {
		if (phase === "seed") {
			const old = vscode.extensions.getExtension(OLD)
			assert.ok(old)
			const api = await old.activate()
			assert.equal(await api.secretDigest("openAiApiKey"), digest("fixture-real-native-token"))
			mark("old ID owns actual native fixture secret")
			await api.exportIdentityTransfer({
				directory: transfer,
				roots: [{ from: home, to: "home" }],
			})
			mark("old-context export completed without exposing secrets")
		} else {
			const original = vscode.extensions.getExtension(OLD),
				fork = vscode.extensions.getExtension(OWN)
			assert.ok(original)
			assert.ok(fork)
			assert.equal(fork.packageJSON.version, "0.1.0")
			assert.equal(fork.packageJSON.displayName, "NetAigis Coding Chat")
			assert.notEqual(original.extensionPath, fork.extensionPath)
			mark(
				phase === "fallback"
					? "old-ID export context and own ID discovered together"
					: "installed Cline copy and own ID discovered together",
			)
			const environment = [
				process.env.CLINE_DIR,
				process.env.CLINE_DATA_DIR,
				process.env.CLINE_SESSION_DATA_DIR,
				process.env.CLINE_DB_DATA_DIR,
				process.env.NETAIGIS_RECALL_QUEUE_DIR,
			]
			const api = await fork.activate(),
				status = api.identityMigrationStatus()
			assert.deepEqual(
				[
					process.env.CLINE_DIR,
					process.env.CLINE_DATA_DIR,
					process.env.CLINE_SESSION_DATA_DIR,
					process.env.CLINE_DB_DATA_DIR,
					process.env.NETAIGIS_RECALL_QUEUE_DIR,
				],
				environment,
			)
			const commands = await vscode.commands.getCommands(true)
			const oldIds = new Set((original.packageJSON.contributes?.commands ?? []).map((c: { command: string }) => c.command))
			for (const c of fork.packageJSON.contributes.commands) assert.ok(!oldIds.has(c.command), "Command collision")
			if (phase !== "fallback") mark("manifest commands do not collide with actual Original Cline")

			const ownViews = Object.values(fork.packageJSON.contributes.views).flat() as { id: string }[]
			const originalViews = Object.values(original.packageJSON.contributes?.views ?? {}).flat() as { id: string }[]
			for (const view of ownViews) assert.ok(!originalViews.some((old) => old.id === view.id), "View collision")
			if (phase !== "fallback") mark("sidebar and view IDs are separate from Original Cline")

			if (phase === "import") {
				assert.equal(status.mode, "migration")
				assert.equal(status.migrationComplete, false)
				const file = path.join(transfer, "payload/home/data/secrets.json"),
					bytes = fs.readFileSync(file)
				fs.writeFileSync(file, "{}")
				await assert.rejects(Promise.resolve(vscode.commands.executeCommand(`${PREFIX}.migration.preview`, transfer)))
				fs.writeFileSync(file, bytes)
				mark("damaged transfer rejected in actual host")
				let plan = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.preview`, transfer)
				assert.equal(plan.existingNativeKeys, 0)
				mark("new ID cannot see old native secrets before transfer")
				const first = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.apply`, plan.ticket)
				assert.equal(first.repeated, false)
				assert.equal(api.identityMigrationStatus().migrationComplete, true)
				mark("actual new-context native and file import verified")
				plan = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.preview`, transfer)
				const second = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.apply`, plan.ticket)
				assert.equal(second.repeated, true)
				mark("repeat import is idempotent in actual ExtensionHost")
				const rollback = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.rollbackPreview`)
				await vscode.commands.executeCommand(`${PREFIX}.migration.rollbackApply`, rollback.ticket)
				assert.equal(api.identityMigrationStatus().migrationComplete, false)
				mark("committed migration rolled back in actual new-ID context")
				plan = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.preview`, transfer)
				assert.equal(plan.existingNativeKeys, 0)
				await vscode.commands.executeCommand(`${PREFIX}.migration.apply`, plan.ticket)
				mark("reimport after checked rollback succeeds")
			} else if (phase.startsWith("restart")) {
				assert.equal(status.migrationComplete, true)
				assert.equal(status.mode, "runtime")
				for (const id of [`${PREFIX}.plusButtonClicked`, `${PREFIX}.settingsButtonClicked`, `${PREFIX}.recall.configure`])
					assert.ok(commands.includes(id), `Missing actual registration: ${id}`)
				mark("fresh host starts actual fork with own command registrations")
				const source = fs.readFileSync(path.join(home, "data/secrets.json")),
					target = fs.readFileSync(path.join(status.storageRoot, "home/data/secrets.json"))
				assert.equal(JSON.parse(target.toString()).openAiApiKey, JSON.parse(source.toString()).openAiApiKey)
				const state = JSON.parse(fs.readFileSync(path.join(status.storageRoot, "home/data/globalState.json"), "utf8"))
				assert.equal(state.openAiBaseUrl, "http://127.0.0.1:21436/v1")
				mark("restart retains endpoint and protected provider credential")
				const oldRoot = path.join(profile, "User/globalStorage", OLD)
				const originalMessages = fs.readFileSync(path.join(oldRoot, "tasks/legacy-session/api_conversation_history.json"))
				assert.deepEqual(
					fs.readFileSync(path.join(status.storageRoot, "legacy/tasks/legacy-session/api_conversation_history.json")),
					originalMessages,
				)
				mark("legacy session authors and unknown process state survive actual restart")
				await original.activate()
				assert.equal(original.isActive, true)
				mark("actual original code activates beside the own fork")
			} else if (phase === "verify-final") {
				assert.equal(status.mode, "migration")
				assert.equal(status.migrationComplete, true)
				const plan = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.preview`, transfer)
				assert.ok(plan.existingNativeKeys >= 2)
				const result = await vscode.commands.executeCommand<any>(`${PREFIX}.migration.apply`, plan.ticket)
				assert.equal(result.repeated, true)
				mark("final migration transaction retains persisted own-ID native credentials after two real restarts")
			} else if (phase === "fallback") {
				const old = vscode.extensions.getExtension(OLD)
				assert.ok(old)
				const oldApi = await old.activate()
				assert.equal(await oldApi.secretDigest("openAiApiKey"), digest("fixture-real-native-token"))
				mark("old native secret remains readable by its actual old-ID context after fork restarts")
			}
		}
		fs.writeFileSync(
			path.join(root, `result-${phase}${suffix}.json`),
			JSON.stringify(
				{ phase, checks, passed: checks.length, vscodeVersion: vscode.version, versions: process.versions },
				null,
				2,
			),
			{ mode: 0o600 },
		)
	} catch (error) {
		fs.writeFileSync(
			path.join(root, `result-${phase}${suffix}.json`),
			JSON.stringify(
				{ phase, checks, passed: checks.length, error: error instanceof Error ? error.message : "host test failed" },
				null,
				2,
			),
			{ mode: 0o600 },
		)
		throw error
	}
}
