// Core sizing + scene keys used across the whole game.
export const TILE = 16;

// Scene registry keys.
export const SceneKeys = {
  Boot: "Boot",
  Preload: "Preload",
  World: "World",
  House: "House",
  WorldMap: "WorldMap",
  Driving: "Driving",
  UI: "UI",
  Title: "Title",
} as const;

// Registry keys for shared, saved game state.
export const RegistryKeys = {
  State: "gameState",
} as const;

// Depth layers so things stack correctly (higher = on top).
export const Depths = {
  ground: 0,
  groundDecor: 5,
  objects: 10, // y-sorted world objects share this base
  player: 10,
  overlay: 900,
  ui: 1000,
} as const;
