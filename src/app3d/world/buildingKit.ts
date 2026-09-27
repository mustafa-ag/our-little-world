// Regional building geometry. Every region gets its own architectural
// SHAPE language (not just a different wall colour):
//
//   uae_modern / uae_coastal  flat-roof cubic Gulf villa: set-back upper box,
//                             horizontal banding, parapet lip, recessed entry,
//                             glazed terrace railing
//   uae_modern + glass roof   Dubai glass tower: tall 3:1–5:1 shaft on a wider
//   (Dubai)                   podium, semi-transparent curtain wall, tapered or
//                             stepped crown
//   london                    brick terrace: pitched slate roof behind a street
//                             parapet, regular sash rhythm with sills, two-storey
//                             bay, chimney stack with pots
//   scotland                  the hand-tuned cottage kit, forced steep with
//                             dormers and twin chimneys
//   amman                     limestone block: groove courses, arch-top windows,
//                             stepped top storey, parapet, rooftop water tanks
//   italy                     pastel villa: low hipped terracotta roof, shutters,
//                             wraparound balcony slab with balusters
//   greece                    Santorini cubist: rounded white volumes stepping
//                             back, flat terraces, blue arched door, blue dome
//
// Contract (same as the cottage kit): built at the origin, footprint centred on
// (0,0), base at y = 0, front door at x = 0 facing -Z, everything inside the
// w×d tile footprint. Parts are vertex-tinted against the shared kit slots and
// merged into ONE multi-material mesh so the world builder can thin-instance it.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { hash01, merge, parseVariant } from "../assets/kit/util";
import { Surface, shade, tblob, tbox, tcyl, type V3 } from "../assets/kit/architecture/geom";
import { heroSlots, type Slots } from "../assets/kit/architecture/slots";
import { buildCottage } from "../assets/kit/architecture/cottage";
import { specFromVariant, presetVariant } from "../assets/kit/architecture/presets";
import { DOOR_H, DOOR_W, SILL_Y, STOREY, WINDOW_H, WINDOW_W } from "./scale";
import type { RegionKind, RoofStyle, WorldArtProfile } from "./artProfile";

/** Kit slots plus the semi-transparent curtain-wall glass. */
export interface RegionalSlots extends Slots {
  glassSkin: Material;
}

export type RegionalStyle = "gulf" | "tower" | "london" | "scotland" | "amman" | "italy" | "santorini";
export type RegionalKind = "house" | "shop" | "cafe" | "tenement";

export interface RegionalOptions {
  /** ground-floor use: shops / cafés get a glazed shopfront + fascia */
  kind?: RegionalKind;
  /** materials (defaults to the pure olw_* hero slots, safe under NullEngine) */
  slots?: RegionalSlots;
}

/** Which shape language a profile builds (null = no regional geometry: the cottage kit). */
export function regionalStyle(profile: Pick<WorldArtProfile, "region" | "roofStyle">): RegionalStyle | null {
  switch (profile.region) {
    case "uae_modern":
      return profile.roofStyle === "glass" ? "tower" : "gulf";
    case "uae_coastal":
      return "gulf";
    case "london":
      return "london";
    case "scotland":
      return "scotland";
    case "amman":
      return "amman";
    case "italy":
      return "italy";
    case "greece":
      return "santorini";
    default:
      return null;
  }
}

/** Profile stub that makes `regionalStyle` return `style` (variant strings carry only the style). */
function profileFor(style: RegionalStyle): Pick<WorldArtProfile, "region" | "roofStyle"> {
  const region: Record<RegionalStyle, [RegionKind, RoofStyle]> = {
    gulf: ["uae_modern", "flat_parapet"],
    tower: ["uae_modern", "glass"],
    london: ["london", "slate"],
    scotland: ["scotland", "slate"],
    amman: ["amman", "flat_parapet"],
    italy: ["italy", "terracotta"],
    santorini: ["greece", "flat_parapet"],
  };
  const [r, roof] = region[style];
  return { region: r, roofStyle: roof };
}

/**
 * Regions whose world buildings use this kit. Scotland (hand-tuned Edinburgh
 * presets) and unprofiled regions (Germany) keep the authored cottage kit.
 */
export function usesRegionalGeometry(profile: Pick<WorldArtProfile, "region" | "roofStyle">) {
  const s = regionalStyle(profile);
  return s !== null && s !== "scotland";
}

/**
 * Variant string for the "building" kit piece ("rg=amman,w=3,d=3,f=2,k=house,v=1").
 * `v` is a 0..3 look bucket so batches stay small while neighbours differ.
 */
export function regionalVariant(style: RegionalStyle, w: number, d: number, storeys: number, kind: RegionalKind, seed: number) {
  // Dubai: shops / cafés / cottages stay low-rise villas under the towers
  const s: RegionalStyle = style === "tower" && (kind === "shop" || kind === "cafe" || storeys < 2) ? "gulf" : style;
  return `rg=${s},w=${w},d=${d},f=${Math.max(1, Math.min(4, storeys))},k=${kind},v=${Math.abs(Math.floor(seed)) % 4}`;
}

/** True for "rg=…" regional variants (their door is always centred: local x = 0). */
export function isRegionalVariant(variant: string) {
  return variant.includes("rg=");
}

/** Build from an "rg=…" variant string (runtime factory entry point). */
export function buildRegionalFromVariant(scene: Scene, slots: RegionalSlots, variant: string): Mesh {
  const v = parseVariant(variant);
  const style = (v.rg as RegionalStyle) ?? "gulf";
  const w = Math.max(2, parseFloat(v.w ?? "3"));
  const d = Math.max(2, parseFloat(v.d ?? "3"));
  const f = Math.max(1, parseInt(v.f ?? "2", 10) || 1);
  const kind = (v.k as RegionalKind) ?? "house";
  const seed = parseInt(v.v ?? "0", 10) || 0;
  return buildRegionalBuilding(scene, profileFor(style), w, d, f * STOREY + 0.2, seed, { kind, slots });
}

/**
 * Architecturally distinct building for the profile's region. width / depth are
 * the tile footprint, height the nominal wall height (storeys × STOREY), seed
 * any integer (picks palette + optional features deterministically).
 */
export function buildRegionalBuilding(
  scene: Scene,
  profile: Pick<WorldArtProfile, "region" | "roofStyle">,
  width: number,
  depth: number,
  height: number,
  seed: number,
  opts: RegionalOptions = {},
): Mesh {
  const sl = opts.slots ?? defaultSlots(scene);
  const kind = opts.kind ?? "house";
  const c: C = { s: scene, sl, parts: [], seed: seed * 7919 + width * 31 + depth * 17 + Math.round(height * 10), kind, nodes: [] };
  switch (regionalStyle(profile)) {
    case "gulf":
      buildGulfVilla(c, width, depth, height);
      break;
    case "tower":
      buildGlassTower(c, width, depth, height);
      break;
    case "london":
      buildLondonTerrace(c, width, depth, height);
      break;
    case "scotland":
      return buildScottishBuilding(scene, sl, width, depth, height, seed);
    case "amman":
      buildAmmanLimestone(c, width, depth, height);
      break;
    case "italy":
      buildMediterranean(c, width, depth, height);
      break;
    case "santorini":
      buildSantoriniCubist(c, width, depth, height);
      break;
    default:
      buildGeneric(c, width, depth, height);
  }
  const mesh = merge("building", c.parts);
  for (const n of c.nodes) n.dispose();
  return mesh;
}

// ============================================================== shared bits

/** wall inset from the tile footprint (same as the cottage kit: eaves stay inside the tile) */
const INSET = 0.22;
const GLASS_DARK = "#6f8590";
const GLASS_LIGHT = "#c3d0d4";

