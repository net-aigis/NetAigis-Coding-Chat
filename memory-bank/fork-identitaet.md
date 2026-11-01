# Verbindlicher Auftrag: eigenständiger Fork und sichere Identitätsmigration

Stand 31.10.2026: Die technische Identitätsumstellung ist im Reparatur-Worktree umgesetzt. Ziel bleibt ausschließlich **NetAigis Coding Chat**, `netaigis.netaigis-coding-chat`, `0.1.0`. Die produktive Migration/Installation und vollständige Abnahme stehen aus. Die Upstream-Integration ersetzt die Fork-Eigenständigkeit nicht.

Die nachstehenden frühen Befunde dokumentieren den Stand **vor** dieser technischen Umstellung. Der aktuelle Implementierungs- und Prüfnachweis steht im letzten Abschnitt und in [phase4-reparatur.md](phase4-reparatur.md). Frühere Aussagen „noch nicht umgestellt“ beschreiben diesen historischen Stand, keine erneute Namensentscheidung.

## Festgelegte Eigentümerschaft

- Produkt und Entwicklung: eigener, dauerhaft gepflegter Coding-Agent-Fork.
- Repository/origin: `https://git.wittmer.software/AIGIS/cline.git`.
- Entwicklungsbranch: `coding-agent-v4`; Reparaturen nur im vorhandenen Worktree.
- Cline-Upstream: ausschließlich externe Codequelle mit deaktiviertem Push.
- Projektunabhängigkeit: NetAigisOS ist ein bearbeitetes Projekt, keine feste
  technische Bindung des Agenten.
- Modellrouting, Coding-Agent, Learning-Agent, TOTAL RECALL und bestehende
  Sitzungen bleiben erhalten. Keine Abhängigkeit von einem Cline-Cloud-Konto.

## Historischer Quellstand vor der technischen Umstellung und freigegebene Zielidentität

Vor diesem Arbeitsschritt trug `apps/vscode/package.json` `publisher: saoudrizwan`,
`name: claude-dev`, `displayName: Cline`, `version: 4.1.26`.
`apps/vscode/src/registry.ts` bildet daraus `saoudrizwan.claude-dev`, den
Command-Präfix `cline` und `claude-dev.SidebarProvider`.
Damit war die geforderte eigene Extension-Identität damals noch nicht umgesetzt.
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

## Historischer Release-Schutz aus Commit 8b85d65e1

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

Historischer Stand vor diesem Arbeitsschritt: Die praktische Umstellung war OFFEN und folgte erst auf die oben
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
Coding-Agent behält seine Identität. Vor diesem Arbeitsschritt war noch keine technische Umstellung erfolgt.


## Gezielte Folgenprüfung für netaigis.netaigis-coding-chat

Keine alternative Identität wurde gewählt. Diese frühe Folgenprüfung erfolgte vor der Paket-/ID-/Versionsänderung.
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


## Technische Umsetzung im Reparatur-Worktree, 31.10.2026

Die freigegebene Identität steht nun tatsächlich in `apps/vscode/package.json`: Publisher `netaigis`, Name `netaigis-coding-chat`, Anzeigename **NetAigis Coding Chat**, ID `netaigis.netaigis-coding-chat`, eigene Version `0.1.0`. Upstream `4.1.26`/`a459f1d04dea030833b558be645011ab739c463b` bleibt unter `fork.upstream` getrennt. `fork.release.approved` bestätigt die ausdrücklich erteilte Identitätsentscheidung; es ersetzt keine produktive Abnahme, Veröffentlichungsfreigabe oder Publisher-Verfügbarkeitsprüfung. Keine eigenen Release-Tags, keine produktive VSIX-Installation.

Manifest, Registry, Recall-Kommandos, View-/Sidebar-/Aktivitätsleisten-IDs, URI-Callbacks, Walkthrough und sichtbare Produkttexte sind zusammen umgestellt. Eigene lokale SVG-/PNG-Assets ersetzen das Produktlogo; upstreamgebrandete Walkthrough-Screenshots werden nicht als eigene Screenshots ausgegeben. About zeigt eigenes Forgejo und getrennte Upstream-Basis. Ein externer Cline-Provider bleibt als solcher bezeichnet und wird nicht in einen erfundenen eigenen Cloud-Dienst umetikettiert. Das eigene Welcome benötigt kein Cline-Konto und übernimmt keine neuen Standardmodelle.

### Speicher und native Secrets

`src/fork-entry.ts` initialisiert die SDK-/Dateispeicher erst nach der Migrationsentscheidung. Im eigenen VS-Code-Namensraum liegt `home/` für moderne Daten und `legacy/` für übernommene Extension-Daten. Modulgebundene Pfadauflösung ersetzt **keine** gemeinsam genutzten `process.env`-Werte. Original-Cline bleibt damit im Paralleltest auf seinem bisherigen Speicher. Vorhandene alte Daten führen ohne verifizierten Import in eine ausdrückliche Migrationsansicht.

`fork-identity-export.ts` ist ein minimaler Exporthelfer ausschließlich unter der alten ID und ausschließlich für eine isolierte Kopie des alten Profils. Die produktive Originalextension wird dafür nicht ersetzt. Er liest native Secrets im tatsächlich berechtigten alten Kontext; der neue Kontext greift nicht vermeintlich auf alte Secrets zu. Unterstützt der Host die Enumeration, werden sämtliche nativen Schlüssel exportiert, ansonsten die bestehenden bekannten `SecretKeys`. Alte Werte bleiben erhalten. Die neue ID schreibt die übernommenen Werte in **ihren** SecretStorage und prüft sie nach. Dateiwerte und bereits vorhandene Zielkonfiguration werden nicht blind überschrieben.

