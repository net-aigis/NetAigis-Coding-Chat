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


## Priorität 3 — geschützte Konfiguration, Outbox und tatsächlicher API-Vertrag

Status: geprüfte Teilkorrekturen; Priorität 3 und Phase 4 sind noch nicht
abgeschlossen. Echte Wiederherstellung einer laufenden Aufgabe, gegenseitige
Schreibübergabe und Android auf derselben Runtime sind weiterhin offene
Entwicklungs- und Abnahmeaufgaben. Ein gelesener Ereignisverlauf ist keine
Übernahme eines Prozesses.

Die Konfiguration verwendet den bestehenden geschützten file-backed
Secret-Store. Native VS-Code-Secrets werden einmalig ergänzt, ohne die alten
Werte zu löschen; vorhandene Dateiwerte gewinnen. Ein eigener Sentinel
verhindert das Wiederbeleben ausdrücklich gelöschter Recall-Konfiguration
auch bei der allgemeinen Migration. Recall-Token, Projekt und Akteur werden
nicht an Modell-API-Konfiguration oder generierte Proto-Secrets weitergereicht.
Die allgemeine Provider-Key-Liste und das Proto-Schema bleiben unverändert.
Beschädigte geschützte Dateien oder tatsächliche Schreibfehler werden nicht
als erfolgreich gespeicherte Konfiguration ausgegeben. Die Speicherklasse
verwendet dafür einen auf den Secret-Store begrenzten strikten Modus.

Die vorhandene Outbox erhält atomare 0600-Dateien, Datei- und Verzeichnis-sync,
stabile Ereignis-IDs, eindeutige lokale Reihenfolge auch bei identischen
Millisekunden und automatische begrenzte Wiederholungen nach Netzwerkfehlern.
Sie hält Akteur, Projekt und ursprüngliches Ziel fest. Ein anderer Akteur
überträgt ältere Ereignisse nicht mit seinem Token und schreibt deren
Urheberschaft nicht um. Alte Datensätze ohne Zielbindung bleiben ausdrücklich
liegen. HTTP 200 allein löscht keinen Datensatz: die Antwort muss die genaue
Ereignis-ID und ein boolesches `inserted` bestätigen; bestätigte identische
Duplikate mit `inserted: false` sind zulässig. Tokens stehen nicht in der Outbox.

Eine einzige Archivierungs-Subscription gehört nun zur VscodeSessionHost,
unabhängig von der Zahl der UI-Abonnenten. Core-Events werden in Reihenfolge
staged; Konfiguration und Ereignisinhalt werden für den jeweiligen Datensatz
festgehalten. Die Host-Session-ID hat Vorrang vor der unabhängig erzeugten
Agent-Conversation-ID. Bei Snapshot-Benachrichtigungen liest der Host den
vorhandenen kanonischen Verlauf ausdrücklich: Core sendet ihn absichtlich
nicht mit jeder Statusmeldung. Der letzte Zustand beim Dispose wird vor dem
Abmelden der Archivierung berücksichtigt. Der UI-Pfad wartet nicht auf das
Netzwerk. Keine neue Datenbank oder KI-Überwachungsarchitektur.

### Tatsächlich vorhandene Acer-Schnittstelle

Produktive Dateien wurden ausschließlich lesend per bestehendem SSH-Zugang
untersucht, ohne den SQLite-Store zu öffnen oder produktive HTTP-Schreibtests
auszuführen. `recall_api.py` bietet genau POST `/internal/recall/events`,
GET `/internal/recall/events` und GET `/internal/recall/conversations`.
Die beiden GETs benötigen `project_id`; Ereignisse außerdem `conversation_id`.
Conversations liefert `conversation_id`, `event_count`, `last_seq`, nicht die
vom bisherigen Client angenommenen Titel-/Owner-Felder. Autorisierte
Akteur-Token werden produktiv gegen `actor_id` geprüft; identische Event-IDs
sind idempotent, abweichender Inhalt oder Akteur führt zu 409.

Gelesene SHA256: produktives `recall_store.py`
`7885856b549d4b6b5cb3af51e6f27b95233db108a0e858c74486354085de960b`
(entspricht der lokalen Quelle), produktives `recall_api.py`
`76c17214d28422026ff98a461d44884d9330624765d6e878e16cccda2c070d3b`,
produktives `app.py`
`ca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201`.
Keine Geheimnisse werden als Nachweis abgelegt.

Der reparierte Leser nutzt diese tatsächlichen GET-Routen und den vorhandenen
Proxy-Fetch. Er prüft Reihenfolge und Projekt-/Session-Zugehörigkeit, erhält
sämtliche Originalereignisse mit ihrem `actor_id` und findet nur wirklich
archivierte kanonische Snapshots; deren Seq bleibt ausgewiesen. Er erfindet
weder Besitzer noch Leases oder einen erfolgreichen Takeover. Die zuvor
angenommenen `/snapshot`, `/takeover`, `/release`-Routen existieren produktiv
nicht. Bis eine verifizierte Koordination angeschlossen ist, liefern die
Takeover-/Release-Methoden ausdrücklich keinen Erfolg. Auch ein fehlender
Lock-Status wird nicht als freier Lock ausgegeben.

Der Browser besitzt jetzt tatsächlich HTML und Nachrichtenempfang im
Standalone-Panel; vorhandene Befehle sind in der Palette registriert. Listen,
Verlauf lesen und explizite Konfiguration sind angeschlossen. Skript und
Empfänger verwenden dieselben Nachrichtennamen; dynamische Inhalte werden
nur über textContent eingesetzt, mit CSP/Nonce. Gleichlautende Titel ändern
die ausgewählte Session-ID nicht. Der Token wird maskiert abgefragt, ein
Abbruch speichert keine Teilkonfiguration. Ein geladener Verlauf wird nicht
mehr fälschlich als wiederhergestellte laufende Sitzung gemeldet.

### Gezielte Nachweise und verbleibende Integration

Rote Regressionen: Konfiguration 0/3; strikter Speicher 0/2; Outbox zunächst
2/6; Archivierungszuständigkeit 0/2; fehlende exakte Serverbestätigung 0/1;
fehlender kanonischer Snapshot-Verlauf 0/1; tatsächlicher API-Vertrag 0/4.
Die Fehlversuche und anschließenden Gegenproben bleiben in den Prüfartefakten.
Ein Zwischenlauf des API-Tests verwendete nach Umstellung auf Proxy-Fetch den
falschen Mock-Lebenszyklus; dieser Lauf ist kein Nachweis eines Serverfehlers.
Typfehler der neuen Test-Mocks wurden korrigiert. Keine echten Zugangsdaten
wurden für diese Tests verwendet.

`p3-recall-network-contract-accepted`: 57/57 bestanden, einschließlich fünf
bestehender echter Loopback-/Proxy-Tests. Deren vorangegangener Sandbox-Lauf
scheiterte an `listen EPERM`; derselbe Testbestand besteht außerhalb der
Sandbox. Dazu `p3-recall-state-isolation-accepted`: Bun 2/2 bestanden.
Damit 59 unterschiedliche gezielte Tests, keine übersprungenen Fälle im
abschließenden Netzwerk-Vertragslauf. `p3-recall-types-verified`: Exit 0.
Das Proto-Generierungsskript lief erfolgreich und erzeugte keine Schemaänderung.

Der SDK-Hub besitzt bereits Attach-/Participant- und Capability-Owner-Code;
das ist keine produktiv bestätigte Friseer/jimmi-Schreibübergabe. Der bisherige
VS-Code-Host verwendet weiterhin `backendMode: local`. Vor einer schreibenden
Wiederaufnahme sind die vorhandene gemeinsame Runtime, authentifizierte
Akteurzuordnung, kontrollierte Schreibzuständigkeit, unveränderlicher Verlauf,
aktuelle Werkzeugzustände und vollständige Wiederaufnahme zusammenzuführen
und durch echte Übergabetests zu belegen. Kein Raten neuer produktiver
Endpunkte, kein automatischer Wechsel zu Cloud oder anderer Modellkonfiguration.
Priorität 4/5 werden nicht als erledigt ausgegeben. Ein externer Watchdog
bleibt eine getrennte Acer-Infrastrukturaufgabe. Keine produktive Installation.


Ergänzende Prüfabschlüsse: `p3-recall-final-types` Exit 0 und
`p3-recall-bundle` Exit 0 (nur Erweiterungs-Bundle im Reparatur-Worktree).
Die spätere VSIX-/Produktivabnahme wird daraus nicht abgeleitet.
Die relevanten Hook-Prüfungen wurden gezielt ohne automatisches Stash/Reset
von lint-staged durchgeführt: Proto-Generator, explizite Biome-Prüfung und
redigierter Gitleaks-Scan je Commit. Die Commits verwenden deshalb nur für
jeweils diesen Aufruf `HUSKY=0`; die Repository-Hook-Konfiguration bleibt unverändert.
Konfigurationskorrektur: `cd79bd25e`; Outbox/kanonische Archivierung: `293f7a8f9`.

Die zusätzlich begrenzte lesende Acer-Discovery ergibt unter dem vorhandenen
SSH-Benutzer: System-Unit `netaigis-coding-agent.service`; keine einschlägige
User-Unit und kein Standard-Discovery-Verzeichnis
`~/.cline/data/locks/hub/owners`. Andere Benutzer, Root und abweichende
Konfigurationspfade sind damit **nicht** ausgeschlossen. Der vorhandene
Runtime-/Übergabezugang wurde deshalb als fehlende Information angefragt;
kein neuer produktiver Endpunkt wurde angenommen oder angelegt.
Nachweis ohne Tokens: `metadata/p3-runtime-discovery-readonly.json`.

### Ablageprüfung — Einordnung der im Chat bereits ausgegebenen Funde

Die Prüfung war ausschließlich lesend. Die nachfolgenden Angaben halten den
bereits ausgegebenen Befund fest; sie sind keine Bereinigungsfreigabe.
Die vor der Ablageprüfung erfolgte Korrektur des anfänglichen Phase-4-Prüfpfads
ist separat dokumentiert. Während der Ablageprüfung selbst wurden keine
Dateien angelegt, verschoben oder gelöscht und keine neuen Sicherungen erzeugt.

| Klasse | Pfad bzw. zusammengehörige Gruppe | Zweck und Herkunftsnachweis | Vorgesehene Ablage / Folgerung |
|---|---|---|---|
| Korrekt | `MyContainer/backups/cline-phase2-20261030T173159+0100` | Beauftragte Sicherungen und Restore-Proben; Manifeste, Checksummen und Prüfprotokolle aus Phase 2 | Geschützte Sicherungsablage beibehalten |
| Korrekt | Reparatur-Worktree `tmp/phase4-checks-20261030T193507+0100` | Eigene Messungen, Logs und Fixtures; aktuelle Werkzeugaufrufe und Prüfmetadaten belegen Herkunft | Projektlokale ignorierte Prüfablage beibehalten |
| Korrekt | `MyDevelop/cursor/DS-scripts` | Projekt-Skripte; Codex-JSONL belegt 30 erfolgreiche Patch-Aufrufe vom 23.06.; damit Änderungen, nicht pauschal ursprüngliche Dateierstellung belegt | Zugehöriges Projekt; kein Verschieben |
| Korrekt | `.codex/sessions` und `.codex/shell_snapshots`, zugehörige DBs; Cursor-/VS-Code-Zustände und Transkripte | Von Anwendungen verwaltete Arbeitsdaten; Pfadstruktur, Dateiformat und Protokollverweise | Anwendungsablage beibehalten |
| Nachweislich falsch | Aktuell kein weiterer Fund mit belegter allgemeiner Ablageregel | Der anfängliche `.phase4-checks-…`-Pfad unter MyGIT war vor der Prüfung bereits korrigiert | Keine allein aus Namen abgeleiteten Verschiebeaktionen |
| Temporär, möglicherweise entbehrlich | In beiden Cline-Verzeichnissen: `apps/vscode/src/sdk/vscode-session-host.ts.pre-recall-phase3b`; `sdk/packages/agents/src/agent-runtime.ts.bak-before-netaigis-options`, `agent-runtime.ts.bak-before-netaigis-session`; `sdk/packages/llms/src/providers/ai-sdk.ts.bak-before-netaigis-header`; `sdk/packages/llms/src/providers/vendors/openai-compatible.ts.bak-before-netaigis-header` | Vorhandene Vorherkopien, schon in Phase-2-Manifesten; KI-Urheberschaft nicht pauschal belegt | Nach gesonderter Freigabe geschütztes Projektarchiv; Originale jetzt beibehalten |
| Temporär, möglicherweise entbehrlich | Je Cline-Verzeichnis: `tmp_idx_hits.txt`, `tmp_ls.txt`, `tmp_p1_all.txt`, `tmp_p1_fetch.txt`, `tmp_test_run1.log`, `tmp_test_run2.log`, `tmp_vitest_configs.txt` | Such-/Testreste mit lesbarem fachlichem Bezug; vorbestehend und gesichert, Urheber nicht sicher bestimmt | Projektlokale temporäre Ablage oder Archiv erst nach Freigabe |
| Temporär, möglicherweise entbehrlich | `MyGIT/coding-agent/server/app.py.pre-recall-phase3` | Vorherkopie des Servers, bereits gesichert; KI-Herkunft nicht sicher bewiesen | Geschütztes Coding-Agent-Projektarchiv, keine jetzige Änderung |
| Temporär, möglicherweise entbehrlich | `MyGIT/fwbuilder-538-reconcile-RmhLWOuj/isolated-repository` | Report belegt isolierten Dry-run; 1020 Git-Einträge, darunter 103 UU/49 UD; Hauptprojekt sauber | Projektbezogene Prüf-/Archivablage nach Freigabe; Konflikte nicht bereinigen |
| Temporär, möglicherweise entbehrlich | `MyGIT/fwbuilder-obs-public-s5rst0rr`, `MyGIT/fwbuilder-obs-review` | Öffentliche OBS-GET-Nachweise bzw. leeres Review-Verzeichnis; Berichte/Hashes belegen Zweck, nicht KI-Urheber | Projektbezogene Prüf-/Archivablage nach Freigabe |
| Herkunft/Zweck ungeklärt | `MyGIT/stray-files-20261015/--exit-status`, `MyGIT/stray-files-20261015/-R` | Leere Dateien; Erzeugungsursache aus Inhalt nicht feststellbar | Bis Klärung unverändert |
| Ablagebewertung ungeklärt | `MyContainer/cline-phase3-checks-20261030T183655+0100` | Eigene Codex-Prüfnachweise belegt; eine allgemeine Regel gegen diesen Ablageort ist nicht belegt | Projektbezogenes Nachweisarchiv möglich; kein eigenmächtiges Verschieben |
| Herkunft ungeklärt | `MyGIT/fwbuilder-fork-audit.py`, zugehöriges Audit-Verzeichnis und `bootstrap-private.sh` | Zweck aus Code/Report belegbar, KI-Herkunft nicht sicher bewiesen | Fwbuilder-Projekt zuordnen; keine Änderung |
| Herkunft bzw. Zielablage ungeklärt | `MyGIT/patches` (256 Einträge, darunter 74 Patches, 58 Shell-Skripte, 64 ZIP, 42 GZ, 13 Verzeichnisse, 3 Python, 1 VSIX, 1 TXT); 37 zugehörige Archive in Downloads | Inhalte betreffen Recall-Phasen, Coding-Agent-Adapter und weitere Projekte; ältere Outbox-Versionen sind keine identischen aktuellen Duplikate | Einzelnen Projekten zuordnen, keine pauschale Löschung oder KI-Zuordnung |
| Herkunft/Zielablage ungeklärt | `acer-kernel-head/{pxe73,extracted,cache}`, `keepass-pr-submission-20261014/xc`, `chatgpt/chat_export_to_md.py`, `my_newscript*.txt`, `script1.txt`, `script2.txt`, zugehörige Dokumente unter Dokumente | Fachlicher Bezug teils lesbar; KI-Erstellung nicht sicher bewiesen. KeePass-Clone sauber. `NetAigis_01.html` ist eine Google-Suchseite, kein belegter Chat-Export | Projektzuordnung bzw. Benutzerrückfrage vor jeder Bereinigung |
| Keine KI-Zuordnung | Schmutzige andere Repositories: NetAigis, NetAigis-html, chaos/go-syncml, local/ipfire-2.x, local/stayplugged; Trash, Container-Layer, Plugin-Caches | Git-Status alleine beweist keine KI-Herkunft. Bundle-Restore-Proben mit `--no-checkout` zeigen erwartbar viele D; Roh-Restores entsprechen dem gesicherten Original | Fremde Projekte und Anwendungen unverändert lassen |

