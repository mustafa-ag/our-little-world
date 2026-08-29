// Persistent save data (localStorage). Everything the game needs to
// remember between visits lives here.

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface PlacedFurniture {
  tex: string;
  x: number; // pixel position within the house scene
  y: number;
  rot?: number;
}

export interface QuestProgress {
  status: "available" | "active" | "done";
  step: number;
  progress: number; // count for the current collect step
}

export interface PhoneMessage {
  id: string;
  sender: string;
  body: string;
  day: number;
  read: boolean;
  questId?: string;
}

export interface MemoryUnlock {
  day: number;
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
  storedFurniture: string[];
  relationships: Record<string, number>;
  inventory: Record<string, number>;
  messages: PhoneMessage[];
  memories: Record<string, MemoryUnlock>;
  currentDay: number;
  timeOfDay: TimeOfDay;
  eventCooldowns: Record<string, number>;
  discoveredSecrets: string[];
  unlockedOutfits: string[];
  dailyFlags: Record<string, boolean>;
  lastPassenger?: string;
}

const SAVE_KEY = "ourlittleworld.save.v3";
export const VERSION = 4;

const STARTER_OUTFITS = ["casual", "cozy", "summer", "sporty", "elegant", "winter"];

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
    storedFurniture: [],
    relationships: {},
    inventory: {},
    messages: [],
    memories: {},
    currentDay: 1,
    timeOfDay: "morning",
    eventCooldowns: {},
    discoveredSecrets: [],
    unlockedOutfits: [...STARTER_OUTFITS],
    dailyFlags: {},
  };
}

function uniq(list: string[]) {
  return [...new Set(list.filter((s) => typeof s === "string" && s.length > 0))];
}

function numMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Merge any older save onto current defaults so beta saves never crash. */
export function normalizeState(raw: Partial<GameState> | null | undefined): GameState {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;

  const messages = Array.isArray(raw.messages)
    ? raw.messages.filter((m) => m && typeof m.id === "string" && typeof m.body === "string")
    : d.messages;

  const memories: Record<string, MemoryUnlock> = { ...d.memories };
  if (raw.memories && typeof raw.memories === "object") {
    for (const [id, v] of Object.entries(raw.memories)) {
      if (v && typeof v === "object" && typeof (v as MemoryUnlock).day === "number") memories[id] = v as MemoryUnlock;
      else if (v) memories[id] = { day: d.currentDay };
    }
  }

  const tod = raw.timeOfDay;
  const timeOfDay: TimeOfDay =
    tod === "morning" || tod === "afternoon" || tod === "evening" || tod === "night" ? tod : d.timeOfDay;

  return {
    ...d,
    ...raw,
    version: VERSION,
    started: !!raw.started,
    hearts: Number.isFinite(raw.hearts) ? Number(raw.hearts) : d.hearts,
    coins: Number.isFinite(raw.coins) ? Number(raw.coins) : d.coins,
    outfit: typeof raw.outfit === "string" ? raw.outfit : d.outfit,
    currentLocation: typeof raw.currentLocation === "string" ? raw.currentLocation : d.currentLocation,
    inJeep: !!raw.inJeep,
    unlockedLocations: Array.isArray(raw.unlockedLocations) ? uniq(raw.unlockedLocations) : d.unlockedLocations,
    quests: raw.quests && typeof raw.quests === "object" ? raw.quests : d.quests,
    flags: raw.flags && typeof raw.flags === "object" ? { ...raw.flags } : {},
    collected: raw.collected && typeof raw.collected === "object" ? { ...raw.collected } : {},
    furniture: Array.isArray(raw.furniture) ? raw.furniture : [],
    storedFurniture: Array.isArray(raw.storedFurniture) ? raw.storedFurniture.filter((s) => typeof s === "string") : [],
    relationships: numMap(raw.relationships),
    inventory: numMap(raw.inventory),
    messages,
    memories,
    currentDay: Number.isFinite(raw.currentDay) && (raw.currentDay as number) > 0 ? Math.floor(raw.currentDay as number) : d.currentDay,
    timeOfDay,
    eventCooldowns: numMap(raw.eventCooldowns),
    discoveredSecrets: Array.isArray(raw.discoveredSecrets) ? uniq(raw.discoveredSecrets) : [],
    unlockedOutfits: uniq([...(raw.unlockedOutfits ?? []), ...STARTER_OUTFITS]),
    dailyFlags: raw.dailyFlags && typeof raw.dailyFlags === "object" ? { ...raw.dailyFlags } : {},
    lastPassenger: typeof raw.lastPassenger === "string" ? raw.lastPassenger : undefined,
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw) as Partial<GameState>);
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
