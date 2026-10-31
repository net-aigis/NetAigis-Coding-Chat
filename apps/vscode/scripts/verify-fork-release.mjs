/** Read-only guard for this fork's VSIX/publishing entry point. */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const FORK_REPOSITORY = "https://git.wittmer.software/AIGIS/cline.git"

export function verifyForkRelease(pkg) {
	const fork = pkg?.fork
	if (pkg?.repository?.url !== FORK_REPOSITORY || fork?.repository !== FORK_REPOSITORY) {
		throw new Error("Fork packaging requires the own Forgejo repository")
	}
	if (
		typeof fork.upstream?.version !== "string" ||
		!fork.upstream.version ||
		!/^[a-f0-9]{40}$/.test(fork.upstream?.commit ?? "")
	) {
		throw new Error("Fork packaging requires a recorded upstream base, separate from the fork release")
	}
	const release = fork.release
	if (release?.approved !== true) {
		throw new Error("Fork release identity and version are not yet approved/configured; no production VSIX may be packaged")
	}
	for (const field of ["publisher", "name", "displayName", "version"]) {
		if (typeof release[field] !== "string" || !release[field].trim() || pkg[field] !== release[field]) {
			throw new Error("Package identity/version differs from the approved fork release metadata")
		}
	}
	if (pkg.publisher === "saoudrizwan" || pkg.name === "claude-dev" || pkg.displayName === "Cline") {
		throw new Error("Original Cline identity must not be used for this fork release")
	}
	return { extensionId: `${pkg.publisher}.${pkg.name}`, version: pkg.version, upstreamVersion: fork.upstream.version }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
		verifyForkRelease(pkg)
		console.info("Fork release metadata verified")
	} catch (error) {
		console.error(error instanceof Error ? error.message : "Fork release metadata could not be verified")
		process.exitCode = 1
	}
}
