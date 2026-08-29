import Phaser from "phaser";

// Shared control state so the on-screen joystick (owned by the UI scene) can
// drive the player in whichever gameplay scene is active. Keyboard is handled
// directly inside each gameplay scene and merged with this.
export const controls = {
  moveX: 0,
  moveY: 0,
  locked: false, // true while a dialogue/menu is open -> freeze movement
};

// Global UI event bus (button presses, dialogue requests, menu toggles).
export const uiEvents = new Phaser.Events.EventEmitter();

export interface MiniGameSpec {
  kind: "stairs" | "salon" | "coffee" | "bouquet" | "photo";
  title: string;
  hint: string;
  taps?: number;
  skipLabel?: string;
  photoLabel?: string;
  photoTex?: string;
  photoBuddy?: string;
  onDone: (ok?: boolean) => void;
}

export function resetControls() {
  controls.moveX = 0;
  controls.moveY = 0;
}

export type MiniKind = "npc" | "landmark" | "home" | "exit" | "shop" | "jeep";

export interface MiniRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MiniPoi {
  x: number;
  y: number;
  kind: MiniKind;
  label?: string;
}

export interface MiniArea extends MiniRect {
  name: string;
  here?: boolean;
}

/** Live GPS radar. WorldScene writes; UIScene draws. */
export const minimap = {
  on: false,
  name: "",
  city: "",
  cityName: "",
  w: 1,
  h: 1,
  ox: 0,
  oy: 0,
  px: 0,
  py: 0,
  facing: "down" as "down" | "up" | "left" | "right",
  ground: 0xc9b06a,
  roads: [] as MiniRect[],
  walks: [] as MiniRect[],
  parks: [] as MiniRect[],
  water: [] as MiniRect[],
  blocks: [] as MiniRect[],
  pois: [] as MiniPoi[],
  areas: [] as MiniArea[],
};