Abdeckung: Metadaten aller erreichbaren Unterverzeichnisse unter `/home/friseer`,
auch versteckte; keine Verfolgung von Symlinks. 15700 ausgewählte Textdateien
(~561 MB) inhaltlich geprüft; 42 größere Textkandidaten und 118 Binärkandidaten
nicht mit derselben Inhaltssuche geprüft. Aktuelles größeres Codex-Protokoll
separat strukturiert ausgewertet. Archive selektiv über Inhalte/Memberlisten,
nicht vollständig entpackt. Schlüssel-, Mail-, Browser-, Container- und
Trash-Bereiche überwiegend nur über Metadaten. Unzugänglich blieben bestimmte
Container-Overlay-Verzeichnisse `work/work`, apt-Partial-Verzeichnisse und
`diff/home/ubuntu`; außerhalb `/home/friseer` fand keine systemweite Vollprüfung
statt. Vier geschützte/leer angelegte Root-.git-Markierungen und fünf
Container-Git-Verweise ergaben keine normale Repository-Statusabfrage.
Diese Grenzen schließen eine Aussage wie „alle Dateien inhaltlich geprüft“ aus.
Keine Bereinigung ist freigegeben oder erfolgt.


## Fortsetzung 31.10.2026 — gemeinsame Runtime und offene Fork-Identität

Auf Benutzerbestätigung ist kein produktiver Session-Hub nachgewiesen.
Die fehlende Bestandsinstallation ist keine Voraussetzung, erneut nach
einem vorhandenen Endpunkt zu fragen: die noch fehlende Implementierung
wird am vorhandenen Hub-/Browser-Code entwickelt. Port 11436 bleibt der
Coding-Agent; kein produktiver Endpunkt, Prozess oder Datenpfad wurde
umgedeutet, angelegt, umkonfiguriert oder neu gestartet. Andere Projekte
wurden in dieser Fortsetzung nicht untersucht. Die Nachweise liegen weiter
im bereits vorhandenen projektlokalen Phase-4-Prüfverzeichnis.

### Verbindliche eigene Produktidentität

[Eigener Pflichtauftrag und Kompatibilitätsanalyse](fork-identitaet.md)
stehen nun ausdrücklich im Arbeitsstand und in AGENTS.md. Die Original-ID
ist noch aktiv im Quellmanifest; weder der frühere Vorschlag noch eine neue
Identität wurden eigenmächtig freigegeben. Forgejo-Repository-Metadaten,
getrennte Upstream-/Fork-Release-Metadaten und der getestete Prepublish-
Schutz verhindern versehentliches Paketieren des Originalprodukts über den
vorgesehenen Einstieg. Finale Benennung, eigenes Versionsschema, praktische
Migration, eigene Releases/VSIX und produktive Abnahme bleiben offen.

### Implementierte gemeinsame Transportanbindung

`VscodeSessionHost` akzeptiert eine ausdrücklich konfigurierte bestehende
SDK-Hub-Verbindung. Sie wird im vorhandenen geschützten Secret-Store gehalten,
außerhalb Modellkonfiguration und Proto-Secrets. Eine fehlende Auswahl erhält
den bisherigen lokalen Modus; eine ungültige gespeicherte Auswahl oder ein
Verbindungsfehler erstellt keinen lokalen Ersatz-Chat. Die Provider- und
Modellkonfiguration und die bestehenden Werkzeugfreigabe-Callbacks bleiben
erhalten. Der Test der Secret-Isolation prüft auch den neuen Hub-Schlüssel.
Es wurden noch keine produktiven Verbindungseinstellungen geschrieben.

Der Browser-Server kann denselben Hub ausdrücklich über
`CLINE_SHARED_SESSION_HUB_ENDPOINT` und `CLINE_SHARED_SESSION_HUB_TOKEN`
verwenden. Beide Werte sind reine Konfigurationsschnittstellen ohne
vorgegebenen produktiven Wert; Tokens stehen nicht in URLs oder öffentlicher
Browser-Konfiguration. In diesem Modus startet er keinen zusätzlichen Hub,
fällt bei Fehlern nicht auf einen anderen zurück und darf den separat
verwalteten Hub nicht per Browser-Button neu starten. Das verhindert zwei
unabhängige Session-Runtimes bei ausdrücklich gemeinsamer Auswahl. Die
bisherigen Standardpfade bleiben ohne Auswahl erhalten.

### Tatsächlicher Live-Verlauf und sichere Browser-Auswahl

Ein nachgewiesener Fehler im bisherigen Hub-Pfad: Core.readLiveMessages fiel
über den Hub auf gespeicherte Nachrichten zurück. Der bestehende Command
`session.messages` unterstützt deshalb ergänzend `live: true` und bestätigt
`view: live` mit passender Session-ID. Der Handler liest dann die bereits
vorhandene kanonische Runtime-Konversation. Ein Host ohne Live-Lesefunktion
wird ausdrücklich abgewiesen; der neue Client verweigert auch eine alte
Hub-Antwort, die den Wunsch ignoriert. Der bisherige Aufruf ohne `live` bleibt
als gespeicherter Verlauf unverändert. Keine zweite Chat-Datenbank.

Vor dem Lesen wird der bestehende Event-Stream abonniert, damit auch nach
Hydrierung neue Zustände derselben Sitzung ankommen. Das startet/ersetzt
keine Sitzung und übernimmt nicht die Identität des Tool-Capability-Owners.
Der Browser prüft die existierende Sitzung, liest den aktuellen Verlauf und
ändert seine Auswahl erst nach Erfolg. Lesefehler werden nicht mehr als
leerer erfolgreicher Verlauf ausgegeben. Langsamere alte Auswahlvorgänge
überschreiben keine neueren; Clear und Verbindungsabbau verwerfen ausstehende
Hydrierungen. Die bestehende UI führt während Hydrierung eintreffende Live-
Updates mit dem Verlauf zusammen.

### Ausgeführte Tests und genaue Grenzen

Rote Regressionen vor den jeweiligen Patches: VS-Code-Runtime-Auswahl 0/2;
Live-Hub-Vertrag vier fehlgeschlagene neue Fälle (ein Kontrollfall bestanden);
Browser-Hydrierung 0/3; Clear während Hydrierung 0/1; gemeinsame
Browser-Endpunktauswahl und Lebenszyklus 0/7. Alle Logs bleiben erhalten.

- `p3-live-core-accepted`: 53/53 bestanden. Darunter ein Test mit zwei echten
  authentifizierten Loopback-WebSocket-Verbindungen, echtem Hub-Server und
  einer ausdrücklich simulierten ausführenden Runtime. Beide Clients lesen
  dieselbe bestehende ID und denselben aktuellen Verlauf mit unveränderten
  Autorenmetadaten/unbekannter Werkzeugbeobachtung und erhalten Statusereignisse.
  Nach bestätigtem Close des ersten Clients bleibt die andere Verbindung
  lesbar; kein Start/Stop/Abort einer Ersatzsitzung. Kein produktives Modell.
- `p3-live-browser-endpoint-green`: 23/23 bestanden, einschließlich
  Endpunktauswahl, fehlender Ersatz-Runtime, Neustartverweigerung für externe
  Runtime, Hydrierung, Clear und bestehender Nachrichten-/Event-Projektion.
- `p3-live-vscode-config`: 35/35 bestanden; `p3-live-credential-isolation`:
  Bun 2/2 bestanden.
- `p4-fork-release-policy-direct`: 9/9 bestanden. Der aktuelle tatsächliche
  Prepublish-Guard ist bewusst noch gesperrt, kein fehlgeschlagener Build.

Damit 122 unterschiedliche gezielte Tests. Die Vorherläufe und Zwischenfehler
werden nicht als zusätzliche Erfolge mitgezählt. Der erste Socket-Test
verweigerte noch jede gespeicherte Verlaufsladung im ganzen Server; die
unabhängige Suchindexierung liest sie berechtigterweise. Der korrigierte Test
prüft die drei tatsächlich bestätigten Live-Antworten der Clients. Zwei
Typfehler der neuen Socket-Fixture wurden korrigiert. SDK-Build sowie Core-,
Browser-Server- und VS-Code-Typprüfung bestanden. Die Proto-Generierung
erzeugte keine Schemaänderung für den privaten Hub-Schlüssel.

### Verbindlich offen, kein Phase-4-Abschluss

1. Authentifizierte Akteurzuordnung und kontrollierte Schreibübergabe
   Friseer/jimmi an der gemeinsamen Runtime. Ein gemeinsamer Hub-Token bzw.
   lesender Teilnehmerstatus ist noch keine Akteur- oder Writer-Autorisierung.
2. Sichere Wiederaufnahme/Anbindung bereits bestehender lokaler Sitzungen
   an diese Runtime, mit korrektem Werkzeugzustand, ohne Start eines zweiten
   unabhängigen Verlaufs, ohne Verlust alter lokaler History und ohne
   Umdeutung unbekannter Prozesse. Zuständigkeit aller Datei-/Terminal-
   Capabilities am tatsächlichen Workspace-Host nachweisen.
3. Durchgehende Recall-Archivierung und Retry/Provenienz beim Wechsel von
   Clients und Akteuren mit bestätigter Session-ID testen. Keine Besitz-
   oder Wiederherstellungserfolge aus einem gelesenen Archiv ableiten.
4. Danach die noch offenen Coding-/Learning-Agent-Verträge, vollständige
   Regression und Android Ende-zu-Ende mit der eigenen produktiven
   Modell-/Dienstkombination abnehmen. Der Transport-Fixture-Test ersetzt
   weder eine reale Android-Prüfung noch die produktive 125B-Abnahme.
5. Eigene Identitätsmigration/Versionierung entsprechend gesonderter
   Namensentscheidung und anschließend die bereits beauftragte Phase 6
   (Sicherung/Rückfall/produktive Installation nach Abnahme).

Kein neuer Watchdog in Cline. Unabhängige Überwachung bleibt der getrennte
Acer-Infrastrukturauftrag. Keine Installation, keine produktive Dienständerung.

Die Identitäts-/Release-Schutzkorrektur ist in `8b85d65e1` getrennt committed.
Die Veröffentlichungssperre ist ein konkreter Schutz des noch offenen
Benutzerauftrags, keine eigenmächtige Wahl von Publisher, Produktname oder
Fork-Version. Der spätere Phase-6-Installationsauftrag bleibt erhalten; es
wird keine zusätzliche Installationsfreigabe über die bereits vereinbarten
Abnahme-/Rückfallbedingungen hinaus erfunden.

Für die gemeinsamen Transport-Einstellungen sind außerdem vor produktiver
Nutzung noch die Bedienung/Konfiguration beim Wechsel einer bereits offenen
Extension und die Zuordnung lokaler gegenüber gemeinsamer Session-History
zu vervollständigen. Die bisherige lokale Sitzung wird nicht automatisch
auf eine entfernte Runtime verschoben. Die getrennte Actor-/Writer-Aufgabe
ist durch ein erfolgreiches Beobachter-Attach ausdrücklich nicht erledigt.


## Fortsetzung 31.10.2026 — authentifizierte Schreibzuständigkeit

Auftrag unverändert ab `9477c5cef`; `8b85d65e1` und die 122 bereits belegten
Tests bleiben Grundlage. Keine erneute Bestandsaufnahme/Sicherung, keine
fremden Projekte, keine Installation oder produktive Dienständerung.

### Implementierte Runtime-Grenze

Der bestehende SDK-Hub unterstützt nun getrennte, serverseitig zugeordnete
Akteur-Tokens. Ein übermittelter Name ist keine Authentifizierung. Die
Daemon-Konfiguration kann einen ausdrücklich gewählten privaten Dateipfad
`CLINE_HUB_ACTOR_TOKENS_FILE` lesen; keine Zugangsdaten oder produktiven
Pfade wurden erzeugt oder gespeichert. Datei muss regulär, ohne Symlink,
im Eigentum des Prozessbenutzers und ohne Gruppen-/Fremdzugriff sein.
Ohne Auswahl bleibt das vorhandene lokale Verhalten erhalten. Bei aktivem
Akteur-Modus ist der bestehende Discovery-/Master-Token nur Beobachter.

