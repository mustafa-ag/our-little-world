"""date-palm: stylized date palm (Phoenix dactylifera), the defining tree of the
UAE. ~4.75 u ringed trunk with a slight lean, a leaf-base "boot" at the crown,
12 pinnate fronds (diamond-section rachis + 8 leaflets per side) and three
hanging date clusters. Writes public/assets/models/date-palm.glb."""

import math
import random

import olw
from olw import Matrix, Vector, bmesh

KEY = "date-palm"
MAX_TRIS = 2000

if "olw_bark" not in olw.SLOTS:  # runtime slot (src/app3d/assets/hero/slots.ts), not in olw's list yet
    olw.SLOTS.append("olw_bark")

TRUNK_H = 4.75  # 19 ring-scar bands of 0.25
BAND = 0.25
R_BASE = 0.09  # diameter 0.18
R_TOP = 0.06  # diameter 0.12
SIDES = 6
BARK_A = "#8b5e3c"
BARK_B = "#9e6d44"
BOOT = "#7a5a36"
FROND_TOP = "#6b8f3a"  # young, upper fronds
FROND_OLD = "#9bae52"  # older, lower fronds
DATES = "#c8782e"

FROND_L = 2.2
RACHIS_SEGS = 6
DENSE = 36  # path samples (rachis uses every DENSE/RACHIS_SEGS-th)
LEAFLETS_PER_SIDE = 8


def trunk_radius(z: float) -> float:
    t = z / TRUNK_H
    return R_BASE + (R_TOP - R_BASE) * t


def build_trunk(b: olw.Builder, lean: Matrix):
    """Sawtooth ring scars: each 0.25 band rises straight then flares into a lip."""
    bm = bmesh.new()
    rings = []
    zs = [(0.0, 1.06)]  # slight flare at the foot
    for k in range(int(round(TRUNK_H / BAND))):
        z0 = k * BAND
        if k:
            zs.append((z0, 1.0))
        zs.append((z0 + BAND * 0.76, 1.09))  # leaf-scar lip
    zs.append((TRUNK_H, 1.0))
    for z, k in zs:
        r = trunk_radius(z) * k
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / SIDES), r * math.sin(2 * math.pi * i / SIDES), z)) for i in range(SIDES)])
    for a, c in zip(rings, rings[1:]):
        for i in range(SIDES):
            j = (i + 1) % SIDES
            bm.faces.new((a[i], a[j], c[j], c[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.transform(bm, matrix=lean, verts=list(bm.verts))
    inv = lean.inverted()

    def bark(p, _n, _rng):
        z = (inv @ p).z
        band = int(z / BAND)
        c = BARK_A if band % 2 == 0 else BARK_B
        return olw.shade(c, 0.82) if (z / BAND) % 1.0 > 0.76 else c

    b.add_bm(bm, "olw_bark", BARK_A, color_fn=bark, vary=0.04, hue=0.015)


def build_boot(b: olw.Builder, lean: Matrix):
    """Bulb of old leaf bases the fronds spring from."""
    p = b.lathe([(R_TOP * 0.95, 0.0), (0.12, 0.12), (0.1, 0.26), (0.0, 0.34)], (0, 0, 0), "olw_bark", BOOT, verts=7)
    bmesh.ops.transform(p.bm, matrix=lean @ Matrix.Translation((0, 0, TRUNK_H - 0.08)), verts=list(p.bm.verts))


def frond_path(base: Vector, az: float, theta: float, droop: float):
    """Dense polyline: starts `theta` deg from vertical, bends `droop` deg further
    towards the tip (arches out, then hangs). Returns (points, tangents)."""
    u = Vector((math.cos(az), math.sin(az), 0))
    z = Vector((0, 0, 1))
    ds = FROND_L / DENSE
    pts, tans = [base.copy()], []
    p = base.copy()
    for i in range(DENSE + 1):
        t = min(1.0, (i + 0.5) / DENSE)
        phi = math.radians(theta + droop * t ** 1.7)
        tan = (u * math.sin(phi) + z * math.cos(phi)).normalized()
        tans.append(tan)
        if i < DENSE:
            p = p + tan * ds
            pts.append(p.copy())
    return pts, tans[: DENSE + 1]


def build_frond(b: olw.Builder, base: Vector, az: float, theta: float, droop: float, age: float, rng: random.Random):
    pts, tans = frond_path(base, az, theta, droop)
    w = Vector((-math.sin(az), math.cos(az), 0))  # frond side axis (horizontal)
    bm = bmesh.new()

    # ---- rachis: diamond (4-vert) section ribbon swept along the path
    step = DENSE // RACHIS_SEGS
    rings = []
    for s in range(RACHIS_SEGS):
        i = s * step
        t = i / DENSE
        hw = 0.04 + (0.008 - 0.04) * t
        ht = 0.025 + (0.006 - 0.025) * t
        n = tans[i].cross(w).normalized()
        p = pts[i]
        rings.append([bm.verts.new(p + w * hw), bm.verts.new(p + n * ht), bm.verts.new(p - w * hw), bm.verts.new(p - n * ht)])
    tip = bm.verts.new(pts[-1])
    for a, c in zip(rings, rings[1:]):
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((a[k], a[j], c[j], c[k]))
    for k in range(4):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % 4], tip))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    # ---- leaflets: tapered kites, alternating left/right, V-folded upward, double-sided
    count = LEAFLETS_PER_SIDE * 2
    for k in range(count):
        side = 1 if k % 2 == 0 else -1
        t = 0.16 + 0.8 * k / (count - 1)
        i = min(DENSE, int(round(t * DENSE)))
        T = tans[i]
        n = T.cross(w).normalized()
        hw = 0.04 + (0.008 - 0.04) * t
        ll = 0.55 * (1.0 - 0.4 * t) * rng.uniform(0.92, 1.05)
        wd = 0.2 * (1.0 - 0.4 * t)
        alpha = math.radians(38 + 14 * t)
        d = (T * math.cos(alpha) + w * side * math.sin(alpha) + n * 0.24).normalized()
        e = d.cross(n).normalized()
        B = pts[i] + w * side * hw * 0.6
        M = B + d * ll * 0.26 + n * 0.015
        m1, m2 = M + e * wd / 2, M - e * wd / 2
        Tp = B + d * ll - n * (0.06 * ll)
        front = [(B, m1, Tp), (B, Tp, m2)]
        # orient both front tris to face +n (upper side), then add reversed copies
        for tri in front:
            nrm = (tri[1] - tri[0]).cross(tri[2] - tri[0])
            if nrm.dot(n) < 0:
                tri = (tri[0], tri[2], tri[1])
            vs = [bm.verts.new(v) for v in tri]
            bm.faces.new(vs)
            vb = [bm.verts.new(v) for v in reversed(tri)]
            bm.faces.new(vb)

    crown = base.copy()

    def leaf(p, _n, _rng, age=age, crown=crown):
        t = min(1.0, (p - crown).length / FROND_L)
        return olw.mix(FROND_TOP, FROND_OLD, min(1.0, 0.78 * age + 0.3 * t * t))

    b.add_bm(bm, "olw_foliage", FROND_TOP, color_fn=leaf, vary=0.05, hue=0.02, ao=False)


