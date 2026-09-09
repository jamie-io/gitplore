# Handoff — gitplore

Written at the end of the session that took the repository from a deployed M1 plus an uncommitted
M2 to a complete M6 on the branch `feat/m2-m6`. `CLAUDE.md`, `PLAN.md` and
`IMPLEMENTATION_PLAN.md` remain the source of truth; this file records what happened, what was
decided on Jamie's behalf, and what is left.

---

## 1. Where things stand

| Milestone                    | State                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| M0 Scaffold, M1 Engine       | Done on `main` (`82a8c89`, `605cd5e`), deployed                                      |
| M2 Content and panel         | Done, `a6df2d3`                                                                      |
| M3 Landmarks and interaction | Done, `4c8645f`                                                                      |
| M4 Demos                     | Done, `cac4df7`                                                                      |
| M5 Assets and polish         | Done, `2a3ea02`                                                                      |
| M6 Release                   | Done, `28a0b6f` + review fixes `85d8607`, `1712b03`, `d9c9927` — merged and deployed |

`feat/m2-m6` was fast-forwarded into `main` and pushed at Jamie's request; the deploy workflow
succeeded and the live site was smoke-tested from a browser (start gate, walking to the portal,
`E` opening `/p/deslopify`, the `/p/novaverta` deep link through the 404 trick with README and
demo iframe, `assets/manifest.json`, and the phone redirect to `/projects`).

Live: <https://jamie-io.github.io/gitplore/> · Repo: <https://github.com/jamie-io/gitplore>

## 2. Environment

Node `24.21.0` via nvm, pinned in `.nvmrc`; every shell needs
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` before `npm`/`ng`.
Docker Desktop was started during the session for the M6 container test and is probably still
running.

## 3. Verification status at `d9c9927`

```
npm run verify        → lint clean, typecheck clean, 346 unit tests, 11 node script tests,
                        build, then `budget:check` (initial scripts gzipped ≤ 350 kB; ~80 kB now)
npx playwright test   → 28 passed, 3 skipped (project-specific), stable across repeats
Lighthouse a11y       → 1.00 on /projects and 1.00 on / with the start gate open
                        (production build, lighthouse@12, no failing audits)
docker build/run      → routes, deep links, MIME types, 404 for missing assets, gzip, cache
                        headers, no Cross-Origin-* headers — all as intended
