# Repo Worlds Behind The Portals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walking into a portal in the start world performs a real scene change into that repository's own themed world, and the README panel becomes a child of it at `/p/:slug/info`.

**Architecture:** `HubScene` stops hardwiring `Terrain`/`Sky`/`Monument` and takes an `Environment` — the surroundings, which own the ground, the spawn and the anchor layout. Four environments live in `world/environments/` behind dynamic imports keyed by `EnvironmentId`. A `SceneDirector` in `features/world/` reads the slug from the active child route and calls `engine.setScene()` with either the start world or a `ProjectScene`, guarding re-entrancy with a sequence token and covering the swap with a non-modal veil.

**Tech Stack:** Angular 22 (zoneless, signals, `@Service`, `inject()`), TypeScript strict, Three.js 0.186, vitest for units, `node --test` for scripts, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-09-10-repo-worlds-design.md` — read §5 (world model), §6 (routing and transitions) and §7 (panel, accessibility, simple view) before starting. This plan implements those three sections. §3 and §4 were Plan 1 (`docs/superpowers/plans/2026-09-10-repos-drive-the-world.md`) and are already merged.

## Global Constraints

- Angular v22 rules from `CLAUDE.md`: no `standalone: true`, no explicit `OnPush`, no `@HostBinding`/`@HostListener`, `input()`/`output()`/`model()` over decorators, native control flow, `@Service` over `@Injectable({providedIn:'root'})` for new singletons, `inject()` over constructor injection.
- Layer boundaries are enforced by ESLint `no-restricted-imports`: `@world/*` must not import from `@ui/*`; `@ui/*` must not import Three.js or `@world/*`; `@content/*` must not import Three.js at all. `features/*` is outside those four rules and is where code that needs both the router and a scene belongs — that is why `SceneDirector` lives there and not in `world/`.
- Code, comments and commit messages in English. User-facing copy in German.
- Node 24.21.0 via nvm. Every shell needs `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` first.
- `npm run verify` (lint → typecheck → `ng test` → `test:scripts` → build → `budget:check`) is the gate before any task is called done. Initial scripts must stay ≤ 350 kB gzipped.
- Environments and bespoke project scenes are lazy chunks reached through dynamic `import()`. They must not appear in the initial bundle.
- Accessibility is part of done: `prefers-reduced-motion` turns every transition into a hard cut, overlays stay focus-trapped `aria-modal` dialogs, and the veil is explicitly **not** a focus trap.

---

## What this plan reverses and where it argues with the spec

Read this before Task 1. Three of these are deliberate deviations from the spec's own sketch, decided against the code that now exists.

**1. "The hub scene is never destroyed" is reversed.** `CLAUDE.md` and `IMPLEMENTATION_PLAN.md` §3 still say a destination is an overlay on a permanent hub. Spec §2 revokes that explicitly: entering a portal disposes the start world and builds another one. Task 11 updates both documents; the extended memory E2E test in Task 11 is the safeguard that makes the reversal checkable rather than hoped for.

**2. `Anchor` is the existing `LandmarkPlacement`, and `anchors()` takes the pinned positions.** Spec §5 sketches `Anchor { position: Vector3; rotationY: number }`. The real `Landmark` constructor already consumes `LandmarkPlacement { position: readonly [number, number, number]; rotationY: number }` — the same two fields with a tuple position. A second, `Vector3`-shaped type would mean a conversion at every call site and two types to keep in step, so `Anchor` is defined as an alias of `LandmarkPlacement`. The signature also gains a second parameter: `ringPlacements(count, avoid)` already exists and exists _because_ pinned landmarks must not be overlapped by generated ones, and that rule belongs to the layout, i.e. to the environment.

**3. `Environment` gains a `name`.** Spec §5's interface has no name, but spec §7 requires the arrival announcement "Dschungel — Deslopify". The German place name is a property of the place, so it lives on the environment.

**4. The veil is a new component, not `LoadingScreen`.** Spec §6 step 3 says "the existing `LoadingScreen` fades in as a veil"; spec §7 says the veil "is an `aria-busy` status region and explicitly **not** a focus trap". `LoadingScreen` is `role="dialog" aria-modal="true"` wrapped in `appFocusTrap`, and it is also the start gate. It cannot be both. §7 wins, so Task 10 adds a small `SceneVeil`; `LoadingScreen` keeps its job as the boot screen and start gate.

**5. `ProjectDestination` is a componentless route, not a component.** Spec §6 draws `'p/:slug' → ProjectDestination (declares which world is meant)`. A componentless Angular route declares exactly that and nothing more: the `ActivatedRoute` node carries `:slug` for the `SceneDirector` to read, and Angular's default `paramsInheritanceStrategy` passes `:slug` down to the `info` child, so `withComponentInputBinding()` still fills `ProjectPanel.slug`. A component would only add an outlet nobody renders into.

**6. The director does not preload per-environment assets.** Spec §6 step 2 says it "loads the environment module and preloads its assets in parallel". Every environment in this plan is procedural — the fixed decision in `CLAUDE.md` is "procedural low-poly terrain/props in code; glTF only for hero landmarks" — and the only two glTF models in the project (`monument.glb`, `arch.glb`) are in the `core` asset group, which `WorldPage` already preloads once at boot and `AssetService` refcounts. There is nothing left to preload per environment, so the director loads the module and stops. Adding a preload hook for assets that do not exist would be a field nobody keeps honest.

---

## File structure

**New — `world/environments/` (the surroundings, one responsibility each):**

| File                    | Responsibility                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `environment.ts`        | The `Environment` and `Anchor` types. No geometry.                                                                                  |
| `ground.ts`             | `ProceduralGround`: an analytic height function turned into a faceted mesh. Extracted from `Terrain`, shared by three environments. |
| `clearing.ts`           | Today's start-world look: `Terrain` + `Sky` + `Monument`, ring anchors.                                                             |
| `showroom.ts`           | The neutral default repo world: flat hall, plinth wall, anchors in a row.                                                           |
| `jungle.ts`             | Dense, foggy, scattered trees; anchors on an arc.                                                                                   |
| `plaza.ts`              | Bright paved square with a fountain; anchors on a semicircle.                                                                       |
| `create-environment.ts` | `EnvironmentId` → dynamic `import()`. The only place that knows all four.                                                           |

**New — `world/project/` (what stands inside a repo world):**

| File                      | Responsibility                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `return.landmark.ts`      | `ReturnPortal`: a `PortalLandmark` whose prompt and destination are "back to the start world". |
| `project.scene.ts`        | `ProjectScene`: environment + exhibit board + return portal. The generic repo world.           |
| `create-project-scene.ts` | slug → dynamic `import()` of a bespoke scene, else `ProjectScene`.                             |

**New — `world/projects/deslopify/`:**

| File                 | Responsibility                                                                        |
| -------------------- | ------------------------------------------------------------------------------------- |
| `video-wall.ts`      | `VideoWall`: the card wall and its flip animation, lifted out of `DeslopifyLandmark`. |
| `deslopify.scene.ts` | `DeslopifyScene extends ProjectScene`, adding the wall and its demo hooks.            |

**New — `features/world/`:**

| File                | Responsibility                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `scene-director.ts` | Route slug → built scene. Owns the sequence token, the veil timing and player placement. |
| `world.page.ts`     | The canvas host, renamed from `features/hub/hub.page.ts`. Knows no scene classes.        |

**New — `ui/scene-veil/scene-veil.ts`:** the non-modal `aria-busy` cover for a swap.

**Modified:**

| File                                                | Change                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `content/project.model.ts`                          | `EnvironmentId` union; `Project.environment`.                                                                 |
| `content/repo-overrides.ts`                         | `RepoOverride.environment`; per-repository assignment; deslopify's landmark kind back to a plain portal.      |
| `content/merge-repo.ts`                             | The `environment` merge rule.                                                                                 |
| `content/testing/project-fixtures.ts`               | Fixtures gain `environment`.                                                                                  |
| `content/merged-projects.spec.ts`                   | Known-environment-id check.                                                                                   |
| `world/hub/hub.scene.ts`                            | Takes an `Environment` instead of building `Terrain`/`Sky`/`Monument`.                                        |
| `world/hub/placement.ts`                            | Exports `Position`; otherwise unchanged, now called from `clearing.ts`.                                       |
| `world/hub/terrain.ts`                              | Re-expressed on `ProceduralGround`, exports unchanged.                                                        |
| `world/landmarks/create-landmark.ts`                | Drops the `deslopify` kind.                                                                                   |
| `app.routes.ts`                                     | `'' → WorldPage`, componentless `p/:slug`, `info → ProjectPanel`.                                             |
| `ui/store/world.store.ts`                           | `panelOpen` separated from `activeSlug`; `inputMode`, `paused` and the start gate follow.                     |
| `ui/project-panel/project-panel.ts`                 | Closes to `/p/:slug`, not `/`.                                                                                |
| `tests/*.spec.ts`                                   | `app-hub-page` → `app-world-page`, panel deep links gain `/info`, memory test extended, new `worlds.spec.ts`. |
| `CLAUDE.md`, `IMPLEMENTATION_PLAN.md`, `HANDOFF.md` | The reversal, the new routes, the new folders.                                                                |

**Deleted:** `world/landmarks/deslopify/deslopify.landmark.ts` (+ spec), `features/hub/` (moved).

---

### Task 1: `EnvironmentId` in the content model

Plan 1 deliberately deferred this: "a field no code consumes is a field nobody keeps honest." Task 2 is the first consumer, so the field arrives now, one task ahead of it.

**Files:**

- Modify: `src/app/content/project.model.ts`
- Modify: `src/app/content/repo-overrides.ts`
- Modify: `src/app/content/merge-repo.ts:110-123`
- Modify: `src/app/content/testing/project-fixtures.ts`
- Test: `src/app/content/merge-repo.spec.ts`, `src/app/content/merged-projects.spec.ts`

**Interfaces:**

- Produces: `EnvironmentId = 'clearing' | 'jungle' | 'showroom' | 'plaza'` and `ENVIRONMENT_IDS: readonly EnvironmentId[]` from `@content/project.model`; `Project.environment: EnvironmentId` (required, never absent after the merge); `RepoOverride.environment?: EnvironmentId`.

- [ ] **Step 1: Write the failing merge tests**

Append to `src/app/content/merge-repo.spec.ts`, inside `describe('mergeRepo', …)`:

```ts
it('sends an un-styled repository to the showroom, the neutral default', () => {
  expect(mergeRepo(repo(), undefined).environment).toBe('showroom');
});

it('lets an override choose the world behind the portal', () => {
  expect(mergeRepo(repo(), { environment: 'jungle' }).environment).toBe('jungle');
});
```

- [ ] **Step 2: Run them to verify they fail**

```sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
npx ng test --include='**/merge-repo.spec.ts'
```

Expected: FAIL — `environment` does not exist on type `Project`.

- [ ] **Step 3: Add the union and the field**

In `src/app/content/project.model.ts`, above `Project`:

```ts
/**
 * Which reusable world stands behind a project's portal
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §5). `clearing` is the start world and
 * is not a destination; a repository that names it simply gets a second clearing.
 */
export type EnvironmentId = 'clearing' | 'jungle' | 'showroom' | 'plaza';

/** Every id `world/environments/create-environment.ts` can resolve; the schema test's yardstick. */
export const ENVIRONMENT_IDS: readonly EnvironmentId[] = [
  'clearing',
  'jungle',
  'showroom',
  'plaza',
];
```

and inside `interface Project`, after `landmark`:

```ts
  /** The world the portal leads to; `mergeRepo` always resolves one. */
  readonly environment: EnvironmentId;
```

- [ ] **Step 4: Add the override field and the merge rule**

In `src/app/content/repo-overrides.ts`, import the type and add to `RepoOverride` after `landmark`:

```ts
  /** Which reusable world stands behind the portal. Defaults to `'showroom'`. */
  readonly environment?: EnvironmentId;
```

In `src/app/content/merge-repo.ts`, add next to `DEFAULT_THEME`:

```ts
/** The world a repository nobody has styled yet leads to: neutral, and it flatters a screenshot. */
const DEFAULT_ENVIRONMENT: EnvironmentId = 'showroom';
```

and add one line to the returned object in `mergeRepo`, after `landmark`:

```ts
    environment: override?.environment ?? DEFAULT_ENVIRONMENT,
```

- [ ] **Step 5: Run the merge tests to verify they pass**

```sh
npx ng test --include='**/merge-repo.spec.ts'
```

Expected: PASS.

- [ ] **Step 6: Assign an environment per repository**

In `src/app/content/repo-overrides.ts`, add one line to each entry. These are Jamie's to change later; each is one word.

```ts
  gitplore: { …, environment: 'plaza' },
  webkatalog_demoshop: { …, environment: 'showroom' },
  novaverta: { …, environment: 'showroom' },
  'poetzscher-homepage': { …, environment: 'showroom' },
  deslopify: { …, environment: 'jungle' },
```

- [ ] **Step 7: Guard the union in the schema test**

Append to `src/app/content/merged-projects.spec.ts`, inside `describe('the merged portfolio', …)`:

```ts
it('sends every project to an environment the world can actually build', () => {
  for (const project of projects) {
    expect(ENVIRONMENT_IDS, project.slug).toContain(project.environment);
  }
});
```

and extend its import: `import { ENVIRONMENT_IDS } from './project.model';`

- [ ] **Step 8: Fill in the fixtures**

`src/app/content/testing/project-fixtures.ts` is a `readonly Project[]`, so it no longer compiles. Add `environment: 'showroom',` to the novaverta and poetzscher entries and `environment: 'jungle',` to the deslopify entry, each next to its `landmark`.

- [ ] **Step 9: Run the gate**

```sh
npm run verify
```

Expected: PASS.

- [ ] **Step 10: Commit**

```sh
git add src/app/content
git commit -m "Add EnvironmentId to the project model and the merge rules"
```

---

### Task 2: The `Environment` abstraction and the clearing

The clearing is today's start world, re-expressed as an environment. Nothing about how it looks changes — which is what makes this task's tests cheap to trust.

**Files:**

- Create: `src/app/world/environments/environment.ts`
- Create: `src/app/world/environments/clearing.ts`
- Move: `src/app/world/hub/{terrain,sky,monument,placement}.ts` (+ their specs, + `portfolio-placement.spec.ts`) → `src/app/world/environments/`
- Modify: `src/app/world/environments/placement.ts` (export `Position`)
- Test: `src/app/world/environments/clearing.spec.ts`

**Interfaces:**

- Consumes: `EnvironmentId` from Task 1.
- Produces:

  ```ts
  export type Anchor = LandmarkPlacement; // { position: readonly [number, number, number]; rotationY: number }
  export interface Environment extends WorldObject {
    readonly id: EnvironmentId;
    readonly name: string; // German, for the HUD and the announcement
    readonly ground: HeightField;
    readonly spawn: Vector3; // ground level, y is the terrain height
    readonly spawnYaw: number;
    readonly colliders: readonly Collider[];
    anchors(count: number, avoid?: readonly Position[]): readonly Anchor[];
  }
  export class ClearingEnvironment implements Environment {
    constructor(options: { readonly reducedMotion: () => boolean });
  }
  ```

- [ ] **Step 1: Move the clearing's parts out of `world/hub/`**

`world/hub/` should end up holding the scene and nothing else; terrain, sky, the monument and the ring layout are the clearing's parts.

```sh
mkdir -p src/app/world/environments
git mv src/app/world/hub/terrain.ts src/app/world/hub/terrain.spec.ts src/app/world/environments/
git mv src/app/world/hub/sky.ts src/app/world/hub/sky.spec.ts src/app/world/environments/
git mv src/app/world/hub/monument.ts src/app/world/hub/monument.spec.ts src/app/world/environments/
git mv src/app/world/hub/placement.ts src/app/world/hub/placement.spec.ts src/app/world/environments/
git mv src/app/world/hub/portfolio-placement.spec.ts src/app/world/environments/
```

- [ ] **Step 2: Repoint every import at the new location**

```sh
grep -rln "hub/terrain\|hub/sky\|hub/monument\|hub/placement" src tests scripts
grep -rl "hub/terrain\|hub/sky\|hub/monument\|hub/placement" src tests scripts \
  | xargs sed -i '' -e 's#hub/terrain#environments/terrain#g' \
                    -e 's#hub/sky#environments/sky#g' \
                    -e 's#hub/monument#environments/monument#g' \
                    -e 's#hub/placement#environments/placement#g'
