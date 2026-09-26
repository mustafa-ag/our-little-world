// Engine-free port of the gameplay rules in src/game/scenes/WorldScene.ts.
// Everything visual goes through `WorldViewHooks` so the rules never touch
// Babylon. Event names/args match the 2D UIScene contract exactly.

import { TILE } from "../../game/constants";
import { getLocation, type Cardinal, type LocationDef } from "../../game/data/locations";
import { NPCS, type NpcDef } from "../../game/data/npcs";
import { secretsFor } from "../../game/data/secrets";
import { store } from "../../game/systems/store";
import { controls, uiEvents } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import * as companions from "../../game/systems/companions";
import { npcInLocation, getNpcsAtLocation, npcWorldPos, linesFor, homeComment } from "../../game/systems/life";
import { tryDeliverMessages } from "../../game/systems/phone";
import { pickEncounter, applyEncounter } from "../../game/systems/encounters";
import { outfitReaction } from "../../game/systems/outfitReactions";
import type { WorldData, ZoneSpec } from "../../game/worldgen";
import { pxToXZ, pxToUnits, xzToPx } from "../world/coords";
import type { InteractionSystem } from "./interaction";
import { WorldEvents3D } from "./worldEvents3d";

export type PickupKind = "flower_pink" | "flower_yellow" | "heart" | "coins" | "note" | "postcard" | "cat" | "star" | "card";

export interface WorldViewHooks {
  spawnNpc(def: NpcDef, x: number, z: number): void;
  /** Remove a spawned NPC (their schedule moved them elsewhere). */
  despawnNpc(npcId: string): void;
  /** The set of spawned NPCs changed after setup (minimap / world map refresh). */
  npcsChanged(): void;
  npcFacePlayer(npcId: string): void;
  spawnPickup(id: string, kind: PickupKind, x: number, z: number): void;
  removePickup(id: string): void;
  spawnCat(x: number, z: number): void;
  spawnJeep(x: number, z: number): void;
  petalBurst(x: number, z: number): void;
  requestTravel(to: string, from: Cardinal): void;
  playerPos(): { x: number; z: number; yaw: number };
  /** Companion (Phase 6B): an NpcView that trails the player (game3d moves it each frame). */
  spawnCompanion(def: NpcDef, x: number, z: number): void;
  removeCompanion(): void;
  companionPos(): { x: number; z: number } | null;
  companionFacePlayer(): void;
  setTimeout(ms: number, fn: () => void): void;
}

/** Locations that have a 3D scene (all of game/data/locations.ts since Phase 5C). */
export const PORTED_LOCATIONS = new Set([
  "edinburgh_oldtown",
  "edinburgh_dean",
  "edinburgh_uni",
  // UAE hub (Phase 2A): Yas is Baba's home, ADNOC HQ (Alya) is in the city
  "abudhabi_yas",
  "abudhabi_city",
  "abudhabi_saadiyat",
  "abudhabi_corniche",
  "abudhabi_last_exit",
  "abudhabi_hudayriyat",
  // Dubai (Phase 4A): Mama lives at DAMAC, Moomoo roams Hills / Downtown / Oasis
  "dubai_downtown",
  "dubai_szr",
  "dubai_damac",
  "dubai_oasis",
  "dubai_hills",
  // England (Phase 4A)
  "london_westminster",
  "london_westend",
  "leicester",
  // Yas side districts (Phase 5C): walk-ins from Yas (north / south exits)
  "abudhabi_noya",
  "abudhabi_yasmall",
  // Abroad (Phase 5C): every region has an art profile (world/artProfile.ts)
  "amman",
  "germany",
  "italy_positano",
  "greece_santorini",
]);

export const TIME_TICK_MS = 90_000;

/** q_family_jewel_heist steps played inside Fadwa's house (ui/storyScenes.ts heist scene). */
const HEIST_HOUSE_TARGETS = ["house_lock", "enter_fadwa_house", "reach_fadwa_room", "drawer_lock", "family_safe", "escape_fadwa_house"];
/** Moomoo's romance / wedding chapters (RomanceScene + WeddingScene). */
const ROMANCE_TARGETS = ["romance_us", "romance_future", "romance_proposal", "wedding_planning_one", "wedding_planning_two", "desert_wedding"];

/** Interaction id of the travelling companion's talk zone. */
const COMPANION_INTERACT = "companion";

