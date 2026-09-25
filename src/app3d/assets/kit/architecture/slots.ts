// Named material slots for the cottage kit. Every building part is built
// against ONE of these slots and vertex-tinted, so a merged building has at
// most eight submeshes and the same geometry works for two consumers:
//
//  - runtime: `runtimeSlots(k)` maps slots to the hand-painted DynamicTexture
//    materials (light base colours, the tint comes from vertex colours);
//  - hero GLB export: `heroSlots(scene)` maps them to plain StandardMaterials
//    named olw_* (no DynamicTexture / DOM), which B's build script remaps.

import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { KitContext } from "../../AssetManager";

export const SLOT_NAMES = ["olw_stone", "olw_roof_tile", "olw_slate", "olw_wood", "olw_glass_emissive", "olw_paint", "olw_foliage", "olw_metal"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

export interface Slots {
  /** stone / harled walls (tinted per building) */
  stone: Material;
  /** terracotta pantiles */
  roofTile: Material;
  /** grey slate */
  slate: Material;
  /** doors, shutters, window boxes, sign boards, eaves boards */
  wood: Material;
  /** window glass: warm emissive at night */
  glass: Material;
  /** flat painted parts: frames, sills, quoins, chimney pots, awning stripes, flowers */
  paint: Material;
  /** ivy, moss, window-box greenery */
  foliage: Material;
  /** brackets, handles, lantern iron */
  metal: Material;
}

/** Base colours the runtime textures are painted in; the real colour is the vertex tint. */
export const SLOT_BASE = {
  stone: "#f2ede4",
  render: "#f6f2ea",
  roofTile: "#f0e6dc",
  slate: "#e6e8ec",
  wood: "#eadbc4",
} as const;

/** Runtime slots: hand-painted textures, light base, vertex-tinted. */
export function runtimeSlots(k: KitContext): Slots {
  const glass = k.mats.flat("#d6e4ea");
  k.lighting?.registerGlow(glass as StandardMaterial, "#c49a52");
  return {
    stone: k.mats.textured("stone", SLOT_BASE.stone, 0.9),
    roofTile: k.mats.textured("roof", SLOT_BASE.roofTile, 1.15),
    slate: k.mats.textured("slate", SLOT_BASE.slate, 0.95),
    wood: k.mats.textured("planks", SLOT_BASE.wood, 2),
    glass,
    paint: k.mats.flat("#ffffff"),
    foliage: k.mats.flat("#ffffff"),
    metal: k.mats.flat("#ffffff"),
  };
}

/** Pure StandardMaterials named olw_*; safe under NullEngine. Cached per scene. */
export function heroSlots(scene: Scene): Slots {
  const get = (name: SlotName, hex: string, emissive?: string) => {
    let m = scene.getMaterialByName(name) as StandardMaterial | null;
    if (m) return m;
    m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (emissive) m.emissiveColor = Color3.FromHexString(emissive);
    return m;
  };
  return {
    stone: get("olw_stone", SLOT_BASE.stone),
    roofTile: get("olw_roof_tile", SLOT_BASE.roofTile),
    slate: get("olw_slate", SLOT_BASE.slate),
    wood: get("olw_wood", SLOT_BASE.wood),
    glass: get("olw_glass_emissive", "#d6e4ea", "#3a2c14"),
    paint: get("olw_paint", "#ffffff"),
    foliage: get("olw_foliage", "#ffffff"),
    metal: get("olw_metal", "#ffffff"),
  };
}
