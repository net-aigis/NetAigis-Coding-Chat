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

### Produktive Installation und Übernahme freigegeben und ausgeführt, 01.11.2026

Benutzerantwort auf die konkrete Installations-/Migrationsfreigabe lautet „mach“,
anschließend ausdrücklich „mach fertig“. Als Freigabe des bereits beschriebenen
begrenzten produktiven Schritts übernommen; keine weitere gleichlautende Frage.
Dies hebt keine offenen Gesamtanforderungen auf und genehmigt keine sonstigen
privilegierten Acer-Eingriffe.

Vor dem Eingriff bestehende Backup-/Transfer-Prüfsummen erneut gelesen sowie
aktuellen eigenen Dateistand und logischen SQLite-Sitzungsstand gegen die bereits
geprüfte aktuelle Sicherung verglichen: unverändert, kein erneuter Sicherungslauf.
Originales natives Memento ebenfalls unverändert bestätigt. Produktiver Ablauf
und ausschließlich geschützte Belege unter dem bestehenden Sicherungsunterordner
phase6-vscode-preflight-20261101/productive-rollout.

Eigene VSIX mit identischem SHA256 edef0ae50f424ada4feed54e151f1bc9a849fb76b7f147bfa61d34ba49d04c75
über /usr/bin/code --install-extension, explizites bestehendes Code-Benutzerprofil
und bestehendes Extension-Verzeichnis, --do-not-sync, ohne --force installiert.
Installer Exit 0, Paket tatsächlich unter
/home/friseer/.vscode/extensions/netaigis.netaigis-coding-chat-0.1.0,
ID/Publisher/Anzeigename/Version verifiziert. Original-Cline 4.1.25 vorhanden.

Der geprüfte aktuelle Transfer wurde danach tatsächlich über preview/apply im
berechtigten eigenen produktiven Extension-Kontext importiert. Ziel exakt
/home/friseer/.config/Code/User/globalStorage/netaigis.netaigis-coding-chat;
Manifest-Digest vor preview/apply und produktiver Migrationsbeleg danach nochmals
geprüft. result-migrate.json ok=true, 15 Dateien, erwartete null native Secrets.
Keine direkten Änderungen an der produktiven VS-Code-SQLite-Datenbank. Der CLI-
Aufruf für das eigens gestartete Migrationsfenster kehrte vor dem asynchronen
Ergebnis zurück; der erste lokale Wrapper meldete deshalb fälschlich einen noch
fehlenden Beleg. Anschließend der tatsächlich erfolgreiche Beleg und das produktive
Journal gelesen. Migration nicht wiederholt und kein unbekannter Zustand als
abgeschlossen ausgegeben.

Nur eigene neue Konfiguration bei noch nicht gestarteter eigener Runtime auf das
bereits gewählte, am bestehenden API-Katalog bestätigte Modell eingestellt:
beide Modi und zugehöriger vorhandener Providerstore konsistent; API-Endpunkt
bytegleich. Ursprüngliche Konfiguration im alten Namensraum erhalten. Geladene
Kapazität weiterhin 32768, anfängliches geprüftes Ausgabebudget 1024; kein neues
Backend-/Modellprofil und kein Modellneustart. Eigene vorangehende Konfiguration
im geschützten Ablaufbeleg erhalten. Produktive Paket-/Oberflächen-/Modellprüfung
läuft jetzt; Erfolg erst nach deren tatsächlichem Ergebnis dokumentieren.


### Fortsetzung: tatsächliche produktive Prüfung und danach veränderter Profilstand

Der vorige Abschnitt endet mitten in der Prüfung. Geschützte Belege unter
phase6-vscode-preflight-20261101/productive-rollout zeigen inzwischen:
productive-functional.json bestätigt echten Chat über die installierte öffentliche
Extension-API und echte Modell-Dateibearbeitung; beide Turns idle. Geschriebene
synthetische Datei SHA256 85d2229ef41818128e31b41a0d31da44a557e8019b11e543fed6f573feae84d2.
Dies ist eine begrenzte Funktionsprüfung, keine Gesamt- oder GUI-Abnahme. Der
vorangehende GUI-Smoke brach vor dem Chat mit TargetClosedError ab; konkrete
Ursache ungeklärt. Datenimport und Runtime-Prüfung hatten eigene erfolgreiche
Belege. Keine Schlussfolgerung, dass damit alle Nutzerprobleme behoben seien.

Bei der anschließenden lesenden Prüfung fehlen die eigenen und ursprünglichen
Extension-Pakete sowie der eigene globale Datenordner. VS Code meldet nun 1.144.0
statt der vorher geprüften 1.143.1. Die vorhandenen Code-Protokolle belegen unter
.config/Code/logs/20261101T172040/sharedprocess.log Marketplace-Installation von
Original-Cline 4.1.26 um 17:23:05 und mehrfache De-/Installation bis 17:29:47.
20261101T172959/sharedprocess.log belegt um 17:30:03 das Markieren und Löschen
von netaigis.netaigis-coding-chat-0.1.0, saoudrizwan.claude-dev-4.1.25 und 4.1.26.
Initiator dieser Änderungen und Ursache des fehlenden eigenen Datenordners sind
nicht nachgewiesen. Kein Datenverlust durch automatische Wiederholung kaschiert;
Phase-2-/aktuelle Datenkopie und Transfer bleiben erhalten. Frühere Installations-
belege beschreiben den damaligen Stand, nicht eine aktuell vorhandene Installation.

Neueste konkrete Nutzerfehler: dynamischer Kontext, nicht wirksame Freigaben für
Read/Edit/Commands/Web Fetch/MCP, Anzeige 32,8k. Der beim Zwischenrollout gesetzte
32k-Wert und das 1024-Ausgabebudget waren begrenzte Testwerte, keine endgültige
Kontextpolitik. Kontextvergrößerung auf Acer ist weiterhin nicht abgenommen.

### Nachgewiesener Einstellungswettlauf bei automatischen Werkzeugfreigaben

Schnelle Checkbox-Änderungen verwendeten denselben veralteten Renderzustand und
dieselbe Folgeversion. Der Host ignorierte gleiche Versionen; zusätzlich konnte
sein asynchroner Zustandsabruf zwei gleichzeitige Schreiber akzeptieren. Korrektur:
webviewweite Warteschlange für einzelne Änderungsabsichten, je aktueller Zustand
vom vorhandenen Host; bei Versionskonflikt höchstens drei frische Versuche.
Host-Versionsprüfung und Cache-Schreibvorgang synchron, veraltete Änderungen werden
explizit abgewiesen. Keine pauschale Erweiterung der Werkzeugberechtigungen.

Nachweise im bestehenden tmp/phase4-checks-20261030T193507+0100:
- p4-auto-approve-ui-race-red: tatsächlicher Hook mit veraltetem Renderzustand,
  1 bestanden/2 fehlgeschlagen vor Korrektur. Der frühere preliminary Test
  p4-auto-approve-concurrent-red verwendete die neue API gegen alte Implementierung
  und wird ausdrücklich nicht als gültiger Fehlernachweis gezählt.
- p4-auto-approve-ui-race-green und -final: jeweils 3/3 bestanden; fünf Freigaben
  bleiben erhalten, echter vorhandener Werkzeug-Policy-Mapper ausgewertet,
  Transportfehler blockiert keine Folgeänderung, konkurrierendes Fenster erhalten.
- p4-auto-approve-host-regression: 37/38 bestanden. Einziger Fehler war eine alte
  Cline-Namens-Erwartung im bereits umbenannten Hinweistext. Erwartung korrigiert;
  p4-mistake-limit-fork-guidance nur betroffener Fall bestanden, 27 übersprungen.
- p4-auto-approve-extension-types und -webview-types: Exit 0.
- Biome aus apps/vscode: alle sechs betroffenen TS-Dateien geprüft, Exit 0.
  Erster Aufruf vom Monorepo-Root scheiterte an verschachtelter Konfiguration;
  keine Konfigurationsmigration durchgeführt und diesen Aufruf nicht grün gezählt.
Noch keine aktualisierte VSIX oder produktive Abnahme dieser Korrektur.

Weiterer konkreter Fortsetzungsfehler in den bestehenden NetAigis-Ausgaben:
Runtime owner exit is unconfirmed; saved work was retained without automatic replay.
Die vorhandene alte Sitzung hat keinen heute lebenden gespeicherten Besitzer-PID;
das allein bestätigt jedoch weder historische Exitcodes noch beendet es alte
Terminalprozesse nachweislich. Schutz nicht entfernen, keine Befehle wiederholen,
keine alten unbekannten Zustände als Completed umdeuten. Sichere Wiederaufnahme
bleibt zusätzlich offen und darf nicht mit dem Checkbox-Fehler verwechselt werden.


### Dynamische Kontextzuteilung: gemeinsamer Profilpfad vorbereitet und gezielt geprüft

Lesender Acer-Nachweis: increase_context nutzt noch strata launch mit den alten
familien-/modellspezifischen Optionen. Die aktivierte Schutzprüfung verweigert den
falschen Modellstart. Der aktuelle Strata-Serve-Pfad bestätigt weiterhin nur
32768 Tokens. Die vorhandene CLI bietet für serve Profil/Foreground-Start,
keinen nachgewiesenen Hot-Context-Schalter. Der vorhandene Server unterstützt
--engine strata, --config und --shutdown-timeout; tatsächlich aktiver Start nutzt
--engine strata. Vorhandene Runtime-Log-, Arbeits-, Tokenizer- und Enginepfade sind
für friseer lesbar bzw. der bestehende Logpfad schreibbar; keine Rechte verändert.
Ein sinnvoller Kontextzuwachs erfordert einen kontrollierten Modellprozesswechsel,
keine bloße Änderung einer Zahl in der Erweiterung.

Vorhandene Profilarbeit fortgeführt: netaigis-model-profile.py bindet explizite
bestehende Rollen, Modelldatei, Kontextargument, Unit und Benutzer. Signatur blendet
nur das Kontextargument aus; Modell, Engine, Gewichtspfade und andere Optionen
bleiben geprüft. Das nächste Modell benötigt passende Konfiguration statt eines
neuen Modellnamens im Clientcode. Neuer netaigis-model-context.py läuft innerhalb
der bestehenden Modell-Unit als nicht privilegierter Besitzer seines eigenen
Foreground-Kinds. Er kann ausschließlich diesen Kindprozess verwalten. Keine
Coding-/Learning-Steuerung und kein Cline-interner Watchdog. Private Unix-Schnittstelle
mit Kernel-Peer-Prüfung für die vorhandene Router-Identität; keine Shell-Befehle
oder fremden PIDs aus Anfragen. Aktive Backend-Verbindungen blockieren Vergrößerung.
Beobachtungsfehler liefern unbekannt und keine bestätigte aktuelle Kapazität.
Fehlgeschlagene größere Zuteilung wird ausdrücklich gemeldet, derselbe Stand des
Modells nach Möglichkeit mit der vorigen kleineren Kapazität verfügbar gehalten;
dieselbe fehlgeschlagene Stufe wird während dieser Dienstlaufzeit nicht endlos
neu gestartet. Keine Wiederherstellung alter Implementierung als Normalablauf.

Gezielter Byte-/AST-Patch netaigis-model-router-context.py gegen genau den aktuellen
Router 948637effe8516d3196b64f332361ed946b245d408c2ca13cbc656f754aeb410:
vorhandene Anfragesperre und Sitzungs-/Streamingmethoden bleiben erhalten,
Kontextwachstum an den kontrollierten Profilpfad delegiert, Rollen verwenden ihre
eigenen konfigurierten Grenzen. /v1/models erhält additive optionale Metadaten,
die geladene Kapazität von konfigurierter Anforderungsobergrenze trennen. Unbekannte
Steuerung wird nicht als dynamisch bereit ausgegeben. Kein neuer Modellendpunkt.
Tatsächlicher Acer-Quelltext nur im Speicher gepatcht/kompiliert und unveränderte
unbetroffene Methoden per AST verglichen; Kandidat SHA256
f7c9a3e84b69928088383a2646213e4fe62b31ba4b8da7a2f42a2ce3a0cbdd66.
Originaldateien, Modellrouten und Dienste unverändert.

Prüfungen im bestehenden Nachweisordner:
- p4-model-profile-unit-promotion: 10/10 reine Profil-/Unit-Transformationen.
- p4-model-context-controller-native: erster Lauf 6/7; ein Test erwartete ValueError
  statt der tatsächlich korrekten Verweigerung selected_runtime_changed.
- p4-model-context-controller-corrected: 7/7.
- p4-context-router-socket-native: erweitert 10/10 mit echten lokalen Kindprozessen,
  HTTP und tatsächlichem Router-Client über Unix-Socket. Unsicherer Socket und
  fremde Kernel-Peer-ID abgewiesen; alter Kontext nach Beobachtungsfehler nicht als
  aktuell bestätigt gemeldet. Modelle bleiben ausdrücklich synthetische Fixtures.
- p4-router-context-transforms: 6/6, Rollen/Fehlerfall/keine verdeckte Inferenz.
- p4-actual-router-context-in-memory: Exit 0, actual source, keine Installation.

Noch NICHT belegt: Installation dieses Steuerpfads, Modellstart als friseer,
produktive Kontextvergrößerung, Hardware-Zuteilung bis eine Million Tokens oder
vollständiger neuer Dienst-Rückfall. ai-deepseek.service ist weiterhin transient;
vor einem Stop muss eine geprüfte persistente Definition und eine echte
Wiederherstellungsreferenz vorliegen. Keine bestehende Modell-/Servicefreigabe
auf diesen zusätzlichen Eingriff ausdehnen.

Für den nötigen nächsten Sicherungsschritt vorhandenen Helfer erweitert, keine
Phase-2-Wiederholung: --router-context-delta prüft den alten 7-Dateien-Nachweis und
verwendet dessen fünf unveränderte Dateien weiter. Ausschließlich die inzwischen
aktivierten zwei Routerdateien benötigen eine neue konsistente Dateisicherung
mit tatsächlichem Restore. Ziel ist der notwendige Unterordner
phase4-dynamic-context-delta unter den bereits vorhandenen geschützten Root- und
Exportablagen; nichts überschreiben. p4-context-incremental-backup-helper: 13/13
mit echtem GNU-tar-Restore in isolierten Fixtures. Anschließend nur gezielte
Zählkorrektur wiederverwendeter Dateien getestet: p4-context-incremental-reused-count.
Root-Ausführung, externe Zweitkopie und tatsächliche Prüfung dieses neuen
Zweidateien-Nachweises stehen noch aus. Vorher keine Anwendung vorbereiteter
produktiver Kontextänderungen.


### Client-Anbindung für gemeldete 32,8k-Anzeige implementiert

NetAigis Coding Chat fragt ausschließlich am explizit konfigurierten OpenAI-
kompatiblen /models-Endpunkt die optionale versionierte Laufzeitfähigkeit ab.
Keine Modellnamenliste, keine neue Modellauswahl, keine geänderte Route. Exakt
gewähltes Modell, Status ready/on_demand, positive konsistente Stufen erforderlich;
unbekannte, doppelte, fremde oder fehlerhafte Angaben werden verworfen. Abruf
auf drei Sekunden/ein MiB begrenzt, keine Redirects oder Geheimnisse in Logs.
Anzeige trennt zuletzt bestätigte Zuteilung und dynamische Anforderungsgrenze.
Bestehende Modellmetadaten bleiben erhalten. Sitzungsaufbau übernimmt die explizite
Laufzeitgrenze in denselben knownModels für Inferenz und Kontextkomprimierung;
die Zuteilung muss auf dem Server vor jeder Inferenz tatsächlich bestätigt werden.
Kein statischer Katalogwert erklärt dynamische Vergrößerung für funktionsfähig.

Gezielte Prüfungen:
- p4-dynamic-context-host: 117/118 bestanden. Neuer positiver Sitzungstest verwendete
  versehentlich actModeApiModelId statt des bestehenden actModeOpenAiModelId.
  Nur Fixture-Feld korrigiert; p4-dynamic-context-factory-selected: 1 bestanden,
  90 unbetroffene Fälle übersprungen. Kein Produktionsfehler daraus behauptet.
- p4-dynamic-context-ui: 6/6 bestanden, einschließlich dynamische Anzeige,
  zuletzt bestätigte 32,8k und unveränderte manuelle Komprimierung.
- p4-dynamic-context-extension-types und -webview-types: Exit 0.
- p4-dynamic-context-proto: Exit 0. Additiver optionaler Vertrag; erzeugte Dateien
  wie im Projekt vorgesehen ignoriert und aus versionierter Protoquelle erzeugt.
- p4-dynamic-context-webview-build: Exit 0 (104,48 s).
- p4-dynamic-context-extension-build: Sandboxfehler The service was stopped beim
  esbuild-Unterprozess. Nur diesen Build nativ wiederholt:
  p4-dynamic-context-extension-build-native Exit 0 (2,79 s).

Vorbereiteter Sicherungsbefehl (benötigt bestehenden Root-Terminalweg, nicht neue
Zugangsdaten):
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-preflight.py --remote --router-context-delta
Am 01.11. Benutzer um Ausführung gebeten, da sudo -n nicht verfügbar ist.
Dies ist keine Anwendungs-/Dienstfreigabe. Neue produktive Kontextsteuerung erst
nach geprüftem Zweidateien-Export, externer Kopie, vollständigem Anwendungs- und
Rückfallnachweis sowie gezielter zusätzlicher Acer-Freigabe. Bis dahin zeigen
bestehende Server ohne bestätigte neue Fähigkeit weiterhin ihre bisherigen Werte.


#### Zusätzliche Zweidateien-Sicherung tatsächlich abgeschlossen

Benutzer führte den bestehenden Root-Terminalweg aus: phase4-dynamic-context-delta,
2 Dateien, 5 alte unveränderte Dateien weiterverwendet. Root-Archiv/Restore mit
Owner/Mode/mtime/xattrs erfolgreich; keine Quelldatei oder Dienste geändert.
Archiv SHA256 bb6f13391c00e8e05d6c0073777204616cd6bdd77f559ccb79a0398e5e8fb4a6,
Manifest 17acd9e1eecc8eafd0337a763e6e05566cb9cc616419103f30e6e4321bf18f58,
SHA256SUMS 492950ddec354c5a41c217c3f395448f15ad832543682c0fc5314a6a87612d55.
Geschützten Export danach unabhängig per SSH auf Typ/Owner/0700 bzw.0600 und
alle drei Prüfsummen geprüft; externe Kopie unter
/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase4-dynamic-context-delta.
Dort vollständige Archiv-Mitgliederliste auf genau zwei reguläre erwartete Dateien
geprüft, erneut per tar tatsächlich nach restore-probe wiederhergestellt und Bytes,
Modi und mtimes gegen Manifest geprüft. Native Root-Owner-Wiederherstellung belegt
Acer, nicht die unprivilegierte lokale Probe. Geschützter Beleg external-verification.json.
Keine Secrets in Git übernommen, vorherige Sicherungen unverändert.

Wichtige tatsächliche Launcher-Prüfung anhand der bereits gesicherten Unit:
MainPID/User=Root gehört zum runuser-Wrapper, der Modellserver startet bereits
als friseer. Der echte Launcher verwendet die vorhandene Strata-Virtualenv
/home/friseer/.local/share/strata/terminal/0.1.53/python/bin/python3 -u,
keinen angenommenen System-Python. foreground_argv übernimmt dessen exakten
Programm-/Argumentvektor, entfernt nur den nachgewiesenen selben Benutzer-Wrapper
und ersetzt ausschließlich den --config-Pfad durch die private effektive Datei.
Kein Modell-/Engine-/Gewichtsaustausch. Zwei ergänzte reine Tests und vorhandene
zehn bestanden: p4-context-foreground-profile 12/12; tatsächlichen gesicherten
Launcher ebenfalls erfolgreich im Speicher geprüft. Produktive Anwendung offen.

#### Weitere tatsächliche Ursache der scheinbar gesetzten Werkzeugfreigaben

p4-dynamic-permissions-vscode-native: echtes installiertes Kandidaten-VSIX in
abgeschottetem Profil unter VS Code 1.144.0; fehlgeschlagen nach 43,15 s.
Host-Speicher begann korrekt mit verweigerten Aktionen/Version 1. Die Oberfläche
behielt jedoch ihre permissiveren Standardwerte derselben Version, weil
ExtensionStateContext nur incomingVersion > currentVersion übernahm. Das erklärt
sichtbare Häkchen bei tatsächlich fehlenden Host-Freigaben. Nach Klick auf die
fünf angezeigten Häkchen speicherte der bereits korrigierte RPC-Wettlauf Version 6
korrekt mit vier deaktivierten Aktionen und aktivierten Commands; Fehler war
hier die falsche erste Anzeige, nicht verloren gegangene fünf RPCs.

Echten StateContext-Provider zusätzlich mit gespeicherten Version-1-Verweigerungen
getestet: p4-auto-approve-hydration-red 1/2 bestanden, genau dieser Fall rot.
Korrektur: gleiche autoritative Version übernehmen, ältere weiterhin abweisen.
p4-auto-approve-hydration-green: 5/5 inklusive der drei Klick-Wettlauf-Fälle.
Xvfb blieb im fehlgeschlagenen Test bis zum kontrollierten eigenen Cleanup aktiv
und endete mit Exit 0. Dieser Fehlversuch ist kein Xvfb-Absturz und kein
produktiver Modelltest. Neue Webview samt Typprüfung erfolgreich gebaut
(p4-hydration-webview-build 101,54 s), eigener zweiter VSIX-Kandidat separat
verpackt; erster Kandidat und bisheriges produktives Paket unverändert erhalten.
Wiederholung nur des betroffenen nativen Tests läuft im separaten Testprofil.


#### Native Wiederholung bestanden und aktueller Arbeitsstand gesichert

p4-dynamic-permissions-vscode-corrected: Exit 0 (32,06 s), echter VS-Code-Host
1.144.0, tatsächlich installiertes eigenes VSIX aus isoliertem Extension-Verzeichnis.
Alle fünf Freigaben im selben Renderzustand geklickt; Host-Datei danach Version 6
und alle fünf Flags true, tatsächliche Checkboxen alle aktiviert. Test-Chat über
explizites lokales Fixture-Backend beendet; dynamische Anzeige 1,0m als
Anforderungsgrenze und 32,8k als zuletzt bestätigte Zuteilung gleichzeitig sichtbar.
actualModel=false/fixtureProvider=true im Ergebnis. Weder DeepSeek- noch 1m-
Hardware-Abnahme daraus ableiten. Xvfb blieb bis zum eigenen Cleanup aktiv,
Exit 0; keine produktive Instanz beendet oder installiert.

Zusätzlich bestehende drei Auto-Approval-Handler-Tests auf den nun synchronen
Zustandsabruf und expliziten Versionskonflikt angepasst; zusammen mit den drei
neuen Hostfällen p4-existing-auto-approve-handler 6/6 bestanden.
05dc81b6e erhält den tatsächlichen Strata-Virtualenv-Launcher bei der späteren
Kontextsteuerung. coding-agent-v4 bleibt 624c2cd6661e100680d8b61daa3a3447f4708536.

Neuer geprüfter Testkandidat (keine produktive Installation):
tmp/phase4-checks-20261030T193507+0100/netaigis-coding-chat-0.1.0-context-hydration-candidate.vsix
SHA256 1c3f993434cea487b097f61995cca7182ac8afe5175a1d3230407dcb837952cb,
14.223.177 Bytes, 148 Archivmitglieder, ZIP-Integrität und eigene Identität geprüft.
Bisheriger erster Kandidat 820bd8862a4f629014b18bf96f1354abe0453192a6dac310a04e5f8148e7104b
und älteres VSIX edef0ae50f424ada4feed54e151f1bc9a849fb76b7f147bfa61d34ba49d04c75 bleiben
unverändert. Alle ursprünglichen Sitzungen und Sicherungen erhalten.

Neue öffentliche Nachweise einschließlich Fehlversuchen versiegelt: 99 Dateien,
tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.context-and-approval-20261101,
SHA256 31a58f9b8ce3a4a4d47f1ec76e18f567c5b0f6ad1f02f127c26b3ce60d395036. Alle Einträge nach dem Schreiben erneut gelesen.


### Konkreter zusätzlicher Acer-Schritt vorbereitet, noch nicht produktiv freigegeben

Die Kontextanwendung aus den verifizierten privaten Quellen deterministisch erzeugt:
- /opt/ai-model-router/model_router.py
- /etc/ai-model-router.json
- /opt/netaigis-coding-agent/context_session.py
- neu: /opt/ai-model-router/netaigis-model-context.py und netaigis-model-profile.py
- neu: /etc/systemd/system/ai-deepseek.service als persistente Definition des
  vorhandenen Dienstnamens, mit vorhandenem Modellserver-Benutzer friseer
- neu: /etc/systemd/system/netaigis-coding-agent.service.d/context-allocation.conf

Private konkrete Kandidaten ausschließlich unter dem vorhandenen geschützten
Sicherungsunterordner phase4-dynamic-context-delta/candidate-plan. Kandidaten-
Manifest mit sieben SHA256 vorhanden. Unit per systemd-analyze verify --man=no
geprüft, Exit 0; kein Modell- oder Diensteingriff. Modellname, bestehende URLs,
Strata-Virtualenv, ursprüngliche Runtime-JSON, Gewichte, Embedding-Route und
Router-Sitzungsablage erhalten. Backend-/Learning-Identitäten nicht umbenannt.
Root-Code wird beim späteren Aufruf aus gepinnten öffentlichen Assets übertragen;
private Quellen bleiben in ihren bestehenden Acer-Sicherungen.

netaigis-model-context-candidate.py: sechs reine Kompositionstests bestanden;
zusätzlich aus den tatsächlichen lokalen Restore-Dateien ohne Änderungen an
Originalquellen aufgebaut. Nachweis p4-actual-context-deployment-preparation.json.
Kandidaten entsprechen genau den im Aktivierungshelfer gepinnten sieben Digests.

netaigis-model-context-activate.py führt erst nach zusätzlicher Freigabe und
bestätigtem ruhigem Wartungsfenster den bestehenden Root-Terminalweg aus.
Vor Änderung: alte und zusätzliche Backup-/Restore-Hashes, aktueller Quellstand,
Original-Runtime und Unit, vorhandene Zielpfade, Dateiattribute und Schutz anderer
Dienste prüfen. Neue Definition und vollständige Eingaben werden vor dem Stop des
transienten Modells bereitgestellt. Drei betroffene Dienste: ausschließlich
netaigis-coding-agent.service, ai-model-router.service und ai-deepseek.service.
Nach Stop wird auch die leere Kernel-cgroup bestätigt; MainPID=0 alleine genügt
nicht. Die Learning-Unit ai-agent.service bleibt aktiv und wird vor/nach verglichen.
Modelle, Ports, Secrets und bereits vorhandene Konfigurationsberechtigungen bleiben
erhalten. daemon-reload ohne Neustart anderer Dienste ist für die persistente
Definition erforderlich. Erster tatsächlicher Kontextzuwachs 32768 auf mindestens
65536 wird bei angehaltenen Anfrage-Gateways über die neue Schnittstelle und eine
unabhängige Backend-Health-/Modellabfrage bestätigt; erst danach Gateways starten.
Das beinhaltet noch keinen langen Inferenzlauf oder Million-Token-Nachweis.

Prüfungen am Ablauf ausschließlich in isolierten lokalen Fixtures mit echten
Dateischreib-/Veröffentlichungsvorgängen und simuliertem systemd/Modell:
p4-context-activation-transaction 12/12,
p4-context-activation-publish-and-process-gates 16/16,
p4-context-activation-final 17/17. Belegt sind Freigabegrenzen, kein Stop vor
persistenter Definition, kein Inferenz-Gateway vor bestätigter Vergrößerung,
kein Überschreiben fremder neuer Ziele, keine sichtbaren partiellen neuen Dateien,
kein falscher Erfolg bei abweichender unabhängiger Kapazität, kein Modellstop mit
unbekannter Prozessgruppe oder weiter bevölkerter cgroup. Eine Kernel-cgroup-
Entfernung ist keine erfundene Exitcode-Beobachtung. Tatsächliche Acer-cgroup
/system.slice/ai-deepseek.service nochmals lesend bestätigt, Dienst weiter active
und transient; keine produktive Ablaufprüfung behauptet.

Bei Fehler neue Implementierung behalten und ihre Verfügbarkeit gezielt reparieren.
Keine automatische Rücknahme zum ersten Fehler. Eine separat ausdrücklich
bestätigte Notfallfunktion kann die drei ursprünglichen Dateien sowie die alte
Unit-Definition aus den geprüften Restore-Quellen wieder bereitstellen; neue
Artefakte bleiben erhalten und die Reparatur der neuen Version bleibt offen.
Datei-Restore ist tatsächlich geprüft, Notfallablauf hier als Fixture geprüft;
produktiver Dienst-Wiederaufbau wurde noch nicht ausgeführt und wird nicht als
bereits bestanden dargestellt.

Nach erforderlicher gesonderter Acer-Freigabe (noch offen) ist der konkrete Aufruf:
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-activate.py apply --remote --maintenance-confirmed --external-copy-verified
Passwort ausschließlich im bestehenden Terminal. Während Initialisierung und
Kontextzuwachs kommen begrenzte echte Bereitschaftsprüfungen und Fortschrittsbelege;
keine wiederholten sleep-Kommandos und keine als Abschluss ausgegebenen Timer.
Der Aufruf darf nicht vor der gesonderten Freigabe gestartet werden.

Unverändert offen: tatsächliche Acer-Kontext-/Inferenzabnahme bis zur angeforderten
Obergrenze, sichere alte Aufgabenwiederaufnahme, durchgehende produktive Recall- und
Learning-Abnahme, gemeinsame authentifizierte Runtime Friseer/jimmi mit Android-
Browserabnahme, externer Watchdog-Dauerbetrieb, aktueller produktiver VS-Code-
Profilstand und abschließender eigener Rollout. Keine Phase als fertig markiert.

Neue Ablauf-Nachweise versiegelt: 9 Dateien, tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.context-activation-20261101,
SHA256 0ad1ec7aa7f9d64ce67ddc39ba86367441d6d3733c7d062cf11d90a624efa323. Erneut vollständig geprüft.


#### Abschließende Bereitschaftskorrektur vor dem Acer-Schritt

Vor der Anwendung zwei weitere konkrete Fälle im vorbereiteten Controller
reproduziert: ein bereits bereites Backend mit zu kleiner Kapazität und ein
bereites anderes Modell wurden bis zum Bereitschaftsdeadline erneut abgefragt.
p4-context-ready-mismatch-red: 0/2 bestanden. Korrektur trennt vorübergehend nicht
bereit von diesen abschließenden Widersprüchen; letztere scheitern sofort mit
konkretem Fehler statt die Wartefrist auszuschöpfen. p4-context-ready-mismatch-green
2/2 bestanden. Die zehn betroffenen realen lokalen Prozess-/HTTP-/Socketfälle
nochmals gezielt geprüft: p4-context-final-allocation-native 10/10 bestanden.
Aktualisierte öffentliche Asset-Prüfung ebenfalls bestanden. Ablauf- und
Konfigurationskandidaten unverändert, nur Controller-Quellbytes korrigiert.

Neuer Controller SHA256 c6959442e1df00ca02cac31c399052cd27fd45b57473388ece297290778ae0f5;
Aktivierungshelfer pinnt genau diese Version. Privates candidate-plan-v2/manifest.json
unter derselben geprüften Delta-Sicherung referenziert sechs unveränderte
Kandidaten aus candidate-plan und nur ein neu bereitgestelltes Controller-Artefakt.
Die identische bereits geprüfte Unit wurde nicht erneut gebaut/getestet.
Vorherige Kandidaten und Sicherungen unverändert; keine produktive Datei geändert.

Gesonderte Freigabe für diesen zusätzlichen Acer-Eingriff bleibt erforderlich:
sieben oben konkret aufgezählte Ziele, genau die drei betroffenen Units,
daemon-reload, tatsächlicher erster Zuwachs auf mindestens 65536. ai-agent.service,
Modellwahl, vorhandene API-Endpunkte und produktive VS-Code-Installation bleiben
dabei unberührt. Der ursprüngliche Gesamtauftrag bleibt über diesen Schritt hinaus
offen. Der Notfallaufruf ist ausschließlich nach gesonderter Notfallbestätigung
vorgesehen und kein automatischer Ablauf nach einem fehlgeschlagenen Test:
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-activate.py emergency --remote --maintenance-confirmed --external-copy-verified --emergency-confirmed
Er markiert die neue Reparatur weiterhin als erforderlich; neue Artefakte und
Benutzerarbeit werden nicht gelöscht. Die produktive Funktionsprüfung steht aus.

Zusätzliche neun Nachweise einschließlich roter Vorläufe versiegelt: tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.context-ready-final-20261101,
SHA256 904366a73d15f2cadc1c7eaf932c7c9afd2709f77fc1c052a7b08a6a30b1052d. Alle Einträge erneut gelesen.

### Acer-Kontextschritt freigegeben: Eigentümerprüfung vor Mutation korrigiert

Der Benutzer hat den begrenzten Eingriff aus ec3ad4cdb freigegeben und über
seinen Root-Terminalweg ausgeführt. Ergebnis: ok=false, Refused,
file_owner_type_or_protection_changed. Die bisherige pauschale Ausgabe
new_implementation_retained=true war in diesem Fall falsch: prepare scheiterte
vor der Transaktion und vor jeglichem Schreiben produktiver Dateien.

