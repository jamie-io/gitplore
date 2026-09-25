# Deslopify Lichtung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Deslopify jungle as Die Lichtung, a 60 × 45 m bowl on one south–north axis, and add a reusable station bar, glides, arrival and moment cameras, HUD plates and toasts, and a ground haze that the ring clears.

**Architecture:** Generic pieces live where the engine and the page already put things: camera shots and glides in `@engine` (they run inside the frame loop), the station state machine and its wiring in `features/world` (next to `SceneDirector`), the chips, plate, toast, banner and pitch in the HUD, fed through `WorldStore` signals. The jungle's layout becomes metric data in `jungle-layout.ts`; `JungleEnvironment` builds the bowl from it; `DeslopifyScene` declares its stations, plates, overview and paths, and drives the flow.

**Tech Stack:** Angular 22 (signals, standalone components), TypeScript strict, three.js 0.186, Vitest through `ng test`, Playwright e2e, Blender 4 headless for models.

**Spec:** `docs/superpowers/specs/2026-09-25-deslopify-lichtung-design.md`. Read it before any task: every coordinate, colour, string, rate and timing comes from it. The handoff it cites (`improvements/V2/…/Deslopify Lichtung.dc.html`, lines 356–683 are the prototype's logic) is the tie-breaker for behaviour the spec does not spell out.

## Global Constraints

- Coordinates: `x = (px − 320) / 10`, `z = (py − 240) / 10`, metres; north is −z; yaw 0 faces −z.
- No new runtime dependencies. The initial bundle stays within `scripts/check-budget.mjs`.
- `@engine` may not import `@world`, `@ui` or `features`; `@world` may not import `@ui`. Scenes talk to the page only through callbacks in their options.
- Worlds other than Deslopify must look and behave exactly as today: no stations, no shots, no plate, number keys inert.
- Reduced motion: glides teleport, shots cut, the chip pulse stops, every wipe, ring and haze change snaps.
- Copy is German first with the English line where the spec gives one; strings are verbatim from the spec.
- Models: vertex-colour AO, no textures, one to three materials, budgets from spec §6, meshopt, procedural fallback kept, loaded models through `HazedCopies`, never reset a loaded node's position (use `bakeGeometry` / `adoptNode`).
- Every task runs its own specs plus `npm run typecheck` and `npm run lint` before committing. Commit messages are plain English sentences with no AI or Claude attribution lines.
- Baseline: the unit-test failures that already exist on `main` are recorded in Task 0 and are the only failures allowed.

## Review Focus

1. **A glide that crosses the arch trigger between two frames at low frame rates** must still install Deslopify. The flow checks the segment from last frame's position to this frame's against the trigger box, not only the point (test in Task 7).
2. **Keys pressed while the menu, settings, info panel or a captured terminal is open** must not glide or skip shots: station keys only act in input mode `world` (test in Task 3).
3. **Restart (`R`) during a glide or a moment shot** must stop the glide, end the shot without a jump, clear the banner and toast, and reset visited stations (test in Task 3 and Task 7).
4. **Leaving the world mid-shot or mid-glide** (menu travel, portal, browser back) must end the shot and the glide, so the next world starts with the rig in charge and no stale plate or chip row (test in Task 3).
5. **Storage blocked** (`sessionStorage` throwing in a private window): the arrival camera plays and nothing throws (test in Task 3).

## Lanes

- **FAST** — opencode: `opencode run -m opencode/mimo-v2.6-flash-free "<task text>"` in the task's worktree.
- **MID** — Codex: `codex exec -m gpt-5.6-luna -c model_reasoning_effort=xhigh "<task text>"` in the task's worktree.
- **COMPLEX** — `opus-high` subagents (Agent tool, `subagent_type: "opus-high"`), or the orchestrator.

Each task runs in its own worktree on `lane/dl-t<N>` off `feat/deslopify-lichtung` (worktree `/home/jamie/programming/gitplore-lichtung`). The orchestrator reviews every diff against this plan and the spec, fixes mistakes, runs the gate, and merges into `feat/deslopify-lichtung`.

## File map

| File                                                                                                                                                                                         | Task | Responsibility                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| `src/app/engine/camera/camera-shot.ts` (+spec)                                                                                                                                               | 2    | Shot type, weight timelines for arrival and moment, blend maths                                              |
| `src/app/engine/engine.service.ts`                                                                                                                                                           | 2, 3 | `playShot` / `skipShot` / shot listener; `glide` / `cancelGlide` in `tick`                                   |
| `src/app/engine/stations/station.ts`                                                                                                                                                         | 3    | `GroundPoint`, `StationStand`, `StationPlate`, `StationSpec`, `ScenePitch`                                   |
| `src/app/engine/stations/glide.ts` (+spec)                                                                                                                                                   | 3    | Pure glide planning and sampling                                                                             |
| `src/app/engine/world-object.ts`                                                                                                                                                             | 3    | Optional station/shot hooks on `WorldScene`                                                                  |
| `src/app/engine/input.service.ts` (+spec)                                                                                                                                                    | 3    | Digit keys → `station1`…`station8`, `portal` actions                                                         |
| `src/app/features/world/station-director.ts` (+spec)                                                                                                                                         | 3    | Visited/here/next, plate selection, change-only snapshots                                                    |
| `src/app/features/world/scene-director.ts` (+spec)                                                                                                                                           | 3    | Arrival shot, moment callback, glides, toasts, resets on swap/restart                                        |
| `src/app/ui/store/world.store.ts` (+spec)                                                                                                                                                    | 3    | `stations`, `plate`, `toast`, `banner`, `pitch`, `shot`, `glideRequest`                                      |
| `src/app/features/world/world.page.ts`                                                                                                                                                       | 3    | Station actions, glide requests → director                                                                   |
| `src/app/ui/hud/station-bar.ts`, `hud-plate.ts`, `hud-toast.ts` (+specs), `hud.ts`                                                                                                           | 4    | Chips, plate, toast, banner, pitch title                                                                     |
| `src/app/world/projects/deslopify/deslopify.data.ts` (+spec)                                                                                                                                 | 1    | Plates, toasts, pitch, banner strings                                                                        |
| `src/app/world/environments/jungle-layout.ts` (+spec)                                                                                                                                        | 5    | Metric layout, heights, paths, glide graph, K6                                                               |
| `src/app/world/environments/jungle.ts`, `jungle-bridge.ts`, `jungle-cave.ts` (new), `jungle-steps.ts` (new) (+specs)                                                                         | 5    | The bowl: terrain, rim, rill, pool, cliff and cave, deck, steps, scatter, colliders                          |
| `scripts/blender/models/{commit_steps,feed_wall,cave_cliff,exhibit_easel}.py`, `arch.py`, `author.py`, `scripts/lib/environment-models.mjs`, `assets-src/models/*`, `public/assets/models/*` | 6    | New models, arch refit                                                                                       |
| `src/app/world/projects/deslopify/*.ts` (+specs), `src/app/world/project/project.scene.ts`                                                                                                   | 7    | Flow constants and behaviour, stations/plates/overview/paths, fireflies, toasts, moment, new models in place |
| `src/app/world/environments/shaders/ground-haze.ts` (+spec), `atmosphere.ts`, `jungle.ts` (`breathe`)                                                                                        | 8    | K4 ground haze                                                                                               |
| `tests/deslopify.spec.ts`, `scene-director.ts` test hook                                                                                                                                     | 9    | e2e for the new flow                                                                                         |

## Waves

- **Wave 1 (parallel):** Task 1 (FAST), Task 2 (COMPLEX), Task 5 (COMPLEX), Task 6 (COMPLEX, Blender).
- **Wave 2:** Task 3 (COMPLEX) after Task 2 merges; Task 8 (COMPLEX) after Task 5 merges.
- **Wave 3:** Task 4 (MID) after Task 3; Task 7 (COMPLEX) after Tasks 1, 3, 5 and 6.
- **Wave 4:** Task 9 (MID), then Task 10 (orchestrator).

---

### Task 0: Baseline (orchestrator)

- [ ] **Step 1:** In `/home/jamie/programming/gitplore-lichtung`, run `npm test 2>&1 | tee /tmp/claude-1000/-home-jamie-programming-gitplore/23b12454-654a-4062-87e3-abb5adc209ab/scratchpad/baseline-test.txt | tail -20` and record the failing spec files and counts in the scratchpad.
- [ ] **Step 2:** Run `npm run typecheck && npm run lint` and confirm both pass on the base commit.

---

### Task 1: Deslopify copy (FAST)

**Files:**

- Modify: `src/app/world/projects/deslopify/deslopify.data.ts`
- Test: `src/app/world/projects/deslopify/deslopify.data.spec.ts`

**Interfaces:**

- Consumes: nothing new. `StationPlate` is declared locally here as a structural type identical to Task 3's (`{ readonly kicker: string; readonly title: string; readonly text: string; readonly en: string }`) so this task does not wait for Task 3; Task 7 switches the import.
- Produces:

```ts
export interface PlateCopy {
  readonly kicker: string;
  readonly title: string;
  readonly text: string;
  readonly en: string;
}
export const PLATES: {
  readonly portal: PlateCopy;
  readonly laterne: PlateCopy;
  readonly pfad: PlateCopy;
  readonly stufen: (commits: number) => PlateCopy;
  readonly bogen: PlateCopy;
  readonly exponat: PlateCopy;
  readonly wandOn: PlateCopy;
  readonly wandOff: PlateCopy;
  readonly hoehle: PlateCopy;
  readonly langs: (line: string) => PlateCopy;
  readonly cairn: (release: string | null) => PlateCopy;
  readonly liana: PlateCopy;
};
export const STATION_NAMES: readonly [
  'Laterne',
  'Feed-Pfad',
  'Commit-Stufen',
  'Bogen',
  'Exponat',
  'Feed-Wand',
  'Höhle',
];
export const TOASTS: {
  readonly lantern: 'Die Laterne leuchtet auf';
  readonly falls: 'Hinter dem Wasserfall';
  readonly wallOff: 'Deslopify aus: der Slop wächst zurück';
  readonly wallOn: 'Deslopify an: neuer Ring von der Wand';
  readonly liana: 'Die Glühwürmchen stieben auf';
};
export const PITCH: {
  readonly title: 'Deslopify';
  readonly line: 'YouTube ohne KI-Übersetzung · YouTube without AI translation';
};
export const MOMENT_BANNER: 'Deslopify installiert · der Dschungel wird entslopt';
```

- [ ] **Step 1: Write the failing test** — add to `deslopify.data.spec.ts`:

```ts
describe('Lichtung copy', () => {
  it('names the seven stations in story order', () => {
    expect(STATION_NAMES).toEqual([
      'Laterne',
      'Feed-Pfad',
      'Commit-Stufen',
      'Bogen',
      'Exponat',
      'Feed-Wand',
      'Höhle',
    ]);
  });
  it('fills the commit count into the steps plate', () => {
    expect(PLATES.stufen(4).text).toBe(
      'Elf Stufen hinauf zum Bogen, eine pro Zeitabschnitt. Stufen mit Commits leuchten. Bisher 4 Commits.',
    );
    expect(PLATES.stufen(1).text).toContain('Bisher 1 Commit.');
  });
  it('says no release yet when there is none', () => {
    expect(PLATES.cairn(null)).toEqual({
      kicker: 'Fund',
      title: 'Release-Steinmann',
      text: 'Noch kein Release.',
      en: 'No release yet.',
    });
    expect(PLATES.cairn('v1.2.0').text).toBe('Letztes Release: v1.2.0');
  });
  it('keeps the portal, wall and moment strings verbatim', () => {
    expect(PLATES.portal.en).toBe(
      'A browser extension that brings back original YouTube titles, thumbnails and audio. Follow the lantern.',
    );
    expect(PLATES.wandOff.text).toBe('Noch voller Slop. Erst unter dem Bogen installieren.');
    expect(MOMENT_BANNER).toBe('Deslopify installiert · der Dschungel wird entslopt');
    expect(TOASTS.wallOn).toBe('Deslopify an: neuer Ring von der Wand');
  });
  it('keeps every plate text to two lines of German and one of English', () => {
    const plates = [
      PLATES.portal,
      PLATES.laterne,
      PLATES.pfad,
      PLATES.stufen(4),
      PLATES.bogen,
      PLATES.exponat,
      PLATES.wandOn,
      PLATES.wandOff,
      PLATES.hoehle,
      PLATES.liana,
    ];
    for (const plate of plates) {
      expect(plate.text.length).toBeLessThanOrEqual(130);
      expect(plate.en.length).toBeLessThanOrEqual(110);
    }
  });
});
```

- [ ] **Step 2:** Run `npx ng test --watch=false --include='src/app/world/projects/deslopify/deslopify.data.spec.ts'`. Expected: FAIL, `PLATES` not exported.
- [ ] **Step 3: Implement** — every plate from spec §2 "Plates (Deslopify)" verbatim; `stufen(n)` ends `Bisher ${n} Commit${n === 1 ? '' : 's'}.` with English `'Eleven steps up to the arch, one per period. Lit steps had commits.'`; `langs(line)` is `{ kicker: 'Fund', title: 'Sprachsäulen', text: line, en: 'One bamboo stalk per language at the bridge ends, height = share.' }`; `cairn(null)` as the test, `cairn(v)` is `{ kicker: 'Fund', title: 'Release-Steinmann', text: \`Letztes Release: ${v}\`, en: \`Latest release: ${v}\` }`. All objects `as const`, no logic beyond the three functions.
- [ ] **Step 4:** Run the spec again. Expected: PASS. Run `npm run typecheck && npm run lint`.
- [ ] **Step 5:** `git commit -am "Add the Lichtung plates, toasts, pitch and moment banner copy"`

---

### Task 2: Camera shots in the engine (COMPLEX)

**Files:**

- Create: `src/app/engine/camera/camera-shot.ts`, `src/app/engine/camera/camera-shot.spec.ts`
- Modify: `src/app/engine/engine.service.ts` (+ its spec)

**Interfaces:**

- Produces:

```ts
// camera-shot.ts
export interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }
export interface ShotPose { readonly position: Vec3Like; readonly target: Vec3Like; readonly fov?: number }
export type ShotKind = 'arrival' | 'moment';
export interface CameraShot { readonly kind: ShotKind; readonly pose: ShotPose; readonly duration: number; weight(t: number): number }
export const ARRIVAL = { hold: 1.2, ease: 1.8 } as const;      // weight 1 until 1.2 s, smoothstep to 0 by 3.0 s
export const MOMENT = { rise: 0.5, total: 2.6, fall: 0.5 } as const; // 0→1 over 0.5 s, hold, 1→0 over the last 0.5 s
export const SKIP_SECONDS = 0.3;
export function arrivalShot(pose: ShotPose, reducedMotion: boolean): CameraShot; // reduced: 1 until 1.2 s, then 0
export function momentShot(pose: ShotPose, reducedMotion: boolean): CameraShot;  // reduced: 1 for 2.6 s, then 0
/** Applies weight w of `pose` over the camera the rig has just placed (position lerp, look slerp, FOV lerp). */
export function blendCamera(camera: PerspectiveCamera, pose: ShotPose, w: number): void;

// EngineService additions
playShot(shot: CameraShot): void;          // replaces a running shot
skipShot(): void;                          // eases the current weight to 0 over SKIP_SECONDS (instantly under reduced motion)
endShot(): void;                           // stops at once, no easing (swap, restart)
onShotChange(listener: (kind: ShotKind | null) => void): () => void; // fires on start and end only
```

- [ ] **Step 1: Write failing tests** in `camera-shot.spec.ts`:

```ts
describe('arrivalShot', () => {
  const pose = { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } };
  it('holds the overview, then eases down to the rig by 3 s', () => {
    const shot = arrivalShot(pose, false);
    expect(shot.weight(0)).toBe(1);
    expect(shot.weight(1.2)).toBe(1);
    expect(shot.weight(2.1)).toBeCloseTo(0.5, 5);
    expect(shot.weight(3.0)).toBe(0);
    expect(shot.duration).toBe(3.0);
  });
  it('cuts under reduced motion', () => {
    const shot = arrivalShot(pose, true);
    expect(shot.weight(1.19)).toBe(1);
    expect(shot.weight(1.21)).toBe(0);
  });
});
describe('momentShot', () => {
  it('rises, holds and falls within 2.6 s', () => {
    const shot = momentShot(
      { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } },
      false,
    );
    expect(shot.weight(0)).toBe(0);
    expect(shot.weight(0.5)).toBe(1);
    expect(shot.weight(1.5)).toBe(1);
    expect(shot.weight(2.6)).toBe(0);
  });
});
describe('blendCamera', () => {
  it('leaves the rig pose alone at weight 0 and takes the shot pose at weight 1', () => {
    const camera = new PerspectiveCamera(60, 16 / 9);
    camera.position.set(1, 2, 3);
    camera.lookAt(1, 2, 0);
    const before = camera.quaternion.clone();
    blendCamera(camera, { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } }, 0);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.quaternion.equals(before)).toBe(true);
    blendCamera(
      camera,
      { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 }, fov: 50 },
      1,
    );
    expect(camera.position.toArray()).toEqual([0, 24, 36]);
    expect(camera.fov).toBe(50);
  });
});
```

In the engine spec (follow its existing harness for a fake renderer/tick): a shot started with `playShot` reports `'arrival'` to `onShotChange`, blends after `rig.sync` each tick, reports `null` when the timeline ends; a movement intent during a shot triggers the skip (weight reaches 0 within 0.3 s of ticks); `endShot` reports `null` at once; the FOV is restored to the rig's value after the shot.

- [ ] **Step 2:** Run `npx ng test --watch=false --include='src/app/engine/camera/**' --include='src/app/engine/engine.service.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.** Weight curves as in the interface comments (smoothstep `s = t²(3 − 2t)`). `blendCamera` keeps a module-level scratch `Vector3`/`Quaternion`/`Matrix4` (no per-frame allocation), lerps position, slerps the camera quaternion toward the look-at quaternion of the shot pose, lerps FOV and calls `updateProjectionMatrix()` only when FOV changed. In `EngineService.tick`, after `this.rig.sync(...)`: advance `shotTime`, compute `w` (times the skip factor), `blendCamera`, end the shot when `shotTime ≥ duration` or the skip factor reaches 0. A movement or jump in the frame's intent calls `skipShot()`. Store the rig's FOV at `playShot` and restore it at the end. `onShotChange` listeners fire only on start and end. Under reduced motion (`this.capability.reducedMotion()`) skip is instant.
- [ ] **Step 4:** Run the specs. Expected: PASS. `npm run typecheck && npm run lint`.
- [ ] **Step 5:** `git commit -am "Let the engine blend scripted camera shots over the rig"`

---

### Task 3: Stations kit — glides, director, store, keys (COMPLEX)

**Files:**

- Create: `src/app/engine/stations/station.ts`, `src/app/engine/stations/glide.ts`, `glide.spec.ts`, `src/app/features/world/station-director.ts`, `station-director.spec.ts`
- Modify: `src/app/engine/world-object.ts`, `src/app/engine/engine.service.ts` (+spec), `src/app/engine/input.service.ts` (+spec), `src/app/ui/store/world.store.ts` (+spec), `src/app/features/world/scene-director.ts` (+spec), `src/app/features/world/world.page.ts`, `src/app/world/project/project.scene.ts` (options only)

**Interfaces:**

- Consumes: Task 2's `CameraShot`, `ShotPose`, `arrivalShot`, `momentShot`, `playShot`, `skipShot`, `endShot`, `onShotChange`.
- Produces:

```ts
// engine/stations/station.ts
export interface GroundPoint { readonly x: number; readonly z: number }
export interface StationStand extends GroundPoint { readonly yaw: number }
export interface StationPlate { readonly kicker: string; readonly title: string; readonly text: string; readonly en: string }
export interface StationSpec { readonly id: string; readonly name: string; readonly stand: StationStand; readonly trigger: number; readonly plate: () => StationPlate }
export interface ScenePitch { readonly title: string; readonly line: string }

// engine/world-object.ts — WorldScene gains, all optional:
readonly stations?: readonly StationSpec[];
readonly portalStand?: StationStand;
readonly overview?: ShotPose;
readonly pitch?: ScenePitch;
glidePath?(from: GroundPoint, to: GroundPoint): readonly GroundPoint[]; // default: [from, to]
plateAt?(x: number, z: number): StationPlate | null;                  // finds and the portal

// engine/stations/glide.ts
export const GLIDE = { speed: 22, min: 0.7, max: 1.6, ignoreBelow: 0.4 } as const;
export interface Glide { readonly points: readonly GroundPoint[]; readonly length: number; readonly duration: number; readonly endYaw: number }
export function planGlide(points: readonly GroundPoint[], endYaw: number): Glide | null; // null when length < 0.4
export function sampleGlide(glide: Glide, t: number): { x: number; z: number; yaw: number }; // t in seconds, eased; yaw = travel direction, endYaw at the end

// EngineService additions
glide(glide: Glide): void;   // reduced motion: teleport to the end at once
cancelGlide(): void;
readonly gliding: () => boolean;
// While gliding, tick() skips player.update, sets position x/z from sampleGlide, y from floorHeightAt(...)+eye height, yaw from the sample, and still runs rig, avatar, interaction and world.update. Movement intent cancels the glide.

// input.service.ts
export type InputAction = … | 'portal' | 'station1' | 'station2' | 'station3' | 'station4' | 'station5' | 'station6' | 'station7' | 'station8';
// Digit0 → 'portal', Digit1…Digit8 → 'station1'…'station8' (and Numpad0…8), world mode only, not global.

// features/world/station-director.ts
export type ChipState = 'here' | 'visited' | 'next' | 'open';
export interface StationChip { readonly index: number; readonly id: string; readonly name: string; readonly state: ChipState }
export class StationDirector {
  constructor(stations: readonly StationSpec[], plateAt?: (x: number, z: number) => StationPlate | null);
  /** Returns true when chips or plate changed since the last call. */
  update(x: number, z: number): boolean;
  chips(): readonly StationChip[];
  plate(): StationPlate | null;
  reset(): void;
}

// ui/store/world.store.ts additions
readonly stations = signal<readonly StationChip[]>([]);
readonly plate = signal<StationPlate | null>(null);
readonly toast = signal<{ readonly text: string; readonly id: number } | null>(null);
readonly banner = signal<string | null>(null);
readonly pitch = signal<ScenePitch | null>(null);
readonly shot = signal<ShotKind | null>(null);
readonly glideRequest = signal<number | null>(null); // 0 = portal, 1…8 = station
showToast(text: string): void;  // new id each call; cleared after 2.2 s by the director
requestGlide(index: number): void;

// project.scene.ts ProjectSceneOptions additions
readonly onToast?: (text: string) => void;
readonly onMoment?: (banner: string) => void;
```

`SceneDirector` responsibilities: on `place(scene)`: build a `StationDirector` when `scene.stations` exists, else clear `stations`/`plate`; if `scene.overview` and the session key `gitplore.arrival.<sceneId>` is unset (try/catch; failure means unset), set it, `engine.playShot(arrivalShot(overview, reduced))` and `store.pitch.set(scene.pitch ?? null)`. A per-frame tickable updates the station director from `engine.player.position` and writes `stations`/`plate` only on change. `glideTo(index)` builds the path with `scene.glidePath?.(from, to) ?? [from, to]`, then `engine.glide(planGlide(path, stand.yaw))`. `onMoment(banner)` → `store.banner.set(banner)`, `engine.playShot(momentShot(overview, reduced))`, banner cleared on the shot's end. `onToast` → `store.showToast`, cleared 2.2 s later. Any station key or action while a shot runs calls `engine.skipShot()` first. On swap, restart and destroy: `engine.endShot()`, `engine.cancelGlide()`, reset the station director, clear `plate`, `toast`, `banner`, `pitch`. `store.shot` mirrors `engine.onShotChange`.

`world.page.ts`: `onAction` maps `portal` → `director.glideTo(0)`, `stationN` → `director.glideTo(N)`, only when `store.inputMode() === 'world'`; an effect on `store.glideRequest()` does the same and clears it.

- [ ] **Step 1: Write failing tests.**

`glide.spec.ts`:

```ts
it('takes length / 22 seconds, clamped to 0.7–1.6', () => {
  expect(
    planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -11 },
      ],
      0,
    )!.duration,
  ).toBeCloseTo(0.7);
  expect(
    planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -22 },
      ],
      0,
    )!.duration,
  ).toBeCloseTo(1.0);
  expect(
    planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -60 },
      ],
      0,
    )!.duration,
  ).toBeCloseTo(1.6);
});
it('ignores glides under 0.4 m', () => {
  expect(
    planGlide(
      [
        { x: 0, z: 0 },
        { x: 0.3, z: 0 },
      ],
      0,
    ),
  ).toBeNull();
});
it('follows the polyline with ease-in-out and ends at the stand yaw', () => {
  const glide = planGlide(
    [
      { x: 0, z: 0 },
      { x: 0, z: -10 },
      { x: 10, z: -10 },
    ],
    1.2,
  )!;
  expect(sampleGlide(glide, glide.duration / 2)).toMatchObject({ x: 0, z: -10 });
  expect(sampleGlide(glide, glide.duration)).toEqual({ x: 10, z: -10, yaw: 1.2 });
  expect(sampleGlide(glide, glide.duration / 4).z).toBeGreaterThan(-5); // eased: slower than linear at the start
});
```

`station-director.spec.ts`: with three stations 10 m apart (trigger 3): at start all `open` except the first `next`; entering station 1 makes it `here`, 2 `next`; leaving makes 1 `visited`; `plate()` is station 1's plate inside its trigger, `plateAt`'s result elsewhere, `null` otherwise; `update` returns false when nothing changed; `reset()` restores the start.

`input.service.spec.ts`: `Digit3` emits `station3`, `Digit0` emits `portal`, `Numpad5` emits `station5`; none are emitted in `ui` or `captured` mode.

`world.store.spec.ts`: `showToast` twice gives two ids; `requestGlide(4)` sets `glideRequest` to 4.

`scene-director.spec.ts` (follow the existing fakes): a scene with `stations` and `overview` plays an arrival shot once per session key and sets `pitch`; a second placement of the same scene in the same session does not; a throwing `sessionStorage` still plays it; a scene without stations leaves `stations` empty and plays nothing; `glideTo(2)` calls `engine.glide` with the scene's path ending at station 2's stand; `restart()` during a moment calls `endShot` and `cancelGlide` and clears `banner`, `toast`, `plate` and visited state; swapping scenes does the same.

`engine.service.spec.ts`: while gliding, a tick moves the player along the glide and ignores colliders; movement intent cancels; reduced motion teleports.

- [ ] **Step 2:** Run the new and touched specs. Expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces. The ease is `t < .5 ? 2t² : 1 − (−2t + 2)² / 2`; yaw during travel is `atan2(−dx, −dz)` of the current segment (yaw 0 faces −z). `ProjectScene` only gains the two options and forwards them; it does not declare stations (Task 7 does).
- [ ] **Step 4:** Run the specs, `npm run typecheck && npm run lint`, and `npm test` to confirm no new failures against the baseline.
- [ ] **Step 5:** `git commit -am "Add stations, glides and the arrival and moment camera wiring"`

---

### Task 4: HUD — station bar, plate, toast, banner, pitch (MID)

**Files:**

- Create: `src/app/ui/hud/station-bar.ts`, `station-bar.spec.ts`, `src/app/ui/hud/hud-plate.ts`, `hud-plate.spec.ts`
- Modify: `src/app/ui/hud/hud.ts`, `hud.spec.ts`

**Interfaces:**

- Consumes: Task 3's store signals `stations`, `plate`, `toast`, `banner`, `pitch`, `shot`, `requestGlide`, types `StationChip`, `StationPlate`, `ScenePitch`; `CapabilityService.reducedMotion` for the pulse.
- Produces: `<app-station-bar>` (inputs `chips: StationChip[]`, `hidden: boolean`; output `glide: number`), `<app-hud-plate>` (input `plate: StationPlate | null`), both standalone, `ChangeDetectionStrategy.OnPush`.

Visual contract (spec §2 and §3, exact values):

- Bar: `position:absolute; left:0; right:0; bottom:14px; display:flex; justify-content:center; gap:6px; pointer-events:auto` on the buttons only; hidden = `opacity:0; pointer-events:none; transition: opacity .4s`. Hidden while `store.shot() === 'arrival'` and for the first 2.6 s of it (a 2.6 s timer started on `shot` becoming `arrival`; the bar shows on the earlier of timer or shot end).
- Chip colours per the spec's state table; the `next` pulse is a CSS `@keyframes` on `box-shadow` between `0 0 0 2px rgba(224,161,60,.2)` and `0 0 0 4px rgba(224,161,60,.45)` over `1.57s` (sin(4t) period), `animation: none` under `prefers-reduced-motion` or when reduced motion is on.
- Chip mark `✓` for visited, else the number. `aria-label="Station {n}: {name}"`, `data-role="station-chip"`, `data-state="{state}"`, `:focus-visible` outline `2px solid #e0a13c`.
- Plate: bottom-left, `left:16px; bottom:62px; max-width: min(520px, calc(100vw - 32px))`, card `background: rgb(20 27 23 / 88%); border:1px solid #3a4a3f; border-radius:10px; padding:14px 18px; display:flex; flex-direction:column; gap:6px`; fonts and colours per spec; `data-role="plate"`; fades 0.25 s (no transition under reduced motion). `text-shadow: none` inside the card.
- Prompt moves to `bottom: 62px` when chips exist (it stays centred).
- Toast: `data-role="toast"`, top 70 px centred, styles per spec §4, `aria-live="polite"`, fades over its last 0.4 s via CSS animation `2.2s`, keyed on the toast id so a repeat restarts it.
- Banner: `data-role="moment-banner"`, top 70 px centred, amber pill per spec §3, opacity transition 0.3 s; while a banner shows, the toast sits at top 112 px.
- Pitch: `data-role="pitch"`, centred at `top: 36%`, title `800 64px/1 Barlow` white `text-shadow: 0 2px 18px rgb(0 0 0 / 60%)`, line `500 18px system-ui` `#f4efe4`; opacity animation 2.7 s implementing `clamp(min((t − 0.15)/0.4, (2.7 − t)/0.4), 0, 1)` as keyframes (0 % and 5.6 % → 0, 20.4 % → 1, 85.2 % → 1, 100 % → 0); shown only while `shot() === 'arrival'` and `pitch()` is set. Font sizes clamp down on narrow screens (`font-size: clamp(40px, 9vw, 64px)`).
- All new elements are inside the existing `@case ('ready')` block.

