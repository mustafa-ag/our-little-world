// Ground built from WorldData.ground as a painted miniature, not a tile grid:
//  - one continuous vertex grid per grain family (grass / cobble / paved),
//    corners shared so the smooth value-noise vertex tint never steps;
//  - a baked "splat" albedo (canvas, 6-12 px per tile) mapped 1:1 in world UV
//    that paints each surface with noise-warped, wobbly boundaries, heather /
//    moss blotches, macro tint clouds, grass tufts between cobbles and worn
//    edges;
//  - a greyscale hand-painted grain per family via StandardMaterial.detailMap
//    in world-space UV (uv2), so close-ups read as cobbles / grass;
//  - a thin-instanced kerb of small stones along the painted grass<->path edge.
// Plus raised sidewalks (CURB_H) with real curbs, a hand-painted sett road with
// wheel tracks / gutter grime (macro map), gutters, drains and manholes.
// Purely visual: collision lives in the grid collider.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { WorldData } from "../../game/worldgen";
import { Materials, PALETTE } from "./materials";
import type { Lighting } from "./lighting";
import { CURB_H } from "../world/scale";
import { SCOTLAND_PROFILE, type WorldArtProfile } from "../world/artProfile";

/** Paint family: what the splat paints. */
type Paint = "grass" | "heather" | "moss" | "sand" | "cobble" | "path" | "pavement" | "road" | "water";
/** Grain family: which ground mesh / detail texture a tile belongs to. */
type Grain = "grass" | "sand" | "cobble" | "paved" | "road" | "water";

const TILE_PAINT: Record<string, Paint> = {
  t_grass: "grass",
  t_grass2: "moss",
  t_lawn: "grass",
  t_golf: "grass",
  t_snow: "heather", // heathery pale patches on the Edinburgh maps
  t_sand: "grass", // "sand" when the art profile has sand (see paintOf)
  t_hedge: "moss",
  t_cobble: "cobble",
  t_plaza_stone: "cobble",
  t_path: "path",
  t_brick_path: "path",
  t_wood: "path",
  t_pavement: "pavement",
  t_paving_light: "pavement",
  t_paving_dark: "pavement",
  t_tile: "pavement",
  t_carpet: "pavement",
  t_road: "road",
  t_asphalt: "road",
  t_road_lane: "road",
  t_crossing: "road",
  t_parking: "road",
  t_water: "water",
};

/** Paint family of a ground texture key under an art profile. */
const paintOf = (tex: string, profile: WorldArtProfile): Paint => (tex === "t_sand" && profile.hasSand ? "sand" : TILE_PAINT[tex] ?? "grass");

const GRAIN_OF: Record<Paint, Grain> = {
  grass: "grass",
  sand: "sand",
  heather: "grass",
  moss: "grass",
  // the street itself (t_path: the Royal Mile & lanes) is cobbled setts; the
  // village squares & sidewalks (t_cobble) read as big sandstone flags, like
  // the reference's pale paved sidewalks either side of a darker road
  cobble: "paved",
  path: "road",
  pavement: "paved",
  road: "road",
  water: "water",
};

/** Sidewalks / squares stand a curb height above the road and the verges. */
const isRaised = (p: Paint) => p === "cobble" || p === "pavement";
const isRoadPaint = (p: Paint) => p === "path" || p === "road";

const isSoft = (p: Paint) => p === "grass" || p === "heather" || p === "moss" || p === "sand";

// ---- colours (linear 0..255 triples), desaturated & warm ----
type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Splat colours for a region (the Scotland profile yields the original Edinburgh values). */
const colours = (profile: WorldArtProfile) => ({
  grass: hex(profile.groundColor),
  grassLight: hex(profile.groundTones.light),
  olive: hex(profile.groundTones.olive),
  mossDark: hex(profile.groundTones.dark),
  sand: hex(profile.sandColor),
  sandLight: lighten(hex(profile.sandColor), 0.12),
  sandDark: lighten(hex(profile.sandColor), -0.1),
  heather: hex("#a98f9f"),
  heatherDeep: hex("#8a7188"),
  heatherBloom: hex("#c49ab8"),
  earth: hex("#a89878"),
  cobble: hex("#c2b49c"),
  cobbleDark: hex("#a49682"),
  stoneWarm: hex(PALETTE.stoneWarm),
  path: hex(profile.pathColor),
  kerb: hex("#e4d8bf"),
  pavement: hex(profile.sidewalkColor),
  road: hex(profile.roadColor),
  water: hex("#86aec0"),
  warmCloud: hex("#e8c890"),
  coolCloud: hex("#8a9aa0"),
});
/** Mix toward white (t>0) or black (t<0). */
function lighten(c: RGB, t: number): RGB {
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  return [c[0] + (to - c[0]) * k, c[1] + (to - c[1]) * k, c[2] + (to - c[2]) * k];
}

