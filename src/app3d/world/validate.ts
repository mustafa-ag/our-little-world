// Dev-only world validator. After the placer flushes, every placed piece has a
// world-space AABB (worldBuilder.PlacedRecord); this checks them against the
// terrain, each other and the walkable grid, and logs a table + warnings.
//
// Usage (dev build): it runs automatically after each location build and logs
// "[validate] …" to the console; `window.__validate()` re-runs it and returns
// { summary, warnings, rows }. Options: { all: true } checks the whole map
// instead of the benchmark region, { quiet: true } skips console output,
// { region: [x0, y0, x1, y1] } (tile rect) narrows it.

import type { BuildContext, BuiltWorld, PlacedRecord } from "./worldBuilder";

/** Driveable / path core (plazas and pavements are open squares, not paths). */
const STREET = new Set(["t_path", "t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_brick_path"]);

export interface ValidateOptions {
  all?: boolean;
  quiet?: boolean;
  region?: [number, number, number, number];
}

export interface ValidateRow {
  key: string;
  variant: string;
  src: string;
  pos: string;
  rotY: number;
  scale: string;
  ground: number;
  baseOffset: number;
  size: string;
  fixes: string;
}

export interface ValidateResult {
  summary: { pieces: number; warnings: number; byKind: Record<string, number>; occluders: number };
  warnings: string[];
  rows: ValidateRow[];
}

/** Benchmark region (tile rect x0,y0,x1,y1): the east Royal Mile + cottages, the Mile, the café square. */
export const BENCHMARK_REGION: [number, number, number, number] = [22, 38, 110, 60];

/** Pieces that legitimately hang / overhang / sink (not ground-checked). */
const NO_GROUND_CHECK = new Set(["lamp-glow", "ivy-card", "flower-bed", "grass-tuft", "flower-cluster", "heather", "curb", "drain", "manhole"]);
/** Small decorative pieces that may overlap anything. */
const SOFT = new Set(["lamp-glow", "ivy-card", "flower-bed", "grass-tuft", "flower-cluster", "flower-cluster-a", "flower-cluster-b", "flower-cluster-c", "heather", "curb", "drain", "manhole"]);

const isBuilding = (r: PlacedRecord) => r.key === "building" || r.key === "castle" || r.key.includes("hero");

