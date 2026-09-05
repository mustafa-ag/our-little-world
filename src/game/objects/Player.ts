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

  constructor(scene: Phaser.Scene, x: number, y: number, texture = "char_her", lighting: LightingProfile = DEFAULT_LIGHTING_PROFILE) {
    super(scene, x, y, texture, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shadow = createVisualShadow(scene, x, y + 4, getVisualAssetDef(texture)?.shadow, lighting);
    this.accessory = scene.add.graphics();
    this.disguise = scene.add.graphics();

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
    this.drawCosmetics();
  }

  private drawCosmetics() {
    const x = Math.round(this.x);
    const y = Math.round(this.y - 10);
    this.accessory.clear();
    const accessory = store.state.equippedAccessory;
    if (accessory === "necklace") {
      this.accessory.lineStyle(1, 0xf4c95d, 1).beginPath().arc(x, y + 7, 4, 0.15, Math.PI - 0.15).strokePath();
      this.accessory.fillStyle(0xff8fae, 1).fillRect(x - 1, y + 10, 2, 2);
    } else if (accessory === "earrings") {
      this.accessory.fillStyle(0xf4c95d, 1).fillRect(x - 6, y + 4, 2, 3).fillRect(x + 5, y + 4, 2, 3);
    } else if (accessory === "bangle") {
      this.accessory.lineStyle(1, 0xf4c95d, 1).strokeCircle(x + 6, y + 12, 2);
    } else if (accessory === "handbag") {
      this.accessory.fillStyle(0xe46d94, 1).fillRect(x + 6, y + 10, 4, 5);
      this.accessory.lineStyle(1, 0x8a5c3b, 1).strokeRect(x + 7, y + 8, 2, 3);
    }

    this.disguise.clear();
    if (!store.hasFlag("pirate_disguise")) return;
    this.disguise.fillStyle(0x2a2230, 1).fillRect(x - 6, y - 4, 12, 3);
    this.disguise.fillStyle(0xd84652, 1).fillRect(x - 4, y - 7, 8, 4);
    this.disguise.fillStyle(0xf4c95d, 1).fillRect(x - 1, y - 5, 2, 2);
    this.disguise.fillStyle(0x2a2230, 1).fillRect(x - 3, y + 4, 6, 1);
    this.disguise.fillStyle(0x2a2230, 1).fillRect(x - 4, y + 5, 2, 1).fillRect(x + 2, y + 5, 2, 1);
    this.disguise.setDepth(this.y + 2);
    this.accessory.setDepth(this.y + 1);
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
    super.destroy(fromScene);
  }
}
