// Building presets: a dozen art-directed cottage / shop / café / tenement
// looks. A preset + footprint is the whole variant string, so the number of
// building prototypes stays small and thin instances batch well.

import { PALETTE } from "../../../rendering/materials";
import { hash01, parseVariant } from "../util";

export type BuildingKind = "cottage" | "shop" | "cafe" | "tenement";

export interface CottageSpec {
  w: number;
  d: number;
  kind: BuildingKind;
  storeys: number;
  /** wall tint (stone / harl) */
  wall: string;
  roof: "slate" | "terra";
  roofTint: string;
  /** crow-stepped gables (Scottish) */
  crow: boolean;
  /** chimney style: 1 = square gable stack with two pots, 2 = wide ridge stack */
  chimney: 1 | 2;
  /** chimney stacks (1 = one gable end, 2 = both) */
  chimneys: 1 | 2;
  dormers: number;
  door: string;
  arch: boolean;
  shutters: string | null;
  curtains: string | null;
  /** share of ground-floor windows with a flower box (0..1) */
  flowerBoxes: number;
  ivy: boolean;
  moss: boolean;
  /** wall-mounted trough planter next to the door */
  wallPlanter: boolean;
  /** little iron lantern beside the door */
  lantern: boolean;
  /** door in the middle slot or to one side */
  doorSide: boolean;
  trim: string;
  /** whole-building lean in radians (±) */
  lean: number;
  /** roof ridge sag in units */
  sag: number;
  seed: number;
  /** sign band colour for shops / cafés */
  sign: string;
  // ---- silhouette (derived per preset + footprint in specFromVariant unless the preset sets them)
  /** ridge runs front→back so the gable faces the street */
  gableFront?: boolean;
  /** single-pitch lean-to on one side (-1 west, +1 east, 0 none) */
  leanTo?: -1 | 0 | 1;
  /** small gabled porch over the door */
  porch?: boolean;
  /** canted bay window on the ground floor */
  bay?: boolean;
  /** roof pitch multiplier (~0.8 low … 1.25 steep) */
  pitch?: number;
}

const P = PALETTE as Record<string, string>;
const pal = (k: string, fallback: string) => P[k] ?? fallback;
/** soften a roof colour toward warm grey so pantiles stay storybook, not brick-red */
const mix2 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = 0.22;
  const c = (v: number, to: number) => Math.round(v + (to - v) * t).toString(16).padStart(2, "0");
  return `#${c(r, 170)}${c(g, 140)}${c(b, 120)}`;
};

export const TINTS = {
  cream: pal("cream", "#eadcc2"),
  creamSoft: "#e6dac4",
  stoneWarm: pal("stoneWarm", "#c9b89a"),
  greyStone: pal("greyStone", "#b8b0a2"),
  softGrey: "#c7c1b5",
  rose: "#dcc2b0",
  sand: "#d4c3a0",
  white: "#ece5d5",
  slate: pal("slate", "#6f7480"),
  slateBlue: pal("slateBlue", "#66707c"),
  slateDark: "#5c626d",
  terra: mix2(pal("terracottaMuted", "#b8694a")),
  terraLight: "#bd8468",
  terraDark: "#9e6650",
  olive: pal("olive", "#7f8b56"),
  mossDark: pal("mossDark", "#55703f"),
  moss: pal("moss", "#6b8a4e"),
  sage: pal("sage", "#8fa87c"),
  dustyBlue: "#6f8398",
  oxblood: "#7c433d",
  wood: pal("wood", "#8a5a3a"),
  teal: pal("carTeal", "#5f8f8a"),
  awning: pal("awning", "#b34d47"),
  trim: "#f3ecdc",
  dustyRose: pal("dustyRose", "#d49a9a"),
  lavender: pal("lavender", "#b59bd1"),
  mutedYellow: pal("mutedYellow", "#e6c96a"),
  curtainCream: "#f0e6d0",
  curtainSage: "#b6c6a6",
} as const;

type Preset = Omit<CottageSpec, "w" | "d" | "seed">;

const base: Preset = {
  kind: "cottage",
  storeys: 1,
  wall: TINTS.cream,
  roof: "slate",
  roofTint: TINTS.slate,
  crow: false,
  chimney: 1,
  chimneys: 1,
  dormers: 0,
  door: TINTS.olive,
  arch: false,
  shutters: null,
  curtains: TINTS.curtainCream,
  flowerBoxes: 0.6,
  ivy: false,
  moss: false,
  wallPlanter: false,
  lantern: false,
  doorSide: false,
  trim: TINTS.trim,
  lean: 0,
  sag: 0.03,
  sign: "#4a5f4a",
};

