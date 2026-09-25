"""
The jungle's boulders: two variants the scatter stands round the clearing, instanced.

Each is built to the procedural boulder's envelope (a stone about 2.6 × 1.5 × 2.2 m, sunk 0.45 m
into the ground so its top stands near 1.1 m) because the colliders are fixed at 0.95 m and the
instances scale 0.7 to 1.5. Faceted stone with moss grown over its top by the face colours, a
cushion on the crown and a smaller stone or two against its flank.

The game tints each instance, so the colours here are the untinted stone and moss.
"""

from kit import Part, hex_rgb, material, mix, mossy, tone

STONE = hex_rgb("#8f897b")
STONE_DARK = hex_rgb("#736d61")
MOSS = hex_rgb("#557a36")
MOSS_DARK = hex_rgb("#3f6230")


def build(seed=21):
    stone = material("rock-stone", roughness=0.95)
    return [boulder_a(stone, seed), boulder_b(stone, seed + 1)]


def boulder_a(stone, seed):
    """A rounded boulder with a mossy crown and a stone leaning on its flank."""
    part = Part("boulder-0", [stone], seed=seed)
    rng = part.rng
    part.rock(1.0, at=(0, 0.3, 0), squash=(1.3, 0.78, 1.1), rot=(0, 0.4, 0),
              color=mossy(tone(STONE, rng), MOSS, seed=seed, above=0.72, scale=1.1),
              roughness=0.22, seed=seed, subdivisions=2, cuts=5)
    part.rock(0.45, at=(-0.15, 0.9, 0.1), squash=(1.5, 0.3, 1.2),
              color=tone(mix(MOSS, MOSS_DARK, 0.4), rng), roughness=0.35, seed=seed + 3)
    part.rock(0.46, at=(1.2, 0.12, 0.55), squash=(1.1, 0.8, 1.0), rot=(0.2, 1.1, 0.1),
              color=mossy(tone(STONE_DARK, rng), MOSS, seed=seed + 5, above=0.75),
              roughness=0.2, seed=seed + 7, subdivisions=2, cuts=4)
    for x, z, r in ((-1.25, 0.6, 0.16), (0.6, 1.15, 0.13), (-0.7, -1.05, 0.14)):
        part.rock(r, at=(x, r * 0.3, z), squash=(1.2, 0.7, 1.0), color=tone(STONE_DARK, rng),
                  roughness=0.3, cuts=2)
    return part.build()


def boulder_b(stone, seed):
    """A split boulder: two slabs leaning together, moss in the crack and on the tops."""
    part = Part("boulder-1", [stone], seed=seed)
    rng = part.rng
    part.rock(0.95, at=(-0.45, 0.28, 0.05), squash=(0.95, 0.85, 1.15), rot=(0, 0.2, 0.18),
              color=mossy(tone(STONE, rng), MOSS, seed=seed, above=0.72, scale=1.3),
              roughness=0.2, seed=seed, subdivisions=2, cuts=5)
    part.rock(0.85, at=(0.62, 0.2, -0.08), squash=(0.9, 0.8, 1.1), rot=(0, -0.3, -0.22),
              color=mossy(tone(STONE_DARK, rng), MOSS, seed=seed + 2, above=0.72, scale=1.3),
              roughness=0.2, seed=seed + 4, subdivisions=2, cuts=5)
    part.rock(0.3, at=(0.08, 0.78, 0.0), squash=(0.8, 0.35, 1.7),
              color=tone(MOSS_DARK, rng), roughness=0.3, seed=seed + 6)
    for x, z, r in ((1.35, 0.5, 0.15), (-1.3, -0.5, 0.17), (0.2, 1.05, 0.12)):
        part.rock(r, at=(x, r * 0.3, z), squash=(1.2, 0.7, 1.0), color=tone(STONE_DARK, rng),
                  roughness=0.3, cuts=2)
    return part.build()
