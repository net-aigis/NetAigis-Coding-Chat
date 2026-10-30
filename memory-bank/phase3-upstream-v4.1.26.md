# Phase 3 — kontrollierte Integration von Upstream v4.1.26

Datum: 30.10.2026. Fortsetzung auf dem abgeschlossenen Stand von Phase 1 und
Phase 2; keine erneute Bestandsaufnahme oder Sicherung. Die Integration ist
abgeschlossen. Die produktive Abnahme steht aus; Phase 4 wurde nicht begonnen.

## Referenzen und Herkunft

- Eigener Fork: `https://git.wittmer.software/AIGIS/cline.git` (`origin`).
- Originalbranch: `coding-agent-v4`, weiterhin
  `624c2cd6661e100680d8b61daa3a3447f4708536`.
- Reparatur-Worktree: `/home/friseer/MyGIT/cline-4.1.26-repair`.
- Reparaturbranch: `repair/cline-v4.1.26-phase2-20261030`.
- Die übernommenen lokalen Arbeiten wurden vor der Integration im Commit
  `abdf9c2372db3530598b81fbdf3a95d0e209fe16` festgehalten. Seine 16 Dateien
  enthalten die acht lokalen Änderungen, die neuen produktiven Quelldateien,
  Auftragsunterlagen und den Phase-2-Bericht. Zwölf historische `.bak`-,
  `.pre`- und `tmp_*`-Artefakte bleiben unversioniert und bytegleich erhalten.
- Upstream: `https://github.com/cline/cline.git`, Push-URL `DISABLED`.
- Der gezielt abgefragte offizielle Tag `v4.1.26` verweist auf
  `a459f1d04dea030833b558be645011ab739c463b`. Der SHA wurde mit `git ls-remote`
  am offiziellen Remote verglichen und der einzelne Tag ohne automatisches
  Tag-Fetch, Pull oder Autostash geholt. Es ist ein leichtgewichtiger Tag;
  eine kryptografische Tag-Signatur wird nicht behauptet.
- Gegenüber `v4.1.25`: 80 Commits, 485 Pfade, 71.508 hinzugefügte und
  50.043 entfernte Zeilen. Ausgewertet wurde der vollständige lokale Git-Diff.
- Der Integrationscommit hat den Erhaltungscommit und den verifizierten
  Upstream-Commit als Eltern. Die eigenen Commits `b7407bbc2`, `7bb745ccd`
  und `624c2cd66` bleiben Vorfahren. Kein Rebase und keine Ersetzung der
  eigenen Geschichte.

## Übernommene Änderungen und bewusste Abweichungen

Wesentliche Upstream-Änderungen betreffen Wiederaufnahme und Zuständigkeit
laufender Sitzungen bei mehreren Clients oder Verbindungsabbruch
(`dffb93e7f`), API-gerechte Schätzung erneuter Kontextkomprimierung
(`43a976d93`), Wiederholung eines abgebrochenen reinen Reasoning-Streams
(`5e8549537`), Plugin-Kommandos im aktiven Runtime-Kontext (`9cb041025`),
Checkpoint-Diffs mit einem Git-Prozess (`d35ad45e4`) und lokale
Laufzeitdiagnosen (`590785eff`). Hinzu kommen VS-Code-Korrekturen für den
ersten Prompt, Plan/Act-Umschaltung und offene Fragen. Vorhandene
Cloud-Funktionen im Upstream werden durch diese Integration nicht aktiviert;
der VS-Code-Host erstellt weiterhin `backendMode: "local"`.

Es gab einen Git-Konflikt in `session-runtime-orchestrator.ts`. Unsere
Verweigerung wiederholter Werkzeugaufrufe vor der Ausführung wurde mit dem
neuen Upstream-Wartepunkt für ausstehende Fehlerentscheidungen verbunden.
Zuerst wird eine laufende Entscheidung abgewartet, dann der vorhandene
`beforeTool`-Hook ausgeführt und dessen effektive Eingabe auf Wiederholung
geprüft. Eine Stop-Entscheidung bleibt für den übrigen Lauf wirksam. Ein
frischer Lauf setzt die Zähler zurück. Die übrigen Überschneidungen mit
Eigenentwicklungen wurden im tatsächlichen Diff geprüft, insbesondere
Sitzungsmetadaten, `X-AI-Conversation`, Proto-Erweiterungen und eigene Tests.

