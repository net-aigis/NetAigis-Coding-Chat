/** Build an export-only helper under the old ID, solely into an explicitly chosen existing isolated directory. */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const output = path.resolve(process.argv[2] ?? "")
if (!process.argv[2] || !fs.statSync(output).isDirectory() || fs.readdirSync(output).length)
	throw new Error("Supply an existing empty isolated helper directory")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
await esbuild.build({
	entryPoints: [path.join(root, "src/hosts/vscode/fork-identity-export.ts")],
	outfile: path.join(output, "export.cjs"),
	bundle: true,
	platform: "node",
	format: "cjs",
	external: ["vscode"],
	tsconfig: path.join(root, "tsconfig.json"),
})
fs.writeFileSync(
	path.join(output, "package.json"),
	JSON.stringify({
		publisher: "saoudrizwan",
		name: "claude-dev",
		version: "4.1.26",
		displayName: "Legacy identity export helper (isolated migration only)",
		engines: { vscode: "^1.101.0" },
		main: "./export.cjs",
		activationEvents: [],
	}),
)
