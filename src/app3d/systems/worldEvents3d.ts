// Engine-free 3D port of WorldScene's ambient world events (maybeStartWorldEvent
// / triggerWorldEvent / finishActiveWorldEvent). The legacy rules in
// game/systems/worldEvents.ts pick at most 0-2 events a day, deterministically;
// this module rolls once on district arrival (retrying while the world is not
// walkable), drops a tappable marker near Juju and plays the matching tiny
// interaction through the shared uiEvents contract ("minigame" / "choice" /
// "dialogue") and store.toast(). Visuals go through WorldViewHooks only.

import { TILE } from "../../game/constants";
import { getLocation } from "../../game/data/locations";
import type { WorldEventDefinition } from "../../game/data/worldEvents";
import { store } from "../../game/systems/store";
import { controls, uiEvents, type ChoiceSpec } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import { beginWorldEvent, finishWorldEvent, pickWorldEvent, touristChoices } from "../../game/systems/worldEvents";
import { pxToUnits, pxToXZ, xzToPx } from "../world/coords";
import type { InteractionSystem } from "./interaction";
import type { PickupKind, WorldViewHooks } from "./worldController";

/** First roll after arriving (WorldScene: delayedCall 900). */
const FIRST_ROLL_MS = 900;
/** Retry while locked / indoors (WorldScene: delayedCall 2200). */
const RETRY_MS = 2200;
const RAIN_MS = 10_500;
const CART_MS = 7_900;

type Pt = { x: number; z: number };

export interface WorldEventsEnv {
  locationId: string;
  /** world size in 2D pixels (for keeping markers on the map) */
  worldW: number;
  worldH: number;
  interaction: InteractionSystem;
  hooks: WorldViewHooks;
  /** false while transitioning / indoors: the roll waits and retries. */
  canRun: () => boolean;
}

function markerKind(event: WorldEventDefinition): PickupKind {
  if (event.kind.startsWith("cat")) return "cat";
  if (event.kind === "lost_phone") return "card";
  if (event.kind === "lost_bag") return "note";
  if (event.kind === "street_dance") return "heart";
  return "star";
}

export class WorldEvents3D {
  private active: WorldEventDefinition | null = null;
  /** interactable + pickup ids owned by the active event */
  private owned: string[] = [];
  private disposed = false;

  constructor(private env: WorldEventsEnv) {}

  /** Arrival: schedule the day's roll for this district. */
  start() {
    this.env.hooks.setTimeout(FIRST_ROLL_MS, () => this.maybeStart());
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }

  // -------------------------------------------------------------------------
  private maybeStart() {
    if (this.disposed || this.active) return;
    if (controls.locked || !this.env.canRun()) {
      // phone open / a dialogue up / inside a house: try again once walkable
      this.env.hooks.setTimeout(RETRY_MS, () => this.maybeStart());
      return;
    }
    const { locationId } = this.env;
    // story set-pieces own the world while they run (WorldScene parity)
    if (quests.statusOf("q_family_jewel_heist") === "active") return;
    if (locationId === "abudhabi_city" && quests.activeQuests().some((q) => q.def.id.startsWith("q_adnoc_"))) return;
    const event = pickWorldEvent(locationId);
    if (!event) return;
    beginWorldEvent(event);
    this.active = event;

    if (event.kind === "rain") return this.startRain(event);
    const anchor = this.findAnchor();
    if (event.kind === "lost_bag") return this.spawnLostBag(event, anchor);

    this.addMarker(event, `we:${event.id}`, markerKind(event), anchor, event.prompt, () => this.trigger(event, anchor));
    store.toast(`${event.icon} ${event.title}`, "#ffe08a");
    if (event.kind === "runaway_cart") {
      this.env.hooks.setTimeout(CART_MS, () => {
        if (this.active?.id !== event.id) return;
        store.toast("BONK · the boxes wobble. Nobody is hurt.", "#f4c95d");
        this.clear();
      });
    }
  }

  /** WorldScene.findAmbientAnchor: a free spot a few steps from Juju. */
  private findAnchor(): Pt {
    const { worldW, worldH, interaction, hooks } = this.env;
    const pl = hooks.playerPos();
    const p = xzToPx(pl.x, pl.z);
    const clamp = (x: number, y: number) => ({
      x: Math.min(worldW - 50, Math.max(50, x)),
      y: Math.min(worldH - 55, Math.max(65, y)),
    });
    const offsets = [
      { x: 105, y: 30 },
      { x: -105, y: -25 },
      { x: 45, y: -100 },
      { x: -50, y: 100 },
    ];
    const minGap = pxToUnits(72);
    for (const o of offsets) {
      const c = clamp(p.x + o.x, p.y + o.y);
      const w = pxToXZ(c.x, c.y);
      if (interaction.all().every((it) => Math.hypot(it.x - w.x, it.z - w.z) > minGap)) return w;
    }
    const f = clamp(p.x + 82, p.y + 64);
    return pxToXZ(f.x, f.y);
  }

  private addMarker(event: WorldEventDefinition, id: string, kind: PickupKind, at: Pt, prompt: string, trigger: () => void) {
    this.env.hooks.spawnPickup(id, kind, at.x, at.z);
    this.env.interaction.add({
      id,
      x: at.x,
      z: at.z,
      radius: pxToUnits(34),
      prompt,
      kind: "event",
      enabled: () => this.active?.id === event.id,
      trigger,
    });
    this.owned.push(id);
  }

  private removeOwned(id: string) {
    this.env.hooks.removePickup(id);
    this.env.interaction.remove(id);
    this.owned = this.owned.filter((o) => o !== id);
  }

