import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { BABA_SHOPPING_STORES, type ShoppingMallId, type ShoppingProductDef, type ShoppingStoreDef } from "../data/babaShopping";
import { Player } from "../objects/Player";
import { controls, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";
import { getVisualTexture } from "../visual";

interface BabaShoppingData {
  mallId?: ShoppingMallId;
  replay?: boolean;
  /** Development-only fast entry into later acts for browser/mobile QA. */
  debugStage?: number;
}

interface ShoppingInteractable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
  active?: boolean;
}

interface BagVisual {
  go: Phaser.GameObjects.Container;
  phase: number;
}

interface MallHazard {
  go: Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  radius: number;
  kind: "shopper" | "couple" | "crossing" | "cart" | "cleaner" | "escalator";
  nextStop: number;
  stoppedUntil: number;
}

interface EscalatorZone {
  x: number;
  y: number;
  w: number;
  h: number;
  direction: 1 | -1;
}

interface StairZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

type BabaMode = "none" | "intro" | "fight" | "won" | "avoided";

const WORLD_W = 920;
const WORLD_H = 3040;
const CORRIDOR_LEFT = 214;
const CORRIDOR_RIGHT = 706;
const AUTO_RUN_SPEED = 112;
const RUNNER_DART_SPEED = 230;
const FONT = "monospace";
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const COLLISION_LINES = [
  "SORRY SORRY SORRY",
  "Baba saw that.",
  "The bags have developed independent movement.",
  "Pedestrian boss battle.",
  "JUJU PLEASE.",
];

const BABA_LINES = [
  "ANOTHER RECEIPT?!",
  "JUJU.",
  "YOU SAID ONE STORE.",
  "THIS ONE HAS HOW MANY ZEROES?",
  "CARTIER??",
  "I RAISED A FINANCIAL MENACE.",
];

const JUJU_LINES = [
  "No refunds 💗",
  "It was basically an investment.",
  "Baba look how cute it is.",
  "You can't put a price on happiness.",
  "Technically this one was on sale.",
];

/** A bespoke scrolling mall gauntlet. It intentionally owns no permanent currency. */
export class BabaShoppingScene extends Phaser.Scene {
  private taskData: BabaShoppingData = {};
  private mallId: ShoppingMallId = "dubai_mall";
  private player!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private interactables: ShoppingInteractable[] = [];
  private current?: ShoppingInteractable;
  private purchases: { store: ShoppingStoreDef; product: ShoppingProductDef }[] = [];
  private purchasedStores = new Set<string>();
  private storeMarks = new Map<string, Phaser.GameObjects.Text>();
  private storeVisits = new Map<string, number>();
  private bags: BagVisual[] = [];
  private hazards: MallHazard[] = [];
  private escalators: EscalatorZone[] = [];
  private stairs: StairZone[] = [];
  private receiptPool: Phaser.GameObjects.Container[] = [];
  private bossHazardPool: Phaser.GameObjects.Container[] = [];
  private baba?: Phaser.GameObjects.Sprite;
  private moomoo?: Phaser.GameObjects.Sprite;
  private babaMode: BabaMode = "none";
  private bossDefense = 0;
  private receiptAmmo = 0;
  private bossTop = 0;
  private bossBottom = 0;
  private stress = 4;
  private ultimate = 0;
  private collisions = 0;
  private flirtyMoments = 0;
  private ultimateUsed = false;
  private ultimateEndsAt = 0;
  private checkpointResolved = false;
  private resultsOpen = false;
  private resultsPersisted = false;
  private startedAt = 0;
  private lastInteract = 0;
  private lastCollision = 0;
  private lastReceipt = 0;
  private lastBossHazard = 0;
  private lastHud = 0;
  private lastTimeStress = 0;
  private lastAfterimage = 0;
  private lastCarrierLine = 0;
  private checkpointDeniedAt = 0;
  private bagSwing = 0;
  private previousMoveX = 0;
  private actShown = new Set<number>();
  private firstFlirtShown = false;
  private lingerieFlirtShown = false;
  private dialogueClosers = new Set<() => void>();

  constructor() {
    super(SceneKeys.BabaShopping);
  }

  create(data: BabaShoppingData = {}) {
    this.taskData = data;
    this.mallId = data.mallId ?? "dubai_mall";
    this.interactables = [];
    this.current = undefined;
    this.purchases = [];
    this.purchasedStores.clear();
    this.storeMarks.clear();
    this.storeVisits.clear();
    this.bags = [];
    this.hazards = [];
    this.escalators = [];
    this.stairs = [];
    this.receiptPool = [];
    this.bossHazardPool = [];
    this.baba = undefined;
    this.moomoo = undefined;
    this.babaMode = "none";
    this.bossDefense = 0;
    this.receiptAmmo = 0;
    this.stress = 4;
    this.ultimate = 0;
    this.collisions = 0;
    this.flirtyMoments = 0;
    this.ultimateUsed = false;
    this.checkpointResolved = false;
    this.resultsOpen = false;
    this.resultsPersisted = false;
    this.actShown.clear();
    this.firstFlirtShown = false;
    this.lingerieFlirtShown = false;
    this.dialogueClosers.clear();
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    controls.shoppingUltimateReady = false;
    controls.shoppingUltimateActive = false;
    uiEvents.emit("sceneReset");
    uiEvents.emit("prompt", null);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).setBackgroundColor("#191420").setRoundPixels(true);
    this.drawMall();
    this.addStores();
    this.addMallLife();
    const debugStage = import.meta.env.DEV ? Math.max(0, Math.floor(data.debugStage ?? 0)) : 0;
    const startY = debugStage === 1 ? 330 : debugStage === 2 ? 1160 : debugStage === 3 ? 2380 : debugStage >= 5 ? WORLD_H - 92 : debugStage >= 4 ? 2605 : 126;
    const startX = debugStage === 1 || debugStage === 2 ? CORRIDOR_LEFT + 24 : WORLD_W / 2;
    this.player = new Player(this, startX, startY, getVisualTexture(this, "char_her"));
    this.player.setDepth(this.player.y + 2);
    // The blueprint is a fixed-width vertical strip: follow progress, never pan
    // sideways and hide the opposite wall of shops when Juju darts into a store.
    this.cameras.main.startFollow(this.player, true, 0, 0.14);
    this.applyCameraZoom();

    this.addInteractable(WORLD_W / 2, WORLD_H - 72, 70, "A · CHECKOUT & EXIT", () => this.finishAtCheckout());
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E,Q,SHIFT") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.handleAction, this);
    uiEvents.on("shoppingUltimate", this.activateUltimate, this);
    this.scale.on("resize", this.applyCameraZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownShopping, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("locationTitle", "Baba's Shopping Nightmare", "One card · eight stores · no financial peace");

    if (debugStage >= 3) this.seedDebugRun(debugStage);
    this.startedAt = this.time.now;
    this.lastTimeStress = this.time.now;
    this.emitHud(true);
    this.time.delayedCall(120, () => this.afterDialogue("Baba", [
      debugStage ? `Development preview · act ${debugStage}.` : "One store, Juju. One.",
      debugStage ? "All normal progression rules remain active." : "Juju: Of course, Baba.",
      "BABA STRESS has entered the mall.",
      data.replay ? "The staff recognize her. This is not reassuring." : "Get four purchases before the Baba checkpoint. Optional stores wait after it.",
    ], () => {
      if (debugStage === 3 && this.babaMode === "none") this.startBabaBattle(2505);
    }));
  }

  private seedDebugRun(stage: number) {
    const count = stage >= 4 ? 6 : 4;
    for (const def of BABA_SHOPPING_STORES.slice(0, count)) {
      const product = def.products[0];
      this.purchasedStores.add(def.id);
      this.purchases.push({ store: def, product });
      this.storeMarks.get(def.id)?.setText("✓");
      this.spawnBag(def);
    }
    this.stress = stage >= 4 ? 88 : 82;
    this.ultimate = count * 16;
    if (stage >= 4) {
      this.babaMode = "won";
      this.checkpointResolved = true;
      this.ultimate = 100;
      this.ultimateReady();
    }
  }

