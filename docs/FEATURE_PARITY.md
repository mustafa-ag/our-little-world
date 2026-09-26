# Feature Parity Audit — Our Little World 3D

_Generated from source on 2026-09-26 (branch `claude/adoring-edison-jb16c3`, HEAD `99da49a`)_

## Summary

The legacy Phaser build (`/legacy.html`, `src/legacy2d.ts`) registers 19 scenes and carries the whole game: 35 quests, 23 districts in 9 cities, 13 minigame kinds, a 12-tab phone, housing/build mode, ADNOC career, romance/wedding, Tigor and Baba-shopping campaigns. The Babylon 3D build (`/`, `src/app3d/`) is a **walkable vertical slice**. Only **3 of 23 locations** are ported (`edinburgh_oldtown`, `edinburgh_dean`, `edinburgh_uni`, all Scotland). What works there: walking, district edge-travel, NPC talk and quest hooks, gifts, flower and secret pickups, encounters, the home/ADNOC shop, HUD, quest tracker, dialogue, toasts and a trimmed 4-tab phone. Every minigame is a stub that reports success. None of the 14 special scenes is ported. There is no globe or world-map travel, no house interiors, and no driving. Time of day ticks but there is no sleep, so the day never advances. **No quest can be completed end-to-end in 3D today.** The closest is `q_edinburgh`, and its last step is broken by a hook mismatch (see §6). The art pipeline also assumes Scotland throughout: sand renders as grass, every road is cobbled setts, palms are oaks, every glass tower or villa becomes a Scottish cottage or tenement, every landmark becomes a castle, and the Edinburgh skyline is drawn behind every location. Biggest gaps, in order: travel (globe, driving, more locations), region-aware art, the minigame suite, HouseScene/home, and the special scenes.

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ PORTED | Fully working in 3D |
| 🔶 PARTIAL | Some functionality, gaps remain |
| ❌ MISSING | Not started in 3D |
| 🔍 VERIFIED | Tested end-to-end |

No row in this audit is marked 🔍 VERIFIED. This audit read the source and ran nothing.

---

## 1. World Locations

The set of ported locations is `PORTED_LOCATIONS` in `src/app3d/systems/worldController.ts:35`. `game3d.ts` imports it and uses `DEFAULT_LOCATION = "edinburgh_oldtown"` for any save that sits in a non-ported place. Walking to an exit that leads to a non-ported district shows a toast (`worldController.ts:482`).

"Art profile" is the world art profile the location needs (defined in §8).

| ID | Name | Legacy source | 3D Status | Notes |
|----|------|---------------|-----------|-------|
| `edinburgh_oldtown` | Old Town | `EDI_OLDTOWN` (locations.ts:1076) | 🔶 PARTIAL | Benchmark location with the Royal Mile and café. Hazel and Rhiannon are here. The castle landmark photo is a stub. Hazel's stair and Rhiannon's flat interiors show a toast. Exit west to Dean. |
| `edinburgh_dean` | Dean Village | `EDI_DEAN` (:1126) | 🔶 PARTIAL | The 18 Well Court stairs zone opens a stub minigame and then an interiors toast. The `well_court_race` quest hook does not fire (§6). |
| `edinburgh_uni` | Heriot-Watt | `EDI_UNI` (:1160) | 🔶 PARTIAL | Campus café (stub coffee). No quest content. |
| `abudhabi_yas` | Yas Island | `AD_YAS` (:527) | ❌ MISSING | UAE: modern residential and golf. Profile **UAE Modern (villa)**. New saves start here in legacy. Home to Baba, Jad and Shan, the starter home, and Saddle. 3D already has Baba's-card pickup logic for this location (`worldController.ts:211`). |
| `abudhabi_noya` | Noya Plaza | `AD_NOYA` (:634) | ❌ MISSING | UAE Modern (retail). Waitrose. |
| `abudhabi_yasmall` | Yas Mall | `AD_YASMALL` (:668) | ❌ MISSING | UAE Modern (retail). Mall entry needs MallScene / BabaShoppingScene. |
| `abudhabi_city` | Abu Dhabi City | `AD_CITY` (:846) | ❌ MISSING | UAE Modern (civic). Grand Mosque landmark, ADNOC HQ (`adnoc_hq` office zone) and Alya. |
| `abudhabi_corniche` | The Corniche | `AD_CORNICHE` (:889) | ❌ MISSING | UAE Coastal (promenade and sea). |
| `abudhabi_saadiyat` | Saadiyat | `AD_SAADIYAT` (:717) | ❌ MISSING | UAE Coastal (beach). Salon, MLT, grill and gelato trucks. |
| `abudhabi_hudayriyat` | Hudayriyat | `AD_HUDAYRIYAT` (:801) | ❌ MISSING | UAE Coastal. Food trucks, Saddle. |
| `abudhabi_last_exit` | Last Exit | `AD_LAST_EXIT` (:778) | ❌ MISSING | UAE Desert roadside. There are no exits, so it is reachable only from the world map. |
| `dubai_downtown` | Downtown Dubai | `DUBAI_DOWNTOWN` (:202) | ❌ MISSING | UAE Modern (high-rise). Burj, Dubai Mall, The Residences T8. |
| `dubai_szr` | Sheikh Zayed Road | `DUBAI_SZR` (:288) | ❌ MISSING | UAE Modern highway on a sand base. Hub linking 4 districts. |
| `dubai_damac` | Damac Lagoons | `DUBAI_DAMAC` (:334) | ❌ MISSING | UAE Modern (townhouse). Mama, ADNOC Oasis fuel/shop. |
| `dubai_oasis` | Silicon Oasis | `DUBAI_OASIS` (:409) | ❌ MISSING | UAE Modern on sand. SO2 and Moomoo. |
| `dubai_hills` | Dubai Hills | `DUBAI_HILLS` (:469) | ❌ MISSING | UAE Modern (retail and park). Dubai Hills Mall, Saddle. |
| `london_westminster` | Westminster | `LONDON_WESTMINSTER` (:919) | ❌ MISSING | London. Big Ben and Westminster landmarks, the Thames. |
| `london_westend` | West End | `LONDON_WESTEND` (:981) | ❌ MISSING | London. Fadwa's flat, Soho, Oxford St, the Ritz. |
| `leicester` | Oadby | `LEICESTER` (:1194) | ❌ MISSING | England (Midlands brick). Chloe, Uni of Leicester clocktower. |
| `germany` | Frankfurt | `GERMANY` (:1240) | ❌ MISSING | Germany. Fachwerk, the Römer. Nour. |
| `amman` | Amman | `AMMAN` (:1280) | ❌ MISSING | Jordan (desert stone). Citadel. Its data subtitle is still "Coming soon (beta)". |
| `italy_positano` | Positano | `POSITANO` (:1306) | ❌ MISSING | Mediterranean (Italy): cliff, sea, lemon. Home for property `positano_home`. |
| `greece_santorini` | Oia, Santorini | `SANTORINI_CITY` (:1329) | ❌ MISSING | Mediterranean (Cyclades): whitewash, blue doors, caldera. Home for `santorini_villa`. |