export function validateWorld(built: BuiltWorld, ctx: BuildContext, opts: ValidateOptions = {}): ValidateResult {
  const { env, collider } = ctx;
  const world = built.world;
  const reg = opts.region ?? (opts.all ? [0, 0, world.w, world.h] : BENCHMARK_REGION);
  const inRegion = (r: PlacedRecord) => {
    const tx = Math.floor(r.x);
    const ty = Math.floor(-r.z);
    return tx >= reg[0] && tx <= reg[2] && ty >= reg[1] && ty <= reg[3];
  };
  const recs = built.records.filter(inRegion);
  const warnings: string[] = [];
  const byKind: Record<string, number> = {};
  const warn = (kind: string, msg: string) => {
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    warnings.push(`${kind}: ${msg}`);
  };
  const at = (r: PlacedRecord) => `${r.key}${r.variant ? `[${r.variant}]` : ""}@${r.x.toFixed(2)},${(-r.z).toFixed(2)}`;
  const street = (tx: number, ty: number) => STREET.has(world.ground[ty]?.[tx] ?? "");

  // ---- ground: base y vs the terrain under the footprint
  const rows: ValidateRow[] = [];
  for (const r of recs) {
    let gMin = Infinity;
    let gMax = -Infinity;
    for (let ty = Math.floor(-r.max.z); ty <= Math.floor(-r.min.z); ty++)
      for (let tx = Math.floor(r.min.x); tx <= Math.floor(r.max.x); tx++) {
        const h = env.heightAt(tx, ty);
        gMin = Math.min(gMin, h);
        gMax = Math.max(gMax, h);
      }
    const gHere = env.heightAt(Math.floor(r.x), Math.floor(-r.z));
    const base = r.min.y - gHere;
    rows.push({
      key: r.key,
      variant: r.variant.slice(0, 28),
      src: r.meta.src ?? "dressing",
      pos: `${r.x.toFixed(2)},${r.y.toFixed(3)},${r.z.toFixed(2)}`,
      rotY: +r.rotationY.toFixed(2),
      scale: r.scale.map((v) => v.toFixed(2)).join("/"),
      ground: +gHere.toFixed(3),
      baseOffset: +base.toFixed(3),
      size: `${(r.max.x - r.min.x).toFixed(2)}×${(r.max.y - r.min.y).toFixed(2)}×${(r.max.z - r.min.z).toFixed(2)}`,
      fixes: r.fixes.join(" "),
    });
    if (NO_GROUND_CHECK.has(r.key)) continue;
    if (r.min.y > gMax + 0.03) warn("floating", `${at(r)} base ${r.min.y.toFixed(3)} > ground ${gMax.toFixed(3)}`);
    else if (r.min.y < gMin - (isBuilding(r) ? 0.12 : 0.1)) warn("sinking", `${at(r)} base ${r.min.y.toFixed(3)} < ground ${gMin.toFixed(3)}`);
  }

  // ---- footprints (XZ), shrunk a little; trees count by trunk only
  const fp = (r: PlacedRecord) => {
    if (r.meta.trunk) return { x0: r.x - r.meta.trunk, x1: r.x + r.meta.trunk, z0: r.z - r.meta.trunk, z1: r.z + r.meta.trunk };
    if (r.meta.fp) {
      // buildings: the walls' footprint (awnings, steps, lanterns overhang on purpose)
      const rotated = Math.abs(Math.abs(Math.sin(r.rotationY)) - 1) < 0.05;
      const hw = (rotated ? r.meta.fp.d : r.meta.fp.w) / 2 - 0.22;
      const hd = (rotated ? r.meta.fp.w : r.meta.fp.d) / 2 - 0.22;
      const cx = (r.min.x + r.max.x) / 2;
      const cz = (r.min.z + r.max.z) / 2;
      return { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd };
    }
    const k = isBuilding(r) ? 0.15 : 0.04;
    return { x0: r.min.x + k, x1: r.max.x - k, z0: r.min.z + k, z1: r.max.z - k };
  };
  const solid = recs.filter((r) => r.meta.solid && !SOFT.has(r.key));
  const fps = solid.map(fp);
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = fps[i];
      const b = fps[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0.02 && oz > 0.02 && ox * oz > 0.01) warn("overlap", `${at(solid[i])} ∩ ${at(solid[j])} (${ox.toFixed(2)}×${oz.toFixed(2)})`);
    }

  // ---- props inside buildings (anything whose centre is inside a building's walls)
  const blds = recs.filter(isBuilding);
  for (const r of recs) {
    if (isBuilding(r) || r.key === "lamp-glow" || r.key === "ivy-card" || r.key === "curb") continue;
    for (const b of blds) {
      const f = fp(b);
      const k = 0.1;
      if (r.x > f.x0 + k && r.x < f.x1 - k && r.z > f.z0 + k && r.z < f.z1 - k) {
        warn("inside", `${at(r)} inside ${at(b)}`);
        break;
      }
    }
  }

  // ---- blocked street tiles (solid props / buildings on the road itself)
  for (let ty = reg[1]; ty <= reg[3]; ty++)
    for (let tx = reg[0]; tx <= reg[2]; tx++) {
      if (!street(tx, ty) || !collider.isBlockedTile(tx, ty)) continue;
      if (ctx.world.blocked[ty]?.[tx]) continue; // worldgen's own blocking
      const who = solid.find((r) => Math.floor(r.x) === tx && Math.floor(-r.z) === ty);
      warn("blocks-path", `tile ${tx},${ty} (${world.ground[ty][tx]}) blocked${who ? ` by ${at(who)}` : ""}`);
    }
  // ---- solid props that close a 1-tile sidewalk (street on one side, blocked on the other)
  for (const r of solid) {
    if (isBuilding(r)) continue;
    const tx = Math.floor(r.x);
    const ty = Math.floor(-r.z);
    if (street(tx, ty)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!street(tx + dx, ty + dy)) continue;
      if (collider.isBlockedTile(tx - dx, ty - dy) && !street(tx - dx, ty - dy)) {
        warn("blocks-sidewalk", `${at(r)} closes the 1-tile sidewalk at ${tx},${ty}`);
        break;
      }
    }
  }

  const result: ValidateResult = { summary: { pieces: recs.length, warnings: warnings.length, byKind, occluders: built.occluders.length }, warnings, rows };
  if (!opts.quiet) {
    console.log(`[validate] ${recs.length} pieces in region ${reg.join(",")}, ${built.occluders.length} occluders, ${warnings.length} warnings`, byKind);
    if (typeof console.table === "function") console.table(rows);
    for (const w of warnings) console.warn(`[validate] ${w}`);
  }
  return result;
}

/** Dev hook: log once after the build and expose window.__validate(opts). */
export function installValidator(built: BuiltWorld, ctx: BuildContext) {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w.__validate = (opts: ValidateOptions = {}) => validateWorld(built, ctx, opts);
  const r = validateWorld(built, ctx, { quiet: true });
  console.log(`[validate] ${r.summary.pieces} pieces, ${r.summary.occluders} occluders, ${r.summary.warnings} warnings ${JSON.stringify(r.summary.byKind)} — window.__validate() for the table`);
}
