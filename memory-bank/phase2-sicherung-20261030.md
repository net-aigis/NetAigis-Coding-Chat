# Phase 2: Sicherung und separater Reparatur-Worktree

Stand: 2026-10-30T18:22:28.408090+01:00.

Phase 1 vom 30.10.2026, 17:19 Uhr ist abgeschlossen. Die vorhandenen Eigenentwicklungen wurden erhalten. Phase 3 wurde nicht begonnen; das Update auf v4.1.26 ist noch nicht integriert.

## Referenzen und Arbeitsstand

- Ursprüngliches Repository: `/home/friseer/MyGIT/cline-4.1.25`.
- Ursprünglicher Entwicklungsbranch: `coding-agent-v4`, unverändert.
- Gesicherter und übernommener HEAD: `624c2cd6661e100680d8b61daa3a3447f4708536`.
- Separater Worktree: `/home/friseer/MyGIT/cline-4.1.26-repair`.
- Reparaturbranch: `repair/cline-v4.1.26-phase2-20261030`.
- Alle acht geänderten und 19 unversionierten Dateien wurden aus der geprüften Wiederherstellungsprobe übernommen; Datei-SHA256, staged/unstaged Binary-Diffs und Git-Status wurden verglichen.
- Eigene Commits `b7407bbc2`, `7bb745ccd` und `624c2cd66` sind weiterhin Vorfahren von HEAD.
- Dieser zusätzliche Bericht ist die einzige neue Projektdatei der Phase 2. Bestehende Auftrags- und Nachweisdateien wurden nicht umgeschrieben.

## Geprüfte Sicherungen

Geschützter Sicherungsort außerhalb des Git-Repositories:
`/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100`.

Dort liegen vollständige Repository-Archive, Git-Bundles, Roh- und konsistente Home-Daten, SQLite-Snapshots, Manifeste und tatsächliche Wiederherstellungsproben. `SHA256SUMS.local` dokumentiert die geprüften lokalen Sicherungen. Der Abschlussbericht und die abschließenden Prüflisten liegen ebenfalls dort.

Produktives TOTAL RECALL wurde separat vom Betreiber auf Acer mit Root-Rechten gesichert. Die vorhandene Sicherung einschließlich `service-addendum-v1` wurde geschützt hierher übernommen, per SHA256 verglichen und tatsächlich wiederhergestellt. Die sechs effektiven Dienstdateien sind enthalten. Geheimnisse stehen ausschließlich im geschützten Sicherungsbereich, nicht in diesem Bericht oder Git.

Die SQLite-Erstellung wurde nicht erneut ausgeführt. `BACKUP_EVIDENCE.json` ist ein nachträglicher Betreibernachweis aus ursprünglichem Befehl und Benutzer-Konsolenausgabe; kein zeitgleich erzeugtes Root-Protokoll. Quelle, Methode und Snapshot-SHA stimmen zusammen. Dateiintegrität und Wiederherstellung wurden unabhängig geprüft.

Zwei aktive Logdateien änderten sich während der Home-Erfassung. Die archivierten Bytes wurden als exakte Quellpräfixe geprüft. Der LevelDB-Bestand wurde zusätzlich stabil erfasst und seine WAL-CRC32C geprüft. 18 lokale SQLite-Snapshots wurden über Integrität und logische Datenvergleiche wiederhergestellt. Originale SELinux-Labels liegen im Roharchiv und in den Prüfsummenmanifesten; die unprivilegierte Probe konnte diese Sicherheitslabels nicht anwenden. Quelldateien wurden nicht umgelabelt.

## Verbindliche Fortsetzung

Keine erneute Bestandsaufnahme oder Wiederholung bereits erfolgreich geprüfter Sicherungsarbeiten ohne konkreten neuen Anlass. Frühere Behauptungen in den Dokumenten vom 27. Oktober sind historische Einträge und ersetzen keine aktuelle Funktionsprüfung.

Der Fork bleibt eigenständig: `origin` ist `https://git.wittmer.software/AIGIS/cline.git`; `upstream` ist externe Cline-Codequelle mit deaktiviertem Push. Keine automatischen Pulls, Resets, Force-Pushes oder ungeprüften Merges. Upstream-Versionen ersetzen weder die eigene Geschichte noch eigene Entwicklungen.

Coding-Agent bleibt projektunabhängig. Verbindlich bleiben lokales Modell, eigenständiger Learning-Agent, Modellrouting, gemeinsames TOTAL RECALL für Friseer und jimmi, gegenseitige Sitzungsübernahme mit Urheberschaft, dauerhafte Originalaufträge, nachprüfbare Wiederaufnahme, unabhängiger Watchdog, dynamische Kontextverwaltung, VS-Code-Integration und Android-Zugriff auf dieselbe laufende Sitzung ohne VNC, Gebühren oder fremden KI-Dienst.

Alle vorhandenen API-Endpunkte und Routingentscheidungen bleiben ohne ausdrückliche Freigabe unverändert. Endgültige Extension-Identität, Umbenennung, eigene Release-Tags und produktive Installation benötigen die gesonderte Freigabe nach Kompatibilitätsanalyse. Die vorgeschlagene Identität `netaigis.coding-agent` ist nicht abschließend freigegeben. Upstream-Basis und eigene Fork-Version müssen getrennt nachvollziehbar bleiben; Daten und Zugangsspeicher dürfen durch eine Umbenennung nicht unerreichbar werden.

Die vollständigen fortgeltenden Vorgaben stehen zusätzlich unter `/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/AUFTRAG-UND-GRENZEN.md`.
