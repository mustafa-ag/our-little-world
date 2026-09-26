// Jeep road trip, DOM side (WorldScene.openDriveMenu + DrivingScene HUD port).
//
// Flow: worldController emits "driveMenu" at the parked Jeep -> destination
// picker (the other districts of this city that load in 3D) -> fade ->
// "driveStart" (main.ts -> Game3D.enterDriving) -> fade in on the road with
// the trip HUD (progress, fuel, boost, passenger chatter, touch pedals).
// The 3D scene emits "driveHud" / "driveChat" while driving and
// "driveArrived" at the goal -> fade -> "travelTo" (Game3D.travelTo) loads
// the destination. Esc / End drive -> "driveExit" back to where you parked.
// Game3D emits "driveClosed" whenever the road trip goes away.
// "Skip drive" (HUD corner, or "Skip" in the picker) jumps straight to the
// destination: same fade + "travelTo" as a normal arrival (which fires
// quests.onVisit), but none of the driving rewards (coins / hearts / bonds).
import css from "./drive.css?inline";
import { store } from "../../game/systems/store";
import { controls, uiEvents } from "../../game/systems/controls";
import { cityMeta, districtsOf, getLocation } from "../../game/data/locations";
import { activeQuests, onDriveWith } from "../../game/systems/quests";
import { NPCS } from "../../game/data/npcs";
import { PORTED_LOCATIONS } from "../systems/worldController";
import { FUEL_COST, type DriveHud, type DriveNearMiss } from "../scenes/drivingScene";
import { button, el, prefersReducedMotion } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";

