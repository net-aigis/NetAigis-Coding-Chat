import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { fork } from "../../../../../package.json"
import Section from "../Section"

interface AboutSectionProps {
	version: string
	extensionVariant?: "legacy" | "next"
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const VARIANT_LABELS: Record<"legacy" | "next", string> = {
	legacy: "Legacy",
	next: "Next",
}

const AboutSection = ({ version, extensionVariant, renderSectionHeader }: AboutSectionProps) => {
	return (
		<div>
			{renderSectionHeader("about")}
			<Section>
				<div className="flex px-4 flex-col gap-2">
					<h2 className="text-lg font-semibold">
						NetAigis Coding Chat v{version}
						{extensionVariant && (
							<span className="ml-2 text-sm font-normal text-description">
								({VARIANT_LABELS[extensionVariant]})
							</span>
						)}
					</h2>
					<p>
						An AI assistant that can use your CLI and Editor. NetAigis Coding Chat can handle complex software
						development tasks step-by-step with tools that let him create & edit files, explore large projects, use
						the browser, and execute terminal commands (after you grant permission).
					</p>

					<p className="text-sm text-description">
						Extension-ID: netaigis.netaigis-coding-chat · Upstream base: Cline v{fork.upstream.version}
					</p>
					<h3 className="text-md font-semibold">Development</h3>
					<p>
						<VSCodeLink href="https://git.wittmer.software/AIGIS/cline.git">Own Forgejo repository</VSCodeLink>
					</p>
					<h3 className="text-md font-semibold">Upstream references</h3>
					<p>
						<VSCodeLink href="https://github.com/cline/cline">Cline source</VSCodeLink>
						{" • "}
						<VSCodeLink href="https://docs.cline.bot/">Upstream documentation</VSCodeLink>
					</p>
				</div>
			</Section>
		</div>
	)
}

export default AboutSection
