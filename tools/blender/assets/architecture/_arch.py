"""Shared building parts for the architecture heroes (not an asset script:
build.mjs skips files starting with "_").

Everything is placed through `L` - a local frame (origin + yaw) whose local
wall surface is the plane y=0 with the OUTSIDE towards -y, so a window/door
can be put on any wall: front (yaw 0), back (180), left (-90), right (90).
"""

import math
import random

from mathutils import Matrix, Vector

import olw

P = olw.PALETTE
FRAME = "#f1ece0"  # painted window frames
PANE = "#8f8a7a"  # glass (warm grey by day; the emissive slot glows at night)
PANE_WARM = "#c9b394"
CURTAIN = "#eadfc8"
DOOR_WOOD = "#7d4b2f"


class L:
    """Local placement frame on a wall: (x along wall, y into the wall, z up)."""

    def __init__(self, b: olw.Builder, ox=0.0, oy=0.0, oz=0.0, yaw=0.0):
        self.b, self.o, self.yaw = b, Vector((ox, oy, oz)), yaw
        self.R = Matrix.Rotation(math.radians(yaw), 3, "Z")

    def p(self, x, y, z):
        return tuple(self.o + self.R @ Vector((x, y, z)))

    def _rot(self, rot):
        r = rot or (0, 0, 0)
        return (r[0], r[1], r[2] + self.yaw)

    def box(self, size, loc, mat, color, rot=None, **kw):
        return self.b.box(size, self.p(*loc), mat, color, rot=self._rot(rot), **kw)

    def prism(self, poly, depth, loc, mat, color, rot=None, **kw):
        return self.b.prism(poly, depth, self.p(*loc), mat, color, rot=self._rot(rot), **kw)

    def cyl(self, r, h, loc, mat, color, rot=None, **kw):
        return self.b.cyl(r, h, self.p(*loc), mat, color, rot=self._rot(rot), **kw)

    def sphere(self, r, loc, mat, color, **kw):
        return self.b.sphere(r, self.p(*loc), mat, color, **kw)

    def blob(self, r, loc, mat, color, scale=(1, 1, 0.8), **kw):
        # scale is applied in world axes; swap x/y for side walls
        if abs(math.sin(math.radians(self.yaw))) > 0.7:
            scale = (scale[1], scale[0], scale[2])
        return self.b.blob(r, self.p(*loc), mat, color, scale=scale, **kw)

    def tube(self, pts, r, mat, color, **kw):
        return self.b.tube([self.p(*q) for q in pts], r, mat, color, **kw)


def arch_poly(w, h, n=8, x0=0.0):
    """Round-headed opening outline (u=x, v=z), bottom at 0, total height h."""
    r = w / 2
    spring = h - r
    pts = [(x0 - r, 0), (x0 + r, 0), (x0 + r, spring)]
    for i in range(1, n):
        a = math.pi * i / n
        pts.append((x0 + r * math.cos(a), spring + r * math.sin(a)))
    pts.append((x0 - r, spring))
    return pts


