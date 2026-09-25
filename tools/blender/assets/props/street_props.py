"""Street furniture for Our Little World (E1).

Keys: lamp-post, bench, signpost, planter, fence, fence-gate, stone-wall,
post-box, cafe-table, cafe-chair, barrel, crate.

Authoring frame (see lib/olw.py): Z up, front faces -Y, origin = footprint
centre on the ground, 1 unit = 1 tile.
"""

import math
import random

import olw

P = olw.PALETTE
IRON = P["iron"]
IRON_HI = "#3a3d42"


# ----------------------------------------------------------------------------- lamp post
def lamp_post():
    b = olw.Builder("lamp-post", seed=11)
    # stepped plinth + fluted base (lathe), tapering shaft, collars
    b.lathe([(0.15, 0.0), (0.15, 0.05), (0.125, 0.07), (0.115, 0.16), (0.085, 0.2), (0.075, 0.34), (0.06, 0.38), (0.052, 0.4)],
            (0, 0, 0), "olw_metal", IRON, verts=10)
    b.cyl(0.048, 1.3, (0, 0, 0.39), "olw_metal", IRON, verts=8, r_top=0.034)
    for z, r in ((0.8, 0.05), (1.62, 0.048)):
        b.cyl(r, 0.035, (0, 0, z), "olw_metal", IRON_HI, verts=10, bevel=0.01)
    # cross-arm scrolls under the lantern (ladder rest), touching the shaft
    for s in (-1, 1):
        pts = [(0, 0, 1.52), (s * 0.08, 0, 1.56), (s * 0.13, 0, 1.63), (s * 0.12, 0, 1.69), (s * 0.08, 0, 1.7), (s * 0.06, 0, 1.66)]
        b.tube(pts, 0.012, "olw_metal", IRON, verts=5)
    # lantern (~0.36 tall): cup, glass body (wider at top), corner posts, hood, finial
    b.lathe([(0.03, 1.64), (0.08, 1.67), (0.12, 1.7), (0.12, 1.72)], (0, 0, 0), "olw_metal", IRON, verts=8)
    b.box((0.19, 0.19, 0.25), (0, 0, 1.72), "olw_glass_emissive", P["lamp"], taper=(1.22, 1.22), rot=(0, 0, 45), vary=0.02, edges=False, ao=False)
    for k in range(4):
        a = math.radians(90 * k + 90)
        x0, y0 = 0.134 * math.cos(a), 0.134 * math.sin(a)
        b.tube([(x0, y0, 1.715), (x0 * 1.22, y0 * 1.22, 1.975)], 0.012, "olw_metal", IRON, verts=4)
    b.box((0.3, 0.3, 0.025), (0, 0, 1.965), "olw_metal", IRON_HI, rot=(0, 0, 45), bevel=0.006)
    b.cyl(0.21, 0.09, (0, 0, 1.985), "olw_metal", IRON, verts=8, r_top=0.03)
    b.sphere(0.028, (0, 0, 2.072), "olw_metal", IRON_HI, subdiv=1)
    return b.finish(ao_height=0.25, ao_min=0.8)


# ----------------------------------------------------------------------------- bench
def bench():
    b = olw.Builder("bench", seed=12)
    L, D = 1.1, 0.42
    # cast-iron ends: side profile (y, z) with a curled front leg, back leg + back support
    prof = [(-0.2, 0.0), (-0.13, 0.0), (-0.12, 0.2), (0.12, 0.2), (0.15, 0.0), (0.21, 0.0), (0.19, 0.24),
            (0.24, 0.62), (0.2, 0.63), (0.14, 0.28), (-0.17, 0.28), (-0.19, 0.2)]
    for x in (-0.48, 0.48):
        b.prism(prof, 0.04, (x, 0, 0), "olw_metal", IRON, axis="X", bevel=0.008)
        # armrest with a scroll end
        b.tube([(x, 0.18, 0.4), (x, 0.0, 0.43), (x, -0.16, 0.42), (x, -0.2, 0.38), (x, -0.18, 0.28)], 0.02, "olw_metal", IRON, verts=6)
        b.tube([(x, 0.2, 0.44), (x, 0.18, 0.4)], 0.02, "olw_metal", IRON, verts=6)
    # seat slats (4) on the iron seat rail at z=0.28 -> seat top 0.3... slats 0.025 thick
    rng = random.Random(3)
    for i in range(4):
        y = -0.16 + i * 0.1
        c = olw.shade(P["wood"], 0.92 + rng.random() * 0.16)
        b.box((L, 0.085, 0.03), (0, y, 0.275), "olw_wood", c, bevel=0.01, segments=2, vary=0.03)
    # back slats (3), leaning back ~15 deg, resting on the back supports
    for i, z in enumerate((0.36, 0.46, 0.56)):
        y = 0.17 + (z - 0.3) * 0.18
        c = olw.shade(P["wood"], 0.9 + rng.random() * 0.15)
        b.box((L, 0.085, 0.03), (0, y, z), "olw_wood", c, bevel=0.01, segments=2, rot=(-75, 0, 0), vary=0.03)
    return b.finish(ao_height=0.2)


