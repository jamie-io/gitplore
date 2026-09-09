# Gitplore

Ein interaktives 3D-Portfolio: Besucher betreten eine kleine, frei begehbare Welt, in der jedes
Projekt ein eigenes Wahrzeichen hat. Wer ein Portal durchschreitet, landet direkt beim Projekt –
mit Beschreibung, README, Quellcode und, wo möglich, einer laufenden Demo.

Die Welt selbst ist Teil des Portfolios: Sie zeigt die technische und gestalterische Umsetzung.

## Erste Version: das kuratierte Portfolio

- **Direkter Einstieg.** Besucher starten unmittelbar in der Welt, ohne Anmeldung oder Auswahl.
- **Freies Erkunden.** Am Desktop wird mit Maus und Tastatur navigiert. Unterschiedliche
  Wahrzeichen machen Projekte erkennbar und belohnen das Erkunden.
- **Projekte betreten.** Manche Ziele zeigen eine bestehende Anwendung, andere eine eigens für die
  Welt gebaute interaktive Demonstration.
- **Details finden.** Jedes Ziel erklärt das Projekt und verlinkt README und Quellcode.
- **Direkt springen.** Ein Projektmenü führt ohne Umweg zu jedem Ziel.
- **Mobil lesen.** Auf dem Smartphone erscheint statt der 3D-Welt eine schlanke Projektübersicht
  mit Beschreibungen, Bildern und Demo-Links.

## Spätere Erweiterung: der GitHub-Explorer

Die ursprüngliche Idee folgt nach dem persönlichen Portfolio:

1. Besucher geben einen GitHub-Benutzernamen ein.
2. Aus den öffentlichen Repositories dieses Profils entsteht eine Welt.
3. Jedes Repository lässt sich erkunden – Informationen, README und vorhandene Demos.

Maßgeschneiderte Interaktionen und eigens gebaute Umgebungen bleiben den kuratierten Projekten
vorbehalten. Generierte Welten setzen sich aus wiederverwendbaren Umgebungen und den Inhalten der
Repositories zusammen.

## Technik

Angular 22 (zoneless, Signals) mit Three.js. Details zur Architektur und zur Reihenfolge der
Umsetzung stehen in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), der Produktumfang in
[`PLAN.md`](PLAN.md).

## Entwicklung

Node-Version aus `.nvmrc` verwenden (`nvm use`), dann:

```sh
npm install
npm start          # Entwicklungsserver auf http://localhost:4200
npm test           # Unit-Tests (vitest)
npm run e2e        # End-to-end-Tests (Playwright)
npm run verify     # Lint, Typecheck, Tests und Produktions-Build – das Tor vor jedem Commit
```

Der Code, die Kommentare und die Commit-Nachrichten sind auf Englisch; diese README ist auf
Deutsch.
