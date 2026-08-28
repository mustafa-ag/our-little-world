import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { getLocation } from "../data/locations";
import { Player } from "../objects/Player";
import { store } from "../systems/store";
import { controls, uiEvents } from "../systems/controls";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

const RW = 18; // room width (tiles)
const RH = 13; // room height (tiles)

export class HouseScene extends Phaser.Scene {
  private player!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private interactables: Interactable[] = [];
  private currentPrompt: Interactable | null = null;
  private lastInteract = 0;
  private solids!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super(SceneKeys.House);
  }

  create(data: { title?: string; interior?: "cream" | "brown" } = {}) {
    this.interactables = [];
    uiEvents.emit("prompt", null);
    const worldW = RW * TILE;
    const worldH = RH * TILE;
    const brown = data.interior === "brown";
    const title = data.title ?? getLocation(store.state.currentLocation).homeName ?? "Home";

    this.cameras.main.setBackgroundColor(brown ? "#2a1810" : "#2b2233");
    this.physics.world.setBounds(TILE, TILE * 2, worldW - TILE * 2, worldH - TILE * 3);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // floor
    const rt = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0, 0).setDepth(Depths.ground);
    rt.beginDraw();
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < RW; x++) rt.batchDraw("t_wood", x * TILE, y * TILE);
    rt.endDraw();
    if (brown) {
      this.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, 0x4a3224, 0.35).setDepth(Depths.ground + 1);
    }

    // rug
    this.add.image(worldW / 2, worldH / 2 + 8, "f_rug").setDepth(1);

    // walls (top band) + border collision
    const wall = this.add.graphics().setDepth(Depths.overlay - 1);
    wall.fillStyle(brown ? 0x6b4535 : 0xede0d0, 1);
    wall.fillRect(0, 0, worldW, TILE * 2);
    wall.fillStyle(brown ? 0x5a382c : 0xd8c6b0, 1);
    wall.fillRect(0, TILE * 2 - 3, worldW, 3);
    // a cute window + picture on the wall
    this.add.image(TILE * 4, TILE * 1, "f_tv").setScale(0).setVisible(false); // reserved
    const win = this.add.graphics().setDepth(Depths.overlay - 1);
    win.fillStyle(0xbfe6ff, 1).fillRect(TILE * 3, 6, 28, 20);
    win.fillStyle(0x8fbfe0, 1).fillRect(TILE * 3, 6, 28, 3);
    win.lineStyle(2, 0xa9744f).strokeRect(TILE * 3, 6, 28, 20);
    // heart picture + a little "Juju ❤ Moomoo" frame on the wall
    this.add.image(worldW - TILE * 4, TILE * 1 + 2, "ui_heart").setScale(1.6).setDepth(Depths.overlay - 1);
    this.add
      .text(worldW - TILE * 4, TILE * 1 + 14, "Juju + Moomoo", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#e46d94",
        resolution: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(Depths.overlay - 1);

    this.buildCollision();

    // starter + owned furniture
    this.add.image(TILE * 3, TILE * 4.5, "f_bed").setOrigin(0.5, 1).setDepth(TILE * 4.5);
    this.addFurnitureInteract(TILE * 3, TILE * 4.5 - 8, "Rest here (save & new day)", () => {
      store.addHearts(1);
      store.toast("A cozy new day together", "#ff8fae");
      uiEvents.emit("dialogue", "Home", ["You rest for a while. Everything feels calmer with you here."]);
    });

    for (const f of store.state.furniture) {
      this.add.image(f.x, f.y, f.tex).setOrigin(0.5, 1).setDepth(f.y);
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
    this.player = new Player(this, doorX, doorY - TILE * 2, "char_her");
    this.physics.add.collider(this.player, this.solids);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.openMap, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("locationTitle", title, brown ? "Top floor · brown inside" : title);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      uiEvents.off("action", this.tryInteract, this);
      uiEvents.off("openMap", this.openMap, this);
      this.scale.off("resize", this.applyZoom, this);
    });
  }

  private addFurnitureInteract(x: number, y: number, prompt: string, trigger: () => void) {
    this.interactables.push({ x, y, radius: 22, prompt, trigger });
  }

  private buildCollision() {
    this.solids = this.physics.add.staticGroup();
    const add = (x: number, y: number, w: number, h: number) => {
      const go = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0);
      this.physics.add.existing(go, true);
      this.solids.add(go);
    };
    const worldW = RW * TILE;
    const worldH = RH * TILE;
    add(0, 0, worldW, TILE * 2); // top wall
    add(0, 0, TILE, worldH); // left
    add(worldW - TILE, 0, TILE, worldH); // right
    add(0, worldH - TILE, worldW / 2 - TILE, TILE); // bottom left of door
    add(worldW / 2 + TILE, worldH - TILE, worldW / 2 - TILE, TILE); // bottom right of door
  }

  private exitHouse() {
    const loc = getLocation(store.state.currentLocation);
    const s = loc.city?.spawn ?? { tx: 66, ty: 48 };
    this.scene.start(SceneKeys.World, {
      locationId: loc.id,
      spawn: { x: s.tx * TILE + TILE / 2, y: (s.ty + 2) * TILE },
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
    if (!controls.locked) {
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
    this.player.move(vx * this.player.speed, vy * this.player.speed);

    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
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
