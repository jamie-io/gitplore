"""
The exhibit's easel: a timber frame the project's screen stands in, in the glade north of the arch.

The game keeps its `ScreenLandmark` (a 3.4 × 2.2 m body centred 1.9 m up, on a post) and stands
this frame round it: two adzed log uprights and two rails leave a clear opening of 3.4 × 2.4 m
centred at (0, 1.9, 0), marked by the empty `screen_anchor`, facing +z. Two back legs lean the
frame into an A like a painter's easel, rope lashes the joints, and stones hold the feet. The
bottom rail stands in front of the screen's post; nothing rises above 3.4 m, where the screen's
label hangs. A creeper with a few leaves climbs one upright. Two materials: the wood and the leaves.
"""

import math

from kit import Part, empty, hex_rgb, material, mix, mossy, tone

WOOD_TONES = [hex_rgb(h) for h in ("#6a4a30", "#5a3d27", "#70523a", "#4f3622", "#634630")]
WOOD_LIGHT = hex_rgb("#8a6b45")
ROPE = hex_rgb("#a88a5a")
STONE = hex_rgb("#7a7467")
MOSS = hex_rgb("#4f7033")
VINE = hex_rgb("#3f5a2a")
LEAF = hex_rgb("#4f7d33")
LEAF_LIGHT = hex_rgb("#77a043")

OPEN_W = 3.4
OPEN_H = 2.4
CENTRE_Y = 1.9
POST_R = 0.1
POST_X = OPEN_W / 2 + POST_R
RAIL_R = 0.085
TOP_Y = CENTRE_Y + OPEN_H / 2 + RAIL_R
BOTTOM_Y = CENTRE_Y - OPEN_H / 2 - RAIL_R
BOTTOM_Z = 0.21  # in front of the screen's post (0.16 m round)
POST_TOP = 3.38
LEG_FOOT_Z = -1.35


def build(seed=23):
    wood = material("easel-wood", roughness=0.88)
    leaf = material("easel-leaf", roughness=0.8, double_sided=True)
    part = Part("exhibit-easel", [wood, leaf], seed=seed)
    rng = part.rng

    # Uprights: seven-sided logs, each capped with a short cone where the top was trimmed.
    for side in (-1, 1):
        x = side * POST_X
        part.prism(7, POST_R * 1.08, POST_R * 0.92, -0.1, POST_TOP, at=(x, 0, 0),
                   color=tone(WOOD_TONES[3], rng), smooth_angle=55, twist=rng.random())
        part.prism(7, POST_R * 0.92, POST_R * 0.35, POST_TOP, POST_TOP + 0.07, at=(x, 0, 0),
                   color=tone(WOOD_LIGHT, rng, 0.1), twist=rng.random())

    # Rails: the top one through the uprights, the bottom one a ledge in front of them.
    for y, z, r, reach in ((TOP_Y, 0.0, RAIL_R, 0.36), (BOTTOM_Y, BOTTOM_Z, RAIL_R * 1.05, 0.3)):
        half = POST_X + reach
        part.prism(7, r, r * 0.9, -half, half, at=(0, y, z), rot=(0, 0, -math.pi / 2),
                   color=mossy(tone(WOOD_TONES[0], rng), MOSS, seed=int(y * 10), above=0.75, amount=0.6),
                   smooth_angle=55, twist=rng.random())
    # Short blocks under the ledge rail's ends, pegged to the uprights' fronts.
    for side in (-1, 1):
        part.box((0.12, 0.2, 0.14), at=(side * POST_X, BOTTOM_Y - 0.12, BOTTOM_Z - 0.09),
                 color=tone(WOOD_TONES[1], rng), bevel=0.01)

    # Back legs from high on each upright down and back to the ground, and a stretcher across.
    top = (0.0, POST_TOP - 0.4, -0.12)
    for side in (-1, 1):
        x = side * (POST_X - 0.02)
        foot = (x + side * 0.15, -0.08, LEG_FOOT_Z)
        start = (x, top[1], top[2])
        length = math.dist(start, foot)
        tilt = math.atan2(start[2] - foot[2], start[1] - foot[1])
        lean = math.atan2(foot[0] - start[0], start[1] - foot[1])
        part.prism(6, 0.07, 0.06, 0, length, at=foot, rot=(tilt, 0, lean),
                   color=tone(WOOD_TONES[4], rng), smooth_angle=55, twist=rng.random())
    t = 0.72  # the stretcher's place down the legs, from the top
    sy = top[1] + (-0.08 - top[1]) * t
    sz = top[2] + (LEG_FOOT_Z - top[2]) * t
    sx = POST_X - 0.02 + 0.15 * t
    part.prism(6, 0.055, 0.05, -sx - 0.12, sx + 0.12, at=(0, sy, sz), rot=(0, 0, -math.pi / 2),
               color=tone(WOOD_TONES[2], rng), smooth_angle=55, twist=rng.random())

    # Rope lashings: two crossed turns where each rail meets each upright, one where each leg does.
    for side in (-1, 1):
        x = side * POST_X
        lash(part, rng, (x, TOP_Y, 0.0), 0.14)
        lash(part, rng, (x, BOTTOM_Y, BOTTOM_Z * 0.5), 0.15, turns=1)
        lash(part, rng, (x, top[1], top[2] * 0.5), 0.13, turns=1)

    # Stones packed round the feet.
    for side in (-1, 1):
        for fx, fz, count in ((side * POST_X, 0.0, 3), (side * (POST_X + 0.15), LEG_FOOT_Z, 1)):
            for k in range(count):
                a = k / count * math.tau + rng.random()
                r = 0.16 + rng.random() * 0.05
                size = 0.13 + rng.random() * 0.07
                part.slab((size * 1.3, size * 0.7, size), at=(fx + math.cos(a) * r, size * 0.2, fz + math.sin(a) * r),
                          rot=(0, rng.random() * math.pi, 0),
                          color=mossy(tone(mix(STONE, MOSS, rng.random() * 0.3), rng), MOSS,
                                      seed=k + side * 5, above=0.5, amount=0.8),
                          chamfer=0.35, jitter=0.015)

    # A creeper has found the left upright and climbs it to the top rail.
    creeper(part, rng, -POST_X)

    easel = part.build()
    anchor = empty("screen_anchor", at=(0, CENTRE_Y, 0))
    return [easel, anchor]


