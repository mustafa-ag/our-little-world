import Phaser from "phaser";
import {
  defaultState,
  createNewSaveSlot,
  getActiveSaveSlotId,
  getSaveSlots,
  getSaveArchive,
  restoreSaveArchive,
  archiveUpdatedAt,
  loadState,
  saveState,
  clearSave,
  type GameState,
  type PlacedFurniture,
  type TimeOfDay,
  type SavedPhoto,
  type Career,
  type ShoppingRunRecord,
} from "./save";
import {
  cloudSaveEnabled,
  currentCloudUser,
  readCloudArchive,
  signInOrCreateCloudSave,
  signOutOfCloud,
  writeCloudArchive,
  type CloudSaveStatus,
} from "./cloudSave";
import { ITEMS, giftRelGain, giftTier, itemById } from "../data/items";
import { NPCS } from "../data/npcs";
import { REL_MAX, VOICES, GIFT_GENERIC } from "../data/relationships";
import { MEMORIES, memoryById, memoriesForCity } from "../data/memories";
import { OUTFIT_UNLOCKS } from "../data/outfits";
import { weekdayName } from "../data/schedules";
import { RELATIONSHIP_MILESTONES } from "../data/relationshipMilestones";
import {
  activeQuestReplay,
  beginQuestReplay as createQuestReplay,
  finishQuestReplay,
  type QuestReplaySession,
} from "./questReplay";

const TIME_ORDER: TimeOfDay[] = ["morning", "afternoon", "evening", "night"];

function npcName(id: string) {
  return NPCS.find((n) => n.id === id)?.name ?? id;
}

// A single shared store for the whole game. Because it's a module-level
// singleton it survives across scene changes. Emits events so the UI can
// react (hearts/coins changes, quest updates, toasts...).
class Store extends Phaser.Events.EventEmitter {
  state: GameState = defaultState();
  cloudStatus: CloudSaveStatus = cloudSaveEnabled ? "signed-out" : "disabled";
  cloudEmail?: string;
  private cloudUserId?: string;
  private cloudSaveTimer?: number;
  private replayExitTimer?: number;

  init() {
    this.state = loadState();
    this.refreshOutfitUnlocks(false);
  }

  async syncCloud() {
    if (this.isQuestReplay) return;
    if (!cloudSaveEnabled) return;
    try {
      const user = await currentCloudUser();
      if (!user) {
        this.setCloudStatus("signed-out");
        return;
      }

      this.cloudUserId = user.id;
      this.cloudEmail = user.email;
      this.setCloudStatus("syncing");
      const localArchive = getSaveArchive();
      const remoteArchive = await readCloudArchive(user.id);
      if (this.isQuestReplay) return;
      const remoteState = remoteArchive ? restoreSaveArchive(remoteArchive) : undefined;

      if (!remoteArchive) {
        await writeCloudArchive(user.id, localArchive);
      } else if (!remoteState) {
        // A malformed remote record is never allowed to overwrite a valid device save.
        await writeCloudArchive(user.id, localArchive);
      } else {
        const remoteUpdatedAt = archiveUpdatedAt(getSaveArchive());
        const localUpdatedAt = archiveUpdatedAt(localArchive);
        if (localUpdatedAt > remoteUpdatedAt) {
          // restoreSaveArchive above only validates; put the local archive back before uploading it.
          restoreSaveArchive(localArchive);
          await writeCloudArchive(user.id, localArchive);
        } else {
          this.state = remoteState;
          this.refreshOutfitUnlocks(false);
          this.emit("changed");
        }
      }
      this.setCloudStatus("synced");
    } catch (error) {
      console.warn("Cloud save sync failed; local saves remain available.", error);
      this.setCloudStatus("error");
    }
  }

  async connectCloudSave(saveName: string, password: string) {
    try {
      const account = await signInOrCreateCloudSave(saveName, password);
      this.cloudEmail = account.email;
      await this.syncCloud();
      return account.created;
    } catch (error) {
      console.warn("Could not connect cloud saves.", error);
      this.setCloudStatus("error");
      throw error;
    }
  }

