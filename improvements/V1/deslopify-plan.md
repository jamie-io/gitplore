# Deslopify Jungle implementation plan

> For implementation agents. Work in isolated worktrees per wave. Preserve German repository conventions, existing public interfaces, and no-new-runtime-dependencies constraint.

## Goal

Turn Deslopify from a static red card wall beside a generic jungle into a south-bank-to-north-bank journey whose world state responds to player position. Player walks to an unlit lantern, follows a boardwalk through the south-bank jungle, crosses an arch over a stream, and watches an amber clearing ring deslopify cards, tags, vines, and atmosphere. North-bank wall, exhibit/poster, cave, terminal, rail, bamboo, cairns, water, and fireflies remain explorable. At the wall, `E` toggles Deslopify off; slop grows back across the whole jungle. `E` again starts a fresh ring at the wall. `R` restarts the flow.

This file is sole design reference for implementers. Primary source is `improvements/Portfolio improvement_ Deslopify-handoff/portfolio-improvement-deslopify/project/Deslopify Jungle.dc.html`, especially Turn 2 / `#2a`. `Deslopify Lookdev.html` supplies renderer, shader, layout, and tier values. The primary Turn 2 four-card data below overrides Lookdev's three-card sample data.

## Architecture

- Keep `JungleEnvironment` as shared environment foundation. Add Deslopify-specific south-bank composition and stateful flow in project layer.
- Keep procedural vines and tags. They do not require authored models.
- Treat top-down prototype as interaction contract and unit-test constants, state transitions, timers, prompts, and bilingual event strings against it.
- Treat Lookdev implementation as visual contract: smooth indexed ground, foliage translucency/wind, lantern construction, procedural vines, procedural tags, card wipe shader, rail posts, fireflies, and three quality tiers.
- Put canonical Deslopify content in a project data module. Shared toys receive environment/project skins without changing repository data semantics.
- Use current repository Three.js `0.186.0` and existing Angular/engine abstractions. Do not add runtime packages or copy Lookdev's `three@0.170.0` dependency.
- Do not let Deslopify's world-mode `E` flow capture movement input. Existing demo capture remains available for projects that use it.

## Tech stack and stop condition

- Angular 22, TypeScript strict mode, Three.js `0.186.0`, Vitest through `ng test`.
- WebGL2 where available; WebGL1/SwiftShader-safe fallbacks remain valid.
- Existing `CapabilityService` owns tier detection and one-time performance step-down.
- Existing `PostStack`, `SharedUniforms`, `Mood`, `ProceduralGround`, `Water`, `Waterfall`, `Explorer`, `ScreenLandmark`, HUD, scene director, and project-scene contracts remain integration points.
- No source file outside this plan may be modified during planning. Implementation waves below own source files explicitly.
- Complete when required waves merge, all listed specs pass, `/p/deslopify` is restartable and reduced-motion-safe, shared worlds retain current behaviour, production build passes budget, and optional assets are either integrated or explicitly skipped.

## Canonical experience

### Turn 2 composition

Title: `Der Weg durch den Slop · The way through the slop`.

South bank starts in violet haze. Boardwalk starts at an unlit lantern. Four feed cards sit along trail. Procedural vines hang around trail and banks. Tags expose chapter, audio, channel, and description metadata. A bridge arch spans horizontal stream. Walking under arch installs Deslopify and starts amber ring at arch. Haze lifts. Every card, tag, and vine transitions to original/cleared state and remains there.

North bank contains feed wall, exhibit/poster, terminal stele, waterfall/cave, rail, bamboo, cairns, and star lanterns/fireflies. Wall `E` toggles effect off; slop grows back across whole jungle. Wall `E` again starts fresh ring from wall.

### Top-down interaction contract

These values are map pixels and seconds, not world metres. Preserve them for flow model and convert consistently into 3D placement/scales.

- Map `960×680`; background `#22301f`.
- Controls: `click into the map · WASD / arrows · Shift runs · click to walk · E use · R restart`.
- North area `y=0..60`, fill `#34443a`.
- Stream horizontal `y=298`, height `40`, fill `#4f8b93`, top border `#8cc3c8`.
- Bridge `x=468..512`; arch rectangle `x=464`, `y=288`, width `52`, height `60`.
- Bridge trigger: `x>468 && x<512 && y<326`.
- Arch ring origin: `ARCH=[490,317]`.
- Trail: `[[490,672],[390,560],[470,440],[490,344],[490,290],[570,210],[530,125]]`; stroke `#5a3d27`, width `16`, round caps.
- Lantern post `POST=[452,630]`; lantern lights when distance is `<44` map pixels.
- Lantern light radius `LIGHT R=84` map pixels after ignition. Visual diameter `R*2.6`.
- Haze: transparent radius `60px` to black radius `110px`; no lantern means no haze mask.
- Player movement normal `95px/s`; Shift `170px/s`; bounds `x=10..950`, `y=70..670`.
- Stream crossing allowed only bridge; stream occupies `y=294..342`.
- Ring starts at current origin; speed `340px/s`; maximum `1400px`; visible while `<1300`; opacity `1-ring/1300`.
- 3D direction 1a describes the ring as about `8m/s`; use the top-down `340px/s` contract for deterministic flow tests and calibrate the 3D scale to approximately `8m/s`.
- Haze target `max(0,1-ring/700)` when ring installed/on, otherwise `1`; ease by `dt*2`.
- Global clear condition: player distance to current ring origin `< ring`.
- Vines clear if lantern radius or global ring reaches them; retreat `grow -= dt*3.2`; regrow `grow += dt*.33`; clamp `0..1`; visual diameter `r*2*(.25+.75*grow)`; opacity `.15+.85*grow`.
- Tags: lit/global `w += dt*2.6`; unlit/slop `w -= dt*1.4`; clamp `0..1`; viewed state flips using `scaleX(abs(cos(w*pi)))`.
- Cards: lit/global `w += dt*2.2`; unlit/slop `w -= dt*1.1`; original when `w>0.5`; feed wipe uses `w`.
- Card sequence starts `120ms` apart; seam at `180ms`; complete visual wipe at `360ms` per card. Reduced motion is instant.
- Rail posts light when player distance `<36` map pixels; visual size `5+b*3`.
- Rail buckets: `[1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0]`.
- Fireflies: `18` in top-down model; lantern within `<170` map pixels makes them follow. Visual `4×4` map pixels plus glow.
- Card positions: `[[352,584],[352,494],[505,480],[432,390]]`.
- Wall `WALL=[685,177]`.

