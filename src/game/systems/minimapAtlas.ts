import { TILE } from "../constants";
import { cityMeta, districtsOf, getLocation } from "../data/locations";
import { NPCS } from "../data/npcs";
import { minimap, type MiniKind, type MiniPoi, type MiniRect } from "./controls";

function poiKind(role: string | undefined, named: boolean): MiniKind | undefined {
  if (role === "landmark") return "landmark";
  if (role === "home") return "home";
  if (role === "shop" || role === "cafe" || role === "salon") return "shop";
  if (role === "drive") return "jeep";
  if (named && (role === "apartment" || role === "uni" || role === "plain" || role === "info" || role === "stairs")) return "landmark";
  return undefined;
}

/** Pack every district of a city into one atlas using walk-exits (west/east/north/south). */
function layoutCity(cityId: string, hereId: string) {
  const districts = districtsOf(cityId);
  const hub = cityMeta(cityId)?.hub ?? hereId;
  const start = districts.find((d) => d.id === hub)?.id ?? hereId;
  const placed = new Map<string, { ox: number; oy: number }>();
  const queue = [start];
  placed.set(start, { ox: 0, oy: 0 });

  while (queue.length) {
    const id = queue.shift()!;
    const def = getLocation(id);
    const pos = placed.get(id)!;
    const w = (def.city?.w ?? 40) * TILE;
    const h = (def.city?.h ?? 30) * TILE;
    const exits = def.exits ?? {};

    if (exits.east && !placed.has(exits.east)) {
      placed.set(exits.east, { ox: pos.ox + w, oy: pos.oy });
      queue.push(exits.east);
    }
    if (exits.west && !placed.has(exits.west)) {
      const nw = (getLocation(exits.west).city?.w ?? 40) * TILE;
      placed.set(exits.west, { ox: pos.ox - nw, oy: pos.oy });
      queue.push(exits.west);
    }
    if (exits.south && !placed.has(exits.south)) {
      placed.set(exits.south, { ox: pos.ox, oy: pos.oy + h });
      queue.push(exits.south);
    }
    if (exits.north && !placed.has(exits.north)) {
      const nh = (getLocation(exits.north).city?.h ?? 30) * TILE;
      placed.set(exits.north, { ox: pos.ox, oy: pos.oy - nh });
      queue.push(exits.north);
    }
  }

  let extraX = 0;
  for (const [id, p] of placed) {
    extraX = Math.max(extraX, p.ox + (getLocation(id).city?.w ?? 40) * TILE);
  }
  for (const d of districts) {
    if (placed.has(d.id)) continue;
    const dw = (d.city?.w ?? 40) * TILE;
    placed.set(d.id, { ox: extraX + TILE * 4, oy: 0 });
    extraX += dw + TILE * 4;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, p] of placed) {
    const def = getLocation(id);
    const w = (def.city?.w ?? 40) * TILE;
    const h = (def.city?.h ?? 30) * TILE;
    minX = Math.min(minX, p.ox);
    minY = Math.min(minY, p.oy);
    maxX = Math.max(maxX, p.ox + w);
    maxY = Math.max(maxY, p.oy + h);
  }
  for (const p of placed.values()) {
    p.ox -= minX;
    p.oy -= minY;
  }

  return { placed, w: maxX - minX, h: maxY - minY };
}

/** Fill live GPS state with the whole city (Yas + AD City + Corniche, all of Dubai, …). */
export function fillCityMinimap(
  districtId: string,
  playerX: number,
  playerY: number,
  facing: "down" | "up" | "left" | "right",
) {
  const here = getLocation(districtId);
  const meta = cityMeta(here.cityId);
  const { placed, w, h } = layoutCity(here.cityId, districtId);
  const origin = placed.get(districtId) ?? { ox: 0, oy: 0 };

  const roads: MiniRect[] = [];
  const water: MiniRect[] = [];
  const blocks: MiniRect[] = [];
  const pois: MiniPoi[] = [];
  const areas = [...placed.entries()].map(([id, p]) => {
    const d = getLocation(id);
    const dw = (d.city?.w ?? 40) * TILE;
    const dh = (d.city?.h ?? 30) * TILE;
    return { x: p.ox, y: p.oy, w: dw, h: dh, name: d.name, here: id === districtId };
  });

  for (const [id, p] of placed) {
    const d = getLocation(id);
    const city = d.city;
    if (!city) continue;
    const ox = p.ox;
    const oy = p.oy;

    for (const r of city.roads ?? []) {
      roads.push({ x: ox + r.x * TILE, y: oy + r.y * TILE, w: r.w * TILE, h: r.h * TILE });
    }
    for (const r of city.water ?? []) {
      water.push({ x: ox + r.x * TILE, y: oy + r.y * TILE, w: r.w * TILE, h: r.h * TILE });
    }
    for (const poi of city.pois) {
      const x = ox + poi.tx * TILE;
      const y = oy + poi.ty * TILE;
      blocks.push({ x: x - 8, y: y - 8, w: 24, h: 24 });
      const kind = poiKind(poi.role, Boolean(poi.name));
      if (kind) pois.push({ x, y, kind, label: kind === "jeep" ? (id === districtId ? "Jeep" : undefined) : poi.name });
    }

    for (const n of NPCS.filter((npc) => npc.location === id)) {
      if (pois.some((q) => q.kind === "npc" && q.label === n.name && Math.hypot(q.x - (ox + n.tx * TILE), q.y - (oy + n.ty * TILE)) < 48))
        continue;
      pois.push({ x: ox + n.tx * TILE, y: oy + (n.ty + 1) * TILE, kind: "npc", label: n.name });
    }
  }

  minimap.on = true;
  minimap.name = here.name;
  minimap.city = here.cityId;
  minimap.cityName = meta?.name ?? here.name;
  minimap.w = Math.max(1, w);
  minimap.h = Math.max(1, h);
  minimap.ox = origin.ox;
  minimap.oy = origin.oy;
  minimap.ground = here.ground.includes("sand") ? 0xe6cf9f : here.groundAlt === "t_snow" ? 0xeef3f7 : 0x7bc86c;
  minimap.roads = roads;
  minimap.water = water;
  minimap.blocks = blocks;
  minimap.pois = pois;
  minimap.areas = areas;
  minimap.px = origin.ox + playerX;
  minimap.py = origin.oy + playerY;
  minimap.facing = facing;
}
