import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { store } from "../systems/store";
import { controls, uiEvents, minimap } from "../systems/controls";
import { activeQuests } from "../systems/quests";
import { Outfits } from "../palette";
import { OUTFIT_UNLOCKS } from "../data/outfits";
import { rebuildPlayerTexture } from "../textures";
import { PhoneOverlay } from "../ui/PhoneOverlay";
import { openActivity, type MiniSpec } from "../ui/minigames";
import { NPCS } from "../data/npcs";
import { ITEMS } from "../data/items";
import * as quests from "../systems/quests";
import { FONT_UI } from "../visual/theme";
import { resolvePortrait } from "../visual/portraits";

const FONT = FONT_UI;

type ButtonImage = Phaser.GameObjects.Image & { label: Phaser.GameObjects.Text };

export class UIScene extends Phaser.Scene {
  private heartIcon!: Phaser.GameObjects.Image;
  private coinIcon!: Phaser.GameObjects.Image;
  private heartText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private questBox!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;

  // joystick
  private joyBase!: Phaser.GameObjects.Image;
  private joyThumb!: Phaser.GameObjects.Image;
  private joyPointerId = -1;
  private joyCenter = new Phaser.Math.Vector2();
  private readonly joyRadius = 42;

  // buttons (plain interactive images + a text label stored on `.label`)
  private actionBtn!: Phaser.GameObjects.Image;
  private mapBtn!: Phaser.GameObjects.Image;
  private fitBtn!: Phaser.GameObjects.Image;
  private phoneBtn!: Phaser.GameObjects.Image;
  private phoneBadge!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private phone!: PhoneOverlay;
  private giftMenu?: Phaser.GameObjects.Container;
  private pendingGiftNpc?: string;

  // dialogue
  private dlg!: Phaser.GameObjects.Container;
  private dlgName!: Phaser.GameObjects.Text;
  private dlgText!: Phaser.GameObjects.Text;
  private dlgLines: string[] = [];
  private dlgIndex = 0;
  private dlgOpenAt = 0;
  private dialogueOpen = false;
  private dlgPortrait?: Phaser.GameObjects.Image;
  private dlgNpc?: string;

  // overlays
  private wardrobe!: Phaser.GameObjects.Container;
  private shop!: Phaser.GameObjects.Container;
  private wardrobeOpen = false;
  private shopOpen = false;
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

