// Ground built from WorldData.ground: tiles are grouped by surface family
// (grass / cobble / paving / pavement / water) into one merged mesh each, with
// per-tile vertex colour variation and world-space UVs so the small painted
// textures tile seamlessly. Plus a distant backdrop: soft hills and a far
// castle silhouette that the fog blends into the sky.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { WorldData } from "../../game/worldgen";
import { Materials, PALETTE, type TexStyle } from "./materials";
import type { Lighting } from "./lighting";

type Family = "grass" | "cobble" | "paving" | "pavement" | "water" | "road";

interface FamilyDef {
  style: TexStyle;
  hex: string;
  uvScale: number;
  y: number;
}

const FAMILIES: Record<Family, FamilyDef> = {
  grass: { style: "grass", hex: PALETTE.grass, uvScale: 0.5, y: 0 },
  cobble: { style: "cobble", hex: PALETTE.cobble, uvScale: 0.8, y: 0 },
  paving: { style: "paving", hex: PALETTE.paving, uvScale: 0.6, y: 0 },
  pavement: { style: "paving", hex: PALETTE.pavement, uvScale: 0.6, y: 0 },
  road: { style: "noise", hex: "#8d8a86", uvScale: 0.3, y: 0 },
  water: { style: "noise", hex: PALETTE.water, uvScale: 0.3, y: -0.12 },
};

/** Per-tile tint (multiplied with the family texture). */
const TINTS: Record<string, [Family, string]> = {
  t_grass: ["grass", "#ffffff"],
  t_grass2: ["grass", "#f2f7e8"],
  t_lawn: ["grass", "#eaf5df"],
  t_golf: ["grass", "#e0f0d0"],
  t_snow: ["grass", "#d9d2e6"], // heathery pale patches on the Edinburgh maps
  t_sand: ["grass", "#fff0cc"],
  t_hedge: ["grass", "#8faa7a"],
  t_cobble: ["cobble", "#ffffff"],
  t_plaza_stone: ["cobble", "#f4ede0"],
  t_path: ["paving", "#ffffff"],
  t_brick_path: ["paving", "#e6c2a8"],
  t_pavement: ["pavement", "#ffffff"],
  t_paving_light: ["pavement", "#fff8ea"],
  t_paving_dark: ["pavement", "#cfc4b0"],
  t_tile: ["pavement", "#f0e8dc"],
  t_wood: ["paving", "#d9b27a"],
  t_carpet: ["pavement", "#d49a9a"],
  t_road: ["road", "#ffffff"],
  t_asphalt: ["road", "#f0f0f0"],
  t_road_lane: ["road", "#ffffff"],
  t_crossing: ["road", "#fff5e0"],
  t_parking: ["road", "#e8e4de"],
  t_water: ["water", "#ffffff"],
};

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface Environment {
  meshes: Mesh[];
  /** Height of the ground surface at a tile (for placing props flush). */
  heightAt(tx: number, ty: number): number;
  dispose(): void;
}