export const PRESETS: Record<string, Preset> = {
  // --- cottages -----------------------------------------------------------
  /** warm sandstone, slate, crow-stepped gable, ivy corner, olive door */
  stoneCrow: { ...base, wall: TINTS.stoneWarm, roof: "slate", roofTint: TINTS.slateBlue, crow: true, arch: true, ivy: true, moss: true, door: TINTS.olive, shutters: null, lantern: true, lean: 0.012, sag: 0.045 },
  /** cream harl, muted terracotta pantiles, sage shutters, flower boxes */
  creamTerra: { ...base, wall: TINTS.cream, roof: "terra", roofTint: TINTS.terra, door: TINTS.dustyBlue, shutters: TINTS.sage, curtains: TINTS.dustyRose, flowerBoxes: 0.8, wallPlanter: true, lean: -0.01, sag: 0.035 },
  /** two storeys, grey stone, slate, dormer, ivy, oxblood door */
  greyDormer: { ...base, storeys: 2, wall: TINTS.greyStone, roof: "slate", roofTint: TINTS.slate, dormers: 1, chimney: 2, ivy: true, arch: true, door: TINTS.oxblood, curtains: TINTS.curtainCream, flowerBoxes: 0.5, lantern: true, sag: 0.05 },
  /** two storeys, cream, terracotta, crow steps, sage shutters */
  creamCrow2: { ...base, storeys: 2, wall: TINTS.creamSoft, roof: "terra", roofTint: TINTS.terraLight, crow: true, chimneys: 2, shutters: TINTS.sage, door: TINTS.sage, curtains: TINTS.curtainSage, flowerBoxes: 0.6, lean: 0.015, sag: 0.04 },
  /** soft grey stone, mossy terracotta roof, red-brown door, side door */
  greyMoss: { ...base, wall: TINTS.softGrey, roof: "terra", roofTint: TINTS.terraDark, moss: true, door: TINTS.oxblood, doorSide: true, arch: true, curtains: TINTS.dustyRose, flowerBoxes: 0.7, wallPlanter: true, lean: -0.014, sag: 0.05 },
  /** two storeys, sand, slate, two dormers, sage door, dusty-blue shutters */
  sandDormer2: { ...base, storeys: 2, wall: TINTS.sand, roof: "slate", roofTint: TINTS.slateDark, dormers: 2, chimneys: 2, door: TINTS.sage, shutters: TINTS.dustyBlue, curtains: TINTS.curtainCream, flowerBoxes: 0.5, lantern: true, sag: 0.03 },
  /** dusty rose harl, terracotta, white trim, dusty-blue door */
  rose2: { ...base, storeys: 2, wall: TINTS.rose, roof: "terra", roofTint: TINTS.terra, door: TINTS.dustyBlue, shutters: TINTS.dustyBlue, curtains: TINTS.curtainCream, flowerBoxes: 0.7, doorSide: true, lean: 0.01, sag: 0.04 },
  /** small grey stone bothy, crow steps, teal door, moss */
  bothy: { ...base, wall: TINTS.greyStone, roof: "slate", roofTint: TINTS.slateBlue, crow: true, moss: true, door: TINTS.teal, arch: false, curtains: TINTS.curtainSage, flowerBoxes: 0.5, ivy: true, lean: -0.012, sag: 0.05 },
  /** white-washed, slate, olive shutters, wall planter, lantern */
  whiteSlate: { ...base, wall: TINTS.white, roof: "slate", roofTint: TINTS.slate, shutters: TINTS.olive, door: TINTS.oxblood, curtains: TINTS.dustyRose, flowerBoxes: 0.8, wallPlanter: true, lantern: true, chimney: 2, sag: 0.035 },
  // --- shops / café / tenements ------------------------------------------
  shop: { ...base, kind: "shop", storeys: 2, wall: TINTS.cream, roof: "slate", roofTint: TINTS.slate, sign: "#5a3e3a", door: TINTS.oxblood, curtains: TINTS.curtainCream, flowerBoxes: 0.5, chimneys: 2 },
  shopGrey: { ...base, kind: "shop", storeys: 2, wall: TINTS.greyStone, roof: "slate", roofTint: TINTS.slateBlue, sign: "#3f5a5a", door: TINTS.teal, curtains: TINTS.curtainCream, flowerBoxes: 0.5, chimneys: 2, ivy: true },
  cafe: { ...base, kind: "cafe", storeys: 1, wall: TINTS.creamSoft, roof: "terra", roofTint: TINTS.terra, sign: "#4a5f4a", door: TINTS.olive, curtains: null, flowerBoxes: 0, ivy: true, lantern: true, chimney: 2, moss: true, sag: 0.04 },
  tenementSand: { ...base, kind: "tenement", storeys: 3, wall: TINTS.stoneWarm, roof: "slate", roofTint: TINTS.slate, chimneys: 2, dormers: 1, arch: true, door: TINTS.oxblood, curtains: TINTS.curtainCream, flowerBoxes: 0.3, sag: 0.02 },
  tenementGrey: { ...base, kind: "tenement", storeys: 3, wall: TINTS.greyStone, roof: "slate", roofTint: TINTS.slateBlue, chimneys: 2, arch: true, door: TINTS.dustyBlue, curtains: TINTS.dustyRose, flowerBoxes: 0.3, ivy: true, sag: 0.025 },
  tenementRose: { ...base, kind: "tenement", storeys: 3, wall: TINTS.rose, roof: "slate", roofTint: TINTS.slateDark, chimneys: 2, dormers: 2, arch: true, door: TINTS.olive, curtains: TINTS.curtainCream, flowerBoxes: 0.4, sag: 0.02 },
};

