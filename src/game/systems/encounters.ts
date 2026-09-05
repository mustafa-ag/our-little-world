import { ENCOUNTERS, type EncounterDef } from "../data/encounters";
import { getLocation } from "../data/locations";
import { store } from "./store";
import { deliverMessage } from "./phone";
import { MESSAGES } from "../data/messages";

export function pickEncounter(locationId: string): EncounterDef | null {
  if (store.hasDaily("encounter")) return null;
  const loc = getLocation(locationId);
  const pool = ENCOUNTERS.filter((e) => {
    if (e.once && store.state.eventCooldowns[e.id] !== undefined) return false;
    if (!store.eventReady(e.id, e.cooldownDays)) return false;
    if (e.location && e.location !== locationId) return false;
    if (e.city && e.city !== loc.cityId) return false;
    if (e.time && e.time !== store.state.timeOfDay) return false;
    if (e.minRel && store.getRelationship(e.minRel.npc) < e.minRel.min) return false;
    return true;
  });
  if (!pool.length) return null;
  // A stable day/location roll prevents save-reload fishing for rare events.
  for (const event of pool) {
    if (dailyRoll(`${locationId}:${event.id}`) < event.chance) return event;
  }
  return null;
}

function dailyRoll(seed: string) {
  let hash = 2166136261;
  const input = `${store.state.currentDay}:${seed}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function applyEncounter(e: EncounterDef) {
  store.markEvent(e.id);
  store.setDaily("encounter");
  if (e.kind === "coins") store.addCoins(8);
  if (e.kind === "flower") store.addItem("flower");
  if (e.kind === "note") store.addItem("note");
  if (e.kind === "text") {
    const msg = MESSAGES.find((m) => m.sender === "fadwa");
    if (msg) deliverMessage(msg);
  }
  if (e.kind === "secret" && e.id === "enc_night_szr") {
    store.setFlag("night_walk");
    store.unlockMemory("mem_secret_night");
  }
  if (e.kind === "invite") store.addRelationship("baba", 1);
  return e;
}
