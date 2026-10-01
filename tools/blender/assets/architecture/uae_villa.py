"""uae-villa: contemporary UAE two-storey residential villa.

Cream flat-roofed box (4 x 3 x 2.8) with:
- Flat roof with parapet 0.3 tall
- Recessed windows with 0.18 inset, visible shadow gap
- Corner pilasters: 0.06 projection at each corner
- Ground floor entrance portico: arch with two columns
- Side carport: 1.5 wide x 1.2 deep x 2.0 tall on two columns
- Boundary wall section on one side
- One mashrabiya-style 3x3 grid lattice window screen
- Colour: warm cream #f5eed8 walls, #f8f4ed parapet cap
- Slots: olw_stone (stucco), olw_glass (dark tinted windows), olw_metal
"""

import math

import olw
from _arch import L

KEY = "uae-villa"

# Main house dimensions
W, D, H = 4.0, 3.0, 2.8
HX, HY = W / 2, D / 2

# Carport (attached to right side of house)
CW, CD, CH = 1.5, 1.2, 2.0

# Boundary wall (attached to left side)
BW, BD, BH = 1.5, 0.12, 0.9

WALL = "#f5eed8"
CAP = "#f8f4ed"
GLASS = "#2a3545"
PARAPET_H = 0.30
PARAPET_T = 0.12
REVEAL = 0.18  # window recess depth
WIN_W, WIN_H = 0.55, 0.7
PIL_W, PIL_D = 0.12, 0.06  # corner pilaster dims


def mashrabiya(b, x, y, z_sill, w=0.55, h=0.7, n=3):
    """3x3 lattice screen — thin stone strips in a grid."""
    depth = 0.04
    strip_t = 0.04
    # Vertical strips
    for i in range(n + 1):
        sx = x - w / 2 + w * i / n
        b.box((strip_t, depth, h), (sx, y, z_sill), "olw_stone", CAP)
    # Horizontal strips
    for j in range(n + 1):
        sz = z_sill + h * j / n
        b.box((w + strip_t, depth, strip_t), (x, y, sz), "olw_stone", CAP)


