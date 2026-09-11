# Gitplore — Architecture and build plan (Angular 22 + Three.js)

## Context

`PLAN.md` and `README.md` describe the product: a personal portfolio rendered as a small explorable
3D world. Visitors walk around, find one landmark per project, step through a portal, and get a
description, the README, the source link, and either an embedded existing web app or a custom
interactive demo. A menu allows direct travel; phones get a simple list view. A later phase
generates a world from any GitHub username. There is no code yet; this plan turns the concept into
an architecture and an ordered build sequence.

Decisions taken with Jamie in this session (fixed, not re-opened below):

| Topic | Decision |
|---|---|
| Framework | Angular 22 (zoneless, signals, OnPush default, vitest, Vite/esbuild builder) |
| 3D | Plain Three.js owned by a thin Angular service layer; no angular-three, no Babylon |
| First existing app | Separately deployed web app with a public URL, shown in-world + "open in new tab" |
| Assets | Procedural low-poly terrain and props in code; glTF for hero landmarks |
| Hosting | GitHub Pages first, later own server (Docker + nginx); switch must be config-only |
| Language | README German; code, comments, commits English |

Pinned package versions (checked on npm today):

| Package | Version |
|---|---|
| @angular/core, @angular/cli, @angular/build | 22.1.x |
| three / @types/three | 0.186.0 / 0.185.4 |
| marked / dompurify | 18.x / 3.x |
| @gltf-transform/cli | 4.5.0 |
| angular-eslint | 22.5.0 |
| @playwright/test | 1.63.0 |
| vitest | 5.0.0 (via the Angular builder) |

Local toolchain: Node 24.3, npm 11.4, Angular CLI 21.2.2 installed globally. Scaffold with
`npx @angular/cli@22 new`, not the global CLI.

---

## 1. Workspace layout

**One Angular CLI application** with four internal layers enforced by TS path aliases and ESLint
import-boundary rules. Not a multi-project workspace: one build, one deploy artifact, identical
tree-shaking, no ng-packagr. The later GitHub-explorer phase is just `features/explorer` reusing
`engine` and `world/environments`. Extract `engine` into a library only if a second app appears.

```
gitplore/
  angular.json  package.json  tsconfig.json (paths: @engine/* @world/* @content/* @ui/*)
  eslint.config.js  .prettierrc  playwright.config.ts  Dockerfile  nginx.conf (M6)
  .github/workflows/deploy.yml
  public/
    assets/models/  assets/textures/  assets/screens/  assets/manifest.json
    content/readme/<slug>.md          # synced from GitHub, committed
    404.html                          # SPA redirect for GitHub Pages
  scripts/                            # node ESM
    optimize-assets.mjs  sync-repos.mjs  sync-readmes.mjs  check-embeddable.mjs
    lib/portfolio.mjs                 # the one "read repos.json and merge it" for scripts
  src/app/
    app.config.ts  app.routes.ts  app.ts
    engine/            # Three.js only; knows nothing about projects or Angular UI
      engine.service.ts  input.service.ts  capability.service.ts  asset.service.ts
      renderer.factory.ts  dispose.ts  world-object.ts
      player/   player-controller.ts  camera-rig.ts  collision.ts
      interaction/  interactable.ts  interaction.system.ts
    world/             # scene content built on engine
      hub/  hub.scene.ts                        # the start world's landmarks-per-project layer
      environments/  environment.ts  create-environment.ts   # one dynamic `import()` per id (§5)
        clearing.ts  showroom.ts  jungle.ts  plaza.ts         # + ground.ts sky.ts terrain.ts monument.ts placement.ts
      landmarks/  base/portal.landmark.ts  base/screen.landmark.ts  base/landmark.ts  create-landmark.ts
      project/  project.scene.ts  create-project-scene.ts  return.landmark.ts   # a repo's own world
      projects/  <slug>/<slug>.scene.ts             # bespoke worlds; deslopify is the only one so far
    content/           # data + adapters, no Three
      project.model.ts  synced-repo.ts  repo-overrides.ts  merge-repo.ts
      content-source.ts  github-content.source.ts
      readme.service.ts  markdown/markdown.component.ts
    ui/                # Angular components + signal stores
      store/  world.store.ts  settings.store.ts
      hud/  project-panel/  project-menu/  loading-screen/  settings-dialog/  demo-frame/
    features/
      world/  world.page.ts  scene-director.ts    # canvas host + HUD + child outlet; the router↔scene seam (§3)
      projects/projects-list.page.ts  project-detail.page.ts   # mobile / fallback
      explorer/                                # later phase
    shared/  device.service.ts  a11y/focus-trap.directive.ts
```

