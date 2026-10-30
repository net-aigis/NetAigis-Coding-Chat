# Phase 4 — Reparatur und Fertigstellung

Fortsetzung auf `5a435f22ebed76c1aaaec0f1de37aa9c7600db9c` im bestehenden
Reparatur-Worktree. Phase 1–3 und ihre Sicherungen werden nicht wiederholt.
Alle neuen Prüfartefakte liegen unter
`tmp/phase4-checks-20261030T193507+0100/` im Reparatur-Worktree, außerhalb
der Git-Versionierung. Die ersten Prüfungen wurden dort unverändert aus
einem zunächst außerhalb angelegten Prüfverzeichnis übernommen;
`metadata/evidence-location.json` dokumentiert die Verlagerung.

## Priorität 1: Terminal und Werkzeugausführung

Status: gezielte Reparatur abgeschlossen. Noch keine produktive Abnahme und
keine Installation; die vollständige Regression bleibt Phase 5 zugeordnet.

### Präzisierung des Phase-3-Signalbefunds

Der übernommene Signaltest scheitert in der Sandbox weiterhin. Eine direkte
Gegenprobe ohne Cline mit `node:child_process.spawn` zeigt denselben Verlust:
Node-Kindprozesse liefern keine stdout-/stderr-Chunks; `spawnSync` meldet
zusätzlich `EPERM`. Python kann dieselben Node-Kindprogramme dagegen lesen.
Außerhalb der Sandbox liefert das minimale Node-Beispiel beide Streams und
der **unveränderte** Signaltest besteht (2/2, Log
`p1-signal-outside-sandbox`). Deshalb wird kein Cline-Patch als Behebung dieses
Umgebungseffekts ausgegeben. Die frühere Phase-3-Ausgabe war ein echter
fehlgeschlagener Test, aber kein Nachweis seiner Ursache im Cline-Code.

### Tatsächlich reproduzierte Fehler und Korrekturen

Vier neue Vertragsprüfungen scheiterten vor dem Patch auch außerhalb der
Sandbox (`p1-cancellation-red`, 0/4). Sie betreffen erhaltene stdout/stderr
bei Timeout und Benutzerabbruch, tatsächliche Weitergabe eines Tool-Timeouts
an den Executor sowie die Ausgabe über die öffentliche Builtin-Grenze.
Im ersten gezielten Lauf nach dem Patch bestehen diese vier Tests.

Der Executor sammelt nach einem Abbruch nun bis zum Abschluss der Pipes
weiter und meldet die vorhandene Ausgabe mit Timeout bzw. Abort. Ein
begrenzter Rückfall meldet ausdrücklich fehlende Bestätigung der
Prozessbeendigung. Der öffentliche Shell-Wrapper reicht einen eigenen
Abbruch an den Executor weiter und begrenzt auch nicht kooperierende
Executoren. Empfangene Fortschrittsausgabe bleibt in seinem begrenzten
Ausgabepuffer erhalten. Ein zu spät zurückgegebener Erfolg nach Abbruch
gilt nicht als erfolgreicher Befehl.

Unbekannter VS-Code-Terminalabschluss wird als `unknown` ohne erfundenen
Exitcode gemeldet. Ein beobachtetes Signal bleibt von einem echten
numerischen Exitcode getrennt. Ctrl+C ist lediglich eine Abbruchanforderung,
keine bestätigte Prozessbeendigung. Empfangene Ausgabe bleibt im Fehler.
Der neue optionale `execution`-Teil eines fehlgeschlagenen Werkzeugergebnisses
trägt diese Angaben über die bestehende Werkzeugschnittstelle weiter.
Keine separate Überwachungs- oder Speicherarchitektur wurde angelegt.

Der allgemeine Timeout-Helper entfernt seinen Timer nach einem bereits
abgeschlossenen Werkzeug; bisher blieb dieser bis zum Deadline-Zeitpunkt
aktiv. Die VS-Code-Testadapter exportieren die echten neuen SDK-Fehlerklassen,
statt deren Verhalten nachzubauen.

Zwischenstand: SDK-Gesamtbuild und Core-Typprüfung erfolgreich. Die 80
gezielten VS-Code-Tests bestehen. Im breiteren Core-Lauf bestehen 135 Tests,
14 Windows-/PowerShell-Fälle sind auf diesem Host übersprungen; zwei
Ausgabe-Erwartungen wurden durch die Benutzer-Bash-Startausgabe `dircolors`
verfälscht. Diese beiden Tests wurden auf eine explizite POSIX-Kontrollshell
beschränkt; tatsächliche Benutzer-Shell-Ausgabe wird produktiv weiterhin
erhalten und nicht gefiltert.

