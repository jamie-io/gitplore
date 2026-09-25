"""
The modelling kit the authored models are built with (IMPLEMENTATION_PLAN.md §8 conventions).

Everything here speaks the game's frame, not Blender's: +Y up, +Z towards the viewer, metres, the
origin at the ground centre. `P` converts a game point to Blender's Z-up frame, and the glTF
exporter's +Y-up conversion turns it back, so a box placed at game (x, y, z) lands at (x, y, z).

A model is a handful of `Part`s. A part is one mesh (one glTF node) that collects many small
primitives, each painted with a flat or computed colour per face, and one material slot per
distinct material. Colour lives in a corner colour attribute rather than in textures: detail comes
from the shapes, the per-block tone and the ambient occlusion baked into the same attribute, so a
model costs no texture memory and one draw call per material.
"""

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

COLOR = "Col"


# --- colours ----------------------------------------------------------------------------------------


def hex_rgb(value):
    """'#e0a13c' → (r, g, b) in 0–1 sRGB, the space the corner byte colours are stored in."""
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))


def shade(rgb, factor):
    return tuple(max(0.0, min(1.0, c * factor)) for c in rgb)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def tone(rgb, rng, spread=0.08):
    """The same colour a touch lighter or darker, so neighbouring blocks never match exactly."""
    return shade(rgb, 1 + (rng.random() - 0.5) * 2 * spread)


def mossy(stone, moss, seed=0, above=0.55, scale=1.6, amount=1.0):
    """
    A face colour that grows moss on faces looking up and fades it down the sides with a noise
    mask, the way moss sits on the tops and ledges of old stone.
    """
    offset = Vector((seed * 13.7, seed * 5.3, seed * 9.1))

    def paint(centre, normal):
        up = max(0.0, normal.y)
        n = noise.noise(centre * scale + offset) * 0.5 + 0.5
        cover = smoothstep(above - 0.25, above + 0.2, up * 0.8 + n * 0.45) * amount
        return mix(stone, moss, min(1.0, cover))

    return paint


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# --- frames -----------------------------------------------------------------------------------------


def P(x, y, z):
    """Game point → Blender point."""
    return Vector((x, -z, y))


def game_vector(v):
    """Blender direction or point → game."""
    return Vector((v.x, v.z, -v.y))


def placement(at=(0, 0, 0), rot=(0, 0, 0)):
    """
    A Blender matrix placing a primitive built around the origin: `rot` is Euler XYZ in radians
    about the game's axes, `at` a game point.
    """
    rx, ry, rz = rot
    # Game X, Y, Z are Blender X, Z, -Y.
    rotation = (
        Matrix.Rotation(-rz, 4, "Y") @ Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(rx, 4, "X")
    )
    return Matrix.Translation(P(*at)) @ rotation


# --- materials --------------------------------------------------------------------------------------


