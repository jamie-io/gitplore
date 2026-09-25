"""
The Plaza's archway across the south street, framing the return portal.

6 m wide, 1.2 m deep, 5 m tall, with a round opening 3 m wide. The two piers stand on the
colliders the game gives them, 1.5 × 1.2 m at x = ±2.25, and are built of rusticated courses on a
plinth; an impost moulding caps each at the spring, 2.8 m. Nine voussoirs turn the arch, the
keystone proud and running up to the cornice, and a stepped cornice and a plain attic finish it at
5 m. Nothing stands above 5 m, where the portal's label hangs (5.2 m), and nothing inside the
opening below 3.55 m within 1.3 m of the middle, where the portal's glowing surface is.

`portal` is an empty at the centre of that surface (the `PortalLandmark` veil: 2.6 × 3.4 m, its
centre 1.8 m up, in the plane z = 0). One node `arch`, one material, travertine like the fountain.
"""

import math

from kit import Part, hex_rgb, material, mix, shade, tone
from plaza_house import empty, faces

STONE = hex_rgb("#d9cdb5")
STONE_DARK = hex_rgb("#cfc1a6")
GRIME = hex_rgb("#8f8a78")

HALF = 3.0  # half the width
OPENING = 1.5  # half the opening; the piers are 1.5 m wide
DEPTH = 0.6  # half the depth
SPRING = 2.8
R_IN = OPENING
R_OUT = OPENING + 0.28
VOUSSOIRS = 9
CORNICE = 4.6  # the cornice's underside, where the keystone meets it
TOP = 5.0
PORTAL = (0.0, 1.8, 0.0)


def build(seed=41):
    mat = material("plaza-arch", roughness=0.88)
    arch = Part("arch", [mat], seed=seed)
    rng = arch.rng

    # --- piers: a plinth, then rusticated courses, then the impost ------------------------------
    for side in (-1, 1):
        x = side * (OPENING + HALF) / 2
        width = HALF - OPENING
        arch.box((width + 0.06, 0.34, 2 * DEPTH + 0.06), at=(x, 0.17, 0), color=tone(STONE_DARK, rng, 0.04),
                 bevel=0.03)
        courses = 5
        y = 0.34
        top = SPRING - 0.2
        h = (top - y) / courses
        for i in range(courses):
            proud = 0.025 if i % 2 == 0 else 0.0
            arch.box((width + proud * 2 - 0.02, h - 0.03, 2 * DEPTH + proud * 2 - 0.02),
                     at=(x, y + h / 2, 0), color=tone(STONE, rng, 0.06), bevel=0.03)
            y += h
        arch.box((width + 0.16, 0.2, 2 * DEPTH + 0.16), at=(x, SPRING - 0.1, 0),
                 color=tone(STONE_DARK, rng, 0.03), bevel=0.025)

    # --- the wall above the spring: the spandrels, front and back, in courses ----------------
    # Each course is a band either side of the arch, its inner edge the chord of the extrados
    # between the band's top and bottom; the chord lies inside the circle, behind the voussoirs,
    # so no gap opens. Above the crown a course runs straight across.
    def reach(y):
        rise = y - SPRING
        return math.sqrt(max(0.0, R_OUT * R_OUT - rise * rise))

    courses = 5
    band = (CORNICE - SPRING) / courses
    for c in range(courses):
        y0, y1 = SPRING + c * band, SPRING + (c + 1) * band
        colour = tone(STONE, rng, 0.05)
        polys = []
        for z, facing in ((DEPTH, 1), (-DEPTH, -1)):
            if y0 >= SPRING + R_OUT:
                polys.append(([(-HALF, y0, z), (HALF, y0, z), (HALF, y1, z), (-HALF, y1, z)], (0, 0, facing)))
                continue
            for s_ in (-1, 1):
                polys.append(([(s_ * reach(y0), y0, z), (s_ * HALF, y0, z), (s_ * HALF, y1, z),
                               (s_ * reach(y1), y1, z)], (0, 0, facing)))
        faces(arch, polys, colour)
    # The ends of that wall, over the piers.
    faces(arch, [
        ([(s * HALF, SPRING, -DEPTH), (s * HALF, SPRING, DEPTH), (s * HALF, CORNICE, DEPTH),
          (s * HALF, CORNICE, -DEPTH)], (s, 0, 0)) for s in (-1, 1)
    ], tone(STONE, rng, 0.03))

    # --- voussoirs and keystone ----------------------------------------------------------------
    gap = 0.012
    step = math.pi / VOUSSOIRS
    for i in range(VOUSSOIRS):
        a0 = i * step + (gap if i > 0 else 0)
        a1 = (i + 1) * step - (gap if i < VOUSSOIRS - 1 else 0)
        key = i == VOUSSOIRS // 2
        depth = DEPTH + (0.07 if key else 0.035)
        verts = []
        for z in (depth, -depth):
            if key:
                # The keystone widens as it rises and runs up to the cornice.
                verts += [(math.cos(a0) * R_IN, SPRING + math.sin(a0) * R_IN, z),
                          (math.cos(a1) * R_IN, SPRING + math.sin(a1) * R_IN, z),
                          (math.cos(a1) * R_IN - 0.06, CORNICE, z),
                          (math.cos(a0) * R_IN + 0.06, CORNICE, z)]
            else:
                verts += [(math.cos(a0) * R_IN, SPRING + math.sin(a0) * R_IN, z),
                          (math.cos(a1) * R_IN, SPRING + math.sin(a1) * R_IN, z),
                          (math.cos(a1) * R_OUT, SPRING + math.sin(a1) * R_OUT, z),
                          (math.cos(a0) * R_OUT, SPRING + math.sin(a0) * R_OUT, z)]
        quads = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        colour = shade(tone(STONE, rng, 0.06), 1.05 if key else 1.0)
        arch.mesh(verts, quads, color=colour, bevel=0.02)

    # --- cornice and attic ----------------------------------------------------------------------
    arch.box((2 * HALF + 0.16, 0.1, 2 * DEPTH + 0.16), at=(0, CORNICE + 0.05, 0),
             color=tone(STONE_DARK, rng, 0.03))
    arch.box((2 * HALF + 0.36, 0.13, 2 * DEPTH + 0.36), at=(0, CORNICE + 0.165, 0),
             color=tone(STONE_DARK, rng, 0.03), bevel=0.03)
    attic = TOP - (CORNICE + 0.23)
    arch.box((2 * HALF + 0.04, attic, 2 * DEPTH + 0.04), at=(0, TOP - attic / 2, 0),
             color=tone(STONE, rng, 0.04), bevel=0.03)

    # Grime: the stone darkens towards the ground, where the street's dust and rain splash sit.
    layer = arch.bm.loops.layers.color["Col"]
    for face in arch.bm.faces:
        for loop in face.loops:
            y = loop.vert.co.z
            t = max(0.0, 1 - y / 1.2)
            if t > 0:
                loop[layer] = (*mix(loop[layer][:3], GRIME, 0.22 * t * t), loop[layer][3])

    return [arch.build(), empty("portal", PORTAL, size=0.3)]
