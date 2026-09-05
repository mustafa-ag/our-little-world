# HD Visual Audit

Date: August 30, 2026

## Scope

This audit covers the current visual runtime in `our-little-world-hd` before any migration work.

Inspected directly:

- `package.json`
- `README.md`
- `src/main.ts`
- `src/game/constants.ts`
- `src/game/textures.ts`
- `src/game/worldgen.ts`
- `src/game/characters.ts`
- `src/game/objects/Player.ts`
- `src/game/objects/NPC.ts`
- `src/game/scenes/**`
- `src/game/ui/**`
- `src/game/data/locations.ts`
- `src/game/data/mapkit.ts`
- `public/assets/**`

Repository reality checks:

- `src/game/config.ts` does not exist.
- `src/game/visual/**` does not exist.
- `VisualAssetDef`, `getVisualTexture`, `applyVisual`, `HD_SLICE`, and `isHdSlice` do not exist anywhere in the repository.
- The only attachment available in the task workspace was the written brief. No local reference image file was present to inspect.

## Executive Summary

The current game is still a procedural pixel-art runtime with some hand-authored district layouts layered on top. The existing `public/assets/hd/**` directory contains a promising but disconnected SVG asset library, not a live visual pipeline.

Current state in plain terms:

- Runtime visuals are built almost entirely by `src/game/textures.ts`.
- There is no external asset preload stage.
- There is no HD manifest or asset metadata system in code.
- There is no category-specific filtering system.
- There is no reusable cast-shadow system.
- Y-based depth sorting exists for many world objects, but it is still simple and sprite-centric.
- All 20 playable world locations still render through the same legacy procedural texture registry.

Bottom line:

- `FINAL_HD` runtime coverage today: none.
- `FINAL_PIXEL_CHARACTER` runtime coverage today: none, because the characters are not explicitly registered as a final category and still live inside the legacy procedural pipeline.

## Exact Current Renderer Configuration

Current Phaser game config from `src/main.ts`:

- `type: Phaser.AUTO`
- `parent: "game"`
- `backgroundColor: "#8ecae6"`
- `pixelArt: true`
- `roundPixels: true`
- `scale.mode: Phaser.Scale.RESIZE`
- `scale.autoCenter: Phaser.Scale.CENTER_BOTH`
- `scale.width: window.innerWidth`
- `scale.height: window.innerHeight`
- `physics.default: "arcade"`
- `physics.arcade.gravity: { x: 0, y: 0 }`
- `physics.arcade.debug: false`
- Scene order:
  - `BootScene`
  - `PreloadScene`
  - `TitleScene`
  - `WorldScene`
  - `HouseScene`
  - `WorldMapScene`
  - `DrivingScene`
  - `UIScene`

Important renderer implications:

- `pixelArt: true` and `roundPixels: true` are global.
- No explicit `antialias` override is present in `src/main.ts`.
- No scene applies category-specific filtering to distinguish HD environments from pixel characters.
- Canvas-generated textures explicitly disable smoothing with `ctx.imageSmoothingEnabled = false` in both `textures.ts` and `characters.ts`.

## Exact Preload Lifecycle

The project does not currently use a real preload pipeline for visual assets.

Actual startup flow:

1. `BootScene.create()`
   - Sets camera background color to `#8ecae6`.
   - Immediately starts `PreloadScene`.
2. `PreloadScene.create()`
   - Draws the text `loading our world...`.
   - Calls `store.init()`.
   - Calls `buildAllTextures(this)`.
   - Calls `rebuildPlayerTexture(this, store.state.outfit)`.
   - Waits `120ms`.
   - Starts `TitleScene`.
3. `TitleScene.startGame()`
   - Marks the save as started.
   - Fades out the camera.
   - Starts `WorldScene`.

What is not happening:

- No scene implements `preload()`.
- No `this.load.image(...)`.
- No `this.load.svg(...)`.
- No `this.load.spritesheet(...)`.
- No atlas, JSON, tilemap, or audio preload for visuals.
- No manifest parsing.
- No `public/assets/hd/**` load step.

Conclusion:

- "Preload" is currently "generate everything procedurally in memory."

## Current HD Manifest System

There is no HD manifest system in code today.

Observed facts:

- No source references to `assets/hd` or `public/assets/hd`.
- No runtime registry for source size, logical display size, origin, category, filter mode, or audit state.
- No mapping layer between gameplay keys and HD asset sources.
- No metadata-driven `applyVisual` helper.

What does exist:

- `public/assets/hd/**` with 56 SVG files.
- Folder breakdown:
  - `terrain`: 12
  - `buildings`: 5
  - `characters`: 12
  - `effects`: 6
  - `portraits`: 2
  - `props`: 14
  - `ui`: 4
  - `vehicles`: 1

Representative on-disk samples:

- `public/assets/hd/terrain/grass.svg` is a 512x512 smooth SVG ground material.
- `public/assets/hd/buildings/yas-home.svg` is a 520x460 illustrated building card with baked contact shadow.
- `public/assets/hd/characters/juju-down.svg` is a 192x256 smooth vector illustration, not an intentional crisp pixel sprite.
- `public/assets/hd/effects/character-shadow.svg` is a 120x48 ellipse shadow asset.

Interpretation:

- The disk assets suggest an abandoned or incomplete HD experiment.
- The character SVGs do not match the written target of intentional pixel-art characters.
- The HD folder is currently an asset stash, not a system.

## Current Legacy Procedural Pipeline

### Registry entry point

`buildAllTextures(scene)` in `src/game/textures.ts` is the live visual registry.

It constructs:

- 23 terrain tiles
- 29 props/effects
- 48 building textures
- 9 landmarks
- 10 furniture textures
- 7 UI textures
- 3 vehicle textures
- 9 character sprite sheets via `makeCharacterTexture`

That is:

- 129 procedural non-character runtime texture keys
- 9 runtime character texture keys

### Character generation

Character visuals are generated in `src/game/characters.ts`.

Current behavior:

- Native cell size is `16x16`.
- Sheet layout is `3 columns x 3 rows`.
- Frames are generated into a `CanvasTexture`.
- Smoothing is disabled.
- The player outfit recolor path rebuilds `char_her` only.

Generated runtime character keys:

- `char_her`
- `char_moomoo`
- `char_mama`
- `char_baba`
- `char_fadwa`
- `char_nour`
- `char_hazel`
- `char_rhiannon`
- `char_chloe`

### World rendering

`WorldScene` composes the world like this:

- `generateWorld()` produces logical ground, blocked cells, props, zones, collectibles, labels, and NPC spots.
- `drawGround()` batches every tile into one `RenderTexture`.
- `buildCollision()` converts blocked cells into invisible Arcade static rectangles.
- `buildProps()` instantiates each prop/building/landmark as its own `Image`.
- `buildNpcs()` instantiates `NPC` wrappers with a visible sprite and separate label.

### Other scene rendering

- `HouseScene` draws wood floor tiles into a `RenderTexture`, then adds furniture sprites and vector-like `Graphics` wall layers.
- `DrivingScene` uses `TileSprite` for grass and road plus `Graphics` lane lines and weather tint.
- `WorldMapScene` is mostly `Graphics` and `Text`, with `ui_heart` markers.
- `UIScene` is mostly `Graphics`, `Text`, and a few procedural UI icons.

## Filtering Audit

Current filtering behavior does not match the target brief.

What exists:

- Global `pixelArt: true`
- Global `roundPixels: true`
- Canvas texture generation with smoothing disabled

What is missing:

- No `nearest` vs `linear` metadata by asset category
- No environment-specific smoothing path
- No UI-specific filter decisions
- No mixed camera strategy for smooth HD world + crisp pixel characters

Practical consequence:

- The current runtime is optimized for a single visual philosophy: generated pixel-art textures.
- It is not yet prepared for crisp pixel characters over smooth HD environment art.

## Depth and Sorting Audit

What is working:

- `WorldScene` props are usually placed with `setDepth(p.y)`.
- `Player.preUpdate()` sets player depth to `this.y`.
- `NPC.place()` sets sprite depth to `y` and label depth to `y + 1`.
- `HouseScene` furniture uses `setDepth(f.y)`.
- Jeep visuals use `player.y + 1` or `player.y + 2`.

What is still missing:

- No explicit "contact Y" metadata separate from sprite origin.
- No standardized visual-footprint abstraction for buildings that extend far upward.
- No foreground layer system for overhangs or facade cut-ins.
- No shared depth helper or asset-level depth offset metadata.

Assessment:

- Current world depth sorting is useful and already points in the right direction.
- It is still `PARTIAL`, not a final HD-ready depth architecture.

## Shadows and Lighting Audit

Current lighting/shadow tools:

- `o_shadow` is a small procedural ellipse used under the player and NPCs.
- `WorldScene.applyAtmosphere()` adds a single full-screen tinted rectangle.
- `DrivingScene` adds a world tint rectangle and optional simple rain streaks.

What is absent:

- No cast shadow system for tall objects
- No directional shadow metadata
- No separate contact vs cast shadow categories
- No reusable shadow helper
- No consistent shadow direction per scene
- No use of the SVG shadow assets in `public/assets/hd/effects`

Assessment:

- Contact shadows exist in a minimal form.
- Cast shadows are effectively missing at runtime.
- Lighting is currently atmospheric tint, not scene lighting design.

Audit state:

- Contact shadow system: `TEMPORARY`
- Cast shadow system: `MISSING`
- Lighting model: `PARTIAL`

## Ground System Audit

The ground renderer is still firmly tile-first.

Current behavior:

- All ground semantics remain bound to `TILE = 16`.
- `WorldScene.drawGround()` draws every logical ground key directly at `x * TILE`, `y * TILE`.
- Ground variation comes from alternate tile keys and authored path/surface layouts.
- Some authored districts use better composition than others through `mapkit` helpers.

Current strengths:

- Logical gameplay geometry is already cleanly separated from sprite dimensions.
- The district data model is strong enough to support richer visual composition later.

Current weaknesses:

- Ground materials still read as repeated 16x16 tiles.
- No HD chunking, decal overlays, curb layers, shoreline treatment, or seam-breaking system.
- No runtime support for layered terrain materials.

Audit state:

- Exterior ground: `LEGACY_FALLBACK`

## Building Audit

Current buildings are procedural textures of varying quality and size.

Strengths:

- Many location-specific building families already exist.
- Building artwork already extends upward beyond the ground contact point.
- Some POIs carry custom `footprint` metadata in `locations.ts`, which is a valuable pattern to keep.

Weaknesses:

- The pipeline is still a procedural texture generator, not a metadata-driven visual asset model.
- No layered facades, foreground trims, or depth-separated building pieces.
- No cast shadows.
- No HD facade source art currently wired into runtime.

Audit state:

- Exterior buildings: `LEGACY_FALLBACK`

## Camera Audit

Current camera behavior:

- `WorldScene` uses smooth follow with lerp `(0.15, 0.15)`.
- `WorldScene` zoom is clamped from `1.35` to `2.15` based on viewport height.
- `HouseScene` uses smooth follow with lerp `(0.2, 0.2)`.
- `HouseScene` zoom is integer-rounded and clamped from `2` to `6`.
- `WorldMapScene` starts at zoom `0.72` and supports free pan/zoom.

Risk for the target style:

- Global `roundPixels: true` is friendly for pixel art but hostile to a smooth HD environment layer.
- A mixed nearest/linear presentation will need a more deliberate camera and snapping strategy.

Audit state:

- Camera presentation: `PARTIAL`

## Scene-by-Scene Coverage

| Scene | Current visual sources | Audit state |
| --- | --- | --- |
| `BootScene` | Camera background color only | `TEMPORARY` |
| `PreloadScene` | Text only, no external asset loading | `TEMPORARY` |
| `TitleScene` | Gradient `Graphics` + `ui_heart` | `PARTIAL` |
| `WorldScene` | Procedural ground, props, buildings, landmarks, vehicles, characters, tint wash | `LEGACY_FALLBACK` |
| `HouseScene` | Procedural floor/furniture + `Graphics` walls + player sprite | `LEGACY_FALLBACK` |
| `DrivingScene` | Procedural road/grass/vehicles + `Graphics` effects | `LEGACY_FALLBACK` |
| `WorldMapScene` | `Graphics` atlas + `Text` + `ui_heart` pins | `PARTIAL` |
| `UIScene` | Procedural UI icons/buttons + `Graphics` panels + `Text` | `PARTIAL` |
| `PhoneOverlay` | `Graphics` and `Text` only | `PARTIAL` |
| `minigames.ts` overlays | `Graphics`, `Text`, and selected runtime textures | `PARTIAL` |

## Playable World Coverage

Playable location scope identified in `LOCATIONS`:

- `abudhabi_yas`
- `abudhabi_noya`
- `abudhabi_yasmall`
- `abudhabi_city`
- `abudhabi_corniche`
- `abudhabi_saadiyat`
- `abudhabi_hudayriyat`
- `dubai_downtown`
- `dubai_szr`
- `dubai_damac`
- `dubai_oasis`
- `dubai_hills`
- `london_westminster`
- `london_westend`
- `edinburgh_oldtown`
- `edinburgh_dean`
- `edinburgh_uni`
- `leicester`
- `germany`
- `amman`

Coverage conclusion:

- All 20 playable locations currently depend on the same legacy procedural runtime.
- None currently render through a real HD asset manifest.

## Runtime Texture Key Inventory

