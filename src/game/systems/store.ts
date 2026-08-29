import Phaser from "phaser";
import {
  defaultState,
  loadState,
  saveState,
  clearSave,
  type GameState,
  type PlacedFurniture,
  type TimeOfDay,
} from "./save";
import { ITEMS, giftRelGain, giftTier, itemById } from "../data/items";
import { NPCS } from "../data/npcs";
import { REL_MAX, VOICES, GIFT_GENERIC } from "../data/relationships";
import { MEMORIES, memoryById, memoriesForCity } from "../data/memories";
import { OUTFIT_UNLOCKS } from "../data/outfits";
import { weekdayName } from "../data/schedules";

const TIME_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "night"];

function npcName(id: string) {
  return NPCS.find((n) => n.id === id)?.name ?? id;
}

// A single shared store for the whole game. Because it's a module-level
// singleton it survives across scene changes. Emits events so the UI can
// react (hearts/coins changes, quest updates, toasts...).
class Store extends Phaser.Events.EventEmitter {
  state: GameState = defaultState();

  init() {
    this.state = loadState();
    this.refreshOutfitUnlocks(false);
  }

  save() {
    saveState(this.state);
  }

  reset() {
    clearSave();
    this.state = defaultState();
    this.emit("changed");
    this.save();
  }

  // ---- currencies ----
  addHearts(n: number) {
    this.state.hearts += n;
    this.emit("hearts", this.state.hearts);
    if (n > 0) this.emit("toast", `+${n} ❤`, "#ff5c8a");
    this.save();
  }

  addCoins(n: number) {
    this.state.coins += n;
    this.emit("coins", this.state.coins);
    if (n !== 0) this.emit("toast", `${n > 0 ? "+" : ""}${n} coins`, "#f4c95d");
    this.save();
  }

  spendCoins(n: number): boolean {
    if (this.state.coins < n) return false;
    this.state.coins -= n;
    this.emit("coins", this.state.coins);
    this.save();
    return true;
  }

  // ---- outfit ----
  isOutfitUnlocked(id: string) {
    return this.state.unlockedOutfits.includes(id);
  }

  unlockOutfit(id: string, silent = false) {
    if (this.state.unlockedOutfits.includes(id)) return false;
    this.state.unlockedOutfits.push(id);
    const label = OUTFIT_UNLOCKS.find((o) => o.id === id)?.label ?? id;
    if (!silent) {
      this.emit("toast", `New fit: ${label}`, "#f4a6c0");
      this.emit("unlock", "outfit", id);
    }
    this.save();
    return true;
  }

  setOutfit(id: string) {
    if (!this.isOutfitUnlocked(id)) return;
    this.state.outfit = id;
    this.emit("outfit", id);
    this.save();
  }

  refreshOutfitUnlocks(announce = true) {
    for (const o of OUTFIT_UNLOCKS) {
      if (this.state.unlockedOutfits.includes(o.id)) continue;
      let ok = false;
      if (o.starter) ok = true;
      if (o.flag && this.hasFlag(o.flag)) ok = true;
      if (o.questDone && this.state.quests[o.questDone]?.status === "done") ok = true;
      if (o.relationship && this.getRelationship(o.relationship.npc) >= o.relationship.min) ok = true;
      if (o.memoryCity) {
        const all = memoriesForCity(o.memoryCity);
        ok = all.every((m) => !!this.state.memories[m.id]);
      }
      if (ok) this.unlockOutfit(o.id, !announce);
    }
  }

  // ---- locations ----
  unlockLocation(id: string) {
    if (!this.state.unlockedLocations.includes(id)) {
      this.state.unlockedLocations.push(id);
      this.emit("toast", "New place unlocked!", "#8ecae6");
    }
    this.save();
  }

  isUnlocked(id: string) {
    return this.state.unlockedLocations.includes(id);
  }

  setLocation(id: string) {
    this.state.currentLocation = id;
    this.save();
  }

  setInJeep(on: boolean) {
    this.state.inJeep = on;
    this.save();
  }

  // ---- flags & pickups ----
  setFlag(key: string, value = true) {
    this.state.flags[key] = value;
    this.save();
    this.refreshOutfitUnlocks();
  }

  hasFlag(key: string) {
    return !!this.state.flags[key];
  }

  collect(id: string): boolean {
    if (this.state.collected[id]) return false;
    this.state.collected[id] = true;
    this.save();
    return true;
  }

  // ---- furniture ----
  placeFurniture(f: PlacedFurniture) {
    this.state.furniture.push(f);
    this.save();
  }

  setFurniture(list: PlacedFurniture[]) {
    this.state.furniture = list;
    this.save();
  }

  storeFurniture(tex: string) {
    this.state.storedFurniture.push(tex);
    this.save();
  }

  takeStoredFurniture(tex: string): boolean {
    const i = this.state.storedFurniture.indexOf(tex);
    if (i < 0) return false;
    this.state.storedFurniture.splice(i, 1);
    this.save();
    return true;
  }

  // ---- day / time ----
  clockLabel() {
    const t =
      this.state.timeOfDay === "morning"
        ? "Morning"
        : this.state.timeOfDay === "afternoon"
          ? "Afternoon"
          : this.state.timeOfDay === "evening"
            ? "Evening"
            : "Night";
    return `Day ${this.state.currentDay} · ${weekdayName(this.state.currentDay)} · ${t}`;
  }

