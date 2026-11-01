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

### Fehlender Runtime-PID ist kein bestätigter Exit

Auf 4d835acb0 fortgesetzt. p4-runtime-owner-exit-red reproduziert den künstlichen
Exit 1 in beiden realen Persistenzbackends (0/2 bestanden). Korrektur: Session
meldet Runtime-Ausfall als failed, numerischer Exit bleibt null; zusätzliche
runtimeOwnerObservation benennt ausdrücklich unknown/exitConfirmed=false und
den Beobachtungszeitpunkt. endedAt ist hier die Erkennung des Runtime-Ausfalls,
kein nachgewiesenes Ende eines Kindprozesses. Historie bleibt bytegleich.
Der bisherige terminal_marker bleibt aus Kompatibilitätsgründen erhalten,
gilt aber auch im Altbestand niemals als tatsächlicher Exitbeleg.

Unbestätigte Ownerzustände sperren automatische Wiederaufnahme, Übernahme und
Archiv-Import. Metadaten-Updates eines Actors können die Laufzeitbeobachtung
nicht entfernen oder durch eine behauptete Bestätigung ersetzen. Abwesende
optionale Felder mit undefined bleiben abwesend; null/beschädigte Nachweise
bleiben gesperrt. Keine Prozessbeendigung, erfundener Rückgabecode oder
automatische Wiederholung eines alten Werkzeugs als Wiederherstellungsersatz.
Gezielte native Zustandsabfrage heißt intern readSessionAdmissionMetadata;
Minimalbackends brauchen weiterhin keine zusätzliche listSessions-Implementierung.

p4-runtime-owner-exit **58/58**, anschließend zusätzliche Admission-/Legacy-/
Manipulationsfälle p4-runtime-owner-admission **23/23** bestanden (überlappende
Verträge, nicht als 81 neue unabhängige Fälle zählen). Core-Typprüfung
p4-runtime-owner-types Exit 0. p4-owner-import-guard-contract 2/2 bestanden,
sieben unbetroffene Fälle übersprungen; p4-runtime-owner-build Exit 0.
Die technische Kaltstartklärung alter unbekannter Prozesse bleibt offen; die
neue Sperre allein erfüllt sie noch nicht. Zusätzlich im bestehenden Android-
Dashboard nachgewiesen: agent-events setzt content_end ohne Fehler pauschal auf
completed und ended ebenfalls auf completed. Dieser gemeinsame UI-Pfad muss
nun denselben tatsächlichen Prozessbeleg wie die VS-Code-Ansicht verwenden.
Die abgeschlossenen echten Sleeps und ursprünglichen Terminalpatches bleiben
erhalten; keine pauschale Wiederholung.

### Derselbe Prozessbeleg für VS Code und Android-Dashboard

Auf 7c1390f7b fortgesetzt. p4-browser-process-state-red: neun neue tatsächliche
Fehler (3/12 bestanden einschließlich zweier unveränderter Fehlerweiterleitungs-
Fälle). Dashboard machte bisher content_end ohne error zu completed, selbst
für laufende/ungeklärte Prozesse und JSON-Text mit falscher Erfolgsmeldung;
ended überschrieb auch bekannte Sessionfehler als completed.

Die vorhandene reine VS-Code-Auswertung wurde in das browserfähige Shared-
Paket verschoben, keine zweite Prozessüberwachung und kein neuer Speicher.
Beide Oberflächen verwenden dieselbe Validierung numerischer Exits, Signale,
Abbruchsbestätigung und Beobachtungsfehler. Direkte Werkzeugrückgabe, laufende
Ausführung und Session-/Runtime-Ende bleiben getrennt. Dashboard-Badges zeigen
den tatsächlichen Prozessstatus; pending/success:false wird nicht pauschal als
Prozessfehler oder Abschluss umgedeutet. Turn ended ersetzt die pauschale
Done-Anzeige, ohne die kanonische Historie umzuschreiben.

Historische Running-Einträge beweisen keine heutige Lebendigkeit. Der bereits
geschützte Runtime-Journalstand kann dieselbe UI-Zeile später durch passenden
Exitbeleg aktualisieren, auch wenn ein älterer Tool-Return danach eintrifft.
Eindeutig zugeordnete neue Live-Beobachtungen dürfen Unknown aktualisieren;
bestätigte Terminalbelege werden nie durch späteres Running überschrieben.
Verbindungsausfall setzt laufende Beobachtung auf unbekannt, auch bei verspätet
ausgewerteten React-Updates. Ein reiner JSON-stdout-Text bleibt Ausgabe.

p4-browser-process-projection 24/24 bestanden; nach ergänztem Snapshot-Forwarding
p4-browser-observation-final 16/16 bestanden (überlappend, History-Suite nicht
erneut ausgeführt). p4-browser-observation-live 4/4 bestanden einschließlich
tatsächlicher Live-Aktualisierung und Rückstufung bei Verbindungsverlust.
Ein vorheriger einzelner Disconnect-Fall prüfte noch keinen vorher bestätigten
Running-Zustand; neue positive Vorbedingung ergänzt, kein stärkerer Nachweis aus
dem früheren 1/1-Lauf behauptet. Das bleiben Source-/UI-Komponentenfälle;
physisches Android und produktives Modell sind damit noch nicht abgenommen.

p4-vscode-shared-command-contracts 189/189 bestanden. SDK-Builds
p4-shared-command-projection-build und nach ergänztem Live-Verhalten
p4-shared-command-live-build Exit 0. Shared-Browser-Exportvertrag
p4-shared-browser-contract 1/1 bestanden. Browser-Server-Typprüfung fand zwei
falsche Unionzugriffe in neuen Testhilfen; explizite Ausgabe-Erwartungen
korrigiert. Browser-Webview-Typprüfung fand einen echten fehlenden optionalen
Cache-Guard, der bei noch nicht ausgewählter Session auch zur Laufzeit hätte
scheitern können; korrigiert. p4-browser-projection-types-fixed,
p4-browser-projection-web-types-fixed und p4-vscode-browser-command-types Exit 0.
Beide Webviews erfolgreich in vorhandene private Testdatenverzeichnisse
gebündelt: p4-browser-command-bundle / p4-vscode-command-bundle; kein produktives
Bundle überschrieben. Ergänzter Disconnect-Guard inklusive Typprüfung/Bundle:
p4-browser-command-build-disconnect Exit 0. Dashboard meldet nur bestehende
Chunkgrößenwarnung, kein verdeckter Buildfehler.

Testauswahllücke beim Abschluss erkannt: p4-vscode-live-command-projection
führte nur die sechs Coordinator-Fälle aus. shared/command-execution.test.ts
war im bisherigen Vitest-include nicht enthalten; auch im 189er-Lauf war diese
angegebene Datei nicht ausgeführt. Die tatsächlich bestandenen 189/6 Fälle
bleiben gültig, beweisen aber nicht die ausgelassene Testdatei. Explizites
include ergänzt; p4-vscode-command-discovery **13/13** bestanden. JSON-Bericht
zusätzlich auf tatsächlich ausgeführte Datei und 13 Assertions geprüft. Kein
0-Test-Erfolg oder nachträglich erfundener Lauf. Diese Lücke ist damit geschlossen.

Offen bleiben technische Kaltstartklärung ungeklärter Altprozesse, vollständige
Altbestands-/Workspace-Anbindung, Browser-Recallbedienung und reale Geräte-/
Dienste-/Modellabnahme. Keine produktive Migration, Installation, Dienst-
oder Modellumstellung und keine erneute Sleep-Messserie.

### Recall-Bedienung im vorhandenen gemeinsamen Browser

Auf 76e62576e fortgesetzt. Der vorhandene HubRecallClient ist jetzt der eine
RPC-Vertrag für App-Adapter und HubRuntimeHost; ClineCore.recall.list/read/restore
delegiert ausschließlich an die ausgewählte owning Runtime. Kein lokaler
Ersatzspeicher oder Browser-eigener Modellchat. VS-Code-Adapter behält seinen
temporären Client und schließt ihn nach jeder Operation, verwendet aber dieselbe
Antwortprüfung wie der Browser. Restore bleibt ohne automatische Wiederholung.

Das vorhandene Dashboard bietet nach bestätigtem Actor-Login einen Recall-
Bereich zum Listen, Lesen und Bereitstellen gespeicherter Sitzungen. Server
bindet eine geprüfte Auswahl an Actor/Verbindung und letzte Auswahlgeneration;
Journalgrenze kommt aus dem serverseitigen Read, nicht aus dem Browserframe.
Actorwechsel und später eintreffende alte Reads verwerfen die frühere Auswahl.
Eine noch laufende Anfrage darf nicht durch den Import einer anderen Sitzung
ersetzt werden. Nach Bestätigung öffnet das Dashboard dieselbe Session-ID über
seinen vorhandenen Chat-/Attach-Pfad. Es erteilt dabei kein Schreibrecht und
startet keinen Prozess; vorhandene Übernehmen-/Freigeben-Steuerung bleibt nötig.
Originale Nachrichten und Urheber erscheinen als Text, nicht als ausführbares HTML.

p4-browser-recall-binding **12/12** bestanden: neue Framebindung und bestehende
Actor-Verträge, kein Observer-Schreibfallback, kein Restore vor Inspektion,
Actorwechsel und verspätete Auswahl. p4-recall-core-facade-wire **1/1**
bestanden, vier unbetroffene Fälle übersprungen: tatsächliche ClineCore-Fassade,
authentifizierte lokale WebSockets und File-Persistenz, Lesen/Import unter jimmi,
gleiche Session-ID und beide Originalurheber, kein neu gestarteter Agent.
Recall-HTTP und Modell bleiben Fixtures. App-Vertrag mit derselben tatsächlichen
Core-RPC-Klasse p4-recall-client-shared-contract **3/3** bestanden.

p4-recall-facade-core-build, p4-recall-facade-types, p4-browser-recall-types
und p4-browser-recall-web-types Exit 0. Neuer UI-Lint verlangte output statt
p role=status; gezielt korrigiert. Keine produktive Konfiguration, Schlüssel,
Dienste oder Ports verändert. Browserbundle p4-browser-recall-bundle Exit 0
im vorhandenen privaten Prüfroot. App-Typprüfung p4-recall-facade-app-types
fand eine verletzte Paketgrenze der neuen Testhilfe: direkter SDK-Source-Import
zog Source außerhalb des App-rootDir in die Prüfung. Der veröffentlichte
Paketvertrag wird jetzt über importOriginal verwendet. Zwischenversuch mit
dist/Leaf-JS konnte nicht laden (nur Leaf-d.ts vorhanden; 0 Tests, Exit 1).
p4-recall-client-public-package 3/3 mit tatsächlichem kompilierten Hub-Export
bestanden; keine selbst nachgebaute RPC-Mockimplementierung. Typprüfung der
Dist-Grenze p4-recall-facade-app-types-boundary Exit 0; abschließender öffentlicher
Paketimport p4-recall-facade-app-public-types ebenfalls Exit 0. Physisches Android, produktiver Recall-Import
und Modell-/Diensteabnahme bleiben ausdrücklich offen.

### Modellwechsel bleibt nach Sitzungsende und Wiederaufnahme erhalten

Auf 7b2e5773d fortgesetzt, gezielt wegen des angekündigten Modellwechsels.
p4-model-selection-persistence-red reproduziert zweimal den tatsächlichen
Fehler: nach updateSessionConnection war das Manifest neu, File-/SQLite-Index
aber weiterhin initial-model (0/2 bestanden). Die bisherige reine Manifest-
Aktualisierung konnte beim späteren get/Archivabschluss alte Auswahl melden.

Die vorhandenen Adapter aktualisieren jetzt Provider-/Modellfelder mit ihrer
bestehenden Statusrevision. Native updateSessionConnectionSelection schreibt
die Modelldaten und ein atomar ersetztes Manifest; Metadaten, historische
Nachrichten und Verbindungsgeheimnisse bleiben separat. Bei simuliertem
Manifestfehler wird nur die eigene Indexrevision bedingt zurückgenommen;
geänderte fremde Revisionen werden nicht überschrieben und kein Erfolg bestätigt.
Das ist keine behauptete atomare Transaktion über DB und Dateisystem bei
Stromausfall. Die aktive Verbindung wird erst nach erfolgreicher Speicherung
geändert; Runtime-Snapshot informiert anschließend auch andere Clients.
Neuere Titel-/Checkpoint-/Werkzeugmetadaten werden aus dem aktuellen Manifest
übernommen, keine Rückkehr zu einer älteren in-memory Kopie.

p4-model-selection-persistence 2/2 bestanden. Danach mit gezieltem Fehlerpfad:
p4-model-selection-rollback **125/125** bestanden einschließlich bestehender
Host-/Persistenzverträge. Die beiden neuen echten File-/SQLite-Fälle prüfen
fehlgeschlagenen Commit ohne Agent-Update, unveränderte Manifestbytes und alte
aktive Auswahl, dann erfolgreiche neue Auswahl in Index/Manifest, Sitzungsausgang
und frische Runtime mit neuer Kennung. Transkriptbytes, Friseer-Urheber und alte
Nachrichten-Modellkennung bleiben identisch. Kein produktiver Modellaufruf.

Der vorhandene Minimal-Mock-Test für Modell-/Metadatenerhalt verwendet jetzt
echte File-Persistenz und die tatsächliche metadata.title-Struktur; zuvor enthielt
sein Fake ein nicht zum Manifestschema gehörendes top-level title. Seine
beabsichtigte Titel-/Compaction-Erhaltprüfung bleibt erhalten und wird stärker
belegt. Thinking-only Update schreibt weiterhin keine Modelldatei.
p4-model-selection-types und abschließender p4-model-selection-build Exit 0.
Keine Änderung produktiver Modellkennung, Parameterzahl, API-Endpunkte, Router
oder Acer-Dienste. Alle Modellnamen der neuen Tests sind ausdrücklich Fixtures.

### Ausgewählte gemeinsame Runtime wird bei Fehlern nicht lokal ersetzt

Auf 14fa6cef8 fortgesetzt. p4-explicit-runtime-recovery-red reproduziert zwei
zusätzliche Aufrufe: generische Transport-Recovery konnte einen lokal gemerkten
Hub ersetzen; die session.create-Timeout-Recovery konnte auch beim Remote-Host
einen lokalen Hub neu starten und das Create wiederholen. Beide neuen Fälle
scheiterten am bisherigen Verhalten (0/2, 88 unbetroffene übersprungen).

RemoteRuntimeHost deaktiviert jetzt beide lokalen Recovery-Ebenen. Der explizite
VS-Code-Recall-Client ebenso. Die Runtime-Fabrik übernimmt das auch für explizite
hub-Endpunkte. p4-explicit-runtime-recovery 105/105 bestanden, einschließlich
bestehender lokaler Recovery und unveränderter Nicht-Wiederholung unsicher
übertragener Schreibbefehle. Gleicher-Endpunkt-Reconnect bleibt erhalten.