Bewusst nicht übernommen wurden die vier generierten Modell-/Provider-
Kataloge und die neue Upstream-CODEOWNERS-Regel. In `builtins.ts` bleiben
zusätzlich die bisherige opencode-go-Konfiguration ohne neuen Basis-URL und
der bisherige zai-coding-plan-Standard `glm-5.2` erhalten. Der neue Gemini-
Suchparameter-Fix bleibt übernommen. Der Vergleich aller 234 vorhandenen
Provider-Manifeste ergibt **null Unterschiede bei Standardmodell und API-
Konfiguration**. Eine Test-Fixture sichert diesen Ausgangsstand ab; sie ist
keine neue produktive Routing-Tabelle. Künftiges Neugenerieren der Kataloge
benötigt erneut eine bewusste Prüfung dieser Vorgabe.

`fork-provenance.json` trennt eigenes Repository, bestehende Geschichte und
Upstream-Basis. Die finale Fork-Releaseversion bleibt ausdrücklich offen.
Extension-ID, Publisher, Anzeigename und Secret-/Datenpfade werden hier
nicht migriert. Eigene Tags, Release-Identität und mögliche Umbenennung sind
weiter separat abzustimmen; der frühere Vorschlag `netaigis.coding-agent`
ist keine Freigabe. Keine VSIX wurde veröffentlicht oder installiert.

## Belegte Integrationskorrekturen

- Ein nicht konfiguriertes `sessionId` darf gültige Hook-Metadaten nicht
  mit `undefined` überschreiben. Eine konfigurierte ID wird weiterhin bis
  zum vorhandenen Conversation-Header transportiert.
- Unser Schleifenschutz bleibt vor der Werkzeugausführung und ergänzt die
  Upstream-Stop-Entscheidung. Vier neue Tests verwenden die echte
  AgentRuntime mit skriptgesteuertem Modell und wirklichem, lokalem
  Probe-Werkzeug: maximal zwei Ausführungen bei Schwelle drei, Neustart
  des Zählers, explizit deaktivierter Schutz und veränderte Hook-Eingaben.
- Ältere Hook-Tests zählten bei Schwelle drei nur zwei Aufrufe, erwarteten
  einen Abort ohne aktiven Lauf oder suchten zwei getrennte Hinweise in
  einer Nachricht. Diese Erwartungen wurden berichtigt. Der neue
  Upstream-Test erhält einen vollständigen Werkzeugkontext. Nach der
  asynchronen Stop-Entscheidung wird deren Fehlergrund geprüft.
- Terminal-Testdoubles liefern bei normalem Erfolg Exitcode 0 und merken
  sich explizite Abschlussdetails. Die beiden Tests für unbekannten
  Abschluss übergeben weiterhin ausdrücklich leere Details und müssen
  weiterhin fehlschlagen. Der produktive Guard bleibt erhalten; eine
  direkte Nullprüfung des Exitcodes behebt seine TypeScript-Narrowing-
  Unverträglichkeit ohne Änderung des Fehlerverhaltens.
- Der vorhandene Header-Wire-Test verwendet jetzt Vitest, korrektes SSE
  und eine überprüfte Antwort `OK`; verschluckte Stream-Fehler gelten
  nicht mehr als Erfolg. Parallele Sitzungen behalten getrennte Header.
- Drei neue TOTAL-RECALL-Vertragstests prüfen den bestehenden Event-
  Endpunkt mit expliziter Testkonfiguration, stabile Event-ID und
  ursprüngliche Urheberschaft beim Wiederholen sowie den Verzicht auf
  erfundene Sitzungs-IDs. Sie verwenden ausschließlich gemocktes Fetch.

## Tatsächlich ausgeführte Prüfungen

