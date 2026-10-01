"""uae-villa: contemporary UAE two-storey residential villa.

Cream flat-roofed box with a raised parapet, recessed dark-tinted windows
(4 per storey on the front and back walls), an entrance portico (two square
columns + flat lintel) in front of a recessed doorway, and a flat-roofed
carport extension on the right-hand side carried on two columns.
The house + carport are centred on the origin as one footprint.
"""

import olw
from _arch import L, P

KEY = "uae-villa"
W, D, H = 4.0, 3.0, 2.8  # main house box
CW, CD, CH = 1.5, 1.2, 2.0  # carport extension
OX = -CW / 2  # shift the house left so house + carport are centred
HX, HY = W / 2, D / 2

WALL = "#f5eed8"
CAP = "#f8f4ed"
GLASS = "#1a2535"
DOOR = "#5e3d28"
PARAPET_H, PARAPET_T = 0.25, 0.12
REVEAL = 0.15
WIN_W, WIN_H = 0.45, 0.75
WIN_X = (-1.6, -1.0, 1.0, 1.6)
SILLS = (0.35, 1.75)  # ground + first floor
DOOR_W, DOOR_H = 0.7, 1.6
PORTICO = 0.6  # how far the portico columns stand in front of the wall


def build():
    olw.reset()
    b = olw.Builder(KEY, seed=21)

    # ---- main body + recessed openings (boolean reveals)
    body = b.box((W, D, H), (OX, 0, 0), "olw_stone", WALL)
    front = L(b, OX, -HY, 0, 0)
    back = L(b, OX, HY, 0, 180)
    cuts = []
    for wall in (front, back):
        for z in SILLS:
            for x in WIN_X:
                wall.box((WIN_W, 2 * REVEAL, WIN_H), (x, 0, z), "olw_stone", WALL)
                cuts.append(b.pop())
    front.box((DOOR_W, 2 * REVEAL + 0.1, DOOR_H), (0, 0.05, 0), "olw_stone", WALL)
    cuts.append(b.pop())
    b.cut(body, cuts)

    # ---- glass panes + slim sills at the back of each reveal
    for wall in (front, back):
        for z in SILLS:
            for x in WIN_X:
                wall.box((WIN_W, 0.02, WIN_H), (x, REVEAL - 0.02, z), "olw_glass", GLASS, ao=False, edges=False)
                wall.box((WIN_W + 0.08, 0.06, 0.04), (x, -0.02, z - 0.04), "olw_stone", CAP)

    # ---- recessed doorway: dark timber door at the back of the recess + step
    # door recess cutter spans y -0.15..0.25 -> door slab against the back face at y=0.25
    front.box((DOOR_W, 0.03, DOOR_H), (0, 0.235, 0), "olw_wood", DOOR)
    front.box((0.03, 0.03, 0.14), (DOOR_W / 2 - 0.1, 0.21, 0.75), "olw_metal", P["gold"])

    # ---- entrance portico: two square columns + flat lintel slab tied into the wall
    col_h = 2.2
    for x in (-0.55, 0.55):
        front.box((0.25, 0.25, col_h), (x, -PORTICO, 0), "olw_stone", WALL)
    front.box((1.45, PORTICO + 0.15, 0.2), (0, -(PORTICO + 0.15) / 2 + 0.02, col_h), "olw_stone", CAP)
    front.box((1.45, PORTICO + 0.3, 0.06), (0, -(PORTICO + 0.3) / 2 + 0.02, 0), "olw_stone", "#e6dcc4")  # entrance platform

    # ---- parapet: raised strips around the roof perimeter + cap
    x0 = OX
    for sy in (-1, 1):
        b.box((W, PARAPET_T, PARAPET_H), (x0, sy * (HY - PARAPET_T / 2), H), "olw_stone", CAP)
    for sx in (-1, 1):
        b.box((PARAPET_T, D - 2 * PARAPET_T, PARAPET_H), (x0 + sx * (HX - PARAPET_T / 2), 0, H), "olw_stone", CAP)
    b.box((W - 2 * PARAPET_T, D - 2 * PARAPET_T, 0.02), (x0, 0, H), "olw_stone", "#e6dcc4")  # roof deck

    # ---- carport: flat roof slab on two columns, attached to the right wall (front corner)
    cx0 = OX + HX  # right wall of the house
    cy = -HY + CD / 2
    slab_t = 0.15
    b.box((CW, CD, slab_t), (cx0 + CW / 2, cy, CH - slab_t), "olw_stone", CAP)
    for y in (-HY + 0.1, -HY + CD - 0.1):
        b.box((0.15, 0.15, CH - slab_t), (cx0 + CW - 0.1, y, 0), "olw_stone", WALL)
    b.box((CW - 0.05, CD, 0.03), (cx0 + CW / 2 + 0.025, cy, 0), "olw_stone", "#cfc6b4")  # driveway pad

    return b.finish(ao_height=0.4, ao_min=0.78)


if __name__ == "__main__":
    obj = build()
    rep = olw.validate(obj, max_tris=3000, size=(W + CW, D + PORTICO, H + PARAPET_H), size_tol=0.25)
    olw.export_glb(obj, KEY, report=rep, extra={"footprint": [6, 4], "door": {"x": OX, "z": -HY - PORTICO}})
