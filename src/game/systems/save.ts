// Persistent save data (localStorage). Everything the game needs to
// remember between visits lives here.

import { ADNOC_RANKS, ADNOC_WORK_TASKS, type AdnocRank, type AdnocWorkTaskId } from "../data/adnoc";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
export type Career = "explorer" | "chemical_engineer" | "ceo";

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

export interface AdnocWorkdayState {
  id: string;
  day: number;
  tasks: AdnocWorkTaskId[];
  index: number;
  stars: number;
  paid: boolean;
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

/** Metadata only: photos are rendered as Polaroids and never stored as image blobs. */
export interface SavedPhoto {
  id: string;
  title: string;
  locationId: string;
  day: number;
  timeOfDay: TimeOfDay;
  companionId?: string;
  /** Small reconstruction hints only; the save never contains an image blob. */
  participantIds?: string[];
  pose?: "smile" | "peace" | "silly" | "hug";
  surprise?: "pigeon" | "cat" | "bus" | "weird_pose";
  frame?: "classic" | "hearts" | "city" | "chaos";
  caption?: string;
}

export interface CatProgress {
  /** 0 unseen, 1 spotted, 2 fed, 3 befriended, 4 adopted. */
  stage: number;
  name: string;
  lastSeenDay: number;
  adopted: boolean;
}

export interface ShoppingRunRecord {
  id: string;
  mallId: "dubai_mall" | "dubai_hills_mall" | "yas_mall";
  day: number;
  productIds: string[];
  babaStress: number;
  babaBattle: "won" | "avoided";
  collisions: number;
  flirtyMoments: number;
  ultimateUsed: boolean;
  seconds: number;
}

export interface GameState {
  version: number;
  started: boolean;
  hearts: number;
  coins: number;
  fuel: number;
  career: Career;
  adnocRank: AdnocRank;
  adnocXp: number;
  adnocWorkdays: number;
  adnocCareerStats: Record<string, number>;
  adnocLastPaidDay: number;
  adnocLastTasks: AdnocWorkTaskId[];
  adnocBadgePhoto: number;
  adnocWorkday?: AdnocWorkdayState;
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
  photos: Record<string, SavedPhoto>;
  keepsakes: string[];
  unlockedCompanions: string[];
  activeCompanionId?: string;
  discoveredNotes: string[];
  currentDay: number;
  timeOfDay: TimeOfDay;
  eventCooldowns: Record<string, number>;
  /** IDs already offered today. Reset by sleep; prevents reload/event fishing. */
  dailyWorldEvents: string[];
  stats: Record<string, number>;
  discoveredSecrets: string[];
  unlockedOutfits: string[];
  unlockedAccessories: string[];
  equippedAccessory?: string;
  dailyFlags: Record<string, boolean>;
  lastPassenger?: string;
  cat: CatProgress;
  souvenirs: string[];
  displayedSouvenirs: string[];
  /** Compact result cards only; product rewards live in their normal systems. */
  shoppingHistory: ShoppingRunRecord[];
}

/** Legacy single-save key. It remains mirrored so existing installs never lose progress. */
const SAVE_KEY = "ourlittleworld.save.v3";
const SAVE_SLOTS_KEY = "ourlittleworld.save-slots.v1";
const SAVE_SLOTS_BACKUP_KEY = "ourlittleworld.save-slots.backup.v1";
export const SAVE_SLOT_COUNT = 3;
export const VERSION = 10;

const STARTER_OUTFITS = ["casual", "cozy", "summer", "sporty", "elegant", "winter"];

export interface SaveSlot {
  id: string;
  state: GameState;
  /** Zero means this slot has not started a story yet. */
  updatedAt: number;
}

export interface SaveArchive {
  version: 1;
  activeSlotId: string;
  slots: Record<string, SaveSlot>;
}

export function defaultState(): GameState {
  return {
    version: VERSION,
    started: false,
    hearts: 0,
    coins: 10,
    fuel: 100,
    career: "explorer",
    adnocRank: "visitor",
    adnocXp: 0,
    adnocWorkdays: 0,
    adnocCareerStats: {},
    adnocLastPaidDay: 0,
    adnocLastTasks: [],
    adnocBadgePhoto: 0,
    adnocWorkday: undefined,
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
    photos: {},
    keepsakes: [],
    unlockedCompanions: [],
    discoveredNotes: [],
    currentDay: 1,
    timeOfDay: "morning",
    eventCooldowns: {},
    dailyWorldEvents: [],
    stats: {},
    discoveredSecrets: [],
    unlockedOutfits: [...STARTER_OUTFITS],
    unlockedAccessories: [],
    equippedAccessory: undefined,
    dailyFlags: {},
    cat: { stage: 0, name: "Mishmish", lastSeenDay: 0, adopted: false },
    souvenirs: [],
    displayedSouvenirs: [],
    shoppingHistory: [],
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
  let career: Career = raw.career === "chemical_engineer" || raw.career === "ceo" ? raw.career : d.career;

  // Keep the original beta quest record, but let players who completed the
  // replaced Baba introduction enter the new mall sequence without a reset.
  const quests: Record<string, QuestProgress> =
    raw.quests && typeof raw.quests === "object" ? { ...raw.quests } : { ...d.quests };
  const legacyBabaIntro = quests.q_start;
  if (legacyBabaIntro && !quests.q_baba_card) {
    quests.q_baba_card = {
      status: legacyBabaIntro.status === "done" ? "done" : "available",
      step: 0,
      progress: 0,
    };
  }

  const photos: Record<string, SavedPhoto> = {};
  if (raw.photos && typeof raw.photos === "object") {
    for (const [id, photo] of Object.entries(raw.photos)) {
      const p = photo as Partial<SavedPhoto>;
      if (!p || typeof p.title !== "string" || typeof p.locationId !== "string") continue;
      photos[id] = {
        id,
        title: p.title,
        locationId: p.locationId,
        day: Number.isFinite(p.day) ? Math.max(1, Math.floor(Number(p.day))) : d.currentDay,
        timeOfDay: p.timeOfDay === "afternoon" || p.timeOfDay === "evening" || p.timeOfDay === "night" ? p.timeOfDay : "morning",
        companionId: typeof p.companionId === "string" ? p.companionId : undefined,
        participantIds: Array.isArray(p.participantIds) ? uniq(p.participantIds) : undefined,
        pose: p.pose === "peace" || p.pose === "silly" || p.pose === "hug" ? p.pose : "smile",
        surprise: p.surprise === "pigeon" || p.surprise === "cat" || p.surprise === "bus" || p.surprise === "weird_pose" ? p.surprise : undefined,
        frame: p.frame === "hearts" || p.frame === "city" || p.frame === "chaos" ? p.frame : "classic",
        caption: typeof p.caption === "string" ? p.caption : undefined,
      };
    }
  }

  const flags = raw.flags && typeof raw.flags === "object" ? { ...raw.flags } : {};
  const inventory = numMap(raw.inventory);
  let currentLocation = typeof raw.currentLocation === "string" ? raw.currentLocation : d.currentLocation;

  // v6 expands the beta heist. Move in-progress saves to the closest safe
  // checkpoint and never strand an old Edinburgh run in the new London flow.
  if ((raw.version ?? 0) < 6) {
    const heist = quests.q_family_jewel_heist;
    if (heist?.status === "active") {
      const legacyStep = Math.max(0, Math.floor(heist.step));
      heist.step = legacyStep <= 1 ? legacyStep : legacyStep === 2 ? 4 : legacyStep === 3 ? 7 : 9;
      heist.progress = 0;
      if (legacyStep >= 2) currentLocation = "london_westend";
      if (legacyStep >= 4 || inventory.grandmas_jewelry > 0) flags.heist_jewelry_claimed = true;
    }
  }

  const validRanks = new Set(ADNOC_RANKS.map((entry) => entry.id));
  let adnocRank: AdnocRank = validRanks.has(raw.adnocRank as AdnocRank)
    ? raw.adnocRank as AdnocRank
    : career === "ceo" ? "ceo" : career === "chemical_engineer" ? "chemical_engineer" : "visitor";
  let adnocXp = Number.isFinite(raw.adnocXp) ? Math.max(0, Math.floor(Number(raw.adnocXp))) : 0;
  let adnocWorkdays = Number.isFinite(raw.adnocWorkdays) ? Math.max(0, Math.floor(Number(raw.adnocWorkdays))) : 0;
  const adnocCareerStats = numMap(raw.adnocCareerStats);
  let adnocLastPaidDay = Number.isFinite(raw.adnocLastPaidDay) ? Math.max(0, Math.floor(Number(raw.adnocLastPaidDay))) : 0;
  const validTasks = new Set(ADNOC_WORK_TASKS.map((task) => task.id));
  const adnocLastTasks = Array.isArray(raw.adnocLastTasks)
    ? raw.adnocLastTasks.filter((id): id is AdnocWorkTaskId => typeof id === "string" && validTasks.has(id as AdnocWorkTaskId)).slice(0, 3)
    : [];
  const rawWorkday = raw.adnocWorkday;
  const workdayTasks = Array.isArray(rawWorkday?.tasks)
    ? rawWorkday.tasks.filter((id): id is AdnocWorkTaskId => typeof id === "string" && validTasks.has(id as AdnocWorkTaskId)).slice(0, 3)
    : [];
  let adnocWorkday: AdnocWorkdayState | undefined = rawWorkday && typeof rawWorkday.id === "string" && workdayTasks.length === 3
    ? {
        id: rawWorkday.id,
        day: Number.isFinite(rawWorkday.day) ? Math.max(1, Math.floor(Number(rawWorkday.day))) : d.currentDay,
        tasks: workdayTasks,
        index: Number.isFinite(rawWorkday.index) ? Math.min(3, Math.max(0, Math.floor(Number(rawWorkday.index)))) : 0,
        stars: Number.isFinite(rawWorkday.stars) ? Math.min(9, Math.max(0, Math.floor(Number(rawWorkday.stars)))) : 0,
        paid: !!rawWorkday.paid,
      }
    : undefined;

  // v7 turns the old two-interaction ADNOC shortcut into a full career. Keep
  // broad career values intact while placing legacy employees at a safe rank.
  if ((raw.version ?? 0) < 7) {
    const engineer = quests.q_adnoc_engineer;
    if (engineer?.status === "active") {
      const legacyStep = Math.max(0, Math.floor(engineer.step));
      engineer.step = legacyStep === 0 ? 0 : legacyStep === 1 ? 1 : 7;
      engineer.progress = 0;
      // The retired quest awarded the lab result before its final recruiter
      // conversation. Preserve that checkpoint without trapping a visitor on
      // the locked engineering floor in the expanded HQ.
      if (legacyStep >= 2) {
        adnocRank = "new_hire";
        inventory.adnoc_badge = Math.max(1, inventory.adnoc_badge ?? 0);
      }
    }
    const legacyCeo = career === "ceo" || quests.q_adnoc_ceo?.status === "done";
    if (legacyCeo) {
      adnocRank = "ceo";
      adnocXp = Math.max(adnocXp, 240);
      adnocWorkdays = Math.max(adnocWorkdays, 9);
      career = "ceo";
      for (const id of ["q_adnoc_engineer", "q_adnoc_pressure_problem", "q_adnoc_paperclip_incident", "q_adnoc_team_lead", "q_adnoc_control_room", "q_adnoc_director", "q_adnoc_ceo"])
        quests[id] = { status: "done", step: 99, progress: 0 };
    } else if (career === "chemical_engineer" || engineer?.status === "done") {
      adnocRank = "chemical_engineer";
      adnocXp = Math.max(adnocXp, 15);
      career = "chemical_engineer";
      if (quests.q_adnoc_ceo?.status === "active") quests.q_adnoc_ceo = { status: "available", step: 0, progress: 0 };
    }
    adnocLastPaidDay = 0;
    adnocWorkday = undefined;
  }

  // v8 expands the cozy quest chains without invalidating completed stories.
  // The old index for every retained objective is intentionally preserved;
  // new activities are inserted after the closest completed checkpoint.
  if ((raw.version ?? 0) < 8) {
    const expandedAtSameCheckpoint = ["q_date", "q_flowers", "q_residences", "q_nour", "q_chloe", "q_hudayriyat", "q_home_refresh"];
    for (const id of expandedAtSameCheckpoint) {
      const progress = quests[id];
      if (!progress || progress.status !== "active") continue;
      progress.step = Math.max(0, Math.floor(progress.step));
      progress.progress = Math.max(0, Math.floor(progress.progress));
    }
    const edi = quests.q_edinburgh;
    if (edi?.status === "active" && edi.step >= 2) {
      edi.step = 2;
      edi.progress = 0;
    }
  }
  delete quests.q_pirate_keepsakes;
  delete flags.pirate_juju;
  delete inventory.family_keepsakes;

  const unlockedCompanions = Array.isArray(raw.unlockedCompanions) ? uniq(raw.unlockedCompanions) : [];
  if (quests.q_london?.status === "done" && !unlockedCompanions.includes("fadwa")) unlockedCompanions.push("fadwa");

  const rawCat = raw.cat as Partial<CatProgress> | undefined;
  const catStage = Number.isFinite(rawCat?.stage) ? Math.min(4, Math.max(0, Math.floor(Number(rawCat?.stage)))) : 0;
  const cat: CatProgress = {
    stage: rawCat?.adopted ? 4 : catStage,
    name: typeof rawCat?.name === "string" && rawCat.name.trim() ? rawCat.name.trim().slice(0, 18) : "Mishmish",
    lastSeenDay: Number.isFinite(rawCat?.lastSeenDay) ? Math.max(0, Math.floor(Number(rawCat?.lastSeenDay))) : 0,
    adopted: !!rawCat?.adopted || catStage >= 4,
  };
  const souvenirs = Array.isArray(raw.souvenirs) ? uniq(raw.souvenirs) : [];
  const displayedSouvenirs = Array.isArray(raw.displayedSouvenirs)
    ? uniq(raw.displayedSouvenirs).filter((id) => souvenirs.includes(id)).slice(0, 5)
    : souvenirs.slice(0, 5);
  const shoppingHistory: ShoppingRunRecord[] = Array.isArray(raw.shoppingHistory)
    ? raw.shoppingHistory.flatMap((entry) => {
        const run = entry as Partial<ShoppingRunRecord>;
        const mallId: ShoppingRunRecord["mallId"] = run.mallId === "dubai_hills_mall" || run.mallId === "yas_mall" ? run.mallId : "dubai_mall";
        if (!Array.isArray(run.productIds)) return [];
        const normalized: ShoppingRunRecord = {
          id: typeof run.id === "string" ? run.id : `legacy-shopping-${run.day ?? 1}`,
          mallId,
          day: Number.isFinite(run.day) ? Math.max(1, Math.floor(Number(run.day))) : 1,
          productIds: uniq(run.productIds).slice(0, 8),
          babaStress: Number.isFinite(run.babaStress) ? Math.min(100, Math.max(0, Math.round(Number(run.babaStress)))) : 0,
          babaBattle: run.babaBattle === "won" ? "won" : "avoided",
          collisions: Number.isFinite(run.collisions) ? Math.max(0, Math.round(Number(run.collisions))) : 0,
          flirtyMoments: Number.isFinite(run.flirtyMoments) ? Math.max(0, Math.round(Number(run.flirtyMoments))) : 0,
          ultimateUsed: !!run.ultimateUsed,
          seconds: Number.isFinite(run.seconds) ? Math.max(0, Math.round(Number(run.seconds))) : 0,
        };
        return [normalized];
      }).slice(-12)
    : [];

  return {
    ...d,
    ...raw,
    version: VERSION,
    started: !!raw.started,
    hearts: Number.isFinite(raw.hearts) ? Number(raw.hearts) : d.hearts,
    coins: Number.isFinite(raw.coins) ? Number(raw.coins) : d.coins,
    fuel: Number.isFinite(raw.fuel) ? Math.min(100, Math.max(0, Math.round(Number(raw.fuel)))) : d.fuel,
    career,
    adnocRank,
    adnocXp,
    adnocWorkdays,
    adnocCareerStats,
    adnocLastPaidDay,
    adnocLastTasks,
    adnocBadgePhoto: Number.isFinite(raw.adnocBadgePhoto) ? Math.min(4, Math.max(0, Math.floor(Number(raw.adnocBadgePhoto)))) : 0,
    adnocWorkday,
    outfit: typeof raw.outfit === "string" ? raw.outfit : d.outfit,
    currentLocation,
    inJeep: !!raw.inJeep,
    unlockedLocations: Array.isArray(raw.unlockedLocations) ? uniq(raw.unlockedLocations) : d.unlockedLocations,
    quests,
    flags,
    collected: raw.collected && typeof raw.collected === "object" ? { ...raw.collected } : {},
    furniture: Array.isArray(raw.furniture) ? raw.furniture : [],
    storedFurniture: Array.isArray(raw.storedFurniture) ? raw.storedFurniture.filter((s) => typeof s === "string") : [],
    relationships: numMap(raw.relationships),
    inventory,
    messages,
    memories,
    photos,
    keepsakes: Array.isArray(raw.keepsakes) ? uniq(raw.keepsakes) : [],
    unlockedCompanions,
    activeCompanionId: typeof raw.activeCompanionId === "string" ? raw.activeCompanionId : undefined,
    discoveredNotes: Array.isArray(raw.discoveredNotes) ? uniq(raw.discoveredNotes) : [],
    currentDay: Number.isFinite(raw.currentDay) && (raw.currentDay as number) > 0 ? Math.floor(raw.currentDay as number) : d.currentDay,
    timeOfDay,
    eventCooldowns: numMap(raw.eventCooldowns),
    dailyWorldEvents: Array.isArray(raw.dailyWorldEvents) ? uniq(raw.dailyWorldEvents).slice(0, 2) : [],
    stats: numMap(raw.stats),
    discoveredSecrets: Array.isArray(raw.discoveredSecrets) ? uniq(raw.discoveredSecrets) : [],
    unlockedOutfits: uniq([...(raw.unlockedOutfits ?? []), ...STARTER_OUTFITS]),
    unlockedAccessories: Array.isArray(raw.unlockedAccessories) ? uniq(raw.unlockedAccessories) : [],
    equippedAccessory: typeof raw.equippedAccessory === "string" ? raw.equippedAccessory : undefined,
    dailyFlags: raw.dailyFlags && typeof raw.dailyFlags === "object" ? { ...raw.dailyFlags } : {},
    lastPassenger: typeof raw.lastPassenger === "string" ? raw.lastPassenger : undefined,
    cat,
    souvenirs,
    displayedSouvenirs,
    shoppingHistory,
  };
}

function slotId(index: number) {
  return `story-${index + 1}`;
}

function blankSlot(index: number): SaveSlot {
  return { id: slotId(index), state: defaultState(), updatedAt: 0 };
}

function legacyState(): GameState | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    return normalizeState(JSON.parse(raw) as Partial<GameState>);
  } catch {
    return undefined;
  }
}

