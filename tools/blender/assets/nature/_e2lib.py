"""Shared helpers for the E2 nature / vehicle Blender scripts.

Library module only: running it directly does nothing (build runners that
execute every tools/blender/**/*.py can safely run it). Import it from a
sibling script with:

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # nature/
    import _e2lib as L

Conventions (see docs / olw.py): Blender is Z-up; the glTF exporter converts
to +Y up, so an asset's FRONT must face Blender +Y (-> glTF -Z). 1 unit = 1
tile. Vertex colours are stored as FLOAT_COLOR holding *sRGB* values, which
the exporter writes verbatim to COLOR_0 -- the runtime (Babylon
StandardMaterial x vertex colour) treats them as gamma-space colours, same as
the code-authored heroes.
"""

import json
import math
import os
import random
import sys

import bpy  # noqa: I001  (bpy must be imported before bmesh/mathutils)
import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "assets", "models")

# ------------------------------------------------------------------ colour


def hex3(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mul(a, k):
    return tuple(max(0.0, min(1.0, c * k)) for c in a)


def ramp(stops, t):
    """stops: [(t, rgb), ...] sorted by t."""
    t = max(stops[0][0], min(stops[-1][0], t))
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / max(1e-6, t1 - t0))
    return stops[-1][1]


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ scene


def reset(seed=1):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(seed)
    _MATS.clear()


_MATS = {}


