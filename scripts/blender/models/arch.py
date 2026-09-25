"""
The Deslopify arch: the hub portal's frame and the gate across the jungle bridge.

Footprint as before (pillars at x = ±1.4 m, a pillar's reach under 0.38 m), and nothing above
4.8 m, where the hub portal's label hangs. Two pillars of hand-cut drums on plinths carry a round
arch of eleven voussoirs; a line of amber inlay runs round both faces with a diamond on the
keystone, the glow the flow turns up when Deslopify switches on. Moss sits on the tops and ledges
and a few vines hang down the haunches, clear of the walkway.
"""

import math

from kit import Part, hex_rgb, material, mix, mossy, shade, tone

STONE = hex_rgb("#a39c8b")
STONE_DARK = hex_rgb("#80796b")
MOSS = hex_rgb("#5b7a3a")
MOSS_DARK = hex_rgb("#3b5a2f")
VINE = hex_rgb("#3f5a2a")
LEAF = hex_rgb("#4f7d33")
LEAF_LIGHT = hex_rgb("#77a043")
AMBER = "#e0a13c"

PILLAR_X = 1.4
DRUM = 0.6  # a drum's width; the collider reaches 0.38 m from the pillar's centre
SPRING = 2.85  # where the arch springs from the imposts
R_IN = PILLAR_X - DRUM / 2 - 0.0  # the intrados meets the pillars' inner faces
R_OUT = PILLAR_X + DRUM / 2
DEPTH = 0.62
VOUSSOIRS = 11


