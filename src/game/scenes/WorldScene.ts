import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { districtsOf, getLocation, type Cardinal } from "../data/locations";
import { NPCS } from "../data/npcs";
import { Player } from "../objects/Player";
import { PetCompanion } from "../objects/PetCompanion";
import { NPC } from "../objects/NPC";
import { generateWorld, blockedToRects, type WorldData } from "../worldgen";
import { store } from "../systems/store";
import { controls, uiEvents, minimap } from "../systems/controls";
import * as quests from "../systems/quests";
import { fillCityMinimap } from "../systems/minimapAtlas";
import { npcInLocation, npcWorldPos, linesFor, worldTint, skyHex, homeComment, npcActivity, npcApproachEmote } from "../systems/life";
import { tryDeliverMessages } from "../systems/phone";
import { secretsFor } from "../data/secrets";
import { photoSpotsFor } from "../data/photos";
import { capturePhoto, photoSpotReady } from "../systems/photos";
import { companionComment, canCompanionTravel } from "../systems/companions";
import { outfitReaction } from "../systems/outfitReactions";
import { reunionBounce, worldEmote, worldSparkles } from "../systems/questJuice";
import { beginWorldEvent, finishWorldEvent, pickWorldEvent, stableDailyRoll, touristChoices } from "../systems/worldEvents";
import type { WorldEventDefinition } from "../data/worldEvents";
import { recordCityVisit } from "../systems/lifeProgress";
import { buildHdGround, createVisualShadow, getVisualAssetDef, getVisualTexture, getWorldVisualTheme, type HdGroundLayer, type VisualShadowHandle, type WorldVisualTheme } from "../visual";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  tag?: string;
  npc?: NPC;
  prompt: string;
  trigger: () => void;
}

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private npcs: NPC[] = [];
  private interactables: Interactable[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInteract = 0;
  private currentPrompt: Interactable | null = null;
  private locationId = "abudhabi_yas";
  private driving = false;
  private baseSpeed = 90;
  private rideJeep?: Phaser.GameObjects.Image;
  private parkedJeep?: Phaser.GameObjects.Image;
  private rideJeepShadow?: VisualShadowHandle;
  private parkedJeepShadow?: VisualShadowHandle;
  private transitioning = false;
  private driveMenu?: Phaser.GameObjects.Container;
  private worldW = 0;
  private worldH = 0;
  private timeAcc = 0;
  private followingCat?: Phaser.GameObjects.Image;
  private tigorPet?: PetCompanion;
  private tigorInteractable?: Interactable;
  private timeWash?: Phaser.GameObjects.Rectangle;
  private themeWash?: Phaser.GameObjects.Rectangle;
  private visualTheme!: WorldVisualTheme;
  private groundLayer?: HdGroundLayer;
  private jeepSpot: Interactable | null = null;
  private jeepReadyAt = 0;
  private arriveAt = 0;
  private focusedQuestId?: string;
  private questArrow?: Phaser.GameObjects.Text;
  private questArrowLabel?: Phaser.GameObjects.Text;
  private companionNpc?: NPC;
  private companionInteractable?: Interactable;
  private ideaDialogueHandler?: () => void;
  private transformDialogueHandler?: () => void;
  private storyDialogueHandler?: () => void;
  private approachReacted = new Set<string>();
  private ambientObjects: Phaser.GameObjects.GameObject[] = [];
  private ambientInteractables: Interactable[] = [];
  private movingAmbient: { object: Phaser.GameObjects.Container | Phaser.GameObjects.Text | Phaser.GameObjects.Image; interactable: Interactable }[] = [];
  private activeWorldEvent?: WorldEventDefinition;
  private cameraOverlay?: Phaser.GameObjects.Container;
  private cameraOffset = new Phaser.Math.Vector2();
  private cameraPose: "smile" | "peace" | "silly" | "hug" = "smile";
  private lastCameraCapture = 0;
  private jeepCallReadyAt = 0;

  constructor() {
    super(SceneKeys.World);
  }

  create(data: { locationId?: string; spawn?: { x: number; y: number }; from?: Cardinal; driving?: boolean } = {}) {
    this.interactables = [];
    this.npcs = [];
    this.currentPrompt = null;
    this.transitioning = false;
    this.driving = false;
    this.rideJeep = undefined;
    this.parkedJeep = undefined;
    this.rideJeepShadow = undefined;
    this.parkedJeepShadow = undefined;
    this.jeepSpot = null;
    this.driveMenu = undefined;
    this.timeWash = undefined;
    this.themeWash = undefined;
    this.groundLayer = undefined;
    this.followingCat = undefined;
    this.tigorPet = undefined;
    this.tigorInteractable = undefined;
    this.focusedQuestId = undefined;
    this.questArrow = undefined;
    this.questArrowLabel = undefined;
    this.companionNpc = undefined;
    this.companionInteractable = undefined;
    this.approachReacted.clear();
    this.ambientObjects = [];
    this.ambientInteractables = [];
    this.movingAmbient = [];
    this.activeWorldEvent = undefined;
    this.cameraOverlay = undefined;
    this.cameraOffset.set(0, 0);
    controls.cameraMode = false;
    this.arriveAt = this.time.now + 600;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("prompt", null);
    try {
      uiEvents.emit("sceneReset");
    } catch {
      /* overlay teardown must not block a new map */
    }

    this.locationId = data.locationId ?? store.state.currentLocation ?? "abudhabi_yas";
    const def = getLocation(this.locationId);
    this.visualTheme = getWorldVisualTheme(def);
    store.setLocation(def.id);
    store.unlockLocation(def.cityId);
    store.unlockLocation(def.id);
    recordCityVisit(def.cityId);

    const world = generateWorld(this, def);
    this.worldW = world.w * TILE;
    this.worldH = world.h * TILE;

    this.cameras.main.setBackgroundColor(skyHex());
    this.cameras.main.setRoundPixels(true);
    this.applyVisualTheme();
    this.applyAtmosphere();
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.drawGround(world);
    this.buildCollision(world);
    this.buildProps(world);
    this.buildLabels(world);
    this.buildCollectibles(world);
    this.buildNpcs(world);
    this.placeQuestObjects();

    let spawn = data.spawn ?? world.spawn;
    if (data.from && def.city?.entry?.[data.from]) {
      const e = def.city.entry[data.from]!;
      let sx = e.tx * TILE + TILE / 2;
      let sy = (e.ty + 1) * TILE;
      const inset = TILE * 3;
      if (data.from === "north") sy = Math.max(sy, inset);
      if (data.from === "south") sy = Math.min(sy, this.worldH - inset);
      if (data.from === "west") sx = Math.max(sx, inset);
      if (data.from === "east") sx = Math.min(sx, this.worldW - inset);
      spawn = { x: sx, y: sy };
    }
    this.player = new Player(this, spawn.x, spawn.y, getVisualTexture(this, "char_her"), this.visualTheme.lighting);
    this.player.setDepth(spawn.y);
    const arrivalScale = this.player.scaleX;
    this.player.setAlpha(0).setScale(arrivalScale * 0.78);
    this.tweens.add({ targets: this.player, alpha: 1, scaleX: arrivalScale, scaleY: arrivalScale, y: spawn.y - 3, duration: 360, ease: "Back.out", onComplete: () => this.player.setY(spawn.y) });
    this.baseSpeed = this.player.speed;
    this.spawnActiveCompanion(spawn.x, spawn.y);

    this.physics.add.collider(this.player, this.solids);

    for (const z of world.zones) {
      if (z.action === "drive") continue;
      this.addZoneInteractable(z);
    }
    this.placeFollowJeep(spawn.x, spawn.y, data.driving ?? store.state.inJeep);
    this.spawnTigorPet(spawn.x, spawn.y);
    this.placeSecrets();
    this.placePhotoSpots();
    this.addCityAmbience(def.cityId);

    this.setupMinimap(def);

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys("W,A,S,D,SPACE,E,ESC") as Record<string, Phaser.Input.Keyboard.Key>;
    }
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.openMap, this);
    uiEvents.on("questFocus", this.focusQuest, this);
    uiEvents.on("companionChanged", this.refreshCompanion, this);
    uiEvents.on("cameraStart", this.startCamera, this);
    uiEvents.on("cameraExit", this.exitCamera, this);
    uiEvents.on("callJeep", this.callJeep, this);
    store.on("questUpdated", this.refreshQuestGuide, this);
    store.on("petChanged", this.refreshTigorPet, this);

    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);

    quests.onVisit(def.id);
    quests.onVisit(def.cityId);
    this.refreshQuestGuide();
    tryDeliverMessages({ wake: store.state.messages.length === 0, limit: 1 });
    uiEvents.emit("locationTitle", def.name, def.subtitle);
    const heistResume = quests.currentStep("q_family_jewel_heist")?.target;
    if (heistResume === "pirate_idea" && !store.hasFlag("pirate_disguise")) {
      this.time.delayedCall(850, () => {
        if (!this.sys.isActive() || controls.locked) return;
        this.startPirateIdea();
        uiEvents.emit("dialogue", "Juju", ["Mama specifically said not to get ideas.", "Unfortunately, I remembered my idea."]);
      });
    } else if (store.hasFlag("pirate_disguise") && (heistResume === "pirate_voyage" || heistResume === "great_white_boss")) {
      this.time.delayedCall(650, () => {
        if (!this.sys.isActive() || this.transitioning) return;
        uiEvents.emit("sceneReset");
        this.scene.start(SceneKeys.PirateVoyage);
      });
    }
    this.time.delayedCall(900, () => {
      if (!this.sys.isActive() || this.transitioning) return;
      this.maybeStartWorldEvent();
    });
    this.time.delayedCall(1250, () => this.maybeCompanionComment());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private solids!: Phaser.Physics.Arcade.StaticGroup;

  private drawGround(world: WorldData) {
    this.groundLayer = buildHdGround(this, world, this.visualTheme);
  }

  private buildCollision(world: WorldData) {
    this.solids = this.physics.add.staticGroup();
    const rects = blockedToRects(world.blocked);
    for (const r of rects) {
      const go = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0xff0000, 0);
      this.physics.add.existing(go, true);
      this.solids.add(go);
    }
  }

  private buildProps(world: WorldData) {
    for (const p of world.props) {
      const key = getVisualTexture(this, p.tex);
      if (!this.textures.exists(key)) continue;
      const img = this.add.image(p.x, p.y, key);
      img.setOrigin(p.originX ?? 0.5, p.originY ?? 1);
      img.setDepth(p.y);
      const shadow = createVisualShadow(this, p.x, p.y, getVisualAssetDef(p.tex)?.shadow, this.visualTheme.lighting);
      img.once("destroy", () => shadow?.destroy());
    }
  }

  private buildLabels(world: WorldData) {
    for (const l of world.labels) {
      this.add
        .text(l.x, l.y, l.text, {
          fontFamily: "monospace",
          fontSize: l.big ? "13px" : "9px",
          color: l.big ? "#fff2cf" : "#fff",
          backgroundColor: l.big ? "rgba(58,43,58,0.55)" : "rgba(58,43,58,0.72)",
          padding: { x: l.big ? 6 : 3, y: l.big ? 3 : 1 },
          stroke: "#3a2b3a",
          strokeThickness: l.big ? 3 : 0,
          resolution: 3,
        })
        .setOrigin(0.5, l.big ? 0.5 : 1)
        .setDepth(l.big ? 55000 : 60000)
        .setAlpha(l.big ? 0.9 : 1);
    }
  }

  private buildCollectibles(world: WorldData) {
    for (const c of world.collectibles) {
      if (store.state.collected[c.id]) continue;
      const img = this.add.image(c.x, c.y, getVisualTexture(this, c.tex)).setOrigin(0.5, 0.9).setDepth(c.y);
      this.tweens.add({ targets: img, y: c.y - 2, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const it: Interactable = {
        x: c.x,
        y: c.y,
        radius: 16,
        tag: c.tag,
        prompt: "Pick this flower",
        trigger: () => {
          if (!store.collect(c.id)) return;
          img.destroy();
          this.interactables = this.interactables.filter((i) => i !== it);
          if (this.currentPrompt === it) this.currentPrompt = null;
          store.addCoins(1);
          store.addItem("flower");
          this.petalBurst(c.x, c.y);
          if (c.id.endsWith("1") || Phaser.Math.Between(0, 4) === 0) {
            const butterfly = this.add.text(c.x, c.y - 8, "ʚɞ", { fontFamily: "monospace", fontSize: "12px", color: "#f4c95d", stroke: "#3a2b3a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(c.y + 12);
            this.tweens.add({ targets: butterfly, x: butterfly.x + 42, y: butterfly.y - 38, angle: 18, alpha: 0, duration: 1300, ease: "Sine.inOut", onComplete: () => butterfly.destroy() });
            worldEmote(this, this.player.x, this.player.y - 28, "oh!", "#fff4e6");
          }
          quests.onCollect(c.tag);
          if (store.getItemQuantity("flower") >= 3 && !store.hasDaily("bouquet_offer")) {
            store.setDaily("bouquet_offer");
            this.offerBouquet();
          }
        },
      };
      this.interactables.push(it);
    }
  }

  private buildNpcs(world: WorldData) {
    const here = npcInLocation(this.locationId);
    const placed = new Set<string>();
    const place = (def: (typeof NPCS)[number], x: number, y: number) => {
      if (def.id === store.state.activeCompanionId) return;
      if (placed.has(def.id)) return;
      placed.add(def.id);
      const npc = new NPC(this, def, this.visualTheme.lighting);
      npc.place(x, y);
      const routine = npcActivity(def.id);
      npc.startRoutine(routine.activity, routine.roamRadius);
      this.npcs.push(npc);
      this.interactables.push({
        x,
        y,
        radius: 26,
        tag: def.id,
        npc,
        prompt: `Talk to ${def.name}`,
        trigger: () => {
          npc.faceTowards(this.player.x, this.player.y);
          store.state.lastPassenger = def.id;
          store.save();
          if (def.id === "jad" || def.id === "shan") {
            this.openSiblingShowdown(def, npc);
            return;
          }
          if (def.id === "nour" && ["nour", "nour_snacks"].includes(quests.currentStep("q_nour")?.target ?? "")) {
            uiEvents.emit("sceneReset");
            this.scene.start(SceneKeys.QuestActivity, { activity: "nour_visit", returnLocation: this.locationId });
            return;
          }
          if (def.id === "chloe" && ["chloe", "chloe_thesis"].includes(quests.currentStep("q_chloe")?.target ?? "")) {
            uiEvents.emit("sceneReset");
            this.scene.start(SceneKeys.QuestActivity, { activity: "chloe_thesis", returnLocation: this.locationId });
            return;
          }
          if (def.id === "rhiannon" && quests.currentStep("q_edinburgh")?.target === "rhiannon") {
            this.playEdiReunion(def, npc);
            return;
          }
          if (def.id === "fadwa" && quests.currentStep("q_london")?.target === "fadwa") {
            if (!["london_clue_scarf", "london_clue_tea", "london_clue_heart"].every((flag) => store.hasFlag(flag))) {
              worldEmote(this, npc.x, npc.y - 28, "?");
              uiEvents.emit("dialogue", "Fadwa", ["You found me too early! Follow the three pink sister clues around the West End first."]);
              return;
            }
            this.playFamilyHandoff(def, npc, "fadwa");
            return;
          }
          if (def.id === "mama" && quests.currentStep("q_flowers")?.target === "bouquet") {
            this.offerBouquet();
            return;
          }
          if (def.id === "mama" && quests.currentStep("q_flowers")?.target === "mama") {
            this.playFamilyHandoff(def, npc, "mama");
            return;
          }
          if (def.id === "moomoo" && quests.currentStep("q_date")?.target === "moomoo") {
            this.playFamilyHandoff(def, npc, "coffee_pair");
            return;
          }
          if (def.id === "moomoo" && quests.currentStep("q_coffee_run")?.target === "moomoo:coffee" && store.getItemQuantity("coffee") > 0) {
            store.removeItem("coffee");
            const done = quests.onGive("moomoo", "coffee");
            this.animateGift(this.player.x, this.player.y - 12, npc.x, npc.y - 12, "☕");
            worldEmote(this, npc.x, npc.y - 30, "♥", "#ffdbe7");
            uiEvents.emit("dialogue", "Moomoo", ["Warm. Two sugars. Exactly my order.", "You remembered without asking. Come sit—everything else can wait.", done?.complete ?? "Perfect."]);
            return;
          }
          if (def.id === "moomoo" && this.startRomanceActivityIfReady()) return;
          const lines = linesFor(def.id, def.dialogue);
          const extra = store.getRelationship(def.id) >= 20 ? homeComment() : null;
          const styleNote = outfitReaction(def.id);
          const res = quests.onTalk(def.id, [...lines, ...(styleNote ? [styleNote] : []), ...(extra ? [extra] : [])]);
          const startsHeist = res.acceptedQuest?.id === "q_family_jewel_heist";
          uiEvents.emit("dialogue", def.name, res.lines, startsHeist ? undefined : { npcId: def.id });
          if (startsHeist) this.startPirateIdea();
          if (res.acceptedQuest?.id === "q_baba_card") this.spawnBabaCard(npc.x, npc.y);
        },
      });
    };
    for (const spot of world.npcSpots) {
      const def = here.find((n) => n.id === spot.id) ?? NPCS.find((n) => n.id === spot.id);
      if (!def || !here.some((n) => n.id === def.id)) continue;
      place(def, spot.x, spot.y);
    }
    for (const def of here) {
      if (placed.has(def.id)) continue;
      const p = npcWorldPos(def);
      place(def, p.x, p.y);
    }
  }

  private placeQuestObjects() {
    if (this.locationId === "abudhabi_yas" && quests.currentStep("q_baba_card")?.target === "take_baba_card") {
      const baba = NPCS.find((npc) => npc.id === "baba");
      if (baba) { const pos = npcWorldPos(baba); this.spawnBabaCard(pos.x, pos.y); }
    }

    if (this.locationId === "london_westend" && quests.currentStep("q_london")?.target === "fadwa") {
      const fadwa = NPCS.find((npc) => npc.id === "fadwa");
      const target = fadwa ? npcWorldPos(fadwa) : { x: this.worldW * 0.55, y: this.worldH * 0.45 };
      const clues = [
        { flag: "london_clue_scarf", x: target.x - 155, y: target.y + 100, icon: "~", name: "Fadwa's dramatic scarf clue" },
        { flag: "london_clue_tea", x: target.x + 120, y: target.y + 80, icon: "☕", name: "A suspicious sister tea clue" },
        { flag: "london_clue_heart", x: target.x - 70, y: target.y - 105, icon: "♥", name: "The final sister clue" },
      ];
      for (const clue of clues) {
        if (store.hasFlag(clue.flag)) continue;
        const marker = this.add.text(clue.x, clue.y, clue.icon, { fontFamily: "monospace", fontSize: "19px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 6, y: 4 }, resolution: 2 }).setOrigin(0.5).setDepth(clue.y + 5);
        this.tweens.add({ targets: marker, y: clue.y - 6, duration: 620, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        const it: Interactable = { x: clue.x, y: clue.y, radius: 25, tag: clue.flag, prompt: `Inspect ${clue.name}`, trigger: () => {
          store.setFlag(clue.flag);
          marker.destroy();
          this.interactables = this.interactables.filter((candidate) => candidate !== it);
          worldSparkles(this, clue.x, clue.y, "♥");
          store.toast(`${clue.name} ✓`, "#ff8fae");
        } };
        this.interactables.push(it);
      }
    }

    const heistTarget = quests.currentStep("q_family_jewel_heist")?.target;
    if (this.locationId === "london_westend" && ["house_lock", "enter_fadwa_house", "reach_fadwa_room", "drawer_lock", "family_safe", "escape_fadwa_house"].includes(heistTarget ?? "")) {
      const x = this.worldW * 0.56;
      const y = Math.min(this.worldH - 80, this.worldH * 0.48);
      const sign = this.add.text(x, y - 28, "FADWA'S HOUSE\nEXTREMELY NORMAL ENTRANCE", {
        fontFamily: "monospace",
        fontSize: "9px",
        align: "center",
        color: "#fff4e6",
        backgroundColor: "#3a2b3a",
        padding: { x: 5, y: 3 },
        resolution: 2,
      }).setOrigin(0.5).setDepth(y + 4);
      this.tweens.add({ targets: sign, y: sign.y - 3, duration: 720, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.interactables.push({
        x,
        y,
        radius: 34,
        prompt: "Approach Fadwa's house",
        trigger: () => {
          uiEvents.emit("sceneReset");
          this.scene.start(SceneKeys.SisterHeist);
        },
      });
    }
  }

  private spawnBabaCard(x: number, y: number) {
    if (this.interactables.some((it) => it.tag === "take_baba_card")) return;
    const card = this.add.image(x + 7, y - 8, "i_baba_card").setDepth(y + 3);
    this.tweens.add({ targets: card, y: card.y - 4, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const cardIt: Interactable = {
      x,
      y,
      radius: 22,
      tag: "take_baba_card",
      prompt: "Ask Baba for the card",
      trigger: () => {
        this.interactables = this.interactables.filter((it) => it !== cardIt);
        controls.locked = true;
        worldEmote(this, x, y - 34, "!!!", "#ffe08a");
        this.cameras.main.shake(80, 0.003);
        this.tweens.add({ targets: card, x: this.player.x, y: this.player.y - 12, angle: 360, scale: 1.35, duration: 650, ease: "Back.inOut", onComplete: () => {
          card.destroy();
          store.addItem("baba_card");
          quests.onInteract("take_baba_card");
          worldSparkles(this, this.player.x, this.player.y - 14);
          controls.locked = false;
          uiEvents.emit("dialogue", "Baba", ["One sensible thing. One.", "Juju acquired BABA'S CARD.", "Baba's stress level: already detectable from space."]);
        } });
      },
    };
    this.interactables.push(cardIt);
  }

  private startPirateIdea() {
    const begin = () => {
      this.ideaDialogueHandler = undefined;
      if (!this.sys.isActive()) return;
      controls.locked = true;
      const shout = this.add.text(this.player.x, this.player.y - 38, "FADWAAAA.", { fontFamily: "monospace", fontSize: "16px", color: "#d84652", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setDepth(this.player.y + 12);
      this.player.setTint(0xff8b82);
      this.tweens.add({ targets: this.player, x: this.player.x + 44, angle: { from: -2, to: 2 }, duration: 170, yoyo: true, repeat: 4, ease: "Quad.inOut" });
      this.cameras.main.shake(130, 0.004);
      for (let i = 0; i < 7; i++) {
        const puff = this.add.circle(this.player.x + (i % 2 ? 12 : -12), this.player.y - 25, 3 + (i % 3), 0xffffff, 0.82).setDepth(this.player.y + 11);
        this.tweens.add({ targets: puff, x: puff.x + (i % 2 ? 14 : -14), y: puff.y - 22 - i * 2, scale: 1.8, alpha: 0, delay: i * 120, duration: 760, onComplete: () => puff.destroy() });
      }
      this.tweens.add({ targets: shout, y: shout.y - 18, alpha: 0, delay: 620, duration: 650, onComplete: () => shout.destroy() });
      this.time.delayedCall(1450, () => {
        this.player.clearTint().setAngle(0);
        const mark = this.add.text(this.player.x, this.player.y - 42, "!", { fontFamily: "monospace", fontSize: "42px", color: "#f4c95d", stroke: "#3a2b3a", strokeThickness: 6, resolution: 2 }).setOrigin(0.5).setDepth(this.player.y + 14).setScale(0.2);
        this.tweens.add({ targets: mark, scale: 1.35, y: mark.y - 8, duration: 420, ease: "Back.out", yoyo: true, hold: 450, onComplete: () => mark.destroy() });
        this.tweens.add({ targets: this.player, y: this.player.y - 10, scaleX: 1.35, scaleY: 1.35, duration: 180, yoyo: true, ease: "Back.out" });
        for (let i = 0; i < 9; i++) this.ideaSparkle(this.player.x, this.player.y - 20, i * 42);
        const transform = () => {
          this.transformDialogueHandler = undefined;
          this.transformPirate();
        };
        this.transformDialogueHandler = transform;
        uiEvents.once("dialogueClosed", transform);
        uiEvents.emit("dialogue", "Juju", ["Wait.", "I have a completely reasonable idea."]);
      });
    };
    this.ideaDialogueHandler = begin;
    uiEvents.once("dialogueClosed", begin);
  }

  private playFamilyHandoff(def: (typeof NPCS)[number], npc: NPC, kind: "fadwa" | "mama" | "coffee_pair") {
    const lines = linesFor(def.id, def.dialogue);
    const res = quests.onTalk(def.id, lines);
    if (kind === "fadwa") {
      store.unlockCompanion("fadwa");
      store.setActiveCompanion("fadwa");
      reunionBounce(this, this.player, npc.sprite);
      worldEmote(this, npc.x, npc.y - 33, "JUJU!", "#ffdbe7");
      uiEvents.emit("dialogue", def.name, ["There she is. Fadwa runs in before either sister remembers to act normal.", "Hug. Spin. Almost fall over. Recover with dignity.", ...res.lines], { npcId: def.id });
      return;
    }
    if (kind === "mama") {
      this.animateGift(this.player.x, this.player.y - 13, npc.x, npc.y - 14, "✿");
      reunionBounce(this, this.player, npc.sprite);
      worldEmote(this, npc.x, npc.y - 34, "♥", "#ffdbe7");
      uiEvents.emit("dialogue", def.name, ["Mama holds the bouquet up to the light. One petal lands on her nose.", "Big hug. Bouquet still visible, because she is not putting it down.", ...res.lines], { npcId: def.id });
      return;
    }
    this.animateGift(this.player.x - 5, this.player.y - 14, npc.x - 5, npc.y - 14, "☕");
    this.animateGift(this.player.x + 6, this.player.y - 14, npc.x + 6, npc.y - 14, "☕", 130);
    worldEmote(this, npc.x, npc.y - 34, "♥", "#ffdbe7");
    this.tweens.add({ targets: npc.sprite, scaleX: 1.35, scaleY: 1.35, duration: 180, yoyo: true, repeat: 1, ease: "Back.out" });
    uiEvents.emit("dialogue", def.name, ["Two coffees arrive safely. This is frankly the most impressive part.", "Moomoo takes both, then gives one straight back.", ...res.lines], { npcId: def.id });
  }

  private animateGift(fromX: number, fromY: number, toX: number, toY: number, symbol: string, delay = 0) {
    const gift = this.add.text(fromX, fromY, symbol, { fontFamily: "monospace", fontSize: "18px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setDepth(Math.max(fromY, toY) + 80).setScale(0.7);
    this.tweens.add({ targets: gift, x: toX, y: toY - 8, scale: 1.15, angle: 8, delay, duration: 650, ease: "Sine.inOut", onComplete: () => {
      worldSparkles(this, toX, toY - 10, symbol === "✿" ? "✿" : "♥");
      this.tweens.add({ targets: gift, alpha: 0, y: gift.y - 8, duration: 300, onComplete: () => gift.destroy() });
    } });
  }

  private playEdiReunion(def: (typeof NPCS)[number], npc: NPC) {
    const res = quests.onTalk(def.id, linesFor(def.id, def.dialogue));
    reunionBounce(this, this.player, npc.sprite);
    const umbrella = this.add.text((this.player.x + npc.x) / 2, Math.min(this.player.y, npc.y) - 40, "☂", { fontFamily: "monospace", fontSize: "34px", color: "#e46d94", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setDepth(Math.max(this.player.y, npc.y) + 80).setAngle(-8);
    this.tweens.add({ targets: umbrella, angle: 8, duration: 320, yoyo: true, repeat: 3, ease: "Sine.inOut", onComplete: () => this.tweens.add({ targets: umbrella, alpha: 0, y: umbrella.y - 12, duration: 450, onComplete: () => umbrella.destroy() }) });
    for (let i = 0; i < 15; i += 1) {
      const rain = this.add.text(this.player.x + Phaser.Math.Between(-70, 70), this.player.y - Phaser.Math.Between(45, 100), "|", { fontFamily: "monospace", fontSize: "10px", color: "#bfe6ff", resolution: 2 }).setDepth(this.player.y + 70);
      this.tweens.add({ targets: rain, x: rain.x - 12, y: rain.y + 80, alpha: 0, delay: i * 35, duration: 600, onComplete: () => rain.destroy() });
    }
    worldEmote(this, npc.x, npc.y - 34, "JUJU!", "#dff3ff");
    uiEvents.emit("dialogue", def.name, ["Rhiannon spots Juju. The reunion hug begins before the rain can finish arriving.", "One umbrella opens backwards. Nobody acknowledges it.", ...res.lines], { npcId: def.id });
  }

  private ideaSparkle(x: number, y: number, delay: number) {
    const star = this.add.image(x, y, "ui_star").setScale(0.3).setDepth(y + 30).setAlpha(0);
    const angle = (delay / 42) * (Math.PI * 2 / 9);
    this.tweens.add({ targets: star, x: x + Math.cos(angle) * 32, y: y + Math.sin(angle) * 22, alpha: 1, scale: 0.7, delay, duration: 260, yoyo: true, onComplete: () => star.destroy() });
  }

  private transformPirate() {
    if (!this.sys.isActive()) return;
    controls.locked = true;
    const { width, height } = this.scale.gameSize;
    for (let i = 0; i < 12; i++) {
      const smoke = this.add.circle(this.player.x + Phaser.Math.Between(-15, 15), this.player.y + Phaser.Math.Between(-10, 8), Phaser.Math.Between(4, 8), 0xffffff, 0.8).setDepth(this.player.y + 20);
      this.tweens.add({ targets: smoke, x: smoke.x + Phaser.Math.Between(-28, 28), y: smoke.y - Phaser.Math.Between(15, 38), alpha: 0, scale: 1.8, delay: i * 55, duration: 620, onComplete: () => smoke.destroy() });
    }
    this.tweens.add({ targets: this.player, angle: 360, y: this.player.y - 16, duration: 520, yoyo: true, ease: "Cubic.inOut", onComplete: () => this.player.setAngle(0) });
    this.time.delayedCall(300, () => {
      store.setInJeep(false);
      store.setFlag("pirate_disguise");
    });
    this.time.delayedCall(620, () => {
      quests.onInteract("pirate_idea");
      const card = this.add.container(width / 2, height * 0.34).setScrollFactor(0).setDepth(800).setScale(0.4).setAlpha(0);
      const title = this.add.text(0, 0, "PIRATE JUJU", { fontFamily: "monospace", fontSize: "31px", color: "#f4c95d", stroke: "#3a2b3a", strokeThickness: 7, resolution: 2 }).setOrigin(0.5);
      const sub = this.add.text(0, 38, "Master of Extremely Legal\nFamily Retrieval", { fontFamily: "monospace", fontSize: "13px", color: "#fff4e6", align: "center", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 }).setOrigin(0.5);
      card.add([title, sub]);
      this.tweens.add({ targets: card, alpha: 1, scale: 1, duration: 440, ease: "Back.out", hold: 1250, yoyo: true, onComplete: () => card.destroy() });
    });
    this.time.delayedCall(2550, () => {
      if (!this.sys.isActive() || quests.currentStep("q_family_jewel_heist")?.target !== "pirate_voyage") return;
      uiEvents.emit("sceneReset");
      this.scene.start(SceneKeys.PirateVoyage);
    });
  }

  private spawnActiveCompanion(x: number, y: number) {
    const companionId = store.state.activeCompanionId;
    if (!companionId || !canCompanionTravel(companionId)) return;
    const def = NPCS.find((candidate) => candidate.id === companionId);
    if (!def) return;
    const companion = new NPC(this, def, this.visualTheme.lighting);
    companion.place(x - 22, y + 8);
    this.companionNpc = companion;
    const companionInteractable: Interactable = {
      x: companion.x,
      y: companion.y,
      radius: 26,
      tag: def.id,
      npc: companion,
      prompt: `Talk to ${def.name}`,
      trigger: () => {
        companion.faceTowards(this.player.x, this.player.y);
        if (def.id === "moomoo" && this.startRomanceActivityIfReady()) return;
        const res = quests.onTalk(def.id, linesFor(def.id, def.dialogue));
        worldEmote(this, companion.x, companion.y - 30, res.completedQuest ? "♥" : "☺", "#ffdbe7");
        uiEvents.emit("dialogue", def.name, res.lines, { npcId: def.id });
      },
    };
    this.companionInteractable = companionInteractable;
    this.interactables.push(companionInteractable);
  }

  private startRomanceActivityIfReady() {
    const activities = ["romance_us", "romance_future", "romance_proposal", "wedding_planning_one", "wedding_planning_two", "desert_wedding"];
    const active = quests.activeQuests().find((quest) => quest.step.type === "playMinigame" && activities.includes(quest.step.target));
    if (!active) return false;
    controls.locked = true;
    uiEvents.emit("sceneReset");
    if (active.step.target === "desert_wedding") this.scene.start(SceneKeys.Wedding);
    else this.scene.start(SceneKeys.Romance, { activity: active.step.target });
    return true;
  }

  private refreshCompanion() {
    if (this.companionInteractable) this.interactables = this.interactables.filter((it) => it !== this.companionInteractable);
    this.companionNpc?.destroy();
    this.companionNpc = undefined;
    this.companionInteractable = undefined;
    if (this.player) this.spawnActiveCompanion(this.player.x, this.player.y);
  }

  private maybeCompanionComment() {
    const companionId = store.state.activeCompanionId;
    if (!companionId || !this.companionNpc || !canCompanionTravel(companionId)) return;
    const def = NPCS.find((candidate) => candidate.id === companionId);
    if (!def) return;
    const line = companionComment(companionId, this.locationId);
    if (line) uiEvents.emit("dialogue", def.name, [line]);
  }

  private placePhotoSpots() {
    for (const spot of photoSpotsFor(this.locationId)) {
      if (!photoSpotReady(spot)) continue;
      const x = spot.tx * TILE + TILE / 2;
      const y = spot.ty * TILE + TILE;
      const marker = this.add.text(x, y - 20, "CAM", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#fff5d6",
        backgroundColor: "#5f4267",
        padding: { x: 3, y: 2 },
        resolution: 2,
      }).setOrigin(0.5).setDepth(y + 1);
      const it: Interactable = {
        x,
        y,
        radius: 30,
        prompt: `Take photo: ${spot.title}`,
        trigger: () => {
          uiEvents.emit("minigame", {
            kind: "photo",
            title: spot.title,
            hint: "Line up the picture, then capture this little moment.",
            onDone: (success?: boolean) => {
              if (!success) return;
              const captured = capturePhoto(spot.id);
              if (!captured) return;
              marker.setText("SAVED").setAlpha(0.7);
              uiEvents.emit("toast", `Polaroid saved: ${spot.title}`);
            },
          });
        },
      };
      this.interactables.push(it);
    }
  }

  private openSiblingShowdown(def: (typeof NPCS)[number], npc: NPC) {
    if (store.hasDaily("yas_sibling_showdown")) {
      uiEvents.emit("dialogue", def.name, ["We already settled today's family chaos championship. Bragging rights are still active."]);
      return;
    }
    uiEvents.emit("minigame", {
      kind: "showdown",
      title: `Juju vs ${def.name}`,
      hint: "First to 16 taps wins the Family Chaos Championship.",
      taps: 16,
      skipLabel: "Let them win",
      onDone: (jujuWon?: boolean) => {
        store.setDaily("yas_sibling_showdown");
        quests.onMinigame("sibling_showdown");
        store.addRelationship(def.id, 2);
        this.showFamilyChaosCap(jujuWon ? npc.x : this.player.x, (jujuWon ? npc.y : this.player.y) - 25);
        uiEvents.emit("dialogue", "Family chaos", [
          jujuWon ? `Juju wins. ${def.name} has to wear the blue-and-white cap with the pink heart.` : `${def.name} wins. Juju wears the blue-and-white cap with the pink heart.`,
          "The bragging rights will definitely last until tomorrow.",
        ]);
      },
    });
  }

  private showFamilyChaosCap(x: number, y: number) {
    const cap = this.add.container(x, y).setDepth(y + 4);
    const crown = this.add.ellipse(0, -3, 18, 11, 0x2f6fd0);
    const stripe = this.add.rectangle(0, -3, 16, 3, 0xffffff);
    const brim = this.add.ellipse(5, 1, 14, 5, 0x2f6fd0);
    const heart = this.add.text(0, -4, "♥", { fontFamily: "monospace", fontSize: "9px", color: "#f28ab2", resolution: 2 }).setOrigin(0.5);
    cap.add([crown, stripe, brim, heart]);
    this.tweens.add({ targets: cap, y: y - 8, alpha: 0, duration: 2300, ease: "Sine.easeOut", onComplete: () => cap.destroy() });
  }

  private addZoneInteractable(z: import("../worldgen").ZoneSpec) {
    const trigger = () => {
      switch (z.action) {
        case "cafe":
          if (z.tag === "dubai_mall" || z.tag === "dubai_hills_mall") {
            quests.onInteract(z.tag);
            this.enterMall(z.tag);
            break;
          }
          {
            const truck = {
              saadiyat_mlt: { title: "MLT truck", line: "A tiny Saadiyat stop with a surprisingly serious fan club.", choices: [{ id: "mlt_bites", name: "MLT bites", description: "The little snack everyone has an opinion about.", price: 7 }, { id: "coffee", name: "Iced coffee", description: "Cold, strong, and beach-proof.", price: 6 }] },
              saadiyat_grill: { title: "Saadiyat grill", line: "Smoky, sunny, and exactly the right amount of messy.", choices: [{ id: "grill_wrap", name: "Grill wrap", description: "Fresh off the hot plate.", price: 9 }, { id: "mlt_bites", name: "Side bites", description: "A small extra for the walk.", price: 5 }] },
              saadiyat_gelato: { title: "Gelato truck", line: "Cold gelato in full sun. It works.", choices: [{ id: "gelato", name: "Pistachio gelato", description: "A tiny holiday in a cup.", price: 7 }, { id: "mlt_bites", name: "Cookie bites", description: "A second dessert is valid.", price: 5 }] },
              last_exit_burgers: { title: "Last Exit burgers", line: "Road-trip burger acquired. No notes.", choices: [{ id: "road_burger", name: "Road-trip burger", description: "The reason you took the detour.", price: 11 }, { id: "last_exit_treat", name: "Fries for the car", description: "They will not survive the drive.", price: 6 }] },
              last_exit_coffee: { title: "Last Exit coffee", line: "Coffee for the road. The detour was worth it.", choices: [{ id: "coffee", name: "Road coffee", description: "Warm, two sugars, ready to go.", price: 6 }, { id: "last_exit_treat", name: "Date shake", description: "A sweet little road treat.", price: 7 }] },
              last_exit_dessert: { title: "Last Exit dessert", line: "One last sweet thing before heading out.", choices: [{ id: "road_dessert", name: "Road dessert", description: "No schedule, no regrets.", price: 8 }, { id: "last_exit_treat", name: "Cookie box", description: "Save one for later. Or do not.", price: 6 }] },
            }[z.tag ?? ""];
            if (truck) {
              uiEvents.emit("openFoodOrder", {
                title: truck.title,
                subtitle: truck.line,
                items: truck.choices,
                onOrder: (itemId: string) => {
                  quests.onInteract("cafe");
                  if (z.tag) quests.onInteract(z.tag);
                  store.addItem(itemId);
                  store.advanceTime();
                  uiEvents.emit("dialogue", truck.title, [`Order up: ${itemId.replace(/_/g, " ")}. ${truck.line}`]);
                },
              });
              break;
            }
          }
          if (z.tag === "hudayriyat_trucks") {
            uiEvents.emit("openFoodOrder", {
              title: "Hudayriyat food trucks",
              subtitle: "Food by the water. Choose the stop that sounds right.",
              items: [
                { id: "grill_wrap", name: "Grill wrap", description: "Smoky and made to eat outside.", price: 9 },
                { id: "coffee", name: "Saddle coffee", description: "A proper coffee before the drive home.", price: 6 },
                { id: "gelato", name: "Gelato", description: "Cold enough to make the sun feel fair.", price: 7 },
              ],
              onOrder: (itemId: string) => {
                quests.onInteract("cafe");
                quests.onInteract("hudayriyat_trucks");
                store.addItem(itemId);
                store.advanceTime();
                this.storyDialogueHandler = () => {
                  this.storyDialogueHandler = undefined;
                  if (!this.sys.isActive() || quests.currentStep("q_hudayriyat")?.target !== "fry_thief") return;
                  uiEvents.emit("sceneReset");
                  this.scene.start(SceneKeys.QuestActivity, { activity: "fry_thief", returnLocation: this.locationId });
                };
                uiEvents.once("dialogueClosed", this.storyDialogueHandler);
                uiEvents.emit("dialogue", "Hudayriyat", ["Order up. Food trucks by the water were the plan.", "A seagull has also reviewed the menu and selected: your fries."]);
              },
            });
            break;
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
              uiEvents.emit("dialogue", z.tag === "saddle" ? "Saddle" : "Cafe", [
                ok ? "Warm. Two sugars. You know the order." : "Maybe later.",
              ]);
            },
          });
          break;
        case "shop":
          if (z.tag === "style_studio") {
            uiEvents.emit("openWardrobe");
            break;
          }
          if (z.tag === "yas_mall") {
            this.enterMall(z.tag);
            break;
          }
          uiEvents.emit("openShop", z.tag === "adnoc_oasis" ? "adnoc" : "home");
          break;
        case "fuel":
          if (store.refuel()) {
            store.advanceTime();
            uiEvents.emit("dialogue", "ADNOC Oasis", ["Blue pumps, full tank. The road is yours again."]);
          }
          break;
        case "office":
          this.useOffice(z.tag);
          break;
        case "home":
          this.scene.start(SceneKeys.House, { title: getLocation(this.locationId).homeName ?? "Home", interior: "cream", propertyId: z.tag && store.state.properties[z.tag] ? z.tag : store.state.primaryHomeId, tour: !!z.tag && !store.state.properties[z.tag]?.owned });
          break;
        case "stairs": {
          const d = (z.data as { name?: string; tag?: string }) ?? {};
          const brown = d.tag === "well_court";
          if (z.tag === "residences_t8" && ["residences_t8", "apartment_1701_package"].includes(quests.currentStep("q_residences")?.target ?? "")) {
            if (quests.currentStep("q_residences")?.target === "residences_t8") quests.onInteract("residences_t8");
            uiEvents.emit("sceneReset");
            this.scene.start(SceneKeys.QuestActivity, { activity: "apartment_1701", returnLocation: this.locationId });
            break;
          }
          uiEvents.emit("minigame", {
            kind: "stairs",
            title: d.name ?? "Stairs",
            hint: brown
              ? "Hit A inside the bright timing zone. The girls are already racing."
              : "Climb quickly to the lobby.",
            taps: brown ? 20 : 10,
            onDone: () => {
              if (brown) quests.onMinigame("well_court_race");
              else if (z.tag) quests.onInteract(z.tag);
              if (brown) store.unlockMemory("mem_well_court");
              this.scene.start(SceneKeys.House, {
                title: d.name ?? "Inside",
                interior: brown ? "brown" : "cream",
              });
            },
          });
          break;
        }
        case "salon": {
          uiEvents.emit("minigame", {
            kind: "salon",
            title: "Saadiyat",
            hint: "Nails or brows. Tap along — or skip if she's not in the mood.",
            taps: 10,
            skipLabel: "Skip",
            onDone: (ok?: boolean) => {
              if (z.tag) quests.onInteract(z.tag);
              if (ok) {
                store.addHearts(1);
                store.setDaily("saadiyat_glow");
              }
              uiEvents.emit("dialogue", "Saadiyat", ok ? ["The reveal mirror turns. Tiny sparkle. Big glow.", "She looks so pretty."] : ["No appointment today. Just a slow Saadiyat walk and the same glow anyway."]);
            },
          });
          break;
        }
        case "drive":
          if (this.driving) this.hopOut();
          else this.openDriveMenu();
          break;
        case "exit": {
          if (this.time.now < this.arriveAt) return;
          const d = z.data as { to: string; from: Cardinal };
          this.goDistrict(d.to, d.from);
          break;
        }
        case "landmark": {
          const loc = getLocation(this.locationId);
          const title = typeof z.data === "string" ? z.data : (loc.landmarkName ?? loc.name);
          const photoTag = loc.id === "london_westminster" ? "bigben" : loc.id;
          const photoTex =
            (typeof z.data === "string" && this.textures.exists(String(z.data)) && String(z.data)) ||
            (z.tag && this.textures.exists(z.tag) ? z.tag : undefined) ||
            (title.toLowerCase().includes("fountain") && this.textures.exists("o_fountain") ? "o_fountain" : undefined) ||
            (loc.landmark && this.textures.exists(loc.landmark) ? loc.landmark : undefined) ||
            (this.textures.exists("o_fountain") ? "o_fountain" : "ui_heart");
          const buddyId = photoTag === "bigben" ? "fadwa" : (store.state.lastPassenger ?? "moomoo");
          if (photoTag === "bigben") {
            store.unlockCompanion("fadwa");
            store.setActiveCompanion("fadwa");
          }
          uiEvents.emit("minigame", {
            kind: "photo",
            title: title,
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
              uiEvents.emit("dialogue", title, [
                ok ? "That's the one. Keep it." : `${title} — ${loc.name}.`,
                "Wish you were really here with me.",
              ]);
            },
          });
          break;
        }
        case "info": {
          const d = z.data as { name: string; desc?: string } | undefined;
          if (z.tag) quests.onInteract(z.tag);
          if (d) {
            if (z.tag === "positano_view") store.unlockMemory("mem_positano");
            if (z.tag === "santorini_view") store.unlockMemory("mem_santorini");
            uiEvents.emit("dialogue", d.name, [d.desc ?? d.name]);
          }
          break;
        }
      }
    };
    if (z.action === "drive") {
      this.parkedJeep = this.add.image(z.x, z.y, getVisualTexture(this, "v_jeep_blue")).setOrigin(0.5, 1).setDepth(z.y);
      this.parkedJeepShadow = createVisualShadow(this, z.x, z.y, getVisualAssetDef("v_jeep_blue")?.shadow, this.visualTheme.lighting);
    }
    this.interactables.push({ x: z.x, y: z.y, radius: z.radius, tag: z.tag, prompt: z.prompt, trigger });
  }

  private focusQuest(questId: string) {
    this.focusedQuestId = questId;
    this.refreshQuestGuide();
  }

  private refreshQuestGuide() {
    this.questArrow?.destroy();
    this.questArrowLabel?.destroy();
    this.questArrow = undefined;
    this.questArrowLabel = undefined;
    if (!this.player) return;

    const list = quests.activeQuests();
    const quest = list.find((q) => q.def.id === this.focusedQuestId) ?? list[0];
    if (!quest || quest.step.type === "visit") return;

    const target = this.interactables.find((it) => it.tag === quest.step.target);
    if (!target) return;

    this.questArrow = this.add
      .text(target.x, target.y - 30, "v", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#ffe08a",
        stroke: "#3a2b3a",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(70010);
    this.questArrowLabel = this.add
      .text(target.x, target.y - 48, "GO HERE", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#3a2b3a",
        backgroundColor: "#ffe08a",
        padding: { x: 4, y: 2 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(70011);
    this.tweens.add({ targets: [this.questArrow, this.questArrowLabel], y: "-=7", duration: 480, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  private useOffice(tag?: string) {
    if (tag !== "adnoc_hq") return;
    if (quests.currentStep("q_adnoc_engineer")?.target === "adnoc_hq") quests.onInteract("adnoc_hq");
    store.setInJeep(false);
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.AdnocHQ, { floor: "ground" });
  }

  private enterMall(mallId: "dubai_mall" | "dubai_hills_mall" | "yas_mall") {
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.Mall, { mallId });
  }

  private placeFollowJeep(x: number, y: number, stayIn: boolean) {
    const jx = x + 22;
    const jy = y + 8;
    this.addZoneInteractable({
      x: jx,
      y: jy,
      radius: 22,
      action: "drive",
      prompt: "Get in the Jeep",
    });
    this.jeepSpot = this.interactables[this.interactables.length - 1] ?? null;
    this.jeepReadyAt = this.time.now + (stayIn ? 450 : 200);
    if (stayIn) this.hopIn({ quiet: true });
  }

  private parkJeepAt(x: number, y: number) {
    this.parkedJeep?.setPosition(x, y).setVisible(true).setDepth(y);
    this.parkedJeepShadow?.setContactPoint(x, y);
    if (this.jeepSpot) {
      this.jeepSpot.x = x;
      this.jeepSpot.y = y;
    }
  }

  private callJeep() {
    if (!this.sys.isActive() || this.transitioning || controls.cameraMode || controls.locked) {
      store.toast("Finish this little moment first.", "#a08a70");
      return;
    }
    if (this.driving || store.state.inJeep) {
      store.toast("You are already in the Jeep 😭", "#a08a70");
      return;
    }
    if (this.time.now < this.jeepCallReadyAt) {
      store.toast("Jeep is doing a tiny three-point turn.", "#a08a70");
      return;
    }
    const candidates = [
      [48, 12], [-48, 12], [12, 48], [12, -48], [72, 0], [-72, 0], [0, 72], [0, -72],
    ];
    const point = candidates.map(([dx, dy]) => ({ x: this.player.x + dx, y: this.player.y + dy })).find(({ x, y }) => {
      if (x < 32 || y < 32 || x > this.worldW - 32 || y > this.worldH - 32) return false;
      if (this.npcs.some((npc) => Phaser.Math.Distance.Between(x, y, npc.x, npc.y) < 36)) return false;
      if (this.interactables.some((item) => item !== this.jeepSpot && Phaser.Math.Distance.Between(x, y, item.x, item.y) < 28)) return false;
      return this.physics.overlapRect(x - 13, y - 10, 26, 20, true, true).length === 0;
    });
    if (!point) {
      store.toast("Jeep says: nowhere safe to park here 😭", "#a08a70");
      return;
    }
    this.jeepCallReadyAt = this.time.now + 2500;
    this.parkJeepAt(point.x, point.y);
    this.parkedJeep?.setScale(0.82).setAlpha(0.4);
    this.tweens.add({ targets: this.parkedJeep, scaleX: 1, scaleY: 1, alpha: 1, y: point.y - 3, duration: 330, ease: "Back.out", onComplete: () => this.parkedJeep?.setY(point.y).setDepth(point.y) });
    for (let index = 0; index < 5; index++) {
      const dust = this.add.circle(point.x + Phaser.Math.Between(-14, 14), point.y + Phaser.Math.Between(-2, 8), Phaser.Math.Between(2, 4), 0xd9c09a, 0.65).setDepth(point.y - 1);
      this.tweens.add({ targets: dust, x: dust.x + Phaser.Math.Between(-12, 12), y: dust.y - 10, alpha: 0, duration: 420 + index * 45, onComplete: () => dust.destroy() });
    }
    store.toast("Your Jeep found you ♡", "#2f6fd0");
  }

  private hopIn(opts?: { quiet?: boolean }) {
    if (this.driving) return;
    this.closeDriveMenu();
    this.driving = true;
    this.refreshTigorPet();
    store.setInJeep(true);
    this.jeepReadyAt = this.time.now + 500;
    this.player.speed = this.baseSpeed * 2.8;
    this.player.setVisible(false);
    this.player.setAlpha(0);
    for (const it of this.interactables) it.npc?.setTalkAvailable(false);
    this.parkedJeep?.setVisible(false);
    this.rideJeep?.destroy();
    this.rideJeepShadow?.destroy();
    this.rideJeep = this.add.image(this.player.x, this.player.y, getVisualTexture(this, "v_jeep_blue")).setDepth(this.player.y + 1);
    this.rideJeepShadow = createVisualShadow(this, this.player.x, this.player.y, getVisualAssetDef("v_jeep_blue")?.shadow, this.visualTheme.lighting);
    if (!opts?.quiet) store.toast("Jeep time — hold a direction. A to hop out.", "#2f6fd0");
    uiEvents.emit("prompt", "A · hop out of the Jeep");
  }

  private hopOut() {
    if (!this.driving) return;
    this.driving = false;
    this.refreshTigorPet();
    store.setInJeep(false);
    this.jeepReadyAt = this.time.now + 1000;
    this.player.speed = this.baseSpeed;
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.rideJeep?.destroy();
    this.rideJeep = undefined;
    this.rideJeepShadow?.destroy();
    this.rideJeepShadow = undefined;
    this.parkJeepAt(this.player.x - 24, this.player.y + 6);
    this.currentPrompt = null;
    uiEvents.emit("prompt", null);
    store.toast("Parked the Jeep", "#2f6fd0");
  }

  private openDriveMenu() {
    this.closeDriveMenu();
    const loc = getLocation(this.locationId);
    const others = districtsOf(loc.cityId).filter((d) => d.id !== loc.id);
    const cam = this.cameras.main;
    const cx = cam.worldView.centerX;
    const cy = cam.worldView.centerY;
    const items = [{ label: "Cruise around here", id: "__cruise" }, ...others.map((d) => ({ label: `Drive to ${d.name}`, id: d.id }))];
    const h = 36 + items.length * 28;
    const w = 240;
    const g = this.add.graphics();
    g.fillStyle(0x3a2b3a, 0.92);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineStyle(2, 0xf4a6c0, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const title = this.add
      .text(0, -h / 2 + 10, "Blue Jeep Sport", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffe08a",
        resolution: 2,
      })
      .setOrigin(0.5, 0);
    const rows: Phaser.GameObjects.GameObject[] = [g, title];
    items.forEach((item, i) => {
      const t = this.add
        .text(0, -h / 2 + 32 + i * 28, item.label, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#fff",
          backgroundColor: "#e46d94",
          padding: { x: 10, y: 4 },
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => {
        if (item.id === "__cruise") this.hopIn();
        else this.driveTo(item.id);
      });
      rows.push(t);
    });
    this.driveMenu = this.add.container(cx, cy, rows).setDepth(80000).setScrollFactor(1);
    controls.locked = true;
  }

  private closeDriveMenu() {
    this.driveMenu?.destroy();
    this.driveMenu = undefined;
    controls.locked = false;
  }

  private driveTo(destId: string) {
    this.closeDriveMenu();
    if (this.transitioning) return;
    this.transitioning = true;
    if (store.state.lastPassenger) quests.onDriveWith(store.state.lastPassenger);
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.Driving, { destId, passenger: store.state.lastPassenger });
  }

  private goDistrict(to: string, from: Cardinal) {
    if (this.transitioning || controls.locked || this.time.now < this.arriveAt) return;
    if (!to || to === this.locationId) return;
    const dest = getLocation(to);
    if (!dest || dest.id === this.locationId) return;
    this.transitioning = true;
    uiEvents.emit("prompt", null);
    this.scene.start(SceneKeys.World, {
      locationId: dest.id,
      from,
      driving: this.driving || store.state.inJeep,
    });
  }

  private applyAtmosphere() {
    this.cameras.main.setBackgroundColor(skyHex());
    const night = store.state.timeOfDay === "night";
    const color = worldTint();
    const live = this.timeWash?.active && this.timeWash.scene;
    if (!live) {
      const { width, height } = this.scale.gameSize;
      this.timeWash = this.add.rectangle(0, 0, width, height, color, night ? 0.16 : 0.07).setOrigin(0).setScrollFactor(0).setDepth(6);
    } else {
      this.timeWash!.setFillStyle(color, night ? 0.22 : store.state.timeOfDay === "evening" ? 0.14 : 0.08);
    }
  }

  private addCityAmbience(cityId: string) {
    const flavor: Record<string, { icon: string; color: string }[]> = {
      abudhabi: [{ icon: "☕", color: "#f4c95d" }, { icon: "▦", color: "#2f6fd0" }, { icon: "≈", color: "#8ecae6" }],
      dubai: [{ icon: "☕", color: "#e46d94" }, { icon: "▰", color: "#f4c95d" }, { icon: "=^.^=", color: "#fff4e6" }],
      london: [{ icon: "▰", color: "#d84652" }, { icon: "⌁", color: "#fff4e6" }, { icon: "☂", color: "#8ecae6" }],
      edinburgh: [{ icon: "☂", color: "#8ecae6" }, { icon: "⌁", color: "#fff4e6" }, { icon: "≈", color: "#a6c8dc" }],
      leicester: [{ icon: "▤", color: "#fff4e6" }, { icon: "☕", color: "#e46d94" }, { icon: "z", color: "#8ecae6" }],
      germany: [{ icon: "○-○", color: "#7be0a3" }, { icon: "☕", color: "#f4c95d" }, { icon: "▰", color: "#8ecae6" }],
    };
    const entries = flavor[cityId] ?? flavor.abudhabi;
    const positions = [
      { x: this.worldW * 0.18, y: this.worldH * 0.24 },
      { x: this.worldW * 0.78, y: this.worldH * 0.36 },
      { x: this.worldW * 0.62, y: this.worldH * 0.76 },
    ];
    entries.forEach((entry, index) => {
      const pos = positions[index];
      const life = this.add.text(pos.x, pos.y, entry.icon, { fontFamily: "monospace", fontSize: "11px", color: entry.color, backgroundColor: "rgba(58,43,58,0.45)", padding: { x: 3, y: 2 }, resolution: 2 }).setOrigin(0.5).setDepth(pos.y + 1).setAlpha(0.72);
      this.tweens.add({ targets: life, x: life.x + (index % 2 ? -34 : 34), y: life.y + (index === 2 ? -8 : 8), alpha: 0.42, duration: 5200 + index * 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    });
  }

  /** Theme selection is global and data-driven; it never changes worldgen or gameplay state. */
  private applyVisualTheme() {
    const { width, height } = this.scale.gameSize;
    this.themeWash = this.add
      .rectangle(0, 0, width, height, this.visualTheme.ambientColor, this.visualTheme.ambientAlpha)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(5);
  }

  private applyZoom() {
    const { width, height } = this.scale.gameSize;
    const cozyZoom = Phaser.Math.Clamp(height / (30 * TILE), 1.6, 2.58);
    this.cameras.main.setZoom(this.driving ? cozyZoom * 0.86 : cozyZoom);
    this.timeWash?.setSize(width, height);
    this.themeWash?.setSize(width, height);
  }

  private startCamera(pose: "smile" | "peace" | "silly" | "hug" = "smile") {
    if (!this.sys.isActive() || this.driving || this.transitioning) {
      controls.cameraMode = false;
      store.toast("Park the Jeep before opening the camera.", "#a08a70");
      return;
    }
    this.exitCamera();
    controls.cameraMode = true;
    controls.locked = false;
    this.cameraPose = pose;
    this.cameraOffset.set(0, 0);
    this.player.move(0, 0);
    const poser = this.npcs
      .filter((npc) => Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 96)
      .sort((a, b) => Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y))[0];
    if (poser) {
      poser.startRoutine("look", 0).faceTowards(this.player.x, this.player.y);
      this.tweens.add({ targets: poser, x: this.player.x + 18, y: this.player.y + 3, duration: 420, ease: "Sine.inOut" });
      worldEmote(this, poser.x, poser.y - 34, pose === "silly" ? ":P" : pose === "hug" ? "♥" : "!", pose === "hug" ? "#ffdbe7" : "#ffe08a");
    }
    this.currentPrompt = null;
    uiEvents.emit("prompt", null);
    const { width, height } = this.scale.gameSize;
    const frame = this.add.graphics().setScrollFactor(0).setDepth(70000);
    frame.lineStyle(4, 0xffffff, 0.88).strokeRoundedRect(24, 54, width - 48, height - 140, 12);
    frame.lineStyle(2, 0xffffff, 0.5).lineBetween(width / 2 - 10, height / 2, width / 2 + 10, height / 2).lineBetween(width / 2, height / 2 - 10, width / 2, height / 2 + 10);
    const title = this.add.text(34, 66, `CAMERA · ${pose.toUpperCase()}`, { fontFamily: "monospace", fontSize: "12px", color: "#fff", backgroundColor: "rgba(43,34,51,0.72)", padding: { x: 7, y: 4 }, resolution: 2 }).setScrollFactor(0).setDepth(70001);
    const hint = this.add.text(width / 2, height - 73, "MOVE VIEW · ACTION TO TAKE PHOTO", { fontFamily: "monospace", fontSize: "11px", color: "#fff", backgroundColor: "rgba(43,34,51,0.78)", padding: { x: 8, y: 4 }, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(70001);
    const exit = this.add.text(width - 34, 66, "EXIT", { fontFamily: "monospace", fontSize: "11px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 9, y: 5 }, resolution: 2 }).setOrigin(1, 0).setScrollFactor(0).setDepth(70002).setInteractive({ useHandCursor: true });
    exit.on("pointerdown", () => this.exitCamera());
    this.cameraOverlay = this.add.container(0, 0, [frame, title, hint, exit]).setScrollFactor(0).setDepth(70000);
  }

  private exitCamera() {
    controls.cameraMode = false;
    this.cameraOverlay?.destroy(true);
    this.cameraOverlay = undefined;
    this.cameraOffset.set(0, 0);
    this.cameras?.main?.setFollowOffset(0, 0);
  }

  private takeCameraPhoto() {
    if (!controls.cameraMode || this.time.now - this.lastCameraCapture < 700) return;
    this.lastCameraCapture = this.time.now;
    const nearby = this.npcs
      .filter((npc) => Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 92)
      .map((npc) => npc.def.id);
    if (this.companionNpc && !nearby.includes(this.companionNpc.def.id)) nearby.push(this.companionNpc.def.id);
    if (this.tigorPet && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.tigorPet.x, this.tigorPet.y) < 92) nearby.push("tigor");
    const index = store.getStat("photos_taken") + 1;
    const location = getLocation(this.locationId);
    const roll = stableDailyRoll(`camera:${this.locationId}:${index}`);
    const surprise = roll < 0.06
      ? location.cityId === "london" || location.cityId === "edinburgh" ? "pigeon" : store.state.cat.adopted ? "cat" : location.cityId === "dubai" ? "bus" : "weird_pose"
      : undefined;
    const together = nearby.length ? ` with ${nearby.map((id) => NPCS.find((npc) => npc.id === id)?.name ?? id).join(" + ")}` : "";
    const id = `camera_${store.state.currentDay}_${this.locationId}_${index}`;
    const saved = store.capturePhoto({
      id,
      title: `${location.name}${together}`,
      locationId: this.locationId,
      day: store.state.currentDay,
      timeOfDay: store.state.timeOfDay,
      companionId: nearby[0],
      participantIds: nearby,
      pose: this.cameraPose,
      surprise,
      frame: surprise ? "chaos" : nearby.length ? "hearts" : "city",
      caption: surprise ? `${this.cameraPose}. Perfect light. Unexpected ${surprise}. Kept anyway.` : `${this.cameraPose} pose. ${location.name}. A little day worth keeping.`,
    });
    if (!saved) return;
    if (this.cameraPose === "hug" && nearby[0] && store.getRelationship(nearby[0]) >= 35) store.incrementStat("npc_hugs");
    if (surprise === "pigeon") store.incrementStat("pigeons_encountered");
    const { width, height } = this.scale.gameSize;
    const flash = this.add.rectangle(0, 0, width, height, 0xffffff, 0.92).setOrigin(0).setScrollFactor(0).setDepth(70020);
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    store.toast(surprise ? `Saved · ${surprise} photobomb` : "Saved to scrapbook", "#8ecae6");
    tryDeliverMessages({ limit: 1 });
  }

  private tryInteract() {
    if (controls.cameraMode) {
      this.takeCameraPhoto();
      return;
    }
    if (this.driveMenu) {
      this.closeDriveMenu();
      return;
    }
    if (controls.locked) return;
    const now = this.time.now;
    if (now - this.lastInteract < 250) return;
    if (this.driving) {
      if (now < this.jeepReadyAt) return;
      this.lastInteract = now;
      const nearbyNpc = this.npcs.find((npc) => Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 82);
      if (nearbyNpc) {
        store.incrementStat("jeep_honks");
        worldEmote(this, nearbyNpc.x, nearbyNpc.y - 34, nearbyNpc.def.id === "baba" ? "!" : "?", "#ffe08a");
        store.toast(nearbyNpc.def.id === "baba" ? "HONK · Baba is not impressed." : "HONK · tiny wave acquired.", "#f4c95d");
        return;
      }
      this.hopOut();
      return;
    }
    if (this.currentPrompt) {
      this.lastInteract = now;
      this.currentPrompt.trigger();
    }
  }

  private openMap() {
    this.closeDriveMenu();
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.WorldMap, {});
  }

  private onShutdown() {
    this.exitCamera();
    this.clearWorldEvent();
    if (this.ideaDialogueHandler) uiEvents.off("dialogueClosed", this.ideaDialogueHandler);
    if (this.transformDialogueHandler) uiEvents.off("dialogueClosed", this.transformDialogueHandler);
    if (this.storyDialogueHandler) uiEvents.off("dialogueClosed", this.storyDialogueHandler);
    this.ideaDialogueHandler = undefined;
    this.transformDialogueHandler = undefined;
    this.storyDialogueHandler = undefined;
    this.groundLayer?.destroy();
    this.groundLayer = undefined;
    this.rideJeepShadow?.destroy();
    this.parkedJeepShadow?.destroy();
    this.companionNpc?.destroy();
    this.companionNpc = undefined;
    this.companionInteractable = undefined;
    minimap.on = false;
    this.closeDriveMenu();
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("openMap", this.openMap, this);
    uiEvents.off("questFocus", this.focusQuest, this);
    uiEvents.off("companionChanged", this.refreshCompanion, this);
    uiEvents.off("cameraStart", this.startCamera, this);
    uiEvents.off("cameraExit", this.exitCamera, this);
    uiEvents.off("callJeep", this.callJeep, this);
    store.off("questUpdated", this.refreshQuestGuide, this);
    store.off("petChanged", this.refreshTigorPet, this);
    this.scale.off("resize", this.applyZoom, this);
  }

  update(time: number) {
    if (!this.player) return;
    this.groundLayer?.update(this.game.loop.delta);

    let vx = 0;
    let vy = 0;
    if (controls.cameraMode && this.keys) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      this.cameraOffset.x = Phaser.Math.Clamp(this.cameraOffset.x + vx * 1.8, -90, 90);
      this.cameraOffset.y = Phaser.Math.Clamp(this.cameraOffset.y + vy * 1.5, -58, 58);
      this.cameras.main.setFollowOffset(-this.cameraOffset.x, -this.cameraOffset.y);
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.takeCameraPhoto();
      if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.exitCamera();
      vx = 0;
      vy = 0;
    } else if (!controls.locked && !this.transitioning) {
      if (this.cursors && this.keys) {
        if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
        if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
        if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
        if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
        if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) {
          this.tryInteract();
        }
      }
      vx += controls.moveX;
      vy += controls.moveY;
      const len = Math.hypot(vx, vy);
      if (len > 1) {
        vx /= len;
        vy /= len;
      }
    }
    const walkingSpeed = !this.driving && store.state.outfit === "red_bottom_boots" ? this.player.speed * 1.65 : this.player.speed;
    this.player.move(vx * walkingSpeed, vy * walkingSpeed);
    this.tigorPet?.follow(this.player, time, this.game.loop.delta, Math.abs(vx) + Math.abs(vy) > 0.05);
    if (this.tigorPet && this.tigorInteractable) {
      this.tigorInteractable.x = this.tigorPet.x;
      this.tigorInteractable.y = this.tigorPet.y;
    }

    if (this.rideJeep) {
      this.rideJeep.setPosition(this.player.x, this.player.y);
      this.rideJeep.setDepth(this.player.y + 2);
      this.rideJeep.setAngle(vx !== 0 ? vx * 8 : 0);
      this.rideJeepShadow?.setContactPoint(this.player.x, this.player.y);
    }

    for (const npc of this.npcs) {
      npc.update(time);
      const interactable = this.interactables.find((candidate) => candidate.npc === npc);
      if (interactable) {
        interactable.x = npc.x;
        interactable.y = npc.y;
      }
      if (!this.driving && !controls.cameraMode && !this.approachReacted.has(npc.def.id) && Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y) < 62) {
        this.approachReacted.add(npc.def.id);
        const reaction = npcApproachEmote(npc.def.id);
        worldEmote(this, npc.x, npc.y - 32, reaction.text, reaction.color);
        if (store.getRelationship(npc.def.id) >= 10) this.tweens.add({ targets: npc.sprite, scaleX: 1.34, scaleY: 1.34, duration: 150, yoyo: true, repeat: 1, ease: "Sine.inOut" });
      }
    }

    for (const moving of this.movingAmbient) {
      moving.interactable.x = moving.object.x;
      moving.interactable.y = moving.object.y;
    }

    if (this.companionNpc) {
      const targetX = this.player.x - 18;
      const targetY = this.player.y + 10;
      const distance = Phaser.Math.Distance.Between(this.companionNpc.x, this.companionNpc.y, targetX, targetY);
      if (distance > 120) {
        this.companionNpc.place(targetX, targetY);
      } else {
        this.companionNpc.place(
          this.companionNpc.x + (targetX - this.companionNpc.x) * 0.07,
          this.companionNpc.y + (targetY - this.companionNpc.y) * 0.07,
        );
      }
      this.companionNpc.faceTowards(this.player.x, this.player.y);
      this.companionNpc.update(time);
      if (this.companionInteractable) {
        this.companionInteractable.x = this.companionNpc.x;
        this.companionInteractable.y = this.companionNpc.y;
      }
    }

    if (!this.driving && !this.transitioning && !controls.cameraMode) {
      let best: Interactable | null = null;
      let bestD = Infinity;
      const canTalkToCompanion = !!this.companionNpc && quests.activeQuests().some((q) => q.step.type === "talk" && q.step.target === this.companionNpc?.def.id);
      for (const it of this.interactables) {
        if (it === this.jeepSpot && time < this.jeepReadyAt) continue;
        if (it === this.companionInteractable && !canTalkToCompanion) continue;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
        if (d <= it.radius && d < bestD) {
          best = it;
          bestD = d;
        }
      }
      if (best !== this.currentPrompt) {
        this.currentPrompt = best;
        uiEvents.emit("prompt", best ? best.prompt : null);
      }
      for (const it of this.interactables) it.npc?.setTalkAvailable(!controls.locked && it === best);
    }

    if (this.followingCat && this.player) {
      this.followingCat.x += (this.player.x - 14 - this.followingCat.x) * 0.04;
      this.followingCat.y += (this.player.y + 4 - this.followingCat.y) * 0.04;
      this.followingCat.setDepth(this.followingCat.y);
    }

    if (!this.transitioning && !controls.locked && !controls.cameraMode) {
      this.timeAcc += this.game.loop.delta;
      if (this.timeAcc > 90000) {
        this.timeAcc = 0;
        store.advanceTime();
        this.applyAtmosphere();
      }
      this.checkMapEdge();
    }
    this.syncMinimap();
  }

  private petalBurst(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const p = this.add.image(x, y, getVisualTexture(this, i % 2 ? "o_flower_pink" : "o_flower_yellow")).setScale(0.45).setDepth(y + 8);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-18, 18),
        y: y - Phaser.Math.Between(8, 24),
        alpha: 0,
        duration: 500,
        onComplete: () => p.destroy(),
      });
    }
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

  private placeSecrets() {
    for (const s of secretsFor(this.locationId)) {
      if (store.hasSecret(s.id)) continue;
      if (s.time && s.time !== store.state.timeOfDay) continue;
      if (s.minRel && store.getRelationship(s.minRel.npc) < s.minRel.min) continue;
      const x = s.tx * TILE + TILE / 2;
      const y = (s.ty + 1) * TILE;
      const tex =
        s.kind === "flower"
          ? "o_flower_pink"
          : s.kind === "heart"
            ? "ui_heart"
            : s.kind === "cat"
              ? "o_cat"
              : s.kind === "note"
                ? "o_note"
                : s.kind === "postcard"
                  ? "o_postcard"
                  : s.kind === "coins"
                    ? "ui_coin"
                    : "ui_star";
      const img = this.add.image(x, y, getVisualTexture(this, tex)).setOrigin(0.5, 0.9).setDepth(y).setScale(s.kind === "heart" ? 1.2 : 1);
      this.tweens.add({ targets: img, y: y - 2, duration: 800, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const it: Interactable = {
        x,
        y,
        radius: 16,
        prompt: "What's this?",
        trigger: () => {
          if (!store.discoverSecret(s.id)) return;
          img.destroy();
          this.interactables = this.interactables.filter((i) => i !== it);
          if (s.item) store.addItem(s.item);
          if (s.kind === "coins") store.addCoins(12);
          if (s.memory) store.unlockMemory(s.memory);
          if (s.kind === "cat") this.spawnCat(x, y);
          store.toast(s.title, "#ffe08a");
          uiEvents.emit("dialogue", s.title, [s.hint === "Near the water." ? "You weren't supposed to find this. You did anyway." : s.title]);
        },
      };
      this.interactables.push(it);
    }
  }

  private spawnCat(x: number, y: number) {
    const catTex = this.textures.exists("o_cat") ? "o_cat" : "ui_heart";
    this.followingCat = this.add.image(x, y, catTex).setOrigin(0.5, 1).setDepth(y);
    store.toast("A cat decided to follow you", "#f4a6c0");
  }

  private spawnTigorPet(x: number, y: number) {
    if (!store.state.tigor.unlocked || !store.state.tigor.following || this.driving || this.tigorPet?.active) return;
    this.tigorPet = new PetCompanion(this, x - 20, y + 8);
    const interactable: Interactable = {
      x: this.tigorPet.x,
      y: this.tigorPet.y,
      radius: 23,
      prompt: "Pet Tigor",
      trigger: () => {
        store.petTigor();
        this.tigorPet?.celebrate();
        const lines = ["Tigor leans into Juju's hand like international bureaucracy never happened.", "Tigor: prrrrp.", "The tiny traveller requires a snack immediately."];
        uiEvents.emit("dialogue", "Tigor", [lines[store.getStat("tigor_pets") % lines.length]]);
      },
    };
    this.tigorInteractable = interactable;
    this.interactables.push(interactable);
  }

  private refreshTigorPet() {
    if (!this.sys.isActive()) return;
    if (this.tigorInteractable) this.interactables = this.interactables.filter((candidate) => candidate !== this.tigorInteractable);
    this.tigorInteractable = undefined;
    this.tigorPet?.destroy(true);
    this.tigorPet = undefined;
    this.spawnTigorPet(this.player.x, this.player.y);
  }

  private maybeStartWorldEvent() {
    if (controls.locked || this.driving || this.transitioning || this.activeWorldEvent) {
      // A save can reopen in the Jeep, or the player can have the phone open
      // when the first daily roll fires. Try again once the world is walkable
      // so those perfectly normal states do not silently erase today's life.
      if (!this.transitioning && !this.activeWorldEvent) {
        this.time.delayedCall(2200, () => {
          if (this.sys.isActive()) this.maybeStartWorldEvent();
        });
      }
      return;
    }
    const majorHeist = quests.statusOf("q_family_jewel_heist") === "active";
    const adnocSceneSetup = this.locationId === "abudhabi_city" && quests.activeQuests().some((quest) => quest.def.id.startsWith("q_adnoc_"));
    if (majorHeist || adnocSceneSetup) return;
    const event = pickWorldEvent(this.locationId);
    if (!event) return;
    beginWorldEvent(event);
    this.activeWorldEvent = event;
    if (event.kind === "rain") {
      this.spawnRainEvent(event);
      return;
    }
    const anchor = this.findAmbientAnchor();
    if (event.kind === "lost_bag") {
      this.spawnLostBag(event, anchor.x, anchor.y);
      return;
    }
    const marker = this.makeAmbientMarker(event, anchor.x, anchor.y, () => this.triggerWorldEvent(event));
    if (["balloon", "runaway_cart", "loose_dog"].includes(event.kind)) {
      const dx = event.kind === "balloon" ? 65 : event.kind === "runaway_cart" ? 110 : 78;
      const dy = event.kind === "runaway_cart" ? 55 : event.kind === "loose_dog" ? -22 : -14;
      this.tweens.add({ targets: marker.container, x: Phaser.Math.Clamp(anchor.x + dx, 45, this.worldW - 45), y: Phaser.Math.Clamp(anchor.y + dy, 55, this.worldH - 55), duration: event.kind === "runaway_cart" ? 7600 : 3600, yoyo: event.kind !== "runaway_cart", repeat: event.kind === "runaway_cart" ? 0 : -1, ease: "Sine.inOut" });
      this.movingAmbient.push({ object: marker.container, interactable: marker.interactable });
    }
    if (event.kind === "lost_phone") {
      const buzz = this.add.text(anchor.x, anchor.y - 42, "BZZ", { fontFamily: "monospace", fontSize: "10px", color: "#ffe08a", stroke: "#3a2b3a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(anchor.y + 20);
      this.ambientObjects.push(buzz);
      this.tweens.add({ targets: buzz, x: "+=5", duration: 90, yoyo: true, repeat: -1, hold: 650 });
    }
    if (event.kind === "runaway_cart") {
      this.time.delayedCall(7900, () => {
        if (this.activeWorldEvent?.id !== event.id) return;
        store.toast("BONK · the boxes wobble. Nobody is hurt.", "#f4c95d");
        this.clearWorldEvent();
      });
    }
  }

  private findAmbientAnchor() {
    const candidates = [
      { x: this.player.x + 105, y: this.player.y + 30 },
      { x: this.player.x - 105, y: this.player.y - 25 },
      { x: this.player.x + 45, y: this.player.y - 100 },
      { x: this.player.x - 50, y: this.player.y + 100 },
    ];
    const safe = candidates
      .map((point) => ({ x: Phaser.Math.Clamp(point.x, 50, this.worldW - 50), y: Phaser.Math.Clamp(point.y, 65, this.worldH - 55) }))
      .find((point) => this.interactables.every((it) => Phaser.Math.Distance.Between(point.x, point.y, it.x, it.y) > 72));
    return safe ?? { x: Phaser.Math.Clamp(this.player.x + 82, 50, this.worldW - 50), y: Phaser.Math.Clamp(this.player.y + 64, 65, this.worldH - 55) };
  }

  private makeAmbientMarker(event: WorldEventDefinition, x: number, y: number, trigger: () => void) {
    const shadow = this.add.ellipse(0, 4, 30, 10, 0x221b28, 0.22);
    const bubble = this.add.circle(0, -12, 18, event.kind.startsWith("cat") ? 0xf4a6c0 : 0xfff4e6, 0.96).setStrokeStyle(2, 0x3a2b3a);
    const icon = this.add.text(0, -12, event.icon, { fontFamily: "monospace", fontSize: event.icon.length > 2 ? "10px" : "18px", color: "#3a2b3a", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const label = this.add.text(0, 12, event.title, { fontFamily: "monospace", fontSize: "8px", color: "#fff", backgroundColor: "rgba(58,43,58,0.78)", padding: { x: 4, y: 2 }, resolution: 2 }).setOrigin(0.5, 0);
    const container = this.add.container(x, y, [shadow, bubble, icon, label]).setDepth(y + 8);
    this.tweens.add({ targets: bubble, scale: 1.08, duration: 620, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const interactable: Interactable = { x, y, radius: 34, prompt: event.prompt, trigger };
    this.interactables.push(interactable);
    this.ambientInteractables.push(interactable);
    this.ambientObjects.push(container);
    return { container, icon, interactable };
  }

  private spawnLostBag(event: WorldEventDefinition, x: number, y: number) {
    const bag = this.makeAmbientMarker(event, x, y, () => store.toast("Four little things escaped. Catch each one.", "#f4c95d"));
    bag.interactable.prompt = "Inspect the torn bag";
    let collected = 0;
    const offsets = [{ x: -34, y: 20 }, { x: 32, y: 28 }, { x: -12, y: 48 }, { x: 55, y: 52 }];
    offsets.forEach((offset, index) => {
      const item = this.add.text(x + offset.x, y + offset.y, ["●", "◆", "▰", "○"][index], { fontFamily: "monospace", fontSize: "14px", color: ["#e46d94", "#2f6fd0", "#f4c95d", "#7be0a3"][index], stroke: "#3a2b3a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(y + offset.y + 4);
      this.ambientObjects.push(item);
      if (index === 3) this.tweens.add({ targets: item, x: item.x + 35, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const it: Interactable = { x: item.x, y: item.y, radius: 23, prompt: `Pick up item ${index + 1}/4`, trigger: () => {
        if (!item.active) return;
        collected += 1;
        item.destroy();
        this.interactables = this.interactables.filter((candidate) => candidate !== it);
        this.ambientInteractables = this.ambientInteractables.filter((candidate) => candidate !== it);
        if (collected >= 4) this.finishActiveWorldEvent(event);
        else store.toast(`${collected}/4 things rescued`, "#7be0a3");
      } };
      this.interactables.push(it);
      this.ambientInteractables.push(it);
      if (index === 3) this.movingAmbient.push({ object: item, interactable: it });
    });
  }

  private triggerWorldEvent(event: WorldEventDefinition) {
    if (event.kind === "tourist") {
      const choices = touristChoices(getLocation(this.locationId).cityId);
      uiEvents.emit("choice", {
        title: event.title,
        prompt: "Which way should they go? Wrong answers are allowed. Geography will recover.",
        choices: choices.map((choice, index) => ({ id: `${index}`, label: choice.label })),
        onChoose: (id: string) => {
          if (choices[Number(id)]?.correct) this.finishActiveWorldEvent(event);
          else uiEvents.emit("dialogue", "Tourist", ["They walk three steps, stop, and come back.", "Are you sure?"]);
        },
      });
      return;
    }
    if (event.kind === "street_dance") {
      uiEvents.emit("choice", {
        title: event.title,
        prompt: "A performer catches Juju watching.",
        choices: [{ id: "dance", label: "Dance", description: "Catch three bright beats." }, { id: "watch", label: "Watch", description: "Stay for the tiny finale." }],
        onChoose: (id: string) => {
          if (id === "watch") this.finishActiveWorldEvent(event, ["The last move lands. Juju claps first; the crowd follows."]);
          else uiEvents.emit("minigame", { kind: "timing", title: "Join the dance", hint: "Hit three glowing beats. Missing is only funny.", taps: 3, onDone: () => this.finishActiveWorldEvent(event) });
        },
      });
      return;
    }
    if (["vehicle_start", "coffee_spill", "delivery_boxes"].includes(event.kind)) {
      const title = event.kind === "vehicle_start" ? "TRY AGAIN" : event.kind === "coffee_spill" ? "Napkin rescue" : "WOBBLE METER";
      const hint = event.kind === "vehicle_start" ? "Hit all three timing zones to start the very fictional vehicle." : event.kind === "coffee_spill" ? "Catch two bright moments. No stain anxiety." : "Balance the top box through three gentle corrections.";
      uiEvents.emit("minigame", { kind: "timing", title, hint, taps: event.kind === "coffee_spill" ? 2 : 3, onDone: () => this.finishActiveWorldEvent(event) });
      return;
    }
    if (event.kind === "cat_box") {
      this.finishActiveWorldEvent(event);
      return;
    }
    if (event.kind === "cat_snack") {
      this.finishActiveWorldEvent(event);
      return;
    }
    if (event.kind === "cat_friend") {
      const x = this.ambientObjects.find((object): object is Phaser.GameObjects.Container => object instanceof Phaser.GameObjects.Container)?.x ?? this.player.x + 20;
      this.spawnCat(x, this.player.y + 4);
      this.time.delayedCall(15000, () => { this.followingCat?.destroy(); this.followingCat = undefined; });
      this.finishActiveWorldEvent(event);
      return;
    }
    this.finishActiveWorldEvent(event);
  }

  private finishActiveWorldEvent(event: WorldEventDefinition, lines = event.completionLines) {
    if (this.activeWorldEvent?.id !== event.id) return;
    const x = this.ambientObjects.find((object): object is Phaser.GameObjects.Container => object instanceof Phaser.GameObjects.Container)?.x ?? this.player.x;
    const y = this.ambientObjects.find((object): object is Phaser.GameObjects.Container => object instanceof Phaser.GameObjects.Container)?.y ?? this.player.y;
    finishWorldEvent(event);
    worldSparkles(this, x, y - 12, event.kind.startsWith("cat") ? "♥" : "✦");
    this.clearWorldEvent();
    uiEvents.emit("dialogue", event.title, lines);
  }

  private spawnRainEvent(event: WorldEventDefinition) {
    this.timeWash?.setFillStyle(0x6e86a8, 0.24);
    for (let i = 0; i < 34; i += 1) {
      const drop = this.add.text(Phaser.Math.Between(0, this.scale.gameSize.width), Phaser.Math.Between(-30, this.scale.gameSize.height), "|", { fontFamily: "monospace", fontSize: "10px", color: "#dff3ff", resolution: 2 }).setScrollFactor(0).setDepth(60).setAlpha(0.72);
      this.ambientObjects.push(drop);
      this.tweens.add({ targets: drop, x: drop.x - 55, y: this.scale.gameSize.height + 40, duration: Phaser.Math.Between(1200, 2100), delay: Phaser.Math.Between(0, 1000), repeat: 6 });
    }
    this.npcs.slice(0, 5).forEach((npc, index) => {
      const umbrella = this.add.text(npc.x, npc.y - 38, "☂", { fontFamily: "monospace", fontSize: "22px", color: index === 0 ? "#e46d94" : "#8ecae6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setDepth(npc.y + 5);
      this.ambientObjects.push(umbrella);
      if (index === 0) this.tweens.add({ targets: umbrella, angle: 180, duration: 700, delay: 1900, yoyo: true, repeat: 1 });
    });
    store.toast("Rain! Umbrellas are making decisions.", "#bfe6ff");
    this.time.delayedCall(10500, () => {
      if (this.activeWorldEvent?.id !== event.id) return;
      finishWorldEvent(event);
      this.clearWorldEvent();
      this.applyAtmosphere();
      store.toast("The rain wanders off.", "#bfe6ff");
    });
  }

  private clearWorldEvent() {
    for (const it of this.ambientInteractables) this.interactables = this.interactables.filter((candidate) => candidate !== it);
    for (const object of this.ambientObjects) if (object.active) object.destroy();
    this.ambientObjects = [];
    this.ambientInteractables = [];
    this.movingAmbient = [];
    this.activeWorldEvent = undefined;
    if (this.currentPrompt && !this.interactables.includes(this.currentPrompt)) {
      this.currentPrompt = null;
      uiEvents.emit("prompt", null);
    }
  }

  private checkMapEdge() {
    if (this.time.now < this.arriveAt) return;
    const loc = getLocation(this.locationId);
    const pad = 10;
    if (this.player.y < pad && loc.exits?.north) this.goDistrict(loc.exits.north, "south");
    else if (this.player.y > this.worldH - pad && loc.exits?.south) this.goDistrict(loc.exits.south, "north");
    else if (this.player.x < pad && loc.exits?.west) this.goDistrict(loc.exits.west, "east");
    else if (this.player.x > this.worldW - pad && loc.exits?.east) this.goDistrict(loc.exits.east, "west");
  }

  private setupMinimap(def: ReturnType<typeof getLocation>) {
    fillCityMinimap(def.id, this.player.x, this.player.y, this.player.facing);
  }

  private syncMinimap() {
    minimap.px = minimap.ox + this.player.x;
    minimap.py = minimap.oy + this.player.y;
    minimap.facing = this.player.facing;
  }
}