Schreibzuständigkeit wird im vorhandenen Session-Metadatensatz gehalten,
keine neue Datenbank: Version, Revision, Actor, Client, Verbindung und
letzte Änderung. Get/Claim/Release verwenden die erwartete Revision.
Schreibbefehle benötigen Actor, Client, tatsächliche Verbindung und Revision.
Gleichzeitige Übergaben werden serialisiert; schon zugelassene Arbeit wird
vor der ersten Runtime-Statusänderung gesperrt. Übergaben bei aktiver Arbeit,
wartenden Eingaben, offenen Tool-Calls, unbekannter Beobachtung oder nicht
bestätigtem Abbruch/Timeout werden verweigert. Ein fehlender Exitcode wird
nicht ergänzt. Alte explizit ungeklärte Beobachtungen werden nicht allein
durch einen späteren Idle-Status gelöscht; ihre echte Klärung bleibt nötig.

Ein Socket-Abbau gibt kein Schreibrecht frei. Wiederverbindung mit gleicher
Client-ID benötigt eine ausdrückliche sichere Übernahme. Der ursprüngliche
Ausführungs-/Capability-Owner bleibt erhalten; fremde Akteure dürfen dessen
Werkzeugbeobachtungen oder Freigaben nicht vortäuschen. Geschützte Metadaten
können durch normale Session-Updates nicht ersetzt werden. Nicht abgedeckte
schreibende Akteur-Kommandos werden ausdrücklich abgewiesen.

Der echte WebSocket-Test deckte eine fehlende Weitergabe der beim Upgrade
ermittelten Actor-Autorität an die erste Registrierung auf. Korrigiert:
Registrierungsprüfung vor Annahme der ID, Schutz gegen fremde bzw. gleichzeitig
verbundene Ausführungs-IDs, serialisierte Registrierung und Cleanup bei erst
nach Socket-Abbau fertig werdender Anmeldung. Akteur-Modus-Subscriptions
benötigen die eigene registrierte Client-ID. Unregistrierte Gegenstellen
dürfen fremde Clients nicht abmelden.

Urheberschaft stammt aus der serverseitigen Befehlsannahme außerhalb
clientseitig fälschbarer JSON-Felder. Der vorhandene Pfad über RuntimeHost,
Pending Queue, Steer und SessionRuntime erhält sie in kanonischen Nachrichten.
Alte Einträge werden nicht umetikettiert; alte Einträge ohne authentifizierten
Nachweis erhalten keinen erfundenen Autor. Gleicher Text verschiedener
bestätigter Requests wird nicht über Akteure hinweg zusammengefasst.
Run-/Übergabebefehle werden nach unklarer Zustellung nicht automatisch erneut
ausgeführt. Eine falsche/unvollständige Control-Antwort erzeugt keinen freien
Besitzerzustand. Metadatenänderungen einer noch leeren/lazy Sitzung werden
vor Bestätigung im vorhandenen Sitzungsspeicher materialisiert.

### Tatsächliche Prüfungen und ihre Grenzen

- `p3-writer-transport-authenticated`: 73/73 bestanden. Darunter tatsächlicher
  lokaler Hub-Server, echte WebSockets und NodeHubClient: getrennte Credentials,
  Friseer → jimmi → Friseer unter gleicher ID/Historie, unveränderte alte Autoren,
  Payload-Fälschung, verweigerte Übergabe während Arbeit, alte Schreibrechte,
  Wiederverbindung sowie fremde Ausführungs-ID. Ausführende Runtime simuliert.
- `p3-writer-host-continuity`: 249/249 bestanden. Davon 101 LocalRuntimeHost-
  Tests werden durch den neueren Lauf `p3-writer-lazy-persistence` mit 102/102
  ersetzt: neuer echter Dateispeichertest für zunächst scheiternde Speicherung,
  anschließenden Erfolg und Lesen derselben Metadaten durch einen frischen Host.
- `p3-writer-agent-provenance`: 153/153 bestanden, einschließlich zusätzlichem
  Steer-Fall mit Metadaten und Schutz gegen nachträgliche Mutation des Inputs.
- Damit 476 unterschiedliche gezielte Tests einschließlich betroffener
  Bestandstests, nicht 476 neue Tests. Zwischenläufe werden nicht addiert.
  Der erste Transportlauf hatte 314/315 Erfolge; seine echte fehlgeschlagene
  Fremd-ID-Registrierung war Anlass der oben beschriebenen Korrektur.
- SDK-Build erfolgreich; nach der letzten Persistenzkorrektur Core erneut
  erfolgreich gebaut. Core-Typprüfung und Browser-Server-Typprüfung erfolgreich.
  Neue Test-Typfehler (Promise.withResolvers/Fixture-Typen) wurden korrigiert.
  Ein Bun-Script-Typprüfungslauf versuchte zusätzlich die lokale Shell-Initialisierung;
  die maßgeblichen späteren Compilerläufe verwenden direkt Node/tsc.

### Lesender Acer-Nachweis, keine Abnahmebehauptung

Am bestehenden SSH-Ziel ist `netaigis-coding-agent.service` weiterhin
`active/running`, Benutzer `ollama`, mit denselben drei Recall-/Router-Drop-ins.
GET `127.0.0.1:11436/health` auf Acer antwortete HTTP 200 mit `status: ok`,
`model: coding`. Das belegt Erreichbarkeit, keinen 125B-Modelllauf.
Der tatsächliche Code registriert `/v1/{path:path}` und den bestehenden
Recall-Router. Der öffentliche Health-Wert `learning_agent` ist eine
Zeichenkette, kein nachgewiesener HTTP-Endpunkt. Unter geladenen System- und
Benutzerdiensten wurde kein separat benannter Learning-Agent identifiziert.
Die konkrete Dienst-/Pfadangabe wurde erfragt; keine Identität oder Route
wird daraus erfunden. Keine produktiven Dateien/Berechtigungen geändert,
keine Dienste gestartet oder neu gestartet.

### Verbindliche Restarbeit

Diese Korrektur beendet weder Phase 4 noch den Gesamtauftrag. Noch nötig:
Browser-/VS-Code-Bedienung der getrennten Akteur-Verbindungen und Übergabe;
verlustfreie Einbindung alter lokaler/Legacy-Sitzungen inklusive tatsächlicher
Prozess-/Checkpoint-Zustände; Recall-Archivierung/Wiederaufnahme über wechselnde
Clients; belegte Integration beider Acer-Dienste; danach reale VS-Code-/Android-
und 125B-Funktionstests. Ein Fixture ist keine produktive Abnahme.
Die eigene Extension-Identität und eigene Versionierung bleiben offen;
die gesonderte Namens-/Versionsentscheidung wurde konkret erfragt. Kein
Publisher/Name/Version wurde eigenmächtig festgelegt. Der getrennte externe
Watchdog bleibt auf Acer außerhalb Cline.

Nachweise ausschließlich im bereits bestehenden geschützten projektlokalen
Phase-4-Prüfverzeichnis `tmp/phase4-checks-20261030T193507+0100`; keine neuen
Sicherungsablagen. Die weiterhin vorhandenen alten unversionierten Artefakte
wurden weder gelöscht noch in diese Korrektur aufgenommen.

Die abschließende direkte VS-Code-Typprüfung war ebenfalls erfolgreich
(`p3-writer-vscode-types`, Exit 0). Biome für 34 betroffene TypeScript-Dateien
und `git diff --check` bestanden. Die Pre-Commit-Prüfungen werden explizit
vor dem Commit ausgeführt; `HUSKY=0` gilt nur für den einzelnen Commit,
um den bereits untersagten automatischen lint-staged-Stash/Reset zu vermeiden.


## Fortsetzung — persönliche Browser-Akteure und aktuelle Acer-Prüfung

Auf `5c15e5857` aufbauend: persönliche Browserverbindungen erhalten jeweils
einen eigenen remote Core-Client. Die vom Server bestätigte Actor-ID kommt
aus der Registrierungsantwort, nicht aus Namen oder Browser-Payload. Der
Dashboard-Zugang wird für persönliche Schreibbefehle nicht als Ersatz benutzt.
Anmelden, Writer-Zustand lesen, ausdrücklich übernehmen/freigeben sind in der
vorhandenen Browseroberfläche ergänzt. Credentials bleiben im Speicher der
Verbindung und werden nicht in URLs oder persistiertem UI-Zustand abgelegt.
Nach Verbindungstrennung muss die Person sich wieder authentifizieren.

Schreiben erfolgt in der bestehenden ausgewählten Session-ID; der gemeinsame
Browser erzeugt keinen Ersatz-Chat. Mutierende globale Dashboard-Kommandos,
Modell-/Provider-Änderungen und Dienstaktionen sind im ausdrücklich gewählten
Shared-Modus gesperrt. Die lokale bisherige Betriebsart bleibt erhalten.
Beobachtende Clients dürfen keine fremden Freigaben beantworten. Entscheidungen
werden dem aktuellen Writer zugeordnet und vor einer Antwort gegen den
wirklichen Pending-Approval der Sitzung geprüft. Tatsächliche Tool-Beobachtungen
bleiben dagegen beim ursprünglichen Ausführungsakteur. Der Host beachtet das
serverseitige Freigabeziel, statt bei anderen Teilnehmern ebenfalls zu fragen.

Der Actor-Modus verweigert nun auch den früheren anonymen Localhost-Origin-
Sonderzugang. Credentials benötigen HTTPS zum Browser und verschlüsselten oder
Loopback-Transport zum Hub. Der bestehende Browser-Server unterstützt dafür
optional ausdrücklich gewählte vorhandene Zertifikat-/Schlüsseldateien
(`CLINE_HUB_DASHBOARD_TLS_CERT_FILE` / `_TLS_KEY_FILE`). Keine Zertifikate,
Keys, produktiven Pfade oder Dienste erzeugt. Der private Schlüssel muss eine
reguläre, eigene Datei ohne Gruppen-/Fremdrechte sein; kein chmod im Produkt.
Fehler beim Listenerstart geben die zuvor geöffneten Verbindungen wieder frei.

Belegte Prüfungen:
- 55/55 gezielte Browser-/TLS-/Kompatibilitätsprüfungen bestanden.
- 98/98 Core-Prüfungen einschließlich Writer-Freigaben bestanden.
- Ein zusätzlicher Test mit **echtem Bun-Dashboard als Kindprozess**, echtem
  SDK-Hub und browserkompatiblem WebSocket bestand. Schreiben ohne persönlichen
  Login wurde verweigert, jimmi übernahm die bestehende ID mit ursprünglicher
  Historie, der alte Writer wurde abgewiesen, und Browser-Abbruch während der
  laufenden Fixture-Arbeit stoppte/abortierte diese nicht. Nach tatsächlichem
  Ende konnte Friseer ausdrücklich übernehmen. Keine produktive Modellausführung.
- Ergänzte tatsächliche Origin-Sperre am realen Hub bestanden; dieser Lauf
  ersetzt denselben Socket-Test und wird nicht zusätzlich gezählt.
- Core-Build, Core-/Browser-Server-/Webview-Typprüfungen und Vite-Webview-Build
  erfolgreich. Erste Prüffehler waren zwei unbenutzte Testimporte, ein im
  App-Paket nicht direkt verfügbares `ws` und ein falscher Root-Vite-Pfad.
  Korrigiert mit vorhandenem nativen Node-WebSocket und Paket-Vite; keine
  neue Abhängigkeit installiert. Vorläufe bleiben erhalten.

Damit 154 unterschiedliche gezielte Tests in diesem zweiten Schritt,
einschließlich erneut betroffener Bestandstests; nicht 154 neue Tests und
keine Addition der wiederholten Läufe. Ein physisches Android-Gerät, reale
VS-Code-Bedienung, echte 125B-Ausführung, durchgehende Recall-Wiederaufnahme
und der alte Datenbestand sind damit noch nicht produktiv abgenommen.

Die Benutzerauskunft zum Learning-Agent wurde gezielt geprüft:
`ai-agent.service` ist aktuell `active/running`, User `ollama`, mit vorhandener
Unit und `model-router.conf`. `/opt/ai-agent/config.yaml` und `/srv/ai-learning`
existieren. GET `127.0.0.1:11435/health` auf Acer lieferte HTTP 200,
`status: ok`, `model: learning`. Konfiguration nicht ausgegeben/geändert;
keine zusätzliche Instanz und kein Neustart. Das ergänzt den bereits
bestätigten Coding-Agent-Health auf Port 11436 und ersetzt keinen Modelltest.

Die endgültige Benutzerpräzisierung der Fork-Identität lautet vollständig:
**NetAigis Coding Chat**, Publisher `netaigis`, Paket `netaigis-coding-chat`,
ID `netaigis.netaigis-coding-chat`, Version `0.1.0`, eigenes SemVer; `1.0.0`
erst nach produktiver Abnahme. Die frühere Assistentenauslegung mit alter
Paket-ID war nicht freigegeben und ist zurückgenommen. Aktuelle konkrete
Migrations-/Command-Befunde stehen in [fork-identitaet.md](fork-identitaet.md).
Noch keine technische ID-Umstellung, keine Publisher-Verfügbarkeitsbehauptung,
keine produktive Installation. Backend NetAigis Coding Agent bleibt unverändert.


## Fortsetzung — NetAigis Coding Chat: technische Identität und geprüfte Migration

Die freigegebene Zielidentität ist technisch umgesetzt: `netaigis.netaigis-coding-chat`, Anzeigename **NetAigis Coding Chat**, eigene Version `0.1.0`. Upstream `v4.1.26` bleibt getrennt; Backend **NetAigis Coding Agent** wird nicht umbenannt. Manifest, Command-/View-/Sidebar-/Aktivitätsleisten-IDs, eigene Logos, Welcome, About, Walkthrough, URI-Callbacks und Recall-Kommandos passen zusammen. Eigenes Welcome erzwingt weder Cline-Konto noch neue Modelle. Optionale externe Cline-Dienste werden als solche bezeichnet, nicht als angebliche NetAigis-Cloud. Näheres und produktive Grenzen: [fork-identitaet.md](fork-identitaet.md).

