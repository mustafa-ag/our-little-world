// Regional building geometry. Every region gets its own architectural SHAPE
// language (different silhouettes, massing and proportions, not just a
// different wall colour). Regions and their variants (BUILDING_VARIANTS):
//
//   gulf           tower   Dubai glass tower: wide podium, tall curtain-wall shaft,
//                          tapered / stepped crown with a spire
//                  villa   L-shaped beige stucco villa: one-storey front range, a
//                          taller side wing, arched entrance portal, walled garden
//                  mall    wide low block set back behind a forecourt, barrel-vault
//                          glass skylight + barrel glass entrance canopy
//   levant         apartment  Amman limestone block: groove courses, arch-top
//                          windows, projecting bay, stepped set-back top, tanks
//                  house   one-storey courtyard house: four ranges round an open
//                          court (fountain + tree), small domed room on the roof
//                  shop    narrow two-storey shop units with big arched openings,
//                          arched upper windows and uneven parapets
//   mediterranean  cubist  Santorini: rounded whitewashed cubes stacked and set at
//                          angles, blue arched doors, blue dome
//                  terrace cascading levels stepping up the (virtual) slope,
//                          each roof a terrace (railings, pergola, pots)
//                  church  small chapel: nave (barrel vault / hipped roof), drum +
//                          dome with a cross, bell-gable or campanile
//                  villa   Italian pastel villa: hipped terracotta roof, shutters,
//                          wraparound balcony
//   scotland       tenement  four-storey grey stone tenement: canted bays, steep
//                          slate roof with dormers, gable chimney stacks
//                  cottage the hand-tuned cottage kit (Edinburgh presets)
//   london         terrace three-storey red-brick terrace: white sashes, bay, cornice,
//                          parapet, black iron area railings, chimney pots
//                  pub     two-storey corner pub: painted timber front, signage
//                          frieze with gilt lettering, hanging sign on a bracket
//   default        box     simple stylised flat-roof box
//
// Contract (same as the cottage kit): built at the origin, footprint centred on
// (0,0), base at y = 0, front door at x = 0 facing -Z, everything (bar small
// overhangs: signs, canopies) inside the w×d tile footprint. Parts are
// vertex-tinted against the shared kit material slots (plain StandardMaterials
// by default, see defaultSlots) and merged into ONE multi-material mesh so the
// world builder can thin-instance identical variants in a single draw call.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { hash01, merge, parseVariant } from "../assets/kit/util";
import { Surface, shade, tblob, tbox, tcyl, type V3 } from "../assets/kit/architecture/geom";
import { heroSlots, type Slots } from "../assets/kit/architecture/slots";
import { buildCottage } from "../assets/kit/architecture/cottage";
import { specFromVariant, presetVariant } from "../assets/kit/architecture/presets";
import { DOOR_H, DOOR_W, SILL_Y, STOREY, WINDOW_H, WINDOW_W } from "./scale";
import type { RegionKind, WorldArtProfile } from "./artProfile";

// ============================================================== public API

/** Kit slots plus the semi-transparent curtain-wall glass. */
export interface RegionalSlots extends Slots {
  glassSkin: Material;
}

/** Architectural family a location's buildings are drawn from. */
export type BuildingRegion = "gulf" | "levant" | "mediterranean" | "scotland" | "london" | "default";

/** Ground-floor use: shops / cafés get a glazed or arched shopfront + signage. */
export type RegionalKind = "house" | "shop" | "cafe" | "tenement";

/** Every building shape available per region (first entry = the region's default). */
export const BUILDING_VARIANTS = {
  gulf: ["tower", "villa", "mall"],
  levant: ["apartment", "house", "shop"],
  mediterranean: ["cubist", "terrace", "church", "villa"],
  scotland: ["tenement", "cottage"],
  london: ["terrace", "pub"],
  default: ["box"],
} as const satisfies Record<BuildingRegion, readonly string[]>;

export type BuildingVariantName = (typeof BUILDING_VARIANTS)[BuildingRegion][number];

export interface BuildingParams {
  /** footprint across the front (tiles / world units) */
  width: number;
  /** footprint front-to-back */
  depth: number;
  /** nominal wall height (used when `floors` is 0) */
  height: number;
  /** storeys (some shapes clamp this to their own range, e.g. tenements are 4) */
  floors: number;
  /** one of BUILDING_VARIANTS[region]; picked from kind / floors / seed when absent or unknown */
  variant?: string;
  /** ground-floor use (default "house") */
  kind?: RegionalKind;
  /** any integer: palette + optional features are picked deterministically from it */
  seed?: number;
}

/** Which architectural family a region builds. */
export function buildingRegionFor(region: RegionKind): BuildingRegion {
  switch (region) {
    case "uae_modern":
    case "uae_coastal":
      return "gulf";
    case "amman":
      return "levant";
    case "italy":
    case "greece":
      return "mediterranean";
    case "scotland":
      return "scotland";
    case "london":
      return "london";
    default:
      return "default";
  }
}

/** Mediterranean palette: Italian pastels + terracotta, or Cycladic white + blue. */
type Palette = "it" | "gr";
const paletteFor = (region: RegionKind): Palette => (region === "greece" ? "gr" : "it");

function isVariantOf(region: BuildingRegion, v: string | undefined): v is BuildingVariantName {
  return !!v && (BUILDING_VARIANTS[region] as readonly string[]).includes(v);
}

type ProfileLike = Pick<WorldArtProfile, "region" | "roofStyle">;

/**
 * Pick a building shape for a region. `prefer` (e.g. "pub" for a pub texture)
 * wins when the region has it; otherwise the choice follows the ground-floor
 * use, storey count, width and a 0..3 seed bucket so neighbours differ.
 */
export function chooseRegionalVariant(profile: ProfileLike, kind: RegionalKind, floors: number, width: number, seed: number, prefer?: string): BuildingVariantName {
  const region = buildingRegionFor(profile.region);
  if (isVariantOf(region, prefer)) return prefer;
  const v = Math.abs(Math.floor(seed)) % 4;
  const shop = kind === "shop" || kind === "cafe";
  switch (region) {
    case "gulf": {
      if (shop) return width >= 3 ? "mall" : "villa";
      if (kind === "tenement") return "tower";
      // Dubai (glass roof profile): mostly towers, the odd villa at their feet
      if (profile.roofStyle === "glass" && floors >= 2) return v === 3 ? "villa" : "tower";
      return "villa";
    }
    case "levant":
      if (shop) return "shop";
      if (kind === "tenement") return "apartment";
      if (floors >= 2) return v === 3 ? "house" : "apartment";
      return v === 3 ? "apartment" : "house";
    case "mediterranean": {
      const greek = profile.region === "greece";
      if (kind === "house" && v === 3 && width >= 3 && (greek || floors <= 1)) return "church";
      if (kind === "tenement" || v === 2) return "terrace";
      return greek ? "cubist" : "villa";
    }
    case "scotland":
      return kind === "tenement" || floors >= 3 ? "tenement" : "cottage";
    case "london":
      return shop && v % 2 === 0 ? "pub" : "terrace";
    default:
      return "box";
  }
}

const clampFloors = (n: number) => Math.max(1, Math.min(4, Math.round(n) || 1));

/**
 * Variant string for the "building" kit piece
 * ("rg=levant,t=house,pal=-,w=3,d=3,f=1,k=house,v=1"), or null when the
 * region keeps the cottage kit (Germany; Edinburgh's non-tenement presets).
 * `v` is a 0..3 look bucket so batches stay small while neighbours differ.
 */
export function regionalVariantFor(profile: ProfileLike, w: number, d: number, storeys: number, kind: RegionalKind, seed: number, prefer?: string): string | null {
  const region = buildingRegionFor(profile.region);
  if (region === "default") return null;
  const t = chooseRegionalVariant(profile, kind, storeys, w, seed, prefer);
  if (t === "cottage") return null;
  const pal = region === "mediterranean" ? paletteFor(profile.region) : "-";
  return `rg=${region},t=${t},pal=${pal},w=${w},d=${d},f=${clampFloors(storeys)},k=${kind},v=${Math.abs(Math.floor(seed)) % 4}`;
}

/** True for "rg=…" regional variants (their door is always centred: local x = 0). */
export function isRegionalVariant(variant: string) {
  return variant.includes("rg=");
}

const KINDS: RegionalKind[] = ["house", "shop", "cafe", "tenement"];

/** Build from an "rg=…" variant string (runtime factory entry point). */
export function buildRegionalFromVariant(scene: Scene, slots: RegionalSlots, variant: string): Mesh {
  const v = parseVariant(variant);
  const region: BuildingRegion = v.rg && v.rg in BUILDING_VARIANTS ? (v.rg as BuildingRegion) : "default";
  const w = Math.max(2, parseFloat(v.w ?? "3") || 3);
  const d = Math.max(2, parseFloat(v.d ?? "3") || 3);
  const f = clampFloors(parseInt(v.f ?? "2", 10));
  const kind = KINDS.find((k) => k === v.k) ?? "house";
  const seed = parseInt(v.v ?? "0", 10) || 0;
  return buildForRegion(scene, slots, region, v.t, v.pal === "gr" ? "gr" : "it", { width: w, depth: d, height: f * STOREY + 0.2, floors: f, kind, seed });
}

/**
 * Architecturally distinct building for the profile's region. Returns ONE
 * merged multi-material mesh (child parts are baked in), footprint centred on
 * the origin, base at y = 0, door at x = 0 facing -Z.
 */
export function buildRegionalBuilding(scene: Scene, params: BuildingParams, profile: ProfileLike, slots?: RegionalSlots): Mesh {
  const region = buildingRegionFor(profile.region);
  const kind = params.kind ?? "house";
  const floors = params.floors > 0 ? params.floors : Math.round(params.height / STOREY);
  const variant = isVariantOf(region, params.variant) ? params.variant : chooseRegionalVariant(profile, kind, floors, params.width, params.seed ?? 0);
  return buildForRegion(scene, slots ?? defaultSlots(scene), region, variant, paletteFor(profile.region), { ...params, floors, kind });
}

function buildForRegion(scene: Scene, sl: RegionalSlots, region: BuildingRegion, variant: string | undefined, pal: Palette, p: BuildingParams): Mesh {
  const { width, depth } = p;
  const kind = p.kind ?? "house";
  const seed = p.seed ?? 0;
  const floors = Math.max(1, Math.min(6, Math.round(p.floors > 0 ? p.floors : p.height / STOREY) || 1));
  const t: BuildingVariantName = isVariantOf(region, variant) ? variant : BUILDING_VARIANTS[region][0];
  if (t === "cottage") return buildScottishBuilding(scene, sl, width, depth, floors * STOREY, seed);
  const c: C = { s: scene, sl, parts: [], seed: seed * 7919 + width * 31 + depth * 17 + floors * 5, kind, floors, pal };
  switch (t) {
    case "tower":
      buildGlassTower(c, width, depth);
      break;
    case "villa":
      if (region === "gulf") buildGulfVilla(c, width, depth);
      else buildItalianVilla(c, width, depth);
      break;
    case "mall":
      buildGulfMall(c, width, depth);
      break;
    case "apartment":
      buildAmmanApartment(c, width, depth);
      break;
    case "house":
      buildLevantHouse(c, width, depth);
      break;
    case "shop":
      buildLevantShop(c, width, depth);
      break;
    case "cubist":
      buildSantoriniCubist(c, width, depth);
      break;
    case "terrace":
      if (region === "london") buildLondonTerrace(c, width, depth);
      else buildMedTerrace(c, width, depth);
      break;
    case "church":
      buildChapel(c, width, depth);
      break;
    case "tenement":
      buildScottishTenement(c, width, depth);
      break;
    case "pub":
      buildLondonPub(c, width, depth);
      break;
    default:
      buildBox(c, width, depth);
  }
  return merge("building", c.parts);
}

// ============================================================== shared bits

/** wall inset from the tile footprint (same as the cottage kit: eaves stay inside the tile) */
const INSET = 0.22;
const GLASS_DARK = "#6f8590";
const GLASS_LIGHT = "#c3d0d4";
const GLASS_WARM = "#e2c893";
const IRON = "#1c1c1e";

