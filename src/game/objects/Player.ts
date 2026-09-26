import Phaser from "phaser";
import type { Facing } from "../data/npcs";
import { createVisualShadow, DEFAULT_LIGHTING_PROFILE, getVisualAssetDef, type LightingProfile, type VisualShadowHandle } from "../visual";
import { store } from "../systems/store";

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = "down";
  speed = 90;
  private static readonly VISUAL_SCALE = 1.22;
  private shadow?: VisualShadowHandle;
  private accessory: Phaser.GameObjects.Graphics;
  private disguise: Phaser.GameObjects.Graphics;
  private parrot: Phaser.GameObjects.Graphics;
  private parrotSpeech: Phaser.GameObjects.Text;
  private parrotX: number;
  private parrotY: number;
  private lastParrotArr = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture = "char_her", lighting: LightingProfile = DEFAULT_LIGHTING_PROFILE) {
    super(scene, x, y, texture, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shadow = createVisualShadow(scene, x, y + 4, getVisualAssetDef(texture)?.shadow, lighting);
    this.accessory = scene.add.graphics();
    this.disguise = scene.add.graphics();
    this.parrot = scene.add.graphics();
    this.parrotSpeech = scene.add.text(x, y, "ARR!", {
      fontFamily: "monospace",
      fontSize: "8px",
      color: "#fff4e6",
      backgroundColor: "#3a2b3a",
      padding: { x: 3, y: 1 },
      resolution: 2,
    }).setOrigin(0.5, 1).setVisible(false);
    this.parrotX = x - 17;
    this.parrotY = y - 17;

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Presentation is larger for touch screens; this stays the same logical footprint.
    this.setScale(Player.VISUAL_SCALE);
    body.setSize(8, 6);
    body.setOffset(4, 10);
    this.setOrigin(0.5, 0.85);
    this.play(`${texture}-idle-down`);
  }

  setTexturePreserveAnim(texture: string) {
    this.setTexture(texture, 0);
  }

  move(vx: number, vy: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const key = this.texture.key;
    body.setVelocity(vx, vy);

    if (vx === 0 && vy === 0) {
      this.anims.play(`${key}-idle-${this.facing === "left" || this.facing === "right" ? "side" : this.facing}`, true);
      if (this.facing === "left") this.setFlipX(true);
      else if (this.facing === "right") this.setFlipX(false);
      return;
    }

    // pick dominant axis for facing
    if (Math.abs(vx) > Math.abs(vy)) {
      this.facing = vx < 0 ? "left" : "right";
      this.setFlipX(vx < 0);
      this.anims.play(`${key}-walk-side`, true);
    } else {
      this.facing = vy < 0 ? "up" : "down";
      this.setFlipX(false);
      this.anims.play(`${key}-walk-${this.facing}`, true);
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.setDepth(this.y);
    this.shadow?.setContactPoint(this.x, this.y + 4);
    this.drawCosmetics(time, delta);
  }

  private drawCosmetics(time: number, delta: number) {
    const x = Math.round(this.x);
    const y = Math.round(this.y - 10);
    this.accessory.clear();
    const accessory = store.state.equippedAccessory;
    if (accessory === "necklace" || accessory === "gold_textured_necklace") {
      this.accessory.lineStyle(1, 0xf4c95d, 1).beginPath().arc(x, y + 7, 4, 0.15, Math.PI - 0.15).strokePath();
      this.accessory.fillStyle(accessory === "gold_textured_necklace" ? 0xf4c95d : 0xff8fae, 1).fillRect(x - 1, y + 10, 2, 2);
    } else if (accessory === "earrings") {
      this.accessory.fillStyle(0xf4c95d, 1).fillRect(x - 6, y + 4, 2, 3).fillRect(x + 5, y + 4, 2, 3);
    } else if (accessory === "bangle" || accessory === "love_bracelet" || accessory === "nail_bracelet") {
      this.accessory.lineStyle(accessory === "nail_bracelet" ? 2 : 1, accessory === "love_bracelet" ? 0xd9b45f : 0xf4c95d, 1).strokeCircle(x + 6, y + 12, accessory === "love_bracelet" ? 2.5 : 2);
      if (accessory === "nail_bracelet") this.accessory.fillStyle(0xf4c95d, 1).fillTriangle(x + 6, y + 8, x + 9, y + 11, x + 6, y + 11);
    } else if (["handbag", "mini_bag", "shoulder_bag", "big_tote"].includes(accessory ?? "")) {
      const bagW = accessory === "mini_bag" ? 4 : accessory === "big_tote" ? 8 : 6;
      const bagH = accessory === "big_tote" ? 7 : 5;
      this.accessory.fillStyle(accessory === "shoulder_bag" ? 0x8c5b45 : accessory === "big_tote" ? 0x527fc4 : 0xe46d94, 1).fillRoundedRect(x + 5, y + 10, bagW, bagH, 1);
      this.accessory.lineStyle(1, 0x8a5c3b, 1).beginPath().arc(x + 5 + bagW / 2, y + 10, Math.max(2, bagW / 3), Math.PI, Math.PI * 2).strokePath();
    } else if (accessory === "pearl_hair_clip") {
      this.accessory.fillStyle(0xfff9ef, 1).fillCircle(x + 5, y, 2).fillCircle(x + 7, y + 1, 1.5);
      this.accessory.lineStyle(1, 0xcaa27a, 1).lineBetween(x + 3, y - 1, x + 8, y + 2);
    }

    this.disguise.clear();
    this.parrot.clear();
    const pirate = store.hasFlag("pirate_disguise");
    this.parrotSpeech.setVisible(pirate && this.parrotSpeech.visible);
    if (!pirate) {
      this.parrotSpeech.setVisible(false);
      return;
    }

    // Coat, sash, hat, eye patch, then the objectively excellent moustache.
    this.disguise.fillStyle(0xd84652, 0.95).fillRect(x - 7, y + 8, 14, 5);
    this.disguise.fillStyle(0xf4c95d, 1).fillRect(x - 5, y + 9, 10, 1);
    this.disguise.fillStyle(0x2a2230, 1).fillRect(x - 8, y - 4, 16, 3);
    this.disguise.fillStyle(0xd84652, 1).fillRect(x - 6, y - 8, 12, 5);
    this.disguise.fillStyle(0xf4c95d, 1).fillRect(x - 1, y - 6, 2, 2);
    if (this.facing === "up") {
      this.disguise.fillStyle(0x2a2230, 1).fillRect(x - 5, y + 1, 10, 1);
    } else {
      const patchX = this.facing === "left" ? x - 2 : x + 2;
      this.disguise.fillStyle(0x2a2230, 1).fillRect(x - 5, y + 1, 10, 1).fillCircle(patchX, y + 2, 2);
      this.disguise.fillRect(x - 3, y + 5, 6, 1).fillRect(x - 5, y + 6, 3, 1).fillRect(x + 2, y + 6, 3, 1);
    }
    this.disguise.setDepth(this.y + 2);
    this.accessory.setDepth(this.y + 1);

    const side = this.facing === "left" ? 1 : -1;
    const targetX = this.x + side * (17 + Math.sin(time * 0.0013) * 4);
    const targetY = this.y - 18 + Math.sin(time * 0.006) * 2;
    const follow = Math.min(1, delta * 0.008);
    this.parrotX = Phaser.Math.Linear(this.parrotX, targetX, follow);
    this.parrotY = Phaser.Math.Linear(this.parrotY, targetY, follow);
    const px = Math.round(this.parrotX);
    const py = Math.round(this.parrotY);
    const flutter = Math.sin(time * 0.02) > 0 ? 1 : 0;
    this.parrot.fillStyle(0x2f9a62, 1).fillCircle(px, py, 5);
    this.parrot.fillStyle(0xd84652, 1).fillRect(px - 3, py - 5, 6, 4).fillRect(px - 2, py + 4, 4, 5);
    this.parrot.fillStyle(0x2f6fd0, 1).fillTriangle(px - 4, py, px - 9 - flutter * 2, py + 3, px - 3, py + 4);
    this.parrot.fillStyle(0xf4c95d, 1).fillTriangle(px + 4, py - 2, px + 9, py, px + 4, py + 1);
    this.parrot.fillStyle(0xffffff, 1).fillCircle(px + 2, py - 3, 1.5);
    this.parrot.fillStyle(0x2a2230, 1).fillCircle(px + 2, py - 3, 0.7);
    this.parrot.setDepth(this.y + 3);
    this.parrotSpeech.setPosition(px, py - 9).setDepth(this.y + 4);
    if (time - this.lastParrotArr > 10500) {
      this.lastParrotArr = time;
      this.parrotSpeech.setVisible(true).setAlpha(1).setScale(0.8);
      this.scene.tweens.add({
        targets: this.parrotSpeech,
        y: py - 15,
        alpha: 0,
        scale: 1.05,
        duration: 1100,
        onComplete: () => this.parrotSpeech.setVisible(false),
      });
    }
  }

  /** The tile / point directly in front of the player (for interaction range). */
  facingPoint(dist = 14): { x: number; y: number } {
    const d: Record<Facing, [number, number]> = {
      up: [0, -dist],
      down: [0, dist],
      left: [-dist, 0],
      right: [dist, 0],
    };
    const [dx, dy] = d[this.facing];
    return { x: this.x + dx, y: this.y + dy };
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.accessory?.destroy();
    this.disguise?.destroy();
    this.parrot?.destroy();
    this.parrotSpeech?.destroy();
    super.destroy(fromScene);
  }
}
