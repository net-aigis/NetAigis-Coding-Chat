import { CommandNotStartedError } from "@cline/core"
import { TerminalOutputFailureReason, telemetryService } from "@services/telemetry"
import { EventEmitter } from "events"
import * as vscode from "vscode"
import { stripAnsi } from "@/hosts/vscode/terminal/ansiUtils"
import { getLatestTerminalOutput } from "@/hosts/vscode/terminal/get-latest-output"
import {
	isCompilingOutput,
	MAX_FULL_OUTPUT_SIZE,
	MAX_UNRETRIEVED_LINES,
	PROCESS_HOT_TIMEOUT_COMPILING,
	PROCESS_HOT_TIMEOUT_NORMAL,
	TRUNCATE_KEEP_LINES,
} from "@/integrations/terminal/constants"
import type {
	ITerminalProcess,
	TerminalCompletionDetails,
	TerminalProcessEvents,
	UnobservedTerminalCommand,
} from "@/integrations/terminal/types"
import type { MarkerlessCompletionCause } from "@/services/telemetry/TelemetryService"
import { Logger } from "@/shared/services/Logger"
import { Osc633EventType, Osc633Parser } from "./osc633Parser"

// Only after an authoritative end event: drain late PTY output without
// waiting forever for a stream that VS Code sometimes leaves open.
const ENDED_EXECUTION_DRAIN_GRACE_MS = 250

/** Outcome of racing one stream read against command-completion signals. */
type StreamReadOutcome =
	| { kind: "data"; data: string }
	| { kind: "streamEnd" }
	| { kind: "executionEnd" }
	| { kind: "terminalClosed" }

/**
 * VscodeTerminalProcess - Manages command execution in VSCode's integrated terminal.
 *
 * This class handles command execution using VSCode's shell integration API.
 * It processes VSCode-specific escape sequences and streams output through events.
 *
 * Implements ITerminalProcess interface for polymorphic usage with CommandExecutor.
 *
 * Events:
 * - 'line': Emitted for each line of output
 * - 'completed': Emitted when the process completes
 * - 'continue': Emitted when continue() is called
 * - 'error': Emitted on process errors
 * - 'unobserved_command': Emitted when command completion cannot be observed
 */
export class VscodeTerminalProcess extends EventEmitter<TerminalProcessEvents> implements ITerminalProcess {
	waitForShellIntegration = true
	private isListening = true
	private buffer = ""
	private fullOutput = ""
	private lastRetrievedIndex = 0
	isHot = false
	private hotTimer: NodeJS.Timeout | null = null
	private exitCode: number | null | undefined = undefined
	private signal: NodeJS.Signals | null = null
	private terminalClosedMidCommand = false
	private unobservedCommand: UnobservedTerminalCommand | undefined
	private ownership: "managed" | "continued" | "detached" = "managed"
	private activeCloseDisposable: vscode.Disposable | undefined
	private activeEndEventDisposable: vscode.Disposable | undefined
	private activeIterator: AsyncIterator<string> | undefined
	private drainTimer: NodeJS.Timeout | undefined

