import Phaser from "phaser";
import { HD_CHAR_FH, HD_CHAR_FW, makeHdAnims, makeHdCharacter } from "./hdCharacters";
import type { CharColors } from "../palette";

function frameOk(scene: Phaser.Scene, key: string) {
  if (!scene.textures.exists(key)) return false;
  const img = scene.textures.get(key).getSourceImage() as { width?: number; height?: number };
  return (img.width ?? 0) > 8 && (img.height ?? 0) > 8;
}

/** Build a correctly sized sheet from loaded SVG frames. Never reuses a 16px canvas. */
export function assembleCharacterSheet(
  scene: Phaser.Scene,
  outKey: string,
  frames: { down: [string, string]; up: [string, string]; side: [string, string] },
  fallbackColors?: CharColors,
) {
  const ready =
    frameOk(scene, frames.down[0]) &&
    frameOk(scene, frames.up[0]) &&
    frameOk(scene, frames.side[0]);
  if (!ready) {
    if (fallbackColors) makeHdCharacter(scene, outKey, fallbackColors);
    return;
  }

  const w = HD_CHAR_FW * 6;
  const h = HD_CHAR_FH * 3;
  if (scene.textures.exists(outKey)) {
    const cur = scene.textures.get(outKey).getSourceImage() as { width?: number };
    if ((cur.width ?? 0) !== w) scene.textures.remove(outKey);
  }
  const tex = (
    scene.textures.exists(outKey)
      ? (scene.textures.get(outKey) as Phaser.Textures.CanvasTexture)
      : scene.textures.createCanvas(outKey, w, h)
  ) as Phaser.Textures.CanvasTexture;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, w, h);

  const rows: Array<[string, string]> = [frames.down, frames.up, frames.side];
  rows.forEach((pair, row) => {
    for (let col = 0; col < 6; col++) {
      const srcKey = pair[col % 2] && frameOk(scene, pair[col % 2]) ? pair[col % 2] : pair[0];
      const src = scene.textures.get(srcKey).getSourceImage() as CanvasImageSource;
      ctx.drawImage(src, col * HD_CHAR_FW, row * HD_CHAR_FH, HD_CHAR_FW, HD_CHAR_FH);
    }
  });
  tex.refresh();

  let idx = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      if (!tex.has(`${idx}`)) tex.add(idx, 0, col * HD_CHAR_FW, row * HD_CHAR_FH, HD_CHAR_FW, HD_CHAR_FH);
      idx++;
    }
  }
  if (idx * HD_CHAR_FW > w * 3) {
    console.warn(`[hd] ${outKey} frame layout overflow`);
  }
  makeHdAnims(scene, outKey);
}
