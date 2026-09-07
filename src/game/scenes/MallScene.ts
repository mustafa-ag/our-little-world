import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { NPCS } from "../data/npcs";
import { NPC } from "../objects/NPC";
import { Player } from "../objects/Player";
import { controls, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";

type MallId = "dubai_mall" | "dubai_hills_mall" | "yas_mall";

interface MallConfig {
  id: MallId;
  title: string;
  subtitle: string;
  exterior: string;
  exit: { x: number; y: number };
  floor: number;
  accent: number;
  stores: { kind: "fashion" | "jewelry" | "cafe" | "aquarium" | "cinema" | "accessories"; label: string; x: number; y: number; w: number; h: number }[];
}

const MALLS: Record<MallId, MallConfig> = {
  dubai_mall: {
    id: "dubai_mall",
    title: "Dubai Mall",
    subtitle: "Fashion Avenue · aquarium gallery · fountain coffee",
    exterior: "dubai_downtown",
    exit: { x: 22 * TILE + TILE / 2, y: 42 * TILE },
    floor: 0xf1e6d2,
    accent: 0xb58a52,
    stores: [
      { kind: "fashion", label: "FASHION AVENUE", x: 62, y: 54, w: 132, h: 72 },
      { kind: "jewelry", label: "GOLD & GLEAM", x: 290, y: 54, w: 118, h: 72 },
      { kind: "aquarium", label: "AQUARIUM VIEW", x: 420, y: 52, w: 150, h: 116 },
      { kind: "cafe", label: "FOUNTAIN COFFEE", x: 208, y: 280, w: 150, h: 62 },
    ],
  },
  dubai_hills_mall: {
    id: "dubai_hills_mall",
    title: "Dubai Hills Mall",
    subtitle: "Easy strolls · accessories · garden cafe",
    exterior: "dubai_hills",
    exit: { x: 54 * TILE + TILE / 2, y: 34 * TILE },
    floor: 0xe8efd9,
    accent: 0x6eaa73,
    stores: [
      { kind: "fashion", label: "WEEKEND FITS", x: 56, y: 66, w: 150, h: 70 },
      { kind: "accessories", label: "LITTLE EXTRAS", x: 250, y: 66, w: 132, h: 70 },
      { kind: "cafe", label: "GARDEN CAFE", x: 416, y: 70, w: 138, h: 70 },
      { kind: "jewelry", label: "SOFT SPARKLE", x: 178, y: 274, w: 160, h: 64 },
    ],
  },
  yas_mall: {
    id: "yas_mall",
    title: "Yas Mall",
    subtitle: "Cinema lights · fashion · jewelry · food court",
    exterior: "abudhabi_yasmall",
    exit: { x: 52 * TILE + TILE / 2, y: 30 * TILE },
    floor: 0xe2e6ed,
    accent: 0x4b7fb4,
    stores: [
      { kind: "fashion", label: "YAS STYLE", x: 54, y: 58, w: 142, h: 72 },
      { kind: "jewelry", label: "BRIGHT THINGS", x: 260, y: 58, w: 126, h: 72 },
      { kind: "cinema", label: "TINY CINEMA", x: 420, y: 48, w: 150, h: 108 },
      { kind: "cafe", label: "FOOD COURT", x: 196, y: 278, w: 178, h: 62 },
    ],
  },
};

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

export class MallScene extends Phaser.Scene {
  private player!: Player;
  private config!: MallConfig;
  private interactables: Interactable[] = [];
  private current?: Interactable;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInteract = 0;

  constructor() {
    super(SceneKeys.Mall);
  }

  create(data: { mallId?: MallId } = {}) {
    this.config = MALLS[data.mallId ?? "dubai_mall"];
    this.interactables = [];
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("sceneReset");
    uiEvents.emit("prompt", null);
    quests.onInteract("enter_mall");

    const worldW = 640;
    const worldH = 420;
    this.cameras.main.setBackgroundColor("#2b2233");
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.drawInterior(worldW, worldH);
    this.addStores();
    this.addStaff();

    const doorX = worldW / 2;
    const doorY = worldH - 26;
    this.player = new Player(this, doorX, doorY - 18, "char_her");
    this.player.setDepth(doorY);
    this.interactables.push({ x: doorX, y: doorY, radius: 30, prompt: "Leave mall", trigger: () => this.leaveMall() });
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.scale.gameSize.height / 330, 1.15, 1.8));

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.leaveMall, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("locationTitle", this.config.title, this.config.subtitle);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      uiEvents.off("action", this.tryInteract, this);
      uiEvents.off("openMap", this.leaveMall, this);
    });
  }

  private drawInterior(worldW: number, worldH: number) {
    const floor = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0).setDepth(Depths.ground);
    floor.fill(this.config.floor, 1, 0, 0, worldW, worldH);
    for (let y = 20; y < worldH; y += 32) {
      for (let x = 0; x < worldW; x += 32) floor.draw("t_tile", x, y, 0.75);
    }
    const decor = this.add.graphics().setDepth(2);
    decor.fillStyle(0x3a2b3a, 1).fillRect(0, 0, worldW, 22).fillRect(0, 0, 18, worldH).fillRect(worldW - 18, 0, 18, worldH);
    decor.fillStyle(this.config.accent, 1).fillRect(18, 22, worldW - 36, 6);
    decor.fillStyle(0xfff4e6, 1).fillRoundedRect(worldW / 2 - 130, 34, 260, 32, 8);
    this.add.text(worldW / 2, 41, this.config.title.toUpperCase(), { fontFamily: "monospace", fontSize: "16px", color: "#3a2b3a", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(3);
    decor.fillStyle(0x7a5238, 1).fillRect(worldW / 2 - 32, worldH - 28, 64, 28);
    decor.fillStyle(0xf4c95d, 1).fillRect(worldW / 2 + 18, worldH - 16, 3, 3);
    for (const x of [42, worldW - 54]) {
      this.add.image(x, 250, "o_planter").setScale(1.4).setDepth(250);
      this.add.image(x + 12, 130, "o_lamp").setDepth(130);
    }
  }

  private addStores() {
    for (const storeDef of this.config.stores) {
      const { x, y, w, h } = storeDef;
      const g = this.add.graphics().setDepth(y + h);
      const color = storeDef.kind === "jewelry" ? 0xf4c95d : storeDef.kind === "cafe" ? 0x8a5c3b : storeDef.kind === "aquarium" ? 0x3e9dcc : storeDef.kind === "cinema" ? 0x5b4c8a : this.config.accent;
      g.fillStyle(0xfff9f0, 1).fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(3, color, 1).strokeRoundedRect(x, y, w, h, 8);
      g.fillStyle(color, 1).fillRect(x, y, w, 16);
      this.add.text(x + w / 2, y + 3, storeDef.label, { fontFamily: "monospace", fontSize: "9px", color: "#fff", resolution: 2 }).setOrigin(0.5, 0).setDepth(y + h + 1);
      if (storeDef.kind === "aquarium") this.addAquarium(x + w / 2, y + 47);
      if (storeDef.kind === "cinema") this.add.text(x + w / 2, y + 52, "NOW SHOWING\nTINY PIRATES", { fontFamily: "monospace", fontSize: "11px", align: "center", color: "#fff4e6", backgroundColor: "#3a2b3a", padding: { x: 8, y: 5 }, resolution: 2 }).setOrigin(0.5).setDepth(y + h + 1);
      const prompt = storeDef.kind === "fashion" ? "Browse fashion" : storeDef.kind === "jewelry" || storeDef.kind === "accessories" ? "Browse accessories" : storeDef.kind === "cafe" ? "Order coffee" : storeDef.kind === "aquarium" ? "Watch fish" : "Read cinema sign";
      this.interactables.push({ x: x + w / 2, y: y + h + 14, radius: Math.max(28, w / 2), prompt, trigger: () => this.useStore(storeDef.kind, storeDef.label) });
    }
  }

  private addAquarium(x: number, y: number) {
    const water = this.add.rectangle(x, y, 56, 54, 0x63c6e8).setStrokeStyle(2, 0x3a2b3a).setDepth(y);
    const fish = [this.add.image(x - 18, y - 8, "o_flower_yellow").setScale(0.7), this.add.image(x + 16, y + 10, "o_flower_pink").setScale(0.6)];
    fish.forEach((f, i) => this.tweens.add({ targets: f, x: f.x + (i ? -26 : 30), y: f.y + (i ? -8 : 10), duration: 1250 + i * 250, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
    water.setDepth(y - 1);
  }

  private addStaff() {
    const ids = ["fashion_assistant", "jewelry_assistant", "mall_concierge", "mall_cafe_worker"];
    const spots = [[128, 154], [350, 154], [514, 206], [280, 354]];
    ids.forEach((id, index) => {
      const def = NPCS.find((npc) => npc.id === id);
      if (!def) return;
      const npc = new NPC(this, def).place(spots[index][0], spots[index][1]);
      this.interactables.push({
        x: npc.x,
        y: npc.y,
        radius: 24,
        prompt: `Talk to ${def.name}`,
        trigger: () => uiEvents.emit("dialogue", def.name, def.dialogue),
      });
    });
  }

  private useStore(kind: MallConfig["stores"][number]["kind"], label: string) {
    if (kind === "fashion") {
      const cardQuest = quests.currentStep("q_baba_card");
      if (cardQuest?.target === "mall_fashion") {
        uiEvents.emit("openFoodOrder", {
          title: "Choose the first look",
          subtitle: "A tiny fashion decision before the shopping situation escalates.",
          items: [
            { id: "elegant", name: "Elegant", description: "The ‘Baba, this was sensible’ option.", price: 0 },
            { id: "summer", name: "Summer", description: "Bright, easy, immediately holiday-coded.", price: 0 },
            { id: "sporty", name: "Sporty", description: "Ready to sprint away from the receipt.", price: 0 },
          ],
          onOrder: (outfitId: string) => {
            store.setOutfit(outfitId);
            const done = quests.onInteract("mall_fashion");
            uiEvents.emit("dialogue", label, [`${outfitId[0].toUpperCase()}${outfitId.slice(1)} it is.`, "One very sensible look. Baba will absolutely notice.", done?.complete ?? "Fashion decision secured."]);
          },
        });
        return;
      }
      if (quests.currentStep("q_baba_spree")?.target === "shopping_spree") {
        uiEvents.emit("sceneReset");
        this.scene.start(SceneKeys.BabaShopping, { mallId: this.config.id });
        return;
      }
      if (quests.statusOf("q_baba_spree") === "done") {
        uiEvents.emit("choice", {
          kicker: `${this.config.title.toUpperCase()} · REPLAY`,
          title: "Baba Shopping Challenge",
          prompt: "The staff remember the receipts. Baba has not emotionally recovered.",
          accent: "#e46d94",
          cancelLabel: "Browse normally",
          choices: [{ id: "replay", label: "Start the mall gauntlet", description: "Replay for chosen purchases and a new report. Quest rewards do not repeat.", icon: "▣" }],
          onChoose: () => {
            uiEvents.emit("sceneReset");
            this.scene.start(SceneKeys.BabaShopping, { mallId: this.config.id, replay: true });
          },
        });
        return;
      }
      uiEvents.emit("dialogue", label, ["Cute tops, jackets, shoes, and a mirror that says yes."]);
      return;
    }
    if (kind === "jewelry" || kind === "accessories") {
      uiEvents.emit("dialogue", label, ["Necklace, earrings, bangle, handbag. Extremely necessary."]);
      return;
    }
    if (kind === "cafe") {
      const pair = quests.currentStep("q_date")?.target === "mall_coffee_pair";
      uiEvents.emit("minigame", { kind: "coffee", title: label, hint: pair ? "Make two cups: espresso, milk, two sugars, lid." : "Espresso, milk, sugar, lid. You know the order.", onDone: (ok?: boolean) => {
        if (!ok) return;
        store.addItem("coffee");
        quests.onMinigame(pair ? "mall_coffee_pair" : "coffee");
        uiEvents.emit("dialogue", label, [pair ? "Two warm cups, two sugars each. Carry them carefully back to Moomoo." : "His exact order. Naturally."]);
      } });
      return;
    }
    uiEvents.emit("dialogue", label, [kind === "aquarium" ? "The fish look busy judging every shopping bag." : "Tonight only: Tiny Pirates and one very suspicious mustache."]);
  }

  private leaveMall() {
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.World, { locationId: this.config.exterior, spawn: this.config.exit, driving: false });
  }

  private tryInteract() {
    if (controls.locked || !this.current) return;
    if (this.time.now - this.lastInteract < 200) return;
    this.lastInteract = this.time.now;
    this.current.trigger();
  }

  update() {
    let vx = 0;
    let vy = 0;
    if (!controls.locked) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.tryInteract();
      vx += controls.moveX;
      vy += controls.moveY;
    }
    const length = Math.hypot(vx, vy);
    if (length > 1) { vx /= length; vy /= length; }
    this.player.move(vx * this.player.speed, vy * this.player.speed);
    this.player.x = Phaser.Math.Clamp(this.player.x, 30, 610);
    this.player.y = Phaser.Math.Clamp(this.player.y, 52, 390);
    let closest: Interactable | undefined;
    let distance = Infinity;
    for (const item of this.interactables) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (d < item.radius && d < distance) { closest = item; distance = d; }
    }
    if (closest !== this.current) {
      this.current = closest;
      uiEvents.emit("prompt", closest?.prompt ?? null);
    }
  }
}
