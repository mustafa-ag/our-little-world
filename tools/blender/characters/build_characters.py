# Run: <python with bpy 4.2> tools/blender/characters/build_characters.py [--only juju|npc|male] [--preview OUTDIR]
#   e.g. .../bpy-venv/bin/python tools/blender/characters/build_characters.py
#   writes public/assets/models/juju.glb and public/assets/models/npc-base.glb + npc-male.glb (deterministic).
#   --preview OUTDIR also renders Cycles preview PNGs (front / 3-4 / side / back / walk / wave).
"""Our Little World -- storybook characters, modelled + rigged + animated in Blender.

Juju (the player) and a neutral NPC base share one skeleton and one set of
animations (idle / walk / wave / nod). Everything is generated from code so the
GLBs are reproducible:

  * body forms are lofted rings (profiles below), smooth shaded; hair caps,
    cardigan and skirt hem get a Solidify modifier (applied);
  * the face is a small painted texture (256 px, numpy SDF painter) on a decal
    shell hugging the front of the head;
  * weights are painted procedurally per part (distance-to-bone / height
    blends), so joints bend without gaps;
  * the walk cycle is solved with 2-bone IK per frame: the stance foot moves
    back in a straight line on the ground, so the in-place stride is exact.

World contract: 1 unit = 1 tile (1.6 m); Juju is 1.05 u tall, feet at y=0,
origin between the feet, +Y up (Blender Z up), she faces -Y in Blender which is
+Z in glTF / Babylon. Material slots: olw_skin, olw_hair, olw_top, olw_outer,
olw_bottom, olw_shoes, olw_face. COLOR_0 carries shading multipliers
(roots darker, seams, blush...) that the runtime multiplies by slot tints.
"""

import argparse
import math
import os
import sys
import tempfile

import bpy
import bmesh  # noqa: E402 (needs bpy first when run as a module)
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(REPO, "public", "assets", "models")

TARGET_HEIGHT = 1.05
FPS = 24
# in-place stride of the authored walk, world units per loop at playback rate 1 (see build_walk)
WALK_STEP = 0.27
# run: stance foot travel per contact and the stance share of a loop (flight in between);
# loop length (design units) = RUN_REACH / RUN_STANCE, 16 frames per loop
# (a bouncy, light jog: short contacts and a real flight phase so a 0.3-unit leg
# covers ~0.8 u per step at the player's stroll speed without frantic cadence)
RUN_REACH = 0.30
RUN_STANCE = 0.19
RUN_FRAMES = 16

# ----------------------------------------------------------------------------
# small math helpers
# ----------------------------------------------------------------------------


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smoothstep(e0, e1, x):
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def mix3(a, b, t):
    return tuple(lerp(a[i], b[i], t) for i in range(3))


def hermite_table(table, x):
    """Piecewise cubic (Catmull-Rom style) interpolation of rows keyed by row[0]."""
    if table[0][0] > table[-1][0]:  # accept tables listed top -> bottom
        table = table[::-1]
    xs = [r[0] for r in table]
    if x <= xs[0]:
        return list(table[0][1:])
    if x >= xs[-1]:
        return list(table[-1][1:])
    k = 0
    while xs[k + 1] < x:
        k += 1
    x0, x1 = xs[k], xs[k + 1]
    t = (x - x0) / (x1 - x0)
    out = []
    for c in range(1, len(table[0])):
        p0, p1 = table[k][c], table[k + 1][c]

        def slope(i):
            if i <= 0:
                return (table[1][c] - table[0][c]) / (xs[1] - xs[0])
            if i >= len(xs) - 1:
                return (table[-1][c] - table[-2][c]) / (xs[-1] - xs[-2])
            return (table[i + 1][c] - table[i - 1][c]) / (xs[i + 1] - xs[i - 1])

        m0, m1 = slope(k) * (x1 - x0), slope(k + 1) * (x1 - x0)
        t2, t3 = t * t, t * t * t
        out.append((2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1)
    return out


def seg_dist(p, a, b):
    ab = b - a
    t = clamp((p - a).dot(ab) / max(1e-9, ab.dot(ab)))
    return (p - (a + ab * t)).length, t


# ----------------------------------------------------------------------------
# mesh accumulation
# ----------------------------------------------------------------------------

# weight tags (stored as an int attribute so they survive Solidify)
T_BODY, T_HEAD, T_ARM_L, T_ARM_R, T_LEG_L, T_LEG_R = 0, 1, 2, 3, 4, 5
T_HAIR_CAP, T_HAIR_BACK, T_HAIR_FL, T_HAIR_FR, T_SKIRT, T_PELVIS = 6, 7, 8, 9, 10, 11
T_SHOE_L, T_SHOE_R, T_TAIL = 12, 13, 14


class Part:
    def __init__(self):
        self.v = []
        self.f = []
        self.col = []
        self.tag = []
        self.uv = None  # per-vertex uv list when used

    def vert(self, p, col=(1, 1, 1), tag=T_BODY):
        self.v.append(Vector(p))
        self.col.append(tuple(col))
        self.tag.append(tag)
        return len(self.v) - 1

    def grid(self, rings, closed=True, col=None, tag=T_BODY, cap0=None, cap1=None):
        """rings[i][j]: rings along the length, points around (CCW seen from the
        cap1 end, i.e. right-handed with the length direction => outward normals).
        cap0/cap1: None, or an apex point (fan) closing the first/last ring."""
        base = len(self.v)
        n = len(rings[0])
        for i, ring in enumerate(rings):
            for j, p in enumerate(ring):
                c = col(Vector(p), i, j) if callable(col) else (col or (1, 1, 1))
                tg = tag(Vector(p), i, j) if callable(tag) else tag
                self.vert(p, c, tg)
        idx = lambda i, j: base + i * n + (j % n)
        jn = n if closed else n - 1
        for i in range(len(rings) - 1):
            for j in range(jn):
                self.f.append((idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)))
        for cap, i, rev in ((cap0, 0, True), (cap1, len(rings) - 1, False)):
            if cap is None:
                continue
            p = Vector(cap)
            c = col(p, i, 0) if callable(col) else (col or (1, 1, 1))
            tg = tag(p, i, 0) if callable(tag) else tag
            ci = self.vert(p, c, tg)
            for j in range(jn):
                a, b = idx(i, j), idx(i, j + 1)
                self.f.append((ci, b, a) if rev else (ci, a, b))
        return base

    def extend(self, other):
        off = len(self.v)
        self.v += other.v
        self.col += other.col
        self.tag += other.tag
        self.f += [tuple(i + off for i in f) for f in other.f]
        if other.uv is not None:
            if self.uv is None:
                self.uv = [(0, 0)] * off
            self.uv += other.uv
        elif self.uv is not None:
            self.uv += [(0, 0)] * len(other.v)

    def tris(self):
        return sum(len(f) - 2 for f in self.f)


def frames_along(pts, up_hint):
    """Right-handed (N, B, T) frames along a polyline (parallel transport)."""
    n = len(pts)
    tans = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tans.append((Vector(b) - Vector(a)).normalized())
    out = []
    N = None
    for i, T in enumerate(tans):
        if N is None:
            h = Vector(up_hint(i) if callable(up_hint) else up_hint)
            N = (h - T * h.dot(T)).normalized()
        else:
            N = (N - T * N.dot(T)).normalized()
            if callable(up_hint):  # re-steer towards the hint
                h = Vector(up_hint(i))
                h = (h - T * h.dot(T)).normalized()
                N = (N * 0.4 + h * 0.6).normalized()
        B = T.cross(N)
        out.append((N, B, T))
    return out


def tube(pts, section, seg, up_hint=(1, 0, 0)):
    """Rings along a path. section(i, t, theta) -> (u, v): offsets along N, B."""
    fr = frames_along(pts, up_hint)
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        N, B, T = fr[i]
        t = i / (n - 1)
        ring = []
        for j in range(seg):
            th = 2 * math.pi * j / seg
            u, v = section(i, t, th)
            ring.append(Vector(p) + N * u + B * v)
        rings.append(ring)
    return rings, fr


def ellipse_section(rx, ry):
    return lambda i, t, th: (rx(t) * math.cos(th), ry(t) * math.sin(th))


def spline(ctrl, n):
    """Catmull-Rom through control points, n samples (inclusive ends)."""
    P = [Vector(c) for c in ctrl]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    segs = len(ctrl) - 1
    out = []
    for k in range(n):
        u = k / (n - 1) * segs
        s = min(int(u), segs - 1)
        t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        t2, t3 = t * t, t * t * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


# ----------------------------------------------------------------------------
# body design (Blender units before the final uniform scale; front = -Y, left = +X)
# ----------------------------------------------------------------------------

class Design:
    """All the numbers that differ between Juju and the neutral NPC base."""

    def __init__(self, kind):
        self.kind = kind
        juju = kind == "juju"
        self.HC = Vector((0.0, 0.0, 0.862))  # head centre
        self.HR = (0.128, 0.121, 0.142)
        # torso rings: z, rx, ry_front, ry_back, y_offset
        bust = 0.013 if juju else 0.006
        self.torso = [
            (0.40, 0.112 if juju else 0.100, 0.070, 0.078, 0.004),
            (0.44, 0.094 if juju else 0.090, 0.062, 0.066, 0.002),
            (0.475, 0.080 if juju else 0.084, 0.057, 0.058, 0.0),
            (0.505, 0.080 if juju else 0.085, 0.057, 0.056, 0.0),
            (0.535, 0.086 if juju else 0.088, 0.058 + bust * 0.6, 0.056, 0.0),
            (0.562, 0.094, 0.058 + bust, 0.057, 0.0),
            (0.588, 0.099, 0.058 + bust * 0.5, 0.057, 0.0),
            (0.612, 0.102, 0.054, 0.055, 0.0),
            (0.632, 0.090, 0.045, 0.049, 0.0),
            (0.647, 0.062, 0.038, 0.042, 0.0),
            (0.662, 0.042, 0.037, 0.039, 0.0),
            (0.70, 0.038, 0.034, 0.037, 0.0),
            (0.775, 0.035, 0.032, 0.035, 0.0),
        ]
        # skirt rings: z, rx, ry_front, ry_back, y_offset
        hip = 0.124 if juju else 0.110
        if juju:  # pale denim maxi, softly fitted over the hips, a little flare at the hem
            self.skirt = [
                (0.492, 0.086, 0.063, 0.063, 0.0),
                (0.462, 0.095, 0.067, 0.070, 0.001),
                (0.425, 0.112, 0.074, 0.080, 0.003),
                (0.385, hip, 0.078, 0.088, 0.005),
                (0.345, hip + 0.003, 0.081, 0.090, 0.005),
                (0.285, hip + 0.005, 0.086, 0.090, 0.004),
                (0.205, hip + 0.012, 0.095, 0.095, 0.002),
                (0.135, hip + 0.020, 0.105, 0.101, 0.0),
                (0.092, hip + 0.026, 0.111, 0.105, 0.0),
            ]
        else:  # knee-length A-line
            self.skirt = [
                (0.492, 0.088, 0.063, 0.063, 0.0),
                (0.455, 0.097, 0.068, 0.070, 0.0),
                (0.41, hip, 0.076, 0.082, 0.002),
                (0.35, hip + 0.012, 0.084, 0.090, 0.002),
                (0.27, hip + 0.024, 0.094, 0.098, 0.0),
                (0.205, hip + 0.034, 0.104, 0.106, 0.0),
            ]
        self.pelvis = [
            (0.33, 0.070, 0.050, 0.055, 0.0),
            (0.355, 0.108 if juju else 0.100, 0.070, 0.080, 0.004),
            (0.39, hip - 0.004, 0.074, 0.084, 0.005),
            (0.43, 0.108 if juju else 0.100, 0.070, 0.074, 0.003),
            (0.465, 0.090 if juju else 0.090, 0.063, 0.064, 0.0),
            (0.494, 0.086, 0.062, 0.062, 0.0),
        ]
        self.thigh_r = 0.060 if juju else 0.054
        # joints
        self.shoulder = Vector((0.098, 0.0, 0.606))
        self.elbow = Vector((0.140, 0.006, 0.478))
        self.wrist = Vector((0.162, -0.002, 0.367))
        self.hand_tip = Vector((0.168, -0.010, 0.312))
        self.hip_j = Vector((0.056, 0.0, 0.36))
        self.knee = Vector((0.056, -0.004, 0.20))
        self.ankle = Vector((0.056, 0.004, 0.062))
        self.toe = Vector((0.056, -0.062, 0.016))
        if kind == "male":
            # a boyish build on the same rig: no bust, straighter waist, broader
            # chest / shoulders, narrower hips
            ts = {0.40: 0.098, 0.44: 0.094, 0.475: 0.092, 0.505: 0.094, 0.535: 0.099,
                  0.562: 0.106, 0.588: 0.112, 0.612: 0.115, 0.632: 0.100}
            self.torso = [(z, ts.get(z, rx), yf if z < 0.53 else min(yf, 0.060), yb, yo)
                          for (z, rx, yf, yb, yo) in self.torso]
            self.pelvis = [(z, rx * 0.97 if z > 0.34 else rx, yf, yb, yo) for (z, rx, yf, yb, yo) in self.pelvis]
            self.thigh_r = 0.056
            self.shoulder = Vector((0.110, 0.0, 0.606))
            self.elbow = Vector((0.152, 0.006, 0.478))
            self.wrist = Vector((0.172, -0.002, 0.367))
            self.hand_tip = Vector((0.178, -0.010, 0.312))


