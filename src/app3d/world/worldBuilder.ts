// Turns WorldData (2D pixel layout) into placed 3D kit pieces. Buildings
// that the 2D layout drew over a road are nudged onto the nearest clear
// tiles (their zones/labels move with them); all static pieces go through a
// thin-instance batcher so repeated props cost one draw call per variant.

import { TILE } from "../../game/constants";
import type { LocationDef } from "../../game/data/locations";
import { secretsFor } from "../../game/data/secrets";
import type { PropSpec, WorldData } from "../../game/worldgen";
import { HERO_ASSETS, type AssetManager, type PieceInstance, type ThinPlacement } from "../assets/AssetManager";
import type { GridCollider } from "./gridCollider";
import type { Environment } from "../rendering/environment";
import { buildingSpec, buildingVariant, mapProp } from "./propMap";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { OccluderInfo } from "../rendering/occlusion";
import { CAFE_TABLE_H, CAR_H, FENCE_H, LAMP_H, POSTBOX_H, SIGNPOST_H, WALL_H } from "./scale";
import { installValidator } from "./validate";

export type { OccluderInfo };

const ROAD_TEX = new Set(["t_path", "t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_brick_path", "t_pavement", "t_paving_light", "t_paving_dark"]);

/** Extra placement info for validation, occlusion and ground snapping. */
export interface PlaceMeta {
  /** stable id (buildings: used as the occluder id) */
  id?: string;
  /** blocks movement / must not overlap other solid pieces */
  solid?: boolean;
  /** a building-sized piece the occlusion system may fade */
  occluder?: boolean;
  /** only the trunk counts for overlap (trees): footprint half-size in units */
  trunk?: number;
  /** skip the automatic ground snap (pieces that hang, sink on purpose, …) */
  noSnap?: boolean;
  /** free-form origin tag for the validator table ("bench-street", "worldgen", …) */
  src?: string;
  /** buildings: tile footprint (unrotated w × d) for overlap checks */
  fp?: { w: number; d: number };
}

/** One placed piece, in world space, after flush (for the validator). */
export interface PlacedRecord {
  key: string;
  variant: string;
  index: number;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: [number, number, number];
  min: Vector3;
  max: Vector3;
  meta: PlaceMeta;
  mesh: Mesh;
  /** corrections applied at flush time (height normalisation / ground snap) */
  fixes: string[];
}

/**
 * Target heights (world units, see world/scale.ts) the street furniture is
 * normalised to at flush time, whatever its source (hero GLB or procedural
 * fallback). "y" scales height only (runs of walls / fences keep their 1-unit
 * length so segments still meet); "uniform" keeps proportions.
 */
const HEIGHT_TARGETS: Record<string, { h: number; mode: "uniform" | "y" }> = {
  "lamp-post": { h: LAMP_H, mode: "uniform" },
  signpost: { h: SIGNPOST_H, mode: "uniform" },
  "post-box": { h: POSTBOX_H, mode: "uniform" },
  "cafe-table": { h: CAFE_TABLE_H, mode: "uniform" },
  "stone-wall": { h: WALL_H, mode: "y" },
  fence: { h: FENCE_H, mode: "y" },
  "wooden-fence": { h: FENCE_H, mode: "y" },
  car: { h: CAR_H, mode: "uniform" },
};
/** Pieces whose base must sit exactly on the ground (origin fix-up at flush). */
const SNAP_KEYS = new Set(["lamp-post", "bench", "signpost", "post-box", "planter", "cafe-table", "cafe-chair", "barrel", "crate", "phone-box", "stone-wall", "fence", "wooden-fence", "fence-gate", "car", "chalkboard", "well", "fountain", "bollard", "curb", "bush", "bush-a", "bush-b"]);

interface Pending extends ThinPlacement {
  meta: PlaceMeta;
}

export class Placer {
  private batches = new Map<string, { key: string; variant: string; list: Pending[] }>();
  /** filled by flush(): every placed piece (world-space AABB) */
  readonly records: PlacedRecord[] = [];
  /** filled by flush(): buildings for the occlusion system */
  readonly occluders: OccluderInfo[] = [];
  /** called once after each flush (dev validator hook) */
  onFlush: (() => void) | null = null;

  add(key: string, variant: string, p: ThinPlacement, meta: PlaceMeta = {}) {
    const id = `${key}#${variant}`;
    let b = this.batches.get(id);
    if (!b) {
      b = { key, variant, list: [] };
      this.batches.set(id, b);
    }
    b.list.push({ ...p, meta });
  }