### 3D Lookdev values

Use existing world coordinates and placement helpers. Values below are exact visual targets from Lookdev unless top-down flow values explicitly govern interaction.

#### Palette

| Name | Hex / value |
|---|---:|
| zenith | `0x4f8580` |
| horizon | `0x86ad98` |
| glow | `0xe8ffc0` |
| below | `0x3d5a45` |
| fog | `0x7ba592` |
| hemisphere sky | `0x98c6a2` |
| hemisphere ground | `0x34482a` |
| sun | `0xf2ffd0` |
| amber | `0xe0a13c` |
| wood | `0x5a3d27` |
| slop | `0x9a3f8d` |

Shared Turn 1 palette: old theme `#8f2f2f`; final theme/labels ridge `#6b4712`; original/mood `#e0a13c`; slop `oklch(0.52 0.19 335)`; wood `#5a3d27`; stele `#141b17`; ink `#f4efe4`; engraving `#f4e6c8`; slop line `oklch(0.68 0.19 335)`. Deslopify override target: `theme.primary='#6b4712'`, `theme.accent='#f4e6c8'`.

#### Renderer, atmosphere, lighting

- Renderer ACES Filmic tone mapping, exposure `1`.
- Lookdev scene `FogExp2` density `.03`; preserve current Jungle mood fog where shared contracts require it.
- Lookdev camera FOV `60°`, near `.1`, far `400`; orbit distance `5.2`, target y `1.35`, pitch `.22`. Existing shared engine defaults are FOV `70`, far `500`, boom length `3.6`, boom height `.35`; do not globally change them without cross-world tests. Prefer Deslopify placement/profile first.
- Sky sphere radius `300`, segments `32×16`.
- PMREM environment sphere radius `10`, segments `32×16`, environment intensity `.55`.
- Hemisphere intensity `.85`.
- Sun intensity `2.3`; shadow half extent `26`; near `1`; far `90`; bias `-.0004`; normal bias `.03`.
- Existing Jungle mood uses sun `2.4`, hemisphere `.95`, shadow half extent `64`, far `250`, normal bias `.05`; scope changes to Jungle/Deslopify only and prove other moods unchanged.
- Grade saturation `1.12`, contrast `1.06`, warmth `-.02`, vignette `.28`, bloom `.5`.

#### Ground

- Plane `90×90`, segments `180×180`, shifted `z=-12`.
- `pathX(z)=sin(z*.09)*1.6`.
- Smooth path height range `1.4..3.6`.
- Base height `.35*sin(x*.21)*cos(z*.17)+.18*sin(x*.53+z*.31)+.08*sin(x*1.3-z*1.1)`.
- Outside `abs(x)>11`, add `pow(max(0,abs(x)-11),1.4)*.18`.
- Below `z<-33`, add `pow(max(0,-z-33),1.2)*.4`.
- Colours moss `0x3b5a2f`, soil `0x4a3f2a`, dark `0x26361f`.
- Keep indexed geometry; call `computeVertexNormals()`; sample `colorAt` per vertex. Do not restore current `toNonIndexed()` / per-face triangle colours; this fixes SwiftShader faceting.
- Noise shader: wet detail absent for `detail<.5`; otherwise `smoothstep(.6,.72,.65*vnoise(p*.3)+.35*vnoise(p*1.25))`. For `detail>.5`, diffuse `.82+.36*vnoise(vWP*3.7)`. For `detail>1.5`, litter `smoothstep(.78,.84,vnoise(vWP*8.5))`, mix `vec3(.30,.21,.10)` at `.6*(1-wet)`. Wet darkens `mix(1,.55)`, roughness `.08`; dapple detail `>.5`.

#### Foliage and vines

- Seven leaf variants `PlaneGeometry(.34,1.25,2,8)`; instanced max plants `1800`, canopy `200`.
- Tier-visible plants/canopy: low `320/40`, medium `900/110`, high `1400/200`.
- Greens `0x3f7a34`, `0x4f8a3a`, `0x2f6a36`, `0x5d8f3c`, `0x356f45`.
- Plant scatter x `±17`, z `9..-33`; avoid path distance `1.9`; scale `.55 + pow(rng,1.6)*2` off path.
- Canopy scale `2.5..5`, y `7..11`; `18` trunks, bark `0x3a3226`, heights `10..14`.
- Wind `sin(uTime*1.25+root.x*.6+root.z*.45)` plus second `sin` term at frequency `3.3`; player bend `smoothstep(1.4,.15,pd)*h*.5*uPush`; translucency detail `.5..1.5` `.7`, detail `>1.5` `1.1`.
- Vines remain procedural: `26`; z `3-(i/26)*25+(rng-.5)*1.2`; x `pathX(z)+(rng-.5)*5.5`; top `5.6..6.8`; length `3.6..5`; seven Catmull-Rom points; TubeGeometry `40`, radius `.03+.025`; slop roughness `.45`, emissive `0x5a1a58`, intensity `.4`; bud radius `.07`, dark `#1a0418`, emissive `#ff5ae6`, intensity `2.4`; minimum grow `.06`; 3D clear `2.6/s`, regrow `.3/s`; preserve top-down rates in flow logic.
- Final mixed direction blends slop mood toward `DSCHUNGEL` as ring clears. Vines are visual only and never block movement; the bridge/stream rule is the only crossing gate.

#### Boardwalk, rail, water

- Boardwalk `108` planks; z `8-i*.32`; x `pathX(z)`; RoundedBoxGeometry `1.45×.07×.27`, segments `2`, bevel `.02`; y `.24±.015`.
- Wood tones `0x6a4a30`, `0x5a3d27`, `0x70523a`, `0x4f3622`, `0x634630`.
- Rail posts `22`; z `7.5-i*1.5`; x `pathX(z)+.9`; cylinder `.06/.07`, height `1`; actual height `.55+b*.35`; cap sphere `.07`.
- Waterfall Lookdev plane `4.2×15`, position `(.6,7.2,-35.2)`, pool radius `4.2`. Existing Waterfall remains source of truth for lifecycle.
- Existing Water constants remain: depth tint `1.4`, foam depth `.25`, edge fade `.15`, segments `48/96/160`, rings `4/8/12`, ripple `e=.08`, amplitude `.035`, glint exponent `320*4`; Waterfall lip speed `1.2`, gravity `9.81`, rows `10/16/24`, columns `8`, fall speed `3`, aeration `.9`, foam lift `.03`, mist `90`.

