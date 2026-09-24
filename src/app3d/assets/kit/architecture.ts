// Procedural buildings: cottages, townhouses, tenements, shop fronts, the
// café with its striped awning, and the castle. Every piece is ONE merged
// mesh (multi-material) built at the origin with its footprint centred on
// (0,0) and its front (door) facing -Z (south, toward the camera).
//
// Variant string: "w=3,d=3,k=cottage,s=cream,r=terra,f=1"
//   w/d  footprint in tiles     k  kind: cottage|shop|cafe|tenement
//   s    wall style: cream|grey|rose|stucco   r  roof: terra|slate|orange
//   f    storeys

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { box, cyl, gable, merge, parseVariant, hash01, tintVertices } from "./util";

const STOREY = 1.45;
type Face = "front" | "back" | "east" | "west";

interface Ctx {
  k: KitContext;
  parts: Mesh[];
  hw: number;
  hd: number;
  /** shared white material: every small flat-colour part is vertex-tinted so they merge into ONE submesh */
  white: Material;
}

/** Flat-colour box using the shared white material + vertex tint. */
function fbox(c: Ctx, w: number, h: number, d: number, hex: string, x = 0, y = 0, z = 0) {
  const m = box(c.k.scene, w, h, d, c.white, x, y, z);
  tintVertices(m, hex);
  return m;
}
function fcyl(c: Ctx, dt: number, db: number, h: number, hex: string, x = 0, y = 0, z = 0, tess = 10) {
  const m = cyl(c.k.scene, dt, db, h, c.white, x, y, z, tess);
  tintVertices(m, hex);
  return m;
}
/** Textured parts still need their own material; give them neutral vertex colours so merging is consistent. */
function tex(m: Mesh) {
  tintVertices(m, "#ffffff");
  return m;
}

/** Place a part built in "front wall space" (x across, y up, z = protrusion) onto a face. */
function onFace(c: Ctx, m: Mesh, face: Face, lx: number, ly: number, lz: number) {
  const h = m.position.y; // box() stores y + h/2; keep that vertical offset
  switch (face) {
    case "front":
      m.position.set(lx, h + ly, -c.hd - lz);
      break;
    case "back":
      m.position.set(-lx, h + ly, c.hd + lz);
      m.rotation.y = Math.PI;
      break;
    case "east":
      m.position.set(c.hw + lz, h + ly, lx);
      m.rotation.y = Math.PI / 2;
      break;
    case "west":
      m.position.set(-c.hw - lz, h + ly, -lx);
      m.rotation.y = -Math.PI / 2;
      break;
  }
  c.parts.push(m);
}

function window(c: Ctx, face: Face, lx: number, ly: number, glass: Material, frame: string, shutter: string, flowers: boolean, seed: number) {
  const s = c.k.scene;
  const ww = 0.42;
  const wh = 0.5;
  onFace(c, fbox(c, ww + 0.1, wh + 0.1, 0.05, frame), face, lx, ly - 0.05, 0.0);
  onFace(c, tex(box(s, ww, wh, 0.05, glass)), face, lx, ly, 0.02);
  // mullion
  onFace(c, fbox(c, 0.04, wh, 0.02, frame), face, lx, ly, 0.05);
  onFace(c, fbox(c, ww, 0.04, 0.02, frame), face, lx, ly + wh / 2 - 0.02, 0.05);
  // shutters
  onFace(c, fbox(c, 0.16, wh + 0.06, 0.04, shutter), face, lx - ww / 2 - 0.12, ly - 0.03, 0.02);
  onFace(c, fbox(c, 0.16, wh + 0.06, 0.04, shutter), face, lx + ww / 2 + 0.12, ly - 0.03, 0.02);
  if (flowers) {
    onFace(c, fbox(c, ww + 0.14, 0.14, 0.16, PALETTE.wood), face, lx, ly - 0.14, 0.08);
    const cols = [PALETTE.dustyRose, PALETTE.mutedYellow, PALETTE.lavender, "#f0f0e0"];
    for (let i = 0; i < 3; i++) {
      const col = cols[Math.floor(hash01(seed, i, lx) * cols.length)];
      const f = fbox(c, 0.12, 0.12, 0.12, col);
      f.rotation.y = 0.6;
      onFace(c, f, face, lx - 0.16 + i * 0.16, ly + 0.02, 0.1);
    }
  }
}

