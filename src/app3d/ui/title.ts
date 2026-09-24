// Title screen — DOM port of scenes/TitleScene.ts.
import { store } from "../../game/systems/store";
import { resetControls, uiEvents } from "../../game/systems/controls";
import { button, el, icon, prefersReducedMotion, type Disposer } from "./dom";
import type { UIContext } from "./context";

const FADE_MS = 360;

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

  const play = button(d, "", "olw-btn olw-btn--rose olw-btn--big olw-title-play", () => start());
  const newGame = button(d, "New game", "olw-btn olw-btn--ghost", () => {
    store.reset();
    render();
  });
  actions.append(play, newGame, el("p", { class: "olw-title-keys", text: "Press Space or Enter to begin" }));

  const render = () => {
    const started = store.state.started;
    play.textContent = started ? "Continue" : "Start our story";
    newGame.classList.toggle("olw-hidden", !started);
  };

  const start = () => {
    if (leaving || ctx.started) return;
    leaving = true;
    resetControls();
    store.state.started = true;
    store.save();
    root.classList.add("olw-title--leaving");
    d.timeout(() => {
      root.classList.add("olw-hidden");
      // the listener in index.ts flips ctx.started and reveals the HUD
      uiEvents.emit("startGame");
    }, prefersReducedMotion() ? 0 : FADE_MS);
  };

  render();
  resetControls();

  return {
    get visible() {
      return !leaving && !ctx.started;
    },
    start,
    /** Hide without emitting (someone else emitted startGame). */
    hide() {
      leaving = true;
      root.classList.add("olw-hidden");
    },
    refresh: render,
  };
}
