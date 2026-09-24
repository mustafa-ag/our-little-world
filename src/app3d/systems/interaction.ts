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
  private current: Interactable | null = null;
  private suspended = false;

  add(it: Interactable) {
    this.items.push(it);
    return it;
  }

  remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
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
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.x - px;
      const dz = it.z - pz;
      const d = Math.hypot(dx, dz);
      if (d <= it.radius && d < bestD) {
        best = it;
        bestD = d;
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
    this.current = null;
  }
}
