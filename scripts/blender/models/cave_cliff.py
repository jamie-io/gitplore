"""
The cave cliff: the north wall of the clearing, the biggest thing in the world and the backdrop
the portal looks at over 40 m, with the waterfall's notch in its middle and the cave behind the
falls.

The model's frame is the world's height and the cliff's own line: y = 0 is the water level (the
game stands the model at y 0), the face runs along x about z = 0 (the game's `CLIFF.z`, −19.8 m)
and faces +z, curving forward towards its ends the way the bowl does, 30 m wide and 9 m tall.
It is built of seven strata of split stone slabs, each course a little behind the one below it,
with moss on the ledges and the tops. In the middle:

- the notch, x −1.1 … 1.1 from 4.4 m up to the top, cut back to z = −1.0, down which the falls pour;
- the cave under it, 2.8 m wide inside (x −1.4 … 1.4), 2.6 m tall (from its floor at y 0.4 to a
  flat ceiling at 3.0) and 3.2 m deep (to its back wall at z −3.4), its mouth splayed wide at the
  face so the path can slip in behind the falls from either side.

Three nodes: `cliff` (the stone and its vines; two materials), `cave_floor` (the walkable floor,
a flat top at y 0.4 from the mouth at z 0.5 to the back wall) and `collider`, which the game
hides: eleven closed axis-aligned boxes, one for each stretch of the face either side, the cave's
jambs and its back wall, and none over the cave, so each box's footprint is a wall and the cave
stays open.
"""

import math

from mathutils import Vector, noise

from kit import Part, hex_rgb, material, mix, mossy, shade, tone, unbaked

ROCK_BANDS = [hex_rgb(h) for h in ("#6a655a", "#7f786a", "#736d60", "#857d6a", "#666157", "#7a7363", "#706a5e")]
ROCK_DARK = hex_rgb("#3a3a33")
WET = hex_rgb("#4a4d42")
MOSS = hex_rgb("#5b7a3a")
MOSS_DARK = hex_rgb("#3b5a2f")
VINE = hex_rgb("#3f5a2a")
LEAF = hex_rgb("#4f7d33")
LEAF_LIGHT = hex_rgb("#77a043")

HALF = 15.5
TOP = 9.0
BACK = -4.8
ROWS = (-1.0, 0.4, 1.9, 3.0, 4.4, 6.2, 7.4, TOP)
CAVE_X = 1.4
CAVE_FLOOR = 0.4
CAVE_TOP = 3.0
CAVE_BACK = -3.4
NOTCH_X = 1.1
NOTCH_Z = -1.0
NOTCH_FROM = 4.4
JAMB_X = 2.3  # the mouth's half width at the face
JOINT = 0.05


def face_z(x):
    """The face's line: straight across the middle, coming forward 1.9 m at the ends."""
    return 0.0085 * x * x


