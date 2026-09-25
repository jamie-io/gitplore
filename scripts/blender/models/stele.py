"""
The jungle terminal's stele: the stone the screen panel is set into.

Same envelope as the procedural slab so the terminal's panel, plank label and colliders fit
unchanged: 2.1 m wide, 0.56 m deep, its top at 2.75 m (the plank label stands on it, front face at
z = 0.28), the screen panel's back against the front face around y = 2.1. The slab stands on a
two-step plinth; glyphs are cut into the band below the screen; moss sits on the top and the
shoulders, with ferns and stones at the foot.
"""

import math

from kit import Part, hex_rgb, material, mix, mossy, tone

STONE = hex_rgb("#a39c8b")
STONE_DARK = hex_rgb("#80796b")
GROOVE = hex_rgb("#3a362e")
MOSS = hex_rgb("#4f7033")
MOSS_DARK = hex_rgb("#3b5a2f")
FERN = hex_rgb("#3f6a2a")
FERN_LIGHT = hex_rgb("#5a8436")
AMBER = hex_rgb("#c98f3a")

TOP = 2.75
HALF_DEPTH = 0.28
PLINTH = 0.4


def build(seed=11):
    stone = material("stele-stone", roughness=0.95)
    leaf = material("stele-leaf", roughness=0.8, double_sided=True)
    part = Part("stele", [stone, leaf], seed=seed)
    rng = part.rng

    # Plinth: two chunky steps.
    part.box((2.5, 0.22, 0.98), at=(0, 0.11, 0), color=mossy(tone(STONE_DARK, rng), MOSS_DARK, seed=1, above=0.3),
             bevel=0.05, jitter=0.02)
    part.box((2.26, 0.19, 0.74), at=(0, 0.22 + 0.095, -0.01), color=mossy(tone(STONE, rng), MOSS, seed=2, above=0.4),
             bevel=0.04, jitter=0.015)

    # The body: three courses of hand-cut blocks in running bond, like the arch's pillars, the
    # top course one long stone. Each course a touch wider than the one below.
    courses = (
        (PLINTH, 1.2, 2.0, (1.18, 0.82)),
        (1.2, 2.0, 2.04, (0.72, 1.32)),
        (2.0, TOP, 2.1, (2.1,)),
    )
    for index, (bottom, top, width, blocks) in enumerate(courses):
        x = -width / 2
        for block in blocks:
            w = block * width / sum(blocks)
            part.box((w - 0.016, top - bottom - 0.016, 2 * HALF_DEPTH - (0.02 if index < 2 else 0)),
                     at=(x + w / 2, (bottom + top) / 2, 0),
                     color=mossy(tone(STONE, rng, 0.08), MOSS, seed=10 + index * 3 + len(blocks), above=0.5,
                                 scale=1.8),
                     bevel=0.04, jitter=0.012)
            x += w

    # Carved glyph band under the screen: three rows of cut marks, and an amber line above them.
    front = HALF_DEPTH + 0.002
    for row, y in enumerate((0.6, 0.8, 1.0)):
        x = -0.78
        while x < 0.78:
            kind = rng.random()
            width = 0.06 + rng.random() * 0.12
            if kind < 0.55:
                part.box((width, 0.035, 0.01), at=(x + width / 2, y + (rng.random() - 0.5) * 0.04, front), color=GROOVE)
            elif kind < 0.8:
                part.box((0.035, 0.14, 0.01), at=(x + 0.02, y, front), color=GROOVE)
                width = 0.04
            else:
                d = 0.055
                part.mesh([(0, d, 0), (d, 0, 0), (0, -d, 0), (-d, 0, 0)], [(0, 1, 2, 3)],
                          at=(x + d, y, front + 0.004), color=GROOVE)
                width = 2 * d
            x += width + 0.05 + rng.random() * 0.05
    part.box((1.62, 0.025, 0.01), at=(0, 1.12, front), color=AMBER)

    # Moss cushions on the top (kept behind the plank label) and the plinth's shoulders.
    for x, s in ((-0.7, 1.0), (-0.15, 0.8), (0.5, 1.1), (0.88, 0.7)):
        part.rock(0.2 * s, at=(x, TOP + 0.02, -0.1 + (rng.random() - 0.5) * 0.1), squash=(1.6, 0.35, 1.0),
                  color=tone(mix(MOSS, MOSS_DARK, rng.random() * 0.5), rng), roughness=0.35)
    for x in (-1.1, 1.08):
        part.rock(0.2, at=(x, PLINTH + 0.02, 0.2), squash=(1.2, 0.4, 1.1),
                  color=tone(MOSS_DARK, rng), roughness=0.35)
    # Stones and ferns at the foot.
    for x, z, r in ((-1.35, 0.35, 0.16), (-1.2, -0.45, 0.12), (1.38, 0.1, 0.14), (0.9, 0.6, 0.1)):
        part.rock(r, at=(x, r * 0.35, z), squash=(1.2, 0.7, 1.0), rot=(0, rng.random() * 3, 0),
                  color=tone(STONE, rng), roughness=0.3)
    for x, z in ((-1.25, 0.5), (1.3, -0.35), (1.25, 0.45)):
        fern(part, x, z, rng)

    return [part.build()]


def fern(part, x, z, rng, fronds=7):
    """A low fern: fronds fanned round a centre, each a bent strip narrowing to its tip."""
    for i in range(fronds):
        yaw = i / fronds * math.tau + rng.random() * 0.4
        length = 0.38 + rng.random() * 0.2
        rise = 0.28 + rng.random() * 0.12
        width = 0.07
        verts = []
        steps = 3
        for s in range(steps + 1):
            t = s / steps
            along = t * length
            height = math.sin(t * math.pi * 0.8) * rise
            half = width * (1 - t * 0.85)
            verts.append((along, height, -half))
            verts.append((along, height + 0.01, half))
        faces = [(2 * s, 2 * s + 2, 2 * s + 3, 2 * s + 1) for s in range(steps)]
        part.mesh(verts, faces, at=(x, 0.02, z), rot=(0, yaw, 0),
                  color=mix(FERN, FERN_LIGHT, rng.random() * 0.7), slot=1)