def torso_ring_point(row, th):
    rx, ryf, ryb, yo = row
    s = math.sin(th)
    return Vector((rx * math.cos(th), yo + (ryb if s > 0 else ryf) * s, 0))


def profile_point(table, z, th, grow=0.0):
    row = hermite_table(table, z)
    p = torso_ring_point(row, th)
    if grow:
        # grow along the ellipse normal (approx.)
        rx, ryf, ryb, yo = row
        ry = ryb if math.sin(th) > 0 else ryf
        nx, ny = math.cos(th) / max(rx, 1e-4), math.sin(th) / max(ry, 1e-4)
        ln = math.hypot(nx, ny)
        p.x += nx / ln * grow
        p.y += ny / ln * grow
    p.z = z
    return p


def ring_angles(seg):
    return [2 * math.pi * j / seg for j in range(seg)]


# ----------------------------------------------------------------------------
# parts
# ----------------------------------------------------------------------------

def head_point(D, lat, lon, pad=0.0):
    """lon: 0 = +X (her left), -pi/2 = front (-Y)."""
    rx, ry, rz = D.HR
    rx += pad
    ry += pad
    rz += pad
    cl, sl = math.cos(lat), math.sin(lat)
    x = rx * cl * math.cos(lon)
    y = ry * cl * math.sin(lon)
    z = rz * sl
    if sl < 0:  # soft jaw: narrower towards the chin
        s = -sl
        x *= 1 - 0.24 * s * s
        if y < 0:
            y *= 1 - 0.16 * s * s
        else:
            y *= 1 - 0.28 * s * s
    if y > 0:
        y *= 1.06  # fuller back of the head
    # round cheeks
    fd = math.degrees(lon)
    for side in (-1, 1):
        g = math.exp(-(((fd - (-90 + side * 48)) / 22) ** 2)) * math.exp(-(((math.degrees(lat) + 22) / 18) ** 2))
        x += side * 0.006 * g
        y -= 0.005 * g
    return D.HC + Vector((x, y, z))


def build_head(D):
    P = Part()
    seg, nlat = 24, 15
    rings = []
    for i in range(1, nlat):
        lat = -math.pi / 2 + math.pi * i / nlat
        rings.append([head_point(D, lat, 2 * math.pi * j / seg) for j in range(seg)])
    bottom = head_point(D, -math.pi / 2 + 1e-4, 0)
    top = head_point(D, math.pi / 2 - 1e-4, 0)

    def col(p, i, j):
        # a touch darker under the jaw, warm blush baked lightly (the decal adds the rest)
        d = p - D.HC
        c = 1.0 - 0.08 * smoothstep(-0.06, -0.14, d.z) * smoothstep(-0.02, 0.05, d.y + 0.02)
        return (c, c * 0.98, c * 0.97)

    P.grid(rings, closed=True, col=col, tag=T_HEAD, cap0=bottom, cap1=top)
    return P, rings


FACE_W = 0.24  # face texture covers a 0.24 x 0.24 window in front of the head


def build_face_decal(D, head_rings):
    """A shell over the front of the head (same vertices, pushed out 1.2 mm) with
    planar UVs into the painted face texture."""
    P = Part()
    P.uv = []
    fz0 = D.HC.z - 0.13
    seg = len(head_rings[0])
    keep = {}

    def inside(p):
        d = p - D.HC
        return d.y < -0.03 and abs(d.x) < 0.108 and -0.125 < d.z < 0.075

    rx, ry, rz = D.HR
    for i in range(len(head_rings) - 1):
        for j in range(seg):
            q = [head_rings[i][j], head_rings[i][(j + 1) % seg], head_rings[i + 1][(j + 1) % seg], head_rings[i + 1][j]]
            if not all(inside(p) for p in q):
                continue
            ids = []
            for k, p in enumerate(q):
                key = (i + (1 if k >= 2 else 0), (j + (1 if k in (1, 2) else 0)) % seg)
                if key not in keep:
                    d = p - D.HC
                    nrm = Vector((d.x / rx ** 2, d.y / ry ** 2, d.z / rz ** 2)).normalized()
                    pp = p + nrm * 0.0012
                    keep[key] = P.vert(pp, (1, 1, 1), T_HEAD)
                    P.uv.append(((p.x + FACE_W / 2) / FACE_W, (p.z - fz0) / FACE_W))
                ids.append(keep[key])
            P.f.append(tuple(ids))
    return P


def build_body(D):
    """Skin: neck + upper chest (under the top) and both arms with mitten hands."""
    P = Part()
    seg = 18
    zs = [0.535, 0.562, 0.588, 0.612, 0.632, 0.647, 0.662, 0.70, 0.74, 0.775]
    rings = [[profile_point(D.torso, z, th) for th in ring_angles(seg)] for z in zs]

    def col(p, i, j):
        c = 1.0 - 0.07 * smoothstep(0.66, 0.72, p.z) * smoothstep(0.0, 0.04, -p.y + 0.01)  # under-chin shade
        return (c, c * 0.985, c * 0.975)

    P.grid(rings, closed=True, col=col, tag=T_BODY, cap1=Vector((0, 0.0, 0.79)))
    for side in (1, -1):
        P.extend(build_arm(D, side))
    return P


def arm_path(D, side, start_inset=0.022):
    s = Vector((side, 1, 1))
    sh = D.shoulder * 1
    sh.x *= side
    el = D.elbow.copy()
    el.x *= side
    wr = D.wrist.copy()
    wr.x *= side
    start = sh + (Vector((-side, 0, 0.35)).normalized() * start_inset)
    return start, sh, el, wr, s


def build_arm(D, side, grow=0.0, to_wrist=False, tag=None):
    tag = tag if tag is not None else (T_ARM_L if side > 0 else T_ARM_R)
    start, sh, el, wr, _ = arm_path(D, side)
    tip = D.hand_tip.copy()
    tip.x *= side
    upper = spline([start, sh, sh.lerp(el, 0.5), el, el.lerp(wr, 0.5), wr], 9)
    pts = upper
    radii = [0.029, 0.034, 0.033, 0.031, 0.028, 0.0265, 0.025, 0.023, 0.021]
    ry = list(radii)
    if not to_wrist:
        # mitten hand: flattened (thin across X, wide front-back), then a round tip
        hand = [wr.lerp(tip, t) for t in (0.18, 0.45, 0.72, 0.9)]
        pts = upper + hand
        radii = radii + [0.0145, 0.0155, 0.0145, 0.011]
        ry = ry + [0.023, 0.027, 0.026, 0.019]
    n = len(pts)
    section = lambda i, t, th: ((radii[i] + grow) * math.cos(th), (ry[i] + grow) * math.sin(th))
    # N ~ world X (so the mitten is thin across X)
    rings, fr = tube(pts, section, 10, up_hint=(side, 0, 0))
    P = Part()
    cap1 = None
    if not to_wrist:
        cap1 = pts[-1] + fr[-1][2] * 0.011
    P.grid(rings, closed=True, col=(1, 1, 1), tag=tag, cap0=pts[0] - fr[0][2] * 0.006, cap1=cap1)
    if not to_wrist:
        # thumb: a small nub pointing forward/down
        b = wr.lerp(tip, 0.25) + Vector((-side * 0.004, -0.016, 0.0))
        e = b + Vector((-side * 0.003, -0.009, -0.016))
        tp = [b, b.lerp(e, 0.5), e]
        tr = [0.0072, 0.0068, 0.0055]
        rings2, fr2 = tube(tp, lambda i, t, th: (tr[i] * math.cos(th), tr[i] * math.sin(th)), 6, up_hint=(1, 0, 0))
        P.grid(rings2, closed=True, col=(0.97, 0.95, 0.94), tag=tag, cap0=tp[0] - fr2[0][2] * 0.004, cap1=tp[-1] + fr2[-1][2] * 0.006)
    return P


def build_top(D, frills=True):
    """Cream top: a shell over the torso from the waist to a soft scoop neckline."""
    P = Part()
    seg = 20
    juju = D.kind == "juju"

    def neckline(th):
        s, c = math.sin(th), math.cos(th)
        if s < 0:  # front scoop
            return 0.592 + 0.036 * c * c if juju else 0.622 + 0.012 * c * c
        return 0.618 + 0.012 * c * c

    rings = []
    ns = 10
    for i in range(ns + 1):
        t = i / ns
        ring = []
        for th in ring_angles(seg):
            z = lerp(0.455, neckline(th), t)
            ring.append(profile_point(D.torso, z, th, grow=0.0035))
        rings.append(ring)

    def col(p, i, j):
        # soft fold shading under the bust and at the sides
        c = 1.0 - 0.06 * math.exp(-(((p.z - 0.528) / 0.018) ** 2)) * smoothstep(0.02, 0.06, -p.y) - 0.04 * smoothstep(0.07, 0.1, abs(p.x))
        return (c, c, c * 0.99)

    P.grid(rings, closed=True, col=col, tag=T_BODY)
    return P


def build_frills(D):
    """Puff sleeves with ruffled edges + a ruffle hem at the waist (Juju's top)."""
    P = Part()
    # ruffle hem (peplum) over the skirt waistband
    seg = 40
    rings = []
    for k, (z, grow, amp) in enumerate([(0.496, 0.0085, 0.0), (0.478, 0.0125, 0.003), (0.458, 0.02, 0.0065), (0.447, 0.024, 0.0085)]):
        ring = []
        for th in ring_angles(seg):
            p = profile_point(D.torso, z, th, grow=grow + amp * math.sin(th * 12))
            p.z = z + 0.003 * math.cos(th * 12) * (k / 3)
            ring.append(p)
        rings.append(ring)
    col = lambda p, i, j: (lambda c: (c, c, c * 0.99))(0.93 + 0.07 * (0.5 + 0.5 * math.sin(math.atan2(p.y, p.x) * 12)) if i >= 2 else 0.96)
    P.grid(rings, closed=True, col=col, tag=T_BODY)
    for side in (1, -1):
        P.extend(build_sleeve(D, side))
    return P


