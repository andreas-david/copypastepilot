# CopyPastePilot

[English](README.md) · **Deutsch**

Kopiert Felder von einem Programmfenster in ein anderes. Läuft nur auf deinem Rechner und liest Fenster über die
Bedienungshilfen des Betriebssystems (mit [agent-desktop](https://www.npmjs.com/package/agent-desktop)).

## Installation für Einsteiger

Du brauchst nur **Node.js**. Alles andere holt CopyPastePilot selbst.

**1. Node.js installieren (einmalig).** Auf https://nodejs.org die Version „LTS“ laden und mit den Standardeinstellungen
installieren. Danach das Terminal **neu öffnen**.

**2. CopyPastePilot starten.** Öffne ein Terminal (Windows: Startmenü → „PowerShell“; macOS: Programme → Dienstprogramme →
„Terminal“) und tippe:

```bash
npx copypastepilot
```

Beim ersten Mal lädt das etwas, dann öffnet sich CopyPastePilot im Browser. Das Terminalfenster bleibt offen, solange du
CopyPastePilot nutzt. Zum Beenden Strg+C oder das Fenster schließen. Öffne immer die Adresse aus dem Terminal; sie enthält ein
Zugangs-Token.

**Noch einfacher, ohne Terminal:** Lade aus dem Ordner [`start`](start) die Datei `CopyPastePilot-starten.bat` (Windows) oder
`CopyPastePilot-starten.command` (macOS) und starte sie per Doppelklick. Sie startet immer die neueste Version. Unter macOS
beim ersten Mal Rechtsklick → „Öffnen“, weil die Datei nicht signiert ist.

**Etwas klappt nicht?** Im Terminal zeigt dieser Befehl, was fehlt (Node-Version, agent-desktop, Freigaben):

```bash
npx copypastepilot --check
```

**Optional: dauerhaft installieren.** Dann genügt künftig der Befehl `copypastepilot`:

```bash
npm install -g copypastepilot
copypastepilot
```

Aktualisieren: `npm install -g copypastepilot@latest`. Der Quelltext liegt auf
[GitHub](https://github.com/andreas-david/copypastepilot).

### Freigaben unter macOS

Beim ersten Start werden zwei Freigaben gebraucht (Systemeinstellungen → Datenschutz & Sicherheit), jeweils für das
Programm, aus dem du CopyPastePilot gestartet hast (meist das Terminal):

- **Bedienungshilfen:** zum Lesen und Ausfüllen der Felder.
- **Bildschirm- & Systemaudioaufnahme:** nur damit macOS die Fenstertitel herausgibt. Ohne sie siehst du statt der Titel
  nur den Programmnamen, und Fenster lassen sich nicht erkennen. Das Programm macht keine Bildschirmaufnahmen.

Nach dem Erteilen das Terminal-Programm und CopyPastePilot neu starten. Hilfe: `npx agent-desktop permissions --guide`.

### Hinweise für Windows

- Wird agent-desktop nicht gefunden, hilft `npm install -g agent-desktop`. CopyPastePilot sucht es dann selbst im Suchpfad
  (`PATH`). Mit der Umgebungsvariable `AGENT_DESKTOP` lässt sich auch direkt eine Datei angeben.
- Ist der Ordner für globale npm-Programme nicht im `PATH`, funktioniert `npx` trotzdem. Das ist der sichere Weg.

## Mehrere Seiten (Schritte)

Eine Konfiguration kann aus mehreren Schritten bestehen, zum Beispiel bei einem Formular mit „Weiter“. Jeder Schritt hat
sein eigenes Ziel und seine eigenen Feldpaare. Beim Ausführen läuft ein Schritt nach dem anderen: Du führst Schritt 1
aus, siehst das ausgefüllte Formular, klickst dort auf „Weiter“ und startest erst dann Schritt 2 im Tool. Beim Einrichten
wählst du links die Quelle und rechts das Ziel, klickst „Felder laden“ und ordnest zu. Schritt 2 legst du an, nachdem du im Ziel selbst auf „Weiter“ geklickt hast. Pro Schritt kannst du einen Hinweis
hinterlegen, der nach dem Schritt angezeigt wird.

## Darstellung und Sprache

Oben rechts wählst du die Sprache (Deutsch oder Englisch) und zwischen Automatisch (folgt dem System), Hell und Dunkel. Die
Wahl bleibt im Browser gespeichert. Ohne Wahl nutzt die Oberfläche die Sprache des Browsers. Das Terminal richtet sich nach
der Systemsprache, mit `--lang de` oder `--lang en` oder der Umgebungsvariable `COPYPASTEPILOT_LANG` lässt es sich ändern.

## Fenster und Tabs

Bei Browsern (getestet: Chrome) erscheint jeder Tab einzeln in der Liste. Nur der vordere Tab eines Fensters ist lesbar.
Deshalb holt CopyPastePilot einen Hintergrund-Tab zum Lesen, Prüfen und Schreiben kurz nach vorn und stellt danach den
vorherigen Tab wieder her. Liegen CopyPastePilot und Ziel im selben Browserfenster, springt die Ansicht dabei kurz um.
Zusätze im Tab-Namen wie „– Arbeitsspeichernutzung – 12 MB“ werden entfernt. Das Wiederfinden läuft über „Titel enthält …“.

## Wo liegen die Konfigurationen?

Je Konfiguration eine JSON-Datei in `~/.copypastepilot/configs/`. Du kannst sie sichern oder weitergeben. Ein anderer
Ordner lässt sich mit `COPYPASTEPILOT_HOME` einstellen.

## Datenschutz

- Alles bleibt auf diesem Rechner. Feldinhalte werden nicht gespeichert und nicht gesendet.
- Passwortfelder werden nie gelesen.
- Der Server hört nur auf `127.0.0.1` und verlangt das Token.
- Update-Hinweis: Das Programm fragt höchstens alle sechs Stunden bei der npm-Registry nach der neuesten Version
  (ohne Nutzerdaten). Abschalten mit `COPYPASTEPILOT_NO_UPDATE_CHECK=1`.

## Entwicklung

Die gebaute Oberfläche (`web-dist/`) liegt auch im Repository. `npm publish` baut sie vorher automatisch neu.
Alle Texte stehen in `locales/de.js` und `locales/en.js`. Eine neue Sprache ist eine weitere Datei, die dieselben
Schlüssel hat (`npm test` prüft das).

```bash
npm install
npm run build   # baut die Oberfläche nach web-dist/
npm test
npm start
```

## Hilfe und Kontakt

Fragen oder Probleme? Schau auf [www.digitaldavid.de/copypastepilot](https://www.digitaldavid.de/copypastepilot) oder melde einen Fehler auf
[GitHub](https://github.com/andreas-david/copypastepilot/issues). Bei Problemen mit dem Start hilft die Ausgabe von
`npx copypastepilot --check`.

## Lizenz

MIT, siehe [LICENSE](LICENSE). CopyPastePilot nutzt [agent-desktop](https://www.npmjs.com/package/agent-desktop) (Apache-2.0).
