import type { SVGProps } from "react"

const NetAigisLogo = (props: SVGProps<SVGSVGElement> & { environment?: unknown }) => {
	const { environment: _environment, ...svgProps } = props
	return (
		<svg fill="none" viewBox="0 0 128 128" {...svgProps}>
			<title>NetAigis Coding Chat</title>
			<path
				d="M24 16h80a12 12 0 0 1 12 12v60a12 12 0 0 1-12 12H65l-25 18v-18H24a12 12 0 0 1-12-12V28a12 12 0 0 1 12-12Z"
				fill="currentColor"
			/>
			<path d="M38 78V38h12l28 30V38h12v40H78L50 48v30Z" fill="var(--vscode-sideBar-background,#182231)" />
		</svg>
	)
}
export default NetAigisLogo