Abschließender Lauf dieser Korrektur: `p1-core-final` erfolgreich, 138 bestanden,
14 Windows-/PowerShell-Fälle auf diesem Host übersprungen, keine Fehler.
`p1-vscode-corrected` besteht mit 80/80; nach drei weiteren Fällen für leere
Rejection und ungültige Exitcodes besteht die betroffene Terminaldatei mit
54/54 (`p1-vscode-terminal-final`). Insgesamt damit 221 unterschiedliche
erfolgreiche Prüfungen, 14 plattformbedingt übersprungen. SDK/Core-Build,
Core-Typprüfung und VS-Code-Typprüfung erfolgreich. Commit `1c5db6c56`.

### Warte- und Werkzeugschleifen

Zwei neue Tests reproduzieren die Umgehung mit unterschiedlichen `sleep`-
Dauern (`p1-wait-red`: 1 bestanden, 2 fehlgeschlagen). Der vorhandene Tracker
gruppiert jetzt ausschließlich eigenständige reine Schlafbefehle, auch in
strukturierter argv-Form, unabhängig von ihrer Dauer. Befehle mit zusätzlicher
Arbeit bleiben getrennt. Tests führen dafür keinen echten Sleep aus.

Die echte AgentRuntime prüft außerdem eine Charge aus sechs identischen
Aufrufen: bereits bestehendes korrektes Verhalten, null Ausführungen nach
der Stop-Entscheidung. Dafür wird keine neue Behebung behauptet.
`p1-loop-final`: 98/98 bestanden, einschließlich bisherigem Orchestrator,
isolierten Trackerprüfungen und sechs echten Runtime-Integrationsfällen.
Core-Build und Core-Typprüfung erfolgreich. Priorität 1 damit gezielt mit
319 unterschiedlichen bestandenen Tests und 14 plattformbedingten Skips
geprüft; keine Behauptung einer produktiven oder plattformübergreifenden Abnahme.

## Verbindliche Fortsetzung

Erst nach belegtem Abschluss von Priorität 1 folgen Kontext-/Auftragskontinuität,
TOTAL RECALL, Schnittstellen zu den eigenständigen Acer-Diensten und Android
auf derselben laufenden Sitzung. Modellendpunkte und Routing bleiben erhalten.
Der unabhängige Watchdog ist ein separater Acer-Dienst außerhalb Cline und
getrennt von Coding-Agent und Learning-Agent. Cline erhält keine zusätzliche
KI-Überwachungsarchitektur. Originalbranch, produktive Erweiterung und Dienste
dürfen nicht verändert werden. Eigene produktive Installation bleibt das
spätere Endziel nach Abnahme, Rückfallvorbereitung und echten Funktionstests.


## Ergänzende Priorität 1: gemessene vorzeitige Rückgabe

Die spätere Benutzerbeobachtung erweitert den zuvor abgeschlossenen gezielten
Befund; die Commits `1c5db6c56` und `6b098bcff` bleiben erhalten.
Die echte VS-Code-Vorhermessung nutzt **keine Shell-Integration**:
`VscodeTerminalProcess.run` startet über `sendText`, wartet 3000ms und emittiert
fälschlich `completed`. Alle fünf Aufrufe kehren nach 3,117s ab Werkzeugaufruf
zurück (3,139–3,142s auf der gemeinsamen Messuhr). Die fünf Prozesse leben
zu diesem Zeitpunkt noch. Nach der nächsten Terminalakquisition sind sie
spätestens bei der Kontrolle 500ms später verschwunden; kein Enddatensatz und
kein bestätigter Exitcode liegen vor. Der genaue Todeszeitpunkt und ein
Signal/Exitcode dürfen daraus nicht erfunden werden. Dank der früheren
Korrektur sind die Werkzeugergebnisse bereits `success: false`, obwohl das
interne Completed-Ereignis noch falsch war.

