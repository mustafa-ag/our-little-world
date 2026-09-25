"""tree-cypress: tall narrow Italian-cypress flame (~4.7 u) with a short visible
trunk. Writes public/assets/models/tree-cypress.glb."""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402
from mathutils import Vector  # noqa: E402

KEY = "tree-cypress"

STOPS = [
    (0.0, L.hex3("#2f4529")),
    (0.3, L.hex3("#44603a")),
    (0.55, L.hex3("#5a7a48")),
    (0.8, L.hex3("#7c9760")),
    (1.0, L.hex3("#a3b67f")),
]


def axis(t):
    """Centre line of the flame, t in 0..1 (slight S-sway toward the tip)."""
    return Vector((0.06 * math.sin(t * 3.2) + 0.1 * t * t, 0.04 * math.sin(t * 2.1 + 0.5), 0.72 + t * 4.3))


def radius(t):
    # swells quickly, widest ~30 %, long taper into a soft point
    return 0.12 + 0.46 * math.sin(min(1.0, t * 1.25 + 0.12) * math.pi) ** 0.8 * (1 - t) ** 0.35


def build():
    L.reset(51)
    rng = random.Random(7)
    spec = [[(0, 0, -0.1, 0.11), (0.0, 0.0, 0.3, 0.09), (0.02, 0.0, 1.2, 0.07), (0.1, 0.02, 3.6, 0.04)]] + T.roots(base_z=0.08, n=3, reach=0.2, r0=0.05, seed=9)
    trunk = T.wood("trunk", spec, subdiv=1, target=260, seed=2)

    parts = []
    n = 13
    for i in range(n):
        t = i / (n - 1)
        c = axis(t * 0.9)
        r = radius(t * 0.9)
        parts.append(L.ico(f"core{i}", c, r, (1, 1, 1.5), 2))
    # flame licks: vertically stretched clumps spiralling up the surface
    m = 46
    for k in range(m):
        t = 0.03 + 0.85 * (k + rng.random() * 0.5) / m
        a = k * 2.39996 + rng.uniform(-0.3, 0.3)
        c = axis(t)
        r = radius(t)
        p = c + Vector((math.cos(a), math.sin(a), 0)) * r * 0.85
        cr = r * rng.uniform(0.38, 0.55) + 0.03
        parts.append(L.ico(f"lick{k}", p, cr, (1, 1, 1.9), 2))
    crown = L.voxel_blob(parts, "crown", voxel=0.04, disp=0.02, disp_size=0.15, target_tris=1500, smooth_iters=3, smooth_factor=0.5)
    L.set_slot(crown, "olw_foliage")
    T.paint_canopy(crown, seed=3, stops=STOPS, ao_k=0.4)
    ob = L.join([trunk, crown], KEY)
    return L.finish(ob, KEY)


if __name__ == "__main__" and L.wanted(KEY):
    build()