#### Lantern

- `LANTERN_POST=(2.3,0,4.2)`.
- Post cylinder `.07/.09`, height `2.1`, y `+1.05`; arm box `.5×.05×.05`, x `-.22`, y `+2.02`.
- Metal `#2c2a22`, roughness `.4`, metalness `.7`.
- Base cylinder `.12/.14×.05`; roof cone `.15×.14` at y `.33`; torus `.05/.012` at y `.44`; glass cylinder `.1/.1×.24` at y `.15`; bars `.018×.26×.018`, radial `.11`.
- Body offset `(-.42,1.5,0)`.
- Point light `0xffb45a`, distance `11`, decay `1.6`, intensity `glow*7`; glass emissive `#ffa640`, intensity `glow*3.2`.
- Ignition radius `2.2m`; transition `.7s`; carried after `.9s`; carry rate `2.2`; 3D light radius `5.5`; on-post radius `2.5`.
- Fireflies max `160`; initial x `±13`, z `8..-30`, y `.6..3.2`; follow within `9m`; offsets `.9..1.9`; size `.16`.

#### Cards, tags, labels, poster, stele

- Card face `1.9×1.78`; rounded frame `2.1×1.98×.14`, segments `3`, bevel `.05`; face plane `1.92×1.8` at y `2.05`, z `.075`; posts x `±.85`, y `.55`, z `-.04`, cylinders `.07/.09`, height `1.3`.
- Card canvas `640×600`; outer slop `#9a3f8d` / original `#e0a13c`; inner `#f4f2ee`; thumbnail `(24,24,592,333)`, radius `12`.
- Thumbnail word Barlow `86px` if length `>8`, otherwise `140px`; sub IBM Mono `30px`; slop thumbnail `50px Arial`; badge `24px system`; duration `24px Mono`; avatar radius `30`; title `38px Barlow`, max width `500`, line height `44`; metadata `26px`; badge `22px`.
- Wipe uniform `uWipe`; `e=uWipe*1.08-.04`; seam `exp(-abs(e)*70)`; seam colour `vec3(1,.6,.22)*4`.
- Tag canvas `512×240`; plane `.9×.42`; outer slop `#9a3f8d` / original `#e0a13c`; inner `#efe8ee` / `#5a3d27`; IBM Mono `24px`; Barlow Semi Condensed `50px`; wrap `440`; line height `56`.
- Lookdev tag animation rate is `+2.2/-1.2` per second; top-down interaction rate above remains canonical for the map flow. Lookdev card progress rate is `1.3/s`; implement the required 360ms visual timeline and top-down `+2.2/-1.1` state contract as the externally tested behaviour.
- Labels: use `ctx.font='700 120px "Barlow Semi Condensed"'`; measured width plus padding, ceil, next power of two; no max width; plane width `HEIGHT*w/CANVAS_H`; await `document.fonts.load` with test fallback.
- Plank title `Commits im Lebensverlauf`; subtitle `Commits over the project's life`; title `40px`; subtitle `20px`.
- Poster width `620px`, aspect `16/10`, padding `30px 32px`, columns `1.25fr 1fr`, gap `26px`, outer shadow `0 0 0 10px #0b0f0d`, bg `#141b17`; heading `50px Barlow`, body `15px`, English italic `13px`, comparison `18px`, labels `10px`, URL `13px`.
- Stele canvas `1024×640`; body `44px`, max `5` lines; case `540×348`, screen `512×320`, case radius `18px`; case pad `14px`; screen pad `22px 24px 16px`; centre about `2.1m`; tilt back `12°`; pitch about `0`; four dots of `8px`; keycaps `↑↓` + `blättern`, `Esc` + `verlassen`.
- Current/old stele reference is the same `1024×640` canvas with body `36px` and `8` entries per page; final target replaces it with body `44px`, max `5` lines, and dots/keycaps.

## Exact content and strings

### Four canonical feed cards

These records are canonical. Store both slop/original strings and all presentation metadata; do not infer copy from current `EXAMPLE_VIDEOS`.

| # | Slop title | Original title | BG | Word / colour | Subtext | Slop thumb | Avatar / BG | German metadata | Duration | Channel |
|---:|---|---|---|---|---|---|---|---|---:|---|
| 1 | `Rost in 100 Sekunden` | `Rust in 100 Seconds` | `#1b1d1f` | `RUST` / `#e0a13c` | `in 100 seconds` | `ROST IN 100 SEKUNDEN` | `F` / `#b5532a` | `ferris.dev · 1,2 Mio. Aufrufe · vor 3 Jahren` | `1:40` | `ferris.dev` |
| 2 | `Ich habe eine Tastatur von Kratzer gebaut` | `I built a keyboard from scratch` | `#2f5d57` | `SCRATCH` / `#f4efe4` | `keyboard build` | `VON KRATZER` | `K` / `#2f5d57` | `keeb lab · 418.000 Aufrufe · vor 1 Jahr` | `18:22` | `keeb lab` |
| 3 | `Warum der Himmel blau ist` | `Why the sky is blue` | `#2b5f8f` | `BLUE?` / `#f4efe4` | `rayleigh scattering` | `WARUM BLAU?` | `S` / `#2b5f8f` | `sky physics · 86.000 Aufrufe · vor 2 Jahren` | `9:05` | `sky physics` |
| 4 | `Git Basis neu, erklärt` | `Git rebase, explained` | `#26262e` | `REBASE` / `#86e0cf` | `git rebase -i` | `BASIS NEU` | `G` / `#6b4712` | `git gud · 240.000 Aufrufe · vor 5 Jahren` | `12:31` | `git gud` |

Translated badge: `Automatisch übersetzt · Audio: Deutsch (KI)`. Original badge: `Original · Englisch`. Captions: `ÜBERSETZT · translated` and `ORIGINAL`.

### Four canonical tags

