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
import { kitDoorX, presetVariant } from "../assets/kit/architecture";
import type { BuildContext, BuiltWorld, PlaceMeta, PlacedBuilding } from "./worldBuilder";
import { groundUnder, heroBuilding, isRoadTex, tileKey } from "./worldBuilder";
import { PRESETS } from "../assets/kit/architecture/presets";
import { SCOTLAND_PROFILE, benchKeyFor, lampKeyFor, type RegionKind, type WorldArtProfile } from "./artProfile";

const isTree = (k: string) => k.startsWith("tree") || k === "bush" || k.startsWith("bush-");

const MAX_EXTRA_BUILDINGS = 120;
const GREENS = ["#6b8a4e", "#7a9a56", "#5f8048", "#8aa262"];
const PINES = ["#5f7f4a", "#557344", "#6a8a52"];
/** Palm key (procedural, registered by kit/foliage.ts). */
const PALM = "tree-palm";

/**
 * Street-side infill presets per region (name, footprint width in tiles); each
 * is one thin-instance batch. The kit only has Scottish cottage presets so far:
 * the other regions list the presets they want, and `extraPresets` drops any
 * name the kit doesn't define (an unknown name would silently render as a
 * Scottish creamTerra cottage), so those regions get no infill until the kit
 * grows matching presets.
 */
const EXTRA_PRESETS_BY_REGION: Partial<Record<RegionKind, [string, number][]>> = {
  scotland: [
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
  ],
  london: [
    ["brick_terrace_a", 4],
    ["brick_terrace_b", 4],
  ],
  amman: [
    ["sandstone_shop", 4],
    ["limestone_villa", 4],
  ],
  italy: [
    ["render_cream_villa", 4],
    ["terracotta_house", 3],
  ],
  greece: [["whitewash_cube", 3]],
  uae_modern: [
    ["render_villa", 4],
    ["compound_wall", 4],
  ],
  uae_coastal: [["beachfront_villa", 4]],
};

/** The region's infill presets that the kit can actually build (may be empty). */
function extraPresets(profile: WorldArtProfile): [string, number][] {
  return (EXTRA_PRESETS_BY_REGION[profile.region] ?? []).filter(([name]) => name in PRESETS);
}

