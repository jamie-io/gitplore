"""
The block that closes each corner of the Plaza, where two rows of houses meet.

A 4 × 4 × 10 m block with its pivot at the corner nearest the fountain: it spans x ∈ [0, 4] and
z ∈ [0, 4], and its two fronts face −X and −Z. In the square those fronts stand against the side
walls of the last house in each row, so they only show above them: below 7 m they are plain
stucco, above it they carry a string course, two shuttered windows each and the cornice, under a
hipped roof whose two front slopes are tiled. The game exports it once and turns it by 90° steps
for the four corners.

The nodes match the houses': `stucco` and `shutters` white for the instance tint, `trim` in its
own colours.
"""

import math

from kit import Part, material, shade, tone
from plaza_house import (
    CORNICE,
    FRAME,
    GLASS,
    PITCH,
    REVEAL,
    STONE,
    STONE_DARK,
    TILE,
    TILES,
    WHITE,
    Facade,
    Slope,
    faces,
    shutter,
)

SIZE = 4.0
HEIGHT = 10.0
PLAIN = 6.9  # below this the neighbours hide the fronts
EAVE = 0.3
WINDOWS = (1.0, 3.0)  # clear of the neighbours' gables, which peak at the middle of each front


def build(seed=31):
    mat = material("plaza-corner", roughness=0.9)
    stucco = Part("stucco", [mat], seed=seed)
    shutters = Part("shutters", [mat], seed=seed + 1)
    trim = Part("trim", [mat], seed=seed + 2)
    rng = trim.rng

    # Both fronts in their own facade frames, u ∈ [0, 4] left to right seen from outside: on the
    # −X front u runs along +Z from the pivot, on the −Z front along −X towards it. `pivot_u` is
    # the pivot's end of each; bands reach past it by their projection so the fronts' bands meet.
    fronts = [Facade(-math.pi / 2, (0.0, 0.0, 0.0)), Facade(math.pi, (SIZE, 0.0, 0.0))]
    pivot_u = [0.0, SIZE]

    window_w, sill, window_h = 0.72, 7.75, 1.1
    for front, pu in zip(fronts, pivot_u):
        holes = [(u - window_w / 2, u + window_w / 2, sill, sill + window_h) for u in WINDOWS]
        front.wall(stucco, 0.0, SIZE, 0.0, PLAIN, [])
        front.wall(stucco, 0.0, SIZE, PLAIN, HEIGHT, holes)
        # Bands run past the pivot corner by their own projection, so the two fronts' bands meet.
        reach = lambda proud: (-proud, SIZE) if pu == 0.0 else (0.0, SIZE + proud)  # noqa: E731
        a, b = reach(0.06)
        front.box(stucco, (b - a, 0.14, 0.06), ((a + b) / 2, PLAIN + 0.07, 0.03), shade(WHITE, 0.97))
        for proud, v, h in ((0.1, HEIGHT - CORNICE + 0.08, 0.16), (0.2, HEIGHT - CORNICE + 0.22, 0.12),
                            (0.3, HEIGHT - 0.165, 0.17)):
            a, b = reach(proud)
            front.box(trim, (b - a, h, proud), ((a + b) / 2, v, proud / 2), tone(STONE_DARK, rng, 0.03))

        for (a0, a1, b0, b1), u in zip(holes, WINDOWS):
            front.ring(trim, a0, a1, b0, b1, 0.09, 0.025, tone(STONE, rng, 0.03))
            front.box(trim, (window_w + 0.28, 0.07, 0.15), (u, b0 - 0.1, 0.055), tone(STONE_DARK, rng, 0.03))
            gw = -REVEAL + 0.02
            front.polys(trim, [([(a0, b0, gw), (a1, b0, gw), (a1, b1, gw), (a0, b1, gw)], (0, 0, 1))],
                        tone(GLASS, rng, 0.05))
            fz = gw + 0.015
            bars = ((u, (b0 + b1) / 2, 0.05, b1 - b0), (u, b0 + 0.66 * (b1 - b0), window_w, 0.05))
            for bu, bv, bw, bh in bars:
                front.polys(trim, [([(bu - bw / 2, bv - bh / 2, fz), (bu + bw / 2, bv - bh / 2, fz),
                                     (bu + bw / 2, bv + bh / 2, fz), (bu - bw / 2, bv + bh / 2, fz)],
                                    (0, 0, 1))], FRAME)
            for side in (-1, 1):
                hinge = (a0 - 0.09) if side < 0 else (a1 + 0.09)
                shutter(front, shutters, hinge, b0 - 0.01, b1 - b0 + 0.02, window_w / 2, side, shutters.rng)

    # The back walls: never seen, one quad each.
    faces(stucco, [
        ([(SIZE, 0, 0), (SIZE, 0, SIZE), (SIZE, HEIGHT + 0.04, SIZE), (SIZE, HEIGHT + 0.04, 0)], (1, 0, 0)),
        ([(0, 0, SIZE), (SIZE, 0, SIZE), (SIZE, HEIGHT + 0.04, SIZE), (0, HEIGHT + 0.04, SIZE)], (0, 0, 1)),
        # The strip of wall between the cornice and the roof on both fronts.
        ([(0, HEIGHT, 0), (0, HEIGHT, SIZE), (0, HEIGHT + 0.04, SIZE), (0, HEIGHT + 0.04, 0)], (-1, 0, 0)),
        ([(0, HEIGHT, 0), (SIZE, HEIGHT, 0), (SIZE, HEIGHT + 0.04, 0), (0, HEIGHT + 0.04, 0)], (0, 0, -1)),
    ], WHITE)

    roof(trim, stucco, rng)
    return [stucco.build(), shutters.build(), trim.build()]


