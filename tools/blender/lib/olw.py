"""olw.py - shared helpers for Blender-authored "Our Little World" assets.

Usage from an asset script (tools/blender/assets/<group>/<name>.py):

    import olw                      # build.mjs puts tools/blender/lib on PYTHONPATH
    olw.reset()
    b = olw.Builder("bench")
    b.box((1.1, 0.42, 0.05), (0, 0, 0.28), "olw_wood", "#8a5a3a", bevel=0.012)
    ...
    obj = b.finish()                # join, colours, AO, edges, UVs, normals, +Y-front
    olw.validate(obj, max_tris=1500, size=(1.1, 0.8, 0.5))
    olw.export_glb(obj, "bench")    # -> public/assets/models/bench.glb (+ manifest line)

AUTHORING FRAME (Blender native): Z up, the asset's FRONT faces -Y (Blender
"front" view), +X is to the right when seen from the front, origin = footprint
centre on the ground (z = 0), 1 Blender unit = 1 world unit (1 map tile).
`Builder.finish()` rotates the result 180 deg about Z so that, after the glTF
Y-up conversion and Babylon's right->left-handed root, the asset ends up
+Y up / front towards -Z / +X right in the game - the exact same numbers you
authored (so a door authored at x=+0.8 is at x=+0.8 in Babylon).

COLOURS: every part carries a base hex colour; `finish()` writes it to the
COLOR_0 corner attribute with per-face noise, AO near the ground and a light
edge highlight / cavity darkening. For the runtime-TEXTURED slots (olw_stone,
olw_roof_tile, olw_slate, olw_wood) the vertex colour is stored RELATIVE to the
slot's runtime base colour (target / base, clamped to 1) because the runtime
multiplies it over a tinted texture; every other slot stores the absolute
colour (runtime material is white x vertex colour).
"""

from __future__ import annotations

import json
import math
import os
import random
import sys
from dataclasses import dataclass, field

import bpy  # noqa: I001  (bpy must be imported before bmesh/mathutils)
import bmesh
from mathutils import Euler, Matrix, Vector

# ----------------------------------------------------------------------------- paths
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
MODELS_DIR = os.environ.get("OLW_OUT_DIR") or os.path.join(REPO, "public", "assets", "models")

# ----------------------------------------------------------------------------- palette
PALETTE = {
    "cream": "#e8d8b8",  # warm cream stone
    "sandstone": "#c9b89a",
    "grey_stone": "#b8b0a2",
    "terracotta": "#b8694a",
    "burnt_orange": "#d9824a",
    "slate": "#66707c",
    "sage": "#8fa87c",
    "wood": "#8a5a3a",
    "wood_dark": "#5e3d28",
    "rose": "#d49a9a",
    "awning_red": "#b34d47",
    "lamp": "#ffd98a",
    # helpers (not in the art brief but used for small details)
    "iron": "#2b2d30",
    "moss": "#6f8a4a",
    "ivy": "#4f7a3c",
    "ivy_light": "#7aa04e",
    "soil": "#4a3526",
    "interior": "#2a2420",
    "curtain": "#e9dcc4",
    "glass": "#cfe3ee",
    "post_red": "#b8322c",
    "gold": "#d6b25e",
    "white": "#f4efe6",
}

SLOTS = [
    "olw_stone", "olw_stone_dark", "olw_roof_tile", "olw_slate", "olw_wood", "olw_wood_dark",
    "olw_paint", "olw_metal", "olw_glass", "olw_glass_emissive", "olw_awning", "olw_foliage", "olw_flower",
]