interface C {
  s: Scene;
  sl: RegionalSlots;
  parts: Mesh[];
  seed: number;
  kind: RegionalKind;
  nodes: TransformNode[];
}

/** A rectangular volume: centre (ox, oz), half sizes, base y0, height h. */
interface Body {
  ox: number;
  oz: number;
  hw: number;
  hd: number;
  y0: number;
  h: number;
}
type Face = "front" | "back" | "east" | "west";
const FACES: Face[] = ["front", "back", "east", "west"];

const rnd = (c: C, ...n: number[]) => hash01(c.seed, ...n);
const pick = <T>(c: C, list: T[], salt: number) => list[Math.floor(rnd(c, salt) * list.length) % list.length];
const isShop = (c: C) => c.kind === "shop" || c.kind === "cafe";

function add(c: C, m: Mesh) {
  c.parts.push(m);
  return m;
}
function bx(c: C, w: number, h: number, d: number, mat: Material, hex: string, x: number, y: number, z: number, uv?: number) {
  return add(c, tbox(c.s, w, h, d, mat, hex, x, y, z, uv));
}

/** Width of a face and its outward direction. */
function faceWidth(b: Body, f: Face) {
  return f === "front" || f === "back" ? b.hw * 2 : b.hd * 2;
}

/**
 * A box on a face: `u` across the face (seen from outside, 0 = middle), `y` its
 * base, `w`×`h` on the face, `depth` out of the wall, `out` = centre distance
 * in front of the wall plane.
 */
function faceBox(c: C, b: Body, f: Face, u: number, y: number, w: number, h: number, depth: number, out: number, mat: Material, hex: string, uv?: number) {
  switch (f) {
    case "front":
      return bx(c, w, h, depth, mat, hex, b.ox + u, y, b.oz - b.hd - out, uv);
    case "back":
      return bx(c, w, h, depth, mat, hex, b.ox - u, y, b.oz + b.hd + out, uv);
    case "east":
      return bx(c, depth, h, w, mat, hex, b.ox + b.hw + out, y, b.oz + u, uv);
    case "west":
      return bx(c, depth, h, w, mat, hex, b.ox - b.hw - out, y, b.oz - u, uv);
  }
}

/** Thin disc on a face (arch tops, round windows): centre at (u, y). */
function faceDisc(c: C, b: Body, f: Face, u: number, y: number, diameter: number, depth: number, out: number, mat: Material, hex: string, tess = 12) {
  const m = add(c, tcyl(c.s, diameter, diameter, depth, mat, hex, 0, 0, 0, tess));
  switch (f) {
    case "front":
      m.position.set(b.ox + u, y, b.oz - b.hd - out);
      m.rotation.x = Math.PI / 2;
      break;
    case "back":
      m.position.set(b.ox - u, y, b.oz + b.hd + out);
      m.rotation.x = Math.PI / 2;
      break;
    case "east":
      m.position.set(b.ox + b.hw + out, y, b.oz + u);
      m.rotation.z = Math.PI / 2;
      break;
    case "west":
      m.position.set(b.ox - b.hw - out, y, b.oz - u);
      m.rotation.z = Math.PI / 2;
      break;
  }
  return m;
}

/** Evenly spaced slot centres across a face. */
function slots(width: number, n: number) {
  const sw = width / n;
  return Array.from({ length: n }, (_, i) => -width / 2 + sw / 2 + i * sw);
}

/** The main wall volume (textured, tinted). */
function volume(c: C, b: Body, hex: string, mat: Material = c.sl.stone, uv = 0.9) {
  return bx(c, b.hw * 2, b.h, b.hd * 2, mat, hex, b.ox, b.y0, b.oz, uv);
}

/** Flat-roof parapet: four low walls around the top (+ a coping lip). */
function parapet(c: C, b: Body, hex: string, rise = 0.15, t = 0.08, mat: Material = c.sl.stone) {
  const y = b.y0 + b.h;
  const w = b.hw * 2;
  const d = b.hd * 2;
  bx(c, w, rise, t, mat, hex, b.ox, y, b.oz - b.hd + t / 2);
  bx(c, w, rise, t, mat, hex, b.ox, y, b.oz + b.hd - t / 2);
  bx(c, t, rise, d - t * 2, mat, hex, b.ox - b.hw + t / 2, y, b.oz);
  bx(c, t, rise, d - t * 2, mat, hex, b.ox + b.hw - t / 2, y, b.oz);
  // roof deck (slightly lower tone) so the top never reads as a solid block
  bx(c, w - t * 2, 0.01, d - t * 2, c.sl.paint, shade(hex, -0.12), b.ox, y, b.oz);
}

/** Thin horizontal band wrapping a volume at height y (front optionally split around a gap). */
function band(c: C, b: Body, y: number, h: number, proud: number, hex: string, gap?: [number, number]) {
  const w = b.hw * 2 + proud * 2;
  const d = b.hd * 2 + proud * 2;
  const m = c.sl.paint;
  bx(c, w, h, proud, m, hex, b.ox, y, b.oz + b.hd + proud / 2);
  bx(c, proud, h, d, m, hex, b.ox - b.hw - proud / 2, y, b.oz);
  bx(c, proud, h, d, m, hex, b.ox + b.hw + proud / 2, y, b.oz);
  if (!gap) bx(c, w, h, proud, m, hex, b.ox, y, b.oz - b.hd - proud / 2);
  else {
    const [g0, g1] = gap;
    const l = g0 - (-w / 2);
    const r = w / 2 - g1;
    if (l > 0.01) bx(c, l, h, proud, m, hex, b.ox - w / 2 + l / 2, y, b.oz - b.hd - proud / 2);
    if (r > 0.01) bx(c, r, h, proud, m, hex, b.ox + g1 + r / 2, y, b.oz - b.hd - proud / 2);
  }
}

/** Plain window: frame + glass (+ optional sill). Base y = sill line. */
function windowAt(c: C, b: Body, f: Face, u: number, y: number, ww: number, wh: number, frameHex: string, sillHex: string | null, glassHex?: string) {
  faceBox(c, b, f, u, y - 0.03, ww + 0.08, wh + 0.06, 0.03, 0.005, c.sl.paint, frameHex);
  faceBox(c, b, f, u, y, ww, wh, 0.03, 0.02, c.sl.glass, glassHex ?? (rnd(c, u, y, f.length) > 0.7 ? GLASS_LIGHT : GLASS_DARK));
  if (sillHex) faceBox(c, b, f, u, y - 0.07, ww + 0.14, 0.06, 0.1, 0.04, c.sl.paint, sillHex);
}

/** Door (+ frame) centred at u on a face. */
function doorAt(c: C, b: Body, f: Face, u: number, doorHex: string, frameHex: string, out = 0, w = DOOR_W, h = DOOR_H) {
  faceBox(c, b, f, u, b.y0, w + 0.12, h + 0.08, 0.03, out + 0.005, c.sl.paint, frameHex);
  faceBox(c, b, f, u, b.y0, w, h, 0.05, out + 0.025, c.sl.wood, doorHex, 2);
  faceBox(c, b, f, u + w * 0.3, b.y0 + h * 0.48, 0.04, 0.04, 0.03, out + 0.06, c.sl.metal, "#c8b070");
}

