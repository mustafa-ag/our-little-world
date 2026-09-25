# Visual style: "Storybook Low-Poly"

These are the art rules for the 3D build (`src/app3d/`). The benchmark is the Royal Mile spawn street and the Royal Mile Café in `edinburgh_oldtown`. New locations should match it. The acceptance captures are in `docs/screenshots/benchmark/`:
`01-juju-front`, `02-juju-three-quarter`, `03-juju-walking`, `04-cottage-street-day`, `05-cafe-day`, `06-wide-horizon`, `07-evening`, `08-night` and `09-mobile-portrait` (390×844). The bar is that they *look* right, not only that the code passes: check character, silhouette, scale against Juju, depth, materials, colour, lighting and composition, and look for bugs such as floating, clipping, props on the wrong surface or a building hiding Juju.

**Target.** A cozy miniature Scottish/European village with a hand-painted look. Use warm cream/sandstone stone, slate and muted terracotta roofs, a lot of greenery and small flowers, and soft warm light. Keep saturation controlled: nothing neon, no pure black or pure white on large surfaces.

## Palette (`rendering/materials.ts` PALETTE, kit `TINTS`)
| role | hex |
|---|---|
| stone / harl walls | cream `#f0e2c6`, creamSoft `#e6dac4`, stoneWarm `#c9b89a`, greyStone `#b8b0a2`, sand `#d4c3a0`, rose `#dcc2b0` |
| roofs | slate `#6f7480` / slateBlue `#66707c`, muted terracotta `#b8694a` (softened toward warm grey by `mix2`) |
| greens | moss `#6b8a4e`, grass `#93a86e`, grassLight `#a4b47c`, olive `#7f8b56`, mossDark `#55703f`, sage `#8fa87c` |
| flowers | dustyRose `#d49a9a`, cream `#f1e7d0`, mutedYellow `#e6c96a`, lavender `#b59bd1`, heather `#9b7fb0` |
| accents | awning red `#b34d47`, car teal `#5f8f8a`, post red `#c03a3a`, iron `#2d2b2e`, wood `#8a5a3a` |
| ground | street setts `#ada08b`, flags/cobble `#c2b49c`, kerb `#e4d8bf`, pavement `#d2c6b1` |
| dry-stone wall | blocks `#bfb192`–`#e1d4b8`, coping `#e3d7bd`, mortar `#9d917c` |

## Scale contract (`world/scale.ts`)
1 unit is 1 tile, about 1.6 m. Juju is 1.05 u tall. The other reference sizes are a storey of 1.6, a door of 1.3 × 0.62, a lamp of 2.1, a signpost of 1.9, a fence of 0.55, a dry-stone wall of 0.6, a café table of 0.48 and a car of 2.4 × 1.1 × 0.95. Everything is sized from these constants; nothing hard-codes its own sizes. Loose flowers sit at about knee height (≤ 0.35 u).

**Movement.** The keyboard gives a 2.4 u/s stroll and Shift or a full joystick gives a 3.6 u/s jog (`systems/playerController.ts`). Juju's legs are about 0.3 u, so both speeds use the bouncy `run` clip, which has a real flight phase and covers 1.60 u per 0.667 s loop at rate 1. The `walk` clip (0.55 u/s) only plays at low joystick deflection. `ClipMixer` sets the playback rate to ground speed ÷ clip speed, so the feet stay planted.

## Materials and slots
- **Vertex colour × shared material.** Hue lives in vertex colours (COLOR_0) and materials are shared, so a merged prop is 1 to 3 submeshes. Never merge parts with interleaved materials, because every switch is a submesh and a draw call.
- **Slots** (`assets/hero/slots.ts` → `AssetManager.slotMaterial`):
  - `olw_paint`, `olw_foliage`, `olw_metal`, `olw_flower`, `olw_bark`, `olw_awning` and `olw_rubber` are white × COLOR_0.
  - `olw_glass` is flat.
  - `olw_glass_emissive` and `olw_light_emissive` glow at night through `lighting.registerGlow`.
  - The character roles `olw_skin|hair|top|outer|bottom|shoes|accent` are re-tinted per person, and `olw_face` is a painted decal.