```

Then fix the relative imports inside the moved files and inside `hub.scene.ts` by hand: `hub.scene.ts` now needs `../environments/…`, and the moved specs' `./terrain` style imports are already correct because the file and its spec moved together.

Run `npm run typecheck` and expect PASS before going on.

- [ ] **Step 3: Export the position tuple the ring already speaks**

In `src/app/world/environments/placement.ts`, change the private alias to an export, because `Environment.anchors` takes a list of pinned positions:

```ts
/** A pinned landmark position, exactly as `ProjectLandmark.position` spells it. */
export type Position = readonly [number, number, number];
```

- [ ] **Step 4: Write the failing clearing test**

Create `src/app/world/environments/clearing.spec.ts`:

```ts
import { stubContext } from '@engine/testing/world-context';
import { ClearingEnvironment } from './clearing';
import { MIN_LANDMARK_SEPARATION, RING_RADIUS } from './placement';
import { terrainHeightAt } from './terrain';

const clearing = () => new ClearingEnvironment({ reducedMotion: () => false });

describe('ClearingEnvironment', () => {
  it('names the place in German, for the HUD and the arrival announcement', () => {
    expect(clearing().name).toBe('Lichtung');
  });

  it('reports ground height straight from the terrain', () => {
    expect(clearing().ground.heightAt(40, -25)).toBe(terrainHeightAt(40, -25));
  });

  it('blocks the monument before anything is initialised', () => {
    // Scenes collect colliders in their constructor, so this must not need `init`.
    expect(clearing().colliders.length).toBeGreaterThan(0);
  });

  it('lays anchors out on the ring, at the ring radius', () => {
    const [first] = clearing().anchors(3);

    expect(Math.hypot(first.position[0], first.position[2])).toBeCloseTo(RING_RADIUS, 5);
  });

  it('keeps generated anchors clear of a pinned landmark', () => {
    const pinned = [[0, 0, RING_RADIUS] as const];

    for (const anchor of clearing().anchors(3, pinned)) {
      const distance = Math.hypot(anchor.position[0] - 0, anchor.position[2] - RING_RADIUS);
      expect(distance).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
    }
  });

  it('builds terrain, sky and the monument into the scene and takes them out again', () => {
    const ctx = stubContext();
    const environment = clearing();

    environment.init(ctx);
    const built = ctx.scene.children.length;
    environment.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

```sh
npx ng test --include='**/clearing.spec.ts'
```

Expected: FAIL — cannot resolve `./clearing`.

- [ ] **Step 6: Write the `Environment` type**

Create `src/app/world/environments/environment.ts`:

```ts
import { Vector3 } from 'three';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldObject } from '@engine/world-object';
import type { EnvironmentId } from '@content/project.model';
import type { LandmarkPlacement } from '../landmarks/base/landmark';
import type { Position } from './placement';

/**
 * Where a scene may put a landmark. The same two fields a `Landmark` is constructed from, so it is
 * that type rather than a parallel one: the spec's `Anchor` and the code's `LandmarkPlacement` are
 * the same idea, and two names for one shape drift.
 */
export type Anchor = LandmarkPlacement;

/**
 * The surroundings, knowing nothing about projects (spec §5).
 *
 * `ground`, `colliders` and `anchors()` must all work before `init()`, because a scene collects its
 * colliders and places its landmarks in its constructor — the same contract `Landmark.describe()`
 * already honours.
 */
export interface Environment extends WorldObject {
  readonly id: EnvironmentId;
  /** The German name of the place, e.g. "Dschungel". Read by the HUD and the announcement (§7). */
  readonly name: string;
  readonly ground: HeightField;
  /** Ground-level point a player arriving in this environment stands on. */
  readonly spawn: Vector3;
  /** The yaw such a player faces. */
  readonly spawnYaw: number;
  /** What the environment itself blocks — walls, trees, a fountain. */
  readonly colliders: readonly Collider[];
  /**
   * `count` places to stand a landmark, turned to face an approaching visitor. Layout is the
   * environment's business: a clearing scatters differently from a plaza.
   *
   * `avoid` holds positions pinned by hand in `repo-overrides.ts`. Only the clearing is ever asked
   * to honour it, because only the start world mixes pinned and generated landmarks — a
   * `ProjectScene` asks for exactly one anchor and pins nothing. The ring can grow until its spots
   * clear; the fixed-extent layouts filter what they can and fall back to a tight fit rather than
   * dropping a project out of the world, which is the same trade-off `ringPlacements` makes.
   */
  anchors(count: number, avoid?: readonly Position[]): readonly Anchor[];
}
```

- [ ] **Step 7: Write the clearing**

Create `src/app/world/environments/clearing.ts`:

```ts
import { Vector3 } from 'three';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { Monument } from './monument';
import { Position, ringPlacements } from './placement';
import { Sky } from './sky';
import { Terrain } from './terrain';
import { Anchor, Environment } from './environment';

/**
 * The open ground the visitor starts on: exactly what `HubScene` used to assemble for itself
 * (spec §5). It is procedural and cheap to rebuild, which is what lets the start world be disposed
 * when the visitor walks through a portal and built again when they come back.
 */
export class ClearingEnvironment implements Environment {
  readonly id = 'clearing' as const;
  readonly name = 'Lichtung';
  readonly spawn = new Vector3(0, 0, 0);
  readonly spawnYaw = 0;

  private readonly terrain = new Terrain();
  private readonly monument = new Monument();
  private readonly sky: Sky;

  constructor(options: { readonly reducedMotion: () => boolean }) {
    this.sky = new Sky(options);
  }

  get ground(): HeightField {
    return this.terrain;
  }

  get colliders(): readonly Collider[] {
    return this.monument.colliders;
  }

  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    return ringPlacements(count, avoid);
  }

  init(ctx: WorldContext): void {
    this.terrain.init(ctx);
    this.sky.init(ctx);
    this.monument.init(ctx);
  }

  update(dt: number): void {
    this.terrain.update();
    this.sky.update(dt);
    this.monument.update();
  }

  dispose(): void {
    this.monument.dispose();
    this.sky.dispose();
    this.terrain.dispose();
  }
}
```

- [ ] **Step 8: Run the clearing test to verify it passes**

```sh
npx ng test --include='**/clearing.spec.ts'
```

Expected: PASS.

- [ ] **Step 9: Run the gate**

```sh
npm run verify
```

Expected: PASS — `HubScene` still builds its own terrain, sky and monument at this point, so nothing else has moved.

- [ ] **Step 10: Commit**

```sh
git add -A src/app/world
git commit -m "Introduce the Environment abstraction and the clearing"
```

---

### Task 3: `HubScene` takes an environment

**Files:**

- Modify: `src/app/world/hub/hub.scene.ts`
- Test: `src/app/world/hub/hub.scene.spec.ts`

**Interfaces:**

- Consumes: `Environment`, `ClearingEnvironment` from Task 2.
- Produces:

  ```ts
  export interface HubSceneOptions {
    readonly environment: Environment;
    readonly projects: readonly Project[];
    readonly reducedMotion: () => boolean;
    readonly onEnter: (project: Project) => void;
    readonly onDemo?: (landmark: Landmark) => void; // removed again in Task 6
    readonly onAreaChange?: (area: string) => void;
    readonly textures?: TextureProvider;
  }
  export class HubScene implements WorldScene {
    readonly spawn: Vector3; // the environment's spawn
    readonly landmarks: readonly Landmark[];
    landmarkFor(slug: string): Landmark | undefined;
  }
  ```

  `HUB_AREA` is deleted; the name now comes from `environment.name`.

- [ ] **Step 1: Rewrite the scene's own tests against an injected environment**

In `src/app/world/hub/hub.scene.spec.ts`, replace the `hub()` helper and drop the `HUB_AREA` import:

```ts
import { ClearingEnvironment } from '../environments/clearing';
import { HubScene, HubSceneOptions } from './hub.scene';

function hub(overrides: Partial<HubSceneOptions> = {}): HubScene {
  return new HubScene({
    environment: new ClearingEnvironment({ reducedMotion: () => false }),
    reducedMotion: () => false,
    projects: PROJECTS,
    onEnter: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
    ...overrides,
  });
}
```

Replace the two `HUB_AREA` assertions with the environment's name:

```ts
const CLEARING = 'Lichtung';
// …
expect(areas).toEqual([CLEARING, target.project.title]);
// …
expect(areas).toEqual([CLEARING]);
```

Add one new test, which is the point of the task:

```ts
it('takes its ground, its spawn and its layout from the environment it is given', () => {
  const environment = new ClearingEnvironment({ reducedMotion: () => false });
  const scene = hub({ environment });

  expect(scene.ground).toBe(environment.ground);
  expect(scene.spawn).toBe(environment.spawn);
  expect(scene.colliders).toEqual(expect.arrayContaining([...environment.colliders]));
});
```

- [ ] **Step 2: Run it to verify it fails**

```sh
npx ng test --include='**/hub.scene.spec.ts'
```

Expected: FAIL — `environment` is not a known property of `HubSceneOptions`.

- [ ] **Step 3: Rewrite `HubScene` around the environment**

Replace the head of `src/app/world/hub/hub.scene.ts` down to the end of the constructor with:

```ts
import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldScene } from '@engine/world-object';
import type { Project } from '@content/project.model';
import { Environment } from '../environments/environment';
import { Landmark, LandmarkPlacement, TextureProvider } from '../landmarks/base/landmark';
import { createLandmark } from '../landmarks/create-landmark';

/** Within this distance of a landmark the HUD names the project instead of the place. */
const AREA_RADIUS = 10;

export interface HubSceneOptions {
  /** The surroundings. The scene owns the projects in them, nothing else. */
  readonly environment: Environment;
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
  readonly projects: readonly Project[];
  readonly onEnter: (project: Project) => void;
  readonly onDemo?: (landmark: Landmark) => void;
  readonly onAreaChange?: (area: string) => void;
  readonly textures?: TextureProvider;
}

/**
 * The world the visitor starts in: one landmark per project, standing in whatever environment it
 * was handed. Unlike before, it is disposed when the visitor walks through a portal and built again
 * when they return (spec §2) — everything in it is procedural, and the models it does use are
 * refcounted by `AssetService`.
 */
export class HubScene implements WorldScene {
  readonly id = 'hub';

  readonly landmarks: readonly Landmark[];
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly environment: Environment;
  private readonly onAreaChange: ((area: string) => void) | undefined;
  private area: string | null = null;

  constructor(options: HubSceneOptions) {
    this.environment = options.environment;
    this.onAreaChange = options.onAreaChange;

    // Pinned landmarks are placed by hand and never move, so generated anchors have to work around
    // them: without this an anchor can land on top of one.
    const pinned = options.projects
      .map((project) => project.landmark.position)
      .filter((position) => position !== undefined);
    const anchors = this.environment.anchors(
      options.projects.filter((project) => !project.landmark.position).length,
      pinned,
    );
    let anchorIndex = 0;

    this.landmarks = options.projects.map((project) => {
      const position = project.landmark.position;
      const placement: LandmarkPlacement = position
        ? { position, rotationY: project.landmark.rotationY ?? 0 }
        : anchors[anchorIndex++];

      return createLandmark({
        project,
        placement,
        ground: this.environment.ground,
        reducedMotion: options.reducedMotion,
        onEnter: options.onEnter,
        onDemo: options.onDemo,
        textures: options.textures,
      });
    });

    // Shapes are known before init (`Landmark.describe`), so the engine can read one flat list.
    this.colliders = [
      ...this.environment.colliders,
      ...this.landmarks.flatMap((landmark) => landmark.colliders),
    ];
    this.interactables = this.landmarks.flatMap((landmark) => landmark.interactables);
  }

  get ground() {
    return this.environment.ground;
  }

  get spawn(): Vector3 {
    return this.environment.spawn;
  }

  get spawnYaw(): number {
    return this.environment.spawnYaw;
  }
```

Then replace the three lifecycle methods and the area name:

```ts
  init(ctx: WorldContext): void {
    this.environment.init(ctx);
    this.landmarks.forEach((landmark) => landmark.init(ctx));
  }

  update(dt: number, ctx: WorldContext): void {
    this.environment.update(dt, ctx);
    this.landmarks.forEach((landmark) => landmark.update(dt, ctx));
    this.trackArea(ctx);
  }

  dispose(): void {
    this.landmarks.forEach((landmark) => landmark.dispose());
    this.environment.dispose();
    this.area = null;
  }
```

and in `trackArea`, `const area = nearest?.project.title ?? this.environment.name;`.

- [ ] **Step 4: Update the only caller**

`src/app/features/hub/hub.page.ts:224` constructs the scene. Add the environment:

```ts
const hub = new HubScene({
  environment: new ClearingEnvironment({
    reducedMotion: () => this.capability.reducedMotion(),
  }),
  reducedMotion: () => this.capability.reducedMotion(),
  projects: this.content.projects(),
  onEnter: (project) => void this.router.navigate(['/p', project.slug]),
  onDemo: (landmark) => this.startDemo(landmark),
  onAreaChange: (area) => this.store.setArea(area),
  textures: this.assets,
});
```

with `import { ClearingEnvironment } from '@world/environments/clearing';`. Task 9 takes this construction away again; it stays static for one task so the app keeps working between commits.

- [ ] **Step 5: Run the tests to verify they pass**

```sh
npx ng test --include='**/hub.scene.spec.ts'
```

Expected: PASS.

- [ ] **Step 6: Run the gate**

```sh
npm run verify && npm run e2e
```

Expected: PASS. The start world looks and behaves exactly as before; if an E2E test fails here, the refactor changed behaviour and must be fixed rather than the test.

- [ ] **Step 7: Commit**

```sh
git add -A src/app
git commit -m "Build HubScene on an injected Environment instead of hardwired parts"
```

---

### Task 4: The other three environments, behind dynamic imports

**Files:**

- Create: `src/app/world/environments/ground.ts`
- Create: `src/app/world/environments/showroom.ts`, `jungle.ts`, `plaza.ts`
- Create: `src/app/world/environments/create-environment.ts`
- Modify: `src/app/world/environments/terrain.ts` (re-expressed on `ProceduralGround`)
- Modify: `src/app/world/environments/placement.ts` (export `clearOf`)
- Test: `src/app/world/environments/environments.spec.ts`, `create-environment.spec.ts`

**Interfaces:**

- Consumes: `Environment`, `Anchor`, `Position` from Task 2.
- Produces:

  ```ts
  export class ProceduralGround implements WorldObject, HeightField {
    constructor(options: {
      id?: string;
      size: number;
      color: number;
      segments?: number;
      heightAt(x: number, z: number): number;
    });
  }
  export function clearOf(
    candidates: readonly Anchor[],
    avoid: readonly Position[],
    count: number,
  ): readonly Anchor[];
  export class ShowroomEnvironment implements Environment {
    constructor(options: EnvironmentOptions);
  }
  export class JungleEnvironment implements Environment {
    constructor(options: EnvironmentOptions);
  }
  export class PlazaEnvironment implements Environment {
    constructor(options: EnvironmentOptions);
  }
  export interface EnvironmentOptions {
    readonly reducedMotion: () => boolean;
  }
  export function createEnvironment(
    id: EnvironmentId,
    options: EnvironmentOptions,
  ): Promise<Environment>;
  ```

- [ ] **Step 1: Write the failing shared-contract test**

One table-driven spec, because the contract is what matters and four copies of it would rot. Create `src/app/world/environments/environments.spec.ts`:

```ts
import { stubContext } from '@engine/testing/world-context';
import { MIN_LANDMARK_SEPARATION } from './placement';
import { ClearingEnvironment } from './clearing';
import { JungleEnvironment } from './jungle';
import { PlazaEnvironment } from './plaza';
import { ShowroomEnvironment } from './showroom';
import type { Environment } from './environment';

const BUILDERS: readonly { id: string; build: () => Environment }[] = [
  { id: 'clearing', build: () => new ClearingEnvironment({ reducedMotion: () => false }) },
  { id: 'showroom', build: () => new ShowroomEnvironment({ reducedMotion: () => false }) },
  { id: 'jungle', build: () => new JungleEnvironment({ reducedMotion: () => false }) },
  { id: 'plaza', build: () => new PlazaEnvironment({ reducedMotion: () => false }) },
];

describe.each(BUILDERS)('$id', ({ id, build }) => {
  it('announces itself with its id and a German place name', () => {
    const environment = build();

    expect(environment.id).toBe(id);
    expect(environment.name.length).toBeGreaterThan(0);
  });

  it('stands the arriving player on its own ground', () => {
    const environment = build();

    expect(environment.spawn.y).toBeCloseTo(
      environment.ground.heightAt(environment.spawn.x, environment.spawn.z),
      5,
    );
  });

  it('knows its ground, colliders and anchors before init, as scenes need them', () => {
    // A scene collects colliders and places landmarks in its constructor; `init` comes later.
    const environment = build();

    expect(typeof environment.ground.heightAt(3, -4)).toBe('number');
    expect(Array.isArray(environment.colliders)).toBe(true);
    expect(environment.anchors(2).length).toBe(2);
  });

  it('spreads its anchors far enough apart to read as separate places', () => {
    const anchors = build().anchors(4);

    for (let a = 0; a < anchors.length; a++) {
      for (let b = a + 1; b < anchors.length; b++) {
        const distance = Math.hypot(
          anchors[a].position[0] - anchors[b].position[0],
          anchors[a].position[2] - anchors[b].position[2],
        );
        expect(distance).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
      }
    }
  });

  it('puts everything it adds back when disposed', () => {
    const ctx = stubContext();
    const environment = build();

    environment.init(ctx);
    const built = ctx.scene.children.length;
    environment.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
    // A fog or background left behind would tint whatever scene comes next.
    expect(ctx.scene.fog).toBe(null);
    expect(ctx.scene.background).toBe(null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```sh
npx ng test --include='**/environments.spec.ts'
```

Expected: FAIL — cannot resolve `./showroom`.

- [ ] **Step 3: Extract `ProceduralGround` out of `Terrain`**

Create `src/app/world/environments/ground.ts`:

```ts
import { BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';

export interface GroundOptions {
  readonly id?: string;
  /** Edge length of the walkable ground, in metres. */
  readonly size: number;
  readonly color: number;
  /** Grid resolution on the strongest tier; halved on the weakest. 1 for flat ground. */
  readonly segments?: number;
  heightAt(x: number, z: number): number;
}

/**
 * An analytic height function turned into a faceted mesh, and the `HeightField` the player
 * controller samples. Three environments need exactly this with different numbers, which is why it
 * is a parameter object rather than four near-identical classes.
 */
export class ProceduralGround implements WorldObject, HeightField {
  readonly id: string;

  private mesh?: Mesh;

  constructor(private readonly options: GroundOptions) {
    this.id = options.id ?? 'ground';
  }

  heightAt(x: number, z: number): number {
    return this.options.heightAt(x, z);
  }

  init(ctx: WorldContext): void {
    const wanted = this.options.segments ?? 160;
    const segments = ctx.quality.propDensity < 0.5 ? Math.max(1, Math.round(wanted / 2.5)) : wanted;
    const geometry = new PlaneGeometry(this.options.size, this.options.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, this.options.heightAt(position.getX(i), position.getZ(i)));
    }
    position.needsUpdate = true;
    // Bake one normal per face instead of `flatShading`: the shader's screen-space derivatives
    // degenerate on the triangle that straddles the camera and painted it black under SwiftShader.
    const faceted = geometry.toNonIndexed();
    geometry.dispose();
    faceted.computeVertexNormals();

    this.mesh = new Mesh(
      faceted,
      new MeshStandardMaterial({ color: this.options.color, roughness: 0.95, metalness: 0 }),
    );
    this.mesh.name = this.id;
    this.mesh.receiveShadow = ctx.quality.shadows;
    ctx.scene.add(this.mesh);
  }

  update(): void {
    // Static ground: nothing moves.
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }
}
```

Then replace the `Terrain` class at the bottom of `src/app/world/environments/terrain.ts` — keeping `terrainHeightAt`, `TERRAIN_SIZE`, `TERRAIN_FLAT_RADIUS` and `TERRAIN_MAX_HEIGHT` exactly as they are, because `terrain.spec.ts` and the collision code import them:

```ts
/** The clearing's ground: the analytic relief above, drawn at the hub's resolution. */
export class Terrain extends ProceduralGround {
  constructor() {
    super({
      id: 'terrain',
      size: TERRAIN_SIZE,
      color: 0x6c8f5a,
      segments: 160,
      heightAt: terrainHeightAt,
    });
  }
}
```

with `import { ProceduralGround } from './ground';`, and delete the now-unused `SEGMENTS_HIGH`/`SEGMENTS_LOW` constants and the Three imports `Terrain` no longer uses.

Run `npx ng test --include='**/terrain.spec.ts'` and expect PASS: the clearing's ground is unchanged.

- [ ] **Step 4: Share the "keep off pinned landmarks" rule**

In `src/app/world/environments/placement.ts`, export the filter the ring already applies, so the three flat layouts get it too. Add below `clears`:

```ts
/**
 * The first `count` candidates that stand clear of every position in `avoid`.
 *
 * Falls back to the unfiltered candidates when filtering leaves too few: a tight fit is better than
 * dropping a project out of the world, which is the same trade-off `ringPlacements` makes.
 */
export function clearOf(
  candidates: readonly LandmarkPlacement[],
  avoid: readonly Position[],
  count: number,
): readonly LandmarkPlacement[] {
  const usable = candidates.filter((spot) => clears(spot, avoid));

  return (usable.length >= count ? usable : candidates).slice(0, count);
}
```

- [ ] **Step 5: Write the showroom — the neutral default**

Create `src/app/world/environments/showroom.ts`:

```ts
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Anchor, Environment } from './environment';
import { ProceduralGround } from './ground';
import { clearOf, MIN_LANDMARK_SEPARATION, Position } from './placement';
import type { EnvironmentOptions } from './create-environment';

/** Half the hall's floor, in metres. */
const HALF = 24;
const WALL_HEIGHT = 7;
const WALL_THICKNESS = 0.8;
/** How far from the back wall the exhibits stand. */
const EXHIBIT_DEPTH = HALF - 7;

const FLOOR = 0x2b3038;
const WALL = 0xdfe3e8;

/**
 * The world a repository nobody has styled yet leads to (spec §4's `environment` default): a plain,
 * well-lit hall. It carries no story of its own, so the project's screenshot is the only thing in
 * it with a colour, which is exactly what a neutral default should do.
 */
export class ShowroomEnvironment implements Environment {
  readonly id = 'showroom' as const;
  readonly name = 'Showroom';
  readonly spawn = new Vector3(0, 0, HALF - 6);
  /** Yaw 0 looks down −Z: into the hall, at the exhibit wall. */
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[];

  private readonly floor = new ProceduralGround({
    id: 'showroom-floor',
    size: HALF * 2,
    color: FLOOR,
    segments: 1,
    heightAt: () => 0,
  });
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(options: EnvironmentOptions) {
    void options;
    this.colliders = [
      { kind: 'aabb', minX: -HALF, maxX: HALF, minZ: -HALF - WALL_THICKNESS, maxZ: -HALF },
      { kind: 'aabb', minX: -HALF, maxX: HALF, minZ: HALF, maxZ: HALF + WALL_THICKNESS },
      { kind: 'aabb', minX: -HALF - WALL_THICKNESS, maxX: -HALF, minZ: -HALF, maxZ: HALF },
      { kind: 'aabb', minX: HALF, maxX: HALF + WALL_THICKNESS, minZ: -HALF, maxZ: HALF },
    ];
  }

  get ground() {
    return this.floor;
  }

  /** A straight row along the back wall, every exhibit turned towards the arriving visitor. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const slots = count + avoid.length;
    const spacing = Math.max(MIN_LANDMARK_SEPARATION, (HALF * 2 - 8) / Math.max(slots, 1));
    const candidates: Anchor[] = Array.from({ length: slots }, (_, index) => ({
      position: [(index - (slots - 1) / 2) * spacing, 0, -EXHIBIT_DEPTH] as const,
      rotationY: 0,
    }));

    return clearOf(candidates, avoid, count);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    ctx.scene.background = new Color(0x10141a);

    this.floor.init(ctx);

    const wall = new MeshStandardMaterial({ color: WALL, roughness: 0.85, metalness: 0 });
    const spans: readonly [number, number, number, number][] = [
      [0, -HALF, HALF * 2, WALL_THICKNESS],
      [0, HALF, HALF * 2, WALL_THICKNESS],
      [-HALF, 0, WALL_THICKNESS, HALF * 2],
      [HALF, 0, WALL_THICKNESS, HALF * 2],
    ];
    for (const [x, z, width, depth] of spans) {
      const mesh = new Mesh(new BoxGeometry(width, WALL_HEIGHT, depth), wall);
      mesh.position.set(x, WALL_HEIGHT / 2, z);
      mesh.receiveShadow = ctx.quality.shadows;
      this.added.push(mesh);
    }

    const ambient = new HemisphereLight(0xffffff, 0x3a4049, 1.4);
    const key = new DirectionalLight(0xfff6e8, 1.5);
    key.position.set(10, 18, 14);
    key.castShadow = ctx.quality.shadows;
    this.added.push(ambient, key);

    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(): void {
    // Nothing in the hall moves.
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.floor.dispose();
    if (this.scene) {
      this.scene.background = null;
      this.scene = null;
    }
  }
}
```

- [ ] **Step 6: Write the jungle**

Create `src/app/world/environments/jungle.ts`:

```ts
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Anchor, Environment } from './environment';
import { ProceduralGround } from './ground';
import { clearOf, Position } from './placement';
import type { EnvironmentOptions } from './create-environment';

const SIZE = 160;
const TRUNK_RADIUS = 0.55;
const TREE_COUNT = 54;
/** No trees inside this radius, so the arrival point stays open and walkable. */
const GLADE_RADIUS = 11;
const TREE_MAX_RADIUS = 62;
/** Where exhibits stand: far enough to walk to, near enough to spot through the fog. */
const EXHIBIT_RADIUS = 19;
/** The arc exhibits are spread over, in radians, centred on the direction the player faces. */
const EXHIBIT_ARC = Math.PI * 0.9;

const CANOPY = 0x2f5d34;
const FOG = 0x28402c;

/** Gentle, non-repeating relief; shallow enough that nothing is ever hidden behind a hill. */
export function jungleHeightAt(x: number, z: number): number {
  return 1.4 * Math.sin(x * 0.09) * Math.cos(z * 0.07) + 0.55 * Math.sin((x - z) * 0.21);
}

/**
 * Deterministic pseudo-random numbers. The world is rebuilt every time the visitor returns, so a
 * tree that moved between visits would read as a bug — the same reasoning as `ringPlacements`.
 */
function* noise(seed: number): Generator<number> {
  let state = seed;
  for (;;) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    yield state / 4294967296;
  }
}

/** Dense, close, humid: the world behind a portal that should feel like undergrowth. */
export class JungleEnvironment implements Environment {
  readonly id = 'jungle' as const;
  readonly name = 'Dschungel';
  readonly spawn = new Vector3(0, jungleHeightAt(0, 0), 0);
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[];

  private readonly floor = new ProceduralGround({
    id: 'jungle-floor',
    size: SIZE,
    color: 0x32462c,
    segments: 120,
    heightAt: jungleHeightAt,
  });
  private readonly trees: readonly { x: number; z: number; height: number }[];
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(options: EnvironmentOptions) {
    void options;
    const random = noise(20260911);
    this.trees = Array.from({ length: TREE_COUNT }, () => {
      const angle = random.next().value * Math.PI * 2;
      const radius = GLADE_RADIUS + random.next().value * (TREE_MAX_RADIUS - GLADE_RADIUS);
      return {
        x: Math.sin(angle) * radius,
        z: Math.cos(angle) * radius,
        height: 6 + random.next().value * 5,
      };
    });
    this.colliders = this.trees.map((tree) => ({
      kind: 'cylinder' as const,
      x: tree.x,
      z: tree.z,
      radius: TRUNK_RADIUS + 0.25,
    }));
  }

  get ground() {
    return this.floor;
  }

  /** An arc in front of the arrival point, each exhibit turned back towards it. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const slots = count + avoid.length;
    const candidates: Anchor[] = Array.from({ length: slots }, (_, index) => {
      const t = slots === 1 ? 0.5 : index / (slots - 1);
      // spawnYaw looks down −Z, so the arc is centred on −Z: angle 0 is straight ahead.
      const angle = (t - 0.5) * EXHIBIT_ARC;
      const x = Math.sin(angle) * EXHIBIT_RADIUS;
      const z = -Math.cos(angle) * EXHIBIT_RADIUS;
      // Front direction is (sin r, cos r); facing the arrival point means pointing at the origin.
      return { position: [x, 0, z] as const, rotationY: Math.atan2(-x, -z) + Math.PI };
    });

    return clearOf(candidates, avoid, count);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    ctx.scene.background = new Color(FOG);
    ctx.scene.fog = new Fog(FOG, 6, Math.min(ctx.quality.fogFar, 75));

    this.floor.init(ctx);

    const bark = new MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true });
    const leaves = new MeshStandardMaterial({ color: CANOPY, roughness: 1, flatShading: true });
    const trunkGeometry = new CylinderGeometry(TRUNK_RADIUS * 0.8, TRUNK_RADIUS, 1, 6);
    const canopyGeometry = new ConeGeometry(2.6, 3.4, 7);

    for (const tree of this.trees) {
      const group = new Group();
      group.name = 'tree';
      const trunk = new Mesh(trunkGeometry, bark);
      trunk.scale.y = tree.height;
      trunk.position.y = tree.height / 2;
      trunk.castShadow = ctx.quality.shadows;
      group.add(trunk);

      for (const [lift, scale] of [
        [0.78, 1],
        [1, 0.7],
      ] as const) {
        const canopy = new Mesh(canopyGeometry, leaves);
        canopy.position.y = tree.height * lift;
        canopy.scale.setScalar(scale);
        canopy.castShadow = ctx.quality.shadows;
        group.add(canopy);
      }

      group.position.set(tree.x, jungleHeightAt(tree.x, tree.z), tree.z);
      this.added.push(group);
    }

    const ambient = new HemisphereLight(0x8fbf7a, 0x1c2a1a, 1.1);
    const shaft = new DirectionalLight(0xd8f0b0, 1.1);
    shaft.position.set(-20, 40, -12);
    shaft.castShadow = ctx.quality.shadows;
    this.added.push(ambient, shaft);

    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(): void {
    // Still air: the canopy does not sway, and a swaying one would fight `prefers-reduced-motion`.
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.floor.dispose();
    if (this.scene) {
      this.scene.fog = null;
      this.scene.background = null;
      this.scene = null;
    }
  }
}
```

- [ ] **Step 7: Write the plaza**

Create `src/app/world/environments/plaza.ts`:

```ts
import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Anchor, Environment } from './environment';
import { ProceduralGround } from './ground';
import { clearOf, Position } from './placement';
import { Sky } from './sky';
import type { EnvironmentOptions } from './create-environment';

const SIZE = 90;
const FOUNTAIN_RADIUS = 4;
const KERB_HEIGHT = 0.5;
/** Radius of the semicircle the exhibits stand on. */
const EXHIBIT_RADIUS = 20;
const EXHIBIT_ARC = Math.PI * 1.1;

/** Open, bright and built: paving, a fountain, and the same sky the clearing has. */
export class PlazaEnvironment implements Environment {
  readonly id = 'plaza' as const;
  readonly name = 'Plaza';
  readonly spawn = new Vector3(0, 0, 26);
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[] = [
    { kind: 'cylinder', x: 0, z: 0, radius: FOUNTAIN_RADIUS + 0.4 },
  ];

  private readonly floor = new ProceduralGround({
    id: 'plaza-floor',
    size: SIZE,
    color: 0xb9b2a4,
    segments: 1,
    heightAt: () => 0,
  });
  private readonly sky: Sky;
  private readonly added: Object3D[] = [];

  constructor(options: EnvironmentOptions) {
    this.sky = new Sky(options);
  }

  get ground() {
    return this.floor;
  }

  /** A semicircle around the fountain, every exhibit facing the middle of the square. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const slots = count + avoid.length;
    const candidates: Anchor[] = Array.from({ length: slots }, (_, index) => {
      const t = slots === 1 ? 0.5 : index / (slots - 1);
      const angle = (t - 0.5) * EXHIBIT_ARC;
      const x = Math.sin(angle) * EXHIBIT_RADIUS;
      const z = -Math.cos(angle) * EXHIBIT_RADIUS;
      return { position: [x, 0, z] as const, rotationY: Math.atan2(-x, -z) + Math.PI };
    });

    return clearOf(candidates, avoid, count);
  }

  init(ctx: WorldContext): void {
    this.floor.init(ctx);
    this.sky.init(ctx);

    const stone = new MeshStandardMaterial({ color: 0x9a9184, roughness: 0.9, flatShading: true });
    const water = new MeshStandardMaterial({ color: 0x3f7bb8, roughness: 0.2, metalness: 0.1 });

    const kerb = new Mesh(
      new CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS + 0.3, KERB_HEIGHT, 20),
      stone,
    );
    kerb.position.y = KERB_HEIGHT / 2;
    kerb.receiveShadow = ctx.quality.shadows;

    const pool = new Mesh(
      new CylinderGeometry(FOUNTAIN_RADIUS - 0.4, FOUNTAIN_RADIUS - 0.4, 0.08, 20),
      water,
    );
    pool.position.y = KERB_HEIGHT - 0.02;

    const pillar = new Mesh(new BoxGeometry(1, 3.2, 1), stone);
    pillar.position.y = 1.6;
    pillar.castShadow = ctx.quality.shadows;

    this.added.push(kerb, pool, pillar);
    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(dt: number): void {
    this.sky.update(dt);
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.sky.dispose();
    this.floor.dispose();
  }
}
```

- [ ] **Step 8: Write the registry**

Create `src/app/world/environments/create-environment.ts`:

```ts
import type { EnvironmentId } from '@content/project.model';
import type { Environment } from './environment';

export interface EnvironmentOptions {
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
}

type EnvironmentFactory = (options: EnvironmentOptions) => Environment;

/**
 * One dynamic import per environment, so neither the initial bundle nor the start world's chunk
 * grows when a new world is added (spec §5). The literal `import()` calls are what let the builder
 * split them out; a computed specifier would defeat that.
 */
const LOADERS: Readonly<Record<EnvironmentId, () => Promise<EnvironmentFactory>>> = {
  clearing: () => import('./clearing').then((m) => (o) => new m.ClearingEnvironment(o)),
  showroom: () => import('./showroom').then((m) => (o) => new m.ShowroomEnvironment(o)),
  jungle: () => import('./jungle').then((m) => (o) => new m.JungleEnvironment(o)),
  plaza: () => import('./plaza').then((m) => (o) => new m.PlazaEnvironment(o)),
};

/**
 * Builds the environment an id names. An id the registry does not know falls back to the showroom
 * rather than throwing: ids arrive from `repos.json` via the merge, and `merged-projects.spec.ts`
 * guards them at build time, but a visitor with a stale cached file must still get a world.
 */
export async function createEnvironment(
  id: EnvironmentId,
  options: EnvironmentOptions,
): Promise<Environment> {
  const load = LOADERS[id] ?? LOADERS.showroom;

  return (await load())(options);
}
```

- [ ] **Step 9: Write the registry test**

Create `src/app/world/environments/create-environment.spec.ts`:

```ts
import { ENVIRONMENT_IDS } from '@content/project.model';
import { createEnvironment } from './create-environment';

describe('createEnvironment', () => {
  it.each(ENVIRONMENT_IDS)('builds the %s environment', async (id) => {
    const environment = await createEnvironment(id, { reducedMotion: () => false });

    expect(environment.id).toBe(id);
  });

  it('falls back to the showroom for an id it does not know', async () => {
    // A stale cached repos.json can name a world this build no longer ships.
    const environment = await createEnvironment('atlantis' as never, {
      reducedMotion: () => false,
    });

    expect(environment.id).toBe('showroom');
  });
});
```

- [ ] **Step 10: Run both specs to verify they pass**

```sh
npx ng test --include='**/environments.spec.ts' --include='**/create-environment.spec.ts'
```

Expected: PASS. If the anchor separation test fails for the showroom, raise `MIN_LANDMARK_SEPARATION`-sized `spacing`, not the assertion.

- [ ] **Step 11: Run the gate**

```sh
npm run verify
```

Expected: PASS, including `budget:check` — the three new environments are lazy chunks and nothing imports them statically yet.

- [ ] **Step 12: Commit**

```sh
git add -A src/app/world
git commit -m "Add the showroom, jungle and plaza environments behind dynamic imports"
```

---

### Task 5: `ProjectScene` and the return portal

The generic world behind a portal: the environment, the project's exhibit board, and the way back.

**Files:**

- Create: `src/app/world/project/return.landmark.ts`
- Create: `src/app/world/project/project.scene.ts`
- Test: `src/app/world/project/project.scene.spec.ts`

**Interfaces:**

- Consumes: `Environment`, `Anchor` (Task 2); `ShowroomEnvironment` (Task 4) for the tests.
- Produces:

  ```ts
  export interface SceneObject extends WorldObject {
    readonly colliders?: readonly Collider[];
    readonly interactables?: readonly Interactable[];
  }
  export interface ProjectSceneOptions {
    readonly environment: Environment;
    readonly project: Project;
    readonly reducedMotion: () => boolean;
    readonly onOpenInfo: (project: Project) => void; // → /p/:slug/info
    readonly onLeave: () => void; // → /
    readonly onDemo?: () => void; // the visitor asked to start the in-world demo
    readonly textures?: TextureProvider;
  }
  export interface InWorldDemo {
    readonly demoHint: string;
    enter(player: PlayerController): void;
    interact(): void;
    exit(): void;
  }
  export class ProjectScene implements WorldScene {
    readonly arrival: { readonly position: Vector3; readonly yaw: number };
    get demo(): InWorldDemo | null; // null in the generic scene
    protected add(object: SceneObject): void; // for bespoke subclasses, in their constructor
  }
  export class ReturnPortal extends PortalLandmark {}
  ```

- [ ] **Step 1: Write the failing scene test**

Create `src/app/world/project/project.scene.spec.ts`:

```ts
import { Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { ShowroomEnvironment } from '../environments/showroom';
import { ProjectScene, ProjectSceneOptions } from './project.scene';

const PROJECT = PROJECT_FIXTURES[0];

function scene(overrides: Partial<ProjectSceneOptions> = {}): ProjectScene {
  return new ProjectScene({
    environment: new ShowroomEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    // Reduced motion on purpose: it skips the portal's camera dolly, so `onInteract` reports
    // straight away instead of only after `update` has run the glide to its end.
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
    ...overrides,
  });
}

function use(target: ProjectScene, match: RegExp): void {
  const interactable = target.interactables.find((candidate) => match.test(candidate.prompt));
  expect(interactable, `no interactable matching ${match}`).toBeDefined();
  interactable?.onInteract();
}

describe('ProjectScene', () => {
  it('stands the exhibit on the environment’s first anchor', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });
    const [anchor] = environment.anchors(1);
    const target = scene({ environment });

    const exhibit = target.landmarks.find((landmark) => landmark.id.includes(PROJECT.slug));

    expect(exhibit?.position.x).toBeCloseTo(anchor.position[0], 5);
    expect(exhibit?.position.z).toBeCloseTo(anchor.position[2], 5);
  });

  it('puts the way back at the arrival point, behind the player', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });
    const target = scene({ environment });

    // The player arrives a few metres past the portal, looking the way the environment says.
    expect(target.arrival.yaw).toBeCloseTo(environment.spawnYaw, 5);
    const toPlayer = target.arrival.position.clone().sub(environment.spawn);
    expect(toPlayer.length()).toBeGreaterThan(0);
    expect(toPlayer.length()).toBeLessThan(6);
  });

  it('reports the project when the exhibit is used, so the panel can open', () => {
    const opened: Project[] = [];
    use(scene({ onOpenInfo: (project) => opened.push(project) }), /ansehen/);

    expect(opened).toEqual([PROJECT]);
  });

  it('reports a departure when the return portal is used', () => {
    let left = 0;
    use(scene({ onLeave: () => left++ }), /Zurück/);

    expect(left).toBe(1);
  });

  it('gives the two landmarks different interactable ids, so the HUD can tell them apart', () => {
    const ids = scene().interactables.map((interactable) => interactable.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('blocks what the environment blocks as well as its own landmarks', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });
    const target = scene({ environment });

    expect(target.colliders.length).toBeGreaterThan(environment.colliders.length);
  });

  it('walks on the environment’s ground', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });

    expect(scene({ environment }).ground).toBe(environment.ground);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = scene();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```sh
npx ng test --include='**/project.scene.spec.ts'
```

Expected: FAIL — cannot resolve `./project.scene`.

- [ ] **Step 3: Write the return portal**

Create `src/app/world/project/return.landmark.ts`:

```ts
import { Landmark, LandmarkShape } from '../landmarks/base/landmark';
import { PortalLandmark } from '../landmarks/base/portal.landmark';

/**
 * The way out of a repo world: the same arch as the one the visitor walked into, with the prompt
 * and the destination reversed. It is an ordinary `Landmark`, so it blocks, it glides the camera
 * and it honours `prefers-reduced-motion` without a line of its own (spec §5).
 */
export class ReturnPortal extends PortalLandmark {
  protected override describe(): LandmarkShape {
    const portal = super.describe();

    return {
      colliders: portal.colliders,
      // The exhibit in the same scene is built from the same project and would otherwise carry the
      // identical interactable id, which is what `InteractionSystem` tells nearby things apart by.
      interactables: portal.interactables.map((interactable) => ({
        ...interactable,
        id: `${this.id}:return`,
        prompt: 'Zurück zur Lichtung',
      })),
    };
  }
}
```

- [ ] **Step 4: Write the scene**

Create `src/app/world/project/project.scene.ts`:

```ts
import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext, WorldObject, WorldScene } from '@engine/world-object';
import type { Project } from '@content/project.model';
import { Environment } from '../environments/environment';
import { Landmark, LandmarkPlacement, TextureProvider } from '../landmarks/base/landmark';
import { ScreenLandmark } from '../landmarks/base/screen.landmark';
import { ReturnPortal } from './return.landmark';

/** Anything a project scene owns: it may block, it may offer, and it is disposed with the scene. */
export interface SceneObject extends WorldObject {
  readonly colliders?: readonly Collider[];
  readonly interactables?: readonly Interactable[];
}

/**
 * A demo the visitor plays inside the world rather than in the panel (§5's "in-world" demo mode).
 * The scene owns it; the `SceneDirector` drives it, which is why it is not a `Landmark` any more —
 * a demo is a thing you use, not a place you walk to.
 */
export interface InWorldDemo {
  /** What the HUD tells the visitor while the demo runs. */
  readonly demoHint: string;
  enter(player: PlayerController): void;
  interact(): void;
  exit(): void;
}

export interface ProjectSceneOptions {
  readonly environment: Environment;
  readonly project: Project;
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
  /** The exhibit was used; the page turns this into the `/p/:slug/info` route. */
  readonly onOpenInfo: (project: Project) => void;
  /** The return portal was used; the page turns this into `/`. */
  readonly onLeave: () => void;
  /** The visitor asked to start this world's in-world demo; the director hands it the controls. */
  readonly onDemo?: () => void;
  readonly textures?: TextureProvider;
}

/**
 * One repository's own world (spec §5): the environment carries the atmosphere, the exhibit board
 * carries the screenshot and opens the panel, and the return portal leads back to the start world.
 *
 * Bespoke scenes under `world/projects/<slug>/` extend this and call `add()` in their constructor;
 * everything else about them is inherited.
 */
export class ProjectScene implements WorldScene {
  readonly id: string;
  readonly landmarks: readonly Landmark[];
  /** Where the director puts the player on arrival, and which way they look. */
  readonly arrival: { readonly position: Vector3; readonly yaw: number };

  protected readonly environment: Environment;
  protected readonly project: Project;
  protected readonly returnPortal: ReturnPortal;
  protected readonly exhibit: ScreenLandmark;

  private readonly parts: SceneObject[];
  private cachedColliders: readonly Collider[] | null = null;
  private cachedInteractables: readonly Interactable[] | null = null;

  constructor(options: ProjectSceneOptions) {
    this.environment = options.environment;
    this.project = options.project;
    this.id = `project:${options.project.slug}`;

    const [anchor] = this.environment.anchors(1);
    this.exhibit = new ScreenLandmark({
      project: options.project,
      placement: anchor,
      ground: this.environment.ground,
      reducedMotion: options.reducedMotion,
      onEnter: options.onOpenInfo,
      textures: options.textures,
    });

    // Turned to face the arriving player's back: `Landmark` then derives a spawn point a few
    // metres in front of it and a yaw pointing away, which is exactly "the exit is behind you".
    // Subtracting `Math.PI` here, not adding it: `Landmark.spawnYaw` is `rotationY + Math.PI`, so
    // only the minus form makes the portal's own `spawnYaw` equal `environment.spawnYaw` rather
    // than `environment.spawnYaw + 2π` — the two place the portal identically, but only the minus
    // form satisfies the `arrival.yaw` assertion this same plan writes below. Task 11 found this
    // sample used `+`; the shipped code uses `-` and is the authority where the two disagree.
    const back: LandmarkPlacement = {
      position: [this.environment.spawn.x, 0, this.environment.spawn.z],
      rotationY: this.environment.spawnYaw - Math.PI,
    };
    this.returnPortal = new ReturnPortal({
      project: options.project,
      placement: back,
      ground: this.environment.ground,
      reducedMotion: options.reducedMotion,
      onEnter: () => options.onLeave(),
      textures: options.textures,
    });

    this.arrival = { position: this.returnPortal.spawn, yaw: this.returnPortal.spawnYaw };
    this.landmarks = [this.exhibit, this.returnPortal];
    this.parts = [this.exhibit, this.returnPortal];
  }

  /**
   * The in-world demo this world offers, if it has one. A getter rather than a field so a bespoke
   * scene can override it without depending on the order class fields are initialised in.
   */
  get demo(): InWorldDemo | null {
    return null;
  }

  /** Adds a bespoke object. Call from a subclass constructor only: shapes are read after that. */
  protected add(object: SceneObject): void {
    this.parts.push(object);
    this.cachedColliders = null;
    this.cachedInteractables = null;
  }

  get ground() {
    return this.environment.ground;
  }

  // Cached rather than recomputed: the render loop reads both every frame, and rebuilding two
  // arrays per frame would allocate for nothing. `add` clears the cache.
  get colliders(): readonly Collider[] {
    return (this.cachedColliders ??= [
      ...this.environment.colliders,
      ...this.parts.flatMap((part) => part.colliders ?? []),
    ]);
  }

  get interactables(): readonly Interactable[] {
    return (this.cachedInteractables ??= this.parts.flatMap((part) => part.interactables ?? []));
  }

  init(ctx: WorldContext): void {
    this.environment.init(ctx);
    this.parts.forEach((part) => part.init(ctx));
  }

  update(dt: number, ctx: WorldContext): void {
    this.environment.update(dt, ctx);
    this.parts.forEach((part) => part.update(dt, ctx));
  }

  dispose(): void {
    this.parts.forEach((part) => part.dispose());
    this.environment.dispose();
  }
}
```

- [ ] **Step 5: Run the scene test to verify it passes**

```sh
npx ng test --include='**/project.scene.spec.ts'
```

Expected: PASS.

- [ ] **Step 6: Run the gate**

```sh
npm run verify
```

Expected: PASS. Nothing constructs a `ProjectScene` yet, so the app is unchanged.

- [ ] **Step 7: Commit**

```sh
git add -A src/app/world
git commit -m "Add the generic ProjectScene and its return portal"
```

---

### Task 6: Deslopify's own world, and the end of `DeslopifyLandmark`

Spec §5: "Today's `DeslopifyLandmark` moves out of the start world into its own scene, where the video wall belongs." The wall becomes a plain scene object; deslopify's landmark in the start world becomes an ordinary portal.

**Files:**

- Create: `src/app/world/projects/deslopify/video-wall.ts`
- Create: `src/app/world/projects/deslopify/deslopify.scene.ts`
- Create: `src/app/world/project/create-project-scene.ts`
- Delete: `src/app/world/landmarks/deslopify/deslopify.landmark.ts` and `.spec.ts`
- Modify: `src/app/world/landmarks/create-landmark.ts`, `src/app/world/hub/hub.scene.ts` (drop `onDemo`), `src/app/content/repo-overrides.ts`
- Test: `src/app/world/projects/deslopify/deslopify.scene.spec.ts`, `src/app/world/project/create-project-scene.spec.ts`

**Interfaces:**

- Consumes: `ProjectScene`, `SceneObject` (Task 5).
- Produces:

  ```ts
  export class VideoWall implements SceneObject, InWorldDemo {
    constructor(options: {
      origin: Vector3;
      rotationY: number;
      ground: HeightField;
      accent: string;
      reducedMotion: () => boolean;
      onDemo: () => void;
    });
    readonly demoHint: string;
    enter(player: PlayerController): void;
    interact(): void;
    exit(): void;
    get showingOriginals(): boolean;
  }
  export const EXAMPLE_VIDEOS: readonly { original: string; slop: string }[]; // moved here unchanged
  export class DeslopifyScene extends ProjectScene {
    readonly wall: VideoWall;
    override get demo(): InWorldDemo;
  }
  export function createProjectScene(options: ProjectSceneOptions): Promise<ProjectScene>;
  ```

- [ ] **Step 1: Move the wall out of the landmark, keeping its behaviour**

Create `src/app/world/projects/deslopify/video-wall.ts`. Copy these four blocks **verbatim** from `src/app/world/landmarks/deslopify/deslopify.landmark.ts` — they are unchanged by this plan and retyping them would only introduce differences:

- `EXAMPLE_VIDEOS` (lines 21–29),
- the constants `CARD_WIDTH`, `CARD_HEIGHT`, `CARD_GAP`, `WALL_CENTRE_Y`, `WALL_DEPTH`, `VIEWPOINT_DISTANCE`, `INTERACT_RADIUS`, `FLIP_SECONDS`, `CANVAS_WIDTH`, `CANVAS_HEIGHT` (lines 34–46; `WALL_OFFSET_X`/`WALL_OFFSET_Z` do **not** come along — the scene places the wall now),
- `cardMaterial` (lines 188–219),
- `wrapText` (lines 221 to the end of the file).

Then re-express the behaviour as a standalone object rather than a `PortalLandmark` subclass:

```ts
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext } from '@engine/world-object';
import type { InWorldDemo, SceneObject } from '../../project/project.scene';

// EXAMPLE_VIDEOS, CARD_WIDTH, CARD_HEIGHT, CARD_GAP, WALL_CENTRE_Y, WALL_DEPTH,
// VIEWPOINT_DISTANCE, INTERACT_RADIUS, FLIP_SECONDS, CANVAS_WIDTH, CANVAS_HEIGHT,
// cardMaterial() and wrapText() move here unchanged from deslopify.landmark.ts.

export interface VideoWallOptions {
  /** Ground-level centre of the wall. */
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
  readonly accent: string;
  readonly reducedMotion: () => boolean;
  readonly onDemo: () => void;
}

/**
 * The wall of video cards that shows what Deslopify fixes. It used to hang off the hub's portal;
 * now it stands in Deslopify's own world, which is where a demo of the project belongs (spec §5).
 */
export class VideoWall implements SceneObject, InWorldDemo {
  readonly id = 'deslopify:wall';
  readonly demoHint = 'E: Originaltitel ein- und ausblenden · Esc: Demo verlassen';
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly centre: Vector3;
  private readonly options: VideoWallOptions;
  private cards: { mesh: Mesh; slop: MeshBasicMaterial; original: MeshBasicMaterial }[] = [];
  private originals = false;
  private flip: { elapsed: number } | null = null;

  constructor(options: VideoWallOptions) {
    this.options = options;
    this.centre = options.origin.clone();
    this.centre.y = options.ground.heightAt(this.centre.x, this.centre.z);
    this.group.position.copy(this.centre);
    this.group.rotation.y = options.rotationY;
    this.group.name = this.id;

    const width = EXAMPLE_VIDEOS.length * (CARD_WIDTH + CARD_GAP);
    const rotation = new Euler(0, options.rotationY, 0);
    const corners = [-width / 2, width / 2].flatMap((x) =>
      [-0.6, 0.6].map((z) => new Vector3(x, 0, z).applyEuler(rotation).add(this.centre)),
    );
    this.colliders = [
      {
        kind: 'aabb',
        minX: Math.min(...corners.map((corner) => corner.x)),
        maxX: Math.max(...corners.map((corner) => corner.x)),
        minZ: Math.min(...corners.map((corner) => corner.z)),
        maxZ: Math.max(...corners.map((corner) => corner.z)),
      },
    ];
    this.interactables = [
      {
        id: `${this.id}:demo`,
        position: this.centre.clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Deslopify ausprobieren',
        onInteract: () => options.onDemo(),
      },
    ];
  }

  get showingOriginals(): boolean {
    return this.originals;
  }

  /** Unit vector pointing out of the wall's face, towards approaching visitors. */
  private front(): Vector3 {
    return new Vector3(Math.sin(this.options.rotationY), 0, Math.cos(this.options.rotationY));
  }

  init(ctx: WorldContext): void {
    const wallWidth = EXAMPLE_VIDEOS.length * (CARD_WIDTH + CARD_GAP) + CARD_GAP;
    const backing = new Mesh(
      new BoxGeometry(wallWidth, CARD_HEIGHT + 2 * CARD_GAP + 0.5, WALL_DEPTH),
      new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7 }),
    );
    backing.name = 'video-wall';
    backing.position.set(0, WALL_CENTRE_Y, 0);
    backing.castShadow = ctx.quality.shadows;
    this.group.add(backing);

    const accent = new Color(this.options.accent);
    EXAMPLE_VIDEOS.forEach((video, index) => {
      const slop = cardMaterial(video.slop, `#${accent.getHexString()}`, index);
      const original = cardMaterial(video.original, '#1b7f4f', index);
      const mesh = new Mesh(new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), slop);
      mesh.name = `card:${index}`;
      mesh.position.set(
        (index - (EXAMPLE_VIDEOS.length - 1) / 2) * (CARD_WIDTH + CARD_GAP),
        WALL_CENTRE_Y + 0.15,
        WALL_DEPTH / 2 + 0.01,
      );
      this.group.add(mesh);
      this.cards.push({ mesh, slop, original });
    });

    ctx.scene.add(this.group);
  }

  /** Parks the visitor in front of the wall, looking at it. */
  enter(player: PlayerController): void {
    const viewpoint = this.centre.clone().addScaledVector(this.front(), VIEWPOINT_DISTANCE);
    viewpoint.y = this.options.ground.heightAt(viewpoint.x, viewpoint.z) + PLAYER_EYE_HEIGHT;
    player.teleport(viewpoint, this.options.rotationY);
  }

  interact(): void {
    this.originals = !this.originals;
    if (this.options.reducedMotion()) {
      this.applyTitles();
    } else {
      this.flip = { elapsed: 0 };
    }
  }

  exit(): void {
    this.originals = false;
    this.flip = null;
    this.applyTitles();
    this.cards.forEach((card) => card.mesh.scale.set(1, 1, 1));
  }

  update(dt: number): void {
    if (!this.flip) {
      return;
    }

    this.flip.elapsed += dt;
    const t = Math.min(this.flip.elapsed / FLIP_SECONDS, 1);
    // Squash to nothing at the halfway point, swap, then grow back.
    const width = Math.abs(1 - 2 * t);
    if (t >= 0.5) {
      this.applyTitles();
    }
    this.cards.forEach((card) => card.mesh.scale.set(Math.max(width, 0.01), 1, 1));
    if (t >= 1) {
      this.flip = null;
    }
  }

  dispose(): void {
    this.cards.forEach((card) => {
      card.slop.map?.dispose();
      card.slop.dispose();
      card.original.map?.dispose();
      card.original.dispose();
    });
    this.cards = [];
    disposeObject3D(this.group);
    this.group.clear();
  }

  private applyTitles(): void {
    this.cards.forEach((card) => {
      card.mesh.material = this.originals ? card.original : card.slop;
    });
  }
}
```

- [ ] **Step 2: Write the failing scene test**

Create `src/app/world/projects/deslopify/deslopify.scene.spec.ts`:

```ts
import { Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { JungleEnvironment } from '../../environments/jungle';
import { DeslopifyScene } from './deslopify.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'deslopify')!;

function scene(): DeslopifyScene {
  return new DeslopifyScene({
    environment: new JungleEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    onDemo: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
}

describe('DeslopifyScene', () => {
  it('offers the video wall alongside the exhibit and the way back', () => {
    const prompts = scene().interactables.map((interactable) => interactable.prompt);

    expect(prompts).toContain('Deslopify ausprobieren');
    expect(prompts.some((prompt) => prompt.startsWith('Zurück'))).toBe(true);
  });

  it('flips the card titles when the demo is used, and puts them back on exit', () => {
    const target = scene();
    target.init(stubContext());

    target.wall.interact();
    expect(target.wall.showingOriginals).toBe(true);

    target.wall.exit();
    expect(target.wall.showingOriginals).toBe(false);
  });

  it('blocks the wall as well as the environment', () => {
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const plain = environment.colliders.length;

    expect(scene().colliders.length).toBeGreaterThan(plain + 1);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = scene();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```sh
npx ng test --include='**/deslopify.scene.spec.ts'
```

Expected: FAIL — cannot resolve `./deslopify.scene`.

- [ ] **Step 4: Write the scene**

Create `src/app/world/projects/deslopify/deslopify.scene.ts`:

```ts
import { Vector3 } from 'three';
import { InWorldDemo, ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import { VideoWall } from './video-wall';

/** Metres to the side of the exhibit board where the wall stands. */
const WALL_OFFSET = 6.5;

/**
 * Deslopify's own world: the jungle, the exhibit board, the way back, and the wall of
 * mistranslated video titles that used to hang off the hub's portal (spec §5).
 */
export class DeslopifyScene extends ProjectScene {
  readonly wall: VideoWall;

  constructor(options: ProjectSceneOptions) {
    super(options);

    // Beside the exhibit, turned the same way, so both face an arriving visitor.
    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );
    this.wall = new VideoWall({
      origin: this.exhibit.position.clone().addScaledVector(side, WALL_OFFSET),
      rotationY: this.exhibit.rotationY,
      ground: this.environment.ground,
      accent: options.project.theme.primary,
      reducedMotion: options.reducedMotion,
      onDemo: () => options.onDemo?.(),
    });
    this.add(this.wall);
  }

  /** The wall is what "try it in the world" runs; the director asks the scene for it. */
  override get demo(): InWorldDemo {
    return this.wall;
  }
}
```

- [ ] **Step 5: Write the scene registry and its test**

Create `src/app/world/project/create-project-scene.ts`:

```ts
import { ProjectScene, ProjectSceneOptions } from './project.scene';

/**
 * Slugs with a scene of their own, each behind its own dynamic import so a bespoke world never
 * weighs on the generic one. The same registry shape as `createLandmark`, and the same rule:
 * anything unknown gets the generic scene, so a typo never leaves a project unreachable.
 */
const BESPOKE: Readonly<
  Record<string, () => Promise<new (o: ProjectSceneOptions) => ProjectScene>>
> = {
  deslopify: () => import('../projects/deslopify/deslopify.scene').then((m) => m.DeslopifyScene),
};

export async function createProjectScene(options: ProjectSceneOptions): Promise<ProjectScene> {
  const load = BESPOKE[options.project.slug];
  if (!load) {
    return new ProjectScene(options);
  }

  const Scene = await load();

  return new Scene(options);
}
```

Create `src/app/world/project/create-project-scene.spec.ts`:

```ts
import { Texture } from 'three';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { ShowroomEnvironment } from '../environments/showroom';
import { createProjectScene } from './create-project-scene';
import { ProjectScene } from './project.scene';

const options = (project: Project) => ({
  environment: new ShowroomEnvironment({ reducedMotion: () => true }),
  project,
  reducedMotion: () => true,
  onOpenInfo: () => undefined,
  onLeave: () => undefined,
  textures: { load: () => new Texture(), release: () => undefined },
});

describe('createProjectScene', () => {
  it('gives a curated slug its bespoke scene', async () => {
    const project = PROJECT_FIXTURES.find((candidate) => candidate.slug === 'deslopify')!;

    const scene = await createProjectScene(options(project));

    expect(scene.constructor.name).toBe('DeslopifyScene');
  });

  it('gives every other slug the generic scene', async () => {
    const project = PROJECT_FIXTURES.find((candidate) => candidate.slug === 'novaverta')!;

    const scene = await createProjectScene(options(project));

    expect(scene.constructor).toBe(ProjectScene);
  });
});
```

- [ ] **Step 6: Retire `DeslopifyLandmark`**

```sh
git rm src/app/world/landmarks/deslopify/deslopify.landmark.ts \
       src/app/world/landmarks/deslopify/deslopify.landmark.spec.ts
```

In `src/app/world/landmarks/create-landmark.ts`, drop the import and the `case 'deslopify':` branch. In `src/app/content/repo-overrides.ts`, change deslopify's landmark to an ordinary portal, keeping its position and its model:

```ts
    landmark: { position: [0, 0, -20], rotationY: 0, model: 'assets/models/arch.glb' },
```

(`kind` now falls back to `'portal'` in `mergeRepo`.)

In `src/app/world/hub/hub.scene.ts`, remove `onDemo` from `HubSceneOptions` and from the `createLandmark` call: no landmark in the start world runs a demo any more. Remove it from `hub.page.ts`'s construction too; `startDemo`/`endDemo` stay, because Task 9 rewires them to the scene director.

Fix the fallout the compiler points at: `src/app/world/landmarks/base/portal.landmark.spec.ts`, `src/app/world/hub/hub.scene.spec.ts`, `src/app/content/testing/project-fixtures.ts` (deslopify's `landmark.kind`), and any spec importing `EXAMPLE_VIDEOS` — that now comes from `@world/projects/deslopify/video-wall`.

- [ ] **Step 7: Run the world tests to verify they pass**

```sh
npx ng test --include='**/world/**/*.spec.ts'
```

Expected: PASS.

- [ ] **Step 8: Run the gate**

```sh
npm run verify
```

Expected: PASS. `npm run e2e` will still fail on `tests/demo.spec.ts`, which walks to the video wall in the start world — Task 11 rewrites it. Note that and carry on.

- [ ] **Step 9: Commit**

```sh
git add -A src/app
git commit -m "Move Deslopify's video wall into its own world and retire DeslopifyLandmark"
```

---

### Task 7: `WorldStore` learns the difference between a world and a panel

Until now `activeSlug !== null` meant "a modal panel covers the hub", and three derived signals leaned on that. After this plan `/p/:slug` is a _world you stand in_ and `/p/:slug/info` is the panel, so the two have to be separate facts.

**Files:**

- Modify: `src/app/ui/store/world.store.ts`
- Test: `src/app/ui/store/world.store.spec.ts`

**Interfaces:**

- Produces:

  ```ts
  readonly activeSlug: Signal<string | null>;   // which repo world is open; unchanged name, narrowed meaning
  readonly panelOpen: Signal<boolean>;          // /p/:slug/info is showing
  readonly swapping: Signal<boolean>;           // a scene build is in flight; the veil follows this
  openProject(slug: string | null): void;       // unchanged
  setPanelOpen(open: boolean): void;
  setSwapping(swapping: boolean): void;
  ```

  `inputMode` returns `'ui'` for `!started || panelOpen || menuOpen || settingsOpen`, and `'demo'`/`'world'` as before. `paused` gains `swapping`.

- [ ] **Step 1: Write the failing store tests**

Append to `src/app/ui/store/world.store.spec.ts`, inside the existing `describe`:

```ts
it('leaves the world in charge of the input while the visitor stands in a repo world', () => {
  // Standing in Deslopify's jungle is not an overlay: WASD must still walk.
  store.markStarted();
  store.openProject('deslopify');

  expect(store.inputMode()).toBe('world');
});

it('hands the input to the UI when the panel opens on top of a repo world', () => {
  store.markStarted();
  store.openProject('deslopify');
  store.setPanelOpen(true);

  expect(store.inputMode()).toBe('ui');
});

it('pauses the render loop while a scene is being built', () => {
  store.setSwapping(true);

  expect(store.paused()).toBe(true);
});

it('forgets the panel and the swap when the page goes away', () => {
  store.setPanelOpen(true);
  store.setSwapping(true);

  store.resetTransient();

  expect(store.panelOpen()).toBe(false);
  expect(store.swapping()).toBe(false);
});
```

- [ ] **Step 2: Run them to verify they fail**

```sh
npx ng test --include='**/world.store.spec.ts'
```

Expected: FAIL — `setPanelOpen` is not a function.

- [ ] **Step 3: Split the two facts apart**

In `src/app/ui/store/world.store.ts`, change the comment on `activeSlug` and add the two new signals beside it:

```ts
  /** Which repo world is open — `null` is the start world. The router owns this (spec §6). */
  readonly activeSlug = signal<string | null>(null);
  /** The `/p/:slug/info` panel is showing on top of that world. The router owns this too. */
  readonly panelOpen = signal(false);
  /** A scene is being built; the veil covers the swap and the loop stands still behind it. */
  readonly swapping = signal(false);
```

Replace `paused` and `inputMode`:

```ts
  /** The app's own reasons to stop the render loop; the engine adds tab-hidden and off-screen. */
  readonly paused = computed(() => this.menuOpen() || this.settingsOpen() || this.swapping());

  /**
   * Any overlay takes the input away from the world; a running demo takes it next. Standing in a
   * repo world does not: it is a place, not a dialog, so `activeSlug` is deliberately absent here.
   */
  readonly inputMode = computed<InputMode>(() => {
    if (!this.started() || this.panelOpen() || this.menuOpen() || this.settingsOpen()) {
      return 'ui';
    }
    return this.demoActive() ? 'demo' : 'world';
  });
```

Add the two setters next to `openProject`:

```ts
  setPanelOpen(open: boolean): void {
    this.panelOpen.set(open);
  }

  setSwapping(swapping: boolean): void {
    this.swapping.set(swapping);
  }
```

and extend `resetTransient` with `this.setPanelOpen(false);` and `this.setSwapping(false);`.

- [ ] **Step 4: Run the store tests to verify they pass**

```sh
npx ng test --include='**/world.store.spec.ts'
```

Expected: PASS. Existing assertions that opened a project and expected `'ui'` must be rewritten to open the panel — that is the behaviour change, not a broken test.

- [ ] **Step 5: Run the gate**

```sh
npm run verify
```

Expected: PASS, after fixing `hub.page.ts`'s start-gate condition, which still reads `store.activeSlug() === null`. Change it to `!store.panelOpen()`:

```html
@if (!store.started() && !store.panelOpen()) {
<app-loading-screen (start)="startWorld()" />
}
```

- [ ] **Step 6: Commit**

```sh
git add -A src/app/ui src/app/features
git commit -m "Separate the open repo world from the open panel in WorldStore"
```

---

### Task 8: The `SceneDirector`

The one place that turns "the route says `deslopify`" into "the jungle is on screen and the player is standing in it".

**Files:**

- Create: `src/app/engine/testing/stub-engine.ts` (extracted from `hub.page.spec.ts`)
- Create: `src/app/features/world/scene-director.ts`
- Test: `src/app/features/world/scene-director.spec.ts`

**Interfaces:**

- Consumes: `createEnvironment` (Task 4), `ProjectScene`/`InWorldDemo` (Task 5), `createProjectScene` (Task 6), `WorldStore.setSwapping`/`setArea` (Task 7), `HubScene` (Task 3).
- Produces:

  ```ts
  @Service()
  export class SceneDirector {
    show(slug: string | null): Promise<void>; // null builds the start world
    startDemo(): void; // starts the current scene's in-world demo, if any
    endDemo(): void;
    demoInteract(): boolean; // true if a demo consumed the key
    reset(): void; // page teardown: drop the remembered slug and demo
  }
  ```

- [ ] **Step 1: Extract the stub engine so two specs can share it**

Create `src/app/engine/testing/stub-engine.ts` by moving the `StubEngine` class out of `src/app/features/hub/hub.page.spec.ts` verbatim, adding `export`, and importing `TestBed`/`InputService` there. Change `hub.page.spec.ts` to `import { StubEngine } from '@engine/testing/stub-engine';` and delete its local copy.

Run `npx ng test --include='**/hub.page.spec.ts'` and expect PASS before going on.

- [ ] **Step 2: Write the failing director tests**

Create `src/app/features/world/scene-director.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ENGINE } from '@engine/engine.service';
import { DEVICE_CAPABILITIES } from '@engine/capability.service';
import { CAPABLE } from '@engine/testing/world-context';
import { StubEngine } from '@engine/testing/stub-engine';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { WorldStore } from '@ui/store/world.store';
import { HubScene } from '@world/hub/hub.scene';
import { ProjectScene } from '@world/project/project.scene';
import { SceneDirector } from './scene-director';

describe('SceneDirector', () => {
  let engine: StubEngine;
  let director: SceneDirector;
  let store: WorldStore;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    engine = new StubEngine();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENGINE, useValue: engine },
        { provide: DEVICE_CAPABILITIES, useValue: CAPABLE },
        { provide: CONTENT_SOURCE, useValue: { projects: async () => PROJECT_FIXTURES } },
      ],
    });
    director = TestBed.inject(SceneDirector);
    store = TestBed.inject(WorldStore);
    await TestBed.inject(ContentService).ready;
  });

  it('builds the start world when no project is named', async () => {
    await director.show(null);

    expect(engine.world).toBeInstanceOf(HubScene);
  });

  it('builds a repository’s own world for its slug', async () => {
    await director.show('novaverta');

    expect(engine.world).toBeInstanceOf(ProjectScene);
    expect(engine.world?.id).toBe('project:novaverta');
  });

  it('stands the player in the repo world it just built', async () => {
    await director.show('novaverta');
    const scene = engine.world as ProjectScene;

    expect(engine.player.position.x).toBeCloseTo(scene.arrival.position.x, 5);
    expect(engine.player.position.z).toBeCloseTo(scene.arrival.position.z, 5);
  });

  it('puts the returning visitor back at the portal they walked into', async () => {
    await director.show('novaverta');
    await director.show(null);

    const hub = engine.world as HubScene;
    const landmark = hub.landmarkFor('novaverta');
    expect(landmark).toBeDefined();
    expect(engine.player.position.x).toBeCloseTo(landmark!.spawn.x, 5);
    expect(engine.player.position.z).toBeCloseTo(landmark!.spawn.z, 5);
  });

  it('builds no world at all for a slug nothing matches', async () => {
    await director.show(null);
    const before = engine.world;

    await director.show('does-not-exist');

    // The start world stays and the panel explains itself — the behaviour the E2E suite pins.
    expect(engine.world).toBe(before);
  });

  it('builds once when two navigations overlap, and disposes the old world once', async () => {
    await director.show(null);
    const first = engine.world!;
    // Counted by hand rather than with `vi.spyOn`: the Angular vitest builder does not expose `vi`
    // as a global here, and the existing specs never reach for it.
    let disposals = 0;
    const dispose = first.dispose.bind(first);
    first.dispose = () => {
      disposals++;
      dispose();
    };

    await Promise.all([director.show('novaverta'), director.show('poetzscher')]);

    expect(engine.world?.id).toBe('project:poetzscher');
    expect(disposals).toBe(1);
    expect(engine.scenesSet).toBe(2);
  });

  it('announces the place and the project for screen readers', async () => {
    await director.show('novaverta');

    expect(store.area()).toBe('Showroom — Phönix Industriedienstleistungen');
  });

  it('raises and clears the swap flag around a build', async () => {
    const pending = director.show('novaverta');
    expect(store.swapping()).toBe(true);

    await pending;
    expect(store.swapping()).toBe(false);
  });
});
```

`StubEngine` needs one addition for the double-navigation test: a `scenesSet` counter incremented in `setScene`, and `setScene` must call `this.world?.dispose()` before replacing, exactly as the real engine does. Add both in Step 1's extraction.

- [ ] **Step 3: Run it to verify it fails**

```sh
npx ng test --include='**/scene-director.spec.ts'
```

Expected: FAIL — cannot resolve `./scene-director`.

- [ ] **Step 4: Write the director**

Create `src/app/features/world/scene-director.ts`:

```ts
import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AssetService } from '@engine/asset.service';
import { CapabilityService } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { WorldScene } from '@engine/world-object';
import { ContentService } from '@content/content.service';
import type { Project } from '@content/project.model';
import { WorldStore } from '@ui/store/world.store';
import { HubScene } from '@world/hub/hub.scene';
import { createEnvironment } from '@world/environments/create-environment';
import type { Environment } from '@world/environments/environment';
import { createProjectScene } from '@world/project/create-project-scene';
import { InWorldDemo, ProjectScene } from '@world/project/project.scene';

/**
 * Turns the open route into the world on screen (spec §6).
 *
 * It lives in `features/` because it is the one thing that legitimately needs both a scene and the
 * router; `@ui/*` may not import `@world/*`, and `@world/*` may not know about routing.
 */
@Service()
export class SceneDirector {
  private readonly engine = inject(ENGINE);
  private readonly content = inject(ContentService);
  private readonly capability = inject(CapabilityService);
  private readonly assets = inject(AssetService);
  private readonly store = inject(WorldStore);
  private readonly router = inject(Router);

  /**
   * Guards re-entrancy: a second navigation while a build is in flight bumps this, and the first
   * build then throws its result away instead of swapping a world nobody asked for any more.
   */
  private sequence = 0;
  private current: WorldScene | null = null;
  /** The project the visitor last stood in, so returning puts them back at its portal. */
  private previousSlug: string | null = null;
  private demo: InWorldDemo | null = null;

  /** Builds the world the route asks for. `null` is the start world. */
  async show(slug: string | null): Promise<void> {
    const project = slug === null ? null : (this.content.bySlug(slug) ?? null);
    // An unknown slug builds nothing: the start world stays and the panel explains itself (spec §6).
    if (slug !== null && !project) {
      return;
    }

    const token = ++this.sequence;
    this.store.setSwapping(true);

    try {
      const environment = await createEnvironment(project?.environment ?? 'clearing', {
        reducedMotion: () => this.capability.reducedMotion(),
      });
      // Superseded while the chunk loaded. Nothing has been handed to the engine and nothing has
      // been `init`ed, so the half-built environment holds no GPU resources to release.
      if (token !== this.sequence) {
        return;
      }

      const scene = project
        ? await this.projectScene(project, environment)
        : this.hubScene(environment);
      if (token !== this.sequence) {
        return;
      }

      this.endDemo();
      // `setScene` disposes the previous world; only a scene that reaches here was ever built.
      this.engine.setScene(scene);
      this.current = scene;
      this.place(scene);
      this.store.setArea(project ? `${environment.name} — ${project.title}` : environment.name);
      this.previousSlug = slug;
    } finally {
      if (token === this.sequence) {
        this.store.setSwapping(false);
      }
    }
  }

  /** Starts the current world's in-world demo, if it has one. */
  startDemo(): void {
    const demo = this.current instanceof ProjectScene ? this.current.demo : null;
    if (!demo || this.demo) {
      return;
    }

    this.demo = demo;
    demo.enter(this.engine.player);
    this.store.setDemoActive(true, demo.demoHint);
  }

  endDemo(): void {
    if (!this.demo) {
      return;
    }
    this.demo.exit();
    this.demo = null;
    this.store.setDemoActive(false);
  }

  /** Lets a running demo consume the interact key. `false` means the world should handle it. */
  demoInteract(): boolean {
    if (!this.demo) {
      return false;
    }
    this.demo.interact();

    return true;
  }

  /** Page teardown: the store is a root singleton, so the remembered state has to go with it. */
  reset(): void {
    this.endDemo();
    this.sequence++;
    this.current = null;
    this.previousSlug = null;
  }

  private hubScene(environment: Environment): HubScene {
    return new HubScene({
      environment,
      reducedMotion: () => this.capability.reducedMotion(),
      projects: this.content.projects(),
      onEnter: (project) => void this.router.navigate(['/p', project.slug]),
      onAreaChange: (area) => this.store.setArea(area),
      textures: this.assets,
    });
  }

  private projectScene(project: Project, environment: Environment): Promise<ProjectScene> {
    return createProjectScene({
      environment,
      project,
      reducedMotion: () => this.capability.reducedMotion(),
      onOpenInfo: () => void this.router.navigate(['/p', project.slug, 'info']),
      onLeave: () => void this.router.navigate(['/']),
      onDemo: () => this.startDemo(),
      textures: this.assets,
    });
  }

  /** Where the arriving player stands (spec §6, "Placement and re-entrancy"). */
  private place(scene: WorldScene): void {
    if (scene instanceof ProjectScene) {
      const { position, yaw } = scene.arrival;
      this.engine.player.teleport(position.clone().setY(position.y + PLAYER_EYE_HEIGHT), yaw);
      return;
    }

    const hub = scene as HubScene;
    const landmark = this.previousSlug ? hub.landmarkFor(this.previousSlug) : undefined;
    if (landmark) {
      // In front of the portal they came out of, with their back to it — as it already worked.
      this.engine.player.teleport(
        landmark.spawn.clone().setY(landmark.spawn.y + PLAYER_EYE_HEIGHT),
        landmark.spawnYaw,
      );
      return;
    }
    this.engine.player.teleport(
      hub.spawn.clone().setY(hub.spawn.y + PLAYER_EYE_HEIGHT),
      hub.spawnYaw,
    );
  }
}
```

- [ ] **Step 5: Run the director tests to verify they pass**

```sh
npx ng test --include='**/scene-director.spec.ts'
```

Expected: PASS.

- [ ] **Step 6: Run the gate**

```sh
npm run verify
```

Expected: PASS. `hub.page.ts` still builds its own `HubScene`; Task 9 hands that job over.

- [ ] **Step 7: Commit**

```sh
git add -A src/app
git commit -m "Add the SceneDirector: route slug in, built and placed world out"
```

---

### Task 9: The routes and `WorldPage`

`HubPage` knew every scene class. `WorldPage` knows a canvas, a HUD and a director.

**Files:**

- Move: `src/app/features/hub/hub.page.ts` → `src/app/features/world/world.page.ts` (+ spec)
- Modify: `src/app/app.routes.ts`, `src/app/ui/project-panel/project-panel.ts`
- Modify: `src/app/features/world/scene-director.ts` (adds `travelTo`)
- Test: `src/app/features/world/world.page.spec.ts`

**Interfaces:**

- Consumes: `SceneDirector` (Task 8), `WorldStore.panelOpen`/`swapping` (Task 7).
- Produces: `WorldPage` with selector `app-world-page`; `SceneDirector.travelTo(slug: string): void`.

- [ ] **Step 1: Move and rename the page**

```sh
git mv src/app/features/hub/hub.page.ts src/app/features/world/world.page.ts
git mv src/app/features/hub/hub.page.spec.ts src/app/features/world/world.page.spec.ts
rmdir src/app/features/hub
grep -rl "HubPage\|app-hub-page\|features/hub" src tests \
  | xargs sed -i '' -e 's/HubPage/WorldPage/g' -e 's/app-hub-page/app-world-page/g' \
                    -e 's#features/hub/hub.page#features/world/world.page#g'
```

- [ ] **Step 2: Write the new route table**

Replace the first entry in `src/app/app.routes.ts`:

```ts
  {
    path: '',
    loadComponent: () => import('./features/world/world.page').then((m) => m.WorldPage),
    canActivate: [simpleViewGuard],
    children: [
      {
        // Componentless on purpose (spec §6's `ProjectDestination`): this node exists to carry
        // `:slug` for the `SceneDirector` and to hand it down to the panel. Angular's default
        // `paramsInheritanceStrategy` inherits params from a component-less parent, so
        // `withComponentInputBinding()` still fills `ProjectPanel.slug`.
        path: 'p/:slug',
        children: [
          {
            path: 'info',
            loadComponent: () =>
              import('./ui/project-panel/project-panel').then((m) => m.ProjectPanel),
          },
        ],
      },
    ],
  },
```

- [ ] **Step 3: Point the panel back at its world**

In `src/app/ui/project-panel/project-panel.ts`, the panel now sits on top of a repo world, so closing it must not leave that world (spec §7):

```ts
  protected close(): void {
    void this.router.navigate(['/p', this.slug()]);
  }
```

and update the class comment: it is opened by `/p/:slug/info` over the repo world, not over the hub.

- [ ] **Step 4: Give the director fast travel**

Append to `src/app/features/world/scene-director.ts`:

```ts
  /**
   * The project menu's direct travel (spec §7). Inside the start world it is a teleport to that
   * project's portal; from a repo world there is nothing to teleport to, so it becomes a
   * navigation and the router builds the world.
   */
  travelTo(slug: string): void {
    const landmark = this.current instanceof HubScene ? this.current.landmarkFor(slug) : undefined;
    if (!landmark) {
      void this.router.navigate(['/p', slug]);
      return;
    }

    this.endDemo();
    this.engine.player.teleport(
      landmark.spawn.clone().setY(landmark.spawn.y + PLAYER_EYE_HEIGHT),
      landmark.rotationY,
    );
  }
```

- [ ] **Step 5: Write the failing page tests**

Add to `src/app/features/world/world.page.spec.ts`:

```ts
it('asks the director for the start world when it boots at the root route', async () => {
  await bootWithoutManifest();

  expect(engine.world?.id).toBe('hub');
});

it('asks the director for a repo world when the route names a project', async () => {
  await TestBed.inject(Router).navigate(['/p', 'novaverta']);
  await bootWithoutManifest();

  expect(engine.world?.id).toBe('project:novaverta');
});

it('keeps the world in charge of the input while standing in a repo world', async () => {
  await bootWithoutManifest();
  store.markStarted();
  await TestBed.inject(Router).navigate(['/p', 'novaverta']);
  TestBed.tick();

  expect(fixture.nativeElement.getAttribute('data-input-mode')).toBe('world');
});
```

Rewrite the existing assertions that expected `data-input-mode="ui"` on `/p/:slug`: they must navigate to `/p/:slug/info` now.

- [ ] **Step 6: Run them to verify they fail**

```sh
npx ng test --include='**/world.page.spec.ts'
```

Expected: FAIL — the page still constructs `HubScene` itself.

- [ ] **Step 7: Hand scene ownership to the director**

In `src/app/features/world/world.page.ts`: delete the `hub`, `demo` fields, `placeAt`, `startDemo`, `endDemo` and the `HubScene`/`ClearingEnvironment`/`Landmark`/`PLAYER_EYE_HEIGHT` imports; add `private readonly director = inject(SceneDirector);`.

Replace `openSlug` with the full route state:

```ts
  /**
   * The router is the source of truth for which world is open and whether the panel is on top of
   * it (spec §6); everything else follows from this one signal.
   */
  private readonly routeState = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const destination = this.route.snapshot.firstChild;
        return {
          slug: destination?.paramMap.get('slug') ?? null,
          panel: destination?.firstChild?.routeConfig?.path === 'info',
        };
      }),
    ),
    { initialValue: { slug: null as string | null, panel: false } },
  );
```

Replace the route effect with two, and add the demo bridge:

```ts
effect(() => {
  const { slug, panel } = this.routeState();
  this.store.openProject(slug);
  this.store.setPanelOpen(panel);
  // Keep the world alive but cheap behind the panel; on the weakest tier stop drawing entirely.
  this.engine.setThrottle(panel && this.capability.tier() !== 'low' ? 15 : null);
  this.engine.setPaused(this.store.paused() || (panel && this.capability.tier() === 'low'));
  // Opening the panel ends a running demo; the panel is a different place.
  if (panel) {
    this.director.endDemo();
  }
});

// Separate, and keyed on the slug alone: a scene build must not be restarted because the panel
// opened or the quality tier stepped down.
effect(() => {
  const { slug } = this.routeState();
  if (this.shown !== slug && this.store.phase() !== 'booting') {
    this.shown = slug;
    void this.director.show(slug);
  }
});

// The panel asks for an in-world demo through the store; fulfil it once its world exists.
effect(() => {
  const slug = this.store.demoRequest();
  if (slug && this.store.ready() && !this.store.panelOpen()) {
    this.store.requestDemo(null);
    this.director.startDemo();
  }
});
```

with `private shown: string | null | undefined = undefined;` on the class.

Replace the scene construction in `boot()` with:

```ts
this.engine.attach(canvas);
this.engine.resize(canvas.clientWidth, canvas.clientHeight);
this.engine.onNearbyChange = (nearby) => this.store.setNearby(nearby);

const { slug } = this.routeState();
this.shown = slug;
await this.director.show(slug);

this.store.reportProgress(1);
this.store.markReady();
```

Update `travelTo` and `onAction`:

```ts
  protected travelTo(slug: string): void {
    this.director.travelTo(slug);
  }

  private onAction(action: InputAction): void {
    switch (action) {
      case 'interact':
        // A running demo eats the key; otherwise it goes to whatever the player is facing.
        if (!this.director.demoInteract()) {
          this.engine.nearby?.onInteract();
        }
        break;
      case 'menu':
        if (!this.store.panelOpen() && this.store.started()) {
          this.store.toggleMenu();
        }
        break;
      case 'exit':
        if (this.store.menuOpen()) {
          this.store.setMenuOpen(false);
        } else if (this.routeState().panel) {
          void this.router.navigate(['/p', this.routeState().slug]);
        } else if (this.store.demoActive()) {
          this.director.endDemo();
        } else if (this.routeState().slug !== null) {
          void this.router.navigate(['/']);
        }
        break;
    }
  }
```

and in the `DestroyRef` teardown replace `this.endDemo()` with `this.director.reset()`.

- [ ] **Step 8: Run the page tests to verify they pass**

```sh
npx ng test --include='**/world.page.spec.ts'
```

Expected: PASS.

- [ ] **Step 9: Run the gate**

```sh
npm run verify
```

Expected: PASS. E2E is still red (Task 11 rewrites it); that is expected here and nowhere else.

- [ ] **Step 10: Commit**

```sh
git add -A src
git commit -m "Route worlds through WorldPage and the SceneDirector"
```

---

### Task 10: The veil, the announcement and reduced motion

A scene swap is a stall unless it is staged, and a change of place is invisible to a screen reader unless it is said out loud (spec §6, §7).

**Files:**

- Create: `src/app/ui/scene-veil/scene-veil.ts`
- Modify: `src/app/features/world/world.page.ts`
- Test: `src/app/ui/scene-veil/scene-veil.spec.ts`

**Interfaces:**

- Consumes: `WorldStore.swapping` (Task 7), `CapabilityService.reducedMotion`.
- Produces: `SceneVeil` with `visible = input.required<boolean>()` and `instant = input(false)`, selector `app-scene-veil`.

- [ ] **Step 1: Write the failing veil test**

Create `src/app/ui/scene-veil/scene-veil.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SceneVeil } from './scene-veil';

describe('SceneVeil', () => {
  async function veil(visible: boolean, instant = false) {
    const fixture = TestBed.createComponent(SceneVeil);
    fixture.componentRef.setInput('visible', visible);
    fixture.componentRef.setInput('instant', instant);
    await fixture.whenStable();
    return fixture;
  }

  it('says that something is loading, politely, without trapping focus', async () => {
    const fixture = await veil(true);
    const status = fixture.nativeElement.querySelector('[role="status"]');

    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.textContent).toContain('Welt wird geladen');
    // A focus trap here would strand the keyboard for the length of the build (spec §7).
    expect(fixture.nativeElement.querySelector('[aria-modal]')).toBe(null);
  });

  it('reports nothing while no scene is being built', async () => {
    const fixture = await veil(false);

    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBe(null);
  });

  it('cuts rather than fades when motion is unwanted', async () => {
    const fixture = await veil(true, true);

    expect(fixture.nativeElement.classList.contains('instant')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```sh
npx ng test --include='**/scene-veil.spec.ts'
```

Expected: FAIL — cannot resolve `./scene-veil`.

- [ ] **Step 3: Write the veil**

Create `src/app/ui/scene-veil/scene-veil.ts`:

```ts
import { Component, input } from '@angular/core';

/**
 * Covers the canvas while one world is swapped for another (spec §6).
 *
 * Deliberately *not* the `LoadingScreen`: that is a modal `aria-modal` dialog with a focus trap,
 * and trapping focus for the length of a build would strand a keyboard user mid-walk (spec §7).
 * This is a plain status region that the page renders on top of everything and nobody can tab into.
 */
@Component({
  selector: 'app-scene-veil',
  template: `
    <div class="veil" [class.visible]="visible()">
      @if (visible()) {
        <p role="status" aria-busy="true">Welt wird geladen …</p>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .veil {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: #0b141c;
      color: #fff;
      font:
        500 1rem/1.4 system-ui,
        sans-serif;
      opacity: 0;
      transition: opacity 220ms ease;
    }
    .veil.visible {
      opacity: 1;
    }
    :host(.instant) .veil {
      transition: none;
    }
    p {
      margin: 0;
    }
  `,
  host: {
    '[class.instant]': 'instant()',
  },
})
export class SceneVeil {
  /** A scene is being built. */
  readonly visible = input.required<boolean>();
  /** `prefers-reduced-motion`, or the settings override: the fade becomes a hard cut (spec §6). */
  readonly instant = input(false);
}
```

- [ ] **Step 4: Run the veil test to verify it passes**

```sh
npx ng test --include='**/scene-veil.spec.ts'
```

Expected: PASS.

- [ ] **Step 5: Put it on the page**

In `src/app/features/world/world.page.ts`, add `SceneVeil` to `imports` and render it above the outlet, after the HUD:

```html
<app-scene-veil [visible]="store.swapping()" [instant]="capability.reducedMotion()" />
```

`capability` is currently `private`; change it to `protected` so the template may read it.

The arrival announcement needs no new markup: `SceneDirector.show()` already writes `"Dschungel — Deslopify"` into `store.area()`, and the HUD renders that in a `<p class="area" aria-live="polite">`. Add a comment there saying so, because it is now load-bearing for accessibility rather than decoration:

```html
<!-- Also the arrival announcement for a scene change (spec §7); the director writes it. -->
<p class="area" aria-live="polite">{{ store.area() }}</p>
```

- [ ] **Step 6: Run the gate**

```sh
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

```sh
git add -A src/app
git commit -m "Veil the scene swap and announce arrivals to screen readers"
```

---

### Task 11: The journeys, the leak test and the documents

The last task is where the reversal of "the hub scene is never destroyed" is actually proven, and where every document that still describes an overlay is corrected.

**Files:**

- Modify: `tests/panel.spec.ts`, `tests/demo.spec.ts`, `tests/memory.spec.ts`, `tests/smoke.spec.ts`
- Create: `tests/worlds.spec.ts`, `tests/a11y.spec.ts`
- Modify: `package.json` (adds `@axe-core/playwright`)
- Modify: `CLAUDE.md`, `IMPLEMENTATION_PLAN.md`, `HANDOFF.md`

**Interfaces:**

- Consumes: everything above. No new production code.

- [ ] **Step 1: Move the panel's deep links one level down**

In `tests/panel.spec.ts`, every `page.goto('/p/novaverta')` becomes `page.goto('/p/novaverta/info')`, and the two tests whose _meaning_ changed are rewritten:

```ts
test('closing the panel leaves the visitor in the repository’s own world', async ({ page }) => {
  await page.goto('/p/novaverta/info');
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.locator('button[data-role="close"]').click();

  await expect(page).toHaveURL(/\/p\/novaverta$/);
  await expect(page.getByRole('dialog', { name: /Phönix/ })).toHaveCount(0);
  await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('app-hud .area')).toContainText('Showroom');
});

test('an unknown slug explains itself and leaves the start world standing', async ({ page }) => {
  await page.goto('/p/nope/info');

  await expect(page.getByRole('dialog')).toContainText('nicht gefunden');
  await expect(page.locator('app-hud .area')).toContainText('Lichtung');
});
```

- [ ] **Step 2: Rewrite the demo journeys for Deslopify's own world**

Replace `tests/demo.spec.ts` with:

```ts
import { expect, test } from '@playwright/test';

test.describe('demos', () => {
  test('an embeddable project shows its live demo in a sandboxed iframe', async ({ page }) => {
    await page.goto('/p/novaverta/info');

    const frame = page.locator('app-demo-frame iframe');
    await expect(frame).toHaveAttribute('src', 'https://jamie-io.github.io/novaverta/');
    await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(page.locator('a[data-role="open-tab"]')).toHaveAttribute('target', '_blank');
  });

  test('the in-world demo starts from the panel and leaves with Esc', async ({ page }) => {
    await page.goto('/p/deslopify/info');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    await page.locator('button[data-role="try-in-world"]').click();

    // Back to the jungle itself, with the demo running.
    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'demo');
    const hint = page.locator('app-hud .prompt');
    await expect(hint).toContainText('Originaltitel');

    await page.keyboard.press('KeyE');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'demo');

    await page.keyboard.press('Escape');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(hint).not.toContainText('Originaltitel');
  });

  test('the in-world demo also starts from the video wall standing in the jungle', async ({
    page,
  }) => {
    await page.goto('/p/deslopify');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await page.locator('app-world-page canvas').focus();

    // The wall stands beside the exhibit board; walk forward until it is in reach.
    await page.keyboard.down('KeyW');
    await expect(page.locator('app-hud .prompt')).toContainText('ausprobieren', {
      timeout: 20_000,
    });
    await page.keyboard.up('KeyW');

    await page.keyboard.press('KeyE');

    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'demo');
  });
});
```

If the third test cannot reach the wall by walking straight, adjust the walk (`KeyW` then `KeyD`) rather than the assertion — and if the wall is genuinely unreachable from the arrival point, that is a `DeslopifyScene` bug worth fixing in Task 6's file, not a test to relax.

- [ ] **Step 3: Write the journeys through the portals**

Create `tests/worlds.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { startWorld } from './helpers';

test.describe('walking between worlds', () => {
  test('using a portal changes the world, and the way back returns to it', async ({ page }) => {
    await startWorld(page);
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');

    await page.keyboard.press('KeyM');
    await page.locator('button[data-role="travel"][data-slug="deslopify"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .prompt')).toContainText('betreten');

    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-hud .area')).toContainText('Dschungel');

    // The return portal stands at the arrival point, right behind the visitor.
    await page.keyboard.down('ArrowLeft');
    await expect(page.locator('app-hud .prompt')).toContainText('Zurück', { timeout: 20_000 });
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('app-hud .area')).toContainText('Deslopify');
  });

  test('a deep link builds the repo world without the start world first', async ({ page }) => {
    await page.goto('/p/deslopify');

    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('app-hud .area')).toContainText('Dschungel — Deslopify');
  });

  test('a deep link to the description opens the panel over that world', async ({ page }) => {
    await page.goto('/p/deslopify/info');

    await expect(page.getByRole('dialog', { name: 'Deslopify' })).toBeVisible();
    await expect(page.locator('app-world-page canvas')).toBeVisible();
  });

  test('the browser’s back button walks back across worlds', async ({ page }) => {
    await startWorld(page);
    await page.keyboard.press('KeyM');
    await page.locator('a[data-role="open"][data-slug="novaverta"]').click();
    await expect(page.locator('app-hud .area')).toContainText('Showroom');

    await page.goBack();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');
  });

  test('the exhibit in a repo world opens that project’s description', async ({ page }) => {
    await page.goto('/p/novaverta');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await page.locator('app-world-page canvas').focus();

    await page.keyboard.down('KeyW');
    await expect(page.locator('app-hud .prompt')).toContainText('ansehen', { timeout: 20_000 });
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/p\/novaverta\/info$/);
    await expect(page.getByRole('dialog', { name: /Phönix/ })).toBeVisible();
  });
});
```

- [ ] **Step 4: Extend the memory test across worlds**

This is the test that makes the reversed "never destroyed" decision safe (spec §2). Replace the cycle in `tests/memory.spec.ts`:

```ts
/**
 * The start world is now disposed when the visitor walks into a repo world and built again when
 * they come back (spec §2, reversing IMPLEMENTATION_PLAN.md §3). Resources must therefore be flat
 * across start world → repo world → start world, not just across opening and closing an overlay.
 */