- [ ] **Step 1: Write failing tests.** `station-bar.spec.ts`: renders one button per chip with the right `data-state`, mark and label; clicking the third emits `glide` with index 3; `hidden` sets `aria-hidden` and `inert`. `hud-plate.spec.ts`: renders kicker, title, text, en; renders nothing for `null`. `hud.spec.ts`: with `store.stations` set the bar shows; `store.showToast('x')` shows the toast; `store.banner.set('b')` shows the banner; `store.pitch` with `store.shot` `'arrival'` shows the pitch, and not with `'moment'`; clicking a chip calls `store.requestGlide`.
- [ ] **Step 2:** `npx ng test --watch=false --include='src/app/ui/hud/**'`. Expected: FAIL.
- [ ] **Step 3: Implement** the two components and the HUD additions per the visual contract. No per-frame signal writes.
- [ ] **Step 4:** Specs pass; `npm run typecheck && npm run lint && npm run a11y:check` (if `a11y:check` needs a build, run `npm run build` first).
- [ ] **Step 5:** `git commit -am "Show the station bar, plates, toasts, the moment banner and the arrival pitch in the HUD"`

---

### Task 5: The bowl — layout, terrain, rill, cliff, deck, steps (COMPLEX)

**Files:**

- Rewrite: `src/app/world/environments/jungle-layout.ts`, `jungle-layout.spec.ts`
- Modify: `src/app/world/environments/jungle.ts`, `jungle.spec.ts`, `jungle-bridge.ts`, `third-person-clearance.spec.ts`, `reseed.spec.ts`, `environments.spec.ts` as needed
- Create: `src/app/world/environments/jungle-steps.ts` (procedural commit steps + colliders), `jungle-cave.ts` (procedural cliff face with cave + colliders), with specs
- Modify only to keep compiling and placed: `src/app/world/projects/deslopify/deslopify.scene.ts`, `deslopify.flow.ts`, `src/app/features/world/scene-director.ts` (test hook point)