Der Markerless-Prompt-Pfad ist als zweiter Quellcodefehler abgesichert, aber
nicht als Ursache dieser Vorhermessung ausgegeben. Weder Prompt-Klassifikation
noch Leerlauf oder Stream-Ende bestätigen jetzt den Prozessabschluss. Nur
das passende Shell-Execution-Endereignis mit gültigem numerischem Exitcode
führt zu `completed`. Fehlender Code bleibt unbekannt; ein D-Marker wird nicht
als Ersatz befördert. Ein Stream-Fehler trägt zusätzlich
`execution.observationFailed`. Terminals unbekannter Ausführungen werden aus
der Wiederverwendung entfernt und beim Folgeaufruf nicht zerstört.

Ohne verfügbaren Abschlusskanal wird **vor dem Start** mit `not_started`
abgewiesen. Es erfolgt kein stiller Wechsel vom möglicherweise entfernten
Terminal auf einen lokalen Prozess. Der vorhandene Background-Exec-Modus
bleibt ausdrücklich auswählbar. Beide VS-Code-Modi und ihr innerer Executor
verwenden dasselbe bestehende Stundenbudget; explizite kürzere Budgets gelten
weiter. Der neue echte Background-Rotlauf `sleep 40` scheitert am alten
30-Sekunden-Limit; danach bestehen alle fünf Laufzeiten sowie ein kurzer
Timeout mit erhaltener Ausgabe (6/6). Der erste Rotlauf nutzte versehentlich
den No-op-Testadapter und belegt keinen Prozessfehler; sein Protokoll bleibt
erhalten, der korrigierte Rotlauf heißt `p1-background-deadline-red-real`.

Zwei zusätzliche rote Tests belegen verlorene spät auslaufende Ausgabe und
einen fälschlich übernommenen D-Code. Eine 250ms-Auslaufgrenze startet nun erst
**nach** dem wirklichen Endereignis und beendet keinen laufenden Prozess.
Abgetrennte Ausgaben enden auch bei `unobserved_command` mit einem ausdrücklich
unbekannten Status statt mit Completed. Dieser neue Ereignisvertrag wurde
separat rot und grün getestet.

### Echte abschließende VS-Code-Messung

Private Test-Erweiterung und Profile, eigener Xvfb, keine Installation oder
Änderung produktiver Dienste/Benutzerprofile. Echter Terminal-Manager,
TerminalProcess und öffentlicher Foreground-Executor; Telemetrie, Clipboard
und fachfremde Speicherinitialisierung im Test isoliert. Prozessstart und
-ende stammen aus geschützten Messdateien des tatsächlich gestarteten
`/bin/sleep`-Kindes; API-Exitcodes werden unabhängig erfasst.
Der Folgeaufruf erfolgt nach 4,506s, während alle fünf Prozesse laufen.
Alle bleiben danach aktiv. Bei Werkzeugrückgabe sind alle beendet, API und
Shell-Wait bestätigen jeweils Code 0. Werkzeugzeit enthält Terminalstart.

| sleep s | Start Unix-ns | Ende Unix-ns | echte Laufzeit s | Werkzeugrückgabe nach s | API-Code | Folgeaufruf überlebt |
|---|---|---|---|---|---|---|
| 30 | 1793389589141534821 | 1793389619143878150 | 30.002343 | 31.678921 | 0 | ja |
| 40 | 1793389589155120068 | 1793389629157215653 | 40.002096 | 41.689871 | 0 | ja |
| 45 | 1793389589218062787 | 1793389634219487305 | 45.001425 | 46.749772 | 0 | ja |
| 60 | 1793389589190191446 | 1793389649197989571 | 60.007798 | 61.734609 | 0 | ja |
| 90 | 1793389589238794787 | 1793389679245230590 | 90.006436 | 91.780496 | 0 | ja |

Nachweis: `terminal-host-contract-final/measurement.json`;
`p1-terminal-host-contract-final` Exit 0. Zusätzlich 46/46 bestehende
Mocha-Terminal-/Managerprüfungen, 95/95 gezielte Adapterprüfungen,
138/138 Coreprüfungen mit 14 Windows-/PowerShell-Skips. Der zuvor ausgeführte
SDK-Gesamtbuild und die VS-Code-Typprüfung sind erfolgreich. Frühere
Host-Prüfversuche bleiben nachvollziehbar: zunächst falscher Default-Import im
privaten Transpile-Adapter; danach fehlte dessen realen Einzelprozess-Tests
der tatsächliche Start-Leseaufruf des Managers (44/46). Mit diesem Bestandteil
bestehen 46/46. Keine Fehlversuche wurden gelöscht oder als Erfolg gewertet.

