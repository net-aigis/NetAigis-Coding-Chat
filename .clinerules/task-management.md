# Cline Task Management Rules

## 📋 Ziel
Systematische Auftragsverwaltung mit chronologischer Dokumentation, Fortschrittsverfolgung und Nachweisführung.

## 🏗️ Struktur

### `.clinerules/task-management.md` (Dokumentations-Regeln)
Diese Datei definiert die Regeln für die Auftragsverwaltung.

### `memory-bank/` (Dokumentation)
- **auftraege.md** - Ursprüngliche Aufträge mit Urheberschaft & Chronologie
- **fortschritt.md** - Status: Erledigt, Offen, In Arbeit
- **nachweise.md** - Tests, Builds, Commits mit Beweisen

## 🔄 Arbeitsablauf

### Vor jeder neuen Arbeit:
1. ✅ **Lies aktuellen Auftragsstand** aus `memory-bank/fortschritt.md`
2. 📋 **Prüfe auftraege.md** für Kontext und Chronologie
3. 🔍 **Validiere Nachweise** aus `nachweise.md`

### Bei Fortschritt:
- ⚡ **Sofort aktualisieren** in `fortschritt.md` (Erledigt, Offen, In Arbeit)
- 📝 **Belege dokumentieren** in `nachweise.md`
- 🏷️ **Aufträge unverändert lassen** (keine Umarbeitung ursprünglicher Aufträge)

### Vor Abschluss:
- 🧾 **Alle Nachweise prüfen** und validieren
- ✅ **Status final aktualisieren** in `fortschritt.md`
- 📜 **Chronologie vervollständigen** in `auftraege.md`

## 🚫 WICHTIGE REGELN

### Kein Duplizieren:
- ❌ Erledigte Aufgaben **nicht erneut beginnen** (nur weil neue Sitzung gestartet)
- ❌ Bestehende Dateien **nicht überschreiben** (falls vorhanden)
- ✅ Nur neue Arbeit, nicht bereits Erledigtes

### Urheberschaft wahren:
- 📝 Jeder Auftrag mit **Ursprung & Chronologie** dokumentieren
- 🏷️ Keine Änderungen an ursprünglichen Aufträgen vornehmen
- 🔄 Fortschritt getrennt verwalten (Erledigt | Offen | In Arbeit)

## 🎯 TOTAL RECALL Integration
Diese Verwaltung ist für spätere Integration in zentrale TOTAL-RECALL-Architektur vorgesehen, ohne dortige Ereignishistorie zu ersetzen.

---
**Letzte Aktualisierung:** 27. Okt 2026
**Status:** Aktive Entwicklung