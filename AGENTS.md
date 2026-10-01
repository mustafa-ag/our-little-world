# Our Little World

Our Little World is both a legacy pixel-art game (src/game/ using Phaser 3) and a fully 3D stylized cinematic game (src/app3d/ using BabylonJS 9).

The two pipelines have **separate** art and rendering rules. Rules in one pipeline section never apply to the other. Shared rules at the end apply to both.

## 3D Game pipeline (`src/app3d/`)

The 3D game is fully 3D at cinematic stylized quality: expressive, animated-film-like characters and regionally distinct worlds. `docs/VISUAL_STYLE.md` is the art bible (global style, shared technical contract and regional bibles).

- **Hero assets:** GLB files authored as Blender scripts in `tools/blender/`, loaded through `AssetManager`, with procedural fallbacks when a GLB is missing or times out.
- **Characters:** sculpted faces with features in the geometry (decals add detail only), rigged GLBs on a shared rig, and a full animation library.
- **Materials:** PBR with authored textures, or high-quality procedural fallbacks. Surfaces show their material through normal maps and roughness variation.
- **Performance:** ≤ 400 draw calls per frame including the shadow pass (hard ceiling 420), and ≤ 8,000 triangles per hero character.
- **No pixel-art rules here.** Do not use the `NEAREST` filter and do not apply sprite-sheet or tile-sprite constraints in this pipeline.
- **Validation:** keep `window.__validate()` at 0 warnings in dev, and run `npm run build` and `npm run audit:hd`.

## Legacy 2D Game pipeline (`src/game/`)

The legacy game uses pixel-art sprites rendered with Phaser 3 in a tile-based world. Its migration references are `docs/HD_VISUAL_PLAN.md` and `docs/HD_VISUAL_AUDIT.md`.

These rules are **scoped to this pipeline only** and must not constrain `src/app3d/`.

- **Sprites:** pixel-art sprites in sprite-sheet format, rendered with the `NEAREST` filter so they stay pixel-perfect (crisp, intentional pixel density, no smoothing).
- **HD environments:** where the legacy game uses high-resolution illustrated environment art (the hybrid HD-2D look), those assets use `LINEAR`. Never change renderer or filter settings globally so that one category becomes wrong.
- **World:** tile-based. Never change gameplay geometry or globally increase `TILE` for visual quality. Keep source art size, display size, logical footprint, collision footprint, interaction anchor, depth anchor and shadow anchor separate. Use ground/contact Y for depth ordering where appropriate; tall artwork may extend upward beyond its logical footprint.
- **Completion:** pixel environmental fallback is migration-only and must reach zero for final environment completion. Explicit final pixel characters are allowed.

## Shared rules (both pipelines)

- Never break saves, quests, NPC IDs, locations, travel, interaction, collision, worldgen, existing travel-crash fixes, or mobile support.
- Never use `git reset --hard` or discard unrelated changes.
- Run `npm run build` and fix any failures before reporting work as done. Then report the changed files and anything you could not validate.
- See `docs/VISUAL_STYLE.md` for regional art direction (Scotland / Edinburgh, UAE, London, Amman / Jordan, Italy / Mediterranean, Greece, Germany).
- Reference images are art direction only. Do not reproduce copyrighted characters, creatures, logos, recognizable game assets, exact textures or compositions. Extract only general principles; Our Little World keeps its own identity.