The lists below are runtime texture keys that can be reliably identified from code.

### Terrain keys

Scenes using this category:

- `WorldScene`
- `HouseScene`
- `DrivingScene`

Keys:

- `t_asphalt`
- `t_brick_path`
- `t_carpet`
- `t_cobble`
- `t_crossing`
- `t_golf`
- `t_grass`
- `t_grass2`
- `t_hedge`
- `t_lawn`
- `t_parking`
- `t_path`
- `t_pavement`
- `t_paving_dark`
- `t_paving_light`
- `t_plaza_stone`
- `t_road`
- `t_road_lane`
- `t_sand`
- `t_snow`
- `t_tile`
- `t_water`
- `t_wood`

### Prop and effect keys

Scenes using this category:

- `WorldScene`
- `DrivingScene`
- `HouseScene` indirectly for shop and interaction references
- `minigames.ts` for landmark photo fallback

Keys:

- `o_bench`
- `o_bin`
- `o_bollard`
- `o_bus_red`
- `o_bush`
- `o_cab`
- `o_cat`
- `o_fence_h`
- `o_fence_v`
- `o_ferrari`
- `o_flower_pink`
- `o_flower_yellow`
- `o_foodtruck`
- `o_fountain`
- `o_lamp`
- `o_lamp_ldn`
- `o_note`
- `o_palm`
- `o_phonebox`
- `o_pine`
- `o_planter`
- `o_portal`
- `o_postcard`
- `o_railing`
- `o_rock`
- `o_shadow`
- `o_sign`
- `o_tree`
- `o_well`

### Building keys

Scenes using this category:

- `WorldScene`

Keys:

- `b_adnoc`
- `b_cafe`
- `b_cream_comm`
- `b_dubai_hills_mall`
- `b_dubai_mall`
- `b_fachwerk_a`
- `b_fachwerk_b`
- `b_front_cream`
- `b_front_red`
- `b_glass_a`
- `b_glass_b`
- `b_glass_c`
- `b_house_blue`
- `b_house_green`
- `b_house_purple`
- `b_house_red`
- `b_mall`
- `b_mansion`
- `b_mosque_acres`
- `b_pub`
- `b_residence`
- `b_ritz`
- `b_saddle`
- `b_salon`
- `b_sandstone`
- `b_shop`
- `b_shopfront_ldn`
- `b_so1`
- `b_so2`
- `b_soho_narrow`
- `b_spinneys`
- `b_stucco`
- `b_tenement`
- `b_terrace_brick`
- `b_tower`
- `b_town_blue`
- `b_town_blue2`
- `b_townhouse_cream`
- `b_townhouse_red`
- `b_uni`
- `b_villa_modern`
- `b_villa_sand`
- `b_villa_terra`
- `b_villa_terra2`
- `b_villa_terra3`
- `b_waitrose`
- `b_wellcourt`
- `b_yas_mall`

### Landmark keys

Scenes using this category:

- `WorldScene`
- `minigames.ts` photo activity

Keys:

- `lm_bigben`
- `lm_burj`
- `lm_castle`
- `lm_citadel`
- `lm_clocktower`
- `lm_mosque`
- `lm_roemer`
- `lm_westminster`

Note:

- `textures.ts` also defines `lm_brandenburg`.
- It is currently present in the runtime registry but not referenced by the inspected scene/data set.

### Furniture keys

Scenes using this category:

- `HouseScene`
- `UIScene` shop overlay

Keys:

- `f_bed`
- `f_bookshelf`
- `f_chair`
- `f_fridge`
- `f_lamp`
- `f_plant`
- `f_rug`
- `f_sofa`
- `f_table`
- `f_tv`

### UI keys

Scenes using this category:

- `TitleScene`
- `WorldScene`
- `HouseScene`
- `DrivingScene`
- `WorldMapScene`
- `UIScene`
- `minigames.ts`

Keys:

- `ui_btn`
- `ui_coin`
- `ui_heart`
- `ui_joy_base`
- `ui_joy_thumb`
- `ui_phone`
- `ui_star`

### Vehicle keys

Scenes using this category:

- `WorldScene`
- `DrivingScene`

Keys:

- `v_car_blue`
- `v_car_red`
- `v_jeep_blue`

### Character keys

Scenes using this category:

- `WorldScene`
- `HouseScene`
- `UIScene` and `minigames.ts` for photo/gameplay UI

Keys:

- `char_her`
- `char_moomoo`
- `char_mama`
- `char_baba`
- `char_fadwa`
- `char_nour`
- `char_hazel`
- `char_rhiannon`
- `char_chloe`

