import { TILE } from "../constants";
import { isHd } from "./mode";

/**
 * Logical visual definition. Source PNG size is never used for gameplay.
 * display* = world units the sprite occupies on screen
 * footprint* = tiles blocked in worldgen (defaults from display / TILE)
 * collision* = arcade body in world units (characters: feet only)
 */
export interface VisualAssetDef {
  key: string;
  /** Optional file under public/. If missing, procedural / generated HD is used. */
  source?: string;
  displayWidth: number;
  displayHeight: number;
  footprintWidth?: number;
  footprintHeight?: number;
  collisionWidth?: number;
  collisionHeight?: number;
  originX?: number;
  originY?: number;
  normalMap?: string;
  fallbackTexture?: string;
  kind?: "terrain" | "prop" | "building" | "character" | "vehicle" | "furniture" | "ui" | "fx";
  /** True only when a committed external file is the preferred source. */
  hdReady?: boolean;
  artStatus?: "fallback" | "temporary" | "external";
}

const REG = new Map<string, VisualAssetDef>();

function add(def: VisualAssetDef) {
  REG.set(def.key, def);
}

function box(
  key: string,
  w: number,
  h: number,
  extra: Partial<VisualAssetDef> = {},
): VisualAssetDef {
  return {
    key,
    displayWidth: w,
    displayHeight: h,
    originX: extra.originX ?? 0.5,
    originY: extra.originY ?? 1,
    footprintWidth: extra.footprintWidth ?? Math.max(1, Math.round(w / TILE)),
    footprintHeight: extra.footprintHeight ?? Math.max(1, Math.round(h / TILE) - (h >= TILE * 1.5 ? 1 : 0)),
    ...extra,
  };
}

function seedKnownSizes() {
  if (REG.size) return;

  const tile = (key: string) => add(box(key, TILE, TILE, { kind: "terrain", originX: 0, originY: 0 }));
  [
    "t_grass", "t_grass2", "t_path", "t_sand", "t_water", "t_road", "t_snow", "t_cobble",
    "t_pavement", "t_paving_light", "t_paving_dark", "t_brick_path", "t_crossing", "t_asphalt",
    "t_road_lane", "t_lawn", "t_golf", "t_plaza_stone", "t_parking", "t_hedge", "t_wood",
    "t_tile", "t_carpet",
  ].forEach(tile);

  const prop = (k: string, w: number, h: number, extra: Partial<VisualAssetDef> = {}) =>
    add(box(k, w, h, { kind: "prop", ...extra }));
  prop("o_tree", 52, 78, { footprintWidth: 1, footprintHeight: 1 });
  prop("o_pine", 18, 26);
  prop("o_bush", 18, 14);
  prop("o_rock", 16, 12);
  prop("o_flower_pink", 8, 8, { originY: 0.8 });
  prop("o_flower_yellow", 8, 8, { originY: 0.8 });
  prop("o_fence_h", TILE, TILE);
  prop("o_fence_v", TILE, TILE);
  prop("o_bench", 20, 12);
  prop("o_lamp", 10, 24);
  prop("o_sign", 16, 18);
  prop("o_well", 20, 20);
  prop("o_portal", 24, 28);
  prop("o_shadow", 16, 8, { originY: 0.5, kind: "fx" });
  prop("o_palm", 56, 96, { footprintWidth: 2, footprintHeight: 2 });
  prop("o_phonebox", 14, 30);
  prop("o_bus_red", 22, 46);
  prop("o_cab", 18, 28);
  prop("o_bollard", 6, 10);
  prop("o_planter", 16, 14);
  prop("o_bin", 10, 12);
  prop("o_railing", 16, 10);
  prop("o_lamp_ldn", 10, 26);
  prop("o_fountain", 28, 20);
  prop("o_cat", 16, 14);
  prop("o_note", 12, 14);
  prop("o_postcard", 16, 12);
  prop("o_ferrari", 42, 28);
  prop("o_foodtruck", 48, 32);

  const b = (k: string, w: number, h: number, extra: Partial<VisualAssetDef> = {}) =>
    add(box(k, w, h, { kind: "building", ...extra }));
  b("b_shop", 56, 56);
  b("b_tower", 30, 72);
  b("b_residence", 26, 84);
  b("b_yas_mall", 148, 74);
  b("b_dubai_mall", 136, 82);
  b("b_dubai_hills_mall", 108, 62);
  b("b_mall", 88, 52);
  b("b_spinneys", 52, 44);
  b("b_waitrose", 64, 48);
  b("b_adnoc", 60, 42);
  b("b_mosque_acres", 124, 108, { footprintWidth: 5, footprintHeight: 3, artStatus: "temporary" });
  b("b_uni", 60, 52);
  b("b_cafe", 56, 52);
  b("b_mansion", 52, 72);
  b("b_cream_comm", 48, 62);
  b("b_ritz", 76, 72);
  b("b_tenement", 42, 98);
  b("b_villa_sand", 56, 54);
  b("b_villa_modern", 54, 48);
  b("b_villa_terra", 52, 50);
  b("b_villa_terra2", 118, 108, { footprintWidth: 4, footprintHeight: 2, artStatus: "temporary" });
  b("b_villa_terra3", 56, 52);
  b("b_town_blue", 44, 58);
  b("b_town_blue2", 40, 52);
  b("b_so2", 48, 88);
  b("b_so1", 44, 80);
  b("b_wellcourt", 64, 78);
  b("b_saddle", 44, 36);
  b("b_salon", 52, 42);
  b("b_sandstone", 46, 60);
  b("b_glass_a", 28, 118);
  b("b_glass_b", 34, 96);
  b("b_glass_c", 24, 78);
  b("b_townhouse_red", 46, 64);
  b("b_townhouse_cream", 46, 64);
  b("b_front_red", 32, 52);
  b("b_front_cream", 32, 52);
  b("b_pub", 40, 56);
  b("b_stucco", 34, 56);
  b("b_soho_narrow", 26, 50);
  b("b_shopfront_ldn", 36, 54);
  b("b_fachwerk_a", 40, 68);
  b("b_fachwerk_b", 40, 68);

  const lm = (k: string, w: number, h: number) => add(box(k, w, h, { kind: "building" }));
  lm("lm_bigben", 44, 150);
  lm("lm_westminster", 132, 88);
  lm("lm_castle", 122, 96);
  lm("lm_burj", 44, 170);
  lm("lm_citadel", 100, 62);
  lm("lm_mosque", 132, 104);
  lm("lm_brandenburg", 116, 84);
  lm("lm_roemer", 72, 80);
  lm("lm_clocktower", 34, 92);

  const v = (k: string, w: number, h: number, extra: Partial<VisualAssetDef> = {}) =>
    add(box(k, w, h, { kind: "vehicle", originY: 0.7, ...extra }));
  v("v_car_red", 20, 34);
  v("v_car_blue", 20, 34);
  v("v_jeep_blue", 48, 66, { footprintWidth: 2, footprintHeight: 1, artStatus: "temporary", originY: 0.85 });

  const f = (k: string, w: number, h: number) => add(box(k, w, h, { kind: "furniture" }));
  f("f_bed", 30, 40);
  f("f_table", 34, 20);
  f("f_chair", 14, 18);
  f("f_sofa", 40, 22);
  f("f_tv", 30, 22);
  f("f_plant", 16, 22);
  f("f_rug", 44, 30);
  f("f_fridge", 18, 28);
  f("f_bookshelf", 26, 30);
  f("f_lamp", 12, 26);

  add(box("ui_heart", 14, 12, { kind: "ui", originY: 0.5 }));
  add(box("ui_coin", 12, 12, { kind: "ui", originY: 0.5 }));

  const ch = (key: string, hd: boolean) =>
    add({
      key,
      kind: "character",
      displayWidth: hd && isHd() ? 46 : 16,
      displayHeight: hd && isHd() ? 66 : 16,
      collisionWidth: hd && isHd() ? 10 : 8,
      collisionHeight: hd && isHd() ? 8 : 6,
      originX: 0.5,
      originY: 0.88,
      artStatus: hd ? "temporary" : "fallback",
      hdReady: false,
    });
  ch("char_her", true);
  ch("char_baba", true);
  ch("char_moomoo", false);
  ch("char_mama", false);
  ch("char_fadwa", false);
  ch("char_nour", false);
  ch("char_hazel", false);
  ch("char_rhiannon", false);
  ch("char_chloe", false);
}