**Interfaces:**

- Produces (all metres, `jungle-layout.ts`, three.js-free):

```ts
export interface Pt {
  readonly x: number;
  readonly z: number;
}
export interface Placed extends Pt {
  readonly yaw: number;
}
export const BOWL: { readonly rx: 29.2; readonly rz: 21.4 };
export function inBowl(x: number, z: number): boolean;
export const PORTAL: Placed; // (0, 20.6), yaw 0
export const LANTERN_POST: Placed; // (−2, 18)
export const STATION_STANDS: Readonly<
  Record<'laterne' | 'pfad' | 'stufen' | 'bogen' | 'exponat' | 'wand' | 'hoehle', Placed>
>;
export const CARD_SLOTS: readonly Placed[]; // 4, facing the boardwalk
export const TAG_SLOTS: readonly (Pt & { readonly y: number })[]; // 4
export const VINE_SLOTS: readonly (Pt & { readonly r: number })[]; // 14
export const BAMBOO: readonly Pt[]; // 4, order: largest share first
export const CAIRN: Pt;
export const LIANA: Placed;
export const FIREFLY_GLADE: Pt & { readonly rx: number; readonly rz: number };
export const EXHIBIT: Placed;
export const WALL: Placed;
export const STELE: Placed;
export const POOL: Pt & { readonly rx: number; readonly rz: number; readonly level: number };
export const WATERFALL: {
  readonly x0: number;
  readonly x1: number;
  readonly z: number;
  readonly top: number;
  readonly bottom: number;
};
export const CAVE: {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly floor: number;
  readonly height: number;
};
export const CLIFF: { readonly z: number; readonly width: number; readonly height: number };
export const ARCH: Pt;
export const DECK: { readonly halfWidth: 1.45; readonly halfLength: 1.6; readonly height: 2.4 };
export function underArch(x: number, z: number): boolean; // x −1.4…1.4, z −0.8…0.8
export function crossesArch(a: Pt, b: Pt): boolean; // segment test, Review Focus 1
export const STEPS: {
  readonly from: Pt;
  readonly to: Pt;
  readonly count: 11;
  readonly bottom: 0.8;
  readonly top: 2.4;
};
export function stepCentres(): readonly (Pt & { readonly y: number })[]; // 11
export const BOARDWALK: readonly Pt[];
export const NORTH_LOOP: readonly Pt[];
export const BEHIND_FALLS: {
  readonly x0: -1.2;
  readonly x1: 1.2;
  readonly z0: -21;
  readonly z1: -18.2;
};
export const RILL: { readonly halfWidth: 0.9; centreZ(x: number): number };
export function jungleHeightAt(x: number, z: number): number;
export function glidePath(from: Pt, to: Pt): readonly Pt[]; // shortest route over BOARDWALK ∪ NORTH_LOOP; joins from/to to their nearest path points
export function pathLength(points: readonly Pt[]): number;
export const TOUR: readonly (keyof typeof STATION_STANDS)[]; // story order
```

