// Maps 2D texture keys (worldgen PropSpec.tex) to procedural kit pieces.
// Buildings become cottage / townhouse / tenement / shop / café variants
// chosen deterministically from the key + position; unknown props fall
// back to a sensible generic piece or are skipped.

import { TILE } from "../../game/constants";
import { PROP_SIZES } from "../../game/propSizes";
import { hash01, strHash } from "../assets/kit/util";
import { PRESET_1S, PRESET_2S } from "../assets/kit/architecture";

export interface KitPlacement {
  key: string;
  variant?: string;
  rotationY?: number;
  scale?: number;
  /** footprint in tiles (buildings + solid props) */
  footprint?: { w: number; d: number };
  /** true = the tile(s) get blocked in the collider */
  solid?: boolean;
  /** offset of the piece origin from the tile centre (units) */
  dx?: number;
  dz?: number;
}

export interface BuildingSpec {
  w: number;
  d: number;
  kind: "cottage" | "shop" | "cafe" | "tenement";
  style: "cream" | "grey" | "rose" | "stucco" | "sand";
  roof: "terra" | "slate" | "orange";
  storeys: number;
  /** kit preset name (see assets/kit/architecture/presets.ts); derived from the fields above when absent */
  preset?: string;
}

const STYLES: BuildingSpec["style"][] = ["cream", "grey", "rose", "stucco", "sand"];

/** Decide what a building texture becomes. Deterministic in (tex, tx, ty). */
export function buildingSpec(tex: string, tx: number, ty: number): BuildingSpec | null {
  const size = PROP_SIZES[tex];
  if (!size) return null;
  const isBuilding = tex.startsWith("b_") || tex.startsWith("lm_");
  if (!isBuilding) return null;
  const w = Math.max(2, Math.round(size.w / TILE));
  const h = strHash(`${tex}:${tx}:${ty}`);
  const r = hash01(h % 1000, tx, ty);
  const d = Math.max(2, Math.min(4, Math.round(size.h / TILE) - 1));
  const storeysBySprite = Math.max(1, Math.min(3, Math.round(size.h / 34)));

  const pick = (list: string[]) => list[Math.floor(r * list.length) % list.length];
  switch (tex) {
    case "b_tenement":
      return { w, d: Math.min(d, 3), kind: "tenement", style: r > 0.5 ? "grey" : "sand", roof: "slate", storeys: 3, preset: pick(["tenementSand", "tenementGrey", "tenementSand", "tenementRose"]) };
    case "b_townhouse_cream":
    case "b_stucco":
    case "b_cream_comm":
      return { w, d: Math.min(d, 3), kind: "cottage", style: r > 0.6 ? "stucco" : "cream", roof: r > 0.3 ? "terra" : "slate", storeys: 2, preset: pick(["creamCrow2", "sandDormer2", "greyDormer"]) };
    case "b_townhouse_red":
    case "b_front_red":
    case "b_terrace_brick":
      return { w, d: Math.min(d, 3), kind: "cottage", style: "rose", roof: "terra", storeys: 2, preset: "rose2" };
    case "b_cafe":
    case "b_saddle":
      return { w, d: Math.min(d, 3), kind: "cafe", style: "cream", roof: "terra", storeys: 1, preset: "cafe" };
    case "b_shop":
    case "b_shopfront_ldn":
    case "b_spinneys":
    case "b_waitrose":
      return { w, d: Math.min(d, 3), kind: "shop", style: r > 0.5 ? "cream" : "sand", roof: r > 0.5 ? "orange" : "slate", storeys: 2, preset: r > 0.5 ? "shop" : "shopGrey" };
    case "b_pub":
      return { w, d: Math.min(d, 3), kind: "shop", style: "grey", roof: "slate", storeys: 2, preset: "shopGrey" };
    case "b_wellcourt":
      return { w, d: Math.min(d, 4), kind: "tenement", style: "rose", roof: "slate", storeys: 3, preset: "tenementRose" };
    case "b_uni":
      return { w, d: Math.min(d, 4), kind: "shop", style: "sand", roof: "slate", storeys: 2, preset: "shopGrey" };
    case "b_house_red":
    case "b_house_blue":
    case "b_house_purple":
    case "b_house_green":
      return { w, d: Math.min(d, 3), kind: "cottage", style: STYLES[Math.floor(r * STYLES.length)], roof: r > 0.5 ? "terra" : "orange", storeys: 1, preset: pick(PRESET_1S) };
    default:
      return {
        w,
        d,
        kind: storeysBySprite >= 3 ? "tenement" : "cottage",
        style: STYLES[Math.floor(r * STYLES.length)],
        roof: r > 0.5 ? "terra" : "slate",
        storeys: storeysBySprite,
        preset: storeysBySprite >= 3 ? pick(["tenementSand", "tenementGrey"]) : storeysBySprite === 2 ? pick(PRESET_2S) : pick(PRESET_1S),
      };
  }
}

