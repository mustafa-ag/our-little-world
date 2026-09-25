# Blender asset pipeline

Hero GLBs for the 3D world (`public/assets/models/<key>.glb`) are authored as
headless Blender Python scripts. Nothing is hand-edited in the Blender UI; every
asset is reproducible from code.

```
tools/blender/
  build.mjs            runner: finds the asset scripts, runs them, optimises, writes manifest.json
  manifest.json        written by build.mjs: every Blender-authored key (+ tris, KB, size, script)
  lib/olw.py           shared helper library (import olw)
  lib/render_sheet.py  contact-sheet renderer (Cycles CPU, headless)
  assets/architecture/ cottages, café           (E1)
  assets/props/        street furniture          (E1)
  assets/nature/       trees, bushes, flowers    (E2)
  assets/vehicles/     car                       (E2)
  characters/          juju.glb, npc-base.glb, npc-male.glb (rigged + animated; run directly or via build.mjs)
```

## Setup

`bpy` (Blender as a Python module) only ships wheels for **CPython 3.11**:

```sh
python3.11 -m venv .venv-bpy
.venv-bpy/bin/pip install bpy==4.2.0
export BLENDER_PY=$PWD/.venv-bpy/bin/python   # optional: .venv-bpy is found automatically
```

## Commands

```sh
npm run assets:blender                         # every script
npm run assets:blender -- props                # scripts whose path contains "props"
npm run assets:blender -- --only bench,crate   # only these keys (sets OLW_ONLY)
npm run assets:blender -- --raw                # skip the glTF-Transform weld/quantize pass
$BLENDER_PY tools/blender/lib/render_sheet.py out.jpg bench signpost   # contact sheet
```

`npm run assets:build` (the legacy code exporter, `scripts/build-hero-assets.mjs`)
reads `manifest.json` and **skips every Blender-authored key**, so it can never
overwrite them (`--force-legacy <key>` to do it on purpose).

## Writing an asset script

One script builds one or more keys and writes `public/assets/models/<key>.glb`
through `olw.export_glb`, which also prints an `OLW_ASSET {json}` line that
`build.mjs` collects into the manifest.

```python
import olw

def build():
    b = olw.Builder("bench")
    b.box((1.1, 0.42, 0.05), (0, 0, 0.28), "olw_wood", "wood", bevel=0.012)   # size, bottom-centre, slot, colour
    b.cyl(0.03, 0.28, (0.5, 0, 0), "olw_metal", "iron")
    return b.finish()

if olw.wanted("bench"):
    olw.build_and_export("bench", build, max_tris=1500, size=(1.1, 0.42, 0.5))
```

**Frame.** Author in Blender's native frame: Z up, the front faces **-Y**, +X is
right when seen from the front, 1 unit = 1 world unit (1 map tile, ~1.6 m),
origin = footprint centre on the ground. `finish()` turns it so the game sees
+Y up, front towards **-Z**, and the same +X. Numbers you author (door x, …) are
the numbers the game gets; game z = authored y.

**Builder primitives** (each = one part with a material slot and a colour):
`box` (pivot bottom-centre, optional bevel/taper/jitter/subdiv), `cyl`
(frustum, pivot bottom), `sphere`, `lathe` (profile of revolution), `prism`
(extruded 2D polygon: gables, arches, arrow boards), `tube` (bent rod through
points), `blob` (lumpy foliage/ivy/moss mass), `mesh` (raw verts/faces),
`add_bm` (any bmesh). bmesh helpers: `bevel_bm`, `weld_bm`, `jitter_bm`,
`subdivide_bm`, `subsurf_bm`; object helper `apply_modifiers`.

**Colour.** Colours are hex or palette names (`olw.PALETTE`). `finish()` bakes
COLOR_0: per-face noise (`vary`, `hue`), AO darkening near the ground
(`ao_height`, `ao_min`), convex-edge highlight and concave cavity darkening,
lighter tops / darker undersides. `color_fn(pos, normal, rng)` per part for
gradients (moss on eaves…). COLOR_0 is always the **absolute** colour. The
runtime-textured slots (`olw_stone`, `olw_stone_dark`, `olw_roof_tile`,
`olw_slate`, `olw_wood`, `olw_wood_dark`) are exported as `<slot>_abs`
materials: the game multiplies COLOR_0 by a hue-neutral detail texture painted
at `DETAIL_HEX` (#e8e8e8), so their COLOR_0 is stored ÷ 0.91 (`DETAIL_TINT`).
All other slots are white × COLOR_0.

**Material slots:** `olw_stone olw_stone_dark olw_roof_tile olw_slate olw_wood
olw_wood_dark olw_paint olw_metal olw_glass olw_glass_emissive olw_awning
olw_foliage olw_flower`. UVs are box-projected in world units.

**Validation** (`olw.validate`, run by `build_and_export`) prints bbox / min y /
tris / islands and raises on: lowest point not at y=0, any connected piece that
does not touch the ground or a chain of pieces touching it (floating bits),
triangle budget exceeded, or bbox off the expected `size` by > 25 %.
A failing script exits non-zero and `build.mjs` exits 1.
