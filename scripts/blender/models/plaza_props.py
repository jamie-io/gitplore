"""
Shared pieces of the Plaza's small props (terminal kiosk, notice board, mast, bench): the palette
they take from `plaza.ts` and `architecture.ts`, a barrel-tiled roof slope, and an empty marker
node for a surface the game draws itself.

Not a model: `author.py` never lists it; the models import it.
"""

import math

import bpy
from mathutils import Vector

from kit import P, hex_rgb, tone

# architecture.ts
STONE = hex_rgb("#d9cdb5")
STONE_DARK = hex_rgb("#cfc1a6")
IRON = hex_rgb("#2a2d33")
TERRACOTTA = [hex_rgb(h) for h in ("#b8583a", "#a84f36", "#c46a45")]
DOOR = hex_rgb("#5a3a28")
# The bench's timber in architecture.ts, and a darker oiled tone beside it.
TIMBER = hex_rgb("#8a6040")
TIMBER_DARK = hex_rgb("#6e4b31")
# A kiosk's painted wood: the deep teal of the Plaza's shutters (`SHUTTERS[0]` in plaza.ts),
# darkened so the stucco around it stays the brightest thing in the square.
KIOSK = hex_rgb("#2a615c")
KIOSK_DARK = hex_rgb("#1f4a46")
CREAM = hex_rgb("#efe4c9")


def marker(name, at):
    """
    An empty named node at game point `at`: the place and plane of something the game draws at
    runtime (a screen, a poster face). It is linked into the scene, so the exporter writes it as a
    node, but not returned from `build()`, because it has no mesh to bake.
    """
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.2
    empty.location = P(*at)
    bpy.context.scene.collection.objects.link(empty)
    return empty


def tile_slope(part, x0, x1, eave, ridge, tiles, lift=0.05, thickness=0.05, rng=None, slot=0):
    """
    One slope of a barrel-tiled roof: a board deck `thickness` thick from the `eave` (y, z) up to
    the `ridge` (y, z), and on it a corrugated sheet of `tiles` rounded tiles across x0..x1, each a
    trough and a crest `lift` above it, in its own terracotta tone. The deck closes the roof from
    below (the sheet alone would be culled there) and its edge is the eave's thickness.
    """
    rng = rng or part.rng
    (ey, ez), (ry, rz) = eave, ridge
    down = Vector((0, ey - ry, ez - rz))
    length = down.length
    down.normalize()
    normal = Vector((0, -down.z, down.y))
    if normal.y < 0:
        normal = -normal
    side = 1 if ez > rz else -1
    angle = math.atan2(ry - ey, abs(ez - rz))
    centre = Vector((0, (ey + ry) / 2, (ez + rz) / 2)) - normal * (thickness / 2)
    part.box((x1 - x0, thickness, length), at=((x0 + x1) / 2, centre.y, centre.z),
             rot=(side * angle, 0, 0), color=tone(TERRACOTTA[1], rng, 0.04), slot=slot)
    # Profile: per tile a trough and a flat-topped crest, smoothed round by the normals.
    shape = (0.0, 0.85, 0.85)
    count = tiles * len(shape) + 1
    xs = [x0 + (x1 - x0) * i / (count - 1) for i in range(count)]
    heights = [shape[i % len(shape)] * lift + 0.004 for i in range(count)]
    verts = []
    for base in ((0, ry, rz), (0, ey, ez)):
        for x, h in zip(xs, heights):
            verts.append((x, base[1] + normal.y * h, base[2] + normal.z * h))
    faces = [[i, i + 1, count + i + 1, count + i] for i in range(count - 1)]
    colours = [tone(TERRACOTTA[rng.randrange(3)], rng, 0.07) for _ in range(tiles)]

    def paint(centre, _normal):
        index = int((centre.x - x0) / (x1 - x0) * tiles)
        return colours[max(0, min(tiles - 1, index))]

    return part.mesh(verts, faces, color=paint, slot=slot, smooth_angle=80)


def gable(part, x0, x1, y_eave, half_depth, y_ridge, tiles, z=0.0, rng=None, cap=None):
    """Two tile slopes meeting at a ridge along X, with a round ridge cap of half-tiles."""
    rng = rng or part.rng
    for side in (1, -1):
        tile_slope(part, x0, x1, (y_eave, z + side * half_depth), (y_ridge, z), tiles, rng=rng)
    part.prism(6, 0.06, 0.06, x0 - 0.02, x1 + 0.02, at=(0, y_ridge + 0.035, z),
               rot=(0, 0, -math.pi / 2), color=cap or tone(TERRACOTTA[1], rng), smooth_angle=70)


def gable_end(part, x, tri, color, thickness=0.02):
    """
    The board closing one end of a gable under its tiles: the triangle `tri` of three (y, z)
    points, `2 * thickness` thick about the plane at `x`, as a closed wedge so its faces point out.
    """
    verts = [(x + dx, y, z) for dx in (-thickness, thickness) for y, z in tri]
    faces = [[0, 1, 2], [5, 4, 3], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]]
    return part.mesh(verts, faces, color=color)


def stone(rng, dark=False):
    return tone(STONE_DARK if dark else STONE, rng, 0.05)


def painted(rng, base=KIOSK, spread=0.05):
    return tone(base, rng, spread)

