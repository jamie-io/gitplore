# Agent notes for gitplore

## 3D models: Blender, driven over MCP

Proper 3D props are modelled in Blender, not assembled from three.js primitives. The Deslopify
jungle's arch, lantern, stele, feed-card stands, boulders, release cairns and liana lever were all
built this way. Reach for it whenever the world needs a new or better prop.

**Quality bar.** Every model must look good and stay cheap: roughly one to a few thousand
triangles per prop, one draw call per material (one to three materials), no textures (colour and
ambient occlusion live in vertex colour), and meshopt-compressed to tens of kilobytes. Report
triangle counts and compressed sizes, and keep the procedural build in the game code as the
fallback until the model arrives.

**Source of truth.** A model is a Python script in `scripts/blender/models/`, built with the
modelling kit `scripts/blender/kit.py`: game-frame helpers (+Y up, metres, origin at the ground
centre), boxes, prisms, faceted rocks (planar `cuts`, `flat` tops), tubes with per-point `radii`,
and a Cycles ambient-occlusion bake into the vertex colour. Register a new model in
`scripts/blender/author.py`, and an environment's own props in
`scripts/lib/environment-models.mjs` so they load with that environment, not in the hub's `core`
preload.

**Iterating live over MCP.** With the Blender GUI open, the `blender` MCP server
(`uvx mcp-for-blender`, add-on from github.com/ahujasid/blender-mcp, port 9876) drives it. Run
`scripts/blender/live.py` through `execute_blender_code`:

```python
path = "<repo>/scripts/blender/live.py"
exec(compile(open(path).read(), path, "exec"), {"__file__": path, "MODEL": "cairn"})
```

It reloads the model's script, clears the scene (a factory reset would unload the MCP add-on),
builds and bakes the model exactly as the export does, and frames it; check it with
`get_viewport_screenshot`. Without MCP, the same scripts run headless.

**Shipping.** `npm run assets:author` builds every model headless (`BLENDER` names the binary if it
is not on the PATH) into `assets-src/models/`, `npm run assets:optimize` compresses them into
`public/assets/models/` and writes the manifest. Then check the model in the running game, not
only in Blender.

**Traps already hit.**

- Baked ambient occlusion needs a floor and a lowered strength: vertices touching a neighbouring
  block bake to black and stain whole faces.
- Loaded models must go through the environment's haze (`HazedCopies` in
  `src/app/world/environments/shaders/hazed-copies.ts`), or they stand out as dark silhouettes.
- The optimiser puts a dequantising offset and scale on every glTF node. Never reset a loaded
  node's position: copy its geometry out with `bakeGeometry`, or move it into a group with
  `adoptNode` (`src/app/world/environments/model-geometry.ts`).
- The optimiser runs with `--join-named false --palette false --simplify false`, so node and
  material names survive for the game to find parts by (the lantern's glass, the arch's glow).
