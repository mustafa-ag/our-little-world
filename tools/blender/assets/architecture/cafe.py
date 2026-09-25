"""cafe-hero: two-storey café / shop (footprint ~5 x 3 tiles).

Cream stone building with a slate roof and two gable chimneys. The ground floor
is a painted timber shopfront: pilasters, a deep fascia with a cream lettering
panel, a big mullioned shop window with a warm interior glow (emissive slot),
stall-riser panels, a glazed door with a transom light, a red/cream striped
scalloped awning on iron arms, a hanging bracket sign with a coffee-cup icon,
planters either side and ivy on the left corner.
Door: front wall at x = +1.30, wall face z = -1.40.
"""

import math
import random

import olw
from _arch import L, P, PANE_WARM, chimney, flower_box_under, gable_roof, ivy, quoins, window

KEY = "cafe-hero"
W, D = 4.8, 2.8
HX, HY = W / 2, D / 2
EAVE = 3.3
PITCH = 40
SHOP = "#4e6b58"  # deep sage shopfront
SHOP_LT = "#6f8c76"
CREAM = P["cream"]
SLATES = [P["slate"], "#5e6874", "#6d7784", "#737b86", "#606a75"]
DOOR_X = 1.3
WIN_X0, WIN_X1 = -1.95, 0.62
RED, AWN_CREAM = P["awning_red"], "#f2e6cf"


def planter(b, x, y, rng, w=0.6):
    b.box((w, 0.34, 0.36), (x, y, 0), "olw_wood", "wood", bevel=0.015)
    b.box((w + 0.04, 0.38, 0.04), (x, y, 0.36), "olw_wood_dark", P["wood_dark"], bevel=0.01)
    b.box((w - 0.06, 0.28, 0.02), (x, y, 0.38), "olw_stone_dark", P["soil"])
    for i in range(3):
        b.blob(0.14, (x - w / 3 + i * w / 3, y + rng.uniform(-0.05, 0.05), 0.47), "olw_foliage", rng.choice(["#5f8446", "#6f9450", "#56793f"]),
               scale=(1.1, 1.0, 1.0), subdiv=1, jitter=0.3)
    for _ in range(6):
        b.sphere(0.035, (x + rng.uniform(-w / 2 + 0.06, w / 2 - 0.06), y + rng.uniform(-0.12, 0.12), 0.55 + rng.random() * 0.08), "olw_flower",
                 rng.choice([P["rose"], "#f4ead8", "#e8c85a", "#e98f8f"]), subdiv=1)


