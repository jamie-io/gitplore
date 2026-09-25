"""
Renders a contact sheet of each GLB so a model can be judged without opening Blender.

    blender -b --factory-startup --python scripts/blender/preview.py -- <glb> <out.png> [size]

Eevee, a warm key sun from the upper left, a cool green sky like the jungle's, a ground plane,
and three views: three-quarter front, side, three-quarter back. Views are tiled into one image.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    glb, out = args[0], args[1]
    size = int(args[2]) if len(args) > 2 else 640
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.view_settings.view_transform = "AgX"

    bpy.ops.import_scene.gltf(filepath=glb)
    objects = [o for o in scene.objects if o.type == "MESH"]
    lo = Vector((min(v[i] for o in objects for v in world_bounds(o)) for i in range(3)))
    hi = Vector((max(v[i] for o in objects for v in world_bounds(o)) for i in range(3)))
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.3)

    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.45, 0.4, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    scene.world = world

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.92, 0.78)
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    scene.collection.objects.link(sun)

    bpy.ops.mesh.primitive_plane_add(size=200, location=(centre.x, centre.y, lo.z))
    ground = bpy.context.active_object
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.08, 0.12, 0.07, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(mat)

    camera = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    camera.data.lens = 50
    scene.collection.objects.link(camera)
    scene.camera = camera

    tiles = []
    base, _ = os.path.splitext(out)
    # Game +Z (the front) is Blender -Y.
    for i, (yaw, pitch) in enumerate(((-30, 12), (-90, 8), (150, 18), (0, 4))):
        a = math.radians(yaw)
        direction = Vector((math.sin(a), -math.cos(a), math.tan(math.radians(pitch))))
        direction.normalize()
        camera.location = centre + direction * radius * 3.1
        camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{base}-{i}.png"
        bpy.ops.render.render(write_still=True)
        tiles.append(scene.render.filepath)

    sheet = bpy.data.images.new("sheet", size * 2, size * 2)
    pixels = [0.0] * (size * 2 * size * 2 * 4)
    for index, path in enumerate(tiles):
        image = bpy.data.images.load(path)
        tile = list(image.pixels)
        ox = (index % 2) * size
        oy = (1 - index // 2) * size
        for row in range(size):
            start = ((oy + row) * size * 2 + ox) * 4
            pixels[start : start + size * 4] = tile[row * size * 4 : (row + 1) * size * 4]
        os.remove(path)
    sheet.pixels = pixels
    sheet.filepath_raw = out
    sheet.file_format = "PNG"
    sheet.save()


def world_bounds(obj):
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


main()
