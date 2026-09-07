import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { store } from "../systems/store";
import { controls, uiEvents, minimap } from "../systems/controls";
import { activeQuests, type ActiveQuest } from "../systems/quests";
import { Outfits } from "../palette";
import { OUTFIT_UNLOCKS } from "../data/outfits";
import { rebuildPlayerTexture } from "../textures";
import { PhoneOverlay, type PhoneTab } from "../ui/PhoneOverlay";
import { openActivity, type MiniSpec } from "../ui/minigames";
import { NPCS } from "../data/npcs";
import { ITEMS } from "../data/items";
import * as quests from "../systems/quests";
import type { QuestDef, QuestStep } from "../data/quests";

const FONT = "monospace";

type ButtonImage = Phaser.GameObjects.Image & { label: Phaser.GameObjects.Text };

export class UIScene extends Phaser.Scene {
  private heartIcon!: Phaser.GameObjects.Image;
  private coinIcon!: Phaser.GameObjects.Image;
  private heartText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private questPanel!: Phaser.GameObjects.Graphics;
  private questIcon!: Phaser.GameObjects.Image;
  private questKicker!: Phaser.GameObjects.Text;
  private questTitle!: Phaser.GameObjects.Text;
  private questNext!: Phaser.GameObjects.Text;
  private questHelp!: Phaser.GameObjects.Text;
  private questCount!: Phaser.GameObjects.Text;
  private questHit!: Phaser.GameObjects.Rectangle;
  private mapGuide?: Phaser.GameObjects.Text;
  private questIndex = 0;
  private promptText!: Phaser.GameObjects.Text;
  private dedicatedStatus!: Phaser.GameObjects.Text;
  private dedicatedStatusActive = false;

  // joystick
  private joyBase!: Phaser.GameObjects.Image;
  private joyThumb!: Phaser.GameObjects.Image;
  private joyPointerId = -1;
  private joyCenter = new Phaser.Math.Vector2();
  private readonly joyRadius = 54;

  // buttons (plain interactive images + a text label stored on `.label`)
  private actionBtn!: Phaser.GameObjects.Image;
  private mapBtn!: Phaser.GameObjects.Image;
  private fitBtn!: Phaser.GameObjects.Image;
  private phoneBtn!: Phaser.GameObjects.Image;
  private phoneBadge!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private phone!: PhoneOverlay;
  private giftMenu?: Phaser.GameObjects.Container;
  private foodMenu?: Phaser.GameObjects.Container;
  private choiceMenu?: Phaser.GameObjects.Container;
  private cameraHud?: Phaser.GameObjects.Container;
  private pendingGiftNpc?: string;

  // dialogue
  private dlg!: Phaser.GameObjects.Container;
  private dlgName!: Phaser.GameObjects.Text;
  private dlgText!: Phaser.GameObjects.Text;
  private dlgLines: string[] = [];
  private dlgIndex = 0;
  private dlgOpenAt = 0;
  private dialogueOpen = false;

  // overlays
  private wardrobe!: Phaser.GameObjects.Container;
  private shop!: Phaser.GameObjects.Container;
  private wardrobeOpen = false;
  private shopOpen = false;
  private shopMode: "home" | "adnoc" = "home";
  private localMapOpen = false;
  private miniGameOpen = false;
  private miniGame?: Phaser.GameObjects.Container;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private miniG!: Phaser.GameObjects.Graphics;
  private miniRing!: Phaser.GameObjects.Graphics;
  private miniMaskG!: Phaser.GameObjects.Graphics;
  private miniLabel!: Phaser.GameObjects.Text;
  private miniN!: Phaser.GameObjects.Text;
  private miniHit!: Phaser.GameObjects.Zone;
  private miniCx = 68;
  private miniCy = 68;
  private readonly miniR = 52;

  private localMap!: Phaser.GameObjects.Container;
  private localPanel!: Phaser.GameObjects.Graphics;
  private localG!: Phaser.GameObjects.Graphics;
  private localTitle!: Phaser.GameObjects.Text;
  private localLegend!: Phaser.GameObjects.Text;
  private localPins: Phaser.GameObjects.Text[] = [];
  private dedicatedHud = false;
  private questCelebration?: Phaser.GameObjects.Container;
  private pendingMilestone?: { title: string; dialogue: string };

  constructor() {
    super({ key: SceneKeys.UI, active: false });
  }