def build():
    rng = random.Random(5)
    b = olw.Builder(KEY, seed=13)
    ridge = EAVE + HY * math.tan(math.radians(PITCH))
    plinth = b.box((W + 0.08, D + 0.08, 0.14), (0, 0, 0), "olw_stone", olw.mix("sandstone", "grey_stone", 0.4))
    body = b.prism([(-HY, 0), (HY, 0), (HY, EAVE), (0, ridge), (-HY, EAVE)], W, (0, 0, 0), "olw_stone", "cream", axis="X", vary=0.02)
    front = L(b, 0, -HY, 0, 0)
    back = L(b, 0, HY, 0, 180)
    left = L(b, -HX, 0, 0, -90)
    right = L(b, HX, 0, 0, 90)
    cuts = []
    # ---- shop window opening (recess 0.12) + door opening
    ww = WIN_X1 - WIN_X0
    wz0, wz1 = 0.5, 1.62
    front.box((ww, 0.72, wz1 - wz0), ((WIN_X0 + WIN_X1) / 2, -0.24, wz0), "olw_stone", "cream")
    cuts.append(b.pop())
    dw, dh = 0.68, 1.5
    front.box((dw, 0.76, dh), (DOOR_X, -0.22, 0.1), "olw_stone", "cream")
    dcut = b.pop()
    cuts.append(dcut)
    d2 = dcut.copy()
    # upper floor + sides + back
    for x in (-1.25, 0.15, 1.5):
        cuts.append(window(front, x, 2.05, flower_box=(x != 0.15), rng=rng))
    cuts.append(window(back, -1.2, 0.55, rng=rng))
    cuts.append(window(back, 1.2, 0.55, rng=rng))
    cuts.append(window(back, 0.0, 2.05, rng=rng))
    cuts.append(window(left, 0.0, 2.05, rng=rng))
    cuts.append(window(right, 0.3, 0.55, rng=rng))
    cuts.append(window(right, 0.0, 2.05, rng=rng))
    b.cut(body, cuts)
    b.cut(plinth, [d2])

    # ---- shop window: warm glowing glass, mullions + transom, stall riser, sill board
    front.box((ww, 0.03, wz1 - wz0), ((WIN_X0 + WIN_X1) / 2, 0.11, wz0), "olw_glass_emissive", PANE_WARM, ao=False, edges=False, vary=0.05)
    # a few silhouettes inside (cake stand, cups) just behind the frame - reads as a lit interior
    for k, x in enumerate((-1.6, -0.9, 0.2)):
        front.cyl(0.07, 0.03, (x, 0.07, wz0 + 0.02), "olw_paint", "#f4efe6", verts=8)
        front.cyl(0.05, 0.12 + 0.05 * k, (x, 0.07, wz0 + 0.05), "olw_paint", ["#d49a9a", "#e8c85a", "#f4ead8"][k], verts=8)
    for i in range(4):
        u = WIN_X0 + 0.03 + (ww - 0.06) * i / 3
        front.box((0.06, 0.07, wz1 - wz0), (u, 0.06, wz0), "olw_paint", SHOP, bevel=0.01)
    front.box((ww, 0.07, 0.05), ((WIN_X0 + WIN_X1) / 2, 0.055, wz0 + 0.8), "olw_paint", SHOP)
    front.box((ww, 0.07, 0.06), ((WIN_X0 + WIN_X1) / 2, 0.06, wz1 - 0.06), "olw_paint", SHOP)
    front.box((ww + 0.1, 0.16, 0.05), ((WIN_X0 + WIN_X1) / 2, -0.03, wz0 - 0.05), "olw_paint", SHOP_LT, bevel=0.012)
    # stall riser with two sunk panels
    front.box((ww + 0.04, 0.08, wz0 - 0.1), ((WIN_X0 + WIN_X1) / 2, -0.02, 0.1), "olw_paint", SHOP, bevel=0.01)
    for k in range(3):
        pw = (ww - 0.2) / 3
        px = WIN_X0 + 0.1 + pw * (k + 0.5)
        front.box((pw - 0.08, 0.02, wz0 - 0.24), (px, -0.065, 0.17), "olw_paint", SHOP_LT)

    # ---- glazed door + transom light
    front.box((dw - 0.04, 0.05, dh - 0.3), (DOOR_X, 0.17, 0.1), "olw_paint", SHOP, vary=0.02)
    front.box((dw - 0.2, 0.02, 0.62), (DOOR_X, 0.14, 0.62), "olw_glass_emissive", PANE_WARM, ao=False, edges=False)
    front.box((dw - 0.24, 0.02, 0.26), (DOOR_X, 0.14, 0.2), "olw_paint", SHOP_LT)
    front.box((dw - 0.04, 0.05, 0.22), (DOOR_X, 0.17, 0.1 + dh - 0.26), "olw_glass_emissive", PANE_WARM, ao=False, edges=False)
    front.box((dw - 0.04, 0.06, 0.04), (DOOR_X, 0.15, 0.1 + dh - 0.3), "olw_paint", SHOP)
    front.box((0.03, 0.03, 0.12), (DOOR_X + dw / 2 - 0.1, 0.12, 0.72), "olw_metal", P["gold"])
    front.box((dw + 0.1, 0.35, 0.1), (DOOR_X, -0.15, 0), "olw_stone", "#bdb09a", bevel=0.02)  # step

    # ---- shopfront frame: pilasters with capitals, fascia + lettering panel + cornice
    for x in (WIN_X0 - 0.14, (WIN_X1 + DOOR_X - dw / 2) / 2, DOOR_X + dw / 2 + 0.12):
        front.box((0.18, 0.1, 1.7), (x, -0.05, 0.0), "olw_paint", SHOP, bevel=0.015)
        front.box((0.24, 0.14, 0.08), (x, -0.06, 1.66), "olw_paint", SHOP_LT, bevel=0.012)
    fx0, fx1 = WIN_X0 - 0.26, DOOR_X + dw / 2 + 0.24
    front.box((fx1 - fx0, 0.14, 0.34), ((fx0 + fx1) / 2, -0.07, 1.72), "olw_paint", SHOP, bevel=0.015)
    front.box((fx1 - fx0 + 0.1, 0.22, 0.06), ((fx0 + fx1) / 2, -0.09, 2.06), "olw_paint", SHOP_LT, bevel=0.015)
    front.box((1.9, 0.02, 0.2), ((fx0 + fx1) / 2 - 0.2, -0.15, 1.79), "olw_paint", CREAM, edges=False)
    # painted "lettering": a row of simple dark strokes (reads as a name at game distance)
    lx = (fx0 + fx1) / 2 - 1.0
    for i, (w_, h_) in enumerate([(0.08, 0.12), (0.06, 0.1), (0.07, 0.12), (0.05, 0.08), (0.07, 0.12), (0.09, 0.1), (0.06, 0.12), (0.08, 0.1), (0.06, 0.12)]):
        lx += 0.19
        front.box((w_, 0.012, h_), (lx, -0.165, 1.83 + (0.12 - h_) / 2), "olw_paint", "#3d3a36", edges=False, ao=False)

    # ---- striped, scalloped awning over the shop window on iron arms
    ax0, ax1 = WIN_X0 - 0.08, WIN_X1 + 0.08
    depth, drop = 0.85, 0.42
    top_z = 1.7
    slope = math.degrees(math.atan2(drop, depth))
    ln = math.hypot(depth, drop)
    n = 9
    sw = (ax1 - ax0) / n
    for i in range(n):
        x = ax0 + sw * (i + 0.5)
        c = RED if i % 2 == 0 else AWN_CREAM
        front.box((sw + 0.002, ln, 0.03), (x, -depth / 2, top_z - drop / 2 - 0.015), "olw_awning", c, rot=(slope, 0, 0), vary=0.03, edges=False)
        # scallop under the front edge
        r = sw / 2
        poly = [(x - r, 0)] + [(x + r * math.cos(math.pi * (1 - k / 6)), -r * 0.8 * math.sin(math.pi * k / 6)) for k in range(1, 6)] + [(x + r, 0)]
        front.prism(poly, 0.02, (0, -depth - 0.005, top_z - drop - 0.005), "olw_awning", c, axis="Y", vary=0.03, edges=False)
    # valance band + roller box at the wall
    front.box((ax1 - ax0, 0.12, 0.1), ((ax0 + ax1) / 2, -0.06, top_z - 0.02), "olw_paint", SHOP_LT, bevel=0.015)
    for x in (ax0 + 0.05, ax1 - 0.05):
        front.tube([(x, 0.0, top_z - 0.55), (x, -depth * 0.55, top_z - drop - 0.08), (x, -depth + 0.02, top_z - drop)], 0.015, "olw_metal", P["iron"], verts=5)
    # side cheeks
    for x in (ax0, ax1):
        front.prism([(0.0, top_z), (-depth, top_z - drop), (0.0, top_z - drop)], 0.02, (x, 0, 0), "olw_awning", RED, axis="X")

    # ---- hanging bracket sign with a coffee cup (perpendicular to the wall, upper left)
    sx = -1.93
    sz = 2.2
    front.box((0.08, 0.04, 0.5), (sx, -0.02, sz - 0.1), "olw_metal", P["iron"])  # wall plate
    front.tube([(sx, -0.02, sz + 0.3), (sx, -0.75, sz + 0.3)], 0.018, "olw_metal", P["iron"], verts=5)
    front.tube([(sx, -0.02, sz - 0.05), (sx, -0.2, sz + 0.08), (sx, -0.42, sz + 0.24), (sx, -0.55, sz + 0.3)], 0.013, "olw_metal", P["iron"], verts=4)
    front.sphere(0.03, (sx, -0.77, sz + 0.3), "olw_metal", P["iron"], subdiv=1)
    for yy in (-0.25, -0.65):  # chains
        front.box((0.015, 0.015, 0.1), (sx, yy, sz + 0.2), "olw_metal", P["iron"])
    front.box((0.05, 0.5, 0.42), (sx, -0.45, sz - 0.22), "olw_paint", "#3f5a48", bevel=0.015)
    front.box((0.06, 0.44, 0.36), (sx, -0.45, sz - 0.19), "olw_paint", SHOP_LT)
    for s in (-1, 1):  # cup icon on both faces: saucer, cup, handle, steam
        xo = sx + s * 0.035
        front.box((0.012, 0.22, 0.025), (xo, -0.45, sz - 0.11), "olw_paint", CREAM, edges=False)
        front.box((0.012, 0.14, 0.12), (xo, -0.46, sz - 0.085), "olw_paint", CREAM, edges=False)
        front.tube([(xo, -0.39, sz - 0.07), (xo, -0.35, sz - 0.05), (xo, -0.35, sz - 0.01), (xo, -0.39, sz + 0.01)], 0.012, "olw_paint", CREAM, verts=4)
        for k in range(2):
            y0 = -0.49 + k * 0.06
            front.tube([(xo, y0, sz + 0.06), (xo, y0 + 0.02, sz + 0.09), (xo, y0 - 0.01, sz + 0.12)], 0.009, "olw_paint", CREAM, verts=3)

    # ---- quoins, roof, chimneys
    for sxq in (-1, 1):
        quoins(b, sxq * HX, -HY, sxq, -1, 2.1, EAVE, rng)
    zr = gable_roof(b, -HX, HX, HY, EAVE, PITCH, "olw_slate", SLATES, rng, overhang=0.22, courses=8, verge=0.14, fascia="#f1ece0",
                    ridge_color="#4d545c", lift=5, thick=0.05, runs=3)
    chimney(b, -HX + 0.26, 0, EAVE + 0.4, zr + 0.6, w=0.5, d=0.7, pots=2, rng=rng)
    chimney(b, HX - 0.26, 0, EAVE + 0.4, zr + 0.6, w=0.5, d=0.7, pots=3, rng=rng)

    # ---- planters + ivy
    planter(b, WIN_X0 + 0.25, -HY - 0.3, rng)
    planter(b, DOOR_X + dw / 2 + 0.45, -HY - 0.28, rng, w=0.42)
    ivy(b, rng, -HX - 0.02, -HY - 0.02, -1, -1, 2.9, reach_a=0.25, reach_b=1.0, stems=3, density=9)
    return b.finish(ao_height=0.45, ao_min=0.72, ground_snap=0.2)


if __name__ == "__main__" and olw.wanted(KEY):
    olw.build_and_export(KEY, build, max_tris=8000, size=(5.1, 3.6, 5.5), size_tol=0.3,
                         extra={"footprint": [5, 3], "door": {"x": DOOR_X, "z": -HY}})
