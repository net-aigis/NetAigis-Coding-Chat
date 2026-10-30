import { afterEach, beforeEach, describe, it } from "mocha"
import pWaitFor from "p-wait-for"
import { setVscodeHostProviderMock } from "@/test/host-provider-test-utils"
import "should"
import * as sinon from "sinon"
import * as vscode from "vscode"
import * as getLatestOutputModule from "./get-latest-output"
import { VscodeTerminalProcess } from "./VscodeTerminalProcess"
import { VscodeTerminalManager } from "./VscodeTerminalManager"
import { TerminalRegistry } from "./VscodeTerminalRegistry"

// Create a mock stream for simulating terminal output - this is only used for tests
// that need controlled output which can't be guaranteed with real terminals
function createMockStream(lines: string[] = ["test-command", "line1", "line2", "line3"]) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const line of lines) {
				yield line + "\n"
			}
		},
	}
}

// OSC 633 shell integration markers, as raw escape sequences (what read() yields).
const OSC633_C = "\x1b]633;C\x07" // CommandExecuted — output begins
const OSC633_D = "\x1b]633;D;0\x07" // CommandFinished, exit code 0

// Create a mock stream that yields the given chunks and then never ends,
// simulating shell integration that is attached but not emitting OSC 633
// markers — e.g. commands typed into an ssh session, where the remote shell
// produces output but VS Code never sees command start/end sequences and so
// never terminates the read() stream.
function createHangingStream(chunks: string[]) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) {
				yield chunk
			}
			await new Promise<never>(() => {})
		},
	}
}

// Create a mock stream that wraps output lines with C/D markers, simulating a
// real shell-integration stream. The commandEcho (if provided) is emitted before
// C and should be excluded from the output by the marker-based gating.
function createMockStreamWithMarkers(outputLines: string[], commandEcho?: string) {
	const lines: string[] = []
	if (commandEcho) {
		lines.push(commandEcho)
	}
	lines.push(OSC633_C)
	lines.push(...outputLines)
	lines.push(OSC633_D)
	return createMockStream(lines)
}

