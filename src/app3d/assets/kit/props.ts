// Street furniture and small props. The storybook set (bench, lamp post,
// signpost, dry-stone wall, fences, planter, post box, café furniture, barrel,
// crate) are hero assets from assets/hero/props.ts (GLB + procedural
// fallback); the rest here stays procedural. Each factory returns one merged
// mesh at the origin, base at y=0, "front" facing -Z where it matters.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { box, cyl, sphere, merge } from "./util";







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
  const water = k.mats.flat("#8db4c4", { emissive: 0.04 });
  const parts: Mesh[] = [cyl(s, 2.2, 2.3, 0.4, stone, 0, 0, 0, 14), cyl(s, 2.0, 2.0, 0.05, water, 0, 0.4, 0, 14), cyl(s, 0.3, 0.4, 0.9, stone, 0, 0.4, 0, 8), cyl(s, 0.9, 0.9, 0.12, stone, 0, 1.3, 0, 10), cyl(s, 0.8, 0.8, 0.04, water, 0, 1.42, 0, 10)];
  return merge("fountain", parts);
}


/**
 * Warm pool of light under a lamp (enabled only in the evening/night): a disc
 * with a radial falloff, additive-blended, unlit, no depth write, no fog.
 */
function lampGlow(k: KitContext): Mesh {
  const s = k.scene;
  let mat = s.getMaterialByName("lampGlowMat") as StandardMaterial | null;
  if (!mat) {
    mat = new StandardMaterial("lampGlowMat", s);
    const size = 128;
    const t = new DynamicTexture("lampGlowTex", { width: size, height: size }, s, false);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    t.update(false);
    t.hasAlpha = true;
    t.getAlphaFromRGB = true;
    mat.opacityTexture = t;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.FromHexString(PALETTE.lamp).scale(0.6);
    mat.disableLighting = true;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.fogEnabled = false;
    mat.freeze();
  }
  const d = CreateDisc("lampGlowDisc", { radius: 1.5, tessellation: 20 }, s);
  d.rotation.x = Math.PI / 2;
  d.position.y = 0.02;
  d.material = mat;
  const m = merge("lamp-glow", [d]);
  m.receiveShadows = false;
  return m;
}

export function registerProps(am: AssetManager) {
  // hero pieces (GLB + procedural fallback)
  for (const key of ["bench", "lamp-post", "signpost", "stone-wall", "fence", "fence-gate", "planter", "post-box", "cafe-table", "cafe-chair", "barrel", "crate"] as const) am.registerHero(key);
  am.registerAlias("wooden-fence", "fence");
  // procedural extras
  am.register("lamp-glow", lampGlow, { shadow: false });
  am.register("phone-box", phoneBox, { shadow: true });
  am.register("chalkboard", chalkboard, { shadow: false });
  am.register("bollard", bollard, { shadow: false });
  am.register("rock", rock, { shadow: true });
  am.register("well", well, { shadow: true });
  am.register("fountain", fountain, { shadow: true });
}