Ursache anhand des vorhandenen authentifizierten Sicherungsmanifests und des
tatsächlichen Prüfcodes belegt: Die ursprüngliche DeepSeek-Runtime-JSON gehört
UID/GID 1000, Modus 0644. Der wiederverwendete Adapter-Prüfer regular verlangte
auch für diese Restore-Eingabe Eigentümer Root. Dieselbe falsche Forderung war
auch für die Prüfung der unveränderten produktiven Runtime vorhanden.
Keine produktiven Rechte als Umgehung ändern.

Nach dem Fehlversuch ausschließlich lesend auf Acer kontrolliert: Router,
Konfiguration, Context-Tracker, Runtime-JSON und transiente Unit haben weiterhin
ihre gepinnten ursprünglichen SHA256; alle vier neuen Ziele fehlen weiterhin.
Modell PID 1745000, Router 1913536, Coding 1754988 und Learning 618787 sind weiterhin
active/running mit ihren unveränderten InvocationIDs. Keine Dienstaktion oder
Modellanfrage durchgeführt. Originalbranch und installierte Erweiterung unberührt.

Korrektur ausschließlich am lokalen Aktivierungshelfer: Restore-Eingaben und die
Original-Runtime mit SHA256, UID, GID, Modus, mtime und sämtlichen xattrs gegen
den authentifizierten Manifestdatensatz prüfen. O_NOFOLLOW, Inode-/Metadaten-
Abgleich vor/nach dem Lesen und feste Größenbegrenzung verhindern eine still
geänderte Eingabe. Root-eigene private Backup-Manifeste/-Archive sowie die
Deployment-Ziele behalten die strengen bisherigen Prüfungen. Die sieben
produktiven Kandidaten und ihre bereits geprüften Digests bleiben identisch.
Fehlerberichte unterscheiden jetzt vor Mutation, begonnene Schreibversuche,
bestätigte Schreibvorgänge und begonnene Dienstaktionen; unbekannte Ergebnisse
werden nicht als erfolgte Installation oder sichere Unverändertheit ausgegeben.

Regression p4-context-owner-prepare-red: echter prepare-Aufruf mit ursprünglichem
Benutzereigentum und simuliertem Root-Aufrufer reproduziert exakt denselben
Refused-Fehler (0/1). Nach Korrektur p4-context-owner-and-transaction-green:
22/22 bestanden, einschließlich der bisherigen 17 Ablaufprüfungen, geprüfter
Originaleigentümer bei Restore und produktiver Runtime, Attribute-/Hashabweichung,
Symlink-/Inode-Wechsel und korrekter Vor-Mutations-Fehlermeldung. Testdateien echt,
Root/systemd/Modell weiterhin simuliert; keine produktive Kontextabnahme behauptet.

Die erteilte Eingriffsfreigabe bleibt gültig. Derselbe Aufruf muss wegen fehlendem
passwortlosem Root im bestehenden Benutzerterminal erneut ausgeführt werden:
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-activate.py apply --remote --maintenance-confirmed --external-copy-verified
Passwort ausschließlich im Terminal. Keine erneute Freigabe, neue Sicherung oder
Rechteänderung erforderlich. Anschließend tatsächliche Kontextvergrößerung und
Inferenz prüfen; eine Million Tokens, Sitzungswiederaufnahme und der übrige
Gesamtauftrag bleiben bis zu ihrem jeweiligen Nachweis offen.

### Kontextaktivierung auf Acer erfolgreich, unabhängig kontrolliert

Der Benutzer hat den korrigierten Aufruf aus d4c1b3e4a erneut im bestehenden
Root-Terminal ausgeführt. Alle sieben gepinnten Kandidaten geschrieben, genau
Coding-/Router-/Modell-Unit gestoppt und neu gestartet. Vorherige Zuteilung 32768,
danach tatsächliche Backend-/Controller-Bestätigung 65536. Root-Journal:
/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-dynamic-context-delta/activation-88d191a916f54bcfba20260644f3dee8.jsonl.
Operator-Ergebnis ok=true, Learning unverändert; keine Inferenz im Root-Helfer.

Anschließend p4-context-applied-independent-path-corrected ausschließlich lesend
über den vorhandenen SSH-Zugang: alle sieben installierten SHA256 exakt bestätigt,
Original-Runtime weiterhin 6280e8607baf4d5e9b6c2474619e7da9c3c370432d36a9bd41d3db03a8b65e1e
und UID/GID 1000, Modus 0644. Modell persistent unter demselben Dienstnamen,
User friseer, MainPID 2084241, InvocationID ef3cc7b7fe1947d6a39440c08177a408.
Alle vier Dienste active/running; Learning-InvocationID unverändert.
Health-Endpunkte alle HTTP 200; Modell und Router bestätigen 65536.
Coding-Agent und Router reichen für genau das gewählte Modell dieselbe explizite
on_demand-Kapazität durch: loaded_capacity=65536, request_limit=1000000,
konfigurierte sieben Stufen. Das ist noch kein Million-Token-Inferenznachweis.
Der erste lokale Prüflauf scheiterte vor SSH an einem falsch abgeleiteten
Repositorypfad im Nachweisskript; nur dieser Pfad korrigiert und Prüfung wiederholt.
Keine Wiederholung produktiver Aktivierung oder Sicherung.

### Gespeicherte Sitzungen: dynamische Kapazität aus dem zuständigen Runtime-Zugang

Einen zusätzlichen belegten Wiederaufnahmefehler korrigiert: resumeSavedSession
entfernt aus Sicherheitsgründen den veralteten Client-Katalog und seine
Zugangsdaten. Die bisher allein im VS-Code-Neustartpfad ermittelte dynamische
Kapazität ging deshalb bei echter Runtime-Wiederaufnahme verloren. Roter Core-
Test p4-resume-dynamic-authority-core-red reproduzierte fehlende 1000000-Grenze.
Der frühere falsch aufgerufene SDK-Testlauf war kein gültiger Fehlernachweis.

Protokollleser nach Core verschoben und von der Erweiterung wiederverwendet;
keine zweite Speicherarchitektur. Runtime-Bootstrap fragt ausschließlich das
bereits aufgelöste serverseitige Providerziel mit seinen vorhandenen Credentials
ab. Ausdrücklich publizierte Grenze ergänzt die Metadaten genau dieses Modells;
Modellauswahl, Originalnachrichten und ursprüngliche Urheberschaft bleiben erhalten.
Neue Regression verwendet echten LocalRuntimeHost und kanonische Datei, mit
Fixture-Agent/Fetch; fremde Client-URL/Credentials und erfundene 16m-Grenze werden
ignoriert, kein Nachrichten-Overwrite. Dies behebt nicht die noch offene Prüfung
alter unbekannter Runtime-/Werkzeugzustände oder den produktiven Modellwechsel
einer historischen Sitzung.

Gezielte Prüfungen: p4-resume-context-sdk-final 23/23, einschließlich bestehender
Wiederaufnahme- und Prozessbeobachtungsfälle. Core-Entwicklungstypprüfung
p4-core-resume-context-types-corrected erfolgreich (129,39 s); vorheriger Lauf
meldete nur unzureichend typisierte Fetch-Spy-Argumente im neuen Test.
Erweiterung p4-resume-context-app-stub-corrected 129/129; der erste Lauf nach
Verschiebung scheiterte am bestehenden Core-Teststub, der die neuen Exporte noch
nicht bereitstellte. Der Stub exportiert jetzt die echte gemeinsame Implementierung.
Kein produktiver Fehler aus diesem Teststub behauptet. Core-Paket und Plugin-
Runtime gezielt erfolgreich gebaut; keine Installation oder Gesamt-Neubau.
Neues Erweiterungspaket und native Prüfung werden am aktuellen Stand fortgesetzt.

#### Tatsächliche Millionengrenze und neuer nativer Paketnachweis

p4-context-functional-live nach der Root-Aktivierung: normale und gestreamte
Antwort über den bestehenden Coding-Agent erfolgreich, beide HTTP 200, nichtleer,
finish_reason=stop; SSE zusätzlich [DONE]. Alle vier Dienstzustände vor/nach
identisch. Kein Learning-Neustart oder Wechsel des bestehenden Modellzugangs.

Anschließend einmalig über den bereits eingeführten benutzereigenen Control-Socket
ensure_context(coding, 1000000) ausgeführt. Nach 17,662 s ok=true/state=ready,
Backend-Health vorher 65536, danach loaded=true/max_context=1000000. Keine neue
Modellauswahl oder Änderung der ursprünglichen Runtime-Datei. Das ist ein echter
Zuwachs der konfigurierten laufenden Backend-Kapazität, aber noch kein Prompt mit
einer Million tatsächlichen Tokens und kein entsprechender KV-Speicherlastnachweis.
Unmittelbar danach p4-context-million-functional-live: beide echten normalen/
gestreamten Coding-Agent-Antworten ebenfalls erfolgreich, HTTP 200/stop, SSE [DONE],
Dienstzustände unverändert. Keine wiederholten sleep- oder Zuwachsversuche.

Neues VSIX mit gemeinsamer Core-Kontextabfrage gezielt gebaut/gepackt, ohne
Webview-Neubau (seit bestandenem nativen Hydrationstest unveränderte UI).
netaigis-coding-chat-0.1.0-context-resume-candidate.vsix,
SHA256 8596fc04665f1b82097cc3a06614dd2132c0bde9709d9c82806c748dcd38165b,
14.225.329 Bytes, 148 Archivmitglieder, ZIP-Integrität und eigene Identität geprüft.
p4-resume-context-packaged-native: bestanden (64,15 s) im abgeschotteten echten
VS Code 1.144.0; alle fünf Freigaben tatsächlich gesetzt und gespeichert, dynamische
Grenze und zuletzt geladene Kapazität getrennt sichtbar. Fixture-Backend, kein
produktiver DeepSeek-Test aus diesem GUI-Lauf behauptet. Xvfb bis zum eigenen
Cleanup aktiv, keine produktive VS-Code-Instanz beendet. Bestehende ältere Pakete,
Sicherungen und Originaldaten unverändert erhalten. Produktiver eigener Rollout,
alte unbekannte Sitzungs-/Werkzeugzustände, Recall/Learning-Gesamtabnahme,
gemeinsame Android-Runtime und externer Watchdog bleiben offen.

### Echte Werkzeugfreigaben: fehlender Übergang nach nicht gestartetem Terminal

p4-native-five-grants hat im tatsächlich installierten isolierten Paket Read und
Edit erfolgreich ausgeführt, scheiterte dann an Commands. Kanonischer Tool-Result
für grant-2: success=false, execution.state=not_started, Begründung fehlende
Shell-Integration. Kein falscher Abschluss, kein früher 3-Sekunden-Timer und kein
Abbruch eines laufenden Benutzerbefehls; der Befehl war bewusst nicht versendet
worden. MCP war korrekt verbunden und im tatsächlichen Toolkatalog vorhanden.
Die gespeicherten Häkchen waren richtig; die fehlende Ausführungsanbindung war
ein weiterer eigenständiger Fehler hinter der Benutzerbeobachtung.

createVscodeShellExecutor verwendet jetzt nach genau diesem typisierten
CommandNotStartedError den vorhandenen direkt überwachten Child-Process-Executor.
Originalcommand/argv, Arbeitsverzeichnis, Shell-Snapshot, Abbruchsignal und
derselbe bereits korrigierte Timeout bleiben erhalten. Bei unbekanntem Ausgang,
bestätigtem Fehler oder Abbruch kein zweiter Aufruf. Die sichere Verweigerung in
VscodeTerminalProcess bleibt bestehen; kein ungeprüftes sendText und keine
Verlängerung eines Beobachtungstimers als Ersatz. Commit 1c5db6c56 und seine
Ausgabeerhaltkorrekturen unverändert erhalten.

Neue echte Child-Process-Regressionen: p4-terminal-fallback-red 4/6, genau
Ausführung und Timeout-Übergang rot. Nach Korrektur zunächst 78/79 im kombinierten
Lauf; der einzige verbleibende Test erwartete fälschlich ein entferntes Newline.
Der vorhandene Prozess-Executor erhält dieses korrekt. Nur diese Testerwartung
korrigiert; p4-terminal-fallback-output-corrected 6/6. Die 73 bestehenden
Vordergrund-/Telemetryfälle waren bereits grün und wurden nicht erneut wiederholt.
Geprüft sind einmalige tatsächliche Ausführung, Nichtausführung bei unbekanntem
Status/Exit 7/allgemeinem Fehler/Abbruch sowie bestätigter Timeout mit Teilausgabe.
Die fünf früher erfolgreich gemessenen sleep-Laufzeiten wurden nicht wiederholt.
Erweiterungstypprüfung p4-terminal-fallback-types bestanden (128,52 s).

p4-native-five-grants-fixed: Exit 0 (83,76 s), echtes VS Code 1.144.0,
installiertes neues eigenes VSIX, fünf tatsächliche Werkzeuge ohne weitere
Bestätigung: read_files, editor, run_commands, fetch_web_content und
permission_fixture__permission_probe. Gelesener Inhalt geprüft, Datei tatsächlich
geändert, Command-Marker tatsächlich geschrieben, Webmarker tatsächlich geladen,
MCP-Aufruf auf dem separaten lokalen Fixture-Server angekommen. Kanonischer
Command-Result success=true, completed, PID 2329139, bestätigter Exitcode 0;
kein aus einer bloßen Rückgabe erfundener Prozessstatus. Xvfb im roten und grünen
Versuch bis zum eigenen Cleanup aktiv, Exit 0. Keine produktive Instanz beendet.
Modell im GUI-Lauf ausdrücklich Fixture; die zuvor separat nachgewiesenen echten
Coding-Agent-Antworten nach Kontextzuwachs bleiben als eigener Nachweis erhalten.

Neuer Kandidat netaigis-coding-chat-0.1.0-terminal-fallback-candidate.vsix:
SHA256 6777bc58774d87b847666782b247092a82f448ff4d855db8232858aa51b957bd,
14.225.385 Bytes, 148 ZIP-Mitglieder, Integrität/eigene Identität geprüft.
Vorherige Kandidaten nicht überschrieben. 59 neue Ergebnis-/Prozessbelege
einschließlich Fehlversuchen versiegelt und erneut vollständig gelesen:
tmp/phase4-checks-20261030T193507+0100/SHA256SUMS.context-million-and-tool-grants-20261101,
SHA256 77620f1d050d91e2768e8a83d1ba380583be0a7a5362ba30c8852258e79087a3.

Anschließende gezielte Prüfung des produktiven Profils: weiterhin weder eigene
noch Original-Cline-Pakete im Erweiterungsregister, beide Daten-Namensräume fehlen.
Historische Shared-Process-Logs belegen den expliziten Uninstall aus dem Profil
um 17:22:41 und die spätere Entfernung von der Platte um 17:30:03; Initiator und
Ursache verschwundener Daten weiterhin ungeklärt. Keine Benutzerentscheidung
hieraus erfinden. Die bereits freigegebene eigene Wiederinstallation mit
abgesicherter Datenübernahme wird vorbereitet; der Gesamtauftrag läuft weiter.

### Eigene produktive Wiederinstallation mit aktuellem Datenstand erfolgreich

Fortsetzung auf fbb00b07b; die bereits erteilte produktive Freigabe beibehalten.
Vor Eingriff den alten geprüften Transfer mit dem aktuellen expliziten Cline-
Quellbestand verglichen. Fünf Textdateien und die Session-Datenbank waren inzwischen
geändert; ein eigenes Workspace-State-Dokument hinzugekommen. Deshalb keine
Übernahme des veralteten Transferstands. Neue inkrementelle Sicherung ausschließlich
unter dem vorhandenen geschützten Rolloutordner:
/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase6-vscode-preflight-20261101/productive-rollout/context-tool-repair-20261101.

Zehn neue/aktuell betroffene Dateien erfasst: sieben Cline-Quelldateien inklusive
SQLite-Backup-API-Snapshot, aktuelle native VS-Code-SQLite und zwei Registrydateien.
Sechs unveränderte Home-Dateien und die drei früher gesicherten Legacy-Settings
wiederverwendet. Native Secrets des alten Kontextes weiterhin null und dessen
Memento nachweislich unverändert; ursprünglichen echten Native-Export unverändert
weiterverwendet, keinen Zugriff der neuen ID auf fremde Secrets vorausgesetzt.

Die erste Abschlussprüfung stoppte wegen neu hinzugekommener echter SQLite-WAL/
SHM-Begleitdateien. Diese gehören zur Backup-API-Koordination, nicht zu neuen
Benutzerdateien. Nur die Behandlung nachgewiesener SQLite-Sidecars korrigiert,
dieselbe bereits erstellte Sicherung ohne zweite Aufnahme zu Ende geprüft.
Aktuelle Session-Datenbank und Snapshot zusätzlich logisch gleich, Integrität ok.
Tatsächlicher Restore aller zehn Archivdateien im selben geschützten Unterordner,
Bytes sowie ursprüngliche UID/GID/Modus/mtime/xattrs bestätigt. Originaldateien
und ihre produktiven Berechtigungen nicht geändert. Neue Sidecars werden nicht
als veränderte Datenbankinhalte ausgegeben und nicht unkontrolliert gelöscht.

Neuer Transfer 16 Dateien, SHA256
cfd28898f4f18b28c88ad0d1b1257d05b7e28271fc4ae0e7b3de4531ebf3b5ea;
SHA256SUMS.preflight im neuen Rollout-Unterordner:
850f66fe0de93d38b6cea8c18c568461208438d1e15b0665183c94a76a4e1afa.
Alle Einträge gelesen und geprüft. Vorhandene ältere Transfers/Sicherungen erhalten.

Eigenes geprüftes VSIX SHA256 6777bc58774d87b847666782b247092a82f448ff4d855db8232858aa51b957bd
über die vorhandene Code-CLI installiert, ID netaigis.netaigis-coding-chat/0.1.0.
Nur diese Erweiterungs-ID hinzugekommen, keine andere entfernt. Strenger vollständiger
Registervergleich schlug an: VS Code ergänzte bei openai.chatgpt eine UUID und
normalisierte redundant serialisierte URI-Felder. ID, bestehende Version und Pfad
sowie vorhandenes Paketmanifest (vor Installationsbeginn datiert) gleich geblieben.
Der Migrationsschritt wurde zu früh vor Auswertung dieser Warnung gestartet;
dieser Ablaufmangel und der ursprüngliche Warnbeleg bleiben ausdrücklich erhalten.
Separate installation-registry-verification.json grenzt die Metadatenabweichung ein.
Ein Vorher/Nachher-Vergleich sämtlicher Codex-Paketbytes lag nicht vor und wird
nicht behauptet. Keine Wiederherstellung des gesamten Registers über neuere Arbeit.

Echte Migration im neuen eigenen Extension-Kontext bestätigt: 16 Dateien,
keine nativen Secrets, kanonische Originalnachrichten semantisch identisch,
aktuelle Einstellungen erhalten. Keine nachträgliche Modell-/Endpunkt-Umschreibung
oder erneute Begrenzung auf 32k/1024. Der aktuelle Quellbestand enthielt bereits
den gewählten DeepSeek und keinen temporären Max-Output-Cap. Alte Runtime-Marker,
Checkpoints, Urheberschaft und Originalhistorie erhalten. Migrationsergebnis im
geschützten migration-result.json; ältere Quellpfade unangetastet.

Produktive echte Funktionsprüfung über das installierte API (kein Fixture):
- Chat 1793564358703_ge39i: DeepSeek antwortet am unveränderten Coding-Agent-Zugang.
- Dateitest 1793564416953_k9oq5: neue eigene Testdatei tatsächlich erstellt und
  read_files tatsächlich ausgeführt, Inhalt exakt geprüft. Erster 100-Sekunden-
  Prüfdeadline lief ab, während der Modellturn noch lief; ursprüngliches negatives
  productive-functional.json bleibt unverändert. Später idle und geforderte
  Abschlussantwort bestätigt, ohne diesen Turn oder Edit erneut auszuführen.
- Erst danach ausschließlich das eigene inzwischen ruhende Entwicklungsfenster
  anhand desselben exakten Entwicklungspfads neu geladen. Das gezielte Wieder-
  verwendungsverhalten ist in der tatsächlich installierten VS-Code-mainImpl.js
  belegt; keine andere Benutzerinstanz beendet. Übrig gebliebenen Commands-Test
  1793564775638_yhbfy ausgeführt: tatsächliches run_commands, success=true,
  completed und bestätigter Exitcode 0; abschließende echte Modellantwort vorhanden.

productive-functional-continuation.json: ok=true, produktiv, fixtureProvider=false.
Dateiprüf-SHA256 85d2229ef41818128e31b41a0d31da44a557e8019b11e543fed6f573feae84d2.
Danach normales Fenster ohne Entwicklungstreiber geöffnet (normal-window.json,
CLI Exit 0). Originaltranskript unter ~/.cline weiterhin SHA256-identisch zum
aktuellen Transfer. Native fünf Werkzeugklassen im isolierten Paket separat
vollständig geprüft; produktives Web-Fetch/MCP mit bestehenden Zugängen und die
übrige Gesamtabnahme bleiben zusätzliche offene Nachweise.

### Externer Watchdog: vier explizite Ziele vorbereitet, noch nicht installiert

Vorhandenen separaten Beobachter um wiederholbares --target UNIT=LOOPBACK-HEALTH
ergänzt. Kein Modellname in der Probe-Logik, keine Cline-/Agent-Importe, keine
Steueraktionen oder Inferenz. Service-Vorlage nennt die vier aktuell belegten
Coding-/Learning-/Router-/Modell-Units; spätere Zielkonfiguration kann unabhängig
vom Cline-Client angepasst werden. Ungültige/mehrfache Ziele vor Abfragen abweisen;
maximal acht Ziele und dazu passendes begrenztes systemd-Zeitbudget.

p4-watchdog-configurable-targets-red: gültige vier Ziele bisher unbekannte CLI-
Option, reproduziert. p4-watchdog-four-targets-green 9/9 bestanden einschließlich
bisheriger realer HTTP-/PID- und Fehlerfälle. Lokale Unit-Verifikation scheiterte
zunächst an gesperrten Sandbox-Socket-Optionen; nur die statische Prüfung nativ
wiederholt, p4-watchdog-unit-verification-native Exit 0. Keine Unit geladen/gestartet.
p4-watchdog-current-four-targets tatsächliche ausschließlich lesende Acer-Prüfung:
alle vier Beobachtungen healthy; keine Dateien/Services geändert. Genau die drei
vorgesehenen Installationsdateien fehlen, beide Watchdog-Units not-found.
Root-Installation und Aktivierung des getrennten Timers sind noch offen und
benötigen vor diesem zusätzlichen produktiven Eingriff eine gezielte Freigabe.
Bestehende Acer-Freigaben erlauben keinen stillschweigenden neuen Dienst.

Gesamtauftrag weiterhin aktiv. Belegter Fortschritt ist eine jetzt tatsächlich
nutzbare eigene Installation mit echtem Chat/Edit/Read/Commands und dynamischer
Backend-Grenze; vollständige alte Sitzungswiederaufnahme bei unbekannten Prozessen,
durchgehende Recall-/Learning-Abnahme, gemeinsame authentifizierte Friseer/jimmi-
Runtime mit Android und unabhängiger Watchdog-Dauerbetrieb bleiben offen.

#### Separater Watchdog: begrenzter Root-Aktivierungshelfer vorbereitet

netaigis-watchdog-activate.py stellt ausschließlich drei gepinnte öffentliche
Artefakte neu bereit: /usr/local/libexec/netaigis-watchdog.py,
/etc/systemd/system/netaigis-watchdog.service und netaigis-watchdog.timer.
Der Standard-Enable-Link unter timers.target.wants wird auf Kollision geprüft.
Unbekannte bestehende Dateien oder fremde Links werden nicht überschrieben.
Bestehende kontrollierte Backup-Ablage wird nur um ein privates Aktivierungsjournal
mit vorheriger Abwesenheit und Dienstzuständen ergänzt. Keine neue Sicherung
unveränderter Modell-/Coding-/Learning-Dateien.

Nach gesonderter Freigabe: daemon-reload, nur den eigenen Beobachtungsdienst
einmal starten und dessen echte strukturierte Journalausgabe aus genau dieser
systemd-Invocation prüfen. Erst dann ausschließlich den eigenen Timer aktivieren.
DynamicUser sowie die vorhandenen Dateisystem-/Netzwerkbeschränkungen bleiben
erhalten. Kein beobachteter Dienst wird gestartet, gestoppt oder neu konfiguriert,
keine Inferenz angefordert. Beobachtete Fehler/unbekannte Zustände bleiben solche;
ein erwarteter Exit 1 bei erkanntem Infrastrukturproblem wird nicht zu gesund
umetikettiert. Fehlende echte Beobachtung verhindert Aktivierungserfolg.
Vor/nach die vier beobachteten Unit-Zustände vergleichen; keine automatische
Rücknahme oder Löschung neuer Artefakte nach Fehlern.

p4-watchdog-enable-link-scope: 11/11 bestanden. Echte lokale Fixture-Dateien und
atomare Veröffentlichung, Root/systemd/Journald simuliert. Geprüft sind zusätzliche
Freigabe, Assetdrift, Kollisionen, ausschließlich eigene Steueraktionen,
vollständige Veröffentlichung vor Start, kein Timer vor echter Beobachtung,
korrekte Behandlung von ungesund/unbestätigtem Prozess und Erhaltung der Belege.
Dies ersetzt noch nicht den produktiven DynamicUser-/Timer-Nachweis.

Konkreter Aufruf ausschließlich nach neuer gezielter Watchdog-Freigabe:
PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-watchdog-activate.py apply --remote --installation-approved
Passwort nur im bestehenden Root-Terminalweg. Keine Freigabe oder Ausführung
für diesen neuen Dienst bislang vorausgesetzt. Nach Anwendung echte Journald-
Beobachtung, periodischen Lauf und unveränderte vier KI-Dienste prüfen.

### Gemeinsame Runtime: fehlenden VS-Code-Einrichtungsweg und Cachegrenzen repariert

Auf 35b6ce877 fortgesetzt. Belegter Integrationsmangel: saveSharedSessionHubConnection
hatte außerhalb seiner Tests keinen Aufrufer. Der vorhandene Remote-Adapter war
somit nicht über die VS-Code-Oberfläche einrichtbar. Eigener registrierter Befehl
netaigis-coding-chat.runtime.configure führt jetzt zur bestehenden Verbindung,
ohne zweiten Hub, neue Datenablage oder Modell-/Endpunktänderung. Persönlicher
Runtime-Token ausschließlich über Passwortfeld; keine Credentials in Command-
Argumenten/URLs/Protokollen. Echte Registrierung muss eine Benutzeridentität
bestätigen; ein Admin-/Beobachtertoken genügt nicht. Kein Writer-Claim bei Anmeldung.
Plaintext ws nur für expliziten Loopback, sonst zertifikatsgeprüftes wss.

Der Wechsel ist vor dem ersten Sitzungs-Host möglich; aktive/auch bereits benutzte
Hosts sowie ausstehende Starts/Stops verhindern ihn. Weder Abbruch noch dispose
einer aktiven Sitzung dienen als Einrichtungsabkürzung. Neue Starts und historische
Aufgabenauswahl während des Wechsels gesperrt; die bisherige synchron angelegte
Auswahlgeneration bleibt erhalten. Ein ungenutzter reiner Lesehost und dessen
Metadatencache werden unter Ausschluss konkurrierender Leseoperationen verworfen.
Kein Wechsel bei noch laufender Erstellung/Abfrage dieses Hosts. Keine Session
kopiert oder neu erstellt. Eine angezeigte Aufgabe bleibt bestehen und blockiert
die Umstellung; dies ist keine behauptete Live-Migration laufender Prozesse.

Auswahl pro StateManager/Fenster gehalten: eine anderweitig aktualisierte
Konfiguration lenkt vorhandene Verlaufs-/Recall-Abfragen nicht in eine andere
Runtime um. Erst ein eigener bestätigter Wechsel aktualisiert diese Auswahl.
Gescheiterte Persistenz setzt den vorherigen Secret-Cache zurück und schreibt ihn
erneut; schlägt auch dies fehl, bleibt der Datenträgerzustand ausdrücklich
ungeklärt und weitere Verbindungsabfragen scheitern. Kein falscher Erfolgsbeleg.

Tatsächliche Prüfungen im bestehenden Phase-4-Prüfverzeichnis:
- p4-shared-runtime-setup-red: 48 bestanden, 11 neue Fehler reproduziert.
- p4-shared-runtime-setup-green: 93 bestanden, drei alte Fixtures verwenden nun
  unzulässiges nichtlokales ws. Ausschließlich diese Fixture-Endpunkte auf wss
  geändert; Sicherheitsprüfung nicht abgeschwächt.
- p4-shared-runtime-cache-and-setup: 167/167 bestanden, einschließlich bestehender
  Lifecycle-, History-, Taskauswahl-, Recall- und Hostadapterprüfungen.
- p4-shared-runtime-window-selection: 28/28 nach zusätzlicher Fensterbindung,
  Fehlerzustand nach misslungener Rückschreibung und UI-/Abbruchprüfungen.
- p4-shared-runtime-personal-transport: Socketlisten durch Sandbox mit EPERM
  abgewiesen; kein Quellcodefehler daraus behauptet. Nur diese Prüfung nativ
  wiederholt: p4-shared-runtime-personal-transport-native 1/1, tatsächlicher
  lokaler WebSocket-Server, Friseer und jimmi getrennt bestätigt, Admin-only und
  falscher Token abgewiesen. Keine Inferenz/Sessionausführung oder produktiven
  Daten; Runtime-Methoden als Fixtures, also keine produktive Übergabeabnahme.
- p4-shared-runtime-setup-types: ein Typfehler ausschließlich im neuen Testhelper;
  Signatur berichtigt. p4-shared-runtime-setup-types-corrected Exit 0.
- p4-shared-runtime-setup-lint Exit 0 vor abschließender Fensterbindung. Native
  Command-Implementierung in hosts/vscode abgelegt, keine Lintausnahme erweitert.

Zusätzliche schon erfolgte lesende Acer-Recall-Prüfung:
p4-current-recall-actor-readonly bestätigt HTTP 200 mit beiden vorhandenen
persönlichen Recall-Zugängen am unveränderten API-Endpunkt für den bekannten
Projektbereich total-recall-production-test. Je ein dortiger Verlauf sichtbar.
Ohne project_id jeweils erwartetes HTTP 422. Keine aktuellen Datenbankinhalte
über andere Projektbereiche behauptet, keine Archivierung geschrieben und keine
Recall-Zugänge als Hub-Zugänge wiederverwendet. Produktiver Projektbereich,
vollständige laufende Archivierung und gemeinsame Runtime weiterhin offen.

Neue Einrichtung ist Quellcode im Reparaturbranch; noch nicht über die laufende
produktive Installation ausgerollt. Diese bleibt mit dem zuletzt abgenommenen
Chat/Edit/Read/Commands-Paket nutzbar. Kein produktiver Hub gestartet, keine
LAN-Freigabe oder Zertifikate angelegt. Getrennte Watchdog-Freigabe/Root-Ausführung
weiter ausstehend. Nächste Arbeit: Schreibübergabe im VS-Code-Client explizit
bedienbar machen, vorhandenen Hub mit denselben kanonischen Daten kontrolliert
bereitstellen, Recall und physisches Android tatsächlich abnehmen. Alte unbekannte
Prozesszustände bleiben gesperrt; keine alten Exitcodes nachträglich erfunden.

### Schreibübergabe: VS-Code-Bedienung auf derselben Runtime-Verbindung

Auf d7bba0f59 fortgesetzt. Eigene Command-IDs runtime.claimSession und
runtime.releaseSession ergänzen die Verbindungseinrichtung. Zuerst tatsächlichen
Writerzustand für die aktuell angezeigte Session-ID lesen; danach ausdrückliche
Bestätigung mit dieser ID, persönlicher Akteur-ID und unveränderter CAS-Revision.
Eine inzwischen gewechselte Aufgabenansicht kann nicht versehentlich dieselbe
Revision auf eine andere Sitzung anwenden. Der Host leitet get/claim/release und
Akteurabfrage direkt an seine bereits vorhandene Core-Verbindung weiter. Kein
temporärer Anmeldeclient hält ein nutzloses Schreibrecht für einen später anderen
Client. Derselbe gecachte Host wird für den nachfolgenden kanonischen Start benutzt.

Vor Mutation erneute persönliche Anmeldung/Zustand lesen, dabei die zuvor
bestätigte Revision NICHT durch die frisch gelesene ersetzen. Konkurrenz, unbekannte
Prozesse oder verlorene Quittung bleiben Fehler ohne automatische Wiederholung.
Ausstehende Starts/Stops und andere aktive Session blockieren; die Sitzung wird
zum Einrichten der Übergabe weder gestartet noch beendet oder neu erzeugt. Das
ausdrücklich folgende Starten durch den Nutzer verwendet dieselbe ID/Verbindung.
Antwort mit anderer ID, anderem Akteur oder fehlendem gefordertem Writerzustand
wird nicht als Erfolg angezeigt. Lokaler Betrieb erhält keine fingierte Akteur-ID.
Serverseitige geschützte Zustände und unveränderliche Urheberschaft unverändert.

p4-vscode-writer-controls 86/86 bestanden: neue Lifecycle-/Command-/Host-
Vertragsfälle sowie betroffene bestehende Lifecycle- und Recall-Tests. Prüfung
verwendet gezielte Host-Fixtures, keine produktive Übergabeabnahme. Der reale
Anmelde-Transportnachweis aus dem vorherigen Schritt bleibt bestehen.
p4-vscode-writer-controls-types Exit 0. Keine erneute Migration/Installation,
kein produktiver Hub und keine Änderung an Acer-Diensten in diesem Schritt.

