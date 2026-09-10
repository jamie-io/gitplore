# Repositories Drive The World — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written `content/projects.ts` array with a build-time sync of Jamie's own public GitHub repositories, merged at runtime with a per-repository overrides file.

**Architecture:** A node script writes `public/content/repos.json` (committed) from one unauthenticated GitHub API call. A new `GithubContentSource` reads that file same-origin and merges each entry with `content/repo-overrides.ts`, producing the same `Project[]` the world already consumes. Nothing about the rendering, routing or panel changes; only where projects come from.

**Tech Stack:** Angular 22 (zoneless, signals, `@Service`, `inject()`), TypeScript strict, Three.js, vitest for units, `node --test` for scripts, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-09-10-repo-worlds-design.md` — read §3 (data pipeline) and §4 (content model) before starting. This plan implements those two sections only; §5–§7 (environments, scene swap, routing) are Plan 2.

**Deliberately deferred to Plan 2:** the `EnvironmentId` union and `Project.environment` from spec §4. Nothing in this plan reads them, and a field no code consumes is a field nobody keeps honest. `RepoOverride` gains `environment?: EnvironmentId` in Plan 2, alongside the environments it selects.

## Global Constraints

- Angular v22 rules from `CLAUDE.md`: no `standalone: true`, no explicit `OnPush`, no `@HostBinding`/`@HostListener`, `input()`/`output()`/`model()` over decorators, native control flow, `@Service` over `@Injectable({providedIn:'root'})` for new singletons, `inject()` over constructor injection.
- Layer boundaries are enforced by ESLint `no-restricted-imports`: `@content/*` must not import Three.js or anything from `@world/*` or `@ui/*`. Placement of landmarks is therefore a `world` concern, never a `content` one.
- Code, comments and commit messages in English. User-facing copy in German.
- Node 24.21.0 via nvm. Every shell needs `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` first.
- `npm run verify` (lint → typecheck → `ng test` → `test:scripts` → build → `budget:check`) is the gate before any task is called done. Initial scripts must stay ≤ 350 kB gzipped.
- Scripts are node ESM under `scripts/`, testable logic extracted into `scripts/lib/*.mjs` with `node --test` siblings, following `scripts/lib/embeddable.mjs`.
- Content sync is never a `prebuild` hook; committed copies must let an offline build succeed.

---

### Task 1: Make `readme` and landmark placement optional in the model

The model currently forces every project to name a README source and exact coordinates. An auto-discovered repository has neither. `Landmark` reads `project.landmark.position` in its constructor, so the scene must hand it a resolved placement instead.

**Files:**

- Modify: `src/app/content/project.model.ts`
- Modify: `src/app/world/landmarks/base/landmark.ts`
- Modify: `src/app/world/hub/hub.scene.ts`
- Modify: `src/app/ui/project-panel/project-panel.ts`
- Modify: `src/app/content/projects.ts` (no shape change; it keeps its explicit positions)
- Test: `src/app/world/landmarks/base/landmark.spec.ts`, `src/app/ui/project-panel/project-panel.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `ProjectLandmark.position?: readonly [number, number, number]`, `ProjectLandmark.rotationY?: number`, `Project.readme?: ReadmeSource`, and `LandmarkPlacement { position: readonly [number, number, number]; rotationY: number }` exported from `@world/landmarks/base/landmark`. `LandmarkOptions` gains a required `placement: LandmarkPlacement`.

- [ ] **Step 1: Write the failing test for a landmark built from an explicit placement**

Add to `src/app/world/landmarks/base/landmark.spec.ts`:

```ts
it('takes its position from the placement the scene resolved, not from the project', () => {
  const project = { ...baseProject, landmark: { kind: 'portal' as const } };

  const landmark = new TestLandmark({
    project,
    placement: { position: [4, 0, -6], rotationY: 1.5 },
    ground: flatGround,
    reducedMotion: () => false,
    onEnter: () => undefined,
  });

  expect(landmark.position.x).toBe(4);
  expect(landmark.position.z).toBe(-6);
  expect(landmark.rotationY).toBe(1.5);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test -- --include='**/landmark.spec.ts'`
Expected: FAIL — `placement` is not a known property of `LandmarkOptions`.

- [ ] **Step 3: Widen the model**

In `src/app/content/project.model.ts`:

```ts
export interface ProjectLandmark {
  readonly kind: LandmarkKind;
  /** Absent means the scene places it at one of the environment's anchors. */
  readonly position?: readonly [number, number, number];
  /** Absent means the scene turns it to face the spawn. */
  readonly rotationY?: number;
  readonly model?: string;
}
```

and in `Project`, replace `readonly readme: ReadmeSource;` with:

```ts
  /** Absent when the repository ships no README; the panel then omits the section. */
  readonly readme?: ReadmeSource;
```

- [ ] **Step 4: Take the placement from options in `Landmark`**

In `src/app/world/landmarks/base/landmark.ts`, add above `LandmarkOptions`:

```ts
/** Where a scene decided this landmark stands. Resolved before construction. */
export interface LandmarkPlacement {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}
```

add `readonly placement: LandmarkPlacement;` to `LandmarkOptions`, and change the first line of the constructor from

```ts
const { position, rotationY } = options.project.landmark;
```

to

```ts
const { position, rotationY } = options.placement;
```

