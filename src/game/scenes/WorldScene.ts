import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { districtsOf, getLocation, type Cardinal } from "../data/locations";
import { NPCS } from "../data/npcs";
import { Player } from "../objects/Player";
import { NPC } from "../objects/NPC";
import { generateWorld, blockedToRects, type WorldData } from "../worldgen";
import { store } from "../systems/store";
import { controls, uiEvents, minimap } from "../systems/controls";
import * as quests from "../systems/quests";
import { fillCityMinimap } from "../systems/minimapAtlas";
import { npcInLocation, npcWorldPos, linesFor, skyHex, homeComment } from "../systems/life";
import { tryDeliverMessages } from "../systems/phone";
import { pickEncounter, applyEncounter } from "../systems/encounters";
import { secretsFor } from "../data/secrets";
import { applyVisual, getVisualTexture } from "../visual/assets";
import { CameraRig } from "../visual/cameraRig";
import { HD_GLOW, HD_WATER } from "../visual/hdManifest";
import { isHd, isHdSlice } from "../visual/mode";
import { FONT_UI, LIGHT } from "../visual/theme";

interface Interactable {
  x: number;
  y: number;
  radius: number;
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
  private transitioning = false;
  private driveMenu?: Phaser.GameObjects.Container;
  private worldW = 0;
  private worldH = 0;
  private timeAcc = 0;
  private followingCat?: Phaser.GameObjects.Image;
  private timeWash?: Phaser.GameObjects.Rectangle;
  private jeepSpot: Interactable | null = null;
  private jeepReadyAt = 0;
  private arriveAt = 0;
  private camRig?: CameraRig;
  private waterFx: Phaser.GameObjects.TileSprite[] = [];
  private nightLights: Phaser.GameObjects.Image[] = [];
  private pollen?: Phaser.GameObjects.Particles.ParticleEmitter;
  private landmarkSpot?: { id: string; x: number; y: number };

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
    this.jeepSpot = null;
    this.driveMenu = undefined;
    this.timeWash = undefined;
    this.followingCat = undefined;
    this.camRig = undefined;
    this.waterFx = [];
    this.nightLights = [];
    this.pollen = undefined;
    this.landmarkSpot = undefined;
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
    store.setLocation(def.id);
    store.unlockLocation(def.cityId);
    store.unlockLocation(def.id);

    const world = generateWorld(this, def);
    this.worldW = world.w * TILE;
    this.worldH = world.h * TILE;

    this.cameras.main.setBackgroundColor(skyHex());
    this.cameras.main.setRoundPixels(!isHd());
    this.applyAtmosphere();
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.drawGround(world);
    this.buildCollision(world);
    this.buildProps(world);
    this.buildLabels(world);
    this.buildCollectibles(world);
    this.buildNpcs(world);

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
    this.player = new Player(this, spawn.x, spawn.y, "char_her");
    this.player.setDepth(spawn.y);
    this.baseSpeed = this.player.speed;

    this.physics.add.collider(this.player, this.solids);

    for (const z of world.zones) {
      if (z.action === "drive") continue;
      this.addZoneInteractable(z);
    }
    this.placeFollowJeep(spawn.x, spawn.y, data.driving ?? store.state.inJeep);
    this.placeSecrets();

    this.setupMinimap(def);

