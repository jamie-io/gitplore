"""
The feed wall: a dry-stone wall in the north glade that four feed cards stand against, with the
switch lever that turns Deslopify off and on again beside it.

The wall is 5.6 m wide, 2.6 m tall and 0.5 m deep, centred on the origin and facing +z. A ledge of
flat stones runs along its foot in front, 0.3 m high, and the cards stand on it: four card-frame
models (`card_frame.py`, 2.36 m wide and 3.35 m tall at full size) shrunk to 0.52 so that they
stand side by side 1.3 m apart. Four empties `slot_0` … `slot_3` (left to right) each carry that
placement: the point where a card-frame's own origin (the foot between its posts) stands on the
ledge, and the 0.52 scale. So a card parented to its slot, or given the slot's position and
scale, stands in its place with its face centre at 0.3 + 2.05 × 0.52 ≈ 1.37 m.

Right of the wall (+x, the wall's right seen from the front) a stone pier carries the switch:
node `lever`, built around the hinge and placed at it, so its origin is the hinge at
(3.18, 1.12, 0.02). The pin runs along x, the handle stands straight up at rest, and the game
throws it by turning the node about its x axis. The empty `lever_hinge` marks the same point,
because the optimiser folds a dequantising offset into every mesh node's transform. Two
materials: the stone (the lever's wood and iron are vertex colour on it too) and the leaves.
"""

import math

from mathutils import Vector, noise

from kit import P, Part, empty, hex_rgb, material, mix, mossy, shade, tone

STONE = hex_rgb("#958e7d")
STONE_DARK = hex_rgb("#77705f")
MORTAR = hex_rgb("#3c3a32")
MOSS = hex_rgb("#5b7a3a")
MOSS_DARK = hex_rgb("#3b5a2f")
WOOD = hex_rgb("#6a4a30")
WOOD_DARK = hex_rgb("#4f3622")
IRON = hex_rgb("#3a3a38")
VINE = hex_rgb("#3f5a2a")
LEAF = hex_rgb("#4f7d33")
LEAF_LIGHT = hex_rgb("#77a043")

WIDTH = 5.6
HEIGHT = 2.6
DEPTH = 0.5
LEDGE_TOP = 0.3
LEDGE_FRONT = 0.64
CARD_SCALE = 0.52
CARD_PITCH = 1.3
CARD_Z = 0.44
HINGE = (3.18, 1.12, 0.02)
COURSES = (LEDGE_TOP, 0.78, 1.24, 1.72, 2.12, 2.46)


def build(seed=29):
    stone_mat = material("wall-stone", roughness=0.92)
    leaf_mat = material("wall-leaf", roughness=0.8, double_sided=True)
    wall = Part("feed-wall", [stone_mat, leaf_mat], seed=seed)
    rng = wall.rng
    half = WIDTH / 2

    # A dark core behind the joints, so no chink between two stones shows daylight.
    wall.box((WIDTH - 0.1, HEIGHT - 0.12, DEPTH - 0.16), at=(0, (HEIGHT - 0.12) / 2, 0), color=MORTAR)

    # Footing: long stones the full depth under the courses, and the ledge in front of them.
    lay_course(wall, rng, -half, half, 0.0, LEDGE_TOP, -DEPTH / 2 - 0.02, DEPTH / 2, (1.0, 1.6),
               STONE_DARK, keep=("top", "bottom"), above=0.4)
    lay_course(wall, rng, -half - 0.05, half + 0.05, 0.0, LEDGE_TOP, DEPTH / 2 - 0.02, LEDGE_FRONT,
               (0.9, 1.5), STONE, keep=("top", "bottom", "back"), above=0.9, moss=0.35)

    # The courses: a running bond, every course's joints falling between the ones below.
    for k, (y0, y1) in enumerate(zip(COURSES, COURSES[1:])):
        lay_course(wall, rng, -half, half, y0, y1, -DEPTH / 2, DEPTH / 2, (0.55, 1.2),
                   STONE, offset=k * 0.37, above=0.6)

    # Coping: flat capstones overhanging both faces, green on top.
    lay_course(wall, rng, -half - 0.06, half + 0.06, COURSES[-1], HEIGHT, -DEPTH / 2 - 0.06,
               DEPTH / 2 + 0.06, (0.8, 1.3), STONE_DARK, keep=("bottom",), above=0.3, moss=1.0)
    for x in (-2.3, -1.1, 0.4, 1.6, 2.5):
        s = 0.8 + rng.random() * 0.5
        wall.slab((0.5 * s, 0.1, 0.36 * s), at=(x + (rng.random() - 0.5) * 0.3, HEIGHT + 0.02, (rng.random() - 0.5) * 0.2),
                  rot=(0, rng.random() * 3, 0), color=tone(mix(MOSS, MOSS_DARK, rng.random() * 0.6), rng),
                  chamfer=0.45, jitter=0.02)

    # The pier the switch stands on, right of the wall, with two cheek stones holding the pin.
    px = HINGE[0]
    wall.slab((0.56, HINGE[1] - 0.06, 0.52), at=(px, (HINGE[1] - 0.06) / 2, 0.0),
              color=mossy(tone(STONE_DARK, rng), MOSS, seed=seed, above=0.55), chamfer=0.25,
              jitter=0.02, keep=("bottom",))
    for side in (-1, 1):
        wall.slab((0.1, 0.3, 0.26), at=(px + side * 0.13, HINGE[1] + 0.06, HINGE[2]),
                  color=tone(STONE, rng), chamfer=0.25, jitter=0.01, keep=("bottom",))
    wall.prism(6, 0.025, 0.025, -0.2, 0.2, at=HINGE, rot=(0, 0, -math.pi / 2), color=IRON)

    # Vines trailing from the coping down the face, between the cards and at the ends.
    for x, length in ((-2.62, 1.9), (-0.66, 0.55), (0.62, 0.45), (1.98, 0.6), (2.64, 1.6)):
        trail(wall, rng, x, length)

    # Grime: the stone darkens and greens toward the ground, where the damp is, and in streaks
    # where rain runs off the coping.
    layer = wall.bm.loops.layers.color["Col"]
    for face in wall.bm.faces:
        if face.material_index != 0:
            continue
        for loop in face.loops:
            co = loop.vert.co
            t = max(0.0, 1 - co.z / 1.2)
            streak = max(0.0, noise.noise(Vector((co.x * 2.3, 0.5, 0.0)))) * 0.5 * min(1.0, co.z / HEIGHT + 0.3)
            r, g, b, a = loop[layer]
            dark = (1 - 0.22 * t) * (1 - 0.3 * streak)
            loop[layer] = (r * dark * (1 - 0.1 * t - 0.1 * streak), g * dark, b * dark * (1 - 0.14 * t - 0.15 * streak), a)

    objects = [wall.build(), lever(stone_mat, seed + 1)]
    objects[1].location = P(*HINGE)
    objects.append(empty("lever_hinge", at=HINGE))
    for i in range(4):
        x = (i - 1.5) * CARD_PITCH
        objects.append(empty(f"slot_{i}", at=(x, LEDGE_TOP, CARD_Z), scale=CARD_SCALE))
    return objects