# ----------------------------------------------------------------------------- windows
def window(l: L, x, z_sill, w=0.52, h=0.72, recess=0.14, shutters=None, flower_box=False, pane=PANE,
           curtains=True, bars=(1, 1), lintel=True, sill=True, frame=FRAME, rng=None):
    """A recessed sash window on the wall of frame `l`; returns the cutter bmesh
    (subtract it from the wall part). Layers: wall -> reveal (the cut) -> frame
    -> glazing bars -> curtains -> glass."""
    rng = rng or random.Random(0)
    b = l.b
    # cutter
    l.box((w, 0.6 + recess, h), (x, (recess - 0.6) / 2, z_sill), "olw_stone", "cream")
    cutter = b.pop()
    # glass at the back of the reveal
    l.box((w, 0.03, h), (x, recess - 0.005, z_sill), "olw_glass_emissive", pane, vary=0.04, edges=False, ao=False)
    # curtains (just inside the glass, at the sides + a pelmet)
    if curtains:
        cw = w * 0.2
        for s in (-1, 1):
            l.box((cw, 0.02, h * 0.86), (x + s * (w / 2 - cw / 2 - 0.03), recess - 0.02, z_sill + h * 0.1), "olw_paint", CURTAIN, vary=0.03, edges=False)
        l.box((w - 0.04, 0.02, h * 0.1), (x, recess - 0.02, z_sill + h * 0.86), "olw_paint", olw.shade(CURTAIN, 0.95), edges=False)
    # frame (4 sides) + glazing bars
    fd, ft = 0.05, 0.045
    fy = recess - 0.03
    l.box((w, fd, ft), (x, fy, z_sill), "olw_paint", frame)
    l.box((w, fd, ft), (x, fy, z_sill + h - ft), "olw_paint", frame)
    for s in (-1, 1):
        l.box((ft, fd, h), (x + s * (w / 2 - ft / 2), fy, z_sill), "olw_paint", frame)
    nv, nh = bars
    for i in range(nv):
        u = x - w / 2 + w * (i + 1) / (nv + 1)
        l.box((0.024, fd * 0.8, h), (u, fy - 0.004, z_sill), "olw_paint", frame)
    for i in range(nh):
        v = z_sill + h * (i + 1) / (nh + 1)
        l.box((w, fd * 0.9, 0.034), (x, fy - 0.006, v - 0.017), "olw_paint", frame)
    # stone sill + lintel
    if sill:
        l.box((w + 0.16, 0.13 + recess * 0.3, 0.06), (x, -0.045 + recess * 0.15, z_sill - 0.06), "olw_stone", olw.shade("cream", 1.0), bevel=0.012)
    if lintel:
        l.box((w + 0.2, 0.07, 0.14), (x, -0.01, z_sill + h), "olw_stone", olw.mix("cream", "sandstone", 0.3), jitter=0.004)
    if shutters:
        sw = w / 2 + 0.02
        for s in (-1, 1):
            cx = x + s * (w / 2 + 0.03 + sw / 2)
            l.box((sw, 0.035, h + 0.02), (cx, -0.02, z_sill - 0.01), "olw_paint", shutters, vary=0.03)
            for k in range(4):  # louvre ribs
                l.box((sw - 0.05, 0.02, 0.03), (cx, -0.045, z_sill + 0.08 + k * (h - 0.16) / 3), "olw_paint", olw.shade(shutters, 0.85), edges=False)
    if flower_box:
        flower_box_under(l, x, z_sill - 0.06, w + 0.12, rng)
    return cutter


def flower_box_under(l: L, x, z_top, w, rng):
    """Wooden flower box hung under a sill (its top just below z_top), brimming."""
    bz = z_top - 0.17
    l.box((w, 0.17, 0.15), (x, -0.1, bz), "olw_wood", "wood", bevel=0.012)
    for s in (-1, 1):  # brackets back to the wall
        l.box((0.03, 0.12, 0.08), (x + s * (w / 2 - 0.06), -0.05, bz - 0.06), "olw_metal", P["iron"])
    l.box((w - 0.05, 0.12, 0.02), (x, -0.1, bz + 0.13), "olw_stone_dark", P["soil"], ao=False)
    n = max(3, int(w / 0.14))
    for i in range(n):
        u = x - w / 2 + 0.07 + i * (w - 0.14) / max(1, n - 1)
        l.blob(0.08, (u, -0.1 + rng.uniform(-0.02, 0.02), bz + 0.17), "olw_foliage", rng.choice(["#5f8446", "#6f9450", "#56793f"]),
               scale=(1.1, 0.9, 0.8), subdiv=1, jitter=0.3)
    for i in range(n + 2):
        u = x - w / 2 + 0.05 + rng.random() * (w - 0.1)
        l.sphere(0.035, (u, -0.14 + rng.uniform(-0.03, 0.03), bz + 0.21 + rng.random() * 0.05), "olw_flower",
                 rng.choice([P["rose"], "#f4ead8", "#e8c85a", "#c8a0d8", "#e98f8f"]), subdiv=1)