def mat(slot):
    """A slot-named material: white Principled x the 'Col' colour attribute."""
    if slot in _MATS:
        return _MATS[slot]
    m = bpy.data.materials.get(slot) or bpy.data.materials.new(slot)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.9 if slot != "olw_glass" else 0.25
    if slot == "olw_light_emissive":
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.86, 0.55, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.6
    if slot in ("olw_flower", "olw_foliage"):
        m.use_backface_culling = False
    else:
        m.use_backface_culling = True
    _MATS[slot] = m
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def obj_from_bm(name, bm, slot=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if slot:
        set_slot(ob, slot)
    return ob


def set_slot(ob, slot):
    ob.data.materials.clear()
    ob.data.materials.append(mat(slot))
    for p in ob.data.polygons:
        p.material_index = 0
    return ob


def activate(ob):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def apply_transform(ob):
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    return ob


def join(obs, name):
    obs = [o for o in obs if o is not None]
    for o in obs:
        apply_transform(o)
    activate(obs[0])
    for o in obs:
        o.select_set(True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def smooth(ob, sharp_angle=None):
    """Smooth shading; optional sharp edges above `sharp_angle` degrees."""
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    if sharp_angle is not None:
        bm = bmesh.new()
        bm.from_mesh(me)
        lim = math.radians(sharp_angle)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
                e.smooth = False
            elif len(e.link_faces) == 2:
                e.smooth = True
        bm.to_mesh(me)
        bm.free()
    return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ------------------------------------------------------------------ primitives


def bm_ico(radius=1.0, subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    return bm


def ico(name, center, radius, scale=(1, 1, 1), subdiv=2):
    bm = bm_ico(1.0, subdiv)
    m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((radius * scale[0], radius * scale[1], radius * scale[2], 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return obj_from_bm(name, bm)


def tube(name, pts, radii, sides=6, cap=True, slot=None):
    """Sweep a circle along a polyline of Vector points (parallel transport)."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        if i == 0:
            t = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            t = (pts[-1] - pts[-2]).normalized()
        else:
            t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = t.cross(ref).normalized()
        else:
            n = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = n
        b = t.cross(n).normalized()
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            ring.append(bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * r))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for s in range(sides):
            bm.faces.new((r0[s], r0[(s + 1) % sides], r1[(s + 1) % sides], r1[s]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, slot)


def lathe(name, profile, segs=16, axis="X", slot=None, closed_ends=True):
    """Revolve a (radius, along) profile around an axis through the origin."""
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            c, sn = math.cos(a) * r, math.sin(a) * r
            if axis == "X":
                co = (h, c, sn)
            elif axis == "Y":
                co = (c, h, sn)
            else:
                co = (c, sn, h)
            ring.append(bm.verts.new(co))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for s in range(segs):
            bm.faces.new((r0[s], r0[(s + 1) % segs], r1[(s + 1) % segs], r1[s]))
    if closed_ends:
        if profile[0][0] > 1e-6:
            bm.faces.new(list(reversed(rings[0])))
        if profile[-1][0] > 1e-6:
            bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, slot)


def rounded_box(name, size, center=(0, 0, 0), bevel=0.02, segs=2, slot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segs, affect="EDGES", profile=0.5, clamp_overlap=True)
    return obj_from_bm(name, bm, slot)


# ------------------------------------------------------------------ modifiers


def voxel_blob(obs, name, voxel=0.06, disp=0.0, disp_size=0.4, target_tris=None, smooth_iters=6, seed=0, smooth_factor=0.5):
    """Union a set of overlapping meshes into one soft surface (voxel remesh),
    optional lumpy displacement, smoothing and decimation to a triangle budget."""
    ob = join(obs, name)
    r = ob.modifiers.new("remesh", "REMESH")
    r.mode = "VOXEL"
    r.voxel_size = voxel
    r.adaptivity = 0.0
    r.use_smooth_shade = True
    apply_mods(ob)
    if disp > 0:
        tex = bpy.data.textures.new(name + "_tex", "CLOUDS")
        tex.noise_scale = disp_size
        tex.noise_depth = 1
        d = ob.modifiers.new("disp", "DISPLACE")
        d.texture = tex
        d.strength = disp
        d.mid_level = 0.5
        d.texture_coords = "OBJECT" if False else "LOCAL"
        apply_mods(ob)
    if smooth_iters:
        s = ob.modifiers.new("smooth", "SMOOTH")
        s.factor = smooth_factor
        s.iterations = smooth_iters
        apply_mods(ob)
    if target_tris:
        cur = tris(ob)
        if cur > target_tris:
            dm = ob.modifiers.new("dec", "DECIMATE")
            dm.decimate_type = "COLLAPSE"
            dm.ratio = target_tris / cur
            dm.use_collapse_triangulate = True
            apply_mods(ob)
    smooth(ob)
    return ob


def decimate(ob, target_tris):
    cur = tris(ob)
    if cur > target_tris:
        dm = ob.modifiers.new("dec", "DECIMATE")
        dm.decimate_type = "COLLAPSE"
        dm.ratio = target_tris / cur
        apply_mods(ob)
    return ob


def skin_tree(name, verts, edges, radii, root=0, subdiv=1):
    """Skin-modifier branch structure: verts [(x,y,z)], edges [(i,j)], radii per vert."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], edges, [])
    ob = bpy.data.objects.new(name, me)
    link(ob)
    sk = ob.modifiers.new("skin", "SKIN")
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.6
    for i, sv in enumerate(me.skin_vertices[0].data):
        r = radii[i]
        sv.radius = (r, r)
        sv.use_root = i == root
    if subdiv:
        sd = ob.modifiers.new("sub", "SUBSURF")
        sd.levels = subdiv
        sd.render_levels = subdiv
    apply_mods(ob)
    return ob


def cut_below(ob, z=0.0, fill=True):
    """Bisect at height z, remove everything below, cap the hole: a flat base at exactly z."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True)
    if fill:
        edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            try:
                bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            except Exception:
                pass
    for v in bm.verts:
        if abs(v.co.z - z) < 1e-4:
            v.co.z = z
    bm.to_mesh(ob.data)
    bm.free()
    return ob


# ------------------------------------------------------------------ painting


def paint(ob, fn):
    """fn(co: Vector, normal: Vector, poly) -> rgb, evaluated per face corner."""
    me = ob.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find("Col")
    vs = me.vertices
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            n = vs[vi].normal if p.use_smooth else p.normal
            c = fn(vs[vi].co, n, p)
            attr.data[li].color = (c[0], c[1], c[2], 1.0)
    return ob


def paint_flat(ob, rgb):
    return paint(ob, lambda co, n, p: rgb)


def ao_factors(ob, rays=10, dist=1.2, extra=None, seed=3):
    """Per-vertex ambient-occlusion estimate (0 = open, 1 = fully occluded)
    by ray casting over the upper-weighted hemisphere against the object
    (plus optional extra BVH trees)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    rng = random.Random(seed)
    dirs = []
    for i in range(rays):
        # cosine-ish hemisphere samples around +Z-biased normal
        u, v = (i + 0.5) / rays, rng.random()
        th = math.acos(math.sqrt(1 - u * 0.95))
        ph = 2 * math.pi * (v + i * 0.618)
        dirs.append((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
    out = []
    for vt in me.vertices:
        n = vt.normal
        # frame around normal
        ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
        t = n.cross(ref).normalized()
        b = n.cross(t)
        hit = 0
        o = vt.co + n * 0.01
        for dx, dy, dz in dirs:
            d = (t * dx + b * dy + n * dz).normalized()
            loc, _, _, _ = bvh.ray_cast(o, d, dist)
            if loc is None and extra:
                for e in extra:
                    loc, _, _, _ = e.ray_cast(o, d, dist)
                    if loc is not None:
                        break
            if loc is not None:
                hit += 1
        out.append(hit / rays)
    return out


def bvh_of(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def cavity(ob, iters=2):
    """Per-vertex concavity (+ = crease, - = bump), lightly smoothed."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    vals = [0.0] * len(bm.verts)
    for v in bm.verts:
        if not v.link_edges:
            continue
        avg = Vector()
        for e in v.link_edges:
            avg += e.other_vert(v).co
        avg /= len(v.link_edges)
        L = sum(e.calc_length() for e in v.link_edges) / len(v.link_edges)
        vals[v.index] = (avg - v.co).dot(v.normal) / max(1e-5, L)
    for _ in range(iters):
        nv = vals[:]
        for v in bm.verts:
            if v.link_edges:
                nv[v.index] = 0.5 * vals[v.index] + 0.5 * sum(vals[e.other_vert(v).index] for e in v.link_edges) / len(v.link_edges)
        vals = nv
    bm.free()
    return vals


def foliage_painter(ob, stops, sun=(0.45, -0.35, 0.82), ao=None, cav=None, z0=None, z1=None, jitter=0.06, seed=0, ao_k=0.45, patch=None):
    """Painterly foliage: height ramp + sun side + AO + crease darkening + noise patches."""
    zs = [v.co.z for v in ob.data.vertices]
    z0 = min(zs) if z0 is None else z0
    z1 = max(zs) if z1 is None else z1
    sunv = Vector(sun).normalized()
    ao = ao or [0.0] * len(zs)
    cav = cav or [0.0] * len(zs)
    patch = patch or hex3("#7f8b56")

    def fn(co, n, p):
        vi = None
        return (co, n)

    me = ob.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = attr
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            v = me.vertices[vi]
            t = (v.co.z - z0) / max(1e-5, z1 - z0)
            lit = max(0.0, v.normal.dot(sunv))
            t2 = 0.55 * t + 0.45 * (0.5 + 0.5 * v.normal.z) + 0.28 * (lit - 0.4)
            c = ramp(stops, t2)
            nz = noise.noise(Vector((v.co.x * 1.7 + seed, v.co.y * 1.7, v.co.z * 1.7)))
            if nz > 0.25:
                c = mix(c, mul(patch, 0.85 + t * 0.4), min(0.45, (nz - 0.25) * 1.6))
            k = 1.0 - ao_k * ao[vi] - 0.9 * max(0.0, cav[vi]) + 0.25 * max(0.0, -cav[vi])
            k *= 1.0 + (noise.noise(Vector((v.co.x * 6.1, v.co.y * 6.1 + seed, v.co.z * 6.1))) * jitter)
            c = mul(c, max(0.45, min(1.25, k)))
            attr.data[li].color = (c[0], c[1], c[2], 1.0)
    return ob


# ------------------------------------------------------------------ validation + export


def wanted(key):
    """OLW_ONLY=key1,key2 (build.mjs --only) filter; unset = build everything."""
    v = os.environ.get("OLW_ONLY")
    return not v or key in set(k for k in v.split(",") if k)


def islands(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    groups = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        g = []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            g.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        groups.append(g)
    bm.free()
    return groups


def connectivity(ob, tol=0.012):
    """Group mesh islands into touching clusters (intersecting or within tol).
    Returns (n_islands, n_clusters, floating_islands_info)."""
    me = ob.data
    groups = islands(ob)
    if len(groups) <= 1:
        return len(groups), 1, []
    vidx_to_g = {}
    for gi, g in enumerate(groups):
        for i in g:
            vidx_to_g[i] = gi
    # per-island BVH
    trees = []
    for g in groups:
        gs = set(g)
        polys = [p for p in me.polygons if p.vertices[0] in gs]
        remap = {}
        vs = []
        for i in g:
            remap[i] = len(vs)
            vs.append(me.vertices[i].co.copy())
        fs = [[remap[i] for i in p.vertices] for p in polys]
        trees.append((BVHTree.FromPolygons(vs, fs) if fs else None, vs))
    n = len(groups)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a in range(n):
        ta, va = trees[a]
        for b in range(a + 1, n):
            if find(a) == find(b):
                continue
            tb, vb = trees[b]
            if ta is None or tb is None:
                continue
            touch = bool(ta.overlap(tb))
            if not touch:
                for co in va[:: max(1, len(va) // 200)]:
                    hit = tb.find_nearest(co, tol)
                    if hit[0] is not None:
                        touch = True
                        break
            if not touch:
                # fully enclosed: ray from a vertex hits b an odd number of times
                co = va[0]
                cnt = 0
                o = co.copy()
                for _ in range(20):
                    loc, _, _, _ = tb.ray_cast(o, Vector((0.0123, 0.0071, 1.0)))
                    if loc is None:
                        break
                    cnt += 1
                    o = loc + Vector((0.0123, 0.0071, 1.0)).normalized() * 1e-4
                touch = cnt % 2 == 1
            if touch:
                parent[find(a)] = find(b)
    roots = {}
    for i in range(n):
        roots.setdefault(find(i), []).append(i)
    clusters = list(roots.values())
    floating = []
    if len(clusters) > 1:
        main = max(clusters, key=lambda c: sum(len(groups[i]) for i in c))
        for c in clusters:
            if c is main:
                continue
            for i in c:
                co = trees[i][1][0]
                floating.append((i, len(groups[i]), tuple(round(x, 3) for x in co)))
    return n, len(clusters), floating


def finish(ob, key, recentre_xy=False, out_dir=None, extra_report=""):
    """Validate (base at z=0, connectivity), export GLB, print a report line."""
    apply_transform(ob)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(me)
    bm.free()
    zs = [v.co.z for v in me.vertices]
    zmin = min(zs)
    shift = Vector((0, 0, -zmin))
    if recentre_xy:
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        shift.x = -(min(xs) + max(xs)) / 2
        shift.y = -(min(ys) + max(ys)) / 2
    me.transform(Matrix.Translation(shift))
    for v in me.vertices:
        if abs(v.co.z) < 1e-6:
            v.co.z = 0.0
    me.update()
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    n_isl, n_clu, floating = connectivity(ob)
    t = tris(ob)
    out_dir = out_dir or OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, key + ".glb")
    activate(ob)
    for o in list(bpy.context.scene.objects):
        if o is not ob:
            bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
    kb = os.path.getsize(path) / 1024
    slots = [m.name for m in me.materials]
    # glTF axes: x, y(up)=z, z=-y  -> report as width(x) x height(y) x depth(z)
    msg = (
        f"[e2] {key}: tris={t} size={kb:.1f}KB bbox(glTF x,y,z)=[{min(xs):.3f}..{max(xs):.3f}, {min(zs):.3f}..{max(zs):.3f}, {-max(ys):.3f}..{-min(ys):.3f}]"
        f" dims={max(xs)-min(xs):.2f}x{max(zs):.2f}x{max(ys)-min(ys):.2f} baseShift={-zmin:+.4f} islands={n_isl} clusters={n_clu} slots={slots} {extra_report}"
    )
    print(msg)
    info = {
        "key": key,
        "path": os.path.relpath(path, ROOT),
        "kb": round(kb, 1),
        "tris": t,
        "script": os.path.relpath(os.path.abspath(sys.argv[0]), ROOT) if sys.argv and sys.argv[0] else None,
        # glTF frame: x, y(up) = Blender z, z = -Blender y
        "size": [round(max(xs) - min(xs), 3), round(max(zs), 3), round(max(ys) - min(ys), 3)],
        "bbox_min": [round(min(xs), 3), 0.0, round(-max(ys), 3)],
        "bbox_max": [round(max(xs), 3), round(max(zs), 3), round(-min(ys), 3)],
        "islands": n_isl,
        "clusters": n_clu,
    }
    print("OLW_ASSET " + json.dumps(info))
    if floating:
        print(f"[e2] WARNING {key}: floating islands {floating[:6]}")
    if abs(zmin) > 0.005:
        print(f"[e2] WARNING {key}: lowest point was {zmin:+.4f} before grounding (parts may hover)")
    return {"key": key, "tris": t, "kb": kb, "floating": floating}


if __name__ == "__main__":
    pass  # library module: nothing to build