def roof(trim, stucco, rng):
    """A hipped roof over the block, its two front slopes tiled and the back two plain."""
    slope = math.tan(PITCH)
    base = HEIGHT + 0.12
    lo, hi = -EAVE, SIZE + EAVE
    eave_y = base - EAVE * slope
    centre = SIZE / 2
    apex = (centre, base + centre * slope, centre)
    corners = [(lo, eave_y, lo), (hi, eave_y, lo), (hi, eave_y, hi), (lo, eave_y, hi)]

    # The roof's own surface: dark terracotta under the tiles, the whole of the back slopes.
    under = shade(TILE, 0.8)
    faces(trim, [
        ([corners[0], corners[1], apex], (0, 1, -0.45)),
        ([corners[3], corners[0], apex], (-1, 2.2, 0)),
    ], under)
    faces(trim, [
        ([corners[1], corners[2], apex], (1, 2.2, 0)),
        ([corners[2], corners[3], apex], (0, 1, 0.45)),
    ], tone(TILE, rng, 0.05))
    # Soffits under the two front eaves.
    faces(trim, [
        ([(0, HEIGHT, 0), (SIZE, HEIGHT, 0), (hi, eave_y - 0.02, lo), (lo, eave_y - 0.02, lo)], (0, -1, 0)),
        ([(0, HEIGHT, SIZE), (0, HEIGHT, 0), (lo, eave_y - 0.02, lo), (lo, eave_y - 0.02, hi)], (0, -1, 0)),
    ], shade(TILE, 0.7))

    run = SIZE + 2 * EAVE
    cos = math.cos(PITCH)
    # Each column stops where its nearer edge meets a hip, so none pokes through the next slope.
    pitch = run / round(run / 0.32)

    def top(u):
        near = min(u - pitch / 2, run - u - pitch / 2)
        return max(0.0, near) / cos

    lift = 0.012
    north = Slope((lo, eave_y + lift, lo), (1, 0, 0), (0, math.sin(PITCH), math.cos(PITCH)))
    west = Slope((lo, eave_y + lift, hi), (0, 0, -1), (math.cos(PITCH), math.sin(PITCH), 0))
    for s in (north, west):
        s.tiles(trim, 0.0, run, 0.0, run / 2 / cos, rng, pitch=pitch, top=top)

    # Capping tiles along the four hips.
    for corner in corners:
        start = (corner[0], corner[1] + 0.09, corner[2])
        trim.tube([start, (apex[0], apex[1] + 0.09, apex[2])], 0.1, sides=5,
                  color=tone(TILES[1], rng, 0.05), smooth_angle=None)
    # A chimney on the back slope, over the corner of the block.
    cx, cz = 2.9, 2.9
    cy = base + (SIZE - max(cx, cz)) * slope
    stucco.box((0.55, 1.4, 0.55), at=(cx, cy + 0.5, cz), color=WHITE)
    trim.box((0.7, 0.08, 0.7), at=(cx, cy + 1.24, cz), color=tone(STONE_DARK, rng, 0.03))
    trim.prism(4, 0.42, 0.05, 0, 0.3, at=(cx, cy + 1.28, cz), twist=math.pi / 4, color=tone(TILE, rng, 0.05))
