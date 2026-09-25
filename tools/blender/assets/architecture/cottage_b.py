"""cottage-hero-b: L-plan Scottish cottage (footprint ~5 x 3 tiles).

Grey rubble-stone main range with crow-stepped gables and a tall chimney, a
front cross-wing with its own gable, blue-grey slate roofs with lead ridges, a
timber gabled porch sheltering a dusty-rose door, sash windows with white
frames, flower boxes, climbing roses on the porch and ivy on the left corner.
Door: main front wall at x = -0.60, wall face z = -0.70; the porch opens at z = -1.42.
"""

import math
import random

import olw
from _arch import L, P, arched_door, chimney, gable_roof, ivy, quoins, scatter_stones, window

KEY = "cottage-hero-b"
EAVE = 2.1
# main range
MX0, MX1 = -2.3, 2.3
MY0, MY1 = -0.7, 1.4
MYC = (MY0 + MY1) / 2
MHD = (MY1 - MY0) / 2
MPITCH = 45
# front wing
WX0, WX1 = 0.35, 1.95
WXC = (WX0 + WX1) / 2
WHW = (WX1 - WX0) / 2
WY0 = -1.45
WPITCH = 44
DOOR_X = -0.6
STONE = "grey_stone"
SLATES = [P["slate"], "#5e6874", "#6d7784", "#737b86", "#606a75"]
DOOR = "#b0726f"  # dusty rose, deepened


def crow_gable(b, x, rng, thick=0.24):
    """Crow-stepped gable wall (profile in y/z) centred on x, covering the main range end."""
    t = math.tan(math.radians(MPITCH))
    ridge = EAVE + MHD * t
    pts_r = []
    d = MHD + 0.06
    z = EAVE + 0.12
    pts_r.append((d, 0))
    pts_r.append((d, z))
    step_w = 0.24
    while d - step_w > 0.18:
        d2 = d - step_w
        z2 = EAVE + (MHD - d2) * t + 0.2
        pts_r.append((d2, z))
        pts_r.append((d2, z2))
        d, z = d2, z2
    top = ridge + 0.25
    pts_r.append((0.18, z))
    pts_r.append((0.18, top))
    # counter-clockwise: bottom-left, right side bottom->top, then left side top->bottom
    poly = [(MYC - pts_r[0][0], 0)] + [(MYC + u, v) for (u, v) in pts_r] + [(MYC - u, v) for (u, v) in reversed(pts_r[1:])]
    b.prism(poly, thick, (x, 0, 0), "olw_stone", STONE, axis="X", vary=0.03)
    return top


