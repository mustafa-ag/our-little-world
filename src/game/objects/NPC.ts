import Phaser from "phaser";
import type { NpcDef } from "../data/npcs";
import { createVisualShadow, DEFAULT_LIGHTING_PROFILE, getVisualAssetDef, getVisualTexture, type LightingProfile, type VisualShadowHandle } from "../visual";

export class NPC extends Phaser.Physics.Arcade.Image {
  def: NpcDef;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private talkBubble: Phaser.GameObjects.Text;
  private activityBubble: Phaser.GameObjects.Text;
  private bob: number;
  private shadow?: VisualShadowHandle;
  private routine?: { activity: string; radius: number; anchorX: number; anchorY: number; nextAt: number; targetX?: number; targetY?: number; hideAt?: number };

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
    this.activityBubble = scene.add
      .text(0, -34, "", { fontFamily: "monospace", fontSize: "12px", color: "#fff4e6", backgroundColor: "rgba(58,43,58,0.68)", padding: { x: 3, y: 2 }, resolution: 2 })
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  place(x: number, y: number) {
    this.setPosition(x, y);
    this.syncVisuals();
    return this;
  }

  private syncVisuals() {
    const x = this.x;
    const y = this.y;
    this.sprite.setPosition(x, y).setDepth(y);
    this.label.setPosition(x, y - 19).setDepth(y + 1);
    this.talkBubble.setPosition(x, y - 30).setDepth(y + 2);
    this.activityBubble.setPosition(x, y - 30).setDepth(y + 2);
    this.shadow?.setContactPoint(x, y + 3);
  }

  startRoutine(activity: string, radius = 8) {
    this.routine = { activity, radius, anchorX: this.x, anchorY: this.y, nextAt: this.scene.time.now + 1200 + Math.random() * 2200 };
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
    const routine = this.routine;
    if (routine) {
      if (routine.targetX !== undefined && routine.targetY !== undefined) {
        this.x += (routine.targetX - this.x) * 0.025;
        this.y += (routine.targetY - this.y) * 0.025;
        if (Phaser.Math.Distance.Between(this.x, this.y, routine.targetX, routine.targetY) < 1) {
          routine.targetX = undefined;
          routine.targetY = undefined;
        }
      }
      if (t >= routine.nextAt) {
        routine.nextAt = t + 5200 + Math.random() * 4200;
        if (routine.radius > 0 && Math.random() < 0.48) {
          routine.targetX = routine.anchorX + Phaser.Math.Between(-routine.radius, routine.radius);
          routine.targetY = routine.anchorY + Phaser.Math.Between(-Math.floor(routine.radius / 2), Math.floor(routine.radius / 2));
          this.faceTowards(routine.targetX, routine.targetY);
        } else {
          const symbol: Record<string, string> = { coffee: "☕", tea: "♨", phone: "▯", sit: "⌑", stretch: "↟", look: "◌", chat: "…", shop: "▱", water: "⋰", computer: "▦", yawn: "z", walk: "→" };
          this.activityBubble.setText(symbol[routine.activity] ?? "·").setVisible(true);
          routine.hideAt = t + 1700;
        }
      }
      if (routine.hideAt && t >= routine.hideAt) {
        this.activityBubble.setVisible(false);
        routine.hideAt = undefined;
      }
    }
    // gentle idle bob
    this.syncVisuals();
    this.sprite.y = this.y + Math.sin(t / 400 + this.bob) * 0.6;
  }

  setTalkAvailable(on: boolean) {
    this.talkBubble.setVisible(on);
    if (on) this.activityBubble.setVisible(false);
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    this.sprite.destroy();
    this.label.destroy();
    this.talkBubble.destroy();
    this.activityBubble.destroy();
    super.destroy(fromScene);
  }
}
