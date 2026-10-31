# Verbindlicher Auftrag: eigenständiger Fork und sichere Identitätsmigration

Stand 31.10.2026. Dieser Auftrag wurde zwischen Phase 2 und Phase 3 erteilt
und ist **nicht abgeschlossen**. Die Upstream-Integration ersetzt ihn nicht.
Die Benutzerkorrektur vom 31.10.2026 bestätigt ihn ausdrücklich erneut.

## Festgelegte Eigentümerschaft

- Produkt und Entwicklung: eigener, dauerhaft gepflegter Coding-Agent-Fork.
- Repository/origin: `https://git.wittmer.software/AIGIS/cline.git`.
- Entwicklungsbranch: `coding-agent-v4`; Reparaturen nur im vorhandenen Worktree.
- Cline-Upstream: ausschließlich externe Codequelle mit deaktiviertem Push.
- Projektunabhängigkeit: NetAigisOS ist ein bearbeitetes Projekt, keine feste
  technische Bindung des Agenten.
- Modellrouting, Coding-Agent, Learning-Agent, TOTAL RECALL und bestehende
  Sitzungen bleiben erhalten. Keine Abhängigkeit von einem Cline-Cloud-Konto.

## Tatsächlicher Quellstand und noch offene Entscheidung

`apps/vscode/package.json` trägt derzeit `publisher: saoudrizwan`,
`name: claude-dev`, `displayName: Cline`, `version: 4.1.26`.
`apps/vscode/src/registry.ts` bildet daraus `saoudrizwan.claude-dev`, den
Command-Präfix `cline` und `claude-dev.SidebarProvider`.
Damit ist die geforderte eigene Extension-Identität noch nicht umgesetzt.
Die Repository-Metadaten werden auf das eigene Forgejo berichtigt; das ist
keine Freigabe einer Umbenennung oder produktiven Installation.

Der bisherige Vorschlag `netaigis.coding-agent` / `NetAigis Coding Agent`
bleibt ein Vorschlag. `coding-agent` ist projektneutral. Der Zusatz `NetAigis`
kann als Produkt-/Organisationmarke verstanden werden, muss aber gegen die
vom Benutzer verlangte sichtbare Projektunabhängigkeit entschieden werden.
Es wird weder eine alternative Marke noch eine endgültige ID eigenmächtig gewählt.

## Auswirkungen einer ID-Änderung: belegte Daten- und Schnittstellenabhängigkeiten

| Bereich | Tatsächliche Implementierung | Konsequenz für die Migration |
|---|---|---|
| Moderne Einstellungen/Secrets | `shared/storage/storage-context.ts`: vorhandene gemeinsame Dateiablage unter `~/.cline/data`; `StateManager` | ID-Wechsel allein darf weder neue leere Ablage wählen noch bestehende Provider-/Recall-Werte überschreiben. |
| Native Alt-Secrets und Mementos | `hosts/vscode/vscode-to-file-migration.ts`; wird vor StateManager initialisiert | Eine neue Extension erhält nicht automatisch den SecretStorage der alten ID. Ein vorab geprüfter Export aus der alten Identität ist erforderlich; Altwerte bleiben für Rückfall erhalten. |
| Legacy-Sitzungen | `SdkController.ts` übergibt `context.globalStorageUri.fsPath` als `legacyExtensionStorageDir` an die History-Komponente | Ein Wechsel der ID ändert diesen VS-Code-Pfad. Die bisherige Migration erwähnt ausdrücklich noch nicht vollständig übernommene Task-Daten. Ein neuer Name ohne Migration kann alte Sitzungen unsichtbar machen. |
| Moderne Runtime-Sitzungen | SDK-Sitzungsspeicher und kanonische Nachrichten unter der bestehenden konfigurierten Cline-Datenablage | IDs, Urheberschaft, Originalaufträge, Komprimierungs-Sidecars und Werkzeugzustände müssen identisch wieder lesbar bleiben. Kein Kopieren als zweiter unabhängiger Chat. |
| Checkpoints | Alte Extension-Storage-Pfade sowie SDK-Checkpoint-Metadaten und Git-Referenzen | Pfad-/Referenzzuordnung und tatsächlicher Restore sind vor Freigabe nachzuweisen; ein erfolgreiches Nachrichten-Importieren beweist keinen Datei-Restore. |
| TOTAL RECALL | Geschützte Konfiguration, bestehende Outbox und `conversation_id` aus der Host-Session-ID | Weder Projekt-/Akteurwerte noch IDs/Outbox-Zielbindung ändern. Die neue Extension darf keine Ereignisse umetikettieren oder neue IDs für die alte Sitzung erfinden. |
| Commands/Views/URI-Aufrufe | `registry.ts`, `package.json`, `extension.ts`; zusätzlich bislang fest benannte Recall-Commands | Manifest und Registrierungen gemeinsam migrieren. URI-Callbacks, Ansichten und vorhandene Verknüpfungen prüfen; keine bloße Änderung zweier Paketfelder. |
| Parallelinstallation | Gemeinsame Dateispeicher trotz unterschiedlicher Extension-IDs | Side-by-side bedeutet nicht isolierte Schreibzugriffe. Alte und neue aktive Extension dürfen nicht unkoordiniert denselben Verlauf/Secret-Store verändern. |
| Releases/VSIX | Vorhandene Upstream-Paket- und Publish-Skripte | Keine Upstream-Publish-/Nightly-Automation für eigene Releases ausführen. Publisher, Artefaktname, Versionsschema und Zielrepository erst ausdrücklich entscheiden. |

