import type { VisualAssetDef, VisualAuditState, VisualFilter, VisualRenderClass, VisualShadowDef } from "./types";

/** Keep procedural environment art available while the HD migration is incomplete. */
export const ALLOW_LEGACY_ENVIRONMENT_FALLBACK = true;

const hd = (
  key: string,
  sourcePath: string,
  renderClass: Exclude<VisualRenderClass, "pixel-character">,
  sourceWidth: number,
  sourceHeight: number,
): VisualAssetDef => ({
  key,
  textureKey: key,
  sourceType: "svg",
  sourcePath,
  sourceWidth,
  sourceHeight,
  renderClass,
  filter: "linear",
  auditState: "PARTIAL",
});

const bootHd = (
  key: string,
  sourcePath: string,
  renderClass: Exclude<VisualRenderClass, "pixel-character">,
  sourceWidth: number,
  sourceHeight: number,
): VisualAssetDef => ({ ...hd(key, sourcePath, renderClass, sourceWidth, sourceHeight), preload: "boot" });

const shadowFor = (key: string, renderClass: VisualRenderClass): VisualShadowDef | undefined => {
  if (renderClass === "pixel-character") return { shadowEnabled: true, shadowType: "contact", shadowOpacity: 0.24, shadowScale: 0.42, shadowOrigin: { x: 0.5, y: 1 } };
  if (key.startsWith("b_") || key.startsWith("lm_")) return { shadowEnabled: true, shadowType: "both", shadowLength: 48, shadowOpacity: 0.5, shadowScale: 1.15, shadowOrigin: { x: 0.5, y: 1 } };
  if (["o_tree", "o_palm", "o_pine"].includes(key)) return { shadowEnabled: true, shadowType: "both", shadowLength: 38, shadowOpacity: 0.43, shadowScale: 0.95, shadowOrigin: { x: 0.5, y: 1 } };
  if (key.startsWith("o_lamp") || ["o_sign", "o_phonebox"].includes(key)) return { shadowEnabled: true, shadowType: "both", shadowLength: 26, shadowOpacity: 0.36, shadowScale: 0.6, shadowOrigin: { x: 0.5, y: 1 } };
  if (key.startsWith("v_") || key.startsWith("o_bus") || key === "o_cab") return { shadowEnabled: true, shadowType: "both", shadowLength: 20, shadowOpacity: 0.36, shadowScale: 0.65, shadowOrigin: { x: 0.5, y: 1 } };
  if (renderClass === "hd-interior" || ["o_bench", "o_planter", "o_fountain", "o_well"].includes(key)) return { shadowEnabled: true, shadowType: "contact", shadowOpacity: 0.18, shadowScale: 0.58, shadowOrigin: { x: 0.5, y: 1 } };
  return undefined;
};

const legacy = (key: string, renderClass: VisualRenderClass = "hd-prop"): VisualAssetDef => ({
  key,
  textureKey: key,
  sourceType: "procedural",
  renderClass,
  filter: "nearest",
  auditState: "LEGACY_FALLBACK",
  shadow: shadowFor(key, renderClass),
});

