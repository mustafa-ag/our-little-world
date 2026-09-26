// Engine-free interactable registry. Mirrors WorldScene's `interactables` +
// `currentPrompt` logic: every frame the nearest interactable within its
// radius becomes the current prompt and `uiEvents.emit("prompt", text | null)`
// fires only when it changes. Positions are in world units (see coords.ts).

import { uiEvents } from "../../game/systems/controls";

export type InteractableKind = "npc" | "zone" | "collectible" | "secret" | "quest" | "vehicle";

export interface Interactable {
  id: string;
  x: number;
  z: number;
  radius: number;
  prompt: string;
  kind: InteractableKind;
  trigger: () => void;
  /** optional gate (e.g. jeep cooldown) */
  enabled?: () => boolean;
}

export class InteractionSystem {
  private items: Interactable[] = [];
  private buckets = new Map<number, Interactable[]>();
  private current: Interactable | null = null;
  private suspended = false;

  add(it: Interactable) {
    this.items.push(it);
    const key = this.bucketKey(Math.floor(it.x / 4), Math.floor(it.z / 4));
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(it);
    else this.buckets.set(key, [it]);
    return it;
  }

  remove(id: string) {
    const index = this.items.findIndex((i) => i.id === id);
    if (index >= 0) {
      const [removed] = this.items.splice(index, 1);
      const key = this.bucketKey(Math.floor(removed.x / 4), Math.floor(removed.z / 4));
      const bucket = this.buckets.get(key);
      if (bucket) {
        const bi = bucket.indexOf(removed);
        if (bi >= 0) bucket.splice(bi, 1);
        if (!bucket.length) this.buckets.delete(key);
      }
    }
    if (this.current?.id === id) {
      this.current = null;
      uiEvents.emit("prompt", null);
    }
  }

  get(id: string) {
    return this.items.find((i) => i.id === id);
  }

  all(): readonly Interactable[] {
    return this.items;
  }

  /** The interactable currently offered to the player (if any). */
  get currentPrompt() {
    return this.current;
  }

  /** While suspended (driving / transitioning) no prompt is offered. */
  setSuspended(on: boolean) {
    this.suspended = on;
    if (on && this.current) {
      this.current = null;
      uiEvents.emit("prompt", null);
    }
  }

  clearPrompt() {
    if (this.current) {
      this.current = null;
      uiEvents.emit("prompt", null);
    }
  }

  update(px: number, pz: number) {
    if (this.suspended) return;
    let best: Interactable | null = null;
    let bestD = Infinity;
    const bx = Math.floor(px / 4);
    const bz = Math.floor(pz / 4);
    for (let z = bz - 1; z <= bz + 1; z++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        const bucket = this.buckets.get(this.bucketKey(x, z));
        if (!bucket) continue;
        for (const it of bucket) {
          if (it.enabled && !it.enabled()) continue;
          const dx = it.x - px;
          const dz = it.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 <= it.radius * it.radius && d2 < bestD) {
            best = it;
            bestD = d2;
          }
        }
      }
    }
    if (best !== this.current) {
      this.current = best;
      uiEvents.emit("prompt", best ? best.prompt : null);
    }
  }

  /** Fire the current prompt's trigger (WorldScene.tryInteract's last branch). */
  triggerCurrent(): boolean {
    if (!this.current) return false;
    this.current.trigger();
    return true;
  }

  clear() {
    this.items = [];
    this.buckets.clear();
    this.current = null;
  }

  private bucketKey(x: number, z: number) {
    // 16-bit signed cell coordinates packed into one stable integer key.
    return ((x & 0xffff) << 16) ^ (z & 0xffff);
  }
}
