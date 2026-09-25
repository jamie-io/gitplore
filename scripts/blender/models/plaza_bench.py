"""
The Plaza's bench: a timber seat and back on two travertine pedestals.

1.8 m long, 0.6 m deep, 0.8 m to the top of the back; the sitting side faces +Z. The seat is at
0.45 m, as today's procedural bench, and the whole bench stays inside its collider's 1 m radius.
One node, one material.
"""

from kit import Part, material, mix, tone
from plaza_props import IRON, TIMBER, TIMBER_DARK, stone

LENGTH = 1.8
SEAT_Y = 0.45
PEDESTAL_X = 0.66


def build(seed=51):
    wood = material("plaza-bench", roughness=0.8)
    part = Part("bench", [wood], seed=seed)
    rng = part.rng

    def timber():
        return tone(mix(TIMBER, TIMBER_DARK, rng.random() * 0.5), rng, 0.05)

    # Pedestals: a block with a slightly wider foot.
    for side in (-1, 1):
        x = side * PEDESTAL_X
        part.box((0.26, 0.06, 0.5), at=(x, 0.03, 0.0), color=stone(rng, dark=True))
        part.box((0.2, SEAT_Y - 0.1, 0.42), at=(x, 0.06 + (SEAT_Y - 0.1) / 2, 0.0), color=stone(rng),
                 bevel=0.02)

    # Seat: three slats, a finger's gap between them, on the pedestals.
    for z in (-0.15, 0.0, 0.15):
        part.box((LENGTH, 0.05, 0.135), at=(0, SEAT_Y - 0.025, z + 0.03), color=timber(), bevel=0.01)

    # Back: two slats leaning back on iron brackets behind them that rise from the pedestals.
    for y, z in ((0.6, -0.235), (0.74, -0.265)):
        part.box((LENGTH, 0.11, 0.035), at=(0, y, z), rot=(-0.2, 0, 0), color=timber(), bevel=0.008)
    for side in (-1, 1):
        part.box((0.04, 0.5, 0.04), at=(side * PEDESTAL_X, 0.58, -0.285), rot=(-0.2, 0, 0),
                 color=tone(IRON, rng))
    return [part.build()]