Der Bootstrap wartet bei vorhandenen alten Daten auf ausdrücklich geprüften Import. Moderne Daten und übernommene Legacy-Daten liegen im von VS Code zugewiesenen eigenen Namensraum. Modulgebundene SDK-/Dateispeicherauflösung verändert keine gemeinsam genutzte Prozessumgebung. Der alte native SecretStorage wird nur in seinem berechtigten alten Extension-Kontext exportiert; neue native Secrets werden im neuen Kontext geschrieben und nachgelesen. Der minimale Exporthelfer ist für eine isolierte Profilkopie bestimmt, nicht zum Überschreiben der produktiven Originalextension.

Private Übertragung mit Datei-SHA256, tatsächlicher SQLite-Backup-API/WAL und Integritätskontrolle, vorab vorbereiteten DB-Pfadänderungen, synchronisiertem Journal, exklusivem Lock und überprüfter Rücknahme. Fehlende explizite Quellen oder abweichende Prüfsummen führen zum Abbruch. Spätere Arbeit im Ziel wird weder bei erneutem Import überschrieben noch bei einer Rücknahme verworfen. Kanonische Nachrichten, IDs, Urheberschaft, Originalaufträge, Modellwerte und gespeicherte Prozessinformationen werden erhalten.

Der Phase-2-Ordner war zwischenzeitlich im bereitgestellten Dateisystem nicht vorhanden. Nach Benutzerhinweis wurde er erneut gelesen und war erreichbar (`0700`, UID 1000). Abschluss-/Gate-/Acer-/SQLite-Nachweise stimmen mit `SHA256SUMS.phase2` überein; kein Neustart der Sicherungsphase und keine neue Sicherung. Mit sieben vorhandenen, gegen das bestehende konsistente Manifest geprüften Quelldateien wurde eine SDK-Sitzung tatsächlich migriert. Dabei reproduzierter Fehler: Snapshotpfad und ursprünglicher absoluter Datenpfad waren nicht getrennt. `originalFrom` korrigiert die Zuordnung. Ein weiterer Vorlauf korrigierte ausschließlich den Testleser für vorhandene Sitzungsunterverzeichnisse. Danach stimmen kanonische Nachrichten bytegenau; tatsächlicher SDK-Persistenzleser löst den neuen Manifestpfad auf. Drei alte Task-Einstellungsdateien bleiben semantisch identisch. Dieser Ausschnitt enthielt keine Legacy-Nachrichten; dafür gelten die ausdrücklich benannten Fixture-Tests. Keine produktiven nativen Credentials wurden für diesen Datenlesetest übernommen.

Tatsächlich ausgeführte Prüfungen im vorhandenen privaten Phase-4-Nachweisverzeichnis:

- `p4-identity-vscode-corrected`: 126/126 betroffene Adapter-/Recall-/Altbestand-/Migrationstests bestanden. Danach `p4-identity-final-migration-tests`: 16/16 Migrationsfälle bestanden (überlappen mit dem vorigen Lauf, nicht addieren).
- `p4-identity-sdk-storage-corrected`: 51/51 Pfadauflösungs-/Isolationstests bestanden. Ein Vorlauf hatte eine falsche Erwartung für den bestehenden Pfad `data/settings/providers.json`, die korrigiert wurde.
- Webview-Gesamtlauf: 613/619 bestanden, sechs alte Text-/Providerbezeichnungen widersprachen der Identitätsumstellung. Korrigierte betroffene Dateien: 38/38 bestanden (`p4-identity-ui-corrected`); zusätzlich 2/2 neue Welcome-Fälle bestanden. Kein pauschaler erneuter Gesamtlauf und keine behaupteten 619 grünen Tests im ersten Lauf.
- `p4-identity-existing-data-final`: tatsächlicher Restore des oben beschriebenen vorhandenen Datenausschnitts erfolgreich, alle sieben Eingangsdateien gegen vorhandenes Phase-2-Manifest geprüft.
- Neun Release-Policy-Fälle und Prüfung der tatsächlich freigegebenen Paketmetadaten bestanden. Das ist keine produktive Abnahme oder Publikationsfreigabe.
- SDK-Build, Extension-Bundle, Webview-Build und tatsächliche VS-Code-/Webview-Typprüfung erfolgreich. Frühe Fehler: fehlender Auth-Hook-Import im UI, Node-Typen ohne deklarierte Backup-Funktion und direkter SDK-Source-Import außerhalb des App-rootDir. Gezielt korrigiert; der Persistenztest benutzt jetzt gebaute reale SDK-Exports.
- Der unbegrenzte VS-Code-Gesamtlauf erreichte das 240-s-Limit und lieferte keinen vollständigen Ergebnisbericht. Er gilt ausdrücklich nicht als bestanden. Die oben genannten betroffenen Prüfungen liefen anschließend mit begrenzter Parallelität erfolgreich.

### Korrektur des nativen Persistenznachweises

Der gewöhnliche `--extensionTestsPath`-Modus dieser VS-Code-Version aktiviert **RAM-only Storage** (im installierten `mainImpl.js` direkt belegt). Frühere erfolgreiche Wiederstarts bewiesen nur Dateipersistenz, nicht native Secret-Persistenz. Der frühe Fallback-Helfer konnte zudem Fixtures bei erneutem Aktivieren anlegen; dieser Nachweis war dafür unzureichend. Das wurde nicht als Produktfehler kaschiert.

Der ergänzte Testtreiber startet **normale isolierte VS-Code-Prozesse ohne extensionTestsPath**, verwendet eigenes User-/Shared-Data-/Extension-Verzeichnis, schreibt Resultate vor normalem Quit und prüft sie nach tatsächlichem Prozessende. Ausschließlich die Phase `seed` darf Fixture-Secrets anlegen; Fallback kann nichts neu anlegen. Hostdateisystem nur lesend, produktiver Extensionpfad zusätzlich privat verdeckt, privater Netzwerk-Namensraum. `--password-store=basic` gilt ausschließlich für diese ausdrücklich künstlichen Test-Credentials.

Sechs normale persistente Läufe unter VS Code **1.143.1**, Node **24.21.0**, Electron **43.7.7** bestanden: Seed/Export, Import mit beschädigtem Artefakt/erneutem Import/Rücknahme/Reimport, vollständiger Start beider tatsächlicher Extensions, weiterer vollständiger Start, erneutes Nachlesen der nativen Schlüssel unter der neuen ID sowie Fallback-Nachlesen unter der alten ID **ohne erneutes Seed**. Verwendet wurde eine unveränderte Kopie der bereits installierten `saoudrizwan.claude-dev` 4.1.25, kein behaupteter neuer/pristiner Marketplace-Download. Command-, Sidebar- und View-IDs kollidieren nicht. Die erhaltenen Fixture-Nachrichten enthalten Friseer/jimmi und unbekannten Prozessstatus. Das ersetzt keine produktive Modell-/Android-Abnahme.

### Zugeordneter Xvfb-Absturz vom 31.10., 10:00:31 CET

Der Benutzer meldete den Absturz während der Arbeiten. Journal und vorhandener Coredump belegen **PID 1757291**, Parent-PID 1757290, `/usr/bin/Xvfb -displayfd 1 -screen 0 1280x800x24 -nolisten tcp`, CWD Reparatur-Worktree. Entscheidend: `COREDUMP_OPEN_FDS` ordnet stderr/FD 2 exakt dem privaten `xvfb-seed-5dbe704ce36140de9c980d43c39ab71d.log` zu. Damit gehört der Prozess eindeutig zu `p4-identity-host-seed-dev`, nicht zur produktiven VS-Code-Instanz. Startintervall aus Testmetadaten: ca. 10:00:31,773–10:00:32,123 CET; ein genauer separater Kernel-Startzeitpunkt wurde damals nicht protokolliert und wird nicht erfunden.

GDB auf dem vorhandenen Coredump bestätigt den Fehler in `libnvidia-egl-gbm.so.1 +0x3b1e`: `mov (%rax),%rax` bei `rax=0x8` (ungültiger Speicherzugriff). Aufrufpfad über `libEGL_nvidia`, `libEGL`, `swrast_dri` nach `Xvfb/InitExtensions`. Der X-Server behandelt SIGSEGV und ruft anschließend `abort()` auf; daher meldet systemd SIGABRT. **Belegte Absturzstelle: native EGL-/GLX-Initialisierung des privaten Testservers vor dem Start von VS Code.** Die interne Herstellerursache für den ungültigen Treiberzeiger bleibt ohne weitere Treibersymbole ungeklärt. Kein Beleg für einen Absturz durch Fork-Identitäts- oder Migrationslogik.

Gezielte Anpassung ausschließlich des Teststarters: `-extension GLX`, korrekt angelegtes privates X11-Socketverzeichnis, privater Runtime-Pfad/X11-Auswahl. Keine Treiber-/Systemkonfigurationsänderung. Der betroffene `seed-dev`-Versuch endete vor den Extension-Assertions mit Exit 1 und ist ungültig. Die anderen frühen Startfehler (`/dev/null`/Chromium bzw. schreibgeschützter Runtime-Socket) sind getrennte Test-Isolationsfehler. Die danach bestandenen sechs normalen persistenten Läufe verwenden bereits die GLX-Korrektur und werden wegen dieser Meldung nicht pauschal wiederholt.

Zusätzlicher ausschließlich betroffener Starttest `p4-xvfb-startup-after-core-analysis` bestand: PID **1775649**, privater Display 0, `xdpyinfo` Exit 0, GLX tatsächlich nicht vorhanden, Server bis zur gezielten eigenen Beendigung lebend, Exit 0. Der Starter erfasst künftig PID, Parent, Startanforderung, Bereitschaft, Display, Ende und echten Exitcode. Journal zeigt anschließend weiterhin nur den einen ursprünglichen Xvfb-Coredump; keine produktiven Prozesse beendet, keine Coredumps/Arbeiten gelöscht. ABRT-Pfad nicht vorhanden, `/var/crash` leer; andere Benutzer/Systemmeldungen sind nicht vollständig einsehbar, der eigene relevante Coredump samt Stack war lesbar.

Arbeitsstand bei der Absturzprüfung: Git meldete 110 geänderte versionierte Dateien und 26 unversionierte Einträge im Reparatur-Worktree; die IDE-Angabe „9 / +591“ ist ohne angezeigte Pfadliste keinem vollständigen Git-Status zuzuordnen. SHA256-Fingerprints aller 136 Einträge belegen nach der gezielten Startkorrektur **135 unverändert**, lediglich `scripts/prepare-identity-host.mjs` für den Startnachweis ergänzt; nichts fehlend, HEAD unverändert. Der Original-Worktree bleibt bei acht Änderungen/19 unversionierten Dateien mit Status-SHA256 `aff4aedbf69ef2f24960a735b51663df55a0a961ef0d2fb8e910293e010c9fbb`, Branch `coding-agent-v4` unverändert `624c2cd6661e100680d8b61daa3a3447f4708536`. Installiertes Original-Paket und Extension-Bundle sind bytegleich ihrer initialen nur gelesenen Testkopie.

### Fortsetzung nach diesem Teilschritt

Phase 4 bleibt aktiv: vollständige native Workspace-/Altbestandsübernahme und produktive OS-Schlüsselbundprobe, gemeinsame Runtime für tatsächliche alte Aufgaben, durchgehende Recall-Archivierung/Wiederaufnahme und echte Acer-/125B-/Android-Ende-zu-Ende-Abnahme bleiben offen. Der unabhängige Watchdog bleibt ein getrennter Acer-Dienst außerhalb Cline. Keine produktive Migration/Installation und keine Dienständerung. Die verlangte ausdrückliche Freigabe vor produktiver Migration bleibt verbindlich. Vorhandene alte unversionierte Artefakte und bisherige Commits bleiben erhalten.


## Laufende Fortsetzung nach Gesamtkorrektur (auf 3ab2376e6)

Kein vorzeitiger VSIX-Zwischenschritt. Aktuell in Arbeit: bestehende Recall-Outbox in den owning Runtime-Bereich verschoben (`DurableRecallOutbox`), VS-Code-Datei bleibt Pfad-/Netzadapter auf dieselbe Implementierung. Optionaler `RuntimeRecallArchive` hängt an Hub-/Runtime-Lebenszyklus, nicht an UI-Clients. Snapshot-Transkript wird ausdrücklich gelesen, Queue-Staging wartet auf Datenträger, nicht auf Netzwerk; Actor-Konfiguration und Reihenfolge bleiben gebunden. Ein Runtime-Handshake verhindert doppeltes Client-Archivieren, sobald der Hub selbst Archivierung bestätigt. Quelländerung wird als eigenständiger Runtime-Recall-Schritt versioniert; folgende Arbeit darauf fortsetzen, nicht neu beginnen.

Reproduziert: `p4-runtime-recall-no-client-red` 0/1, keine Outbox ohne UI-Host. Nach Verdrahtung: `p4-runtime-recall-core-green` 7/7 (darunter Hub ohne verbundene Clients, Writer-Wechsel/Reihenfolge, fehlender Actor-Key/Neustart und Backoff); `p4-runtime-recall-vscode-contracts` 19/19 Bestandstests. SDK-Build `p4-runtime-recall-sdk-build` erfolgreich. Nächster unmittelbarer Schritt: Shutdown-/Ausfall-/Ownership-Regressionsfälle, Typprüfung und realer Transportvertrag; danach sichere Wiederaufnahme vorhandener Sitzungen, durchgehender Recall-Restore und getrennten externen Watchdog fortführen. Keine Schlussabnahme behauptet.

Gezielte Acer-Lesebefunde: produktive Recall-API verwendet `RECALL_ACTOR_TOKENS_JSON` als **Actor-ID → Token**; falscher `actor_id` beim Schreiben wird mit 403 verweigert. Die Schlüssel wurden nicht ausgegeben. Coding `/v1/models` auf 11436 lieferte HTTP 200 mit `qwen3.8-flash-next-iq3_xxs`; daraus wird keine ungeprüfte Parameterzahl oder Modellumstellung abgeleitet. Learning 11435 beantwortete `/v1/models` mit HTTPError (Code in diesem ersten Abruf nicht erfasst); vorhandener Learning-Vertrag nutzt andere verifizierte Routen, dieser Abruf ist kein Gesundheits-/Modelltest. Quelle `/opt/ai-agent/app.py` enthält `/internal/learning/context`, `/internal/learning/correction`, `/v1/chat/completions`. Keine Dienste, Endpunkte oder Konfigurationen geändert. Bekanntes lokales Coding-Agent-Repository aus der vorhandenen Phase-2-Metadatei: `/home/friseer/MyGIT/coding-agent`; bisher nur gelesen, nicht verändert.