# ----------------------------------------------------------------------------- doors
def arched_door(l: L, x, z0=0.1, w=0.62, h=1.3, recess=0.16, color=DOOR_WOOD, surround=True, lamp=None, rng=None):
    """Deep round-headed plank door with a voussoir stone surround; returns cutter."""
    rng = rng or random.Random(0)
    poly = arch_poly(w, h, 10, x)
    l.prism(poly, 0.6 + recess, (0, (recess - 0.6) / 2, z0), "olw_stone", "cream", axis="Y")
    cutter = l.b.pop()
    # leaf
    inner = arch_poly(w, h, 10, x)
    l.prism(inner, 0.05, (0, recess - 0.025, z0), "olw_wood", color, vary=0.03)
    # planks (vertical battens stop below the arch spring)
    n = 5
    for i in range(n):
        u = x - w / 2 + w * (i + 0.5) / n
        top = h - w / 2 - 0.02 + (w / 2) * math.sqrt(max(0.0, 1 - ((u - x) / (w / 2)) ** 2)) * 0.85
        l.box((w / n - 0.012, 0.02, top - 0.02), (u, recess - 0.055, z0 + 0.02), "olw_wood", olw.shade(color, 0.9 + rng.random() * 0.2), bevel=0.004, vary=0.02)
    # iron strap hinges, ring handle, little round window
    for zz in (0.25, 0.85):
        l.box((w * 0.7, 0.015, 0.035), (x - w * 0.1, recess - 0.07, z0 + zz), "olw_metal", P["iron"])
    l.tube([(x + w * 0.3, recess - 0.07, z0 + 0.62), (x + w * 0.3 + 0.03, recess - 0.1, z0 + 0.58), (x + w * 0.3, recess - 0.1, z0 + 0.54),
            (x + w * 0.3 - 0.03, recess - 0.1, z0 + 0.58), (x + w * 0.3, recess - 0.07, z0 + 0.62)], 0.008, "olw_metal", P["gold"], verts=4)
    l.cyl(0.08, 0.02, (x, recess - 0.07, z0 + h - 0.3), "olw_glass_emissive", PANE_WARM, rot=(90, 0, 0), verts=10, ao=False, edges=False)
    l.cyl(0.095, 0.015, (x, recess - 0.068, z0 + h - 0.3), "olw_metal", P["iron"], rot=(90, 0, 0), verts=10, cap=True)
    if surround:
        r_out = w / 2 + 0.13
        spring = z0 + h - w / 2
        for s in (-1, 1):  # jambs as 3 stacked blocks
            for k, (zz, hh) in enumerate(((z0, 0.36), (z0 + 0.37, 0.3), (z0 + 0.68, spring - z0 - 0.68))):
                ww = 0.15 if k % 2 == 0 else 0.12
                l.box((ww, 0.08, hh - 0.01), (x + s * (w / 2 + ww / 2 - 0.005), -0.02, zz), "olw_stone", olw.mix("cream", "sandstone", rng.random() * 0.4))
        nv = 9
        for i in range(nv):
            a0 = math.pi * i / nv
            a1 = math.pi * (i + 1) / nv
            key = i == nv // 2
            ro = r_out + (0.05 if key else 0.0)
            ri = w / 2 - 0.005
            pts = [(x + ri * math.cos(a1), spring + ri * math.sin(a1)), (x + ri * math.cos(a0), spring + ri * math.sin(a0)),
                   (x + ro * math.cos(a0), spring + ro * math.sin(a0)), (x + ro * math.cos(a1), spring + ro * math.sin(a1))]
            # shrink a hair for mortar joints
            cx = sum(p[0] for p in pts) / 4
            cz = sum(p[1] for p in pts) / 4
            pts = [(cx + (p[0] - cx) * 0.93, cz + (p[1] - cz) * 0.93) for p in pts]
            l.prism(pts, 0.08 + (0.02 if key else 0), (0, -0.02, 0), "olw_stone", olw.mix("cream", "sandstone", rng.random() * 0.4), axis="Y")
    if lamp:  # small wall lantern beside the door (glows at night)
        lx = x + lamp
        lz = z0 + h + 0.05
        l.box((0.05, 0.04, 0.12), (lx, -0.01, lz - 0.02), "olw_metal", P["iron"])
        l.tube([(lx, -0.02, lz + 0.04), (lx, -0.16, lz + 0.06)], 0.012, "olw_metal", P["iron"], verts=4)
        l.box((0.1, 0.1, 0.02), (lx, -0.18, lz - 0.12), "olw_metal", P["iron"])
        l.box((0.085, 0.085, 0.13), (lx, -0.18, lz - 0.1), "olw_glass_emissive", P["lamp"], ao=False, edges=False)
        l.cyl(0.08, 0.06, (lx, -0.18, lz + 0.03), "olw_metal", P["iron"], verts=4, r_top=0.01, rot=(0, 0, 45))
    return cutter


