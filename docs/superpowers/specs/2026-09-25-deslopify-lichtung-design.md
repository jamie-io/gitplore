# Deslopify Lichtung design

The Deslopify jungle (`/p/deslopify`, environment `jungle`) is rebuilt as **Die Lichtung**, the
clearing: a 60 × 45 m bowl with cliffs on three sides, in which the portal, the arch, the exhibit and
the waterfall stand on one south–north axis. The walk keeps its story (slop, the arch, the
original) but shrinks from a 115 m trail to a 58 m tour of about 13 s, and every station is one key
or click away in a station bar.

**Source.** `improvements/V2/Portfolio improvement_ Deslopify-handoff/portfolio-improvement-deslopify/project/Deslopify Lichtung.dc.html`
(Turn 4, "refined 3a"). Its top-down prototype (`#4a`, the script at the bottom of the file) is the
interaction contract; its section (`#4b`) gives the heights; `#4c` is the reusable kit K1–K6; `#4d`
is the Blender asset list. Where this spec and the handoff disagree, this spec wins. The earlier
turns in `Deslopify Jungle.dc.html` are background only.

## Decisions taken with Jamie

- **Kit scope.** The station bar, arrival camera and moment camera (K1–K3) are built as generic,
  reusable engine and UI pieces with a per-scene configuration. Only Deslopify declares stations in
  this project; the hub, plaza and showroom stay unchanged.
- **Plates.** A station's plate (K5) appears as a HUD card while the player stands inside that
  station's trigger. The prototype's right-hand panels ("Im Blick", time inside, walked, glides, the
  beats table) are design-doc instrumentation and do not ship.
- **No click-to-walk.** Clicking the canvas keeps requesting pointer lock. Stations are reached by
  walking, by the chips of the station bar (clickable whenever the pointer is free) and by keys.
- **Lanes.** Complex work goes to `opus-high` subagents; mid-level work to Codex
  (`gpt-5.6-luna`, `xhigh`); fast mechanical work to opencode (`mimo-v2.6-flash-free`). Every
  result is reviewed and fixed before it is merged.

## 1. Layout

### Coordinates

The handoff draws at 10 px = 1 m, so prototype pixels convert directly:

```
x = (px − 320) / 10        z = (py − 240) / 10        north is −z, the portal is south (+z)
```

The arch is the origin. `jungle-layout.ts` drops `MAP_SCALE` and `mapToWorld` and stores metres.
All positions below are metres, `(x, z)`.

| Thing                     | Prototype px                            | World (x, z)                                   | Notes                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Portal / spawn            | (320, 446)                              | (0, 20.6)                                      | Faces north, looking through the arch at the exhibit |
| Lantern post              | (300, 420)                              | (−2.0, 18.0)                                   | On the ledge, just before the ramp                   |
| Station 1 Laterne         | (300, 420)                              | (−2.0, 18.0)                                   | Stand spot 1 m east of the post                      |
| Station 2 Feed-Pfad       | (250, 356)                              | (−7.0, 11.6)                                   | Middle of the marsh boardwalk                        |
| Station 3 Commit-Stufen   | (300, 278)                              | (−2.0, 3.8)                                    | Foot of the steps                                    |
| Station 4 Bogen           | (320, 240)                              | (0, 0)                                         | On the deck under the arch                           |
| Station 5 Exponat         | (320, 154)                              | stand (0, −5.6)                                | Easel at (0, −9.0), screen faces south               |
| Station 6 Feed-Wand       | (404, 120)                              | stand (8.4, −10.6)                             | Wall centre (8.4, −13.0), faces south                |
| Station 7 Höhle           | (320, 24)                               | (0, −21.6)                                     | Stele at (0, −22.0), inside the cave                 |
| Feed cards 1–4            | (228,398) (284,362) (214,330) (292,324) | (−9.2,15.8) (−3.6,12.2) (−10.6,9.0) (−2.8,8.4) | Stand beside the boardwalk, facing it                |
| Tags 1–4                  | (252,378) (238,344) (262,306) (302,282) | (−6.8,13.8) (−8.2,10.4) (−5.8,6.6) (−1.8,4.2)  | Hanging in vines over the boardwalk                  |
| Vines (14)                | see prototype `VINES`                   | convert with the formula                       | Radius = the prototype's third value / 10 m          |
| Bamboo (languages)        | (300,226) (340,226) (300,256) (340,256) | (−2,−1.4) (2,−1.4) (−2,1.6) (2,1.6)            | At the four bridge ends, height = share              |
| Release cairn             | (356, 160)                              | (3.6, −8.0)                                    | Beside the exhibit                                   |
| Liana lever               | (446, 134)                              | (12.6, −10.6)                                  | East of the feed wall                                |
| Fireflies (star lanterns) | centre (320, 124)                       | (0, −11.6)                                     | Swarm over the exhibit glade                         |
| Plunge pool               | ellipse (320,64) r 30×15                | (0, −17.6), radii 3.0 × 1.5                    | Blocks walking                                       |
| Waterfall                 | (310–330, 32–62)                        | x −1.0…1.0, z −20.8…−17.8                      | 9 m tall, falls from the cliff top                   |
| Cave                      | (304–336, 6–42)                         | x −1.6…1.6, z −23.4…−19.8                      | 2.8 m wide inside, 2.6 m tall, 3.2 m deep            |
| Arch trigger              | px 306–334, py 232–248                  | x −1.4…1.4, z −0.8…0.8                         | Installs Deslopify                                   |