def build(seed=37):
    rock_mat = material("cliff-rock", roughness=0.95)
    leaf_mat = material("cliff-leaf", roughness=0.8, double_sided=True)
    cliff = Part("cliff", [rock_mat, leaf_mat], seed=seed)
    rng = cliff.rng

    # A dark core behind the strata, so no joint between two slabs shows daylight.
    for x0, x1 in ((-HALF + 0.3, -CAVE_X - 0.4), (CAVE_X + 0.4, HALF - 0.3)):
        cliff.box((x1 - x0, TOP - 0.8 - ROWS[0], -1.2 - BACK), at=((x0 + x1) / 2, (TOP - 0.8 + ROWS[0]) / 2, (BACK - 1.2) / 2),
                  color=ROCK_DARK)
    cliff.box((2 * CAVE_X + 1.0, TOP - 0.8 - CAVE_TOP, NOTCH_Z - 0.3 - BACK),
              at=(0, (TOP - 0.8 + CAVE_TOP) / 2, (BACK + NOTCH_Z - 0.3) / 2), color=ROCK_DARK)

    # The strata.
    for r, (y0, y1) in enumerate(zip(ROWS, ROWS[1:])):
        band = ROCK_BANDS[r % len(ROCK_BANDS)]
        if r == 0:
            spans = [(-HALF, HALF, None)]
        elif y0 < CAVE_TOP:
            # Beside the cave the strata stop at the mouth's splay; the jambs take over.
            spans = [(-HALF, -(JAMB_X + 0.6), "right"), (JAMB_X + 0.6, HALF, "left")]
        elif y0 < NOTCH_FROM:
            spans = [(-HALF, -(JAMB_X + 0.5), "right"), (JAMB_X + 0.5, HALF, "left")]
        else:
            # The notch widens as it climbs: a cleft the water has cut, with ragged sides.
            w = NOTCH_X + 0.25 + 0.35 * (r - 4)
            spans = [(-HALF, -w, "ragged-right"), (w, HALF, "ragged-left")]
        for x0, x1, edge in spans:
            course(cliff, rng, x0, x1, y0, y1, recede(y0 + 0.01), band, edge, seed + r * 31,
                   top=y1 >= TOP, bottom=r == 0)

    # Buttresses: great split masses standing out of the strata and breaking their lines, never
    # low down near the mouth, where the path runs.
    for x, y0, h, w in ((-12.6, 2.2, 4.6, 2.6), (-8.4, 0.9, 3.6, 2.2), (-5.2, 4.6, 3.4, 2.0),
                        (5.0, 4.8, 3.6, 2.2), (8.8, 1.2, 4.4, 2.6), (12.9, 3.6, 4.2, 2.4)):
        front = face_z(x) + recede(y0 + h / 2) + 0.5 + rng.random() * 0.4
        cliff.slab((w, h, 3.0), at=(x, y0 + h / 2, front - 1.5),
                   rot=((rng.random() - 0.5) * 0.16, -math.atan(0.017 * x) + (rng.random() - 0.5) * 0.3,
                        (rng.random() - 0.5) * 0.2),
                   color=mossy(tone(ROCK_BANDS[rng.randrange(7)], rng), MOSS, seed=x * 2, above=0.5,
                               scale=0.8),
                   chamfer=0.5, jitter=0.25, knock=0.9)

    # The mouth: wedges splaying from the face in to the cave's walls, the walls behind them,
    # shoulders rounding its upper corners so it reads as a cave and not a door, the lintel, and
    # the back wall.
    for side in (-1, 1):
        s = side
        for y0, y1 in ((CAVE_FLOOR - 0.3, 1.8), (1.8 - JOINT, CAVE_TOP + 0.05)):
            points = []
            for y in (y0, y1):
                j = (rng.random() - 0.5) * 0.25
                points += [
                    (s * CAVE_X, y, -0.8 + j),
                    (s * (JAMB_X + 0.05), y, 0.15 + j * 0.5),
                    (s * (JAMB_X + 0.6), y, 0.1),
                    (s * (JAMB_X + 0.6), y, -1.0),
                    (s * (CAVE_X + 0.05), y, -1.0),
                ]
            cliff.hull(points, color=mossy(tone(ROCK_BANDS[1], rng), MOSS, seed=side * 7 + y0, above=0.6))
            cliff.slab((1.5, y1 - y0 - JOINT, -1.0 - (CAVE_BACK - 0.8)),
                       at=(s * (CAVE_X + 0.75), (y0 + y1) / 2, (CAVE_BACK - 0.8 - 1.0) / 2),
                       color=tone(ROCK_BANDS[2], rng), keep=("left",) if side > 0 else ("right",),
                       chamfer=0.2, jitter=0.03)
        j = [(rng.random() - 0.5) * 0.2 for _ in range(4)]
        cliff.hull([
            (s * 0.8, CAVE_TOP + 0.15, 0.3 + j[0]), (s * 0.8, CAVE_TOP + 0.15, -0.8),
            (s * (CAVE_X + 0.05), 1.95 + j[1], 0.2), (s * (CAVE_X + 0.05), 2.05, -0.8),
            (s * 2.9, 1.9, 0.25 + j[2]), (s * 2.9, 1.9, -1.0),
            (s * 0.9, 3.8, 0.35 + j[3]), (s * 0.9, 3.8, -1.0),
            (s * 2.9, 3.9, 0.3), (s * 2.9, 3.9, -1.0),
        ], color=mossy(tone(ROCK_BANDS[3], rng), MOSS_DARK, seed=side * 3, above=0.5))
    cliff.slab((2 * JAMB_X + 1.0, NOTCH_FROM - 3.1 - JOINT, 0.1 - BACK),
               at=(0, (3.1 + NOTCH_FROM) / 2, (0.1 + BACK) / 2),
               color=mossy(tone(ROCK_BANDS[3], rng), MOSS_DARK, seed=3, above=0.5),
               chamfer=0.5, jitter=0.1, knock=0.9)
    cliff.slab((2 * CAVE_X + 0.4, CAVE_TOP - CAVE_FLOOR + 0.3, 1.2),
               at=(0, (CAVE_TOP + CAVE_FLOOR) / 2, CAVE_BACK - 0.6), color=tone(ROCK_BANDS[0], rng),
               keep=("front",), chamfer=0.2, jitter=0.03)

    # The back of the notch: water-dark stone, stepping back as it climbs, green at the edges.
    for k, (y0, y1) in enumerate(((NOTCH_FROM, 5.9), (5.9, 7.5), (7.5, TOP - 0.1))):
        w = NOTCH_X + 0.25 + 0.35 * (k + 0.5) + 0.35
        front = NOTCH_Z - 0.2 * k + (rng.random() - 0.5) * 0.2
        cliff.slab((2 * w, y1 - y0 - JOINT, front - BACK), at=(0, (y0 + y1) / 2, (front + BACK) / 2),
                   rot=((rng.random() - 0.5) * 0.08, (rng.random() - 0.5) * 0.08, 0),
                   color=mossy(tone(WET, rng), MOSS_DARK, seed=11 + y0, above=0.5, amount=0.7),
                   chamfer=0.4, jitter=0.12, knock=0.8)

    # Scree and fallen blocks along the foot, clear of the mouth and the path round the falls.
    for x, s in ((-13.2, 1.2), (-10.4, 0.8), (-7.6, 1.05), (-5.2, 0.7), (5.4, 0.85), (7.9, 1.15),
                 (10.8, 0.75), (13.4, 1.1)):
        cliff.rock(0.9 * s, at=(x, 0.1 * s, face_z(x) + 0.55 * s), squash=(1.3, 0.75, 1.0),
                   rot=(0, rng.random() * 3, 0),
                   color=mossy(tone(ROCK_BANDS[rng.randrange(7)], rng), MOSS, seed=x, above=0.5),
                   subdivisions=1, roughness=0.2, cuts=3, flat=0.55, seed=int(abs(x) * 10))

    # Moss cushions on the ledges, where the strata step back.
    for k in range(18):
        x = (rng.random() - 0.5) * 2 * (HALF - 1)
        if abs(x) < NOTCH_X + 0.8:
            continue
        r = 2 + rng.randrange(len(ROWS) - 3)
        y = ROWS[r]
        z = face_z(x) - 0.22 * max(0, r - 1) + 0.05
        size = 0.5 + rng.random() * 0.7
        cliff.slab((size * 1.8, 0.14, size * 0.7), at=(x, y + 0.03, z), rot=(0, (rng.random() - 0.5) * 0.4, 0),
                   color=tone(mix(MOSS, MOSS_DARK, rng.random() * 0.6), rng), chamfer=0.5, jitter=0.03,
                   knock=0.5)

    # Vines hanging off the ledges, and the long ones framing the falls.
    for x, y, length in ((-2.3, TOP - 0.2, 5.4), (2.1, TOP - 0.3, 4.6), (-1.6, 7.4, 3.2), (-6.3, 7.4, 3.4),
                         (5.8, 7.4, 3.8), (6.6, 6.2, 2.4), (-10.5, 6.2, 2.9), (-11.3, 7.4, 3.6),
                         (9.6, 6.2, 3.1), (-3.6, 4.4, 1.6), (3.6, 4.4, 1.2), (12.4, 7.4, 2.4),
                         (-7.7, 4.4, 2.0), (10.8, 4.4, 1.8)):
        hang(cliff, rng, x, y, length)

    shade_cliff(cliff)

    floor = Part("cave_floor", [rock_mat], seed=seed + 1)
    floor.slab((2 * CAVE_X + 0.5, 0.6, 0.5 - CAVE_BACK + 0.3), at=(0, CAVE_FLOOR - 0.3, (0.5 + CAVE_BACK - 0.3) / 2),
               color=mossy(tone(ROCK_BANDS[5], floor.rng), MOSS, seed=5, above=0.6, amount=0.5),
               keep=("top",), chamfer=0.25, jitter=0.03)
    shade_cliff(floor)

    return [cliff.build(), floor.build(), collider(rock_mat)]