Boundary rules (`no-restricted-imports` per folder): `engine` imports nothing from
`world | content | ui`; `world` may import `engine` and `content` models; `ui` may import `content`
and stores but never Three directly.

## 2. Engine layer

| Piece | Design |
|---|---|
| Renderer | `WebGLRenderer` for v1. WebGPU is still missing on many corporate Chrome/Firefox and older Safari setups, and `WebGPURenderer`'s WebGL2 fallback pulls the TSL node system (roughly 350 kB gz more) with slower shader compiles. The scene is low-poly, so WebGL2 is not the bottleneck. `renderer.factory.ts` is the only place a renderer is constructed, so the swap stays local. |
| `EngineService` (root) | Owns renderer, clock, camera, active `WorldScene`, `ResizeObserver`. API: `attach(canvas)`, `setScene(scene)`, `addTickable(t)` / `removeTickable(t)`. Loop via `renderer.setAnimationLoop(tick)` inside `ngZone.runOutsideAngular` (app is zoneless, this is belt and braces). `tick` clamps `dt` to 50 ms, runs tickables, renders. Pauses on `visibilitychange`, when `store.paused()` is true, or when the canvas is off-screen (IntersectionObserver). A frame-time sampler feeds adaptive quality. |
| `InputService` | Keyboard as a `Set<code>` plus an action map: WASD/arrows move, left/right arrows turn (keyboard-only fallback), `E`/`Enter` interact, `Shift` run, `M` menu, `Esc` leaves world mode. Pointer: accumulates `movementX/Y` while pointer-locked, cleared each tick. `requestLock()` on canvas click; `locked` signal. `inputMode` signal `'world' | 'ui' | 'demo'`; in `'ui'` world input is ignored and pointer lock released. |
| `PlayerController` (tickable) | Kinematic capsule: position, yaw/pitch, velocity, gravity. Ground height comes analytically from `terrain.heightAt(x, z)` for procedural terrain, plus a downward `Raycaster` only against a small `walkables` group for glTF platforms. Horizontal collision is circle vs. a list of `Collider` (AABB or cylinder) registered by landmarks. **No physics engine**: there are no dynamics, Rapier/cannon add 1 to 2 MB of wasm and async init, and a `CollisionWorld` interface keeps the door open. `camera-rig.ts` is first-person by default; third-person is a rig swap. |
| Interaction | `Interactable { id; position; radius; prompt; onInteract() }`. `InteractionSystem` picks each tick the nearest interactable within radius whose facing dot product exceeds 0.4 and writes `store.nearby` **only on change**, so signal writes are rare, not per frame. Mouse picking via `Raycaster` on click when not locked. `PortalLandmark.onInteract()` navigates to `/p/:slug`. |
| `WorldObject` / `Landmark` | `interface WorldObject { id; init(ctx: WorldContext): Promise<void> | void; update(dt, ctx): void; dispose(): void }`. `abstract class Landmark implements WorldObject { project: Project; group: Group; interactables: Interactable[]; colliders: Collider[]; spawn: Vector3; enter?(); exit?() }`. `WorldContext = { scene, camera, assets, player, store, quality }`. `HubScene` is itself a `WorldObject` owning terrain, sky, props and the landmark list. |
| `CapabilityService` | At startup: WebGL2 present, `WEBGL_debug_renderer_info` string (SwiftShader / Intel / Apple heuristics), `hardwareConcurrency`, `devicePixelRatio`, `prefers-reduced-motion`, `pointer: coarse`. Produces `QualityTier = 'low' | 'medium' | 'high'` mapped to `{ pixelRatioCap, shadows, antialias, fogFar, propDensity }`. Adaptive: if the rolling 3 s frame average exceeds 24 ms, step down one tier once. User override lives in `SettingsStore` (localStorage). |
| Disposal | `dispose.ts` exports `disposeObject3D(root)` which traverses and disposes geometries, materials and every texture map. `AssetService` caches by URL with refcounts and disposes at zero. `EngineService.setScene()` disposes the previous scene and calls `renderer.renderLists.dispose()`. Dev-only `renderer.info` overlay in the HUD. |