### Runtime-Recall: Abschalt-/Fehlerprüfung abgeschlossen

`p4-runtime-recall-shutdown-node`: 9/9 bestanden, `p4-runtime-recall-owner-node`: 21/21 bestanden. Die 7/19 Vorprüfungen oben sind überlappende Vorläufe, keine zusätzlichen unabhängigen Testfälle. Nachgewiesen: ausstehendes kanonisches Transkript wird vor Stop auf Datenträger geschrieben, ein blockierter Netzwerkaufruf hält Shutdown nicht auf; fehlgeschlagene Erfassung bleibt trotz anschließendem Netzausfall als `capture_failed` sichtbar. VS Code liefert weiterhin UI-Ereignisse, archiviert bei bestätigter Hub-Zuständigkeit nicht doppelt und bricht bei fehlgeschlagener Ownership-Abfrage ohne Ersatzruntime ab. Das sind Fixture-/Vertragsprüfungen, keine produktive Abnahme.

SDK-Build nach Typkorrektur erfolgreich (`p4-runtime-recall-type-fix-build`). Core-Dev-Typprüfung und VS-Code-Typprüfung erfolgreich (`p4-runtime-recall-core-types-fixed`, `p4-runtime-recall-vscode-types-fixed`). Vorläufe fanden zwei konkret behobene Probleme: unvollständiges Snapshot-Fixture und zu enger `typeof fetch`-Vertrag wegen Bun-`preconnect`. Frühe direkte Bun/Vitest-Aufrufe lieferten null Tests/Exit 1 und zählen nicht als Prüfung; erneute Ausführung mit vorhandenem Node/Vitest-Starter lieferte die oben ausgewiesenen tatsächlichen Fälle. Zwei anfängliche Aufrufe hatten einen falschen relativen Toolpfad und führten keine Prüfung aus. Keine Abhängigkeiten nachgeladen.

Ergänzende reine Acer-Leseprüfung: vorhandenes OpenAPI bestätigt Coding-Agent-Recall `POST/GET /internal/recall/events` und Learning-Agent `POST /internal/learning/context`, `/internal/learning/correction`, `/v1/chat/completions`; Learning `/v1/models` liefert tatsächlich **404**. Keine Routen/Modelle/Dienste geändert. Für physisches Android ist noch kein Gerätezugang belegt: ADB-Client vorhanden, bestehender lokaler ADB-Server auf 5037 nicht erreichbar (Connection refused, kein Server gestartet). Gezielte Gerätefrage gestellt; das blockiert die übrige Entwicklung nicht.

Nächster belegter Runtime-Fehler: `HubRuntimeHost.startSession` sendet zur Wiederaufnahme stets `session.create`, während der Auth-Gate vorhandene IDs ausdrücklich mit `existing_session_requires_resume` verweigert. Ein separater, serverseitig kanonischer Resume-Pfad ist erforderlich. Vorhandene laufende Instanzen dürfen dabei nicht ersetzt, unsichere Prozesszustände nicht freigegeben und vom Client gelieferte ältere Nachrichten nicht über aktuelle Historie geschrieben werden.


### Laufende kanonische Wiederaufnahme nach 72fad277c (noch nicht abgeschlossen)

`p4-resume-auth-red` reproduzierte den fehlenden Resume-Vertrag (1 gezielter Fehler, 14 unberührte Fälle übersprungen). In Arbeit: eigener Hub-Befehl `session.resume`, Writer-/Revision-/Quieszenzprüfung, kein automatisches Wiederholen nach ungewisser Zustellung; LocalRuntimeHost reaktiviert eigenes Manifest/Transkript/Compaction statt Client-Historie, erhält leere gültige Historien und bestehende resident Agents. Laufende Sitzungen werden über `session.attach` gelesen, nicht durch `session.create` ersetzt. Strikter Persistenzleser verweigert fehlende/defekte Transkripte, Alt-Lesemodus bleibt kompatibel. Bestätigter Actor wird aus Registry gelesen; initial unbesetztes Writer-Recht kann nur über den bestehenden CAS-Claim vergeben werden, fremder Writer wird nicht still übernommen.

SDK-Build `p4-session-resume-sdk-build` erfolgreich. Erster begrenzter Lauf `p4-session-resume-targeted`: 60/61, fehlgeschlagener neuer Test erwartete irrtümlich AgentConfig.messages statt tatsächlichem initialMessages. Typprüfung fand drei unvollständige Test-Configs ohne enableTools/Spawn/Teams. Test-Fixtures korrigiert; zusätzlich leere Historie, unsichere Tool-Beobachtung und Compaction-Erhalt ergänzt. Erneute Prüfung noch erforderlich; keine grüne Schlussbehauptung. Diese Quelländerungen noch nicht committen, bevor gezielte Tests und Typprüfung grün sind.

Benutzer bestätigt inzwischen: echter Android-Browsertest wird von ihm anhand konkreter Anleitung durchgeführt. Kein ADB-Server/Simulator als Ersatz und noch keine physische Abnahme. Produktive Health-Schemata gezielt gelesen: Coding 11436 `{status:"ok", ... model/role/learning_agent}`, Learning 11435 `{status:"ok", ... model/ollama/learning_store}`, beide HTTP 200. Keine Inhalte/Secrets ausgegeben. Vorbereitung des unabhängigen technischen Acer-Watchdogs bleibt separate Infrastrukturarbeit außerhalb der Cline-Laufzeit, keine AI-Selbstüberwachung.


### Kanonischer Resume-Vertrag geprüft; externer Watchdog separat versioniert

Der Resume-Schritt ist jetzt geprüft: `p4-session-resume-residency-final` **64/64**, Core-Typprüfung `p4-session-resume-residency-types` Exit 0, Core-Build `p4-session-resume-residency-core-build` Exit 0. Shared-Protokoll `p4-session-resume-shared-protocol` **14/14**; zusätzlich exakt drei betroffene Get-/Snapshot-Bestandstests bestanden (`p4-session-resume-get-boundary`, 43 übrige Fälle absichtlich übersprungen). Frühere 62/64- und 6-Fall-Läufe überlappen; nicht addieren. Der zwischenzeitliche reale Transporttest fand eine falsche Fixture-Erwartung: der echte Persistenzdienst ergänzt Nachrichten-IDs und Zeitstempel beim ursprünglichen Speichern. Verglichen wird nun korrekt mit dem tatsächlich gespeicherten kanonischen Eingang, dessen Bytes und Urheber unverändert bleiben.

Der reale Komponentenvertrag verwendet FileSessionService, LocalRuntimeHost, Hub-Handler und zwei authentifizierte WebSockets, jedoch einen Fixture-Agenten: alte ID wird serverseitig aktiviert, beide Clients lesen denselben Verlauf, Writer-Wechsel lässt exakt einen residenten Agenten und unveränderte gespeicherte Nachrichten bestehen. Der zusätzliche `runtimeResident`-Nachweis verhindert, dass ein nur gespeichertes running/pending als lebende Instanz gilt. Keine Prozesswiederherstellung wird aus einem Altstatus erfunden. Gespeicherter Provider/Modell/Workspace/Capabilities werden erhalten; Connection-Material kommt aus dem vorhandenen Providerstore der Runtime statt aus einer möglicherweise fremden veralteten Clientauswahl. Dieser Store muss bei der tatsächlichen gemeinsamen Installation vollständig geprüft bereitgestellt sein; keine Endpunkte oder Modellrouten umgestellt.

Watchdog-Quellen und getrennte Unit-/Timer-Assets sind in **a32808b16** versioniert (`sdk/scripts/netaigis-watchdog.*`). Sieben lokale Tests bestanden; lokaler `systemd-analyze verify` außerhalb der Socket-beschränkten Sandbox Exit 0. Der erste reine Syntaxprüfversuch wurde durch verweigerte SO_PASSRIGHTS/SO_PASSCRED-Optionen der Sandbox verhindert und zählt nicht als erfolgreicher Unitnachweis. Echter lesender Einmallauf auf Acer ohne Dateianlage/Installation: `p4-watchdog-acer-readonly.json`, 2026-10-31 14:07:17 UTC, Coding-PID 671914/start_ticks 12104539, Learning-PID 618787/start_ticks 11518209, beide unveränderte InvocationID und HTTP 200. Skript-SHA256 `6ef939607dd7feb08bfa4c94785c96e3fc6b2f38e1f658ae0feb9fb990513cbd`. Keine Agenten-/Cline-Selbstüberwachung und keine Neustarts. Dauerbetrieb/Installation des separaten Watchdogs und externe Hub-/Prozessfortschrittsabnahme bleiben offen und bedürfen vor dem produktiven Eingriff der angeforderten konkreten Freigabe.

Modellzuordnung noch nicht als 125B-Generierung belegt: Agent-Health nennt Rollen-Aliasse coding/learning; Learning zeigt auf den bestehenden Loopback-Backend-Port 11441. Dessen `/v1/models` und `/api/tags` nennen `qwen3.8-flash-next-iq3_xxs` ohne Parameterzahl, `/api/show` und `/props` lieferten 404. Aus diesen Namen wird keine Parameterzahl erfunden. Quellenachweis bestätigt Weitergabe vom Learning-Agent an das vorhandene `/api/chat`; zusätzliche Zielprüfung der tatsächlichen Routing-/Modellzuordnung folgt ohne Umstellung oder Diensteingriff. Reales Modellgespräch und Android-Abnahme fehlen weiter.

Nächste offene Reparaturen: unabhängige Prozessausführung im Shared-Modus statt an eine VS-Code-Terminalinstanz gebundener Aufrufe; Wiederanbindung authentifizierter Writer-Verbindungen; durchgehender Recall-Restore/Browser mit tatsächlichem Hub-Control-Vertrag und zuverlässiger Snapshot-/Compaction-Grenze; reale Acer-/125B-/Android-Integration. Kein VSIX-Zwischenziel und kein Abschluss der Gesamtaufgabe an diesem Commit.


### Laufende Shared-Terminalkorrektur auf fb0353bd3 (noch uncommitted)

Nachgewiesener Client-Besitzerfehler: `p4-shared-terminal-owner-red` scheiterte gezielt. Shared-Modus exportiert jetzt keinen VS-Code-Terminalcallback mehr und lässt die Built-in-Prozessausführung beim Hub; lokale Foreground-/Background-Integration bleibt bestehen. `p4-shared-command-owner-vscode`: 29/29 bestanden. Keine Änderungen am abgeschlossenen 1c5db6c56-Terminalpatch.

Die gesamte Timeout-Kette wird konsistent: Managed-Runtime-Prozesse erhalten explizit null statt des Stand-alone-Defaults 30 s; Executor, Shell-Wrapper und deklarierter Tooltimeout müssen zusammen ohne implizite Abschneidung arbeiten. Ausdrückliche Run-/Signalabbrüche und konfigurierte Zahlenlimits bleiben aktiv. Rohes createShellExecutor behält seinen bisherigen Default. ChildProcess.spawn/exit liefern tatsächliche technische Beobachtungen mit PID/Zeit/Exitcode, kein idle-Timer wird als Exit ausgegeben.

Zwischenläufe ehrlich: `p4-shared-command-lifetime-core` 172 bestanden, 2 fehlgeschlagen, 14 übersprungen (188 insgesamt). Einer war ein neuer Test, der auf spawn statt erhaltene Ausgabe abbrach; korrigiert. Der andere Agent-Loader-Test schrieb bei gesetztem CLINE_DIR in ein anderes Fixture-HOME; sein Testdatenpfad wurde ausdrücklich gesetzt. Der erste Rücksetzversuch benutzte fälschlich setClineDir(undefined), obwohl die vorhandene API string verlangt; dadurch schlugen im nächsten Lauf alle 41 Builder-Fälle im Teardown fehl. Aktuell auf den zuvor aufgelösten Cline-Pfad korrigiert. Die Typprüfung beanstandete außerdem Promise.withResolvers wegen des vorhandenen SDK-Lib-Targets, ersetzt durch eine lokale Deferred-Testhilfe, ohne globale Target-Änderung. Diese Korrekturen erneut gezielt prüfen, nichts als grün erfinden.

Der tatsächliche neue Prozess-/Socket-Test bestand bereits im Zwischenlauf (Agent/Session-Orchestrierung Fixture, Kindprozess/Tool/WebSockets echt): `p4-shared-command-process-lifetime` timing unter gleichnamigem test-data/data/shared-command-timing.json. Start 1793457359839, Writer getrennt 1793457359895, nächste Browseranfrage 1793457359906, tatsächlicher Exit beobachtet 1793457365861, Werkzeug zurück 1793457365864 (Unix-ms), bestätigter Exitcode 0. Prozess überlebt Trennung und nächste Anfrage; 6022 ms bis Exit, weitere 3 ms bis Rückgabe. Das ist keine erneute behauptete produktive VS-Code-/Android-Abnahme. Die früher geprüften echten Sleeps 30/40/45/60/90 wurden nicht pauschal wiederholt.

Zusätzliche offene Prozesskante für den Folgeschritt: Core-Detachment liefert bisher eine Meldung als String; der Shell-Wrapper kann das als success:true darstellen, obwohl der Prozess weiterläuft. Strukturierte laufend-/Exit-Beobachtung, Wiederanbindung und externe Statusabfrage müssen das auflösen, bevor produktive Abnahme beansprucht wird. Ebenso bleibt die Writer-Reconnect-/Approval-Kante offen.

Acer-Modellrouter: Port 11441 erreicht/Health 200, Felder status/max_context. Socket-PID ist für friseer nicht ausgewiesen, keine Parameterzahl aus Katalogen belegbar. Kein fremdes Projekt durchsucht, keine Dienste/Ports verändert. Gezielt befragte bestehende Modellservice-Liste zeigte ollama.service; daraus wird kein vermeintlicher Router-Dienst erfunden. Weitere Zuordnung benötigt einen tatsächlichen Quell-/Startnachweis. Über lesende Checks hinaus keine neue Modellinstanz gestartet.


### Shared-Prozessbesitz und Timeout-Kette: gezielte Prüfungen erfolgreich

