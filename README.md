# EasyCopy

Kopiert Felder von einem Programmfenster in ein anderes. Läuft nur auf deinem Rechner und liest Fenster über die
Bedienungshilfen des Betriebssystems (mit [agent-desktop](https://www.npmjs.com/package/agent-desktop)).

## Voraussetzung

Node.js ab Version 18 (npm ist dabei). Sonst nichts.

## Starten

```bash
npx easycopy
```

Der Befehl startet einen lokalen Server und öffnet die Oberfläche im Browser. Öffne immer die Adresse aus dem
Terminal; sie enthält ein Zugangs-Token.

Beim ersten Start unter macOS werden zwei Freigaben gebraucht (Systemeinstellungen → Datenschutz & Sicherheit), jeweils
für das Programm, aus dem du den Befehl gestartet hast (meist das Terminal):

- **Bedienungshilfen:** zum Lesen und Ausfüllen der Felder.
- **Bildschirm- & Systemaudioaufnahme:** nur damit macOS die Fenstertitel herausgibt. Ohne sie siehst du statt der Titel
  nur den Programmnamen, und Fenster lassen sich nicht erkennen. Das Programm macht keine Bildschirmaufnahmen.

Nach dem Erteilen das Terminal-Programm und den EasyCopy neu starten. Hilfe: `npx agent-desktop permissions --guide`.

## Mehrere Seiten (Schritte)

Eine Konfiguration kann aus mehreren Schritten bestehen, zum Beispiel bei einem Formular mit „Weiter“. Jeder Schritt hat
sein eigenes Ziel und seine eigenen Feldpaare. Beim Ausführen läuft ein Schritt nach dem anderen: Du führst Schritt 1
aus, siehst das ausgefüllte Formular, klickst dort auf „Weiter“ und startest erst dann Schritt 2 im Tool. Beim Einrichten
wählst du links die Quelle und rechts das Ziel, klickst „Felder laden“ und ordnest zu. Schritt 2 legst du an, nachdem du im Ziel selbst auf „Weiter“ geklickt hast. Pro Schritt kannst du einen Hinweis
hinterlegen, der nach dem Schritt angezeigt wird.

## Darstellung

Oben rechts wählst du zwischen Automatisch (folgt dem System), Hell und Dunkel. Die Wahl bleibt im Browser gespeichert.

## Fenster und Tabs

Bei Browsern (getestet: Chrome) erscheint jeder Tab einzeln in der Liste. Nur der vordere Tab eines Fensters ist lesbar.
Deshalb holt der EasyCopy einen Hintergrund-Tab zum Lesen, Prüfen und Schreiben kurz nach vorn und stellt danach den
vorherigen Tab wieder her. Liegen EasyCopy und Ziel im selben Browserfenster, springt die Ansicht dabei kurz um.
Zusätze im Tab-Namen wie „– Arbeitsspeichernutzung – 12 MB“ werden entfernt. Das Wiederfinden läuft über „Titel enthält …“.

## Wo liegen die Konfigurationen?

Je Konfiguration eine JSON-Datei in `~/.easycopy/configs/`. Du kannst sie sichern oder weitergeben. Ein anderer
Ordner lässt sich mit `EASYCOPY_HOME` einstellen.

## Datenschutz

- Alles bleibt auf diesem Rechner. Feldinhalte werden nicht gespeichert und nicht gesendet.
- Passwortfelder werden nie gelesen.
- Der Server hört nur auf `127.0.0.1` und verlangt das Token.
- Update-Hinweis: Das Programm fragt höchstens alle sechs Stunden bei der npm-Registry nach der neuesten Version
  (ohne Nutzerdaten). Abschalten mit `EASYCOPY_NO_UPDATE_CHECK=1`.

## Entwicklung

```bash
npm install
npm run build   # baut die Oberfläche nach web-dist/
npm test
npm start
```

## Lizenz

MIT, siehe [LICENSE](LICENSE). EasyCopy nutzt [agent-desktop](https://www.npmjs.com/package/agent-desktop) (Apache-2.0).
