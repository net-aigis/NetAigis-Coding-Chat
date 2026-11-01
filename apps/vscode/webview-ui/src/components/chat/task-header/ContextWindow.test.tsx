import { fireEvent, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ContextWindow from "./ContextWindow"

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: ({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
		<button {...props}>{children}</button>
	),
}))

vi.mock("@/components/ui/hover-card", () => ({
	HoverCard: ({ children }: PropsWithChildren) => <div>{children}</div>,
	HoverCardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	HoverCardTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock("@/components/ui/progress", () => ({
	Progress: ({ value }: { value?: number }) => (
		<div aria-label="Context window usage progress" role="progressbar">
			{value}
		</div>
	),
}))

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TooltipTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}))

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
		<button {...props}>{children}</button>
	),
}))

describe("ContextWindow compact button", () => {
	beforeEach(() => vi.clearAllMocks())

	it("runs the shared compact handler after confirmation instead of sending /compact as a message", () => {
		const compactTask = vi.fn().mockResolvedValue(true)
		const onSendMessage = vi.fn()

		render(
			<ContextWindow
				compactDisabled={false}
				compactTask={compactTask}
				contextWindow={200_000}
				lastApiReqTotalTokens={120_000}
				onSendMessage={onSendMessage}
				useAutoCondense={false}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: /compact task/i }))
		fireEvent.click(screen.getByRole("button", { name: /^compact$/i }))

		expect(compactTask).toHaveBeenCalledTimes(1)
		expect(onSendMessage).not.toHaveBeenCalled()
	})

	it("disables compaction during API error recovery", () => {
		render(
			<ContextWindow
				compactDisabled={true}
				compactTask={vi.fn()}
				contextWindow={200_000}
				lastApiReqTotalTokens={120_000}
				useAutoCondense={false}
			/>,
		)

		expect(screen.getByRole("button", { name: /compact task/i })).toBeDisabled()
	})

	it("labels dynamic request policy separately from the last confirmed allocation", () => {
		render(
			<ContextWindow
				compactDisabled={false}
				compactTask={vi.fn()}
				contextWindow={32768}
				dynamicContext={{ loadedCapacity: 32768, requestLimit: 1000000, tiers: [32768, 1000000], observedAtMs: 100 }}
				lastApiReqTotalTokens={100000}
				useAutoCondense={false}
			/>,
		)
		expect(screen.getByText("Dynamic · 1.0m")).toBeInTheDocument()
		expect(screen.getByText(/Last confirmed allocation: 32.8k tokens/)).toBeInTheDocument()
		expect(screen.getByRole("progressbar")).toHaveTextContent("10")
	})
})