  advanceTime() {
    const i = TIME_ORDER.indexOf(this.state.timeOfDay);
    if (i < 0 || i >= TIME_ORDER.length - 1) return false;
    this.state.timeOfDay = TIME_ORDER[i + 1];
    this.emit("time", this.state.timeOfDay);
    this.save();
    return true;
  }

  sleep() {
    this.state.currentDay += 1;
    this.state.timeOfDay = "morning";
    this.state.dailyFlags = {};
    this.emit("time", this.state.timeOfDay);
    this.emit("newDay", this.state.currentDay);
    this.save();
  }

  setDaily(key: string, value = true) {
    this.state.dailyFlags[key] = value;
    this.save();
  }

  hasDaily(key: string) {
    return !!this.state.dailyFlags[key];
  }

  // ---- relationships ----
  getRelationship(npcId: string) {
    return this.state.relationships[npcId] ?? 0;
  }

  setRelationship(npcId: string, value: number) {
    this.state.relationships[npcId] = Phaser.Math.Clamp(Math.round(value), 0, REL_MAX);
    this.emit("relationship", npcId, this.state.relationships[npcId]);
    this.save();
    this.refreshOutfitUnlocks();
  }

  addRelationship(npcId: string, amount: number) {
    if (!amount) return this.getRelationship(npcId);
    const next = this.getRelationship(npcId) + amount;
    this.setRelationship(npcId, next);
    if (amount > 0) {
      this.emit("toast", `${npcName(npcId)} ♡ +${amount}`, "#ff8fae");
      this.emit("relGain", npcId, amount);
    }
    return this.getRelationship(npcId);
  }

  // ---- inventory ----
  getItemQuantity(id: string) {
    return this.state.inventory[id] ?? 0;
  }

  hasItem(id: string, n = 1) {
    return this.getItemQuantity(id) >= n;
  }

  addItem(id: string, n = 1) {
    if (!ITEMS[id] || n <= 0) return;
    this.state.inventory[id] = this.getItemQuantity(id) + n;
    const def = itemById(id);
    this.emit("inventory", id, this.state.inventory[id]);
    this.emit("toast", `+${n} ${def?.name ?? id}`, "#fff4e6");
    this.emit("pickup", id, n);
    this.save();
  }

  removeItem(id: string, n = 1): boolean {
    if (!this.hasItem(id, n)) return false;
    this.state.inventory[id] = this.getItemQuantity(id) - n;
    if (this.state.inventory[id] <= 0) delete this.state.inventory[id];
    this.emit("inventory", id, this.state.inventory[id] ?? 0);
    this.save();
    return true;
  }

  giftableItems() {
    return Object.keys(this.state.inventory).filter((id) => ITEMS[id]?.giftable && this.state.inventory[id] > 0);
  }

  giveGift(npcId: string, itemId: string) {
    if (!this.removeItem(itemId, 1)) return null;
    const tier = giftTier(npcId, itemId);
    const gain = giftRelGain(tier);
    this.addRelationship(npcId, gain);
    const voice = VOICES[npcId];
    const line = voice?.gifts[itemId] ?? voice?.giftFallback[tier] ?? GIFT_GENERIC[tier];
    this.emit("gift", npcId, itemId, gain);
    this.save();
    return { line, gain, tier };
  }

  // ---- memories ----
  hasMemory(id: string) {
    return !!this.state.memories[id];
  }

  unlockMemory(id: string) {
    if (this.state.memories[id]) return false;
    const def = memoryById(id);
    this.state.memories[id] = { day: this.state.currentDay };
    this.emit("memory", id);
    this.emit("toast", def ? `Memory · ${def.title}` : "New memory", "#8ecae6");
    this.save();
    this.refreshOutfitUnlocks();
    return true;
  }

  memoryProgress(cityId: string) {
    const all = memoriesForCity(cityId);
    const have = all.filter((m) => this.state.memories[m.id]).length;
    return { have, total: all.length };
  }

  // ---- secrets ----
  discoverSecret(id: string) {
    if (this.state.discoveredSecrets.includes(id)) return false;
    this.state.discoveredSecrets.push(id);
    this.emit("secret", id);
    this.save();
    return true;
  }

  hasSecret(id: string) {
    return this.state.discoveredSecrets.includes(id);
  }

  locationSecrets(locationId: string, total: number) {
    const have = this.state.discoveredSecrets.filter((id) => id.includes(locationId) || id.startsWith("sec_")).length;
    return { have, total };
  }

  // ---- events ----
  eventReady(id: string, cooldownDays: number) {
    const last = this.state.eventCooldowns[id];
    if (last === undefined) return true;
    return this.state.currentDay - last >= cooldownDays;
  }

  markEvent(id: string) {
    this.state.eventCooldowns[id] = this.state.currentDay;
    this.save();
  }

  toast(text: string, color = "#fff4e6") {
    this.emit("toast", text, color);
  }

  unreadCount() {
    return this.state.messages.filter((m) => !m.read).length;
  }
}

export const store = new Store();