describe("TerminalProcess (Integration Tests)", () => {
	let process: VscodeTerminalProcess
	let sandbox: sinon.SinonSandbox
	let createdTerminals: vscode.Terminal[] = []
	let endListener: ((event: vscode.TerminalShellExecutionEndEvent) => unknown) | undefined

	function stubEndEvent() {
		sandbox.stub(vscode.window, "onDidEndTerminalShellExecution").callsFake((listener) => {
			endListener = listener
			return { dispose: () => {} }
		})
	}

	async function completeMockExecution(terminal: vscode.Terminal, exitCode: number | undefined) {
		await sandbox.clock.tickAsync(0)
		const execute = terminal.shellIntegration!.executeCommand as sinon.SinonStub
		endListener?.({ terminal, execution: execute.lastCall.returnValue, exitCode } as vscode.TerminalShellExecutionEndEvent)
		await sandbox.clock.tickAsync(250)
	}

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		setVscodeHostProviderMock()
		process = new VscodeTerminalProcess()
	})

	afterEach(() => {
		process.releaseActiveExecutionResources()
		// Restore sandbox, which restores timers and all Sinon fakes
		sandbox.restore()
		// Remove any event listeners left on the TerminalProcess
		process.removeAllListeners()
		// Dispose all terminals created during the test
		createdTerminals.forEach((t) => {
			t.dispose()
		})
		createdTerminals = []
	})

	describe("Real terminal tests", () => {
		let observer: VscodeTerminalManager
		beforeEach(() => {
			observer = new VscodeTerminalManager()
		})
		afterEach(() => {
			observer.disposeAll()
		})
		// These commands require an authoritative shell-integration channel.
		it("should create and run a command in a real terminal", async () => {
			// Create a real VS Code terminal for testing
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			await pWaitFor(() => Boolean(terminal.shellIntegration), { interval: 50, timeout: 15_000 })

			// Spy on emit to verify behavior
			const emitSpy = sandbox.spy(process, "emit")

			// Run a simple command
			const runPromise = process.run(terminal, "echo test")

			await runPromise

			// Verify that the continue event was emitted
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
		})

		it("should execute and capture events from a simple command", async () => {
			// Create a real VS Code terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			await pWaitFor(() => Boolean(terminal.shellIntegration), { interval: 50, timeout: 15_000 })

			// Spy on emit to verify line events
			const emitSpy = sandbox.spy(process, "emit")

			// Run a command that produces predictable output
			const runPromise = process.run(terminal, "echo 'Line 1' && echo 'Line 2'")

			await runPromise

			// Check that the events were emitted
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
		})

		it("should execute a command that lists files", async () => {
			// Create a real VS Code terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			await pWaitFor(() => Boolean(terminal.shellIntegration), { interval: 50, timeout: 15_000 })

			// Spy on emit to verify behavior
			const emitSpy = sandbox.spy(process, "emit")

			// Run a command that lists files
			const runPromise = process.run(terminal, "ls -la")

			await runPromise

			// Verify that the continue event was emitted
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
		})

		it("should handle a longer running command", async () => {
			// Create a real terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			await pWaitFor(() => Boolean(terminal.shellIntegration), { interval: 50, timeout: 15_000 })

			// Spy on emit to verify behavior
			const emitSpy = sandbox.spy(process, "emit")

			// Run a command that sleeps for a short period
			await process.run(terminal, "sleep 0.5 && echo 'Done sleeping'")

			// Verify that the continue and completed events were emitted
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
		})

		it("should execute a command with arguments", async () => {
			// Create a real VS Code terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			await pWaitFor(() => Boolean(terminal.shellIntegration), { interval: 50, timeout: 15_000 })

			// Spy on emit to verify line events
			const emitSpy = sandbox.spy(process, "emit")

			// Run a command that produces predictable output
			const runPromise = process.run(terminal, "echo 'Line 1' 'Line 2'")

			await runPromise

			// Check that the events were emitted
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
		})

		it("should execute a command with quotes", async () => {
			// Create a real VS Code terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			await pWaitFor(() => Boolean(terminal.shellIntegration), { interval: 50, timeout: 15_000 })

			// Spy on emit to verify line events
			const emitSpy = sandbox.spy(process, "emit")

			// Run a command that produces predictable output
			const runPromise = process.run(terminal, "echo \"Line 1\" && echo 'Line 2'")

			await runPromise

			// Check that the events were emitted
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
		})
	})

	it("refuses dispatch when shell integration cannot observe completion", async () => {
		const terminal = vscode.window.createTerminal({ name: "Test Terminal" })
		createdTerminals.push(terminal)
		sandbox.stub(terminal, "shellIntegration").get(() => undefined)
		const sendTextStub = sandbox.stub(terminal, "sendText")
		const errors: Error[] = []
		process.on("error", (error) => errors.push(error))
		const emitSpy = sandbox.spy(process, "emit")
		await process.run(terminal, "test-command")
		sendTextStub.called.should.be.false()
		errors.length.should.equal(1)
		;(errors[0] as any).execution.state.should.equal("not_started")
		;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
	})

	// The following tests require shell integration and controlled terminal output
	describe("Shell integration tests", () => {
		beforeEach(() => {
			sandbox.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldClearNativeTimers: true })
			stubEndEvent()
		})
		// We'll mock the terminal run process and TerminalProcess for these tests
		it("should emit completed and continue events when command finishes", async () => {
			// Create a terminal to ensure proper interface, but we'll use mocking under the hood
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// Create a mock implementation of executeCommand with C/D markers
			const mockExecuteCommand = sandbox.stub().returns({
				read: () => createMockStreamWithMarkers(["test output"], "echo test"),
			})

			// Create a fake shell integration object
			const mockShellIntegration = {
				executeCommand: mockExecuteCommand,
			}

			// Stub terminal.shellIntegration to return our mock
			sandbox.stub(terminal, "shellIntegration").get(() => mockShellIntegration)

			// Spy on emit to verify behavior
			const emitSpy = sandbox.spy(process, "emit")

			// Run the command
			const runPromise = process.run(terminal, "echo test")
			await completeMockExecution(terminal, 0)
			await runPromise

			// Verify the executeCommand was called with the right command
			mockExecuteCommand.calledWith("echo test").should.be.true()

			// Check that the events were emitted
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
		})

		it("prefers the onDidEndTerminalShellExecution exit code over a conflicting D-marker exit code", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// D marker reports success (0), but the authoritative end event
			// reports failure (1) — the event must win.
			const mockExecution = { read: () => createMockStreamWithMarkers(["test output"], "echo test") }
			const mockExecuteCommand = sandbox.stub().returns(mockExecution)
			sandbox.stub(terminal, "shellIntegration").get(() => ({ executeCommand: mockExecuteCommand }))

			const runPromise = process.run(terminal, "echo test")
			// Fire the end event with a conflicting exit code before the stream
			// finishes draining — the process must still prefer it over the D
			// marker's exitCode: 0 once the stream completes.
			endListener?.({ terminal, execution: mockExecution, exitCode: 1 } as unknown as vscode.TerminalShellExecutionEndEvent)
			await completeMockExecution(terminal, 0)
			await runPromise

			process.getCompletionDetails().exitCode?.should.equal(1)
		})

		it("completes when the shell execution ends while the read stream remains open", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			const mockExecution = { read: () => createHangingStream([OSC633_C, "test output\n"]) }
			const mockExecuteCommand = sandbox.stub().returns(mockExecution)
			sandbox.stub(terminal, "shellIntegration").get(() => ({ executeCommand: mockExecuteCommand }))

			const emitSpy = sandbox.spy(process, "emit")
			const runPromise = process.run(terminal, "echo test")
			await sandbox.clock.tickAsync(0)

			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
			endListener?.({ terminal, execution: mockExecution, exitCode: 0 } as unknown as vscode.TerminalShellExecutionEndEvent)
			await sandbox.clock.tickAsync(250)
			await runPromise

			;(emitSpy as sinon.SinonSpy).calledWith("line", "test output").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
			process.getCompletionDetails().exitCode?.should.equal(0)
		})

		it("keeps a finished stream unconfirmed until its end event, without trusting a raw D code", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			const execution = { read: () => createMockStreamWithMarkers(["test output"]) }
			sandbox.stub(terminal, "shellIntegration").get(() => ({ executeCommand: sandbox.stub().returns(execution) }))
			const emitSpy = sandbox.spy(process, "emit")
			const running = process.run(terminal, "echo test")
			await sandbox.clock.tickAsync(10_000)
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
			endListener?.({ terminal, execution, exitCode: undefined } as unknown as vscode.TerminalShellExecutionEndEvent)
			await sandbox.clock.tickAsync(250)
			await running
			;(process.getCompletionDetails().exitCode === undefined).should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
		})
	})

	// Tests with controlled output
	describe("Controlled output tests", () => {
		beforeEach(() => {
			sandbox.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldClearNativeTimers: true })
			stubEndEvent()
		})
		it("should emit line events for each line of output", async () => {
			// Create a terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// Mock the shell integration with controlled output, wrapped in C/D markers
			const mockExecuteCommand = sandbox.stub().returns({
				read: () => createMockStreamWithMarkers(["line1", "line2", "line3"], "test-command"),
			})

			// Create a mock shell integration object and stub the getter
			sandbox.stub(terminal, "shellIntegration").get(() => ({
				executeCommand: mockExecuteCommand,
			}))

			const emitSpy = sandbox.spy(process, "emit")

			const runPromise = process.run(terminal, "test-command")
			await completeMockExecution(terminal, 0)
			await runPromise

			// Check that line events were emitted for each line
			;(emitSpy as sinon.SinonSpy).calledWith("line", "line1").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("line", "line2").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("line", "line3").should.be.true()
		})

		it("should properly handle process hot state (e.g. compiling)", async () => {
			// Create a terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// Mock the shell integration with C/D markers
			const mockExecuteCommand = sandbox.stub().returns({
				read: () => createMockStreamWithMarkers(["compiling..."]),
			})

			// Create a mock shell integration object and stub the getter
			sandbox.stub(terminal, "shellIntegration").get(() => ({
				executeCommand: mockExecuteCommand,
			}))

			// Spy on global setTimeout
			const setTimeoutSpy = sandbox.spy(global, "setTimeout")

			const runPromise = process.run(terminal, "build command")
			await completeMockExecution(terminal, 0)
			await runPromise

			// Move time forward enough to schedule
			sandbox.clock.tick(100)

			// Expect a 15-second (>= 10000ms) hot timeout, since it saw "compiling"
			const foundCompilingTimeout = setTimeoutSpy.args.filter((args) => args[1] && args[1] >= 10000)
			foundCompilingTimeout.length.should.be.greaterThan(0)
		})

		it("should handle standard commands with normal hot timeout", async () => {
			// Create a terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// Mock the shell integration with C/D markers
			const mockExecuteCommand = sandbox.stub().returns({
				read: () => createMockStreamWithMarkers(["some normal output"]),
			})

			// Create a mock shell integration object and stub the getter
			sandbox.stub(terminal, "shellIntegration").get(() => ({
				executeCommand: mockExecuteCommand,
			}))

			const setTimeoutSpy = sandbox.spy(global, "setTimeout")

			const runPromise = process.run(terminal, "standard command")
			await completeMockExecution(terminal, 0)
			await runPromise
			sandbox.clock.tick(100)

			// Expect a short hot timeout (<= 5000)
			const foundNormalTimeout = setTimeoutSpy.args.filter((args) => args[1] && args[1] <= 5000)
			foundNormalTimeout.length.should.be.greaterThan(0)

			const emitSpy = sandbox.spy(process, "emit")
			const runPromise2 = process.run(terminal, "another command")
			await completeMockExecution(terminal, 0)
			await runPromise2
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
		})

		it("should exclude command echo (pre-C text) and include output (post-C text)", async () => {
			// Create a terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// Mock the shell integration with C/D markers around output.
			// "test-command" is the command echo (before C) → excluded by markers.
			// "test command" and "other output" are actual output (after C) → emitted.
			const mockExecuteCommand = sandbox.stub().returns({
				read: () =>
					createMockStreamWithMarkers(
						["test command", "other output"],
						"test-command", // command echo, before C marker
					),
			})

			// Create a mock shell integration object and stub the getter
			sandbox.stub(terminal, "shellIntegration").get(() => ({
				executeCommand: mockExecuteCommand,
			}))

			const emitSpy = sandbox.spy(process, "emit")

			const runPromise = process.run(terminal, "test-command")
			await completeMockExecution(terminal, 0)
			await runPromise

			// Output after C should be emitted
			;(emitSpy as sinon.SinonSpy).calledWith("line", "test command").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("line", "other output").should.be.true()
			// Command echo before C should NOT be emitted (excluded by marker gating)
			;(emitSpy as sinon.SinonSpy).calledWith("line", "test-command").should.be.false()
		})

		it("should handle npm run commands", async () => {
			// Create a terminal
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)

			// Mock the shell integration with C/D markers.
			// "npm run build" is the command echo (before C) → excluded by markers.
			const mockExecuteCommand = sandbox.stub().returns({
				read: () =>
					createMockStreamWithMarkers(
						["> project@1.0.0 build", "> tsc", "files built successfully"],
						"npm run build", // command echo, before C marker
					),
			})

			// Create a mock shell integration object and stub the getter
			sandbox.stub(terminal, "shellIntegration").get(() => ({
				executeCommand: mockExecuteCommand,
			}))

			const emitSpy = sandbox.spy(process, "emit")

			const runPromise = process.run(terminal, "npm run build")
			await completeMockExecution(terminal, 0)
			await runPromise

			// The command echo should be excluded; the rest (after C) should be emitted
			;(emitSpy as sinon.SinonSpy).calledWith("line", "> project@1.0.0 build").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("line", "> tsc").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("line", "files built successfully").should.be.true()
		})
	})

	// Quiet streams and prompt-shaped output are never proof of process exit.
	describe("Markerless shell integration (ssh) tests", () => {
		beforeEach(() => {
			sandbox.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldClearNativeTimers: true })
			stubEndEvent()
		})
		function stubExecution(terminal: vscode.Terminal, stream: AsyncIterable<string>) {
			const execute = sandbox.stub().returns({ read: () => stream })
			sandbox.stub(terminal, "shellIntegration").get(() => ({ executeCommand: execute }))
		}

		for (const chunks of [["remote output\n", "user@remote:~$ "], ["output without prompt\n"], []]) {
			it(`keeps ${JSON.stringify(chunks)} pending through prolonged silence`, async () => {
				const terminal = TerminalRegistry.createTerminal().terminal
				createdTerminals.push(terminal)
				stubExecution(terminal, createHangingStream(chunks))
				const emitSpy = sandbox.spy(process, "emit")
				const running = process.run(terminal, "remote command")
				await sandbox.clock.tickAsync(90_000)
				;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
				await completeMockExecution(terminal, undefined)
				await running
				;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
				process.getCompletionDetails().unobservedCommand?.ownership.should.equal("managed")
			})
		}

		it("retains output across a long silent interval after the C marker", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			stubExecution(terminal, {
				async *[Symbol.asyncIterator]() {
					yield OSC633_C + "build started\n"
					await new Promise((resolve) => setTimeout(resolve, 120_000))
					yield "build finished\n" + OSC633_D
				},
			})
			const emitSpy = sandbox.spy(process, "emit")
			const running = process.run(terminal, "slow-build")
			await sandbox.clock.tickAsync(120_000)
			await completeMockExecution(terminal, 0)
			await running
			;(emitSpy as sinon.SinonSpy).calledWith("line", "build started").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("line", "build finished").should.be.true()
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
		})

		it("accepts a confirmed silent success without clipboard fallback", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			stubExecution(terminal, createMockStream([OSC633_C, OSC633_D]))
			const snapshotStub = sandbox.stub(getLatestOutputModule, "getLatestTerminalOutput").resolves("unrelated")
			const emitSpy = sandbox.spy(process, "emit")
			const running = process.run(terminal, "$null")
			await completeMockExecution(terminal, 0)
			await running
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.true()
			snapshotStub.called.should.be.false()
		})

		it("does not read a terminal snapshot merely because no data arrives", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			stubExecution(terminal, createHangingStream([]))
			const snapshotStub = sandbox.stub(getLatestOutputModule, "getLatestTerminalOutput").resolves("snapshot")
			const emitSpy = sandbox.spy(process, "emit")
			const running = process.run(terminal, "remote command")
			await sandbox.clock.tickAsync(90_000)
			snapshotStub.called.should.be.false()
			await completeMockExecution(terminal, undefined)
			await running
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
			snapshotStub.called.should.be.true()
		})

		it("ends observation on terminal closure without reporting process completion", async () => {
			const terminal = TerminalRegistry.createTerminal().terminal
			createdTerminals.push(terminal)
			stubExecution(terminal, createHangingStream(["partial output\n"]))
			sandbox.clock.restore()
			const emitSpy = sandbox.spy(process, "emit")
			const running = process.run(terminal, "remote command")
			await new Promise((resolve) => setTimeout(resolve, 100))
			terminal.dispose()
			await running
			;(emitSpy as sinon.SinonSpy).calledWith("completed").should.be.false()
			;(emitSpy as sinon.SinonSpy).calledWith("continue").should.be.true()
			process.getCompletionDetails().terminalClosed?.should.be.true()
		})
	})

	it("should emit error without running when the terminal's pty has already exited", async () => {
		const terminal = TerminalRegistry.createTerminal().terminal
		createdTerminals.push(terminal)

		// exitStatus is set when the shell process terminates.
		sandbox.stub(terminal, "exitStatus").get(() => ({ code: 1, reason: 2 }))
		const executeCommandStub = sandbox.stub()
		sandbox.stub(terminal, "shellIntegration").get(() => ({
			executeCommand: executeCommandStub,
		}))
		const sendTextStub = sandbox.stub(terminal, "sendText")

		const errors: Error[] = []
		process.on("error", (error) => errors.push(error))

		await process.run(terminal, "echo test")

		errors.length.should.equal(1)
		errors[0].message.should.containEql("shell process has exited")
		executeCommandStub.called.should.be.false()
		sendTextStub.called.should.be.false()
	})

	// The following tests are shared with the unit tests to ensure consistent behavior
	it("should emit line for remaining buffer when emitRemainingBufferIfListening is called", () => {
		// Access private properties via type assertion
		const processAny = process as any
		processAny.buffer = "test buffer content"
		processAny.isListening = true

		const emitSpy = sandbox.spy(process, "emit")
		processAny.emitRemainingBufferIfListening()
		;(emitSpy as sinon.SinonSpy).calledWith("line", "test buffer content").should.be.true()
		processAny.buffer.should.equal("")
	})

	it("should remove prompt characters from the last line of output", () => {
		const processAny = process as any

		processAny.removeLastLineArtifacts("line 1\nline 2 %").should.equal("line 1\nline 2")
		processAny.removeLastLineArtifacts("line 1\nline 2 $").should.equal("line 1\nline 2")
		processAny.removeLastLineArtifacts("line 1\nline 2 #").should.equal("line 1\nline 2")
		processAny.removeLastLineArtifacts("line 1\nline 2 >").should.equal("line 1\nline 2")
	})

	it("should process buffer and emit lines when newline characters are found", () => {
		const processAny = process as any
		const emitSpy = sandbox.spy(process, "emit")

		processAny.emitIfEol("line 1\nline 2\nline 3")
		;(emitSpy as sinon.SinonSpy).calledWith("line", "line 1").should.be.true()
		;(emitSpy as sinon.SinonSpy).calledWith("line", "line 2").should.be.true()
		processAny.buffer.should.equal("line 3")

		processAny.emitIfEol(" continued\n")
		;(emitSpy as sinon.SinonSpy).calledWith("line", "line 3 continued").should.be.true()
		processAny.buffer.should.equal("")
	})

	it("detach emits continue but keeps line listeners attached and listening", () => {
		const processAny = process as any
		const continueEvents: number[] = []
		const lines: string[] = []
		process.on("continue", () => continueEvents.push(1))
		process.on("line", (line) => lines.push(line))

		process.detach()
		continueEvents.length.should.equal(1)

		// Unlike continue(), detach must not stop listening or drop 'line'
		// listeners: output after detach still reaches subscribers (this is
		// what streams the rest of a detached command to the log file).
		processAny.isListening.should.be.true()
		processAny.emitIfEol("after detach\n")
		lines.should.containEql("after detach")
	})

	it("detach flushes a buffered partial line before emitting continue", () => {
		const processAny = process as any
		const events: string[] = []
		process.on("continue", () => events.push("continue"))
		process.on("line", (line) => events.push(`line:${line}`))

		// A chunk with no trailing newline stays in the internal buffer.
		processAny.emitIfEol("partial output")
		processAny.buffer.should.equal("partial output")

		process.detach()

		// The partial line must reach listeners before 'continue' resolves the
		// awaited promise; otherwise it is missing from the partial output and
		// from the log's initial flush.
		events.should.eql(["line:partial output", "continue"])
		processAny.buffer.should.equal("")
	})
})