interface C {
  s: Scene;
  sl: RegionalSlots;
  parts: Mesh[];
  seed: number;
  kind: RegionalKind;
  floors: number;
  pal: Palette;
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
const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

const rnd = (c: C, ...n: number[]) => hash01(c.seed, ...n);
const pick = <T>(c: C, list: readonly T[], salt: number) => list[Math.floor(rnd(c, salt) * list.length) % list.length];
const isShop = (c: C) => c.kind === "shop" || c.kind === "cafe";
const sideOf = (c: C, salt: number) => (rnd(c, salt) > 0.5 ? 1 : -1);

function add(c: C, m: Mesh) {
  c.parts.push(m);
  return m;
}
function bx(c: C, w: number, h: number, d: number, mat: Material, hex: string, x: number, y: number, z: number, uv?: number) {
  return add(c, tbox(c.s, w, h, d, mat, hex, x, y, z, uv));
}

/** Width of a face. */
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

/** Flat-roof parapet: four low walls around the top (+ a roof deck unless `deck` is false). */
function parapet(c: C, b: Body, hex: string, rise = 0.15, t = 0.08, mat: Material = c.sl.stone, deck = true) {
  const y = b.y0 + b.h;
  const w = b.hw * 2;
  const d = b.hd * 2;
  bx(c, w, rise, t, mat, hex, b.ox, y, b.oz - b.hd + t / 2);
  bx(c, w, rise, t, mat, hex, b.ox, y, b.oz + b.hd - t / 2);
  bx(c, t, rise, d - t * 2, mat, hex, b.ox - b.hw + t / 2, y, b.oz);
  bx(c, t, rise, d - t * 2, mat, hex, b.ox + b.hw - t / 2, y, b.oz);
  // roof deck (slightly lower tone) so the top never reads as a solid block
  if (deck) bx(c, w - t * 2, 0.01, d - t * 2, c.sl.paint, shade(hex, -0.12), b.ox, y, b.oz);
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
    const l = g0 - -w / 2;
    const r = w / 2 - g1;
    if (l > 0.01) bx(c, l, h, proud, m, hex, b.ox - w / 2 + l / 2, y, b.oz - b.hd - proud / 2);
    if (r > 0.01) bx(c, r, h, proud, m, hex, b.ox + g1 + r / 2, y, b.oz - b.hd - proud / 2);
  }
}

/** Plain window: frame + glass (+ optional sill). Base y = sill line.
 *  `frameOut` = how far the frame centre protrudes from the wall surface (default 0.005).
 *  Raising it (e.g. 0.15 for Gulf reveals) makes a raised surround so the glass reads as recessed. */
function windowAt(c: C, b: Body, f: Face, u: number, y: number, ww: number, wh: number, frameHex: string, sillHex: string | null, glassHex?: string, frameOut = 0.005) {
  faceBox(c, b, f, u, y - 0.03, ww + 0.08, wh + 0.06, 0.03, frameOut, c.sl.paint, frameHex);
  faceBox(c, b, f, u, y, ww, wh, 0.03, frameOut + 0.015, c.sl.glass, glassHex ?? (rnd(c, u, y, f.length) > 0.7 ? GLASS_LIGHT : GLASS_DARK));
  if (sillHex) faceBox(c, b, f, u, y - 0.07, ww + 0.14, 0.06, 0.1, Math.max(0.04, frameOut - 0.001), c.sl.paint, sillHex);
}

/** White sash window: frame, glass, meeting rail and glazing bar, sill. */
function sashAt(c: C, b: Body, f: Face, u: number, y: number, ww: number, wh: number, sillHex: string) {
  windowAt(c, b, f, u, y, ww, wh, "#f2efe8", sillHex);
  faceBox(c, b, f, u, y + wh / 2 - 0.015, ww, 0.03, 0.02, 0.035, c.sl.paint, "#f2efe8");
  faceBox(c, b, f, u, y, 0.02, wh, 0.02, 0.035, c.sl.paint, "#f2efe8");
}

/** Arch-top window (glass rectangle + semicircle, surround + keystone + sill, optional iron grille). */
function archWindow(c: C, v: Body, f: Face, u: number, y: number, ww: number, wh: number, stone: string, grille: boolean) {
  faceDisc(c, v, f, u, y + wh, ww + 0.14, 0.02, 0.006, c.sl.paint, shade(stone, 0.12), 14);
  faceBox(c, v, f, u, y - 0.04, ww + 0.14, wh + 0.04, 0.02, 0.006, c.sl.paint, shade(stone, 0.12));
  faceBox(c, v, f, u, y, ww, wh, 0.03, 0.02, c.sl.glass, rnd(c, u, y) > 0.7 ? GLASS_LIGHT : GLASS_DARK);
  faceDisc(c, v, f, u, y + wh, ww, 0.03, 0.02, c.sl.glass, GLASS_DARK, 14);
  faceBox(c, v, f, u, y + wh + ww / 2 - 0.02, 0.08, 0.1, 0.03, 0.02, c.sl.stone, shade(stone, 0.05)); // keystone
  faceBox(c, v, f, u, y - 0.07, ww + 0.16, 0.05, 0.08, 0.03, c.sl.paint, shade(stone, 0.1)); // sill
  if (grille) for (let k = 1; k < 4; k++) faceBox(c, v, f, u - ww / 2 + (k * ww) / 4, y, 0.015, wh, 0.015, 0.04, c.sl.metal, "#3a3a38");
}

/** Door (+ frame) centred at u on a face. */
function doorAt(c: C, b: Body, f: Face, u: number, doorHex: string, frameHex: string, out = 0, w = DOOR_W, h = DOOR_H) {
  faceBox(c, b, f, u, b.y0, w + 0.12, h + 0.08, 0.03, out + 0.005, c.sl.paint, frameHex);
  faceBox(c, b, f, u, b.y0, w, h, 0.05, out + 0.025, c.sl.wood, doorHex, 2);
  faceBox(c, b, f, u + w * 0.3, b.y0 + h * 0.48, 0.04, 0.04, 0.03, out + 0.06, c.sl.metal, "#c8b070");
}

/** Door with a round-arched head (surround disc + door-leaf disc). */
function archedDoor(c: C, b: Body, doorHex: string, surroundHex: string) {
  doorAt(c, b, "front", 0, doorHex, surroundHex);
  faceDisc(c, b, "front", 0, b.y0 + DOOR_H, DOOR_W + 0.12, 0.03, 0.005, c.sl.paint, surroundHex, 14);
  faceDisc(c, b, "front", 0, b.y0 + DOOR_H, DOOR_W, 0.05, 0.025, c.sl.wood, doorHex, 14);
}

/** Glazed shopfront + fascia across the ground floor front (door stays at u = 0). */
function shopfront(c: C, b: Body, fasciaHex: string, frameHex: string) {
  const w = b.hw * 2;
  const side = (w - DOOR_W - 0.3) / 2;
  if (side > 0.25)
    for (const s of [-1, 1]) {
      const u = s * (DOOR_W / 2 + 0.1 + side / 2);
      faceBox(c, b, "front", u, b.y0 + 0.28, side + 0.06, 1.05, 0.03, 0.005, c.sl.paint, frameHex);
      faceBox(c, b, "front", u, b.y0 + 0.31, side, 0.99, 0.03, 0.02, c.sl.glass, GLASS_WARM);
      faceBox(c, b, "front", u, b.y0, side + 0.06, 0.28, 0.06, 0.03, c.sl.paint, shade(frameHex, -0.15));
    }
  faceBox(c, b, "front", 0, b.y0 + 1.42, w - 0.04, 0.24, 0.06, 0.03, c.sl.paint, fasciaHex);
  if (c.kind === "cafe") awning(c, b.ox, b.y0 + 1.32, b.oz - b.hd, w - 0.1, shade(fasciaHex, 0.1));
}

/** Sloped canvas awning hung on a front wall at height y (front plane z = zWall). */
function awning(c: C, x: number, y: number, zWall: number, w: number, hex: string) {
  const a = add(c, tbox(c.s, w, 0.03, 0.5, c.sl.paint, hex, 0, 0, 0));
  a.position.set(x, y, zWall - 0.22);
  a.rotation.x = -0.35;
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

/** Square frustum (tapered tower crown, pyramid caps). */
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

// ---- curved pieces: half-cylinder vaults and arch rings (axis = the extrusion direction)

type Axis = "x" | "z";
/** Point on an upright semicircle of radius r (angle a: 0 → π over the top), t along the axis. */
const arcP = (axis: Axis, cx: number, cy: number, cz: number, r: number, a: number, t: number): V3 =>
  axis === "z" ? [cx + r * Math.cos(a), cy + r * Math.sin(a), cz + t] : [cx + t, cy + r * Math.sin(a), cz + r * Math.cos(a)];
const arcN = (axis: Axis, a: number, s: number): V3 => (axis === "z" ? [s * Math.cos(a), s * Math.sin(a), 0] : [0, s * Math.sin(a), s * Math.cos(a)]);
const axisN = (axis: Axis, s: number): V3 => (axis === "z" ? [0, 0, s] : [s, 0, 0]);

/** Barrel vault: a half cylinder (springing at cy) with half-disc end caps. */
function barrel(c: C, mat: Material, hex: string, axis: Axis, cx: number, cy: number, cz: number, r: number, length: number, seg = 10) {
  const s = new Surface(c.s, mat);
  const h = length / 2;
  const P = (rr: number, a: number, t: number) => arcP(axis, cx, cy, cz, rr, a, t);
  for (let i = 0; i < seg; i++) {
    const a0 = (Math.PI * i) / seg;
    const a1 = (Math.PI * (i + 1)) / seg;
    s.quad(P(r, a0, -h), P(r, a1, -h), P(r, a1, h), P(r, a0, h), arcN(axis, (a0 + a1) / 2, 1), hex);
    s.tri(P(0, 0, -h), P(r, a0, -h), P(r, a1, -h), axisN(axis, -1), shade(hex, -0.06));
    s.tri(P(0, 0, h), P(r, a0, h), P(r, a1, h), axisN(axis, 1), shade(hex, -0.06));
  }
  add(c, s.bake("vault"));
}

/** Semicircular arch ring (rIn → rOut), extruded `length` along the axis, springing at cy. */
function archRing(c: C, mat: Material, hex: string, axis: Axis, cx: number, cy: number, cz: number, rIn: number, rOut: number, length: number, seg = 10) {
  const s = new Surface(c.s, mat);
  const h = length / 2;
  const P = (rr: number, a: number, t: number) => arcP(axis, cx, cy, cz, rr, a, t);
  for (let i = 0; i < seg; i++) {
    const a0 = (Math.PI * i) / seg;
    const a1 = (Math.PI * (i + 1)) / seg;
    const am = (a0 + a1) / 2;
    s.quad(P(rIn, a0, -h), P(rOut, a0, -h), P(rOut, a1, -h), P(rIn, a1, -h), axisN(axis, -1), hex);
    s.quad(P(rIn, a0, h), P(rOut, a0, h), P(rOut, a1, h), P(rIn, a1, h), axisN(axis, 1), hex);
    s.quad(P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h), arcN(axis, am, 1), hex);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h), arcN(axis, am, -1), shade(hex, -0.12));
  }
  add(c, s.bake("arch"));
}

/** Free-standing round-arched gateway facing -Z: two piers + arch ring (+ flat coping on the crown). */
function archGateway(c: C, x: number, z: number, span: number, spring: number, thick: number, depth: number, hex: string) {
  const rIn = span / 2;
  const rOut = rIn + thick;
  for (const s of [-1, 1]) bx(c, thick, spring, depth, c.sl.stone, hex, x + s * (rIn + thick / 2), 0, z, 0.9);
  archRing(c, c.sl.stone, hex, "z", x, spring, z, rIn, rOut, depth, 12);
  bx(c, rOut * 2 + 0.08, 0.07, depth + 0.06, c.sl.paint, shade(hex, -0.1), x, spring + rOut - 0.02, z);
}

/** Simple palm: slim trunk + a flat crown of fronds. */
function palm(c: C, x: number, y: number, z: number, h: number) {
  add(c, tcyl(c.s, 0.07, 0.12, h, c.sl.wood, "#8a6a44", x, y, z, 6));
  add(c, tblob(c.s, 0.95, c.sl.foliage, "#5f8a3e", x, y + h, z, 0.32, 6));
  add(c, tblob(c.s, 0.5, c.sl.foliage, "#6e9a48", x, y + h + 0.08, z, 0.5, 4));
}

/** Latin cross (base at y). */
function cross(c: C, x: number, y: number, z: number, s: number, hex: string) {
  bx(c, 0.05 * s, 0.5 * s, 0.05 * s, c.sl.metal, hex, x, y, z);
  bx(c, 0.28 * s, 0.05 * s, 0.05 * s, c.sl.metal, hex, x, y + 0.3 * s, z);
}

/** Rooftop water tank on a stand (Levant skyline). */
function waterTank(c: C, x: number, y: number, z: number, hex: string) {
  add(c, tcyl(c.s, 0.3, 0.3, 0.36, c.sl.metal, hex, x, y + 0.08, z, 10));
  bx(c, 0.32, 0.08, 0.32, c.sl.metal, "#6a6a66", x, y, z);
}

// ============================================================== Gulf: L-shaped villa

const GULF_WALLS = ["#f5eed8", "#EFE4CC", "#F0E8D0"];

