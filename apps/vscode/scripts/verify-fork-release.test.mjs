import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { verifyForkRelease } from "./verify-fork-release.mjs"

const actual = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
function fixture() {
	const pkg = structuredClone(actual)
	Object.assign(pkg, { publisher: "fixture-publisher", name: "fixture-agent", displayName: "Fixture Agent", version: "9.2.3" })
	pkg.fork.release = {
		publisher: pkg.publisher,
		name: pkg.name,
		displayName: pkg.displayName,
		version: pkg.version,
		approved: true,
	}
	return pkg
}
test("the actual pending identity cannot accidentally produce a production VSIX", () => {
	const pending = fixture()
	pending.fork.release = null
	assert.throws(() => verifyForkRelease(pending), /not yet approved/)
	if (actual.fork.release?.approved === true) {
		assert.equal(verifyForkRelease(actual).extensionId, `${actual.publisher}.${actual.name}`)
	} else {
		assert.throws(() => verifyForkRelease(actual), /not yet approved/)
	}
})
test("a complete approved fixture keeps fork and upstream versions separate", () => {
	assert.deepEqual(verifyForkRelease(fixture()), {
		extensionId: "fixture-publisher.fixture-agent",
		version: "9.2.3",
		upstreamVersion: "4.1.26",
	})
})
for (const field of ["publisher", "name", "displayName", "version"]) {
	test(`rejects a changed package ${field} after approval`, () => {
		const pkg = fixture()
		pkg[field] = "different"
		assert.throws(() => verifyForkRelease(pkg), /differs/)
	})
}
test("approval flag alone cannot reuse the original identity", () => {
	const pkg = fixture()
	Object.assign(pkg, { publisher: "saoudrizwan", name: "claude-dev", displayName: "Cline" })
	Object.assign(pkg.fork.release, { publisher: pkg.publisher, name: pkg.name, displayName: pkg.displayName })
	assert.throws(() => verifyForkRelease(pkg), /Original Cline identity/)
})
test("does not fall back to upstream publishing metadata", () => {
	const pkg = fixture()
	pkg.repository.url = "https://github.com/cline/cline"
	assert.throws(() => verifyForkRelease(pkg), /Forgejo/)
})
test("requires explicit upstream provenance without creating a tag or changing files", () => {
	const pkg = fixture()
	delete pkg.fork.upstream
	assert.throws(() => verifyForkRelease(pkg), /recorded upstream base/)
})
