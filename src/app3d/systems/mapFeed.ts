// Engine-free snapshot of the loaded 3D location for the DOM maps (HUD
// minimap, district map, world map "you are here"). Game3D writes, the UI
// reads. Coordinates are world units: x = tiles east, z = -(tiles south).
//
// Events:
//   "location"  a new location finished loading (terrain / POIs / NPCs changed)
//   "player"    the player moved (throttled to ~10 Hz by the writer)

import { EventEmitter } from "../../core/events";
import type { WorldData, ZoneSpec } from "../../game/worldgen";
import { getLocation } from "../../game/data/locations";
import { cleanPrompt } from "../ui/dom";
import { pxToXZ } from "../world/coords";

export type MapPoiKind = ZoneSpec["action"];

export interface MapPoi {
  x: number;
  z: number;
  kind: MapPoiKind;
  label: string;
}

export interface MapNpc {
  id: string;
  name: string;
  x: number;
  z: number;
}

// Overhead palette per ground texture key (RGB). Unknown keys fall back to sand.
const GROUND_RGB: Record<string, [number, number, number]> = {
  t_water: [110, 170, 205],
  t_road: [120, 118, 122],
  t_road_lane: [120, 118, 122],
  t_asphalt: [112, 110, 116],
  t_crossing: [150, 148, 150],
  t_parking: [140, 138, 140],
  t_pavement: [206, 198, 184],
  t_paving_light: [222, 212, 190],
  t_paving_dark: [168, 156, 140],
  t_plaza_stone: [214, 200, 176],
  t_cobble: [176, 162, 142],
  t_brick_path: [196, 140, 112],
  t_path: [210, 188, 150],
  t_sand: [232, 212, 168],
  t_grass: [152, 190, 118],
  t_grass2: [142, 182, 110],
  t_lawn: [164, 200, 128],
  t_golf: [132, 196, 112],
  t_hedge: [98, 140, 82],
};
const BLOCKED_RGB: [number, number, number] = [150, 118, 96];
const FALLBACK_RGB: [number, number, number] = [226, 208, 170];

class MapFeed extends EventEmitter {
  locationId = "";
  name = "";
  cityId = "";
  /** Map size in tiles. */
  w = 1;
  h = 1;
  /** RGBA, one pixel per tile (row-major, y = tiles south). */
  terrain: Uint8ClampedArray | null = null;
  pois: MapPoi[] = [];
  npcs: MapNpc[] = [];
  player = { x: 0, z: 0 };
  /** Bumps whenever `terrain` changes, so readers can cache their bitmap. */
  version = 0;

  get ready() {
    return this.terrain !== null;
  }

  setLocation(id: string, world: WorldData) {
    const def = getLocation(id);
    this.locationId = id;
    this.name = def.name;
    this.cityId = def.cityId;
    this.w = world.w;
    this.h = world.h;
    const rgba = new Uint8ClampedArray(world.w * world.h * 4);
    for (let ty = 0; ty < world.h; ty++) {
      for (let tx = 0; tx < world.w; tx++) {
        const g = world.ground[ty]?.[tx] ?? "";
        const water = g === "t_water";
        const rgb = !water && world.blocked[ty]?.[tx] ? BLOCKED_RGB : (GROUND_RGB[g] ?? FALLBACK_RGB);
        const i = (ty * world.w + tx) * 4;
        rgba[i] = rgb[0];
        rgba[i + 1] = rgb[1];
        rgba[i + 2] = rgb[2];
        rgba[i + 3] = 255;
      }
    }
    this.terrain = rgba;
    this.pois = world.zones
      .filter((z) => z.action !== "drive")
      .map((z) => {
        const p = pxToXZ(z.x, z.y);
        let label = cleanPrompt(z.prompt);
        if (z.action === "exit") {
          const to = (z.data as { to?: string } | undefined)?.to;
          if (to) label = `To ${getLocation(to).name}`;
        }
        return { x: p.x, z: p.z, kind: z.action, label };
      });
    this.npcs = [];
    this.version++;
  }

  setNpcs(npcs: MapNpc[]) {
    this.npcs = npcs;
    this.emit("location");
  }

  setPlayer(x: number, z: number) {
    this.player.x = x;
    this.player.z = z;
    this.emit("player");
  }

  clear() {
    this.terrain = null;
    this.pois = [];
    this.npcs = [];
    this.version++;
    this.emit("location");
  }
}

export const mapFeed = new MapFeed();
