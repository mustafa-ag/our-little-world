// Street furniture and small props. Each factory returns one merged mesh at
// the origin, base at y=0, "front" facing -Z where it matters.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { box, cyl, sphere, merge, parseVariant } from "./util";

/** Dry-stone wall segment, 1 unit long along X. */
function stoneWall(k: KitContext): Mesh {
  const s = k.scene;
  const stone = k.mats.textured("cobble", "#9d9283", 1);
  const parts: Mesh[] = [box(s, 1.02, 0.42, 0.34, stone, 0, 0, 0, 1.6)];
  // cap stones
  const cap = k.mats.textured("stone", PALETTE.greyStoneDark, 2);
  for (let i = 0; i < 5; i++) {
    const b = box(s, 0.19, 0.1, 0.3 + (i % 2) * 0.06, cap, -0.4 + i * 0.2, 0.42, 0);
    b.rotation.y = (i % 2 ? 1 : -1) * 0.12;
    parts.push(b);
  }
  return merge("stone-wall", parts);
}

/** Low wooden picket fence, 1 unit long along X. */
function woodenFence(k: KitContext): Mesh {
  const s = k.scene;
  const wood = k.mats.textured("planks", PALETTE.woodLight, 2);
  const parts: Mesh[] = [];
  parts.push(box(s, 0.08, 0.6, 0.08, wood, -0.5, 0, 0));
  parts.push(box(s, 1.0, 0.06, 0.05, wood, 0, 0.42, 0));
  parts.push(box(s, 1.0, 0.06, 0.05, wood, 0, 0.16, 0));
  for (let i = 0; i < 4; i++) parts.push(box(s, 0.08, 0.5, 0.04, wood, -0.35 + i * 0.24, 0.06, 0.03));
  return merge("wooden-fence", parts);
}

/** Black iron lamp post with a warm lantern (glows at night). */
function lampPost(k: KitContext): Mesh {
  const s = k.scene;
  const iron = k.mats.flat(PALETTE.iron);
  const glow = k.mats.flat(PALETTE.lamp, { emissive: 0.15 });
  k.lighting?.registerGlow(glow, PALETTE.lamp, "#3a3020");
  const parts: Mesh[] = [];
  parts.push(cyl(s, 0.2, 0.28, 0.16, iron, 0, 0, 0, 8));
  parts.push(cyl(s, 0.07, 0.11, 2.1, iron, 0, 0.16, 0, 6));
  parts.push(cyl(s, 0.14, 0.09, 0.08, iron, 0, 2.26, 0, 6));
  // lantern: glass box + cap
  parts.push(box(s, 0.26, 0.34, 0.26, glow, 0, 2.34, 0));
  parts.push(cyl(s, 0.02, 0.36, 0.16, iron, 0, 2.68, 0, 4));
  parts.push(sphere(s, 0.08, iron, 0, 2.86, 0, 4));
  for (let i = 0; i < 4; i++) {
    const r = box(s, 0.03, 0.34, 0.03, iron, 0, 2.34, 0);
    r.position.x = i % 2 ? 0.13 : -0.13;
    r.position.z = i < 2 ? 0.13 : -0.13;
    parts.push(r);
  }
  return merge("lamp-post", parts);
}

function bench(k: KitContext): Mesh {
  const s = k.scene;
  const wood = k.mats.textured("planks", PALETTE.wood, 2);
  const iron = k.mats.flat(PALETTE.iron);
  const parts: Mesh[] = [];
  for (let i = 0; i < 3; i++) parts.push(box(s, 1.1, 0.05, 0.11, wood, 0, 0.42, -0.14 + i * 0.13));
  for (let i = 0; i < 2; i++) {
    const back = box(s, 1.1, 0.11, 0.05, wood, 0, 0.55 + i * 0.16, 0.2);
    back.rotation.x = -0.15;
    parts.push(back);
  }
  for (const x of [-0.45, 0.45]) {
    parts.push(box(s, 0.06, 0.42, 0.4, iron, x, 0, 0));
    const arm = box(s, 0.06, 0.45, 0.06, iron, x, 0.42, 0.2);
    arm.rotation.x = -0.15;
    parts.push(arm);
  }
  return merge("bench", parts);
}

/** Wooden direction signpost with three arrows. */
function signpost(k: KitContext): Mesh {
  const s = k.scene;
  const wood = k.mats.textured("planks", PALETTE.wood, 2);
  const cream = k.mats.flat(PALETTE.creamLight);
  const parts: Mesh[] = [cyl(s, 0.12, 0.14, 2.0, wood, 0, 0, 0, 6)];
  const ink = k.mats.flat("#5a4634");
  const arrows: [number, number][] = [
    [1.55, 1],
    [1.25, -1],
    [0.95, 1],
  ];
  for (const [y, dir] of arrows) {
    parts.push(box(s, 0.7, 0.17, 0.05, cream, dir * 0.32, y, 0));
    const tip = box(s, 0.12, 0.17, 0.12, cream, dir * 0.67, y, 0);
    tip.rotation.y = Math.PI / 4;
    parts.push(tip);
    parts.push(box(s, 0.4, 0.035, 0.012, ink, dir * 0.3, y + 0.065, -0.03));
  }
  parts.push(sphere(s, 0.16, wood, 0, 2.05, 0, 6));
  return merge("signpost", parts);
}

