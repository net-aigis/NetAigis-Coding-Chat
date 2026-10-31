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

## Tatsächlicher Quellstand und freigegebene Zielidentität

`apps/vscode/package.json` trägt derzeit `publisher: saoudrizwan`,
`name: claude-dev`, `displayName: Cline`, `version: 4.1.26`.
`apps/vscode/src/registry.ts` bildet daraus `saoudrizwan.claude-dev`, den
Command-Präfix `cline` und `claude-dev.SidebarProvider`.
Damit ist die geforderte eigene Extension-Identität noch nicht umgesetzt.
Die Repository-Metadaten werden auf das eigene Forgejo berichtigt; das ist
keine Freigabe einer Umbenennung oder produktiven Installation.

Der frühere Vorschlag `netaigis.coding-agent` / `NetAigis Coding Agent` wurde
durch die unten dokumentierte Benutzerentscheidung ersetzt: Ziel ist
`netaigis.netaigis-coding-chat`, Anzeigename **NetAigis Coding Chat**. Die praktische
Umstellung und Migration sind noch offen; es fehlt keine Namensfreigabe mehr.

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
Freigegeben sind eigenes SemVer und die Startversion `0.1.0`; `1.0.0` folgt
erst nach produktiver Abnahme. Die praktische Paket-/Release-Umstellung,
eigene Tags und VSIX-Artefakte stehen aus; es wurden noch keine Tags erzeugt.

## Konkrete Folgearbeit vor jeder produktiven Identitätsänderung

1. Erledigt am 31.10.2026: Produktidentität und eigenes Versionsschema
   ausdrücklich freigegeben; Zielwerte siehe verbindliche Namensentscheidung.
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
Migrationsprüfung oder bereits durchgeführte produktive Installation.

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


## Verbindliche Namensentscheidung vom 31.10.2026

Der Benutzer hat ausdrücklich freigegeben:

- displayName: **NetAigis Coding Chat**
- publisher: `netaigis`
- name: `netaigis-coding-chat`
- Extension-ID: `netaigis.netaigis-coding-chat`
- Eigene Startversion: `0.1.0`; eigenständiges SemVer.
- `1.0.0` erst nach produktiver Abnahme.
- Eigenes Repository bleibt `AIGIS/cline.git`; Original-Cline ausschließlich Upstream.

Der frühere Vorschlag „NetAigis Coding Agent“ als Extension-Name ist dadurch
erledigt. **NetAigis Coding Agent** bleibt die Bezeichnung des eigenständigen
Acer-Backends; dieser Dienst wird nicht umbenannt. Die gesamte sichtbare
VS-Code-Oberfläche muss zur freigegebenen eigenen Identität passen.

Die praktische Umstellung ist weiterhin OFFEN und folgt erst auf die oben
belegte Kompatibilitätsanalyse und tatsächliche Daten-/Secret-/Checkpoint-
Migrationstests. Keine bloße Änderung von package.json, kein Datenverlust,
keine Kollision mit Original-Cline. Publisher-Verfügbarkeit wird bei einer
späteren Veröffentlichung gesondert bestätigt. Die Namensentscheidung
ändert keine Modellendpunkte oder Dienstidentitäten und ist keine Behauptung
bereits geprüfter produktiver Migration oder Abnahme.


Verbindliche Benutzerkorrektur: **NetAigis Coding Chat** mit Paket
`netaigis-coding-chat` und ID `netaigis.netaigis-coding-chat`. Die frühere
Auslegung des Assistenten, nur den Anzeigenamen zu ändern und die technische
ID beizubehalten, war nicht freigegeben und ist zurückgenommen. Es bleibt
bei Publisher `netaigis`, Startversion `0.1.0` und eigenem SemVer. Der Acer
Coding-Agent behält seine Identität. Noch keine technische Umstellung erfolgt.


## Gezielte Folgenprüfung für netaigis.netaigis-coding-chat

Keine alternative Identität wird gewählt. Noch keine Paket-/ID-/Versionsänderung.
Die erneute Prüfung betrifft ausschließlich die nun vollständig präzisierte
Zielidentität, keine neue Bestandsaufnahme der abgeschlossenen Phasen.

1. **Konkreter Befund: UI-/Command-Bruch bei bloßer Paketumbenennung.**
   `apps/vscode/src/registry.ts:4` berechnet den Command-Präfix für jeden Namen
   außer `claude-dev` direkt aus `name`; mit dem Zielnamen wird daraus
   `netaigis-coding-chat.*`. `registry.ts:40` bildet die Sidebar-ID ebenfalls
   aus dem Paketnamen. Das gegenwärtige Manifest deklariert dagegen noch
   `cline.*` und `claude-dev.SidebarProvider` (package.json:131/139ff).
   Manifest, tatsächliche Registrierungen, Menüs, Keybindings, Recall-Kommandos
   und sichtbare UI müssen deshalb zusammen umgestellt und geprüft werden.
   Ein abweichender Paketname zur Umgehung dieses Problems wird nicht gewählt.
2. **Konkreter Befund: alte native Daten sind nicht automatisch im neuen Kontext.**
   `vscode-to-file-migration.ts:182ff` liest Secrets über den übergebenen
   `vscodeContext.secrets`; `extension.ts:88` übergibt den aktuellen Kontext.
   Das ist kein Export aus der alten Extension-ID durch die neue Extension.
   Der Dateikopf benennt Task-History und Checkpoints ausdrücklich als noch
   nicht durch diese Migration übernommene Inhalte. Bereits gemeinsam
   gespeicherte Werte haben Vorrang und dürfen nicht überschrieben werden.
3. **Konkreter Befund: alter Legacy-Pfad muss ausdrücklich erreichbar bleiben.**
   `sdk/SdkController.ts:530` übergibt `context.globalStorageUri.fsPath`;
   `sdk-task-history.ts:246ff` ergänzt nur diesen ausdrücklich übergebenen Pfad
   zur gemeinsamen Standardablage. Eine neue Extension-ID allein liefert
   keinen Nachweis, dass der bisherige ID-Pfad weiter gelesen wird. Daher
   alte Sitzungs-/Checkpoint-Zuordnungen erhalten und mit alten Daten prüfen.
4. **Gemeinsame moderne Daten bleiben zu erhalten.**
   `shared/storage/storage-context.ts:88ff/140` benutzt weiterhin die bestehende
   konfigurierbare gemeinsame Datenablage einschließlich `secrets.json`.
   Der ID-Wechsel erzeugt dort keine sichere Isolation zweier gleichzeitig
   aktiver Extensions. Koordinierte Schreibzuständigkeit und Rückfall müssen
   vor Produktivbetrieb belegt werden; keine vorsorgliche Pfadumbenennung.

Diese Befunde begründen die nötige Migration/Kompatibilitätsarbeit, keine
Ablehnung oder Änderung der freigegebenen Identität. Native Alt-Secrets,
alte/aktive SDK- und Legacy-Sitzungen, Einstellungen, Aufträge, Autor-Metadaten,
Checkpoints, Recall-Outbox und Rollback sind praktisch zu prüfen. Unbelegte
Wiederherstellungs- oder Erreichbarkeitserfolge werden nicht behauptet.