function buildGulfVilla(c: C, width: number, depth: number) {
  const wall = pick(c, GULF_WALLS, 1);
  const trim = shade(wall, -0.14);
  const frame = pick(c, ["#6b5a44", "#3f4a52", "#8a6a44"], 2);
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const side = sideOf(c, 3);
  const wingFloors = isShop(c) ? 1 : Math.max(2, Math.min(3, c.floors));

  // ---- the L: a one-storey front range across the full width + a taller wing
  // running the full depth down one side (garden in the other back corner)
  const fd = bd * 0.55;
  const front: Body = { ox: 0, oz: -bd / 2 + fd / 2, hw: bw / 2, hd: fd / 2, y0: 0, h: STOREY };
  const ww = Math.max(0.6, bw * 0.36);
  const wing: Body = { ox: (side * (bw - ww)) / 2, oz: -0.02, hw: ww / 2, hd: bd / 2 + 0.02, y0: 0, h: isShop(c) ? STOREY * 1.35 : STOREY * wingFloors };
  volume(c, front, wall);
  volume(c, wing, wall);
  const gap: [number, number] = [-0.5, 0.5];
  for (const b of [front, wing]) {
    for (let y = b.y0 + 0.9; y < b.y0 + b.h - 0.2; y += 0.9) band(c, b, y, 0.04, 0.025, trim, b === front ? gap : undefined);
    parapet(c, b, shade(wall, -0.05), 0.25, 0.08);
    bx(c, b.hw * 2 + 0.06, 0.04, b.hd * 2 + 0.06, c.sl.paint, trim, b.ox, b.y0 + b.h - 0.04, b.oz);
  }
  bx(c, bw + 0.06, 0.16, bd + 0.06, c.sl.stone, shade(wall, -0.22), 0, 0, 0); // plinth

  // ---- arched entrance portal standing proud of the front range (rises above its parapet)
  const span = DOOR_W + 0.3;
  archGateway(c, 0, -bd / 2 - 0.13, span, DOOR_H - 0.1, 0.14, 0.26, shade(wall, 0.06));
  doorAt(c, front, "front", 0, frame, trim, 0, DOOR_W + 0.1);
  faceDisc(c, front, "front", 0, DOOR_H, DOOR_W, 0.03, 0.02, c.sl.glass, GLASS_LIGHT, 14); // fanlight
  bx(c, span + 0.3, 0.06, 0.4, c.sl.stone, shade(wall, -0.1), 0, 0, -bd / 2 - 0.1); // threshold

  // ---- windows: tall on the wing (mashrabiya screen on the top floor), wide on the front range
  const wf = wing.h > STOREY * 1.5 ? wingFloors : 1;
  for (let f = 0; f < wf; f++) {
    const y = f * STOREY + 0.5;
    const top = f === wf - 1 && f > 0;
    if (top) {
      faceBox(c, wing, "front", 0, y - 0.1, Math.min(0.8, ww - 0.2), 0.9, 0.04, 0.03, c.sl.wood, "#8a6a44", 3);
      for (let k = 1; k < 5; k++) faceBox(c, wing, "front", 0, y - 0.1 + k * 0.18, Math.min(0.8, ww - 0.2), 0.02, 0.02, 0.06, c.sl.paint, "#6b5238");
    } else windowAt(c, wing, "front", 0, y, Math.min(0.55, ww - 0.3), 0.8, frame, null, undefined, 0.15);
    windowAt(c, wing, side > 0 ? "east" : "west", 0, y, 0.6, 0.7, frame, null, undefined, 0.15);
    if (rnd(c, f, 9) > 0.4) windowAt(c, wing, "back", 0, y, 0.5, 0.7, frame, null, undefined, 0.15);
  }
  const free0 = span / 2 + 0.2;
  const free1 = bw / 2 - 0.12;
  if (free1 - free0 > 0.55) {
    const u = -side * (free0 + (free1 - free0) / 2);
    if (isShop(c)) {
      faceBox(c, front, "front", u, 0.2, free1 - free0 - 0.1, 1.05, 0.03, 0.02, c.sl.glass, GLASS_WARM);
      faceBox(c, wing, "front", 0, wing.h - 0.45, ww - 0.12, 0.26, 0.05, 0.03, c.sl.paint, pick(c, ["#b08a54", "#5f9aa8", "#8a6a44"], 4));
    } else windowAt(c, front, "front", u, 0.55, Math.min(0.9, free1 - free0 - 0.25), 0.62, frame, null, undefined, 0.15);
  }
  windowAt(c, front, side > 0 ? "west" : "east", 0, 0.55, Math.min(0.6, fd - 0.3), 0.62, frame, null, undefined, 0.15);

  // ---- walled garden in the open back corner of the L, with a palm
  const gx0 = -side * (bw / 2);
  const gx1 = side * (bw / 2 - ww);
  const gz0 = -bd / 2 + fd;
  const gd = bd / 2 - gz0;
  if (gd > 0.3) {
    const gw = Math.abs(gx1 - gx0);
    const gcx = (gx0 + gx1) / 2;
    bx(c, gw, 0.45, 0.08, c.sl.stone, wall, gcx, 0, bd / 2 - 0.04);
    bx(c, 0.08, 0.45, gd, c.sl.stone, wall, gx0 + side * 0.04, 0, gz0 + gd / 2);
    bx(c, gw - 0.1, 0.02, gd - 0.1, c.sl.foliage, "#7f9a4a", gcx, 0, gz0 + gd / 2);
    palm(c, gcx, 0, gz0 + gd / 2, 1.7);
  }
  // rooftop plant on the wing
  bx(c, 0.36, 0.22, 0.28, c.sl.metal, "#c9ccc8", wing.ox, wing.h, wing.oz + wing.hd * 0.4);
}

// ============================================================== Gulf: mall

function buildGulfMall(c: C, width: number, depth: number) {
  const wall = pick(c, ["#E6DCC8", "#EDE3D0", "#D9CDB4"], 1);
  const trim = shade(wall, -0.12);
  const accent = pick(c, ["#b08a54", "#5f9aa8", "#8fa3b0"], 2);
  const metal = "#c8d3da";
  const skin = "#bcd6e0";
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = STOREY * 1.3;
  // the block sits back behind a forecourt that takes the entrance canopy
  const fc = Math.min(0.75, bd * 0.35);
  const b: Body = { ox: 0, oz: fc / 2, hw: bw / 2, hd: (bd - fc) / 2, y0: 0, h: H };
  volume(c, b, wall);
  bx(c, bw + 0.04, 0.02, fc, c.sl.stone, shade(wall, 0.08), 0, 0, -bd / 2 + fc / 2, 0.6); // forecourt paving
  bx(c, bw + 0.06, 0.14, b.hd * 2 + 0.06, c.sl.stone, shade(wall, -0.2), 0, 0, b.oz);

  // ---- glazed street front: shop bays between piers, the middle bay is the entrance
  let bays = Math.max(3, Math.floor(bw / 0.8));
  if (bays % 2 === 0) bays += 1;
  const pw = bw / bays;
  for (const x of slots(bw, bays)) {
    if (Math.abs(x) < pw / 2) continue;
    faceBox(c, b, "front", x, 0.14, pw - 0.14, H * 0.58, 0.03, 0.02, c.sl.glass, GLASS_WARM);
  }
  for (let i = 0; i <= bays; i++) faceBox(c, b, "front", -bw / 2 + i * pw, 0, 0.1, H, 0.08, 0.04, c.sl.paint, trim);
  faceBox(c, b, "front", 0, H * 0.7, bw + 0.04, 0.24, 0.06, 0.05, c.sl.paint, accent); // sign band
  for (const f of ["east", "west"] as Face[]) faceBox(c, b, f, 0, 0.3, faceWidth(b, f) - 0.4, 0.5, 0.03, 0.02, c.sl.glass, GLASS_DARK);
  parapet(c, b, wall, 0.18, 0.1);
  bx(c, bw + 0.1, 0.05, b.hd * 2 + 0.1, c.sl.paint, trim, 0, H - 0.05, b.oz);

  // ---- barrel-vault glass skylight running the length of the roof
  const vr = Math.min(b.hd * 0.6, 0.85);
  const vl = bw * 0.78;
  bx(c, vl + 0.08, 0.1, vr * 2 + 0.08, c.sl.paint, trim, 0, H, b.oz);
  barrel(c, c.sl.glassSkin, skin, "x", 0, H + 0.1, b.oz, vr, vl, 12);
  const ribs = Math.max(2, Math.round(vl / 0.45));
  for (let i = 0; i <= ribs; i++) archRing(c, c.sl.metal, metal, "x", -vl / 2 + (i * vl) / ribs, H + 0.1, b.oz, vr, vr + 0.03, 0.04, 12);

  // ---- entrance: glass doors under a barrel-vault glass canopy on slim columns
  faceBox(c, b, "front", 0, 0, pw - 0.1, DOOR_H + 0.25, 0.03, 0.02, c.sl.glass, GLASS_LIGHT);
  doorAt(c, b, "front", 0, "#3a4650", metal, 0.01, DOOR_W + 0.3);
  const cr = Math.min(0.6, pw / 2 + 0.1);
  const cy = DOOR_H + 0.3;
  const cz = -bd / 2 + fc / 2;
  barrel(c, c.sl.glassSkin, skin, "z", 0, cy, cz, cr, fc, 10);
  for (let i = 0; i <= 3; i++) archRing(c, c.sl.metal, metal, "z", 0, cy, cz - fc / 2 + (i * fc) / 3, cr, cr + 0.03, 0.04, 10);
  for (const s of [-1, 1]) {
    bx(c, 0.05, cy, 0.05, c.sl.metal, metal, s * cr, 0, -bd / 2 + 0.06);
    bx(c, 0.05, 0.05, fc, c.sl.metal, metal, s * cr, cy - 0.05, cz);
  }
  // palms in planters flanking the forecourt
  if (bw > 2.2)
    for (const s of [-1, 1]) {
      const x = s * (bw / 2 - 0.3);
      add(c, tcyl(c.s, 0.34, 0.3, 0.22, c.sl.stone, trim, x, 0, -bd / 2 + fc / 2, 10));
      palm(c, x, 0.22, -bd / 2 + fc / 2, 1.4);
    }
  // rooftop plant
  for (const s of [-1, 1]) bx(c, 0.36, 0.24, 0.3, c.sl.metal, "#c9ccc8", s * (bw / 2 - 0.35), H, bd / 2 - 0.3);
}

// ============================================================== Dubai: glass tower

function buildGlassTower(c: C, width: number, depth: number) {
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const tw = Math.max(1.1, bw - 0.4);
  const td = Math.max(1.1, bd - 0.4);
  const ratio = 3 + rnd(c, 1) * 2;
  const th = Math.max(5, Math.min(14, Math.min(tw, td) * ratio));
  // Gulf glass tower: dark tinted curtain wall (#1a2535 with two occasional
  // lighter accent variants so batches of towers still read as individual)
  const skin = pick(c, ["#1a2535", "#1a2535", "#1a2535", "#1e2e45"], 2);
  const core = shade(skin, -0.55);
  const podiumH = 0.6;
  const metal = "#c8d3da";

  // podium: wider ground box with a glazed street front
  const pw = tw + 0.4;
  const pd = td + 0.4;
  const p: Body = { ox: 0, oz: 0, hw: pw / 2, hd: pd / 2, y0: 0, h: podiumH };
  volume(c, p, "#dcd8cf", c.sl.stone, 0.6);
  faceBox(c, p, "front", 0, 0.05, pw - 0.3, podiumH - 0.12, 0.03, 0.02, c.sl.glass, "#d8c493");
  bx(c, pw + 0.06, 0.05, pd + 0.06, c.sl.paint, "#eeeae2", 0, podiumH, 0);

  // shaft: opaque core inside a semi-transparent curtain wall, with recessed glass bays
  const y0 = podiumH + 0.05;
  const shaft: Body = { ox: 0, oz: 0, hw: tw / 2, hd: td / 2, y0, h: th };
  bx(c, tw - 0.08, th, td - 0.08, c.sl.paint, core, 0, y0, 0);
  const rows = Math.floor(th / 0.55);
  for (let i = 0; i < rows; i++)
    for (const f of FACES) {
      if (rnd(c, i, f.length, 3) > 0.45) continue;
      const u = (rnd(c, i, f.length, 4) - 0.5) * (faceWidth(shaft, f) - 0.5);
      faceBox(c, shaft, f, u, y0 + i * 0.55 + 0.12, 0.35, 0.3, 0.02, -0.03, c.sl.glass, "#e8d7a8");
    }
  bx(c, tw, th, td, c.sl.glassSkin, skin, 0, y0, 0);
  // recessed facade: darker glass slots down the middle of the long faces
  for (const f of ["front", "back"] as Face[]) faceBox(c, shaft, f, 0, y0 + 0.3, tw * 0.28, th - 0.6, 0.02, 0.005, c.sl.glass, shade(skin, -0.35));
  // floor spandrels + corner mullions + central fins
  for (let y = y0 + 0.55; y < y0 + th - 0.1; y += 0.55) bx(c, tw + 0.02, 0.04, td + 0.02, c.sl.metal, metal, 0, y, 0);
  for (const [sx, sz] of CORNERS) bx(c, 0.07, th, 0.07, c.sl.metal, metal, (sx * tw) / 2, y0, (sz * td) / 2);
  for (const s of [-1, 1]) for (const k of [-1, 1]) bx(c, 0.05, th, 0.1, c.sl.metal, metal, k * tw * 0.14, y0, (s * td) / 2 + s * 0.04);

  // crown: tapered or stepped on taller towers, a flat lip + helipad disc otherwise
  const top = y0 + th;
  if (th >= 7 && rnd(c, 5) > 0.5) {
    const ch = Math.min(2.2, th * 0.22);
    frustum(c, c.sl.glassSkin, skin, 0, top, 0, tw, td, tw * 0.45, td * 0.45, ch);
    add(c, tcyl(c.s, 0.03, 0.08, 1.4, c.sl.metal, metal, 0, top + ch, 0, 6));
  } else if (th >= 7) {
    bx(c, tw * 0.78, 0.7, td * 0.78, c.sl.glassSkin, skin, 0, top, 0);
    bx(c, tw * 0.8, 0.04, td * 0.8, c.sl.metal, metal, 0, top + 0.7, 0);
    bx(c, tw * 0.52, 0.6, td * 0.52, c.sl.glassSkin, skin, 0, top + 0.74, 0);
    add(c, tcyl(c.s, 0.03, 0.08, 1.1, c.sl.metal, metal, 0, top + 1.34, 0, 6));
  } else {
    // gentle taper on the last storeys of shorter towers
    frustum(c, c.sl.glassSkin, skin, 0, top, 0, tw, td, tw * 0.82, td * 0.82, 0.5);
    add(c, tcyl(c.s, Math.min(tw, td) * 0.6, Math.min(tw, td) * 0.6, 0.03, c.sl.paint, "#5a6a72", 0, top + 0.5, 0, 16));
  }
  // glazed entrance vestibule bridging podium front and shaft, doors + canopy
  bx(c, 1.2, DOOR_H + 0.2, 0.2, c.sl.glassSkin, skin, 0, 0, -td / 2 - 0.1);
  bx(c, 1.24, 0.05, 0.24, c.sl.metal, metal, 0, DOOR_H + 0.2, -td / 2 - 0.1);
  doorAt(c, p, "front", 0, "#3a4650", metal, 0, DOOR_W + 0.2);
  bx(c, 1.6, 0.06, 0.55, c.sl.metal, metal, 0, DOOR_H + 0.12, -pd / 2 - 0.22);
}

