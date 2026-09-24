// Shared state for the overlay modules (which overlay is open, touch mode...).
import { EventEmitter } from "../../core/events";
import { controls } from "../../game/systems/controls";
import type { Disposer } from "./dom";

export type ModalKind = "shop" | "phone" | "map" | "localMap" | "minigame" | "gift";

export class UIContext {
  /** Internal bus: "change" fires whenever open/closed/started state flips. */
  readonly bus = new EventEmitter();
  started = false;
  dialogueOpen = false;
  modal: ModalKind | null = null;
  touch: boolean;

  constructor(
    readonly layer: HTMLElement,
    readonly d: Disposer,
    touch: boolean,
  ) {
    this.touch = touch;
    d.add(() => this.bus.removeAllListeners());
  }

  /** Same meaning as UIScene.anyModal(): dialogue, gift menu or any panel. */
  anyModal() {
    return this.dialogueOpen || this.modal !== null;
  }

  changed() {
    this.layer.classList.toggle("olw-started", this.started);
    this.layer.classList.toggle("olw-busy", this.anyModal());
    this.layer.classList.toggle("olw-touch", this.touch);
    this.bus.emit("change");
  }

  /** Freeze movement (dialogue / menus). */
  lock() {
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
  }

  /** Release the lock only when nothing else still needs it. */
  unlockIfIdle() {
    if (!this.anyModal()) controls.locked = false;
  }
}
