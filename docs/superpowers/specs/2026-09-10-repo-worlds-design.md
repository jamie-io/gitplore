# Repo worlds — design

Status: agreed with Jamie on 2026-09-10, ready for an implementation plan.
Supersedes the sketch of a "GitHub explorer" phase in `PLAN.md` and `IMPLEMENTATION_PLAN.md` §1/§4.

## 1. What this is

gitplore is Jamie's personal portfolio, built to be shown to potential employers. Someone opens
the link, arrives in a generic world, sees a portal for each of **Jamie's own** public
repositories, and walks into one. Behind the portal is that repository's own themed world — a
jungle, a showroom — where the project's screenshots and its interactive demo stand as objects,
and the README, tags and source link open in the existing panel.

There is no username input and no support for other people's profiles. Because every repository
is Jamie's, per-repository customisation is the normal case, not an exception: he decides what a
portal looks like and which world it leads to. The generic path is the fallback for repositories
he has not styled yet.

### The reality this design is sized for

Measured on 2026-09-10, `users/jamie-io/repos` returns five repositories — `gitplore`,
`webkatalog_demoshop`, `novaverta`, `poetzscher-homepage`, `deslopify`. None is a fork, none is
archived, and **none sets `homepage`, `description` or `topics`**, although novaverta and
poetzscher have live demos that today are hardcoded in `content/projects.ts`.

So the sync buys **discovery and freshness** — a new repository appears in the world after the
next deploy, READMEs stay current — not finished content. German titles and summaries stay
hand-written, because GitHub holds none and the site is German. A design that assumed GitHub
metadata would carry the world would produce five nameless portals.

## 2. Decisions

| Topic                | Decision                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Data source          | Build-time sync into a committed `public/content/repos.json`. No runtime GitHub calls.                                  |
| Repository selection | All public repositories; forks, archived and an explicit hidden list dropped; capped at 12 as a safety net.             |
| Start world          | The current hub look, with one portal per synced repository.                                                            |
| Destination          | A real scene change into a per-repository themed world, not an overlay.                                                 |
| Inside a repo world  | The environment carries atmosphere and the project's objects; README, tags, source and demo stay in the existing panel. |
| Environments         | Three or four reusable ones in `world/environments/`, assigned per repository, with a neutral default.                  |
| Scene ownership      | Route-driven: the router says which world is open, a `SceneDirector` builds it.                                         |

### A fixed decision this reverses

`CLAUDE.md` states: **"The hub scene is never destroyed."** That was true while a destination was
an overlay panel. Walking through a portal into another world is a real scene change, so the start
world is disposed on entry and rebuilt on return. This is deliberate and was agreed explicitly.

The consequences are handled rather than hoped away:

- The start world is procedural and cheap to rebuild; nothing about it is loaded from the network
  except textures the `AssetService` already refcounts and caches.
- Player placement on return is defined below rather than left to whatever the rebuild does.
- The existing memory E2E test — which compares scene-owned geometry and texture counts across
  five enter/exit cycles and requires GPU counts not to exceed them — is extended to cover
  start world → repo world → start world. That test is the safeguard for this reversal.

## 3. Data pipeline

### `scripts/sync-repos.mjs` (new)

One unauthenticated request to
`https://api.github.com/users/jamie-io/repos?per_page=100&sort=pushed&type=owner`. The REST API
allows 60 requests per hour per IP and sends `access-control-allow-origin: *`; one request per
deploy is far inside that, and no token is needed — which matters, because GitHub Pages is a
static host and could not hold one.

The script drops forks, archived repositories and anything marked `hidden` in the overrides, caps
the result at 12, and writes `public/content/repos.json`, committed like the synced READMEs.

**On failure it warns and keeps the committed file, exiting 0.** A deploy must not break because
GitHub is briefly unavailable. This differs from `sync-readmes.mjs`, which exits non-zero, and the
difference is intentional: a missing README is a content bug in a repository Jamie curated, while
an unreachable API is weather.

