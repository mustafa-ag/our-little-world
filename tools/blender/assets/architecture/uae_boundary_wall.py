"""uae-wall: UAE compound boundary wall — tileable stucco section.

Cream stucco wall 1.2 wide x 0.15 thick x 0.9 tall with a projecting concrete
coping cap on top and vertical pilasters at x=0 (centre) and x=+0.4
(1.0 unit from the left edge at x=-0.6).
"""

import olw

KEY = "uae-wall"
W, D, H = 1.2, 0.15, 0.9
CREAM = "#f0e8d5"
CAP_COL = "#e8dcc8"


def build():
    olw.reset()
    b = olw.Builder(KEY, seed=41)

    # Main wall body
    b.box((W, D, H), (0, 0, 0), "olw_stone", CREAM, bevel=0.005)

    # Decorative coping cap (projects 0.07 each side => D + 0.14)
    b.box((W, D + 0.14, 0.07), (0, 0, H), "olw_stone", CAP_COL, bevel=0.008)

    # Vertical pilasters: at x=0 (centre) and x=+0.4 (1.0 unit from left edge -0.6)
    PIL_W, PIL_D, PIL_H = 0.12, D + 0.10, H
    for px in (0.0, 0.4):
        b.box((PIL_W, PIL_D, PIL_H), (px, 0, 0), "olw_stone", CREAM, bevel=0.006)
        # pilaster cap line up with main coping
        b.box((PIL_W + 0.02, PIL_D + 0.04, 0.07), (px, 0, H), "olw_stone", CAP_COL, bevel=0.007)

    return b.finish(ao_height=0.3, ao_min=0.78)


if __name__ == "__main__":
    obj = build()
    rep = olw.validate(obj, max_tris=400, size=(W, 0, H), size_tol=0.30)
    olw.export_glb(obj, KEY, report=rep, extra={"footprint": [1, 1]})
