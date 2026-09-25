// Named material slots for hero assets. A hero mesh is authored with cheap
// placeholder StandardMaterials named after a slot ("olw_stone", "olw_wood"…);
// the same names survive a GLB round-trip, so AssetManager can swap every slot
// for the shared hand-painted runtime material in one place (see remapSlots).
// This file must stay usable in Node (no DOM, no DynamicTexture).

import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export const SLOTS = [
  "olw_stone", // textured warm stone (walls, plinths)
  "olw_roof_tile", // textured terracotta tiles
  "olw_slate", // textured slate
  "olw_wood", // textured planks (vertex colour modulates)
  "olw_foliage", // flat white × vertex colour (leaves, grass)
  "olw_metal", // flat white × vertex colour (iron, hubcaps)
  "olw_glass", // flat pale glass
  "olw_glass_emissive", // lantern / headlight glass, glows at night
  "olw_paint", // flat white × vertex colour (painted wood, car body, misc)
  "olw_skin", // character roles: retinted per character
  "olw_hair",
  "olw_top",
  "olw_bottom",
  "olw_shoes",
  "olw_face", // eyes, mouth, blush: fixed colours
  // Blender hero GLBs (tools/blender/**)
  "olw_stone_dark", // textured stone; COLOR_0 relative to the stone tint (darker courses)
  "olw_wood_dark", // textured planks; COLOR_0 relative to the wood tint
  "olw_awning", // flat white × vertex colour
  "olw_flower", // flat white × vertex colour
  "olw_bark", // flat white × vertex colour
  "olw_rubber", // flat white × vertex colour (tyres)
  "olw_light_emissive", // lamp / headlight glow, like olw_glass_emissive
] as const;

export type Slot = (typeof SLOTS)[number];

/** Character colour roles that AssetManager / characters.ts can retint. */
export type RoleSlot = "olw_skin" | "olw_hair" | "olw_top" | "olw_bottom" | "olw_shoes";

export function isSlot(name: string): name is Slot {
  return (SLOTS as readonly string[]).includes(name);
}

/** Placeholder colours so a raw GLB still previews sensibly outside the game. */
const PREVIEW: Record<Slot, string> = {
  olw_stone: "#c9b89a",
  olw_roof_tile: "#b8694a",
  olw_slate: "#6f7480",
  olw_wood: "#a8764f",
  olw_foliage: "#ffffff",
  olw_metal: "#ffffff",
  olw_glass: "#cfe3ee",
  olw_glass_emissive: "#ffd98a",
  olw_paint: "#ffffff",
  olw_skin: "#ffffff",
  olw_hair: "#ffffff",
  olw_top: "#ffffff",
  olw_bottom: "#ffffff",
  olw_shoes: "#ffffff",
  olw_face: "#ffffff",
  olw_stone_dark: "#9c8b70",
  olw_wood_dark: "#7a5238",
  olw_awning: "#ffffff",
  olw_flower: "#ffffff",
  olw_bark: "#ffffff",
  olw_rubber: "#ffffff",
  olw_light_emissive: "#ffd98a",
};

/** The per-scene placeholder material for a slot (cached by name). */
export function slotMaterial(scene: Scene, slot: Slot): Material {
  const existing = scene.getMaterialByName(slot);
  if (existing) return existing;
  const m = new StandardMaterial(slot, scene);
  m.diffuseColor = Color3.FromHexString(PREVIEW[slot]);
  m.specularColor = Color3.Black();
  if (slot === "olw_glass_emissive" || slot === "olw_light_emissive") m.emissiveColor = Color3.FromHexString(PREVIEW[slot]).scale(0.4);
  return m;
}

/** What every hero builder needs: a scene and a way to get a slot material. */
export interface HeroCtx {
  scene: Scene;
  mat(slot: Slot): Material;
}

export function heroCtx(scene: Scene): HeroCtx {
  return { scene, mat: (slot) => slotMaterial(scene, slot) };
}
