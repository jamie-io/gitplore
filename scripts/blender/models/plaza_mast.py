"""
The Plaza's festoon mast: a slim cast-iron pole the string lights are tied to.

0.25 m across at the foot and 6.3 m tall to the tip of the finial, like today's procedural mast.
The wires are tied at y = 6 (`MAST_TOP` in architecture.ts), to a collar there with two crossed
eye bars, so a wire can leave the mast in any of the directions the Plaza strings them. Iron
colour from `architecture.ts`, one node, one material.
"""

import math

from kit import Part, material, tone
from plaza_props import IRON

MAST_TOP = 6.0
SIDES = 8


def build(seed=41):
    iron = material("plaza-mast", roughness=0.55, metallic=0.4)
    part = Part("mast", [iron], seed=seed)
    rng = part.rng
    twist = math.pi / SIDES

    def ring(r0, r1, y0, y1, caps=True, smooth=40):
        part.prism(SIDES, r0, r1, y0, y1, color=tone(IRON, rng, 0.06), twist=twist, caps=caps,
                   smooth_angle=smooth)

    # Foot: a flared base with a flange, then the shaft tapering to the collar.
    ring(0.125, 0.095, 0.0, 0.32)
    ring(0.105, 0.105, 0.32, 0.38)
    ring(0.062, 0.045, 0.38, MAST_TOP - 0.05, caps=False)
    ring(0.075, 0.075, 1.1, 1.16)
    # The collar the wires are tied to, and its crossed eye bars.
    ring(0.08, 0.08, MAST_TOP - 0.05, MAST_TOP + 0.05)
    for yaw in (0.0, math.pi / 2):
        part.box((0.34, 0.025, 0.025), at=(0, MAST_TOP, 0), rot=(0, yaw, 0), color=tone(IRON, rng))
    # Above it a ball and a spike.
    ring(0.05, 0.075, MAST_TOP + 0.05, MAST_TOP + 0.18, caps=False)
    ring(0.075, 0.02, MAST_TOP + 0.18, MAST_TOP + 0.24, caps=False)
    ring(0.02, 0.0, MAST_TOP + 0.24, MAST_TOP + 0.3, caps=False)
    return [part.build()]