The selection and mapping logic lives in `scripts/lib/repos.mjs` so it can be unit-tested with
`node --test`, exactly as `scripts/lib/embeddable.mjs` already is.

### `scripts/sync-readmes.mjs` (changed)

Reads `repos.json` plus the overrides instead of importing `PROJECTS`, and fetches one README per
visible repository. Its failure rule is refined, because auto-discovery makes a repository without
a `README.md` likely rather than exceptional:

- A repository that has an **override** is curated, so a missing README is an error and fails the
  script, as today.
- An **auto-discovered** repository without a README produces a warning, no file, and a panel that
  shows the summary and source link without a README section.

### `scripts/check-embeddable.mjs` (changed)

Runs over the merged project list rather than `PROJECTS`, so a demo discovered from a repository's
`homepage` is verified against its live framing headers exactly like a curated one. It stays a hard
gate: `embeddable: true` may never be a lie.

### Freshness

`.github/workflows/deploy.yml` already runs `content:sync` then `content:check` before the build.
`content:sync` gains the repository sync. Nothing becomes a `prebuild` hook — offline builds must
keep working from the committed copies.

## 4. Content model

`content/projects.ts` becomes `content/repo-overrides.ts`, keyed by GitHub repository name:

```ts
export type EnvironmentId = 'clearing' | 'jungle' | 'showroom' | 'plaza';

/** One repository as `scripts/sync-repos.mjs` wrote it into public/content/repos.json. */
export interface SyncedRepo {
  readonly name: string;
  readonly description: string | null;
  readonly language: string | null;
  readonly topics: readonly string[];
  readonly repoUrl: string;
  readonly homepage: string | null;
  readonly pushedAt: string;
  readonly stars: number;
}

/** Everything GitHub cannot express, including things that are code and must live here. */
export interface RepoOverride {
  readonly hidden?: boolean;
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly year?: number;
  readonly demo?: ProjectDemo;
  readonly landmark?: Partial<ProjectLandmark>;
  readonly environment?: EnvironmentId;
  readonly theme?: { readonly primary: string; readonly accent: string };
}
```

`Project` changes in three places:

- it gains `readonly environment: EnvironmentId`;
- `ProjectLandmark.position` becomes optional — an absent position means "place me at an anchor";
- **`readme` becomes optional.** The model currently forces every project to name a README source,
  and `ProjectPanel` keys on `readme.kind === 'bundled'`. An auto-discovered repository may simply
  have no `README.md`, so `readme?: ReadmeSource` is the honest shape: the panel omits the README
  section entirely rather than rendering an error where a document was promised.

### Merge rules

`GithubContentSource implements ContentSource` reads `content/repos.json` same-origin (resolved
against `<base href>`, so the GitHub Pages → own-server move stays a build flag) and merges each
entry with its override. The precedence is fixed and testable:

