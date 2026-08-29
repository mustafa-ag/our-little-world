import { MESSAGES, type MessageDef } from "../data/messages";
import { getLocation } from "../data/locations";
import { store } from "./store";

function alreadyHas(id: string) {
  return store.state.messages.some((m) => m.id === id);
}

function unlocked(def: MessageDef) {
  const u = def.unlock;
  if (u.minDay && store.state.currentDay < u.minDay) return false;
  if (u.flag && !store.hasFlag(u.flag)) return false;
  if (u.memory && !store.hasMemory(u.memory)) return false;
  if (u.questDone && store.state.quests[u.questDone]?.status !== "done") return false;
  if (u.questActive && store.state.quests[u.questActive]?.status !== "active") return false;
  if (u.relationship && store.getRelationship(u.relationship.npc) < u.relationship.min) return false;
  if (u.location && store.state.currentLocation !== u.location) return false;
  if (u.city) {
    const loc = getLocation(store.state.currentLocation);
    if (loc.cityId !== u.city) return false;
  }
  return true;
}

export function deliverMessage(def: MessageDef) {
  if (alreadyHas(def.id)) return false;
  store.state.messages.unshift({
    id: def.id,
    sender: def.sender,
    body: def.body,
    day: store.state.currentDay,
    read: false,
    questId: def.questId,
  });
  store.emit("message", def.id);
  store.emit("toast", "New text", "#8ecae6");
  store.save();
  return true;
}

/** Deliver at most `limit` newly-unlocked messages. Skip wake-only unless waking. */
export function tryDeliverMessages(opts: { wake?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 1;
  let n = 0;
  for (const def of MESSAGES) {
    if (n >= limit) break;
    if (alreadyHas(def.id)) continue;
    if (def.unlock.onWake && !opts.wake) continue;
    if (!unlocked(def)) continue;
    if (deliverMessage(def)) n += 1;
  }
  return n;
}

export function markRead(id: string) {
  const m = store.state.messages.find((x) => x.id === id);
  if (!m || m.read) return;
  m.read = true;
  store.emit("message", id);
  store.save();
}

export function markAllRead() {
  for (const m of store.state.messages) m.read = true;
  store.emit("message", "*");
  store.save();
}