def build_sleeve(D, side, ruffle=True):
    tag = T_ARM_L if side > 0 else T_ARM_R
    start, sh, el, wr, _ = arm_path(D, side)
    top = sh + Vector((-side * 0.012, 0, 0.02))
    pts = spline([top, sh, sh.lerp(el, 0.28), sh.lerp(el, 0.5)], 6)
    base_r = [0.026, 0.043, 0.046, 0.045, 0.042, 0.039] if ruffle else [0.026, 0.041, 0.040, 0.039, 0.038, 0.037]
    rings, fr = tube(pts, lambda i, t, th: (base_r[i] * math.cos(th), base_r[i] * 0.95 * math.sin(th)), 14, up_hint=(side, 0, 0))
    P = Part()
    col = lambda p, i, j: (0.97, 0.97, 0.96) if i < 5 else (0.93, 0.93, 0.92)
    if ruffle:
        # flared, wavy edge
        N, B, T = fr[-1]
        c = pts[-1] + T * 0.012
        ring = []
        for j in range(14):
            th = 2 * math.pi * j / 14
            r = 0.046 + 0.004 * math.sin(th * 5)
            ring.append(c + N * r * math.cos(th) + B * r * 0.95 * math.sin(th))
        rings.append(ring)
        col = lambda p, i, j: (0.97, 0.97, 0.96) if i < 5 else (0.9 + 0.08 * (j % 2), 0.9 + 0.08 * (j % 2), 0.89 + 0.08 * (j % 2))
    P.grid(rings, closed=True, col=col, tag=tag, cap0=pts[0] - fr[0][2] * 0.008)
    return P


def build_skirt(D):
    P = Part()
    seg = 24
    zs = [r[0] for r in D.skirt]
    zs = sorted(set(zs + [lerp(zs[i], zs[i + 1], 0.5) for i in range(len(zs) - 1) if zs[i + 1] - zs[i] > 0.05]))
    zs = zs[::-1]  # top -> hem
    rings = [[profile_point(D.skirt, z, th) for th in ring_angles(seg)] for z in zs]
    # rings go downward: reverse the angular order so normals face out
    rings = [list(reversed(r)) for r in rings]
    hem = zs[-1]
    # turned-up hem (inner fold) so the edge has thickness
    inner = [Vector((p.x * 0.955, p.y * 0.955, p.z + 0.012)) for p in rings[-1]]
    rings.append([Vector((p.x * 0.985, p.y * 0.985, p.z - 0.004)) for p in rings[-1]])
    rings.append(inner)
    juju = D.kind == "juju"

    def col(p, i, j):
        th = math.atan2(p.y, p.x)
        c = 1.0
        c -= 0.07 * math.exp(-((abs(math.cos(th)) - 1) / 0.08) ** 2)  # side seams
        c -= 0.07 * smoothstep(0.475, 0.49, p.z)  # waistband
        c -= 0.05 * smoothstep(0.02, 0.0, p.z - hem - 0.012)  # hem
        if juju:
            c += 0.03 * math.exp(-(((math.degrees(th) + 90) % 360 - 180 + 180 - 0) / 60) ** 2) * 0  # (kept simple)
            c -= 0.04 * smoothstep(0.3, 0.2, p.z) * (0.5 + 0.5 * math.sin(th * 3 + p.z * 40)) * 0.6  # soft denim creases
        return (c, c, c)

    P.grid(rings, closed=True, col=col, tag=T_SKIRT)
    return P


def build_legs(D, top_z=0.245):
    """Bare lower legs (under a skirt)."""
    P = Part()
    for side in (1, -1):
        tag = T_LEG_L if side > 0 else T_LEG_R
        x = D.hip_j.x * side
        zs = [top_z, 0.20, 0.155, 0.115, 0.08, 0.06, 0.035]
        rs = [0.037, 0.035, 0.037, 0.031, 0.024, 0.022, 0.021]
        keep = [k for k, z in enumerate(zs) if z <= top_z + 1e-6]
        zs = [zs[k] for k in keep]
        rs = [rs[k] for k in keep]
        pts = [Vector((x, lerp(0.0, 0.004, clamp((top_z - z) / top_z)), z)) for z in zs]
        rings, fr = tube(pts, lambda i, t, th: (rs[i] * math.cos(th), rs[i] * 0.95 * math.sin(th)), 10, up_hint=(1, 0, 0))
        P.grid(rings, closed=True, col=(1, 0.985, 0.975), tag=tag, cap0=pts[0] + Vector((0, 0, 0.01)))
    return P


def build_jeans(D):
    """Pelvis + full legs (jeans / trousers)."""
    P = Part()
    seg = 20
    zs = [0.33, 0.345, 0.365, 0.39, 0.43, 0.465, 0.494]
    rings = [[profile_point(D.pelvis, z, th, grow=0.003) for th in ring_angles(seg)] for z in zs]
    col = lambda p, i, j: (lambda c: (c, c, c))(1.0 - 0.08 * smoothstep(0.478, 0.49, p.z))
    P.grid(rings, closed=True, col=col, tag=T_PELVIS, cap0=Vector((0, 0.003, 0.325)))
    for side in (1, -1):
        tag = T_LEG_L if side > 0 else T_LEG_R
        x = D.hip_j.x * side
        zs = [0.43, 0.38, 0.33, 0.27, 0.20, 0.14, 0.09, 0.055]
        tr = D.thigh_r
        rs = [tr - 0.004, tr, tr + 0.002, tr - 0.008, 0.041, 0.038, 0.036, 0.037]
        xs = [x * 0.8, x, x * 1.02, x * 1.02, x, x, x, x]
        pts = [Vector((xs[k], lerp(0.0, 0.004, clamp((0.36 - z) / 0.3)), z)) for k, z in enumerate(zs)]

        def c2(p, i, j):
            c = 1.0 - 0.07 * (1 if i == len(zs) - 1 else 0) - 0.04 * smoothstep(0.2, 0.26, p.z) * 0
            return (c, c, c)

        rings, fr = tube(pts, lambda i, t, th: (rs[i] * math.cos(th), rs[i] * 0.94 * math.sin(th)), 12, up_hint=(1, 0, 0))
        P.grid(rings, closed=True, col=c2, tag=tag, cap0=pts[0] + Vector((0, 0, 0.012)), cap1=pts[-1] + Vector((0, 0, -0.004)))
    return P


def build_cardigan(D):
    """Open-front cardigan with long sleeves (outer layer, olw_outer)."""
    P = Part()
    seg = 24
    table = [
        (0.395, 0.128, 0.084, 0.094, 0.004),
        (0.43, 0.116, 0.078, 0.082, 0.003),
        (0.47, 0.100, 0.072, 0.070, 0.0),
    ] + [(r[0], r[1] + 0.009, r[2] + 0.008, r[3] + 0.008, r[4]) for r in D.torso if 0.5 <= r[0] <= 0.64]
    table.append((0.655, 0.072, 0.050, 0.052, 0.0))
    zs = [0.395, 0.42, 0.45, 0.48, 0.51, 0.54, 0.565, 0.59, 0.612, 0.632, 0.648]
    rings = []
    for z in zs:
        ring = []
        for th in ring_angles(seg):
            ring.append(profile_point(table, z, th))
        rings.append(ring)
    # open front: drop the quads in a V around the front centre
    Pt = Part()
    Pt.grid(rings, closed=True, col=(1, 1, 1), tag=T_BODY)
    n = seg
    keep_faces = []
    for fi, f in enumerate(Pt.f):
        c = sum((Pt.v[k] for k in f), Vector()) / 4
        th = math.atan2(c.y, c.x)
        front = -math.sin(th)
        half = lerp(0.022, 0.05, smoothstep(0.62, 0.50, c.z)) if c.z < 0.63 else 0.0
        if front > 0 and abs(c.x) < half:
            continue
        keep_faces.append(f)
    Pt.f = keep_faces

    def col(p):
        c = 1.0 - 0.06 * smoothstep(0.41, 0.395, p.z) - 0.05 * smoothstep(0.0, 0.02, -p.y) * smoothstep(0.06, 0.02, abs(p.x))
        return (c, c, c)

    Pt.col = [col(p) for p in Pt.v]
    P.extend(Pt)
    for side in (1, -1):
        tag = T_ARM_L if side > 0 else T_ARM_R
        start, sh, el, wr, _ = arm_path(D, side)
        top = sh + Vector((-side * 0.01, 0, 0.022))
        pts = spline([top, sh, sh.lerp(el, 0.5), el, el.lerp(wr, 0.5), wr + (wr - el).normalized() * 0.006], 9)
        rr = [0.029, 0.045, 0.044, 0.041, 0.038, 0.036, 0.034, 0.034, 0.033]
        rings, fr = tube(pts, lambda i, t, th: (rr[i] * math.cos(th), rr[i] * 0.95 * math.sin(th)), 12, up_hint=(side, 0, 0))
        cc = lambda p, i, j: (0.9, 0.9, 0.9) if i >= 7 else (1, 1, 1)
        P.grid(rings, closed=True, col=cc, tag=tag, cap0=pts[0] - fr[0][2] * 0.008)
    return P


def build_shoes(D):
    """Rounded white sneakers: D-shaped sections lofted heel -> toe, darker sole band."""
    P = Part()
    for side in (1, -1):
        tag = T_SHOE_L if side > 0 else T_SHOE_R
        x0 = D.hip_j.x * side
        # (y, half width, height) heel -> toe
        rows = [(0.040, 0.016, 0.040), (0.034, 0.024, 0.052), (0.015, 0.028, 0.056), (-0.012, 0.030, 0.046), (-0.040, 0.031, 0.038), (-0.062, 0.028, 0.032), (-0.076, 0.021, 0.026), (-0.083, 0.011, 0.018)]
        sole = 0.011
        rings = []
        cols = []
        for (y, w, h) in rows:
            ring = []
            pts2 = []
            # flat bottom (4 pts) then up the side + arc over the top (CCW seen from the toe => -Y)
            pts2.append((-w * 0.75, 0.0))
            pts2.append((0.0, 0.0))
            pts2.append((w * 0.75, 0.0))
            pts2.append((w, sole * 0.5))
            pts2.append((w * 1.0, sole))
            for k in range(1, 8):
                a = math.pi * k / 8
                pts2.append((w * math.cos(a), sole + (h - sole) * math.sin(a)))
            pts2.append((-w, sole))
            pts2.append((-w, sole * 0.5))
            for (u, v) in pts2:
                ring.append(Vector((x0 + u, y, v)))
            rings.append(ring)
        # rings go toward -Y; points were listed counter-clockwise seen from +Y... flip for outward normals
        rings = [list(reversed(r)) for r in rings]

        def col(p, i, j):
            if p.z < sole + 1e-4:
                return (0.80, 0.78, 0.76)
            if p.z > 0.042 and p.y > -0.01:  # collar / tongue
                return (0.9, 0.9, 0.9)
            if p.y < -0.06:
                return (0.96, 0.96, 0.95)
            return (1.0, 1.0, 1.0)

        heel = Vector((x0, 0.043, 0.02))
        toe = Vector((x0, -0.086, 0.01))
        P.grid(rings, closed=True, col=col, tag=tag, cap0=heel, cap1=toe)
    return P


# ---------------------------------------------------------------- hair ------

def cap_rings(D, hairline, seg=24, nr=8, pad=(0.011, 0.014, 0.020), center_off=(0, 0.006, 0.010), part=True, bumps=0.0):
    """Hair cap: an ellipsoid shell from a per-longitude hairline latitude up to the
    crown, so the hairline edge is a clean curve (no stair steps)."""
    rx, ry, rz = D.HR
    rx, ry, rz = rx + pad[0], ry + pad[1], rz + pad[2]
    C = D.HC + Vector(center_off)
    rings = []
    for i in range(nr):
        ring = []
        for j in range(seg):
            lon = 2 * math.pi * j / seg
            f = abs(((math.degrees(lon) + 90 + 180) % 360) - 180)  # 0 = front, 180 = back
            lat0 = math.radians(hairline(f))
            t = i / nr
            lat = lerp(lat0, math.pi / 2, t ** 1.1)
            cl, sl = math.cos(lat), math.sin(lat)
            x = rx * cl * math.cos(lon)
            y = ry * cl * math.sin(lon)
            z = rz * sl
            if y > 0:
                y *= 1.05
            p = C + Vector((x, y, z))
            d = (p - C)
            if part and z > 0.03 and y < 0.075:
                # centre parting groove + a soft lobe of hair either side
                w = smoothstep(0.03, 0.08, z)
                g = math.exp(-((x / 0.011) ** 2))
                lobe = math.exp(-(((abs(x) - 0.048) / 0.03) ** 2))
                p = p + d.normalized() * (w * (-0.010 * g + 0.006 * lobe))
            if bumps:
                p = p + d.normalized() * bumps * (0.5 + 0.5 * math.sin(lon * 7 + i * 1.7) * math.sin(lat * 9 + j))
            ring.append(p)
        rings.append(ring)
    top = C + Vector((0, 0, rz - (0.008 if part else 0.0)))
    return rings, top, C


