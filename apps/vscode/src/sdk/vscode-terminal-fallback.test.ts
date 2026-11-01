import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CommandCompletionUnknownError, CommandExitError, CommandNotStartedError } from "@cline/core"
import { describe, expect, it, vi } from "vitest"
import type { VscodeTerminalManager } from "@/hosts/vscode/terminal/VscodeTerminalManager"
import { createVscodeRunCommandsTool } from "./vscode-run-commands-tool"

vi.mock("@cline/core", async (importOriginal) => {
	const adapter = await importOriginal<
		typeof import("@cline/core") & {
			createProcessShellExecutor: typeof import("@cline/core").createShellExecutor
		}
	>()
	return { ...adapter, createShellExecutor: adapter.createProcessShellExecutor }
})
vi.mock("@/core/storage/StateManager", () => ({ StateManager: { get: () => ({ getGlobalSettingsKey: () => "default" }) } }))
vi.mock("@/utils/shell", () => ({ getShellForProfile: () => "/bin/sh" }))
vi.mock("@/shared/services/Logger", () => ({ Logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@services/telemetry", () => ({ telemetryService: { captureTerminalExecution: vi.fn() } }))

describe.skipIf(process.platform === "win32")("foreground admission and monitored process fallback", () => {
	async function fixture(
		error: Error,
		run: (tool: ReturnType<typeof createVscodeRunCommandsTool>, root: string) => Promise<void>,
		timeout?: number,
	) {
		const root = await mkdtemp(join(process.env.CLINE_DATA_DIR || tmpdir(), "terminal-fallback-"))
		const manager = {
			getOrCreateTerminal: vi.fn(async () => {
				throw error
			}),
		} as unknown as VscodeTerminalManager
		const tool = createVscodeRunCommandsTool({ cwd: root, getTerminalManager: () => manager, bashTimeoutMs: timeout })
		try {
			await run(tool, root)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	}

	const context = { agentId: "fixture", conversationId: "terminal-fallback", iteration: 1 }
	it("executes an admitted command exactly once after a confirmed never-started terminal refusal", async () => {
		await fixture(new CommandNotStartedError("Shell integration cannot observe completion"), async (tool, root) => {
			const results = await tool.execute(
				{
					commands: [
						{
							command: "/usr/bin/python3",
							args: [
								"-c",
								"from pathlib import Path; p=Path('count'); p.write_text(p.read_text()+'x' if p.exists() else 'x'); print('FALLBACK_READY')",
							],
						},
					],
				},
				context,
			)
			expect(results).toEqual([
				expect.objectContaining({
					success: true,
					result: "FALLBACK_READY\n",
					execution: expect.objectContaining({ state: "completed", exitCode: 0 }),
				}),
			])
			expect(await readFile(join(root, "count"), "utf8")).toBe("x")
		})
	})
	it.each([
		new CommandCompletionUnknownError("Observation ended; command may still be running", "partial"),
		new CommandExitError(7, "confirmed failed command"),
		new Error("Unclassified terminal failure"),
	])("does not re-execute work after %s", async (error) => {
		await fixture(error, async (tool, root) => {
			const results = await tool.execute(
				{ commands: [{ command: "/usr/bin/touch", args: [join(root, "must-not-exist")] }] },
				context,
			)
			expect(results).toEqual([expect.objectContaining({ success: false })])
			await expect(readFile(join(root, "must-not-exist"))).rejects.toMatchObject({ code: "ENOENT" })
		})
	})
	it("retains output and the explicitly configured deadline in the fallback executor", async () => {
		await fixture(
			new CommandNotStartedError("No completion channel"),
			async (tool) => {
				const results = await tool.execute(
					{
						commands: [
							{
								command: "/usr/bin/python3",
								args: ["-u", "-c", "import time; print('PARTIAL_BEFORE_TIMEOUT'); time.sleep(5)"],
							},
						],
					},
					context,
				)
				expect(results).toEqual([
					expect.objectContaining({
						success: false,
						execution: expect.objectContaining({ state: "timed_out", terminationConfirmed: true }),
					}),
				])
				expect(JSON.stringify(results)).toContain("PARTIAL_BEFORE_TIMEOUT")
			},
			250,
		)
	})
	it("never dispatches fallback work after cancellation", async () => {
		await fixture(new CommandNotStartedError("No completion channel"), async (tool, root) => {
			const abort = new AbortController()
			abort.abort()
			const results = await tool.execute(
				{ commands: [{ command: "/usr/bin/touch", args: [join(root, "must-not-exist")] }] },
				{ ...context, signal: abort.signal },
			)
			expect(results).toEqual([
				expect.objectContaining({ success: false, execution: expect.objectContaining({ state: "aborted" }) }),
			])
			await expect(readFile(join(root, "must-not-exist"))).rejects.toMatchObject({ code: "ENOENT" })
		})
	})
})
