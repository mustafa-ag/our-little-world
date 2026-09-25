// A charming little European compact (Fiat 500 / Mini / 2CV spirit, not a
// copy): loaf-shaped lofted body with a rounded roof, fender bulges over real
// cylinder wheels with hubcaps, chrome bumpers, round headlights (emissive
// slot), windows in the glass slot. Front faces -Z, base at y = 0, ~2.3 long.
// Body paint is baked around CAR_BASE so `c=#hex` variants can be applied by
// ratio (retintCar).

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PALETTE } from "../../rendering/materials";
import { type ColorFn, box, cyl, dot, hexToRgb, merge, loft, recolourSlot, roundedSection, shade, sphere, torus } from "./geo";
import type { HeroCtx } from "./slots";

export const CAR_BASE = PALETTE.carTeal;
const CHROME = "#d9d6cf";
const TYRE = "#2a292c";
const GLASS = "#dbeaf0";

export function retintCar(m: Mesh, hex: string) {
  recolourSlot(m, "olw_paint", CAR_BASE, hex);
}

export function buildCar(ctx: HeroCtx): Mesh {
  const p: Mesh[] = [];
  const base = hexToRgb(CAR_BASE);
  const dark = hexToRgb(shade(CAR_BASE, -0.32));
  const light = hexToRgb(shade(CAR_BASE, 0.18));
  // vertical gradient: shadowed sills → base → lighter roof
  const paint: ColorFn = (_x, y) => {
    if (y < 0.6) {
      const t = Math.max(0, (y - 0.25) / 0.35);
      return [dark[0] + (base[0] - dark[0]) * t, dark[1] + (base[1] - dark[1]) * t, dark[2] + (base[2] - dark[2]) * t];
    }
    const t = Math.min(1, (y - 0.6) / 0.8);
    return [base[0] + (light[0] - base[0]) * t, base[1] + (light[1] - base[1]) * t, base[2] + (light[2] - base[2]) * t];
  };

  // body loft: [z, width, height, bottom]
  const spec: [number, number, number, number][] = [
    [-1.16, 0.55, 0.3, 0.42],
    [-1.1, 0.98, 0.5, 0.36],
    [-0.95, 1.18, 0.62, 0.3],
    [-0.65, 1.24, 0.7, 0.28],
    [-0.38, 1.24, 0.8, 0.28],
    [-0.18, 1.22, 1.05, 0.28],
    [0.02, 1.18, 1.22, 0.3],
    [0.32, 1.18, 1.26, 0.3],
    [0.62, 1.2, 1.18, 0.3],
    [0.9, 1.2, 0.92, 0.3],
    [1.08, 1.1, 0.6, 0.34],
    [1.16, 0.6, 0.3, 0.42],
  ];
  const sections = spec.map(([z, w, h, b]) => roundedSection(w, h, b + h / 2, z, 16, 2.4));
  const body = loft(ctx, "olw_paint", sections, paint);
  p.push(body);
  // nose / tail caps
  const nose = sphere(ctx, "olw_paint", 0.3, paint, 0, 0.57, -1.15, 4);
  nose.scaling.set(1.8, 1.0, 0.5);
  p.push(nose);
  const tail = sphere(ctx, "olw_paint", 0.3, paint, 0, 0.57, 1.15, 4);
  tail.scaling.set(1.9, 1.0, 0.5);
  p.push(tail);

  // fender bulges + wheels with hubcaps
  for (const [x, z] of [
    [-0.6, -0.72],
    [0.6, -0.72],
    [-0.6, 0.72],
    [0.6, 0.72],
  ]) {
    const arch = cyl(ctx, "olw_paint", 0.76, 0.76, 0.18, paint, 0, 0, 0, 10);
    arch.rotation.z = Math.PI / 2;
    arch.position.set(x, 0.42, z);
    p.push(arch);
    const tyre = cyl(ctx, "olw_metal", 0.6, 0.6, 0.22, TYRE, 0, 0, 0, 12);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(x * 1.05, 0.3, z);
    p.push(tyre);
    const hub = cyl(ctx, "olw_metal", 0.34, 0.34, 0.24, CHROME, 0, 0, 0, 8);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x * 1.05, 0.3, z);
    p.push(hub);
    const cap = dot(ctx, "olw_metal", 0.12, "#f0ede6", x * 1.05 + Math.sign(x) * 0.12, 0.3, z);
    p.push(cap);
  }

  // windows (glass slot): side band, windscreen, rear window (all poke out of the loft a little)
  p.push(box(ctx, "olw_glass", 1.3, 0.4, 0.9, GLASS, 0, 0.98, 0.32));
  const ws = box(ctx, "olw_glass", 1.02, 0.52, 0.06, GLASS, 0, 0.9, -0.22);
  ws.rotation.x = 0.62;
  p.push(ws);
  const rw = box(ctx, "olw_glass", 0.98, 0.46, 0.06, GLASS, 0, 0.94, 0.86);
  rw.rotation.x = -0.72;
  p.push(rw);
  // pillars (dark paint) so the glass band reads as windows
  const pillarCol: ColorFn = () => dark;
  p.push(box(ctx, "olw_paint", 1.31, 0.42, 0.05, pillarCol, 0, 0.98, -0.1));
  p.push(box(ctx, "olw_paint", 1.31, 0.42, 0.05, pillarCol, 0, 0.98, 0.34));
  p.push(box(ctx, "olw_paint", 1.31, 0.42, 0.05, pillarCol, 0, 0.98, 0.74));
  // cream roll-top roof (2CV wink): a flattened dome that follows the roof curve
  const roof = sphere(ctx, "olw_paint", 1.0, "#efe4cc", 0, 1.5, 0.3, 6);
  roof.scaling.set(0.72, 0.09, 0.85);
  p.push(roof);

  // chrome bumpers
  for (const z of [-1.2, 1.2]) {
    const b = cyl(ctx, "olw_metal", 0.09, 0.09, 1.02, CHROME, 0, 0, 0, 8);
    b.rotation.z = Math.PI / 2;
    b.position.set(0, 0.4, z);
    p.push(b);
    for (const x of [-0.42, 0.42]) p.push(dot(ctx, "olw_metal", 0.12, CHROME, x, 0.4, z));
  }
  // headlights (emissive glass) with chrome rings, grille, plate
  for (const x of [-0.4, 0.4]) {
    p.push(sphere(ctx, "olw_glass_emissive", 0.2, "#fff1c8", x, 0.72, -1.08, 4));
    const ring = torus(ctx, "olw_metal", 0.22, 0.03, CHROME, x, 0.72, -1.1, 6);
    ring.rotation.x = Math.PI / 2;
    p.push(ring);
    p.push(dot(ctx, "olw_paint", 0.11, "#b8433c", x * 1.05, 0.72, 1.12)); // tail lights
  }
  p.push(box(ctx, "olw_metal", 0.36, 0.1, 0.03, CHROME, 0, 0.5, -1.2));
  p.push(box(ctx, "olw_paint", 0.36, 0.1, 0.02, "#f2ead6", 0, 0.32, -1.22));
  p.push(box(ctx, "olw_paint", 0.36, 0.1, 0.02, "#f2ead6", 0, 0.34, 1.21));
  // door seams, handles, mirrors
  for (const x of [-0.62, 0.62]) {
    p.push(box(ctx, "olw_paint", 0.02, 0.5, 0.02, pillarCol, x, 0.35, 0.05));
    p.push(box(ctx, "olw_paint", 0.02, 0.5, 0.02, pillarCol, x, 0.35, 0.7));
    p.push(box(ctx, "olw_metal", 0.03, 0.03, 0.12, CHROME, x, 0.75, 0.42));
    p.push(box(ctx, "olw_metal", 0.1, 0.03, 0.03, CHROME, x * 1.1, 1.0, -0.12));
    p.push(dot(ctx, "olw_metal", 0.09, CHROME, x * 1.18, 1.02, -0.12));
  }
  const car = merge("car", p);
  // a touch smaller than life so it sits sweetly next to the chibi villagers
  car.scaling.setAll(0.88);
  car.bakeCurrentTransformIntoVertices();
  return car;
}
