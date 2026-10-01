"""
sculpt_juju_stage1.py — Juju Stage 1 Design Sculpt
Topology techniques studied from Rain v3.3 (CC0, Blender Studio).
Juju design is completely original.

Blender 4.0.2 compatible.

Usage:
  blender --background --python sculpt_juju_stage1.py
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.abspath(os.path.join(SCRIPT_DIR, "../../.."))
RENDER_DIR = os.path.join(REPO_ROOT, "docs", "character", "renders", "stage1")
GLB_OUT    = os.path.join(REPO_ROOT, "public", "assets", "models", "juju_stage1_sculpt.glb")

os.makedirs(RENDER_DIR, exist_ok=True)
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def reset_scene():
    """Delete everything in the scene and all orphan data."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in list(bpy.data.meshes):    bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials): bpy.data.materials.remove(block)
    for block in list(bpy.data.cameras):   bpy.data.cameras.remove(block)
    for block in list(bpy.data.lights):    bpy.data.lights.remove(block)


def add_subsurf(ob, levels=2):
    mod = ob.modifiers.new("Subdivision", 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    return mod


def clay_material(name, r, g, b, roughness=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    # In Blender 4.0 the specular param changed to "Specular IOR Level"
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = 0.0
    return mat


def link_ob(ob):
    bpy.context.collection.objects.link(ob)


def new_object_from_bm(name, bm_data, mat=None):
    me = bpy.data.meshes.new(name)
    bm_data.to_mesh(me)
    bm_data.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    link_ob(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def uv_sphere(cx, cy, cz, rx, ry, rz, rings=10, segs=16):
    """
    Build a UV sphere as (verts, faces) using explicit from_pydata format.
    rx/ry/rz are per-axis radii (ellipsoid).
    Y-up convention: ry controls height.
    """
    verts = []
    faces = []

    # North pole
    verts.append((cx, cy + ry, cz))

    # Body rings
    for ri in range(1, rings):
        phi = math.pi * ri / rings
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)
        for si in range(segs):
            theta = 2.0 * math.pi * si / segs
            verts.append((
                cx + rx * sin_phi * math.cos(theta),
                cy + ry * cos_phi,
                cz + rz * sin_phi * math.sin(theta),
            ))

    # South pole
    verts.append((cx, cy - ry, cz))

    south = len(verts) - 1
    ring0 = 1  # first ring starts at index 1

    # North cap triangles
    for si in range(segs):
        sj = (si + 1) % segs
        faces.append([0, ring0 + si, ring0 + sj])

    # Body quads
    for ri in range(rings - 2):
        base = ring0 + ri * segs
        for si in range(segs):
            sj = (si + 1) % segs
            a = base + si
            b = base + sj
            c = base + segs + sj
            d = base + segs + si
            faces.append([a, b, c, d])

    # South cap triangles
    last_ring = ring0 + (rings - 2) * segs
    for si in range(segs):
        sj = (si + 1) % segs
        faces.append([south, last_ring + sj, last_ring + si])

    return verts, faces


def make_mesh_ob(name, verts, faces, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    link_ob(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


# ---------------------------------------------------------------------------
# Ring helpers for bmesh construction
# ---------------------------------------------------------------------------

def bm_ring(bm, cx, cy, cz, rx, rz, n=16):
    """Add a ring of n verts at (cx, cy, cz) with x-radius rx, z-radius rz."""
    verts = []
    for i in range(n):
        a = 2.0 * math.pi * i / n
        v = bm.verts.new((cx + rx * math.cos(a), cy, cz + rz * math.sin(a)))
        verts.append(v)
    return verts


def bm_connect_rings(bm, r0, r1):
    """Fill quads between two same-length rings."""
    n = len(r0)
    assert len(r1) == n, "Rings must have same vertex count"
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([r0[i], r0[j], r1[j], r1[i]])


def bm_cap_top(bm, ring_verts, apex_y):
    """Triangulate top cap to an apex vertex."""
    cx = sum(v.co.x for v in ring_verts) / len(ring_verts)
    cz = sum(v.co.z for v in ring_verts) / len(ring_verts)
    apex = bm.verts.new((cx, apex_y, cz))
    n = len(ring_verts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ring_verts[j], ring_verts[i], apex])
    return apex


def bm_cap_bottom(bm, ring_verts, nadir_y):
    """Triangulate bottom cap to a nadir vertex."""
    cx = sum(v.co.x for v in ring_verts) / len(ring_verts)
    cz = sum(v.co.z for v in ring_verts) / len(ring_verts)
    nadir = bm.verts.new((cx, nadir_y, cz))
    n = len(ring_verts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ring_verts[i], ring_verts[j], nadir])
    return nadir


def bm_fan_rings(bm, inner_ring, outer_ring):
    """
    Connect an 8-vert inner ring to a 16-vert outer ring by pairing
    each inner vert with 2 outer verts (fan triangles + quads).
    inner_ring has n verts, outer_ring has 2n verts.
    """
    n = len(inner_ring)
    assert len(outer_ring) == 2 * n
    for i in range(n):
        # Each inner vert fans to 2 outer verts
        o0 = outer_ring[i * 2]
        o1 = outer_ring[i * 2 + 1]
        o2 = outer_ring[(i * 2 + 2) % (2 * n)]
        i0 = inner_ring[i]
        i1 = inner_ring[(i + 1) % n]
        # Triangle: i0 -> o0 -> o1
        bm.faces.new([i0, o0, o1])
        # Quad: i0 -> o1 -> o2 -> i1
        bm.faces.new([i0, o1, o2, i1])


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

reset_scene()

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

mat_skin  = clay_material("juju_skin",  0.78, 0.65, 0.55)
mat_eyes  = clay_material("juju_eyes",  0.92, 0.96, 1.00)
mat_iris  = clay_material("juju_iris",  0.22, 0.48, 0.72)
mat_hair  = clay_material("juju_hair",  0.10, 0.07, 0.05)
mat_brows = clay_material("juju_brows", 0.12, 0.08, 0.06)
mat_top   = clay_material("juju_top",   0.82, 0.76, 0.68)
mat_pants = clay_material("juju_pants", 0.58, 0.52, 0.72)
mat_shoes = clay_material("juju_shoes", 0.20, 0.18, 0.16)

# ---------------------------------------------------------------------------
# HEAD MESH
# Juju's proportions: round face, high forehead, soft jaw, big eye sockets.
# Ring stack from crown to chin, 16 verts per ring.
# ---------------------------------------------------------------------------

# Y = vertical (up). Character feet at y=0.
# Head centre: ~y=1.85 (eye level). Crown: ~y=2.08. Chin: ~y=1.55.

HEAD_RINGS = [
    # (y,    rx,    rz)   — height, x-radius, z-radius
    (2.08, 0.030, 0.030),  # r0  crown apex ring (8-ring, will fan to 16)
    (2.06, 0.072, 0.068),  # r1  upper crown
    (2.01, 0.104, 0.098),  # r2  forehead bulge
    (1.95, 0.115, 0.108),  # r3  mid forehead (widest point)
    (1.89, 0.118, 0.110),  # r4  brow ridge
    (1.83, 0.116, 0.108),  # r5  eye level (large orbit)
    (1.77, 0.112, 0.105),  # r6  cheekbone
    (1.71, 0.106, 0.098),  # r7  upper cheek
    (1.65, 0.096, 0.090),  # r8  lower cheek
    (1.60, 0.082, 0.078),  # r9  jaw begin
    (1.56, 0.064, 0.060),  # r10 jaw taper
    (1.52, 0.042, 0.038),  # r11 chin
]

bm_head = bmesh.new()

# Build rings (all 16-vert)
rings_h = []
for (y, rx, rz) in HEAD_RINGS:
    rings_h.append(bm_ring(bm_head, 0, y, 0, rx, rz, 16))

# Crown cap: apex above ring 0
bm_cap_top(bm_head, rings_h[0], 2.12)

# Connect all adjacent ring pairs
for i in range(len(rings_h) - 1):
    bm_connect_rings(bm_head, rings_h[i], rings_h[i + 1])

# Chin cap
bm_cap_bottom(bm_head, rings_h[-1], 1.48)

# Neck — extend downward
NECK_RINGS = [
    (1.44, 0.040, 0.038),
    (1.38, 0.045, 0.042),
    (1.32, 0.050, 0.046),
]
prev = rings_h[-1]
for (y, rx, rz) in NECK_RINGS:
    nr = bm_ring(bm_head, 0, y, 0, rx, rz, 16)
    bm_connect_rings(bm_head, prev, nr)
    prev = nr
# Open neck bottom (no cap — joins body)

head_ob = new_object_from_bm("JujuHead", bm_head, mat_skin)
add_subsurf(head_ob, 2)

# ---------------------------------------------------------------------------
# BODY MESH
# Torso, arms, legs as a separate object (separate from head).
# Neck collar ring at y=1.30 connects to body.
# ---------------------------------------------------------------------------

bm_body = bmesh.new()

# Torso ring stack
TORSO_RINGS = [
    # (y,     rx_side, rz_front)
    (1.28, 0.055, 0.050),  # collar/shoulder top
    (1.22, 0.110, 0.080),  # shoulder width
    (1.15, 0.100, 0.075),  # upper chest
    (1.05, 0.085, 0.068),  # mid chest
    (0.95, 0.080, 0.062),  # waist
    (0.88, 0.090, 0.068),  # hip top
    (0.80, 0.095, 0.072),  # hip middle
    (0.72, 0.090, 0.068),  # hip bottom / crotch
]

torso_rings = []
for (y, rx, rz) in TORSO_RINGS:
    torso_rings.append(bm_ring(bm_body, 0, y, 0, rx, rz, 16))

for i in range(len(torso_rings) - 1):
    bm_connect_rings(bm_body, torso_rings[i], torso_rings[i + 1])

# Cap top of torso (collar opening)
bm_cap_top(bm_body, torso_rings[0], 1.32)

# Left leg
LEG_RINGS_L = [
    # (cx,   y,    cz,   rx,   rz)
    (0.040, 0.70, 0, 0.048, 0.044),  # upper thigh
    (0.040, 0.62, 0, 0.045, 0.042),  # mid thigh
    (0.040, 0.54, 0, 0.040, 0.038),  # lower thigh
    (0.040, 0.46, 0, 0.036, 0.034),  # knee top
    (0.040, 0.40, 0, 0.034, 0.032),  # knee (dense loops)
    (0.040, 0.34, 0, 0.033, 0.031),  # below knee
    (0.040, 0.26, 0, 0.030, 0.028),  # mid shin
    (0.040, 0.18, 0, 0.026, 0.024),  # lower shin
    (0.040, 0.12, 0, 0.022, 0.020),  # ankle
    (0.040, 0.06, 0, 0.020, 0.018),  # heel
]

prev_leg_L = None
for (cx, y, cz, rx, rz) in LEG_RINGS_L:
    lr = bm_ring(bm_body, cx, y, cz, rx, rz, 12)
    if prev_leg_L:
        bm_connect_rings(bm_body, prev_leg_L, lr)
    else:
        # Bridge torso bottom to first leg ring — create transition
        # Grab left half of crotch ring and bridge
        pass
    prev_leg_L = lr

# Foot L — elongated along Z
foot_verts_L, foot_faces_L = uv_sphere(0.040, 0.04, 0.020, 0.022, 0.018, 0.050, rings=6, segs=12)
foot_L = make_mesh_ob("JujuFoot_L", foot_verts_L, foot_faces_L, mat_skin)
add_subsurf(foot_L, 1)

# Cap bottom of leg
bm_cap_bottom(bm_body, prev_leg_L, 0.02)

# Right leg (mirrored at x=0)
LEG_RINGS_R = [((-cx), y, cz, rx, rz) for (cx, y, cz, rx, rz) in LEG_RINGS_L]
prev_leg_R = None
for (cx, y, cz, rx, rz) in LEG_RINGS_R:
    rr = bm_ring(bm_body, cx, y, cz, rx, rz, 12)
    if prev_leg_R:
        bm_connect_rings(bm_body, prev_leg_R, rr)
    prev_leg_R = rr
bm_cap_bottom(bm_body, prev_leg_R, 0.02)

foot_verts_R, foot_faces_R = uv_sphere(-0.040, 0.04, 0.020, 0.022, 0.018, 0.050, rings=6, segs=12)
foot_R = make_mesh_ob("JujuFoot_R", foot_verts_R, foot_faces_R, mat_skin)
add_subsurf(foot_R, 1)

# Left arm
ARM_RINGS_L = [
    # (cx,    y,     cz,    rx,   rz)
    (0.130, 1.20, 0,  0.030, 0.028),  # shoulder (narrow stylized)
    (0.145, 1.14, 0,  0.026, 0.024),  # upper arm top
    (0.150, 1.05, 0,  0.024, 0.022),  # mid upper arm
    (0.155, 0.96, 0,  0.022, 0.020),  # lower upper arm
    (0.158, 0.88, 0,  0.020, 0.019),  # elbow top
    (0.160, 0.82, 0,  0.019, 0.018),  # elbow
    (0.160, 0.76, 0,  0.018, 0.017),  # below elbow
    (0.160, 0.66, 0,  0.017, 0.016),  # mid forearm
    (0.158, 0.56, 0,  0.016, 0.015),  # lower forearm
    (0.155, 0.48, 0,  0.014, 0.013),  # wrist
]

prev_arm_L = None
for (cx, y, cz, rx, rz) in ARM_RINGS_L:
    ar = bm_ring(bm_body, cx, y, cz, rx, rz, 10)
    if prev_arm_L:
        bm_connect_rings(bm_body, prev_arm_L, ar)
    prev_arm_L = ar
bm_cap_bottom(bm_body, prev_arm_L, 0.44)

# Right arm (mirrored)
ARM_RINGS_R = [((-cx), y, cz, rx, rz) for (cx, y, cz, rx, rz) in ARM_RINGS_L]
prev_arm_R = None
for (cx, y, cz, rx, rz) in ARM_RINGS_R:
    ar = bm_ring(bm_body, cx, y, cz, rx, rz, 10)
    if prev_arm_R:
        bm_connect_rings(bm_body, prev_arm_R, ar)
    prev_arm_R = ar
bm_cap_bottom(bm_body, prev_arm_R, 0.44)

body_ob = new_object_from_bm("JujuBody", bm_body, mat_skin)
add_subsurf(body_ob, 2)

# ---------------------------------------------------------------------------
# EYES — three objects: sclera sphere, iris disc, cornea sphere
# Juju's eyes: large, round, positioned wide on face, ~1.83 height
# ---------------------------------------------------------------------------

EYE_Y  = 1.83
EYE_CX = 0.044  # half inter-eye spacing
EYE_CZ = 0.055  # forward from head centre

for side, sx in [("L", 1.0), ("R", -1.0)]:
    cx = sx * EYE_CX
    # Sclera (white)
    sv, sf = uv_sphere(cx, EYE_Y, EYE_CZ, 0.020, 0.020, 0.020, rings=10, segs=16)
    eye_ob = make_mesh_ob(f"JujuEye_{side}", sv, sf, mat_eyes)
    add_subsurf(eye_ob, 1)

    # Iris (coloured disc — small sphere, forward face)
    iv, if_ = uv_sphere(cx, EYE_Y, EYE_CZ + 0.016, 0.012, 0.012, 0.004, rings=6, segs=12)
    iris_ob = make_mesh_ob(f"JujuIris_{side}", iv, if_, mat_iris)

# ---------------------------------------------------------------------------
# EYEBROWS — flat arch-shaped strips above brow ridge
# ---------------------------------------------------------------------------

def make_eyebrow(name, cx, ey, ez, width=0.040, mat=None):
    """Simple arched eyebrow quad strip."""
    bm_eb = bmesh.new()
    segs = 8
    arch_h = 0.008
    rows = []
    for row in range(2):
        rv = []
        for si in range(segs + 1):
            t = si / segs - 0.5  # -0.5 to 0.5
            x = cx + t * width
            arch = arch_h * (1.0 - (t * 2.0) ** 2)  # parabola
            y = ey + 0.004 * row + arch
            z = ez - 0.004 * row
            rv.append(bm_eb.verts.new((x, y, z)))
        rows.append(rv)
    for si in range(segs):
        bm_eb.faces.new([rows[0][si], rows[0][si+1], rows[1][si+1], rows[1][si]])
    return new_object_from_bm(name, bm_eb, mat)

make_eyebrow("JujuBrow_L",  0.044, 1.89, 0.066, mat=mat_brows)
make_eyebrow("JujuBrow_R", -0.044, 1.89, 0.066, mat=mat_brows)

# ---------------------------------------------------------------------------
# HAIR — braided bun at back-crown + two temple strands
# Technique: separate mesh objects per clump (like Rain)
# ---------------------------------------------------------------------------

# Main hair cap — hugs skull
bm_hcap = bmesh.new()
HCAP_RINGS = [
    # (y,     rx,    rz)    — fits over head (slightly larger)
    (2.10, 0.034, 0.034),   # apex ring (8)
    (2.08, 0.080, 0.075),   # upper crown
    (2.02, 0.118, 0.112),   # forehead hairline
    (1.96, 0.124, 0.116),   # mid cap
    (1.90, 0.126, 0.118),   # side
    (1.84, 0.122, 0.114),   # ear level
    (1.78, 0.115, 0.108),   # lower side
    (1.72, 0.105, 0.095),   # nape begin
]

hcap_rings = []
for (y, rx, rz) in HCAP_RINGS:
    hcap_rings.append(bm_ring(bm_hcap, 0, y, 0, rx, rz, 16))

bm_cap_top(bm_hcap, hcap_rings[0], 2.14)

for i in range(len(hcap_rings) - 1):
    bm_connect_rings(bm_hcap, hcap_rings[i], hcap_rings[i + 1])

bm_cap_bottom(bm_hcap, hcap_rings[-1], 1.68)

hcap_ob = new_object_from_bm("JujuHairCap", bm_hcap, mat_hair)
add_subsurf(hcap_ob, 2)

# Braided bun — torus-like flattened sphere at back-crown
bun_v, bun_f = uv_sphere(0.0, 2.07, -0.095, 0.060, 0.048, 0.060, rings=10, segs=16)
bun_ob = make_mesh_ob("JujuHairBun", bun_v, bun_f, mat_hair)
add_subsurf(bun_ob, 2)

# Left temple strand — elongated blob hanging down left side
def make_strand(name, cx, top_y, bot_y, cz, rx, rz, mat=None):
    """Elongated capsule-style hair strand."""
    sv, sf = uv_sphere(cx, (top_y + bot_y) / 2.0, cz, rx, (top_y - bot_y) / 2.0, rz, rings=8, segs=10)
    ob = make_mesh_ob(name, sv, sf, mat)
    add_subsurf(ob, 1)
    return ob

make_strand("JujuHairStrand_L",  0.090, 1.96, 1.72, 0.055, 0.014, 0.012, mat_hair)
make_strand("JujuHairStrand_R", -0.090, 1.96, 1.72, 0.055, 0.014, 0.012, mat_hair)

# ---------------------------------------------------------------------------
# CLOTHING LAYER 1 — fitted long-sleeve top with small collar
# Slightly larger than body, separate mesh object (like Rain's top)
# ---------------------------------------------------------------------------

bm_top = bmesh.new()

TOP_RINGS = [
    # Collar
    (1.26, 0.056, 0.052),
    (1.20, 0.114, 0.084),  # shoulders
    (1.14, 0.106, 0.080),
    (1.06, 0.090, 0.072),
    (0.96, 0.086, 0.068),
    (0.86, 0.084, 0.066),  # hem (hip length)
]

top_rings = []
for (y, rx, rz) in TOP_RINGS:
    top_rings.append(bm_ring(bm_top, 0, y, 0, rx, rz, 16))

bm_cap_top(bm_top, top_rings[0], 1.30)

for i in range(len(top_rings) - 1):
    bm_connect_rings(bm_top, top_rings[i], top_rings[i + 1])

bm_cap_bottom(bm_top, top_rings[-1], 0.82)

# Sleeves
SLEEVE_RINGS_L = [
    (0.132, 1.18, 0, 0.034, 0.032),
    (0.148, 1.10, 0, 0.030, 0.028),
    (0.155, 1.00, 0, 0.028, 0.026),
    (0.160, 0.90, 0, 0.026, 0.024),
    (0.162, 0.80, 0, 0.024, 0.022),  # elbow
    (0.162, 0.70, 0, 0.022, 0.021),
    (0.162, 0.60, 0, 0.020, 0.019),
    (0.158, 0.52, 0, 0.018, 0.017),  # wrist cuff
]

prev_sl_L = None
for (cx, y, cz, rx, rz) in SLEEVE_RINGS_L:
    sr = bm_ring(bm_top, cx, y, cz, rx, rz, 10)
    if prev_sl_L:
        bm_connect_rings(bm_top, prev_sl_L, sr)
    prev_sl_L = sr
bm_cap_bottom(bm_top, prev_sl_L, 0.48)

SLEEVE_RINGS_R = [((-cx), y, cz, rx, rz) for (cx, y, cz, rx, rz) in SLEEVE_RINGS_L]
prev_sl_R = None
for (cx, y, cz, rx, rz) in SLEEVE_RINGS_R:
    sr = bm_ring(bm_top, cx, y, cz, rx, rz, 10)
    if prev_sl_R:
        bm_connect_rings(bm_top, prev_sl_R, sr)
    prev_sl_R = sr
bm_cap_bottom(bm_top, prev_sl_R, 0.48)

top_ob = new_object_from_bm("JujuTop", bm_top, mat_top)
add_subsurf(top_ob, 2)

# ---------------------------------------------------------------------------
# CLOTHING LAYER 2 — wide-leg flowing trousers
# ---------------------------------------------------------------------------

bm_pants = bmesh.new()

# Waistband
PANTS_RINGS = [
    (0.82, 0.098, 0.074),  # waistband top
    (0.75, 0.096, 0.072),  # hip
    (0.68, 0.090, 0.068),  # crotch level
]

pants_top_rings = []
for (y, rx, rz) in PANTS_RINGS:
    pants_top_rings.append(bm_ring(bm_pants, 0, y, 0, rx, rz, 16))

bm_cap_top(bm_pants, pants_top_rings[0], 0.86)

for i in range(len(pants_top_rings) - 1):
    bm_connect_rings(bm_pants, pants_top_rings[i], pants_top_rings[i + 1])

# Wide-leg left trouser leg
PLEG_L = [
    (0.040, 0.66, 0, 0.058, 0.054),
    (0.040, 0.58, 0, 0.060, 0.056),  # wide below knee
    (0.040, 0.48, 0, 0.062, 0.058),
    (0.040, 0.38, 0, 0.064, 0.060),
    (0.040, 0.28, 0, 0.066, 0.062),
    (0.040, 0.18, 0, 0.064, 0.060),  # ankle flare
    (0.040, 0.10, 0, 0.060, 0.056),  # cuff
]

prev_pl_L = None
for (cx, y, cz, rx, rz) in PLEG_L:
    pr = bm_ring(bm_pants, cx, y, cz, rx, rz, 12)
    if prev_pl_L:
        bm_connect_rings(bm_pants, prev_pl_L, pr)
    prev_pl_L = pr
bm_cap_bottom(bm_pants, prev_pl_L, 0.06)

PLEG_R = [((-cx), y, cz, rx, rz) for (cx, y, cz, rx, rz) in PLEG_L]
prev_pl_R = None
for (cx, y, cz, rx, rz) in PLEG_R:
    pr = bm_ring(bm_pants, cx, y, cz, rx, rz, 12)
    if prev_pl_R:
        bm_connect_rings(bm_pants, prev_pl_R, pr)
    prev_pl_R = pr
bm_cap_bottom(bm_pants, prev_pl_R, 0.06)

pants_ob = new_object_from_bm("JujuPants", bm_pants, mat_pants)
add_subsurf(pants_ob, 2)

# ---------------------------------------------------------------------------
# SHOES — rounded flat slip-on style (different from Rain's laced sneaker)
# ---------------------------------------------------------------------------

for side, sx in [("L", 1.0), ("R", -1.0)]:
    sv, sf = uv_sphere(sx * 0.040, 0.040, 0.018, 0.028, 0.032, 0.055, rings=8, segs=14)
    shoe_ob = make_mesh_ob(f"JujuShoe_{side}", sv, sf, mat_shoes)
    add_subsurf(shoe_ob, 2)

# ---------------------------------------------------------------------------
# LIGHTING
# ---------------------------------------------------------------------------

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.image_settings.file_format = 'PNG'

# World
if not scene.world:
    world = bpy.data.worlds.new("World")
    scene.world = world
world = scene.world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg is None:
    bg = world.node_tree.nodes.new("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0.88, 0.88, 0.88, 1.0)
bg.inputs["Strength"].default_value = 0.8

# Key light
bpy.ops.object.light_add(type='AREA', location=(0.5, 0.6, 2.5))
key_light = bpy.context.active_object
key_light.data.energy = 500
key_light.data.size = 1.0
key_light.rotation_euler = Euler((-0.45, 0.0, 0.35))

# Fill light
bpy.ops.object.light_add(type='AREA', location=(-0.7, 0.4, 1.8))
fill_light = bpy.context.active_object
fill_light.data.energy = 200
fill_light.data.size = 1.5
fill_light.rotation_euler = Euler((-0.3, 0.0, -0.6))

# Rim light
bpy.ops.object.light_add(type='AREA', location=(0.1, -0.9, 2.2))
rim_light = bpy.context.active_object
rim_light.data.energy = 250
rim_light.data.size = 0.6
rim_light.rotation_euler = Euler((math.pi / 2, 0.0, 0.0))

# ---------------------------------------------------------------------------
# CAMERA
# ---------------------------------------------------------------------------

cam_data = bpy.data.cameras.new("Camera")
cam_ob   = bpy.data.objects.new("Camera", cam_data)
link_ob(cam_ob)
scene.camera = cam_ob

MID_Y  = 1.05  # body centre for full shots
FACE_Y = 1.83  # eye level for face shots

def set_ortho(loc, rot_euler, scale):
    cam_ob.location = Vector(loc)
    cam_ob.rotation_euler = Euler(rot_euler)
    cam_ob.data.type = 'ORTHO'
    cam_ob.data.ortho_scale = scale

def set_persp(loc, rot_euler, lens=85):
    cam_ob.location = Vector(loc)
    cam_ob.rotation_euler = Euler(rot_euler)
    cam_ob.data.type = 'PERSP'
    cam_ob.data.lens = lens

def render_to(filename):
    path = os.path.join(RENDER_DIR, filename)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"  Rendered: {path}")
    return path

# ---------------------------------------------------------------------------
# RENDERS — 7 views
# ---------------------------------------------------------------------------

print("\n=== Starting renders ===")

# 1. Front clay — full body, orthographic
set_ortho((0, 3.5, MID_Y), (math.pi / 2, 0, 0), 2.4)
render_to("front_clay.png")

# 2. Three-quarter face close-up
set_persp((0.28, 0.70, FACE_Y), (math.pi / 2 - 0.22, 0, 0.58), lens=100)
render_to("threequarter_face.png")

# 3. Side profile — orthographic
set_ortho((3.0, 3.0, MID_Y), (math.pi / 2, 0, math.pi / 2), 2.4)
render_to("side_profile.png")

# 4. Full-body front — orthographic
set_ortho((0, 4.0, MID_Y), (math.pi / 2, 0, 0), 2.6)
render_to("fullbody_front.png")

# 5. Full-body three-quarter — perspective
set_persp((1.4, 3.0, MID_Y), (math.pi / 2 - 0.12, 0, 0.52), lens=70)
render_to("fullbody_threequarter.png")

# 6. Back view — orthographic
set_ortho((0, -3.5, MID_Y), (math.pi / 2, 0, math.pi), 2.4)
render_to("back_view.png")

# 7. Silhouette — black flat shading on white background
sil_mat = bpy.data.materials.new("silhouette_mat")
sil_mat.use_nodes = True
nodes = sil_mat.node_tree.nodes
links = sil_mat.node_tree.links
# Clear and add emission
for nd in list(nodes):
    nodes.remove(nd)
out_nd   = nodes.new("ShaderNodeOutputMaterial")
emit_nd  = nodes.new("ShaderNodeEmission")
emit_nd.inputs["Color"].default_value = (0, 0, 0, 1)
emit_nd.inputs["Strength"].default_value = 1.0
links.new(emit_nd.outputs["Emission"], out_nd.inputs["Surface"])

# Assign silhouette mat to all character meshes
char_names = {"JujuHead", "JujuBody", "JujuFoot_L", "JujuFoot_R",
              "JujuEye_L", "JujuEye_R", "JujuIris_L", "JujuIris_R",
              "JujuBrow_L", "JujuBrow_R",
              "JujuHairCap", "JujuHairBun", "JujuHairStrand_L", "JujuHairStrand_R",
              "JujuTop", "JujuPants", "JujuShoe_L", "JujuShoe_R"}
saved_mats = {}
for ob in bpy.data.objects:
    if ob.name in char_names and ob.type == 'MESH':
        saved_mats[ob.name] = list(ob.data.materials)
        ob.data.materials.clear()
        ob.data.materials.append(sil_mat)

world.node_tree.nodes.get("Background").inputs["Color"].default_value = (1, 1, 1, 1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.0
set_ortho((0, 3.5, MID_Y), (math.pi / 2, 0, 0), 2.6)
render_to("silhouette.png")

# Restore original materials
for ob in bpy.data.objects:
    if ob.name in char_names and ob.type == 'MESH':
        ob.data.materials.clear()
        for m in saved_mats.get(ob.name, []):
            ob.data.materials.append(m)

print("=== All 7 renders complete ===\n")

# ---------------------------------------------------------------------------
# GLB EXPORT
# ---------------------------------------------------------------------------

# Select only character objects
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.data.objects:
    if ob.name in char_names:
        ob.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    use_selection=True,
    export_apply=True,
    export_format='GLB',
)
print(f"GLB exported: {GLB_OUT}")

# ---------------------------------------------------------------------------
# Count triangles
# ---------------------------------------------------------------------------

total_tris = 0
for ob in bpy.data.objects:
    if ob.name in char_names and ob.type == 'MESH':
        bpy.context.view_layer.objects.active = ob
        bm_tmp = bmesh.new()
        bm_tmp.from_object(ob, bpy.context.evaluated_depsgraph_get())
        bmesh.ops.triangulate(bm_tmp, faces=bm_tmp.faces[:])
        total_tris += len(bm_tmp.faces)
        print(f"  {ob.name}: {len(bm_tmp.faces)} tris")
        bm_tmp.free()

print(f"\nTotal triangle count (with SubSurf applied): {total_tris}")
print("sculpt_juju_stage1.py — DONE")
