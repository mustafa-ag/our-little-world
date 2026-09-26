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
import { npcInLocation, npcWorldPos, linesFor, homeComment } from "../../game/systems/life";
import { tryDeliverMessages } from "../../game/systems/phone";
import { pickEncounter, applyEncounter } from "../../game/systems/encounters";
import type { WorldData, ZoneSpec } from "../../game/worldgen";
import { pxToXZ, pxToUnits, xzToPx } from "../world/coords";
import type { InteractionSystem } from "./interaction";

export type PickupKind = "flower_pink" | "flower_yellow" | "heart" | "coins" | "note" | "postcard" | "cat" | "star" | "card";

export interface WorldViewHooks {
  spawnNpc(def: NpcDef, x: number, z: number): void;
  npcFacePlayer(npcId: string): void;
  spawnPickup(id: string, kind: PickupKind, x: number, z: number): void;
  removePickup(id: string): void;
  spawnCat(x: number, z: number): void;
  spawnJeep(x: number, z: number): void;
  petalBurst(x: number, z: number): void;
  requestTravel(to: string, from: Cardinal): void;
  playerPos(): { x: number; z: number };
  setTimeout(ms: number, fn: () => void): void;
}

/** Locations that have a 3D scene. Others show a toast when you try to go there. */
export const PORTED_LOCATIONS = new Set(["edinburgh_oldtown", "edinburgh_dean", "edinburgh_uni"]);

export const TIME_TICK_MS = 90_000;

export class WorldController {
  private lastInteract = 0;
  private transitioning = false;
  private timeAcc = 0;
  private arriveAt = 0;
  private now = 0;
  private nearbyAcc = 0;
  // assigned in the constructor: a field initializer would run before the
  // parameter properties are set (useDefineForClassFields)
  private def: LocationDef;
  private benchmarkMode = false;

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
  setup(nowMs: number, opts: { travelled?: boolean; fresh?: boolean; benchmark?: boolean } = {}) {
    this.benchmarkMode = !!opts.benchmark;
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
    if (!this.benchmarkMode) {
      if (opts.travelled || opts.fresh || PORTED_LOCATIONS.has(store.state.currentLocation)) store.setLocation(def.id);
      store.unlockLocation(def.cityId);
      store.unlockLocation(def.id);
    }

    for (const z of this.world.zones) {
      if (z.action === "drive") continue;
      this.addZone(z);
    }
    this.buildCollectibles();
    this.buildNpcs();
    this.placeQuestObjects();
    this.placeSecrets();
    this.placeJeep();

    // "openMap" is handled by the UI layer (map panel); the world only emits it.
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("uiClosed", this.onUiClosed, this);

    if (!this.benchmarkMode) {
      quests.onVisit(def.id);
      quests.onVisit(def.cityId);
      tryDeliverMessages({ wake: store.state.messages.length === 0, limit: 1 });
    }
    uiEvents.emit("locationTitle", def.name, def.subtitle);
    if (!this.benchmarkMode && store.hasFlag("heist_victory_pending")) {
      store.setFlag("heist_victory_pending", false);
      this.hooks.setTimeout(350, () =>
        uiEvents.emit("dialogue", "Juju", ["THE GREAT FAMILY JEWEL HEIST · Complete", "Absolutely no crimes occurred."]),
      );
    }
    if (!this.benchmarkMode) this.hooks.setTimeout(700, () => {
      if (this.transitioning) return;
      this.maybeEncounter();
    });
  }

