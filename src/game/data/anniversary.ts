// October 11: Moomoo & Juju's anniversary. Everything here is inert on any
// other day — callers gate on isAnniversary().

/** The year the story began (Year 1 = the first October 11 after it). */
export const ANNIVERSARY_START_YEAR = 2023;

/** True only on October 11 (local time). Month is 0-indexed. */
export function isAnniversary(now: Date = new Date()): boolean {
  return now.getMonth() === 9 && now.getDate() === 11;
}

/** Which anniversary this is (2024 → 1, 2025 → 2, ...). Never below 1. */
export function anniversaryYear(now: Date = new Date()): number {
  return Math.max(1, now.getFullYear() - ANNIVERSARY_START_YEAR);
}

export interface SpecialPlace {
  id: string;
  name: string;
  /** What Juju reads when she arrives there on the day. */
  memory: string;
}

/** "Our special places": existing locations that get a gold star on the day. */
export const SPECIAL_PLACES: SpecialPlace[] = [
  { id: "edinburgh_oldtown", name: "Edinburgh Old Town", memory: "Cobblestones, cold hands, warm coffee. Where our little world first felt real." },
  { id: "edinburgh_dean", name: "Dean Village", memory: "The quiet river and the two of us, pretending we weren't falling for each other." },
  { id: "abudhabi_corniche", name: "The Corniche", memory: "Sunset walks by the sea. Every golden hour belongs a little bit to you." },
  { id: "abudhabi_saadiyat", name: "Saadiyat", memory: "Soft sand, slow days, and your laugh carried by the sea breeze." },
  { id: "dubai_downtown", name: "Downtown Dubai", memory: "The city lights never shone brighter than your eyes did that night." },
  { id: "greece_santorini", name: "Santorini", memory: "Blue domes and white walls — a dream we promised to keep chasing together." },
  { id: "italy_positano", name: "Positano", memory: "Lemon trees and cliffside views. One day, for real, my love." },
];

/** Places to visit for the "Anniversary Celebration" quest. */
export const ANNIVERSARY_QUEST_GOAL = 3;

export const ANNIVERSARY_NIGHT_MESSAGE =
  "Happy Anniversary my love. Every day in our little world is better because you're in it. — Moomoo 💕";

// ---- quest progress (per anniversary year, kept in localStorage) ----

const key = (now: Date = new Date()) => `olw:anniversary:${now.getFullYear()}`;

interface AnnivProgress {
  greeted: boolean;
  visited: string[];
}

export function loadAnniversaryProgress(): AnnivProgress {
  try {
    const raw = localStorage.getItem(key());
    if (raw) {
      const p = JSON.parse(raw) as Partial<AnnivProgress>;
      return { greeted: !!p.greeted, visited: Array.isArray(p.visited) ? p.visited.filter((v) => typeof v === "string") : [] };
    }
  } catch {
    // private mode / blocked storage: progress just lives for this session
  }
  return { greeted: false, visited: [] };
}

export function saveAnniversaryProgress(p: AnnivProgress): void {
  try {
    localStorage.setItem(key(), JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function specialPlace(id: string): SpecialPlace | undefined {
  return SPECIAL_PLACES.find((p) => p.id === id);
}
