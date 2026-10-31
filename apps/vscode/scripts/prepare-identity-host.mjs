/** Prepare only explicit isolated fixture paths; no productive installation or user-profile mutation. */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const root = path.resolve(process.argv[2] ?? ""),
	app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
if (!process.argv[2] || !fs.statSync(root).isDirectory() || fs.readdirSync(root).length)
	throw new Error("Supply an existing empty private fixture directory")
for (const dir of ["export-helper", "transfer", "extensions", "workspace", "source-home/data"])
	fs.mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 })
const original = "/home/friseer/.vscode/extensions/saoudrizwan.claude-dev-4.1.25"
const originalPkg = JSON.parse(fs.readFileSync(path.join(original, "package.json")))
if (originalPkg.publisher !== "saoudrizwan" || originalPkg.name !== "claude-dev")
	throw new Error("Original fixture identity differs")
fs.cpSync(original, path.join(root, "extensions", path.basename(original)), { recursive: true, dereference: false })
execFileSync(process.execPath, [path.join(app, "scripts/build-identity-export.mjs"), path.join(root, "export-helper")], {
	cwd: app,
	stdio: "inherit",
})
const helper = path.join(root, "export-helper"),
	pkg = JSON.parse(fs.readFileSync(path.join(helper, "package.json")))
