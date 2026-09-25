// Distant Edinburgh skyline beyond the playable map (the camera always looks
// north, so it is a wide northern panorama). Painted-cardboard layers, far to
// near, each lighter / cooler / softer than the one in front (atmospheric
// perspective):
//   1. far blue Highland-ish ridges
//   2. rolling green hills with an Arthur's-Seat-like crag (lion's haunch + cliff)
//   3. the old-town skyline: tenement gables, chimney stacks, spires, the St
//      Giles crown, and (optionally) the castle on its rock
//   4. a near fringe of dark tree-tops / fields
// plus two soft mist ribbons in the valleys between layers.
//
// Each layer is one unlit vertex-coloured ribbon (a height profile swept to
// below the horizon), coloured per time of day from the lighting Atmosphere
// (mix(base * farLight, haze, depth)). Layers ride with the camera with a
// small parallax so they never run out and always stay beyond the map.
// ~6 draw calls, no lights, no fog, no collision.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Atmosphere } from "./lighting";
import { meshFromArrays, unlitMaterial } from "./sky";

export interface BackdropOptions {
  /** Map size in tiles (x east, -z south). */
  mapW: number;
  mapH: number;
  /** Draw the castle-on-its-rock silhouette in the skyline. */
  castle?: boolean;
  seed?: number;
}

export interface Backdrop {
  setAtmosphere(a: Atmosphere): void;
  update(cam: Vector3): void;
  dispose(): void;
}

interface Layer {
  mesh: Mesh;
  mat: StandardMaterial;
  base: Color3;
  /** 0 = crisp, 1 = fully hazed. */
  haze: number;
  dist: number;
  /** How much the layer rides with the camera (1 = skybox-like). */
  follow: number;
  /** Mist layers: alpha-blended haze ribbons. */
  mist?: boolean;
}

function hash(i: number, s: number) {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function vnoise(x: number, s: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, s) * (1 - u) + hash(i + 1, s) * u;
}
/** Soft fractal ridge in [0,1]. */
function fbm(x: number, s: number, oct = 4) {
  let a = 0.5;
  let t = 0;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    t += vnoise(x, s + o * 17) * a;
    n += a;
    x *= 2.03;
    a *= 0.5;
  }
  return t / n;
}

const HALF = 520; // half-width of every ribbon (covers the widest frame + parallax)
const BOTTOM = -30;

/**
 * Sweep a silhouette y(x) (a polyline, x ascending, vertical steps allowed) down
 * to BOTTOM as a vertical ribbon at z = 0, with a top->bottom colour ramp.
 */
function ribbon(scene: Scene, name: string, pts: [number, number][], topShade: number, bottomShade: number, mist = false) {
  const bottom = mist ? -1 : BOTTOM;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    // slight bow toward the camera at the ends so wide frames don't see the edge on
    const z = (x / HALF) ** 2 * -40;
    pos.push(x, y, z, x, bottom, z);
    if (mist) col.push(1, 1, 1, 0, 1, 1, 1, 0.85);
    else col.push(topShade, topShade, topShade, 1, bottomShade, bottomShade, bottomShade, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  return meshFromArrays(scene, name, pos, idx, col);
}

/** Height profile sampler -> points. */
function sample(fn: (x: number) => number, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = -HALF; x <= HALF + 0.01; x += step) out.push([x, fn(x)]);
  return out;
}

/** The old-town skyline: stepped gables, chimneys, spires, optional castle rock. */
function skyline(seed: number, castle: boolean): [number, number][] {
  const pts: [number, number][] = [];
  const castleX0 = -150;
  const castleX1 = -60;
  // the rock under the castle: steep cliff faces west/north, a long tail east (the Royal Mile ridge)
  const rock = (x: number) => {
    if (!castle) return 0;
    if (x < castleX0 - 25 || x > castleX1 + 110) return 0;
    if (x < castleX0) return ((x - (castleX0 - 25)) / 25) ** 0.6 * 22; // western cliff
    if (x < castleX1) return 22 + Math.sin((x - castleX0) * 0.12) * 1.2;
    return 22 * (1 - (x - castleX1) / 110) ** 1.4; // eastern tail down the ridge
  };
  const push = (x: number, y: number) => pts.push([x, y]);
  let x = -HALF;
  let i = 0;
  push(x, 3);
  while (x < HALF) {
    const r = hash(i, seed);
    const r2 = hash(i, seed + 3);
    const base = rock(x);
    // the castle itself on the rock
    if (castle && x >= castleX0 && x < castleX1) {
      const parts: [number, number][] = [
        [7, 9], // gatehouse
        [4, 14], // half-moon battery tower
        [12, 8],
        [3, 12],
        [14, 10], // palace block
        [3, 15], // flag tower
        [16, 9], // great hall
        [5, 13],
        [12, 7.5],
      ];
      let cx = castleX0 + 4;
      for (const [w, h] of parts) {
        const yb = rock(cx) + 0.5;
        push(cx, yb);
        push(cx, yb + h);
        // battlements on the wider blocks
        if (w > 6) {
          for (let b = 1; b < w; b += 2) {
            push(cx + b, yb + h);
            push(cx + b, yb + h + 0.9);
            push(cx + b + 1, yb + h + 0.9);
            push(cx + b + 1, yb + h);
          }
        }
        push(cx + w, yb + h);
        push(cx + w, yb);
        cx += w;
      }
      x = castleX1;
      continue;
    }
    // a spire every so often (St Giles' crown near the middle-right)
    if (Math.abs(x - 40) < 6 && !pts.some((p) => p[1] > 30 + base)) {
      const h = base + 13;
      push(x, base + 2);
      push(x, h);
      push(x + 1.5, h + 2.5);
      push(x + 3, h + 1.2);
      push(x + 4.5, h + 3.4); // crown
      push(x + 6, h + 1.2);
      push(x + 7.5, h + 2.5);
      push(x + 9, h);
      push(x + 9, base + 2);
      x += 9;
      i++;
      continue;
    }
    if (r > 0.93) {
      const h = base + 10 + r2 * 6;
      push(x, base + 4);
      push(x, h);
      push(x + 1.6, h + 9 + r2 * 5);
      push(x + 3.2, h);
      push(x + 3.2, base + 4);
      x += 3.2;
      i++;
      continue;
    }
    // a tenement / terrace block with a gable or a flat top and chimney stacks
    const w = 5 + r * 9;
    const h = base + 4 + r2 * 6 + (Math.abs(x) < 160 ? 3 : 0);
    push(x, h);
    if (r2 > 0.55) {
      // crow-stepped gable
      const st = w / 6;
      push(x + st, h);
      push(x + st, h + 1);
      push(x + st * 2, h + 1);
      push(x + st * 2, h + 2);
      push(x + st * 4, h + 2);
      push(x + st * 4, h + 1);
      push(x + st * 5, h + 1);
      push(x + st * 5, h);
    } else if (r2 > 0.25) {
      push(x + w / 2, h + 2.8); // pitched roof
    } else {
      // flat top with two chimney stacks
      for (const f of [0.22, 0.7]) {
        push(x + w * f, h);
        push(x + w * f, h + 2.2);
        push(x + w * f + 1.2, h + 2.2);
        push(x + w * f + 1.2, h);
      }
    }
    push(x + w, h);
    x += w;
    i++;
  }
  return pts;
}