# ----------------------------------------------------------------------------- signpost
def signpost():
    b = olw.Builder("signpost", seed=13)
    # little cairn of stones at the foot
    rng = random.Random(5)
    for k in range(7):
        a = k / 7 * math.tau + rng.random() * 0.3
        r = 0.13 + rng.random() * 0.03
        b.box((0.13, 0.11, 0.08 + rng.random() * 0.04), (math.cos(a) * r, math.sin(a) * r, 0), "olw_stone", olw.mix("sandstone", "grey_stone", rng.random()),
              rot=(0, 0, math.degrees(a)), bevel=0.025, segments=2, jitter=0.01)
    # post (square, chamfered) with a pyramid cap
    b.box((0.11, 0.11, 1.78), (0, 0, 0), "olw_wood_dark", P["wood_dark"], bevel=0.018, segments=1, jitter=0.004, vary=0.04)
    b.box((0.15, 0.15, 0.04), (0, 0, 1.76), "olw_wood_dark", olw.shade("wood_dark", 0.85), bevel=0.01)
    b.cyl(0.11, 0.12, (0, 0, 1.8), "olw_wood_dark", P["wood_dark"], verts=4, r_top=0.0, rot=(0, 0, 45))
    # arrow boards: pointed, chunky, each passing THROUGH the post (connected)
    boards = [(1.58, 1, 0, "#a4744a"), (1.38, -1, 10, "#9a6a42"), (1.18, 1, -14, "#b07d52"), (0.98, -1, 6, "#9c6d45")]
    for z, d, yaw, c in boards:
        L, H = 0.62, 0.15
        poly = [(-0.09, 0), (L - 0.1, 0), (L, H / 2), (L - 0.1, H), (-0.09, H)]
        if d < 0:
            poly = [(-u, v) for (u, v) in reversed(poly)]
        b.prism(poly, 0.045, (0, 0, z), "olw_wood", c, bevel=0.01, rot=(0, 0, yaw), vary=0.04)
        # painted cream band ("lettering" strip) on both faces
        u0, u1 = (0.06, L - 0.16) if d > 0 else (-(L - 0.16), -0.06)
        for side in (-1, 1):
            band = [(u0, 0.045), (u1, 0.045), (u1, 0.105), (u0, 0.105)]
            yy = side * 0.025
            t = math.radians(yaw)
            b.prism(band, 0.008, (-yy * math.sin(t), yy * math.cos(t), z), "olw_paint", P["cream"], rot=(0, 0, yaw), vary=0.02, edges=False)
    return b.finish(ao_height=0.3)