1. Slop `Kapitel · übersetzt`, original `Kapitel · original`; details `Kapitel 3: Die Platine löten` / `Chapter 3: Soldering the PCB`.
2. Slop `Tonspur · KI`, original `Audio · original`; details `Deutsch (KI-Synchronisation)` / `English (original)`.
3. Slop `Kanalname · übersetzt`, original `Channel · original`; details `Schlüsselbrett-Labor` / `keeb lab`.
4. Slop `Beschreibung · übersetzt`, original `Description · original`; details `In diesem Video bauen wir …` / `In this video we build …`.

Tag fixture positions: `[[470,622],[430,598],[400,566],[408,530],[432,492],[456,456],[476,412],[488,372],[360,622],[532,600],[542,500],[350,450],[520,250],[455,205],[590,215]]`.

### Vines, prompts, events, map strings

Vine fixture data: `[[470,622,16],[430,598,18],[400,566,16],[408,530,20],[432,492,16],[456,456,18],[476,412,16],[488,372,18],[360,622,14],[532,600,16],[542,500,18],[350,450,16],[520,250,14],[455,205,16],[590,215,12]]`.

Spot fixtures: stele `{x:561,y:374,r:62}`, pull `{x:400,y:240,r:46}`, wall `{x:685,y:177,r:82}`, exhibit `{x:365,y:156,r:60}`, cave `{x:531,y:84,r:46}`, bamboo `{x:615,y:442,r:64}`, cairn `{x:320,y:412,r:54}`.

Prompts: `Liane ziehen`; wall `Deslopify ausschalten` / `Deslopify einschalten`; stele `Terminal bedienen` / `Terminal verlassen`; exhibit `Details, README & Code`; cave `Höhle betreten`; lantern `Laterne löschen` / `Laterne anzünden`.

Exact event pairs:

| German | English |
|---|---|
| `Ankunft am Südufer` | `Arrived on the south bank` |
| `Laterne entzündet` | `The lantern lights up as you come near` |
| `Deslopify eingeschaltet: die Lichtung breitet sich aus` | `Deslopify on: the clearing spreads out from the arch` |
| `Ranken ziehen sich vor dem Licht zurück` | `Vines pull back from the light` |
| `Tag: ${t.tO}` | `Tag flipped from “${t.tS}”` |
| `Karte: ${orig}` | `Card wiped from “${slop}”` |
| `Geländer leuchtet: Commit-Verlauf` | `Rail posts light up: commit history` |
| `Die Stele erwacht` | `The stele wakes up and shows page 1` |
| `Bambus raschelt: Sprachen` | `Bamboo rustles: languages` |
| `Steinmännchen: noch kein Release` | `Cairn: no release yet` |
| `Liane gezogen: Unterholz neu gewachsen` | `Liana pulled: the undergrowth reshuffles` |
| `Deslopify aus: der Slop wächst zurück` | `Deslopify off: the slop grows back` |
| `Deslopify an: neuer Ring von der Wand` | `Deslopify on: a new ring from the wall` |
| `Terminal bedient` | `Terminal takes the controls` |
| `Panel öffnet /p/deslopify/info` | `The project panel opens` |
| `Höhle hinter dem Wasserfall` | `The cave behind the waterfall` |

### HUD, map, poster, terminal copy

HUD title `Dschungel — Deslopify`. Buttons `Grafik`, `Auto`, `Niedrig`, `Mittel`, `Hoch`. Start title `Deslopify · Lookdev`. Start instruction `Geh zur Laterne rechts vom Steg. / Walk to the lantern right of the boardwalk.` Small hint `click to start · WASD · drag to look · E lantern`. Help `WASD gehen · Shift laufen · Maus ziehen: umsehen · E Laterne`. Toasts `Laterne entzündet · Lantern lit`, `Laterne an · Lantern on`, `Laterne aus · Lantern off`, `Tag dreht sich um · Tag flipped to original`, `Original: ${orig}`, `Grafik automatisch reduziert · Quality stepped down`. State `Laterne an/aus · Deslopify an/aus/noch nicht`; progress `Entslopt`.

Map labels: `NORDUFER · north`, `SÜDUFER · south`, `Dschungel — Deslopify`; focus overlay `Click into the map to walk`, `Go to the lantern first, then follow the boardwalk north`; view labels `Im Blick · what the camera sees`, `Original`, `Übersetzt · translated`, `Stele · terminal`; no-reach `Nothing in reach. Walk up to a card, a tag or the stele.`

Poster copy: `Projekt · Browser-Erweiterung`; `Deslopify`; German `Browser-Erweiterung, die von YouTube automatisch übersetzte Titel, Thumbnails, Beschreibungen und Tonspuren durch die Originale der Urheber ersetzt.`; English italic `Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.`; chips `JavaScript`, `Chrome Extension`, `MV3`; comparison `OHNE · WITHOUT`, `Ich habe eine Tastatur von Kratzer gebaut`, `↓`, `MIT · WITH`, `I built a keyboard from scratch`; URL `github.com/jamie-io/deslopify`; key `E`; link `Details, README & Code`.

Stele page 1:

```text
Deslopify
Browser-Erweiterung, die von YouTube automatisch
übersetzte Titel, Thumbnails, Beschreibungen und
Tonspuren durch die Originale der Urheber ersetzt.
https://github.com/jamie-io/deslopify
Seite 1 von 4 · ↑ ↓ blättern · E oder Esc: verlassen
```

Final stele UI uses four dots and visible keycaps `↑↓` + `blättern`, `Esc` + `verlassen`; prototype hint `Seite 1 von 4 · ↑↓ blättern · Esc verlassen` may remain only if it fits. Preserve four pages and existing repository content for pages 2–4.

The top-down page-1 presentation also includes heading `Projekt · Project`, summary `Ersetzt von YouTube automatisch übersetzte Titel, Thumbnails, Beschreibungen und Tonspuren durch die Originale.`, URL `github.com/jamie-io/deslopify`, and hint `Seite 1 von 4 · ↑↓ blättern · Esc verlassen`. Use the final dots/keycaps treatment when the hint would duplicate controls.

### Current seven problems and required resolution

