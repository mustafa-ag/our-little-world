// Data-driven regional art direction. Every location declares (via its id /
// city) which visual region it belongs to; the renderers (materials,
// environment, dressing, world builder, backdrop, sky) read the profile
// instead of assuming Scotland.
//
// The SCOTLAND profile reproduces the hand-tuned Edinburgh look exactly: every
// colour below is the value that used to be hard-coded in the renderers (see
// the comments next to each field). Change Edinburgh here only on purpose.

import { PALETTE } from "../rendering/materials";

export type RegionKind = "scotland" | "uae_modern" | "uae_coastal" | "london" | "amman" | "italy" | "greece" | "germany";
export type BackdropStyle = "edinburgh" | "uae_skyline" | "london" | "coastal" | "hills" | "city_generic";
export type WallMaterial = "stone" | "render_white" | "render_cream" | "brick_london" | "limestone" | "marble";
export type RoofStyle = "slate" | "flat_parapet" | "terracotta" | "lead_flat" | "glass";
export type TreePrimary = "broadleaf" | "palm" | "mediterranean" | "bare_urban";
export type TreeSecondary = "pine" | "cypress" | "olive" | "none";
export type LampStyle = "victorian_iron" | "modern_steel" | "ornate_gold" | "minimal";
export type BenchStyle = "wooden_slat" | "stone" | "metal_modern";
export type LandmarkMesh = "castle" | "mosque" | "big_ben" | "burj" | "colosseum" | "none";

export interface WorldArtProfile {
  region: RegionKind;

  // ---- ground
  groundColor: string;
  pathColor: string;
  roadColor: string;
  sidewalkColor: string;
  /** true = t_sand tiles paint as sand (sandColor) instead of grass */
  hasSand: boolean;
  sandColor: string;

  // ---- sky / backdrop
  skyHorizonColor: string;
  skyZenithColor: string;
  backdropStyle: BackdropStyle;

  // ---- architecture
  wallMaterial: WallMaterial;
  roofStyle: RoofStyle;
  accentColor: string;

  // ---- vegetation
  treePrimary: TreePrimary;
  treeSecondary: TreeSecondary;
  hasHeather: boolean;
  hasPalms: boolean;
  hasIvy: boolean;
  flowerColor: string;

  // ---- street furniture
  lampStyle: LampStyle;
  benchStyle: BenchStyle;

  // ---- atmosphere
  ambientTint: string;
  fogColor: string;
  /** 0–1 (Babylon exp2 density, the time-of-day presets use ~0.008) */
  fogDensity: number;

  // ---- landmark
  landmarkMesh: LandmarkMesh;

  // ---- fine tuning (beyond the brief: needed to reproduce Edinburgh exactly)
  /** light / olive / dark tones mixed into the soft ground (grass) */
  groundTones: { light: string; olive: string; dark: string };
  /** colour of the endless ground plane under / beyond the map */
  underColor: string;
  /** carriageway texture: Scottish setts or plain asphalt */
  roadSurface: "setts" | "asphalt";
  /** flower colours the dressing picks from (flowerColor first) */
  flowerPalette: string[];
  /** foliage tint for broadleaf trees (null = the kit's own greens) */
  foliageTint: string | null;
  /**
   * 0 = the time-of-day presets untouched (Scotland); 1 = sky horizon/zenith
   * and fog fully replaced by the profile colours.
   */
  atmosphereStrength: number;
}

// ---------------------------------------------------------------------------
// Scotland: the exact values the renderers used before profiles existed.

