import type { TimeOfDay } from "../systems/save";

export interface ScheduleRule {
  npcId: string;
  location: string;
  time?: TimeOfDay;
  /** 0 = Friday in our calendar. */
  weekdays?: number[];
  tx?: number;
  ty?: number;
  activity?: "coffee" | "phone" | "sit" | "stretch" | "look" | "chat" | "shop" | "water" | "computer" | "yawn" | "walk" | "tea";
  roamRadius?: number;
}

/** First matching rule wins. If none match, the NPC stays at their home location. */
export const SCHEDULES: ScheduleRule[] = [
  { npcId: "mama", time: "morning", location: "dubai_damac", tx: 18, ty: 28, activity: "water", roamRadius: 16 },
  { npcId: "mama", time: "afternoon", location: "dubai_damac", activity: "tea", roamRadius: 10 },
  { npcId: "mama", time: "evening", location: "dubai_damac", activity: "sit" },
  { npcId: "moomoo", time: "morning", location: "dubai_hills", tx: 58, ty: 48, activity: "coffee", roamRadius: 14 },
  { npcId: "moomoo", time: "afternoon", location: "dubai_downtown", tx: 74, ty: 80, activity: "coffee", roamRadius: 18 },
  { npcId: "moomoo", time: "evening", location: "dubai_oasis", activity: "walk", roamRadius: 20 },
  { npcId: "moomoo", time: "night", location: "dubai_oasis", activity: "phone" },
  { npcId: "baba", weekdays: [0, 1], location: "abudhabi_yas", activity: "tea", roamRadius: 12 },
  { npcId: "baba", time: "afternoon", location: "abudhabi_corniche", tx: 40, ty: 44, activity: "coffee", roamRadius: 15 },
  { npcId: "baba", time: "evening", location: "abudhabi_yas", activity: "walk", roamRadius: 16 },
  { npcId: "fadwa", time: "morning", location: "london_westminster", tx: 70, ty: 48, activity: "phone", roamRadius: 14 },
  { npcId: "fadwa", time: "afternoon", location: "london_westend", activity: "shop", roamRadius: 20 },
  { npcId: "fadwa", time: "evening", location: "london_westend", activity: "coffee", roamRadius: 12 },
  { npcId: "hazel", time: "morning", location: "edinburgh_dean", activity: "coffee" },
  { npcId: "hazel", time: "afternoon", location: "edinburgh_oldtown", activity: "walk", roamRadius: 17 },
  { npcId: "rhiannon", time: "afternoon", location: "edinburgh_oldtown", activity: "chat", roamRadius: 14 },
  { npcId: "rhiannon", time: "evening", location: "edinburgh_dean", activity: "sit" },
  { npcId: "chloe", time: "morning", location: "leicester", activity: "computer" },
  { npcId: "chloe", time: "afternoon", location: "leicester", activity: "coffee", roamRadius: 9 },
  { npcId: "chloe", time: "night", location: "leicester", activity: "yawn" },
  { npcId: "nour", time: "morning", location: "germany", activity: "computer" },
  { npcId: "nour", time: "evening", location: "germany", activity: "coffee", roamRadius: 12 },
];

export function scheduleFor(npcId: string, day: number, time: TimeOfDay) {
  const wd = weekdayIndex(day);
  return SCHEDULES.find((rule) => rule.npcId === npcId && (!rule.weekdays || rule.weekdays.includes(wd)) && (!rule.time || rule.time === time));
}

export const WEEKDAYS = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"] as const;

export function weekdayIndex(day: number) {
  return ((day - 1) % 7 + 7) % 7;
}

export function weekdayName(day: number) {
  return WEEKDAYS[weekdayIndex(day)];
}
