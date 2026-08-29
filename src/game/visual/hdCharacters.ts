import Phaser from "phaser";
import type { CharColors } from "../palette";

export const HD_CHAR_FW = 96;
export const HD_CHAR_FH = 128;
const COLS = 6;
const ROWS = 3;

type Ctx = CanvasRenderingContext2D;

function paintChibi(ctx: Ctx, ox: number, oy: number, c: CharColors, face: "down" | "up" | "side", step: number) {
  const sway = face === "side" ? (step % 2 === 0 ? -1 : 1) : 0;
  const bob = step % 2 === 0 ? 0 : 2;
  const liftL = step === 1 || step === 4 ? 5 : 0;
  const liftR = step === 2 || step === 5 ? 5 : 0;
  const cx = ox + 48 + sway;
  const feet = oy + 118 + bob;

  ctx.save();
  ctx.translate(cx, feet);
  ctx.fillStyle = "rgba(40,28,36,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 4, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const leg = (dx: number, lift: number) => {
    ctx.fillStyle = c.bottom;
    ctx.beginPath();
    ctx.roundRect(cx + dx, oy + 86 + bob - lift, 11, 26 + lift * 0.2, 5);
    ctx.fill();
    ctx.fillStyle = c.shoes;
    ctx.beginPath();
    ctx.ellipse(cx + dx + 6, oy + 114 + bob - lift, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (face !== "side") {
    leg(-14, liftL);
    leg(3, liftR);
  } else {
    leg(-6, liftL);
    leg(2, liftR);
  }

  ctx.fillStyle = c.topShade;
  ctx.beginPath();
  ctx.roundRect(cx - 18, oy + 58 + bob, 36, 32, 12);
  ctx.fill();
  ctx.fillStyle = c.top;
  ctx.beginPath();
  ctx.roundRect(cx - 16, oy + 56 + bob, 32, 28, 11);
  ctx.fill();

  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.ellipse(cx - 20, oy + 68 + bob, 5, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 20, oy + 68 + bob + (step % 3 === 0 ? -2 : 0), 5, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();

  const headY = oy + 34 + bob;
  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.ellipse(cx, headY + 8, 20, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.skinShade;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.ellipse(cx, headY + 18, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = c.hair;
  if (face === "up") {
    ctx.beginPath();
    ctx.ellipse(cx, headY + 2, 22, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, headY - 4, 22, 16, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - 16, headY + 6, 8, 14, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 16, headY + 6, 8, 14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.hairShade;
    ctx.beginPath();
    ctx.ellipse(cx - 6, headY + 2, 10, 6, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 8, headY + 2, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (face !== "up") {
    const eyeX = face === "side" ? 6 : 8;
    ctx.fillStyle = "#2a2230";
    ctx.beginPath();
    ctx.ellipse(cx - (face === "side" ? -4 : eyeX), headY + 8, 2.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (face === "down") {
      ctx.beginPath();
      ctx.ellipse(cx + eyeX, headY + 8, 2.2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f7a6b8";
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(cx - 12, headY + 14, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (face === "down") {
      ctx.beginPath();
      ctx.ellipse(cx + 12, headY + 14, 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#c07880";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx + (face === "side" ? 4 : 0), headY + 16, 3, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
}

export function makeHdCharacter(scene: Phaser.Scene, key: string, colors: CharColors) {
  const w = COLS * HD_CHAR_FW;
  const h = ROWS * HD_CHAR_FH;
  if (scene.textures.exists(key)) {
    const existing = scene.textures.get(key);
    const src = existing.getSourceImage() as { width?: number; height?: number };
    if ((src.width ?? 0) !== w || (src.height ?? 0) !== h) {
      scene.textures.remove(key);
    }
  }
  const tex = (scene.textures.exists(key)
    ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(key, w, h)) as Phaser.Textures.CanvasTexture;
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, w, h);
  const faces: Array<"down" | "up" | "side"> = ["down", "up", "side"];
  faces.forEach((face, row) => {
    for (let col = 0; col < COLS; col++) {
      paintChibi(ctx, col * HD_CHAR_FW, row * HD_CHAR_FH, colors, face, col);
    }
  });
  tex.refresh();
  const srcW = (tex.getSourceImage() as { width?: number }).width ?? 0;
  const srcH = (tex.getSourceImage() as { height?: number }).height ?? 0;
  if (srcW < COLS * HD_CHAR_FW || srcH < ROWS * HD_CHAR_FH) {
    console.warn(`[hd] ${key} canvas is ${srcW}x${srcH}, expected ${COLS * HD_CHAR_FW}x${ROWS * HD_CHAR_FH}`);
  }
  let idx = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const fx = col * HD_CHAR_FW;
      const fy = row * HD_CHAR_FH;
      if (fx + HD_CHAR_FW > srcW || fy + HD_CHAR_FH > srcH) {
        console.warn(`[hd] ${key} frame ${idx} exceeds texture ${srcW}x${srcH}`);
      }
      if (!tex.has(`${idx}`)) tex.add(idx, 0, fx, fy, HD_CHAR_FW, HD_CHAR_FH);
      idx++;
    }
  }
  makeHdAnims(scene, key);
}

export function makeHdAnims(scene: Phaser.Scene, key: string) {
  const mk = (name: string, frames: number[], rate: number, repeat: number) => {
    const animKey = `${key}-${name}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: frames.map((f) => ({ key, frame: f })),
      frameRate: rate,
      repeat,
    });
  };
  mk("idle-down", [0, 1, 2, 3], 3, -1);
  mk("idle-up", [6, 7, 8, 9], 3, -1);
  mk("idle-side", [12, 13, 14, 15], 3, -1);
  mk("idle-left", [12, 13, 14, 15], 3, -1);
  mk("idle-right", [12, 13, 14, 15], 3, -1);
  mk("walk-down", [0, 1, 2, 3, 4, 5], 10, -1);
  mk("walk-up", [6, 7, 8, 9, 10, 11], 10, -1);
  mk("walk-side", [12, 13, 14, 15, 16, 17], 10, -1);
  mk("walk-left", [12, 13, 14, 15, 16, 17], 10, -1);
  mk("walk-right", [12, 13, 14, 15, 16, 17], 10, -1);
}

export function buildHdHeroes(scene: Phaser.Scene, juju: CharColors, baba: CharColors) {
  makeHdCharacter(scene, "char_her", juju);
  makeHdCharacter(scene, "char_baba", baba);
}
