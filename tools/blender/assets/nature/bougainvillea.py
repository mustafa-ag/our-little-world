"""bougainvillea: cascading flowering shrub/vine common in UAE gardens - a low
dark-green leaf mound (~1.5 x 1.0 x 0.8 u) with arching stems and bright
magenta bract clusters at the tips and scattered over the top. Writes
public/assets/models/bougainvillea.glb."""

import math
import random

import olw
from olw import Matrix, Vector, bmesh

KEY = "bougainvillea"
MAX_TRIS = 800

if "olw_bark" not in olw.SLOTS:  # runtime slot (src/app3d/assets/hero/slots.ts), not in olw's list yet
    olw.SLOTS.append("olw_bark")

LEAF = "#3a5c28"
BRACT = "#e0449a"
STEM = "#6b4a32"


def taper_tube(b: olw.Builder, pts, radii, mat, color, sides=4, **kw):
    """Bent, tapered stem through `pts`; radius 0 at the end closes it to a point."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((1, 0, 0)) if abs(t0.x) < 0.9 else Vector((0, 1, 0))
    u = t0.cross(ref).normalized()
    rings, prev_t = [], t0
    for i, (p, r) in enumerate(zip(pts, radii)):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        axis = prev_t.cross(t)
        if axis.length > 1e-6:
            u = (Matrix.Rotation(prev_t.angle(t), 3, axis.normalized()) @ u).normalized()
        prev_t = t
        w = t.cross(u).normalized()
        if r <= 1e-6:
            rings.append([bm.verts.new(p)])
        else:
            rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / sides) + w * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for a, c in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], a[j], c[0]) if len(c) == 1 else (a[k], a[j], c[j], c[k]))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return b.add_bm(bm, mat, color, **kw)


def leaf_colour(p, n, rng):
    return olw.shade(LEAF, 0.85 + 0.3 * max(0.0, min(1.0, p.z / 0.8)))


def bract_colour(p, n, rng):
    return olw.mix(BRACT, "#f27ab8", 0.35 * max(0.0, n.z)) if n.z > 0 else olw.shade(BRACT, 0.85)


def build():
    rng = random.Random(23)
    b = olw.Builder(KEY, seed=23)

    # ---- dense leaf mound (x 1.5 wide, y 1.0 deep, z 0.8 tall)
    masses = [  # (x, y, z, r, subdiv)
        (0.0, 0.0, 0.34, 0.44, 2),
        (-0.38, 0.06, 0.28, 0.34, 2),
        (0.38, -0.04, 0.27, 0.34, 2),
        (0.08, 0.12, 0.5, 0.28, 2),
        (-0.18, -0.24, 0.22, 0.26, 1),
        (0.2, 0.26, 0.2, 0.26, 1),
        (-0.5, -0.12, 0.16, 0.2, 1),
    ]
    for x, y, z, r, sd in masses:
        b.blob(r, (x * 0.85, y * 0.9, z), "olw_foliage", LEAF, scale=(1.0, 0.9, 0.85), subdiv=sd, jitter=0.2,
               flat_bottom=True, color_fn=leaf_colour, vary=0.08, hue=0.03)

    # ---- 4 arching stems from the base, cascading out over the mound's edge
    stems = [  # (azimuth deg, reach, peak height, droop end height)
        (10, 0.7, 0.74, 0.36),
        (165, 0.7, 0.7, 0.32),
        (80, 0.6, 0.76, 0.42),
        (245, 0.62, 0.66, 0.3),
    ]
    tips = []
    for az, reach, peak, end in stems:
        a = math.radians(az)
        d = Vector((math.cos(a) * 1.0, math.sin(a) * 0.62, 0))
        pts = []
        for s in range(4):
            t = s / 3
            h = 0.05 + (peak - 0.05) * math.sin(t * math.pi * 0.62) / math.sin(math.pi * 0.62) if t < 0.99 else end
            pts.append(d * reach * t + Vector((0, 0, h)))
        pts[0] = Vector((0, 0, 0))
        taper_tube(b, pts, [0.03, 0.022, 0.015, 0.0], "olw_bark", STEM, sides=3, ao=True)
        # leafy tuft riding the top of the arch, so the stems read as leafy canes
        b.blob(0.12, pts[2] + Vector((0, 0, -0.02)), "olw_foliage", LEAF, scale=(1.2, 1.0, 0.75), subdiv=1, jitter=0.15,
               flat_bottom=False, color_fn=leaf_colour, vary=0.08, hue=0.03)
        tips.append(pts[-1])

    # ---- magenta bract clusters: at each stem tip + 2 scattered on the mound top
    spots = list(tips) + [Vector((-0.12, -0.1, 0.66)), Vector((0.28, 0.2, 0.58))]
    for k, c in enumerate(spots):
        b.sphere(0.13, c + Vector((0, 0, 0.02)), "olw_flower", BRACT, subdiv=1, scale=(1.0, 0.85, 0.7), jitter=0.025,
                 color_fn=bract_colour, vary=0.06, ao=False)
        off = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.08, 0.08), -0.07))
        b.sphere(0.085, c + off, "olw_flower", BRACT, subdiv=1, scale=(1.0, 0.9, 0.75), jitter=0.02,
                 color_fn=bract_colour, vary=0.06, ao=False)

    for p in b.parts:  # mound sits on the ground
        for v in p.bm.verts:
            v.co.z = max(0.0, v.co.z)
    return b.finish(ao_height=0.3)


if __name__ == "__main__" and olw.wanted(KEY):
    olw.build_and_export(KEY, build, max_tris=MAX_TRIS, size=(1.5, 1.0, 0.8), size_tol=0.25)