	async run(terminal: vscode.Terminal, command: string) {
		this.exitCode = undefined
		this.signal = null
		this.unobservedCommand = undefined

		// The pty may already be dead (exitStatus is set when the shell process
		// terminates). executeCommand()/sendText() on a dead terminal never
		// produces completion events, so fail fast instead of hanging.
		if (terminal.exitStatus !== undefined) {
			this.emit("error", new CommandNotStartedError("The terminal's shell process has exited; the command was not run."))
			return
		}

		// When command does not produce any output, we can assume the shell integration API failed and as a fallback return the current terminal contents
		const returnCurrentTerminalContents = async () => {
			try {
				const terminalSnapshot = await getLatestTerminalOutput()
				if (terminalSnapshot && terminalSnapshot.trim()) {
					const fallbackMessage = `The command's output could not be captured through shell integration. Here is the current terminal's content, which may include the command's output:\n\n${terminalSnapshot}`
					this.emit("line", fallbackMessage)
				}
			} catch (error) {
				Logger.error("Error capturing terminal output:", error)
			}
		}

		if (terminal.shellIntegration && terminal.shellIntegration.executeCommand) {
			// Shell integration is available (VS Code 1.93+). The read() stream yields
			// raw terminal data including OSC 633 escape sequences. We use a
			// chunk-boundary-safe parser to strip those sequences and extract the
			// CommandExecuted (C) marker that delimits the start of command output.
			// Text after C is the command's actual output; everything before (prompt,
			// command echo) is naturally excluded by the marker.
			//
			// NOTE: VS Code excludes the CommandFinished (D) marker from read().
			// On normal completion it flushes buffered data and ends the stream
			// before firing onDidEndTerminalShellExecution with the exit code.
			// Starting another execution can force the previous end event before
			// its stream finishes flushing. We use the event for the exit code;
			// D-marker parsing only delimits output segments, not exit codes.
			const execution = terminal.shellIntegration.executeCommand(command)
			const stream = execution.read()
			const parser = new Osc633Parser()
			let didSeeCommandExecuted = false
			let inCommandOutput = false
			let preCommandBuffer = "" // text before C; emitted as fallback if C never arrives
			let didEmitEmptyLine = false

			// Listen for the shell execution end event to capture the exit code and
			// independently signal completion. The event normally follows the stream,
			// but a replacement execution can force the event before the stream ends.
			//
			// onDidEndTerminalShellExecution has been stable API since VS Code 1.93,
			// below our minimum supported version (see package.json engines.vscode), so it is
			// always available here. It fires for every execution on a shell-integrated
			// terminal, but only when shell integration actually reports command
			// completion — a command typed into a remote shell over ssh, for example,
			// has shell integration present but may never trigger this event for that
			// execution. Silence in that case remains an unconfirmed execution;
			// the caller may detach or cancel without fabricating an exit.
			const resolveExecutionEnd = Promise.withResolvers<number | undefined>()
			const endDrain = resolveExecutionEnd.promise.then(
				() =>
					new Promise<void>((resolve) => {
						this.drainTimer = setTimeout(resolve, ENDED_EXECUTION_DRAIN_GRACE_MS)
					}),
			)
			const endEventDisposable = vscode.window.onDidEndTerminalShellExecution((e) => {
				if (e.terminal === terminal && e.execution === execution) {
					resolveExecutionEnd.resolve(e.exitCode)
				}
			})
			this.activeEndEventDisposable = endEventDisposable

			// Track terminal closure so a dying pty can't leave the read loop
			// blocked forever — the read() stream does not necessarily end when
			// the terminal is disposed mid-command.
			let terminalClosed = false
			let resolveTerminalClosed!: () => void
			const terminalClosedPromise = new Promise<void>((resolve) => {
				resolveTerminalClosed = resolve
			})
			const closeDisposable = vscode.window.onDidCloseTerminal((closedTerminal) => {
				if (closedTerminal === terminal) {
					terminalClosed = true
					resolveTerminalClosed()
				}
			})
			this.activeCloseDisposable = closeDisposable

			// The stream is pulled manually (rather than with for-await) so each
			// read can be raced against terminal closure or output-drain expiry
			// after a confirmed end event. Before that event no idle timer ends
			// the command. Never issue two concurrent iterator.next() calls.
			const iterator = stream[Symbol.asyncIterator]()
			this.activeIterator = iterator
			let pendingRead: Promise<IteratorResult<string>> | undefined
			const readNext = async (): Promise<StreamReadOutcome> => {
				pendingRead ??= iterator.next()
				const outcome = await Promise.race([
					pendingRead.then(
						(result): StreamReadOutcome =>
							result.done ? { kind: "streamEnd" } : { kind: "data", data: result.value },
					),
					endDrain.then((): StreamReadOutcome => ({ kind: "executionEnd" })),
					terminalClosedPromise.then((): StreamReadOutcome => ({ kind: "terminalClosed" })),
				])
				if (outcome.kind === "data" || outcome.kind === "streamEnd") pendingRead = undefined
				return outcome
			}

			// Silence and prompt-shaped output do not establish command completion.
			let completedWithoutMarkers = false
			const markerlessCause: MarkerlessCompletionCause | undefined = undefined

			while (true) {
				const outcome = await readNext()

				if (outcome.kind === "streamEnd" || outcome.kind === "executionEnd") {
					break
				}
				if (outcome.kind === "terminalClosed") {
					Logger.warn("[TerminalProcess] Terminal closed while a command was running")
					break
				}
				let data = outcome.data

				const { segments } = parser.parse(data)

				// Walk segments in order, gating text on the [C, D) marker window.
				// Text before C (prompt/echo) is buffered separately as a fallback;
				// if C never arrives (e.g. ssh/nested shells where SI is present
				// but not emitting markers), the buffered text is emitted at the end.
				let chunkOutput = ""
				for (const seg of segments) {
					if (seg.kind === "event") {
						if (seg.event.type === Osc633EventType.CommandExecuted) {
							didSeeCommandExecuted = true
							inCommandOutput = true
							preCommandBuffer = "" // discard pre-C text (was prompt/echo)
						} else if (seg.event.type === Osc633EventType.CommandFinished) {
							inCommandOutput = false
						}
					} else {
						// Text segment
						if (inCommandOutput) {
							chunkOutput += seg.text
						} else if (!didSeeCommandExecuted) {
							// Pre-C text; buffer for the no-markers fallback.
							preCommandBuffer += seg.text
							// A markerless session (e.g. ssh) can stream indefinitely;
							// cap the buffer to prevent memory exhaustion.
							if (preCommandBuffer.length > MAX_FULL_OUTPUT_SIZE) {
								preCommandBuffer = preCommandBuffer.slice(-MAX_FULL_OUTPUT_SIZE / 2)
							}
						}
						// Post-D text (next prompt) is discarded.
					}
				}

				// Strip remaining ANSI escape sequences (colors, cursor moves, etc.)
				data = stripAnsi(chunkOutput)

				if (!data) {
					continue
				}

				// 2. Set isHot depending on the command
				// Set to hot to stall API requests until terminal is cool again
				this.isHot = true
				if (this.hotTimer) {
					clearTimeout(this.hotTimer)
				}
				// these markers indicate the command is some kind of local dev server recompiling the app, which we want to wait for output of before sending request to cline
				const isCompiling = isCompilingOutput(data)
				this.hotTimer = setTimeout(
					() => {
						this.isHot = false
					},
					isCompiling ? PROCESS_HOT_TIMEOUT_COMPILING : PROCESS_HOT_TIMEOUT_NORMAL,
				)

				// For non-immediately returning commands we want to show loading spinner right away but this wouldn't happen until it emits a line break, so as soon as we get any output we emit "" to let webview know to show spinner
				// This is only done for the sake of unblocking the UI, in case there may be some time before the command emits a full line
				if (!didEmitEmptyLine && !this.fullOutput && data) {
					this.emit("line", "") // empty line to indicate start of command output stream
					didEmitEmptyLine = true
				}

				this.fullOutput += data

				// Cap fullOutput at MAX_FULL_OUTPUT_SIZE to prevent memory exhaustion
				if (this.fullOutput.length > MAX_FULL_OUTPUT_SIZE) {
					// Keep last half of max size
					this.fullOutput = this.fullOutput.slice(-MAX_FULL_OUTPUT_SIZE / 2)
					// Reset lastRetrievedIndex since we truncated the beginning
					this.lastRetrievedIndex = 0
				}

				if (this.isListening) {
					this.emitIfEol(data)
					this.lastRetrievedIndex = this.fullOutput.length - this.buffer.length
				}
			}

			// Release the stream iterator. On the ended/terminal-closed
			// paths a read is still pending; return() lets a well-behaved
			// iterator clean up instead of holding the stream open. Not
			// awaited: a generator blocked on a pending await settles return()
			// only when that await settles, which may be never.
			try {
				iterator.return?.()?.catch?.(() => {})
			} catch {
				// The iterator does not support early termination.
			}
			this.activeIterator = undefined
			this.emitRemainingBufferIfListening()

			// Only the matching execution-end event (or terminal closure) can
			// settle this observation. A three-second gap is not a process exit.
			const eventExitCode = await Promise.race([resolveExecutionEnd.promise, terminalClosedPromise.then(() => undefined)])
			closeDisposable.dispose()
			this.activeCloseDisposable = undefined

			endEventDisposable.dispose()
			this.activeEndEventDisposable = undefined
			clearTimeout(this.drainTimer)
			this.drainTimer = undefined

			// Only the matching API event confirms the command's exit code.
			// Prompt text and raw D markers cannot substitute for it.
			this.exitCode = !terminalClosed && Number.isSafeInteger(eventExitCode) ? eventExitCode : undefined
			completedWithoutMarkers = terminalClosed || !Number.isSafeInteger(eventExitCode)

			// If we never saw the CommandExecuted (C) marker (e.g. ssh/nested
			// shells where shell integration is present but not emitting markers),
			// emit the buffered pre-C text as a fallback so the user still gets
			// output.
			if (!didSeeCommandExecuted && preCommandBuffer.trim()) {
				const fallbackData = stripAnsi(preCommandBuffer)
				if (fallbackData) {
					this.fullOutput += fallbackData
					if (this.isListening) {
						this.emitIfEol(fallbackData)
						this.emitRemainingBufferIfListening()
					}
				}
			}

			// the command process is finished, let's check the output to see if we need to use the terminal capture fallback
			// The CommandExecuted (C) marker is parsed out of the same read()
			// stream as the output, so when it was seen an empty fullOutput is a
			// genuine silent success ($null, git add -A on a clean tree) — the
			// stream worked and the command simply printed nothing. Falling back
			// there reported silent commands as capture failures (GitHub #13272).
			if (!this.fullOutput.trim() && !didSeeCommandExecuted && completedWithoutMarkers) {
				// No output captured via shell integration, trying fallback
				telemetryService.captureTerminalOutputFailure(
					terminalClosed ? TerminalOutputFailureReason.TERMINAL_CLOSED : TerminalOutputFailureReason.OBSERVATION_ENDED,
					"vscode",
				)
				// The clipboard fallback reads the *active* terminal, so it is
				// meaningless once this terminal has closed.
				// (Undefined detail values are omitted from the event; markerlessCause
				// is only set when the markerless fallback completed the command.)
				const fallbackDetails = {
					terminalExecutionMode: "vscodeTerminal" as const,
					markerlessCause,
					terminalClosed: terminalClosed || undefined,
				}
				if (!terminalClosed) {
					await returnCurrentTerminalContents()
					// Check if fallback worked
					const terminalSnapshot = await getLatestTerminalOutput()
					if (terminalSnapshot && terminalSnapshot.trim()) {
						telemetryService.captureTerminalExecution(false, "vscode", "clipboard", fallbackDetails)
					} else {
						telemetryService.captureTerminalExecution(false, "vscode", "none", fallbackDetails)
					}
				} else {
					telemetryService.captureTerminalExecution(false, "vscode", "none", fallbackDetails)
				}
			} else {
				// Capture method and process success are separate. Output alone
				// never establishes success; the matching event must report zero.
				telemetryService.captureTerminalExecution(!terminalClosed && this.exitCode === 0, "vscode", "shell_integration", {
					exitCode: this.exitCode,
					terminalExecutionMode: "vscodeTerminal",
					markerlessCause,
					terminalClosed: terminalClosed || undefined,
				})
			}

			// for now we don't want this delaying requests since we don't send diagnostics automatically anymore (previous: "even though the command is finished, we still want to consider it 'hot' in case so that api request stalls to let diagnostics catch up")
			// to explain this further, before we would send workspace diagnostics automatically with each request, but now we only send new diagnostics after file edits, so there's no need to wait for a bit after commands run to let diagnostics catch up
			if (this.hotTimer) {
				clearTimeout(this.hotTimer)
			}
			this.isHot = false

			if (terminalClosed) {
				this.terminalClosedMidCommand = true
				this.emit("line", "[The terminal closed while the command was running; output may be incomplete.]")
			} else if (completedWithoutMarkers) {
				this.emit(
					"line",
					"[Shell integration ended observation without a confirmed exit code; the process outcome is unknown and the command may still be running.]",
				)
			}

			// Unknown executions must be removed from reuse without disposing
			// possibly active work on the next acquisition.
			if (completedWithoutMarkers) {
				this.markCommandUnobserved("markerlessShellIntegration")
			}
			if (!completedWithoutMarkers && !terminalClosed) this.emit("completed", this.getCompletionDetails())
			this.emit("continue")
		} else {
			// sendText has no command-completion channel. Do not launch work we
			// would falsely complete after a fixed delay or kill at the next call.
			telemetryService.captureTerminalOutputFailure(TerminalOutputFailureReason.NO_SHELL_INTEGRATION, "vscode")
			this.emit(
				"error",
				new CommandNotStartedError(
					"Command was not started: terminal shell integration cannot observe completion. Enable shell integration or select the existing background execution mode.",
				),
			)
		}
	}

