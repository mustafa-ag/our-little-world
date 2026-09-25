"""car: compact classic European hatchback (~2.4 x 1.1 x 0.95 u), muted teal
body (baked around CAR_BASE #5f8f8a so `c=#hex` retints by ratio), cream
bumpers, round emissive headlights, inset windows, door seams, rounded wheel
arches with lips, real tyres + hubcaps. Front faces Blender +Y (glTF -Z).
Writes public/assets/models/car.glb."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "nature"))
import _e2lib as L  # noqa: E402
from mathutils import Vector  # noqa: E402

bpy = L.bpy
bmesh = L.bmesh
H = L.hex3
KEY = "car"

PAINT = H("#5f8f8a")  # == PALETTE.carTeal (runtime CAR_BASE)
PAINT_LIGHT = H("#7fa39a")
PAINT_DARK = H("#46706b")
SEAM = H("#2f4744")
UNDER = H("#2b3130")
CREAM = H("#efe3c8")
CHROME = H("#d9d6cf")
RUBBER = H("#2a292c")
GLASS_LO = H("#34454d")
GLASS_HI = H("#7d97a1")

HALF_W = 0.52
AXLES = (0.74, -0.72)
WHEEL_R = 0.2
ARCH_R = 0.255


def body():
    prof = [(-1.13, 0.15), (1.13, 0.15), (1.165, 0.22), (1.17, 0.4), (1.13, 0.47), (0.95, 0.49), (0.55, 0.535), (-1.0, 0.55), (-1.125, 0.52), (-1.16, 0.42), (-1.165, 0.22)]
    bm = bmesh.new()
    left = [bm.verts.new((-HALF_W, y, z)) for y, z in prof]
    right = [bm.verts.new((HALF_W, y, z)) for y, z in prof]
    n = len(prof)
    bm.faces.new(list(reversed(left)))
    bm.faces.new(right)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # plan-view taper: the nose and tail are a little narrower than the doors
    for v in bm.verts:
        if v.co.y > 0.9:
            v.co.x *= 0.95
        elif v.co.y < -1.05:
            v.co.x *= 0.97
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.085, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    # soft side bulge: flanks swell a little at mid height (less slab-sided)
    for v in bm.verts:
        k = 1.0 + 0.035 * max(0.0, 1.0 - abs(v.co.z - 0.36) / 0.2)
        v.co.x *= k
    ob = L.obj_from_bm("body", bm)
    # wheel arches: boolean-cut cylinders on each flank (the middle stays solid for the axles)
    for i, ay in enumerate(AXLES):
        for sx in (-1, 1):
            cyl = L.lathe(f"archcut{i}", [(ARCH_R, 0.3), (ARCH_R, 0.9)], segs=20, axis="X")
            cyl.data.transform(L.Matrix.Diagonal((sx, 1, 1, 1)))
            cyl.location = (0, ay, WHEEL_R)
            m = ob.modifiers.new(f"arch{i}", "BOOLEAN")
            m.operation = "DIFFERENCE"
            m.solver = "EXACT"
            m.object = cyl
            L.apply_mods(ob)
            bpy.data.objects.remove(cyl)
    # door seams: thin strips between paired bisect planes
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for y in (0.455, 0.467, -0.297, -0.285):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0, y, 0), plane_no=(0, 1, 0))
    # tailgate shut line
    for z in (0.262, 0.272):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(ob.data)
    bm.free()
    L.set_slot(ob, "olw_paint")
    L.smooth(ob, sharp_angle=50)

    def col(co, nrm, p):
        c = p.center
        pn = p.normal
        # arch interiors and underside
        for ay in AXLES:
            if (Vector((c.y - ay, c.z - WHEEL_R))).length < ARCH_R + 0.004 and abs(pn.x) < 0.6:
                return UNDER
        if pn.z < -0.6:
            return UNDER
        side = abs(pn.x) > 0.55
        in_seam = (0.455 < c.y < 0.467) or (-0.297 < c.y < -0.285)
        if side and in_seam and 0.17 < c.z < 0.535:
            return SEAM
        if pn.y < -0.6 and 0.262 < c.z < 0.272:
            return SEAM
        t = 0.5 + 0.5 * nrm.z
        base = L.mix(PAINT_DARK, PAINT, L.smoothstep(0.15, 0.4, co.z))
        return L.mix(base, PAINT_LIGHT, max(0.0, (t - 0.6) * 1.6))

    L.paint(ob, col)
    return ob


def cabin():
    # three rings (bottom inside the body, window sill/belt, roof) x (front, B-pillar, rear) per side
    rings = [
        (0.50, 0.505, (0.66, -0.3, -1.11)),
        (0.575, 0.49, (0.53, -0.3, -1.04)),
        (0.95, 0.375, (0.0, -0.33, -0.56)),
    ]
    bm = bmesh.new()
    tag = bm.faces.layers.int.new("win")
    V = []
    for z, hw, ys in rings:
        # order around: L-front, L-pillar, L-rear, R-rear, R-pillar, R-front
        r = [(-hw, ys[0], z), (-hw, ys[1], z), (-hw, ys[2], z), (hw, ys[2], z), (hw, ys[1], z), (hw, ys[0], z)]
        V.append([bm.verts.new(p) for p in r])
    for li in range(2):
        a, b = V[li], V[li + 1]
        for i in range(6):
            j = (i + 1) % 6
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f[tag] = 0 if li == 0 else [1, 2, 3, 4, 5, 6][i]  # windows on the upper band
    bm.faces.new(list(reversed(V[0])))
    roof = bm.faces.new(V[2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # rounded roof: bevel the roof perimeter; softer A/C pillars
    roof_edges = list(roof.edges)
    bmesh.ops.bevel(bm, geom=roof_edges, offset=0.13, segments=4, affect="EDGES", profile=0.5, clamp_overlap=True)
    bm.edges.ensure_lookup_table()
    pillar = []
    for e in bm.edges:
        a, b = e.verts
        if a.co.z > 0.57 and b.co.z > 0.57 and abs(a.co.z - b.co.z) > 0.2:
            ys = (a.co.y + b.co.y) / 2
            if ys > 0.1 or ys < -0.7:  # A and C pillars only
                pillar.append(e)
    if pillar:
        bmesh.ops.bevel(bm, geom=pillar, offset=0.03, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    # the window faces: largest face per tag
    best = {}
    for f in bm.faces:
        t = f[tag]
        if t >= 1 and (t not in best or f.calc_area() > best[t].calc_area()):
            best[t] = f
    glass, seal = [], []
    for t, f in best.items():
        frame = 0.04 if t in (1, 4) else 0.032
        bmesh.ops.inset_individual(bm, faces=[f], thickness=frame, depth=0.0, use_even_offset=True)
        r = bmesh.ops.inset_individual(bm, faces=[f], thickness=0.01, depth=-0.022, use_even_offset=True)
        seal += r["faces"]
        glass.append(f)
    bm.faces.index_update()
    gi = {f.index for f in glass}
    si = {f.index for f in seal}
    ob = L.obj_from_bm("cabin", bm)
    me = ob.data
    me.materials.append(L.mat("olw_paint"))
    me.materials.append(L.mat("olw_glass"))
    me.materials.append(L.mat("olw_rubber"))
    for p in me.polygons:
        p.material_index = 1 if p.index in gi else 2 if p.index in si else 0
    L.smooth(ob, sharp_angle=40)
    zs = [v.co.z for v in me.vertices]
    z0, z1 = 0.575, max(zs)

    def col(co, nrm, p):
        if p.material_index == 1:
            # darker glass: lower edge deep, upper edge catches the sky, plus a diagonal sheen
            t = (co.z - z0) / (z1 - z0)
            c = L.mix(GLASS_LO, GLASS_HI, t * 0.8)
            sheen = 0.5 + 0.5 * math.sin((co.y * 2.2 + co.z * 5.0) * 2.0)
            return L.mix(c, H("#a9bcc2"), 0.25 * sheen * t)
        if p.material_index == 2:
            return RUBBER
        t = 0.5 + 0.5 * nrm.z
        return L.mix(PAINT, PAINT_LIGHT, max(0.0, (t - 0.55) * 1.8))

    L.paint(ob, col)
    return ob


def wheel(ax, ay, side):
    """Tyre (rubber, rounded section) + cream/chrome domed hubcap; hub faces outward (sign `side`)."""
    tyre = L.lathe("tyre", [(0.118, -0.068), (0.165, -0.074), (0.19, -0.066), (0.2, -0.04), (0.2, 0.04), (0.19, 0.066), (0.165, 0.074), (0.118, 0.068)], segs=12, axis="X", slot="olw_rubber")
    L.paint(tyre, lambda co, n, p: L.mul(RUBBER, 1.0 + 0.25 * max(0.0, n.z)))
    hub = L.lathe("hub", [(0.13, 0.05), (0.128, 0.074), (0.1, 0.082), (0.05, 0.088), (0.02, 0.094), (0.0, 0.095)], segs=12, axis="X", slot="olw_metal")

    def hubcol(co, n, p):
        r = math.hypot(co.y, co.z)
        if r > 0.115:
            return CHROME
        if r < 0.03:
            return H("#b9b4aa")
        return L.mix(CREAM, CHROME, 0.3 + 0.3 * n.z)

    L.paint(hub, hubcol)
    L.smooth(tyre, sharp_angle=70)
    L.smooth(hub, sharp_angle=60)
    w = L.join([tyre, hub], "wheel")
    if side < 0:
        w.data.transform(L.Matrix.Diagonal((-1, 1, 1, 1)))
        w.data.flip_normals()
    w.data.transform(L.Matrix.Translation((ax, ay, WHEEL_R)))
    return w


def arch_lip(ay, side):
    pts = []
    for i in range(10):
        a = math.radians(-12 + i * (204 / 9))
        pts.append((side * (HALF_W - 0.003), ay + math.cos(a) * (ARCH_R + 0.012), WHEEL_R + math.sin(a) * (ARCH_R + 0.012)))
    lip = L.tube("lip", pts, 0.022, sides=5, slot="olw_paint")
    L.paint(lip, lambda co, n, p: L.mix(PAINT_DARK, PAINT, 0.5 + 0.5 * n.z))
    return lip


def details():
    parts = []
    # bumpers (cream, wrap-around)
    for y in (1.175, -1.175):
        b = L.rounded_box("bumper", (1.0, 0.09, 0.085), (0, y, 0.205), bevel=0.035, segs=2, slot="olw_metal")
        L.paint(b, lambda co, n, p: L.mul(CREAM, 0.92 + 0.12 * max(0.0, n.z)))
        parts.append(b)
    # headlights: chrome ring + domed emissive lens
    for sx in (-1, 1):
        ring = L.lathe("hlring", [(0.07, 1.12), (0.086, 1.13), (0.088, 1.17), (0.078, 1.182), (0.068, 1.18)], segs=14, axis="Y", slot="olw_metal")
        ring.data.transform(L.Matrix.Translation((sx * 0.33, 0, 0.39)))
        L.paint_flat(ring, CHROME)
        lens = L.lathe("hllens", [(0.07, 1.17), (0.066, 1.186), (0.045, 1.197), (0.0, 1.202)], segs=14, axis="Y", slot="olw_light_emissive")
        lens.data.transform(L.Matrix.Translation((sx * 0.33, 0, 0.39)))
        L.paint(lens, lambda co, n, p: L.mix(H("#fff4d6"), H("#f3dca0"), 0.5 - 0.5 * n.y))
        L.smooth(lens)
        parts += [ring, lens]
        # rear lights: red over amber
        tl = L.rounded_box("taillight", (0.12, 0.04, 0.13), (sx * 0.39, -1.155, 0.4), bevel=0.015, segs=1, slot="olw_metal")
        L.paint(tl, lambda co, n, p: H("#d9924a") if co.z < 0.365 else H("#b8463f"))
        parts.append(tl)
        # door handle
        dh = L.rounded_box("handle", (0.02, 0.08, 0.02), (sx * 0.52, -0.2, 0.47), bevel=0.006, segs=1, slot="olw_metal")
        L.paint_flat(dh, CHROME)
        parts.append(dh)
        # wing mirror: stalk + head
        st = L.tube("mstalk", [(sx * 0.48, 0.47, 0.6), (sx * 0.56, 0.44, 0.64)], 0.012, sides=4, slot="olw_paint")
        L.paint_flat(st, PAINT_DARK)
        mh = L.rounded_box("mhead", (0.05, 0.075, 0.055), (sx * 0.575, 0.43, 0.65), bevel=0.018, segs=2, slot="olw_paint")
        L.paint(mh, lambda co, n, p: L.mix(PAINT, PAINT_LIGHT, max(0.0, n.z)) if n.y > -0.5 else H("#46505a"))
        parts += [st, mh]
        # chrome belt trim along the window sill
        tr = L.tube("trim", [(sx * 0.497, 0.53, 0.575), (sx * 0.497, -1.07, 0.575)], 0.008, sides=4, slot="olw_metal")
        L.paint_flat(tr, CHROME)
        parts.append(tr)
        # arch lips
        for ay in AXLES:
            parts.append(arch_lip(ay, sx))
    # grille + chrome bars
    g = L.rounded_box("grille", (0.34, 0.05, 0.11), (0, 1.15, 0.37), bevel=0.012, segs=1, slot="olw_metal")
    L.paint_flat(g, H("#35393a"))
    parts.append(g)
    for z in (0.35, 0.39):
        bar = L.rounded_box("bar", (0.32, 0.012, 0.012), (0, 1.177, z), bevel=0.0, slot="olw_metal")
        L.paint_flat(bar, CHROME)
        parts.append(bar)
    # number plates
    for y, z in ((1.225, 0.2), (-1.225, 0.2)):
        pl = L.rounded_box("plate", (0.26, 0.02, 0.07), (0, y, z), bevel=0.006, segs=1, slot="olw_metal")
        L.paint(pl, lambda co, n, p: H("#f6f1e4") if abs(n.y) > 0.8 else H("#9a978f"))
        parts.append(pl)
    return parts


def build():
    L.reset(91)
    parts = [body(), cabin()]
    for sx in (-1, 1):
        for ay in AXLES:
            parts.append(wheel(sx * (HALF_W - 0.075), ay, sx))
    for ay in AXLES:
        ax = L.tube("axle", [(-(HALF_W - 0.1), ay, WHEEL_R), (HALF_W - 0.1, ay, WHEEL_R)], 0.03, sides=6, slot="olw_metal")
        L.paint_flat(ax, UNDER)
        parts.append(ax)
    parts += details()
    ob = L.join(parts, KEY)
    return L.finish(ob, KEY, recentre_xy=True)


if __name__ == "__main__" and L.wanted(KEY):
    build()
