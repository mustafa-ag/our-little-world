# Visual Polish Plan

> Status: planning · Source: completed visual audit (Phase 1) · Related: [`HD_VISUAL_AUDIT.md`](./HD_VISUAL_AUDIT.md), [`HD_VISUAL_PLAN.md`](./HD_VISUAL_PLAN.md), [`VISUAL_STYLE.md`](./VISUAL_STYLE.md)

---

## 1. Executive summary

The Phase 1 audit found that the world *declares* more visual variety than it actually *renders*. The art-profile system (`src/app3d/world/artProfile.ts`) already has per-region fields for lamps, benches, backdrops and ground colour, but several of them never reach the scene. The character kit (`src/app3d/assets/kit/characters.ts`) has material slots for accents and multiple hair meshes, but NPCs still share one low-resolution face and a hardcoded white accent.

The result:

- **Locations look alike.** Victorian iron lamps show up in Dubai, every region uses the same bench, and five backdrop styles are shared by eight regions.
- **NPCs look alike.** Every female NPC has the same 256×256 face texture, so none of them read as individuals, and they look blurrier than Juju (512×512) in close-ups.
- **The weakest scenes look unfinished.** Amman is an empty sandy box with no landmark, and Dubai, Positano, Abu Dhabi and Santorini each lack the street-level density that defines the real place.

This plan wires up the unused systems first (cheap, high impact, affects every region), then spends effort on characters, then rebuilds the five weakest locations in priority order. Each phase has a clear success criterion so it can be reviewed with screenshots in `docs/screenshots/`.

---

## 2. Phase breakdown

Phase 1 was the audit. Phases 2–8 are below. Phases 2 and 3 have no dependencies and can run in parallel. Phases 4–8 depend on Phase 2, because they rely on region-correct lamps, benches and props.

### Phase 2 — Wire the declared art-profile fields

**Goal:** make `lampStyle`, `benchStyle` and region-scoped decor actually affect the scene.

| | |
|---|---|
| **Files** | `src/app3d/world/artProfile.ts`, `src/app3d/world/dressing.ts`, `src/app3d/game3d.ts` |
| **Work** | Route `profile.lampStyle` and `profile.benchStyle` into the lamp and bench placement code. Turn `EXTRA_PRESETS` into per-region preset tables, keyed by `RegionKind`. Add a fallback so a region with no table gets neutral props, not Scotland's. |
| **Success criteria** | No `victorian_iron` lamp renders in any `uae_*`, `amman`, `italy` or `greece` location. At least 4 distinct bench styles are visible across regions. No Scotland-only prop appears outside Scotland (checked with a per-location prop dump or screenshots). |

### Phase 3 — Character differentiation

**Goal:** make each named NPC visually distinct and bring NPC detail up to Juju's level.

| | |
|---|---|
| **Files** | `src/app3d/assets/kit/characters.ts`, NPC face textures and GLBs under the character asset directory |
| **Work** | Per-NPC face textures at 512×512. Expose `olw_accent` as a per-character colour in `dress()` instead of the hardcoded `#ffffff`. Generalise the hair-streak logic so it works on every hair mesh (`hair_long`, `hair_bob`, `hair_short`, `hair_bun`, `hair_ponytail`, `hair_curly`), not only `juju.glb`'s `hair`. |
| **Success criteria** | No two named female NPCs share a face texture. All NPC face textures are ≥512×512. Every named character has a non-white accent (unless white is a deliberate choice). A hair streak renders on at least one NPC with each hair variant. |

### Phase 4 — Amman rebuild (priority 1)

**Goal:** take Amman from an empty beta box to a finished location.

| | |
|---|---|
| **Files** | `src/app3d/world/artProfile.ts` (`AMMAN`), `src/app3d/world/dressing.ts`, Amman location data and meshes, a new landmark mesh |
| **Success criteria** | The landmark is no longer `"none"`. The beta label is removed. It meets the Amman benchmark in §6. |

### Phase 5 — Dubai SZR street level (priority 2)

**Goal:** add ground-floor life under the glass towers.

| | |
|---|---|
| **Files** | `artProfile.ts` (`UAE_DUBAI`), `dressing.ts`, `dubai_szr` location data |
| **Success criteria** | Cafés and shopfronts line the street, with at least 3 distinct storefront types, and it meets the Dubai benchmark in §6. |

### Phase 6 — Mediterranean pass: Positano and Santorini (priorities 3 and 5)

**Goal:** give Italy and Greece their own architecture and backdrops.

| | |
|---|---|
| **Files** | `artProfile.ts` (`ITALY`, `GREECE`, `BackdropStyle`), backdrop generator, `italy_positano` and `greece_santorini` location data, new terrace and cube-house meshes |
| **Success criteria** | Positano uses no London terrace meshes. Santorini no longer shares the `coastal` backdrop with the UAE. Both meet their benchmarks in §6. |

### Phase 7 — Abu Dhabi Last Exit (priority 4)

**Goal:** make the lot feel like a busy roadside food stop rather than an empty car park.

| | |
|---|---|
| **Files** | `artProfile.ts` (`UAE_MODERN`), `dressing.ts`, `abudhabi_last_exit` location data |
| **Success criteria** | It meets the Abu Dhabi benchmark in §6. |

### Phase 8 — Backdrop and palette unification

**Goal:** finish region identity at the horizon and on the ground.