```

E2E runs against the production build served by `scripts/serve-dist.mjs` on port 4173, not
`ng serve`. The previous session's e2e flakiness was two separate things, both fixed: a real bug
(README `h1` duplicating the page `h1`, now demoted by `MarkdownComponent`) and pixel comparison
under software rendering (the pause tests now read the engine's frame counter from the HUD
stats, `?stats=1`).

## 4. What each milestone added

- **M2** — `Project` union and curated `projects.ts`, `ContentService`, `ReadmeService`
  (`httpResource`, owned by the component injector), `MarkdownComponent` (marked + DOMPurify,
  `topLevel` input), `ProjectPanel`, simple-view pages, scripts (`sync-readmes`,
  `check-embeddable`, `capture-screens`, `serve-dist`), CI runs `content:sync`/`content:check`.
- **M3** — `Interactable` + `InteractionSystem` (change-only reporting), input action listeners,
  `Landmark` base (`describe()` gives colliders/interactables before init; `build()` the
  meshes), `PortalLandmark` (dolly then enter), `ScreenLandmark` (screenshot billboard),
  `HubScene` builds one landmark per project and names the area, `WorldStore.nearby/inputMode`,
  HUD prompt, `ProjectMenu` with fast travel, return spawn at the landmark facing away.
- **M4** — `DemoFrame` (sandboxed lazy iframe, screenshot card fallback, https only),
  `DeslopifyLandmark` (video wall whose mistranslated titles flip on `E`), `enter/exit/interact`
  demo hooks, `scripts/lib/embeddable.mjs` with node tests (`npm run test:scripts`),
  `tests/memory.spec.ts`.
- **M5** — `AssetService` (refcounted textures + models, GLTFLoader + meshopt, `preload`),
  `scripts/author-models.mjs` + `optimize-assets.mjs` + `public/assets/manifest.json`
  (pinned by `manifest.spec.ts`), `Monument`, portal model swap within 40 m, `LoadingScreen`
  with start gate, `SettingsDialog` (Signal Forms), reduced-motion override, inert world behind
  overlays, focus return to the canvas.
- **M6** — German README, `Dockerfile`, `nginx.conf`, `.dockerignore`.

## 5. Decisions taken on Jamie's behalf (review these)

1. **Deslopify's portal moved from (0,0,−34) to (0,0,−20)** so the e2e walk is short under
   software rendering. Positions are arbitrary anyway.
2. **Raycaster mouse picking (§2) dropped.** The first canvas click requests pointer lock, so a
   click-to-pick would fight it; `E`/`Enter` and the menu cover the need.
3. **No sound toggle** in the settings dialog (§6 lists one): there is no audio in the app, and a
   switch that does nothing would be dishonest. `SettingsStore` no longer has `sound`.
4. **Hero glTF models are authored by script** (`assets-src/models/*.glb` from
   `scripts/author-models.mjs`), not in Blender — none is installed. The pipeline
   (optimise, manifest, loader, proxy swap) is what M5 verifies.
5. **`demo.mode: 'panel'` is implemented minimally** (`DemoPanelHost`, lazy `panelComponent`
   via `NgComponentOutlet`) but no project uses it yet.
6. **Terrain bakes per-face normals instead of `flatShading`**: the derivative-based normal of the
   triangle under the camera rendered black in SwiftShader. Same look, deterministic.
7. **The start gate is real**: input stays in `ui` mode until "Starten" is clicked (or a demo is
   started from the panel). On a deep link the panel shows first and the gate appears after it
   closes.
8. **`*.tsbuildinfo` untracked and ignored** (they churned on every typecheck).
9. **Handlers read the router-derived slug, not the store copy**, because the store trails the
   router by one change-detection pass and keys can land in that gap.
10. **E2E is not run in CI** — the deploy workflow runs lint, typecheck, unit and script tests,
    content checks, the build and the budget check. Adding Playwright there is a follow-up.
11. **The demo iframe sandbox omits `allow-same-origin`** (the plan's §5 lists it). Both demos
    are served from the same origin as the portfolio, so with it the sandbox would have granted
    the framed page full access to gitplore. Both demos are static sites and render fine without
    it; a future demo that needs storage would need a per-project exception.
12. **Brotli is not configured** in `nginx.conf` (§9 mentions it): `nginx:alpine` ships no brotli
    module. Gzip is on; `X-Content-Type-Options: nosniff` was added.

The German `summary`/`tags` in `projects.ts` are still the previous session's wording; the
example video titles in `deslopify.landmark.ts` are fictional and marked as examples.

## 6. Known gaps and follow-ups

- Minor review findings deliberately left: query params are dropped on `navigate('/')`; the
  camera trails the portal dolly by one frame and walking input is not frozen during it;
  `tests/panel.spec.ts` "walking keys do not move the player" compares pixels under the backdrop;
  `ContentService.ready` would be an unhandled rejection if a future source throws;
  `AssetService.model()` uses `Object3D.clone()` (fine for static props, wrong for skinned
  models); preload progress counts textures via loader callbacks, not the `LoadingManager`.
- Quality-tier changes at runtime re-apply pixel ratio and shadows; fog distance and terrain
  density need a reload (the dialog says so).
- The memory e2e compares scene-owned geometry/texture counts (flat across cycles) and requires
  GPU counts not to exceed them; `renderer.info.memory` alone is view-dependent, since Three
  counts a geometry only once it has been drawn.
- `AssetService.preload()` keeps one reference per core asset for the session (a cache, never
  released) — intentional, but the refcount then no longer reads as "live consumers".
- Three review rounds were run by subagents (M2+M3, M4+M5, whole branch); all Critical and
  Important findings were fixed, the rest are the minors listed here.
- Lighthouse was run from the scratchpad with `lighthouse@12`; nothing about it is committed.
  Rerun with `npx lighthouse@12 http://localhost:4173/projects --only-categories=accessibility`
  after `npm run build && node scripts/serve-dist.mjs`.

## 7. Next steps

1. Review §5 — every ruling there is reversible.
2. Optional: add a Playwright job to `deploy.yml`; revisit the deferred minors above.
3. The GitHub explorer phase (`features/explorer`, `GitHubContentSource`, `environments/plaza`)
   is the next product step; landmarks already build from `Project` data alone.