export function mountDrive(ctx: UIContext, host: ModalHost) {
  const { d } = ctx;
  const style = d.node(el("style", { attrs: { "data-olw-drive": "" } }));
  style.textContent = css;
  document.head.append(style);

  // ---- fade (same look as world-map travel / the house door) ----
  const fadeLabel = el("span", { class: "olw-travel-fade-label" });
  const fade = d.node(el("div", { class: "olw-sleep-fade olw-travel-fade", attrs: { "aria-hidden": "true" } }, [fadeLabel]));
  ctx.layer.append(fade);
  let busy = false;
  let driving = false;

  const transition = (text: string, step: (done: (ok: boolean) => void) => boolean, after: (ok: boolean) => void) => {
    if (busy) return;
    busy = true;
    host.closeAny();
    ctx.lock();
    uiEvents.emit("prompt", null);
    fadeLabel.textContent = text;
    const ms = prefersReducedMotion() ? 0 : 650;
    fade.classList.add("olw-sleep-fade--on");
    d.timeout(() => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        after(ok);
        d.timeout(() => {
          fade.classList.remove("olw-sleep-fade--on");
          busy = false;
          ctx.unlockIfIdle();
        }, ms ? 220 : 0);
      };
      if (!step(finish)) finish(false);
    }, ms);
  };

  // ---- HUD ----
  const destEl = el("span", { class: "olw-drive-dest" });
  const leftEl = el("span", { class: "olw-drive-left" });
  const progFill = el("span", { class: "olw-drive-fill" });
  const fuelFill = el("span", { class: "olw-drive-fill olw-drive-fill--fuel" });
  const fuelVal = el("span", { class: "olw-drive-val" });
  const boostFill = el("span", { class: "olw-drive-fill olw-drive-fill--boost" });
  const radio = el("p", { class: "olw-drive-radio" });
  const composure = el("p", { class: "olw-drive-composure olw-hidden" });
  const meter = (label: string, fill: HTMLElement, val?: HTMLElement) =>
    el("div", { class: "olw-drive-meter" }, [el("span", { class: "olw-drive-meter-label", text: label }), el("span", { class: "olw-drive-bar" }, [fill]), val ?? null]);
  const top = el("div", { class: "olw-panel olw-drive-top" }, [
    el("div", { class: "olw-drive-head" }, [destEl, leftEl]),
    el("span", { class: "olw-drive-bar olw-drive-bar--trip" }, [progFill]),
    meter("Fuel", fuelFill, fuelVal),
    meter("Boost", boostFill),
    composure,
    radio,
  ]);
  const chat = el("p", { class: "olw-drive-chat olw-hidden", attrs: { "aria-live": "polite" } });
  const endBtn = button(d, "End drive", "olw-btn olw-btn--rose olw-btn--small", () => endDrive());
  const skipBtn = button(d, "Skip drive ›", "olw-btn olw-btn--small olw-drive-skip", () => skipDrive());
  skipBtn.setAttribute("aria-label", "Skip the drive and arrive now");
  const corner = el("div", { class: "olw-drive-corner" }, [skipBtn, endBtn]);
  const hint = el("p", { class: "olw-drive-hint", text: "A / D or ← → steer · Shift floor it · Space honk · Esc end drive" });

  const pedal = (label: string, cls: string, onDown: () => void, onUp: () => void) => {
    const b = el("button", { class: `olw-drive-pedal ${cls}`, text: label, attrs: { type: "button" } });
    const up = () => {
      b.classList.remove("olw-drive-pedal--on");
      onUp();
    };
    d.listen(b, "pointerdown", (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add("olw-drive-pedal--on");
      onDown();
    });
    d.listen(b, "pointerup", up);
    d.listen(b, "pointercancel", up);
    d.listen(b, "lostpointercapture", up);
    d.listen(b, "contextmenu", (e) => e.preventDefault());
    return b;
  };
  let steerL = false;
  let steerR = false;
  const applySteer = () => (controls.moveX = (steerR ? 1 : 0) - (steerL ? 1 : 0));
  const pad = el("div", { class: "olw-drive-pad olw-touch-only" }, [
    el("div", { class: "olw-drive-pad-side" }, [
      pedal("◀", "olw-drive-pedal--steer", () => ((steerL = true), applySteer()), () => ((steerL = false), applySteer())),
      pedal("▶", "olw-drive-pedal--steer", () => ((steerR = true), applySteer()), () => ((steerR = false), applySteer())),
    ]),
    el("div", { class: "olw-drive-pad-side" }, [
      pedal("Honk", "olw-drive-pedal--honk", () => uiEvents.emit("driveHonk"), () => undefined),
      pedal("Boost", "olw-drive-pedal--boost", () => uiEvents.emit("driveBoost", true), () => uiEvents.emit("driveBoost", false)),
    ]),
  ]);
  // ---- screen effects: boost vignette, near-miss flash + combo, pickup burst ----
  const vignette = el("div", { class: "olw-drive-vignette", attrs: { "aria-hidden": "true" } });
  const flash = el("div", { class: "olw-drive-flash olw-hidden", attrs: { "aria-hidden": "true" } });
  const fx = el("div", { class: "olw-drive-fx", attrs: { "aria-hidden": "true" } });

  const hud = d.node(el("div", { class: "olw-drive-hud olw-hidden" }, [vignette, fx, flash, top, chat, corner, hint, pad]));
  ctx.layer.append(hud);

  const setDriving = (on: boolean) => {
    if (driving === on) return;
    driving = on;
    hud.classList.toggle("olw-hidden", !on);
    ctx.layer.classList.toggle("olw-driving", on);
    steerL = steerR = false;
    controls.moveX = 0;
    if (!on) {
      chat.classList.add("olw-hidden");
      flash.classList.add("olw-hidden");
      vignette.style.opacity = "0";
      fx.replaceChildren();
    }
    ctx.changed();
  };

  let chatHide: (() => void) | null = null;
  d.on(uiEvents, "driveChat", (text: string) => {
    if (!driving) return;
    chat.textContent = text;
    chat.classList.remove("olw-hidden");
    chatHide?.();
    chatHide = d.timeout(() => chat.classList.add("olw-hidden"), 3200);
  });

  d.on(uiEvents, "driveBump", () => {
    hud.classList.remove("olw-drive-hud--bump");
    void hud.offsetWidth; // restart the shake
    hud.classList.add("olw-drive-hud--bump");
  });

  let flashHide: (() => void) | null = null;
  d.on(uiEvents, "driveNearMiss", (n: DriveNearMiss) => {
    if (!driving) return;
    flash.replaceChildren(el("span", { class: "olw-drive-flash-main", text: "NEAR MISS!" }));
    if (n.combo > 1) flash.append(el("span", { class: "olw-drive-flash-combo", text: `Combo x${n.combo}` }));
    flash.classList.remove("olw-hidden", "olw-drive-flash--on");
    void flash.offsetWidth; // restart the animation
    flash.classList.add("olw-drive-flash--on");
    flashHide?.();
    flashHide = d.timeout(() => flash.classList.add("olw-hidden"), 800);
  });

  // 6-8 little yellow sparks flying out from the Jeep, then fading
  d.on(uiEvents, "drivePickup", () => {
    if (!driving || prefersReducedMotion()) return;
    const n = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = 60 + Math.random() * 50;
      const spark = el("span", { class: "olw-drive-spark" });
      spark.style.setProperty("--dx", `${Math.cos(a) * r}px`);
      spark.style.setProperty("--dy", `${Math.sin(a) * r}px`);
      fx.append(spark);
      d.timeout(() => spark.remove(), 750);
    }
  });

  d.on(uiEvents, "driveHud", (h: DriveHud) => {
    if (!driving) return;
    destEl.textContent = h.destName;
    leftEl.textContent = h.remaining > 0 ? `${h.remaining}m to go` : "Arriving…";
    progFill.style.width = `${Math.round(h.progress * 100)}%`;
    fuelFill.style.width = `${h.fuel}%`;
    fuelFill.classList.toggle("olw-drive-fill--low", h.fuel < 20);
    fuelVal.textContent = `${h.fuel}%`;
    boostFill.style.width = `${Math.round(h.boost * 100)}%`;
    boostFill.classList.toggle("olw-drive-fill--hot", h.boosting);
    vignette.style.opacity = h.boosting ? "0.4" : "0";
    radio.textContent = h.radio;
    composure.classList.toggle("olw-hidden", !h.passenger);
    if (h.passenger) composure.textContent = `${h.passenger}'s composure  ${"♥".repeat(h.composure)}${"♡".repeat(5 - h.composure)}`;
  });

  // ---- destination picker (WorldScene.openDriveMenu) ----
  const questTargets = () => new Set(activeQuests().filter((q) => q.step.type === "visit").map((q) => q.step.target));

  const openDriveMenu = (opts: { locationId: string }) => {
    if (ctx.anyModal() || driving || busy || ctx.indoors) return;
    const loc = getLocation(opts.locationId);
    const others = districtsOf(loc.cityId).filter((dd) => dd.id !== loc.id && PORTED_LOCATIONS.has(dd.id));
    const wanted = questTargets();
    const fuel = store.state.fuel;
    const who = store.state.lastPassenger ? NPCS.find((n) => n.id === store.state.lastPassenger)?.name : undefined;
    host.open({
      kind: "drive",
      title: "Blue Jeep Sport",
      subtitle: `Fuel ${fuel}%${who ? ` · riding with ${who}` : ""}`,
      className: "olw-drive-modal",
      body: (md, close) => {
        if (!others.length) return el("p", { class: "olw-empty", text: `Nowhere else to drive in ${cityMeta(loc.cityId)?.name ?? loc.name} — try the world map.` });
        if (fuel <= 0) return el("p", { class: "olw-empty", text: "The tank's empty. Find a petrol station and refuel first." });
        return el(
          "div",
          { class: "olw-modal-actions olw-drive-list" },
          others.map((dest) => {
            const b = button(md, `Drive to ${dest.name}`, "olw-btn olw-btn--rose", () => {
              close();
              startDrive(dest.id);
            });
            if (wanted.has(dest.id) || wanted.has(dest.cityId)) b.append(el("span", { class: "olw-drive-quest", text: "Quest" }));
            const skip = button(md, "Skip", "olw-btn olw-btn--small olw-drive-skip", () => {
              close();
              skipTo(dest.id);
            });
            skip.setAttribute("aria-label", `Skip the drive and go straight to ${dest.name}`);
            return el("div", { class: "olw-drive-row" }, [b, skip]);
          }),
        );
      },
    });
  };

  /** Where the current road trip is headed (for "Skip drive"). */
  let driveDest: string | null = null;

  const startDrive = (destId: string) => {
    const dest = getLocation(destId);
    const passenger = store.state.lastPassenger;
    transition(
      `Road trip to ${dest.name}…`,
      (done) => uiEvents.emit("driveStart", { destId, passenger }, done),
      (ok) => {
        if (!ok) {
          store.toast("The Jeep won't start right now", "#2f6fd0");
          return;
        }
        // WorldScene.driveTo: driving with someone counts for their quest step
        if (passenger) onDriveWith(passenger);
        driveDest = destId;
        setDriving(true);
        uiEvents.emit("locationTitle", "Road trip", `Driving to ${dest.name}`);
      },
    );
  };

  /** Travel to the destination as if the drive had just ended (no driving rewards). */
  const arriveAt = (destId: string, onFail: () => void) => {
    transition(
      `Arriving at ${getLocation(destId).name}…`,
      // travelTo loads the district, which fires quests.onVisit like a normal arrival
      (done) => uiEvents.emit("travelTo", destId, done),
      (ok) => {
        if (!ok) {
          onFail();
          store.toast(`Couldn't get to ${getLocation(destId).name} right now`, "#e46d94");
        }
        setDriving(false);
      },
    );
  };

  // "Skip" in the picker: no road trip at all, just go (still burns the fuel)
  const skipTo = (destId: string) => {
    if (busy || driving) return;
    const passenger = store.state.lastPassenger;
    arriveAt(destId, () => undefined);
    if (!busy) return;
    store.useFuel(FUEL_COST);
    store.setInJeep(true);
    if (passenger) onDriveWith(passenger);
  };

  // "Skip drive ›" on the HUD: stop the trip now (DrivingScene.skip) and arrive
  const skipDrive = () => {
    if (!driving || busy || !driveDest) return;
    uiEvents.emit("driveSkip");
    arriveAt(driveDest, () => uiEvents.emit("driveExit"));
  };

  const endDrive = () => {
    if (!driving || busy) return;
    transition(
      "Pulling over…",
      (done) => uiEvents.emit("driveExit", done),
      () => setDriving(false),
    );
  };

  d.on(uiEvents, "driveArrived", (destId: string) => {
    if (!driving) return;
    arriveAt(destId, () => uiEvents.emit("driveExit"));
  });

  d.on(uiEvents, "driveClosed", () => setDriving(false));
  d.on(uiEvents, "driveMenu", openDriveMenu);

  // Esc ends the drive (ui/index.ts lets Escape through when no panel is open)
  d.listen(window, "keydown", (e) => {
    if (e.code !== "Escape" || !driving || ctx.anyModal()) return;
    e.preventDefault();
    endDrive();
  });

  return { get driving() {
    return driving;
  } };
}