### Paths

The walkable paths are polylines in metres (converted from the prototype):

- **Boardwalk (south):** portal (0, 20.6) → (−2.0, 18.0) → (−5.8, 15.2) → (−7.6, 11.4) → (−6.6, 7.8) →
  (−3.8, 5.2), then the commit steps to (0, 2.2) and the deck to the arch (0, 0).
- **North loop:** arch (0, 0) → (0, −9.0) exhibit → (4.6, −11.2) → (9.0, −12.8) wall → (6.0, −15.6) →
  (2.4, −19.2) → (0, −21.0) behind the waterfall into the cave → (−2.4, −19.0) → (−2.8, −14.0) →
  back to (0, −9.0).

The same polylines form the glide graph (section 2) and the scatter exclusion lanes (no plants,
rocks or colliders within 1.4 m of a path).

### Heights

From section `#4b` (22 px = 1 m vertically, water level = 0):

| Stretch        | Height             | Where (z)                                             |
| -------------- | ------------------ | ----------------------------------------------------- |
| Arrival ledge  | +3.0 m             | z ≥ 17.5                                              |
| Ramp down      | +3.0 → +0.3 m      | 17.5 → 14.5                                           |
| Marsh (ground) | +0.3 m             | 14.5 → 5.0, marsh pools as shallow water patches      |
| Boardwalk deck | +0.8 m             | over the marsh, walkable `top` colliders              |
| Commit steps   | +0.8 → +2.4 m      | 11 steps over 4.8 m, from (−3.8, 5.2) to (0, 2.2)     |
| Arch deck      | +2.4 m             | 2.9 m wide, 3.2 m long, over the rill                 |
| Rill bed       | −0.8 m, water at 0 | a 1.8 m wide rill, `M20,238 C160,252 480,226 620,242` |
| North glade    | +1.0 m             | from z −3.4 northward                                 |
| Pool           | water at +0.4 m    | around (0, −17.6)                                     |
| Cliff top      | +9.0 m             | cliff face at z ≈ −19.8, about 30 m wide              |
| Cave floor     | +0.4 m             | inside the cliff                                      |

The bowl is the ellipse centred on (0, 0) with radii 29.2 × 21.4 m. Outside it the terrain rises
into a rim of cliffs and slopes (west, north and east at least 8 m high, the south lip lower behind
the portal ledge), so the edge of the world is never visible from inside. Scatter, floor size,
backdrop and edge colliders shrink to the bowl: nothing is placed or walkable outside the ellipse.

### World size rules (K6), asserted in `jungle-layout.spec.ts`

