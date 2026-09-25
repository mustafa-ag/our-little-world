// Procedural buildings. Cottages / shops / cafés / tenements come from the
// modular Scottish kit in ./architecture/ (one merged multi-material mesh per
// preset+footprint, thin-instanced by the world builder); the castle is a
// one-off. Everything is built at the origin with the footprint centred on
// (0,0) and the front (door) facing -Z (south, toward the camera).
//
// Variant string: "p=stoneCrow,w=4,d=3" (preset + footprint in tiles). The
// legacy "k=cottage,s=cream,r=terra,f=1" form still maps onto a preset.
//
// CONTRACT for the hero GLB build script (runs under NullEngine, no DOM):
//   buildCottageHero(scene, '1s'|'2s') and buildCafeHero(scene) build pure
//   @babylonjs/core geometry with vertex colours; the merged mesh's
//   MultiMaterial slots are named olw_stone, olw_roof_tile, olw_slate,
//   olw_wood, olw_glass_emissive, olw_paint, olw_foliage, olw_metal.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { HERO_ASSETS, type AssetManager, type HeroKey, type KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { box, cyl, gable, merge, parseVariant } from "./util";
import { buildCottage } from "./architecture/cottage";
import { specFromVariant, presetVariant } from "./architecture/presets";
import { heroSlots, runtimeSlots } from "./architecture/slots";

export { PRESETS, COTTAGE_PRESETS, PRESET_1S, PRESET_2S, presetVariant, specFromVariant } from "./architecture/presets";
export { SLOT_NAMES } from "./architecture/slots";
export { kitDoorX } from "./architecture/cottage";
export type { CottageSpec } from "./architecture/presets";

/** Runtime building factory (hand-painted materials, registered as "building"). */
export function buildBuilding(k: KitContext, variant: string): Mesh {
  return buildCottage(k.scene, runtimeSlots(k), specFromVariant(variant));
}

/** Hero cottage for the GLB pipeline: pure geometry, named material slots. */
export function buildCottageHero(scene: Scene, variant: "1s" | "2s"): Mesh {
  const m = buildCottage(scene, heroSlots(scene), specFromVariant(variant === "2s" ? presetVariant("greyDormer", 4, 3) : presetVariant("stoneCrow", 4, 3)));
  m.name = `cottage-${variant}`;
  return m;
}

/** Hero café (striped awning, big warm windows, bracket sign) for the GLB pipeline. */
export function buildCafeHero(scene: Scene): Mesh {
  const m = buildCottage(scene, heroSlots(scene), specFromVariant(presetVariant("cafe", 4, 2)));
  m.name = "cafe";
  return m;
}

/** Edinburgh Castle: a stone keep with round towers and battlements on a low mound. */
export function buildCastle(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const w = parseFloat(v.w ?? "8");
  const d = parseFloat(v.d ?? "5");
  const s = k.scene;
  const parts: Mesh[] = [];
  const stone = k.mats.textured("stone", PALETTE.greyStone);
  const dark = k.mats.textured("stone", PALETTE.greyStoneDark);
  const roof = k.mats.textured("slate", PALETTE.slate);
  const glass = k.mats.flat(PALETTE.glass);
  k.lighting?.registerGlow(glass, "#b08a4a");
  const grass = k.mats.textured("grass", PALETTE.grass);

  // mound
  const mound = cyl(s, w * 0.9, w * 1.35, 0.6, grass, 0, 0, 0, 14);
  parts.push(mound);
  const rock = cyl(s, w * 0.95, w * 1.15, 0.5, dark, 0, 0.5, 0, 12);
  parts.push(rock);
  const baseY = 1.0;
  const keepH = 3.2;
  // main keep
  parts.push(box(s, w * 0.62, keepH, d * 0.6, stone, 0, baseY, 0.2, 0.8));
  // battlements
  const merlons = Math.floor((w * 0.62) / 0.5);
  for (let i = 0; i < merlons; i++) {
    const x = -w * 0.31 + 0.25 + i * 0.5;
    if (i % 2 === 0) parts.push(box(s, 0.28, 0.3, 0.28, dark, x, baseY + keepH, -d * 0.3 + 0.1));
  }
  // great hall with slate roof
  parts.push(box(s, w * 0.36, 2.3, d * 0.42, stone, -w * 0.3, baseY, 0.4, 0.8));
  const g = gable(s, w * 0.36 + 0.3, d * 0.42 + 0.3, 0.8, roof, stone, 0.5);
  g.position.set(-w * 0.3, baseY + 2.3, 0.4);
  parts.push(g);
  // towers
  const towers = [
    [w * 0.36, -d * 0.22, 4.2],
    [-w * 0.05, -d * 0.3, 3.8],
    [w * 0.4, d * 0.28, 3.4],
    [-w * 0.44, -d * 0.1, 3.0],
  ];
  for (const [x, z, h] of towers) {
    parts.push(cyl(s, 1.1, 1.2, h, stone, x, baseY, z, 10));
    parts.push(cyl(s, 1.3, 1.3, 0.3, dark, x, baseY + h, z, 10));
    parts.push(cyl(s, 0.05, 1.25, 0.9, roof, x, baseY + h + 0.3, z, 10));
    for (let i = 0; i < 3; i++) parts.push(box(s, 0.16, 0.26, 0.06, glass, x, baseY + 1 + i * 1.0, z - 0.6));
  }
  // flag
  parts.push(cyl(s, 0.04, 0.04, 1.2, k.mats.flat(PALETTE.iron), w * 0.36, baseY + 5.4, -d * 0.22, 5));
  parts.push(box(s, 0.5, 0.3, 0.02, k.mats.flat("#3b5fa8"), w * 0.36 + 0.27, baseY + 6.3, -d * 0.22));
  // gate
  const gate = box(s, 0.9, 1.4, 0.2, k.mats.textured("planks", PALETTE.wood, 2), 0, baseY, -d * 0.3 - 0.02);
  parts.push(gate);
  // keep windows
  for (let i = 0; i < 4; i++) {
    parts.push(box(s, 0.2, 0.36, 0.06, glass, -w * 0.25 + i * 0.5 * (w / 4), baseY + 1.9, -d * 0.3 - 0.02));
  }
  return merge("castle", parts);
}

export function registerArchitecture(am: AssetManager) {
  am.register("building", buildBuilding, { shadow: true });
  am.register("castle", buildCastle, { shadow: true });
  // hero GLB buildings (E1, tools/blender) with their kit fallbacks, when the table lists them
  for (const key of ["cottage-hero-a", "cottage-hero-b", "cafe-hero"]) if (key in HERO_ASSETS) am.registerHero(key as HeroKey);
}
