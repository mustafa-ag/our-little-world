import Phaser from "phaser";
import type { Facing } from "../data/npcs";
import { createVisualShadow, DEFAULT_LIGHTING_PROFILE, getVisualAssetDef, type LightingProfile, type VisualShadowHandle } from "../visual";

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = "down";
  speed = 90;
  private static readonly VISUAL_SCALE = 1.22;
  private shadow?: VisualShadowHandle;

  constructor(scene: Phaser.Scene, x: number, y: number, texture = "char_her", lighting: LightingProfile = DEFAULT_LIGHTING_PROFILE) {
    super(scene, x, y, texture, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shadow = createVisualShadow(scene, x, y + 4, getVisualAssetDef(texture)?.shadow, lighting);

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
    super.destroy(fromScene);
  }
}
