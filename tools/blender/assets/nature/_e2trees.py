"""Tree / bush builders shared by the per-asset scripts (library: no side effects)."""

import math
import random

from mathutils import Vector

import _e2lib as L

BARK = L.hex3("#6e4a33")
BARK_DARK = L.hex3("#4f3424")
BARK_LIGHT = L.hex3("#8d6642")

# foliage ramp around moss (#6b8a4e = LEAF_BASE at runtime, variants retint by ratio)
LEAF_STOPS = [
    (0.0, L.hex3("#3f5530")),
    (0.25, L.hex3("#55703f")),
    (0.5, L.hex3("#6b8a4e")),
    (0.72, L.hex3("#93a86e")),
    (0.95, L.hex3("#b5c48a")),
]


def bark_paint(ob, top=BARK_LIGHT, base=BARK_DARK, z1=None, seed=0):
    zs = [v.co.z for v in ob.data.vertices]
    z1 = z1 or max(zs)

    def fn(co, n, p):
        t = co.z / max(1e-4, z1)
        c = L.ramp([(0.0, base), (0.25, BARK), (1.0, top)], t)
        # vertical streaks + sun side
        s = L.noise.noise(Vector((co.x * 14 + seed, co.y * 14, co.z * 1.5)))
        k = 1.0 + 0.12 * s + 0.1 * max(0.0, n.dot(Vector((0.5, -0.4, 0.3)).normalized()))
        return L.mul(c, k)

    return L.paint(ob, fn)


def canopy(name, masses, clumps_per=10, clump_scale=(0.32, 0.5), voxel=0.07, disp=0.12, disp_size=0.35, target=1500, seed=1, bottom_cut=0.25, squash=0.85, clump_min_z=-0.7, smooth_iters=3, clump_sq=0.82, clump_push=0.86):
    """Several overlapping foliage masses, each crusted with smaller clumps on
    its upper / outer surface -> one connected scalloped canopy surface."""
    rng = random.Random(seed)
    parts = []
    for mi, (cx, cy, cz, r, *rest) in enumerate(masses):
        sq = rest[0] if rest else squash
        parts.append(L.ico(f"{name}_m{mi}", (cx, cy, cz), r, (1, 1, sq), 3))
        n = clumps_per
        for k in range(n):
            # fibonacci-ish points on the upper/outer part of the mass
            u = (k + rng.random() * 0.6) / n
            z = 1 - u * (1 + bottom_cut)  # from top (1) down to -bottom_cut
            if z < clump_min_z:
                continue
            ring = math.sqrt(max(0.0, 1 - z * z))
            a = k * 2.39996 + rng.random() * 0.5 + mi
            d = Vector((ring * math.cos(a), ring * math.sin(a), z * sq))
            cr = r * rng.uniform(*clump_scale)
            c = Vector((cx, cy, cz)) + d * (r * clump_push)
            parts.append(L.ico(f"{name}_c{mi}_{k}", c, cr, (1, 1, clump_sq), 2))
    ob = L.voxel_blob(parts, name, voxel=voxel, disp=disp, disp_size=disp_size, target_tris=target, smooth_iters=smooth_iters, smooth_factor=0.5, seed=seed)
    L.set_slot(ob, "olw_foliage")
    return ob


def paint_canopy(ob, extra_bvh=(), stops=LEAF_STOPS, seed=0, patch=None, ao_k=0.62):
    ao = L.ao_factors(ob, rays=12, dist=1.4, extra=list(extra_bvh), seed=seed)
    cav = L.cavity(ob, iters=2)
    cav = [max(-1.0, min(1.0, c * 2.2)) for c in cav]
    L.foliage_painter(ob, stops, ao=ao, cav=cav, seed=seed, patch=patch, ao_k=ao_k)
    return ob


def skeleton(spec):
    """spec: list of chains [(x,y,z,r), ...]; each chain after the first starts
    at the nearest existing vertex to its first point (the fork)."""
    verts, radii, edges = [], [], []
    for ci, chain in enumerate(spec):
        start = None
        pts = chain
        if ci > 0:
            p0 = Vector(chain[0][:3])
            start = min(range(len(verts)), key=lambda i: (Vector(verts[i]) - p0).length)
            pts = chain[1:]
        prev = start
        for x, y, z, r in pts:
            verts.append((x, y, z))
            radii.append(r)
            i = len(verts) - 1
            if prev is not None:
                edges.append((prev, i))
            prev = i
    return verts, edges, radii


def wood(name, spec, subdiv=1, target=None, seed=0, top=BARK_LIGHT, base=BARK_DARK, slot="olw_bark"):
    verts, edges, radii = skeleton(spec)
    ob = L.skin_tree(name, verts, edges, radii, root=0, subdiv=subdiv)
    L.cut_below(ob, 0.0)
    if target:
        L.decimate(ob, target)
    L.smooth(ob)
    L.set_slot(ob, slot)
    bark_paint(ob, top=top, base=base, seed=seed)
    return ob


