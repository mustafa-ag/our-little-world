import type { TimeOfDay } from "../systems/save";

export interface PhotoSpot {
  id: string;
  locationId: string;
  tx: number;
  ty: number;
  title: string;
  description: string;
  requiredNPC?: string;
  requiredRelationship?: { npc: string; min: number };
  requiredTime?: TimeOfDay;
  memoryId?: string;
}

export const PHOTO_SPOTS: PhotoSpot[] = [
  { id: "photo_yas_morning", locationId: "abudhabi_yas", tx: 72, ty: 24, title: "Yas morning", description: "Sun on the golf and nowhere urgent to be." },
  { id: "photo_corniche", locationId: "abudhabi_corniche", tx: 26, ty: 34, title: "Corniche light", description: "Water, karak, and a soft breeze.", requiredRelationship: { npc: "baba", min: 10 }, memoryId: "mem_corniche" },
  { id: "photo_downtown", locationId: "dubai_downtown", tx: 56, ty: 52, title: "Downtown together", description: "The city was very tall. You were still the point of it.", requiredRelationship: { npc: "moomoo", min: 10 }, memoryId: "mem_downtown" },
  { id: "photo_oasis", locationId: "dubai_oasis", tx: 68, ty: 60, title: "SO2 afternoon", description: "A little ordinary moment worth keeping.", requiredNPC: "moomoo", memoryId: "mem_oasis_coffee" },
  { id: "photo_westminster", locationId: "london_westminster", tx: 42, ty: 34, title: "Big Ben photo", description: "London, wind, and your sister laughing.", requiredNPC: "fadwa", memoryId: "mem_bigben" },
  { id: "photo_edinburgh", locationId: "edinburgh_oldtown", tx: 52, ty: 42, title: "Royal Mile", description: "A cobbled little proof that you were here." },
  { id: "photo_dean_evening", locationId: "edinburgh_dean", tx: 34, ty: 56, title: "Dean Village gold", description: "Everything turned warm just before dinner.", requiredTime: "evening", memoryId: "mem_edi_girls" },
  { id: "photo_last_exit", locationId: "abudhabi_last_exit", tx: 54, ty: 38, title: "Last Exit detour", description: "No plan, one detour, exactly right.", memoryId: "mem_last_exit" },
];

export const photoSpotsFor = (locationId: string) => PHOTO_SPOTS.filter((spot) => spot.locationId === locationId);
