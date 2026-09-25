// Art-direction pass: extra cottages along the streets, lamps, benches,
// fences, planters, café terrace, stone walls on the village edge, trees,
// bushes, flowers and heather. Deterministic (hash-seeded) and never blocks
// a tile that gameplay reserved or a road/path tile.
//
// Placement is key-based: hero asset keys registered by the AssetManager
// ('tree-oak-a', 'barrel', 'fence-gate', …) are used when present and fall
// back to the procedural kit otherwise, so this runs before and after the
// GLB pieces land.

import type { CityDef, PathSpec } from "../../game/data/locations";
import type { ThinPlacement } from "../assets/AssetManager";
import { hash01 } from "../assets/kit/util";
import { presetVariant } from "../assets/kit/architecture";
import type { BuildContext, BuiltWorld, PlacedBuilding } from "./worldBuilder";
import { isRoadTex, tileKey } from "./worldBuilder";

const MAX_EXTRA_BUILDINGS = 120;
const GREENS = ["#6b8a4e", "#7a9a56", "#5f8048", "#8aa262"];
const PINES = ["#5f7f4a", "#557344", "#6a8a52"];
/** dusty pink / cream / soft yellow / lavender / muted purple */
const FLOWERS = ["#d9a3a3", "#f1e7d0", "#e3cf86", "#bfa8d6", "#9b7fb0"];

/** Street-side cottage presets (name, footprint width in tiles); each is one thin-instance batch. */
const EXTRA_PRESETS: [string, number][] = [
  ["creamTerra", 4],
  ["stoneCrow", 4],
  ["greyDormer", 3],
  ["creamCrow2", 4],
  ["greyMoss", 3],
  ["sandDormer2", 4],
  ["rose2", 3],
  ["bothy", 3],
  ["whiteSlate", 4],
  ["shop", 4],
  ["creamTerra", 3],
  ["greyDormer", 4],
];

