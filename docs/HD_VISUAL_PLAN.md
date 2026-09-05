# HD Visual Plan

Date: August 30, 2026

## Goal

Modernize the entire Phaser 3 + TypeScript game into a hybrid presentation:

- intentional crisp pixel characters
- high-definition illustrated 2D environments
- richer depth, shadows, and atmosphere
- zero gameplay redesign

This plan is based on the current repository state documented in `HD_VISUAL_AUDIT.md`.

## Non-Negotiable Constraints

We will preserve:

- Phaser 3
- TypeScript
- 2D gameplay
- `TILE = 16` world logic
- world coordinates
- collision footprints
- quest/location/save/travel IDs
- progression semantics
- current travel/crash fixes
- interaction coordinates unless fixing a visual-footprint bug

We will not:

- migrate to a 3D engine
- make art-source resolution responsible for logic changes
- replace the runtime with competing asset systems
- treat current SVG character art as the final character solution

## Current-State Implications

The audit changes how the migration should be approached:

1. There is no existing `src/game/visual/**` architecture to "build upon" in code.
2. The real live visual system is `src/game/textures.ts` plus scene-specific `Graphics` composition.
3. The `public/assets/hd/**` directory is a disconnected asset stash, not a manifest-backed runtime.
4. Characters already use a logic-safe 16x16 pipeline, but they are still part of the legacy procedural system.

Therefore the migration should create one new visual system and make the current procedural generator a registered fallback provider inside it.

## Target Architecture

Create a single visual system under `src/game/visual/`.

Suggested modules:

- `src/game/visual/types.ts`
  - shared types for categories, filter modes, audit states, shadow config, display sizing, and footprint metadata
- `src/game/visual/catalog.ts`
  - master asset registry keyed by gameplay visual ID
- `src/game/visual/runtime.ts`
  - preload/load helpers, lookup, filter application, and safe scene-facing utilities
- `src/game/visual/legacy.ts`
  - adapter that exposes the current procedural texture builders through the new registry
- `src/game/visual/hd.ts`
  - manifest describing external HD assets on disk and their runtime keys
- `src/game/visual/shadows.ts`
  - contact/cast shadow definitions and helper constructors
- `src/game/visual/ground.ts`
  - layered ground renderer for HD materials and overlays
- `src/game/visual/characters.ts`
  - explicit final pixel-character registration, sprite-sheet metadata, and scale rules
- `src/game/visual/audit.ts`
  - optional runtime reporting helpers to surface `FINAL_HD`, `PARTIAL`, `LEGACY_FALLBACK`, and `MISSING`

## Required Metadata Model

Every visual asset should be declared with metadata similar to:

- `key`
- `sourceType`
  - `procedural`
  - `svg`
  - `image`
  - `spritesheet`
- `sourcePath` or builder reference
- `sourceWidth`
- `sourceHeight`
- `logicalDisplayWidth`
- `logicalDisplayHeight`
- `originX`
- `originY`
- `depthMode`
  - `ground`
  - `y-sort`
  - `fixed`
- `depthOffset`
- `footprint`
  - width/height/offset for collision-aware visuals
- `category`
  - `pixel-character`
  - `hd-terrain`
  - `hd-building`
  - `hd-prop`
  - `hd-foliage`
  - `hd-interior`
  - `hd-vehicle`
  - `hd-ui`
  - `hd-effect`
- `filter`
  - `nearest`
  - `linear`
- `shadow`
  - contact/cast config if applicable
- `auditState`
  - `FINAL_HD`
  - `FINAL_PIXEL_CHARACTER`
  - `PARTIAL`
  - `LEGACY_FALLBACK`
  - `MISSING`
  - `TEMPORARY`
  - `UNUSED`
- `fallbackKey`

## Filtering Strategy

This is the most important technical correction.

Target rule set:

- HD environments use `linear`.
- Pixel characters use `nearest`.
- UI defaults to HD/linear unless intentionally pixel-styled.

Implementation direction:

1. Stop relying on global settings alone as the filtering policy.
2. Keep pixel-character crispness through explicit character-category handling.
3. Move filter choice into asset metadata.
4. Apply filtering when assets are loaded or instantiated.

Important caution:

- The current global `pixelArt: true` and `roundPixels: true` will likely need to be revisited once HD environment art is live.
- This should be a deliberate migration checkpoint, not a casual side effect.