def build():
    rng = random.Random(7)
    b = olw.Builder(KEY, seed=9)
    t = math.tan(math.radians(MPITCH))
    mridge = EAVE + MHD * t
    # ---- plinth + main range body + wing body
    plinth = b.box((MX1 - MX0 + 0.08, MY1 - MY0 + 0.08, 0.16), (0, MYC, 0), "olw_stone", olw.mix(STONE, "slate", 0.25))
    wplinth = b.box((WX1 - WX0 + 0.08, MY0 - WY0 + 0.04, 0.16), (WXC, (WY0 + MY0) / 2 - 0.02, 0), "olw_stone", olw.mix(STONE, "slate", 0.25))
    main = b.prism([(MY0, 0), (MY1, 0), (MY1, EAVE), (MYC, mridge), (MY0, EAVE)], MX1 - MX0 - 0.1, (0, 0, 0), "olw_stone", STONE, axis="X", vary=0.03)
    wt = math.tan(math.radians(WPITCH))
    wridge = EAVE + WHW * wt
    wing = b.prism([(WX0, 0), (WX1, 0), (WX1, EAVE), (WXC, wridge), (WX0, EAVE)], MYC - WY0, (0, (WY0 + MYC) / 2, 0), "olw_stone", STONE, axis="Y", vary=0.03)

    front = L(b, 0, MY0, 0, 0)
    wfront = L(b, 0, WY0, 0, 0)
    back = L(b, 0, MY1, 0, 180)
    left = L(b, MX0, 0, 0, -90)
    wleft = L(b, WX0, 0, 0, -90)
    wright = L(b, WX1, 0, 0, 90)
    mc, wc = [], []
    mc.append(window(front, -1.65, 0.5, flower_box=True, rng=rng))
    dcut = arched_door(front, DOOR_X, z0=0.1, color=DOOR, surround=False, rng=rng)
    mc.append(dcut)
    wc.append(window(wfront, WXC, 0.5, w=0.7, h=0.78, bars=(2, 1), flower_box=True, rng=rng))
    wc.append(window(wfront, WXC, 2.2, w=0.42, h=0.5, lintel=False, rng=rng))
    wc.append(window(wleft, 1.075, 0.5, w=0.44, h=0.66, rng=rng))
    mc.append(window(back, -1.4, 0.5, rng=rng))
    mc.append(window(back, 1.6, 0.5, rng=rng))
    mc.append(window(left, -MYC + 0.0, 0.5, rng=rng))
    mc.append(window(left, -MYC, 2.25, w=0.4, h=0.46, lintel=False, rng=rng))
    wc.append(window(wright, -1.075, 0.5, w=0.44, h=0.66, rng=rng))
    d2 = dcut.copy()
    b.cut(main, mc)
    b.cut(wing, wc)
    b.cut(plinth, [d2])

    # ---- crow-stepped gables + quoins
    crow_gable(b, MX0 + 0.1, rng)
    top = crow_gable(b, MX1 - 0.1, rng)
    for (cx, cy, sx, sy) in ((MX0, MY0, -1, -1), (MX1, MY0, 1, -1), (WX0, WY0, -1, -1), (WX1, WY0, 1, -1)):
        quoins(b, cx, cy, sx, sy, 0.16, EAVE, rng, color="sandstone")
    scatter_stones(b, (MX0, WX0, MY0, -1), 2, rng, 0.3, 1.9, color=STONE, avoid=[(-2.1, -1.2, 0.25, 1.45), (-1.05, -0.15, 0, 1.6)])
    scatter_stones(b, ("x", MY0, MY1, MX1, 1), 2, rng, 0.3, 1.9, color=STONE)

    # ---- slate roofs: main (ridge along X, inside the crow gables) + wing (ridge along Y)
    sub = olw.Builder("_main_roof", seed=21)
    gable_roof(sub, MX0 + 0.22, MX1 - 0.22, MHD, EAVE, MPITCH, "olw_slate", SLATES, rng, overhang=0.2, courses=7, verge=0.0,
               barge=False, fascia="wood_dark", ridge_color="#4d545c", lift=5, thick=0.05, runs=3)
    b.graft(sub, (0, MYC, 0))
    sub = olw.Builder("_wing_roof", seed=22)
    wback = MYC - 0.25  # wing roof runs from the front gable back into the main roof (stops short of its ridge)
    wlen = wback - WY0
    gable_roof(sub, -wlen / 2, wlen / 2, WHW, EAVE, WPITCH, "olw_slate", SLATES, rng, overhang=0.2, courses=5, verge=0.16,
               fascia="#f1ece0", ridge_color="#4d545c", lift=5, thick=0.05, runs=3)
    b.graft(sub, (WXC, (WY0 + wback) / 2, 0), rot=(0, 0, 90))

    # ---- tall chimney on the right crow gable, a small one on the left apex
    chimney(b, MX1 - 0.1, MYC, EAVE + 0.4, top + 0.85, w=0.42, d=0.72, pots=3, color=STONE, rng=rng)
    chimney(b, MX0 + 0.1, MYC, EAVE + 0.4, top + 0.35, w=0.36, d=0.5, pots=1, color=STONE, rng=rng)

    # ---- timber porch in front of the door (gabled, slate roof, rose on a post)
    py0, py1 = -1.42, MY0
    b.box((1.05, py1 - py0 + 0.02, 0.1), (DOOR_X, (py0 + py1) / 2, 0), "olw_stone", "#b3aa98", bevel=0.02)
    for sx in (-1, 1):
        x = DOOR_X + sx * 0.43
        b.box((0.08, 0.08, 1.55), (x, py0 + 0.06, 0.1), "olw_wood", "wood", bevel=0.012)
        b.box((0.06, py1 - py0, 0.08), (x, (py0 + py1) / 2, 1.57), "olw_wood", "wood", bevel=0.01)  # side plate
        b.box((0.04, 0.04, 0.5), (x, (py0 + py1) / 2 + 0.05, 1.1), "olw_wood", "wood", rot=(45, 0, 0))  # brace
    b.box((0.94, 0.08, 0.08), (DOOR_X, py0 + 0.06, 1.57), "olw_wood", "wood", bevel=0.01)
    pp = 40
    ph = 0.5 * math.tan(math.radians(pp))
    b.prism([(-0.5, 0), (0.5, 0), (0, ph)], 0.05, (DOOR_X, py0 + 0.06, 1.65), "olw_wood", olw.shade("wood", 1.1), axis="Y")
    sl = math.hypot(0.62, 0.62 * math.tan(math.radians(pp)))
    for s in (-1, 1):
        b.box((sl, py1 - py0 + 0.12, 0.05), (DOOR_X + s * 0.29, (py0 + py1) / 2 - 0.06, 1.65 + ph / 2 - 0.1), "olw_slate", rng.choice(SLATES),
              rot=(0, s * pp, 0), bevel=0.01)
        b.box((sl, 0.035, 0.09), (DOOR_X + s * 0.29, py0 - 0.02, 1.64 + ph / 2 - 0.12), "olw_wood_dark", "#f1ece0", rot=(0, s * pp, 0))
    b.cyl(0.04, py1 - py0 + 0.1, (DOOR_X, py0 - 0.05, 1.65 + ph + 0.02), "olw_slate", "#4d545c", rot=(-90, 0, 0), verts=6)
    # climbing rose on the left porch post
    rx = DOOR_X - 0.43
    for k in range(9):
        z = 0.15 + k * 0.17
        b.blob(0.1 + 0.03 * math.sin(k), (rx + rng.uniform(-0.05, 0.05), py0 + 0.02 + rng.uniform(-0.04, 0.04), z), "olw_foliage",
               rng.choice(["#5a7f40", "#4c7236", "#6b9249"]), scale=(1, 1, 1.1), subdiv=1, jitter=0.3, flat_bottom=k == 0)
        if k % 2 == 1:
            b.sphere(0.04, (rx - 0.07, py0 - 0.05, z + 0.03), "olw_flower", P["rose"], subdiv=1)
            b.sphere(0.035, (rx + 0.06, py0 - 0.06, z - 0.04), "olw_flower", "#e98f8f", subdiv=1)

    # ---- greenery
    ivy(b, rng, MX0 - 0.02, MY0 - 0.02, -1, -1, 1.85, reach_a=0.45, reach_b=0.9, stems=3, density=10)
    return b.finish(ao_height=0.45, ao_min=0.7, ground_snap=0.2)


if __name__ == "__main__" and olw.wanted(KEY):
    olw.build_and_export(KEY, build, max_tris=8000, size=(5.0, 3.3, 4.9), size_tol=0.3,
                         extra={"footprint": [5, 3], "door": {"x": DOOR_X, "z": MY0, "porch_z": -1.42}})