test.describe('memory', () => {
  test('nothing leaks across five world changes', async ({ page }) => {
    await startWorld(page, '/?stats=1');
    const stats = page.locator('app-hud .stats');
    await expect(stats).toHaveAttribute('data-scene-geometries', /^[1-9]\d*$/);

    const cycle = async () => {
      await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
      await page.keyboard.press('KeyM');
      await page.locator('a[data-role="open"][data-slug="deslopify"]').click();
      await expect(page).toHaveURL(/\/p\/deslopify$/);
      await expect(page.locator('app-hud .area')).toContainText('Dschungel');

      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('app-hud .area')).toContainText('Deslopify');
    };

    // One cycle first, so lazily arriving models (portal glTF) are in place before the baseline.
    await cycle();
    const baseline = await settledStats(page, ['scene-geometries', 'scene-textures']);

    for (let i = 0; i < 5; i++) {
      await cycle();
    }

    const after = await settledStats(page, [
      'scene-geometries',
      'scene-textures',
      'geometries',
      'textures',
    ]);
    expect(after['scene-geometries']).toBe(baseline['scene-geometries']);
    expect(after['scene-textures']).toBe(baseline['scene-textures']);
    expect(after.geometries).toBeLessThanOrEqual(baseline['scene-geometries']);
    expect(after.textures).toBeLessThanOrEqual(baseline['scene-textures']);
  });
});
```

A failure here is a real leak. Debug it with `superpowers:systematic-debugging` against `disposeObject3D` and the refcounts in `AssetService` — do not relax the assertion.

- [ ] **Step 5: Add the axe pass on a repo world**

```sh
npm install --save-dev @axe-core/playwright
```

Create `tests/a11y.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Spec §8: a repo world and the panel over it must both survive an axe pass. */
test.describe('accessibility', () => {
  test('a repo world has no automatically detectable violations', async ({ page }) => {
    await page.goto('/p/novaverta');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the description panel over a repo world has none either', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

Spec §8 also asks for Lighthouse accessibility at 1.00. There is no Lighthouse run in this repository and no Playwright job in CI yet — `HANDOFF.md` already records the CI job as a follow-up. Add the Lighthouse check to that same follow-up rather than inventing a job here; Step 8 does it.

- [ ] **Step 6: Run the full E2E suite**

```sh
npx playwright install chromium
npm run e2e
```

Expected: PASS. Chromium needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, which `playwright.config.ts` already passes.

- [ ] **Step 7: Correct the documents that still describe an overlay**

In `CLAUDE.md`:

- Replace the bullet "**The hub scene is never destroyed.**…" with:

  > **A destination is a world, not an overlay.** Walking into a portal disposes the start world and
  > builds that repository's own (`docs/superpowers/specs/2026-09-10-repo-worlds-design.md` §2,
  > which reverses the earlier rule deliberately). `SceneDirector` owns the swap and guards it with a
  > sequence token; the router remains the source of truth for _which_ world is open, and
  > `/p/:slug/info` is the description panel on top of it. The extended memory E2E test is what keeps
  > the reversal safe.

- Under "Architecture", add `features/world/` to the description: the layer where the router and a
  scene legitimately meet, since `@ui/*` may not import `@world/*`.
- In the "Demo embedding" row of the fixed-decisions table, leave the decision alone but note that
  the in-world demo now stands in the project's own world.

In `IMPLEMENTATION_PLAN.md` §3, replace the "hub is created once" paragraph with the same reversal
and the new route table, and in §1 add `world/environments/`, `world/project/`, `world/projects/`
and `features/world/` to the folder skeleton.

In `HANDOFF.md`, extend the existing "Playwright job in CI" follow-up to include the Lighthouse
accessibility run spec §8 asks for, and record that `@axe-core/playwright` now runs locally.

- [ ] **Step 8: Run the gate one last time**

```sh
npm run verify && npm run e2e
```

Expected: PASS, `budget:check` included — the four environments and the bespoke Deslopify scene are lazy chunks. If `budget:check` fails, find the static import that pulled one of them into the initial bundle; do not raise the limit.

- [ ] **Step 9: Commit**

```sh
git add -A
git commit -m "Cover the world swap with E2E tests and correct the documents it reverses"
```

---

## Untouched on purpose

Three things spec §7 mentions and this plan deliberately does not change. Check them rather than edit them.

- **`simpleViewGuard` needs no change.** It is a `CanActivateFn` on `''`, so it already covers every
  child route added here, and its `PROJECT_DEEP_LINK` regex (`^/p/([^/?#]+)`) captures the slug out of
  `/p/deslopify/info` just as it does out of `/p/deslopify`. Phones and machines without WebGL2 keep
  landing on `/projects/:slug`. It must stay `canActivate` and never become `canMatch`, for the reason
  its own comment gives. Task 11's `tests/smoke.spec.ts` already asserts the phone redirect; add a case
  for `/p/gitplore/info` there if it is cheap, and leave the guard alone either way.
- **`/projects` and `/projects/:slug` need no change.** They read the same `ContentService`, so newly
  synced repositories appear there automatically, and nothing about the scene swap touches them. They
  remain the path for phones, for missing WebGL2 and for screen readers.
- **The panel's internals need no change.** `marked` + DOMPurify, the focus trap, `aria-modal`, the
  sandboxed iframe and its screenshot fallback all stay exactly as they are. Only `close()` moves, in
  Task 9.

## Verification

The plan is done when all of the following hold:

| Claim                                          | Command                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Units, lint, types, build and budget are green | `npm run verify`                                                                          |
| Every journey across worlds works              | `npm run e2e`                                                                             |
| Nothing leaks across five world changes        | `npx playwright test tests/memory.spec.ts`                                                |
| A repo world passes axe                        | `npx playwright test tests/a11y.spec.ts`                                                  |
| Environments are lazy chunks                   | `npm run build && npm run budget:check`, then check `dist/` for one chunk per environment |

Before claiming any of it, use `superpowers:verification-before-completion`: run the command and read the output.

## Follow-up: what this plan deliberately leaves out

- **The `homepage`-derived iframe demo.** Plan 1 deferred it and this plan does not pick it up: an auto-discovered demo still needs a `content:check` pass and a captured screenshot before `embeddable: true` can be anything but a guess. `SyncedRepo.homepage` stays synced and unread.
- **Bespoke worlds beyond Deslopify.** `createProjectScene` is the hook; filling it is content work, one folder per slug, and does not need a plan.
- **Lighthouse in CI, and a Playwright job in CI.** Both stay recorded in `HANDOFF.md`, as they already are.
- **Translation of the interface**, and anything about other people's profiles — out of scope for the whole project (spec §10).
