"""
The commit steps: eleven boardwalk steps from the marsh boardwalk up to the arch's deck, one step
for each stretch of the project's history, and each lit by its commits.

The origin is at the foot of the flight, level with the boardwalk deck (the game stands it at
+0.8 m); the flight climbs 1.6 m over 4.8 m along −z and is 1.4 m wide, so step `i` spans z from
−0.436·i to −0.436·(i + 1) with its tread's top at y = 1.6·(i + 1)/11. Every step is its own node,
`step_00` … `step_10`, so the game can light them one by one: a tread of three planks with an
amber strip inset behind the nosing (material `inlay`, which the game turns emissive), a riser, a
length of both stringers, and on every other step (the even ones) a pair of posts that stand in
the marsh and run on up as the rope-rail posts, the rope sagging from them to the next pair. Three materials: the
wood, the rope and the inlay.
"""

import math

from kit import Part, hex_rgb, material, mix, mossy, shade, tone

WOOD_TONES = [hex_rgb(h) for h in ("#6a4a30", "#5a3d27", "#70523a", "#4f3622", "#634630")]
PLANK = hex_rgb("#76583c")
PLANK_GREY = hex_rgb("#6e6250")
DARK = hex_rgb("#3e2b1c")
ROPE = hex_rgb("#a88a5a")
ROPE_DARK = hex_rgb("#8a7048")
MOSS = hex_rgb("#4f7033")
MOSS_DARK = hex_rgb("#3b5a2f")
INLAY = hex_rgb("#9a6a26")

COUNT = 11
RUN = 4.8
RISE = 1.6
WIDTH = 1.4
DEPTH = RUN / COUNT
STEP_RISE = RISE / COUNT
PLANK_T = 0.06
STRINGER_X = WIDTH / 2 - 0.04
POST_X = WIDTH / 2 + 0.05
POST_TOP = 0.92  # rail post height above its tread
ROPE_Y = 0.84  # the rope's height above the tread where it threads the post
GROUND = -0.95  # the legs' feet, below the marsh (the boardwalk deck stands 0.5 m above it)


def top(i):
    return RISE * (i + 1) / COUNT


def build(seed=17):
    wood = material("steps-wood", roughness=0.9)
    rope = material("steps-rope", roughness=0.95)
    inlay = material("inlay", roughness=0.45, vertex=False, base=INLAY)
    return [step(i, [wood, rope, inlay], seed + i * 7) for i in range(COUNT)]


def step(i, materials, seed):
    part = Part(f"step_{i:02d}", materials, seed=seed)
    rng = part.rng
    y = top(i)
    front = -DEPTH * i
    back = -DEPTH * (i + 1)

    # The tread: a narrow nosing plank, the amber inlay in the rebate behind it, two wide planks.
    nosing = 0.075
    strip = 0.034
    gap = 0.008
    wide = (DEPTH - nosing - strip - 3 * gap) / 2
    z = front - nosing / 2
    part.box((WIDTH, PLANK_T, nosing), at=(0, y - PLANK_T / 2, z), color=plank(rng, 0), jitter=0.004)
    z = front - nosing - gap - strip / 2
    part.box((WIDTH - 0.12, 0.03, strip), at=(0, y - 0.018, z), color=(1, 1, 1), slot=2)
    z = front - nosing - gap - strip - gap
    for k in range(2):
        centre = z - wide / 2
        part.box((WIDTH + (rng.random() - 0.5) * 0.04, PLANK_T, wide),
                 at=((rng.random() - 0.5) * 0.02, y - PLANK_T / 2 - rng.random() * 0.006, centre),
                 color=plank(rng, k + 1), jitter=0.005)
        z -= wide + gap
    # A batten under the tread holding the planks and the strip together.
    part.box((WIDTH - 0.1, 0.05, 0.07), at=(0, y - PLANK_T - 0.025, (front + back) / 2),
             color=tone(DARK, rng))

    # The riser, set back under the nosing, down to the step below (the deck for the first).
    below = top(i - 1) if i > 0 else 0.0
    riser = y - PLANK_T - below
    part.box((WIDTH - 0.08, riser, 0.03), at=(0, below + riser / 2, front - 0.03),
             color=tone(mix(DARK, WOOD_TONES[i % 5], 0.4), rng))

    # The stringers: this step's length of the two sloping beams under the tread ends.
    slope = math.atan2(STEP_RISE, DEPTH)
    length = math.hypot(DEPTH, STEP_RISE) + 0.01
    for side in (-1, 1):
        part.box((0.08, 0.18, length), at=(side * STRINGER_X, stringer(y), (front + back) / 2),
                 rot=(slope, 0, 0), color=tone(WOOD_TONES[3], rng))

    # Every other step carries a pair of posts: driven into the marsh, bolted to the stringers'
    # outer faces and running on up as the rail posts, with the rope sagging on to the next pair.
    if i % 2 == 0:
        z = (front + back) / 2
        # A cross beam under the stringers, pinned through both posts.
        part.box((2 * POST_X + 0.16, 0.12, 0.09), at=(0, stringer(y) - 0.16, z),
                 rot=(0, 0, (rng.random() - 0.5) * 0.03), color=tone(WOOD_TONES[3], rng))
        for side in (-1, 1):
            x = side * POST_X
            foot = GROUND - rng.random() * 0.1
            part.prism(6, 0.058, 0.045, foot, y + POST_TOP, at=(x, 0, z),
                       color=post(rng, seed + side), twist=rng.random(), smooth_angle=None)
            part.prism(6, 0.064, 0.064, y + ROPE_Y - 0.035, y + ROPE_Y + 0.035, at=(x, 0, z),
                       color=tone(ROPE_DARK, rng, 0.06), slot=1, caps=False)
            if i + 2 < COUNT:
                ahead = z - 2 * DEPTH
                y0 = y + ROPE_Y
                y1 = y0 + 2 * STEP_RISE
                points = [
                    (x, y0 + (y1 - y0) * t - math.sin(t * math.pi) * 0.09, z + (ahead - z) * t)
                    for t in (k / 4 for k in range(5))
                ]
                part.tube(points, 0.018, sides=4, color=tone(ROPE, rng, 0.06), slot=1,
                          smooth_angle=70)

    return part.build()


def stringer(y):
    """The stringers' centre line under a tread at `y`: their top meets the planks' underside at the tread's back."""
    return y - PLANK_T - 0.09 - STEP_RISE / 2


def post(rng, seed):
    """A post's faces: dark and damp low down, weathered wood above, moss on the cut top."""
    wood = tone(WOOD_TONES[rng.randrange(5)], rng)
    moss = mossy(wood, MOSS, seed=seed, above=0.7, scale=4.0, amount=0.7)

    def paint(centre, normal):
        damp = max(0.0, min(1.0, (0.4 - centre.y) / 1.2))
        return mix(moss(centre, normal), mix(DARK, MOSS_DARK, 0.4), damp * 0.6)

    return paint


def plank(rng, k):
    base = mix(PLANK, PLANK_GREY, rng.random() * 0.6)
    base = shade(base, 1.0 + (rng.random() - 0.5) * 0.12)
    # Moss creeps in along the ends and the joints of the older, greyer planks.
    return mossy(base, mix(MOSS, MOSS_DARK, rng.random()), seed=k + rng.random() * 9, above=0.95,
                 scale=5.0, amount=0.35)