def hair_col_fn(D, root=0.62, tip=1.0, z_root=0.95, z_tip=0.5, part_dark=True):
    """Two-tone hair: darker roots, lighter (chestnut) lengths."""

    def col(p, i=0, j=0):
        t = smoothstep(z_root, z_tip, p.z)
        c = lerp(root, tip, t)
        r, g, b = c, c * (0.97 - 0.03 * t), c * (0.94 - 0.1 * t)
        if part_dark and abs(p.x) < 0.006 and p.z > D.HC.z + 0.06 and p.y < 0.07:
            r, g, b = r * 0.8, g * 0.8, b * 0.8
        return (r, g, b)

    return col


def solidify(obj, thickness, offset=-1.0):
    m = obj.modifiers.new("solidify", "SOLIDIFY")
    m.thickness = thickness
    m.offset = offset
    m.use_rim = True
    m.use_even_offset = True
    m.use_quality_normals = True
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=m.name)


def juju_hairline(f):
    # face opening: forehead (no fringe), temples, then down behind the ears
    pts = [(0, 30), (25, 27), (45, 18), (62, 2), (78, -22), (92, -42), (180, -42)]
    for k in range(len(pts) - 1):
        (a, la), (b, lb) = pts[k], pts[k + 1]
        if a <= f <= b:
            return lerp(la, lb, smoothstep(a, b, f) * 0.5 + (f - a) / (b - a) * 0.5)
    return pts[-1][1]


def build_hair_juju(D):
    """Very long, softly wavy dark-brown hair with a centre parting, no fringe:
    cap + two face-framing front curtains + a long wavy back mass to mid-back +
    a few loose clumps; roots darker, chestnut ends."""
    col = hair_col_fn(D, root=0.60, tip=1.0, z_root=0.95, z_tip=0.46)
    parts = []
    # --- cap (solidified later as its own object, then merged)
    rings, top, C = cap_rings(D, juju_hairline, seg=24, nr=7)
    cap = Part()
    cap.grid(rings, closed=True, col=lambda p, i, j: col(p), tag=T_HAIR_CAP, cap1=top)
    parts.append(("cap", cap, 0.013))

    # --- back mass: crescent sections from inside the cap down to mid-back
    back = Part()
    table = [
        # z, yc, Rx, Ry, half-angle(deg), thickness
        (0.945, 0.004, 0.118, 0.118, 118, 0.028),
        (0.87, 0.012, 0.146, 0.140, 116, 0.030),
        (0.79, 0.030, 0.152, 0.128, 108, 0.034),
        (0.715, 0.040, 0.150, 0.090, 98, 0.032),
        (0.645, 0.040, 0.144, 0.070, 90, 0.028),
        (0.575, 0.040, 0.132, 0.062, 84, 0.026),
        (0.51, 0.044, 0.118, 0.058, 82, 0.024),
        (0.462, 0.050, 0.102, 0.054, 80, 0.020),
    ]
    na = 16  # points across the arc (outer); inner goes back the other way
    zs = []
    for k in range(len(table) - 1):
        zs += [lerp(table[k][0], table[k + 1][0], t) for t in (0.0, 0.5)]
    zs.append(table[-1][0])
    brings = []
    for zi, z in enumerate(zs):
        yc, Rx, Ry, ha, th = hermite_table([(r[0],) + r[1:] for r in table[::-1]], z)
        ha = math.radians(ha)
        wave = 0.010 * math.sin(z * 34.0)  # soft S-waves down the length
        ring = []
        last = zi == len(zs) - 1
        for k in range(na):
            a = -ha + 2 * ha * k / (na - 1)
            lock = 1 + 0.07 * (0.5 + 0.5 * math.cos(a * 9 + z * 6)) * smoothstep(0.9, 0.75, z)
            x = Rx * math.sin(a) * lock + wave * math.cos(a)
            y = yc + Ry * math.cos(a) * lock
            zz = z - (0.03 * (0.5 + 0.5 * math.cos(a * 9 + 1.3)) if last else 0.0)
            ring.append(Vector((x, y, zz)))
        for k in range(na - 1, -1, -1):
            a = -ha + 2 * ha * k / (na - 1)
            t2 = th * (0.4 if last else 1.0)
            x = (Rx - t2) * math.sin(a) + wave * math.cos(a)
            y = yc + (Ry - t2) * math.cos(a)
            zz = z - (0.03 * (0.5 + 0.5 * math.cos(a * 9 + 1.3)) if last else 0.0) + (0.006 if last else 0)
            ring.append(Vector((x, y, zz)))
        brings.append(ring)
    # rings go downward; ring order (outer left->right as a goes -ha..ha: x from - to +... ) fix orientation below
    brings = [list(reversed(r)) for r in brings]

    def bcol(p, i, j):
        r, g, b = col(p)
        # lock definition: valleys between locks a bit darker
        a = math.atan2(p.x, p.y - 0.03)
        v = 0.9 + 0.1 * (0.5 + 0.5 * math.cos(a * 9 + p.z * 6))
        return (r * v, g * v, b * v)

    back.grid(brings, closed=True, col=bcol, tag=T_HAIR_BACK, cap1=None)
    # close the bottom tips: fan per ring to its centroid
    last = brings[-1]
    cen = sum(last, Vector()) / len(last)
    cen.z -= 0.01
    base = len(back.v) - len(last)
    ci = back.vert(cen, col(cen), T_HAIR_BACK)
    for k in range(len(last)):
        back.f.append((ci, base + k, base + (k + 1) % len(last)))
    parts.append(("back", back, 0.0))

    # --- front curtains framing the face, from the parting down over the chest
    for side in (1, -1):
        tag = T_HAIR_FL if side > 0 else T_HAIR_FR
        ctrl = [
            (0.016, -0.094, 0.972),
            (0.062, -0.116, 0.950),
            (0.112, -0.108, 0.892),
            (0.136, -0.082, 0.808),
            (0.140, -0.070, 0.730),
            (0.126, -0.070, 0.655),
            (0.108, -0.074, 0.600),
            (0.096, -0.076, 0.548),
        ]
        ctrl = [Vector((side * c[0], c[1], c[2])) for c in ctrl]
        pts = spline(ctrl, 12)
        n = len(pts)

        def up(i, pts=pts):
            p = pts[i]
            out = Vector((p.x, p.y + 0.01, 0)).normalized()  # radial outward (horizontal)
            return out

        def section(i, t, th, side=side):
            w = 0.022 + 0.018 * math.sin(math.pi * min(1.0, t * 1.4)) - 0.012 * smoothstep(0.75, 1.0, t)
            w = max(0.006, w)
            thick = max(0.004, 0.012 * (1 - 0.6 * smoothstep(0.7, 1.0, t)))
            wave = 0.006 * math.sin(t * 13.0)
            # N = outward (thickness), B = across the strand (width)
            return (thick * math.cos(th) + wave, w * math.sin(th))

        rings, fr = tube(pts, section, 8, up_hint=up)
        fp = Part()
        fp.grid(rings, closed=True, col=lambda p, i, j: col(p), tag=tag, cap0=pts[0] - fr[0][2] * 0.004, cap1=pts[-1] + fr[-1][2] * 0.008)
        parts.append(("front", fp, 0.0))

    # --- loose wavy clumps (break up the silhouette beside the shoulders / at the tips)
    clumps = [
        [(0.128, 0.045, 0.80), (0.150, 0.050, 0.70), (0.140, 0.056, 0.60), (0.126, 0.062, 0.52), (0.116, 0.066, 0.47)],
        [(-0.128, 0.045, 0.80), (-0.152, 0.052, 0.70), (-0.142, 0.058, 0.61), (-0.128, 0.064, 0.53), (-0.118, 0.07, 0.475)],
    ]
    for ci_, ctrl in enumerate(clumps):
        pts = spline([Vector(c) for c in ctrl], 10)
        r0 = 0.024 if ci_ < 2 else 0.02

        def sec(i, t, th, r0=r0):
            r = r0 * (1 - 0.75 * smoothstep(0.55, 1.0, t)) * (1 + 0.12 * math.sin(t * 16))
            return (r * math.cos(th), r * 0.7 * math.sin(th))

        rings, fr = tube(pts, sec, 8, up_hint=(0, 1, 0))
        cp = Part()
        cp.grid(rings, closed=True, col=lambda p, i, j: col(p), tag=T_HAIR_BACK, cap0=pts[0] - fr[0][2] * 0.004, cap1=pts[-1] + fr[-1][2] * 0.006)
        parts.append(("clump", cp, 0.0))
    return parts