def recede(y):
    """How far the strata at height `y` stand back from the foot's line: a little more each course."""
    row = sum(1 for top in ROWS[1:] if top <= y)
    return -0.22 * max(0, row - 1)


def course(part, rng, x0, x1, y0, y1, recede, band, pinned, seed, top=False, bottom=False):
    """
    One stratum from x0 to x1: split slabs 2.4–5.6 m long following the face, each standing a
    little in or out, leaning a little, and reaching a little into the strata above and below,
    so the courses read as rock that has weathered apart rather than as masonry. The top course
    breaks the skyline. `pinned` names the end that meets the cave's mouth ('right' or 'left'),
    which stays flat and exactly in place, or the notch ('ragged-right', 'ragged-left'), which
    only holds still.
    """
    x = x0
    while x < x1 - 0.1:
        length = 2.4 + rng.random() * 3.2
        if x1 - (x + length) < 1.8:
            length = x1 - x
        cx = x + length / 2
        inner = min(abs(x), abs(x + length))
        side = pinned.split("-")[-1] if pinned else None
        edge = bool(side) and ((side == "right" and abs(x + length - x1) < 1e-6) or
                               (side == "left" and abs(x - x0) < 1e-6))
        keep = (side,) if edge and not pinned.startswith("ragged") else ()
        out = (rng.random() - 0.4) * 0.9
        if inner < CAVE_X + 2.6 and y0 < CAVE_TOP:
            out = min(out, -0.1)  # keep the way round the falls clear
        front = face_z(cx) + recede + out
        lo = y0 - (0.0 if bottom or keep else rng.random() * 0.2)
        hi = y1 + (0.0 if keep else rng.random() * 0.3)
        if top:
            hi = TOP + (rng.random() - 0.35) * 1.4
        calm = 0.15 if edge else 1.0
        yaw = -math.atan(0.017 * cx) * (0 if edge else 1) + (rng.random() - 0.5) * 0.22 * calm
        tilt = (rng.random() - 0.5) * 0.14 * calm
        roll = (rng.random() - 0.5) * 0.08 * calm
        colour = mossy(shade(tone(band, rng, 0.12), 1 + (rng.random() - 0.5) * 0.14),
                       mix(MOSS, MOSS_DARK, rng.random() * 0.5), seed=seed + cx, above=0.55,
                       scale=0.7, amount=0.95)
        part.slab((length - JOINT, hi - lo - JOINT, front - BACK), at=(cx, (lo + hi) / 2, (front + BACK) / 2),
                  rot=(tilt, yaw, roll), color=colour, keep=keep, chamfer=0.55,
                  jitter=0.06 if keep else (0.12 if edge else 0.2), knock=0.85)
        x += length