1. Fixed `1024×256` label with max width and no attached fit → D2 measured canvas and matching plane.
2. Empty exhibit is a dark red plane → D2 exact poster fallback.
3. Wall is hue blocks/title-only with a `0.3s` squash → D8 four feed cards, metadata, thumbnails, and `uWipe` wipe timeline.
4. Terminal is brightest/largest, uses small type, and forces camera up from below → D3 stele dimensions/type/tilt/placement.
5. Signs repeat wall pairs on one line → D8 canonical card/tag data and distinct chapter/audio/channel/description tags.
6. Primitives have no labels → D2 measured plank label and D3/D4 named stele, liana, bamboo, cairn, lantern surfaces.
7. Red `#8f2f2f` theme turns brown-grey against amber `#e0a13c` → D1 final `#6b4712`/`#f4e6c8` shared surface palette and slop/original separation.

### Shared-world inventory

- Current repo override selects Jungle for Deslopify; do not assume Jungle-specific changes are safe globally.
- `ProceduralGround` is consumed by Jungle, Showroom, Plaza, and shared Terrain/clearing paths. Ground and shader edits require all environment specs.
- `ProjectScene` mounts shared terminal, seed lever, commit ridge, language pillars, release markers, and star lanterns for project worlds, not only Deslopify. Use skin/options and preserve generic data.
- `DSCHUNGEL`, Sun, PostStack, CapabilityService, camera rig, input, and scene director are shared engine/environment surfaces. Scope values and add non-Deslopify regression assertions.

## Existing-code mapping

Line numbers are current branch anchors; movement after edits is expected.

| Design element | Existing code | Required change |
|---|---|---|
| Project entry/current wall offset | `src/app/world/projects/deslopify/deslopify.scene.ts:7-42` | Replace static wall/sign composition with Deslopify flow composition; retain `ProjectScene` lifecycle, collider registration, and project identity. |
| Four-card source | `src/app/world/projects/deslopify/video-wall.ts:25-46` | Move canonical records to data module; render four full records, 640×600 canvas, 1.9×1.78 face, 2.1×1.98×.14 frame, and `uWipe`. |
| Existing wall demo | `video-wall.ts:63-260` | Remove hue-block-only toggle; expose wall target and stateful original/slop wipe; preserve disposal and `InWorldDemo` compatibility. |
| Static jungle signs | `jungle-signs.ts:7-96` | Replace repeated one-line `slop → original` labels with flow-owned cards/tags/vines or compatibility façade; never duplicate cards. |
| Project toys/interactables | `src/app/world/project/project.scene.ts:46-331` | Add flow objects without changing shared toy placement APIs; allow Deslopify skin and world-mode interaction. |
| Demo contract | `project.scene.ts:123-152` | Add explicit world-vs-captured input mode; world-mode `E` falls through to nearest interactable. |
| Shared project scene | `project.scene.ts:154-331` | Mount/update/dispose Deslopify flow; preserve shared Terminal, SeedLever, CommitRidge, LanguagePillars, ReleaseMarkers, StarLanterns. |
| Ground normals/colour | `src/app/world/environments/ground.ts:36-111` | Keep indexed geometry, smooth vertex normals, per-vertex `colorAt`; remove nonindexed face-colour workaround. Validate all users. |
| Jungle environment | `jungle.ts:55-577` | Add Deslopify-compatible south-bank trail, smooth ground slice, tiered instanced foliage, canopy/wind/translucency, and existing Water/Waterfall integration. Avoid global regressions. |
| Procedural flora | `flora.ts:19-446` | Add instanced leaf/translucency/wind path or isolate Lookdev foliage; do not break current low-poly paths. |
| Shared Sun | `sun.ts:16-~130` | Add Jungle-specific shadow options (`26`, `1`, `90`, `-.0004`, `.03`); preserve defaults for other moods. |
| Shared mood | `mood.ts:113-~180` | Confirm palette/grade; isolate Deslopify haze transition from persistent DSCHUNGEL mood. |
| Water | `water.ts:1-~300` | Preserve shader and add only required stream/edge styling; test all quality geometries. |
| Waterfall | `waterfall.ts:20-~380` | Keep capable implementation; tune Deslopify placement to Lookdev plane/pool targets without replacing lifecycle. |
| Terrain wrapper | `terrain.ts:1-104` | Update shared ground expectations after indexed-normal fix; no Deslopify-only behaviour leaks into clearing/terrain. |
| Label canvas | `src/app/world/landmarks/base/label.ts:3-40` | Measured width, next-power-of-two backing texture, font load/fallback, no fixed max width. |
| Exhibit fallback | `screen.landmark.ts:14-116` | Replace dark flat fallback with 620px 16:10 poster layout and exact Deslopify copy; retain iframe/URL path. |
| Explorer | `src/app/world/avatar/explorer.ts:33-452` | Keep procedural avatar in main waves; optional glTF only D11. Verify lantern/card scale and existing specs. |
| Post stack | `src/app/engine/post-stack.ts:26-170` | Preserve composer cap `1.5`, AO/bloom thresholds, half-float fallback; ensure haze/post stay within budget. |
| Capability tiers | `src/app/engine/capability.service.ts:1-181` | Add/read exact Lookdev fields and preserve detection/step-down. |
| Repo override | `src/app/content/repo-overrides.ts:66-88` | Set primary `#6b4712`, accent `#f4e6c8`; retain summary, route, and arch metadata. |
| Scene director | `src/app/features/world/scene-director.ts:26-248` | Respect world-mode demo without setting captured demo input; preserve captured demos and lifecycle. |
| HUD | `src/app/ui/hud/hud.ts:13-183` | Add exact start/help/prompt/toast/state strings and quality controls; retain responsive behaviour. |
| Terminal | `src/app/world/environments/props/terminal.ts:32-~400` | Skin as moss-edged stele with exact canvas/case/screen/type/position/tilt; preserve four-page input. |
| Seed lever | `src/app/world/environments/props/seed-lever.ts:1-171` | Skin as liana interaction; prompt `Liane ziehen`; preserve callback/collider. |
| Shared ridge | `commit-ridge.ts:1-~220` | Add boardwalk/rail presentation: 108 planks, 22 posts, exact wood palette/bucket response; preserve commit mapping. |
| Shared language/release toys | `language-pillars.ts`, `release-markers.ts`, `star-lanterns.ts` | Apply bamboo, cairn, amber lantern/firefly skins; preserve data and generic use. |
| Existing specs | Co-located `.spec.ts` and `scene-director.spec.ts` | Update intentional expectations for faceted ground, three-card wall, fixed labels, red theme, captured demo, and old terminal dimensions; add exact new contracts. |

## Work breakdown and ownership

