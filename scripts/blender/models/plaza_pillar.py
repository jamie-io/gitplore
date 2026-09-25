"""
The Plaza's language pillar: a small Tuscan column in three nodes, all painted white with their
ambient occlusion baked in, so the game tints them (the shaft with the language's colour).

  shaft    a twelve-sided shaft, radius 0.3 at the foot and 0.275 at the top, like today's
           procedural pillar (0.55 m wide at the top, `PILLAR_WIDTH / 1.8` at the foot), from
           y = 0 to y = 1. The game scales it on Y to the pillar's height H.
  base     a square plinth and a torus moulding, y = 0 to 0.12, 0.74 m square.
  capital  an astragal, an echinus and a square abacus, y = 0.87 to 1.0, 0.68 m square, authored
           with its top at
           the shaft's top, so the game moves it up by H - 1.

With that, a pillar of height H stands exactly H tall, as today. Base and capital together are
0.25 m, under the shortest pillar (`PILLAR_BASE`, 0.35 m), so the shaft always shows between them.
"""

from kit import Part, material

SHAFT_FOOT = 0.3
SHAFT_TOP = 0.275
SIDES = 12
BASE_H = 0.12
CAPITAL_H = 0.13
SQUARE = 0.74


def build():
    stone = material("plaza-pillar", roughness=0.8)
    white = (1, 1, 1)

    shaft = Part("shaft", [stone], seed=1)
    shaft.prism(SIDES, SHAFT_FOOT, SHAFT_TOP, 0.0, 1.0, color=white, smooth_angle=40, caps=False)

    base = Part("base", [stone], seed=2)
    base.box((SQUARE, 0.07, SQUARE), at=(0, 0.035, 0), color=white, bevel=0.012)
    base.prism(SIDES, 0.36, 0.32, 0.07, BASE_H, color=white, smooth_angle=40)

    capital = Part("capital", [stone], seed=3)
    top = 1.0
    # An astragal ring round the shaft's neck, the echinus flaring out over it, the abacus on top.
    capital.prism(SIDES, 0.3, 0.3, top - CAPITAL_H, top - CAPITAL_H + 0.025, color=white, smooth_angle=40)
    capital.prism(SIDES, 0.285, 0.34, top - CAPITAL_H + 0.025, top - 0.055, color=white, smooth_angle=40)
    capital.box((0.68, 0.055, 0.68), at=(0, top - 0.0275, 0), color=white, bevel=0.01)

    return [base.build(), shaft.build(), capital.build()]
