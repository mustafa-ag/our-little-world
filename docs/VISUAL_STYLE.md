# Visual style: "Storybook Low-Poly"

These are the art rules for the 3D build (`src/app3d/`). The benchmark is the Royal Mile spawn street and the Royal Mile Café in `edinburgh_oldtown`. New locations should match it. Reference captures are in `docs/screenshots/benchmark/`:
`spawn-{morning,afternoon,evening,night}.jpg`, `cafe-afternoon.jpg`, `cottage-closeup.jpg`, `player-closeup.jpg`, `mobile-{spawn,cafe}.jpg`.

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

## Materials and textures
- **Vertex colour × shared material.** Hue lives in vertex colours and materials are shared, so a merged prop is 1 to 3 submeshes. Never merge parts with *interleaved* materials: every material switch becomes a submesh and a draw call. Ground clutter (`flower-cluster`, `flower-bed`, `heather`, `grass-tuft`) and pickups use a single `flat("#ffffff")` material.
- **Hand-painted DynamicTextures** (`Materials.textured(style, hex, scale)`; styles are `stone`, `cobble`, `roof`, `slate`, `planks`, `grass`, `awning`, `paving`). They are 256 px for stone, roof, slate and cobble and 128 px for the rest, and are painted once per (style, hex). Paint them on a light base and let vertex tints carry the colour (kit `SLOT_BASE`).
- **Slots.** Hero pieces use `olw_stone`, `olw_wood` and `olw_roof_tile`/`olw_slate` (textured), `olw_paint`, `olw_foliage` and `olw_metal` (white × vertex colour), `olw_glass`, `olw_glass_emissive` (a night glow, registered with lighting), and the character roles `olw_skin|hair|top|bottom|shoes|face`. The textured slot tint is multiplied by the texture, so bright cream needs `olw_paint`.
- **Ground.** The splat albedo is 6 to 10 px per tile, with warped soft edges and a greyscale detail grain in world UV. `t_path` renders as darker setts (the street) and `t_cobble` as pale flags (sidewalks and squares). Where a sidewalk meets a street it gets a pale kerb band and a dark joint.
- Shading: crowns and bushes use smooth-shaded welded icospheres (`ico(..., {flat:false})`). Architecture and props stay flat-shaded.

## Kit vocabulary
- **Buildings** (`assets/kit/architecture/`): `presetVariant(name, w, d)` gives a single thin-instance batch per preset and footprint. Cottages: `stoneCrow`, `creamTerra`, `greyDormer`, `creamCrow2`, `greyMoss`, `sandDormer2`, `rose2`, `bothy`, `whiteSlate`. Others: `shop`, `shopGrey`, `cafe`, `tenementSand|Grey|Rose`. Details include recessed windows with frames, mullions, curtains, shutters and flower boxes, arched doors with fanlights, quoins, crow-steps, dormers, chimneys with pots, moss, a lantern, and ivy (a dense leaf mass on one corner plus an eave drape).
- **Hero pieces** (`assets/hero/`, GLB with a procedural fallback): `tree-oak-a|b`, `tree-small`, `tree-pine`, `bush-a|b`, `bench`, `lamp-post`, `signpost`, `stone-wall`, `fence`, `fence-gate`, `planter`, `car`, `post-box`, `cafe-table`, `cafe-chair`, `ivy-card`, `barrel`, `crate`, `player`.
- **Procedural clutter**: `flower-cluster` (`c=`), `flower-bed` (`c=`, `d=`), `heather`, `grass-tuft`, `chalkboard`, `phone-box`, `well`, `fountain`.

## GLB pipeline
1. Author a builder in `assets/hero/*.ts` that returns one merged mesh at the origin, base at y=0 and front at −Z, built only from `geo.ts` helpers and slots.
2. Register it in `hero/index.ts` `HERO_ASSETS` (key, `glb(key)`, `build`, optional `variant`, `shadow`, `merge`), then call `am.registerHero(key)` in the kit module.
3. Run `npm run assets:build` (all preloaded keys) or `npm run assets:build -- key1 key2`. This writes `public/assets/models/<key>.glb`, welded and quantized. Keep each piece under about 40 KB, except the car (~60 KB) and player (~100 KB).
4. `preload: false` marks export-only heroes (`cottage-1s`, `cottage-2s`, `cafe`). The game never fetches them, because buildings come from the procedural kit. They are built only with `--all` or by naming them.

## Dressing density (`world/dressing.ts`)
- Clutter goes **against** things, never alone on open stone. Put dense `flower-bed`s along wall feet and façades, add planters or barrels by doors, and put flowers at lamp feet. A lone cluster in the middle of a street reads as a lollipop.
- Per 10 tiles of street frontage, aim for about 2 lamps, 1 bench, 2 or 3 planters/barrels/crates, and 4 to 6 flower beds. Grass verges get drifts (`drift`, grass only). Place trees on grass or in plazas, one per 3 to 5 tiles.
- Use one dry-stone wall line per edge. Benchmark walls claim their tiles so the auto edge-walls never double them.
- The café terrace goes in front of the façade and keeps a clear door lane. Chairs face across each table.
- Never block `reserved` tiles, road/path tiles or interaction zones. Check with the BFS in the capture script.

## Lighting (`rendering/lighting.ts`)
The presets are `morning`, `afternoon`, `evening` and `night`. Days use a warm sun (`#ffe4bc` to `#ffe8c8`, intensity 1.2), hemi 0.55, and shadow darkness 0.52. Evening uses sun `#ffba78` from the west with rosy fog. Night uses a blue hemi (`#7890cc`, 0.7) with lamps and windows glowing (`registerGlow`). Grading uses the in-shader contrast of about 1.07 plus a warm multiply vignette, with no post-process passes. Shadows come from a PCF shadow map, 2048 on desktop and 1024 on mobile, with a ±22 u ortho frustum that follows the player.

## Camera (`rendering/camera.ts`)
Fixed yaw, south of the player looking north, with 38° pitch (36° on phones). Distance is 10.5 (11.5 on mobile), with wheel/pinch zoom between 7.5 and 13. The look-at is 0.6 above the feet. FOV is 0.62 on desktop, 0.72 on mobile and 0.9 in portrait. Keep tall buildings about 5 or more tiles south of paths the player uses a lot, because there is no occlusion fade.

## Performance budget
At the benchmark views the scene measures about **330 to 345 draw calls per frame including the shadow pass**, about 85 to 95 active meshes, about 66 materials and 232 meshes. Keep new locations at **≤ 380 draw calls** (hard ceiling 420). Every new variant string (`c=`, preset, footprint) is a new batch, so reuse variants. The hero GLBs total about 540 KB and are not in the PWA precache (the glob excludes `.glb`), so offline play uses the procedural fallbacks.
