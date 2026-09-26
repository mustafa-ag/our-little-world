// HTML/CSS overlay UI for the Babylon build. Replaces the Phaser UIScene /
// TitleScene / PhoneOverlay. Talks to the game only through `store`,
// `controls` and `uiEvents`, using the same event names as UIScene.
import css from "./styles.css?inline";
import { controls, uiEvents } from "../../game/systems/controls";
import { Disposer, el, isTouchDevice } from "./dom";
import { UIContext } from "./context";
import { mountTitle } from "./title";
import { mountHud } from "./hud";
import { mountQuestTracker } from "./questTracker";
import { mountPrompt } from "./prompt";
import { mountDialogue } from "./dialogue";
import { mountToasts } from "./toast";
import { mountJoystick } from "./joystick";
import { mountButtons } from "./buttons";
import { mountModals } from "./modals";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,500&family=Nunito:wght@500;700;800&display=swap";

const ADVANCE_KEYS = new Set(["Space", "KeyE", "Enter", "NumpadEnter"]);

function injectHead(d: Disposer) {
  const style = d.node(el("style", { attrs: { "data-olw-ui": "" } }));
  style.textContent = css;
  document.head.append(style);
  if (!document.querySelector("link[data-olw-fonts]")) {
    const pre1 = d.node(el("link", { attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } }));
    const pre2 = d.node(el("link", { attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" } }));
    const fonts = d.node(el("link", { attrs: { rel: "stylesheet", href: FONT_HREF, "data-olw-fonts": "" } }));
    document.head.append(pre1, pre2, fonts);
  }
}

export function mountUI(root: HTMLElement): { dispose(): void } {
  const d = new Disposer();
  injectHead(d);

  // the layer is absolutely positioned, so the host needs a containing block
  if (getComputedStyle(root).position === "static") {
    const prev = root.style.position;
    root.style.position = "relative";
    d.add(() => {
      root.style.position = prev;
    });
  }

  const layer = d.node(el("div", { class: "olw-ui" }));
  root.append(layer);
  const ctx = new UIContext(layer, d, isTouchDevice());

  // order = stacking order among same-z siblings
  const hud = mountHud(ctx, () => quests.refresh());
  const quests = mountQuestTracker(ctx);
  mountJoystick(ctx);
  mountPrompt(ctx);
  const modals = mountModals(ctx);
  mountButtons(ctx, modals.openPhone);
  const dialogue = mountDialogue(ctx, (npcId) => {
    if (npcId) modals.openGift(npcId);
  });
  mountToasts(ctx);
  const title = mountTitle(ctx);

  // ---- game events (same contract as UIScene) ----
  d.on(uiEvents, "startGame", () => {
    if (ctx.started) return;
    title.hide();
    ctx.started = true;
    hud.refreshAll();
    quests.refresh();
    ctx.changed();
  });
  d.on(uiEvents, "dialogue", (name: string, lines: string[], extra?: { npcId?: string }) => {
    dialogue.open(name, lines, extra?.npcId);
  });
  d.on(uiEvents, "action", () => {
    // action while a dialogue is open advances it; otherwise gameplay handles it
    if (ctx.dialogueOpen) dialogue.advance();
    else if (ctx.modal === "minigame") uiEvents.emit("minigameAction");
  });
  d.on(uiEvents, "sceneReset", () => {
    dialogue.reset();
    modals.host.closeAny();
    ctx.changed();
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
  });

  // ---- keyboard ----
  // Capture phase on window so we see keys before gameplay listeners, and
  // swallow the ones we consume (the Phaser build avoided double triggers by
  // the world ignoring keys while controls.locked; we also stop propagation
  // and preventDefault so a key that closes the dialogue can't re-interact).
  const consume = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  d.listen(
    window,
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (title.visible) {
        if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") {
          // focused buttons / links (e.g. "Play Full Pixel Game") keep their own activation
          const onButton =
            (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) && layer.contains(e.target);
          if (!onButton) {
            consume(e);
            title.start();
          }
        }
        return;
      }
      if (!ctx.started) return;
      if (ctx.dialogueOpen) {
        if (ADVANCE_KEYS.has(e.code)) {
          consume(e);
          if (!e.repeat) dialogue.advance();
        }
        return;
      }
      if (e.code === "Escape") {
        if (modals.host.escape()) consume(e);
        return;
      }
      if (ctx.modal && ADVANCE_KEYS.has(e.code)) {
        // let Space/Enter activate a focused panel button, but never the world
        const onButton = e.target instanceof HTMLButtonElement && layer.contains(e.target);
        if (onButton && e.code !== "KeyE") e.stopImmediatePropagation();
        else consume(e);
      }
    },
    { capture: true },
  );

  // ---- touch mode follows the last real input ----
  d.listen(
    window,
    "pointerdown",
    (e) => {
      const touch = e.pointerType === "touch" || e.pointerType === "pen" ? true : e.pointerType === "mouse" ? false : ctx.touch;
      if (touch !== ctx.touch) {
        ctx.touch = touch;
        ctx.changed();
      }
    },
    { capture: true, passive: true },
  );

  ctx.changed();

  return {
    dispose() {
      if (ctx.dialogueOpen || ctx.modal) controls.locked = false;
      d.dispose();
    },
  };
}