Score: 3 of 23 locations are partially ported, and 0 are fully ported.

---

## 2. Core Systems

| System | Legacy source | 3D Status | Notes |
|--------|---------------|-----------|-------|
| Title screen | `scenes/TitleScene.ts` | 🔶 PARTIAL | `app3d/ui/title.ts` offers Start/Continue, New game, and a "Play Full Pixel Game" link to `/legacy.html`. It has no slot cards, no progress %, and no cloud label. |
| Save slots (3) | `systems/save.ts` (`SAVE_SLOT_COUNT = 3`) | ❌ MISSING | 3D always uses the archive's active slot. There is no picker, and `store.loadSaveSlot` / `startNewSaveSlot` are never called. |
| Continue | TitleScene | 🔶 PARTIAL | Continues the active slot. If `currentLocation` is not ported (for example the default `abudhabi_yas`), the player spawns in Old Town. The save's location is only overwritten on travel or on a fresh save (`worldController.ts:80`). |
| New game | TitleScene → `startNewSaveSlot` | 🔶 PARTIAL (risky) | 3D calls `store.reset()`, which runs `clearSave()` and **wipes the active slot immediately with no confirmation** (`title.ts:40`). |
| Cloud save | `systems/cloudSave.ts`, `store.ts` | 🔶 PARTIAL | `store.init()` restores an existing Supabase session, so background sync continues if the player signed in on legacy. There is no sign-in, sign-out or status UI in 3D. |
| Backup / migration | `save.ts` (backup key, `normalizeState`, VERSION 12) | ✅ PORTED | Shared store code. Nothing 3D-specific is needed. |
| Day / time | `store.advanceTime`, `store.sleep` | 🔶 PARTIAL | Time advances every 90 s (`TIME_TICK_MS`) and lighting follows it. **Nothing calls `store.sleep()` in 3D**, so time stalls at `night` and `currentDay` never increments. This blocks every `requiresMinDay` quest. |
| Hearts / coins | store | ✅ PORTED | HUD (`ui/hud.ts`) with bump animation. |
| Fuel | `store.refuel` | 🔶 PARTIAL | The fuel zone logic is ported, but the only fuel station (ADNOC Oasis) is in a non-ported district, and the Jeep can't be driven. |
| Inventory | store | ✅ PORTED | Phone › Bag. Items come from flowers, coffee, secrets and the shop. |
| Relationships | store, `data/relationships.ts` | 🔶 PARTIAL | Talking and gifting (`ui/gift.ts`) change relationship values, and a heart pops on gain. There is no contacts view or bands UI, and milestones and keepsakes aren't visible. |
| Messages | `systems/phone.ts` | 🔶 PARTIAL | Messages are delivered on arrival, and tapping one activates its quest. There are no chat threads, replies or suggestions (`systems/chat.ts` is unused). |
| Quests engine | `systems/quests.ts` | ✅ PORTED | Shared. Hooks are called from `worldController.ts` and the tracker is `ui/questTracker.ts`. Some hook targets are stale (§6). |
| Quest accept / browse | Phone › Quests | 🔶 PARTIAL | Quests can be accepted only by talking to a giver who is present, which in 3D means Hazel. There is no Available list. |
| Quest replay | `systems/questReplay.ts` | ❌ MISSING | |
| Quest juice (emotes, sparkles, bounce) | `systems/questJuice.ts` | 🔶 PARTIAL | 3D has petal bursts and the relationship heart pop only. |
| Controls | `systems/controls.ts` | ✅ PORTED | Keyboard, joystick, A button, Shift jog (`playerController.ts`). |
| Sprint (red-bottom boots +65%) | WorldScene / outfits | ❌ MISSING | 3D has a fixed stroll/jog and ignores the outfit. |
| Outfits / wardrobe | `data/outfits.ts`, Phone › Fit | ❌ MISSING | `PlayerView` re-tints on the `outfit` event, but there is no UI to change outfit. The shop can unlock sneakers. |
| Outfit reactions | `systems/outfitReactions.ts` | ❌ MISSING | |
| Companions | `systems/companions.ts` | ❌ MISSING | No follower NPC and no invite. |
| Encounters | `systems/encounters.ts` | ✅ PORTED | `maybeEncounter()`. A cat encounter spawns a follower cat. |
| Secrets / notes | `data/secrets.ts` | ✅ PORTED | Pickups and memory unlocks. There is no Notes tab to review them. |
| World events | `systems/worldEvents.ts` | ❌ MISSING | Not imported by 3D. |
| Photos / camera | `systems/photos.ts` | ❌ MISSING | Landmark photos go through the stub minigame. No `capturePhoto` and no album. |
| Memories | `data/memories.ts` | 🔶 PARTIAL | Unlocks work, and 3D has a Phone › Memories list. |
| ADNOC career | `systems/adnoc.ts` | ❌ MISSING | The `useOffice` stub exists, but HQ and workdays aren't ported. |
| Life progress / stats | `systems/lifeProgress.ts` | 🔶 PARTIAL | Shared quest-completion side effects run. There is no Stats tab. |
| Minimap / district map | `systems/minimapAtlas.ts` | ❌ MISSING | `fillCityMinimap` is never called in 3D, so the local map always shows "No GPS signal here yet." |
| Shop (home / ADNOC) | UIScene.buildShop | ✅ PORTED | `ui/shop.ts`. Furniture goes to legacy `state.furniture` using 2D HouseScene slot coordinates. |