	// Inspired by https://github.com/sindresorhus/execa/blob/main/lib/transform/split.js
	private emitIfEol(chunk: string) {
		this.buffer += chunk
		let lineEndIndex: number
		while ((lineEndIndex = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, lineEndIndex).trimEnd() // removes trailing \r
			// Remove \r if present (for Windows-style line endings)
			// if (line.endsWith("\r")) {
			// 	line = line.slice(0, -1)
			// }
			this.emit("line", line)
			this.buffer = this.buffer.slice(lineEndIndex + 1)
		}
	}

	private emitRemainingBufferIfListening() {
		if (this.buffer && this.isListening) {
			const remainingBuffer = this.removeLastLineArtifacts(this.buffer)
			if (remainingBuffer) {
				this.emit("line", remainingBuffer)
			}
			this.buffer = ""
			this.lastRetrievedIndex = this.fullOutput.length
		}
	}

	continue() {
		if (this.ownership === "managed") {
			this.ownership = "continued"
		}
		this.emitRemainingBufferIfListening()
		this.isListening = false
		this.removeAllListeners("line")
		this.emit("continue")
	}

	/**
	 * Resolve the awaited promise while the command keeps running ("Proceed
	 * While Running"). Listeners stay attached and 'line' events keep
	 * flowing — unlike continue() — so callers can stream the remaining
	 * output until the command actually completes. Because 'completed' is
	 * only emitted by the read loop when the command genuinely ends, the
	 * terminal stays busy and is not eligible for reuse until then.
	 */
	detach() {
		this.ownership = "detached"
		// Flush any partial line (no trailing newline yet) so it reaches
		// listeners before the awaited promise resolves; otherwise it would be
		// dropped from both the partial output and the log capture if the
		// command exits without further newline-terminated output.
		this.emitRemainingBufferIfListening()
		this.emit("continue")
	}

