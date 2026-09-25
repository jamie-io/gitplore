# Deslopify Jungle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Deslopify world (`/p/deslopify`, the `jungle` environment) as the Turn 2 "Der Weg durch den Slop" journey: a slop-covered south bank with a lantern, feed cards, vines and tags; an arch over a stream that switches Deslopify on with a spreading ring; a north bank with the feed wall, the exhibit poster and the cave, where E at the wall toggles the slop back.

**Architecture:** Shared surfaces (label, exhibit poster, stele terminal, liana, toy skins, smooth ground) are fixed first and in parallel. The jungle then gets its stream and bridge, and a Deslopify-only flow module owns the lantern, cards, vines, tags and ring on top of it. All interaction goes through the existing `Interactable` system; nothing captures movement input.

**Tech Stack:** Angular 22, TypeScript strict, three.js 0.186, Vitest through `ng test`, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-09-24-deslopify-jungle-design.md` (extracted by Codex from the handoff bundle `improvements/Portfolio improvement_ Deslopify-handoff/`). All numbers, colours and strings come from the spec. Where this plan and the spec disagree, this plan wins.

## Global Constraints

- Corrections to the spec (they override it):
  - The top-down map (`#2a`) is a flow prototype. Its pixel values are the rules for behaviour: ratios, rates, orders and trigger conditions. They are not a coordinate system. Convert them into world metres around the existing jungle layout (`jungle.ts`: `CLIFF`, `CAVE`, `POOL`, `STAGE`, spawn at origin). Do not copy the Lookdev coordinates such as `LANTERN_POST=(2.3,0,4.2)`, the 90×90 ground slice or its `pathX` height formula.
  - Do not ship the following prototype-only UI: the Lookdev start screen, the `Grafik/Auto/Niedrig/Mittel/Hoch` buttons, the "Im Blick" view panel, the "Was passiert" event log or the map legend. Quality already lives in the settings dialog. Only the in-world prompts (`E <prompt>`) and a short HUD state line ship.
  - Tier detection and the 3 s / 24 ms step-down already exist in `src/app/engine/capability.service.ts`. Do not rewrite them. Per-tier counts for plants, canopy and fireflies belong to the jungle, keyed on the existing `QualityTier`.
  - Do not change the camera defaults: FOV, boom and far plane stay as they are.
- No new runtime dependencies. The initial bundle stays within the `scripts/check-budget.mjs` budget.
- Jungle-only changes may be made freely, because only Deslopify uses `environment: 'jungle'`. Changes to shared classes (`ProceduralGround`, `flora.ts`, `Sun`, `label.ts`, `ScreenLandmark`, `Terminal`, `SeedLever`, data toys) must keep the other worlds (plaza, showroom, hub) visually and behaviourally unchanged, or change them only as a fix the spec asks for (smooth ground, measured labels).
- Reduced motion: every transition (card wipe, tag flip, vine retreat, ring, haze) jumps straight to its end state.
- UI and world copy is German first, with the English line where the spec gives one.
- Baseline: on `main`, 37 tests in 5 files already fail because of `localStorage.clear` under Node 25. That is a known pre-existing failure, and no new failures may be added.
- Every task: run its own specs plus `npm run typecheck` and `npm run lint` before committing. Commit messages are plain English, with no Claude or AI attribution lines.

## Review Focus

- Walking back south after the ring has installed Deslopify: everything must stay original ("From here on the change stays"). Only E at the wall reverts it.
- Pressing E at the wall before the arch was ever crossed: do nothing, or show no prompt. The wall toggle exists only once Deslopify is installed.
- Leaving the world and coming back (or `R` restart): the full flow state resets, and no textures, geometries or listeners leak (dispose paths tested).
- Low tier or SwiftShader: no shadows and reduced counts, the smooth ground renders with no black triangles, and no WebGL2-only shader features are used without a guard.
- Reduced motion switched on mid-transition: in-flight wipes and rings snap to their end state.

---

## Lanes

- **FAST**: opencode `opencode/mimo-v2.6-flash-free`, for tightly specified single-concern tasks.
- **MID**: codex `gpt-5.6-luna` at `xhigh`, for multi-file feature work with clear contracts.
- **COMPLEX**: Claude, or `opus-high` subagents, for rendering, shaders, terrain and the flow state machine.

