Orchestrator review of your Task 4 work. Fix every point, re-run specs, tsc, eslint. Do NOT create CHANGELOG.md (I deleted it; the orchestrator owns it). Do not commit.

Terminal:
1. BUG: you removed the project-title header line from redraw() for the DEFAULT skin too. The default skin must stay pixel-identical: keep `context.fillText(this.options.project.title, MARGIN, 60, width)` for default; drop it only for jungle.
2. BUG: `group.rotation.x = JUNGLE_TILT` tilts the whole stele including its base, so it leans and lifts off the ground. Build the jungle stele as: a stone slab (MeshStandardMaterial ~0x3a4038 stone, roughness 1, flatShading off) standing on the ground, from y=0 to about 2.75 m, slightly tapered (e.g. a CylinderGeometry with 4 radial segments rotated 45°, or a box scaled), and a recessed screen panel group mounted in the slab's upper part whose centre is at 2.1 m and which alone is tilted back 12° (top away from the reader). The moss edges hug the slab silhouette (top and sides), not a floating frame. No thin post.
3. Size: do not halve the screen. Jungle screen plane 1.6 × 1.0 m (512:320), case/recess frame 1.69 × 1.09 m (540:348) in slightly darker stone #141b17. Collider: the slab footprint. Reading distance for jungle: 1.9 m; reading pitch 0.
4. Page dots: one dot per page (`this.pages.length`), not a hard-coded 4 with Math.min. Centre the dot row; 8 px dots (drawn as circles), active dot #f4e6c8, others muted.
5. Keycaps: draw real keycaps: rounded rectangles with a 2px #f4efe4 stroke around `↑↓` and `Esc`, followed by the words `blättern` and `verlassen`, right-aligned in the footer. Measure text for placement; no magic x offsets.
6. Plank label: do not scale the label mesh non-uniformly (it destroys the measured aspect). Size the plank from the label geometry: plank width = label width + 0.2 m, height = label height + 0.12 m; label on the plank front. Use the text colour '#f4e6c8' engraved look: createLabel(text, '#5a3d27') is fine. Plank sits on top of the slab or hangs just above the screen.
7. Fonts: body `44px "IBM Plex Sans", system-ui, sans-serif`, title `600 54px "IBM Plex Sans", system-ui, sans-serif`, footer `500 26px "IBM Plex Mono", ui-monospace, monospace`; redraw once `document.fonts?.load(...)` resolves (guarded: `document.fonts?.load(font).then(() => this.redraw(), () => undefined)`), only for the jungle skin.

Seed lever (liana):
8. The pull animation rotates `this.handle` about z — for jungle that swings the branch too. Make only the liana+grip swing (put them in their own group pivoting at the branch tip and assign that group to `this.handle`), and keep the branch fixed. The branch should reach out from something: a short trunk/stump rising from the rock to the branch height (bark 0x3a3226).

Specs: update for all of the above (default header still drawn; dot count equals page count; stele base at ground level, only the panel tilted; label aspect preserved; liana swings, branch fixed).
Report briefly when done.
