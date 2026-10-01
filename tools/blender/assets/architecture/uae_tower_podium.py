"""uae-tower-podium: commercial tower podium (base floors) for Dubai Downtown.

Dark tinted glass curtain-wall block on a stone base band, with thin
projecting horizontal bands every 1.0 unit, slim corner pilasters running the
full height and a wide flat-topped entrance on the front wall (two stone piers
+ lintel) where the base band is interrupted.
"""

import olw
from _arch import L, P

KEY = "uae-tower-podium"
W, D, H = 3.5, 3.5, 4.0
HX, HY = W / 2, D / 2

GLASS = "#1a2535"
STONE = "#e8ddc8"
PILASTER = "#d4cec0"
BASE_H = 0.6
BAND_H, BAND_OUT = 0.08, 0.05
ENT_W, ENT_H = 1.4, 1.4  # entrance clear opening
PIER_W, PIER_D = 0.22, 0.2


def build():
    olw.reset()
    b = olw.Builder(KEY, seed=31)

    # ---- glass curtain-wall volume + roof plate
    b.box((W, D, H), (0, 0, 0), "olw_glass", GLASS, edges=False)
    b.box((W, D, 0.04), (0, 0, H), "olw_stone", PILASTER)

    # ---- stone base band (front split around the entrance)
    t = 0.06  # band thickness proud of the glass
    b.box((W + 2 * t, t, BASE_H), (0, HY + t / 2, 0), "olw_stone", STONE)  # back
    for sx in (-1, 1):
        b.box((t, D, BASE_H), (sx * (HX + t / 2), 0, 0), "olw_stone", STONE)
    side_w = (W + 2 * t - ENT_W) / 2 - PIER_W
    for sx in (-1, 1):
        b.box((side_w, t, BASE_H), (sx * (HX + t - side_w / 2), -HY - t / 2, 0), "olw_stone", STONE)

    # ---- horizontal bands at every 1.0 unit (top one caps the parapet line)
    for k in range(1, 5):
        z = min(k * 1.0, H) - BAND_H
        b.box((W + 2 * BAND_OUT, D + 2 * BAND_OUT, BAND_H), (0, 0, z), "olw_stone", PILASTER)

    # ---- corner pilasters: a 0.15 x 0.05 strip on each face either side of every corner
    pw, pd = 0.15, 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((pw, pd, H), (sx * (HX - pw / 2), sy * (HY + pd / 2), 0), "olw_stone", PILASTER)
            b.box((pd, pw, H), (sx * (HX + pd / 2), sy * (HY - pw / 2), 0), "olw_stone", PILASTER)

    # ---- entrance: two stone piers + flat lintel, dark doors and a canopy step
    front = L(b, 0, -HY, 0, 0)
    for sx in (-1, 1):
        front.box((PIER_W, PIER_D, ENT_H), (sx * (ENT_W / 2 + PIER_W / 2), -PIER_D / 2, 0), "olw_stone", STONE)
    front.box((ENT_W + 2 * PIER_W, PIER_D + 0.04, 0.22), (0, -(PIER_D + 0.04) / 2, ENT_H), "olw_stone", STONE)
    # door frame mullions + transom (metal) against the glass
    for x in (-ENT_W / 2 + 0.03, 0.0, ENT_W / 2 - 0.03):
        front.box((0.05, 0.03, ENT_H), (x, -0.015, 0), "olw_metal", P["iron"])
    front.box((ENT_W, 0.03, 0.05), (0, -0.015, ENT_H - 0.3), "olw_metal", P["iron"])
    front.box((ENT_W + 2 * PIER_W + 0.2, 0.5, 0.05), (0, -0.25, 0), "olw_stone", "#cfc6b4")  # entrance step

    return b.finish(ao_height=0.4, ao_min=0.8)


if __name__ == "__main__":
    obj = build()
    rep = olw.validate(obj, max_tris=2500, size=(W, D, H), size_tol=0.25)
    olw.export_glb(obj, KEY, report=rep, extra={"footprint": [4, 4], "door": {"x": 0.0, "z": -HY}})
