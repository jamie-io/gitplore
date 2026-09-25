"""
The Plaza's terminal: a newsstand kiosk the terminal's screen is mounted in.

Only the frame is modelled; the screen stays the runtime canvas `Terminal` draws. Its contract
(`terminalDimensions('default')` in props/terminal.ts) is kept: a 2.4 × 1.5 m screen centred at
y = 2.95, its plane at z = 0.155 (the 0.3 m case's front plus 5 mm). The case here is 2.6 × 1.7 m
around the screen, its front at z = 0.145, and a bezel 0.1 m wide stands proud of it round the
edge; nothing enters the screen's rectangle in front of z = 0.145. The empty `screen` marks the
screen's centre on its plane.

Around it: two painted posts on travertine feet, a panelled counter with a timber top and a few
paper stacks, a magazine rack under the screen, a cream name band, and a small barrel-tiled gable
over all of it. The collider today is the case, 2.6 × 0.3 m; the kiosk's footprint is the counter,
2.9 × 0.5 m (z from -0.19 to 0.31), which the swap-in should widen the collider to.
"""

from kit import Part, material, mix, tone
from plaza_props import (
    CREAM,
    IRON,
    KIOSK,
    KIOSK_DARK,
    TIMBER,
    TIMBER_DARK,
    gable,
    gable_end,
    marker,
    painted,
    stone,
)

SCREEN_W = 2.4
SCREEN_H = 1.5
SCREEN_Y = 2.95
SCREEN_Z = 0.155
CASE_W = SCREEN_W + 0.2
CASE_H = SCREEN_H + 0.2
CASE_FRONT = 0.145

POST_X = 1.4
POST = 0.12
COUNTER_Y = 1.05
BAND_Y = (3.84, 4.1)
EAVE_Y = 4.12
RIDGE_Y = 4.5

PAPER = [CREAM, (0.93, 0.9, 0.84), (0.84, 0.32, 0.26), (0.24, 0.42, 0.62), (0.9, 0.72, 0.28),
         (0.35, 0.55, 0.4)]


def build(seed=21):
    paint = material("plaza-terminal", roughness=0.75)
    part = Part("terminal", [paint], seed=seed)
    rng = part.rng

    # Posts on travertine feet, up to the eaves.
    for side in (-1, 1):
        x = side * POST_X
        part.box((0.28, 0.22, 0.34), at=(x, 0.11, 0.02), color=stone(rng), bevel=0.025)
        part.box((POST, EAVE_Y - 0.22, POST), at=(x, 0.22 + (EAVE_Y - 0.22) / 2, 0.02),
                 color=painted(rng))
        # A capital block under the band, where the post meets the roof beam.
        part.box((0.18, 0.1, 0.18), at=(x, BAND_Y[0] - 0.05, 0.02), color=painted(rng, KIOSK_DARK))

    # The case the screen sits in: a shallow box, then a bezel standing proud round the screen.
    back = CASE_FRONT - 0.2
    part.box((CASE_W, CASE_H, 0.2), at=(0, SCREEN_Y, back + 0.1), color=painted(rng, KIOSK_DARK))
    bezel = 0.1
    for y in (SCREEN_Y + (SCREEN_H + bezel) / 2, SCREEN_Y - (SCREEN_H + bezel) / 2):
        part.box((CASE_W, bezel, 0.06), at=(0, y, CASE_FRONT + 0.02), color=tone(IRON, rng, 0.05))
    for side in (-1, 1):
        part.box((bezel, SCREEN_H, 0.06), at=(side * (SCREEN_W + bezel) / 2, SCREEN_Y, CASE_FRONT + 0.02),
                 color=tone(IRON, rng, 0.05))

    # Back wall from the counter to the case: three vertical boards, each its own tone.
    boards = 3
    span = 2 * POST_X - POST
    for i in range(boards):
        x = -span / 2 + span * (i + 0.5) / boards
        part.box((span / boards - 0.01, SCREEN_Y - CASE_H / 2 - COUNTER_Y, 0.04),
                 at=(x, (COUNTER_Y + SCREEN_Y - CASE_H / 2) / 2, -0.06),
                 color=tone(mix(KIOSK, KIOSK_DARK, rng.random() * 0.6), rng, 0.05))

    # Magazine rack: two ledges, magazines leaning back against the boards.
    for row, y in enumerate((1.3, 1.72)):
        part.box((span - 0.06, 0.035, 0.12), at=(0, y, 0.0), color=tone(TIMBER_DARK, rng))
        x = -span / 2 + 0.12
        while x < span / 2 - 0.3:
            w = 0.3 + rng.random() * 0.1
            part.box((w, 0.34, 0.012), at=(x + w / 2, y + 0.18, -0.02), rot=(-0.2, 0, 0),
                     color=tone(PAPER[rng.randrange(len(PAPER))], rng, 0.08))
            x += w + 0.1 + rng.random() * 0.06

    # The counter: a panelled cabinet on a stone kick, a timber top overhanging the front.
    part.box((2 * POST_X + 0.08, 0.2, 0.46), at=(0, 0.1, 0.05), color=stone(rng, dark=True))
    part.box((2 * POST_X - POST, COUNTER_Y - 0.2, 0.4), at=(0, 0.2 + (COUNTER_Y - 0.2) / 2, 0.05),
             color=painted(rng))
    for x in (-0.85, 0.0, 0.85):
        part.box((0.7, 0.5, 0.02), at=(x, 0.62, 0.255), color=painted(rng, KIOSK_DARK))
    part.box((2 * POST_X + 0.1, 0.05, 0.5), at=(0, COUNTER_Y + 0.025, 0.06), color=tone(TIMBER, rng),
             bevel=0.012)
    # Paper stacks on the counter.
    for x, h, w in ((-0.95, 0.12, 0.34), (-0.55, 0.08, 0.3), (0.75, 0.1, 0.36)):
        part.box((w, h, 0.26), at=(x, COUNTER_Y + 0.05 + h / 2, 0.1), rot=(0, rng.uniform(-0.12, 0.12), 0),
                 color=tone(CREAM, rng, 0.05))

    # The name band across the top, a cream board in a painted frame.
    part.box((2 * POST_X + 0.2, BAND_Y[1] - BAND_Y[0], 0.1), at=(0, sum(BAND_Y) / 2, 0.04),
             color=tone(CREAM, rng, 0.03))
    part.box((2 * POST_X + 0.24, 0.035, 0.12), at=(0, BAND_Y[0], 0.04), color=painted(rng))
    part.box((2 * POST_X + 0.24, 0.035, 0.12), at=(0, BAND_Y[1], 0.04), color=painted(rng))

    # A barrel-tiled gable over the lot.
    gable(part, -POST_X - 0.3, POST_X + 0.3, EAVE_Y, 0.62, RIDGE_Y, tiles=16, z=0.02, rng=rng)
    # Gable ends: a painted triangle each side, under the tiles.
    for side in (-1, 1):
        tri = [(EAVE_Y, -0.55), (EAVE_Y, 0.59), (RIDGE_Y - 0.02, 0.02)]
        gable_end(part, side * (POST_X + 0.06), tri, color=painted(rng, KIOSK_DARK))

    marker("screen", (0, SCREEN_Y, SCREEN_Z))
    return [part.build()]
