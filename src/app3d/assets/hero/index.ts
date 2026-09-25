// The hero asset table: one entry per reusable GLB, with its code-authored
// builder (used by scripts/build-hero-assets.mjs to export the GLB and by
// AssetManager as the procedural fallback) and how AssetManager should treat
// it. Track C references these keys through AssetManager (thinInstances /
// instantiate); 'cottage-1s', 'cottage-2s' and 'cafe' have no builder here:
// game3d.ts registers Track C's buildCottageHero / buildCafeHero for them.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { HeroCtx } from "./slots";
import { buildBushA, buildBushB, buildTreeOakA, buildTreeOakB, buildTreePine, buildTreeSmall, retintFoliage } from "./trees";
import { buildBarrel, buildBench, buildCafeChair, buildCafeTable, buildCrate, buildFence, buildFenceGate, buildIvyCard, buildLampPost, buildPlanter, buildPostBox, buildSignpost, buildStoneWall } from "./props";
import { buildCar, retintCar } from "./car";
import { buildCharacter } from "./character";

export type HeroBuild = (ctx: HeroCtx) => Mesh | TransformNode;

export interface HeroEntry {
  /** GLB path relative to the site base (public/assets/models/<key>.glb). */
  url: string;
  /** Pure-geometry builder; absent for Track C's architecture heroes (registered from game3d). */
  build?: HeroBuild;
  /** Casts shadows (default true). */
  shadow?: boolean;
  /** Merge into one prototype mesh (default true); false keeps the node hierarchy (player). */
  merge?: boolean;
  /** Applies a variant string ("c=#hex", …) to a fresh prototype clone. */
  variant?: (mesh: Mesh, variant: string) => void;
}

const glb = (key: string) => `assets/models/${key}.glb`;

const hexOf = (v: string) => /(?:^|,)c=(#[0-9a-fA-F]{6})/.exec(v)?.[1];
const foliageVariant = (m: Mesh, v: string) => {
  const c = hexOf(v);
  if (c) retintFoliage(m, c);
};
const carVariant = (m: Mesh, v: string) => {
  const c = hexOf(v);
  if (c) retintCar(m, c);
};

export const HERO_ASSETS = {
  player: { url: glb("player"), build: (ctx: HeroCtx) => buildCharacter(ctx, { name: "player", hair: "long", skirt: true, scarf: true }).root, merge: false },
  "tree-oak-a": { url: glb("tree-oak-a"), build: buildTreeOakA, variant: foliageVariant },
  "tree-oak-b": { url: glb("tree-oak-b"), build: buildTreeOakB, variant: foliageVariant },
  "tree-small": { url: glb("tree-small"), build: buildTreeSmall, variant: foliageVariant },
  "tree-pine": { url: glb("tree-pine"), build: buildTreePine, variant: foliageVariant },
  "bush-a": { url: glb("bush-a"), build: buildBushA, shadow: false, variant: foliageVariant },
  "bush-b": { url: glb("bush-b"), build: buildBushB, shadow: false, variant: foliageVariant },
  bench: { url: glb("bench"), build: buildBench },
  "lamp-post": { url: glb("lamp-post"), build: buildLampPost },
  signpost: { url: glb("signpost"), build: buildSignpost },
  "stone-wall": { url: glb("stone-wall"), build: buildStoneWall },
  fence: { url: glb("fence"), build: buildFence, shadow: false },
  "fence-gate": { url: glb("fence-gate"), build: buildFenceGate, shadow: false },
  planter: { url: glb("planter"), build: buildPlanter, shadow: false },
  car: { url: glb("car"), build: buildCar, variant: carVariant },
  "post-box": { url: glb("post-box"), build: buildPostBox },
  "cafe-table": { url: glb("cafe-table"), build: buildCafeTable, shadow: false },
  "cafe-chair": { url: glb("cafe-chair"), build: buildCafeChair, shadow: false },
  "ivy-card": { url: glb("ivy-card"), build: buildIvyCard, shadow: false },
  barrel: { url: glb("barrel"), build: buildBarrel },
  crate: { url: glb("crate"), build: buildCrate },
  "cottage-1s": { url: glb("cottage-1s") },
  "cottage-2s": { url: glb("cottage-2s") },
  cafe: { url: glb("cafe") },
} satisfies Record<string, HeroEntry>;

export type HeroKey = keyof typeof HERO_ASSETS;
export const HERO_KEYS = Object.keys(HERO_ASSETS) as HeroKey[];

/** Legacy kit keys still used by dressing/propMap, mapped onto hero keys. */
export const HERO_ALIASES: Record<string, HeroKey> = {
  "tree-a": "tree-oak-a",
  "tree-b": "tree-pine",
  bush: "bush-a",
  "wooden-fence": "fence",
};
