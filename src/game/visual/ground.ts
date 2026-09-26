import Phaser from "phaser";
import { TILE, Depths } from "../constants";
import type { WorldData } from "../worldgen";
import { getVisualTexture } from "./runtime";
import type { WorldVisualTheme } from "./themes";

type Material = "grass" | "path" | "sand" | "water" | "road" | "pavement";

export interface HdGroundLayer {
  update(deltaMs: number): void;
  destroy(): void;
}

const materialFor = (key: string): Material => {
  if (key === "t_water") return "water";
  if (["t_road", "t_asphalt", "t_road_lane", "t_crossing", "t_parking"].includes(key)) return "road";
  if (["t_path", "t_brick_path", "t_wood", "t_carpet"].includes(key)) return "path";
  if (key === "t_sand") return "sand";
  if (["t_pavement", "t_paving_light", "t_paving_dark", "t_cobble", "t_plaza_stone", "t_tile", "t_snow"].includes(key)) return "pavement";
  return "grass";
};

const hash = (x: number, y: number, seed: number) => {
  let value = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

const seedFor = (theme: WorldVisualTheme) => [...theme.id].reduce((seed, char) => ((seed * 31 + char.charCodeAt(0)) >>> 0), 0);
const seamColor: Record<Material, number> = { grass: 0x5d9e54, path: 0xbda47c, sand: 0xcda96d, water: 0xc9f0f4, road: 0xbcc0c4, pavement: 0xaaa090 };

/**
 * Builds HD surfaces from logical material regions. Tile dimensions remain gameplay-only;
 * the visible texture repeats over large merged regions rather than one 16px image per cell.
 */
export function buildHdGround(scene: Phaser.Scene, world: WorldData, theme: WorldVisualTheme): HdGroundLayer {
  const container = scene.add.container(0, 0).setDepth(Depths.ground);
  const overlays: Phaser.GameObjects.TileSprite[] = [];
  const seed = seedFor(theme);
  const materials = world.ground.map((row) => row.map(materialFor));
  const visited = world.ground.map((row) => row.map(() => false));

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (visited[y][x]) continue;
      const material = materials[y][x];
      let width = 0;
      while (x + width < world.w && !visited[y][x + width] && materials[y][x + width] === material) width++;
      let height = 1;
      while (y + height < world.h) {
        let matchesRegion = true;
        for (let i = 0; i < width; i++) {
          if (visited[y + height][x + i] || materials[y + height][x + i] !== material) {
            matchesRegion = false;
            break;
          }
        }
        if (!matchesRegion) break;
        height++;
      }
      for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) visited[yy][xx] = true;

      const key = getVisualTexture(scene, world.ground[y][x]);
      const surface = scene.add.tileSprite(x * TILE, y * TILE, width * TILE, height * TILE, key).setOrigin(0);
      const sourceWidth = (scene.textures.get(key).getSourceImage() as { width?: number }).width ?? 256;
      const scale = sourceWidth >= 512 ? 0.19 : 0.25;
      surface.setTileScale(scale, scale);
      surface.tilePositionX = hash(x, y, seed) * 160;
      surface.tilePositionY = hash(y, x, seed + 7) * 160;
      surface.setAlpha(material === "water" ? 0.96 : 1);
      container.add(surface);

      if (material === "water") {
        const shine = scene.add.tileSprite(x * TILE, y * TILE, width * TILE, height * TILE, "hd_terrain_water_shine").setOrigin(0).setAlpha(0.36);
        shine.setTileScale(0.25, 0.25);
        shine.tilePositionX = surface.tilePositionX * 0.6;
        overlays.push(shine);
        container.add(shine);
        const wave = scene.add.tileSprite(x * TILE, y * TILE, width * TILE, height * TILE, "hd_terrain_water_wave").setOrigin(0).setAlpha(0.42);
        wave.setTileScale(0.25, 0.25);
        overlays.push(wave);
        container.add(wave);
      }
    }
  }

  const seams = scene.add.graphics();
  seams.lineStyle(1.25, 0xffffff, 0.22);
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const material = materials[y][x];
      const east = materials[y]?.[x + 1];
      const south = materials[y + 1]?.[x];
      if (east && east !== material) seams.lineBetween((x + 1) * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE);
      if (south && south !== material) seams.lineBetween(x * TILE, (y + 1) * TILE, (x + 1) * TILE, (y + 1) * TILE);
      if (material !== "grass" && hash(x, y, seed + 29) > 0.91) {
        seams.fillStyle(seamColor[material], 0.18);
        seams.fillCircle(x * TILE + 3 + hash(y, x, seed) * 10, y * TILE + 3 + hash(x, y, seed) * 10, 0.7 + hash(x, y, seed + 3) * 1.2);
      }
    }
  }
  seams.setDepth(Depths.ground + 1);

  return {
    update(deltaMs) {
      for (let i = 0; i < overlays.length; i++) overlays[i].tilePositionX += (i % 2 === 0 ? 0.004 : -0.0025) * deltaMs;
    },
    destroy() {
      seams.destroy();
      container.destroy(true);
    },
  };
}
