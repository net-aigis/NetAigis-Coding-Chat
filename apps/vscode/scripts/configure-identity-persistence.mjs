/** Normal isolated VS Code starts: --extensionTestsPath forces RAM-only storage and cannot prove persistence. */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(process.argv[2] ?? ""),
	app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
if (!process.argv[2] || !fs.existsSync(path.join(root, "export-helper/seed.cjs")))
	throw new Error("Supply the previously prepared isolated test root")
const driver = path.join(root, "persistence-driver"),
	transfer = path.join(root, "transfer-persistent"),
	home = path.join(root, "source-home-persistent")
for (const dir of [driver, transfer]) fs.mkdirSync(dir, { mode: 0o700 })
fs.cpSync(path.join(root, "transfer/payload/home"), home, { recursive: true })
const seed = path.join(root, "export-helper/seed.cjs")
fs.writeFileSync(
	seed,
	fs
		.readFileSync(seed, "utf8")
		.replace(
			"if(!context.globalState.get('identityFixtureSeeded'))",
			"if(process.env.IDENTITY_TEST_PHASE==='seed'&&!context.globalState.get('identityFixtureSeeded'))",
		),
)
fs.writeFileSync(
	path.join(driver, "package.json"),
	JSON.stringify({
		publisher: "netaigis",
		name: "identity-migration-driver",
		version: "0.0.0",
		engines: { vscode: "^1.101.0" },
		main: "./driver.cjs",
		activationEvents: ["onStartupFinished"],
	}),
)
fs.writeFileSync(
	path.join(driver, "driver.cjs"),
	`const vscode=require('vscode');exports.activate=()=>{setImmediate(()=>{require('../suite.cjs').run().then(()=>vscode.commands.executeCommand('workbench.action.quit'),()=>vscode.commands.executeCommand('workbench.action.quit'));});};`,
)
fs.writeFileSync(
	path.join(root, "launch.mjs"),
	`import {spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const root=${JSON.stringify(root)},app=${JSON.stringify(app)},phase=process.env.IDENTITY_TEST_PHASE;
const profile=path.join(root,'user-data-persistent'),home=path.join(root,'source-home-persistent');
const developments=[path.join(root,'persistence-driver'),...(phase==='seed'?[path.join(root,'export-helper')]:phase==='fallback'?[path.join(root,'export-helper'),app]:[app])];
const env={...process.env,IDENTITY_TEST_ROOT:root,IDENTITY_TEST_PROFILE_ROOT:profile,IDENTITY_TEST_HOME:home,IDENTITY_TEST_TRANSFER:path.join(root,'transfer-persistent'),IDENTITY_TEST_RESULT_SUFFIX:'-persistent',NETAIGIS_IDENTITY_MIGRATION_ONLY:['import','fallback','verify-final'].includes(phase)?'1':'0',CLINE_DIR:home,CLINE_DATA_DIR:path.join(home,'data'),CLINE_DB_DATA_DIR:path.join(home,'data/db'),CLINE_SESSION_DATA_DIR:path.join(home,'data/sessions'),NETAIGIS_RECALL_QUEUE_DIR:path.join(home,'netaigis-recall-outbox'),OTEL_SDK_DISABLED:'true'};
delete env.ELECTRON_RUN_AS_NODE;delete env.VSCODE_IPC_HOOK_CLI;
const result=path.join(root,'result-'+phase+'-persistent.json');if(fs.existsSync(result))throw new Error('Refusing to overwrite prior persistent result');
const child=spawn('/usr/share/code/code',[path.join(root,'workspace'),'--no-sandbox','--ozone-platform=x11','--disable-gpu','--disable-dev-shm-usage','--disable-workspace-trust','--password-store=basic','--skip-add-to-recently-opened','--skip-welcome','--skip-release-notes','--shared-data-dir='+path.join(root,'shared-data-persistent'),'--user-data-dir='+profile,'--extensions-dir='+path.join(root,'extensions'),...developments.map(p=>'--extensionDevelopmentPath='+p)],{env,stdio:'inherit'});
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve(signal?1:code))});
if(code!==0)throw new Error('Normal isolated VS Code did not exit successfully');
const report=JSON.parse(fs.readFileSync(result,'utf8'));if(report.error||!report.passed)throw new Error('Persistent host assertions failed; see private result');console.log(JSON.stringify({phase,passed:report.passed,vscodeVersion:report.vscodeVersion,persistent:true}));
`,
)
console.log("Configured normal isolated VS Code lifecycle with persistent native storage; fallback cannot reseed secrets")
