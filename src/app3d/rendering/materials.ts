// Shared, cached flat-shaded materials with a hand-painted feel: small
// procedural DynamicTextures (<=256px) for stone, roof tiles, cobbles, grass
// and wood; StandardMaterial with black specular so nothing looks plastic.

import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export const PALETTE = {
  cream: "#f0e2c6",
  creamLight: "#f8efdb",
  greyStone: "#b8b0a2",
  greyStoneDark: "#8f877a",
  terracotta: "#c8643c",
  burntOrange: "#d9824a",
  slate: "#6f7480",
  sage: "#8fa87c",
  moss: "#6b8a4e",
  grass: "#8bb35e",
  grassLight: "#9bbd6c",
  heather: "#9b7fb0",
  wood: "#8a5a3a",
  woodLight: "#a8764f",
  dustyRose: "#d49a9a",
  lavender: "#b59bd1",
  mutedYellow: "#e6c96a",
  sky: "#a8cbe8",
  lamp: "#ffd98a",
  iron: "#2d2b2e",
  cobble: "#c4b39a",
  cobbleDark: "#8c8072",
  paving: "#dcc7a0",
  pavement: "#dccfb8",
  water: "#7fb5d6",
  glass: "#cfe3ee",
  postRed: "#c03a3a",
  brick: "#b06a52",
} as const;

export type PaletteKey = keyof typeof PALETTE;

let seed = 1234;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgb(r: number, g: number, b: number) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Mix a hex colour toward black (t<0) or white (t>0) and add hue-neutral jitter. */
function vary(hex: string, t: number, jitter = 0) {
  const c = hexToRgb(hex);
  const j = (rnd() - 0.5) * 2 * jitter * 255;
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  return rgb(c.r + (to - c.r) * k + j, c.g + (to - c.g) * k + j, c.b + (to - c.b) * k + j);
}

export type TexStyle = "noise" | "stone" | "cobble" | "roof" | "slate" | "planks" | "grass" | "awning" | "paving";

export class Materials {
  private mats = new Map<string, StandardMaterial>();
  private texes = new Map<string, DynamicTexture>();

  constructor(private scene: Scene) {}

  /** Flat colour material (cached by hex + emissive flag). */
  flat(hex: string, opts: { emissive?: number; alpha?: number; backFace?: boolean } = {}) {
    const key = `flat:${hex}:${opts.emissive ?? 0}:${opts.alpha ?? 1}:${opts.backFace ? 1 : 0}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new StandardMaterial(key, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(opts.emissive);
    if (opts.alpha !== undefined && opts.alpha < 1) m.alpha = opts.alpha;
    if (opts.backFace) m.backFaceCulling = false;
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  /** Textured material; texture generated once per (style, hex). `scale` = repeats per unit. */
  textured(style: TexStyle, hex: string, scale = 1, opts: { emissive?: number; vertexColor?: boolean } = {}) {
    const key = `tex:${style}:${hex}:${scale}:${opts.emissive ?? 0}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new StandardMaterial(key, this.scene);
    const t = this.texture(style, hex);
    t.uScale = scale;
    t.vScale = scale;
    m.diffuseTexture = t;
    m.specularColor = Color3.Black();
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(opts.emissive);
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  texture(style: TexStyle, hex: string): DynamicTexture {
    const key = `${style}:${hex}`;
    let t = this.texes.get(key);
    if (t) return t;
    const size = style === "roof" || style === "slate" || style === "cobble" || style === "stone" ? 256 : 128;
    t = new DynamicTexture(`dt:${key}`, { width: size, height: size }, this.scene, true);
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 4;
    const ctx = t.getContext() as CanvasRenderingContext2D;
    seed = 7 + key.length * 131;
    paint(ctx, size, style, hex);
    t.update(false);
    this.texes.set(key, t);
    return t;
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.texes.values()) t.dispose();
    this.mats.clear();
    this.texes.clear();
  }
}

