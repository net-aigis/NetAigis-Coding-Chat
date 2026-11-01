import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ExtensionStateContextProvider, useExtensionState } from "./ExtensionStateContext"

const transport = vi.hoisted(() => ({ push: undefined as undefined | ((response: { stateJson: string }) => void) }))
vi.mock("../services/grpc-client", () => {
	const service = new Proxy(
		{},
		{
			get: (_target, name) => {
				if (name === "subscribeToState")
					return (_request: unknown, callbacks: { onResponse: typeof transport.push }) => {
						transport.push = callbacks.onResponse
						return () => {}
					}
				if (String(name).startsWith("subscribe")) return () => () => {}
				return async () => ({ profiles: [], models: {} })
			},
		},
	)
	return { StateServiceClient: service, UiServiceClient: service, ModelsServiceClient: service, McpServiceClient: service }
})

function Probe() {
	const { autoApprovalSettings } = useExtensionState()
	return <output data-testid="permissions">{JSON.stringify(autoApprovalSettings)}</output>
}

function push(version: number, allowed: boolean) {
	const settings = {
		...DEFAULT_AUTO_APPROVAL_SETTINGS,
		version,
		actions: {
			readFiles: allowed,
			editFiles: allowed,
			executeSafeCommands: allowed,
			useBrowser: allowed,
			useMcp: allowed,
		},
	}
	act(() =>
		transport.push?.({
			stateJson: JSON.stringify({
				version: "0.1.0",
				welcomeViewCompleted: true,
				autoApprovalSettings: settings,
				clineMessages: [],
			}),
		}),
	)
	return settings
}

describe("authoritative auto-approval state hydration", () => {
	beforeEach(() => {
		transport.push = undefined
	})
	it("loads saved version-one denials instead of rendering the permissive UI defaults", () => {
		render(
			<ExtensionStateContextProvider>
				<Probe />
			</ExtensionStateContextProvider>,
		)
		const saved = push(1, false)
		expect(JSON.parse(screen.getByTestId("permissions").textContent!)).toEqual(saved)
	})
	it("does not let an older snapshot overwrite a newly received grant", () => {
		render(
			<ExtensionStateContextProvider>
				<Probe />
			</ExtensionStateContextProvider>,
		)
		const latest = push(3, true)
		push(2, false)
		expect(JSON.parse(screen.getByTestId("permissions").textContent!)).toEqual(latest)
	})
})
