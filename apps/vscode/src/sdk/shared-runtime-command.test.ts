import { beforeEach, expect, it, vi } from "vitest"
import { registerSharedRuntimeCommand } from "@/hosts/vscode/shared-runtime-command"
import { SharedRuntimeConfigurationError } from "./shared-session-hub"

const ui = vi.hoisted(() => ({ register: vi.fn(), input: vi.fn(), success: vi.fn(), failure: vi.fn() }))
vi.mock("vscode", () => ({
	commands: { registerCommand: ui.register },
	window: { showInputBox: ui.input, showInformationMessage: ui.success, showErrorMessage: ui.failure },
}))
vi.mock("@/registry", () => ({
	ExtensionRegistryInfo: { commands: { ConfigureSharedRuntime: "netaigis-coding-chat.runtime.configure" } },
}))
beforeEach(() => {
	vi.resetAllMocks()
})

function callback(configure: Parameters<typeof registerSharedRuntimeCommand>[0]): () => Promise<void> {
	registerSharedRuntimeCommand(configure)
	expect(ui.register.mock.calls[0][0]).toBe("netaigis-coding-chat.runtime.configure")
	return ui.register.mock.calls[0][1]
}
it("collects credentials only through password input and reports the authenticated actor after completion", async () => {
	const configure = vi.fn().mockResolvedValue("jimmi")
	ui.input.mockResolvedValueOnce("wss://fixture.invalid/hub").mockResolvedValueOnce("fixture-personal")
	await callback(configure)()
	expect(ui.input.mock.calls[1][0]).toMatchObject({ password: true, ignoreFocusOut: true })
	expect(configure).toHaveBeenCalledExactlyOnceWith({ endpoint: "wss://fixture.invalid/hub", authToken: "fixture-personal" })
	expect(ui.success).toHaveBeenCalledWith(expect.stringContaining("jimmi"))
	expect(ui.success).toHaveBeenCalledWith(expect.stringContaining("getrennt"))
	expect(ui.failure).not.toHaveBeenCalled()
})
it.each([0, 1])("cancellation at input %i does not configure or report a connection", async (step) => {
	const configure = vi.fn()
	if (step === 1) ui.input.mockResolvedValueOnce("wss://fixture.invalid/hub")
	ui.input.mockResolvedValueOnce(undefined)
	await callback(configure)()
	expect(configure).not.toHaveBeenCalled()
	expect(ui.success).not.toHaveBeenCalled()
})
it("displays a known safe busy reason without stopping or clearing a task", async () => {
	ui.input.mockResolvedValue("fixture")
	const configure = vi.fn().mockRejectedValue(new SharedRuntimeConfigurationError("Sitzung bleibt erhalten"))
	await callback(configure)()
	expect(ui.failure).toHaveBeenCalledWith("Sitzung bleibt erhalten")
	expect(ui.success).not.toHaveBeenCalled()
})
it("does not leak arbitrary transport or storage errors containing a credential", async () => {
	ui.input.mockResolvedValue("fixture-personal")
	const configure = vi.fn().mockRejectedValue(new Error("fixture-personal"))
	await callback(configure)()
	expect(JSON.stringify(ui.failure.mock.calls)).not.toContain("fixture-personal")
	expect(ui.success).not.toHaveBeenCalled()
})
