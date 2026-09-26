// Top-left HUD: hearts, coins, clock, the evening "Rest" button + the big
// location title card and the little heart pop on relationship gains.
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import { tryDeliverMessages } from "../../game/systems/phone";
import { button, el, icon, prefersReducedMotion } from "./dom";
import type { UIContext } from "./context";

export function mountHud(ctx: UIContext, onLocation: () => void) {
  const { d } = ctx;
  const hearts = el("span", { class: "olw-stat-value" });
  const coins = el("span", { class: "olw-stat-value" });
  const clock = el("div", { class: "olw-clock", attrs: { "aria-live": "polite" } });
  const rest = button(d, "Rest for the night", "olw-btn olw-btn--ghost olw-rest", () => sleep());
  const hud = d.node(
    el("div", { class: "olw-hud olw-play-only" }, [
      el("div", { class: "olw-panel olw-stats" }, [
        el("span", { class: "olw-stat olw-stat--hearts", attrs: { title: "Hearts" } }, [icon("heart"), hearts]),
        el("span", { class: "olw-stat olw-stat--coins", attrs: { title: "Coins" } }, [icon("coin"), coins]),
      ]),
      clock,
      rest,
    ]),
  );
  ctx.layer.append(hud);

  // ---- Rest / sleep (HouseScene's bed isn't ported, so the HUD offers it) ----
  // Mirrors HouseScene.sleep(): +1 heart, new day at morning, wake-up texts, save.
  const fade = d.node(el("div", { class: "olw-sleep-fade", attrs: { "aria-hidden": "true" } }));
  ctx.layer.append(fade);
  let sleeping = false;
  const canRest = () => {
    const t = store.state.timeOfDay;
    return ctx.started && !sleeping && !ctx.anyModal() && !store.isQuestReplay && (t === "evening" || t === "night");
  };
  const refreshRest = () => rest.classList.toggle("olw-hidden", !canRest());
  const sleep = () => {
    if (!canRest()) return;
    sleeping = true;
    refreshRest();
    ctx.lock();
    const ms = prefersReducedMotion() ? 0 : 700;
    fade.classList.add("olw-sleep-fade--on");
    d.timeout(() => {
      store.addHearts(1);
      store.sleep(); // day += 1, morning, clears dailies, emits time/newDay, saves
      tryDeliverMessages({ wake: true, limit: 2 });
      store.save();
      setClock();
      d.timeout(() => {
        fade.classList.remove("olw-sleep-fade--on");
        d.timeout(() => {
          sleeping = false;
          ctx.unlockIfIdle();
          store.toast("A cozy new day together", "#ff8fae");
          uiEvents.emit("dialogue", "Home", ["You sleep. The world keeps your things exactly where you left them.", store.clockLabel()]);
          refreshRest();
        }, ms);
      }, ms ? 500 : 0);
    }, ms);
  };
  d.on(ctx.bus, "change", refreshRest);
  d.on(store, "time", refreshRest);
  d.on(store, "changed", refreshRest);
  refreshRest();

  const bump = (node: HTMLElement) => {
    node.classList.remove("olw-bump");
    void node.offsetWidth; // restart the CSS animation
    node.classList.add("olw-bump");
  };
  const setHearts = (v: number) => {
    if (hearts.textContent !== `${v}`) bump(hearts);
    hearts.textContent = `${v}`;
  };
  const setCoins = (v: number) => {
    if (coins.textContent !== `${v}`) bump(coins);
    coins.textContent = `${v}`;
  };
  const setClock = () => {
    clock.textContent = store.clockLabel();
  };
  const refreshAll = () => {
    hearts.textContent = `${store.state.hearts}`;
    coins.textContent = `${store.state.coins}`;
    setClock();
  };
  refreshAll();

  d.on(store, "hearts", setHearts);
  d.on(store, "coins", setCoins);
  d.on(store, "time", setClock);
  d.on(store, "newDay", setClock);
  d.on(store, "changed", refreshAll);
  // UIScene refreshed the clock every frame; a slow poll covers direct state writes.
  d.interval(() => {
    setClock();
    refreshRest();
  }, 1000);

  // ---- location title ("locationTitle", name, subtitle) ----
  let titleNode: HTMLElement | null = null;
  const showLocationTitle = (name: string, sub: string) => {
    titleNode?.remove();
    const node = el("div", { class: "olw-location", attrs: { role: "status" } }, [
      el("div", { class: "olw-location-name", text: name ?? "" }),
      sub ? el("div", { class: "olw-location-sub", text: sub }) : null,
    ]);
    titleNode = node;
    ctx.layer.append(node);
    d.timeout(() => {
      node.remove();
      if (titleNode === node) titleNode = null;
    }, prefersReducedMotion() ? 1800 : 2300);
  };
  d.add(() => titleNode?.remove());
  d.on(uiEvents, "locationTitle", (n: string, s: string) => {
    showLocationTitle(n, s);
    onLocation();
  });

  // ---- heart pop on relationship gain ----
  d.on(store, "relGain", () => {
    if (prefersReducedMotion()) return;
    const h = icon("heart", "olw-heart-pop");
    ctx.layer.append(h);
    d.timeout(() => h.remove(), 800);
  });

  return { refreshAll, el: hud };
}