`p4-shared-command-builder-fixtures-fixed`: 42/42 (41 Builder-Verträge und ein echter Prozess-/Socket-Fall). Der vorangegangene Lauf bewies 40 erfolgreiche Executor-Fälle, 4 Abbruchverträge und 2 Signal-/Fehlergrenzen bei 14 unverändert übersprungenen plattform-/umgebungsabhängigen Executor-Fällen. Die 87 Definitionstests waren bereits nach Änderung der Timeout-Wrapper vollständig grün; keine unbegründete Wiederholung. Somit decken die jeweils letzten gültigen Ergebnisse derselben betroffenen Dateien 175 bestandene und 14 übersprungene Core-Fälle ab, nicht die Summe sämtlicher wiederholter Läufe. VS-Code-Adapter und angrenzendes Recall-Ownership: 29/29 bestanden. Core-Typprüfung nach Testhilfen-Korrektur Exit 0; VS-Code-Typprüfung fand zunächst die alte parameterlose Mock-Signatur, diese ist jetzt passend typisiert und wird gesondert nachgeprüft.

Finaler Laufzeitnachweis nach Korrektur der Testhilfen: Start 1793457494237, Writer getrennt 1793457494290, Browseranfrage 1793457494297, Exit beobachtet 1793457500256, Werkzeug zurück 1793457500257 (Unix-ms). 6019 ms tatsächliche beobachtete Laufzeit, Rückgabe 1 ms nach bestätigtem Exitcode 0. Der Prozess war bei der Browseranfrage noch lebend; kein Abbruch durch Folgeanfrage/Writer-Trennung. Datei liegt unter dem bestehenden Nachweisroot in `test-data/p4-shared-command-builder-fixtures-fixed/data/shared-command-timing.json`. Agent-/Session-Orchestrierung bleibt im Test ein Fixture; keine physische Android- oder produktive Modellabnahme daraus ableiten.

Ab jetzt für Paket-Builds den vorhandenen Bun-Schalter `bun run --shell=bun ...` verwenden. Die System-Shell der vorherigen Bun-Skriptaufrufe las trotz äußerem /bin/sh die Benutzer-bashrc und versuchte SSH-Agent-Startup; Schreib-/Socketversuche waren in der Sandbox verweigert. Keine Benutzerkonfiguration ändern; der CLI-Schalter begrenzt die Änderung auf den jeweiligen eigenen Buildprozess.

Auch `p4-shared-command-vscode-types-fixed` ist jetzt tatsächlich mit Exit 0 abgeschlossen. Keine weiteren bekannten Typfehler dieses Schritts. Nächster Schritt bleibt die strukturierte Detached-/Running-Zustandsbehandlung und Writer-Reconnect, danach vollständiger Recall-Restore und reale Integration.


### Jüngste Modellpräzisierung und laufende Zustandsprojektion

Benutzerkorrektur: Modelle bleiben austauschbar; Wechsel zu „DeepSeek 4.1 1017B“ steht unmittelbar bevor. Kein behaupteter aktiver DeepSeek-/1017B-Nachweis, kein Modellwechsel durch diese Arbeiten. Der früher abgefragte Qwen-Katalogname ist lediglich eine gelesene Backend-Angabe; Parameterzahl wird nicht als Funktionsvoraussetzung festgeschrieben. Vor realer Abnahme zählt die dann aktive Konfiguration. Diese Präzisierung ersetzt keine anderen Auftragsbestandteile.

Aktuell uncommitted nach c1c6a8a05: Nachrichtentranslator setzte bei jeder Toolrückgabe commandCompleted=true; zwei gezielte Tests `p4-command-ui-state-red` reproduzierten unknown/running fälschlich als Completed (2 Fehler, 179 nicht betroffene Fälle übersprungen). In Arbeit: gemeinsame strukturierte Statusprojektion mit tatsächlichen Einzel-Exitcodes statt stdout-/Boolean-Vermutung, eigene UI-Zustände für unbekannt/Beobachtungsfehler/laufend/abgebrochen/fehlgeschlagen. Alte unbestätigte Flags werden beim Anzeigen nicht zu erfundenem Exit 0. Native Executor-Beobachtungen werden bis in Shell-Ergebnisse erhalten; explizites Detachment wird als pending und nicht als Erfolg ausgegeben. Foreground meldet Erfolg nur bei tatsächlich erhaltenem numerischem Exitcode; Pre-start-/unbeobachtetes Detachment bleibt unbekannt. Änderungen noch gezielt bauen, typprüfen, testen und anschließend committen.

Für neue SDK-Testaufrufe zusätzlich TMPDIR ausschließlich auf das bereits vom Prüfstarter angelegte private test-data/<label>/data setzen. Der vorhandene run-check.py ist im alten P1-Nachweis versiegelt und wird nicht umgeschrieben. So greifen neu gestartete Tests/Log-Reaper nicht auf produktive temporäre Verzeichnisse zu. Keine neuen beliebigen Ablagewurzeln oder Sicherungen.


### Wahrheitsgemäße Werkzeugrückgabe und Terminalanzeige

Der neue echte Detachment-Vertrag ist geprüft: `p4-command-result-evidence-core`
**90/90** (87 bestehende Definitionen und drei Shell-Grenzfälle). Der Prozess lebt
bei Rückgabe weiter, Ergebnis pending=true/success=false ohne erfundenen Exit;
der spätere echte Exit 0 ändert den historischen Rückgabestatus nicht. Native
Prozessbeobachtung bleibt bis zum strukturierten Toolergebnis erhalten.

`p4-command-ui-proof-fixtures`: **237/237** Translator-/Status-/Adapterfälle
bestanden. Vorlauf `p4-command-ui-projection`: 226 bestanden, zehn fehlgeschlagen,
weil alte positive Fixtures nur success:true ohne Exitbeleg lieferten. Diese
Fixtures liefern jetzt ausdrücklich bestätigten Exit 0; unbekannt und laufend
bleiben durch eigene negative Regressionen geschützt. Kein blindes Wiedergrün-
Setzen der alten Erfolgsannahme. Metadata-only-Updates, spätes stdout, fremde
Call-ID und laufende Batches sind separat geprüft. `p4-command-ui-render`:
**9/9** tatsächliche Komponentenfälle bestanden. Überlappende Läufe nicht addieren.

Biome aus der Monorepo-Wurzel verweigerte die verschachtelte App-Konfiguration;
keine Konfigurationsmigration vorgenommen. Mit vorhandenem App-Biome liefen
Formatierung und betroffene Prüfungen. Typprüfungen für diesen Schritt laufen
noch. Keine wiederholte produktive Sleep-Serie und keine produktiven Änderungen.
Dauerhafter aktueller Prozessstand, sichere Writer-Wiederanbindung und Recall-
Wiederaufnahme bleiben die anschließenden offenen Arbeitsschritte.

Typprüfungen abgeschlossen: `p4-command-result-app-types` und
`p4-command-result-web-types` Exit 0; Core mit dem bestehenden Entwicklungs-
Prüfprofil `p4-command-result-types-dev` Exit 0. Der erste Core-Aufruf ohne
`tsconfig.dev.json` fand zwei unveränderte unused-Fixturevariablen und einen neuen
unknown-Rückgabetyp in der Testbereinigung. Letzterer ist durch Promise.resolve
korrekt normalisiert; keine Quellfehler unterdrückt und keine globalen
Compileroptionen geändert. Staged-Diff- und aktuelle Commit-Historienprüfung mit
gitleaks redacted erfolgreich, keine Secrets ausgegeben.

### Prozessbeobachtung nach Detachment in der vorhandenen Session-Ablage

Auf 11b0de55d fortgesetzt. `p4-command-journal-red` reproduzierte die fehlende
Aufbewahrung/Schreibfehlergrenze (zwei neue Fehler, ein bestehender Fall grün).
Der hosteigene Controller hält jetzt tatsächliche ChildProcess-Beobachtungen
über eine Werkzeugrückgabe hinweg und schreibt sie in die vorhandenen
Session-Metadaten. Eindeutige Execution-ID, Tool-Call/Session, Runtime-Instanz,
Sequenz, PID/Zeit und tatsächlicher Exit verhindern die Verwechslung mit einer
anderen oder alten Ausführung. Historische Ergebnisse werden nicht umgeschrieben.
Die aktuelle Zustandsabfrage wartet auf die Persistenz; Schreibfehler werden
nicht als erfolgreich gesicherter Zustand zurückgegeben. Kein neuer Speicher
und keine Selbstüberwachungs-KI. TOTAL RECALL erhält die bestehenden Snapshot-
Benachrichtigungen nach erfolgreichem Speichern einschließlich Metadaten.

Der frühere unsynchronisierte Metadaten-Schreibweg benutzt nun dieselbe
Session-Mutationsqueue wie Manifeständerungen. Öffentliche Metadatenänderungen
bewahren das Prozessjournal. Authentifizierte Clients dürfen es weder bei
session.create einschleusen noch bei session.update ersetzen. Eine alte
running-Toolrückgabe kann nur durch ihren belegten späteren Exit als erledigt
abgeglichen werden; nicht bestätigte oder beschädigte Aufzeichnungen sperren
weiter. Nach Verlust der Runtime wird aus einem gespeicherten running kein
bestätigtes aktuelles Prozessleben oder abgeschlossener Exit erfunden.

Tatsächliche Prüfungen: `p4-command-journal-host` **167 bestanden, 14
plattformabhängig übersprungen, keine Fehler**. Enthält echte Prozesse,
FileSessionService, LocalRuntimeHost, gleichzeitige Modell-/Writer-Metadaten,
unveränderte Verlaufsbytes und erneutes Einlesen über einen frischen Host;
Agent und Modell sind Fixtures. Keine produktive Geräte-/Modellabnahme.
Der Zwischenlauf `p4-command-journal-first` hatte 136 bestanden/27 Fehler/14
übersprungen: acht vorhandene Metadata-Verträge widersprachen dem neuen
zusätzlichen Manifestlesen. Jetzt korrekt aus dem aktuellen residenten Zustand
bzw. bestehenden Index bewahrt; Vertragsprüfungen unverändert grün. Weitere
19 Prozessfälle lieferten sandboxbedingt keine korrekten Kindprozessausgaben.
Der exakt gleiche diagnostische stderr-Fall scheiterte in der Sandbox
(`p4-command-journal-executor-diagnostic`) und bestand außerhalb
(`p4-command-journal-executor-host-check`); danach nur die betroffene Gruppe
auf dem Host geprüft. Keine pauschalen Systemänderungen.

Core-Build `p4-command-journal-build` Exit 0. Die letzte Typprüfung läuft noch.
Offen bleiben insbesondere Live-UI-Abgleich dieser späteren Beobachtungen,
sichere Wiederanbindung einer Writer-Verbindung, vollständiger Recall-Restore,
reale Acer-/Android-/aktuell ausgewählte Modellintegration und produktiver
Rollout mit gesondert freizugebenden Eingriffen. Keine Phase abgeschlossen und
keine bisherige produktive Installation/Dienstkonfiguration verändert.

Auch `p4-command-journal-types-narrowed` jetzt Exit 0. Die erste letzte Prüfung
fand zwei optionale Transcript-Pfade in der neuen Testhilfe; durch eine echte
Voraussetzungsprüfung eingegrenzt, keine unsichere Typumgehung. Die Quelldateien
waren bereits beim erfolgreichen Build typgeprüft. Der neue Restore-Ausschnitt
beweist normale Session-Persistenz und erneutes Lesen, keine behauptete
Stromausfall-/Power-Loss-Abnahme oder produktive Migration.

### Authentifizierte Writer-Wiederanbindung und offene Freigaben

Auf 66546605d fortgesetzt. Zwei gezielte rote Tests (`p4-writer-rebind-red`)
belegten die blockierte Wiederanbindung bei Pending-Arbeit und die fehlende
Sperre für ein verspätetes Unregister. Server hält jetzt die exklusiv registrierte
Verbindungs-ID je Client fest; altes Unregister kann den Ersatz nicht entfernen.
Nur derselbe authentifizierte Actor und Client darf seine Writer-Verbindung
wieder anbinden, auch bei noch laufender Arbeit. Wechsel zwischen verschiedenen
Clients oder Friseer/jimmi bleibt bei unbestätigter Arbeit gesperrt.

Die neue Connection-ID kommt aus der Serverantwort, nicht aus Clientmetadaten.
RuntimeHost prüft sie bei Übernahme der eigenen vorhandenen Sitzung und vor
Anzeige einer erneut zugestellten Approval. Bestehende offene Freigaben behalten
Approval-/Tool-ID und erhalten erst nach gespeicherter Revision die neue
Zustellung. Doppelte Zustellung erzeugt keine zweite Entscheidung oder erneute
Werkzeugausführung. Antwortfehler gelten nicht stillschweigend als erledigt.

`p4-writer-rebind-policy` **19/19**, anschließender betroffener Host-Lauf
`p4-writer-rebind-host` **106/106** bestanden (überlappend, nicht addieren).
Beinhaltet echte getrennt authentifizierte Loopback-WebSockets: jimmi trennt
während laufender Fixture-Arbeit, derselbe Client bindet sich neu, Arbeit bleibt
laufend, keine erneute runTurn-Ausführung und kein Abort. Danach Übergabe an
Friseer und unveränderte Historie; Server-/Approval-/Clientgrenzen zusätzlich
gezielt geprüft. Dies ist kein physischer Android- oder echter Modelltest.

Typ-/Build-Vorlauf beanstandete zwei nicht eingegrenzte optionale Writer-Zugriffe;
explizite writer-Voraussetzung korrigiert. Danach
`p4-writer-rebind-types-narrowed` und `p4-writer-rebind-build-narrowed` Exit 0.
Keine Dienste, produktiven Daten, Ports oder Modellrouten verändert. Nächster
Schritt: aktuelle Prozessbelege auch in Live-/History-Anzeige abgleichen;
Recall-Restore/Browser und reale Komponenten-/Geräteabnahme bleiben offen.

### Live-Anzeige und Wiederöffnen anhand der tatsächlichen Prozessbelege

Auf ac19aa8f9 fortgesetzt. Die gemeinsame Statusprojektion gleicht jetzt eine
pending-Toolrückgabe mit dem passenden späteren Runtime-Exit ab. Session,
Execution-ID, PID, Zeit und gültige Runtime-/Sequenzdaten müssen passen. Ein
alter Snapshot oder eine spätere alte Toolrückgabe kann einen bestätigten Exit
nicht wieder auf running zurücksetzen. Der Eventkoordinator aktualisiert die
bestehende Zeile mit gleichem Zeit-/UI-Schlüssel; stdout und kanonische Historie
bleiben unverändert. Der Projektionscache ist flüchtiger UI-Zustand, kein
weiterer Prozess- oder Verlaufsspeicher.