- **Textured slots, two encodings:**
  - The procedural kit (`olw_stone`, `olw_roof_tile`, `olw_slate`, `olw_wood`…) multiplies COLOR_0 by a tinted hand-painted texture.
  - Blender GLBs export those slots as **`<slot>_abs`**. COLOR_0 is the absolute colour ÷ 0.91, and the runtime multiplies it by a hue-neutral detail texture of the same style painted at `DETAIL_HEX #e8e8e8`. This means authored colours arrive unchanged. The old "target ÷ tint, clamped" encoding pushed slate and stone toward teal.
- **Hand-painted DynamicTextures** (`Materials.textured(style, hex, scale)`) come in the styles stone, cobble, roof, slate, planks, grass, awning, paving, bark and canvas. They are 512 px for roof, slate and stone and 128 to 256 px for the rest.
- **Ground.** `t_path` renders as dark setts (the street) and `t_cobble` as pale flags, raised a kerb height with a curb and gutter.

## Kit vocabulary
- **Buildings** (`assets/kit/architecture/`): `presetVariant(name, w, d)` gives a single thin-instance batch per preset and footprint. Cottages: `stoneCrow`, `creamTerra`, `greyDormer`, `creamCrow2`, `greyMoss`, `sandDormer2`, `rose2`, `bothy`, `whiteSlate`. Others: `shop`, `shopGrey`, `cafe`, `tenementSand|Grey|Rose`. Details include recessed windows with frames, mullions, curtains, shutters and flower boxes, arched doors with fanlights, quoins, crow-steps, dormers, chimneys with pots, moss, a lantern, and ivy (a dense leaf mass on one corner plus an eave drape).
- **Hero pieces** (`assets/hero/`, GLB with a procedural fallback): `tree-oak-a|b`, `tree-small`, `tree-pine`, `bush-a|b`, `bench`, `lamp-post`, `signpost`, `stone-wall`, `fence`, `fence-gate`, `planter`, `car`, `post-box`, `cafe-table`, `cafe-chair`, `ivy-card`, `barrel`, `crate`, `player`.
- **Procedural clutter**: `flower-cluster` (`c=`), `flower-bed` (`c=`, `d=`), `heather`, `grass-tuft`, `chalkboard`, `phone-box`, `well`, `fountain`.

## Asset pipeline (Blender, `tools/blender/`)
- Every hero GLB is authored as a headless bpy 4.2 script. Run `npm run assets:blender [-- --only k1,k2]` to write `public/assets/models/<key>.glb` and `tools/blender/manifest.json`. Scripts use `tools/blender/lib/olw.py` (`Builder` → `finish()` bakes COLOR_0, AO, edge light and box UVs; then `validate()` → `export_glb`). `validate()` fails a build on floating islands, a base that is not at y = 0, a triangle budget overrun, or a size more than 25 % off. Use `lib/render_sheet.py` for contact sheets. Do not hand-edit the GLBs.
- The authoring frame is Z up with the front at −Y and 1 unit = 1 tile, and the origin is the footprint centre on the ground. The game sees the same numbers with the front at −Z.
- Characters come from `tools/blender/characters/build_characters.py`: `juju.glb`, `npc-base.glb` and `npc-male.glb` (a boyish build with short or curly hair, used for baba and moomoo). They share one rig with the clips idle, walk, run, wave and nod. Juju faces +Z.
- Register a key in `assets/hero/index.ts` `HERO_ASSETS` so the normal preload covers it. The boot preload (props + characters) runs behind the title screen with a 12 s timeout per GLB (`GLB_TIMEOUT_MS`), and the first location waits for it. A GLB that is missing or times out falls back to the procedural builder. `npm run assets:build` (legacy code exporter) skips every key in the Blender manifest.