- [ ] **Step 5: Resolve the placement in `HubScene`**

In `src/app/world/hub/hub.scene.ts`, inside the `options.projects.map(...)` callback, pass a placement built from the project's own coordinates (Task 5 replaces this fallback with a real layout):

```ts
this.landmarks = options.projects.map((project) =>
  createLandmark({
    project,
    placement: {
      position: project.landmark.position ?? [0, 0, 0],
      rotationY: project.landmark.rotationY ?? 0,
    },
    ground: this.terrain,
    reducedMotion: options.reducedMotion,
    onEnter: options.onEnter,
    onDemo: options.onDemo,
    textures: options.textures,
  }),
);
```

- [ ] **Step 6: Make the panel tolerate a missing README**

In `src/app/ui/project-panel/project-panel.ts`, change the readme slug computation to use optional chaining:

```ts
return project?.readme?.kind === 'bundled' ? project.slug : undefined;
```

and wrap the README block in the template. It currently reads:

```html
@if (readme.isLoading()) {
<p role="status">README wird geladen …</p>
} @else if (readme.error()) {
<p role="alert">Die README konnte nicht geladen werden – der Quellcode enthält sie.</p>
} @else if (readme.value(); as markdown) {
<app-markdown [markdown]="markdown" [topLevel]="3" />
}
```

Replace it with:

```html
@if (project.readme) { @if (readme.isLoading()) {
<p role="status">README wird geladen …</p>
} @else if (readme.error()) {
<p role="alert">Die README konnte nicht geladen werden – der Quellcode enthält sie.</p>
} @else if (readme.value(); as markdown) {
<app-markdown [markdown]="markdown" [topLevel]="3" />
} }
```

- [ ] **Step 7: Write the failing test for the panel without a README**

Add to `src/app/ui/project-panel/project-panel.spec.ts`:

```ts
it('omits the README section for a project that has none', async () => {
  await openPanelFor({ ...baseProject, readme: undefined });

  expect(fixture.nativeElement.querySelector('app-markdown')).toBeNull();
  expect(fixture.nativeElement.textContent).not.toContain('README');
});
```

- [ ] **Step 8: Run the whole gate**

Run: `npm run verify`
Expected: exit 0, all unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/content/project.model.ts src/app/world src/app/ui/project-panel
git commit -m "Model: optional README and scene-resolved landmark placement"
```

---

### Task 2: Repository selection and mapping logic

Pure functions, no I/O, so the rules that decide what appears in the world are unit-tested without touching the network.

**Files:**

- Create: `scripts/lib/repos.mjs`
- Test: `scripts/lib/repos.test.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: `REPO_LIMIT` (number, 12), `toSyncedRepo(apiRepo)` → a `SyncedRepo` object, and `selectRepos(apiRepos, hiddenNames)` → `SyncedRepo[]` in the order the API returned them (`sort=pushed`, newest first).

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/repos.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPO_LIMIT, selectRepos, toSyncedRepo } from './repos.mjs';

const api = (name, extra = {}) => ({
  name,
  description: null,
  language: null,
  topics: [],
  html_url: `https://github.com/jamie-io/${name}`,
  homepage: null,
  pushed_at: '2026-03-01T12:00:00Z',
  stargazers_count: 0,
  fork: false,
  archived: false,
  ...extra,
});

test('maps the fields the world needs and drops the rest', () => {
  const repo = toSyncedRepo(
    api('deslopify', {
      description: 'Restores original titles',
      language: 'JavaScript',
      topics: ['chrome-extension'],
      homepage: 'https://example.com/',
      stargazers_count: 7,
    }),
  );

  assert.deepEqual(repo, {
    name: 'deslopify',
    description: 'Restores original titles',
    language: 'JavaScript',
    topics: ['chrome-extension'],
    repoUrl: 'https://github.com/jamie-io/deslopify',
    homepage: 'https://example.com/',
    pushedAt: '2026-03-01T12:00:00Z',
    stars: 7,
  });
});

test('turns an empty description or homepage into null, never an empty string', () => {
  const repo = toSyncedRepo(api('novaverta', { description: '', homepage: '' }));

  assert.equal(repo.description, null);
  assert.equal(repo.homepage, null);
});

test('drops forks and archived repositories', () => {
  const selected = selectRepos(
    [api('keep'), api('a-fork', { fork: true }), api('old', { archived: true })],
    [],
  );

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['keep'],
  );
});

test('drops anything on the hidden list', () => {
  const selected = selectRepos([api('keep'), api('scratch')], ['scratch']);

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['keep'],
  );
});

test('keeps the order the api returned, so recent work stays first', () => {
  const selected = selectRepos([api('newest'), api('older'), api('oldest')], []);

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['newest', 'older', 'oldest'],
  );
});