---

## 3. Phone

Legacy is `src/game/ui/PhoneOverlay.ts` (12 tabs plus a DEV Debug tab). 3D is `src/app3d/ui/phone.ts` (4 tabs: Texts, Bag, Memories, Map).

| Tab | Legacy source | 3D Status | Notes |
|-----|---------------|-----------|-------|
| Msgs (chats) | `drawMessages` / `drawConversation` | 🔶 PARTIAL | 3D "Texts" is a flat list of the last 30 messages. Tapping marks one read and activates its quest. There are no per-contact threads, suggested replies or SEND. |
| Quests | `drawQuests` | ❌ MISSING | Legacy has Active/Available/Completed sections, accept, Replay, and "launch Retrieve Tigor". **`q_retrieve_tigor` can only start from here.** |
| Cam | `drawCamera` | ❌ MISSING | Pose picker (smile, peace, silly, hug) → `cameraStart`. |
| Album | `drawAlbum` / `drawMemories` | 🔶 PARTIAL | 3D Memories covers the memory list only. There is no photo scrapbook, filters or photo viewer. |
| Stats | `drawStats` | ❌ MISSING | Countries and cities, last mall report, ADNOC stats. |
| Map | `drawMap` | 🔶 PARTIAL | The buttons exist, but both open placeholder modals (§9). |
| Ppl (contacts) | `drawContacts` | ❌ MISSING | Relationship bands, stage, companion Invite, Tigor follow toggle. |
| Car | `drawCar` | ❌ MISSING | "CALL JEEP" (`callJeep`). |
| Homes | `drawHomes` | ❌ MISSING | Property list with Tour/Buy/Set home/Visit. |
| Notes | `drawNotes` | ❌ MISSING | Souvenir shelf, found notes, keepsakes. |
| Bag | `drawBag` | ✅ PORTED | |
| Fit (style) | `drawStyle` | ❌ MISSING | Outfit picker and sprint boots. |
| Debug (DEV) | `drawQuestTour` | ❌ MISSING | Dev-only quest tour. Low priority. |

---

## 4. Minigames

Legacy is `src/game/ui/minigames.ts` `openActivity()`. The kinds are listed in `MiniGameSpec.kind` (`systems/controls.ts:21`). In 3D, **every kind opens the same stub** (`app3d/ui/modals.ts:87–105`): a disabled "Play (coming soon)" button and a button labelled `spec.skipLabel ?? "Done"` that always calls `spec.onDone(true)`. **Every minigame auto-completes as a success**, including when the player clicks a skip label such as "Not now", "Later" or "Just look". So "Not now" at a café still grants coffee and advances the quest.

| Kind | Legacy source | 3D Status | Notes |
|------|---------------|-----------|-------|
| `stairs` | `stairsGame` | ❌ stub auto-complete | Emitted by 3D (the Dean Well Court race and other stairs zones). |
| `salon` | `salonGame` (shared tap core) | ❌ stub auto-complete | 3D emits it, but only from Saadiyat, which isn't ported. |
| `coffee` | `coffeeGame` | ❌ stub auto-complete | Emitted by 3D cafés (Royal Mile Café, campus café). |
| `bouquet` | `bouquetGame` | ❌ stub auto-complete | Emitted after 3 flowers. |
| `photo` | `photoGame` | ❌ stub auto-complete | Emitted by landmark zones. No photo is saved. |
| `showdown` | `showdownGame` | ❌ stub (never emitted) | Legacy WorldScene handles the Yas sibling showdown. 3D has no trigger. |
| `shopping` | `shoppingGame` | ❌ stub (never emitted) | |
| `safe` | `safeGame` | ❌ stub (never emitted) | Used by SisterHeistScene. |
| `lockpick` | `lockpickGame` | ❌ stub (never emitted) | Used by SisterHeistScene. |
| `badge_photo` | `badgePhotoGame` | ❌ stub (never emitted) | Used by AdnocHQScene. |
| `timing` | `timingGame` | ❌ stub (never emitted) | Used by world events and HouseScene activities. |
| `lab` | no handler: falls to generic `tapGame` | ❌ stub auto-complete | 3D `useOffice` emits it for a stale step target (`adnoc_lab`, §6). |
| `pitch` | no handler: falls to generic `tapGame` | ❌ stub auto-complete | 3D emits it for a stale step target (`adnoc_boardroom`). |

Status: 0 of 13 minigames are implemented in 3D, and all 13 are stubs that auto-complete. The larger bespoke activities live in scenes such as QuestActivityScene, AdnocTaskScene and TigorMissionScene rather than in `minigames.ts` (§5).

---

## 5. Special Scenes

No legacy scene except World and Title has a 3D counterpart. The 3D world emits hand-off events (`enterHouse`, `enterMall`, `enterScene`, `driveMenu`), but **no code listens to them**, so each one falls through to a toast.