/** Red pillar post box. */
function postBox(k: KitContext): Mesh {
  const s = k.scene;
  const red = k.mats.flat(PALETTE.postRed);
  const dark = k.mats.flat(PALETTE.iron);
  const parts: Mesh[] = [
    cyl(s, 0.4, 0.4, 0.1, dark, 0, 0, 0, 10),
    cyl(s, 0.38, 0.38, 0.9, red, 0, 0.1, 0, 10),
    cyl(s, 0.1, 0.42, 0.14, red, 0, 1.0, 0, 10),
    box(s, 0.2, 0.05, 0.06, dark, 0, 0.72, -0.19),
    box(s, 0.24, 0.16, 0.02, k.mats.flat(PALETTE.creamLight), 0, 0.45, -0.19),
  ];
  return merge("post-box", parts);
}

/** Red telephone box. */
function phoneBox(k: KitContext): Mesh {
  const s = k.scene;
  const red = k.mats.flat(PALETTE.postRed);
  const glass = k.mats.flat(PALETTE.glass);
  k.lighting?.registerGlow(glass, "#8a6a3a");
  const parts: Mesh[] = [box(s, 0.7, 0.1, 0.7, k.mats.flat(PALETTE.iron), 0, 0, 0), box(s, 0.62, 1.9, 0.62, glass, 0, 0.1, 0)];
  for (const [x, z] of [
    [-0.29, -0.29],
    [0.29, -0.29],
    [-0.29, 0.29],
    [0.29, 0.29],
  ])
    parts.push(box(s, 0.08, 1.9, 0.08, red, x, 0.1, z));
  for (let i = 0; i < 3; i++) {
    parts.push(box(s, 0.66, 0.04, 0.66, red, 0, 0.6 + i * 0.4, 0));
  }
  parts.push(box(s, 0.72, 0.16, 0.72, red, 0, 2.0, 0));
  parts.push(box(s, 0.5, 0.14, 0.5, red, 0, 2.16, 0));
  parts.push(box(s, 0.62, 0.14, 0.03, k.mats.flat(PALETTE.creamLight), 0, 2.02, -0.36));
  return merge("phone-box", parts);
}

/** Terracotta planter with a bushy plant. */
function planter(k: KitContext): Mesh {
  const s = k.scene;
  const terra = k.mats.flat(PALETTE.terracotta);
  const parts: Mesh[] = [cyl(s, 0.5, 0.36, 0.42, terra, 0, 0, 0, 10), cyl(s, 0.54, 0.54, 0.08, terra, 0, 0.4, 0, 10)];
  const leaf = k.mats.flat(PALETTE.sage);
  const bl = sphere(s, 0.55, leaf, 0, 0.62, 0, 6);
  bl.convertToFlatShadedMesh();
  parts.push(bl);
  const cols = [PALETTE.dustyRose, PALETTE.mutedYellow, "#f4efe0"];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(sphere(s, 0.14, k.mats.flat(cols[i % cols.length]), Math.cos(a) * 0.2, 0.8, Math.sin(a) * 0.2, 4));
  }
  return merge("planter", parts);
}

function cafeChair(k: KitContext): Mesh {
  const s = k.scene;
  const wood = k.mats.textured("planks", PALETTE.woodLight, 2);
  const parts: Mesh[] = [box(s, 0.4, 0.05, 0.4, wood, 0, 0.42, 0)];
  for (const [x, z] of [
    [-0.16, -0.16],
    [0.16, -0.16],
    [-0.16, 0.16],
    [0.16, 0.16],
  ])
    parts.push(box(s, 0.05, 0.42, 0.05, wood, x, 0, z));
  parts.push(box(s, 0.4, 0.4, 0.05, wood, 0, 0.47, 0.17));
  return merge("cafe-chair", parts);
}

function cafeTable(k: KitContext): Mesh {
  const s = k.scene;
  const wood = k.mats.textured("planks", PALETTE.wood, 2);
  const iron = k.mats.flat(PALETTE.iron);
  const parts: Mesh[] = [cyl(s, 0.8, 0.8, 0.06, wood, 0, 0.66, 0, 12), cyl(s, 0.06, 0.06, 0.66, iron, 0, 0, 0, 6), cyl(s, 0.4, 0.5, 0.05, iron, 0, 0, 0, 10)];
  // a little cup
  parts.push(cyl(s, 0.1, 0.08, 0.1, k.mats.flat(PALETTE.creamLight), 0.2, 0.72, 0.1, 8));
  return merge("cafe-table", parts);
}