/** Same shape as ui/storyScenes.ts StoryRequest (kept local: systems never import the UI). */
type StoryRequest = { scene: "romance" | "wedding" | "tigor" | "heist" | "pirate" | "questActivity"; activity?: string };

export class WorldController {
  private lastInteract = 0;
  /** Ambient world events (Phase 6A): rolled once per arrival. */
  private worldEvents: WorldEvents3D | null = null;
  private transitioning = false;
  /** Inside a house interior: exterior rules, prompts and time ticks pause. */
  private indoors = false;
  private timeAcc = 0;
  /** NPCs currently spawned here (per their schedule). */
  private spawnedNpcs = new Set<string>();
  private arriveAt = 0;
  private now = 0;
  // assigned in the constructor: a field initializer would run before the
  // parameter properties are set (useDefineForClassFields)
  private def: LocationDef;

  constructor(
    readonly locationId: string,
    private world: WorldData,
    private interaction: InteractionSystem,
    private hooks: WorldViewHooks,
  ) {
    this.def = getLocation(locationId);
  }

  // -------------------------------------------------------------------------
  /**
   * Gameplay side of arriving (save writes, quests, messages, encounters).
   * `travelled`: entered via an exit this session; `fresh`: a save that had
   * not been started before this session (or a New game). Otherwise the save's
   * currentLocation is only overwritten when it is itself a ported location,
   * so a started save sitting in a non-ported place is left untouched.
   */
  setup(nowMs: number, opts: { travelled?: boolean; fresh?: boolean } = {}) {
    this.now = nowMs;
    this.arriveAt = nowMs + 600;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("prompt", null);
    try {
      uiEvents.emit("sceneReset");
    } catch {
      /* overlay teardown must not block a new map */
    }

    const def = this.def;
    if (opts.travelled || opts.fresh || PORTED_LOCATIONS.has(store.state.currentLocation)) store.setLocation(def.id);
    store.unlockLocation(def.cityId);
    store.unlockLocation(def.id);

    for (const z of this.world.zones) {
      if (z.action === "drive") continue;
      this.addZone(z);
    }
    this.buildCollectibles();
    this.buildNpcs();
    this.placeQuestObjects();
    this.placeHeistHouse();
    this.placeSecrets();
    this.placeJeep();
    this.spawnCompanion();

    // "openMap" is handled by the UI layer (map panel); the world only emits it.
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("uiClosed", this.onUiClosed, this);
    uiEvents.on("companionChanged", this.refreshCompanion, this);
    // schedules move people between districts as the clock advances
    store.on("time", this.refreshNpcs, this);

    quests.onVisit(def.id);
    quests.onVisit(def.cityId);
    // WorldScene: arriving somewhere with a companion counts as driving with them
    const buddy = companions.current();
    if (buddy) quests.onDriveWith(buddy);
    tryDeliverMessages({ wake: store.state.messages.length === 0, limit: 1 });
    uiEvents.emit("locationTitle", def.name, def.subtitle);
    // WorldScene.create: resume the heist's pirate idea, and sail when London is the destination
    const heistResume = quests.currentStep("q_family_jewel_heist")?.target;
    if (heistResume === "pirate_idea" && !store.hasFlag("pirate_disguise")) {
      this.hooks.setTimeout(850, () => {
        if (this.transitioning || controls.locked) return;
        this.startPirateIdea();
        uiEvents.emit("dialogue", "Juju", ["Mama specifically said not to get ideas.", "Unfortunately, I remembered my idea."]);
      });
    } else if (def.cityId === "london" && store.hasFlag("pirate_disguise") && (heistResume === "pirate_voyage" || heistResume === "great_white_boss")) {
      this.hooks.setTimeout(650, () => {
        if (!this.transitioning) this.startStory({ scene: "pirate" });
      });
    }
    if (store.hasFlag("heist_victory_pending")) {
      store.setFlag("heist_victory_pending", false);
      this.hooks.setTimeout(350, () =>
        uiEvents.emit("dialogue", "Juju", ["THE GREAT FAMILY JEWEL HEIST · Complete", "Absolutely no crimes occurred."]),
      );
    }
    this.hooks.setTimeout(700, () => {
      if (this.transitioning) return;
      this.maybeEncounter();
    });
    // WorldScene.create: the day's ambient world event rolls shortly after arriving
    this.worldEvents = new WorldEvents3D({
      locationId: def.id,
      worldW: this.world.w * TILE,
      worldH: this.world.h * TILE,
      interaction: this.interaction,
      hooks: this.hooks,
      canRun: () => !this.transitioning && !this.indoors,
    });
    this.worldEvents.start();
    // after onVisit: arriving at Yas is q_yas_showdown's first step
    this.placeYasShowdown();
    // WorldScene.maybeCompanionComment: one remark per companion + place per day
    this.hooks.setTimeout(1250, () => {
      if (this.transitioning || controls.locked) return;
      this.maybeCompanionComment();
    });
  }

