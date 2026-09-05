import Phaser from "phaser";
import type { LightingProfile } from "./themes";
import type { VisualShadowDef } from "./types";

const CONTACT_KEY = "visual_contact_shadow";
const CAST_KEY = "visual_cast_shadow";
const isAppleTouchDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export interface VisualShadowHandle {
  setContactPoint(x: number, y: number): void;
  destroy(): void;
}

function ensureShadowTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(CONTACT_KEY)) {
    const texture = scene.textures.createCanvas(CONTACT_KEY, 80, 34)!;
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(40, 17, 1, 40, 17, 37);
    gradient.addColorStop(0, "rgba(28, 35, 43, 0.62)");
    gradient.addColorStop(0.58, "rgba(28, 35, 43, 0.27)");
    gradient.addColorStop(1, "rgba(28, 35, 43, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(40, 17, 37, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  if (!scene.textures.exists(CAST_KEY)) {
    const texture = scene.textures.createCanvas(CAST_KEY, 160, 48)!;
    const ctx = texture.getContext();
    const gradient = ctx.createLinearGradient(0, 0, 160, 0);
    gradient.addColorStop(0, "rgba(28, 35, 43, 0.64)");
    gradient.addColorStop(0.46, "rgba(28, 35, 43, 0.3)");
    gradient.addColorStop(1, "rgba(28, 35, 43, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(80, 24, 78, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

/**
 * Uses cached soft textures instead of blur shaders. The owner controls the logical
 * contact point; lighting determines a coherent cast direction for the whole location.
 */
export function createVisualShadow(
  scene: Phaser.Scene,
  contactX: number,
  contactY: number,
  definition: VisualShadowDef | undefined,
  lighting: LightingProfile,
): VisualShadowHandle | undefined {
  if (!definition?.shadowEnabled || definition.shadowType === "none") return undefined;
  // Mobile Safari has a tighter texture budget. Keep character contact shadows,
  // but skip the hundreds of decorative building and foliage shadow sprites there.
  if (isAppleTouchDevice && definition.shadowType !== "contact") return undefined;
  ensureShadowTextures(scene);

  const directionX = definition.shadowDirectionX ?? lighting.directionX;
  const directionY = definition.shadowDirectionY ?? lighting.directionY;
  const opacity = definition.shadowOpacity ?? lighting.opacity;
  const scale = definition.shadowScale ?? 0.5;
  const length = definition.shadowLength ?? lighting.castLength;
  const directionLength = Math.hypot(directionX, directionY) || 1;
  const dx = directionX / directionLength;
  const dy = directionY / directionLength;
  const contact = definition.shadowType === "contact" || definition.shadowType === "both"
    ? scene.add.image(contactX, contactY, CONTACT_KEY).setAlpha(opacity * 0.8).setScale(scale)
    : undefined;
  const cast = !isAppleTouchDevice && (definition.shadowType === "cast" || definition.shadowType === "both")
    ? scene.add
        .image(contactX + dx * length * 0.45, contactY + dy * length * 0.45, CAST_KEY)
        .setAlpha(opacity * 0.9)
        .setRotation(Math.atan2(dy, dx))
        .setScale(length / 160, Math.max(0.14, scale * 0.38))
    : undefined;

  const setContactPoint = (x: number, y: number) => {
    contact?.setPosition(x, y).setDepth(y - 0.35);
    cast?.setPosition(x + dx * length * 0.45, y + dy * length * 0.45).setDepth(y - 0.45);
  };
  setContactPoint(contactX, contactY);

  return {
    setContactPoint,
    destroy() {
      contact?.destroy();
      cast?.destroy();
    },
  };
}
