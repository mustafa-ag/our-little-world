import { getLocation } from "../data/locations";
import { NPCS } from "../data/npcs";
import { responsePool, SUGGESTED_TEXTS, type ChatContext, type ChatIntent } from "../data/chatResponses";
import { store } from "./store";

const INTENTS: [ChatIntent, RegExp][] = [
  ["morning", /\b(morning|gm)\b/i], ["night", /\b(night|sleep|bed)\b/i], ["love", /\b(love|heart|♡|❤️)\b/i],
  ["miss", /\bmiss\b/i], ["where", /\bwhere\b/i], ["doing", /\b(doing|up to)\b/i], ["work", /\b(work|adnoc|job|office)\b/i],
  ["tired", /\b(tired|exhausted|sleepy)\b/i], ["hungry", /\b(hungry|food|eat)\b/i], ["coffee", /\b(coffee|karak|cafe)\b/i],
  ["home", /\b(home|house|sofa|furniture)\b/i], ["travel", /\b(travel|trip|italy|greece|santorini|positano|flight)\b/i],
  ["date", /\bdate\b/i], ["family", /\b(mama|baba|family|fadwa)\b/i], ["wedding", /\b(wedding|marry|marriage|engaged|fianc)\b/i],
  ["car", /\b(car|jeep|drive)\b/i], ["outfit", /\b(outfit|dress|wear|cute)\b/i], ["joke", /\b(joke|funny|laugh)\b/i], ["hello", /\b(hi|hey|hello|hii)\b/i],
];

export function chatContacts() {
  const preferred = ["moomoo", "baba", "mama", "fadwa", "jad", "shan", "nour"];
  const unlocked = NPCS.filter((npc) => preferred.includes(npc.id) || store.getRelationship(npc.id) > 0 || store.state.unlockedCompanions.includes(npc.id));
  return unlocked.sort((a, b) => (a.id === "moomoo" ? -1 : b.id === "moomoo" ? 1 : preferred.indexOf(a.id) - preferred.indexOf(b.id)));
}

export function suggestionsFor(contactId: string) {
  return SUGGESTED_TEXTS[contactId] ?? ["Hi ♡", "How are you?", "What are you doing?", "Coffee soon?"];
}

export function threadFor(contactId: string) {
  return store.state.chatEntries.filter((entry) => entry.contactId === contactId);
}

export function markThreadRead(contactId: string) {
  let changed = false;
  for (const entry of store.state.chatEntries) if (entry.contactId === contactId && entry.direction === "incoming" && !entry.read) { entry.read = true; changed = true; }
  if (changed) { store.emit("message", contactId); store.save(); }
}

function intentFor(body: string): ChatIntent {
  return INTENTS.find(([, pattern]) => pattern.test(body.normalize("NFKC")))?.[0] ?? "generic";
}

function nextId(prefix: string) {
  return `${prefix}:${store.state.currentDay}:${Date.now().toString(36)}:${store.state.chatEntries.length}`;
}

export function sendChat(contactId: string, rawBody: string) {
  const body = rawBody.trim().replace(/\s+/g, " ").slice(0, 280);
  if (!body || !chatContacts().some((contact) => contact.id === contactId)) return false;
  store.state.chatEntries.push({ id: nextId("out"), contactId, direction: "outgoing", body, day: store.state.currentDay, timeOfDay: store.state.timeOfDay, read: true });
  store.state.stats.moomoo_texts_sent = (store.state.stats.moomoo_texts_sent ?? 0) + (contactId === "moomoo" ? 1 : 0);
  const rewardKey = `chat_reward_${contactId}`;
  if (!store.hasDaily(rewardKey)) { store.setDaily(rewardKey); store.addRelationship(contactId, contactId === "moomoo" ? 1 : 0); }
  const location = getLocation(store.state.currentLocation);
  const context: ChatContext = { stage: store.state.relationshipStage, time: store.state.timeOfDay, locationName: location.name };
  const pool = responsePool(contactId, intentFor(body), context);
  const seed = body.length + store.state.currentDay * 7 + store.state.chatEntries.length + contactId.length;
  const reply = pool[Math.abs(seed) % pool.length];
  store.state.chatEntries.push({ id: nextId("in"), contactId, direction: "incoming", body: reply, day: store.state.currentDay, timeOfDay: store.state.timeOfDay, read: false });
  store.state.chatEntries = store.state.chatEntries.slice(-240);
  store.emit("message", contactId);
  store.save();
  return true;
}