function door(c: Ctx, face: Face, lx: number, wood: Material, frame: string, arched = true) {
  const s = c.k.scene;
  const dw = 0.6;
  const dh = 1.05;
  onFace(c, fbox(c, dw + 0.12, dh + 0.06, 0.06, frame), face, lx, 0, 0.0);
  onFace(c, tex(box(s, dw, dh, 0.06, wood)), face, lx, 0, 0.03);
  if (arched) {
    const arch = tex(cyl(s, dw, dw, 0.06, wood, 0, 0, 0, 12));
    arch.rotation.x = Math.PI / 2;
    arch.position.y = 0;
    onFace(c, arch, face, lx, dh, 0.03);
    const archF = fcyl(c, dw + 0.12, dw + 0.12, 0.06, frame, 0, 0, 0, 12);
    archF.rotation.x = Math.PI / 2;
    archF.position.y = 0;
    onFace(c, archF, face, lx, dh, 0.0);
  }
  // step + knob
  onFace(c, fbox(c, dw + 0.3, 0.08, 0.3, PALETTE.greyStone), face, lx, 0, 0.12);
  onFace(c, fbox(c, 0.06, 0.06, 0.06, PALETTE.lamp), face, lx + 0.2, 0.5, 0.07);
}

function wallMats(k: KitContext, style: string) {
  switch (style) {
    case "grey":
      return { wall: k.mats.textured("stone", PALETTE.greyStone), gableMat: k.mats.textured("stone", PALETTE.greyStone) };
    case "rose":
      return { wall: k.mats.textured("noise", "#ecd0bc"), gableMat: k.mats.textured("noise", "#ecd0bc") };
    case "stucco":
      return { wall: k.mats.textured("noise", "#f6ead2"), gableMat: k.mats.textured("noise", "#f6ead2") };
    case "sand":
      return { wall: k.mats.textured("stone", "#cdbb98"), gableMat: k.mats.textured("stone", "#cdbb98") };
    default:
      return { wall: k.mats.textured("noise", PALETTE.cream), gableMat: k.mats.textured("noise", PALETTE.cream) };
  }
}

function roofMat(k: KitContext, r: string) {
  if (r === "slate") return k.mats.textured("slate", PALETTE.slate);
  if (r === "orange") return k.mats.textured("roof", PALETTE.burntOrange);
  return k.mats.textured("roof", PALETTE.terracotta);
}

