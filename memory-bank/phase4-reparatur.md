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