## Character Strategy

Final character direction:

- keep characters intentionally pixel-art
- keep native low-resolution sprite sheets
- keep clear readable silhouettes
- keep logical collision anchored to feet/body footprint

Do not use as final:

- the current smooth SVG character assets under `public/assets/hd/characters`

Recommended direction:

1. Keep the current generated characters as migration-safe fallback.
2. Introduce explicit `FINAL_PIXEL_CHARACTER` registrations.
3. Replace generated sheets only when a consistent pixel-art character set is ready.
4. Preserve current animation directions and frame semantics so gameplay code does not change.

## Ground Strategy

Logical terrain remains tile-based.

Visual terrain becomes layered and higher resolution.

Target renderer responsibilities:

- base material fill
- large repeating ground chunks
- edge and seam breakup
- curb layers
- shoreline treatment
- grass and dirt variation overlays
- road and pavement detail overlays
- optional material decals

The renderer should still read from the existing worldgen output:

- ground keys
- paths
- surfaces
- roads
- water

The upgrade is visual composition, not logic replacement.

## Building and Prop Strategy

Buildings and props should move to a metadata-driven system with:

- explicit logical footprint
- visual extents independent from collision
- consistent origin policy
- optional shadow config
- optional depth offset

Implementation goals:

- preserve current POI placement semantics from `locations.ts`
- keep existing `footprint` support and expand it
- allow one gameplay key to map to a new HD source without changing map logic
- support facade pieces that visually extend upward

## Shadow Strategy

Introduce two distinct shadow classes:

1. Contact shadow
   - small soft shadow under characters, vehicles, and props
2. Cast shadow
   - directional shadow for tall assets like trees, buildings, lamps, and vehicles

Recommended implementation:

- use pre-rendered shadow textures or lightweight reusable graphics
- configure direction, scale, length, opacity, and depth in metadata
- keep one coherent light direction per scene theme

Avoid:

- expensive realtime blur per object
- random shadow directions baked into unrelated sources

## Depth Strategy

Standardize around ground-contact depth.

Rules:

- default world objects sort by contact Y
- buildings can extend upward visually without affecting collision
- optional foreground or overhang layers should render above the player when appropriate

Technical follow-through:

- centralize depth calculation in one helper
- store contact origin and depth offset in asset metadata
- preserve current simple `setDepth(y)` behavior as fallback where appropriate

## Camera Strategy

Desired compromise:

- HD environment moves smoothly
- pixel characters stay crisp

Planned approach:

1. Preserve current follow lerp behavior as a baseline.
2. Re-evaluate global `roundPixels`.
3. Test character snapping separately from environment movement.
4. Verify mobile pointer/world coordinate behavior after any camera adjustment.

This should be treated as a cross-cutting visual systems task, not a per-scene tweak.

## Scene Migration Order

Recommended order:

1. `PreloadScene`
   - install the real manifest-driven load path
2. `WorldScene`
   - largest payoff and biggest architectural pressure test
3. `HouseScene`
   - validate interiors and furniture against the same system
4. `DrivingScene`
   - validate roads, vehicles, weather, and speed readability
5. `UIScene` and `minigames.ts`
   - modernize HUD/dialogue/phone/shop overlays
6. `WorldMapScene`
   - modernize atlas and destination presentation
7. `TitleScene`
   - align first impression with final art direction

## Coverage Rollout

The migration must end with full game coverage, not a permanent vertical slice.

Scope to cover:

- 20 playable locations
- exteriors
- interiors
- terrain
- roads
- water
- buildings
- vegetation
- characters
- vehicles
- UI
- title
- world map
- dialogue and portraits
- effects and particles

Required end-state rule:

- environmental legacy fallback count must reach zero
- intentional pixel characters remain allowed, but only as explicit final assets

## Migration Phases

### Phase 0 - System scaffold

Deliverables:

- `src/game/visual/**` directory
- shared types
- catalog and runtime lookup
- legacy adapter for current procedural textures
- audit-state vocabulary in code

Success gate:

- current game still runs using the new registry, even if visuals are unchanged

### Phase 1 - Real preload and asset registration

Deliverables:

- manifest-backed load path in `PreloadScene`
- runtime registration for on-disk HD assets
- filter metadata support
- asset existence validation

