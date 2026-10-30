import { describe, expect, it, vi } from "vitest"
import { createVscodeRunCommandsTool } from "./vscode-run-commands-tool"

// The common test adapter supplies a no-op executor. This regression needs
// the real child-process implementation and its independent deadline.
vi.mock("@cline/core", async (importOriginal) => {
	const adapter = await importOriginal<
		typeof import("@cline/core") & {
			createProcessShellExecutor: typeof import("@cline/core").createShellExecutor
		}
	>()
	return { ...adapter, createShellExecutor: adapter.createProcessShellExecutor }
})

vi.mock("@/core/storage/StateManager", () => ({
	StateManager: { get: () => ({ getGlobalSettingsKey: () => "default" }) },
}))
vi.mock("@/utils/shell", () => ({ getShell: () => "/bin/sh", getShellForProfile: () => "/bin/sh" }))
vi.mock("@/shared/services/Logger", () => ({ Logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@services/telemetry", () => ({ telemetryService: { captureTerminalExecution: vi.fn() } }))

const context = { agentId: "background-test", conversationId: "isolated-test", iteration: 1 }
const createTool = (bashTimeoutMs?: number) =>
	createVscodeRunCommandsTool({
		cwd: process.cwd(),
		vscodeTerminalExecutionMode: "backgroundExec",
		bashTimeoutMs,
		getTerminalManager: () => {
			throw new Error("Background execution must not acquire a terminal")
		},
	})

describe.skipIf(process.platform === "win32")("background execution deadline", () => {
	it.concurrent.each([30, 40, 45, 60, 90])("allows sleep %s to finish under the VS Code command budget", async (seconds) => {
		const started = performance.now()
		const result = await createTool().execute({ commands: [`printf start; sleep ${seconds}; printf end`] }, context)
		expect(result).toEqual([expect.objectContaining({ success: true, result: "startend" })])
		expect(performance.now() - started).toBeGreaterThanOrEqual(seconds * 1000 - 100)
	}, 110_000)

	it("honors an explicitly shorter deadline and retains output from the terminated child", async () => {
		const result = await createTool(250).execute({ commands: ["printf before-timeout; sleep 5"] }, context)
		expect(result).toEqual([
			expect.objectContaining({
				success: false,
				execution: expect.objectContaining({ state: "timed_out", terminationConfirmed: true }),
			}),
		])
		expect(JSON.stringify(result)).toContain("before-timeout")
	})
})
