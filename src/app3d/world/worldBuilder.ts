// Turns WorldData (2D pixel layout) into placed 3D kit pieces. Buildings
// that the 2D layout drew over a road are nudged onto the nearest clear
// tiles (their zones/labels move with them); all static pieces go through a
// thin-instance batcher so repeated props cost one draw call per variant.

import { TILE } from "../../game/constants";
import type { LocationDef } from "../../game/data/locations";
import { secretsFor } from "../../game/data/secrets";
import type { PropSpec, WorldData } from "../../game/worldgen";
import type { AssetManager, PieceInstance, ThinPlacement } from "../assets/AssetManager";
import type { GridCollider } from "./gridCollider";
import type { Environment } from "../rendering/environment";
import { buildingSpec, buildingVariant, mapProp } from "./propMap";

const ROAD_TEX = new Set(["t_path", "t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_brick_path", "t_pavement", "t_paving_light", "t_paving_dark"]);

export class Placer {
  private batches = new Map<string, { key: string; variant: string; list: ThinPlacement[] }>();
  add(key: string, variant: string, p: ThinPlacement) {
    const id = `${key}#${variant}`;
    let b = this.batches.get(id);
    if (!b) {
      b = { key, variant, list: [] };
      this.batches.set(id, b);
    }
    b.list.push(p);
  }
  flush(am: AssetManager) {
    let count = 0;
    for (const b of this.batches.values()) {
      am.thinInstances(b.key, b.list, b.variant);
      count += b.list.length;
    }
    this.batches.clear();
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
}

export interface BuiltWorld {
  world: WorldData;
  /** lamp positions (for the night-only glow pools) */
  lamps: { x: number; z: number; y: number }[];
  buildings: PlacedBuilding[];
  reserved: Set<number>;
  instances: PieceInstance[];
  placer: Placer;
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
    // block the footprint (skip road tiles if we couldn't get clear of them)
    for (let y = ty - d + 1; y <= ty; y++)
      for (let x = left(tx); x < left(tx) + w; x++) {
        if (!strictOk && roadAt(x, y)) continue;
        if (reserved.has(tileKey(x, y))) continue;
        collider.block(x, y, 1, 1);
      }
    const cx = left(tx) + w / 2;
    const cz = -(ty + 1) + d / 2;
    const y = env.heightAt(tx, ty);
    // static buildings go through the thin-instance batcher (one draw per variant + reliable shadows)
    if (isCastle) placer.add("castle", `w=${w},d=${d}`, { x: cx, y, z: cz });
    else placer.add("building", buildingVariant(spec!), { x: cx, y, z: cz });
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
    const pl = { x: p.x / TILE + (m.dx ?? 0), y: env.heightAt(tx, ty), z: -(ty + 0.5) + (m.dz ?? 0), rotationY: m.rotationY ?? 0, scale: m.scale ?? 1 };
    placer.add(m.key, m.variant ?? "", pl);
    if (m.key === "lamp-post") lamps.push({ x: pl.x, y: pl.y, z: pl.z });
  }

  return { world, buildings, reserved, instances, placer, lamps };
}
