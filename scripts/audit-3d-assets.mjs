#!/usr/bin/env node
// Deterministic GLB inventory for the Babylon performance pass. Reports the
// payload and scene complexity that can be compared between builds without a
// particular GPU/browser. Runtime draw/mesh timing lives in ?perf=1.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const dir = join(process.cwd(), "public", "assets", "models");
const files = (await readdir(dir)).filter((name) => name.endsWith(".glb")).sort();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const rows = [];

const descendants = (node, seen) => {
  if (seen.has(node)) return;
  seen.add(node);
  for (const child of node.listChildren()) descendants(child, seen);
};

for (const file of files) {
  const path = join(dir, file);
  const [info, doc] = await Promise.all([stat(path), io.read(path)]);
  const root = doc.getRoot();
  let primitives = 0;
  let vertices = 0;
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      primitives++;
      const positions = primitive.getAttribute("POSITION")?.getCount() ?? 0;
      const indices = primitive.getIndices()?.getCount() ?? 0;
      vertices += positions;
      triangles += Math.floor((indices || positions) / 3);
    }
  }
  const reachable = new Set();
  for (const scene of root.listScenes()) for (const child of scene.listChildren()) descendants(child, reachable);
  let largestTexture = 0;
  for (const texture of root.listTextures()) {
    const [w = 0, h = 0] = texture.getSize() ?? [];
    largestTexture = Math.max(largestTexture, w, h);
  }
  rows.push({
    file,
    bytes: info.size,
    meshes: root.listMeshes().length,
    primitives,
    vertices,
    triangles,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    largestTexture,
    animations: root.listAnimations().length,
    nodes: root.listNodes().length,
    unusedNodes: root.listNodes().filter((node) => !reachable.has(node)).length,
    extensions: root.listExtensionsUsed().map((extension) => extension.extensionName).join(",") || "none",
  });
}

console.table(rows.map((row) => ({
  GLB: row.file,
  KiB: (row.bytes / 1024).toFixed(1),
  meshes: row.meshes,
  prims: row.primitives,
  vertices: row.vertices,
  triangles: row.triangles,
  materials: row.materials,
  textures: row.textures,
  maxTex: row.largestTexture || "-",
  anims: row.animations,
  nodes: row.nodes,
  unused: row.unusedNodes,
  extensions: row.extensions,
})));

const total = rows.reduce((sum, row) => sum + row.bytes, 0);
const oversized = rows.filter((row) => row.largestTexture > 2048);
const unused = rows.filter((row) => row.unusedNodes > 0);
console.log(`GLBs: ${rows.length} | total: ${(total / 1_048_576).toFixed(2)} MiB | textures >2048px: ${oversized.length} | files with unreachable nodes: ${unused.length}`);
if (oversized.length) console.warn(`Oversized textures: ${oversized.map((row) => row.file).join(", ")}`);
if (unused.length) console.warn(`Unreachable nodes: ${unused.map((row) => `${row.file}(${row.unusedNodes})`).join(", ")}`);