def build_hair_npc(D, style):
    """Simpler hair variants for NPCs (one mesh per style, toggled by visibility)."""
    col = hair_col_fn(D, root=0.72, tip=1.0, z_root=0.97, z_tip=0.6)
    parts = []
    if style == "short":
        hl = lambda f: lerp(34, -8, smoothstep(0, 85, f)) if f < 90 else lerp(-8, -26, smoothstep(90, 180, f))
        rings, top, C = cap_rings(D, hl, seg=24, nr=7, pad=(0.009, 0.012, 0.016), part=False)
        p = Part()
        p.grid(rings, closed=True, col=lambda q, i, j: col(q), tag=T_HAIR_CAP, cap1=top)
        parts.append(("cap", p, 0.012))
        return parts
    if style == "curly":
        hl = lambda f: lerp(30, -20, smoothstep(0, 85, f)) if f < 90 else -30
        rings, top, C = cap_rings(D, hl, seg=28, nr=8, pad=(0.03, 0.03, 0.03), part=False, bumps=0.012)
        p = Part()
        p.grid(rings, closed=True, col=lambda q, i, j: col(q), tag=T_HAIR_CAP, cap1=top)
        parts.append(("cap", p, 0.02))
        return parts
    hl = lambda f: juju_hairline(f) if style != "bob" else (lerp(30, -10, smoothstep(0, 80, f)) if f < 90 else -44)
    rings, top, C = cap_rings(D, hl, seg=24, nr=7, part=style in ("long", "bob"))
    p = Part()
    p.grid(rings, closed=True, col=lambda q, i, j: col(q), tag=T_HAIR_CAP, cap1=top)
    parts.append(("cap", p, 0.012))
    if style in ("long", "bob"):
        end = 0.56 if style == "long" else 0.745
        table = [
            (0.94, 0.004, 0.12, 0.118, 116, 0.028),
            (0.86, 0.012, 0.146, 0.140, 114, 0.03),
            (0.78, 0.03, 0.150, 0.126, 106, 0.032),
            (0.70, 0.046, 0.148, 0.098, 96, 0.032),
            (0.62, 0.052, 0.142, 0.08, 90, 0.03),
            (0.56, 0.054, 0.132, 0.074, 86, 0.026),
        ]
        if style == "bob":
            table = [(0.94, 0.004, 0.12, 0.118, 116, 0.03), (0.86, 0.012, 0.15, 0.142, 122, 0.03), (0.80, 0.02, 0.156, 0.136, 124, 0.03), (0.745, 0.024, 0.15, 0.13, 124, 0.024)]
        zs = [r[0] for r in table if r[0] >= end - 1e-6]
        brings = []
        na = 16
        for zi, z in enumerate(zs):
            yc, Rx, Ry, ha, th = hermite_table([(r[0],) + r[1:] for r in table[::-1]], z)
            ha = math.radians(ha)
            ring = []
            for k in range(na):
                a = -ha + 2 * ha * k / (na - 1)
                ring.append(Vector((Rx * math.sin(a), yc + Ry * math.cos(a), z)))
            for k in range(na - 1, -1, -1):
                a = -ha + 2 * ha * k / (na - 1)
                ring.append(Vector(((Rx - th) * math.sin(a), yc + (Ry - th) * math.cos(a), z + (0.004 if zi == len(zs) - 1 else 0))))
            brings.append(list(reversed(ring)))
        bp = Part()
        bp.grid(brings, closed=True, col=lambda q, i, j: col(q), tag=T_HAIR_BACK)
        last = brings[-1]
        cen = sum(last, Vector()) / len(last)
        base = len(bp.v) - len(last)
        ci = bp.vert(cen, col(cen), T_HAIR_BACK)
        for k in range(len(last)):
            bp.f.append((ci, base + k, base + (k + 1) % len(last)))
        parts.append(("back", bp, 0.0))
    if style == "bun":
        c = D.HC + Vector((0, 0.07, 0.15))
        rings = []
        for i in range(1, 7):
            lat = -math.pi / 2 + math.pi * i / 7
            rings.append([c + Vector((0.058 * math.cos(lat) * math.cos(a), 0.052 * math.cos(lat) * math.sin(a), 0.05 * math.sin(lat))) for a in ring_angles(12)])
        bp = Part()
        bp.grid(rings, closed=True, col=lambda q, i, j: col(q), tag=T_HAIR_CAP, cap0=c + Vector((0, 0, -0.05)), cap1=c + Vector((0, 0, 0.05)))
        parts.append(("bun", bp, 0.0))
    if style == "ponytail":
        pts = spline([D.HC + Vector((0, 0.14, 0.06)), D.HC + Vector((0, 0.185, 0.02)), D.HC + Vector((0, 0.19, -0.08)), D.HC + Vector((0, 0.17, -0.2)), D.HC + Vector((0, 0.16, -0.27))], 10)

        def sec(i, t, th):
            r = 0.03 * (0.7 + 0.6 * math.sin(math.pi * min(1, t * 1.3))) * (1 - 0.8 * smoothstep(0.7, 1, t))
            return (r * math.cos(th), r * math.sin(th))

        rings, fr = tube(pts, sec, 10, up_hint=(1, 0, 0))
        bp = Part()
        bp.grid(rings, closed=True, col=lambda q, i, j: col(q), tag=T_TAIL, cap0=pts[0] - fr[0][2] * 0.01, cap1=pts[-1] + fr[-1][2] * 0.01)
        parts.append(("tail", bp, 0.0))
    return parts


def build_jewelry(D, clip=True):
    """Thin pearl choker + a beaded strand; optional orange flower claw clip."""
    P = Part()
    # choker: beads around the neck
    zc = 0.672
    for k in range(16):
        a = 2 * math.pi * k / 16
        if math.sin(a) > 0.55:  # hidden under the hair at the back
            continue
        row = hermite_table(D.torso, zc)
        p = torso_ring_point(row, a)
        p = Vector((p.x * 1.08, p.y * 1.08, zc - 0.004 * (1 - abs(math.cos(a)))))
        bead(P, p, 0.0048, (1.0, 0.97, 0.9))
    # beaded strand: a lower V on the chest
    for k in range(17):
        a = -math.pi / 2 + (k - 8) / 8 * 1.05
        drop = 0.028 * (1 - abs((k - 8) / 8)) ** 1.2
        z = 0.655 - drop
        p = profile_point(D.torso, z, a, grow=0.0035)
        bead(P, p, 0.0032, (0.22, 0.28, 0.66) if k % 2 else (0.85, 0.8, 0.7))
    return P


def bead(P, c, r, col):
    base = len(P.v)
    # octahedron-ish bead (6 verts, 8 tris)
    for d in ((r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)):
        P.vert(c + Vector(d), col, T_BODY)
    X, x, Y, y, Z, z = range(base, base + 6)
    P.f += [(X, Y, Z), (Y, x, Z), (x, y, Z), (y, X, Z), (Y, X, z), (x, Y, z), (y, x, z), (X, y, z)]


def build_clip(D):
    """Orange flower claw clip (photo 5), on the back-right of the head."""
    P = Part()
    c = D.HC + Vector((-0.072, 0.142, 0.012))
    nrm = Vector((-0.45, 1.0, 0.15)).normalized()
    u = nrm.cross(Vector((0, 0, 1))).normalized()
    v = nrm.cross(u).normalized()
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        pc = c + (u * math.cos(a) + v * math.sin(a)) * 0.017 + nrm * 0.004
        rings = []
        for i in range(1, 4):
            lat = -math.pi / 2 + math.pi * i / 4
            ring = []
            for b in ring_angles(6):
                d = (u * math.cos(a) + v * math.sin(a)) * 0.014 * math.cos(lat) * math.cos(b) + (u * -math.sin(a) + v * math.cos(a)) * 0.010 * math.cos(lat) * math.sin(b) + nrm * 0.006 * math.sin(lat)
                ring.append(pc + d)
            rings.append(ring)
        P.grid(rings, closed=True, col=(1.0, 0.56, 0.2), tag=T_HEAD, cap0=pc - nrm * 0.006, cap1=pc + nrm * 0.006)
    bead(P, c + nrm * 0.011, 0.006, (1.0, 0.8, 0.35))
    return P


# ----------------------------------------------------------------------------
# face texture (numpy SDF painter, 256 px, transparent background)
# ----------------------------------------------------------------------------

def paint_face(D, size=256, npc=False, male=False):
    fz0 = D.HC.z - 0.13
    px = FACE_W / size
    ii, jj = np.meshgrid(np.arange(size), np.arange(size))  # jj: rows bottom->top (Blender pixel order)
    X = -FACE_W / 2 + (ii + 0.5) * px
    Z = fz0 + (jj + 0.5) * px - D.HC.z  # relative to head centre
    rgba = np.zeros((size, size, 4), np.float64)

    def over(color, alpha):
        a = np.clip(alpha, 0, 1)[..., None]
        c = np.array(color, np.float64)[None, None, :]
        src = np.concatenate([np.broadcast_to(c, rgba.shape[:2] + (3,)), a], axis=2)
        out_a = src[..., 3:4] + rgba[..., 3:4] * (1 - src[..., 3:4])
        out_c = (src[..., :3] * src[..., 3:4] + rgba[..., :3] * rgba[..., 3:4] * (1 - src[..., 3:4])) / np.maximum(out_a, 1e-6)
        rgba[..., :3] = out_c
        rgba[..., 3:4] = out_a

    aa = lambda sdf: np.clip(0.5 - sdf / (px * 1.1), 0, 1)

    def ellipse_sdf(cx, cz, rx, rz, rot=0.0):
        x, z = X - cx, Z - cz
        if rot:
            c, s = math.cos(rot), math.sin(rot)
            x, z = x * c + z * s, -x * s + z * c
        k = np.sqrt((x / rx) ** 2 + (z / rz) ** 2)
        return (k - 1) * min(rx, rz)

    def stroke_sdf(pts, w0, w1):
        """distance to a polyline minus a width tapering w0 -> w1."""
        best = np.full(X.shape, 1e9)
        total = sum((Vector(pts[k + 1]) - Vector(pts[k])).length for k in range(len(pts) - 1))
        acc = 0.0
        for k in range(len(pts) - 1):
            ax, az = pts[k]
            bx, bz = pts[k + 1]
            dx, dz = bx - ax, bz - az
            L2 = dx * dx + dz * dz
            t = np.clip(((X - ax) * dx + (Z - az) * dz) / L2, 0, 1)
            d = np.hypot(X - (ax + t * dx), Z - (az + t * dz))
            L = math.sqrt(L2)
            u = (acc + t * L) / total
            w = w0 + (w1 - w0) * u
            best = np.minimum(best, d - w)
            acc += L
        return best

    def curve(p0, p1, p2, n=12):
        return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in np.linspace(0, 1, n)]

    # blush: soft round glow on the cheeks
    for s in (-1, 1):
        d2 = ((X - s * 0.074) / 0.026) ** 2 + ((Z + 0.052) / 0.017) ** 2
        over((0.93, 0.45, 0.45), 0.42 * np.exp(-d2 * 1.4))

    ex, ez = 0.047, -0.010  # eye centres
    ew, eh = 0.0165, 0.0205  # eye half sizes
    iris = (0.30, 0.17, 0.10) if not npc else (0.22, 0.14, 0.10)
    for s in (-1, 1):
        cx = s * ex
        eye = ellipse_sdf(cx, ez, ew, eh)
        # upper lid cuts a gentle arc off the top
        lid_z = ez + eh * 0.72 - 0.004 * ((X - cx) / ew) ** 2
        opening = np.maximum(eye, Z - lid_z)
        over((1.0, 0.98, 0.96), aa(opening))  # sclera (only peeks at the sides)
        ir = np.maximum(ellipse_sdf(cx + s * 0.0005, ez - 0.001, ew * 0.8, eh * 0.92), opening)
        # iris gradient: darker at the top
        tgrad = np.clip((Z - (ez - eh)) / (2 * eh), 0, 1)[..., None]
        base = np.array(iris)[None, None, :] * (1.15 - 0.55 * tgrad)
        a = aa(ir)
        rgba[..., :3] = rgba[..., :3] * (1 - a[..., None]) + base * a[..., None]
        rgba[..., 3] = np.maximum(rgba[..., 3], a)
        over((0.08, 0.04, 0.03), aa(np.maximum(ellipse_sdf(cx, ez - 0.002, ew * 0.38, eh * 0.46), opening)))  # pupil
        # warm lower iris glint
        over((0.62, 0.38, 0.22), 0.55 * aa(np.maximum(ellipse_sdf(cx + s * 0.002, ez - eh * 0.55, ew * 0.45, eh * 0.18), ir)))
        # highlights
        over((1, 1, 1), aa(ellipse_sdf(cx - 0.0055, ez + 0.0075, 0.0052, 0.0058)))
        over((1, 1, 1), 0.9 * aa(ellipse_sdf(cx + 0.006, ez - 0.0085, 0.0024, 0.0024)))
        # upper lid line with a little flick of lashes at the outer corner
        lid = [(cx - s * ew * 1.02, ez + eh * 0.2)] + [(cx + s * ew * u, ez + eh * 0.72 - 0.004 * u * u + eh * 0.28 * (1 - u * u)) for u in np.linspace(-0.85, 0.95, 9)] + [(cx + s * (ew * 1.25), ez + eh * 0.62)]
        lash_w = (0.0009 if male else 0.0012) if npc else 0.0019
        over((0.12, 0.06, 0.05), aa(stroke_sdf(lid, 0.0008, lash_w)))
        if not npc:
            for k, (dx, dz) in enumerate([(1.3, 0.85), (1.12, 1.05)]):
                lx = cx + s * ew * dx
                over((0.12, 0.06, 0.05), aa(stroke_sdf([(cx + s * ew * (dx - 0.32), ez + eh * (dz - 0.35)), (lx, ez + eh * dz)], 0.0009, 0.0003)))
        # soft lower lash line
        over((0.45, 0.25, 0.2), 0.35 * aa(stroke_sdf(curve((cx - s * ew * 0.6, ez - eh * 0.82), (cx, ez - eh * 1.05), (cx + s * ew * 0.75, ez - eh * 0.75)), 0.0005, 0.0005)))
        # brows: soft, full, gently arched, dark brown
        bz = ez + 0.043
        brow = curve((cx - s * 0.020, bz - 0.004), (cx + s * 0.002, bz + 0.0055), (cx + s * 0.024, bz - 0.0035))
        over((0.20, 0.12, 0.09), 0.92 * aa(stroke_sdf(brow, 0.0038 if not npc else 0.0032, 0.0014)))
    # nose: a small soft shadow + a hint of the tip
    over((0.62, 0.36, 0.28), 0.45 * aa(stroke_sdf(curve((-0.0075, -0.040), (0.0, -0.0465), (0.0075, -0.040)), 0.0011, 0.0011)))
    over((0.62, 0.36, 0.28), 0.18 * aa(ellipse_sdf(0.0, -0.036, 0.006, 0.006)))
    # mouth: full-lipped soft smile
    mz = -0.071
    upper = curve((-0.0175, mz + 0.002), (0.0, mz - 0.0035), (0.0175, mz + 0.002), 16)
    lower = curve((-0.0155, mz + 0.0005), (0.0, mz - 0.0125), (0.0155, mz + 0.0005), 16)
    lip_region = np.maximum(-stroke_sdf(upper, 0, 0) * 0 + (np.interp(X, [p[0] for p in upper], [p[1] for p in upper]) - Z) * -1, 0)
    # lower lip fill: between the smile line and the lower curve
    zu = np.interp(X, [p[0] for p in upper], [p[1] for p in upper], left=9, right=9)
    zl = np.interp(X, [p[0] for p in lower], [p[1] for p in lower], left=9, right=9)
    lsdf = np.maximum(Z - zu, zl - Z)
    lsdf = np.where(np.abs(X) < 0.0155, lsdf, 1)
    lip_col = (0.84, 0.42, 0.44) if not npc else ((0.72, 0.47, 0.42) if male else (0.78, 0.46, 0.44))
    over(lip_col, 0.95 * aa(lsdf * 0.5 + 0.0002))
    # upper lip: thin cupid's bow above the line
    ub = curve((-0.0165, mz + 0.0022), (0.0, mz + 0.0035), (0.0165, mz + 0.0022), 12)
    zb = np.interp(X, [p[0] for p in ub], [p[1] for p in ub], left=-9, right=-9)
    zb = zb + 0.0012 * np.exp(-((np.abs(X) - 0.0045) / 0.003) ** 2)
    usdf = np.maximum(zu - Z, Z - zb)
    usdf = np.where(np.abs(X) < 0.0165, usdf, 1)
    over(tuple(c * 0.92 for c in lip_col), 0.9 * aa(usdf * 0.5))
    # smile line + dimple-y corners
    over((0.55, 0.22, 0.25), aa(stroke_sdf([(-0.0195, mz + 0.0038)] + upper + [(0.0195, mz + 0.0038)], 0.0009, 0.0009)))
    # lower-lip highlight
    over((1.0, 0.85, 0.85), 0.35 * aa(ellipse_sdf(0.002, mz - 0.0072, 0.005, 0.0016)))
    del lip_region
    return rgba