Beim Wiederöffnen ohne passenden Exitbeleg wird ein alter running-Eintrag als
unknown angezeigt. Nur die damalige Toolrückgabe belegt kein heutiges
Prozessleben. SDK-History bekommt das vorhandene Journal aus dem Sessionrecord;
Legacy-Abschlussflags bleiben ohne erfundenen Exitcode. Drei direkte
Projektionsfälle, kanonischer History-Roundtrip und Snapshot-/Folgeereignis-
Regression schützen diese Grenze. `p4-command-ui-reconcile` **240/240** betroffen
bestanden; Extension-/Webview-Typprüfungen
`p4-command-ui-reconcile-app-types` und `p4-command-ui-reconcile-web-types` Exit 0.
Keine produktive Sitzung migriert oder Komponente installiert.

Bei Prüfung des Anschlusses ist eine weitere Metadatenkante erkannt: der
Checkpoint-Hook liefert nach einem asynchron erzeugten Checkpoint noch eine
vorher gelesene komplette Metadatenkopie. Deren Writer-/Prozessfelder dürfen
spätere Belege nicht überschreiben. Als nächstes gezielt reproduzieren und den
Checkpoint-Schreibweg auf seine eigenen Felder begrenzen; keine Wiederholung
der abgeschlossenen Phasen.

### Checkpoint-Metadatenverlust reproduziert und korrigiert

`p4-checkpoint-metadata-red` schlug mit echtem Prozess und tatsächlicher
FileSessionService-Persistenz fehl: Der echte Bootstrap-Callback des
Checkpoint-Hooks schrieb nach dem Exit eine ältere Metadatenkopie zurück
(Titel wieder original statt writer correction, ältere Writer-/Prozessfelder).
Er schreibt jetzt ausschließlich sein eigenes checkpoint-Feld gegen den
aktuellen Zustand innerhalb der Session-Queue. Neuere Prozess-, Writer-,
Auftrags- und Titelfelder bleiben erhalten; kein Checkpoint neu erfunden.

`p4-checkpoint-metadata-fixed`: **122/123** bestanden; die neue Regression und
alle Host-Verträge grün. Der einzelne zusätzliche Fehler war ein bestehender
No-Git-Fixture unter dem privat isolierten TMPDIR im Reparatur-Worktree. Vor
seinem git init fand Git das Eltern-Repository und erzeugte dort den Test-Ref
`refs/cline/checkpoints/sess_git_init_later/1` mit Objekt
`ba11b26aee697f37e43365f512bc8af97718ca14`. Das war eine unerwünschte Auswirkung
dieses Testlaufs. Der Quellpfad nutzt stash create/commit-tree/privaten Ref,
keinen destruktiven Stash/Reset. Der Ref wurde weder gelöscht noch verschoben;
Nachweis `p4-checkpoint-inherited-test-ref.json` im bestehenden privaten
Prüfverzeichnis. Eine spätere Bereinigung erfordert die gesonderte Freigabe.

Abgrenzung: coding-agent-v4 ist weiterhin
624c2cd6661e100680d8b61daa3a3447f4708536. Originalstatus mit denselben Flags
`--porcelain=v1 --untracked-files=all` weiterhin SHA256
aff4aedbf69ef2f24960a735b51663df55a0a961ef0d2fb8e910293e010c9fbb.
Ein anfänglicher Vergleich ohne untracked-files=all lieferte wegen anderer
Darstellung einen anderen Hash; kein geänderter Original-Arbeitsstand.

Nur der betroffene Fixture wurde erneut geprüft: explizite Suchgrenze
`p4-checkpoint-git-discovery-isolated` **1/1** bestanden (19 nicht betroffene
Fälle übersprungen). Die Core-Testkonfiguration setzt die Suchgrenze jetzt
selbst am bereits explizit gesetzten privaten CLINE_DATA_DIR/TMPDIR und bewahrt
vorhandene Git-Suchgrenzen. Keine Produktions-/Systemkonfiguration geändert,
versiegelter Prüfstarter unangetastet. Finaler Konfigurationsnachweis
`p4-checkpoint-git-discovery-config` separat, nicht mit dem Zwischenlauf addieren.
Die zuvor erfolgreichen 122 Fälle nicht pauschal wiederholen.

`p4-checkpoint-metadata-types` und `p4-checkpoint-metadata-build` Exit 0.
Vorherige neue Terminal-/Journal-/Reconnect-/Projektionsnachweise einschließlich
roter Zwischenläufe in 84 Dateien überprüft versiegelt:
`SHA256SUMS.runtime-0f594871e-20261031`, SHA256
7b4a8f2aca367e2386f771c551a33417a162e4cd5b6278d5f9c3a774092a9226.
Keine neue Sicherung oder neue Ablagewurzel. Gesamtauftrag läuft weiter.

### Modellunabhängige Actor-Zuordnung bis zum bestehenden Backend

Nach b80cd4943 der nächste belegte Integrationsfehler: Der vorhandene Provider
reichte zwar die Session-ID, jedoch nicht den authentifizierten Actor an den
Coding-Agent weiter. Ein statischer X-AI-User konnte dadurch Friseer beibehalten,
während jimmi schrieb. `p4-actor-routing-red`: drei Fälle grün, der tatsächliche
Adapter-/Streaming-Fall mit parallelem Friseer/jimmi und zwei beliebigen
Modell-IDs scheiterte genau an dieser Zuordnung.

Core setzt jetzt pro authentifiziertem Turn einen getrennten AsyncLocalStorage-
Kontext um Ausführung und Auth-Retry. Der vorhandene OpenAI-kompatible Adapter
setzt X-AI-User daraus ausschließlich auf der schon vorhandenen Route
Port 11436 /v1/. Die Session-ID bleibt gleich. Kein Actor aus Modelltext oder
Request-Metadaten; ungültige Headerwerte werden vor Ausführung verweigert.
Lokale unsignierte Turns erben keinen vorherigen Actor; bestehende Konfiguration
bleibt dafür erhalten. Keine Modell-/Endpoint-/Routingumstellung, kein fester
Qwen-/125B-/DeepSeek-Zwang und keine neue Standardmodellwahl.

Lesender Acer-Nachweis: Der zunächst aus der alten lokalen Quellstruktur
abgeleitete /opt/netaigis-coding-agent/server/app.py existiert produktiv nicht.
Danach gezielt nur das bekannte Backend-Verzeichnis und seine Unit-Zuordnung
geprüft; tatsächlich /opt/netaigis-coding-agent/app.py. AST bestätigt
x-ai-conversation in Zeile 226 sowie x-ai-user in 237/130/166, Datei-SHA256
ca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201.
Learning-Quelle /opt/ai-agent/app.py bestätigt X-AI-Conversation-Parameter und
bestehende user-Felder, SHA256
b68af9d9954b616b47d127f8d3e62d93ae86ad5d6ffcc58df7eae9a8490de7dd.
Belege p4-acer-actor-header-readonly / p4-acer-coding-source-location /
p4-acer-actor-header-actual im bestehenden privaten Prüfverzeichnis.
Keine Geheimnisse oder Konfigurationen ausgegeben, keine produktive Datei oder
Dienst verändert und kein Modellgespräch über diese Quellprüfung geführt.

`p4-actor-routing-wire` **32/32** bestanden: tatsächlicher AI-SDK-Provider-Adapter
mit gestubbtem HTTP, parallele Actor-/Session-Header, unveränderte übergebene
Modell-IDs, andere Ports/Pfade ohne neue Header und Kontextbereinigung.
`p4-actor-routing-core` **103/103** Host-Verträge einschließlich neuer paralleler
Actor-Ausführung und unsigniertem Folgeturn bestanden (Agent/Modell Fixtures).
`p4-actor-routing-sdk-build` (voller benötigter SDK-Build) und
`p4-actor-routing-core-types` Exit 0. Keine produktive Modell- oder Geräteabnahme.

Der finale Checkpoint-Fixture-Nachweis p4-checkpoint-git-discovery-config ist
inzwischen ebenfalls **1/1** bestanden, 19 unbetroffene Fälle übersprungen.
Nächster offener Schritt bleibt Recall-Restore/Browser über die gemeinsame
Runtime; keine nicht vorhandenen Recall-Übernahmerouten annehmen. Reale Android-
Abnahme erfolgt später angeleitet durch den Benutzer und mit der dann tatsächlich
ausgewählten Modellkonfiguration.

### TOTAL RECALL: vollständiger Leser und ehrliche Wiederaufnahmegrenze

Auf e4677b3b3 fortgesetzt. `p4-recall-reader-red`: zwei neue gezielte Fehler
belegen die bisherige Einseiten-Lektüre und den früheren vollständigen Snapshot
trotz späterem unvollständigem Tail. Leser jetzt aus der bisherigen App nach
Core verschoben; App bleibt ein dünner Adapter für den vorhandenen Netzpfad.
Kein zweiter Reader, keine neue Datenbank und keine erfundene Recall-Route.

Der lesende Acer-Quellnachweis `p4-acer-recall-pagination-source.json` bestätigt
für die reale API project_id/conversation_id/after_seq und die bestehenden
Antwortschlüssel events/conversations. Kein unbelegter limit-Parameter. Der
Leser bindet sich zuerst an Anzahl und letzte Sequenz der Projekt-Konversation,
liest fortschreitende Seiten bis genau zu dieser Grenze und prüft Scope,
Duplikate, fehlende Seiten/Watermark und Anzahl. Spätere parallele Einfügungen
gehören zu einem späteren Lesestand. Kein sleep-/Polling-Wiederholungsloop;
Gesamt- und HTTP-Fristen begrenzen den Lesevorgang.

Originalereignisse und Urheber werden unverändert zurückgegeben. Ein früherer
vollständiger Snapshot plus späterer unvollständiger Tail bleibt ausdrücklich
nicht wiederaufnahmefähig. Auch fehlende Struktur/Lineage, ungültige Zeiten,
aktive Sitzung oder unbestätigte Prozesse verhindern einen sicheren Kandidaten.
Das Feld restoration beschreibt ausschließlich die Archiv-Voraussetzungen:
keine erteilte Schreibzuständigkeit, keine bestätigte Produzentenauthentizität,
kein Import und keine gestartete Aufgabe. Für den nächsten eigentlichen Restore
sind Runtime-Admission, überprüfte Quelle und Nichtüberschreiben erforderlich.

`p4-recall-reader-shape` **13/13** Core-Fälle bestanden (vorher 11/11,
überlappend). Core-Typprüfung p4-recall-reader-core-types Exit 0;
abschließender Core-Build p4-recall-reader-shape-build Exit 0 nach zusätzlichen
Lineage-/Zeitprüfungen. App-Erstlauf p4-recall-reader-app hatte fünf grüne
Browser-/Command-Fälle, aber Reader-Suite konnte wegen fehlendem Export im
bestehenden Core-Teststub nicht laden (Gesamtexit 1, kein vollständiger Erfolg).
Stub exportiert jetzt die tatsächliche neue gemeinsame Implementierung.
Nur Reader erneut geprüft: p4-recall-reader-app-export **6/6** bestanden.
App-Typprüfung p4-recall-reader-app-types Exit 0. Die Scope-Negativfixture
liefert erst einen gültigen Konversationsdeskriptor und prüft danach tatsächlich
die abweichende Ereignis-Projekt-ID; keine unbeabsichtigt schwächere Prüfung.

Gemeinsamer Runtime-Restore/Session-Browser und verifizierte Produzentenquelle,
Archivabschluss nach Runtime-Ende, echte Acer-/Android-/Modellabnahme und
produktionsreifer Rollout bleiben offene Arbeiten. Keine produktive API-
Schreibanforderung, Installation oder Migration in diesem Schritt.

### TOTAL RECALL: tatsächlicher Archivabschluss nach Runtime-Ende

Auf c32a1fc7c fortgesetzt. Der neue End-to-End-Komponentenfall
`p4-recall-final-snapshot-red` reproduzierte die Abschlusslücke: nur ended,
kein nachfolgender vollständiger Stand. Der Archiver legt jetzt zuerst die
unveränderte Endbeobachtung ab und erfasst danach bestehendes Sessionrecord und
kanonische Nachrichten. Record vor/nach dem Lesen muss übereinstimmen. Fehlende
oder wechselnde Daten ergeben capture_failed und ausschließlich das belegte
Rohereignis; keine leere erfundene Historie und kein Abschluss aus Modelltext.

Der abschließende Snapshot behält IDs, Nachrichten, Autorenschaft und tatsächliche
Metadaten. Actor stammt aus der vorhandenen Writerkontrolle; existierende
Outbox-/API-Zugangsauswahl bleibt getrennt von Hub-Login. Beide Dateien werden
vor Shutdown dauerhaft gestaged, unabhängig vom Netz. Aktueller Hub-Lifecycle
entsorgt die Runtime bereits vor Archive.stop; keine abgeschlossenen
Lifecycle-Arbeiten wiederholt oder andere Reihenfolge blind umgestellt.

`p4-recall-final-snapshot` **9/9** betroffene Archiv-/Outbox-/Hub-Fälle bestanden.
Der neue Fall verwendet echte FileSessionService-Persistenz und LocalRuntimeHost
zum Lesen, verzögerte Nachrichtenlieferung, reale private Outbox und simuliertes
HTTP 503. Ohne UI-Client wartet Stop auf die Erfassung; zuerst ended, dann der
vollständige gespeicherte Stand unter jimmi mit unveränderten Friseer-/jimmi-
Nachrichten. Der tatsächliche gemeinsame Reader liest die erzeugten Einträge
wieder als vollständigen Kandidaten. Originale Transkriptdatei bleibt bytegleich.
Zwei zusätzliche Fehlerfälle: fehlendes Record und Zustandswechsel während des
Lesens bleiben sichtbar, kein fingierter Snapshot.

`p4-recall-final-snapshot-types-contract` und
`p4-recall-final-snapshot-build-contract` Exit 0. Typ-Vorlauf fand den zu großen
RuntimeHost-Cast der neuen Testhilfe. Der Archiver deklariert jetzt exakt seine
beiden tatsächlich benötigten Lesemethoden; keine unsichere Test-Typumgehung.
Keine produktiven Modellanfragen oder Acer-Änderungen.