## Dressing density (`world/dressing.ts`)
- Clutter goes **against** things, never alone on open stone. Put dense `flower-bed`s along wall feet and façades, add planters or barrels by doors, and put flowers at lamp feet. A lone cluster in the middle of a street reads as a lollipop, so `thin()` drops loose `flower-cluster`/`heather` on paving or road unless the tile is a front garden. Front gardens never sit on a kerb tile.
- Per 10 tiles of street frontage, aim for about 2 lamps, 1 bench, 2 or 3 planters/barrels/crates, and 4 to 6 flower beds. Grass verges get drifts (`drift`, grass only). Place trees on grass or in plazas, one per 3 to 5 tiles.
- Use one dry-stone wall line per edge. Benchmark walls claim their tiles so the auto edge-walls never double them.
- The café terrace goes in front of the façade and keeps a clear door lane. Chairs face across each table.
- Never block `reserved` tiles, road/path tiles or interaction zones. Check with the BFS in the capture script.

## Lighting (`rendering/lighting.ts`, `sky.ts`, `backdrop.ts`)
There are four presets: `morning`, `afternoon`, `evening` and `night`.
- **Days** use a warm sun (`#ffe2b8`, intensity 1.2), a hemi fill of 0.55 (sky `#d4dfe8` / ground `#b39474`), shadow darkness 0.45, exposure 1.05 and contrast 1.08.
- **Evening** uses a low golden sun from the west with a lavender fill. The lamps come on with a pool strength of 1.0.
- **Night** is a *cool world with warm human spaces*: moon `#8ea4d8` at 0.34 and hemi `#6a7fb4` at 0.46, against emissive windows and lamp heads, additive lamp-glow discs, a pool of 4 PointLights (2 on mobile, pool 1.9) that follows the lamps nearest the player, and a weighted warm spot in front of the café.
- Shadows are PCF, 2048 (1024 on mobile).
- The sky dome and gradient clouds sit in front of a layered skyline and castle backdrop that picks up each preset's atmosphere.

## Camera and occlusion (`rendering/camera.ts`, `occlusion.ts`)
- **Camera.** Fixed yaw, south of the player looking north. Elevation is 27° on desktop (fov 0.8, distance 10), 28° on phones (fov 0.84, distance 10.5) and 30° in portrait (fov 1.0). The look-at is 1.0 above the feet and 3.5 ahead. Zoom runs from 7.5 to 15, and closer is lower. Dev: `__game.setCamera({elev, fov, lookY, lookAhead, lead, dist})` and `__game.setTime(t)`.
- **Occlusion.** Buildings between the camera and Juju fade to 0.28 as clean shells: a depth-only twin is drawn just before the faded copy, so no interior walls show. Character decals use `DECAL_ALPHA_INDEX` so they draw before it. A building the camera is inside (within 2.2 u) fades out completely.

## Validator
In dev, `window.__validate()` (`world/validate.ts`) runs over the benchmark region. It lists every placed piece (ground offset, scale fixes, size) and warns on pieces floating or sunk, props inside buildings, solid props blocking street tiles, and solids closing a 1-tile sidewalk. Keep it at **0 warnings**. Walkability (BFS from the spawn to the café and every zone, NPC and pickup) is checked by the capture scripts.

## Performance budget
At the benchmark views the scene measures about **350 to 395 draw calls per frame including the shadow pass** (`__stats()`), about 70 to 100 active meshes, 134 materials and about 245 meshes. Keep new locations at **≤ 400 draw calls** (hard ceiling 420). Every new variant string (`c=`, preset, footprint) is a new batch, so reuse variants. The GLBs total about 3.7 MB (characters about 1.4 MB) and are not in the PWA precache (the glob excludes `.glb`), so offline play uses the procedural fallbacks.
