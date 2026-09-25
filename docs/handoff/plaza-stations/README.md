# Handoff: Plaza "Stations" layout (option 1b)

## Overview

The Plaza (`src/app/world/environments/plaza.ts`, the world of the `gitplore` project itself) is too big for its audience. Possible employers should not have to walk through a 72 × 72 m square. This change:

- shrinks the square from 72 × 72 m to **36 × 36 m**,
- moves the four project props onto **four stations** on the diagonals around the fountain,
- adds a **glide**: click a station (or press `1`–`4`) and the player is walked there automatically, never longer than 2.2 s,
- removes the hidden **rooftop** and, on the Plaza only, the **seed lever**,
- replaces the procedural fountain, houses and portal with **Blender-authored GLB models** (see `BLENDER_MODELS.md`).

Target: every prop is reachable in ≤ 2.2 s by glide, ≤ 4.5 s on foot from the arrival point.

## About the design files

`Plaza Compact Layout.dc.html` is a **design reference** (a plan document in HTML), not code to ship. Section **2a** has the build spec; section **1b** has the top-down plan. Implement it in the existing Angular + Three.js codebase using its own patterns (`Environment`, `ToyLayout`, `Collider`, `scripts/blender/models/*.py`, `npm run assets:author` / `assets:optimize`).

## Fidelity

- **Layout, coordinates, timings**: final. Implement as specified; small adjustments to clear colliders are fine, but keep the numbers below as the target.
- **Model look**: direction only. Keep the Plaza's existing palette (`STUCCO`, `SHUTTERS`, `AWNINGS`, `FLAT_ROOF`, `STONE`, `STONE_DARK` in `plaza.ts` / `architecture.ts`) and the existing festoon, water, jet and tile shaders.

## Conventions

World units exactly as in `plaza.ts`: metres, fountain at the origin, **−Z is north** and is the direction `spawnYaw = 0` looks. `rotationY` uses the exhibit convention: **0 faces +Z**. A prop at `(x, z)` facing the fountain has `rotationY = atan2(-x, -z)`.

## 1. Constants (`plaza.ts`)

| Constant | Today | New |
| --- | --- | --- |
| `SIZE` (ground plane) | 130 | 60 |
| `FACADE` (centre → house fronts) | 36 | 18 |
| `HOUSE_DEPTH` | 9 | 4 |
| house height (`between(random, …)`) | 7–11 | 7–10 |
| house width | 6–9 | 5–6.5 (the GLB widths, see models) |
| `STREET` (half-width of a street) | 5, all four sides | 3, **south side only** |
| `EXHIBIT_RADIUS` / `EXHIBIT_ARC` | 20 / 1.1π | removed, replaced by stations |
| `STATION_RADIUS` | — | 11 (where props stand) |
| `GLIDE_RADIUS` | — | 8 (glide stops and glide path) |
| `PLANTING` | 33 | 16.5 |
| tile `ring` | inner 5.2, outer 9.8 | inner 4.2, outer 7 |
| `spawn` | (−8, 0, 4.2) | (0, 0, 17.5) |
| `spawnYaw` | computed | 0 |

`spawn` is where the **return portal** stands (the scene places the portal at `environment.spawn` and the player a few metres in front of it, facing away). With `(0, 0, 17.5)` and yaw 0 the portal sits in the south street and the player lands at about `(0, 13.5)` looking north at the fountain.

### Fountain

`FOUNTAIN` in `architecture.ts` is shared. Add a Plaza-specific `PLAZA_FOUNTAIN` rather than changing the shared one:

```ts
export const PLAZA_FOUNTAIN = {
  radius: 3,                      // kerb outer radius; collider = radius + 0.2
  lower: { level: 0.5, radius: 2.6 },
  upper: { level: 2.1, radius: 0.95 },
  spout: [0, 3.0, 0],
} as const;
```

Jets: `reach: 2.1`, `height: 0.8`. Final radii and levels come from the fountain GLB (`plaza-fountain.glb`); read them off the model and update this constant so the water planes sit exactly in the basins.

## 2. Stations and props

| Key | Prop | Position (x, z) | `rotationY` | Glide stop (x, z) | Stop yaw | Comes from |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Terminal, SW | (−7.78, 7.78) | 2.356 (3π/4) | (−5.66, 5.66) | faces prop | `toyLayout().terminal` |
| 2 | Project board (exhibit), NW | (−7.78, −7.78) | 0.785 (π/4) | (−5.66, −5.66) | faces prop | `anchors(1)` |
| 3 | Commit ridge, NE | from (5.66, −9.9) to (9.9, −5.66) | along the tangent | (5.66, −5.66) | faces ridge midpoint | `toyLayout().ridge` |
| 4 | Language pillars, SE | (7.78, 7.78) | −2.356 (−3π/4) | (5.66, 5.66) | faces prop | `toyLayout().languages` |
| — | Return portal, S street | (0, 17.5) | −π | none | — | `spawn` as today |

