import { extractCommandExecution } from "@shared/command-execution"
import { act, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CommandOutputContent, CommandOutputRow } from "./CommandOutputRow"

vi.mock("../common/CodeBlock", () => ({
	default: ({ source }: { source: string }) => <pre>{source}</pre>,
}))

describe("CommandOutputRow process labels", () => {
	it.each([
		[{ state: "unknown" }, "Status unknown"],
		[{ state: "running" }, "Running"],
		[{ state: "unknown", observationFailed: true }, "Observation failed"],
		[{ state: "completed", exitCode: 0 }, "Completed"],
		[{ state: "failed", exitCode: 2 }, "Failed"],
	] as const)("renders factual process state %j", (execution, label) => {
		render(
			<CommandOutputRow
				isOutputFullyExpanded={false}
				message={{
					ts: 1,
					type: "say",
					say: "command",
					text: "sleep 60",
					partial: false,
					commandCompleted: true,
					commandExecution: extractCommandExecution([{ execution }]),
				}}
				setIsOutputFullyExpanded={vi.fn()}
			/>,
		)
		expect(screen.getByText(label)).toBeInTheDocument()
		if (label !== "Completed") expect(screen.queryByText("Completed")).not.toBeInTheDocument()
	})
	it("does not present a legacy unverified completion flag as a confirmed exit", () => {
		render(
			<CommandOutputRow
				isOutputFullyExpanded={false}
				message={{ ts: 2, type: "say", say: "command", text: "build", commandCompleted: true }}
				setIsOutputFullyExpanded={vi.fn()}
			/>,
		)
		expect(screen.getByText("Status unknown")).toBeInTheDocument()
	})
})

describe("CommandOutputContent", () => {
	it("notifies when visible output changes", async () => {
		const onOutputChange = vi.fn()
		const { rerender } = render(
			<CommandOutputContent
				isContainerExpanded={true}
				isOutputFullyExpanded={false}
				onOutputChange={onOutputChange}
				onToggle={vi.fn()}
				output="first line"
			/>,
		)

		await waitFor(() => expect(onOutputChange).toHaveBeenCalledTimes(1))

		rerender(
			<CommandOutputContent
				isContainerExpanded={true}
				isOutputFullyExpanded={false}
				onOutputChange={onOutputChange}
				onToggle={vi.fn()}
				output={"first line\nsecond line"}
			/>,
		)

		await waitFor(() => expect(onOutputChange).toHaveBeenCalledTimes(2))
	})

	it("notifies when visible output expansion changes", async () => {
		const onOutputChange = vi.fn()
		const { rerender } = render(
			<CommandOutputContent
				isContainerExpanded={true}
				isOutputFullyExpanded={false}
				onOutputChange={onOutputChange}
				onToggle={vi.fn()}
				output={"1\n2\n3\n4\n5\n6"}
			/>,
		)

		await waitFor(() => expect(onOutputChange).toHaveBeenCalledTimes(1))

		rerender(
			<CommandOutputContent
				isContainerExpanded={true}
				isOutputFullyExpanded={true}
				onOutputChange={onOutputChange}
				onToggle={vi.fn()}
				output={"1\n2\n3\n4\n5\n6"}
			/>,
		)

		await waitFor(() => expect(onOutputChange).toHaveBeenCalledTimes(2))
	})

	it("does not notify while the container is collapsed", async () => {
		const onOutputChange = vi.fn()
		render(
			<CommandOutputContent
				isContainerExpanded={false}
				isOutputFullyExpanded={false}
				onOutputChange={onOutputChange}
				onToggle={vi.fn()}
				output="hidden"
			/>,
		)

		await act(async () => {})
		expect(onOutputChange).not.toHaveBeenCalled()
	})
})
