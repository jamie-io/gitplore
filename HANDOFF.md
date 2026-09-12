# Handoff — gitplore

This file spans three sessions. The first took the repository from a deployed M1 plus an
uncommitted M2 to a complete M6. The second — 11 September 2026 — implemented §5–§7 of
`docs/superpowers/specs/2026-09-10-repo-worlds-design.md`: **walking into a portal is now a real
scene change into that repository's own themed world**, and the README panel moved from
`/p/:slug` down to `/p/:slug/info`. The third — 12 September 2026 — ran the verification the
second one deferred. It found two accessibility defects that were live on the site, fixed them,
and closed the gap that let them ship: **the browser suites now gate the deploy**.

`CLAUDE.md`, `PLAN.md` and `IMPLEMENTATION_PLAN.md` remain the source of truth; this file records
what happened, what was decided on Jamie's behalf, and what is left.

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
| Repo worlds (spec §5–§7)     | Done, `580f23a`..`597639e` + store tidy-up `38433c0` — merged and deployed           |
| A11y fixes and CI gates      | Done, `7a5af46`..`6e8a1a0` — merged and deployed                                     |
| Nordwerk's furnished world   | Done, `d7aaf23` — merged and deployed                                                |

`feat/m2-m6` was fast-forwarded into `main` and pushed at Jamie's request; the deploy workflow
succeeded and the live site was smoke-tested from a browser (start gate, walking to the portal,
`E` opening `/p/deslopify`, the `/p/novaverta` deep link through the 404 trick with README and
demo iframe, `assets/manifest.json`, and the phone redirect to `/projects`).

`repo-worlds` (19 commits, one per task plus six review-fix rounds) and `tidy-world-store` were
both fast-forwarded into `main` and pushed at Jamie's request, each triggering the Pages deploy.

What changed for a visitor: a portal now disposes the start world and builds the repository's
own — `Lichtung` (start), `Showroom`, `Dschungel`, `Plaza`, one lazy chunk each. Inside, an
exhibit board opens the description at `/p/:slug/info` and a return portal leads back, placing the
visitor in front of the portal they walked into. Deslopify's video wall moved out of the start
world into its own. A non-modal veil covers each swap, and the HUD's `aria-live` region announces
the arrival ("Dschungel — Deslopify").

Live: <https://jamie-io.github.io/gitplore/> · Repo: <https://github.com/jamie-io/gitplore>

## 2. Environment

Node `24.21.0` via nvm, pinned in `.nvmrc`; every shell needs
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` before `npm`/`ng`.
Docker Desktop was started during the session for the M6 container test and is probably still
running.

## 3. Verification status at `6e8a1a0`

```
npm run verify        → lint clean, typecheck clean, 53 files / 481 unit tests, 34 node script
                        tests, build, then `budget:check` (initial scripts gzipped ≤ 350 kB;
                        ~90 kB now)
npm run e2e           → 38 passed, 4 skipped (project-specific), stable across repeats
tests/a11y.spec.ts    → axe (wcag2a/2aa/21a/21aa) clean on a repo world, on the panel over it,
                        and on the one README with GFM task lists
npm run a11y:check    → Lighthouse 1.00 on all four audited routes, and committed this time:
                        the route list lives in `scripts/lib/a11y-audit.mjs`
CI                    → `build` and `e2e` both gate `deploy`; the browser suites are no longer
                        developer-machine-only
