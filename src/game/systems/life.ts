import { NPCS, type NpcDef } from "../data/npcs";
import { scheduleFor, weekdayIndex } from "../data/schedules";
import { VOICES, bandFor, pickLine } from "../data/relationships";
import { HOME_COMMENTS } from "../data/relationships";
import { TILE } from "../constants";
import { store } from "./store";

export function npcWhere(npc: NpcDef) {
  const day = store.state.currentDay;
  const time = store.state.timeOfDay;
  const wd = weekdayIndex(day);
  const hit = scheduleFor(npc.id, day, time);
  if (!hit) {
    if (npc.id === "baba" && wd > 1) return { location: npc.location, tx: npc.tx, ty: npc.ty, present: false };
    return { location: npc.location, tx: npc.tx, ty: npc.ty, present: true };
  }
  return { location: hit.location, tx: hit.tx ?? npc.tx, ty: hit.ty ?? npc.ty, present: true };
}

export function npcActivity(npcId: string) {
  const rule = scheduleFor(npcId, store.state.currentDay, store.state.timeOfDay);
  return { activity: rule?.activity ?? "look", roamRadius: rule?.roamRadius ?? 8 };
}

export function npcApproachEmote(npcId: string) {
  const relationship = store.getRelationship(npcId);
  if (relationship >= 75) return { text: "♥", color: "#ffdbe7" };
  if (relationship >= 35) return { text: "☺", color: "#ffe08a" };
  if (relationship >= 10 || ["mama", "baba", "moomoo", "fadwa"].includes(npcId)) return { text: "!", color: "#fff4e6" };
  return { text: "...", color: "#d8cfe0" };
}

export function npcInLocation(locationId: string): NpcDef[] {
  return NPCS.filter((n) => {
    const w = npcWhere(n);
    if (n.id === "jad" || n.id === "shan") {
      return w.present && w.location === locationId && isYasBrotherVisiting(n.id);
    }
    return w.present && w.location === locationId;
  });
}

function isYasBrotherVisiting(npcId: "jad" | "shan") {
  const visitKey = "yas_brother_visit";
  const rivalKey = "yas_brother_is_jad";
  if (!(visitKey in store.state.dailyFlags)) {
    const visiting = Math.random() < 0.2;
    store.state.dailyFlags[visitKey] = visiting;
    if (visiting) store.state.dailyFlags[rivalKey] = Math.random() < 0.5;
    store.save();
  }
  const jadIsVisiting = store.state.dailyFlags[rivalKey] === true;
  return store.state.dailyFlags[visitKey] === true && (npcId === "jad" ? jadIsVisiting : !jadIsVisiting);
}

export function npcWorldPos(npc: NpcDef) {
  const w = npcWhere(npc);
  return { x: w.tx * TILE + TILE / 2, y: (w.ty + 1) * TILE };
}

export function linesFor(npcId: string, fallback: string[]) {
  const voice = VOICES[npcId];
  if (!voice) return fallback;
  const band = bandFor(store.getRelationship(npcId));
  const stageLines = npcId === "moomoo"
    ? store.state.relationshipStage === "married"
      ? ["There is my wife. Best part of the room.", "Come home with me after this. Our sofa misses being moved.", "Coffee, groceries, date night. I like our tiny domestic agenda."]
      : store.state.relationshipStage === "engaged"
        ? ["My fiancée is here. Sorry, I have to say it every time.", "Wedding plans later. Right now, stay with me a minute."]
        : []
    : [];
  const pool = [...stageLines, ...voice[band]];
  const seed = store.state.currentDay + Math.floor(store.getRelationship(npcId) / 5);
  return [pickLine(pool, seed), pickLine(pool, seed + 3)].filter((a, i, arr) => arr.indexOf(a) === i);
}

export function homeComment(): string | null {
  const counts: Record<string, number> = {};
  const furniture = store.state.properties[store.state.activeHomeId]?.furniture ?? store.state.furniture;
  for (const f of furniture) counts[f.tex] = (counts[f.tex] ?? 0) + 1;
  const total = furniture.length;
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