Die gemeinsame echte Modell-/VS-Code-/Android-Abnahme ist weiterhin erforderlich.
Der nächste isolierte Integrationstest soll den tatsächlich konfigurierten
Coding-Agent-Zugang nutzen und den bereits vorhandenen Hub mit der echten neuen
VS-Code-Anbindung verbinden; dabei keine produktiven Sitzungsdaten verändern.

### Fortsetzungsnachweis: echte gemeinsame Modellsitzung, Installationsdatei

Der anschließende isolierte native Pakettest verwendete den tatsächlich
konfigurierten Coding-Agent-Zugang und DeepSeek, keinen Fixture-Provider.
Arbeitsartefakte bleiben im bisherigen Prüfverzeichnis unter
test-data/p4-real-shared-vscode-model. Erste zwei reale Modellturns unter
Friseer und jimmi in derselben ID 1793568939815_yktbw; die zweite Antwort
erschien in derselben echten VS-Code-Ansicht. Originalbeitrag unverändert.
Die echte eigene Schreibrechtsübernahme über Befehlspalette und Bestätigungsdialog
bestand im anschließenden result-ui-continuation.json. Keine Wiederholung der
bereits erfolgreichen Modellturns. result-state-continuation.json bestätigt
zusätzlich residente Runtime vor/nach Schließen des eigenen Testfensters,
weitere tatsächliche Modellantwort danach und Urheberfolge Friseer/jimmi/jimmi
in derselben kanonischen Sitzung. Zwischen Prüfversuchen wurde der Test-Hub
kontrolliert beendet und dieselbe gespeicherte Sitzung wieder aufgenommen;
kein durchgehend laufender Hub über diese Neustarts hinweg behauptet.
Physisches Android, produktiver Hub und Recall-Abnahme bleiben offen.

Vorherige Testfehler bleiben erhalten: erster Fensterstart vor jeder Inferenz
fehlgeschlagen; Test-XDG-Pfad 124 Bytes erzeugt für Unix-Sockets nachgewiesen
AF_UNIX path too long. Vorhandener /run/user/1000 statt neuer temporärer Ablage
ermöglichte den nativen Start. Erste Browser-Fehlerausgabe war nicht erfasst.
Xvfb blieb jeweils bis zur eigenen Beendigung aktiv, jeweils Exit 0. Später
fehlte im Testtreiber das >-Präfix der Befehlspalette; anschließend benutzte eine
Zusatzabfrage den nicht vorhandenen Befehl session.snapshot. Nur diese fehlenden
Schritte korrigiert/fortgesetzt, auf den vorhandenen session.get-Vertrag mit
runtimeResident umgestellt. Kein Core-Zugriffsschutz dafür abgeschwächt.

Beim letzten Test-Hub-Shutdown zusätzliche reale Fehlermeldung des abgeleiteten
Suchindexes: database is not open. Ursache im gelesenen Quellpfad: Index wird
vor sessionHost.dispose geschlossen; dessen ended-Ereignis kann danach erneut
refreshNow starten, weil der Suchdienst bisher keinen Dispose-Zustand prüft.
Gezielte Shutdown-Regression und Korrektur stehen als nächste Reparatur offen.
Erfolgreiche Modell-/UI-Schritte nicht erneut ausführen. Testquellen liegen im
vorhandenen ignorierten Prüfverzeichnis; noch keine neue produktive Installation.

Zuletzt dokumentiert produktiv installiertes Paket weiterhin vorhanden:
tmp/phase4-checks-20261030T193507+0100/netaigis-coding-chat-0.1.0-terminal-fallback-candidate.vsix,
SHA256 6777bc58774d87b847666782b247092a82f448ff4d855db8232858aa51b957bd.
Bei der aktuellen ausschließlich lesenden Nachfrageprüfung jedoch kein eigener
Paketordner unter /home/friseer/.vscode/extensions gefunden. Ursache dieses
erneuten Fehlens ungeklärt; keine automatische Neuinstallation vorgenommen.
Die neuere isolierte Shared-Writer-Test-VSIX ist kein bereits produktiv
installierter Ersatz. Alle früheren Sicherungen und Belege bleiben erhalten.

### 2026-11-02: Suchindex beim Runtime-Shutdown abgesichert

Am bestehenden Shared-Writer-Stand fortgesetzt. Der tatsächliche Fehler aus
`p4-real-shared-vscode-model-state-continuation.log` stammt aus dem Suchindex-
Lebenszyklus: `HubServerTransport.stop` schließt den Index, danach kann
`sessionHost.dispose` noch `ended` auslösen. Keine Modell-/Terminalursache.

`SessionHistorySearchService.dispose` sperrt neue Arbeit sofort und hält genau
ein Abschluss-Promise. Bereits angenommene Indexierung darf vor dem einmaligen
Schließen committen. Danach keine neue Indexierung, Suche, Eviction oder Timer-
Aktivierung; Verfügbarkeit ist bereits während des Schließens false. Reihenfolge
der kanonischen Runtime-/Recall-Abschaltung nicht verändert.

Nachweise im unveränderten Prüfverzeichnis:
- `p4-search-shutdown-red`: 10 bestanden, alle drei neuen Regressionen
  fehlgeschlagen, jeweils tatsächliches SQLite `database is not open`.
- `p4-search-shutdown-green`: 13/13 bestanden.
- `p4-search-shutdown-boundaries`: 61/61 bestanden, einschließlich des echten
  Hub-Transport-Callbacks nach Index-Schließung sowie bestehender Recall-
  Archivierungsprüfungen. Runtime-Ereignis als Fixture; keine neue Inferenz.
- `p4-search-shutdown-core-build`: Exit 0; Core-Bundle/Declarations/Build-ID.
- `p4-search-shutdown-types`: Exit 0; Core inklusive Testquellen.
- Biome für die drei geänderten TypeScript-Dateien: Exit 0.
Bereits bestandene echte Modell-/VS-Code-Übergabeschritte nicht wiederholt.

Die neuere `netaigis-coding-chat-0.1.0-shared-writer-candidate.vsix` ist intakt,
SHA256 `73e060868f9b75b7bc3647867c19ff8167ff64afc438e43a526ce7e486a16ebd`.
Ihr Programmcode stimmt bytegleich mit der isolierten nativen Testinstallation
überein. package.json unterscheidet sich dort ausschließlich durch von VS Code
eingefügte `__metadata`. Dieses vorhandene Paket enthält die neue Shutdown-
Korrektur noch nicht und wird nicht überschrieben. Kein produktiver Eingriff.

Nächste offene Schritte bleiben: Learning-Integrationsvertrag gezielt bestätigen,
produktive gemeinsame Runtime und Recall vorbereiten/abnehmen, physischer
Android-Test durch den Nutzer, getrennten Watchdog nach ausstehender Freigabe
aktivieren und abschließenden eigenen Rollout belegen. Keine Gesamtabnahme
aus den Einzeltests abgeleitet.

### 2026-11-02: Browser mit echtem Modell; falsche Besitzer-PID bei Wiederaufnahme

Auf 6976549cc fortgesetzt. Gezielte lesende Acer-Prüfung bestätigt die ASGI-
Anwendung `app` unter `/opt/ai-agent/app.py`, Unit ai-agent.service unverändert
active/running, PID 618787 und dieselbe InvocationID 6a86c3f974e84815ba08c7cc70f9654d.
HTTP 200 beider Health-Endpunkte 11435/11436. Der Coding-Agent ruft vor der
Inferenz die vorhandene Learning-Kontextschnittstelle auf; deren Fehlschlag
ergibt 503. Die vorhandene Korrekturschnittstelle wird bei vorheriger Assistenten-
antwort aufgerufen, deren Fehler aber gesondert protokolliert. Keine vollständige
Lernspeicher-/Korrekturabnahme aus Health oder Quellcode abgeleitet. Quellenreview
filterte Stringliterale vor Ausgabe; keine Zugangsdaten ausgegeben. Belege:
`p4-learning-service-contract-confirmed.json`,
`p4-learning-handler-redacted-review.json`,
`p4-coding-learning-binding-readonly.json` im bestehenden logs-Verzeichnis.

`p4-real-browser-model-continuation`: echte HTTPS-Dashboard-/WebSocket-Anbindung,
installierter Chromium, mobile Viewport 390x844, tatsächlicher Coding-Agent mit
DeepSeek; kein Fixture-Provider, kein physisches Android. Eigener Testbrowser
vertraut ausschließlich dem SPKI des bereits vorhandenen localhost-Testzertifikats;
keine Systemvertrauens- oder produktive Profiländerung. Frühere native VS-Code-
Prüfung wiederverwendet, in diesem Lauf keine neue VS-Code-Instanz. Historie der
kanonischen Testsitzung 1793568939815_yktbw geladen, jimmi authentifiziert, dessen
Schreibrecht über echte UI übernommen und tatsächliche Modellantwort
NETAIGIS_SHARED_REAL_BROWSER_READY angezeigt. Der Test las danach zu früh den
noch nicht fertig geschriebenen Dateiverlauf und meldete fälschlich fehlende
Urheberschaft. Tatsächliche abschließende Datei enthält acht Nachrichten mit
Urheberfolge Friseer/jimmi/jimmi/jimmi; erste sechs Nachrichten unverändert
(SHA des JSON-Präfixes entspricht priorHistorySha256 des aufbewahrten Berichts).
Kein erneuter Modellaufruf für diesen Nachweis. Beim Hub-Shutdown kein
`database is not open` mehr; bestehende Suchindexkorrektur bestätigt.

`p4-real-browser-state-continuation` sollte nur Restzustände prüfen und startete
keine weitere Inferenz. Scheiterte berechtigt am Schutz session_not_quiescent.
Dadurch ein echter weiterer Quellfehler nachgewiesen: read-only Resume behält
die frühere Besitzer-PID; beim folgenden Turn wurde nur status=running erneuert.
Die Reconciliation konnte daher den neuen laufenden Turn wegen der inzwischen
beendeten alten PID als unknown markieren. Der Besitzer-Prüfnachweis betrifft
PID 2385948; keine nachträgliche Behauptung über deren tatsächlichen Exit. Die
betroffene Testsitzung inklusive aller acht Nachrichten und unknown-Marker bleibt
erhalten und gesperrt; kein Zurücksetzen/Löschen des Markers zur Testabkürzung.

Korrektur: unmittelbar vor tatsächlicher Turnausführung aktuelle process.pid
gemeinsam mit status=running per OCC im vorhandenen Datei-/SQLite-Adapter
speichern, danach Manifest-PID aktualisieren. Bloße Auswahl bleibt read-only.
Die zusätzliche interne Eigentümerangabe akzeptiert ausschließlich die eigene
PID beim running-Übergang; keine neue Remote-PID-Schreibschnittstelle. Fehlende
Status-Persistenz verhindert den Agent-Aufruf. Unbekannte alte Besitzerbelege
werden dadurch nicht gelöscht oder nachträglich mit Exitcodes versehen.

Nachweise im bisherigen Prüfverzeichnis:
- `p4-resumed-owner-pid-red`: 4 bestanden, beide neuen echten Speicher-
  Regressionen fehlgeschlagen; Reconciliation markierte den aktiven Turn stale.
- `p4-resumed-owner-pid-green`: 51/51 bestanden.
- `p4-resumed-owner-regression`: 170 bestanden, fünf Fehler: drei alte Erwartungen
  enthielten die neue PID noch nicht; zwei neue Fehlerfalltests erwarteten zu
  streng ein unverändertes Manifest, obwohl der verweigerte Turn berechtigt als
  failed gespeichert wird. Nachrichten müssen und bleiben unverändert.
- `p4-resumed-owner-regression-corrected`: 175/175 bestanden, einschließlich
  vollständiger LocalRuntimeHost-Datei, Resume, Persistenz, Writer-Schutz,
  Suchindex und verweigerter Status-Persistenz für beide Speicherarten.
- `p4-resumed-owner-core-build`: Exit 0.
- `p4-resumed-owner-types`: Exit 0.
Keine produktive Installation, kein Acer-Dienstwechsel und keine neue
Modellanfrage nach dem bereits angezeigten Browserturn. Physisches Android,
produktiver gemeinsamer Hub/Recall, unbekannte ältere Besitzerzustände und
getrennter Watchdog bleiben bis zur echten jeweiligen Abnahme offen.

### 2026-11-02: Vorhandenen Hub/Browser in die eigene VSIX aufgenommen

Auf 7f66a18c1 fortgesetzt. Keine neue Runtime-/Speicherarchitektur: der neue
Paket-Einstieg `apps/cline-hub/src/netaigis-runtime.ts` verwendet den bestehenden
Core-Daemon aus dem ohnehin mitgelieferten Plugin-Runtime-SDK und den bestehenden
Hub-Browser. Die Produktions-Buildkette baut dessen Webview und bündelt diese
Dateien zusätzlich unter dist/shared-runtime. Keine Installer-/Dienstaktivierung
beim Build oder bei Extension-Aktivierung.

Explizite vorhandene private JSON-Konfiguration (0600, eigener Eigentümer, kein
Symlink), geschützter bestehender eigener Datenordner mit Namespace
netaigis.netaigis-coding-chat/home und vorhandene Akteur-/TLS-Dateien erforderlich.
Keine automatische Datenanlage, Migration, Modellwahl oder Backend-Umstellung.
Daemon nur Loopback, fest eigener Produktions-Discovery-Pfad; Browser bestätigt
die Live-Hub-ID vor Anbindung. Kein Fallback-Hub bei fehlender/falscher Discovery.
HTTPS mit passendem explizitem Bind/Public-URL, getrenntem Invite und persönlichen
Akteur-Zugängen; kein Invite im Startprotokoll. Connectors werden über diesen
Einstieg nicht automatisch gestartet. Recall verwendet weiterhin den bestehenden
expliziten Umgebungsvertrag, kein Projekt/Schlüssel wird erfunden.

Prüfungen im bestehenden Phase-4-Prüfverzeichnis:
- `p4-packaged-runtime-configuration`: 18/18 bestanden, einschließlich alter
  Extension-Namespace, unsicherer URL, Dateiberechtigung/Symlink, fehlender Daten.
- `p4-runtime-launch-types`: Exit 0.
- `p4-runtime-production-browser-webview`: Exit 0, tatsächlich ausgeführtes neues
  Produktions-Teilkommando.
- `p4-runtime-launch-extension-bundle`: Sandbox-Lauf service stopped, kein
  genauerer Auslöser belegt; gezielte native Wiederholung Exit 0.
- `p4-shared-runtime-integrated-bundle`: Exit 0 über die ergänzte reguläre
  Produktions-Bundlekette.
- `p4-packaged-runtime-native-smoke`: Exit 0, echter eigenständiger gebündelter
  Daemon, TLS-Dashboard und vorhandener Chromium mit mobilem Viewport; persönliche
  Anmeldung bestätigt, Runtime überlebt Browser-/Dashboard-Ende, Dashboard-
  Neustart bestanden, alle drei eigenen Prozesse tatsächlicher Exit 0.
- `p4-shared-runtime-vsix-package`: Exit 0; neues separates Artefakt
  netaigis-coding-chat-0.1.0-shared-runtime-candidate.vsix.
- `p4-shared-runtime-vsix-integrity.json`: ZIP intakt; Identität/Version korrekt,
  Extension- und Runtime-Einstieg/Webview stimmen bytegleich mit gebautem Bestand
  überein; 153 Runtime-Dateien, 16863423 Bytes; SHA256
  023afbf50437c71201d2d1b7b5be3a947d9e6f511c0cad854409bc852f5d2446.
- `p4-shared-runtime-vsix-native-smoke`: Exit 0, dieselben Prozess-/Browser-
  Prüfungen direkt mit extrahierten VSIX-Dateien. Kein Modellaufruf oder
  produktiver Datenzugriff. Keine physische Android-Abnahme daraus behauptet.

Aktueller gezielter Rollout-Befund: eigener Paketordner UND eigener kompletter
GlobalStorage-Namespace fehlen; keine Registrierung der eigenen ID vorhanden.
Auch kein solcher Namespace in bestehenden VS-Code-Profilen gefunden. Ursache
weiter ungeklärt; keine Löschung durch diese Prüfungen. Ursprünglicher Code-
Arbeitsstand/Originalbranch nicht angefasst. Beide bisher verwendeten lokalen
Hub-Standardports 25463/8787 bei lesender Prüfung frei; lokale Route zum Acer
192.168.178.43 verwendet 192.168.178.25. Kein Listener produktiv geöffnet.

Vor Wiederinstallation gezielt aktualisierter bestehender Phase-6-Preflight:
Unter dem vorhandenen geschützten Sicherungsbereich ausschließlich neuer
Kindnachweis productive-rollout/shared-runtime-repair-20261102. Zwölf unveränderte
Dateien wiederverwendet; drei Delta-Dateien (aktuelle konsistente Session-DB,
native VS-Code-DB und Extension-Register), tatsächlicher Archiv-Restore und
SQLite-Integrität erfolgreich. Drei fehlende alte Legacy-Settings aus bestehender
verifizierter Sicherung erhalten; deren Quellnamespace war schon beim bisherigen
Rollout entfernt, also kein neu entdeckter Verlust daraus behauptet. Nativer
Alt-ID-Memento unverändert, keine alten nativen Secret-Zeilen. Neu erzeugter
Transfer ist byteidentisch zum bisherigen geprüften Transfer:
cfd28898f4f18b28c88ad0d1b1257d05b7e28271fc4ae0e7b3de4531ebf3b5ea.
Neuer SHA256-Siegelwert 586d75bf3699be8753f7f3fece77416e35c8dccad54b0db8790c559d8e9f97db.
Keine produktiven Dateien bisher verändert; alte Sicherungen unverändert.

Produktive eigene Wiederinstallation/Migration ist bereits autorisiert, benötigt
keine erneute Namens-/Rolloutfrage. Neue LAN-Dienstbereitstellung hat dagegen
noch keine konkrete Freigabe; zuerst vollständige prüfbare Vorlage und dann
gezielte Freigabe. Separater Acer-Watchdog weiterhin auf bestehende eigene
Freigabe-/Root-Ausführung angewiesen. Bereits bestandene Modell-/Native-
Migrationsfälle wiederverwenden, echte Gesamt-/Android-/Recall-/Learning-
Abnahme und unbekannte ältere Besitzerzustände weiter offen halten.

Zusätzliche reine Fehlerfallprüfung `p4-shared-runtime-vsix-owner-safety`: Exit 0.
Eine zweite eigene Daemoninstanz wurde mit tatsächlichem Exit 3 abgewiesen;
bereits laufender Prozess und kanonische Hub-ID unverändert. Nach dessen
eigenem sauberen Ende verweigerte das Dashboard den Start mit Exit 1; keine
Ersatz-Discovery, kein Fallbackprozess. Positive Browserprüfungen nicht erneut
ausgeführt. Vorhandene temporäre Fixture-Dateien/Protokolle erhalten.

### 2026-11-02: Eigene produktive Installation wieder bereitgestellt

Vorhandene Freigabe umgesetzt, ohne neue Dienste zu starten. Neues eigenes
Paket 023afbf50437c71201d2d1b7b5be3a947d9e6f511c0cad854409bc852f5d2446
installiert. Strikte erste Registerprüfung zunächst negativ: Code normalisierte
ausschließlich openai.chatgpt-URI-Darstellung (fsPath/external wurden nicht erneut
serialisiert) und ergänzte die ID-UUID. Gleiche ID 26.1007.21434, gleicher
relativeLocation und kanonischer Dateipfad; keine Version oder tatsächliche
Ablage einer anderen Extension geändert. Keine Wiederherstellung des ganzen
Registers. Erste Quittung installation.json und fehlgeschlagener strikter
Vergleich erhalten, zusätzliche installation-normalization-proof.json bestätigt
den tatsächlichen Vergleich und bytegleichen Bestand aller 299 installierten
Paketdateien zur VSIX (package.json nur VS-Code-__metadata ausgenommen).
Keine erneute Installation dafür.

Über dieselben vorhandenen eigenen Migrationsbefehle aus eigenem neuem
Entwicklungsfenster 16 Dateien übernommen, null native Secrets. Vollständiger
Migrationsbeleg ok, originale kanonische Nachrichtendateien semantisch identisch,
aktuelle eigene Einstellungen/Modellverbindung unverändert. Nur das eigene
Prüffenster wurde nach Erfolg geschlossen; keine produktive Hauptinstanz beendet.

Anschließend neue echte Abnahme des jetzt installierten Pakets über dessen
Extension-API (kein Fixture-Provider). Genau ein neuer kontrollierter Auftrag
1793603066247_pk2cs mit aktuellem Coding-Agent/DeepSeek: editor schreibt nur die
neue Datei productive-netaigis-shared-runtime-proof-20261102.txt im vorhandenen
Phase-4-Prüfverzeichnis, read_files liest sie, run_commands führt den verlangten
printf aus. Tatsächliche Datei hat SHA256
b4fc3046cc38c5daea45d11dc0413daf8fbd5f1a4f0681e2c3d24e7933414b88.
Echter Werkzeugzustand completed mit bestätigtem Exitcode 0; hierfür wird keine
Terminal-Kind-PID behauptet, weil diese Quittung keine enthält. Modellantwort
NETAIGIS_RUNTIME_TOOLS_READY und final idle bestätigt. Manifest-PID 2586156
entspricht der tatsächlichen eigenen Extension-Host-PID; kein unknown-Owner.
Eigenes Prüf-Entwicklungsfenster nach belegtem Abschluss geschlossen.

Geschützte Quittungen bleiben im bestehenden produktiven Kindnachweis
shared-runtime-repair-20261102: installation*.json, migration-result.json,
productive-functional.json und Fensterprotokolle. Modellkatalog war ready,
dynamischer request_limit und beobachtete geladene Kapazität jeweils 1000000.
Kein vollständiger Million-Token-Stresstest daraus abgeleitet. API-Endpunkt,
Modellwahl und Acer-Dienste nicht verändert. Neue Hub-/LAN-Dienste weiter nicht
gestartet; eigentliche gemeinsame produktive Runtime, Recall/Learning-, Android-
und Watchdog-Abnahme bleiben offen. Aktueller nächster Schritt: kontrollierte
Vorlage für zwei eigene User-Dienste und geschützte Zugänge vorbereiten; vor
Aktivierung gezielte zusätzliche Freigabe und aktuelles Own-Data-Restore prüfen.

### 2026-11-02: Konkrete Vorlage für zwei eigene lokale User-Dienste

Noch KEINE neue produktive Dienstfreigabe angenommen. Neuer eng begrenzter
Helfer sdk/scripts/netaigis-chat-runtime-deploy.py bietet prepare/apply. prepare
ändert nur private Staging-/Sicherungsartefakte. apply erfordert die gesonderte
Freigabe --new-local-services-approved und prüft vorbereitete Hashes, Zielmenge,
installierten Payload, aktuellen Datenstand und zunächst fehlende eigene Units.
Ausschließlich Start/Enable der beiden neuen User-Units, kein Stop/Restart-
Befehl und keine Acer-/Backend-Serviceadresse im Steuerpfad. Bereits bestehende
Zieldateien werden nicht überschrieben, Symlink-Eltern vor mkdir abgewiesen.
Fehler bleiben zur Diagnose erhalten, keine automatische erste Rücknahme.

Vorbereitete sieben neue Ziele:
- ~/.config/systemd/user/netaigis-coding-chat-runtime.service
- ~/.config/systemd/user/netaigis-coding-chat-dashboard.service
- unter dem bestehenden eigenen home/data/settings: shared-runtime-launch.json,
  shared-runtime-actors.json, shared-runtime-cert.pem, shared-runtime-key.pem,
  shared-runtime-android-invite.txt.
Nur der Runtime-Loopback-Port 127.0.0.1:25463 und HTTPS-Browser
192.168.178.25:8787. Eigenes lokales selbstsigniertes TLS-Zertifikat mit passendem
IP-SAN vorbereitet, keine System-/Browser-Vertrauensänderung. Persontokens
Friseer/jimmi getrennt von Invite/Modell-/Recall-Zugängen neu erzeugt, privat
und außerhalb Git. Keine Tokens/Einladungs-URL im Chat/Protokoll. Source- und
Modelleinstellungen werden nicht verändert. Cline-Verbindung wird durch den
Helfer nicht automatisch umgestellt; dafür bleibt der geprüfte eigene
runtime.configure-Befehl zuständig.

Staging im bestehenden Prüfbereich:
test-data/p4-local-runtime-prepare/data. Manifest-SHA256
8a4046b4674b8977aa6916cdfd37a29bb6fe443a368a2ffc6003f8e763c1c966.
Keine neue willkürliche produktive Datenablage, kein Listener gestartet.

Tatsächliche Sicherung des nun wieder vorhandenen eigenen Namespace vor
kommender Runtime-Bereitstellung: 23 Dateien einschließlich des neuen
erfolgreichen produktiven Auftrags, konsistente SQLite-Backup-API mit
WAL-Inhalten, eigene Archivextraktion in getrennten Restore-Probe-Ordner,
Datei-/SQLite-Integrität sowie UID/GID/Mode/mtime/xattrs geprüft. Sicherungsort:
produktive-rollout/shared-runtime-repair-20261102/own-runtime-preflight
unter dem vorhandenen Phase-6-Bereich (Ordnername tatsächlich productive-rollout).
Archiv-SHA256: 36c45b6414e553570f952cd7672a46c24a3bf5d565327b4ff0d76e4f7f59a74e.
Manifest-SHA256: 5b1117e32110a092ce2601e55135a1b5daf03481da2e04d4a2cc004fe0271f10.
Aktueller Daten-Fingerprint bei abschließender Validierung identisch.
Keine bisherige Sicherung überschrieben/erneut erstellt.

Prüfungen: p4-local-runtime-deployment-safety zuerst 5 bestanden/1 Fehler,
p4-local-runtime-deployment-safety-corrected ebenfalls 5/1. Der neue WAL-Test
deckte auf, dass Python-SQLite-Kontextmanager eine Verbindung nicht schließen;
beim Prüfen des statischen Backups entstanden sonst nicht erfasste Sidecars.
Explizites closing für Verbindungen und immutable-Lesen der abgeschlossenen
Backups korrigiert, vor jeder produktiven Anwendung.
p4-local-runtime-deployment-wal-closed: 6/6 bestanden, einschließlich lebendem
WAL-Writer, tatsächlicher Wiederherstellung und abgewiesener fremder/stoppender
Dienstaktionen. p4-local-runtime-prepare Exit 0. systemd-analyze --user verify
in Sandbox durch SO_PASSRIGHTS/SO_PASSCRED EPERM blockiert, gezielt nativ Exit 0.
openssl verify mit ausschließlich vorbereitetem Zertifikat Exit 0. Abschließende
validate_only-Quittung ok, 23 Dateien, aktuelle Daten unverändert, Dienste aus.

Konkreter Apply-Aufruf ausschließlich nach neuer lokaler Dienstfreigabe:
PYTHONDONTWRITEBYTECODE=1 python3 sdk/scripts/netaigis-chat-runtime-deploy.py apply --stage /home/friseer/MyGIT/cline-4.1.26-repair/tmp/phase4-checks-20261030T193507+0100/test-data/p4-local-runtime-prepare/data --new-local-services-approved

Vor Anwendung erneut Staging/Snapshot prüfen; neue Nutzerdaten seit prepare
erfordern gezielte Delta-Sicherung, keine erneute Komplettbestandsaufnahme.
Startup-Prüfung misst tatsächliches HTTP-Readiness (maximal 20 Sekunden),
vergleicht Core-Hub-ID/Discovery-PID mit eigener systemd-MainPID und bestätigt
Browser connected/healthy/address vor Enable. Keine Modellinferenz während
Aktivierung. Physischer Android-/Vertrauensnachweis, echter produktiver
Sitzungswechsel, Recall und externer Watchdog bleiben zusätzliche Aufgaben.

### 2026-11-02: Freigegebene gemeinsame User-Runtime tatsächlich aktiviert

Antwort auf die konkrete Sieben-Dateien-/Zwei-Dienste-Frage: "ok, mach weiter".
Der vorbereitete Apply aus 3e9a2bc5e wurde einmal ausgeführt und ist erfolgreich.
Geschützte Quittung: test-data/p4-local-runtime-prepare/data/application.json im
bestehenden Prüfbereich. Nachgelesen: beide User-Units active/running, enabled,
Result=success, NRestarts=0; Runtime-PID 2595926, Dashboard-PID 2595978.
HTTP-Readiness und kanonische Hub-ID/PID sowie HTTPS-Verbindung wurden vor dem
Enable im Apply geprüft. Keine Acer-/Modell-/Trust-Änderung, keine automatische
Client-Umstellung und keine Modellinferenz. Apply nicht erneut ausführen.

Browser-Oberfläche an freigegebene eigene Identität angeglichen: Titel und
Anzeigename NetAigis Coding Chat, 0.1.0 aus FORK_IDENTITY (Core-Version getrennt),
vorhandenes genehmigtes eigenes SVG für drei Browser-Assets und eigener
Forgejo-Link. Im gemeinsamen Modus keine globalen Einstellungs-/Restartaktionen,
die der bestehende Server bereits verweigert. Transport-/Client-IDs unverändert.
Gezielte neue echte Chromium-Prüfung der ausgelieferten Assets/DOM bestanden:
p4-browser-own-identity-native-smoke, Exit 0 (13,93 s), persönlicher Friseer-Login,
Produktname/Version/Link/Logo und verborgene globale Aktionen geprüft.
p4-browser-own-identity-shared-ui: Build Exit 0; Server-Typecheck Exit 0;
p4-browser-own-identity-server-regression: 26/26 bestanden.
Bundle zunächst in Sandbox mit "The service was stopped" gescheitert; unverändert
nativ erfolgreich. Der genaue Sandbox-Unterprozessgrund ist nicht belegt.
Neue Browser-Assets noch nicht produktiv installiert; laufende User-Dienste
verwenden weiterhin den davor geprüften VSIX-Payload.

Der anschließende neue lesende produktive Hub-Nachweis scheitert tatsächlich:
Anmeldung Friseer bestätigt, session.list erfolgreich, aber nur alte SQLite-ID
1793046128327_2s1er enthalten; aktuelle dateibasierte ID 1793603066247_pk2cs fehlt.
Originalnachweise p4-productive-shared-history.json und -diagnostic.json bleiben
erhalten. Keine Modellinferenz oder Verlaufsänderung. Quellbefund: LocalRuntimeHost
listet Backend und residente Sitzungen; dateibasierte Manifeste fehlen beim
SQLite-Hub. Vorhandene Manifest-Fallback-/Indexadoption reparieren. Kein zweiter
Chat als Ersatz und keine rückwirkende Umdeutung alter Urheberschaft.

### 2026-11-02: Dateibasierten Verlauf für den SQLite-Hub erhalten

Zwei Regressionen reproduzieren den tatsächlichen Fehler vor dem Patch:
p4-file-history-handoff-red, 0/2 bestanden. Vorhandene native FileSessionService
und ihre kanonischen Dateien werden jetzt für die Auflistung wiederverwendet;
keine neue Speicherarchitektur und kein duplizierter Chat. SQLite gewinnt bei
gleichen IDs, rootOnly respektiert bekannte SQLite-Kinder. Beim Lesen des alten
Dateiindexes keine Stale-Reconciliation/Dateiänderung; laufend bleibt laufend.
Eine passende Manifest-ID ist Voraussetzung. Der erste echte nächste Turn
übernimmt einen fehlenden SQLite-Eintrag über die vorhandene Manifestadoption,
jetzt mit insert-if-absent und bestätigtem Readback statt überschreibendem Upsert.
Erst danach wird über die bestehende Revision die eigene laufende PID gebunden.
Lesendes Öffnen schreibt weder Verlauf noch Autor-/Prozessdaten um.

p4-file-history-handoff-green: 25/25. Zusätzlicher echter SQLite-Konflikttest
belegt, dass ein während der Adoption angelegter Eintrag nicht überschrieben
wird. Außerdem SQL-Vorrang, unveränderte Datei-/Manifest-/Indexbytes, Autoren
Friseer/jimmi, leerer Limitwert und unveränderter laufender File-Prozesszustand.
p4-file-history-handoff-conflicts: 149/149 einschließlich bisheriger Host-,
History-, Resume- und Persistenztests. Core-Build/Build-Typecheck Exit 0.
Das ist noch keine produktive Abnahme des neuen Patches: der bereits gestartete
Hub verwendet weiter den vorigen installierten Payload. Seine ursprünglichen
negativen Nachweise und der funktionierende vorherige VSIX bleiben erhalten.

### 2026-11-02: Korrektur der Erstdiagnose – gepackter Hub bindet falsche Pfade

Die frühere Zuordnung der produktiven fehlenden ID zum Datei-Backend war falsch.
Gezieltes Lesen von /proc/2595926/fd bestätigt tatsächliche offene SQLite-Dateien
des neuen Daemons unter /home/friseer/.cline/data/db: sessions.db, cron.db,
tasks.db, hub-events-hub-production.db, hub-runs-hub-production.db und
session-search.db samt WAL/SHM. Gezielte lesende SQL-Abfrage beider bekannten IDs
zeigt: aktuelle ID 1793603066247_pk2cs ist im eigenen Namespace-SQLite vorhanden,
idle/PID 2586156. Im Originalpfad fehlt sie. Keine Dateisitzungs-Herkunft dafür
behaupten. ee60dca49 bleibt ein eigenständig getesteter Kompatibilitätspatch für
tatsächlich dateibasierte Bestände, kein Nachweis der produktiven Fehlerursache.