## 3. Routing and scene model

> **Reversed by `repo-design-notes/specs/2026-09-10-repo-worlds-design.md` §2 (Task 11 recorded
> it here):** a project destination is **not** an overlay over a paused, permanent hub any more. A
> destination is a world of its own. Walking through a portal disposes the start world (the
> "Lichtung") and builds that repository's own themed world in its place; walking back disposes
> that world and rebuilds the start world. `SceneDirector` (`features/world/scene-director.ts`)
> owns the swap and guards it with a sequence token, so a navigation that lands while a build is
> still in flight throws that build's result away instead of swapping in a world nobody asked for
> any more. The extended `tests/memory.spec.ts` is what keeps this safe: resources must stay flat
> across five world changes, not just across opening and closing an overlay.

```ts
export const routes: Routes = [
  {
    path: '', loadComponent: () => import('./features/world/world.page'), canActivate: [simpleViewGuard],
    children: [
      // Componentless: it exists only to carry `:slug` down to the panel and to the
      // `SceneDirector`. The world itself is not a routed component — `WorldPage` never changes.
      { path: 'p/:slug', children: [
        { path: 'info', loadComponent: () => import('./ui/project-panel/project-panel') },
      ] },
    ],
  },
  { path: 'projects', loadComponent: () => import('./features/projects/projects-list.page') },
  { path: 'projects/:slug', loadComponent: () => import('./features/projects/project-detail.page') },
  { path: '**', redirectTo: '' },
];
```

- `simpleViewGuard` is a `CanActivateFn` that returns `true` on desktop, otherwise a
  `RedirectCommand` to `/projects` or `/projects/:slug`. It must be `canActivate` with a redirect,
  not `canMatch`, because a non-matching `''` would fall into `**` and loop. It needs no change for
  the child `info` route: its `PROJECT_DEEP_LINK` regex captures the slug out of `/p/:slug/info`
  exactly as it does out of `/p/:slug`.