Ergänzender tatsächlicher Fehler in auto-Auflösung: sowohl nicht auflösbarer
expliziter Endpunkt als auch dessen Connectfehler führten zu einer getrennten
lokalen Runtime. p4-explicit-runtime-auto-red 0/2 (14 übersprungen) reproduziert;
beide Pfade brechen jetzt mit Fehler ab, ohne lokalen Backendstart oder Prewarm.
p4-explicit-runtime-auto 16/16 bestanden. Der frühere Test prüfte nur fehlendes
Prewarm und erlaubte daneben den unerwünschten lokalen Backendstart; seine
Prüfung ist nun auf ausdrücklich abgewiesene Ersetzung erweitert.

p4-explicit-runtime-types und p4-explicit-runtime-core-build Exit 0.
p4-explicit-runtime-app 13/13, p4-explicit-runtime-app-types Exit 0. Keine produktive
Runtime gestartet, ersetzt oder neu gestartet; keine Endpunkte verändert.

### Ältere Hub-Antworten erfinden weder Abschluss noch Exitcode

Auf c749f9a77 fortgesetzt. p4-legacy-lifecycle-red: 2/8 bestanden, sechs Fehler
belegen idle→completed, pending→running, künstliches exitCode 0/1 bei completed/
failed sowie fehlende/ungültige Statusangabe→running. 45 unbetroffene übersprungen.
Die Legacy-Projektion bewahrt nun idle/running/pending getrennt, schreibt für
nichtterminale Sitzungen kein endedAt und leitet keinen Prozess-Exitcode aus
einem Sitzungslabel ab. Fehlender/unbekannter Status wird zurückgewiesen.
Bestätigte vollständige Snapshots behalten ihre tatsächlichen Exitdaten.

p4-legacy-lifecycle 53/53 bestanden, einschließlich vorheriger vollständiger
Snapshot-/Runtimeverträge; p4-legacy-lifecycle-types Exit 0. Keine erneute
Sleep-Messreihe und kein Eingriff in produktive Prozesse. SDK-Bundle wird mit
dem nächsten geprüften Core-Schritt aktualisiert; diese Tests laufen am Source.

### Ruhende alte Sitzungen behalten ihren Zustand bei PID-Abgleich

Auf 40e14dba9 fortgesetzt. p4-idle-owner-reconcile-red 0/2 (zwei bestehende
Fälle übersprungen) belegt die nachträgliche failed-Markierung regulärer
File-/SQLite-idle-Sitzungen allein wegen ihrer historischen PID. Der Abgleich
untersucht jetzt running/pending und prüft vor dem bedingten Schreibzugriff
erneut den aktuellen Zustand und die aktuelle PID. Eine zwischen Scan und Read
ruhend gewordene Sitzung bleibt erhalten. Vorhandene unbekannte Werkzeugzustände
werden nicht aufgehoben; eine solche idle-Sitzung bleibt gegen Resume gesperrt.

Erster Gesamtlauf p4-idle-owner-reconcile 24/26: der zusätzliche Übergangstest
zeigte noch einen falschen Rückgabewert des Abgleichzählers. Er zählte den vom
anderen Schreiber bewirkten Wechsel nach idle als eigene Reparatur. Die private
Methode meldet jetzt ausdrücklich nur ihren tatsächlichen Schreibabschluss,
statt aus einem beliebigen später gelesenen Zeilenstatus eine Änderung abzuleiten.
p4-idle-owner-reconcile-count **26/26** bestanden. Beide nativen Backends prüfen
jeweils unveränderte Manifest-/Nachrichtenbytes, Friseer-Urheber, Resume mit
gespeichertem austauschbarem Modell, den Zustandswechsel während des Abgleichs
und verweigerte Wiederholung einer unbestätigten Werkzeugausführung.
p4-idle-owner-types und p4-idle-owner-core-build Exit 0; damit ist auch das
vorherige Legacy-Status-Bundle aktualisiert. Tatsächlich verlorene running-
Owner behalten unbekannten Ausgang ohne künstlichen Exitcode.

Die lesende Acer-Integrationsvorprüfung bleibt im bestehenden Prüfroot:
p4-acer-model-request-caps.json / p4-acer-model-request-contract.json. Quellhashes
der beiden bestätigten Anwendungen sind gegenüber dem früheren Befund gleich.
Der bestehende Learning-Agent-ChatRequest hat kein max_tokens/max_completion_tokens-
Feld; sein Handler setzt beim Backendaufruf keine entsprechende Antwortbegrenzung
und fordert intern stream=false an. Das ist kein Nachweis echter Tokenstream-
oder Längenbegrenzungsunterstützung. Der Coding-Agent verwendet seinen bestehenden
Proxy mit nativer Adapterroute. Vor einem begrenzten echten Modelltest ist deren
Request-Konvertierung gezielt zu prüfen. Keine neue Modellgeneration ausgelöst,
keine produktive Quelldatei oder Konfiguration verändert, keine Secrets ausgegeben.

### Exklusive normale Sitzungserstellung und frühe Pfadgrenze

Auf e69abca2c fortgesetzt. p4-native-creation-default-red 7/12 bestanden,
fünf Fehler: ohne ifAbsent war weiterhin upsert mit leerem Nachrichtentranskript
möglich; beide gleichzeitigen Ersteller erhielten Erfolg, bestehende Symlinks
wurden angenommen. Der vorher bereits geprüfte explizite Recall-Schutz bleibt
erhalten und gilt jetzt für jede native Root-Erstellung. Vorhandene Verzeichnisse,
Indexzeilen, Nachrichten, Metadaten und Symlinks werden nicht ersetzt.
Der alte ifAbsent-Hinweis erlaubt auch mit false keinen Ersatz alter Historie.

p4-native-creation-default 169/171 zeigte zwei Folgeprüfungen: ein bisheriger
Grenztest erzeugte selbst über die API eine unsichere ../-ID; er prüft jetzt die
frühe Ablehnung und zusätzlich manuell angelegte externe Altdateien gegen
Löschung. Der bestehende Drittformat-Importer musste eine eigene Reservierung
von einer ID-Kollision unterscheiden, sonst hätte sein alter pauschaler
Fehler-Cleanup einen bereits vorhandenen Zielverlauf gelöscht. Eine interne
onReserved-Quittung nach exklusiver Index-/Verzeichnisreservierung erhält die
bisherige Rücknahme auch bei anschließendem Dateifehler, ohne Kollisionen zu
löschen. Zusätzlicher realer SQLite-Kollisionstest erhält Bytes und Urheber.
p4-native-creation-ownership **172/172** bestanden. Keine fremden Projekte
oder realen Drittformat-Verläufe untersucht; sämtliche Importquellen sind Fixtures.

p4-native-early-id-red 0/6 (103 übersprungen) belegt die fehlende frühe Prüfung
im lokalen Runtime-Start. Die vorhandene ID-Prüfung ist in die gemeinsame
Artifact-Hilfe verschoben und wird vor Start/Resume/Runtime-Aufbau sowie nativer
Erstellung und Recall-Import verwendet. Keine parallelen Speicherkomponenten.
p4-native-creation-boundaries **178/178** bestanden, p4-native-creation-types
und p4-native-creation-core-build Exit 0. Geprüft sind insbesondere Rücknahme
eigener Teilanlagen, Wiederholung ohne Überschreiben, ID-Kollisionen, Symlinks,
relative Pfade und Abbruch vor Agent-/Runtime-Erstellung bei ungültiger ID.

Weiterer konkreter Acer-Vertragsbefund ohne Modellgenerierung:
p4-acer-coding-token-limit-reproduction.json führt ausschließlich die tatsächliche
reine native_request-Funktion des installierten Coding-Adapters mit Testobjekten
aus. Sowohl max_tokens=8 als auch max_completion_tokens=8 verschwinden aus dem
Backendpayload (num_predict fehlt). Modellkennung und stream bleiben erhalten.
Die Modulquelle ist SHA256 cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81.
Keine produktive Adapterkorrektur oder Modellanfrage ausgeführt; dies ist ein
belegter offener Integrationsfehler, keine vorgetäuschte produktive Abnahme.

### Auch native Anlage behält unbekannten Exit statt künstlicher Null

Auf b555c6e0b fortgesetzt. p4-native-unknown-exit-red 0/4 (12 übersprungen)
reproduziert fehlende/null Exitangabe→0 selbst bei status=failed in File und
SQLite. Native Anlage übernimmt jetzt nur einen ausdrücklich übergebenen Code;
unbekannter Ausgang bleibt im Index null und im Manifest ohne numerische Angabe.
Explizite Codes bleiben unverändert. p4-native-unknown-exit **64/64** bestanden
einschließlich bestehender Persistenz-/Importerfälle; p4-native-unknown-exit-build
Exit 0. Kein behaupteter Prozessabschluss durch einen Sitzungslabel-Default.

### Geprüfter Integrationspatch für angeforderte Tokenbegrenzung, noch nicht produktiv

Auf 593628158 fortgesetzt. Der bestehende Acer-Adapter verliert nachgewiesen
beide OpenAI-Längenparameter, obwohl der restliche Request unverändert geroutet
wird. sdk/scripts/netaigis-coding-agent-token-limit.patch ergänzt ausschließlich
deren Übersetzung nach options.num_predict. Ohne angeforderte Grenze ist das
Payload unverändert. Ungültige oder widersprüchliche Grenzen werden ausdrücklich
abgelehnt; keine Modell-, Endpunkt-, Kontextgrößen- oder Dienstidentität geändert.
Patch-SHA256: 4607e260ddd664af584d8097cb4ba7e8f7214e0ac6b82760ab706d169b697be9.

p4-coding-agent-token-limit-staged **7/7 Python-Unittests** bestanden. Die neue
Testdatei im selben sdk/scripts-Verzeichnis verwendet die bereits zugelassene
gezielte native_request-Extraktion, prüft deren Funktionshash und den belegten
Modulhash. Die tatsächliche Patch-Anwendung erfolgt mit fuzz=0 auf der isolierten
Funktion mit erhaltenem Zeilenversatz. Getestet: beide Parameter, ungültige Werte,
übereinstimmende/widersprüchliche Doppelangaben, unveränderte Modell-/Stream-/
Kontextwahl und Eingabedaten, bytegenaue Rücknahme dieser Funktion sowie
zurückgewiesene Zweitanwendung ohne Dateiänderung. Kein vollständiger Modul-
Rollback oder produktiver HTTP-/Modelltest wird daraus behauptet.

Die automatische Freigabeprüfung hat das zusätzliche vollständige unredigierte
Lesen/Kopieren des privaten Acer-Moduls in lokale Prüflogs abgelehnt: mehr
potenziell sensible Quelldaten als für den Nachweis erforderlich. Dieser Schritt
wurde nicht ausgeführt und nicht umgangen. Die vorhandene gezielte Extraktion
genügt für den obigen lokalen Patchnachweis; keine erneute Vollkopie angefordert.

Vor tatsächlicher Anwendung erforderlich und noch NICHT freigegeben/ausgeführt:
erneuter exakter Modulhashabgleich auf Acer, zugriffsgeschützte Sicherung und
vollständige Wiederherstellungsprobe des betroffenen Moduls auf Acer, Erhalt
seiner bestehenden Eigentümer-/Berechtigungswerte, exakte Patch-Vorprüfung am
vollständigen Modul und gesondert freigegebene ruhende Wartungsphase für einen
gezielten Coding-Agent-Neustart. Learning-Agent, Recall, Modellrouter und Modell
werden dadurch nicht geändert. Bei abweichendem Hash, fehlendem Rollback oder
aktiver Arbeit keine Anwendung. Der vorhandene unprivilegierte SSH-Zugang allein
belegt keine Berechtigung für diese produktiven Eingriffe. Test der tatsächlichen
Backendbegrenzung und reale VS-Code-/Android-Abnahme bleiben offen.

### Lokaler Einstieg nimmt denselben gespeicherten Stand wieder auf

Auf 23ba39e32 fortgesetzt. p4-local-canonical-admission-red 0/2 reproduziert in
echten File-/SQLite-Speichern: start mit bestehender ID akzeptierte einen alten
Client-Verlauf, alte Modellwahl und Client-Metadaten statt des gespeicherten
Standes. Derselbe Einstieg konnte eine residente ruhende Agentinstanz ersetzen.
Start bindet bestehende residente Sitzungen jetzt wieder an und delegiert für
vorhandene native Manifeste an den schon vorhandenen kanonischen Resume-Pfad.
Neue Prompts werden dort nicht als neuer Start derselben ID angenommen; Resume
und Eingabe bleiben getrennt. Keine Kopie in einen neuen Verlauf und kein neuer
Speicherpfad. Die Friseer/jimmi-Testautoren bleiben unverändert.
Fehlende/ungültige Transkripte und unbestätigte Prozesszustände führen zum Fehler
vor Agentanlage. Abweichende gespeicherte Session-ID wird zurückgewiesen.

p4-local-canonical-admission 111/117: die zwei neuen nativen Fälle sind grün.
Sechs ältere Testaufbauten enthielten vorgetäuschte gespeicherte Sitzungen ohne
Datei bzw. mit running-Status, obwohl sie ruhende Historie prüfen sollten, oder
meldeten ein Manifest bereits vor ihrer simulierten frischen Erstellung zurück.
Sie erzeugen jetzt private echte Nachrichtendateien, bestätigen passende
interaktive/historische Zustände und geben neue Manifeste erst nach Erstellung
zurück. Die Alt-Resume-Metadatenprüfung erwartet nun den gespeicherten Titel
anstelle des veralteten Client-Titels; spätere explizite Metadatenänderungen
haben weiterhin ihren eigenen API-Pfad. Kein Test entfernt oder übersprungen.

p4-local-canonical-admission-fixtures 116/117 deckte zusätzlich einen echten
Origin-Mergefehler beim expliziten Wechsel des Auftragsmodus auf: der alte
Import-trigger blieb am neuen Modus hängen. Die vorhandene ausdrückliche
Modusentscheidung ersetzt jetzt die Origin-Struktur vollständig; gewöhnliches
Resume erhält die gespeicherte Herkunft. Der Komprimierungstest lädt seinen
vorhandenen Sidecar über die Backend-Antwort statt ihn nur im Client mitzugeben.

Erste Typprüfung p4-local-canonical-types Exit 2: die neuen bereits ausgeführten
Unknown-Exit-Fälle benutzten null, das bisher im Anlage-Eingabetyp fehlte, obwohl
Persistenz und Laufzeit dies unterstützen. Der Eingangstyp lässt null jetzt
ausdrücklich zu. p4-local-canonical-types-final Exit 0.
p4-local-canonical-admission-final **133/133** bestanden einschließlich
Unverändertheit von Transkriptbytes, beiden Urhebern, Auftrag/Korrektur, Modell,
Checkpoint-Metadaten, Wiederanbindung ohne Agentersatz und verweigerter Ersetzung
bei kaputtem gespeicherten Transkript. p4-local-canonical-build-final Exit 0.
p4-local-canonical-vscode **29/29** bestanden gegen das aktualisierte Core-Bundle;
dies sind Adapter-/Fixturetests, keine reale Geräteabnahme. Originalbranch und
Originalarbeitsstand erneut nur auf Unverändertheit geprüft: coding-agent-v4
weiter 624c2cd6661e100680d8b61daa3a3447f4708536, Status-SHA256 mit allen
unversionierten Dateien unverändert aff4aedbf69ef2f24960a735b51663df55a0a961ef0d2fb8e910293e010c9fbb.