def build_dates(b: olw.Builder, crown: Vector, lean: Matrix, rng: random.Random):
    """Three amber date bunches hanging under the crown."""
    for k in range(3):
        az = 2 * math.pi * (k / 3) + 0.4
        out = Vector((math.cos(az), math.sin(az), 0))
        c = crown + out * 0.17 + Vector((0, 0, -0.22))
        b.sphere(0.075, c, "olw_flower", DATES, subdiv=0, scale=(1, 1, 1.35), jitter=0.01, vary=0.08, ao=False)
        b.sphere(0.055, c + out * 0.05 + Vector((0, 0, -0.1)), "olw_flower", olw.shade(DATES, 0.9), subdiv=0, scale=(1, 1, 1.3), vary=0.08, ao=False)


def build():
    rng = random.Random(7)
    b = olw.Builder(KEY, seed=7)
    lean_dir = rng.uniform(0, 2 * math.pi)
    lean_deg = rng.uniform(3.0, 5.0)
    lean = Matrix.Rotation(math.radians(lean_deg), 4, Vector((math.cos(lean_dir), math.sin(lean_dir), 0)))
    build_trunk(b, lean)
    build_boot(b, lean)
    crown = lean @ Vector((0, 0, TRUNK_H + 0.14))

    # 12 fronds evenly in azimuth: 4 lower drooping (older), 8 upper more upright
    az0 = rng.uniform(0, 2 * math.pi)
    for k in range(12):
        az = az0 + 2 * math.pi * k / 12 + rng.uniform(-0.08, 0.08)
        lower = k % 3 == 0  # 4 of 12, spread around the crown
        if lower:
            theta, droop, age, dz = rng.uniform(55, 65), rng.uniform(70, 85), rng.uniform(0.8, 1.0), -0.06
        else:
            theta, droop, age, dz = rng.uniform(25, 35), rng.uniform(85, 100), rng.uniform(0.0, 0.3), 0.04
        base = crown + Vector((math.cos(az), math.sin(az), 0)) * 0.05 + Vector((0, 0, dz))
        build_frond(b, base, az, theta, droop, age, rng)

    build_dates(b, crown, lean, rng)
    return b.finish(ao_height=0.5, smooth_angle=50.0)


if __name__ == "__main__" and olw.wanted(KEY):
    olw.build_and_export(KEY, build, max_tris=MAX_TRIS)