# ----------------------------------------------------------------------------- planter
def planter():
    b = olw.Builder("planter", seed=14)
    W, D, H = 0.72, 0.36, 0.38
    rng = random.Random(7)
    # corner posts
    for x in (-W / 2 + 0.035, W / 2 - 0.035):
        for y in (-D / 2 + 0.035, D / 2 - 0.035):
            b.box((0.07, 0.07, H + 0.02), (x, y, 0), "olw_wood_dark", P["wood_dark"], bevel=0.012)
    # horizontal planks, 3 per side, slight colour variation
    for i in range(3):
        z = 0.025 + i * 0.115
        for y in (-D / 2 + 0.02, D / 2 - 0.02):
            b.box((W - 0.07, 0.03, 0.105), (0, y, z), "olw_wood", olw.shade("wood", 0.9 + rng.random() * 0.2), bevel=0.008, segments=1)
        for x in (-W / 2 + 0.02, W / 2 - 0.02):
            b.box((0.03, D - 0.07, 0.105), (x, 0, z), "olw_wood", olw.shade("wood", 0.9 + rng.random() * 0.2), bevel=0.008)
    # rim cap
    for y in (-D / 2 + 0.02, D / 2 - 0.02):
        b.box((W + 0.02, 0.06, 0.03), (0, y, H), "olw_wood_dark", olw.shade("wood_dark", 1.1), bevel=0.01)
    for x in (-W / 2 + 0.02, W / 2 - 0.02):
        b.box((0.06, D - 0.02, 0.03), (x, 0, H), "olw_wood_dark", olw.shade("wood_dark", 1.1), bevel=0.01)
    # soil + a low leafy mound (flowers come from E2's flower clusters on top)
    b.box((W - 0.06, D - 0.06, 0.31), (0, 0, 0.03), "olw_stone_dark", P["soil"], ao=False)
    b.blob(0.2, (-0.14, 0, 0.36), "olw_foliage", "#6b8a4e", scale=(1.2, 0.8, 0.6), subdiv=2, jitter=0.22)
    b.blob(0.17, (0.16, 0.02, 0.36), "olw_foliage", "#7a9a56", scale=(1.2, 0.8, 0.6), subdiv=2, jitter=0.22)
    for k in range(7):
        x = -0.26 + k * 0.085 + rng.uniform(-0.02, 0.02)
        y = rng.uniform(-0.09, 0.09)
        c = [P["rose"], "#f4ead8", "#e8c85a", "#b99ad6", "#e9a3a3"][k % 5]
        b.sphere(0.035, (x, y, 0.44 + rng.random() * 0.04), "olw_flower", c, subdiv=1, scale=(1, 1, 0.7))
    return b.finish(ao_height=0.2)


# ----------------------------------------------------------------------------- fence (1 u, tileable along X)
def fence_posts(b, h=0.55):
    for x in (-0.5, 0.5):
        b.box((0.08, 0.08, h), (x, 0, 0), "olw_wood_dark", P["wood_dark"], bevel=0.012, jitter=0.004)
        b.cyl(0.058, 0.07, (x, 0, h), "olw_wood_dark", olw.shade("wood_dark", 0.9), verts=4, r_top=0.0, rot=(0, 0, 45))


def fence():
    b = olw.Builder("fence", seed=15)
    fence_posts(b)
    rng = random.Random(9)
    for z in (0.14, 0.38):
        b.box((1.0, 0.035, 0.055), (0, 0.035, z), "olw_wood", olw.shade("wood", 0.95 + rng.random() * 0.1), bevel=0.01, rot=(0, rng.uniform(-1.2, 1.2), 0))
    # pickets with pointed tops, front of the rails
    for i in range(5):
        x = -0.36 + i * 0.18
        h = 0.47 + rng.uniform(-0.02, 0.02)
        poly = [(-0.035, 0.02), (0.035, 0.02), (0.035, h - 0.04), (0, h), (-0.035, h - 0.04)]
        b.prism(poly, 0.025, (x, -0.0, -0.02), "olw_wood", olw.shade("wood", 0.95 + rng.random() * 0.15), bevel=0.006, rot=(0, rng.uniform(-2, 2), 0))
    return b.finish(ao_height=0.15)


