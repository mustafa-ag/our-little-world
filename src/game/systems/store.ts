import Phaser from "phaser";
import {
  defaultState,
  loadState,
  saveState,
  clearSave,
  type GameState,
  type PlacedFurniture,
} from "./save";

// A single shared store for the whole game. Because it's a module-level
// singleton it survives across scene changes. Emits events so the UI can
// react (hearts/coins changes, quest updates, toasts...).
class Store extends Phaser.Events.EventEmitter {
  state: GameState = defaultState();

  init() {
    this.state = loadState();
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
  setOutfit(id: string) {
    this.state.outfit = id;
    this.emit("outfit", id);
    this.save();
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

  // ---- flags & pickups ----
  setFlag(key: string, value = true) {
    this.state.flags[key] = value;
    this.save();
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

  toast(text: string, color = "#fff4e6") {
    this.emit("toast", text, color);
  }
}

export const store = new Store();