const SCOTLAND: WorldArtProfile = {
  region: "scotland",
  groundColor: PALETTE.grass, // environment C.grass
  pathColor: "#ada08b", // environment C.path
  roadColor: "#9d978e", // environment C.road
  sidewalkColor: "#d2c6b1", // environment C.pavement
  hasSand: false, // t_sand painted as grass
  sandColor: "#e2cfa3",
  skyHorizonColor: "#dfe8e8", // lighting afternoon preset (not applied: atmosphereStrength 0)
  skyZenithColor: "#78acdc",
  backdropStyle: "edinburgh",
  wallMaterial: "stone",
  roofStyle: "slate",
  accentColor: PALETTE.wood,
  treePrimary: "broadleaf",
  treeSecondary: "pine",
  hasHeather: true,
  hasPalms: false,
  hasIvy: true,
  flowerColor: "#d9a3a3",
  lampStyle: "victorian_iron",
  benchStyle: "wooden_slat",
  ambientTint: "#ffffff",
  fogColor: "#d7e0e2", // lighting afternoon preset
  fogDensity: 0.0075,
  landmarkMesh: "castle",
  groundTones: { light: PALETTE.grassLight, olive: PALETTE.olive, dark: PALETTE.mossDark },
  underColor: "#8a9c66",
  roadSurface: "setts",
  flowerPalette: ["#d9a3a3", "#f1e7d0", "#e3cf86", "#bfa8d6", "#9b7fb0"], // dressing FLOWERS
  foliageTint: null,
  atmosphereStrength: 0,
};

const UAE_MODERN: WorldArtProfile = {
  region: "uae_modern",
  groundColor: "#94ad5c", // irrigated lawn
  pathColor: "#d9c9a6",
  roadColor: "#6e6c69",
  sidewalkColor: "#e4dac8",
  hasSand: true,
  sandColor: "#e3cc98",
  skyHorizonColor: "#f2e7d0",
  skyZenithColor: "#6aa3d9",
  backdropStyle: "uae_skyline",
  wallMaterial: "render_cream",
  roofStyle: "flat_parapet",
  accentColor: "#b08a54",
  treePrimary: "palm",
  treeSecondary: "none",
  hasHeather: false,
  hasPalms: true,
  hasIvy: false,
  flowerColor: "#d9467e", // bougainvillea
  lampStyle: "modern_steel",
  benchStyle: "metal_modern",
  ambientTint: "#fff3dc",
  fogColor: "#eee2c8",
  fogDensity: 0.006,
  landmarkMesh: "mosque",
  groundTones: { light: "#a7bd6c", olive: "#8a9a52", dark: "#6f8a44" },
  underColor: "#dcc592",
  roadSurface: "asphalt",
  flowerPalette: ["#d9467e", "#f3e9d6", "#f0b04a", "#e87aa6", "#c23a64"],
  foliageTint: "#7f9a4a",
  atmosphereStrength: 0.55,
};

/** Dubai: the same Gulf palette with glass towers. */
const UAE_DUBAI: WorldArtProfile = {
  ...UAE_MODERN,
  wallMaterial: "render_white",
  roofStyle: "glass",
  accentColor: "#8fa3b0",
  landmarkMesh: "burj",
};

const UAE_COASTAL: WorldArtProfile = {
  ...UAE_MODERN,
  region: "uae_coastal",
  groundColor: "#9bb164",
  sandColor: "#ead7a8",
  skyHorizonColor: "#eef0e4",
  skyZenithColor: "#5fa2dc",
  backdropStyle: "coastal",
  wallMaterial: "render_white",
  accentColor: "#5f9aa8",
  fogColor: "#e6ebe2",
  fogDensity: 0.005,
  landmarkMesh: "none",
  underColor: "#e2cfa0",
};