/** Glazed shopfront + fascia across the ground floor front (door stays at u = 0). */
function shopfront(c: C, b: Body, fasciaHex: string, frameHex: string) {
  const w = b.hw * 2;
  const side = (w - DOOR_W - 0.3) / 2;
  if (side > 0.25)
    for (const s of [-1, 1]) {
      const u = s * (DOOR_W / 2 + 0.1 + side / 2);
      faceBox(c, b, "front", u, b.y0 + 0.28, side + 0.06, 1.05, 0.03, 0.005, c.sl.paint, frameHex);
      faceBox(c, b, "front", u, b.y0 + 0.31, side, 0.99, 0.03, 0.02, c.sl.glass, "#e2c893");
      faceBox(c, b, "front", u, b.y0, side + 0.06, 0.28, 0.06, 0.03, c.sl.paint, shade(frameHex, -0.15));
    }
  faceBox(c, b, "front", 0, b.y0 + 1.42, w - 0.04, 0.24, 0.06, 0.03, c.sl.paint, fasciaHex);
  if (c.kind === "cafe") {
    // canvas awning: a sloped slab over the shopfront
    const a = add(c, tbox(c.s, w - 0.1, 0.03, 0.5, c.sl.paint, shade(fasciaHex, 0.1), 0, 0, 0));
    a.position.set(b.ox, b.y0 + 1.32, b.oz - b.hd - 0.22);
    a.rotation.x = -0.35;
  }
}

/** Gable roof prism, ridge along X. (cx, y, cz) = centre of the eaves plane. */
function gableRoof(c: C, cx: number, y: number, cz: number, width: number, depth: number, rise: number, roofMat: Material, roofHex: string, gableHex: string, uv = 0.9) {
  const hw = width / 2;
  const hd = depth / 2;
  const roof = new Surface(c.s, roofMat);
  const ends = new Surface(c.s, c.sl.stone);
  const L = Math.hypot(hd, rise);
  const P = (x: number, yy: number, z: number): V3 => [cx + x, y + yy, cz + z];
  const uvq = [0, 0, width * uv, 0, width * uv, L * uv, 0, L * uv];
  roof.quad(P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, rise, 0), P(-hw, rise, 0), [0, hd / L, -rise / L], roofHex, uvq);
  roof.quad(P(hw, 0, hd), P(-hw, 0, hd), P(-hw, rise, 0), P(hw, rise, 0), [0, hd / L, rise / L], roofHex, uvq);
  roof.quad(P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), P(-hw, 0, hd), [0, -1, 0], shade(roofHex, -0.25));
  ends.tri(P(-hw, 0, hd), P(-hw, 0, -hd), P(-hw, rise, 0), [-1, 0, 0], gableHex);
  ends.tri(P(hw, 0, -hd), P(hw, 0, hd), P(hw, rise, 0), [1, 0, 0], gableHex);
  add(c, roof.bake("roof"));
  add(c, ends.bake("gable"));
}

/** Hipped roof (all four sides slope). Ridge along the longer axis. */
function hipRoof(c: C, cx: number, y: number, cz: number, width: number, depth: number, rise: number, roofMat: Material, roofHex: string, uv = 0.9) {
  const s = new Surface(c.s, roofMat);
  const alongX = width >= depth;
  const hw = width / 2;
  const hd = depth / 2;
  const P = (x: number, yy: number, z: number): V3 => [cx + x, y + yy, cz + z];
  const n = (x: number, yy: number, z: number): V3 => {
    const l = Math.hypot(x, yy, z) || 1;
    return [x / l, yy / l, z / l];
  };
  const q = (w: number, l: number) => [0, 0, w * uv, 0, w * uv, l * uv, 0, l * uv];
  if (alongX) {
    const rl = hw - hd;
    const R1 = P(-rl, rise, 0);
    const R2 = P(rl, rise, 0);
    s.quad(P(-hw, 0, -hd), P(hw, 0, -hd), R2, R1, n(0, hd, -rise), roofHex, q(width, Math.hypot(hd, rise)));
    s.quad(P(hw, 0, hd), P(-hw, 0, hd), R1, R2, n(0, hd, rise), roofHex, q(width, Math.hypot(hd, rise)));
    s.tri(P(hw, 0, -hd), P(hw, 0, hd), R2, n(rise, hd, 0), shade(roofHex, -0.05));
    s.tri(P(-hw, 0, hd), P(-hw, 0, -hd), R1, n(-rise, hd, 0), shade(roofHex, -0.05));
  } else {
    const rl = hd - hw;
    const R1 = P(0, rise, -rl);
    const R2 = P(0, rise, rl);
    s.quad(P(hw, 0, -hd), P(hw, 0, hd), R2, R1, n(rise, hw, 0), roofHex, q(depth, Math.hypot(hw, rise)));
    s.quad(P(-hw, 0, hd), P(-hw, 0, -hd), R1, R2, n(-rise, hw, 0), roofHex, q(depth, Math.hypot(hw, rise)));
    s.tri(P(-hw, 0, -hd), P(hw, 0, -hd), R1, n(0, hw, -rise), shade(roofHex, -0.05));
    s.tri(P(hw, 0, hd), P(-hw, 0, hd), R2, n(0, hw, rise), shade(roofHex, -0.05));
  }
  s.quad(P(-hw, 0, -hd), P(hw, 0, -hd), P(hw, 0, hd), P(-hw, 0, hd), [0, -1, 0], shade(roofHex, -0.3));
  add(c, s.bake("hip"));
}

/** Square frustum (tapered tower crown). */
function frustum(c: C, mat: Material, hex: string, cx: number, y: number, cz: number, w0: number, d0: number, w1: number, d1: number, h: number) {
  const s = new Surface(c.s, mat);
  const a = [w0 / 2, d0 / 2];
  const t = [w1 / 2, d1 / 2];
  const P = (x: number, yy: number, z: number): V3 => [cx + x, y + yy, cz + z];
  const n = (x: number, yy: number, z: number): V3 => {
    const l = Math.hypot(x, yy, z) || 1;
    return [x / l, yy / l, z / l];
  };
  s.quad(P(-a[0], 0, -a[1]), P(a[0], 0, -a[1]), P(t[0], h, -t[1]), P(-t[0], h, -t[1]), n(0, a[1] - t[1], -h), hex);
  s.quad(P(a[0], 0, a[1]), P(-a[0], 0, a[1]), P(-t[0], h, t[1]), P(t[0], h, t[1]), n(0, a[1] - t[1], h), hex);
  s.quad(P(a[0], 0, -a[1]), P(a[0], 0, a[1]), P(t[0], h, t[1]), P(t[0], h, -t[1]), n(h, a[0] - t[0], 0), shade(hex, -0.06));
  s.quad(P(-a[0], 0, a[1]), P(-a[0], 0, -a[1]), P(-t[0], h, -t[1]), P(-t[0], h, t[1]), n(-h, a[0] - t[0], 0), shade(hex, -0.06));
  s.quad(P(-t[0], h, -t[1]), P(t[0], h, -t[1]), P(t[0], h, t[1]), P(-t[0], h, t[1]), [0, 1, 0], shade(hex, 0.08));
  add(c, s.bake("frustum"));
}

// ============================================================== UAE: Gulf villa

const GULF_WALLS = ["#F2ECD8", "#F5F2EC", "#E8DCC0"];

