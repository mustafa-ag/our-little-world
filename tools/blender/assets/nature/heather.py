"""heather: a low (~0.2 u) purple-pink cushion bristling with tiny flower spikes.
Writes public/assets/models/heather.glb."""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402
from mathutils import Vector  # noqa: E402

KEY = "heather"
H = L.hex3


def build():
    L.reset(61)
    rng = random.Random(4)
    # cushion: a squashed, slightly lumpy low dome
    parts = [L.ico("m0", (0, 0, 0.0), 0.2, (1.0, 0.85, 0.42), 2), L.ico("m1", (0.09, 0.05, 0.0), 0.13, (1, 1, 0.55), 2), L.ico("m2", (-0.1, -0.03, 0.0), 0.12, (1, 1, 0.5), 2)]
    mound = L.voxel_blob(parts, "mound", voxel=0.025, disp=0.0, target_tris=130, smooth_iters=2)
    L.cut_below(mound, 0.0)
    L.set_slot(mound, "olw_foliage")
    # a green-grey woody base blushing into purple on top, so gaps between spikes read as heather
    L.paint(mound, lambda co, n, p: L.ramp([(0.0, H("#4a5a3b")), (0.35, H("#66704f")), (0.7, H("#7d6784")), (1.0, H("#8e6f98"))], co.z / 0.11))

    # spikes sprout from the dome surface
    bvh = L.bvh_of(mound)
    bm = L.bmesh.new()
    cols = {}
    base_c, mid_c, tip_c = H("#6e4f75"), H("#9c7aa6"), H("#d4acc9")
    n = 42
    for k in range(n):
        u = (k + 0.5) / n
        r = 0.19 * math.sqrt(u)
        a = k * 2.39996 + rng.uniform(-0.2, 0.2)
        x, y = math.cos(a) * r, math.sin(a) * r * 0.8
        hit = bvh.ray_cast(Vector((x, y, 0.5)), Vector((0, 0, -1)))
        if hit[0] is None:
            continue
        p0 = hit[0] - Vector((0, 0, 0.012))
        p0.z = max(0.016, p0.z)
        out = Vector((x, y, 0)) * 1.6 + Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 1.0))
        out.normalize()
        h = rng.uniform(0.055, 0.09) * (1.15 - r * 1.5)
        rad = 0.016
        t_, b_, n_ = T._frame(out)
        ring = [bm.verts.new(p0 + (t_ * math.cos(i * 2.0944) + b_ * math.sin(i * 2.0944)) * rad) for i in range(3)]
        midp = p0 + out * h * 0.6
        mids = [bm.verts.new(midp + (t_ * math.cos(i * 2.0944 + 1.0) + b_ * math.sin(i * 2.0944 + 1.0)) * rad * 1.6) for i in range(3)]
        tip = bm.verts.new(p0 + out * h)
        pink = rng.random() < 0.3
        mc = L.mix(mid_c, H("#b98bb0"), 0.8) if pink else mid_c
        for i in range(3):
            j = (i + 1) % 3
            f = bm.faces.new((ring[i], ring[j], mids[j], mids[i]))
            cols[f] = {ring[i]: base_c, ring[j]: base_c, mids[j]: mc, mids[i]: mc}
            f = bm.faces.new((mids[i], mids[j], tip))
            cols[f] = {mids[i]: mc, mids[j]: mc, tip: tip_c}
    spikes = T.bm_to_obj("spikes", bm, cols, "olw_flower")
    ob = L.join([mound, spikes], KEY)
    return L.finish(ob, KEY)


if __name__ == "__main__" and L.wanted(KEY):
    build()