  flush(am: AssetManager) {
    let count = 0;
    const m = new Matrix();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const corner = new Vector3();
    const out = new Vector3();
    for (const b of this.batches.values()) {
      const mesh = am.thinInstances(b.key, b.list, b.variant);
      count += b.list.length;
      if (!mesh) continue;
      const bb = mesh.getRawBoundingInfo().boundingBox;
      const lmin = bb.minimum;
      const lmax = bb.maximum;
      const target = HEIGHT_TARGETS[b.key];
      const localH = lmax.y - lmin.y;
      const norm = target && localH > 0.05 ? target.h / localH : 1;
      const applyNorm = Math.abs(norm - 1) > 0.06;
      const snap = SNAP_KEYS.has(b.key) || b.key.includes("hero");
      const data = new Float32Array(16 * b.list.length);
      b.list.forEach((pl, i) => {
        const fixes: string[] = [];
        const base = pl.scale ?? 1;
        let sx = base;
        let sy = base;
        let sz = base;
        if (applyNorm) {
          sy *= norm;
          if (target!.mode === "uniform") {
            sx *= norm;
            sz *= norm;
          }
          fixes.push(`h×${norm.toFixed(2)}`);
        }
        let y = pl.y ?? 0;
        // origin fix-up: the lowest point of the piece rests on the ground
        const off = lmin.y * sy;
        if (snap && !pl.meta.noSnap && Math.abs(off) > 0.015) {
          y -= off;
          fixes.push(`snap ${(-off).toFixed(3)}`);
        }
        Quaternion.RotationYawPitchRollToRef(pl.rotationY ?? 0, 0, 0, q);
        s.set(sx, sy, sz);
        p.set(pl.x, y, pl.z);
        Matrix.ComposeToRef(s, q, p, m);
        m.copyToArray(data, i * 16);
        // world AABB of the 8 local corners
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        for (let c = 0; c < 8; c++) {
          corner.set(c & 1 ? lmax.x : lmin.x, c & 2 ? lmax.y : lmin.y, c & 4 ? lmax.z : lmin.z);
          Vector3.TransformCoordinatesToRef(corner, m, out);
          min.minimizeInPlace(out);
          max.maximizeInPlace(out);
        }
        this.records.push({ key: b.key, variant: b.variant, index: i, x: pl.x, y, z: pl.z, rotationY: pl.rotationY ?? 0, scale: [sx, sy, sz], min, max, meta: pl.meta, mesh, fixes });
        if (pl.meta.occluder) this.occluders.push({ id: pl.meta.id ?? `${b.key}#${b.variant}:${i}`, min: min.clone(), max: max.clone(), mesh, thinIndex: i });
      });
      mesh.thinInstanceSetBuffer("matrix", data, 16, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
    }
    this.batches.clear();
    this.onFlush?.();
    return count;
  }
}

export interface BuildContext {
  am: AssetManager;
  collider: GridCollider;
  env: Environment;
  def: LocationDef;
  world: WorldData;
}

export interface PlacedBuilding {
  tex: string;
  tx: number; // centre tile column (float, e.g. 52.5 => tiles 51..53 for w=3)
  ty: number; // base row (south-most footprint row)
  w: number;
  d: number;
  rotationY: number;
  name?: string;
  kind: string;
  /** door centre along the building's local X (units; 0 = middle) */
  doorX?: number;
}

export interface BuiltWorld {
  world: WorldData;
  /** lamp positions (for the night-only glow pools) */
  lamps: { x: number; z: number; y: number }[];
  buildings: PlacedBuilding[];
  reserved: Set<number>;
  instances: PieceInstance[];
  placer: Placer;
  /**
   * Every building (thin-instanced: batch mesh + thinIndex) for the occlusion
   * system. Filled when `placer.flush()` runs (same array instance), so read it
   * after the flush.
   */
  occluders: OccluderInfo[];
  /** Every placed piece in world space (filled by flush; used by world/validate.ts). */
  records: PlacedRecord[];
}

export const tileKey = (tx: number, ty: number) => ty * 4096 + tx;

export function isRoadTex(tex: string) {
  return ROAD_TEX.has(tex);
}

function cloneWorld(w: WorldData): WorldData {
  return {
    ...w,
    props: w.props.map((p) => ({ ...p })),
    zones: w.zones.map((z) => ({ ...z })),
    labels: w.labels.map((l) => ({ ...l })),
    collectibles: w.collectibles.map((c) => ({ ...c })),
    npcSpots: w.npcSpots.map((n) => ({ ...n })),
    blocked: w.blocked.map((r) => r.slice()),
  };
}

/** Tiles that gameplay needs walkable (spawn, NPCs, pickups, zone centres). */
export function reservedTiles(world: WorldData, locationId: string) {
  const set = new Set<number>();
  const mark = (px: number, py: number, r = 0) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor((py - 1) / TILE);
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) set.add(tileKey(x, y));
  };
  mark(world.spawn.x, world.spawn.y, 1);
  for (const n of world.npcSpots) mark(n.x, n.y, 1);
  for (const c of world.collectibles) mark(c.x, c.y);
  for (const z of world.zones) mark(z.x, z.y, 1);
  for (const s of secretsFor(locationId)) set.add(tileKey(s.tx, s.ty));
  const e = (world as WorldData & { entry?: unknown }).entry;
  void e;
  return set;
}

