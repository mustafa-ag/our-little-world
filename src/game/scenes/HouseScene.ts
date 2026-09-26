import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { getLocation } from "../data/locations";
import { Player } from "../objects/Player";
import { store } from "../systems/store";
import { controls, uiEvents } from "../systems/controls";
import { tryDeliverMessages } from "../systems/phone";
import { homeComment } from "../systems/life";
import * as quests from "../systems/quests";
import type { PlacedFurniture } from "../systems/save";
import { createVisualShadow, getVisualAssetDef, getVisualTexture, type VisualShadowHandle } from "../visual";
import { NPC } from "../objects/NPC";
import { NPCS } from "../data/npcs";
import { stableDailyRoll } from "../systems/worldEvents";
import { souvenirById } from "../data/souvenirs";
import { propertyById } from "../data/properties";
import { ensurePropertyState, savePropertyState } from "../systems/properties";
import type { PropertyState } from "../systems/save";
import { BuildModeController } from "../systems/buildMode";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

export class HouseScene extends Phaser.Scene {
  private player!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private interactables: Interactable[] = [];
  private currentPrompt: Interactable | null = null;
  private lastInteract = 0;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private editing = false;
  private placed: { img: Phaser.GameObjects.Image; data: PlacedFurniture; shadow?: VisualShadowHandle }[] = [];
  private drag?: { img: Phaser.GameObjects.Image; data: PlacedFurniture; shadow?: VisualShadowHandle };
  private deliveryBoxes?: Phaser.GameObjects.Container;
  private homeCat?: Phaser.GameObjects.Image;
  private catInteractable?: Interactable;
  private homeTigor?: Phaser.GameObjects.Image;
  private tigorBowl?: Phaser.GameObjects.Ellipse;
  private tigorInteractable?: Interactable;
  private visitor?: NPC;
  private visitorInteractable?: Interactable;
  private cameraOverlay?: Phaser.GameObjects.Container;
  private cameraOffset = new Phaser.Math.Vector2();
  private cameraPose: "smile" | "peace" | "silly" | "hug" = "smile";
  private lastCameraCapture = 0;
  private roomW = 18;
  private roomH = 13;
  private propertyId = "starter_yas";
  private property!: PropertyState;
  private buildMode?: BuildModeController;
  private playerCollider?: Phaser.Physics.Arcade.Collider;

  constructor() {
    super(SceneKeys.House);
  }