export function getAsset(key: string): VisualAssetDef {
  seedKnownSizes();
  return (
    REG.get(key) ?? {
      key,
      displayWidth: TILE,
      displayHeight: TILE,
      footprintWidth: 1,
      footprintHeight: 1,
      originX: 0.5,
      originY: 1,
      fallbackTexture: key,
    }
  );
}

/** Logical size used by worldgen. Never reads the PNG. */
export function logicalSize(key: string) {
  const a = getAsset(key);
  return { w: a.displayWidth, h: a.displayHeight };
}

export function getVisualTexture(scene: Phaser.Scene, key: string) {
  const a = getAsset(key);
  const hdKey = `hd__${key}`;
  if (isHd() && scene.textures.exists(hdKey)) return hdKey;
  if (scene.textures.exists(key)) return key;
  if (a.fallbackTexture && scene.textures.exists(a.fallbackTexture)) return a.fallbackTexture;
  return scene.textures.exists("ui_heart") ? "ui_heart" : key;
}

export function applyVisual(
  img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  key: string,
) {
  const a = getAsset(key);
  img.setOrigin(a.originX ?? 0.5, a.originY ?? 1);
  img.setDisplaySize(a.displayWidth, a.displayHeight);
  return a;
}

export function applyFeetBody(sprite: Phaser.Physics.Arcade.Sprite, key: string) {
  const a = getAsset(key);
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  const cw = a.collisionWidth ?? 8;
  const ch = a.collisionHeight ?? 6;
  const dw = a.displayWidth;
  const dh = a.displayHeight;
  const ox = a.originX ?? 0.5;
  const oy = a.originY ?? 0.88;
  const sx = sprite.scaleX || 1;
  const sy = sprite.scaleY || 1;
  body.setSize(cw / sx, ch / sy);
  body.setOffset((dw * ox - cw / 2) / sx, (dh * oy - ch * 0.35) / sy);
}

export function allAssets() {
  seedKnownSizes();
  return [...REG.values()];
}

export function markHdReady(key: string) {
  markArtStatus(key, "temporary");
}

export function markArtStatus(key: string, status: VisualAssetDef["artStatus"]) {
  seedKnownSizes();
  const a = REG.get(key);
  if (!a) return;
  a.artStatus = status;
  a.hdReady = status === "external";
}