def hang(part, rng, x, y, length):
    z0 = face_z(x) + recede(y - 0.01) + 0.4
    steps = 8
    points = []
    for i in range(steps + 1):
        t = i / steps
        points.append((x + math.sin(t * 2.2 + x) * 0.15, y - t * length, z0 + 0.1 + math.sin(t * math.pi) * 0.12))
    part.tube(points, 0.06, sides=3, color=VINE, taper=0.5, smooth_angle=70)
    leaves = int(length / 0.26)
    for i in range(leaves):
        t = (i + 0.5) / leaves
        px, py, pz = points[min(int(t * steps + 0.5), steps)]
        side = 1 if i % 2 == 0 else -1
        size = 0.5 * (1 - t * 0.35) * (0.8 + rng.random() * 0.4)
        part.mesh(
            [(0, 0, 0), (size * 0.45, -size * 0.1, size * 0.25), (size * 1.1, -size * 0.35, size * 0.1),
             (size * 0.45, -size * 0.5, -size * 0.05)],
            [(0, 1, 2), (0, 2, 3)],
            at=(px, py, pz + 0.03), rot=(0, 0, side * 0.4 + (math.pi if side < 0 else 0)),
            color=mix(LEAF, LEAF_LIGHT, rng.random() * 0.6), slot=1,
        )