def creeper(part, rng, x):
    points = []
    steps = 10
    for i in range(steps + 1):
        t = i / steps
        a = t * 5.5 + 0.8
        r = POST_R + 0.025
        points.append((x + math.cos(a) * r, 0.02 + t * (TOP_Y - 0.1), math.sin(a) * r))
    part.tube(points, 0.018, sides=3, color=VINE, taper=0.6, smooth_angle=70)
    for i in range(16):
        t = (i + 0.5) / 16
        px, py, pz = points[min(int(t * steps + 0.5), steps)]
        a = t * 5.5 + 0.8 + (0.5 if i % 2 else -0.5)
        size = 0.2 * (1.1 - t * 0.5) * (0.8 + rng.random() * 0.4)
        out = (math.cos(a), math.sin(a))
        # A leaf: a bent diamond held out from the stem, tipped a little down.
        tip = (px + out[0] * size * 1.2, py - size * 0.3, pz + out[1] * size * 1.2)
        left = (px + out[0] * size * 0.55 - out[1] * size * 0.35, py + size * 0.05, pz + out[1] * size * 0.55 + out[0] * size * 0.35)
        right = (px + out[0] * size * 0.55 + out[1] * size * 0.35, py - size * 0.12, pz + out[1] * size * 0.55 - out[0] * size * 0.35)
        part.mesh([(px, py, pz), left, tip, right], [(0, 1, 2), (0, 2, 3)],
                  color=mix(LEAF, LEAF_LIGHT, rng.random() * 0.7), slot=1)


def lash(part, rng, at, radius, turns=2):
    x, y, z = at
    for k in range(turns):
        tilt = 0.7 if k == 0 else -0.7
        loop = []
        for i in range(6):
            a = i / 5 * math.tau
            lx = math.cos(a) * radius
            lz = math.sin(a) * radius * 0.95
            loop.append((x + lx * 0.55, y + lx * tilt, z + lz))
        part.tube(loop, 0.02, sides=3, color=tone(ROPE, rng, 0.06))