Tasks use exclusive file ownership within each wave. Parallel agents must not edit another task's owned file; missing interfaces require a follow-up task.

### Wave 1 — independent contracts and shared surfaces

#### D1 — Canonical Deslopify data and theme (MECH)

Owns:

- Create `src/app/world/projects/deslopify/deslopify.data.ts`.
- Create `src/app/world/projects/deslopify/deslopify.data.spec.ts`.
- Modify `src/app/content/repo-overrides.ts` and `src/app/content/repo-overrides.spec.ts`.

Dependencies: none.

Work:

- Export typed card, tag, vine, map spot, prompt, event, palette, HUD, poster, and stele records.
- Encode all four cards, four tags, `CARD_POS`, `TAG_DATA`, `VINE_DATA`, `TRAIL`, `BUCKETS`, `SPOTS`, `ARCH`, `POST`, `WALL`, and exact strings in this plan.
- Set theme primary/accent to `#6b4712` / `#f4e6c8`.

Acceptance:

- Spec asserts exactly four cards, four tags, card titles/metadata/durations/channels, exact bilingual strings, 15 vine records, 22 bucket entries, and every listed prompt/event.
- No consumer reconstructs copy by parsing display strings.
- Existing summary, route, and repo override behaviour remains valid.

#### D2 — Measured labels and exhibit poster (MECH)

Owns:

- Modify `src/app/world/landmarks/base/label.ts`; create `src/app/world/landmarks/base/label.spec.ts`.
- Modify `src/app/world/landmarks/base/screen.landmark.ts` and `screen.landmark.spec.ts`.

Dependencies: none.

Work:

- Replace fixed `1024×256` max-width label with measured Barlow Semi Condensed `700 120px`, padding, ceil, next-power-of-two texture, and matching plane aspect; retain fallback font and disposal.
- Implement poster fallback for Deslopify exhibit/content path with exact 620px 16:10 layout, dimensions, copy, chips, comparison, URL, E prompt, and colours.
- Keep iframe/URL rendering unchanged when available.

Acceptance:

- Label spec mocks `measureText` and proves long text expands, short text uses power-of-two width, plane aspect matches texture, and no max-width truncation.
- Font-load failure still creates usable texture.
- Screen spec proves exact German/English poster copy and that iframe mode is not replaced.

#### D3 — Stele terminal and liana skin (MECH)

Owns:

- Modify `src/app/world/environments/props/terminal.ts` and `terminal.spec.ts`.
- Modify `src/app/world/environments/props/seed-lever.ts` and `seed-lever.spec.ts`.

Dependencies: none. Consume canonical D1 data after wave merge, or keep exact stele/liana copy local to preserve wave independence.

Work:

- Preserve terminal page data/navigation, but render 1024×640 canvas, 44px body, max five visible lines, 540×348 case, 512×320 screen, 2.1m centre, 12° tilt-back, near-zero pitch, four 8px dots, and arrow/Esc keycaps.
- Preserve generic terminal prompt compatibility; Deslopify skin uses `Terminal bedienen` / `Terminal verlassen`.
- Convert seed lever presentation to liana/rock while preserving interaction radius, callback, collider, and seed count. Use `Liane ziehen`.

Acceptance:

- Terminal spec asserts dimensions, canvas, body size, five-line pagination, four pages, prompts, and arrow/Esc navigation.
- Seed spec asserts callback once per interaction, prompt, collider/interact radius, and no seed regression.

#### D4 — Shared jungle toy skins (MECH)

Owns:

- Modify `src/app/world/environments/data/commit-ridge.ts` and `commit-ridge.spec.ts`.
- Modify `src/app/world/environments/data/language-pillars.ts` and `language-pillars.spec.ts`.
- Modify `src/app/world/environments/data/release-markers.ts` and `release-markers.spec.ts`.
- Modify `src/app/world/environments/data/star-lanterns.ts` and `star-lanterns.spec.ts`.
- Modify `src/app/world/environments/motes.ts` and `motes.spec.ts`.

Dependencies: none.

Work:

- Keep shared toy data and placement. Add environment skin options selected by Deslopify/Jungle only.
- Render 108 wood planks with five exact wood colours, 22 rail posts, bucket heights, and post proximity response.
- Present language data as bamboo, releases as moss-capped cairns, and stars as amber lanterns with fireflies. Preserve existing max counts/callbacks.

Acceptance:

- Generic project toy tests pass except deliberate skin assertions.
- New tests assert counts, colours, height formulas, bucket mapping, and exact rail/bamboo/cairn/lantern events.
- No shared constructor requires Deslopify-only data.

#### D5 — Quality, lighting, and post contracts (HARD)

Owns:

- Modify `src/app/engine/capability.service.ts` and spec.
- Modify `src/app/world/environments/sun.ts` and spec.
- Modify `src/app/engine/post-stack.ts`; create `src/app/engine/post-stack.spec.ts`.

Dependencies: none.

Work:

- Add tier fields: low `{pr:1, shadows:false,map:0,plants:320,canopy:40,flies:40,detail:0,post:false}`, medium `{pr:1.5, shadows:true,map:1024,plants:900,canopy:110,flies:90,detail:1,post:false}`, high `{pr:2, shadows:true,map:2048,plants:1400,canopy:200,flies:160,detail:2,post:true}`.
- Preserve detection: low without WebGL2, renderer `/swiftshader|llvmpipe|software|basic render/i`, or cores `<=2`; high only without `/intel|uhd graphics|hd graphics/i` and cores `>=8`; otherwise medium.
- Preserve one-time step-down after 3 seconds with average frame time `>24ms` and exact toast.
- Support Jungle shadow options half extent `26`, near `1`, far `90`, bias `-.0004`, normalBias `.03`; preserve other-world defaults.
- Preserve post cap `1.5`, AO radius `.6`, distance exponent `1.5`, thickness `1`, scale `1`, samples `16`, bloom radius `.55`, threshold `1.0`, half-float target samples `4` fallback.

Acceptance:

- Specs assert every tier field, detection branch, and step-down timing.
- Sun specs prove Deslopify options do not alter non-Jungle defaults.
- Post specs prove cap/fallback and post off on low/medium.

### Wave 2 — environment and project flow

#### D6 — Smooth ground and tiered foliage (HARD)

Owns:

- Modify `src/app/world/environments/ground.ts` and `ground.spec.ts`.
- Modify `src/app/world/environments/terrain.ts` and `terrain.spec.ts`.
- Modify `src/app/world/environments/jungle.ts` and `jungle.spec.ts`.
- Modify `src/app/world/environments/flora.ts` and `flora.spec.ts`.

Dependencies: D5.

Work:

- Replace nonindexed faceted ground path with indexed 90×90 / 180×180 smooth ground where used by Deslopify, `computeVertexNormals()`, and per-vertex `colorAt`; retain low-tier segment reduction only when visibly smooth.
- Implement exact height/noise/colour formulas and shader detail levels above.
- Add instanced leaf max `1800`/canopy `200`, visible tier counts, five greens, path avoidance, canopy/trunk ranges, wind terms, player bend, and translucency.
- Keep clearing/Plaza/Showroom/Terrain APIs stable; if a shared class cannot carry both paths, add a narrowly scoped option rather than changing all defaults.

Acceptance:

- Ground spec asserts `geometry.index` exists, position/normal counts agree, normals are smooth, vertex colours exist, and no per-face triangle colour path remains.
- Terrain, Jungle, Plaza, and Showroom specs pass; SwiftShader-facing regression is covered.
- Jungle specs assert tier counts, instancing, palette, path avoidance, wind uniforms, and no per-frame allocation.
- Flora spec proves existing generic low-poly generation still works.

#### D7 — Stream, waterfall, and atmospheric transition (HARD)

Owns:

- Modify `src/app/world/environments/water.ts` and `water.spec.ts`.
- Modify `src/app/world/environments/waterfall.ts` and `waterfall.spec.ts`.

Dependencies: D5. D7 can run in parallel with D6; it consumes existing environment interfaces and does not own D6 files.

Work:

- Preserve existing water/waterfall architecture; tune Deslopify stream to `#4f8b93` with `#8cc3c8` top edge, bridge placement, Lookdev waterfall/pool position, and existing shader constants.
- Expose controlled atmosphere/haze uniform or callback so flow eases target by `dt*2`, from no mask before lantern to clear after ring.
- Dispose materials and particle resources on project exit.

Acceptance:

- Water specs retain low/medium/high segments/rings and shader constants.
- Waterfall specs retain rows/columns/physics/mist values and prove placement is additive.
- Haze target reaches `max(0,1-ring/700)` while ring active and `1` when off; reduced motion jumps to target.

#### D8 — Stateful Deslopify objects and flow (HARD)

Owns:

- Create `src/app/world/projects/deslopify/deslopify.flow.ts` and `deslopify.flow.spec.ts`.
- Modify `deslopify.scene.ts` and `deslopify.scene.spec.ts`.
- Modify `video-wall.ts` and `video-wall.spec.ts`.
- Modify `jungle-signs.ts` and `jungle-signs.spec.ts`.

Dependencies: D1, D2, D3, D4, D6, D7.

Work:

- Create flow state for lantern lit, installed, ring origin/radius, haze, card/tag/vine progress, wall toggle, terminal/exhibit/cave interactions, and reset.
- Compose lantern at `(2.3,0,4.2)` with exact geometry/light values; ignite at `2.2m`, transition `.7s`, carry after `.9s`, carry rate `2.2`, light radius `5.5`, post radius `2.5`.
- Add 26 procedural vines and tags; implement top-down rates, clamp, scaleX flip, bud/emissive values, and no blocking collision from vines.
- Render four cards with exact canvas/frame/layout and `uWipe`; stagger `120ms`, seam `180ms`, complete `360ms`; reduced motion instant.
- Add arch trigger, stream-only crossing, ring speed/max/opacity, wall E toggle, wall-origin ring, liana pulse/reshuffle, stele/poster/cave events, rail proximity, fireflies, and exact prompts/toasts/events.
- Replace static `JungleSigns` rendering with flow-owned cards/tags; keep compatibility export only if another importer requires it.

Acceptance:

- Flow spec asserts movement `95/170`, bounds, bridge-only crossing, lantern `<44px`, `R=84`, ring `340px/s`, max `1400`, cutoff `1300`, haze ease, global clear, vine/tag/card rates and clamps.
- Spec advances cards at `120ms` stagger and checks `uWipe` at `180ms`/`360ms`; reduced-motion transition is immediate.
- Spec asserts wall toggles only after install, off grows slop back, on starts wall-origin ring, `R` resets, and liana/stele/exhibit/cave interactions emit exact strings.
- Scene spec proves four cards, no duplicate signs, collider/interactable registration, update/dispose, and no other-project regressions.
- Video-wall spec asserts four records, card geometry, texture dimensions, wipe uniforms, and material disposal.

### Wave 3 — input, HUD, and browser gate

#### D9 — World-mode input, camera fit, and HUD (HARD)

Owns:

- Modify `src/app/world/project/project.scene.ts` and `project.scene.spec.ts`.
- Modify `src/app/features/world/scene-director.ts` and `scene-director.spec.ts`.
- Modify `src/app/ui/hud/hud.ts` and `hud.spec.ts`.

Dependencies: D8.

Work:

- Extend `InWorldDemo` with explicit input mode. Deslopify flow is world mode: `E` routes to nearest target and movement stays live. Existing captured demos continue setting `demoActive` and consuming input.
- Keep camera defaults shared unless visual review proves a Deslopify-only profile required; if adding one, scope it to Deslopify and test Showroom/Plaza/other project camera behaviour.
- Add exact start screen, help, state/progress labels, prompts, bilingual toasts, quality buttons, reduced-motion indicator, and graphics tier controls. Do not obscure mobile movement controls.
- Ensure `R` reaches flow reset and terminal page controls do not steal world input outside terminal interaction.

Acceptance:

- Scene-director spec proves captured demo behaviour unchanged and world-mode demo does not consume `E` before interactable routing.
- Project-scene spec proves flow update/dispose with player/camera lifecycle.
- HUD spec asserts exact strings and tier buttons, and mobile/coarse-pointer layout remains usable.
- Camera review confirms card/lantern/stele readability from existing boom and no global FOV/boom regression.

#### D10 — Deslopify browser gate and integration specs (MECH)

Owns:

- Create `tests/deslopify.spec.ts`.
- Modify only `tests/world.spec.ts` if shared harness setup is required; otherwise leave it untouched.

Dependencies: D9.