Ursache im Launcher: nur modul-lokales setIsolatedStorageRoot gesetzt; separat
gepackte SDK-Exporte verwenden andere Modulinstanzen und ihre Umgebungsresolver.
Bisherige Pakettests erbten CLINE_DATA_DIR/DB_DIR aus dem Prüfbefehl und prüften
nur Discovery/HTTP, wodurch der Fehler verdeckt wurde. Neue native Paketprüfung
entfernt diese Vorgaben, setzt einen absichtlich anderen CLINE_DIR innerhalb des
isolierten Prüfbereichs und liest echte SQLite-Dateideskriptoren des Kindprozesses.
p4-packaged-storage-isolation-red scheitert mit tatsächlichem Befund
"Packaged runtime opened an unselected storage root"; kontrollierter Exit 0 des
eigenen Testkindes, keine produktiven Dateien verändert.

Die beiden von uns neu gestarteten produktiven eigenen User-Dienste wurden nach
Prüfung ihrer konkreten PIDs ausschließlich für diese Reparatur angehalten.
Keine Acer-Dienste, produktiven VS-Code-Fenster, Daten oder Berechtigungen geändert.
Keine automatische Entfernung der im Originalpfad liegenden Datenbanken oder
Arbeitsartefakte. Welche dieser Dateien bereits vorher existierten und welche
genauen logischen Änderungen die neue Runtime erzeugt hat, ist damit noch nicht
vollständig belegt; keine Unverändertheit des Original-Datenbestands behaupten.

Gezielter Fix bindet ausschließlich im eigenständigen Launcher-Prozess alle
dreizehn vorhandenen CLINE-Speicherpfade explizit an den freigegebenen eigenen
Namespace, bevor Daemon/Dashboard importiert werden. SDK-Speicheroverride bleibt
zusätzlich aktiv. Keine Modell-/Token-/Endpoint-Auswahl und keine Veränderung der
gemeinsamen VS-Code-Prozessumgebung. Produktive neue Paketprüfung/Installation
und kontrollierter Neustart der beiden eigenen User-Dienste stehen noch aus.

Pfadkorrektur geprüft: p4-packaged-storage-environment-unit 19/19, Hub-Typecheck
Exit 0; p4-packaged-storage-isolation-green Exit 0 mit tatsächlichen SQLite-FDs
nur unter ausgewähltem eigenem Root, kein angelegter unselected-storage-Pfad,
echter Chromium-Login, eigene Identität und kontrollierter Kindprozessabschluss.
Gleiche neue Prüfung aus extrahierter tatsächlicher VSIX:
p4-shared-storage-vsix-native-smoke, Exit 0 (14,85 s). Keine Modellinferenz.

Neue eigene VSIX im bestehenden Prüfbereich:
netaigis-coding-chat-0.1.0-shared-runtime-storage-candidate.vsix
SHA256 b98f4674e3ef9d64ed3e092b9d880d1d148ec6efd3c20d0213b5cff3d1cc2d17.
ZIP-Integrität und 307 Paketdateien gegen den Build geprüft. Erste Prüfskript-
Annahme über Lizenz-/Readme-Namen falsch; VSCE benennt LICENSE zu LICENSE.txt
und README.md zu readme.md um. Diese beiden Quellzuordnungen explizit geprüft,
kein pauschales Überspringen. Alter Extraktionsversuch unverändert erhalten.

Notwendige inkrementelle Sicherung vor eigener Paketaktualisierung unter dem
bestehenden produktiven Nachweis shared-runtime-repair-20261102/
shared-storage-fix-delta: acht neue/geänderte Dateien (fünf private Runtime-/TLS-
Dateien, eigener Lock, aktueller Registry- und nativer SQLite-Zustand), 23 bereits
geprüfte unveränderte Dateien referenziert weiterverwendet. SQLite-Backup-API,
Prüfsummen und tatsächlicher vollständiger Restore aus Basis plus Delta geprüft,
einschließlich UID/GID/Mode/mtime/xattrs. Delta-Archiv-SHA256
904ea9678da6e7f683c6545e3810082032a0e5ff22a8320582538e46cdbd9342;
Manifest 12681c2abb43bab9657620ce6f489eb8abe4ff68fb6f9c621ac15609237f7766.
Keine Phase-2-Wiederholung. Altes VSIX und alle Negativnachweise bleiben erhalten.

### 2026-11-02: Eigene Pfadkorrektur produktiv, kalte Browser-Aufnahme nachgebessert

Die zuvor freigegebene eigene Paket-/Dienstreparatur wurde ausgeführt, 307 eigene
installierte Dateien gegen VSIX geprüft, andere Extension-IDs/Versionen/Pfade
unverändert. Tatsächlich geöffnete sechs Datenbanken samt WAL/SHM ausschließlich
unter eigenem Namespace. Beide eigenen User-Dienste anschließend active/running,
Result=success, NRestarts=0 (Runtime 2606679, Dashboard 2606738). Quittung im
bestehenden shared-storage-fix-delta/installation.json. Keine Acer-Änderung,
kein produktives VS-Code-Fenster beendet. Erneuter zuvor negativer Verlaufstest
p4-productive-shared-history-storage-fixed erfolgreich: beide persönlichen
Akteure bestätigt, alte und aktuelle ID sichtbar, alle sieben Nachrichten der
aktuellen Sitzung bytegleich erhalten (SHA256
0e8db02a64ac7dbc251e1e826c2155d2e2071accd06901e1b4376fedfafaa925).

Neuer echter produktiver Chromium-Test p4-productive-shared-browser-first-turn:
Verlauf sichtbar, jimmi persönlich authentifiziert und Schreibrecht bestätigt;
Senden aus dem Browser erfolgreich ausgelöst, aber keine neue Modellantwort.
Timeout nach 180 Sekunden, tatsächlicher Zustand weiterhin sieben Nachrichten,
idle, kein erfolgreiches Modell-Turn behauptet. Serverfehler session not found.
Konkrete Ursache: sendMessage schickt direkt runtime.send, ohne eine nach dem
Daemon-Neustart noch nicht residente gespeicherte Sitzung vorher aufzunehmen.
Frühere echte Tests hatten bereits residente Sitzungen und deckten das nicht ab.

Fix: Vor Senden in gemeinsamer Runtime gespeicherten Datensatz persönlich lesen,
dieselbe ID über den vorhandenen Core-Start-/Resume-Pfad aufnehmen/anhängen und
ID bestätigen. Keine initialMessages, kein neuer Chat, kein impliziter Writer-
Claim im Browsercode und keine übernommene UI-Modell-/Endpoint-Auswahl. Auswahl-
Generation, Actor-Verbindung und Browserlebensdauer vor/nach Resume prüfen.
Bei verweigertem Resume kein Senden/Wiederholen. Vorhandene serverseitige Guards
für unbekannte Owner-/Werkzeugzustände bleiben erhalten.

Neue Regressionen zuerst rot: bestehende sieben Tests bestanden, drei neue
Wiederaufnahme-/Fehler-/Auswahltests gescheitert. Gezielte Korrektur grün.
Erste Transport- und Typprüfung deckten unvollständigen gespeicherten Fixture-
Datensatz sowie fehlende erforderliche Startflags auf; beides gezielt korrigiert.
p4-browser-cold-resume-transport-complete-fixture: 17/17 bestanden, tatsächliche
HTTP-/HTTPS-WebSocket-Strecke, expliziter Resume-Aufruf und unveränderte laufende
Sitzung beim Browserdisconnect. Modell in diesem Transporttest ist ein Fixture.
p4-browser-cold-resume-types-complete: Exit 0. Kein produktiver Modellnachweis
daraus abgeleitet; derselbe betroffene produktive Test muss erneut bestehen.

Für diesen zweiten gezielten eigenen Patch beide eigenen Units erst nach
bestätigt fehlenden running/pending-Datenbankeinträgen angehalten. Aktuelle
notwendige Delta-Sicherung shared-cold-resume-delta: neun inzwischen neue/geänderte
Dateien, 27 unveränderte geprüfte Dateien aus bestehenden Sicherungen referenziert.
Backup-API und tatsächlicher Gesamt-Restore/Attribute erneut nur für diesen
neuen Stand geprüft. Archiv-SHA256
3c310175ab4a14ac5a77e2a66a3a5490e596be12201cafa3dbef64ece5ba06b3;
Manifest fb739e7b1a68fd6e239f4573fc9d493f8f69266d3d2afb7d295e4a38831eb7cc.
Neue eigene VSIX shared-runtime-cold-resume-candidate: 309 Dateien gegen Build,
SHA256 2d3a8a2cb849f40ac4304820b0635734adf987101a0f839d17816ce03307bf0d.


### 2026-11-02: Reale gemeinsame Turns; historische Metadaten repariert

Die cold-resume-VSIX wurde erfolgreich installiert (309 Dateien geprüft); beide
eigenen User-Dienste laufen. Echte produktive Browserprüfung
p4-productive-shared-browser-cold-resume-fixed: Exit 0, 110,64 s, jimmi persönlich
authentifiziert, kanonische Sitzung 1793603066247_pk2cs von sieben auf neun
Nachrichten, alte sieben unverändert. Keine Modell-Fixtures; kein physisches Android.
Die anschließende isolierte echte VS-Code-Instanz verband sich persönlich als
Friseer mit derselben produktiven Runtime, zeigte jimmis Verlauf, übernahm das
Schreibrecht und erhielt auf genau eine Eingabe die tatsächliche Modellantwort
NETAIGIS_PRODUCTIVE_SHARED_VSCODE_READY. Kanonisch jetzt elf Nachrichten, idle,
Owner-PID 2611805. Hauptprofil noch nicht auf gemeinsame Runtime umgestellt.

Gesamtprüfung result-custom-dialog.json scheiterte trotzdem korrekt: vorherige
Assistant-Metriken wurden bei der nächsten Persistierung entfernt. Das späte
actualModel=false in dieser Negativquittung ist kein Nachweis fehlender Inferenz;
p4-native-actual-completed-turn-readonly.json belegt den abgeschlossenen echten
Turn separat, ohne Wiederholung. Ursache: Agent.cloneMessage materialisiert
optionale Felder als undefined; der Historien-Merge überschrieb damit Metadaten,
die nur die endgültige Persistierung ergänzt hatte. Fix übernimmt bei derselben
Nachricht nur definierte Arbeitskopie-Felder; vorhandene kanonische Felder bleiben.
Zwei neue Regressionen zuerst rot, anschließend p4-history-undefined-metadata-green:
144/144 aus vier gezielten Suites, Exit 0. Fix noch nicht produktiv installiert;
keine verlorenen historischen Werte erfunden oder nachträglich eingetragen.
Alle Quittungen im bestehenden tmp/phase4-checks-20261030T193507+0100 erhalten.
Eigene Xvfb-Testkinder vor kontrollierter Beendigung lebend, Exit 0; kein neuer
Xvfb-Absturz belegt. Original-Sitzungsdatenbank logisch gegen geprüfte Sicherung
unverändert. Fünf zusätzliche Datenbanken im ursprünglichen ~/.cline/data/db
gegenüber Baseline dokumentiert; keine Löschung oder pauschale Herkunftsbehauptung.

### Verbindliche Ergänzung: projektübergreifendes Recall / Watchdog / LAN

Benutzer bestätigt die vorhandene Projektkennung NetAigisOS, ausdrücklich KEINEN
globalen Scope. Gemeinsame Wissensbasis Friseer/jimmi, je Projekt tatsächliche
Kennung, unveränderliche Urheberschaft. Coding-/Learning-Agent projektunabhängig.
Vor produktiver Anbindung gespeicherte Zuordnungen aus produktiver recall.sqlite3
und recall.env lesen; nötigenfalls Projektauflistung API ergänzen. Keine erfundene
default/local-ID und kein globales NetAigisOS. Aktuelle Runtime-Konfiguration mit
einem festen Recall-Projekt genügt dieser Architektur noch nicht.

Benutzer hat den separaten Acer-Watchdog freigegeben und Root-apply ausgeführt:
alle drei bekannten Dateien geschrieben, danach watchdog_invocation_not_confirmed;
keine Rücknahme. Aktuelle lesende SSH-Prüfung: Watchdog inactive/dead,
Result=success, ExecMainStatus=0, InvocationID leer; Timer inactive/disabled.
Kein strukturierter Journalnachweis über unprivilegierten Zugang verfügbar.
Der Helfer muss eine abgeschlossene Oneshot-Ausführung belastbar nachweisen,
statt eine nach Abschluss fehlende Live-Invocation als gescheiterten Prozess
zu behandeln. Bestehende Datei-Hashes/Schutzprüfung erlauben schon jetzt nur exakt
die bekannten eigenen Dateien wiederzuverwenden. Vier KI-Dienste nicht steuern.
Produktive Recall-Dateien für SSH-Benutzer PermissionError: begrenzter lesender
Root-Nachweis erforderlich, keine Dateiberechtigungen ändern.

Lokale Root-Firewallausgabe 440G5suse: public/wlp3s0, keine Ports/Rich-Regeln.
Acer-Ausgabe mit br0/eth0/wlan0 ist separat und wird nicht verändert. Port 8787
lokal erreichbar; vom Acer errno113 bei vorhandener Route. Noch KEINE Freigabe
für Firewalländerung; eng begrenzte lokale LAN-Regel gesondert vorbereiten.
Android-Gerätetest durch Benutzer bleibt nach tatsächlicher LAN-Freigabe offen.


Begrenzter Root-Lesebefehl für den nächsten tatsächlichen Nachweis:
`PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-recall-project-inspect.py --remote`
Liest produktive SQLite einschließlich committed WAL im read-only-Modus,
Gruppierung vorhandener project_id je Tabelle; keine Ereignisinhalte. recall.env
nur Schlüsselnamen und explizite bekannte nichtgeheime Projektfelder. Zusätzlich
attributierte Watchdog-Journalbelege und ausgewählte Manager-Lifecycle-Felder,
keine beliebigen Journaltexte. Vier gezielte tatsächliche Datei-/SQLite-Tests
bestanden, insbesondere WAL-Projektlesung bei bytegleicher DB/WAL, keine angelegte
fehlende DB, keine Tokenausgabe und kein Shell-eval. Kein Dienstaufruf zur Steuerung.
Benötigt nur den bestehenden Root-Terminaltransport; keine neue Freigabe für
bereits beauftragte lesende Prüfung. Produktive Daten weiter nicht lesbar als SSH-User.


Projektauflistung auf tatsächlichem Acer-Code vorbereitet (noch nicht installiert):
recall_api.py SHA256 76c17214d28422026ff98a461d44884d9330624765d6e878e16cccda2c070d3b,
recall_store.py 7885856b549d4b6b5cb3af51e6f27b95233db108a0e858c74486354085de960b.
Reiner Kandidatenbuilder sdk/scripts/netaigis-recall-projects.py ergänzt nur
RecallStore.projects und GET /projects mit exakt bestehendem Depends(authorize).
Gruppierung tatsächlich gespeicherter project_id über beide Urheber; keine
neue Tabelle/Architektur/Projektkennung und kein veränderter bestehender Endpunkt.
Vier SQLite-/Strukturtests bestanden, kein FastAPI-HTTP-Nachweis daraus abgeleitet.
Zusätzlich am tatsächlich gelesenen aktuellen Quelltext alle bisherigen Bytes
und AST unverändert nachgewiesen; nur zwei Ergänzungen. Produktive HTTP-Abnahme,
aktuelle Delta-Sicherung und gezielte Backend-Eingriffsfreigabe stehen aus.

Metadatenfix: Core-Build Exit 0 (47,66 s), Plugin-Build Exit 0 (5,76 s).
Erster Plugin-Aufruf hatte falsches Arbeitsverzeichnis und änderte nichts;
gezielt korrigiert. Erweiterungsbuild in Sandbox: esbuild service stopped;
gleicher Build außerhalb Sandbox Exit 0 (13,78 s). Kein Systemfix, Ursache der
Sandbox-Unterprozessbeendigung ungeklärt. Quittungen unverändert aufbewahrt.


### 2026-11-02: Root-Nachweis klärt Watchdog und tatsächlichen Recall-Bestand

Bediener führte den geprüften lesenden Root-Helfer aus: ok=true, keine Änderungen.
Aktuelle produktive events-Tabelle enthält ausschließlich Projektkennung
`total-recall-production-test` mit EINEM Ereignis. Keine gespeicherte NetAigisOS-
Zuordnung in dieser DB. recall.env enthält nur RECALL_API_TOKEN/RECALL_DB_PATH,
keinen Projektwert. Nutzerangabe NetAigisOS bleibt bestehende Projektentscheidung;
produktive Wissensdaten fehlen aber im benannten tatsächlichen Speicher. Nicht
als globale ID benutzen und keine bereits vorhandenen produktiven Daten behaupten.

Journal belegt Watchdog-Ausführung 2026-11-02T09:15:46.608998Z, PID2441796,
Invocation 6f9def2fe33441029d67814d1fbbf809. Alle vier Beobachtungen healthy mit
HTTP200. Manager protokolliert gleiche Invocation, unit_log_success und
job_emit_done_message/JOB_RESULT=done. Die vier KI-Invocations entsprechen den
vorher dokumentierten unveränderten Diensten. Der Watchdog ist nicht abgestürzt;
der Installationshelfer wertete die nach erfolgreichem Oneshot-Collection leere
Live-InvocationID fälschlich als fehlgeschlagenen Prozessnachweis.

Gezielter Helper-Fix: Journalcursor VOR Start; danach nur frische JSON-Einträge
mit vertrauenswürdiger _SYSTEMD_UNIT/_SYSTEMD_INVOCATION_ID sowie abgeschlossener
Manager-Jobmeldung (_PID=1, UNIT und INVOCATION_ID genau passend). Strukturierte
Beobachtung allein bestätigt keinen Exit. Start-Rückgabe und Status müssen zur
Beobachtung passen; vorhandene Live-Invocation darf nicht abweichen. Keine
Timeraktivierung ohne belastbaren Abschlussnachweis. Verifizierte bereits eigene
Dateien werden bytegleich wiederverwendet, fremde/anders geschützte Dateien
weiter verweigert. Gezielte Tests p4-watchdog-collected-invocation-proof bestanden;
produktive Wiederanwendung innerhalb erteilter Freigabe benötigt Root-Terminal.

Benutzer verlangt dauerhafte Android-Nutzung einschließlich extern über VPN.
Die vorgeschlagene temporäre Firewallregel wurde NICHT ausgeführt. Vor dauerhaftem
minimalem Eingriff tatsächliche lokale Zonen-/VPN-Routen prüfen, aktuelle relevante
Konfiguration sichern/wiederherstellen und eng begrenzte Änderung konkret machen.
Keine Internet-Portfreigabe, kein Acer-Firewalleingriff, kein Systemvertrauenswechsel.


### 2026-11-02: Historienfix produktiv installiert; dauerhafter LAN-Zugang vorbereitet

Neue eigene VSIX shared-runtime-history-metadata-candidate.vsix im bestehenden
Prüfbereich, SHA256 3e3bc4e9c61d95ce5d9b6265eb57d878f556c57dd6ffbbe83678f521230fca03.
ZIP und 309 Dateien gegen Build geprüft, extrahierte echte Daemon-/TLS-/Browser-
Paketprüfung Exit 0 (30,67 s), keine Inferenz dabei. Vor produktivem Update waren
alle eigenen Sitzungen idle/failed, keine Spawn-Aufträge. Erster Stop-Versuch
verweigerte vor Mutation eine falsche Testannahme (Nachrichtendatei ist Envelope,
kein Array); nur diese Annahme korrigiert, keine Zustandsdaten geändert.
Danach ausschließlich die zwei bereits genehmigten eigenen User-Units angehalten.

Notwendiges neues Delta im bestehenden Sicherungsbaum: shared-history-metadata-delta,
acht inzwischen geänderte Dateien, 28 unveränderte geprüfte Dateien referenziert.
SQLite-Backup-API, Integrität, echter Gesamt-Restore und Attribute bestanden.
Archiv ea9dfa07294576d8663cf4bcf6fa9874d3b4353d11da4edec04e29949a4d702a;
Manifest fa6d0dca78b00347dbd90c6e71c7de208114423aab309741ecce3766f6724743.
Installation erfolgreich, 309 Dateien geprüft, andere registrierte Extensions
unverändert. Eigene Daten vor Start unverändert, alle sechs tatsächlichen
Datenbankpfade samt WAL/SHM im eigenen Root. Runtime PID2659602 und Dashboard
PID2659673 active/running, Result=success, NRestarts=0. Keine Acer-Änderung und
kein produktives VS-Code-Fenster beendet. Gezielter tatsächlicher neuer Turn zur
Historien-/Metadatenprüfung läuft unter p4-productive-history-metadata-fixed;
elf vorherige Nachrichten vollständig dauerhaft VOR dieser Inferenz festgehalten.
Kein Wiederholen früher bereits erfolgreicher Antworten, keine erfundenen Werte.

Benutzer verlangt permanente lokale HTTPS-Freigabe. Reale lokale Netzwerkprüfung:
nur wlp3s0/192.168.178.25/24 und Loopback; Route zum LAN und Gateway192.168.178.1,
keine aktive lokale VPN-Schnittstelle. VPN kann am Heimrouter terminieren; dessen
Adresszuordnung noch nicht belegt. Nach tatsächlichem Android-VPN-Zugang gefragt,
keine Schlüssel oder fremden Projekte angefordert.

sdk/scripts/netaigis-chat-firewall.py bereitet ausschließlich exakt diese Regel vor:
IPv4 source192.168.178.0/24 TCP8787 in Zone public, permanent UND runtime ohneReload.
Vor Mutation aktuelle eigene/etc-Zonendatei samt .old und vorhandene Vendorzone
unter lokalem bestehenden Sicherungsbaum sichern und tatsächlich mit ACL/xattrs/
UID/GID/Mode/mtime wiederherstellen, Prüfsummen prüfen, ursprüngliche Abwesenheit
mitprotokollieren. Keine bestehende Zone ersetzen; nur firewalld add-rich-rule.
Bestehende Regeln müssen unverändert bleiben. Sechs Tests inklusive wirklichem
Archiv-Restore und Fehler-/Symlink-/Freigabeguards bestanden. Noch NICHT angewendet.
Bedieneraufruf lokal auf 440G5suse, Passwort nur dort:
`sudo env PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-chat-firewall.py apply --permanent-lan-approved`
Rücknahme nur der neu ergänzten Regel über firewall-cmd --zone=public
--remove-rich-rule=<exakt obige Regel>, zusätzlich --permanent ausschließlich
wenn application.json diese Zustandsart als ursprünglich nicht vorhanden belegt.
Kein Internetforward, Zertifikatsvertrauenswechsel oder geratenes VPN-Netz.


Gezielte produktive Metadatenabnahme abgeschlossen:
p4-productive-history-metadata-fixed Exit 0,114,97 s. Genau ein neuer echter
Browser-/Modellturn als jimmi in kanonischer ID1793603066247_pk2cs, elf→dreizehn
Nachrichten. Vollständiger vorher dauerhaft gesicherter Elf-Nachrichten-Präfix
unverändert einschließlich historischer Metadaten. Danach idle und weiter in
Runtime resident trotz Browserdisconnect. Tatsächliche Prüfung, keine Fixtures;
weiter kein physischer Androidnachweis und keine Recall-Produktivabnahme.

Vorbereiteter Projekte-Endpunkt zusätzlich im TATSÄCHLICH vorhandenen Backend-
Interpreter (/opt/ai-agent/venv/bin/uvicorn-Shebang) gegen echtes FastAPI-ASGI
geprüft, vollständig neuer Unterprozess/in-memory SQLite und Fixture-Tokens.
Keine gestarteten Listener, Dateien oder produktiven Dienste verändert.
Nicht authentifiziert/falscher Token401, Friseer/jimmi identischer Projektkatalog,
leerer Store keine erfundene ID, gefälschte Urheberschaft403, Projektlesung null
DB-Schreiboperationen. Exit0,p4-recall-project-discovery-existing-fastapi.jsonl.
Das ist eine Backend-Regressionsprüfung und KEINE produktive HTTP-Abnahme.

Core-Reader unterstützt ergänzend listProjects und ausdrücklich gewählte vorhandene
Projekte für Lesen/Verlauf. API-Katalog authentifiziert und strikt validiert;
kein project_id-Parameter beim Katalog, keine neue globale Kennung und kein
stilles Ausweichen auf den bisherigen Scope bei404/unbekannter Kennung. Auswahl
ändert nicht die gespeicherte Konfiguration oder historische Urheber. Bestehender
zweiter Snapshot-Parameter (Actor) bleibt kompatibel; Projekt als dritter Parameter.
37/37 gezielte Reader-/Konfigurations-/Producer-Proof-Tests bestanden. Hub-/UI-
Projektweitergabe und kanonische projektspezifische Producer-Zuordnung noch offen.

Projekt-Reader Core-Build/Typen/Build-ID ebenfalls Exit0 (41,36 s).


### 2026-11-02: Watchdog tatsächlich aktiv; LAN-Restore verweigert, VPN konkretisiert

Bediener-Root-Wiederanwendung a52cccfba erfolgreich: absent_targets=[], alle drei
zuvor geschriebenen eigenen Assets bytegleich wiederverwendet; frischer Probe-
Lauf e66e1bc6f5514428991b657fd6b7d4e4 um09:45:20.692690Z healthy für alle vier
Dienste. Danach Timer active/enabled, monitored_services_unchanged=true.
Root-Quittung watchdog-activation-fbd9e716ae46444a943895d10f827fbc.jsonl unter
bestehendem Phase4-dynamic-context-delta. Dauerbeobachtung über Timer muss noch
separat lesend bestätigt werden; Installation nicht erneut ausführen.

Lokaler Firewall-apply hat actual_zone_restore_or_source_verification_failed
verweigert, bevor irgendeine Rich-Regel verändert wurde. Teilnachweis/Archiv und
Restore-Probe unter existing-R/local-https-firewall-preflight beibehalten, kein
ungeprüftes Weitergehen und keine gelockerten Integritätsanforderungen. Neuer
rein lesender diagnose-Modus meldet genaue Unterschiede von Inhalts-Hash,
UID/GID/Mode/mtime/xattr-Hashes zwischen Original/Restore und Archiv-Zeitwert,
keine Zoneninhalte. Sieben Tests bestanden einschließlich absichtlich abweichender
Restore-mtime mit unverändertem Original, ohne Firewallaufruf.
Benötigter lokaler Root-Aufruf:
`sudo env PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-chat-firewall.py diagnose`

Benutzer bestätigt Android-WireGuard direkt zur bestehenden DS, interne Adresse
10.8.0.2, LAN192.168.178.0/24 im VPN erlaubt. Keine DS/anderen Projektdateien
untersuchen oder VPN neu konfigurieren. Bei transparentem Routing separate
minimale lokale Quellregel10.8.0.2/32 nötig; bei DS-NAT greift die LAN-Regel.
Tatsächliche Quell-/Rückroute erst im kontrollierten externen Verbindungsversuch
nach Restore-Reparatur belegen. Keine pauschale10.8.0.0/24-Freigabe ableiten.


### 2026-11-02: Projektkennung durch Hub und bestehenden Recall-Browser erhalten

Neue read-only RPC session.recall.projects verwendet bestehende persönliche
Authentifizierung. Liste/Inspektion/Restore tragen ausdrücklich projectId; der
Reader verifiziert tatsächlich vorhandene Kennungen. RPC-Antworten mit anderer
Projektkennung werden trotz gleicher conversationId verworfen. Wiederherstellung
bleibt nicht wiederholbar, nimmt nur geprüfte Referenz/Watermark an, startet
keinen Prozess und vergibt kein Schreibrecht. Native Core-/VS-Code-Adapter und
bestehender Recall-Browser reichen die Projektkennung durch. Browser sammelt
bestehende Katalogprojekte, beide IDs gehören zur inspizierten Auswahl; ein
Projektwechsel in der Restore-Nachricht verweigert die Aktion. Keine neue Ablage.

Shared-Build Exit0(14,0 s), Core-Build/Typen/Build-ID Exit0(40,95 s).
Neue Core-/echte Socket-Transport-/Reader-Suites 33/33 bestanden; erster Vorlauf
32bestanden/1fehlgeschlagen wegen falscher Testannahme, dass verweigerte RPCs
als ok=false statt als HubCommandError zurückgegeben werden. Erwartung am
belegten Clientvertrag korrigiert, keine Schutzlogik entfernt. VS-Code vier
gezielte Suites17/17, Typprüfung Exit0(115 s). Transport-/ASGI-Tests enthalten
Fixture-Recall/Modell und sind keine produktive Anbindung. Paketintegration und
kanonische projektspezifische Producer-Zuordnung noch offen; kein globaler
NetAigisOS-Ersatz konfiguriert.

Watchdog fortlaufend lesend beobachtet: Timer active/waiting/enabled,
LastTrigger11:08:43→11:11:58 CET während anderer Entwicklungsarbeit fortgeschritten;
Serviceinactive/dead, Resultsuccess, ExecMainStatus0. Keine künstliche sleep-/
Neustartschleife. Frischer strukturierter Vier-Dienste-Health-Nachweis aus dem
Root-Aktivierungslauf vorhanden; spätere Journaldetails über unprivilegierten
Zugang nicht sichtbar. Quittungen p4-watchdog-timer-observation-1/2.json.


Firewall-Restoreursache mit Root-diagnose belegt: bei allen drei Dateien gleiche
Inhalte/UID/GID/Mode/mtime; ausschließlich security.selinux im Restore fehlend.
Quell-Labelhash/etc27bc2091c4aba3c673576633c4edffc85ed48583479245c78585d34c979f6c10,
Vendor d2ea40e1dc5369ed94d4943d896d2bfbe3cf46e5bcf7a3b9fb77139e1f8dfb69.
Keine produktive Regel oder Dateiberechtigung verändert. Korrektur behält das
bestehende Archiv unverändert bei, prüft dessen genaue Mitglieder/Bytehashes/
UID/GID/Mode/nanosekundengenaue PAX-mtime gegen Original und Root-Diagnose-Pins.
Das fehlende Label wird NUR am privaten Restore aus dem passenden archivierten
RHT.security.selinux/SCHILY.xattr.security.selinux rekonstruiert, einschließlich
exakt nachgewiesener NUL-Repräsentation. Fehlendes/abweichendes Archivlabel oder
verweigertes Setzen bleibt ein Blocker. Kein Überspringen von xattrs, kein
SELinux-/Systemvertrauenswechsel. Anschließend weiterhin vollständiger Vergleich.
Erfolgreiche alte Sicherungen werden nicht wiederholt; nur gescheiterte Probe
mit wiederverwendetem bytegleichem Archiv repariert.

Zusätzlich optionale explizite VPN-Peerfreigabe vorbereitet: nur die vom Benutzer
bestätigte private IPv4 als /32; keine abgeleitete10.8.0.0/24-Regel. Zusammen mit
LANregel zwei Quellregeln auf ausschließlich TCP8787/public, jeweils permanent+
runtime ohneReload. Keine VPN- oder DS-Routeänderung. Elf Regressionen bestanden,
darunter Archivwiederverwendung ohne erneuten Backup, passendes/fehlendes/falsches
SELinux-PAX-Label und exakte10.8.0.2/32- statt Subnetzfreigabe. Noch nicht angewendet.
Konkreter lokaler Root-Aufruf nach dieser geprüften Korrektur:
`sudo env PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-chat-firewall.py apply --permanent-lan-approved --vpn-peer=10.8.0.2`
Application-Nachweis enthält jede gegebenenfalls neu hinzugefügte Regel je
runtime/permanent für die gezielte Rücknahme. Externer tatsächlicher VPN-Test
bleibt offen, weil die DS gegebenenfalls NAT oder Rückrouten verwendet.


Zusätzliche vollständige Core-Dev-Typprüfung fand drei Fixture-Typgrenzen aus
vorherigen eigenen Tests: nullable SessionRow wurde als SessionRecord verwendet,
und die neue Metadatenregression übergab reichere MessageWithMetadata-Literale
unmittelbar an den schmaleren Message-Parameter. Nur Fixtures korrigiert:
vorhandener toSessionRecord-Konverter statt Cast, explizit typisierte reale
Arbeitskopien statt unzulässiger Literale. Laufzeitimplementierung unverändert.
Betroffene zwei Suites15/15 erneut bestanden; anschließend vollständige
Core-Dev-Typprüfung Exit0(104,22 s). Alter negativer Typnachweis erhalten.


Vor Acer-Projekt-API-Anwendung tatsächlich bestehende lokale Phase2-Archive
config.tar, service-addendum.tar und other-data.tar auf betroffene Module geprüft:
keine recall_api.py/recall_store.py darin. Daher genau diese beiden neu betroffenen
Module ergänzend sichern, keine früheren unveränderten Sicherungen wiederholen.
Bestehender geprüfter Preflight-Helfer um expliziten --recall-projects-delta-Modus
erweitert; alter Router-/Model-Kontextmodus unverändert. Neue Dateiliste exakt
auf aktuelle oben dokumentierte SHA256-Pins begrenzt; keine frei wählbaren Pfade.
Acer-Root-Archiv und Export im bestehenden Phase2-Baum, tatsächlicher Restore mit
allen Attributen und Vergleich der vier existierenden Dienste vor/nach; keine
Dienste starten/stoppen und keine Quelle verändern. Gezielte Preflight-Tests
bestanden, einschließlich exaktem Zweier-Scope und rein lesender Learning-Prüfung.
Nächster Root-Befehl ist NUR Sicherung, noch keine Produktivanwendung:
`PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-preflight.py --remote --recall-projects-delta`
Danach externe Kopie und tatsächliche Wiederherstellung prüfen, bevor der konkrete
Backend-API-Eingriff vorgelegt wird. Alte Acer-Konfiguration/Modellzugänge bleiben.