def roots(base_z=0.18, n=5, reach=0.42, r0=0.1, seed=0, rot=0.3):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        a = rot + i * 2 * math.pi / n + rng.uniform(-0.25, 0.25)
        rr = reach * rng.uniform(0.75, 1.1)
        out.append([(0, 0, base_z + 0.1, 0), (math.cos(a) * rr * 0.45, math.sin(a) * rr * 0.45, 0.07, r0), (math.cos(a) * rr, math.sin(a) * rr, 0.0, r0 * 0.45)])
    return out


# ------------------------------------------------------------------ flowers


def _frame(normal):
    n = Vector(normal).normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.95 else Vector((1, 0, 0))
    t = n.cross(ref).normalized()
    b = n.cross(t)
    return t, b, n


def flower_head(bm, cols, center, normal, R, petals=5, cup=0.35, spin=0.0, petal_col=None, tip_col=None, eye_col=None, eye=True, inner=0.68):
    """A small star-shaped petal cup (closed lens: top + underside share the rim)
    plus a raised eye. Appends to bmesh `bm`; `cols` collects a per-face-corner
    colour function keyed by face. Returns number of tris added."""
    t, b, n = _frame(normal)
    c = Vector(center)

    def P(r, a, h):
        return c + (t * math.cos(a) + b * math.sin(a)) * r + n * h

    rim = []
    for i in range(petals):
        a = spin + 2 * math.pi * i / petals
        rim.append((bm.verts.new(P(R, a, cup * R)), 1.0))
        rim.append((bm.verts.new(P(R * inner, a + math.pi / petals, cup * R * 0.35)), 0.0))
    top = bm.verts.new(P(0, 0, -0.02 * R))
    bot = bm.verts.new(P(0, 0, -0.28 * R))
    k = len(rim)
    tri = 0
    for j in range(k):
        (v0, w0), (v1, w1) = rim[j], rim[(j + 1) % k]
        f = bm.faces.new((top, v0, v1))
        cols[f] = {top: petal_col, v0: L.mix(petal_col, tip_col, w0), v1: L.mix(petal_col, tip_col, w1)}
        f2 = bm.faces.new((bot, v1, v0))
        dark = L.mul(petal_col, 0.78)
        cols[f2] = {bot: dark, v0: L.mix(dark, tip_col, w0 * 0.7), v1: L.mix(dark, tip_col, w1 * 0.7)}
        tri += 2
    if eye:
        er = R * 0.26
        ring = [bm.verts.new(P(er, spin + i * 2.0944 + 0.5, 0.02 * R)) for i in range(3)]
        apex = bm.verts.new(P(0, 0, 0.2 * R + cup * R * 0.2))
        for i in range(3):
            f = bm.faces.new((ring[i], ring[(i + 1) % 3], apex))
            cols[f] = {ring[i]: L.mul(eye_col, 0.8), ring[(i + 1) % 3]: L.mul(eye_col, 0.8), apex: eye_col}
            tri += 1
    return tri


def leaf(bm, cols, base, angle, length, width, lift, col, col_tip, droop=0.3):
    """Double-sided leaf blade (rim shared by top and underside fans)."""
    d = Vector((math.cos(angle), math.sin(angle), 0))
    s = Vector((-d.y, d.x, 0))
    b0 = Vector(base)
    up = Vector((0, 0, 1))
    mid = b0 + d * length * 0.5 + up * lift
    tipp = b0 + d * length + up * (lift - droop * length * 0.5)
    vb = bm.verts.new(b0)
    vl = bm.verts.new(mid + s * width * 0.5)
    vr = bm.verts.new(mid - s * width * 0.5)
    vt = bm.verts.new(tipp)
    mt = bm.verts.new(mid + up * width * 0.18)
    mb = bm.verts.new(mid - up * width * 0.06)
    rim = [vb, vr, vt, vl]
    for i in range(4):
        a, b = rim[i], rim[(i + 1) % 4]
        f = bm.faces.new((mt, a, b))
        cols[f] = {mt: L.mix(col, col_tip, 0.5), a: col if a is vb else col_tip, b: col if b is vb else col_tip}
        f2 = bm.faces.new((mb, b, a))
        dk = L.mul(col, 0.8)
        cols[f2] = {mb: dk, a: dk, b: dk}
    return 8


def bm_to_obj(name, bm, cols, slot, smooth=False):
    """Materialise a bmesh + per-face-corner colour dict into a painted object."""
    ob_colors = []
    for f in bm.faces:
        cf = cols.get(f)
        ob_colors.append([cf[l.vert] if cf else (1, 1, 1) for l in f.loops])
    me = L.bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = L.bpy.data.objects.new(name, me)
    L.link(ob)
    L.set_slot(ob, slot)
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = attr
    for p, cl in zip(me.polygons, ob_colors):
        for li, c in zip(p.loop_indices, cl):
            attr.data[li].color = (c[0], c[1], c[2], 1.0)
    if smooth:
        L.smooth(ob)
    return ob