// ============================================================== London: brick terrace

const LONDON_BRICK = ["#a8664e", "#9a5a44", "#b07058", "#8e5a48"];
const LONDON_DOORS = ["#1f2a3a", "#6b1f24", "#20382c", "#2f2f2f"];

/** Black iron area railings along the front, either side of the step. */
function areaRailings(c: C, bw: number, z: number, gapHalf: number) {
  for (const s of [-1, 1]) {
    const x0 = s * gapHalf;
    const x1 = s * (bw / 2);
    const len = Math.abs(x1 - x0);
    if (len < 0.2) continue;
    const mid = (x0 + x1) / 2;
    bx(c, len, 0.03, 0.035, c.sl.metal, IRON, mid, 0.44, z);
    bx(c, len, 0.025, 0.03, c.sl.metal, IRON, mid, 0.08, z);
    const n = Math.max(2, Math.round(len / 0.09));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      bx(c, 0.018, 0.5, 0.018, c.sl.metal, IRON, x, 0, z);
    }
  }
}

function buildLondonTerrace(c: C, width: number, depth: number) {
  const brick = pick(c, LONDON_BRICK, 1);
  const stucco = "#ece6da";
  const sill = "#e8e2d6";
  const slate = "#5c6670";
  const floors = 3;
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY + 0.2;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, brick);
  const stuccoGround = rnd(c, 2) > 0.5;
  if (stuccoGround) faceBox(c, b, "front", 0, 0, bw, STOREY * 0.92, 0.02, 0.005, c.sl.stone, stucco, 0.9);
  // plinth + cornice band under the parapet + floor string course
  bx(c, bw + 0.06, 0.18, bd + 0.06, c.sl.stone, shade(brick, -0.25), 0, 0, 0);
  band(c, b, H - 0.14, 0.1, 0.05, stucco);
  band(c, b, H - 0.24, 0.04, 0.03, stucco);
  band(c, b, STOREY - 0.05, 0.05, 0.02, stucco);

  // ---- door with fanlight + step, bay window over ground + first floor
  const door = pick(c, LONDON_DOORS, 3);
  if (isShop(c)) shopfront(c, b, pick(c, ["#1f3a2c", "#2f3a4a", "#6b1f24"], 7), "#1e1e1e");
  doorAt(c, b, "front", 0, door, stucco);
  faceDisc(c, b, "front", 0, DOOR_H + 0.02, DOOR_W - 0.1, 0.03, 0.01, c.sl.glass, GLASS_LIGHT, 12);
  bx(c, DOOR_W + 0.3, 0.1, 0.3, c.sl.stone, "#cfc8bc", 0, 0, -bd / 2 - 0.15);
  const bayRoom = bw / 2 - 0.52;
  const bayW = Math.min(1.1, bayRoom);
  const hasBay = bayW >= 0.55 && !isShop(c);
  const bayU = -(0.42 + bayRoom / 2);
  const bayH = STOREY * 2 - 0.25;
  if (hasBay) {
    const bayHex = stuccoGround ? stucco : brick;
    faceBox(c, b, "front", bayU, 0, bayW, bayH, 0.2, 0.1, c.sl.stone, bayHex, 0.9);
    faceBox(c, b, "front", bayU, bayH, bayW + 0.06, 0.06, 0.26, 0.12, c.sl.slate, "#6a7078");
    for (let f = 0; f < 2; f++) {
      const y = f * STOREY + SILL_Y - 0.05;
      const bayBody: Body = { ox: b.ox + bayU, oz: b.oz - bd / 2 - 0.1, hw: bayW / 2, hd: 0.1, y0: 0, h: bayH };
      sashAt(c, bayBody, "front", 0, y, bayW - 0.2, WINDOW_H + 0.1, sill);
      for (const face of ["east", "west"] as Face[]) faceBox(c, bayBody, face, -0.02, y, 0.1, WINDOW_H + 0.1, 0.02, 0.012, c.sl.glass, GLASS_DARK);
    }
  }
  // ---- regular white sash rhythm (taller on the piano nobile)
  const n = Math.max(2, Math.min(4, Math.floor(bw / 0.7)));
  const xs = slots(bw, n);
  const ww = Math.min(0.46, bw / n - 0.28);
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y - (f === floors - 1 ? 0.05 : 0);
    const wh = f === 1 ? WINDOW_H + 0.22 : f === floors - 1 ? WINDOW_H - 0.06 : WINDOW_H + 0.1;
    for (const x of xs) {
      if (f === 0 && (isShop(c) || Math.abs(x) < DOOR_W / 2 + ww / 2 + 0.05)) continue;
      if (hasBay && f < 2 && Math.abs(x - bayU) < bayW / 2 + ww / 2) continue;
      sashAt(c, b, "front", x, y, ww, wh, sill);
      faceBox(c, b, "front", x, y + wh + 0.02, ww + 0.1, 0.08, 0.03, 0.01, c.sl.paint, stucco); // lintel
    }
    for (const x of slots(bw, Math.max(1, n - 1))) if (rnd(c, f, x, 4) > 0.3) sashAt(c, b, "back", x, y, ww, wh - 0.1, sill);
  }
  // first-floor balconette rail across the tall windows
  bx(c, bw - 0.1, 0.04, 0.06, c.sl.metal, IRON, 0, STOREY + 0.62, -bd / 2 - 0.05);
  areaRailings(c, bw, -bd / 2 - 0.21, DOOR_W / 2 + 0.18);

  // ---- street parapet + pitched slate roof behind it
  bx(c, bw, 0.28, 0.1, c.sl.stone, brick, 0, H, -bd / 2 + 0.05, 0.9);
  bx(c, bw + 0.04, 0.04, 0.14, c.sl.paint, stucco, 0, H + 0.28, -bd / 2 + 0.05);
  const rise = bd * 0.34;
  gableRoof(c, 0, H, 0.03, bw, bd - 0.06, rise, c.sl.slate, slate, brick);

  // ---- chimney stack (off-centre on the ridge) with cylinder pots
  const cxh = sideOf(c, 5) * (bw / 2 - 0.35);
  bx(c, 0.46, rise + 0.55, 0.3, c.sl.stone, brick, cxh, H, 0.03, 0.9);
  bx(c, 0.52, 0.06, 0.36, c.sl.paint, stucco, cxh, H + rise + 0.55, 0.03);
  const pots = 2 + Math.floor(rnd(c, 6) * 2);
  for (let i = 0; i < pots; i++) add(c, tcyl(c.s, 0.08, 0.1, 0.2, c.sl.paint, "#b0643e", cxh - 0.14 + (i * 0.28) / Math.max(1, pots - 1), H + rise + 0.61, 0.03, 8));
}

// ============================================================== London: pub

function buildLondonPub(c: C, width: number, depth: number) {
  const paint = pick(c, ["#4a1a1e", "#1f3a2c", "#1f2a3a", "#2a2a2a"], 1);
  const brick = pick(c, LONDON_BRICK, 2);
  const gold = "#d8b460";
  const stucco = "#ece6da";
  const slate = "#5c6670";
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = 2 * STOREY + 0.1;
  const gh = STOREY - 0.05;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, brick);
  bx(c, bw + 0.06, 0.14, bd + 0.06, c.sl.stone, shade(paint, -0.3), 0, 0, 0);

  // ---- painted timber pub front wrapping the corner (front + both sides)
  for (const f of ["front", "east", "west"] as Face[]) faceBox(c, b, f, 0, 0, faceWidth(b, f) + 0.02, gh, 0.05, 0.025, c.sl.wood, paint, 2);
  let n = Math.max(3, Math.min(5, Math.round(bw / 0.7)));
  if (n % 2 === 0) n += 1;
  const pw = bw / n;
  for (let i = 0; i <= n; i++) {
    const u = -bw / 2 + i * pw;
    faceBox(c, b, "front", u, 0, 0.1, gh, 0.06, 0.07, c.sl.wood, shade(paint, 0.12));
    faceBox(c, b, "front", u, gh - 0.1, 0.14, 0.08, 0.08, 0.08, c.sl.paint, gold); // capital
  }
  for (const x of slots(bw, n)) {
    if (Math.abs(x) < pw / 2) continue;
    // big multi-pane window over a panelled stall riser
    const ww = pw - 0.2;
    faceBox(c, b, "front", x, 0.08, ww, 0.26, 0.03, 0.06, c.sl.wood, shade(paint, -0.15));
    faceBox(c, b, "front", x, 0.38, ww, 0.82, 0.03, 0.05, c.sl.glass, GLASS_WARM);
    faceBox(c, b, "front", x, 0.9, ww, 0.025, 0.02, 0.07, c.sl.paint, shade(paint, 0.1));
    for (const k of [-1, 1]) faceBox(c, b, "front", x + (k * ww) / 6, 0.38, 0.025, 0.82, 0.02, 0.07, c.sl.paint, shade(paint, 0.1));
  }
  for (const f of ["east", "west"] as Face[]) faceBox(c, b, f, 0, 0.38, Math.min(0.8, bd - 0.5), 0.8, 0.03, 0.05, c.sl.glass, GLASS_WARM);
  doorAt(c, b, "front", 0, shade(paint, -0.2), gold, 0.03);
  faceBox(c, b, "front", 0, DOOR_H + 0.04, DOOR_W, 0.14, 0.02, 0.06, c.sl.glass, GLASS_WARM); // transom
  // lanterns either side of the door
  for (const s of [-1, 1]) bx(c, 0.1, 0.16, 0.1, c.sl.glass, "#f0d890", s * (pw / 2 + 0.02), DOOR_H - 0.1, -bd / 2 - 0.1);

  // ---- signage frieze: deep fascia with gilt lettering, wrapping the corner, cornice above
  const fy = gh - 0.02;
  for (const f of ["front", "east", "west"] as Face[]) {
    const fw = faceWidth(b, f) + 0.12;
    faceBox(c, b, f, 0, fy, fw, 0.32, 0.08, 0.06, c.sl.wood, paint, 2);
    faceBox(c, b, f, 0, fy + 0.32, fw + 0.06, 0.06, 0.14, 0.08, c.sl.paint, shade(paint, 0.18));
    const letters = Math.floor((fw - 0.5) / 0.14);
    for (let i = 0; i < letters; i++) {
      if (rnd(c, i, f.length, 21) > 0.82) continue; // word gaps
      faceBox(c, b, f, -((letters - 1) * 0.14) / 2 + i * 0.14, fy + 0.09, 0.09, 0.14, 0.02, 0.105, c.sl.paint, gold);
    }
  }

  // ---- upper floor: brick, white sashes with stucco lintels, cornice + parapet
  const m = Math.max(2, Math.min(3, Math.floor(bw / 0.8)));
  for (const x of slots(bw, m)) {
    sashAt(c, b, "front", x, STOREY + SILL_Y + 0.05, 0.42, WINDOW_H + 0.05, stucco);
    faceBox(c, b, "front", x, STOREY + SILL_Y + WINDOW_H + 0.1, 0.56, 0.1, 0.05, 0.02, c.sl.paint, stucco);
  }
  for (const f of ["east", "west"] as Face[]) sashAt(c, b, f, 0, STOREY + SILL_Y + 0.05, 0.4, WINDOW_H, stucco);
  band(c, b, H - 0.14, 0.1, 0.06, stucco);
  parapet(c, b, brick, 0.26, 0.1, c.sl.stone, false);
  bx(c, bw + 0.06, 0.04, bd + 0.06, c.sl.paint, stucco, 0, H + 0.26, 0);
  const rise = bd * 0.26;
  gableRoof(c, 0, H, 0, bw - 0.22, bd - 0.22, rise, c.sl.slate, slate, brick);
  const cxh = sideOf(c, 5) * (bw / 2 - 0.3);
  bx(c, 0.4, rise + 0.5, 0.3, c.sl.stone, brick, cxh, H, 0, 0.9);
  for (let i = 0; i < 2; i++) add(c, tcyl(c.s, 0.08, 0.1, 0.2, c.sl.paint, "#b0643e", cxh - 0.08 + i * 0.16, H + rise + 0.5, 0, 8));

  // ---- hanging sign on a wrought-iron bracket at the front corner
  const sgn = sideOf(c, 6);
  const sx = sgn * (bw / 2 - 0.12);
  const armY = STOREY + 0.62;
  const armL = 0.5;
  bx(c, 0.04, 0.04, armL, c.sl.metal, IRON, sx, armY, -bd / 2 - armL / 2);
  const strut = add(c, tbox(c.s, 0.03, 0.03, 0.42, c.sl.metal, IRON, 0, 0, 0));
  strut.position.set(sx, armY - 0.15, -bd / 2 - 0.16);
  strut.rotation.x = 0.75;
  for (const k of [0.1, 0.4]) bx(c, 0.015, 0.06, 0.015, c.sl.metal, IRON, sx, armY - 0.06, -bd / 2 - k);
  const signZ = -bd / 2 - 0.28;
  bx(c, 0.04, 0.5, 0.42, c.sl.paint, gold, sx, armY - 0.58, signZ);
  bx(c, 0.06, 0.44, 0.36, c.sl.wood, paint, sx, armY - 0.55, signZ);
  bx(c, 0.07, 0.2, 0.2, c.sl.paint, pick(c, ["#b8402e", "#e0c060", "#f2efe8"], 8), sx, armY - 0.45, signZ);
  // hanging flower baskets
  for (const s of [-1, 1]) {
    const x = s * Math.min(bw / 2 - 0.3, pw * 1.2);
    bx(c, 0.012, 0.2, 0.012, c.sl.metal, IRON, x, fy + 0.4, -bd / 2 - 0.18);
    add(c, tblob(c.s, 0.3, c.sl.foliage, pick(c, ["#c84a4a", "#d98aa0", "#e3cf86"], 10 + s), x, fy + 0.36, -bd / 2 - 0.18, 0.8));
  }
}