Scan-Nachweis4960e5a84: gitleaks meldete generic-api-key auf dem öffentlichen
recall_api.py-Quell-SHA25676c17214...070d3b. Gegen lesend erfasste tatsächliche
Quelldatei/Quittung bestätigt: reiner SHA256, keine Zugangsdaten. Der verkettete
Shell-Aufruf setzte den Commit trotz Scan-Exit1 fort; Fehler im Arbeitsablauf,
kein Push/Secret-Export. Genau diese Hashzeile mit gitleaks:allow kommentiert,
keine globale Ausnahme und keine Historienumschreibung. Negativreport erhalten;
abhängige Scans/Commits künftig getrennt und Exitcode prüfen.


### 2026-11-02: Firewall angewendet, Recall-Zweitkopie geprüft, Producer pro Sitzung

Bediener-Root-Aufruf b73c44621 erfolgreich: die zwei exakten Quellregeln für
LAN192.168.178.0/24 und VPN-Peer10.8.0.2/32 auf TCP8787 sind permanent UND
runtime bestätigt. Vollständige Wiederherstellungsprobe einschließlich SELinux
bestanden, Manifest52e05492f390c614dbb1bdae92eb0f6161136c6be7a2c0d9fee10e32b7272182.
Kein Reload, keine Acer-/DS-/Routenänderung. Nicht erneut anwenden.
Tatsächlicher HTTPS-Aufruf vom Acer mit exakt gepinntem öffentlichem Zertifikat:
HTTP200, healthy=true, connected=true; Quittung p4-local-dashboard-lan-after-firewall.
Die frühere LAN-Sperre ist damit behoben. Physischer Android-/externer VPN-Test
ist weiterhin offen; Bediener wurde zum ausschließlich lesenden ersten Test der
kanonischen Sitzung1793603066247_pk2cs angeleitet. Einladungslink/Personentokens
nur in vorhandenen geschützten lokalen Dateien, niemals im Chat ausgeben.

Root-Sicherung der zwei Recall-Module erfolgreich, bestehender Phase2-Baum/
phase4-recall-projects-delta. Geschützte externe Kopie auf440 unter
/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase4-recall-projects-delta
über bestehenden SSH-Zugang tatsächlich übertragen, nicht erneut gesichert.
Archiv c2940c6984d8f9e30b23d5c6fded3d387c62db3d8311ae8ec8c8503c1d6ddeed,
Manifest a2a25fbe4b42c617941e4c3b007c3cbcfca3a2427544a4ccba77b2ddf3469d2f,
SHA256SUMS4ee5b728c61480915c770090ec69ee80686e3805cb79bee4a98252ddb1d7d849.
Alle drei gegen Root-Quittung UND Export geprüft; exakte Archivmitglieder,
Quellhashes/UID/GID/Mode im Archiv geprüft. Beide Dateien lokal tatsächlich
wiederhergestellt und Python-AST geprüft; Modus/mtime stimmen. Root-Eigentümer
und security-xattrs vollständig auf Acer wiederhergestellt, lokal unprivilegiert
nicht als erneut gesetzte Root-/SELinuxattribute ausgegeben. Nachweis in
external-verification.json. Keine Quelle, Konfiguration oder Dienste verändert.

Producer: bestehendes kanonisches Session-Metadatum recallProjectId erhält die
explizite Projektkennung. Abgeschlossener Recall-Import kann seine belegte
Quellkennung weiterverwenden; kein Workspace-/NetAigisOS-/default-Fallback.
Normale Metadatenänderungen erhalten die bestehende Zuordnung; abweichende
Neuzuordnung wird vor Persistenz verweigert. Session-Mode verbindet nur vorhandene
persönliche Recall-Zugänge; Konfiguration enthält ausdrücklich kein globales
Projekt. Dieselbe dauerhafte Outbox hält Projekt/Session/Urheber/Ziel pro Record
fest, auch nach Neustart oder Löschung der nativen Sitzung. Widersprechende noch
vorhandene Session-Zuordnung blockiert den Record ohne Umdeutung. Backoff einer
Projektzustellung hält dessen Reihenfolge, blockiert andere Projekte nicht.

Neue Backoff-Regression zunächst rot (ProjectA503 verhinderte ProjectB), danach
gezielt korrigiert. Erster breiter Lauf51bestanden/1Timeout im dynamischen Import
des finalen Archivtests; isolierter unveränderter Testlauf7/7 in6,43s bestanden.
Kein Produktivtimeout verlängert. Nach zusätzlichem Replay-/Löschungsfall laufen
alle sechs betroffenen Suites seriell mit53/53 in19,90s erfolgreich
(p4-recall-multiproject-final-serial). Alte negative Prüfprotokolle bleiben erhalten.
Fixtures sind keine produktive Recall-Abnahme. Core-Build läuft; Produktiv-API,
UI-Zuordnung, Paketintegration und tatsächliche Recall-Restore-Abnahme noch offen.

Core-Build/Typen/Build-ID Exit0(18,02s). Vollständige Core-Dev-Typprüfung wies
ein unvollständiges neues Snapshot-Fixture aus; dessen echte Pflichtfelder statt
zusätzlichem Cast ergänzt. Korrigierte vollständige Dev-Typprüfung Exit0(50,10s).

### Vorbereiteter begrenzter Acer-Schritt: vorhandene Recall-Projektauflistung

Producer-Commit17bd4da49 erhalten. Neuer Helfer
sdk/scripts/netaigis-recall-projects-activate.py verwendet die bereits geprüften
Maintenance-Primitiven (exakte Pins) für Stop-/Start-Isolation, Dateiattribute,
atomaren Austausch, Zustands-/Health-Prüfung. Ausschließlich recall_store.py
und recall_api.py, bestehende netaigis-coding-agent.service. Store vor API schreiben;
keine Konfiguration, Datenbank, Modellzugänge oder andere Units verändern.
Vor jedem Eingriff Root-Archiv/Manifest/SHA256SUMS und tatsächliche Original-
Restoredateien prüfen, aktuellen Inhalt nur exakt original oder geprüfter Kandidat
akzeptieren. Fremde Änderungen/abweichende Attribute bleiben ein Blocker.
Externe geprüfte Kopie und Wiederherstellungsdateien vor Root-Transport prüfen.
Forward-Repair ist idempotent; keine automatische Altversions-Rücknahme.

Original-/Kandidat-Hashes zusätzlich gegen tatsächlich lesend erfasste Module
belegt (p4-recall-project-activation-real-source-plan). Neun gezielte Installer-
Tests bestanden: Freigabe-/Wartungsfensterguard, reine Lesung, abweichende Quelle/
Sicherung/Attribute, echter Austausch mit erhaltenen Attributen, Wiederanwendung,
beide persönlichen Authentifizierungen, ausschließlich GET und HTTP401 ohneToken,
beibehaltene neue Dateien bei verweigerter Abnahme. Keine Produktivdienste in
diesen Tests gesteuert. Bestehende echte FastAPI-ASGI-Prüfung weiterhin gültig.
Produktive GET-Prüfung des neuen Endpunkts gehört erst zum folgenden Root-Schritt.

Gesondert freizugebender Acer-Bedieneraufruf bei ruhenden Aufträgen:
`PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-recall-projects-activate.py apply --remote --installation-approved --maintenance-confirmed`
Er stoppt/startet ausschließlich Coding-Agent nach bestätigter Isolation und
prüft danach beide vorhandenen persönlichen Zugänge sowie identischen Katalog.
Learning-Agent, Modellrouter und Modell müssen dieselben PIDs/InvocationIDs
behalten, bestehende Konfigurationsbytes unverändert. Keine Modellanforderung.
Root-Passwort ausschließlich im bereits verwendeten Terminal, nicht im Chat.

Android-Anleitung korrigiert: Benutzer ist Friseer, nicht jimmi. Einladungsdatei
liegt tatsächlich unter eigenem home/data/settings/shared-runtime-android-invite.txt,
nicht unmittelbar unter home. Beide tatsächlichen Anmeldedateien stat-geprüft0600.
Weder falsche Rollenzuweisung noch unvollständigen Pfad weiterverwenden.

Bediener hat den abgegrenzten Acer-Schritt freigegeben/ausgeführt. Vor jedem
Dienst- oder Datei-Eingriff verweigert: file_owner_type_or_protection_changed.
Konkrete Ursache im Helfer: wiederverwendeter Root-regular-Reader wurde auch
auf das mit ursprünglichem Eigentümer gesicherte Modul angewendet. Gepinntes
Manifest und frische lesende SSH-stat stimmen überein: recall_api.py0:0/0644,
recall_store.py460:460/0644, Elternverzeichnis0:0/0755. Kein Produktivrecht ändern.
Gezielte Korrektur verwendet für exakt diese beiden Manifestdateien/Restorepfade
deren gespeicherte UID/GID/Mode/xattrs, übrige Backuphüllen bleiben Root-privat.
Offener regulärer Inode vor/nach Lesung geprüft, Symlinks/races/unbekannte Bytes
verweigert. Original-mtime bleibt exakt, bereits installierter Kandidat darf seine
eigene Änderungszeit behalten. Bestehende atomare Replacement-Primitiven verwenden
denselben gesicherten Reader und erhalten460:460 statt stillschweigend zu chownen.
Elf gezielte Tests bestanden einschließlich abweichender Ausführer-UID, falscher
Manifest-UID und Symlink-Verweigerung. Freigabe/Scope unverändert; Root-Wiederaufruf
ist für den bereits genehmigten Schritt nötig, keine neue Namens-/Modellentscheidung.

Bediener-Screenshot bestätigt Browserseite mit persönlicher Anmeldung Friseer
und beiden vorhandenen Sitzungen. Noch kein Verlauf-/Android-/VPN-Gesamtnachweis.
Zum Lesen der kontrollierten bestehenden DeepSeek-Sitzung angeleitet; gespeicherte
historische Qwen-Zuordnung der anderen Sitzung nicht ungeprüft geändert.


### 2026-11-02: Projekt-API produktiv bestätigt, Android-Verlauf belegt

Bediener-Wiederanwendung4841aad05 erfolgreich: beide Kandidaten exakt installiert,
UID/GID/Mode/xattrs erhalten; Coding-Agent PID2493266, Invocation
c2762e4a0a854a80a81448284bdcdb37, active/running, Resultsuccess,NRestarts0.
HTTP401 ohneToken, HTTP200 für Friseer und jimmi mit identischem tatsächlichem
Katalog: ausschließlich total-recall-production-test,1Event/1Conversation/last_seq1.
Learning-/Router-/Modellprozesse und Konfigurationsbytes unverändert.
Root-Journal im bestehenden phase4-recall-projects-delta:
recall-projects-activation-f3812b65b042458ca68dfa4885742c20.jsonl.
Anschließende unabhängige lesende Netzwerkprüfung von440 bestätigt beide HTTP200-
Kataloge mit vorhandenen geschützten persönlichen Recall-Zugängen, ohne
Schreib-/Modellanforderung (p4-live-recall-project-catalog-readonly.json).
Nicht erneut anwenden; projektbezogene produktive Archivierung bleibt zu prüfen.

Bediener unterscheidet ausdrücklich ersten lokalen Browsernachweis von Android.
Nachfolgender Screenshot mit Angabe „handy“ belegt nun den echten Androidbrowser:
HTTPS192.168.178.25:8787, bestätigter AkteurFriseer, kontrollierte gleiche Sitzung,
zuvor gemeinsam erzeugter VSCode-Verlauf und Original-Metadaten-Prüfauftrag.
Schreibrecht zuletztjimmi/Revision4 separat dargestellt. Genau ein gezielter
Friseer-Androidturn ANDROID_SITZUNG_BESTAETIGT angeleitet, Antwortnachweis noch offen.
Externer Mobilfunk-/VPN-Nachweis weiterhin offen. Nicht als vollständige Abnahme
oder simuliertes Mobilgerät ausgeben.

Native explizite Projektwahl über bestehenden Recall-Konfigurationsbefehl ergänzt:
vorhandener authentifizierter Katalog oder vom Benutzer genau eingegebene eigene
Projektkennung, ausdrückliche Bestätigung nur der aktuell inspizierten Session-ID.
Kein globaler/default/Workspace-Ersatz, keine Tokenumschaltung. Derselbe Client
liest Kontrolle und schreibt Metadatum, Server prüft persönliche Verbindung/
Schreibzuständigkeit; anschließend gespeicherte Kennung erneut lesen. Aktive
Auswahlwechsel, fehlendes Schreibrecht, unklare Bestätigung und Neuzuordnung
verweigern ohne automatischen Retry. Vier neue rote Vertragsfälle, danach10/10;
mit bestehenden Command-/Reader-Suites34/34, VS-Code-Typprüfung Exit0(63,56s).

Weiterer echter Rotfall: erste Projektzuordnung einer bereits ruhenden Sitzung
publizierte keinen Core-Snapshot, sodass ohne neue Modellnachricht keine Archivierung
begann (3bestanden/1rot). Jetzt nach dem erfolgreichen Metadaten-Durability-Gate
den tatsächlichen Snapshot publizieren; kein neuer Turn/Statuswechsel/Urheber.
Betroffene Host-/Archive-Suites12/12, Core-Build/Typen/Build-ID Exit0(16,64s).
Browser-Recall reicht ebenfalls Projektkennung durch Liste/Inspektion/Restore;
gleiche Conversation-ID in anderem Projekt darf keinen inspizierten Scope wechseln.
Standalone-Konfiguration erweitert um sessionbezogene Recall-Zugänge im bestehenden
geschützten JSON; separater Archive-Signierschlüssel, keine Wiederverwendung von
Hub-Logins/API-Keys und keine neue Modell- oder globale Projektentscheidung.
21Konfigurationsprüfungen und5Browser-Projektprüfungen bestanden.

### Gemeldeter Browser-Neuladefehler und HTTPS-Vertrauen

Bediener meldet persönliche Neuanmeldung nach Seitenaktualisierung und rote
HTTPS-Anzeige am Handy. Verbindung ist HTTPS mit eigenem selbstsignierten
Zertifikat; geprüftes SAN192.168.178.25/127.0.0.1/localhost, gültig02.11.2026 bis
02.11.2027. Browser vertraut dieser Ausstelleridentität bisher nicht. Fingerprint
SHA256E8:AB:A4:B0:1A:1A:40:C0:82:83:DA:22:AE:89:08:8E:9F:BE:C7:98:33:09:3D:31:0D:75:07:81:91:CE:98:5B.
Keine System-/Android-Vertrauensänderung oder Zertifikatsinstallation durchgeführt.
Die rote Warnung nicht als fehlende Verschlüsselung oder gelöstes Vertrauen ausgeben.

Neuladeursache: persönliche Browserauthentifizierung blieb bisher nur im Speicher
der einzelnen WebSocket-Verbindung. Tatsächlicher neuer Chromium-Rotlauf gegen
unverändert extrahierte vorherige VSIX bestätigt fehlende Browserpersistenz,
p4-browser-reload-native-red,Exit1(24,55s); isolierte Prozesse danach beide Exit0,
keine produktiven Profile/Dienste oder Modelle benutzt.

Reparatur ergänzt befristete opaque Browser-Tickets: bestehende persönliche Hub-
Anmeldung plus rein lesende Neuvalidierung, an bestätigte Auth-Anfrage und Actor-
Generation gebunden. Cookie __Host-netaigis_actor,Secure,HttpOnly,SameSiteStrict,
maximal12h, keine persönlichen Schlüssel im Web Storage. BoundedserverCache256,
keine neue persistente Wissens-/Sitzungsablage. Logout löscht Ticket; Reload prüft
Identität erneut ohne Writerclaim/Taskstart. Nach Dashboard-Neustart ist einmalige
persönliche Neuanmeldung nötig, da dessen Cache absichtlich flüchtig bleibt.
POST/DELETE unter bereits vorhandener Host-/Origin-/Invite-Sperre, nur HTTPS,
JSON begrenzt8KiB. Persönliche Anmeldedaten/Fehlerkörper werden nicht protokolliert.
Neue Abmeldenfunktion, Fehler sichtbar. Keine zusätzliche Cline-KI-Überwachung.

Gezielte fünf Browser-/Konfigurationssuites77/77 bestanden. Eigener Web-Build
fand optionales Legacy-projectId im Snapshot; UI verlangt jetzt vor Restore
die ausdrücklich vorhandene Kennung. Korrigierter Web-Build Exit0(57,97s).
Core-Pluginruntime Exit0(6,99s); Produktionsbundle in Sandbox sofort mit bekanntem
esbuild-Servicefehler abgebrochen, identischer Build außerhalb Exit0(14,74s).
Zwei reine Test-Request-URL-Typstellen auf explizite URL-Strings korrigiert,
abschließende Typprüfung/Paket-/echte Reload-/Logoutprüfung laufen.
Noch keine Installation dieses Pakets und keine produktive Recall-Konfiguration.

Erste neue VSIX fd9344dba071d13e5c79bce6dec10ff04c25123ef240a5a0947b66ad44a40027
hat den echten Reload-Test NICHT bestanden, nicht installiert. Opaques Secure/
HttpOnly/Strict-Cookie war im isolierten Chromium tatsächlich vorhanden; die
Anmeldeanzeige verlor die frühere Serverbestätigung, weil SharedSessionAccess
erst nach initialem Hub-State gemountet wird. Anzeige speichert nun ausschließlich
die bestätigte nichtgeheime Actor-ID im RAM dieses Socket-Adapters; Mount liest
den aktuellen Wert, Disconnect/Logout löscht ihn. Ein verspätetes Close eines
alten Sockets kann keine neue Verbindung oder ausstehende Nachrichten leeren.
Zwei neue UI-Adaptertests und ergänzende Request-/Actor-Fences bestanden, insgesamt
22/22 im gezielten Folgelauf. Keine automatische Writerübernahme oder neue Session.
Gespeicherte Browseridentität muss bei Reauth weiterhin exakt demselben persönlichen
Akteur entsprechen; Umzuordnung eines Tokens darf keine andere Identität anmelden.

Neue eigene VSIX shared-runtime-recall-browser-auth-v2-candidate.vsix:
SHA2561b3aa40038459d36cb695f704266f3f84bf614ac84b294554356f56dff6d91e9,
334Payload-Dateien gegen tatsächlichen Build bytegleich geprüft, Identität0.1.0.
V2-Pakettest mit echtem HTTPS/Chromium Exit0(22,92s): Cookieflags geprüft,
persönliche Identität nach Reload bestätigt ohne Schlüsseleingabe, Logout plus
Reload anonym bestätigt, kein persönlicher Schlüssel oder HttpOnly-Cookie für
Seitenskripte im Web Storage lesbar. Eigene tatsächliche DB-Dateideskriptoren,
unabhängiger Core trotz Browser-/Dashboardclose und Dashboard-Neustart bestätigt;
alle drei isolierten Prozesse Exit0 ohne SIGKILL/closedDatabaseError.
Das ist keine physische Android-/Modell-/produktive Recall-Abnahme.
Letzte korrigierte Hub-Typprüfung Exit0(30,57s); zusätzliche Fehlermeldung vorher
betraf ausschließlich ungenügend eingegrenztes unknown im neuen Testcallback.
Vorherige fehlgeschlagene Artefakte/Prüfungen bleiben unverändert erhalten.

Vor produktiver Eigenpaket-Reparatur neue notwendige Delta-Sicherung im vorhandenen
R/shared-recall-browser-auth-delta erstellt:10geänderte eigene Dateien,28bereits
geprüfte unveränderte Dateien wiederverwendet. Aktive SQLite-Snapshots über
Backup-API, vollständige tatsächliche Wiederherstellung einschließlich Attribute
geprüft. Archiv19b5a8c020cd4d01dff82ebd3cf270da84ad566394f7233b6abd2c7477a1118c,
Manifest0c4267bf3dd8f739701277990be569e0bca108b3769a29dfbfdb376ac263a7f3.
Produktive Dateien/Dienste dabei unverändert. Gesicherte kontrollierte Historie
hat weiterhin13Nachrichten; Android-Prüfturn weder gesendet noch beantwortet,
keine erfundene Modellabnahme. Originalbranch erneut624c2cd6661e100680d8b61daa3a3447f4708536.
Produktive Aktualisierung des eigenen bereits genehmigten Pakets folgt erst nach
Quittierungs-/Ruhestandsprüfung, keine Originalerweiterung oder Acer-Dienste ändern.

### Produktive Browserkorrektur ausgeführt; kanonischer Core bewusst weiterlaufend

Aktueller eigener Snapshot vor Eingriff nochmals vollständig verglichen:
38Records, keine eigene Datei seit verifiziertem Restore verändert. Privilegierter
Wartungsversuch über Sitzungs-RPC verweigert; anschließender bestehender geschützter
HTTP-/drain-Endpunkt liefert500. Keine Unit gestoppt oder neue Arbeit als beendet
ausgegeben. Quellbefund: aktive actorTokens leiten auch den bereits durch privaten
Owner-Bearer autorisierten HTTP-Drain durch die persönlichen Sitzungs-Schreibregeln;
dieser Managementaufruf erhält dabei keine Actor-Verbindung. Keine Rechte geöffnet.
Zusätzliche gezielte Management-Reparatur erforderlich, Originalfehlerlogs erhalten.

Für die isolierte Browserkorrektur kanonischen Core NICHT neu gestartet. Nur eigenen
Dashboarddienst gestoppt, vorherige installierte309Dateien gegen vorherige eigene
VSIX3e3bc4e9... bytegeprüft, dann Code-CLI ausschließlich eigene V2-VSIX installiert.
334neue Payload-Dateien tatsächlich gegen VSIX1b3aa400... geprüft. Alle anderen
registrierten Erweiterungen nach ID/Version/Pfad unverändert; keine Behauptung
eines Vergleichs deren sämtlicher Paketbytes. Eigene Sitzungen/Metadaten/Modelle/
Einstellungen/Secrets/Locks vor und nach unverändert; nur appendende Betriebs-
ereignisse beim An-/Abmelden dürfen weiterlaufen. Browser wieder gestartet:
PID2748321,active/running,Resultsuccess,NRestarts0. Core weiterhin PID2659602,
Hubhub_1793612936189_r2nlz unverändert, active/running,NRestarts0. VS-Code-Fenster
nicht beendet, kein Acer-Dienst oder Modell verändert, kein Modellrequest.
Installation mit Quittung in R/shared-recall-browser-auth-delta/installation.json.
Der bestehende Coreprozess verwendet weiterhin seinen zuvor geladenen Build;
neue sessionbezogene Recall-Producer-Funktionen werden erst nach gesichertem
späterem Core-Neustart aktiv. Keine produktive Recall-Konfiguration gesetzt.

Tatsächlich installierte produktive Browseroberfläche zusätzlich mit getrenntem
Chromium-Profil geprüft: p4-productive-browser-reload-v2,Exit0(3,71s), keine Fixtures/
Modellanforderung/Writerclaim. Friseer durch echten Runtime-Handshake bestätigt,
Secure/HttpOnly/Strict-Cookie vorhanden, zweimaliger Reload behält Identität UND
dieselbe ausgewählte Sitzung1793603066247_pk2cs mit bisheriger Historie. Logout
widerruft Ticket, nächster Reload anonym. Alle13Nachrichten einschließlich Urheber
bytegleich, persönliche Hub-Schlüssel nicht im lesbaren Web Storage. Das ist
produktive Browser-Funktionsprüfung, kein Android-/VPN-/Modellnachweis.
Bediener zum einmaligen Reload/Login auf Android und anschließendem Reload-Test
angeleitet. Bisheriger Android-Lesebefund bleibt gültig; neuer Android-Reload-
Nachweis und angeleiteter tatsächlicher Modellturn noch offen. HTTPS-Vertrauen
des selbstsignierten Zertifikats weiterhin offen, keine Truststore-Änderung.

### Bestehender Owner-Drain: Ursache reproduziert und gezielt korrigiert

Isolierter echter HTTP-/WebSocket-Rotfall p4-owner-drain-actor-regression-red:
Legacy ohne Actor-Registry bestanden, mit vorhandener Actor-Registry HTTP500
statt200. Keine Modelle oder produktiven Prozesse beteiligt. Der bestehende
Owner-Bearer war gültig; der nachgeschaltete persönliche RPC-Dispatcher verweigerte
den Managementaufruf ohne Actor-Verbindung. Die Reparatur behält die ursprüngliche
HTTP-Bearerprüfung vollständig bei und ruft danach ausschließlich den internen
Drain-Setter auf. Persönliche und Observer-WebSockets erhalten weiterhin keine
hub.drain-Rechte. Drain bezeichnet nur die Aufnahmesperre, keinen Prozessabschluss.

p4-owner-drain-actor-regression-green: drei Suites,8/8 bestanden,53,22s einschließlich
Laufhülle. Root-/Fehltoken401, Drain an/aus und Healthzustand tatsächlich über
lokales HTTP geprüft; persönliche/Observer-RPCs weiterhin abgewiesen, kein Taskstart.
Core-Build einschließlich Ausgabetypen und Runtime-Build-ID Exit0(46,10s).
Zusätzliche persönliche HTTP-Token401 explizit ergänzt; abschließender enger
Test-/Typ-/Pluginruntime-/Bundlelauf noch in Arbeit. Kanonischer produktiver
Core weiterhin unverändert, daher produktiver alter Drainfehler noch vorhanden.

Abschlussprüfung: persönliche Friseer-/jimmi-HTTP-Token explizit401; enger Folgelauf
2/2 bestanden(47,84s). Erste Typprüfung versehentlich mit tsconfig.json statt
vorhandenem tsconfig.dev.json meldete zwei bereits in HEAD unbenutzte Testvariablen
und vier im neuen Fixture fehlende Runtime-Handler. Fixture vervollständigt;
korrekte Core-Dev-Typprüfung Exit0(103,27s). Unbeteiligte alte Tests nicht verändert.
Pluginruntime Exit0(10,92s), Produktionsbundle Exit0(23,07s).

Eigene neue VSIX shared-runtime-recall-owner-drain-candidate.vsix,
SHA2565c37a998f43c047680f2eb5b0bba2fb7e8db79dd64f489865ac437e31c95c630:
334Payload-Dateien bytegleich gegen Build geprüft. Tatsächlicher extrahierter
Pakettest p4-owner-drain-native-package Exit0(19,12s): eigenes Core mit persönlichen
Actorzugängen, fehlende und persönliche HTTP-Token401, Owner-Drain200/idle,
Core läuft dabei weiter; Drain wieder öffnen. Doppelowner/Missingruntime ohne
Fallback geprüft, isolierte Kinder sauber beendet. Keine Modelle/produktiven
Dateien/Android-Browser beteiligt. Diese Quelle bisher nicht produktiv gestartet.

Notwendige aktuelle Delta-Sicherung R/shared-recall-owner-drain-delta:
nur drei geänderte Dateien (Betriebsereignis-DB, Extensionregistrierung, VS-Code-
Globalstate),35unveränderte geprüfte Dateien wiederverwendet. SQLite-Backup-API,
tatsächliche vollständige Wiederherstellung und Attribute geprüft. Archiv
407d4442cf88d8b9d268173a70d6d2b02ebaa44bebffdf7f6d878df8a46bae09,
Manifestad7fc18dad61fa95c5d539e0ad86d8e9c59e2f0d6c5d7137ed3babf033ac294a.
Produktiver Lesebefund vor Recall-Aktivierung: CorePID2659602, idletrue,
keine aktiven Turns/Cloud-/Pluginaufrufe/angenommenen Runs; zwei Dashboardclients
plus eigener lesender Prüfer. Kontrollierte Sitzung idle, ursprüngliche lange
Sitzung weiterhin failed; kein unbekannter Zustand als beendet umetikettiert.

### Recall-Aktivierung vor Installation gestoppt: alter Dispose verfälscht Idle

Private Recall-Kandidatenkonfiguration mit vorhandenen persönlichen Acer-Keys
und getrenntem neuem32Byte-Archivsignierer vorbereitet; sessionbezogen, keine
globale Projektkennung. Tatsächlicher Launchparser akzeptiert sie. Neuer Schlüssel
nur geschützt im bestehenden R/shared-recall-owner-drain-delta, niemals Git/Chat.
Erste TAR-Probe hatte ausschließlich92ns-Mtimeabweichung; unverändert als negativer
Nachweis behalten. Derselbe Kandidat ohne neue Schlüsselgenerierung anschließend
mit exaktem PAX-Mtime neu gesichert und vollständig restauriert:
recall-launch-candidate-v2.tar SHA41a258caaa91c90b3de1b60a21133d30be8d27c60eca39bc20923f59f34ce185,
Konfigurationshash51d6cdf2d543d7c80c2bbbc85a42000eccba95fa02c9f33e74e62cf976101e4b.

Begrenzter Aktivierungsversuch: Dashboard gestoppt, danach über echten bestehenden
Hub bestätigt ausschließlich eigener Wartungsclient, kein aktiver/angenommener
Turn/Plugin-/Cloudaufruf. Alter Owner-Drain bekanntermaßen defekt; nur für diesen
Bootstrap nach gesperrtem Dashboardzugang und finaler Auftragsruhe den eigenen
Core regulär gestoppt. Anschließender obligatorischer Datenvergleich verweigert
Fortsetzung: alter Dispose ändert die vorherige kontrollierte Testsitzung
1793603066247_pk2cs von idle/null auf completed/Exit0. Ausschließlich deren fünf
SQL-Statusfelder geändert; beide historischen Nachrichtenbestände und die
ursprüngliche failed-Sitzung1793046128327_2s1er unverändert. Keine VSIX installiert,
keine Launch-Konfiguration geändert; finally startet beide eigenen Dienste wieder.
Keine Acer-/VS-Code-/Modellaktion. Diesen falschen Abschluss nicht als Erfolg
ausgeben und die Prüfung nicht durch Ignorieren der sessions.db umgehen.

Neuer realer Datei-/SQLite-Rotfall p4-dispose-idle-state-red4/4 fehlgeschlagen:
mit und ohne vorherigen Fixtureturn erzeugt Runtime-Dispose falschen terminalen
Status. Quelle jetzt gezielt: ruhende interaktive Sitzung nur freigeben, dauerhaften
Status/Exitbeleg/Nachrichten beibehalten und keine Task-Abschlusstelemetrie erfinden.
Laufende Abbruchpfade und ausdrücklich abgeschlossene Sitzungen bleiben getrennt.
Erster Grünlauf neue4/4 sowie bestehender Runtimehost bestanden; Gesamt126/128,
zwei ältere Cold-History-Fälle sehen unerwartete Hintergrund-GET/models-Anfragen.
Diese Fehler nicht verschweigen: enge Isolation/Typ-/Buildprüfung laufen weiter.
Noch keine produktive Statuskorrektur oder neue Recall-Producer-Aktivierung.

Enger Folgelauf bestätigt: beide alten Identity-Fälle scheitern auch isoliert.
Sie prüfen reale Agent-IDs ohne Inferenz, hatten aber keinen gespeicherten
Runtime-Provider und verboten pauschal auch die inzwischen explizit eingeführte
GET/models-Metadatenabfrage. Test-Fixture erhält jetzt eigene private gespeicherte
Providerkonfiguration plus ausschließlich simulierte Metadatenantwort. Nach
Kaltaufnahme müssen ALLE Abfragen GET am exakt gespeicherten lokalen Testendpunkt
sein; echter globaler Fetch bleibt verboten, kein Inferenz-/Cloudaufruf toleriert.
Keine produktive Provider-/Endpointentscheidung geändert. Abschließender gezielter
Lauf p4-dispose-native-persistence-corrected128/128,Exit0(32,72s), tatsächliche
Datei-/SQLite-Persistenz mit vier neuen vorher roten Disposefällen. Core-Build
Exit0(22,68s), abschließende Core-Dev-Typen Exit0(48,36s), Pluginruntime Exit0(1,97s).
Neue produktive Paketierung/Statuskorrektur bleibt bis zu weiteren Prüfungen offen.
Nach dem verweigerten Versuch alter Browser-Auth-V2-Build weiterhin installiert;
CorePID2772664,Hubhub_1793623648445_6fj2z; Launchhash weiterhin
5bde849fcb32930990072f12e81eef4c77ee1a36d70d504b085b7ea8493b670d,keinrecall.

### Produktive sessionbezogene Recall-Verbindung und weiterer echter Archivbefund

Dispose-Fix a676a2e11, Produktionsbundle Exit0(24,28s), neue VSIX
shared-runtime-recall-lifecycle-candidate.vsix SHA
e54778887f6944bb930da066a9dcca01a7967774e2bf8e01404d9dc65c5df456,
334Payload-Dateien bytegeprüft; tatsächlicher isolierter Paketeigentümer-/Drain-
Test Exit0(35,69s). Erforderliche aktuelle lokale Sicherung im vorhandenen
R/shared-recall-runtime-lifecycle-delta: sieben durch den ersten Stop geänderte
Dateien,31unveränderte geprüfte Dateien wiederverwendet; echte vollständige
Wiederherstellung/Attribute bestätigt. Archiv
2488169258f4963071366819e64d9ea7785d1c727af0410e689c3b97f4a45e96,
Manifest25c3d106cc9a45c957aa24d2775dc996d027fdf32926c78dcea695f433f313f0.
Erster neuer Preflight hatte wegen falsch übernommener Vorgänger-Hashkonstante
vor jeder Änderung verweigert; Konstante gegen belegten Vorgänger korrigiert.