- Deep link `/p/:slug`: `WorldPage` mounts and `SceneDirector` builds that repository's own world
  directly — the start world is never built first. The player is placed at the world's arrival
  point (the return portal's spawn), which is also where a visitor who walked in through the portal
  ends up.
- Deep link `/p/:slug/info`: the same, plus the description panel opens on top of that world.
- Entering: `PortalLandmark.onInteract()` runs a short camera dolly (skipped under reduced motion)
  then `router.navigate(['/p', slug])`. `WorldPage`'s route-driven effect, keyed on the slug alone,
  calls `SceneDirector.show(slug)`, which disposes the outgoing world and builds the incoming one.
- Returning: the world's own return portal, `Esc`, or browser back navigates to `''`;
  `SceneDirector` disposes the repo world, rebuilds the start world, and places the player at the
  portal's exit point (`landmark.spawn`, facing away from it) — the same placement the old,
  never-destroyed hub gave for free, now recomputed on rebuild.
- The router is still the source of truth for "which world is open" (the URL is the deep link);
  `WorldStore` owns everything else. No resolvers, since they would delay the panel.
- Unknown slug: `SceneDirector` builds nothing new — whatever world is already standing (start world
  or a repo world) stays, and the panel explains itself on top of it. The one case that needs a
  fallback is a cold boot straight into an unknown slug, where nothing is standing yet: there it
  falls through and builds the start world, exactly as a `null` slug would, so the panel always has
  a world behind it.

## 4. Content model

```ts
export interface Project {
  slug: string; title: string; summary: string; tags: string[]; repoUrl: string; year?: number;
  readme: { kind: 'bundled'; path: string } | { kind: 'github'; owner: string; repo: string; ref?: string };
  demo: { kind: 'iframe'; url: string; embeddable: boolean; screenshot: string }
      | { kind: 'custom'; mode: 'in-world' | 'panel'; panelComponent?: () => Promise<Type<unknown>> }
      | { kind: 'none' };
  landmark: { kind: 'portal' | 'screen' | string; position: [number, number, number]; rotationY: number; model?: string };
  theme: { primary: string; accent: string };
}
```

- The portfolio is synced, not hand-written (`repo-design-notes/specs/2026-09-10-repo-worlds-design.md`
  §3–§4). `scripts/sync-repos.mjs` writes the committed `public/content/repos.json`;
  `content/repo-overrides.ts` holds everything GitHub cannot express (German copy, pinned
  landmarks, bespoke demos), keyed by repository name. `merge-repo.ts` resolves one `SyncedRepo`
  plus its override into a `Project`, and `mergePortfolio` does the whole list, dropping anything
  marked `hidden`. `ContentSource { projects(): Promise<Project[]> }` has one implementation,
  `GithubContentSource`, which fetches `repos.json` same-origin and calls `mergePortfolio`;
  `scripts/lib/portfolio.mjs` is its twin over the committed tree. Unpinned projects are placed by
  `world/hub/placement.ts` on a ring around the spawn, skipping spots that would collide with a
  pinned landmark.
- **README bundled at build time.** `scripts/sync-readmes.mjs` fetches
  `raw.githubusercontent.com/<owner>/<repo>/HEAD/README.md` into `public/content/readme/<slug>.md`,
  rewriting relative image links to absolute raw URLs. The files are committed; the CI workflow
  runs the sync before build so they stay fresh, and a local run is an explicit `npm run
  content:sync`, never a `prebuild` hook (offline builds must work). Runtime fetch is same-origin:
  no CORS, no rate limits, no flicker. `ReadmeService.readme(slug)` is an `httpResource.text()`.
  The `github` variant of the union is what the explorer phase uses at runtime with a cache.
- Rendering: `marked` 18 + `dompurify` 3 in a small `MarkdownComponent` (`[innerHTML]` after
  DOMPurify, then `bypassSecurityTrustHtml`). Skip `ngx-markdown`: one consumer, and it drags in
  Prism/emoji/katex peers nobody needs. Syntax highlighting deferred (lazy `shiki` if wanted).

## 5. Demo embedding

**Angular overlay panel with an iframe; the in-world screen shows a static screenshot texture.**
CSS3D iframes conflict with pointer lock (lock must be released to click anyway), render blurry
under 3D transforms, hit-test poorly, cost a compositor layer each, and are irrelevant on mobile.
The panel also gives README, source link and "open in new tab" a natural home.

- `ScreenLandmark`: monitor/billboard mesh with `assets/screens/<slug>.webp` as emissive map;
  interacting opens the panel. `DemoFrameComponent` renders
  `<iframe [src]="safeUrl" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy" referrerpolicy="no-referrer">`
  only when `embeddable` is true, always with an "Open in new tab" button.
- X-Frame-Options / `frame-ancestors` cannot be detected from JS. `scripts/check-embeddable.mjs`
  sends HEAD requests to every `demo.url` in CI, parses those headers, and fails the build if
  `embeddable: true` contradicts reality. Runtime fallback: an 8 s load timeout shows the
  screenshot card with the external link.
- Custom demos, `mode: 'in-world'`: a `Landmark` subclass implementing `enter()` / `exit()`.
  `enter()` sets `inputMode = 'demo'`, may take over the camera, and receives `update(dt)` like any
  landmark. The panel shows "Try it in the world", which fast-travels and calls `enter()`.
  `mode: 'panel'`: `panelComponent` is loaded lazily inside the panel; if it needs a canvas it gets
  its own small renderer from `renderer.factory.ts`.

## 6. UI and HUD layer

`WorldStore` (root, signals only):

| Signal | Type |
|---|---|
| `phase` | `'booting' | 'loading' | 'ready' | 'error'` |
| `loadProgress` | `{ loaded: number; total: number; label: string }` |
| `area` | `string`, named region from `HubScene` triggers |
| `nearby` | `Interactable | null` |
| `activeProject` | `Project | null`, computed from the route slug |
| `inputMode`, `pointerLocked`, `paused` | see engine |
| `menuOpen`, `settingsOpen` | booleans |

Components: `HudComponent` (crosshair, prompt "Press E: <label>", area name, dev stats),
`ProjectMenuComponent` (`M` or button; list entries either navigate or fast-travel via
`player.teleport(landmark.spawn)`), `LoadingScreenComponent` (progress from `LoadingManager`, a
"Click to start" gate that also requests pointer lock and unlocks audio), `SettingsDialogComponent`
(quality tier, mouse sensitivity, sound, reduced-motion override) backed by `SettingsStore`.

Accessibility: `prefers-reduced-motion` disables camera dolly, head-bob and sky animation; every
overlay is a dialog region with `FocusTrapDirective` and `aria-modal`, focus returns to the canvas
host on close; the world is fully keyboard-navigable (arrows turn, WASD move); the `/projects`
view is the screen-reader path and is linked from the HUD and the menu.

## 7. Mobile and fallback

`DeviceService.simpleView = computed(() => force3d() ? false : coarsePointer || !webgl2 || width < 900)`.
The guard redirects `/` to `/projects` and `/p/:slug` to `/projects/:slug`. A "Try the 3D world
anyway" link sets `?force3d=1`, persisted in localStorage. Redirecting keeps URLs honest and means
the lazily loaded hub bundle is never downloaded on phones. Simple view: card list (title, summary,
tags, screenshot) and a detail page with README, "Open demo" and "Source". Same `ContentService`,
same `MarkdownComponent`.

## 8. Asset pipeline

- Blender conventions: +Y up, 1 unit = 1 m, transforms applied, origin at ground centre, one
  material per prop where possible, textures baked; export `.glb` with Blender compression off.
- `scripts/optimize-assets.mjs` wraps `@gltf-transform/cli`:
  `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024`.
  Meshopt over Draco: faster decode, tiny decoder, no wasm fetch stall. Decoder from
  `three/examples/jsm/libs/meshopt_decoder.module.js`. Hero textures at most 2048, props 1024,
  screenshots 1024x640 WebP.
- The script also writes `public/assets/manifest.json` entries `{ url, bytes, group: 'core' | slug }`.
  `AssetService` preloads `core` behind the loading screen via `LoadingManager`; landmark groups load
  lazily when the player enters a radius, with a placeholder proxy mesh until ready.
- Imports from `three` and `three/examples/jsm` only (GLTFLoader, MeshoptDecoder, later KTX2Loader).
  No `three-stdlib`.
- `package.json` scripts: `assets:optimize`, `content:sync`, `content:check`, `verify`
  (lint + typecheck + `ng test` + `ng build` + budget check), `e2e`.

## 9. Build, deploy, quality

- Angular 22.1 application builder. `ng build --base-href /gitplore/` for Pages, `/` for the own
  server, chosen by an env variable in the workflow so the hosting switch is config-only.
  `public/404.html` uses the standard `sessionStorage` redirect trick with a small restore snippet
  in `index.html`. Workflow `deploy.yml`: checkout, setup-node 24, `npm ci`, `content:sync`,
  `content:check`, `ng build`, `actions/upload-pages-artifact`, `actions/deploy-pages`.
- Later (M6): multi-stage `Dockerfile` (`node:24-alpine` build, `nginx:alpine` serve),
  `nginx.conf` with `try_files $uri /index.html`, gzip and brotli, long cache for hashed files, no
  `Cross-Origin-*` headers so iframes work.
- Budgets: initial bundle at most 350 kB gz (Three core is about 150 kB gz with ES imports; the
  hub route is lazy), `anyComponentStyle` 8 kB.
- Unit tests (vitest): `WorldStore` transitions, `merged-projects.spec.ts` schema test over the
  merged portfolio (unique url-safe slugs, screenshots and READMEs exist, valid demo union) and
  `portfolio-placement.spec.ts` over where the hub puts it, `PlayerController` math (`heightAt`, collision
  resolution), `InteractionSystem` selection, `MarkdownComponent` sanitisation. `EngineService`
  is behind an `ENGINE` injection token so UI tests mock it; Three math classes run fine in Node.
- E2E (Playwright 1.63): Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
  Smoke: `/` reaches `data-phase="ready"` on the host, canvas has non-blank pixels, `/p/<slug>`
  shows the panel with README text, close returns to the hub; iPhone project asserts the redirect to
  `/projects` and the detail page.
- Lint: `angular-eslint` 22.5 flat config, `@typescript-eslint` strict, boundary rules from §1,
  Prettier 3 with organize-imports, husky + lint-staged.

## 10. Milestones

| # | Ends with | Verify |
|---|---|---|
| M0 Scaffold | `npx @angular/cli@22 new gitplore --style=scss --ssr=false` (zoneless default), path aliases, eslint/prettier, Playwright, `deploy.yml` publishing an empty page to Pages, `simpleViewGuard`, `/projects` placeholder, German README updated. | Pages URL serves the app; `/p/x` deep link on Pages loads through the 404 trick. |
| M1 Engine | `EngineService`, `InputService`, `PlayerController`, `CapabilityService`, procedural terrain and sky, HUD with stats; free walking. | Steady 60 fps at `medium` on a MacBook integrated GPU; tab-hide pauses the loop; controller math tests green. |
| M2 Content and panel | `Project` model, the synced portfolio (`repos.json` + `repo-overrides.ts` + `merge-repo.ts`), README sync script, `MarkdownComponent`, `ProjectPanelComponent` on `/p/:slug`, list and detail pages. | Deep link shows the README; iPhone emulation shows the list; the merged-portfolio schema test green. |
| M3 Landmarks and interaction | `Landmark`, `Interactable`, `PortalLandmark`, `ScreenLandmark`, proximity prompt, enter and return with spawn at exit point, project menu fast travel. | E2E: scripted keys walk to a portal, `E` opens the panel, `Esc` returns the player at the portal. |
| M4 Demos | `DemoFrameComponent` with iframe and the embeddable check script; one custom in-world landmark with `enter()` / `exit()`. | Both demo kinds usable; CI fails on a non-embeddable URL. |
| M5 Assets and polish | glTF pipeline, one hero glTF landmark, manifest preload, loading screen, settings, reduced motion, focus management, adaptive quality. | Lighthouse accessibility at least 90 on `/projects`; bundle within budget; `renderer.info.memory` stable after 5 enter/exit cycles. |
| M6 Release | README (German) split into first release vs. explorer phase, Pages live, Dockerfile and nginx tested locally with `docker run`. | Every PLAN.md success criterion checked manually and by the E2E suite. |

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Integrated GPU performance | Low-poly, `mergeGeometries` for static props, `InstancedMesh` for vegetation, pixel-ratio cap, adaptive tier, no post-processing in v1. |
| Pointer lock UX | Explicit "click to start" gate, `Esc` always lands in `ui` mode with a visible resume button, sensitivity setting, arrow-key turning, Safari quirks feature-detected. |
| Iframe blocked | `embeddable` verified in CI, runtime load timeout, permanent "open in new tab". |
| Three.js bundle size | Named ES imports only, hub route lazy, budgets enforced in CI. |
| README drift or rate limits | Build-time sync into `public/content`, committed copies as fallback, runtime GitHub fetch only in the explorer phase with caching. |
| Memory leaks on enter/exit | Hub never destroyed, refcounted assets, `disposeObject3D`, E2E cycle test reads `renderer.info.memory`. |

## First implementation session (M0)

1. `cd /Users/jamiejahn/programming/gitplore && npx @angular/cli@22 new gitplore --directory . --style=scss --ssr=false --skip-git=false`
2. `npm i three && npm i -D @types/three @gltf-transform/cli @playwright/test angular-eslint prettier husky lint-staged dompurify marked`
3. Add path aliases, ESLint boundaries, folder skeleton from §1, `simpleViewGuard`, routes from §3, `404.html`, `deploy.yml`.
4. Push to a new GitHub repo, enable Pages via Actions, confirm the deployed URL and a deep link.
5. Rewrite `README.md` (German) into "Erste Version" and "Spätere Erweiterung: GitHub-Explorer".
