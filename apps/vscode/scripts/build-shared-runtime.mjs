/** Package the existing Hub and browser into the own VSIX; never starts a service. */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repository = path.resolve(extensionRoot, "../..")
const output = path.join(extensionRoot, "dist/shared-runtime")
const pluginRuntime = path.join(extensionRoot, "dist/plugin-runtime/node_modules/@cline")
const exportsByPackage = new Map()
for (const name of ["shared", "llms", "agents", "core", "sdk"]) {
	const metadata = JSON.parse(await fs.readFile(path.join(pluginRuntime, name, "package.json"), "utf8"))
	exportsByPackage.set(name, metadata.exports)
}
const sdkExports = {
	name: "existing-packaged-sdk",
	setup(builder) {
		builder.onResolve({ filter: /^@cline\/(shared|llms|agents|core|sdk)(\/.*)?$/ }, async ({ path: specifier }) => {
			const [, name, suffix] = specifier.match(/^@cline\/([^/]+)(.*)$/)
			const entry = exportsByPackage.get(name)?.[`.${suffix}`]
			const target = typeof entry === "string" ? entry : entry?.import
			if (!target?.startsWith("./")) throw new Error(`Missing packaged SDK export: ${specifier}`)
			await fs.access(path.join(pluginRuntime, name, target))
			return { path: `../plugin-runtime/node_modules/@cline/${name}/${target.slice(2)}`, external: true }
		})
	},
}

await fs.access(path.join(repository, "apps/cline-hub/dist/webview/index.html"))
await build({
	entryPoints: [path.join(repository, "apps/cline-hub/src/netaigis-runtime.ts")],
	outdir: output,
	outExtension: { ".js": ".mjs" },
	chunkNames: "[name]-[hash]",
	bundle: true,
	splitting: true,
	format: "esm",
	platform: "node",
	target: "node22",
	external: ["bun", "bun:sqlite"],
	plugins: [sdkExports],
	define: { "process.env.NETAIGIS_PACKAGED_RUNTIME": JSON.stringify("true") },
	minify: true,
})
await fs.cp(path.join(repository, "apps/cline-hub/dist/webview"), path.join(output, "webview"), { recursive: true })
console.log(JSON.stringify({ event: "netaigis.shared_runtime.packaged", output, servicesStarted: false }))