	releaseActiveExecutionResources(): void {
		clearTimeout(this.drainTimer)
		this.drainTimer = undefined
		this.activeCloseDisposable?.dispose()
		this.activeCloseDisposable = undefined
		this.activeEndEventDisposable?.dispose()
		this.activeEndEventDisposable = undefined
		try {
			this.activeIterator?.return?.()?.catch?.(() => {})
		} catch {
			// The iterator does not support early termination.
		}
		this.activeIterator = undefined
	}

	private markCommandUnobserved(source: UnobservedTerminalCommand["source"]): void {
		const command = { source, ownership: this.ownership }
		this.unobservedCommand = command
		this.emit("unobserved_command", command)
	}

	/**
	 * Get output that hasn't been retrieved yet.
	 * Truncates if output is too large to prevent context window overflow.
	 * @returns The unretrieved output (truncated if necessary)
	 */
	getUnretrievedOutput(): string {
		const unretrieved = this.fullOutput.slice(this.lastRetrievedIndex)
		this.lastRetrievedIndex = this.fullOutput.length

		// Truncate if too many lines to prevent context overflow
		const lines = unretrieved.split("\n")
		if (lines.length > MAX_UNRETRIEVED_LINES) {
			const first = lines.slice(0, TRUNCATE_KEEP_LINES)
			const last = lines.slice(-TRUNCATE_KEEP_LINES)
			const skipped = lines.length - first.length - last.length
			return this.removeLastLineArtifacts([...first, `\n... (${skipped} lines truncated) ...\n`, ...last].join("\n"))
		}

		return this.removeLastLineArtifacts(unretrieved)
	}

