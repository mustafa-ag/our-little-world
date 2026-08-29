import Phaser from "phaser";
import { Depths } from "../constants";
import type { NpcDef } from "../data/npcs";
import { applyVisual, getVisualTexture } from "../visual/assets";
import { FONT_UI } from "../visual/theme";

export class NPC extends Phaser.Physics.Arcade.Image {
  def: NpcDef;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Image;
  private bob: number;

  constructor(scene: Phaser.Scene, def: NpcDef) {
    super(scene, 0, 0, "");
    this.def = def;
    this.bob = Math.random() * Math.PI * 2;

    const gameplayKey = `char_${def.id}`;
    const key = getVisualTexture(scene, gameplayKey);
    this.sprite = scene.add.sprite(0, 0, key, 0);
    applyVisual(this.sprite, gameplayKey);
    const idle =
      def.facing === "left" || def.facing === "right" ? "idle-side" : `idle-${def.facing ?? "down"}`;
    if (scene.anims.exists(`${key}-${idle}`)) this.sprite.play(`${key}-${idle}`);
    if (def.facing === "left") this.sprite.setFlipX(true);

    const shadowKey = scene.textures.exists("hd_shadow_char") ? "hd_shadow_char" : getVisualTexture(scene, "o_shadow");
    this.shadow = scene.add.image(0, 4, shadowKey);
    this.shadow.setDisplaySize(20, 7);
    this.shadow.setAlpha(0.5);
    this.shadow.setDepth(Depths.ground + 1);

    this.label = scene.add
      .text(0, -20, def.name, {
        fontFamily: FONT_UI,
        fontSize: "11px",
        color: "#3a2b3a",
        backgroundColor: "rgba(255,249,244,0.9)",
        padding: { x: 6, y: 3 },
        resolution: 2,
      })
      .setOrigin(0.5, 1);
  }

  place(x: number, y: number) {
    this.setPosition(x, y);
    this.sprite.setPosition(x, y).setDepth(y);
    this.label.setPosition(x, y - 34).setDepth(y + 1);
    this.shadow.setPosition(x, y + 3).setDepth(y - 2);
    return this;
  }

  faceTowards(x: number, y: number) {
    const key = this.sprite.texture.key;
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.sprite.setFlipX(dx < 0);
      if (this.scene.anims.exists(`${key}-idle-side`)) this.sprite.play(`${key}-idle-side`, true);
    } else {
      this.sprite.setFlipX(false);
      const dir = dy < 0 ? "up" : "down";
      if (this.scene.anims.exists(`${key}-idle-${dir}`)) this.sprite.play(`${key}-idle-${dir}`, true);
    }
  }

  update(t: number) {
    this.sprite.y = this.y + Math.sin(t / 400 + this.bob) * 0.6;
  }

  destroy(fromScene?: boolean) {
    this.sprite?.destroy();
    this.label?.destroy();
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
