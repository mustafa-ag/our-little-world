#!/usr/bin/env node
// Scripts that don't use olw.export_glb (e.g. the rigged characters) still run;
// they just don't get the glTF-Transform pass or a manifest entry.
//
// Runs every Blender asset script (tools/blender/**/*.py, except lib/ and files
// starting with "_") with a headless Blender Python (the `bpy` module), then
// welds/quantizes the GLBs they wrote with glTF-Transform and records them in
// tools/blender/manifest.json. scripts/build-hero-assets.mjs reads that
// manifest and never overwrites a Blender-authored key.
//
//   npm run assets:blender                     # all scripts
//   npm run assets:blender -- props            # scripts whose path contains "props"
//   npm run assets:blender -- --only bench,signpost   # only these keys (OLW_ONLY)
//   npm run assets:blender -- --raw            # skip the glTF-Transform pass
//   npm run assets:blender -- -j 1             # run scripts one at a time (default 3)
//
// Python: $BLENDER_PY, else the scratch venv used during development, else
// `python3.11`. Install with: python3.11 -m venv .venv-bpy && .venv-bpy/bin/pip install bpy==4.2.0
// (bpy 4.2 wheels exist for CPython 3.11 only).

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const manifestPath = join(here, "manifest.json");

const args = process.argv.slice(2);
let only = "";
let raw = false;
let jobs = 3;
const filters = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--only") only = args[++i] ?? "";
  else if (a.startsWith("--only=")) only = a.slice(7);
  else if (a === "--raw") raw = true;
  else if (a === "-j") jobs = Math.max(1, Number(args[++i]) || 1);
  else filters.push(a);
}

function findPython() {
  const cands = [
    process.env.BLENDER_PY,
    join(root, ".venv-bpy", "bin", "python"),
    "/tmp/claude-0/-home-user-our-little-world/612a8e31-1709-5782-a97d-5ae8b40e15ee/scratchpad/bpy-venv/bin/python",
  ].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  return "python3.11";
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "lib" || name === "__pycache__" || name.startsWith(".")) continue;
      walk(p, out);
    } else if (name.endsWith(".py") && !name.startsWith("_")) out.push(p);
  }
  return out;
}

const py = findPython();
let scripts = walk(here).sort();
if (filters.length) scripts = scripts.filter((s) => filters.some((f) => relative(here, s).includes(f)));
if (!scripts.length) {
  console.error("no Blender asset scripts matched");
  process.exit(1);
}
console.log(`python: ${py}\nscripts: ${scripts.map((s) => relative(root, s)).join(", ")}`);

function run(script) {
  return new Promise((resolve) => {
    const env = { ...process.env, PYTHONPATH: [join(here, "lib"), process.env.PYTHONPATH].filter(Boolean).join(":"), PYTHONUNBUFFERED: "1" };
    if (only) env.OLW_ONLY = only;
    const child = spawn(py, [script], { cwd: root, env });
    const assets = [];
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code0, signal) => {
      let code = code0;
      // bpy sometimes crashes during interpreter teardown (after everything was
      // exported); accept that when the script reported its assets and no error
      if (code === null && signal && !/Traceback|FAILED|ValidationError/.test(out + err)) {
        console.warn(`warn: ${relative(root, script)} was killed by ${signal} at exit (after exporting) - ignored`);
        code = 0;
      }
      for (const line of out.split("\n")) {
        if (line.startsWith("OLW_ASSET ")) assets.push(JSON.parse(line.slice(10)));
        else if (line.startsWith("[olw]")) console.log(line);
      }
      const errLines = err.split("\n").filter((l) => l.trim() && !/^(Info|Warning: region|Blender|Read blend|Fra:)/.test(l));
      if (code !== 0) {
        console.error(`\n✗ ${relative(root, script)} exited ${code}\n${errLines.slice(-25).join("\n")}`);
      } else if (errLines.some((l) => l.includes("ERROR"))) console.error(errLines.join("\n"));
      resolve({ script, code, assets });
    });
  });
}

const results = [];
const queue = [...scripts];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) results.push(await run(queue.shift()));
  }),
);

// ---------------------------------------------------------------- glTF-Transform pass
let io, tf;
if (!raw) {
  try {
    const { NodeIO, PropertyType } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const { dedup, prune, quantize, weld } = await import("@gltf-transform/functions");
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    // never dedup materials: slot placeholders may be identical apart from their names
    tf = [dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeTexcoord: 12 }), prune()];
  } catch (e) {
    console.warn("warn: glTF-Transform unavailable, keeping raw GLBs:", e.message);
  }
}

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { assets: {} };
manifest.note = "Written by tools/blender/build.mjs. Keys listed here are Blender-authored: scripts/build-hero-assets.mjs skips them.";
const rows = [];
for (const r of results) {
  for (const a of r.assets) {
    const abs = join(root, a.path);
    if (io && tf) {
      const doc = await io.read(abs);
      await doc.transform(...tf);
      await io.write(abs, doc);
      a.kb = +(statSync(abs).size / 1024).toFixed(1);
    }
    a.script = relative(root, r.script).split(sep).join("/");
    manifest.assets[a.key] = a;
    rows.push(a);
  }
}
manifest.assets = Object.fromEntries(Object.entries(manifest.assets).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const pad = (s, n) => String(s ?? "-").padEnd(n);
console.log(`\n${pad("key", 18)} ${pad("tris", 6)} ${pad("KB", 7)} size (x, up, depth)`);
for (const a of rows.sort((x, y) => x.key.localeCompare(y.key))) console.log(`${pad(a.key, 18)} ${pad(a.tris, 6)} ${pad(a.kb, 7)} ${JSON.stringify(a.size ?? "")}`);
const failed = results.filter((r) => r.code !== 0);
if (failed.length) {
  console.error(`\n${failed.length} script(s) failed: ${failed.map((f) => relative(root, f.script)).join(", ")}`);
  process.exit(1);
}
console.log(`\n${rows.length} asset(s) built; manifest: ${relative(root, manifestPath)}`);
