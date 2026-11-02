import { randomBytes } from "node:crypto"

/** Session content arrives as messages and is rendered only as text. */
export function renderRecallSessionBrowser(): string {
	const nonce = randomBytes(18).toString("hex")
	return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOTAL RECALL</title><style nonce="${nonce}">
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:1rem}
button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:.5rem;margin:.3rem}
li{margin:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body><h1>TOTAL RECALL</h1>
<button id="refresh">Aktualisieren</button><button id="configure">Konfiguration</button>
<p>Gespeicherten Verlauf lesen oder für die gemeinsame Sitzung bereitstellen. Schreibübergabe und Wiederaufnahme erfolgen in der Sitzung.</p>
<button id="restore" disabled>Verlauf in gemeinsamer Sitzung bereitstellen</button>
<p id="status" role="status"></p><ul id="list"></ul><pre id="snapshot"></pre>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();
const list=document.getElementById('list'),status=document.getElementById('status'),snapshot=document.getElementById('snapshot');
const restore=document.getElementById('restore');let selected;
restore.addEventListener('click',()=>{if(selected){restore.disabled=true;vscode.postMessage({command:'restore-session',conversationId:selected.conversationId,projectId:selected.projectId});}});
document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'list-sessions'}));
document.getElementById('configure').addEventListener('click',()=>vscode.postMessage({command:'configure'}));
window.addEventListener('message',event=>{
 const data=event.data;
 if(data.cmd==='render'){
  selected=undefined;restore.disabled=true;
  list.replaceChildren();
  for(const session of data.sessions){
   const item=document.createElement('li'),title=document.createElement('span'),button=document.createElement('button');
   title.textContent=(session.title||session.conversationId)+' | '+session.projectId+' | '+session.eventCount+' Ereignisse';
   button.textContent='Verlauf lesen';
   button.addEventListener('click',()=>vscode.postMessage({command:'read-session',conversationId:session.conversationId,projectId:session.projectId}));
   item.append(title,button);list.append(item);
  }
  status.textContent=data.sessions.length+' Sitzungen';
 }else if(data.cmd==='snapshot'){
  selected={conversationId:data.snapshot.conversationId,projectId:data.snapshot.projectId};restore.disabled=data.canRestore!==true;
  snapshot.textContent=JSON.stringify(data.snapshot,null,2);
  status.textContent='Verlauf geladen; keine laufende Aufgabe übernommen';
 }else if(data.cmd==='restored'){
  selected=undefined;restore.disabled=true;
  status.textContent='Verlauf für Sitzung '+data.sessionId+' bereitgestellt; kein Prozess gestartet und kein Schreibrecht erteilt.';
 }else if(data.cmd==='msg'){restore.disabled=true;status.textContent=data.msg;}
});
vscode.postMessage({command:'list-sessions'});
</script></body></html>`
}
