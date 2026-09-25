"""
The Plaza's commit-ridge step: one bevelled travertine block, instanced once per ridge slab.

A 0.5 × 0.4 × 0.8 m module (X along the ridge, Y up, Z across it), its pivot at the bottom centre.
The game scales it per slab to today's box: X to the slab width, Y to the slab height (0.06 to
2.86 m, so Y scales from 0.15 to about 7), Z to the 0.9 m slab depth. It is painted white with only
its ambient occlusion baked in, so the instance colour (the project's theme colour) tints it.

The bevel is kept small because the Y scale stretches it: 0.02 m here is 0.14 m on the tallest
slab, still a chamfer. The bottom face is left out; it never shows.
"""

import bmesh

from kit import Part, material

WIDTH = 0.5
HEIGHT = 0.4
DEPTH = 0.8
BEVEL = 0.02


def build():
    stone = material("plaza-step", roughness=0.85)
    part = Part("step", [stone], seed=3)
    faces = part.box((WIDTH, HEIGHT, DEPTH), at=(0, HEIGHT / 2, 0), color=(1, 1, 1), bevel=BEVEL)
    # Drop the face on the ground: no one sees under a step, and it saves two triangles.
    bottom = [f for f in faces if f.is_valid and f.normal.z < -0.99]
    bmesh.ops.delete(part.bm, geom=bottom, context="FACES_ONLY")
    return [part.build()]
