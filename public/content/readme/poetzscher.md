# Website Christopher Pötzsch – Objektservice & Gebäudetechnik

Statische Website (HTML/CSS/JS, kein Build, keine Abhängigkeiten). Einfach per FTP
hochladen oder auf Netlify/Uberspace/All-Inkl/IONOS ablegen – läuft sofort.

## Seiten

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Hero, Kennzahlen, Gewerke-Block, Erfahrung, Vorteile, Zielgruppen, Ablauf, FAQ |
| `leistungen.html` | Die vier Leistungsbereiche im Detail |
| `kontakt.html` | Kontaktdaten und Anfrageformular |
| `impressum.html` | Impressum (Vorlage, **Platzhalter offen**) |
| `datenschutz.html` | Datenschutzerklärung (Vorlage, **Platzhalter offen**) |

## Technik

- **Keine externen Verbindungen.** Alle drei Schriften liegen lokal unter
  `assets/fonts/` (rund 170 KB). Keine Google Fonts, keine Karten, kein Analytics,
  keine Cookies. Damit ist kein Cookie-Banner nötig und die Datenschutzerklärung
  bleibt schlank.
- **Kontaktformular** ohne Server: Beim Absenden öffnet sich das E-Mail-Programm des
  Besuchers mit fertig ausgefüllter Nachricht. Sobald ein Hoster mit PHP feststeht,
  kann das auf echten Versand umgestellt werden (siehe Kommentar in
  `assets/js/main.js`). Ein Honeypot-Feld gegen Bots ist eingebaut.
- **Für das Handy gebaut.** Am unteren Bildschirmrand liegt auf Mobilgeräten eine
  feste Leiste mit „Anrufen" und „WhatsApp" – der kürzeste Weg zum Auftrag.
  Alle Bedienelemente sind mindestens 44 px hoch.
- **Responsiv**, mit Tastatur bedienbar, `prefers-reduced-motion` wird respektiert,
  Inhalte bleiben auch ohne JavaScript sichtbar.

## Gestaltung

Helle Grundfläche, kräftige Akzente – bewusst kein dunkles Layout.

**Farben**

| Rolle | Wert |
|---|---|
| Akzent (Text, Linien) | `#46941f` |
| Akzent (Flächen, Buttons) | `#58bd35` |
| Grüne Tönung | `#ecf5e5` |
| Überschriften, Fußbereich | `#12211a` |
| Sektionsfläche | `#f5f7f2` |

**Schriften** – drei Rollen statt einer Einheitsschrift:

- **Archivo** (900) für Überschriften. Schwer und leicht schmal – die Anmutung von
  Fahrzeugbeschriftung und Bauschildern.
- **IBM Plex Sans** für Fließtext. Technischer Unterton, sehr gut lesbar.
- **IBM Plex Mono** für Labels, Kennzahlen und die Kopfleiste – wirkt wie Beschriftung
  auf technischer Dokumentation.

**Signaturelement:** der Gewerke-Block auf der Startseite. Die vier Leistungsbereiche
sind keine vier losen Karten, sondern ein zusammenhängender Block mit grüner Kante.
Das zeigt bildlich, worum es geht: alles aus einer Hand.

Alle Werte zentral in `assets/css/style.css` unter `:root`.

## Vor dem Livegang zwingend erledigen

1. **Impressum** – Firmierung, USt-ID bzw. Kleinunternehmer-Hinweis,
   Handwerkskammer und Handwerksrollen-Nummer eintragen.
2. **Datenschutz** – Hoster mit Anschrift eintragen, AVV abschließen,
   Speicherdauer der Logfiles, Datum. WhatsApp-Absatz nur behalten, wenn genutzt.
3. **Domain + SSL-Zertifikat** aktivieren.
4. **E-Mail-Adresse** unter eigener Domain einrichten (statt Gmail) und überall
   austauschen: `christopherpoetzsch22@gmail.com`.
5. `<link rel="canonical">` in `index.html` auf die echte Domain setzen.

Alle offenen Stellen in den Rechtstexten sind **gelb hinterlegt** und damit im
Browser sofort auffindbar.

## Inhaltlich noch offen

- **Logo** – aktuell ein selbst erstelltes Platzhalter-Zeichen (`assets/img/logo.svg`,
  Dach + Blitz für Gebäude + Elektro). Kann so bleiben oder ersetzt werden.
- **Motto** – als Überschrift umgesetzt: „Vier Gewerke. Ein Ansprechpartner."
  Alternativen siehe unten.
- **Fotos** – drei gestrichelte Platzhalterflächen auf `leistungen.html`
  und der Startseite. Eigene Bilder wirken deutlich besser als Stockfotos.
- **Referenzen** – bewusst noch nicht angelegt, da keine Bilder/Freigaben vorliegen.
- **Öffnungszeiten / Notdienst** – nicht angegeben, daher weggelassen
  (Kommentar in `kontakt.html`).
- **Einsatzgebiet** – angenommen: Bitterfeld-Wolfen, Dessau-Roßlau, Halle, Leipzig,
  Köthen, Delitzsch. Bitte bestätigen oder korrigieren.
- **Rechtsform** – als „Einzelunternehmen" angenommen.
- **Mitarbeiterzahl** – auf Wunsch nirgends erwähnt.

## Mottovorschläge

1. **Vier Gewerke. Ein Ansprechpartner.** (aktuell als Hauptüberschrift eingesetzt)
2. Alles aus einer Hand.
3. Technik und Objekt – aus einer Hand.
4. Zuverlässig. Fair. Sauber.

## Navigation

Drei Punkte: Start, Leistungen, Kontakt. Jeder Punkt führt auf eine
eigene Seite. „Ablauf" ist bewusst **kein** Menüpunkt – es ist ein Abschnitt der
Startseite. Ein Menü, in dem manche Punkte Seiten öffnen und andere nur scrollen,
wirkt unfertig.

## Lokal ansehen

```bash
python3 -m http.server 8099
# danach http://localhost:8099 im Browser öffnen
```