def fence_gate():
    b = olw.Builder("fence-gate", seed=16)
    for x in (-0.5, 0.5):
        b.box((0.1, 0.1, 0.68), (x, 0, 0), "olw_wood_dark", P["wood_dark"], bevel=0.015)
        b.sphere(0.065, (x, 0, 0.72), "olw_wood_dark", olw.shade("wood_dark", 1.05), subdiv=2, scale=(1, 1, 0.9))
    rng = random.Random(11)
    heights = [0.46, 0.52, 0.56, 0.58, 0.56, 0.52, 0.46]
    for i, h in enumerate(heights):
        x = -0.36 + i * 0.12
        poly = [(-0.035, 0.03), (0.035, 0.03), (0.035, h - 0.035), (0, h), (-0.035, h - 0.035)]
        b.prism(poly, 0.025, (x, 0, 0.02), "olw_wood", olw.shade("wood", 1.0 + rng.random() * 0.12), bevel=0.006)
    for z in (0.12, 0.4):
        b.box((0.86, 0.035, 0.055), (0, 0.03, z), "olw_wood", olw.shade("wood", 0.9), bevel=0.01)
    b.box((0.8, 0.03, 0.05), (0, 0.035, 0.14), "olw_wood", olw.shade("wood", 0.88), bevel=0.01, rot=(0, -21, 0))
    # hinges + ring latch
    for z in (0.14, 0.42):
        b.box((0.16, 0.02, 0.035), (-0.39, 0.055, z), "olw_metal", IRON, bevel=0.005)
    b.tube([(0.37, 0.05, 0.3), (0.4, 0.07, 0.27), (0.43, 0.05, 0.3), (0.4, 0.07, 0.33), (0.37, 0.05, 0.3)], 0.008, "olw_metal", IRON, verts=4)
    b.box((0.05, 0.02, 0.05), (0.4, 0.045, 0.28), "olw_metal", IRON)
    return b.finish(ao_height=0.15)


# ----------------------------------------------------------------------------- dry-stone wall (1 u, tileable along X)
def stone_wall():
    b = olw.Builder("stone-wall", seed=17)
    rng = random.Random(21)
    tones = ["#d9cbad", "#cfc0a2", "#e1d4b8", "#c6b797", "#d4c6a6", "#bfb192", "#dccfb3", "#c9b89a"]
    # mortar-less core, set back so the stones read
    b.box((1.0, 0.3, 0.48), (0, 0, 0), "olw_stone_dark", "#8e8472", ao=False, edges=False)
    courses = [(0.0, 0.17), (0.16, 0.15), (0.3, 0.14)]
    for ci, (z0, h) in enumerate(courses):
        x = -0.5
        first = True
        while x < 0.5 - 1e-3:
            w = rng.uniform(0.2, 0.34) if not (first and ci % 2) else rng.uniform(0.1, 0.15)
            first = False
            w = min(w, 0.5 - x)
            if 0.5 - (x + w) < 0.07:
                w = 0.5 - x
            hh = h * rng.uniform(0.88, 1.02)
            for side in (-1, 1):
                d = rng.uniform(0.12, 0.16)
                y = side * (0.19 - d / 2) + rng.uniform(-0.012, 0.012)
                b.box((w - 0.014, d, hh), (x + w / 2, y, z0), "olw_stone", rng.choice(tones), bevel=0.03, segments=1,
                      jitter=(0.01, 0.01, 0.008), rot=(rng.uniform(-3, 3), 0, rng.uniform(-2, 2)), vary=0.03)
            x += w
    # capstones: flat, slightly overhanging, a few on edge (Scottish cope)
    x = -0.5
    while x < 0.5 - 1e-3:
        w = min(rng.uniform(0.14, 0.22), 0.5 - x)
        if 0.5 - (x + w) < 0.05:
            w = 0.5 - x
        b.box((w - 0.012, 0.42, rng.uniform(0.1, 0.14)), (x + w / 2, 0, 0.44), "olw_stone", olw.shade(rng.choice(tones), 0.95), bevel=0.035, segments=1,
              jitter=(0.008, 0.015, 0.01), rot=(0, rng.uniform(-4, 4), 0))
        x += w
    # moss tufts on the cope
    for k in range(2):
        b.blob(0.06, (rng.uniform(-0.4, 0.4), rng.uniform(-0.1, 0.1), 0.56), "olw_foliage", P["moss"], scale=(1.4, 1.2, 0.5), subdiv=1, jitter=0.3)
    return b.finish(ao_height=0.25, ao_min=0.75)


