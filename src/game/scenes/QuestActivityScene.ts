import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { NPCS } from "../data/npcs";
import { NPC } from "../objects/NPC";
import { Player } from "../objects/Player";
import { controls, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";
import { deliverMessage } from "../systems/phone";
import { getVisualTexture } from "../visual";

export type QuestActivityId = "shopping_spree" | "apartment_1701" | "chloe_thesis" | "nour_visit" | "fry_thief";

interface QuestActivityData {
  activity: QuestActivityId;
  mallId?: "dubai_mall" | "dubai_hills_mall" | "yas_mall";
  returnLocation?: string;
}

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
  active?: boolean;
}

interface Pickup {
  go: Phaser.GameObjects.Container;
  x: number;
  y: number;
  label: string;
  taken: boolean;
  phase: number;
}

const W = 720;
const H = 420;
const FONT = "monospace";

/** Movement-first, story-specific quest activities that do not belong in the generic modal minigame system. */
export class QuestActivityScene extends Phaser.Scene {
  private taskData!: QuestActivityData;
  private player!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private interactables: Interactable[] = [];
  private current?: Interactable;
  private pickups: Pickup[] = [];
  private bags: Phaser.GameObjects.Container[] = [];
  private hazards: Phaser.GameObjects.Container[] = [];
  private activityUpdate?: (time: number, delta: number) => void;
  private lastInteract = 0;
  private finished = false;
  private startedAt = 0;
  private stress = 6;
  private hazardCooldown = 0;
  private status = "";

  constructor() {
    super(SceneKeys.QuestActivity);
  }