  async signOutOfCloud() {
    await signOutOfCloud();
    this.cloudUserId = undefined;
    this.cloudEmail = undefined;
    this.setCloudStatus("signed-out");
  }

  private setCloudStatus(status: CloudSaveStatus) {
    this.cloudStatus = status;
    this.emit("cloud", status, this.cloudEmail);
  }

  private queueCloudSave() {
    if (this.isQuestReplay) return;
    if (!this.cloudUserId) return;
    if (this.cloudSaveTimer !== undefined) window.clearTimeout(this.cloudSaveTimer);
    this.cloudSaveTimer = window.setTimeout(() => {
      this.cloudSaveTimer = undefined;
      void this.pushCloudSave();
    }, 700);
  }

  private async pushCloudSave() {
    if (this.isQuestReplay) return;
    if (!this.cloudUserId) return;
    try {
      if (this.isQuestReplay) return;
      await writeCloudArchive(this.cloudUserId, getSaveArchive());
      this.setCloudStatus("synced");
    } catch (error) {
      console.warn("Cloud save upload failed; it will retry after the next local save.", error);
      this.setCloudStatus("error");
    }
  }

  getSaveSlots() {
    return getSaveSlots();
  }

  get activeSaveSlotId() {
    return getActiveSaveSlotId();
  }

  loadSaveSlot(id: string) {
    if (this.isQuestReplay) this.exitQuestReplay(false);
    this.state = loadState(id);
    this.refreshOutfitUnlocks(false);
    this.emit("changed");
    this.queueCloudSave();
  }

  startNewSaveSlot(id: string) {
    if (this.isQuestReplay) this.exitQuestReplay(false);
    this.state = createNewSaveSlot(id);
    this.emit("changed");
    this.queueCloudSave();
  }

  save() {
    if (this.isQuestReplay) return;
    saveState(this.state);
    this.queueCloudSave();
  }

  reset() {
    if (this.isQuestReplay) this.exitQuestReplay(false);
    clearSave();
    this.state = defaultState();
    this.emit("changed");
    this.save();
  }

  // ---- quest replay sandbox ----
  get questReplay(): QuestReplaySession | undefined {
    return activeQuestReplay();
  }

  get isQuestReplay() {
    return !!activeQuestReplay();
  }

  beginQuestReplay(questId: string, originScene?: string) {
    if (this.isQuestReplay || this.state.quests[questId]?.status !== "done") return false;
    // Flush the canonical state before swapping the shared pointer.
    this.save();
    const replay = createQuestReplay(this.state, questId, originScene);
    if (!replay) return false;
    this.state = replay.sandbox;
    this.emit("replayMode", replay.session);
    this.emit("questUpdated");
    this.emit("changed");
    this.emit("toast", "REPLAY MODE · progress will not be saved", "#8ecae6");
    return true;
  }

  exitQuestReplay(completed = false) {
    const replay = finishQuestReplay();
    if (!replay) return false;
    if (this.replayExitTimer !== undefined) {
      window.clearTimeout(this.replayExitTimer);
      this.replayExitTimer = undefined;
    }
    this.state = replay.canonical;
    this.emit("changed");
    this.emit("hearts", this.state.hearts);
    this.emit("coins", this.state.coins);
    this.emit("questUpdated");
    this.emit("replayEnded", replay, completed);
    this.emit("toast", completed ? "Replay complete ♡ Original story progress restored." : "Replay ended · original story progress restored.", "#8ecae6");
    return true;
  }