// ---------------------------------------------------------------------------
function paint(ctx: CanvasRenderingContext2D, s: number, style: TexStyle, hex: string) {
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, s, s);
  switch (style) {
    case "noise":
      blotches(ctx, s, hex, 40, 0.05, s / 6);
      break;
    case "grass":
      blotches(ctx, s, hex, 60, 0.07, s / 5);
      // a few brush strokes
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = vary(hex, rnd() > 0.5 ? 0.12 : -0.1, 0.02);
        ctx.lineWidth = 1.5;
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 6, y - 3 - rnd() * 5);
        ctx.stroke();
      }
      break;
    case "stone": {
      // irregular ashlar blocks
      const rows = 6;
      const bh = s / rows;
      for (let r = 0; r < rows; r++) {
        let x = r % 2 ? -bh * 0.7 : 0;
        while (x < s) {
          const bw = bh * (1.2 + rnd() * 1.2);
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.16, 0.02);
          roundRect(ctx, x + 1.5, r * bh + 1.5, bw - 3, bh - 3, 3);
          ctx.fill();
          x += bw;
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fillRect(0, 0, s, s);
      break;
    }
    case "cobble": {
      const n = 9;
      const cw = s / n;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          const x = c * cw + (r % 2 ? cw / 2 : 0) + (rnd() - 0.5) * 3;
          const y = r * cw + (rnd() - 0.5) * 3;
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.22, 0.02);
          roundRect(ctx, x + 1.5, y + 1.5, cw - 3, cw - 3, cw * 0.35);
          ctx.fill();
        }
      break;
    }
    case "paving": {
      const n = 4;
      const cw = s / n;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.12, 0.015);
          roundRect(ctx, c * cw + 1.5, r * cw + 1.5, cw - 3, cw - 3, 2);
          ctx.fill();
        }
      break;
    }
    case "roof":
    case "slate": {
      // scalloped tile rows
      const rows = style === "roof" ? 10 : 8;
      const th = s / rows;
      const tw = th * (style === "roof" ? 0.9 : 1.3);
      for (let r = 0; r <= rows; r++) {
        const off = r % 2 ? tw / 2 : 0;
        for (let x = -tw; x < s + tw; x += tw) {
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.2, 0.02);
          ctx.beginPath();
          const x0 = x + off;
          const y0 = r * th;
          if (style === "roof") {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + tw, y0);
            ctx.lineTo(x0 + tw, y0 + th * 0.75);
            ctx.arc(x0 + tw / 2, y0 + th * 0.75, tw / 2, 0, Math.PI);
            ctx.closePath();
          } else {
            ctx.rect(x0 + 0.5, y0, tw - 1, th * 1.15);
          }
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.12)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      break;
    }
    case "planks": {
      const n = 5;
      const pw = s / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.18, 0.02);
        ctx.fillRect(i * pw + 1, 0, pw - 2, s);
        for (let g = 0; g < 6; g++) {
          ctx.strokeStyle = "rgba(0,0,0,0.08)";
          ctx.beginPath();
          const x = i * pw + 3 + rnd() * (pw - 6);
          ctx.moveTo(x, rnd() * s);
          ctx.lineTo(x + (rnd() - 0.5) * 3, rnd() * s);
          ctx.stroke();
        }
      }
      break;
    }
    case "awning": {
      const stripes = 8;
      const sw = s / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? PALETTE.creamLight : hex;
        ctx.fillRect(i * sw, 0, sw, s);
      }
      blotches(ctx, s, hex, 10, 0.03, s / 4);
      break;
    }
  }
}

function blotches(ctx: CanvasRenderingContext2D, s: number, hex: string, n: number, amount: number, r: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = vary(hex, (rnd() - 0.5) * 2 * amount, 0.01);
    ctx.beginPath();
    ctx.ellipse(rnd() * s, rnd() * s, r * (0.5 + rnd()), r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
