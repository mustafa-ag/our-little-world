// Title screen — DOM port of scenes/TitleScene.ts, including its three save
// slots ("stories") from systems/save.ts.
import { store } from "../../game/systems/store";
import { resetControls, uiEvents } from "../../game/systems/controls";
import { getLocation } from "../../game/data/locations";
import type { SaveSlot } from "../../game/systems/save";
import { button, el, icon, prefersReducedMotion, type Disposer } from "./dom";
import type { UIContext } from "./context";

const FADE_MS = 360;

type SlotMode = "continue" | "new";

export function mountTitle(ctx: UIContext) {
  const d: Disposer = ctx.d;
  const root = d.node(el("div", { class: "olw-title", attrs: { role: "dialog", "aria-label": "Our Little World" } }));

  // floating background hearts (decorative)
  const sky = el("div", { class: "olw-title-sky", attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < 12; i++) {
    const h = icon("heart", "olw-title-float");
    const size = 14 + ((i * 37) % 26);
    h.style.left = `${(i * 83 + 7) % 96}%`;
    h.style.top = `${(i * 47 + 11) % 88}%`;
    h.style.width = `${size}px`;
    h.style.height = `${size}px`;
    h.style.animationDelay = `${-(i * 0.7).toFixed(1)}s`;
    h.style.animationDuration = `${3.6 + (i % 5) * 0.6}s`;
    sky.append(h);
  }
  for (let i = 0; i < 3; i++) sky.append(el("div", { class: `olw-cloud olw-cloud-${i}` }));

  const card = el("div", { class: "olw-title-card" });
  const emblem = el("div", { class: "olw-title-emblem" }, [icon("heart", "olw-title-heart")]);
  const name = el("h1", { class: "olw-title-name", text: "Our Little World" });
  const dedication = el("p", { class: "olw-title-dedication", text: "made for Jasmin, with love — Moomoo" });
  const actions = el("div", { class: "olw-title-actions" });
  card.append(emblem, name, dedication, actions);
  root.append(sky, card);
  ctx.layer.append(root);

  let leaving = false;

  // ---- small modal over the title (slot picker / confirm) ----
  let overlay: { node: HTMLElement; md: Disposer } | null = null;
  const closeOverlay = () => {
    if (!overlay) return;
    overlay.node.remove();
    overlay.md.dispose();
    overlay = null;
  };
  const openOverlay = (title: string, sub: string | null, body: (md: Disposer) => Node) => {
    closeOverlay();
    const md = d.child();
    const x = button(md, "", "olw-modal-x", () => closeOverlay());
    x.setAttribute("aria-label", "Close");
    x.append(icon("close"));
    const panel = el("div", { class: "olw-panel olw-modal olw-title-modal", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title } }, [
      el("header", { class: "olw-modal-head" }, [
        el("div", {}, [el("h2", { class: "olw-modal-title", text: title }), sub ? el("p", { class: "olw-modal-sub", text: sub }) : null]),
        x,
      ]),
      el("div", { class: "olw-modal-body" }, [body(md)]),
    ]);
    const node = el("div", { class: "olw-backdrop olw-title-backdrop" }, [panel]);
    md.listen(node, "click", (e) => {
      if (e.target === node) closeOverlay();
    });
    root.append(node);
    overlay = { node, md };
    // focus the first actionable button so keyboard players can pick straight away
    const first = panel.querySelector<HTMLButtonElement>(".olw-modal-body button:not(:disabled)");
    (first ?? panel).focus({ preventScroll: true });
  };

  const slots = () => store.getSaveSlots();
  const anyStarted = () => slots().some((s) => s.state.started);

  const slotSummary = (slot: SaveSlot) => {
    const s = slot.state;
    if (!s.started) return "Empty · a fresh story";
    const where = getLocation(s.currentLocation)?.name ?? s.currentLocation;
    return `Juju · Day ${s.currentDay} · ${where} · ${s.hearts} ♥`;
  };

  const confirmNew = (slot: SaveSlot, index: number) => {
    openOverlay("Start new game?", `Story ${index + 1}`, (md) =>
      el("div", {}, [
        el("p", { class: "olw-title-confirm", text: "This will erase your current save." }),
        el("p", { class: "olw-title-slot-line", text: slotSummary(slot) }),
        el("div", { class: "olw-modal-actions" }, [
          button(md, "Cancel", "olw-btn olw-btn--ghost", () => closeOverlay()),
          button(md, "Start New", "olw-btn olw-btn--rose", () => {
            closeOverlay();
            beginNew(slot.id);
          }),
        ]),
      ]),
    );
  };

  const beginNew = (id: string) => {
    store.startNewSaveSlot(id);
    render();
    start();
  };

  const openSlots = (mode: SlotMode) => {
    const list = slots();
    openOverlay(mode === "continue" ? "Continue a story" : "Choose a slot", mode === "continue" ? "Pick up where you left off." : "Where should the new story live?", (md) => {
      const ul = el("ul", { class: "olw-title-slots" });
      list.forEach((slot, index) => {
        const started = slot.state.started;
        const active = slot.id === store.activeSaveSlotId;
        const label = mode === "continue" ? (started ? "Play" : "Empty") : started ? "Overwrite" : "Start";
        const act = button(md, label, `olw-btn ${mode === "new" && !started ? "olw-btn--rose" : mode === "new" ? "olw-btn--ghost" : ""} olw-title-slot-btn`, () => {
          if (mode === "continue") {
            if (!started) return;
            closeOverlay();
            if (slot.id !== store.activeSaveSlotId) store.loadSaveSlot(slot.id);
            render();
            start();
            return;
          }
          if (started) confirmNew(slot, index);
          else {
            closeOverlay();
            beginNew(slot.id);
          }
        });
        act.disabled = mode === "continue" && !started;
        ul.append(
          el("li", { class: `olw-title-slot${active ? " olw-title-slot--active" : ""}${started ? "" : " olw-title-slot--empty"}` }, [
            el("div", { class: "olw-title-slot-text" }, [
              el("span", { class: "olw-title-slot-name", text: `Story ${index + 1}${active ? " · last played" : ""}` }),
              el("span", { class: "olw-title-slot-line", text: slotSummary(slot) }),
            ]),
            act,
          ]),
        );
      });
      return ul;
    });
  };

  const play = button(d, "", "olw-btn olw-btn--rose olw-btn--big olw-title-play", () => {
    if (anyStarted()) openSlots("continue");
    else start();
  });
  const newGame = button(d, "New game", "olw-btn olw-btn--ghost", () => openSlots("new"));
  // The complete pixel game (every quest, scene and save feature) lives at /legacy.html.
  const legacy = el("a", {
    class: "olw-btn olw-btn--gold olw-title-legacy",
    text: "Play Full Pixel Game",
    attrs: { href: "./legacy.html", "aria-label": "Play the full pixel game" },
  });
  actions.append(play, newGame, legacy, el("p", { class: "olw-title-keys", text: "Press Space or Enter to begin" }));

  const render = () => {
    const started = anyStarted();
    play.textContent = started ? "Continue" : "Start our story";
    newGame.classList.toggle("olw-hidden", !started);
  };

  const start = () => {
    if (leaving || ctx.started) return;
    leaving = true;
    closeOverlay();
    resetControls();
    // a story that had never been started before is "fresh": its first 3D
    // location becomes currentLocation (see main.ts)
    const fresh = !store.state.started;
    store.state.started = true;
    store.save();
    root.classList.add("olw-title--leaving");
    d.timeout(() => {
      root.classList.add("olw-hidden");
      // the listener in index.ts flips ctx.started and reveals the HUD
      uiEvents.emit("startGame", { fresh });
    }, prefersReducedMotion() ? 0 : FADE_MS);
  };

  render();
  resetControls();

  return {
    get visible() {
      return !leaving && !ctx.started;
    },
    /** A slot picker / confirm dialog is open over the title. */
    get overlayOpen() {
      return overlay !== null;
    },
    closeOverlay,
    /** Space/Enter on the title: continue the last-played story (or begin one). */
    start,
    /** Hide without emitting (someone else emitted startGame). */
    hide() {
      leaving = true;
      closeOverlay();
      root.classList.add("olw-hidden");
    },
    refresh: render,
  };
}
