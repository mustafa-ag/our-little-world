import { WORLD_EVENTS, type WorldEventDefinition } from "../data/worldEvents";
import { getLocation } from "../data/locations";
import { store } from "./store";
import { tryDeliverMessages } from "./phone";

export function stableDailyRoll(seed: string) {
  let hash = 2166136261;
  const input = `${store.state.currentDay}:${seed}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function dailyWorldEventAllowance() {
  if (new URLSearchParams(window.location.search).has("lifeDebug")) return 2;
  const roll = stableDailyRoll("world-event-allowance");
  return roll < 0.3 ? 0 : roll < 0.85 ? 1 : 2;
}

export function pickWorldEvent(locationId: string): WorldEventDefinition | null {
  if (store.state.dailyWorldEvents.length >= dailyWorldEventAllowance()) return null;
  const location = getLocation(locationId);
  const pool = WORLD_EVENTS.filter((event) => {
    if (store.state.dailyWorldEvents.includes(event.id)) return false;
    if (!store.eventReady(event.id, event.cooldownDays)) return false;
    if (event.allowedLocations && !event.allowedLocations.includes(locationId)) return false;
    if (event.allowedCities && !event.allowedCities.includes(location.cityId)) return false;
    if (event.times && !event.times.includes(store.state.timeOfDay)) return false;
    if (event.requiresCatStage !== undefined && store.state.cat.stage < event.requiresCatStage) return false;
    if (event.maxCatStage !== undefined && store.state.cat.stage > event.maxCatStage) return false;
    if (event.relationshipStage && store.state.relationshipStage !== event.relationshipStage) return false;
    if ((event.kind === "cat_snack" || event.kind === "cat_friend") && store.state.cat.lastSeenDay >= store.state.currentDay) return false;
    return true;
  });
  if (!pool.length) return null;

  // Weighted but deterministic: save/reload cannot reroll a preferred event.
  return pool
    .map((event) => ({ event, score: stableDailyRoll(`${locationId}:${event.id}`) / Math.max(0.1, event.weight) }))
    .sort((a, b) => a.score - b.score)[0].event;
}

export function beginWorldEvent(event: WorldEventDefinition) {
  store.offerWorldEvent(event.id);
}

export function finishWorldEvent(event: WorldEventDefinition) {
  if (!store.completeWorldEvent(event.id)) return false;
  if (event.reward?.hearts) store.addHearts(event.reward.hearts);
  if (event.reward?.coins) store.addCoins(event.reward.coins);
  if (event.reward?.relationship) store.addRelationship(event.reward.relationship.npc, event.reward.relationship.amount);
  if (event.reward?.memory) store.unlockMemory(event.reward.memory);
  if (event.kind === "cat_box") store.setCatStage(1);
  if (event.kind === "cat_snack") store.setCatStage(2);
  if (event.kind === "cat_friend") store.setCatStage(3);
  tryDeliverMessages({ limit: 1 });
  return true;
}

export function touristChoices(cityId: string) {
  const choices: Record<string, { label: string; correct: boolean }[]> = {
    abudhabi: [
      { label: "Toward the Corniche", correct: true },
      { label: "Behind that one palm", correct: false },
      { label: "Follow the coffee cups", correct: false },
    ],
    dubai: [
      { label: "Toward the tall skyline", correct: true },
      { label: "Take three identical lifts", correct: false },
      { label: "Ask the nearest cat", correct: false },
    ],
    london: [
      { label: "Toward Westminster", correct: true },
      { label: "Any red bus, probably", correct: false },
      { label: "Follow the dramatic pigeons", correct: false },
    ],
    edinburgh: [
      { label: "Up toward the old town", correct: true },
      { label: "Down every staircase", correct: false },
      { label: "Where the umbrella points", correct: false },
    ],
    germany: [
      { label: "Past the coffee square", correct: true },
      { label: "Follow the coldest breeze", correct: false },
      { label: "Wait for Nour", correct: false },
    ],
    italy: [
      { label: "Down toward the sea", correct: true }, { label: "Up every staircase", correct: false }, { label: "Follow the lemon scent", correct: false },
    ],
    greece: [
      { label: "Along the blue-door lane", correct: true }, { label: "Straight into the caldera", correct: false }, { label: "Ask the nearest cat", correct: false },
    ],
  };
  return choices[cityId] ?? [
    { label: "Straight, then left", correct: true },
    { label: "Left, then more left", correct: false },
    { label: "Three steps that way", correct: false },
  ];
}