Produktive Fortsetzung SUCCEEDED: ausschließlich eigene zwei Dienste und eigene
VSIX/Launchkonfiguration, zuvor Auftragsruhe/keine weiteren Clients bestätigt.
334installierte Dateien verglichen, andere registrierte Extensionidentitäten/
Versionen/Pfade unverändert, Haupt-VS-Code nicht beendet, kein Acer-Eingriff.
CorePID2788475,Dashboard2788577,active/running,Resultsuccess,NRestarts0.
Eigene Daten gegen aktuellen Restore unverändert; geschützte Launchkonfiguration
jetzt exakt verifizierter Hash51d6cdf2d543d7c80c2bbbc85a42000eccba95fa02c9f33e74e62cf976101e4b.
Sessionbezogene Recall-Verbindung mit beiden bestehenden persönlichen Keys und
getrenntem verifiziert gesichertem Signierer aktiv; kein globales Projekt.
Privater Installationsnachweis R/shared-recall-runtime-lifecycle-delta/installation.json.

p4-productive-recall-connection: beide tatsächlichen persönlichen Runtime-Logins
lesen erfolgreich denselben produktiven Acer-Katalog, Producer configuredtrue.
Vor erster Runtime-Archivierung vollständiger Live-Katalog/alle Ereignisse mit
bereits geprüfter externer Phase-2-SQLite-Sicherung lesend verglichen: exakt derselbe
eine ursprüngliche Datensatz. Keine unnötige neue Datenbanksicherung. Bestehende
Backup-SHA48e8e86b5c77519ce57101c1cb08ef71d50373e8094f7339ab7272ee2809c85a.

Neuer tatsächlicher HTTPS-Browser-/Modellturn p4-productive-recall-session-continuity
Exit0(118,95s), kein Fixtureprovider: Friseer authentifiziert übernimmt kontrollierte
Sitzung1793603066247_pk2cs und sendet EINMAL Marker
NETAIGIS_RECALL_RUNTIME_CONTINUITY_READY. Alle bisherigen13Nachrichten exakt
erhalten, nun15,neue NutzerurheberschaftFriseer,finalidle,CorePIDaktuell2788475,
nach Browserclose resident. Echter neuer Turn beseitigt den zuvor nachgewiesenen
falschen alten Completedstatus regulär, keine manuelle SQL-/Historienumschreibung.
Nicht als physische Android-/neue VS-Code-/Archivierungsabnahme ausgeben.

Danach kontrollierte technische Testsitzung ausdrücklich einzig dem bereits
vorhandenen total-recall-production-test zugeordnet; Rücklesen der kanonischen
Projektbindung erfolgreich. Keine Bindung des ursprünglichen langen Auftrags,
keine globale NetAigisOS-Entscheidung. Tatsächlicher Core archiviert Snapshotseq2;
beide persönlichen Akteure lesen identisches HMAC-verifiziertes, idle und formal
wiederherstellbares Archiv mit15Nachrichten. Vollständiger Gleichheitsvergleich
verweigert jedoch p4-productive-existing-session-recall-archive,Exit1(1,58s).
Anschließende NUR LESENDE Diagnose Exit0(0,92s): EIN Unterschiedspfad
/14/metrics. Autor/ID/Inhalt/übrige Historie unverändert. Neuester Agent-Workingcopy
fehlen nach Finalpersistenz ergänzte Messdaten; readLiveSessionMessages gibt ihn
bisher ungeprüft direkt zurück. Keine Projektbindung oder Modellantwort wiederholen.
Neue echte Datei-/SQLite-Regressionsfälle zur sicheren Live-Metadatenanreicherung
laufen; keine vollständige Archiv-/Wiederaufnahmenabnahme behaupten.

Gezielte Metadatenkorrektur: bestehende Finalpersistenz-Zusammenführung als
withPersistedMessageMetadata wiederverwendbar gemacht, readLiveSessionMessages
ergänzt ausschließlich fehlende Felder derselben kanonischen Nachricht aus der
eigenen Persistenzbaseline. Rollen/Inhalt und vorhandene IDs müssen passen;
neue/geänderte Live-Nachrichten und ungespeicherte Streamingtails bleiben live,
keine neuen IDs oder Messwerte erfunden. Übernommene Werte geklont gegen Aliasing.
Neue native Dateien/SQLite-Fälle zunächst2/2rot(5,60s), danach mit bestehenden
History-/Host-/Archivtests133/133grün(24,77s). Zusätzliche Fälle verweigern
Metadatenübernahme bei anderer ID oder anderem Inhalt. Core-Build Exit0(26,06s),
Core-Dev-Typen Exit0(47,83s). Dieser neueste Fix bislang nur Quelle/Build;
installierter Lifecycle-Build weiterhin unverändert, Archivseq2 bleibt unverändert
als auditierbarer früherer Snapshot. Kein Modellturn und keine Projektbindung
wiederholt; korrigierten Snapshot später ausschließlich neu anhängen.

Bediener bestätigt echte Android-Anmeldung UND Verlauf nach erneutem Seitenreload:
„ja, scheint zu funktionieren“. Damit physischer Android-Reload-Lesebefund positiv.
Neue verbindliche UI-/Reconnect-Korrekturen: Verbinden/Abmelden ganz oben rechts
im Kopf, wiederholtes Übernehmen darf die Revision nicht grundlos erhöhen,
Bildschirmsperre/-Aufwecken soll ohne erneute persönliche Schlüsseleingabe
wiederverbinden. Aktueller Browseradapter hat belegtermaßen keinen automatischen
Close-/Wake-Reconnect; bestehende persönliche HttpOnly-Tickets bleiben der
Authentifizierungsweg. Neue Arbeit am belegten Stand, keine abgeschlossenen
Modell-/Projekt-/Sicherungsphasen wiederholen. HTTPS-Zertifikatsvertrauen weiterhin
offen; keine System-/Android-Vertrauensänderung durchgeführt.

### Android-Kopfbereich, idempotente Übernahme und Aufweck-Reconnect

Bedienerbefunde reproduziert: Browseradapter ohne Close-/Wake-Reconnect,
erneuter Claim desselben tatsächlichen Writers erhöht unnötig Kontrollrevision.
Neue rote Fälle:2Reconnectfehler bei2bestehenden grünen Adapterfällen; separater
Core-Claimfall rot. Reparatur: echtes globales Kopfteil, persönliche Friseer-
Schaltfläche rechts oben; Verbinden/Abmelden im zugehörigen aufklappbaren Menü.
Keine persönlichen Schlüssel im UI-Storage. Sitzungs-/Recall-Bedienung bleibt
getrennt im vorhandenen Sitzungsbereich. Erfolgreiche eigene Schreibübernahme
wird pro Browserpeer, Sessionrevision und Auth-Generation bestätigt; gleichnamiger
Akteur auf anderem Gerät verleiht dieser Ansicht keine Schreibrechte. Übernehmen
bei bereits bestätigter Ansicht deaktiviert. Core prüft weiterhin die Revision
und bestätigt identischen Actor/Client/Connection ohne Persistenz oder Erhöhung.

Browser öffnet nach Close mit begrenztem exponentiellem Backoff neuen Socket;
bei verborgenem Dokument pausiert dieser Timer. Visibility-/Focus-/Online- und
BFCache-Wiederkehr ersetzen nötigenfalls scheinbar noch offene alte Verbindung.
Bestehendes privates Cookie wird am tatsächlichen Hub neu bestätigt. Danach nur
ready/Attach derselben zuletzt bestätigten Session; bereits gesendete/unterbrochene
Schreibvorgänge werden NICHT erneut abgespielt. Keine automatische Writerübernahme
oder Modellanforderung beim Aufwecken. Alte Socketcallbacks können die neue
Verbindung nicht leeren; Logout bleibt widerrufen und reconnectet allenfalls lesend.

Gezielte Browser-/Auth-/Ticket-/echte HTTP-/HTTPS-Abbruchtests30/30,Exit0(28,81s);
Core-Berechtigungs-/echte WS-Tests23/23,Exit0(10,42s), einschließlich wiederholtem
revisionsstabilem Claim über echten Socket. Web-Build Exit0(68,05s), Hub-Typen
Exit0(54,20s), Core-Build Exit0(51,84s), Pluginruntime Exit0(1,45s), Bundle Exit0(5,98s).
Neue eigene VSIX shared-runtime-android-wake-candidate.vsix SHA
27eaee38efbd4e5cede18feacd36b3f5390d42742c5b7cfda47ef0685052cdd4,
347Payload-Dateien tatsächlich gegen Build bytegleich geprüft. Echter extrahierter
HTTPS-/Chromium-Pakettest Exit0(14,66s): Kontomenü geometrisch rechts oben,
Abmelden im Kopf, simulierter Hidden/Visible-Wechsel erzeugt tatsächlich neuen
Socket und bestätigte Friseer-Anmeldung ohne Schlüsselwiederholung. Zusätzlich
Reload, HttpOnly/Secure/Strict, Logout+Reload anonym, Core bleibt nach Browserclose,
Dashboardneustart und saubere Kinder-Exits geprüft. Kein physischer Android-
Bildschirm-/VPN-Test und kein neuer Modellturn in dieser Prüfung.

Vor Produktivaktualisierung nur aktuelle eigene Änderungen ergänzend gesichert
in R/shared-android-wake-delta:11geänderte Dateien,27geprüfte unveränderte Dateien
wiederverwendet, aktive SQLite-Backup-API, vollständige tatsächliche Wiederherstellung
mit Attributen. Archiv78a718c862d1e7d8285bc18e17f1a49c96300c3f69808def5b562f7ec88083f5,
Manifest472f6a235ba5cbd308aa3f9d0ee72001b3bebfcff93c30d7f9ae44d3b86ca606.
Keine neue Schlüsselgenerierung oder produktive Dateiänderung beim Sichern.
Produktive Installation dieser neuesten UI-Korrektur steht als nächster Schritt an;
installiert bislang Lifecycle-Build e5477888... mit15Nachrichten und Recallseq2.

### Tatsächlich installierte Android-Korrektur und vollständiger Recall-Snapshot

Der folgende Nachweis ersetzt die unmittelbar vorherige Installationsnotiz:
cdacb44f8 ist produktiv installiert, VSIX-SHA27eaee38efbd4e5cede18feacd36b3f5390d42742c5b7cfda47ef0685052cdd4,
alle347Payload-Dateien verglichen. Vorher tatsächlich privates Owner-HTTP-Drain,
Auftragsruhe und keine anderen Clients bestätigt; nur die zwei eigenen User-Dienste
aktualisiert. CorePID2952209,Dashboard2952259,active/running,Resultsuccess,NRestarts0.
Produktiver Haupt-VS-Code und Acer unverändert. Kanonische15Nachrichten, eigene
Sitzungsdaten und Recall-Launchkonfiguration unverändert; idle nicht mehr fälschlich
als Completed/Exit0 gespeichert. Nachweis R/shared-android-wake-delta/installation.json.

p4-productive-android-wake Exit0(10,87s) prüft tatsächlich installierten HTTPS-Dienst
mit Chromium: Menü rechts oben, persönliche Anmeldung, Übernehmen nach eigenem
Claim deaktiviert, neuer Socket mit bestätigter Cookie-Anmeldung bei simuliertem
Aufwecken, gleicher Verlauf, zwei Reloads, Logout+Reload anonym. Keine Modellantwort
oder Historienänderung. Getrennter tatsächlicher Android-Nachweis durch Benutzer:
„Menü und Wiederverbindung funktionieren“. Damit physisches Menü und Wiederverbindung
nach Bildschirmsperre bestätigt; kein Nachweis externer Mobilfunk-/VPN-Nutzung.

Korrigierte tatsächliche Archivierung ohne Wiederholung von Modellturn oder
Projektbindung: kanonische Session modellfrei fortgesetzt, neuer Snapshotseq4
appendiert. p4-productive-recall-corrected-snapshot Exit1(35,52s) bleibt als
negativer Prüfbeleg erhalten: dessen Polling vergleicht JSON-Propertyreihenfolge
statt semantischer Nachrichtengleichheit. Anschließende ausschließlich lesende
Deep-Prüfung p4-productive-corrected-archive-readonly Exit0(0,89s): beide tatsächlichen
Akteure lesen identischen, HMAC-verifizierten seq4, alle15Nachrichten inklusive
letzter Metrics und unveränderlicher Autoren stimmen exakt mit kanonischer Historie
überein, Unterschiedspfade leer, Statusidle, Wiederherstellung formal verfügbar.
Früherer seq2 bleibt unverändert. Tatsächliche Wiederherstellungsprobe in getrenntem
nativen Testbestand folgt; formale Eignung allein ist keine vollständige Abnahme.


### Tatsächliche Wiederherstellungsprobe: Unterprojektgrenze repariert

Erster isolierter Prüflauf p4-actual-recall-native-restore Exit1(1,20s) endete vor
Hub-Start an der absichtlich strikten Workspace-Gleichheitsvorprüfung. Keine
Wiederherstellung oder produktive Änderung. Prüfung mit tatsächlicher bestehender
Runtimekonfiguration fortgesetzt: p4-actual-recall-native-installed-boundary
Exit1(5,52s), tatsächlicher installierter Core verweigert Restore mit
recall_workspace_mismatch. Konfiguration autorisiert /home/friseer/MyGIT,
signiertes tatsächliches Archiv gehört zum Unterprojekt cline-4.1.26-repair.
Keine Konfiguration oder Archivpfade umgeschrieben, keine Fremdprojekte gelesen.

Gemeinsamen serverseitigen Restorepfad gezielt korrigiert: realpath-geprüfte
Enthaltenheit Runtimewurzel -> Projektwurzel -> Projekt-cwd. Gleichheit bleibt
gültig; benachbarte Zeichenpräfixe, Symlink-Ausbruch und cwd außerhalb des Projekts
werden verweigert. Neuer echter Socket-Regressionsfall zunächst rot,9andere grün;
danach alle41gezielten Transport-/Import-/Zugriffsprüfungen grün,Exit0(12,60s).
Core-Build Exit0(32,54s),Dev-Typprüfung Exit0(57,36s),Pluginruntime Exit0(3,22s).

p4-actual-recall-native-repaired-restore Exit0(4,72s): tatsächliche Acer-GET-API,
vorhandene persönliche Zugänge und unabhängiger Signierer, tatsächlicher seq4;
neuer reparierter Core-Build mit realem isoliertem Hub/native SQLite. Kein
Fixturearchiv und keine Fixtureantwort. Alle15Nachrichten inklusive endgültiger
Metrics und ursprünglicher Autoren exakt erhalten; Session-ID, Projektbindung,
Modell/Workspace und Checkpoint-METADATEN erhalten. Kein Beleg einer zusätzlich
physischen Checkpoint-Objektwiederherstellung. Antragstellerjimmi separat erfasst,
kein Writergrant, keine Agent-/Tool-/Modellerzeugung, kein synthetischer Exitcode.
Veraltete Revision verweigert, identischer Wiederholimport unveränderlich,
verändertes Archiv darf vorhandenen Zielbestand nicht ersetzen. Native Datenbank
geschlossen/neu geöffnet und komplette Historie erneut gleich gelesen.
12echte Recall-GETs,0Schreibversuche; produktive15Nachrichten und ursprüngliche
lange Auftragshistorie bytegleich unverändert. Sämtliche isolierten Testartefakte
unter bestehendem E/test-data erhalten. Reparatur noch nicht produktiv installiert;
Android-Menü/Wake-Build bleibt produktiv aktiv. Kein erneuter Modellturn, keine
wiederholte Projektbindung, keine neue Sicherung oder Acer-Dienständerung.


### Ausgelieferter Restore-Fix und erneute Paketprüfung

Commitfadb8b777 enthält Unterprojektkorrektur und automatisierte Sicherheitsfälle.
Eigenes neues Paket shared-runtime-recall-recovery-candidate.vsix,
SHA0e06598cc43165846fb3ad10b7e246f8523e72d99cc86d97f84338edbf14c6b3,
347Payload-Dateien bytegleich zum Build geprüft. Bundle Exit0(5,27s),
Paketierung Exit0(5,78s). Extrahiertes Paket mit echten isolierten Prozessen,
HTTPS,Chromium,Auth/Wake/Reload/Logout/Ownerdrain Exit0(21,31s).
Tatsächliches Acer-Archiv aus EXAKTEM extrahiertem Paket in leeren nativen Store
wiederhergestellt/kalt neu geöffnet: Exit0(4,77s), keine Fixturearchivdaten,
keine produktive Historienänderung oder Inferenz. Git-Checkpointobjekt
4971cc92df547dd67ba5923d369e81a238fc8375 ist im vorhandenen Reparatur-Repository
lesend als Commit bestätigt; keine neue Objektwiederherstellung ausgeführt.

Nur acht seit der letzten geprüften Sicherung geänderte eigene Dateien zusätzlich
unter R/shared-recall-recovery-delta gesichert,30unveränderte wiederverwendet.
Aktive SQLite-Backup-API, Integrität und tatsächlicher Restore mit Attributen
bestätigt. Archiv4ebdbc0614e712dcb7d0d903720c5548b3f848aef47f61e328247a903a292b31,
Manifest3247223a4a999de9dd14f7928fc019e1654c0ac4773928517033ddf0aa4cebc6.
Vor produktiver Übernahme reale Owner-HTTP-Drain-/Ruheprüfung, keine weiteren
Clients/angenommenen Arbeiten. Bestehende eigene Aktualisierungsfreigabe verwendet.
Nur eigene Extension und zwei eigene User-Dienste aktualisiert,347installierte
Dateien verglichen, kanonische Daten/Secrets/Recallkonfiguration unverändert,
andere registrierte Extensionidentitäten/Versionen/Pfade unverändert.
Keine Acer-/Modelländerung und Haupt-VS-Code nicht geschlossen. Originalbranch
coding-agent-v4 weiterhin624c2cd6661e100680d8b61daa3a3447f4708536.

Produktiver CorePID2987922,Dashboard2988057,active/running,Resultsuccess,NRestarts0,
HTTPS verbunden. Idle-/Historienerhaltung nach tatsächlichem Corestop erneut
positiv, kein künstlicher Completedstatus. Privater Nachweis
R/shared-recall-recovery-delta/installation.json. Absichtlicher Dashboardneustart
verwirft RAM-only Browser-Tickets: einmalige neue persönliche Anmeldung danach
erwartet, kein Verlust bestehender Sitzung. Normaler physischer Android-Reload/
Screen-Wake bereits vom Benutzer positiv bestätigt. Mobilfunk/WireGuard-Test
angefragt, noch keine Antwort; aus LAN-/Desktoptests nicht ableiten.


Abschließender INSTALLIERTER-Code-Nachweis für diesen abgegrenzten Fix:
p4-actual-recall-native-installed-fixed-restore Exit0(5,49s), tatsächliches
Acer-Archiv mit tatsächlich installierter Core-Implementierung nach denselben
strikten Restore-/Fehler-/Autoren-/Kaltstart-Prüfungen wiederhergestellt. Ziel
weiterhin isolierter nativer Testbestand, KEIN Ersatz produktiver Sitzung.
15Nachrichten vollständig,12GETs,0Recall-Schreibversuche,0Agent-/Runtimeaufrufe,
produktive kontrollierte UND lange Originalhistorie bytegleich. Das schließt den
nachgewiesenen Unterprojekt-Restorefehler; keine Gesamtproduktabnahme daraus
ableiten. Main-VS-Code-Anbindung und echter geräteübergreifender Modell-/Werkzeugturn,
Learning-Verhaltensabnahme, ursprünglicher unbekannter Besitzerzustand, externes
VPN und Zertifikatsvertrauen bleiben ausdrücklich offen.


### 2026-11-02: Tatsächlicher Android-Zugriff über externes WireGuard bestätigt

Benutzer beantwortet ausdrücklich den Test WLAN aus -> Mobilfunk + vorhandenes
WireGuard -> derselbe Browser-Tab/Anmeldung/Verlauf mit „ja, funzt“.
Damit echtes Android über externen VPN-Zugang als Bedienernachweis positiv;
bisheriges „VPN offen“ ist für Verbindung/Anmeldung/Historienlesen überholt.
Keine neue Firewall-, DS-, VPN-, Zertifikats- oder Dienständerung.
Keine physische Android-Inferenz oder Werkzeugausführung daraus ableiten.
Nächster separater Bedienertest: EIN Modellturn NETAIGIS_ANDROID_VPN_READY in der
vorhandenen kontrollierten Sitzung, ohne Werkzeuge; keine automatische Wiederholung.


Gezielte ausschließlich lesende Prüfung der eigenen produktiven VS-Code-
Konfiguration bestätigt: shared-session-hub_connection derzeit nicht gespeichert.
Keine Secrets ausgegeben oder geändert, kein ursprünglicher Auftrag abgebrochen.
Damit bisherige isolierte native VS-Code-Integration nicht als bereits verbundene
produktive Hauptinstanz ausgeben. Die vorhandene persönliche Konfigurations-
Command bleibt der sichere Einstieg; keinen Secret-Cache von außen überschreiben.
Lesender Verifikator für den angefragten physischen Android-Modellturn unter
E/verify-physical-android-vpn-turn.mjs vorbereitet. Er sendet selbst KEINEN Prompt,
übernimmt kein Schreibrecht und erfindet keine Geräteerkennung. Prüfung nach
Bedienertest gegen vorhandenen15Nachrichten-Präfix/kanonische Autoren und tatsächlichen
signierten Acer-Snapshot; erfolgreiche frühere Modellturns nicht wiederholen.


### Fehlendes mobiles Eingabefeld: tatsächlicher Layoutfehler

Benutzer kann den angefragten physischen Android-Modellturn mangels Eingabefeld
nicht ausführen. Anweisung war verfrüht. Keine Inferenz/Abnahme daraus erfinden.
p4-mobile-composer-productive-red Exit1(9,72s), echte produktive HTTPS-Seite mit
isoliertem mobilen Chromium, KEIN Claim/Modellturn: Textarea vorhanden und enabled,
aber bei360x640 y643..707 und bei390x844 y827..891 außerhalb/geclippt. Desktop
1280x800 ebenfalls unten abgeschnitten. Alter separater SharedSessionAccess plus
Chat h-full verbrauchen mehr als die Mainhöhe; kein Beleg fehlender Schreibrechte
als Ursache dieses konkreten Befunds. Verlauf bytegleich unverändert.

App-Main als begrenzte Flexspalte, gemeinsame Steuerung als begrenzter scrollbarer
Bereich, Inhaltswrapper mit verbleibender Höhe; Chat h-full/min-h-0, eigener Header
und Composer schrumpfen nicht. Auf Mobilgeräten entfällt nur der doppelte Titelblock
in der Sidebar, eigener globaler Kopf bleibt erhalten. Kein Auth-/Writerbypass,
keine API-/Modell-/Datenpfadänderung.

Persistenter nativer Paket-Regressionsmodus NETAIGIS_RUNTIME_MOBILE_COMPOSER=1:
legt ausschließlich isolierte native16Nachrichten-Fixture an, keine Agenten/Modelle;
prüft Textarea UND Submit vor jedem Auto-Scroll geometrisch und mit Element-Hittest
bei390x844,360x640,390x430,844x390,1280x800. Zusätzlich echtes Tap/Entwurfstippen/
Leeren, niemals Absenden. Neues Oracle gegen alten unveränderten extrahierten
Recall-VSIX reproduziert Fehler,Exit1(16,11s),Send y841..873 bei844Höhe.
Erster neuer Kandidat besteht größere Größen, scheitert aber bei430Höhe an
Send bottom440,5; negativer Nachweis Exit1(21,15s) und Paket d749de77... bleiben.
Kompakter mobiler Sidebar-Titel behebt verbleibenden Platzmangel.

Finaler Web-Build inklusive Typprüfung Exit0(28,51s), Bundle Exit0(4,30s),
Paketierung Exit0(9,72s). Neues eigenständiges Paket
netaigis-coding-chat-0.1.0-shared-runtime-mobile-composer-v2-candidate.vsix,
SHA23afa23989cc941418726ce3136d259cafadbb1ce79117f7c23cdf35ad8a9902,
363Payload-Dateien tatsächlich bytegleich verifiziert/extrahiert.
p4-mobile-composer-v2-native-package Exit0(24,09s): alle10geometrischen Input-/Send-
Hittests bei5Größen grün; bei390x430 Eingabe320..384,Send390..422. Zusätzlich
Drafttippen, persönliche Cookie-Anmeldung, Wake-Reconnect, Reload/Logout,
Runtimebesitz/-Speicherpfade und saubere eigene Kinder-Exits positiv. Kein
physischer Android-/Bildschirmtastaturnachweis und keine Inferenz.

Nachweisbare Paketdifferenz betrifft ausschließlich Browserdateien. Geplante
minimal nötige produktive Übernahme: alte HTML-Einstiegsdatei geschützt sichern
und mit Attributen tatsächlich wiederherstellen; neue geprüfte Hash-Assets zuerst
hinzufügen, index.html danach atomar ersetzen. Alte Hash-Assets erhalten, kein
VS-Code-/Core-/Dashboard-/Acer-Neustart, keine Sitzungs-/Secretänderung. Der
bestehende HTTP-Server liest index.html pro Request mit no-store. Deshalb bleiben
bestehende RAM-only persönliche Browser-Tickets gültig. Anwendung erst nach den
vorstehenden positiven Paketprüfungen; anschließender tatsächlicher Layout-/Draft-
Nachweis am produktiven HTTPS-Dienst erforderlich.


### Produktiv ausgelieferte Browserkorrektur ohne Neustart

Sourcecommit1244cf0e4. Neues Paket23afa23989cc941418726ce3136d259cafadbb1ce79117f7c23cdf35ad8a9902
unterscheidet sich vom bisher installierten Recall-Paket ausschließlich in Browser-
Payloads. Bestehende347Payload-Dateien vor Übernahme vollständig verglichen.
Kein erneuter allgemeiner Sitzungs-/DB-Sicherungslauf, weil diese Auslieferung
nur öffentliche Browser-Assets und HTML ändert. Tatsächlich betroffene bestehende
HTML-Datei geschützt gesichert und aus Sicherung mit Eigentümer/Modus/mtime/xattrs
real wiederhergestellt, Inhalt und Attribute geprüft. Bestehender Sicherungsbaum:
R/mobile-composer-assets-delta,ManifestSHA
f144b35f9191b656448443b7f6072ae6a5afa9807c1aa39ab84ef4af55f8656f.
Manifest dokumentiert ursprüngliche Abwesenheit neuer Hash-Assets und Rückfall:
allein index.html atomar aus geprüftem Original wiederherstellen; alte referenzierte
Assets bleiben erhalten. Keine unkontrollierte Löschung.

Anwendung erfolgreich:16neue Hash-Assets zuerst exklusiv geschrieben/geprüft,
eine HTML-Einstiegsdatei zuletzt atomar ersetzt; sämtliche363Payload-Dateien des
neuen VSIX gegen produktive Installation bytegleich verglichen (package.json
wie zuvor ohne Installer-__metadata verglichen). Hierfür KEIN code--install-extension
aufgerufen und kein Dienst/Prozess gestoppt. CorePID2987922 und DashboardPID2988057
sowie beide InvocationIDs vor/nach identisch, Launchkonfiguration unverändert,
keine Session-/Secretmigration, kein Acer-/Modell-/Firewall-/Haupt-VS-Code-Eingriff.
Privater Anwendungsbeleg R/mobile-composer-assets-delta/application.json.

p4-mobile-composer-productive-fixed Exit0(6,82s), tatsächliche produktive HTTPS-Seite
mit vorherigem persönlichen Browserprofil/Cookie aus negativer Layoutprobe:
Friseer weiterhin ohne neue Schlüsseleingabe authentifiziert. Alle5Größen mit
aktuell gespeicherter15Nachrichten-Historie geprüft, Input und Submit vollständig
sichtbar und per echtem DOM-Hittest erreichbar. Bei360x640 jetzt Eingabe530..594,
Senden600..632; zuvor643..707/geclippt. Bei390x430 jetzt Eingabe327..391,
Senden397..429. Eingabe enabled, echter Entwurf getippt und geleert, nicht gesendet.
Kanonische Historie bytegleich unverändert, kein Claim, keine Inferenz.

Benutzer nun ausschließlich um Neuladen/Sichtbarkeit/Entwurf auf dem echten Handy
gebeten, ohne Absenden. Physische Bildschirmtastatur noch NICHT bestätigt;
Desktop-/mobile Viewportemulation nicht als Geräteabnahme ausgeben. Der zuvor
angeforderte NETAIGIS_ANDROID_VPN_READY-Turn ist mangels erreichbarer Eingabe nicht
erfolgt und bleibt offen. Keine automatische Wiederholung. Externer VPN-Zugriff/
Anmeldung/Verlauf ist bereits durch echten Benutzerbefund positiv, unverändert.


### Ungesendeter Text bei Reload und schwacher Kontrast

Benutzer bestätigt physisches Android-Eingabefeld/Tippen. Präzisierung:
„Nur der ungesendete Text“ geht nach Aktualisieren verloren. Kein gemeldeter
Verlust von Login, ausgewählter Session oder bisherigem Verlauf.
p4-composer-draft-productive-red Exit1(10,27s) reproduziert genau das am produktiven
HTTPS-Dienst mit isoliertem Browser: Auth/ID/Historie bleiben, ungesendeter Entwurf
verschwindet; kanonische15Nachrichten bytegleich, kein Claim/Modellturn.

Bestehenden Composer um Textentwürfe im sessionStorage DES BROWSER-TABS ergänzt.
Schlüssel nutzt bestätigten Akteur sowie Session-ID; neuer Chat getrennt über
expliziten Workspace, keine erfundene globale Projekt-/Sitzungskennung.
Synchrones Schreiben bei Eingabe, Wiederherstellen vor Darstellung; keine
Sendequeue, keine automatische Übermittlung/Replay und keine zweite Archivarchitektur.
Getrennter Namespace Friseer/jimmi und je Sitzung. Bewusstes Leeren/Absenden entfernt
Entwurf; Absenden ist keine Aussage über den Erfolg des Modellturns. Explizites
Abmelden entfernt nur die Entwürfe dieses Akteurs im Tab. Verbindungsausfall ist
kein Logout. Speichersperre/Quota behalten Text im aktuellen Speicher und zeigen
„Entwurf ungesichert“; ältere gespeicherte Daten überschreiben dann nicht den
neuesten In-Memory-Text. Keine Persistenz von Anmeldeschlüsseln oder Dateianhängen
in Entwurfsdaten. Tab-Schließen ist kein garantierter dauerhafter Entwurfserhalt.

Deutliche Eingabekante/Text/Platzhalter, stärkere sekundäre Texte/Ränder hell/dunkel,
primärer beschrifteter Senden-Knopf statt alleinstehendem blassem Icon. Während
eines laufenden Turns verhindert disabled erneutes Absenden, Entwurf bleibt tippbar.
Lange Modellanzeige passt flexibel in verbleibenden Platz, vollständig im Titel/
Einstellungsdialog erhalten, Modellkonfiguration unverändert. Mobiler Chatkopf
kompakter, damit Senden weiterhin bei430Pixelhöhe sichtbar bleibt.

28/28Entwurfs-/Browsertransport-/Auth-/Zugriffsregressionen Exit0(16,85s), vier Dateien.
Vorheriger Build verweigerte Constructor-Parameterproperty bei erasableSyntaxOnly,
gezielt durch normales Feld ersetzt; negativer Beleg erhalten. Erster neuer
Paketkandidat b0446d8b... scheitert berechtigt: breiteres Senden und ungekürzter
Modellname überlaufen bei390Pixelbreite,Exit1(15,19s), nicht installiert.
Abschließender Web-Build mit Typprüfung Exit0(18,95s),Bundle Exit0(3,11s),
Paketierung Exit0(4,56s). Finales eigenes VSIX:
netaigis-coding-chat-0.1.0-shared-runtime-browser-draft-contrast-v2-candidate.vsix,
SHA590d7bab234039a1e9b484ac6448f61ebcc54098784dd57e72e4c5729532c94e,
382Payload-Dateien bytegleich verifiziert/extrahiert.

p4-browser-draft-contrast-v2-native-package Exit0(19,88s): tatsächliche isolierte
native Runtime und Chromium. Zwei native16Nachrichten-Fixtures, keine Inferenz.
Textentwurf bleibt bei Reload, Sessionwechsel getrennt, jimmi sieht Friseer-Entwurf
nicht; expliziter Logout entfernt nur dessen Entwürfe. Eigener jimmi-Entwurf bleibt
bei Reload, bewusstes Leeren bleibt leer. Wiederherstellung sendet keinerlei send-
Frames. Gesperrter sessionStorage: Tippen funktioniert, Ungesichert-Hinweis sichtbar.
Echte gerenderte Kontrastmessung im Browser hell/dunkel: Senden17,176:1,
Platzhalter7,584:1hell/13,319:1dunkel. Weiterhin5Viewportgrößen mit Input/Send-Hittest,
zusätzlich Entwurfshinweis schiebt Senden nicht aus dem Fenster. Auth/Wake/Reload/
Logout, geschützte Cookies und saubere eigene Prozess-Exits positiv.
Noch keine physische Geräteabnahme dieser Entwurfs-/Kontraständerung. Minimaler
Browser-only-Rollout und anschließender tatsächlicher produktiver Reload-/Entwurfs-
und Layoutnachweis folgen, ohne Neustart/Root-/Modell-/Dienständerung.