export function createBackdrop(scene: Scene, opts: BackdropOptions): Backdrop {
  const seed = opts.seed ?? 7;
  const layers: Layer[] = [];
  const add = (mesh: Mesh, base: string, haze: number, dist: number, follow: number, mist = false) => {
    const mat = unlitMaterial(scene, `${mesh.name}Mat`);
    if (mist) {
      mat.alpha = 0.999; // force the alpha pass (vertex alpha ramps the ribbon out)
      mat.disableDepthWrite = true;
      mesh.hasVertexAlpha = true;
    }
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.alwaysSelectAsActiveMesh = true;
    layers.push({ mesh, mat, base: Color3.FromHexString(base), haze, dist, follow, mist });
  };

  // 1. far ridges (Highlands / Pentlands, blue and soft)
  add(
    ribbon(
      scene,
      "bdFar",
      sample((x) => 20 + fbm(x / 70, seed) * 34 + Math.max(0, 1 - Math.abs(x + 230) / 120) * 14, 8),
      1,
      1.0,
    ),
    "#6f86a0",
    0.62,
    400,
    0.93,
  );
  // 2. rolling hills + Arthur's Seat (east / right of frame)
  const seat = (x: number) => {
    const u = (x - 170) / 95; // -1..1 across the hill
    if (u < -1.2 || u > 1.3) return 0;
    // long lion's back rising to the head, then a steep drop (Salisbury crags on the flank)
    const back = Math.max(0, 1 - Math.abs(u + 0.1) / 1.2) ** 1.2 * 26;
    const head = Math.max(0, 1 - Math.abs(u - 0.35) / 0.22) * 12;
    const crags = u > -0.9 && u < -0.45 ? 4 : 0;
    return back + head + crags;
  };
  add(ribbon(scene, "bdHills", sample((x) => 9 + fbm(x / 45, seed + 5) * 18 + seat(x), 5), 1, 0.96), "#6d8a66", 0.44, 330, 0.88);
  // 3. old-town skyline (+ castle rock)
  add(ribbon(scene, "bdTown", skyline(seed, opts.castle ?? true), 1, 0.9), "#7d7a80", 0.34, 250, 0.8);
  // 4. near fringe of trees / fields
  add(
    ribbon(
      scene,
      "bdTrees",
      sample((x) => 2 + fbm(x / 9, seed + 9, 3) * 7 + Math.max(0, Math.sin(x / 23 + 1)) * 2, 2.5),
      1,
      0.92,
    ),
    "#56704a",
    0.26,
    185,
    0.72,
  );
  // mist ribbons in front of the town and the near fringe
  add(ribbon(scene, "bdMist1", sample(() => 10, 40), 1, 1, true), "#ffffff", 1, 245, 0.8, true);
  add(ribbon(scene, "bdMist2", sample(() => 5, 40), 1, 1, true), "#ffffff", 1, 180, 0.72, true);

  // anchor: the map's north edge (z = 0) and its centre x
  const anchorX = opts.mapW / 2;
  const northZ = 0;

  const c = new Color3();
  return {
    setAtmosphere(a) {
      for (const l of layers) {
        if (l.mist) {
          l.mat.emissiveColor = a.haze.clone();
          continue;
        }
        c.copyFrom(l.base).multiplyToRef(a.light, c);
        Color3.LerpToRef(c, a.haze, l.haze, c);
        l.mat.emissiveColor = c.clone();
      }
    },
    update(cam) {
      for (const l of layers) {
        // x rides with the camera (a little parallax against the anchor);
        // z: pushed beyond the map's north edge whatever the camera does
        const x = anchorX + (cam.x - anchorX) * l.follow;
        const zCam = cam.z + l.dist;
        const zMin = northZ + l.dist * 0.45; // never inside the map
        const z = Math.max(zMin, zCam * l.follow + (northZ + l.dist) * (1 - l.follow));
        l.mesh.position.set(x, 0, z);
      }
    },
    dispose() {
      for (const l of layers) {
        l.mesh.dispose();
        l.mat.dispose();
      }
      layers.length = 0;
    },
  };
}
