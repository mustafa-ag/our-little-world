// A small rounded car / jeep as a static prop. Variant: "c=#hex,kind=jeep|car".

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AssetManager, KitContext } from "../AssetManager";
import { PALETTE } from "../../rendering/materials";
import { box, cyl, merge, parseVariant } from "./util";

function car(k: KitContext, variant: string): Mesh {
  const v = parseVariant(variant);
  const s = k.scene;
  const paint = k.mats.flat(v.c ?? "#3f6fd0");
  const dark = k.mats.flat(PALETTE.iron);
  const glass = k.mats.flat(PALETTE.glass);
  const light = k.mats.flat(PALETTE.lamp, { emissive: 0.3 });
  const jeep = (v.kind ?? "jeep") === "jeep";
  const parts: Mesh[] = [];
  const L = jeep ? 2.3 : 2.1;
  const W = 1.2;
  // body (front faces -Z)
  parts.push(box(s, W, jeep ? 0.55 : 0.45, L, paint, 0, 0.32, 0));
  // bumpers
  parts.push(box(s, W + 0.08, 0.14, 0.12, dark, 0, 0.3, -L / 2));
  parts.push(box(s, W + 0.08, 0.14, 0.12, dark, 0, 0.3, L / 2));
  // cabin
  const cabL = jeep ? 1.25 : 1.1;
  const cabZ = jeep ? 0.25 : 0.05;
  parts.push(box(s, W - 0.14, 0.55, cabL, glass, 0, 0.85, cabZ));
  parts.push(box(s, W - 0.1, 0.08, cabL + 0.05, paint, 0, 1.4, cabZ));
  for (const [x, z] of [
    [-0.5, -0.65],
    [0.5, -0.65],
    [-0.5, 0.65],
    [0.5, 0.65],
  ]) {
    const w = cyl(s, 0.42, 0.42, 0.22, dark, 0, 0, 0, 10);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.24, z);
    parts.push(w);
    const hub = cyl(s, 0.18, 0.18, 0.24, k.mats.flat(PALETTE.greyStone), 0, 0, 0, 8);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.24, z);
    parts.push(hub);
  }
  parts.push(box(s, 0.18, 0.12, 0.05, light, -0.4, 0.5, -L / 2 - 0.02));
  parts.push(box(s, 0.18, 0.12, 0.05, light, 0.4, 0.5, -L / 2 - 0.02));
  parts.push(box(s, 0.16, 0.1, 0.05, k.mats.flat(PALETTE.postRed), -0.4, 0.5, L / 2 + 0.02));
  parts.push(box(s, 0.16, 0.1, 0.05, k.mats.flat(PALETTE.postRed), 0.4, 0.5, L / 2 + 0.02));
  if (jeep) {
    const spare = cyl(s, 0.4, 0.4, 0.14, dark, 0, 0, 0, 10);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 0.75, L / 2 + 0.08);
    parts.push(spare);
  }
  return merge("car", parts);
}

export function registerVehicles(am: AssetManager) {
  am.register("car", car, { shadow: true });
}
