"""
Rebuilds one model in an open Blender session, for iterating on it live over MCP.

From the MCP `execute_code` tool (or any Python console in Blender):

    path = "<repo>/scripts/blender/live.py"
    exec(compile(open(path).read(), path, "exec"), {"__file__": path, "MODEL": "cairn"})

The model's module is reloaded each time, so edits to its script show on the next run. The scene
is cleared (not reset: that would unload the MCP add-on), the model is built and baked exactly as
`author.py` builds it, and the viewport shows it in its vertex colours. Nothing is exported: once
it looks right, `npm run assets:author` writes the source the game uses.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for path in (HERE, os.path.join(HERE, "models")):
    if path not in sys.path:
        sys.path.insert(0, path)

import bpy  # noqa: E402

import author  # noqa: E402
import kit  # noqa: E402

importlib.reload(kit)
importlib.reload(author)
name = globals().get("MODEL")
module_name, strength, distance, ground, *rest = author.MODELS[name]
kit.clear()
module = importlib.import_module(module_name)
module = importlib.reload(module)
objects = module.build(*(rest[0] if rest else ()))
kit.bake_occlusion([o for o in objects if o.type == "MESH"], strength=strength, distance=distance,
                   ground=ground)
for obj in objects:
    obj.select_set(True)
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type == "VIEW_3D":
        shading = area.spaces.active.shading
        shading.type = "SOLID"
        shading.color_type = "VERTEX"
        shading.light = "STUDIO"
        region = next(r for r in area.regions if r.type == "WINDOW")
        with bpy.context.temp_override(area=area, region=region):
            bpy.ops.view3d.view_selected()
for obj in objects:
    obj.select_set(False)
print({o.name: kit.triangles(o) for o in objects if o.type == "MESH"})