  dispose() {
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("uiClosed", this.onUiClosed, this);
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

  private buildNpcs() {
    const here = npcInLocation(this.locationId);
    const placed = new Set<string>();
    const place = (def: NpcDef, px: number, py: number) => {
      if (placed.has(def.id)) return;
      placed.add(def.id);
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
          const lines = linesFor(def.id, def.dialogue);
          const extra = store.getRelationship(def.id) >= 20 ? homeComment() : null;
          const res = quests.onTalk(def.id, extra ? [...lines, extra] : lines);
          uiEvents.emit("dialogue", def.name, res.lines, { npcId: def.id });
          if (res.acceptedQuest?.id === "q_family_jewel_heist") this.startPirateIdea();
        },
      });
    };
    for (const spot of this.world.npcSpots) {
      const def = here.find((n) => n.id === spot.id) ?? NPCS.find((n) => n.id === spot.id);
      if (!def || !here.some((n) => n.id === def.id)) continue;
      place(def, spot.x, spot.y);
    }
    for (const def of here) {
      if (placed.has(def.id)) continue;
      const p = npcWorldPos(def);
      place(def, p.x, p.y);
    }
    if (this.locationId === "edinburgh_oldtown" && quests.currentStep("q_family_jewel_heist")?.target === "sister_room") {
      const fadwa = NPCS.find((n) => n.id === "fadwa");
      if (fadwa && !placed.has(fadwa.id)) {
        const p = pxToXZ(52 * TILE + TILE / 2, 54 * TILE);
        this.hooks.spawnNpc(fadwa, p.x, p.z);
        this.interaction.add({
          id: "npc:fadwa:heist",
          x: p.x,
          z: p.z,
          radius: pxToUnits(28),
          prompt: "Talk to Fadwa (very normally)",
          kind: "npc",
          trigger: () => {
            quests.onInteract("sister_room");
            uiEvents.emit("sceneReset");
            // SisterHeistScene is not ported; the quest step still advances.
            if (!uiEvents.emit("enterScene", "SisterHeist")) store.toast("The heist scene isn't in 3D yet", "#ffe08a");
          },
        });
      }
    }
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

  private startPirateIdea() {
    controls.locked = true;
    this.hooks.setTimeout(260, () => uiEvents.emit("dialogue", "Juju", ["Operation: definitely mine now."]));
    this.hooks.setTimeout(740, () => {
      store.setFlag("pirate_disguise");
      quests.onInteract("pirate_idea");
      controls.locked = false;
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
        // DrivingScene / drive menu are not ported yet.
        if (!uiEvents.emit("driveMenu", { locationId: this.locationId })) store.toast("The Jeep isn't road-ready in 3D yet", "#2f6fd0");
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
        if (z.tag === "dubai_mall" || z.tag === "dubai_hills_mall") return this.enterMall(z.tag);
        if (z.tag === "hudayriyat_trucks") {
          quests.onInteract("cafe");
          quests.onInteract(z.tag);
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
        this.enterHouse(loc.homeName ?? "Home", "cream");
        return;
      case "stairs": {
        const d = (z.data as { name?: string; tag?: string }) ?? {};
        const brown = d.tag === "well_court";
        uiEvents.emit("minigame", {
          kind: "stairs",
          title: d.name ?? "Stairs",
          hint: brown ? "20 steps. 13 seconds. There is no skip button in this building." : "Climb quickly to the lobby.",
          taps: brown ? 20 : 10,
          onDone: () => {
            if (z.tag) quests.onInteract(z.tag);
            if (brown) store.unlockMemory("mem_well_court");
            this.enterHouse(d.name ?? "Inside", brown ? "brown" : "cream");
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

  private useOffice(tag?: string) {
    if (tag !== "adnoc_hq") return;
    const engineerStep = quests.currentStep("q_adnoc_engineer")?.target;
    if (engineerStep === "adnoc_lab") {
      uiEvents.emit("minigame", {
        kind: "lab",
        title: "ADNOC HQ · SAMPLE CHECK",
        hint: "Balance the tiny blue samples. Calm hands, clear notes, chemical-engineer energy.",
        taps: 12,
        skipLabel: "Submit notes",
        onDone: () => {
          quests.onInteract("adnoc_lab");
          store.advanceTime();
          uiEvents.emit("dialogue", "Alya", ["Clean results. Take these to the recruiter."]);
        },
      });
      return;
    }
    const ceoStep = quests.currentStep("q_adnoc_ceo")?.target;
    if (ceoStep === "adnoc_boardroom") {
      uiEvents.emit("minigame", {
        kind: "pitch",
        title: "BLUE BOARDROOM PITCH",
        hint: "Tap through the slides: safer systems, smarter labs, and a very compelling snack budget.",
        taps: 14,
        skipLabel: "Present",
        onDone: () => {
          quests.onInteract("adnoc_boardroom");
          uiEvents.emit("dialogue", "Boardroom", ["The board has never seen a slide about snacks this persuasive."]);
        },
      });
      return;
    }
    if (ceoStep === "adnoc_rooftop") {
      const done = quests.onInteract("adnoc_rooftop");
      uiEvents.emit("dialogue", "ADNOC HQ rooftop", ["The city looks very blue from up here.", done?.complete ?? "One more big step."]);
      return;
    }
    const title = store.state.career === "ceo" ? "CEO Juju" : store.state.career === "chemical_engineer" ? "Chemical Engineer Juju" : "Future Chemical Engineer Juju";
    uiEvents.emit("dialogue", "ADNOC HQ", [`${title}. The petrol station is for refuelling; this is where the big ideas happen.`]);
  }

  /** HouseScene isn't ported: hand it to the UI layer, or toast. */
  private enterHouse(title: string, interior: "cream" | "brown") {
    if (!uiEvents.emit("enterHouse", { title, interior })) store.toast(`${title} — interiors aren't in 3D yet`, "#f4a6c0");
  }

  private enterMall(mallId: string) {
    uiEvents.emit("sceneReset");
    if (!uiEvents.emit("enterMall", { mallId })) store.toast("The mall isn't in 3D yet", "#f4a6c0");
  }

  private goDistrict(to: string, from: Cardinal) {
    if (this.transitioning || controls.locked || this.now < this.arriveAt) return;
    if (!to || to === this.locationId) return;
    const dest = getLocation(to);
    if (!dest || dest.id === this.locationId) return;
    if (!PORTED_LOCATIONS.has(dest.id)) {
      if (!store.hasDaily(`notyet_${dest.id}`)) {
        store.setDaily(`notyet_${dest.id}`);
        store.toast(`${dest.name} isn't built in 3D yet`, "#8ecae6");
      }
      return;
    }
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

  private tryInteract() {
    if (controls.locked || this.transitioning) return;
    const t = performance.now();
    if (t - this.lastInteract < 250) return;
    if (this.interaction.currentPrompt) {
      this.lastInteract = t;
      this.interaction.triggerCurrent();
    }
  }

  update(dtMs: number, nowMs: number) {
    this.now = nowMs;
    if (this.transitioning) return;
    if (!controls.locked) {
      if (!this.benchmarkMode) this.timeAcc += dtMs;
      if (this.timeAcc > TIME_TICK_MS) {
        this.timeAcc = 0;
        store.advanceTime();
      }
    }
    this.nearbyAcc += dtMs;
    if (this.nearbyAcc < 100) return;
    this.nearbyAcc %= 100;
    const p = this.hooks.playerPos();
    this.interaction.update(p.x, p.z);
    if (!controls.locked) this.checkMapEdge(p);
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
