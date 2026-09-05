import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { controls, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";

export class PirateVoyageScene extends Phaser.Scene {
  private hits = 0;
  private shark?: Phaser.GameObjects.Graphics;
  private canAttack = false;
  private status!: Phaser.GameObjects.Text;
  private boat!: Phaser.GameObjects.Container;
  private done = false;

  constructor() {
    super(SceneKeys.PirateVoyage);
  }

  create() {
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("sceneReset");
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#63c6e8");
    const sea = this.add.graphics();
    sea.fillStyle(0x63c6e8, 1).fillRect(0, 0, width, height);
    for (let y = 70; y < height; y += 24) {
      for (let x = (y / 24) % 2 ? -20 : 0; x < width; x += 54) sea.fillStyle(0x8fdcf3, 0.65).fillRect(x, y, 24, 2);
    }
    const clouds = this.add.graphics();
    [[70, 64], [width - 100, 105], [width / 2, 42]].forEach(([x, y]) => {
      clouds.fillStyle(0xffffff, 0.75).fillCircle(x, y, 15).fillCircle(x + 15, y + 4, 11).fillCircle(x - 14, y + 6, 10);
    });
    this.tweens.add({ targets: clouds, x: "+=16", duration: 2800, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.add.text(width / 2, 18, "PIRATE VOYAGE", { fontFamily: "monospace", fontSize: "20px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 }).setOrigin(0.5);
    this.status = this.add.text(width / 2, 48, "SHARKS: 0 / 3", { fontFamily: "monospace", fontSize: "13px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5);
    this.add.text(width / 2, 68, "Edinburgh is definitely this way.", { fontFamily: "monospace", fontSize: "11px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5);
    this.boat = this.makeBoat(width / 2, height * 0.61);
    this.tweens.add({ targets: this.boat, y: this.boat.y - 7, angle: 1.5, duration: 620, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.addFish(width * 0.16, height * 0.78, 1);
    this.addFish(width * 0.82, height * 0.73, -1);
    const attack = this.add.text(width / 2, height - 52, "ATTACK!", { fontFamily: "monospace", fontSize: "20px", color: "#fff", backgroundColor: "#d84652", padding: { x: 18, y: 10 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    attack.on("pointerdown", () => this.attack());
    this.input.keyboard?.on("keydown", this.keyAttack, this);
    uiEvents.on("action", this.attack, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.keyAttack, this);
      uiEvents.off("action", this.attack, this);
    });
    this.time.delayedCall(850, () => this.spawnShark());
  }

  private makeBoat(x: number, y: number) {
    const hull = this.add.graphics();
    hull.fillStyle(0x7a5238, 1).fillTriangle(-46, 0, 46, 0, 28, 22).fillTriangle(-46, 0, -28, 22, 28, 22);
    hull.fillStyle(0x5a382c, 1).fillRect(-32, -5, 60, 8);
    hull.fillStyle(0x8a5c3b, 1).fillRect(-2, -70, 4, 66);
    hull.fillStyle(0xfff4e6, 1).fillTriangle(2, -66, 2, -14, 36, -18);
    hull.fillStyle(0xd84652, 1).fillRect(2, -70, 22, 12);
    const her = this.add.sprite(-16, -18, "char_her", 0).setScale(1.6).setOrigin(0.5, 1);
    const hat = this.add.graphics();
    hat.fillStyle(0x2a2230, 1).fillRect(-22, -42, 12, 3).fillStyle(0xd84652, 1).fillRect(-20, -46, 8, 4);
    hat.fillStyle(0x2a2230, 1).fillRect(-19, -31, 6, 1).fillRect(-20, -30, 2, 1).fillRect(-14, -30, 2, 1);
    return this.add.container(x, y, [hull, her, hat]);
  }

  private addFish(x: number, y: number, dir: number) {
    const fish = this.add.image(x, y, "o_flower_yellow").setScale(0.8).setFlipX(dir < 0);
    this.tweens.add({ targets: fish, x: x + dir * 46, y: y - 8, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  private keyAttack(event: KeyboardEvent) {
    if (event.code === "Space" || event.code === "KeyE" || event.code === "KeyA") this.attack();
  }

  private spawnShark() {
    if (this.done) return;
    this.canAttack = false;
    this.shark?.destroy();
    const { width, height } = this.scale.gameSize;
    const fromLeft = this.hits % 2 === 0;
    const x = fromLeft ? -40 : width + 40;
    const y = height * 0.63 + (this.hits % 2 ? 30 : -20);
    const shark = this.add.graphics();
    shark.fillStyle(0x5a6a7b, 1).fillTriangle(-24, 0, 22, -10, 22, 10).fillTriangle(-4, -5, 4, -27, 10, -4);
    shark.fillStyle(0xffffff, 1).fillRect(12, -4, 3, 3).fillStyle(0x2a2230, 1).fillRect(13, -3, 1, 1);
    shark.setPosition(x, y).setScale(fromLeft ? 1 : -1, 1);
    this.shark = shark;
    this.status.setText(`SHARKS: ${this.hits} / 3  ·  ! INCOMING !`);
    this.tweens.add({
      targets: shark,
      x: width / 2 + (fromLeft ? -78 : 78),
      duration: 1400,
      ease: "Sine.out",
      onComplete: () => {
        if (this.done || this.shark !== shark) return;
        this.canAttack = true;
        this.status.setText(`SHARKS: ${this.hits} / 3  ·  ATTACK NOW!`);
        this.time.delayedCall(1100, () => {
          if (!this.canAttack || this.shark !== shark) return;
          this.canAttack = false;
          this.cameras.main.shake(130, 0.012);
          this.status.setText("BONKED! The boat is okay. Try again.");
          this.spawnShark();
        });
      },
    });
  }

  private attack() {
    if (this.done) return;
    if (!this.canAttack || !this.shark) {
      this.status.setText("Swing when the shark is close!");
      return;
    }
    this.canAttack = false;
    const shark = this.shark;
    this.tweens.add({ targets: shark, x: shark.x + (shark.scaleX > 0 ? -150 : 150), y: shark.y - 45, angle: 180, alpha: 0, duration: 420, onComplete: () => shark.destroy() });
    this.hits += 1;
    this.status.setText(`SHARKS: ${this.hits} / 3  ·  SPLASH!`);
    if (this.hits >= 3) {
      this.done = true;
      this.time.delayedCall(650, () => {
        quests.onMinigame("shark_attack");
        quests.onVisit("edinburgh");
        store.toast("Edinburgh ahead! Somehow.", "#8ecae6");
        this.scene.start(SceneKeys.World, { locationId: "edinburgh_oldtown", driving: false });
      });
    } else this.time.delayedCall(620, () => this.spawnShark());
  }
}