| Field               | Rule                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`              | override, else the repository name lowercased                                                                                                 |
| `title`             | override, else the repository name                                                                                                            |
| `summary`           | override, else GitHub `description`, else a plain line built from language and last push (`"JavaScript · zuletzt aktualisiert im März 2026"`) |
| `tags`              | override, else language and topics, empties removed                                                                                           |
| `repoUrl`           | GitHub                                                                                                                                        |
| `year`              | override only; absent is fine                                                                                                                 |
| `readme`            | `{ kind: 'bundled', path: 'content/readme/<slug>.md' }` when the sync wrote one, otherwise absent                                             |
| `demo`              | override, else an `iframe` demo from `homepage` when `check-embeddable` confirmed it, else `none`                                             |
| `landmark.kind`     | override, else `'portal'`                                                                                                                     |
| `landmark.position` | override, else the anchor for this project's index                                                                                            |
| `environment`       | override, else `'showroom'`                                                                                                                   |
| `theme`             | override, else a neutral default constant                                                                                                     |

No invented prose: the third summary fallback is factual metadata, not a placeholder pretending to
be a description.

The merge cannot discover on its own whether a repository has a README, so `sync-readmes.mjs`
records the answer: it writes `hasReadme` back into each `repos.json` entry after fetching, and the
merge only names a README source when that flag is true. The committed file is then the record of
what was actually synced.

### Ordering and anchor assignment

Projects keep the API's `pushed` order, and unpinned projects take anchors in that order, so the
most recently worked-on repository stands nearest the spawn. An employer therefore meets current
work first. The trade-off is that pushing to a repository can move landmarks; the mitigation is to
pin `landmark.position` in the override for anything that should stay put. `novaverta`,
`poetzscher` and `deslopify` keep their current authored positions this way.

## 5. World model

`HubScene` currently hardwires `Terrain`, `Sky`, `Monument` and the landmarks together. That splits
into two concepts.

### `Environment`

The surroundings, knowing nothing about projects:

```ts
export interface Anchor {
  readonly position: Vector3;
  readonly rotationY: number;
}

export interface Environment extends WorldObject {
  readonly id: EnvironmentId;
  readonly ground: HeightField;
  readonly spawn: Vector3;
  anchors(count: number): readonly Anchor[];
}
```

`ground` and `anchors()` must be available before `init()`, because scenes collect colliders in
their constructor through `Landmark.describe()` — the same contract `Terrain` already honours.

Putting `anchors()` on the environment keeps the layout rule where the space is: a clearing scatters
differently from a plaza. `world/environments/` gets `clearing.ts` (today's start-world look,
assembled from `Terrain`, `Sky` and `Monument`), `jungle.ts`, `showroom.ts` and `plaza.ts`.

### Scenes

- `HubScene(environment, projects, callbacks)` — the start world: one landmark per project, placed
  at its pinned position or its anchor. Its present responsibilities are unchanged.
- `ProjectScene(environment, project, callbacks)` — a repo world: the project's own objects
  (screenshot board, demo object, label) plus a **return portal**, which is an ordinary `Landmark`
  with a collider and an interactable that navigates to `/`.

`createProjectScene(project)` maps a slug to a bespoke scene class under `world/projects/<slug>/`
and otherwise to the generic `ProjectScene` — the same registry shape as `createLandmark`. Today's
`DeslopifyLandmark` moves out of the start world into its own scene, where the video wall belongs.

Environments and bespoke scenes are loaded through dynamic imports keyed by `EnvironmentId` and
slug, so neither the initial bundle nor the hub chunk grows with each new world.

## 6. Routing and transitions

`HubPage` becomes `WorldPage`: still one canvas, the HUD and the start gate, but no knowledge of
which world is running.

```
''                → WorldPage           (canvas, HUD, start gate)
  'p/:slug'       → ProjectDestination  (declares which world is meant)
    'info'        → ProjectPanel        (README, tags, source, demo)