def build():
    olw.reset()
    b = olw.Builder(KEY, seed=21)

    # Centre the assembly: house + carport on right, boundary wall on left
    # total footprint = BW + W + CW, centred at 0
    total_w = BW + W + CW
    bwall_cx = -total_w / 2 + BW / 2   # boundary wall centre x
    house_cx = bwall_cx + BW / 2 + W / 2  # house centre x
    cport_cx = house_cx + W / 2 + CW / 2  # carport centre x

    # ---- boundary wall section (left of house)
    b.box((BW, BD, BH), (bwall_cx, -HY + BD / 2, 0), "olw_stone", "#f0e8d5", bevel=0.005)
    # coping cap
    b.box((BW, BD + 0.12, 0.07), (bwall_cx, -HY + BD / 2, BH), "olw_stone", CAP, bevel=0.008)
    # pilaster at the free end
    b.box((0.1, BD + 0.08, BH), (bwall_cx - BW / 2 + 0.05, -HY + BD / 2, 0), "olw_stone", "#f0e8d5", bevel=0.006)
    b.box((0.12, BD + 0.12, 0.07), (bwall_cx - BW / 2 + 0.05, -HY + BD / 2, BH), "olw_stone", CAP)

    # ---- main house body
    house_ox = house_cx
    house_oy = 0.0
    body = b.box((W, D, H), (house_ox, house_oy, 0), "olw_stone", WALL, bevel=0.008)

    # ---- corner pilasters (slight 0.06 projection at each corner)
    for sx in (-1, 1):
        for sy in (-1, 1):
            px = house_ox + sx * (HX - PIL_W / 2)
            py = house_oy + sy * (HY + PIL_D / 2 - 0.005)
            b.box((PIL_W, PIL_D, H), (px, py, 0), "olw_stone", WALL, bevel=0.005)
            # also project on the perpendicular face
            px2 = house_ox + sx * (HX + PIL_D / 2 - 0.005)
            py2 = house_oy + sy * (HY - PIL_W / 2)
            b.box((PIL_D, PIL_W, H), (px2, py2, 0), "olw_stone", WALL, bevel=0.005)

    # ---- recessed windows: front (south face) and back (north face)
    front = L(b, house_ox, house_oy - HY, 0, 0)
    back = L(b, house_ox, house_oy + HY, 0, 180)
    cuts = []

    # Ground floor windows: 2 positions on front, 2 on back
    # First floor windows: 2 positions on front, 2 on back
    win_gnd_z = 0.5
    win_fst_z = 1.6
    for x in (-0.95, 0.95):
        for z in (win_gnd_z, win_fst_z):
            # front windows
            front.box((WIN_W, REVEAL * 2, WIN_H), (x, 0, z), "olw_stone", WALL)
            cuts.append(b.pop())
            # back windows
            back.box((WIN_W, REVEAL * 2, WIN_H), (x, 0, z), "olw_stone", WALL)
            cuts.append(b.pop())

    # Door opening on front
    door_w, door_h = 0.8, 1.8
    front.box((door_w, REVEAL * 2, door_h), (0, 0, 0), "olw_stone", WALL)
    cuts.append(b.pop())

    b.cut(body, cuts)

    # ---- glass panes at the back of each reveal
    for x in (-0.95, 0.95):
        for z in (win_gnd_z, win_fst_z):
            front.box((WIN_W, 0.02, WIN_H), (x, REVEAL - 0.01, z), "olw_glass", GLASS, ao=False, edges=False)
            front.box((WIN_W + 0.06, 0.05, 0.05), (x, -0.02, z - 0.05), "olw_stone", CAP, bevel=0.008)
            back.box((WIN_W, 0.02, WIN_H), (x, REVEAL - 0.01, z), "olw_glass", GLASS, ao=False, edges=False)
            back.box((WIN_W + 0.06, 0.05, 0.05), (x, -0.02, z - 0.05), "olw_stone", CAP, bevel=0.008)

    # ---- mashrabiya lattice screen over one first-floor window (front left)
    mashrabiya(b, house_ox - 0.95, house_oy - HY + 0.03, win_fst_z)

    # ---- entrance portico: two columns + flat-arch lintel
    col_h = 2.3
    col_size = 0.22
    portico_y = house_oy - HY - 0.55  # columns in front of wall
    for sx in (-1, 1):
        b.box((col_size, col_size, col_h), (house_ox + sx * 0.45, portico_y, 0), "olw_stone", WALL, bevel=0.01)
    # Lintel slab spanning columns
    b.box((1.35, 0.55, 0.2), (house_ox, portico_y + 0.22, col_h), "olw_stone", CAP, bevel=0.008)
    # Entrance platform / step
    b.box((1.45, 0.65, 0.08), (house_ox, portico_y + 0.25, 0), "olw_stone", "#e6dcc4", bevel=0.01)
    # Door at recess back
    front.box((door_w - 0.04, 0.04, door_h - 0.1), (0, REVEAL - 0.04, 0.05), "olw_wood", "#5e3d28")
    # Door handle
    front.box((0.03, 0.03, 0.12), (door_w / 2 - 0.12, REVEAL - 0.07, 0.9), "olw_metal", "#8a8e95")

    # ---- flat roof with parapet
    # Roof deck
    b.box((W - PARAPET_T * 2, D - PARAPET_T * 2, 0.02), (house_ox, house_oy, H), "olw_stone", "#e6dcc4")
    # Parapet walls around perimeter
    for sy in (-1, 1):
        b.box((W, PARAPET_T, PARAPET_H), (house_ox, house_oy + sy * (HY - PARAPET_T / 2), H), "olw_stone", CAP, bevel=0.006)
    for sx in (-1, 1):
        b.box((PARAPET_T, D - PARAPET_T * 2, PARAPET_H), (house_ox + sx * (HX - PARAPET_T / 2), house_oy, H), "olw_stone", CAP, bevel=0.006)

    # ---- carport: flat-roof extension on right side, two columns
    slab_t = 0.12
    b.box((CW, CD, slab_t), (cport_cx, house_oy - HY + CD / 2, CH), "olw_stone", CAP, bevel=0.008)
    # Parapet around carport
    b.box((CW, PARAPET_T, PARAPET_H), (cport_cx, house_oy - HY - PARAPET_T / 2 + CD, CH + slab_t), "olw_stone", CAP)
    b.box((PARAPET_T, CD, PARAPET_H), (cport_cx + CW / 2 - PARAPET_T / 2, house_oy - HY + CD / 2, CH + slab_t), "olw_stone", CAP)
    # Two supporting columns at the outer front corners
    for cy_col in (house_oy - HY + 0.12, house_oy - HY + CD - 0.12):
        b.box((0.18, 0.18, CH), (cport_cx + CW / 2 - 0.12, cy_col, 0), "olw_stone", WALL, bevel=0.01)
    # Driveway pad
    b.box((CW + 0.02, CD - 0.02, 0.02), (cport_cx, house_oy - HY + CD / 2, 0), "olw_stone", "#cfc6b4")

    return b.finish(ao_height=0.45, ao_min=0.76)


if __name__ == "__main__":
    obj = build()
    rep = olw.validate(obj, max_tris=3000, size=(0, D, H), size_tol=0.40)
    olw.export_glb(obj, KEY, report=rep, extra={"footprint": [7, 3]})
