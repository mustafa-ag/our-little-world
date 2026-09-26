// Shared, cached flat-shaded materials with a hand-painted feel: small
// procedural DynamicTextures (<=256px) for stone, roof tiles, cobbles, grass
// and wood; StandardMaterial with black specular so nothing looks plastic.

import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { WorldArtProfile } from "../world/artProfile";

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
  grass: "#93a86e",
  grassLight: "#a4b47c",
  olive: "#7f8b56",
  mossDark: "#55703f",
  stoneWarm: "#c9b89a",
  slateBlue: "#66707c",
  terracottaMuted: "#b8694a",
  carTeal: "#5f8f8a",
  awning: "#b34d47",
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

/**
 * Hue-neutral light grey the Blender "detail" textures are painted with: the
 * *_abs slots multiply it by COLOR_0 (absolute colour ÷ 0.91, see
 * tools/blender/lib/olw.py DETAIL_HEX / DETAIL_TINT).
 */
export const DETAIL_HEX = "#e8e8e8";

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

export type TexStyle = "noise" | "stone" | "cobble" | "roof" | "slate" | "planks" | "grass" | "awning" | "paving" | "bark" | "canvas";

/**
 * Runtime material slots (see assets/hero/slots.ts). `Materials.slot(name)`
 * returns the shared material for a slot so AssetManager's remap table can be
 * a one-liner. Textured slots use the hand-painted textures; flat slots are
 * white so vertex colours carry the hue.
 */
export const SLOT_STYLE: Record<string, { style: TexStyle | "flat"; hex: string; scale?: number; emissive?: number }> = {
  olw_stone: { style: "stone", hex: PALETTE.stoneWarm, scale: 1.2 },
  olw_stone_dark: { style: "stone", hex: PALETTE.greyStoneDark, scale: 1.2 },
  olw_roof_tile: { style: "roof", hex: PALETTE.terracottaMuted, scale: 1 },
  olw_slate: { style: "slate", hex: PALETTE.slate, scale: 1 },
  olw_wood: { style: "planks", hex: PALETTE.woodLight, scale: 1.5 },
  olw_wood_dark: { style: "planks", hex: "#6e4a33", scale: 1.5 },
  olw_bark: { style: "bark", hex: "#8a6a4e", scale: 1.5 },
  olw_awning: { style: "canvas", hex: "#ffffff", scale: 2 },
  olw_glass: { style: "flat", hex: PALETTE.glass },
  olw_glass_emissive: { style: "flat", hex: PALETTE.lamp, emissive: 0.2 },
  olw_light_emissive: { style: "flat", hex: PALETTE.lamp, emissive: 0.85 },
  olw_rubber: { style: "flat", hex: "#34322f" },
  olw_flower: { style: "flat", hex: "#ffffff" },
};

// ---------------------------------------------------------------------------
// Regional palette. `applyRegionPalette(profile)` swaps the wall / roof slot
// colours (SLOT_STYLE, used by the hero GLB slot remap) and publishes the
// active ground / road colours (ACTIVE_REGION). The Scotland profile maps
// onto exactly the defaults below, so Edinburgh is unchanged.

/** Wall slot colours per wall material (olw_stone / olw_stone_dark). */
const WALL_HEX: Record<WorldArtProfile["wallMaterial"], { stone: string; dark: string }> = {
  stone: { stone: PALETTE.stoneWarm, dark: PALETTE.greyStoneDark },
  render_white: { stone: "#f1efe9", dark: "#cfcac0" },
  render_cream: { stone: "#eadcc0", dark: "#c9b894" },
  brick_london: { stone: "#a8664e", dark: "#7c4a3a" },
  limestone: { stone: "#e3d6b8", dark: "#bfae8a" },
  marble: { stone: "#eeeae4", dark: "#c8c2b8" },
};

/** Roof slot colours per roof style (olw_roof_tile / olw_slate). */
const ROOF_HEX: Record<WorldArtProfile["roofStyle"], { tile: string; slate: string }> = {
  slate: { tile: PALETTE.terracottaMuted, slate: PALETTE.slate },
  terracotta: { tile: PALETTE.terracotta, slate: PALETTE.terracottaMuted },
  flat_parapet: { tile: "#d8ccb6", slate: "#bcb3a4" },
  lead_flat: { tile: "#8a8f94", slate: "#6f7479" },
  glass: { tile: "#9fb8c6", slate: "#7f98a8" },
};