### Fehlgeschlagene Übernahme von Anfangshistorie ist kein erfolgreicher Start

Auf 8fb742c6e fortgesetzt. p4-initial-history-failure-red 0/2 (zwei bestehende
übersprungen) reproduziert in File und SQLite: ein fehlgeschlagener initialer
Transkript-Schreibzugriff wurde nur geloggt und start bestätigte trotzdem Erfolg.
Initialhistorie verwendet nun die vorhandene geschützte Import-Zwischenstufe mit
source.kind=initial-history; keine neue Datenbank, Outbox oder Speicherarchitektur.
Ein Start bestätigt erst nach erfolgreichem Schreiben und Freigeben der Historie.
Bei Fehler werden nur neu erzeugter Agent, Runtime und Sandbox freigegeben;
die ursprüngliche Fehlermeldung bleibt erhalten. Keine Ziel- oder Quelldateien
gelöscht, keine Modellturns und kein künstlicher Completed-/Exitcode-Abschluss.
Unvollständige Ziele bleiben inspizierbar und gegen Start/Resume/Schreibübergabe
gesperrt. Das ist keine behauptete automatische Reparatur eines IO-Fehlers.

p4-initial-history-failure und p4-initial-history-publication jeweils 107/113:
die neuen nativen Fehlerfälle bestanden; sechs eng begrenzte Mock-Backends
kannten die erforderliche Freigabequittung noch nicht. Sie geben jetzt diesen
API-Vertrag zurück; keine Assertion entfernt oder übersprungen. Native Freigabe
ist zusätzlich mit tatsächlichen File-/SQLite-Speichern geprüft, nicht aus
Mock-Erfolgen abgeleitet. p4-initial-history-publication-contract 140/140 bestanden.
Die endgültige Freigabe schreibt zuerst atomar das Manifest und danach die
Indexrevision. Ein absichtlich fehlendes Index-Ack lässt den Index gesperrt,
auch wenn das Manifest bereits vollständig geschrieben ist; kaltes Resume
bleibt dann vor Agentanlage blockiert.

p4-initial-history-integrity-red 0/2 (sechs übersprungen) zeigte zusätzlich:
eine zwischen Schreiben und Freigabe durch Symlink oder andere gleich lange
Historie ersetzte Datei hätte die Freigabe passieren können. Der vorhandene
ManifestStore führt jetzt ausschließlich für initiale Zwischenstufen eine
flüchtige Schreibquittung mit SHA256 von akzeptierter Eingabe und tatsächlich
geschriebenen Bytes. Eigener reservierter Pfad, Identität, Symlinks und geänderte
Bytes werden vor Freigabe geprüft. Die Quittung wird danach entfernt. Vorige
vollständige Import-Herkunft wird bei normalem Abschluss wiederhergestellt;
der vorübergehende Marker bleibt nicht als neue erfundene Historie zurück.

p4-initial-history-integrity zunächst 161/162: der echte Agent-Startup-Fall ohne
Nachrichten-IDs machte die bestehende Normalisierung sichtbar. Der Native-Wrapper
übergibt jetzt die lazily berechnete Eingabequittung vor dieser Normalisierung;
Dateiquittung bleibt an den tatsächlich geschriebenen normalisierten Bytes.
Keine Abschwächung des Hashvergleichs und kein zusätzlicher Hashaufwand bei
gewöhnlichen späteren Nachrichtenwrites. Initiale JSON-Daten werden vor den
asynchronen Schreibschritten separat eingefroren. p4-initial-history-integrity-final
**162/162** bestanden, p4-initial-history-types und p4-initial-history-core-build
Exit 0. p4-initial-history-shared-contract **9/9** bestanden über tatsächliche
lokale WebSocket-Transporte (Resume, Recall-Recovery/Archivierung, gegenseitige
Live-Übernahme und Actor-Bindung). Recall-HTTP und Agenten bleiben Fixtures;
kein Acer-/Android-/Modelllauf wird daraus abgeleitet. Authentifizierte Remote-
Neuanlage lehnt fremde initialMessages weiterhin mit session_import_required ab;
der vorhandene Import-/Provenienzvertrag wurde nicht aufgeweicht.

### Dieselben Nachrichten-IDs im tatsächlichen Agenten und im Speicher

Auf 7445b6384 fortgesetzt. p4-real-agent-initial-identities 0/2 (acht
übersprungen) reproduziert mit tatsächlichem Agenten und File-/SQLite-Speicher:
Nachrichten ohne ID blieben im Agenten ohne ID, während die Dateinormalisierung
neue IDs erzeugte. Der neue Test sperrt global fetch gegen jeden Modell-/Provider-
Request; keine Modellgenerierung oder Cloudanmeldung. Das Provider-/Modellpaar
des Testaufbaus ist ausdrücklich eine Fixture mit unerreichbarem Loopback-Ziel.

Fehlende IDs werden nun nur bei frischer Anfangshistorie vor Agentanlage einmal
vergeben. p4-real-agent-initial-identities-fixed 116/119 zeigte den noch alten
Bootstrap-Eingang: der Agent erhielt weiterhin das unveränderte ursprüngliche
Array. Der gemeinsame Bootstrap erhält jetzt denselben vorbereiteten Stand wie
die Persistenz. Der bestehende reine Speichermocktest benutzt feste vorhandene
IDs und prüft damit deren Beibehaltung; die neue tatsächliche Agentprüfung
deckt fehlende IDs unabhängig davon ab. Gespeicherte kanonische Historie und
vorhandene IDs werden nicht neu nummeriert, Caller-Eingaben bleiben unverändert.

p4-real-agent-initial-identities-canonical **130/130** bestanden einschließlich
erster Anlage, bytegleichem Transkript nach Shutdown, kalter Wiederaufnahme mit
identischen IDs, vorheriger Modellwechsel-/Initialhistorie-/Recall-Import-Verträge.
Beide echten Agentfälle bestätigten **keinen einzigen fetch-Aufruf**.
p4-real-agent-initial-types und p4-real-agent-initial-build Exit 0.

Gezielte zusätzliche Acer-Vertragsprobe ohne Quellkopie und ohne Modellrequest:
p4-acer-coding-completion-contract.json führt ausschließlich den reinen
completion-Konverter samt direktem Formathelfer im separaten Prüfprozess aus.
Quelle weiter SHA256 cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81.
Synthetisches done_reason=length wird aktuell als finish_reason=stop ausgegeben;
stop bleibt stop. Inhalt, Modellkennung und Tokenzähler bleiben erhalten, ein
zusätzliches synthetisches thinking-Feld wird nicht weitergereicht. Das belegt
die Antwortkonvertierung dieser Quelldatei, nicht den Speicherinhalt des bereits
laufenden Python-Dienstes oder eine DeepSeek-Inkompatibilität. Der bestätigte
Längenabschluss-Fehler erfordert eine weitere gezielte Integrationskorrektur;
produktive Anwendung/HTTP-/Modellabnahme weiter offen. Keine vollständige oder
stückweise Rekonstruktion des privaten Acer-Moduls im lokalen Repository.

### Konkurrierende Start-/Resume-Anfragen teilen dieselbe Anlage

Auf 911d714a8 fortgesetzt. p4-concurrent-session-admission-red 0/2 (zehn
übersprungen) reproduziert denselben Doppelstart in File und SQLite: zwei
Runtime-Konstruktionen für eine Session-ID konkurrierten trotz später exklusiver
Dateianlage. Ein fehlgeschlagener Ersteller konnte die Erreichbarkeit der
anderen Instanz beeinträchtigen. Lokale Start-/Resume-Anfragen teilen nun die
laufende Anlage; erst nach deren bestätigtem Abschluss wird derselbe residente
Agent wieder angebunden. Fehlgeschlagene Anlage wird weitergegeben, nicht als
automatischer zweiter Versuch verschleiert. Keine Änderung am vorhandenen
serverseitigen Writer-/Session-Lock und kein neuer Sitzungsspeicher.

p4-concurrent-session-admission **127/127** bestanden. Ergänzender gezielter
Vertrag p4-concurrent-initial-turn **3/3**, zehn unbetroffene übersprungen:
zweimal konkurrierende Startanlage plus Wiederanbindung während eines noch
ausstehenden ersten Modellturns. Dessen Promise bleibt offen und Status running,
während die zweite Resume-Antwort bereits bestätigt ist; nur ein Agent, kein
Abbruch oder vorzeitiger Completed-Status. Der Turn ist eine kontrollierte
Agent-Fixture, kein neuer echter sleep-/Modellnachweis. Die frühere tatsächliche
Sleep-Messreihe bleibt erhalten und wurde nicht wiederholt.
p4-concurrent-session-types und p4-concurrent-session-build Exit 0.

Zusätzliche gezielte Acer-Prüfung p4-acer-coding-stream-contract.json ohne
Modellaufruf, Dienständerung oder Vollquellkopie: auch sse_stream konvertiert
synthetisches done_reason=length nach finish_reason=stop. Damit betrifft der
bestätigte Fehler den Streamingpfad ebenso wie completion. Inhalt bleibt
erhalten, thinking wird in dieser Quelle nicht durchgereicht. Zur gezielten
Reparatur wurden ausschließlich zwei Protokollausdrücke und ihre AST-Positionen
erfasst, keine vollständigen zusätzlichen Funktionen oder Moduldateien kopiert.
Produktive HTTP-/Modellabnahme und jede produktive Adapteränderung bleiben offen.

### Modellunabhängige Abschlussgründe: geprüfter Acer-Kandidat, noch nicht angewendet

Auf 173d888cb fortgesetzt. Der angekündigte Wechsel auf DeepSeek 4.1 1017B
ist eine Nutzerangabe zum bevorstehenden Betrieb, kein Nachweis eines bereits
geladenen Modells oder seiner Parameterzahl. Keine Modellbindung oder Änderung
der vorhandenen Modellendpunkte und Routingentscheidungen vorgenommen.

sdk/scripts/netaigis-coding-agent-finish-reason.py erzeugt aus dem exakt
belegten Adapterstand einen minimalen Kandidaten: native done_reason=length
bleibt in completion und sse_stream als finish_reason=length erhalten. Sonst
bleibt die bisherige stop/tool_calls-Auswahl erhalten. Die Quelle bleibt
unverändert; Standardaufruf nur lesend, optional ausschließlich neue separate
Kandidatendatei in vorhandenem privatem Verzeichnis mit Modus 0600. Geänderter
Quellhash, abweichende AST-Struktur, Zweitanwendung und Überschreiben scheitern.
p4-coding-finish-reason-synthetic 7/7; nach zusätzlichen CLI-Vertragsprüfungen
p4-coding-finish-reason-cli **10/10 Python-Unittests**, Exit 0. Keine privaten
Modulquellen in diesen Tests und keine Modellaufrufe.

p4-acer-coding-candidate-in-memory.json belegt zusätzlich **10/10** Prüfungen
der tatsächlichen auf Acer gelesenen reinen Adapterfunktionen. Der gesamte
private Quelltext blieb dort im Speicher und wurde weder übertragen noch als
Kandidat gespeichert. Getestet: completion/SSE jeweils stop und length mit/ohne
Toolcalls sowie beide Tokenlimit-Felder. Modellwahl, dynamischer Kontext und
Streamwahl bleiben erhalten. Datei auf Acer nach Prüfung bytegleich;
kein Dienstimport mit Seiteneffekten, HTTP-Aufruf, Neustart oder Modellwechsel.

Quell-SHA256: cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81.
Nur Abschlusskorrektur: c8d16b51b0d9ab8a71c11187812204d8470ee236b6e6dfa44af0554b663015f3.
Kombinations-SHA256: 307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9.
Reihenfolge für eine spätere geprüfte Anwendung: zuerst der auf den Originalhash
festgelegte Finish-Rewriter, dann der vorhandene Tokenlimit-Patch mit fuzz=0.
Dies ist keine vollständige Dateisystem-Wiederherstellungsprobe und kein Beleg
über den im bereits laufenden Dienst geladenen Python-Code. Die zuvor genannten
produktiven Sicherungs-/Rollback-/Freigabevoraussetzungen gelten unverändert.

### Unbelegter alter Terminaltext gibt keine Schreibzuständigkeit frei

Auf 978b9d7b5 fortgesetzt. p4-legacy-command-admission-red **10/19**, neun neue
Fehler reproduziert: nicht parsebarer Alttext, leere Ergebnisse, fehlender
Prozessnachweis, failed ohne Exitcode, terminated ohne Signal und unbekannte
Statusbezeichnungen konnten als erledigt gelten. Der gemeinsame Core-Prüfpfad
für Kaltstart, Recall-Wiederaufnahme und Schreibübergabe verlangt jetzt einen
bestätigten Abschluss oder ein ausdrückliches not_started ohne PID. Fehlgeschlagene
Beobachtung hebt einen scheinbar numerischen Abschluss nicht auf. Passende
geschützte Journalbelege dürfen einen alten Rückgabetext auflösen; ein anderer
Toolcall darf das nicht. Keine Interpretation von stdout als Prozessbeweis,
keine künstlichen Exitcodes und keine Veränderung der alten Historie.

p4-legacy-command-admission **54/55**: die neuen Nachweisfälle bestanden;
der bestehende reale Kindprozess-/Journaltest überschritt in der Prozess-Sandbox
20 Sekunden. Der gezielte Lauf außerhalb dieser Sandbox
p4-legacy-command-journal-host **1/1** bestand, ohne Timeränderung. Die erste
Zeitüberschreitung bleibt dokumentiert; eine genauere Ursache wird daraus nicht
behauptet. p4-legacy-command-native-contract **71/71** bestanden: einschließlich
tatsächlicher File-/SQLite-Kaltstarts vor Agentanlage, unveränderter Transkript-
und Manifestbytes, verweigerter und nach passendem Exit zugelassener Friseer→jimmi-
Übergabe sowie nicht schreibbar angebotener Recall-Althistorie. Das sind gezielte
Regressionen, keine produktive Geräteabnahme. p4-legacy-command-types und
p4-legacy-command-build jeweils Exit 0. Die bereits abgeschlossene echte
Sleep-Messreihe wurde nicht wiederholt. Nicht belegte historische Prozesse
bleiben lesbar, ihre technische Klärung bleibt für sichere Schreibaufnahme offen.

### Vorbereitete privilegierte Adapter-Wiederherstellungsprüfung

Lesende Berechtigungsprüfung: /opt/netaigis-coding-agent/ollama_adapter.py
gehört uid/gid 0:0, Modus 0644, für friseer lesbar und nicht schreibbar;
sudo -n true nicht verfügbar. Keine Rechte, Dateien oder Dienste verändert.

sdk/scripts/netaigis-coding-agent-adapter-preflight.py bereitet ausschließlich
die für den nachgewiesenen Adapterfehler notwendige neue Einzelsicherung vor.
Keine Wiederholung der Phase-2-Sicherungen. Quelle bleibt auf Acer, exakter
Quellhash wird vorab geprüft. Vorhandener privater Root-Phase-2-Ordner muss
existieren; einziger neuer Unterordner phase4-ollama-adapter-preflight wird
exklusiv angelegt, vorhandene oder unvollständige Nachweise niemals ersetzt.
Archiv 0600 mit ACL/xattrs, tatsächliches Entpacken im getrennten restore-probe,
Vergleich von Bytes, uid/gid, Modus, mtime und xattrs sowie SHA256-Neulesen von
Archiv, Wiederherstellung und Manifest. Geänderte Quelle, kaputte Wiederherstellung
oder Archivfehler veröffentlichen keinen Erfolgsnachweis. Kein Zurückschreiben
in /opt, keine Dienststeuerung und keine Modellabfrage.

