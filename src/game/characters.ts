import Phaser from "phaser";
import type { CharColors } from "./palette";

// We draw one 16x16 chibi character template and recolour it for every
// person in the game. Sheet layout: 3 columns (idle, step A, step B) x
// 3 rows (facing down, up, side-right). "Left" is the side row flipped.
//
// Frame indices:
//   down: 0,1,2   up: 3,4,5   side(right): 6,7,8

export const CELL = 16;
const COLS = 3;
const ROWS = 3;

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawDown(ctx: Ctx, ox: number, oy: number, c: CharColors, step: number) {
  // hair top + head
  px(ctx, ox + 4, oy + 1, 8, 3, c.hair);
  px(ctx, ox + 3, oy + 2, 1, 5, c.hair);
  px(ctx, ox + 12, oy + 2, 1, 5, c.hair);
  px(ctx, ox + 4, oy + 3, 8, 5, c.skin);
  px(ctx, ox + 4, oy + 7, 8, 1, c.skinShade);
  // fringe
  px(ctx, ox + 4, oy + 3, 8, 1, c.hair);
  px(ctx, ox + 4, oy + 4, 2, 1, c.hair);
  px(ctx, ox + 10, oy + 4, 2, 1, c.hair);
  // eyes + blush
  px(ctx, ox + 6, oy + 5, 1, 2, c.hairShade === c.hair ? "#2a2230" : "#2a2230");
  px(ctx, ox + 9, oy + 5, 1, 2, "#2a2230");
  px(ctx, ox + 5, oy + 6, 1, 1, "#f7a6b8");
  px(ctx, ox + 10, oy + 6, 1, 1, "#f7a6b8");
  // body / arms
  px(ctx, ox + 4, oy + 8, 8, 4, c.top);
  px(ctx, ox + 4, oy + 11, 8, 1, c.topShade);
  px(ctx, ox + 3, oy + 8, 1, 3, c.skin);
  px(ctx, ox + 12, oy + 8, 1, 3, c.skin);
  // legs (step animation raises alternate foot)
  const lLift = step === 1 ? 1 : 0;
  const rLift = step === 2 ? 1 : 0;
  px(ctx, ox + 5, oy + 12, 2, 3 - lLift, c.bottom);
  px(ctx, ox + 9, oy + 12, 2, 3 - rLift, c.bottom);
  px(ctx, ox + 5, oy + 15 - lLift, 2, 1, c.shoes);
  px(ctx, ox + 9, oy + 15 - rLift, 2, 1, c.shoes);
}

function drawUp(ctx: Ctx, ox: number, oy: number, c: CharColors, step: number) {
  // all hair (back of head)
  px(ctx, ox + 4, oy + 1, 8, 7, c.hair);
  px(ctx, ox + 3, oy + 2, 1, 6, c.hair);
  px(ctx, ox + 12, oy + 2, 1, 6, c.hair);
  px(ctx, ox + 5, oy + 6, 6, 2, c.hairShade);
  // body / arms
  px(ctx, ox + 4, oy + 8, 8, 4, c.top);
  px(ctx, ox + 4, oy + 11, 8, 1, c.topShade);
  px(ctx, ox + 3, oy + 8, 1, 3, c.skin);
  px(ctx, ox + 12, oy + 8, 1, 3, c.skin);
  // legs
  const lLift = step === 1 ? 1 : 0;
  const rLift = step === 2 ? 1 : 0;
  px(ctx, ox + 5, oy + 12, 2, 3 - lLift, c.bottom);
  px(ctx, ox + 9, oy + 12, 2, 3 - rLift, c.bottom);
  px(ctx, ox + 5, oy + 15 - lLift, 2, 1, c.shoes);
  px(ctx, ox + 9, oy + 15 - rLift, 2, 1, c.shoes);
}

function drawSide(ctx: Ctx, ox: number, oy: number, c: CharColors, step: number) {
  // facing right. head
  px(ctx, ox + 4, oy + 1, 8, 3, c.hair);
  px(ctx, ox + 4, oy + 3, 7, 5, c.skin);
  px(ctx, ox + 4, oy + 7, 7, 1, c.skinShade);
  // back hair
  px(ctx, ox + 3, oy + 2, 2, 6, c.hair);
  px(ctx, ox + 4, oy + 3, 3, 1, c.hair);
  // eye (toward front) + nose
  px(ctx, ox + 9, oy + 5, 1, 2, "#2a2230");
  px(ctx, ox + 11, oy + 5, 1, 1, c.skinShade);
  px(ctx, ox + 10, oy + 6, 1, 1, "#f7a6b8");
  // body
  px(ctx, ox + 5, oy + 8, 6, 4, c.top);
  px(ctx, ox + 5, oy + 11, 6, 1, c.topShade);
  // swinging arm
  const armFwd = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(ctx, ox + 8 + armFwd, oy + 8, 2, 3, c.skin);
  // legs swing front/back
  const front = step === 1 ? 2 : step === 2 ? 0 : 1;
  const back = step === 1 ? 0 : step === 2 ? 2 : 1;
  px(ctx, ox + 5 + back, oy + 12, 2, 3, c.bottom);
  px(ctx, ox + 7 + front, oy + 12, 2, 3, c.bottom);
  px(ctx, ox + 5 + back, oy + 15, 3, 1, c.shoes);
  px(ctx, ox + 7 + front, oy + 15, 3, 1, c.shoes);
}

/**
 * Create (or redraw) a character spritesheet texture with the given colours.
 * Reuses the existing canvas when possible so live sprites don't break when
 * the player changes outfit.
 */
export function makeCharacterTexture(scene: Phaser.Scene, key: string, c: CharColors) {
  const w = COLS * CELL;
  const h = ROWS * CELL;
  const canvasTex = (scene.textures.exists(key)
    ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(key, w, h)) as Phaser.Textures.CanvasTexture;

  const ctx = canvasTex.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);

  for (let step = 0; step < COLS; step++) {
    drawDown(ctx, step * CELL, 0 * CELL, c, step);
    drawUp(ctx, step * CELL, 1 * CELL, c, step);
    drawSide(ctx, step * CELL, 2 * CELL, c, step);
  }

  canvasTex.refresh();

  // register the 9 frames by index (only once)
  let idx = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!canvasTex.has(`${idx}`)) canvasTex.add(idx, 0, col * CELL, row * CELL, CELL, CELL);
      idx++;
    }
  }
}

/** Define the shared walk/idle animations for a character texture key. */
export function makeCharacterAnims(scene: Phaser.Scene, key: string) {
  const mk = (name: string, frames: number[], rate = 8) => {
    const animKey = `${key}-${name}`;
    if (scene.anims.exists(animKey)) return;
    scene.anims.create({
      key: animKey,
      frames: frames.map((f) => ({ key, frame: f })),
      frameRate: rate,
      repeat: name.startsWith("walk") ? -1 : 0,
    });
  };
  mk("idle-down", [0]);
  mk("idle-up", [3]);
  mk("idle-side", [6]);
  mk("walk-down", [1, 0, 2, 0]);
  mk("walk-up", [4, 3, 5, 3]);
  mk("walk-side", [7, 6, 8, 6]);
}