Bei einem Prüfaufruf wurde irrtümlich das übergeordnete `build`-Skript statt
`build:sdk` gestartet. Es entfernte generierte dist-/node_modules-Verzeichnisse
im Reparatur-Worktree; danach scheiterte die Installation an der Sandbox.
Die Entwicklungsabhängigkeiten wurden mit unverändertem Lockfile,
`--ignore-scripts` und einer lokalen Kopie des vorhandenen Phase-3-Caches
wiederhergestellt; `build:sdk` besteht erneut. Git zeigt keine dadurch gelöschten
versionierten Dateien. Original-Arbeitsverzeichnis und produktive Installation
sind nicht Ziel dieses Skripts gewesen und wurden nicht verändert.

Ablageprüfung: Ergebnisse zuerst direkt im Chat, keine Bereinigung.
217343 Verzeichnisse / 1783987 Dateien über Metadaten; 15700 ausgewählte
Textdateien inhaltlich; 42 Git-Markierungen, 33 Statusabfragen erfolgreich.
Grenzen und ungeklärte Herkunft sind im Chat ausdrücklich benannt.
Keine Namen/Zeitstempel als KI-Beweis. Keine neue Sicherung angelegt.

Prüfmanifest: `SHA256SUMS.p1-terminal-observation`, SHA256 `b0e2f609c686e183c96b8076af236bf08d26e2a6de7d2d8d58179d00fb3c0451`.
Die weitere Core-Typprüfung wird mit ihrem tatsächlichen Ergebnis ergänzt.
Priorität 2–5 und die produktive Abnahme sind hiermit nicht als erledigt erklärt.

Ergänzung nach Prüfabschluss: `p1-core-observation-types` Exit 0. Das obige Manifest mit 82 Einträgen wurde mit `sha256sum -c --quiet` tatsächlich geprüft (Exit 0). Der auf den echten Executor umgestellte Testadapter wurde nach seiner Typkorrektur zusätzlich durch den kurzen Timeout-Fall geprüft. Priorität 1 ist mit den oben genannten begrenzten Prüfungen abgeschlossen; keine produktive Abnahme.


## Priorität 2 — Startfehler und Wiederholungsabbruch über Wiederaufnahme

Teilkorrektur, noch kein Abschluss der gesamten Priorität 2. Ein fehlgeschlagener
Runtime-Aufbau ließ die Sitzungszulassung gesperrt; ein Extension-Startfehler
trat vor dem Speichern des aktuellen Nutzerauftrags auf. Die äußere Run-Finally
bereinigt nun jeden Endpfad; der ursprüngliche Auftrag wird vor Extension-Setup
gespeichert. Bei einem Fehler beim Anhängeladen bleibt wenigstens der wörtliche
Nutzertext erhalten. Ein vor der Runtime-Erstellung angelegter RunHealth wird
bei einem Fehler freigegeben; keine unabhängige Überwachung wurde hinzugefügt.

`p2-startup-confirmed-red` prüft beide Fehler gegen eine per `git show` gelesene
Baseline aus `b052f263a`: 2/2 fehlgeschlagen. Der aktuelle Quellstand wurde für
diese Gegenprobe nicht zurückgesetzt. Vorherige Versuche sind keine gültigen
Rotbelege: der erste Extension-Test hatte ein ungültiges Manifest, zwei private
Baseline-Konfigurationen konnten ihre Workspace-Imports nicht auflösen. Diese
Protokolle bleiben erhalten; der validierte Gegenversuch nennt den tatsächlichen
Fehler. Nach Korrektur bestehen beide Fälle.

Zwei weitere rote Tests belegen den verlorenen Warteaufruf-Zähler bei
`initialMessages` und `restore()` (`p2-resumed-loop-red`: 2/2 fehlgeschlagen).
Wiederaufnahme spielt jetzt ausschließlich die gespeicherten `tool_use`-Einträge
in den vorhandenen Tracker ein. Es werden keine Werkzeuge ausgeführt, keine
Warnungen erfunden und keine Nebenablage angelegt. Eine echte neue Unterhaltung
über `run()` bzw. `clearHistory()` beginnt weiter mit einem leeren Zähler.

`p2-startup-and-loop-green`: 102/102 erfolgreich einschließlich echter
Runtime-Integrationsfälle. `p2-recovery-build` und `p2-recovery-types`: Exit 0.
Kontextkomprimierung und vollständige persistierte Fortsetzung werden im
nächsten Teil dieser Priorität geprüft. TOTAL RECALL/Agenten/Android wurden
noch nicht produktiv geprüft oder als fertig bezeichnet.


