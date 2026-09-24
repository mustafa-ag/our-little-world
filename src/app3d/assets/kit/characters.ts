// Stylised chibi characters: big head, small body, hair cap, simple eyes and
// blush. No skeleton: arms and legs are separate meshes hung from pivot
// nodes and swung procedurally. Colours come from the game's CharColors.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { CharColors } from "../../../game/palette";
import type { KitContext } from "../AssetManager";
import { box, merge, sphere } from "./util";

export interface CharacterRig {
  root: TransformNode;
  meshes: Mesh[];
  /** Advance the animation. `moving` 0..1 blends idle bob -> walk swing. */
  animate(dt: number, moving: number): void;
  setColors(c: CharColors): void;
  dispose(): void;
}

export const CHAR_HEIGHT = 1.4;
export const HEAD_Y = 1.02;

function capsule(scene: Scene, r: number, h: number) {
  return CreateCapsule(`cap`, { radius: r, height: h, tessellation: 8, subdivisions: 1, capSubdivisions: 3 }, scene);
}

export function createCharacter(k: KitContext, colors: CharColors, name = "char"): CharacterRig {
  const s = k.scene;
  const root = new TransformNode(name, s);
  let skin = k.mats.flat(colors.skin);
  let hair = k.mats.flat(colors.hair);
  let top = k.mats.flat(colors.top);
  let bottom = k.mats.flat(colors.bottom);
  let shoes = k.mats.flat(colors.shoes);
  const eye = k.mats.flat("#2a2230");
  const blush = k.mats.flat("#f7a6b8");

  // ---- body (merged) ----
  const parts: Mesh[] = [];
  const head = sphere(s, 0.62, skin, 0, HEAD_Y, 0, 10);
  parts.push(head);
  // face is on +Z (forward), matching yawFor()/yawForFacing()
  const cap = sphere(s, 0.66, hair, 0, HEAD_Y + 0.09, -0.11, 10);
  cap.scaling.set(1.02, 0.9, 1);
  parts.push(cap);
  parts.push(box(s, 0.46, 0.12, 0.14, hair, 0, HEAD_Y + 0.17, 0.24)); // fringe
  parts.push(box(s, 0.12, 0.3, 0.14, hair, -0.29, HEAD_Y - 0.12, 0.08)); // side locks
  parts.push(box(s, 0.12, 0.3, 0.14, hair, 0.29, HEAD_Y - 0.12, 0.08));
  parts.push(sphere(s, 0.085, eye, -0.11, HEAD_Y - 0.03, 0.285, 6));
  parts.push(sphere(s, 0.085, eye, 0.11, HEAD_Y - 0.03, 0.285, 6));
  parts.push(sphere(s, 0.075, blush, -0.2, HEAD_Y - 0.12, 0.25, 5));
  parts.push(sphere(s, 0.075, blush, 0.2, HEAD_Y - 0.12, 0.25, 5));
  // torso: a slightly tapered box (shoulders wider) + skirt/trousers block
  const torso = box(s, 0.42, 0.34, 0.28, top, 0, 0.42, 0);
  parts.push(torso);
  parts.push(box(s, 0.38, 0.1, 0.26, bottom, 0, 0.33, 0));
  const body = merge(`${name}:body`, parts);
  body.parent = root;
  body.isPickable = false;

  // ---- limbs ----
  const mk = (r: number, len: number, mat: typeof top, x: number, y: number, extraShoe: boolean) => {
    const pivot = new TransformNode(`${name}:pivot`, s);
    pivot.parent = root;
    pivot.position.set(x, y, 0);
    const c = capsule(s, r, len);
    c.material = mat;
    c.position.y = -len / 2 + r * 0.5;
    c.parent = pivot;
    c.isPickable = false;
    const meshes: Mesh[] = [c];
    if (extraShoe) {
      const sh = box(s, r * 2.2, 0.1, r * 2.8, shoes, 0, -len + r * 0.5 - 0.04, 0.03);
      sh.parent = pivot;
      sh.isPickable = false;
      meshes.push(sh);
    }
    return { pivot, meshes };
  };
  const armL = mk(0.075, 0.34, top, -0.26, 0.56, false);
  const armR = mk(0.075, 0.34, top, 0.26, 0.56, false);
  const legL = mk(0.085, 0.3, bottom, -0.1, 0.32, true);
  const legR = mk(0.085, 0.3, bottom, 0.1, 0.32, true);
  const limbs = [armL, armR, legL, legR];

  let t = Math.random() * 10;
  const rig: CharacterRig = {
    root,
    meshes: [body, ...limbs.flatMap((l) => l.meshes)],
    animate(dt, moving) {
      t += dt * (1 + moving * 8);
      const swing = Math.sin(t) * 0.7 * moving;
      armL.pivot.rotation.x = swing;
      armR.pivot.rotation.x = -swing;
      legL.pivot.rotation.x = -swing * 0.9;
      legR.pivot.rotation.x = swing * 0.9;
      armL.pivot.rotation.z = 0.12 + Math.sin(t * 0.5) * 0.03 * (1 - moving);
      armR.pivot.rotation.z = -0.12 - Math.sin(t * 0.5) * 0.03 * (1 - moving);
      body.position.y = Math.abs(Math.sin(t)) * 0.06 * moving + Math.sin(t * 0.8) * 0.012 * (1 - moving);
      body.scaling.y = 1 + Math.sin(t * 0.8) * 0.008 * (1 - moving);
    },
    setColors(c) {
      skin = k.mats.flat(c.skin);
      hair = k.mats.flat(c.hair);
      top = k.mats.flat(c.top);
      bottom = k.mats.flat(c.bottom);
      shoes = k.mats.flat(c.shoes);
      // the merged body keeps its multi-material; swap sub-materials by identity of the old ones
      const mm = body.material as import("@babylonjs/core/Materials/multiMaterial").MultiMaterial;
      if (mm && "subMaterials" in mm) {
        mm.subMaterials = mm.subMaterials.map((m) => {
          if (m === k.mats.flat(colors.skin)) return skin;
          if (m === k.mats.flat(colors.hair)) return hair;
          if (m === k.mats.flat(colors.top)) return top;
          if (m === k.mats.flat(colors.bottom)) return bottom;
          return m;
        });
      }
      armL.meshes[0].material = top;
      armR.meshes[0].material = top;
      legL.meshes[0].material = bottom;
      legR.meshes[0].material = bottom;
      legL.meshes[1].material = shoes;
      legR.meshes[1].material = shoes;
      colors = c;
    },
    dispose() {
      root.dispose(false, true);
    },
  };
  rig.animate(0, 0);
  return rig;
}