Die begrenzte Baseline ergab vor der Integration 81/84 erfolgreiche
Orchestrator-Tests und 42/48 Terminal-Tests; der alte Header-Test lief
durch, prüfte aber noch keinen fehlerfrei dekodierten Stream. Diese
Ergebnisse bleiben als Baseline erhalten und wurden nicht neu gestartet.

Nach Benutzerfreigabe wurden Entwicklungsabhängigkeiten ausschließlich im
Reparatur-Worktree mit `bun install --frozen-lockfile --ignore-scripts`
und privatem Cache ergänzt. Keine Lifecycle-Skripte und keine produktive
Installation. Tatsächlich verwendet: Bun 1.4.4, Node 26.7.0; die
Repository-Empfehlung für Bun lautet 1.4.2. AI SDK ist nun 7.0.136 und
provider-utils 5.0.58.

SDK-Builds für shared, llms, agents, core, sdk und ui waren erfolgreich.
Anschließend waren auch `bun run build:sdk` einschließlich Plugin-Runtime
und das lokale Extension-Bundle mit `node esbuild.mjs` erfolgreich.
Die VS-Code-Typprüfung einschließlich Proto-Generierung,
Kompatibilitätskonfiguration und Webview ist erfolgreich. Die Typprüfungen
für agents, llms sowie core/dev und core/smoke sind ebenfalls erfolgreich.
Vorherige Fehlversuche und deren Diagnose bleiben in den Protokollen.

Die folgende Tabelle konsolidiert jeweils den letzten ausgeführten Stand
pro Testdatei; Wiederholungen werden nicht als zusätzliche Tests gezählt.

| Begrenzter Prüfbereich | Bestanden | Fehlgeschlagen |
| --- | ---: | ---: |
| AgentRuntime | 152 | 0 |
| Provider, Routing und Conversation-Wire | 81 | 0 |
| SessionRuntime und eigener Integrationstest | 93 | 0 |
| Kontext, Komprimierung, Safety, lokaler Host, Hub und Shell | 263 | 1 |
| VS-Code-Terminal, Lebenszyklus, History, Komprimierung und Recall-Vertrag | 157 | 0 |
| Upstream-Laufzeitbeobachtungen | 32 | 0 |
| **Gesamt** | **778** | **1** |

Der offene Test heißt `public shell error boundary preserves signal
termination and captured output across the public tool boundary` in
`sdk/packages/core/src/extensions/tools/shell-contract.test.ts`. Erwartet
wird `[Command terminated by signal SIGTERM]\npartial output`, tatsächlich
kommt nur die Signal-Meldung zurück. Ein gezielter Diagnoseaufruf hat den
Fehler bestätigt. Test und Shell-Executor wurden vom Integrationsmerge
nicht verändert; eine vor dem Update ausgeführte Baseline dieses Tests
wird nicht behauptet. Er wurde weder übersprungen noch schöngerechnet.

Die Prüfungen nutzten begrenzte Laufzeiten und eigene CLINE-Daten-/DB-/
Session-Verzeichnisse außerhalb produktiver Daten. Keine CLI-/Doctor-
Aufrufe, die einen Hub-Daemon automatisch starten. Bun-Workspace-Skripte
versuchten das Benutzer-Shellprofil zu laden; dortige SSH-Agent-Schreib-
und Berechtigungsaktionen wurden durch die Sandbox abgewiesen. Die
späteren fokussierten Tests und Typdiagnosen wurden direkt mit Node
gestartet. Die Profilwarnungen sind in den Logs sichtbar und werden
nicht als Anwendungsergebnis gewertet.

## Nachweise und Schutz des bisherigen Stands

Geschütztes Prüfverzeichnis außerhalb Git:
`/home/friseer/MyContainer/cline-phase3-checks-20261030T183655+0100`.

Dort liegen in `logs/` echte Testausgaben und Vitest-JSON, in `metadata/`
die vollständigen Befehle, Arbeitsverzeichnisse, Exitcodes, Dauern,
Baseline-Ergebnisse, Tag-Prüfung, Konflikt-/Integrationsentscheidungen,
Provider-Vergleich und konsolidierte Testergebnisse. Vollständige
Upstream- und Integrations-Diffs sowie abschließende Commit-Referenzen
liegen ebenfalls dort. `SHA256SUMS.phase3` enthält die abschließend
geprüften Prüfsummen der Nachweise. Keine Zugangsdaten wurden in Git
oder diesen Bericht übernommen.