Weiter offen: überprüfte Produzentenquelle vor einem tatsächlichen Recall-
Import und authentifizierte Runtime-Admission/Browserübernahme, Altbestand-
Anbindung, reale Geräte-/Modellabnahme und produktiver Rollout. Eine lesbare
Archivkopie und grüne Komponentenfälle bedeuten weiter keine produktive Abnahme.

### TOTAL RECALL: überprüfte Produzentenquelle vor Import

Auf 07cf41099 fortgesetzt. `p4-recall-producer-red` belegte den fehlenden
Quellennachweis für einen vollständig aussehenden, actorseitig gelieferten
Snapshot. Die vorhandene Outbox kann jetzt optional die vollständigen
Produzentendaten per HMAC-SHA256 im bestehenden payload authentifizieren:
Event-ID, Projekt, Session, Actor, Art und Inhalt einschließlich unveränderter
Nachrichtenurheber und Prozessbelege. Reihenfolge-/Empfangsdaten des Servers
bleiben separat geprüft. Queue v1, IDs und tatsächliche Acer-Routen bleiben
unverändert. Wiederholte Zustellung ändert den signierten Datensatz nicht.

Schlüssel ist eine eigene Runtime-Option, niemals automatisch aus Hub-Login oder
Recall-API-Token abgeleitet; Wiederverwendung eines API-Tokens wird verweigert.
Optionaler expliziter Deployment-Wert CLINE_HUB_RECALL_ARCHIVE_KEY ist ein
32-Byte-base64url-Wert aus geschützter Konfiguration außerhalb von Git.
Dieser Schritt erzeugt/konfiguriert **keinen produktiven Schlüssel**, keine neue
Ablage und keinen Dienst. Tests verwenden ausschließlich Fixture-Schlüssel.
Journal enthält nur Schlüsselkennung und MAC; Status nur die Hash-Kennung.

Reader verlangt den Nachweis standardmäßig für einen Wiederaufnahmekandidaten.
Alte unsignierte Ereignisse bleiben vollständig lesbar und unverändert; keine
heimliche Neuzuordnung von Urheberschaft. Rein lesende Inspektion kann die
Kandidatensperre ausdrücklich abschalten, meldet dann weiterhin sourceVerified
false. Ein tatsächlicher Import darf eine solche Client-Ausnahme nicht annehmen.
Für einen ausschließlich alten, unsignierten Archivbestand wird eine anderweitig
geprüfte Originalbasis benötigt; keine Rückfalllösung durch Modellannahmen.

`p4-recall-producer-proof` **38/38** bestanden: echte Node-Kryptofunktionen,
Manipulation verschachtelter Urheberschaft/Scope/ID/Inhalt, andere Schlüssel,
JSON-Schlüsselreihenfolge, Zustellmetadaten, sichere Schlüsselvalidierung sowie
bestehende Reader-/Runtime-/Config-/Outbox-/Hub-Verträge. Der reale persistierte
Abschlussfall läuft jetzt durch signierte private Outbox und denselben Reader
mit passendem Schlüssel bis sourceVerified=true. Das bleibt ein Komponentenfall
mit Fixture-Inhalten/HTTP, keine produktive Abnahme. App-Adaptergrenze
`p4-recall-producer-app` **23/23** bestanden. Core-/App-Typprüfungen
p4-recall-producer-types / p4-recall-producer-app-types und Core-Build
p4-recall-producer-build Exit 0.

Vorangegangene Checkpoint-/Actor-/Recall-Lese-/Abschlussnachweise in 83 Dateien
im bestehenden Prüfroot verifiziert: SHA256SUMS.recall-07cf41099-20261031,
SHA256 281fd6e2325ae234b9413cbefe69107a34a502ab436734daea5ed845b122a2df.
Keine neue Sicherung und keine Bereinigung des dokumentierten Test-Refs.
Nächster konkreter Schritt: authentifizierter Import/Übernahme über die
vorhandene gemeinsame Runtime mit Nichtüberschreiben, überprüftem Archivstand
und kanonischer Session-ID. Keine neue Speicherarchitektur entwickeln.

### Native Import-Voraussetzung: vorhandene Ziele niemals ersetzen

Auf 9c4594435 fortgesetzt. Die bestehende native Session-Erstellung kann jetzt
ausdrücklich `ifAbsent` verlangen. SQLite verwendet INSERT OR IGNORE; der
File-Adapter prüft seinen vorhandenen Index streng und entscheidet synchron
im besitzenden Prozess. Das ist keine prozessübergreifende File-Transaktion.
Ein exklusiv angelegtes privates Artefaktverzeichnis und wx-Dateien verhindern
die Übernahme vorhandener Verzeichnisse, Symlinks und Transkripte. Unsichere
Session-IDs und Backends ohne diese Garantie werden vor dem Schreiben abgelehnt.
Bei fehlgeschlagener Indexaufnahme wird nur die eigene, anhand dev/ino erkannte
leere Reservierung entfernt. Keine Löschung vorhandener Sitzungen.

`p4-session-no-overwrite-fixtures` **9/9** bestanden: echte SQLite-/File-Backends,
gleichzeitige Erstellung, bestehende Zeile mit und ohne Artefaktverzeichnis,
bytegleiche Originaldateien, beschädigter Index, fremdes Artefakt und Symlink/
Pfadgrenze. Der erste Rotlauf enthielt vier echte fehlende Schutzgrenzen und
zwei Testhilfenfehler (getSession statt öffentlichem listSessions). Beim ersten
Grünversuch bestanden die 20 bestehenden Persistenzfälle; drei neue Fälle
scheiterten noch an dieser falschen Test-Lese-API. Nach deren Korrektur nur
die neun betroffenen neuen Fälle erneut ausgeführt. Keine Behauptung, sämtliche
ersten Fehler seien Produktfehler gewesen. Core-Typprüfung
p4-session-no-overwrite-types und Build p4-session-no-overwrite-build Exit 0.

Dies ist die Nichtüberschreiben-Voraussetzung, noch kein vollständiger
Archivimport mit Commit-/Fehlerwiederaufnahme. Keine produktiven Daten,
Modellrouten, Dienste oder ursprünglichen Arbeitsverzeichnisse verändert.

### Kanonischer Import in die vorhandene native Persistenz

Auf d293c1bf7 fortgesetzt. NativeSnapshotImport schreibt in dieselben
Session-Zeilen, Manifeste und Transkripte. Vorhandene IDs bleiben erhalten;
Nachrichten werden ausdrücklich nicht durch den normalen Import-Normalisierer
neu nummeriert oder umetikettiert. Provider/Modell, Originalauftrag, Korrekturen,
Zeitangaben und Checkpoint-Metadaten bleiben erhalten. Es werden keine Git-
Checkpointobjekte aus einem fremden Host erfunden oder übertragen.
Historischer Session-/Capability-Writer wird als Herkunft erhalten, erteilt
jedoch keine Zuständigkeit in dieser Runtime; neue Kontrolle beginnt unbesetzt.
Kein archivierter Auto-Approve-Schalter wird zur aktuellen Freigabe.

Die Indexzeile trägt vor dem ersten Dateischreiben runtimeSnapshotImport=staging.
Resume, Start, Löschen und schreibende Hub-Zugriffe akzeptieren diesen Zustand
nicht. Exklusive private Dateien werden synchronisiert, das Manifest atomar
committed, danach die Indexaufnahme mit Statusrevision bestätigt. Scheitert
der Abschluss, bleiben Quelle und Ziel erhalten. Nur derselbe Quell-/Inhaltshash
darf passende Dateien zum Abschluss bringen; fremde Änderungen werden weder
überschrieben noch automatisch gelöscht. Erfolgreiche Wiederholung schreibt
keine Historie erneut. Es ist weiterhin kein Remote-Endpunkt freigeschaltet:
Der aufrufende Server muss Produzentenquelle und Actor selbst verifizieren.

`p4-native-snapshot-import`: 25/26 bestanden. Der eine vorhandene Minimalbackend-
Fall scheiterte an einer unnötig eingeführten listSessions-Abhängigkeit der
Admission. Dafür jetzt eine optionale, gezielte native Importzustandsabfrage;
kein aufgeweichter Prozesscheck und keine Ergänzung einer falschen Test-API.
`p4-native-import-admission-compat` 11/11 bestanden; enthält die acht neuen
Importfälle (File/SQLite, identische Urheber und IDs, Fehler/Retry, Manipulation,
Parallelität, aktive Quellen verweigert). `p4-native-import-core-contracts`
130/130 bestanden. Reader-Fälle aus dem ersten Lauf bestanden unverändert.
Typ-Vorlauf fand drei zu eng inferierte Metadatenfelder der neuen Implementierung;
Record-Typ korrigiert, p4-native-import-types-fixed Exit 0.

Archivierte idle-Zeilen mit pid=0 und Importmarkierung werden nicht von der
alten PID-Bereinigung zu failed/Exit 1 umgedeutet. Dieser Zustand behauptet
keinen lebenden Prozess; unbekannte Werkzeugausführung bleibt separat gesperrt.
`p4-native-import-idle` 1/1 bestanden, acht unbetroffene Fälle übersprungen;
abschließender p4-native-import-build Exit 0. Nächster Schritt ist
die serverseitig geprüfte Hub-Admission und Browser-Anbindung. Keine produktive
API-Schreibanforderung, Installation, Migration oder Acer-Dienständerung.

### Authentifizierter Recall-Import über die gemeinsame Runtime

Auf 01671cb0d fortgesetzt. Additive Hub-Kommandos session.recall.list/inspect/
restore verwenden den vorhandenen Recall-Reader und die geschützte Actor-
Konfiguration des Runtime-Archivers. Keine neue Serverroute auf dem Acer.
Client darf ausschließlich Konversationsreferenz und gelesene Journalgrenze
senden, keine Nachrichten, fremde Urheber oder selbst behaupteten Quellennachweis.
Hub verifiziert Produzenten-MAC, Vollständigkeit, Zustand, Sequenz und das
tatsächlich autorisierte Arbeitsverzeichnis einschließlich aufgelöster Pfade.
Der Import läuft unter derselben ID-Sperre wie Schreibübergaben und lehnt
Neuaufnahme während Hub-Drain ab. Ungewisse Restore-Antworten werden nicht
automatisch erneut gesendet. Native Aufnahme erteilt kein Schreibrecht und
startet keinen Agenten; anschließendes Resume/Attach nutzt die vorhandene
kanonische Runtime. Es gibt keinen atomaren Cross-Service-CAS mit dem fremden
Recall-Journal; die belegte Importbasis bleibt ausdrücklich ihre Journalgrenze.
Ein Import behauptet keinen weiterlebenden archivierten Shellprozess.

VS-Code-Session-Browser verwendet bei ausgewählter gemeinsamer Verbindung
diesen Hub statt einer zweiten lokalen Recall-Schreibstelle. Quelle und
bestätigter Journalstand werden außerhalb der Webview gebunden; ein Wechsel
von Runtime oder Actor-Zugang erfordert erneutes Lesen. Der Browser meldet
Bereitstellung des gespeicherten Verlaufs getrennt von Prozessstart/Schreibrecht.
Fehler führen weder zu lokaler Ersatzruntime noch zu Erfolgsmeldung.
Der eigene Anzeigename bleibt NetAigis Coding Chat. Kein produktiver Login-
oder Produzentenschlüssel wurde angelegt oder ausgegeben.

`p4-recall-recovery-wire` scheiterte zunächst viermal an falschen Testassertions:
NodeHubClient wirft HubCommandError statt negativer Replies. Vertrag korrigiert;
`p4-recall-recovery-wire-contract` 4/4 bestanden. Echte lokale WebSockets,
LocalRuntimeHost und File-Persistenz, Recall-HTTP und Agent/Modell als Fixtures.
Manipulierte Autorenschaft, unsignierte Quelle, fremdes Workspace und veraltete
Journalgrenze werden verweigert. Erweiterter positiver Fall
p4-recall-recovery-writer 1/1 bestanden, drei unbetroffene Fälle übersprungen:
Import unter jimmi-Zugang, kanonisches Resume unter Friseer, Attach und
Schreibübergabe an jimmi, weiterhin ein Agent/gleiche Historie; erneuter Import
über die residente Sitzung abgelehnt. Kein physischer Android- oder Modelltest.

`p4-recall-runtime-app` 10/10 bestanden (Adapter, Browser-Script, Commandgrenze,
verlorene Antwort, wechselnde Zugangsauswahl und fremde Webview-Daten).
`p4-recall-client-no-replay` 6/6 bestanden, 38 unbetroffene Fälle übersprungen.
Core-Vertragsgruppe p4-recall-recovery-core-contracts: 24/25 bestanden; Abschluss-
Archivfall scheiterte nach 20,022 Sekunden mit STACK_TRACE_ERROR. Nur diesen
Fall unverändert isoliert wiederholt: p4-recall-archive-final-isolated 1/1
bestanden, fünf unbetroffene Fälle übersprungen, Gesamtlauf 7,73 Sekunden.
Parallel liefen langsame Typprüfungen; Last als Ursache ist plausibel, nicht
abschließend belegt. Der angegebene Filter client-timeout.test.ts existiert
nicht und wurde nicht ausgeführt; stattdessen tatsächlicher index.test.ts-
No-Replay-Nachweis oben. Kein verschwiegener grüner Gesamtlauf.

SDK-Build p4-recall-admission-sdk-build Exit 0. Core-Typ-Vorlauf fand einen
falschen Testzugriff model statt modelId; korrigiert, p4-recall-recovery-types-fixed
Exit 0. App-Typprüfung p4-recall-runtime-app-types Exit 0.
Weiter offen: Android-Browseroberfläche/echte Geräteabnahme dieses Restorepfads,
belegte Altbestandsaufnahme und Kaltstart-Prozessklärung, tatsächliche Dienste-
und Modellabnahme, eigenständiger externer Watchdog und produktiver Rollout.
Neue native PID-Bereinigungskante erkannt: bisher wird bei fehlendem Runtime-PID
Exit 1 erfunden. Für historische Importzeilen bereits umgangen; allgemeine
Korrektur mit eigenem Regressionsnachweis bleibt der nächste Prozessstatuspunkt.