// ============================================================== Scotland

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

const SCOT_STONE = ["#8f8a82", "#9a9388", "#86827c", "#a39a88"];

/** Four-storey grey stone tenement: canted bays, steep slate roof with dormers, gable stacks. */
function buildScottishTenement(c: C, width: number, depth: number) {
  const stone = pick(c, SCOT_STONE, 1);
  const dark = shade(stone, -0.24);
  const dress = shade(stone, 0.16);
  const slate = "#4b545c";
  const floors = 4;
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, stone);
  bx(c, bw + 0.06, 0.32, bd + 0.06, c.sl.stone, dark, 0, 0, 0, 0.9);
  for (let f = 1; f < floors; f++) band(c, b, f * STOREY - 0.05, 0.05, 0.02, dress);
  band(c, b, H - 0.16, 0.16, 0.07, dress); // eaves cornice

  // ---- canted bays from the first floor to the eaves
  const bayW = Math.min(0.95, bw * 0.32);
  const bayUs = bw >= 2.4 ? [-(bw / 2 - bayW / 2 - 0.18), bw / 2 - bayW / 2 - 0.18] : [bw / 2 - bayW / 2 - 0.12];
  const out = 0.28;
  const by0 = isShop(c) ? STOREY + 0.12 : STOREY - 0.05;
  const bh = H - by0 - 0.16;
  const fw = bayW - out * 2; // flat front of the bay
  for (const u of bayUs) {
    faceBox(c, b, "front", u, by0, fw, bh, out, out / 2, c.sl.stone, stone, 0.9);
    for (const s of [-1, 1]) {
      const ch = add(c, tbox(c.s, out * Math.SQRT2, bh, 0.1, c.sl.stone, stone, 0, 0, 0, 0.9));
      ch.position.set(b.ox + u + s * (fw / 2 + out / 2), by0 + bh / 2, -bd / 2 - out / 2);
      ch.rotation.y = -s * (Math.PI / 4);
    }
    faceBox(c, b, "front", u, by0 - 0.14, bayW, 0.14, out + 0.04, out / 2, c.sl.stone, dress); // corbel
    faceBox(c, b, "front", u, by0 + bh, bayW + 0.06, 0.08, out + 0.08, out / 2, c.sl.slate, "#5c646a"); // lead cap
    const bay: Body = { ox: b.ox + u, oz: -bd / 2 - out / 2, hw: fw / 2, hd: out / 2, y0: by0, h: bh };
    for (let f = 1; f < floors; f++) {
      const y = f * STOREY + SILL_Y - 0.08;
      sashAt(c, bay, "front", 0, y, fw - 0.12, WINDOW_H + 0.12, dress);
      for (const s of [-1, 1]) {
        const g = add(c, tbox(c.s, out * Math.SQRT2 - 0.12, WINDOW_H + 0.1, 0.02, c.sl.glass, GLASS_DARK, 0, 0, 0));
        g.position.set(b.ox + u + s * (fw / 2 + out / 2) + s * 0.04, y + (WINDOW_H + 0.1) / 2, -bd / 2 - out / 2 - 0.04);
        g.rotation.y = -s * (Math.PI / 4);
      }
    }
  }
  // ---- flat-front windows (above the door, and the ground floor under the bays)
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y;
    if (f > 0) sashAt(c, b, "front", 0, y, 0.4, WINDOW_H + 0.08, dress);
    else if (!isShop(c)) for (const u of bayUs) sashAt(c, b, "front", u, y, 0.46, WINDOW_H, dress);
    for (const x of slots(bw, Math.max(2, Math.floor(bw / 0.8)))) if (rnd(c, f, x, 3) > 0.25) sashAt(c, b, "back", x, y, 0.4, WINDOW_H, dress);
  }
  if (isShop(c)) shopfront(c, b, pick(c, ["#2f4a3a", "#3a2f4a", "#6b1f24"], 7), "#2a2a2a");
  // close door with a stone surround + rectangular fanlight
  faceBox(c, b, "front", 0, 0, DOOR_W + 0.3, DOOR_H + 0.3, 0.03, 0.01, c.sl.stone, dress);
  doorAt(c, b, "front", 0, pick(c, ["#2a3440", "#5a1f24", "#2f3a2c"], 4), dress, 0.02);
  faceBox(c, b, "front", 0, DOOR_H + 0.1, DOOR_W, 0.14, 0.02, 0.04, c.sl.glass, GLASS_LIGHT);
  bx(c, DOOR_W + 0.4, 0.1, 0.3, c.sl.stone, dark, 0, 0, -bd / 2 - 0.15);

  // ---- steep slate roof (~50°) with dormers over the bays
  const rd = bd + 0.12;
  const rise = rd * 0.6;
  gableRoof(c, 0, H, 0, bw + 0.1, rd, rise, c.sl.slate, slate, stone);
  const slopeAt = (inward: number) => H + (rise * inward) / (rd / 2);
  for (const u of bayUs) {
    const zf = -bd / 2 + 0.26;
    const ys = slopeAt(zf + rd / 2) - 0.12;
    bx(c, 0.62, 0.6, 0.7, c.sl.stone, stone, u, ys, zf + 0.35, 0.9);
    bx(c, 0.4, 0.36, 0.02, c.sl.glass, GLASS_DARK, u, ys + 0.1, zf - 0.01);
    bx(c, 0.46, 0.04, 0.03, c.sl.paint, dress, u, ys + 0.08, zf - 0.02);
    hipRoof(c, u, ys + 0.6, zf + 0.33, 0.74, 0.84, 0.3, c.sl.slate, slate);
  }
  // ---- gable-end chimney stacks with a row of pots
  for (const s of [-1, 1]) {
    const cx = s * (bw / 2 - 0.2);
    bx(c, 0.4, rise + 0.7, 0.56, c.sl.stone, stone, cx, H, 0, 0.9);
    bx(c, 0.46, 0.06, 0.62, c.sl.paint, dress, cx, H + rise + 0.7, 0);
    for (let i = 0; i < 3; i++) add(c, tcyl(c.s, 0.08, 0.1, 0.2, c.sl.paint, "#b0643e", cx, H + rise + 0.76, -0.16 + i * 0.16, 8));
  }
}

// ============================================================== Levant: Amman apartment block

const AMMAN_STONE = ["#D4C49A", "#C8B880", "#E0D0A8"];

/** Horizontal grooves every ~0.7 u + a few proud, re-tinted blocks (dressed limestone). */
function stoneCourses(c: C, v: Body, stone: string, gap?: [number, number]) {
  const groove = shade(stone, -0.16);
  for (let y = v.y0 + 0.7; y < v.y0 + v.h - 0.1; y += 0.7) band(c, v, y, 0.025, 0.012, groove, gap);
  for (const f of FACES)
    for (let i = 0; i < 4; i++) {
      const u = (rnd(c, i, f.length, 10) - 0.5) * (faceWidth(v, f) - 0.5);
      const row = Math.floor(rnd(c, i, f.length, 11) * Math.floor(v.h / 0.7));
      faceBox(c, v, f, u, v.y0 + row * 0.7 + 0.04, 0.42, 0.62, 0.012, 0.004, c.sl.stone, shade(stone, (rnd(c, i, 12) - 0.5) * 0.12), 0.9);
    }
}

