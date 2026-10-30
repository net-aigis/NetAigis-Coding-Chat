import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type * as vscode from "vscode"
import {
	configureTotalRecall,
	openRecallSessionView,
	registerTotalRecallCommands,
} from "@/core/controller/commands/recall-session-commands"

const mocks = vi.hoisted(() => ({
	commands: new Map<string, () => Promise<void>>(),
	receive: undefined as undefined | ((input: unknown) => Promise<void>),
	dispose: undefined as undefined | (() => void),
	post: vi.fn(async (_message: unknown) => true),
	messageDispose: vi.fn(),
	list: vi.fn(async () => [
		{ conversationId: "first", title: "same title", projectId: "project" },
		{ conversationId: "second", title: "same title", projectId: "project" },
	]),
	snapshot: vi.fn(async (id: string) => ({ conversationId: id, messages: [{ actor_id: "Friseer" }] })),
	configure: vi.fn(async () => {}),
	input: vi.fn(),
	quickPick: vi.fn(),
	error: vi.fn(async () => {}),
}))
vi.mock("vscode", () => ({
	commands: {
		registerCommand: (id: string, handler: () => Promise<void>) => {
			mocks.commands.set(id, handler)
			return { dispose: () => {} }
		},
	},
	ViewColumn: { Beside: 2 },
	window: {
		createWebviewPanel: () => ({
			webview: {
				html: "",
				postMessage: mocks.post,
				onDidReceiveMessage: (handler: typeof mocks.receive) => {
					mocks.receive = handler
					return { dispose: mocks.messageDispose }
				},
			},
			onDidDispose: (handler: () => void) => {
				mocks.dispose = handler
			},
			dispose: () => mocks.dispose?.(),
			reveal: () => {},
		}),
		showInputBox: (...args: unknown[]) => mocks.input(...args),
		showQuickPick: (...args: unknown[]) => mocks.quickPick(...args),
		showErrorMessage: mocks.error,
		showInformationMessage: vi.fn(async () => {}),
	},
}))
vi.mock("@/sdk/recall-config-manager", () => ({
	getRecallConfiguration: async () => ({
		baseUrl: "http://fixture.invalid",
		project: "project",
		actor: "jimmi",
		token: "fixture-only",
		enabled: true,
	}),
	getRecallConfigManager: () => ({ configure: mocks.configure }),
}))
vi.mock("@/sdk/recall-session-host", () => ({
	TotalRecallSessionHost: class {
		initialize = async () => {}
		listConversations = mocks.list
		getSessionSnapshot = mocks.snapshot
	},
}))
vi.mock("@/sdk/recall-outbox", () => ({ drainRecallOutbox: async () => ({ sent: 0, pending: 0 }) }))
beforeEach(() => {
	vi.clearAllMocks()
	mocks.commands.clear()
	mocks.input.mockReset()
})
afterEach(() => {
	mocks.dispose?.()
	mocks.dispose = undefined
	mocks.receive = undefined
})
describe("TOTAL RECALL command wiring", () => {
	it("connects the actual standalone panel to listing and reading without claiming restore or takeover", async () => {
		await openRecallSessionView()
		expect(mocks.post).toHaveBeenCalledWith({ cmd: "render", sessions: await mocks.list() })
		await mocks.receive?.({ command: "read-session", conversationId: "stable's ID" })
		expect(mocks.snapshot).toHaveBeenCalledWith("stable's ID")
		await mocks.receive?.({ command: "takeover-session", conversationId: "stable's ID" })
		expect(mocks.post.mock.calls.at(-1)?.[0]).toMatchObject({
			cmd: "msg",
			msg: expect.stringContaining("Keine bestätigte Schreibübergabe"),
		})
	})
	it("keeps the selected conversation ID when two sessions have identical titles", async () => {
		registerTotalRecallCommands({} as vscode.ExtensionContext)
		mocks.quickPick.mockImplementationOnce(async (items: unknown[]) => items[1])
		await mocks.commands.get("cline.recall.quickPick")?.()
		expect(mocks.snapshot).toHaveBeenCalledWith("second")
	})
	it("does not persist partial configuration after a cancelled prompt", async () => {
		mocks.input.mockResolvedValueOnce("http://new-fixture.invalid").mockResolvedValueOnce(undefined)
		await configureTotalRecall()
		expect(mocks.configure).not.toHaveBeenCalled()
	})
	it("asks for a masked credential and saves only the explicit complete inputs", async () => {
		mocks.input
			.mockResolvedValueOnce("http://explicit-fixture.invalid")
			.mockResolvedValueOnce("other-project")
			.mockResolvedValueOnce("Friseer")
			.mockResolvedValueOnce("fixture-new")
		await configureTotalRecall()
		expect(mocks.input.mock.calls[3][0]).toMatchObject({ password: true })
		expect(mocks.input.mock.calls[3][0]).not.toHaveProperty("value")
		expect(mocks.configure).toHaveBeenCalledWith({
			baseUrl: "http://explicit-fixture.invalid",
			project: "other-project",
			actor: "Friseer",
			token: "fixture-new",
		})
	})
})
