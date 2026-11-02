import { expect, it } from "vitest";
import {
	preserveSessionRecallProject,
	readSessionRecallProject,
} from "./recall-project";

it("has no project for unassigned native history and retains exact explicit identities", () => {
	expect(readSessionRecallProject({ workspace: "NetAigisOS" })).toBeUndefined();
	expect(readSessionRecallProject({ recallProjectId: "NetAigisOS" })).toBe(
		"NetAigisOS",
	);
	expect(readSessionRecallProject({ recallProjectId: "OtherProject" })).toBe(
		"OtherProject",
	);
});
it("retains a verified native import's project without assigning it to unrelated sessions", () => {
	const metadata = {
		runtimeSnapshotImport: {
			state: "complete",
			source: { kind: "recall", projectId: "OtherProject" },
		},
	};
	expect(readSessionRecallProject(metadata)).toBe("OtherProject");
	expect(
		preserveSessionRecallProject(metadata, { title: "Changed title" }),
	).toEqual({ title: "Changed title", recallProjectId: "OtherProject" });
});
it("refuses malformed, conflicting or reassigned canonical bindings", () => {
	for (const value of [null, "", " ", {}, 7])
		expect(() => readSessionRecallProject({ recallProjectId: value })).toThrow(
			"binding is invalid",
		);
	expect(() =>
		preserveSessionRecallProject(
			{ recallProjectId: "NetAigisOS" },
			{ recallProjectId: "OtherProject" },
		),
	).toThrow("cannot be reassigned");
	expect(() =>
		readSessionRecallProject({
			recallProjectId: "NetAigisOS",
			runtimeSnapshotImport: {
				state: "complete",
				source: { kind: "recall", projectId: "OtherProject" },
			},
		}),
	).toThrow("disagree");
});
it("preserves binding when ordinary metadata updates omit it without rewriting either input", () => {
	const previous = { recallProjectId: "NetAigisOS" },
		next = { title: "New title" };
	expect(preserveSessionRecallProject(previous, next)).toEqual({
		...next,
		recallProjectId: "NetAigisOS",
	});
	expect(next).toEqual({ title: "New title" });
	expect(previous).toEqual({ recallProjectId: "NetAigisOS" });
});