/** Logical ground keys remain worldgen input; each resolves to a shared HD material texture. */
export const FINAL_GROUND_KEYS = ["t_grass", "t_grass2", "t_path", "t_sand", "t_water", "t_road", "t_snow", "t_cobble", "t_pavement", "t_paving_light", "t_paving_dark", "t_brick_path", "t_crossing", "t_asphalt", "t_road_lane", "t_lawn", "t_golf", "t_plaza_stone", "t_parking", "t_hedge", "t_wood", "t_tile", "t_carpet"];
const groundTexture = (key: string) => {
  if (key === "t_water") return "hd_terrain_water_base";
  if (["t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_parking"].includes(key)) return "hd_terrain_road";
  if (key === "t_brick_path" || key === "t_path" || key === "t_wood" || key === "t_carpet") return "hd_terrain_path";
  if (key === "t_sand") return "hd_terrain_sand";
  if (["t_pavement", "t_paving_light", "t_paving_dark", "t_cobble", "t_plaza_stone", "t_tile", "t_snow"].includes(key)) return "hd_terrain_pavement";
  return "hd_terrain_grass";
};
const hdGround = (key: string): VisualAssetDef => ({
  key,
  textureKey: groundTexture(key),
  sourceType: "alias",
  renderClass: key === "t_wood" || key === "t_tile" || key === "t_carpet" ? "hd-interior" : "hd-terrain",
  filter: "linear",
  auditState: "FINAL_HD",
});
const legacyBuildingKeys = ["b_adnoc", "b_cafe", "b_cream_comm", "b_dubai_hills_mall", "b_dubai_mall", "b_fachwerk_a", "b_fachwerk_b", "b_front_cream", "b_front_red", "b_glass_a", "b_glass_b", "b_glass_c", "b_house_blue", "b_house_green", "b_house_purple", "b_house_red", "b_mall", "b_mansion", "b_mosque_acres", "b_pub", "b_residence", "b_ritz", "b_saddle", "b_salon", "b_sandstone", "b_shop", "b_shopfront_ldn", "b_so1", "b_so2", "b_soho_narrow", "b_spinneys", "b_stucco", "b_tenement", "b_terrace_brick", "b_tower", "b_town_blue", "b_town_blue2", "b_townhouse_cream", "b_townhouse_red", "b_uni", "b_villa_modern", "b_villa_sand", "b_villa_terra", "b_villa_terra2", "b_villa_terra3", "b_waitrose", "b_wellcourt", "b_yas_mall", "lm_bigben", "lm_brandenburg", "lm_burj", "lm_castle", "lm_citadel", "lm_clocktower", "lm_mosque", "lm_roemer", "lm_westminster"];
const legacyInteriorKeys = ["f_bed", "f_bookshelf", "f_chair", "f_fridge", "f_lamp", "f_plant", "f_rug", "f_sofa", "f_table", "f_tv"];
const legacyVehicleKeys = ["v_car_red", "v_car_blue", "v_jeep_blue"];
const legacyUiKeys = ["ui_btn", "ui_coin", "ui_heart", "ui_joy_base", "ui_joy_thumb", "ui_phone", "ui_star", "i_baba_card", "i_jewelry", "i_bangle"];
const legacyPropKeys = ["o_bench", "o_bin", "o_bollard", "o_bus_red", "o_bush", "o_cab", "o_cat", "o_fence_h", "o_fence_v", "o_ferrari", "o_flower_pink", "o_flower_yellow", "o_foodtruck", "o_fountain", "o_lamp", "o_lamp_ldn", "o_note", "o_palm", "o_phonebox", "o_pine", "o_planter", "o_portal", "o_postcard", "o_railing", "o_rock", "o_shadow", "o_sign", "o_tree", "o_well"];

/**
 * The only source of truth for logical gameplay visual keys and their render metadata.
 * HD entries are registered now but remain PARTIAL until a scene deliberately adopts them.
 */