| Scene | Legacy file | 3D Status | Notes |
|-------|-------------|-----------|-------|
| WorldScene | `scenes/WorldScene.ts` (1837 lines) | 🔶 PARTIAL | Rules are ported to `app3d/systems/worldController.ts` (560 lines). Missing: driving, companions, camera, world events, sibling showdown, romance triggers, residences/QuestActivity launch, minimap, and property-tour spawn. |
| TitleScene | `scenes/TitleScene.ts` | 🔶 PARTIAL | See §2. |
| UIScene | `scenes/UIScene.ts` | 🔶 PARTIAL | Replaced by the DOM UI in `app3d/ui/*`. |
| HouseScene | `scenes/HouseScene.ts` | ❌ MISSING | Interiors: sleep, wardrobe, photo wall, souvenir shelf, keepsakes, Tigor, visitor hangout, build mode, property tours. Toast: `worldController.ts:466`. |
| WorldMapScene | `scenes/WorldMapScene.ts` | ❌ MISSING | Globe and city travel. 3D `openMap` is a read-only list (`modals.ts:35`). |
| DrivingScene | `scenes/DrivingScene.ts` | ❌ MISSING | Top-down highway drive. Toast: `worldController.ts:291`. The Jeep is parked visually only. |
| MallScene | `scenes/MallScene.ts` | ❌ MISSING | `enter_mall`, `mall_fashion`, `mall_coffee_pair`. Toast: `:471`. |
| PirateVoyageScene | `scenes/PirateVoyageScene.ts` | ❌ MISSING | `pirate_voyage`, `great_white_boss`, and `onVisit("london")`. |
| SisterHeistScene | `scenes/SisterHeistScene.ts` | ❌ MISSING | House lock, room, drawer, safe, escape. Toast: `:203`. |
| AdnocHQScene | `scenes/AdnocHQScene.ts` | ❌ MISSING | Multi-floor HQ that hosts almost every ADNOC quest step. |
| AdnocTaskScene | `scenes/AdnocTaskScene.ts` | ❌ MISSING | 12 workday task minigames (`AdnocWorkTaskId`) plus the story set pieces. |
| QuestActivityScene | `scenes/QuestActivityScene.ts` | ❌ MISSING | `apartment_1701`, `nour_snacks`, `chloe_thesis`, `fry_thief`. |
| BabaShoppingScene | `scenes/BabaShoppingScene.ts` | ❌ MISSING | `shopping_spree`: 12 stores and 36 products (`data/babaShopping.ts`), a Baba stress meter, 4 floors, and a Moomoo rescue. |
| RomanceScene | `scenes/RomanceScene.ts` | ❌ MISSING | `romance_us`, `romance_future`, `romance_proposal`, `wedding_planning_one`/`two`. |
| WeddingScene | `scenes/WeddingScene.ts` | ❌ MISSING | `desert_wedding`. |
| TigorMissionScene | `scenes/TigorMissionScene.ts` | ❌ MISSING | UK vet tasks (8), UAE portal phases (5), all-nighter (16), from `data/tigorMission.ts`. |
| TigorAirportScene | `scenes/TigorAirportScene.ts` | ❌ MISSING | Finale. Completes `retrieve_tigor_campaign`. |

---

## 6. Quests

A **3D path** exists when every step can be triggered in a ported location with the current `worldController`. A stub minigame that auto-completes counts as a path, but it is flagged.

**Hook bugs found in the 3D port:**
- **`q_edinburgh` step 3 cannot complete.** Legacy calls `quests.onMinigame("well_court_race")` for the Well Court stairs (`WorldScene.ts:858`). 3D calls `quests.onInteract(z.tag)` instead (`worldController.ts:362`), and that does not match a `playMinigame` step. This is the only quest that is otherwise fully reachable in 3D.
- `worldController.useOffice` checks for step targets `adnoc_lab` and `adnoc_boardroom` (`:425`, `:441`), but neither exists in `quests.ts`. The current targets are `adnoc_sample_sort`, `adnoc_board_info` and others.
- The heist Fadwa spawn in Old Town checks for step target `sister_room` (`:187`), but neither this target nor Edinburgh appears in `q_family_jewel_heist`. This is dead code left over from an older quest version.