  dispose() {
    this.worldEvents?.dispose();
    this.worldEvents = null;
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("uiClosed", this.onUiClosed, this);
    uiEvents.off("companionChanged", this.refreshCompanion, this);
    store.off("time", this.refreshNpcs, this);
    this.interaction.clear();
  }

  // -------------------------------------------------------------------------
  private buildCollectibles() {
    for (const c of this.world.collectibles) {
      if (store.state.collected[c.id]) continue;
      const p = pxToXZ(c.x, c.y);
      this.hooks.spawnPickup(c.id, c.tex === "o_flower_yellow" ? "flower_yellow" : "flower_pink", p.x, p.z);
      this.interaction.add({
        id: c.id,
        x: p.x,
        z: p.z,
        radius: pxToUnits(16),
        prompt: "Pick this flower",
        kind: "collectible",
        trigger: () => {
          if (!store.collect(c.id)) return;
          this.hooks.removePickup(c.id);
          this.interaction.remove(c.id);
          store.addCoins(1);
          store.addItem("flower");
          this.hooks.petalBurst(p.x, p.z);
          quests.onCollect(c.tag);
          if (store.getItemQuantity("flower") >= 3 && !store.hasDaily("bouquet_offer")) {
            store.setDaily("bouquet_offer");
            this.offerBouquet();
          }
        },
      });
    }
  }

  /** Spawn everyone whose schedule puts them in this district right now. */
  private buildNpcs() {
    for (const id of getNpcsAtLocation(this.locationId)) this.spawnScheduledNpc(id);
  }

  /** Time advanced: despawn NPCs who left, spawn the ones who just arrived. */
  private refreshNpcs() {
    if (this.transitioning) return;
    const want = new Set(getNpcsAtLocation(this.locationId));
    let changed = false;
    for (const id of [...this.spawnedNpcs]) {
      if (want.has(id)) continue;
      this.spawnedNpcs.delete(id);
      this.interaction.remove(`npc:${id}`);
      this.hooks.despawnNpc(id);
      changed = true;
    }
    for (const id of want) {
      if (this.spawnedNpcs.has(id)) continue;
      this.spawnScheduledNpc(id);
      changed = true;
    }
    if (changed) this.hooks.npcsChanged();
  }

  /** Map-authored spot for this NPC if the district has one, else their schedule's tile. */
  private spawnScheduledNpc(npcId: string) {
    const def = NPCS.find((n) => n.id === npcId);
    if (!def || this.spawnedNpcs.has(def.id)) return;
    const spot = this.world.npcSpots.find((sp) => sp.id === def.id);
    const pos = spot ? { x: spot.x, y: spot.y } : npcWorldPos(def);
    this.placeNpc(def, pos.x, pos.y);
  }

  private placeNpc(def: NpcDef, px: number, py: number) {
    this.spawnedNpcs.add(def.id);
    const p = pxToXZ(px, py);
    this.hooks.spawnNpc(def, p.x, p.z);
    this.interaction.add({
      id: `npc:${def.id}`,
      x: p.x,
      z: p.z,
      radius: pxToUnits(26),
      prompt: `Talk to ${def.name}`,
      kind: "npc",
      trigger: () => {
        this.hooks.npcFacePlayer(def.id);
        store.state.lastPassenger = def.id;
        store.save();
        // story hand-offs (WorldScene: companion Moomoo → Romance/Wedding, Nour/Chloe → QuestActivity)
        if (def.id === "moomoo" && this.startRomanceIfReady()) return;
        if (def.id === "nour" && ["nour", "nour_snacks"].includes(quests.currentStep("q_nour")?.target ?? "")) {
          if (this.startStory({ scene: "questActivity", activity: "nour_visit" })) return;
        }
        if (def.id === "chloe" && ["chloe", "chloe_thesis"].includes(quests.currentStep("q_chloe")?.target ?? "")) {
          if (this.startStory({ scene: "questActivity", activity: "chloe_thesis" })) return;
        }
        const lines = linesFor(def.id, def.dialogue);
        const extra = store.getRelationship(def.id) >= 20 ? homeComment() : null;
        // once-a-day outfit acknowledgement (WorldScene's styleNote)
        const styleNote = outfitReaction(def.id);
        const res = quests.onTalk(def.id, [...lines, ...(styleNote ? [styleNote] : []), ...(extra ? [extra] : [])]);
        uiEvents.emit("dialogue", def.name, res.lines, { npcId: def.id });
        if (res.acceptedQuest?.id === "q_family_jewel_heist") this.startPirateIdea();
      },
    });
  }