	getCompletionDetails(): TerminalCompletionDetails {
		return {
			exitCode: this.exitCode,
			signal: this.signal,
			terminalClosed: this.terminalClosedMidCommand,
			unobservedCommand: this.unobservedCommand,
		}
	}

	// some processing to remove artifacts like '%' at the end of the buffer (it seems that since vsode uses % at the beginning of newlines in terminal, it makes its way into the stream)
	// This modification will remove '%', '$', '#', or '>' followed by optional whitespace
	removeLastLineArtifacts(output: string) {
		const lines = output.trimEnd().split("\n")
		if (lines.length > 0) {
			const lastLine = lines[lines.length - 1]
			// Remove prompt characters and trailing whitespace from the last line
			lines[lines.length - 1] = lastLine.replace(/[%$#>]\s*$/, "")
		}
		return lines.join("\n").trimEnd()
	}
}

export type TerminalProcessResultPromise = VscodeTerminalProcess & Promise<void>

// Similar to execa's ResultPromise, this lets us create a mixin of both a TerminalProcess and a Promise: https://github.com/sindresorhus/execa/blob/main/lib/methods/promise.js
export function mergePromise(process: VscodeTerminalProcess, promise: Promise<void>): TerminalProcessResultPromise {
	const nativePromisePrototype = (async () => {})().constructor.prototype
	const descriptors = ["then", "catch", "finally"].map(
		(property) => [property, Reflect.getOwnPropertyDescriptor(nativePromisePrototype, property)] as const,
	)
	for (const [property, descriptor] of descriptors) {
		if (descriptor) {
			const value = descriptor.value.bind(promise)
			Reflect.defineProperty(process, property, { ...descriptor, value })
		}
	}
	return process as TerminalProcessResultPromise
}
