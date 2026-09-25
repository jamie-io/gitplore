"""
Builds the authored models in Blender and exports them as uncompressed GLB sources.

    blender -b --factory-startup --python scripts/blender/author.py -- <out-dir> [name ...]

Each module in `models/` has a `build()` that returns the objects to export; every object becomes
one glTF node. Ambient occlusion is baked into the vertex colour before export. `npm run
assets:author` runs this, and `npm run assets:optimize` compresses the result.
"""

import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "models"))

import kit  # noqa: E402

# name → (module, AO strength, AO distance, bake a ground plane under it)
MODELS = {
    "jungle-arch": ("arch", 0.6, 0.6, True),
    "lantern": ("lantern", 0.45, 0.25, False),
    "stele": ("stele", 0.55, 0.5, True),
    "card-frame": ("card_frame", 0.5, 0.35, True),
    "jungle-rocks": ("jungle_rocks", 0.5, 0.6, True),
    "cairn": ("cairn", 0.5, 0.4, True),
    "liana-lever": ("liana_lever", 0.5, 0.4, True),
    "plaza-terminal": ("plaza_terminal", 0.5, 0.35, True),
    "plaza-board": ("plaza_board", 0.5, 0.35, True),
    "plaza-step": ("plaza_step", 0.4, 0.25, True),
    "plaza-pillar": ("plaza_pillar", 0.45, 0.25, True),
    "plaza-mast": ("plaza_mast", 0.45, 0.3, True),
    "plaza-bench": ("plaza_bench", 0.5, 0.3, True),
    "plaza-cypress": ("plaza_cypress", 0.5, 0.6, True),
}


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not args:
        raise SystemExit("usage: author.py -- <out-dir> [name ...]")
    out = args[0]
    names = args[1:] or list(MODELS)
    os.makedirs(out, exist_ok=True)
    report = {}
    for name in names:
        module_name, strength, distance, ground = MODELS[name]
        kit.reset()
        module = importlib.import_module(module_name)
        objects = module.build()
        kit.bake_occlusion(objects, strength=strength, distance=distance, ground=ground)
        path = os.path.join(out, f"{name}.glb")
        kit.export(path)
        report[name] = {
            "triangles": sum(kit.triangles(o) for o in objects),
            "nodes": [o.name for o in objects],
            "bytes": os.path.getsize(path),
        }
    print("AUTHORED " + json.dumps(report))


if __name__ == "__main__":
    main()