def lay_course(part, rng, x0, x1, y0, y1, z0, z1, lengths, colour, offset=0.0, keep=(),
               above=0.6, moss=0.8, knock=0.5):
    """One course of stones from x0 to x1, each its own length from `lengths`, with thin joints."""
    joint = 0.022
    x = x0
    first = True
    while x < x1 - 0.05:
        length = lengths[0] + rng.random() * (lengths[1] - lengths[0])
        if first and offset:
            length = max(0.3, (offset % lengths[1]) + 0.25)
        first = False
        if x1 - (x + length) < lengths[0] * 0.6:
            length = x1 - x
        sx = length - joint
        sy = y1 - y0 - joint * (0 if "bottom" in keep else 1)
        sz = z1 - z0 + (rng.random() - 0.5) * 0.04
        cx = x + length / 2
        cy = y0 + (y1 - y0) / 2 + (0 if "bottom" in keep else joint / 2)
        # Old stones weather apart: some darker, some greener, no two alike.
        base = tone(colour, rng, 0.16)
        roll = rng.random()
        if roll < 0.2:
            base = mix(base, STONE_DARK, 0.6)
        elif roll < 0.35:
            base = mix(base, MOSS_DARK, 0.3)
        part.slab((sx, sy, sz), at=(cx, cy, (z0 + z1) / 2 + (rng.random() - 0.5) * 0.03),
                  rot=(0, (rng.random() - 0.5) * 0.03, (rng.random() - 0.5) * 0.02),
                  color=mossy(base, mix(MOSS, MOSS_DARK, rng.random() * 0.5), seed=cx * 3 + cy,
                              above=above, scale=2.2, amount=moss),
                  chamfer=0.24, jitter=0.02, keep=keep, knock=knock)
        x += length


def trail(part, rng, x, length):
    y0 = HEIGHT - 0.02
    z0 = DEPTH / 2 + 0.07
    steps = 8
    points = []
    for i in range(steps + 1):
        t = i / steps
        points.append((x + math.sin(t * 2.6 + x) * 0.07, y0 - t * length, z0 + math.sin(t * math.pi) * 0.03))
    part.tube(points, 0.02, sides=3, color=VINE, taper=0.5, smooth_angle=70)
    leaves = max(3, int(length / 0.13))
    for i in range(leaves):
        t = (i + 0.5) / leaves
        px, py, pz = points[min(int(t * steps + 0.5), steps)]
        side = 1 if i % 2 == 0 else -1
        size = 0.14 * (1 - t * 0.35) * (0.8 + rng.random() * 0.4)
        part.mesh(
            [(0, 0, 0), (size * 0.45, -size * 0.1, size * 0.25), (size * 1.1, -size * 0.35, size * 0.1),
             (size * 0.45, -size * 0.5, -size * 0.05)],
            [(0, 1, 2), (0, 2, 3)],
            at=(px, py, pz + 0.02), rot=(0, 0, side * 0.4 + (math.pi if side < 0 else 0)),
            color=mix(LEAF, LEAF_LIGHT, rng.random() * 0.6), slot=1,
        )


def lever(material_, seed):
    """The switch, built round its hinge: an iron collar on the pin, a wooden handle, a grip."""
    part = Part("lever", [material_], seed=seed)
    rng = part.rng
    part.prism(6, 0.06, 0.06, -0.075, 0.075, rot=(0, 0, -math.pi / 2), color=IRON)
    part.box((0.09, 0.16, 0.09), at=(0, 0.08, 0), color=shade(IRON, 1.2), bevel=0.01)
    part.prism(6, 0.036, 0.03, 0.12, 0.86, color=tone(WOOD, rng), twist=0.3, smooth_angle=60)
    part.prism(6, 0.05, 0.045, 0.72, 0.9, color=tone(WOOD_DARK, rng), twist=0.1)
    part.prism(6, 0.045, 0.02, 0.9, 0.95, color=tone(WOOD_DARK, rng))
    return part.build()