  private applyCameraZoom() {
    const { width, height } = this.scale.gameSize;
    const zoom = Phaser.Math.Clamp(Math.min(width / 800, height / 430), 0.78, 1.45);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.scrollX = WORLD_W / 2 - width / (2 * zoom);
    // Runner framing: Juju stays low while the next stores and traffic lanes remain visible.
    this.cameras.main.setFollowOffset(0, Math.round(Math.min(118, height * 0.22)));
  }

  private drawMall() {
    const background = this.add.graphics().setDepth(0);
    background.fillStyle(0x17131c, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    const zones = [
      { y: 35, h: 830, floor: 0xf3eadb, edge: 0xd6ae78, name: "LEVEL 1 · THE SENSIBLE BEGINNING" },
      { y: 1040, h: 680, floor: 0xe9e2ed, edge: 0x9c7cb3, name: "LEVEL 2 · RECEIPTS GET SERIOUS" },
      { y: 1875, h: 570, floor: 0xe0ebea, edge: 0x6faaa2, name: "LEVEL 3 · BAG CHAOS" },
      { y: 2520, h: 500, floor: 0xf2e5d8, edge: 0xc98255, name: "LEVEL 4 · FINAL SPRINT" },
    ];
    for (const zone of zones) {
      background.fillStyle(zone.floor, 1).fillRoundedRect(18, zone.y, WORLD_W - 36, zone.h, 26);
      background.lineStyle(4, zone.edge, 1).strokeRoundedRect(18, zone.y, WORLD_W - 36, zone.h, 26);
      background.fillStyle(0xffffff, 0.28).fillRect(CORRIDOR_LEFT, zone.y + 22, CORRIDOR_RIGHT - CORRIDOR_LEFT, zone.h - 44);
      background.fillGradientStyle(0xffffff, 0xffffff, 0xc9b7a0, 0xc9b7a0, 0.18).fillRect(WORLD_W / 2 - 96, zone.y + 25, 192, zone.h - 50);
      for (const laneX of [292, 376, 460, 544, 628]) {
        background.lineStyle(2, zone.edge, laneX === 460 ? 0.23 : 0.14).lineBetween(laneX, zone.y + 54, laneX, zone.y + zone.h - 34);
        for (let dashY = zone.y + 88; dashY < zone.y + zone.h - 45; dashY += 112) {
          background.fillStyle(laneX === 460 ? 0xe46d94 : 0x7aaed0, 0.26).fillRoundedRect(laneX - 2, dashY, 4, 31, 2);
        }
      }
      this.add.text(WORLD_W / 2, zone.y + 22, zone.name, { fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", backgroundColor: "rgba(255,249,240,0.86)", padding: { x: 10, y: 4 }, resolution: 2 }).setOrigin(0.5).setDepth(zone.y + 2);
      for (let y = zone.y + 76; y < zone.y + zone.h - 30; y += 70) {
        background.lineStyle(1, zone.edge, 0.18).lineBetween(CORRIDOR_LEFT + 8, y, CORRIDOR_RIGHT - 8, y);
        background.lineStyle(2, 0xffffff, 0.22).lineBetween(WORLD_W / 2 - 150, y + 3, WORLD_W / 2 + 150, y + 3);
      }
    }

    this.drawConnector(865, "ESCALATOR TO LEVEL 2", 1);
    this.drawConnector(1720, "ATRIUM · ESCALATOR / STAIRS", 1);
    background.fillStyle(0x2b2233, 1).fillRoundedRect(CORRIDOR_LEFT + 12, 2445, CORRIDOR_RIGHT - CORRIDOR_LEFT - 24, 70, 16);
    background.lineStyle(4, 0xf4c95d, 1).strokeRoundedRect(CORRIDOR_LEFT + 12, 2445, CORRIDOR_RIGHT - CORRIDOR_LEFT - 24, 70, 16);
    this.add.text(WORLD_W / 2, 2465, "BABA CHECKPOINT", { fontFamily: FONT, fontSize: "19px", color: "#ffe08a", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(2470);
    this.add.text(WORLD_W / 2, 2491, "MINIMUM FOUR PURCHASES · EMOTIONAL RECEIPTS READY", { fontFamily: FONT, fontSize: "9px", color: "#fff4e6", resolution: 2 }).setOrigin(0.5).setDepth(2470);

    background.fillStyle(0x3a2b3a, 1).fillRoundedRect(WORLD_W / 2 - 150, WORLD_H - 126, 300, 92, 18);
    background.lineStyle(5, 0x7be0a3, 1).strokeRoundedRect(WORLD_W / 2 - 150, WORLD_H - 126, 300, 92, 18);
    this.add.text(WORLD_W / 2, WORLD_H - 103, "CHECKOUT / ESCAPE", { fontFamily: FONT, fontSize: "19px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(WORLD_H - 90);
    this.add.text(WORLD_W / 2, WORLD_H - 76, "Receipts printed. Baba notified.", { fontFamily: FONT, fontSize: "10px", color: "#7be0a3", resolution: 2 }).setOrigin(0.5).setDepth(WORLD_H - 90);

    for (const [x, y, text] of [[WORLD_W / 2, 235, "← STORES · MAIN WALKWAY · STORES →"], [WORLD_W / 2, 1090, "JEWELRY  ←   DIRECTORY   →  BEAUTY"], [WORLD_W / 2, 1930, "BAGS THIS WAY · REGRETS EVERYWHERE"], [WORLD_W / 2, 2570, "ULTIMATE BONUS FLOOR"]] as [number, number, string][]) {
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#6f6274", padding: { x: 8, y: 4 }, resolution: 2 }).setOrigin(0.5).setDepth(y + 1);
    }
  }

  private drawConnector(y: number, label: string, direction: 1 | -1) {
    const g = this.add.graphics().setDepth(y + 1);
    g.fillStyle(0x1f2633, 1).fillRoundedRect(250, y, 420, 170, 18);
    g.lineStyle(4, 0xc6d3df, 1).strokeRoundedRect(250, y, 420, 170, 18);
    g.fillStyle(0x52657b, 1).fillRoundedRect(282, y + 24, 206, 122, 10);
    g.fillStyle(0xd8cfc2, 1).fillRoundedRect(514, y + 24, 124, 122, 10);
    for (let i = 0; i < 7; i += 1) {
      g.lineStyle(3, i % 2 ? 0x91a6b8 : 0xb9c8d3, 1).lineBetween(292, y + 38 + i * 15, 478, y + 38 + i * 15);
      g.lineStyle(2, 0x9b8976, 1).lineBetween(524, y + 40 + i * 14, 628, y + 40 + i * 14);
    }
    this.add.text(385, y + 76, "▲   ▲   ▲", { fontFamily: FONT, fontSize: "13px", color: "#fff", resolution: 2 }).setOrigin(0.5).setDepth(y + 3);
    this.add.text(575, y + 76, "STAIRS", { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5).setDepth(y + 3);
    this.add.text(WORLD_W / 2, y + 9, label, { fontFamily: FONT, fontSize: "11px", color: "#ffe08a", backgroundColor: "#2b2233", padding: { x: 7, y: 3 }, resolution: 2 }).setOrigin(0.5).setDepth(y + 4);
    const arrows = this.add.text(385, y + 118, "↑  ↑  ↑", { fontFamily: FONT, fontSize: "13px", color: "#63c6e8", resolution: 2 }).setOrigin(0.5).setDepth(y + 4);
    this.tweens.add({ targets: arrows, y: arrows.y + 18, alpha: 0.2, duration: 700, repeat: -1, onRepeat: () => arrows.setPosition(385, y + 108).setAlpha(1) });
    this.escalators.push({ x: 282, y: y + 24, w: 206, h: 122, direction });
    this.stairs.push({ x: 514, y: y + 24, w: 124, h: 122 });
  }

  private addStores() {
    for (const def of BABA_SHOPPING_STORES) this.drawStore(def);
  }

  private drawStore(def: ShoppingStoreDef) {
    const x = def.side === "left" ? 28 : 692;
    const doorX = def.side === "left" ? CORRIDOR_LEFT + 18 : CORRIDOR_RIGHT - 18;
    const top = def.y - 82;
    const g = this.add.graphics().setDepth(def.y - 12);
    g.fillStyle(0x241e2a, 0.3).fillRoundedRect(x + 7, top + 9, 200, 166, 12);
    g.fillStyle(def.accent, 1).fillRoundedRect(x, top, 200, 166, 12);
    g.lineStyle(4, def.color, 1).strokeRoundedRect(x, top, 200, 166, 12);
    g.fillStyle(def.color, 1).fillRoundedRect(x, top, 200, 35, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(0x162b3c, 0.88).fillRoundedRect(x + 14, top + 50, 172, 88, 8);
    g.fillGradientStyle(0xbfe6ff, 0xbfe6ff, 0x5a7790, 0x5a7790, 0.32).fillRoundedRect(x + 19, top + 55, 162, 78, 6);
    g.lineStyle(2, 0xffffff, 0.42).lineBetween(x + 30, top + 60, x + 72, top + 128);
    g.fillStyle(0x332b38, 1).fillRect(x + 15, top + 139, 170, 18);
    const sign = this.add.text(x + 100, top + 10, def.name, { fontFamily: FONT, fontSize: def.id === "cartier" ? "15px" : "12px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(def.y - 10);
    const subtitle = this.add.text(x + 100, top + 145, def.subtitle, { fontFamily: FONT, fontSize: "7px", color: "#fff4e6", align: "center", fixedWidth: 172, resolution: 2 }).setOrigin(0.5).setDepth(def.y - 10);
    const displayIcons = def.products.map((product, index) => this.add.text(x + 53 + index * 47, top + 94, product.icon, { fontFamily: FONT, fontSize: "19px", color: index === 1 ? "#fff" : "#ffe08a", stroke: "#3a2b3a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(def.y - 9));
    void sign; void subtitle;
    const glow = this.add.rectangle(doorX, def.y + 8, 42, 94, def.color, 0.2).setStrokeStyle(2, def.color, 0.7).setDepth(def.y - 2);
    this.tweens.add({ targets: glow, alpha: 0.48, scaleX: 1.1, duration: 760, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const mark = this.add.text(def.side === "left" ? x + 176 : x + 24, top + 18, "", { fontFamily: FONT, fontSize: "17px", color: "#7be0a3", stroke: "#203328", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setDepth(def.y + 5);
    this.storeMarks.set(def.id, mark);
    if (def.id === "cartier") {
      displayIcons.forEach((icon, index) => this.tweens.add({ targets: icon, scale: 1.18, alpha: 0.62, duration: 620 + index * 130, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
    }
    this.addInteractable(doorX, def.y + 8, 88, `A · ENTER ${def.name}`, () => this.enterStore(def));
  }

  private addMallLife() {
    const decor = this.add.graphics();
    for (const y of [470, 760, 1280, 1510, 2140, 2300, 2730]) {
      const left = y % 2 === 0;
      const x = left ? 260 : 660;
      const plant = this.add.image(x, y, getVisualTexture(this, "o_planter")).setScale(1.3).setDepth(y + 24);
      this.tweens.add({ targets: plant, angle: left ? 1.5 : -1.5, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      decor.fillStyle(0x3a2b3a, 0.55).fillEllipse(x, y + 9, 40, 12);
    }
    for (const y of [520, 1330, 2210]) {
      this.add.image(WORLD_W / 2 + (y % 3 ? 110 : -110), y, getVisualTexture(this, "o_bench")).setScale(1.15).setDepth(y + 4);
    }
    for (const y of [790, 1545, 2250]) this.drawKiosk(y);

    // Most traffic follows the long vertical promenade lanes from the blueprint;
    // a few crossing hazards stop the pattern from becoming mechanically flat.
    const hazardDefs: Array<[number, number, MallHazard["kind"], number, number]> = [
      [304, 455, "shopper", 0, 45], [390, 600, "couple", 0, -34], [548, 690, "cart", 0, 58],
      [630, 780, "crossing", -50, 0], [320, 1210, "cleaner", 0, 42], [465, 1370, "shopper", 0, -31],
      [610, 1530, "escalator", 0, 47], [365, 1920, "cart", 0, -55], [535, 2150, "couple", 0, 35],
      [630, 2300, "crossing", -56, 0], [405, 2620, "shopper", 0, 42], [565, 2820, "cleaner", 0, -46],
    ];
    hazardDefs.forEach(([x, y, kind, vx, vy]) => this.makeHazard(x, y, kind, vx, vy));
  }

  private drawKiosk(y: number) {
    const x = WORLD_W / 2 + (y % 2 ? -88 : 88);
    const g = this.add.graphics().setDepth(y + 12);
    g.fillStyle(0x3a2b3a, 0.24).fillEllipse(x, y + 15, 108, 25);
    g.fillStyle(0xfff4e6, 1).fillRoundedRect(x - 47, y - 24, 94, 40, 8);
    g.lineStyle(3, 0xcaa27a, 1).strokeRoundedRect(x - 47, y - 24, 94, 40, 8);
    g.fillStyle(0xe46d94, 1).fillRect(x - 53, y - 25, 106, 8);
    this.add.text(x, y - 11, y % 2 ? "PHONE CASES" : "TINY PRETZELS", { fontFamily: FONT, fontSize: "8px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5).setDepth(y + 13);
    for (let i = 0; i < 3; i += 1) this.add.circle(x - 35 + i * 35, y + 25 + i * 5, 5, i % 2 ? 0xe46d94 : 0x527fc4).setDepth(y + 30 + i);
  }

  private makeHazard(x: number, y: number, kind: MallHazard["kind"], vx: number, vy: number) {
    const children: Phaser.GameObjects.GameObject[] = [];
    const shadow = this.add.ellipse(0, 7, kind === "couple" ? 34 : kind === "cart" || kind === "cleaner" ? 42 : 20, 9, 0x24202a, 0.28);
    children.push(shadow);
    if (kind === "cart" || kind === "cleaner") {
      const body = this.add.rectangle(0, -3, 34, 19, kind === "cleaner" ? 0x63c6e8 : 0xc98642).setStrokeStyle(2, 0x3a2b3a);
      const wheels = this.add.text(0, 8, "●     ●", { fontFamily: FONT, fontSize: "6px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
      const label = this.add.text(0, -4, kind === "cleaner" ? "CLEAN" : "CART", { fontFamily: FONT, fontSize: "6px", color: "#fff", resolution: 2 }).setOrigin(0.5);
      children.push(body, wheels, label);
    } else {
      const count = kind === "couple" ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const ox = count === 2 ? (i ? 8 : -8) : 0;
        children.push(this.add.circle(ox, -11, 5, i ? 0xe9b98f : 0xf1c8a3).setStrokeStyle(1, 0x4a342a));
        children.push(this.add.rectangle(ox, -1, 10, 15, i ? 0x7e75b8 : kind === "escalator" ? 0x6faaa2 : 0xe081a8).setStrokeStyle(1, 0x3a2b3a));
      }
    }
    const go = this.add.container(x, y, children).setDepth(y + 6);
    this.hazards.push({
      go, vx, vy,
      minX: vx ? CORRIDOR_LEFT + 20 : x - 8,
      maxX: vx ? CORRIDOR_RIGHT - 20 : x + 8,
      minY: vy ? y - 120 : y - 42,
      maxY: vy ? y + 120 : y + 42,
      radius: kind === "couple" || kind === "cart" || kind === "cleaner" ? 24 : 17,
      kind,
      nextStop: this.time.now + 1600 + this.hazards.length * 170,
      stoppedUntil: 0,
    });
  }

  private addInteractable(x: number, y: number, radius: number, prompt: string, trigger: () => void) {
    const entry: ShoppingInteractable = { x, y, radius, prompt, trigger, active: true };
    this.interactables.push(entry);
    return entry;
  }

  private enterStore(def: ShoppingStoreDef) {
    if (controls.locked || this.resultsOpen || this.babaMode === "fight" || this.babaMode === "intro") return;
    if (this.purchasedStores.has(def.id)) {
      this.speech(this.player.x, this.player.y - 24, `${def.name} ✓  One purchase. Keep moving.`, "#ddf4e8");
      return;
    }
    const visits = (this.storeVisits.get(def.id) ?? 0) + 1;
    this.storeVisits.set(def.id, visits);
    if (visits > 1 && (def.id === "cartier" || def.products.some((product) => product.stress >= 12))) {
      this.addStress(1, "Baba noticed the return visit.");
    }
    uiEvents.emit("choice", {
      kicker: `FLOOR ${def.floor} · ${def.side.toUpperCase()} STOREFRONT`,
      title: def.name,
      prompt: `${def.subtitle}\nChoose one. Baba receives the notification immediately.`,
      accent: `#${def.color.toString(16).padStart(6, "0")}`,
      cancelLabel: "Keep browsing",
      choices: def.products.map((product) => ({ id: product.id, label: product.name, description: product.description, icon: product.icon, badge: `STRESS +${product.stress}` })),
      onChoose: (productId: string) => {
        const product = def.products.find((entry) => entry.id === productId);
        if (product) this.purchase(def, product);
      },
    });
  }

  private purchase(def: ShoppingStoreDef, product: ShoppingProductDef) {
    if (this.purchasedStores.has(def.id)) return;
    this.purchasedStores.add(def.id);
    this.purchases.push({ store: def, product });
    this.storeMarks.get(def.id)?.setText("✓");
    this.addStress(product.stress, def.id === "cartier" ? "Somewhere in the mall, Baba felt a disturbance in the Force." : undefined);
    this.addUltimate(16);
    this.spawnBag(def);
    this.sparkle(this.player.x, this.player.y - 10, def.id === "cartier" ? "✦" : "$", def.id === "cartier" ? "#ffe08a" : "#7be0a3");
    this.speech(this.player.x, this.player.y - 30, `CHA-CHING · ${product.name} ✓`, "#ddf4e8");
    if (def.flirtOnPurchase && !this.lingerieFlirtShown) {
      this.lingerieFlirtShown = true;
      this.time.delayedCall(480, () => this.offerFlirtyMoment("lingerie"));
    }
  }

  private spawnBag(def: ShoppingStoreDef) {
    const index = this.bags.length;
    const w = 17 + (index % 3) * 3;
    const h = 20 + ((index + 1) % 3) * 4;
    const shadow = this.add.ellipse(0, h / 2 + 3, w + 8, 7, 0x201a27, 0.28);
    const bag = this.add.graphics();
    bag.fillStyle(def.color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 3);
    bag.lineStyle(2, def.accent, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 3);
    bag.lineStyle(2, 0xfff4e6, 0.92).beginPath().arc(0, -h / 2, Math.max(4, w * 0.26), Math.PI, Math.PI * 2).strokePath();
    bag.fillStyle(def.accent, 0.75).fillRect(-w / 2 + 3, -1, w - 6, 3);
    const label = this.add.text(0, 3, def.bagLabel, { fontFamily: FONT, fontSize: "5px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const go = this.add.container(def.side === "left" ? CORRIDOR_LEFT : CORRIDOR_RIGHT, def.y, [shadow, bag, label]).setDepth(this.player.y + 2).setScale(0.2).setAlpha(0.2);
    const visual: BagVisual = { go, phase: index * 0.73 };
    this.bags.push(visual);
    this.tweens.add({ targets: go, x: this.player.x, y: this.player.y, scale: 1, alpha: 1, angle: index % 2 ? 8 : -8, duration: 520, ease: "Back.out" });
  }

  private addStress(amount: number, line?: string) {
    const before = this.stress;
    this.stress = Phaser.Math.Clamp(this.stress + amount, 0, 100);
    if (this.stress > before) {
      this.cameras.main.flash(70, 255, 80, 110, false);
      if (line) this.speech(this.player.x, this.player.y - 36, line, "#ffd3d3");
      else if ((before < 25 && this.stress >= 25) || (before < 50 && this.stress >= 50) || (before < 75 && this.stress >= 75)) {
        const tierLine = this.stress >= 75 ? "Baba: JUJU WHAT DID YOU BUY" : this.stress >= 50 ? "Baba is watching the bank notifications." : "Baba: How many bags is that?";
        this.speech(this.player.x, this.player.y - 36, tierLine, this.stress >= 75 ? "#ff9ab3" : "#ffe08a");
      }
    }
    if (this.stress >= 100 && this.babaMode === "none" && this.purchases.length >= 4) this.startBabaBattle(Math.min(2280, this.player.y + 120));
    this.emitHud(true);
  }

  private addUltimate(amount: number) {
    const before = this.ultimate;
    this.ultimate = Phaser.Math.Clamp(this.ultimate + amount, 0, 100);
    if (before < 100 && this.ultimate >= 100 && this.checkpointResolved) this.ultimateReady();
    this.emitHud(true);
  }

  private ultimateReady() {
    if (this.ultimateUsed || controls.shoppingUltimateReady) return;
    controls.shoppingUltimateReady = true;
    this.cameras.main.flash(200, 99, 198, 232, false);
    this.bigMoment("ULTIMATE READY", "Q / SHIFT / TOUCH · SUMMON MOOMOO", "#63c6e8");
  }

  private offerFlirtyMoment(kind: "first" | "lingerie") {
    if (!this.sys.isActive() || this.resultsOpen || this.babaMode === "fight") return;
    if (!this.moomoo?.active) {
      this.moomoo = this.add.sprite(defSideX(this.player.x), this.player.y + 10, getVisualTexture(this, "char_moomoo"), 0).setOrigin(0.5, 0.85).setScale(1.22).setDepth(this.player.y + 2);
      this.moomoo.play("char_moomoo-idle-down", true);
      this.tweens.add({ targets: this.moomoo, x: this.player.x + 22, duration: 420, ease: "Back.out" });
    }
    uiEvents.emit("choice", {
      kicker: kind === "lingerie" ? "SOFT SECRETS · MOOMOO HAS ARRIVED" : "ESCALATOR LANDING · TINY ROMANCE DELAY",
      title: kind === "lingerie" ? "Extremely Supportive Shopping" : "Moomoo Distraction",
      prompt: kind === "lingerie" ? "Moomoo has suddenly become extremely supportive of shopping." : "Moomoo catches up, kisses Juju, and looks at the growing bag situation.",
      accent: "#e46d94",
      cancelLabel: "Behave (impossible)",
      choices: [
        { id: "kiss", label: "Kiss him", description: "One kiss. Three hearts. Shopping resumes.", icon: "♥" },
        { id: "bite", label: "Playful love bite", description: "Mutual, tiny, and devastating to concentration.", icon: "🫪" },
        { id: "tease", label: "Tease him", description: "Ask whether he volunteered to carry everything.", icon: "✦" },
        { id: "pull", label: "Pull him closer", description: "The bags politely look away.", icon: "♡" },
      ],
      onChoose: (choice: string) => this.finishFlirtyMoment(choice, kind),
    });
  }

  private finishFlirtyMoment(choice: string, kind: "first" | "lingerie") {
    this.flirtyMoments += 1;
    this.addUltimate(8);
    const lines: Record<string, string> = {
      kiss: "Juju kisses him back. Shopping can wait half a second.",
      bite: "Moomoo: ...I was trying to discuss the bags.",
      tease: "Moomoo: I support shopping. From a safe distance.",
      pull: "Juju pulls him closer. Moomoo forgets the original question.",
    };
    this.reactionEmoji();
    this.speech(this.player.x, this.player.y - 36, kind === "lingerie" ? "Moomoo is now extremely invested. 🫪" : lines[choice] ?? "🫪", "#ffd7e6");
    if (this.moomoo) {
      this.moomoo.setDepth(this.player.y + 3);
      this.tweens.add({ targets: this.moomoo, x: defSideX(this.player.x), alpha: 0, duration: 850, delay: 650, onComplete: () => {
        if (!controls.shoppingUltimateActive) { this.moomoo?.destroy(); this.moomoo = undefined; }
      } });
    }
  }

  private reactionEmoji() {
    const heart = this.add.text(this.player.x + 7, this.player.y - 43, "♥", { fontFamily: FONT, fontSize: "18px", color: "#ff5c8a", stroke: "#fff", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(this.player.y + 50);
    const emoji = this.add.text(this.player.x, this.player.y - 49, "🫪", { fontFamily: EMOJI_FONT, fontSize: "25px", color: "#fff", backgroundColor: "rgba(255,255,255,0.82)", padding: { x: 5, y: 2 }, resolution: 2 }).setOrigin(0.5).setDepth(this.player.y + 51);
    this.tweens.add({ targets: [heart, emoji], y: "-=18", scale: 1.18, alpha: 0, duration: 1050, ease: "Cubic.out", onComplete: () => { heart.destroy(); emoji.destroy(); } });
  }

  private tryCheckpoint() {
    if (this.checkpointResolved || this.babaMode !== "none") return;
    if (this.purchases.length < 4) {
      this.player.y = Math.min(this.player.y, 2422);
      if (this.time.now - this.checkpointDeniedAt > 1500) {
        this.checkpointDeniedAt = this.time.now;
        this.speech(this.player.x, this.player.y - 30, `Baba: You crossed three floors for ${this.purchases.length} bags? Go choose something.`, "#ffe08a");
      }
      return;
    }
    if (this.stress >= 70) this.startBabaBattle(2505);
    else this.runSensibleCheckpoint();
  }

  private runSensibleCheckpoint() {
    if (this.babaMode !== "none") return;
    this.babaMode = "intro";
    this.baba = this.add.sprite(WORLD_W / 2, 2510, getVisualTexture(this, "char_baba"), 0).setOrigin(0.5, 0.85).setScale(1.25).setDepth(2514);
    this.baba.play("char_baba-idle-down", true);
    this.afterDialogue("Baba", ["...that's it?", "Juju: Do you want me to go back?", "Baba: KEEP WALKING."], () => {
      this.babaMode = "avoided";
      this.checkpointResolved = true;
      this.addUltimate(40);
      if (this.ultimate >= 100) this.ultimateReady();
      this.speech(this.player.x, this.player.y - 30, "BABA BATTLE AVOIDED · suspiciously sensible", "#ddf4e8");
    });
  }

  private startBabaBattle(atY: number) {
    if (this.babaMode !== "none") return;
    this.babaMode = "intro";
    this.bossTop = Phaser.Math.Clamp(atY - 110, 1000, WORLD_H - 520);
    this.bossBottom = this.bossTop + 330;
    this.player.setPosition(WORLD_W / 2, this.bossTop + 58);
    this.baba = this.add.sprite(WORLD_W / 2, this.bossBottom - 46, getVisualTexture(this, "char_baba"), 0).setOrigin(0.5, 0.85).setScale(1.35).setDepth(this.bossBottom);
    this.baba.play("char_baba-idle-down", true);
    this.bossDefense = Math.max(4, this.purchases.length);
    this.receiptAmmo = this.bossDefense;
    this.buildBossPools();
    this.cameras.main.zoomTo(Math.max(0.92, this.cameras.main.zoom * 0.9), 350, "Sine.easeOut");
    this.bigMoment("BABA RECEIPT BATTLE", "CRUMPLED RECEIPTS VS BUDGET DEFENSE", "#ff6d91");
    this.afterDialogue("Baba", [
      this.purchasedStores.has("cartier") ? "CARTIER??" : "YOU SAID ONE STORE.",
      "Juju: It was basically an investment.",
      "Baba: SHOW ME THE RECEIPTS.",
      "ACTION · throw receipts. Move to dodge budget warnings.",
    ], () => {
      this.babaMode = "fight";
      controls.locked = false;
      this.emitHud(true);
    });
  }

  private buildBossPools() {
    for (let i = 0; i < 8; i += 1) {
      const paper = this.add.circle(0, 0, 7, 0xfff9f0).setStrokeStyle(2, 0x8a7a6a);
      const ink = this.add.text(0, 0, "≋", { fontFamily: FONT, fontSize: "8px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
      const receipt = this.add.container(-100, -100, [paper, ink]).setVisible(false).setActive(false).setDepth(9000);
      this.receiptPool.push(receipt);
    }
    for (let i = 0; i < 6; i += 1) {
      const bubble = this.add.text(-100, -100, "", { fontFamily: FONT, fontSize: "9px", color: "#fff", align: "center", backgroundColor: i % 2 ? "#d84652" : "#3a2b3a", padding: { x: 7, y: 5 }, resolution: 2 }).setOrigin(0.5).setVisible(false).setActive(false).setDepth(8500);
      const go = this.add.container(-100, -100, [bubble]).setVisible(false).setActive(false).setDepth(8500);
      go.setData("vx", 0).setData("vy", 0);
      this.bossHazardPool.push(go);
    }
  }

  private throwReceipt() {
    if (this.babaMode !== "fight" || this.receiptAmmo <= 0 || this.time.now - this.lastReceipt < 260 || !this.baba) return;
    const receipt = this.receiptPool.find((entry) => !entry.active);
    if (!receipt) return;
    this.lastReceipt = this.time.now;
    this.receiptAmmo -= 1;
    receipt.setActive(true).setVisible(true).setPosition(this.player.x, this.player.y - 9).setScale(0.65).setAlpha(1).setAngle(0);
    const tx = this.baba.x;
    const ty = this.baba.y - 12;
    this.tweens.add({ targets: receipt, x: tx, y: ty, angle: 540, scale: 1.12, duration: 440, ease: "Quad.in", onComplete: () => {
      receipt.setActive(false).setVisible(false).setPosition(-100, -100);
      if (this.babaMode !== "fight") return;
      this.bossDefense -= 1;
      this.paperBurst(tx, ty);
      this.cameras.main.shake(70, 0.003);
      this.speech(this.baba?.x ?? tx, (this.baba?.y ?? ty) - 25, BABA_LINES[(this.purchases.length + this.bossDefense) % BABA_LINES.length], "#ffd3d3");
      if (this.bossDefense <= 0) this.finishBabaBattle();
      this.emitHud(true);
    } });
  }

  private updateBabaBattle(time: number, delta: number) {
    if (this.babaMode !== "fight" || !this.baba) return;
    this.baba.x = WORLD_W / 2 + Math.sin(time * 0.0022) * 125;
    this.baba.setDepth(this.baba.y + 3);
    if (time - this.lastBossHazard > 1250) {
      this.lastBossHazard = time;
      const hazard = this.bossHazardPool.find((entry) => !entry.active);
      if (hazard) {
        const labels = ["NO MORE\nSHOPPING", "80085", "BUDGET\nWARNING", "CALCULATOR", "WALLET\nSHIELD"];
        (hazard.first as Phaser.GameObjects.Text).setText(labels[(this.bossDefense + this.collisions) % labels.length]);
        hazard.setActive(true).setVisible(true).setPosition(this.baba.x, this.baba.y - 12);
        const dx = this.player.x - this.baba.x;
        const dy = this.player.y - this.baba.y;
        const length = Math.hypot(dx, dy) || 1;
        hazard.setData("vx", (dx / length) * 112).setData("vy", (dy / length) * 112);
      }
    }
    const speedScale = controls.shoppingUltimateActive ? 0.35 : 1;
    for (const hazard of this.bossHazardPool) {
      if (!hazard.active) continue;
      hazard.x += Number(hazard.getData("vx")) * (delta / 1000) * speedScale;
      hazard.y += Number(hazard.getData("vy")) * (delta / 1000) * speedScale;
      hazard.angle += delta * 0.035;
      if (Phaser.Math.Distance.Between(hazard.x, hazard.y, this.player.x, this.player.y) < 24) {
        hazard.setActive(false).setVisible(false);
        this.player.x = Phaser.Math.Clamp(this.player.x + (this.player.x < this.baba.x ? -28 : 28), CORRIDOR_LEFT + 15, CORRIDOR_RIGHT - 15);
        this.bagSwing = 26;
        this.cameras.main.shake(90, 0.005);
        this.speech(this.player.x, this.player.y - 28, "Wallet shield! The bags disagree.", "#ffe08a");
      } else if (hazard.y < this.bossTop - 80 || hazard.y > this.bossBottom + 80 || hazard.x < CORRIDOR_LEFT - 40 || hazard.x > CORRIDOR_RIGHT + 40) {
        hazard.setActive(false).setVisible(false);
      }
    }
  }

  private finishBabaBattle() {
    if (this.babaMode !== "fight") return;
    this.babaMode = "won";
    this.checkpointResolved = true;
    this.bossHazardPool.forEach((entry) => entry.setActive(false).setVisible(false));
    this.bigMoment("BABA DEFEATED", "financially, emotionally, spiritually", "#ffe08a");
    this.addUltimate(40);
    this.sparkle(this.baba?.x ?? WORLD_W / 2, this.baba?.y ?? this.player.y, "≋", "#fff");
    this.afterDialogue("Baba", ["Fine. ONE more store.", "Juju: You always say that.", JUJU_LINES[this.purchases.length % JUJU_LINES.length]], () => {
      this.receiptAmmo = 0;
      this.cameras.main.zoomTo(Phaser.Math.Clamp(Math.min(this.scale.gameSize.width / 800, this.scale.gameSize.height / 430), 0.78, 1.45), 380, "Sine.easeInOut");
      if (this.ultimate >= 100) this.ultimateReady();
    });
  }

  private activateUltimate() {
    if (!controls.shoppingUltimateReady || this.ultimateUsed || this.resultsOpen || !this.checkpointResolved || this.babaMode === "fight" || this.babaMode === "intro") return;
    this.ultimateUsed = true;
    controls.shoppingUltimateReady = false;
    controls.shoppingUltimateActive = true;
    controls.locked = true;
    this.ultimateEndsAt = this.time.now + 15000;
    this.cameras.main.flash(420, 255, 255, 255, false);
    this.cameras.main.shake(180, 0.006);
    this.bigMoment("MOOMOO BAG RESCUE", "EVERY BAG TRANSFER INITIATED", "#ff8fae");
    this.moomoo?.destroy();
    this.moomoo = this.add.sprite(CORRIDOR_RIGHT + 135, this.player.y + 10, getVisualTexture(this, "char_moomoo"), 0).setOrigin(0.5, 0.85).setScale(1.28).setDepth(this.player.y + 5);
    this.moomoo.play("char_moomoo-walk-side", true).setFlipX(true);
    this.tweens.add({ targets: this.moomoo, x: this.player.x + 52, duration: 720, ease: "Back.out", onComplete: () => {
      this.moomoo?.play("char_moomoo-idle-down", true).setFlipX(false);
      this.bags.forEach((bag, index) => this.tweens.add({ targets: bag.go, x: (this.moomoo?.x ?? this.player.x) + (index % 2 ? 12 : -12), y: (this.moomoo?.y ?? this.player.y) - Math.floor(index / 2) * 12, angle: index % 2 ? 7 : -7, duration: 420 + index * 45, ease: "Back.out" }));
    } });
    this.time.delayedCall(900, () => {
      this.bigMoment("MOCK LIGHT SPEED", "15 SECONDS · FINAL STORES · GO GO GO", "#63c6e8");
      controls.locked = false;
      this.cameras.main.zoomTo(Math.max(0.75, this.cameras.main.zoom * 0.86), 320, "Sine.easeOut");
      this.speech(this.moomoo?.x ?? this.player.x, (this.moomoo?.y ?? this.player.y) - 34, "WHY ARE THERE SO MANY", "#ffd7e6");
      this.emitHud(true);
    });
  }

  private updateUltimate(time: number) {
    if (!controls.shoppingUltimateActive) return;
    if (time >= this.ultimateEndsAt) {
      controls.shoppingUltimateActive = false;
      this.cameras.main.zoomTo(Phaser.Math.Clamp(Math.min(this.scale.gameSize.width / 800, this.scale.gameSize.height / 430), 0.78, 1.45), 450, "Sine.easeInOut");
      this.speech(this.player.x, this.player.y - 32, "Mock light speed cooling down. Moomoo still has the bags.", "#ddf4e8");
      this.emitHud(true);
      return;
    }
    if (time - this.lastAfterimage > 95) {
      this.lastAfterimage = time;
      const ghost = this.add.sprite(this.player.x, this.player.y, this.player.texture.key, this.player.frame.name).setOrigin(0.5, 0.85).setScale(1.22).setFlipX(this.player.flipX).setTint(0x8fe9ff).setAlpha(0.34).setDepth(this.player.y - 3);
      this.tweens.add({ targets: ghost, alpha: 0, x: ghost.x - this.previousMoveX * 12, duration: 360, onComplete: () => ghost.destroy() });
      const streak = this.add.text(this.player.x - this.previousMoveX * 13, this.player.y + Phaser.Math.Between(-15, 8), "✦—", { fontFamily: FONT, fontSize: "10px", color: "#fff", resolution: 2 }).setOrigin(0.5).setDepth(this.player.y - 2);
      this.tweens.add({ targets: streak, x: streak.x - this.previousMoveX * 45, alpha: 0, duration: 300, onComplete: () => streak.destroy() });
    }
    if (this.moomoo && time - this.lastCarrierLine > 3900) {
      this.lastCarrierLine = time;
      const lines = ["WHY ARE THERE SO MANY", "IS THIS BAG HOLDING OTHER BAGS", "JUJU GO", "I CAN'T SEE", "WHY IS CARTIER SO HEAVY", "MY ARMS HAVE LEFT THE CHAT"];
      this.speech(this.moomoo.x, this.moomoo.y - 42, lines[(this.bags.length + Math.floor(time / 3900)) % lines.length], "#ffd7e6");
    }
  }

  private updateBagVisuals(time: number) {
    this.bagSwing *= 0.9;
    const carrier = this.ultimateUsed && this.moomoo?.active ? this.moomoo : this.player;
    const moving = Math.abs((this.player.body as Phaser.Physics.Arcade.Body).velocity.x) + Math.abs((this.player.body as Phaser.Physics.Arcade.Body).velocity.y) > 5;
    this.bags.forEach((bag, index) => {
      const side = index % 2 ? 1 : -1;
      const row = Math.floor(index / 2);
      const carryX = this.ultimateUsed ? side * (11 + Math.min(row, 2) * 4) : side * (13 + Math.min(row, 3) * 6);
      const carryY = this.ultimateUsed ? -5 - row * 11 : 3 + row * 7;
      const sway = Math.sin(time * 0.008 + bag.phase) * (moving ? 4 + row : 1.5) + side * this.bagSwing * (0.18 + row * 0.08);
      bag.go.x = Phaser.Math.Linear(bag.go.x, carrier.x + carryX + sway, this.ultimateUsed ? 0.1 : 0.16);
      bag.go.y = Phaser.Math.Linear(bag.go.y, carrier.y + carryY + Math.abs(Math.sin(time * 0.01 + bag.phase)) * 2, this.ultimateUsed ? 0.1 : 0.16);
      bag.go.angle = Phaser.Math.Linear(bag.go.angle, side * Math.sin(time * 0.007 + bag.phase) * (3 + row) + side * this.bagSwing, 0.12);
      bag.go.setDepth(this.ultimateUsed ? carrier.y + 2 + index * 0.01 : carrier.y + (index < 2 ? 2 : -2) + index * 0.01);
    });
    if (this.moomoo?.active && this.ultimateUsed) {
      const tx = this.player.x + (this.previousMoveX >= 0 ? -50 : 50);
      const ty = this.player.y + 18;
      this.moomoo.x = Phaser.Math.Linear(this.moomoo.x, tx, 0.055);
      this.moomoo.y = Phaser.Math.Linear(this.moomoo.y, ty, 0.055);
      this.moomoo.setDepth(this.moomoo.y + 1);
    }
  }

  private updateHazards(time: number, delta: number) {
    const relative = controls.shoppingUltimateActive ? 0.42 : 1;
    for (const hazard of this.hazards) {
      if (hazard.kind === "shopper" && time >= hazard.nextStop && hazard.stoppedUntil === 0) {
        hazard.stoppedUntil = time + 900;
        hazard.nextStop = time + 4200;
      }
      const stopped = time < hazard.stoppedUntil;
      if (!stopped) {
        hazard.stoppedUntil = 0;
        hazard.go.x += hazard.vx * (delta / 1000) * relative;
        hazard.go.y += hazard.vy * (delta / 1000) * relative;
      }
      if (hazard.go.x <= hazard.minX || hazard.go.x >= hazard.maxX) hazard.vx *= -1;
      if (hazard.go.y <= hazard.minY || hazard.go.y >= hazard.maxY) hazard.vy *= -1;
      hazard.go.setDepth(hazard.go.y + 5);
      if (controls.shoppingUltimateActive || controls.locked || time - this.lastCollision < 850) continue;
      if (Phaser.Math.Distance.Between(hazard.go.x, hazard.go.y, this.player.x, this.player.y) >= hazard.radius + 10) continue;
      this.lastCollision = time;
      this.collisions += 1;
      this.addStress(2);
      const push = this.player.x < hazard.go.x ? -25 : 25;
      this.player.x = Phaser.Math.Clamp(this.player.x + push, CORRIDOR_LEFT + 8, CORRIDOR_RIGHT - 8);
      this.bagSwing = push * 0.8;
      this.cameras.main.shake(85, 0.004);
      this.tweens.add({ targets: this.player, angle: push > 0 ? 9 : -9, duration: 90, yoyo: true, ease: "Sine.inOut" });
      this.scatterBag();
      this.speech(this.player.x, this.player.y - 28, COLLISION_LINES[this.collisions % COLLISION_LINES.length], "#ffe08a");
    }
  }

  private scatterBag() {
    const bag = this.bags[this.bags.length - 1]?.go;
    if (!bag) return;
    const ox = bag.x;
    const oy = bag.y;
    this.tweens.add({ targets: bag, x: bag.x + Phaser.Math.Between(-40, 40), y: bag.y + 22, angle: bag.angle + 80, duration: 180, yoyo: true, hold: 150, ease: "Quad.out", onComplete: () => bag.setPosition(ox, oy) });
  }

  private handleAction() {
    if (controls.locked || this.resultsOpen) return;
    if (this.babaMode === "fight") {
      this.throwReceipt();
      return;
    }
    if (!this.current || this.time.now - this.lastInteract < 220) return;
    this.lastInteract = this.time.now;
    this.current.trigger();
  }

  private finishAtCheckout() {
    if (this.resultsOpen) return;
    if (!this.checkpointResolved) {
      this.speech(this.player.x, this.player.y - 28, "Baba checkpoint first. There is no financial escape hatch.", "#ffe08a");
      return;
    }
    this.resultsOpen = true;
    controls.locked = true;
    this.player.move(0, 0);
    this.persistShoppingResults();
    const seconds = Math.max(1, Math.round((this.time.now - this.startedAt) / 1000));
    const bought = this.purchases.map((entry) => `${entry.product.icon} ${entry.product.name}`).join("  ·  ");
    uiEvents.emit("choice", {
      kicker: "THE CARD SURVIVED · BABA NEEDS TEA",
      title: "BABA SHOPPING REPORT",
      prompt: [
        `${this.purchases.length}/8 stores · ${this.bags.length} bags · Baba Stress ${Math.round(this.stress)}%`,
        `Baba battle: ${this.babaMode === "won" ? "WON" : "AVOIDED"} · Pedestrian collisions: ${this.collisions}`,
        `Flirty moments 🫪: ${this.flirtyMoments} · Ultimate: ${this.ultimateUsed ? "MOOMOO BAG RESCUE" : "saved for another day"}`,
        `Shopping time: ${this.formatTime(seconds)}`,
        bought || "Somehow, nothing was purchased.",
      ].join("\n"),
      accent: "#f4c95d",
      cancelLabel: "Keep admiring the receipts",
      choices: [{ id: "leave", label: "Return to the mall", description: "Moomoo carries the bags. Baba goes home.", icon: "✓" }],
      onChoose: () => this.completeAndReturn(),
    });
  }

  private persistShoppingResults() {
    if (this.resultsPersisted) return;
    this.resultsPersisted = true;
    for (const { product } of this.purchases) {
      if (product.rewardType === "outfit") {
        store.setFlag(`shopping_reward_${product.rewardId}`);
        store.unlockOutfit(product.rewardId, true);
      } else if (product.rewardType === "accessory") store.unlockAccessory(product.rewardId);
      else if (product.rewardType === "item") store.addItem(product.rewardId);
      else store.unlockKeepsake(product.rewardId);
    }
    if (this.purchases.length) store.incrementStat("shopping_bags", this.purchases.length);
    if (this.collisions) store.incrementStat("mall_collisions", this.collisions);
    if (this.flirtyMoments) store.incrementStat("flirty_moments", this.flirtyMoments);
    if (this.babaMode === "won") store.incrementStat("baba_budget_battles_won");
    if (this.ultimateUsed) store.incrementStat("shopping_ultimate_uses");
    const seconds = Math.max(1, Math.round((this.time.now - this.startedAt) / 1000));
    store.recordShoppingRun({
      id: `shopping-${Date.now()}`,
      mallId: this.mallId,
      day: store.state.currentDay,
      productIds: this.purchases.map((entry) => entry.product.id),
      babaStress: Math.round(this.stress),
      babaBattle: this.babaMode === "won" ? "won" : "avoided",
      collisions: this.collisions,
      flirtyMoments: this.flirtyMoments,
      ultimateUsed: this.ultimateUsed,
      seconds,
    });
  }

  private completeAndReturn() {
    quests.onMinigame("shopping_spree");
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.Mall, { mallId: this.mallId });
  }

  private afterDialogue(name: string, lines: string[], done?: () => void) {
    controls.locked = true;
    const closed = () => {
      uiEvents.off("dialogueClosed", closed);
      this.dialogueClosers.delete(closed);
      if (!this.sys.isActive()) return;
      controls.locked = false;
      done?.();
    };
    this.dialogueClosers.add(closed);
    uiEvents.once("dialogueClosed", closed);
    uiEvents.emit("dialogue", name, lines);
  }

  private speech(x: number, y: number, text: string, color = "#fff4e6") {
    const width = Phaser.Math.Clamp(text.length * 5.7, 80, 280);
    const line = this.add.text(x, y, text, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", backgroundColor: color, padding: { x: 6, y: 4 }, align: "center", wordWrap: { width }, resolution: 2 }).setOrigin(0.5, 1).setDepth(y + 120);
    this.tweens.add({ targets: line, y: y - 14, alpha: 0, duration: 1450, ease: "Cubic.out", onComplete: () => line.destroy() });
  }

  private sparkle(x: number, y: number, symbol: string, color: string) {
    for (let i = 0; i < 9; i += 1) {
      const particle = this.add.text(x, y, symbol, { fontFamily: FONT, fontSize: `${8 + (i % 3) * 2}px`, color: i % 2 ? color : "#fff", resolution: 2 }).setOrigin(0.5).setDepth(y + 160);
      const angle = (Math.PI * 2 * i) / 9;
      this.tweens.add({ targets: particle, x: x + Math.cos(angle) * (28 + i * 2), y: y + Math.sin(angle) * 24, alpha: 0, angle: 120, duration: 520, onComplete: () => particle.destroy() });
    }
  }

  private paperBurst(x: number, y: number) {
    for (let i = 0; i < 11; i += 1) {
      const paper = this.add.rectangle(x, y, 5 + (i % 2) * 3, 3, 0xfff9f0).setStrokeStyle(1, 0x8a7a6a).setDepth(y + 100);
      const angle = (Math.PI * 2 * i) / 11;
      this.tweens.add({ targets: paper, x: x + Math.cos(angle) * Phaser.Math.Between(20, 48), y: y + Math.sin(angle) * Phaser.Math.Between(18, 40), angle: 180, alpha: 0, duration: 480, onComplete: () => paper.destroy() });
    }
  }

  private bigMoment(title: string, subtitle: string, color: string) {
    const centerX = this.cameras.main.worldView.centerX;
    const centerY = this.cameras.main.worldView.centerY;
    const panel = this.add.rectangle(0, 0, 470, 88, 0x211a28, 0.94).setStrokeStyle(4, Phaser.Display.Color.HexStringToColor(color).color);
    const heading = this.add.text(0, -15, title, { fontFamily: FONT, fontSize: "25px", color, fontStyle: "bold", stroke: "#151119", strokeThickness: 4, resolution: 2 }).setOrigin(0.5);
    const sub = this.add.text(0, 19, subtitle, { fontFamily: FONT, fontSize: "11px", color: "#fff", resolution: 2 }).setOrigin(0.5);
    const container = this.add.container(centerX, centerY, [panel, heading, sub]).setDepth(20000).setScale(0.72).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 220, ease: "Back.out", hold: 950, yoyo: true, onComplete: () => container.destroy(true) });
  }

  private emitHud(force = false) {
    if (!force && this.time.now - this.lastHud < 180) return;
    this.lastHud = this.time.now;
    const seconds = Math.max(0, Math.round((this.time.now - this.startedAt) / 1000));
    uiEvents.emit("shoppingHud", {
      stress: this.stress,
      ultimate: this.ultimate,
      bags: this.bags.length,
      stores: this.purchases.length,
      time: this.formatTime(seconds),
      boss: this.babaMode === "fight" ? `BUDGET DEFENSE ${Math.max(0, this.bossDefense)}` : undefined,
      receipts: this.babaMode === "fight" ? this.receiptAmmo : undefined,
      ultimateActive: controls.shoppingUltimateActive,
    });
  }

  private formatTime(seconds: number) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  private shutdownShopping() {
    uiEvents.off("action", this.handleAction, this);
    uiEvents.off("shoppingUltimate", this.activateUltimate, this);
    for (const closed of this.dialogueClosers) uiEvents.off("dialogueClosed", closed);
    this.dialogueClosers.clear();
    this.scale.off("resize", this.applyCameraZoom, this);
    uiEvents.emit("prompt", null);
    uiEvents.emit("shoppingHud", null);
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    controls.shoppingUltimateReady = false;
    controls.shoppingUltimateActive = false;
  }

  update(time: number, delta: number) {
    if (!this.player) return;
    let vx = 0;
    let vy = 0;
    const canMove = !controls.locked && !this.resultsOpen;
    if (canMove) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.handleAction();
      if (Phaser.Input.Keyboard.JustDown(this.keys.Q) || Phaser.Input.Keyboard.JustDown(this.keys.SHIFT)) this.activateUltimate();
    }
    const length = Math.hypot(vx, vy);
    if (length > 1) { vx /= length; vy /= length; }
    if (vx && this.previousMoveX && Math.sign(vx) !== Math.sign(this.previousMoveX) && this.bags.length >= 3) this.bagSwing = Math.sign(vx) * Math.min(20, 7 + this.bags.length * 1.7);
    if (vx) this.previousMoveX = vx;

    let penalty = this.bags.length <= 2 ? 1 : this.bags.length <= 4 ? 0.94 : this.bags.length <= 6 ? 0.87 : 0.8;
    if (this.ultimateUsed) penalty = 1;
    const runnerMode = canMove && this.babaMode !== "fight" && this.babaMode !== "intro";
    let speedBoost = controls.shoppingUltimateActive ? 2.65 : 1;
    if (time - this.lastCollision < 360 && !controls.shoppingUltimateActive) speedBoost *= 0.56;
    let moveX = canMove ? vx * RUNNER_DART_SPEED * penalty * speedBoost : 0;
    // Juju is always advancing down the promenade. Up is a strong brake/reverse
    // for a missed storefront; Down turns the event into a full sprint.
    let moveY = runnerMode
      ? (AUTO_RUN_SPEED + vy * 155) * penalty * speedBoost
      : canMove ? vy * this.player.speed * penalty * speedBoost : 0;
    let carriedY = 0;
    for (const escalator of this.escalators) {
      if (this.player.x < escalator.x || this.player.x > escalator.x + escalator.w || this.player.y < escalator.y || this.player.y > escalator.y + escalator.h) continue;
      carriedY += 42 * escalator.direction;
      if (Math.sign(vy) === escalator.direction) carriedY += 25 * escalator.direction;
      if (Math.sign(vy) === -escalator.direction) moveY *= 0.58;
      if (controls.shoppingUltimateActive) carriedY *= 1.7;
    }
    for (const stairs of this.stairs) {
      if (this.player.x < stairs.x || this.player.x > stairs.x + stairs.w || this.player.y < stairs.y || this.player.y > stairs.y + stairs.h) continue;
      // Stairs are manual: slower if Juju coasts, a useful shortcut if the player
      // actively pushes forward, and harder than the escalator with many bags.
      moveY *= vy > 0 ? 1.18 : vy < 0 ? 0.82 : 0.64;
      moveX *= 0.86;
    }
    this.player.move(moveX, moveY + carriedY);
    this.player.x = Phaser.Math.Clamp(this.player.x, CORRIDOR_LEFT + 5, CORRIDOR_RIGHT - 5);
    this.player.y = Phaser.Math.Clamp(this.player.y, 88, WORLD_H - 45);
    if (this.babaMode === "fight") {
      this.player.x = Phaser.Math.Clamp(this.player.x, CORRIDOR_LEFT + 20, CORRIDOR_RIGHT - 20);
      this.player.y = Phaser.Math.Clamp(this.player.y, this.bossTop, this.bossBottom);
    }

    this.updateHazards(time, delta);
    this.updateBabaBattle(time, delta);
    this.updateUltimate(time);
    this.updateBagVisuals(time);
    if (!this.firstFlirtShown && this.player.y > 1120 && this.purchases.length >= 2 && this.babaMode === "none") {
      this.firstFlirtShown = true;
      this.offerFlirtyMoment("first");
    }
    if (this.player.y > 2415 && !this.checkpointResolved && this.babaMode === "none") this.tryCheckpoint();
    if (this.player.y > 2445 && !this.checkpointResolved && this.babaMode === "none") this.player.y = 2418;

    if (time - this.startedAt > 60000 && time - this.lastTimeStress > 30000 && this.stress < 99 && this.babaMode === "none") {
      this.lastTimeStress = time;
      this.addStress(1, "Baba checked the time. This is not a timer. It is judgment.");
    }
    const act = this.player.y < 850 ? 1 : this.player.y < 1720 ? 2 : this.player.y < 2450 ? 3 : this.player.y < 2870 ? 4 : 5;
    if (!this.actShown.has(act)) {
      this.actShown.add(act);
      const titles = ["", "ACT 1 · NORMAL SHOPPING", "ACT 2 · BAG CHAOS", "ACT 3 · BABA", "ACT 4 · MOOMOO", "FINALE · CHECKOUT"];
      const subs = ["", "This seems manageable.", "It is no longer manageable.", "The bank notifications have arrived.", "MOCK LIGHT SPEED awaits.", "Everybody survived the mall."];
      this.bigMoment(titles[act], subs[act], act >= 3 ? "#ff8fae" : "#63c6e8");
    }

    let nearest: ShoppingInteractable | undefined;
    let nearestDistance = Infinity;
    for (const entry of this.interactables) {
      if (entry.active === false) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.x, entry.y);
      if (distance <= entry.radius && distance < nearestDistance) { nearest = entry; nearestDistance = distance; }
    }
    if (nearest !== this.current) {
      this.current = nearest;
      uiEvents.emit("prompt", nearest?.prompt ?? null);
    }
    this.emitHud();
  }
}

function defSideX(playerX: number) {
  return playerX < WORLD_W / 2 ? CORRIDOR_RIGHT + 70 : CORRIDOR_LEFT - 70;
}