function createArchive(): SaveArchive {
  const slots: Record<string, SaveSlot> = {};
  for (let index = 0; index < SAVE_SLOT_COUNT; index++) {
    const slot = blankSlot(index);
    slots[slot.id] = slot;
  }
  const prior = legacyState();
  if (prior) slots[slotId(0)] = { id: slotId(0), state: prior, updatedAt: prior.started ? Date.now() : 0 };
  return { version: 1, activeSlotId: slotId(0), slots };
}

function parseArchive(raw: string | null): SaveArchive | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveArchive>;
    if (!parsed || typeof parsed !== "object" || !parsed.slots || typeof parsed.slots !== "object") return undefined;
    const slots: Record<string, SaveSlot> = {};
    for (let index = 0; index < SAVE_SLOT_COUNT; index++) {
      const id = slotId(index);
      const candidate = parsed.slots?.[id];
      if (!candidate || typeof candidate !== "object" || !candidate.state || typeof candidate.state !== "object") return undefined;
      slots[id] = {
        id,
        state: normalizeState(candidate?.state),
        updatedAt: candidate && Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : 0,
      };
    }
    const activeSlotId = slots[parsed.activeSlotId ?? ""] ? parsed.activeSlotId! : slotId(0);
    return { version: 1, activeSlotId, slots };
  } catch {
    return undefined;
  }
}