  // ------------------------------------------------------------ companion
  /**
   * WorldScene.spawnActiveCompanion: the companion appears beside Juju and
   * trails her. Someone already standing here (their own spot) isn't doubled.
   */
  private spawnCompanion() {
    const id = companions.current();
    if (!id || this.interaction.get(`npc:${id}`)) return;
    const def = NPCS.find((n) => n.id === id);
    if (!def) return;
    const p = this.hooks.playerPos();
    // ~1.5 units behind-left of where Juju faces
    const x = p.x - Math.sin(p.yaw) * 1.2 - Math.cos(p.yaw) * 0.8;
    const z = p.z - Math.cos(p.yaw) * 1.2 + Math.sin(p.yaw) * 0.8;
    this.hooks.spawnCompanion(def, x, z);
    this.interaction.add({
      id: COMPANION_INTERACT,
      x,
      z,
      radius: pxToUnits(26),
      prompt: `Talk to ${def.name}`,
      kind: "npc",
      trigger: () => this.talkToCompanion(def),
    });
  }

  private talkToCompanion(def: NpcDef) {
    this.hooks.companionFacePlayer();
    store.state.lastPassenger = def.id;
    store.save();
    if (def.id === "moomoo" && this.startRomanceIfReady()) return;
    quests.onInteract(`companion_${def.id}`);
    const styleNote = outfitReaction(def.id);
    const res = quests.onTalk(def.id, [...linesFor(def.id, def.dialogue), ...(styleNote ? [styleNote] : [])]);
    uiEvents.emit("dialogue", def.name, res.lines, { npcId: def.id });
  }

  /** Invited / dropped off (phone People tab, HUD chip) while this location is loaded. */
  private refreshCompanion() {
    this.interaction.remove(COMPANION_INTERACT);
    this.hooks.removeCompanion();
    if (this.transitioning) return;
    this.spawnCompanion();
  }

  private maybeCompanionComment() {
    const id = companions.current();
    if (!id || !this.interaction.get(COMPANION_INTERACT)) return;
    const def = NPCS.find((n) => n.id === id);
    const line = def ? companions.companionComment(id, this.locationId) : null;
    if (def && line) uiEvents.emit("dialogue", def.name, [line], { npcId: def.id });
  }

  /** WorldScene: "FADWA'S HOUSE · EXTREMELY NORMAL ENTRANCE" in the West End while the heist is on. */
  private placeHeistHouse() {
    const heistOn = () => HEIST_HOUSE_TARGETS.includes(quests.currentStep("q_family_jewel_heist")?.target ?? "");
    if (this.locationId !== "london_westend" || !heistOn()) return;
    const worldW = this.world.w * TILE;
    const worldH = this.world.h * TILE;
    const p = pxToXZ(worldW * 0.56, Math.min(worldH - 80, worldH * 0.48));
    this.hooks.spawnPickup("q:fadwa_house", "star", p.x, p.z);
    this.interaction.add({
      id: "q:fadwa_house",
      x: p.x,
      z: p.z,
      radius: pxToUnits(34),
      prompt: "Approach Fadwa's house",
      kind: "quest",
      enabled: heistOn,
      trigger: () => this.startStory({ scene: "heist" }),
    });
  }

  /** Open a ui/storyScenes.ts scene; false (with a toast) if no UI is listening. */
  private startStory(req: StoryRequest): boolean {
    uiEvents.emit("prompt", null);
    if (uiEvents.emit("storyScene", req)) return true;
    store.toast("That story isn't available right now", "#ffe08a");
    return false;
  }

