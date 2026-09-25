"""cottage-hero-a: 1.5-storey Scottish stone cottage (footprint ~4 x 3 tiles).

Steep terracotta gable roof (overhang, fascia, barge boards, ridge, mossy
eaves), chimney stack with pots on the right gable, a front dormer, cream
sandstone walls with quoins, recessed sash windows (reveal -> frame -> bars ->
curtains -> glass), a deep round-headed plank door in a voussoir surround with
a step and a wall lantern, shutters, flower boxes, pots and an ivy-clad corner.
Door: front wall, x = +0.30 (game x), front face z = -1.30 (step to -1.62).
"""

import math
import random

import olw
from _arch import L, P, arched_door, chimney, gable_roof, ivy, quoins, scatter_stones, step, window

KEY = "cottage-hero-a"
W, D = 3.7, 2.6
HX, HY = W / 2, D / 2
EAVE = 2.0
PITCH = 50
DOOR_X = 0.3


def pot(b, x, y, rng, r=0.11, h=0.2):
    b.lathe([(r * 0.7, 0), (r * 0.78, 0.02), (r, h * 0.85), (r * 1.12, h * 0.88), (r * 1.12, h), (r * 0.95, h)], (x, y, 0), "olw_roof_tile", "terracotta", verts=10)
    b.cyl(r * 0.92, 0.02, (x, y, h - 0.03), "olw_stone_dark", P["soil"], verts=10)
    b.blob(r * 1.1, (x, y, h + r * 0.45), "olw_foliage", rng.choice(["#5f8446", "#6f9450"]), scale=(1, 1, 0.9), subdiv=1, jitter=0.3)
    for _ in range(4):
        a = rng.random() * math.tau
        b.sphere(0.03, (x + math.cos(a) * r * 0.7, y + math.sin(a) * r * 0.7, h + r * 0.9 + rng.random() * 0.05), "olw_flower",
                 rng.choice([P["rose"], "#f4ead8", "#e98f8f"]), subdiv=1)


