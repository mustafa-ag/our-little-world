// Title screen — DOM port of scenes/TitleScene.ts.
import { store } from "../../game/systems/store";
import { resetControls, uiEvents } from "../../game/systems/controls";
import { loadGraphicsSettings, saveGraphicsSettings, type FrameRatePreference, type GraphicsQuality } from "../performance/quality";
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
  // The complete pixel game (every quest, scene and save feature) lives at /legacy.html.
  const legacy = el("a", {
    class: "olw-btn olw-btn--gold olw-title-legacy",
    text: "Play Full Pixel Game",
    attrs: { href: "./legacy.html", "aria-label": "Play the full pixel game" },
  });
  const savedGraphics = loadGraphicsSettings();
  const choice = <T extends string>(label: string, value: T, values: readonly { value: T; label: string }[]) => {
    const select = el("select", { class: "olw-title-select", attrs: { "aria-label": label } });
    for (const item of values) {
      const option = el("option", { text: item.label, attrs: { value: item.value } });
      option.selected = item.value === value;
      select.append(option);
    }
    return select;
  };
  const quality = choice<GraphicsQuality>("Graphics quality", savedGraphics.quality, [
    { value: "auto", label: "Auto graphics" },
    { value: "high", label: "High graphics" },
    { value: "medium", label: "Medium graphics" },
    { value: "low", label: "Low graphics" },
  ]);
  const frameRate = choice<string>("Frame rate", `${savedGraphics.frameRate}`, [
    { value: "60", label: "60 FPS" },
    { value: "30", label: "30 FPS" },
    { value: "uncapped", label: "Uncapped FPS" },
  ]);
  const applyGraphics = button(d, "Apply & reload", "olw-btn olw-btn--ghost olw-btn--small", () => {
    const fps: FrameRatePreference = frameRate.value === "30" ? 30 : frameRate.value === "uncapped" ? "uncapped" : 60;
    saveGraphicsSettings({ quality: quality.value as GraphicsQuality, frameRate: fps, dynamicResolution: true });
    location.reload();
  });
  const settings = el("details", { class: "olw-title-settings" }, [
    el("summary", { text: "Graphics settings" }),
    el("div", { class: "olw-title-settings-row" }, [quality, frameRate, applyGraphics]),
  ]);
  actions.append(play, newGame, legacy, settings, el("p", { class: "olw-title-keys", text: "Press Space or Enter to begin" }));

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