export function buildEnvironment(scene: Scene, mats: Materials, lighting: Lighting | null, world: WorldData): Environment {
  const meshes: Mesh[] = [];
  const groups = new Map<Family, { pos: number[]; idx: number[]; uv: number[]; col: number[]; nor: number[] }>();
  const heights: number[][] = [];

  for (let ty = 0; ty < world.h; ty++) {
    heights[ty] = [];
    for (let tx = 0; tx < world.w; tx++) {
      const key = world.ground[ty][tx];
      const [fam, tint] = TINTS[key] ?? ["grass", "#ffffff"];
      const fd = FAMILIES[fam];
      heights[ty][tx] = fd.y;
      let g = groups.get(fam);
      if (!g) {
        g = { pos: [], idx: [], uv: [], col: [], nor: [] };
        groups.set(fam, g);
      }
      const [r, gg, b] = hexRgb(tint);
      const v = 1 + (hash(tx, ty, 5) - 0.5) * (fam === "grass" ? 0.16 : 0.1);
      // world-space corners: tile (tx,ty) spans X [tx,tx+1], Z [-(ty+1), -ty]
      const x0 = tx;
      const x1 = tx + 1;
      const z0 = -(ty + 1);
      const z1 = -ty;
      const y = fd.y;
      const base = g.pos.length / 3;
      g.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      const s = fd.uvScale;
      g.uv.push(x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s);
      for (let i = 0; i < 4; i++) {
        g.col.push(r * v, gg * v, b * v, 1);
        g.nor.push(0, 1, 0);
      }
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  for (const [fam, g] of groups) {
    const fd = FAMILIES[fam];
    const m = new Mesh(`ground:${fam}`, scene);
    const vd = new VertexData();
    vd.positions = g.pos;
    vd.indices = g.idx;
    vd.uvs = g.uv;
    vd.colors = g.col;
    vd.normals = g.nor;
    vd.applyToMesh(m);
    m.material = mats.textured(fd.style, fd.hex, 1);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    m.alwaysSelectAsActiveMesh = true;
    meshes.push(m);
  }

  // an endless meadow under everything so the horizon never shows the void
  const under = CreateGround("ground:under", { width: 600, height: 600, subdivisions: 1 }, scene);
  under.position.set(world.w / 2, -0.02, -world.h / 2);
  const underMat = mats.textured("grass", "#7a9e58", 0.5);
  under.material = underMat;
  under.receiveShadows = true;
  under.isPickable = false;
  under.freezeWorldMatrix();
  meshes.push(under);

  // ---- backdrop hills + far castle silhouette ----
  const cx = world.w / 2;
  const cz = -world.h / 2;
  const hillMat = mats.flat("#7d9c7a");
  const hillFar = mats.flat("#8aa7a0");
  const ring = 16;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + 0.3;
    const far = i % 3 === 0;
    const r = (far ? 165 : 130) + hash(i, 1, 9) * 20;
    const size = (far ? 90 : 60) + hash(i, 2, 9) * 40;
    const h = CreateSphere(`hill${i}`, { diameter: size, segments: 6 }, scene);
    h.scaling.set(1.6 + hash(i, 3, 9), 0.35 + hash(i, 4, 9) * 0.25, 1);
    h.position.set(cx + Math.cos(a) * r, -size * 0.12, cz + Math.sin(a) * r);
    h.rotation.y = -a;
    h.material = far ? hillFar : hillMat;
    h.convertToFlatShadedMesh();
    h.isPickable = false;
    h.freezeWorldMatrix();
    meshes.push(h);
  }
  // Arthur's-Seat-ish crag with a small keep to the north-east
  const crag = CreateSphere("crag", { diameter: 80, segments: 5 }, scene);
  crag.scaling.set(1.2, 0.6, 1);
  crag.position.set(cx + 95, -6, cz + 120);
  crag.material = mats.flat("#6f8c6c");
  crag.convertToFlatShadedMesh();
  crag.isPickable = false;
  crag.freezeWorldMatrix();
  meshes.push(crag);
  const keepMat = mats.flat("#7d8590");
  const keep = CreateBox("farKeep", { width: 14, height: 9, depth: 8 }, scene);
  keep.position.set(cx + 95, 20, cz + 120);
  keep.material = keepMat;
  keep.isPickable = false;
  keep.freezeWorldMatrix();
  meshes.push(keep);
  for (const dx of [-8, 8]) {
    const t = CreateCylinder(`farTower${dx}`, { diameter: 5, height: 13, tessellation: 8 }, scene);
    t.position.set(cx + 95 + dx, 22, cz + 118);
    t.material = keepMat;
    t.isPickable = false;
    t.freezeWorldMatrix();
    meshes.push(t);
  }

  void lighting;
  return {
    meshes,
    heightAt: (tx, ty) => heights[ty]?.[tx] ?? 0,
    dispose() {
      for (const m of meshes) m.dispose();
    },
  };
}