export const COTTAGE_PRESETS = ["stoneCrow", "creamTerra", "greyDormer", "creamCrow2", "greyMoss", "sandDormer2", "rose2", "bothy", "whiteSlate"];
export const PRESET_1S = ["stoneCrow", "creamTerra", "greyMoss", "bothy", "whiteSlate"];
export const PRESET_2S = ["greyDormer", "creamCrow2", "sandDormer2", "rose2"];

export function presetVariant(preset: string, w: number, d: number) {
  return `p=${preset},w=${w},d=${d}`;
}

/** Legacy "k=,s=,r=,f=" strings (propMap) map onto the closest preset. */
function legacyPreset(v: Record<string, string>) {
  const kind = v.k ?? "cottage";
  const storeys = parseInt(v.f ?? "1", 10) || 1;
  const s = v.s ?? "cream";
  if (kind === "tenement") return s === "rose" ? "tenementRose" : s === "grey" ? "tenementGrey" : "tenementSand";
  if (kind === "cafe") return "cafe";
  if (kind === "shop") return s === "grey" || s === "sand" ? "shopGrey" : "shop";
  if (storeys >= 2) return s === "grey" ? "greyDormer" : s === "rose" ? "rose2" : s === "sand" ? "sandDormer2" : "creamCrow2";
  return s === "grey" ? "bothy" : s === "sand" ? "stoneCrow" : s === "stucco" ? "whiteSlate" : s === "rose" ? "greyMoss" : "creamTerra";
}

export function specFromVariant(variant: string): CottageSpec {
  const v = parseVariant(variant);
  const name = v.p && PRESETS[v.p] ? v.p : legacyPreset(v);
  const p = PRESETS[name];
  const w = Math.max(2, parseFloat(v.w ?? "3"));
  const d = Math.max(2, parseFloat(v.d ?? "3"));
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) % 9973;
  seed = Math.floor(hash01(seed, w, d) * 1000);
  const spec: CottageSpec = { ...p, w, d, seed };
  // silhouette variety before decoration: gables to the street on narrow
  // cottages, lean-tos, porches, bays, steeper / lower roofs
  const r = (k: number) => hash01(seed, k, 5);
  const house = spec.kind === "cottage";
  if (spec.gableFront === undefined) spec.gableFront = house && !spec.crow && w <= 3 && spec.storeys === 1 && r(1) > 0.35;
  if (spec.leanTo === undefined) spec.leanTo = house && w >= 4 && r(2) > 0.5 ? (r(3) > 0.5 ? 1 : -1) : 0;
  if (spec.porch === undefined) spec.porch = house && !spec.arch && r(4) > 0.45;
  if (spec.bay === undefined) spec.bay = (house || spec.kind === "tenement") && w - (spec.leanTo ? 0.85 : 0) >= 3.3 && r(6) > 0.45;
  if (spec.pitch === undefined) spec.pitch = spec.kind === "tenement" ? 1 : 0.82 + r(7) * 0.42;
  return spec;
}