| | |
|---|---|
| **Files** | `artProfile.ts` (`BackdropStyle`, `groundColor`, `groundTones`), backdrop generator |
| **Work** | Expand from 6 `backdropStyle` variants to at least 9, adding `amman_hills`, `mediterranean_cliff`, `aegean_caldera` and `germany_town` (or equivalents). Warm the UAE ground from `#94ad5c` towards sand, while keeping irrigated-lawn patches only where lawns belong. |
| **Success criteria** | Amman, Germany, Greece and Italy each have a unique backdrop. The UAE ground colour's hue is in the sand/warm range (roughly `#c2b280`–`#d8c49a` for open ground). A side-by-side screenshot grid of all regions shows no two regions that could be mistaken for each other. |

---

## 3. Priority locations

Ranked by how far each location falls short of the benchmark.

| # | Location | Key | Current state | Improvement targets |
|---|---|---|---|---|
| 1 | Amman | `amman` | Empty sandy box, landmark mesh `"none"`, labelled beta | A landmark (for example a Citadel or Roman-theatre silhouette). Stepped limestone houses on the hills. Rooftop water tanks and satellite dishes. Stone stairs, a souq-style street edge, and `hills` replaced by a dedicated Amman backdrop. Remove the beta label. |
| 2 | Dubai SZR | `dubai_szr` | Glass towers only, no street-level variation, no cafés or shops | Ground-floor retail podiums, café terraces with umbrellas, palm planters, shaded walkways, lit signage, taxis and pedestrians. Vary tower tops and cladding. |
| 3 | Positano | `italy_positano` | Reuses London terrace meshes, no cliff-stack density | New pastel Mediterranean house meshes stacked on a cliff grade. Terraced lemon groves, bougainvillea, stair paths, and a church dome with a majolica tile roof. |
| 4 | Abu Dhabi Last Exit | `abudhabi_last_exit` | Empty car-park feel, only food trucks | Shade canopies, seating clusters, string lights, parked cars, a drive-thru lane, landscaped medians, and a skyline or desert-road horizon. |
| 5 | Santorini | `greece_santorini` | Whitewashed density missing, shares the coastal backdrop with the UAE | Dense whitewashed cube houses, blue domes, cave-house arches and caldera-edge walls. A dedicated Aegean caldera backdrop. |

---

## 4. Character improvement targets

### Juju

- Juju is the quality bar: a 512×512 face, and the hair streak works on `juju.glb`'s `hair` mesh. Keep this as the reference.
- Set a deliberate `olw_accent` colour (not `#ffffff`) that matches her signature palette.
- Make sure the Phase 3 hair-streak refactor doesn't break Juju. Run a screenshot regression before and after.

### Named NPCs

| Gap | Target |
|---|---|
| All female NPCs share one 256×256 face | A unique face texture per named NPC, with different eyes, brows, freckles or beauty marks, and lip tone |
| NPC faces are 256×256 | 512×512, to match Juju's clarity at close range |
| `olw_accent` hardcoded `#ffffff` in `dress()` | A per-character accent colour in the character definition, passed through `dress()` |
| Hair streak only works on `juju.glb` `hair` | Streak support on `hair_long`, `hair_bob`, `hair_short`, `hair_bun`, `hair_ponytail`, `hair_curly` |

**Done when:** a lineup screenshot of every named NPC at dialogue-camera distance shows each one as recognisably distinct, with no blurry faces.

---

## 5. Asset wiring TODOs

- [ ] **`lampStyle`**: declared on `WorldArtProfile` (`artProfile.ts`, ~line 53) but never read. Wire it into lamp placement so each region gets its own lamp: `victorian_iron` in Scotland and London, `modern_steel` in the UAE, `ornate_gold` for coastal UAE, `minimal` in Amman and Germany.
- [ ] **`benchStyle`**: declared (`artProfile.ts`, ~line 54) but never read. Wire it into bench placement (`wooden_slat`, `metal_modern`, `stone`, …).
- [ ] **`EXTRA_PRESETS`** (`dressing.ts`, line 28): Scotland-specific, but chosen without regard to region (~line 398). Split it into per-region tables and add a neutral fallback.
- [ ] **`olw_accent`** (`characters.ts`, line 284): replace the hardcoded `#ffffff` with a per-character value.
- [ ] **Add a regression guard**: a dev-mode assertion or test that fails when a profile field is declared but not consumed, or when a Scotland-tagged preset spawns outside Scotland.

---

## 6. Visual benchmarks (what "done" looks like)

Each benchmark is judged against a fixed set of screenshots: an establishing wide shot, a street-level shot, and a dialogue close-up. Save them in `docs/screenshots/<location>/`.

| Region | Done looks like |
|---|---|
| **Scotland** (reference) | It stays as it is. Edinburgh backdrop, Victorian lamps, wooden benches, green ground. Scotland props appear only here. |
| **London** | Victorian lamps and terraces stay here, not in Italy. It has its own `london` backdrop. |
| **UAE modern (Dubai, Abu Dhabi)** | Warm sand ground. Steel lamps and modern metal benches. Towers with a lively ground floor: shopfronts, cafés, palms, shade structures. Night signage glows. |
| **UAE coastal** | Gold ornate lamps and a corniche feel. The coastal backdrop is no longer shared with Greece. |
| **Amman** | White and beige limestone houses stepping up the hills. A clear landmark silhouette. Stone benches and minimal lamps. Its own hills backdrop. Nothing about it looks unfinished. |
| **Italy (Positano)** | A dense vertical stack of pastel houses on a cliff, terraces and greenery, and a church dome. No London meshes. |
| **Greece (Santorini)** | Tight whitewashed cubes, blue domes, caldera views. A unique Aegean backdrop. The white and blue palette dominates the frame. |
| **Germany** | Half-timbered or town-square character with its own `germany_town` backdrop, not `city_generic`. |

**Overall definition of done:** someone shown any single street-level screenshot can name the region without reading a label, and every NPC in a dialogue close-up is identifiable by face alone.
