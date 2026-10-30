import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ClineFileStorage } from "@/shared/storage/ClineFileStorage"

vi.mock("@/shared/services/Logger", () => ({ Logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
let directory: string | undefined
afterEach(async () => {
	if (directory) await rm(directory, { recursive: true, force: true })
	directory = undefined
})
const strictOptions = { fileMode: 0o600, failOnError: true } as ConstructorParameters<typeof ClineFileStorage>[2]

describe("protected configuration persistence", () => {
	it("reports a real failed write without acknowledging a durable credential or changing the file cache", async () => {
		directory = await mkdtemp(path.join(os.tmpdir(), "cline-protected-storage-"))
		const blocker = path.join(directory, "not-a-directory")
		await writeFile(blocker, "existing file")
		const store = new ClineFileStorage<string>(path.join(blocker, "secrets.json"), "Secrets", strictOptions)
		expect(() => store.setBatch({ recall: "fixture-credential" })).toThrow()
		expect(store.get("recall")).toBeUndefined()
		expect(await readFile(blocker, "utf8")).toBe("existing file")
	})

	it("does not replace a malformed protected store with an empty one", async () => {
		directory = await mkdtemp(path.join(os.tmpdir(), "cline-protected-storage-"))
		const target = path.join(directory, "secrets.json")
		const original = '{"credential":"fixture-secret",broken'
		await writeFile(target, original, { mode: 0o600 })
		expect(() => new ClineFileStorage<string>(target, "Secrets", strictOptions)).toThrow()
		expect(await readFile(target, "utf8")).toBe(original)
	})
})