function readArchive(): SaveArchive {
  let primary: SaveArchive | undefined;
  let backup: SaveArchive | undefined;
  try {
    primary = parseArchive(localStorage.getItem(SAVE_SLOTS_KEY));
    backup = parseArchive(localStorage.getItem(SAVE_SLOTS_BACKUP_KEY));
  } catch {
    // Storage can be unavailable in private browsing; start a session safely.
  }
  if (primary) {
    if (!backup) writeArchive(primary);
    return primary;
  }
  if (backup) {
    writeArchive(backup);
    return backup;
  }

  const archive = createArchive();
  writeArchive(archive);
  return archive;
}

/** A serializable snapshot for the optional authenticated cloud mirror. */
export function getSaveArchive(): SaveArchive {
  return JSON.parse(JSON.stringify(readArchive())) as SaveArchive;
}

/**
 * Replaces the local archive only after it passes the same validation and
 * migration rules as an on-device save. Returns the newly active state.
 */
export function restoreSaveArchive(raw: unknown): GameState | undefined {
  const archive = parseArchive(JSON.stringify(raw));
  if (!archive) return undefined;
  writeArchive(archive);
  return archive.slots[archive.activeSlotId].state;
}

export function archiveUpdatedAt(archive: SaveArchive) {
  return Math.max(...Object.values(archive.slots).map((slot) => slot.updatedAt), 0);
}

