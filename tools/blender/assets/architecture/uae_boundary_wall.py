"""uae-wall: UAE boundary wall section (tileable along X).

Cream stucco wall body with a slightly wider, lighter coping cap and two
decorative pilasters projecting from the front face at x = +-0.55.
"""

import olw
from _arch import L, P

KEY = "uae-wall"
W, D, H = 1.5, 0.15, 0.9

STUCCO = "#f5eed8"
CAP = "#f8f4ed"
CAP_D, CAP_H = 0.20, 0.08
PIL_W, PIL_D, PIL_H = 0.2, 0.05, 0.98
PIL_X = 0.55


def build():
    olw.reset()
    b = olw.Builder(KEY, seed=41)
    b.box((W, D, H), (0, 0, 0), "olw_stone", STUCCO)
    b.box((W, CAP_D, CAP_H), (0, 0, H), "olw_stone", CAP)
    front = L(b, 0, -D / 2, 0, 0)
    for x in (-PIL_X, PIL_X):
        front.box((PIL_W, PIL_D, PIL_H), (x, -PIL_D / 2, 0), "olw_stone", STUCCO)
    return b.finish(ao_height=0.25, ao_min=0.8)


if __name__ == "__main__":
    obj = build()
    rep = olw.validate(obj, max_tris=400, size=(W, CAP_D, H + CAP_H), size_tol=0.25)
    olw.export_glb(obj, KEY, report=rep, extra={"footprint": [2, 1]})
