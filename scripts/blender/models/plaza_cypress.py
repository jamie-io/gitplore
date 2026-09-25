"""
The Plaza's Italian cypress: a slim green flame about 8 m tall and 1.2 m across.

One node and one material, its pivot at the foot of the trunk, because the game keeps it
wind-animated through `withWind`, which bends a single mesh by height. The crown is one lathe: rings
of ten vertices, each ring turned a little and pushed in and out by noise, so the facets spiral and
bunch like the sprays of a real cypress; a few lumps break the outline. The colour darkens into the
creases and lightens on the upward, sunward faces.
"""

import math

from mathutils import Vector, noise

from kit import Part, hex_rgb, material, mix, smoothstep, tone

TRUNK = hex_rgb("#5a4632")
DARK = hex_rgb("#24452b")
GREEN = hex_rgb("#2f5a35")
LIGHT = hex_rgb("#46784a")

SIDES = 10
# (height, radius) of the crown's rings, bottom to top; the tip closes it at 8 m.
PROFILE = (
    (0.45, 0.26), (0.9, 0.41), (1.6, 0.49), (2.4, 0.51), (3.2, 0.49), (4.0, 0.47), (4.8, 0.43),
    (5.6, 0.36), (6.3, 0.27), (6.9, 0.19), (7.4, 0.11),
)
TIP = 8.0


def build(seed=61):
    leaf = material("plaza-cypress", roughness=0.9)
    part = Part("cypress", [leaf], seed=seed)
    rng = part.rng
    offset = Vector((rng.random() * 40, rng.random() * 40, rng.random() * 40))

    # A short trunk, most of it hidden in the crown.
    part.prism(5, 0.12, 0.09, 0.0, 0.9, color=tone(TRUNK, rng), smooth_angle=60)

    verts = []
    for index, (y, radius) in enumerate(PROFILE):
        turn = index * 0.45 + rng.random() * 0.3
        for side in range(SIDES):
            a = turn + side / SIDES * math.tau
            x, z = math.cos(a), math.sin(a)
            bump = noise.noise(Vector((x * 1.7, y * 0.9, z * 1.7)) + offset)
            r = radius * (1 + 0.22 * bump + (0.07 if side % 2 else -0.05))
            verts.append((x * r, y + (rng.random() - 0.5) * 0.12, z * r))
    faces = []
    for ring in range(len(PROFILE) - 1):
        a, b = ring * SIDES, (ring + 1) * SIDES
        for side in range(SIDES):
            n = (side + 1) % SIDES
            faces.append([a + side, a + n, b + n, b + side])
    tip = len(verts)
    verts.append((0.02, TIP, -0.01))
    top = (len(PROFILE) - 1) * SIDES
    for side in range(SIDES):
        faces.append([top + side, top + (side + 1) % SIDES, tip])
    # The underside of the crown, round the trunk.
    faces.append(list(reversed(range(SIDES))))

    def foliage(centre, normal):
        n = noise.noise(centre * 1.4 + offset) * 0.5 + 0.5
        light = smoothstep(0.1, 0.9, 0.35 + normal.y * 0.35 + normal.x * 0.12 + (n - 0.5) * 0.6)
        colour = mix(DARK, GREEN, min(1.0, n * 1.4)) if light < 0.5 else mix(GREEN, LIGHT, light - 0.4)
        return tone(colour, rng, 0.05)

    part.mesh(verts, faces, color=foliage, smooth_angle=35)

    # Lumps where sprays stand out of the column.
    for y, a, r in ((1.9, 0.6, 0.34), (3.1, 2.8, 0.32), (4.3, 4.6, 0.3), (5.4, 1.6, 0.26),
                    (2.6, 5.4, 0.3)):
        radius = dict(PROFILE)[min(dict(PROFILE), key=lambda h: abs(h - y))] * 0.82
        part.rock(r, at=(math.cos(a) * radius, y, math.sin(a) * radius), squash=(0.8, 1.6, 0.8),
                  subdivisions=0, roughness=0.2, color=foliage, smooth_angle=35)
    return [part.build()]
