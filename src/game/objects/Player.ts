import Phaser from "phaser";
import { Depths } from "../constants";
import type { Facing } from "../data/npcs";
import { applyFeetBody, applyVisual, getVisualTexture } from "../visual/assets";

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = "down";
  speed = 90;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, texture = "char_her") {
    const key = getVisualTexture(scene, texture);
    super(scene, x, y, key, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shadow = scene.add.image(x, y + 4, getVisualTexture(scene, "o_shadow"));
    this.shadow.setDepth(Depths.ground + 1);
    applyVisual(this.shadow, "o_shadow");
    this.shadow.setDisplaySize(18, 8);

    applyVisual(this, key);
    applyFeetBody(this, key);
    this.play(`${key}-idle-down`);
  }

  setTexturePreserveAnim(texture: string) {
    this.setTexture(texture, 0);
    applyVisual(this, texture);
    applyFeetBody(this, texture);
  }

  move(vx: number, vy: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const key = this.texture.key;
    body.setVelocity(vx, vy);

    if (vx === 0 && vy === 0) {
      const idle =
        this.facing === "left" || this.facing === "right" ? "idle-side" : `idle-${this.facing}`;
      this.anims.play(`${key}-${idle}`, true);
      this.setFlipX(this.facing === "left");
      return;
    }

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
    this.shadow.setPosition(this.x, this.y + 3);
    this.shadow.setDepth(this.y - 2);
  }

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