Success gate:

- scenes stop assuming all textures are created synchronously by one builder

### Phase 1 Implementation Status - Complete

Implemented on August 30, 2026:

- Created `src/game/visual/types.ts`, `catalog.ts`, and `runtime.ts` as the centralized visual registry and resolver foundation.
- Added `queueVisualAssets(scene)` to `PreloadScene.preload()`. It queues external HD SVG assets with explicit raster dimensions and supports future PNG and WebP manifest entries through Phaser's image loader.
- Registered each current gameplay texture key as an explicit `LEGACY_FALLBACK` procedural entry. `buildAllTextures()` remains active in `PreloadScene.create()` until later phases replace individual gameplay mappings.
- Added `getVisualTexture(scene, gameplayKey)` as the authoritative gameplay-key-to-Phaser-texture resolver. Existing scene calls remain unchanged in this compatibility phase; future migrations must route scene usage through this resolver rather than introduce another loading system.
- Added metadata-driven filtering: generated `char_*` sheets are explicitly `NEAREST`; externally loaded HD terrain, buildings, props, foliage, interiors, vehicles, UI, and effects are explicitly `LINEAR`. No global texture filter override was introduced.
- Added development diagnostics for failed/missing expected HD assets, missing filter metadata, unsupported manifest types, and gameplay keys that are not registered with the resolver.
- Added `npm run audit:hd`, which verifies manifest-referenced HD source files and required catalog metadata.

Phase 1 intentionally does not remap a live environment gameplay key to HD artwork. Source art dimensions therefore cannot alter tiles, locations, collision, interaction, or travel behavior. The remaining smooth SVG character files are not registered as `FINAL_PIXEL_CHARACTER` assets and are not considered final character art.

### Phase 2 - Deterministic Visual Coverage Audit

Implemented on August 30, 2026:

- Added `scripts/audit-hd-assets.mjs` as the `npm run audit:hd` command.
- The audit scans the visual registry, HD asset directory/manifest references, procedural texture generator, dynamic character generator, all game TypeScript texture references, animation setup, portraits, UI, interiors, `DrivingScene`, and `WorldMapScene`.
- Every tracked asset is reported with one of: `FINAL_HD`, `FINAL_PIXEL_CHARACTER`, `PARTIAL`, `LEGACY_FALLBACK`, `MISSING`, `TEMPORARY`, or `UNUSED`.
- It prints environment, character, UI, and overall final coverage independently; reports all legacy environment fallback separately; groups unregistered direct texture keys by source scene and category; and lists player/NPC assets that are not yet final.
- `ALLOW_LEGACY_ENVIRONMENT_FALLBACK = true` is now explicit in the catalog. Once it is set to `false`, the runtime emits a development-only error whenever an environment key resolves to procedural `LEGACY_FALLBACK`.

Baseline at Phase 2:

- Environment final coverage is `0%`: all live environmental gameplay keys remain procedural `LEGACY_FALLBACK`; queued HD environment sources are `PARTIAL` until adopted by a logical gameplay key.
- Character final coverage is `0%`: current generated pixel player/NPC sheets are deliberately `LEGACY_FALLBACK`, and the smooth SVG character files are not final pixel-character registrations.
- UI final coverage is `0%`: current UI remains procedural fallback; queued HD UI source files are `PARTIAL`.
- Environmental legacy fallback must reach `0` before migration completion. Pixel art is only acceptable for character completion when explicitly registered as `FINAL_PIXEL_CHARACTER`.

### Phase 3 - Global Hybrid Renderer

Implemented on August 30, 2026:

- Confirmed that no `HD_SLICE_LOCATIONS`, `isHdSlice`, or equivalent location-specific HD renderer branch exists in the runtime.
- Added `src/game/visual/themes.ts`: every world location now resolves presentation through the same global theme path using its existing `cityId`, not a special location ID. Themes define lighting, material, vegetation, and architectural direction for Abu Dhabi, Dubai, London, Edinburgh, Leicester, Frankfurt, and Amman.
- `WorldScene` applies its selected theme to every location, while retaining existing worldgen output, tile dimensions, collisions, location IDs, and travel flow. `DrivingScene` resolves the same destination theme for every trip.
- World, driving, house, player, and NPC texture creation now resolve gameplay keys through `getVisualTexture`. The resolver is identity-compatible during migration, so existing procedural art remains explicit fallback while pixel characters retain their global nearest-filter path.