test('caps the world at REPO_LIMIT entries', () => {
  const many = Array.from({ length: REPO_LIMIT + 5 }, (_, i) => api(`repo-${i}`));

  assert.equal(selectRepos(many, []).length, REPO_LIMIT);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module './repos.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/repos.mjs`:

```js
/**
 * Which of Jamie's repositories become landmarks, and the shape the app reads them in
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §3).
 */

/** A safety net, not a curation tool: a walkable world, however many repositories exist. */
export const REPO_LIMIT = 12;

/** Empty strings are GitHub's "unset"; null says so honestly to every consumer downstream. */
const orNull = (value) => (value ? value : null);

export function toSyncedRepo(apiRepo) {
  return {
    name: apiRepo.name,
    description: orNull(apiRepo.description),
    language: orNull(apiRepo.language),
    topics: apiRepo.topics ?? [],
    repoUrl: apiRepo.html_url,
    homepage: orNull(apiRepo.homepage),
    pushedAt: apiRepo.pushed_at,
    stars: apiRepo.stargazers_count,
  };
}

/**
 * Forks and archived repositories are not Jamie's current work, and the hidden list is the
 * explicit escape hatch. The API is asked for `sort=pushed`, so the order that survives here
 * puts the most recently worked-on repository first.
 */
export function selectRepos(apiRepos, hiddenNames) {
  const hidden = new Set(hiddenNames);

  return apiRepos
    .filter((repo) => !repo.fork && !repo.archived && !hidden.has(repo.name))
    .slice(0, REPO_LIMIT)
    .map(toSyncedRepo);
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npm run test:scripts`
Expected: PASS, 6 new tests on top of the existing 11.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/repos.mjs scripts/lib/repos.test.mjs
git commit -m "Repo selection and mapping, with tests"
```

---

### Task 3: The overrides file

`content/projects.ts` becomes the place for everything GitHub cannot express, keyed by repository name. The three curated projects move across unchanged in substance.

**Files:**

- Create: `src/app/content/repo-overrides.ts`
- Create: `src/app/content/repo-overrides.spec.ts`
- Keep (for now): `src/app/content/projects.ts` — Task 7 deletes it

**Interfaces:**

- Consumes: `ProjectDemo`, `ProjectLandmark` from `@content/project.model`.
- Produces: `RepoOverride` interface and `REPO_OVERRIDES: Readonly<Record<string, RepoOverride>>` keyed by GitHub repository name, plus `hiddenRepoNames(): string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/app/content/repo-overrides.spec.ts`:

```ts
import { REPO_OVERRIDES, hiddenRepoNames } from './repo-overrides';

describe('repo overrides', () => {
  it('keeps the curated projects addressable under their existing slugs', () => {
    expect(REPO_OVERRIDES['poetzscher-homepage'].slug).toBe('poetzscher');
    expect(REPO_OVERRIDES['novaverta'].slug).toBeUndefined();
    expect(REPO_OVERRIDES['deslopify'].slug).toBeUndefined();
  });

  it('writes German summaries, because GitHub has none', () => {
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.hidden) {
        continue;
      }
      expect(override.summary, `${name} needs a summary`).toBeTruthy();
      expect(override.summary!.length).toBeGreaterThan(20);
    }
  });

  it('pins a position for every curated project, so a push cannot move it', () => {
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.hidden) {
        continue;
      }
      expect(override.landmark?.position, `${name} needs a pinned position`).toBeDefined();
    }
  });

  it('lists hidden repositories by name', () => {
    expect(hiddenRepoNames()).toEqual(
      Object.entries(REPO_OVERRIDES)
        .filter(([, override]) => override.hidden)
        .map(([name]) => name),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test -- --include='**/repo-overrides.spec.ts'`
Expected: FAIL — cannot resolve `./repo-overrides`.

- [ ] **Step 3: Write the overrides file**

Create `src/app/content/repo-overrides.ts`:

```ts
import type { ProjectDemo, ProjectLandmark } from './project.model';

/**
 * Everything GitHub cannot express about one of Jamie's repositories, keyed by repository name
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §4).
 *
 * German copy lives here because GitHub holds none and the site is German. Anything that is code
 * — a bespoke landmark kind, a panel component — necessarily lives here too.
 */
export interface RepoOverride {
  /** Keeps the repository out of the world entirely. */
  readonly hidden?: boolean;
  /** Defaults to the repository name, lowercased. */
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly year?: number;
  readonly demo?: ProjectDemo;
  readonly landmark?: Partial<ProjectLandmark>;
  readonly theme?: { readonly primary: string; readonly accent: string };
}

export const REPO_OVERRIDES: Readonly<Record<string, RepoOverride>> = {
  novaverta: {
    title: 'Phönix Industriedienstleistungen',
    summary:
      'Website für den deutschen Generalimporteur der NOVA VERTA Lackierkabinen. Reines HTML, CSS und JavaScript, ohne Build-Schritt und ohne Laufzeitabhängigkeiten.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Static Site'],
    year: 2026,
    demo: {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/novaverta/',
      embeddable: true,
      screenshot: 'assets/screens/novaverta.webp',
    },
    landmark: { kind: 'screen', position: [-24, 0, -18], rotationY: 0.6 },
    theme: { primary: '#1b4f8f', accent: '#e8eef6' },
  },
  'poetzscher-homepage': {
    slug: 'poetzscher',
    title: 'Christopher Pötzsch – Objektservice',
    summary:
      'Statische Website für Objektservice und Gebäudetechnik, bewusst ohne externe Verbindungen: lokale Schriften, kein Analytics, kein Cookie-Banner.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Privacy by design'],
    year: 2026,
    demo: {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/poetzscher-homepage/',
      embeddable: true,
      screenshot: 'assets/screens/poetzscher.webp',
    },
    landmark: { kind: 'screen', position: [26, 0, -14], rotationY: -0.7 },
    theme: { primary: '#2f6b4f', accent: '#eaf2ec' },
  },
  deslopify: {
    title: 'Deslopify',
    summary:
      'Browser-Erweiterung, die von YouTube automatisch übersetzte Titel, Thumbnails, Beschreibungen und Tonspuren durch die Originale der Urheber ersetzt.',
    tags: ['JavaScript', 'Chrome Extension', 'MV3'],
    year: 2026,
    demo: { kind: 'custom', mode: 'in-world' },
    landmark: {
      kind: 'deslopify',
      position: [0, 0, -20],
      rotationY: 0,
      model: 'assets/models/arch.glb',
    },
    theme: { primary: '#8f2f2f', accent: '#f6eaea' },
  },
};

/** The repositories the sync must leave out, for `scripts/sync-repos.mjs`. */
export function hiddenRepoNames(): string[] {
  return Object.entries(REPO_OVERRIDES)
    .filter(([, override]) => override.hidden)
    .map(([name]) => name);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run test -- --include='**/repo-overrides.spec.ts'`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/content/repo-overrides.ts src/app/content/repo-overrides.spec.ts
git commit -m "Per-repository overrides, keyed by repository name"
```

---

### Task 4: The sync script

**Files:**

- Create: `scripts/sync-repos.mjs`
- Create: `public/content/repos.json` (written by the script, committed)
- Modify: `package.json` — `content:sync` runs both scripts
- Modify: `.gitignore` — confirm `public/content/` is not ignored

**Interfaces:**

- Consumes: `selectRepos` from `scripts/lib/repos.mjs`, `hiddenRepoNames()` from `src/app/content/repo-overrides.ts` (node 24 strips the types on import, as `sync-readmes.mjs` already relies on).
- Produces: `public/content/repos.json` — a JSON array of `SyncedRepo` objects.

- [ ] **Step 1: Write the script**

Create `scripts/sync-repos.mjs`:

```js
/**
 * Fetches Jamie's public repositories into public/content/repos.json.
 *
 * One unauthenticated request per deploy, far inside GitHub's 60-per-hour-per-IP limit, and no
 * token — which matters, because GitHub Pages is a static host and could not hold one. The file is
 * committed so the app reads it same-origin and an offline build still works
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §3).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { selectRepos } from './lib/repos.mjs';
import { hiddenRepoNames } from '../src/app/content/repo-overrides.ts';

const OWNER = 'jamie-io';
const SOURCE = `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=pushed&type=owner`;
const TARGET = new URL('../public/content/repos.json', import.meta.url);

try {
  const response = await fetch(SOURCE, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const selected = selectRepos(await response.json(), hiddenRepoNames());
  await mkdir(new URL('.', TARGET), { recursive: true });
  await writeFile(TARGET, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');

  for (const repo of selected) {
    console.log(`✓ ${repo.name.padEnd(22)} ${repo.language ?? '—'}`);
  }
  console.log(`\n${selected.length} repositories written to ${fileURLToPath(TARGET)}`);
} catch (error) {
  // A deploy must not break because GitHub is briefly unavailable: the committed copy stands in.
  console.warn(`! repository sync skipped: ${error.message}`);
  console.warn('  keeping the committed public/content/repos.json');
}
```

- [ ] **Step 2: Wire it into `content:sync`**

In `package.json`, change the `content:sync` script to run the repository sync first, because `sync-readmes.mjs` will read its output in Task 7:

```json
    "content:sync": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/sync-repos.mjs && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/sync-readmes.mjs",
```

- [ ] **Step 3: Run it for real**

Run: `npm run content:sync`
Expected: five repositories listed, `public/content/repos.json` written. Confirm with `cat public/content/repos.json` that `webkatalog_demoshop` is present and no entry is a fork.

- [ ] **Step 4: Prove the failure path is soft**

Make the endpoint overridable so the failure path can be exercised without editing the file. In
`scripts/sync-repos.mjs`, change the constant to:

```js
const SOURCE =
  process.env.GITHUB_REPOS_URL ??
  `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=pushed&type=owner`;
```

Then run:

```bash
GITHUB_REPOS_URL=https://api.github.com/users/jamie-io/does-not-exist \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/sync-repos.mjs
echo "exit: $?"
git diff --stat public/content/repos.json
```

Expected: prints `! repository sync skipped: HTTP 404 Not Found`, `exit: 0`, and `git diff` reports
no change — the committed file survived.

- [ ] **Step 5: Run the gate**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-repos.mjs package.json public/content/repos.json
git commit -m "Sync Jamie's public repositories into a committed repos.json"
```

---

### Task 5: Deterministic placement for unpinned projects

A repository without a pinned position needs somewhere to stand. Placement is a `world` concern — `content` may not import Three.js — so the scene owns it. Plan 2 moves this function into `environments/clearing.ts` and generalises it to `Environment.anchors()`.

**Files:**

- Create: `src/app/world/hub/placement.ts`
- Create: `src/app/world/hub/placement.spec.ts`
- Modify: `src/app/world/hub/hub.scene.ts`

**Interfaces:**

- Consumes: `LandmarkPlacement` from `@world/landmarks/base/landmark`.
- Produces: `ringPlacements(count: number): readonly LandmarkPlacement[]` — `count` evenly spaced spots on a ring around the spawn, each turned to face it.

- [ ] **Step 1: Write the failing tests**

Create `src/app/world/hub/placement.spec.ts`:

```ts
import { ringPlacements, RING_RADIUS } from './placement';

describe('ringPlacements', () => {
  it('returns exactly as many spots as asked for', () => {
    expect(ringPlacements(0).length).toBe(0);
    expect(ringPlacements(7).length).toBe(7);
  });

  it('puts every spot on the ring around the spawn', () => {
    for (const { position } of ringPlacements(5)) {
      expect(Math.hypot(position[0], position[2])).toBeCloseTo(RING_RADIUS, 5);
    }
  });

  it('turns every spot to face the spawn, so a visitor meets its front', () => {
    for (const { position, rotationY } of ringPlacements(5)) {
      const front = [Math.sin(rotationY), Math.cos(rotationY)];
      const towardsSpawn = [-position[0] / RING_RADIUS, -position[2] / RING_RADIUS];

      expect(front[0]).toBeCloseTo(towardsSpawn[0], 5);
      expect(front[1]).toBeCloseTo(towardsSpawn[1], 5);
    }
  });

  it('is deterministic, so a rebuild puts everything back where it was', () => {
    expect(ringPlacements(4)).toEqual(ringPlacements(4));
  });

  it('keeps spots apart, so two landmarks never overlap', () => {
    const spots = ringPlacements(6).map(({ position }) => position);

    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const distance = Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]);
        expect(distance).toBeGreaterThan(6);
      }
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run test -- --include='**/placement.spec.ts'`
Expected: FAIL — cannot resolve `./placement`.

- [ ] **Step 3: Write the implementation**

Create `src/app/world/hub/placement.ts`:

```ts
import type { LandmarkPlacement } from '../landmarks/base/landmark';

/** Metres from the spawn to an unpinned landmark. Far enough to walk to, near enough to see. */
export const RING_RADIUS = 30;

/** Where the ring starts, so the first landmark stands ahead of a player looking down −Z. */
const START_ANGLE = Math.PI;

/**
 * Evenly spaced spots on a ring around the spawn, each turned to face it.
 *
 * Deterministic on purpose: the world is rebuilt whenever the visitor returns to it, and a
 * landmark that moved between visits would read as a bug. Projects that must never move pin
 * `landmark.position` in `repo-overrides.ts` instead.
 */
export function ringPlacements(count: number): readonly LandmarkPlacement[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = START_ANGLE + (index / Math.max(count, 1)) * Math.PI * 2;
    const x = Math.sin(angle) * RING_RADIUS;
    const z = Math.cos(angle) * RING_RADIUS;

    // The front direction is (sin r, cos r); facing the spawn means pointing at the origin.
    return { position: [x, 0, z] as const, rotationY: angle + Math.PI };
  });
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npm run test -- --include='**/placement.spec.ts'`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use it in `HubScene`**

Replace the placement fallback added in Task 1 so unpinned projects take ring spots, consuming one spot per unpinned project in list order:

```ts
const ring = ringPlacements(
  options.projects.filter((project) => !project.landmark.position).length,
);
let ringIndex = 0;

this.landmarks = options.projects.map((project) => {
  const pinned = project.landmark.position;
  const placement: LandmarkPlacement = pinned
    ? { position: pinned, rotationY: project.landmark.rotationY ?? 0 }
    : ring[ringIndex++];

  return createLandmark({
    project,
    placement,
    ground: this.terrain,
    reducedMotion: options.reducedMotion,
    onEnter: options.onEnter,
    onDemo: options.onDemo,
    textures: options.textures,
  });
});
```

- [ ] **Step 6: Run the gate**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/world/hub
git commit -m "Ring placement for projects without pinned coordinates"
```

---

### Task 6: `GithubContentSource`

The merge, with every precedence rule from spec §4 made explicit and tested.

**Files:**

- Create: `src/app/content/synced-repo.ts`
- Create: `src/app/content/merge-repo.ts`
- Create: `src/app/content/merge-repo.spec.ts`
- Create: `src/app/content/github-content.source.ts`

**Interfaces:**

- Consumes: `REPO_OVERRIDES` from `@content/repo-overrides`, `Project` from `@content/project.model`, `HttpClient` from `@angular/common/http`.
- Produces: `SyncedRepo` interface (in `synced-repo.ts`), `mergeRepo(repo: SyncedRepo, override: RepoOverride | undefined): Project` (in `merge-repo.ts`), and `GithubContentSource implements ContentSource` with `projects(): Promise<readonly Project[]>`.

**Why two files:** `scripts/check-embeddable.mjs` and `scripts/sync-readmes.mjs` need the merged list, and node imports these `.ts` files directly with type stripping. `mergeRepo` must therefore stay free of Angular and RxJS imports, or the scripts would pull `@angular/common/http` into a plain node process. `merge-repo.ts` holds the pure function; `github-content.source.ts` holds the injectable class that calls it.

- [ ] **Step 1: Write the type the sync writes**

Create `src/app/content/synced-repo.ts`:

```ts
/** One repository as `scripts/sync-repos.mjs` wrote it into `public/content/repos.json`. */
export interface SyncedRepo {
  readonly name: string;
  readonly description: string | null;
  readonly language: string | null;
  readonly topics: readonly string[];
  readonly repoUrl: string;
  readonly homepage: string | null;
  readonly pushedAt: string;
  readonly stars: number;
  /**
   * Written back by `scripts/sync-readmes.mjs` once it knows whether the repository actually
   * has a README. `mergeRepo` cannot find this out on its own, and a project must not promise a
   * document that does not exist.
   */
  readonly hasReadme?: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/content/merge-repo.spec.ts`:

```ts
import { mergeRepo } from './merge-repo';
import type { SyncedRepo } from './synced-repo';

const repo = (over: Partial<SyncedRepo> = {}): SyncedRepo => ({
  name: 'webkatalog_demoshop',
  description: null,
  language: 'JavaScript',
  topics: [],
  repoUrl: 'https://github.com/jamie-io/webkatalog_demoshop',
  homepage: null,
  pushedAt: '2026-03-14T09:00:00Z',
  stars: 0,
  ...over,
});

describe('mergeRepo', () => {
  it('defaults the slug to the lowercased repository name', () => {
    expect(mergeRepo(repo({ name: 'Deslopify' }), undefined).slug).toBe('deslopify');
  });

  it('lets an override rename the slug, so existing links keep working', () => {
    expect(mergeRepo(repo({ name: 'poetzscher-homepage' }), { slug: 'poetzscher' }).slug).toBe(
      'poetzscher',
    );
  });

  it('prefers the German summary over the GitHub description', () => {
    const merged = mergeRepo(repo({ description: 'A demo shop' }), {
      summary: 'Ein Demoshop als Übungsprojekt für Katalog- und Warenkorblogik.',
    });

    expect(merged.summary).toBe('Ein Demoshop als Übungsprojekt für Katalog- und Warenkorblogik.');
  });

  it('falls back to the GitHub description when there is no override', () => {
    expect(mergeRepo(repo({ description: 'A demo shop' }), undefined).summary).toBe('A demo shop');
  });

  it('falls back to language and last push when GitHub has no description either', () => {
    expect(mergeRepo(repo(), undefined).summary).toBe(
      'JavaScript · zuletzt aktualisiert im März 2026',
    );
  });

  it('says only the date when the language is unknown too', () => {
    expect(mergeRepo(repo({ language: null }), undefined).summary).toBe(
      'Zuletzt aktualisiert im März 2026',
    );
  });

  it('builds tags from language and topics when none are given', () => {
    const merged = mergeRepo(repo({ topics: ['shop', 'demo'] }), undefined);

    expect(merged.tags).toEqual(['JavaScript', 'shop', 'demo']);
  });

  it('promises a bundled README under the resolved slug when one was synced', () => {
    const merged = mergeRepo(repo({ name: 'poetzscher-homepage', hasReadme: true }), {
      slug: 'poetzscher',
    });

    expect(merged.readme).toEqual({ kind: 'bundled', path: 'content/readme/poetzscher.md' });
  });

  it('promises no README at all when the repository has none', () => {
    expect(mergeRepo(repo({ hasReadme: false }), undefined).readme).toBeUndefined();
    expect(mergeRepo(repo(), undefined).readme).toBeUndefined();
  });

  it('leaves the landmark position absent so the scene can place it', () => {
    expect(mergeRepo(repo(), undefined).landmark.position).toBeUndefined();
    expect(mergeRepo(repo(), undefined).landmark.kind).toBe('portal');
  });

  it('keeps a pinned landmark exactly as the override wrote it', () => {
    const merged = mergeRepo(repo(), {
      landmark: { kind: 'screen', position: [26, 0, -14], rotationY: -0.7 },
    });

    expect(merged.landmark).toEqual({ kind: 'screen', position: [26, 0, -14], rotationY: -0.7 });
  });

  it('has no demo when neither the override nor a homepage offers one', () => {
    expect(mergeRepo(repo(), undefined).demo).toEqual({ kind: 'none' });
  });

  it('takes the demo the override declares', () => {
    const demo = {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/novaverta/',
      embeddable: true,
      screenshot: 'assets/screens/novaverta.webp',
    } as const;

    expect(mergeRepo(repo(), { demo }).demo).toEqual(demo);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npm run test -- --include='**/merge-repo.spec.ts'`
Expected: FAIL — cannot resolve `./merge-repo`.

- [ ] **Step 4: Write the pure merge**

Create `src/app/content/merge-repo.ts`. It must import nothing from Angular or RxJS, because the
node scripts import this file directly:

```ts
import type { Project, ProjectLandmark } from './project.model';
import type { RepoOverride } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

/** Used by any repository the overrides file does not colour in. */
const DEFAULT_THEME = { primary: '#3a4a5a', accent: '#e9edf1' } as const;

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/**
 * The last resort for a repository with no German summary and no GitHub description: plain
 * metadata rather than invented prose or a placeholder that reads as a gap.
 */
function factualSummary(repo: SyncedRepo): string {
  const pushed = new Date(repo.pushedAt);
  const when = `${MONTHS[pushed.getMonth()]} ${pushed.getFullYear()}`;

  return repo.language
    ? `${repo.language} · zuletzt aktualisiert im ${when}`
    : `Zuletzt aktualisiert im ${when}`;
}

/** One synced repository plus its override, resolved into the `Project` the world consumes. */
export function mergeRepo(repo: SyncedRepo, override: RepoOverride | undefined): Project {
  const slug = override?.slug ?? repo.name.toLowerCase();
  const landmark: ProjectLandmark = {
    kind: override?.landmark?.kind ?? 'portal',
    ...(override?.landmark?.position ? { position: override.landmark.position } : {}),
    ...(override?.landmark?.rotationY !== undefined
      ? { rotationY: override.landmark.rotationY }
      : {}),
    ...(override?.landmark?.model ? { model: override.landmark.model } : {}),
  };

  return {
    slug,
    title: override?.title ?? repo.name,
    summary: override?.summary ?? repo.description ?? factualSummary(repo),
    tags: override?.tags ?? [repo.language, ...repo.topics].filter((tag): tag is string => !!tag),
    repoUrl: repo.repoUrl,
    ...(override?.year !== undefined ? { year: override.year } : {}),
    ...(repo.hasReadme
      ? { readme: { kind: 'bundled' as const, path: `content/readme/${slug}.md` } }
      : {}),
    demo: override?.demo ?? { kind: 'none' },
    landmark,
    theme: override?.theme ?? DEFAULT_THEME,
  };
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npm run test -- --include='**/merge-repo.spec.ts'`
Expected: PASS, 13 tests.

- [ ] **Step 6: Write the injectable source**

Create `src/app/content/github-content.source.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ContentSource } from './content-source';
import { mergeRepo } from './merge-repo';
import type { Project } from './project.model';
import { REPO_OVERRIDES } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

/**
 * Written by `npm run content:sync`. The URL is relative on purpose: it resolves against
 * `<base href>`, so moving from GitHub Pages to our own server stays a build flag.
 */
const REPOS_URL = 'content/repos.json';

/** The portfolio, built from the synced repository list and the per-repository overrides. */
export class GithubContentSource implements ContentSource {
  private readonly http = inject(HttpClient);

  async projects(): Promise<readonly Project[]> {
    const repos = await firstValueFrom(this.http.get<readonly SyncedRepo[]>(REPOS_URL));

    return repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));
  }
}
```

- [ ] **Step 7: Run the gate**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/content/merge-repo.ts src/app/content/merge-repo.spec.ts src/app/content/github-content.source.ts src/app/content/synced-repo.ts
git commit -m "Merge synced repositories with overrides into projects"
```

---

### Task 7: Switch the app over and retire `projects.ts`

The last task is the only one that changes what a visitor sees: `webkatalog_demoshop` appears in the world, placed on the ring.

**Files:**

- Modify: `src/app/content/content-source.ts` — factory provides `GithubContentSource`
- Modify: `scripts/sync-readmes.mjs` — read `repos.json` + overrides instead of `PROJECTS`
- Modify: `scripts/check-embeddable.mjs` — same
- Delete: `src/app/content/projects.ts`, `src/app/content/projects.spec.ts`
- Modify: `src/app/content/static-content.source.ts` — keep, fed by an explicit array for tests
- Create: `src/app/content/merged-projects.spec.ts` — the schema test, moved onto the merged result

**Interfaces:**

- Consumes: everything from Tasks 1–6.
- Produces: `CONTENT_SOURCE` resolving to `GithubContentSource` in the running app. `StaticContentSource` is deleted: after the switch its only consumer was the token factory, and a second unused `ContentSource` implementation would rot.

- [ ] **Step 1: Point the token at the new source**

In `src/app/content/content-source.ts`:

```ts
export const CONTENT_SOURCE = new InjectionToken<ContentSource>('CONTENT_SOURCE', {
  providedIn: 'root',
  factory: () => new GithubContentSource(),
});
```

`GithubContentSource` uses `inject(HttpClient)` in a field initialiser, so constructing it inside the factory runs in an injection context. Import it and drop the `StaticContentSource` import.

- [ ] **Step 2: Delete `StaticContentSource`**

```bash
git rm src/app/content/static-content.source.ts
```

Verified before writing this plan: `grep -rn "StaticContentSource" src/ scripts/` returns only its
own file and the token factory changed in Step 1. Nothing else references it.

- [ ] **Step 3: Move the schema test onto the merged result**

Create `src/app/content/merged-projects.spec.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { mergeRepo } from './github-content.source';
import { REPO_OVERRIDES } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

const PUBLIC_DIR = 'public/';
const repos: readonly SyncedRepo[] = JSON.parse(
  readFileSync(`${PUBLIC_DIR}content/repos.json`, 'utf8'),
);
const projects = repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));

