"""bush-a (soft lumpy shrub) and bush-b (rounder shrub dotted with small pink /
cream flowers). Writes public/assets/models/bush-a.glb and bush-b.glb."""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402
from mathutils import Vector  # noqa: E402

H = L.hex3


def bush_a():
    L.reset(71)
    masses = [
        (0.0, 0.0, 0.34, 0.42, 0.85),
        (0.3, 0.07, 0.26, 0.32, 0.85),
        (-0.29, -0.05, 0.25, 0.31, 0.85),
        (0.06, 0.26, 0.26, 0.29, 0.85),
        (-0.04, -0.26, 0.27, 0.29, 0.85),
        (0.18, -0.1, 0.5, 0.26, 0.85),
        (-0.08, 0.08, 0.56, 0.27, 0.85),
    ]
    b = T.canopy("bush", masses, clumps_per=11, clump_scale=(0.4, 0.55), voxel=0.03, disp=0.015, disp_size=0.12, target=820, seed=3, bottom_cut=0.2)
    L.cut_below(b, 0.0)
    b.data.transform(L.Matrix.Diagonal((0.7, 0.72, 0.9, 1)))  # ~0.9 wide x 0.7 tall
    L.smooth(b)
    T.paint_canopy(b, seed=4)
    return L.finish(b, "bush-a")


def bush_b():
    L.reset(81)
    rng = random.Random(12)
    masses = [
        (0.0, 0.0, 0.33, 0.4, 0.9),
        (0.27, 0.12, 0.26, 0.3, 0.9),
        (-0.27, -0.08, 0.26, 0.31, 0.9),
        (0.02, -0.26, 0.24, 0.28, 0.9),
        (-0.06, 0.26, 0.25, 0.28, 0.9),
    ]
    stops = [(0.0, H("#3f5530")), (0.3, H("#5a7443")), (0.55, H("#6f8e52")), (0.8, H("#93a86e")), (0.98, H("#b5c48a"))]
    b = T.canopy("bush", masses, clumps_per=10, clump_scale=(0.4, 0.55), voxel=0.03, disp=0.015, disp_size=0.12, target=700, seed=5, bottom_cut=0.2)
    L.cut_below(b, 0.0)
    b.data.transform(L.Matrix.Diagonal((0.68, 0.7, 0.92, 1)))  # ~0.85 wide x 0.75 tall
    L.smooth(b)
    T.paint_canopy(b, seed=9, stops=stops)
    # flowers sit on the sunlit upper half of the surface
    bvh = L.bvh_of(b)
    bm = L.bmesh.new()
    cols = {}
    pinks = [(H("#d49a9a"), H("#f0c9c2")), (H("#f1e6cf"), H("#fffaf0")), (H("#c9858a"), H("#e6a9aa"))]
    n = 26
    placed = 0
    for k in range(60):
        if placed >= n:
            break
        u = rng.random()
        a = rng.uniform(0, 2 * math.pi)
        el = math.radians(rng.uniform(15, 80))
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        o = Vector((0, 0, 0.25)) + d * 1.2
        hit = bvh.ray_cast(o, -d)
        if hit[0] is None or hit[1].z < 0.15:
            continue
        pc, tc = pinks[placed % 3]
        T.flower_head(bm, cols, hit[0] - hit[1] * 0.004, hit[1] * 0.6 + Vector((0, 0, 0.4)), rng.uniform(0.045, 0.06), petals=5, cup=0.45, spin=u * 2, petal_col=pc, tip_col=tc, eye_col=H("#e8cf7a"))
        placed += 1
    fl = T.bm_to_obj("flowers", bm, cols, "olw_flower")
    ob = L.join([b, fl], "bush-b")
    return L.finish(ob, "bush-b")


if __name__ == "__main__":
    if L.wanted("bush-a"):
        bush_a()
    if L.wanted("bush-b"):
        bush_b()