  /** WorldScene.startRomanceActivityIfReady — Moomoo's next romance / wedding chapter. */
  private startRomanceIfReady(): boolean {
    const active = quests.activeQuests().find((q) => q.step.type === "playMinigame" && ROMANCE_TARGETS.includes(q.step.target));
    if (!active) return false;
    const target = active.step.target;
    return this.startStory(target === "desert_wedding" ? { scene: "wedding" } : { scene: "romance", activity: target });
  }

  private placeQuestObjects() {
    if (this.locationId !== "abudhabi_yas" || quests.currentStep("q_baba_card")?.target !== "take_baba_card") return;
    const baba = NPCS.find((npc) => npc.id === "baba");
    if (!baba) return;
    const pos = npcWorldPos(baba);
    const p = pxToXZ(pos.x + 24, pos.y + 2);
    this.hooks.spawnPickup("q:baba_card", "card", p.x, p.z);
    this.interaction.add({
      id: "q:baba_card",
      x: p.x,
      z: p.z,
      radius: pxToUnits(22),
      prompt: "Take Baba's card",
      kind: "quest",
      trigger: () => {
        this.hooks.removePickup("q:baba_card");
        this.interaction.remove("q:baba_card");
        store.addItem("baba_card");
        quests.onInteract("take_baba_card");
        uiEvents.emit("dialogue", "Juju", ["No reason. Completely normal mall errand incoming."]);
      },
    });
  }

  /**
   * q_yas_showdown: WorldScene opens the sibling tap race when Juju talks to
   * Jad / Shan at Yas. In 3D a hotspot by Baba's spot starts it whenever the
   * quest waits on its "sibling_showdown" minigame step.
   */
  private placeYasShowdown() {
    const ready = () => this.locationId === "abudhabi_yas" && quests.currentStep("q_yas_showdown")?.target === "sibling_showdown" && !store.hasDaily("yas_sibling_showdown");
    if (!ready()) return;
    const baba = NPCS.find((npc) => npc.id === "baba");
    if (!baba) return;
    const pos = npcWorldPos(baba);
    const p = pxToXZ(pos.x - 30, pos.y + 18);
    this.hooks.spawnPickup("q:yas_showdown", "star", p.x, p.z);
    this.interaction.add({
      id: "q:yas_showdown",
      x: p.x,
      z: p.z,
      radius: pxToUnits(28),
      prompt: "Challenge your brother to a showdown",
      kind: "quest",
      enabled: ready,
      trigger: () => this.openSiblingShowdown(),
    });
  }

  /** WorldScene.openSiblingShowdown: best-of-3 family tap race. */
  private openSiblingShowdown() {
    const here = npcInLocation(this.locationId).find((n) => n.id === "jad" || n.id === "shan");
    const sibling = here ?? NPCS.find((n) => n.id === (store.state.currentDay % 2 ? "shan" : "jad"));
    const name = sibling?.name ?? "Jad";
    uiEvents.emit("prompt", null);
    uiEvents.emit("minigame", {
      kind: "showdown",
      title: `Juju vs ${name}`,
      hint: "First to the target wins the Family Chaos Championship.",
      taps: 16,
      skipLabel: "Let them win",
      onDone: (jujuWon?: boolean) => {
        // the step reads "Win or play": a loss still counts (WorldScene parity)
        store.setDaily("yas_sibling_showdown");
        quests.onMinigame("sibling_showdown");
        if (sibling) store.addRelationship(sibling.id, 2);
        this.hooks.removePickup("q:yas_showdown");
        this.interaction.remove("q:yas_showdown");
        const p = this.hooks.playerPos();
        this.hooks.petalBurst(p.x, p.z);
        uiEvents.emit("dialogue", "Family chaos", [
          jujuWon ? `Juju wins. ${name} has to wear the blue-and-white cap with the pink heart.` : `${name} wins. Juju wears the blue-and-white cap with the pink heart.`,
          "The bragging rights will definitely last until tomorrow.",
        ]);
      },
    });
  }

  private startPirateIdea() {
    controls.locked = true;
    this.hooks.setTimeout(260, () => uiEvents.emit("dialogue", "Juju", ["Operation: definitely mine now."]));
    this.hooks.setTimeout(740, () => {
      store.setFlag("pirate_disguise");
      quests.onInteract("pirate_idea");
      controls.locked = false;
      store.toast("PIRATE JUJU · Master of Extremely Legal Family Retrieval", "#f4c95d");
      // WorldScene.transformPirate → PirateVoyageScene
      this.hooks.setTimeout(1800, () => {
        if (this.transitioning || quests.currentStep("q_family_jewel_heist")?.target !== "pirate_voyage") return;
        this.startStory({ scene: "pirate" });
      });
    });
  }

