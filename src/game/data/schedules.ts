import type { TimeOfDay } from "../systems/save";

export interface ScheduleRule {
  npcId: string;
  location: string;
  time?: TimeOfDay;
  /** 0 = Friday in our calendar. */
  weekdays?: number[];
  tx?: number;
  ty?: number;
}

/** First matching rule wins. If none match, the NPC stays at their home location. */
export const SCHEDULES: ScheduleRule[] = [
  { npcId: "mama", time: "morning", location: "dubai_damac", tx: 18, ty: 28 },
  { npcId: "mama", time: "afternoon", location: "dubai_damac" },
  { npcId: "moomoo", time: "afternoon", location: "dubai_downtown", tx: 74, ty: 80 },
  { npcId: "moomoo", time: "evening", location: "dubai_oasis" },
  { npcId: "moomoo", time: "night", location: "dubai_oasis" },
  { npcId: "baba", weekdays: [0, 1], location: "abudhabi_yas" },
  { npcId: "baba", time: "afternoon", location: "abudhabi_corniche", tx: 40, ty: 44 },
  { npcId: "fadwa", time: "morning", location: "london_westminster", tx: 70, ty: 48 },
  { npcId: "fadwa", time: "afternoon", location: "london_westend" },
  { npcId: "fadwa", time: "evening", location: "london_westend" },
  { npcId: "hazel", time: "afternoon", location: "edinburgh_oldtown" },
  { npcId: "rhiannon", time: "afternoon", location: "edinburgh_oldtown" },
  { npcId: "chloe", time: "afternoon", location: "leicester" },
  { npcId: "nour", time: "evening", location: "germany" },
];

export const WEEKDAYS = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"] as const;

export function weekdayIndex(day: number) {
  return ((day - 1) % 7 + 7) % 7;
}

export function weekdayName(day: number) {
  return WEEKDAYS[weekdayIndex(day)];
}