export function buildWorld(ctx: BuildContext): BuiltWorld {
  const world = cloneWorld(ctx.world);
  const { collider, env, def } = ctx;
  const reserved = reservedTiles(world, def.id);
  const placer = new Placer();
  const instances: PieceInstance[] = [];
  const buildings: PlacedBuilding[] = [];
  const lamps: { x: number; z: number; y: number }[] = [];
  const isFree = (tx: number, ty: number) => tx > 0 && ty > 0 && tx < world.w - 1 && ty < world.h - 1 && !reserved.has(tileKey(tx, ty));
  const roadAt = (tx: number, ty: number) => isRoadTex(world.ground[ty]?.[tx] ?? "");

  const placeBuilding = (p: PropSpec) => {
    const tx0 = Math.floor(p.x / TILE);
    const ty0 = Math.floor(p.y / TILE) - 1;
    const spec = buildingSpec(p.tex, tx0, ty0);
    const isCastle = p.tex.startsWith("lm_");
    const w = isCastle ? 8 : spec!.w;
    const d = isCastle ? 5 : spec!.d;
    const left = (tx: number) => tx - Math.floor(w / 2);
    const clear = (tx: number, ty: number, strict: boolean) => {
      for (let y = ty - d + 1; y <= ty; y++)
        for (let x = left(tx); x < left(tx) + w; x++) {
          if (!isFree(x, y)) return false;
          if (strict && roadAt(x, y)) return false;
        }
      return true;
    };
    // nudge off roads: try north first (keeps the NPC/zone in front), then south, then sideways
    const tries: [number, number][] = [
      [0, 0],
      [0, -1],
      [0, -2],
      [0, -3],
      [0, 1],
      [0, 2],
      [1, 0],
      [-1, 0],
      [2, 0],
      [-2, 0],
      [0, -4],
      [3, 0],
      [-3, 0],
    ];
    let tx = tx0;
    let ty = ty0;
    let strictOk = false;
    for (const [dx, dy] of tries) {
      if (clear(tx0 + dx, ty0 + dy, true)) {
        tx = tx0 + dx;
        ty = ty0 + dy;
        strictOk = true;
        break;
      }
    }
    const dxTiles = tx - tx0;
    const dyTiles = ty - ty0;
    if (dxTiles || dyTiles) {
      // move the door zone + label with the building
      const doorY = p.y + 4;
      for (const z of world.zones) {
        if (Math.abs(z.x - p.x) < TILE && Math.abs(z.y - doorY) < TILE) {
          z.x += dxTiles * TILE;
          z.y += dyTiles * TILE;
        }
      }
      for (const l of world.labels) {
        if (Math.abs(l.x - p.x) < TILE && l.y < p.y && p.y - l.y < 200) {
          l.x += dxTiles * TILE;
          l.y += dyTiles * TILE;
        }
      }
      p.x += dxTiles * TILE;
      p.y += dyTiles * TILE;
    }
    const cx = left(tx) + w / 2;
    const cz = -(ty + 1) + d / 2;
    // hero GLB café (only when the GLB itself loaded: the fallback is the kit café),
    // shifted so its door sits where the kit door was (the footprint centre, where the zone is)
    const hero = !isCastle && spec!.kind === "cafe" && ctx.am.isGlbLoaded("cafe-hero") ? heroBuilding(ctx.am, "cafe-hero", w, d) : null;
    const hx = hero ? -(hero.door?.x ?? 0) * hero.scale : 0;
    // collision rect: the footprint, or the tiles the fitted hero really covers (>0.3 u)
    let bx0 = left(tx);
    let bx1 = left(tx) + w - 1;
    let by0 = ty - d + 1;
    const by1 = ty;
    if (hero) {
      const ex0 = cx + hx - (hero.footprint[0] * hero.scale) / 2;
      const ex1 = cx + hx + (hero.footprint[0] * hero.scale) / 2;
      const depth = hero.footprint[1] * hero.scale;
      bx0 = Math.floor(ex0 + 0.3);
      bx1 = Math.ceil(ex1 - 0.3) - 1;
      by0 = ty - Math.ceil(depth - 0.3) + 1;
    }
    // block the footprint (skip road tiles if we couldn't get clear of them)
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++) {
        if (!strictOk && roadAt(x, y)) continue;
        if (reserved.has(tileKey(x, y))) continue;
        collider.block(x, y, 1, 1);
      }
    // lowest ground under the footprint: never float over a lower neighbour tile
    const y = groundUnder(env, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    const id = `bld:${p.tex}:${left(tx)},${ty}`;
    // static buildings go through the thin-instance batcher (one draw per variant + reliable shadows)
    if (isCastle) placer.add("castle", `w=${w},d=${d}`, { x: cx, y, z: cz }, { id, solid: true, occluder: true, src: "worldgen", fp: { w, d } });
    else if (hero) placer.add(hero.key, "", { x: cx + hx, y, z: cz + hero.dz, scale: hero.scale }, { id, solid: true, occluder: true, src: "worldgen-hero", fp: { w: bx1 - bx0 + 1, d: by1 - by0 + 1 } });
    else placer.add("building", buildingVariant(spec!), { x: cx, y, z: cz }, { id, solid: true, occluder: true, src: "worldgen", fp: { w, d } });
    const name = world.labels.find((l) => Math.abs(l.x - p.x) < 1 && !l.big)?.text;
    buildings.push({ tex: p.tex, tx: left(tx) + w / 2, ty, w, d, rotationY: 0, name, kind: isCastle ? "castle" : spec!.kind });
  };

  for (const p of world.props) {
    if (p.tex.startsWith("b_") || p.tex.startsWith("lm_")) {
      if (buildingSpec(p.tex, 0, 0) || p.tex.startsWith("lm_")) placeBuilding(p);
      continue;
    }
    const m = mapProp(p.tex, Math.floor(p.x / TILE), Math.floor(p.y / TILE) - 1);
    if (!m) continue;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE) - 1;
    const fx = m.footprint?.w ?? 1;
    const fd = m.footprint?.d ?? 1;
    if (m.solid) {
      for (let y = ty - fd + 1; y <= ty; y++)
        for (let x = tx - Math.floor(fx / 2); x < tx - Math.floor(fx / 2) + fx; x++) if (!reserved.has(tileKey(x, y))) collider.block(x, y, 1, 1);
    }
    const pl = { x: p.x / TILE + (m.dx ?? 0), y: m.solid ? groundUnder(env, tx - Math.floor(fx / 2), ty - fd + 1, fx, fd) : env.heightAt(tx, ty), z: -(ty + 0.5) + (m.dz ?? 0), rotationY: m.rotationY ?? 0, scale: m.scale ?? 1 };
    placer.add(m.key, m.variant ?? "", pl, { solid: !!m.solid, trunk: m.key.startsWith("tree") ? 0.2 : undefined, src: "worldgen" });
    if (m.key === "lamp-post") lamps.push({ x: pl.x, y: pl.y, z: pl.z });
  }

  const built: BuiltWorld = { world, buildings, reserved, instances, placer, lamps, occluders: placer.occluders, records: placer.records };
  if (import.meta.env?.DEV) placer.onFlush = () => installValidator(built, ctx);
  return built;
}