- The bowl is at most 60 × 45 m.
- The tour portal → 1 → … → 7 along the paths is at most 60 m (target 58 m).
- Consecutive stations are 3–14 m apart along the path (K6 says 4–12 m; the steps sit close to the
  arch and the cave leg runs round the pool, so the bounds are widened for those two legs).
- No dead end is longer than 15 m.
- The portal looks along the axis at the exhibit: the line from the portal to the exhibit passes
  under the arch.

## 2. Stations and glides (K1, K5)

### Contract

A scene may declare stations:

```ts
interface StationSpec {
  readonly id: string;
  readonly name: string; // chip label, e.g. 'Commit-Stufen'
  readonly stand: { x: number; z: number; yaw: number };
  readonly trigger: number; // metres, 3 by default
  readonly plate: StationPlate;
}
interface StationPlate {
  readonly kicker: string; // e.g. 'Station 3'
  readonly title: string;
  readonly text: string; // German, two lines at most
  readonly en: string; // English, one line
}
```

`WorldScene` gains optional `stations?(): readonly StationSpec[]`, `portalStand?()`,
`glidePath?(from, to): Point[]` (defaults to a straight line) and `plateAt?(x, z): StationPlate | null`
for finds that are not stations (languages, cairn, liana). Scenes without stations are unchanged: no
bar, no plate, number keys do nothing.

A generic `StationDirector` (in `features/world/`, three.js-free, unit-tested) tracks per station:
`visited` (entered its trigger once since arrival or restart), `here` (inside its trigger now) and
`next` (the first unvisited station). It exposes these as a signal-friendly snapshot for the
store.

### Glides

- Keys `1`–`8` glide to station 1–8; `0` glides to the portal. A chip click does the same.
- A glide moves the player along the scene's path from where it stands to the station's stand spot,
  eased in and out (`ease = t < .5 ? 2t² : 1 − (−2t + 2)² / 2`), in `clamp(length / 22, 0.7, 1.6)`
  seconds. The player's height follows the terrain and walkable tops, and it faces the direction of
  travel, ending at the stand's yaw.
- Collisions are ignored during a glide, but the scene's `update` runs every frame as usual, so
  triggers fire: gliding past or to the arch installs Deslopify, gliding past the lantern lights it.
- Glides shorter than 0.4 m are ignored. Movement input, `Esc` or a new glide cancel a glide in
  place. A glide under reduced motion is a teleport to the stand spot (the arch trigger still fires
  if the straight segment crosses it, so gliding to stations 5–7 from the south installs
  Deslopify).
- The existing `R` restart stays. The walk-back is removed: `0` or the menu gets the visitor back to
  the portal.
- Deslopify's glide paths follow the boardwalk and the north loop. A glide to the cave from anywhere
  south of the pool enters behind the waterfall through (2.4, −19.2).

### Station bar (HUD)

A centred row of chips, 14 px above the bottom edge, 6 px apart. Each chip is a pill button
(`border-radius 999px; padding 5px 11px 5px 6px; font 500 12px system-ui`) with an 18 px round mark
(`font 600 11px IBM Plex Mono`) and the station name. States, exactly as K1:

| State   | Background         | Border                   | Ink       | Mark background          | Mark ink  | Mark                                                                              |
| ------- | ------------------ | ------------------------ | --------- | ------------------------ | --------- | --------------------------------------------------------------------------------- |
| here    | `#e0a13c`          | `#e0a13c`                | `#1a1408` | `#1a1408`                | `#e0a13c` | number                                                                            |
| visited | `rgb(0 0 0 / 55%)` | `#e0a13c`                | `#f4e6c8` | `#e0a13c`                | `#1a1408` | ✓                                                                                 |
| next    | `rgb(0 0 0 / 55%)` | `#fff`                   | `#fff`    | `#fff`                   | `#1a1408` | number, pulsing ring `0 0 0 (2+2p)px rgba(224,161,60,.2+.25p)`, p = ½ + ½ sin(4t) |
| not yet | `rgb(0 0 0 / 45%)` | `rgb(255 255 255 / 35%)` | `#fff`    | `rgb(255 255 255 / 18%)` | `#fff`    | number                                                                            |