export function dressWorld(ctx: BuildContext, built: BuiltWorld) {
  const { collider, env, def, am } = ctx;
  const { world, reserved, placer, buildings } = built;
  const seed = def.id.length * 17;
  const city = def.city;
  const profile = ctx.profile ?? SCOTLAND_PROFILE;
  /** flower colours of the region (Scotland: dusty pink / cream / soft yellow / lavender / muted purple) */
  const FLOWERS = profile.flowerPalette;

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
    bench: key(benchKeyFor(profile), "bench"),
    lamp: key(lampKeyFor(profile), "lamp-post"),
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
  // variants only the procedural fallbacks understand (a region foliage tint retints hero trees too)
  const oakVariant = (i: number) => (profile.foliageTint ? `c=${profile.foliageTint}` : isFallback("oakA", "tree-oak-a") ? `c=${GREENS[i % GREENS.length]}` : "");
  const pineVariant = (i: number) => (isFallback("pine", "tree-pine") ? `c=${PINES[i % PINES.length]}` : "");

  // ---- regional vegetation: primary (the "oak" slots) and secondary (the "pine" slots) trees
  const palms = am.has(PALM);
  /** key for a primary-tree slot that would have been `oakKey` in Scotland */
  const primary = (oakKey: string) => {
    switch (profile.treePrimary) {
      case "palm":
        return palms ? PALM : oakKey;
      case "bare_urban":
        return K.small;
      default:
        return oakKey; // broadleaf / mediterranean (tinted via oakVariant)
    }
  };
  const primaryVariant = (k: string, i: number) => (k === PALM ? "" : oakVariant(i));
  /** key + variant for a secondary-tree slot (Scotland: the pine) */
  const secondary = (i: number): [string, string] => {
    switch (profile.treeSecondary) {
      case "pine":
        return [K.pine, pineVariant(i)];
      case "cypress":
        return [am.has("tree-cypress") ? "tree-cypress" : K.pine, profile.foliageTint ? `c=${profile.foliageTint}` : ""];
      case "olive":
        return [K.small, `c=${profile.foliageTint ?? "#8c9c6c"}`];
      default: {
        const k = primary(i % 2 ? K.oakA : K.oakB);
        return [k, primaryVariant(k, i)];
      }
    }
  };
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
  /** tiles the dressing keeps clear (walkable, no dressing) */
  const keep = new Set<number>();
  /** front-garden tiles (claimed, planted; loose flowers are allowed there even on raised paving) */
  const gardenTiles = new Set<number>();
  const open = (tx: number, ty: number) => inB(tx, ty) && !collider.isBlockedTile(tx, ty) && !reserved.has(tileKey(tx, ty)) && !keep.has(tileKey(tx, ty));
  const free = (tx: number, ty: number) => open(tx, ty) && !street(tx, ty);
  const freeBuild = (tx: number, ty: number) => open(tx, ty) && !road(tx, ty);
  const grass = (tx: number, ty: number) => tex(tx, ty).startsWith("t_grass") || tex(tx, ty) === "t_snow" || tex(tx, ty) === "t_lawn";
  const water = (tx: number, ty: number) => tex(tx, ty) === "t_water";
  const ringFree = (x0: number, y0: number, w: number, h: number, pred = free) => {
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (!pred(x, y)) return false;
    return true;
  };
  const claim = (tx: number, ty: number) => collider.block(tx, ty, 1, 1);
  /** false when blocking this tile would close a 1-tile sidewalk (street on one side, blocked on the other) */
  const sidewalkOk = (tx: number, ty: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (street(tx + dx, ty + dy) && collider.isBlockedTile(tx - dx, ty - dy) && !street(tx - dx, ty - dy)) return false;
    return true;
  };
  const thin = (k: string, variant: string, p: ThinPlacement, meta: PlaceMeta = {}) => {
    // heather only where the region has it (elsewhere the same spot gets a grass tuft)
    if (k === "heather" && !profile.hasHeather) k = "grass-tuft";
    if (k.startsWith("flower-cluster") || k === "heather") {
      // loose flowers only grow in soil or inside a front garden: on paving /
      // the street a lone stem reads as litter (paving gets beds and planters)
      const tx = Math.floor(p.x);
      const ty = Math.floor(-p.z);
      if ((env.heightAt(tx, ty) > 0 || env.isRoad(tx, ty)) && !gardenTiles.has(tileKey(tx, ty))) return;
    }
    placer.add(k, variant, p, meta);
    if (k === K.lamp) built.lamps.push({ x: p.x, y: p.y ?? 0, z: p.z });
  };
  const centre = (tx: number, ty: number) => ({ x: tx + 0.5, z: -(ty + 0.5), y: env.heightAt(tx, ty) });
  /** place at a tile centre (+ unit offsets); blocks the tile unless block=false */
  const set = (k: string, tx: number, ty: number, rot = 0, variant = "", scale = 1, block = true, dx = 0, dz = 0) => {
    if (!free(tx, ty)) return false;
    if (block && !sidewalkOk(tx, ty)) return false;
    if (block) claim(tx, ty);
    const c = centre(tx, ty);
    thin(k, variant, { x: c.x + dx, z: c.z + dz, y: c.y, rotationY: rot, scale }, { solid: block, trunk: isTree(k) ? 0.2 : undefined });
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
  const placeBuilding = (x0: number, y0: number, wT: number, hT: number, rot: number, preset: string, kind: string, salt: number, heroKey?: string) => {
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
    const y = groundUnder(env, x0, y0, wT, hT);
    const meta = { id: `bld:extra:${x0},${y0}`, solid: true, occluder: true, fp: { w, d } };
    const hero = heroKey ? heroBuilding(am, heroKey, w, d) : null;
    if (hero && am.isGlbLoaded(heroKey!)) {
      // hero GLB, front aligned with the footprint front (local -Z), rotated with the building
      const c = Math.cos(rot);
      const s2 = Math.sin(rot);
      thin(hero.key, "", { x: cx + hero.dz * s2, y, z: cz + hero.dz * c, rotationY: rot, scale: hero.scale }, { ...meta, src: "hero" });
      buildings.push({ tex: "extra", tx: cx, ty: y0 + hT - 1, w: wT, d: hT, rotationY: rot, kind, doorX: (hero.door?.x ?? 0) * hero.scale });
      return true;
    }
    thin("building", presetVariant(preset, w, d), { x: cx, y, z: cz, rotationY: rot + jitter, scale }, meta);
    buildings.push({ tex: "extra", tx: cx, ty: y0 + hT - 1, w: wT, d: hT, rotationY: rot, kind, doorX: kitDoorX(presetVariant(preset, w, d)) * scale });
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
      // curved promenades have fractional points: snap to tiles (the dressing
      // indexes the collision grid with these)
      const r = Math.round;
      if (a.y === b.y) segs.push({ horizontal: true, at: r(a.y), from: r(Math.min(a.x, b.x)), to: r(Math.max(a.x, b.x)), half });
      else if (a.x === b.x) segs.push({ horizontal: false, at: r(a.x), from: r(Math.min(a.y, b.y)), to: r(Math.max(a.y, b.y)), half });
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

  /** building-local (x across the façade, z out of the front = -z) → world XZ */
  const local = (b: PlacedBuilding, lx: number, lz: number) => {
    const cx = b.tx;
    const cz = -(b.ty + 1) + b.d / 2;
    const c = Math.cos(b.rotationY);
    const s = Math.sin(b.rotationY);
    return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
  };
  const tileOf = (x: number, z: number) => ({ tx: Math.floor(x), ty: Math.floor(-z) });

  // ------------------------------------------------------------ front gardens
  // COTTAGE → garden (flowers, heather, low fence / wall, gate at the door) →
  // sidewalk → curb → road. The garden is the tile row right in front of the
  // façade; it is claimed (not walkable) except the gate tile.
  const hasFlowerKeys = am.has("flower-cluster-a");
  const flower = (x: number, z: number, y: number, r: number, scale: number) => {
    if (hasFlowerKeys) thin(`flower-cluster-${"abc"[Math.floor(r * 3) % 3]}`, "", { x, z, y, rotationY: r * 17, scale: scale * 0.9 });
    else thin("flower-cluster", `c=${FLOWERS[Math.floor(r * 100) % FLOWERS.length]}`, { x, z, y, rotationY: r * 17, scale });
  };
  const frontGarden = (b: PlacedBuilding, edge: "fence" | "wall", salt: number) => {
    const rotated = Math.abs(Math.abs(b.rotationY) - Math.PI / 2) < 0.01;
    const w = rotated ? b.d : b.w;
    const hd = (rotated ? b.w : b.d) / 2;
    const hw = w / 2;
    const tiles: { tx: number; ty: number; lx: number }[] = [];
    for (let i = 0; i < w; i++) {
      const lx = -hw + 0.5 + i;
      const p = local(b, lx, -hd - 0.5);
      const t = tileOf(p.x, p.z);
      if (!free(t.tx, t.ty) || keep.has(tileKey(t.tx, t.ty))) return false;
      // never on the kerb: a garden that touches a street would eat the only sidewalk tile
      if (street(t.tx + 1, t.ty) || street(t.tx - 1, t.ty) || street(t.tx, t.ty + 1) || street(t.tx, t.ty - 1)) return false;
      tiles.push({ ...t, lx });
    }
    const gate = Math.max(0, Math.min(w - 1, Math.floor((b.doorX ?? 0) + hw)));
    const edgeKey = edge === "fence" ? K.fence : K.wall;
    const edgeZ = -hd - 0.84;
    tiles.forEach((t, i) => {
      const y = env.heightAt(t.tx, t.ty);
      const e = local(b, t.lx, edgeZ);
      if (i === gate) {
        thin(K.gate, "", { x: e.x, z: e.z, y, rotationY: b.rotationY }, { src: "garden" });
        return;
      }
      claim(t.tx, t.ty);
      gardenTiles.add(tileKey(t.tx, t.ty));
      thin(edgeKey, "", { x: e.x, z: e.z, y, rotationY: b.rotationY + (edge === "wall" ? (hash01(seed, t.tx, salt) - 0.5) * 0.04 : 0) }, { solid: true, src: "garden" });
      // planting: a low bed against the façade, clusters + heather toward the fence
      const r = hash01(seed, t.tx, t.ty, salt);
      // (Blender clusters against the façade: the procedural flower-bed's petal
      // cups read as beige saucers from the low close-up camera)
      for (const off of [-0.25, 0.22]) {
        const bp = local(b, t.lx + off + (r - 0.5) * 0.12, -hd - 0.28);
        flower(bp.x, bp.z, y, (r + off + 1) % 1, 0.8 + r * 0.25);
      }
      for (let k = 0; k < 2; k++) {
        const rk = hash01(seed, t.tx, t.ty, salt, k + 3);
        const fp = local(b, t.lx + (rk - 0.5) * 0.7, -hd - 0.55 - rk * 0.12);
        if (rk < 0.3) thin("heather", "", { x: fp.x, z: fp.z, y, rotationY: rk * 11, scale: 0.7 + rk * 0.5 });
        else flower(fp.x, fp.z, y, rk, 0.65 + rk * 0.35);
      }
    });
    // short returns at the garden ends so it reads as an enclosed plot
    for (const side of [-1, 1]) {
      const p = local(b, side * (hw - 0.04), -hd - 0.44);
      thin(edgeKey, "", { x: p.x, z: p.z, y: env.heightAt(tiles[0].tx, tiles[0].ty), rotationY: b.rotationY + Math.PI / 2, scale: 0.86 }, { src: "garden" });
    }
    return true;
  };

  // ------------------------------------------- benchmark: east end of the Royal Mile
  // Spawn is (100,48); the Mile (road, t_path) runs rows 45-47 with cobble
  // sidewalks on 43-44 and 48-49; east of x=98 the village gives way to grass.
  // North side: cottages on rows 40-42, front gardens on row 43, sidewalk row 44.
  // South side: sidewalk rows 48-49, planted verge + lamps row 50, dry-stone
  // wall row 51 with a gate, cottage garden beyond. Placed first so it wins.
  if (def.id === "edinburgh_oldtown") {
    // (the parked car sits on the Mile's south lane at the kerb - game3d spawnJeep - so the sidewalk needs no clearance)
    // cottage group north of the Mile: hero GLBs when loaded, kit presets otherwise
    placeBuilding(93, 40, 4, 3, 0, "stoneCrow", "hero", 1, "cottage-hero-a");
    placeBuilding(99, 40, 5, 3, 0, "greyDormer", "hero", 2, "cottage-hero-b");
    placeBuilding(87, 40, 4, 3, 0, "whiteSlate", "hero", 3);
    // the lane between the pair: phone box + a lamp at the back of the sidewalk
    set("phone-box", 98, 43, 0, "", 1, true, 0.05, 0.1);
    set(K.lamp, 97, 43, 0, "", 1, true, 0.1, -0.3);
    set(K.lamp, 91, 43, 0, "", 1, true, 0.2, -0.3);
    set(K.barrel, 104, 42, 0.3, "", barrelScale, true, 0.15, 0.1);
    set(K.crate, 104, 41, 0.2, "", 0.7, true, 0.1, 0.1);
    // trees on the grass beyond the east cottage
    set(K.oakA, 106, 42, 0.3, oakVariant(0), 1.15);
    set(K.pine, 108, 44, 1.1, pineVariant(1), 1.0);
    set(K.small, 106, 39, 2.2, oakVariant(2), smallScale);
    set(K.bushA, 106, 44, 0.4, bushVariant(true), 0.9);
    set(K.pine, 92, 38, 0.6, pineVariant(0), 0.9);
    set(K.lamp, 105, 43, 0, "", 1, true, 0, -0.3);
    // south side: post box + fingerpost at the back of the 2-tile sidewalk
    set(K.signpost, 96, 49, 0.35, "", 1, true, 0, -0.2);
    set(K.postBox, 95, 49, 0, "", 1, true, 0, -0.25);
    // a little green corner by the fingerpost
    set(K.bushB, 94, 50, 0.9, bushVariant(true), 0.8);
    set(K.planter, 95, 50, 0.1, "", 0.85, false, 0.1, -0.15);
    bed(93, 50, -0.3, 0, 90);
    // dry-stone wall along the grass edge (row 51) with a gate opposite spawn and
    // low return walls; it replaces the auto edge wall so the two never double up
    for (let x = 98; x <= 106; x++) {
      if (x === 101) {
        set(K.gate, x, 51, 0, "", 1, false, 0, 0.3);
        keep.add(tileKey(x, 51)); // walkable, and no auto edge wall through the gate
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
    set(K.barrel, 105, 53, 0.4, "", barrelScale, true, 0.3, -0.2);
    set(K.crate, 106, 53, 0.1, "", 0.5, false, -0.2, 0.2);
    set(K.planter, 100, 52, 0, "", 0.85, false, -0.3, -0.1);
    set(K.planter, 102, 52, 0, "", 0.85, false, 0.3, -0.1);
    set(K.bushB, 99, 53, 0.5, bushVariant(true), 0.85);
    set(K.bushA, 106, 56, 1.2, bushVariant(false), 0.9);
    // verge: lamps + a bench at the back of the south sidewalk
    set(K.lamp, 97, 50, 0, "", 1, true, 0, 0.1);
    set(K.lamp, 105, 50, 0, "", 1, true, 0, 0.1);
    set(K.bench, 98, 50, Math.PI, "", 1, true, 0, 0.12);
    // flower beds hugging the wall (street side + garden side)
    for (let x = 98; x <= 106; x++) if (x !== 101 && !keep.has(tileKey(x, 50))) bed(x, 50, 0.36, 0, 60 + x);
    for (let x = 99; x <= 106; x++) if (x !== 101) bed(x, 52, -0.2, 0, 70 + x);
    for (let x = 99; x <= 106; x++) for (let y = 53; y <= 57; y++) if (hash01(seed, x, y, 8) > 0.35) drift(x, y, 1 + Math.floor(hash01(seed, x, y, 9) * 2), 20);
    for (let x = 105; x <= 108; x++) for (let y = 39; y <= 44; y++) if (hash01(seed, x, y, 7) > 0.5) drift(x, y, 1, 30);
  }

  /** the benchmark Mile: a real road (t_path) inside the benchmark rows gets gardens */
  const gardenSeg = (sg: Seg) => def.id === "edinburgh_oldtown" && sg.horizontal && sg.at >= 40 && sg.at <= 56 && street(Math.floor((sg.from + sg.to) / 2), sg.at);

  // ---------------------------------------------------------- extra cottages
  // (region-aware: no Scottish cottages in Dubai / Amman; empty = no infill)
  const EXTRA_PRESETS = extraPresets(profile);
  for (const s of EXTRA_PRESETS.length ? segs : []) {
    for (const side of [-1, 1]) {
      let pos = s.from + 3;
      while (pos < s.to - 4 && extra < MAX_EXTRA_BUILDINGS) {
        const r = hash01(seed, s.at, pos, side);
        const [preset, wT] = EXTRA_PRESETS[Math.floor(r * 1000) % EXTRA_PRESETS.length];
        const dT = 3;
        // road half-width + sidewalk (+ a front-garden row along the benchmark Mile)
        const gap = s.half + 2 + (gardenSeg(s) ? (side < 0 ? 1 : 2) : 0);
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

  // ------------------------------------------ gardens (benchmark region only)
  if (def.id === "edinburgh_oldtown") {
    let gi = 0;
    for (const b of buildings) {
      if (b.kind !== "hero" && b.kind !== "cottage") continue;
      if (b.ty < 38 || b.ty > 60 || b.tx < 22 || b.tx > 110) continue;
      frontGarden(b, hash01(seed, b.tx, 41) > 0.45 ? "fence" : "wall", 50 + gi++);
    }
  }

  // ---------------------------------------- lamps + benches along the streets
  for (const s of segs) {
    for (let pos = s.from + 2; pos < s.to - 1; pos += 7) {
      const side = ((pos / 7) | 0) % 2 ? 1 : -1;
      const off = s.half + 1;
      const at2 = (o: number, sd: number) => (s.horizontal ? { tx: pos, ty: s.at + sd * o } : { tx: s.at + sd * o, ty: pos });
      const walk = (t: { tx: number; ty: number }) => free(t.tx, t.ty);
      // a lamp just behind the curb, only where the sidewalk is 2+ tiles wide;
      // on a 1-tile sidewalk it stands in the front garden at the fence line instead
      const lt = at2(off, side);
      const back = at2(off + 1, side);
      const toRoad = -side * 0.3;
      if (walk(lt) && walk(back)) {
        claim(lt.tx, lt.ty);
        const c = centre(lt.tx, lt.ty);
        thin(K.lamp, "", s.horizontal ? { ...c, z: c.z - toRoad } : { ...c, x: c.x + toRoad }, { solid: true });
      } else if (walk(lt) && gardenTiles.has(tileKey(back.tx, back.ty))) {
        const c = centre(back.tx, back.ty);
        // inside the garden, just behind the fence line (the fence runs 0.34 from the tile centre)
        thin(K.lamp, "", s.horizontal ? { ...c, z: c.z - toRoad * 0.15 } : { ...c, x: c.x + toRoad * 0.15 }, { solid: true });
      }
      // a bench a little further along, on the opposite side, facing the road (2+ tile sidewalks only)
      const bt = s.horizontal ? { tx: pos + 3, ty: s.at - side * off } : { tx: s.at - side * off, ty: pos + 3 };
      const bb = s.horizontal ? { tx: pos + 3, ty: s.at - side * (off + 1) } : { tx: s.at - side * (off + 1), ty: pos + 3 };
      if (hash01(seed, bt.tx, bt.ty) > 0.55 && walk(bt) && walk(bb)) {
        claim(bt.tx, bt.ty);
        const rot = s.horizontal ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2;
        thin(K.bench, "", { ...centre(bt.tx, bt.ty), rotationY: rot }, { solid: true });
      }
    }
  }

  // ---------------------------------------------- per-building front dressing
  /** place a piece at building-local coordinates if that tile is free */
  const at = (b: PlacedBuilding, k: string, lx: number, lz: number, rot = 0, variant = "", scale = 1, block = false) => {
    const p = local(b, lx, lz);
    const t = tileOf(p.x, p.z);
    if (!free(t.tx, t.ty)) return false;
    if (block && !sidewalkOk(t.tx, t.ty)) return false;
    if (block) claim(t.tx, t.ty);
    thin(k, variant, { x: p.x, z: p.z, y: env.heightAt(t.tx, t.ty), rotationY: b.rotationY + rot, scale }, { solid: block, trunk: isTree(k) ? 0.2 : undefined });
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
      if (profile.hasIvy && b.kind !== "hero" && hash01(seed, b.tx, b.ty, 4) > 0.72) at(b, K.ivy, -side * (hw - 0.5), -hd + 0.1, 0, "", 0.8 + r * 0.4);
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
      at(b, "chalkboard", 0.5, front - 1.05, -0.3); // between the terrace rows, clear of the chairs
      at(b, K.planter, hw + 0.35, front + 0.05, 0, "", 0.9);
      at(b, K.planter, -hw - 0.35, front + 0.05, 0, "", 0.9);
      at(b, K.lamp, hw + 0.55, front - 1.1, 0, "", 1, true);
      at(b, K.bench, hw + 1.3, -hd + 0.5, Math.PI / 2, "", 1, true);
      if (profile.hasIvy) at(b, K.ivy, -hw + 0.45, -hd + 0.05, 0, "", 1.1);
      const cafeTree = primary(K.oakB);
      at(b, cafeTree, -hw - 1.8, -hd - 0.2, 0.7, primaryVariant(cafeTree, 1), 1.05, true);
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
      thin(K.wall, "", { x: c.x, z: c.z + (cobbleN ? 0.35 : cobbleS ? -0.35 : 0), y: c.y, rotationY: rot }, { solid: true });
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
          // ~30% secondary trees (Scotland: pines), the odd palm where the region has them
          const sec = hash01(seed, tx, ty, 4) > 0.7;
          const palm = !sec && profile.hasPalms && palms && profile.treePrimary !== "palm" && hash01(seed, tx, ty, 10) > 0.6;
          const pk = primary(i % 2 ? K.oakA : K.oakB);
          const [k2, v2] = sec ? secondary(i) : palm ? [PALM, ""] : [pk, primaryVariant(pk, i)];
          thin(k2, v2, { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 3) * 0.4 }, { solid: true, trunk: 0.2 });
        } else if (r > 0.94) {
          claim(tx, ty);
          thin(i % 2 ? K.bushA : K.bushB, bushVariant(hash01(seed, tx, ty, 5) > 0.6), { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 6) * 0.4 }, { solid: true, trunk: 0.3 });
        } else if (r > 0.915) {
          thin("heather", "", { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 7) * 0.5 });
        } else if (r > 0.885) {
          thin("flower-cluster", `c=${FLOWERS[i % FLOWERS.length]}`, { ...c, rotationY: rot, scale: 0.8 + hash01(seed, tx, ty, 8) * 0.4 });
        } else if (r > 0.83) {
          thin("grass-tuft", "", { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 9) * 0.6 });
        }
      } else if (profile.hasSand && tex(tx, ty) === "t_sand") {
        // desert / beach verges: the odd palm, never crowding
        if (palms && profile.hasPalms && r > 0.985 && ringFree(tx, ty, 1, 1)) {
          claim(tx, ty);
          thin(PALM, "", { ...c, rotationY: rot, scale: 0.9 + hash01(seed, tx, ty, 3) * 0.35 }, { solid: true, trunk: 0.2 });
        }
      } else if (tex(tx, ty) === "t_pavement" || tex(tx, ty) === "t_plaza_stone" || tex(tx, ty) === "t_paving_light") {
        // plazas: planters and flowers, sparse, never blocking
        if (r > 0.985) thin(K.planter, "", { ...c, rotationY: rot });
        else if (r > 0.975) thin("flower-cluster", `c=${FLOWERS[i % FLOWERS.length]}`, { ...c, rotationY: rot, scale: 0.8 });
      } else if (tex(tx, ty) === "t_cobble" && !street(tx + 1, ty) && !street(tx - 1, ty) && !street(tx, ty + 1) && !street(tx, ty - 1)) {
        // the odd tree / planter / bush inside the village so squares don't feel empty
        if (r > 0.988 && ringFree(tx, ty, 1, 1)) {
          claim(tx, ty);
          const pk = primary(i % 2 ? K.oakA : K.oakB);
          thin(pk, primaryVariant(pk, i), { ...c, rotationY: rot, scale: 0.85 + hash01(seed, tx, ty, 3) * 0.3 }, { solid: true, trunk: 0.2 });
        } else if (r > 0.98 && sidewalkOk(tx, ty)) {
          claim(tx, ty);
          thin(K.planter, "", { ...c, rotationY: rot }, { solid: true });
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
      thin("fountain", "", { x: 37, z: -52, y: groundUnder(env, 36, 51, 2, 2) }, { solid: true });
      set(K.bench, 34, 52, -Math.PI / 2);
      set(K.bench, 39, 52, Math.PI / 2);
      set(K.bench, 36, 49, 0);
      set(K.planter, 39, 49);
      // (no planter at 34,49: it would close the 1-tile sidewalk behind the café bench)
      set(K.oakA, 41, 55, 0.4, oakVariant(0), 1.1);
      set(K.oakB, 25, 47, 1.3, oakVariant(1), 1.0);
    }
    // benchmark: a planted island on the café plaza so the terrace view has a
    // green foreground instead of an empty sweep of flags
    // (low planting only: a tree here hid the café front from the terrace view)
    set(K.bushB, 30, 56, 0.4, bushVariant(true), 0.85);
    set(K.bushA, 33, 56, 1.1, bushVariant(true), 0.8);
    for (const x of [28, 29, 31, 32]) bed(x, 56, 0.1, 0, 100 + x, 0.95);
    set(K.planter, 26, 54, 0.2, "", 0.9);
    set(K.bench, 34, 56, -Math.PI / 2);
  }
  return extra;
}