def face_image(name, rgba, path):
    size = rgba.shape[0]
    img = bpy.data.images.new(name, size, size, alpha=True)
    # store straight (non-premultiplied) sRGB values
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


# ----------------------------------------------------------------------------
# Blender objects, materials
# ----------------------------------------------------------------------------

SLOT_PREVIEW = {
    "olw_skin": (0.86, 0.62, 0.48),
    "olw_hair": (0.30, 0.17, 0.10),
    "olw_top": (0.95, 0.92, 0.86),
    "olw_outer": (0.86, 0.58, 0.62),
    "olw_bottom": (0.62, 0.74, 0.86),
    "olw_shoes": (0.96, 0.95, 0.93),
    "olw_face": (1, 1, 1),
    "olw_accent": (1, 1, 1),
}


def get_material(slot, image=None):
    m = bpy.data.materials.get(slot)
    if m:
        return m
    m = bpy.data.materials.new(slot)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Base Color"].default_value = (*SLOT_PREVIEW[slot], 1)
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.interpolation = "Linear"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.blend_method = "BLEND"
        m.surface_render_method = "BLENDED"
    else:
        ca = nt.nodes.new("ShaderNodeVertexColor")
        ca.layer_name = "Color"
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        mul.inputs[6].default_value = (*SLOT_PREVIEW[slot], 1)
        nt.links.new(ca.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    return m


def make_object(name, part, slot, image=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in part.v], [], part.f)
    me.validate(clean_customdata=False)
    me.update()
    ca = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    for i, c in enumerate(part.col):
        ca.data[i].color = (c[0], c[1], c[2], 1.0)
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = 0
    tg = me.attributes.new("olw_tag", "INT", "POINT")
    tg.data.foreach_set("value", part.tag)
    if part.uv is not None:
        uvl = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uvl.data[li].uv = part.uv[vi]
    me.materials.append(get_material(slot, image))
    if part.uv is None:  # consistent outward normals (the face decal is built outward already)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def join_objects(objs, name):
    """Join objects (all share one material slot) into one."""
    if len(objs) == 1:
        objs[0].name = name
        objs[0].data.name = name
        return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs, object=objs[0]):
        bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    ob.data.name = name
    return ob


def hair_object(name, parts):
    objs = []
    for k, (pname, part, thick) in enumerate(parts):
        ob = make_object(f"{name}_{pname}{k}", part, "olw_hair")
        if thick:
            solidify(ob, thick)
        objs.append(ob)
    return join_objects(objs, name)


# ----------------------------------------------------------------------------
# armature + weights
# ----------------------------------------------------------------------------

def bone_table(D):
    sh, el, wr, tip = D.shoulder, D.elbow, D.wrist, D.hand_tip
    hj, kn, an, to = D.hip_j, D.knee, D.ankle, D.toe
    B = {
        "root": (None, (0, 0, 0), (0, 0, 0.08)),
        "hips": ("root", (0, 0, 0.40), (0, 0, 0.47)),
        "spine": ("hips", (0, 0, 0.47), (0, 0, 0.548)),
        "chest": ("spine", (0, 0, 0.548), (0, 0, 0.638)),
        "neck": ("chest", (0, 0, 0.638), (0, 0, 0.725)),
        "head": ("neck", (0, 0, 0.725), (0, 0, 0.98)),
        "hair_back1": ("head", (0, 0.10, 0.84), (0, 0.075, 0.66)),
        "hair_back2": ("hair_back1", (0, 0.075, 0.66), (0, 0.07, 0.46)),
        "hair_front.L": ("head", (0.13, -0.08, 0.80), (0.10, -0.075, 0.55)),
        "hair_front.R": ("head", (-0.13, -0.08, 0.80), (-0.10, -0.075, 0.55)),
        "tail": ("head", (0, 0.18, 0.88), (0, 0.16, 0.60)),
    }
    for s, sx in ((".L", 1), (".R", -1)):
        m = lambda v: (v[0] * sx, v[1], v[2])
        B["upperarm" + s] = ("chest", m(sh), m(el))
        B["forearm" + s] = ("upperarm" + s, m(el), m(wr))
        B["hand" + s] = ("forearm" + s, m(wr), m(tip))
        B["thigh" + s] = ("hips", m(hj), m(kn))
        B["shin" + s] = ("thigh" + s, m(kn), m(an))
        B["foot" + s] = ("shin" + s, m(an), m(to))
    return B


BONE_ORDER = [
    "root", "hips", "spine", "chest", "neck", "head", "hair_back1", "hair_back2", "hair_front.L", "hair_front.R", "tail",
    "upperarm.L", "forearm.L", "hand.L", "upperarm.R", "forearm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R",
]


def build_armature(D, scale):
    arm = bpy.data.armatures.new("rig")
    ob = bpy.data.objects.new("rig", arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    B = bone_table(D)
    for name in BONE_ORDER:
        parent, h, t = B[name]
        eb = arm.edit_bones.new(name)
        eb.head = Vector(h) * scale
        eb.tail = Vector(t) * scale
        # consistent roll: local X ~ world +X for every bone (sagittal swings = local X)
        eb.align_roll(Vector((0, -1, 0)) if abs(Vector(t).z - Vector(h).z) > 0.3 * (Vector(t) - Vector(h)).length else Vector((0, 0, 1)))
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = False
        eb.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def chain_weights(z, x):
    """hips/spine/chest/neck/head by height, blended across the joints."""
    J = [(0.47, 0.03), (0.548, 0.028), (0.638, 0.022), (0.725, 0.03)]
    names = ["hips", "spine", "chest", "neck", "head"]
    ts = [smoothstep(j - h, j + h, z) for j, h in J]
    w = {}
    prev = 1.0
    for k, n in enumerate(names):
        nxt = ts[k] if k < len(ts) else 0.0
        v = prev - nxt
        if v > 1e-4:
            w[n] = v
        prev = nxt
    return w


def compute_weights(D, p, tag):
    """p in design units. Returns {bone: weight}."""
    side = ".L" if p.x >= 0 else ".R"
    w = {}
    if tag in (T_HEAD, T_HAIR_CAP):
        return {"head": 1.0}
    if tag == T_BODY:
        w = chain_weights(p.z, p.x)
        # shoulders follow the arm a little
        sx = abs(p.x)
        k = 0.45 * smoothstep(0.07, 0.1, sx) * smoothstep(0.56, 0.6, p.z) * (1 - smoothstep(0.64, 0.66, p.z))
        if k > 0:
            for n in list(w):
                w[n] *= 1 - k
            w["upperarm" + side] = w.get("upperarm" + side, 0) + k
        return w
    if tag in (T_ARM_L, T_ARM_R):
        side = ".L" if tag == T_ARM_L else ".R"
        sx = 1 if tag == T_ARM_L else -1
        m = lambda v: Vector((v.x * sx, v.y, v.z))
        segs = {
            "upperarm" + side: (m(D.shoulder), m(D.elbow)),
            "forearm" + side: (m(D.elbow), m(D.wrist)),
            "hand" + side: (m(D.wrist), m(D.hand_tip)),
        }
        ds = {}
        for n, (a, b) in segs.items():
            d, t = seg_dist(p, a, b)
            ds[n] = d
        # joint blends by projection along the arm
        _, tu = seg_dist(p, m(D.shoulder), m(D.elbow))
        _, tf = seg_dist(p, m(D.elbow), m(D.wrist))
        up_len = (D.elbow - D.shoulder).length
        fo_len = (D.wrist - D.elbow).length
        # distance past the elbow along the forearm
        e_blend = smoothstep(-0.018, 0.018, (p - m(D.elbow)).dot((m(D.wrist) - m(D.elbow)).normalized()))
        w_blend = smoothstep(-0.006, 0.01, (p - m(D.wrist)).dot((m(D.hand_tip) - m(D.wrist)).normalized()))
        w["upperarm" + side] = 1 - e_blend
        w["forearm" + side] = e_blend * (1 - w_blend)
        w["hand" + side] = e_blend * w_blend
        # root of the arm (inside the shoulder): some chest
        s_along = (p - m(D.shoulder)).dot((m(D.elbow) - m(D.shoulder)).normalized())
        kc = smoothstep(0.01, -0.02, s_along) * 0.6
        if kc > 0:
            for n in list(w):
                w[n] *= 1 - kc
            w["chest"] = kc
        return w
    if tag in (T_LEG_L, T_LEG_R):
        side = ".L" if tag == T_LEG_L else ".R"
        k_th = smoothstep(D.knee.z - 0.03, D.knee.z + 0.03, p.z)
        k_ft = smoothstep(D.ankle.z + 0.012, D.ankle.z - 0.012, p.z)
        k_hp = smoothstep(0.37, 0.43, p.z)
        w["thigh" + side] = k_th * (1 - k_hp)
        w["hips"] = k_th * k_hp
        w["shin" + side] = (1 - k_th) * (1 - k_ft)
        w["foot" + side] = (1 - k_th) * k_ft
        return w
    if tag in (T_SHOE_L, T_SHOE_R):
        side = ".L" if tag == T_SHOE_L else ".R"
        k = smoothstep(0.042, 0.075, p.z) * smoothstep(-0.03, 0.0, p.y)
        return {"foot" + side: 1 - k, "shin" + side: k}
    if tag == T_PELVIS:
        k = 0.8 * smoothstep(0.40, 0.33, p.z)
        sd = smoothstep(-0.045, 0.045, p.x)
        w = chain_weights(p.z, p.x)
        for n in list(w):
            w[n] *= 1 - k
        w["thigh.L"] = k * sd
        w["thigh.R"] = k * (1 - sd)
        return w
    if tag == T_SKIRT:
        s = smoothstep(0.41, 0.13, p.z)
        sd = smoothstep(-0.09, 0.09, p.x)
        w = chain_weights(p.z, p.x)
        for n in list(w):
            w[n] *= 1 - s
        sh = 0.25 * s * s + 0.35 * smoothstep(0.24, 0.10, p.z)
        w["thigh.L"] = s * sd * (1 - sh)
        w["shin.L"] = s * sd * sh
        w["thigh.R"] = s * (1 - sd) * (1 - sh)
        w["shin.R"] = s * (1 - sd) * sh
        return w
    if tag == T_HAIR_BACK:
        t1 = smoothstep(0.84, 0.70, p.z)
        t2 = smoothstep(0.64, 0.50, p.z)
        return {"head": 1 - t1, "hair_back1": t1 * (1 - t2), "hair_back2": t1 * t2}
    if tag in (T_HAIR_FL, T_HAIR_FR):
        n = "hair_front.L" if tag == T_HAIR_FL else "hair_front.R"
        t = smoothstep(0.80, 0.66, p.z)
        return {"head": 1 - t, n: t}
    if tag == T_TAIL:
        t = smoothstep(0.93, 0.8, p.z)
        return {"head": 1 - t, "tail": t}
    return {"hips": 1.0}


def skin_object(D, ob, rig, scale):
    me = ob.data
    tags = [0] * len(me.vertices)
    me.attributes["olw_tag"].data.foreach_get("value", tags)
    groups = {}
    for i, v in enumerate(me.vertices):
        p = v.co / scale
        w = compute_weights(D, p, tags[i])
        items = sorted(((b, x) for b, x in w.items() if x > 0.01), key=lambda q: -q[1])[:4]
        tot = sum(x for _, x in items) or 1.0
        for b, x in items:
            if b not in groups:
                groups[b] = ob.vertex_groups.new(name=b)
            groups[b].add([i], x / tot, "REPLACE")
    me.attributes.remove(me.attributes["olw_tag"])
    mod = ob.modifiers.new("rig", "ARMATURE")
    mod.object = rig
    ob.parent = rig


# ----------------------------------------------------------------------------
# animation
# ----------------------------------------------------------------------------

class Poser:
    """Keys pose-bone rotations given as world-axis Euler angles (degrees) in the
    bone's rest frame (x: pitch, + = backward swing; y: roll about the forward
    axis; z: yaw about up), plus armature-space translations."""

    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.to_quaternion() for b in rig.data.bones}

    def q(self, bone, rx=0.0, ry=0.0, rz=0.0):
        B = self.rest[bone]
        Rw = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_quaternion()
        return B.inverted() @ Rw @ B

    def begin(self, name):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        self.rig.animation_data_create()
        self.rig.animation_data.action = act
        self.act = act
        self.prevq = {}
        return act

    def key(self, frame, bone, rot=(0, 0, 0), loc=None):
        pb = self.rig.pose.bones[bone]
        pb.rotation_mode = "QUATERNION"
        q = self.q(bone, *rot)
        pq = self.prevq.get(bone)
        if pq is not None and pq.dot(q) < 0:
            q = -q
        self.prevq[bone] = q
        pb.rotation_quaternion = q
        pb.keyframe_insert("rotation_quaternion", frame=frame, group=bone)
        if loc is not None:
            B = self.rest[bone]
            pb.location = B.inverted() @ Vector(loc)
            pb.keyframe_insert("location", frame=frame, group=bone)

    def end(self, linear=False, cyclic=True):
        for fc in self.act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR" if linear else "BEZIER"
                if not linear:
                    kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
        ad = self.rig.animation_data
        tr = ad.nla_tracks.new()
        tr.name = self.act.name
        st = tr.strips.new(self.act.name, int(self.act.frame_range[0]), self.act)
        st.name = self.act.name
        ad.action = None
        for pb in self.rig.pose.bones:
            pb.rotation_quaternion = Quaternion()
            pb.location = Vector()