No visual technology choice is tied to Yas. Yas remains only normal content/theme data within the Abu Dhabi presentation family.

### Phase 4 - HD Ground Compositor

Implemented on August 30, 2026:

- Replaced `WorldScene`'s per-cell legacy pixel `RenderTexture.batchDraw` ground pass with `src/game/visual/ground.ts`.
- The compositor groups adjacent logical cells by material, draws large filtered HD material surfaces, preserves deterministic placement, and adds seams, curbs, wear, and sparse tonal details from the same worldgen grid.
- Water receives HD base, shine, and moving wave overlays; roads and paving receive material boundaries; grass, paths, sand, and location theme lighting are now rendered through the same HD layer.
- Every logical `t_*` ground key is a `FINAL_HD` alias to a linear-filtered HD material. The logical grid, tile dimensions, blocked cells, world coordinates, locations, and travel behavior remain unchanged.
- `npm run audit:hd` now reports `GROUND FINAL COVERAGE` from these logical aliases rather than treating unused source files as active ground requirements.

### Phase 5 - Lighting and Shadows

Implemented on August 30, 2026:

- Added location-level `LightingProfile` metadata to every visual theme: coherent direction, cast length, opacity, ambient level, and warmth are selected once per location family.
- Added metadata-driven `VisualShadowDef` properties for enabled state, type, length, direction overrides, opacity, scale, and contact origin.
- Added `src/game/visual/shadows.ts`, which creates two cached, linear-filtered soft textures and uses transformed sprites for all contact and cast shadows. No per-object blur shader is used.
- Player and NPCs receive subtle moving contact shadows without changing their nearest-filtered pixel sprites. Buildings, landmarks, trees, palms, lamps, poles, vehicles, and selected furniture receive metadata-driven contact and/or directional cast shadows.
- Shadows track their object's logical ground contact point and render directly beneath that contact depth, so foreground objects continue to render over them.

### Rollback Boundary

The active implementation intentionally stops after Phase 5. Building, foliage/prop, character-finalization, and unified-depth work remain future migration phases; their generated artwork, completion mappings, and stricter audit gates are not part of the current baseline. Procedural environment fallback remains enabled while the HD categories are migrated incrementally.

## Risks and Mitigations

### Risk 1: mixed filtering causes blur or shimmer

Mitigation:

- test category-level filter handling early
- treat camera/snapping as a system milestone, not polish

### Risk 2: collision drifts when replacing visuals

Mitigation:

- keep logical footprint data explicit
- never derive collision from full rendered sprite bounds

### Risk 3: asset sprawl creates multiple registries

Mitigation:

- force all scene-facing lookups through one catalog/runtime layer
- register legacy procedural textures inside the same system

### Risk 4: HD asset set is incomplete or stylistically inconsistent

Mitigation:

- track audit state per asset and per category
- allow temporary fallback during migration, but only through explicit metadata

### Risk 5: performance regression from too many large layers

Mitigation:

- keep reusable render textures
- batch where possible
- prefer pre-rendered shadows over expensive realtime blur

## Definition of Done

The visual modernization is complete only when:

- all runtime environment visuals are manifest-backed and categorized
- environment categories are `FINAL_HD`
- remaining pixel characters are explicitly `FINAL_PIXEL_CHARACTER`
- no scene depends on accidental legacy visuals
- category-specific filtering is active
- shadow direction is coherent within a scene
- depth sorting uses contact-position rules consistently
- gameplay semantics remain unchanged
- mobile play still works

## Immediate Next Implementation Tasks

When migration begins, the first coding pass should be:

1. Create `src/game/visual/types.ts`, `catalog.ts`, `runtime.ts`, and `legacy.ts`.
2. Move the current `buildAllTextures()` registry behind the new visual runtime rather than calling it directly from scenes.
3. Add a manifest file for the current on-disk HD assets, even if many entries start as `UNUSED` or `PARTIAL`.
4. Update `PreloadScene` so external assets and procedural assets are registered through the same path.
5. Add asset validation output so missing mappings fail loudly during migration.

This sequence creates the foundation needed for the rest of the modernization without mixing architecture work and art replacement haphazardly.