  create() {
    const { width, height } = this.scale.gameSize;

    this.buildMinimap();

    // ---- HUD (top-left; GPS lives bottom-left) ----
    this.heartIcon = this.add.image(20, 22, "ui_heart").setScrollFactor(0).setScale(1.6).setDepth(20);
    this.heartText = this.add
      .text(34, 15, `${store.state.hearts}`, { fontFamily: FONT, fontSize: "16px", color: "#fff", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 })
      .setScrollFactor(0)
      .setDepth(20);
    this.coinIcon = this.add.image(20, 46, "ui_coin").setScrollFactor(0).setScale(1.6).setDepth(20);
    this.coinText = this.add
      .text(34, 39, `${store.state.coins}`, { fontFamily: FONT, fontSize: "16px", color: "#fff", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 })
      .setScrollFactor(0)
      .setDepth(20);
    this.clockText = this.add
      .text(12, 64, store.clockLabel(), { fontFamily: FONT, fontSize: "10px", color: "#fff", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 })
      .setScrollFactor(0)
      .setDepth(20);

    // ---- focused quest card ----
    this.buildQuestCard();
    this.refreshQuests();

    // ---- interaction prompt ----
    this.promptText = this.add
      .text(width / 2, height - 150, "", {
        fontFamily: FONT,
        fontSize: "14px",
        color: "#fff",
        backgroundColor: "rgba(58,43,58,0.85)",
        padding: { x: 8, y: 5 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.dedicatedStatus = this.add.text(width / 2, 64, "", {
      fontFamily: FONT,
      fontSize: "13px",
      color: "#fff4e6",
      align: "center",
      backgroundColor: "rgba(43,34,51,0.9)",
      padding: { x: 9, y: 5 },
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(94).setVisible(false);

    this.phone = new PhoneOverlay(this);
    this.buildJoystick();
    this.buildButtons();
    this.buildMapGuide();
    this.buildDialogue();
    this.buildWardrobe();
    this.buildShop();
    this.buildLocalMap();

    this.keys = this.input.keyboard!.addKeys("SPACE,E,ENTER,ESC") as Record<string, Phaser.Input.Keyboard.Key>;

    // ---- store + gameplay events ----
    store.on("hearts", (v: number) => this.heartText.setText(`${v}`));
    store.on("coins", (v: number) => this.coinText.setText(`${v}`));
    store.on("questUpdated", () => this.refreshQuests());
    store.on("questStepComplete", (def: QuestDef, step: QuestStep) => this.showObjectiveComplete(def, step));
    store.on("questCompleted", (def: QuestDef) => this.showQuestComplete(def));
    store.on("toast", (t: string, c: string) => this.showToast(t, c));
    store.on("time", () => this.clockText.setText(store.clockLabel()));
    store.on("newDay", () => this.clockText.setText(store.clockLabel()));
    store.on("message", () => this.phone.refreshBadge());
    store.on("relGain", () => this.heartPop());
    store.on("milestone", (milestone: { title: string; dialogue: string }) => {
      this.pendingMilestone = milestone;
      this.time.delayedCall(250, () => this.showPendingMilestone());
    });

    uiEvents.on("prompt", (p: string | null) => this.setPrompt(p));
    uiEvents.on("dialogue", (name: string, lines: string[], extra?: { npcId?: string }) => {
      this.pendingGiftNpc = extra?.npcId;
      this.openDialogue(name, lines);
    });
    uiEvents.on("action", () => this.onAction());
    uiEvents.on("dedicatedStatus", (text: string | null, color = "#fff4e6") => {
      this.dedicatedStatusActive = !!text;
      this.dedicatedStatus.setText(text ?? "").setColor(color);
    });
    uiEvents.on("openShop", (mode?: "home" | "adnoc") => this.openShop(mode));
    uiEvents.on("openFoodOrder", (spec: import("../systems/controls").FoodOrderSpec) => this.openFoodOrder(spec));
    uiEvents.on("choice", (spec: import("../systems/controls").ChoiceSpec) => this.openChoice(spec));
    uiEvents.on("cameraStart", (pose: typeof controls.cameraPose) => this.showCameraHud(pose));
    uiEvents.on("cameraExit", () => this.hideCameraHud());
    uiEvents.on("openWardrobe", () => this.openWardrobe());
    uiEvents.on("openPhone", (tab?: PhoneTab) => this.phone.show(tab));
    uiEvents.on("openLocalMap", () => this.openLocalMap());
    uiEvents.on("minigame", (spec: import("../systems/controls").MiniGameSpec) => this.openMiniGame(spec));
    uiEvents.on("sceneReset", () => this.resetOverlays());
    uiEvents.on("locationTitle", (n: string, s: string) => {
      this.showLocationTitle(n, s);
      this.refreshQuests();
    });

    this.scale.on("resize", this.layout, this);
  }

  private buildQuestCard() {
    this.questPanel = this.add.graphics().setScrollFactor(0).setDepth(24);
    this.questIcon = this.add.image(0, 0, "ui_star").setScale(1.15).setScrollFactor(0).setDepth(26);
    this.questKicker = this.add
      .text(0, 0, "CURRENT PLAN", { fontFamily: FONT, fontSize: "9px", color: "#2f6fd0", fontStyle: "bold", resolution: 2 })
      .setScrollFactor(0)
      .setDepth(26);
    this.questTitle = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "14px", color: "#3a2b3a", fontStyle: "bold", resolution: 2 })
      .setScrollFactor(0)
      .setDepth(26);
    this.questNext = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", lineSpacing: 2, resolution: 2 })
      .setScrollFactor(0)
      .setDepth(26);
    this.questHelp = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "9px", color: "#7a6a5a", resolution: 2 })
      .setScrollFactor(0)
      .setDepth(26);
    this.questCount = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 5, y: 2 }, resolution: 2 })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(27);
    this.questHit = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0.001).setScrollFactor(0).setDepth(28).setInteractive({ useHandCursor: true });
    this.questHit.on("pointerdown", () => this.cycleQuest());
    this.layoutQuestCard();
  }

  private buildMapGuide() {
    this.mapGuide = this.add
      .text(0, 0, "MAP", {
        fontFamily: FONT,
        fontSize: "9px",
        color: "#fff",
        backgroundColor: "#2f6fd0",
        padding: { x: 4, y: 2 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(29)
      .setVisible(false);
    this.tweens.add({ targets: this.mapGuide, y: "-=5", duration: 500, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.layoutQuestCard();
  }

  private layoutQuestCard() {
    if (!this.questPanel) return;
    const { width } = this.scale.gameSize;
    const panelW = Math.min(326, width - 24);
    const panelH = 136;
    const x = width - panelW - 12;
    const y = 12;
    this.questPanel.clear();
    this.questPanel.fillStyle(0xfff9f0, 0.96).fillRoundedRect(x, y, panelW, panelH, 12);
    this.questPanel.lineStyle(2, 0xcaa27a, 0.95).strokeRoundedRect(x, y, panelW, panelH, 12);
    this.questPanel.fillStyle(0x2f6fd0, 1).fillRoundedRect(x, y, 8, panelH, { tl: 12, bl: 12, tr: 0, br: 0 });
    this.questPanel.fillStyle(0xf4c95d, 1).fillCircle(x + 30, y + 27, 17);
    this.questIcon.setPosition(x + 30, y + 27);
    this.questKicker.setPosition(x + 54, y + 14);
    this.questTitle.setPosition(x + 54, y + 29).setWordWrapWidth(panelW - 70);
    this.questNext.setPosition(x + 18, y + 61).setWordWrapWidth(panelW - 36);
    this.questHelp.setPosition(x + 18, y + 111).setWordWrapWidth(panelW - 36);
    this.questCount.setPosition(x + panelW - 12, y + 12);
    this.questHit.setPosition(x + panelW / 2, y + panelH / 2).setSize(panelW, panelH);
    this.mapGuide?.setPosition(this.mapBtn?.x ?? width - 66, (this.mapBtn?.y ?? 150) - 34);
  }

  private cycleQuest() {
    const list = activeQuests();
    if (list.length < 2) return;
    this.questIndex = (this.questIndex + 1) % list.length;
    this.refreshQuests();
    store.toast(`Guiding: ${list[this.questIndex].def.title}`, "#2f6fd0");
  }

  private questExplanation(q: ActiveQuest) {
    const { step } = q;
    if (step.type === "visit") return "Use the Map button to travel to the next place.";
    if (step.type === "talk") {
      const npc = NPCS.find((person) => person.id === step.target);
      const name = npc?.name ?? step.target.replace(/_/g, " ");
      if (npc && npc.location !== store.state.currentLocation) return `Open Map, travel to ${npc.location.replace(/_/g, " ")}, then look for ${name}.`;
      return `Follow the gold guide marker to ${name}.`;
    }
    if (step.type === "collect") return "Look for the floating gold guide marker, then use Action nearby.";
    if (step.type === "interact") return "Follow the gold guide marker and use the Action button nearby.";
    if (step.type === "giveItem") return "Open your phone inventory if you need to check what you are carrying.";
    if (step.type === "takePhoto") return "Stand near the landmark, then use Action to open the camera moment.";
    if (step.type === "playMinigame") return "Find the highlighted activity spot and follow the on-screen instructions.";
    return "Your next step is saved here whenever you return.";
  }

  private needsMapGuide(q: ActiveQuest) {
    if (q.step.type === "visit") return true;
    if (q.step.type !== "talk") return false;
    return NPCS.find((npc) => npc.id === q.step.target)?.location !== store.state.currentLocation;
  }

  private buildMinimap() {
    this.miniG = this.add.graphics().setScrollFactor(0).setDepth(18);
    this.miniMaskG = this.make.graphics({ x: 0, y: 0 });
    this.miniG.setMask(this.miniMaskG.createGeometryMask());
    this.miniRing = this.add.graphics().setScrollFactor(0).setDepth(19);

    this.miniN = this.add
      .text(0, 0, "N", {
        fontFamily: FONT,
        fontSize: "10px",
        color: "#fff",
        stroke: "#3a2b3a",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.miniLabel = this.add
      .text(0, 0, "", {
        fontFamily: FONT,
        fontSize: "10px",
        color: "#fff",
        backgroundColor: "rgba(58,43,58,0.8)",
        padding: { x: 5, y: 2 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(20);

    const r = this.miniR;
    this.miniHit = this.add
      .zone(0, 0, r * 2, r * 2)
      .setScrollFactor(0)
      .setDepth(21)
      .setInteractive({
        hitArea: new Phaser.Geom.Circle(r, r, r),
        hitAreaCallback: Phaser.Geom.Circle.Contains,
        useHandCursor: true,
      });
    this.miniHit.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e?: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      if (minimap.on) this.toggleLocalMap();
    });

    this.placeMinimap();
  }

  private placeMinimap() {
    const { height } = this.scale.gameSize;
    const r = this.miniR;
    this.miniCx = 68;
    this.miniCy = height - 68;
    const { miniCx: cx, miniCy: cy } = this;

    this.miniMaskG.clear();
    this.miniMaskG.fillStyle(0xffffff, 1);
    this.miniMaskG.fillCircle(cx, cy, r);

    this.miniRing.clear();
    this.miniRing.lineStyle(3, 0xf4a6c0, 1);
    this.miniRing.strokeCircle(cx, cy, r);
    this.miniRing.lineStyle(2, 0x3a2b3a, 0.9);
    this.miniRing.strokeCircle(cx, cy, r + 3);

    this.miniN.setPosition(cx, cy - r + 4);
    this.miniLabel.setPosition(cx, cy - r - 4);
    this.miniHit.setPosition(cx - r, cy - r);
  }

  private drawMinimap() {
    const show = minimap.on && this.scene.manager.isActive(SceneKeys.World) && !this.scene.manager.isActive(SceneKeys.Driving) && !this.localMapOpen;
    this.miniG.setVisible(show);
    this.miniRing.setVisible(show);
    this.miniN.setVisible(show);
    this.miniLabel.setVisible(show);
    this.miniHit.setVisible(show);
    if (!show) return;

    const { miniCx: cx, miniCy: cy, miniR: r } = this;
    const scale = 0.09;
    const wx = (x: number) => cx + (x - minimap.px) * scale;
    const wy = (y: number) => cy + (y - minimap.py) * scale;

    this.miniG.clear();
    this.miniG.fillStyle(0x3a3230, 1);
    this.miniG.fillCircle(cx, cy, r);

    this.miniG.fillStyle(minimap.ground, 1);
    for (const a of minimap.areas) this.miniG.fillRect(wx(a.x), wy(a.y), a.w * scale, a.h * scale);

    this.miniG.fillStyle(0x5a9e5e, 1);
    for (const p of minimap.parks) this.miniG.fillRect(wx(p.x), wy(p.y), p.w * scale, p.h * scale);

    this.miniG.fillStyle(0xd4cec0, 1);
    for (const wk of minimap.walks) this.miniG.fillRect(wx(wk.x), wy(wk.y), Math.max(1, wk.w * scale), Math.max(1, wk.h * scale));

    this.miniG.fillStyle(0x4bb0d6, 1);
    for (const w of minimap.water) this.miniG.fillRect(wx(w.x), wy(w.y), w.w * scale, w.h * scale);

    this.miniG.fillStyle(0xc4a06a, 1);
    for (const b of minimap.blocks) this.miniG.fillRect(wx(b.x), wy(b.y), Math.max(3, b.w * scale), Math.max(3, b.h * scale));

    this.miniG.fillStyle(0x5c6068, 1);
    for (const rd of minimap.roads) this.miniG.fillRect(wx(rd.x), wy(rd.y), Math.max(2, rd.w * scale), Math.max(2, rd.h * scale));

    for (const p of minimap.pois) {
      const x = wx(p.x);
      const y = wy(p.y);
      if (Math.hypot(x - cx, y - cy) > r - 3) continue;
      if (p.kind === "npc") this.miniG.fillStyle(0xff5c8a, 1);
      else if (p.kind === "landmark") this.miniG.fillStyle(0xf4c95d, 1);
      else if (p.kind === "home") this.miniG.fillStyle(0xa06de2, 1);
      else if (p.kind === "shop") this.miniG.fillStyle(0x5cb06d, 1);
      else if (p.kind === "jeep") this.miniG.fillStyle(0x2f6fd0, 1);
      else this.miniG.fillStyle(0xffffff, 1);
      this.miniG.fillCircle(x, y, p.kind === "landmark" || p.kind === "home" ? 3 : 2);
    }

    // you — yellow GPS arrow
    const ang = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[minimap.facing];
    this.miniG.fillStyle(0xffe08a, 1);
    this.miniG.beginPath();
    this.miniG.moveTo(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7);
    this.miniG.lineTo(cx + Math.cos(ang + 2.4) * 6, cy + Math.sin(ang + 2.4) * 6);
    this.miniG.lineTo(cx + Math.cos(ang - 2.4) * 6, cy + Math.sin(ang - 2.4) * 6);
    this.miniG.closePath();
    this.miniG.fillPath();

    this.miniLabel.setText(minimap.name);
  }

  private buildLocalMap() {
    const { width, height } = this.scale.gameSize;
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.62).setInteractive();
    dim.on("pointerdown", () => this.closeLocalMap());
    this.localPanel = this.add.graphics();
    const panelHit = this.add.rectangle(width / 2, height / 2, 10, 10, 0xffffff, 0.001).setInteractive();
    this.localG = this.add.graphics();
    this.localTitle = this.add
      .text(width / 2, 24, "", { fontFamily: FONT, fontSize: "18px", color: "#e46d94", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 0);
    this.localLegend = this.add
      .text(width / 2, height - 36, "", {
        fontFamily: FONT,
        fontSize: "11px",
        color: "#3a2b3a",
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    const close = this.add
      .text(width / 2, height - 18, "Close", {
        fontFamily: FONT,
        fontSize: "14px",
        color: "#fff",
        backgroundColor: "#e46d94",
        padding: { x: 14, y: 5 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.closeLocalMap());
    this.localMap = this.add
      .container(0, 0, [dim, panelHit, this.localPanel, this.localG, this.localTitle, this.localLegend, close])
      .setScrollFactor(0)
      .setDepth(62);
    this.hideContainer(this.localMap);
  }

  private toggleLocalMap() {
    if (this.localMapOpen) this.closeLocalMap();
    else this.openLocalMap();
  }

  private openLocalMap() {
    if (!minimap.on || this.dialogueOpen || this.wardrobeOpen || this.shopOpen) return;
    if (!this.scene.manager.isActive(SceneKeys.World)) return;
    this.localMapOpen = true;
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    this.showContainer(this.localMap);
    this.refreshLocalMap();
    this.setPrompt(null);
  }

  private closeLocalMap() {
    if (!this.localMapOpen) return;
    this.localMapOpen = false;
    controls.locked = false;
    this.clearLocalPins();
    this.hideContainer(this.localMap);
  }

  private clearLocalPins() {
    for (const t of this.localPins) t.destroy();
    this.localPins = [];
  }

  private refreshLocalMap() {
    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 28, 760);
    const panelH = Math.min(height - 36, 680);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const dim = this.localMap.list[0] as Phaser.GameObjects.Rectangle;
    dim.setPosition(width / 2, height / 2).setSize(width, height);
    const panelHit = this.localMap.list[1] as Phaser.GameObjects.Rectangle;
    panelHit.setPosition(width / 2, height / 2).setSize(panelW, panelH);

    this.localPanel.clear();
    this.localPanel.fillStyle(0xfff9f0, 1).fillRoundedRect(px, py, panelW, panelH, 14);
    this.localPanel.lineStyle(3, 0xcaa27a).strokeRoundedRect(px, py, panelW, panelH, 14);

    this.localTitle.setPosition(width / 2, py + 12).setText(minimap.cityName || minimap.name);
    this.localLegend
      .setPosition(width / 2, py + panelH - 36)
      .setText("you  ·  people  ·  home  ·  shop  ·  landmark  ·  jeep");
    const close = this.localMap.list[this.localMap.list.length - 1] as Phaser.GameObjects.Text;
    close.setPosition(width / 2, py + panelH - 12);

    const mapX = px + 16;
    const mapY = py + 40;
    const mapW = panelW - 32;
    const mapH = panelH - 96;
    const scale = Math.min(mapW / Math.max(1, minimap.w), mapH / Math.max(1, minimap.h));
    const ox = mapX + (mapW - minimap.w * scale) / 2;
    const oy = mapY + (mapH - minimap.h * scale) / 2;
    const wx = (x: number) => ox + x * scale;
    const wy = (y: number) => oy + y * scale;

    this.localG.clear();
    this.localG.fillStyle(0xf0e4cc, 1);
    this.localG.fillRoundedRect(ox - 4, oy - 4, minimap.w * scale + 8, minimap.h * scale + 8, 8);

    for (const a of minimap.areas) {
      this.localG.fillStyle(minimap.ground, 1);
      this.localG.fillRect(wx(a.x), wy(a.y), a.w * scale, a.h * scale);
      if (a.here) {
        this.localG.lineStyle(2, 0xe46d94, 1);
        this.localG.strokeRect(wx(a.x) + 1, wy(a.y) + 1, a.w * scale - 2, a.h * scale - 2);
      } else {
        this.localG.lineStyle(1, 0xcaa27a, 0.7);
        this.localG.strokeRect(wx(a.x), wy(a.y), a.w * scale, a.h * scale);
      }
    }

    this.localG.fillStyle(0x5a9e5e, 1);
    for (const p of minimap.parks) this.localG.fillRect(wx(p.x), wy(p.y), p.w * scale, p.h * scale);

    this.localG.fillStyle(0xd4cec0, 1);
    for (const wk of minimap.walks) this.localG.fillRect(wx(wk.x), wy(wk.y), Math.max(1, wk.w * scale), Math.max(1, wk.h * scale));

    this.localG.fillStyle(0x4bb0d6, 1);
    for (const w of minimap.water) this.localG.fillRect(wx(w.x), wy(w.y), w.w * scale, w.h * scale);

    this.localG.fillStyle(0xc4a06a, 1);
    for (const b of minimap.blocks) this.localG.fillRect(wx(b.x), wy(b.y), Math.max(3, b.w * scale), Math.max(3, b.h * scale));

    this.localG.fillStyle(0x5c6068, 1);
    for (const rd of minimap.roads) this.localG.fillRect(wx(rd.x), wy(rd.y), Math.max(2, rd.w * scale), Math.max(2, rd.h * scale));

    this.clearLocalPins();
    for (const a of minimap.areas) {
      const t = this.add
        .text(wx(a.x + a.w / 2), wy(a.y) + 6, a.name, {
          fontFamily: FONT,
          fontSize: "11px",
          color: a.here ? "#e46d94" : "#7a6a5a",
          fontStyle: "bold",
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setDepth(63)
        .setScrollFactor(0);
      this.localMap.add(t);
      this.localPins.push(t);
    }
    const pinColor: Record<string, number> = {
      npc: 0xff5c8a,
      landmark: 0xf4c95d,
      home: 0xa06de2,
      shop: 0x5cb06d,
      jeep: 0x2f6fd0,
      exit: 0xffffff,
    };
    for (const p of minimap.pois) {
      const x = wx(p.x);
      const y = wy(p.y);
      const r = p.kind === "npc" || p.kind === "landmark" || p.kind === "home" ? 5 : 4;
      this.localG.fillStyle(pinColor[p.kind] ?? 0xffffff, 1);
      this.localG.fillCircle(x, y, r);
      if (!p.label) continue;
      const t = this.add
        .text(x + 7, y - 6, p.label, {
          fontFamily: FONT,
          fontSize: "10px",
          color: "#3a2b3a",
          backgroundColor: "rgba(255,249,240,0.85)",
          padding: { x: 3, y: 1 },
          resolution: 2,
        })
        .setDepth(63)
        .setScrollFactor(0);
      this.localMap.add(t);
      this.localPins.push(t);
    }

    const youX = wx(minimap.px);
    const youY = wy(minimap.py);
    const ang = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[minimap.facing];
    this.localG.fillStyle(0xffe08a, 1);
    this.localG.beginPath();
    this.localG.moveTo(youX + Math.cos(ang) * 9, youY + Math.sin(ang) * 9);
    this.localG.lineTo(youX + Math.cos(ang + 2.4) * 7, youY + Math.sin(ang + 2.4) * 7);
    this.localG.lineTo(youX + Math.cos(ang - 2.4) * 7, youY + Math.sin(ang - 2.4) * 7);
    this.localG.closePath();
    this.localG.fillPath();
    const you = this.add
      .text(youX + 8, youY + 6, "you", {
        fontFamily: FONT,
        fontSize: "10px",
        color: "#3a2b3a",
        backgroundColor: "rgba(255,224,138,0.9)",
        padding: { x: 3, y: 1 },
        resolution: 2,
      })
      .setDepth(63)
      .setScrollFactor(0);
    this.localMap.add(you);
    this.localPins.push(you);
  }

  // -------------------------------------------------------------------------
  private buildJoystick() {
    this.joyBase = this.add.image(0, 0, "ui_joy_base").setScrollFactor(0).setScale(1.18).setAlpha(0.9).setDepth(10);
    this.joyThumb = this.add.image(0, 0, "ui_joy_thumb").setScrollFactor(0).setScale(1.1).setDepth(11);
    this.positionJoystick();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const onStack =
        minimap.on &&
        p.x < this.miniCx + this.miniR + 12 &&
        p.y > this.miniCy - this.miniR - 28 &&
        p.y < this.miniCy + this.miniR + 12;
      if (onStack) {
        if (Math.hypot(p.x - this.miniCx, p.y - this.miniCy) <= this.miniR) this.toggleLocalMap();
        return;
      }
      if (!this.gameplayActive() || this.anyModal()) return;
      const { width, height } = this.scale.gameSize;
      // left ~half, lower ~65% => joystick zone
      if (p.x < width * 0.5 && p.y > height * 0.32 && this.joyPointerId === -1) {
        this.joyPointerId = p.id;
        this.joyCenter.set(p.x, p.y);
        this.joyBase.setPosition(p.x, p.y).setVisible(true);
        this.joyThumb.setPosition(p.x, p.y).setVisible(true);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return;
      const dx = p.x - this.joyCenter.x;
      const dy = p.y - this.joyCenter.y;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(len, this.joyRadius);
      const ang = Math.atan2(dy, dx);
      this.joyThumb.setPosition(this.joyCenter.x + Math.cos(ang) * clamped, this.joyCenter.y + Math.sin(ang) * clamped);
      const nx = (Math.cos(ang) * clamped) / this.joyRadius;
      const ny = (Math.sin(ang) * clamped) / this.joyRadius;
      controls.moveX = nx;
      controls.moveY = ny;
    });
    const end = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return;
      this.joyPointerId = -1;
      controls.moveX = 0;
      controls.moveY = 0;
      this.positionJoystick();
    };
    this.input.on("pointerup", end);
    this.input.on("pointerupoutside", end);
  }

  private positionJoystick() {
    const { height } = this.scale.gameSize;
    const cx = 108;
    const cy = height - 108;
    this.joyCenter.set(cx, cy);
    this.joyBase.setPosition(cx, cy);
    this.joyThumb.setPosition(cx, cy);
  }

  private makeButton(x: number, y: number, label: string, scale: number, onDown: () => void) {
    const bg = this.add
      .image(x, y, "ui_btn")
      .setScrollFactor(0)
      .setDepth(12)
      .setScale(scale)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: `${Math.round(14 * scale)}px`, color: "#e46d94", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(13);
    (bg as ButtonImage).label = txt;
    bg.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, e?: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      this.tweens.add({ targets: [bg, txt], scale: scale * 0.9, duration: 60, yoyo: true });
      onDown();
    });
    return bg;
  }

  private setButtonVisible(btn: Phaser.GameObjects.Image, v: boolean) {
    btn.setVisible(v);
    (btn as ButtonImage).label?.setVisible(v);
  }

  private buildButtons() {
    const { width, height } = this.scale.gameSize;
    // the action button drives both world interactions and dialogue advance
    this.actionBtn = this.makeButton(width - 76, height - 78, "A", 1.2, () => uiEvents.emit("action"));
    this.mapBtn = this.makeButton(width - 76, height - 168, "Map", 0.92, () => uiEvents.emit("openMap"));
    this.fitBtn = this.makeButton(width - 164, height - 76, "Fit", 0.88, () => this.openWardrobe());
    this.phoneBtn = this.makeButton(width - 252, height - 76, "Ph", 0.88, () => this.phone.show());
    this.phoneBadge = this.add
      .text(width - 220, height - 106, "", {
        fontFamily: FONT,
        fontSize: "10px",
        color: "#fff",
        backgroundColor: "#e46d94",
        padding: { x: 4, y: 1 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(14);
    this.phone.setBadge(this.phoneBadge);
  }

  // -------------------------------------------------------------------------
  private buildDialogue() {
    const { width, height } = this.scale.gameSize;
    const bg = this.add.graphics();
    const boxW = Math.min(width - 24, 520);
    const boxH = 96;
    const bx = (width - boxW) / 2;
    const by = height - boxH - 16;
    bg.fillStyle(0xfff9f0, 0.98).fillRoundedRect(bx, by, boxW, boxH, 12);
    bg.lineStyle(3, 0xcaa27a).strokeRoundedRect(bx, by, boxW, boxH, 12);

    this.dlgName = this.add.text(bx + 14, by - 12, "", {
      fontFamily: FONT,
      fontSize: "13px",
      color: "#fff",
      backgroundColor: "#e46d94",
      padding: { x: 8, y: 3 },
      resolution: 2,
    });
    this.dlgText = this.add.text(bx + 16, by + 16, "", {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#3a2b3a",
      wordWrap: { width: boxW - 32 },
      lineSpacing: 4,
      resolution: 2,
    });
    const hint = this.add
      .text(bx + boxW - 12, by + boxH - 8, "tap to continue", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", resolution: 2 })
      .setOrigin(1, 1);

    // full-screen catcher so a tap anywhere advances the dialogue
    const catcher = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.001)
      .setInteractive();
    catcher.on("pointerdown", () => this.advanceDialogue());

    this.dlg = this.add.container(0, 0, [catcher, bg, this.dlgName, this.dlgText, hint]).setScrollFactor(0).setDepth(50);
    this.hideContainer(this.dlg);
  }

  // Hiding a container isn't enough to stop Phaser hit-testing its interactive
  // children, so we also park closed overlays far off-screen.
  private showContainer(c: Phaser.GameObjects.Container) {
    c.setVisible(true).setPosition(0, 0);
  }
  private hideContainer(c?: Phaser.GameObjects.Container) {
    if (!c?.scene) return;
    c.setVisible(false).setPosition(100000, 100000);
  }

  private openDialogue(name: string, lines: string[]) {
    this.dlgLines = lines.length ? lines : ["..."];
    this.dlgIndex = 0;
    this.dialogueOpen = true;
    this.dlgOpenAt = this.time.now;
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    this.dlgName.setText(name);
    this.dlgText.setText(this.dlgLines[0]);
    this.showContainer(this.dlg);
    this.setPrompt(null);
  }

  private advanceDialogue() {
    if (!this.dialogueOpen) return;
    if (this.time.now - this.dlgOpenAt < 220) return; // debounce
    this.dlgOpenAt = this.time.now;
    this.dlgIndex++;
    if (this.dlgIndex >= this.dlgLines.length) {
      this.hideContainer(this.dlg);
      this.dialogueOpen = false;
      const npc = this.pendingGiftNpc;
      this.pendingGiftNpc = undefined;
      if (npc && store.giftableItems().length) {
        this.openGiftMenu(npc);
      } else {
        controls.locked = false;
      }
      uiEvents.emit("dialogueClosed");
      this.time.delayedCall(180, () => this.showPendingMilestone());
    } else {
      this.dlgText.setText(this.dlgLines[this.dlgIndex]);
    }
  }

  private showPendingMilestone() {
    if (!this.pendingMilestone || this.anyModal()) return;
    const milestone = this.pendingMilestone;
    this.pendingMilestone = undefined;
    this.openDialogue(milestone.title, [milestone.dialogue, "This can become a little outing, visit, or keepsake—not another obligation."]);
  }

  private onAction() {
    // action while a dialogue is open advances it; otherwise gameplay handles it
    if (this.dialogueOpen) this.advanceDialogue();
    else if (this.miniGameOpen) uiEvents.emit("minigameAction");
  }

  // -------------------------------------------------------------------------
  private buildWardrobe() {
    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 40, 360);
    const panelH = Math.min(height - 36, 560);
    const items: Phaser.GameObjects.GameObject[] = [];

    const bgCatch = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.55).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 14);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 14);
    const title = this.add
      .text(width / 2, (height - panelH) / 2 + 16, "Wardrobe", { fontFamily: FONT, fontSize: "20px", color: "#e46d94", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 0);
    items.push(bgCatch, panel, title);

    const ox = (width - panelW) / 2 + 24;
    const oy = (height - panelH) / 2 + 58;
    let i = 0;
    for (const [id, o] of Object.entries(Outfits)) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = ox + col * (panelW / 2 - 10);
      const cy = oy + row * 52;
      const unlocked = store.isOutfitUnlocked(id);
      const hint = OUTFIT_UNLOCKS.find((u) => u.id === id)?.hint ?? "";
      const swatch = this.add.rectangle(cx + 14, cy + 14, 26, 26, Phaser.Display.Color.HexStringToColor(o.top).color).setStrokeStyle(2, 0x3a2b3a).setAlpha(unlocked ? 1 : 0.35);
      const label = this.add.text(cx + 34, cy + 2, unlocked ? o.label : `${o.label} 🔒`, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 });
      const btn = this.add
        .text(cx + 34, cy + 20, unlocked ? "Wear" : hint.slice(0, 28), { fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: unlocked ? "#7be0a3" : "#8a7a6a", padding: { x: 6, y: 2 }, resolution: 2 })
        .setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => {
        if (!unlocked) {
          store.toast(hint, "#a08a70");
          return;
        }
        rebuildPlayerTexture(this, id);
        store.setOutfit(id);
        store.toast(`Now wearing: ${o.label}`, "#f4a6c0");
        this.closeWardrobe();
      });
      items.push(swatch, label, btn);
      i++;
    }

    const accessoryY = (height - panelH) / 2 + panelH - 72;
    const unlockedAccessories = store.state.unlockedAccessories;
    const accessoryLabel = this.add
      .text(width / 2 - 36, accessoryY, `Accessory: ${store.state.equippedAccessory?.replace(/_/g, " ") ?? "none"}`, { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", resolution: 2 })
      .setOrigin(0.5);
    const cycle = this.add
      .text(width / 2 + 100, accessoryY, "Next", { fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "#f4c95d", padding: { x: 7, y: 3 }, resolution: 2 })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    cycle.on("pointerdown", () => {
      if (!unlockedAccessories.length) {
        store.toast("Accessories unlock in Baba's shopping spree.", "#a08a70");
        return;
      }
      const current = store.state.equippedAccessory;
      const currentIndex = current ? unlockedAccessories.indexOf(current) : -1;
      const next = unlockedAccessories[(currentIndex + 1 + unlockedAccessories.length) % unlockedAccessories.length];
      store.setAccessory(next);
      accessoryLabel.setText(`Accessory: ${next.replace(/_/g, " ")}`);
    });
    items.push(accessoryLabel, cycle);

    const close = this.add
      .text(width / 2, (height + panelH) / 2 - 22, "Close", { fontFamily: FONT, fontSize: "15px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 14, y: 6 }, resolution: 2 })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.closeWardrobe());
    bgCatch.on("pointerdown", () => this.closeWardrobe());
    items.push(close);

    this.wardrobe = this.add.container(0, 0, items).setScrollFactor(0).setDepth(60);
    this.hideContainer(this.wardrobe);
  }

  private openWardrobe() {
    if (this.anyModal() || !this.gameplayActive()) return;
    this.wardrobe?.destroy(true);
    this.buildWardrobe();
    this.wardrobeOpen = true;
    controls.locked = true;
    this.showContainer(this.wardrobe);
  }
  private closeWardrobe() {
    this.wardrobeOpen = false;
    controls.locked = false;
    this.hideContainer(this.wardrobe);
  }

  // -------------------------------------------------------------------------
  private shopSlots = [
    { x: 13 * 16, y: 4.5 * 16 },
    { x: 8 * 16, y: 9 * 16 },
    { x: 13 * 16, y: 9 * 16 },
    { x: 6 * 16, y: 5.5 * 16 },
    { x: 10 * 16, y: 5 * 16 },
    { x: 15 * 16, y: 6.5 * 16 },
  ];

  private buildShop() {
    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 40, 380);
    const catalog: { tex: string; name: string; price: number; kind?: "fit" | "treat" }[] = this.shopMode === "adnoc"
      ? [
          { tex: "ui_coin", name: "Karak", price: 4, kind: "treat" },
          { tex: "ui_coin", name: "Coffee", price: 5, kind: "treat" },
          { tex: "ui_heart", name: "Chocolate", price: 6, kind: "treat" },
          { tex: "f_lamp", name: "Road-trip lamp", price: 10 },
        ]
      : [
          { tex: "f_sofa", name: "Sofa", price: 30 },
          { tex: "f_tv", name: "TV", price: 35 },
          { tex: "f_table", name: "Table", price: 20 },
          { tex: "f_plant", name: "Plant", price: 10 },
          { tex: "f_bookshelf", name: "Bookshelf", price: 25 },
          { tex: "f_lamp", name: "Lamp", price: 8 },
          { tex: "f_fridge", name: "Fridge", price: 30 },
          { tex: "f_chair", name: "Chair", price: 8 },
          { tex: "f_vanity", name: "Vanity", price: 28 },
          { tex: "f_desk", name: "Study desk", price: 24 },
          { tex: "ui_star", name: "Sneakers", price: 18, kind: "fit" },
          { tex: "ui_heart", name: "Chocolate", price: 6, kind: "treat" },
        ];
    const panelH = Math.min(height - 32, Math.max(280, 110 + Math.ceil(catalog.length / 2) * 58));
    const items: Phaser.GameObjects.GameObject[] = [];

    const bgCatch = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.55).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 14);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 14);
    const title = this.add
      .text(width / 2, (height - panelH) / 2 + 14, this.shopMode === "adnoc" ? "ADNOC Oasis Shop" : "Home Shop", { fontFamily: FONT, fontSize: "20px", color: this.shopMode === "adnoc" ? "#2f6fd0" : "#e46d94", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 0);
    const sub = this.add
      .text(width / 2, (height - panelH) / 2 + 40, this.shopMode === "adnoc" ? "Karak, snacks, and road-trip comforts" : "Buy things for your home", { fontFamily: FONT, fontSize: "11px", color: "#a08a70", resolution: 2 })
      .setOrigin(0.5, 0);
    items.push(bgCatch, panel, title, sub);

    const ox = (width - panelW) / 2 + 20;
    const oy = (height - panelH) / 2 + 66;
    catalog.forEach((c, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = ox + col * (panelW / 2 - 6);
      const cy = oy + row * 58;
      const icon = this.add.image(cx + 14, cy + 16, c.tex).setScale(0.85);
      const name = this.add.text(cx + 34, cy + 4, c.name, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 });
      const buy = this.add
        .text(cx + 34, cy + 22, `Buy ${c.price}`, { fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "#f4c95d", padding: { x: 6, y: 3 }, resolution: 2 })
        .setInteractive({ useHandCursor: true });
      buy.on("pointerdown", () => {
        if (c.kind === "fit") this.buySneakers(c.price);
        else if (c.kind === "treat") this.buyTreat(c.name.toLowerCase(), c.price);
        else this.buyFurniture(c.tex, c.price);
      });
      items.push(icon, name, buy);
    });

    const close = this.add
      .text(width / 2, (height + panelH) / 2 - 24, "Close", { fontFamily: FONT, fontSize: "15px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 14, y: 6 }, resolution: 2 })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.closeShop());
    bgCatch.on("pointerdown", () => this.closeShop());
    items.push(close);

    this.shop = this.add.container(0, 0, items).setScrollFactor(0).setDepth(60);
    this.hideContainer(this.shop);
  }

  private openMiniGame(spec: import("../systems/controls").MiniGameSpec) {
    if (this.anyModal() && !this.miniGameOpen) return;
    this.closeMiniGame(false);
    this.miniGameOpen = true;
    controls.locked = true;

    const wrap: MiniSpec = {
      ...spec,
      onDone: (ok) => {
        this.closeMiniGame(true);
        spec.onDone(ok);
      },
    };
    this.miniGame = openActivity(this, wrap);
  }

  private closeMiniGame(unlock: boolean) {
    this.miniGameOpen = false;
    this.miniGame?.destroy(true);
    this.miniGame = undefined;
    if (unlock) controls.locked = false;
  }

  private buyTreat(id: string, price: number) {
    if (!store.spendCoins(price)) {
      store.toast("Not enough coins", "#e46d94");
      return;
    }
    store.addItem(id);
  }

  private buySneakers(price: number) {
    if (!store.spendCoins(price)) {
      store.toast("Not enough coins", "#e46d94");
      return;
    }
    store.setFlag("bought_sneakers");
    store.unlockOutfit("sneakers");
    store.toast("Mall sneakers — unlocked", "#f4a6c0");
  }

  private heartPop() {
    const { width } = this.scale.gameSize;
    const h = this.add.image(width / 2, 90, "ui_heart").setScale(2.4).setScrollFactor(0).setDepth(85);
    this.tweens.add({ targets: h, y: 60, alpha: 0, scale: 3.2, duration: 700, onComplete: () => h.destroy() });
  }

  private openGiftMenu(npcId: string) {
    this.closeGiftMenu();
    const { width, height } = this.scale.gameSize;
    const items = store.giftableItems();
    if (!items.length) {
      controls.locked = false;
      return;
    }
    controls.locked = true;
    const name = NPCS.find((n) => n.id === npcId)?.name ?? npcId;
    const kids: Phaser.GameObjects.GameObject[] = [];
    const catcher = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.4).setInteractive();
    const panel = this.add.graphics();
    const h = 80 + items.length * 28;
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect(width / 2 - 150, height / 2 - h / 2, 300, h, 12);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect(width / 2 - 150, height / 2 - h / 2, 300, h, 12);
    kids.push(catcher, panel);
    kids.push(this.add.text(width / 2, height / 2 - h / 2 + 12, `Give ${name} something`, { fontFamily: FONT, fontSize: "14px", color: "#e46d94", resolution: 2 }).setOrigin(0.5, 0));
    items.forEach((id, i) => {
      const def = ITEMS[id];
      const t = this.add
        .text(width / 2, height / 2 - h / 2 + 40 + i * 28, `${def?.name ?? id} ×${store.getItemQuantity(id)}`, {
          fontFamily: FONT,
          fontSize: "13px",
          color: "#fff",
          backgroundColor: "#e46d94",
          padding: { x: 10, y: 4 },
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => {
        const res = store.giveGift(npcId, id);
        this.closeGiftMenu();
        if (res) {
          const done = quests.onGive(npcId, id);
          uiEvents.emit("dialogue", name, [res.line, done ? done.complete : `${name} ♡ +${res.gain}`]);
        }
      });
      kids.push(t);
    });
    const skip = this.add
      .text(width / 2, height / 2 + h / 2 - 22, "Not now", { fontFamily: FONT, fontSize: "12px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 10, y: 4 }, resolution: 2 })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skip.on("pointerdown", () => this.closeGiftMenu());
    catcher.on("pointerdown", () => this.closeGiftMenu());
    kids.push(skip);
    this.giftMenu = this.add.container(0, 0, kids).setScrollFactor(0).setDepth(75);
  }

  private closeGiftMenu() {
    this.giftMenu?.destroy(true);
    this.giftMenu = undefined;
    if (!this.dialogueOpen && !this.wardrobeOpen && !this.shopOpen && !this.miniGameOpen && !this.phone.open)
      controls.locked = false;
  }

  private openFoodOrder(spec: import("../systems/controls").FoodOrderSpec) {
    if (this.anyModal()) return;
    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 36, 360);
    const panelH = Math.min(height - 72, 330);
    const top = (height - panelH) / 2;
    const children: Phaser.GameObjects.GameObject[] = [];
    const catcher = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.55).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect((width - panelW) / 2, top, panelW, panelH, 14);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect((width - panelW) / 2, top, panelW, panelH, 14);
    children.push(catcher, panel);
    children.push(this.add.text(width / 2, top + 18, spec.title, { fontFamily: FONT, fontSize: "18px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(0.5));
    children.push(this.add.text(width / 2, top + 44, spec.subtitle, { fontFamily: FONT, fontSize: "11px", color: "#a08a70", align: "center", wordWrap: { width: panelW - 42 }, resolution: 2 }).setOrigin(0.5, 0));
    spec.items.slice(0, 4).forEach((item, index) => {
      const y = top + 92 + index * 44;
      children.push(this.add.text((width - panelW) / 2 + 20, y, `${item.name}\n${item.description}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", wordWrap: { width: panelW - 130 }, resolution: 2 }));
      const order = this.add.text(width / 2 + panelW / 2 - 50, y + 8, `${item.price} coins`, {
        fontFamily: FONT,
        fontSize: "10px",
        color: "#fff",
        backgroundColor: "#2f6fd0",
        padding: { x: 6, y: 4 },
        resolution: 2,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      order.on("pointerdown", () => {
        if (!store.spendCoins(item.price)) {
          store.toast("Not enough coins", "#e46d94");
          return;
        }
        this.closeFoodOrder();
        spec.onOrder(item.id);
      });
      children.push(order);
    });
    const close = this.add.text(width / 2, top + panelH - 22, "Maybe later", { fontFamily: FONT, fontSize: "12px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 10, y: 4 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.closeFoodOrder());
    catcher.on("pointerdown", () => this.closeFoodOrder());
    children.push(close);
    this.foodMenu = this.add.container(0, 0, children).setScrollFactor(0).setDepth(75);
    controls.locked = true;
  }

  private closeFoodOrder() {
    this.foodMenu?.destroy(true);
    this.foodMenu = undefined;
    if (!this.dialogueOpen && !this.wardrobeOpen && !this.shopOpen && !this.miniGameOpen && !this.phone.open && !this.giftMenu)
      controls.locked = false;
  }

  private openChoice(spec: import("../systems/controls").ChoiceSpec) {
    if (this.anyModal()) return;
    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 30, 390);
    const panelH = Math.min(height - 42, 330);
    const top = (height - panelH) / 2;
    const children: Phaser.GameObjects.GameObject[] = [];
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x1a1420, 0.6).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect((width - panelW) / 2, top, panelW, panelH, 16);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect((width - panelW) / 2, top, panelW, panelH, 16);
    children.push(shade, panel);
    children.push(this.add.text(width / 2, top + 20, spec.title, { fontFamily: FONT, fontSize: "18px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(0.5));
    children.push(this.add.text(width / 2, top + 50, spec.prompt, { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", align: "center", wordWrap: { width: panelW - 42 }, resolution: 2 }).setOrigin(0.5, 0));
    spec.choices.slice(0, 4).forEach((choice, index) => {
      const y = top + 103 + index * 47;
      const button = this.add.text(width / 2, y, choice.description ? `${choice.label}\n${choice.description}` : choice.label, {
        fontFamily: FONT, fontSize: choice.description ? "11px" : "13px", color: "#fff", align: "center",
        backgroundColor: index === 0 ? "#2f6fd0" : "#e46d94", padding: { x: 12, y: 7 }, fixedWidth: panelW - 54, resolution: 2,
      }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      button.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
        event?.stopPropagation?.();
        this.closeChoice();
        spec.onChoose(choice.id);
      });
      children.push(button);
    });
    const later = this.add.text(width / 2, top + panelH - 24, "Maybe later", { fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 9, y: 4 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    later.on("pointerdown", () => this.closeChoice());
    children.push(later);
    shade.on("pointerdown", () => this.closeChoice());
    this.choiceMenu = this.add.container(0, 0, children).setScrollFactor(0).setDepth(88);
    controls.locked = true;
  }

  private closeChoice() {
    this.choiceMenu?.destroy(true);
    this.choiceMenu = undefined;
    if (!this.dialogueOpen && !this.miniGameOpen && !this.phone.open) controls.locked = false;
  }

  private showCameraHud(pose: typeof controls.cameraPose) {
    if (!controls.cameraMode) return;
    this.hideCameraHud();
    const { width, height } = this.scale.gameSize;
    const frame = this.add.graphics();
    frame.lineStyle(4, 0xffffff, 0.9).strokeRoundedRect(24, 54, width - 48, height - 140, 12);
    frame.lineStyle(2, 0xffffff, 0.52)
      .lineBetween(width / 2 - 10, height / 2, width / 2 + 10, height / 2)
      .lineBetween(width / 2, height / 2 - 10, width / 2, height / 2 + 10);
    const title = this.add.text(34, 66, `CAMERA · ${pose.toUpperCase()}`, {
      fontFamily: FONT, fontSize: "12px", color: "#fff", backgroundColor: "rgba(43,34,51,0.76)", padding: { x: 7, y: 4 }, resolution: 2,
    });
    const hint = this.add.text(width / 2, height - 73, "MOVE VIEW · ACTION TO TAKE PHOTO", {
      fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "rgba(43,34,51,0.82)", padding: { x: 8, y: 4 }, resolution: 2,
    }).setOrigin(0.5);
    const exit = this.add.text(width - 34, 66, "EXIT", {
      fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 9, y: 5 }, resolution: 2,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    exit.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
      event?.stopPropagation?.();
      controls.cameraMode = false;
      this.hideCameraHud();
      uiEvents.emit("cameraExit");
    });
    this.cameraHud = this.add.container(0, 0, [frame, title, hint, exit]).setScrollFactor(0).setDepth(155);
  }

  private hideCameraHud() {
    this.cameraHud?.destroy(true);
    this.cameraHud = undefined;
  }

  private buyFurniture(tex: string, price: number) {
    if (!store.spendCoins(price)) {
      store.toast("Not enough coins", "#e46d94");
      return;
    }
    const slot = this.shopSlots[store.state.furniture.length % this.shopSlots.length];
    store.placeFurniture({ tex, x: slot.x, y: slot.y });
    quests.onBuy(tex);
    store.toast("Added to your home!", "#7be0a3");
  }

  private openShop(mode: "home" | "adnoc" = "home") {
    if (this.anyModal()) return;
    if (this.shopMode !== mode) {
      this.shop.destroy(true);
      this.shopMode = mode;
      this.buildShop();
    }
    this.shopOpen = true;
    controls.locked = true;
    this.showContainer(this.shop);
  }
  private closeShop() {
    this.shopOpen = false;
    controls.locked = false;
    this.hideContainer(this.shop);
  }

  // -------------------------------------------------------------------------
  private refreshQuests() {
    if (this.dedicatedHud) {
      for (const item of [this.questPanel, this.questIcon, this.questKicker, this.questTitle, this.questNext, this.questHelp, this.questCount]) item.setVisible(false);
      this.questHit.setVisible(false).disableInteractive();
      this.mapGuide?.setVisible(false);
      return;
    }
    const list = activeQuests();
    if (!list.length) {
      this.questPanel.setVisible(false);
      this.questIcon.setVisible(false);
      this.questKicker.setVisible(false);
      this.questTitle.setVisible(false);
      this.questNext.setVisible(false);
      this.questHelp.setVisible(false);
      this.questCount.setVisible(false);
      this.questHit.setVisible(false);
      this.mapGuide?.setVisible(false);
      return;
    }
    this.questIndex %= list.length;
    const q = list[this.questIndex];
    this.questPanel.setVisible(true);
    this.questIcon.setVisible(true);
    this.questKicker.setVisible(true);
    this.questTitle.setVisible(true).setText(q.def.title);
    this.questNext.setVisible(true).setText(`NEXT  ${q.hint}`);
    this.questHelp.setVisible(true).setText(this.questExplanation(q));
    this.questCount.setVisible(true).setText(list.length > 1 ? `${this.questIndex + 1} / ${list.length}  TAP TO SWITCH` : "FOCUSED");
    this.questHit.setVisible(true);
    this.mapGuide?.setVisible(this.needsMapGuide(q));
    uiEvents.emit("questFocus", q.def.id);
    this.layoutQuestCard();
  }

  private setPrompt(p: string | null) {
    if (this.dialogueOpen || !p) {
      this.promptText.setVisible(false);
      return;
    }
    this.promptText.setText(p).setVisible(true);
  }

  private showToast(text: string, color: string) {
    const { width, height } = this.scale.gameSize;
    const t = this.add
      .text(width / 2, height * 0.28, text, {
        fontFamily: FONT,
        fontSize: "16px",
        color,
        stroke: "#3a2b3a",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(80);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 1300, ease: "Cubic.out", onComplete: () => t.destroy() });
  }

  private showObjectiveComplete(def: QuestDef, step: QuestStep) {
    if (this.questCelebration?.active) return;
    const { width, height } = this.scale.gameSize;
    const box = this.add.rectangle(0, 0, Math.min(width - 32, 390), 66, 0x2b2233, 0.94).setStrokeStyle(2, 0x7be0a3);
    const check = this.add.text(-box.width / 2 + 22, 0, "✓", { fontFamily: FONT, fontSize: "24px", color: "#7be0a3", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const title = this.add.text(-box.width / 2 + 43, -15, "OBJECTIVE COMPLETE", { fontFamily: FONT, fontSize: "10px", color: "#7be0a3", fontStyle: "bold", resolution: 2 });
    const line = this.add.text(-box.width / 2 + 43, 3, step.hint, { fontFamily: FONT, fontSize: "11px", color: "#fff4e6", wordWrap: { width: box.width - 58 }, resolution: 2 });
    const c = this.add.container(width / 2, height * 0.2 - 12, [box, check, title, line]).setScrollFactor(0).setDepth(180).setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, y: height * 0.2, duration: 220, ease: "Back.out", hold: 950, yoyo: true, onComplete: () => c.destroy() });
    this.tweens.add({ targets: check, angle: 10, duration: 120, yoyo: true, repeat: 1 });
    void def;
  }

  private showQuestComplete(def: QuestDef) {
    this.questCelebration?.destroy(true);
    const { width, height } = this.scale.gameSize;
    const shade = this.add.rectangle(0, 0, width, height, 0x2b2233, 0.34).setOrigin(0);
    const panelW = Math.min(width - 34, 430);
    const panel = this.add.rectangle(width / 2, height * 0.36, panelW, 142, 0xfff9f0, 0.98).setStrokeStyle(4, 0xf4c95d);
    const crown = this.add.text(width / 2, height * 0.36 - 51, "♥  ✦  ♥", { fontFamily: FONT, fontSize: "19px", color: "#e46d94", resolution: 2 }).setOrigin(0.5);
    const kicker = this.add.text(width / 2, height * 0.36 - 20, "QUEST COMPLETE", { fontFamily: FONT, fontSize: "11px", color: "#2f6fd0", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const title = this.add.text(width / 2, height * 0.36 + 4, def.title, { fontFamily: FONT, fontSize: "20px", color: "#3a2b3a", fontStyle: "bold", align: "center", wordWrap: { width: panelW - 34 }, resolution: 2 }).setOrigin(0.5);
    const reward = this.add.text(width / 2, height * 0.36 + 41, `+${def.rewardHearts} hearts${def.rewardCoins ? `  ·  +${def.rewardCoins} coins` : ""}`, { fontFamily: FONT, fontSize: "12px", color: "#e46d94", resolution: 2 }).setOrigin(0.5);
    const bits: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < 18; i += 1) {
      const bit = this.add.text(Phaser.Math.Between(20, Math.max(21, width - 20)), height * 0.28, i % 3 === 0 ? "♥" : "✦", { fontFamily: FONT, fontSize: `${Phaser.Math.Between(9, 17)}px`, color: i % 2 ? "#f4c95d" : "#ff8fae", resolution: 2 }).setOrigin(0.5);
      bits.push(bit);
      this.tweens.add({ targets: bit, x: bit.x + Phaser.Math.Between(-45, 45), y: height * 0.66 + Phaser.Math.Between(-35, 80), angle: Phaser.Math.Between(-180, 180), alpha: 0, duration: Phaser.Math.Between(1800, 2600), ease: "Quad.in" });
    }
    this.questCelebration = this.add.container(0, 0, [shade, panel, crown, kicker, title, reward, ...bits]).setScrollFactor(0).setDepth(190).setAlpha(0).setScale(0.94);
    this.tweens.add({ targets: this.questCelebration, alpha: 1, scale: 1, duration: 260, ease: "Back.out", hold: 2200, yoyo: true, onComplete: () => { this.questCelebration?.destroy(true); this.questCelebration = undefined; } });
    this.cameras.main.shake(120, 0.002);
  }

  private showLocationTitle(name: string, sub: string) {
    const { width, height } = this.scale.gameSize;
    const c = this.add.container(width / 2, height * 0.4).setScrollFactor(0).setDepth(70).setAlpha(0);
    const n = this.add.text(0, 0, name, { fontFamily: FONT, fontSize: "30px", color: "#fff", stroke: "#3a2b3a", strokeThickness: 6, resolution: 2 }).setOrigin(0.5);
    const s = this.add.text(0, 30, sub, { fontFamily: FONT, fontSize: "13px", color: "#fff", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5);
    c.add([n, s]);
    this.tweens.add({ targets: c, alpha: 1, duration: 350, hold: 1200, yoyo: true, onComplete: () => c.destroy() });
  }

  private gameplayActive() {
    const m = this.scene.manager;
    return m.isActive(SceneKeys.World) || m.isActive(SceneKeys.House) || m.isActive(SceneKeys.Driving) || m.isActive(SceneKeys.PirateVoyage) || m.isActive(SceneKeys.SisterHeist) || m.isActive(SceneKeys.AdnocHQ) || m.isActive(SceneKeys.AdnocTask) || m.isActive(SceneKeys.QuestActivity);
  }
  private walkableScene() {
    const m = this.scene.manager;
    return m.isActive(SceneKeys.World) || m.isActive(SceneKeys.House);
  }
  private resetOverlays() {
    try {
      this.hideContainer(this.dlg);
      this.dialogueOpen = false;
      this.pendingGiftNpc = undefined;
      if (this.wardrobeOpen) this.closeWardrobe();
      if (this.shopOpen) this.closeShop();
      if (this.localMapOpen) this.closeLocalMap();
      if (this.miniGameOpen) this.closeMiniGame(true);
      this.closeGiftMenu();
      this.closeFoodOrder();
      this.closeChoice();
      if (this.phone.open) this.phone.close();
      if (this.cameraHud || controls.cameraMode) {
        controls.cameraMode = false;
        this.hideCameraHud();
        uiEvents.emit("cameraExit");
      }
    } catch {
      /* stale overlay after a scene hop */
    }
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
  }

  private anyModal() {
    return this.dialogueOpen || this.wardrobeOpen || this.shopOpen || this.localMapOpen || this.miniGameOpen || this.phone.open || !!this.giftMenu || !!this.foodMenu || !!this.choiceMenu;
  }

  private setDedicatedHud(hidden: boolean) {
    if (this.dedicatedHud === hidden) return;
    this.dedicatedHud = hidden;
    const common = [this.heartIcon, this.heartText, this.coinIcon, this.coinText, this.clockText, this.questPanel, this.questIcon, this.questKicker, this.questTitle, this.questNext, this.questHelp, this.questCount];
    for (const item of common) item.setVisible(!hidden);
    if (hidden) {
      this.questHit.setVisible(false).disableInteractive();
      this.mapGuide?.setVisible(false);
    } else {
      this.questHit.setVisible(true).setInteractive({ useHandCursor: true });
      this.refreshQuests();
    }
  }

  private layout() {
    // reposition size-dependent elements on resize/rotate
    const { width, height } = this.scale.gameSize;
    this.promptText.setPosition(width / 2, height - 180);
    this.dedicatedStatus.setPosition(width / 2, 64).setWordWrapWidth(Math.max(220, width - 32), true);
    this.placeMinimap();
    if (this.localMapOpen) this.refreshLocalMap();
    if (this.joyPointerId === -1) this.positionJoystick();
    const place = (btn: Phaser.GameObjects.Image, x: number, y: number) => {
      btn.setPosition(x, y);
      (btn as ButtonImage).label?.setPosition(x, y);
    };
    place(this.actionBtn, width - 76, height - 78);
    place(this.mapBtn, width - 76, height - 168);
    place(this.fitBtn, width - 164, height - 76);
    place(this.phoneBtn, width - 252, height - 76);
    this.phoneBadge?.setPosition(width - 220, height - 106);
    if (this.cameraHud && controls.cameraMode) this.showCameraHud(controls.cameraPose);
    this.layoutQuestCard();
  }

  update() {
    // keyboard advance / interact for dialogue
    if (this.localMapOpen && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.closeLocalMap();
    if (this.miniGameOpen && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.closeMiniGame(true);
    if (this.phone.open && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.phone.close();
    if (this.cameraHud && !controls.cameraMode) this.hideCameraHud();
    this.clockText?.setText(store.clockLabel());

    if (this.dialogueOpen) {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
        Phaser.Input.Keyboard.JustDown(this.keys.E) ||
        Phaser.Input.Keyboard.JustDown(this.keys.ENTER)
      )
        this.advanceDialogue();
    }

    const gp = this.gameplayActive();
    const modal = this.anyModal();
    const driving = this.scene.manager.isActive(SceneKeys.Driving);
    const questActivity = this.scene.manager.isActive(SceneKeys.QuestActivity);
    const dedicated = this.scene.manager.isActive(SceneKeys.PirateVoyage) || this.scene.manager.isActive(SceneKeys.SisterHeist) || this.scene.manager.isActive(SceneKeys.AdnocHQ) || this.scene.manager.isActive(SceneKeys.AdnocTask) || questActivity;
    this.setDedicatedHud(dedicated);
    this.dedicatedStatus.setY(questActivity ? 24 : 64);
    this.dedicatedStatus.setVisible(dedicated && this.dedicatedStatusActive && !modal);

    const showTouch = gp && (!modal || this.miniGameOpen);
    this.setButtonVisible(this.actionBtn, showTouch);
    this.actionBtn.setDepth(this.miniGameOpen ? 90 : 12);
    (this.actionBtn as ButtonImage).label?.setDepth(this.miniGameOpen ? 91 : 13);
    const showJoy = showTouch && this.joyPointerId !== -1;
    this.joyBase.setVisible(showJoy);
    this.joyThumb.setVisible(showJoy);
    // map + fit only in walkable scenes (not while driving)
    const showNav = this.walkableScene() && !modal && !driving && !controls.cameraMode;
    this.setButtonVisible(this.mapBtn, showNav);
    this.setButtonVisible(this.fitBtn, showNav);
    this.setButtonVisible(this.phoneBtn, showNav);
    this.phoneBadge?.setVisible(showNav && store.unreadCount() > 0);
    this.drawMinimap();
  }
}
