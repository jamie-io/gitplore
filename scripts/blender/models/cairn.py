"""
The release cairns: three variants of three stacked stones under a moss cap.

`ReleaseMarkers` stands one cairn per release and picks the variant by `index % 3`, so each variant
keeps the procedural stack's measurements exactly: stone `i` has scale `CAIRN_SCALES[i] * f` with
`f = 1 + variant * 0.08`, is `1.4 * scale` tall and centred on the stack's running top, and spans
about `1.2 * scale` across and `0.9 * scale` deep. The version label is laid against the top
stone's side at those extents, so the stones stay just inside them. The moss is a cushion on the
top stone rather than the procedural stack's wide cap, which overhung the label like a hat.
"""

import math

from kit import Part, hex_rgb, material, mix, mossy, tone

CAIRN_SCALES = (0.4, 0.32, 0.24)
STONE = hex_rgb("#8c7762")
STONE_GREY = hex_rgb("#857d70")
MOSS = hex_rgb("#5f7f3a")
MOSS_DARK = hex_rgb("#46662e")


def build(seed=31):
    stone = material("cairn-stone", roughness=0.95)
    return [cairn(stone, variant, seed + variant * 17) for variant in range(3)]


def cairn(stone, variant, seed):
    part = Part(f"cairn-{variant}", [stone], seed=seed)
    rng = part.rng
    f = 1 + variant * 0.08
    top = 0.0
    for index, base in enumerate(CAIRN_SCALES):
        scale = base * f
        height = scale * 1.4
        colour = tone(mix(STONE, STONE_GREY, rng.random() * 0.6), rng, 0.08)
        # A stone just inside the procedural one's extents, turned a little, chipped flat on top
        # and bottom where it bears on its neighbours.
        part.rock(
            # 0.86 tall rather than 0.7: the flat cuts take the rest, leaving 1.37 × scale.
            scale * 0.97, at=(0, top + height / 2, 0), squash=(1.2, 0.86, 0.9),
            rot=(0, (rng.random() - 0.5) * 0.3, (rng.random() - 0.5) * 0.08),
            color=mossy(colour, MOSS, seed=seed + index, above=0.9, amount=0.55),
            subdivisions=2, roughness=0.1, cuts=3, depth=(0.72, 0.9), flat=0.82,
            seed=seed + index * 3,
        )
        top += height
    # A cushion of moss on the top stone, inside its edge so it never hangs over the label.
    cap = CAIRN_SCALES[-1] * f * 0.9
    part.rock(cap, at=(0, top - 0.01, 0), squash=(1.1, 0.4, 0.85),
              color=tone(mix(MOSS, MOSS_DARK, rng.random() * 0.4), rng), roughness=0.25,
              seed=seed + 9)
    # Pebbles round the foot.
    for i in range(4):
        a = i / 4 * math.tau + rng.random()
        r = CAIRN_SCALES[0] * f * 1.35
        size = 0.06 + rng.random() * 0.04
        part.rock(size, at=(math.cos(a) * r, size * 0.3, math.sin(a) * r * 0.8),
                  squash=(1.2, 0.7, 1.0), color=tone(STONE_GREY, rng), roughness=0.3)
    return part.build()