# ----------------------------------------------------------------------------- post box (Scottish pillar box)
def post_box():
    b = olw.Builder("post-box", seed=18)
    red = P["post_red"]
    b.lathe([(0.2, 0.0), (0.2, 0.05), (0.175, 0.07), (0.17, 0.09)], (0, 0, 0), "olw_paint", olw.shade(red, 0.75), verts=16)
    b.cyl(0.165, 0.62, (0, 0, 0.09), "olw_paint", red, verts=16)
    # cap: flared rim + dome + finial (crown-less Scottish type)
    b.lathe([(0.165, 0.71), (0.2, 0.735), (0.205, 0.76), (0.18, 0.78), (0.16, 0.83), (0.12, 0.88), (0.06, 0.915), (0.0, 0.925)],
            (0, 0, 0), "olw_paint", red, verts=16)
    b.sphere(0.03, (0, 0, 0.935), "olw_paint", red, subdiv=1)
    # mouth slot with a hood, plate, door outline
    b.box((0.2, 0.04, 0.03), (0, -0.16, 0.62), "olw_paint", olw.shade(red, 0.9), bevel=0.008)
    b.box((0.17, 0.02, 0.022), (0, -0.155, 0.595), "olw_metal", "#1d1b1b")
    b.box((0.13, 0.02, 0.09), (0, -0.16, 0.44), "olw_paint", P["white"], bevel=0.005, edges=False)
    b.box((0.22, 0.012, 0.38), (0, -0.162, 0.14), "olw_paint", olw.shade(red, 0.88), bevel=0.004)
    b.box((0.04, 0.02, 0.03), (0.07, -0.17, 0.33), "olw_metal", P["gold"])
    return b.finish(ao_height=0.2)


# ----------------------------------------------------------------------------- café table / chair
def cafe_table():
    b = olw.Builder("cafe-table", seed=19)
    b.lathe([(0.2, 0.0), (0.2, 0.015), (0.16, 0.03), (0.04, 0.05), (0.0, 0.055)], (0, 0, 0), "olw_metal", IRON, verts=12)
    b.cyl(0.022, 0.42, (0, 0, 0.04), "olw_metal", IRON, verts=8)
    for k in range(4):  # little brackets under the top
        a = k * math.pi / 2
        b.tube([(0.02 * math.cos(a), 0.02 * math.sin(a), 0.36), (0.12 * math.cos(a), 0.12 * math.sin(a), 0.445)], 0.01, "olw_metal", IRON, verts=4)
    b.cyl(0.25, 0.035, (0, 0, 0.445), "olw_wood", P["wood"], verts=20, bevel=0.012, segments=2)
    return b.finish(ao_height=0.15)


def cafe_chair():
    b = olw.Builder("cafe-chair", seed=20)
    # four splayed iron legs
    for x in (-0.15, 0.15):
        for y in (-0.14, 0.14):
            b.tube([(x * 1.12, y * 1.12, 0.0), (x, y, 0.28)], 0.014, "olw_metal", IRON, verts=5)
    b.lathe([(0.19, 0.0), (0.19, 0.03)], (0, 0, 0.27), "olw_metal", IRON, verts=14)
    b.cyl(0.2, 0.035, (0, 0, 0.285), "olw_wood", P["wood"], verts=16, bevel=0.012, segments=2)
    # back: two uprights curving back, a bent top rail and a wooden back panel
    for x in (-0.13, 0.13):
        b.tube([(x, 0.14, 0.28), (x, 0.16, 0.45), (x * 1.05, 0.19, 0.62)], 0.014, "olw_metal", IRON, verts=5)
    arc = [(0.14 * math.cos(t), 0.19 + 0.03 * math.sin(t) * 0 + 0.02 * math.sin(t), 0.62) for t in [math.pi * i / 8 for i in range(9)]]
    b.tube(arc, 0.014, "olw_metal", IRON, verts=5)
    b.box((0.28, 0.025, 0.1), (0, 0.18, 0.49), "olw_wood", olw.shade("wood", 1.05), bevel=0.01, rot=(8, 0, 0))
    # stretcher ring between legs
    ring = [(0.17 * math.cos(t), 0.16 * math.sin(t), 0.12) for t in [math.tau * i / 12 for i in range(13)]]
    b.tube(ring, 0.009, "olw_metal", IRON, verts=4)
    return b.finish(ao_height=0.15)


