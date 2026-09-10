# Nordwerk – Demoshop für den 3D office WebKatalog

Ein vollständiger B2B-Möbelshop eines fiktiven Fachhändlers, in dem der
WebKatalog die Produktdaten, die Preise, die Bilder und die 3D-Konfiguration
liefert. Gedacht als Vertriebsmittel: Der Interessent sieht nicht eine
Konfigurator-Demo, sondern **seinen zukünftigen Shop**.

Statisches HTML, ES-Module, kein Build, kein Backend. Läuft auf jedem Webserver
(IIS, Apache, nginx) und lokal aus dem Ordner heraus.

```
Startseite → Sortiment → Produktseite (3D + Konfiguration) → Warenkorb
          → Kasse → Bestellung | Angebot | OCI-5.0-Übergabe
```

## Schnellstart

```bash
python3 -m http.server 8080        # oder ein beliebiger Webserver
```

<http://localhost:8080/> – fertig. Der Shop besorgt sich beim Laden selbst ein
Demo-Token vom öffentlichen Einstiegspunkt `index_demo.php`.

> Ein `file://`-Aufruf funktioniert **nicht**: der Shop nutzt ES-Module und
> `fetch`, beides braucht http(s).

## Gestaltung

Die Oberfläche folgt der Bildsprache moderner Hersteller-Websites
(Orientierung: viasit.com): kühles Weiß, Ware auf hellgrauen Flächen, zentrierte
Überschriften in Inter Light, fette Kacheltitel, gesperrte Versalien für
Navigation, Etiketten und Schaltflächen, Koralle als einziger Akzent, keine
Rundungen, keine Schlagschatten in der Fläche. Die Marke „Nordwerk" ist dabei
eigenständig — übernommen ist die Gestaltungshaltung, nicht die Identität eines
realen Herstellers.

Der Aufmacher der Startseite ist eine Raumaufnahme; die Konfigurator-Bühne
steht als erster Abschnitt direkt darunter und zeigt einen Artikel in mehreren
echten Ausführungen — gerendert aus den Herstellerdaten, mit Ausführungsname
und Preis daneben. Welche das sind, steht als `heroVariants` in
`tools/products.json`.

Raum- und Situationsfotografie trägt Aufmacher, Warengruppen, Referenzband,
Beratungsband, Katalogkopf und Materialband; freigestellte Renderings bleiben
den Artikeln vorbehalten. Warum es welche Bilder gibt, steht in
`docs/bildbriefing.md`; `tools/build-scene.py` liefert sie in drei Breiten als
WebP mit JPEG-Rückfall aus.

Bewusst nicht verwendet: gesperrte Versal-Etiketten über Überschriften,
Nummerierung von Abschnitten, die keine Abfolge sind, und Meta-Ketten der Form
„A · B · C“. Versalien stehen nur in Navigation, Schaltflächen und Chips.

Alle Gestaltungsgrößen stehen als Custom Properties am Anfang von
`assets/css/shop.css`; für eine andere Hausfarbe genügt `--accent`.

## Tests

Der Shop wird mit Playwright in echtem Chromium durchgeklickt — jede Seite,
jeder Schalter, beide Richtungen der WebKatalog-Anbindung, dazu Ladezeiten und
Konsolenfehler. Playwright liegt im WebKatalog-Repo, ein eigener Install ist
nicht nötig:

```bash
NODE_PATH=../webkatalog2/node_modules \
../webkatalog2/node_modules/.bin/playwright test
```

14 Testfälle, rund 45 Sekunden. Sie starten den Webserver selbst. Für die
Sichtprüfung des Designs gibt es zusätzlich eine Bildstrecke:

```bash
SCREENS=1 SCREEN_DIR=/tmp/screens NODE_PATH=../webkatalog2/node_modules \
../webkatalog2/node_modules/.bin/playwright test --grep @screens
```

## Seiten

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Raumaufnahme als Aufmacher, Live-Konfigurator als erster Abschnitt |
| `katalog.html` | Sortiment mit Filtern, Suche und dem Markenkatalog (voller WebKatalog im Modal) |
| `produkt.html?p=<slug>` | Produktseite: 3D-Ansicht, Konfiguration im Shop-Design, Preis, Warenkorb, Anfrage |
| `warenkorb.html` | Warenkorb mit vollständiger Konfiguration je Position |
| `checkout.html` | Kasse mit drei Abschlüssen: Bestellung, Angebot, OCI 5.0 |
| `oci-empfaenger.html` | Simuliertes Beschaffungssystem, das die OCI-Rückgabe anzeigt |
| `integration.html` | „Wie ist das gebaut?“ – Landkarte, Codebeispiele, URL-Parameter-Playground |

Auf jeder Seite öffnet der Knopf **Integration** unten links ein Protokoll:
jeder REST-Aufruf und jede postMessage zwischen Shop und WebKatalog, live
mitgeschrieben.

## Welche Fähigkeit wo sichtbar wird