  finishQuestReplaySoon(delayMs = 100) {
    if (!this.isQuestReplay) return;
    if (this.replayExitTimer !== undefined) window.clearTimeout(this.replayExitTimer);
    this.replayExitTimer = window.setTimeout(() => {
      this.replayExitTimer = undefined;
      this.exitQuestReplay(true);
    }, delayMs);
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

  // ---- career and Jeep fuel ----
  setCareer(career: Career) {
    if (this.state.career === career) return;
    this.state.career = career;
    this.emit("career", career);
    this.emit("toast", career === "ceo" ? "Career update: CEO!" : "Career update: Chemical Engineer", "#2f6fd0");
    this.save();
  }

  refuel(price = 6) {
    if (this.state.fuel >= 100) {
      this.emit("toast", "The Jeep is already full.", "#8ecae6");
      return false;
    }
    if (!this.spendCoins(price)) {
      this.emit("toast", "Not enough coins for fuel", "#e46d94");
      return false;
    }
    this.state.fuel = 100;
    this.emit("fuel", this.state.fuel);
    this.emit("toast", "Jeep refuelled: 100%", "#2f6fd0");
    this.save();
    return true;
  }

  useFuel(amount: number) {
    this.state.fuel = Math.max(0, this.state.fuel - Math.max(0, Math.round(amount)));
    this.emit("fuel", this.state.fuel);
    this.save();
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

  isAccessoryUnlocked(id: string) {
    return this.state.unlockedAccessories.includes(id);
  }

  unlockAccessory(id: string) {
    if (this.isAccessoryUnlocked(id)) return false;
    this.state.unlockedAccessories.push(id);
    if (!this.state.equippedAccessory) this.state.equippedAccessory = id;
    this.emit("accessory", this.state.equippedAccessory);
    this.emit("toast", `New accessory: ${id.replace(/_/g, " ")}`, "#f4c95d");
    this.save();
    return true;
  }

  setAccessory(id?: string) {
    if (id && !this.isAccessoryUnlocked(id)) return;
    this.state.equippedAccessory = id;
    this.emit("accessory", id);
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
    const property = this.state.properties[this.state.activeHomeId] ?? this.state.properties.starter_yas;
    property.furniture.push(f);
    if (this.state.activeHomeId === "starter_yas") this.state.furniture = property.furniture;
    this.emit("furniturePlaced", f);
    this.save();
  }

  setFurniture(list: PlacedFurniture[]) {
    const property = this.state.properties[this.state.activeHomeId] ?? this.state.properties.starter_yas;
    property.furniture = list;
    if (this.state.activeHomeId === "starter_yas") this.state.furniture = list;
    this.save();
  }

  storeFurniture(tex: string) {
    const property = this.state.properties[this.state.activeHomeId] ?? this.state.properties.starter_yas;
    property.storedFurniture.push(tex);
    if (this.state.activeHomeId === "starter_yas") this.state.storedFurniture = property.storedFurniture;
    this.save();
  }

  takeStoredFurniture(tex: string): boolean {
    const property = this.state.properties[this.state.activeHomeId] ?? this.state.properties.starter_yas;
    const i = property.storedFurniture.indexOf(tex);
    if (i < 0) return false;
    property.storedFurniture.splice(i, 1);
    if (this.state.activeHomeId === "starter_yas") this.state.storedFurniture = property.storedFurniture;
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
    this.state.dailyWorldEvents = [];
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
    const previous = this.getRelationship(npcId);
    this.state.relationships[npcId] = Phaser.Math.Clamp(Math.round(value), 0, REL_MAX);
    this.applyRelationshipMilestones(npcId, previous, this.state.relationships[npcId]);
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

  private applyRelationshipMilestones(npcId: string, previous: number, next: number) {
    for (const milestone of RELATIONSHIP_MILESTONES) {
      if (milestone.npcId !== npcId || previous >= milestone.threshold || next < milestone.threshold) continue;
      const flag = `milestone_${milestone.id}`;
      if (this.state.flags[flag]) continue;
      this.state.flags[flag] = true;
      if (milestone.companionUnlock && !this.state.unlockedCompanions.includes(npcId)) this.state.unlockedCompanions.push(npcId);
      if (milestone.keepsake && !this.state.keepsakes.includes(milestone.keepsake)) this.state.keepsakes.push(milestone.keepsake);
      if (milestone.memoryId) this.unlockMemory(milestone.memoryId);
      this.emit("milestone", milestone);
      this.emit("toast", `Relationship · ${milestone.title}`, "#f4c95d");
    }
  }

  // ---- companions ----
  unlockCompanion(id: string) {
    if (this.state.unlockedCompanions.includes(id)) return false;
    this.state.unlockedCompanions.push(id);
    this.emit("companionUnlocked", id);
    this.emit("toast", `${npcName(id)} can now travel with Juju`, "#ff8fae");
    this.save();
    return true;
  }

  setActiveCompanion(id?: string) {
    if (id && !this.state.unlockedCompanions.includes(id)) return false;
    this.state.activeCompanionId = id;
    this.emit("companion", id);
    this.save();
    return true;
  }

  // ---- keepsakes ----
  hasKeepsake(id: string) {
    return this.state.keepsakes.includes(id);
  }

  unlockKeepsake(id: string, silent = false) {
    if (this.state.keepsakes.includes(id)) return false;
    this.state.keepsakes.push(id);
    if (!silent) this.emit("toast", `Keepsake · ${id.replace(/^shopping_/, "").replace(/_/g, " ")}`, "#f4c95d");
    this.save();
    return true;
  }

  recordShoppingRun(run: ShoppingRunRecord) {
    this.state.shoppingHistory = [...this.state.shoppingHistory, run].slice(-12);
    this.save();
  }

  // ---- photos & notes ----
  capturePhoto(photo: SavedPhoto) {
    if (this.state.photos[photo.id]) return false;
    // Metadata-only Polaroids are tiny, but a cap keeps decade-long saves tidy.
    const existing = Object.values(this.state.photos).sort((a, b) => a.day - b.day);
    if (existing.length >= 48) delete this.state.photos[existing[0].id];
    this.state.photos[photo.id] = photo;
    this.state.stats.photos_taken = (this.state.stats.photos_taken ?? 0) + 1;
    this.emit("photo", photo.id);
    this.emit("toast", `Polaroid · ${photo.title}`, "#8ecae6");
    this.save();
    return true;
  }

  addNote(id: string) {
    if (this.state.discoveredNotes.includes(id)) return false;
    this.state.discoveredNotes.push(id);
    this.emit("note", id);
    this.save();
    return true;
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
    if (id === "coffee") this.state.stats.coffees_made = (this.state.stats.coffees_made ?? 0) + n;
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
    if (npcId === "mama" && (itemId === "flower" || itemId === "bouquet")) {
      this.state.stats.flowers_for_mama = (this.state.stats.flowers_for_mama ?? 0) + (itemId === "bouquet" ? 3 : 1);
    }
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
    this.state.stats.secrets_found = (this.state.stats.secrets_found ?? 0) + 1;
    this.addNote(id);
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

  offerWorldEvent(id: string) {
    if (!this.state.dailyWorldEvents.includes(id)) this.state.dailyWorldEvents.push(id);
    this.state.eventCooldowns[id] = this.state.currentDay;
    this.save();
  }

  completeWorldEvent(id: string) {
    const key = `world_event_complete_${id}_${this.state.currentDay}`;
    if (this.state.dailyFlags[key]) return false;
    this.state.dailyFlags[key] = true;
    this.state.flags[`world_event_done_${id}`] = true;
    this.state.stats.random_events_completed = (this.state.stats.random_events_completed ?? 0) + 1;
    this.emit("worldEventCompleted", id);
    this.save();
    return true;
  }

  setCatStage(stage: number) {
    const next = Phaser.Math.Clamp(Math.floor(stage), 0, 4);
    if (next <= this.state.cat.stage) return false;
    this.state.cat.stage = next;
    this.state.cat.lastSeenDay = this.state.currentDay;
    this.state.cat.adopted = next >= 4;
    this.emit("cat", this.state.cat);
    this.save();
    return true;
  }

  adoptCat() {
    const changed = !this.state.cat.adopted;
    this.state.cat.stage = 4;
    this.state.cat.adopted = true;
    this.state.cat.lastSeenDay = this.state.currentDay;
    if (changed) {
      this.state.stats.cat_adoptions = (this.state.stats.cat_adoptions ?? 0) + 1;
      this.emit("cat", this.state.cat);
      this.emit("toast", "NEW ROOMMATE · Mishmish", "#f4a6c0");
    }
    this.save();
    return changed;
  }

  petCat() {
    this.state.stats.cat_pets = (this.state.stats.cat_pets ?? 0) + 1;
    this.emit("catPet", this.state.stats.cat_pets);
    this.save();
  }

  // ---- Tigor (independent permanent pet) ----
  setTigorChapter(chapter: number) {
    this.state.tigor.missionChapter = Phaser.Math.Clamp(Math.floor(chapter), 0, 5);
    this.save();
  }

  unlockTigor() {
    const first = !this.state.tigor.unlocked;
    this.state.tigor.unlocked = true;
    this.state.tigor.atHome = true;
    this.state.tigor.following = false;
    this.state.tigor.missionChapter = 5;
    if (first) {
      this.state.stats.pets_brought_home = (this.state.stats.pets_brought_home ?? 0) + 1;
      this.emit("toast", "NEW FAMILY MEMBER · TIGOR", "#f4c95d");
    }
    this.emit("petChanged", this.state.tigor);
    this.save();
    return first;
  }

  setTigorFollowing(following: boolean) {
    if (!this.state.tigor.unlocked) return false;
    this.state.tigor.following = following;
    this.state.tigor.atHome = !following;
    this.emit("petChanged", this.state.tigor);
    this.emit("toast", following ? "Tigor is padding along with you." : "Tigor is waiting at home.", "#f4c95d");
    this.save();
    return true;
  }

  petTigor() {
    if (!this.state.tigor.unlocked) return;
    this.state.stats.tigor_pets = (this.state.stats.tigor_pets ?? 0) + 1;
    this.emit("petTigor", this.state.stats.tigor_pets);
    this.save();
  }

  unlockSouvenir(id: string) {
    if (this.state.souvenirs.includes(id)) return false;
    this.state.souvenirs.push(id);
    if (this.state.displayedSouvenirs.length < 5) this.state.displayedSouvenirs.push(id);
    this.emit("souvenir", id);
    this.emit("toast", `Souvenir · ${id.replace(/^souvenir_/, "").replace(/_/g, " ")}`, "#f4c95d");
    this.save();
    return true;
  }

  toggleSouvenirDisplay(id: string) {
    if (!this.state.souvenirs.includes(id)) return false;
    const index = this.state.displayedSouvenirs.indexOf(id);
    if (index >= 0) this.state.displayedSouvenirs.splice(index, 1);
    else {
      if (this.state.displayedSouvenirs.length >= 5) this.state.displayedSouvenirs.shift();
      this.state.displayedSouvenirs.push(id);
    }
    this.save();
    return index < 0;
  }

  incrementStat(id: string, amount = 1) {
    const next = (this.state.stats[id] ?? 0) + amount;
    this.state.stats[id] = next;
    this.save();
    return next;
  }

  getStat(id: string) {
    return this.state.stats[id] ?? 0;
  }

  toast(text: string, color = "#fff4e6") {
    this.emit("toast", text, color);
  }

  unreadCount() {
    const legacyUnread = this.state.messages.filter((m) => !m.read && !this.state.chatEntries.some((entry) => entry.id === `story:${m.id}` || entry.id === `legacy:${m.id}`)).length;
    return legacyUnread + this.state.chatEntries.filter((entry) => entry.direction === "incoming" && !entry.read).length;
  }
}

export const store = new Store();