def step(l: L, x, w=0.95, d=0.32, h=0.1, color="#bdb09a"):
    l.box((w, d + 0.02, h), (x, -d / 2 + 0.01, 0), "olw_stone", color, bevel=0.02, jitter=0.006)


# ----------------------------------------------------------------------------- walls / corners
def quoins(b: olw.Builder, cx, cy, sx, sy, z0, z1, rng, long_=0.36, short=0.2, hh=0.3, proud=0.03, color="cream"):
    """Alternating long/short corner stones at wall corner (cx, cy); (sx, sy) = signs pointing outwards."""
    z = z0
    i = 0
    while z < z1 - 0.05:
        h = min(hh, z1 - z) - 0.02
        ax, ay = (long_, short) if i % 2 == 0 else (short, long_)
        x = cx - sx * (ax / 2 - proud)
        y = cy - sy * (ay / 2 - proud)
        b.box((ax, ay, h), (x, y, z), "olw_stone", olw.mix(color, "sandstone", rng.random() * 0.35), bevel=0.018, jitter=0.006)
        z += h + 0.02
        i += 1


def scatter_stones(b: olw.Builder, face, n, rng, zmin, zmax, color="cream", avoid=()):
    """A few proud stones on a wall face. face = (x0, x1, y, outward_sign) for walls along X, or
    ('x', y0, y1, x, sign) for walls along Y. `avoid` = [(u0, u1, z0, z1)] rectangles to keep clear."""
    for _ in range(n * 3):
        if n <= 0:
            break
        w, h = rng.uniform(0.18, 0.32), rng.uniform(0.1, 0.16)
        z = rng.uniform(zmin, zmax - h)
        if face[0] == "x":
            _, y0, y1, xw, s = face
            u = rng.uniform(y0 + 0.25, y1 - 0.25)
            if any(a[0] - w / 2 < u < a[1] + w / 2 and a[2] - h < z < a[3] for a in avoid):
                continue
            b.box((0.05, w, h), (xw + s * 0.012, u, z), "olw_stone", olw.mix(color, "sandstone", rng.random() * 0.5), bevel=0.02, jitter=0.006)
        else:
            x0, x1, yw, s = face
            u = rng.uniform(x0 + 0.25, x1 - 0.25)
            if any(a[0] - w / 2 < u < a[1] + w / 2 and a[2] - h < z < a[3] for a in avoid):
                continue
            b.box((w, 0.05, h), (u, yw + s * 0.012, z), "olw_stone", olw.mix(color, "sandstone", rng.random() * 0.5), bevel=0.02, jitter=0.006)
        n -= 1