  create(data: { title?: string; interior?: "cream" | "brown"; propertyId?: string; tour?: boolean } = {}) {
    this.interactables = [];
    this.homeCat = undefined;
    this.catInteractable = undefined;
    this.homeTigor = undefined;
    this.tigorBowl = undefined;
    this.tigorInteractable = undefined;
    this.visitor = undefined;
    this.visitorInteractable = undefined;
    this.cameraOverlay = undefined;
    this.cameraOffset.set(0, 0);
    controls.cameraMode = false;
    uiEvents.emit("prompt", null);
    this.propertyId = data.propertyId ?? store.state.primaryHomeId ?? "starter_yas";
    const propertyDef = propertyById(this.propertyId);
    this.property = ensurePropertyState(this.propertyId);
    this.property.visited = true;
    store.state.activeHomeId = this.propertyId;
    store.save();
    this.roomW = propertyDef.width;
    this.roomH = propertyDef.height;
    const worldW = this.roomW * TILE;
    const worldH = this.roomH * TILE;
    const brown = data.interior === "brown";
    const title = data.title ?? propertyDef.name ?? getLocation(store.state.currentLocation).homeName ?? "Home";

    this.cameras.main.setBackgroundColor(brown ? "#2a1810" : "#2b2233");
    this.physics.world.setBounds(TILE, TILE * 2, worldW - TILE * 2, worldH - TILE * 3);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // floor
    const rt = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0, 0).setDepth(Depths.ground);
    rt.beginDraw();
    for (let y = 0; y < this.roomH; y++)
      for (let x = 0; x < this.roomW; x++) rt.batchDraw(getVisualTexture(this, "t_wood"), x * TILE, y * TILE);
    rt.endDraw();
    this.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, propertyDef.floorTint, 0.12).setDepth(Depths.ground + 1);
    if (brown) {
      this.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, 0x4a3224, 0.35).setDepth(Depths.ground + 1);
    }

    // rug
    this.add.image(worldW / 2, worldH / 2 + 8, getVisualTexture(this, "f_rug")).setDepth(1);

    // walls (top band) + border collision
    const wall = this.add.graphics().setDepth(Depths.overlay - 1);
    wall.fillStyle(brown ? 0x6b4535 : propertyDef.wallColor, 1);
    wall.fillRect(0, 0, worldW, TILE * 2);
    wall.fillStyle(brown ? 0x5a382c : 0xd8c6b0, 1);
    wall.fillRect(0, TILE * 2 - 3, worldW, 3);
    // a cute window + picture on the wall
    this.add.image(TILE * 4, TILE * 1, getVisualTexture(this, "f_tv")).setScale(0).setVisible(false); // reserved
    const win = this.add.graphics().setDepth(Depths.overlay - 1);
    win.fillStyle(0xbfe6ff, 1).fillRect(TILE * 3, 6, 28, 20);
    win.fillStyle(0x8fbfe0, 1).fillRect(TILE * 3, 6, 28, 3);
    win.lineStyle(2, 0xa9744f).strokeRect(TILE * 3, 6, 28, 20);
    // heart picture + a little "Juju ❤ Moomoo" frame on the wall
    this.add.image(worldW - TILE * 4, TILE * 1 + 2, getVisualTexture(this, "ui_heart")).setScale(1.6).setDepth(Depths.overlay - 1);
    this.add
      .text(worldW - TILE * 4, TILE * 1 + 14, "Juju + Moomoo", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#e46d94",
        resolution: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(Depths.overlay - 1);

    this.drawMemoryCorner(worldW, brown);
    this.drawPropertyPersonality(propertyDef.theme, worldW, worldH);

    this.buildCollision();

    // starter + owned furniture
    this.add.image(TILE * 3, TILE * 4.5, getVisualTexture(this, "f_bed")).setOrigin(0.5, 1).setDepth(TILE * 4.5);
    createVisualShadow(this, TILE * 3, TILE * 4.5, getVisualAssetDef("f_bed")?.shadow, { directionX: 0.65, directionY: 0.4, castLength: 12, opacity: 0.18, ambient: 0.2, warmth: 0.5 });
    this.addFurnitureInteract(TILE * 3, TILE * 4.5 - 8, "Sleep (save & new day)", () => this.sleep());
    this.addFurnitureInteract(Math.min(worldW - TILE * 3, TILE * 14), TILE * 3.2, "Open Build Mode", () => this.openBuildMode());
    this.addFurnitureInteract(TILE * 7.4, TILE * 2.9, "Look at photo wall", () => uiEvents.emit("openPhone", "album"));
    this.addFurnitureInteract(TILE * 11.2, TILE * 2.9, "Look at keepsakes", () => uiEvents.emit("openPhone", "notes"));
    this.addHomeFeatures(worldW);
    this.drawSouvenirShelf(worldW);

    this.placed = [];
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.editing || !this.drag) return;
      const gx = Math.round(p.worldX / 8) * 8;
      const gy = Math.round(p.worldY / 8) * 8;
      this.drag.img.setPosition(gx, gy).setDepth(gy);
      this.drag.shadow?.setContactPoint(gx, gy);
      this.drag.data.x = gx;
      this.drag.data.y = gy;
      const furnitureIt = this.drag.img.getData("furnitureInteract") as Interactable | undefined;
      if (furnitureIt) {
        furnitureIt.x = gx;
        furnitureIt.y = gy - 5;
      }
    });
    this.input.on("pointerup", () => {
      if (this.drag) {
        this.savePlacedFurniture();
        this.drag = undefined;
      }
    });
    for (const f of this.property.furniture) this.spawnPlaced(f);
    store.on("furniturePlaced", this.onFurniturePlaced, this);
    this.buildDeliveryBoxes();

    const note = homeComment();
    if (note && store.getRelationship("moomoo") >= 10) {
      this.time.delayedCall(400, () => uiEvents.emit("dialogue", "Home", [note]));
    }

    // exit door (bottom centre)
    const doorX = worldW / 2;
    const doorY = worldH - TILE;
    const door = this.add.graphics().setDepth(2);
    door.fillStyle(0x7a5238, 1).fillRect(doorX - TILE, doorY - TILE * 1.5, TILE * 2, TILE * 1.5);
    door.fillStyle(0xf4c95d, 1).fillRect(doorX + TILE - 5, doorY - TILE, 2, 2);
    this.interactables.push({
      x: doorX,
      y: doorY - 6,
      radius: 22,
      prompt: "Go outside",
      trigger: () => this.exitHouse(),
    });

    // player
    this.player = new Player(this, doorX, doorY - TILE * 2, getVisualTexture(this, "char_her"));
    this.playerCollider = this.physics.add.collider(this.player, this.solids);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E,ESC") as Record<string, Phaser.Input.Keyboard.Key>;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("debugLife") === "home") this.time.delayedCall(300, () => this.openBuildMode());
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.openMap, this);
    uiEvents.on("cameraStart", this.startCamera, this);
    uiEvents.on("cameraExit", this.exitCameraMode, this);
    store.on("petChanged", this.refreshHomeTigor, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("locationTitle", title, data.tour && !this.property.owned ? "PROPERTY TOUR · walk, build-preview, then buy from Homes" : `${propertyDef.location} · ${propertyDef.type}`);
    if (data.tour) {
      const reactions: Record<string, string> = {
        dubailand_2br: "This kitchen is dangerous. You know we're buying six mugs.",
        damac_hills_2br: "The sofa location has already been decided apparently.",
        downtown_apartment: "You saw the skyline. It's over. We live here now.",
        damac_hills_villa: "There are enough rooms for you to move the sofa into a different one every week.",
        positano_home: "You saw the balcony. It's over. We live here now.",
        santorini_villa: "Blue door, sea view, twelve stairs. I accept the terms.",
      };
      this.time.delayedCall(650, () => uiEvents.emit("dialogue", store.state.relationshipStage === "married" ? "Moomoo" : "Property viewing", [reactions[this.propertyId] ?? "Walk around. Big decisions deserve a real look.", "Buy it later from Phone › Homes, or keep saving."]));
    }
    if (this.property.owned && store.hasFlag(`moving_day_${this.propertyId}`)) this.time.delayedCall(900, () => this.playMovingDay());

    if (!brown) {
      if (store.state.cat.adopted) this.spawnHomeCat();
      else if (store.state.cat.stage >= 3 && store.state.cat.lastSeenDay < store.state.currentDay) this.spawnAdoptionMoment();
      if (store.state.tigor.unlocked && store.state.tigor.atHome) this.spawnHomeTigor();
      this.time.delayedCall(850, () => store.state.relationshipStage === "married" ? this.spawnMarriedMoomoo() : this.maybeWelcomeVisitor());
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const placed of this.placed) placed.shadow?.destroy();
      uiEvents.off("action", this.tryInteract, this);
      uiEvents.off("openMap", this.openMap, this);
      uiEvents.off("cameraStart", this.startCamera, this);
      uiEvents.off("cameraExit", this.exitCameraMode, this);
      this.exitCameraMode();
      this.visitor?.destroy();
      this.scale.off("resize", this.applyZoom, this);
      this.input.off("pointermove");
      this.input.off("pointerup");
      store.off("furniturePlaced", this.onFurniturePlaced, this);
      store.off("petChanged", this.refreshHomeTigor, this);
      this.buildMode?.destroy();
      this.playerCollider?.destroy();
    });
  }

  private savePlacedFurniture() {
    this.property.furniture = this.placed.map((piece) => piece.data);
    savePropertyState(this.propertyId, this.property);
  }

  private drawPropertyPersonality(theme: import("../data/properties").PropertyTheme, worldW: number, worldH: number) {
    const accents: Record<typeof theme, { color: number; label: string; detail: string }> = {
      yas: { color: 0x7bc86c, label: "YAS MORNING", detail: "palm light" },
      dubailand: { color: 0xd79b6d, label: "WARM MODERN", detail: "two rooms, six mugs" },
      damac: { color: 0x82a978, label: "HILLS GREEN", detail: "garden view" },
      downtown: { color: 0x486fa8, label: "CITY LIGHTS", detail: "skyline balcony" },
      villa: { color: 0xc6a85b, label: "GARDEN VILLA", detail: "room to grow" },
      positano: { color: 0xf0b84a, label: "POSITANO", detail: "lemon terrace" },
      santorini: { color: 0x3d82b8, label: "SANTORINI", detail: "blue door, sea light" },
    };
    const accent = accents[theme];
    this.add.rectangle(worldW - 42, TILE * 1.05, 58, 20, theme === "downtown" ? 0x263653 : 0xbfe6ff).setDepth(Depths.overlay - 1).setStrokeStyle(2, accent.color);
    this.add.text(worldW - 42, TILE * 1.05, theme === "downtown" ? "▥ ▥ ▥" : theme === "positano" || theme === "santorini" ? "≈  ☀" : "♧  ♧", { fontFamily: "monospace", fontSize: "8px", color: theme === "downtown" ? "#f4c95d" : "#2f6fd0", resolution: 2 }).setOrigin(0.5).setDepth(Depths.overlay);
    this.add.rectangle(TILE * 1.2, worldH / 2, 5, worldH - TILE * 5, accent.color, 0.55).setDepth(2);
    this.add.text(TILE * 1.65, worldH - TILE * 2.4, `${accent.label}\n${accent.detail}`, { fontFamily: "monospace", fontSize: "7px", color: "#7a6a5a", resolution: 2 }).setOrigin(0, 1).setDepth(4);
  }

  private openBuildMode() {
    if (this.buildMode) return;
    this.editing = true;
    controls.locked = true;
    this.buildMode = new BuildModeController(this, {
      widthCells: this.roomW,
      heightCells: this.roomH,
      layout: this.property.layout,
      onLayoutChanged: (layout) => {
        this.property.layout = layout;
        savePropertyState(this.propertyId, this.property);
        this.rebuildCollision();
      },
      onFurniturePlaced: (piece) => {
        this.spawnPlaced(piece);
        this.savePlacedFurniture();
      },
      onFurnitureBreak: (x, y, storeIt) => {
        const nearest = this.placed.map((piece) => ({ piece, distance: Phaser.Math.Distance.Between(x, y, piece.img.x, piece.img.y) })).sort((a, b) => a.distance - b.distance)[0];
        if (!nearest || nearest.distance > 18) return false;
        if (storeIt) this.property.storedFurniture.push(nearest.piece.data.tex);
        nearest.piece.shadow?.destroy();
        nearest.piece.img.destroy();
        this.placed = this.placed.filter((piece) => piece !== nearest.piece);
        this.savePlacedFurniture();
        return true;
      },
      storedCount: (texture) => this.property.storedFurniture.filter((id) => id === texture).length,
      takeStored: (texture) => {
        const index = this.property.storedFurniture.indexOf(texture);
        if (index < 0) return false;
        this.property.storedFurniture.splice(index, 1);
        savePropertyState(this.propertyId, this.property);
        return true;
      },
      onExit: () => {
        this.editing = false;
        controls.locked = false;
        this.buildMode = undefined;
        quests.onDecorate("home");
        store.incrementStat("rooms_redesigned");
        store.toast("Build saved. This room has a new personality.", "#f4a6c0");
      },
    });
    this.buildMode.open();
    store.toast("BUILD MODE · select, preview, place or break", "#f4c95d");
  }

  private spawnMarriedMoomoo() {
    if (store.state.activeCompanionId === "moomoo" || this.visitor) return;
    const def = NPCS.find((npc) => npc.id === "moomoo");
    if (!def) return;
    const spots = {
      morning: { x: TILE * 7, y: TILE * 5, routine: "tea" },
      afternoon: { x: TILE * 11, y: TILE * 7, routine: "computer" },
      evening: { x: TILE * 9, y: TILE * 8, routine: "sit" },
      night: { x: TILE * 4, y: TILE * 5, routine: "look" },
    }[store.state.timeOfDay];
    this.visitor = new NPC(this, def);
    this.visitor.place(spots.x, spots.y).startRoutine(spots.routine, 10);
    this.visitorInteractable = this.addFurnitureInteract(spots.x, spots.y, 28, "Spend time with Moomoo", () => {
      uiEvents.emit("choice", { title: "Moomoo · at home", prompt: "A normal little married moment.", choices: [{ id: "hug", label: "Hug" }, { id: "coffee", label: "Make coffee" }, { id: "sofa", label: "Sit together" }, { id: "home", label: "Talk about the home" }], onChoose: (id: string) => this.finishVisitorHangout("moomoo", id) });
    });
  }

  private playMovingDay() {
    store.setFlag(`moving_day_${this.propertyId}`, false);
    const box = this.add.container(this.roomW * TILE / 2, this.roomH * TILE / 2).setDepth(8000);
    box.add([this.add.rectangle(-24, 0, 38, 30, 0xc98d55).setStrokeStyle(3, 0x7a5238), this.add.rectangle(20, 5, 30, 25, 0xdca66f).setStrokeStyle(3, 0x7a5238), this.add.text(0, -28, "MUGS? / CABLES? / PROBABLY", { fontFamily: "monospace", fontSize: "8px", color: "#3a2b3a", backgroundColor: "#fff4e6", padding: { x: 4, y: 2 }, resolution: 2 }).setOrigin(0.5)]);
    this.tweens.add({ targets: box, y: box.y - 8, duration: 620, yoyo: true, repeat: 2, ease: "Sine.inOut", onComplete: () => box.destroy(true) });
    uiEvents.emit("dialogue", "MOVING DAY", ["Moomoo carries one box sideways. The label says THIS WAY UP.", "Juju: Why is it making that sound?", "Moomoo: New-home sound.", "The empty rooms are theirs to build."]);
    store.incrementStat("moving_days");
    store.capturePhoto({ id: `moving_${this.propertyId}_${store.state.currentDay}`, title: "First day in a new home", locationId: store.state.currentLocation, day: store.state.currentDay, timeOfDay: store.state.timeOfDay, companionId: store.state.relationshipStage === "married" ? "moomoo" : undefined, participantIds: store.state.relationshipStage === "married" ? ["moomoo"] : [], pose: "silly", frame: "hearts", caption: "Boxes, keys and one completely unidentified sound." });
  }

  private spawnPlaced(f: PlacedFurniture) {
    const img = this.add.image(f.x, f.y, getVisualTexture(this, f.tex)).setOrigin(0.5, 1).setDepth(f.y);
    const shadow = createVisualShadow(this, f.x, f.y, getVisualAssetDef(f.tex)?.shadow, { directionX: 0.65, directionY: 0.4, castLength: 12, opacity: 0.18, ambient: 0.2, warmth: 0.5 });
    img.once("destroy", () => shadow?.destroy());
    if (f.rot) img.setFlipX(true);
    img.setInteractive({ draggable: true, useHandCursor: true });
    img.on("pointerdown", () => {
      if (!this.editing) return;
      if (this.drag?.img === img) {
        f.rot = f.rot ? 0 : 1;
        img.setFlipX(!!f.rot);
        this.savePlacedFurniture();
        return;
      }
      this.drag = { img, data: f, shadow };
    });
    this.placed.push({ img, data: f, shadow });
    if (f.tex === "f_sofa") {
      const it = this.addFurnitureInteract(f.x, f.y - 5, "Sit on the sofa", () => this.enjoyHome("sofa", img));
      img.setData("furnitureInteract", it);
    }
    if (f.tex === "f_plant") {
      const it = this.addFurnitureInteract(f.x, f.y - 4, "Water the plant", () => this.enjoyHome("plant", img));
      img.setData("furnitureInteract", it);
    }
  }

  private onFurniturePlaced(f: PlacedFurniture) {
    if (!this.sys.isActive()) return;
    this.spawnPlaced(f);
    this.buildDeliveryBoxes();
  }

  private buildDeliveryBoxes() {
    if (this.deliveryBoxes || store.hasFlag("home_delivery_unboxed")) return;
    if (!this.property.furniture.some((f) => f.tex === "f_sofa") || !this.property.furniture.some((f) => f.tex === "f_plant")) return;
    const x = TILE * 9;
    const y = TILE * 9.2;
    const big = this.add.rectangle(-18, 0, 38, 34, 0xc98d55).setStrokeStyle(3, 0x7a5238);
    const small = this.add.rectangle(23, 7, 28, 25, 0xdca66f).setStrokeStyle(3, 0x7a5238);
    const tape = this.add.rectangle(-18, 0, 6, 34, 0xf4d39a);
    const label = this.add.text(0, -28, "JUJU'S NEW THINGS", { fontFamily: "monospace", fontSize: "8px", color: "#3a2b3a", backgroundColor: "#fff4e6", padding: { x: 4, y: 2 }, resolution: 2 }).setOrigin(0.5);
    this.deliveryBoxes = this.add.container(x, y, [big, small, tape, label]).setDepth(y + 2);
    const unboxIt = this.addFurnitureInteract(x, y, 38, "Unbox the deliveries", () => {
      if (!this.deliveryBoxes) return;
      store.setFlag("home_delivery_unboxed");
      const box = this.deliveryBoxes;
      this.deliveryBoxes = undefined;
      this.interactables = this.interactables.filter((it) => it !== unboxIt);
      this.tweens.add({ targets: box, y: y - 14, scale: 1.18, alpha: 0, angle: 4, duration: 480, ease: "Back.in", onComplete: () => box.destroy(true) });
      store.toast("Sofa and plant unboxed ✦", "#7be0a3");
    });
  }

  private enjoyHome(kind: "sofa" | "plant", img: Phaser.GameObjects.Image) {
    if (kind === "sofa") {
      this.player.setPosition(img.x, img.y - 5);
      this.player.move(0, 0);
      this.player.setScale(1.05);
      this.tweens.add({ targets: this.player, y: this.player.y + 3, duration: 260, ease: "Sine.out" });
    } else {
      store.incrementStat("plant_inspections");
      const water = this.add.text(this.player.x, this.player.y - 20, "⋰ ⋰  ♡", { fontFamily: "monospace", fontSize: "13px", color: "#63c6e8", stroke: "#3a2b3a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(this.player.y + 8);
      this.tweens.add({ targets: water, x: img.x, y: img.y - 15, alpha: 0, duration: 800, onComplete: () => water.destroy() });
      this.tweens.add({ targets: img, scaleX: 1.12, scaleY: 1.12, duration: 200, yoyo: true, repeat: 2, ease: "Sine.inOut" });
    }
    const done = quests.onInteract("home_enjoy");
    store.setDaily(`home_${kind}`);
    const catLine = store.state.cat.adopted ? `${store.state.cat.name} jumps up beside her, circles once, and claims most of the cushion.` : undefined;
    const plantSecret = kind === "plant" && store.getStat("plant_inspections") === 5 ? "Plant: ...\nJuju: I know you're hiding something." : undefined;
    uiEvents.emit("dialogue", "Home", kind === "sofa"
      ? ["Juju sinks into the sofa. Nothing needs solving for a minute.", ...(catLine ? [catLine] : []), "The room is quiet. The plant is green. It feels like hers.", done?.complete ?? "Home."]
      : ["A little water. One new leaf. The whole room seems to exhale.", ...(plantSecret ? [plantSecret] : []), "Nothing dramatic happens—and that is exactly the point.", done?.complete ?? "Home."]);
  }

  private addHomeFeatures(worldW: number) {
    const tv = this.add.image(TILE * 12.7, TILE * 3.35, getVisualTexture(this, "f_tv")).setOrigin(0.5, 1).setDepth(TILE * 3.35);
    this.addFurnitureInteract(tv.x, tv.y - 4, "Watch TV", () => {
      const programs = ["DUBAI WEATHER: HOT", "TINY HOME MAKEOVERS", "PIGEON COURT", "THE GREAT BRITISH KETTLE", "CEO OF SNACKS"];
      let program = programs[(store.state.currentDay + store.getStat("tv_channels")) % programs.length];
      if (store.hasMemory("mem_great_white") && program === "PIGEON COURT") program = "SHARK WEEK";
      store.incrementStat("tv_channels");
      uiEvents.emit("dialogue", "TV", [program, program === "SHARK WEEK" ? "Juju changes the channel immediately." : "The remote disappears beneath one cushion. As tradition demands."]);
    });

    const fridge = this.add.image(worldW - TILE * 2.2, TILE * 5.1, getVisualTexture(this, "f_fridge")).setOrigin(0.5, 1).setDepth(TILE * 5.1);
    this.addFurnitureInteract(fridge.x, fridge.y - 6, "Get a snack", () => {
      if (!store.hasDaily("home_snack")) {
        store.setDaily("home_snack");
        store.addItem("chocolate");
      }
      uiEvents.emit("dialogue", "Fridge", ["Snack acquired.", "No hunger meter. Just excellent timing."]);
    });

    const coffee = this.add.image(TILE * 6.1, TILE * 4.2, getVisualTexture(this, "f_table")).setOrigin(0.5, 1).setDepth(TILE * 4.2);
    this.addFurnitureInteract(coffee.x, coffee.y - 5, "Make coffee", () => uiEvents.emit("minigame", {
      kind: "coffee", title: "Home coffee", hint: "Cup, espresso, milk, lid. No commute required.", skipLabel: "Later",
      onDone: (ok?: boolean) => {
        if (!ok) return;
        store.addItem("coffee");
        store.incrementStat("perfect_coffees");
        uiEvents.emit("dialogue", "Kitchen", ["Coffee made. The house smells awake."]);
      },
    }));

    const wardrobe = this.add.text(TILE * 2.1, TILE * 7.2, "WARDROBE", { fontFamily: "monospace", fontSize: "8px", color: "#fff4e6", backgroundColor: "#a06de2", padding: { x: 5, y: 8 }, resolution: 2 }).setOrigin(0.5).setDepth(TILE * 7.2);
    this.addFurnitureInteract(wardrobe.x, wardrobe.y, "Change outfit", () => uiEvents.emit("openWardrobe"));
  }

  private drawMemoryCorner(worldW: number, brown: boolean) {
    const wallY = TILE * 1.15;
    const frameColor = brown ? 0xd6a66f : 0xa9744f;
    const photos = Object.values(store.state.photos).slice(0, 3);
    for (let index = 0; index < 3; index += 1) {
      const x = TILE * (6.5 + index * 1.1);
      const hasPhoto = photos[index];
      const frame = this.add.rectangle(x, wallY, 15, 18, 0xfff9ef).setStrokeStyle(2, frameColor).setDepth(Depths.overlay - 1);
      this.add.text(x, wallY - 1, hasPhoto ? "♥" : "·", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: hasPhoto ? "#e46d94" : "#a08a70",
        resolution: 2,
      }).setOrigin(0.5).setDepth(Depths.overlay);
      frame.setData("photo", hasPhoto?.id);
    }
    this.add.text(TILE * 7.6, TILE * 1.72, "little moments", {
      fontFamily: "monospace",
      fontSize: "7px",
      color: brown ? "#f4d7bf" : "#7a6a5a",
      resolution: 2,
    }).setOrigin(0.5).setDepth(Depths.overlay);

    const shelfX = worldW - TILE * 6.2;
    const shelfY = TILE * 1.7;
    const shelf = this.add.rectangle(shelfX, shelfY, TILE * 2.4, 3, frameColor).setDepth(Depths.overlay - 1);
    shelf.setData("keepsakes", true);
    const count = store.state.keepsakes.length;
    this.add.text(shelfX, shelfY - 8, count ? "✦".repeat(Math.min(count, 4)) : "...", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: count ? "#f4c95d" : "#a08a70",
      resolution: 2,
    }).setOrigin(0.5).setDepth(Depths.overlay);
  }

  private drawSouvenirShelf(worldW: number) {
    const shown = store.state.displayedSouvenirs.map(souvenirById).filter((souvenir): souvenir is NonNullable<typeof souvenir> => !!souvenir);
    const shelfX = worldW - TILE * 6.2;
    const shelfY = TILE * 1.42;
    shown.forEach((souvenir, index) => {
      const x = shelfX - ((shown.length - 1) * 9) / 2 + index * 9;
      const icon = this.add.text(x, shelfY, souvenir.icon, { fontFamily: "monospace", fontSize: "8px", color: "#f4c95d", stroke: "#3a2b3a", strokeThickness: 1, resolution: 2 }).setOrigin(0.5, 1).setDepth(Depths.overlay);
      this.addFurnitureInteract(icon.x, TILE * 2.55, 13, `Remember ${souvenir.name}`, () => uiEvents.emit("dialogue", souvenir.name, [souvenir.caption]));
    });
    this.addFurnitureInteract(shelfX, TILE * 2.85, 24, "Arrange souvenir shelf", () => {
      const owned = store.state.souvenirs.map(souvenirById).filter((souvenir): souvenir is NonNullable<typeof souvenir> => !!souvenir);
      if (!owned.length) {
        uiEvents.emit("dialogue", "Souvenir shelf", ["Empty for now. Every city has something small to bring home."]);
        return;
      }
      uiEvents.emit("choice", {
        title: "Souvenir shelf",
        prompt: "Choose one to display or put away. Up to five fit without shelf engineering.",
        choices: owned.slice(0, 4).map((souvenir) => ({ id: souvenir.id, label: `${store.state.displayedSouvenirs.includes(souvenir.id) ? "✓" : "+"} ${souvenir.name}` })),
        onChoose: (id: string) => {
          const displayed = store.toggleSouvenirDisplay(id);
          store.toast(displayed ? "Placed on the shelf" : "Put safely away", "#f4c95d");
          uiEvents.emit("dialogue", souvenirById(id)?.name ?? "Souvenir", [souvenirById(id)?.caption ?? "A little trip, kept.", "The shelf will look right next time you enter the room."]);
        },
      });
    });
  }

  private spawnAdoptionMoment() {
    const x = TILE * 10.8;
    const y = TILE * 10.6;
    const cat = this.add.image(x, y, getVisualTexture(this, "o_cat")).setOrigin(0.5, 1).setDepth(y).setScale(0.92);
    this.tweens.add({ targets: cat, y: y - 2, duration: 760, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const it = this.addFurnitureInteract(x, y, 24, "Let the familiar cat in", () => {
      if (!store.adoptCat()) return;
      store.unlockMemory("mem_cat_roommate");
      tryDeliverMessages({ limit: 1 });
      this.interactables = this.interactables.filter((candidate) => candidate !== it);
      const banner = this.add.text((this.roomW * TILE) / 2, TILE * 5.4, "NEW ROOMMATE", { fontFamily: "monospace", fontSize: "24px", color: "#f4c95d", stroke: "#3a2b3a", strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(900).setScale(0.4);
      this.tweens.add({ targets: banner, scale: 1, y: banner.y - 10, duration: 420, ease: "Back.out", hold: 1200, yoyo: true, onComplete: () => banner.destroy() });
      this.tweens.add({ targets: cat, x: TILE * 9.2, y: TILE * 7.4, duration: 900, ease: "Sine.inOut", onComplete: () => {
        cat.destroy();
        this.spawnHomeCat();
      } });
      uiEvents.emit("dialogue", store.state.cat.name, ["The cat sits by the door like she has an appointment.", "Juju opens it.", "Mishmish walks in, checks the sofa, and does not ask permission again."]);
    });
  }

  private spawnHomeCat() {
    if (this.homeCat?.active) return;
    const sofa = this.placed.find((placed) => placed.data.tex === "f_sofa")?.img;
    const x = sofa?.x ?? TILE * 9.2;
    const y = sofa ? sofa.y - 9 : TILE * 7.4;
    this.homeCat = this.add.image(x, y, getVisualTexture(this, "o_cat")).setOrigin(0.5, 1).setDepth(y + 2).setScale(0.9);
    this.catInteractable = this.addFurnitureInteract(x, y, 22, `Pet ${store.state.cat.name}`, () => {
      store.petCat();
      this.tweens.add({ targets: this.homeCat, scaleX: 1.08, scaleY: 1.08, duration: 150, yoyo: true, repeat: 2 });
      uiEvents.emit("dialogue", store.state.cat.name, [store.getStat("cat_pets") % 4 === 0 ? "Purrrrr. This interaction has been approved." : "...", "Juju: You live here. You could at least say hello."]);
    });
    const spots = [
      { x: TILE * 6.5, y: TILE * 7.6 }, { x: TILE * 12.5, y: TILE * 7.8 }, { x: TILE * 4.2, y: TILE * 6.1 }, { x: TILE * 9.3, y: TILE * 4.8 },
    ];
    this.time.addEvent({ delay: 6200, loop: true, callback: () => {
      if (!this.homeCat?.active || controls.cameraMode) return;
      const target = spots[Math.floor(stableDailyRoll(`cat-spot-${this.time.now}`) * spots.length) % spots.length];
      this.tweens.add({ targets: this.homeCat, x: target.x, y: target.y, duration: 1400, ease: "Sine.inOut", onUpdate: () => this.homeCat?.setDepth((this.homeCat.y ?? target.y) + 2) });
    } });
    if (!store.hasDaily("cat_knock_gag") && stableDailyRoll("cat-knock-gag") < 0.18) {
      store.setDaily("cat_knock_gag");
      this.time.delayedCall(3500, () => {
        if (!this.homeCat?.active) return;
        const thing = this.add.text(this.homeCat.x + 14, this.homeCat.y - 15, "▯", { fontFamily: "monospace", fontSize: "12px", color: "#f4c95d", resolution: 2 }).setDepth(this.homeCat.y + 4);
        this.tweens.add({ targets: thing, y: thing.y + 22, angle: 90, duration: 420, ease: "Bounce.out" });
        uiEvents.emit("dialogue", "Juju", ["Why.", "Mishmish: ..."]);
      });
    }
  }

  private spawnHomeTigor() {
    if (this.homeTigor?.active) return;
    const x = TILE * 12.4;
    const y = TILE * 9.4;
    this.homeTigor = this.add.image(x, y, getVisualTexture(this, "o_tigor")).setOrigin(0.5, 1).setDepth(y + 3).setScale(1.08);
    const bowl = this.add.ellipse(x + 18, y + 1, 15, 6, 0x4d87a9).setDepth(y + 1).setStrokeStyle(1, 0x2b3d52);
    this.tigorBowl = bowl;
    this.tigorInteractable = this.addFurnitureInteract(x, y, 23, "Pet Tigor", () => {
      store.petTigor();
      this.tweens.add({ targets: this.homeTigor, y: y - 5, angle: 4, duration: 150, yoyo: true, repeat: 2 });
      uiEvents.emit("dialogue", "Tigor", ["Tigor rolls onto the rug like he personally approved the house.", "Mishmish watches from a safe professional distance.", "Juju: Both of you live here. Please negotiate."]);
    });
    this.tweens.add({ targets: this.homeTigor, x: x + 8, y: y - 2, duration: 2400, yoyo: true, repeat: -1, ease: "Sine.inOut", onUpdate: () => {
      if (!this.homeTigor) return;
      this.homeTigor.setDepth(this.homeTigor.y + 3).setFlipX(this.homeTigor.x < x + 4);
      if (this.tigorInteractable) { this.tigorInteractable.x = this.homeTigor.x; this.tigorInteractable.y = this.homeTigor.y; }
      bowl.setDepth(y + 1);
    } });
  }

  private refreshHomeTigor() {
    if (!this.sys.isActive()) return;
    if (this.tigorInteractable) this.interactables = this.interactables.filter((candidate) => candidate !== this.tigorInteractable);
    this.tigorInteractable = undefined;
    this.homeTigor?.destroy();
    this.homeTigor = undefined;
    this.tigorBowl?.destroy();
    this.tigorBowl = undefined;
    if (store.state.tigor.unlocked && store.state.tigor.atHome) this.spawnHomeTigor();
  }

  private maybeWelcomeVisitor() {
    if (!this.sys.isActive() || store.hasDaily("home_visitor") || controls.locked) return;
    const debug = new URLSearchParams(window.location.search).has("lifeDebug");
    if (!debug && stableDailyRoll("home-visitor-roll") >= 0.36) return;
    const eligible = ["moomoo", "mama", "fadwa", "chloe"].filter((id) => {
      if (!debug && store.getRelationship(id) < 15) return false;
      if (id === "fadwa" && store.state.quests.q_london?.status !== "done") return false;
      if (id === "chloe" && store.state.quests.q_chloe?.status !== "done") return false;
      return true;
    });
    const id = eligible[Math.floor(stableDailyRoll("home-visitor-choice") * eligible.length)];
    const def = NPCS.find((npc) => npc.id === id);
    if (!def) return;
    store.setDaily("home_visitor");
    this.visitor = new NPC(this, def);
    this.visitor.place(TILE * 9, TILE * 10.2).startRoutine(id === "chloe" ? "computer" : id === "mama" ? "tea" : "sit", 10);
    this.visitorInteractable = this.addFurnitureInteract(this.visitor.x, this.visitor.y, 28, `Hang out with ${def.name}`, () => this.openVisitorHangout(id));
    if (id === "mama") store.addItem("chocolate");
    const arrivals: Record<string, string[]> = {
      fadwa: ["Fadwa opens the door and immediately walks in.", "Juju: Hello?", "Fadwa: I know where the sofa is."],
      mama: ["Mama arrives carrying food and exactly three questions about whether Juju has eaten."],
      moomoo: ["Moomoo has selected movie night without consulting the schedule."],
      chloe: ["Chloe opens her laptop.", "Juju: No PhD.", "Chloe closes it by approximately one centimetre."],
    };
    const catLine = store.state.cat.adopted ? `${def.name} meets ${store.state.cat.name}. ${store.state.cat.name} performs a complete background check.` : undefined;
    uiEvents.emit("dialogue", def.name, [...(arrivals[id] ?? ["Surprise visit."]), ...(catLine ? [catLine] : [])]);
  }

  private openVisitorHangout(npcId: string) {
    const name = NPCS.find((npc) => npc.id === npcId)?.name ?? npcId;
    uiEvents.emit("choice", {
      title: `${name} is here`,
      prompt: "Keep it short, cozy, and completely optional.",
      choices: [
        { id: "coffee", label: "Make coffee" },
        { id: "movie", label: "Pick a movie" },
        { id: "gossip", label: "Gossip" },
        { id: "cards", label: "Play cards", description: "No wagers. Maximum bragging." },
      ],
      onChoose: (activity: string) => {
        if (activity === "coffee" || activity === "cards") {
          uiEvents.emit("minigame", { kind: "timing", title: activity === "coffee" ? "Two home coffees" : "Friendly cards", hint: activity === "coffee" ? "Match three easy moments." : "Catch three card-flip moments. No money anywhere.", taps: 3, onDone: () => this.finishVisitorHangout(npcId, activity) });
        } else this.finishVisitorHangout(npcId, activity);
      },
    });
  }

  private finishVisitorHangout(npcId: string, activity: string) {
    const name = NPCS.find((npc) => npc.id === npcId)?.name ?? npcId;
    if (!store.hasDaily(`home_hangout_${npcId}`)) {
      store.setDaily(`home_hangout_${npcId}`);
      store.addRelationship(npcId, 2);
      store.incrementStat("home_hangouts");
    }
    const lines: Record<string, string[]> = {
      coffee: ["Two cups. One sofa. The timing is somehow perfect."],
      movie: ["They choose a movie in forty seconds and discuss the choice for twelve minutes.", stableDailyRoll(`visitor-nap-${npcId}`) < 0.35 ? `${name} falls asleep before the second act.` : "Someone steals the remote. Nobody admits it."],
      gossip: ["The gossip begins with 'do not tell anyone' and immediately becomes architectural."],
      cards: ["No money. No wagers. Just an unreasonable amount of bragging over one tiny card."],
    };
    uiEvents.emit("dialogue", name, [...(lines[activity] ?? ["A small evening. A good one."]), "Drinks made. Feet up. The world can wait outside."]);
  }

  private startCamera(pose: "smile" | "peace" | "silly" | "hug" = "smile") {
    if (!this.sys.isActive() || this.editing) {
      controls.cameraMode = false;
      return;
    }
    this.exitCameraMode();
    controls.cameraMode = true;
    controls.locked = false;
    this.cameraPose = pose;
    this.cameraOffset.set(0, 0);
    if (this.visitor) {
      this.visitor.startRoutine("look", 0).faceTowards(this.player.x, this.player.y);
      this.tweens.add({ targets: this.visitor, x: this.player.x + 18, y: this.player.y + 3, duration: 420, ease: "Sine.inOut" });
    }
    this.currentPrompt = null;
    uiEvents.emit("prompt", null);
    const { width, height } = this.scale.gameSize;
    const frame = this.add.graphics().setScrollFactor(0).setDepth(70000);
    frame.lineStyle(4, 0xffffff, 0.9).strokeRoundedRect(24, 54, width - 48, height - 140, 12);
    const title = this.add.text(34, 66, `HOME CAMERA · ${pose.toUpperCase()}`, { fontFamily: "monospace", fontSize: "11px", color: "#fff", backgroundColor: "rgba(43,34,51,0.75)", padding: { x: 7, y: 4 }, resolution: 2 }).setScrollFactor(0).setDepth(70001);
    const hint = this.add.text(width / 2, height - 73, "MOVE VIEW · ACTION TO TAKE PHOTO", { fontFamily: "monospace", fontSize: "11px", color: "#fff", backgroundColor: "rgba(43,34,51,0.78)", padding: { x: 8, y: 4 }, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(70001);
    const exit = this.add.text(width - 34, 66, "EXIT", { fontFamily: "monospace", fontSize: "11px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 9, y: 5 }, resolution: 2 }).setOrigin(1, 0).setScrollFactor(0).setDepth(70002).setInteractive({ useHandCursor: true });
    exit.on("pointerdown", () => this.exitCameraMode());
    this.cameraOverlay = this.add.container(0, 0, [frame, title, hint, exit]).setScrollFactor(0).setDepth(70000);
  }

  private exitCameraMode() {
    controls.cameraMode = false;
    this.cameraOverlay?.destroy(true);
    this.cameraOverlay = undefined;
    this.cameraOffset.set(0, 0);
    this.cameras?.main?.setFollowOffset(0, 0);
  }

  private takeHomePhoto() {
    if (!controls.cameraMode || this.time.now - this.lastCameraCapture < 700) return;
    this.lastCameraCapture = this.time.now;
    const index = store.getStat("photos_taken") + 1;
    const visitorId = this.visitor?.def.id;
    const catInFrame = !!this.homeCat?.active && stableDailyRoll(`home-camera-cat-${index}`) < 0.32;
    const surprise = catInFrame ? "cat" : visitorId && stableDailyRoll(`home-camera-pose-${index}`) < 0.1 ? "weird_pose" : undefined;
    const location = getLocation(store.state.currentLocation);
    store.capturePhoto({
      id: `camera_home_${store.state.currentDay}_${index}`,
      title: visitorId ? `At home with ${NPCS.find((npc) => npc.id === visitorId)?.name ?? visitorId}` : store.state.cat.adopted ? `Home with ${store.state.cat.name}` : "A quiet room",
      locationId: location.id,
      day: store.state.currentDay,
      timeOfDay: store.state.timeOfDay,
      companionId: visitorId,
      participantIds: visitorId ? [visitorId] : [],
      pose: this.cameraPose,
      surprise,
      frame: surprise ? "chaos" : visitorId ? "hearts" : "classic",
      caption: catInFrame ? `${store.state.cat.name} entered the frame at the exact correct second.` : "The sofa, the shelf, the ordinary little life. Kept.",
    });
    if (this.cameraPose === "hug" && visitorId && store.getRelationship(visitorId) >= 35) store.incrementStat("npc_hugs");
    const { width, height } = this.scale.gameSize;
    const flash = this.add.rectangle(0, 0, width, height, 0xffffff, 0.92).setOrigin(0).setScrollFactor(0).setDepth(70020);
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    store.toast(surprise ? `Saved · ${surprise} photobomb` : "Saved to scrapbook", "#8ecae6");
    tryDeliverMessages({ limit: 1 });
  }

  private sleep() {
    store.addHearts(1);
    store.sleep();
    tryDeliverMessages({ wake: true, limit: 2 });
    store.toast("A cozy new day together", "#ff8fae");
    uiEvents.emit("dialogue", "Home", [
      "You sleep. The house keeps your things exactly where you left them.",
      store.clockLabel(),
    ]);
  }

  private addFurnitureInteract(x: number, y: number, promptOrRadius: string | number, promptOrTrigger: string | (() => void), maybeTrigger?: () => void) {
    const radius = typeof promptOrRadius === "number" ? promptOrRadius : 22;
    const prompt = typeof promptOrRadius === "number" ? promptOrTrigger as string : promptOrRadius;
    const trigger = typeof promptOrRadius === "number" ? maybeTrigger! : promptOrTrigger as () => void;
    const it = { x, y, radius, prompt, trigger };
    this.interactables.push(it);
    return it;
  }

  private buildCollision() {
    this.solids = this.physics.add.staticGroup();
    const add = (x: number, y: number, w: number, h: number) => {
      const go = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0);
      this.physics.add.existing(go, true);
      this.solids.add(go);
    };
    const worldW = this.roomW * TILE;
    const worldH = this.roomH * TILE;
    add(0, 0, worldW, TILE * 2); // top wall
    add(0, 0, TILE, worldH); // left
    add(worldW - TILE, 0, TILE, worldH); // right
    add(0, worldH - TILE, worldW / 2 - TILE, TILE); // bottom left of door
    add(worldW / 2 + TILE, worldH - TILE, worldW / 2 - TILE, TILE); // bottom right of door
    for (const cell of this.property.layout.walls) add(cell.x * TILE, cell.y * TILE + 2, TILE, TILE - 4);
  }

  private rebuildCollision() {
    this.playerCollider?.destroy();
    this.solids?.clear(true, true);
    this.buildCollision();
    if (this.player) this.playerCollider = this.physics.add.collider(this.player, this.solids);
  }

  private exitHouse() {
    const loc = getLocation(store.state.currentLocation);
    if (!this.property.owned) store.state.activeHomeId = store.state.primaryHomeId;
    const s = loc.city?.spawn ?? { tx: 66, ty: 48 };
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.World, {
      locationId: loc.id,
      spawn: { x: s.tx * TILE + TILE / 2, y: (s.ty + 2) * TILE },
      driving: store.state.inJeep,
    });
  }

  private openMap() {
    this.scene.start(SceneKeys.WorldMap, {});
  }

  private applyZoom() {
    const h = this.scale.gameSize.height;
    const zoom = Phaser.Math.Clamp(Math.round(h / (13 * TILE)), 2, 6);
    this.cameras.main.setZoom(zoom);
  }

  private tryInteract() {
    if (controls.cameraMode) {
      this.takeHomePhoto();
      return;
    }
    if (controls.locked) return;
    const now = this.time.now;
    if (now - this.lastInteract < 250) return;
    if (this.currentPrompt) {
      this.lastInteract = now;
      this.currentPrompt.trigger();
    }
  }

  update() {
    if (!this.player) return;
    let vx = 0;
    let vy = 0;
    if (controls.cameraMode) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      this.cameraOffset.x = Phaser.Math.Clamp(this.cameraOffset.x + vx * 1.8, -76, 76);
      this.cameraOffset.y = Phaser.Math.Clamp(this.cameraOffset.y + vy * 1.5, -48, 48);
      this.cameras.main.setFollowOffset(-this.cameraOffset.x, -this.cameraOffset.y);
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.takeHomePhoto();
      if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.exitCameraMode();
      vx = 0;
      vy = 0;
    } else if (!controls.locked) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      const len = Math.hypot(vx, vy);
      if (len > 1) {
        vx /= len;
        vy /= len;
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E))
        this.tryInteract();
    }
    const walkingSpeed = store.state.outfit === "red_bottom_boots" ? this.player.speed * 1.65 : this.player.speed;
    this.player.move(vx * walkingSpeed, vy * walkingSpeed);

    if (this.visitor) {
      this.visitor.update(this.time.now);
      if (this.visitorInteractable) {
        this.visitorInteractable.x = this.visitor.x;
        this.visitorInteractable.y = this.visitor.y;
      }
    }
    if (this.homeCat && this.catInteractable) {
      this.catInteractable.x = this.homeCat.x;
      this.catInteractable.y = this.homeCat.y;
    }

    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of controls.cameraMode ? [] : this.interactables) {
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
}