p4-adapter-preflight-fixture 5/5; nach zusätzlichen Fehlerfällen und Manifest-
Prüfsumme p4-adapter-preflight-failures **7/7** bestanden, mit echtem tar auf
lokalen privaten Fixtures. Das ist noch keine tatsächliche Acer-Sicherung.

Für den Betreiber: folgenden Befehl in einem Terminal auf 440G5suse ausführen.
Er liest nur das öffentliche Prüfschema aus dem Reparatur-Worktree und führt es
auf Acer mit sudo aus. Ein benötigtes Passwort ausschließlich dort im Terminal
eingeben, niemals im Chat. Ausgabe enthält nur Nachweispfade/Prüfsummen/Flags.

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, shlex, subprocess
source = Path('/home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-coding-agent-adapter-preflight.py').read_bytes()
if hashlib.sha256(source).hexdigest() != '375e9970252e9a79ddd40466f2a32a5fbe459fb7f1888e1d1bbfb5999e060f95':
    raise SystemExit('Pruefskript geaendert; nicht als Root ausfuehren')
command = 'sudo python3 -c ' + shlex.quote(source.decode())
with open('/dev/tty') as terminal:
    raise SystemExit(subprocess.call([
        'ssh', '-t', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=7', '-o', 'ConnectionAttempts=1',
        '-o', 'ControlMaster=no', '-o', 'ControlPath=none',
        'friseer@192.168.178.43', command,
    ], stdin=terminal))
PY
```

Ein Fehler bleibt ein Blocker für die produktive Anwendung. Dieser Prüfschritt
ist ausdrücklich keine Freigabe für Adapterersetzung oder Dienstneustart.

### Dateibasierter Sitzungsindex: keine erfundenen Einträge und kein stiller Leerstand

p4-file-index-integrity-red: **1/3 ausgewählte Prüfungen**, zwei Fehler bei
File-Persistenz reproduziert, 16 unbetroffene Fälle übersprungen. Geerbte
Object-Schlüssel wie constructor wurden als vorhandene Sitzung gelesen und
konnten durch update/deletion Phantomänderungen erzeugen. Ein kaputter Index
wurde beim Lesen still als leer behandelt. File-Persistenz prüft nun eigene
Schlüssel und meldet kaputte vorhandene Indizes ausdrücklich als Fehler.
Upsert legt Schlüssel als Datenfelder an; solche tatsächlich vorhandenen IDs
bleiben gültig. Keine Blacklist, keine neue Speicherarchitektur und keine
automatische Dateireparatur oder Ersetzung beschädigter Bestände.

p4-file-index-integrity **65/65** bestanden, einschließlich tatsächlicher
File-/SQLite-Speicher mit den betroffenen IDs, unveränderter Daten bei fehlenden
IDs/kaputtem Index, nativer Erstellung, initialer Historie, Snapshotimport und
Modellwahl-Persistenz. p4-file-index-types und p4-file-index-build Exit 0.
Keine produktiven Sitzungsdateien geändert.

### Tatsächlicher HTTPS-Browsertransport am vorhandenen Dashboard

Auf 768dd645c fortgesetzt. Kein zweiter TLS-Server oder neuer Runtime-Speicher
eingeführt: Das vorhandene Dashboard terminiert HTTPS/WSS bereits und verbindet
sich im geprüften Aufbau über Loopback mit dem vorhandenen Core-Hub. Der fehlende
Nachweis war die verschlüsselte Variante des existierenden Browser-Transporttests.
Dieser Test ist nun zusätzlich auf HTTPS parametrisiert; die HTTP-Variante bleibt
erhalten. Das vorhandene reine Fixture-Zertifikat wird wiederverwendet, keine
produktiven Schlüssel erzeugt oder verändert.

p4-browser-tls-shared-session und p4-browser-tls-shared-diagnostic jeweils 0/1
ausgewählt, ein unbetroffener HTTP-Fall übersprungen. Ursache im Testclient:
Vitest verwendet Node/undici WebSocket; die zunächst benutzte Bun-Option tls.ca
setzt dessen Vertrauen nicht. Der Fehler wurde auf einen lesbaren Error abgebildet.
Der Testworker verwendet jetzt Nodes eigenen temporären CA-Eintrag und setzt ihn
im finally zurück. Keine deaktivierte Zertifikatsprüfung, kein System-Trust-Update.
p4-browser-tls-shared-native-ca **1/1** bestanden, HTTP-Fall bewusst nicht erneut
ausgeführt: tatsächlicher Bun-HTTPS-Server, zertifikatsgeprüfter WSS-Client,
Actor-Anmeldung als jimmi, Schreibübergabe derselben ID, Ablehnung des alten
Writers und laufender Turn trotz Browsertrennung; Historie/Urheberschaft erhalten.
Agent/Modell sind weiterhin Fixtures, physisches Android noch nicht abgenommen.
p4-browser-tls-shared-types Exit 0.

Nach den neuen Core-Persistenz-/Resume-Korrekturen außerdem die betroffenen
VS-Code-Adapter gegen das aktuelle Core-Bundle geprüft:
p4-runtime-vscode-cross-regression **70/70** bestanden, einschließlich Terminal-
Lifecycle, explizitem Shared-Zugang, Recall-Adapter und Prozessdarstellung. Keine
erneute echte Sleep-Messreihe, Migration oder produktive Installation ausgeführt.

### Zusätzlich reproduzierter Wettlauf zwischen Prozess-Exit und Logabschluss

Auf f47870b4e fortgesetzt. Die zusammenhängende Prüfung
p4-runtime-storage-recall-cross-regression lieferte **168 bestanden, ein Fehler,
14 plattformbedingte Skips** (183 erfasste Tests). Alle angeforderten zehn Dateien
wurden ausgeführt. Fehler: der bestehende detached-background-numeric-exit-Test
las nach completed-at noch ein Log ohne abschließenden Exitdatensatz. Ursache:
createDetachedLog schrieb den Marker synchron vor dem asynchronen stream.end/
Schreibabschluss. Der reale Prozess-Exit im geschützten Journal war davon getrennt.

Der neue deterministisch verzögerte Logschreibtest prüft genau diese Reihenfolge.
p4-detached-log-flush-red scheiterte zunächst am nicht konfigurierbaren nativen
ESM-Spy und zählt nicht als Fehlerreproduktion. Nach passendem modulgebundenem
Mockaufbau reproduzierte p4-detached-log-flush-reproduction **0/1** tatsächlich
den vorzeitigen Marker trotz noch offener Schreibquittung. Ein echter eigener
500-ms-Kindprozess beendet sich dabei mit bestätigtem Exit 0; kein sleep-Timer
oder erfundener Prozessstatus dient als Ersatz.

Der Marker wartet jetzt sowohl auf den Prozessabschluss als auch Writable.finish.
Ein schon geschlossener/cappierter Stream wird korrekt behandelt. Schreibfehler
veröffentlichen keinen erfolgreich abgeschlossenen Logstand und behalten den
unvollständigen Nachweis; kein unkontrollierter Streamfehler im Hub. Die eigentliche
Exitbeobachtung, Signale und bestehende Timergrenzen werden nicht umdefiniert.
1c5db6c56 und die bereits abgeschlossene echte VS-Code-Sleep-Messreihe bleiben
erhalten und wurden nicht wiederholt.

p4-detached-log-flush: **45 bestanden, 14 Skips**, kein Fehler (Executor,
Controller, reale Prozessjournal-Persistenz und neuer deterministischer Fall).
Nach zusätzlichem IO-Fehlerfall p4-detached-log-flush-io-failure **2/2**, ohne
erneuten Lauf der unbetroffenen 129 bestandenen Prüfungen des ersten Verbunds.
p4-detached-log-flush-types und p4-detached-log-flush-build Exit 0.
Keine produktiven Terminalprozesse oder Dienste gestartet/beendet.

Erhaltungsnachweis p4-original-status-after-integration.json: Originalbranch
coding-agent-v4 weiter 624c2cd6661e100680d8b61daa3a3447f4708536, 8 geänderte und
19 unversionierte Dateien; SHA256 der Git-Statusausgabe unverändert
aff4aedbf69ef2f24960a735b51663df55a0a961ef0d2fb8e910293e010c9fbb.
Das ist ein Vergleich der Referenz/Statusdarstellung, kein Inhalts-Hash aller
Originaldateien. Eigene Schreibzugriffe bleiben auf den Reparatur-Worktree
und seine privaten vorhandenen Prüfarbeitsbereiche begrenzt.

### Beobachtungsfehler eines abgekoppelten Prozesses bleiben ausdrücklich unbekannt

Auf 7339d43da fortgesetzt. Der zusätzliche Fehlerpfad wurde am eigenen realen
Kindprozess mit einem eingespeisten ChildProcess-error ohne Exit geprüft.
p4-detached-observation-error-red **0/1**, zwei unbetroffene Fälle übersprungen:
das Journal behielt running und der Fehlerpfad rief den gewöhnlichen Logabschluss
auf. Nun meldet er unknown/observationFailed ohne künstlichen Code und schließt
den Log-Sink als fehlgeschlagen. finish und erfolgreicher close sind beide
Voraussetzung für einen normalen Abschlussmarker. Ein späterer tatsächlicher
SIGTERM-Exit aktualisiert ausschließlich den wirklichen Prozessnachweis; der
fehlgeschlagene Logstand wird dadurch nicht nachträglich als vollständig verkauft.
Der Test signalisiert und beendet ausschließlich sein selbst erzeugtes Kind.

p4-detached-observation-error **47 bestanden, 14 plattformbedingte Skips**, kein
Fehler (61 Tests): einschließlich Ausgabe-Flush, IO-Fehler, Beobachtungsfehler,
Executorbestand, Prozesscontroller und tatsächlichem persistentem Journal.
p4-detached-observation-error-types und p4-detached-observation-error-build
Exit 0. Keine produktiven Prozesse oder Dienste verändert.
Der angefragte Betreiber-Prüfbefehl prüft zusätzlich vor sudo den SHA256 seines
öffentlichen Prüfscripts; Syntax und Übereinstimmung lokal geprüft, nicht ausgeführt.

Unmittelbarer externer Blocker für die vorbereitete Acer-Adapteranwendung und
deren tatsächliche Modellabnahme bleibt der fehlende privilegierte Zugang.
Der Root-Sicherungs-/Wiederherstellungsnachweis wurde gezielt angefragt; ein
Zeitablauf ersetzt weder diesen Nachweis noch die separate produktive Freigabe.
Nach dessen Prüfung sind exakter Kandidatenabgleich, ruhende Wartungsphase und
gesonderte Freigabe vor Modulwechsel/gezieltem Coding-Agent-Neustart erforderlich.
Der externe Watchdog bleibt eine getrennte Acer-Installation. Physisches Android,
laufendes tatsächliches Modell, produktive Migration, vollständige Abnahme und
abgesicherter VSIX-Rollout bleiben offen. Phase 4 und der Gesamtauftrag sind
ausdrücklich nicht abgeschlossen.

Nachweissicherung im vorhandenen privaten Prüfverzeichnis:
tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.phase4-197fda29d-20261031.
80 vorhandene Log-/Metadaten-Dateien erfasst und tatsächlich per SHA256
nachgelesen, einschließlich fehlgeschlagener Versuche; keine Wiederholung alter
Sicherungen oder Tests. Listen-SHA256:
77db857befc9765d66fc8e6c6d745a85b9d7bee72bc8b7d74b96f8dca98574f5.
Reparatur-Arbeitsstand vollständig committet; die zwölf bereits vorhandenen
unversionierten Altartefakte bleiben erhalten und ungestaged. Kein Push.

### Acer-Root-Nachweis erhalten; geprüfter Anwendungsschritt wartet auf Freigabe

Am 31.10.2026 ist der angefragte Root-Prüflauf durch den Betreiber ausgeführt
worden. Keine neue Sicherung angefordert und keine Phase neu begonnen.
Vorhandener Root-Sicherungsordner:
/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-ollama-adapter-preflight.
Gemeldete SHA256-Werte:

- Manifest: 2e70f16496d30d3c2eac5308e59b366ee36ba8137ba47f90329c51bec9cbad83.
- Archiv: a6bbd6a964f89050b30bb0ece1071f844f6b9fc49ab2b5112ffc9ea11a640af3.
- Original: cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81.

Der Betreiberlauf meldet tatsächliche Wiederherstellung, Eigentümer-/Modus-/
mtime-/xattr-Vergleich sowie unveränderte Quelle/Dienste und keinen Modellaufruf.
Alle drei Hashformate lokal geprüft; die exakte Manifestrekonstruktion aus den
gemeldeten Feldern ergibt denselben Manifesthash. Nachweis gespeichert unter
logs/p4-acer-root-preflight-operator-receipt.json im vorhandenen privaten
Prüfverzeichnis. Die Root-Dateien wurden durch diesen Betreiberlauf geprüft,
nicht durch einen behaupteten eigenen Root-Zugriff. Die Meldung enthält keine
Freigabe für produktiven Modulwechsel oder Dienststeuerung.

sdk/scripts/netaigis-coding-agent-adapter-maintenance.py bereitet den nächsten
konkreten Schritt vor. Standardaktion inspect ist ausschließlich lesend. Der
Kandidat setzt nur die bereits geprüften Änderungen für Anforderungslänge und
Abschlussgründe in native_request/completion/sse_stream um. Keine Modell-,
Endpunkt-, Routing-, Dienstidentitäts- oder Konfigurationsentscheidung geändert.
Kombinations-SHA256 unverändert:
307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9.

p4-acer-maintenance-builder-readonly.json: der neue exakte In-Memory-Bauer wurde
gegen das tatsächliche aktuelle Acer-Modul geprüft; Original/Kandidat entsprechen
genau den obigen Hashes. Privater Quelltext bleibt auf Acer, kein Kandidat dort
gespeichert, keine Modell- oder Dienstaktion. Die bisherigen zehn Funktionsfälle
des bytegleichen Kandidaten werden nicht unnötig wiederholt.

Neue Wartungs-/Rückfallprüfungen mit tatsächlichem Dateiaustausch in privaten
lokalen Fixtures und simuliertem Dienstcontroller:
p4-acer-adapter-maintenance-fixtures 13/15: zwei Metadatenfehler reproduziert,
weil ein gepufferter Flush nach utime den Originalzeitstempel überschrieb.
Flush erfolgt nun vor Metadatenübernahme; p4-acer-adapter-maintenance-metadata
16/16 bestanden. p4-acer-adapter-maintenance-rollback-guards 19/20: zwei
Erweiterungszeilen des xattr-Tests waren versehentlich im folgenden Test gelandet;
korrekt zurückgeordnet, keine Assertion entfernt. Danach
p4-acer-adapter-maintenance-isolation 21/21 und abschließend
p4-acer-adapter-maintenance-typed-hooks **23/23**, keine Skips, bestanden.
Geprüft: echte Byte-/mtime-/Modus-/xattr-Rücknahme, Fehler nach atomarem Rename,
ungesunder Kandidat, manuelle Rücknahme trotz ungesundem Kandidaten, aktive
Verbindungen, fehlende Wartungsbestätigung, wiederholte Anwendung, geänderte
Quell-/Sicherungsdateien, Symlinks und unbekannte Weitergabe/Hooks. Das ist noch
kein produktiver Dienstneustart oder Modelltest. Das Archiv in den neuen
Transaktionsfixtures ist ausdrücklich synthetisch; die echte tar-Wiederherstellung
ist im vorhandenen Preflight und im Betreiberlauf separat belegt.

Aktuelle lesende Acer-Prüfungen für den vorgesehenen Operationsumfang:
p4-acer-coding-stop-scope-readonly und -all-readonly liefern leere Weitergaben,
blenden aber trotz --all vier leere Exec-Hook-Arrays aus. Dies wird nicht als
Vollnachweis ausgegeben. p4-acer-coding-hooks-dbus-readonly prüft dieselben
Eigenschaften typisiert über systemd-D-Bus: alle vier Arrays tatsächlich leer.
Der Wartungscontroller verwendet diesen typisierten Nachweis, falls systemctl
die Felder auslässt. p4-acer-maintenance-controller-readonly bestätigt den
tatsächlichen neuen Lesepfad, keine Stop-Weitergabe/Start- oder Stop-Hooks und
die aktuelle Verbindungsprüfung. Coding-Agent weiterhin PID 671914,
InvocationID 7e7e3c2ae9ba4761911394b27adf0871, kein Neustart vorgenommen.
Die Verbindungsprüfung ersetzt keinen Auftragszähler: frei von laufenden
Aufträgen, neuer Nutzung und parallelem Modellwechsel muss das freigegebene
Wartungsfenster zusätzlich durch den Betreiber bestätigt sein.

Der zur Freigabe vorgelegte produktive Umfang ist genau:

1. Root-Artefakte, Prüfliste, unveränderte Originalquelle und Kandidat erneut
   prüfen; bestehende Sicherungen niemals überschreiben.
2. Bestätigtes ruhendes Wartungsfenster, gesunder Ausgangsdienst, keine bekannten
   aktiven TCP-Verbindungen und keine unbewerteten Stop-Weitergaben/Hooks verlangen.
3. Ausschließlich netaigis-coding-agent.service stoppen und inaktiv/PID 0 bestätigen.
4. Ausschließlich /opt/netaigis-coding-agent/ollama_adapter.py atomar ersetzen,
   Eigentümer/Modus/xattrs erhalten; keine Konfiguration ändern.
5. Ausschließlich denselben Coding-Agent starten, systemd-Status und HTTP-200-
   Health mit begrenztem Startzeitbudget prüfen; sechs bestehende Konfigurations-
   und Unitdateien auf identische Bytes prüfen. Kein Modellaufruf im Wartungslauf.
6. Bei Fehlern nur den gesicherten Originalstand wiederherstellen und denselben
   Dienst starten; bei unbekannten konkurrierenden Änderungen nicht überschreiben.
   Schlägt auch der Rückfall fehl, abbrechen und manuelle Klärung melden.

Die neue Anwendung quittiert stages ausschließlich in application.jsonl bzw.
rollback.jsonl (0600) unter dem vorhandenen Root-Preflight-Ordner. Ein bereits
vorhandenes Journal wird nicht überschrieben. Für Prozessabbruch/Stromausfall
bleibt die explizite Aktion rollback verfügbar; es wird keine automatische
Rücknahme ohne laufenden Wartungsprozess behauptet. Andere Dienste einschließlich
Learning-Agent, Recall, Modellrouter und Modell werden nicht gesteuert.

### Bedienbefehl für den geprüften Acer-Wartungsschritt

Historischer Stand vom 31.10.2026. Durch die verbindliche Korrektur vom
01.11.2026 ersetzt: jetzt den kurzen Aufruf im Abschnitt „Freigegebene
Acer-Anwendung mit Vorrang der neuen Implementierung“ verwenden. Der alte
Hashschutz verhindert eine versehentliche Ausführung dieses überholten Befehls.

Im Benutzerterminal auf 440G5suse ausführen. Voreinstellung inspect ist lesend.
Erst nach ausdrücklicher Freigabe und bestätigtem ruhendem Wartungsfenster action
auf apply und maintenance_confirmed auf True setzen. Für einen freigegebenen
Rückfall action=rollback. Benötigte sudo-Eingabe ausschließlich im Terminal.
Die öffentlichen Skripte werden mit SHA256 festgelegt und nur im Speicher auf
Acer ausgeführt; keine zusätzlichen Werkzeugdateien dort installiert.

```sh
python3 - <<'PY'
from pathlib import Path
import base64, hashlib, json, shlex, subprocess
action = 'inspect'
maintenance_confirmed = False
root = Path('/home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts')
names = {
    'maintenance': 'netaigis-coding-agent-adapter-maintenance.py',
    'finish': 'netaigis-coding-agent-finish-reason.py',
    'patch': 'netaigis-coding-agent-token-limit.patch',
}
expected = {
    'maintenance': '57764515ba8233a0a853a0bffdd01c548e43785de3254c05a687081d19a8d311',
    'finish': 'ef0742af72db0418c70282a6227aff77f2db82ea5718e869cefdb5f6dc78cba2',
    'patch': '4607e260ddd664af584d8097cb4ba7e8f7214e0ac6b82760ab706d169b697be9',
}
files = {key: (root / name).read_bytes() for key, name in names.items()}
if any(hashlib.sha256(value).hexdigest() != expected[key] for key, value in files.items()):
    raise SystemExit('Pruefskripte geaendert; nicht als Root ausfuehren')