  create(data: QuestActivityData) {
    this.taskData = data;
    this.interactables = [];
    this.pickups = [];
    this.bags = [];
    this.hazards = [];
    this.activityUpdate = undefined;
    this.finished = false;
    this.stress = 6;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("sceneReset");
    uiEvents.emit("prompt", null);

    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBounds(0, 0, W, H).setBackgroundColor("#2b2233");
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.on("action", this.tryInteract, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownActivity, this);

    const builders: Record<QuestActivityId, () => void> = {
      shopping_spree: () => this.buildShoppingSpree(),
      apartment_1701: () => this.buildApartment(),
      chloe_thesis: () => this.buildChloeChase(),
      nour_visit: () => this.buildNourVisit(),
      fry_thief: () => this.buildFryThief(),
    };
    builders[data.activity]();
    this.time.delayedCall(100, () => { if (this.sys.isActive() && this.status) this.setStatus(this.status); });
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.scale.gameSize.height / H, 1, 1.85));
  }

  private baseRoom(floor = 0xeadfcf, accent = 0xe46d94, title = "QUEST MOMENT") {
    this.add.rectangle(W / 2, H / 2, W, H, floor).setDepth(0);
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x3a2b3a, 1).fillRect(0, 0, W, 24).fillRect(0, H - 20, W, 20).fillRect(0, 0, 18, H).fillRect(W - 18, 0, 18, H);
    g.fillStyle(accent, 1).fillRect(18, 24, W - 36, 6);
    this.add.text(W / 2, 42, title, { fontFamily: FONT, fontSize: "18px", color: "#3a2b3a", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(3);
  }

  private spawnPlayer(x: number, y: number) {
    this.player = new Player(this, x, y, getVisualTexture(this, "char_her"));
    this.player.setDepth(y);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
  }

  private addInteractable(x: number, y: number, radius: number, prompt: string, trigger: () => void) {
    const it: Interactable = { x, y, radius, prompt, trigger, active: true };
    this.interactables.push(it);
    return it;
  }

  private setStatus(text: string, color = "#fff4e6") {
    this.status = text;
    uiEvents.emit("dedicatedStatus", text, color);
  }

  private speech(x: number, y: number, text: string, color = "#fff4e6") {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", backgroundColor: color, padding: { x: 6, y: 4 }, align: "center", resolution: 2 }).setOrigin(0.5, 1).setDepth(700);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1250, ease: "Cubic.out", onComplete: () => t.destroy() });
  }

  private sparkle(x: number, y: number, symbol = "✦") {
    for (let i = 0; i < 8; i += 1) {
      const t = this.add.text(x, y, symbol, { fontFamily: FONT, fontSize: "12px", color: i % 2 ? "#f4c95d" : "#ff8fae", resolution: 2 }).setOrigin(0.5).setDepth(800);
      const a = (Math.PI * 2 * i) / 8;
      this.tweens.add({ targets: t, x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 28, alpha: 0, angle: 80, duration: 650, onComplete: () => t.destroy() });
    }
  }

  private buildShoppingSpree() {
    this.baseRoom(0xeee8dc, 0x2f6fd0, "SHOPPING SPREE");
    const g = this.add.graphics().setDepth(2);
    const racks = [
      { x: 72, y: 84, w: 118, h: 64 }, { x: 300, y: 82, w: 120, h: 66 }, { x: 530, y: 84, w: 116, h: 64 },
      { x: 74, y: 275, w: 120, h: 62 }, { x: 302, y: 278, w: 120, h: 62 }, { x: 530, y: 274, w: 116, h: 64 },
    ];
    racks.forEach((r, i) => {
      g.fillStyle(i % 2 ? 0xfff9ef : 0xf8d9e5, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 8);
      g.lineStyle(3, i % 2 ? 0x2f6fd0 : 0xe46d94).strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
    });
    this.spawnPlayer(W / 2, H - 54);
    const itemDefs = [
      [128, 165, "Pink dress", "👗"], [354, 164, "Comfy shoes", "✦"], [590, 165, "Handbag", "▣"],
      [128, 254, "Weekend jacket", "◇"], [354, 255, "Earrings", "♥"], [590, 254, "Sensible top", "♢"],
    ] as const;
    itemDefs.forEach(([x, y, label, icon], i) => {
      const disk = this.add.circle(0, 0, 18, i % 2 ? 0x2f6fd0 : 0xe46d94).setStrokeStyle(3, 0xffffff);
      const mark = this.add.text(0, -1, icon, { fontFamily: FONT, fontSize: "16px", color: "#fff", resolution: 2 }).setOrigin(0.5);
      const name = this.add.text(0, 24, label, { fontFamily: FONT, fontSize: "9px", color: "#3a2b3a", backgroundColor: "#fff9ef", padding: { x: 4, y: 2 }, resolution: 2 }).setOrigin(0.5);
      const c = this.add.container(x, y, [disk, mark, name]).setDepth(y);
      this.pickups.push({ go: c, x, y, label, taken: false, phase: i * 0.8 });
    });
    for (let i = 0; i < 3; i += 1) this.makeMallHazard(i);
    this.startedAt = this.time.now;
    this.setStatus("LIST  0/6   ·   BABA STRESS ░░░░░   ·   0:58");
    this.activityUpdate = (time) => {
      const elapsed = (time - this.startedAt) / 1000;
      let left = Math.max(0, 58 - Math.floor(elapsed));
      if (left === 0 && !this.finished) {
        this.startedAt += 15000;
        left = 15;
        this.stress = Math.max(this.stress, 84);
        this.speech(this.player.x, this.player.y - 28, "Baba granted a very reluctant 15-second extension.", "#ffe08a");
      }
      const collected = this.pickups.filter((p) => p.taken).length;
      const bars = Math.min(5, Math.ceil(this.stress / 20));
      this.setStatus(`LIST  ${collected}/6   ·   BABA STRESS ${"█".repeat(bars)}${"░".repeat(5 - bars)}   ·   0:${String(left).padStart(2, "0")}`, this.stress > 75 ? "#ffe08a" : "#fff4e6");
      for (const p of this.pickups) {
        if (p.taken) continue;
        p.go.y = p.y + Math.sin(time * 0.004 + p.phase) * 3;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < 24) this.collectShoppingItem(p);
      }
      for (const h of this.hazards) {
        if (time < this.hazardCooldown || Phaser.Math.Distance.Between(this.player.x, this.player.y, h.x, h.y) > 28) continue;
        this.hazardCooldown = time + 950;
        this.stress = Math.min(100, this.stress + 13);
        this.player.setPosition(Phaser.Math.Clamp(this.player.x - 30, 34, W - 34), Phaser.Math.Clamp(this.player.y + 18, 68, H - 34));
        this.cameras.main.shake(120, 0.008);
        this.speech(h.x, h.y - 20, this.stress > 70 ? "Baba: JUJU." : "Excuse me! Tiny cart emergency.", "#ffd3d3");
      }
      this.updateBagTrain();
    };
  }

  private makeMallHazard(index: number) {
    const y = 205 + (index - 1) * 42;
    const cart = this.add.rectangle(0, 0, 36, 20, index === 1 ? 0xe46d94 : 0x6f819d).setStrokeStyle(2, 0x3a2b3a);
    const wheels = this.add.text(0, 8, "●     ●", { fontFamily: FONT, fontSize: "7px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
    const label = this.add.text(0, -2, index === 1 ? "SHOPPER" : "CART", { fontFamily: FONT, fontSize: "7px", color: "#fff", resolution: 2 }).setOrigin(0.5);
    const c = this.add.container(index % 2 ? W - 40 : 40, y, [cart, wheels, label]).setDepth(y + 5);
    this.hazards.push(c);
    this.tweens.add({ targets: c, x: index % 2 ? 40 : W - 40, duration: 3800 + index * 650, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  private collectShoppingItem(p: Pickup) {
    p.taken = true;
    this.sparkle(p.x, p.y);
    p.go.destroy(true);
    this.stress = Math.min(100, this.stress + 8);
    const bag = this.add.container(this.player.x, this.player.y).setDepth(this.player.y - 1);
    bag.add([this.add.rectangle(0, 0, 15, 17, this.bags.length % 2 ? 0x2f6fd0 : 0xe46d94).setStrokeStyle(2, 0xffffff), this.add.text(0, -1, "⌒", { fontFamily: FONT, fontSize: "10px", color: "#fff", resolution: 2 }).setOrigin(0.5)]);
    this.bags.push(bag);
    this.speech(this.player.x, this.player.y - 28, `${p.label} ✓`);
    if (this.pickups.every((item) => item.taken)) this.finishShopping();
  }

  private updateBagTrain() {
    this.bags.forEach((bag, i) => {
      const side = i % 2 ? 1 : -1;
      const row = Math.floor(i / 2);
      bag.x = Phaser.Math.Linear(bag.x, this.player.x + side * (14 + row * 8), 0.13);
      bag.y = Phaser.Math.Linear(bag.y, this.player.y + 4 + row * 5, 0.13);
      bag.setDepth(bag.y - 1);
    });
  }

  private finishShopping() {
    if (this.finished) return;
    this.finished = true;
    this.player.move(0, 0);
    quests.onMinigame("shopping_spree");
    ["mall_dress", "sparkle_set", "weekend_jacket"].forEach((id) => store.unlockOutfit(id));
    ["handbag", "necklace", "earrings", "bangle"].forEach((id) => store.unlockAccessory(id));
    store.setAccessory("handbag");
    this.sparkle(this.player.x, this.player.y, "♥");
    this.afterDialogue("Shopping Spree", ["Six items. Six bags. Baba's stress meter has become modern art.", "Juju leaves wearing one new look and carrying every other look."], () => this.returnToMall());
  }

  private buildApartment() {
    if (quests.currentStep("q_residences")?.target === "apartment_1701_package") {
      this.buildHallway();
      return;
    }
    this.baseRoom(0xd8c6b0, 0xb58a52, "THE RESIDENCES · T8");
    this.spawnPlayer(W / 2, H - 55);
    const lift = this.add.rectangle(W / 2, 155, 150, 200, 0x77818f).setStrokeStyle(7, 0xb58a52).setDepth(2);
    this.add.text(W / 2, 75, "ELEVATOR", { fontFamily: FONT, fontSize: "12px", color: "#fff", resolution: 2 }).setOrigin(0.5).setDepth(3);
    const panel = this.add.rectangle(W / 2 + 105, 176, 46, 116, 0x3a2b3a).setStrokeStyle(3, 0xf4c95d).setDepth(3);
    const nums = this.add.text(W / 2 + 105, 127, "17\n16\n15\n⋮\nG", { fontFamily: FONT, fontSize: "14px", color: "#fff4e6", lineSpacing: 4, align: "center", resolution: 2 }).setOrigin(0.5, 0).setDepth(4);
    void lift; void panel; void nums;
    this.addInteractable(W / 2 + 105, 176, 42, "A · Press 17", () => this.rideElevator());
    this.setStatus("Find floor 17. The elevator has seventeen opinions.");
  }

  private rideElevator() {
    if (this.finished) return;
    this.finished = true;
    controls.locked = true;
    uiEvents.emit("prompt", null);
    const indicator = this.add.text(W / 2, 87, "1", { fontFamily: FONT, fontSize: "24px", color: "#f4c95d", backgroundColor: "#2b2233", padding: { x: 10, y: 5 }, resolution: 2 }).setOrigin(0.5).setDepth(20);
    const floors = [2, 5, 8, 11, 14, 16, 17];
    floors.forEach((floor, i) => this.time.delayedCall(230 * (i + 1), () => indicator.setText(`${floor}`)));
    this.time.delayedCall(1850, () => {
      this.cameras.main.shake(90, 0.004);
      this.speech(W / 2, 130, "DING. Floor 17. Please collect your dignity.", "#ffe08a");
      this.time.delayedCall(700, () => this.buildHallway());
    });
  }

  private buildHallway() {
    this.children.removeAll(true);
    this.interactables = [];
    this.finished = false;
    controls.locked = false;
    this.baseRoom(0xe9decf, 0x7a5238, "FLOOR 17 · FIND 1701");
    this.spawnPlayer(W / 2, H - 58);
    const doors = [
      { x: 150, n: "1703", line: "A tiny dog barks with the confidence of a building manager." },
      { x: 360, n: "1702", line: "Someone whispers: delivery? Then remembers they ordered nothing." },
      { x: 570, n: "1701", line: "" },
    ];
    doors.forEach((d) => {
      this.add.rectangle(d.x, 132, 92, 170, 0x7a5238).setStrokeStyle(5, 0x3a2b3a).setDepth(3);
      this.add.text(d.x, 82, d.n, { fontFamily: FONT, fontSize: "14px", color: "#f4c95d", resolution: 2 }).setOrigin(0.5).setDepth(4);
      if (d.n === "1701") {
        const parcel = this.add.rectangle(d.x + 38, 225, 42, 30, 0xc98d55).setStrokeStyle(2, 0x7a5238).setDepth(226);
        this.add.text(parcel.x, parcel.y, "♥", { fontFamily: FONT, fontSize: "13px", color: "#e46d94", resolution: 2 }).setOrigin(0.5).setDepth(227);
      }
      this.addInteractable(d.x, 226, 54, `A · Check ${d.n}`, () => d.n === "1701" ? this.openApartmentPackage() : this.afterDialogue(d.n, [d.line]));
    });
    this.setStatus("Three doors. One package. Two opportunities to be politely wrong.");
  }

  private openApartmentPackage() {
    if (this.finished) return;
    this.finished = true;
    quests.onInteract("apartment_1701_package");
    store.addNote("note_apartment_1701");
    store.unlockMemory("mem_downtown");
    store.capturePhoto({ id: "photo_apartment_1701", title: "The view from 1701", locationId: "dubai_downtown", day: store.state.currentDay, timeOfDay: store.state.timeOfDay, companionId: "moomoo", caption: "A tiny framed Downtown view left outside apartment 1701." });
    deliverMessage({ id: "msg_apartment_1701", sender: "moomoo", body: "did you find it? home is wherever you are 🤍", unlock: {} });
    this.sparkle(608, 220, "♥");
    this.afterDialogue("Moomoo's package", ["Inside: a tiny framed photo of the Downtown view.", "The note says: ‘Home is wherever you are. Even on the 17th floor.’", "Message from Moomoo: Did you find it? 🤍"], () => this.returnToWorld("dubai_downtown"));
  }

  private buildChloeChase() {
    this.baseRoom(0xb8d79a, 0x6eaa73, "OADBY · THESIS CHASE");
    this.spawnPlayer(100, H - 70);
    const chloeDef = NPCS.find((n) => n.id === "chloe");
    if (chloeDef) {
      const chloe = new NPC(this, chloeDef).place(155, H - 78);
      this.tweens.add({ targets: chloe.sprite, y: chloe.sprite.y - 7, duration: 220, yoyo: true, repeat: 3, ease: "Sine.inOut" });
    }
    const talk = quests.onTalk("chloe", chloeDef?.dialogue ?? ["JUJU?!"]);
    const paperSpots = [[250, 100], [380, 145], [515, 95], [625, 175], [285, 270], [450, 310], [605, 285], [170, 205]];
    paperSpots.forEach(([x, y], i) => {
      const sheet = this.add.rectangle(0, 0, 23, 29, 0xfffdf7).setStrokeStyle(2, 0x7a6a5a).setAngle(i % 2 ? 12 : -9);
      const ink = this.add.text(0, 0, "≡\n≡", { fontFamily: FONT, fontSize: "9px", color: "#5b4c62", align: "center", resolution: 2 }).setOrigin(0.5);
      const c = this.add.container(x, y, [sheet, ink]).setDepth(y);
      this.pickups.push({ go: c, x, y, label: `Page ${i + 1}`, taken: false, phase: i * 0.65 });
    });
    controls.locked = true;
    this.afterDialogue("Chloe", ["JUJU?! You actually came!", "A gust of wind chooses this exact moment to submit my thesis to the entire neighbourhood.", ...talk.lines.filter((line) => !line.startsWith("(New objective"))], () => { controls.locked = false; });
    this.setStatus("THESIS PAGES  0/8   ·   Chase them before peer review does");
    this.activityUpdate = (time) => {
      const got = this.pickups.filter((p) => p.taken).length;
      this.setStatus(`THESIS PAGES  ${got}/8   ·   Wind: academically unhelpful`);
      for (const p of this.pickups) {
        if (p.taken) continue;
        p.go.x = p.x + Math.sin(time * 0.0018 + p.phase) * 38;
        p.go.y = p.y + Math.cos(time * 0.0024 + p.phase) * 17;
        p.go.angle = Math.sin(time * 0.003 + p.phase) * 10;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.go.x, p.go.y) < 25) {
          p.taken = true;
          this.sparkle(p.go.x, p.go.y, "≡");
          p.go.destroy(true);
          if (this.pickups.every((q) => q.taken)) this.finishChloeChase();
        }
      }
    };
  }

  private finishChloeChase() {
    if (this.finished) return;
    this.finished = true;
    quests.onMinigame("chloe_thesis");
    this.afterDialogue("Chloe", ["Eight pages rescued. One abstract slightly damp.", "Come inside. Tea is on me, and my thesis is staying under a mug."], () => this.returnToWorld("leicester"));
  }

  private buildNourVisit() {
    this.baseRoom(0xd7cfbf, 0xc45d54, "FRANKFURT · DOORBELLS");
    this.spawnPlayer(W / 2, H - 58);
    [
      { x: 155, n: "2B", line: "Wrong flat. A very serious accordion answers." },
      { x: 360, n: "2C", line: "correct" },
      { x: 565, n: "2D", line: "Wrong flat. Someone offers directions and one potato." },
    ].forEach((d) => {
      this.add.rectangle(d.x, 142, 102, 190, 0x6f4a3d).setStrokeStyle(4, 0x3a2b3a).setDepth(3);
      this.add.circle(d.x + 34, 160, 5, 0xf4c95d).setDepth(4);
      this.add.text(d.x, 76, d.n, { fontFamily: FONT, fontSize: "16px", color: "#f4c95d", resolution: 2 }).setOrigin(0.5).setDepth(4);
      this.addInteractable(d.x, 245, 55, `A · Ring ${d.n}`, () => d.line === "correct" ? this.findNour() : this.afterDialogue(`Flat ${d.n}`, [d.line]));
    });
    this.setStatus("Try the doorbells. Wrong doors are harmless and unusually hospitable.");
  }

  private findNour() {
    if (this.finished) return;
    this.finished = true;
    const def = NPCS.find((n) => n.id === "nour");
    if (def) {
      const nour = new NPC(this, def).place(360, 218);
      this.tweens.add({ targets: [nour.sprite, this.player], x: "+=10", duration: 260, yoyo: true, repeat: 1, ease: "Sine.inOut" });
    }
    const talk = quests.onTalk("nour", def?.dialogue ?? []);
    this.sparkle(360, 205, "♥");
    this.afterDialogue("Nour", ["The correct door opens. Immediate sibling hug. Zero personal space.", "I knew you'd find it! Ignore the other flats. They are part of the experience.", ...talk.lines.filter((line) => !line.startsWith("(New objective"))], () => this.startSnackCatch());
  }

  private startSnackCatch() {
    this.children.removeAll(true);
    this.interactables = [];
    this.finished = false;
    controls.locked = false;
    this.baseRoom(0xe8dfcf, 0xc45d54, "NOUR'S SNACK WELCOME");
    this.spawnPlayer(W / 2, H - 58);
    const basket = this.add.rectangle(84, H - 66, 86, 34, 0x7a5238).setStrokeStyle(3, 0xf4c95d).setDepth(H - 65);
    this.add.text(84, H - 66, "SKIP + CHAT", { fontFamily: FONT, fontSize: "8px", color: "#fff", resolution: 2 }).setOrigin(0.5).setDepth(H - 64);
    this.addInteractable(84, H - 66, 55, "A · Skip snacks", () => this.finishNourSnacks(true));
    void basket;
    const snacks: { go: Phaser.GameObjects.Text; speed: number }[] = [];
    for (let i = 0; i < 10; i += 1) {
      const go = this.add.text(65 + i * 62, -Phaser.Math.Between(10, 320), i % 2 ? "●" : "◆", { fontFamily: FONT, fontSize: "18px", color: i % 2 ? "#f4c95d" : "#c45d54", stroke: "#3a2b3a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(100);
      snacks.push({ go, speed: Phaser.Math.Between(44, 76) });
    }
    this.startedAt = this.time.now;
    let caught = 0;
    this.activityUpdate = (time, delta) => {
      const left = Math.max(0, 20 - Math.floor((time - this.startedAt) / 1000));
      this.setStatus(`SNACKS CAUGHT  ${caught}   ·   0:${String(left).padStart(2, "0")}   ·   A by basket to skip`);
      for (const snack of snacks) {
        snack.go.y += snack.speed * (delta / 1000);
        snack.go.x += Math.sin(time * 0.003 + snack.go.y) * 0.6;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, snack.go.x, snack.go.y) < 27) {
          caught += 1;
          this.sparkle(snack.go.x, snack.go.y, "●");
          snack.go.setPosition(Phaser.Math.Between(55, W - 55), -Phaser.Math.Between(60, 250));
        } else if (snack.go.y > H + 10) snack.go.setPosition(Phaser.Math.Between(55, W - 55), -Phaser.Math.Between(40, 190));
      }
      if (left <= 0 || caught >= 8) this.finishNourSnacks(false);
    };
  }

  private finishNourSnacks(skipped: boolean) {
    if (this.finished) return;
    this.finished = true;
    quests.onMinigame("nour_snacks");
    this.afterDialogue("Nour", [skipped ? "Snack catching skipped. The sibling chatting begins immediately." : "Excellent catch. Nour pretends every snack was thrown perfectly.", "Family, no matter the distance."], () => this.returnToWorld("germany"));
  }

  private buildFryThief() {
    this.baseRoom(0xa6d9e8, 0xf4c95d, "HUDAYRIYAT · FRY PATROL");
    this.spawnPlayer(W / 2 - 86, H - 78);
    const moomooDef = NPCS.find((n) => n.id === "moomoo");
    if (moomooDef) {
      const moomoo = new NPC(this, moomooDef).place(W / 2 + 92, H - 78);
      this.tweens.add({ targets: moomoo.sprite, angle: { from: -2, to: 2 }, duration: 420, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
    this.add.rectangle(W / 2, H - 80, 116, 58, 0xc98d55).setStrokeStyle(3, 0x7a5238).setDepth(H - 82);
    this.add.text(W / 2, H - 82, "FRIES\n▥▥▥", { fontFamily: FONT, fontSize: "12px", color: "#fff4e6", align: "center", resolution: 2 }).setOrigin(0.5).setDepth(H - 80);
    const gull = this.add.container(80, 128).setDepth(300);
    gull.add([this.add.ellipse(0, 0, 34, 14, 0xf5f4ef).setStrokeStyle(2, 0x6f819d), this.add.triangle(-14, 1, 0, 0, -19, -9, -5, -2, 0xd9e6ef), this.add.triangle(14, 1, 0, 0, 19, -9, 5, -2, 0xd9e6ef), this.add.text(0, 0, "•", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5)]);
    let saves = 0;
    let phase = 0;
    this.startedAt = this.time.now;
    this.addInteractable(W / 2, H - 95, 150, "A · Guard the fries", () => {
      const dist = Phaser.Math.Distance.Between(gull.x, gull.y, W / 2, H - 104);
      if (dist < 95) {
        saves += 1;
        this.sparkle(gull.x, gull.y, "!");
        this.speech(W / 2, H - 120, saves >= 4 ? "Fries defended!" : "Not today, tiny pirate.");
        phase += Math.PI;
      } else {
        this.stress = Math.min(100, this.stress + 12);
        this.speech(this.player.x, this.player.y - 24, "Too early. The seagull files this information.", "#ffd3d3");
      }
    });
    this.activityUpdate = (time) => {
      const elapsed = (time - this.startedAt) / 1000;
      const left = Math.max(0, 22 - Math.floor(elapsed));
      const t = elapsed * 1.8 + phase;
      const dive = (Math.sin(t) + 1) / 2;
      gull.x = W / 2 + Math.cos(t * 0.7) * (245 - dive * 145);
      gull.y = 98 + dive * 205;
      gull.angle = Math.sin(t) * 8;
      this.setStatus(`FRIES SAVED  ${saves}/4   ·   A when the gull dives   ·   0:${String(left).padStart(2, "0")}`);
      if (saves >= 4 || left <= 0) this.finishFryThief(saves);
    };
  }

  private finishFryThief(saves: number) {
    if (this.finished) return;
    this.finished = true;
    quests.onMinigame("fry_thief");
    this.afterDialogue("Hudayriyat", [saves >= 4 ? "All fries accounted for. The seagull leaves with professional respect." : "A few fries were lost in action. The important fries survived.", "Moomoo: Best drive. Best trucks. Most dramatic chips."], () => this.returnToWorld("abudhabi_hudayriyat"));
  }

  private afterDialogue(name: string, lines: string[], done?: () => void) {
    if (!done) {
      uiEvents.emit("dialogue", name, lines);
      return;
    }
    controls.locked = true;
    const closed = () => {
      uiEvents.off("dialogueClosed", closed);
      controls.locked = false;
      done();
    };
    uiEvents.once("dialogueClosed", closed);
    uiEvents.emit("dialogue", name, lines);
  }

  private returnToMall() {
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.Mall, { mallId: this.taskData.mallId ?? "dubai_mall" });
  }

  private returnToWorld(locationId = this.taskData.returnLocation ?? store.state.currentLocation) {
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.World, { locationId, driving: false });
  }

  private tryInteract() {
    if (controls.locked || !this.current || this.time.now - this.lastInteract < 220) return;
    this.lastInteract = this.time.now;
    this.current.trigger();
  }

  private shutdownActivity() {
    uiEvents.emit("prompt", null);
    uiEvents.emit("dedicatedStatus", null);
    uiEvents.off("action", this.tryInteract, this);
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
  }

  update(time: number, delta: number) {
    if (!this.player) return;
    let vx = 0;
    let vy = 0;
    if (!controls.locked && !this.finished) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.tryInteract();
    }
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    this.player.move(vx * this.player.speed, vy * this.player.speed);
    this.player.x = Phaser.Math.Clamp(this.player.x, 28, W - 28);
    this.player.y = Phaser.Math.Clamp(this.player.y, 66, H - 32);
    this.activityUpdate?.(time, delta);

    let best: Interactable | undefined;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (it.active === false) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
      if (d <= it.radius && d < bestD) { best = it; bestD = d; }
    }
    if (best !== this.current) {
      this.current = best;
      uiEvents.emit("prompt", best?.prompt ?? null);
    }
  }
}