# ----------------------------------------------------------------------------- roofs
def tiled_slope(b: olw.Builder, x0, x1, y_eave, z_eave, y_ridge, z_ridge, mat, colors, courses, rng, moss=0.0, lift=4.0, thick=0.06, runs=4):
    """Overlapping tile/slate courses from eave to ridge on one slope (any direction along Y).
    colors: list of hex picked per course. moss: 0..1 amount of moss tint on the lowest courses."""
    dy, dz = y_ridge - y_eave, z_ridge - z_eave
    length = math.hypot(dy, dz)
    ang = math.degrees(math.atan2(dz, abs(dy)))
    sgn = 1 if dy > 0 else -1  # slope rises towards +y (front slope) or -y (back)
    cw = length / courses
    for i in range(courses):
        t0 = i / courses
        cy = y_eave + dy * t0
        cz = z_eave + dz * t0
        base = rng.choice(colors)
        mossy = moss * max(0.0, 1 - i / 2.5)

        # box bottom-centre at the course's lower edge; rotate so it lies on the slope.
        # each course is split into a few runs of slightly different tone/tilt so the
        # roof reads hand-laid (and moss can creep over single runs)
        seg = cw * 1.35
        rx = (ang + lift) if sgn > 0 else -(ang + lift)
        mid_y = cy + sgn * math.cos(math.radians(ang)) * seg / 2
        mid_z = cz + math.sin(math.radians(ang)) * seg / 2
        xa = x0 + rng.uniform(-0.01, 0.01)
        xb = x1 + rng.uniform(-0.01, 0.01)
        n = runs
        cuts = sorted([xa] + [xa + (xb - xa) * (k + rng.uniform(-0.25, 0.25)) / n for k in range(1, n)] + [xb])
        for k in range(n):
            c = olw.shade(base, rng.uniform(0.92, 1.08))
            rot = (rx + rng.uniform(-1.2, 1.2), rng.uniform(-0.8, 0.8), 0)
            cxk = (cuts[k] + cuts[k + 1]) / 2
            lk = cuts[k + 1] - cuts[k] - 0.006
            b.box((lk, seg, thick), (cxk, mid_y, mid_z - thick * 0.5), mat, c, rot=rot, vary=0.04, hue=0.03)
            if mossy > 0 and rng.random() < mossy:
                # soft moss cushions creeping over the lower edge of this run (foliage slot: stays green)
                nz = math.cos(math.radians(ang))
                ny = -sgn * math.sin(math.radians(ang))
                for _ in range(rng.randint(1, 3)):
                    mx = cxk + rng.uniform(-lk / 2 + 0.08, lk / 2 - 0.08)
                    along = rng.uniform(-0.3, 0.1) * seg
                    b.blob(rng.uniform(0.05, 0.09), (mx, mid_y + sgn * along * math.cos(math.radians(ang)) + ny * thick * 0.5,
                                                      mid_z + along * math.sin(math.radians(ang)) + nz * thick * 0.5),
                           "olw_foliage", olw.mix(P["moss"], "#9ab85a", rng.random() * 0.6), scale=(1.8, 1.4, 0.45), subdiv=1, jitter=0.3, flat_bottom=False)


def gable_roof(b: olw.Builder, x0, x1, half_d, z_eave, pitch, mat, colors, rng, overhang=0.22, courses=8, moss=0.0,
               fascia="wood_dark", ridge_color=None, verge=0.18, barge=True, lift=4.0, thick=0.06, runs=4):
    """Symmetric gable roof, ridge along X at y=0. Returns ridge height."""
    t = math.tan(math.radians(pitch))
    z_ridge = z_eave + half_d * t
    ye = half_d + overhang
    ze = z_eave - overhang * t
    xa, xb = x0 - verge, x1 + verge
    # solid underlay (closes gaps, gives the overhang a soffit)
    for s in (-1, 1):
        L_ = math.hypot(ye, z_ridge - ze)
        rx = -pitch if s > 0 else pitch
        # slab from eave to ridge, thickness 0.1, placed under the courses
        b.box((xb - xa - 0.02, L_ + 0.02, 0.1), ((xa + xb) / 2, s * ye / 2, (ze + z_ridge) / 2 - 0.1 / math.cos(math.radians(pitch)) * 0.5 - 0.05),
              mat, olw.shade(colors[0], 0.7), rot=(rx, 0, 0), vary=0.02)
    for s in (-1, 1):
        tiled_slope(b, xa, xb, s * ye, ze, 0.0, z_ridge, mat, colors, courses, rng, moss=moss, lift=lift, thick=thick, runs=runs)
    # ridge
    rc = ridge_color or olw.shade(colors[0], 0.8)
    b.cyl(0.085, xb - xa + 0.04, (xa - 0.02, 0, z_ridge + 0.02), mat, rc, rot=(0, 90, 0), verts=8)
    # fascia boards along the eaves
    for s in (-1, 1):
        b.box((xb - xa, 0.035, 0.1), ((xa + xb) / 2, s * (ye + 0.005), ze - 0.1), "olw_wood_dark", P[fascia] if fascia in P else fascia, bevel=0.01)
    # barge boards up the verges
    if barge:
        L_ = math.hypot(ye, z_ridge - ze)
        for xx in (xa - 0.015, xb + 0.015):
            for s in (-1, 1):
                rx = -pitch if s > 0 else pitch
                b.box((0.035, L_, 0.13), (xx, s * ye / 2, (ze + z_ridge) / 2 - 0.12), "olw_wood_dark", P[fascia] if fascia in P else fascia, rot=(rx, 0, 0), bevel=0.01)
    return z_ridge


