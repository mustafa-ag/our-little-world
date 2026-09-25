"""tree-small: young garden tree (~2.4 u) on a slim trunk with a stake and tie.
Writes public/assets/models/tree-small.glb."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402

KEY = "tree-small"

STOPS = [
    (0.0, L.hex3("#4a6436")),
    (0.3, L.hex3("#61804a")),
    (0.55, L.hex3("#7a9a58")),
    (0.78, L.hex3("#9db274")),
    (0.98, L.hex3("#c0cc92")),
]


def build():
    L.reset(31)
    spec = [
        [(0, 0, -0.1, 0.1), (0.0, 0.0, 0.3, 0.075), (0.03, 0.01, 0.95, 0.062), (0.05, 0.0, 1.25, 0.055)],
        [(0.05, 0.0, 1.25, 0), (-0.22, 0.08, 1.55, 0.04), (-0.4, 0.12, 1.75, 0.028)],
        [(0.05, 0.0, 1.25, 0), (0.3, -0.06, 1.6, 0.04), (0.45, -0.1, 1.8, 0.028)],
        [(0.05, 0.0, 1.25, 0), (0.06, 0.02, 1.7, 0.04), (0.05, 0.02, 2.0, 0.028)],
    ] + T.roots(base_z=0.08, n=3, reach=0.18, r0=0.045, seed=2)
    trunk = T.wood("trunk", spec, subdiv=1, target=320, seed=3)

    masses = [
        (-0.35, 0.1, 1.8, 0.45, 0.85),
        (0.4, -0.08, 1.85, 0.45, 0.85),
        (0.05, 0.05, 2.02, 0.5, 0.88),
        (0.0, 0.35, 1.8, 0.36, 0.85),
        (0.05, -0.35, 1.85, 0.36, 0.85),
    ]
    crown = T.canopy("crown", masses, clumps_per=12, clump_scale=(0.38, 0.52), voxel=0.042, disp=0.02, disp_size=0.2, target=1100, seed=13, bottom_cut=0.3)
    T.paint_canopy(crown, seed=8, stops=STOPS)

    # garden stake + tie band (young tree), leaning against the trunk
    stake = L.tube("stake", [(0.1, 0.09, 0.0), (0.085, 0.07, 0.9)], [0.022, 0.02], sides=5, slot="olw_bark")
    L.paint(stake, lambda co, n, p: L.mul(L.hex3("#b08a5e"), 0.85 + 0.2 * co.z))
    tie = L.tube("tie", [(0.02, 0.02, 0.78), (0.1, 0.07, 0.8)], [0.018, 0.018], sides=5, slot="olw_bark")
    L.paint_flat(tie, L.hex3("#3f3a33"))
    ob = L.join([trunk, crown, stake, tie], KEY)
    return L.finish(ob, KEY)


if __name__ == "__main__" and L.wanted(KEY):
    build()
