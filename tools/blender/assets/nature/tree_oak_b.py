"""tree-oak-b: leaning, low-forked storybook oak with a lopsided crown, ~3.9 u tall.
Writes public/assets/models/tree-oak-b.glb."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402

KEY = "tree-oak-b"

# a touch more olive than oak-a so neighbours read as different trees
STOPS = [
    (0.0, L.hex3("#3f5330")),
    (0.25, L.hex3("#566f3e")),
    (0.5, L.hex3("#6b8a4e")),
    (0.72, L.hex3("#8e9f62")),
    (0.95, L.hex3("#b9c487")),
]


def build():
    L.reset(21)
    spec = [
        [(0, 0, -0.15, 0.32), (0.02, 0.0, 0.3, 0.26), (0.12, -0.04, 0.85, 0.21), (0.2, -0.05, 1.15, 0.2)],
        # two big limbs forking low (V), one heavier, leaning +x
        [(0.2, -0.05, 1.15, 0), (-0.2, 0.1, 1.7, 0.15), (-0.55, 0.2, 2.25, 0.11), (-0.85, 0.3, 2.7, 0.07)],
        [(0.2, -0.05, 1.15, 0), (0.55, -0.1, 1.75, 0.17), (0.95, -0.1, 2.3, 0.12), (1.35, -0.15, 2.6, 0.07)],
        # sub-branches
        [(0.55, -0.1, 1.75, 0), (0.6, 0.45, 2.35, 0.08), (0.65, 0.8, 2.7, 0.05)],
        [(0.95, -0.1, 2.3, 0), (0.85, -0.55, 2.85, 0.07), (0.8, -0.8, 3.1, 0.045)],
        [(-0.55, 0.2, 2.25, 0), (-0.35, -0.3, 2.75, 0.07), (-0.2, -0.55, 3.0, 0.045)],
        [(0.95, -0.1, 2.3, 0), (0.7, 0.05, 3.0, 0.07), (0.6, 0.05, 3.3, 0.045)],
    ] + T.roots(base_z=0.18, n=4, reach=0.48, r0=0.11, seed=7, rot=0.9)
    trunk = T.wood("trunk", spec, subdiv=1, target=520, seed=4)

    masses = [
        (-0.95, 0.3, 2.75, 0.72, 0.8),
        (1.45, -0.15, 2.75, 0.8, 0.8),
        (0.55, -0.1, 3.15, 1.0, 0.82),
        (0.7, 0.85, 2.85, 0.7, 0.8),
        (0.6, -0.95, 3.0, 0.66, 0.8),
        (-0.35, -0.3, 3.1, 0.72, 0.82),
        (0.2, 0.3, 3.45, 0.62, 0.85),
    ]
    crown = T.canopy("crown", masses, clumps_per=15, clump_scale=(0.38, 0.52), voxel=0.065, disp=0.04, disp_size=0.3, target=1800, seed=9, bottom_cut=0.3)
    T.paint_canopy(crown, seed=6, stops=STOPS)
    ob = L.join([trunk, crown], KEY)
    return L.finish(ob, KEY)


if __name__ == "__main__" and L.wanted(KEY):
    build()
