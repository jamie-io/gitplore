# PyFlap – LF12a Spielprojekt (Marc Jahn, Jamie Jahn)

Jump-and-Run, levelbasiert (Flappy-Bird-themed). Pygame, 800×600.
Steuerung: Leertaste, F, RMT, LMT, ESC. Level 2: Wände wachsen/schrumpfen.

## Struktur

- `Code/start_pyflap.py` – Startdatei, Spielschleife, Text, GameOver/Sieg
- `Code/game_object.py`, `player.py`, `camera.py`, `block.py`, `wall.py`, `coin.py`, `level.py` – Klassen laut Grobplanung; `rocket.py` – Gegner (Zusatz)
- `Assets/` – Bird-Sprites + Flappy-Assets, Quellen in `Quelle.txt`; `Assets/Coin/`, `Assets/Rocket/` selbst erstellt
- `Kanban/` – `boardData_18 09_08 25.kan`, `taskdisplayform_.ui`
- `Doku_pdf/` – Original-PDFs + `Marc_Jamie_PyFlap_Projektuebersicht_mit_Erklaerung.pdf`
  (mit Eigenständigkeitserklärung: benotet, KI-Einsatz offengelegt)
- `Doku_md/` – Markdown-Transkripte aller PDFs (2-spaltige/grafiklastige
  per Sichtprüfung übertragen, Grafiken als `[Grafik]`-Vermerk)
- `Referenz_alle_Gruppen/` – entpackte `AbgabeProjektübersicht.zip` (alle Teams)
- `Original_Einreichung_Marc_Jamie/` – entpackte `fia24_projektordner_Marc_Jamie.zip`

## Start

```bash
cd Code && python3 start_pyflap.py   # Bildpfade relativ zu Code/, braucht pygame
```