  private placeSecrets() {
    for (const s of secretsFor(this.locationId)) {
      if (store.hasSecret(s.id)) continue;
      if (s.time && s.time !== store.state.timeOfDay) continue;
      if (s.minRel && store.getRelationship(s.minRel.npc) < s.minRel.min) continue;
      const p = pxToXZ(s.tx * TILE + TILE / 2, (s.ty + 1) * TILE);
      const kind: PickupKind =
        s.kind === "flower" ? "flower_pink" : s.kind === "heart" ? "heart" : s.kind === "cat" ? "cat" : s.kind === "note" ? "note" : s.kind === "postcard" ? "postcard" : s.kind === "coins" ? "coins" : "star";
      this.hooks.spawnPickup(s.id, kind, p.x, p.z);
      this.interaction.add({
        id: s.id,
        x: p.x,
        z: p.z,
        radius: pxToUnits(16),
        prompt: "What's this?",
        kind: "secret",
        trigger: () => {
          if (!store.discoverSecret(s.id)) return;
          this.hooks.removePickup(s.id);
          this.interaction.remove(s.id);
          if (s.item) store.addItem(s.item);
          if (s.kind === "coins") store.addCoins(12);
          if (s.memory) store.unlockMemory(s.memory);
          if (s.kind === "cat") this.hooks.spawnCat(p.x, p.z);
          store.toast(s.title, "#ffe08a");
          uiEvents.emit("dialogue", s.title, [s.hint === "Near the water." ? "You weren't supposed to find this. You did anyway." : s.title]);
        },
      });
    }
  }

  private placeJeep() {
    // WorldScene.placeFollowJeep: parked 22px east / 8px south of the spawn.
    const pl = this.hooks.playerPos();
    const px = xzToPx(pl.x, pl.z);
    const p = pxToXZ(px.x + 22, px.y + 8);
    this.hooks.spawnJeep(p.x, p.z);
    this.interaction.add({
      id: "jeep",
      x: p.x,
      z: p.z,
      radius: pxToUnits(22),
      prompt: "Get in the Jeep",
      kind: "vehicle",
      enabled: () => this.now > this.arriveAt,
      trigger: () => {
        // ui/modals.ts answers with the drive menu (districts of this city).
        uiEvents.emit("driveMenu", { locationId: this.locationId });
      },
    });
  }

  // -------------------------------------------------------------------------
  private addZone(z: ZoneSpec) {
    const p = pxToXZ(z.x, z.y);
    this.interaction.add({
      id: `zone:${z.action}:${z.tag ?? ""}:${z.x},${z.y}`,
      x: p.x,
      z: p.z,
      radius: pxToUnits(z.radius),
      prompt: z.prompt,
      kind: "zone",
      trigger: () => this.triggerZone(z),
    });
  }

