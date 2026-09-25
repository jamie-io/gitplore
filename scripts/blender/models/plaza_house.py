"""
The Plaza's town houses: six variants of one Mediterranean house, `build("a")` … `build("f")`.

a, b are 5 m wide, c, d 6 m, e, f 6.5 m; a, c, e have two floors (7 m to the top of the cornice),
b, d, f three (10 m). Every house is 4 m deep, its front on +Z at z = +2 and its footprint centred
on the origin, so it stands flush on the square's facade line; the game stretches the last house
of a row by up to 10 % on X.

The game tints each house per instance, so the parts it colours are nodes of their own, painted
white with the ambient occlusion baked in: `stucco` (walls, pilasters, string courses, the
window reveals) and `shutters`. `awning` (c and f) is white too, in two shades so its stripes
survive the tint. `trim` keeps its colours: stone surrounds and sills, the cornice in
`STONE_DARK`, glass, the door, terracotta roof tiles, iron, flowers. On a, c and e a wall lamp
hangs beside the door with its glass left open; the empty `lamp` marks where the game puts the
bulb.

Only the front and the roof are detailed. The front wall is a grid per floor, cut along that
floor's openings, so the windows are real holes with stucco reveals and the occlusion has
vertices to darken round sills, shutters and the eaves; the seams between floors lie under the
string courses. The top floor of a three-floor house has small mezzanine windows without
shutters. The sides are plain and the back is one quad. The facade helpers
here (`Facade`, `Slope`) also build the corner blocks in `plaza_corner.py`.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from kit import P, Part, hex_rgb, material, mix, shade, tone

WHITE = (1.0, 1.0, 1.0)
GLASS = hex_rgb("#2f3a45")
DOOR = hex_rgb("#5a3a28")
STONE = hex_rgb("#d9cdb5")
STONE_DARK = hex_rgb("#cfc1a6")
TILES = [hex_rgb(h) for h in ("#b8583a", "#a84f36", "#c46a45")]
TILE = TILES[0]
IRON = hex_rgb("#2a2d33")
FRAME = hex_rgb("#e9e2d2")
POT = hex_rgb("#a85a3c")
BLOOMS = [hex_rgb(h) for h in ("#e8409a", "#c92a78", "#f06aa8")]
LEAVES = [hex_rgb(h) for h in ("#4f7a35", "#3f6a2f", "#5f8a3a")]

DEPTH = 4.0
FRONT = DEPTH / 2
CORNICE = 0.45  # the cornice's height under the eaves
EAVE = 0.4  # how far the roof reaches out past the front
PITCH = math.radians(24)
REVEAL = 0.14  # how deep the windows sit in the wall
SOCLE = 0.45
PILASTER = 0.25

# columns: window axes across the front; door: the column of the door; awning: the columns under
# the awning, whose ground-floor openings are shop windows; feature: one balcony or window box.
VARIANTS = {
    "a": dict(width=5.0, floors=2, columns=2, door=0, lamp=True, awning=(), feature=("box", 1, 1),
              flowers=True, chimney=None),
    "b": dict(width=5.0, floors=3, columns=2, door=1, lamp=False, awning=(),
              feature=("balcony", 1, (0, 1)), flowers=False, chimney=None),
    "c": dict(width=6.0, floors=2, columns=2, door=0, lamp=True, awning=(1,), feature=("box", 1, 0),
              flowers=False, chimney=-1.6),
    "d": dict(width=6.0, floors=3, columns=2, door=1, lamp=False, awning=(),
              feature=("balcony", 1, (0,)), flowers=True, chimney=1.9),
    "e": dict(width=6.5, floors=2, columns=3, door=1, lamp=True, awning=(),
              feature=("balcony", 1, (1,)), flowers=False, chimney=None),
    "f": dict(width=6.5, floors=3, columns=3, door=2, lamp=False, awning=(0, 1),
              feature=("box", 2, 1), flowers=False, chimney=None),
}


def height_of(variant):
    return 7.0 if VARIANTS[variant]["floors"] == 2 else 10.0


# --- geometry helpers -------------------------------------------------------------------------------


def faces(part, polys, color, slot=0, smooth_angle=None):
    """
    Adds polygons given as game points, each with the direction it must face: open surfaces
    (a wall with holes, a tile sheet) have no inside for `recalc_face_normals` to find, so every
    polygon is wound to face the way it was asked to.
    """
    tmp = bmesh.new()
    cache = {}

    def vert(p):
        key = tuple(round(c, 5) for c in p)
        if key not in cache:
            cache[key] = tmp.verts.new(P(*p))
        return cache[key]

    for points, facing in polys:
        verts = [vert(p) for p in points]
        face = tmp.faces.new(verts)
        face.normal_update()
        want = P(*facing)
        if face.normal.dot(want) < 0:
            face.normal_flip()
    return part._merge(tmp, Matrix.Identity(4), color, slot, smooth_angle, 0, 0, None)


class Facade:
    """
    A wall's own frame: u runs along the wall (to the right seen from outside), v up, w out of
    it. `yaw` turns the frame about Y (0: the wall faces +Z), `origin` is where u = v = w = 0.
    """

    def __init__(self, yaw=0.0, origin=(0.0, 0.0, 0.0)):
        self.yaw = yaw
        self.origin = origin

    def point(self, u, v, w):
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        ox, oy, oz = self.origin
        return (ox + u * c + w * s, oy + v, oz - u * s + w * c)

    def direction(self, u, v, w):
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        return (u * c + w * s, v, -u * s + w * c)

    def box(self, part, size, at, color, tilt=0.0, swing=0.0, bevel=0.0, slot=0):
        return part.box(size, at=self.point(*at), rot=(tilt, self.yaw + swing, 0), color=color,
                        bevel=bevel, slot=slot)

    def polys(self, part, polys, color, slot=0):
        """Polygons in the facade frame: ([(u, v, w), …], (du, dv, dw) facing)."""
        return faces(part, [([self.point(*p) for p in pts], self.direction(*n)) for pts, n in polys],
                     color, slot)

    def wall(self, part, u0, u1, v0, v1, holes, cuts_u=(), cuts_v=(), color=WHITE, depth=REVEAL):
        """
        The wall face from u0 to u1 and v0 to v1 as a grid cut along every hole and extra cut,
        with the holes (u0, u1, v0, v1) left open and lined with reveals `depth` deep.
        """
        us = sorted({round(x, 4) for x in (u0, u1, *cuts_u, *(h[i] for h in holes for i in (0, 1)))
                     if u0 <= x <= u1})
        vs = sorted({round(y, 4) for y in (v0, v1, *cuts_v, *(h[i] for h in holes for i in (2, 3)))
                     if v0 <= y <= v1})
        polys = []
        for i in range(len(us) - 1):
            for j in range(len(vs) - 1):
                cu, cv = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
                if any(h[0] < cu < h[1] and h[2] < cv < h[3] for h in holes):
                    continue
                polys.append((
                    [(us[i], vs[j], 0), (us[i + 1], vs[j], 0), (us[i + 1], vs[j + 1], 0),
                     (us[i], vs[j + 1], 0)],
                    (0, 0, 1),
                ))
        for a0, a1, b0, b1 in holes:
            d = -depth
            polys += [
                ([(a0, b0, 0), (a0, b1, 0), (a0, b1, d), (a0, b0, d)], (1, 0, 0)),
                ([(a1, b0, 0), (a1, b0, d), (a1, b1, d), (a1, b1, 0)], (-1, 0, 0)),
                ([(a0, b1, 0), (a1, b1, 0), (a1, b1, d), (a0, b1, d)], (0, -1, 0)),
            ]
            if b0 > v0 + 1e-3:
                polys.append(([(a0, b0, 0), (a0, b0, d), (a1, b0, d), (a1, b0, 0)], (0, 1, 0)))
        return self.polys(part, polys, color)

    def ring(self, part, a0, a1, b0, b1, width, proud, color, bottom=True):
        """A flat band `width` wide round an opening, `proud` off the wall."""
        o = [(a0 - width, b0 - (width if bottom else 0)), (a1 + width, b0 - (width if bottom else 0)),
             (a1 + width, b1 + width), (a0 - width, b1 + width)]
        i = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
        w = proud
        polys = []
        sides = range(4) if bottom else (1, 2, 3)
        for k in sides:
            n = (k + 1) % 4
            polys.append(([(*o[k], w), (*o[n], w), (*i[n], w), (*i[k], w)], (0, 0, 1)))
        # Its edges are a few centimetres deep and never read from the square, so they are left
        # open.
        return self.polys(part, polys, color)


class Slope:
    """
    A roof slope's frame: u along the eave, s up the slope from the eave, n out of the roof.
    `eave` is the game point at u = s = 0; `along` and `up` the unit directions of u and s.
    """

    def __init__(self, eave, along, up):
        self.o = Vector(eave)
        self.u = Vector(along).normalized()
        self.s = Vector(up).normalized()
        self.n = self.s.cross(self.u).normalized()
        if self.n.y < 0:
            self.n = -self.n

    def point(self, u, s, h=0.0):
        return tuple(self.o + self.u * u + self.s * s + self.n * h)

    def tiles(self, part, u0, u1, s0, s1, rng, courses=1, pitch=0.32, lift=0.035, relief=0.07,
              top=None, colours=TILES):
        """
        Barrel tiles in columns down the slope from s1 to the eave at s0, in `courses` rows that
        each sit `lift` on the one below, so the rows step like laid tiles. `top(u)` limits a
        column's upper end (a hip), else every column runs to s1. Each column and course is its
        own tone, and the eave shows the rounded ends.
        """
        count = max(1, round((u1 - u0) / pitch))
        width = (u1 - u0) / count
        profile = ((0.0, 0.0), (0.22, 1.0), (0.78, 1.0), (1.0, 0.0))
        down = tuple(-self.s)
        polys_by_colour = []
        for k in range(count):
            a = u0 + k * width
            end = top(a + width / 2) if top else s1
            if end <= s0 + 0.05:
                continue
            span = (end - s0) / courses
            for c in range(courses):
                lo = s0 + c * span - (0.06 if c else 0)
                hi = s0 + (c + 1) * span
                h0 = c * lift
                colour = tone(mix(colours[0], colours[(k * 7 + c * 3) % len(colours)], 0.5), rng, 0.09)
                pts = [(a + f * width, relief * r + h0) for f, r in profile]
                polys = []
                for (ua, ha), (ub, hb) in zip(pts, pts[1:]):
                    polys.append((
                        [self.point(ua, lo, ha), self.point(ub, lo, hb), self.point(ub, hi, hb),
                         self.point(ua, hi, ha)],
                        tuple(self.n),
                    ))
                polys.append(([self.point(ua, lo, ha) for ua, ha in pts], down))
                polys_by_colour.append((polys, colour))
        for polys, colour in polys_by_colour:
            faces(part, polys, colour)


def empty(name, at, size=0.12):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = size
    obj.location = P(*at)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def shutter(facade, part, u, v0, height, width, side, rng, swing=0.18):
    """
    One louvred shutter, hinged at u and folded back against the wall on `side` (−1 left, +1
    right), stood a touch open so it throws a shadow. The panel is its louvres: a sawtooth of
    slats down its face, closed along its free edge (the hinge edge is against the wall, and the
    top is never seen from the square).
    """
    thick = 0.035
    a = -side * swing  # the panel's yaw in the facade
    c, s = math.cos(a), math.sin(a)

    def at(du, v, dw):
        # du along the panel from the hinge towards its free edge, dw off the wall.
        x = side * du
        return (u + x * c + dw * s, v, 0.03 - x * s + dw * c)

    slats = max(3, round(height / 0.28))
    step = height / slats
    free = width
    polys = []
    for i in range(slats):
        top = v0 + height - i * step
        bottom = top - step
        polys.append(([at(0, bottom, thick), at(free, bottom, thick), at(free, top, thick * 0.3),
                       at(0, top, thick * 0.3)], (side * s * 0.3, 0.3, c)))
        polys.append(([at(0, bottom, thick * 0.3), at(free, bottom, thick * 0.3),
                       at(free, bottom, thick), at(0, bottom, thick)], (0, -1, 0)))
    polys.append(([at(free, v0, 0), at(free, v0 + height, 0), at(free, v0 + height, thick * 0.3),
                   at(free, v0 + step * (slats - 1), thick), at(free, v0, thick)],
                  (side * c, 0, -side * s)))
    facade.polys(part, polys, tone(WHITE, rng, 0.03))


# --- the house --------------------------------------------------------------------------------------


def build(variant="a", seed=None):
    spec = VARIANTS[variant]
    width = spec["width"]
    height = height_of(variant)
    floors = spec["floors"]
    seed = seed if seed is not None else 11 + "abcdef".index(variant)

    mat = material("plaza-house", roughness=0.9)
    stucco = Part("stucco", [mat], seed=seed)
    shutters = Part("shutters", [mat], seed=seed + 1)
    trim = Part("trim", [mat], seed=seed + 2)
    awning = Part("awning", [mat], seed=seed + 3) if spec["awning"] else None
    rng = trim.rng

    front = Facade(0.0, (0.0, 0.0, FRONT))
    half = width / 2
    storey = (height - CORNICE) / floors
    margin = PILASTER + 0.1
    spacing = (width - 2 * margin) / spec["columns"]
    axes = [-half + margin + spacing * (i + 0.5) for i in range(spec["columns"])]
    window_w = min(1.0, spacing * 0.42)
    kind, feature_floor, feature_cols = spec["feature"]
    feature_cols = feature_cols if isinstance(feature_cols, tuple) else (feature_cols,)

    openings = []  # (kind, u0, u1, v0, v1, floor, column)
    for floor in range(floors):
        base = floor * storey
        for column, u in enumerate(axes):
            if floor == 0 and column == spec["door"]:
                dw = 1.15
                openings.append(("door", u - dw / 2, u + dw / 2, 0.0, 2.75, floor, column))
            elif floor == 0 and column in spec["awning"]:
                sw = spacing - 0.5
                openings.append(("shop", u - sw / 2, u + sw / 2, SOCLE + 0.1, 2.6, floor, column))
            elif kind == "balcony" and floor == feature_floor and column in feature_cols:
                openings.append(("french", u - window_w / 2, u + window_w / 2, base + 0.14,
                                 base + 2.35, floor, column))
            elif floors == 3 and floor == floors - 1:
                # The top floor of a tall house: small mezzanine windows without shutters.
                sill = base + 1.0
                openings.append(("attic", u - window_w / 2, u + window_w / 2, sill, sill + 0.95,
                                 floor, column))
            else:
                sill = base + (1.0 if floor == 0 else 0.9)
                openings.append(("window", u - window_w / 2, u + window_w / 2, sill, sill + 1.4,
                                 floor, column))
    holes = [o[1:5] for o in openings]

    # --- stucco: walls, pilasters, string courses, gables, back ---------------------------------
    ridge = height + 0.12 + FRONT * math.tan(PITCH)
    # One grid per floor, cut only along that floor's openings; the seams between floors lie
    # under the string courses.
    for f in range(floors):
        lo = f * storey
        hi = height if f == floors - 1 else (f + 1) * storey
        front.wall(stucco, -half, half, lo, hi, [h for h in holes if lo <= h[2] < hi])
    gable = ridge - 0.08
    eaves_y = height + 0.04
    polys = [
        # Sides: the wall and the gable in one pentagon each.
        ([(half, 0, FRONT), (half, 0, -FRONT), (half, eaves_y, -FRONT), (half, gable, 0),
          (half, eaves_y, FRONT)], (1, 0, 0)),
        ([(-half, 0, FRONT), (-half, 0, -FRONT), (-half, eaves_y, -FRONT), (-half, gable, 0),
          (-half, eaves_y, FRONT)], (-1, 0, 0)),
        # The back, one quad.
        ([(-half, 0, -FRONT), (half, 0, -FRONT), (half, eaves_y, -FRONT), (-half, eaves_y, -FRONT)],
         (0, 0, -1)),
        # The strip of wall between the cornice and the roof.
        ([(-half, height, FRONT), (half, height, FRONT), (half, eaves_y, FRONT),
          (-half, eaves_y, FRONT)], (0, 0, 1)),
    ]
    faces(stucco, polys, WHITE)
    for u in (-half + PILASTER / 2, half - PILASTER / 2):
        front.box(stucco, (PILASTER, height - CORNICE - SOCLE, 0.05),
                  (u, SOCLE + (height - CORNICE - SOCLE) / 2, 0.025), WHITE)
    for f in range(1, floors):
        front.box(stucco, (width - 2 * PILASTER, 0.14, 0.06), (0, storey * f + 0.02, 0.03),
                  shade(WHITE, 0.97))

    # --- trim: socle, cornice, surrounds, sills, glass, doors --------------------------------------
    door = next(o for o in openings if o[0] == "door")
    socle_breaks = [(-half, door[1] - 0.12), (door[2] + 0.12, half)]
    for a, b in socle_breaks:
        if b - a > 0.05:
            front.box(trim, (b - a, SOCLE, 0.06), ((a + b) / 2, SOCLE / 2, 0.03),
                      tone(STONE_DARK, rng, 0.04))
    front.box(trim, (width, 0.16, 0.1), (0, height - CORNICE + 0.08, 0.05), tone(STONE_DARK, rng, 0.03))
    front.box(trim, (width, 0.12, 0.2), (0, height - CORNICE + 0.22, 0.1), tone(STONE_DARK, rng, 0.03))
    front.box(trim, (width, 0.17, 0.3), (0, height - 0.165, 0.15), tone(STONE_DARK, rng, 0.03))

    lamp = None
    for kind_, a0, a1, b0, b1, floor, column in openings:
        u = (a0 + a1) / 2
        ow = a1 - a0
        glass_w = -REVEAL + 0.02
        if kind_ in ("window", "french", "shop", "attic"):
            front.ring(trim, a0, a1, b0, b1, 0.1, 0.025, tone(STONE, rng, 0.03),
                       bottom=kind_ != "shop")
            if kind_ in ("window", "attic"):
                front.box(trim, (ow + 0.3, 0.07, 0.16), (u, b0 - 0.1, 0.06), tone(STONE_DARK, rng, 0.03))
            # Glass, and the painted frame over it: a rim and a cross.
            gw, gh = ow, b1 - b0
            front.polys(trim, [([(a0, b0, glass_w), (a1, b0, glass_w), (a1, b1, glass_w),
                                 (a0, b1, glass_w)], (0, 0, 1))], tone(GLASS, rng, 0.05))
            # The glazing bars; the reveal frames the glass well enough on its own.
            fz = glass_w + 0.015
            bars = [(u, (b0 + b1) / 2, 0.05, gh)]
            if kind_ != "french":
                bars.append((u, b0 + gh * 0.62, gw, 0.05))
            if kind_ == "shop":
                bars = [(a0 + ow / 3, (b0 + b1) / 2, 0.05, gh), (a0 + 2 * ow / 3, (b0 + b1) / 2, 0.05, gh),
                        (u, b1 - 0.45, gw, 0.05)]
            for bu, bv, bw, bh in bars:
                front.polys(trim, [([(bu - bw / 2, bv - bh / 2, fz), (bu + bw / 2, bv - bh / 2, fz),
                                     (bu + bw / 2, bv + bh / 2, fz), (bu - bw / 2, bv + bh / 2, fz)],
                                    (0, 0, 1))], FRAME)
            if kind_ in ("window", "french"):
                sh_h = b1 - b0 + 0.02
                for side in (-1, 1):
                    hinge = (a0 - 0.1) if side < 0 else (a1 + 0.1)
                    shutter(front, shutters, hinge, b0 - 0.01, sh_h, ow / 2, side, shutters.rng)
        elif kind_ == "door":
            front.ring(trim, a0, a1, b0, b1, 0.14, 0.03, tone(STONE, rng, 0.03), bottom=False)
            front.box(trim, (0.34, 0.26, 0.07), (u, b1 + 0.1, 0.06), tone(STONE_DARK, rng, 0.03))
            leaf_w = -REVEAL - 0.04
            door_top = 2.3
            front.polys(trim, [([(a0, 0, leaf_w), (a1, 0, leaf_w), (a1, door_top, leaf_w),
                                 (a0, door_top, leaf_w)], (0, 0, 1))], tone(DOOR, rng, 0.05))
            for side in (-1, 1):
                front.box(trim, (ow / 2 - 0.16, 1.85, 0.04), (u + side * ow / 4, 1.15, leaf_w + 0.02),
                          tone(shade(DOOR, 1.12), rng, 0.04))
            front.box(trim, (0.02, door_top, 0.03), (u, door_top / 2, leaf_w + 0.015), shade(DOOR, 0.7))
            front.box(trim, (ow, 0.08, 0.06), (u, door_top + 0.04, leaf_w + 0.03), tone(DOOR, rng, 0.04))
            front.polys(trim, [([(a0, door_top + 0.08, leaf_w), (a1, door_top + 0.08, leaf_w),
                                 (a1, b1, leaf_w), (a0, b1, leaf_w)], (0, 0, 1))], GLASS)
            front.box(trim, (0.04, b1 - door_top - 0.08, 0.03),
                      (u, (b1 + door_top + 0.08) / 2, leaf_w + 0.015), FRAME)
            front.box(trim, (ow + 0.5, 0.12, 0.4), (u, 0.06, 0.2), tone(STONE_DARK, rng, 0.04))

            side = lamp_side(openings, u, ow, half)
            if spec["lamp"]:
                lamp = wall_lamp(front, trim, u + side[0] * side[1], rng)
            if spec["flowers"]:
                bougainvillea(front, trim, u, ow, -side[0] if spec["lamp"] else side[0], half, rng)

    # --- the feature: one balcony or one window box -------------------------------------------
    if kind == "balcony":
        cols = [o for o in openings if o[0] == "french"]
        a = min(o[1] for o in cols) - 0.35
        b = max(o[2] for o in cols) + 0.35
        balcony(front, trim, a, b, feature_floor * storey, rng)
    else:
        target = next(o for o in openings if o[5] == feature_floor and o[6] == feature_cols[0])
        window_box(front, trim, target[1], target[2], target[3], rng)

    if awning is not None:
        shops = [o for o in openings if o[0] == "shop"]
        a = min(o[1] for o in shops) - 0.25
        b = max(o[2] for o in shops) + 0.25
        canopy(front, awning, trim, a, b, rng)

    # --- roof -----------------------------------------------------------------------------------
    roof(trim, stucco, width, height, ridge, spec["chimney"], rng)

    objects = [stucco.build(), shutters.build(), trim.build()]
    if awning is not None:
        objects.append(awning.build())
    if lamp is not None:
        objects.append(empty("lamp", lamp))
    return objects


def roof(trim, stucco, width, height, ridge, chimney, rng):
    half = width / 2
    slope = math.tan(PITCH)
    base = height + 0.12  # the roof's surface above the front wall
    eave_z = FRONT + EAVE
    eave_y = base - EAVE * slope
    front = Slope((-half, eave_y, eave_z), (1, 0, 0), (0, math.sin(PITCH), -math.cos(PITCH)))
    run = eave_z / math.cos(PITCH)
    front.tiles(trim, 0.0, width, 0.0, run, rng)
    # The back: one quad from the ridge to the back eave, and the soffit under the front eave.
    back_y = base - EAVE * slope
    faces(trim, [([(-half, back_y, -eave_z), (half, back_y, -eave_z), (half, ridge, 0),
                   (-half, ridge, 0)], (0, 1, -0.4))], tone(TILE, rng, 0.05))
    faces(trim, [([(-half, height, FRONT), (half, height, FRONT), (half, eave_y - 0.02, eave_z),
                   (-half, eave_y - 0.02, eave_z)], (0, -1, 0))], shade(TILE, 0.7))
    # The ridge: a row of capping tiles, and a verge tile down each gable.
    trim.prism(6, 0.11, 0.11, -half, half, at=(0, ridge + 0.07, 0), rot=(0, 0, -math.pi / 2),
               color=tone(TILES[1], rng, 0.05), smooth_angle=70)
    for x in (-half + 0.06, half - 0.06):
        trim.box((0.12, 0.07, eave_z / math.cos(PITCH)),
                 at=(x, (ridge + eave_y) / 2 + 0.08, eave_z / 2),
                 rot=(PITCH, 0, 0), color=tone(TILES[2], rng, 0.05))
    if chimney is not None:
        cz = -0.7
        cy = ridge - 0.7 * slope
        stucco.box((0.55, 1.5, 0.55), at=(chimney, cy + 0.55, cz), color=WHITE)
        trim.box((0.7, 0.08, 0.7), at=(chimney, cy + 1.34, cz), color=tone(STONE_DARK, rng, 0.03))
        trim.prism(4, 0.42, 0.05, 0, 0.3, at=(chimney, cy + 1.38, cz), twist=math.pi / 4,
                   color=tone(TILE, rng, 0.05))


def lamp_side(openings, door_u, door_w, half):
    """
    Which side of the door has the most bare wall on the ground floor, and how far from the
    door's centre a lamp sits there: (side, distance).
    """
    ring = door_w / 2 + 0.14
    taken = [(-9.0, -half + PILASTER), (half - PILASTER, 9.0)]
    for kind, a0, a1, _b0, _b1, floor, _col in openings:
        if floor != 0 or kind == "door":
            continue
        reach = 0.1 if kind == "shop" else 0.1 + (a1 - a0) / 2  # surround, or surround + shutter
        taken.append((a0 - reach - (0.25 if kind == "shop" else 0), a1 + reach))
    left = max(b for a, b in taken if b <= door_u - ring + 1e-6)
    right = min(a for a, b in taken if a >= door_u + ring - 1e-6)
    rooms = {-1: door_u - ring - left, 1: right - door_u - ring}
    side = -1 if rooms[-1] > rooms[1] else 1
    return side, ring + min(rooms[side] / 2, 0.3)


def wall_lamp(front, trim, u, rng):
    """An iron lantern on a bracket beside the door; returns where its bulb goes."""
    y = 2.6
    out = 0.36
    front.box(trim, (0.12, 0.22, 0.03), (u, y + 0.3, 0.015), IRON)  # the wall plate
    front.box(trim, (0.035, 0.035, out), (u, y + 0.38, out / 2), IRON)  # the arm
    # The lantern: a pyramid cap, four corner posts, a base; the glass between is the game's.
    trim.prism(4, 0.13, 0.03, 0, 0.12, at=front.point(u, y + 0.2, out), twist=math.pi / 4,
               color=IRON)
    trim.prism(4, 0.07, 0.1, -0.06, 0, at=front.point(u, y - 0.12, out), twist=math.pi / 4,
               color=IRON)
    for du in (-0.07, 0.07):
        for dw in (-0.07, 0.07):
            trim.prism(3, 0.012, 0.012, -0.12, 0.2, at=front.point(u + du, y, out + dw), caps=False,
                       color=IRON)
    return front.point(u, y + 0.04, out)


def bougainvillea(front, trim, door_u, door_w, side, half, rng):
    """A bougainvillea spilling over the door and down one side of it."""
    edge = door_w / 2 + 0.2
    # An arch of small clusters over the door, trailing down one side; the green ones are leaves.
    spots = [(-side * 0.45, 2.98, 0.22, 0.92), (-side * 0.1, 3.08, 0.26, 0.05), (side * 0.3, 3.05, 0.25, 0.1),
             (side * (edge - 0.05), 2.85, 0.24, 0.92), (side * edge, 2.5, 0.23, 0.08),
             (side * (edge + 0.03), 2.12, 0.2, 0.15)]
    for i, (du, v, r, leaf) in enumerate(spots):
        colour = mix(BLOOMS[i % 3], LEAVES[i % 3], leaf)
        u = max(-half + 0.35, min(half - 0.35, door_u + du))
        trim.rock(r, at=front.point(u, v, 0.1), squash=(1.35, 0.9, 0.6),
                  color=tone(colour, rng, 0.08), subdivisions=1, roughness=0.5)


def window_box(front, trim, a0, a1, sill, rng):
    """A terracotta trough of geraniums on the sill of one window."""
    w = a1 - a0 + 0.2
    u = (a0 + a1) / 2
    front.box(trim, (w, 0.2, 0.24), (u, sill - 0.02, 0.14), tone(POT, rng, 0.05))
    front.box(trim, (w - 0.08, 0.05, 0.2), (u, sill + 0.09, 0.14), shade(LEAVES[1], 0.8))
    count = 3
    for i in range(count):
        du = (i + 0.5) / count * (w - 0.1) - (w - 0.1) / 2
        colour = (BLOOMS[0], mix(BLOOMS[2], LEAVES[0], 0.3), BLOOMS[1])[i]
        trim.rock(0.15, at=front.point(u + du, sill + 0.14, 0.15 + (i % 2) * 0.03),
                  squash=(1.1, 0.8, 0.9), color=tone(colour, rng, 0.08), subdivisions=1,
                  roughness=0.35)


def balcony(front, trim, a, b, floor_y, rng):
    """A stone slab on two corbels with an iron railing, across the French windows above it."""
    depth = 0.7
    width = b - a
    u = (a + b) / 2
    front.box(trim, (width, 0.14, depth), (u, floor_y + 0.07, depth / 2), tone(STONE, rng, 0.03))
    for cu in (a + 0.2, b - 0.2):
        front.polys(trim, corbel(cu, floor_y, depth), tone(STONE_DARK, rng, 0.03))
    rail_y = floor_y + 0.14
    top = 0.95
    edge = depth - 0.05
    front.box(trim, (width, 0.04, 0.05), (u, rail_y + top, edge), IRON)
    front.box(trim, (width, 0.03, 0.03), (u, rail_y + 0.1, edge), IRON)
    for side_u in (a + 0.025, b - 0.025):
        front.box(trim, (0.05, 0.04, depth - 0.05), (side_u, rail_y + top, (depth - 0.05) / 2), IRON)
    # Bars: open three-sided prisms, their ends hidden in the rail and the slab.
    bars = max(4, round(width / 0.2))
    spots = [(a + 0.025 + i * (width - 0.05) / bars, edge) for i in range(bars + 1)]
    spots += [(side_u, dw) for side_u in (a + 0.025, b - 0.025) for dw in (0.22, 0.44)]
    for bu, bw in spots:
        trim.prism(3, 0.014, 0.014, 0, top, at=front.point(bu, rail_y, bw), caps=False, color=IRON)


def corbel(u, floor_y, depth):
    """A wedge under the slab, deep at the wall and tapering out; polygons in the facade frame."""
    hw = 0.09
    d = depth - 0.12
    top = floor_y
    pts = [(-hw, top, 0), (hw, top, 0), (hw, top, d), (-hw, top, d),
           (-hw, top - 0.4, 0), (hw, top - 0.4, 0), (hw, top - 0.06, d), (-hw, top - 0.06, d)]
    pts = [(u + x, y, w) for x, y, w in pts]
    return [
        ([pts[4], pts[5], pts[6], pts[7]], (0, -1, 0.8)),
        ([pts[3], pts[2], pts[6], pts[7]], (0, 0, 1)),
        ([pts[0], pts[3], pts[7], pts[4]], (-1, 0, 0)),
        ([pts[1], pts[5], pts[6], pts[2]], (1, 0, 0)),
    ]


def canopy(front, awning, trim, a, b, rng):
    """
    A striped canvas awning over the shop windows: a sloping sheet with a scalloped valance, drawn
    both ways so it is not see-through from beneath. The stripes alternate white and a light grey,
    so they survive the instance tint as two shades of its colour.
    """
    top_v = 3.0
    out = 1.15
    drop = 0.5
    valance = 0.2
    stripes = max(4, round((b - a) / 0.34))
    step = (b - a) / stripes
    # [outside, underside] × [light, dark]: each its own call, so the two sides of the canvas
    # do not share vertices (and a face that already exists the other way round).
    groups = {(side, shade_): [] for side in (0, 1) for shade_ in (0, 1)}
    for i in range(stripes):
        u0 = a + i * step
        u1 = u0 + step
        sheet = [(u0, top_v, 0.03), (u1, top_v, 0.03), (u1, top_v - drop, out), (u0, top_v - drop, out)]
        flap = [(u0, top_v - drop, out), (u1, top_v - drop, out), (u1, top_v - drop - valance, out),
                ((u0 + u1) / 2, top_v - drop - valance - 0.08, out), (u0, top_v - drop - valance, out)]
        groups[(0, i % 2)] += [(sheet, (0, 1, 0.4)), (flap, (0, 0, 1))]
        groups[(1, i % 2)] += [(sheet, (0, -1, -0.4)), (flap, (0, 0, -1))]
    for u in (a, b):
        cheek = [(u, top_v, 0.03), (u, top_v - drop, out), (u, top_v - drop - valance, out)]
        groups[(0, 1)].append((cheek, (1 if u == b else -1, 0, 0)))
        groups[(1, 1)].append((cheek, (-1 if u == b else 1, 0, 0)))
    for (side, dark), polys in groups.items():
        front.polys(awning, polys, shade(WHITE, (0.78 if dark else 1.0) * (0.9 if side else 1.0)))
    # The iron arms that hold it out.
    for u in (a + 0.08, b - 0.08):
        front.box(trim, (0.03, 0.03, 1.2), (u, top_v - drop / 2 - 0.12, out / 2), IRON,
                  tilt=math.atan2(drop, out) - 0.2)
