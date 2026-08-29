import type { TimeOfDay } from "../systems/save";

export interface EncounterDef {
  id: string;
  /** Chance 0–1 when conditions match. */
  chance: number;
  cooldownDays: number;
  once?: boolean;
  location?: string;
  city?: string;
  time?: TimeOfDay;
  minRel?: { npc: string; min: number };
  kind: "cat" | "note" | "invite" | "rain" | "text" | "coins" | "flower" | "favor" | "cafe" | "secret";
  title: string;
  lines: string[];
}

export const ENCOUNTERS: EncounterDef[] = [
  {
    id: "enc_cat",
    chance: 0.18,
    cooldownDays: 2,
    kind: "cat",
    title: "A cat",
    lines: ["A cat decided you were the assignment.", "It follows for a bit, then has other plans. Very cat."],
  },
  {
    id: "enc_note",
    chance: 0.12,
    cooldownDays: 3,
    once: true,
    location: "dubai_oasis",
    kind: "note",
    title: "A note",
    lines: ["Tucked under the door: his handwriting.", "\"coffee later. or now. or always. — m\""],
  },
  {
    id: "enc_baba_tea",
    chance: 0.22,
    cooldownDays: 2,
    location: "abudhabi_yas",
    kind: "invite",
    title: "Baba",
    lines: ["Baba waves from the villa.", "\"Tea? I already put the water on.\""],
  },
  {
    id: "enc_rain",
    chance: 0.1,
    cooldownDays: 3,
    city: "london",
    kind: "rain",
    title: "London weather",
    lines: ["Of course it rains. Fadwa will pretend she planned this."],
  },
  {
    id: "enc_fadwa_near",
    chance: 0.2,
    cooldownDays: 2,
    city: "london",
    kind: "text",
    title: "Fadwa",
    lines: ["Your phone buzzes.", "\"I'm literally around the corner 😂\""],
  },
  {
    id: "enc_coins",
    chance: 0.16,
    cooldownDays: 1,
    kind: "coins",
    title: "Lucky",
    lines: ["A few coins on the pavement. The city owed you one."],
  },
  {
    id: "enc_flower",
    chance: 0.14,
    cooldownDays: 1,
    kind: "flower",
    title: "A flower",
    lines: ["Someone's garden overflowed onto the path. You take one. Politely."],
  },
  {
    id: "enc_cafe",
    chance: 0.15,
    cooldownDays: 2,
    location: "dubai_hills",
    kind: "cafe",
    title: "Saddle",
    lines: ["There's a free table at Saddle like it was waiting.", "You know what that means."],
  },
  {
    id: "enc_night_szr",
    chance: 0.25,
    cooldownDays: 4,
    once: true,
    location: "dubai_szr",
    time: "night",
    kind: "secret",
    title: "Night drive",
    lines: ["The road is empty and gold. You keep this one."],
  },
];