  private triggerZone(z: ZoneSpec) {
    const loc = this.def;
    switch (z.action) {
      case "cafe":
        if (z.tag === "dubai_mall" || z.tag === "dubai_hills_mall") {
          // q_date's "Reach Dubai Mall" step is an interact on the mall tag (WorldScene parity)
          quests.onInteract(z.tag);
          return this.enterMall(z.tag);
        }
        if (z.tag === "hudayriyat_trucks") {
          quests.onInteract("cafe");
          quests.onInteract(z.tag);
          // the seagull ambush (QuestActivityScene fry_thief) opens with the "Order up" lines
          if (quests.currentStep("q_hudayriyat")?.target === "fry_thief" && this.startStory({ scene: "questActivity", activity: "fry_thief" })) return;
          uiEvents.emit("dialogue", "Hudayriyat", ["Food trucks by the water. You drove out for this."]);
          return;
        }
        uiEvents.emit("minigame", {
          kind: "coffee",
          title: z.tag === "saddle" ? "Saddle" : "Coffee",
          hint: "Cup, espresso, milk, lid. His order. Yours too.",
          skipLabel: "Not now",
          onDone: (ok?: boolean) => {
            if (!ok) return;
            quests.onInteract("cafe");
            if (z.tag) quests.onInteract(z.tag);
            quests.onMinigame("coffee");
            store.addItem("coffee");
            store.advanceTime();
            if (z.tag === "saddle") store.unlockMemory("mem_saddle");
            uiEvents.emit("dialogue", z.tag === "saddle" ? "Saddle" : "Cafe", ["Warm. Two sugars. You know the order."]);
          },
        });
        return;
      case "shop":
        if (z.tag === "yas_mall") return this.enterMall(z.tag);
        uiEvents.emit("openShop", z.tag === "adnoc_oasis" ? "adnoc" : "home");
        return;
      case "fuel":
        if (store.refuel()) {
          store.advanceTime();
          uiEvents.emit("dialogue", "ADNOC Oasis", ["Blue pumps, full tank. The road is yours again."]);
        }
        return;
      case "office":
        return this.useOffice(z.tag);
      case "home":
        this.enterHouse(loc.homeName ?? "Home", "cream", true);
        return;
      case "stairs": {
        const d = (z.data as { name?: string; tag?: string }) ?? {};
        const brown = d.tag === "well_court";
        const residences = quests.currentStep("q_residences")?.target;
        if (z.tag === "residences_t8" && (residences === "residences_t8" || residences === "apartment_1701_package")) {
          if (residences === "residences_t8") quests.onInteract("residences_t8");
          if (this.startStory({ scene: "questActivity", activity: "apartment_1701" })) return;
        }
        uiEvents.emit("minigame", {
          kind: "stairs",
          title: d.name ?? "Stairs",
          hint: brown ? "20 steps. 13 seconds. There is no skip button in this building." : "Climb quickly to the lobby.",
          taps: brown ? 20 : 10,
          onDone: (ok?: boolean) => {
            if (!ok) return;
            // q_edinburgh's Well Court step is a playMinigame("well_court_race")
            // step, not an interact step (matches WorldScene).
            if (brown) quests.onMinigame("well_court_race");
            else if (z.tag) quests.onInteract(z.tag);
            if (brown) store.unlockMemory("mem_well_court");
            this.enterHouse(d.name ?? "Inside", brown ? "brown" : "cream", false);
          },
        });
        return;
      }
      case "salon":
        if (z.tag) quests.onInteract(z.tag);
        uiEvents.emit("minigame", {
          kind: "salon",
          title: "Saadiyat",
          hint: "Nails or brows. Tap along — or skip if she's not in the mood.",
          taps: 10,
          skipLabel: "Skip",
          onDone: () => {
            store.addHearts(1);
            uiEvents.emit("dialogue", "Saadiyat", ["Fresh set. Eyebrows neat. She looks so pretty."]);
          },
        });
        return;
      case "exit": {
        if (this.now < this.arriveAt) return;
        const d = z.data as { to: string; from: Cardinal };
        this.goDistrict(d.to, d.from);
        return;
      }
      case "landmark": {
        const title = typeof z.data === "string" ? z.data : (loc.landmarkName ?? loc.name);
        const photoTag = loc.id === "london_westminster" ? "bigben" : loc.id;
        const photoTex = (typeof z.data === "string" && String(z.data)) || z.tag || loc.landmark || "o_fountain";
        const buddyId = store.state.lastPassenger ?? "moomoo";
        uiEvents.emit("minigame", {
          kind: "photo",
          title,
          hint: "Wait until you're both in the frame, then capture.",
          photoLabel: `${title} — ${loc.name}`,
          photoTex,
          photoBuddy: `char_${buddyId}`,
          skipLabel: "Just look",
          onDone: (ok?: boolean) => {
            if (ok) {
              quests.onPhoto(photoTag);
              if (photoTag === "bigben") store.unlockMemory("mem_bigben");
              if (loc.id === "dubai_downtown") store.unlockMemory("mem_downtown");
              if (store.state.lastPassenger) store.addRelationship(store.state.lastPassenger, 2);
            }
            uiEvents.emit("dialogue", title, [ok ? "That's the one. Keep it." : `${title} — ${loc.name}.`, "Wish you were really here with me."]);
          },
        });
        return;
      }
      case "info": {
        const d = z.data as { name: string; desc?: string } | undefined;
        if (d) uiEvents.emit("dialogue", d.name, [d.desc ?? d.name]);
        return;
      }
    }
  }

