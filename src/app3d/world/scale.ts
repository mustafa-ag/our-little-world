/**
 * Shared world-scale contract for the 3D slice.
 *
 * 1 world unit = 1 map tile ≈ 1.6 m. Juju (the player) is ~1.05 u tall, so
 * everything is sized relative to a slightly-stylised, chunky human.
 * All agents (world, props, characters, hero GLBs, rendering) use these
 * numbers — do not hard-code sizes elsewhere.
 */

/** Metres per world unit (1 tile). */
export const METRES_PER_UNIT = 1.6;

// ── characters ────────────────────────────────────────────────────────────
export const JUJU_HEIGHT = 1.05;

// ── architecture ──────────────────────────────────────────────────────────
export const STOREY = 1.6;
export const DOOR_H = 1.3;
export const DOOR_W = 0.62;
export const DOOR_RECESS = 0.15;
export const WINDOW_H = 0.72;
export const WINDOW_W = 0.52;
/** Window sill height above the storey floor. */
export const SILL_Y = 0.5;

// ── street furniture ──────────────────────────────────────────────────────
export const BENCH_SEAT = 0.3;
export const BENCH_LEN = 1.1;
export const LAMP_H = 2.1;
export const SIGNPOST_H = 1.9;
export const PLANTER_H = 0.4;
export const CAFE_TABLE_H = 0.48;
export const FENCE_H = 0.55;
export const WALL_H = 0.6;
export const POSTBOX_H = 0.95;

// ── vehicles ──────────────────────────────────────────────────────────────
export const CAR_LEN = 2.4;
export const CAR_W = 1.1;
export const CAR_H = 0.95;

// ── street surface ────────────────────────────────────────────────────────
export const CURB_H = 0.08;
export const SIDEWALK_W_MIN = 1.5;
export const SIDEWALK_W_MAX = 2;
/** Default sidewalk width used by the procedural street dressing. */
export const SIDEWALK_W = 1.6;

// ── vegetation ────────────────────────────────────────────────────────────
export const TREE_H_MIN = 2.4;
export const TREE_H_MAX = 4.6;

export const SCALE = {
  METRES_PER_UNIT,
  JUJU_HEIGHT,
  STOREY,
  DOOR_H, DOOR_W, DOOR_RECESS,
  WINDOW_H, WINDOW_W, SILL_Y,
  BENCH_SEAT, BENCH_LEN,
  LAMP_H, SIGNPOST_H, PLANTER_H, CAFE_TABLE_H,
  FENCE_H, WALL_H, POSTBOX_H,
  CAR_LEN, CAR_W, CAR_H,
  CURB_H, SIDEWALK_W, SIDEWALK_W_MIN, SIDEWALK_W_MAX,
  TREE_H_MIN, TREE_H_MAX,
} as const;
