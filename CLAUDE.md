# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**There is no code yet.** The repository currently holds three planning documents and is not a git
repository. Before writing anything, read them — they are the source of truth and were agreed with
the user, so do not silently re-decide anything they fix:

- `README.md` — product concept, German, visitor-facing.
- `PLAN.md` — product scope: first release (curated personal portfolio) vs. later phase
  (GitHub-username-driven generated world). Success criteria live at the bottom.
- `IMPLEMENTATION_PLAN.md` — the architecture and the ordered build sequence (§1–§11 plus a
  milestone table M0–M6). Section numbers referenced below point into this file.

The next concrete step is the M0 bootstrap listed under "First implementation session" at the end of
`IMPLEMENTATION_PLAN.md`:

```sh
npx @angular/cli@22 new gitplore --directory . --style=scss --ssr=false --skip-git=false
```

Scaffold with `npx @angular/cli@22`, **not** the globally installed CLI (which is 21.2.2).

## Fixed decisions

| Topic | Decision |
|---|---|
| Framework | Angular 22 — zoneless, signals, OnPush, vitest, Vite/esbuild application builder |
| 3D | Plain Three.js wrapped by a thin Angular service layer. No angular-three, no Babylon, no `three-stdlib` |
| Physics | None. Kinematic capsule + analytic terrain height + AABB/cylinder colliders |
| Renderer | `WebGLRenderer` only, constructed solely in `renderer.factory.ts` |
| Demo embedding | Angular overlay panel with an `<iframe>`; in-world screens show a static screenshot texture. No CSS3D iframes |
| Assets | Procedural low-poly terrain/props in code; glTF only for hero landmarks |
| Hosting | GitHub Pages first, own server (Docker + nginx) later — the switch must be config-only (`--base-href`) |
| Language | README in German; code, comments and commits in English |

Pinned versions are tabled at the top of `IMPLEMENTATION_PLAN.md`; keep them in sync when bumping.

## Commands (once M0 has run)

`package.json` scripts are specified in §8/§9 of the implementation plan:

```sh
npm run verify          # lint + typecheck + ng test + ng build + budget check — the gate before claiming done
ng test                 # vitest via the Angular builder
ng test --include='**/world.store.spec.ts'   # single unit test file
npm run e2e             # Playwright; Chromium needs --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
npx playwright test tests/hub.spec.ts -g 'deep link'   # single e2e test
npm run content:sync    # fetch READMEs into public/content/readme/<slug>.md (committed; never a prebuild hook)
npm run content:check   # HEAD-requests every demo URL, fails if `embeddable: true` is a lie
npm run assets:optimize # @gltf-transform: meshopt compression + webp textures + manifest.json
```

## Architecture

Four layers inside **one** Angular application (not a multi-project workspace), separated by TS path
aliases and enforced by ESLint `no-restricted-imports` boundary rules. Respecting these boundaries
is the main thing to get right when adding files:

- `@engine/*` — Three.js only. Knows nothing about projects or Angular UI. Imports nothing from the
  other three layers.
- `@world/*` — scene content (hub, terrain, reusable environments, landmarks) built on `engine`. May
  import `engine` and `content` models.
- `@content/*` — `Project` data model, content sources, README service. No Three.js.
- `@ui/*` — components and signal stores. May import `content` and stores, **never Three directly**.

Key consequences of the design:

- **The hub scene is never destroyed.** A project destination is an overlay panel opened by a child
  route (`/p/:slug` under `''`); returning clears `activeProject` and re-spawns the player at
  `landmark.spawn`. The router is the source of truth for *which* destination is open; `WorldStore`
  owns everything else.
- **Mobile/no-WebGL2 is a redirect, not a degraded 3D path.** `simpleViewGuard` is a `CanActivateFn`
  returning a `RedirectCommand` to `/projects[/:slug]` — it must not be `canMatch`, or a
  non-matching `''` falls through to `**` and loops. This keeps the hub bundle off phones entirely.
- **Signal writes must stay rare.** The render loop runs via `renderer.setAnimationLoop` outside
  Angular; systems like `InteractionSystem` write to the store *only on change*, never per frame.
- **Disposal is explicit.** `disposeObject3D` walks geometries/materials/textures, `AssetService`
  refcounts by URL, `EngineService.setScene()` disposes the previous scene. The E2E suite asserts
  `renderer.info.memory` is stable across enter/exit cycles.
- **Reusable environments** (`world/environments/*`) exist so the later `features/explorer` phase can
  generate worlds from GitHub repos without bespoke geometry. Custom interactions and tailored
  surroundings belong only to curated projects.

## Working conventions

- The full folder skeleton is in §1 — follow it rather than inventing new locations.
- New projects appear automatically once `npm run content:sync` picks up a public repository;
  curating one — title, summary, tags, landmark, demo — means adding an entry to
  `content/repo-overrides.ts`, keyed by repository name. The `Project` union in §4 (`readme`,
  `demo`, `landmark`) is validated by a schema unit test (`content/merged-projects.spec.ts`: unique
  slugs, screenshots exist, valid demo union) against the merged result.
- Markdown is rendered through `marked` + `dompurify` in `MarkdownComponent`. Do not add
  `ngx-markdown`.
- Accessibility is part of the definition of done: `prefers-reduced-motion` disables the camera
  dolly, head-bob and sky animation; overlays are focus-trapped `aria-modal` dialogs; the world is
  keyboard-navigable; `/projects` is the screen-reader path.
- Work milestone by milestone (M0–M6) and verify with the column in the §10 table before moving on.

## Code style

Write functional, maintainable, performant, and accessible code following Angular and
TypeScript best practices.

### TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

### Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

### Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

#### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

### State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

### Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

### Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

## Angular documentation

Angular publishes machine-readable docs; consult them instead of relying on memory whenever an
Angular API is in question, since the code style rules above target v22 and much online material
still describes older versions.

- <https://angular.dev/llms.txt> — link index of the whole documentation (~7 KB, 136 entries,
  grouped: Components, Templates, Directives, Signals, DI, RxJS, Loading Data, Forms,
  Accessibility, Routing, SSR, Testing, Animations, APIs). Fetch this first to find the right page.
- <https://angular.dev/llms-full.txt> — the full documentation text (~100 KB). Only when the index
  page is not enough.

Pages that matter most here, given the fixed decisions:

| Topic | Page |
|---|---|
| Zoneless change detection | <https://angular.dev/guide/zoneless> |
| Signals | <https://angular.dev/guide/signals> |
| Routing (guards, lazy routes) | <https://angular.dev/guide/routing> |
| Forms / Signal Forms | <https://angular.dev/guide/forms> |
| Accessibility | <https://angular.dev/best-practices/a11y> |
| Sanitization and security | <https://angular.dev/best-practices/security> |
| Image optimization (`NgOptimizedImage`) | <https://angular.dev/guide/image-optimization> |
| Testing | <https://angular.dev/guide/testing> |
| Error encyclopedia | <https://angular.dev/errors> |
| API / CLI reference | <https://angular.dev/api> · <https://angular.dev/cli> |