```

A `SceneDirector` in `features/world/` reads the slug from the active child route and calls
`engine.setScene()`: no slug builds the start world, a slug builds that repository's world. This
keeps the existing rule that the router is the source of truth for the open destination, and gets
browser back, forward and deep links without bespoke code. `/p/deslopify` opens the jungle world
directly, without building the start world first.

`/p/:slug/info` gives the panel its own URL, so a link can point straight at a project's
description.

### The transition

A scene swap is visible as a stall unless it is staged:

1. The portal runs the existing dolly.
2. The `SceneDirector` loads the environment module and preloads its assets in parallel.
3. The existing `LoadingScreen` fades in as a veil.
4. The scene is swapped, the player placed, and the veil fades out.

Under `prefers-reduced-motion` the veil is a hard cut, joining the rule that already disables the
dolly, head-bob and sky animation.

### Placement and re-entrancy

Returning through the return portal navigates to `/`. The start world is rebuilt and the player
appears at the portal of the project they came from, with their back to it — the placement that
already exists today (`landmark.spawn`, `landmark.spawnYaw`). Arriving at `/` with no previous
project uses `environment.spawn`.

The `SceneDirector` guards re-entrancy with a sequence token: a second navigation during a build
discards the first result rather than swapping twice, and the previous scene is disposed exactly
once.

An unknown slug builds no world. The start world stays, and the panel explains itself, which is the
behaviour the existing E2E test already pins.

`simpleViewGuard` stays a `CanActivateFn` on `''` and so covers the child routes; phones and
machines without WebGL2 continue to `/projects`.

## 7. Panel, accessibility, simple view

The panel keeps `marked` + DOMPurify, its focus trap, `aria-modal`, and the sandboxed demo iframe
with its screenshot fallback. Only its close target changes: it returns to `/p/:slug`, the repo
world, instead of the start world. The project menu (`M`) still travels directly to a destination,
now across worlds, which the router handles.

A scene change adds two obligations:

- **Announcement.** A change of place is invisible to a screen reader. On arrival an `aria-live`
  region announces the place and project ("Dschungel — Deslopify"). The loading veil is an
  `aria-busy` status region and explicitly **not** a focus trap, or the keyboard would be stuck
  during the build. Focus returns to the canvas afterwards, as it does today.
- **Reduced motion.** The veil becomes a hard cut, as above.

`/projects` and `/projects/:slug` read the same `ContentService`, so newly synced repositories
appear there automatically. That path remains the one for phones, for missing WebGL2 and for
screen readers, and it is where the summary fallback chain matters most.

## 8. Testing

Following the split that already exists: script logic in `scripts/lib/` under `node --test`,
Angular under vitest, journeys under Playwright. Implementation is test-first.

**Unit.** `scripts/lib/repos.mjs`: forks, archived, hidden list, cap, and mapping to a
`SyncedRepo`. `GithubContentSource`: override precedence, slug remapping
(`poetzscher-homepage` → `poetzscher`), the summary fallback chain, anchor assignment for unpinned
projects, and stable behaviour when `repos.json` is missing or malformed. The existing schema test
moves from `projects.ts` to the merged result — unique slugs, valid demo union, screenshots that
exist, known environment ids. `SceneDirector`: an unknown slug builds nothing, a rapid double
navigation builds once, the previous scene is disposed.

**E2E.** Walk to a portal, press `E`, arrive in the repo world; return through the return portal and
stand at the right portal again; `/p/:slug` as a deep link without the start world;
`/p/:slug/info` opening the panel directly; browser back across worlds. An axe pass on a repo world,
and Lighthouse accessibility staying at 1.00.

**Memory.** The existing cycle test is extended to start world → repo world → start world. It is the
test that proves the reversed "never destroyed" decision is safe.

`npm run verify` remains the gate and `budget:check` the limit at 350 kB gzipped initial scripts.
Environments are lazy chunks and must not appear in the initial bundle.

## 9. Risks

| Risk                                           | Handling                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A leak in the new scene-swap path              | The extended memory E2E test; `disposeObject3D` and the refcounted `AssetService` already exist   |
| Landmarks moving when a repository is pushed   | Pin `landmark.position` in the override for anything that should stay                             |
| GitHub unavailable during a deploy             | `sync-repos.mjs` warns and keeps the committed file                                               |
| A repository without a README                  | Warning for auto-discovered repositories, hard failure for curated ones                           |
| Bundle growth per environment                  | Dynamic imports keyed by id; `budget:check` in CI                                                 |
| Rebuild cost when returning to the start world | Procedural geometry and cached textures; measured during implementation, veiled by the transition |

## 10. Out of scope

Other people's profiles, any username input, and runtime GitHub calls. Translation of the interface.
Bespoke worlds beyond the registry hook that makes them possible. Brotli in nginx and a Playwright
job in CI, both of which remain the follow-ups recorded in `HANDOFF.md`.
