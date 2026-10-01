"""uae-tower-podium: Dubai Downtown tower podium — retail/pedestrian base.

Wide base 6 x 4 x 1.8 with:
- Ground floor arcade of 5 round arches along the front face
- Polished stone base band 0.4 tall, slightly projecting
- Dark-tinted glass panels above the arcade
- Two horizontal banding courses at 0.6 and 1.2 unit heights
- Tall cylindrical corner accent column at one corner, 2.5 units tall
- Sign band: flat recessed panel at top, 0.3 unit tall
- Colour: cream/beige stone #e8ddc8, dark glass #1a2535, metal #8a8e95
"""

import math

import olw
from _arch import L, arch_poly

KEY = "uae-tower-podium"
W, D, H = 6.0, 4.0, 1.8
HX, HY = W / 2, D / 2

STONE = "#e8ddc8"
STONE_DARK = "#d4cbb8"
GLASS = "#1a2535"
METAL = "#8a8e95"
BASE_H = 0.4      # polished stone base band height
BASE_OUT = 0.05   # base band projection
BAND_H = 0.05     # horizontal course height
BAND_OUT = 0.03   # course projection
SIGN_H = 0.3      # sign band at top
ARCH_N = 5        # arches along front


def build():
    olw.reset()
    b = olw.Builder(KEY, seed=31)

    # ---- main body: stone base + glass upper portion
    b.box((W, D, BASE_H), (0, 0, 0), "olw_stone", STONE)
    # Slightly projecting base band on all sides
    b.box((W + 2 * BASE_OUT, D + 2 * BASE_OUT, BASE_H), (0, 0, 0), "olw_stone", STONE_DARK, bevel=0.01)

    # Glass curtain-wall above base band
    glass_h = H - BASE_H - SIGN_H
    b.box((W, D, glass_h), (0, 0, BASE_H), "olw_glass", GLASS, edges=False)

    # Sign band at top (recessed slightly — stone facing)
    sign_z = H - SIGN_H
    b.box((W, D, SIGN_H), (0, 0, sign_z), "olw_stone", STONE_DARK)
    # Recessed panel inset on front
    b.box((W - 0.3, 0.04, SIGN_H - 0.06), (0, -HY + 0.02, sign_z + 0.03), "olw_stone", STONE)

    # ---- two horizontal banding courses on the glass portion
    for band_z in (0.6, 1.2):
        bz = BASE_H + band_z - BAND_H / 2
        if bz + BAND_H < sign_z:
            b.box((W + 2 * BAND_OUT, D + 2 * BAND_OUT, BAND_H), (0, 0, bz), "olw_stone", STONE, bevel=0.005)

    # ---- front arcade: 5 round arches recessed into the front face
    front = L(b, 0, -HY, 0, 0)
    arch_w = 0.8   # arch clear width
    arch_h = 1.1   # arch total height (including rounded top)
    arch_depth = 0.35
    arch_spacing = W / ARCH_N  # 1.2 per arch
    for i in range(ARCH_N):
        ax = -HX + arch_spacing * (i + 0.5)
        poly = arch_poly(arch_w, arch_h, 8, ax)
        # stone reveal / recess into the base band + glass above
        front.prism(poly, arch_depth, (0, arch_depth / 2 - 0.02, 0), "olw_stone", STONE, axis="Y")
        recess_part = b.pop()
        # glass pane at back of recess
        g_poly = arch_poly(arch_w - 0.06, arch_h - 0.06, 8, ax)
        front.prism(g_poly, 0.03, (0, arch_depth - 0.02, 0.03), "olw_glass", GLASS, axis="Y", edges=False)
        # aluminium frame strips around each arch (thin metal outline)
        front.box((arch_w + 0.08, 0.04, 0.05), (ax, arch_depth - 0.04, 0), "olw_metal", METAL)
        front.box((0.05, 0.04, arch_h), (ax - arch_w / 2, arch_depth - 0.04, 0), "olw_metal", METAL)
        front.box((0.05, 0.04, arch_h), (ax + arch_w / 2, arch_depth - 0.04, 0), "olw_metal", METAL)

    # ---- corner accent: tall cylindrical column at front-right corner
    cyl_r = 0.18
    cyl_h = 2.5
    b.cyl(cyl_r, cyl_h, (HX - cyl_r * 0.5, -HY + cyl_r * 0.5, 0), "olw_stone", STONE_DARK, verts=16, bevel=0.01)
    # cap disc
    b.cyl(cyl_r + 0.04, 0.08, (HX - cyl_r * 0.5, -HY + cyl_r * 0.5, cyl_h), "olw_stone", STONE, verts=16)
    # metal ring band mid-height
    b.cyl(cyl_r + 0.02, 0.06, (HX - cyl_r * 0.5, -HY + cyl_r * 0.5, cyl_h * 0.5 - 0.03), "olw_metal", METAL, verts=16)

    return b.finish(ao_height=0.45, ao_min=0.78)


if __name__ == "__main__":
    obj = build()
    rep = olw.validate(obj, max_tris=2500, size=(W, D, 0), size_tol=0.30, allow_floating=0)
    olw.export_glb(obj, KEY, report=rep, extra={"footprint": [6, 4]})