| Quest ID | Title | Key steps | 3D Status | Blocking dependency |
|----------|-------|-----------|-----------|---------------------|
| `q_adnoc_engineer` | First Day, Big Blue Building | visit abudhabi_city → ADNOC HQ → reception → badge photo → engineering → desk → sample sort → results → Alya | ❌ | `abudhabi_city`, AdnocHQScene, `badge_photo` |
| `q_baba_card` | Baba's Card | take card (Yas) → enter mall → fashion pick | ❌ | `abudhabi_yas` (the card pickup logic is ported), MallScene |
| `q_date` | Coffee from the Mall | Dubai Mall → `mall_coffee_pair` → talk Moomoo | ❌ | `dubai_downtown`, MallScene, `dubai_oasis` |
| `q_flowers` | Flowers for Mama | collect 3 flowers → bouquet → talk Mama | ❌ | Giver Mama (`dubai_damac`). Steps 1–2 would work in Edinburgh once the quest is accepted. |
| `q_baba_spree` | Baba's Shopping Nightmare | `shopping_spree` | ❌ | BabaShoppingScene, a mall location |
| `q_residences` | Apartment 1701 | visit Downtown → Residences T8 → apartment 1701 | ❌ | `dubai_downtown`, QuestActivityScene |
| `q_london` | Sisters in London | visit london → talk Fadwa | ❌ | `london_westend`, globe travel |
| `q_westminster` | Big Ben with Fadwa | visit Westminster → photo bigben → talk Fadwa | ❌ | `london_westminster`. The photo hook is ported. |
| `q_edinburgh` | The Girls in Edi | talk Rhiannon → visit Dean → `well_court_race` | 🔶 | Steps 1–2 work (giver Hazel is in Old Town). **Step 3 is broken** by the hook mismatch above. |
| `q_nour` | Brother in Germany | visit germany → talk Nour → `nour_snacks` | ❌ | `germany`, QuestActivityScene |
| `q_chloe` | Tea in Oadby | visit leicester → talk Chloe → `chloe_thesis` | ❌ | `leicester`, QuestActivityScene. It can be accepted from Hazel in 3D. |
| `q_retrieve_tigor` | Retrieve Tigor | `retrieve_tigor_campaign` | ❌ | Phone › Quests launch, TigorMissionScene, TigorAirportScene |
| `q_saadiyat` | Saadiyat glow | visit Saadiyat → salon | ❌ | `abudhabi_saadiyat`. The salon zone logic is ported. |
| `q_hudayriyat` | Food trucks | visit Hudayriyat → trucks → `fry_thief` | ❌ | `abudhabi_hudayriyat`, QuestActivityScene |
| `q_saadiyat_truck_hop` | Saadiyat snack crawl | visit Saadiyat → MLT truck → gelato | ❌ | `abudhabi_saadiyat` only. The café-zone hooks are ported. |
| `q_last_exit` | Last Exit detour | visit Last Exit → burgers → coffee | ❌ | `abudhabi_last_exit`, WorldMapScene (no exits lead there) |
| `q_yas_showdown` | Family chaos championship | visit Yas → `sibling_showdown` | ❌ | `abudhabi_yas`. The showdown trigger isn't ported. |
| `q_coffee_run` | His order | coffee minigame → give Moomoo coffee | ❌ | Moomoo (Dubai). Activated by a message. The coffee step works in Edinburgh, but only as a stub. |
| `q_family_jewel_heist` | The Great Family Jewel Heist | pirate idea → voyage → Great White → London → lock → enter → room → drawer → safe → escape | ❌ | Giver Mama, PirateVoyageScene, SisterHeistScene, `lockpick`/`safe` |
| `q_adnoc_pressure_problem` | The Pressure Problem | alarm → pipe → valves → console | ❌ | AdnocHQScene/AdnocTaskScene, ADNOC rank/XP/workdays |
| `q_adnoc_paperclip_incident` | The Paperclip Incident | start → paperclip boss → rival problem → move plant | ❌ | same |
| `q_adnoc_team_lead` | Team Lead for a Day | start → team tasks | ❌ | same |
| `q_adnoc_control_room` | The Control Room Gauntlet | start → steam → circuits → memory → console race | ❌ | same |
| `q_adnoc_director` | Director's Rounds | start → inspection → briefing | ❌ | same |
| `q_home_refresh` | Make It Yours | buy sofa → buy plant → decorate → enjoy | ❌ | Giver Alya (`abudhabi_city`). Buying works in 3D via the Princes Street shop. HouseScene and build mode are needed for decorate and enjoy. |
| `q_romance_us` | Us | `romance_us` | ❌ | RomanceScene, Moomoo, `requiresMinDay 3` (days never advance in 3D) |
| `q_romance_future` | One More Place | `romance_future` | ❌ | RomanceScene, day 4 |
| `q_proposal` | One Question | `romance_proposal` | ❌ | RomanceScene, day 6, rel 40 |
| `q_wedding_plan_one` | The List | `wedding_planning_one` | ❌ | RomanceScene, day 7, engaged |
| `q_wedding_plan_two` | Three Looks, One Juju | `wedding_planning_two` | ❌ | RomanceScene, day 8 |
| `q_desert_wedding` | Our Desert Wedding | `desert_wedding` | ❌ | WeddingScene, day 9 |
| `q_first_property` | Keys to Somewhere New | buy `dubailand_2br` → decorate | ❌ | Phone › Homes, HouseScene tour, build mode |
| `q_positano_life` | Lemon Light | buy `positano_home` → visit Positano → café → viewpoint | ❌ | Homes, `italy_positano`, globe travel |
| `q_santorini_life` | Blue Door, Gold Sky | buy `santorini_villa` → visit Santorini → café → view | ❌ | Homes, `greece_santorini`, globe travel |
| `q_adnoc_ceo` | The Final Promotion | elevator → boardroom → info → questions → crisis → return → rooftop | ❌ | AdnocHQScene/AdnocTaskScene. The 3D `useOffice` targets are stale. |

Score: 0 of 35 quests are completable in 3D. 1 of 35 is partial (`q_edinburgh`, fixable with a one-line change).

---

## 7. Home System

| Feature | Legacy source | 3D Status | Notes |
|---------|---------------|-----------|-------|
| Enter/exit house | `HouseScene`, WorldScene `home`/`stairs` zones | ❌ MISSING | Zones fire, then toast "interiors aren't in 3D yet". |
| Sleep (save and new day) | HouseScene → `store.sleep()` | ❌ MISSING | This is the only way the day advances. Its absence blocks day-gated quests and daily resets. |
| Wardrobe ("Change outfit") | HouseScene | ❌ MISSING | |
| Photo wall | HouseScene | ❌ MISSING | |
| Souvenir shelf / keepsakes | HouseScene, Phone › Notes | ❌ MISSING | |
| Visitor hangout ("Spend time with Moomoo", visitors) | HouseScene | ❌ MISSING | |
| Home activities (coffee, TV, sofa, plant, snack, deliveries) | HouseScene (`timing` minigame) | ❌ MISSING | |
| Tigor at home | HouseScene | ❌ MISSING | |
| Furniture / build mode | `systems/buildMode.ts` (`BuildModeController`) | ❌ MISSING | The 3D shop still writes `state.furniture` with 2D pixel slots. |
| Multiple properties | `data/properties.ts` (7), `systems/properties.ts` | ❌ MISSING | |
| Active / primary home | `activeHomeId`, `primaryHomeId`, `setPrimaryHome` | ❌ MISSING | |
| Property tour / purchase | Phone › Homes → HouseScene `{ tour: true }`, `buyProperty` | ❌ MISSING | |