const LONDON: WorldArtProfile = {
  region: "london",
  groundColor: "#86a263",
  pathColor: "#b3aca0",
  roadColor: "#5f5e5c",
  sidewalkColor: "#c9c4ba",
  hasSand: false,
  sandColor: "#d8c79c",
  skyHorizonColor: "#dfe2e4",
  skyZenithColor: "#8fa9c4",
  backdropStyle: "london",
  wallMaterial: "brick_london",
  roofStyle: "slate",
  accentColor: "#2f3a4a",
  treePrimary: "broadleaf",
  treeSecondary: "none",
  hasHeather: false,
  hasPalms: false,
  hasIvy: true,
  flowerColor: "#c84a4a",
  lampStyle: "victorian_iron",
  benchStyle: "wooden_slat",
  ambientTint: "#f2f2f4",
  fogColor: "#d6d9dc",
  fogDensity: 0.009,
  landmarkMesh: "big_ben",
  groundTones: { light: "#98b170", olive: "#7a8a52", dark: "#566e40" },
  underColor: "#7f9660",
  roadSurface: "asphalt",
  flowerPalette: ["#c84a4a", "#f1e7d0", "#e3cf86", "#bfa8d6", "#d98aa0"],
  foliageTint: null,
  atmosphereStrength: 0.35,
};

/** Leicester: English suburb, no Parliament on the skyline. */
const ENGLAND_TOWN: WorldArtProfile = {
  ...LONDON,
  backdropStyle: "city_generic",
  landmarkMesh: "none",
  treeSecondary: "pine",
};

const AMMAN: WorldArtProfile = {
  region: "amman",
  groundColor: "#a7a672",
  pathColor: "#d6c7a8",
  roadColor: "#716d68",
  sidewalkColor: "#e2d8c4",
  hasSand: true,
  sandColor: "#d9c49a",
  skyHorizonColor: "#efe6d4",
  skyZenithColor: "#79a9d6",
  backdropStyle: "hills",
  wallMaterial: "limestone",
  roofStyle: "flat_parapet",
  accentColor: "#6f8a5a",
  treePrimary: "mediterranean",
  treeSecondary: "olive",
  hasHeather: false,
  hasPalms: false,
  hasIvy: false,
  flowerColor: "#c9508a",
  lampStyle: "minimal",
  benchStyle: "stone",
  ambientTint: "#fff4e4",
  fogColor: "#ebe1cf",
  fogDensity: 0.006,
  landmarkMesh: "none",
  groundTones: { light: "#b8b682", olive: "#8f9258", dark: "#77804a" },
  underColor: "#bfb088",
  roadSurface: "asphalt",
  flowerPalette: ["#c9508a", "#f3e9d6", "#e9b95a", "#b890d0", "#e07a8a"],
  foliageTint: "#8c9c6c",
  atmosphereStrength: 0.45,
};

const ITALY: WorldArtProfile = {
  region: "italy",
  groundColor: "#8fa45e",
  pathColor: "#cdb694",
  roadColor: "#7a736b",
  sidewalkColor: "#e0d1b6",
  hasSand: true,
  sandColor: "#dccaa2",
  skyHorizonColor: "#f1e8d6",
  skyZenithColor: "#5d9bd6",
  backdropStyle: "coastal",
  wallMaterial: "render_cream",
  roofStyle: "terracotta",
  accentColor: "#3f7f8f",
  treePrimary: "mediterranean",
  treeSecondary: "cypress",
  hasHeather: false,
  hasPalms: false,
  hasIvy: true,
  flowerColor: "#e0b83a", // lemons / broom
  lampStyle: "ornate_gold",
  benchStyle: "stone",
  ambientTint: "#fff2dc",
  fogColor: "#e9e6da",
  fogDensity: 0.005,
  landmarkMesh: "none",
  groundTones: { light: "#a2b56c", olive: "#7f8b4e", dark: "#5f7440" },
  underColor: "#8f9c62",
  roadSurface: "asphalt",
  flowerPalette: ["#e0b83a", "#f3e9d6", "#d9467e", "#bfa8d6", "#e8804a"],
  foliageTint: "#7e9660",
  atmosphereStrength: 0.45,
};

