# Plaza models for Blender

Author every model as a Python module in `scripts/blender/models/` with a `build()` that returns its objects, using `kit.py` (`Part`, `material`, `tone`, `hex_rgb`, `bake_occlusion`, `export`), the same way `card_frame.py` and `arch.py` do. The Blender MCP is for iterating on the look live (`scripts/blender/live.py`, `preview.py`). What ships is the `.py` module, so the build stays reproducible.

Register each in `scripts/blender/author.py` → `MODELS` (name → module, AO strength, AO distance, ground plane), and in `scripts/lib/environment-models.mjs` as `'<name>.glb': 'plaza'`.

## Rules for every model

- Metres. Y up after export. **Front faces +Z.** Pivot on the ground (y = 0) at the centre of the footprint.
- Low-poly with a few bevels, in the style of the existing jungle models: vertex colour plus baked AO, one material per model where possible, no image textures unless listed.
- Colours from the existing palette (hex values below come from `plaza.ts` and `architecture.ts`; read `STONE` and `STONE_DARK` from `architecture.ts`).
- Anything the game tints per instance goes in its **own node**, painted white (`#ffffff`) with AO baked in, so the instance colour multiplies it.
- Anything the game draws at runtime (screens, water, jets, bulbs) is **not** modelled; leave the documented space for it.
- Before replacing a procedural prop, read the class that draws it today and keep its contract (face size and position, collider, interactable height).

## Models

| Name | Size (W × D × H) | Triangles | Nodes | Notes |
| --- | --- | --- | --- | --- |
| `plaza-fountain` | Ø 6 m kerb, 3.4 m to the finial | ≤ 2 500 | `fountain` | Two-tier: low round basin with a kerb you could sit on (outer r 3, inner r 2.6, kerb top 0.55 m), pedestal, upper bowl (r 0.95, rim 2.1 m), finial with the spout at y ≈ 3.0. Stone `#d9cdb5`-ish with `STONE_DARK` rims. Basin floors below the water levels. Report the final water levels and radii so `PLAZA_FOUNTAIN` can match. |
| `plaza-house-a` … `-f` | a, b: 5 m · c, d: 6 m · e, f: 6.5 m wide; 4 m deep; a, c, e 2 floors (7 m), b, d, f 3 floors (10 m) | 800–1 200 each | `stucco` (white, tinted with `STUCCO`), `shutters` (white, tinted with `SHUTTERS`), `trim` (fixed colours) | Front on the +Z face at z = +2 (depth / 2) so it sits flush on `FACADE`. Modelled: windows `#2f3a45`, door `#5a3a28`, shutters, one balcony or window box per house, cornice, terracotta roof tiles `#b8583a`, a wall lamp beside the door on a, c, e (lamp glass left as an empty named `lamp` so the game can put a bulb there). Awning on c and f only, in `trim`, colour from `AWNINGS`. Only the front and roof need detail; sides are plain, the back can be one quad. |
| `plaza-corner` | L-shaped, 4 × 4 m outer footprint per leg, 10 m high | ≤ 1 500 | `stucco`, `shutters`, `trim` | Closes each of the four corners. Two fronts at 90°, both detailed like the houses. Pivot at the outer corner's inner vertex; export once, the game rotates it by 90° steps. |
| `plaza-arch` | 6 m wide (3 m opening) × 1.2 m deep × 5 m | ≤ 1 200 | `arch`, `portal` (empty) | Stone archway spanning the south street between the two houses; it frames the return portal. Start from `models/arch.py`. Keep the portal surface as an empty named `portal` with the size the current `ReturnPortal` / `PortalLandmark` uses; read that class first. |
| `plaza-terminal` | 1.6 × 0.6 × 2.4 m | ≤ 900 | `terminal`, `screen` (empty) | Newsstand-style kiosk: two posts, a small tiled roof, a shelf. Replaces only the frame of `Terminal`; the screen stays a runtime texture. Read the current terminal prop for the screen plane's size and position and leave that space clear. |
| `plaza-board` | 2.2 × 0.4 × 2.8 m | ≤ 700 | `board`, `face` (empty) | Notice board on two posts under a small tiled roof, for the exhibit (`ScreenLandmark`). Follow `card_frame.py`: keep the face plane the game draws, and model only the frame, posts and roof. |
| `plaza-step` | 0.5 × 0.8 × 0.4 m module | ≤ 60 | `step` (white, tinted) | Bevelled stone block for the commit ridge, instanced per step; height scaled on Y by the game. Pivot at the bottom centre. |
| `plaza-pillar` | Ø 0.6 m, 1 m tall shaft + base + capital | ≤ 300 | `base`, `shaft`, `capital` (white, tinted) | Column for the language pillars. The shaft is 1 m tall and scaled on Y by the game; base and capital stay unscaled and are moved to the shaft's ends. |
| `plaza-mast` | Ø 0.25 m, 6.3 m | ≤ 200 | `mast` | Iron festoon mast with a finial and a hook at y = 6 (`MAST_TOP`). Iron colour from `architecture.ts`. |
| `plaza-bench` | 1.8 × 0.6 × 0.8 m | ≤ 400 | `bench` | Stone base, timber seat. Front (the sitting side) faces +Z. |
| `plaza-cypress` | Ø 1.2 m, 8 m | ≤ 400 | `cypress` | Stays wind-animated through the existing `withWind`, so keep it one mesh with its pivot at the base. |

Budget for the whole Plaza, models and procedural parts together: about 35–45k triangles on screen, about 1 MB compressed. Check with `scripts/check-budget.mjs` after `assets:optimize`.

## Order

1. `plaza-house-a`…`f` and `plaza-corner`: they fix the scale and the look of the square.
2. `plaza-fountain`: the centre, and it sets `PLAZA_FOUNTAIN`.
3. `plaza-arch`, `plaza-board`, `plaza-terminal`.
4. `plaza-step`, `plaza-pillar`, `plaza-mast`, `plaza-bench`, `plaza-cypress`.

The layout change (README §1–§6) does not depend on the models; the procedural proxies carry it until each GLB lands.