def material(name, roughness=0.9, metallic=0.0, vertex=True, emissive=None, strength=1.0,
             double_sided=False, base=(1, 1, 1)):
    """
    A glTF-friendly Principled material. With `vertex` the base colour is the corner colour
    attribute (exported as COLOR_0); `emissive` is an sRGB hex glow.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double_sided
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Base Color"].default_value = (*srgb_to_linear(base), 1)
    if vertex:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = COLOR
        mat.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*srgb_to_linear(hex_rgb(emissive)), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def srgb_to_linear(rgb):
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


# --- parts ------------------------------------------------------------------------------------------


class Part:
    """One exported node: a bmesh collecting primitives, each face tagged with colour + material."""

    def __init__(self, name, materials, seed=1):
        self.name = name
        self.materials = list(materials)
        self.rng = random.Random(seed)
        self.bm = bmesh.new()
        self.bm.loops.layers.color.new(COLOR)

    # Every primitive is built in its own bmesh around the origin, finished (bevel, jitter,
    # shading) and then merged in through a temporary mesh.
    def _merge(self, tmp, matrix, color, slot, smooth_angle, bevel, jitter, jitter_seed):
        if bevel:
            bmesh.ops.bevel(
                tmp,
                geom=list(tmp.edges),
                offset=bevel,
                offset_type="OFFSET",
                segments=1,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
        if jitter:
            rng = random.Random(jitter_seed if jitter_seed is not None else self.rng.random())
            moved = {}
            for v in tmp.verts:
                key = tuple(round(c, 4) for c in v.co)
                if key not in moved:
                    moved[key] = Vector(
                        ((rng.random() - 0.5), (rng.random() - 0.5), (rng.random() - 0.5))
                    ) * (2 * jitter)
                v.co += moved[key]
        bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts)
        tmp.normal_update()
        mesh = bpy.data.meshes.new("tmp")
        tmp.to_mesh(mesh)
        tmp.free()
        start = len(self.bm.faces)
        self.bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        self.bm.faces.ensure_lookup_table()
        self.bm.edges.ensure_lookup_table()
        layer = self.bm.loops.layers.color[COLOR]
        new_faces = self.bm.faces[start:]
        for face in new_faces:
            face.normal_update()
            face.material_index = slot
            face.smooth = smooth_angle is not None
            rgb = color(game_vector(face.calc_center_median()), game_vector(face.normal)) if callable(color) else color
            for loop in face.loops:
                loop[layer] = (*rgb, 1.0)
        if smooth_angle is not None:
            for face in new_faces:
                for edge in face.edges:
                    if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > math.radians(smooth_angle):
                        edge.smooth = False
        return new_faces

    def box(self, size, at=(0, 0, 0), rot=(0, 0, 0), color=(1, 1, 1), slot=0, bevel=0.0,
            jitter=0.0, smooth_angle=None, seed=None):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        sx, sy, sz = size
        bmesh.ops.scale(tmp, vec=Vector((sx, sz, sy)), verts=tmp.verts)
        return self._merge(tmp, placement(at, rot), color, slot, smooth_angle, bevel, jitter, seed)

    def prism(self, sides, r0, r1, y0, y1, at=(0, 0, 0), rot=(0, 0, 0), color=(1, 1, 1), slot=0,
              bevel=0.0, jitter=0.0, smooth_angle=None, twist=0.0, caps=True, seed=None,
              scale_z=1.0):
        """A frustum along game +Y from y0 to y1 (a cylinder when r0 == r1, a cone when r1 == 0)."""
        tmp = bmesh.new()
        bmesh.ops.create_cone(
            tmp,
            cap_ends=caps,
            cap_tris=False,
            segments=sides,
            radius1=r0,
            radius2=max(r1, 1e-5),
            depth=y1 - y0,
        )
        bmesh.ops.rotate(tmp, cent=Vector(), matrix=Matrix.Rotation(twist, 3, "Z"), verts=tmp.verts)
        bmesh.ops.scale(tmp, vec=Vector((1, scale_z, 1)), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=Vector((0, 0, (y0 + y1) / 2)), verts=tmp.verts)
        if r1 == 0:
            bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-4)
        return self._merge(tmp, placement(at, rot), color, slot, smooth_angle, bevel, jitter, seed)

    def rock(self, radius, at=(0, 0, 0), squash=(1, 1, 1), rot=(0, 0, 0), color=(1, 1, 1),
             slot=0, subdivisions=1, roughness=0.3, smooth_angle=None, seed=None, cuts=0,
             depth=(0.62, 0.85), flat=None):
        """
        A faceted low-poly lump: an icosphere pushed about by noise, then squashed. `cuts` slices
        that many planes off it, each `depth` (a fraction of the radius) from the centre, facing a
        random way above the horizon: the broad flat facets that make stone read as split rather
        than moulded. `flat` (a fraction of the radius) cuts the top and bottom level too, where a
        stacked stone bears on its neighbours.
        """
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdivisions, radius=radius)
        rng = random.Random(seed if seed is not None else self.rng.random())
        offset = Vector((rng.random() * 50, rng.random() * 50, rng.random() * 50))
        for v in tmp.verts:
            n = noise.noise(v.co * (2.2 / max(radius, 1e-3)) + offset)
            v.co *= 1 + n * roughness
        planes = []
        if flat is not None:
            planes = [(Vector((0, 0, 1)), radius * flat), (Vector((0, 0, -1)), radius * flat)]
        for _ in range(cuts):
            yaw = rng.random() * math.tau
            lift = rng.uniform(-0.25, 0.85)
            planes.append(
                (Vector((math.cos(yaw), math.sin(yaw), lift)).normalized(),
                 radius * rng.uniform(*depth))
            )
        for normal, distance in planes:
            cut = bmesh.ops.bisect_plane(
                tmp, geom=list(tmp.verts) + list(tmp.edges) + list(tmp.faces),
                plane_co=normal * distance, plane_no=normal, clear_outer=True,
            )
            edges = [e for e in cut["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
            if edges:
                bmesh.ops.holes_fill(tmp, edges=edges, sides=0)
        sx, sy, sz = squash
        bmesh.ops.scale(tmp, vec=Vector((sx, sz, sy)), verts=tmp.verts)
        return self._merge(tmp, placement(at, rot), color, slot, smooth_angle, 0, 0, None)

    def mesh(self, verts, faces, at=(0, 0, 0), rot=(0, 0, 0), color=(1, 1, 1), slot=0,
             bevel=0.0, jitter=0.0, smooth_angle=None, seed=None):
        """Arbitrary geometry: `verts` are game points around the origin, `faces` index lists."""
        tmp = bmesh.new()
        made = [tmp.verts.new(P(*v)) for v in verts]
        for face in faces:
            tmp.faces.new([made[i] for i in face])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        return self._merge(tmp, placement(at, rot), color, slot, smooth_angle, bevel, jitter, seed)

    def tube(self, points, radius, sides=5, color=(1, 1, 1), slot=0, taper=1.0, smooth_angle=60,
             radii=None):
        """
        A rope, vine or limb through game `points`, `radius` at the start, `radius * taper` at the
        end; `radii` multiplies each point's radius on top, for flares, bulges and knots.
        """
        tmp = bmesh.new()
        rings = []
        count = len(points)
        for i, point in enumerate(points):
            p = Vector(point)
            ahead = Vector(points[min(i + 1, count - 1)]) - Vector(points[max(i - 1, 0)])
            ahead.normalize()
            side = ahead.cross(Vector((0, 0, 1)))
            if side.length < 1e-3:
                side = ahead.cross(Vector((1, 0, 0)))
            side.normalize()
            up = side.cross(ahead)
            r = radius * (1 + (taper - 1) * (i / max(count - 1, 1))) * (radii[i] if radii else 1)
            ring = []
            for s in range(sides):
                a = s / sides * math.tau
                q = p + (side * math.cos(a) + up * math.sin(a)) * r
                ring.append(tmp.verts.new(P(*q)))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for s in range(sides):
                tmp.faces.new([a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]])
        tmp.faces.new(list(reversed(rings[0])))
        tmp.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        return self._merge(tmp, Matrix.Identity(4), color, slot, smooth_angle, 0, 0, None)

    def build(self, collection=None):
        collection = collection or bpy.context.scene.collection
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.materials:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        mesh.color_attributes.active_color = mesh.color_attributes[COLOR]
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
        return obj


# --- scene ------------------------------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def clear():
    """
    Empties the open scene without touching preferences: `reset` reloads factory settings, which
    in a live session (Blender driven over MCP) would also unload the add-on that serves it.
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                   bpy.data.images):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def bake_occlusion(objects, strength=0.55, distance=0.6, samples=64, ground=True, floor=0.4):
    """
    Bakes ambient occlusion with Cycles into a second corner attribute, then multiplies it into
    the colour: creases, joints and feet darken the way they do in daylight. A temporary ground
    plane darkens what stands on the ground.

    The bake samples at the vertices, and on low-poly blocks many vertices sit right against a
    neighbouring block or the ground, where occlusion is total; interpolated across a big face,
    that black would stain all of it. So occlusion never counts below `floor`, and only
    `strength` of it is applied.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.world = scene.world or bpy.data.worlds.new("World")
    scene.world.light_settings.distance = distance
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
        scene.cycles.device = "GPU"
    except Exception:
        scene.cycles.device = "CPU"

    plane = None
    if ground:
        mesh = bpy.data.meshes.new("bake-ground")
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
        bm.to_mesh(mesh)
        bm.free()
        plane = bpy.data.objects.new("bake-ground", mesh)
        scene.collection.objects.link(plane)

    for obj in objects:
        mesh = obj.data
        ao = mesh.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
        mesh.color_attributes.active_color = ao
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        col = mesh.color_attributes[COLOR]
        ao = mesh.color_attributes["AO"]
        for c, a in zip(col.data, ao.data):
            occlusion = max(floor, a.color[0])
            factor = 1 - strength * (1 - occlusion)
            r, g, b, alpha = c.color
            c.color = (r * factor, g * factor, b * factor, alpha)
        mesh.color_attributes.remove(mesh.color_attributes["AO"])
        mesh.color_attributes.active_color = mesh.color_attributes[COLOR]
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index

    if plane:
        bpy.data.objects.remove(plane)


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=False,
    )
