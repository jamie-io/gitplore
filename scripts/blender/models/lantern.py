"""
The trail lantern: a wooden post with an iron bracket, and the lantern body that hangs from it
and later travels in the explorer's hand.

Two nodes, because the body moves on its own:
  lantern-post  origin at the post's foot; the bracket's hook hangs at (-0.42, 1.96, 0).
  lantern-body  built around its own origin (the base plate's underside) and placed where it
                hangs, (-0.42, 1.5, 0); the game adopts its geometry into its moving group. Its
                top ring is at y = 0.44, so the hand's `HANG` offset still puts it below the fist.
The glass is its own material, `lantern-glass`, which the game swaps for the one it lights.
"""

import math

from kit import P, Part, hex_rgb, material, mix, tone

WOOD = hex_rgb("#5a3d27")
WOOD_DARK = hex_rgb("#43301f")
IRON = hex_rgb("#34322b")
IRON_WORN = hex_rgb("#4a4436")
STONE = hex_rgb("#6f6a5e")
MOSS = hex_rgb("#4d6d33")


def build(seed=3):
    wood = material("lantern-wood", roughness=0.9)
    iron = material("lantern-iron", roughness=0.5, metallic=0.55)
    glass = material(
        "lantern-glass", roughness=0.2, vertex=False, base=hex_rgb("#2a2010"), emissive="#ffa640",
        strength=0.0,
    )

    post = Part("lantern-post", [wood, iron], seed=seed)
    rng = post.rng
    # The post: an eight-sided adzed log, each face its own tone so the grain reads.
    sides = 8
    faces = post.prism(sides, 0.085, 0.07, 0.0, 2.1, color=WOOD, bevel=0.0, smooth_angle=50,
                       twist=0.2)
    for face in faces:
        colour = tone(mix(WOOD, WOOD_DARK, rng.random() * 0.5), rng, 0.06)
        for loop in face.loops:
            loop[post.bm.loops.layers.color["Col"]] = (*colour, 1)
    post.prism(8, 0.075, 0.0, 2.1, 2.2, color=IRON, slot=1, twist=0.2)  # a little iron cap
    for y in (0.35, 1.72):
        post.prism(8, 0.094, 0.094, y, y + 0.045, color=IRON_WORN, slot=1, twist=0.2)

    # Bracket: a flat bar out to the hook, a curved brace under it, a scroll at the tip.
    post.box((0.52, 0.04, 0.035), at=(-0.25, 2.02, 0), color=IRON, slot=1)
    brace = [(-0.02 - 0.3 * t, 1.72 + 0.3 * math.sin(t * math.pi / 2), 0) for t in (0, 0.2, 0.4, 0.6, 0.8, 1)]
    post.tube(brace, 0.014, sides=4, color=IRON, slot=1)
    scroll = [(-0.51 + 0.035 * math.cos(a), 2.02 + 0.035 * math.sin(a) - 0.035, 0)
              for a in [math.pi / 2 + i * 0.7 for i in range(8)]]
    post.tube(scroll, 0.01, sides=4, color=IRON, slot=1)
    hook = [(-0.42, 2.0, 0), (-0.42, 1.96, 0), (-0.4, 1.94, 0), (-0.385, 1.955, 0)]
    post.tube(hook, 0.009, sides=4, color=IRON, slot=1)

    # Footing: a few stones round the foot, one with moss.
    for i, a in enumerate((0.3, 1.9, 3.6, 5.0)):
        r = 0.16 + rng.random() * 0.04
        post.rock(0.09 + rng.random() * 0.03, at=(math.cos(a) * r, 0.03, math.sin(a) * r),
                  squash=(1.2, 0.7, 1.0), rot=(0, a, 0),
                  color=tone(mix(STONE, MOSS, 0.6 if i == 1 else 0.0), rng), roughness=0.3)

    body = Part("lantern-body", [iron, glass], seed=seed + 1)
    brng = body.rng
    body.prism(8, 0.125, 0.12, 0.0, 0.04, color=IRON, twist=math.pi / 8)
    body.prism(8, 0.1, 0.1, 0.04, 0.27, color=(1, 1, 1), slot=1, twist=math.pi / 8)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        body.box((0.02, 0.25, 0.02), at=(math.cos(a) * 0.108, 0.155, math.sin(a) * 0.108),
                 rot=(0, -a, 0), color=tone(IRON_WORN, brng))
    body.prism(8, 0.118, 0.118, 0.265, 0.29, color=IRON, twist=math.pi / 8)
    body.prism(8, 0.16, 0.15, 0.29, 0.305, color=IRON_WORN, twist=math.pi / 8)
    body.prism(8, 0.15, 0.03, 0.305, 0.4, color=IRON, twist=math.pi / 8)
    body.prism(6, 0.03, 0.0, 0.4, 0.43, color=IRON_WORN)
    ring = [(0.045 * math.sin(a), 0.445 + 0.045 * math.cos(a) - 0.045 + 0.02, 0)
            for a in [i / 10 * math.tau for i in range(11)]]
    body.tube(ring, 0.009, sides=4, color=IRON)

    objects = [post.build(), body.build()]
    objects[1].location = P(-0.42, 1.5, 0)
    return objects
