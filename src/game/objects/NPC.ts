import Phaser from "phaser";
import { Depths } from "../constants";
import type { NpcDef } from "../data/npcs";

export class NPC extends Phaser.Physics.Arcade.Image {
  def: NpcDef;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private bob: number;

  constructor(scene: Phaser.Scene, def: NpcDef) {
    // invisible physics anchor; the visible part is a child sprite
    super(scene, 0, 0, "");
    this.def = def;
    this.bob = Math.random() * Math.PI * 2;

    const key = `char_${def.id}`;
    this.sprite = scene.add.sprite(0, 0, key, 0);
    this.sprite.setOrigin(0.5, 0.85);
    const idle =
      def.facing === "left" || def.facing === "right" ? "idle-side" : `idle-${def.facing ?? "down"}`;
    this.sprite.play(`${key}-${idle}`);
    if (def.facing === "left") this.sprite.setFlipX(true);

    scene.add.image(0, 6, "o_shadow").setDepth(Depths.ground + 1).setName(`shadow_${def.id}`);

    this.label = scene.add
      .text(0, -16, def.name, {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#fff",
        backgroundColor: "rgba(58,43,58,0.7)",
        padding: { x: 3, y: 1 },
        resolution: 3,
      })
      .setOrigin(0.5, 1);
  }

  place(x: number, y: number) {
    this.setPosition(x, y);
    this.sprite.setPosition(x, y).setDepth(y);
    this.label.setPosition(x, y - 14).setDepth(y + 1);
    const shadow = this.scene.children.getByName(`shadow_${this.def.id}`) as Phaser.GameObjects.Image;
    shadow?.setPosition(x, y + 3);
    return this;
  }

  faceTowards(x: number, y: number) {
    const key = `char_${this.def.id}`;
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.sprite.setFlipX(dx < 0);
      this.sprite.play(`${key}-idle-side`, true);
    } else {
      this.sprite.setFlipX(false);
      this.sprite.play(`${key}-idle-${dy < 0 ? "up" : "down"}`, true);
    }
  }

  update(t: number) {
    // gentle idle bob
    this.sprite.y = this.y + Math.sin(t / 400 + this.bob) * 0.6;
  }
}