export function buildBuilding(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const w = Math.max(2, parseFloat(v.w ?? "3"));
  const d = Math.max(2, parseFloat(v.d ?? "3"));
  const kind = v.k ?? "cottage";
  const style = v.s ?? "cream";
  const storeys = Math.max(1, parseInt(v.f ?? "1", 10));
  const seed = (w * 7 + d * 13 + storeys * 31 + variant.length) % 97;
  const s = k.scene;
  const c: Ctx = { k, parts: [], hw: w / 2, hd: d / 2, white: k.mats.flat("#ffffff") };
  const { wall, gableMat } = wallMats(k, style);
  const roof = roofMat(k, v.r ?? (style === "grey" ? "slate" : "terra"));
  const trim = PALETTE.creamLight;
  const glass = k.mats.flat(PALETTE.glass);
  k.lighting?.registerGlow(glass, "#b08a4a");
  const shutter = style === "grey" ? PALETTE.sage : hash01(seed) > 0.5 ? PALETTE.sage : "#7a8fa6";
  const wood = k.mats.textured("planks", PALETTE.wood, 2);
  const stoneDark = k.mats.textured("stone", PALETTE.greyStoneDark);

  const wallH = STOREY * storeys + 0.15;
  const inset = 0.22; // walls sit inside the footprint so the eaves overhang stays inside the tile
  const bw = w - inset * 2;
  const bd = d - inset * 2;
  c.hw = bw / 2;
  c.hd = bd / 2;

  // walls + plinth
  c.parts.push(tex(box(s, bw, wallH, bd, wall, 0, 0, 0, 0.9)));
  c.parts.push(tex(box(s, bw + 0.08, 0.22, bd + 0.08, stoneDark, 0, 0, 0, 1)));

  // roof
  const rise = kind === "tenement" ? 0.9 : Math.min(1.3, 0.55 + bd * 0.28);
  const g = tex(gable(s, bw + 0.5, bd + 0.5, rise, roof, gableMat, 0.55));
  g.position.y = wallH;
  c.parts.push(g);
  // ridge cap + eaves boards
  c.parts.push(fbox(c, bw + 0.56, 0.08, 0.16, PALETTE.greyStoneDark, 0, wallH + rise - 0.03, 0));
  // chimney
  const chx = (hash01(seed, 2) > 0.5 ? 1 : -1) * (bw / 2 - 0.45);
  c.parts.push(tex(box(s, 0.38, rise + 0.55, 0.38, stoneDark, chx, wallH, 0.12, 1)));
  c.parts.push(fbox(c, 0.46, 0.1, 0.46, PALETTE.greyStoneDark, chx, wallH + rise + 0.5, 0.12));
  c.parts.push(fcyl(c, 0.14, 0.14, 0.18, PALETTE.iron, chx, wallH + rise + 0.6, 0.12, 8));

  // front: door + windows
  const frontSlots = Math.max(1, Math.floor(bw / 0.95));
  const doorIdx = Math.floor(frontSlots / 2);
  const slotW = bw / frontSlots;
  const x0 = -bw / 2 + slotW / 2;
  const doorX = x0 + doorIdx * slotW;
  door(c, "front", doorX, wood, trim, kind !== "shop");
  for (let f = 0; f < storeys; f++) {
    const wy = f * STOREY + (f === 0 ? 0.55 : 0.45);
    for (let i = 0; i < frontSlots; i++) {
      if (f === 0 && i === doorIdx) continue;
      if (f === 0 && (kind === "shop" || kind === "cafe")) continue;
      window(c, "front", x0 + i * slotW, wy, glass, trim, shutter, f === 0 || hash01(seed, f, i) > 0.4, seed + i);
    }
  }
  // side windows
  const sideSlots = Math.max(1, Math.floor(bd / 1.1));
  const sw = bd / sideSlots;
  for (const face of ["east", "west"] as Face[]) {
    for (let f = 0; f < storeys; f++) {
      for (let i = 0; i < sideSlots; i++) {
        if (hash01(seed, f, i, face === "east" ? 1 : 2) > 0.75) continue;
        window(c, face, -bd / 2 + sw / 2 + i * sw, f * STOREY + 0.5, glass, trim, shutter, f === 0 && hash01(seed, i, 9) > 0.5, seed + 40 + i);
      }
    }
  }

  // shop / café front
  if (kind === "shop" || kind === "cafe") {
    const bandY = STOREY - 0.05;
    const sign = kind === "cafe" ? "#4a5f4a" : "#5a3a3a";
    onFace(c, fbox(c, bw - 0.2, 0.34, 0.08, sign), "front", 0, bandY - 0.34, 0.02);
    onFace(c, fbox(c, bw - 0.1, 0.05, 0.12, trim), "front", 0, bandY, 0.03);
    // big display windows either side of the door
    for (let i = 0; i < frontSlots; i++) {
      if (i === doorIdx) continue;
      onFace(c, fbox(c, slotW - 0.28, 0.75, 0.05, trim), "front", x0 + i * slotW, 0.2, 0.0);
      onFace(c, tex(box(s, slotW - 0.38, 0.65, 0.05, glass)), "front", x0 + i * slotW, 0.25, 0.02);
    }
    if (kind === "cafe") {
      // striped awning: a slanted box
      const awning = k.mats.textured("awning", PALETTE.postRed, 2);
      const aw = tex(box(s, bw - 0.1, 0.06, 0.95, awning));
      aw.rotation.x = -0.35;
      onFace(c, aw, "front", 0, bandY + 0.05, 0.45);
      onFace(c, tex(box(s, bw - 0.1, 0.16, 0.05, awning)), "front", 0, bandY - 0.28, 0.9);
      onFace(c, fcyl(c, 0.04, 0.04, bandY - 0.3, PALETTE.iron, 0, 0, 0, 6), "front", -bw / 2 + 0.2, 0.0, 0.9);
      onFace(c, fcyl(c, 0.04, 0.04, bandY - 0.3, PALETTE.iron, 0, 0, 0, 6), "front", bw / 2 - 0.2, 0.0, 0.9);
    }
  }

  // ivy patches on a corner
  if (hash01(seed, 5) > 0.35) {
    const side = hash01(seed, 6) > 0.5 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const hgt = 0.35 + hash01(seed, i, 7) * 0.5;
      onFace(c, fbox(c, 0.3 + hash01(seed, i, 8) * 0.3, hgt, 0.05, PALETTE.moss), "front", side * (bw / 2 - 0.25 - hash01(seed, i) * 0.2), i * 0.45, 0.01);
    }
  }
  return merge("building", c.parts);
}