const GREECE: WorldArtProfile = {
  ...ITALY,
  region: "greece",
  groundColor: "#a2a46c",
  pathColor: "#e8e2d6",
  sidewalkColor: "#f1ece2",
  sandColor: "#d8c7a4",
  skyHorizonColor: "#eef0ea",
  skyZenithColor: "#3f8ad6",
  wallMaterial: "render_white",
  roofStyle: "flat_parapet",
  accentColor: "#2f64b0",
  treeSecondary: "olive",
  hasIvy: false,
  flowerColor: "#c2408a",
  lampStyle: "minimal",
  fogColor: "#e7ecee",
  groundTones: { light: "#b3b47c", olive: "#8e9258", dark: "#6e7a48" },
  underColor: "#b8a988",
  flowerPalette: ["#c2408a", "#f5f1e8", "#e9b95a", "#8fa8d6", "#d9467e"],
};

const GERMANY: WorldArtProfile = {
  region: "germany",
  groundColor: "#8aa564",
  pathColor: "#b8ad9c",
  roadColor: "#66645f",
  sidewalkColor: "#cfc7b8",
  hasSand: false,
  sandColor: "#d6c69e",
  skyHorizonColor: "#e2e6e6",
  skyZenithColor: "#7fa8d2",
  backdropStyle: "city_generic",
  wallMaterial: "render_cream",
  roofStyle: "slate",
  accentColor: "#7a3a2e",
  treePrimary: "broadleaf",
  treeSecondary: "pine",
  hasHeather: false,
  hasPalms: false,
  hasIvy: true,
  flowerColor: "#d24a4a", // geraniums
  lampStyle: "minimal",
  benchStyle: "wooden_slat",
  ambientTint: "#f6f4f0",
  fogColor: "#d9dedf",
  fogDensity: 0.008,
  landmarkMesh: "none",
  groundTones: { light: "#9cb474", olive: "#7c8a50", dark: "#58703e" },
  underColor: "#849a60",
  roadSurface: "asphalt",
  flowerPalette: ["#d24a4a", "#f1e7d0", "#e3cf86", "#bfa8d6", "#e67a7a"],
  foliageTint: null,
  atmosphereStrength: 0.3,
};

// ---------------------------------------------------------------------------
// Location → profile. Explicit ids first; unknown ids fall back by prefix and
// finally to Scotland (the only fully art-directed region so far).

export const LOCATION_PROFILES: Record<string, WorldArtProfile> = {
  // Abu Dhabi
  abudhabi_yas: UAE_MODERN,
  abudhabi_noya: UAE_MODERN,
  abudhabi_yasmall: UAE_MODERN,
  abudhabi_city: UAE_MODERN,
  abudhabi_saadiyat: UAE_MODERN,
  abudhabi_last_exit: UAE_MODERN,
  abudhabi_corniche: UAE_COASTAL,
  abudhabi_hudayriyat: UAE_COASTAL,
  // Dubai
  dubai_downtown: UAE_DUBAI,
  dubai_szr: UAE_DUBAI,
  dubai_damac: UAE_DUBAI,
  dubai_oasis: UAE_DUBAI,
  dubai_hills: UAE_DUBAI,
  // England
  london_westminster: LONDON,
  london_westend: LONDON,
  leicester: ENGLAND_TOWN,
  // Scotland
  edinburgh_oldtown: SCOTLAND,
  edinburgh_dean: SCOTLAND,
  edinburgh_uni: SCOTLAND,
  // elsewhere
  germany: GERMANY,
  amman: AMMAN,
  italy_positano: ITALY,
  greece_santorini: GREECE,
};

const PREFIX_PROFILES: [string, WorldArtProfile][] = [
  ["edinburgh", SCOTLAND],
  ["abudhabi", UAE_MODERN],
  ["dubai", UAE_DUBAI],
  ["london", LONDON],
  ["amman", AMMAN],
  ["italy", ITALY],
  ["greece", GREECE],
  ["germany", GERMANY],
];

export const SCOTLAND_PROFILE: Readonly<WorldArtProfile> = SCOTLAND;

export function getArtProfile(locationId: string): WorldArtProfile {
  const p = LOCATION_PROFILES[locationId] ?? PREFIX_PROFILES.find(([pre]) => locationId.startsWith(pre))?.[1] ?? SCOTLAND;
  return p;
}
