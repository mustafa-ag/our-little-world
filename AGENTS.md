# Our Little World

## HYBRID HD-2D VISUAL DIRECTION

Use the detailed migration references in `docs/HD_VISUAL_PLAN.md` and
`docs/HD_VISUAL_AUDIT.md`; keep this file as the concise project-wide guide.

The final look is hybrid HD-2D: deliberately crisp pixel-art player/NPC
sprites over high-resolution illustrated environments. Use a top-down,
elevated 3/4 presentation with layered vegetation, irregular natural ground,
dimensional buildings, foreground occlusion, strong environmental depth, warm
directional sunlight, long soft cast shadows, small contact shadows, subtle
atmosphere, smooth HD environment textures, and modern HD UI.

The supplied reference is art direction only. Do not reproduce Pokemon
characters, creatures, logos, recognizable buildings, exact textures,
compositions, or copyrighted game assets. Extract only general principles such
as painterly HD backgrounds, dense vegetation, layered grass, dimensional
buildings, warm light, soft shadows, organic paths, foreground layers, and the
contrast between pixel characters and HD scenery. Our Little World must retain
its own identity.

### Rendering

- Pixel characters use `NEAREST`: crisp, intentional pixel density, no smoothing.
- HD environment assets use `LINEAR`: high-resolution and antialiased.
- Never globally change renderer/filter settings so one category becomes wrong.

### Gameplay And Depth

- Never change gameplay geometry or globally increase `TILE` for visual quality.
- Keep source art size, display size, logical footprint, collision footprint,
  interaction anchor, depth anchor, and shadow anchor separate.
- Use ground/contact Y for ordering where appropriate; tall artwork may extend
  upward beyond its logical footprint.
- Preserve saves, quests, NPC IDs, locations, travel, interaction, collision,
  worldgen, and existing travel-crash fixes.

### Completion And Validation

- Pixel environmental fallback is migration-only and must reach zero for final
  environment completion. Explicit final pixel characters are allowed.
- Before finishing any visual phase: inspect the local migration docs and `git
  diff`; run `npm run build` and `npm run audit:hd`; fix failures; then report
  changed files, visual coverage changes, and anything not validated.
- Never use `git reset --hard` or discard unrelated changes.