describe('the merged portfolio', () => {
  it('contains every synced repository', () => {
    expect(projects.length).toBe(repos.length);
    expect(projects.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every project a unique, url-safe slug', () => {
    const slugs = projects.map((project) => project.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
    }
  });

  it('describes every project with a title, summary and at least one tag', () => {
    for (const project of projects) {
      expect(project.title.length).toBeGreaterThan(0);
      expect(project.summary.length).toBeGreaterThan(10);
      expect(project.tags.length).toBeGreaterThan(0);
    }
  });

  it('points every project at a real repository url', () => {
    for (const project of projects) {
      expect(project.repoUrl).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it('ships the README every bundled project promises', () => {
    for (const project of projects) {
      if (project.readme?.kind === 'bundled') {
        expect(existsSync(PUBLIC_DIR + project.readme.path), project.slug).toBe(true);
      }
    }
  });

  it('ships the screenshot every iframe demo promises', () => {
    for (const project of projects) {
      if (project.demo.kind === 'iframe') {
        expect(existsSync(PUBLIC_DIR + project.demo.screenshot), project.slug).toBe(true);
      }
    }
  });

  it('keeps every override pointed at a repository that still exists', () => {
    const names = new Set(repos.map((repo) => repo.name));

    for (const name of Object.keys(REPO_OVERRIDES)) {
      if (!REPO_OVERRIDES[name].hidden) {
        expect(names.has(name), `${name} is overridden but not synced`).toBe(true);
      }
    }
  });
});
```

Delete `src/app/content/projects.spec.ts` and `src/app/content/projects.ts`.

- [ ] **Step 4: Rewrite `sync-readmes.mjs` around the synced list**

It loses its `PROJECTS` import, gains the `hasReadme` write-back, and stops being fatal for
repositories nobody curated. Replace the import block and the loop:

```js
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { REPO_OVERRIDES } from '../src/app/content/repo-overrides.ts';

const OUT_DIR = new URL('../public/content/readme/', import.meta.url);
const REPOS = new URL('../public/content/repos.json', import.meta.url);

// ... ownerRepo() and absolutise() stay exactly as they are ...

let failures = 0;
await mkdir(OUT_DIR, { recursive: true });

const repos = JSON.parse(await readFile(REPOS, 'utf8'));

for (const repo of repos) {
  const override = REPO_OVERRIDES[repo.name];
  const slug = override?.slug ?? repo.name.toLowerCase();
  const { owner, repo: repoName } = ownerRepo(repo.repoUrl);
  const ref = 'HEAD';
  const source = `https://raw.githubusercontent.com/${owner}/${repoName}/${ref}/README.md`;

  try {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = absolutise(await response.text(), owner, repoName, ref);
    await writeFile(new URL(`${slug}.md`, OUT_DIR), markdown, 'utf8');
    repo.hasReadme = true;
    console.log(`✓ ${slug.padEnd(22)} ${markdown.length} bytes  ← ${owner}/${repoName}`);
  } catch (error) {
    repo.hasReadme = false;
    if (override) {
      // A curated repository promised a README; a missing one is a content bug, not weather.
      failures++;
      console.error(`✗ ${slug.padEnd(22)} ${source}\n  ${error.message}`);
    } else {
      console.warn(`! ${slug.padEnd(22)} no README; the panel omits the section`);
    }
  }
}

// The list records what was actually synced, so `mergeRepo` never promises a missing document.
await writeFile(REPOS, `${JSON.stringify(repos, null, 2)}\n`, 'utf8');

if (failures > 0) {
  console.error(`\n${failures} README(s) could not be synced.`);
  process.exit(1);
}
console.log(`\nREADMEs written to ${fileURLToPath(OUT_DIR)}`);
```

- [ ] **Step 5: Point `check-embeddable.mjs` at the merged list**

Replace its first two statements:

```js
import { readFile } from 'node:fs/promises';
import { mergeRepo } from '../src/app/content/merge-repo.ts';
import { REPO_OVERRIDES } from '../src/app/content/repo-overrides.ts';
import { mismatches } from './lib/embeddable.mjs';

const repos = JSON.parse(
  await readFile(new URL('../public/content/repos.json', import.meta.url), 'utf8'),
);
const projects = repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));

const failures = await mismatches(projects);
```

and change the two messages that name `projects.ts` to name "the synced portfolio" instead.

- [ ] **Step 6: Regenerate content and run the whole gate**

Run:

```bash
npm run content:sync && npm run content:check && npm run verify
```

Expected: the sync lists five repositories, `webkatalog_demoshop` warns about a missing README if it has none, `content:check` passes, `verify` exits 0.

- [ ] **Step 7: Fix the one E2E assertion that counts projects**

`tests/simple-view.spec.ts:8` reads `await expect(page.locator('article')).toHaveCount(3);` and
must now match the synced list. Replace the literal with a count read from the committed file, so
the test does not need editing again the next time a repository appears:

```ts
import { readFileSync } from 'node:fs';

const SYNCED_COUNT = JSON.parse(readFileSync('public/content/repos.json', 'utf8')).length as number;

// ...
await expect(page.locator('article')).toHaveCount(SYNCED_COUNT);
```

- [ ] **Step 8: Run the E2E suite**

Run: `npx playwright test`
Expected: 28 passed, 3 skipped — the same baseline as before.

- [ ] **Step 9: Walk the world once by hand**

Run `npm run build && node scripts/serve-dist.mjs`, open `http://localhost:4173/`, and confirm: the three curated landmarks stand where they always did, `webkatalog_demoshop` stands on the ring, its panel opens with a factual summary and a source link, and `/projects` lists all five.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Drive the portfolio from synced repositories, retire projects.ts"
```

---

## Follow-up: Plan 2

Once this plan is merged, `docs/superpowers/specs/2026-09-10-repo-worlds-design.md` §5–§7 get their own plan: the `Environment` abstraction with `anchors()` (which absorbs `ringPlacements`), `clearing`/`jungle`/`showroom`/`plaza`, `ProjectScene` with its return portal, the `SceneDirector` and the `p/:slug` / `p/:slug/info` routes, the staged transition, the `aria-live` announcement, and the extended memory E2E test. It is written after this one lands, so it argues against real code.
