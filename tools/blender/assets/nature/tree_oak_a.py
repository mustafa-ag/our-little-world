"""tree-oak-a: broad storybook oak, ~4.3 u tall. Writes public/assets/models/tree-oak-a.glb."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _e2lib as L  # noqa: E402
import _e2trees as T  # noqa: E402

KEY = "tree-oak-a"


def build():
    L.reset(11)
    # trunk + major branches (Skin modifier), front = +Y (Blender) -> -Z glTF
    spec = [
        [(0, 0, -0.15, 0.34), (0.0, 0.0, 0.35, 0.28), (0.06, 0.02, 1.05, 0.23), (0.1, 0.0, 1.4, 0.21)],
        # left limb
        [(0.1, 0.0, 1.4, 0), (-0.35, 0.12, 2.05, 0.13), (-0.85, 0.25, 2.45, 0.09), (-1.25, 0.3, 2.75, 0.06)],
        # right limb
        [(0.1, 0.0, 1.4, 0), (0.55, -0.1, 2.1, 0.13), (1.0, -0.25, 2.55, 0.09), (1.3, -0.3, 2.95, 0.055)],
        # leader
        [(0.1, 0.0, 1.4, 0), (0.12, -0.05, 2.3, 0.14), (0.05, -0.1, 2.95, 0.1), (0.0, -0.1, 3.4, 0.06)],
        # back / front limbs
        [(0.12, -0.05, 2.3, 0), (0.1, 0.6, 2.75, 0.08), (0.15, 0.95, 3.05, 0.05)],
        [(0.12, -0.05, 2.3, 0), (-0.25, -0.55, 2.7, 0.08), (-0.45, -0.85, 3.0, 0.05)],
    ] + T.roots(base_z=0.18, n=5, reach=0.5, r0=0.11, seed=3)
    trunk = T.wood("trunk", spec, subdiv=1, target=520, seed=1)

    masses = [
        # x, y, z, r, squash  (lower side masses + a raised middle leave a notch where the limbs show)
        (-1.15, 0.25, 2.85, 0.9, 0.82),
        (1.2, -0.25, 3.0, 0.88, 0.82),
        (0.05, -0.05, 3.55, 1.0, 0.85),
        (0.2, 0.9, 3.25, 0.72, 0.82),
        (-0.4, -0.85, 3.25, 0.72, 0.82),
        (-0.6, 0.35, 3.65, 0.6, 0.85),
    ]
    crown = T.canopy("crown", masses, clumps_per=16, clump_scale=(0.38, 0.52), voxel=0.065, disp=0.04, disp_size=0.3, target=1850, seed=5, bottom_cut=0.3)
    T.paint_canopy(crown, extra_bvh=(), seed=2)
    ob = L.join([trunk, crown], KEY)
    return L.finish(ob, KEY)


if __name__ == "__main__" and L.wanted(KEY):
    build()