| WebKatalog-Fähigkeit | Wo im Shop |
|---|---|
| Artikel, Preise, Texte (`ofml.dll/articles`) | Produktkacheln, Produktseite |
| Merkmal ändern (`POST articles`) | Farb- und Ausführungsauswahl auf der Produktseite |
| Gerenderte Bilder (`odb.dll/articlesimage.jpg`) | Produktbilder, Galerieansichten, Warenkorb-Vorschau |
| Materialbilder (`ocd.dll/preview`) | Farbmuster im Shop-Design |
| Katalognavigation (`xcf.dll/getnodes`) | Markenliste auf der Startseite, Markenkatalog |
| iFrame-Einbettung, URL-Parameter | Startseite, Produktseite, Playground |
| postMessage `SET_ARTICLE` / `PROPERTY_UPDATED` | Produktseite, beidseitige Synchronisierung |
| postMessage `SET_CONFIG` | „Live-Steuerung“ auf der Produktseite (Preis, Rabatt) |
| postMessage `SET_THEME` | Dunkelmodus des Shops wirkt im Konfigurator |
| `REQUEST_CURRENT_ARTICLE` / `CURRENT_ARTICLE` | Übernahme aus dem Markenkatalog |
| `CONTACT_REQUEST` (Lead) | Formular „Angebot anfordern“ |
| OCI 5.0 / HOOK_URL | Kasse und `oci-empfaenger.html` |
| AR, CAD- und PDF-Downloads | Reiter „Downloads & AR“ auf der Produktseite |

## Zwei Fallstricke, die hier gelöst sind

**Kein `Content-Type: application/json` beim Merkmalswechsel.** Der POST auf
`/ofml.dll/ofml/articles` wird damit zu einem „preflighted request". Die API
beantwortet das `OPTIONS` zwar mit `Access-Control-Allow-Origin: *`, aber ohne
`Access-Control-Allow-Headers`, und der Browser bricht mit „Failed to fetch" ab.
Ohne gesetzten Header schickt `fetch` `text/plain`, der Request bleibt „simple",
und die API verarbeitet denselben JSON-Body anstandslos. Siehe
`assets/js/api.js`. Wer den Header braucht, muss serverseitig
`Access-Control-Allow-Headers: content-type` ergänzen.

**Schriften selbst hosten.** Inter und Instrument Serif liegen unter
`assets/fonts/` und werden über `assets/css/fonts.css` eingebunden — keine
Anfrage an Google, damit auch ohne Netz und ohne DSGVO-Diskussion.

## Anpassen

`assets/js/config.js`:

```js
WK.system         // "prod" (web.3doffice.de) oder "test" (rest.3doffice.de)
WK.tokenEndpoint  // eigener Token-Endpunkt, Standard: api/token.php
SHOP              // Name, Adresse, Versandregeln des fiktiven Händlers
```

Beim Aufruf überschreibbar: `?system=test`, `?token={IHR-TOKEN}`.

Für eine echte Installation gehört das Token auf den Server –
`api/token.php` zeigt die kleinste Variante; die Zugangsdaten selbst tauscht
`gettoken_intern.php` aus der WebKatalog-Installation gegen ein Token.

## Sortiment aktualisieren

Produktauswahl und Verkaufstexte stehen in `tools/products.json`. Alles
Technische holt das Build-Skript aus der API:

```bash
python3 tools/build-catalog.py          # Daten + Bilder neu erzeugen
python3 tools/build-catalog.py --skip-images
```

Ergebnis:

```
data/catalog.json     Artikel, Preise, Merkmale, Konfiguration (Reinitstring)
data/img/*.jpg        gerenderte Produktbilder, je Artikel vier Ansichten
data/swatches/*.jpg   Material- und Farbmuster
```

Zur Laufzeit liest der Shop Preise, Merkmale und Bilder live aus der API. Diese
Dateien sind der schnelle erste Seitenaufbau **und** der Notnagel: Fällt die API
aus oder ist kein Netz da, zeigt der Shop weiter Produkte, Preise und Bilder –
nur die Konfiguration ist dann nicht bedienbar. Der Zustand steht in der
Leiste ganz oben (`live` / `Snapshot`).

## Für den Kundentermin

Fünf Minuten, in dieser Reihenfolge:

1. **Startseite** – „Live in 3D konfigurieren“ klicken. Das Modell dreht sich im
   Shop, nicht auf einer fremden Seite.
2. **Produktseite** (NW Rect Schreibtisch) – Plattenfarbe wechseln. Preis,
   Artikelnummer und Bild ändern sich sofort, die 3D-Ansicht zieht mit.
   Danach im Konfigurator selbst etwas umstellen: der Shop-Preis folgt.
3. **Integration-Panel** öffnen – der Interessent sieht die tatsächlichen
   Aufrufe. Das beantwortet die Frage „was passiert da eigentlich?“ ohne Folien.
4. **Markenkatalog** (Sortiment) – über 50 Hersteller im selben Warenkorb.
5. **Kasse → OCI 5.0** – Warenkorb geht ins Beschaffungssystem, samt
   Konfiguration je Position. Das ist das Argument bei Einkaufsorganisationen.

## Was echt ist und was nicht

**Echt:** Artikeldaten, Merkmale, zulässige Werte, Variantentexte, Preise der
Demodaten, gerenderte Bilder, die 3D-Ansicht, der Katalogbaum.

**Fiktion:** Nordwerk selbst, Bestellung und Auftragsnummer, das
Beschaffungssystem in `oci-empfaenger.html`. Die Herstellerserien
(spiegels, Bisley, LD seating, Hammerbacher, Maul) stehen auf „Preis auf
Anfrage“, weil der Demozugang nur für die Demodaten Preise führt – zugleich
zeigen sie den Anfrage-/Lead-Weg.

## Voraussetzungen beim Kunden

* OFML-Datenstand im WebKatalog
* Token-Beschaffung auf dem eigenen Server (`api/token.php` als Vorlage)
* Domain in der CORS-Freigabe, sonst blockiert der Browser die
  postMessage-Kommunikation

Dokumentation: <https://rest.3doffice.de/webkatalog2_5/docs/>