def ik2(hip, target, l1, l2):
    """Sagittal 2-bone IK. Returns (thigh pitch, knee flexion) in degrees using
    the Poser convention (+ = foot moves backward / +Y)."""
    dy = target.y - hip.y
    dz = target.z - hip.z
    d = min(math.hypot(dy, dz), (l1 + l2) * 0.9995)
    alpha = math.atan2(dy, -dz)
    cb = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)
    cg = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1)
    beta = math.acos(cb)
    gamma = math.acos(cg)
    return math.degrees(alpha - beta), math.degrees(math.pi - gamma)


def build_idle(P, S):
    P.begin("idle")
    n = 48
    for f in range(0, n + 1, 4):
        u = 2 * math.pi * f / n
        br = math.sin(u)  # breathing
        sway = math.sin(u + 0.6)
        P.key(f, "hips", (0, 0, 1.5 * sway), loc=(0.0035 * S * sway, 0, 0.0015 * S * br))
        P.key(f, "spine", (-0.6 * br, 0, -0.8 * sway))
        P.key(f, "chest", (-1.2 * br, 0.8 * sway, 0))
        P.key(f, "neck", (0.4 * br, 0, 0))
        P.key(f, "head", (1.5 * math.sin(u * 1 + 1.2), -2.5 * math.sin(u + 2.0), 1.5 * math.sin(u + 0.3)))
        for s, sx in ((".L", 1), (".R", -1)):
            P.key(f, "upperarm" + s, (2 * math.sin(u + (0 if sx > 0 else 1.3)), sx * (-3 - 1.5 * br), 0))
            P.key(f, "forearm" + s, (-8 - 2 * br, 0, 0))
            P.key(f, "hand" + s, (-4, 0, 0))
            P.key(f, "thigh" + s, (0, 0, 0))
            P.key(f, "shin" + s, (0, 0, 0))
            P.key(f, "foot" + s, (0, 0, 0))
        P.key(f, "hair_back1", (-2.0 * math.sin(u + 0.8), 0, 1.2 * math.sin(u + 1.4)))
        P.key(f, "hair_back2", (-2.5 * math.sin(u + 1.6), 0, 1.5 * math.sin(u + 2.2)))
        P.key(f, "hair_front.L", (-1.5 * math.sin(u + 1.0), -1.0 * math.sin(u + 0.4), 0))
        P.key(f, "hair_front.R", (-1.5 * math.sin(u + 1.3), 1.0 * math.sin(u + 0.7), 0))
        P.key(f, "tail", (-3 * math.sin(u + 1.0), 0, 3 * math.sin(u + 0.2)))
    P.end()


def build_walk(P, D, S):
    """In-place walk, 24 frames = 1 loop = two steps. Feet planted on the ground
    move back in a straight line (step length WALK_STEP each), solved with IK."""
    P.begin("walk")
    n = 24
    L = WALK_STEP  # per step; stride per loop = 2L
    l1 = (D.knee - D.hip_j).length
    l2 = (D.ankle - D.knee).length
    leg_len = 0.985 * (l1 + l2)
    for f in range(n + 1):
        ph = f / n
        # hip height from the stance leg (pendulum bounce), lowest at contact
        def foot(phase):
            phase %= 1.0
            if phase < 0.5:  # stance: front -> back
                t = phase / 0.5
                return Vector((0, -L / 2 + L * t, D.ankle.z)), True, t
            t = (phase - 0.5) / 0.5
            e = t * t * (3 - 2 * t)
            lift = 0.042 * math.sin(math.pi * t) ** 1.2
            return Vector((0, L / 2 - L * e, D.ankle.z + lift)), False, t

        fl, stl, tl = foot(ph)
        fr, str_, tr = foot(ph + 0.5)
        stance = fl if stl else fr
        h = math.sqrt(max(0.0, leg_len ** 2 - stance.y ** 2))
        hip_z = D.ankle.z + h
        dz = hip_z - D.hip_j.z
        yaw = 5.0 * math.cos(2 * math.pi * ph)  # left hip forward at contact
        roll = 2.0 * math.sin(4 * math.pi * ph)
        P.key(f, "hips", (0, roll * 0.5, yaw), loc=(0.004 * S * math.sin(2 * math.pi * ph), 0, dz * S))
        P.key(f, "spine", (-3.0, 0, -yaw * 0.6))
        P.key(f, "chest", (-2.0 + 1.5 * math.cos(4 * math.pi * ph), 0, -yaw * 0.9))
        P.key(f, "neck", (1.0, 0, yaw * 0.5))
        P.key(f, "head", (2.0 - 1.5 * math.cos(4 * math.pi * ph), 0, yaw * 0.4))
        for s, sx, ft, st, tt in ((".L", 1, fl, stl, tl), (".R", -1, fr, str_, tr)):
            hip = Vector((0, 0, D.hip_j.z + dz))
            th, kn = ik2(hip, ft, l1, l2)
            if st:
                fa = -(th + kn)  # foot flat on the ground
                if tt > 0.75:  # heel lifts before toe-off
                    fa += 18 * smoothstep(0.75, 1.0, tt)
            else:
                fa = -(th + kn) + 22 * math.sin(math.pi * min(1, tt * 1.3)) - 8 * smoothstep(0.8, 1.0, tt)
            P.key(f, "thigh" + s, (th, 0, 0))
            P.key(f, "shin" + s, (kn, 0, 0))
            P.key(f, "foot" + s, (fa, 0, 0))
            # arms swing opposite to the legs
            sw = 22.0 * math.cos(2 * math.pi * ph) * sx  # L arm back when the L leg is forward
            P.key(f, "upperarm" + s, (sw, sx * -5.0, 0))
            P.key(f, "forearm" + s, (-14 - 10 * max(0.0, -sw / 22.0), 0, 0))
            P.key(f, "hand" + s, (-6, 0, 0))
        # hair lags the bounce
        b = math.cos(4 * math.pi * ph - 1.2)
        P.key(f, "hair_back1", (4.0 + 2.0 * b, 0, -yaw * 0.4))
        P.key(f, "hair_back2", (5.0 + 3.0 * math.cos(4 * math.pi * ph - 2.0), 0, -yaw * 0.6))
        P.key(f, "hair_front.L", (2.5 + 1.5 * b, 0, 0))
        P.key(f, "hair_front.R", (2.5 + 1.5 * b, 0, 0))
        P.key(f, "tail", (8 + 4 * b, 0, -yaw))
    P.end(linear=True)