/** Edinburgh Castle: a stone keep with round towers and battlements on a low mound. */
export function buildCastle(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const w = parseFloat(v.w ?? "8");
  const d = parseFloat(v.d ?? "5");
  const s = k.scene;
  const parts: Mesh[] = [];
  const stone = k.mats.textured("stone", PALETTE.greyStone);
  const dark = k.mats.textured("stone", PALETTE.greyStoneDark);
  const roof = k.mats.textured("slate", PALETTE.slate);
  const glass = k.mats.flat(PALETTE.glass);
  k.lighting?.registerGlow(glass, "#b08a4a");
  const grass = k.mats.textured("grass", PALETTE.grass);

  // mound
  const mound = cyl(s, w * 0.9, w * 1.35, 0.6, grass, 0, 0, 0, 14);
  parts.push(mound);
  const rock = cyl(s, w * 0.95, w * 1.15, 0.5, dark, 0, 0.5, 0, 12);
  parts.push(rock);
  const baseY = 1.0;
  const keepH = 3.2;
  // main keep
  parts.push(box(s, w * 0.62, keepH, d * 0.6, stone, 0, baseY, 0.2, 0.8));
  // battlements
  const merlons = Math.floor((w * 0.62) / 0.5);
  for (let i = 0; i < merlons; i++) {
    const x = -w * 0.31 + 0.25 + i * 0.5;
    if (i % 2 === 0) parts.push(box(s, 0.28, 0.3, 0.28, dark, x, baseY + keepH, -d * 0.3 + 0.1));
  }
  // great hall with slate roof
  parts.push(box(s, w * 0.36, 2.3, d * 0.42, stone, -w * 0.3, baseY, 0.4, 0.8));
  const g = gable(s, w * 0.36 + 0.3, d * 0.42 + 0.3, 0.8, roof, stone, 0.5);
  g.position.set(-w * 0.3, baseY + 2.3, 0.4);
  parts.push(g);
  // towers
  const towers = [
    [w * 0.36, -d * 0.22, 4.2],
    [-w * 0.05, -d * 0.3, 3.8],
    [w * 0.4, d * 0.28, 3.4],
    [-w * 0.44, -d * 0.1, 3.0],
  ];
  for (const [x, z, h] of towers) {
    parts.push(cyl(s, 1.1, 1.2, h, stone, x, baseY, z, 10));
    parts.push(cyl(s, 1.3, 1.3, 0.3, dark, x, baseY + h, z, 10));
    parts.push(cyl(s, 0.05, 1.25, 0.9, roof, x, baseY + h + 0.3, z, 10));
    for (let i = 0; i < 3; i++) parts.push(box(s, 0.16, 0.26, 0.06, glass, x, baseY + 1 + i * 1.0, z - 0.6));
  }
  // flag
  parts.push(cyl(s, 0.04, 0.04, 1.2, k.mats.flat(PALETTE.iron), w * 0.36, baseY + 5.4, -d * 0.22, 5));
  parts.push(box(s, 0.5, 0.3, 0.02, k.mats.flat("#3b5fa8"), w * 0.36 + 0.27, baseY + 6.3, -d * 0.22));
  // gate
  const gate = box(s, 0.9, 1.4, 0.2, k.mats.textured("planks", PALETTE.wood, 2), 0, baseY, -d * 0.3 - 0.02);
  parts.push(gate);
  // keep windows
  for (let i = 0; i < 4; i++) {
    parts.push(box(s, 0.2, 0.36, 0.06, glass, -w * 0.25 + i * 0.5 * (w / 4), baseY + 1.9, -d * 0.3 - 0.02));
  }
  return merge("castle", parts);
}

export function registerArchitecture(am: AssetManager) {
  am.register("building", buildBuilding, { shadow: true });
  am.register("castle", buildCastle, { shadow: true });
}
