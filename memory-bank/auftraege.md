# 📋 ORIGINAL AUFTRÄGE

## Chronologie & Urheberschaft

Diese Datei dokumentiert alle ursprünglichen Aufträge mit Urheberschaft und zeitlicher Reihenfolge.

---

## 🗓️ 26. Okt 2026 - INITIALISIERUNG

### Auftrag #1: Workspace Struktur aufbauen
**Urheber:** System-Initialisierung  
**Status:** ✅ ERLEDIGT  
**Zeit:** 2026-10-26

**Inhalt:**
- Cline VS Code Extension workspace erstellen
- Basisstruktur etablieren: `.clinerules/`, `memory-bank/`
- TypeScript/Node.js Konfiguration prüfen

**Beweis:** Workspace existiert bei `/home/friseer/MyGIT/cline-4.1.25/`

---

## 🗓️ 27. Okt 2026 - TOTAL RECALL INTEGRATION

### Auftrag #2: TOTAL RECALL Session-Browser integrieren
**Urheber:** Cline-System (automatisch aus Kontext)  
**Status:** ⚠️ TEILWEISE ERLEDIGT  
**Zeit:** 2026-10-27 08:xx

**Inhalt:**
- TOTAL RECALL Session Discovery in VS Code Command Palette integrieren
- Webview-basierte UI für Session-Browser implementieren
- Commands registrieren: `Cline: List TOTAL RECALL Sessions`, `Cline: Quick Pick TOTAL RECALL Sessions`

**Erledigt:**
- ✅ `recall-session-commands.ts` erstellt (8.920 Bytes)
- ✅ Extension.ts modifiziert (Import + Registration auf Zeile 151)
- ✅ TypeScript Compilation erfolgreich (0 Fehler)
- ✅ `RecallSessionViewProvider` Klasse implementiert

**Offen:**
- ⚠️ Webview HTML/JS Rendering: `_getHtmlForWebview()` Methode existiert, aber Inhalt unklar
- ⚠️ SDK-Methoden `TotalRecallSessionHost.initialize()` und `listConversations()` Existenz unklar
- ⚠️ Keiner der Buttons getestet (kein Live-Test)
- ⚠️ Konfiguration in VS Code SecretStorage fehlt

**Nachweis:** Dateien existieren, Compilation erfolgreich

---

## 🗓️ 27. Okt 2026 - AUFTRAGSVERWALTUNG

### Auftrag #3: Task Management System erstellen
**Urheber:** Manuelle Anforderung  
**Status:** ✅ ERLEDIGT  
**Zeit:** 2026-10-27 19:xx

**Inhalt:**
- `.clinerules/task-management.md` (Regeln & Workflow)
- `memory-bank/auftraege.md` (Ursprüngliche Aufträge mit Chronologie)
- `memory-bank/fortschritt.md` (Statusverwaltung)
- `memory-bank/nachweise.md` (Beweise, Tests, Builds)

**Erledigt:**
- ✅ `.clinerules/task-management.md` erstellt (1086 Bytes)
- ✅ `memory-bank/` Ordner erstellt
- ✅ Diese Datei (`auftraege.md`) erstellt

---

## 🎯 WICHTIGE REGELN FÜR DIESE DATEI

1. **Keine Umarbeitung:** Ursprüngliche Aufträge bleiben unverändert (nur hinzufügen)
2. **Urheberschaft wahren:** Jeder Eintrag mit Urheber & Zeit dokumentieren
3. **Chronologie führen:** Zeitliche Reihenfolge respektieren
4. **Getrennt verwalten:** Fortschritt in `fortschritt.md`, Nachweise in `nachweise.md`

---

## 📊 ZUSAMMENFASSUNG

**Insgesamt 3 Aufträge dokumentiert:**
- #1: Workspace (✅ Erledigt)
- #2: TOTAL RECALL Integration (⚠️ Teilweise erledigt)
- #3: Task Management System (✅ Erledigt)

**Letzte Änderung:** 27. Okt 2026 19:xx


---

## 30.10.2026 — verbindliche Fortsetzung des ursprünglichen Auftrags

Urheber: Benutzer. Dokumentiert durch Codex am 2026-10-30T19:29:14+01:00.

Phase 1 und Phase 2 bleiben abgeschlossen; Phase 3 integriert Upstream
v4.1.26 kontrolliert in den eigenen Forgejo-Fork. Der Entwicklungsbranch
`coding-agent-v4` und seine Geschichte bleiben erhalten. Änderungen und
Entwicklungsabhängigkeiten sind ausschließlich im Reparatur-Worktree erlaubt.

Die finale Zielklarstellung verlangt eine produktive Installation unseres
eigenen reparierten Forks auf 440G5suse nach belegter Abnahme, mit überprüftem
Rückfall und anschließenden echten Tests am lokalen 125B-Modell, Coding-Agent,
Learning-Agent und TOTAL RECALL. Ein Build oder eine VSIX allein beendet
den Auftrag nicht. Fehlerbehebung, vollständige Regression und Installation
bleiben den Phasen 4, 5 und 6 zugeordnet.