# runtime textured slots -> the hex the runtime texture is painted with
# (src/app3d/assets/AssetManager.ts slotMaterial / rendering/materials.ts PALETTE)
TEXTURED_BASE = {
    "olw_stone": "#c9b89a",
    "olw_roof_tile": "#b8694a",
    "olw_slate": "#6f7480",
    "olw_wood": "#a8764f",
}


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h: str) -> tuple[float, float, float]:
    """'#rrggbb' -> sRGB floats 0..1."""
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def hex_linear(h: str) -> tuple[float, float, float]:
    """'#rrggbb' -> linear floats (what Blender colour sockets / FLOAT_COLOR want)."""
    return tuple(srgb_to_linear(c) for c in hex_rgb(h))  # type: ignore[return-value]


def col(c) -> tuple[float, float, float]:
    """Accept a hex string, a palette name or an sRGB tuple; return sRGB floats."""
    if isinstance(c, str):
        if not c.startswith("#"):
            c = PALETTE[c]
        return hex_rgb(c)
    return tuple(c)  # type: ignore[return-value]


def mix(a, b, t: float):
    a, b = col(a), col(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, f: float):
    c = col(c)
    return tuple(max(0.0, min(1.0, v * f)) for v in c)


# ----------------------------------------------------------------------------- scene
def reset():
    """Empty factory scene (no cube/camera/light), metric units, deterministic RNG."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.unit_settings.scale_length = 1.0
    random.seed(1)


def material(name: str) -> bpy.types.Material:
    """Material slot by name (created once). Export colour = slot preview colour
    for textured slots (vertex colour is relative there), white otherwise."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    base = TEXTURED_BASE.get(name, "#ffffff")
    if name == "olw_glass":
        base = "#ffffff"
    rgb = hex_linear(base)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.35 if name.startswith("olw_glass") else 0.9
    if name == "olw_glass_emissive":
        bsdf.inputs["Emission Color"].default_value = (*hex_linear(PALETTE["lamp"]), 1)
        bsdf.inputs["Emission Strength"].default_value = 0.6
    return m


# ----------------------------------------------------------------------------- geometry helpers
def _rot_matrix(rot) -> Matrix:
    if rot is None:
        return Matrix.Identity(4)
    return Euler(tuple(math.radians(a) for a in rot), "XYZ").to_matrix().to_4x4()


def bevel_bm(bm: bmesh.types.BMesh, width: float, segments: int = 1, edges=None, profile: float = 0.5):
    """Bevel (all or the given) edges of a bmesh in place."""
    if width <= 0:
        return
    es = list(edges) if edges is not None else list(bm.edges)
    bmesh.ops.bevel(bm, geom=es, offset=width, offset_type="OFFSET", segments=segments, profile=profile,
                    affect="EDGES", clamp_overlap=True)


def weld_bm(bm: bmesh.types.BMesh, dist: float = 1e-4):
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=dist)


def jitter_bm(bm: bmesh.types.BMesh, amount, seed: int = 0, keep_bottom: bool = True):
    """Random vertex offsets (amount = scalar or (ax, ay, az)); verts at the part's
    lowest z keep their z so the part still sits where it was put."""
    rng = random.Random(seed)
    a = amount if isinstance(amount, (tuple, list)) else (amount, amount, amount)
    zmin = min((v.co.z for v in bm.verts), default=0)
    moved = {}
    for v in bm.verts:
        key = (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))
        if key not in moved:
            moved[key] = Vector((rng.uniform(-1, 1) * a[0], rng.uniform(-1, 1) * a[1], rng.uniform(-1, 1) * a[2]))
        d = moved[key]
        v.co += Vector((d.x, d.y, 0 if (keep_bottom and abs(v.co.z - zmin) < 1e-4) else d.z))


def subdivide_bm(bm: bmesh.types.BMesh, cuts: int = 1, smooth: float = 0.0):
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True, smooth=smooth)