function buildGulfVilla(c: C, width: number, depth: number, height: number) {
  const wall = pick(c, GULF_WALLS, 1);
  const trim = shade(wall, -0.14);
  const frame = pick(c, ["#6b5a44", "#3f4a52", "#8a6a44"], 2);
  const floors = Math.max(isShop(c) ? 1 : 2, Math.min(3, Math.round(height / STOREY)));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const RECESS = 0.26;
  const gap: [number, number] = [-0.62, 0.62];

  // ---- ground volume with a recessed entrance: back block + two front piers
  const g: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: STOREY };
  const gBack: Body = { ...g, oz: RECESS / 2, hd: (bd - RECESS) / 2 };
  volume(c, gBack, wall);
  const pierW = bw / 2 + gap[0];
  for (const s of [-1, 1]) bx(c, pierW, STOREY, RECESS, c.sl.stone, wall, s * (bw / 2 - pierW / 2), 0, -bd / 2 + RECESS / 2, 0.9);
  // lintel over the recess (keeps the ground box reading as one cube)
  bx(c, gap[1] - gap[0], STOREY - DOOR_H - 0.22, RECESS, c.sl.stone, wall, 0, DOOR_H + 0.22, -bd / 2 + RECESS / 2, 0.9);
  // recess soffit shadow + door on the recessed face + canopy slab
  bx(c, gap[1] - gap[0], 0.02, RECESS, c.sl.paint, shade(wall, -0.3), 0, DOOR_H + 0.2, -bd / 2 + RECESS / 2);
  doorAt(c, gBack, "front", 0, frame, trim, 0, DOOR_W + 0.1);
  bx(c, 1.5, 0.07, 0.42, c.sl.paint, trim, 0, DOOR_H + 0.14, -bd / 2 - 0.1);
  if (isShop(c)) shopfront(c, g, pick(c, ["#b08a54", "#5f9aa8", "#8a6a44"], 3), frame);

  // ---- upper volume: a smaller box set back (and to one side) → a front terrace
  const bodies: Body[] = [g];
  if (floors >= 2) {
    const uw = bw * (0.68 + rnd(c, 4) * 0.22);
    const ud = bd * (0.62 + rnd(c, 5) * 0.12);
    const ux = (rnd(c, 6) > 0.5 ? 1 : -1) * (bw - uw) / 2 * rnd(c, 7);
    const u: Body = { ox: ux, oz: (bd - ud) / 2, hw: uw / 2, hd: ud / 2, y0: STOREY, h: STOREY * (floors - 1) };
    volume(c, u, wall);
    bodies.push(u);
    // glazed balcony railing along the terrace edge (front of the ground roof)
    bx(c, bw - 0.16, 0.34, 0.03, c.sl.glassSkin, "#bcd6e0", 0, STOREY + 0.15, -bd / 2 + RECESS + 0.06);
    bx(c, bw - 0.12, 0.03, 0.05, c.sl.metal, "#9aa4aa", 0, STOREY + 0.49, -bd / 2 + RECESS + 0.06);
    // upper windows (wide, horizontal proportions)
    for (let f = 0; f < floors - 1; f++) {
      const n = Math.max(1, Math.floor(uw / 1.15));
      for (const x of slots(uw, n)) windowAt(c, u, "front", x, STOREY * (f + 1) + 0.52, Math.min(0.85, uw / n - 0.3), 0.6, frame, null);
      for (const face of ["east", "west"] as Face[]) if (rnd(c, f, face.length, 8) > 0.35) windowAt(c, u, face, 0, STOREY * (f + 1) + 0.52, Math.min(0.7, ud - 0.4), 0.6, frame, null);
    }
    // a slim vertical fin on one corner of the upper box (Gulf modern)
    bx(c, 0.08, u.h + 0.2, 0.3, c.sl.paint, trim, u.ox + (ux > 0 ? -1 : 1) * (uw / 2 - 0.04), u.y0, u.oz - u.hd - 0.12);
  }
  // ground windows either side of the recess
  if (!isShop(c)) {
    const side = bw / 2 + gap[0];
    if (side > 0.55) for (const s of [-1, 1]) windowAt(c, g, "front", s * (-gap[0] + side / 2), 0.55, Math.min(0.8, side - 0.3), 0.62, frame, null);
    for (const face of ["east", "west", "back"] as Face[]) windowAt(c, g, face, 0, 0.55, 0.7, 0.62, frame, null);
  }

  // ---- horizontal banding every ~0.9 u, parapet lip on each flat roof
  for (const b of bodies) {
    for (let y = b.y0 + 0.9; y < b.y0 + b.h - 0.2; y += 0.9) band(c, b, y, 0.04, 0.025, trim, b === g ? gap : undefined);
    parapet(c, b, shade(wall, -0.05), 0.15, 0.08);
    bx(c, b.hw * 2 + 0.06, 0.04, b.hd * 2 + 0.06, c.sl.paint, trim, b.ox, b.y0 + b.h - 0.04, b.oz);
  }
  // rooftop plant: a small AC box on the highest roof
  const top = bodies[bodies.length - 1];
  bx(c, 0.36, 0.22, 0.28, c.sl.metal, "#c9ccc8", top.ox + top.hw * 0.4, top.y0 + top.h, top.oz + top.hd * 0.3);
}

// ============================================================== Dubai: glass tower

