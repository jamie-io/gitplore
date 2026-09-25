"""
The feed card's timber stand: the frame the card's canvas face is mounted in, under a small board gable.

The game keeps the face (a 1.92 × 1.8 m plane centred at y = 2.05, z = 0.075) and swaps its
procedural frame and posts for this. Two adzed log posts carry a top and a bottom rail lashed on
with rope; a backing of boards sits behind the face, clear of it. Four cards stand 2.4 m apart on
the feed wall, so the rails stop at ±1.16 m. One material: one draw call a card.
"""

import math

from kit import Part, hex_rgb, material, mix, mossy, tone

WOOD = hex_rgb("#5a3d27")
WOOD_TONES = [hex_rgb(h) for h in ("#6a4a30", "#5a3d27", "#70523a", "#4f3622", "#634630")]
BOARD = hex_rgb("#3e2b1c")
ROPE = hex_rgb("#a88a5a")
STONE = hex_rgb("#7a7467")
MOSS = hex_rgb("#4f7033")

FACE_Y = 2.05
FACE_H = 1.8
FACE_W = 1.92
POST_X = 1.04
RAIL_HALF = 1.16


def build(seed=5):
    wood = material("card-wood", roughness=0.88)
    part = Part("card-frame", [wood], seed=seed)
    rng = part.rng

    top = FACE_Y + FACE_H / 2
    bottom = FACE_Y - FACE_H / 2

    # Posts: seven-sided logs from just below the ground to a little above the top rail.
    for side in (-1, 1):
        part.prism(7, 0.085, 0.075, -0.1, top + 0.34, at=(side * POST_X, 0, 0),
                   color=tone(WOOD_TONES[3], rng), smooth_angle=55, twist=rng.random(), bevel=0.0)
        part.prism(7, 0.075, 0.03, top + 0.34, top + 0.36, at=(side * POST_X, 0, 0),
                   color=tone(WOOD_TONES[1], rng), twist=rng.random())

    # Rails: logs across the posts, in front of them, above and below the face.
    for y, r in ((top + 0.09, 0.07), (bottom - 0.08, 0.075)):
        part.prism(7, r, r * 0.92, -RAIL_HALF, RAIL_HALF, at=(0, y, 0.07), rot=(0, 0, -math.pi / 2),
                   color=mossy(tone(WOOD_TONES[0], rng), MOSS, seed=int(y * 10), above=0.75, amount=0.6),
                   smooth_angle=55, twist=rng.random())

    # Backing boards behind the face, each its own tone, with a hair of gap between them.
    boards = 6
    width = (FACE_W + 0.08) / boards
    for i in range(boards):
        x = -((FACE_W + 0.08) / 2) + width * (i + 0.5)
        part.box((width - 0.012, FACE_H + 0.12, 0.045), at=(x, FACE_Y, 0.02),
                 color=tone(mix(BOARD, WOOD_TONES[i % 5], 0.35), rng, 0.1), bevel=0.008, jitter=0.004)
    # A batten across the back of the boards.
    for y in (FACE_Y - 0.55, FACE_Y + 0.55):
        part.box((FACE_W + 0.1, 0.1, 0.04), at=(0, y, -0.03), color=tone(WOOD_TONES[3], rng), bevel=0.01)

    # Rope lashings where the rails cross the posts: two crossed loops each.
    for side in (-1, 1):
        for y in (top + 0.09, bottom - 0.08):
            for tilt in (0.7, -0.7):
                loop = []
                for i in range(9):
                    a = i / 8 * math.tau
                    lx = math.cos(a) * 0.12
                    lz = math.sin(a) * 0.11
                    loop.append((side * POST_X + lx * 0.6, y + lx * tilt * 0.9, 0.035 + lz))
                part.tube(loop, 0.016, sides=4, color=tone(ROPE, rng, 0.06))

    # A little gable of two boards over the top, mossy on top, resting on the post heads.
    ridge = top + 0.4
    for face in (1, -1):
        part.box((2 * RAIL_HALF + 0.04, 0.035, 0.32), at=(0, ridge - 0.07, 0.03 + face * 0.145),
                 rot=(face * 0.45, 0, 0),
                 color=mossy(tone(WOOD_TONES[4], rng), MOSS, seed=7 + face, above=0.55, scale=3.0, amount=0.7),
                 bevel=0.008, jitter=0.006)
    part.prism(6, 0.03, 0.03, -RAIL_HALF - 0.04, RAIL_HALF + 0.04, at=(0, ridge, 0.03), rot=(0, 0, -math.pi / 2),
               color=tone(WOOD_TONES[3], rng), smooth_angle=60)

    # Stones packed round the post feet.
    for side in (-1, 1):
        for a in (0.4, 2.2, 4.1):
            part.rock(0.08 + rng.random() * 0.03,
                      at=(side * POST_X + math.cos(a) * 0.14, 0.03, math.sin(a) * 0.14),
                      squash=(1.2, 0.6, 1.0), color=tone(mix(STONE, MOSS, rng.random() * 0.4), rng),
                      roughness=0.3)

    return [part.build()]