def build(seed=7):
    stone_mat = material("arch-stone", roughness=0.92)
    leaf_mat = material("arch-leaf", roughness=0.8, double_sided=True)
    glow_mat = material(
        "arch-glow", roughness=0.4, vertex=False, base=hex_rgb("#6b4712"), emissive=AMBER,
        strength=1.0,
    )
    arch = Part("arch", [stone_mat, leaf_mat, glow_mat], seed=seed)
    rng = arch.rng

    for side in (-1, 1):
        x = side * PILLAR_X
        # Plinth, drums, impost.
        arch.box((0.94, 0.3, 0.9), at=(x, 0.15, 0), color=mossy(tone(STONE_DARK, rng), MOSS_DARK, seed=side, above=0.35),
                 bevel=0.05, jitter=0.012)
        y = 0.3
        top = SPRING - 0.22
        drums = 5
        for i in range(drums):
            h = (top - 0.3) / drums
            width = DRUM + (0.05 if i % 2 == 0 else 0.0)
            arch.box(
                (width, h - 0.018, DEPTH + (0.04 if i % 2 == 0 else 0)),
                at=(x + (rng.random() - 0.5) * 0.02, y + h / 2, 0),
                rot=(0, (rng.random() - 0.5) * 0.08, 0),
                color=mossy(tone(STONE, rng, 0.1), MOSS, seed=side * 10 + i, above=0.62),
                bevel=0.04, jitter=0.012,
            )
            y += h
        arch.box((0.8, 0.22, 0.8), at=(x, SPRING - 0.11, 0),
                 color=mossy(tone(STONE_DARK, rng), MOSS, seed=side * 3, above=0.4),
                 bevel=0.035, jitter=0.01)

    # Voussoirs: wedges round the half circle, the keystone a little proud and deeper.
    gap = 0.012
    step = math.pi / VOUSSOIRS
    for i in range(VOUSSOIRS):
        a0 = i * step + (gap if i > 0 else 0)
        a1 = (i + 1) * step - (gap if i < VOUSSOIRS - 1 else 0)
        key = i == VOUSSOIRS // 2
        r_out = R_OUT + (0.12 if key else 0)
        depth = DEPTH + (0.1 if key else 0)
        verts = []
        for z in (depth / 2, -depth / 2):
            for a, r in ((a0, R_IN), (a1, R_IN), (a1, r_out), (a0, r_out)):
                verts.append((math.cos(a) * r, SPRING + math.sin(a) * r, z))
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        base = shade(tone(STONE, rng, 0.1), 1.06 if key else 1.0)
        arch.mesh(verts, faces, color=mossy(base, MOSS, seed=40 + i, above=0.5, amount=0.9),
                  bevel=0.035, jitter=0.008)

        # The amber line: one inlaid tile per voussoir on each face, at mid-depth of the ring.
        mid = (a0 + a1) / 2
        length = (a1 - a0) * (R_IN + R_OUT) / 2 * 0.94
        r_mid = (R_IN + R_OUT) / 2
        for face in (1, -1):
            arch.box(
                (length, 0.032, 0.02),
                at=(math.cos(mid) * r_mid, SPRING + math.sin(mid) * r_mid, face * (depth / 2 + 0.002)),
                rot=(0, 0, mid - math.pi / 2),
                color=(1, 1, 1), slot=2,
            )
        if key:
            for face in (1, -1):
                d = 0.13
                arch.mesh(
                    [(0, d, 0), (d * 0.8, 0, 0), (0, -d, 0), (-d * 0.8, 0, 0),
                     (0, d, -0.03 * face), (d * 0.8, 0, -0.03 * face), (0, -d, -0.03 * face), (-d * 0.8, 0, -0.03 * face)],
                    [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                    at=(0, SPRING + R_OUT - 0.2, face * (depth / 2 + 0.012)),
                    color=(1, 1, 1), slot=2,
                )

    # Moss cushions on the extrados and the imposts.
    for a, s in ((0.62, 1.0), (1.2, 0.8), (1.75, 1.1), (2.35, 0.9), (2.9, 0.75)):
        r = R_OUT + 0.03
        arch.rock(
            0.2 * s, at=(math.cos(a) * r, SPRING + math.sin(a) * r, (rng.random() - 0.5) * 0.25),
            squash=(1.5, 0.45, 1.3), rot=(0, rng.random() * 3, math.pi / 2 - a),
            color=tone(mix(MOSS, MOSS_DARK, rng.random() * 0.5), rng), roughness=0.35,
        )
    for side in (-1, 1):
        arch.rock(0.2, at=(side * (PILLAR_X + 0.22), SPRING + 0.02, 0.22), squash=(1.2, 0.4, 1.0),
                  color=tone(MOSS_DARK, rng), roughness=0.35)
        arch.rock(0.24, at=(side * (PILLAR_X + 0.3), 0.32, -0.25), squash=(1.3, 0.35, 1.1),
                  color=tone(MOSS, rng), roughness=0.35)

    # Vines down the haunches, on the outer halves of both faces.
    for a, face, length in ((0.42, 1, 1.9), (2.72, 1, 1.5), (0.3, -1, 1.4), (2.85, -1, 2.1)):
        hang(arch, a, face, length, rng)

    # Grime: the stone darkens and greens toward the ground, where the damp is.
    layer = arch.bm.loops.layers.color["Col"]
    for face in arch.bm.faces:
        if face.material_index != 0:
            continue
        for loop in face.loops:
            y = loop.vert.co.z
            t = max(0.0, 1 - y / 1.4)
            r, g, b, a = loop[layer]
            dark = 1 - 0.18 * t
            loop[layer] = (r * dark * (1 - 0.08 * t), g * dark, b * dark * (1 - 0.12 * t), a)

    return [arch.build()]


def hang(part, angle, face, length, rng):
    r = R_OUT - 0.05
    x0 = math.cos(angle) * r
    y0 = SPRING + math.sin(angle) * r + 0.05
    z0 = face * (DEPTH / 2 + 0.035)
    points = []
    steps = 9
    for i in range(steps + 1):
        t = i / steps
        points.append((
            x0 + math.sin(t * 2.4 + angle) * 0.06,
            y0 - t * length,
            z0 + face * math.sin(t * math.pi) * 0.05,
        ))
    part.tube(points, 0.022, sides=4, color=VINE, taper=0.5)
    leaves = int(length / 0.16)
    for i in range(leaves):
        t = (i + 0.5) / leaves
        px, py, pz = points[min(int(t * steps), steps)]
        side = 1 if i % 2 == 0 else -1
        size = 0.13 * (1 - t * 0.4) * (0.8 + rng.random() * 0.4)
        colour = mix(LEAF, LEAF_LIGHT, rng.random() * 0.6)
        # A leaf: a bent diamond on a short stalk, angled out and down from the vine.
        part.mesh(
            [(0, 0, 0), (size * 0.45, -size * 0.1, face * size * 0.25), (size * 1.1, -size * 0.35, face * size * 0.1),
             (size * 0.45, -size * 0.5, -face * size * 0.05)],
            [(0, 1, 2), (0, 2, 3)],
            at=(px, py, pz), rot=(0, 0, side * 0.4 + (math.pi if side < 0 else 0)),
            color=colour, slot=1,
        )
