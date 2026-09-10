# Gitplore

Ein interaktives 3D-Portfolio: Besucher betreten eine kleine, frei begehbare Welt, in der jedes
Projekt ein eigenes Wahrzeichen hat. Wer ein Portal durchschreitet, landet direkt beim Projekt –
mit Beschreibung, README, Quellcode und, wo möglich, einer laufenden Demo.

Die Welt selbst ist Teil des Portfolios: Sie zeigt die technische und gestalterische Umsetzung.

Live: <https://jamie-io.github.io/gitplore/> · Liste ohne 3D: <https://jamie-io.github.io/gitplore/projects>

## Erste Version: das kuratierte Portfolio

- **Direkter Einstieg.** Besucher starten unmittelbar in der Welt, ohne Anmeldung oder Auswahl.
  Ein kurzer Startbildschirm erklärt die Steuerung und fängt den ersten Klick ab, den der Browser
  für die Mausfreigabe braucht.
- **Freies Erkunden.** Am Desktop wird mit Maus und Tastatur navigiert. Unterschiedliche
  Wahrzeichen machen Projekte erkennbar und belohnen das Erkunden: Portale, Bildschirme mit dem
  Screenshot der Anwendung, ein Monument in der Mitte der Lichtung.
- **Projekte betreten.** Manche Ziele zeigen eine bestehende Anwendung im Panel (als eingebetteter
  Frame, sonst als Screenshot mit Link), andere eine eigens für die Welt gebaute Demonstration –
  etwa die Videowand neben dem Deslopify-Portal, deren maschinell übersetzte Titel sich per Tastendruck
  in die Originale zurückverwandeln.
- **Details finden.** Jedes Ziel erklärt das Projekt und zeigt README und Quellcode.
- **Direkt springen.** Ein Projektmenü (Taste `M`) reist ohne Umweg zu jedem Ziel oder öffnet es sofort.
- **Mobil lesen.** Auf dem Smartphone – und in Browsern ohne WebGL2 – erscheint statt der 3D-Welt
  eine schlanke Projektübersicht mit Beschreibungen, Bildern und Demo-Links. Sie ist zugleich der
  Weg für Screenreader und aus der Welt heraus immer verlinkt.

### Steuerung

| Taste                   | Wirkung                           |
| ----------------------- | --------------------------------- |
| `W A S D` / Pfeiltasten | Gehen; `←` `→` drehen ohne Maus   |
| Maus                    | Umsehen (nach Klick auf die Welt) |
| `Shift`                 | Laufen                            |
| `E` / `Enter`           | Wahrzeichen benutzen              |
| `M`                     | Projektmenü                       |
| `Esc`                   | Panel, Menü oder Demo verlassen   |

Unter _Einstellungen_ lassen sich Grafikqualität, Mausempfindlichkeit und reduzierte Bewegung
wählen; die Systemeinstellung `prefers-reduced-motion` wird ohnehin beachtet (kein Kameraflug,
ruhiger Himmel).

## Spätere Erweiterung: der GitHub-Explorer

Die ursprüngliche Idee folgt nach dem persönlichen Portfolio:

1. Besucher geben einen GitHub-Benutzernamen ein.
2. Aus den öffentlichen Repositories dieses Profils entsteht eine Welt.
3. Jedes Repository lässt sich erkunden – Informationen, README und vorhandene Demos.

Maßgeschneiderte Interaktionen und eigens gebaute Umgebungen bleiben den kuratierten Projekten
vorbehalten. Generierte Welten setzen sich aus wiederverwendbaren Umgebungen und den Inhalten der
Repositories zusammen. Die Architektur ist darauf vorbereitet: Wahrzeichen werden aus den
Projektdaten erzeugt, die Inhalte kommen über eine austauschbare `ContentSource`.

## Technik

Angular 22 (zoneless, Signals) mit Three.js, ohne Physik-Engine und ohne Drittbibliotheken um
Three herum. Details zur Architektur und zur Reihenfolge der Umsetzung stehen in
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), der Produktumfang in [`PLAN.md`](PLAN.md).

## Entwicklung

Node-Version aus `.nvmrc` verwenden (`nvm use`), dann:

```sh
npm install
npm start               # Entwicklungsserver auf http://localhost:4200
npm test                # Unit-Tests (vitest)
npm run e2e             # End-to-end-Tests (Playwright) gegen den Produktions-Build
npm run verify          # Lint, Typecheck, Tests und Produktions-Build – das Tor vor jedem Commit
```

Inhalte und Assets werden bewusst nicht beim Build erzeugt, sondern eingecheckt:

```sh
npm run content:sync    # READMEs der Projekte nach public/content/readme/ holen
npm run content:check   # prüft, ob jede Demo wirklich als iframe einbettbar ist
npm run content:screens # Screenshots der Demos aufnehmen
npm run assets:author   # Hero-Modelle (glTF) aus Code erzeugen → assets-src/models/
npm run assets:optimize # Modelle komprimieren (meshopt, WebP) und manifest.json schreiben
```

Neue Projekte entstehen automatisch aus den öffentlichen Repositories: `npm run content:sync`
holt sie und legt sie als Wahrzeichen an. Deutsche Titel, Zusammenfassungen und alles, was GitHub
nicht liefert, kommen aus `src/app/content/repo-overrides.ts`; ein Schema-Test hält die
zusammengeführten Daten konsistent.

## Deployment

- **GitHub Pages** (Standard): Der Workflow in `.github/workflows/deploy.yml` baut bei jedem Push
  auf `main` mit `--base-href /gitplore/` und veröffentlicht `dist/gitplore/browser`. Tiefe Links
  funktionieren über `public/404.html`.
- **Eigener Server**: `docker build -t gitplore .` erzeugt ein nginx-Image, das die App unter `/`
  ausliefert (`docker run -p 8080:80 gitplore`). Der Unterschied zwischen beiden Varianten ist
  allein das `--base-href` – siehe `Dockerfile` und `nginx.conf`.

Der Code, die Kommentare und die Commit-Nachrichten sind auf Englisch; diese README ist auf
Deutsch.