Übertragungsmanifest und Payload sind zugriffsgeschützt, pro Datei SHA256-geprüft. Echte Secrets müssen bei einer später ausdrücklich freigegebenen produktiven Übernahme außerhalb von Git bleiben; die gespeicherten Entwicklungstests verwenden ausschließlich deklarierte Native-Secret-Fixtures. Produktive native Zugangsdaten wurden in diesem Schritt weder exportiert noch ausgegeben. Globale und aktuelle Workspace-Mementos sowie die vorhandenen dateibasierten Workspace-Einstellungen werden übernommen. Andere native Workspace-Kontexte müssen vor einer produktiven Komplettübernahme im jeweiligen alten Kontext erfasst werden; ihre Erreichbarkeit wird nicht durch den Test eines einzelnen Workspace behauptet. Das Manifest enthält aktuell keine VS-Code-Konfigurationseigenschaften unter einem alten Produktpräfix (`contributes.configuration.properties` ist leer). Benutzerdefinierte alte Keybindings werden nicht global umgeschrieben und bleiben bei der alten Extension; die eigenen Standard-Keybindings benutzen eigene IDs.

### Transaktion und Wiederherstellung

SQLite wird bei Export über die tatsächliche SQLite-Backup-API einschließlich bestätigter WAL-Daten übertragen; ohne diese API wird abgebrochen, keine aktive DB einfach kopiert. Datenbanken werden auf Integrität geprüft. Pfadverweise in Manifesten/Indexen und SQLite-Spalten werden vor der Veröffentlichung angepasst. Kanonische Nachrichten bleiben unverändert. IDs, Originalaufträge, Autor-Metadaten, Modelle und gespeicherte Prozesswerte werden nicht neu erfunden.

Bei einer gesicherten Kopie unterscheidet `originalFrom` den ursprünglichen absoluten Speicherpfad vom heutigen physischen Snapshotpfad. Diese Zuordnung war mit den echten Phase-2-Daten zunächst nachweislich fehlerhaft und wurde korrigiert. Explizit fehlende Quellverzeichnisse, veränderte Quelldateien, Symlinks und externe Git-Objektreferenzen führen zum Abbruch statt zu einer unvollständigen Erfolgsmeldung.

Ein privates, synchronisiertes Journal dokumentiert Ausgangswerte und veröffentlichte Prüfsummen. SQLite-Änderungen werden vorab in privaten temporären Dateien vorbereitet. Ein exklusiver Eigentümer-Lock verhindert parallele Migration/Rücknahme. Nach Prozessabbruch ist nur geprüfte Rücknahme erlaubt; ein noch lebender Eigentümer bleibt geschützt. Wiederholung desselben Imports überschreibt keine spätere Arbeit. Rücknahme verweigert Dateien oder Einstellungen, die nach der Migration geändert wurden. Die Originaldateien und alten nativen Secrets werden nicht gelöscht.

### Tatsächliche Grenzen

Die tatsächliche Übernahme einer gesicherten SDK-Sitzung und der Secret-Transport in realen isolierten VS-Code-Kontexten sind belegt. Ein Datenimport überträgt keinen laufenden Betriebssystemprozess und bestätigt keinen heutigen Prozesszustand aus einem alten PID-Wert. Vollständiger produktiver Altbestand, OS-Schlüsselbund aus einem produktiven Profil, projektspezifische Checkpoint-Bedienung, Android und Ausführung mit dem tatsächlich konfigurierten Backendmodell sind gesondert abzunehmen. Modelle bleiben austauschbar; der angekündigte Wechsel zu „DeepSeek 4.1 1017B“ ist kein Nachweis eines bereits aktiven Modells oder seiner Parameterzahl. Produktive Migration benötigt weiterhin nachgewiesene Wiederherstellbarkeit **und die ausdrücklich verlangte Freigabe**. Der eigenständige Acer-Backenddienst wird nicht umbenannt oder verändert.


Ergänzender Prüfnachweis: Native Secret-Persistenz wird durch sechs **normale** isolierte VS-Code-Läufe ohne `--extensionTestsPath` belegt. Dieser Standard-Testschalter verwendet RAM-only Storage und ist dafür ungeeignet; frühe Wiederstart-/Fallback-Aussagen daraus waren nicht ausreichend. Der endgültige Fallback-Helfer darf nur in `seed` Fixtures erzeugen, nicht beim Rückfall. Reale neue Native-Secrets wurden nach zwei echten Prozessneustarts erneut gelesen. Xvfb-Absturzzuordnung und ausschließlich betroffene Startkorrektur sind im Phase-4-Bericht dokumentiert; die Fork-Identitäts-/Migrationsdateien wurden bei dieser Absturzprüfung nicht geändert.

Am 01.11.2026 zusätzlich die tatsächliche eigene VSIX gebaut und mit dem Installer
in einer abgeschirmten VS-Code-1.143.1-Instanz installiert. Paket-SHA256
edef0ae50f424ada4feed54e151f1bc9a849fb76b7f147bfa61d34ba49d04c75,
Quellstand 6976c4fd5. Die vorhandene Migrationssperre zunächst bestätigt; nach
verifiziertem Import des bestehenden synthetischen Transfers und echtem Neustart
startet die installierte Runtime, registriert 26 Produktionskommandos, öffnet
die eigene Sidebar und aktiviert Original-Cline 4.1.25 daneben. Keine produktive
Installation oder Migration und kein Modellantworttest aus dieser netzwerkisolierten
Prüfung abgeleitet. Artefakt-/Prüfpfade und verbleibender Acer-Routerblocker stehen
im neuesten Abschnitt von phase4-reparatur.md; Gesamtauftrag weiterhin offen.