    // ---- quest tracker ----
    this.questBox = this.add
      .text(width - 12, 12, "", {
        fontFamily: FONT,
        fontSize: "11px",
        color: "#fff",
        align: "right",
        stroke: "#3a2b3a",
        strokeThickness: 3,
        resolution: 2,
        lineSpacing: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);
    this.refreshQuests();

    // ---- interaction prompt ----
    this.promptText = this.add
      .text(width / 2, height - 150, "", {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#fff",
        backgroundColor: "rgba(58,43,58,0.85)",
        padding: { x: 8, y: 5 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setVisible(false);

    this.phone = new PhoneOverlay(this);
    this.buildJoystick();
    this.buildButtons();
    this.buildDialogue();
    this.buildWardrobe();
    this.buildShop();
    this.buildLocalMap();

    this.keys = this.input.keyboard!.addKeys("SPACE,E,ENTER,ESC") as Record<string, Phaser.Input.Keyboard.Key>;

    // ---- store + gameplay events ----
    store.on("hearts", (v: number) => this.heartText.setText(`${v}`));
    store.on("coins", (v: number) => this.coinText.setText(`${v}`));
    store.on("questUpdated", () => this.refreshQuests());
    store.on("toast", (t: string, c: string) => this.showToast(t, c));
    store.on("time", () => this.clockText.setText(store.clockLabel()));
    store.on("newDay", () => this.clockText.setText(store.clockLabel()));
    store.on("message", () => this.phone.refreshBadge());
    store.on("relGain", () => this.heartPop());

    uiEvents.on("prompt", (p: string | null) => this.setPrompt(p));
    uiEvents.on("dialogue", (name: string, lines: string[], extra?: { npcId?: string }) => {
      this.pendingGiftNpc = extra?.npcId;
      this.openDialogue(name, lines, extra?.npcId);
    });
    uiEvents.on("action", () => this.onAction());
    uiEvents.on("openShop", () => this.openShop());
    uiEvents.on("openPhone", () => this.phone.show());
    uiEvents.on("openLocalMap", () => this.openLocalMap());
    uiEvents.on("minigame", (spec: import("../systems/controls").MiniGameSpec) => this.openMiniGame(spec));
    uiEvents.on("sceneReset", () => this.resetOverlays());
    uiEvents.on("locationTitle", (n: string, s: string) => {
      this.showLocationTitle(n, s);
      this.refreshQuests();
    });

    this.scale.on("resize", this.layout, this);
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
    this.joyBase = this.add.image(0, 0, "ui_joy_base").setScrollFactor(0).setAlpha(0.85).setDepth(10);
    this.joyThumb = this.add.image(0, 0, "ui_joy_thumb").setScrollFactor(0).setDepth(11);
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
    const cx = 92;
    const cy = height - 92;
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
    this.actionBtn = this.makeButton(width - 66, height - 70, "A", 1.1, () => uiEvents.emit("action"));
    this.mapBtn = this.makeButton(width - 66, height - 150, "Map", 0.75, () => uiEvents.emit("openMap"));
    this.fitBtn = this.makeButton(width - 140, height - 66, "Fit", 0.75, () => this.openWardrobe());
    this.phoneBtn = this.makeButton(width - 214, height - 66, "Ph", 0.75, () => this.phone.show());
    this.phoneBadge = this.add
      .text(width - 188, height - 92, "", {
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
    const boxW = Math.min(width - 20, 540);
    const boxH = 118;
    const bx = (width - boxW) / 2;
    const by = height - boxH - 14;
    bg.fillStyle(0x1a1420, 0.18).fillRoundedRect(bx + 3, by + 5, boxW, boxH, 16);
    bg.fillStyle(0xfff9f4, 0.97).fillRoundedRect(bx, by, boxW, boxH, 16);
    bg.lineStyle(2, 0xf4a6c0).strokeRoundedRect(bx, by, boxW, boxH, 16);

    this.dlgPortrait = this.add.image(bx + 44, by + 58, "ui_heart").setDisplaySize(64, 80).setVisible(false);

    this.dlgName = this.add.text(bx + 90, by + 10, "", {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#fff",
      backgroundColor: "#e46d94",
      padding: { x: 10, y: 4 },
      resolution: 2,
    });
    this.dlgText = this.add.text(bx + 90, by + 40, "", {
      fontFamily: FONT,
      fontSize: "15px",
      color: "#3a2b3a",
      wordWrap: { width: boxW - 110 },
      lineSpacing: 5,
      resolution: 2,
    });
    const hint = this.add
      .text(bx + boxW - 14, by + boxH - 10, "▶", { fontFamily: FONT, fontSize: "14px", color: "#e46d94", resolution: 2 })
      .setOrigin(1, 1);

    const catcher = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.001)
      .setInteractive();
    catcher.on("pointerdown", () => this.advanceDialogue());

    this.dlg = this.add.container(0, 0, [catcher, bg, this.dlgPortrait, this.dlgName, this.dlgText, hint]).setScrollFactor(0).setDepth(50);
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

  private openDialogue(name: string, lines: string[], npcId?: string) {
    this.dlgLines = lines.length ? lines : ["..."];
    this.dlgIndex = 0;
    this.dialogueOpen = true;
    this.dlgOpenAt = this.time.now;
    this.dlgNpc = npcId;
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    this.dlgName.setText(name);
    this.dlgText.setText(this.dlgLines[0]);
    const key = resolvePortrait(this, npcId ?? name);
    if (key && this.dlgPortrait) {
      this.dlgPortrait.setTexture(key).setVisible(true).setDisplaySize(64, 80);
    } else {
      this.dlgPortrait?.setVisible(false);
    }
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
    } else {
      this.dlgText.setText(this.dlgLines[this.dlgIndex]);
    }
  }

  private onAction() {
    // action while a dialogue is open advances it; otherwise gameplay handles it
    if (this.dialogueOpen) this.advanceDialogue();
  }

  // -------------------------------------------------------------------------
  private buildWardrobe() {
    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 40, 360);
    const panelH = Math.min(height - 60, 460);
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

    const close = this.add
      .text(width / 2, (height + panelH) / 2 - 26, "Close", { fontFamily: FONT, fontSize: "15px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 14, y: 6 }, resolution: 2 })
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
    const panelH = Math.min(height - 80, 400);
    const items: Phaser.GameObjects.GameObject[] = [];

    const bgCatch = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.55).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 14);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 14);
    const title = this.add
      .text(width / 2, (height - panelH) / 2 + 14, "Home Shop", { fontFamily: FONT, fontSize: "20px", color: "#e46d94", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 0);
    const sub = this.add
      .text(width / 2, (height - panelH) / 2 + 40, "Buy things for your home", { fontFamily: FONT, fontSize: "11px", color: "#a08a70", resolution: 2 })
      .setOrigin(0.5, 0);
    items.push(bgCatch, panel, title, sub);

    const catalog: { tex: string; name: string; price: number; kind?: "fit" | "treat" }[] = [
      { tex: "f_sofa", name: "Sofa", price: 30 },
      { tex: "f_tv", name: "TV", price: 35 },
      { tex: "f_table", name: "Table", price: 20 },
      { tex: "f_plant", name: "Plant", price: 10 },
      { tex: "f_bookshelf", name: "Bookshelf", price: 25 },
      { tex: "f_lamp", name: "Lamp", price: 8 },
      { tex: "f_fridge", name: "Fridge", price: 30 },
      { tex: "f_chair", name: "Chair", price: 8 },
      { tex: "ui_star", name: "Sneakers", price: 18, kind: "fit" },
      { tex: "ui_heart", name: "Chocolate", price: 6, kind: "treat" },
    ];

    const ox = (width - panelW) / 2 + 20;
    const oy = (height - panelH) / 2 + 66;
    catalog.forEach((c, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = ox + col * (panelW / 2 - 6);
      const cy = oy + row * 62;
      const icon = this.add.image(cx + 14, cy + 16, c.tex).setScale(0.85);
      const name = this.add.text(cx + 34, cy + 4, c.name, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 });
      const buy = this.add
        .text(cx + 34, cy + 22, `Buy ${c.price}`, { fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "#f4c95d", padding: { x: 6, y: 3 }, resolution: 2 })
        .setInteractive({ useHandCursor: true });
      buy.on("pointerdown", () => {
        if (c.kind === "fit") this.buySneakers(c.price);
        else if (c.kind === "treat") this.buyTreat("chocolate", c.price);
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

    if (spec.kind === "coffee" || spec.kind === "bouquet" || spec.kind === "photo") {
      const wrap: MiniSpec = {
        ...spec,
        onDone: (ok) => {
          this.closeMiniGame(true);
          spec.onDone(ok);
        },
      };
      this.miniGame = openActivity(this, wrap);
      return;
    }

    const { width, height } = this.scale.gameSize;
    const panelW = Math.min(width - 40, 340);
    const panelH = spec.kind === "salon" ? 320 : 280;
    const need = spec.taps ?? 10;
    let progress = 0;
    let mode = spec.kind === "salon" ? "" : "climb";

    const items: Phaser.GameObjects.GameObject[] = [];
    const bgCatch = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.55).setInteractive();
    const panel = this.add.graphics();
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    panel.fillStyle(0xfff9f0, 1).fillRoundedRect(px, py, panelW, panelH, 14);
    panel.lineStyle(3, 0xcaa27a).strokeRoundedRect(px, py, panelW, panelH, 14);
    const title = this.add
      .text(width / 2, py + 16, spec.title, { fontFamily: FONT, fontSize: "18px", color: "#e46d94", fontStyle: "bold", resolution: 2 })
      .setOrigin(0.5, 0);
    const hint = this.add
      .text(width / 2, py + 44, spec.hint, {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#3a2b3a",
        align: "center",
        wordWrap: { width: panelW - 36 },
        resolution: 2,
      })
      .setOrigin(0.5, 0);
    items.push(bgCatch, panel, title, hint);

    const barG = this.add.graphics();
    items.push(barG);
    const status = this.add
      .text(width / 2, py + (spec.kind === "salon" ? 168 : 130), "", {
        fontFamily: FONT,
        fontSize: "13px",
        color: "#3a2b3a",
        resolution: 2,
      })
      .setOrigin(0.5);
    items.push(status);

    const drawBar = () => {
      barG.clear();
      const bw = panelW - 48;
      const bx = px + 24;
      const by = py + (spec.kind === "salon" ? 148 : 110);
      barG.fillStyle(0xe8dcc8, 1).fillRoundedRect(bx, by, bw, 14, 6);
      barG.fillStyle(0xe46d94, 1).fillRoundedRect(bx, by, Math.max(4, (bw * progress) / need), 14, 6);
      status.setText(mode ? `${progress} / ${need}` : "Pick one to start");
    };
    drawBar();

    const finish = () => {
      this.closeMiniGame(true);
      spec.onDone();
    };

    const tap = () => {
      if (!mode) return;
      progress += 1;
      drawBar();
      if (progress >= need) finish();
    };

    if (spec.kind === "salon") {
      const nails = this.add
        .text(width / 2 - 60, py + 108, "Nails", {
          fontFamily: FONT,
          fontSize: "14px",
          color: "#fff",
          backgroundColor: "#e46d94",
          padding: { x: 12, y: 6 },
          resolution: 2,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const brows = this.add
        .text(width / 2 + 60, py + 108, "Brows", {
          fontFamily: FONT,
          fontSize: "14px",
          color: "#fff",
          backgroundColor: "#7be0a3",
          padding: { x: 12, y: 6 },
          resolution: 2,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      nails.on("pointerdown", () => {
        mode = "nails";
        drawBar();
      });
      brows.on("pointerdown", () => {
        mode = "brows";
        drawBar();
      });
      items.push(nails, brows);
    }

    const tapBtn = this.add
      .text(width / 2, py + panelH - 78, spec.kind === "stairs" ? "Tap to climb" : "Tap", {
        fontFamily: FONT,
        fontSize: "16px",
        color: "#fff",
        backgroundColor: "#2f6fd0",
        padding: { x: 18, y: 8 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    tapBtn.on("pointerdown", tap);
    items.push(tapBtn);

    const skip = this.add
      .text(width / 2, py + panelH - 28, spec.skipLabel ?? "Skip", {
        fontFamily: FONT,
        fontSize: "13px",
        color: "#fff",
        backgroundColor: "#8a7a6a",
        padding: { x: 12, y: 5 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skip.on("pointerdown", finish);
    items.push(skip);

    this.miniGame = this.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
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

  private buyFurniture(tex: string, price: number) {
    if (!store.spendCoins(price)) {
      store.toast("Not enough coins", "#e46d94");
      return;
    }
    const slot = this.shopSlots[store.state.furniture.length % this.shopSlots.length];
    store.placeFurniture({ tex, x: slot.x, y: slot.y });
    store.toast("Added to your home!", "#7be0a3");
  }

  private openShop() {
    if (this.anyModal()) return;
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
    const list = activeQuests();
    if (!list.length) {
      this.questBox.setText("");
      return;
    }
    const lines = ["- Quests -"];
    for (const q of list) lines.push(`${q.def.title}`, `  ${q.hint}`);
    this.questBox.setText(lines.join("\n"));
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
    return m.isActive(SceneKeys.World) || m.isActive(SceneKeys.House) || m.isActive(SceneKeys.Driving);
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
      if (this.phone.open) this.phone.close();
    } catch {
      /* stale overlay after a scene hop */
    }
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
  }

  private anyModal() {
    return this.dialogueOpen || this.wardrobeOpen || this.shopOpen || this.localMapOpen || this.miniGameOpen || this.phone.open || !!this.giftMenu;
  }

  private layout() {
    // reposition size-dependent elements on resize/rotate
    const { width, height } = this.scale.gameSize;
    this.questBox.setPosition(width - 12, 12);
    this.promptText.setPosition(width / 2, height - 150);
    this.placeMinimap();
    if (this.localMapOpen) this.refreshLocalMap();
    if (this.joyPointerId === -1) this.positionJoystick();
    const place = (btn: Phaser.GameObjects.Image, x: number, y: number) => {
      btn.setPosition(x, y);
      (btn as ButtonImage).label?.setPosition(x, y);
    };
    place(this.actionBtn, width - 66, height - 70);
    place(this.mapBtn, width - 66, height - 150);
    place(this.fitBtn, width - 140, height - 66);
    place(this.phoneBtn, width - 214, height - 66);
    this.phoneBadge?.setPosition(width - 188, height - 92);
  }

  update() {
    // keyboard advance / interact for dialogue
    if (this.localMapOpen && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.closeLocalMap();
    if (this.miniGameOpen && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.closeMiniGame(true);
    if (this.phone.open && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.phone.close();
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

    const showTouch = gp && !modal;
    this.setButtonVisible(this.actionBtn, showTouch);
    const showJoy = showTouch && this.joyPointerId !== -1;
    this.joyBase.setVisible(showJoy);
    this.joyThumb.setVisible(showJoy);
    // map + fit only in walkable scenes (not while driving)
    const showNav = this.walkableScene() && !modal && !driving;
    this.setButtonVisible(this.mapBtn, showNav);
    this.setButtonVisible(this.fitBtn, showNav);
    this.setButtonVisible(this.phoneBtn, showNav);
    this.phoneBadge?.setVisible(showNav && store.unreadCount() > 0);
    this.drawMinimap();
  }
}