/** Lowest ground height over a tile rectangle (x0,y0 = north-west tile). */
export function groundUnder(env: Environment, x0: number, y0: number, w: number, d: number) {
  let y = Infinity;
  for (let ty = y0; ty < y0 + d; ty++) for (let tx = x0; tx < x0 + w; tx++) y = Math.min(y, env.heightAt(tx, ty));
  return Number.isFinite(y) ? y : 0;
}

/** Snap a placement onto the ground of its tile (y = terrain height). */
export function placeOnGround<T extends { x: number; z: number; y?: number }>(env: Environment, p: T): T {
  p.y = env.heightAt(Math.floor(p.x), Math.floor(-p.z));
  return p;
}

interface HeroEntryLike {
  footprint?: [number, number];
  door?: { x: number; z: number };
}

/**
 * A hero building key (cottage-hero-a/b, cafe-hero) fitted into a w×d tile
 * footprint: uniform scale so it never exceeds the width (and at most ~0.4 u
 * deeper than the footprint), front aligned with the footprint front. Null
 * when the key isn't registered (then the kit building is used).
 */
export function heroBuilding(am: AssetManager, key: string, w: number, d: number) {
  if (!am.has(key)) return null;
  const e = (HERO_ASSETS as Record<string, HeroEntryLike>)[key];
  const [fw, fd] = e?.footprint ?? [w, d];
  const scale = Math.min(1, w / fw, (d + 0.4) / fd);
  // front edges aligned: footprint front at -d/2, hero front at -fd*scale/2
  const dz = -(d / 2) + (fd * scale) / 2;
  return { key, scale, dz, footprint: [fw, fd] as [number, number], door: e?.door };
}