function buildGlassTower(c: C, width: number, depth: number, _height: number) {
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const tw = Math.max(1.1, bw - 0.4);
  const td = Math.max(1.1, bd - 0.4);
  const ratio = 3 + rnd(c, 1) * 2;
  const th = Math.max(5, Math.min(14, Math.min(tw, td) * ratio));
  const skin = pick(c, ["#8fb6cc", "#9fc0c8", "#7fa6c2", "#a8bfcc"], 2);
  const core = shade(skin, -0.55);
  const podiumH = 0.6;
  const metal = "#c8d3da";

  // podium: wider ground box (width+0.4)×0.6×(depth+0.4) with a glazed street front
  const pw = tw + 0.4;
  const pd = td + 0.4;
  const p: Body = { ox: 0, oz: 0, hw: pw / 2, hd: pd / 2, y0: 0, h: podiumH };
  volume(c, p, "#dcd8cf", c.sl.stone, 0.6);
  faceBox(c, p, "front", 0, 0.05, pw - 0.3, podiumH - 0.12, 0.03, 0.02, c.sl.glass, "#d8c493");
  bx(c, pw + 0.06, 0.05, pd + 0.06, c.sl.paint, "#eeeae2", 0, podiumH, 0);

  // shaft: opaque core inside a semi-transparent curtain wall
  const y0 = podiumH + 0.05;
  const shaft: Body = { ox: 0, oz: 0, hw: tw / 2, hd: td / 2, y0, h: th };
  bx(c, tw - 0.08, th, td - 0.08, c.sl.paint, core, 0, y0, 0);
  // lit office windows on the core (glow at night through the skin)
  const rows = Math.floor(th / 0.55);
  for (let i = 0; i < rows; i++)
    for (const f of FACES) {
      if (rnd(c, i, f.length, 3) > 0.45) continue;
      const u = (rnd(c, i, f.length, 4) - 0.5) * (faceWidth(shaft, f) - 0.5);
      faceBox(c, shaft, f, u, y0 + i * 0.55 + 0.12, 0.35, 0.3, 0.02, -0.03, c.sl.glass, "#e8d7a8");
    }
  bx(c, tw, th, td, c.sl.glassSkin, skin, 0, y0, 0);
  // floor spandrels + corner mullions
  for (let y = y0 + 0.55; y < y0 + th - 0.1; y += 0.55) bx(c, tw + 0.02, 0.04, td + 0.02, c.sl.metal, metal, 0, y, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(c, 0.07, th, 0.07, c.sl.metal, metal, (sx * tw) / 2, y0, (sz * td) / 2);
  // central vertical fins on the long faces
  bx(c, 0.05, th, 0.1, c.sl.metal, metal, 0, y0, -td / 2 - 0.04);
  bx(c, 0.05, th, 0.1, c.sl.metal, metal, 0, y0, td / 2 + 0.04);

  // crown: tapered or stepped on taller towers, a flat lip + helipad disc otherwise
  const top = y0 + th;
  if (th >= 7 && rnd(c, 5) > 0.5) {
    frustum(c, c.sl.glassSkin, skin, 0, top, 0, tw, td, tw * 0.45, td * 0.45, Math.min(2.2, th * 0.22));
    add(c, tcyl(c.s, 0.03, 0.08, 1.4, c.sl.metal, metal, 0, top + Math.min(2.2, th * 0.22), 0, 6));
  } else if (th >= 7) {
    bx(c, tw * 0.78, 0.7, td * 0.78, c.sl.glassSkin, skin, 0, top, 0);
    bx(c, tw * 0.8, 0.04, td * 0.8, c.sl.metal, metal, 0, top + 0.7, 0);
    bx(c, tw * 0.52, 0.6, td * 0.52, c.sl.glassSkin, skin, 0, top + 0.74, 0);
    add(c, tcyl(c.s, 0.03, 0.08, 1.1, c.sl.metal, metal, 0, top + 1.34, 0, 6));
  } else {
    bx(c, tw + 0.08, 0.14, td + 0.08, c.sl.metal, metal, 0, top, 0);
    add(c, tcyl(c.s, Math.min(tw, td) * 0.7, Math.min(tw, td) * 0.7, 0.03, c.sl.paint, "#5a6a72", 0, top + 0.14, 0, 16));
  }
  // entrance canopy + doors on the podium
  // glazed entrance vestibule bridging podium front and shaft, doors + canopy
  bx(c, 1.2, DOOR_H + 0.2, 0.2, c.sl.glassSkin, skin, 0, 0, -td / 2 - 0.1);
  bx(c, 1.24, 0.05, 0.24, c.sl.metal, metal, 0, DOOR_H + 0.2, -td / 2 - 0.1);
  doorAt(c, p, "front", 0, "#3a4650", metal, 0, DOOR_W + 0.2);
  bx(c, 1.6, 0.06, 0.55, c.sl.metal, metal, 0, DOOR_H + 0.12, -pd / 2 - 0.22);
}

// ============================================================== London: brick terrace

const LONDON_BRICK = ["#a8664e", "#9a5a44", "#b07058", "#8e5a48"];
const LONDON_DOORS = ["#1f2a3a", "#6b1f24", "#20382c", "#2f2f2f"];

function buildLondonTerrace(c: C, width: number, depth: number, height: number) {
  const brick = pick(c, LONDON_BRICK, 1);
  const stucco = "#ece6da";
  const sill = "#e8e2d6";
  const slate = "#5c6670";
  const floors = Math.max(2, Math.min(3, Math.round(height / STOREY)));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY + 0.2;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, brick);
  // stucco ground floor on half the terraces
  const stuccoGround = rnd(c, 2) > 0.5;
  if (stuccoGround) faceBox(c, b, "front", 0, 0, bw, STOREY * 0.92, 0.02, 0.005, c.sl.stone, stucco, 0.9);
  // plinth + cornice band under the parapet
  bx(c, bw + 0.06, 0.18, bd + 0.06, c.sl.stone, shade(brick, -0.25), 0, 0, 0);
  band(c, b, H - 0.14, 0.1, 0.05, stucco);
  // floor string course
  band(c, b, STOREY - 0.05, 0.05, 0.02, stucco);

  // ---- door + bay window (ground + first floor) on the front
  const door = pick(c, LONDON_DOORS, 3);
  doorAt(c, b, "front", 0, door, stucco);
  faceDisc(c, b, "front", 0, DOOR_H + 0.02, DOOR_W - 0.1, 0.03, 0.01, c.sl.glass, GLASS_LIGHT, 12); // fanlight
  bx(c, DOOR_W + 0.3, 0.1, 0.3, c.sl.stone, "#cfc8bc", 0, 0, -bd / 2 - 0.15); // front step
  const bayRoom = bw / 2 - 0.52;
  const bayW = Math.min(1.1, bayRoom);
  const hasBay = bayW >= 0.55;
  const bayU = -(0.42 + bayRoom / 2);
  const bayH = floors >= 2 ? STOREY * 2 - 0.25 : STOREY - 0.1;
  if (hasBay) {
    const bayHex = stuccoGround ? stucco : brick;
    faceBox(c, b, "front", bayU, 0, bayW, bayH, 0.2, 0.1, c.sl.stone, bayHex, 0.9);
    // lead cap
    faceBox(c, b, "front", bayU, bayH, bayW + 0.06, 0.06, 0.26, 0.12, c.sl.slate, "#6a7078");
    for (let f = 0; f < Math.min(2, floors); f++) {
      const y = f * STOREY + SILL_Y - 0.05;
      const bayBody: Body = { ox: b.ox + bayU, oz: b.oz - bd / 2 - 0.1, hw: bayW / 2, hd: 0.1, y0: 0, h: bayH };
      windowAt(c, bayBody, "front", 0, y, bayW - 0.2, WINDOW_H + 0.1, "#f2efe8", sill);
      for (const face of ["east", "west"] as Face[]) faceBox(c, bayBody, face, -0.02, y, 0.1, WINDOW_H + 0.1, 0.02, 0.012, c.sl.glass, GLASS_DARK);
    }
  }
  // ---- regular sash rhythm: 2–4 tall windows per floor
  const n = Math.max(2, Math.min(4, Math.floor(bw / 0.7)));
  const xs = slots(bw, n);
  const ww = Math.min(0.46, bw / n - 0.28);
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y - (f === floors - 1 ? 0.05 : 0);
    const wh = f === floors - 1 ? WINDOW_H : WINDOW_H + 0.16;
    for (const x of xs) {
      if (Math.abs(x) < DOOR_W / 2 + ww / 2 + 0.05 && f === 0) continue;
      if (hasBay && f < 2 && Math.abs(x - bayU) < bayW / 2 + ww / 2) continue;
      windowAt(c, b, "front", x, y, ww, wh, "#f2efe8", sill);
      faceBox(c, b, "front", x, y + wh + 0.02, ww + 0.1, 0.08, 0.03, 0.01, c.sl.paint, stucco); // lintel
    }
    for (const x of slots(bw, Math.max(1, n - 1))) if (rnd(c, f, x, 4) > 0.3) windowAt(c, b, "back", x, y, ww, wh - 0.1, "#f2efe8", sill);
  }

  // ---- street parapet + pitched slate roof behind it
  bx(c, bw, 0.28, 0.1, c.sl.stone, brick, 0, H, -bd / 2 + 0.05, 0.9);
  bx(c, bw + 0.04, 0.04, 0.14, c.sl.paint, stucco, 0, H + 0.28, -bd / 2 + 0.05);
  const rise = bd * 0.34;
  gableRoof(c, 0, H, 0.03, bw, bd - 0.06, rise, c.sl.slate, slate, brick);

  // ---- chimney stack (off-centre on the ridge) with cylinder pots
  const cxh = (rnd(c, 5) > 0.5 ? 1 : -1) * (bw / 2 - 0.35);
  bx(c, 0.46, rise + 0.55, 0.3, c.sl.stone, brick, cxh, H, 0.03, 0.9);
  bx(c, 0.52, 0.06, 0.36, c.sl.paint, stucco, cxh, H + rise + 0.55, 0.03);
  const pots = 2 + Math.floor(rnd(c, 6) * 2);
  for (let i = 0; i < pots; i++) add(c, tcyl(c.s, 0.08, 0.1, 0.2, c.sl.paint, "#b0643e", cxh - 0.14 + (i * 0.28) / Math.max(1, pots - 1), H + rise + 0.61, 0.03, 8));
}

// ============================================================== Scotland: cottage kit, steep

const SCOT_PRESETS_1 = ["stoneCrow", "greyMoss", "bothy"];
const SCOT_PRESETS_2 = ["greyDormer", "sandDormer2", "creamCrow2"];

