import { NPCS, type NpcDef } from "../data/npcs";
import { SCHEDULES, weekdayIndex } from "../data/schedules";
import { VOICES, bandFor, pickLine } from "../data/relationships";
import { HOME_COMMENTS } from "../data/relationships";
import { TILE } from "../constants";
import { store } from "./store";

export function npcWhere(npc: NpcDef) {
  const day = store.state.currentDay;
  const time = store.state.timeOfDay;
  const wd = weekdayIndex(day);
  const hit = SCHEDULES.find((r) => {
    if (r.npcId !== npc.id) return false;
    if (r.weekdays && !r.weekdays.includes(wd)) return false;
    if (r.time && r.time !== time) return false;
    return true;
  });
  if (!hit) {
    if (npc.id === "baba" && wd > 1) return { location: npc.location, tx: npc.tx, ty: npc.ty, present: false };
    return { location: npc.location, tx: npc.tx, ty: npc.ty, present: true };
  }
  return { location: hit.location, tx: hit.tx ?? npc.tx, ty: hit.ty ?? npc.ty, present: true };
}

export function npcInLocation(locationId: string): NpcDef[] {
  return NPCS.filter((n) => {
    const w = npcWhere(n);
    return w.present && w.location === locationId;
  });
}

export function npcWorldPos(npc: NpcDef) {
  const w = npcWhere(npc);
  return { x: w.tx * TILE + TILE / 2, y: (w.ty + 1) * TILE };
}

export function linesFor(npcId: string, fallback: string[]) {
  const voice = VOICES[npcId];
  if (!voice) return fallback;
  const band = bandFor(store.getRelationship(npcId));
  const pool = voice[band];
  const seed = store.state.currentDay + Math.floor(store.getRelationship(npcId) / 5);
  return [pickLine(pool, seed), pickLine(pool, seed + 3)].filter((a, i, arr) => arr.indexOf(a) === i);
}

export function homeComment(): string | null {
  const counts: Record<string, number> = {};
  for (const f of store.state.furniture) counts[f.tex] = (counts[f.tex] ?? 0) + 1;
  const total = store.state.furniture.length;
  const hits = HOME_COMMENTS.filter((c) => {
    try {
      return (c.test as (a: Record<string, number>, b: number) => boolean)(counts, total);
    } catch {
      return false;
    }
  });
  if (!hits.length) return null;
  return hits[store.state.currentDay % hits.length].line;
}

const TINT: Record<string, number> = {
  morning: 0xfff4e0,
  afternoon: 0xffffff,
  evening: 0xffc9a0,
  night: 0x6a7cb8,
};

export function worldTint() {
  return TINT[store.state.timeOfDay] ?? 0xffffff;
}

export function skyHex() {
  if (store.state.timeOfDay === "night") return "#1b2238";
  if (store.state.timeOfDay === "evening") return "#e89b6a";
  if (store.state.timeOfDay === "morning") return "#f2d7a6";
  return "#7bc86c";
}