## Versionierung getrennt halten

Upstream-Basis dieses Arbeitsstands: `v4.1.26`, laut abgeschlossenem Phase-3-
Nachweis Commit `a459f1d04dea030833b558be645011ab739c463b`.
Das ist die Basisversion, **keine freigegebene eigene Fork-Release-Version**.
Die eigenen Änderungen bleiben anhand der eigenen Git-Historie nachvollziehbar.
Die derzeitige Paketversion 4.1.26 ist noch keine abgeschlossene Fork-Versionierung.
Ein eigenes Versionsschema, eigene Tags, Releases und VSIX-Namen stehen aus;
es wurden dafür keine neuen Versionen oder Tags festgelegt.

## Konkrete Folgearbeit vor jeder produktiven Identitätsänderung

1. Endgültige projektunabhängige Produktidentität und eigenes Versionsschema
   anhand dieser Analyse vom Benutzer gesondert freigeben lassen.
2. Im Reparatur-Worktree eine wiederholbare Migration aus einem isolierten
   Fixture der alten Identität implementieren: kein Überschreiben vorhandener
   neuer Werte, keine Löschung alter Werte, keine Geheimnisse in Git/Logs.
3. Einstellungen, native und file-backed Secrets, historische und aktive
   Sitzungen, Checkpoints, Outbox und Recall-IDs tatsächlich wiederherstellen.
4. Wiederholte Migration, Abbruch/Fehler, Parallelstart und Rückfall auf die alte
   Extension prüfen; keine schreibende Doppelinstanz zulassen.
5. Erst nach vollständiger Abnahme eigene VSIX/Release und die beauftragte
   produktive Installation mit überprüftem Rückfall durchführen (Phase 6).

Diese Liste ist ein verbindlicher offener Arbeitsstand, keine behauptete
Migrationsprüfung oder bereits erteilte Namens-/Installationsfreigabe.

## Umgesetzter Schutz vom 31.10.2026

Die vorhandene Paketdatei enthält nun getrennte `fork.upstream`-Metadaten
(Basisversion und Commit) sowie `fork.release: null`. Das Null-Feld bedeutet
ausdrücklich, dass keine eigene Release-Version oder endgültige Identität
gewählt/freigegeben wurde. Die Repository-URL zeigt auf das eigene Forgejo.

Der bestehende VSIX-Prepublish-Einstieg führt zuerst
`scripts/verify-fork-release.mjs` aus. Er verweigert fehlende Freigabemetadaten,
den Original-Publisher/Paket-/Anzeigenamen, Abweichungen zwischen Paket und
freigegebenem Release sowie Upstream-Publishing-Metadaten. Reguläre Build-
und Reparaturtests bleiben möglich. `release.approved` ist kein automatisch
erzeugter Freigabenachweis: es darf erst entsprechend der gesonderten
Benutzerentscheidung gesetzt werden. Es wurden keine Tags oder VSIX erzeugt.

Belegt: neun direkte Node-Tests bestanden (`p4-fork-release-policy-direct`).
Der tatsächliche CLI-Aufruf verweigert den aktuellen ausstehenden Release
erwartungsgemäß mit Exit 1 (`p4-fork-pending-release-gate`). Ein erster
Node-Worker-Lauf meldete nur die Testdatei als einen Test; für die neun
Einzelfälle gilt ausschließlich der direkte, tatsächlich ausgewiesene Lauf.
Die praktische Datenmigration ist weiterhin offen; die Schutzprüfung
behauptet keinen Restore und ersetzt keine Abnahme.