- Props stand at `STATION_RADIUS = 11` on the diagonals (45°, 135°, 225°, 315°); glide stops at `GLIDE_RADIUS = 8` on the same diagonals, 3 m in front of each prop.
- `releases` and `stars` in `ToyLayout` use the **same segment as `ridge`**.
- The language row runs across the direction it faces (as `ToyLayout` already documents), so at SE it runs along the tangent of the circle.
- Key order 1–4 runs clockwise from the near-left prop as seen from the arrival: near-left, far-left, far-right, near-right.

### `anchors()`

Return the NW station only, facing the fountain:

```ts
anchors(count: number): readonly Anchor[] {
  return count > 0 ? [{ position: [-7.78, 0, -7.78], rotationY: Math.PI / 4 }] : [];
}
```

### `toyLayout()`

Implement it (the hook already exists on `Environment`; `ProjectScene` uses it when present). `lever` becomes optional in `ToyLayout` (see §5), and the Plaza omits it.

## 3. Dressing

| Item | Where | Collider |
| --- | --- | --- |
| Festoon masts | (±12, ±12) | cylinder r 0.25 |
| Festoon strings | the four sides between masts + both diagonals, as today; `MAST_TOP` stays 6 | — |
| Benches | 4 at r = 5.2 on N, E, S, W: (0, −5.2), (5.2, 0), (0, 5.2), (−5.2, 0), facing the fountain | cylinder r 1.0 |
| Cypresses | 8 at (±9, −16.5), (±9, 16.5), (−16.5, ±9), (16.5, ±9) | cylinder r 0.5 |
| Pots | drop them, or 4 at (±4.5, 16.5) either side of the portal | cylinder r 0.6 |
| Lamps | wall lamps on house fronts (part of the house GLBs); delete the 8 lamp posts and their colliders | — |
| Station medallions | 4 mosaic discs, Ø 1.8 m, centred on the glide stops, drawn in the tile shader or as a decal | none |

Keep the glide circle (r = 8 ± 0.85 m: stop radius plus player radius plus 0.5 m) free of colliders. Benches reach r 6.2, cypresses start at r 15.9, masts at r 16.97. Nothing may stand between them.

## 4. Houses

- `houseRow(side, seed)` becomes `houseRow(side, seed, street: boolean)`. Only `'south'` gets `street = true`. The other three rows run solidly from corner to corner.
- Corners are filled by `plaza-corner.glb` (L-shaped), so the north and south rows run `−FACADE … FACADE` and the corner model covers `FACADE … FACADE + HOUSE_DEPTH` on both axes.
- Each house slot picks one of the house GLB variants (`plaza-house-a` … `-f`) by the seeded random, matching the slot width to the variant width (5, 6 or 6.5 m); the last house on a row may use the narrowest variant stretched on X by at most 10 % to close the gap.
- Per-house colour: the stucco and shutter meshes are separate nodes in each GLB (see `BLENDER_MODELS.md`). Tint them per instance with `STUCCO` / `SHUTTERS` using the seeded picks, as today.
- Colliders: one AABB per house from `footprint(spot)` as today, plus the corners.
- Until the GLBs arrive, keep the current procedural `house()` as the proxy, the same pattern the jungle uses (`ENVIRONMENT_MODELS` in `scripts/lib/environment-models.mjs`).

## 5. Code changes, file by file

1. **`src/app/world/environments/environment.ts`**
   - `ToyLayout.lever` → `readonly lever?: ToySpot;`
   - Add
     ```ts
     /** A place the player can be glided to: the stop in front of a prop, and the prop it serves. */
     export interface Station {
       readonly key: 1 | 2 | 3 | 4;
       /** German label for the HUD, e.g. "Terminal". */
       readonly label: string;
       /** Ground-level stop, on GLIDE_RADIUS. */
       readonly stop: Vector3;
       /** Yaw the player ends up facing. */
       readonly yaw: number;
       /** Interactable id of the prop; clicking it glides here. */
       readonly targetId: string;
     }
     ```
   - On `Environment`: `readonly stations?: readonly Station[];`
