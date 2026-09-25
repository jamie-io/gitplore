# Plaza Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the Plaza to a 36 × 36 m square with four prop stations on the diagonals, reachable by glide in about a second, dressed in Blender-authored models.

**Architecture:** The layout is metric data and pure functions in `plaza-layout.ts`, so every coordinate, the house rows and the glide path are tested without three.js. `PlazaEnvironment` builds from it with the procedural pieces as proxies, then swaps each for its GLB as it arrives (the jungle's pattern). Glides, number keys and the station chips are **not** built here: the Deslopify Lichtung plan (Task 3 and 4, `docs/superpowers/plans/2026-09-25-deslopify-lichtung.md` on `feat/deslopify-lichtung`) builds a generic stations kit, and the Plaza only declares its stations and its glide path through that kit's hooks.

**Tech Stack:** Angular 22, TypeScript strict, three.js 0.186, Vitest through `ng test`, Playwright, Blender 4 headless.

**Spec:** `docs/handoff/plaza-stations/README.md` and `BLENDER_MODELS.md` (design reference: `Plaza Compact Layout.dc.html`, section 2a). Executors read both before any task. The deviations listed below override the spec.

## Deviations from the handoff (decided in this plan)

1. **Glide, keys and HUD come from the Lichtung stations kit**, not from a Plaza-only glide in `player-controller.ts`. Two glides and two key maps in one codebase would conflict in `engine.service.ts`, `input.service.ts` and `hud.ts`, which the other agent is changing now. Consequences:
   - Timing is the kit's: `length / 22` s clamped to 0.7–1.6 s (spec: `/10`, 0.8–2.2 s). The spec's ceiling of 2.2 s still holds.
   - The kit's clickable station chips (with the numbers 1–4 on them) replace the hint `1–4 Stationen`.
   - The kit ignores colliders while gliding, so "stop when blocked" is replaced by a test that the path itself is clear.
   - Clicking a prop does not glide; clicking its chip does. Clicking a prop keeps today's behaviour everywhere.
   - `Digit0` glides to the portal, as the kit does in every world with stations.
2. **The awning is its own node** `awning` (white, tinted from `AWNINGS` per instance), not part of `trim`, so it can be tinted as today.
3. **The corner model** is a 4 × 4 m block filling `[FACADE, FACADE + HOUSE_DEPTH]²`. Its pivot is the corner nearest the fountain; its two detailed fronts face −X and −Z in model space, and they only need detail above 7 m, where they show over the neighbouring houses.
4. **The arch** stands at `(0, 17.5)` with the portal in its opening. A blocker collider closes the street at `z ∈ [21.6, 22]`, so no one walks off the ground plane.

## Global Constraints

- World units: metres, fountain at the origin, −Z is north. `rotationY`: 0 faces +Z. Kit yaw: 0 faces −Z. A prop at `(x, z)` facing the fountain has `rotationY = atan2(-x, -z)`.
- `FACADE = 18`, `HOUSE_DEPTH = 4`, `SIZE = 60`, `STREET = 3` (south only), `STATION_RADIUS = 11`, `GLIDE_RADIUS = 8`, `PLANTING = 16.5`, tile ring inner 4.2 / outer 7, `spawn = (0, 0, 17.5)`, `spawnYaw = 0`.
- The glide circle `r ∈ [7.15, 8.85]` stays free of colliders.
- No collider lies outside `±(FACADE + HOUSE_DEPTH)` = ±22.
- Worlds other than the Plaza look and behave exactly as today; they keep their seed lever.
- Models: vertex-colour AO, no textures, one to three materials, meshopt, procedural proxy kept, loaded models through the Plaza's atmosphere, never reset a loaded node's position (`bakeGeometry` / `adoptNode`). Plaza total 35–45k triangles on screen, about 1 MB compressed.
- `@engine` may not import `@world`, `@ui` or `features`; `@world` may not import `@ui`.
- Every task runs its own specs plus `npm run typecheck && npm run lint` before committing; the phase gate runs `npm run verify`. Commit messages are plain English sentences, no AI attribution lines.

## Review Focus

1. **Glide from inside the circle** (player between fountain and bench, e.g. at `(0.5, 4.2)`): the radial step must not cross the fountain; it may pass a bench, because the kit ignores colliders. Test in Task 6 that the path never enters `r < FOUNTAIN_COLLIDER + PLAYER_RADIUS`.
2. **Glide from the exact centre or from a stop to its own station**: no NaN from normalising a zero vector; a zero-length path returns `null` from `planGlide`. Test in Task 1.
3. **Glide to the portal stand**, which is off the circle: the path leaves the circle at the south point and runs straight to `(0, 15.5)`. Test in Task 1.
4. **Worlds without a lever** (`ProjectScene.seedLever === null`): restart, dispose and `reseed` must not throw. Test in Task 2.
5. **A model that fails to load** (404 or offline): the procedural proxy stays and nothing throws. Test in Task 5.

## Coordination with the Lichtung work

- This plan runs in its own worktree: `/home/jamie/programming/gitplore-plaza` on `feat/plaza-stations`, branched off `main`. The Lichtung agent works in `/home/jamie/programming/gitplore-lichtung` and its lane worktrees. Neither touches the other's worktree.
- **Phase A (Tasks 1–5)** is independent of the Lichtung kit and starts now. It can merge into `main` and deploy on its own: the smaller square alone brings every prop within a 4.5 s walk.
- **Phase B (Task 6)** starts once the Lichtung Tasks 3 and 4 are merged into `main`; the orchestrator then merges `main` into `feat/plaza-stations`. If Lichtung is still unfinished after Phase A, Phase A ships alone and Phase B follows later.
- Files both sides change, and how the merge is resolved:
  - `scripts/blender/author.py` `MODELS` and `scripts/lib/environment-models.mjs`: both sides only add entries; keep both.
  - `public/assets/manifest.json` and `public/assets/models/*`: generated. After a merge, run `npm run assets:optimize` again rather than resolving by hand.
  - `src/app/world/project/project.scene.ts`: Plaza makes the lever optional (Task 2); Lichtung adds options and forwards stations. Different lines; resolve by keeping both.
  - `environment.ts`: Plaza makes `lever` optional (Task 2) and adds the station hooks (Task 6).
  - `third-person-clearance.spec.ts`, `reseed.spec.ts`, `environments.spec.ts`: Plaza edits only Plaza cases.
- **Blender:** there is one Blender GUI and one MCP port. The Plaza models are built and judged **headless** (`author.py` plus `preview.py` contact sheets), so they never clear the Lichtung agent's live scene. Use the MCP only after checking with `get_scene_info` that nobody else's model is loaded.
- **Dev server and e2e ports:** run the Plaza dev server on port 4301 (`npx ng serve --port 4301`) so both can run at once.

## Lanes

Per standing instructions: **FAST** = opencode (`opencode run -m opencode/mimo-v2.6-flash-free "<task>"`), **MID** = Codex (`codex exec -m gpt-5.6-luna -c model_reasoning_effort=xhigh "<task>"`), **COMPLEX** = `opus-high` subagent or the orchestrator. The orchestrator reviews every diff from opencode and Codex against this plan, fixes mistakes, runs the gate and merges.

## Waves

- **Wave 1 (parallel):** Task 1 (MID), Task 2 (FAST), Task 3 (COMPLEX), Task 4 (MID).
- **Wave 2:** Task 5 (COMPLEX) after Tasks 1, 3 and 4.
- **Wave 3 (after Lichtung Tasks 3–4 are on `main`):** Task 6 (COMPLEX).
- **Wave 4:** Task 7 (orchestrator): captures, acceptance, merge, deploy.

Each wave-1 task runs in its own worktree `../gitplore-plaza-t<N>` on `lane/pz-t<N>` off `feat/plaza-stations`, and merges back into `feat/plaza-stations`.

## File map

| File | Task | Responsibility |
| --- | --- | --- |
| `src/app/world/environments/plaza-layout.ts` (+spec) | 1 | Every Plaza constant and coordinate, `rowWidths`, `houseRow`, stations, glide path |
| `src/app/world/environments/plaza.ts`, `plaza.spec.ts` | 1, 5 | Builds the square from the layout; later swaps in the GLBs |
| `src/app/world/environments/architecture.ts` | 1, 5 | `PLAZA_FOUNTAIN` |
| `src/app/world/environments/environment.ts` | 2, 6 | `ToyLayout.lever?`; `stations?()` and `glidePath?()` |
| `src/app/world/project/project.scene.ts` (+spec), `toy-placement.spec.ts` | 2, 6 | Optional lever; forward the environment's stations |
| `scripts/blender/models/plaza_*.py`, `author.py`, `scripts/lib/environment-models.mjs` | 3, 4 | Models |
| `src/app/world/environments/props/terminal.ts`, `data/commit-ridge.ts`, `data/language-pillars.ts` | 5 | `'plaza'` skin that loads the toy models |
| `captures/plaza-gitplore/` | 7 | Fresh screenshot pack |

---

### Task 1: Layout data and the procedural square (MID)

**Files:**

- Create: `src/app/world/environments/plaza-layout.ts`, `plaza-layout.spec.ts`
- Modify: `src/app/world/environments/plaza.ts`, `plaza.spec.ts`, `architecture.ts`, `third-person-clearance.spec.ts` (only if its Plaza case needs new bounds)

**Interfaces:**

- Consumes: `Collider` from `@engine/player/collision`, `PLAYER_RADIUS` from `@engine/player/player-controller`, `seededRandom`, `between` from `./random`, `HouseOptions` from `./architecture`.
- Produces (exported from `plaza-layout.ts`, later tasks rely on the names):

```ts
export const FACADE = 18;
export const HOUSE_DEPTH = 4;
export const SIZE = 60;
export const STREET = 3;
export const STATION_RADIUS = 11;
export const GLIDE_RADIUS = 8;
export const PLANTING = 16.5;
export const SPAWN = { x: 0, z: 17.5 } as const;
export const HOUSE_WIDTHS = [5, 6, 6.5] as const;
export type HouseVariant = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
/** a, b: 5 m; c, d: 6 m; e, f: 6.5 m. a, c, e two floors (7 m); b, d, f three (10 m). */
export const VARIANTS: Readonly<Record<HouseVariant, { width: number; height: number; awning: boolean; lamp: boolean }>>;
export type Side = 'north' | 'south' | 'west' | 'east';
export interface HouseSpot {
  readonly x: number; readonly z: number; readonly rotationY: number;
  readonly seed: number; readonly variant: HouseVariant;
  /** Stretch on the house's own X, 1 ≤ stretch ≤ 1.1. */
  readonly stretch: number;
  readonly options: HouseOptions; // width = variant width × stretch, depth = HOUSE_DEPTH, height = variant height
}
export function rowWidths(length: number, random: () => number): { widths: number[]; stretch: number };
export function houseRow(side: Side, seed: number, street: boolean): HouseSpot[];
export function footprint(spot: HouseSpot): Extract<Collider, { kind: 'aabb' }>;
/** The four corner blocks: position of the pivot and rotationY. */
export const CORNERS: readonly { readonly x: number; readonly z: number; readonly rotationY: number }[];
export const CORNER_FOOTPRINTS: readonly Extract<Collider, { kind: 'aabb' }>[];
export const ARCH = { x: 0, z: 17.5, width: 6, opening: 3, depth: 1.2 } as const;
export const STREET_BLOCK: Extract<Collider, { kind: 'aabb' }>; // x −3…3, z 21.6…22
export const MASTS: readonly (readonly [number, number])[];     // (±12, ±12)
export const BENCHES: readonly (readonly [number, number, number])[]; // x, z, rotationY facing the fountain, r 5.2 N/E/S/W
export const CYPRESSES: readonly (readonly [number, number])[]; // (±9, ±16.5), (±16.5, ±9)
export const POTS: readonly (readonly [number, number])[];      // (±4.5, 16.5)
export interface PlazaStation {
  readonly key: 1 | 2 | 3 | 4;
  readonly id: 'terminal' | 'board' | 'ridge' | 'languages';
  readonly name: string;        // 'Terminal' | 'Projekttafel' | 'Commit-Treppe' | 'Sprachen'
  readonly prop: { readonly x: number; readonly z: number; readonly rotationY: number };
  readonly stand: { readonly x: number; readonly z: number; readonly yaw: number }; // kit yaw: 0 faces −Z
}
export const STATIONS: readonly PlazaStation[];
export const RIDGE = { from: { x: 5.66, z: -9.9 }, to: { x: 9.9, z: -5.66 } } as const;
export const PORTAL_STAND = { x: 0, z: 15.5, yaw: Math.PI } as const;
export interface GroundPoint { readonly x: number; readonly z: number }
/** Radial to the glide circle, the shorter arc, then straight to `to` if it is off the circle. */
export function plazaGlidePath(from: GroundPoint, to: GroundPoint): GroundPoint[];
```

Exact station data (key order clockwise from the near-left prop seen from the arrival):

| key | id | prop (x, z) | prop `rotationY` | stand (x, z) | stand yaw |
| --- | --- | --- | --- | --- | --- |
| 1 | terminal | (−7.78, 7.78) | 3π/4 | (−5.66, 5.66) | 3π/4 |
| 2 | board | (−7.78, −7.78) | π/4 | (−5.66, −5.66) | π/4 |
| 3 | ridge | midpoint of `RIDGE` (7.78, −7.78) | −π/4 | (5.66, −5.66) | −π/4 |
| 4 | languages | (7.78, 7.78) | −3π/4 | (5.66, 5.66) | −3π/4 |

Prop `rotationY = atan2(-x, -z)` faces the fountain. Stand yaw is the kit's `atan2(-dx, -dz)` from stand to prop; both come out equal here. Compute them in code from the coordinates, do not hard-code the fractions.

`rowWidths(length, random)`: enumerate every sequence of `HOUSE_WIDTHS` (at most 8 items) whose sum `s` satisfies `length − 0.5 ≤ s ≤ length`; pick one with `Math.floor(random() * count)`; the last house absorbs the rest, `stretch = (lastWidth + length − s) / lastWidth` (≤ 1.1 because the gap ≤ 0.5 m and every width ≥ 5 m). Enumeration order must be deterministic (depth-first in `HOUSE_WIDTHS` order). Throws if no sequence exists.

`houseRow(side, seed, street)`: rows run from `−FACADE` to `FACADE`; with `street` the run splits into `[−FACADE, −STREET]` and `[STREET, FACADE]`. For each run call `rowWidths`; the variant of each width is picked by the seeded random among the two variants of that width; `stucco`, `shutters` and awning colour picked from the palettes as today. Centre line at `FACADE + HOUSE_DEPTH / 2 = 20`; rotation as today (north 0, south π, west π/2, east −π/2).

`plazaGlidePath(from, to)` (pure, used by Task 6):

```ts
export function plazaGlidePath(from: GroundPoint, to: GroundPoint): GroundPoint[] {
  const onCircle = (p: GroundPoint): GroundPoint => {
    const r = Math.hypot(p.x, p.z);
    // At the exact centre there is no direction; head for the target instead.
    const [ux, uz] = r > 1e-6 ? [p.x / r, p.z / r] : unit(to);
    return { x: ux * GLIDE_RADIUS, z: uz * GLIDE_RADIUS };
  };
  const path: GroundPoint[] = [from];
  const entry = onCircle(from);
  push(path, entry, 0.3);
  const exit = onCircle(to);
  let a0 = Math.atan2(entry.z, entry.x);
  let delta = Math.atan2(exit.z, exit.x) - a0;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // shorter arc, in (−π, π]
  const steps = Math.max(1, Math.ceil((Math.abs(delta) * GLIDE_RADIUS) / 0.5));
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    push(path, { x: Math.cos(a) * GLIDE_RADIUS, z: Math.sin(a) * GLIDE_RADIUS }, 0.05);
  }
  push(path, to, 0.3);
  return path;
}
// push(path, p, tolerance): appends p unless it lies within `tolerance` of the last point.
// unit(p): p normalised, or (0, 1) for the zero vector.
```

- [ ] **Step 1: Write the failing tests** in `plaza-layout.spec.ts`:

```ts
import { PLAYER_RADIUS } from '@engine/player/player-controller';
import { clearance } from './testing/clearance';
import { PlazaEnvironment } from './plaza';
import {
  FACADE, GLIDE_RADIUS, HOUSE_DEPTH, PORTAL_STAND, STATIONS, rowWidths, houseRow, plazaGlidePath,
} from './plaza-layout';
import { seededRandom } from './random';

const ARRIVAL = { x: 0, z: 13.5 };
const length = (path: readonly { x: number; z: number }[]) =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0);
const samples = (path: readonly { x: number; z: number }[], every = 0.25) =>
  path.slice(1).flatMap((p, i) => {
    const q = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.z - q.z) / every));
    return Array.from({ length: n + 1 }, (_, k) => ({ x: q.x + ((p.x - q.x) * k) / n, z: q.z + ((p.z - q.z) * k) / n }));
  });

describe('Plaza layout', () => {
  it('fills a row exactly, stretching only the last house and by at most 10 %', () => {
    for (const seed of [1, 2, 3, 81, 82]) {
      for (const run of [36, 15]) {
        const { widths, stretch } = rowWidths(run, seededRandom(seed));
        const total = widths.slice(0, -1).reduce((a, b) => a + b, 0) + widths.at(-1)! * stretch;
        expect(total).toBeCloseTo(run, 6);
        expect(stretch).toBeGreaterThanOrEqual(1);
        expect(stretch).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('closes three sides and leaves the street open on the south only', () => {
    const covered = (spots: ReturnType<typeof houseRow>, along: number) =>
      spots.some((s) => Math.abs((s.rotationY === 0 || s.rotationY === Math.PI ? s.x : s.z) - along) < s.options.width / 2);
    expect(covered(houseRow('north', 81, false), 0)).toBe(true);
    expect(covered(houseRow('south', 82, true), 0)).toBe(false);
    expect(covered(houseRow('south', 82, true), 5)).toBe(true);
  });

  it('keeps every collider inside ±(FACADE + HOUSE_DEPTH)', () => {
    const bound = FACADE + HOUSE_DEPTH + 1e-6;
    for (const c of new PlazaEnvironment({ reducedMotion: () => false }).colliders) {
      const [minX, maxX, minZ, maxZ] =
        c.kind === 'aabb' ? [c.minX, c.maxX, c.minZ, c.maxZ] : [c.x - c.radius, c.x + c.radius, c.z - c.radius, c.z + c.radius];
      expect(Math.min(minX, minZ)).toBeGreaterThanOrEqual(-bound);
      expect(Math.max(maxX, maxZ)).toBeLessThanOrEqual(bound);
    }
  });

  it('keeps the glide circle free of colliders', () => {
    const { colliders } = new PlazaEnvironment({ reducedMotion: () => false });
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const gap = clearance(Math.cos(a) * GLIDE_RADIUS, Math.sin(a) * GLIDE_RADIUS, colliders);
      expect(gap).toBeGreaterThan(PLAYER_RADIUS + 0.5);
    }
  });

  it.each(STATIONS.map((s) => [s.key, s] as const))('glides from the arrival to station %i clear of every collider', (_key, station) => {
    const { colliders } = new PlazaEnvironment({ reducedMotion: () => false });
    const path = plazaGlidePath(ARRIVAL, station.stand);
    expect(path.at(-1)).toEqual({ x: station.stand.x, z: station.stand.z });
    expect(length(path)).toBeLessThanOrEqual(25);
    for (const p of samples(path)) {
      expect(clearance(p.x, p.z, colliders)).toBeGreaterThan(PLAYER_RADIUS + 0.5);
    }
  });

  it('keeps the straight walk from the arrival to every stand within 21 m', () => {
    for (const s of STATIONS) {
      expect(Math.hypot(s.stand.x - ARRIVAL.x, s.stand.z - ARRIVAL.z)).toBeLessThanOrEqual(21);
    }
  });

  it('takes the shorter arc', () => {
    const path = plazaGlidePath(STATIONS[0].stand, STATIONS[3].stand); // SW → SE passes south, not north
    expect(Math.max(...path.map((p) => p.z))).toBeGreaterThan(7.9);
    expect(Math.min(...path.map((p) => p.z))).toBeGreaterThan(0);
  });

  it('does not produce NaN from the centre or for a glide to where the player stands', () => {
    for (const p of plazaGlidePath({ x: 0, z: 0 }, STATIONS[1].stand)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
    expect(plazaGlidePath(STATIONS[1].stand, STATIONS[1].stand)).toHaveLength(1);
  });

  it('reaches the portal stand off the circle through the south point', () => {
    const path = plazaGlidePath(STATIONS[1].stand, PORTAL_STAND);
    expect(path.at(-1)).toEqual({ x: 0, z: 15.5 });
    expect(path.at(-2)!.x).toBeCloseTo(0, 5);
    expect(path.at(-2)!.z).toBeCloseTo(GLIDE_RADIUS, 5);
  });

  it('never leads into the fountain from inside the circle', () => {
    const path = plazaGlidePath({ x: 0.5, z: 4.2 }, STATIONS[1].stand);
    for (const p of samples(path)) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(3.2 + PLAYER_RADIUS);
    }
  });
});
```

In `plaza.spec.ts`: delete the `rooftop()` helper, `steppableBox`, and every rooftop test (`keeps one fixed, reachable rooftop…`, `keeps the complete Plaza project scene clear of rooftop route…`, `climbs and descends the crates…`, `lets the body clip a riser…`, `keeps a one-frame 0.35 m rooftop-edge shove…`, `disposes rooftop geometry…`). Replace `faces the first exhibit from the moved arrival` with `looks north at the fountain from the arrival` (`spawnYaw === 0`, spawn `(0, 0, 17.5)`), and `keeps a street open in the middle of every side` with the south-only version above. Keep `leaves room around every exhibit spot` with `count = 1` only (the Plaza now returns one anchor) and a clearance of ≥ 1.5 m (the board stands at r 11, 1.5 m from the glide ring's edge). Keep the NaN-normals and reduced-motion tests.

- [ ] **Step 2:** `npx ng test --watch=false --include='src/app/world/environments/plaza*.spec.ts'`. Expected: FAIL (module `plaza-layout` missing).
- [ ] **Step 3: Implement.**
  - `plaza-layout.ts` with everything above. Keep the palettes in `plaza.ts` (`STUCCO`, `SHUTTERS`, `AWNINGS`), exported so the layout can pick from them; or move them to the layout file and import them into `plaza.ts`, whichever keeps imports acyclic.
  - `architecture.ts`: add `PLAZA_FOUNTAIN` exactly as in README §1 (Task 5 corrects it from the model).
  - `plaza.ts`: import everything from the layout; delete `EXHIBIT_RADIUS`, `EXHIBIT_ARC`, all `ROOFTOP_*`, `flatRoofHouse`, `rooftopGeometry`, the `plaza-rooftop` and `plaza-rooftop-stairs` meshes, `LAMPS` (posts, colliders and their bulbs). Rows: `houseRow('north', 81, false)`, `('south', 82, true)`, `('west', 83, false)`, `('east', 84, false)`; each house drawn with the procedural `house(seed, options)` at `stretch` 1 geometry (the width already includes the stretch). Corners: procedural `house` of 4 × 4 × 10 m at each `CORNERS` entry as the proxy. Arch proxy: two stone piers (1.5 × 1.2 × 5 m) at x ±2.25 and a lintel across, from `BoxGeometry`, painted `STONE`, via `assemble`. Colliders: fountain `PLAZA_FOUNTAIN.radius + 0.2`, house footprints, corner footprints, the two arch piers, `STREET_BLOCK`, cypresses r 0.5, pots r 0.6, masts r 0.25, benches r 1.0. Festoons: sides between `MASTS` plus both diagonals, `MAST_TOP` 6. Water, jets (`reach: 2.1`, `height: 0.8`) and basin floors read `PLAZA_FOUNTAIN`. Tile ring 4.2 / 7. Four medallions: add `medallions: { x, z, radius: 0.9 }[]` at the four stands to the tile shader's options if `withTiles` can take extra discs cheaply; otherwise one merged flat disc mesh (`CircleGeometry(0.9, 24)`, 1 cm above the floor, `polygonOffset`) coloured from the ring palette. `anchors(count)` returns `count > 0 ? [{ position: [-7.78, 0, -7.78], rotationY: Math.PI / 4 }] : []` built from `STATIONS[1].prop`. `spawn = new Vector3(SPAWN.x, 0, SPAWN.z)`, `spawnYaw = 0`. Hills: keep `HILLS[0]` only if the far ring is hidden behind the roofs from the arrival (check in the browser in Task 7; until then keep both).
  - `toyLayout()` on `PlazaEnvironment`:

```ts
toyLayout(): ToyLayout {
  const spot = (s: PlazaStation): ToySpot => ({
    position: new Vector3(s.prop.x, 0, s.prop.z),
    rotationY: s.prop.rotationY,
  });
  const ridge: ToyLine = {
    from: new Vector3(RIDGE.from.x, 0, RIDGE.from.z),
    to: new Vector3(RIDGE.to.x, 0, RIDGE.to.z),
  };
  return {
    terminal: spot(STATIONS[0]),
    ridge,
    languages: spot(STATIONS[3]),
    releases: ridge,
    stars: ridge,
  };
}
```

  Until Task 2 lands, `ToyLayout.lever` is still required: return `lever: { position: new Vector3(0, 0, 12), rotationY: Math.PI }` there and delete that line in Task 2's merge.
  - The language row runs along the tangent at SE: confirm in the running scene or with a spec that the pillars' bounding box centre lies on r ≈ 11 and they do not reach r < 9.35.
- [ ] **Step 4:** Run the Plaza specs, `third-person-clearance.spec.ts`, `toy-placement.spec.ts`, `project.scene.spec.ts`; then `npm run typecheck && npm run lint`. Fix `third-person-clearance.spec.ts` only if it fails because the bounds of the Plaza changed, not by loosening its thresholds.
- [ ] **Step 5:** `git commit -am "Shrink the Plaza to a 36 m square with four stations on the diagonals"`

---

### Task 2: No seed lever on the Plaza (FAST)

**Files:**

- Modify: `src/app/world/environments/environment.ts`, `src/app/world/project/project.scene.ts`, `project.scene.spec.ts`, `toy-placement.spec.ts`, `src/app/world/environments/reseed.spec.ts` (only if it reads the lever)

**Interfaces:**

- Produces: `ToyLayout.lever?: ToySpot`; `ProjectScene.seedLever: SeedLever | null`.

- [ ] **Step 1: Write the failing tests.** In `project.scene.spec.ts`, with a fake environment whose `toyLayout()` omits `lever`:

```ts
it('builds no seed lever when the environment lays out none', () => {
  const scene = new ProjectScene({ ...options, environment: withoutLever });
  expect(scene.seedLever).toBeNull();
  expect(scene.interactables.some((i) => i.id.endsWith(':seed-lever'))).toBe(false);
  scene.init(ctx);
  expect(() => scene.dispose()).not.toThrow();
});
it('still builds the seed lever everywhere else', () => {
  expect(new ProjectScene(options).seedLever).not.toBeNull();
});
```

Use the fakes already in the file for `options` and `ctx`; `withoutLever` is the existing fake environment with a `toyLayout()` that returns every toy but `lever`. In `toy-placement.spec.ts` the `it.each(['showroom', 'jungle', 'plaza'])` case reads the lever: skip the lever assertions when `scene.seedLever` is `null`, and add `expect(plazaScene.seedLever).toBeNull()`.

- [ ] **Step 2:** `npx ng test --watch=false --include='src/app/world/project/**'`. Expected: FAIL.
- [ ] **Step 3: Implement.** `environment.ts`: `readonly lever?: ToySpot;` and update the doc comment ("…the seed lever, if the world has one…"). `project.scene.ts`: `readonly seedLever: SeedLever | null;`; build it only when `toys.lever` is defined; leave it out of `parts` otherwise. `walkLayout` keeps returning a lever, so every other world is unchanged. Remove the placeholder lever from `PlazaEnvironment.toyLayout()` if Task 1 already merged.
- [ ] **Step 4:** Project, environment and toy specs pass; `npm run typecheck && npm run lint`.
- [ ] **Step 5:** `git commit -am "Leave the seed lever out of worlds that lay out none, starting with the Plaza"`

---

### Task 3: Houses, corner, fountain and arch models (COMPLEX, Blender headless)

**Files:**

- Create: `scripts/blender/models/plaza_house.py` (one module, `build(variant)`; see below), `plaza_corner.py`, `plaza_fountain.py`, `plaza_arch.py`
- Modify: `scripts/blender/author.py`, `scripts/lib/environment-models.mjs`, generated `assets-src/models/plaza-*.glb`, `public/assets/models/plaza-*.glb`, `public/assets/manifest.json`

**Interfaces:**

- Consumes: `kit.py` (`Part`, `material`, `tone`, `hex_rgb`, `bake_occlusion`, `export`), the palette in `plaza.ts` / `architecture.ts`, the `PortalLandmark` ring size (read `src/app/world/landmarks/base/portal.landmark.ts`).
- Produces, as node names the game finds parts by:
  - `plaza-house-a` … `plaza-house-f`: nodes `stucco`, `shutters` (both painted white with AO), `trim` (fixed colours: windows `#2f3a45`, door `#5a3a28`, cornice `STONE_DARK`, roof tiles `#b8583a`), `awning` (white, c and f only), and an empty `lamp` beside the door on a, c, e. Widths and heights per `VARIANTS` in Task 1. Front on +Z at z = +2, footprint centred on the origin, 4 m deep.
  - `plaza-corner`: nodes `stucco`, `shutters`, `trim`; 4 × 4 × 10 m, pivot at the corner nearest the fountain, the block spanning local x ∈ [0, 4], z ∈ [0, 4] with the detailed fronts on the x = 0 and z = 0 faces, detail above 7 m (Deviation 3).
  - `plaza-fountain`: node `fountain` per BLENDER_MODELS.md. Report `lower.level`, `lower.radius`, `upper.level`, `upper.radius`, `spout` and kerb radius in the commit message.
  - `plaza-arch`: nodes `arch` and an empty `portal` at the portal ring's centre height; 6 m wide, 3 m opening, 1.2 m deep, 5 m tall; piers at x ±2.25 (matching Task 1's colliders).

`author.py` needs one module to build six variants. Extend `MODELS` values with an optional fifth element, `args`, passed to `build(*args)`:

```python
"plaza-house-a": ("plaza_house", 0.5, 0.5, True, ("a",)),
...
```

and in `main()`: `module_name, strength, distance, ground, *rest = MODELS[name]`, `objects = module.build(*(rest[0] if rest else ()))`. Register in `environment-models.mjs` as `'plaza-house-a.glb': 'plaza'` etc.

- [ ] **Step 1:** Read `card_frame.py`, `arch.py`, `kit.py`, `house()` and `fountain()` in `architecture.ts`, and the portal class. Build each model headless: `npm run assets:author -- plaza-house-a` (check `scripts/author-models.mjs` for how names are passed), then render a contact sheet: `blender -b --factory-startup --python scripts/blender/preview.py -- assets-src/models/plaza-house-a.glb <scratch>/house-a.png`. Iterate until it reads as a Mediterranean house in the Plaza palette. Do **not** use the Blender MCP unless `get_scene_info` shows an empty scene (the Lichtung agent may be using it).
- [ ] **Step 2:** Budgets: houses 800–1 200 triangles each, corner ≤ 1 500, fountain ≤ 2 500, arch ≤ 1 200. Only front and roof detailed; back one quad.
- [ ] **Step 3:** `npm run assets:author && npm run assets:optimize`. Report triangles and compressed bytes for each model; `node scripts/check-budget.mjs` passes. `npm run test:scripts` passes (it may check the manifest).
- [ ] **Step 4:** `git add scripts/blender assets-src/models/plaza-* public/assets scripts/lib/environment-models.mjs && git commit -m "Model the Plaza's houses, corners, fountain and arch in Blender"`

---

### Task 4: Toy and dressing models (MID, Blender headless)

**Files:**

- Create: `scripts/blender/models/plaza_terminal.py`, `plaza_board.py`, `plaza_step.py`, `plaza_pillar.py`, `plaza_mast.py`, `plaza_bench.py`, `plaza_cypress.py`
- Modify: `scripts/blender/author.py`, `scripts/lib/environment-models.mjs`, generated assets and manifest

**Interfaces:** node names and sizes exactly as in `BLENDER_MODELS.md` (`terminal` + empty `screen`; `board` + empty `face`; `step`; `base`/`shaft`/`capital`; `mast`; `bench`; `cypress`). Before modelling the terminal read `src/app/world/environments/props/terminal.ts` (`terminalDimensions`) and leave the screen plane's space clear; before the board read `ScreenLandmark` and `card_frame.py`; before the step and pillar read `data/commit-ridge.ts` and `data/language-pillars.ts` for the step module and the shaft radius they draw today.

- [ ] **Step 1:** Model each headless with contact sheets (Task 3, Step 1). Budgets from `BLENDER_MODELS.md`.
- [ ] **Step 2:** `npm run assets:author && npm run assets:optimize`; report triangles and bytes; `check-budget.mjs` passes.
- [ ] **Step 3:** `git commit -m "Model the Plaza's terminal kiosk, notice board, ridge step, pillar, mast, bench and cypress in Blender"`

Merge note: Task 3 and Task 4 both edit `author.py`, `environment-models.mjs` and the manifest. Merge Task 3 first; on Task 4's merge keep both sets of entries and re-run `npm run assets:optimize`.

---

### Task 5: The models in the square (COMPLEX)

**Files:**

- Modify: `src/app/world/environments/plaza.ts`, `plaza.spec.ts`, `architecture.ts` (`PLAZA_FOUNTAIN` from Task 3's report), `src/app/world/environments/props/terminal.ts`, `data/commit-ridge.ts`, `data/language-pillars.ts` (+ their specs), `src/app/world/project/project.scene.ts` (skin selection only)

**Interfaces:**

- Consumes: Task 1 layout, Task 3 and 4 model names, `bakeGeometry` / `adoptNode` from `model-geometry.ts`, `ctx.assets.model(name)` / `releaseModel(name)`.
- Produces: skins `'default' | 'jungle' | 'plaza'` on `Terminal`, the commit ridge and the language pillars; `ProjectScene` passes `'plaza'` when `environment.id === 'plaza'`.

How each piece is swapped (keep one draw call per material, as the procedural build has today):

- **Houses and corners:** when all house and corner models have arrived, rebuild the `houses` mesh's geometry: for every `HouseSpot`, bake `stucco`, `shutters`, `trim` (and `awning`) from its variant's model, multiply the vertex colours of `stucco` by the spot's `stucco` colour, `shutters` by `shutters`, `awning` by the awning pick, scale X by `stretch`, place with `placed(…, x, z, rotationY)`, and merge everything with `assemble` into one geometry for the existing `solid` material. Corners the same with their rotation. Replace the geometry, dispose the proxy's, release the models. The `lamp` empties give the wall-lamp bulb positions: add them to the `bulbs` mesh.
- **Fountain:** replace the `fountain` mesh's geometry with the baked `fountain` node; set `PLAZA_FOUNTAIN` from Task 3's measured values so the water planes sit in the basins (the water is built before the model arrives, so the constant must be right from the start).
- **Arch:** replace the proxy's geometry with the baked `arch` node. Check the portal sits in the opening at the `portal` empty's height; adjust `spawn`'s y handling only if the portal floats.
- **Masts, benches, cypresses:** replace each instanced mesh's geometry with the baked node, as `loadBoulders` in `jungle.ts` does. Cypress keeps `withWind`.
- **Board:** the Plaza places the `board` frame around the exhibit anchor itself (the environment knows the anchor): an `adoptNode` of the `board` node at `STATIONS[1].prop`, through the Plaza's atmosphere material. Check the `face` empty lines up with `ScreenLandmark`'s screen; if it does not, fix the model, not the landmark.
- **Terminal, step, pillar:** a `'plaza'` skin in each class that loads its model and swaps the frame / step / column geometry, keeping the screen, the step heights and the pillar heights computed as today. The jungle skin in the same files is the pattern.
- Every loaded mesh uses the Plaza's `withAtmosphere` material with `this.shared`, so it stands in the same air.

- [ ] **Step 1: Write the failing tests** in `plaza.spec.ts`, with a stub `ctx.assets` whose `model()` resolves a small fake glTF scene (nodes named as in Task 3/4) or rejects:

```ts
it('swaps the proxies for the models and keeps one houses mesh', async () => {
  const environment = plaza();
  environment.init(ctxWithModels);
  await flushPromises();
  const houses = ctxWithModels.scene.getObjectByName('houses') as Mesh;
  expect(houses.geometry.getAttribute('position').count).toBe(expectedVertexCount);
  expect(ctxWithModels.scene.children.filter((o) => o.name === 'houses')).toHaveLength(1);
});
it('keeps the procedural square when a model fails to load', async () => {
  const environment = plaza();
  environment.init(ctxRejectingModels);
  await flushPromises();
  expect(ctxRejectingModels.scene.getObjectByName('houses')).toBeDefined();
  expect(() => environment.dispose()).not.toThrow();
});
it('releases every model it asked for', async () => {
  plaza().init(ctxWithModels);
  await flushPromises();
  expect(ctxWithModels.assets.released.sort()).toEqual(ctxWithModels.assets.requested.sort());
});
it('tints each house with its own stucco colour', async () => { /* bake one spot, compare a stucco vertex colour to STUCCO pick × white AO */ });
```

Build the fake context from `stubContext` in `@engine/testing/world-context`; look at the jungle's model tests for an existing fake of `assets.model` before writing a new one. `expectedVertexCount` is the sum over spots of the fake nodes' vertex counts.

- [ ] **Step 2:** Run the Plaza, terminal, ridge and pillar specs. Expected: FAIL.
- [ ] **Step 3: Implement** as described above. Keep the NaN-normals test green: every baked geometry must keep finite normals (`assemble` restores them).
- [ ] **Step 4:** All specs pass, `npm run verify` passes, `node scripts/check-budget.mjs` passes. Open the Plaza at `http://localhost:4301` on the `high` and `low` tiers and check: no dark silhouettes, no missing roofs, the portal in the arch, the fountain water inside the basins. Count triangles on screen (`renderer.info.render.triangles` via the console) and report it against the 35–45k budget.
- [ ] **Step 5:** `git commit -am "Stand the Blender-authored houses, fountain, arch and props in the Plaza"`

---

### Task 6: Plaza stations through the Lichtung kit (COMPLEX, after Lichtung Tasks 3–4 are on `main`)

**Files:**

- Modify: `src/app/world/environments/environment.ts`, `plaza.ts`, `plaza.spec.ts`, `src/app/world/project/project.scene.ts` (+spec)

**Interfaces:**

- Consumes (from the kit, verify the names in the merged code first — the kit may have moved on from its plan): `StationSpec { id, name, stand, trigger, plate }`, `StationStand`, `StationPlate { kicker, title, text, en }`, `GroundPoint` from `@engine/stations/station`; `WorldScene.stations`, `portalStand`, `glidePath(from, to)`; `ProjectScene` forwarding these from subclasses (Lichtung Task 7).
- Produces on `Environment`:

```ts
/** The places a player can be glided to, if the environment lays out stations. */
stations?(): readonly StationSpec[];
/** Where the portal key glides to. */
readonly portalStand?: StationStand;
/** The route a glide takes; without it the kit glides in a straight line. */
glidePath?(from: GroundPoint, to: GroundPoint): readonly GroundPoint[];
```

`ProjectScene`: when the subclass does not declare them, use `environment.stations?.()`, `environment.portalStand` and `environment.glidePath` (bound). The `GroundPoint` in `plaza-layout.ts` from Task 1 becomes an import of the kit's type.

Plates (German first, English line; generic, since an environment knows nothing about projects — review the wording with Jamie before merging):

| key | name | kicker | title | text | en |
| --- | --- | --- | --- | --- | --- |
| 1 | Terminal | Station 1 | Terminal | Hier fragst du das Repository direkt ab. | Question the repository directly. |
| 2 | Projekttafel | Station 2 | Projekttafel | Worum es geht, in einem Bild. | What it is about, at a glance. |
| 3 | Commit-Treppe | Station 3 | Commit-Treppe | Jede Stufe ist eine Woche Arbeit. | Every step is a week of work. |
| 4 | Sprachen | Station 4 | Sprachen | Woraus das Projekt gebaut ist. | What the project is built from. |

Check the texts against what each toy actually shows (the ridge's bucket size, the terminal's commands) and correct them if they claim something else. `trigger: 2.5` for every station.

- [ ] **Step 1: Write the failing tests:** the Plaza project scene has four stations with the stands from `STATIONS` and keys in order; `glidePath` is `plazaGlidePath`; every other world's scene has no stations (the kit's own guarantee, asserted once here for the Plaza's sibling worlds); a glide from the arrival to each stand, planned with the kit's `planGlide(scene.glidePath(ARRIVAL, stand), yaw)`, lasts ≤ 2.2 s; under reduced motion the kit teleports (assert through the kit's engine fake, as its own spec does).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Specs pass; `npm run verify`; in the browser at 1600 × 900, `high` tier: pressing `2` glides to the board without crossing the fountain or a bench, the board's plate and prompt appear; `W` during a glide stops it at once; the chips read 1–4 in the order terminal, board, ridge, languages; reduced motion teleports.
- [ ] **Step 5:** `git commit -am "Give the Plaza four stations the player can glide between"`

---

### Task 7: Captures, acceptance, ship (orchestrator)

- [ ] Regenerate `captures/plaza-gitplore/` with the same shots as the old pack (arrival as visitor, top-down, oblique from each side), via the dev server on port 4301.
- [ ] Manual acceptance (README §8): first frame at 1600 × 900 `high` shows the fountain in the middle, the board NW and ridge NE beside it, terminal and pillars at the edges. Drop `HILLS[1]` if it is fully hidden behind the roofs from every station.
- [ ] `npm run verify`, `node scripts/check-budget.mjs`, `npm run e2e` (Plaza and worlds tests).
- [ ] Merge `feat/plaza-stations` into `main`, push, deploy; remove the lane worktrees; add a `CLAUDE:` line to `CHANGELOG.md`.