- [ ] **Step 1: Write failing tests** in `jungle-layout.spec.ts` (replace the old file):

```ts
it('fits the bowl inside 60 × 45 m', () => {
  expect(BOWL.rx * 2).toBeLessThanOrEqual(60);
  expect(BOWL.rz * 2).toBeLessThanOrEqual(45);
});
it('keeps the tour at most 60 m and stations 3–14 m apart', () => {
  const stops = [PORTAL, ...TOUR.map((id) => STATION_STANDS[id])];
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const leg = pathLength(glidePath(stops[i - 1], stops[i]));
    if (i > 1) {
      expect(leg).toBeGreaterThanOrEqual(3);
      expect(leg).toBeLessThanOrEqual(14);
    }
    total += leg;
  }
  expect(total).toBeLessThanOrEqual(60);
});
it('looks from the portal through the arch at the exhibit', () => {
  expect(crossesArch(PORTAL, EXHIBIT)).toBe(true);
});
it('follows the section heights', () => {
  expect(jungleHeightAt(0, 20)).toBeCloseTo(3.0, 1);
  expect(jungleHeightAt(-7, 11.6)).toBeCloseTo(0.3, 1);
  expect(jungleHeightAt(0, -8)).toBeCloseTo(1.0, 1);
  expect(jungleHeightAt(0, RILL.centreZ(0))).toBeCloseTo(-0.8, 1);
  expect(stepCentres()[0].y).toBeGreaterThan(0.8);
  expect(stepCentres()[10].y).toBeCloseTo(2.4, 2);
});
it('rises into a rim outside the bowl', () => {
  expect(jungleHeightAt(BOWL.rx + 4, 0)).toBeGreaterThan(8);
  expect(jungleHeightAt(0, -BOWL.rz - 4)).toBeGreaterThan(8);
});
it('detects a glide segment that jumps over the arch trigger', () => {
  expect(crossesArch({ x: 0, z: 3 }, { x: 0, z: -3 })).toBe(true);
  expect(crossesArch({ x: 5, z: 3 }, { x: 5, z: -3 })).toBe(false);
});
it('routes to the cave behind the waterfall', () => {
  const path = glidePath(STATION_STANDS.exponat, STATION_STANDS.hoehle);
  expect(path.some((p) => p.z < -18.2 && p.z > -21 && Math.abs(p.x) > 1.2)).toBe(true);
  for (const p of path)
    expect(Math.hypot((p.x - POOL.x) / POOL.rx, (p.z - POOL.z) / POOL.rz)).toBeGreaterThan(1);
});
it('has no dead end longer than 15 m', () => {
  /* every path endpoint that is not on the loop lies within 15 m of a junction */
});
```

