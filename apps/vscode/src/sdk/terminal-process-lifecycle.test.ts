import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as vscode from "vscode"
import { getUnobservedTerminalCommandDisposition } from "@/integrations/terminal/types"
import { VscodeTerminalProcess } from "@/hosts/vscode/terminal/VscodeTerminalProcess"

vi.mock("vscode", () => ({ window: { onDidEndTerminalShellExecution: vi.fn(), onDidCloseTerminal: vi.fn() } }))
vi.mock("@/shared/services/Logger", () => ({ Logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }))
vi.mock("@services/telemetry", () => ({
	TerminalOutputFailureReason: {},
	telemetryService: { captureTerminalOutputFailure: vi.fn(), captureTerminalExecution: vi.fn() },
}))
vi.mock("@/hosts/vscode/terminal/get-latest-output", () => ({ getLatestTerminalOutput: vi.fn(async () => "") }))

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("authoritative terminal completion", () => {
	it.each([30, 40, 45, 60, 90])("keeps a quiet sleep %s pending until its actual end event", async (seconds) => {
		vi.useFakeTimers({ now: 0 })
		const events = new EventEmitter()
		vi.spyOn(vscode.window, "onDidEndTerminalShellExecution").mockImplementation((listener) => {
			events.on("end", listener)
			return {
				dispose() {
					events.off("end", listener)
				},
			}
		})
		vi.spyOn(vscode.window, "onDidCloseTerminal").mockImplementation((listener) => {
			events.on("close", listener)
			return {
				dispose() {
					events.off("close", listener)
				},
			}
		})
		let finish!: () => void
		const finishing = new Promise<void>((resolve) => {
			finish = resolve
		})
		const execution = {
			read: () => ({
				async *[Symbol.asyncIterator]() {
					yield "operator@fixture:~$ "
					await finishing
				},
			}),
		}
		const terminal = { shellIntegration: { executeCommand: () => execution } } as unknown as vscode.Terminal
		const process = new VscodeTerminalProcess()
		const completed = vi.fn()
		process.on("completed", completed)
		const running = process.run(terminal, `sleep ${seconds}`)
		await vi.advanceTimersByTimeAsync(4000)
		expect(completed).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(seconds * 1000 - 4000)
		expect(completed).not.toHaveBeenCalled()
		finish()
		events.emit("end", { terminal, execution, exitCode: 0 })
		await running
		expect(completed).toHaveBeenCalledOnce()
		expect(process.getCompletionDetails()).toMatchObject({ exitCode: 0 })
	})

	it("does not dispatch a command when the terminal offers no completion channel", async () => {
		const terminal = { sendText: vi.fn() } as unknown as vscode.Terminal
		const process = new VscodeTerminalProcess()
		const errors: unknown[] = []
		process.on("error", (error) => errors.push(error))
		await process.run(terminal, "sleep 60")
		expect(terminal.sendText).not.toHaveBeenCalled()
		expect(errors[0]).toMatchObject({ execution: { state: "not_started" } })
	})

	it("retains the final output flushed after the matching execution-end event", async () => {
		vi.useFakeTimers()
		const events = new EventEmitter()
		vi.spyOn(vscode.window, "onDidEndTerminalShellExecution").mockImplementation((listener) => {
			events.on("end", listener)
			return {
				dispose() {
					events.off("end", listener)
				},
			}
		})
		vi.spyOn(vscode.window, "onDidCloseTerminal").mockReturnValue({ dispose() {} })
		const execution = {
			read: () => ({
				async *[Symbol.asyncIterator]() {
					yield "\x1b]633;C\x07first\n"
					await new Promise((resolve) => setTimeout(resolve, 25))
					yield "last stdout/stderr\n"
				},
			}),
		}
		const terminal = { shellIntegration: { executeCommand: () => execution } } as unknown as vscode.Terminal
		const process = new VscodeTerminalProcess()
		const lines: string[] = []
		process.on("line", (line) => lines.push(line))
		const running = process.run(terminal, "fixture")
		await vi.advanceTimersByTimeAsync(0)
		events.emit("end", { terminal, execution, exitCode: 0 })
		await vi.advanceTimersByTimeAsync(1000)
		await running
		expect(lines).toContain("last stdout/stderr")
	})

	it("does not promote a D-marker code to a confirmed exit when the end event has no code", async () => {
		const events = new EventEmitter()
		vi.spyOn(vscode.window, "onDidEndTerminalShellExecution").mockImplementation((listener) => {
			events.on("end", listener)
			return {
				dispose() {
					events.off("end", listener)
				},
			}
		})
		vi.spyOn(vscode.window, "onDidCloseTerminal").mockReturnValue({ dispose() {} })
		const execution = {
			read: () => ({
				async *[Symbol.asyncIterator]() {
					yield "\x1b]633;C\x07partial\n\x1b]633;D;0\x07"
				},
			}),
		}
		const terminal = { shellIntegration: { executeCommand: () => execution } } as unknown as vscode.Terminal
		const process = new VscodeTerminalProcess()
		const completed = vi.fn()
		process.on("completed", completed)
		const running = process.run(terminal, "fixture")
		await Promise.resolve()
		events.emit("end", { terminal, execution, exitCode: undefined })
		await running
		expect(completed).not.toHaveBeenCalled()
		expect(process.getCompletionDetails().exitCode).toBeUndefined()
	})

	it.each([
		"managed",
		"continued",
		"detached",
	] as const)("preserves an unobserved %s command at the next acquisition", (ownership) => {
		expect(getUnobservedTerminalCommandDisposition({ source: "sendText", ownership })).toBe("preserve")
	})
})