Each task runs in its own git worktree on a branch `lane/dj-<task>` off `feat/deslopify-jungle`. The orchestrator reviews every diff (spec compliance, then code quality), fixes mistakes, and merges into `feat/deslopify-jungle`.

## Wave 1 (parallel, no dependencies)

### Task 1 — Deslopify content module and theme (FAST)

**Files:** Create `src/app/world/projects/deslopify/deslopify.data.ts` and `deslopify.data.spec.ts`. Modify `src/app/content/repo-overrides.ts` and its spec.

**Produces:** `export interface FeedCardData { slop: string; original: string; bg: string; word: string; wordColor: string; sub: string; slopThumb: string; avatar: string; avatarBg: string; meta: string; duration: string; channel: string }`, `export const FEED_CARDS: readonly FeedCardData[]` (4, from spec §"Four canonical feed cards"), `export interface SlopTagData { slop: string; original: string; slopDetail: string; originalDetail: string }`, `export const SLOP_TAGS` (4), `export const BADGE = { translated: 'Automatisch übersetzt · Audio: Deutsch (KI)', original: 'Original · Englisch' }`, `export const CAPTION = { translated: 'ÜBERSETZT · translated', original: 'ORIGINAL' }`, `export const PROMPTS` (wall on/off, liana, stele enter/leave, exhibit, cave, lantern), `export const PALETTE = { original: '#e0a13c', slop: '#9a3f8d', slopLine: …, wood: '#5a3d27', stele: '#141b17', ink: '#f4efe4', engrave: '#f4e6c8' }`.

- [ ] Write a spec asserting 4 cards and 4 tags with the exact strings, the badge and caption strings, and the palette hex values.
- [ ] Implement the data module (typed, `readonly`, no logic).
- [ ] Set the Deslopify override `theme: { primary: '#6b4712', accent: '#f4e6c8' }`, and update the override spec.
- [ ] Run `npx ng test --watch=false --include='src/app/world/projects/deslopify/deslopify.data.spec.ts' --include='src/app/content/repo-overrides.spec.ts'` and confirm it passes. Then commit.

### Task 2 — Measured labels (FAST)

**Files:** Modify `src/app/world/landmarks/base/label.ts`, and create or modify `label.spec.ts`.

- [ ] Write a spec with `measureText` mocked. It asserts that long text widens the canvas to the next power of two of `ceil(width)+2*PAD`, that `fillText` receives no `maxWidth`, and that the plane width equals `HEIGHT * w / CANVAS_H`.
- [ ] Implement: font `'700 120px "Barlow Semi Condensed"'`, measure first, size the canvas and the plane to fit, and redraw once `document.fonts.load(font)` resolves (guarded when `document.fonts` is missing). Keep the existing export signature.
- [ ] Run the spec together with every existing spec that imports `label.ts`. Then commit.

### Task 3 — Exhibit poster fallback (MID)

**Files:** Modify `src/app/world/landmarks/base/screen.landmark.ts` and its spec. Create `src/app/world/landmarks/base/poster.ts` and `poster.spec.ts`.

- [ ] When a project has no screenshot, `ScreenLandmark` draws a canvas poster (spec §"Poster copy" and the poster dimensions) instead of the dark plane: kicker, name, German summary, English italic summary, tech chips, the repo URL and the `E Details, README & Code` hint. It uses project data, so it works for any project. An optional `comparison: { without: string; with: string }` renders the `OHNE · WITHOUT` / `MIT · WITH` block, and Deslopify passes it from `FEED_CARDS[1]` (if Task 1 has not merged yet, pass the strings inline in the scene later).
- [ ] Specs: the poster draws when there is no screenshot, the screenshot path is unchanged, and the canvas texture is disposed.

### Task 4 — Stele terminal and liana (MID)

**Files:** Modify `src/app/world/environments/props/terminal.ts`, `seed-lever.ts` and their specs, and `src/app/world/project/project.scene.ts`, only to pass the skin option.