  /** ADNOC HQ: the whole career (first day, story missions, workdays,
   * control room, boardroom) runs in the ui/adnoc.ts career-centre modal. */
  private useOffice(tag?: string) {
    if (tag !== "adnoc_hq") return;
    if (!uiEvents.emit("enterAdnoc")) {
      uiEvents.emit("dialogue", "ADNOC HQ", ["The career centre is closed for a quick coffee break. Try again in a moment."]);
    }
  }

  /** Hand off to the UI layer (ui/house.ts fades into the 3D interior); toast if nothing listens. */
  private enterHouse(title: string, interior: "cream" | "brown", primaryHome: boolean) {
    uiEvents.emit("enterHouse", { title, interior, primaryHome });
  }

  /** ui/mall.ts opens the store directory (and Baba Shopping from there). */
  private enterMall(mallId: string) {
    uiEvents.emit("sceneReset");
    uiEvents.emit("enterMall", { mallId });
  }

  private goDistrict(to: string, from: Cardinal) {
    if (this.transitioning || controls.locked || this.now < this.arriveAt) return;
    if (!to || to === this.locationId) return;
    const dest = getLocation(to);
    if (!dest || dest.id === this.locationId) return;
    // Every location is ported; an id outside the set (new data) is simply not walkable yet.
    // TODO(3d): add new locations to PORTED_LOCATIONS once they have an art profile.
    if (!PORTED_LOCATIONS.has(dest.id)) return;
    this.transitioning = true;
    this.interaction.setSuspended(true);
    uiEvents.emit("prompt", null);
    this.hooks.requestTravel(dest.id, from);
  }

  private offerBouquet() {
    uiEvents.emit("minigame", {
      kind: "bouquet",
      title: "Bouquet",
      hint: "Pick three flowers and a ribbon.",
      skipLabel: "Later",
      onDone: (ok?: boolean) => {
        if (!ok) return;
        if (store.removeItem("flower", 3)) store.addItem("bouquet");
        quests.onMinigame("bouquet");
      },
    });
  }

  private maybeEncounter() {
    const e = pickEncounter(this.locationId);
    if (!e) return;
    applyEncounter(e);
    if (e.kind === "cat") {
      const p = this.hooks.playerPos();
      this.hooks.spawnCat(p.x + 1.25, p.z);
    }
    uiEvents.emit("dialogue", e.title, e.lines);
  }

  // -------------------------------------------------------------------------
  /** A dialogue/modal just closed: the press that closed it must not also interact. */
  private onUiClosed() {
    this.lastInteract = performance.now();
  }

  /** Entering / leaving a house interior (the exterior stays loaded underneath). */
  setIndoors(on: boolean) {
    this.indoors = on;
    this.interaction.setSuspended(on);
    if (!on) this.lastInteract = performance.now();
  }

  private tryInteract() {
    if (controls.locked || this.transitioning || this.indoors) return;
    const t = performance.now();
    if (t - this.lastInteract < 250) return;
    if (this.interaction.currentPrompt) {
      this.lastInteract = t;
      this.interaction.triggerCurrent();
    }
  }

  update(dtMs: number, nowMs: number) {
    this.now = nowMs;
    if (this.transitioning || this.indoors) return;
    const p = this.hooks.playerPos();
    // the companion's talk zone rides along with them
    const buddy = this.interaction.get(COMPANION_INTERACT);
    const bp = buddy ? this.hooks.companionPos() : null;
    if (buddy && bp) {
      buddy.x = bp.x;
      buddy.z = bp.z;
    }
    this.interaction.update(p.x, p.z);
    if (!controls.locked) {
      this.timeAcc += dtMs;
      if (this.timeAcc > TIME_TICK_MS) {
        this.timeAcc = 0;
        store.advanceTime();
      }
      this.checkMapEdge(p);
    }
  }

  private checkMapEdge(p: { x: number; z: number }) {
    if (this.now < this.arriveAt) return;
    const loc = this.def;
    const pad = 10 / TILE;
    const px = xzToPx(p.x, p.z);
    const worldW = this.world.w * TILE;
    const worldH = this.world.h * TILE;
    if (px.y < pad * TILE && loc.exits?.north) this.goDistrict(loc.exits.north, "south");
    else if (px.y > worldH - pad * TILE && loc.exits?.south) this.goDistrict(loc.exits.south, "north");
    else if (px.x < pad * TILE && loc.exits?.west) this.goDistrict(loc.exits.west, "east");
    else if (px.x > worldW - pad * TILE && loc.exits?.east) this.goDistrict(loc.exits.east, "west");
  }
}