export function buildingVariant(s: BuildingSpec) {
  if (s.preset) return `p=${s.preset},w=${s.w},d=${s.d}`;
  return `w=${s.w},d=${s.d},k=${s.kind},s=${s.style},r=${s.roof},f=${s.storeys}`;
}

const TREE_GREENS = ["#6b8a4e", "#7a9a56", "#5f8048", "#8aa262"];
const CONIFER_GREENS = ["#5f7f4a", "#557344", "#6a8a52"];

/** Non-building props. Returns null to skip. */
export function mapProp(tex: string, tx: number, ty: number): KitPlacement | null {
  const r = hash01(strHash(tex) % 997, tx, ty);
  const rot = Math.floor(r * 4) * (Math.PI / 2) + (r - 0.5) * 0.4;
  switch (tex) {
    case "o_tree":
    case "o_palm":
      return { key: "tree-a", variant: `c=${TREE_GREENS[Math.floor(r * TREE_GREENS.length)]}`, rotationY: rot, scale: 0.9 + r * 0.35, solid: true };
    case "o_pine":
      return { key: "tree-b", variant: `c=${CONIFER_GREENS[Math.floor(r * CONIFER_GREENS.length)]}`, rotationY: rot, scale: 0.95 + r * 0.45, solid: true };
    case "o_bush":
    case "o_hedge":
      return { key: "bush", variant: r > 0.6 ? "flowers=1" : "", rotationY: rot, scale: 0.9 + r * 0.3, solid: true };
    case "o_rock":
      return { key: "rock", rotationY: rot, scale: 0.8 + r * 0.5, solid: true };
    case "o_flower_pink":
      return { key: "flower-cluster", variant: "c=#d49a9a", rotationY: rot, scale: 0.9 };
    case "o_flower_yellow":
      return { key: "flower-cluster", variant: "c=#e6c96a", rotationY: rot, scale: 0.9 };
    case "o_fence_h":
      return { key: "wooden-fence", rotationY: 0, solid: true };
    case "o_fence_v":
      return { key: "wooden-fence", rotationY: Math.PI / 2, solid: true };
    case "o_railing":
      return { key: "wooden-fence", rotationY: 0, solid: true };
    case "o_lamp":
    case "o_lamp_ldn":
      return { key: "lamp-post", rotationY: 0, solid: true };
    case "o_bench":
      return { key: "bench", rotationY: 0, solid: true };
    case "o_sign":
      return { key: "signpost", rotationY: rot, solid: true };
    case "o_well":
      return { key: "well", solid: true };
    case "o_fountain":
      return { key: "fountain", solid: true, footprint: { w: 2, d: 2 } };
    case "o_phonebox":
      return { key: "phone-box", rotationY: 0, solid: true };
    case "o_bollard":
      return { key: "bollard" };
    case "o_planter":
      return { key: "planter", rotationY: rot, solid: true };
    case "o_bin":
      return { key: "crate", scale: 0.6 };
    case "v_car_red":
      return { key: "car", variant: "c=#c0392b,kind=car", rotationY: 0, solid: true, footprint: { w: 1, d: 2 } };
    case "v_car_blue":
      return { key: "car", variant: "c=#3f6fd0,kind=car", rotationY: 0, solid: true, footprint: { w: 1, d: 2 } };
    case "v_jeep_blue":
      return { key: "car", variant: "c=#3f6fd0,kind=jeep", rotationY: 0, solid: true, footprint: { w: 1, d: 2 } };
    case "o_cab":
      return { key: "car", variant: "c=#2a2a2a,kind=car", rotationY: 0, solid: true, footprint: { w: 1, d: 2 } };
    case "o_bus_red":
      return { key: "car", variant: "c=#c0392b,kind=jeep", scale: 1.4, rotationY: 0, solid: true, footprint: { w: 1, d: 3 } };
    case "o_foodtruck":
      return { key: "car", variant: "c=#e6c96a,kind=jeep", scale: 1.3, rotationY: Math.PI / 2, solid: true, footprint: { w: 3, d: 1 } };
    case "o_shadow":
    case "o_portal":
      return null;
    default:
      if (tex.startsWith("o_")) return { key: "crate", scale: 0.8 };
      return null;
  }
}