def build_run(P, D, S):
    """In-place run (the player's normal speed): 16 frames = 1 loop = two steps
    with a short flight phase. Stance feet slide back in a straight line on the
    ground at constant speed, so syncing the playback rate to the ground speed
    (loop length = RUN_REACH / RUN_STANCE) gives planted feet."""
    P.begin("run")
    n = RUN_FRAMES
    loop = RUN_REACH / RUN_STANCE
    l1 = (D.knee - D.hip_j).length
    l2 = (D.ankle - D.knee).length
    leg_len = 0.955 * (l1 + l2)

    def foot(phase):
        phase %= 1.0
        if phase < RUN_STANCE:  # stance: front -> back at ground speed
            t = phase / RUN_STANCE
            return Vector((0, -RUN_REACH / 2 + RUN_REACH * t, D.ankle.z)), True, t
        t = (phase - RUN_STANCE) / (1 - RUN_STANCE)
        e = t * t * (3 - 2 * t)
        # heel kicks up and back first, then the foot reaches forward
        lift = 0.07 * math.sin(math.pi * t) ** 1.4
        back = 0.025 * math.sin(math.pi * min(1.0, t * 1.6))
        return Vector((0, RUN_REACH / 2 - RUN_REACH * e + back, D.ankle.z + lift)), False, t

    for f in range(n + 1):
        ph = f / n
        fl, stl, tl = foot(ph)
        fr, str_, tr = foot(ph + 0.5)
        # hip height: compressed through stance, lifted in flight
        if stl or str_:
            st_foot = fl if stl else fr
            ts = tl if stl else tr
            h = math.sqrt(max(0.0, leg_len ** 2 - st_foot.y ** 2)) - 0.016 * math.sin(math.pi * ts)
        else:
            tf = ((ph % 0.5) - RUN_STANCE) / (0.5 - RUN_STANCE)
            h = math.sqrt(max(0.0, leg_len ** 2 - (RUN_REACH / 2) ** 2)) + 0.034 * math.sin(math.pi * tf)
        hip_z = D.ankle.z + h
        dz = hip_z - D.hip_j.z
        yaw = 7.0 * math.cos(2 * math.pi * ph)
        roll = 2.5 * math.sin(4 * math.pi * ph)
        P.key(f, "hips", (4.0, roll * 0.5, yaw), loc=(0.003 * S * math.sin(2 * math.pi * ph), 0, dz * S))
        P.key(f, "spine", (4.0, 0, -yaw * 0.6))
        P.key(f, "chest", (3.0 + 1.5 * math.cos(4 * math.pi * ph), 0, -yaw * 1.0))
        P.key(f, "neck", (-4.0, 0, yaw * 0.5))
        P.key(f, "head", (-4.0 - 1.5 * math.cos(4 * math.pi * ph), 0, yaw * 0.45))
        for sn, sx, ft, st, tt in ((".L", 1, fl, stl, tl), (".R", -1, fr, str_, tr)):
            hip = Vector((0, 0, D.hip_j.z + dz))
            # the pelvis is pitched 4 deg forward; compensate so the solve stays in hip space
            th, kn = ik2(hip, ft, l1, l2)
            th -= 4.0
            if st:
                fa = -(th + 4.0 + kn)
                if tt > 0.6:
                    fa += 22 * smoothstep(0.6, 1.0, tt)
            else:
                fa = -(th + 4.0 + kn) + 26 * math.sin(math.pi * min(1, tt * 1.2)) - 10 * smoothstep(0.8, 1.0, tt)
            P.key(f, "thigh" + sn, (th, 0, 0))
            P.key(f, "shin" + sn, (kn, 0, 0))
            P.key(f, "foot" + sn, (fa, 0, 0))
            sw = 34.0 * math.cos(2 * math.pi * ph) * sx
            P.key(f, "upperarm" + sn, (sw - 6.0, sx * -8.0, 0))
            P.key(f, "forearm" + sn, (-55 - 15 * max(0.0, -sw / 34.0), 0, 0))
            P.key(f, "hand" + sn, (-10, 0, 0))
        b = math.cos(4 * math.pi * ph - 1.2)
        P.key(f, "hair_back1", (9.0 + 3.0 * b, 0, -yaw * 0.4))
        P.key(f, "hair_back2", (10.0 + 4.0 * math.cos(4 * math.pi * ph - 2.0), 0, -yaw * 0.6))
        P.key(f, "hair_front.L", (5.0 + 2.5 * b, 0, 0))
        P.key(f, "hair_front.R", (5.0 + 2.5 * b, 0, 0))
        P.key(f, "tail", (14 + 5 * b, 0, -yaw))
    P.end(linear=True)


def build_wave(P, S):
    """Raise the right hand and wave (30 frames)."""
    P.begin("wave")
    keys = [0, 5, 9, 13, 17, 21, 25, 30]
    raise_ = [0, 1, 1, 1, 1, 1, 0.9, 0]
    wv = [0, -1, 1, -1, 1, -1, 0, 0]
    for f, r, w in zip(keys, raise_, wv):
        P.key(f, "hips", (0, 0, 0), loc=(0, 0, 0))
        P.key(f, "spine", (0, 1.5 * r, 0))
        P.key(f, "chest", (-2 * r, 2.5 * r, 4 * r))
        P.key(f, "neck", (0, 0, 0))
        P.key(f, "head", (-3 * r, -6 * r, 5 * r))
        # right arm: raise out to the side, forearm up, hand swings side to side
        P.key(f, "upperarm.R", (-12 * r, 118 * r, 0))
        P.key(f, "forearm.R", (-20 * r, 38 * r + 16 * w * r, 0))
        P.key(f, "hand.R", (0, 10 * w * r, 0))
        P.key(f, "upperarm.L", (2 * r, 2 * r, 0))
        P.key(f, "forearm.L", (-10, 0, 0))
        P.key(f, "hair_back1", (2 * r, 0, -2 * r))
        P.key(f, "hair_front.R", (0, -3 * r, 0))
    P.end()


def build_nod(P, S):
    """A friendly nod (NPC talk), 20 frames."""
    P.begin("nod")
    for f, a in [(0, 0), (4, 11), (8, -2), (12, 8), (16, 0), (20, 0)]:
        P.key(f, "neck", (a * 0.4, 0, 0))
        P.key(f, "head", (a * 0.8, 0, a * 0.2))
        P.key(f, "chest", (a * 0.15, 0, 0))
        P.key(f, "hair_back1", (-a * 0.3, 0, 0))
    P.end()


# ----------------------------------------------------------------------------
# character assembly
# ----------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 0
    sc.frame_end = 48


def build_character(kind, tmpdir):
    reset_scene()
    D = Design(kind)
    juju = kind == "juju"
    objs = {}

    head, head_rings = build_head(D)
    body = build_body(D)
    skin = Part()
    skin.extend(head)
    skin.extend(body)
    objs["skin"] = make_object("skin", skin, "olw_skin")

    rgba = paint_face(D, npc=not juju, male=kind == "male")
    img = face_image(f"{kind}_face", rgba, os.path.join(tmpdir, f"{kind}_face.png"))
    objs["face"] = make_object("face", build_face_decal(D, head_rings), "olw_face", img)

    objs["top"] = make_object("top", build_top(D), "olw_top")
    if juju:
        objs["top_frills"] = make_object("top_frills", build_frills(D), "olw_top")
    else:
        sl = Part()
        for side in (1, -1):
            sl.extend(build_sleeve(D, side, ruffle=False))
        objs["top_frills"] = make_object("top_sleeves", sl, "olw_top")
    objs["skirt"] = make_object("skirt", build_skirt(D), "olw_bottom")
    objs["legs"] = make_object("legs", build_legs(D, top_z=0.15 if juju else 0.26), "olw_skin")
    objs["jeans"] = make_object("jeans", build_jeans(D), "olw_bottom")
    card = make_object("cardigan", build_cardigan(D), "olw_outer")
    solidify(card, 0.005, offset=-1)
    objs["cardigan"] = card
    objs["shoes"] = make_object("shoes", build_shoes(D), "olw_shoes")
    if juju:
        objs["hair"] = hair_object("hair", build_hair_juju(D))
        objs["jewelry"] = make_object("jewelry", build_jewelry(D), "olw_accent")
        objs["clip"] = make_object("clip", build_clip(D), "olw_accent")
    else:
        styles = ("short", "curly") if kind == "male" else ("long", "bob", "short", "bun", "ponytail", "curly")
        for style in styles:
            objs["hair_" + style] = hair_object("hair_" + style, build_hair_npc(D, style))

    # uniform scale to the target height (hair top), feet at 0
    top = max((ob.matrix_world @ v.co).z for ob in objs.values() for v in ob.data.vertices)
    scale = TARGET_HEIGHT / top if juju else TARGET_HEIGHT * 1.0 / top
    for ob in objs.values():
        me = ob.data
        me.transform(Matrix.Scale(scale, 4))
        me.update()
    rig = build_armature(D, scale)
    for ob in objs.values():
        skin_object(D, ob, rig, scale)

    P = Poser(rig)
    build_idle(P, scale)
    build_walk(P, D, scale)
    build_run(P, D, scale)
    build_wave(P, scale)
    build_nod(P, scale)

    tris = {k: sum(len(p.vertices) - 2 for p in ob.data.polygons) for k, ob in objs.items()}
    return rig, objs, tris, scale


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_reset_pose_bones=True,
        export_def_bones=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_extras=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )


# ----------------------------------------------------------------------------
# previews (Cycles CPU)
# ----------------------------------------------------------------------------

def render_previews(rig, objs, outdir, prefix, hide=()):
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.render.resolution_x = 420
    sc.render.resolution_y = 560
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.8, 0.85, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    sc.world = world
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = Euler((math.radians(50), 0, math.radians(-30)))
    sc.collection.objects.link(so)
    ground = bpy.data.meshes.new("g")
    ground.from_pydata([(-2, -2, 0), (2, -2, 0), (2, 2, 0), (-2, 2, 0)], [], [(0, 1, 2, 3)])
    go = bpy.data.objects.new("g", ground)
    sc.collection.objects.link(go)
    for k in hide:
        if k in objs:
            objs[k].hide_render = True
    cam = bpy.data.cameras.new("cam")
    cam.lens = 85
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    views = [("front", 0, 0.55, 0.62), ("34", 35, 0.55, 0.62), ("side", 90, 0.55, 0.62), ("back", 180, 0.55, 0.62), ("face", 15, 0.86, 0.3)]
    ad = rig.animation_data
    for name, yaw, tz, dist_k in views:
        d = 3.2 * dist_k / 0.62
        a = math.radians(yaw)
        pos = Vector((math.sin(a) * d, -math.cos(a) * d, tz + d * 0.18))
        co.location = pos
        look = Vector((0, 0, tz)) - pos
        co.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
        sc.frame_set(0)
        sc.render.filepath = os.path.join(outdir, f"{prefix}-{name}.png")
        bpy.ops.render.render(write_still=True)
    # animated frames (mute all tracks but one)
    for track, frame, yaw in (("walk", 3, 60), ("run", 2, 90), ("run", 6, 90), ("wave", 12, 20)):
        for tr in ad.nla_tracks:
            tr.mute = tr.name != track
        a = math.radians(yaw)
        d = 3.2
        pos = Vector((math.sin(a) * d, -math.cos(a) * d, 0.55 + d * 0.18))
        co.location = pos
        co.rotation_euler = (Vector((0, 0, 0.5)) - pos).to_track_quat("-Z", "Y").to_euler()
        sc.frame_set(frame)
        sc.render.filepath = os.path.join(outdir, f"{prefix}-{track}{frame}.png")
        bpy.ops.render.render(write_still=True)
    for tr in ad.nla_tracks:
        tr.mute = False


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["juju", "npc", "male"], default=None)
    ap.add_argument("--preview", default=None)
    ap.add_argument("--out", default=OUT_DIR)
    args = ap.parse_args(argv)
    tmpdir = tempfile.mkdtemp(prefix="olw_chars_")
    for kind, fname in (("juju", "juju.glb"), ("npc", "npc-base.glb"), ("male", "npc-male.glb")):
        if args.only and args.only != kind:
            continue
        rig, objs, tris, scale = build_character(kind, tmpdir)
        path = os.path.join(args.out, fname)
        export(path)
        print(f"[{kind}] -> {path}  {os.path.getsize(path) / 1024:.1f} KB  scale={scale:.4f}")
        print(f"[{kind}] walk loop = {2 * WALK_STEP * scale:.4f} u / {24 / FPS:.3f} s ; run loop = {RUN_REACH / RUN_STANCE * scale:.4f} u / {RUN_FRAMES / FPS:.3f} s")
        print(f"[{kind}] tris: " + ", ".join(f"{k}={v}" for k, v in tris.items()) + f"  total={sum(tris.values())}")
        if args.preview:
            if kind == "juju":
                render_previews(rig, objs, args.preview, kind, hide=("jeans", "cardigan"))
            else:
                hide = ("skirt", "legs", "cardigan", "hair_curly") if kind == "male" else ("jeans", "hair_bob", "hair_short", "hair_bun", "hair_ponytail", "hair_curly")
                render_previews(rig, objs, args.preview, kind, hide=hide)


if __name__ == "__main__":
    main()
