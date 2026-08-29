import Phaser from "phaser";
import { TILE } from "./constants";
import type { Cardinal, CityDef, LocationDef, PathSpec, Poi } from "./data/locations";
import { opposite, getLocation } from "./data/locations";
import { stroke } from "./data/mapkit";
import { NPCS } from "./data/npcs";

export interface PropSpec {
  tex: string;
  x: number;
  y: number;
  originX?: number;
  originY?: number;
}

export interface ZoneSpec {
  x: number;
  y: number;
  radius: number;
  action: "cafe" | "shop" | "home" | "drive" | "landmark" | "info" | "exit" | "stairs" | "salon";
  tag?: string;
  prompt: string;
  data?: unknown;
}

export interface CollectibleSpec {
  id: string;
  tex: string;
  x: number;
  y: number;
  tag: string;
}

export interface LabelSpec {
  x: number;
  y: number;
  text: string;
  big?: boolean;
}

export interface NpcSpot {
  id: string;
  x: number;
  y: number;
}

export interface WorldData {
  w: number;
  h: number;
  ground: string[][];
  blocked: boolean[][];
  props: PropSpec[];
  zones: ZoneSpec[];
  collectibles: CollectibleSpec[];
  labels: LabelSpec[];
  npcSpots: NpcSpot[];
  spawn: { x: number; y: number };
}

function texSize(scene: Phaser.Scene, key: string) {
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  return { w: src.width, h: src.height };
}

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function seedOf(id: string) {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return s;
}

// ---------------------------------------------------------------------------
// Big procedural city: built from the LocationDef fields for places that don't
// have a hand-authored map. Still large and themed (skyline + landmark + shops).
// ---------------------------------------------------------------------------
function proceduralCity(def: LocationDef): CityDef {
  const w = 80;
  const h = 62;
  const cx = Math.floor(w / 2);
  const pois: Poi[] = [];

  if (def.landmark)
    pois.push({ tex: def.landmark, tx: cx, ty: 13, role: "landmark", name: def.landmarkName });

  // skyline across the back, flanking the landmark
  if (def.skyline && def.skyline.length) {
    let i = 0;
    for (let x = 6; x < w - 6; x += 7) {
      if (Math.abs(x - cx) < 7) continue;
      pois.push({ tex: def.skyline[i % def.skyline.length], tx: x, ty: 8, role: "deco" });
      i++;
    }
  }

  // named street buildings along the main avenue
  const slots = [12, 22, 58, 68, 34, 46];
  def.buildings.forEach((b, idx) => {
    pois.push({ tex: b.tex, tx: slots[idx % slots.length], ty: 26, role: b.role ?? "plain", name: b.name, desc: b.desc });
  });

  // themed scenery down on the street
  if (def.scenery) {
    def.scenery.forEach((s, i) => {
      const tx = i % 2 === 0 ? 10 + i * 3 : w - 12 - i * 3;
      pois.push({ tex: s.tex, tx, ty: 40, role: "deco", solid: s.solid });
    });
  }

  if (def.hasHome)
    pois.push({ tex: def.homeTex ?? "b_house_green", tx: cx + 8, ty: 46, role: "home", name: def.homeName });

  // a drivable Jeep near spawn, always
  pois.push({ tex: "v_jeep_blue", tx: cx - 3, ty: 40, role: "drive" });

  return {
    w,
    h,
    base: def.ground,
    baseAlt: def.groundAlt,
    road: def.path,
    border: def.border,
    water: def.hasWater ? [{ x: 5, y: 46, w: 18, h: 12 }] : undefined,
    roads: [
      { x: 4, y: 30, w: w - 8, h: 3 }, // main avenue
      { x: cx - 1, y: 6, w: 2, h: h - 12 }, // central spine
      { x: 4, y: 46, w: cx, h: 2 }, // lower cross street
    ],
    pois,
    spawn: { tx: cx, ty: 35 },
  };
}

