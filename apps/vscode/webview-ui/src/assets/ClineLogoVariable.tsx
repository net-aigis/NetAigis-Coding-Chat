import type { ImgHTMLAttributes } from "react"
import netaigisLogo from "../../../assets/icons/netaigis-coding-chat-large.png"

const NetAigisLogo = (props: ImgHTMLAttributes<HTMLImageElement> & { environment?: unknown }) => {
	const { environment: _environment, alt = "NetAigis Coding Chat", ...imageProps } = props
	return <img {...imageProps} src={netaigisLogo} alt={alt} />
}
export default NetAigisLogo