# ----------------------------------------------------------------------------- barrel / crate
def barrel():
    b = olw.Builder("barrel", seed=21)
    n = 14
    prof = [(0.25, 0.0), (0.285, 0.18), (0.3, 0.37), (0.285, 0.56), (0.25, 0.74)]
    rng = random.Random(4)
    # staves: body lathe coloured per stave via color_fn
    shades = [0.85 + rng.random() * 0.25 for _ in range(n)]

    def stave(pos, nrm, _r):
        k = int(((math.atan2(pos.y, pos.x) + math.pi) / math.tau) * n) % n
        return olw.shade("wood", shades[k])

    b.lathe(prof, (0, 0, 0), "olw_wood", P["wood"], verts=n, color_fn=stave, vary=0.02)
    b.cyl(0.255, 0.025, (0, 0, 0.73), "olw_wood", olw.shade("wood", 0.8), verts=n, bevel=0.008)  # lid
    b.box((0.36, 0.05, 0.015), (0, 0.08, 0.755), "olw_wood", olw.shade("wood", 0.7))  # lid batten
    for z, r in ((0.06, 0.262), (0.2, 0.29), (0.52, 0.29), (0.66, 0.262)):
        b.cyl(r + 0.008, 0.035, (0, 0, z), "olw_metal", "#3b3a38", verts=n, bevel=0.006)
    return b.finish(ao_height=0.2)


def crate():
    b = olw.Builder("crate", seed=22)
    S = 0.52
    rng = random.Random(6)
    # slatted sides with gaps over a dark core
    b.box((S - 0.06, S - 0.06, S - 0.04), (0, 0, 0.02), "olw_wood_dark", "#4a3322", ao=False)
    for face in range(4):
        for i in range(3):
            z = 0.04 + i * 0.16
            c = olw.shade("wood", 1.05 + rng.random() * 0.15)
            if face < 2:
                y = (-1 if face == 0 else 1) * (S / 2 - 0.02)
                b.box((S - 0.06, 0.025, 0.13), (0, y, z), "olw_wood", c, bevel=0.008)
            else:
                x = (-1 if face == 2 else 1) * (S / 2 - 0.02)
                b.box((0.025, S - 0.06, 0.13), (x, 0, z), "olw_wood", c, bevel=0.008)
    # corner posts + top rim + diagonal brace on the front
    for x in (-S / 2 + 0.03, S / 2 - 0.03):
        for y in (-S / 2 + 0.03, S / 2 - 0.03):
            b.box((0.06, 0.06, S), (x, y, 0), "olw_wood_dark", P["wood_dark"], bevel=0.01)
    b.box((S * 1.2, 0.025, 0.06), (0, -S / 2 + 0.005, 0.22), "olw_wood_dark", olw.shade("wood_dark", 1.15), bevel=0.008, rot=(0, -40, 0))
    for y in (-S / 2 + 0.03, S / 2 - 0.03):
        b.box((S, 0.06, 0.05), (0, y, S - 0.05), "olw_wood_dark", P["wood_dark"], bevel=0.01)
    for i in range(3):  # lid boards
        b.box(((S - 0.1) / 3 - 0.01, S - 0.12, 0.025), (-(S - 0.1) / 3 + i * (S - 0.1) / 3, 0, S - 0.022), "olw_wood", olw.shade("wood", 1.0 + rng.random() * 0.15), bevel=0.006)
    return b.finish(ao_height=0.2)


BUILDS = {
    "lamp-post": (lamp_post, 1500, (0.42, 0.42, 2.1)),
    "bench": (bench, 1500, (1.1, 0.45, 0.63)),
    "signpost": (signpost, 1500, (1.25, 0.45, 1.9)),
    "planter": (planter, 1500, (0.74, 0.38, 0.45)),
    "fence": (fence, 1000, (1.08, 0.1, 0.62)),
    "fence-gate": (fence_gate, 1000, (1.1, 0.13, 0.79)),
    "stone-wall": (stone_wall, 1500, (1.05, 0.42, 0.6)),
    "post-box": (post_box, 1500, (0.41, 0.41, 0.95)),
    "cafe-table": (cafe_table, 1000, (0.5, 0.5, 0.48)),
    "cafe-chair": (cafe_chair, 1000, (0.4, 0.4, 0.64)),
    "barrel": (barrel, 1000, (0.6, 0.6, 0.74)),
    "crate": (crate, 1000, (0.6, 0.55, 0.52)),
}

if __name__ == "__main__":
    failed = []
    for key, (fn, budget, size) in BUILDS.items():
        if not olw.wanted(key):
            continue
        try:
            olw.build_and_export(key, fn, max_tris=budget, size=size)
        except olw.ValidationError as e:
            print(f"[olw] FAILED {e}")
            failed.append(key)
    if failed:
        raise SystemExit(f"validation failed: {', '.join(failed)}")
