Paste this into Claude Code from the repository root, with this folder copied to `docs/handoff/plaza-stations/`.

---

Implement the Plaza "Stations" layout described in `docs/handoff/plaza-stations/README.md`. The models are specified in `docs/handoff/plaza-stations/BLENDER_MODELS.md`. `Plaza Compact Layout.dc.html` in the same folder is the design reference (section 2a is the build spec).

Read `CLAUDE.md`, `AGENTS.md`, the README above, `src/app/world/environments/plaza.ts`, `environment.ts`, `architecture.ts`, `src/app/world/project/project.scene.ts` and `src/app/engine/player/player-controller.ts` before you change anything.

Work in these steps and run `npm run verify` after each; commit each step separately:

1. **Layout.** New constants, closed streets, corners, stations, `anchors()`, `toyLayout()`, dressing; delete the rooftop. Keep the procedural models. Update `plaza.spec.ts`.
2. **No seed lever on the Plaza.** Make `ToyLayout.lever` optional and `ProjectScene.seedLever` nullable; update the specs that read it.
3. **Glide.** `Station` type, `stations` on the environment and scene, the glide in the player controller, keys 1–4, click-to-glide, HUD hint `1–4 Stationen`, reduced-motion fade. Add the glide tests from README §8.
4. **Models.** Using the Blender MCP to iterate, author the models in `BLENDER_MODELS.md` as `scripts/blender/models/*.py` modules in the order listed there. Register them in `author.py` and `environment-models.mjs`, run `npm run assets:author` and `npm run assets:optimize`, and swap each procedural piece for its GLB with the procedural one as the proxy. Update `PLAZA_FOUNTAIN` from the fountain model.
5. **Captures.** Regenerate `captures/plaza-gitplore/` and check the first frame and a glide to station 2 against README §8's manual acceptance.

If a number in the README collides with something in the code (a collider, a clearance test, a prop's real footprint), keep the intent (every prop within 2.2 s of glide, the glide circle clear, no fountain clipping), adjust the number, and note the change in the commit message.
