"""
The Plaza's two-tier fountain, in travertine.

A low round basin with a kerb you can sit on (outer face r 3.0 m ringed with raised panels, a
coping from r 2.53 to 3.06 m at 0.55 m, a plinth step round its foot), a baluster pedestal, an
upper bowl with its rim at 2.1 m, and a finial whose spout is at y = 3.0 under a pine-cone knob
that tops out at 3.4 m.
Every part is a lathe: a profile in (radius, height) turned about Y.

The water, the jets and the spray are the game's: `LOWER`, `UPPER` and `SPOUT` below are where
it draws them, and the basin floors lie below those levels. The coping and the bowl's lip
overhang the water's edge a few centimetres, so the water plane's rim never shows. Stone is
`STONE`, the rims `STONE_DARK`; the stone the water covers is darker and a touch green.

One node, `fountain`, one material.
"""

import math

import bmesh
from mathutils import Matrix

from kit import P, Part, hex_rgb, material, mix, tone

STONE = hex_rgb("#d9cdb5")
STONE_DARK = hex_rgb("#cfc1a6")
WET = hex_rgb("#7d8a74")

# Where the game draws the water (level and radius of each surface) and where the jets start.
LOWER = {"level": 0.46, "radius": 2.6}
UPPER = {"level": 2.03, "radius": 0.9}
SPOUT = (0.0, 3.0, 0.0)
KERB = 3.06  # the coping's outer radius; the plinth reaches 3.12

# Profiles, (radius, height, which colour), from the outside in and bottom to top, the way the
# lathe needs them to face outwards. 'dark' is STONE_DARK, 'wet' the stone under water.
BASIN = [
    (3.12, 0.0, "stone"), (3.12, 0.09, "dark"), (3.02, 0.12, "stone"), (3.0, 0.44, "dark"),
    (3.06, 0.47, "dark"), (3.06, 0.52, "dark"), (3.02, 0.55, "dark"), (2.57, 0.55, "dark"),
    (2.53, 0.52, "dark"), (2.53, 0.48, "stone"), (2.6, 0.47, "stone"), (2.6, 0.45, "wet"),
    (2.6, 0.1, "wet"), (2.45, 0.06, "wet"), (0.7, 0.06, "wet"),
]
PEDESTAL = [
    (0.72, 0.0, "wet"), (0.72, 0.22, "wet"), (0.62, 0.26, "wet"), (0.52, 0.34, "wet"),
    (0.47, 0.44, "stone"), (0.34, 0.52, "stone"), (0.3, 0.62, "stone"), (0.41, 0.86, "stone"),
    (0.42, 0.98, "stone"), (0.33, 1.2, "stone"), (0.24, 1.44, "stone"), (0.26, 1.54, "dark"),
    (0.36, 1.58, "dark"), (0.36, 1.64, "dark"), (0.3, 1.68, "stone"), (0.42, 1.74, "stone"),
    (0.72, 1.84, "stone"), (0.94, 1.94, "dark"), (1.02, 2.0, "dark"), (1.03, 2.06, "dark"),
    (0.99, 2.1, "dark"), (0.93, 2.1, "dark"), (0.89, 2.06, "dark"), (0.9, 2.02, "wet"),
    (0.82, 1.94, "wet"), (0.55, 1.88, "wet"), (0.2, 1.86, "wet"),
]
FINIAL = [
    (0.2, 1.8, "wet"), (0.19, 1.9, "stone"), (0.13, 2.2, "stone"), (0.11, 2.55, "stone"),
    (0.17, 2.66, "dark"), (0.17, 2.72, "dark"), (0.1, 2.76, "stone"), (0.27, 2.86, "stone"),
    (0.29, 2.9, "dark"), (0.24, 2.93, "dark"), (0.1, 2.95, "stone"), (0.13, 3.02, "stone"),
    (0.18, 3.12, "stone"), (0.16, 3.24, "stone"), (0.1, 3.33, "stone"), (0.0, 3.4, "stone"),
]


def lathe(part, profile, segments, colours, rng, smooth_angle=35, blocks=1, twist=0.0):
    """
    Turns a (radius, height, colour) profile about Y into `segments` sides; a point's colour
    paints the band from it to the next point. `blocks` groups that many sides into one stone,
    each its own tone, so a ring reads as laid blocks. A radius of 0 closes the lathe in a point.
    """
    tmp = bmesh.new()
    rings = []
    for r, y, _ in profile:
        if r < 1e-6:
            rings.append([tmp.verts.new(P(0, y, 0))])
            continue
        rings.append([
            tmp.verts.new(P(math.cos(twist + k / segments * math.tau) * r, y,
                            math.sin(twist + k / segments * math.tau) * r))
            for k in range(segments)
        ])
    tones = {}
    painted = []
    for i in range(len(profile) - 1):
        a, b = rings[i], rings[i + 1]
        kind = profile[i][2]
        for k in range(segments):
            n = (k + 1) % segments
            if len(b) == 1:
                tmp.faces.new([a[k], b[0], a[n]])
            else:
                tmp.faces.new([a[k], b[k], b[n], a[n]])
            key = (kind, k // blocks)
            if key not in tones:
                tones[key] = tone(colours[kind], rng, 0.08 if kind == "wet" else 0.05)
            painted.append(tones[key])
    # `_merge` paints the faces in the order they were made.
    order = iter(painted)
    return part._merge(tmp, Matrix.Identity(4), lambda _c, _n: next(order), 0, smooth_angle, 0, 0,
                       None)


def build(seed=21):
    mat = material("plaza-fountain", roughness=0.85)
    part = Part("fountain", [mat], seed=seed)
    rng = part.rng
    colours = {"stone": STONE, "dark": STONE_DARK, "wet": mix(STONE, WET, 0.55)}

    lathe(part, BASIN, 36, colours, rng, blocks=4)
    lathe(part, PEDESTAL, 18, colours, rng, twist=math.pi / 18)
    lathe(part, FINIAL, 10, colours, rng, smooth_angle=50)

    # Raised panels round the kerb's outer face, one to a stone of the coping.
    panels = 12
    for k in range(panels):
        angle = (k + 0.5) / panels * math.tau
        r = 3.0
        part.box((0.07, 0.26, 0.9), at=(math.cos(angle) * r, 0.285, math.sin(angle) * r),
                 rot=(0, -angle, 0), color=tone(STONE, rng, 0.05))

    # Grime: the stone darkens a little towards the ground outside, where feet and rain splash.
    layer = part.bm.loops.layers.color["Col"]
    for face in part.bm.faces:
        for loop in face.loops:
            y = loop.vert.co.z
            radius = math.hypot(loop.vert.co.x, loop.vert.co.y)
            if radius > 2.9 and y < 0.4:
                t = 1 - y / 0.4
                r, g, b, al = loop[layer]
                loop[layer] = (r * (1 - 0.1 * t), g * (1 - 0.1 * t), b * (1 - 0.12 * t), al)
    return [part.build()]