### Produktivprüfung der Entwurfs-/Kontrastkorrektur

Sourcecommit8c32b66d2. Browser-only-Differenz des tatsächlichen finalen VSIX
590d7bab234039a1e9b484ac6448f61ebcc54098784dd57e72e4c5729532c94e gegen
vorherigen produktiven Mobile-Composer-V2 vollständig geprüft: andere Payloads
bytegleich. Nur bestehende index.html zusätzlich geschützt gesichert und tatsächlich
mit Eigentümer/Modus/mtime/xattrs wiederhergestellt. Keine erneute Sitzungs-/DB-
Sicherung, diese Dateien sind keine Schreibziele. Bestehender Sicherungsbaum
R/browser-draft-contrast-assets-delta,ManifestSHA
32de145ae6e6fb5bec1cb76a466f35ca1cd119c8035eaeaac54158afd8cf5f30.
Anwendung erfolgreich:19neue geprüfte Hash-Assets zuerst hinzugefügt, dann eine
HTML-Einstiegsdatei atomar ersetzt; alte Hash-Assets unverändert erhalten.
Alle382Payload-Dateien gegen produktive eigene Installation verglichen.

Kein Code-CLI-Installationslauf, kein eigener oder fremder Dienstneustart.
CorePID2987922,DashboardPID2988057 und beide InvocationIDs identisch vor/nach.
Anmeldetickets, Launch-/Modellkonfiguration und private Sitzungs-/Secretdaten
unverändert; keine Acer-/Routing-/Firewall-/Originalbranchänderung. Rückfall über
geprüftes Original-index.html mit Attributen dokumentiert, keine automatische
Rücknahme. Privater Anwendungsbeleg R/browser-draft-contrast-assets-delta/application.json.

p4-composer-draft-productive-fixed Exit0(13,70s), echte produktive HTTPS-Seite:
eingegebener nicht abgesendeter Text nach Reload exakt wieder da; Login, ausgewählte
ID und tatsächlicher kanonischer Verlauf bleiben. Bewusstes Leeren überlebt einen
weiteren Reload. Sichtbar beschrifteter Senden-Knopf, gemessener Vordergrund-/
Hintergrundfarbkontrast17,176:1 in beiden Designs. Frühere Platzhalterzahlen aus
dem Pakettest beziehen sich auf den jeweiligen Seitenhintergrund; keine pauschale
Barrierefreiheitsabnahme aus diesen Einzelmessungen ableiten. Keine Inferenz und
keine Schreibübernahme; kanonische15Nachrichten bytegleich unverändert.

p4-composer-draft-contrast-productive-layout Exit0(11,58s), tatsächlicher Dienst mit
bereits VOR Update bestehendem persönlichen Browserprofil: Cookie bleibt ohne
neue Anmeldung gültig. Alle5Viewportgrößen: Eingabefeld/Senden vollständig sichtbar
und per Hittest erreichbar; echtes Entwurfstippen ohne Absenden positiv.

Benutzer um physischen Android-Nachweis für diese neue Version gebeten: einmal
neuladen, NEUEN Entwurf tippen, erneut aktualisieren, Text/Lesbarkeit prüfen,
keine Modellanforderung. Ergebnisse aus Browseremulation nicht als dessen Antwort
vorwegnehmen. Der weiterhin offene eigentliche geräteübergreifende Modell-/
Werkzeugturn und die übrigen Originalaufträge bleiben offen, kein Gesamtabschluss.


### 2026-11-03 – Physischer Android-Nachweis: Entwurf und Lesbarkeit

Benutzerantwort auf den angeleiteten Test (neuen ungesendeten Entwurf eingeben,
erneut aktualisieren und Erhalt sowie Lesbarkeit prüfen): „ja, alles jetzt ok“.
Damit ist die zuvor offene physische Geräteprüfung dieser UI-Korrektur bestätigt.
Keine Tests, Sicherungen, Installation oder Modellanforderungen wiederholt.
Dieser Nachweis ist kein Modellturn und keine Gesamtabnahme. Als nächster offener
Geräteschritt bleibt der einmalige Modellturn in derselben bestehenden Sitzung
1793603066247_pk2cs als Friseer, anschließend lesender Vergleich von kanonischem
Verlauf, Urheberschaft und tatsächlicher TOTAL-RECALL-Archivierung.


### 2026-11-03 – Tatsächlicher Handy-Modellturn und Recall geprüft

Benutzer meldet „Turn ended (completed), iterations=1, input=0, output=0“.
Lesende Prüfung findet genau einen neuen authentifizierten Friseer-Turn in
1793603066247_pk2cs und die echte Antwort `NETAIGIS_ANDROID_VPN_READY.`.
Die ursprünglichen15Nachrichten bleiben identisch; jetzt17Nachrichten.
Erster strikter Markerprüfer Exit1 wegen zusätzlichem abschließendem Punkt;
negativer Nachweis erhalten. Auf tatsächlich beobachteten Text angepasster
lesender Vergleich p4-physical-android-turn-observed-period Exit0(4,64s):
Runtime idle/resident, Recallseq48, Quelle verifiziert, alle Nachrichten und
finalen Metadaten identisch archiviert. Kein erneutes Absenden, keine Inferenz
durch Prüfer, keine Änderung der produktiven Historie. Geräte-/Netzzuordnung
beruht auf angeleitetem Benutzertest, nicht Hardwareerkennung des Prüfers.

Die Nullanzeige darf nicht als fehlende Modellantwort interpretiert werden.
Quellbefund Chat.tsx/finalizeAssistantTurn: fehlende inputTokens/outputTokens
werden mit `?? 0` dargestellt. Ob hier fehlende oder explizite Nullwerte vom
Backend vorlagen, ist damit noch nicht bewiesen und weiter zu verfolgen.
Kein Werkzeugturn und keine Gesamtabnahme aus diesem Modellturn ableiten.


### 2026-11-03 – Fehlende Tokenangaben nicht als Null darstellen

Chat.tsx/finalizeAssistantTurn verwendete nachweislich `usage?.inputTokens ?? 0`
und analog output. Neuer reiner Formatter unterscheidet fehlend/ungültig
(„nicht gemeldet“) von tatsächlich gemeldetem0; keine Schätzung aus Textlänge.
Zwei neue Regressionstests plus bestehende Entwurfstests:5/5 bestanden,
p4-turn-summary-unknown-usage Exit0(1,81s). Web-Typecheck und Vite-Build
p4-turn-summary-web-build-correct-cwd Exit0(40,95s). Erster Buildaufruf
verwendete irrtümlich Repo-root statt Webview-cwd, TS5083; negativer Beleg
erhalten, anschließender korrekter Aufruf erfolgreich.

Server agent-events.ts reicht done.usage durch; Hub doneEventFromPayload
verwirft unvollständige Zählerpaare als undefined. Die gespeicherten
Sitzungsmetriken des Handy-Turns enthalten dagegen ausdrücklich0/0; allein
dieser UI-Patch löst deshalb nicht die noch offene tatsächliche
Telemetrieherkunft. Keine Behauptung einer vollständigen Tokenreparatur.
Quelländerung gebaut/getestet, noch nicht paketiert oder produktiv ausgerollt.
Nächste Arbeit: fehlende/Null-Telemetrie im vorhandenen Provider-/Adapterpfad
verfolgen, anschließend zusammenhängend paketieren und prüfen. Keine neue
Modellanfrage, kein Dienstneustart und keine produktive Dateiänderung hierfür.


### 2026-11-03 – Ursache der Streaming-Tokenverluste im echten Acer-Adapter

Gezielte lesende SSH-Prüfung ausschließlich im bestehenden Coding-Agent:
/opt/netaigis-coding-agent/ollama_adapter.py weiterhin SHA256
307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9.
completion() liefert im Nichtstreamingfall usage. Die tatsächliche async
sse_stream()-Funktion liefert dagegen Text, finish_reason und [DONE], aber
keinerlei usage-Ereignis aus prompt_eval_count/eval_count des finalen nativen
Datensatzes. Der vorhandene OpenAI-compatible Client setzt includeUsage:true;
der bestehende Router fordert upstream stream_options.include_usage:true an.
Damit ist ein konkreter Verlustpfad belegt; keine Behauptung, dass sämtliche
Modelle oder jede fehlende Verbrauchsangabe damit abschließend erklärt sind.

Neuer modellunabhängiger, bytegeprüfter In-Memory-Rewriter
sdk/scripts/netaigis-coding-agent-stream-usage.py ergänzt vor [DONE] ein
OpenAI-Usage-Ereignis mit choices:[], ausschließlich wenn beide bestätigten
nativen Zähler nichtnegative Ganzzahlen sind. Echte0 bleiben0; fehlende,
partielle, negative, boolesche oder ungültige Werte werden nicht erfunden.
Text/Finish/Tools sowie Request-, Modell-, Kontext- und Routinglogik bleiben
unverändert. Quellhash und wiederholte Anwendung werden strikt geprüft.
Kandidat auf tatsächlichem Source im Arbeitsspeicher erfolgreich erstellt:
205b879bba773dae0184097fbddbcc01c941f080b89f2969cf41be1563d691eb.
AST-Vergleich aller übrigen Top-Level-Funktionen identisch. Kein Kandidat
auf Acer geschrieben und kein Dienst verändert.

Vier lokale Regressionstests bestanden: p4-stream-token-usage-regression
Exit0(0,51s), einschließlich reproduziertem Verlust, Erhalt von Text/Finish,
Null-/Fehlwerten, Fehler-/Abbruchpfad und Quell-/Wiederholungsschutz.
Zusätzlich echten aktuellen Adapter und Kandidaten auf Acer isoliert im
Speicher mit sechs synthetischen Streams ausgeführt (stop/length × echte
Werte/Null/fehlend): alle erfolgreich, keinerlei Modell- oder HTTP-Anforderung.
Erster Vergleich scheiterte an naturgemäß unterschiedlichen UUID/Zeitstempeln
zweier isolierter Aufrufe; zweiter Vergleich normalisiert ausschließlich diese
zwei Antwortfelder und bestätigt unveränderte semantische Frames. Das ist
keine produktive Inferenzabnahme.

Noch offen: kontrollierte produktive Einführung im bereits freigegebenen
Adapterumfang mit vorhandener Sicherung/Wiederherstellungsprüfung, aktueller
Deltaabsicherung soweit nötig und Root-Terminalweg; danach echte Streaming-
Telemetrie prüfen. UI-Fallbackkorrektur b55b0f36b ebenfalls noch nicht
ausgerollt. Keine alte erfolgreiche Handy-Anforderung erneut senden.


### 2026-11-03 – Einführung der Streaming-Telemetrie vorbereitet

Bestehendes phase4-model-context-preflight enthält bereits exakt den aktuellen
Adapter307497...; deshalb KEINE neue Sicherung. Externes Manifest mit bekanntem
SHA6fb8ad9472f47875d01a35b4a3b73284951eeb5dc85048363255563824f36677
und genau dessen Adaptermember im bestehenden externen Archiv lesend bestätigt.
Vorhandene vollständige Archiv-/Restoreprüfung weiterverwendet.

Neuer Helfer netaigis-coding-agent-stream-usage-activate.py verwendet die bereits
getesteten Controller-/Dateiersetzungsfunktionen des bisherigen Adapterhelfers.
Vor jeder Änderung prüft er Root-Backup/Archivhash, tatsächliche Restore-Datei
mit Eigentümer/Modus/mtime/xattrs und aktuellen Sourcehash; nur307497... oder
exakt bereits installierter Kandidat205b... zulässig. Kein alter Adapterstand
wird als produktiver Ausgang akzeptiert. Ausführung verweigert ohne beide
expliziten Maintenance-/externe-Kopie-Flags. Quiet-/Health-/Unit-Isolationsprüfungen
vor Stop, unveränderte Konfigurationsbytes vor/nach, nur Coding-Agent stoppen/
starten. Bei Fehler neue Version erhalten, Startversuch, keine automatische
Rücknahme. Exakt bereits angewendet bedeutet reine Prüfung ohne zweiten Neustart.
Keine neue Modellanforderung; tatsächliche Streamingabnahme bleibt separat.

Sieben neue Aktivierungsregressionen mit echten isolierten Dateiersetzungen
und simuliertem Dienst bestanden: p4-stream-usage-activation-final Exit0(0,24s).
Prüfen Restorebelege, manipulierte Sicherung/Quelle, laufende Aufträge,
Attributerhalt, idempotente Wiederholung, Konfigurationswechsel und Forwardrepair
nach fehlgeschlagener neuer Health-Prüfung. Keine produktive Installation daraus
ableiten. Root-Passworteingabe bleibt ausschließlich im Benutzerterminal.

Vorbereiteter Aufruf im ruhenden Wartungsfenster (bereits genehmigter Adapter-
Reparaturumfang; keine neue Modell-/Konfigurations-/Dienstentscheidung):
`PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-coding-agent-stream-usage-activate.py apply --remote --maintenance-confirmed --external-copy-verified`


### 2026-11-03 – Tokenanzeige produktiv ausgeliefert, Acer-Rootschritt ausstehend

Eigener VSIX-Kandidat im bestehenden Prüfbaum:
netaigis-coding-chat-0.1.0-shared-runtime-token-summary-candidate.vsix,
SHA2568bc1ee286fce18efeff16a5aa4ea6255600046cae58706a6d8d19bd475edb754.
Bundle p4-turn-summary-vscode-bundle Exit0(2,94s), Paketierung
p4-token-summary-package Exit0(5,36s). ZIP-CRC/sichere Pfade/eigene Identität
0.1.0 und389Payload-Dateien gegen Build geprüft.
Isolierter echter Browser-/nativer Runtime-Pakettest
p4-token-summary-native-package Exit0(27,90s): Anmeldung/Reload/Wake/Logout,
Entwurfsisolation, fünf Viewportgrößen mit erreichbarem Input/Senden und
Kontrastprüfungen bestanden; keine Inferenz und kein physischer Handytest.

Danach ausschließlich Browserpayload produktiv atomar übernommen: sieben neue
Hash-Assets und eine HTML-Einstiegsdatei, alle389Payloads verifiziert.
Bestehender Sicherungsbaum R/browser-token-summary-assets-delta, ManifestSHA
07500ddd597f2ae1c20a2eaf75ee865f366b43731fdf9945dedfd7c3860a8e70;
Original-index tatsächlich mit Attributen wiederhergestellt geprüft.
Alte Assets bleiben erhalten. Keine Dienste oder VS Code neu gestartet;
beide eigenen Userdienst-PIDs/InvocationIDs sowie Launchkonfiguration identisch.
Keine Session-/Secretmigration, kein Acer-/Modell-/Endpoint-/Firewalleingriff.
Produktiver HTTPS-Nachtest p4-token-summary-productive-ui Exit0(3,92s):
Friseer-Anmeldung, gleicher Verlauf, ungesendeter Entwurf nach Reload, explizites
Leeren, sichtbarer Senden-Knopf/Kontrast bestätigt; kanonische Historie unverändert,
keine Schreibübernahme/Modellanforderung.

Root-Aufruf des Adapterhelfers cc6269c12 dem Benutzer bereits übermittelt.
Keine erneute Freigabefrage; es fehlt die privilegierte Terminalausführung und
deren tatsächlicher Nachweis. Unabhängige Browserarbeiten währenddessen erledigt.
Noch keine Behauptung korrigierter produktiver Tokenmessung.

Zusätzliche gezielte lesende Projektvertragsprüfung: Coding-Agent app.py
liest x-ai-user/x-ai-project für Learning-Kontext und Korrektur sowie
x-ai-conversation für die Kontextsession. Der Fork setzt derzeit nur
Benutzer/Sitzung; kanonische Recall-Projektzuordnung existiert bereits in
sessionMetadata.recallProjectId, mit Schutz gegen widersprüchliche Umzuordnung.
Kein globaler Projektwert und keine neue Speicherarchitektur eingeführt.
Die sichere Weitergabe genau dieser vorhandenen Bindung bleibt als konkrete
Integrationsaufgabe offen; kein produktiver Header- oder Routingwechsel erfolgt.


### 2026-11-03 – Streaming-Adapter produktiv angewendet, Einzelturndiagnose gesperrt

Benutzer führte cc6269c12 über Root-Terminal aus: ok:true, AdapterSHA
205b879bba773dae0184097fbddbcc01c941f080b89f2969cf41be1563d691eb,
Coding-Agent active/running,PID3269380,InvocationID53a86cd5c57044bfbc96f25a44bcea7d,
NRestarts0,Konfigurationsbytes unverändert. Anschließende eigene ausschließlich
lesende SSH-Prüfung bestätigt genau diesen Dateihash und Dienstzustand.
Keine erneute Installation/Sicherung oder Dienststeuerung.

Geplanter einmaliger tatsächlicher Streaming-Abnahmeturn mit neuem Marker
NETAIGIS_STREAM_USAGE_READY in bestehender technischer Testsitzung
1793603066247_pk2cs wurde vor Ausführung durch automatische Sicherheitsprüfung
abgelehnt. Begründung: dauerhafte Ergänzung der produktiven Sitzung und des
Recall-Archivs um Nutzernachricht/Antwort erfordere ausdrückliche Freigabe
dieser Sitzung und dieses Prompts. Keine Umgehung, kein Ersatzturn, kein
Modellaufruf ausgeführt. Gezielte Einzelfreigabe abgefragt.
Dadurch tatsächliche Inferenz-/Token-/Archivabnahme weiterhin offen;
installierter Patch und laufender Dienst sind unabhängig lesend bestätigt.
Nach ausdrücklicher Freigabe genau einmal senden, niemals bei Timeout
automatisch erneut senden; stattdessen entstandenen Zustand lesend prüfen.


### 2026-11-03 – Verständliche Geräte-Schreibrechte statt technischer Sitzungs-ID

Benutzer weist darauf hin, dass technische ID nicht zur Auswahl hilft und am
Handy keine writer role besteht. Gemeinte bestehende technische Testsitzung
heißt „Controlled functional check“. Keine neue Sitzung erzeugt. Lesender
Runtime-Nachweis: idle, gespeicherter Writer Friseer, Revision29. Prüfer hat
kein Schreibrecht übernommen und keinen Turn gesendet. Quellvertrag bindet
Writer an actorId+clientId+connectionId, nicht allein Benutzername; nach neuer
Browserverbindung ist Anmeldung nicht gleich bestätigtes Schreibrecht. Die
konkrete Ursache auf dem Handy ist ohne Ergebnis von Übernehmen noch offen.
Benutzer um einmaliges Übernehmen in benannter Sitzung und ggf. exakten
Fehlertext gebeten; noch keine Modellnachricht erneut senden.

Kleine UI-Korrektur SharedSessionAccess zeigt ausdrücklich
„Dieses Gerät: Lesend. Zum Schreiben Übernehmen wählen.“ bzw.
„Dieses Gerät: Schreibzugriff bestätigt.“ anhand des bestehenden serverseitigen
writerConfirmed. Keine Änderung an Autorisierung, Besitz, automatischen Claims
oder Prozesszuständen. Isolierter Browser-/nativer Runtime-Test ergänzt für
Lesen→Claim→bestätigt, Claim deaktiviert, Reload→lesend, erneuter Claim und
Freigabe→lesend, ausschließlich Fixture-Sitzung ohne Modell.

Web/types p4-device-writer-status-web Exit0(24,46s), Bundle Exit0(6,45s),
Paketierung Exit0(10,41s), tatsächlicher isolierter Pakettest
p4-device-writer-status-native-package Exit0(28,32s), einschließlich bisheriger
Auth-/Wake-/Draft-/fünf Viewport-Regressionen.
VSIX shared-runtime-writer-status-candidate SHA
c96e28b3d996ee89ae680c6d64b031ff17d14de71de768090f453aa192a0b27e,
396Payloads ZIP-/Build-/Identitätsgeprüft.

Produktiv ausschließlich sieben neue Browserhashassets + ein atomarer HTML-
Einstieg übernommen; alle396Payloads geprüft, alte Assets erhalten.
R/browser-writer-status-assets-delta ManifestSHA
f8ea664a7e249a0e94e9208c734b1c225d6417160a508bd3fc06ec832ac490b3,
Original-index tatsächlich attributgleich wiederhergestellt. Keine Dienste/
VS Code neu gestartet, PIDs/InvocationIDs und Launchkonfiguration gleich,
keine Sitzungs-/Secret-/Acer-/Modelländerung.
Tatsächlicher produktiver Lesestatus-/Reload-Nachtest separat protokolliert
unter p4-device-writer-status-productive-readonly; kein Claim/Modellturn.
Physische Handy-Bestätigung noch ausstehend. Automatische Sicherheitsfreigabe
für den früher geplanten zusätzlichen Token-Abnahmeturn weiterhin offen;
diese UI-Tests sind keine Umgehung und senden keine Modellnachrichten.


### 2026-11-03 – Mobile Platzersparnis und zugängliche Composer-Einstellungen

Benutzer bestätigt nach Übernehmen den tatsächlichen Schreibzugriff am Handy.
Damit ist diese Geräteübernahme bestätigt, kein Modellturn daraus ableiten.
Neue Meldung: Steuerung verbraucht zu viel Chatfläche; Composer-Einstellungen
öffnen, sind aber nicht bis unten scrollbar und nicht mehr schließbar.
Vorherige technische ID künftig durch sichtbaren Sitzungstitel ersetzen.

Ursache im vorhandenen Layout: volle mobile Sidebar-/Versionszeilen zusätzlich
zur Kopfzeile, mehrfach sichtbare Recall-/Writerdetails; ComposerSettings
ungegrenzt inline im Footer statt separatem Scrollbereich. Negativer Test
p4-mobile-settings-compact-red Exit1(19,87s) auf bisherigem extrahierten Paket:
Einstellungsdialog mit erreichbarer Schließfunktion fehlt. Dieser Test allein
macht keine Messbehauptung zu jedem ursprünglichen physischen Scrollversuch.

Korrektur ohne Autorisierungs-/Konfigurationsänderung:
- Mobile Navigation Home/Sessions als benannte Schaltflächen in bestehender
  Kopfzeile, volle Sidebar mobil ausgeblendet; Desktopnavigation bleibt.
- Kompakte Zeile zeigt Schreiben/Lesend und Übernehmen. Recall, Inhaber/Revision,
  Prüfen/Freigeben hinter standardmäßig geschlossenen Sitzungsdetails.
- Composer-Einstellungen als bestehender zugänglicher Dialog mit Titel,
  begrenzter dynamischer Viewporthöhe, eigenem scrollbarem Inhalt, festem
  Schließen-Knopf im Dialogkopf, Escape und registriertem Trigger. Keine
  Änderung von Provider/Modell/Auto-approve/Subagent-Einstellungen beim Öffnen.

Web-Typecheck/Build Exit0(32,35s), Bundle Exit0(8,01s), Paket Exit0(11,51s).
VSIX shared-runtime-compact-settings-candidate SHA
cb8d3e71c37e49ea304312bbdda2c7702b97bbaeba31aadb6a2bee599799594b,
404Payload-Dateien ZIP-/Identitäts-/Build-geprüft.
Isolierter nativer Pakettest p4-compact-settings-native-package erfolgreich:
Chat-Höhen bei390x844:584px,360x640:353px,390x430:170px,844x390:122px.
Vier Größen: Einstellungen tatsächlich öffnen, Scrollbereich bis Ende,
Schließen-Hittest im Viewport, Schließen sowie erneutes Öffnen/Escape positiv.
Bestehende fünf Input-/Senden-Geometrien, Schreibübernahme/Reload/Freigabe,
Auth/Wake/Entwurfs-/Kontrast-/Shutdownprüfungen ebenfalls positiv.
Keine Modellanforderung, keine produktiven Rechte oder Historien verändert.
Produktiver Browser-only-Rollout mit tatsächlicher Index-Restoreprüfung und
anschließendem rein lesendem HTTPS-Nachtest folgt. Physische Androidprüfung
dieser neuen Layoutänderung noch offen.


### Produktiver Nachweis der kompakten mobilen Einstellungen

Sourcecommit0d1688754, isolierter nativer Pakettest tatsächlich Exit0(33,46s).
Browser-only-Rollout erfolgreich: acht neue Assets und ein atomarer HTML-Einstieg,
alle404Payloads gegen Paket geprüft. Sicherung ausschließlich der betroffenen
vorherigen HTML-Einstiegsdatei mit tatsächlicher Attribut-Restoreprobe unter
R/browser-compact-settings-assets-delta, ManifestSHA
6f908f57812f2884ca647d05d037e1402c8d65634e10fbe21e9b298ad6ac0587.
Kein eigener Dienst/VS Code neu gestartet, PIDs/InvocationIDs und Launchbytes
gleich. Alte Hashassets erhalten; keine Sitzungs-/Secret-/Acer-/Modelländerung.

p4-compact-settings-productive-readonly Exit0(13,29s), tatsächliche laufende
HTTPS-Seite/Chromium, weiterhin kein physisches Android: vier Viewports
390x844→557px Verlauf,360x640→353px,390x430→143px,844x390→122px.
Abweichung zu Fixture-Höhen beruht auf tatsächlichem Sitzungsinhalt/-kopf;
keine Fixturezahl als produktive Messung ausgegeben. Einstellungen in allen
vier Größen geöffnet, Inhalt bis unten scrollbar, Schließen-Knopf im Viewport
per Hittest erreichbar und funktional, erneutes Öffnen/Escape funktioniert.
Anmeldung, ausgewählte Sitzung, Historie und ungesendeter Text nach Reload
behalten; bewusstes Leeren bleibt leer. Keine Werkzeug-/Modellanfrage und
keine Writer-Übernahme, kanonische Historie bytegleich. Originalbranch weiterhin
624c2cd6661e100680d8b61daa3a3447f4708536.

Benutzer kann nun am echten Handy nach Reload Platzangebot und Einstellungen
prüfen. Diese physische UI-Bestätigung bleibt separat offen; die bereits
bestätigte tatsächliche Handy-Schreibübernahme wird nicht erneut getestet.
Token-Abnahmeturn bleibt ohne gezielte Einzelfreigabe ungesendet.


### 2026-11-03 – Physische mobile UI-Abnahme und kanonische Projektweitergabe

Benutzer bestätigt zur kompakten Handyansicht und den scrollbar/schließbaren
Einstellungen ausdrücklich „ja, is gut so“. Diese physische UI-Abnahme ist
erledigt; nicht erneut anfordern. Keine Modellabnahme daraus ableiten.

Fortsetzung mit belegter Integrationslücke: bestehender Coding-Agent erwartet
x-ai-project für Learning-Kontext/Korrekturen und Kontextsession; Fork setzte
bisher nur Benutzer/Sitzung. Reparatur liest ausschließlich die vorhandene
kanonische Recall-Projektbindung (inklusive abgeschlossener Recall-Importquelle)
über readSessionRecallProject(session.sessionMetadata). Kein Prompt-/Modell-
Metadatenwert als Quelle, kein neuer Speicher, keine Workspaceheuristik.
Host scoped sie pro Turn samt Auth-Retry über getrennten AsyncLocalStorage-
Kontext; ungebundene Sitzung löscht geerbten Kontext ausdrücklich.

OpenAI-compatible Provider übermittelt exakt diese Bindung als X-AI-Project
nur auf bisherigem /v1/-Pfad/Port11436 und überschreibt dabei einen gegebenen
statischen Projektheader. Ohne kanonische Bindung bleibt explizite vorhandene
Providerkonfiguration unverändert; keine Kennung generiert. Andere Provider/
Ports/Pfade unverändert. Actor-/Conversationheader, Modell-/Routingentscheidungen
und API-Endpunkte bleiben gleich.

Konkrete Kompatibilitätsgrenze offen dokumentiert: bestehender Backendvertrag
liest Header literal. Nichtleere druckbare ASCII-IDs werden unverändert
übermittelt; nicht darstellbare IDs (z.B. CJK) scheitern ausdrücklich vor HTTP
statt stiller Umbenennung/Default. Die IDs bleiben im Recall-Store gültig;
kein neuer Zeichensatzfilter für Archivierung, keine Backenddateiänderung.
Unicode-Transport würde einen kompatiblen Backendvertrag benötigen.

Tatsächliche Prüfungen:
- p4-canonical-project-provider-wire-fixed Exit0(5,10s),13/13 über drei Dateien:
  parallele Projekte/Friseer-jimmi/Sitzungen/Modellwechsel, vorhandene Header,
  ungebundener Kontext, Abgrenzung anderer Routen und Header-Injektionsschutz.
  Erstlauf4/13 fehlgeschlagen wegen falscher Erwartung direkt geworfenen
  Fehlertyps: AI SDK meldet eigentlichen Providerfehler über onError und text
  scheitert mit No output generated. Prüfer korrigiert; HTTPstub bei ungültigen
  Werten nachweislich nie aufgerufen. Keine produktive Modellanforderung.
- Host-Einzelregression Exit0(15,18s), danach stärkere Paarzuordnungsprüfung
  und vorhandene Binding-/Importfälle zusammen:
  p4-canonical-project-final-host-and-bindings Exit0(29,97s),6bestanden,107
  bewusst abgewählt; nicht113bestandene Tests behaupten.
- Direkter LLMS-Build Exit0(19,02s), LLMS-types Exit0(38,02s), Corebuild
  Exit0(40,19s), Core-dev-types Exit0(65,05s), Pluginruntime Exit0(4,92s).
  Erster Paket-Buildaufruf war zwar Exit0(24,38s), rief aber unerwünscht
  Bashprofil auf und versuchte dort nicht erlaubte SSH-Umgebungsoperationen;
  danach ausschließlich direkte vorhandene Buildschritte ohne Profil.
  Nachfolgende Prozessprüfung fand keinen verbliebenen eigenen Build;
  keine produktiven Prozesse beendet.

ARCHITECTURE.md und DOC.md halten den bestehenden Zuständigkeits-/Wirevertrag
fest. Erweiterungskandidat wird jetzt gebündelt und isoliert geprüft.
Noch keine produktive Anwendung dieser Projektweitergabe; reale Learning-
Verhaltens-/Tokenabnahme bleibt offen. Einzelturndiagnose weiterhin durch
automatischen Review bis zur gezielten Freigabe gesperrt; keine Umgehung.


### 2026-11-03 – Benutzer-PNGs für die eigene Fork-Identität

Benutzer ergänzt laufenden Auftrag um Icons und nennt danach eindeutig
/home/friseer/MyDevelop/netaigis/. Ausschließlich die beiden dortigen PNGs
inhaltlich angesehen; benachbarte Dokumente nicht gelesen. Erste Dateisuche
war zu weit gefasst und listete auch PNG-Pfade fremder Projekte; Inhalte dieser
Dateien nicht geöffnet, Suche sofort auf benannten Ordner begrenzt und
Abweichung im Chat offengelegt. Kein fremdes Projekt verändert.

Originale unverändert, keine Bildbearbeitung oder Generierung:
- ChatGPT Image 27. Apr. 2026, 14_59_54_1024x1024.png,1024²,976062Bytes,
  SHAca60ff870d21495777c00e877373f3fdd7fa5bf2c51e975b4c392ed454d451b2.
- ChatGPT Image 27. Apr. 2026, 14_59_54.png,tatsächlich1254²,1756130Bytes,
  SHA40277566bb491da0f6cc22d8d056f7203f333e4de56bfaa404ba2728a77740d5.

Bytegleiche Kopien in vorhandenen eigenen Assetpfaden: bestehendes
assets/icons/netaigis-coding-chat.png ersetzt eigenes bisheriges Platzhaltericon;
zusätzlich assets/icons/netaigis-coding-chat-large.png. Paketicon, Activitybar
und Sidebar referenzieren PNG. Browserfavicon/Android-Touchicon verwenden
1024er-PNG; Browserkopf/Sidebar und bestehende VS-Code-Webview-Logo-Komponenten
verwenden große PNG. Farblogo wird nicht mehr im dunklen Thema invertiert.
Bestehende SVG-Ressourcen bleiben erhalten, keine neue Identitäts-/Versionswahl.

Browser-Webview/types Exit0(56,49s), VS-Code-Webview/types+Vite Exit0(144,14s),
Extensionbundle Exit0(8,71s), Paketierung Exit0(13,68s). Eigenes0.1.0-VSIX
shared-runtime-project-icons-candidate SHA
fe5ea3298da196e29d471d0b7571e93d77a92f5c7f6f4037dc3726b65793dacc,
415Payload-Dateien ZIP-/sichere-Pfade-/Identitäts-/Build-geprüft.
Enthält zusätzlich bereits getestete kanonische Projektweitergabe b9128773d.
Voriger Kandidat ohne neue Icons bestand nativen Pakettest in41,09s; nicht
produktiv angewendet, wird nicht als neuer Icon-Test ausgegeben. Aktueller
Pakettest prüft tatsächlichen PNG-HTTP-Inhalt, Dekodierung1254² und bestehende
Auth-/Mobile-/Writer-/Entwurfsregressionen isoliert ohne Modellanforderung.
Notwendige eigene aktuelle Datendifferenz wird im vorhandenen geschützten
Phase-2-Baum geprüft; keine Wiederholung abgeschlossener Phasen.


### 2026-11-03 – Anmelderennen vor Cookieabschluss reproduziert und behoben

