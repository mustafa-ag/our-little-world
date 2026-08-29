# HD art replacement

Temporary programmer canvases prove the pipeline. Drop final PNG/WebP files in `public/assets/hd/` and point `source` on the matching `VisualAssetDef` in `src/game/visual/assets.ts`. Logical display size stays the same — never let the file’s pixel size change collisions or map footprints.

Gameplay code should call `getVisualTexture` / `applyVisual` / `logicalSize`. It must not read `texture.getSourceImage().width`.

## Characters

- Recommended frame: **96×128** (128×160 or 192×256 also fine).
- Sheet: 6 columns × 3 rows = down, up, side (flip for left).
- Animations: `idle-down|up|left|right`, `walk-down|up|left|right` (walk 6 frames, idle 3–4).
- Origin: **0.5, 0.88** (ground at the feet).
- Collision: **8×6** world units at the feet. Do not use the full sprite.

Replace by generating or loading a spritesheet onto the existing key (`char_her`, `char_baba`, …) and calling `makeHdAnims`.

## Buildings

- Source can be 4–8× the logical display size (example: villa display 60×54, source ~360×320).
- Origin: **0.5, 1** (base of the door / foundation).
- Footprint: set `footprintWidth` / `footprintHeight` in tiles on the asset def, or keep the current display-derived default.
- Do not move `tx`/`ty` in `locations.ts` to fit a taller drawing.

## Terrain

- HD tileset source tiles: **64×64**.
- Logical tile remains `TILE` (16).
- Yas uses a scaled tilemap. Other maps still stamp the original 16px tiles into a render texture.
- Add variants by extending `TILESET_KEYS` in `hdGenerate.ts`.

## Portraits

- About **160×200**, 4:5.
- Keys: `portrait_juju`, `portrait_baba`, `portrait_mama`, `portrait_moomoo`, `portrait_fadwa`.
- Optional moods: `_happy`, `_laugh`, `_surprised`, `_concerned`, `_emotional`.
- Missing portraits fail open — dialogue still works.

## Vehicles

- Jeep logical display: **24×38**, origin ~0.85.
- Collision stays small; the drawing can be much larger in the file.

## Furniture

- Keep saved `x`/`y` in house space.
- Set display size + origin 0.5/1 on the asset def.
- Old saves keep working because positions are not derived from texture pixels.

## Toggle

`src/game/visual/mode.ts` → `VISUAL_MODE = "hd" | "pixel"`.