Property data issue: `dubailand_2br` has `locationId: "dubai_lagoons"`, and `damac_hills_2br`/`damac_hills_villa` have `"dubai_damac_hills"`. **Neither ID exists in `LOCATIONS`**, so `getLocation()` silently falls back to `abudhabi_yas`.

---

## 8. Regional Art

This section covers what is hard-coded as Scottish today. All of it runs for every location, because nothing in the 3D pipeline is region-aware.

- **`rendering/environment.ts` `TILE_PAINT` (:38–62)**
  - `t_sand → "grass"`. **Sand goes through the grass pipeline**: grass splat, grass detail grain, grass tufts and the kerb-stone edge. The UAE, Amman, Positano and Santorini maps use a `t_sand` base (19 uses in locations.ts), so they would render as lawns.
  - `t_snow → "heather"` (commented "Edinburgh maps") and `t_grass2 → "moss"`.
  - Every carriageway key (`t_road`, `t_asphalt`, `t_road_lane`, `t_crossing`, `t_parking`) and `t_path` maps to the one `road` grain. It is painted with `settTexture()` (:900): hand-painted cobbled setts with moss in the joints. There is no asphalt, no lane markings and no zebra crossings.
  - Kerbs are a mossy pebble kerb along grass↔hard edges. `t_cobble` renders as pale sandstone flags raised to curb height.
- **`rendering/materials.ts`**
  - `PALETTE` is the Scottish/European palette: `stoneWarm`, `slate`, `moss`, `heather`, `terracottaMuted`.
  - The texture styles (`stone` with lichen dots, `cobble` with moss joints, `slate`, `roof` pantiles) have no whitewash/lime render, sandstone block, glass curtain wall, metal cladding, beach sand or stucco style.
  - `SLOT_STYLE` only defines stone, slate, roof tile, wood and bark.
  - There is no ivy in `materials.ts` itself. Ivy comes from the kit and dressing.
- **`world/propMap.ts`**
  - **`o_palm → "tree-a"`**: the procedural broadleaf with green variants. There is no palm mesh, either as a hero asset or a kit piece.
  - `o_foodtruck`, `o_bus_red` and `o_cab` become tinted `car`/`jeep`.
  - `o_ferrari` hits the default `o_*` branch and becomes a crate.
  - `o_railing` becomes a wooden fence.
- **`world/propMap.ts` `buildingSpec`**
  - Only Scottish/European textures have explicit cases (`b_tenement`, townhouses, `b_cafe`, `b_shop`, `b_pub`, `b_wellcourt`, `b_uni`).
  - **Every** `b_glass_*`, `b_tower`, `b_residence`, `b_villa_*`, `b_town_blue*`, `b_fachwerk_*`, `b_mansion`, `b_sandstone`, `b_dubai_mall`, `b_yas_mall`, `b_adnoc_hq` and `b_so1`/`b_so2` falls to `default`. By sprite height, that yields a Scottish cottage preset (1–2 storeys) or a `tenementSand`/`tenementGrey` (3+ storeys) with a slate or terracotta roof.
- **`world/worldBuilder.ts:260`**: `isCastle = p.tex.startsWith("lm_")`. **Every landmark becomes the castle**: an 8×5 footprint with kind `castle`. That covers Burj Khalifa, the Grand Mosque, Big Ben, Westminster, the Römer, Amman Citadel and the Leicester clocktower.
- **`world/dressing.ts`**
  - It runs for every location. It adds up to 120 extra street cottages from `EXTRA_PRESETS`: `stoneCrow`, `creamTerra`, `greyDormer`, `bothy`, `whiteSlate` and others.
  - It also adds pines (`PINES`), heather drifts, dry-stone village-edge walls, `ivy-card` on cottage doors, a red post-box, a phone box and oak/pine tree lines.
  - There is a `def.id === "edinburgh_oldtown"` benchmark block (:289, :378, :567).
- **`rendering/backdrop.ts`**: the distant **Edinburgh old-town skyline** (tenement gables, St Giles crown) is drawn behind every map. `game3d.ts:177` also draws the **castle-on-rock silhouette whenever the location has no castle of its own**.
- **The HD catalog `src/game/visual/catalog.ts` is legacy-2D only.** It covers Phaser SVG keys: 12 `hd_terrain_*` (including `hd_terrain_sand`, `hd_terrain_sidewalk`), 5 `hd_building_yas_*`, and `hd_vehicle_jeep`. Everything else is `LEGACY_FALLBACK`. The 3D build does not read it.
- **3D hero assets** (`assets/hero/index.ts`) are all European village pieces: oak, pine, `tree-cypress` (usable for Italy), bushes, lamp, stone wall, fence, post-box, café set, ivy, cottage heroes and café hero.