/** Steep-roofed Scottish house: the hand-tuned cottage kit with a ≥45° pitch, dormers and twin chimneys. */
export function buildScottishBuilding(scene: Scene, sl: Slots, width: number, depth: number, height: number, seed: number): Mesh {
  const storeys = Math.max(1, Math.min(3, Math.round(height / STOREY)));
  const list = storeys >= 2 ? SCOT_PRESETS_2 : SCOT_PRESETS_1;
  const preset = list[Math.abs(seed) % list.length];
  const spec = specFromVariant(presetVariant(preset, width, depth));
  spec.storeys = storeys;
  spec.pitch = Math.max(spec.pitch ?? 1, 1.3);
  spec.chimneys = 2;
  spec.gableFront = false;
  if (storeys >= 2) spec.dormers = Math.max(spec.dormers, 2);
  return buildCottage(scene, sl, spec);
}

// ============================================================== Amman: limestone block

const AMMAN_STONE = ["#D4C49A", "#C8B880", "#E0D0A8"];

function buildAmmanLimestone(c: C, width: number, depth: number, height: number) {
  const stone = pick(c, AMMAN_STONE, 1);
  const groove = shade(stone, -0.16);
  const frame = pick(c, ["#4a5a4a", "#5a4a3a", "#3f4a52"], 2);
  const floors = Math.max(2, Math.min(3, Math.round(height / STOREY) + (rnd(c, 3) > 0.7 ? 1 : 0)));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, stone);
  bx(c, bw + 0.08, 0.22, bd + 0.08, c.sl.stone, shade(stone, -0.2), 0, 0, 0);

  // stone courses: horizontal grooves every ~0.7 u + a few proud, re-tinted blocks
  const bodies: Body[] = [b];
  const courses = (v: Body) => {
    for (let y = v.y0 + 0.7; y < v.y0 + v.h - 0.1; y += 0.7) band(c, v, y, 0.025, 0.012, groove);
    for (const f of FACES)
      for (let i = 0; i < 5; i++) {
        const u = (rnd(c, i, f.length, 10) - 0.5) * (faceWidth(v, f) - 0.5);
        const row = Math.floor(rnd(c, i, f.length, 11) * Math.floor(v.h / 0.7));
        faceBox(c, v, f, u, v.y0 + row * 0.7 + 0.04, 0.42, 0.62, 0.012, 0.004, c.sl.stone, shade(stone, (rnd(c, i, 12) - 0.5) * 0.12), 0.9);
      }
  };
  courses(b);

  // ---- arch-top windows (glass rectangle + semicircle, stone surround + keystone)
  const archWindow = (v: Body, f: Face, u: number, y: number, ww: number, wh: number) => {
    faceDisc(c, v, f, u, y + wh, ww + 0.14, 0.02, 0.006, c.sl.paint, shade(stone, 0.12), 14);
    faceBox(c, v, f, u, y - 0.04, ww + 0.14, wh + 0.04, 0.02, 0.006, c.sl.paint, shade(stone, 0.12));
    faceBox(c, v, f, u, y, ww, wh, 0.03, 0.02, c.sl.glass, rnd(c, u, y) > 0.7 ? GLASS_LIGHT : GLASS_DARK);
    faceDisc(c, v, f, u, y + wh, ww, 0.03, 0.02, c.sl.glass, GLASS_DARK, 14);
    faceBox(c, v, f, u, y + wh + ww / 2 - 0.02, 0.08, 0.1, 0.03, 0.02, c.sl.stone, shade(stone, 0.05)); // keystone
    faceBox(c, v, f, u, y - 0.07, ww + 0.16, 0.05, 0.08, 0.03, c.sl.paint, shade(stone, 0.1)); // sill
    // wrought-iron grille on ground floor windows
    if (y - v.y0 < STOREY) for (let k = 1; k < 4; k++) faceBox(c, v, f, u - ww / 2 + (k * ww) / 4, y, 0.015, wh, 0.015, 0.04, c.sl.metal, "#3a3a38");
  };
  const n = Math.max(2, Math.min(4, Math.floor(bw / 0.85)));
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y - 0.05;
    for (const x of slots(bw, n)) {
      if (f === 0 && Math.abs(x) < DOOR_W / 2 + 0.3) continue;
      if (f === 0 && isShop(c)) continue;
      archWindow(b, "front", x, y, 0.4, WINDOW_H - 0.1);
    }
    for (const face of ["east", "west", "back"] as Face[]) {
      const m = Math.max(1, Math.floor(faceWidth(b, face) / 1.1));
      for (const x of slots(faceWidth(b, face), m)) if (rnd(c, f, x, face.length) > 0.35) archWindow(b, face, x, y, 0.36, WINDOW_H - 0.15);
    }
  }
  // arched door with a stone surround
  doorAt(c, b, "front", 0, frame, shade(stone, 0.12));
  faceDisc(c, b, "front", 0, DOOR_H, DOOR_W + 0.12, 0.03, 0.005, c.sl.paint, shade(stone, 0.12), 14);
  faceDisc(c, b, "front", 0, DOOR_H, DOOR_W, 0.05, 0.025, c.sl.wood, frame, 14);
  if (isShop(c)) {
    // rolling-shutter shopfronts either side of the door
    const side = (bw - DOOR_W - 0.4) / 2;
    if (side > 0.3) for (const s of [-1, 1]) faceBox(c, b, "front", s * (DOOR_W / 2 + 0.2 + side / 2), 0.2, side, 1.05, 0.04, 0.02, c.sl.metal, "#9aa0a0");
    faceBox(c, b, "front", 0, 1.35, bw - 0.1, 0.22, 0.05, 0.03, c.sl.paint, pick(c, ["#2f6a4a", "#a0402e", "#2f4a7a"], 9));
  }
  // cornice lip + parapet
  bx(c, bw + 0.1, 0.06, bd + 0.1, c.sl.paint, shade(stone, 0.1), 0, H - 0.06, 0);
  parapet(c, b, stone, 0.18, 0.1);

  // ---- stepped top: a smaller set-back storey on some buildings
  if (rnd(c, 7) > 0.4) {
    const tw = bw * (0.45 + rnd(c, 8) * 0.2);
    const td = bd * 0.55;
    const t: Body = { ox: (rnd(c, 9) - 0.5) * (bw - tw) * 0.8, oz: (bd - td) / 2 - 0.1, hw: tw / 2, hd: td / 2, y0: H, h: STOREY * 0.9 };
    volume(c, t, stone);
    courses(t);
    archWindow(t, "front", 0, H + 0.45, 0.36, WINDOW_H - 0.15);
    parapet(c, t, stone, 0.15, 0.08);
    bodies.push(t);
  }
  // ---- rooftop water tanks (the Amman skyline) + a satellite dish
  const tanks = 1 + Math.floor(rnd(c, 13) * 2);
  for (let i = 0; i < tanks; i++) {
    const x = -bw / 2 + 0.35 + i * 0.45;
    const tank = pick(c, ["#f2f2ee", "#2e2e2e", "#e8e2d0"], 14 + i);
    add(c, tcyl(c.s, 0.3, 0.3, 0.36, c.sl.metal, tank, x, H + 0.08, -bd / 2 + 0.4, 10));
    bx(c, 0.32, 0.08, 0.32, c.sl.metal, "#6a6a66", x, H, -bd / 2 + 0.4);
  }
  if (rnd(c, 15) > 0.5) {
    const dish = add(c, tcyl(c.s, 0.34, 0.1, 0.08, c.sl.metal, "#e6e6e2", 0, 0, 0, 10));
    dish.position.set(bw / 2 - 0.35, H + 0.4, bd / 2 - 0.4);
    dish.rotation.x = -0.7;
    bx(c, 0.03, 0.36, 0.03, c.sl.metal, "#8a8a86", bw / 2 - 0.35, H, bd / 2 - 0.4);
  }
}

// ============================================================== Italy: pastel villa

