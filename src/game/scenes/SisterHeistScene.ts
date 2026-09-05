import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { Player } from "../objects/Player";
import { controls, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

export class SisterHeistScene extends Phaser.Scene {
  private player!: Player;
  private fadwa!: Phaser.GameObjects.Sprite;
  private looking = false;
  private safeOpen = false;
  private current?: Interactable;
  private interactables: Interactable[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private status!: Phaser.GameObjects.Text;
  private cone!: Phaser.GameObjects.Graphics;
  private lastInteract = 0;
  private caughtAt = 0;
  private readonly blockMap = () => store.toast("Not while wearing a mustache.", "#e46d94");

  constructor() {
    super(SceneKeys.SisterHeist);
  }

  create() {
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("sceneReset");
    const worldW = 560;
    const worldH = 400;
    this.cameras.main.setBackgroundColor("#2b2233");
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.drawRoom(worldW, worldH);
    this.player = new Player(this, worldW / 2, worldH - 44, "char_her");
    this.player.setDepth(worldH - 44);
    this.fadwa = this.add.sprite(282, 204, "char_fadwa", 0).setOrigin(0.5, 0.85).setDepth(204);
    this.fadwa.play("char_fadwa-idle-side").setFlipX(true);
    this.cone = this.add.graphics().setDepth(4);
    this.status = this.add.text(worldW / 2, 28, "FADWA IS NOT LOOKING", { fontFamily: "monospace", fontSize: "13px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(worldW / 2, 48, "Reach Grandma's safe while she looks away.", { fontFamily: "monospace", fontSize: "10px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5);
    this.interactables.push({ x: 454, y: 116, radius: 30, prompt: "Open Grandma's secret safe", trigger: () => this.openSafe() });
    this.interactables.push({ x: worldW / 2, y: worldH - 20, radius: 30, prompt: "Escape with the jewels", trigger: () => this.escape() });
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.blockMap, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("locationTitle", "Fadwa's Edinburgh Room", "Operation: definitely normal");
    this.time.addEvent({ delay: 2200, loop: true, callback: () => this.toggleLook() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      uiEvents.off("action", this.tryInteract, this);
      uiEvents.off("openMap", this.blockMap, this);
    });
  }

  private drawRoom(worldW: number, worldH: number) {
    const floor = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0).setDepth(Depths.ground);
    floor.fill(0x9d704e, 1, 0, 0, worldW, worldH);
    for (let y = 0; y < worldH; y += TILE) for (let x = 0; x < worldW; x += TILE) floor.draw("t_wood", x, y);
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x4a3224, 1).fillRect(0, 0, worldW, 30).fillRect(0, 0, 18, worldH).fillRect(worldW - 18, 0, 18, worldH);
    g.fillStyle(0xc98aa8, 1).fillRoundedRect(180, 230, 180, 82, 8);
    this.add.image(84, 128, "f_bookshelf").setScale(1.7).setDepth(128);
    this.add.image(112, 284, "f_sofa").setScale(1.5).setDepth(284);
    this.add.image(392, 276, "f_plant").setScale(1.4).setDepth(276);
    const safe = this.add.graphics().setDepth(116);
    safe.fillStyle(0x59616d, 1).fillRect(424, 82, 60, 40).lineStyle(2, 0x2b2233, 1).strokeRect(424, 82, 60, 40);
    safe.fillStyle(0xf4c95d, 1).fillCircle(454, 102, 8).fillStyle(0x3a2b3a, 1).fillCircle(454, 102, 2);
    this.add.text(454, 128, "GRANDMA'S SAFE", { fontFamily: "monospace", fontSize: "8px", color: "#fff4e6", backgroundColor: "#3a2b3a", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(130);
    g.fillStyle(0x7a5238, 1).fillRect(worldW / 2 - 30, worldH - 28, 60, 28);
  }

  private toggleLook() {
    this.looking = !this.looking;
    this.fadwa.setFlipX(!this.looking);
    this.fadwa.play("char_fadwa-idle-side", true);
    this.status.setText(this.looking ? "FADWA IS LOOKING!" : "FADWA IS NOT LOOKING").setColor(this.looking ? "#ff8fae" : "#fff4e6");
  }

  private drawCone() {
    this.cone.clear();
    if (!this.looking || this.safeOpen) return;
    this.cone.fillStyle(0xffe08a, 0.16);
    this.cone.fillTriangle(this.fadwa.x, this.fadwa.y - 12, this.fadwa.x + 165, this.fadwa.y - 95, this.fadwa.x + 165, this.fadwa.y + 58);
  }

  private caught() {
    if (this.time.now - this.caughtAt < 1200 || this.safeOpen) return;
    this.caughtAt = this.time.now;
    this.player.setPosition(280, 350);
    this.cameras.main.shake(140, 0.01);
    uiEvents.emit("dialogue", "Fadwa", ["Juju... why are you wearing a mustache?", "Go stand by the door and think about it."]);
  }

  private openSafe() {
    if (this.safeOpen) return;
    if (quests.currentStep("q_family_jewel_heist")?.target !== "family_safe") {
      store.toast("The safe is waiting for the actual heist.", "#a08a70");
      return;
    }
    uiEvents.emit("minigame", {
      kind: "safe",
      title: "GRANDMA'S SECRET SAFE",
      hint: "Cycle the three symbols. The note says HEART, FISH, STAR.",
      onDone: () => {
        this.safeOpen = true;
        quests.onMinigame("family_safe");
        store.addItem("grandmas_jewelry");
        store.addItem("mamas_bangle");
        store.unlockAccessory("bangle");
        store.setAccessory("bangle");
        const sparkle = this.add.image(454, 88, "i_jewelry").setScale(1.8).setDepth(180);
        this.tweens.add({ targets: sparkle, y: 62, alpha: 0, scale: 2.6, duration: 650, onComplete: () => sparkle.destroy() });
        this.status.setText("SAFE OPEN! GET TO THE DOOR!").setColor("#57a56d");
      },
    });
  }

  private escape() {
    if (!this.safeOpen || quests.currentStep("q_family_jewel_heist")?.target !== "escape_sister_room") {
      store.toast("The jewelry is still in the safe.", "#a08a70");
      return;
    }
    const done = quests.onInteract("escape_sister_room");
    store.setFlag("pirate_disguise", false);
    store.setFlag("heist_victory_pending");
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.World, { locationId: "edinburgh_oldtown", driving: false });
    if (!done) store.toast("Absolutely no crimes occurred.", "#f4c95d");
  }

  private tryInteract() {
    if (controls.locked || !this.current || this.time.now - this.lastInteract < 200) return;
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
    this.player.x = Phaser.Math.Clamp(this.player.x, 30, 530);
    this.player.y = Phaser.Math.Clamp(this.player.y, 46, 370);
    this.drawCone();
    if (this.looking && !this.safeOpen && this.player.x > this.fadwa.x && Math.abs(this.player.y - this.fadwa.y) < 70 && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.fadwa.x, this.fadwa.y) < 170) this.caught();
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
