// ---------------------------------------------------------------------------
// Jasmin's world — Pokémon-scale districts, placed like the real cities.
//
// Each "location" is one district (several camera-screens across). Walking to
// the edge takes you to the next district; the Jeep fast-travels inside a city.
// The globe groups districts into cities.
// ---------------------------------------------------------------------------

import {
  alley,
  arcPts,
  arcRoad,
  bed,
  boulevard,
  dotsAlong,
  frontage,
  jeep,
  mixAlongArc,
  mixCol,
  mixRow,
  offsetPoly,
  palms,
  park,
  plaza,
  promenade,
  pt,
  roundabout,
  sidewalk,
  street,
  walkPath,
  waterway,
} from "./mapkit";

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

export interface PathPoint {
  x: number;
  y: number;
}

export type PathKind = "road" | "street" | "sidewalk" | "path" | "promenade" | "alley";

export interface PathSpec {
  points: PathPoint[];
  width: number;
  tex: string;
  walkable?: boolean;
  kind?: PathKind;
}

export interface SurfaceSpec extends Rect {
  tex: string;
  alt?: string;
  walkable?: boolean;
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
  /** Intentional patches (plaza, park, garden, parking) — not the whole map. */
  surfaces?: SurfaceSpec[];
  /** Polyline streets, sidewalks, alleys, promenades, waterways. */
  paths?: PathSpec[];
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

const DXB_TOWER = ["b_glass_a", "b_tower", "b_glass_c", "b_residence", "b_glass_b"];

const DUBAI_DOWNTOWN: CityDef = {
  w: 152,
  h: 114,
  base: "t_paving_light",
  baseAlt: "t_pavement",
  road: "t_road",
  border: "fence",
  dense: true,
  surfaces: [
    plaza(12, 34, 28, 30, "t_paving_dark"),
    plaza(38, 16, 42, 42, "t_pavement"),
    plaza(102, 66, 40, 22, "t_pavement"),
    park(6, 92, 52, 16),
    bed(78, 12, 8, 74, "t_grass"),
    bed(8, 6, 140, 5, "t_grass"),
  ],
  water: [{ x: 44, y: 22, w: 28, h: 22 }],
  paths: [
    waterway([pt(44, 28), pt(52, 24), pt(66, 28), pt(68, 38), pt(56, 42), pt(44, 38), pt(44, 28)], 5),
    promenade([pt(38, 22), pt(52, 14), pt(74, 24), pt(76, 40), pt(62, 52), pt(40, 48), pt(38, 22)], 3),
    ...boulevard([pt(8, 12), pt(144, 12)], 4, 2, "t_road", "t_paving_light"),
    ...boulevard([pt(8, 78), pt(144, 78)], 4, 2, "t_road", "t_paving_light"),
    ...boulevard([pt(72, 8), pt(72, 108)], 4, 2, "t_road", "t_paving_light"),
    ...boulevard([pt(20, 12), pt(20, 78)], 3, 2, "t_road", "t_paving_light"),
    ...boulevard(arcPts(110, 54, 26, -0.55, 2.35, 14), 3, 2, "t_road", "t_paving_light"),
    ...boulevard(arcPts(110, 54, 16, -0.4, 2.2, 12), 2, 2, "t_road", "t_paving_light"),
    walkPath([pt(24, 46), pt(40, 40), pt(52, 32)], 2, "t_paving_light"),
    walkPath([pt(52, 32), pt(40, 40), pt(40, 48), pt(56, 48), pt(54, 54)], 2, "t_paving_light"),
    walkPath([pt(54, 56), pt(72, 62), pt(96, 66), pt(112, 64)], 2, "t_pavement"),
    walkPath([pt(20, 58), pt(40, 58), pt(52, 54)], 2, "t_paving_dark"),
    alley([pt(12, 64), pt(36, 64)], 2),
    street([pt(70, 10), pt(74, 14)], 3, "t_crossing"),
  ],
  pois: [
    { tex: "lm_burj", tx: 52, ty: 18, role: "landmark", name: "Burj Khalifa" },
    {
      tex: "b_mall",
      tx: 20,
      ty: 42,
      role: "cafe",
      name: "Dubai Mall",
      tag: "dubai_mall",
      desc: "The mall wrapped around the Burj. Fashion Avenue, the fountain, the aquarium.",
    },
    { tex: "o_fountain", tx: 56, ty: 46, role: "landmark", name: "The Fountain" },
    { tex: "b_shop", tx: 54, ty: 56, role: "shop", name: "Souk Al Bahar" },
    ...mixAlongArc(RES_TEX, 110, 54, 30, -0.5, 2.2, 8),
    ...mixAlongArc(["b_glass_a", "b_residence", "b_tower", "b_glass_c", "b_residence", "b_glass_b"], 110, 54, 18, -0.35, 2.05, 6),
    {
      tex: "b_residence",
      tx: 132,
      ty: 46,
      role: "stairs",
      name: "The Residences T8 · 1701",
      tag: "residences_t8",
      desc: "Stairs up to the lobby, then 1701. Your Downtown apartment 🤍",
    },
    {
      tex: "b_spinneys",
      tx: 114,
      ty: 66,
      role: "shop",
      name: "Spinneys",
      desc: "On the Residences curve, mid-block.",
    },
    ...frontage([pt(8, 12), pt(60, 12)], 1, 5, DXB_TOWER, 8),
    ...frontage([pt(8, 78), pt(64, 78)], 1, 5, ["b_glass_b", "b_glass_a", "b_tower", "b_glass_c"], 10),
    ...frontage([pt(20, 16), pt(20, 72)], -1, 5, GLASS, 10),
    ...dotsAlong([pt(80, 16), pt(80, 80)], "o_palm", 10),
    ...dotsAlong(arcPts(110, 54, 22, -0.5, 2.2, 10), "o_palm", 12),
    ...dotsAlong(offsetPoly([pt(8, 78), pt(144, 78)], 3), "o_lamp", 16, { solid: false }),
    { tex: "o_planter", tx: 48, ty: 50, role: "deco" },
    { tex: "o_planter", tx: 64, ty: 50, role: "deco" },
    { tex: "o_bench", tx: 44, ty: 50, role: "deco" },
    jeep(74, 82),
  ],
  spawn: { tx: 74, ty: 82 },
  entry: {
    south: { tx: 72, ty: 106 },
    north: { tx: 72, ty: 10 },
  },
};

const DUBAI_SZR: CityDef = {
  w: 84,
  h: 168,
  base: "t_sand",
  baseAlt: "t_sand",
  road: "t_road",
  border: "fence",
  dense: true,
  surfaces: [
    bed(36, 4, 8, 160, "t_grass"),
    plaza(6, 112, 16, 16, "t_paving_dark"),
    plaza(62, 112, 16, 16, "t_paving_dark"),
  ],
  paths: [
    street([pt(32, 4), pt(32, 164)], 5),
    street([pt(48, 4), pt(48, 164)], 5),
    sidewalk([pt(26, 4), pt(26, 164)], 2),
    sidewalk([pt(54, 4), pt(54, 164)], 2),
    street([pt(16, 8), pt(16, 160)], 2),
    street([pt(68, 8), pt(68, 160)], 2),
    sidewalk([pt(13, 8), pt(13, 160)], 2),
    sidewalk([pt(71, 8), pt(71, 160)], 2),
    ...boulevard([pt(6, 36), pt(78, 36)], 3, 2),
    ...boulevard([pt(6, 72), pt(78, 72)], 3, 2),
    ...boulevard([pt(6, 108), pt(78, 108)], 3, 2),
    ...boulevard([pt(6, 144), pt(78, 144)], 3, 2),
    street([pt(38, 34), pt(42, 38)], 3, "t_crossing"),
    street([pt(38, 106), pt(42, 110)], 3, "t_crossing"),
  ],
  pois: [
    ...mixCol(["b_glass_a", "b_tower", "b_glass_c", "b_residence", "b_glass_b", "b_glass_a", "b_tower", "b_glass_c"], 8, 14, 8, 18),
    ...mixCol(["b_glass_b", "b_residence", "b_glass_a", "b_tower", "b_glass_c", "b_glass_b", "b_residence", "b_glass_a"], 76, 18, 8, 18),
    ...mixCol(["o_palm"], 36, 16, 8, 18),
    ...mixCol(["o_palm"], 44, 24, 8, 18),
    { tex: "o_sign", tx: 40, ty: 108, role: "plain", name: "Metro", desc: "SZR flyover — the long drive south." },
    jeep(40, 84),
  ],
  spawn: { tx: 40, ty: 12 },
  entry: {
    north: { tx: 40, ty: 8 },
    south: { tx: 40, ty: 158 },
    west: { tx: 8, ty: 108 },
    east: { tx: 76, ty: 108 },
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
  surfaces: [
    park(40, 8, 28, 16),
    plaza(50, 46, 16, 12, "t_pavement"),
  ],
  paths: [
    ...boulevard([pt(8, 52), pt(120, 52)], 3, 2, "t_path", "t_pavement"),
    ...boulevard([pt(28, 16), pt(28, 52)], 3, 2, "t_path", "t_pavement"),
    sidewalk([pt(8, 22), pt(28, 22)], 2),
    sidewalk([pt(8, 34), pt(28, 34)], 2),
    sidewalk([pt(8, 46), pt(28, 46)], 2),
    walkPath([pt(118, 52), pt(108, 52), pt(58, 52), pt(28, 52), pt(28, 22), pt(16, 22)], 2, "t_pavement"),
    promenade([pt(10, 16), pt(26, 16), pt(28, 22)], 2),
    promenade([pt(96, 18), pt(116, 18), pt(118, 26)], 2),
    street([pt(8, 78), pt(108, 78)], 2, "t_path"),
    sidewalk([pt(8, 76), pt(108, 76)], 2),
  ],
  roads: [...roundabout(58, 52, 6, 2), { x: 108, y: 48, w: 16, h: 3 }],
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
  surfaces: [
    plaza(44, 50, 32, 18, "t_pavement"),
    park(8, 8, 28, 12),
    park(84, 76, 28, 16),
    bed(48, 8, 16, 12, "t_grass"),
  ],
  paths: [
    ...boulevard([pt(8, 46), pt(112, 46)], 3, 2),
    ...boulevard([pt(56, 8), pt(56, 90)], 3, 2),
    ...boulevard(arcPts(56, 48, 22, -0.25, 3.35, 16), 3, 2),
    sidewalk([pt(8, 22), pt(112, 22)], 2),
    sidewalk([pt(8, 72), pt(112, 72)], 2),
    walkPath([pt(12, 46), pt(38, 56), pt(52, 60)], 2, "t_pavement"),
    walkPath([pt(52, 60), pt(70, 56), pt(88, 50)], 2, "t_pavement"),
    alley([pt(38, 50), pt(38, 70)], 2),
    alley([pt(70, 48), pt(70, 70)], 2),
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
    ...dotsAlong(arcPts(56, 48, 18, -0.2, 3.3, 12), "o_palm", 10),
    ...palms(14, 16, 5, 16),
    jeep(48, 46),
  ],
  spawn: { tx: 12, ty: 48 },
  entry: {
    west: { tx: 8, ty: 48 },
    north: { tx: 56, ty: 12 },
  },
};

const DUBAI_HILLS: CityDef = {
  w: 120,
  h: 100,
  base: "t_grass2",
  baseAlt: "t_grass",
  road: "t_road",
  border: "fence",
  dense: true,
  surfaces: [
    park(8, 8, 36, 22),
    park(78, 70, 34, 22),
    plaza(44, 24, 28, 20, "t_paving_light"),
    bed(8, 70, 24, 12, "t_grass"),
  ],
  paths: [
    ...boulevard([pt(8, 48), pt(112, 48)], 3, 2),
    ...boulevard([pt(54, 8), pt(54, 90)], 3, 2),
    ...boulevard(arcPts(54, 48, 24, 0.15, 2.95, 14), 3, 2),
    walkPath([pt(16, 18), pt(28, 28), pt(40, 36), pt(50, 44)], 2, "t_path"),
    walkPath([pt(58, 48), pt(72, 58), pt(90, 72), pt(100, 84)], 2, "t_path"),
    walkPath([pt(36, 50), pt(44, 40), pt(54, 34)], 2, "t_pavement"),
    promenade([pt(12, 72), pt(28, 76), pt(40, 72)], 2),
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
    ...mixAlongArc(["b_villa_modern", "b_villa_terra2", "b_villa_modern", "b_villa_terra"], 54, 48, 30, 0.25, 2.85, 8),
    ...mixRow(GLASS, 14, 20, 2, 22),
    ...dotsAlong(arcPts(54, 48, 20, 0.2, 2.9, 10), "o_palm", 12),
    ...palms(16, 78, 5, 14),
    { tex: "o_bench", tx: 22, ty: 18, role: "deco" },
    { tex: "o_bench", tx: 92, ty: 82, role: "deco" },
    jeep(58, 54),
  ],
  spawn: { tx: 54, ty: 84 },
  entry: { north: { tx: 54, ty: 10 } },
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

const LDN = ["b_front_red", "b_front_cream", "b_townhouse_red", "b_front_cream", "b_pub", "b_front_red"];
const LDN_SHOP = ["b_shop", "b_front_cream", "b_cafe", "b_front_red", "b_shop", "b_front_cream", "b_pub"];
const SOHO = ["b_front_cream", "b_front_red", "b_cafe", "b_front_cream", "b_pub", "b_front_red"];

const LONDON_WESTMINSTER: CityDef = {
  w: 128,
  h: 104,
  base: "t_pavement",
  baseAlt: "t_cobble",
  road: "t_road",
  border: "fence",
  dense: true,
  surfaces: [
    plaza(32, 38, 44, 28, "t_pavement", "t_cobble"),
    park(6, 42, 22, 22),
    plaza(64, 60, 8, 8, "t_paving_dark"),
  ],
  paths: [
    waterway([pt(0, 86), pt(22, 78), pt(48, 88), pt(72, 80), pt(100, 90), pt(128, 84)], 14),
    ...boulevard([pt(4, 36), pt(124, 36)], 4, 2, "t_road", "t_pavement"),
    ...boulevard([pt(50, 6), pt(50, 42)], 3, 2, "t_road", "t_pavement"),
    street([pt(66, 54), pt(66, 100)], 4),
    walkPath([pt(8, 72), pt(48, 70), pt(72, 68), pt(110, 74), pt(124, 72)], 3, "t_pavement"),
    walkPath([pt(12, 48), pt(24, 54), pt(22, 62)], 2, "t_path"),
    alley([pt(28, 8), pt(28, 34)], 2),
    alley([pt(72, 8), pt(72, 32)], 2),
    alley([pt(88, 20), pt(120, 20)], 2),
    street([pt(4, 20), pt(46, 20)], 3),
    sidewalk([pt(4, 18), pt(46, 18)], 2),
    sidewalk([pt(4, 23), pt(46, 23)], 2),
  ],
  pois: [
    { tex: "lm_bigben", tx: 48, ty: 46, role: "landmark", name: "Big Ben" },
    ...frontage([pt(32, 38), pt(72, 38)], -1, 4, LDN, 5),
    ...frontage([pt(4, 36), pt(46, 36)], 1, 5, LDN, 5),
    ...frontage([pt(54, 36), pt(120, 36)], 1, 5, LDN, 5),
    ...frontage([pt(50, 8), pt(50, 34)], 1, 4, LDN, 5),
    ...frontage([pt(50, 8), pt(50, 34)], -1, 4, ["b_townhouse_cream", "b_front_cream", "b_townhouse_red"], 5),
    ...frontage([pt(4, 20), pt(44, 20)], -1, 4, LDN, 5),
    ...mixRow(["b_front_cream", "b_front_red", "b_townhouse_cream"], 78, 26, 4, 10),
    { tex: "o_bus_red", tx: 80, ty: 36, role: "deco" },
    { tex: "o_phonebox", tx: 40, ty: 52, role: "deco" },
    ...dotsAlong([pt(8, 72), pt(110, 74)], "o_railing", 10, { solid: false }),
    ...dotsAlong([pt(12, 50), pt(24, 60)], "o_tree", 6),
    { tex: "o_bench", tx: 16, ty: 56, role: "deco" },
    { tex: "o_lamp_ldn", tx: 58, ty: 40, role: "deco" },
    { tex: "o_lamp_ldn", tx: 42, ty: 40, role: "deco" },
    jeep(58, 32),
  ],
  spawn: { tx: 120, ty: 38 },
  entry: { east: { tx: 122, ty: 38 }, west: { tx: 8, ty: 38 } },
};

const LONDON_WESTEND: CityDef = {
  w: 136,
  h: 112,
  base: "t_pavement",
  baseAlt: "t_cobble",
  road: "t_road",
  border: "fence",
  dense: true,
  surfaces: [
    plaza(64, 32, 16, 14, "t_cobble"),
    plaza(98, 50, 10, 8, "t_brick_path"),
    park(8, 90, 54, 18),
  ],
  paths: [
    ...boulevard([pt(4, 38), pt(132, 38)], 4, 2),
    ...boulevard([pt(70, 6), pt(88, 16), pt(92, 28), pt(78, 38), pt(68, 54), pt(64, 70), pt(76, 90)], 4, 2),
    ...boulevard([pt(6, 76), pt(40, 74), pt(80, 78), pt(130, 74)], 3, 2),
    street([pt(74, 36), pt(82, 36)], 2, "t_crossing"),
    street([pt(38, 74), pt(44, 74)], 2, "t_crossing"),
    alley([pt(96, 44), pt(96, 70)], 2),
    alley([pt(108, 44), pt(108, 70)], 2),
    alley([pt(120, 44), pt(120, 68)], 2),
    alley([pt(88, 48), pt(128, 48)], 2),
    alley([pt(88, 58), pt(128, 58)], 2),
    alley([pt(88, 66), pt(124, 66)], 2),
    alley([pt(16, 44), pt(16, 72)], 2),
    alley([pt(32, 44), pt(32, 72)], 2),
    alley([pt(48, 44), pt(48, 72)], 2),
    walkPath([pt(14, 94), pt(36, 100), pt(54, 94)], 2, "t_path"),
    walkPath([pt(20, 90), pt(20, 106)], 2, "t_path"),
    street([pt(4, 18), pt(132, 18)], 3),
    sidewalk([pt(4, 16), pt(132, 16)], 2),
    sidewalk([pt(4, 21), pt(132, 21)], 2),
  ],
  pois: [
    ...frontage([pt(8, 38), pt(128, 38)], -1, 5, LDN_SHOP, 4),
    ...frontage([pt(8, 38), pt(60, 38)], 1, 5, LDN, 5),
    ...frontage([pt(86, 38), pt(128, 38)], 1, 5, SOHO, 4),
    ...frontage([pt(70, 8), pt(90, 26), pt(78, 38)], -1, 5, LDN, 5),
    ...frontage([pt(70, 8), pt(90, 26), pt(78, 38)], 1, 5, LDN, 5),
    ...frontage([pt(78, 38), pt(64, 70), pt(76, 88)], 1, 5, LDN, 5),
    ...frontage([pt(6, 76), pt(50, 74)], -1, 5, ["b_townhouse_cream", "b_front_cream", "b_townhouse_red"], 5),
    ...frontage([pt(90, 76), pt(128, 74)], 1, 5, LDN, 5),
    ...frontage([pt(8, 18), pt(128, 18)], -1, 4, LDN, 5),
    ...frontage([pt(8, 18), pt(60, 18)], 1, 4, ["b_front_cream", "b_front_red", "b_townhouse_cream"], 5),
    ...mixRow(SOHO, 90, 46, 5, 7),
    ...mixCol(SOHO, 114, 50, 3, 7),
    {
      tex: "b_shop",
      tx: 44,
      ty: 32,
      role: "shop",
      name: "Oxford Street",
      desc: "The whole street is shops. This is just the one you duck into.",
    },
    {
      tex: "b_townhouse_red",
      tx: 108,
      ty: 52,
      role: "plain",
      name: "Fadwa's flat",
      desc: "Central London. Your sister's place, a Soho walk-up.",
      npc: "fadwa",
    },
    { tex: "b_cafe", tx: 96, ty: 56, role: "cafe", name: "Soho Cafe" },
    {
      tex: "b_townhouse_cream",
      tx: 28,
      ty: 70,
      role: "plain",
      name: "The Ritz",
      desc: "On Piccadilly, not floating in a field. Very fancy. Maybe one day.",
    },
    { tex: "o_bus_red", tx: 56, ty: 38, role: "deco" },
    { tex: "o_cab", tx: 100, ty: 76, role: "deco" },
    { tex: "o_phonebox", tx: 72, ty: 44, role: "deco" },
    ...dotsAlong(offsetPoly([pt(10, 38), pt(128, 38)], 3), "o_lamp_ldn", 14, { solid: false }),
    ...dotsAlong([pt(96, 48), pt(96, 68)], "o_lamp_ldn", 10, { solid: false }),
    { tex: "o_bin", tx: 102, ty: 50, role: "deco" },
    { tex: "o_planter", tx: 36, ty: 74, role: "deco" },
    { tex: "o_bollard", tx: 70, ty: 42, role: "deco" },
    { tex: "o_bollard", tx: 76, ty: 42, role: "deco" },
    { tex: "o_bench", tx: 102, ty: 54, role: "deco" },
    { tex: "o_tree", tx: 18, ty: 96, role: "deco" },
    { tex: "o_tree", tx: 32, ty: 100, role: "deco" },
    { tex: "o_tree", tx: 46, ty: 96, role: "deco" },
    { tex: "o_bench", tx: 28, ty: 98, role: "deco" },
    jeep(84, 82),
  ],
  spawn: { tx: 12, ty: 40 },
  entry: { west: { tx: 8, ty: 40 }, east: { tx: 128, ty: 40 } },
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
    ground: "t_pavement",
    path: "t_road",
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
    ground: "t_pavement",
    path: "t_road",
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
