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
import { box, cyl, gable, merge, parseVariant, sphere } from "./util";
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

/**
 * Regional landmarks (simple procedural silhouettes, footprint centred, front
 * facing -Z). Variant "t=mosque|big_ben|burj|colosseum|civic,w=8,d=5".
 */
export function buildLandmark(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const w = parseFloat(v.w ?? "8");
  const d = parseFloat(v.d ?? "5");
  const s = k.scene;
  const parts: Mesh[] = [];
  const glass = k.mats.flat(PALETTE.glass);
  k.lighting?.registerGlow(glass, "#b08a4a");
  switch (v.t) {
    case "mosque": {
      const white = k.mats.textured("stone", "#f3f0ea", 0.8);
      const gold = k.mats.flat("#d8b25a");
      const dome = k.mats.flat("#f7f5f0");
      // prayer hall + courtyard wall
      parts.push(box(s, w * 0.9, 0.9, d * 0.9, white, 0, 0, 0, 0.8));
      parts.push(box(s, w * 0.55, 2.4, d * 0.6, white, 0, 0, 0.2, 0.8));
      // central dome on a drum, small corner domes
      parts.push(cyl(s, 2.3, 2.3, 0.5, white, 0, 2.4, 0.2, 16));
      const main = sphere(s, 2.6, dome, 0, 2.9, 0.2, 16);
      main.scaling.y = 1.1;
      parts.push(main);
      parts.push(cyl(s, 0.05, 0.12, 0.8, gold, 0, 4.2, 0.2, 6));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(sphere(s, 0.9, dome, x * w * 0.2, 2.5, 0.2 + z * d * 0.2, 10));
      // four minarets
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const mx = x * w * 0.43;
        const mz = z * d * 0.4;
        parts.push(cyl(s, 0.38, 0.5, 5.2, white, mx, 0, mz, 10));
        parts.push(cyl(s, 0.62, 0.62, 0.18, gold, mx, 3.6, mz, 10));
        parts.push(cyl(s, 0.02, 0.42, 0.8, dome, mx, 5.2, mz, 10));
      }
      // arched doorway
      parts.push(box(s, 1.0, 1.6, 0.08, gold, 0, 0.1, -d * 0.1 - 0.03));
      break;
    }
    case "big_ben": {
      const lime = k.mats.textured("stone", "#d9c79a", 0.8);
      const dark = k.mats.flat("#3e4a4a");
      const face = k.mats.flat("#f1ead2");
      // the Palace wing along the footprint, the clock tower at the east end
      parts.push(box(s, w * 0.9, 2.2, d * 0.5, lime, -w * 0.08, 0, 0.3, 0.8));
      for (let i = 0; i < 6; i++) parts.push(cyl(s, 0.06, 0.28, 0.9, lime, -w * 0.45 + 0.4 + i * (w * 0.8) / 5, 2.2, 0.3 - d * 0.25, 4));
      const tx = w * 0.33;
      parts.push(box(s, 1.5, 7.2, 1.5, lime, tx, 0, -0.4, 0.8));
      parts.push(box(s, 1.75, 1.6, 1.75, lime, tx, 7.2, -0.4, 0.8));
      parts.push(box(s, 1.1, 0.02, 1.1, face, tx, 7.45, -1.28));
      parts.push(box(s, 1.2, 1.2, 0.04, face, tx, 7.4, -1.3));
      parts.push(box(s, 1.2, 1.2, 0.04, face, tx, 7.4, 0.5));
      parts.push(cyl(s, 0.05, 1.7, 2.4, dark, tx, 8.8, -0.4, 4));
      for (let i = 0; i < 5; i++) parts.push(box(s, 0.22, 0.5, 0.06, glass, -w * 0.4 + i * 1.2, 0.8, 0.3 - d * 0.25 - 0.02));
      break;
    }
    case "burj": {
      const steel = k.mats.flat("#b9c8d2");
      const band = k.mats.flat("#7f95a4");
      let r = Math.min(w, d) * 0.55;
      let y = 0;
      for (let i = 0; i < 9; i++) {
        const h = 2.2 - i * 0.12;
        parts.push(cyl(s, r * 0.94, r, h, i % 2 ? band : steel, 0, y, 0, 6));
        y += h;
        r *= 0.8;
      }
      parts.push(cyl(s, 0.02, r * 1.2, 4.5, steel, 0, y, 0, 6));
      for (let i = 0; i < 6; i++) parts.push(box(s, 0.5, 0.3, 0.05, glass, 0, 0.6 + i * 2, -Math.min(w, d) * 0.5 - 0.02));
      break;
    }
    case "colosseum": {
      const trav = k.mats.textured("stone", "#d8c29a", 0.8);
      const arch = k.mats.flat("#4a3a2c");
      const r = Math.min(w, d) * 0.5;
      parts.push(cyl(s, r * 2, r * 2, 3.6, trav, 0, 0, 0, 24));
      for (let tier = 0; tier < 3; tier++)
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const m = box(s, 0.36, 0.7, 0.05, arch, Math.sin(a) * (r + 0.01), 0.3 + tier * 1.15, -Math.cos(a) * (r + 0.01));
          m.rotation.y = -a;
          parts.push(m);
        }
      break;
    }
    default: {
      // civic hall: a columned front under a pediment
      const lime = k.mats.textured("stone", "#e0d4bc", 0.8);
      const roof = k.mats.textured("slate", PALETTE.slate);
      parts.push(box(s, w * 0.8, 3.0, d * 0.7, lime, 0, 0, 0.3, 0.8));
      const g = gable(s, w * 0.84, d * 0.74, 1.0, roof, lime, 0.5);
      g.position.set(0, 3.0, 0.3);
      parts.push(g);
      for (let i = 0; i < 6; i++) parts.push(cyl(s, 0.3, 0.34, 2.8, lime, -w * 0.3 + (i * w * 0.6) / 5, 0, -d * 0.05 - 0.2, 8));
      for (let i = 0; i < 4; i++) parts.push(box(s, 0.3, 0.6, 0.06, glass, -w * 0.25 + i * (w * 0.5) / 3, 1.2, -d * 0.05 + 0.02));
    }
  }
  return merge("landmark", parts);
}

export function registerArchitecture(am: AssetManager) {
  am.register("building", buildBuilding, { shadow: true });
  am.register("castle", buildCastle, { shadow: true });
  am.register("landmark", buildLandmark, { shadow: true });
  // hero GLB buildings (E1, tools/blender) with their kit fallbacks, when the table lists them
  for (const key of ["cottage-hero-a", "cottage-hero-b", "cafe-hero"]) if (key in HERO_ASSETS) am.registerHero(key as HeroKey);
}