## On-Disk HD Asset Inventory (Not Wired to Runtime)

These are files on disk, not current runtime texture keys.

### Terrain

- `terrain/driveway.svg`
- `terrain/grass-detail-01.svg`
- `terrain/grass-detail-02.svg`
- `terrain/grass.svg`
- `terrain/path.svg`
- `terrain/pavement.svg`
- `terrain/road.svg`
- `terrain/sand.svg`
- `terrain/sidewalk.svg`
- `terrain/water-base.svg`
- `terrain/water-shine.svg`
- `terrain/water-wave.svg`

### Buildings

- `buildings/yas-home.svg`
- `buildings/yas-landmark.svg`
- `buildings/yas-villa-cream.svg`
- `buildings/yas-villa-modern.svg`
- `buildings/yas-villa-sand.svg`

### Characters

- `characters/baba-down-step.svg`
- `characters/baba-down.svg`
- `characters/baba-side-step.svg`
- `characters/baba-side.svg`
- `characters/baba-up-step.svg`
- `characters/baba-up.svg`
- `characters/juju-down-step.svg`
- `characters/juju-down.svg`
- `characters/juju-side-step.svg`
- `characters/juju-side.svg`
- `characters/juju-up-step.svg`
- `characters/juju-up.svg`

### Effects

- `effects/building-shadow.svg`
- `effects/character-shadow.svg`
- `effects/light-glow.svg`
- `effects/palm-shadow.svg`
- `effects/tree-shadow.svg`
- `effects/vehicle-shadow.svg`

### Portraits

- `portraits/baba.svg`
- `portraits/juju.svg`

### Props

- `props/bench.svg`
- `props/fence.svg`
- `props/flower-bed.svg`
- `props/palm-01.svg`
- `props/palm-02.svg`
- `props/palm-03.svg`
- `props/planter.svg`
- `props/shrub-01.svg`
- `props/shrub-02.svg`
- `props/shrub-03.svg`
- `props/street-lamp.svg`
- `props/tree-01.svg`
- `props/tree-02.svg`
- `props/tree-03.svg`

### UI

- `ui/icon-action.svg`
- `ui/icon-map.svg`
- `ui/icon-phone.svg`
- `ui/icon-wardrobe.svg`

### Vehicle

- `vehicles/jeep.svg`

## Audit State Matrix

| Domain | Current state | Rationale |
| --- | --- | --- |
| Exterior ground | `LEGACY_FALLBACK` | 16x16 procedural tiles drawn directly into a render texture |
| Exterior buildings | `LEGACY_FALLBACK` | Procedural building textures only; no HD manifest or layered facade system |
| Exterior props and foliage | `LEGACY_FALLBACK` | Procedural props only; no category metadata or cast shadows |
| Pixel characters | `PARTIAL` | Intentional low-res generation exists, but not explicitly promoted to final asset status |
| Vehicles | `LEGACY_FALLBACK` | Procedural cars/jeep only |
| Interiors and furniture | `LEGACY_FALLBACK` | Procedural textures plus graphics walls |
| UI and HUD | `PARTIAL` | Functional and custom, but still tied to the same legacy texture style |
| World map | `PARTIAL` | Mostly graphics/text; not visually modernized |
| Title screen | `PARTIAL` | Functional but not aligned with the target HD art direction |
| Lighting | `PARTIAL` | Tint wash only |
| Contact shadows | `TEMPORARY` | One shared ellipse shadow |
| Cast shadows | `MISSING` | No runtime system |
| HD asset library on disk | `UNUSED` | Files exist but are not loaded or mapped |

## Key Risks for Migration

1. Global `pixelArt: true` and `roundPixels: true` are incompatible with the stated need for mixed HD environment filtering and smooth camera motion.
2. The current "legacy" pipeline is not a fallback layer yet; it is the actual runtime.
3. The current HD SVG character assets do not match the requested final character philosophy.
4. Scene composition currently assumes texture keys are immediately available after `buildAllTextures()`, not after asynchronous preload.
5. Ground rendering is efficient but visually tied to repeated small tiles; richer materials will need a layered renderer, not just larger source textures.

## Final Assessment

The repository already has:

- clean logical world geometry
- workable Y-sorting foundations
- a strong authored district data model
- enough scene separation to migrate incrementally

The repository does not yet have:

- a unified visual asset system
- an HD preload manifest
- category-specific filtering
- a reusable shadow architecture
- final-quality pixel characters
- final HD environment coverage anywhere in the runtime

This means the next step should be a system migration, not isolated asset swaps.