export const VISUAL_ASSETS: readonly VisualAssetDef[] = [
  ...FINAL_GROUND_KEYS.map(hdGround),
  ...legacyBuildingKeys.map((key) => legacy(key, "hd-building")),
  ...legacyInteriorKeys.map((key) => legacy(key, "hd-interior")),
  ...legacyVehicleKeys.map((key) => legacy(key, "hd-vehicle")),
  ...legacyUiKeys.map((key) => legacy(key, "hd-ui")),
  ...legacyPropKeys.map((key) => legacy(key, key === "o_tree" || key === "o_palm" || key === "o_pine" || key === "o_bush" ? "hd-foliage" : "hd-prop")),
  // The first world only needs these material textures. Keeping future art deferred
  // prevents mobile browsers from allocating dozens of unused HD textures at startup.
  bootHd("hd_terrain_grass", "assets/hd/terrain/grass.svg", "hd-terrain", 512, 512),
  hd("hd_terrain_grass_detail_01", "assets/hd/terrain/grass-detail-01.svg", "hd-terrain", 512, 512),
  hd("hd_terrain_grass_detail_02", "assets/hd/terrain/grass-detail-02.svg", "hd-terrain", 512, 512),
  bootHd("hd_terrain_path", "assets/hd/terrain/path.svg", "hd-terrain", 512, 512),
  bootHd("hd_terrain_pavement", "assets/hd/terrain/pavement.svg", "hd-terrain", 512, 512),
  bootHd("hd_terrain_road", "assets/hd/terrain/road.svg", "hd-terrain", 512, 512),
  hd("hd_terrain_driveway", "assets/hd/terrain/driveway.svg", "hd-terrain", 512, 512),
  bootHd("hd_terrain_sand", "assets/hd/terrain/sand.svg", "hd-terrain", 512, 512),
  hd("hd_terrain_sidewalk", "assets/hd/terrain/sidewalk.svg", "hd-terrain", 512, 512),
  bootHd("hd_terrain_water_base", "assets/hd/terrain/water-base.svg", "hd-terrain", 512, 512),
  bootHd("hd_terrain_water_shine", "assets/hd/terrain/water-shine.svg", "hd-effect", 512, 512),
  bootHd("hd_terrain_water_wave", "assets/hd/terrain/water-wave.svg", "hd-effect", 512, 512),
  hd("hd_building_yas_home", "assets/hd/buildings/yas-home.svg", "hd-building", 1024, 1024),
  hd("hd_building_yas_landmark", "assets/hd/buildings/yas-landmark.svg", "hd-building", 1024, 1024),
  hd("hd_building_yas_villa_cream", "assets/hd/buildings/yas-villa-cream.svg", "hd-building", 1024, 1024),
  hd("hd_building_yas_villa_modern", "assets/hd/buildings/yas-villa-modern.svg", "hd-building", 1024, 1024),
  hd("hd_building_yas_villa_sand", "assets/hd/buildings/yas-villa-sand.svg", "hd-building", 1024, 1024),
  ...["bench", "fence", "flower-bed", "planter", "street-lamp"].map((name) => hd(`hd_prop_${name.replace(/-/g, "_")}`, `assets/hd/props/${name}.svg`, "hd-prop", 512, 512)),
  ...["palm-01", "palm-02", "palm-03", "shrub-01", "shrub-02", "shrub-03", "tree-01", "tree-02", "tree-03"].map((name) => hd(`hd_foliage_${name.replace(/-/g, "_")}`, `assets/hd/props/${name}.svg`, "hd-foliage", 512, 512)),
  hd("hd_vehicle_jeep", "assets/hd/vehicles/jeep.svg", "hd-vehicle", 768, 512),
  ...["icon-action", "icon-map", "icon-phone", "icon-wardrobe"].map((name) => hd(`hd_ui_${name.replace(/-/g, "_")}`, `assets/hd/ui/${name}.svg`, "hd-ui", 256, 256)),
  ...["building-shadow", "character-shadow", "light-glow", "palm-shadow", "tree-shadow", "vehicle-shadow"].map((name) => hd(`hd_effect_${name.replace(/-/g, "_")}`, `assets/hd/effects/${name}.svg`, "hd-effect", 512, 512)),
];

const byKey = new Map(VISUAL_ASSETS.map((asset) => [asset.key, asset]));

export function getVisualAssetDef(key: string): VisualAssetDef | undefined {
  const registered = byKey.get(key);
  if (registered) return registered;
  if (key.startsWith("char_")) {
    return {
      key,
      textureKey: key,
      sourceType: "procedural",
      renderClass: "pixel-character",
      filter: "nearest",
      auditState: "LEGACY_FALLBACK",
      shadow: shadowFor(key, "pixel-character"),
    };
  }
  if (key.startsWith("b_") || key.startsWith("lm_")) return legacy(key, "hd-building");
  if (key.startsWith("f_")) return legacy(key, "hd-interior");
  if (key.startsWith("v_")) return legacy(key, "hd-vehicle");
  if (key.startsWith("ui_")) return legacy(key, "hd-ui");
  if (key.startsWith("o_")) return legacy(key, ["o_tree", "o_palm", "o_pine", "o_bush"].includes(key) ? "hd-foliage" : "hd-prop");
  return undefined;
}

export function isLegacyFallback(asset: VisualAssetDef): boolean {
  return asset.auditState === "LEGACY_FALLBACK";
}

export function requiredFilter(renderClass: VisualRenderClass): VisualFilter {
  return renderClass === "pixel-character" ? "nearest" : "linear";
}

export function auditStateFor(asset: VisualAssetDef): VisualAuditState {
  return asset.auditState;
}