2. **`src/app/world/project/project.scene.ts`**
   - Build `SeedLever` only if `toys.lever` is defined; leave it out of `parts` otherwise. `seedLever` becomes `SeedLever | null`; update `toy-placement.spec.ts` and `project.scene.spec.ts`, which read it.
   - Expose `stations` from the scene (the environment's, with `targetId` filled in from the terminal, exhibit, ridge and pillars ids).
3. **`src/app/world/environments/plaza.ts`**
   - New constants (§1), `houseRow(…, street)`, corner houses (§4), dressing (§3), `anchors()` and `toyLayout()` (§2), `stations`.
   - Delete: `ROOFTOP_HOUSE`, `ROOFTOP`, `ROOFTOP_STAIRS`, `ROOFTOP_GUARDS`, `ROOFTOP_*` constants, `flatRoofHouse`, `rooftopGeometry` use, the `plaza-rooftop` and `plaza-rooftop-stairs` meshes, `LAMPS` posts.
   - `reseedDecoration` can stay (the hills); nothing calls it on the Plaza any more.
   - Load the Plaza GLBs, grouped under `'plaza'` in `ENVIRONMENT_MODELS`, with the procedural pieces as proxies.
4. **`src/app/engine/player/player-controller.ts`**: add a glide (spec in §6). Keep it generic: any world with `stations` gets it.
5. **Input and HUD** (`src/app/ui/hud/hud.ts` and the input action source)
   - Keys `1`–`4` start the glide to that station. Check they are not bound already.
   - Clicking a station prop or its medallion starts the glide. If the click lands on a prop the player is already at (within 1 m of its stop), keep today's behaviour (use / open).
   - HUD hint, bottom centre next to the interaction prompt: `1–4 Stationen`. Show it only in worlds with stations.
6. **`scripts/blender/`**: new model modules and entries, see `BLENDER_MODELS.md`.
7. **Tests** (see §8).

## 6. Glide behaviour

- **Trigger**: key `1`–`4`, or a click on a station's prop or medallion.
- **Path**, all at ground level:
  1. straight from the current position to the nearest point on the `GLIDE_RADIUS` circle (skip if already within 0.3 m of it),
  2. the **shorter arc** along the circle to the target stop,
  3. stop.
  If the player is inside the circle (r < 8), step 1 goes radially outwards; it can never cross the fountain collider.
- **Timing**: `duration = clamp(pathLength / 10, 0.8, 2.2)` seconds. Position follows the path by arc length with ease-in-out (`t => t < .5 ? 2t² : 1 − (−2t + 2)² / 2`).
- **Walk animation**: drive `stridePhase` from the distance actually covered, so legs and footsteps match (the controller already does this from `lastStep`).
- **Facing**: the player yaw follows the path tangent; over the last 0.5 s it eases onto the station's `yaw`. The third-person camera keeps following as it does today.
- **Collisions**: still resolved every frame through `resolveCollisions`. If the player ends up more than 0.3 m off the path (something blocked them), stop the glide.
- **Cancel**: any movement intent (`forward`, `strafe`, `jump`) or mouse look (`yawDelta`/`pitchDelta` ≠ 0) ends the glide at once and hands control back with the current velocity zeroed.
- **Reduced motion** (settings or `prefers-reduced-motion`): no glide. 0.2 s fade to black, `teleport(stop, yaw)`, 0.2 s fade in.
- **At the stop**: the prop's interaction prompt appears as if the player had walked there.

Measured from the arrival `(0, 13.5)`: the far stations (NW, NE) are about 24 m along the glide path (2.2 s, capped), the near ones about 11 m (1.1 s). On foot, the straight line to the NW stop is about 20 m (4.4 s at `WALK_SPEED` 4.5) and clears the fountain.

## 7. Removed

- Rooftop house, 17-step stair, guard rails, and the rooftop tests in `plaza.spec.ts` (`rooftop()` helper and the tests that use it; the "keeps the complete Plaza project scene clear of rooftop route" test).
- Seed lever on the Plaza only. Other worlds keep it.
- Three of four streets. The hill backdrop now shows only above the roofs; keep `HILLS[0]` and drop the far ring if it is fully hidden.
- `captures/plaza-gitplore/` is out of date after this; regenerate it the same way it was made.

## 8. Tests and acceptance

Add or update in `plaza.spec.ts` / `project.scene.spec.ts`:

- The glide path from the arrival to every station keeps ≥ 0.5 m from every collider (sample every 0.25 m along the path, check `gap > PLAYER_RADIUS + 0.5`).
- Every station stop is within 25 m of path length from the arrival, and every glide duration ≤ 2.2 s.
- The straight walk from the arrival to every stop is ≤ 21 m.
- The Plaza scene has no seed lever; the other worlds still have one.
- No collider lies outside `±(FACADE + HOUSE_DEPTH)`.
- `third-person-clearance.spec.ts` still passes on the Plaza (houses are 4 m deep now, streets are gone).
- Reduced motion: a glide request teleports and never animates.
- `npm run verify` passes. Check the budget with `scripts/check-budget.mjs`.

Manual acceptance at 1600 × 900, `high` tier:

- The first frame shows the fountain in the middle, the board (NW) and ridge (NE) on either side of it, and the terminal and pillars at the edges.
- Pressing `2` glides to the board in ≤ 2.2 s without clipping the fountain or a bench, and the board's prompt appears.
- Any WASD press during a glide stops it immediately.

## Assets

See `BLENDER_MODELS.md`. All models go through the existing pipeline: `scripts/blender/models/<name>.py` with `build()` → registered in `scripts/blender/author.py` `MODELS` → `npm run assets:author` → `npm run assets:optimize` → `public/assets/manifest.json`, grouped under `'plaza'` in `scripts/lib/environment-models.mjs`.

## Files in this bundle

- `README.md` — this spec
- `BLENDER_MODELS.md` — model list with dimensions, node names, budgets
- `CLAUDE_CODE_PROMPT.md` — a prompt to paste into Claude Code to start the work
- `Plaza Compact Layout.dc.html` — the design reference (plan, options, build spec 2a)