export function dressWorld(ctx: BuildContext, built: BuiltWorld) {
  const { collider, env, def, am } = ctx;
  const { world, reserved, placer, buildings } = built;
  const seed = def.id.length * 17;
  const city = def.city;

  // ---------------------------------------------------------------- asset keys
  // (hero keys from the AssetManager when registered, procedural fallbacks otherwise)
  const key = (want: string, fallback: string) => (am.has(want) ? want : fallback);
  const K = {
    oakA: key("tree-oak-a", "tree-a"),
    oakB: key("tree-oak-b", "tree-a"),
    small: key("tree-small", "tree-a"),
    pine: key("tree-pine", "tree-b"),
    bushA: key("bush-a", "bush"),
    bushB: key("bush-b", "bush"),
    bench: key("bench", "bench"),
    lamp: key("lamp-post", "lamp-post"),
    signpost: key("signpost", "signpost"),
    wall: key("stone-wall", "stone-wall"),
    fence: key("fence", "wooden-fence"),
    gate: key("fence-gate", "wooden-fence"),
    planter: key("planter", "planter"),
    postBox: key("post-box", "post-box"),
    table: key("cafe-table", "cafe-table"),
    chair: key("cafe-chair", "cafe-chair"),
    ivy: key("ivy-card", "ivy-card"),
    barrel: key("barrel", "crate"),
    crate: key("crate", "crate"),
  };
  const isFallback = (k: keyof typeof K, want: string) => K[k] !== want;
  // variants only the procedural fallbacks understand
  const oakVariant = (i: number) => (isFallback("oakA", "tree-oak-a") ? `c=${GREENS[i % GREENS.length]}` : "");
  const pineVariant = (i: number) => (isFallback("pine", "tree-pine") ? `c=${PINES[i % PINES.length]}` : "");
  const bushVariant = (flowers: boolean) => (isFallback("bushA", "bush-a") && flowers ? "flowers=1" : "");
  const barrelScale = isFallback("barrel", "barrel") ? 0.55 : 1;
  const smallScale = isFallback("small", "tree-small") ? 0.62 : 1;

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
  const thin = (k: string, variant: string, p: ThinPlacement) => {
    placer.add(k, variant, p);
    if (k === K.lamp) built.lamps.push({ x: p.x, y: p.y ?? 0, z: p.z });
  };
  const centre = (tx: number, ty: number) => ({ x: tx + 0.5, z: -(ty + 0.5), y: env.heightAt(tx, ty) });
  /** place at a tile centre (+ unit offsets); blocks the tile unless block=false */
  const set = (k: string, tx: number, ty: number, rot = 0, variant = "", scale = 1, block = true, dx = 0, dz = 0) => {
    if (!free(tx, ty)) return false;
    if (block) claim(tx, ty);
    const c = centre(tx, ty);
    thin(k, variant, { x: c.x + dx, z: c.z + dz, y: c.y, rotationY: rot, scale });
    return true;
  };
  /** a loose drift of flowers / heather / tufts on a tile, never blocking */
  const drift = (tx: number, ty: number, n: number, salt: number) => {
    if (!free(tx, ty) || !grass(tx, ty)) return;
    const c = centre(tx, ty);
    for (let i = 0; i < n; i++) {
      const r = hash01(seed, tx, ty, salt, i);
      const ox = (hash01(seed, tx, i, salt + 1) - 0.5) * 0.8;
      const oz = (hash01(seed, ty, i, salt + 2) - 0.5) * 0.8;
      const rot = r * Math.PI * 2;
      if (r < 0.62) thin("flower-cluster", `c=${FLOWERS[Math.floor(r * 100) % FLOWERS.length]}`, { x: c.x + ox, z: c.z + oz, y: c.y, rotationY: rot, scale: 0.6 + r * 0.45 });
      else if (r < 0.82) thin("heather", "", { x: c.x + ox, z: c.z + oz, y: c.y, rotationY: rot, scale: 0.7 + r * 0.4 });
      else thin("grass-tuft", "", { x: c.x + ox, z: c.z + oz, y: c.y, rotationY: rot, scale: 0.9 + r * 0.5 });
    }
  };

  /**
   * A dense low flower bed along one tile (a leafy mound + a few clusters),
   * pushed toward a wall/façade by (dx, dz). Never blocks.
   */
  const bed = (tx: number, ty: number, dz: number, dx: number, salt: number, scale = 1) => {
    if (!open(tx, ty)) return;
    const c = centre(tx, ty);
    const r = hash01(seed, tx, ty, salt);
    thin("flower-bed", `c=${FLOWERS[Math.floor(r * 97) % FLOWERS.length]},d=${FLOWERS[Math.floor(r * 53 + 2) % FLOWERS.length]}`, { x: c.x + dx, z: c.z + dz, y: c.y, rotationY: r > 0.5 ? 0 : Math.PI, scale: scale * (0.9 + r * 0.2) });
    if (r > 0.55) thin("grass-tuft", "", { x: c.x + dx + (r - 0.75) * 1.6, z: c.z + dz * 0.7, y: c.y, rotationY: r * 9, scale: 1.1 });
  };

  // ------------------------------------------------------------------ buildings
  let extra = 0;
  const placeBuilding = (x0: number, y0: number, wT: number, hT: number, rot: number, preset: string, kind: string, salt: number) => {
    if (!ringFree(x0, y0, wT, hT, freeBuild)) return false;
    const rotated = Math.abs(Math.abs(rot) - Math.PI / 2) < 0.01;
    const w = rotated ? hT : wT;
    const d = rotated ? wT : hT;
    for (let y = y0; y < y0 + hT; y++) for (let x = x0; x < x0 + wT; x++) claim(x, y);
    const cx = x0 + wT / 2;
    const cz = -(y0 + hT) + hT / 2;
    // per-instance variation so identical presets don't read as clones
    const jitter = (hash01(seed, x0, y0, salt) - 0.5) * 0.04;
    const scale = 0.97 + hash01(seed, y0, x0, salt + 1) * 0.06;
    thin("building", presetVariant(preset, w, d), { x: cx, y: env.heightAt(x0, y0), z: cz, rotationY: rot + jitter, scale });
    buildings.push({ tex: "extra", tx: cx, ty: y0 + hT - 1, w: wT, d: hT, rotationY: rot, kind });
    return true;
  };

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

  // ------------------------------------------- benchmark: east end of the Royal Mile
  // Spawn is (100,48); the Mile runs rows 45-47 with cobble sidewalks on 43-44 and
  // 48-49; east of x=98 the village gives way to grass. Placed first so it wins.
  if (def.id === "edinburgh_oldtown") {
    // hero cottage pair north of the Mile, doors onto the sidewalk (row 44)
    placeBuilding(94, 41, 4, 3, 0, "stoneCrow", "hero", 1);
    placeBuilding(100, 41, 4, 3, 0, "greyDormer", "hero", 2);
    placeBuilding(89, 41, 4, 3, 0, "whiteSlate", "hero", 3);
    // between them: the red phone box; post box + signpost on the south side
    set("phone-box", 98, 42, 0);
    set(K.signpost, 97, 49, 0.5);
    set(K.postBox, 96, 49, 0);
    // a little green corner by the fingerpost so the west sidewalk isn't bare stone
    set(K.bushB, 94, 50, 0.9, bushVariant(true), 0.8);
    set(K.planter, 95, 50, 0.1, "", 0.85, false, 0.1, -0.15);
    bed(93, 50, -0.3, 0, 90);
    // sidewalk life in front of the cottages
    set(K.bench, 99, 44, 0);
    set(K.barrel, 97, 44, 0.3, "", barrelScale, true, 0.25, 0.1);
    set(K.crate, 93, 44, 0.2, "", 0.7, true, -0.2, 0.15);
    set(K.crate, 103, 44, 0.9, "", 0.55, false, 0.3, 0.2);
    set(K.barrel, 103, 44, 0, "", barrelScale * 0.9, true, -0.25, 0.05);
    set(K.planter, 101, 44, 0, "", 0.9, false, 0.35, 0.25);
    set(K.lamp, 98, 44, 0);
    set(K.lamp, 104, 44, 0);
    // ivy cards leaning on cottage corners
    set(K.ivy, 89, 44, 0, "", 1, false, -0.1, 0.4);
    set(K.ivy, 103, 44, 0, "", 0.9, false, 0.05, 0.42);
    // trees on the grass beyond the east cottage
    set(K.oakA, 106, 42, 0.3, oakVariant(0), 1.15);
    set(K.pine, 108, 44, 1.1, pineVariant(1), 1.0);
    set(K.small, 105, 41, 2.2, oakVariant(2), smallScale);
    set(K.bushA, 105, 44, 0.4, bushVariant(true), 0.9);
    // dry-stone wall along the grass edge (row 51, hugging the sidewalk) with a
    // gate opposite spawn and low return walls; it replaces the auto edge wall
    // so the two never double up
    for (let x = 98; x <= 106; x++) {
      if (x === 101) {
        set(K.gate, x, 51, 0, "", 1, false, 0, 0.3);
        continue;
      }
      set(K.wall, x, 51, 0, "", 1, true, 0, 0.3);
    }
    for (let y = 52; y <= 54; y++) set(K.wall, 98, y, Math.PI / 2, "", 1, true, -0.3);
    for (let y = 52; y <= 54; y++) set(K.wall, 107, y, Math.PI / 2, "", 1, true, 0.3);
    // cottage garden south of the wall: a low cream cottage facing the street
    placeBuilding(102, 54, 4, 3, Math.PI, "creamTerra", "hero", 4);
    set(K.bench, 99, 54, Math.PI);
    set(K.small, 100, 56, 0.8, oakVariant(1), smallScale);
    set(K.oakB, 108, 54, 1.4, oakVariant(3), 1.1);
    set(K.pine, 96, 56, 2.0, pineVariant(2), 1.05);
    set(K.pine, 96, 42, 0.6, pineVariant(0), 0.9);
    set(K.barrel, 105, 53, 0.4, "", barrelScale, true, 0.3, -0.2);
    set(K.crate, 106, 53, 0.1, "", 0.5, false, -0.2, 0.2);
    set(K.planter, 100, 52, 0, "", 0.85, false, -0.3, -0.1);
    set(K.planter, 102, 52, 0, "", 0.85, false, 0.3, -0.1);
    set(K.bushB, 99, 53, 0.5, bushVariant(true), 0.85);
    set(K.bushA, 106, 56, 1.2, bushVariant(false), 0.9);
    // flower beds hugging the wall on both sides, the cottage fronts and the lamp feet
    // (dense low beds read as a garden; lone clusters on bare stone read as lollipops)
    for (let x = 98; x <= 106; x++) if (x !== 101) bed(x, 50, 0.36, 0, 60 + x);
    for (let x = 99; x <= 106; x++) if (x !== 101) bed(x, 52, -0.2, 0, 70 + x);
    for (const x of [92, 93, 95, 96, 100, 101, 102, 103]) bed(x, 44, -0.36, 0, 80 + x, 0.8);
    for (let x = 99; x <= 106; x++) for (let y = 53; y <= 57; y++) if (hash01(seed, x, y, 8) > 0.35) drift(x, y, 1 + Math.floor(hash01(seed, x, y, 9) * 2), 20);
    for (let x = 105; x <= 108; x++) for (let y = 41; y <= 44; y++) if (hash01(seed, x, y, 7) > 0.5) drift(x, y, 1, 30);
    set(K.lamp, 98, 50, 0);
    set(K.lamp, 104, 50, 0);
    set(K.bench, 103, 50, Math.PI);
  }

  // ---------------------------------------------------------- extra cottages
  for (const s of segs) {
    for (const side of [-1, 1]) {
      let pos = s.from + 3;
      while (pos < s.to - 4 && extra < MAX_EXTRA_BUILDINGS) {
        const r = hash01(seed, s.at, pos, side);
        const [preset, wT] = EXTRA_PRESETS[Math.floor(r * 1000) % EXTRA_PRESETS.length];
        const dT = 3;
        const gap = s.half + 2; // road half-width + sidewalk
        let ok = false;
        if (s.horizontal) {
          const y0 = side < 0 ? s.at - gap - dT + 1 : s.at + gap;
          ok = placeBuilding(pos, y0, wT, dT, side < 0 ? 0 : Math.PI, preset, preset.startsWith("shop") ? "shop" : "cottage", 5);
        } else {
          const x0 = side < 0 ? s.at - gap - dT + 1 : s.at + gap;
          ok = placeBuilding(x0, pos, dT, wT, side < 0 ? -Math.PI / 2 : Math.PI / 2, preset, preset.startsWith("shop") ? "shop" : "cottage", 5);
        }
        if (ok) extra++;
        pos += wT + 1 + Math.floor(hash01(seed, pos, 3) * 3);
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
        thin(K.lamp, "", { ...centre(tx, ty) });
      }
      // a bench a little further along, on the opposite side, facing the road
      const bx = s.horizontal ? pos + 3 : s.at - side * off;
      const by = s.horizontal ? s.at - side * off : pos + 3;
      if (hash01(seed, bx, by) > 0.55 && free(bx, by)) {
        claim(bx, by);
        const rot = s.horizontal ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2;
        thin(K.bench, "", { ...centre(bx, by), rotationY: rot });
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
  /** place a piece at building-local coordinates if that tile is free */
  const at = (b: PlacedBuilding, k: string, lx: number, lz: number, rot = 0, variant = "", scale = 1, block = false) => {
    const p = local(b, lx, lz);
    const t = tileOf(p.x, p.z);
    if (!free(t.tx, t.ty)) return false;
    if (block) claim(t.tx, t.ty);
    thin(k, variant, { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty), rotationY: b.rotationY + rot, scale });
    return true;
  };
  for (const b of buildings) {
    if (b.kind === "castle") continue;
    const rotated = Math.abs(Math.abs(b.rotationY) - Math.PI / 2) < 0.01;
    const hw = (rotated ? b.d : b.w) / 2;
    const hd = (rotated ? b.w : b.d) / 2;
    const r = hash01(seed, b.tx, b.ty);
    const front = -hd - 0.3; // just outside the wall (walls are inset 0.22)
    // flower clusters at the front corners
    for (const sx of [-1, 1]) {
      const p = local(b, sx * (hw - 0.45), -hd - 0.45);
      const t = tileOf(p.x, p.z);
      if (free(t.tx, t.ty)) thin("flower-cluster", `c=${FLOWERS[Math.floor(hash01(seed, b.tx, sx) * FLOWERS.length)]}`, { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty), rotationY: r * 6, scale: 0.75 + r * 0.3 });
    }
    if (b.kind === "cottage" || b.kind === "tenement" || b.kind === "hero") {
      // door-side clutter: a planter, sometimes a barrel or crate, the odd ivy card
      const side = r > 0.5 ? 1 : -1;
      if (r > 0.25) at(b, K.planter, side * 0.85, front, 0, "", 0.85 + r * 0.2);
      if (b.kind !== "hero" && hash01(seed, b.tx, 2) > 0.6) at(b, hash01(seed, b.ty, 3) > 0.5 ? K.barrel : K.crate, -side * (hw - 0.55), front - 0.05, r * 0.6, "", (hash01(seed, b.ty, 3) > 0.5 ? barrelScale : 0.6) * (0.9 + r * 0.2));
      if (b.kind !== "hero" && hash01(seed, b.tx, b.ty, 4) > 0.72) at(b, K.ivy, -side * (hw - 0.5), -hd + 0.1, 0, "", 0.8 + r * 0.4);
      if (b.kind === "cottage" && r > 0.45) {
        // a run of low fence along one side of the front
        const fside = r > 0.72 ? 1 : -1;
        for (let i = 1; i <= Math.floor(hw - 0.6); i++) at(b, K.fence, fside * (i + 0.15), -hd - 0.65, 0, "", 1);
      }
    }
    if (b.kind === "cafe") {
      // terrace in FRONT of the café, under / just past the awning, the door
      // lane (local x 0) kept clear: two tables flanking the door, two more a
      // step further out, chairs facing each other across each table
      for (const [tx0, tz0] of [
        [-1.3, front - 0.4],
        [1.35, front - 0.4],
        [-0.95, front - 1.75],
        [1.55, front - 1.85],
      ]) {
        if (!at(b, K.table, tx0, tz0, 0, "", 1, true)) continue;
        at(b, K.chair, tx0 - 0.58, tz0 + 0.05, Math.PI / 2);
        at(b, K.chair, tx0 + 0.58, tz0 - 0.05, -Math.PI / 2);
      }
      at(b, "chalkboard", 0.62, front - 0.12, -0.3);
      at(b, K.planter, hw + 0.35, front + 0.05, 0, "", 0.9);
      at(b, K.planter, -hw - 0.35, front + 0.05, 0, "", 0.9);
      at(b, K.lamp, hw + 0.55, front - 1.1, 0, "", 1, true);
      at(b, K.bench, hw + 1.3, -hd + 0.5, Math.PI / 2, "", 1, true);
      at(b, K.ivy, -hw + 0.45, -hd + 0.05, 0, "", 1.1);
      at(b, K.oakB, -hw - 1.8, -hd - 0.2, 0.7, oakVariant(1), 1.05, true);
      at(b, K.bushA, -hw - 1.0, -hd + 0.4, 0.3, bushVariant(true), 0.8);
      // flower beds along the façade foot either side of the door
      for (const lx of [-1.25, 1.3]) {
        const p = local(b, lx, -hd - 0.2);
        const t = tileOf(p.x, p.z);
        if (open(t.tx, t.ty)) thin("flower-bed", `c=${FLOWERS[0]},d=${FLOWERS[2]}`, { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty), rotationY: b.rotationY, scale: 0.95 });
      }
      // tubs of flowers at the terrace corners
      for (const [lx, lz] of [
        [-hw - 0.3, front - 1.2],
        [hw + 0.3, front - 2.6],
      ]) {
        const p = local(b, lx, lz);
        const t = tileOf(p.x, p.z);
        if (free(t.tx, t.ty)) thin("flower-cluster", `c=${FLOWERS[Math.floor(hash01(seed, lx, 5) * FLOWERS.length)]}`, { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty), rotationY: lx, scale: 1.1 });
      }
    }
    if (b.kind === "shop") {
      at(b, K.planter, -(hw - 0.4), front, 0, "", 0.9);
      at(b, K.crate, hw - 0.5, front, 0.4, "", 0.55);
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
      thin(K.wall, "", { x: c.x, z: c.z + (cobbleN ? 0.35 : cobbleS ? -0.35 : 0), y: c.y, rotationY: rot });
      if (hash01(seed, tx, ty, 6) > 0.8) drift(tx, ty, 1, 50);
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
      const i = Math.floor(r * 400);
      if (g) {
        if (r > 0.965 && ringFree(tx, ty, 1, 1)) {
          claim(tx, ty);
          const pine = hash01(seed, tx, ty, 4) > 0.7;
          thin(pine ? K.pine : i % 2 ? K.oakA : K.oakB, pine ? pineVariant(i) : oakVariant(i), { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 3) * 0.4 });
        } else if (r > 0.94) {
          claim(tx, ty);
          thin(i % 2 ? K.bushA : K.bushB, bushVariant(hash01(seed, tx, ty, 5) > 0.6), { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 6) * 0.4 });
        } else if (r > 0.915) {
          thin("heather", "", { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 7) * 0.5 });
        } else if (r > 0.885) {
          thin("flower-cluster", `c=${FLOWERS[i % FLOWERS.length]}`, { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 8) * 0.4 });
        } else if (r > 0.83) {
          thin("grass-tuft", "", { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 9) * 0.6 });
        }
      } else if (tex(tx, ty) === "t_pavement" || tex(tx, ty) === "t_plaza_stone" || tex(tx, ty) === "t_paving_light") {
        // plazas: planters and flowers, sparse, never blocking
        if (r > 0.985) thin(K.planter, "", { ...c, rotationY: rot });
        else if (r > 0.975) thin("flower-cluster", `c=${FLOWERS[i % FLOWERS.length]}`, { ...c, rotationY: rot, scale: 0.8 });
      } else if (tex(tx, ty) === "t_cobble") {
        // the odd tree / planter / bush inside the village so squares don't feel empty
        if (r > 0.988 && ringFree(tx, ty, 1, 1)) {
          claim(tx, ty);
          thin(i % 2 ? K.oakA : K.oakB, oakVariant(i), { ...c, rotationY: rot, scale: 0.85 + hash01(seed, tx, ty, 3) * 0.3 });
        } else if (r > 0.98) {
          claim(tx, ty);
          thin(K.planter, "", { ...c, rotationY: rot });
        } else if (r > 0.974) {
          thin("flower-cluster", `c=${FLOWERS[i % FLOWERS.length]}`, { ...c, rotationY: rot, scale: 0.8 });
        } else if (r > 0.968) {
          thin(K.barrel, "", { ...c, rotationY: rot, scale: barrelScale });
        }
      }
    }
  }

  // ------------------------------------------------ location-specific set pieces
  if (def.id === "edinburgh_oldtown") {
    set("well", 60, 40, 0, "", 1, true);
    // a fountain square on the pavement plaza west of the Royal Mile
    if (ringFree(36, 51, 2, 2)) {
      for (let y = 51; y < 53; y++) for (let x = 36; x < 38; x++) claim(x, y);
      thin("fountain", "", { x: 37, z: -52, y: env.heightAt(37, 52) });
      set(K.bench, 34, 52, -Math.PI / 2);
      set(K.bench, 39, 52, Math.PI / 2);
      set(K.bench, 36, 49, 0);
      set(K.planter, 39, 49);
      set(K.planter, 34, 49);
      set(K.oakA, 41, 55, 0.4, oakVariant(0), 1.1);
      set(K.oakB, 25, 47, 1.3, oakVariant(1), 1.0);
    }
    // benchmark: a planted island on the café plaza so the terrace view has a
    // green foreground instead of an empty sweep of flags
    set(K.small, 30, 56, 0.4, oakVariant(2), smallScale * 1.05);
    set(K.bushA, 33, 56, 1.1, bushVariant(true), 0.8);
    for (const x of [28, 29, 31, 32]) bed(x, 56, 0.1, 0, 100 + x, 0.95);
    set(K.planter, 26, 54, 0.2, "", 0.9);
    set(K.bench, 34, 56, -Math.PI / 2);
  }
  return extra;
}