| Region | Locations | Current 3D art status | What needs to be built |
|--------|-----------|------------------------|------------------------|
| Scotland (Edinburgh) | `edinburgh_oldtown`, `edinburgh_dean`, `edinburgh_uni` | ✅ Benchmark ("Storybook Low-Poly", `docs/VISUAL_STYLE.md`) | Nothing for the benchmark. Interiors are needed for stairs and flats. |
| England: London | `london_westminster`, `london_westend` | 🔶 Would render as Scottish village | London brick and stucco terraces, shopfronts, pub; Big Ben and Westminster landmark meshes; red bus, black cab, phone box (exists) and London lamps; asphalt roads with markings; the Thames embankment; London skyline backdrop. |
| England: Midlands | `leicester` | 🔶 Would render as Scottish village | Red-brick terraces, clocktower/uni landmark, asphalt suburban roads, hedges and deciduous trees. |
| UAE Modern (urban / residential) | `dubai_downtown`, `dubai_szr`, `dubai_oasis`, `dubai_hills`, `dubai_damac`, `abudhabi_city`, `abudhabi_yas`, `abudhabi_noya`, `abudhabi_yasmall` | ❌ Would render as grassy Scottish village with castles | Glass towers and residences, modern villas (terra and sand), mall shells, ADNOC HQ and ADNOC station, Burj and Grand Mosque landmarks. Real sand ground, desert-tinted lawns, asphalt multi-lane roads with markings, roundabouts, palms, bollards, Gulf-light lighting preset, and a desert/skyline backdrop. |
| UAE Coastal / Desert | `abudhabi_corniche`, `abudhabi_saadiyat`, `abudhabi_hudayriyat`, `abudhabi_last_exit` | ❌ Same | Beach sand and shoreline, promenade, food-truck meshes, palms, shade structures, open desert road edge (Last Exit), sea backdrop. |
| Germany | `germany` (Frankfurt) | 🔶 Closest to the existing kit | Fachwerk (half-timber) facades, Römer stepped-gable landmark, cobble squares, the Main river edge. |
| Jordan | `amman` | ❌ | Limestone/sandstone block buildings, hillside terraces, Citadel ruins landmark, rock border, dusty palette. The data is still "beta". |
| Mediterranean: Italy | `italy_positano` | ❌ | Pastel stucco cliff houses (cream, red, lemon), terraces and steps, cypress (hero exists) and palms, bougainvillea, sea and boats, cliff backdrop. |
| Mediterranean: Greece | `greece_santorini` | ❌ | Whitewashed cubic houses, blue domes and doors, caldera cliff edge, paving, sunset backdrop. |

---

## 9. Placeholder Strings to Remove

User-facing strings under `src/app3d/**`:

| File:line | String |
|-----------|--------|
| `src/app3d/ui/modals.ts:40` | "Travel by globe is coming to the 3D world soon." |
| `src/app3d/ui/modals.ts:72` | "A proper drawn map is on its way." |
| `src/app3d/ui/modals.ts:81` | "No GPS signal here yet." (always shown, because `minimap` is never filled in 3D) |
| `src/app3d/ui/modals.ts:95` | "Play (coming soon)" (disabled minigame button) |
| `src/app3d/systems/worldController.ts:203` | "The heist scene isn't in 3D yet" |
| `src/app3d/systems/worldController.ts:291` | "The Jeep isn't road-ready in 3D yet" |
| `src/app3d/systems/worldController.ts:466` | `` `${title} — interiors aren't in 3D yet` `` |
| `src/app3d/systems/worldController.ts:471` | "The mall isn't in 3D yet" |
| `src/app3d/systems/worldController.ts:482` | `` `${dest.name} isn't built in 3D yet` `` |
| `src/app3d/ui/title.ts:47` | "Play Full Pixel Game" (link to `/legacy.html`; remove once parity is reached) |

`TODO(3d)` comments (not user-facing): `src/app3d/ui/modals.ts:33` (globe), `:65` (district map), `:87` (minigames). There are related "not ported" comments at `worldController.ts:202` and `:290`.

Outside `app3d`, the shared data file `src/game/data/locations.ts:1580` has the `amman` subtitle "Coming soon (beta)".

---

## 10. Implementation Phases (Recommended)

1. **Fix what exists (small).** Fix the `well_court_race` hook, the stale `adnoc_lab`/`adnoc_boardroom`/`sister_room` targets, the stub treating skip as success, and destructive New game. Add the `fillCityMinimap` call. This makes `q_edinburgh` completable, which gives a first end-to-end quest to verify.
2. **Save slots and title parity, plus a sleep path.** The rest depends on these: nothing day-gated works without `store.sleep()`, and New game must stop wiping slots. The first sleep can be a temporary "Rest" action until interiors land.
3. **Region-aware world pipeline.** Add a per-location art profile that drives ground paint (real sand, asphalt vs setts), backdrop, dressing presets and building/landmark mapping. Add palm and landmark meshes. Every new location depends on this, so it must come before porting more of them.
4. **Travel.** Add a WorldMapScene equivalent (globe/city picker), then the Jeep and district fast-travel (driving can start as a transition, with DrivingScene later). Then port the UAE hub locations (Yas, Downtown, Oasis, Damac, AD City) because most quest givers live there.
5. **Minigame suite.** Build real DOM or 3D versions of the 13 kinds, starting with the ones 3D already emits (coffee, stairs, bouquet, photo, salon), then timing, lockpick, safe, badge_photo and showdown.
6. **Home.** Port HouseScene interiors (sleep, wardrobe, photo wall, shelf, visitors), then build mode, then properties and Phone › Homes. The romance and property quests and `q_home_refresh` depend on this.
7. **Phone parity.** Add Quests (with accept and Tigor launch), Ppl/companions, Fit, Car, Cam/Album, Stats, Notes and chat threads.
8. **Special scenes by quest value.** Order: MallScene and BabaShopping → QuestActivityScene → AdnocHQ/AdnocTask → Romance/Wedding → Pirate and SisterHeist → Tigor Mission/Airport.
9. **Remaining regions.** London, Leicester, Frankfurt, Positano, Santorini, Amman, each with its art profile. Then remove the placeholder strings and the legacy link.

---

## Appendix A — All Quest IDs

