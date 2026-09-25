"""flower-cluster-a / -b / -c: stylized flower clumps (<=400 tris each, heavily
instanced): a rosette of small leaves at the base, thin stems and petal-cup
heads at varied heights. a = pinks + cream, b = yellow + cream,
c = lavender + purple. Writes public/assets/models/flower-cluster-{a,b,c}.glb."""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402
from mathutils import Vector  # noqa: E402

H = L.hex3
MIXES = {
    "flower-cluster-a": dict(petals=[H("#d49a9a"), H("#e7b3ad"), H("#f1e6cf"), H("#c9858a")], tips=[H("#f0c9c2"), H("#f6d8d0"), H("#fbf5e8"), H("#e6a9aa")], eye=H("#e8cf7a"), seed=3, n=5),
    "flower-cluster-b": dict(petals=[H("#e8cf7a"), H("#f1e6cf"), H("#e3bf5c"), H("#f0dc96")], tips=[H("#f6e6a6"), H("#fffaf0"), H("#f2d88a"), H("#fbeebf")], eye=H("#c98f3e"), seed=5, n=5),
    "flower-cluster-c": dict(petals=[H("#b7a3d0"), H("#8c6f9e"), H("#cbbde0"), H("#9c7aa6")], tips=[H("#d9ccea"), H("#b39ac4"), H("#e6ddf2"), H("#c4a7cc")], eye=H("#f1e6cf"), seed=9, n=5),
}
STEM = H("#5f7d45")
STEM_TOP = H("#7f9a58")
LEAF = H("#55703f")
LEAF_TIP = H("#8fa66a")


def build_all():
    for key in MIXES:
        if not L.wanted(key):
            continue
        mix = MIXES[key]
        L.reset(mix["seed"])
        rng = random.Random(mix["seed"])
        # leaves (foliage slot)
        bm = L.bmesh.new()
        cols = {}
        nl = 8
        for i in range(nl):
            a = i * 2 * math.pi / nl + rng.uniform(-0.35, 0.35)
            T.leaf(bm, cols, (math.cos(a) * 0.012, math.sin(a) * 0.012, 0.003), a, rng.uniform(0.1, 0.15), rng.uniform(0.05, 0.065), rng.uniform(0.03, 0.05), LEAF, LEAF_TIP, droop=0.35)
        leaves = T.bm_to_obj("leaves", bm, cols, "olw_foliage")
        # heads (flower slot)
        bm = L.bmesh.new()
        cols = {}
        # (radial offset, height, head radius, bud?) -- imperfect spacing, varied heights
        heads = [(0.0, 0.27, 0.078, 0), (0.09, 0.24, 0.066, 0), (0.1, 0.18, 0.058, 0), (0.075, 0.27, 0.062, 0), (0.115, 0.135, 0.05, 0), (0.06, 0.21, 0.07, 0), (0.125, 0.105, 0.046, 0), (0.05, 0.285, 0.03, 1), (0.1, 0.215, 0.028, 1)]
        stems = []
        for i, (rr, h, R, bud) in enumerate(heads):
            a = i * 2.39996 + rng.uniform(-0.4, 0.4)
            top = Vector((math.cos(a) * rr + rng.uniform(-0.01, 0.01), math.sin(a) * rr, h * rng.uniform(0.92, 1.05)))
            base = Vector((math.cos(a) * 0.008, math.sin(a) * 0.008, 0.0))
            mid = base.lerp(top, 0.5) + Vector((math.cos(a) * 0.012, math.sin(a) * 0.012, 0))
            stems.append((base, mid, top))
            nrm = Vector((math.cos(a) * rr * 2.5, math.sin(a) * rr * 2.5, 1.0)).normalized()
            pi = i % len(mix["petals"])
            cup = 0.2 + 0.5 * ((i * 7) % 3) / 2
            if bud:  # closed bud: a tall narrow cup, darker, no eye
                T.flower_head(bm, cols, top + nrm * 0.003, nrm, R, petals=4, cup=1.4, spin=rng.uniform(0, 1.3), petal_col=L.mul(mix["petals"][pi], 0.85), tip_col=mix["petals"][pi], eye_col=mix["eye"], eye=False)
            else:
                T.flower_head(bm, cols, top + nrm * 0.003, nrm, R * 1.08, petals=mix["n"], cup=cup, spin=rng.uniform(0, 1.3), petal_col=mix["petals"][pi], tip_col=mix["tips"][pi], eye_col=mix["eye"])
        flowers = T.bm_to_obj("flowers", bm, cols, "olw_flower")
        # stems (foliage slot): 3-sided, 2 segments
        stem_obs = []
        for i, (b0, m, t) in enumerate(stems):
            s = L.tube(f"stem{i}", [b0, m, t], [0.0065, 0.0055, 0.0045], sides=3, cap=False, slot="olw_foliage")
            L.cut_below(s, 0.0, fill=False)
            L.paint(s, lambda co, n, p: L.mix(STEM, STEM_TOP, co.z / 0.3))
            stem_obs.append(s)
        ob = L.join([leaves, flowers] + stem_obs, key)
        L.finish(ob, key)


if __name__ == "__main__":
    build_all()