docker build/run      → verified at `d9c9927`, untouched since
```

Both gates were run on the exact commit `main` now points at. The four environments are confirmed
lazy: none of `Lichtung`, `Showroom`, `Dschungel` or `Plaza` appears in `main-*.js`.

The deployed build was walked from a browser afterwards: the start gate, a cold deep link to
`/p/deslopify` building Dschungel directly, fast travel from the menu swapping Dschungel for
Showroom, and the live DOM confirming eleven task list boxes with `aria-label` and
`documentElement.lang === 'de'`.

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

### Accessibility and CI session (12 September 2026)

i. **Task boxes are named after their state** — `Erledigt` / `Offen` — rather than after the
control. A screen reader then says "Erledigt, Kontrollkästchen, aktiviert", which is mildly
redundant but coherent either way round; naming the control instead ("Aufgabe") would be terser
and is a one-line change in `markdown.component.ts`.
ii. **The document is German, full stop.** `lang="de"` covers the interface and three of the five
READMEs. Deslopify's and novaverta's READMEs are English and are now inside a German document
(WCAG 3.1.2). Marking the language of parts needs a per-project README language on the content
model, which is feature work rather than a fix — deliberately not invented here.
iii. **Lighthouse is a committed script, not a CI incantation.** `scripts/lib/a11y-audit.mjs` holds
the route list and `scripts/check-a11y.mjs` drives it, so the routes that get measured are
reviewable and testable. `lighthouse` is pinned at `12.8.2` as a devDependency rather than run
through `npx`, so CI does not re-download it per run.
iv. **The browser suites are their own job**, not extra steps on `build`, so a Playwright failure
reads as a Playwright failure. `deploy` needs both.
v. **`settle()` stays local to `world.page.spec.ts`.** It has one caller; a shared testing helper
can wait until a second one exists.

### Repo-worlds session (September 2026)

Sixteen rulings were recorded while executing the plan; these are the ones with consequences worth
re-reading. All are reversible.

a. **Environment assignment**: `gitplore` → Plaza, `webkatalog_demoshop`/`novaverta`/`poetzscher`
→ Showroom, `deslopify` → Dschungel. The spec left this open. One line per repository in
`content/repo-overrides.ts`; `showroom` is the default for anything unstyled.
b. **The scene-swap veil is its own component, not `LoadingScreen`.** The spec asks for both in
different sections, and they conflict: `LoadingScreen` is an `aria-modal` dialog with a focus
trap, and trapping focus for the length of a build would strand a keyboard user mid-walk.
c. **`ProjectDestination` is a componentless route, not a component.** It carries `:slug` for
`SceneDirector` and hands it to the panel through Angular's param inheritance — which
`world.page.spec.ts` now pins with a real test, because if it ever stopped working every
project would render "Projekt nicht gefunden".
d. **The director awaits content readiness itself** rather than trusting callers to do it. Without
that, a cold deep link to `/p/:slug` could build no world at all — and that link is the primary
entry path for this portfolio.
e. **No per-environment asset preloading.** Every environment is procedural and the only two glTF
models are in the `core` group, already preloaded at boot. The spec's step for it would have
been a hook for assets that do not exist.
f. **Arc layouts were deduplicated** into `arcAnchors` in `world/environments/placement.ts`,
against the plan's own text, which had jungle and plaza carrying identical bodies.
g. **`WorldStore` lost `activeSlug`, `activeProject` and `openProject`** after the plan landed
(`38433c0`): nothing read them once `inputMode` stopped consulting them. Which world is open is
a routing fact and `SceneDirector` reads it from the route. This also removed the store's last
dependency on `ContentService`.

### M2–M6 session

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
    content checks, the build and the budget check. Adding a Playwright job there is a follow-up,
    and so is running Lighthouse accessibility in it (design spec §8 asks for 1.00; there is no
    Lighthouse run in this repository, committed or otherwise — see §6). `@axe-core/playwright`
    now runs locally as part of `npm run e2e` (`tests/a11y.spec.ts`, added in Task 11), which is a
    real automated a11y check but not a substitute for either of those two follow-ups.
11. **The demo iframe sandbox omits `allow-same-origin`** (the plan's §5 lists it). Both demos
    are served from the same origin as the portfolio, so with it the sandbox would have granted
    the framed page full access to gitplore. Both demos are static sites and render fine without
    it; a future demo that needs storage would need a per-project exception.
12. **Brotli is not configured** in `nginx.conf` (§9 mentions it): `nginx:alpine` ships no brotli
    module. Gzip is on; `X-Content-Type-Options: nosniff` was added.

The German `summary`/`tags` in `content/repo-overrides.ts` are still the previous session's
wording; the example video titles in `world/projects/deslopify/video-wall.ts` are fictional and
marked as examples.

## 6. Known gaps and follow-ups

### Left open by the repo-worlds session

Every one of these was raised by a review, judged Minor, and deliberately deferred. None is a
defect a visitor can see; all are cheap.

- **Test strength.** `anchors(1)` asserts only `.length === 1`, so a NaN position would pass;
  nothing asserts `VideoWall.init()` builds one card per `EXAMPLE_VIDEOS` entry, and that loop's
  position maths is changed code, not part of the verbatim move; the veil's reduced-motion test
  asserts the host class, not that the CSS transition is gone (jsdom cannot read it from a
  component `styles` block); `world.page.spec.ts` has two tests asserting the same boot outcome.
  (`bootWithoutManifest`'s silent fall-through is fixed — it cost a spurious failure first.)
- **`scene as HubScene` in `SceneDirector.place()`** is an unchecked cast, correct only while
  `show()` builds exactly two scene types. `instanceof HubScene` is a two-token change.
- **`ProjectScene.add()`'s "subclass constructor only" contract** is a comment, not a type.
- **In the project menu, "Hinreisen" and "Öffnen" do the same thing inside a repo world**, and for
  the project you are already standing in both do nothing — Angular's default
  `onSameUrlNavigation` drops the navigation. That dialog is also the screen-reader path into
  travel, so two differently-labelled controls doing one thing is worth a look.
- **The arrival announcement is suppressed on a cold deep link to `/p/:slug/info`**, because the
  HUD is `[inert]` while the panel owns input. The panel names the project, so only the _place_ is
  lost.
- **A failed scene build is terminal.** `store.fail()` sets `phase: 'error'` with no way back, so
  a transient lazy-chunk 404 right after a redeploy strands the visitor with no retry.
- **The veil's live region is created together with its text**, which screen readers announce
  inconsistently; rendering the `<p>` always and toggling its content is the robust form.
- **`tests/a11y.spec.ts` excludes `iframe`** from the axe scan. Only the cross-origin demo frame
  matches today, so nothing of gitplore's own markup is silenced — but the exclusion also drops
  `frame-title` from the gate.
- **`'clearing'` is selectable as a repo world** and would put that world's return portal at the
  origin, where the `Monument` stands with its collider. Nothing selects it; the comment on
  `EnvironmentId` now warns about it.

### Earlier

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
- Lighthouse and Playwright are both committed and both run in CI now (§5.iii, §5.iv). The
  scratchpad-only Lighthouse run this bullet used to describe is what let a 0.96 be reported as a
  1.00 for a whole session.

## 7. Next steps

1. Review §5's new subsection. Five rulings, all reversible; the label wording (§5.i) and the
   decision not to invent a per-README language (§5.ii) are the two worth an opinion.
2. **The content is still placeholder in places, and it is the part a hiring reader actually
   reads.** The German `summary`/`tags` in `content/repo-overrides.ts` are the first session's
   wording, and the video titles in `world/projects/deslopify/video-wall.ts` are invented examples.
   Nobody but Jamie should be writing the copy that describes Jamie's projects.
3. **Three of the five worlds are still the bare default hall.** Nordwerk's is done and is the
   pattern to copy: keep `environment: 'showroom'`, add a bespoke scene under
   `world/projects/<slug>/`, register one line in `createProjectScene`. Phönix (NOVA VERTA paint
   booths) and Pötzsch (Objektservice, and a README that boasts of having no external connections)
   are the two left; `gitplore` has plaza to itself and needs character rather than
   differentiation. The rule that made Nordwerk work: build the thing the repository _does_, not
   the thing it sells — the article cards say more than the furniture does.
4. §6's deferred minors. Two are worth more than their label: **a failed scene build is terminal**
   (a lazy-chunk 404 right after a redeploy strands the visitor with no retry), and **"Hinreisen"
   and "Öffnen" do the same nothing** for the project you are already standing in — on the dialog
   that is also the screen-reader path into travel.
5. `GithubContentSource` and `environments/plaza` already exist; the remaining explorer-phase step
   is `features/explorer` itself, and landmarks already build from `Project` data alone.

A note for whoever picks this up: the two defects this session fixed had both been live for a
while, and both were invisible to the suite as it stood. The lesson that generalises is in §5.iii —
a verification whose inputs are not committed is a verification nobody can repeat.