  // -------------------------------------------------------------------------
  /** WorldScene.triggerWorldEvent: the player tapped the marker. */
  private trigger(event: WorldEventDefinition, at: Pt) {
    if (this.active?.id !== event.id) return;
    uiEvents.emit("prompt", null);
    if (event.kind === "tourist") {
      const choices = touristChoices(getLocation(this.env.locationId).cityId);
      this.choose({
        title: event.title,
        prompt: "Which way should they go? Wrong answers are allowed. Geography will recover.",
        choices: choices.map((c, i) => ({ id: `${i}`, label: c.label })),
        onChoose: (id) => {
          if (choices[Number(id)]?.correct) this.finish(event);
          else uiEvents.emit("dialogue", "Tourist", ["They walk three steps, stop, and come back.", "Are you sure?"]);
        },
      });
      return;
    }
    if (event.kind === "street_dance") {
      this.choose({
        title: event.title,
        prompt: "A performer catches Juju watching.",
        choices: [
          { id: "dance", label: "Dance", description: "Catch three bright beats." },
          { id: "watch", label: "Watch", description: "Stay for the tiny finale." },
        ],
        onChoose: (id) => {
          if (id === "watch") this.finish(event, ["The last move lands. Juju claps first; the crowd follows."]);
          else
            uiEvents.emit("minigame", {
              kind: "timing",
              title: "Join the dance",
              hint: "Hit three glowing beats. Missing is only funny.",
              taps: 3,
              onDone: () => this.finish(event),
            });
        },
      });
      return;
    }
    if (event.kind === "vehicle_start" || event.kind === "coffee_spill" || event.kind === "delivery_boxes") {
      const title = event.kind === "vehicle_start" ? "TRY AGAIN" : event.kind === "coffee_spill" ? "Napkin rescue" : "WOBBLE METER";
      const hint =
        event.kind === "vehicle_start"
          ? "Hit all three timing zones to start the very fictional vehicle."
          : event.kind === "coffee_spill"
            ? "Catch two bright moments. No stain anxiety."
            : "Balance the top box through three gentle corrections.";
      uiEvents.emit("minigame", { kind: "timing", title, hint, taps: event.kind === "coffee_spill" ? 2 : 3, onDone: () => this.finish(event) });
      return;
    }
    if (event.kind === "cat_friend") this.env.hooks.spawnCat(at.x + 0.4, at.z);
    this.finish(event, event.completionLines, at);
  }

  /** "choice" is answered by ui/choice.ts; without a listener pick the first option. */
  private choose(spec: ChoiceSpec) {
    if (uiEvents.emit("choice", spec)) return;
    const first = spec.choices[0];
    if (first) spec.onChoose(first.id);
  }

  /** WorldScene.finishActiveWorldEvent: rewards, quest hooks, sparkle, dialogue. */
  private finish(event: WorldEventDefinition, lines = event.completionLines, at?: Pt) {
    if (this.active?.id !== event.id) return;
    const pos = at ?? this.markerPos() ?? this.env.hooks.playerPos();
    const rewarded = finishWorldEvent(event);
    if (rewarded) {
      // quest steps can listen for an event by id ("world_tourist") or kind ("tourist")
      quests.onInteract(event.id);
      quests.onInteract(event.kind);
    }
    this.env.hooks.petalBurst(pos.x, pos.z);
    this.clear();
    uiEvents.emit("dialogue", event.title, lines);
  }

  private markerPos(): Pt | null {
    const it = this.owned.map((id) => this.env.interaction.get(id)).find((i) => i !== undefined);
    return it ? { x: it.x, z: it.z } : null;
  }

  // -------------------------------------------------------------------------
  private spawnLostBag(event: WorldEventDefinition, at: Pt) {
    store.toast(`${event.icon} ${event.title}`, "#ffe08a");
    this.addMarker(event, `we:${event.id}`, "note", at, "Inspect the torn bag", () =>
      store.toast("Four little things escaped. Catch each one.", "#f4c95d"),
    );
    const p = xzToPx(at.x, at.z);
    const offsets = [
      { x: -34, y: 20 },
      { x: 32, y: 28 },
      { x: -12, y: 48 },
      { x: 55, y: 52 },
    ];
    const kinds: PickupKind[] = ["heart", "coins", "flower_yellow", "star"];
    let collected = 0;
    offsets.forEach((o, i) => {
      const id = `we:${event.id}:${i}`;
      const w = pxToXZ(Math.min(this.env.worldW - TILE, Math.max(TILE, p.x + o.x)), Math.min(this.env.worldH - TILE, Math.max(TILE, p.y + o.y)));
      this.env.hooks.spawnPickup(id, kinds[i], w.x, w.z);
      this.env.interaction.add({
        id,
        x: w.x,
        z: w.z,
        radius: pxToUnits(23),
        prompt: `Pick up item ${i + 1}/4`,
        kind: "event",
        enabled: () => this.active?.id === event.id,
        trigger: () => {
          if (!this.owned.includes(id)) return;
          this.removeOwned(id);
          collected += 1;
          if (collected >= 4) this.finish(event, event.completionLines, at);
          else store.toast(`${collected}/4 things rescued`, "#7be0a3");
        },
      });
      this.owned.push(id);
    });
  }

  private startRain(event: WorldEventDefinition) {
    store.toast("Rain! Umbrellas are making decisions.", "#bfe6ff");
    this.env.hooks.setTimeout(RAIN_MS, () => {
      if (this.disposed || this.active?.id !== event.id) return;
      if (finishWorldEvent(event)) {
        quests.onInteract(event.id);
        quests.onInteract(event.kind);
      }
      this.clear();
      store.toast("The rain wanders off.", "#bfe6ff");
    });
  }

  private clear() {
    for (const id of [...this.owned]) this.removeOwned(id);
    this.owned = [];
    this.active = null;
  }
}
