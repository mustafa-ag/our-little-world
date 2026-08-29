// Persistent save data (localStorage). Everything the game needs to
// remember between visits lives here.

export interface PlacedFurniture {
  tex: string;
  x: number; // pixel position within the house scene
  y: number;
}

export interface QuestProgress {
  status: "available" | "active" | "done";
  step: number;
  progress: number; // count for the current collect step
}

export interface GameState {
  version: number;
  started: boolean;
  hearts: number;
  coins: number;
  outfit: string;
  currentLocation: string;
  /** True while she's in the Jeep — survives map / district travel. */
  inJeep: boolean;
  unlockedLocations: string[];
  quests: Record<string, QuestProgress>;
  flags: Record<string, boolean>;
  collected: Record<string, boolean>; // one-time world pickups (id -> true)
  furniture: PlacedFurniture[];
}

const SAVE_KEY = "ourlittleworld.save.v3";
const VERSION = 3;

export function defaultState(): GameState {
  return {
    version: VERSION,
    started: false,
    hearts: 0,
    coins: 10,
    outfit: "casual",
    currentLocation: "abudhabi_yas",
    inJeep: false,
    unlockedLocations: ["abudhabi", "abudhabi_yas"],
    quests: {},
    flags: {},
    collected: {},
    furniture: [],
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== VERSION) return { ...defaultState(), ...parsed, version: VERSION };
    return { ...defaultState(), ...parsed, version: VERSION };
  } catch {
    return defaultState();
  }
}

export function saveState(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // ignore (private mode / quota)
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
