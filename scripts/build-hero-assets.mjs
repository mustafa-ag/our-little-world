#!/usr/bin/env node
// Builds the hero GLB assets from the code-authored modules in
// src/app3d/assets/hero/ and (when Track C exposes them) the cottage/café
// builders in assets/kit/architecture.ts. Runs a Babylon NullEngine, exports
// each piece with @babylonjs/serializers, then welds/quantizes it with
// glTF-Transform and writes public/assets/models/<key>.glb.
//
//   npm run assets:build            # all
//   npm run assets:build -- tree-pine car   # a subset
//
// The script re-executes itself through tsx so the TypeScript modules can be
// imported directly (no build step).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

if (!process.env.OLW_TSX) {
  const tsx = join(root, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, OLW_TSX: "1" } });
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------- babylon (node)
const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
const { Scene } = await import("@babylonjs/core/scene.js");
const { Mesh } = await import("@babylonjs/core/Meshes/mesh.js");
const { GLTF2Export } = await import("@babylonjs/serializers/glTF/2.0/glTFSerializer.js");
const { NodeIO, PropertyType } = await import("@gltf-transform/core");
const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
const { dedup, prune, quantize, weld } = await import("@gltf-transform/functions");

const engine = new NullEngine({ renderWidth: 8, renderHeight: 8, textureSize: 8, deterministicLockstep: false, lockstepMaxSteps: 1 });
const scene = new Scene(engine);

const { heroCtx } = await import("../src/app3d/assets/hero/slots.ts");
const { HERO_ASSETS } = await import("../src/app3d/assets/hero/index.ts");
const ctx = heroCtx(scene);

// Track C's architecture heroes (optional until they exist)
const extra = {};
try {
  const arch = await import("../src/app3d/assets/kit/architecture.ts");
  if (typeof arch.buildCottageHero === "function") {
    extra["cottage-1s"] = () => arch.buildCottageHero(scene, "1s");
    extra["cottage-2s"] = () => arch.buildCottageHero(scene, "2s");
  } else console.warn("warn: architecture.ts has no buildCottageHero yet – skipping cottage-1s/2s");
  if (typeof arch.buildCafeHero === "function") extra["cafe"] = () => arch.buildCafeHero(scene);
  else console.warn("warn: architecture.ts has no buildCafeHero yet – skipping cafe");
} catch (e) {
  console.warn("warn: could not import architecture.ts:", e.message);
}

const outDir = join(root, "public", "assets", "models");
await mkdir(outDir, { recursive: true });

const only = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const rows = [];

function countTris(node) {
  let tris = 0;
  const meshes = node instanceof Mesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
  for (const m of meshes) if (m instanceof Mesh && m.getTotalIndices()) tris += m.getTotalIndices() / 3;
  return Math.round(tris);
}

for (const [key, entry] of Object.entries(HERO_ASSETS)) {
  if (only.length && !only.includes(key)) continue;
  let build = entry.build;
  if (!build) build = extra[key];
  if (!build) {
    rows.push({ key, tris: "-", kb: "-", note: "skipped (no builder)" });
    continue;
  }
  let node;
  try {
    node = build(ctx);
  } catch (e) {
    rows.push({ key, tris: "-", kb: "-", note: `build failed: ${e.message}` });
    continue;
  }
  const tris = countTris(node);
  const inSet = new Set([node, ...node.getDescendants()]);
  const data = await GLTF2Export.GLBAsync(scene, key, {
    shouldExportNode: (n) => inSet.has(n),
    exportWithoutWaitingForScene: true,
    exportUnusedUVs: true,
    removeNoopRootNodes: true,
  });
  const blob = data.files[`${key}.glb`];
  const raw = new Uint8Array(await blob.arrayBuffer());
  let out = raw;
  let note = "";
  try {
    const doc = await io.readBinary(raw);
    // never dedup materials: the slot placeholders are identical apart from their names
    await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeTexcoord: 12 }), prune());
    out = await io.writeBinary(doc);
  } catch (e) {
    note = `unoptimised (${e.message})`;
  }
  await writeFile(join(outDir, `${key}.glb`), out);
  rows.push({ key, tris, kb: (out.length / 1024).toFixed(1), raw: (raw.length / 1024).toFixed(1), note });
  node.dispose(false, true);
}

// size table
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("key", 14)} ${pad("tris", 6)} ${pad("KB", 7)} ${pad("raw KB", 7)} note`);
for (const r of rows) console.log(`${pad(r.key, 14)} ${pad(r.tris, 6)} ${pad(r.kb, 7)} ${pad(r.raw ?? "-", 7)} ${r.note ?? ""}`);
const total = rows.reduce((a, r) => a + (parseFloat(r.kb) || 0), 0);
console.log(`total ${total.toFixed(1)} KB in ${outDir}`);
engine.dispose();