function buildAmmanApartment(c: C, width: number, depth: number) {
  const stone = pick(c, AMMAN_STONE, 1);
  const frame = pick(c, ["#4a5a4a", "#5a4a3a", "#3f4a52"], 2);
  const floors = Math.max(2, Math.min(3, c.floors + (rnd(c, 3) > 0.6 ? 1 : 0)));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, stone);
  bx(c, bw + 0.08, 0.22, bd + 0.08, c.sl.stone, shade(stone, -0.2), 0, 0, 0);
  stoneCourses(c, b, stone);

  // ---- projecting bay on one side (first floor up) → irregular massing
  const side = sideOf(c, 16);
  const bayW = Math.min(0.9, bw * 0.34);
  const hasBay = bw >= 2.2;
  const bayU = side * (bw / 2 - bayW / 2 - 0.1);
  if (hasBay) {
    const bay: Body = { ox: bayU, oz: -bd / 2 - 0.14, hw: bayW / 2, hd: 0.14, y0: STOREY, h: H - STOREY };
    volume(c, bay, shade(stone, 0.04));
    faceBox(c, b, "front", bayU, STOREY - 0.1, bayW + 0.06, 0.1, 0.32, 0.14, c.sl.paint, shade(stone, 0.1));
    for (let f = 1; f < floors; f++) archWindow(c, bay, "front", 0, f * STOREY + SILL_Y - 0.05, Math.min(0.46, bayW - 0.3), WINDOW_H - 0.1, stone, false);
    parapet(c, bay, stone, 0.12, 0.06);
  }

  // ---- arch-top windows (iron grilles on the ground floor)
  const n = Math.max(2, Math.min(4, Math.floor(bw / 0.85)));
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y - 0.05;
    for (const x of slots(bw, n)) {
      if (f === 0 && (Math.abs(x) < DOOR_W / 2 + 0.3 || isShop(c))) continue;
      if (hasBay && f > 0 && Math.abs(x - bayU) < bayW / 2 + 0.2) continue;
      archWindow(c, b, "front", x, y, 0.4, WINDOW_H - 0.1, stone, f === 0);
    }
    for (const face of ["east", "west", "back"] as Face[]) {
      const m = Math.max(1, Math.floor(faceWidth(b, face) / 1.1));
      for (const x of slots(faceWidth(b, face), m)) if (rnd(c, f, x, face.length) > 0.35) archWindow(c, b, face, x, y, 0.36, WINDOW_H - 0.15, stone, f === 0);
    }
  }
  archedDoor(c, b, frame, shade(stone, 0.12));
  if (isShop(c)) {
    // rolling-shutter shopfronts either side of the door
    const sideW = (bw - DOOR_W - 0.4) / 2;
    if (sideW > 0.3) for (const s of [-1, 1]) faceBox(c, b, "front", s * (DOOR_W / 2 + 0.2 + sideW / 2), 0.2, sideW, 1.05, 0.04, 0.02, c.sl.metal, "#9aa0a0");
    faceBox(c, b, "front", 0, 1.35, bw - 0.1, 0.22, 0.05, 0.03, c.sl.paint, pick(c, ["#2f6a4a", "#a0402e", "#2f4a7a"], 9));
  }
  bx(c, bw + 0.1, 0.06, bd + 0.1, c.sl.paint, shade(stone, 0.1), 0, H - 0.06, 0);
  parapet(c, b, stone, 0.18, 0.1);

  // ---- stepped, set-back top storey (off-centre)
  const tw = bw * (0.45 + rnd(c, 8) * 0.2);
  const td = bd * 0.55;
  const t: Body = { ox: -side * (bw - tw) * 0.35 * rnd(c, 9), oz: (bd - td) / 2 - 0.1, hw: tw / 2, hd: td / 2, y0: H, h: STOREY * 0.9 };
  volume(c, t, stone);
  stoneCourses(c, t, stone);
  archWindow(c, t, "front", 0, H + 0.45, 0.36, WINDOW_H - 0.15, stone, false);
  parapet(c, t, stone, 0.15, 0.08);
  // pergola on the resulting roof terrace
  const px = side * (bw / 2 - 0.4);
  for (const [sx, sz] of CORNERS) bx(c, 0.04, 0.7, 0.04, c.sl.metal, "#5a5a56", px + sx * 0.28, H, -bd / 2 + 0.45 + sz * 0.22);
  for (let k = 0; k < 4; k++) bx(c, 0.66, 0.03, 0.04, c.sl.metal, "#5a5a56", px, H + 0.7, -bd / 2 + 0.25 + k * 0.13);

  // ---- rooftop water tanks (the Amman skyline) + a satellite dish
  const tanks = 1 + Math.floor(rnd(c, 13) * 2);
  for (let i = 0; i < tanks; i++) waterTank(c, t.ox + (i - (tanks - 1) / 2) * 0.4, H + t.h, t.oz, pick(c, ["#f2f2ee", "#2e2e2e", "#e8e2d0"], 14 + i));
  if (rnd(c, 15) > 0.5) {
    const dish = add(c, tcyl(c.s, 0.34, 0.1, 0.08, c.sl.metal, "#e6e6e2", 0, 0, 0, 10));
    dish.position.set(-side * (bw / 2 - 0.35), H + 0.4, bd / 2 - 0.4);
    dish.rotation.x = -0.7;
    bx(c, 0.03, 0.36, 0.03, c.sl.metal, "#8a8a86", -side * (bw / 2 - 0.35), H, bd / 2 - 0.4);
  }
}

// ============================================================== Levant: courtyard house

function buildLevantHouse(c: C, width: number, depth: number) {
  const stone = pick(c, AMMAN_STONE, 1);
  const frame = pick(c, ["#4a5a4a", "#5a4a3a", "#2f5a6a"], 2);
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = STOREY * 1.05;
  const fr = Math.max(0.5, bd * 0.34);
  const br = Math.max(0.5, bd * 0.34);
  const sw = Math.max(0.45, bw * 0.26);
  const midD = bd - fr - br;
  const outer: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };

  // ---- four one-storey ranges round an open courtyard
  const front: Body = { ox: 0, oz: -bd / 2 + fr / 2, hw: bw / 2, hd: fr / 2, y0: 0, h: H };
  const back: Body = { ox: 0, oz: bd / 2 - br / 2, hw: bw / 2, hd: br / 2, y0: 0, h: H };
  const ranges: Body[] = [front, back];
  if (midD > 0.05) for (const s of [-1, 1]) ranges.push({ ox: s * (bw / 2 - sw / 2), oz: -bd / 2 + fr + midD / 2, hw: sw / 2, hd: midD / 2, y0: 0, h: H });
  for (const r of ranges) {
    volume(c, r, stone);
    bx(c, r.hw * 2 - 0.02, 0.01, r.hd * 2 - 0.02, c.sl.paint, shade(stone, -0.1), r.ox, H, r.oz);
  }
  bx(c, bw + 0.08, 0.2, bd + 0.08, c.sl.stone, shade(stone, -0.2), 0, 0, 0);
  stoneCourses(c, outer, stone, [-0.45, 0.45]);
  parapet(c, outer, stone, 0.2, 0.1, c.sl.stone, false);

  // ---- the courtyard: paving, a fountain basin and a tree showing over the roofs
  const cw = bw - sw * 2;
  const courtZ = -bd / 2 + fr + midD / 2;
  if (cw > 0.3 && midD > 0.2) {
    bx(c, cw, 0.02, midD, c.sl.stone, shade(stone, 0.12), 0, 0, courtZ, 0.9);
    const fd = Math.min(cw, midD) * 0.5;
    add(c, tcyl(c.s, fd, fd, 0.14, c.sl.stone, shade(stone, 0.06), 0, 0.02, courtZ, 12));
    add(c, tcyl(c.s, fd * 0.8, fd * 0.8, 0.02, c.sl.paint, "#6fa8c0", 0, 0.15, courtZ, 12));
  }
  const treeX = midD > 0.2 ? (cw / 2) * 0.5 * sideOf(c, 17) : 0;
  const treeZ = midD > 0.2 ? courtZ : bd / 2 + 0.05;
  add(c, tcyl(c.s, 0.06, 0.09, 1.55, c.sl.wood, "#6b5238", treeX, 0, treeZ, 6));
  add(c, tblob(c.s, 1.0, c.sl.foliage, "#7e9660", treeX, 1.75, treeZ, 0.7, 5));

  // ---- front: arched door, small high windows with iron grilles
  archedDoor(c, front, frame, shade(stone, 0.12));
  for (const s of [-1, 1]) {
    const u = s * (bw / 2 - Math.max(0.35, bw * 0.18));
    if (Math.abs(u) < DOOR_W / 2 + 0.35) continue;
    archWindow(c, front, "front", u, 0.72, 0.3, 0.34, stone, true);
  }
  for (const f of ["east", "west"] as Face[]) archWindow(c, outer, f, 0, 0.72, 0.3, 0.34, stone, true);
  if (rnd(c, 18) > 0.4) add(c, tblob(c.s, 0.55, c.sl.foliage, "#c9508a", sideOf(c, 19) * (bw / 2 - 0.2), H - 0.05, -bd / 2 - 0.05, 0.6)); // bougainvillea

  // ---- small domed room on the roof of the back range
  const side = sideOf(c, 20);
  const rw = Math.min(0.95, bw * 0.34);
  const room: Body = { ox: side * (bw / 2 - rw / 2 - 0.14), oz: back.oz, hw: rw / 2, hd: Math.min(rw, br - 0.1) / 2, y0: H, h: 0.8 };
  volume(c, room, stone);
  band(c, room, H + 0.62, 0.04, 0.02, shade(stone, 0.1));
  archWindow(c, room, "front", 0, H + 0.22, 0.2, 0.26, stone, false);
  const dd = Math.min(rw, room.hd * 2) * 0.86;
  add(c, tcyl(c.s, dd, dd, 0.12, c.sl.stone, stone, room.ox, H + 0.8, room.oz, 14));
  add(c, tblob(c.s, dd * 1.02, c.sl.paint, "#efe8d8", room.ox, H + 0.92, room.oz, 0.95, 12));
  add(c, tcyl(c.s, 0.03, 0.05, 0.14, c.sl.metal, "#b89a50", room.ox, H + 0.92 + dd * 0.46, room.oz, 6));
  // water tank on the other side (the Amman roofscape)
  waterTank(c, -side * (bw / 2 - 0.35), H, back.oz, pick(c, ["#f2f2ee", "#2e2e2e", "#e8e2d0"], 21));
}

// ============================================================== Levant: narrow shop units

function buildLevantShop(c: C, width: number, depth: number) {
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const n = bw >= 3.2 ? 3 : 1;
  const uw = bw / n;
  let tallest: Body | null = null;
  for (let i = 0; i < n; i++) {
    const ux = -bw / 2 + uw / 2 + i * uw;
    const stone = n > 1 ? pick(c, AMMAN_STONE, 30 + i) : pick(c, AMMAN_STONE, 30);
    const h = 2 * STOREY + 0.1 + rnd(c, i, 31) * 0.5;
    const u: Body = { ox: ux, oz: 0, hw: uw / 2 - 0.005, hd: bd / 2, y0: 0, h };
    if (!tallest || h > tallest.h) tallest = u;
    volume(c, u, stone);
    stoneCourses(c, u, stone);
    const signHex = pick(c, ["#2f6a4a", "#a0402e", "#2f4a7a", "#c49a3a"], 32 + i);
    const hasDoor = Math.abs(ux) < 0.01;

    // ---- ground floor: big arched openings (the door sits in the middle unit's arch)
    const arch = (x: number, ow: number, glass: boolean) => {
      const oh = 1.0;
      faceBox(c, u, "front", x, 0.1, ow + 0.16, oh, 0.02, 0.006, c.sl.paint, shade(stone, 0.12));
      faceDisc(c, u, "front", x, 0.1 + oh, ow + 0.16, 0.02, 0.006, c.sl.paint, shade(stone, 0.12), 16);
      if (glass) {
        faceBox(c, u, "front", x, 0.1, ow, oh, 0.03, 0.02, c.sl.glass, GLASS_WARM);
        faceDisc(c, u, "front", x, 0.1 + oh, ow, 0.03, 0.02, c.sl.glass, GLASS_WARM, 16);
        // half-raised rolling shutter
        faceBox(c, u, "front", x, 0.1 + oh * 0.72, ow, oh * 0.28, 0.03, 0.03, c.sl.metal, "#9aa0a0");
      }
      faceBox(c, u, "front", x, 0.1 + oh + ow / 2 + 0.02, 0.1, 0.12, 0.03, 0.02, c.sl.stone, shade(stone, 0.05)); // keystone
    };
    if (hasDoor) {
      archedDoor(c, u, pick(c, ["#4a5a4a", "#5a4a3a", "#2f5a6a"], 33), shade(stone, 0.12));
      const sideW = (uw - DOOR_W) / 2 - 0.3;
      if (sideW > 0.35) for (const s of [-1, 1]) arch(s * (DOOR_W / 2 + 0.15 + sideW / 2), Math.min(0.7, sideW), true);
    } else arch(0, Math.min(1.1, uw - 0.4), true);
    // sign board above the arches
    faceBox(c, u, "front", 0, 1.72, uw - 0.2, 0.22, 0.05, 0.03, c.sl.paint, signHex);
    if (!hasDoor || c.kind === "cafe") awning(c, ux, 1.5, -bd / 2, Math.min(1.2, uw - 0.2), shade(signHex, 0.2));

    // ---- upper floor: tall arched windows + a balconette on the middle one
    const nw = uw >= 1.4 ? 2 : 1;
    for (const x of slots(uw, nw)) archWindow(c, u, "front", x, STOREY + 0.45, 0.32, WINDOW_H + 0.12, stone, false);
    faceBox(c, u, "front", 0, STOREY + 0.33, Math.min(0.9, uw - 0.2), 0.05, 0.24, 0.12, c.sl.stone, shade(stone, 0.1));
    faceBox(c, u, "front", 0, STOREY + 0.62, Math.min(0.9, uw - 0.2), 0.03, 0.03, 0.22, c.sl.metal, "#3a3a38");
    for (const x of slots(Math.min(0.9, uw - 0.2), 6)) faceBox(c, u, "front", x, STOREY + 0.38, 0.015, 0.25, 0.015, 0.22, c.sl.metal, "#3a3a38");
    for (const face of ["back", "east", "west"] as Face[]) if (rnd(c, i, face.length, 34) > 0.4) archWindow(c, u, face, 0, STOREY + 0.45, 0.3, WINDOW_H, stone, false);
    // uneven parapets + cornice
    bx(c, uw + 0.06, 0.06, bd + 0.06, c.sl.paint, shade(stone, 0.1), ux, h - 0.06, 0);
    parapet(c, u, stone, 0.14 + rnd(c, i, 35) * 0.12, 0.08);
  }
  if (tallest) waterTank(c, tallest.ox, tallest.h, bd / 2 - 0.4, pick(c, ["#f2f2ee", "#2e2e2e"], 36));
}

// ============================================================== Italy: pastel villa

const ITALY_WALLS = ["#F5EDD5", "#D4A850", "#D48878", "#E8C890"];
const ITALY_SHUTTERS = ["#4f7a52", "#3f7f8f", "#6b8f5a", "#7a4a3a"];
const TERRACOTTA = "#C0603A";