    this.camRig = new CameraRig(this, this.cameras.main, this.player.x, this.player.y);
    this.spawnAmbient();
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    }
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.openMap, this);

    if (this.scene.isActive(SceneKeys.Title)) this.scene.stop(SceneKeys.Title);
    if (this.scene.isActive(SceneKeys.Preload)) this.scene.stop(SceneKeys.Preload);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);

    quests.onVisit(def.id);
    quests.onVisit(def.cityId);
    tryDeliverMessages({ wake: store.state.messages.length === 0, limit: 1 });
    uiEvents.emit("locationTitle", def.name, def.subtitle);
    this.time.delayedCall(700, () => {
      if (!this.sys.isActive() || this.transitioning) return;
      this.maybeEncounter();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private solids!: Phaser.Physics.Arcade.StaticGroup;

  private drawGround(world: WorldData) {
    if (isHdSlice(this.locationId)) {
      this.drawYasGround(world);
      return;
    }
    const rt = this.add.renderTexture(0, 0, world.w * TILE, world.h * TILE);
    rt.setOrigin(0, 0).setDepth(Depths.ground);
    rt.beginDraw();
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const key = world.ground[y][x];
        if (this.textures.exists(key)) rt.batchDraw(key, x * TILE, y * TILE);
      }
    }
    rt.endDraw();
    this.layWater(world, []);
  }

  private drawYasGround(world: WorldData) {
    const ww = world.w * TILE;
    const wh = world.h * TILE;
    if (this.textures.exists("hd_grass_big")) {
      this.add
        .tileSprite(0, 0, ww, wh, "hd_grass_big")
        .setOrigin(0, 0)
        .setDepth(Depths.ground)
        .setTileScale(1.85, 1.85);
    }

    const water: { x: number; y: number }[] = [];
    const rt = this.add.renderTexture(0, 0, ww, wh);
    rt.setOrigin(0, 0).setDepth(Depths.ground + 1);
    const stamp = this.add.image(0, 0, "hd_road").setVisible(false).setOrigin(0);

    const grass = new Set(["t_grass", "t_grass2", "t_lawn", "t_golf"]);
    const road = new Set(["t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_parking"]);
    const pave = new Set(["t_paving_light", "t_pavement", "t_paving_dark", "t_path", "t_brick_path", "t_plaza_stone", "t_cobble"]);

    rt.beginDraw();
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const key = world.ground[y][x];
        if (key.startsWith("t_water")) {
          water.push({ x, y });
          continue;
        }
        if (grass.has(key)) continue;
        const src = road.has(key) ? "hd_road" : pave.has(key) ? "hd_pavement" : key === "t_sand" ? "hd_sand" : "";
        const wx = x * TILE;
        const wy = y * TILE;
        if (src && this.textures.exists(src)) {
          this.stampSlice(rt, stamp, src, wx, wy);
        } else if (this.textures.exists(key)) {
          rt.batchDraw(key, wx, wy);
        }
      }
    }
    rt.endDraw();
    stamp.destroy();

    this.layWater(world, water);
    this.scatterYasDecals(world);
  }

  private stampSlice(
    rt: Phaser.GameObjects.RenderTexture,
    stamp: Phaser.GameObjects.Image,
    key: string,
    wx: number,
    wy: number,
  ) {
    const img = this.textures.get(key).getSourceImage() as { width?: number; height?: number };
    const sw = Math.max(TILE + 1, img.width ?? 256);
    const sh = Math.max(TILE + 1, img.height ?? 256);
    const sx = ((wx % (sw - TILE)) + (sw - TILE)) % (sw - TILE);
    const sy = ((wy % (sh - TILE)) + (sh - TILE)) % (sh - TILE);
    stamp.setTexture(key);
    stamp.setCrop(sx, sy, TILE, TILE);
    stamp.setDisplaySize(TILE, TILE);
    rt.batchDraw(stamp, wx, wy);
  }

  private scatterYasDecals(world: WorldData) {
    const grass = new Set(["t_grass", "t_grass2", "t_lawn", "t_golf"]);
    let n = 0;
    for (let y = 4; y < world.h - 4; y += 3) {
      for (let x = 4; x < world.w - 4; x += 5) {
        if (!grass.has(world.ground[y][x])) continue;
        const h = (x * 17 + y * 31) & 15;
        if (h > 4) continue;
        const px = x * TILE + 8;
        const py = y * TILE + 10;
        if (h === 0 && this.textures.exists("hd_flower_bed")) {
          this.add.image(px, py, "hd_flower_bed").setDisplaySize(28, 16).setOrigin(0.5, 1).setDepth(py - 4).setAlpha(0.95);
        } else if (h === 1 && this.textures.exists("hd_grass_tuft")) {
          this.add.image(px, py, "hd_grass_tuft").setDisplaySize(18, 12).setOrigin(0.5, 1).setDepth(py - 3).setAlpha(0.85);
        } else if (this.textures.exists("hd_grass_detail")) {
          this.add.image(px, py, "hd_grass_detail").setDisplaySize(22, 16).setOrigin(0.5, 0.7).setDepth(Depths.ground + 2).setAlpha(0.45);
        }
        n++;
        if (n > 80) return;
      }
    }
  }

  private layWater(world: WorldData, cells: { x: number; y: number }[]) {
    const loc = getLocation(this.locationId);
    const rects = loc.city?.water ?? [];
    const night = store.state.timeOfDay === "night";
    const layers = [
      { key: this.textures.exists(HD_WATER) ? HD_WATER : "t_water", a: night ? 0.82 : 0.9 },
      { key: this.textures.exists("hd_water_wave") ? "hd_water_wave" : "", a: 0.45 },
      { key: this.textures.exists("hd_water_shine") ? "hd_water_shine" : "", a: night ? 0.2 : 0.35 },
    ];
    const place = (x: number, y: number, w: number, h: number) => {
      for (const layer of layers) {
        if (!layer.key || !this.textures.exists(layer.key)) continue;
        const spr = this.add.tileSprite(x, y, w, h, layer.key).setOrigin(0, 0).setDepth(Depths.ground + 2).setAlpha(layer.a);
        if (night) spr.setTint(0x7aa0c8);
        this.waterFx.push(spr);
      }
      const shore = this.add.graphics().setDepth(Depths.ground + 3);
      shore.lineStyle(3, 0x2a6a50, 0.28);
      shore.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 8);
    };
    for (const r of rects) place(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
    if (!rects.length && cells.length && isHd()) {
      const spr = this.add.tileSprite(0, 0, 1, 1, layers[0].key).setVisible(false);
      this.waterFx.push(spr);
    }
    void world;
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

  private pickPropTex(tex: string, x: number, y: number) {
    const pick = (keys: string[]) => {
      const ready = keys.filter((k) => this.textures.exists(k));
      if (!ready.length) return getVisualTexture(this, tex);
      return ready[Math.abs((x * 13 + y * 7) | 0) % ready.length];
    };
    if (tex === "o_tree" || tex.startsWith("o_tree")) return pick(["hd__o_tree", "hd_tree_02", "hd_tree_03"]);
    if (tex === "o_palm") return pick(["hd__o_palm", "hd_palm_02"]);
    return getVisualTexture(this, tex);
  }

  private buildProps(world: WorldData) {
    const tod = store.state.timeOfDay;
    const night = tod === "night" || tod === "evening";
    const evening = tod === "evening";
    for (const p of world.props) {
      if (isHdSlice(this.locationId) && (p.tex === "o_flower_pink" || p.tex === "o_flower_yellow")) continue;
      const tex = this.pickPropTex(p.tex, p.x, p.y);
      if (!this.textures.exists(tex)) continue;
      const img = this.add.image(p.x, p.y, tex);
      applyVisual(img, p.tex);
      if (p.originX != null) img.setOrigin(p.originX, p.originY ?? img.originY);
      img.setDepth(p.y);

      if (isHd() && (p.tex.startsWith("b_") || p.tex.startsWith("o_tree") || p.tex === "o_palm" || p.tex.startsWith("v_"))) {
        const tree = p.tex.startsWith("o_tree") || p.tex === "o_palm";
        const building = p.tex.startsWith("b_");
        const shKey = tree && this.textures.exists("hd_shadow_tree") ? "hd_shadow_tree" : getVisualTexture(this, "o_shadow");
        const sh = this.add.image(p.x + (tree ? 6 : 0), p.y + 3, shKey);
        if (tree) sh.setDisplaySize(img.displayWidth * 0.85, 14);
        else if (building) sh.setDisplaySize(img.displayWidth * 0.7, 12);
        else sh.setDisplaySize(Math.max(18, img.displayWidth * 0.5), 8);
        sh.setAlpha(evening ? 0.42 : tod === "night" ? 0.18 : 0.26);
        sh.setDepth(p.y - 1);
      }
      if (night && (p.tex === "o_lamp" || p.tex === "o_lamp_ldn") && this.textures.exists(HD_GLOW)) {
        const glow = this.add.image(p.x, p.y - 20, HD_GLOW).setDepth(p.y + 2).setBlendMode(Phaser.BlendModes.ADD);
        glow.setDisplaySize(72, 72).setAlpha(tod === "night" ? 0.72 : 0.4);
        this.nightLights.push(glow);
      }
      if (night && p.tex.startsWith("b_") && this.textures.exists(HD_GLOW)) {
        const glow = this.add.image(p.x, p.y - img.displayHeight * 0.35, HD_GLOW).setDepth(p.y + 1).setBlendMode(Phaser.BlendModes.ADD);
        glow.setDisplaySize(56, 40).setAlpha(tod === "night" ? 0.38 : 0.18);
        this.nightLights.push(glow);
      }
      if (night && p.tex.startsWith("v_jeep") && this.textures.exists(HD_GLOW)) {
        const glow = this.add.image(p.x, p.y - 16, HD_GLOW).setDepth(p.y + 2).setBlendMode(Phaser.BlendModes.ADD);
        glow.setDisplaySize(28, 16).setAlpha(0.55);
        this.nightLights.push(glow);
      }
      if (p.tex === "b_mosque_acres") this.landmarkSpot = { id: "yas-mosque", x: p.x, y: p.y };
    }
    if (isHdSlice(this.locationId)) this.dressYas(world);
  }

  private dressYas(world: WorldData) {
    const home = world.props.find((p) => p.tex === "b_villa_terra2");
    if (home && this.textures.exists("hd_flower_bed")) {
      for (const [dx, dy] of [[-28, 8], [30, 6], [-8, 14]]) {
        this.add
          .image(home.x + dx, home.y + dy, "hd_flower_bed")
          .setDisplaySize(26, 15)
          .setOrigin(0.5, 1)
          .setDepth(home.y + dy - 2);
      }
    }
    if (home && this.textures.exists("hd__o_bench")) {
      this.add.image(home.x + 36, home.y + 10, "hd__o_bench").setDisplaySize(22, 12).setOrigin(0.5, 1).setDepth(home.y + 8);
    }
    const grove = [
      { x: world.spawn.x - 70, y: world.spawn.y - 20, k: "hd__o_palm" },
      { x: world.spawn.x + 86, y: world.spawn.y + 18, k: "hd_palm_02" },
      { x: world.spawn.x - 40, y: world.spawn.y + 46, k: "hd_tree_02" },
      { x: world.spawn.x + 54, y: world.spawn.y - 36, k: "hd_tree_03" },
    ];
    for (const g of grove) {
      if (!this.textures.exists(g.k)) continue;
      const img = this.add.image(g.x, g.y, g.k).setOrigin(0.5, 1).setDepth(g.y);
      img.setDisplaySize(g.k.includes("palm") ? 58 : 54, g.k.includes("palm") ? 100 : 80);
      if (this.textures.exists("hd_shadow_tree")) {
        this.add.image(g.x + 6, g.y + 2, "hd_shadow_tree").setDisplaySize(28, 12).setAlpha(0.28).setDepth(g.y - 1);
      }
    }
    void world;
  }

  private buildLabels(world: WorldData) {
    for (const l of world.labels) {
      this.add
        .text(l.x, l.y, l.text, {
          fontFamily: FONT_UI,
          fontSize: l.big ? "13px" : "10px",
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
      const img = this.add.image(c.x, c.y, c.tex).setOrigin(0.5, 0.9).setDepth(c.y);
      this.tweens.add({ targets: img, y: c.y - 2, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const it: Interactable = {
        x: c.x,
        y: c.y,
        radius: 16,
        prompt: "Pick this flower",
        trigger: () => {
          if (!store.collect(c.id)) return;
          img.destroy();
          this.interactables = this.interactables.filter((i) => i !== it);
          if (this.currentPrompt === it) this.currentPrompt = null;
          store.addCoins(1);
          store.addItem("flower");
          this.petalBurst(c.x, c.y);
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
      if (placed.has(def.id)) return;
      placed.add(def.id);
      const npc = new NPC(this, def);
      npc.place(x, y);
      this.npcs.push(npc);
      this.interactables.push({
        x,
        y,
        radius: 26,
        prompt: `Talk to ${def.name}`,
        trigger: () => {
          npc.faceTowards(this.player.x, this.player.y);
          store.state.lastPassenger = def.id;
          store.save();
          const lines = linesFor(def.id, def.dialogue);
          const extra = store.getRelationship(def.id) >= 20 ? homeComment() : null;
          const res = quests.onTalk(def.id, extra ? [...lines, extra] : lines);
          uiEvents.emit("dialogue", def.name, res.lines, { npcId: def.id });
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

  private addZoneInteractable(z: import("../worldgen").ZoneSpec) {
    if (z.action === "landmark") this.landmarkSpot = { id: `${this.locationId}:lm`, x: z.x, y: z.y };
    const trigger = () => {
      switch (z.action) {
        case "cafe":
          if (z.tag === "hudayriyat_trucks") {
            quests.onInteract("cafe");
            if (z.tag) quests.onInteract(z.tag);
            uiEvents.emit("dialogue", "Hudayriyat", ["Food trucks by the water. You drove out for this."]);
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
          uiEvents.emit("openShop");
          break;
        case "home":
          this.scene.start(SceneKeys.House, { title: getLocation(this.locationId).homeName ?? "Home", interior: "cream" });
          break;
        case "stairs": {
          const d = (z.data as { name?: string; tag?: string }) ?? {};
          const brown = d.tag === "well_court";
          if (z.tag) quests.onInteract(z.tag);
          uiEvents.emit("minigame", {
            kind: "stairs",
            title: d.name ?? "Stairs",
            hint: brown
              ? "Top floor. The stairs are so much. Tap to climb — or skip, she always gets tired."
              : "Stairs up to the lobby. Tap to climb, or skip.",
            taps: brown ? 14 : 8,
            skipLabel: brown ? "Skip — she's tired" : "Skip",
            onDone: () => {
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
          const buddyId = store.state.lastPassenger ?? "moomoo";
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
          if (d) uiEvents.emit("dialogue", d.name, [d.desc ?? d.name]);
          break;
        }
      }
    };
    if (z.action === "drive") {
      this.parkedJeep = this.add.image(z.x, z.y, getVisualTexture(this, "v_jeep_blue"));
      applyVisual(this.parkedJeep, "v_jeep_blue");
      this.parkedJeep.setDepth(z.y);
    }
    this.interactables.push({ x: z.x, y: z.y, radius: z.radius, prompt: z.prompt, trigger });
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
    if (this.jeepSpot) {
      this.jeepSpot.x = x;
      this.jeepSpot.y = y;
    }
  }

  private hopIn(opts?: { quiet?: boolean }) {
    if (this.driving) return;
    this.closeDriveMenu();
    this.driving = true;
    store.setInJeep(true);
    this.jeepReadyAt = this.time.now + 500;
    this.player.speed = this.baseSpeed * 2.8;
    this.player.setVisible(false);
    this.player.setAlpha(0);
    this.parkedJeep?.setVisible(false);
    this.rideJeep?.destroy();
    this.rideJeep = this.add.image(this.player.x, this.player.y, getVisualTexture(this, "v_jeep_blue"));
    applyVisual(this.rideJeep, "v_jeep_blue");
    this.rideJeep.setDepth(this.player.y + 1);
    if (!opts?.quiet) store.toast("Jeep time — hold a direction. A to hop out.", "#2f6fd0");
    uiEvents.emit("prompt", "A · hop out of the Jeep");
  }

  private hopOut() {
    if (!this.driving) return;
    this.driving = false;
    store.setInJeep(false);
    this.jeepReadyAt = this.time.now + 1000;
    this.player.speed = this.baseSpeed;
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.rideJeep?.destroy();
    this.rideJeep = undefined;
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
    const tod = store.state.timeOfDay;
    const pack = LIGHT[tod as keyof typeof LIGHT] ?? LIGHT.afternoon;
    const live = this.timeWash?.active && this.timeWash.scene;
    if (!live) {
      const { width, height } = this.scale.gameSize;
      this.timeWash = this.add.rectangle(0, 0, width, height, pack.wash, pack.washA).setOrigin(0).setScrollFactor(0).setDepth(48000);
    } else {
      this.timeWash!.setFillStyle(pack.wash, pack.washA);
    }
    for (const g of this.nightLights) g.setVisible(tod === "night" || tod === "evening");
  }

  private applyZoom() {
    const { width, height } = this.scale.gameSize;
    if (isHd()) {
      this.cameras.main.setZoom(Phaser.Math.Clamp(height / (36 * TILE), 1.55, 2.2));
    } else {
      this.cameras.main.setZoom(Phaser.Math.Clamp(height / (42 * TILE), 1.35, 2.15));
    }
    this.timeWash?.setSize(width, height);
    void width;
  }

  private spawnAmbient() {
    if (!isHd() || isHdSlice(this.locationId) || !this.textures.exists("o_flower_yellow")) return;
    this.pollen = this.add.particles(0, 0, "o_flower_yellow", {
      x: { min: 0, max: this.worldW },
      y: { min: 0, max: this.worldH },
      lifespan: 6000,
      speedY: { min: -8, max: -2 },
      speedX: { min: -6, max: 6 },
      scale: { start: 0.35, end: 0.1 },
      alpha: { start: 0.35, end: 0 },
      frequency: 420,
      quantity: 1,
      blendMode: "NORMAL",
    });
    this.pollen.setDepth(8);
  }

  private tryInteract() {
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
    minimap.on = false;
    this.closeDriveMenu();
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("openMap", this.openMap, this);
    this.scale.off("resize", this.applyZoom, this);
    this.pollen?.stop();
    this.pollen?.destroy();
  }

  update(time: number) {
    if (!this.player) return;

    let vx = 0;
    let vy = 0;
    if (!controls.locked && !this.transitioning) {
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
    this.player.move(vx * this.player.speed, vy * this.player.speed);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.camRig?.update(this.player.x, this.player.y, body.velocity.x, body.velocity.y);
    if (this.landmarkSpot) this.camRig?.maybeReveal(this.landmarkSpot.id, this.landmarkSpot.x, this.landmarkSpot.y, this.player.x, this.player.y);
    for (let i = 0; i < this.waterFx.length; i++) {
      const w = this.waterFx[i];
      const layer = i % 3;
      w.tilePositionX += layer === 0 ? 0.012 : layer === 1 ? 0.022 : 0.008;
      w.tilePositionY += layer === 0 ? 0.006 : layer === 1 ? 0.01 : 0.004;
    }

    if (this.rideJeep) {
      this.rideJeep.setPosition(this.player.x, this.player.y);
      this.rideJeep.setDepth(this.player.y + 2);
      this.rideJeep.setAngle(vx !== 0 ? vx * 8 : 0);
    }

    for (const npc of this.npcs) npc.update(time);

    if (!this.driving && !this.transitioning) {
      let best: Interactable | null = null;
      let bestD = Infinity;
      for (const it of this.interactables) {
        if (it === this.jeepSpot && time < this.jeepReadyAt) continue;
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
    }

    if (this.followingCat && this.player) {
      this.followingCat.x += (this.player.x - 14 - this.followingCat.x) * 0.04;
      this.followingCat.y += (this.player.y + 4 - this.followingCat.y) * 0.04;
      this.followingCat.setDepth(this.followingCat.y);
    }

    if (!this.transitioning && !controls.locked) {
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
      const p = this.add.image(x, y, i % 2 ? "o_flower_pink" : "o_flower_yellow").setScale(0.45).setDepth(y + 8);
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
      const img = this.add.image(x, y, tex).setOrigin(0.5, 0.9).setDepth(y).setScale(s.kind === "heart" ? 1.2 : 1);
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

  private maybeEncounter() {
    const e = pickEncounter(this.locationId);
    if (!e) return;
    applyEncounter(e);
    if (e.kind === "cat") this.spawnCat(this.player.x + 20, this.player.y);
    if (e.kind === "rain") this.timeWash?.setFillStyle(0x88a0c0, 0.22);
    uiEvents.emit("dialogue", e.title, e.lines);
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