The bar is hidden (opacity 0, 0.4 s transition) until the arrival camera has run 2.6 s or has been
skipped. The pulse stops under reduced motion. Chips are real buttons with `aria-label` "Station n:
name", reachable by Tab, and the prompt and plate move up to stay clear of the bar.

### Plate (HUD)

While the player is inside a station trigger (or near a find, or at the portal) a plate card shows
at the bottom left, above the bar: kicker (`600 12px IBM Plex Mono`, `#e0a13c`, uppercase), title
(`700 32px Barlow Semi Condensed`, `#f4efe4`), German text (`500 18px/1.45 IBM Plex Sans`, `#c9d2cc`),
English line (`400 14px IBM Plex Sans`, `#9aa89f`), on the HUD's dark translucent card. It fades in
and out over 0.25 s (instant under reduced motion). E is never needed to see a station's content.

### Plates (Deslopify)

| Id               | Kicker    | Title             | Text                                                                                                                    | English                                                                                                 |
| ---------------- | --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| portal           | Ankunft   | Deslopify         | Browser-Erweiterung für YouTube. Ersetzt automatisch übersetzte Titel, Thumbnails und KI-Tonspuren durch die Originale. | A browser extension that brings back original YouTube titles, thumbnails and audio. Follow the lantern. |
| laterne          | Station 1 | Die Laterne       | Ihr Licht zeigt unter dem Slop kurz das Original. Sobald du weitergehst, wächst er nach.                                | Its light shows the original for a moment. The slop grows back behind you.                              |
| pfad             | Station 2 | Feed-Pfad         | Vier Karten aus einem Feed, dazu Kapitel, Tonspur, Kanalname und Beschreibung an den Ranken.                            | Four cards from a feed, plus chapters, audio, channel name and description on the vines.                |
| stufen           | Station 3 | Commit-Stufen     | Elf Stufen hinauf zum Bogen, eine pro Zeitabschnitt. Stufen mit Commits leuchten. Bisher {n} Commits.                   | Eleven steps up to the arch, one per period. Lit steps had commits.                                     |
| bogen            | Station 4 | Der Bogen         | Unter dem Bogen wird Deslopify installiert. Ab hier bleibt der Dschungel entslopt.                                      | Walking under the arch installs the extension. The whole clearing is cleaned.                           |
| exponat          | Station 5 | Exponat           | Das Projekt als Poster. E öffnet Details, README und Code.                                                              | The project poster.                                                                                     |
| wand (installed) | Station 6 | Feed-Wand         | E schaltet Deslopify aus und wieder an. So siehst du beide Versionen direkt hintereinander.                             | E toggles the extension for a direct comparison.                                                        |
| wand (not yet)   | Station 6 | Feed-Wand         | Noch voller Slop. Erst unter dem Bogen installieren.                                                                    | Still full of slop. Install under the arch first.                                                       |
| hoehle           | Station 7 | Die Höhle         | Hinter dem Wasserfall steht die Stele. E öffnet das Terminal mit README und Zahlen.                                     | Behind the waterfall: the stele with the README and the numbers.                                        |
| langs (find)     | Fund      | Sprachsäulen      | the project's languages, e.g. `JavaScript 81 % · HTML 16 % · Python 2 % · Shell <1 %`                                   | One bamboo stalk per language at the bridge ends, height = share.                                       |
| cairn (find)     | Fund      | Release-Steinmann | `Noch kein Release.`, or the latest release                                                                             | No release yet. / the English equivalent                                                                |
| liana (find)     | Fund      | Liane             | E zieht an der Liane und schüttelt die Glühwürmchen los.                                                                | Pull it to shake the fireflies loose.                                                                   |

`{n}` and the language and release lines come from the project data, not from constants. Finds show
within 2.6 m (languages 3 m, suppressed while on the deck between the stalks).

## 3. Camera shots (K2, K3)

### Contract

The engine gains `playShot(shot: CameraShot)` and `skipShot()`. A shot is a timeline of weights
and poses; after `rig.sync` has placed the camera each frame, the engine blends the camera from the
rig's pose toward the shot's pose by the current weight (position lerp, orientation slerp, FOV
lerp). The rig keeps following the player underneath, so a shot always hands back without a jump.
Any movement, action or number key while a shot runs calls `skipShot()`, which eases the weight to
0 over 0.3 s (instantly under reduced motion). The engine reports `shotActive` so the HUD can hide
the bar and show titles.