- [ ] Add a `skin?: 'default' | 'jungle'` option. The jungle terminal is a moss-edged stone stele: 1024×640 canvas, body 44px, max 5 lines, page dots in place of `Seite 1 von 4`, keycaps `↑↓ blättern` and `Esc verlassen`, screen centre ~2.1 m, tilted back 12°. The page header drops the project name, which moves to a plank label.
- [ ] The jungle seed lever is a liana hanging from a branch, with the prompt `Liane ziehen`. Pulling it plays a short sway (instant under reduced motion) and triggers the existing reseed callback.
- [ ] The default skin stays pixel-identical. The existing specs pass unchanged, and new specs cover the jungle skin.
- [ ] `ProjectScene` passes `skin: 'jungle'` when `environment.id === 'jungle'` (or when the environment exposes a skin).

### Task 5 — Jungle toy skins (MID)

**Files:** `src/app/world/environments/data/{commit-ridge,language-pillars,release-markers,star-lanterns}.ts` and their specs.

- [ ] Add a `skin: 'jungle'` option to each. Commit ridge: a boardwalk the player walks on, with rail posts along it whose height is `0.55 + b*0.35` for normalised commits per bucket and whose caps glow amber when the player comes within ~1.5 m. Languages: one bamboo stalk per language, height = share, with a coloured band near the top. Releases: cairns with moss caps and the version carved on the top stone. Star lanterns: amber firefly swarms, one per star.
- [ ] Every skin gets a plank label (Task 2's `label.ts`). The defaults stay unchanged.

### Task 6 — Smooth ground and foliage lookdev (COMPLEX)

**Files:** `src/app/world/environments/ground.ts`, `flora.ts`, `shaders/*` (as needed), `jungle.ts` (foliage section only), and their specs.

- [ ] `ProceduralGround`: keep the geometry indexed, call `computeVertexNormals()`, sample `colorAt` per vertex, and delete `faceColours` and `toNonIndexed`. Raise the sun `normalBias` where dark triangles remain (Lookdev uses 0.03, jungle only).
- [ ] Jungle ground detail by tier (spec §Ground noise shader): wet patches with low roughness, leaf-litter speckle, and the moving canopy dapple already present.
- [ ] Jungle foliage: wind sway, bending away from the player, and backlit translucency toward the sun on medium and high. Counts: low 320/40, medium 900/110, high 1400/200 (plants/canopy), using instancing.
- [ ] Specs: the index exists, normals are smooth (shared vertices have equal normals), vertex colours exist, the tier counts hold, and the plaza and showroom specs stay green.

## Wave 2 (after wave 1 merges)

### Task 7 — Stream, bridge and banks (COMPLEX)

**Files:** `src/app/world/environments/jungle.ts`, `water.ts`, `terrain.ts` (if needed), and their specs.

- [ ] Cut a stream across the clearing in `jungleHeightAt`. It is fed from the plunge pool, and water is reused from `Water`. Arrival (spawn) lies on the south bank; exhibit, cave and wall ground lie on the north bank.
- [ ] A bridge walk surface spans the stream. Collision lets the player cross the stream only on the bridge, and a clear exclusion lane keeps scatter off the trail and the bridge.
- [ ] Export the layout anchors the flow needs: `SOUTH_TRAIL: Vector3[]`, `BRIDGE: { centre, halfWidth, halfLength, yaw }`, `LANTERN_POST`, `CARD_SLOTS` (4), `WALL_SLOT`, `VINE_SLOTS` and `TAG_SLOTS`. Proportions come from the top-down map, scaled so the arrival-to-arch walk takes ~15–20 s at walking speed.
- [ ] Add a `slop` blend in `[0,1]` to the jungle: violet haze (fog colour and density lerp toward the slop mood), with a shared `uClearOrigin` / `uClearRadius` uniform pair that materials can read. The `slop` blend is driven externally.

### Task 8 — Deslopify flow (COMPLEX)

**Files:** `src/app/world/projects/deslopify/*`, which replaces `video-wall.ts` and `jungle-signs.ts` with `feed-card.ts`, `slop-vines.ts`, `slop-tags.ts`, `lantern.ts` and `deslopify.flow.ts`. `src/app/world/avatar/explorer.ts` only gets a hand-socket accessor.

- [ ] The flow state machine follows the spec §"Top-down interaction contract", converted to metres. Lantern ignition happens within ~1.1 m, then the explorer carries the lantern (light radius ~5 m). The arch trigger installs Deslopify and starts a ring at ~8 m/s from the arch. The haze eases out. The installed state is permanent. E at the wall toggles off (slop regrows) and on (a new ring starts from the wall).
- [ ] Feed cards: a 640×600 canvas per state on a 1.9×1.78 plane, `uWipe` shader mixing the two maps with an amber seam, and a 120 ms stagger. Four cards stand on the south trail, and the north-bank wall holds the same four.
- [ ] Vines are procedural tubes with emissive buds. They retreat from the lantern light and the ring, and regrow slowly once the light has passed and Deslopify is not installed. They never collide.
- [ ] Tags hang in the vines and turn over (`scaleX = |cos(w·π)|`) to the original. They show chapters, audio, channel and descriptions (Task 1 `SLOP_TAGS`).
- [ ] Interactables: wall toggle, lantern (`Laterne löschen/anzünden`), cave. The HUD state line reads `Deslopify an/aus/noch nicht` with `Entslopt n/8`.
- [ ] Keep `ProjectScene.demo` working for the project menu's "try it" entry. It points at the wall toggle.
- [ ] Specs: every transition and its rate or clamp, the wall guard before install, permanence after install, reset, reduced motion and dispose.

## Wave 3

### Task 9 — Browser gate and docs (MID)

- [ ] `tests/deslopify.spec.ts` (Playwright): load `/p/deslopify`. Assert the world boots with no console or shader errors, the lantern prompt appears near the lantern, and walking over the bridge flips the HUD state to `Deslopify an`. Drive this through the existing test hooks if any exist, or through keyboard input.
- [ ] Run the full `npm run verify`, and fix fallout.

### Task 10 — Optional authored models (MID, optional)

Author the lantern, stele, arch-bridge and card frame through `npm run assets:author` → `assets:optimize` only if the pipeline supports it within budget. Keep the procedural fallback.

- [x] Modelled in Blender, headless: `scripts/blender/kit.py` (the modelling kit), one script per model in `scripts/blender/models/`, `scripts/blender/author.py` (bakes ambient occlusion into the vertex colours and exports), `scripts/blender/preview.py` (a four-view contact sheet for review). `npm run assets:author` runs them when Blender is on the PATH (or `BLENDER` names it) and leaves the committed sources alone otherwise.
- [x] Budget: `jungle-arch.glb` 1954 triangles / 42 KB, `lantern.glb` 604 / 16 KB, `stele.glb` 888 / 20 KB, `card-frame.glb` 1268 / 21 KB after meshopt; no textures, one to three materials each. They are grouped under `jungle` in the manifest, so the hub never preloads them. The hub portal keeps its own `arch.glb`.
- [x] Each prop keeps its procedural build until the model arrives (and for good if it never does); model materials are hazed with the jungle's atmosphere through `HazedCopies`, and the arch's amber line glows up as the slop lifts.

### Task 11 — Second wave of authored models (follow-up to Task 10)

Modelled live over the Blender MCP server (`scripts/blender/live.py` rebuilds one model in the open Blender), then committed as scripts like the first wave.

- [x] `jungle-rocks.glb` (two boulder variants, 826 triangles, 19 KB): each variant's instanced mesh takes a baked copy of its node, keeping placements, tints and colliders.
- [x] `cairn.glb` (three variants to the procedural stack's measurements, 1662 triangles, 38 KB): baked, moved and merged, still one draw call for every cairn; the moss cap no longer overhangs the version label.
- [x] `liana-lever.glb` (stump and swinging liana, 1152 triangles, 25 KB): the liana joins the handle group, so it swings about the same pivot.
- [x] `bakeGeometry` and `adoptNode` (`world/environments/model-geometry.ts`) account for the dequantising transform the optimiser puts on every node; this also fixed the first wave's lantern post, which had been sunk by that offset.