if action not in ('inspect', 'apply', 'rollback'):
    raise SystemExit('Unbekannte Aktion')
arguments = [action] + (['--maintenance-confirmed'] if maintenance_confirmed else [])
bundle = base64.b64encode(json.dumps({
    'code': files['maintenance'].decode(),
    'assets': {key: files[key].decode() for key in ('finish', 'patch')},
}).encode()).decode()
loader = ('import base64,json,sys; p=json.loads(base64.b64decode(' + repr(bundle) + ')); '
          + 'sys.argv=["acer-adapter-maintenance"]+' + repr(arguments) + '; '
          + 'exec(compile(p["code"],"public-maintenance-helper","exec"),'
          + '{"__name__":"__main__","REPAIR_ASSETS":p["assets"]})')
with open('/dev/tty') as terminal:
    raise SystemExit(subprocess.call([
        'ssh', '-t', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=7', '-o', 'ConnectionAttempts=1',
        '-o', 'ControlMaster=no', '-o', 'ControlPath=none',
        'friseer@192.168.178.43', 'sudo python3 -c ' + shlex.quote(loader),
    ], stdin=terminal))
PY
```

Noch nicht freigegeben/ausgeführt: apply, rollback oder Dienststeuerung.
Nach Freigabe und belegtem erfolgreichem Anwendungslauf folgen die tatsächlichen
Backend-/Recall-/Sitzungstests und der angeleitete Android-Test im bestehenden
Gesamtauftrag. Unabhängiger Watchdog und produktive Fork-Migration/VSIX bleiben
separat abzusichern; keine vorgezogene Gesamtabnahme.

Anwendungsvorbereitung committet als 810df407f. Die gezielte Freigabe für den
oben beschriebenen Modulwechsel und Stop/Start wurde angefragt; die Antwort
steht aus. Syntax des vollständigen Bedienbefehls und des erzeugten Remote-
Loaders, sämtliche öffentlichen Skripthashes sowie lesende Voreinstellung
zusätzlich geprüft, ohne Ausführung von SSH/sudo aus diesem Bedienbefehl.
17 neue Prüf-/Nachweisdateien einschließlich fehlgeschlagener Versuche im
vorhandenen Prüfverzeichnis per SHA256 versiegelt und nachgelesen:
SHA256SUMS.acer-maintenance-810df407f-20261031,
Listen-SHA256 c65fa141db40d143b3305dd5d3d097366f66315290f67739227713101919ed57.
Keine produktive Änderung vorgenommen; die zwölf alten unversionierten
Reparaturartefakte bleiben ungestaged erhalten.

### Freigegebene Acer-Anwendung mit Vorrang der neuen Implementierung

Verbindliche Nutzerfreigabe vom 01.11.2026 übernommen: Der produktive Schritt
bleibt freigegeben, die KI auf Acer ruht. Ausschließlich Adapterdatei und Coding-
Agent-Dienst dürfen im beschriebenen Umfang geändert/gesteuert werden. Keine
erneute Freigabefrage für denselben Eingriff. Andere Dienste, Modellwahl,
Konfigurationen und Endpunkte bleiben außerhalb dieses Änderungsumfangs.

Korrektur der Fehlerstrategie: Ein Fehler führt zu konkreter Diagnose, gezielter
Korrektur, erneuter Installation der neuen Version und tatsächlichem Test.
Kein automatischer Rückfall beim ersten Fehler und kein Ende des Auftrags durch
Wiederherstellung des Originals. Die bestehende Sicherung bleibt ausschließlich
Notfallabsicherung; auch nach einem notwendigen Notfallrückfall bleibt die neue
Version verpflichtend zu reparieren und abzunehmen.

Der Wartungshelfer setzt diese Korrektur technisch um. Fehler behalten den
installierten neuen Stand, liefern repair_required=true, tatsächlichen Quellhash,
Dienstzustand und zugriffsgeschützten Versuchsnachweis. Fehlerdiagnosen aus dem
Acer-Journal übertragen ausschließlich Exceptionklassen und relevante Dateinamen/
Zeilen, keine vollständigen Meldungen, Inhalte oder Geheimnisse. Begrenzte Health-
Beobachtung meldet HTTP-Status bzw. Fehlertyp. repair erlaubt nach konkreter
Diagnose einen weiteren kontrollierten neuen Installationsversuch. Nur explizites
rollback mit zusätzlicher Notfallbedingung darf das Original zurücknehmen.
Jeder Versuch erhält eine eigene exklusive Journaldatei im bestehenden Root-
Preflight-Ordner; vorhandene Versuche und Sicherungen werden nicht überschrieben.

p4-acer-forward-repair-policy-red: drei neue Prüfungen reproduzierten die
Unvereinbarkeit des alten Helfers mit der neuen Vorgabe (0/3). Nach Korrektur
p4-acer-forward-repair-policy **26/26** bestanden. Enthalten sind Erhalt der neuen
Version nach fehlerhafter Health-Prüfung oder Fehler nach Rename, nachfolgender
Reparaturversuch und ausschließlich ausdrücklich bestätigte Notfallrücknahme.
Der eigentliche Adapterkandidat bleibt bytegleich zum bereits geprüften Stand,
Kombinations-SHA256 307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9.
Keine abgeschlossenen Phasen, Sicherungen oder echte Sleep-Messreihen wiederholt.

Neuer kurzer Bedienaufruf sdk/scripts/netaigis-coding-agent-adapter-remote.py:
prüft die drei öffentlichen Quellhashes, überträgt ausschließlich öffentliche
Skripte im Speicher über den bestehenden SSH-Zugang und bindet sudo direkt an das
Benutzerterminal. Keine Passwörter im Chat, in Argumenten oder Dateien.
p4-acer-approved-terminal-launcher **7/7** bestanden: Hashabweichung, bytegetreuer
Transport, Shell-Quoting, lesender Standard, apply/repair ohne Notfallflag und
ausdrücklich getrennte Notfallrücknahme. Dies sind lokale Transport-/Fixturetests,
kein behaupteter produktiver Installationsnachweis.

Aktueller konkreter Zugriffsblocker: Die erneute lesende Prüfung über den bereits
vorhandenen SSH-Zugang bestätigt weiterhin noninteractive_sudo=false und den
unveränderten Originalhash cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81.
Die Freigabe fehlt nicht. Die Root-Passworteingabe muss wie beim erfolgreichen
Sicherungslauf im Benutzerterminal erfolgen. Dazu auf 440G5suse ausführen:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-coding-agent-adapter-remote.py apply
```

Passwort ausschließlich im Terminal eingeben. Die JSON-Ausgabe ohne Zugangsdaten
zurückgeben; auch eine Fehlermeldung ist erforderlich, damit gezielt weiter
repariert wird. Der Helfer stellt bei einem Fehler nicht automatisch das Original
wieder her. Für einen nach Diagnose erforderlichen neuen Versuch ist repair
vorgesehen; eine Notfallrücknahme erfordert rollback --emergency-confirmed.
Nach tatsächlichem Anwendungsergebnis werden unabhängig Modell-/Recall-/Sitzungs-
funktion geprüft und der ursprüngliche Gesamtauftrag fortgesetzt. Keine Abnahme
allein aufgrund von Quellcode, Fixtures, Health oder einem VSIX-Build.

Aktueller autorisierter Wartungs-/Terminalstand: f15813706. Zusätzliche gezielte
Prüfung p4-acer-repair-diagnostics-contract **2/2** bestanden: Exceptionklasse und
relevante Quellzeile ohne private Journalmeldungen/Zugangsdaten; eine neue gezielte
Korrektur darf nur einen ausdrücklich festgelegten früheren Kandidaten ablösen.
Der bereits angefragte Root-Terminalaufruf bleibt dabei bytegleich; keine Änderung
am bereitgestellten Anwendungsskript während dieser Zusatzprüfung.

Die erneute produktive Freigabe fehlt nicht. Angefragt ist ausschließlich die
erforderliche interaktive Betreiber-Ausführung; ausstehende Root-Eingabe wird
nicht durch Passwortsuche, Berechtigungsänderungen oder wiederholte sudo-Versuche
ersetzt. Neun neue Log-/Metadatennachweise im vorhandenen privaten Prüfverzeichnis
gesichert und nachgelesen: SHA256SUMS.acer-forward-repair-f15813706-20261101,
Listen-SHA256 2123f81ede3640c6e6cdf8ef4cbddd87399b2d14788660009cd5fccddf51e9fa.
Bis zu einem tatsächlichen Anwendungsergebnis bleibt der Acer-Adapter unverändert
und keine produktive Installation oder Abnahme wird behauptet. Nach Eingang der
Ausgabe konkrete Fehler reparieren bzw. den tatsächlich installierten neuen Stand
prüfen und am Gesamtauftrag weiterarbeiten.

### 01.11.2026 — Adapter angewendet; Modellwechsel und dynamischer Kontext noch offen

Der vorstehende Wartezustand ist durch den tatsächlichen Betreiberlauf erledigt.
Kein erneuter Auftrag und keine Wiederholung von Phase 1–3. Betreiber meldet
`ok=true`, Aktion apply, installierten Adapter-SHA256
307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9 und Coding-Agent
aktiv/laufend, PID 1754988, InvocationID a38f8b4ae8a54bb1a35397c965b82b84,
NRestarts 0, unveränderte Konfigurationsbytes. Root-Journal:
`/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-ollama-adapter-preflight/application-1793517793059932457-682893d52195448baba757bf9dd50d35.jsonl`.
Empfangener Nachweis: logs/p4-acer-adapter-apply-operator-receipt.json im bestehenden
privaten Prüfverzeichnis. Eigene unabhängige lesende Prüfung bestätigt Hash,
PID und InvocationID (p4-acer-applied-version-live-precheck.json); kein behaupteter
eigener Root-Zugriff auf das Journal. Learning-Agent ai-agent.service weiterhin
PID 618787 und Health 200. Coding-Health ebenfalls 200, aber das ist kein
Nachweis einer funktionierenden Modellanfrage.

