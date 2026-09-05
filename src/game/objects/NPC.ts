import Phaser from "phaser";
import type { NpcDef } from "../data/npcs";
import { createVisualShadow, DEFAULT_LIGHTING_PROFILE, getVisualAssetDef, getVisualTexture, type LightingProfile, type VisualShadowHandle } from "../visual";

export class NPC extends Phaser.Physics.Arcade.Image {
  def: NpcDef;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private talkBubble: Phaser.GameObjects.Text;
  private bob: number;
  private shadow?: VisualShadowHandle;

  constructor(scene: Phaser.Scene, def: NpcDef, lighting: LightingProfile = DEFAULT_LIGHTING_PROFILE) {
    // invisible physics anchor; the visible part is a child sprite
    super(scene, 0, 0, "");
    this.def = def;
    this.bob = Math.random() * Math.PI * 2;

    const key = getVisualTexture(scene, `char_${def.id}`);
    this.sprite = scene.add.sprite(0, 0, key, 0);
    this.sprite.setOrigin(0.5, 0.85).setScale(1.22);
    const idle =
      def.facing === "left" || def.facing === "right" ? "idle-side" : `idle-${def.facing ?? "down"}`;
    this.sprite.play(`${key}-${idle}`);
    if (def.facing === "left") this.sprite.setFlipX(true);

    this.shadow = createVisualShadow(scene, 0, 3, getVisualAssetDef(key)?.shadow, lighting);

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
    this.talkBubble = scene.add
      .text(0, -34, "💬", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    scene.tweens.add({ targets: this.talkBubble, y: "-=3", duration: 550, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  place(x: number, y: number) {
    this.setPosition(x, y);
    this.sprite.setPosition(x, y).setDepth(y);
    this.label.setPosition(x, y - 19).setDepth(y + 1);
    this.talkBubble.setPosition(x, y - 30).setDepth(y + 2);
    this.shadow?.setContactPoint(x, y + 3);
    return this;
  }

  faceTowards(x: number, y: number) {
    const key = getVisualTexture(this.scene, `char_${this.def.id}`);
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
    this.shadow?.setContactPoint(this.x, this.y + 3);
  }

  setTalkAvailable(on: boolean) {
    this.talkBubble.setVisible(on);
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.sprite.destroy();
    this.label.destroy();
    this.talkBubble.destroy();
    super.destroy(fromScene);
  }
}