const ITALY_WALLS = ["#F5EDD5", "#D4A850", "#D48878", "#E8C890"];
const ITALY_SHUTTERS = ["#4f7a52", "#3f7f8f", "#6b8f5a", "#7a4a3a"];

function buildMediterranean(c: C, width: number, depth: number, height: number) {
  const wall = pick(c, ITALY_WALLS, 1);
  const trim = "#f3ead6";
  const shutter = pick(c, ITALY_SHUTTERS, 2);
  const terracotta = "#C0603A";
  const floors = Math.max(2, Math.min(3, Math.round(height / STOREY)));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY + 0.1;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, wall, c.sl.stone, 0.7);
  bx(c, bw + 0.06, 0.3, bd + 0.06, c.sl.stone, shade(wall, -0.2), 0, 0, 0, 0.7);
  // corner pilasters + eaves cornice
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(c, 0.12, H, 0.12, c.sl.paint, trim, (sx * bw) / 2, 0, (sz * bd) / 2);
  band(c, b, H - 0.12, 0.12, 0.06, trim);

  // ---- windows with shutters (thin coloured boxes flanking each window)
  const shuttered = (f: Face, u: number, y: number, ww: number, wh: number) => {
    windowAt(c, b, f, u, y, ww, wh, trim, trim);
    const sw = Math.max(0.08, ww * 0.42);
    for (const s of [-1, 1]) {
      faceBox(c, b, f, u + s * (ww / 2 + 0.04 + sw / 2), y, sw, wh, 0.05, 0.03, c.sl.wood, shutter, 3);
      // louvre lines
      for (let k = 1; k < 4; k++) faceBox(c, b, f, u + s * (ww / 2 + 0.04 + sw / 2), y + (k * wh) / 4, sw - 0.02, 0.012, 0.01, 0.06, c.sl.paint, shade(shutter, -0.2));
    }
  };
  const n = Math.max(1, Math.min(3, Math.floor(bw / 1.15)));
  const xs = n === 1 ? [0] : slots(bw, n);
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y;
    // first floor: French windows onto the balcony
    const wh = f === 1 ? WINDOW_H + 0.35 : WINDOW_H;
    const wy = f === 1 ? f * STOREY + 0.12 : y;
    for (const x of xs) {
      if (f === 0 && (Math.abs(x) < DOOR_W / 2 + 0.35 || isShop(c))) continue;
      shuttered("front", x, wy, WINDOW_W - 0.06, wh);
    }
    for (const face of ["east", "west"] as Face[]) if (rnd(c, f, face.length, 3) > 0.3) shuttered(face, 0, y, WINDOW_W - 0.1, WINDOW_H - 0.05);
    if (rnd(c, f, 4) > 0.3) shuttered("back", 0, y, WINDOW_W - 0.06, WINDOW_H);
  }
  doorAt(c, b, "front", 0, shade(shutter, -0.15), trim);
  faceDisc(c, b, "front", 0, DOOR_H, DOOR_W + 0.12, 0.03, 0.005, c.sl.paint, trim, 12);
  faceDisc(c, b, "front", 0, DOOR_H, DOOR_W, 0.05, 0.025, c.sl.wood, shade(shutter, -0.15), 12);
  if (isShop(c)) shopfront(c, b, pick(c, [terracotta, shutter, "#8a3a3a"], 5), shade(shutter, -0.2));

  // ---- wraparound balcony on the first floor: slab + balusters + rail
  const by = STOREY + 0.08;
  const out = 0.2;
  const slabW = bw + out * 2;
  bx(c, slabW, 0.04, out, c.sl.stone, trim, 0, by - 0.04, -bd / 2 - out / 2, 0.7);
  const sideL = bd * 0.55;
  for (const s of [-1, 1]) bx(c, out, 0.04, sideL, c.sl.stone, trim, s * (bw / 2 + out / 2), by - 0.04, -bd / 2 + sideL / 2, 0.7);
  // console brackets under the slab
  for (const x of [-bw / 2 + 0.2, 0, bw / 2 - 0.2]) bx(c, 0.06, 0.12, out - 0.04, c.sl.paint, trim, x, by - 0.16, -bd / 2 - out / 2);
  const rail = shade(trim, -0.1);
  const railH = 0.32;
  const zf = -bd / 2 - out + 0.03;
  for (let x = -slabW / 2 + 0.04; x <= slabW / 2 - 0.03; x += 0.14) add(c, tcyl(c.s, 0.03, 0.04, railH, c.sl.paint, rail, x, by, zf, 6));
  bx(c, slabW, 0.04, 0.06, c.sl.paint, trim, 0, by + railH, zf);
  for (const s of [-1, 1]) {
    const xr = s * (bw / 2 + out - 0.03);
    for (let z = zf + 0.14; z <= -bd / 2 + sideL; z += 0.14) add(c, tcyl(c.s, 0.03, 0.04, railH, c.sl.paint, rail, xr, by, z, 6));
    bx(c, 0.06, 0.04, sideL + out - 0.03, c.sl.paint, trim, xr, by + railH, -bd / 2 + (sideL - out + 0.03) / 2);
  }
  // terracotta pots on the balcony
  for (let i = 0; i < 2; i++) {
    const x = (i === 0 ? -1 : 1) * (bw / 2 - 0.15);
    add(c, tcyl(c.s, 0.14, 0.1, 0.12, c.sl.paint, "#b8603a", x, by, -bd / 2 - 0.1, 8));
    add(c, tblob(c.s, 0.2, c.sl.foliage, pick(c, ["#6b8a4e", "#d9467e", "#e0b83a"], 20 + i), x, by + 0.18, -bd / 2 - 0.1));
  }

  // ---- low-pitched hipped terracotta roof (~17°) with eaves overhang
  const over = 0.16;
  const rw = bw + over * 2;
  const rd = bd + over * 2;
  const rise = Math.min(rw, rd) / 2 * Math.tan((17 * Math.PI) / 180);
  hipRoof(c, 0, H, 0, rw, rd, rise, c.sl.roofTile, terracotta, 1.1);
  // ridge tiles
  if (rw > rd) bx(c, rw - rd + 0.04, 0.05, 0.08, c.sl.roofTile, shade(terracotta, -0.12), 0, H + rise - 0.02, 0);
  // small chimney with a tiled cap
  const cx = (rnd(c, 6) - 0.5) * bw * 0.5;
  bx(c, 0.24, rise + 0.35, 0.24, c.sl.stone, wall, cx, H, bd * 0.15, 0.7);
  bx(c, 0.34, 0.05, 0.34, c.sl.roofTile, terracotta, cx, H + rise + 0.35, bd * 0.15);
}

// ============================================================== Greece: Santorini cubist

const CYCLADIC_WHITE = ["#FAFAF8", "#F5F4F0"];
const AEGEAN_BLUE = ["#2f64b0", "#1f5aa6", "#3a78c0"];

/** A whitewashed volume with rounded vertical edges (two boxes + 4 corner cylinders). */
function roundedVolume(c: C, b: Body, hex: string, r = 0.14) {
  const w = b.hw * 2;
  const d = b.hd * 2;
  const m = c.sl.stone;
  bx(c, w, b.h, d - r * 2, m, hex, b.ox, b.y0, b.oz, 0.5);
  bx(c, w - r * 2, b.h, d, m, hex, b.ox, b.y0, b.oz, 0.5);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(c, tcyl(c.s, r * 2, r * 2, b.h, m, hex, b.ox + sx * (b.hw - r), b.y0, b.oz + sz * (b.hd - r), 8));
  // soft roof edge: a slightly rounded lip (low parapet) around the flat terrace
  const lip = 0.12;
  const y = b.y0 + b.h;
  bx(c, w - r * 2, lip, 0.08, m, hex, b.ox, y, b.oz - b.hd + 0.04);
  bx(c, w - r * 2, lip, 0.08, m, hex, b.ox, y, b.oz + b.hd - 0.04);
  bx(c, 0.08, lip, d - r * 2, m, hex, b.ox - b.hw + 0.04, y, b.oz);
  bx(c, 0.08, lip, d - r * 2, m, hex, b.ox + b.hw - 0.04, y, b.oz);
  bx(c, w - 0.16, 0.01, d - 0.16, c.sl.paint, "#ebe8e0", b.ox, y, b.oz);
}