| # | ID | Title |
|---|----|-------|
| 1 | `q_adnoc_engineer` | First Day, Big Blue Building |
| 2 | `q_baba_card` | Baba's Card |
| 3 | `q_date` | Coffee from the Mall |
| 4 | `q_flowers` | Flowers for Mama |
| 5 | `q_baba_spree` | Baba's Shopping Nightmare |
| 6 | `q_residences` | Apartment 1701 |
| 7 | `q_london` | Sisters in London |
| 8 | `q_westminster` | Big Ben with Fadwa |
| 9 | `q_edinburgh` | The Girls in Edi |
| 10 | `q_nour` | Brother in Germany |
| 11 | `q_chloe` | Tea in Oadby |
| 12 | `q_retrieve_tigor` | Retrieve Tigor |
| 13 | `q_saadiyat` | Saadiyat glow |
| 14 | `q_hudayriyat` | Food trucks |
| 15 | `q_saadiyat_truck_hop` | Saadiyat snack crawl |
| 16 | `q_last_exit` | Last Exit detour |
| 17 | `q_yas_showdown` | Family chaos championship |
| 18 | `q_coffee_run` | His order |
| 19 | `q_family_jewel_heist` | The Great Family Jewel Heist |
| 20 | `q_adnoc_pressure_problem` | The Pressure Problem |
| 21 | `q_adnoc_paperclip_incident` | The Paperclip Incident |
| 22 | `q_adnoc_team_lead` | Team Lead for a Day |
| 23 | `q_adnoc_control_room` | The Control Room Gauntlet |
| 24 | `q_adnoc_director` | Director's Rounds |
| 25 | `q_home_refresh` | Make It Yours |
| 26 | `q_romance_us` | Us |
| 27 | `q_romance_future` | One More Place |
| 28 | `q_proposal` | One Question |
| 29 | `q_wedding_plan_one` | The List |
| 30 | `q_wedding_plan_two` | Three Looks, One Juju |
| 31 | `q_desert_wedding` | Our Desert Wedding |
| 32 | `q_first_property` | Keys to Somewhere New |
| 33 | `q_positano_life` | Lemon Light |
| 34 | `q_santorini_life` | Blue Door, Gold Sky |
| 35 | `q_adnoc_ceo` | The Final Promotion |

## Appendix B — All Location IDs

| ID | Name | City | Region | 3D |
|----|------|------|--------|----|
| `abudhabi_yas` | Yas Island | abudhabi | UAE Modern | ❌ |
| `abudhabi_noya` | Noya Plaza | abudhabi | UAE Modern | ❌ |
| `abudhabi_yasmall` | Yas Mall | abudhabi | UAE Modern | ❌ |
| `abudhabi_city` | Abu Dhabi City | abudhabi | UAE Modern | ❌ |
| `abudhabi_corniche` | The Corniche | abudhabi | UAE Coastal | ❌ |
| `abudhabi_saadiyat` | Saadiyat | abudhabi | UAE Coastal | ❌ |
| `abudhabi_hudayriyat` | Hudayriyat | abudhabi | UAE Coastal | ❌ |
| `abudhabi_last_exit` | Last Exit | abudhabi | UAE Desert/Coastal | ❌ |
| `dubai_downtown` | Downtown Dubai | dubai | UAE Modern | ❌ |
| `dubai_szr` | Sheikh Zayed Road | dubai | UAE Modern | ❌ |
| `dubai_damac` | Damac Lagoons | dubai | UAE Modern | ❌ |
| `dubai_oasis` | Silicon Oasis | dubai | UAE Modern | ❌ |
| `dubai_hills` | Dubai Hills | dubai | UAE Modern | ❌ |
| `london_westminster` | Westminster | london | London | ❌ |
| `london_westend` | West End | london | London | ❌ |
| `edinburgh_oldtown` | Old Town | edinburgh | Scotland | 🔶 |
| `edinburgh_dean` | Dean Village | edinburgh | Scotland | 🔶 |
| `edinburgh_uni` | Heriot-Watt | edinburgh | Scotland | 🔶 |
| `leicester` | Oadby | leicester | England (Midlands) | ❌ |
| `germany` | Frankfurt | germany | Germany | ❌ |
| `amman` | Amman | amman | Jordan | ❌ |
| `italy_positano` | Positano | italy | Mediterranean (Italy) | ❌ |
| `greece_santorini` | Oia, Santorini | greece | Mediterranean (Greece) | ❌ |

All 23 district IDs in `LOCATIONS`. `getLocation()` also accepts a city ID and resolves it to that city's hub, and it falls back to `abudhabi_yas` for any unknown ID.

## Appendix C — All NPC IDs

From `src/game/data/npcs.ts`:

| ID | Name | Home location |
|----|------|---------------|
| `her` | Juju (player) | — |
| `moomoo` | Moomoo | `dubai_oasis` (schedule: Hills, Downtown, Oasis) |
| `mama` | Mama | `dubai_damac` |
| `baba` | Baba | `abudhabi_yas` (schedule: Corniche afternoons) |
| `fadwa` | Fadwa | `london_westend` (schedule: Westminster mornings) |
| `nour` | Nour | `germany` |
| `jad` | Jad | `abudhabi_yas` (random daily visit) |
| `shan` | Shan | `abudhabi_yas` (random daily visit) |
| `hazel` | Hazel | `edinburgh_oldtown` (schedule: Dean mornings) — reachable in 3D |
| `rhiannon` | Rhiannon | `edinburgh_oldtown` (schedule: Dean evenings) — reachable in 3D |
| `chloe` | Chloe | `leicester` |
| `adnoc_recruiter` | Alya at ADNOC HQ | `abudhabi_city` |
| `fashion_assistant` | Fashion Assistant | `mall` (MallScene only) |
| `jewelry_assistant` | Jewelry Assistant | `mall` |
| `mall_concierge` | Mall Concierge | `mall` |
| `mall_cafe_worker` | Cafe Worker | `mall` |

Quest talk targets `adnoc_reception` and `adnoc_manager` are not in `npcs.ts`. AdnocHQScene defines them inline.
