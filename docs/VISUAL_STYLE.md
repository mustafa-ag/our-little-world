# Visual style: "Cinematic Stylized 3D"

These are the art rules for the 3D build (`src/app3d/`). They have two layers:

1. A **global style** that every location, character and prop follows, wherever it is set.
2. **Regional art bibles** that give each place its own identity: Scotland / Edinburgh, the UAE, London, Amman / Jordan, Italy / Mediterranean, Greece and Germany.

The shared technical contract (scale, materials, asset pipeline, lighting, camera, validator and performance budget) applies to every region. The Royal Mile benchmark in `edinburgh_oldtown` is the acceptance target **for Scotland only**; it is not a template for other regions.

The legacy pixel-art rules (sprite sheets, `NEAREST` filtering, tile-sized sprites) belong to `src/game/` and do **not** apply here. See `AGENTS.md`.

---

## 1. Global style

The whole game aims for **expressive animated-film quality**: a stylized, cinematic 3D world that feels hand-crafted, warm and alive.

- **Sculpted character faces.** Brows, nose, cheeks, lips and eye sockets are modelled in the geometry, not only painted on a decal. Decals may add detail (iris, lashes, blush) but must not carry the whole face.
- **Stylized proportions.** Characters are 5.5 to 6 heads tall, with slightly enlarged eyes and hands so expressions and gestures read at gameplay distance.
- **Clear silhouettes.** Every character, building and hero prop is recognisable from its outline at the default camera distance. Avoid noisy, fussy edges that blur into the background.
- **Rich but controlled colour.** Saturated enough to feel warm and inviting, never neon and never photorealistic. No pure black or pure white on large surfaces.
- **Soft cinematic lighting.** A warm key sun, a blue-tinted fill, and long soft shadows. Night is cool, with warm human spaces (windows, lamps, cafés).
- **Visible material texture.** Surfaces show their material through normal maps and roughness variation: stone grain, wood grain, fabric weave, brushed metal, glazed tile. Flat untextured colour is a fallback, not a target.
- **Regional identity without labels.** A player should be able to tell which region they are in from the architecture, materials, flora, street furniture and light alone, without reading a location name. Regional vocabularies must not bleed into each other (see each bible's anti-goals).

### Review bar
Captures must *look* right, not only pass the code checks. For any new location check character, silhouette, scale against Juju, depth, materials, colour, lighting and composition, and look for bugs such as floating, clipping, props on the wrong surface or a building hiding Juju. Then check regional identity: would someone recognise the region with the HUD hidden?

---

## 2. Shared technical contract

### Scale contract (`world/scale.ts`)
1 unit is 1 tile, about 1.6 m. Juju is 1.05 u tall. The other reference sizes are a storey of 1.6, a door of 1.3 × 0.62, a lamp of 2.1, a signpost of 1.9, a fence of 0.55, a dry-stone wall of 0.6, a café table of 0.48 and a car of 2.4 × 1.1 × 0.95. Everything is sized from these constants; nothing hard-codes its own sizes. Loose flowers sit at about knee height (≤ 0.35 u).

**Movement.** The keyboard gives a 2.4 u/s stroll and Shift or a full joystick gives a 3.6 u/s jog (`systems/playerController.ts`). Juju's legs are about 0.3 u, so both speeds use the bouncy `run` clip, which has a real flight phase and covers 1.60 u per 0.667 s loop at rate 1. The `walk` clip (0.55 u/s) only plays at low joystick deflection. `ClipMixer` sets the playback rate to ground speed ÷ clip speed, so the feet stay planted.

### Materials and slots
- **Vertex colour × shared material.** Hue lives in vertex colours (COLOR_0) and materials are shared, so a merged prop is 1 to 3 submeshes. Never merge parts with interleaved materials, because every switch is a submesh and a draw call.
- **Slots** (`assets/hero/slots.ts` → `AssetManager.slotMaterial`):
  - `olw_paint`, `olw_foliage`, `olw_metal`, `olw_flower`, `olw_bark`, `olw_awning` and `olw_rubber` are white × COLOR_0.
  - `olw_glass` is flat.
  - `olw_glass_emissive` and `olw_light_emissive` glow at night through `lighting.registerGlow`.
  - The character roles `olw_skin|hair|top|outer|bottom|shoes|accent` are re-tinted per person, and `olw_face` is a painted decal (detail only; facial form lives in the sculpted geometry).
- **Textured slots, two encodings:**
  - The procedural kit (`olw_stone`, `olw_roof_tile`, `olw_slate`, `olw_wood`…) multiplies COLOR_0 by a tinted hand-painted texture.
  - Blender GLBs export those slots as **`<slot>_abs`**. COLOR_0 is the absolute colour ÷ 0.91, and the runtime multiplies it by a hue-neutral detail texture of the same style painted at `DETAIL_HEX #e8e8e8`. This means authored colours arrive unchanged. The old "target ÷ tint, clamped" encoding pushed slate and stone toward teal.
- **Hand-painted DynamicTextures** (`Materials.textured(style, hex, scale)`) come in the styles stone, cobble, roof, slate, planks, grass, awning, paving, bark and canvas. They are 512 px for roof, slate and stone and 128 to 256 px for the rest. New regions add styles (for example polished stone, stucco, glazed tile) rather than re-tinting a style that reads as the wrong material.
- **Ground.** `t_path` renders as dark setts (the street) and `t_cobble` as pale flags, raised a kerb height with a curb and gutter. Regions may remap these tiles to their own paving (see each bible).

### Asset pipeline (Blender, `tools/blender/`)
- Every hero GLB is authored as a headless bpy 4.2 script. Run `npm run assets:blender [-- --only k1,k2]` to write `public/assets/models/<key>.glb` and `tools/blender/manifest.json`. Scripts use `tools/blender/lib/olw.py` (`Builder` → `finish()` bakes COLOR_0, AO, edge light and box UVs; then `validate()` → `export_glb`). `validate()` fails a build on floating islands, a base that is not at y = 0, a triangle budget overrun, or a size more than 25 % off. Use `lib/render_sheet.py` for contact sheets. Do not hand-edit the GLBs.
- The authoring frame is Z up with the front at −Y and 1 unit = 1 tile, and the origin is the footprint centre on the ground. The game sees the same numbers with the front at −Z.
- Characters come from `tools/blender/characters/build_characters.py`: `juju.glb`, `npc-base.glb` and `npc-male.glb` (a boyish build with short or curly hair, used for baba and moomoo). They share one rig with the clips idle, walk, run, wave and nod. Juju faces +Z. Hero characters stay within **8,000 triangles** each.
- Register a key in `assets/hero/index.ts` `HERO_ASSETS` so the normal preload covers it. The boot preload (props + characters) runs behind the title screen with a 12 s timeout per GLB (`GLB_TIMEOUT_MS`), and the first location waits for it. A GLB that is missing or times out falls back to the procedural builder. `npm run assets:build` (legacy code exporter) skips every key in the Blender manifest.
- Name region-specific keys with a region prefix (for example `uae-date-palm`, `uae-shade-canopy`) so regional vocabularies stay separate.

### Dressing density (`world/dressing.ts`)
- Clutter goes **against** things, never alone on open stone. Put dense `flower-bed`s along wall feet and façades, add planters or barrels by doors, and put flowers at lamp feet. A lone cluster in the middle of a street reads as a lollipop, so `thin()` drops loose `flower-cluster`/`heather` on paving or road unless the tile is a front garden. Front gardens never sit on a kerb tile.
- Per 10 tiles of street frontage, aim for about 2 lamps, 1 bench, 2 or 3 planters/barrels/crates, and 4 to 6 flower beds. Grass verges get drifts (`drift`, grass only). Place trees on grass or in plazas, one per 3 to 5 tiles. Swap in each region's own furniture and flora; the densities stay the same.
- Use one boundary-wall line per edge (dry-stone in Scotland, compound walls in the UAE, and so on). Benchmark walls claim their tiles so the auto edge-walls never double them.
- The café terrace goes in front of the façade and keeps a clear door lane. Chairs face across each table.
- Never block `reserved` tiles, road/path tiles or interaction zones. Check with the BFS in the capture script.

### Lighting (`rendering/lighting.ts`, `sky.ts`, `backdrop.ts`)
There are four presets: `morning`, `afternoon`, `evening` and `night`.
- **Days** use a warm sun (`#ffe2b8`, intensity 1.2), a hemi fill of 0.55 (sky `#d4dfe8` / ground `#b39474`), shadow darkness 0.45, exposure 1.05 and contrast 1.08.
- **Evening** uses a low golden sun from the west with a lavender fill. The lamps come on with a pool strength of 1.0.
- **Night** is a *cool world with warm human spaces*: moon `#8ea4d8` at 0.34 and hemi `#6a7fb4` at 0.46, against emissive windows and lamp heads, additive lamp-glow discs, a pool of 4 PointLights (2 on mobile, pool 1.9) that follows the lamps nearest the player, and a weighted warm spot in front of the café.
- Shadows are PCF, 2048 (1024 on mobile).
- The sky dome and gradient clouds sit in front of a layered skyline backdrop that picks up each preset's atmosphere. Each region supplies its own skyline (castle for Edinburgh, towers for Dubai, and so on).
- Regions may tune sun intensity and hemi colours within the global style (for example a harder, whiter sun for the UAE and Greece), but keep the warm-key / blue-fill relationship.

### Camera and occlusion (`rendering/camera.ts`, `occlusion.ts`)
- **Camera.** Fixed yaw, south of the player looking north. Elevation is 27° on desktop (fov 0.8, distance 10), 28° on phones (fov 0.84, distance 10.5) and 30° in portrait (fov 1.0). The look-at is 1.0 above the feet and 3.5 ahead. Zoom runs from 7.5 to 15, and closer is lower. Dev: `__game.setCamera({elev, fov, lookY, lookAhead, lead, dist})` and `__game.setTime(t)`.
- **Occlusion.** Buildings between the camera and Juju fade to 0.28 as clean shells: a depth-only twin is drawn just before the faded copy, so no interior walls show. Character decals use `DECAL_ALPHA_INDEX` so they draw before it. A building the camera is inside (within 2.2 u) fades out completely.

### Validator
In dev, `window.__validate()` (`world/validate.ts`) runs over the benchmark region. It lists every placed piece (ground offset, scale fixes, size) and warns on pieces floating or sunk, props inside buildings, solid props blocking street tiles, and solids closing a 1-tile sidewalk. Keep it at **0 warnings**. Walkability (BFS from the spawn to the café and every zone, NPC and pickup) is checked by the capture scripts.

### Performance budget
At the benchmark views the scene measures about **350 to 395 draw calls per frame including the shadow pass** (`__stats()`), about 70 to 100 active meshes, 134 materials and about 245 meshes. Keep new locations at **≤ 400 draw calls** (hard ceiling 420). Every new variant string (`c=`, preset, footprint) is a new batch, so reuse variants. The GLBs total about 3.7 MB (characters about 1.4 MB) and are not in the PWA precache (the glob excludes `.glb`), so offline play uses the procedural fallbacks.

---

## 3. Regional art bibles

### 3.1 Scotland / Edinburgh Art Bible

**Benchmark.** The Royal Mile spawn street and the Royal Mile Café in `edinburgh_oldtown` are the Scotland target. New Scottish locations should match them. The acceptance captures are in `docs/screenshots/benchmark/`:
`01-juju-front`, `02-juju-three-quarter`, `03-juju-walking`, `04-cottage-street-day`, `05-cafe-day`, `06-wide-horizon`, `07-evening`, `08-night` and `09-mobile-portrait` (390×844).

**Target.** A cozy miniature Scottish/European village with a hand-painted look. Use warm cream/sandstone stone, slate and muted terracotta roofs, a lot of greenery and small flowers, and soft warm light. Keep saturation controlled: nothing neon, no pure black or pure white on large surfaces.

#### Palette (`rendering/materials.ts` PALETTE, kit `TINTS`)
| role | hex |
|---|---|
| stone / harl walls | cream `#f0e2c6`, creamSoft `#e6dac4`, stoneWarm `#c9b89a`, greyStone `#b8b0a2`, sand `#d4c3a0`, rose `#dcc2b0` |
| roofs | slate `#6f7480` / slateBlue `#66707c`, muted terracotta `#b8694a` (softened toward warm grey by `mix2`) |
| greens | moss `#6b8a4e`, grass `#93a86e`, grassLight `#a4b47c`, olive `#7f8b56`, mossDark `#55703f`, sage `#8fa87c` |
| flowers | dustyRose `#d49a9a`, cream `#f1e7d0`, mutedYellow `#e6c96a`, lavender `#b59bd1`, heather `#9b7fb0` |
| accents | awning red `#b34d47`, car teal `#5f8f8a`, post red `#c03a3a`, iron `#2d2b2e`, wood `#8a5a3a` |
| ground | street setts `#ada08b`, flags/cobble `#c2b49c`, kerb `#e4d8bf`, pavement `#d2c6b1` |
| dry-stone wall | blocks `#bfb192`–`#e1d4b8`, coping `#e3d7bd`, mortar `#9d917c` |

#### Building vocabulary
- **Buildings** (`assets/kit/architecture/`): `presetVariant(name, w, d)` gives a single thin-instance batch per preset and footprint. Cottages: `stoneCrow`, `creamTerra`, `greyDormer`, `creamCrow2`, `greyMoss`, `sandDormer2`, `rose2`, `bothy`, `whiteSlate`. Others: `shop`, `shopGrey`, `cafe`, `tenementSand|Grey|Rose`. Details include recessed windows with frames, mullions, curtains, shutters and flower boxes, arched doors with fanlights, quoins, crow-steps, dormers, chimneys with pots, moss, a lantern, and ivy (a dense leaf mass on one corner plus an eave drape).

#### Flora
- Hero trees `tree-oak-a|b`, `tree-small`, `tree-pine`; shrubs `bush-a|b`; `ivy-card`.
- Clutter `flower-cluster` (`c=`), `flower-bed` (`c=`, `d=`), `heather`, `grass-tuft`.
- Moss on roofs and wall copings, ivy on corners and eaves.

#### Street furniture
- Hero pieces (`assets/hero/`, GLB with a procedural fallback): `bench`, `lamp-post` (Victorian), `signpost`, `stone-wall` (dry-stone), `fence`, `fence-gate`, `planter`, `car`, `post-box`, `cafe-table`, `cafe-chair`, `barrel`, `crate`, `player`.
- Procedural clutter: `chalkboard`, `phone-box`, `well`, `fountain`.
- Ground: dark street setts and pale flags with a raised kerb and gutter. One dry-stone wall line per edge.

### 3.2 UAE Art Bible

**Target.** Bright, modern and generous: clean stone and glass under a strong sun, broad shaded public spaces, and carefully irrigated planting against warm sand tones. It should feel polished and family-friendly, not sterile. Shade is a design element: canopies, arcades and palm shadow shape every walkable space.

#### Materials palette
| material | hex | notes |
|---|---|---|
| stucco | `#f5eed8` | villa and podium walls; fine render texture, low roughness variation |
| white | `#f8f4ed` | trims, parapets, shade structures; warm white, never pure white |
| limestone | `#e8ddc8` | cladding, compound walls, planters |
| marble | `#f0ece4` | plazas, fountain edges, lobbies; low roughness, subtle veining |
| tinted glass | `#1a2535` | tower curtain walls and shopfronts; strong reflections, emissive at night |
| brushed metal | `#8a8e95` | mullions, bollards, railings, canopy frames; anisotropic-looking roughness |
| warm wood | `#8a5a3a` | screens, slatted shade panels, café furniture, doors |
| asphalt | `#4a4840` | roads; warm dark grey, not black |
| paving tile | `#ddd4bc` | pavements and plazas; large-format tiles with fine joints |

Accent colours stay restrained: bougainvillea magenta and pink, palm and hedge greens, and occasional teal or deep blue in tiles and water. Add these to `PALETTE` as region keys when the UAE kit is built.

#### Dubai Downtown
- Polished stone plazas with large-format paving and marble inlays.
- Fountain edges and reflecting pools with low marble copings.
- Tower podiums: two to four storeys of retail frontage under setback towers.
- Retail frontage with tall glazed shopfronts, metal frames and signage bands (no real brand names or logos).
- Café terraces under umbrellas or fixed canopies, set back from the walkway.
- Shaded walkways: colonnades, pergolas and fabric sails along every main route.
- Glass, steel and stone as the dominant materials.
- A varied skyline backdrop: towers of different heights, crowns and setbacks, never a uniform wall. Do not reproduce identifiable real landmarks.

#### Abu Dhabi residential (Yas / villa areas)
- Low-rise villas of two storeys with flat roofs, parapets and roof terraces.
- Compound walls in stucco or limestone with gates and planting over the top.
- Broad roads with wide medians and generous pavements.
- Roundabouts with ornamental planting: palms, clipped hedges and flower beds.
- Family plazas with shade structures, seating, play areas and small fountains.
- Carports with metal frames and fabric or slatted shade roofs.

#### UAE flora
- **Use:** date palm, ghaf tree, bougainvillea, desert grass, clipped hedges.
- **Do not use:** oak, heather, ivy or moss.
- Planting sits in defined beds, planters and irrigated verges with clean edges; open ground is sand or gravel, not lawn drifts.

#### UAE street furniture
- **Use:** modern bollards, shade structures (canopies, sails, pergolas), ornamental planters, concrete seating, tactile paving at crossings, pedestrian arcades.
- **Do not use:** Victorian lamp posts, post boxes or dry-stone walls.
- Lighting is modern: slim pole lights, bollard lights and uplights on palms.

#### UAE anti-goals
- No Scottish cottage vocabulary.
- No heather, slate, crow-steps, dormer windows or Edinburgh stone setts in any Dubai or Abu Dhabi location.
- No pitched slate or terracotta roofs on villas, and no moss or weathering stains on stone.

### 3.3 London
- **Architecture:** brick terraces (yellow London stock and red brick) with white stucco ground floors, sash windows and front steps; a mix of Georgian, Victorian and modern buildings.
- **Street:** black iron railings along areas and front gardens, wide pavements of grey flags, pedestrian crossings.
- **Flora:** London plane trees along streets, square gardens behind railings.
- **Furniture and vehicles:** red buses, black cabs, modern bus shelters, red phone and post boxes.
- **Light:** soft, often overcast; slightly cooler fill than Scotland.

### 3.4 Amman / Jordan
- **Architecture:** warm beige limestone on nearly every façade, flat roofs, boxy forms stepping up hillside terraces.
- **Street:** steep stairs and terraced streets, limestone retaining walls.
- **Flora:** Jordan pine, olive trees, potted plants on terraces and balconies.
- **Culture:** outdoor café culture with low tables and chairs on terraces and pavements.
- **Detail:** traditional patterned tiles on floors, thresholds and fountain surrounds.
- **Light:** warm and dry, golden in the evening against the stone.

### 3.5 Italy / Mediterranean
- **Architecture:** terracotta roofs, golden and ochre stone or render, shuttered windows (green or brown), balconies with ironwork.
- **Street:** piazza paving in stone setts or large slabs, central fountains, arcades.
- **Flora:** olive trees, cypress and umbrella pine; potted lemons and geraniums.
- **Light:** warm golden afternoons with long shadows.

### 3.6 Greece
- **Architecture:** white cubic buildings with rounded edges, blue domes, blue doors and shutters, outdoor stairs.
- **Street:** whitewashed paving outlines, narrow lanes, sea-facing terraces.
- **Flora:** bougainvillea, olive trees, potted herbs.
- **Light:** intense sun, high contrast, crisp shadows and a deep blue sky and sea. Keep whites warm-tinted so they do not clip.

### 3.7 Germany
- **Architecture:** steep pitched roofs in dark tile or slate, half-timbered façades with dark beams and painted infill, stepped gables, window boxes.
- **Street:** cobbled squares, market fountains, ornate wrought-iron signs and railings.
- **Flora:** darker, deeper greens: beech, linden and spruce; hedges and window-box flowers.
- **Light:** softer and slightly cooler than the south.