export interface RegionPalette {
  ground: string;
  path: string;
  road: string;
  sidewalk: string;
  sand: string;
  wall: string;
  wallDark: string;
  roofTile: string;
  slate: string;
  accent: string;
}

/** The palette of the region currently loaded (Scotland until a profile is applied). */
export const ACTIVE_REGION: RegionPalette = {
  ground: PALETTE.grass,
  path: "#ada08b",
  road: "#9d978e",
  sidewalk: "#d2c6b1",
  sand: "#e2cfa3",
  wall: PALETTE.stoneWarm,
  wallDark: PALETTE.greyStoneDark,
  roofTile: PALETTE.terracottaMuted,
  slate: PALETTE.slate,
  accent: PALETTE.wood,
};

/**
 * Swap the ground / road / wall / roof colours for a region. Affects slot
 * materials created from now on (Materials caches by hex, so each region gets
 * its own cached materials and switching back restores the originals).
 */
export function applyRegionPalette(profile: WorldArtProfile): RegionPalette {
  const wall = WALL_HEX[profile.wallMaterial];
  const roof = ROOF_HEX[profile.roofStyle];
  ACTIVE_REGION.ground = profile.groundColor;
  ACTIVE_REGION.path = profile.pathColor;
  ACTIVE_REGION.road = profile.roadColor;
  ACTIVE_REGION.sidewalk = profile.sidewalkColor;
  ACTIVE_REGION.sand = profile.sandColor;
  ACTIVE_REGION.wall = wall.stone;
  ACTIVE_REGION.wallDark = wall.dark;
  ACTIVE_REGION.roofTile = roof.tile;
  ACTIVE_REGION.slate = roof.slate;
  ACTIVE_REGION.accent = profile.accentColor;
  SLOT_STYLE.olw_stone.hex = wall.stone;
  SLOT_STYLE.olw_stone_dark.hex = wall.dark;
  SLOT_STYLE.olw_roof_tile.hex = roof.tile;
  SLOT_STYLE.olw_slate.hex = roof.slate;
  return ACTIVE_REGION;
}

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

  /**
   * Shared material for a named slot (olw_stone, olw_roof_tile, olw_slate,
   * olw_wood, olw_stone_dark, olw_wood_dark, olw_bark, olw_awning,
   * olw_light_emissive, olw_rubber, olw_flower, …). Unknown slots (olw_paint,
   * olw_foliage, olw_metal, character roles) are flat white × vertex colour.
   * Emissive slots still need `lighting.registerGlow` by the caller for the
   * night glow.
   */
  slot(name: string) {
    const d = SLOT_STYLE[name];
    if (!d) return this.flat("#ffffff");
    if (d.style === "flat") return this.flat(d.hex, d.emissive ? { emissive: d.emissive } : {});
    return this.textured(d.style, d.hex, d.scale ?? 1, d.emissive ? { emissive: d.emissive } : {});
  }

  texture(style: TexStyle, hex: string): DynamicTexture {
    const key = `${style}:${hex}`;
    let t = this.texes.get(key);
    if (t) return t;
    const size = style === "roof" || style === "slate" || style === "stone" ? 512 : style === "cobble" || style === "planks" || style === "bark" ? 256 : 128;
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
      // irregular coursed rubble / ashlar: courses of varying height, stones of
      // varying length with warm/cool hue shifts, the odd darker stone, lit top
      // edges, shaded bottoms and chipped corners over soft mortar
      ctx.fillStyle = vary(hex, -0.13, 0);
      ctx.fillRect(0, 0, s, s);
      const hs: number[] = [];
      for (let i = 0; i < 7; i++) hs.push(0.7 + rnd() * 0.7);
      const hsum = hs.reduce((a, v) => a + v, 0);
      let y = 0;
      for (const hr of hs) {
        const bh = (hr / hsum) * s;
        let x = -rnd() * bh;
        while (x < s) {
          const bw = Math.min(bh * (1.1 + rnd() * 1.5), s - x + bh * 0.3);
          const dark = rnd() > 0.9;
          const hueShift = (rnd() - 0.5) * 0.06;
          const base = hexToRgb(hex);
          const t = dark ? -0.12 - rnd() * 0.05 : (rnd() - 0.45) * 0.1;
          const to = t < 0 ? 0 : 255;
          const k = Math.abs(t);
          const r = base.r + (to - base.r) * k + hueShift * 120;
          const g = base.g + (to - base.g) * k + hueShift * 20;
          const b2 = base.b + (to - base.b) * k - hueShift * 90;
          const ix = x + 2 + (rnd() - 0.5) * 1.5;
          const iy = y + 2 + (rnd() - 0.5) * 1.5;
          const iw = bw - 4;
          const ih = bh - 4;
          const draw = (ox: number) => {
            ctx.fillStyle = rgb(r, g, b2);
            roundRect(ctx, ix + ox, iy, iw, ih, 4 + rnd() * 5);
            ctx.fill();
            // lit top edge, shaded bottom edge (hand-painted bevel)
            ctx.fillStyle = "rgba(255,248,232,0.09)";
            roundRect(ctx, ix + ox + 2, iy + 1.5, iw - 4, ih * 0.22, 3);
            ctx.fill();
            ctx.fillStyle = "rgba(40,30,20,0.09)";
            roundRect(ctx, ix + ox + 1, iy + ih * 0.8, iw - 2, ih * 0.2, 3);
            ctx.fill();
            // a few soft pits / lichen dots
            for (let i = 0; i < 3; i++) {
              ctx.fillStyle = rnd() > 0.8 ? "rgba(120,130,80,0.18)" : "rgba(60,50,40,0.1)";
              ctx.beginPath();
              ctx.arc(ix + ox + rnd() * iw, iy + rnd() * ih, 1.5 + rnd() * 3, 0, Math.PI * 2);
              ctx.fill();
            }
          };
          draw(0);
          if (ix + iw > s) draw(-s);
          if (ix < 0) draw(s);
          x += bw;
        }
        y += bh;
      }
      break;
    }
    case "cobble": {
      // multi-tone rounded cobbles, imperfect rows, soft worn tops, moss in some joints
      ctx.fillStyle = vary(hex, -0.3, 0);
      ctx.fillRect(0, 0, s, s);
      const n = 9;
      const cw = s / n;
      for (let r = 0; r < n; r++)
        for (let c = 0; c <= n; c++) {
          const x = c * cw + (r % 2 ? cw / 2 : 0) + (rnd() - 0.5) * 5 - cw / 2;
          const y = r * cw + (rnd() - 0.5) * 4;
          const w = cw * (0.82 + rnd() * 0.16);
          const h = cw * (0.8 + rnd() * 0.16);
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.3, 0.03);
          roundRect(ctx, x + 1.5, y + 1.5, w, h, cw * 0.38);
          ctx.fill();
          ctx.fillStyle = "rgba(255,250,240,0.14)";
          ctx.beginPath();
          ctx.ellipse(x + w * 0.45, y + h * 0.4, w * 0.25, h * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
          if (rnd() > 0.86) {
            ctx.fillStyle = "rgba(96,118,62,0.55)";
            ctx.fillRect(x + w, y + 2, 3, h * 0.7);
          }
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
    case "roof": {
      // pantile / clay tile rows: each row casts a soft shadow on the one below,
      // controlled colour drift (sun-bleached, orange, darker) and uneven edges
      const rows = 12;
      const th = s / rows;
      const tw = th * 0.95;
      for (let r = 0; r <= rows; r++) {
        const off = r % 2 ? tw / 2 : 0;
        const rowT = (rnd() - 0.5) * 0.08;
        for (let x = -tw; x < s + tw; x += tw) {
          const x0 = x + off + (rnd() - 0.5) * 2;
          const y0 = r * th + (rnd() - 0.5) * 1.5;
          const pick = rnd();
          const t = rowT + (pick > 0.93 ? -0.18 : pick > 0.85 ? 0.12 : (rnd() - 0.5) * 0.12);
          ctx.fillStyle = vary(hex, t, 0.02);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + tw, y0);
          ctx.lineTo(x0 + tw, y0 + th * 0.78);
          ctx.arc(x0 + tw / 2, y0 + th * 0.78, tw / 2, 0, Math.PI);
          ctx.closePath();
          ctx.fill();
          // rounded highlight down the tile's crown
          ctx.fillStyle = "rgba(255,240,220,0.13)";
          ctx.fillRect(x0 + tw * 0.3, y0 + 2, tw * 0.22, th * 0.9);
          // soft shadow the next row casts
          ctx.fillStyle = "rgba(40,20,10,0.16)";
          ctx.fillRect(x0, y0, tw, th * 0.16);
        }
      }
      break;
    }
    case "slate": {
      // slates of varying width in staggered courses; blue-grey / purple /
      // green-grey drift, uneven bottom edges, the odd replaced lighter slate
      const rows = 10;
      const th = s / rows;
      for (let r = 0; r <= rows; r++) {
        let x = -rnd() * th;
        const rowT = (rnd() - 0.5) * 0.06;
        while (x < s + th) {
          const tw = th * (0.9 + rnd() * 0.7);
          const y0 = r * th;
          const pick = rnd();
          const t = rowT + (pick > 0.94 ? 0.16 : pick > 0.86 ? -0.14 : (rnd() - 0.5) * 0.1);
          const c = hexToRgb(hex);
          const tint = (rnd() - 0.5) * 14;
          const to = t < 0 ? 0 : 255;
          const k = Math.abs(t);
          ctx.fillStyle = rgb(c.r + (to - c.r) * k + tint * 0.6, c.g + (to - c.g) * k - tint * 0.2, c.b + (to - c.b) * k + tint);
          const drop = th * (1.12 + rnd() * 0.12);
          ctx.beginPath();
          ctx.moveTo(x + 0.8, y0);
          ctx.lineTo(x + tw - 0.8, y0);
          ctx.lineTo(x + tw - 1.2, y0 + drop + (rnd() - 0.5) * 3);
          ctx.lineTo(x + 1.2, y0 + drop + (rnd() - 0.5) * 3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.07)";
          ctx.fillRect(x + 2, y0 + drop * 0.55, tw - 4, drop * 0.3);
          ctx.fillStyle = "rgba(10,12,20,0.22)";
          ctx.fillRect(x, y0, tw, th * 0.12);
          x += tw;
        }
      }
      break;
    }
    case "planks": {
      // broad painted boards: hue drift per board, long soft grain strokes, a knot or two
      const n = 5;
      const pw = s / n;
      ctx.fillStyle = vary(hex, -0.35, 0);
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < n; i++) {
        const c = hexToRgb(hex);
        const t = (rnd() - 0.5) * 0.18;
        const hue = (rnd() - 0.5) * 16;
        const to = t < 0 ? 0 : 255;
        ctx.fillStyle = rgb(c.r + (to - c.r) * Math.abs(t) + hue, c.g + (to - c.g) * Math.abs(t), c.b + (to - c.b) * Math.abs(t) - hue * 0.5);
        ctx.fillRect(i * pw + 1.5, 0, pw - 3, s);
        ctx.lineCap = "round";
        for (let g = 0; g < 7; g++) {
          ctx.strokeStyle = rnd() > 0.4 ? "rgba(50,30,15,0.12)" : "rgba(255,240,220,0.1)";
          ctx.lineWidth = 1 + rnd() * 2.2;
          const x = i * pw + 4 + rnd() * (pw - 8);
          const y0 = rnd() * s;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, y0 + s * 0.2, x + (rnd() - 0.5) * 6, y0 + s * 0.4, x + (rnd() - 0.5) * 4, y0 + s * (0.3 + rnd() * 0.5));
          ctx.stroke();
        }
        if (rnd() > 0.5) {
          ctx.fillStyle = "rgba(60,35,20,0.35)";
          ctx.beginPath();
          ctx.ellipse(i * pw + pw * (0.3 + rnd() * 0.4), rnd() * s, 2.5, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "bark": {
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = vary(hex, (rnd() - 0.6) * 0.35, 0.02);
        ctx.lineWidth = 2 + rnd() * 5;
        const x = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (rnd() - 0.5) * 12, s * 0.33, x + (rnd() - 0.5) * 12, s * 0.66, x, s);
        ctx.stroke();
      }
      break;
    }
    case "canvas": {
      blotches(ctx, s, hex, 20, 0.03, s / 5);
      for (let i = 0; i < s; i += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.025)";
        ctx.fillRect(0, i, s, 1);
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
