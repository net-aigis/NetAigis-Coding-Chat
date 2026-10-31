import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ButtonHTMLAttributes } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import WelcomeView from "./WelcomeView"

const fixture = vi.hoisted(() => ({
	configuration: { actModeApiProvider: "openai-compatible", openAiBaseUrl: "http://fixture.invalid:11436/v1" },
	complete: vi.fn(async (_request: unknown) => ({})),
	changeProvider: vi.fn(),
}))
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ apiConfiguration: fixture.configuration, mode: "act" }),
}))
vi.mock("@/services/grpc-client", () => ({
	StateServiceClient: { setWelcomeViewCompleted: fixture.complete, updateApiConfiguration: fixture.changeProvider },
}))
vi.mock("@/components/settings/ApiOptions", () => ({ default: () => <div>Existing provider settings</div> }))
vi.mock("@/utils/validate", () => ({ validateApiConfiguration: () => undefined }))
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
beforeEach(() => vi.clearAllMocks())

it("shows the own product and retains an existing local endpoint without a cloud signup", async () => {
	const before = structuredClone(fixture.configuration)
	render(<WelcomeView />)
	expect(screen.getByRole("heading", { name: "NetAigis Coding Chat" })).toBeInTheDocument()
	expect(screen.queryByRole("button", { name: /sign in|sign up|subscribe/i })).not.toBeInTheDocument()
	fireEvent.click(screen.getByRole("button", { name: "Continue with this configuration" }))
	await waitFor(() => expect(fixture.complete).toHaveBeenCalledWith({ value: true }))
	expect(fixture.changeProvider).not.toHaveBeenCalled()
	expect(fixture.configuration).toEqual(before)
})

it("reports a failed configuration save without acknowledging completion", async () => {
	fixture.complete.mockRejectedValueOnce(new Error("Fixture storage failure"))
	render(<WelcomeView />)
	fireEvent.click(screen.getByRole("button", { name: "Continue with this configuration" }))
	expect(await screen.findByRole("alert")).toHaveTextContent("Configuration could not be saved")
	expect(fixture.changeProvider).not.toHaveBeenCalled()
})