Tatsächliche Ursache des gegenwärtigen Integrationsfehlers:

- ai-model-router.service läuft als friseer, PID 1754987, Port 11441. Seine
  Konfiguration `/etc/ai-model-router.json`, SHA256
  1d354e9e42e277a8c3db3039b9ed83d327b90d33d1d5a533965e65af5cb9c121, verweist für
  Coding und Learning weiterhin auf 127.0.0.1:11440 und das alte Qwen-Modell.
  Router-Health liefert HTTP 503 mit Connection refused.
- ai-deepseek.service läuft als Root-Dienst, PID 1745000, mit dem bestehenden
  `/home/friseer/ai-staging/deepseek-v4.1-flash-1017-iq2_xs/deepseek-runtime-32k.json`
  auf 11442. Health 200; tatsächlicher Katalogname
  `deepseek-v4.1-flash-1017-iq2_xs`. Damit wird keine Parameterzahl bewiesen.
  Der Dienst ist transient, Fragment /run/systemd/transient/ai-deepseek.service;
  nicht ungeprüft in eine andere Betriebsform umwandeln.
- Der echte Coding-Aufruf an 11436/v1/chat/completions liefert HTTP 503.
  Dagegen funktionieren derselbe vorhandene DeepSeek direkt nichtstreamend und
  streamend: HTTP 200, begrenzter Abschluss length, SSE mit bestätigtem DONE.
  Jeweils max_tokens=8; keine Rohtexte gespeichert. Das sind Komponentenprüfungen,
  keine gemeinsame VS-Code-/Android-Sitzung und keine Gesamtmodellabnahme.

Neue lesende Befunde am bestehenden privaten Routermodul:
`/opt/ai-model-router/model_router.py`, SHA256
20a5c578fcbeb00afa3b2a92d930582c238e738526c8ffc20b098f67a2410e0c.
do_ollama_chat verweigert stream=true, verwirft options.num_predict und reserviert
pauschal 4096 Ausgabetokens für die Kontextberechnung. Kein zweiter Router oder
neuer Speicher aufgebaut. sdk/scripts/netaigis-model-router-protocol.py bereitet
einen bytefesten Patch genau dieser bestehenden Methode vor: Ausgabelimit reicht
bis max_tokens und Kontextreserve; SSE wird fortlaufend in native NDJSON-Records
übersetzt. Geteilte Toolargumente werden vollständig zusammengesetzt. Inhalt,
Reasoning und bestätigte Abschlussgründe bleiben getrennt; unvollständige Streams
erzeugen einen Fehler und keinen erfundenen done-Abschluss. Bestehende Locks,
Rollen, Endpunkte, Kontextstufen und increase_context bleiben unverändert.

p4-router-native-protocol: 19/19 lokale Tests einschließlich echtem Loopback-HTTP.
Nach Ergänzung der verbindlichen Modellwechsel-Regressionsprüfung:
p4-router-replacement-model-regression **20/20**. Derselbe Patch arbeitet mit zwei
verschiedenen konfigurierten Modellnamen/Adressen und dynamischen 64k-/128k-Stufen;
keine Modellnamen im Produktionspatch. Das ist kein echter produktiver Modellwechsel.

Der Patch ist auf Acer ausschließlich im Speicher auf die tatsächliche private
Quelle angewendet und gegen das laufende DeepSeek geprüft worden. Kandidat-SHA256
881524c8f65ac9ed90a78753f5fe002aec1e602e93ae08f05d9f7ed5a26040be.
p4-acer-router-candidate-real-model-in-memory: beide Antwortarten HTTP 200, jeweils
8 Inhaltszeichen, Abschluss length, Streaming 10 native Records ohne Fehler.
Wichtig: Endpunkt/Modell nur im Test-Arbeitsspeicher umgebunden; Kontextbedarf und
Vergrößerung dort ausdrücklich simuliert. Keine private Quelle übertragen, keine
Router-/Konfigurationsdatei gespeichert, kein Dienst gesteuert, kein Modell neu
geladen. Kein Beleg produktiver dynamischer Kontextvergrößerung.

Zusätzlicher echter Formatterfehler reproduziert: Der installierte Adapter
verwirft message.thinking und message.reasoning_content. Der separate bytefeste
Kandidat sdk/scripts/netaigis-coding-agent-reasoning.py erhält diese Felder als
OpenAI-reasoning_content, ohne sie in die Antwort zu mischen. Die tatsächlich
vorhandene verschachtelte chunk/emit-Kodierung bleibt erhalten. Der erste
synthetische Lauf bestand 8/8, aber der Schutzabgleich an der tatsächlichen Quelle
verweigerte korrekt den abweichenden Encoder-Anker. Nach gezielter Anpassung und
zusätzlicher verschachtelter Encoderprüfung lokal **9/9**. Der erste anschließende
Remote-Harness verwechselte Byte-SSE mit Text und scheiterte mit TypeError;
kein produktiver Fehler. Nach UTF-8-Normalisierung des Prüfharness bestehen
**8/8** Fälle an den tatsächlichen privaten Formatterfunktionen im Acer-Speicher:
beide Reasoning-Felder, normal/Streaming und stop/length. Abschlussgrund und
eigentliche Antwort bleiben erhalten. Quelle dabei unverändert. Kandidat-SHA256
f5f4e835b19ca38d1388b7a8222088b0449945888b3b283f670e1eeaed994147.
Dieser zusätzliche Formatterkandidat ist noch nicht installiert und noch nicht
in die Root-Wartungshashes aufgenommen; der bereits angewendete Helfer bleibt
unverändert. Alle fehlgeschlagenen Prüfnachweise bleiben erhalten.

#### Dynamische Kontextgröße und künftige Modellwechsel

Nutzerkorrekturen ausdrücklich übernommen: Die Kontextgröße ist dynamisch;
das frühere Modell konnte dies bereits. Kein fixes 32k-Limit einführen, keinen
DeepSeek-Sonderweg als vollständige Austauschbarkeit ausgeben. Ein besseres
kompatibles Modell darf keinen erneuten Cline-Quellpatch erfordern.

Der tatsächliche frühere Vergrößerungspfad wurde gezielt untersucht, nicht neu
erfunden: context_needed/selected_tier berechnen die nächste Stufe; increase_context
liest die reale Health-Kapazität und startet bei Bedarf Strata mit --context neu.
Sein 64k-Aufruf wurde ausschließlich im Speicher abgefangen, niemals ausgeführt:
konfiguriert sind noch family=qwen, model=iq3_xxs, altes GGUF-Verzeichnis, --mtp on
und Port 11440. Bestehende Stufen 32k, 64k, 128k, 256k, 512k sowie konfigurierte
größere Stufen bleiben unangetastet; deren tatsächliche Nutzbarkeit wird nicht
aus der bloßen Liste behauptet. Vorhandene friseer-Strata-Profile für 32/64/128/
256/512k sind nachgewiesen. Dies ist die Grundlage der weiteren Anbindung.

Der installierte CLI-Katalog kennt unter family=deepseek41 die aktuell laufende
Quantisierung IQ2_XS nicht. Ein ausdrücklich änderungsfreier launch-Plan ohne
Familie würde sogar Qwen auswählen; diese Ausgabe wurde als Fehlzuordnung erkannt
und nie gestartet. Direkter Pack-Pfad wird vom alten launch-Weg als fehlendes GGUF
abgewiesen. Keine angebotene andere Quantisierung ausgewählt und kein Download.
Der vorhandene generische Weg `strata serve --profile <bestehende Runtime-JSON>
--plan --json` validiert das aktuelle vorbereitete Pack dagegen erfolgreich und
modellunabhängig. Bestehende profile/runtime-Befehle bieten kontrollierte Neustarts
mit Owner-/Instanz-/Quellhash-Guards. Diese vorhandenen Komponenten weiterverwenden;
keine zweite Modellverwaltung in Cline bauen. Die Vergrößerungsanbindung an die
jetzige Root-Instanz ist noch nicht implementiert oder produktiv geprüft.

Nächster notwendiger Schritt ist die vollständige Verknüpfung der bestehenden
dynamischen Stufenwahl mit dem jeweils ausgewählten, tatsächlich startbaren
Backendprofil einschließlich dessen Eigentümer-/Neustartzuständigkeit. Ein bloßer
Port-/Namensaustausch reicht nicht. Konfigurationswechsel, ggf. Betriebsanpassung
des Modellservers und Routerdienständerung sind durch die bisherige ausdrücklich
auf Adapter/Coding-Dienst beschränkte Freigabe nicht gedeckt. Vor einem solchen
produktiven Eingriff konkreten Kandidaten, nötige Sicherungs-/Wiederherstellungsprobe
für die bisher nicht gesicherten betroffenen Dateien und gesonderte Freigabe
vorbereiten. Keine vorhandene Phase-2-Sicherung wiederholen. Bis dahin keine
ungeprüften Produktionsänderungen und keine Gesamt-/Modellwechselabnahme behaupten.

Gemeinsame Runtime, Friseer/jimmi, Recall, separate Agenten, externer Watchdog,
echter Android-Browsertest durch den Benutzer, Identitätsmigration und abschließende
produktive Fork-VSIX bleiben verbindlich offen, soweit nicht bereits im Verlauf
belegt abgeschlossen. Nicht durch diesen Komponentenfortschritt ersetzen.

#### Nachgeprüfte Grenzen auf dem Weg zu 1 Million Tokens

Nutzer fragt ausdrücklich, weshalb 1 Million fehlt und ob sein System dies nicht
mehr könne. p4-acer-one-million-context-limits-readonly belegt drei Grenzen:
produktives /opt/netaigis-coding-agent/context_session.py, SHA256
685a355e75d42902700792890eef1a2a4d7df8e8cfa797d5c264fd55e8875aa2, endet bei
262144; Router documented_max ist 524288 trotz größerer Listenstufen; Modell-Health
meldet loaded=true/max_context=32768. Der native Learning-Pfad begrenzt zusätzlich
auf min(_MAX,262144); seine Wirkung auf große vollständige Agentenaufrufe ist noch
separat zu prüfen. Diese Softwaregrenzen sind keine nachgewiesenen Modell- oder
Hardwaremaxima. Der Modellkatalog weist keine höhere Kontextfähigkeit aus;
fit_max_tokens=false in der Laufzeitdatei beweist ebenfalls keine absolute Grenze.

Hardware-Momentaufnahme: MemTotal 65246864 kB, MemAvailable 13521672 kB; RTX 5080
Laptop GPU mit 16303 MiB insgesamt/528 MiB frei. Kein Beleg für oder gegen die
Tragfähigkeit von 1 Million: erforderlicher KV-/Zustandsspeicher nicht gemessen,
kein tatsächlicher 1-Million-Modelllauf. Kein großer Prompt, Modellneustart oder
Konfigurationswechsel vorgenommen. Ziel nicht auf 32k/256k/512k reduziert.

sdk/scripts/netaigis-coding-agent-context-tiers.py bereitet eine gezielte Korrektur
des vorhandenen Trackers vor: NETAIGIS_CONTEXT_TIERS konfiguriert die Stufen;
Überschreitung meldet deren tatsächliches Maximum. Bestehende Defaults bleiben
bis zur freigegebenen Konfiguration erhalten. Keine Modellnamen oder feste
1-Million-Obergrenze im neuen Parser; höhere/niedrigere Fähigkeiten erfordern
Konfiguration, keinen Cline-Quellpatch. Sonstiger Trackingcode einschließlich
Sticky-Stufen, TTL und Actor-/Projekt-/Gesprächs-Isolation bleibt bytegleich.
p4-configurable-context-million-stages **10/10** lokal bestanden. Zusätzlich
p4-acer-actual-context-million-selection-memory **7/7** an der tatsächlichen
privaten Trackerklasse im Acer-Speicher: alte Sperre reproduziert, neue Stufen
524288/786432/1000000 bis zur exakten Grenze ausgewählt, Überschreitung verweigert,
Sticky-/Actor-Isolation erhalten. Nur Tokenbedarfs-Fixture, kein Modelllasttest.
Kandidat-SHA256 5f2f007ef5df7681f2494dec20da63592060822578aa1704dc27e3d1ae2a2847.
Nicht installiert. Diese weitere Moduldatei ist vom bisherigen Adapter-Preflight
und dessen begrenzter produktiver Freigabe nicht abgedeckt.

#### Noch notwendiger privilegierter, ausschließlich lesender Profilnachweis

Zur Wiederverwendung der vorhandenen Profilverwaltung fehlt die Zuordnung des
Root-Modellprozesses zu vorhandenen Root-Strata-Profilen. Sichtbare friseer-Profile
sind alte Qwen-Profile; daraus wird kein Fehlen von Root-Profilen abgeleitet.
Kein nachgewiesener nichtinteraktiver Root-Zugang; der bereits verwendete
Betreiberterminalweg bleibt für diesen Nachweis erforderlich.

