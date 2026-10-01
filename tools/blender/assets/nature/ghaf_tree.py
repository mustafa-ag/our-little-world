"""ghaf-tree: Ghaf (Prosopis cineraria), the UAE's national tree - a short gnarled
trunk splitting into 4 outward-curving limbs under a broad, flattened, dappled
canopy of 8 overlapping clusters (~3.6 u wide). Writes
public/assets/models/ghaf-tree.glb."""

import math
import random

import olw
from olw import Matrix, Vector, bmesh

KEY = "ghaf-tree"
MAX_TRIS = 1500

if "olw_bark" not in olw.SLOTS:  # runtime slot (src/app3d/assets/hero/slots.ts), not in olw's list yet
    olw.SLOTS.append("olw_bark")

BARK = "#7a6353"
LEAF_TOP = "#8aab52"
LEAF_UNDER = "#5a7a38"


def taper_tube(b: olw.Builder, pts, radii, mat, color, sides=6, jitter=0.0, rng=None, **kw):
    """Bent, tapered rod through `pts` (radius per point; 0 at the end = pointed tip).
    Parallel-transported frames keep the rings from twisting; optional per-ring
    jitter gives a gnarled look. Bottom end capped, tip closed with a pole."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((1, 0, 0)) if abs(t0.x) < 0.9 else Vector((0, 1, 0))
    u = t0.cross(ref).normalized()
    rings, prev_t = [], t0
    for i, (p, r) in enumerate(zip(pts, radii)):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        # parallel transport of the frame
        axis = prev_t.cross(t)
        if axis.length > 1e-6:
            ang = prev_t.angle(t)
            u = (Matrix.Rotation(ang, 3, axis.normalized()) @ u).normalized()
        prev_t = t
        w = t.cross(u).normalized()
        if r <= 1e-6:
            rings.append([bm.verts.new(p)])
            continue
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = r * (1 + (rng.uniform(-jitter, jitter) if (rng and jitter) else 0))
            ring.append(bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * rr))
        rings.append(ring)
    for a, c in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            if len(c) == 1:
                bm.faces.new((a[k], a[j], c[0]))
            else:
                bm.faces.new((a[k], a[j], c[j], c[k]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return b.add_bm(bm, mat, color, **kw)


def leaf_colour(p, n, rng):
    """Sunlit tops light, shaded undersides dark (by face normal)."""
    t = max(0.0, min(1.0, (n.z + 0.35) / 1.2))
    return olw.mix(LEAF_UNDER, LEAF_TOP, t * t * (3 - 2 * t))


def build():
    rng = random.Random(11)
    b = olw.Builder(KEY, seed=11)

    # ---- gnarled trunk: 1.0 u, slight S-bend, jittered rings
    trunk_pts = [(0, 0, 0), (0.04, -0.02, 0.3), (-0.02, 0.03, 0.6), (0.02, 0.0, 0.85), (0.0, 0.0, 1.0)]
    taper_tube(b, trunk_pts, [0.17, 0.14, 0.13, 0.13, 0.11], "olw_bark", BARK, sides=7, jitter=0.12, rng=rng, vary=0.07)
    # root flare: three short buttresses
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        d = Vector((math.cos(a), math.sin(a), 0))
        taper_tube(b, [d * 0.06 + Vector((0, 0, 0.22)), d * 0.22 + Vector((0, 0, 0.0))], [0.07, 0.035], "olw_bark", olw.shade(BARK, 0.92), sides=5)

    # ---- 4 main limbs from 0.8 u, curving outward then up into the canopy
    split = Vector((0.0, 0.0, 0.8))
    tips = []
    az0 = rng.uniform(0, 2 * math.pi)
    for k in range(4):
        az = az0 + 2 * math.pi * k / 4 + rng.uniform(-0.25, 0.25)
        d = Vector((math.cos(az), math.sin(az), 0))
        reach = rng.uniform(1.0, 1.25)
        lift = rng.uniform(1.15, 1.4)
        pts = [split - d * 0.03]
        for s in range(1, 5):
            t = s / 4
            # out fast at first, then turn upward (bend via per-segment rotation)
            out = reach * math.sin(t * math.pi / 2) ** 0.8
            up = lift * t ** 1.3
            side = d.cross(Vector((0, 0, 1))) * 0.08 * math.sin(t * math.pi) * (1 if k % 2 else -1)
            pts.append(split + d * out + Vector((0, 0, up)) + side)
        taper_tube(b, pts, [0.085, 0.07, 0.055, 0.04, 0.0], "olw_bark", BARK, sides=6, jitter=0.08, rng=rng, vary=0.07)
        tips.append((pts[-1], d))
        # one secondary twig off the middle of each limb
        m = pts[2]
        tw = (d + d.cross(Vector((0, 0, 1))) * (0.8 if k % 2 else -0.8)).normalized()
        taper_tube(b, [m, m + tw * 0.45 + Vector((0, 0, 0.35))], [0.035, 0.0], "olw_bark", BARK, sides=5)

    # ---- canopy: 8 flattened, overlapping clusters (broad, irregular, dappled)
    clusters = []
    for k, (tip, d) in enumerate(tips):
        clusters.append((tip + d * 0.15 + Vector((0, 0, 0.12)), rng.uniform(0.66, 0.78)))
    for k in range(3):  # between limbs
        a = az0 + 2 * math.pi * (k + 0.5) / 3 + 0.3
        dd = Vector((math.cos(a), math.sin(a), 0))
        clusters.append((Vector((0, 0, 2.15)) + dd * rng.uniform(0.75, 0.95), rng.uniform(0.6, 0.7)))
    clusters.append((Vector((0.05, -0.05, 2.45)), 0.78))  # crown top
    for c, r in clusters:
        b.blob(r, c, "olw_foliage", LEAF_TOP, scale=(1.0, 1.0, 0.7), subdiv=2, jitter=0.18, flat_bottom=False,
               color_fn=leaf_colour, vary=0.07, hue=0.03, ao=False)
    for p in b.parts:  # tilted bottom rings / root tips: flatten onto the ground
        for v in p.bm.verts:
            v.co.z = max(0.0, v.co.z)
    return b.finish(ao_height=0.4, smooth_angle=45.0)


if __name__ == "__main__" and olw.wanted(KEY):
    olw.build_and_export(KEY, build, max_tris=MAX_TRIS, size=(3.6, 3.6, 3.0), size_tol=0.25)
