// Coordinate convention for the 3D world.
//
// 2D game data (worldgen, NPC positions, zones, collectibles) is in PIXELS with
// x growing east (right) and y growing SOUTH (down on the 2D map).
//
// 3D world:   X = px / TILE          (east  = +X, right on screen)
//             Y = up                 (ground plane is Y = 0)
//             Z = -py / TILE         (north = +Z, "up" on the 2D map)
//
// One tile (16 px) is one world unit. The follow camera sits SOUTH of the
// player (smaller Z) and looks north (+Z), so the on-screen framing matches the
// 2D map: north is up, east is right. Babylon's default left-handed system
// with a camera looking down +Z puts +X on the right, which is exactly that.
//
// Facing yaw for a mesh whose "forward" is +Z (Babylon default):
//   rotation.y = atan2(dx, dz)   (dx, dz in world units)
// The 2D "down" facing (toward the camera / south) is yaw = PI.

import { TILE } from "../../game/constants";

export const WORLD_SCALE = 1 / TILE;

export interface XZ {
  x: number;
  z: number;
}

/** pixel coordinates -> world XZ (Y is up and handled by the caller). */
export function pxToXZ(px: number, py: number): XZ {
  return { x: px * WORLD_SCALE, z: -py * WORLD_SCALE };
}

/** world XZ -> pixel coordinates (for systems that still think in px). */
export function xzToPx(x: number, z: number): { x: number; y: number } {
  return { x: x / WORLD_SCALE, y: -z / WORLD_SCALE };
}

/** pixel distance (e.g. a zone radius) -> world units. */
export function pxToUnits(px: number): number {
  return px * WORLD_SCALE;
}

/** Tile column/row -> world XZ of that tile's CENTRE. */
export function tileCenter(tx: number, ty: number): XZ {
  return { x: tx + 0.5, z: -(ty + 0.5) };
}

/** World XZ -> tile column/row (floored). */
export function worldToTile(x: number, z: number): { tx: number; ty: number } {
  return { tx: Math.floor(x), ty: Math.floor(-z) };
}

/** Yaw (rotation around Y) that makes a +Z-forward mesh face direction (dx, dz). */
export function yawFor(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** 2D facing name -> yaw. "down" on the 2D map is south (-Z), toward the camera. */
export function yawForFacing(f: "down" | "up" | "left" | "right"): number {
  switch (f) {
    case "up":
      return 0;
    case "right":
      return Math.PI / 2;
    case "left":
      return -Math.PI / 2;
    default:
      return Math.PI;
  }
}

/** Shortest-path angle interpolation. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