def apply_modifiers(obj: bpy.types.Object):
    """Bake the modifier stack of `obj` into its mesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def subsurf_bm(bm: bmesh.types.BMesh, levels: int = 1) -> bmesh.types.BMesh:
    """Catmull-Clark via a temporary object + Subdivision modifier; returns a new bmesh."""
    me = bpy.data.meshes.new("_tmp_subsurf")
    bm.to_mesh(me)
    ob = bpy.data.objects.new("_tmp_subsurf", me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("ss", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    apply_modifiers(ob)
    out = bmesh.new()
    out.from_mesh(ob.data)
    m2 = ob.data
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(m2)
    bm.free()
    return out


def boolean_bm(bm: bmesh.types.BMesh, cutters: list, op: str = "DIFFERENCE", solver: str = "EXACT") -> bmesh.types.BMesh:
    """Boolean `bm` with the union of `cutters` (bmeshes); returns a NEW bmesh
    (inputs are freed). Used for real recesses: window/door reveals, arches."""
    def mk(b_, name):
        me = bpy.data.meshes.new(name)
        b_.to_mesh(me)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob

    cut = bmesh.new()
    for c in cutters:
        me = bpy.data.meshes.new("_c")
        c.to_mesh(me)
        cut.from_mesh(me)
        bpy.data.meshes.remove(me)
        c.free()
    tob = mk(bm, "_bool_t")
    cob = mk(cut, "_bool_c")
    cut.free()
    bm.free()
    mod = tob.modifiers.new("b", "BOOLEAN")
    mod.operation = op
    mod.solver = solver
    mod.object = cob
    apply_modifiers(tob)
    out = bmesh.new()
    out.from_mesh(tob.data)
    for ob in (tob, cob):
        me = ob.data
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
    # boolean leaves n-gons with holes resolved; triangulate nothing, just tidy
    bmesh.ops.dissolve_degenerate(out, dist=1e-5, edges=list(out.edges))
    return out


# ----------------------------------------------------------------------------- builder
@dataclass
class Part:
    bm: bmesh.types.BMesh
    mat: str
    color: object
    vary: float = 0.06  # per-face brightness noise (0..1)
    hue: float = 0.02  # per-face hue/sat noise
    ao: bool = True
    edges: bool = True
    color_fn: object = None  # optional f(world_pos: Vector, normal: Vector, rng) -> sRGB colour
    seed: int = 0
    name: str = ""


class Builder:
    """Collects parts (each its own bmesh, material slot and base colour) and
    joins them into a single mesh object in `finish()`."""

    def __init__(self, key: str, seed: int = 1):
        self.key = key
        self.parts: list[Part] = []
        self.rng = random.Random(seed)
        self._seed = seed

    # -- low level
    def add_bm(self, bm, mat, color, loc=(0, 0, 0), rot=None, scale=None, **kw) -> Part:
        m = Matrix.Translation(Vector(loc)) @ _rot_matrix(rot)
        if scale is not None:
            s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
            m = m @ Matrix.Diagonal((*s, 1))
        bmesh.ops.transform(bm, matrix=m, verts=list(bm.verts))
        if mat not in SLOTS:
            raise ValueError(f"unknown material slot {mat!r}")
        self._seed += 1
        p = Part(bm=bm, mat=mat, color=color, seed=kw.pop("seed", self._seed), **kw)
        self.parts.append(p)
        return p

    def graft(self, other: "Builder", loc=(0, 0, 0), rot=None):
        """Move all parts of another Builder into this one, transformed (e.g. a roof built
        along X, turned 90 deg for a cross wing)."""
        m = Matrix.Translation(Vector(loc)) @ _rot_matrix(rot)
        for p in other.parts:
            bmesh.ops.transform(p.bm, matrix=m, verts=list(p.bm.verts))
            self.parts.append(p)
        other.parts = []

    def pop(self) -> bmesh.types.BMesh:
        """Remove the last part and return its (already placed) bmesh - e.g. to use as a cutter."""
        return self.parts.pop().bm

    def cut(self, part: Part, cutters: list, op: str = "DIFFERENCE"):
        """Boolean a part with cutter bmeshes (see `pop`)."""
        part.bm = boolean_bm(part.bm, cutters, op)
        return part

    # -- primitives (all take loc = position of the part's pivot; pivot noted per primitive)
    def box(self, size, loc, mat, color, bevel=0.0, segments=1, rot=None, jitter=0.0, subdiv=0, taper=None, **kw) -> Part:
        """Box of size (sx, sy, sz); pivot = centre of its BOTTOM face."""
        sx, sy, sz = size
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.transform(bm, matrix=Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Identity(4), verts=list(bm.verts))
        bmesh.ops.translate(bm, vec=Vector((0, 0, sz / 2)), verts=list(bm.verts))
        if taper:  # (tx, ty) scale of the top face
            for v in bm.verts:
                if v.co.z > sz / 2:
                    v.co.x *= taper[0]
                    v.co.y *= taper[1]
        if subdiv:
            subdivide_bm(bm, subdiv)
        if jitter:
            jitter_bm(bm, jitter, seed=self.rng.randint(0, 1 << 30))
        if bevel:
            bevel_bm(bm, min(bevel, sx / 2.05, sy / 2.05, sz / 2.05), segments)
        return self.add_bm(bm, mat, color, loc, rot, **kw)

    def cyl(self, r, h, loc, mat, color, verts=12, r_top=None, bevel=0.0, segments=1, rot=None, cap=True, jitter=0.0, **kw) -> Part:
        """Cylinder / cone frustum along +Z; pivot = centre of the bottom cap."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=r,
                              radius2=r if r_top is None else r_top, depth=h)
        bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=list(bm.verts))
        if jitter:
            jitter_bm(bm, jitter, seed=self.rng.randint(0, 1 << 30))
        if bevel and cap:
            rim = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
            bevel_bm(bm, bevel, segments, rim)
        return self.add_bm(bm, mat, color, loc, rot, **kw)

    def sphere(self, r, loc, mat, color, subdiv=2, scale=None, rot=None, jitter=0.0, **kw) -> Part:
        """Icosphere; pivot = centre."""
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
        if jitter:
            jitter_bm(bm, jitter, seed=self.rng.randint(0, 1 << 30), keep_bottom=False)
        return self.add_bm(bm, mat, color, loc, rot, scale, **kw)

    def lathe(self, profile, loc, mat, color, verts=12, rot=None, **kw) -> Part:
        """Surface of revolution around Z from [(radius, z), ...] (bottom to top).
        A radius of 0 at an end closes it with a pole. Pivot = (0,0,0) of the profile."""
        bm = bmesh.new()
        rings = []
        for (r, z) in profile:
            if r <= 1e-6:
                rings.append([bm.verts.new((0, 0, z))])
            else:
                rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / verts), r * math.sin(2 * math.pi * i / verts), z)) for i in range(verts)])
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            for i in range(verts):
                j = (i + 1) % verts
                if len(a) == 1:
                    bm.faces.new((a[0], b[i], b[j]))
                elif len(b) == 1:
                    bm.faces.new((a[j], a[i], b[0]))
                else:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        # flat caps on open ends
        if len(rings[0]) > 1:
            bm.faces.new(list(reversed(rings[0])))
        if len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self.add_bm(bm, mat, color, loc, rot, **kw)

    def prism(self, poly, depth, loc, mat, color, bevel=0.0, segments=1, rot=None, axis="Y", **kw) -> Part:
        """Extrude a 2D polygon [(u, v), ...] (counter-clockwise) by `depth`.
        axis="Y": polygon in the XZ plane (u=x, v=z), extruded along +Y centred on 0
        (front/back faces towards -Y/+Y) - gables, arrow boards, arches.
        axis="X": polygon in the YZ plane (u=y, v=z), extruded along X (side profiles).
        axis="Z": polygon in XY, extruded up from z=0."""
        bm = bmesh.new()
        if axis == "Y":
            vs = [bm.verts.new((u, -depth / 2, v)) for (u, v) in poly]
            ext = Vector((0, depth, 0))
        elif axis == "X":
            vs = [bm.verts.new((-depth / 2, u, v)) for (u, v) in poly]
            ext = Vector((depth, 0, 0))
        else:
            vs = [bm.verts.new((u, v, 0)) for (u, v) in poly]
            ext = Vector((0, 0, depth))
        f = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        nv = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=ext, verts=nv)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        if bevel:
            bevel_bm(bm, bevel, segments)
        return self.add_bm(bm, mat, color, loc, rot, **kw)

    def mesh(self, verts, faces, loc, mat, color, rot=None, **kw) -> Part:
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in verts]
        for f in faces:
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self.add_bm(bm, mat, color, loc, rot, **kw)

    def tube(self, points, r, mat, color, verts=6, **kw) -> Part:
        """A tube (bent rod) through 3D points - iron scrolls, handles, ivy stems."""
        bm = bmesh.new()
        pts = [Vector(p) for p in points]
        rings = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(a).normalized()
            w = t.cross(u).normalized()
            rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / verts) + w * math.sin(2 * math.pi * k / verts)) * r) for k in range(verts)])
        for a, b in zip(rings, rings[1:]):
            for k in range(verts):
                j = (k + 1) % verts
                bm.faces.new((a[k], a[j], b[j], b[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self.add_bm(bm, mat, color, **kw)

    def blob(self, r, loc, mat, color, scale=(1, 1, 0.8), subdiv=1, jitter=0.25, flat_bottom=True, **kw) -> Part:
        """Lumpy low-poly blob (foliage masses, ivy, moss); pivot = centre.
        flat_bottom squashes the lower half so it can sit on a surface."""
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
        jitter_bm(bm, r * jitter, seed=self.rng.randint(0, 1 << 30), keep_bottom=False)
        if flat_bottom:
            for v in bm.verts:
                if v.co.z < -r * 0.35:
                    v.co.z = -r * 0.35 + (v.co.z + r * 0.35) * 0.2
        return self.add_bm(bm, mat, color, loc, None, scale, **kw)

    # -- finish
    def finish(self, ao_height: float = 0.35, ao_min: float = 0.72, edge_light: float = 0.08,
               cavity: float = 0.12, smooth_angle: float = 38.0, rotate_front: bool = True,
               origin: str = "keep", weld: float = 0.0, ground_snap: float = 0.01) -> bpy.types.Object:
        """Join all parts into one object `self.key` and bake colours/UVs/normals.
        origin: "keep" (you authored around the footprint centre - recommended),
                "footprint" (re-centre on the XY bbox of verts within 2 cm of the
                lowest point, drop to z=0) or "bbox"."""
        mats: list[str] = []
        for p in self.parts:
            if p.mat not in mats:
                mats.append(p.mat)
        master = bmesh.new()
        col_layer = master.loops.layers.float_color.new("Col")
        for p in self.parts:
            me = bpy.data.meshes.new("_part")
            idx = mats.index(p.mat)
            for f in p.bm.faces:
                f.material_index = idx
            # per-part colour into its own layer, then merge
            lay = p.bm.loops.layers.float_color.get("Col") or p.bm.loops.layers.float_color.new("Col")
            rng = random.Random(p.seed)
            base = col(p.color) if p.color is not None else (1, 1, 1)
            p.bm.normal_update()
            for f in p.bm.faces:
                c = p.color_fn(f.calc_center_median(), f.normal, rng) if p.color_fn else base
                c = col(c)
                k = 1 + rng.uniform(-p.vary, p.vary)
                hs = [1 + rng.uniform(-p.hue, p.hue) for _ in range(3)]
                fc = tuple(max(0.0, min(1.0, c[i] * k * hs[i])) for i in range(3))
                for l in f.loops:
                    l[lay] = (*fc, 1.0)
            pl = p.bm.faces.layers.int.get("olw_part") or p.bm.faces.layers.int.new("olw_part")
            for f in p.bm.faces:
                f[pl] = self.parts.index(p)
            p.bm.to_mesh(me)
            master.from_mesh(me)
            bpy.data.meshes.remove(me)
            p.bm.free()
        col_layer = master.loops.layers.float_color.get("Col")
        part_layer = master.faces.layers.int.get("olw_part")
        flags = [(p.ao, p.edges) for p in self.parts]
        if weld:
            weld_bm(master, weld)
        if ground_snap:  # rotated/jittered parts may dip a hair below the ground: snap them to it
            for v in master.verts:
                if -ground_snap < v.co.z < 0:
                    v.co.z = 0.0
        master.normal_update()
        master.verts.index_update()

        # ---- AO near ground + cavity/edge (per vertex), multiply into loops
        vfac = {}
        for v in master.verts:
            z = v.co.z
            t = max(0.0, min(1.0, z / ao_height)) if ao_height > 0 else 1.0
            t = t * t * (3 - 2 * t)
            f = ao_min + (1 - ao_min) * t
            conv = 0.0
            for e in v.link_edges:
                if len(e.link_faces) == 2:
                    ang = e.calc_face_angle(0.0)
                    if ang > math.radians(25):
                        conv += (1.0 if e.is_convex else -1.0) * min(1.0, ang / math.radians(90))
            if conv > 0:
                f *= 1 + edge_light * min(1.0, conv / 2)
            elif conv < 0:
                f *= 1 - cavity * min(1.0, -conv / 2)
            vfac[v.index] = f
        vao = {}
        for v in master.verts:
            z = v.co.z
            t = max(0.0, min(1.0, z / ao_height)) if ao_height > 0 else 1.0
            vao[v.index] = ao_min + (1 - ao_min) * t * t * (3 - 2 * t)
        for f in master.faces:
            slot = mats[f.material_index]
            rel = TEXTURED_BASE.get(slot)
            relc = col(rel) if rel else None
            up = f.normal.z
            for l in f.loops:
                c = list(l[col_layer])[:3]
                ao_on, ed_on = flags[f[part_layer]] if part_layer is not None else (True, True)
                k = vfac[l.vert.index] if ed_on else 1.0
                if ed_on and not ao_on:
                    k /= vao[l.vert.index]
                elif ao_on and not ed_on:
                    k = vao[l.vert.index]
                # top faces a touch lighter (painted sunlight), undersides darker
                k *= 1.0 + 0.05 * up if up > 0 else 1.0 + 0.12 * up
                c = [min(1.0, x * k) for x in c]
                if relc:
                    c = [min(1.0, c[i] / max(relc[i], 1e-3)) for i in range(3)]
                # store as linear (Blender FLOAT_COLOR is linear; exporter writes linear COLOR_0)
                l[col_layer] = (*[srgb_to_linear(x) for x in c], 1.0)

        if rotate_front:
            bmesh.ops.rotate(master, verts=list(master.verts), cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.pi, 3, "Z"))

        # ---- box-projected UVs in world units (runtime textures tile per unit via uScale)
        uv = master.loops.layers.uv.new("UVMap")
        for f in master.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                p = l.vert.co
                if ax == 0:
                    l[uv].uv = (p.y * (1 if n.x > 0 else -1), p.z)
                elif ax == 1:
                    l[uv].uv = (p.x * (-1 if n.y > 0 else 1), p.z)
                else:
                    l[uv].uv = (p.x, p.y)

        # triangulate n-gons ourselves (ear clipping copes with concave outlines such as
        # crow-stepped gables and boolean-cut walls better than the exporter's fan)
        ngons = [f for f in master.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(master, faces=ngons, quad_method="BEAUTY", ngon_method="EAR_CLIP")
        if part_layer is not None:
            master.faces.layers.int.remove(part_layer)
        me = bpy.data.meshes.new(self.key)
        master.to_mesh(me)
        master.free()
        for m in mats:
            me.materials.append(material(m))
        ca = me.color_attributes.get("Col")
        if ca:
            me.color_attributes.active_color = ca
            me.color_attributes.render_color_index = me.color_attributes.find("Col")
        me.shade_smooth()
        try:
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        except AttributeError:  # < 4.1
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(smooth_angle)
        obj = bpy.data.objects.new(self.key, me)
        bpy.context.scene.collection.objects.link(obj)
        if origin != "keep":
            set_origin_footprint(obj, mode=origin)
        return obj


# ----------------------------------------------------------------------------- origin / stats / validation
def set_origin_footprint(obj, mode: str = "footprint"):
    """Move mesh so the footprint centre sits at (0,0) and the lowest point at z=0."""
    vs = [v.co for v in obj.data.vertices]
    zmin = min(v.z for v in vs)
    sel = [v for v in vs if v.z < zmin + 0.02] if mode == "footprint" else vs
    cx = (min(v.x for v in sel) + max(v.x for v in sel)) / 2
    cy = (min(v.y for v in sel) + max(v.y for v in sel)) / 2
    obj.data.transform(Matrix.Translation((-cx, -cy, -zmin)))
    obj.data.update()


def tri_count(obj) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bbox(obj):
    vs = [v.co for v in obj.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return mn, mx


def islands(obj):
    """Connected vertex islands -> list of (min Vector, max Vector, vert count)."""
    me = obj.data
    parent = list(range(len(me.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    groups: dict[int, list] = {}
    for v in me.vertices:
        groups.setdefault(find(v.index), []).append(v.co)
    out = []
    for g in groups.values():
        out.append((Vector((min(c.x for c in g), min(c.y for c in g), min(c.z for c in g))),
                    Vector((max(c.x for c in g), max(c.y for c in g), max(c.z for c in g))), len(g)))
    return out


class ValidationError(RuntimeError):
    pass


def validate(obj, max_tris: int | None = None, min_tris: int = 0, size=None, size_tol: float = 0.25,
             touch_tol: float = 0.012, ground_tol: float = 1e-3, allow_floating: int = 0) -> dict:
    """Report bbox / min z / tris / floating islands; raise ValidationError on:
    - lowest point not at z=0 (+-ground_tol),
    - an island (connected piece) that neither touches the ground nor touches/overlaps
      (bbox within touch_tol) a chain of islands leading to the ground,
    - tris > max_tris, or a bbox dimension off `size` (x, y=depth, z=height) by > size_tol (relative).
    Note: coordinates reported in the GAME frame (x right, y up, z depth; front = -z)."""
    mn, mx = bbox(obj)
    tris = tri_count(obj)
    isl = islands(obj)
    n = len(isl)
    grounded = [a[0].z <= ground_tol for a in isl]
    changed = True
    while changed:
        changed = False
        for i in range(n):
            if grounded[i]:
                continue
            a0, a1, _ = isl[i]
            for j in range(n):
                if not grounded[j]:
                    continue
                b0, b1, _ = isl[j]
                if all(a0[k] <= b1[k] + touch_tol and b0[k] <= a1[k] + touch_tol for k in range(3)):
                    grounded[i] = True
                    changed = True
                    break
    floating = [isl[i] for i in range(n) if not grounded[i]]
    dims = mx - mn
    report = {
        "key": obj.name,
        "tris": tris,
        "islands": n,
        # game frame: x, y(up), z(depth)
        "bbox_min": [round(mn.x, 3), round(mn.z, 3), round(-mx.y, 3)],
        "bbox_max": [round(mx.x, 3), round(mx.z, 3), round(-mn.y, 3)],
        "size": [round(dims.x, 3), round(dims.z, 3), round(dims.y, 3)],
        "min_y": round(mn.z, 5),
        "floating": len(floating),
    }
    errs = []
    if abs(mn.z) > ground_tol:
        errs.append(f"lowest point y={mn.z:.4f} (must be 0)")
    if len(floating) > allow_floating:
        for f in floating[:8]:
            errs.append(f"floating island ({f[2]} verts) bbox x[{f[0].x:.2f},{f[1].x:.2f}] y[{f[0].z:.2f},{f[1].z:.2f}] z[{-f[1].y:.2f},{-f[0].y:.2f}]")
    if max_tris is not None and tris > max_tris:
        errs.append(f"{tris} tris > budget {max_tris}")
    if tris < min_tris:
        errs.append(f"{tris} tris < minimum {min_tris}")
    if size is not None:
        # size = (x width, y depth, z height) in the AUTHORING frame
        for lbl, want, got in zip("xyz", size, (dims.x, dims.y, dims.z)):
            if want and abs(got - want) > size_tol * want:
                errs.append(f"size {lbl}={got:.3f} expected ~{want} (+-{int(size_tol * 100)}%)")
    if os.environ.get("OLW_DEBUG"):
        per = {}
        for p in obj.data.polygons:
            m = obj.data.materials[p.material_index].name
            per[m] = per.get(m, 0) + len(p.vertices) - 2
        print(f"[olw] {obj.name} tris per slot: {dict(sorted(per.items(), key=lambda kv: -kv[1]))}")
    print(f"[olw] {obj.name}: tris={tris} islands={n} size(x,up,depth)={report['size']} min_y={report['min_y']} floating={len(floating)}")
    if errs:
        for e in errs:
            print(f"[olw]   ERROR {e}", file=sys.stderr)
        raise ValidationError(f"{obj.name}: " + "; ".join(errs))
    return report


# ----------------------------------------------------------------------------- export
def export_glb(obj, key: str | None = None, out_dir: str | None = None, extra: dict | None = None,
               report: dict | None = None) -> str:
    """Export `obj` (and its children) to <out_dir>/<key>.glb with the project's glTF
    settings: +Y up, modifiers applied, COLOR_0 from the active colour attribute,
    normals + UVs, no cameras/lights, animations only when the object has any.
    Prints an `OLW_ASSET {json}` line that tools/blender/build.mjs collects into
    tools/blender/manifest.json."""
    key = key or obj.name
    out_dir = out_dir or MODELS_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{key}.glb")
    for o in bpy.context.scene.objects:
        o.select_set(False)
    objs = [obj, *obj.children_recursive]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj
    has_anim = any(o.animation_data and o.animation_data.action for o in objs) or any(o.type == "ARMATURE" for o in objs)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=has_anim,
    )
    kb = os.path.getsize(path) / 1024
    info = {"key": key, "path": os.path.relpath(path, REPO), "kb": round(kb, 1), "tris": tri_count(obj) if obj.type == "MESH" else None,
            "script": os.path.relpath(os.path.abspath(sys.argv[0]), REPO) if sys.argv and sys.argv[0] else None}
    if report:
        info.update({k: report[k] for k in ("size", "bbox_min", "bbox_max") if k in report})
    if extra:
        info.update(extra)
    print("OLW_ASSET " + json.dumps(info))
    return path


def build_and_export(key: str, build_fn, max_tris: int, size=None, extra: dict | None = None, **vkw):
    """reset -> build_fn() returning a finished object -> validate -> export."""
    reset()
    obj = build_fn()
    rep = validate(obj, max_tris=max_tris, size=size, **vkw)
    return export_glb(obj, key, extra=extra, report=rep)


def only_keys() -> set[str] | None:
    """Keys requested via OLW_ONLY=key1,key2 (build.mjs --only); None = build everything."""
    v = os.environ.get("OLW_ONLY")
    return set(k for k in v.split(",") if k) if v else None


def wanted(key: str) -> bool:
    o = only_keys()
    return o is None or key in o