A scene provides `overview(): { position, target, fov }`, the pose that frames its whole layout.
For the Lichtung: high above and behind the portal, looking north down the axis, with the bowl from
the portal to the waterfall in frame at 16:9 (a starting point: position (0, 24, 36), target
(0, 0, −6), FOV as the rig's). The camera lane tunes it by screenshot.

### Arrival camera (K2)

- On arrival the camera holds the overview for 1.2 s, then eases (smoothstep) to the rig's
  shoulder pose over 1.8 s. The weight is 1 for 0–1.2 s and falls to 0 by 3.0 s.
- A pitch shows over it: the project's name (`800 64px Barlow`, white, soft shadow) and one line
  (`500 18px system-ui`, `#f4efe4`), for Deslopify "YouTube ohne KI-Übersetzung · YouTube without
  AI translation". Its opacity is `clamp(min((t − 0.15) / 0.4, (2.7 − t) / 0.4), 0, 1)`.
- It plays on the first visit per scene per browser session (`sessionStorage`
  `gitplore.arrival.<sceneId>`, every access in try/catch; failing storage means it plays). Later
  visits, restarts (`R`) and portal glides start at the shoulder.
- Under reduced motion the overview holds for 1.2 s and then cuts to the shoulder.
- The player cannot move during the first 1.2 s except by skipping; any input skips.

### Moment camera (K3)

- One per scene, for its key event. Deslopify's is the install: when the arch trigger fires, the
  camera eases up to the overview (0.5 s), holds while the ring runs across the bowl, and eases
  back (0.5 s), 2.6 s in all.
- A banner shows at the top centre for the same time: amber pill (`#e0a13c`, ink `#1a1408`,
  `600 14px system-ui`, padding 7 px 14 px) reading "Deslopify installiert · der Dschungel wird
  entslopt".
- Any key skips it. Under reduced motion it cuts to the overview and cuts back after 2.6 s.
- It plays every time Deslopify is installed from the arch (after a restart too), but not when the
  wall switches it back on.

## 4. Deslopify flow

`deslopify.flow.ts` keeps its shape (pure, three.js-free) with new constants in metres, from the
prototype:

| Constant                        | Value                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lantern ignition radius         | 2.6 m                                                                                                        |
| Lantern light radius (once lit) | 8 m; things within 0.7 R clear fully, fading to R                                                            |
| Ring speed                      | 17 m/s from the arch; shrinks at 24 m/s when switched off                                                    |
| Ring maximum                    | 72 m (covers the whole bowl from the arch or the wall)                                                       |
| Ring visible                    | while < 70 m, opacity `1 − r/70`                                                                             |
| Cards                           | in 2.2/s, out 0.9/s; original when w > 0.5                                                                   |
| Wall cards (i = 0…3)            | in `2.4 − 0.35 i` /s, out `1.2 + 0.2 i` /s                                                                   |
| Tags                            | in 2.6/s, out 1.2/s; flip `scaleX = max(0.05,                                                                | cos(w π) | )`  |
| Vines                           | retreat 3/s, regrow 0.35/s                                                                                   |
| Commit steps                    | a step lights (permanently until restart) when the player is within 2.4 m; lit steps with commits glow amber |
| Stations visited                | within the station's trigger (3 m)                                                                           |

Changes to behaviour:

- **The north half starts in slop too.** Cards on the wall, vines and haze all start slopped; the
  ring from the arch visibly clears the north glade. The slop thinning over the north bank
  (`NORTH_BANK_HAZE`) goes.
- **Toasts.** A short line at the top centre for 2.2 s, fading over the last 0.4 s
  (`rgb(0 0 0 / 72%)`, border `#e0a13c`, ink `#f4e6c8`, `500 13px IBM Plex Mono`): "Die Laterne
  leuchtet auf" on ignition, "Hinter dem Wasserfall" on entering the box x −1.2…1.2, z −21…−18.2,
  "Deslopify aus: der Slop wächst zurück" and "Deslopify an: neuer Ring von der Wand" at the wall,
  "Die Glühwürmchen stieben auf" at the liana.
- **Fireflies.** 14 over the exhibit glade (ellipse around (0, −11.6)), drifting; within 11 m of the
  lit lantern they gather around the player. Pulling the liana bursts them outward, decaying over
  1.25 s. They are brighter once Deslopify is installed. Counts may scale by tier.
- **Wall.** Unchanged in logic: E toggles only once installed, off shrinks the ring and lets the
  slop regrow, on starts a new ring at the wall. The try-in-world demo still leads to the wall.
- **Status line** keeps `Deslopify {noch nicht|an|aus} · Entslopt n/8`.
- **Exhibit E** keeps opening the project's info page. The stele keeps its terminal.

## 5. Ground haze (K4)

The slop no longer tints the whole scene's fog. `breathe()` keeps the jungle's own mood
(`DSCHUNGEL`) and only a light global tint while slop is present. The slop lives in a ground haze:

- A height-limited layer from 0 to 2.2 m above the local ground, dense at the ground and thinning
  with height (it is gone by 2.2 m), in the slop violet (`oklch(0.5 0.17 330)` ≈ `#8e3f86`,
  about 0.42 opacity at full density on a long ray).
- Masked by area: only inside the bowl, never as distance fog over the whole scene, so the overview
  and aerial shots stay readable.
- Cleared by the same mask that wipes the cards: transparent within 0.7 R of the lit lantern,
  opaque from R; transparent inside the ring, opaque from ring + 4 m. It uses the shared
  `clearing` uniforms and the lantern's position and radius.
- It works on every tier and under SwiftShader (no WebGL2-only features without a guard), and costs
  at most one extra full-screen-sized pass or one shader term in the existing atmosphere patch.
  Loaded models go through `HazedCopies` as before.

## 6. Models (Blender)

Built with `scripts/blender/kit.py`, one script per model in `scripts/blender/models/`, registered in
`scripts/blender/author.py` and under `jungle` in `scripts/lib/environment-models.mjs`. Vertex-colour
AO, no textures, one to three materials, meshopt. The procedural build stays as the fallback until
the model arrives. Report triangles and compressed size.

| Model                                                                    | Status · budget   | Build                                                                                                                                 | Named parts the game reads                                     |
| ------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `jungle-arch`                                                            | reuse · refit     | Check it fits the 2.9 m deck and a 3.2 m clear opening; adjust the script if not                                                      | `arch-glow` (existing)                                         |
| `lantern`, `stele`, `card-frame`, `cairn`, `liana-lever`, `jungle-rocks` | reuse             | Moved to their new spots                                                                                                              | existing                                                       |
| `commit-steps`                                                           | new · ≤ 2.5k tris | Eleven boardwalk steps rising from +0.8 m to +2.4 m over 4.8 m, with rope rails; one module per step                                  | `step_00`…`step_10`, material `inlay` for the commit glow      |
| `feed-wall`                                                              | new · ≤ 2k        | Stone wall 5.6 m wide and 2.6 m tall, four slots sized to `card-frame`, a switch lever                                                | empties `slot_0`…`slot_3`, `lever` with its pivot at the hinge |
| `cave-cliff`                                                             | new · ≤ 5k        | Cliff face about 30 m wide and 9 m tall, with a cave 2.8 × 2.6 m and 3.2 m deep behind the waterfall notch; faceted rock via kit cuts | `cave_floor`, a low-poly `collider` mesh                       |
| `exhibit-easel`                                                          | new · ≤ 1k        | Wooden easel frame with a 3.4 × 2.4 m opening around the existing `ScreenLandmark`                                                    | empty `screen_anchor`                                          |

The explorer stays procedural. Terrain, flora, vines, tags and the waterfall stay procedural.

## 7. Removed or moved

- Commit ridge → the commit steps up to the arch (the jungle skin of `commit-ridge` becomes the
  steps, or the steps replace the ridge in the jungle's `toyLayout`).
- Language pillars → four bamboo stalks at the bridge ends.
- Stele / terminal → inside the cave, reached behind the waterfall.
- Star lanterns → the firefly swarm over the exhibit glade.
- Seed lever → the liana next to the feed wall.
- The brook, the long stream, the south-bank trail, the north trail and spurs, the light shafts'
  hard-coded positions and the 200 m floor go; the rill replaces the stream.
- The test hook `deslopify:bridge-south` moves to a point 3 m south of the arch on the new steps.

## 8. Quality, accessibility, performance

- Reduced motion: glides teleport, shots cut, the bar's pulse stops, all wipes and rings snap, as
  today.
- Tiers: the jungle's foliage counts scale down to the bowl's area (the bowl is about a tenth of
  today's floor), so per-tier budgets hold or improve. Low tier: no shadows, fewer fireflies.
- The HUD additions are keyboard reachable, have visible focus, and meet the existing `a11y:check`.
- No new runtime dependencies; the initial bundle stays within `scripts/check-budget.mjs`.

## 9. Testing

- Unit (Vitest via `ng test`): layout (K6 rules, coordinates, heights, walkability of the rill only
  on the deck), glide path and timing, `StationDirector` states, shot weight timeline and skip,
  flow constants and transitions (north starts slopped, steps, fireflies, toasts), HUD bar states
  and plate, input keys `0`–`8`.
- E2E (Playwright, `tests/deslopify.spec.ts`): load `/p/deslopify`, skip the arrival camera, glide
  to station 4 and see the status flip to `Deslopify an` and the moment banner, glide to 6 and
  toggle with E, press `0` and arrive at the portal, press `R`. `tests/worlds.spec.ts` stays green
  for the other worlds.
- Gate: `npm run verify`, the Deslopify and worlds e2e specs, then screenshots of the running game
  (overview, portal view through the arch, boardwalk, steps, exhibit, wall, cave) at medium and
  high tier.
- Baseline: pre-existing test failures on `main` (the `localStorage.clear` failures under Node 25)
  are recorded before work starts, and no new failures may be added.

## 10. As built (decisions taken during implementation)

These override the sections above where they differ.

- **Tour and legs.** Keeping every path at least a player radius clear of the feed wall, the pool, the
  cave's jambs and the exhibit easel lengthens the tour to about 61 m (bound 62 m) and the wand →
  höhle leg to about 14.7 m (bound 16 m). The north loop forks in front of the exhibit and passes
  round both sides of the easel, and reaches the feed wall by a short spur from its west end.
- **Stands.** Laterne (−1.3, 17.3), turned 50° up the walk so the lantern post stays in frame and
  the spawn lies outside its trigger; wand (8.4, −12.0); the lantern post at (−2.6, 18.5), off the
  walk line.
- **Return portal.** Stands in a niche cut into the south rim at (0, 23.6), behind the arrival point
  (0, 20.6), through the optional `Environment.returnPortal`. The spawn is outside every station
  trigger, so the portal plate shows on arrival and turning round shows "Zurück".
- **Overview.** (0, 30, 27) → (0, 0, −4), used by both the arrival and the moment shot. The canopy
  keeps a clear view corridor of 4 m either side of the axis, and nothing tall stands behind a
  station's camera.
- **Skipping shots.** A shot is skipped only by input that starts after it began (a new key press or
  a movement start), so walking through the arch with W held still shows the install moment. Esc
  during a shot skips it and then leaves the world as usual.
- **Reduced motion.** A glide is a teleport, and its route along the paths is still checked for the
  arch, the lantern, the commit steps and the falls, so the same things happen as on a full glide.
- **Feed wall.** The Blender wall holds the four cards at 0.52 scale on a 5.6 m wall; the cards wipe
  at the flow's own rates.
- **Arch.** The model is unchanged: a 3.92 m clear height with its pillars at ±1.4 m on the 2.9 m
  deck; the colliders stand on those pillars.
- **Ground haze.** Marches 4 steps on the low tier (about 16 % of a SwiftShader frame), 10 on medium,
  16 on high. The bowl's radii live in a small module of their own, so other worlds do not load the
  jungle layout.