function buildItalianVilla(c: C, width: number, depth: number) {
  const wall = pick(c, ITALY_WALLS, 1);
  const trim = "#f3ead6";
  const shutter = pick(c, ITALY_SHUTTERS, 2);
  const floors = Math.max(2, Math.min(3, c.floors));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const H = floors * STOREY + 0.1;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: H };
  volume(c, b, wall, c.sl.stone, 0.7);
  bx(c, bw + 0.06, 0.3, bd + 0.06, c.sl.stone, shade(wall, -0.2), 0, 0, 0, 0.7);
  for (const [sx, sz] of CORNERS) bx(c, 0.12, H, 0.12, c.sl.paint, trim, (sx * bw) / 2, 0, (sz * bd) / 2);
  band(c, b, H - 0.12, 0.12, 0.06, trim);

  // ---- windows with shutters (thin coloured boxes flanking each window)
  const shuttered = (f: Face, u: number, y: number, ww: number, wh: number) => {
    windowAt(c, b, f, u, y, ww, wh, trim, trim);
    const sw = Math.max(0.08, ww * 0.42);
    for (const s of [-1, 1]) {
      faceBox(c, b, f, u + s * (ww / 2 + 0.04 + sw / 2), y, sw, wh, 0.05, 0.03, c.sl.wood, shutter, 3);
      for (let k = 1; k < 4; k++) faceBox(c, b, f, u + s * (ww / 2 + 0.04 + sw / 2), y + (k * wh) / 4, sw - 0.02, 0.012, 0.01, 0.06, c.sl.paint, shade(shutter, -0.2));
    }
  };
  const n = Math.max(1, Math.min(3, Math.floor(bw / 1.15)));
  const xs = n === 1 ? [0] : slots(bw, n);
  for (let f = 0; f < floors; f++) {
    const y = f * STOREY + SILL_Y;
    const wh = f === 1 ? WINDOW_H + 0.35 : WINDOW_H;
    const wy = f === 1 ? f * STOREY + 0.12 : y;
    for (const x of xs) {
      if (f === 0 && (Math.abs(x) < DOOR_W / 2 + 0.35 || isShop(c))) continue;
      shuttered("front", x, wy, WINDOW_W - 0.06, wh);
    }
    for (const face of ["east", "west"] as Face[]) if (rnd(c, f, face.length, 3) > 0.3) shuttered(face, 0, y, WINDOW_W - 0.1, WINDOW_H - 0.05);
    if (rnd(c, f, 4) > 0.3) shuttered("back", 0, y, WINDOW_W - 0.06, WINDOW_H);
  }
  archedDoor(c, b, shade(shutter, -0.15), trim);
  if (isShop(c)) shopfront(c, b, pick(c, [TERRACOTTA, shutter, "#8a3a3a"], 5), shade(shutter, -0.2));

  // ---- wraparound balcony on the first floor: slab + balusters + rail
  const by = STOREY + 0.08;
  const out = 0.2;
  const slabW = bw + out * 2;
  bx(c, slabW, 0.04, out, c.sl.stone, trim, 0, by - 0.04, -bd / 2 - out / 2, 0.7);
  const sideL = bd * 0.55;
  for (const s of [-1, 1]) bx(c, out, 0.04, sideL, c.sl.stone, trim, s * (bw / 2 + out / 2), by - 0.04, -bd / 2 + sideL / 2, 0.7);
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
  for (let i = 0; i < 2; i++) {
    const x = (i === 0 ? -1 : 1) * (bw / 2 - 0.15);
    add(c, tcyl(c.s, 0.14, 0.1, 0.12, c.sl.paint, "#b8603a", x, by, -bd / 2 - 0.1, 8));
    add(c, tblob(c.s, 0.2, c.sl.foliage, pick(c, ["#6b8a4e", "#d9467e", "#e0b83a"], 20 + i), x, by + 0.18, -bd / 2 - 0.1));
  }

  // ---- low-pitched hipped terracotta roof (~17°) with eaves overhang
  const over = 0.16;
  const rw = bw + over * 2;
  const rd = bd + over * 2;
  const rise = (Math.min(rw, rd) / 2) * Math.tan((17 * Math.PI) / 180);
  hipRoof(c, 0, H, 0, rw, rd, rise, c.sl.roofTile, TERRACOTTA, 1.1);
  if (rw > rd) bx(c, rw - rd + 0.04, 0.05, 0.08, c.sl.roofTile, shade(TERRACOTTA, -0.12), 0, H + rise - 0.02, 0);
  const cx = (rnd(c, 6) - 0.5) * bw * 0.5;
  bx(c, 0.24, rise + 0.35, 0.24, c.sl.stone, wall, cx, H, bd * 0.15, 0.7);
  bx(c, 0.34, 0.05, 0.34, c.sl.roofTile, TERRACOTTA, cx, H + rise + 0.35, bd * 0.15);
}

// ============================================================== Mediterranean: cascading terrace

const CYCLADIC_WHITE = ["#FAFAF8", "#F5F4F0"];
const AEGEAN_BLUE = ["#2f64b0", "#1f5aa6", "#3a78c0"];

function buildMedTerrace(c: C, width: number, depth: number) {
  const greek = c.pal === "gr";
  const wall = greek ? pick(c, CYCLADIC_WHITE, 1) : pick(c, ITALY_WALLS, 1);
  const accent = greek ? pick(c, AEGEAN_BLUE, 2) : pick(c, ITALY_SHUTTERS, 2);
  const trim = greek ? "#ffffff" : "#f3ead6";
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const levels = bd >= 2.2 ? 3 : 2;
  const ld = bd / levels;
  const step = STOREY * 0.85;

  // ---- each level steps up and back, like houses climbing a hillside
  const bodies: Body[] = [];
  for (let i = 0; i < levels; i++) {
    const shift = i === 0 ? 0 : (rnd(c, i, 20) - 0.5) * 0.3;
    const w = bw - Math.abs(shift) * 2 - i * 0.12;
    const z0 = -bd / 2 + i * ld;
    const b: Body = { ox: shift, oz: (z0 + bd / 2) / 2, hw: w / 2, hd: (bd / 2 - z0) / 2, y0: 0, h: step * (i + 1) };
    if (greek) roundedVolume(c, b, wall, 0.1);
    else {
      volume(c, b, wall, c.sl.stone, 0.7);
      band(c, b, b.h - 0.08, 0.08, 0.04, trim);
    }
    bodies.push(b);
  }
  bx(c, bw + 0.06, 0.2, bd + 0.06, c.sl.stone, shade(wall, -0.18), 0, 0, 0, 0.6);

  // ---- openings on each level's exposed front band
  bodies.forEach((b, i) => {
    const y0 = i * step;
    const w = b.hw * 2;
    const opening = (u: number, door: boolean) => {
      const ww = door ? 0.44 : 0.36;
      const wh = door ? 0.95 : 0.45;
      const y = door ? y0 + 0.02 : y0 + 0.45;
      faceBox(c, b, "front", u, y, ww, wh, 0.04, 0.02, door ? c.sl.wood : c.sl.glass, door ? accent : GLASS_DARK, 2);
      if (greek) faceDisc(c, b, "front", u, y + wh, ww, 0.04, 0.02, door ? c.sl.wood : c.sl.glass, door ? accent : GLASS_DARK, 12);
      else for (const s of [-1, 1]) faceBox(c, b, "front", u + s * (ww / 2 + 0.1), y, 0.16, wh, 0.05, 0.03, c.sl.wood, accent, 3);
    };
    if (i === 0) {
      doorAt(c, b, "front", 0, accent, trim, 0.01, DOOR_W, DOOR_H - 0.15);
      if (greek) faceDisc(c, b, "front", 0, DOOR_H - 0.15, DOOR_W, 0.05, 0.035, c.sl.wood, accent, 14);
      const sideW = w / 2 - DOOR_W / 2 - 0.2;
      if (sideW > 0.5) for (const s of [-1, 1]) opening(s * (DOOR_W / 2 + 0.2 + sideW / 2), false);
      if (isShop(c)) faceBox(c, b, "front", 0, DOOR_H - 0.05, w * 0.7, 0.16, 0.04, 0.03, c.sl.paint, accent);
    } else {
      const s = rnd(c, i, 21) > 0.5 ? 1 : -1;
      opening(s * w * 0.22, true);
      if (w > 1.6) opening(-s * w * 0.25, false);
    }
    // terrace on the exposed strip of this level's roof: rail / low wall, pots, a pergola on one
    if (i < levels - 1) {
      const zt = -bd / 2 + i * ld;
      const yt = b.h;
      if (greek) bx(c, w, 0.3, 0.06, c.sl.stone, wall, b.ox, yt, zt + 0.03, 0.5);
      else {
        bx(c, w, 0.04, 0.05, c.sl.metal, IRON, b.ox, yt + 0.32, zt + 0.03);
        for (let x = -w / 2 + 0.05; x <= w / 2 - 0.04; x += 0.12) bx(c, 0.02, 0.32, 0.02, c.sl.metal, IRON, b.ox + x, yt, zt + 0.03);
      }
      add(c, tcyl(c.s, 0.16, 0.12, 0.14, c.sl.paint, "#b8603a", b.ox + w / 2 - 0.2, yt, zt + ld / 2, 8));
      add(c, tblob(c.s, 0.28, c.sl.foliage, pick(c, ["#6b8a4e", "#c2408a", "#e0b83a"], 22 + i), b.ox + w / 2 - 0.2, yt + 0.22, zt + ld / 2));
      if (i === 0 && ld > 0.5) {
        const px = b.ox - w / 2 + 0.55;
        const pz = zt + ld / 2;
        const hx = 0.45;
        const hz = ld / 2 - 0.1;
        const wood = greek ? "#8a6a44" : "#6b5238";
        for (const [sx, sz] of CORNERS) bx(c, 0.05, 0.75, 0.05, c.sl.wood, wood, px + sx * hx, yt, pz + sz * hz);
        for (const sz of [-1, 1]) bx(c, hx * 2 + 0.08, 0.05, 0.05, c.sl.wood, wood, px, yt + 0.75, pz + sz * hz);
        for (let k = 0; k < 5; k++) bx(c, 0.03, 0.03, hz * 2 + 0.1, c.sl.wood, wood, px - hx + (k * hx * 2) / 4, yt + 0.8, pz);
        add(c, tblob(c.s, 0.5, c.sl.foliage, greek ? "#c2408a" : "#6b8a4e", px - hx, yt + 0.72, pz - hz, 0.6));
      }
    }
  });

  // ---- crown of the top level: blue dome (Greece) or a low hipped tile roof (Italy)
  const top = bodies[bodies.length - 1];
  const yTop = top.y0 + top.h;
  if (greek) {
    if (rnd(c, 23) > 0.4) {
      const dr = Math.min(top.hw, top.hd) * 0.9;
      const x = top.ox + sideOf(c, 24) * (top.hw - dr / 2 - 0.1);
      add(c, tcyl(c.s, dr, dr, 0.16, c.sl.stone, wall, x, yTop, top.oz, 16));
      add(c, tblob(c.s, dr, c.sl.paint, accent, x, yTop + 0.16, top.oz, 0.95, 12));
    }
  } else {
    const rw = top.hw * 2 + 0.24;
    const rd = top.hd * 2 + 0.24;
    hipRoof(c, top.ox, yTop, top.oz, rw, rd, (Math.min(rw, rd) / 2) * 0.32, c.sl.roofTile, TERRACOTTA, 1.1);
  }
}

// ============================================================== Mediterranean: chapel

