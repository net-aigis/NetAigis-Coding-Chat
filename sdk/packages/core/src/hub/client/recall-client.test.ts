/** RPC regression only; no productive requests. */
import { expect, it, vi } from "vitest";
import { HubRecallClient } from "./recall-client";

it("carries exact project identity through inspect and non-replayed recovery", async () => {
	const command = vi
		.fn()
		.mockResolvedValueOnce({
			ok: true,
			payload: {
				snapshot: {
					conversationId: "same-id",
					projectId: "OtherProject",
					journalSeq: 7,
					sourceVerified: true,
				},
			},
		})
		.mockResolvedValueOnce({
			ok: true,
			payload: {
				sessionId: "same-id",
				projectId: "OtherProject",
				imported: true,
				writerGranted: false,
				runtimeResident: false,
			},
		});
	const client = new HubRecallClient({ command } as never);
	expect(
		(await client.getSessionSnapshot("same-id", "OtherProject")).projectId,
	).toBe("OtherProject");
	expect(await client.restoreSession("same-id", 7, "OtherProject")).toBe(
		"same-id",
	);
	expect(command).toHaveBeenNthCalledWith(
		2,
		"session.recall.restore",
		{
			conversationId: "same-id",
			expectedJournalSeq: 7,
			projectId: "OtherProject",
		},
		"same-id",
		{ retryAfterDispatch: false },
	);
});

it("rejects another project's result even when the conversation ID is identical", async () => {
	const command = vi
		.fn()
		.mockResolvedValueOnce({
			ok: true,
			payload: {
				conversations: [
					{ conversationId: "same-id", projectId: "WrongProject" },
				],
			},
		})
		.mockResolvedValueOnce({
			ok: true,
			payload: {
				snapshot: {
					conversationId: "same-id",
					projectId: "WrongProject",
					journalSeq: 7,
					sourceVerified: true,
				},
			},
		})
		.mockResolvedValueOnce({
			ok: true,
			payload: {
				sessionId: "same-id",
				projectId: "WrongProject",
				imported: true,
				writerGranted: false,
				runtimeResident: false,
			},
		});
	const client = new HubRecallClient({ command } as never);
	await expect(client.listConversations("OtherProject")).rejects.toThrow(
		"not confirmed",
	);
	await expect(
		client.getSessionSnapshot("same-id", "OtherProject"),
	).rejects.toThrow("not confirmed");
	await expect(
		client.restoreSession("same-id", 7, "OtherProject"),
	).rejects.toThrow("not confirmed");
	expect(command).toHaveBeenCalledTimes(3);
});

it("rejects ambiguous discovery and never substitutes a configured default", async () => {
	for (const projects of [
		[{ projectId: "" }],
		[{ projectId: "one" }, { projectId: "one" }],
		[{}],
	]) {
		const command = vi.fn(async () => ({ ok: true, payload: { projects } }));
		await expect(
			new HubRecallClient({ command } as never).listProjects(),
		).rejects.toThrow("not confirmed");
		expect(command).toHaveBeenCalledExactlyOnceWith(
			"session.recall.projects",
			{},
			undefined,
			{ retryAfterDispatch: true },
		);
	}
});