Work:

- Add focused browser flow: load `/p/deslopify`, start, assert `Dschungel — Deslopify`, reach lantern, observe ignition, cross arch, observe `Entslopt`, interact wall, toggle off/on, open terminal/poster, restart.
- Use semantic prompts/state rather than brittle pixel coordinates. Keep screenshots limited to broad presence/contrast if harness permits.
- Normal `npm run test:e2e` remains isolated; persistent Playwright profile is for manual validation only.

Acceptance:

- Browser test passes Chromium and repository headless/SwiftShader setup.
- Test proves no WebGL exception, no blocked input after world-mode E, no duplicate cards, and no shader compilation console error.
- Skip only when browser/WebGL unavailable, with unit specs carrying contract and skip reason visible.

### Wave 4 — optional authored assets

#### D11 — Optional glTF authoring and optimization (HARD, optional)

Owns only if pipeline proves practical:

- `scripts/author-models.mjs` and `scripts/optimize-assets.mjs`, only if pipeline changes are required.
- Generated asset paths emitted by those scripts, declared in the implementation PR before editing; no `assets/` directory currently exists in this checkout.
- Exact loader/manifest files created by the existing pipeline, also declared before editing; D11 must not invent a runtime dependency.

Dependencies: D8 and D9. Last wave; never blocks procedural implementation.

Work:

- Run existing `npm run assets:author` and `npm run assets:optimize` only if they accept simple models and output stays within budget.
- Replace only suitable procedural shells; vines and tags remain procedural.
- Retain procedural fallback when asset load fails or tier is low.

Acceptance:

- Optimized glTF has no new runtime package, correct disposal, low-tier fallback, and measurable visual benefit.
- If benefit or pipeline is insufficient, skip D11 and record procedural path as final.
- `npm run budget:check` remains green.

## Risks and mitigations

### Shared code and worlds

- `ProceduralGround` is shared by Jungle, Showroom, Plaza, and Terrain/clearing. Indexed smooth normals fix SwiftShader faceting but can alter all lighting. Keep option boundaries, update all ground/terrain specs, and run full suite.
- `ProjectScene` mounts shared Terminal, SeedLever, CommitRidge, LanguagePillars, ReleaseMarkers, and StarLanterns. Skin through options/data, never Deslopify-only branches in generic constructors. Run project placement tests for every project.
- `Sun`, `Mood`, `PostStack`, camera rig, capability tiers, and scene director are global. Scope Jungle-specific values and prove current defaults for other worlds.
- Existing scene-director demo capture can suppress movement/E. World-mode input must be explicit and regression-tested.
- Dynamic prompts update on engine tick. Stable interactable objects with mutable prompt/callback are safer than replacing objects each frame.

### SwiftShader and headless tests

- SwiftShader/llvmpipe may lack WebGL2, derivatives, half-float targets, or reliable font metrics. Use capability guards, current shader fallback patterns, and canvas text fallbacks.
- Current ground was faceted because nonindexed geometry/per-face colours masked normal issues. Inspect indexed buffers and shader strings rather than require GPU screenshots.
- Avoid exact screenshot assertions for antialiasing, font rasterization, fog, and bloom. Assert dimensions, uniforms, state, and stable text.
- Run focused Angular specs with `--watch=false`; run browser gate separately.

### Performance and budget

- Initial gzip script budget is `350 kB` in `scripts/check-budget.mjs`. No dependencies. Keep flow/data dynamically imported with project route where current architecture allows.
- Use instancing for plants/canopy/fireflies, shared geometry/materials, capped counts, and exact tiers. Dispose card/tag textures and flow objects.
- High post-processing is opt-in. Preserve composer cap `1.5`, AO/bloom limits, and low/medium post off.
- Avoid animation-loop allocations: cache vectors, uniforms, progress state, and event throttles.
- Four cards at 640×600 plus four tags at 512×240 consume texture memory. Reuse contexts where possible, dispose on exit, and retain only needed transition textures.

### Reduced motion and mobile

- Reduced motion disables camera easing, ring expansion, vine sway, tag/card interpolation, firefly follow oscillation, and atmospheric pulsing while keeping final state/interactions. Card/tag changes, ring, and haze become instant.
- Preserve accessible poster/terminal text when motion is reduced.
- Existing simple/mobile view may avoid full 3D; expose poster, cards, README link, and state text.
- Coarse pointer/narrow HUD must not hide `E`, `R`, or graphics controls. Do not assume keyboard-only controls; click-to-walk and touch-compatible target selection remain available.

### Asset pipeline

Authored glTF can add loader bytes, memory, shader differences, and optimization failures. D11 is last, retains procedural fallback, and cannot block required experience.

## Verification commands

Run from `/home/jamie/programming/gitplore` after each wave and again before merge:

```bash
npm run lint
npm run typecheck
npm test -- --watch=false
npm run test:scripts
npm run build
npm run budget:check
```

Full gate:

```bash
npm run verify
```

One Angular/Vitest spec:

```bash
npx ng test --watch=false --include='src/app/world/projects/deslopify/deslopify.flow.spec.ts'
```

Equivalent package-script form:

```bash
npm test -- --watch=false --include='src/app/world/projects/deslopify/deslopify.flow.spec.ts'
```

Focused shared-risk specs:

```bash
npx ng test --watch=false --include='src/app/world/environments/ground.spec.ts'
npx ng test --watch=false --include='src/app/engine/capability.service.spec.ts'
npx ng test --watch=false --include='src/app/features/world/scene-director.spec.ts'
```

Browser gate after app build/serve setup:

```bash
npm run e2e -- tests/deslopify.spec.ts
```

If optional D11 is attempted:

```bash
npm run assets:author
npm run assets:optimize
npm run build
npm run budget:check
```

Final review checklist:

- Four cards and four tags match exact copy, metadata, durations, colours, badges.
- Lantern, bridge, stream, ring, haze, vines, tags, cards, wall, rail, fireflies, terminal, poster, HUD, tiers, and reduced-motion numbers match this plan.
- Ground remains indexed/smooth and shared-world tests pass.
- World-mode `E` reaches flow targets; captured demos still work.
- Low/medium/high tiers and SwiftShader detection match exact table and step-down rule.
- No new runtime dependency; gzip budget passes; all required commands pass.
- Optional models either pass asset budget with fallback or are explicitly skipped.
