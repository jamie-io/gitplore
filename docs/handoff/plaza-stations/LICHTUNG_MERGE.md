# Merging the Lichtung branch after the Plaza stations (Phase A)

The Plaza's Phase A (smaller square, no seed lever on the Plaza, Blender models with a `'plaza'`
skin for the shared toys) is on `main`. `feat/deslopify-lichtung` conflicts with it in eight
files. None is hard, but three are semantic, and a mechanical "keep both" would break them:

- `src/app/world/project/project.scene.ts`: Lichtung makes `ToyLayout.ridge` optional and wraps
  `CommitRidge` in `...(toys.ridge ? [...] : [])`. The resolved block must keep the Plaza's
  `skin: modelSkin, haze: this.haze ?? undefined` inside that conditional. Lichtung's lever uses
  `onReseed: (offset) => this.reseed(offset)` and lists `this.seedLever,` in `parts`; resolved, it
  must be `toys.lever ? new SeedLever({ ..., onReseed: (o) => this.reseed(o) }) : null` and
  `...(this.seedLever ? [this.seedLever] : [])`, with the field typed `SeedLever | null` next to
  Lichtung's new `starLanterns` field.
- `src/app/world/environments/environment.ts`: the union of both sides — `lever?`, `ridge?`,
  `languages: ToySpot & { stalks? }`.
- `scripts/optimize-assets.mjs`: Lichtung inlines the same `--prune/--flatten/--join false` flags;
  keep `main`'s `OPTIMIZE_FLAGS` import from `scripts/lib/optimize-flags.mjs` (it has a test), drop
  the inline list, and re-run `npm run assets:optimize`.
- `src/app/world/environments/model-geometry.ts`: keep both sides. `markerPosition` (Plaza) and
  `transformIn` (Lichtung) do the same job; fold one into the other afterwards.
- `language-pillars.ts`, `scripts/blender/author.py` (the Plaza added an optional fifth tuple
  element, `args`, passed to `build`), `project.scene.spec.ts`, `toy-placement.spec.ts`: keep both
  sides' intent.

Phase B of the Plaza (stations and glides) waits for the Lichtung stations kit on `main` and will
declare the Plaza's stations through the kit's `WorldScene` hooks.

## Rebase first

`main`'s unpushed history was rewritten on 2026-09-25 to strip attribution trailers, without
changing any tree. `2dfee3a` ("Zero non-finite pixels before bloom…") is now `e9b91a2`. Before
merging, move the Lichtung branch (and any lane branch still open) onto the rewritten base:

    git rebase --rebase-merges --onto e9b91a2 2dfee3a feat/deslopify-lichtung

Merging without the rebase would bring the old copies of those five commits back into `main`.
