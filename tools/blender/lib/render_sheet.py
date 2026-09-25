"""Contact sheet of exported GLBs (Cycles CPU, headless), each next to a 1.05 u
scale capsule (Juju's height). Renders the *exported* files, so it also checks
orientation (front = towards the camera) and the baked vertex colours.

    $BLENDER_PY tools/blender/lib/render_sheet.py out.jpg key1 key2 ... [--cols 4] [--size 420] [--night]
"""

import math
import os
import sys

import bpy  # noqa: F401  (must come before mathutils)
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import olw  # noqa: E402

args = sys.argv[1:]
out = args[0]
cols = 4
size = 420
night = False
angle = 28.0
keys = []
i = 1
while i < len(args):
    a = args[i]
    if a == "--cols":
        cols = int(args[i + 1]); i += 2; continue
    if a == "--size":
        size = int(args[i + 1]); i += 2; continue
    if a == "--yaw":
        angle = float(args[i + 1]); i += 2; continue
    if a == "--night":
        night = True; i += 1; continue
    keys.append(a); i += 1


def preview_material(slot: str, attr: str):
    name = f"prev_{slot}_{attr}"
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = attr
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    base = olw.TEXTURED_BASE.get(slot, "#ffffff")
    if slot == "olw_glass":
        base = olw.PALETTE["glass"]
    mul.inputs[6].default_value = (*olw.hex_linear(base), 1)
    nt.links.new(at.outputs["Color"], mul.inputs[7])
    nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.3 if "glass" in slot else 0.85
    if slot == "olw_glass_emissive":
        bsdf.inputs["Emission Color"].default_value = (*olw.hex_linear(olw.PALETTE["lamp"]), 1)
        bsdf.inputs["Emission Strength"].default_value = 3.0 if night else 0.5
    return m


def setup_scene():
    olw.reset()
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 24
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    s.render.resolution_x = size
    s.render.resolution_y = size
    s.render.film_transparent = False
    s.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.05, 0.06, 0.12, 1) if night else (0.85, 0.82, 0.78, 1)
    bg.inputs[1].default_value = 0.5 if night else 0.9
    s.world = w
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 0.4 if night else 3.2
    sun.color = (0.7, 0.75, 1.0) if night else (1.0, 0.95, 0.85)
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(35))
    s.collection.objects.link(so)
    # ground
    bpy.ops.mesh.primitive_plane_add(size=60)
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*olw.hex_linear("#b9b39a"), 1)
    g.data.materials.append(gm)
    # capsule (Juju height 1.05)
    return s


def capsule(x, y):
    r = 0.17
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=1.05 - 2 * r, location=(x, y, 0.525))
    c = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, 1.05 - r))
    t = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, r))
    bt = bpy.context.active_object
    m = bpy.data.materials.new("cap")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*olw.hex_linear("#e07a9a"), 1)
    for o in (c, t, bt):
        o.data.materials.append(m)
    return [c, t, bt]


def render_one(spec: str) -> np.ndarray:
    global angle
    key, _, yaw_s = spec.partition("@")
    yaw_deg = float(yaw_s) if yaw_s else angle
    s = setup_scene()
    path = os.path.join(olw.MODELS_DIR, f"{key}.glb")
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        attr = o.data.color_attributes[0].name if o.data.color_attributes else "Col"
        for slot_i, ms in enumerate(o.material_slots):
            slot = ms.material.name.split(".")[0] if ms.material else "olw_paint"
            ms.material = preview_material(slot, attr)
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    cx = mx.x + 0.3
    capsule(cx, (mn.y + mx.y) / 2)
    mx.x = cx + 0.18
    mx.z = max(mx.z, 1.05)
    # orthographic camera from the front (+Y side after import), elevated, yawed
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    co = bpy.data.objects.new("cam", cam)
    s.collection.objects.link(co)
    s.camera = co
    centre = (mn + mx) / 2
    yaw = math.radians(yaw_deg)
    pitch = math.radians(30)
    d = 20
    dirv = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    co.location = centre + dirv * d
    co.rotation_euler = (-dirv).to_track_quat("-Z", "Y").to_euler()
    ext = (mx - mn)
    cam.ortho_scale = max(ext.x, ext.y, ext.z) * 1.25 + 0.3
    s.render.filepath = os.path.join(os.path.dirname(os.path.abspath(out)), f"_tmp_{key}.png")
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(s.render.filepath)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    os.remove(s.render.filepath)
    return px


tiles = []
for k in keys:
    print(f"render {k}")
    tiles.append(render_one(k))
rows = math.ceil(len(tiles) / cols)
W, H = cols * size, rows * size
sheet = np.ones((H, W, 4), dtype=np.float32)
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    y0 = H - (r + 1) * size  # blender pixels are bottom-up
    sheet[y0:y0 + size, c * size:(c + 1) * size] = t
img = bpy.data.images.new("sheet", W, H)
img.pixels = sheet.ravel()
img.filepath_raw = out
img.file_format = "JPEG"
bpy.context.scene.render.image_settings.quality = 88
img.save()
print(f"wrote {out}")
