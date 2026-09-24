// Art-direction pass: extra cottages along the streets, lamps, benches,
// fences, planters, café terrace, stone walls on the village edge, trees,
// bushes, flowers and heather. Deterministic (hash-seeded) and never blocks
// a tile that gameplay reserved or a road/path tile.

import type { CityDef, PathSpec } from "../../game/data/locations";
import type { ThinPlacement } from "../assets/AssetManager";
import { hash01 } from "../assets/kit/util";
import type { BuildContext, BuiltWorld, PlacedBuilding } from "./worldBuilder";
import { buildingVariant, type BuildingSpec } from "./propMap";
import { isRoadTex, tileKey } from "./worldBuilder";

const MAX_EXTRA_BUILDINGS = 120;
const GREENS = ["#6b8a4e", "#7a9a56", "#5f8048", "#8aa262"];
const FLOWERS = ["#d49a9a", "#e6c96a", "#b59bd1", "#f4efe0"];

export function dressWorld(ctx: BuildContext, built: BuiltWorld) {
  const { collider, env, def } = ctx;
  const { world, reserved, placer, buildings } = built;
  const seed = def.id.length * 17;
  const city = def.city;

  const inB = (tx: number, ty: number) => tx > 1 && ty > 1 && tx < world.w - 2 && ty < world.h - 2;
  const tex = (tx: number, ty: number) => world.ground[ty]?.[tx] ?? "";
  const road = (tx: number, ty: number) => isRoadTex(tex(tx, ty));
  // "road" = any surface the 2D layout uses for streets/walkways (never built on);
  // "street" = the driveable/path core only (lamps, planters etc. may sit on plazas)
  const STREET = new Set(["t_path", "t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_brick_path"]);
  const street = (tx: number, ty: number) => STREET.has(tex(tx, ty));
  const open = (tx: number, ty: number) => inB(tx, ty) && !collider.isBlockedTile(tx, ty) && !reserved.has(tileKey(tx, ty));
  const free = (tx: number, ty: number) => open(tx, ty) && !street(tx, ty);
  const freeBuild = (tx: number, ty: number) => open(tx, ty) && !road(tx, ty);
  const grass = (tx: number, ty: number) => tex(tx, ty).startsWith("t_grass") || tex(tx, ty) === "t_snow" || tex(tx, ty) === "t_lawn";
  const water = (tx: number, ty: number) => tex(tx, ty) === "t_water";
  const ringFree = (x0: number, y0: number, w: number, h: number, pred = free) => {
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (!pred(x, y)) return false;
    return true;
  };
  const claim = (tx: number, ty: number) => collider.block(tx, ty, 1, 1);
  const thin = (key: string, variant: string, p: ThinPlacement) => {
    placer.add(key, variant, p);
    if (key === "lamp-post") built.lamps.push({ x: p.x, y: p.y ?? 0, z: p.z });
  };
  const centre = (tx: number, ty: number) => ({ x: tx + 0.5, z: -(ty + 0.5), y: env.heightAt(tx, ty) });

  // ------------------------------------------------------------------ streets
  interface Seg {
    horizontal: boolean;
    at: number; // the row (horizontal) or column (vertical) of the centre line
    from: number;
    to: number;
    half: number;
  }
  const segs: Seg[] = [];
  const addPath = (p: PathSpec) => {
    if (p.kind !== "road" && p.kind !== "street" && p.kind !== "promenade") return;
    for (let i = 0; i + 1 < p.points.length; i++) {
      const a = p.points[i];
      const b = p.points[i + 1];
      const half = Math.floor(p.width / 2);
      if (a.y === b.y) segs.push({ horizontal: true, at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x), half });
      else if (a.x === b.x) segs.push({ horizontal: false, at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y), half });
    }
  };
  for (const p of (city as CityDef | undefined)?.paths ?? []) addPath(p);
  for (const r of city?.roads ?? []) {
    if (r.w >= r.h) segs.push({ horizontal: true, at: r.y + Math.floor(r.h / 2), from: r.x, to: r.x + r.w, half: Math.floor(r.h / 2) });
    else segs.push({ horizontal: false, at: r.x + Math.floor(r.w / 2), from: r.y, to: r.y + r.h, half: Math.floor(r.w / 2) });
  }

  // quiet inner lanes through the district bands (no road tiles, just cobble)
  for (const d of city?.districts ?? []) {
    for (let y = d.y + 9; y < d.y + d.h - 6; y += 13) segs.push({ horizontal: true, at: y, from: d.x + 2, to: d.x + d.w - 2, half: 1 });
  }

  // ---------------------------------------------------------- extra cottages
  let extra = 0;
  // a small preset table keeps the number of prototypes low so instances batch
  const PRESETS: Omit<BuildingSpec, "w" | "d">[] = [
    { kind: "cottage", style: "cream", roof: "terra", storeys: 1 },
    { kind: "cottage", style: "cream", roof: "terra", storeys: 2 },
    { kind: "cottage", style: "grey", roof: "slate", storeys: 2 },
    { kind: "cottage", style: "rose", roof: "terra", storeys: 2 },
    { kind: "cottage", style: "stucco", roof: "orange", storeys: 1 },
    { kind: "cottage", style: "sand", roof: "slate", storeys: 2 },
    { kind: "shop", style: "cream", roof: "orange", storeys: 2 },
    { kind: "cottage", style: "grey", roof: "slate", storeys: 1 },
  ];
  const placeExtra = (x0: number, y0: number, wT: number, hT: number, rot: number, r: number) => {
    if (extra >= MAX_EXTRA_BUILDINGS || !ringFree(x0, y0, wT, hT, freeBuild)) return false;
    const rotated = Math.abs(Math.abs(rot) - Math.PI / 2) < 0.01;
    const spec: BuildingSpec = {
      w: rotated ? hT : wT,
      d: rotated ? wT : hT,
      ...PRESETS[Math.floor(r * 1000) % PRESETS.length],
    };
    for (let y = y0; y < y0 + hT; y++) for (let x = x0; x < x0 + wT; x++) claim(x, y);
    const cx = x0 + wT / 2;
    const cz = -(y0 + hT) + hT / 2;
    thin("building", buildingVariant(spec), { x: cx, y: env.heightAt(x0, y0), z: cz, rotationY: rot });
    buildings.push({ tex: "extra", tx: cx, ty: y0 + hT - 1, w: wT, d: hT, rotationY: rot, kind: spec.kind });
    extra++;
    return true;
  };
  for (const s of segs) {
    for (const side of [-1, 1]) {
      let pos = s.from + 3;
      let n = 0;
      while (pos < s.to - 4) {
        const r = hash01(seed, s.at, pos, side);
        const wT = r > 0.5 ? 4 : 3;
        const dT = 3;
        const gap = s.half + 2; // road half-width + sidewalk
        if (s.horizontal) {
          const y0 = side < 0 ? s.at - gap - dT + 1 : s.at + gap;
          placeExtra(pos, y0, wT, dT, side < 0 ? 0 : Math.PI, r);
        } else {
          const x0 = side < 0 ? s.at - gap - dT + 1 : s.at + gap;
          placeExtra(x0, pos, dT, wT, side < 0 ? -Math.PI / 2 : Math.PI / 2, r);
        }
        pos += wT + 1 + Math.floor(hash01(seed, pos, 3) * 3);
        n++;
      }
    }
  }

  // ---------------------------------------- lamps + benches along the streets
  for (const s of segs) {
    for (let pos = s.from + 2; pos < s.to - 1; pos += 7) {
      const side = ((pos / 7) | 0) % 2 ? 1 : -1;
      const off = s.half + 1;
      const tx = s.horizontal ? pos : s.at + side * off;
      const ty = s.horizontal ? s.at + side * off : pos;
      if (free(tx, ty)) {
        claim(tx, ty);
        thin("lamp-post", "", { ...centre(tx, ty) });
      }
      // a bench a little further along, on the opposite side, facing the road
      const bx = s.horizontal ? pos + 3 : s.at - side * off;
      const by = s.horizontal ? s.at - side * off : pos + 3;
      if (hash01(seed, bx, by) > 0.55 && free(bx, by)) {
        claim(bx, by);
        const rot = s.horizontal ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2;
        thin("bench", "", { ...centre(bx, by), rotationY: rot });
      }
    }
  }

  // ---------------------------------------------- per-building front dressing
  const local = (b: PlacedBuilding, lx: number, lz: number) => {
    const cx = b.tx;
    const cz = -(b.ty + 1) + b.d / 2;
    const c = Math.cos(b.rotationY);
    const s = Math.sin(b.rotationY);
    return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
  };
  const tileOf = (x: number, z: number) => ({ tx: Math.floor(x), ty: Math.floor(-z) });
  for (const b of buildings) {
    if (b.kind === "castle") continue;
    const hw = (Math.abs(Math.abs(b.rotationY) - Math.PI / 2) < 0.01 ? b.d : b.w) / 2;
    const hd = (Math.abs(Math.abs(b.rotationY) - Math.PI / 2) < 0.01 ? b.w : b.d) / 2;
    const r = hash01(seed, b.tx, b.ty);
    // flower clusters at the front corners
    for (const sx of [-1, 1]) {
      const p = local(b, sx * (hw - 0.45), -hd - 0.45);
      const t = tileOf(p.x, p.z);
      if (free(t.tx, t.ty)) thin("flower-cluster", `c=${FLOWERS[Math.floor(hash01(seed, b.tx, sx) * 4)]}`, { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty), rotationY: r * 6, scale: 0.9 });
    }
    // planter by the door, fence pieces along the front on one side
    if (b.kind === "cottage" || b.kind === "tenement") {
      const p = local(b, 0.85, -hd - 0.3);
      const t = tileOf(p.x, p.z);
      if (free(t.tx, t.ty)) thin("planter", "", { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty) });
      if (r > 0.4) {
        const side = r > 0.7 ? 1 : -1;
        for (let i = 1; i <= Math.floor(hw - 0.6); i++) {
          const f = local(b, side * (i + 0.15), -hd - 0.65);
          const ft = tileOf(f.x, f.z);
          if (free(ft.tx, ft.ty)) thin("wooden-fence", "", { x: f.x, z: f.z, y: env.heightAt(ft.tx, ft.ty), rotationY: b.rotationY });
        }
      }
    }
    if (b.kind === "cafe") {
      // terrace: two tables with chairs + a chalkboard
      for (const sx of [-1.7, 1.7]) {
        const tp = local(b, sx, -hd - 1.2);
        const tt = tileOf(tp.x, tp.z);
        if (!free(tt.tx, tt.ty)) continue;
        claim(tt.tx, tt.ty);
        thin("cafe-table", "", { x: tp.x, z: tp.z, y: env.heightAt(tt.tx, tt.ty) });
        for (const [cx2, cz2, rot] of [
          [-0.55, 0, Math.PI / 2],
          [0.55, 0, -Math.PI / 2],
        ]) {
          const cp = local(b, sx + cx2, -hd - 1.1 + cz2);
          thin("cafe-chair", "", { x: cp.x, z: cp.z, y: env.heightAt(tt.tx, tt.ty), rotationY: b.rotationY + rot });
        }
      }
      const bp = local(b, -0.75, -hd - 0.35);
      thin("chalkboard", "", { x: bp.x, z: bp.z, y: env.heightAt(Math.floor(bp.x), Math.floor(-bp.z)), rotationY: b.rotationY + 0.3 });
      const pp = local(b, hw - 0.4, -hd - 0.35);
      thin("planter", "", { x: pp.x, z: pp.z, y: env.heightAt(Math.floor(pp.x), Math.floor(-pp.z)) });
    }
    if (b.kind === "shop") {
      const pp = local(b, -(hw - 0.4), -hd - 0.35);
      thin("planter", "", { x: pp.x, z: pp.z, y: env.heightAt(Math.floor(pp.x), Math.floor(-pp.z)) });
    }
  }

  // ------------------------------------------ dry-stone walls on the village edge
  for (let ty = 2; ty < world.h - 2; ty++) {
    for (let tx = 2; tx < world.w - 2; tx++) {
      if (!grass(tx, ty) || !free(tx, ty)) continue;
      const cobbleN = tex(tx, ty - 1) === "t_cobble";
      const cobbleS = tex(tx, ty + 1) === "t_cobble";
      const cobbleE = tex(tx + 1, ty) === "t_cobble";
      const cobbleW = tex(tx - 1, ty) === "t_cobble";
      if (!(cobbleN || cobbleS || cobbleE || cobbleW)) continue;
      // keep road gaps open (2 tiles clearance)
      let nearRoad = false;
      for (let y = ty - 2; y <= ty + 2 && !nearRoad; y++) for (let x = tx - 2; x <= tx + 2; x++) if (road(x, y)) nearRoad = true;
      if (nearRoad) continue;
      if (hash01(seed, tx, ty, 4) > 0.93) continue; // the odd tumbled gap
      claim(tx, ty);
      const c = centre(tx, ty);
      const rot = cobbleN || cobbleS ? 0 : Math.PI / 2;
      thin("stone-wall", "", { x: c.x, z: c.z + (cobbleN ? 0.35 : cobbleS ? -0.35 : 0), y: c.y, rotationY: rot });
      if (rot === Math.PI / 2) {
        // re-place along the vertical edge
      }
    }
  }

  // ---------------------------------------------------- scatter: trees & plants
  for (let ty = 2; ty < world.h - 2; ty++) {
    for (let tx = 2; tx < world.w - 2; tx++) {
      if (!free(tx, ty) || water(tx, ty)) continue;
      const r = hash01(seed, tx, ty, 1);
      const g = grass(tx, ty);
      const c = centre(tx, ty);
      const rot = hash01(seed, tx, ty, 2) * Math.PI * 2;
      if (g) {
        if (r > 0.965 && ringFree(tx, ty, 1, 1)) {
          claim(tx, ty);
          thin("tree-a", `c=${GREENS[Math.floor(r * 400) % 4]}`, { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 3) * 0.4 });
        } else if (r > 0.94) {
          claim(tx, ty);
          thin("bush", hash01(seed, tx, ty, 5) > 0.6 ? "flowers=1" : "", { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 6) * 0.4 });
        } else if (r > 0.915) {
          thin("heather", "", { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 7) * 0.5 });
        } else if (r > 0.885) {
          thin("flower-cluster", `c=${FLOWERS[Math.floor(r * 300) % 4]}`, { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 8) * 0.4 });
        } else if (r > 0.83) {
          thin("grass-tuft", "", { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 9) * 0.6 });
        }
      } else if (tex(tx, ty) === "t_pavement" || tex(tx, ty) === "t_plaza_stone" || tex(tx, ty) === "t_paving_light") {
        // plazas: planters and flowers, sparse, never blocking
        if (r > 0.985) thin("planter", "", { ...c, rotationY: rot });
        else if (r > 0.975) thin("flower-cluster", `c=${FLOWERS[Math.floor(r * 300) % 4]}`, { ...c, rotationY: rot, scale: 0.8 });
      } else if (tex(tx, ty) === "t_cobble") {
        // the odd tree / planter / bush inside the village so squares don't feel empty
        if (r > 0.988 && ringFree(tx, ty, 1, 1)) {
          claim(tx, ty);
          thin("tree-a", `c=${GREENS[Math.floor(r * 400) % 4]}`, { ...c, rotationY: rot, scale: 0.85 + hash01(seed, tx, ty, 3) * 0.3 });
        } else if (r > 0.98) {
          claim(tx, ty);
          thin("planter", "", { ...c, rotationY: rot });
        } else if (r > 0.974) {
          thin("flower-cluster", `c=${FLOWERS[Math.floor(r * 300) % 4]}`, { ...c, rotationY: rot, scale: 0.8 });
        }
      }
    }
  }

  // ------------------------------------------------ location-specific set pieces
  const set = (key: string, tx: number, ty: number, rot = 0, variant = "", scale = 1, block = true) => {
    if (!free(tx, ty)) return;
    if (block) claim(tx, ty);
    thin(key, variant, { ...centre(tx, ty), rotationY: rot, scale });
  };
  if (def.id === "edinburgh_oldtown") {
    set("signpost", 97, 49, 0.5);
    set("phone-box", 96, 43, 0);
    set("post-box", 98, 43, 0);
    set("bench", 99, 43, Math.PI);
    set("tree-a", 104, 43, 0.3, "c=#6b8a4e", 1.15);
    set("tree-a", 105, 53, 1.2, "c=#7a9a56", 1.05);
    set("tree-a", 96, 55, 2.1, "c=#5f8048", 1.2);
    set("bush", 103, 52, 0.2, "flowers=1");
    set("bush", 97, 52, 1.0, "flowers=1");
    set("heather", 104, 51, 0, "", 1.1, false);
    set("heather", 99, 54, 0, "", 1.0, false);
    set("lamp-post", 98, 44, 0);
    set("lamp-post", 98, 51, 0);
    set("lamp-post", 104, 51, 0);
    set("stone-wall", 100, 41, 0);
    set("stone-wall", 101, 41, 0);
    set("stone-wall", 102, 41, 0);
    set("stone-wall", 103, 41, 0);
    set("stone-wall", 100, 56, 0);
    set("stone-wall", 101, 56, 0);
    set("stone-wall", 102, 56, 0);
    set("stone-wall", 103, 56, 0);
    set("well", 60, 40, 0, "", 1, true);
    // a fountain square on the pavement plaza west of the Royal Mile
    if (ringFree(36, 51, 2, 2)) {
      for (let y = 51; y < 53; y++) for (let x = 36; x < 38; x++) claim(x, y);
      thin("fountain", "", { x: 37, z: -52, y: env.heightAt(37, 52) });
      set("bench", 34, 52, -Math.PI / 2);
      set("bench", 39, 52, Math.PI / 2);
      set("bench", 36, 49, 0);
      set("planter", 39, 49);
      set("planter", 34, 49);
      set("tree-a", 41, 55, 0.4, "c=#6b8a4e", 1.1);
      set("tree-a", 25, 47, 1.3, "c=#7a9a56", 1.0);
    }
  }
  return extra;
}