function buildSantoriniCubist(c: C, width: number, depth: number, height: number) {
  const white = pick(c, CYCLADIC_WHITE, 1);
  const blue = pick(c, AEGEAN_BLUE, 2);
  const floors = Math.max(1, Math.min(2, Math.round(height / STOREY)));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;

  // ---- stepped cubes: the ground cube (behind a shallow front terrace), then a
  // smaller set-back cube (→ roof terrace)
  const TER = 0.3;
  const g: Body = { ox: 0, oz: TER / 2, hw: bw / 2, hd: (bd - TER) / 2, y0: 0, h: STOREY * 0.95 };
  const upperSide = rnd(c, 4) > 0.5 ? 1 : -1;
  const stairs = bw >= 2.4;
  roundedVolume(c, g, white);
  const bodies: Body[] = [g];
  if (floors >= 2 || rnd(c, 3) > 0.5) {
    const side = upperSide;
    const uw = bw * (0.5 + rnd(c, 5) * 0.2);
    const ud = bd * (0.55 + rnd(c, 6) * 0.2);
    const u: Body = { ox: side * (bw - uw) / 2, oz: (bd - ud) / 2, hw: uw / 2, hd: ud / 2, y0: g.h, h: STOREY * 0.9 };
    roundedVolume(c, u, white);
    bodies.push(u);
    // arched blue door on the upper cube + small window
    const ud0: Body = u;
    faceBox(c, ud0, "front", 0, u.y0, 0.48, 0.9, 0.04, 0.02, c.sl.wood, blue, 2);
    faceDisc(c, ud0, "front", 0, u.y0 + 0.9, 0.48, 0.04, 0.02, c.sl.wood, blue, 12);
    if (uw > 1.5) windowAt(c, u, "front", side * (uw / 2 - 0.3), u.y0 + 0.45, 0.3, 0.36, blue, null);
    // a third tiny cube on some roofs
    if (rnd(c, 7) > 0.65) {
      const t: Body = { ox: u.ox + side * (uw * 0.2), oz: u.oz + ud * 0.2, hw: uw * 0.25, hd: ud * 0.25, y0: u.y0 + u.h, h: 0.7 };
      roundedVolume(c, t, white, 0.1);
      bodies.push(t);
    }
  }

  // ---- ground floor: arched blue door, blue-framed windows, blue shutters
  doorAt(c, g, "front", 0, blue, white, 0.01, DOOR_W, DOOR_H - 0.2);
  faceDisc(c, g, "front", 0, DOOR_H - 0.2, DOOR_W + 0.14, 0.03, 0.006, c.sl.paint, "#e8e6e0", 14);
  faceDisc(c, g, "front", 0, DOOR_H - 0.2, DOOR_W, 0.05, 0.035, c.sl.wood, blue, 14);
  const side = bw / 2 - DOOR_W / 2 - 0.2;
  if (side > 0.45)
    for (const s of [-1, 1]) {
      if (stairs && s === -upperSide) continue;
      const u = s * (DOOR_W / 2 + 0.2 + side / 2);
      windowAt(c, g, "front", u, 0.5, 0.34, 0.44, blue, null);
      faceDisc(c, g, "front", u, 0.94, 0.34, 0.03, 0.02, c.sl.glass, GLASS_DARK, 12);
    }
  for (const face of ["east", "west"] as Face[]) if (rnd(c, face.length, 8) > 0.3) windowAt(c, g, face, 0, 0.5, 0.3, 0.4, blue, null);
  if (isShop(c)) faceBox(c, g, "front", 0, DOOR_H - 0.05, bw * 0.7, 0.16, 0.04, 0.02, c.sl.paint, blue);

  // ---- front terrace: low wall with a gap at the door; on wider houses an
  // outside stair climbs along the façade to the roof terrace (stepping, hillside style)
  const gapHalf = DOOR_W / 2 + 0.12;
  const seg = bw / 2 - gapHalf;
  for (const s of [-1, 1]) {
    if (stairs && s === -upperSide) continue;
    bx(c, seg, 0.3, 0.08, c.sl.stone, white, s * (gapHalf + seg / 2), 0, -bd / 2 + 0.04, 0.5);
  }
  if (stairs) {
    const steps = 6;
    const run = seg / steps;
    for (let i = 0; i < steps; i++) {
      const x = -upperSide * (gapHalf + run * (i + 0.5));
      bx(c, run, ((i + 1) * g.h) / steps, TER, c.sl.stone, white, x, 0, -bd / 2 + TER / 2, 0.5);
    }
    bx(c, seg, 0.28, 0.05, c.sl.stone, white, -upperSide * (gapHalf + seg / 2), g.h, -bd / 2 + 0.025, 0.5);
  }
  if (rnd(c, 9) > 0.4) add(c, tblob(c.s, 0.5, c.sl.foliage, "#c2408a", (rnd(c, 10) > 0.5 ? 1 : -1) * (bw / 2 - 0.25), 0.4, -bd / 2 + 0.05, 0.7));

  // ---- blue dome (on a drum) on some buildings, else a little bell-gable wall
  const top = bodies[bodies.length - 1];
  if (rnd(c, 11) > 0.55) {
    const dr = Math.min(top.hw, top.hd) * 1.1;
    const y = top.y0 + top.h;
    add(c, tcyl(c.s, dr, dr, 0.18, c.sl.stone, white, top.ox, y, top.oz, 16));
    add(c, tblob(c.s, dr, c.sl.paint, blue, top.ox, y + 0.18, top.oz, 0.95, 12));
    add(c, tcyl(c.s, 0.04, 0.06, 0.25, c.sl.paint, white, top.ox, y + 0.18 + dr * 0.45, top.oz, 6));
  } else if (rnd(c, 12) > 0.5) {
    const y = top.y0 + top.h;
    bx(c, 0.5, 0.45, 0.1, c.sl.stone, white, top.ox, y, top.oz - top.hd + 0.05, 0.5);
    faceDisc(c, top, "front", 0, y + 0.45, 0.5, 0.1, -0.05, c.sl.stone, white, 12);
  }
}

// ============================================================== generic fallback

function buildGeneric(c: C, width: number, depth: number, height: number) {
  const wall = "#e2d8c4";
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: Math.max(STOREY, height) };
  volume(c, b, wall);
  doorAt(c, b, "front", 0, "#6b4a33", "#f0ead8");
  gableRoof(c, 0, b.h, 0, bw + 0.3, bd + 0.3, bd * 0.35, c.sl.slate, "#6a7078", wall);
}

// ============================================================== materials

/** Pure-StandardMaterial slots (hero/NullEngine path): the olw_* kit slots + an alpha glass skin. */
function defaultSlots(scene: Scene): RegionalSlots {
  const base = heroSlots(scene);
  let skin = scene.getMaterialByName("olw_glass_skin") as StandardMaterial | null;
  if (!skin) {
    skin = new StandardMaterial("olw_glass_skin", scene);
    skin.diffuseColor = Color3.FromHexString("#ffffff");
    skin.specularColor = Color3.FromHexString("#8a9aa4");
    skin.alpha = 0.55;
  }
  return { ...base, glassSkin: skin };
}