def build():
    rng = random.Random(42)
    b = olw.Builder(KEY, seed=7)

    # ---- plinth + body (pentagon prism along X, gables at the ends)
    plinth = b.box((W + 0.08, D + 0.08, 0.18), (0, 0, 0), "olw_stone", olw.mix("sandstone", "grey_stone", 0.4), bevel=0.02)
    ridge = EAVE + HY * math.tan(math.radians(PITCH))
    body = b.prism([(-HY, 0), (HY, 0), (HY, EAVE), (0, ridge), (-HY, EAVE)], W, (0, 0, 0), "olw_stone", "cream", axis="X", vary=0.02)

    front = L(b, 0, -HY, 0, 0)
    back = L(b, 0, HY, 0, 180)
    left = L(b, -HX, 0, 0, -90)
    right = L(b, HX, 0, 0, 90)
    cut = []
    cut.append(window(front, -0.95, 0.5, shutters=P["sage"], rng=rng))
    cut.append(window(front, 1.2, 0.5, flower_box=True, rng=rng))
    door_cut = arched_door(front, DOOR_X, z0=0.1, lamp=-0.5, rng=rng)
    cut.append(door_cut)
    step(front, DOOR_X)
    cut.append(window(back, -0.8, 0.5, rng=rng))
    cut.append(window(back, 0.9, 0.5, rng=rng))
    cut.append(window(left, 0.0, 0.5, flower_box=True, rng=rng))
    cut.append(window(left, 0.0, 2.25, w=0.4, h=0.5, lintel=False, rng=rng))
    cut.append(window(right, -0.5, 0.5, rng=rng))
    # door opening must also go through the plinth
    door_cut2 = door_cut.copy()
    b.cut(body, cut)
    b.cut(plinth, [door_cut2])

    # ---- quoins + a few proud stones
    for sx in (-1, 1):
        for sy in (-1, 1):
            quoins(b, sx * HX, sy * HY, sx, sy, 0.18, EAVE, rng)
    scatter_stones(b, (-HX, HX, -HY, -1), 3, rng, 0.25, 1.9, avoid=[(-1.6, -0.3, 0.3, 1.45), (-0.2, 0.85, 0, 1.6), (0.85, 1.6, 0.2, 1.45)])
    scatter_stones(b, ("x", -HY, HY, -HX, -1), 2, rng, 0.25, 1.9, avoid=[(-0.45, 0.45, 0.2, 1.45)])
    scatter_stones(b, ("x", -HY, HY, HX, 1), 2, rng, 0.25, 1.9, avoid=[(0.05, 0.95, 0.35, 1.45)])

    # ---- roof
    tiles = [P["terracotta"], "#c4744f", "#b0603f", "#c97c55", "#bd6d49"]
    zr = gable_roof(b, -HX, HX, HY, EAVE, PITCH, "olw_roof_tile", tiles, rng, overhang=0.24, courses=9, moss=0.3, verge=0.16, lift=7)

    # ---- chimney on the right gable
    chimney(b, HX - 0.28, 0.0, EAVE + 0.3, zr + 0.7, w=0.52, d=0.66, pots=2, rng=rng)

    # ---- dormer over the left window
    dx, dy = -0.95, -1.0
    t = math.tan(math.radians(PITCH))
    z_roof = EAVE + (HY - abs(dy)) * t
    d_eave = 2.98
    dormer = b.box((0.86, 1.0, d_eave - (z_roof - 0.35)), (dx, dy + 0.5, z_roof - 0.35), "olw_stone", "cream", vary=0.02)
    dl = L(b, dx, dy, 0, 0)
    dcut = window(dl, 0.0, z_roof + 0.08, w=0.44, h=0.44, sill=True, lintel=False, bars=(1, 1), rng=rng)
    b.cut(dormer, [dcut])
    # dormer gable + little roof (ridge along Y)
    b.prism([(-0.43, d_eave), (0.43, d_eave), (0.0, d_eave + 0.43)], 0.1, (dx, dy + 0.05, 0), "olw_stone", "cream", axis="Y")
    slope_len = math.hypot(0.55, 0.55)
    for s in (-1, 1):
        b.box((slope_len, 1.3, 0.07), (dx + s * 0.25, dy + 0.5, d_eave + 0.2), "olw_roof_tile", rng.choice(tiles), rot=(0, s * 45, 0), bevel=0.012)
        b.box((slope_len, 0.035, 0.1), (dx + s * 0.25, dy - 0.16, d_eave + 0.12), "olw_wood_dark", P["wood_dark"], rot=(0, s * 45, 0), bevel=0.008)
    b.cyl(0.05, 0.95, (dx, dy - 0.15, d_eave + 0.46), "olw_roof_tile", olw.shade("terracotta", 0.8), rot=(-90, 0, 0), verts=6)

    # ---- garden bits: pots by the door, ivy on the front-left corner, moss on the eave
    pot(b, DOOR_X - 0.62, -HY - 0.22, rng)
    pot(b, DOOR_X + 0.6, -HY - 0.2, rng, r=0.09, h=0.16)
    ivy(b, rng, -HX - 0.02, -HY - 0.02, -1, -1, 1.75, reach_a=0.5, reach_b=0.9, stems=3, density=11)
    for x in (-1.5, -0.2, 1.3):
        b.blob(0.09, (x, -HY - 0.3, EAVE - 0.27), "olw_foliage", P["moss"], scale=(1.6, 1.0, 0.5), subdiv=1, jitter=0.3)
    return b.finish(ao_height=0.45, ao_min=0.7, ground_snap=0.2)


if __name__ == "__main__" and olw.wanted(KEY):
    olw.build_and_export(KEY, build, max_tris=8000, size=(4.4, 3.4, 4.3), size_tol=0.3,
                         extra={"footprint": [4, 3], "door": {"x": DOOR_X, "z": -HY, "step_z": -HY - 0.32}})
