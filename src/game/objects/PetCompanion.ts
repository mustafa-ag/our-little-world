import Phaser from "phaser";
import { getVisualTexture } from "../visual";

/** Lightweight independent pet follower; it never occupies the NPC companion slot. */
export class PetCompanion extends Phaser.GameObjects.Container {
  private shadow: Phaser.GameObjects.Ellipse;
  private sprite: Phaser.GameObjects.Image;
  private target = new Phaser.Math.Vector2();
  private lastX: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const shadow = scene.add.ellipse(0, 1, 20, 7, 0x211b25, 0.24);
    const sprite = scene.add.image(0, 0, getVisualTexture(scene, "o_tigor")).setOrigin(0.5, 1).setScale(1.12);
    super(scene, x, y, [shadow, sprite]);
    this.shadow = shadow;
    this.sprite = sprite;
    this.lastX = x;
    this.target.set(x, y);
    scene.add.existing(this);
    this.setDepth(y);
  }

  follow(player: Phaser.GameObjects.Components.Transform, time: number, delta: number, moving: boolean) {
    const side = (player as { flipX?: boolean }).flipX ? 1 : -1;
    this.target.set(player.x + side * 19, player.y + 9);
    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (distance > 170) this.setPosition(this.target.x, this.target.y);
    else {
      const ease = Math.min(1, delta * (moving ? 0.0058 : 0.0032));
      this.x = Phaser.Math.Linear(this.x, this.target.x, ease);
      this.y = Phaser.Math.Linear(this.y, this.target.y, ease);
    }
    const dx = this.x - this.lastX;
    if (Math.abs(dx) > 0.05) this.sprite.setFlipX(dx < 0);
    const trot = moving && distance > 8 ? Math.sin(time * 0.018) * 1.8 : Math.sin(time * 0.004) * 0.6;
    this.sprite.setY(trot);
    this.sprite.setAngle(moving ? Math.sin(time * 0.013) * 2 : 0);
    this.shadow.setScale(1 + Math.abs(trot) * 0.02, 1);
    this.lastX = this.x;
    this.setDepth(this.y + 1);
  }

  celebrate() {
    this.scene.tweens.add({ targets: this.sprite, y: -7, angle: 6, duration: 150, yoyo: true, repeat: 2, ease: "Quad.out" });
  }
}
