import { PROPERTIES, propertyById } from "../data/properties";
import type { HomeLayout, PropertyState } from "./save";
import { store } from "./store";
import * as quests from "./quests";

const emptyLayout = (): HomeLayout => ({ floors: [], walls: [], doors: [] });

export function ensurePropertyState(id: string): PropertyState {
  const existing = store.state.properties[id];
  if (existing) return existing;
  const starter = id === "starter_yas";
  const state: PropertyState = { owned: starter, visited: starter, layout: emptyLayout(), furniture: [], storedFurniture: [] };
  store.state.properties[id] = state;
  return state;
}

export function propertyStatus(id: string) {
  const def = propertyById(id);
  const state = ensurePropertyState(id);
  const locked = !!def.requiresMarriage && store.state.relationshipStage !== "married";
  return { def, state, locked, affordable: store.state.coins >= def.price };
}

export function visitProperty(id: string) {
  const state = ensurePropertyState(id);
  const def = propertyById(id);
  state.visited = true;
  store.state.activeHomeId = id;
  store.unlockLocation(def.locationId);
  if (def.locationId.startsWith("italy_")) store.unlockLocation("italy");
  if (def.locationId.startsWith("greece_")) store.unlockLocation("greece");
  store.setLocation(def.locationId);
  store.incrementStat("property_tours");
  store.save();
  return def;
}

export function buyProperty(id: string) {
  const { def, state, locked } = propertyStatus(id);
  if (state.owned) return { ok: false, reason: "This home is already yours." };
  if (locked) return { ok: false, reason: "Plan this one together after the wedding." };
  if (!state.visited) return { ok: false, reason: "Tour it first. Big decisions deserve a walk around." };
  if (!store.spendCoins(def.price)) return { ok: false, reason: `Save ${def.price - store.state.coins} more coins.` };
  state.owned = true;
  state.purchasedDay = store.state.currentDay;
  store.state.activeHomeId = id;
  store.state.stats.properties_owned = PROPERTIES.filter((property) => store.state.properties[property.id]?.owned).length;
  store.state.stats.coins_spent_homes = (store.state.stats.coins_spent_homes ?? 0) + def.price;
  store.state.flags[`moving_day_${id}`] = true;
  store.unlockLocation(def.locationId);
  const cityId = def.locationId.split("_")[0];
  if (cityId === "italy" || cityId === "greece") store.unlockLocation(cityId);
  store.emit("propertyBought", id);
  quests.onBuyProperty(id);
  store.save();
  return { ok: true, reason: `${def.name} is yours ♡` };
}

export function setPrimaryHome(id: string) {
  if (!ensurePropertyState(id).owned) return false;
  store.state.primaryHomeId = id;
  store.state.activeHomeId = id;
  store.incrementStat("house_moves");
  store.save();
  return true;
}

export function savePropertyState(id: string, property: PropertyState) {
  store.state.properties[id] = property;
  if (id === "starter_yas") {
    store.state.furniture = property.furniture;
    store.state.storedFurniture = property.storedFurniture;
  }
  store.save();
}