`jungle.spec.ts`: the floor, scatter and colliders stay inside the bowl (no plant or rock outside `inBowl`, none within 1.4 m of `BOARDWALK`/`NORTH_LOOP`); the rill can be crossed only on the deck (a collider test: a walk from (4, 2) to (4, −2) is blocked, one from (0, 2) to (0, −2) at deck height is not); the steps are walkable `top` colliders rising 0.8 → 2.4; the cave's side walls block, its mouth behind the falls is open; foliage counts per tier are scaled to the bowl's area and are no higher than today's.

- [ ] **Step 2:** Run `npx ng test --watch=false --include='src/app/world/environments/**'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `jungle-layout.ts`: all values from spec §1. `jungleHeightAt`: piecewise by `z` along the axis with smooth transitions (smoothstep over 1–2 m), marsh at 0.3 with shallow pool dips, the rill carved to −0.8 along `RILL.centreZ` (the spec's Bézier, converted), the north glade at 1.0, the pool dip to 0.4 − depth, the cliff and the rim rising outside `inBowl` (≥ 8 m within 4 m beyond the ellipse, the south lip behind the portal ledge lower). Keep a small deterministic noise (≤ 0.08 m) off the paths.
  - `glidePath`: build a graph from `BOARDWALK`, the steps (`STEPS.from` → `STEPS.to`), the deck to `ARCH`, and `NORTH_LOOP`; Dijkstra over nodes; attach `from`/`to` to the nearest segment points.
  - `jungle.ts`: floor sized to the bowl plus rim (about 90 × 75 m, segment count scaled for ~0.5 m cells), water: the rill and the pool (reuse `Water`), the waterfall at `WATERFALL` from `CLIFF.height`, remove brook, stream, trails and spurs; scatter and groves only inside the bowl and off the paths; light shafts placed relative to the new layout; `BOUNDS` and edge colliders from the ellipse (a ring of cylinder colliders just inside `inBowl`, open only at the portal ledge's back which is closed by the rim height); `toyLayout()` returns `terminal = STELE`, `lever = LIANA`, `languages = BAMBOO`, `releases = [CAIRN]`, `stars = FIREFLY_GLADE`, ridge removed from the jungle (the steps replace it); `anchors()` puts the exhibit at `EXHIBIT`.
  - `jungle-bridge.ts`: deck `DECK` at +2.4 m over the rill, 2.9 m wide and 3.2 m long, walkable `top`; the arch model placed at the deck; the procedural arch opening 3.2 m.
  - `jungle-steps.ts`: 11 procedural steps along `STEPS` with rope rails, each a walkable `top` collider; exposes `setLit(index, commits: boolean)` for Task 7; loads `commit-steps.glb` when present (Task 6) by node names `step_00`…`step_10` and material `inlay`, else stays procedural.
  - `jungle-cave.ts`: procedural cliff face across `CLIFF.width` at `CLIFF.z` with a notch for the falls and the cave box `CAVE` behind it, colliders for the walls; loads `cave-cliff.glb` when present (named `cave_floor`, `collider`).
  - Update `deslopify.scene.ts` and `deslopify.flow.ts` only as far as needed to compile and place props at the new constants (cards at `CARD_SLOTS`, wall at `WALL`, lantern at `LANTERN_POST`, vines and tags at their slots, flow's arch/lantern points); keep behaviour. Move the test hook `deslopify:bridge-south` to `STEPS.from` at step height.
- [ ] **Step 4:** Run the environment and Deslopify specs, then `npm test` (no new failures vs baseline), `npm run typecheck && npm run lint`, `npm run build`.
- [ ] **Step 5:** `git commit -am "Shrink the jungle to the Lichtung bowl on one axis"`

---

### Task 6: Blender models (COMPLEX, Blender headless or live over MCP)

**Files:**

- Create: `scripts/blender/models/commit_steps.py`, `feed_wall.py`, `cave_cliff.py`, `exhibit_easel.py`
- Modify: `scripts/blender/models/arch.py` (refit only if needed), `scripts/blender/author.py`, `scripts/lib/environment-models.mjs`
- Generated: `assets-src/models/{commit-steps,feed-wall,cave-cliff,exhibit-easel}.glb`, `public/assets/models/*`, `public/assets/models/manifest.json`

**Interfaces:**

- Consumes: `scripts/blender/kit.py` (`Part.box/prism/rock/mesh/tube`, `material`, `bake_occlusion`, `export`, `P()` game frame +Y up, metres, origin at the ground centre). Read `AGENTS.md` §"3D models" and two existing models (`arch.py`, `card_frame.py`) first.
- Produces (names the game reads, exactly):
  - `commit-steps.glb`: 11 objects `step_00`…`step_10` (each one step module with its rope-rail posts), material `inlay` on each step's inset strip, a wood material, a rope material. Origin at the foot of the flight, level with the boardwalk deck (the game places it at +0.8 m); step `i` top at `y = 1.6·(i+1)/11`; the flight runs 4.8 m along −z and is 1.4 m wide. ≤ 2.5k tris.
  - `feed-wall.glb`: stone wall 5.6 m wide, 2.6 m tall, ~0.5 m deep, facing +z; four empties `slot_0`…`slot_3` at the card-frame centres (slot spacing to fit `card-frame`'s outer size, read it from `card_frame.py`); object `lever` with its origin at the hinge, to the wall's right. ≤ 2k tris.
  - `cave-cliff.glb`: faceted cliff face ~30 m wide, 9 m tall, facing +z, with a notch at x −1…1 for the falls and a cave 2.8 × 2.6 m, 3.2 m deep behind it; object `cave_floor` (the walkable floor), object `collider` (a low-poly closed hull of the walls, hidden in game). ≤ 5k tris.
  - `exhibit-easel.glb`: wooden easel frame with a 3.4 × 2.4 m opening, facing +z; empty `screen_anchor` at the opening's centre. ≤ 1k tris.
  - `jungle-arch.glb`: check the clear opening is ≥ 3.2 m and the deck span fits 2.9 m width; refit the script only if not.

- [ ] **Step 1:** Write each model script with the kit, following `arch.py`'s structure; register each in `author.py`'s `MODELS` (`"commit-steps": ("commit_steps", 0.6, 0.6, True)` etc.) and under `'jungle'` in `environment-models.mjs`.
- [ ] **Step 2:** If Blender's GUI with the MCP add-on is open (`get_addon_status` answers), iterate with `scripts/blender/live.py` and `get_viewport_screenshot`; otherwise run `scripts/blender/preview.py` headless and look at the contact sheet. Iterate until each model reads well from 20 m and from 2 m.
- [ ] **Step 3:** `npm run assets:author && npm run assets:optimize`. Record triangles and compressed sizes (tens of kB each).
- [ ] **Step 4:** `npm run test:scripts` (the manifest and environment-models tests) and `npm run build`.
- [ ] **Step 5:** `git add scripts assets-src public/assets/models && git commit -m "Model the commit steps, feed wall, cave cliff and exhibit easel in Blender"`

---

### Task 7: Deslopify on the Lichtung — flow, stations, fireflies, models in place (COMPLEX)

**Files:**

- Modify: `src/app/world/projects/deslopify/deslopify.flow.ts` (+spec), `deslopify.scene.ts` (+spec), `feed-card.ts` (`FeedWall` loads `feed-wall.glb`), `deslopify.data.ts` (switch `PlateCopy` to `StationPlate`), `src/app/world/project/project.scene.ts` (exhibit easel; pass stations through), `src/app/world/environments/data/star-lanterns.ts` (jungle skin: swarm behaviour) (+spec)

**Interfaces:**

- Consumes: Task 1 copy; Task 3 `StationSpec`, `WorldScene` hooks, `onToast`, `onMoment`; Task 5 layout exports, `JungleSteps.setLit`, `glidePath`, `crossesArch`; Task 6 model names.
- Produces: `DeslopifyScene` implements `stations` (7, from `TOUR`, trigger 3, plates from `PLATES`, `stufen` with the project's commit count, `wand` choosing `wandOn`/`wandOff` by flow state), `portalStand = PORTAL`, `overview` (start `{ position: {x:0,y:24,z:36}, target: {x:0,y:0,z:-6} }`, tuned in Task 10), `pitch = PITCH`, `glidePath = glidePath`, `plateAt` (portal within 3 m, languages within 3 m but not on the deck, cairn and liana within 2.6 m).

`FLOW` becomes:

```ts
export const FLOW = {
  ignitionRadius: 2.6,
  carryDelay: 0.9,
  lightRadius: 8,
  lightCore: 0.7,
  ringSpeed: 17,
  ringShrink: 24,
  ringMax: 72,
  ringVisible: 70,
  ringEdge: 4,
  cardOn: 2.2,
  cardOff: 0.9,
  wallOn: (i: number) => 2.4 - 0.35 * i,
  wallOff: (i: number) => 1.2 + 0.2 * i,
  tagOn: 2.6,
  tagOff: 1.2,
  vineRetreat: 3,
  vineRegrow: 0.35,
  stepReach: 2.4,
} as const;
```

- [ ] **Step 1: Write failing tests** in `deslopify.flow.spec.ts`: a player segment from (0, 3) to (0, −3) in one frame installs (Review Focus 1); after install at the arch, a card at `CARD_SLOTS[0]` is cleared once `ring > distance`, which takes `distance / 17` s; the ring stops at 72 m; with the wall off it shrinks at 24 m/s; north-bank wall cards start slopped (w = 0) and stay slopped before install; a step lights when the player comes within 2.4 m and stays lit until `reset`; the lantern ignites at 2.5 m and not at 2.7 m; `onToast` receives `TOASTS.lantern` once per ignition and `TOASTS.falls` on entering `BEHIND_FALLS` (not repeatedly while inside); `reset` clears lit steps, toasts state and ring. In `deslopify.scene.spec.ts`: `stations` lists the seven names in order; `plateAt(PORTAL)` is the portal plate; `onMoment(MOMENT_BANNER)` is called once on install from the arch, not on the wall's re-enable, and again after `restart`; the liana burst calls `onToast(TOASTS.liana)`; the `wand` plate follows the flow state.
- [ ] **Step 2:** Run the Deslopify specs. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Flow: constants above; the segment test with `crossesArch(previous, current)`; the north half starts in slop (drop `NORTH_BANK_HAZE` use); steps; falls toast; clear-mask helper `clearance(x, z): number` (0 = slop, 1 = clear) combining the lantern's soft light (full inside `0.7 R`, 0 at `R`) and the ring (full inside `ring`, 0 at `ring + 4`), exported for Task 8.
  - Scene: places the four cards facing the boardwalk, tags and vines at their slots, the lantern post at `LANTERN_POST`, the wall at `WALL` (loads `feed-wall.glb`, cards in `slot_0`…`slot_3`, lever animates on toggle), the exhibit's `ScreenLandmark` inside the easel (loads `exhibit-easel.glb` at `EXHIBIT`, screen at `screen_anchor`), steps lit via `JungleSteps.setLit(i, bucket > 0)` using the project's `commitBuckets` resampled to 11; the ring band scaled to the new ring; fireflies: the jungle star-lantern skin becomes a swarm of 14 (8 on low) over `FIREFLY_GLADE`, drifting, gathering around the player within 11 m of the lit lantern, bursting outward on the liana pull (decay 1.25 s), brighter once installed; the liana's interact triggers the burst and the toast as well as the existing reseed.
  - `ProjectScene`: forward `stations`, `portalStand`, `overview`, `pitch`, `glidePath`, `plateAt` from subclasses (default undefined).
- [ ] **Step 4:** Deslopify and project specs pass; `npm test` (no new failures), `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 5:** `git commit -am "Run the Deslopify flow on the Lichtung with stations, plates, fireflies and the new models"`

---

### Task 8: Ground haze (COMPLEX, shader)

**Files:**

- Create: `src/app/world/environments/shaders/ground-haze.ts`, `ground-haze.spec.ts`
- Modify: `src/app/world/environments/shaders/atmosphere.ts` (a guarded term), `src/app/world/environments/jungle.ts` (`breathe`, `setSlop`, uniforms), `mood.ts` only if a slop tint constant moves

**Interfaces:**

- Consumes: Task 5 `jungleHeightAt`, `BOWL`, `inBowl`; the existing `clearing` uniforms (origin, radius) and the lantern light (position, radius) that `DeslopifyScene` already writes; Task 7's clearance rule (lantern `0.7 R → R`, ring `r → r + 4`).
- Produces: `JungleEnvironment.setGroundHaze(amount: number)` (0–1 global slop amount) and uniforms `uHazeLight: vec3 (x, z, radius)`; `DeslopifyScene` writes the lantern light each frame (Task 7 wires the call if it merged first; otherwise this task adds it).

- [ ] **Step 1: Write failing tests** in `ground-haze.spec.ts` for the CPU reference functions the shader mirrors: `hazeDensity(heightAboveGround)` is 1 at 0 m, falls monotonically, is 0 at and above 2.2 m; `hazeMask(x, z, clearing)` is 0 outside the bowl, 1 in slop inside it, 0 inside `0.7 R` of the lantern and inside the ring, 1 at `ring + 4`. The height above ground uses a baked height texture of `jungleHeightAt` (e.g. 128 × 96 over the bowl plus rim, `DataTexture` `FloatType` → fallback `UnsignedByte` with a range when float textures are missing); test the bake round-trips heights within 5 cm.
- [ ] **Step 2:** Run `npx ng test --watch=false --include='src/app/world/environments/shaders/**'`. Expected: FAIL.
- [ ] **Step 3: Implement.** Integrate the haze along the view ray in the fragment shader of the shared atmosphere patch (a short fixed-step march, 6 steps on low, 10 medium, 16 high, clamped to the first 60 m of the ray, only inside the bowl's bounding box), density `hazeDensity(y − groundAt(xz)) × hazeMask(xz) × amount`, colour `#8e3f86`, accumulated opacity capped at 0.42 × amount at full density. Replace the scene-wide slop lerp in `breathe()` with a light tint (≤ 25 % of the old slop mix); `SLOP_AIR` stays as the tint's target. WebGL1/SwiftShader: no dynamic loops over uniforms (constant step counts per tier via `#define`), no `texelFetch`. Loaded models already receive the atmosphere via `HazedCopies`; confirm they get the haze term too.
- [ ] **Step 4:** Specs pass; `npm run typecheck && npm run lint && npm run build`; run `npx playwright test tests/shaders.spec.ts` for compile errors on SwiftShader. Check a screenshot of the overview and of the boardwalk at medium and high tier in the running game (`npm start`, `/p/deslopify`).
- [ ] **Step 5:** `git commit -am "Lay the slop as a ground haze the ring and the lantern clear"`

---

### Task 9: End-to-end (MID)

**Files:**

- Modify: `tests/deslopify.spec.ts`, and if needed `tests/worlds.spec.ts`, `src/app/features/world/scene-director.ts` (test hooks)

**Interfaces:**

- Consumes: HUD data roles from Task 4 (`station-chip`, `plate`, `toast`, `moment-banner`, `pitch`, `world-status`), keys from Task 3.

- [ ] **Step 1: Write the test** (replace the walk in `tests/deslopify.spec.ts`, keep its boot/console-error checks and helpers):

```ts
test('glides through the Lichtung', async ({ page }) => {
  await openDeslopify(page); // existing helper: load /p/deslopify?stats=1, click start
  await expect(page.locator('[data-role="pitch"]')).toBeVisible();
  await page.keyboard.press('KeyW'); // any input skips the arrival camera
  await expect(page.locator('[data-role="station-chip"]')).toHaveCount(7);
  await page.keyboard.press('Digit4'); // glide to the arch
  await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify an', {
    timeout: 15_000,
  });
  await expect(page.locator('[data-role="moment-banner"]')).toContainText('Deslopify installiert');
  await page.keyboard.press('Digit6');
  await expect(page.locator('[data-role="plate"]')).toContainText('Feed-Wand', { timeout: 15_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify aus');
  await expect(page.locator('[data-role="toast"]')).toContainText('Deslopify aus');
  await page.keyboard.press('Digit0');
  await expect(page.locator('[data-role="plate"]')).toContainText('Ankunft', { timeout: 15_000 });
  await page.keyboard.press('KeyR');
  await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify noch nicht');
  await expect(page.locator('[data-role="station-chip"][data-state="visited"]')).toHaveCount(0);
});
```

Also: a second test that the chip row stays empty in the hub (`/`) and in a plaza project.

- [ ] **Step 2:** `npm run build && npx playwright test tests/deslopify.spec.ts tests/worlds.spec.ts`. Fix the hooks or waits until green (SwiftShader is slow: generous timeouts, no fixed sleeps).
- [ ] **Step 3:** `npm run verify`.
- [ ] **Step 4:** `git commit -am "Cover the Lichtung's glides, moment and wall in e2e"`

---

### Task 10: Look, tune, ship (orchestrator)

- [ ] **Step 1:** Run the game (`npm start`), open `/p/deslopify` in Chrome at medium and high tier. Screenshot: arrival overview, portal view through the arch, boardwalk with cards, steps, arch deck, exhibit, wall, liana, cave behind the falls, the moment overview. Tune `overview`, haze strength, firefly brightness, light shafts, step glow. Compare with the handoff's intent: the goal in view from the first second, the cleared area standing out.
- [ ] **Step 2:** Check reduced motion (settings) and the hub, plaza and showroom for regressions.
- [ ] **Step 3:** Whole-branch review (`superpowers:requesting-code-review` with an `opus-high` reviewer), fix findings.
- [ ] **Step 4:** `npm run verify` and the full e2e; then merge `feat/deslopify-lichtung` into `main`, add the `CHANGELOG.md` entries (`CLAUDE:` lines), push (deploys through `.github/workflows/deploy.yml`), and watch the deploy run.