function buildChapel(c: C, width: number, depth: number) {
  const greek = c.pal === "gr";
  const wall = greek ? pick(c, CYCLADIC_WHITE, 1) : pick(c, ["#F2E6CC", "#E8D2A8", "#EBDDC2"], 1);
  const domeHex = greek ? pick(c, AEGEAN_BLUE, 2) : "#b8683e";
  const trim = greek ? "#ffffff" : "#f6efe0";
  const door = greek ? domeHex : "#6b4a33";
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const nw = Math.max(1.1, Math.min(bw * 0.6, 1.9));
  const H = STOREY * 1.2;
  const nave: Body = { ox: 0, oz: 0.1, hw: nw / 2, hd: bd / 2 - 0.1, y0: 0, h: H };
  volume(c, nave, wall, c.sl.stone, 0.5);
  bx(c, nw + 0.06, 0.16, nave.hd * 2 + 0.06, c.sl.stone, shade(wall, -0.12), 0, 0, nave.oz, 0.5);
  band(c, nave, H - 0.08, 0.08, 0.04, trim);

  // ---- nave roof: whitewashed barrel vault (Cyclades) or a hipped tile roof (Italy)
  let crest: number;
  if (greek) {
    barrel(c, c.sl.stone, wall, "z", 0, H, nave.oz, nw / 2, nave.hd * 2, 12);
    crest = H + nw / 2;
  } else {
    const rise = nw * 0.3;
    hipRoof(c, 0, H, nave.oz, nw + 0.16, nave.hd * 2 + 0.16, rise, c.sl.roofTile, TERRACOTTA, 1.1);
    crest = H + rise;
  }

  // ---- drum + dome toward the back, lantern and cross
  const dz = nave.oz + nave.hd * 0.3;
  const dd = nw * 0.7;
  const drumTop = crest + 0.28;
  add(c, tcyl(c.s, dd, dd, drumTop - H, c.sl.stone, wall, 0, H, dz, 16));
  for (const [sx, sz] of [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ])
    bx(c, sx === 0 ? 0.1 : 0.03, 0.16, sz === 0 ? 0.1 : 0.03, c.sl.glass, GLASS_DARK, (sx * dd) / 2, drumTop - 0.22, dz + (sz * dd) / 2);
  bx(c, dd + 0.06, 0.05, dd + 0.06, c.sl.paint, trim, 0, drumTop - 0.05, dz);
  add(c, tblob(c.s, dd * 1.02, c.sl.paint, domeHex, 0, drumTop, dz, 1.0, 12));
  const lantY = drumTop + dd * 0.5;
  add(c, tcyl(c.s, 0.12, 0.14, 0.16, c.sl.paint, trim, 0, lantY - 0.02, dz, 8));
  cross(c, 0, lantY + 0.14, dz, 1, greek ? "#f2f2ee" : "#c8a850");

  // ---- front: arched door, oculus, bell-gable wall (or an Italian campanile beside the nave)
  const frontZ = nave.oz - nave.hd;
  archedDoor(c, nave, door, trim);
  faceDisc(c, nave, "front", 0, H * 0.8, 0.36, 0.03, 0.01, c.sl.paint, trim, 14);
  faceDisc(c, nave, "front", 0, H * 0.8, 0.26, 0.03, 0.02, c.sl.glass, GLASS_DARK, 14);
  bx(c, nw * 0.55, 0.1, 0.36, c.sl.stone, shade(wall, -0.08), 0, 0, frontZ - 0.18, 0.5); // step
  const tw = Math.min(0.62, (bw - nw) / 2 - 0.02);
  const bells = (b: Body, f: Face, y: number, ow: number) => {
    faceBox(c, b, f, 0, y, ow, 0.3, 0.02, 0.01, c.sl.paint, "#3a3a44");
    faceDisc(c, b, f, 0, y + 0.3, ow, 0.02, 0.01, c.sl.paint, "#3a3a44", 12);
  };
  if (greek || tw < 0.4) {
    // bell-gable: a pierced wall standing on the front with a round top
    const gw = nw * 0.72;
    const gh = 0.8;
    const bell: Body = { ox: 0, oz: frontZ + 0.07, hw: gw / 2, hd: 0.07, y0: H, h: gh };
    volume(c, bell, wall, c.sl.stone, 0.5);
    faceDisc(c, bell, "front", 0, H + gh, gw, 0.14, -0.07, c.sl.stone, wall, 16);
    for (const s of [-1, 1]) {
      const x = s * gw * 0.22;
      faceBox(c, bell, "front", x, H + 0.2, 0.2, 0.3, 0.02, 0.01, c.sl.paint, "#3a3a44");
      faceDisc(c, bell, "front", x, H + 0.5, 0.2, 0.02, 0.01, c.sl.paint, "#3a3a44", 12);
      add(c, tcyl(c.s, 0.05, 0.12, 0.13, c.sl.metal, "#c8a850", x, H + 0.3, frontZ - 0.03, 8));
    }
    cross(c, 0, H + gh + gw / 2 - 0.02, bell.oz, 0.9, greek ? "#f2f2ee" : "#c8a850");
  } else {
    // campanile: square tower beside the nave, arched belfry, pyramid tile cap
    const side = sideOf(c, 25);
    const th = H + 1.7;
    const t: Body = { ox: side * (nw / 2 + tw / 2 + 0.02), oz: frontZ + tw / 2 + 0.05, hw: tw / 2, hd: tw / 2, y0: 0, h: th };
    volume(c, t, wall, c.sl.stone, 0.5);
    band(c, t, H - 0.08, 0.08, 0.04, trim);
    band(c, t, th - 0.1, 0.1, 0.05, trim);
    for (const f of FACES) bells(t, f, th - 0.72, tw * 0.45);
    add(c, tcyl(c.s, 0.08, 0.16, 0.16, c.sl.metal, "#c8a850", t.ox, th - 0.55, t.oz, 8));
    frustum(c, c.sl.roofTile, TERRACOTTA, t.ox, th, t.oz, tw + 0.08, tw + 0.08, 0.04, 0.04, 0.6);
    cross(c, t.ox, th + 0.58, t.oz, 0.8, "#c8a850");
  }
  // slim arched side windows
  for (const f of ["east", "west"] as Face[]) for (const u of slots(nave.hd * 2, 2)) archWindow(c, nave, f, u, 0.6, 0.2, 0.46, wall, false);
  // churchyard wall along the sides of the plot
  if ((bw - nw) / 2 > 0.3) for (const s of [-1, 1]) bx(c, 0.1, 0.42, bd, c.sl.stone, wall, s * (bw / 2 - 0.05), 0, 0, 0.5);
}

// ============================================================== Greece: Santorini cubist

/** A whitewashed volume with rounded vertical edges (two boxes + 4 corner cylinders). */
function roundedVolume(c: C, b: Body, hex: string, r = 0.14) {
  const w = b.hw * 2;
  const d = b.hd * 2;
  const m = c.sl.stone;
  bx(c, w, b.h, d - r * 2, m, hex, b.ox, b.y0, b.oz, 0.5);
  bx(c, w - r * 2, b.h, d, m, hex, b.ox, b.y0, b.oz, 0.5);
  for (const [sx, sz] of CORNERS) add(c, tcyl(c.s, r * 2, r * 2, b.h, m, hex, b.ox + sx * (b.hw - r), b.y0, b.oz + sz * (b.hd - r), 8));
  const lip = 0.12;
  const y = b.y0 + b.h;
  bx(c, w - r * 2, lip, 0.08, m, hex, b.ox, y, b.oz - b.hd + 0.04);
  bx(c, w - r * 2, lip, 0.08, m, hex, b.ox, y, b.oz + b.hd - 0.04);
  bx(c, 0.08, lip, d - r * 2, m, hex, b.ox - b.hw + 0.04, y, b.oz);
  bx(c, 0.08, lip, d - r * 2, m, hex, b.ox + b.hw - 0.04, y, b.oz);
  bx(c, w - 0.16, 0.01, d - 0.16, c.sl.paint, "#ebe8e0", b.ox, y, b.oz);
}

function buildSantoriniCubist(c: C, width: number, depth: number) {
  const white = pick(c, CYCLADIC_WHITE, 1);
  const blue = pick(c, AEGEAN_BLUE, 2);
  const floors = Math.max(1, Math.min(2, c.floors));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;

  // ---- stepped cubes: the ground cube (behind a shallow front terrace), then a
  // smaller set-back cube (→ roof terrace), and a small cube turned at an angle
  const TER = 0.3;
  const g: Body = { ox: 0, oz: TER / 2, hw: bw / 2, hd: (bd - TER) / 2, y0: 0, h: STOREY * 0.95 };
  const upperSide = sideOf(c, 4);
  const stairs = bw >= 2.4;
  roundedVolume(c, g, white);
  const bodies: Body[] = [g];
  if (floors >= 2 || rnd(c, 3) > 0.35) {
    const side = upperSide;
    const uw = bw * (0.5 + rnd(c, 5) * 0.2);
    const ud = bd * (0.55 + rnd(c, 6) * 0.2);
    const u: Body = { ox: (side * (bw - uw)) / 2, oz: (bd - ud) / 2, hw: uw / 2, hd: ud / 2, y0: g.h, h: STOREY * 0.9 };
    roundedVolume(c, u, white);
    bodies.push(u);
    faceBox(c, u, "front", 0, u.y0, 0.48, 0.9, 0.04, 0.02, c.sl.wood, blue, 2);
    faceDisc(c, u, "front", 0, u.y0 + 0.9, 0.48, 0.04, 0.02, c.sl.wood, blue, 12);
    if (uw > 1.5) windowAt(c, u, "front", side * (uw / 2 - 0.3), u.y0 + 0.45, 0.3, 0.36, blue, null);
    if (rnd(c, 7) > 0.65) {
      const t: Body = { ox: u.ox + side * (uw * 0.2), oz: u.oz + ud * 0.2, hw: uw * 0.25, hd: ud * 0.25, y0: u.y0 + u.h, h: 0.7 };
      roundedVolume(c, t, white, 0.1);
      bodies.push(t);
    }
  }
  // the angled cube: a small room / stair-head turned off the grid on the ground roof
  if (bw >= 2 && rnd(c, 26) > 0.25) {
    const s = 0.62;
    const a = add(c, tbox(c.s, s, 0.62, s, c.sl.stone, white, 0, 0, 0, 0.5));
    const ax = -upperSide * (bw / 2 - s * 0.75);
    const az = g.oz - g.hd * 0.1;
    a.position.set(ax, g.h + 0.31, az);
    a.rotation.y = 0.3 + rnd(c, 27) * 0.35;
    const cap = add(c, tbox(c.s, s + 0.08, 0.06, s + 0.08, c.sl.stone, white, 0, 0, 0, 0.5));
    cap.position.set(ax, g.h + 0.65, az);
    cap.rotation.y = a.rotation.y;
    const dr = add(c, tbox(c.s, 0.26, 0.44, 0.02, c.sl.wood, blue, 0, 0, 0));
    const ca = Math.cos(a.rotation.y);
    const sa = Math.sin(a.rotation.y);
    // door on the angled cube's local -Z face (Babylon: local -Z → world (-sin, 0, -cos)... for rotation.y)
    dr.position.set(ax - sa * (s / 2 + 0.01), g.h + 0.22, az - ca * (s / 2 + 0.01));
    dr.rotation.y = a.rotation.y;
  }

  // ---- ground floor: arched blue door, blue-framed windows
  doorAt(c, g, "front", 0, blue, white, 0.01, DOOR_W, DOOR_H - 0.2);
  faceDisc(c, g, "front", 0, DOOR_H - 0.2, DOOR_W + 0.14, 0.03, 0.006, c.sl.paint, "#e8e6e0", 14);
  faceDisc(c, g, "front", 0, DOOR_H - 0.2, DOOR_W, 0.05, 0.035, c.sl.wood, blue, 14);
  const sideW = bw / 2 - DOOR_W / 2 - 0.2;
  if (sideW > 0.45)
    for (const s of [-1, 1]) {
      if (stairs && s === -upperSide) continue;
      const u = s * (DOOR_W / 2 + 0.2 + sideW / 2);
      windowAt(c, g, "front", u, 0.5, 0.34, 0.44, blue, null);
      faceDisc(c, g, "front", u, 0.94, 0.34, 0.03, 0.02, c.sl.glass, GLASS_DARK, 12);
    }
  for (const face of ["east", "west"] as Face[]) if (rnd(c, face.length, 8) > 0.3) windowAt(c, g, face, 0, 0.5, 0.3, 0.4, blue, null);
  if (isShop(c)) faceBox(c, g, "front", 0, DOOR_H - 0.05, bw * 0.7, 0.16, 0.04, 0.02, c.sl.paint, blue);

  // ---- front terrace: low wall with a gap at the door; on wider houses an
  // outside stair climbs along the façade to the roof terrace
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
  if (rnd(c, 9) > 0.4) add(c, tblob(c.s, 0.5, c.sl.foliage, "#c2408a", sideOf(c, 10) * (bw / 2 - 0.25), 0.4, -bd / 2 + 0.05, 0.7));

  // ---- blue dome (on a drum) on some buildings, else a little bell-gable wall
  const top = bodies[bodies.length - 1];
  if (rnd(c, 11) > 0.5) {
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

// ============================================================== default: stylised flat-roof box

function buildBox(c: C, width: number, depth: number) {
  const wall = pick(c, ["#e2d8c4", "#d8d2c8", "#e8e0d0"], 1);
  const trim = shade(wall, -0.15);
  const floors = Math.max(1, Math.min(3, c.floors));
  const bw = width - INSET * 2;
  const bd = depth - INSET * 2;
  const b: Body = { ox: 0, oz: 0, hw: bw / 2, hd: bd / 2, y0: 0, h: floors * STOREY };
  volume(c, b, wall);
  bx(c, bw + 0.06, 0.16, bd + 0.06, c.sl.stone, shade(wall, -0.25), 0, 0, 0);
  doorAt(c, b, "front", 0, "#6b4a33", "#f0ead8");
  const n = Math.max(2, Math.floor(bw / 0.8));
  for (let f = 0; f < floors; f++) {
    for (const x of slots(bw, n)) {
      if (f === 0 && Math.abs(x) < DOOR_W / 2 + 0.3) continue;
      windowAt(c, b, "front", x, f * STOREY + SILL_Y, 0.44, WINDOW_H - 0.1, trim, trim);
    }
    if (f > 0) band(c, b, f * STOREY - 0.04, 0.04, 0.02, trim);
  }
  bx(c, bw + 0.1, 0.06, bd + 0.1, c.sl.paint, trim, 0, b.h - 0.06, 0);
  parapet(c, b, wall, 0.15, 0.08);
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
