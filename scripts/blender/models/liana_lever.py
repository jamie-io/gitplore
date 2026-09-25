"""
The jungle's seed lever: a gnarled stump with a branch reaching out, and a liana hanging from the
branch with a wooden toggle at its end to pull.

Two nodes, because the liana swings:
  liana-lever   origin at the stump's foot: the root rock, the trunk (up to about 2.4 m) and the
                branch, which runs out along +X to just past the pivot.
  liana-handle  built around the pivot, where the liana hangs from the branch: (0.875, 2.35, 0)
                in the lever's frame, and the node is placed there. The game adopts its geometry
                into the handle group it rotates about Z. The toggle hangs 1.65 m below.
The footprint stays inside the procedural lever's collider (0.42 m round the foot).
"""

import math

from kit import P, Part, hex_rgb, material, mix, mossy, tone

BARK = hex_rgb("#4a3d2c")
BARK_DARK = hex_rgb("#3a3024")
WOOD_LIGHT = hex_rgb("#8a6b45")
ROCK = hex_rgb("#4f5a45")
MOSS = hex_rgb("#4f7a34")
LIANA = hex_rgb("#3f6a38")
LIANA_LIGHT = hex_rgb("#56833f")
LEAF = hex_rgb("#4d7f33")
LEAF_LIGHT = hex_rgb("#6d9a3c")

PIVOT = (0.875, 2.35, 0.0)
DROP = 1.65


def bark(rng, base=BARK):
    """Per-face bark: each face its own shade between the bark and its darker grooves."""
    return lambda centre, normal: tone(mix(base, BARK_DARK, rng.random() * 0.6), rng, 0.05)


def build(seed=41):
    wood = material("lever-wood", roughness=0.92)
    leaf = material("lever-leaf", roughness=0.8, double_sided=True)

    stump = Part("liana-lever", [wood, leaf], seed=seed)
    rng = stump.rng
    # Root rock the stump grows over, mossy on top.
    stump.rock(0.36, at=(0.05, 0.08, -0.04), squash=(1.1, 0.6, 1.0),
               color=mossy(ROCK, MOSS, seed=seed, above=0.55), subdivisions=2, roughness=0.2,
               cuts=3, seed=seed)
    # Trunk: a leaning, tapering log with a slight S-bend.
    trunk = [(0.03 * math.sin(t * 3), 0.05 + t * 2.4, 0.04 * math.sin(t * 2 + 1)) for t in
             [i / 9 for i in range(10)]]
    # Flared at the foot, a burl a third of the way up, narrowing under the branch.
    swell = [1.55, 1.2, 1.02, 1.08, 1.16, 1.0, 0.95, 0.98, 0.9, 0.85]
    stump.tube(trunk, 0.16, sides=8, color=bark(rng), taper=0.78, smooth_angle=50, radii=swell)
    # Roots flaring over the rock.
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        root = [(math.cos(a) * r, y, math.sin(a) * r) for r, y in
                ((0.08, 0.5), (0.2, 0.32), (0.3, 0.2), (0.4, 0.06))]
        stump.tube(root, 0.085, sides=6, color=bark(rng), taper=0.35, smooth_angle=50)
    # A broken top above the branch: a ring of splinters round the snapped end.
    for i in range(5):
        a = i / 5 * math.tau + rng.random() * 0.5
        height = 0.1 + rng.random() * 0.16
        stump.prism(3, 0.045, 0.0, 0.0, height, at=(0.03 + math.cos(a) * 0.07, 2.4, 0.04 + math.sin(a) * 0.07),
                    rot=(math.sin(a) * 0.25, 0, -math.cos(a) * 0.25), color=tone(WOOD_LIGHT, rng))
    stump.prism(8, 0.115, 0.1, 2.36, 2.42, at=(0.03, 0, 0.04), color=tone(WOOD_LIGHT, rng, 0.1))
    # The branch: out and slightly up from the trunk, past the pivot, bending a touch.
    branch = [(0.02 + 1.0 * t, 2.25 + 0.12 * math.sin(t * 2.2), 0.02 * math.sin(t * 4)) for t in
              [i / 6 for i in range(7)]]
    stump.tube(branch, 0.12, sides=7, color=bark(rng), taper=0.55, smooth_angle=50)
    # Moss along the top of the branch and on the trunk's shoulder.
    for x, s in ((0.25, 1.0), (0.55, 0.8)):
        stump.rock(0.1 * s, at=(x, 2.36 + 0.1 * math.sin(x * 2.2), 0.0), squash=(1.8, 0.4, 0.9),
                   color=tone(MOSS, rng), roughness=0.3)
    # A few leaves on twigs at the branch's end and on the trunk.
    for (x, y, z), yaw in (((1.0, 2.38, 0.05), 0.4), ((0.96, 2.4, -0.06), 2.8),
                           ((0.7, 2.42, 0.07), 1.2), ((1.03, 2.36, 0.0), -0.5),
                           ((0.1, 1.9, 0.14), 1.4), ((-0.12, 1.4, -0.1), 4.0), ((0.12, 0.9, -0.1), 5.2)):
        leaf_fan(stump, (x, y, z), yaw, rng, count=4, size=0.22)

    handle = Part("liana-handle", [wood, leaf], seed=seed + 1)
    hrng = handle.rng
    # The liana: two strands twisted round each other from the branch down to the toggle,
    # looped once over the branch at the top.
    loop = [(0.0, 0.11 * math.cos(a) - 0.0, 0.11 * math.sin(a)) for a in
            [math.pi * 0.5 + i / 10 * math.tau for i in range(11)]]
    handle.tube(loop, 0.024, sides=5, color=LIANA, smooth_angle=60)
    for strand in (0, 1):
        points = []
        steps = 14
        for i in range(steps + 1):
            t = i / steps
            a = strand * math.pi + t * 7.5
            r = 0.022 * (1 - t * 0.3)
            points.append((math.cos(a) * r, -0.1 - t * (DROP - 0.16), math.sin(a) * r))
        handle.tube(points, 0.021, sides=5, color=mix(LIANA, LIANA_LIGHT, strand * 0.5),
                    smooth_angle=60)
    # The toggle: a short peeled stick tied across the liana's end.
    handle.prism(7, 0.045, 0.042, -0.19, 0.19, at=(0, -DROP, 0), rot=(math.pi / 2, 0, 0),
                 color=tone(WOOD_LIGHT, hrng), smooth_angle=50)
    handle.rock(0.055, at=(0, -DROP + 0.06, 0), squash=(1, 1.2, 1), color=LIANA, roughness=0.2)
    # Leaves along the liana.
    for i, t in enumerate((0.25, 0.45, 0.62, 0.8)):
        leaf_fan(handle, (0, -0.1 - t * (DROP - 0.3), 0), i * 2.1, hrng, count=2, size=0.12)

    objects = [stump.build(), handle.build()]
    objects[1].location = P(*PIVOT)
    return objects


def leaf_fan(part, at, yaw, rng, count=3, size=0.16):
    """A few pointed leaves fanned from one spot."""
    for i in range(count):
        length = size * (0.8 + rng.random() * 0.4)
        width = length * 0.35
        verts = [(0, 0, 0), (length * 0.45, 0.02, width), (length, -0.03, 0), (length * 0.45, 0.02, -width)]
        part.mesh(verts, [(0, 1, 2, 3)], at=at,
                  rot=(0, yaw + (i - (count - 1) / 2) * 0.7, -0.35 + rng.random() * 0.3),
                  color=mix(LEAF, LEAF_LIGHT, rng.random() * 0.7), slot=1)
