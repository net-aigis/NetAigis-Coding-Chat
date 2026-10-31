import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HubActorRegistry, readProtectedActorTokens } from "./actor-auth";

it("only loads an explicitly selected private regular actor configuration", async () => {
	const root = await mkdtemp(join(tmpdir(), "cline-actor-config-")),
		file = join(root, "actors.json"),
		link = join(root, "alias.json");
	try {
		await expect(readProtectedActorTokens(undefined)).resolves.toBeUndefined();
		await writeFile(
			file,
			JSON.stringify({ Friseer: "fixture-private-token" }),
			{ mode: 0o600 },
		);
		await expect(readProtectedActorTokens(file)).resolves.toEqual({
			Friseer: "fixture-private-token",
		});
		await symlink(file, link);
		await expect(readProtectedActorTokens(link)).rejects.toThrow("protected");
		await chmod(file, 0o644);
		await expect(readProtectedActorTokens(file)).rejects.toThrow("protected");
		await chmod(file, 0o600);
		await writeFile(file, '{"secret": "fixture-private-token"');
		try {
			await readProtectedActorTokens(file);
			throw new Error("expected rejection");
		} catch (error) {
			expect(String(error)).toContain("configuration");
			expect(String(error)).not.toContain("fixture-private-token");
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

describe("server-owned actor authentication", () => {
	it("binds exact original actor IDs to their own tokens", () => {
		const registry = new HubActorRegistry({
			Friseer: "fixture-friseer-key",
			jimmi: "fixture-jimmi-key",
		});
		expect(registry.resolve("fixture-friseer-key")).toBe("Friseer");
		expect(registry.resolve("fixture-jimmi-key")).toBe("jimmi");
		expect(registry.resolve("Friseer")).toBeUndefined();
		expect(registry.resolve(null)).toBeUndefined();
	});
	it.each<Readonly<Record<string, string>>>([
		{},
		{ Friseer: "" },
		{ Friseer: "same-fixture", jimmi: "same-fixture" },
		{ " Friseer": "fixture-key" },
	])("rejects ambiguous configuration without echoing secrets (%#)", (tokens) => {
		expect(() => new HubActorRegistry(tokens)).toThrow();
		try {
			new HubActorRegistry(tokens);
		} catch (error) {
			expect(String(error)).not.toContain("fixture-key");
		}
	});
});
