import { BooleanRequest } from "@shared/proto/cline/common"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import ProductLogo from "@/assets/ClineLogoWhite"
import ApiOptions from "@/components/settings/ApiOptions"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { StateServiceClient } from "@/services/grpc-client"
import { validateApiConfiguration } from "@/utils/validate"

export default function WelcomeView() {
	const { apiConfiguration, mode } = useExtensionState()
	const [error, setError] = useState<string>()
	const validation = validateApiConfiguration(mode, apiConfiguration)
	return (
		<div className="fixed inset-0 overflow-auto px-5 py-6">
			<ProductLogo className="size-16" />
			<h1>NetAigis Coding Chat</h1>
			<p>Use your local model or an existing provider. An external Cline account is not required.</p>
			<p>Existing model endpoints, routing and session data are retained by the verified migration.</p>
			<ApiOptions currentMode={mode} showModelOptions />
			{error && <p role="alert">{error}</p>}
			<VSCodeButton
				disabled={!!validation}
				onClick={async () => {
					try {
						await StateServiceClient.setWelcomeViewCompleted(BooleanRequest.create({ value: true }))
					} catch {
						setError("Configuration could not be saved. Existing data was retained.")
					}
				}}>
				Continue with this configuration
			</VSCodeButton>
		</div>
	)
}