function chalkboard(k: KitContext): Mesh {
  const s = k.scene;
  const wood = k.mats.textured("planks", PALETTE.wood, 2);
  const board = k.mats.flat("#2f3a30");
  const parts: Mesh[] = [];
  const a = box(s, 0.5, 0.8, 0.04, wood, 0, 0, 0);
  a.rotation.x = 0.2;
  a.position.z = -0.08;
  parts.push(a);
  const b = box(s, 0.42, 0.6, 0.02, board, 0, 0.12, 0);
  b.rotation.x = 0.2;
  b.position.z = -0.11;
  parts.push(b);
  const back = box(s, 0.5, 0.8, 0.04, wood, 0, 0, 0);
  back.rotation.x = -0.2;
  back.position.z = 0.08;
  parts.push(back);
  // chalk scribbles
  const chalk = k.mats.flat("#f4efe0");
  for (let i = 0; i < 3; i++) {
    const l = box(s, 0.28 - i * 0.05, 0.03, 0.01, chalk, -0.02, 0.5 - i * 0.12, 0);
    l.rotation.x = 0.2;
    l.position.z = -0.125 - (0.5 - i * 0.12) * 0.2 + 0.12 * 0.2;
    parts.push(l);
  }
  return merge("chalkboard", parts);
}

function bollard(k: KitContext): Mesh {
  const s = k.scene;
  const iron = k.mats.flat(PALETTE.iron);
  return merge("bollard", [cyl(s, 0.14, 0.18, 0.7, iron, 0, 0, 0, 8), sphere(s, 0.18, iron, 0, 0.72, 0, 6)]);
}

function rock(k: KitContext): Mesh {
  const s = k.scene;
  const m = sphere(s, 0.8, k.mats.flat(PALETTE.greyStone), 0, 0.2, 0, 5);
  m.scaling.set(1.2, 0.6, 0.9);
  m.convertToFlatShadedMesh();
  return merge("rock", [m]);
}

/** Stone well with a little roof. */
function well(k: KitContext): Mesh {
  const s = k.scene;
  const stone = k.mats.textured("stone", PALETTE.greyStone);
  const wood = k.mats.textured("planks", PALETTE.wood, 2);
  const parts: Mesh[] = [cyl(s, 1.0, 1.05, 0.7, stone, 0, 0, 0, 10), cyl(s, 0.06, 0.06, 1.5, wood, -0.45, 0.7, 0, 5), cyl(s, 0.06, 0.06, 1.5, wood, 0.45, 0.7, 0, 5)];
  const roof = k.mats.textured("roof", PALETTE.terracotta);
  const r = box(s, 1.3, 0.06, 0.8, roof, 0, 2.2, 0);
  parts.push(r);
  return merge("well", parts);
}

function fountain(k: KitContext): Mesh {
  const s = k.scene;
  const stone = k.mats.textured("stone", PALETTE.greyStone);
  const water = k.mats.flat(PALETTE.water, { emissive: 0.1 });
  const parts: Mesh[] = [cyl(s, 2.2, 2.3, 0.4, stone, 0, 0, 0, 14), cyl(s, 2.0, 2.0, 0.05, water, 0, 0.4, 0, 14), cyl(s, 0.3, 0.4, 0.9, stone, 0, 0.4, 0, 8), cyl(s, 0.9, 0.9, 0.12, stone, 0, 1.3, 0, 10), cyl(s, 0.8, 0.8, 0.04, water, 0, 1.42, 0, 10)];
  return merge("fountain", parts);
}

/** Generic unknown prop: a small crate. */
function crate(k: KitContext): Mesh {
  const s = k.scene;
  return merge("crate", [box(s, 0.6, 0.5, 0.6, k.mats.textured("planks", PALETTE.woodLight, 2), 0, 0, 0, 1.5)]);
}

/** Warm pool of light under a lamp (enabled only in the evening/night). */
function lampGlow(k: KitContext): Mesh {
  const s = k.scene;
  const m = k.mats.flat(PALETTE.lamp, { emissive: 0.9, alpha: 0.28 });
  const d = cyl(s, 2.6, 2.6, 0.02, m, 0, 0.012, 0, 16);
  return merge("lamp-glow", [d]);
}

export function registerProps(am: AssetManager) {
  am.register("lamp-glow", lampGlow, { shadow: false });
  am.register("stone-wall", stoneWall, { shadow: true });
  am.register("wooden-fence", woodenFence, { shadow: false });
  am.register("lamp-post", lampPost, { shadow: true });
  am.register("bench", bench, { shadow: true });
  am.register("signpost", signpost, { shadow: true });
  am.register("post-box", postBox, { shadow: true });
  am.register("phone-box", phoneBox, { shadow: true });
  am.register("planter", planter, { shadow: false });
  am.register("cafe-chair", cafeChair, { shadow: false });
  am.register("cafe-table", cafeTable, { shadow: false });
  am.register("chalkboard", chalkboard, { shadow: false });
  am.register("bollard", bollard, { shadow: false });
  am.register("rock", rock, { shadow: true });
  am.register("well", well, { shadow: true });
  am.register("fountain", fountain, { shadow: true });
  am.register("crate", crate, { shadow: false });
  void parseVariant;
}
