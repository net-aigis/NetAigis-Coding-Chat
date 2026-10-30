import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "mocha"
import * as sinon from "sinon"
import * as vscode from "vscode"
import { setVscodeHostProviderMock } from "@/test/host-provider-test-utils"
import { VscodeTerminalManager } from "./VscodeTerminalManager"
import { VscodeTerminalProcess } from "./VscodeTerminalProcess"
import { TerminalInfo, TerminalRegistry } from "./VscodeTerminalRegistry"

function createNeverEndingStream(): AsyncIterable<string> {
	return {
		async *[Symbol.asyncIterator]() {
			await new Promise(() => {})
		},
	}
}

function createMarkerlessStream(): AsyncIterable<string> {
	return {
		async *[Symbol.asyncIterator]() {
			yield "remote output\n"
			yield "user@remote:~$ "
			await new Promise(() => {})
		},
	}
}

function createFailingStream(error: Error): AsyncIterable<string> {
	return {
		async *[Symbol.asyncIterator]() {
			throw error
		},
	}
}

describe("VscodeTerminalManager", () => {
	let sandbox: sinon.SinonSandbox
	let manager: VscodeTerminalManager

	beforeEach(() => {
		sandbox = sinon.createSandbox({
			useFakeTimers: { toFake: ["setTimeout", "clearTimeout", "Date"], shouldClearNativeTimers: true },
		})
		manager = new VscodeTerminalManager()
	})

	afterEach(() => {
		manager.disposeAll()
		TerminalRegistry.disposeTerminalsPendingCleanup()
		sandbox.restore()
	})

	it("creates a fresh terminal after timing out an unconfirmed reused-terminal cwd change", async () => {
		setVscodeHostProviderMock()
		const targetCwd = "/tmp/cline-target"
		const executeCommandStub = sandbox.stub().returns({
			read: () => createNeverEndingStream(),
		})
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {
					cwd: vscode.Uri.file("/tmp/cline-original"),
					executeCommand: executeCommandStub,
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}
		const getAllTerminalsStub = sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		let didResolve = false
		const terminalPromise = manager.getOrCreateTerminal(targetCwd).then((terminal) => {
			didResolve = true
			return terminal
		})

		await sandbox.clock.tickAsync(4999)
		assert.equal(didResolve, false)

		await sandbox.clock.tickAsync(1)
		const terminal = (await terminalPromise) as unknown as TerminalInfo

		try {
			assert.notEqual(terminal, terminalInfo)
			assert.equal(terminalInfo.busy, false)
			assert.equal(terminalInfo.pendingCwdChange, undefined)
			assert.equal(terminalInfo.cwdResolved, undefined)
			assert.equal(terminal.busy, true)
			assert.equal(getAllTerminalsStub.called, true)
			assert.equal(executeCommandStub.calledOnceWith(`cd "${targetCwd}"`), true)
		} finally {
			terminal.terminal.dispose()
			TerminalRegistry.removeTerminal(terminal.id)
		}
	})

	it("reuses a terminal after its cwd change is confirmed", async () => {
		const targetCwd = "/tmp/cline-target"
		let currentCwd = vscode.Uri.file("/tmp/cline-original")
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {
					get cwd() {
						return currentCwd
					},
					executeCommand: () => ({
						read: () => ({
							async *[Symbol.asyncIterator]() {
								currentCwd = vscode.Uri.file(targetCwd)
							},
						}),
					}),
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}
		sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		const terminalPromise = manager.getOrCreateTerminal(targetCwd)
		await sandbox.clock.tickAsync(100)
		const terminal = await terminalPromise

		assert.equal(terminal, terminalInfo)
		assert.equal(terminalInfo.busy, true)
		assert.equal(terminalInfo.pendingCwdChange, undefined)
		assert.equal(terminalInfo.cwdResolved, undefined)
		sinon.assert.calledOnceWithExactly(terminalInfo.terminal.show as sinon.SinonStub, true)
	})

	it("reveals the terminal without taking focus when running a command", async () => {
		// Reveal-only test: stub the process so no command stream or VS Code
		// event listeners outlive the test.
		sandbox.stub(VscodeTerminalProcess.prototype, "run").resolves()
		const showStub = sandbox.stub()
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {},
				show: showStub,
			} as unknown as vscode.Terminal,
		}

		manager.runCommand(terminalInfo as unknown as Parameters<VscodeTerminalManager["runCommand"]>[0], "echo hi")

		sinon.assert.calledOnceWithExactly(showStub, true)
	})

	it("releases a reused terminal reservation when showing it fails", async () => {
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: { cwd: vscode.Uri.file("/tmp/cline-original") },
				show: sandbox.stub().throws(new Error("terminal closed")),
			} as unknown as vscode.Terminal,
		}
		sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		await assert.rejects(manager.getOrCreateTerminal("/tmp/cline-target"), /terminal closed/)

		assert.equal(terminalInfo.busy, false)
		assert.equal(terminalInfo.pendingCwdChange, undefined)
		assert.equal(terminalInfo.cwdResolved, undefined)
	})

	it("creates a fresh terminal when the reused-terminal cwd command cannot start", async () => {
		setVscodeHostProviderMock()
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {
					cwd: vscode.Uri.file("/tmp/cline-original"),
					executeCommand: () => {
						throw new Error("cwd command failed")
					},
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}
		sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		const terminal = (await manager.getOrCreateTerminal("/tmp/cline-target")) as unknown as TerminalInfo
		try {
			assert.notEqual(terminal, terminalInfo)
			assert.equal(terminal.busy, true)
			assert.equal(terminalInfo.busy, false)
			assert.equal(terminalInfo.pendingCwdChange, undefined)
			assert.equal(terminalInfo.cwdResolved, undefined)
			assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined)
		} finally {
			terminal.terminal.dispose()
			TerminalRegistry.removeTerminal(terminal.id)
		}
	})

	it("creates a fresh terminal when the reused-terminal cwd command stream fails", async () => {
		setVscodeHostProviderMock()
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {
					cwd: vscode.Uri.file("/tmp/cline-original"),
					executeCommand: () => ({ read: () => createFailingStream(new Error("cwd stream failed")) }),
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}
		sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		const terminal = (await manager.getOrCreateTerminal("/tmp/cline-target")) as unknown as TerminalInfo
		try {
			assert.notEqual(terminal, terminalInfo)
			assert.equal(terminal.busy, true)
			assert.equal(terminalInfo.busy, false)
			assert.equal(terminalInfo.pendingCwdChange, undefined)
			assert.equal(terminalInfo.cwdResolved, undefined)
			assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined)
		} finally {
			terminal.terminal.dispose()
			TerminalRegistry.removeTerminal(terminal.id)
		}
	})

	it("releases a reused terminal reservation when it closes during cwd setup", async () => {
		let exitStatus: vscode.TerminalExitStatus | undefined
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				get exitStatus() {
					return exitStatus
				},
				shellIntegration: {
					cwd: vscode.Uri.file("/tmp/cline-original"),
					executeCommand: () => ({ read: createNeverEndingStream }),
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}
		sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		const rejectedAcquisition = assert.rejects(manager.getOrCreateTerminal("/tmp/cline-target"), /exited while preparing/)
		exitStatus = { code: undefined, reason: vscode.TerminalExitReason.Unknown }
		await sandbox.clock.tickAsync(5000)
		await rejectedAcquisition

		assert.equal(terminalInfo.busy, false)
		assert.equal(terminalInfo.pendingCwdChange, undefined)
		assert.equal(terminalInfo.cwdResolved, undefined)
	})

	it("reserves different terminals for parallel acquisitions", async () => {
		setVscodeHostProviderMock()
		const first = (await manager.getOrCreateTerminal("/tmp/cline-parallel")) as unknown as TerminalInfo
		const second = (await manager.getOrCreateTerminal("/tmp/cline-parallel")) as unknown as TerminalInfo

		try {
			assert.notEqual(first.id, second.id)
			assert.equal(first.busy, true)
			assert.equal(second.busy, true)
		} finally {
			first.terminal.dispose()
			second.terminal.dispose()
			TerminalRegistry.removeTerminal(first.id)
			TerminalRegistry.removeTerminal(second.id)
		}
	})

	it("rejects the command and releases the terminal when process startup fails", async () => {
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: true,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {
					executeCommand: () => {
						throw new Error("command startup failed")
					},
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}

		const process = manager.runCommand(
			terminalInfo as unknown as Parameters<VscodeTerminalManager["runCommand"]>[0],
			"failing-command",
		)

		await assert.rejects(process, /command startup failed/)
		assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined)
	})

	it("does not reuse a terminal after its command stream fails", async () => {
		setVscodeHostProviderMock()
		const terminalInfo = TerminalRegistry.createTerminal("/tmp/cline-stream-error")
		sandbox.stub(terminalInfo.terminal, "shellIntegration").get(() => ({
			cwd: vscode.Uri.file("/tmp/cline-stream-error"),
			executeCommand: () => ({ read: () => createFailingStream(new Error("command stream failed")) }),
		}))

		const process = manager.runCommand(
			terminalInfo as unknown as Parameters<VscodeTerminalManager["runCommand"]>[0],
			"long-running-command",
		)
		await assert.rejects(process, /command stream failed/)

		const nextTerminal = (await manager.getOrCreateTerminal("/tmp/cline-stream-error")) as unknown as TerminalInfo
		try {
			assert.notEqual(nextTerminal.id, terminalInfo.id)
			assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined)
		} finally {
			terminalInfo.terminal.dispose()
			nextTerminal.terminal.dispose()
			TerminalRegistry.removeTerminal(nextTerminal.id)
		}
	})

	it("continues terminal acquisition when pending cleanup fails", async () => {
		setVscodeHostProviderMock()
		const failedCleanup = TerminalRegistry.createTerminal()
		const successfulCleanup = TerminalRegistry.createTerminal()
		const failedDispose = sandbox.stub(failedCleanup.terminal, "dispose").throws(new Error("dispose failed"))
		const successfulDispose = sandbox.spy(successfulCleanup.terminal, "dispose")
		TerminalRegistry.queueTerminalForCleanup(failedCleanup)
		TerminalRegistry.queueTerminalForCleanup(successfulCleanup)
		let acquiredTerminal: TerminalInfo | undefined
		let didRestoreFailedDispose = false

		try {
			acquiredTerminal = (await manager.getOrCreateTerminal("/tmp/cline-after-cleanup-error")) as unknown as TerminalInfo
			assert.equal(successfulDispose.calledOnce, true)
			assert.notEqual(acquiredTerminal.id, failedCleanup.id)

			failedDispose.restore()
			didRestoreFailedDispose = true
			const retryDispose = sandbox.spy(failedCleanup.terminal, "dispose")
			TerminalRegistry.disposeTerminalsPendingCleanup()
			assert.equal(retryDispose.calledOnce, true)
		} finally {
			if (!didRestoreFailedDispose) {
				failedDispose.restore()
			}
			acquiredTerminal?.terminal.dispose()
			if (acquiredTerminal) {
				TerminalRegistry.removeTerminal(acquiredTerminal.id)
			}
			TerminalRegistry.disposeTerminalsPendingCleanup()
		}
	})

	it("disposes an already-exited fallback terminal exactly once", () => {
		const terminalInfo = TerminalRegistry.createTerminal()
		const disposeSpy = sandbox.spy(terminalInfo.terminal, "dispose")
		sandbox.stub(terminalInfo.terminal, "exitStatus").get(() => ({
			code: 0,
			reason: vscode.TerminalExitReason.Process,
		}))
		TerminalRegistry.queueTerminalForCleanup(terminalInfo)

		TerminalRegistry.disposeTerminalsPendingCleanup()
		TerminalRegistry.disposeTerminalsPendingCleanup()

		assert.equal(disposeSpy.calledOnce, true)
	})

	it("refuses an unobservable dispatch and preserves its terminal at the next acquisition", async () => {
		setVscodeHostProviderMock()
		const terminalInfo = TerminalRegistry.createTerminal()
		sandbox.stub(terminalInfo.terminal, "shellIntegration").get(() => undefined)
		const send = sandbox.stub(terminalInfo.terminal, "sendText")
		const dispose = sandbox.spy(terminalInfo.terminal, "dispose")
		let next: TerminalInfo | undefined
		try {
			const running = manager.runCommand(terminalInfo as any, "sleep 999")
			const rejected = running.then(
				() => {
					throw Error("Expected refusal")
				},
				(error) => error,
			)
			await sandbox.clock.tickAsync(4000)
			assert.equal((await rejected).execution.state, "not_started")
			assert.equal(send.called, false)
			assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined)
			next = (await manager.getOrCreateTerminal("/tmp/cline-next-command")) as unknown as TerminalInfo
			assert.equal(dispose.called, false)
		} finally {
			next?.terminal.dispose()
			if (next) TerminalRegistry.removeTerminal(next.id)
			terminalInfo.terminal.dispose()
		}
	})

	for (const ownership of ["managed", "detached", "continued"] as const) {
		it(`preserves a legacy unobserved ${ownership} execution at the next acquisition`, async () => {
			setVscodeHostProviderMock()
			const terminalInfo = TerminalRegistry.createTerminal()
			sandbox.stub(terminalInfo.terminal, "shellIntegration").get(() => ({ executeCommand() {} }))
			sandbox.stub(VscodeTerminalProcess.prototype, "run").callsFake(async function (this: VscodeTerminalProcess) {
				this.emit("unobserved_command", { source: "sendText", ownership })
				this.emit("continue")
			})
			const dispose = sandbox.spy(terminalInfo.terminal, "dispose")
			let next: TerminalInfo | undefined
			try {
				await manager.runCommand(terminalInfo as any, "legacy execution")
				next = (await manager.getOrCreateTerminal("/tmp/cline-next-command")) as unknown as TerminalInfo
				assert.equal(dispose.called, false)
				assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined)
			} finally {
				next?.terminal.dispose()
				if (next) TerminalRegistry.removeTerminal(next.id)
				terminalInfo.terminal.dispose()
			}
		})
	}

	it("preserves a markerless shell-integration terminal across the next terminal acquisition", async () => {
		setVscodeHostProviderMock()
		const terminalInfo = TerminalRegistry.createTerminal()
		const execution = { read: createMarkerlessStream }
		let end: ((event: vscode.TerminalShellExecutionEndEvent) => unknown) | undefined
		sandbox.stub(vscode.window, "onDidEndTerminalShellExecution").callsFake((listener) => {
			end = listener
			return { dispose() {} }
		})
		sandbox.stub(terminalInfo.terminal, "shellIntegration").get(() => ({ executeCommand: () => execution }))
		const disposeSpy = sandbox.spy(terminalInfo.terminal, "dispose")
		let nextTerminal: TerminalInfo | undefined

		try {
			const process = manager.runCommand(
				terminalInfo as unknown as Parameters<VscodeTerminalManager["runCommand"]>[0],
				"remote-command",
			)
			await sandbox.clock.tickAsync(15_000)
			assert.equal(terminalInfo.busy, true)
			end?.({ terminal: terminalInfo.terminal, execution, exitCode: undefined } as vscode.TerminalShellExecutionEndEvent)
			await sandbox.clock.tickAsync(250)
			await process

			assert.deepEqual(process.getCompletionDetails?.().unobservedCommand, {
				source: "markerlessShellIntegration",
				ownership: "managed",
			})
			nextTerminal = (await manager.getOrCreateTerminal("/tmp/cline-next-command")) as unknown as TerminalInfo
			assert.equal(disposeSpy.called, false, "an SSH or nested-shell session remains user-owned")
			assert.equal(TerminalRegistry.getTerminal(terminalInfo.id), undefined, "markerless terminals must not be reused")
		} finally {
			nextTerminal?.terminal.dispose()
			if (nextTerminal) {
				TerminalRegistry.removeTerminal(nextTerminal.id)
			}
			terminalInfo.terminal.dispose()
			TerminalRegistry.removeTerminal(terminalInfo.id)
		}
	})
})