def shade_cliff(part):
    """
    Darkens the stone where the light does not reach and the water does: deep in the cave (so the
    mouth reads as a dark opening from across the clearing), down the notch the falls wet, and
    towards the foot, where the damp is.
    """
    layer = part.bm.loops.layers.color["Col"]
    for face in part.bm.faces:
        if face.material_index != 0:
            continue
        for loop in face.loops:
            co = loop.vert.co
            x, y, z = co.x, co.z, -co.y
            factor = 1.0
            green = 0.0
            if abs(x) < CAVE_X + 0.5 and y < CAVE_TOP + 0.2 and z < 0.3:
                inside = min(1.0, max(0.0, (0.3 - z) / 3.4))
                factor *= 0.62 - 0.4 * inside
            if abs(x) < NOTCH_X + 0.6 and y > CAVE_TOP:
                factor *= 0.8
                green = 0.2
            # Spray from the falls darkens and greens the rock round the mouth.
            spray = max(0.0, 1 - math.hypot(x, y - 2.0) / 4.5) if z > -1.2 else 0.0
            factor *= 1 - 0.3 * spray
            green = max(green, 0.3 * spray)
            foot = max(0.0, 1 - (y - ROWS[0]) / 2.2)
            factor *= 1 - 0.22 * foot
            streak = max(0.0, noise.noise(Vector((x * 0.9, 0.3, 0.0)))) * min(1.0, y / TOP + 0.2)
            factor *= 1 - 0.25 * streak
            r, g, b, a = loop[layer]
            loop[layer] = (r * factor * (1 - green * 0.5), g * factor, b * factor * (1 - green * 0.6), a)


def collider(mat):
    """The walls' footprints as closed boxes the game hides: the face either side, jambs, back."""
    part = Part("collider", [mat])
    boxes = [(-CAVE_X - 1.0, CAVE_X + 1.0, BACK, CAVE_BACK)]
    stretches = [(CAVE_X, JAMB_X, -0.15), (JAMB_X, 5.0, None), (5.0, 8.5, None), (8.5, 12.0, None),
                 (12.0, HALF, None)]
    for side in (-1, 1):
        for a, b, front in stretches:
            if front is None:
                front = face_z((a + b) / 2) + (0.3 if a >= 5.0 else 0.0)
            x0, x1 = sorted((side * a, side * b))
            boxes.append((x0, x1, BACK, front))
    for x0, x1, z0, z1 in boxes:
        part.box((x1 - x0, TOP + 1.0, z1 - z0), at=((x0 + x1) / 2, (TOP - 1.0) / 2, (z0 + z1) / 2),
                 color=(0.5, 0.5, 0.5))
    return unbaked(part.build())