pkg.main = "./seed.cjs"
fs.writeFileSync(path.join(helper, "package.json"), JSON.stringify(pkg))
fs.writeFileSync(
	path.join(helper, "seed.cjs"),
	`const fs=require('node:fs'),path=require('node:path');exports.activate=async context=>{
if(!context.globalState.get('identityFixtureSeeded')){
 await context.secrets.store('openAiApiKey','fixture-real-native-token');
 await context.secrets.store('netaigis-recall_token','fixture-real-recall-token');
 await context.globalState.update('identityFixtureSeeded',true);
 await context.globalState.update('originalOrder','Preserve Friseer and jimmi authors');
 await context.workspaceState.update('fixtureWorkspaceSetting','preserved');
 const task=path.join(context.globalStorageUri.fsPath,'tasks','legacy-session');fs.mkdirSync(task,{recursive:true});
 fs.mkdirSync(path.join(context.globalStorageUri.fsPath,'state'),{recursive:true});
 fs.writeFileSync(path.join(context.globalStorageUri.fsPath,'state/taskHistory.json'),JSON.stringify([{id:'legacy-session',task:'Original task',ts:1}]));
 fs.writeFileSync(path.join(task,'api_conversation_history.json'),JSON.stringify([{role:'user',content:'Original task',metadata:{author:{actorId:'Friseer'}}},{role:'user',content:'Correction',metadata:{author:{actorId:'jimmi'}}},{role:'user',content:[{type:'tool_result',tool_use_id:'cmd',content:JSON.stringify({execution:{state:'unknown',observationFailed:true}})}]}]));
}
return require('./export.cjs').activate(context);};`,
)
fs.writeFileSync(
	path.join(root, "source-home/data/secrets.json"),
	JSON.stringify({ openAiApiKey: "fixture-real-native-token", "netaigis-recall_token": "fixture-real-recall-token" }),
	{ mode: 0o600 },
)
fs.writeFileSync(
	path.join(root, "source-home/data/globalState.json"),
	JSON.stringify({
		welcomeViewCompleted: true,
		openAiBaseUrl: "http://127.0.0.1:21436/v1",
		actModeApiProvider: "openai-compatible",
		planModeApiProvider: "openai-compatible",
		actModeOpenAiModelId: "fixture-125b",
		planModeOpenAiModelId: "fixture-125b",
	}),
	{ mode: 0o600 },
)
await esbuild.build({
	entryPoints: [path.join(app, "src/test/fork-identity-host-suite.ts")],
	outfile: path.join(root, "suite.cjs"),
	bundle: true,
	platform: "node",
	format: "cjs",
	external: ["vscode"],
	tsconfig: path.join(app, "tsconfig.json"),
})
const runnerUrl = new URL(path.join(app, "node_modules/@vscode/test-electron/out/index.js"), "file://").href
fs.writeFileSync(
	path.join(root, "launch.mjs"),
	`import {runTests} from ${JSON.stringify(runnerUrl)};import path from 'node:path';const root=${JSON.stringify(root)},phase=process.env.IDENTITY_TEST_PHASE;delete process.env.ELECTRON_RUN_AS_NODE;await runTests({vscodeExecutablePath:'/usr/share/code/code',extensionDevelopmentPath:phase==='seed'?path.join(root,'export-helper'):phase==='fallback'?[path.join(root,'export-helper'),${JSON.stringify(app)}]:${JSON.stringify(app)},extensionTestsPath:path.join(root,'suite.cjs'),launchArgs:[path.join(root,'workspace'),'--no-sandbox','--ozone-platform=x11','--disable-gpu','--disable-dev-shm-usage','--disable-workspace-trust','--password-store=basic','--skip-add-to-recently-opened','--skip-welcome','--skip-release-notes','--user-data-dir='+path.join(root,'user-data'),'--extensions-dir='+path.join(root,'extensions')],extensionTestsEnv:{IDENTITY_TEST_ROOT:root,IDENTITY_TEST_PHASE:phase,NETAIGIS_IDENTITY_MIGRATION_ONLY:phase==='import'||phase==='fallback'||phase==='verify-final'?'1':'0',CLINE_DIR:path.join(root,'source-home'),CLINE_DATA_DIR:path.join(root,'source-home/data'),CLINE_DB_DATA_DIR:path.join(root,'source-home/data/db'),CLINE_SESSION_DATA_DIR:path.join(root,'source-home/data/sessions'),NETAIGIS_RECALL_QUEUE_DIR:path.join(root,'source-home/netaigis-recall-outbox'),OTEL_SDK_DISABLED:'true'}});`,
)
fs.writeFileSync(
	path.join(root, "run-host.py"),
	`import subprocess,os,pathlib,sys,uuid,json,datetime,time
root=pathlib.Path(${JSON.stringify(root)})
phase=os.environ['IDENTITY_TEST_PHASE']; nonce=uuid.uuid4().hex
if not phase.replace('-','').isalnum():raise SystemExit('Invalid fixture phase')
os.makedirs('/tmp/.X11-unix',mode=0o1777,exist_ok=True)
record={'phase':phase,'parent_pid':os.getpid(),'spawn_requested_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':['/usr/bin/Xvfb','-displayfd','1','-screen','0','1280x800x24','-nolisten','tcp','-extension','GLX']}
record_path=root/('xvfb-process-'+phase+'-'+nonce+'.json')
def save():
 fd=os.open(record_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 try:os.write(fd,json.dumps(record,indent=2).encode());os.fsync(fd)
 finally:os.close(fd)
start=time.monotonic_ns();code=1
with (root/('xvfb-'+phase+'-'+nonce+'.log')).open('x') as log:
 server=subprocess.Popen(record['argv'],stdout=subprocess.PIPE,stderr=log,text=True)
 record['pid']=server.pid;save()
 try:
  display=server.stdout.readline().strip();record['display']=display
  record['ready_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
  if not display:raise RuntimeError('Private X server did not become ready')
  env=os.environ.copy();env['DISPLAY']=':'+display;env['GSETTINGS_BACKEND']='memory';env['XDG_RUNTIME_DIR']='/tmp/identity-runtime';os.makedirs(env['XDG_RUNTIME_DIR'],mode=0o700,exist_ok=True);env.pop('WAYLAND_DISPLAY',None);env.pop('ELECTRON_RUN_AS_NODE',None);env['DBUS_SESSION_BUS_ADDRESS']='unix:path=/tmp/nonexistent-identity-test-bus'
  if phase=='xvfb-smoke':
   probe=subprocess.run(['xdpyinfo','-display',':'+display,'-queryExtensions'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=15)
   record['probe_exit_code']=probe.returncode;record['glx_present']='GLX' in probe.stdout
   if probe.returncode or record['glx_present']:raise RuntimeError('Private X extension probe failed')
   code=0
  else:code=subprocess.run(['node','launch.mjs'],cwd=root,env=env).returncode
 finally:
  record['running_before_cleanup']=server.poll() is None
  if record['running_before_cleanup']:server.terminate()
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.kill();server.wait()
  record['exit_code']=server.returncode;record['test_exit_code']=code;record['ended_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();record['duration_ns']=time.monotonic_ns()-start;save()
 if not record['running_before_cleanup']:raise SystemExit('Private X server exited unexpectedly')
print(json.dumps({'phase':phase,'xvfb_pid':record['pid'],'test_exit_code':code,'server_exit_code':server.returncode,'process_record':str(record_path)}))
raise SystemExit(code)
`,
)

console.log("Prepared isolated native-context migration and coexistence tests")
