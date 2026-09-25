"""tree-pine: Scots pine, ~4.6 u: tall bare reddish trunk, flat-topped layered
cloud-like crown pads. Writes public/assets/models/tree-pine.glb."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402

KEY = "tree-pine"

STOPS = [
    (0.0, L.hex3("#34482f")),
    (0.28, L.hex3("#465f3d")),
    (0.52, L.hex3("#5b7a4b")),
    (0.76, L.hex3("#7a9562")),
    (0.98, L.hex3("#a2b684")),
]


def build():
    L.reset(41)
    # gently S-curved trunk; the upper trunk and limbs are the Scots-pine orange
    spec = [
        [(0, 0, -0.12, 0.2), (0.02, 0.0, 0.3, 0.15), (0.12, 0.02, 1.2, 0.125), (0.08, 0.0, 2.1, 0.11), (-0.05, 0.02, 2.9, 0.095), (0.0, 0.0, 3.6, 0.075), (0.08, -0.02, 4.1, 0.05)],
        [(0.08, 0.0, 2.1, 0), (0.5, -0.05, 2.45, 0.055), (0.95, -0.1, 2.75, 0.04)],
        [(-0.05, 0.02, 2.9, 0), (-0.55, 0.15, 3.1, 0.05), (-0.95, 0.2, 3.35, 0.035)],
        [(-0.05, 0.02, 2.9, 0), (0.2, 0.55, 3.25, 0.045), (0.35, 0.8, 3.45, 0.03)],
        [(0.0, 0.0, 3.6, 0), (0.45, -0.4, 3.75, 0.04), (0.6, -0.6, 3.9, 0.03)],
        # a dead stub low down (Scots pines self-prune)
        [(0.12, 0.02, 1.2, 0), (-0.2, 0.05, 1.42, 0.03)],
    ] + T.roots(base_z=0.12, n=4, reach=0.3, r0=0.07, seed=5)
    trunk = T.wood("trunk", spec, subdiv=1, target=520, seed=5, top=L.hex3("#b86f45"), base=L.hex3("#5a3b2a"))

    # flat cloud pads (x, y, z, r, squash)
    masses = [
        (1.0, -0.1, 2.8, 0.62, 0.42),
        (0.6, -0.2, 2.9, 0.5, 0.4),
        (-1.0, 0.2, 3.38, 0.6, 0.42),
        (-0.55, 0.12, 3.4, 0.45, 0.4),
        (0.35, 0.8, 3.5, 0.52, 0.42),
        (0.6, -0.62, 3.95, 0.55, 0.42),
        (0.05, 0.0, 4.25, 0.58, 0.45),
        (-0.3, 0.3, 4.1, 0.42, 0.42),
    ]
    crown = T.canopy("crown", masses, clumps_per=11, clump_scale=(0.3, 0.42), voxel=0.05, disp=0.03, disp_size=0.2, target=1450, seed=17, bottom_cut=0.15, clump_sq=0.6, clump_push=0.9)
    T.paint_canopy(crown, seed=12, stops=STOPS)
    ob = L.join([trunk, crown], KEY)
    return L.finish(ob, KEY)


if __name__ == "__main__" and L.wanted(KEY):
    build()