sdk/scripts/netaigis-model-runtime-inspect.py fragt nur systemctl show und strata
profile list --json ab. Ausgabe: Dienstzustand und ausschließlich Metadaten von
Profilen mit der bereits belegten aktuellen Laufzeitdatei. Keine fremden
Profilinhalte, Secrets, Starts/Stops, Modellanfragen, Profilanlagen oder
Konfigurationswrites. Vor-/Nachzustand muss stabil sein; Abfragefehler bedeutet
unbekannt, niemals fälschlich leere Profilliste. p4-root-model-profile-readonly-
inspector **7/7** lokale Verträge einschließlich Datenschutzfilter und Transport.
Auf 440G5suse im bestehenden Benutzerterminal ausführen:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-runtime-inspect.py --remote --unit ai-deepseek.service --runtime-config /home/friseer/ai-staging/deepseek-v4.1-flash-1017-iq2_xs/deepseek-runtime-32k.json
```

Passwort ausschließlich im Terminal. Keine neue Modell-/Namensentscheidung oder
produktive Änderungsfreigabe. Anhand dieses fehlenden Nachweises den vorhandenen
Eigentümer-/Profilweg vervollständigen. Zusätzliche produktive Änderungen außerhalb
des Adapterumfangs benötigen vorbereitete Wiederherstellung und gezielte Freigabe.

Die ersten 34 neuen Nachweise einschließlich Fehlversuchen sind nachgelesen und
versiegelt: SHA256SUMS.acer-model-exchange-20261101, Listen-SHA256
c14e05a6685fd7101b309f5c425dc1b3eae3dc0d4fa4826e90f95f4152b46797.

Der vorstehende Root-Nachweis ist inzwischen durch den Betreiber ausgeführt
(p4-root-model-profile-operator-receipt.json): ok=true, euid=0, stabile
ai-deepseek-Invocation ca4d0bddc32e4575b19aed99c229507c/PID 1745000;
profile_query_ok=true, matching_profiles=[], root_profile_count=0. Kein Modellaufruf
und keine Quell-/Konfigurations-/Dienständerung. Die laufende Root-Instanz ist damit
auch nicht über ein vorhandenes gespeichertes Root-Strata-Profil zugeordnet.
Diese Frage nicht erneut stellen und den lesenden Betreiberlauf nicht wiederholen.

Nächste Arbeit: den bestehenden dynamischen Vergrößerungspfad mit dem ausgewählten
Laufzeitprofil verbinden. Weil der Router als friseer und der gegenwärtige
Modellprozess als Root läuft, eine enge privilegierte Schnittstelle zur vorhandenen
systemd-/Strata-Laufzeit prüfen; keine zweite Modell-/Sitzungsverwaltung und kein
eigenmächtiger Wechsel des Dienstbenutzers. Modellnamen, Enginepfad, Kontextargument
und Grenzen bleiben Konfigurationsdaten. Privilegierte produktive Anwendung erst
mit überprüfter Wiederherstellung und zusätzlicher konkreter Freigabe; bisherigen
Adapter/Coding-Agent unverändert weiterbetreiben.

#### Vorbereitung der neu erforderlichen Modell-/Kontextsicherung

Die installierte Strata-Hilfe nennt für DeepSeek-V4.1-Flash ausdrücklich „512k and
1m“. Dies unterstützt das Entwicklungsziel, ersetzt aber weder den Lasttest der
laufenden Quantisierung noch den Nachweis ausreichenden Speichers. Die aktuelle
Runtime-Datei ist kanonisch, die vorhandene Exportablage gehört UID/GID 1000 und
hat Modus 0700. Der geplante neue Exportunterordner existiert noch nicht.

sdk/scripts/netaigis-model-context-preflight.py sichert genau sieben jetzt neu
betroffene Dateien: Routerquelle/-konfiguration, produktives Kontextmodul,
aktuell bereits aktualisierten Adapter, aktuelle DeepSeek-Runtime-Datei sowie
beide bisher nicht erfassten Router-/Modelldienstdefinitionen. Die fünf bereits
gelesenen Inhalts-SHA256 sind festgelegt. Kein neuer Abzug der Cline-Sitzungen,
Recall-Datenbank, Repositorys oder bereits abgeschlossenen Phase-2-Artefakte.

Neue Artefakte ausschließlich unter vorhandenen geschützten Eltern:
`/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-model-context-preflight`
und `/home/friseer/recall-phase2-export-20261030T165000Z/phase4-model-context-preflight`.
Exklusive Neuanlage, Originale und bestehende Sicherungen nie überschreiben.
Tatsächliche GNU-tar-Wiederherstellung in restore-probe, SHA256, UID/GID/Modus,
mtime und sämtliche xattrs prüfen; Originaldateien sowie Dienstzustand vor/nach
müssen identisch bleiben. Archive und Export werden synchronisiert, Exportdateien
0600 im privaten 0700-Unterordner nur für den bestehenden SSH-Benutzer. Keine
produktiven Dateiberechtigungen ändern. Das prüft die Dateiwiederherstellung,
noch keinen Modellneustart oder vollständige transiente Dienstrekonstruktion.

p4-model-context-backup-restore-fixtures **10/10**, nach zusätzlicher Prüfung eines
fehlgeschlagenen Archiv-fsync p4-model-context-preflight-durable-archive **11/11**.
Echte Archivextraktion mit Metadaten in lokalen Fixtures; Veränderungen an Quelle,
Wiederherstellung oder Dienstzustand verhindern Erfolg/Export. Wiederholung und
Symlinks verweigert, vorhandene Sicherungen bleiben erhalten. Zusätzlich exakter
Root-Loader syntaktisch geprüft, ohne SSH/sudo auszuführen. Öffentlicher Helfer-
SHA256 9a54f3e4d4bb465e810967266b339d89d893f3d29c6bc3ae3ea7bb2dccedd3cc.

Erforderlicher Betreiberlauf auf 440G5suse, ausschließlich Sicherungsartefakte:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-preflight.py --remote
```

Passwort nur im Terminal. JSON-Nachweis zurückgeben; danach geschützte externe
Kopie im bestehenden 440G5suse-Sicherungsordner und dortige Wiederherstellungsprobe.
Vor diesen Nachweisen keine der zusätzlichen produktiven Änderungen freigeben
oder anwenden. Der bereits aktualisierte Adapter bleibt erhalten. Die zusätzliche
Freigabe für Router, weitere Module, Modellneustart oder eine eng begrenzte
privilegierte Kontextschnittstelle ist noch nicht erteilt und wird erst bei
konkret geprüftem Kandidaten unmittelbar vor dem jeweiligen Eingriff eingeholt.

### Neueste Benutzerpriorität: benutzbaren KI-Chat vor dem weiteren Ausbau herstellen

Der Benutzer verlangt jetzt ausdrücklich zuerst eine benutzbare KI/Zwischenversion
und fragt nach der installierbaren eigenen VSIX. Das ist kein Nachweis bereits
fertiger Funktionen. Die vollständigen bisherigen Anforderungen bleiben dokumentiert;
die unmittelbare Arbeit konzentriert sich auf den defekten produktiven Modellpfad
und einen tatsächlich geprüften Paketbau. Noch keine produktive VS-Code-Installation
oder Migration und keine vollständige 1-Million-/Android-Abnahme behaupten.

Der neue Sicherungslauf ist tatsächlich ausgeführt, sieben Dateien, Manifest-SHA256
6fb8ad9472f47875d01a35b4a3b73284951eeb5dc85048363255563824f36677, Archiv-SHA256
49603207964cb3d37613f38797e7abf33cfeae2a895586be80ddf02433b5cf16, Prüfliste
033dd2697c842bf1aee3defa1c4d028fda121ba700d8b2a07f4317e055ced962. Root-Restore
mit UID/GID/Modus/mtime/xattrs bestanden. Betreiberbeleg unverändert gespeichert.
Geschützte Zweitkopie selbst erstellt und geprüft unter
/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase4-model-context-preflight.
Alle drei Prüfsummen stimmen mit dem Betreiberbeleg überein; Archiv enthält genau
die sieben erwarteten regulären Dateien. Eigene tatsächliche Extraktion in
external-restore-probe, sämtliche Inhalts-SHA256, Modi und Nanosekunden-mtime
identisch. Lokale Extraktion verwendet den aktuellen Benutzer; die ursprünglichen
Eigentümer/vollständigen xattrs sind durch den tatsächlichen Root-Restore auf Acer
separat belegt. Kein bloßer Prüflistenvergleich als Wiederherstellung ausgegeben.
external-verification.json liegt privat neben der Zweitkopie, außerhalb von Git.

Aktueller Modelldienst hat tatsächlich Restart=no und CollectMode=inactive-or-failed.
Kein ungeprüftes Stop/Start dieses transienten Dienstes. Für die akute Chatreparatur
wird er nicht angefasst. Auch Coding-/Learning-Dienst, ihre Konfigurationen,
Modellwahl und die äußeren API-Ports 11436/11441 bleiben erhalten.

sdk/scripts/netaigis-model-router-activate.py bereitet nur ai-model-router.service
und dessen zwei gesicherte Dateien vor. Root-Standard inspect ist lesend. Zielmodell
und interne Modelladresse stammen ausschließlich aus der bereits bestätigten
aktuellen Runtime-Datei und müssen vom tatsächlich laufenden API-Katalog/Health
bestätigt werden. Coding-/Learning-Routen werden auf dieses vorhandene DeepSeek
berichtigt; keine neue Standardmodellauswahl. Embedding und alle anderen
Konfigurationswerte bleiben semantisch erhalten. Der bereits getestete native
Streaming-/Tokenlimit-Patch wird übernommen. Eine modellneutrale ID-Prüfung verhindert,
dass bei größerem Kontext versehentlich der alte Qwen-Launcher gestartet/downloaded
wird. Der aktuell geladene 32k-Kontext bleibt beobachteter Zwischenstand; dynamische
Vergrößerung/1 Million ist ausdrücklich noch offen, keine dauerhafte Zielreduzierung.

Gegen die tatsächlichen privaten Dateien aus der geschützten externen Wiederherstellung
im Speicher gebaut: Routerkandidat 948637effe8516d3196b64f332361ed946b245d408c2ca13cbc656f754aeb410,
Konfigurationskandidat eea634e63e3534875123f9b9f1f32ea54351b125636ed91865857ed0670f04fe.
Private Quellen nicht in den Git-Arbeitsbereich kopiert. Gezielte Koordinatorprüfungen
10/10, nach zusätzlicher Prüfung privater Fehlertexte **11/11** bestanden. Tatsächliche
Dateiänderungen in privaten Fixtures, nur Routersteuerung, Fremdänderungsschutz,
aktive Verbindungen, unveränderte geschützte Dienste und Erhalt der neuen Version
bei Fehlern mit anschließendem Forward-Repair. Keine automatische erste Rücknahme.
Root-Sicherungen/Quelle/Dateimetadaten werden vor Anwendung erneut gegen die belegten
Hashes geprüft. p4-acer-router-activation-stop-scope bestätigt am echten Acer typisiert:
alle Stop-Weitergaben und vier Exec-Hooks leer. Keine anderen Dienste mitstoppen.