Die spätere unabhängige Überwachung ist laut ausdrücklicher Korrektur des
Benutzers ein getrennter Acer-Infrastrukturdienst außerhalb Cline und getrennt
von Coding-Agent und Learning-Agent. Keine KI-Überwachungsarchitektur in Cline.
Verbindlich bleiben Android auf derselben laufenden Sitzung ohne VNC, Gebühren
oder fremden KI-Dienst, Friseer/jimmi mit erhaltener Urheberschaft, dauerhafte
Originalaufträge, Sitzungsübernahme, dynamischer Kontext und unverändertes
Modellrouting/API-Endpunkte. Finale Extension-Identität und eigene Release-Tags
sind nicht eigenmächtig festzulegen.

Vollständiger Phase-3-Stand: [phase3-upstream-v4.1.26.md](phase3-upstream-v4.1.26.md).
Frühere Einträge bleiben unverändert als historische Aufträge erhalten.


## Phase 4 — Benutzerauftrag vom 30.10.2026, erfasst 2026-10-30T19:47:50+01:00

Phase 4 ist freigegeben: Priorität 1 Terminal/Signal/Timeout/Exitcodes/Ausgabe/Schleifenschutz; danach Priorität 2 Kontext, Originalauftrag und Sitzungsfortsetzung; Priorität 3 vorhandenes TOTAL RECALL mit Retry-Outbox, Browser, echter Wiederherstellung, Friseer/jimmi und Schreibzuständigkeit; Priorität 4 Schnittstellen der getrennten Acer-Dienste; Priorität 5 Android auf derselben laufenden Sitzung. Gezielte Regression nach jeder Korrektur und eigenständige Commits. Keine Wiederholung der Phasen 1–3, kein Eingriff in Originalbranch, Installation oder produktive Dienste. Watchdog separat außerhalb Cline. Vollständige fortgeltende Grenzen und Nachweise: [phase4-reparatur.md](phase4-reparatur.md).


## Phase 4 — weitere verbindliche Benutzerkorrekturen vom 30.10.2026

Die beobachteten 3–4 Sekunden betreffen `sleep 30`, `40`, `45`, `60` und
`90`. Für alle Laufzeiten tatsächlichen Start, Werkzeugrückgabe, Ende,
Prozessstatus und bestätigten Exitcode erfassen; einen Folgeaufruf auf
Prozessabbruch prüfen. Beobachtungsfrist und Prozessende trennen. Ohne
Bestätigung weder Completed noch künstlicher Exitcode, weder Wiederverwendung
noch automatische Zerstörung des möglicherweise aktiven Terminals. Beide
3000-ms-Pfade prüfen; den benutzten Pfad anhand echter Protokolle belegen.
Background-Exec darf nicht durch ein zweites kurzes Zeitbudget abgeschnitten
werden. Kein bloßes Verlängern des 3-Sekunden-Timers. Commit `1c5db6c56` erhalten.

Zusatzauftrag Ablageprüfung: alle relevanten und versteckten Verzeichnisse
unter `/home/friseer`, Git-Zustände, Sicherungsmanifeste und belegbare
KI-Entstehungsprotokolle lesen. Keine Herkunft aus Namen/Zeitstempeln erfinden.
Vier Klassen mit Nachweisen und vorgeschlagenem Ziel direkt im Chat ausgeben;
Grenzen und fehlende Berechtigungen nennen. Keine Bereinigung oder neuen
Sicherungsordner. Prüfung im zugänglichen Bereich durchgeführt und Ergebnisse
zuerst im Chat ausgegeben; keine Bereinigung vorgenommen oder freigegeben.
Phase 4 und sämtliche bisherigen Arbeiten bleiben erhalten.


## Verbindliche Fortsetzung vom 31.10.2026

Benutzer: Ein vorhandener Session-Hub/Übergabedienst ist nicht nachgewiesen; kein bestätigter Endpunkt oder Konfigurationspfad liegt vor. Port 11436 bleibt Coding-Agent und wird nicht zum Session-Hub umgedeutet. Gemeinsame laufende Sitzung VS Code/Android im eigenen Fork noch implementieren und Ende-zu-Ende prüfen. Bestehende Sitzungen, Recall, Coding-/Learning-Agent und Modellzugänge erhalten. Die fehlende Bestätigung eines vorhandenen Hubs ersetzt die noch ausstehende Implementierung nicht. Keine fremden Projekte untersuchen und keine willkürlichen Ablageorte anlegen.

Die zuvor zwischen Phase 2 und 3 beauftragte eigene Fork-Identität ist weiterhin offen und darf nicht aus dem Arbeitsstand verschwinden. Die bisherige endgültige Benennung ist nicht freigegeben. Belegte Prüfung und verbindliche Folgearbeit: [fork-identitaet.md](fork-identitaet.md).
