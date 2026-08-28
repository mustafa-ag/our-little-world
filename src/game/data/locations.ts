// ---------------------------------------------------------------------------
// Jasmin's world — Pokémon-scale districts, placed like the real cities.
//
// Each "location" is one district (several camera-screens across). Walking to
// the edge takes you to the next district; the Jeep fast-travels inside a city.
// The globe groups districts into cities.
// ---------------------------------------------------------------------------

import { arcRoad, jeep, mixAlongArc, mixCol, mixRow, palms, roundabout } from "./mapkit";

export type BuildingRole = "cafe" | "shop" | "apartment" | "uni" | "plain" | "stairs" | "salon";
export type PoiRole = BuildingRole | "home" | "landmark" | "drive" | "deco";
export type Cardinal = "north" | "south" | "east" | "west";

export interface BuildingDef {
  tex: string;
  name?: string;
  role?: BuildingRole;
  desc?: string;
}

export interface SceneryDef {
  tex: string;
  tx: number;
  ty: number;
  solid?: boolean;
}

export interface Poi {
  tex: string;
  tx: number;
  ty: number;
  role?: PoiRole;
  name?: string;
  desc?: string;
  npc?: string;
  solid?: boolean;
  tag?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DistrictBand extends Rect {
  name: string;
  ground: string;
  alt?: string;
}

export interface CityDef {
  w: number;
  h: number;
  base: string;
  baseAlt: string;
  road: string;
  border: "tree" | "pine" | "rock" | "fence";
  /** Authored maps skip random bush scatter so streets stay designed. */
  dense?: boolean;
  districts?: DistrictBand[];
  roads?: Rect[];
  water?: Rect[];
  pois: Poi[];
  spawn: { tx: number; ty: number };
  /** Where you appear when walking in from a neighbouring district. */
  entry?: Partial<Record<Cardinal, { tx: number; ty: number }>>;
}

export interface LocationDef {
  id: string;
  /** Parent city on the globe (e.g. "dubai"). */
  cityId: string;
  name: string;
  subtitle: string;
  ground: string;
  groundAlt: string;
  path: string;
  border: "tree" | "pine" | "rock" | "fence";
  landmark?: string;
  landmarkName?: string;
  skyline?: string[];
  scenery?: SceneryDef[];
  hasWater: boolean;
  hasHome: boolean;
  homeName?: string;
  homeTex?: string;
  buildings: BuildingDef[];
  city?: CityDef;
  geo: { lat: number; lng: number };
  pin: { x: number; y: number };
  exits?: Partial<Record<Cardinal, string>>;
}

export interface CityMeta {
  id: string;
  name: string;
  hub: string;
  geo: { lat: number; lng: number };
}

export const CITIES: CityMeta[] = [
  { id: "abudhabi", name: "Abu Dhabi", hub: "abudhabi_yas", geo: { lat: 24.45, lng: 54.61 } },
  { id: "dubai", name: "Dubai", hub: "dubai_downtown", geo: { lat: 25.2, lng: 55.27 } },
  { id: "london", name: "London", hub: "london_westend", geo: { lat: 51.51, lng: -0.13 } },
  { id: "edinburgh", name: "Edinburgh", hub: "edinburgh_oldtown", geo: { lat: 55.95, lng: -3.19 } },
  { id: "leicester", name: "Leicester", hub: "leicester", geo: { lat: 52.6, lng: -1.08 } },
  { id: "germany", name: "Frankfurt", hub: "germany", geo: { lat: 50.11, lng: 8.68 } },
  { id: "amman", name: "Amman", hub: "amman", geo: { lat: 31.95, lng: 35.93 } },
];

const loc = (
  partial: Omit<LocationDef, "ground" | "groundAlt" | "path" | "border" | "hasWater" | "hasHome" | "buildings" | "pin"> &
    Partial<LocationDef>,
): LocationDef => ({
  ground: "t_sand",
  groundAlt: "t_grass2",
  path: "t_road",
  border: "fence",
  hasWater: false,
  hasHome: false,
  buildings: [],
  pin: { x: 0.5, y: 0.5 },
  ...partial,
});

const YAS = ["b_villa_terra", "b_villa_terra2", "b_villa_terra3", "b_villa_terra", "b_villa_modern"];
const SANT = ["b_town_blue", "b_town_blue2", "b_town_blue", "b_villa_modern"];
const TERRACE = ["b_terrace_brick", "b_townhouse_red", "b_townhouse_cream", "b_terrace_brick"];
const GLASS = ["b_glass_a", "b_glass_b", "b_glass_c"];
const TENEMENT = ["b_tenement", "b_townhouse_cream", "b_tenement", "b_townhouse_red"];

// ===========================================================================
// DUBAI — north = Gulf / Downtown; south-west = Damac Lagoons; south-east =
// Silicon Oasis. Sheikh Zayed Road is the long walk between them.
// ===========================================================================
const RES_TEX = ["b_residence", "b_tower", "b_glass_c", "b_residence", "b_glass_b", "b_tower", "b_residence", "b_glass_a"];

const DUBAI_DOWNTOWN: CityDef = {
  w: 148,
  h: 108,
  base: "t_sand",
  baseAlt: "t_cobble",
  road: "t_road",
  border: "fence",
  dense: true,
  water: [{ x: 32, y: 8, w: 48, h: 18 }],
  districts: [{ name: "Downtown Dubai", x: 10, y: 14, w: 128, h: 82, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 28, w: 132, h: 3 },
    { x: 8, y: 78, w: 132, h: 3 },
    { x: 24, y: 12, w: 3, h: 84 },
    { x: 64, y: 12, w: 3, h: 28 },
    ...arcRoad(102, 52, 22, -0.55, 2.35, 3),
    ...arcRoad(102, 52, 34, -0.4, 2.2, 2),
  ],
  pois: [
    { tex: "lm_burj", tx: 52, ty: 28, role: "landmark", name: "Burj Khalifa" },
    {
      tex: "b_mall",
      tx: 36,
      ty: 48,
      role: "cafe",
      name: "Dubai Mall",
      tag: "dubai_mall",
      desc: "The mall wrapped around the Burj. Fashion Avenue, the fountain, the aquarium.",
    },
    { tex: "b_shop", tx: 54, ty: 54, role: "shop", name: "Souk Al Bahar" },
    ...mixAlongArc(RES_TEX, 102, 52, 28, -0.5, 2.2, 8),
    ...mixAlongArc(["b_glass_a", "b_residence", "b_tower", "b_glass_c", "b_residence", "b_glass_b"], 102, 52, 16, -0.35, 2.05, 6),
    {
      tex: "b_residence",
      tx: 124,
      ty: 48,
      role: "stairs",
      name: "The Residences T8 · 1701",
      tag: "residences_t8",
      desc: "Stairs up to the lobby, then 1701. Your Downtown apartment 🤍",
    },
    {
      tex: "b_spinneys",
      tx: 108,
      ty: 62,
      role: "shop",
      name: "Spinneys",
      desc: "Mid-curve on the side of the Residences road.",
    },
    ...mixRow(GLASS, 12, 20, 3, 18),
    ...mixRow(["b_glass_b", "b_glass_a", "b_glass_c", "b_tower"], 12, 88, 4, 22),
    ...palms(14, 36, 6, 16),
    ...palms(18, 70, 5, 18),
    jeep(70, 86),
  ],
  spawn: { tx: 70, ty: 86 },
  entry: {
    south: { tx: 70, ty: 100 },
    north: { tx: 70, ty: 18 },
  },
};

const DUBAI_SZR: CityDef = {
  w: 76,
  h: 168,
  base: "t_sand",
  baseAlt: "t_sand",
  road: "t_road",
  border: "fence",
  dense: true,
  districts: [{ name: "Sheikh Zayed Road", x: 10, y: 6, w: 56, h: 156, ground: "t_sand" }],
  roads: [
    { x: 30, y: 4, w: 14, h: 160 },
    { x: 4, y: 36, w: 68, h: 2 },
    { x: 4, y: 72, w: 68, h: 2 },
    { x: 4, y: 108, w: 68, h: 2 },
    { x: 4, y: 144, w: 68, h: 2 },
  ],
  pois: [
    ...mixCol(["b_glass_a", "b_tower", "b_glass_c", "b_residence", "b_glass_b", "b_glass_a", "b_tower", "b_glass_c"], 14, 14, 8, 18),
    ...mixCol(["b_glass_b", "b_residence", "b_glass_a", "b_tower", "b_glass_c", "b_glass_b", "b_residence", "b_glass_a"], 58, 18, 8, 18),
    ...mixCol(["o_palm"], 24, 22, 7, 20),
    ...mixCol(["o_palm"], 50, 30, 7, 20),
    jeep(36, 84),
  ],
  spawn: { tx: 36, ty: 12 },
  entry: {
    north: { tx: 36, ty: 8 },
    south: { tx: 36, ty: 158 },
    west: { tx: 8, ty: 120 },
    east: { tx: 64, ty: 120 },
  },
};

const DUBAI_DAMAC: CityDef = {
  w: 128,
  h: 110,
  base: "t_grass2",
  baseAlt: "t_grass",
  road: "t_path",
  border: "fence",
  dense: true,
  water: [
    { x: 8, y: 8, w: 20, h: 14 },
    { x: 96, y: 10, w: 22, h: 16 },
    { x: 14, y: 78, w: 18, h: 12 },
    { x: 88, y: 82, w: 20, h: 12 },
  ],
  districts: [
    { name: "Santorini", x: 10, y: 22, w: 70, h: 72, ground: "t_grass2", alt: "t_grass" },
    { name: "Damac Lagoons", x: 82, y: 28, w: 38, h: 50, ground: "t_grass", alt: "t_grass2" },
  ],
  roads: [
    { x: 8, y: 52, w: 112, h: 3 },
    ...roundabout(58, 52, 6, 2),
    { x: 28, y: 16, w: 3, h: 40 },
    { x: 8, y: 22, w: 22, h: 2 },
    { x: 8, y: 34, w: 22, h: 2 },
    { x: 8, y: 46, w: 22, h: 2 },
    { x: 8, y: 78, w: 100, h: 2 },
    { x: 108, y: 48, w: 16, h: 3 },
  ],
  pois: [
    {
      tex: "b_adnoc",
      tx: 116,
      ty: 48,
      role: "plain",
      name: "ADNOC",
      desc: "On the way in from the main gate — petrol, not a supermarket.",
    },
    {
      tex: "o_sign",
      tx: 108,
      ty: 42,
      role: "plain",
      name: "Damac Lagoons gate",
      desc: "Straight from the main gate, through the roundabout, then the inner gates.",
    },
    {
      tex: "b_town_blue2",
      tx: 14,
      ty: 20,
      role: "plain",
      name: "Mama's townhouse",
      desc: "White and blue, Santorini cluster. Straight, roundabout, gates, right, 3rd left.",
      npc: "mama",
    },
    ...mixRow(SANT, 10, 32, 3, 10),
    ...mixRow(["b_town_blue2", "b_town_blue"], 10, 44, 2, 12),
    ...mixAlongArc(SANT, 58, 52, 16, 0.4, 2.6, 6),
    ...mixAlongArc(["b_town_blue", "b_villa_modern", "b_town_blue2", "b_town_blue"], 58, 52, 24, 0.2, 2.8, 7),
    ...mixRow(["b_villa_sand", "b_villa_modern", "b_villa_sand"], 84, 68, 3, 12),
    ...palms(12, 12, 6, 14),
    ...palms(16, 96, 6, 14),
    jeep(62, 56),
  ],
  spawn: { tx: 118, ty: 54 },
  entry: {
    east: { tx: 122, ty: 54 },
    north: { tx: 58, ty: 14 },
  },
};

const DUBAI_OASIS: CityDef = {
  w: 120,
  h: 100,
  base: "t_sand",
  baseAlt: "t_grass2",
  road: "t_road",
  border: "fence",
  dense: true,
  districts: [{ name: "Dubai Silicon Oasis", x: 10, y: 14, w: 100, h: 72, ground: "t_sand" }],
  roads: [
    { x: 8, y: 46, w: 104, h: 3 },
    { x: 56, y: 8, w: 3, h: 84 },
    { x: 8, y: 22, w: 104, h: 2 },
    { x: 8, y: 72, w: 104, h: 2 },
    ...arcRoad(56, 48, 18, -0.3, 3.4, 2),
  ],
  pois: [
    {
      tex: "b_so2",
      tx: 52,
      ty: 58,
      role: "apartment",
      name: "SO2",
      desc: "Moomoo's building. Stairs up to the lobby.",
      npc: "moomoo",
    },
    { tex: "b_so1", tx: 38, ty: 56, role: "plain", name: "SO1", desc: "Next door to SO2." },
    { tex: "b_glass_b", tx: 70, ty: 54, role: "plain", name: "Axis 4", desc: "Opposite SO2." },
    {
      tex: "b_spinneys",
      tx: 88,
      ty: 48,
      role: "shop",
      name: "Cedre Spinneys",
      desc: "The neighbourhood Spinneys.",
    },
    ...mixRow(["b_glass_c", "b_tower", "b_glass_a", "b_glass_b"], 14, 28, 4, 22),
    ...mixRow(["b_villa_modern", "b_glass_c", "b_villa_sand", "b_villa_modern"], 16, 80, 4, 20),
    ...palms(14, 16, 7, 14),
    jeep(48, 46),
  ],
  spawn: { tx: 12, ty: 48 },
  entry: {
    west: { tx: 8, ty: 48 },
    north: { tx: 56, ty: 12 },
  },
};

const DUBAI_HILLS: CityDef = {
  w: 116,
  h: 96,
  base: "t_grass2",
  baseAlt: "t_grass",
  road: "t_road",
  border: "fence",
  dense: true,
  districts: [{ name: "Dubai Hills", x: 12, y: 16, w: 92, h: 64, ground: "t_grass2", alt: "t_grass" }],
  roads: [
    { x: 8, y: 48, w: 100, h: 3 },
    { x: 54, y: 10, w: 3, h: 76 },
    ...arcRoad(54, 48, 20, 0.2, 2.9, 2),
  ],
  pois: [
    {
      tex: "b_mall",
      tx: 54,
      ty: 32,
      role: "cafe",
      name: "Dubai Hills Mall",
      tag: "dubai_hills_mall",
      desc: "Our mall.",
    },
    {
      tex: "b_saddle",
      tx: 36,
      ty: 50,
      role: "cafe",
      name: "Saddle",
      tag: "saddle",
      desc: "Anytime you see it, you stop for coffee.",
    },
    ...mixAlongArc(["b_villa_modern", "b_villa_terra2", "b_villa_modern", "b_villa_terra"], 54, 48, 28, 0.3, 2.8, 7),
    ...mixRow(GLASS, 14, 20, 3, 20),
    ...palms(16, 72, 6, 14),
    jeep(58, 54),
  ],
  spawn: { tx: 54, ty: 80 },
  entry: { north: { tx: 54, ty: 12 } },
};

// ===========================================================================
// ABU DHABI — Yas Island (NE, home) · city / Grand Mosque · Corniche west
// ===========================================================================
const AD_YAS: CityDef = {
  w: 168,
  h: 128,
  base: "t_sand",
  baseAlt: "t_sand",
  road: "t_road",
  border: "fence",
  dense: true,
  water: [
    { x: 124, y: 36, w: 22, h: 14 },
    { x: 136, y: 64, w: 18, h: 16 },
  ],
  districts: [
    { name: "The Magnolias", x: 14, y: 16, w: 96, h: 88, ground: "t_grass2", alt: "t_grass" },
    { name: "Yas Links", x: 112, y: 12, w: 52, h: 92, ground: "t_grass", alt: "t_grass2" },
    { name: "The Redwoods", x: 112, y: 106, w: 48, h: 16, ground: "t_grass2", alt: "t_grass" },
  ],
  roads: [
    { x: 4, y: 4, w: 6, h: 120 },
    { x: 4, y: 10, w: 108, h: 3 },
    { x: 4, y: 112, w: 112, h: 3 },
    ...roundabout(50, 112, 7, 2),
    ...roundabout(22, 48, 4, 2),
    ...arcRoad(72, 56, 34, 0.35 * Math.PI, 1.65 * Math.PI, 2),
    ...arcRoad(72, 56, 22, 0.4 * Math.PI, 1.6 * Math.PI, 2),
    ...arcRoad(40, 86, 16, Math.PI * 0.15, Math.PI * 1.15, 2),
    ...arcRoad(38, 30, 14, Math.PI * 0.7, Math.PI * 1.9, 2),
    { x: 100, y: 18, w: 3, h: 88 },
  ],
  pois: [
    {
      tex: "o_sign",
      tx: 28,
      ty: 8,
      role: "plain",
      name: "Yas Lea Gate 1",
      desc: "The north gate into Yas Acres.",
    },
    {
      tex: "o_sign",
      tx: 48,
      ty: 118,
      role: "plain",
      name: "Al Ishbah Street",
      desc: "The roundabout at the bottom of the neighbourhood.",
    },
    {
      tex: "b_villa_terra2",
      tx: 96,
      ty: 48,
      role: "home",
      name: "Yas Magnolias 2",
      desc: "Baba's villa on the golf-edge curve. Home Fridays and Saturdays.",
      npc: "baba",
    },
    ...mixAlongArc(YAS, 72, 56, 38, 0.38 * Math.PI, 1.62 * Math.PI, 11),
    ...mixAlongArc(
      ["b_villa_terra3", "b_villa_terra", "b_villa_terra2", "b_villa_modern", "b_villa_terra", "b_villa_terra3", "b_villa_terra2"],
      72,
      56,
      28,
      0.42 * Math.PI,
      1.58 * Math.PI,
      7,
    ),
    ...mixAlongArc(["b_villa_terra", "b_villa_terra3", "b_villa_terra2", "b_villa_terra", "b_villa_modern"], 40, 86, 20, 0.2 * Math.PI, 1.1 * Math.PI, 5),
    ...mixAlongArc(["b_villa_terra2", "b_villa_terra", "b_villa_terra3", "b_villa_terra"], 38, 30, 18, 0.75 * Math.PI, 1.85 * Math.PI, 4),
    {
      tex: "b_mosque_acres",
      tx: 104,
      ty: 62,
      role: "landmark",
      name: "Yas Acres Ja'mee",
      desc: "The neighbourhood mosque, on the edge of the golf.",
    },
    ...mixRow(["b_villa_terra", "b_villa_terra3", "b_villa_modern"], 118, 110, 3, 12),
    ...palms(16, 22, 8, 10),
    ...palms(116, 22, 4, 10),
    ...palms(120, 88, 4, 10),
    ...palms(16, 102, 6, 12),
    jeep(80, 54),
  ],
  spawn: { tx: 80, ty: 56 },
  entry: {
    west: { tx: 8, ty: 50 },
    north: { tx: 50, ty: 8 },
    south: { tx: 50, ty: 120 },
  },
};

const AD_NOYA: CityDef = {
  w: 108,
  h: 86,
  base: "t_sand",
  baseAlt: "t_cobble",
  road: "t_road",
  border: "fence",
  dense: true,
  districts: [{ name: "Noya Plaza", x: 12, y: 14, w: 84, h: 58, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 42, w: 92, h: 3 },
    { x: 50, y: 10, w: 3, h: 66 },
    ...roundabout(50, 42, 5, 2),
  ],
  pois: [
    {
      tex: "b_waitrose",
      tx: 50,
      ty: 28,
      role: "shop",
      name: "Waitrose",
      tag: "waitrose_noya",
      desc: "Waitrose at Noya Plaza. Milk, karak, the weekly shop.",
    },
    ...mixRow(["b_villa_modern", "b_glass_c", "b_villa_modern"], 14, 56, 3, 22),
    ...mixRow(GLASS, 16, 18, 3, 24),
    ...palms(14, 38, 6, 14),
    jeep(54, 46),
  ],
  spawn: { tx: 50, ty: 70 },
  entry: { south: { tx: 50, ty: 78 } },
};

const AD_YASMALL: CityDef = {
  w: 112,
  h: 90,
  base: "t_sand",
  baseAlt: "t_cobble",
  road: "t_road",
  border: "fence",
  dense: true,
  districts: [{ name: "Yas Mall", x: 14, y: 16, w: 84, h: 58, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 46, w: 96, h: 3 },
    { x: 52, y: 10, w: 3, h: 70 },
  ],
  pois: [
    {
      tex: "b_mall",
      tx: 52,
      ty: 30,
      role: "shop",
      name: "Yas Mall",
      tag: "yas_mall",
      desc: "The mall on Yas — shops, cinema, the usual wander.",
    },
    {
      tex: "b_saddle",
      tx: 32,
      ty: 48,
      role: "cafe",
      name: "Saddle",
      tag: "saddle",
      desc: "Anytime you see it, you stop for coffee.",
    },
    ...mixRow(GLASS, 16, 64, 4, 22),
    ...palms(16, 20, 5, 16),
    jeep(56, 50),
  ],
  spawn: { tx: 52, ty: 14 },
  entry: { north: { tx: 52, ty: 12 } },
};

const AD_SAADIYAT: CityDef = {
  w: 112,
  h: 88,
  base: "t_sand",
  baseAlt: "t_cobble",
  road: "t_path",
  border: "fence",
  dense: true,
  water: [{ x: 2, y: 2, w: 108, h: 14 }],
  districts: [{ name: "Saadiyat", x: 14, y: 20, w: 84, h: 54, ground: "t_sand" }],
  roads: [
    { x: 8, y: 48, w: 96, h: 3 },
    { x: 52, y: 18, w: 3, h: 56 },
  ],
  pois: [
    {
      tex: "b_salon",
      tx: 48,
      ty: 32,
      role: "salon",
      name: "Saadiyat salon",
      tag: "saadiyat_salon",
      desc: "Nails and brows. She can skip if she's not in the mood.",
    },
    ...mixRow(["b_villa_modern", "b_glass_c", "b_villa_modern"], 16, 58, 3, 24),
    ...palms(12, 22, 7, 14),
    jeep(56, 52),
  ],
  spawn: { tx: 100, ty: 50 },
  entry: { south: { tx: 52, ty: 78 }, east: { tx: 104, ty: 50 } },
};

const AD_HUDAYRIYAT: CityDef = {
  w: 116,
  h: 90,
  base: "t_sand",
  baseAlt: "t_sand",
  road: "t_road",
  border: "fence",
  dense: true,
  water: [{ x: 2, y: 68, w: 112, h: 18 }],
  districts: [{ name: "Hudayriyat", x: 12, y: 14, w: 92, h: 50, ground: "t_sand" }],
  roads: [
    { x: 8, y: 44, w: 100, h: 3 },
    { x: 54, y: 10, w: 3, h: 56 },
  ],
  pois: [
    {
      tex: "o_foodtruck",
      tx: 40,
      ty: 32,
      role: "cafe",
      name: "Hudayriyat food trucks",
      tag: "hudayriyat_trucks",
      desc: "Drive out, eat by the water.",
    },
    {
      tex: "b_saddle",
      tx: 62,
      ty: 34,
      role: "cafe",
      name: "Saddle",
      tag: "saddle",
      desc: "The Saddle truck. Anytime you see it.",
    },
    { tex: "o_foodtruck", tx: 78, ty: 36, role: "deco" },
    ...palms(14, 22, 7, 14),
    ...palms(16, 58, 6, 14),
    jeep(54, 48),
  ],
  spawn: { tx: 54, ty: 16 },
  entry: { north: { tx: 54, ty: 12 } },
};

const AD_CITY: CityDef = {
  w: 120,
  h: 96,
  base: "t_sand",
  baseAlt: "t_cobble",
  road: "t_road",
  border: "fence",
  dense: true,
  districts: [{ name: "Abu Dhabi City", x: 16, y: 16, w: 88, h: 64, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 46, w: 104, h: 3 },
    { x: 56, y: 10, w: 3, h: 76 },
    { x: 8, y: 72, w: 104, h: 2 },
    ...roundabout(56, 46, 5, 2),
  ],
  pois: [
    { tex: "lm_mosque", tx: 56, ty: 26, role: "landmark", name: "Sheikh Zayed Grand Mosque" },
    ...mixRow(["b_glass_c", "b_tower", "b_glass_a"], 16, 56, 3, 22),
    ...mixRow(["b_glass_b", "b_glass_c", "b_tower"], 70, 56, 3, 18),
    ...mixRow(["b_villa_modern", "b_glass_c"], 24, 78, 2, 28),
    ...palms(18, 40, 6, 16),
    jeep(58, 70),
  ],
  spawn: { tx: 104, ty: 48 },
  entry: {
    east: { tx: 110, ty: 48 },
    west: { tx: 10, ty: 48 },
  },
};

const AD_CORNICHE: CityDef = {
  w: 108,
  h: 86,
  base: "t_sand",
  baseAlt: "t_cobble",
  road: "t_path",
  border: "fence",
  dense: true,
  water: [{ x: 2, y: 2, w: 16, h: 82 }],
  districts: [{ name: "The Corniche", x: 22, y: 14, w: 72, h: 58, ground: "t_cobble" }],
  roads: [
    { x: 20, y: 10, w: 3, h: 66 },
    { x: 20, y: 40, w: 78, h: 3 },
  ],
  pois: [
    { tex: "b_cafe", tx: 38, ty: 30, role: "cafe", name: "Corniche Cafe", tag: "corniche_cafe" },
    ...mixRow(["b_glass_c", "b_tower", "b_glass_b", "b_glass_a"], 36, 52, 4, 16),
    ...palms(24, 20, 5, 14),
    ...palms(24, 62, 5, 14),
    jeep(88, 44),
  ],
  spawn: { tx: 96, ty: 44 },
  entry: { east: { tx: 100, ty: 44 }, north: { tx: 52, ty: 12 }, south: { tx: 52, ty: 76 } },
};

// ===========================================================================
// LONDON
// ===========================================================================
const LONDON_WESTMINSTER: CityDef = {
  w: 108,
  h: 90,
  base: "t_grass",
  baseAlt: "t_cobble",
  road: "t_cobble",
  border: "fence",
  dense: true,
  water: [{ x: 2, y: 62, w: 104, h: 16 }],
  districts: [{ name: "Westminster", x: 16, y: 12, w: 76, h: 46, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 42, w: 92, h: 3 },
    { x: 50, y: 10, w: 3, h: 52 },
  ],
  pois: [
    { tex: "lm_bigben", tx: 50, ty: 22, role: "landmark", name: "Big Ben" },
    ...mixRow(["b_townhouse_red", "b_townhouse_cream", "b_townhouse_red", "b_townhouse_cream"], 14, 38, 4, 14),
    ...mixRow(["b_townhouse_cream", "b_townhouse_red", "b_townhouse_cream", "b_tenement"], 18, 52, 4, 16),
    { tex: "o_phonebox", tx: 40, ty: 46, role: "deco" },
    { tex: "o_bus_red", tx: 66, ty: 48, role: "deco" },
    { tex: "o_lamp", tx: 34, ty: 50, role: "deco" },
    jeep(54, 54),
  ],
  spawn: { tx: 96, ty: 44 },
  entry: { east: { tx: 100, ty: 44 }, west: { tx: 10, ty: 44 } },
};

const LONDON_WESTEND: CityDef = {
  w: 112,
  h: 92,
  base: "t_grass",
  baseAlt: "t_cobble",
  road: "t_cobble",
  border: "fence",
  dense: true,
  districts: [{ name: "West End", x: 12, y: 12, w: 88, h: 68, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 42, w: 96, h: 3 },
    { x: 8, y: 22, w: 96, h: 2 },
    { x: 52, y: 10, w: 3, h: 72 },
    { x: 8, y: 62, w: 96, h: 2 },
  ],
  pois: [
    {
      tex: "b_townhouse_red",
      tx: 52,
      ty: 30,
      role: "plain",
      name: "Fadwa's flat",
      desc: "Central London. Your sister's place.",
      npc: "fadwa",
    },
    { tex: "b_cafe", tx: 28, ty: 38, role: "cafe", name: "Soho Cafe" },
    { tex: "b_shop", tx: 76, ty: 38, role: "shop", name: "Oxford Street" },
    { tex: "b_townhouse_cream", tx: 30, ty: 58, role: "plain", name: "The Ritz", desc: "Very fancy. Maybe one day." },
    ...mixRow(["b_townhouse_red", "b_townhouse_cream", "b_tenement", "b_townhouse_red"], 16, 72, 4, 18),
    { tex: "o_phonebox", tx: 42, ty: 46, role: "deco" },
    { tex: "o_lamp", tx: 62, ty: 46, role: "deco" },
    jeep(56, 50),
  ],
  spawn: { tx: 12, ty: 44 },
  entry: { west: { tx: 8, ty: 44 }, east: { tx: 102, ty: 44 } },
};

const EDI_OLDTOWN: CityDef = {
  w: 112,
  h: 94,
  base: "t_grass",
  baseAlt: "t_snow",
  road: "t_path",
  border: "pine",
  dense: true,
  districts: [{ name: "Old Town", x: 14, y: 14, w: 84, h: 66, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 46, w: 96, h: 3 },
    { x: 52, y: 10, w: 3, h: 74 },
    { x: 8, y: 28, w: 96, h: 2 },
  ],
  pois: [
    { tex: "lm_castle", tx: 52, ty: 22, role: "landmark", name: "Edinburgh Castle" },
    { tex: "b_cafe", tx: 32, ty: 50, role: "cafe", name: "Royal Mile Cafe" },
    {
      tex: "b_tenement",
      tx: 72,
      ty: 48,
      role: "plain",
      name: "Hazel's stair",
      desc: "In the city, not out by the uni.",
      npc: "hazel",
    },
    {
      tex: "b_tenement",
      tx: 28,
      ty: 62,
      role: "plain",
      name: "Rhiannon's flat",
      desc: "Same neighbourhood as Hazel — towards the city.",
      npc: "rhiannon",
    },
    { tex: "b_shop", tx: 52, ty: 62, role: "shop", name: "Princes Street" },
    ...mixRow(TENEMENT, 16, 32, 3, 18),
    ...mixRow(["b_tenement", "b_townhouse_cream"], 78, 32, 2, 16),
    { tex: "o_lamp", tx: 40, ty: 54, role: "deco" },
    jeep(56, 52),
  ],
  spawn: { tx: 100, ty: 48 },
  entry: { west: { tx: 10, ty: 48 }, east: { tx: 104, ty: 48 } },
};

const EDI_DEAN: CityDef = {
  w: 108,
  h: 88,
  base: "t_grass",
  baseAlt: "t_snow",
  road: "t_path",
  border: "pine",
  dense: true,
  water: [{ x: 2, y: 38, w: 104, h: 8 }],
  districts: [{ name: "Dean Village", x: 14, y: 12, w: 80, h: 64, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 50, w: 92, h: 2 },
    { x: 50, y: 10, w: 3, h: 68 },
  ],
  pois: [
    {
      tex: "b_wellcourt",
      tx: 50,
      ty: 28,
      role: "stairs",
      name: "18 Well Court",
      tag: "well_court",
      desc: "EH4 3BE. Top floor. The stairs are a lot — she can skip if she wants. Brown inside.",
    },
    ...mixRow(["b_tenement", "b_townhouse_cream", "b_tenement"], 16, 58, 3, 22),
    { tex: "o_lamp", tx: 36, ty: 48, role: "deco" },
    jeep(54, 54),
  ],
  spawn: { tx: 96, ty: 52 },
  entry: { east: { tx: 100, ty: 52 }, west: { tx: 10, ty: 52 } },
};

const EDI_UNI: CityDef = {
  w: 108,
  h: 90,
  base: "t_grass",
  baseAlt: "t_snow",
  road: "t_path",
  border: "pine",
  dense: true,
  districts: [{ name: "Heriot-Watt Riccarton", x: 12, y: 14, w: 84, h: 62, ground: "t_grass" }],
  roads: [
    { x: 8, y: 44, w: 92, h: 3 },
    { x: 50, y: 10, w: 3, h: 70 },
  ],
  pois: [
    {
      tex: "b_uni",
      tx: 50,
      ty: 26,
      role: "uni",
      name: "Heriot-Watt",
      desc: "Riccarton campus, west of the city. A proper bus ride from Old Town.",
    },
    { tex: "b_cafe", tx: 50, ty: 56, role: "cafe", name: "Campus cafe" },
    ...mixRow(["b_townhouse_cream", "b_tenement", "b_townhouse_cream"], 16, 62, 3, 24),
    { tex: "o_lamp", tx: 36, ty: 46, role: "deco" },
    jeep(54, 48),
  ],
  spawn: { tx: 96, ty: 46 },
  entry: { east: { tx: 100, ty: 46 } },
};

const LEICESTER: CityDef = {
  w: 116,
  h: 96,
  base: "t_grass",
  baseAlt: "t_grass2",
  road: "t_cobble",
  border: "tree",
  dense: true,
  districts: [{ name: "Oadby", x: 12, y: 14, w: 92, h: 68, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 48, w: 100, h: 3 },
    { x: 54, y: 10, w: 3, h: 76 },
    ...arcRoad(54, 48, 22, 0.2, 2.9, 2),
    { x: 8, y: 72, w: 100, h: 2 },
  ],
  pois: [
    {
      tex: "b_uni",
      tx: 54,
      ty: 24,
      role: "uni",
      name: "Uni of Leicester",
      desc: "Where Chloe's doing her PhD.",
    },
    {
      tex: "b_terrace_brick",
      tx: 28,
      ty: 58,
      role: "plain",
      name: "Chloe's place",
      desc: "Oadby. Quiet streets, PhD life.",
      npc: "chloe",
    },
    { tex: "b_cafe", tx: 56, ty: 50, role: "cafe", name: "Village cafe" },
    { tex: "b_shop", tx: 78, ty: 50, role: "shop", name: "Oadby shops" },
    ...mixAlongArc(TERRACE, 54, 48, 30, 0.25, 2.8, 7),
    ...mixRow(["b_terrace_brick", "b_townhouse_red", "b_terrace_brick"], 16, 80, 3, 22),
    { tex: "o_lamp", tx: 40, ty: 52, role: "deco" },
    jeep(58, 54),
  ],
  spawn: { tx: 54, ty: 80 },
  entry: { north: { tx: 54, ty: 12 }, south: { tx: 54, ty: 86 } },
};

const GERMANY: CityDef = {
  w: 120,
  h: 96,
  base: "t_grass",
  baseAlt: "t_grass2",
  road: "t_cobble",
  border: "pine",
  dense: true,
  water: [{ x: 2, y: 78, w: 116, h: 14 }],
  districts: [{ name: "Frankfurt Altstadt", x: 14, y: 12, w: 92, h: 62, ground: "t_cobble" }],
  roads: [
    { x: 8, y: 48, w: 104, h: 3 },
    { x: 56, y: 10, w: 3, h: 68 },
    { x: 8, y: 28, w: 104, h: 2 },
  ],
  pois: [
    { tex: "lm_roemer", tx: 56, ty: 24, role: "landmark", name: "Römer" },
    {
      tex: "b_fachwerk_a",
      tx: 82,
      ty: 58,
      role: "plain",
      name: "Nour's flat",
      desc: "Somewhere in Frankfurt. He's around.",
      npc: "nour",
    },
    { tex: "b_fachwerk_b", tx: 28, ty: 48, role: "cafe", name: "Café am Main" },
    { tex: "b_shop", tx: 56, ty: 54, role: "shop", name: "Römerberg" },
    ...mixRow(["b_glass_a", "b_tower", "b_glass_b"], 16, 18, 3, 22),
    ...mixRow(["b_fachwerk_a", "b_fachwerk_b", "b_fachwerk_a", "b_fachwerk_b"], 16, 66, 4, 18),
    { tex: "o_lamp", tx: 40, ty: 52, role: "deco" },
    jeep(52, 50),
  ],
  spawn: { tx: 56, ty: 70 },
  entry: { north: { tx: 56, ty: 12 } },
};

const AMMAN: CityDef = {
  w: 104,
  h: 88,
  base: "t_sand",
  baseAlt: "t_sand",
  road: "t_path",
  border: "rock",
  dense: true,
  districts: [{ name: "Amman (beta)", x: 14, y: 14, w: 76, h: 60, ground: "t_sand" }],
  roads: [
    { x: 8, y: 44, w: 88, h: 3 },
    { x: 50, y: 10, w: 3, h: 68 },
  ],
  pois: [
    { tex: "lm_citadel", tx: 50, ty: 24, role: "landmark", name: "Amman Citadel" },
    ...mixRow(["b_sandstone", "b_sandstone", "b_sandstone"], 20, 50, 3, 22),
    ...mixRow(["b_sandstone", "b_sandstone"], 30, 64, 2, 28),
    ...palms(18, 36, 5, 16),
    jeep(52, 48),
  ],
  spawn: { tx: 50, ty: 74 },
  entry: { north: { tx: 50, ty: 14 } },
};

export const LOCATIONS: Record<string, LocationDef> = {
  abudhabi_yas: loc({
    id: "abudhabi_yas",
    cityId: "abudhabi",
    name: "Yas Island",
    subtitle: "Yas Magnolias 2 — curved streets by the golf",
    landmark: "lm_mosque",
    landmarkName: "Yas Magnolias",
    hasWater: true,
    hasHome: true,
    homeName: "Yas Magnolias 2",
    homeTex: "b_villa_terra2",
    city: AD_YAS,
    geo: { lat: 24.5, lng: 54.61 },
    exits: { west: "abudhabi_city", north: "abudhabi_noya", south: "abudhabi_yasmall" },
  }),
  abudhabi_noya: loc({
    id: "abudhabi_noya",
    cityId: "abudhabi",
    name: "Noya Plaza",
    subtitle: "Waitrose",
    city: AD_NOYA,
    geo: { lat: 24.51, lng: 54.61 },
    exits: { south: "abudhabi_yas" },
  }),
  abudhabi_yasmall: loc({
    id: "abudhabi_yasmall",
    cityId: "abudhabi",
    name: "Yas Mall",
    subtitle: "The mall on Yas",
    city: AD_YASMALL,
    geo: { lat: 24.49, lng: 54.61 },
    exits: { north: "abudhabi_yas" },
  }),
  abudhabi_city: loc({
    id: "abudhabi_city",
    cityId: "abudhabi",
    name: "Abu Dhabi City",
    subtitle: "Sheikh Zayed Grand Mosque",
    landmark: "lm_mosque",
    landmarkName: "Sheikh Zayed Grand Mosque",
    city: AD_CITY,
    geo: { lat: 24.41, lng: 54.48 },
    exits: { east: "abudhabi_yas", west: "abudhabi_corniche" },
  }),
  abudhabi_corniche: loc({
    id: "abudhabi_corniche",
    cityId: "abudhabi",
    name: "The Corniche",
    subtitle: "Seafront walks & coffee",
    city: AD_CORNICHE,
    hasWater: true,
    geo: { lat: 24.48, lng: 54.35 },
    exits: { east: "abudhabi_city", north: "abudhabi_saadiyat", south: "abudhabi_hudayriyat" },
  }),
  abudhabi_saadiyat: loc({
    id: "abudhabi_saadiyat",
    cityId: "abudhabi",
    name: "Saadiyat",
    subtitle: "Nails & brows",
    city: AD_SAADIYAT,
    hasWater: true,
    geo: { lat: 24.53, lng: 54.42 },
    exits: { south: "abudhabi_corniche" },
  }),
  abudhabi_hudayriyat: loc({
    id: "abudhabi_hudayriyat",
    cityId: "abudhabi",
    name: "Hudayriyat",
    subtitle: "Food trucks & Saddle",
    city: AD_HUDAYRIYAT,
    hasWater: true,
    geo: { lat: 24.42, lng: 54.33 },
    exits: { north: "abudhabi_corniche" },
  }),

  dubai_downtown: loc({
    id: "dubai_downtown",
    cityId: "dubai",
    name: "Downtown Dubai",
    subtitle: "Burj, the mall & The Residences",
    landmark: "lm_burj",
    landmarkName: "Burj Khalifa",
    city: DUBAI_DOWNTOWN,
    geo: { lat: 25.2, lng: 55.27 },
    exits: { south: "dubai_szr" },
  }),
  dubai_szr: loc({
    id: "dubai_szr",
    cityId: "dubai",
    name: "Sheikh Zayed Road",
    subtitle: "The long drive south",
    city: DUBAI_SZR,
    geo: { lat: 25.1, lng: 55.18 },
    exits: { north: "dubai_downtown", west: "dubai_damac", east: "dubai_oasis", south: "dubai_hills" },
  }),
  dubai_damac: loc({
    id: "dubai_damac",
    cityId: "dubai",
    name: "Damac Lagoons",
    subtitle: "Mama's white-and-blue townhouse · ADNOC on the way in",
    city: DUBAI_DAMAC,
    geo: { lat: 25.01, lng: 55.2 },
    exits: { east: "dubai_szr" },
  }),
  dubai_oasis: loc({
    id: "dubai_oasis",
    cityId: "dubai",
    name: "Silicon Oasis",
    subtitle: "SO2 — Moomoo's building",
    city: DUBAI_OASIS,
    geo: { lat: 25.12, lng: 55.38 },
    exits: { west: "dubai_szr" },
  }),
  dubai_hills: loc({
    id: "dubai_hills",
    cityId: "dubai",
    name: "Dubai Hills",
    subtitle: "Our mall, and Saddle when you see it",
    city: DUBAI_HILLS,
    geo: { lat: 25.01, lng: 55.24 },
    exits: { north: "dubai_szr" },
  }),

  london_westminster: loc({
    id: "london_westminster",
    cityId: "london",
    name: "Westminster",
    subtitle: "Big Ben & the Thames",
    ground: "t_grass",
    path: "t_cobble",
    landmark: "lm_bigben",
    landmarkName: "Big Ben",
    city: LONDON_WESTMINSTER,
    hasWater: true,
    geo: { lat: 51.5, lng: -0.12 },
    exits: { east: "london_westend" },
  }),
  london_westend: loc({
    id: "london_westend",
    cityId: "london",
    name: "West End",
    subtitle: "Fadwa's flat, Soho & Oxford Street",
    ground: "t_grass",
    path: "t_cobble",
    city: LONDON_WESTEND,
    geo: { lat: 51.51, lng: -0.13 },
    exits: { west: "london_westminster" },
  }),

  edinburgh_oldtown: loc({
    id: "edinburgh_oldtown",
    cityId: "edinburgh",
    name: "Old Town",
    subtitle: "Castle, Hazel & Rhiannon — in the city",
    ground: "t_grass",
    groundAlt: "t_snow",
    path: "t_path",
    border: "pine",
    landmark: "lm_castle",
    landmarkName: "Edinburgh Castle",
    city: EDI_OLDTOWN,
    geo: { lat: 55.95, lng: -3.2 },
    exits: { west: "edinburgh_dean" },
  }),
  edinburgh_dean: loc({
    id: "edinburgh_dean",
    cityId: "edinburgh",
    name: "Dean Village",
    subtitle: "18 Well Court, EH4 3BE",
    ground: "t_grass",
    groundAlt: "t_snow",
    path: "t_path",
    border: "pine",
    city: EDI_DEAN,
    geo: { lat: 55.95, lng: -3.22 },
    exits: { east: "edinburgh_oldtown", west: "edinburgh_uni" },
  }),
  edinburgh_uni: loc({
    id: "edinburgh_uni",
    cityId: "edinburgh",
    name: "Heriot-Watt",
    subtitle: "Riccarton — a bus ride west of the city",
    ground: "t_grass",
    groundAlt: "t_snow",
    path: "t_path",
    border: "pine",
    city: EDI_UNI,
    geo: { lat: 55.91, lng: -3.32 },
    exits: { east: "edinburgh_dean" },
  }),

  leicester: loc({
    id: "leicester",
    cityId: "leicester",
    name: "Oadby",
    subtitle: "Chloe's PhD town",
    ground: "t_grass",
    path: "t_cobble",
    border: "tree",
    landmark: "lm_clocktower",
    landmarkName: "Uni of Leicester",
    city: LEICESTER,
    geo: { lat: 52.6, lng: -1.08 },
  }),
  germany: loc({
    id: "germany",
    cityId: "germany",
    name: "Frankfurt",
    subtitle: "Nour's place — Römer & the Main",
    ground: "t_grass",
    path: "t_cobble",
    border: "pine",
    landmark: "lm_roemer",
    landmarkName: "Römer",
    city: GERMANY,
    geo: { lat: 50.11, lng: 8.68 },
  }),
  amman: loc({
    id: "amman",
    cityId: "amman",
    name: "Amman",
    subtitle: "Coming soon (beta)",
    path: "t_path",
    border: "rock",
    landmark: "lm_citadel",
    landmarkName: "Amman Citadel",
    city: AMMAN,
    geo: { lat: 31.95, lng: 35.93 },
  }),
};

export const LOCATION_ORDER = CITIES.map((c) => c.hub);

export const getLocation = (id: string) => {
  if (LOCATIONS[id]) return LOCATIONS[id];
  const city = CITIES.find((c) => c.id === id);
  if (city) return LOCATIONS[city.hub];
  return LOCATIONS.abudhabi_yas;
};

export const cityMeta = (cityId: string) => CITIES.find((c) => c.id === cityId);

export const districtsOf = (cityId: string) => Object.values(LOCATIONS).filter((l) => l.cityId === cityId);

export const opposite: Record<Cardinal, Cardinal> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};
