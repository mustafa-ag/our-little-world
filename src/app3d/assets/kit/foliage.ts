// Soft rounded low-poly foliage: round deciduous trees, tall conifers,
// bushes, flower clusters, heather patches and ivy cards. Tintable so
// instances can vary hue without extra materials.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { blob, box, cyl, merge, parseVariant, sphere, tintVertices } from "./util";

/** Round deciduous tree: a trunk and 3-4 overlapping soft blobs. */
function treeRound(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const size = parseFloat(v.size ?? "1");
  const s = k.scene;
  const trunk = k.mats.textured("planks", PALETTE.wood, 2);
  const leafHex = v.c ?? PALETTE.moss;
  const leaf = k.mats.flat("#ffffff");
  const parts: Mesh[] = [];
  const tr = cyl(s, 0.22 * size, 0.32 * size, 1.2 * size, trunk, 0, 0, 0, 7);
  tintVertices(tr, "#ffffff");
  parts.push(tr);
  const crowns: [number, number, number, number][] = [
    [0, 1.9, 0, 1.9],
    [0.55, 1.6, 0.25, 1.35],
    [-0.5, 1.7, -0.2, 1.3],
    [0.1, 2.5, -0.35, 1.25],
  ];
  for (const [x, y, z, d] of crowns) {
    const b = blob(s, d * size, leaf, x * size, y * size, z * size, 0.85, 6);
    tintVertices(b, leafHex);
    parts.push(b);
  }
  return merge("tree-a", parts);
}

/** Tall conifer / cypress: stacked flat cones. */
function treeConifer(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const size = parseFloat(v.size ?? "1");
  const s = k.scene;
  const trunk = k.mats.textured("planks", PALETTE.wood, 2);
  const leaf = k.mats.flat("#ffffff");
  const leafHex = v.c ?? "#5f7f4a";
  const tr = cyl(s, 0.18 * size, 0.26 * size, 0.8 * size, trunk, 0, 0, 0, 6);
  tintVertices(tr, "#ffffff");
  const parts: Mesh[] = [tr];
  const tiers = [
    [0.6, 1.5, 1.0],
    [1.4, 1.25, 0.95],
    [2.15, 1.0, 0.9],
    [2.8, 0.7, 0.85],
  ];
  for (const [y, d, h] of tiers) {
    const c = cyl(s, 0.05, d * size, h * size, leaf, 0, y * size, 0, 7);
    c.convertToFlatShadedMesh();
    tintVertices(c, leafHex);
    parts.push(c);
  }
  return merge("tree-b", parts);
}

function bush(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const s = k.scene;
  const leaf = k.mats.flat("#ffffff");
  const hex = v.c ?? PALETTE.sage;
  const parts: Mesh[] = [];
  const blobs: [number, number, number, number][] = [
    [0, 0.3, 0, 0.8],
    [0.32, 0.25, 0.1, 0.6],
    [-0.28, 0.24, -0.12, 0.62],
    [0.05, 0.28, -0.3, 0.55],
  ];
  for (const [x, y, z, d] of blobs) {
    const b = blob(s, d, leaf, x, y, z, 0.8, 5);
    tintVertices(b, hex);
    parts.push(b);
  }
  if (v.flowers === "1") {
    const cols = [PALETTE.dustyRose, "#f4efe0", PALETTE.mutedYellow];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const f = sphere(s, 0.12, k.mats.flat(cols[i % 3]), Math.cos(a) * 0.3, 0.55 + (i % 2) * 0.1, Math.sin(a) * 0.3, 4);
      tintVertices(f, "#ffffff");
      parts.push(f);
    }
  }
  return merge("bush", parts);
}

/** A little cluster of 5-7 flowers with leaves. Variant c = petal colour. */
function flowerCluster(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const s = k.scene;
  const petal = k.mats.flat(v.c ?? PALETTE.dustyRose);
  const leaf = k.mats.flat(PALETTE.moss);
  const stem = k.mats.flat("#5f7f4a");
  const parts: Mesh[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const r = i === 0 ? 0 : 0.18 + (i % 2) * 0.08;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.22 + (i % 3) * 0.06;
    parts.push(cyl(s, 0.025, 0.025, h, stem, x, 0, z, 4));
    parts.push(sphere(s, 0.13 + (i % 2) * 0.03, petal, x, h + 0.04, z, 4));
    parts.push(sphere(s, 0.05, k.mats.flat(PALETTE.mutedYellow), x, h + 0.09, z, 3));
  }
  const l = blob(s, 0.5, leaf, 0, 0.05, 0, 0.35, 5);
  parts.push(l);
  return merge("flower-cluster", parts);
}

/** Low purple heather patch (Scottish touch). */
function heather(k: KitContext): Mesh {
  const s = k.scene;
  const leaf = k.mats.flat("#6e7d5a");
  const bloom = k.mats.flat(PALETTE.heather);
  const parts: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.3;
    const z = Math.sin(a) * 0.3;
    const b = blob(s, 0.42, leaf, x, 0.12, z, 0.6, 4);
    parts.push(b);
    parts.push(blob(s, 0.3, bloom, x, 0.3, z, 0.7, 4));
  }
  return merge("heather", parts);
}

/** A flat ivy card to lean against walls. */
function ivyCard(k: KitContext): Mesh {
  const s = k.scene;
  const ivy = k.mats.flat(PALETTE.moss);
  const parts: Mesh[] = [];
  for (let i = 0; i < 5; i++) parts.push(box(s, 0.25 + (i % 2) * 0.15, 0.3 + (i % 3) * 0.2, 0.04, ivy, -0.3 + i * 0.15, i * 0.25, 0));
  return merge("ivy-card", parts);
}

/** Small grass tuft for the meadow edges. */
function grassTuft(k: KitContext): Mesh {
  const s = k.scene;
  const g = k.mats.flat(PALETTE.grassLight);
  const parts: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const b = box(s, 0.05, 0.25 + i * 0.05, 0.05, g, -0.08 + i * 0.08, 0, 0);
    b.rotation.z = (i - 1) * 0.25;
    parts.push(b);
  }
  return merge("grass-tuft", parts);
}

export function registerFoliage(am: AssetManager) {
  // colour variation comes from the `c=` variant (vertex colours), not instanced tints
  am.register("tree-a", treeRound, { shadow: true });
  am.register("tree-b", treeConifer, { shadow: true });
  am.register("bush", bush, { shadow: false });
  am.register("flower-cluster", flowerCluster, { shadow: false });
  am.register("heather", heather, { shadow: false });
  am.register("ivy-card", ivyCard, { shadow: false });
  am.register("grass-tuft", grassTuft, { shadow: false });
}