// ---- noise ----
function hash(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519 | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise in [0,1]. */
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Two-octave noise in [-1,1]. */
function fbm2(x: number, y: number, s: number) {
  return (vnoise(x, y, s) * 0.68 + vnoise(x * 2.3 + 17.1, y * 2.3 + 5.7, s + 1) * 0.32) * 2 - 1;
}

const WARP = 0.6; // tiles
const WARP_F = 0.32; // base warp frequency (per tile)

function lerp3(out: RGB, a: RGB, b: RGB, t: number): RGB {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function mixInto(c: RGB, b: RGB, t: number) {
  if (t <= 0) return;
  if (t > 1) t = 1;
  c[0] += (b[0] - c[0]) * t;
  c[1] += (b[1] - c[1]) * t;
  c[2] += (b[2] - c[2]) * t;
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface Environment {
  meshes: Mesh[];
  /** Height of the ground surface at a tile (for placing props flush). */
  heightAt(tx: number, ty: number): number;
  /** Whether a tile is carriageway (road / street setts, not a raised sidewalk). */
  isRoad(tx: number, ty: number): boolean;
  dispose(): void;
}

export function buildEnvironment(scene: Scene, mats: Materials, lighting: Lighting | null, world: WorldData, profile: WorldArtProfile = SCOTLAND_PROFILE): Environment {
  const C = colours(profile);
  const meshes: Mesh[] = [];
  const ownMats: StandardMaterial[] = [];
  const ownTex: Texture[] = [];
  const W = world.w;
  const H = world.h;
  const isMobile = typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 720);

  // ---- tile classification ----
  const paint: Paint[] = new Array(W * H);
  const heights: number[][] = [];
  for (let ty = 0; ty < H; ty++) {
    heights[ty] = [];
    for (let tx = 0; tx < W; tx++) {
      const p = paintOf(world.ground[ty][tx], profile);
      paint[ty * W + tx] = p;
      heights[ty][tx] = p === "water" ? -0.12 : isRaised(p) ? CURB_H : 0;
    }
  }
  const paintAt = (tx: number, ty: number): Paint => {
    tx = tx < 0 ? 0 : tx >= W ? W - 1 : tx;
    ty = ty < 0 ? 0 : ty >= H ? H - 1 : ty;
    return paint[ty * W + tx];
  };
  const indicator = (pred: (p: Paint) => boolean) => Uint8Array.from(paint, (p) => (pred(p) ? 1 : 0));
  const softI = indicator(isSoft);
  const heatherI = indicator((p) => p === "heather");
  const mossI = indicator((p) => p === "moss");
  const grassI = indicator((p) => p === "grass" || p === "heather" || p === "moss");
  const at = (arr: Uint8Array, tx: number, ty: number) => arr[(ty < 0 ? 0 : ty >= H ? H - 1 : ty) * W + (tx < 0 ? 0 : tx >= W ? W - 1 : tx)];
  /** Bilinear field over tile centres of an indicator. */
  const field = (x: number, y: number, arr: Uint8Array) => {
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const ax = fx - x0;
    const ay = fy - y0;
    const a = at(arr, x0, y0);
    const b = at(arr, x0 + 1, y0);
    const c = at(arr, x0, y0 + 1);
    const d = at(arr, x0 + 1, y0 + 1);
    return a + (b - a) * ax + (c - a) * ay + (a - b - c + d) * ax * ay;
  };
  /** Warped sample position (tile units; y grows southwards = tile rows). */
  const warp = (x: number, y: number, out: { x: number; y: number }) => {
    out.x = x + WARP * fbm2(x * WARP_F, y * WARP_F, 11);
    out.y = y + WARP * fbm2(x * WARP_F + 31.7, y * WARP_F + 9.2, 23);
    return out;
  };

  // ---- road cross-sections: for each road tile, which way the street runs and
  // where its kerbs are (tile units), for wheel tracks / gutter grime / drains
  const roadX = new Float32Array(W * H * 3); // [horizontal?1:0, start, width]
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (!isRoadPaint(paint[ty * W + tx])) continue;
      const run = (dx: number, dy: number) => {
        let n = 0;
        while (n < 12 && isRoadPaint(paintAt(tx + dx * (n + 1), ty + dy * (n + 1))) && tx + dx * (n + 1) >= 0 && ty + dy * (n + 1) >= 0 && tx + dx * (n + 1) < W && ty + dy * (n + 1) < H) n++;
        return n;
      };
      const n = run(0, -1);
      const so = run(0, 1);
      const e = run(1, 0);
      const w = run(-1, 0);
      const o = (ty * W + tx) * 3;
      if (n + so <= e + w) {
        roadX[o] = 1;
        roadX[o + 1] = ty - n;
        roadX[o + 2] = n + so + 1;
      } else {
        roadX[o] = 0;
        roadX[o + 1] = tx - w;
        roadX[o + 2] = e + w + 1;
      }
    }

  // ---- splat albedo ----
  const ppt = Math.max(4, Math.min(isMobile ? 6 : 10, Math.floor((isMobile ? 672 : 1344) / W), Math.floor((isMobile ? 564 : 1128) / H)));
  const TW = W * ppt;
  const TH = H * ppt;
  const splat = new DynamicTexture("ground:splat", cpuCanvas(TW, TH), scene, true);
  splat.wrapU = Texture.CLAMP_ADDRESSMODE;
  splat.wrapV = Texture.CLAMP_ADDRESSMODE;
  splat.anisotropicFilteringLevel = 8;
  ownTex.push(splat);
  // greyscale macro modulation for the road (detail map on uv1): 128 = neutral
  const roadMacro = new Uint8ClampedArray(TW * TH).fill(128);
  {
    const ctx = splat.getContext() as CanvasRenderingContext2D;
    const img = ctx.createImageData(TW, TH);
    const px = img.data;
    const wp = { x: 0, y: 0 };
    const c: RGB = [0, 0, 0];
    const tmp: RGB = [0, 0, 0];
    // low-frequency fields sampled on a quarter-tile lattice, then bilinearly
    // interpolated per pixel (visually identical, several times faster)
    const LQ = 4;
    const LW = W * LQ + 2;
    const LH = H * LQ + 2;
    const NF = 8;
    const lat = new Float32Array(LW * LH * NF);
    for (let j = 0; j < LH; j++)
      for (let i = 0; i < LW; i++) {
        const x = i / LQ;
        const y = j / LQ;
        const o = (j * LW + i) * NF;
        lat[o] = WARP * fbm2(x * WARP_F, y * WARP_F, 11);
        lat[o + 1] = WARP * fbm2(x * WARP_F + 31.7, y * WARP_F + 9.2, 23);
        lat[o + 2] = vnoise(x * 0.07, y * 0.07, 3);
        lat[o + 3] = vnoise(x * 0.35, y * 0.35, 5);
        lat[o + 4] = vnoise(x * 0.16 + 4.1, y * 0.16, 9);
        lat[o + 5] = vnoise(x * 0.22, y * 0.22 + 7.3, 13);
        lat[o + 6] = vnoise(x * 0.9, y * 0.9, 19) - 0.5;
        lat[o + 7] = vnoise(x * 0.8, y * 0.8, 53);
      }
    const F = new Float32Array(NF);
    const sample = (x: number, y: number) => {
      const lx = x * LQ;
      const ly = y * LQ;
      const i = Math.floor(lx);
      const j = Math.floor(ly);
      const ax = lx - i;
      const ay = ly - j;
      const o00 = (j * LW + i) * NF;
      const o10 = o00 + NF;
      const o01 = o00 + LW * NF;
      const o11 = o01 + NF;
      const w00 = (1 - ax) * (1 - ay);
      const w10 = ax * (1 - ay);
      const w01 = (1 - ax) * ay;
      const w11 = ax * ay;
      for (let k = 0; k < NF; k++) F[k] = lat[o00 + k] * w00 + lat[o10 + k] * w10 + lat[o01 + k] * w01 + lat[o11 + k] * w11;
    };
    for (let py = 0; py < TH; py++) {
      const y = (py + 0.5) / ppt;
      for (let pxi = 0; pxi < TW; pxi++) {
        const x = (pxi + 0.5) / ppt;
        sample(x, y);
        wp.x = x + F[0];
        wp.y = y + F[1];
        // the warp only moves the soft<->hard edge; hard<->hard edges (kerb
        // lines between cobbles and pavement) stay straight like the grain
        let fam = paintAt(Math.floor(wp.x), Math.floor(wp.y));
        const soft = isSoft(fam);
        const tx0 = Math.floor(x);
        const ty0 = Math.floor(y);
        const own = paintAt(tx0, ty0);
        if (!soft && !isSoft(own)) fam = own;
        if (isRoadPaint(own)) {
          const o3 = (ty0 * W + tx0) * 3;
          const across = roadX[o3] ? y : x;
          const along = roadX[o3] ? x : y;
          const width = roadX[o3 + 2];
          const d0 = across - roadX[o3 + 1];
          const dEdge = Math.min(d0, width - d0);
          const u = d0 / width;
          let v = 1 + (F[2] - 0.5) * 0.14 + (F[3] - 0.5) * 0.1;
          if (width >= 2.5) {
            // wheel-worn tracks: two soft polished bands along the street
            for (const cu of [0.31, 0.69]) {
              const dd = Math.abs(u - cu) * width;
              if (dd < 0.3) v += (1 - smooth(0.06, 0.3, dd)) * (0.1 + 0.05 * vnoise(along * 0.7, cu * 9, 91));
            }
            // a damp darker crown line down the middle, broken up
            if (Math.abs(u - 0.5) * width < 0.2) v -= 0.05 * smooth(0.45, 0.75, vnoise(along * 0.5, 3, 93));
          }
          // grime collects toward the gutters
          if (dEdge < 0.7) v -= (1 - dEdge / 0.7) * 0.13;
          // worn / patched areas
          if (F[7] > 0.66) v += (F[7] - 0.66) * 0.35;
          if (vnoise(x * 0.45 + 7, y * 0.45, 97) > 0.72) v -= 0.06;
          roadMacro[py * TW + pxi] = 128 * v;
        }
        // macro tint clouds (~14 tile blobs) + mid variation
        const macro = F[2];
        const mid = F[3];
        const fine = hash(pxi, py, 7) - 0.5;
        // grass-ness of the neighbourhood (0..1, 0.5 at the painted edge)
        const g = field(wp.x, wp.y, softI);
        if (fam === "sand") {
          // sand: warm pale base, soft dune tone drift, wind ripples and grit
          lerp3(c, C.sand, C.sandLight, smooth(0.3, 0.75, mid));
          mixInto(c, C.sandDark, smooth(0.6, 0.9, F[4]) * 0.4);
          const ripple = Math.sin(x * 2.4 + y * 0.9 + F[6] * 3) * 0.5 + 0.5;
          c[0] += (ripple - 0.5) * 7;
          c[1] += (ripple - 0.5) * 6;
          c[2] += (ripple - 0.5) * 4;
          if (hash(pxi, py, 39) > 0.93) mixInto(c, C.sandDark, 0.35);
          // a thin fringe of lawn where the sand meets grass
          const gr = field(wp.x, wp.y, grassI);
          if (gr > 0.35) mixInto(c, C.grass, smooth(0.35, 0.7, gr) * 0.5);
        } else if (soft) {
          lerp3(c, C.grass, C.grassLight, smooth(0.3, 0.75, mid));
          mixInto(c, C.olive, smooth(0.55, 0.85, F[4]) * 0.7);
          mixInto(c, C.mossDark, smooth(0.62, 0.9, F[5]) * 0.45);
          // brushy fine strokes: elongated noise
          const stroke = vnoise(x * 1.6, y * 5.5, 17) - 0.5;
          c[0] += stroke * 10;
          c[1] += stroke * 12;
          c[2] += stroke * 6;
          // soft heather / moss blotches
          const hw = F[6];
          const h = smooth(0.3, 0.7, field(wp.x + hw * 0.8, wp.y - hw * 0.8, heatherI) + hw * 0.5);
          if (h > 0) {
            lerp3(tmp, C.heather, C.heatherDeep, smooth(0.4, 0.8, vnoise(x * 1.3, y * 1.3, 29)));
            // heather is speckled with grass
            mixInto(c, tmp, h * (0.4 + 0.4 * vnoise(x * 2.7, y * 2.7, 31)));
            // tiny flower speckles so it reads as heather, not a stain
            if (hash(pxi >> 1, py >> 1, 33) > 0.9 - h * 0.12) mixInto(c, C.heatherBloom, h * 0.7);
          }
          const m = smooth(0.3, 0.7, field(wp.x + hw, wp.y + hw, mossI) + hw * 0.5);
          if (m > 0) mixInto(c, C.mossDark, m * 0.6);
          // worn earthy rim along paths
          if (g < 0.9) mixInto(c, C.earth, (0.9 - g) * 0.9 * (0.4 + 0.6 * vnoise(x * 2.2, y * 2.2, 37)));
        } else {
          switch (fam) {
            case "cobble":
              lerp3(c, C.cobble, C.stoneWarm, smooth(0.3, 0.7, mid));
              mixInto(c, C.cobbleDark, smooth(0.6, 0.95, vnoise(x * 0.5 + 3, y * 0.5, 41)) * 0.5);
              break;
            case "path":
              lerp3(c, C.path, C.stoneWarm, smooth(0.35, 0.8, mid) * 0.6);
              break;
            case "pavement":
              lerp3(c, C.pavement, C.stoneWarm, smooth(0.35, 0.8, mid) * 0.5);
              break;
            case "road":
              lerp3(c, C.road, C.cobbleDark, smooth(0.35, 0.8, mid) * 0.5);
              break;
            default:
              lerp3(c, C.water, C.water, 0);
              c[2] += (mid - 0.5) * 16;
          }
          // a soft darker joint where two hard surfaces meet (kerb line)
          if (fam === own) {
            const e = 1.3 / ppt;
            const fx = x - tx0;
            const fy = y - ty0;
            const differs = (nx: number, ny: number) => {
              const q = paintAt(nx, ny);
              return q !== own && !isSoft(q) && q !== "water";
            };
            if ((fx < e && differs(tx0 - 1, ty0)) || (fx > 1 - e && differs(tx0 + 1, ty0)) || (fy < e && differs(tx0, ty0 - 1)) || (fy > 1 - e && differs(tx0, ty0 + 1)))
              mixInto(c, C.cobbleDark, 0.55);

          }
          if (fam !== "water" && g > 0.02) {
            // grass tufts / moss creeping between stones near the edge
            const tuft = vnoise(x * 3.1, y * 3.1, 43) + (hash(pxi >> 1, py >> 1, 47) - 0.5) * 0.25;
            if (tuft > 0.78 - g * 0.55) mixInto(c, tuft > 0.9 - g * 0.3 ? C.olive : C.grass, 0.55 + g * 0.3);
            // edge wear: stones darken & warm where they meet soil
            mixInto(c, C.earth, g * 0.45);
          }
          // scattered worn patches in the middle of the street
          const wear = F[7];
          if (wear > 0.7) mixInto(c, C.pavement, (wear - 0.7) * 1.2);
        }
        // macro cloud tint: warm sunny patches vs cooler damp ones
        if (macro > 0.5) mixInto(c, C.warmCloud, (macro - 0.5) * 0.28);
        else mixInto(c, C.coolCloud, (0.5 - macro) * 0.22);
        const shade = 1 + (mid - 0.5) * 0.06 + fine * 0.035;
        const o = (py * TW + pxi) * 4;
        px[o] = c[0] * shade;
        px[o + 1] = c[1] * shade;
        px[o + 2] = c[2] * shade;
        px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    splat.update(true);
  }
  // the road's macro map as a detail texture (R = albedo multiplier / 2; G/A = flat normal)
  const macroTex = new DynamicTexture("ground:roadMacro", cpuCanvas(TW, TH), scene, true);
  macroTex.wrapU = Texture.CLAMP_ADDRESSMODE;
  macroTex.wrapV = Texture.CLAMP_ADDRESSMODE;
  ownTex.push(macroTex);
  {
    const ctx = macroTex.getContext() as CanvasRenderingContext2D;
    const img = ctx.createImageData(TW, TH);
    const d = img.data;
    for (let i = 0; i < TW * TH; i++) {
      d[i * 4] = roadMacro[i];
      d[i * 4 + 1] = 128;
      d[i * 4 + 2] = 128;
      d[i * 4 + 3] = 128;
    }
    ctx.putImageData(img, 0, 0);
    macroTex.hasAlpha = false;
    macroTex.update(true);
  }

  // ---- grain (detail) textures, greyscale around 50% ----
  // (cached per scene: identical for every district)
  let grain = GRAIN_CACHE.get(scene);
  if (!grain || !grain.grass.getScene()) {
    grain = { grass: grainTexture(scene, "grass"), sand: grainTexture(scene, "sand"), cobble: grainTexture(scene, "cobble"), paved: grainTexture(scene, "paving") };
    GRAIN_CACHE.set(scene, grain);
  }
  // tiles per texture repeat, rotation to break axis alignment
  const GRAIN_SETUP: Record<Exclude<Grain, "water" | "road">, { rep: number; ang: number; blend: number }> = {
    grass: { rep: 2.6, ang: 0.47, blend: 0.4 },
    sand: { rep: 3.2, ang: 0.3, blend: 0.22 },
    cobble: { rep: 2.0, ang: 0, blend: 0.26 },
    paved: { rep: 2.2, ang: 0, blend: 0.42 },
  };

  // ---- continuous ground meshes (one per grain family, shared corners) ----
  const groups = new Map<Grain, { map: Map<number, number>; pos: number[]; uv: number[]; uv2: number[]; col: number[]; nor: number[]; idx: number[] }>();
  const corner = (g: { map: Map<number, number>; pos: number[]; uv: number[]; uv2: number[]; col: number[]; nor: number[] }, cx: number, cy: number, y: number) => {
    const key = cy * (W + 1) + cx;
    let i = g.map.get(key);
    if (i !== undefined) return i;
    i = g.pos.length / 3;
    g.map.set(key, i);
    g.pos.push(cx, y, -cy);
    g.uv.push(cx / W, 1 - cy / H);
    g.uv2.push(cx, -cy);
    // smooth corner tint (no per-tile jitter): brightness + slight warm/cool
    const n = vnoise(cx * 0.21, cy * 0.21, 61);
    const t = vnoise(cx * 0.09 + 5, cy * 0.09, 67) - 0.5;
    const v = 0.95 + n * 0.08;
    g.col.push(v * (1 + t * 0.04), v, v * (1 - t * 0.05), 1);
    g.nor.push(0, 1, 0);
    return i;
  };
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const gr = GRAIN_OF[paint[ty * W + tx]];
      let g = groups.get(gr);
      if (!g) groups.set(gr, (g = { map: new Map(), pos: [], uv: [], uv2: [], col: [], nor: [], idx: [] }));
      const y = heights[ty][tx];
      // tile spans X [tx,tx+1], Z [-(ty+1), -ty]
      const a = corner(g, tx, ty + 1, y);
      const b = corner(g, tx + 1, ty + 1, y);
      const c = corner(g, tx + 1, ty, y);
      const d = corner(g, tx, ty, y);
      g.idx.push(a, b, c, a, c, d);
      // skirts: close the step down to a lower neighbour (raised sidewalks)
      const hn = (nx: number, ny: number) => (nx < 0 || ny < 0 || nx >= W || ny >= H ? y : heights[ny][nx]);
      const skirt = (x0: number, z0: number, x1: number, z1: number, lo: number, nx: number, nz: number) => {
        const i = g.pos.length / 3;
        g.pos.push(x0, y, z0, x1, y, z1, x1, lo, z1, x0, lo, z0);
        for (const [px, pz] of [[x0, z0], [x1, z1], [x1, z1], [x0, z0]]) {
          g.uv.push(px / W, 1 + pz / H);
          g.uv2.push(px, pz);
          g.col.push(0.8, 0.78, 0.74, 1);
          g.nor.push(nx, 0, nz);
        }
        // winding: Babylon's left-handed front face = clockwise seen from the normal side
        const flip = nx * (z1 - z0) - nz * (x1 - x0) > 0;
        if (flip) g.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
        else g.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      };
      if (y > -0.01) {
        const lo = (v: number) => (v < y - 0.005 ? v : null);
        let l = lo(hn(tx, ty - 1));
        if (l !== null) skirt(tx, -ty, tx + 1, -ty, l, 0, 1);
        l = lo(hn(tx, ty + 1));
        if (l !== null) skirt(tx, -(ty + 1), tx + 1, -(ty + 1), l, 0, -1);
        l = lo(hn(tx - 1, ty));
        if (l !== null) skirt(tx, -ty, tx, -(ty + 1), l, -1, 0);
        l = lo(hn(tx + 1, ty));
        if (l !== null) skirt(tx + 1, -ty, tx + 1, -(ty + 1), l, 1, 0);
      }
    }

  for (const [gr, g] of groups) {
    const m = new Mesh(`ground:${gr}`, scene);
    const vd = new VertexData();
    vd.positions = g.pos;
    vd.indices = g.idx;
    vd.uvs = g.uv;
    vd.uvs2 = g.uv2;
    vd.colors = g.col;
    vd.normals = g.nor;
    vd.applyToMesh(m);
    if (gr === "water") {
      m.material = mats.textured("noise", PALETTE.water, 1);
    } else if (gr === "road") {
      // hand-painted setts in world space (uv2, 2 tiles per repeat, slightly
      // rotated so courses never line up with the tile grid), modulated by the
      // baked macro map (uv1): wheel tracks, gutter grime, worn patches
      const mat = new StandardMaterial("ground:road", scene);
      const setts = profile.roadSurface === "setts" ? settTexture(scene) : asphaltTexture(scene, profile.roadColor);
      setts.coordinatesIndex = 1;
      setts.uScale = 0.5;
      setts.vScale = 0.5;
      setts.wAng = 0.012;
      mat.diffuseTexture = setts;
      mat.specularColor = Color3.Black();
      macroTex.coordinatesIndex = 0;
      mat.detailMap.texture = macroTex;
      mat.detailMap.diffuseBlendLevel = 1;
      mat.detailMap.bumpLevel = 0;
      mat.detailMap.isEnabled = true;
      m.material = mat;
      ownMats.push(mat);
    } else {
      const mat = new StandardMaterial(`ground:${gr}`, scene);
      mat.diffuseTexture = splat;
      mat.specularColor = Color3.Black();
      const setup = GRAIN_SETUP[gr as Exclude<Grain, "water" | "road">];
      const dt = grain[gr as Exclude<Grain, "water" | "road">];
      dt.coordinatesIndex = 1;
      dt.uScale = 1 / setup.rep;
      dt.vScale = 1 / setup.rep;
      dt.wAng = setup.ang;
      mat.detailMap.texture = dt;
      mat.detailMap.diffuseBlendLevel = setup.blend;
      mat.detailMap.bumpLevel = 0;
      mat.detailMap.isEnabled = true;
      m.material = mat;
      ownMats.push(mat);
    }
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    m.alwaysSelectAsActiveMesh = true;
    meshes.push(m);
  }
  for (const mat of ownMats) mat.freeze();

  // ---- kerb stones along the painted grass <-> hard edge ----
  const kerb = buildKerb(scene, W, H, paintAt, warp);
  if (kerb) {
    meshes.push(kerb);
    ownMats.push(kerb.material as StandardMaterial);
  }

  // ---- curbs, gutters, drain grates and manhole covers along the road edges ----
  for (const sm of buildStreetDetails(scene, W, H, paintAt, roadX, (tx, ty) => heights[ty]?.[tx] ?? 0)) {
    meshes.push(sm);
    ownMats.push(sm.material as StandardMaterial);
  }

  // an endless meadow under everything so the horizon never shows the void
  const under = CreateGround("ground:under", { width: 600, height: 600, subdivisions: 1 }, scene);
  under.position.set(W / 2, -0.03, -H / 2);
  under.material = mats.textured(profile.hasSand ? "noise" : "grass", profile.underColor, 0.5);
  under.receiveShadows = true;
  under.isPickable = false;
  under.freezeWorldMatrix();
  meshes.push(under);

  // (distant hills, Arthur's-Seat crag and the castle skyline live in
  // rendering/backdrop.ts — the old sphere hills / far keep here duplicated them)

  void lighting;
  return {
    meshes,
    heightAt: (tx, ty) => heights[ty]?.[tx] ?? 0,
    isRoad: (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && isRoadPaint(paint[ty * W + tx]),
    dispose() {
      for (const m of meshes) m.dispose();
      for (const m of ownMats) m.dispose();
      for (const t of ownTex) t.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Kerb: one low-poly pebble mesh, thin-instanced (single draw call).

function buildKerb(
  scene: Scene,
  W: number,
  H: number,
  paintAt: (tx: number, ty: number) => Paint,
  warp: (x: number, y: number, out: { x: number; y: number }) => { x: number; y: number },
): Mesh | null {
  const soft = (x: number, y: number, wp: { x: number; y: number }) => {
    warp(x, y, wp);
    const p = paintAt(Math.floor(wp.x), Math.floor(wp.y));
    return p === "water" ? null : isSoft(p);
  };
  const mats: number[] = [];
  const cols: number[] = [];
  const wp = { x: 0, y: 0 };
  const mtx = new Matrix();
  const q = new Quaternion();
  const sc = new Vector3();
  const tr = new Vector3();
  const stoneCol = hex(PALETTE.stoneWarm);
  const place = (x: number, y: number, along: number, k: number) => {
    if (hash(Math.floor(x * 7), Math.floor(y * 7), 71 + k) < 0.3) return; // ~30% gaps
    const r1 = hash(Math.floor(x * 13), Math.floor(y * 13), 73);
    const r2 = hash(Math.floor(x * 17), Math.floor(y * 17), 79);
    const r3 = hash(Math.floor(x * 19), Math.floor(y * 19), 83);
    const s = 0.75 + r1 * 0.55;
    sc.set(s * (0.9 + r2 * 0.4), s * (0.7 + r3 * 0.6), s);
    Quaternion.RotationYawPitchRollToRef(along + (r2 - 0.5) * 0.7, (r3 - 0.5) * 0.12, (r1 - 0.5) * 0.12, q);
    tr.set(x + (r3 - 0.5) * 0.06, 0, -y + (r1 - 0.5) * 0.06);
    Matrix.ComposeToRef(sc, q, tr, mtx);
    for (let i = 0; i < 16; i++) mats.push(mtx.m[i]);
    const v = 0.82 + r2 * 0.22;
    const mossy = r3 > 0.8 ? 0.85 : 1;
    cols.push((stoneCol[0] / 255) * v * mossy, (stoneCol[1] / 255) * v, (stoneCol[2] / 255) * v * mossy, 1);
  };
  /** March across a tile edge along its normal to find the painted boundary. */
  const edge = (x: number, y: number, nx: number, ny: number, along: number, k: number) => {
    let prev = soft(x - nx * 0.9, y - ny * 0.9, wp);
    for (let t = -0.85; t <= 0.9; t += 0.05) {
      const cur = soft(x + nx * t, y + ny * t, wp);
      if (cur !== null && prev !== null && cur !== prev) {
        place(x + nx * (t - 0.025), y + ny * (t - 0.025), along, k);
        return;
      }
      prev = cur;
    }
  };
  const SAMPLES = 3;
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const p = paintAt(tx, ty);
      if (p === "water") continue;
      const s = isSoft(p);
      // east neighbour edge (vertical line x = tx+1)
      if (tx + 1 < W) {
        const q2 = paintAt(tx + 1, ty);
        if (q2 !== "water" && isSoft(q2) !== s)
          for (let i = 0; i < SAMPLES; i++) edge(tx + 1, ty + (i + 0.5) / SAMPLES, 1, 0, Math.PI / 2, i);
      }
      // south neighbour edge (horizontal line y = ty+1)
      if (ty + 1 < H) {
        const q2 = paintAt(tx, ty + 1);
        if (q2 !== "water" && isSoft(q2) !== s)
          for (let i = 0; i < SAMPLES; i++) edge(tx + (i + 0.5) / SAMPLES, ty + 1, 0, 1, 0, i + 5);
      }
    }
  const n = mats.length / 16;
  if (!n) return null;

  const stone = CreateBox("kerb", { width: 0.2, height: 0.09, depth: 0.14 }, scene);
  // pinch the top corners inward and round the silhouette a little
  const pos = stone.getVerticesData("position")!;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] > 0) {
      pos[i] *= 0.72;
      pos[i + 2] *= 0.7;
    } else pos[i + 1] = -0.01;
    pos[i + 1] += 0.04;
  }
  stone.updateVerticesData("position", pos);
  stone.convertToFlatShadedMesh();
  const mat = new StandardMaterial("kerb", scene);
  mat.diffuseColor = Color3.White();
  mat.specularColor = Color3.Black();
  mat.freeze();
  stone.material = mat;
  stone.thinInstanceSetBuffer("matrix", new Float32Array(mats), 16, true);
  stone.thinInstanceSetBuffer("color", new Float32Array(cols), 4, true);
  stone.receiveShadows = true;
  stone.isPickable = false;
  stone.alwaysSelectAsActiveMesh = true;
  stone.freezeWorldMatrix();
  return stone;
}

// ---------------------------------------------------------------------------
// Greyscale hand-painted grain for the detail map (red channel, 128 = neutral).

let gseed = 99;
function grnd() {
  gseed = (Math.imul(gseed, 1664525) + 1013904223) >>> 0;
  return gseed / 4294967296;
}
function grey(v: number, a = 1) {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${c},${c},${c},${a})`;
}

const GRAIN_CACHE = new WeakMap<Scene, { grass: DynamicTexture; sand: DynamicTexture; cobble: DynamicTexture; paved: DynamicTexture }>();

/** A CPU-backed 2D canvas (cheap getImageData / putImageData). */
function cpuCanvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  cv.getContext("2d", { willReadFrequently: true });
  return cv;
}

function grainTexture(scene: Scene, kind: "grass" | "sand" | "cobble" | "paving"): DynamicTexture {
  const s = 256;
  const t = new DynamicTexture(`ground:grain:${kind}`, cpuCanvas(s, s), scene, true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  const ctx = t.getContext() as CanvasRenderingContext2D;
  gseed = kind === "grass" ? 5 : kind === "cobble" ? 17 : kind === "sand" ? 41 : 29;
  // draw every shape at the 9 wrapped offsets so the tile is seamless
  const wrapped = (x: number, y: number, r: number, fn: (x: number, y: number) => void) => {
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const X = x + ox * s;
        const Y = y + oy * s;
        if (X + r < 0 || X - r > s || Y + r < 0 || Y - r > s) continue;
        fn(X, Y);
      }
  };
  if (kind === "grass") {
    ctx.fillStyle = grey(128);
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = grnd() * s;
      const y = grnd() * s;
      const r = 12 + grnd() * 26;
      const v = 128 + (grnd() - 0.5) * 22;
      const rot = grnd() * Math.PI;
      wrapped(x, y, r, (X, Y) => {
        ctx.fillStyle = grey(v, 0.5);
        ctx.beginPath();
        ctx.ellipse(X, Y, r, r * 0.6, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // brush-stroke blades
    ctx.lineCap = "round";
    for (let i = 0; i < 900; i++) {
      const x = grnd() * s;
      const y = grnd() * s;
      const light = grnd() > 0.45;
      const v = light ? 150 + grnd() * 30 : 92 + grnd() * 20;
      const len = 4 + grnd() * 7;
      const dx = (grnd() - 0.5) * 5;
      const lw = 1.2 + grnd() * 1.4;
      wrapped(x, y, len + 4, (X, Y) => {
        ctx.strokeStyle = grey(v, 0.7);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.quadraticCurveTo(X + dx * 0.3, Y - len * 0.6, X + dx, Y - len);
        ctx.stroke();
      });
    }
  } else if (kind === "sand") {
    // fine grit + soft wind ripples
    ctx.fillStyle = grey(128);
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      const y = (i / 18) * s + grnd() * 4;
      ctx.strokeStyle = grey(grnd() > 0.5 ? 140 : 116, 0.45);
      ctx.lineWidth = 2 + grnd() * 2;
      ctx.beginPath();
      for (let x = 0; x <= s; x += 16) ctx.lineTo(x, y + Math.sin((x / s) * Math.PI * 4 + i) * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 2200; i++) {
      const v = 128 + (grnd() - 0.5) * 60;
      ctx.fillStyle = grey(v, 0.5);
      ctx.fillRect(grnd() * s, grnd() * s, 1.2, 1.2);
    }
  } else if (kind === "cobble") {
    // soft mortar, squarish worn setts in offset rows: low contrast so the
    // street reads as a painted surface, not polka dots
    ctx.fillStyle = grey(104);
    ctx.fillRect(0, 0, s, s);
    const rows = 10;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * rh * 0.5 + (grnd() - 0.5) * 3;
      const start = x;
      while (x < start + s - rh * 0.6) {
        const w = rh * (0.9 + grnd() * 0.5);
        const cx = x + w / 2;
        const cy = r * rh + rh / 2 + (grnd() - 0.5) * 1.5;
        const v = 132 + (grnd() - 0.5) * 22;
        const hw = w / 2 - 1.4;
        const hh = rh / 2 - 1.5;
        wrapped(cx, cy, w, (X, Y) => {
          ctx.fillStyle = grey(v);
          ctx.beginPath();
          ctx.roundRect(X - hw, Y - hh, hw * 2, hh * 2, Math.min(hw, hh) * 0.55);
          ctx.fill();
          // a gentle painted highlight on the upper edge of each stone
          ctx.fillStyle = grey(v + 12, 0.45);
          ctx.beginPath();
          ctx.roundRect(X - hw * 0.8, Y - hh * 0.9, hw * 1.6, hh * 0.8, Math.min(hw, hh) * 0.5);
          ctx.fill();
        });
        x += w;
      }
    }
  } else {
    // irregular worn flagstones: rows of varying height, stones of varying
    // width, soft joints (scaled so rows and stones wrap seamlessly)
    ctx.fillStyle = grey(106);
    ctx.fillRect(0, 0, s, s);
    const hs: number[] = [];
    for (let i = 0; i < 6; i++) hs.push(0.7 + grnd() * 0.6);
    const hsum = hs.reduce((q, v) => q + v, 0);
    let y = 0;
    for (const hr of hs) {
      const rh = (hr / hsum) * s;
      const ws: number[] = [];
      for (let i = 0; i < 5; i++) ws.push(0.6 + grnd() * 0.9);
      const wsum = ws.reduce((q, v) => q + v, 0);
      let x = grnd() * s;
      for (const wr of ws) {
        const w = (wr / wsum) * s;
        // irregular flags: tone drift, the odd darker stone, a lit edge
        const v = 134 + (grnd() - 0.5) * 26 - (grnd() > 0.86 ? 22 : 0);
        const cx = x + w / 2;
        const cy = y + rh / 2;
        const jx = (grnd() - 0.5) * 2;
        const jy = (grnd() - 0.5) * 2;
        wrapped(cx, cy, w, (X, Y) => {
          ctx.fillStyle = grey(v);
          ctx.beginPath();
          ctx.roundRect(X - w / 2 + 1.4 + jx, Y - rh / 2 + 1.4 + jy, w - 2.8, rh - 2.8, 6);
          ctx.fill();
          ctx.fillStyle = grey(v + 14, 0.5);
          ctx.fillRect(X - w / 2 + 4 + jx, Y - rh / 2 + 3 + jy, w - 8, 2.5);
          ctx.fillStyle = grey(v - 20, 0.45);
          ctx.fillRect(X - w / 2 + 3 + jx, Y + rh / 2 - 4.5 + jy, w - 6, 2.5);
        });
        x += w;
      }
      y += rh;
    }
    for (let i = 0; i < 120; i++) {
      const x = grnd() * s;
      const y = grnd() * s;
      const r = 3 + grnd() * 10;
      const v = 128 + (grnd() - 0.5) * 30;
      wrapped(x, y, r, (X, Y) => {
        ctx.fillStyle = grey(v, 0.25);
        ctx.beginPath();
        ctx.arc(X, Y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  // detail map channels: R = albedo grain, G/A = normal Y/X (flat = 0.5),
  // B = roughness (unused). An opaque alpha would decode to a NaN normal.
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 1] = 128;
    d[i + 2] = 128;
    d[i + 3] = 128;
  }
  ctx.putImageData(img, 0, 0);
  t.hasAlpha = false;
  t.update(true);
  return t;
}

// ---------------------------------------------------------------------------
// Road surface: hand-painted setts (colour, 512 px, seamless) — multi-tone
// courses laid across the street, imperfect alignment, soft worn tops, dark
// joints with occasional moss.

let rseed = 7;
function rrnd() {
  rseed = (Math.imul(rseed, 1664525) + 1013904223) >>> 0;
  return rseed / 4294967296;
}
const SETT_CACHE = new WeakMap<Scene, DynamicTexture>();
const SETT_TONES = ["#77716a", "#6f6a63", "#7d776d", "#67635d", "#746a5f", "#6d6c68", "#837c70", "#625d57", "#796f63", "#716d67"];

function settTexture(scene: Scene): DynamicTexture {
  const cached = SETT_CACHE.get(scene);
  if (cached && cached.getScene()) return cached;
  const s = 512;
  const t = new DynamicTexture("ground:setts", cpuCanvas(s, s), scene, true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  const ctx = t.getContext() as CanvasRenderingContext2D;
  rseed = 7;
  // joints: dark earthy mortar
  ctx.fillStyle = "#4a453e";
  ctx.fillRect(0, 0, s, s);
  const wrapped = (x: number, y: number, r: number, fn: (x: number, y: number) => void) => {
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const X = x + ox * s;
        const Y = y + oy * s;
        if (X + r < 0 || X - r > s || Y + r < 0 || Y - r > s) continue;
        fn(X, Y);
      }
  };
  // courses run along v (across an E-W street); 14 courses per 512 px (2 tiles)
  const courses = 14;
  const cw = s / courses;
  for (let c = 0; c < courses; c++) {
    let y = rrnd() * 30;
    const start = y;
    const x0 = c * cw + (rrnd() - 0.5) * 2;
    while (y < start + s - 20) {
      const len = cw * (1.35 + rrnd() * 0.55);
      const tone = SETT_TONES[Math.floor(rrnd() * SETT_TONES.length)];
      const jx = (rrnd() - 0.5) * 2.5;
      const w = cw - 4 - rrnd() * 2;
      const h = len - 4 - rrnd() * 2;
      const rot = (rrnd() - 0.5) * 0.06;
      const lift = rrnd();
      const moss = rrnd() > 0.9;
      wrapped(x0 + cw / 2 + jx, y + len / 2, len, (X, Y) => {
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(rot);
        // body
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.32);
        ctx.fill();
        // soft worn top (lighter, off-centre) + shaded lower edge
        ctx.fillStyle = `rgba(255,248,235,${0.04 + lift * 0.05})`;
        ctx.beginPath();
        ctx.ellipse(-w * 0.08, -h * 0.1, w * 0.32, h * 0.33, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(20,16,12,0.16)";
        ctx.beginPath();
        ctx.roundRect(-w / 2, h / 2 - h * 0.16, w, h * 0.16, Math.min(w, h) * 0.2);
        ctx.fill();
        if (moss) {
          ctx.fillStyle = "rgba(92,110,58,0.75)";
          ctx.beginPath();
          ctx.ellipse(w / 2 - 1, (rrnd() - 0.5) * h * 0.6, 2.2, h * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      y += len;
    }
  }
  // speckle + a few chips
  for (let i = 0; i < 1400; i++) {
    const x = rrnd() * s;
    const y = rrnd() * s;
    ctx.fillStyle = rrnd() > 0.5 ? "rgba(255,250,240,0.07)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  t.update(true);
  SETT_CACHE.set(scene, t);
  return t;
}

/** Road surface for non-sett regions: painted asphalt (fine aggregate, soft repair patches). */
const ASPHALT_CACHE = new WeakMap<Scene, Map<string, DynamicTexture>>();

function asphaltTexture(scene: Scene, base: string): DynamicTexture {
  let bySc = ASPHALT_CACHE.get(scene);
  if (!bySc) ASPHALT_CACHE.set(scene, (bySc = new Map()));
  const cached = bySc.get(base);
  if (cached && cached.getScene()) return cached;
  const s = 512;
  const t = new DynamicTexture(`ground:asphalt:${base}`, cpuCanvas(s, s), scene, true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  const ctx = t.getContext() as CanvasRenderingContext2D;
  rseed = 11;
  const b = hex(base);
  const tone = (k: number) => `rgb(${Math.round(b[0] * k)},${Math.round(b[1] * k)},${Math.round(b[2] * k)})`;
  ctx.fillStyle = tone(0.78);
  ctx.fillRect(0, 0, s, s);
  // soft tonal patches (repairs, wear)
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = tone(0.7 + rrnd() * 0.18);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(rrnd() * s, rrnd() * s, 20 + rrnd() * 60, 12 + rrnd() * 40, rrnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // aggregate speckle
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = rrnd() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(rrnd() * s, rrnd() * s, 1.5, 1.5);
  }
  t.update(true);
  bySc.set(base, t);
  return t;
}

/** Small painted textures for the street furniture (gutter setts, grate, manhole). */
function smallTex(scene: Scene, name: string, w: number, h: number, paintFn: (ctx: CanvasRenderingContext2D) => void) {
  const t = new DynamicTexture(name, cpuCanvas(w, h), scene, true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 4;
  paintFn(t.getContext() as CanvasRenderingContext2D);
  t.update(true);
  return t;
}

/** Thin-instanced mesh with per-instance colour. */
function instanced(proto: Mesh, mats: number[], cols: number[] | null) {
  proto.thinInstanceSetBuffer("matrix", new Float32Array(mats), 16, true);
  if (cols) proto.thinInstanceSetBuffer("color", new Float32Array(cols), 4, true);
  proto.receiveShadows = true;
  proto.isPickable = false;
  proto.alwaysSelectAsActiveMesh = true;
  proto.freezeWorldMatrix();
  return proto;
}

/**
 * Curbs (real CURB_H geometry, one stone per ~0.5 u, slight size / yaw / tone
 * jitter), a smooth gutter channel on the road side, drain grates every few
 * tiles and the odd manhole cover down the middle. Visual only.
 */
function buildStreetDetails(scene: Scene, W: number, H: number, paintAt: (tx: number, ty: number) => Paint, roadX: Float32Array, heightAt: (tx: number, ty: number) => number): Mesh[] {
  const out: Mesh[] = [];
  const curbM: number[] = [];
  const curbC: number[] = [];
  const gutM: number[] = [];
  const grateM: number[] = [];
  const holeM: number[] = [];
  const m = new Matrix();
  const q = new Quaternion();
  const sc = new Vector3();
  const tr = new Vector3();
  const push = (arr: number[], x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) => {
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, q);
    sc.set(sx, sy, sz);
    tr.set(x, y, z);
    Matrix.ComposeToRef(sc, q, tr, m);
    for (let i = 0; i < 16; i++) arr.push(m.m[i]);
  };
  const granite = hex("#aaa59b");
  // walk every raised tile edge that faces a road tile
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const p = paintAt(tx, ty);
      if (!isRaised(p)) continue;
      const top = heightAt(tx, ty);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !isRoadPaint(paintAt(nx, ny))) continue;
        const horizontalEdge = dy !== 0;
        // edge line in world coords; "out" = toward the road (world +z is north = -dy)
        const ox = dx;
        const oz = -dy;
        const ex = horizontalEdge ? tx : dx > 0 ? tx + 1 : tx;
        const ez = horizontalEdge ? (dy < 0 ? -ty : -(ty + 1)) : -ty;
        const yaw = horizontalEdge ? 0 : Math.PI / 2;
        // stones along the edge
        let t = hash(tx, ty, 301 + dx * 3 + dy) * 0.2;
        let k = 0;
        while (t < 0.995) {
          const len = Math.min(1 - t, 0.44 + hash(tx * 7 + k, ty, 303) * 0.3);
          if (len < 0.12) break;
          const mid = t + len / 2;
          const r1 = hash(tx, ty * 5 + k, 305 + dx);
          const r2 = hash(tx * 3 + k, ty, 307 + dy);
          const along = mid;
          const cx = horizontalEdge ? ex + along : ex + ox * 0;
          const cz = horizontalEdge ? ez : ez - along;
          // stone centre sits 0.07 inside the sidewalk, face 0.015 proud into the road
          const inset = 0.08 - 0.015;
          const px = cx - ox * inset;
          const pz = cz - oz * inset;
          const hgt = top + 0.03 + (r1 - 0.5) * 0.008;
          push(curbM, px, -0.02, pz, yaw + (r2 - 0.5) * 0.02, len - 0.008, hgt, 1);
          const v = 0.86 + r1 * 0.16;
          const warm = 0.97 + r2 * 0.05;
          curbC.push((granite[0] / 255) * v * warm, (granite[1] / 255) * v, (granite[2] / 255) * v * (2 - warm), 1);
          t += len;
          k++;
        }
        // gutter strip on the road side, 1 tile long
        const gx = horizontalEdge ? ex + 0.5 : ex + ox * 0.14;
        const gz = horizontalEdge ? ez + oz * 0.14 : ez - 0.5;
        push(gutM, gx, 0.003, gz, yaw, 1, 1, 1);
        // a drain grate in the gutter every ~5 tiles
        const along = horizontalEdge ? tx : ty;
        if (along % 5 === 2 && hash(tx, ty, 311) > 0.25) push(grateM, horizontalEdge ? ex + 0.5 : ex + ox * 0.15, 0.004, horizontalEdge ? ez + oz * 0.15 : ez - 0.5, yaw, 1, 1, 1);
      }
      void p;
    }
  // manholes on the road centre line, sparse
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (!isRoadPaint(paintAt(tx, ty))) continue;
      const o = (ty * W + tx) * 3;
      const width = roadX[o + 2];
      if (width < 2.5) continue;
      const horiz = roadX[o] === 1;
      const centre = roadX[o + 1] + width / 2;
      const cell = horiz ? ty : tx;
      if (Math.floor(centre) !== cell) continue;
      const along = horiz ? tx : ty;
      if (along % 11 !== 6) continue;
      const off = (hash(tx, ty, 313) - 0.5) * 0.5;
      push(holeM, horiz ? tx + 0.5 : centre + off, 0.004, horiz ? -(centre + off) : -(ty + 0.5), hash(tx, ty, 317) * 6, 1, 1, 1);
    }

  const white = (name: string, tex: Texture | null) => {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    if (tex) mat.diffuseTexture = tex;
    mat.freeze();
    return mat;
  };
  if (curbM.length) {
    // unit-high stone with a softly bevelled top edge; base at y=0
    const stone = CreateBox("curb", { width: 1, height: 1, depth: 0.16 }, scene);
    const pos = stone.getVerticesData("position")!;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] += 0.5;
      if (pos[i + 1] > 0.99) {
        pos[i] *= 0.985;
        pos[i + 2] *= 0.8;
      }
    }
    stone.updateVerticesData("position", pos);
    stone.convertToFlatShadedMesh();
    stone.material = white("curb", null);
    out.push(instanced(stone, curbM, curbC));
  }
  if (gutM.length) {
    const tex = smallTex(scene, "gutterTex", 256, 64, (ctx) => {
      ctx.fillStyle = "#4a4640";
      ctx.fillRect(0, 0, 256, 64);
      rseed = 23;
      for (const [y0, hh] of [[3, 28], [33, 28]]) {
        let x = -rrnd() * 30;
        while (x < 256) {
          const l = 38 + rrnd() * 26;
          const tone = ["#8b857a", "#7f796f", "#958e81", "#77736b"][Math.floor(rrnd() * 4)];
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.roundRect(x + 1.5, y0, l - 3, hh, 6);
          ctx.fill();
          ctx.fillStyle = "rgba(255,250,240,0.1)";
          ctx.fillRect(x + 5, y0 + 4, l - 12, hh * 0.35);
          x += l;
        }
      }
      // a damp streak along the kerb side
      ctx.fillStyle = "rgba(30,28,24,0.28)";
      ctx.fillRect(0, 0, 256, 9);
    });
    const plane = CreateGround("gutter", { width: 1, height: 0.26 }, scene);
    plane.material = white("gutter", tex);
    out.push(instanced(plane, gutM, null));
  }
  if (grateM.length) {
    const tex = smallTex(scene, "grateTex", 64, 32, (ctx) => {
      ctx.fillStyle = "#2e2c2a";
      ctx.fillRect(0, 0, 64, 32);
      ctx.fillStyle = "#57534d";
      ctx.fillRect(2, 2, 60, 28);
      ctx.fillStyle = "#1b1a19";
      for (let i = 0; i < 9; i++) ctx.fillRect(6 + i * 6, 6, 3, 20);
    });
    const g = CreateBox("grate", { width: 0.46, height: 0.012, depth: 0.22 }, scene);
    g.material = white("grate", tex);
    out.push(instanced(g, grateM, null));
  }
  if (holeM.length) {
    const tex = smallTex(scene, "manholeTex", 128, 128, (ctx) => {
      ctx.fillStyle = "#38362f";
      ctx.beginPath();
      ctx.arc(64, 64, 63, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5c5850";
      ctx.beginPath();
      ctx.arc(64, 64, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#403d37";
      ctx.lineWidth = 3;
      for (let r = 12; r < 54; r += 10) {
        ctx.beginPath();
        ctx.arc(64, 64, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let a = 0; a < 8; a++) {
        ctx.beginPath();
        ctx.moveTo(64, 64);
        ctx.lineTo(64 + Math.cos((a * Math.PI) / 4) * 54, 64 + Math.sin((a * Math.PI) / 4) * 54);
        ctx.stroke();
      }
    });
    const d = CreateCylinder("manhole", { diameter: 0.56, height: 0.014, tessellation: 18 }, scene);
    d.material = white("manhole", tex);
    out.push(instanced(d, holeM, null));
  }
  return out;
}