Dieser neue produktive Eingriff ist durch die frühere Adapter-only-Freigabe nicht
abgedeckt. Konkreter, vorbereiteter Bedienaufruf bei ruhenden Aufträgen:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-router-activate.py apply --remote --maintenance-confirmed --external-copy-verified
```

Erst mit gezielter Freigabe/Betreiberausführung. Nur Routerdateien und Routerdienst.
Danach tatsächliche normale/Streaming-Anfragen über den Coding-Agent prüfen, statt
Health als Modellabnahme auszugeben. action repair bleibt für konkrete Diagnose/
gezielte Nachbesserung vorgesehen; neue Dateien bei Fehlern erhalten.

Paketbau: frischer SDK-Build erfolgreich (61,9 s). Erster VSIX-Aufruf scheiterte
an fehlendem grpc-tools-Protoc und Sandbox-DNS. Die bereits freigegebene gebundene
Entwicklungsabhängigkeit wurde ausschließlich im Reparatur-Worktree nachgeladen;
Codegenerierung erfolgreich (7,52 s). Vollständige Extension-, Kompatibilitäts- und
Webview-Typprüfung danach erfolgreich; Paketlauf scheiterte an einem einzelnen
Grit-Lintbefund beim legitimen Lesen des nativen Migrationsquell-Secrets. Parameter
wie im vorhandenen Exportpfad explizit vscodeContext benannt und kommentiert;
Semantik/Secret-Grenze unverändert, gezieltes Lint bestanden. Kein Wechsel auf den
noch leeren Ziel-Cache. Packaging künftig mit Bun-Build und dem vorhandenen VSCE-
pack-Einstieg, damit kein npm-Lifecycle ausgeführt wird. Noch keine fertige VSIX
oder produktive Funktionsfähigkeit behauptet.

Zusätzlicher eigener Cachefund: Der lokale reine Kandidatenimport erzeugte
sdk/scripts/__pycache__/netaigis-model-router-activate.cpython-313.pyc. Nicht
versioniert, nicht ausgeliefert und wegen der bestehenden Bereinigungsbeschränkung
nicht gelöscht. Weitere Importe mit PYTHONDONTWRITEBYTECODE=1. Die zwei neuen
modellneutralen Profil-Transformationsdateien sind vorbereitender, noch unverbundener
Quellstand; ihre 10 lokalen Tests sind keine produktive Modellwechselabnahme.

### Fertige eigene VSIX und tatsächlicher Paketstart, 01.11.2026

Der vorherige Absatz „Noch keine fertige VSIX“ beschreibt den damaligen Stand.
Jetzt tatsächlich gebaut: tmp/phase4-checks-20261030T193507+0100/netaigis-coding-chat-0.1.0.vsix,
14.221.425 Bytes, SHA256 edef0ae50f424ada4feed54e151f1bc9a849fb76b7f147bfa61d34ba49d04c75.
Quellstand 6976c4fd5. ZIP-Integrität erfolgreich, 148 Einträge, eigene Identität
netaigis.netaigis-coding-chat / NetAigis Coding Chat / 0.1.0 bestätigt. Main-Bundle,
Webview und 28 deklarierte eigene Kommandos vorhanden; keine fremden Command-IDs,
privaten Daten oder erforderlichen Extension-Abhängigkeiten im Paket gefunden.
Keine Veröffentlichung und keine produktive Installation.

Webview-Produktionsbau und dessen Typprüfung erfolgreich; Extension-Produktionsbundle
mit explizit leeren Telemetrie-/Fehlerdienst-Schlüsseln erfolgreich. Der erste lokale
esbuild-Aufruf scheiterte an der Sandbox-Prozesskommunikation; nur dieser Aufruf
mit freigegebener nativer Ausführung erfolgreich wiederholt. 42 gezielte Speicher-/
Migrationsprüfungen bestanden. Die erste manuelle Proto-Lint-Ausführung ist trotz
Exitcode 0 ungültig: buf fehlte im PATH und das Upstream-Skript verdeckte den Fehler.
Danach tatsächliches buf mit lokalem PATH und explizitem Bash -e erfolgreich
ausgeführt (p4-proto-lint-actual-local-buf). Keine ungültige Prüfung als bestanden
übernommen. VSCE pack nach den einzelnen Build-/Typ-/Lint-Schritten benutzt;
kein npm-Lifecycle, kein Versionswechsel und kein Release-Tag.

Das tatsächliche VSIX wurde mit dem VS-Code-Installer in ein privates Testprofil
installiert. Der erste Prüfaufruf scheiterte vor jedem Prozessstart am bereits
vorbereiteten Prüfverzeichnis. Der erste Hostlauf fand die nachträglich verlinkte
Originalextension wegen der vorherigen Extension-Erkennung nicht. Der nächste
Lauf fand beide Extensions, verlangte aber fälschlich Runtime-Kommandos vor der
erforderlichen Migration. Das war eine falsche Testannahme: fork-entry.ts sperrt
bei erkannter Originalextension den leeren Neustart wie vorgesehen. Keine Änderung
dieses Schutzes und keine Änderung am Paket zur Umgehung der Prüfung.

Korrigierte Prüfung am unveränderten fertigen VSIX mit dem bereits vorhandenen
synthetischen Transfer, zwei normale VS-Code-1.143.1-Prozesse: Import erfolgreich
(13,25 s), nach echtem Prozessneustart Runtime erfolgreich (13,89 s), alle 26
Produktionskommandos registriert (zwei deklarierte Dev-Kommandos absichtlich nicht
im Produktionsmodus), eigene Sidebar geöffnet und Original-Cline 4.1.25 daneben
tatsächlich aktiviert. Eigene Extension aus dem installierten Paketverzeichnis
geladen, nicht aus dem Quell-Entwicklungsverzeichnis. Produktions-Home ausgeblendet,
Netzwerk getrennt, nur private Profile/Testdaten schreibbar. Beide eigenen Xvfb-
Prozesse mit deaktiviertem GLX liefen bis zur kontrollierten Beendigung; kein neuer
Absturz. Die vorangegangenen Fehlprotokolle sind erhalten.

51 Artefakte einschließlich fertigem VSIX, erfolgreicher und fehlgeschlagener
Prüfprotokolle sowie tatsächlicher Host-/Xvfb-Belege versiegelt:
tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.own-vsix-20261101,
SHA256 43f263430ed9785f1e7790cc1cfcd9984ff489bce16af5c05552b8c9c92eaae0.
Das ist eine belegte Paket-/Start-/Fixture-Migrationsprüfung, keine produktive
Secret-/Sitzungsmigration und kein tatsächlicher Modellantwort-/Android-Nachweis.

Unmittelbar notwendiger nächster Eingriff bleibt der oben konkret vorbereitete
Routerlauf. Der laufende DeepSeek-Dienst antwortete direkt; der unveränderte
produktive Router zeigte auf den nicht mehr laufenden alten Qwen-Pfad und der
Coding-Agent lieferte tatsächlich HTTP 503. Neue Routerfreigabe/Root-Bedienung
noch ausstehend; die frühere Adapterfreigabe umfasst ihn nicht. Nach Betreiber-
Ausgabe tatsächliche normale und gestreamte Antworten über den bestehenden
Coding-Agent prüfen und Fehler gezielt an der neuen Version reparieren. Erst
danach produktive VS-Code-Migration/Installation mit geprüfter Rückfallmöglichkeit
und der ausdrücklich verlangten gesonderten Freigabe. Dynamische Kontextvergrößerung,
gemeinsame Android-Sitzung und die übrigen offenen Gesamtanforderungen bleiben offen;
der erfolgreiche Paketbau ist kein Abschluss des Gesamtauftrags.

### Freigegebener Router tatsächlich aktiv, echte Antworten aus der VSIX, 01.11.2026

Betreiber hat den begrenzten Routereingriff ausdrücklich freigegeben und ausgeführt.
Root-Beleg ok=true, action=apply; Journal
/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-model-context-preflight/router-activation-5579820322b847bfb4d2fa24f214a9ff.jsonl.
Router-PID 1913536, InvocationID cebb2bec109d4b03b6d50140a95a8f76, NRestarts=0.
Quelle 948637effe8516d3196b64f332361ed946b245d408c2ca13cbc656f754aeb410
und Konfiguration eea634e63e3534875123f9b9f1f32ea54351b125636ed91865857ed0670f04fe
anschließend selbst über den bestehenden SSH-Zugang geprüft und bestätigt.
Die vorbereitete Umstellung ist angewendet, nicht nur als Betreiberbehauptung
übernommen. Coding-/Learning-/DeepSeek-PIDs und InvocationIDs entsprechen dem
vorher belegten Stand und blieben auch während der Funktionsprüfung gleich.

Echte Anfragen durch den produktiven Coding-Agent 11436/v1/chat/completions:
normal HTTP 200, fünf Antwortzeichen, finish_reason=stop (18,886 s);
Streaming HTTP 200, vier SSE-Datensätze, fünf Antwortzeichen, finish_reason=stop
und tatsächliches [DONE] (1,804 s). Keine Rohantwort oder Geheimnisse protokolliert.
Alle vier Health-Endpunkte HTTP 200. Router und Modell melden weiterhin tatsächlich
32768 geladene Kontextkapazität; keine 1-Million-Abnahme und keine Behauptung,
dass die offene dynamische Vergrößerung dadurch fertig sei. Erster Prüfwrapper
verweigerte vor SSH einen bereits vorbereiteten Verzeichnisnamen; neuer eindeutiger
Prüfbezeichner, kein wiederholter produktiver Eingriff. Nachweis
tmp/phase4-checks-20261030T193507+0100/logs/p4-router-functional-live.json.

Danach das unveränderte fertige VSIX mit eigener ID in einer weiteren abgeschirmten
VS-Code-Instanz tatsächlich über die Oberfläche verwendet: Chat-Eingabe gefüllt,
Senden gedrückt, Antwort NETAIGIS_READY sichtbar empfangen und Ende des Agent-Turns
bestätigt, eigener Testprozess kontrolliert geschlossen. p4-vsix-real-coding-ui
Exit 0, 62,16 s. Kein Fixture-Provider und kein direkt am UI vorbeigeschickter
Ersatzrequest: die Paket-Runtime wählte openai-compatible und das am unveränderten
Coding-Agent-Endpunkt aktuell gelistete Modell. Produktives Home ausgeblendet,
nur private Testdaten beschreibbar. Das ist ein realer grundlegender Chatnachweis
mit dem laufenden Modell, keine vollständige Android-/Recall-/Produktivabnahme.

Gezielte Prüfung der zu übernehmenden eigenen Client-Konfiguration: dort stehen
noch Qwen-Modell-IDs und 128000 Kontext. Der reale Chatnachweis nutzt dagegen die
aktuelle Modell-ID aus dem bestehenden API-Katalog und die tatsächlich gemeldete
Kapazität für diesen begrenzten Test. Diese alte Auswahl wird nicht still in den
produktiven Originaldaten überschrieben. Für die spätere neue-ID-Konfiguration
ist die bereits vom Benutzer gewählte laufende Modellinstallation zu berücksichtigen;
keine neue Namens-/Modellentscheidung oder Quellcodebindung an eine Modellversion.

#### Aktueller Rückfallstand vor einer möglichen lokalen Installation

Keine Wiederholung von Phase 2. Die aktuelle Cline-Datenkopie ist wegen der späteren
Installation zusätzlich erforderlich; die ursprüngliche installierte Erweiterung
stimmt vollständig einschließlich Metadaten mit dem bereits gesicherten Phase-2-
Manifest überein und wurde deshalb nicht erneut archiviert. Ihre alte tatsächliche
Wiederherstellung bleibt die Rückfallreferenz. Nur aktuelle Cline-Daten, eigene
Legacy-Ablage und vorhandene betroffene lokale Konfigurationsdateien aufgenommen:
19 Dateien, zwei konsistente SQLite-Backup-API-Snapshots, Archiv und tatsächliche
separate Wiederherstellung geprüft (p6-current-vscode-preflight, 8,03 s).

Geschützter vorhandener Sicherungsbereich, neuer notwendiger Unterordner:
/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase6-vscode-preflight-20261101.
SHA256SUMS.preflight hat SHA256 d6d22b17d75c2000b91fac78cd2a1c619704e838f00523e15ed056bb8edac12e.
Quellen unverändert, keine produktive Installation oder Migration. Originale
SELinux-Labels im Manifest erhalten; unprivilegierte Restore-Probe kann sie nicht
setzen. Das wird wie in Phase 2 ausdrücklich nicht als vollständige Label-
Wiederherstellung ausgegeben. Wiederverwendeter Phase-2-Sicherungscode zuvor gegen
seine bestehende Prüfsumme 98eb3a3f3eb9af28d56a9e27420df6586c1b0da0caad4cc1a3fd26631b6667ce geprüft.

Gezielt im nativen VS-Code-Speicher nach alter Extension-ID gesucht: ein Memento,
keine eigenen nativen Secret-Einträge; zwei Workspace-Datenbanken ohne alte eigene
Mementos. Andere Projektdateien nicht untersucht. Aktuelle native Zustandswerte
gegen Quelle und SQLite-Restore verglichen. Für den Export wurde ausschließlich
die eigene Native-Zuordnung in ein isoliertes Profil übernommen; keine fremden
Extension-Daten dort aktiviert. Alter tatsächlicher Extension-Kontext hat den
aktuellen geschützten Transfer erstellt (p6-current-data-native-export, 11,16 s).
Produktive Daten/Transfer bleiben vollständig außerhalb von Git. Aktuelle Daten-
Import-/Rücknahme-/Neustartprüfung läuft in dieser geschützten Kopie weiter.

Dabei konkreter Exporthelferbefund: für ein kopiertes Legacy-Profil fehlte die
Zuordnung zum ursprünglichen absoluten Legacy-Pfad. Der generische Importer konnte
originalFrom schon korrekt verarbeiten; der alte-ID-Helfer übergab es nicht.
Option legacyOriginalFrom ergänzt und relative/leere Angaben vor jeder Ausgabe
abgewiesen. Keine Änderung am Paket oder an der Import-/Secret-Grenze. Drei neue
gezielte Tests bestanden. Der erste Bun-Kombilauf hatte den bekannten SDK-Mock
statt des echten SQLite-Exports; im korrekten Vitest-Lauf 18/19 bestanden, nur
der echte Git-Checkpoint-Fall durch spawnSync git EPERM verhindert. Ausschließlich
diesen Fall nativ wiederholt: 1 bestanden, 15 andere übersprungen. Insgesamt die
19 betroffenen Fälle belegt, nicht die fehlgeschlagenen Vorläufe als grün gezählt.

#### Aktueller Datentransfer und echter Dateiwerkzeug-Nachweis abgeschlossen

Die aktuelle Profilkopie wurde im tatsächlichen alten Extension-Kontext exportiert:
15 Dateien, 54 bekannte/aufgezählte Secret-Schlüssel geprüft, tatsächlich null
vorhandene native Secrets. Dies passt zum unabhängig gelesenen ursprünglichen
Native-Store; kein leerer Ersatzexport für unlesbare Zugangsdaten. Transfer
migration-probe/transfer/identity-transfer.json im geschützten obigen Sicherungsordner,
SHA256 2c7e775828f5e4210b6de7b8fd93eb6dc069f064d223647e278a435508f6375d.
Import, tatsächliche Rücknahme und Reimport im installierten eigenen Paket bestanden
(10,75 s); danach echter normaler Neustart mit aktueller Datenkopie bestanden
(11,89 s). Vorhandene moderne Sitzung mit unveränderter ID, ursprünglichem Auftrag,
Provider/Modell, gespeicherten Prozesswerten und bytegleichem kanonischem Verlauf
erhalten; Pfad liegt im neuen eigenen Speicher. Drei vorhandene Legacy-settings.json
semantisch unverändert; in dieser ursprünglichen Legacy-Quelle liegen keine
kanonischen Gesprächsdateien. Daher keine erfundene Wiederherstellung dort fehlender
Gespräche behaupten. Ursprüngliche aktive Provider-Auswahl/Endpunkt erhalten.
Gespeicherte alte Prozesswerte sind kein Nachweis heute laufender Prozesse; keine
alte Aufgabe in dieser Prüfung gestartet oder als tatsächlich wiederaufgenommen
ausgegeben. Nachweise und echte Daten ausschließlich in migration-probe außerhalb
von Git. Die vollständige Extension-Typprüfung nach dem Exporthelferpatch bestand
(69,0 s); Produktbundle selbst unverändert.

Zusätzliche echte Modell-/Werkzeugprüfung am bereits installierten Test-VSIX:
p4-vsix-real-model-file-tool Exit 0 (76,14 s). Eingabe durch die Oberfläche,
laufendes Modell über den bestehenden Coding-Agent; Modell schrieb tatsächlich
netaigis-tool-proof.txt ausschließlich im privaten Testworkspace. Exakter Inhalt
auf Platte geprüft, SHA256 54dc04a6a661180cf8f6b0fde7092d6c0d79932e584b01be9b08a25645e72dfb;
Abschlussantwort sichtbar und Turn beendet. Keine Fixture-Antwort und kein
Dateischreiben durch den Testtreiber als Werkzeugerfolg ausgegeben. Produktive
Profile ausgeblendet, sonstige Dateisystembereiche schreibgeschützt. Originaler
Chatnachweis und dessen Skripte/Ergebnisse unverändert erhalten.

#### Konkret vorbereiteter nächster produktiver Schritt, noch nicht freigegeben

Auf die neueste Benutzerpriorität einer jetzt benutzbaren KI bezogene Grundversion:
vorhandenes VSIX 0.1.0 mit oben genannter Paketprüfsumme ausschließlich als
netaigis.netaigis-coding-chat zusätzlich installieren; alte Erweiterung nicht
ersetzen/deinstallieren. Vorher aktuellen Quellstand erneut gegen die gerade
geprüfte Sicherung vergleichen und bei Änderungen vor der Datenübernahme stoppen.
Verifizierten aktuellen Transfer über die vorhandenen own-ID-Migrationskommandos
in den neuen Namensraum übernehmen. Die alte Auswahl in den Originaldaten bleibt
erhalten; nur die neue-ID-Auswahl auf das bereits gewählte, am bestehenden Coding-
Endpunkt bestätigte Modell einstellen. Keine Modell-/Router-/Agent-Dienständerung,
kein geänderter API-Endpunkt. Aktuell geladene 32k sind eine benannte offene
Zwischenbegrenzung, keine dauerhafte Festlegung oder 1-Million-Abnahme.

Installationsaufruf ist konkret /usr/bin/code --install-extension gefolgt vom
oben geprüften absoluten VSIX-Pfad und --do-not-sync, ohne --force. Native Daten-
übernahme ausschließlich im berechtigten neuen Extension-Kontext über preview/apply;
keine direkten Änderungen an der produktiven VS-Code-SQLite-Datenbank. Danach
normaler Neustart der neuen Runtime und echte Chat-/Dateiwerkzeugprüfung. Kein
Beenden der produktiven ursprünglichen VS-Code-Instanz. Rückfall: neue Erweiterung
deaktivieren, eigene neue Daten erhalten und unveränderte Originalextension mit
ihrem ursprünglichen Speicher weiterverwenden; tatsächliche alte Wiederherstellung
und aktueller SQLite-Restore sind separat vorhanden. Keine Rücknahme, die neue
Benutzerarbeit löscht. Bei einem Fehler neue Version diagnostizieren und reparieren.

Für diese produktive Installation und Migration ist weiterhin die ausdrücklich
geforderte gezielte Benutzerfreigabe einzuholen. Die Routerfreigabe umfasst sie
nicht. Die Grundversion ist keine vollständige Abnahme des Gesamtauftrags:
dynamische Kontextvergrößerung, vollständige produktive Recall-/Learning-Abnahme,
gemeinsame Android-Livesitzung und Watchdog-Dauerbetrieb bleiben offen. Ihre
Fertigstellung wird durch eine etwaige freigegebene Zwischeninstallation nicht
als erledigt markiert.

Prüfnachweise anschließend tatsächlich versiegelt und nochmals per SHA256 gelesen:
44 zusätzliche Protokoll-/Metadaten-/Treiberartefakte unter
tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.router-and-live-vsix-20261101,
SHA256 a0be37d3d699dde782f9078a9730af0e6ff581e61012cce71e1de9488515d199.
28 tatsächliche Transfer-/Import-/Rücknahme-/Neustartartefakte ausschließlich im
geschützten migration-probe/SHA256SUMS.verified-transfer-probe,
SHA256 254eac95babb333832125e3ab127dac2c63c0566b9959aed4016270edc6d9486.
Vorherige Siegel unverändert. Paketprüfsumme erneut bestätigt. Keine produktiven
Sitzungsinhalte oder Zugangsdaten in Git kopiert. Nach Commit d3e4a7ebe konkrete
Benutzerfreigabe zur beschriebenen begrenzten produktiven Zwischeninstallation/
Migration angefragt; bis zur Antwort nicht anwenden. Der übrige Gesamtauftrag
bleibt offen und darf durch diesen Übergabestand nicht ersetzt werden.