// ---------------------------------------------------------------------------
// Lay a CityDef (authored or procedural) into concrete WorldData.
// ---------------------------------------------------------------------------
function layoutCity(scene: Phaser.Scene, def: LocationDef, city: CityDef): WorldData {
  const { w, h } = city;
  const seed = seedOf(def.id);
  const ground: string[][] = [];
  const blocked: boolean[][] = [];
  const walk: boolean[][] = [];
  const props: PropSpec[] = [];
  const zones: ZoneSpec[] = [];
  const collectibles: CollectibleSpec[] = [];
  const labels: LabelSpec[] = [];
  const npcSpots: NpcSpot[] = [];

  const centerPx = (tx: number) => tx * TILE + TILE / 2;

  // ---- base ground ----
  for (let y = 0; y < h; y++) {
    ground[y] = [];
    blocked[y] = [];
    walk[y] = [];
    for (let x = 0; x < w; x++) {
      ground[y][x] = hash(x, y, seed) > 0.85 ? city.baseAlt : city.base;
      blocked[y][x] = false;
      walk[y][x] = false;
    }
  }

  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  // ---- districts ----
  for (const d of city.districts ?? []) {
    for (let y = d.y; y < d.y + d.h; y++)
      for (let x = d.x; x < d.x + d.w; x++) {
        if (!inB(x, y)) continue;
        ground[y][x] = d.alt && hash(x, y, seed + 3) > 0.82 ? d.alt : d.ground;
      }
    if (d.name)
      labels.push({ x: centerPx(d.x + Math.floor(d.w / 2)), y: (d.y + 1) * TILE, text: d.name, big: true });
  }

  const paintRect = (r: { x: number; y: number; w: number; h: number }, tex: string, alt: string | undefined, block: boolean, street = false) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!inB(x, y)) continue;
        ground[y][x] = alt && hash(x, y, seed + 11) > 0.84 ? alt : tex;
        blocked[y][x] = block;
        if (street) walk[y][x] = true;
        if (block) walk[y][x] = false;
      }
  };

  const paintPath = (p: PathSpec) => {
    const water = p.tex === "t_water" || p.walkable === false;
    for (const c of stroke(p.points, p.width)) {
      if (!inB(c.x, c.y)) continue;
      ground[c.y][c.x] = p.tex;
      blocked[c.y][c.x] = water;
      walk[c.y][c.x] = !water;
    }
  };

  // ---- authored surfaces (plazas, parks, gardens, parking) ----
  for (const s of city.surfaces ?? []) {
    paintRect(s, s.tex, s.alt, s.walkable === false || s.tex === "t_water");
  }

  // ---- water ----
  for (const r of city.water ?? []) paintRect(r, "t_water", undefined, true);

  const paths = city.paths ?? [];
  const waterPaths = paths.filter((p) => p.tex === "t_water" || p.walkable === false);
  const walkPaths = paths.filter((p) => p.tex !== "t_water" && p.walkable !== false && p.kind !== "road" && p.kind !== "street");
  const streetPaths = paths.filter((p) => p.kind === "road" || p.kind === "street");

  for (const p of waterPaths) paintPath(p);
  for (const p of walkPaths) paintPath(p);

  // ---- roads (drawn on top of everything; never blocked) ----
  for (const r of city.roads ?? []) paintRect(r, city.road, undefined, false, true);
  for (const p of streetPaths) paintPath(p);

  const gapAxis = (dir: Cardinal) => {
    const e = city.entry?.[dir];
    if (dir === "north" || dir === "south") return e?.tx ?? Math.floor(w / 2);
    return e?.ty ?? Math.floor(h / 2);
  };

  // road through exit gaps (aligned to the authored entry, not the map centre)
  (Object.keys(def.exits ?? {}) as Cardinal[]).forEach((dir) => {
    const axis = gapAxis(dir);
    if (dir === "north" || dir === "south") {
      const y0 = dir === "north" ? 0 : h - 4;
      for (let y = y0; y < y0 + 4; y++)
        for (let x = axis - 7; x <= axis + 7; x++) {
          if (!inB(x, y)) continue;
          ground[y][x] = city.road;
          blocked[y][x] = false;
          walk[y][x] = true;
        }
    } else {
      const x0 = dir === "west" ? 0 : w - 4;
      for (let x = x0; x < x0 + 4; x++)
        for (let y = axis - 7; y <= axis + 7; y++) {
          if (!inB(x, y)) continue;
          ground[y][x] = city.road;
          blocked[y][x] = false;
          walk[y][x] = true;
        }
    }
  });

  // ---- border ring (leave gaps at district exits so you can walk through) ----
  const borderTex =
    city.border === "tree" ? "o_tree" : city.border === "pine" ? "o_pine" : city.border === "rock" ? "o_rock" : "o_fence_h";
  const gap = (dir: Cardinal, x: number, y: number) => {
    if (!def.exits?.[dir]) return false;
    const axis = gapAxis(dir);
    if (dir === "north" || dir === "south") return Math.abs(x - axis) <= 7;
    return Math.abs(y - axis) <= 7;
  };
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const dir: Cardinal = y === 0 ? "north" : "south";
      if (gap(dir, x, y)) continue;
      blocked[y][x] = true;
      if (x % 2 === 0) props.push({ tex: city.border === "fence" ? "o_fence_h" : borderTex, x: centerPx(x), y: (y + 1) * TILE });
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const dir: Cardinal = x === 0 ? "west" : "east";
      if (gap(dir, x, y)) continue;
      blocked[y][x] = true;
      if (y % 2 === 0) props.push({ tex: city.border === "fence" ? "o_fence_v" : borderTex, x: centerPx(x), y: (y + 1) * TILE });
    }
  }

  // ---- helper to place a POI ----
  const placePoi = (p: Poi) => {
    const role = p.role ?? "deco";
    const { w: pw, h: ph } = texSize(scene, p.tex);
    const wTiles = Math.max(1, Math.round(pw / TILE));
    const leftTx = p.tx - Math.floor(wTiles / 2);
    const cx = p.tx * TILE + TILE / 2;
    const baseY = (p.ty + 1) * TILE;

    if (role === "drive") {
      zones.push({ x: cx, y: baseY, radius: 26, action: "drive", prompt: "Get in the Jeep" });
      return;
    }

    props.push({ tex: p.tex, x: cx, y: baseY });

    // footprint collision (2 rows for buildings, 1 for small props)
    const isBuilding = pw >= TILE * 1.5 || ph >= TILE * 1.5;
    const solid = p.solid !== false;
    if (solid) {
      for (let x = leftTx; x < leftTx + wTiles; x++) {
        if (x <= 0 || x >= w - 1) continue;
        if (inB(x, p.ty) && !walk[p.ty][x]) blocked[p.ty][x] = true;
        if (isBuilding && inB(x, p.ty - 1) && !walk[p.ty - 1][x]) blocked[p.ty - 1][x] = true;
      }
    }

    if (p.name) labels.push({ x: cx, y: baseY - ph - 4, text: p.name });

    if (role !== "deco" && inB(p.tx, p.ty + 1)) blocked[p.ty + 1][p.tx] = false;

    const doorY = baseY + 4;
    switch (role) {
      case "landmark":
        zones.push({ x: cx, y: doorY, radius: 26, action: "landmark", prompt: `Admire ${p.name ?? def.name}`, data: p.name });
        break;
      case "home":
        zones.push({ x: cx, y: doorY, radius: 22, action: "home", prompt: `Go inside ${p.name ?? "your home"}`, data: { rx: cx, ry: baseY + TILE } });
        break;
      case "cafe":
        zones.push({
          x: cx,
          y: doorY,
          radius: 22,
          action: "cafe",
          tag: p.tag ?? "cafe",
          prompt: `Order coffee at ${p.name ?? "the cafe"}`,
        });
        break;
      case "shop":
        zones.push({
          x: cx,
          y: doorY,
          radius: 22,
          action: "shop",
          tag: p.tag ?? "shop",
          prompt: `Shop at ${p.name ?? "the shop"}`,
        });
        break;
      case "stairs":
        zones.push({
          x: cx,
          y: doorY,
          radius: 22,
          action: "stairs",
          tag: p.tag,
          prompt: `Climb the stairs at ${p.name ?? "the building"}`,
          data: { name: p.name, desc: p.desc, tag: p.tag },
        });
        break;
      case "salon":
        zones.push({
          x: cx,
          y: doorY,
          radius: 22,
          action: "salon",
          tag: p.tag,
          prompt: `Nails & brows at ${p.name ?? "the salon"}`,
          data: { name: p.name, desc: p.desc, tag: p.tag },
        });
        break;
      case "apartment":
      case "uni":
      case "plain":
        if (p.name)
          zones.push({ x: cx, y: doorY, radius: 22, action: "info", prompt: `Look at ${p.name}`, data: { name: p.name, desc: p.desc } });
        break;
    }

    // anchor an npc in front of this building
    if (p.npc) {
      const ny = (p.ty + 2) * TILE;
      if (inB(p.tx, p.ty + 2)) blocked[p.ty + 2][p.tx] = false;
      npcSpots.push({ id: p.npc, x: cx, y: ny });
    }
  };

  for (const p of city.pois) placePoi(p);

  // leftover NPCs for this district (only if they weren't anchored to a building)
  const anchored = new Set(npcSpots.map((s) => s.id));
  const rest = NPCS.filter((n) => n.location === def.id && !anchored.has(n.id));
  rest.forEach((n) => {
    const tx = Phaser.Math.Clamp(n.tx, 3, w - 4);
    const ty = Phaser.Math.Clamp(n.ty, 3, h - 4);
    if (inB(tx, ty)) blocked[ty][tx] = false;
    npcSpots.push({ id: n.id, x: centerPx(tx), y: (ty + 1) * TILE });
  });

  // streets/paths stay walkable even if a building footprint overlaps them
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (walk[y][x]) blocked[y][x] = false;

  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const dir: Cardinal = y === 0 ? "north" : "south";
      if (gap(dir, x, y) || walk[y][x]) continue;
      blocked[y][x] = true;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const dir: Cardinal = x === 0 ? "west" : "east";
      if (gap(dir, x, y) || walk[y][x]) continue;
      blocked[y][x] = true;
    }
  }

  // ---- walk-off edges to neighbouring districts ----
  const edgePrompt: Record<Cardinal, string> = {
    north: "Keep walking north",
    south: "Keep walking south",
    east: "Keep walking east",
    west: "Keep walking west",
  };
  const arrow: Record<Cardinal, string> = { north: "↑", south: "↓", east: "→", west: "←" };
  (Object.keys(def.exits ?? {}) as Cardinal[]).forEach((dir) => {
    const dest = def.exits![dir];
    if (!dest) return;
    const axis = gapAxis(dir);
    const midX = centerPx(axis);
    const midY = (axis + 1) * TILE;
    const spots =
      dir === "north"
        ? [{ x: midX, y: TILE * 2 }]
        : dir === "south"
          ? [{ x: midX, y: (h - 2) * TILE }]
          : dir === "west"
            ? [{ x: TILE * 2, y: midY }]
            : [{ x: (w - 2) * TILE + TILE / 2, y: midY }];
    for (const s of spots) {
      zones.push({
        x: s.x,
        y: s.y,
        radius: 36,
        action: "exit",
        prompt: `${edgePrompt[dir]}`,
        data: { to: dest, from: opposite[dir] },
      });
      labels.push({ x: s.x, y: s.y - 8, text: `${arrow[dir]} ${getLocation(dest).name}`, big: true });
    }
  });

  // ---- collectible flowers near spawn (on walkable, non-water tiles) ----
  let placed = 0;
  for (let ring = 2; ring < 14 && placed < 8; ring++) {
    for (let a = 0; a < 8 && placed < 8; a++) {
      const tx = Phaser.Math.Clamp(city.spawn.tx + Math.round(Math.cos((a / 8) * Math.PI * 2) * ring), 2, w - 3);
      const ty = Phaser.Math.Clamp(city.spawn.ty + Math.round(Math.sin((a / 8) * Math.PI * 2) * ring), 2, h - 3);
      if (blocked[ty][tx] || ground[ty][tx] === "t_water" || ground[ty][tx] === city.road) continue;
      const id = `${def.id}_flower_${tx}_${ty}`;
      collectibles.push({ id, tex: placed % 2 ? "o_flower_yellow" : "o_flower_pink", x: centerPx(tx), y: (ty + 1) * TILE, tag: "flower" });
      placed++;
    }
  }

  // Authored (dense) maps place their own trees. Sparse maps get a little scatter.
  if (!city.dense) {
    const scatterTex = city.border === "rock" ? "o_rock" : city.border === "pine" ? "o_pine" : "o_bush";
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (blocked[y][x] || walk[y][x] || ground[y][x] === city.road || ground[y][x] === "t_water") continue;
        const r = hash(x, y, seed + 99);
        if (r > 0.955) {
          props.push({ tex: r > 0.98 ? "o_tree" : scatterTex, x: centerPx(x), y: (y + 1) * TILE });
          blocked[y][x] = true;
        } else if (r > 0.9 && r <= 0.915) {
          props.push({ tex: hash(x, y, seed + 7) > 0.5 ? "o_flower_pink" : "o_flower_yellow", x: centerPx(x), y: (y + 1) * TILE, originY: 0.8 });
        }
      }
    }
  }

  return {
    w,
    h,
    ground,
    blocked,
    props,
    zones,
    collectibles,
    labels,
    npcSpots,
    spawn: { x: centerPx(city.spawn.tx), y: (city.spawn.ty + 1) * TILE },
  };
}

export function generateWorld(scene: Phaser.Scene, def: LocationDef): WorldData {
  const city = def.city ?? proceduralCity(def);
  return layoutCity(scene, def, city);
}

/** Merge a blocked grid into a small set of rectangles for arcade static bodies. */
export function blockedToRects(blocked: boolean[][]) {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const h = blocked.length;
  const w = blocked[0].length;
  const used = blocked.map((row) => row.map(() => false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!blocked[y][x] || used[y][x]) continue;
      let x2 = x;
      while (x2 + 1 < w && blocked[y][x2 + 1] && !used[y][x2 + 1]) x2++;
      for (let xx = x; xx <= x2; xx++) used[y][xx] = true;
      rects.push({ x: x * TILE, y: y * TILE, w: (x2 - x + 1) * TILE, h: TILE });
    }
  }
  return rects;
}