Der abschließende Erhaltungscheck vergleicht die acht geänderten und
19 unversionierten Originaldateien mit dem vorhandenen Phase-2-Manifest:
alle SHA256 identisch, Originalbranch und Original-HEAD unverändert.
Die zwölf historischen Arbeitsartefakte im Reparatur-Worktree wurden
ebenfalls mit der bereits geprüften Wiederherstellung verglichen.
Die vorhandenen Phase-2-Sicherungen wurden nicht neu erstellt.
Originalarbeitsverzeichnis, installierte Erweiterung und produktive
Dienste wurden durch diese Phase nicht verändert oder neu gestartet.

## Offene Aufgaben nach Phase 3

1. Phase 4: Den belegten Verlust von Teilausgabe bei Signalabbruch
   beheben. Unbekannten Terminalabschluss, tatsächlichen Prozesszustand,
   Detach/Abbruch und Wiederaufnahme auf dem realen VS-Code-Host prüfen;
   der bestehende unbekannte Abschluss wird noch mit synthetischem
   Exitcode 1 gemeldet. Schleifenschutz über Wiederaufnahme und echte
   parallele Werkzeugaufrufe weiter absichern.
2. TOTAL RECALL ist erhalten, aber nicht fertig verdrahtet:
   `VscodeSessionHost` ruft Outbox-Funktionen ohne Konfiguration auf;
   diese bleiben damit inaktiv. Der Konfigurationsmanager wird nicht
   initialisiert, das Event-Mapping berücksichtigt noch nicht
   `payload.sessionId`, und der Browser lädt bisher einen Snapshot,
   ohne daraus eine fortsetzbare Runtime herzustellen. UI-Nachrichten,
   unterstützte Server-Routen, Locking und Urheberschaft sind gegen
   die echte getrennte API abzugleichen. Netzwerkzugriff und bestehende
   Secrets müssen dabei die Repository-Speicher-/Proxyregeln beachten,
   ohne vorhandene Zugänge unerreichbar zu machen.
3. Eigenständiger Coding-Agent und Learning-Agent, lokales 125B-Modell,
   Routing, vollständige gegenseitige Sitzungsübernahme Friseer/jimmi,
   dauerhafte Originalaufträge und dynamische Kontextverwaltung bleiben
   verbindlich. Die hier verwendeten Modelle und API-Antworten sind
   Testdoubles; sie belegen keinen produktiven Modell- oder Acer-Test.
4. **Korrektur des Benutzers:** Der unabhängige Watchdog ist ein separater
   Acer-Infrastrukturdienst außerhalb Cline, getrennt von Coding-Agent
   und Learning-Agent. Cline erhält nur nötige Fehlerkorrekturen,
   verlässliche Werkzeugzustände und Schnittstellen für externe
   Beobachtung. Keine zusätzliche KI-Überwachungsarchitektur in Cline.
5. Android muss dieselbe laufende Sitzung ohne VNC, Gebühren oder fremden
   KI-Dienst erreichen. Die Upstream-Mehrclient-Korrekturen und ihre
   lokalen Tests sind keine Android-Abnahme.
6. Phase 5: vollständige Regression einschließlich Dateisicherheit und
   realer Komponenten. Phase 6: eigene produktionsreife VSIX,
   Installations-/Sitzungssicherung, geprüfter Rückfall und produktive
   Installation auf 440G5suse erst nach belegter Abnahme. Danach echte
   Funktion mit lokalem Modell, Coding-Agent, Learning-Agent und TOTAL
   RECALL nachweisen. Ein erfolgreicher Build beendet den Gesamtauftrag
   nicht. Die noch offene Fehlerprüfung erlaubt derzeit keine Abnahme.

Phase 4 beginnt erst nach der Meldung dieses tatsächlichen Phase-3-Stands.