### Priorität 2 — Komprimierung und überprüfbare Auftragskontinuität

Drei rote Tests (`p2-compaction-continuity-red`) zeigen, dass eine allgemeine
Modellzusammenfassung Originalauftrag, Korrekturen, vorhandene Urheber-Metadaten
und unbestätigte Prozesszustände verlieren kann. Weitere echte Rotbelege:
`p2-basic-process-state-red` (ein verlorener Prozesszustand),
`p2-legacy-sidecar-red` (älterer zusammengefasster Wiedereinstieg ohne Original)
und `p2-injected-resumption-red` (synthetischer TASK-RESUMPTION-Hinweis wurde zum
Originalauftrag befördert). Diese sechs Fälle sind nach der Korrektur grün.

Die vorhandenen Komprimierungs-Metadaten tragen nun deterministisch erfasste
wörtliche Nutzertexte samt vorhandenen Quellen-/Urheberangaben und strukturierte
`run_commands`-Ergebnisse. Der ursprüngliche kanonische Verlauf bleibt die
Quelle. Modellzusammenfassung und belegte Einträge sind ausdrücklich getrennt.
Datei-/Bildinhalte werden nicht erneut in den Komprimierungstext kopiert; sie
bleiben im kanonischen Verlauf. Es wird keine neue Datenbank oder konkurrierende
Speicherarchitektur angelegt.

Beim Wiederverwenden eines Sidecars rekonstruiert die vorhandene PrepareTurn-
Grenze fehlende Angaben aus dem kanonischen Verlauf. Ein `task_continuity`-
Eintrag zählt mit `userRunSpan: 0` keinen zusätzlichen Nutzerlauf. Bereits
wörtlich vorhandene Aufträge und unverändert gerenderte Einträge werden nicht
verdoppelt; mehrere identische echte Nutzeraufträge behalten ihre Anzahl.
Wiederholte Vorbereitung erzeugt genau eine notwendige Projektion mit konstanter
Größe. Synthetische Fortsetzungshinweise werden über die bestehende
Nutzerlauf-Klassifikation ausgeschlossen. Übersteigt allein der notwendige
Zusatz das bekannte Modellbudget, wird mit erhaltenem kanonischen Verlauf
explizit abgebrochen statt Aufträge still zu kürzen. Dies ist keine Behauptung,
dass beliebig große vollständige Historien in jedes Modellfenster passen.

Die einfache Komprimierung erhält strukturierte Prozessangaben auch dann,
wenn verworfene Arbeit mangels Transport-IDs keinem bisherigen Zwischenbericht
zugeordnet werden konnte. `reportedSuccess` beschreibt den gespeicherten
Werkzeugbericht und behauptet keine aktuelle Prozessaktivität. Zustände und
Exitcodes werden nicht aus Modelltext oder verstrichener Zeit erfunden.

Abschließende gezielte Prüfung: `p2-continuity-accepted` 338/338 (Komprimierung,
Sidecar-JSON, Runtime, Wiederholungsschutz, Persistenz und importierte Sitzungen).
`p2-vscode-session-regression` 82/82, zusammen 420 unterschiedliche Prüfungen.
`p2-continuity-build-accepted` und `p2-continuity-types-accepted` Exit 0.
Frühere Zwischenläufe und fehlgeschlagene Erwartungen bleiben erhalten. Zwei
PrepareTurn- und vier Host-Vertragsprüfungen wurden ausdrücklich um den neuen
abgeleiteten Kontexteintrag ergänzt; eine künstliche 10-Token-Host-Grenze wurde
durch eine weiterhin überlaufende Historie mit realistischem Platz für die
Pflichtangaben ersetzt. Die Grenzenprüfung selbst ist separat abgedeckt.

Prüfmanifest `SHA256SUMS.p2-continuity`: 92 Einträge,
SHA256 `a816004f36cb0e3b5ab13272f92cc5672c6ea1fb40a2934c34ffd8c426844a6b`. Gezielte Priorität-2-Reparatur damit abgeschlossen.
Dies ersetzt keine Phase-5-Gesamtregression oder produktive Abnahme. TOTAL
RECALL und produktive gegenseitige Übernahme sind nicht durch diese Tests
als fertig belegt. Weiter mit Priorität 3, dann Acer-Schnittstellen und Android.