Erster kombinierter Icon-Pakettest p4-user-icons-native-package Exit1(30,10s):
Anmeldung nach sofortigem Seitenwechsel wieder Verbinden statt Friseer.
Quelle: vscode.ts veröffentlichte shared_actor an UI sofort nach Hub-Ack,
während POST/actor-session für Set-Cookie asynchron noch lief. UI konnte damit
einen zur Navigation vermeintlich fertigen Login anzeigen, dessen Reloadticket
noch nicht committed war. Deterministischer verzögerter-Fetch-Regressionstest
p4-browser-auth-ticket-commit-red Exit1(0,89s) reproduziert exakt diese vorzeitige
Anzeige. PNG-Schadhaftigkeit oder verursachende Bildbytes nicht behauptet.

Korrektur veröffentlicht frischen, requestgebundenen Login erst nach Abschluss
der vorhandenen Cookieoperation. Duplikat-Acks teilen denselben einen POST,
alte Request-IDs/Generationen und geschlossene/ersetzte Sockets können keinen
späten Benutzerstatus setzen. Cookie-basierte Wiederverbindung bleibt direkt;
keine neue Secretablage, kein Rechtegrant, kein Timer verlängert. Vorhandene
Fehlermeldung bei gescheiterter Ticketspeicherung bleibt erhalten.

29/29 gezielte Auth-/Wake-/Cookie-/Entwurfs-/Sessionaccess-Tests positiv,
p4-browser-auth-ticket-commit-final Exit0(13,11s). Zusätzlicher geschlossener-
Socket-Nachweis führte zu abschließender Webneuerstellung Exit0(26,16s).
V2-Bundle Exit0(2,23s), Paketierung Exit0(6,12s).
V2-VSIX SHA76c4acdd9ff54efdf2aab9590a9b32c66078e98415c706b9b7d6f3de7f523887,
426Payloads geprüft.

Erster V2-Pakettest Exit1(27,67s) bestätigte bereits deterministisch verzögerte
Cookieoperation, Navigation/Auth und mobile Regressionen. Ausschließlich neu
hinzugefügte Bildbytes-Prüfung scheiterte: Playwrights separater Requestclient
verwendet den ausschließlich im Chromium konfigurierten Fixture-SPKI nicht.
Prüfer verwendet jetzt fetch im tatsächlich gepinnten Browser statt separates
TLS-Vertrauen zu lockern. Fehlerredaktion ergänzt für kurzlebige Testcookies;
alter negativer privater Beleg bleibt unverändert, darin enthaltenes Fixture-
Ticket mit beendetem isoliertem Dashboard ungültig; keine produktiven Schlüssel.

Abschließender tatsächlicher V2-Pakettest
p4-user-icons-authcommit-native-final Exit0(55,31s): zurückgehaltener POST
verhindert vorzeitiges Friseer, nach Freigabe Cookie/Navigation/Reload korrekt;
PNGdekodierung1254² und tatsächlich per Browser geladenen SHA der Originaldatei
verifiziert. Sämtliche betroffenen Mobile-/Writer-/Draft-/Auth-/Wake-/Shutdown-
fälle positiv, keine Modellanforderung. Prüfharness wird nicht im VSIX
ausgeliefert; Änderung daran erfordert kein erneutes identisches Paket.

Notwendige aktuelle eigene Datendifferenz unter R/shared-project-icons-delta
erfolgreich gesichert:10geänderte/neue Dateien,28unverändert geprüft
wiederverwendet. SQLite-Backup-API, vollständige tatsächliche Datei-/Attribut-
Wiederherstellung positiv, produktive Dateien/Dienste nicht verändert.
ArchivSHA6336e597dd7a5e59de57b319f13c79f9e14cc5f6528b04654e5437881c67aab3,
ManifestSHAc404064c79bb82a5d609b63eb2e3b5338bcd002b9294f77a944ea84b904d3eca.
Bestehendes vorheriges eigenes VSIX cb8d3e... bleibt für Rückfall unverändert.
Kombinierte Einführung erfolgt nur nach erneuten Quiesce-/Fingerprintguards
und betrifft ausschließlich eigene Erweiterung sowie zwei eigene Userdienste;
keine Acer-/Modell-/Endpoint-/Originalbranchänderung.


### 2026-11-03 – Kombinierte eigene Aktualisierung tatsächlich produktiv

Erster Einführungsversuch verweigerte VOR Diensteingriff/Installation, weil
Sicherungsfingerprint von session-search.db inzwischen abwich. Anschließender
vollständiger lesender Vergleich: ebenfalls sessions.db und kontrollierte
Sitzungsmanifestdatei geändert, Nachrichtenfile unverändert. JSON-Differenz
betrifft ausschließlich sharedSessionControl revision/lastChange/client-/
connectionId nach weiterer legitimer Schreibübergabe; status weiterhin idle.
Suchindex nur source_revision/indexed_at und abgeleitete FTS-Segmente.
Kein Fingerprintguard pauschal entfernt, keine Modellanforderung wiederholt.

Nur neue Differenz unter vorhandenem R/shared-project-icons-delta/
current-state-delta-v1 ergänzt: vier geänderte Dateien (einschließlich
operativem Hub-Event-DB),34verifizierte Dateien und Restorebelege wiederverwendet.
Nur vier neue Dateien tatsächlich wiederhergestellt und Attribute geprüft;
SQLite-Backup-API für geänderte Datenbanken. Ursprüngliche Sicherung/Belege
unverändert erhalten. Neues ArchivSHA
70e45384692a86f17aad02868d2737ec6619ee5e60e3d67cff7b4285463c8871,
ManifestSHA348dfbe28d352d8435a5637bd7a6cbeff2938940451e48fdfb518f1f60d55c4d.

Zweiter, auf exakt diese geprüfte Differenz gebundener Einführungsaufruf
erfolgreich. Vor Core-Stop tatsächliches owner HTTP-drain bestätigt, keine
anderen verbliebenen Clients/angenommene Arbeit; nur eigenes Dashboard und
eigene Runtime gestoppt/gestartet. Idle-Auftragsstatus und Historien nach Stop
unverändert. Eigene VSIX0.1.0 via Code-CLI installiert, alle426Payload-Dateien
gegen tatsächliches Paket SHA
76c4acdd9ff54efdf2aab9590a9b32c66078e98415c706b9b7d6f3de7f523887 verifiziert.
Andere registrierte Erweiterungen diesmal als vollständige Registryobjekte
verglichen und identisch. Launch-/Recall-Konfiguration und kanonische Daten
erhalten. Originalbranch weiterhin624c2cd6661e100680d8b61daa3a3447f4708536.
Keine Acer-/Modell-/Endpoint-/Produktiv-VS-Code-Prozessänderung.

Beide eigenen Dienste active/running,success,NRestarts0: CorePID204634,
DashboardPID204681. Tatsächliches HTTPS-health connected. Privater Beleg
R/shared-project-icons-delta/current-state-delta-v1/installation.json.
Vorheriges eigenes kompakte-Einstellungen-VSIX cb8d3e... und geprüfte aktuelle
Daten-Differenz bleiben für abgesicherten Rückfall erhalten; keine automatische
Rücknahme. Die notwendige Dashboardwartung beendet RAM-Anmeldetickets; Benutzer
kann sich einmal frisch als Friseer anmelden, normale Reload-/Wake-Fälle
sind davon getrennt geprüft.

Tatsächlicher Produktiv-Nachtest p4-project-icons-productive-readonly
Exit0(12,67s), kein physisches Handy und keine Inferenz: sichtbares PNG1254²
dekodiert, tatsächlicher Headerbild-SHA402775... und Favicon-SHAca60...
entsprechen den unveränderten Benutzeroriginalen. Login/Reload, ausgewählte
Sitzung/Historie/Entwurf, Schließen/Escape/Scrollen in vier Viewportgrößen
positiv; kanonische Nachrichten bytegleich, kein Claim/Modellturn.
Installiertes LLMS-Modul enthält tatsächlich neue Projekt-Scope-Exporte;
isolierter Scopewert korrekt, anschließend gelöscht. Dies ist keine echte
Learning-/Modell-Projektabnahme; keine Behauptung produktiver Tokenzählung.

Quellcommits b9128773d (Projektbindung),c10c00ee5 (Benutzer-PNGs),de2a49d72
(Anmelderennen) erhalten. Benutzer um noch offene Einzelfreigabe des genau
einen Token-Abnahmeturns gebeten, diesmal über sichtbaren Titelbeginn
„Controlled functional check“ statt opaker ID. Kein neuer Turn gesendet.
Weitere Originalaufgaben einschließlich produktiver VS-Code-Runtimebindung,
realem Learning-Verhalten, vollständiger Werkzeug-/Originalauftragsfortsetzung
und Gesamtabnahme bleiben offen. Keine erneute physische UI-Abnahme für bereits
bestätigte Layoutfunktionen verlangen; Icons kann Benutzer nach Reload sehen.


## 2026-11-03 – Tatsächlicher Benutzerturn und Streaming-Tokennachweis

Benutzer meldet „hab genau das gesendet“. Kein Modellaufruf durch diese
Prüfung und keine Wiederholung. Tatsächlich gespeichert ist der letzte
Benutzertext `NETAIGIS_ANDROID_USAGE_READY. Verwende keine Werkzeuge.`,
nicht der vorgeschlagene STREAM-Marker. Antwort exakt
`NETAIGIS_ANDROID_USAGE_READY.`; authentifizierter Urheber Friseer
(`hub-authenticated`). Tatsächliche Assistant-Metriken: 30.695 Eingabe-,
15 Ausgabetokens. Auch der vorangehende neue VPN-Turn meldet 30.656/15;
daraus keine zusätzlichen eigenen Modelltests ableiten.

Ausschließlich lesende Live-Prüfung über bestehenden Hub und Recall:
`p4-operator-actual-usage-readonly-network`, Exit 0, 1,47 s. Kanonische
Testsitzung 1793603066247_pk2cs enthält 21 Nachrichten; erste 15 mit
bestehendem Nachweis identisch. Zustand idle, Runtime resident.
TOTAL RECALL Projekt total-recall-production-test, Journal seq134,
Quelle verifiziert; sämtliche 21 Nachrichten und finale Metadaten stimmen
mit kanonischem Verlauf überein. Datei vor/nach Prüfung bytegleich.
Nachweis im bestehenden Prüfbaum:
`test-data/p4-operator-actual-usage-readonly-network/data/result.json`.
Erster Sandbox-Netzversuch Exit1 (Gt) erhalten; Netzfreigabe ermöglichte
dieselbe reine Leseprüfung. Keine Dienste/Modelle/Konfigurationen verändert.

Damit ist reale Tokenübermittlung für diesen tatsächlichen Benutzerturn
belegt. Keine rückwirkende Korrektur alter 0/0-Metriken behaupten.
Produktive VS-Code-Bindung, reales Learning-Verhalten und vollständige
Gesamtabnahme bleiben offen; keine erneute Geräte-/Layoutabnahme nötig.


## 2026-11-03 – Fehlende lokale Modellauswahl im Android-Browser

Benutzer meldet DeepSeek nicht auswählbar. Ausschließlich lesende Prüfung
des tatsächlichen produktiven HTTPS-Dashboards im isolierten mobilen
Chromium: Anbieter openai-compatible, Auswahl enthält ausschließlich
gpt-4o, obwohl providers.json ausdrücklich das laufende DeepSeek-Modell
konfiguriert. Kanonischer Verlauf blieb bytegleich. Kein Modellaufruf,
keine Schreibübernahme, kein Provider-/Endpunktwechsel. Prüfungen
p4-mobile-model-picker-probe und p4-mobile-model-catalog-probe erhalten.
Zweite Probe liest den Katalog erfolgreich; abschließendes innerText am
inerten Eltern-Dialog verursacht Timeout, daher kein vollständiger Pass.

Ursache: server/providers.ts verwendet nur getLocalProviderModels; der
gebündelte Katalog enthält das individuell konfigurierte Endpunktmodell
nicht. Chat.tsx verwirft daraufhin die nicht gelistete Auswahl zugunsten
des ersten Katalogeintrags. Neue Funktion includeConfiguredModel nimmt
das tatsächlich gespeicherte Modell zusätzlich auf, dedupliziert, erhält
bekannte Metadaten und erfindet keine Kontext-/Reasoning-Fähigkeiten.
Kein hart codiertes DeepSeek, kein globaler Standard, keine Änderung an
Acer, Modellkonfiguration oder Schnittstellen. Nebenbefund: verschachtelte
button-Elemente im ModelSelectorTrigger; durch bestehendes render-API
auf einen einzigen Button korrigiert.

Drei gezielte Regressionstests bestanden (p4-configured-model-catalog,
Exit0/1,62s); Hub-Typprüfung Exit0/44,28s; Browser-Typprüfung/Build
Exit0/58,37s. Runtime-Bundle erster Sandboxversuch esbuild service stopped,
mit IPC-Freigabe Exit0/0,30s. Isolierte native Auswahltests
p4-model-picker-native und p4-model-picker-native-catalog-diagnosis
belegen wiederholt die Übermittlung von endpoint-configured-model und
gpt-4o, scheitern aber am zu spezifischen Test-Trigger: die native
Testsitzung verwendet layout-model. Keine produktive Modellinferenz.
Locator korrigiert; tatsächliche Auswahlprüfung läuft. Produktive
Installation bis hier unverändert; Korrektur nicht als ausgeliefert melden.

Abschluss gezielter isolierter Auswahlprüfung: p4-model-picker-native-option-label
Exit0/18,20s. Reale gebündelte Runtime, HTTPS und mobiler Chromium,
konfiguriertes endpoint-configured-model im geöffneten Picker ausgewählt,
Picker geschlossen, tatsächlicher Trigger zeigt gewähltes Modell; kein
verschachtelter Button, keine Inferenz. Alle Testkinder Exit0 ohne Kill.
Zwischenversuche selection/stable-trigger erhalten: unterschiedliche
Startauswahl und Logo-Beschriftung machten exakte Namen-Locators falsch.
Finaler Locator verwendet tatsächlichen Trigger-Slot und Optionstext;
keine verlängerten Timer und kein ignorierter Testfehler. Physisches
Android und produktive Auslieferung dieser Korrektur noch nicht geprüft.


## 2026-11-03 – Modellauswahl ausdrücklich freigegeben und aktiviert

Benutzer: „dann mach un aktivier“. Neue eigene VSIX
`tmp/phase4-checks-20261030T193507+0100/netaigis-coding-chat-0.1.0-mobile-model-picker-candidate.vsix`
SHA256 3b966a0dfebf6508d0003abaa0ee31d5cd8dcdc9f21e03630a99ba00be03bc9a.
CRC, sichere Pfade, eigene Identität/0.1.0 und sämtliche 434 Paketdateien
gegen Build geprüft. Aus dieser tatsächlichen VSIX extrahierte Runtime:
p4-mobile-model-picker-native-vsix Exit0/19,50s, konfiguriertes Modell
ausgewählt, kein Modellaufruf, alle eigenen Testkinder sauber beendet.

Gezielte Sicherung im bestehenden geschützten Phase-2-Unterbaum
`productive-rollout/shared-runtime-repair-20261102/mobile-model-picker-delta`:
10 betroffene Dateien, davon nur 2 ersetzt und 8 neu. Bestehende
426-Payload-Installation zuvor gegen vorige VSIX geprüft. Archiv und
tatsächliche Wiederherstellungsprobe einschließlich Eigentümer, Modus,
mtime und xattrs vollständig geprüft. Keine neue Gesamtsicherung.
Manifest SHA256 75d1a84dedbfc819fe2009eb2bdd23b2637148c48d4f74db794edb8138deca53;
Archiv SHA256 61d439fa9982c8274dc7ab0e0b9eaf4c95b0092adf99bc9a5af8b64e095e4e63.
Vorige VSIX und alte Hash-Assets unverändert für Rückfall erhalten.

Aktivierung ausschließlich eigener Dashboard-Payloads im installierten
Extension-Verzeichnis. Kein Code-CLI-Neuinstallationslauf nötig; Registry
bytegleich. Bestehende Runtime per authentifiziertem Owner-HTTP-Drain
vor neuen Turns geschützt und idle bestätigt; ausschließlich
netaigis-coding-chat-dashboard.service gestoppt/gestartet. Core selbst
blieb mit identischem Prozess und Invocation unverändert aktiv. Drain
anschließend aufgehoben, idle bestätigt. Alle 434 installierten
Paketdateien stimmen mit neuer VSIX überein. Sämtliche erfassten
kanonischen Nachrichten und Settings/Secrets bytegleich. Keine Acer-,
Endpunkt-, Modellkonfigurationsänderung, kein Beenden produktiver VS Code.
Dashboard danach PID254069/Invocation2faff2df79e540099ae734d50e5aea45,
active/running, Resultsuccess,NRestarts0. Geschützter Beleg activation.json
im genannten Sicherungsunterordner.

Tatsächliche produktive HTTPS-Prüfung im isolierten mobilen Chromium:
p4-productive-mobile-model-picker Exit0/7,16s. Katalog enthält
deepseek-v4.1-flash-1017-iq2_xs und gpt-4o; DeepSeek ausgewählt, Picker
geschlossen, korrekte Anzeige, nach Reload weiterhin DeepSeek und
Friseer-Anmeldung. Keine verschachtelten Buttons, keine Nachricht,
Modellinferenz oder Schreibübernahme; kanonischer Verlauf bytegleich.
Das ist produktives Dashboard, aber kein neuer physischer Androidnachweis.
Benutzer soll Handyseite neu laden; nach dem absichtlichen Dienstneustart
kann einmalige neue persönliche Anmeldung erforderlich sein.
Originalbranch coding-agent-v4 bleibt624c2cd6661e100680d8b61daa3a3447f4708536.
Gesamtauftrag und bekannte andere Abnahmen bleiben offen.


## 2026-11-03 – Tatsächliche Geschwindigkeitsursachen lesend eingegrenzt

Benutzer priorisiert Modellgeschwindigkeit; keine neue Inferenz ausgelöst,
keine Dienste/Modelle/Kontexteinstellungen verändert. Vorhandene Backend-
Metriken auf Acer11442 und kanonische Zeitstempel abgeglichen. Letzter
Turn in Testsitzung:31.350 Eingabetokens,20 Ausgabetokens,107,070s
kanonische Dauer. Backend-Hauptanfrage dab4c5146ab4:74,2s, erster
Engine-Token nach72,05s, prompt_ms72039,7, decode_ms2163,4,9,2tok/s,
reused0. Unmittelbar davor zwei Anfragen cad36e88dc8c20,2s/1333in102out
und85b66513045a12,5s/1188in13out. Summe106,9s erklärt kanonischen
107,070s-Turn nahezu vollständig.

Tatsächlicher Codepfad /opt/netaigis-coding-agent/app.py128–198:
wartet vor eigentlicher Modellanfrage synchron auf Learning-Korrektur
und danach Learning-Kontext. /opt/ai-agent/app.py:detect_correction
1386/1483 und select_relevant_rules1219/1329 rufen jeweils ollama_chat
624 auf. Somit zwei zusätzliche Modellklassifikationen vor der Antwort,
nicht bloß langsame Browserdarstellung. Keine Lernfunktion abgeschaltet.

Früherer tatsächlicher Warm-Turn82bf74744358:30.695prompt,30.670reused,
15output,3,3s Backend,2,029s erster Token,12,1tok/s Decode. Kanonischer
Turn35,637s einschließlich der vorgeschalteten19,4+12,7s-Prüfungen.
Großer Unterschied liegt daher in Vorverarbeitung und Cachetreffern;
Ursache des jeweiligen Cachemiss ist noch NICHT bewiesen. Weder
Learning-Aufrufe allein noch Änderung dynamischer Regeln pauschal als
Cachezerstörer behaupten: Warm-Turn hatte dieselben Klassifikationsschritte.

Health200 Coding/Router/Modell, Modell geladen,max_context1000000,
idle/queue0, alle vier bisherigen Service-InvocationIDs unverändert,
NRestarts0. Leerlaufprobe:MemAvailable10.920.320KiB; Swapbelegung
2.297.520KiB, aber aktuelle vmstat-si/so0 und memory-PSIavg10=0.
GPU15361/16303MiB belegt. Kein Beleg für aktuellen Swapthrash oder
Hardwareunfähigkeit; keine1M-Promptmessung. Modell-Engine zeigt KVfp4,
kv_resident1000000,expert_slots543,cpu_experts14817,ram_experts0,
draftingoff. Daraus allein keine ungeprüfte Tuningänderung ableiten.

Gefilterter privater Nachweis im bestehenden Prüfbaum:
logs/p4-model-speed-readonly-findings.json. Weitere Reparatur muss
Learning/Originalauftrag/Projekt- und Autorenisolation erhalten und
Cachemiss-Ursache gezielt unterscheiden. Keine Produktionsfreigabe
für neue Learning-/Modelländerungen aus bloßer Diagnose ableiten.


### 2026-11-03 – Benutzerhypothese Engine/125B und fehlende Modellauswahl

Lesender tatsächlicher Cgroup-/proc-Nachweis ai-deepseek.service:
Controller2084241, Strata-Serve-Python2086806, Engine2086812 mit exe
`/home/friseer/ai-staging/deepseek-v4.1-flash-1017-iq2_xs/prepared-engine-0.1.54/engine-dsv41/0.1.54-linux-x86_64-cuda-cuda13/strata-dsv41`.
Damit Strata, kein Nachweis einer llama.cpp-Ausführung. Ursprüngliche
DeepSeek-Datei und aktive effective.json: gleiche Engine und sämtliche
args identisch, ausgenommen --max-context32768→1000000. Ursprünglich
--experts6 bereits vorhanden; kein durch Reparatur entfernten
Speculative-Schalter behaupten. Originaldatei SHA256
6280e8607baf4d5e9b6c2474619e7da9c3c370432d36a9bd41d3db03a8b65e1e.

Altes tatsächlich vorhandenes Qwen-Strata-Profil
.config/strata/profiles/launch-iq3_xxs-32k.json referenziert
.local/state/strata/launch/iq3_xxs-32k.json: component:strata-engine,
expert-cacheauto,prefillauto,spec4,spec-min-p0.5,MTPStrata-data/mtp/rt,
max-context32768,kvint8,pool-workers15. Aktuelle DeepSeek-Engine
meldet draftingoff und KVfp4. Unterschiedliche Architektur/Beschleunigung
bestätigt; kein Beleg, dass Qwen-spezifische Flags für DeepSeek gültig
sind oder dass1M allein die gemessene Verzögerung verursacht.

Modellkataloge:11436/v1/models liefert aktives DeepSeek UND alten
qwen3.8-flash-next-iq3_xxs-Namen;11441/v1/models,11441/api/tags und
11442/v1/models liefern ausschließlich DeepSeek. Unter /opt/models
weiterhin Qwen-GGUFs und alte Strata-Profile32/64/128/256/512k vorhanden.
Bloße Alt-Dateien/Katalognamen belegen keine sichere Modellumschaltung.
Zusätzlich Ollama11434/api/tags: qwen3.5:35b mit Sicherungsalias,
qwen3-coder:30b,qwen3-vl:4b und Embedding vorhanden. Separates135B
bisher nicht nachgewiesen; Benutzer um Zuordnung zu früheremQwen125
oder qwen3.5:35b gebeten, keine neue Modellentscheidung verlangt.

Eigene lokale providers.json: ollama ist auf muse-spark-open eingestellt
und hat keine explizite baseUrl; openai-compatible auf tatsächliches
DeepSeek am unveränderten Acer11436/v1. Kein nachgewiesener gemeinsamer
Katalog aller installierten Acer-Modelle im Browser; letzte Korrektur
ergänzt gespeichertes Endpunktmodell, implementiert keinen universellen
Modellwechsel. Diese Restlücke ausdrücklich erhalten. Alte Router-
strata_launch-Qwen-Werte existieren noch neben aktivem runtime_profile;
aus Altwerten nicht ableiten, dass tatsächlich Qwen läuft. Kein
Modellstart/-wechsel, keine Konfigurations- oder Dienständerung.


## 2026-11-03 – Strata-Startnachweis und vorbereitete Präfix-Cache-Reparatur

Benutzer bestätigt125B,135B war Tippfehler; keine Zuordnung zu35B
mehr erfragen. Benutzer bestätigt produktive Handy-DeepSeek-Auswahl
„also, geht“; bisherige physical-pending-Notiz hierfür überholt.

Tatsächliches vorhandenes DeepSeek-Startlog bestätigt schon im
ursprünglichen32k-Start --dsparkauto und --dspark-conf0.65. Native
Engine lädt DSpark nicht:149GB geroutete Experten gegenüber15GB GPU;
Verifikation laut Engine3,3facher Datenzugriff, kein erwarteter Gewinn.
Das trat bereits bei32k auf, nicht erst1M. Kein verlorener Schalter.
Ältere Strata-Oberfläche0.1.53 kennt in drafting.engine_info nur
--mtp/--draftdflash2; deshalb ist deren draftingoff allein kein
ausreichender Nachweis für native DSpark-Entscheidungen. Aktueller
Befund durch native Startmeldungen, nicht bloß UI, bestätigt.
Installierte0.1.54-dsv41-Engine --help Exit0, ohne Modellargumente:
unterstützt --dsparkauto/on/off, --prefill-chunk, --expert-profile,
--mmap-experts und weitere eigene Flags; Qwen --spec4 nicht blind
übertragen. Kein Speicher-/Kontext-/Modellparameter geändert.

Conversation-cache-Metrik:enabledfalse,keinBudget/Slots,57Anfragen,
14mitReuse; das schließt einfachen aktuellen Präfix-Reuse nicht aus.
Kein unterstützter nativer conversation-cache-Schalter in dieser
DeepSeek-Hilfe belegt. Keine erfundene Cache-Aktivierung. Altes
qwen125_dynamic.py nutzt tatsächlich llama-server, ist derzeit aber
nicht aktiv, kein11439/11438/11440Listener; dessen Start wäre somit
keine Rückkehr zum vorhandenen Strata-Profil. Alte Qwen-Strata-
Profile separat erhalten. Sichere125B-Umschaltung noch offen.

Konkreter Cache-Kandidat im vorhandenen Coding-Gateway:
wechselnden Lern-Systemkontext hinter die führenden stabilen
system/developer-Anweisungen, weiterhin vor die Gesprächshistorie
einfügen. Keine Löschung/Komprimierung, kein Weglassen von Regeln,
kein Abschalten von Learning/Focus/Recall, keine Änderung der
Modellendpunkte oder Routingwahl. Fokusadapter bleibt unverändert
danach aufgerufen. Behebt vermeidbare Änderung des stabilen Präfixes;
physischer Token-Cachetreffer/Leistungsgewinn erst produktiv messbar.
Originalapp SHAca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201;
Kandidat SHAa85a9065358c55ae90bc85faac58d7dfd99daccebce51436178f417f7a513a0a.
Nur exakt gepinnter Einfügeblock ändert sich, übriger Quelltext
bytegleich. Public Rewriter sdk/scripts/netaigis-coding-agent-prefix-cache.py;
privater Quell-/Kandidatenabzug ausschließlich im bestehenden Prüfbaum.

Gezielte5Regressionen bestanden p4-coding-stable-prefix-regression
Exit0/0,14s. Fünf zusätzliche Fälle im existierenden Acer-Python mit
echtem FastAPI/HTTPX, tatsächlicherproxy-Funktion und tatsächlichem
Adapter bestanden: Altfehler/variableKontexte/keinLernkontext,
Autoren-/Projekt-/Sessionzuordnung, System-/Focus-/Toolpaare und
Multimodalpayload erhalten, native Antwort/Tokenvertrag korrekt.
Alle HTTP-Aufrufe über MockTransport abgefangen; keine Modellinferenz,
Lernspeicher- oder produktiven Dateischreibvorgänge. Beleg
logs/p4-coding-prefix-cache-actual-route.log.

Bestehender Sicherungshelfer um --coding-prefix-cache-delta ergänzt:
nur /opt/netaigis-coding-agent/app.py in aktuellem gepinntem Stand,
unter vorhandenem Acer-Phase2-Baum phase4-coding-prefix-cache-delta,
echte GNU-tar-Wiederherstellung mit Attributen und geschützterExport.
16/16Tests Exit0/0,73s; erster Testlauf vergaß neue Namens-Allowlist
und verweigerte sicher, korrigiert und Beleg erhalten. Keine andere
Sicherung wiederholt. Produktiver Root-Sicherungslauf/externe Kopie
und tatsächliche Inferenzabnahme fehlen; Kandidat NICHT installiert.
Vorläufiger terminalseitiger Sicherungsaufruf:
`PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-model-context-preflight.py --remote --coding-prefix-cache-delta`
Keine neue Produktivfreigabe aus diesem reinen Sicherungsaufruf
ableiten. Produktive Aktivierung erst nach geprüfter Sicherung und
konkretem abgegrenztem Anwendungsschritt.


### 2026-11-03 – Ein-Datei-Sicherung extern geprüft, Anwendung vorbereitet

Benutzer lieferte erfolgreichen Root-Nachweis für
phase4-coding-prefix-cache-delta: genau1Datei, echteWiederherstellung
mitOwner/Mode/mtime/xattrs, keineQuell-/Dienständerung. Archiv
971e317aa9bdbf39d539c58a4abe24d5513941ea20c119a7aa0285102e358c40,
Manifest e562454d23f0761239177f1932af3015cce3aefc52551331c44eba07e51d115b,
SHA256SUMS311047764f78e68594ba05bc32fec503f0da16911778562d07da8efb44118e42.
Gesamter gezielter Export eigenständig auf Acer aufgeschützten
Verzeichnismodus/Owner, reguläreDateien und alle dreiPins geprüft.
Geschützte externe Kopie im bestehenden lokalen Phase2-Baum unter
phase4-coding-prefix-cache-delta erstellt, Quellcode geparst und
tatsächlich ausArchiv wiederhergestellt. Bytes/Modus/mtime lokal
verifiziert; ursprünglicher Root-Owner und securityxattrs durch
Acer-Root-Restore belegt, nicht als unprivilegierte lokalechownProbe
ausgegeben. external-verification.json erhält dieseUnterscheidung.
Keine bisherigenSicherungen wiederholt/überschrieben.

Neuer schmaler Helfer
sdk/scripts/netaigis-coding-agent-prefix-cache-activate.py verwendet
den bereits getesteten vorhandenen Transaktions-/Dateiattributcode
des Adapterhelfers und den exakt gepinnten neuen Rewriter.
Defaultinspect; apply verlangt maintenance-confirmed und
external-copy-verified. Nurapp.py, ausschließlich Stop/Start
netaigis-coding-agent.service; Zustände von ai-agent,Router,DeepSeek
vor/nachgleich. Kein Modellaufruf, Konfigurationswechsel, Modellneustart
oder automatischeRücknahme. Busy/abweichendeQuelle/Backup/Restore
verweigertvorMutationen, exakterWiederholungsaufruf prüftohneNeustart.
NeunAktivierungstests p4-coding-prefix-activation Exit0/0,31s, inklusive
gebündelterRemoteAssets und nachgewiesenerSchutzdienständerung.
Kandidat nochNICHT produktiv angewendet.

Konkreter optionalerAnwendungsschritt ausschließlich nach gesonderter
Freigabe und bei ruhendenKI-Aufträgen überbestehendenRoot-Terminalweg:
`PYTHONDONTWRITEBYTECODE=1 python3 /home/friseer/MyGIT/cline-4.1.26-repair/sdk/scripts/netaigis-coding-agent-prefix-cache-activate.py apply --remote --maintenance-confirmed --external-copy-verified`
Die bisherigeRoot-Antwort genehmigte lediglichSicherung; neueapp.py-
Änderung war nichtvonfrühererAdapterdatei-Freigabe erfasst. Danach
realeGeschwindigkeits-/Cacheabnahme notwendig, bishernurQuell-/
HTTP-Vertragsprüfungen. Sichere125B-Strata-Umschaltung separat offen.


### 2026-11-03 – Aktivierung sicher verweigert, Eigentümerprüfung korrigiert

Benutzer hat begrenzte Anwendung ausdrücklich genehmigt und ausgeführt;
Helfer verweigertmitfile_owner_type_or_protection_changed. Lesender
Vergleich bestätigtunverändert originalca981707..., app.pyUID/GID460:460,
Modus0644, keinSymlink, ParentRoot0755. Coding-,Learning-,Router- und
Modell-InvocationIDs identisch zuvorher. KeinStop/Schreibvorgang erreicht.
Ursacheerneut strengeRoot-Eigentümerannahme im wiederverwendeten
maintenance.regular(), die beiRoot-Prozess auchuser-ownedModule ablehnt.
Diese bekannteBesonderheit hättevorab berücksichtigt werdenmüssen.

GezielteKorrektur nur im neuenPrefix-Aktivierungshelfer: Root/private
Sicherungsenvelopes weiterstrikt; vertrauenswürdigerEigentümer ausexakt
gepinntemRootManifest nurfürkonkreteQuelldatei, derenRestore und
exklusivenatomarenTemporärpfad zugelassen. VollständigeManifest-
Attributprüfung bleibtimvorhandenenTransaktionscode. Prozesslokale
Maintenance-Instanz angepasst, gemeinsamergespeicherterHelfer und
produktiveDateiberechtigungen unverändert. AnderePfade bleibenRoot-
geschützt; tatsächlicherOwnerwechsel/Symlink weiterhinrefused.
ElfTests p4-coding-prefix-activation-owner-fix Exit0/0,42s, einschließlich
ReproduktionalterRoot-Verweigerung, echterDateiersetzung, Ablehnung
einesvomManifestabweichendenOwners und unverwandterPfade.
Sicherung/Restore/Export unverändertweiterverwendbar; nichtwiederholen.
Anwendungweiterhinfreigegeben, Umfangunverändert. Nurerneuterbereits
freigegebenerRoot-Aufrufnötig; keineerneuteFreigabefrage.