function writeArchive(archive: SaveArchive) {
  const serialized = JSON.stringify(archive);
  try {
    localStorage.setItem(SAVE_SLOTS_KEY, serialized);
    // A deployment never clears origin storage. This backup also protects all slots
    // if a browser ever damages the primary archive record.
    localStorage.setItem(SAVE_SLOTS_BACKUP_KEY, serialized);
    // Keep the previous single-save key in sync with the selected story as a safe rollback path.
    localStorage.setItem(SAVE_KEY, JSON.stringify(archive.slots[archive.activeSlotId].state));
  } catch {
    // Ignore private-mode or quota failures; the game remains playable for this session.
  }
}

export function getSaveSlots(): SaveSlot[] {
  const archive = readArchive();
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => archive.slots[slotId(index)]);
}

export function getActiveSaveSlotId() {
  return readArchive().activeSlotId;
}

export function loadState(slotIdToLoad?: string): GameState {
  const archive = readArchive();
  if (slotIdToLoad && archive.slots[slotIdToLoad]) {
    archive.activeSlotId = slotIdToLoad;
    writeArchive(archive);
  }
  return archive.slots[archive.activeSlotId].state;
}

export function saveState(state: GameState) {
  const archive = readArchive();
  archive.slots[archive.activeSlotId] = {
    id: archive.activeSlotId,
    state: normalizeState(state),
    updatedAt: state.started ? Date.now() : archive.slots[archive.activeSlotId].updatedAt,
  };
  writeArchive(archive);
}

/** Starts a new story in one slot without affecting the other stories. */
export function createNewSaveSlot(id: string): GameState {
  const archive = readArchive();
  if (!archive.slots[id]) return archive.slots[archive.activeSlotId].state;
  archive.activeSlotId = id;
  archive.slots[id] = { id, state: defaultState(), updatedAt: 0 };
  writeArchive(archive);
  return archive.slots[id].state;
}

export function clearSave() {
  const archive = readArchive();
  const id = archive.activeSlotId;
  archive.slots[id] = { id, state: defaultState(), updatedAt: 0 };
  writeArchive(archive);
}