def chimney(b: olw.Builder, x, y, z0, z1, w=0.5, d=0.62, pots=2, color="cream", rng=None, pot_color="terracotta"):
    rng = rng or random.Random(0)
    b.box((w, d, z1 - z0), (x, y, z0), "olw_stone", color, bevel=0.02, jitter=0.008)
    # stone courses band + cornice
    b.box((w + 0.08, d + 0.08, 0.08), (x, y, z1 - 0.02), "olw_stone", olw.mix(color, "sandstone", 0.3), bevel=0.02)
    b.box((w + 0.02, d + 0.02, 0.06), (x, y, z1 - 0.3), "olw_stone", olw.mix(color, "sandstone", 0.3), bevel=0.015)
    for i in range(pots):
        py = y + (i - (pots - 1) / 2) * (d / max(pots, 1)) * 0.95
        h = rng.uniform(0.22, 0.3)
        b.lathe([(0.075, 0.0), (0.07, h * 0.7), (0.085, h * 0.8), (0.09, h), (0.0, h)], (x, py, z1 + 0.05), "olw_roof_tile", olw.shade(pot_color, rng.uniform(0.9, 1.1)), verts=8)


# ----------------------------------------------------------------------------- greenery
IVY = ["#4f7a3c", "#456d33", "#7aa04e", "#5b8540", "#3f6230"]


def ivy(b: olw.Builder, rng, cx, cy, sx, sy, z_top, reach_a=0.9, reach_b=0.5, stems=3, density=11):
    """Climbing ivy on a wall corner (cx, cy) whose outward signs are (sx, sy):
    woody stems wander up both walls with small leaf clumps; a leafy foot at the ground."""
    b.blob(0.2, (cx - sx * 0.08, cy - sy * 0.02, 0.07), "olw_foliage", IVY[1], scale=(1.3, 1.3, 0.9), subdiv=1, jitter=0.3)
    for s in range(stems):
        on_a = s % 2 == 0
        reach = reach_a if on_a else reach_b
        pts = []
        z = 0.05
        u = rng.uniform(0.0, 0.12)
        while z < z_top:
            pts.append((u, z))
            z += rng.uniform(0.18, 0.28)
            u = min(reach, max(0.0, u + rng.uniform(-0.05, 0.22) * (reach / 0.9)))
        world = []
        for (u, z) in pts:
            if on_a:
                world.append((cx - sx * u, cy + sy * 0.035, z))
            else:
                world.append((cx + sx * 0.035, cy - sy * u, z))
        b.tube(world, 0.018, "olw_wood_dark", "#4a3a2a", verts=4)
        # leaves along the stem (denser low down, thinning out at the top)
        for i in range(len(world) - 1):
            p0, p1 = world[i], world[i + 1]
            for k in range(max(1, int(density * (1 - 0.4 * i / len(world)) / 4))):
                t = rng.random()
                p = [p0[j] + (p1[j] - p0[j]) * t for j in range(3)]
                off = rng.uniform(0.02, 0.07)
                if on_a:
                    p[1] += sy * off * 0.5
                    p[0] += rng.uniform(-0.08, 0.08)
                else:
                    p[0] += sx * off * 0.5
                    p[1] += rng.uniform(-0.08, 0.08)
                r = rng.uniform(0.07, 0.11)
                sc = (1.2, 0.55, 1.0) if on_a else (0.55, 1.2, 1.0)
                b.blob(r, tuple(p), "olw_foliage", rng.choice(IVY), scale=sc, subdiv=1, jitter=0.35, flat_bottom=False)
