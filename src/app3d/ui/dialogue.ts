// Dialogue box — port of UIScene.openDialogue / advanceDialogue.
import { el, prefersReducedMotion } from "./dom";
import type { UIContext } from "./context";

const DEBOUNCE_MS = 220; // same as UIScene: ignore the press that opened it
const CHAR_MS = 18;

export interface DialogueApi {
  open(name: string, lines: string[], npcId?: string): void;
  advance(): void;
  /** Hide immediately without the gift follow-up (sceneReset). */
  reset(): void;
}

/**
 * @param onFinished called after the last line closes, with the npcId passed
 *   in `dialogue(name, lines, { npcId })` (for the gift menu).
 */
export function mountDialogue(ctx: UIContext, onFinished: (npcId?: string) => void): DialogueApi {
  const { d } = ctx;
  const name = el("div", { class: "olw-dlg-name" });
  const text = el("p", { class: "olw-dlg-text" });
  const hintLabel = el("span", { class: "olw-dlg-hint-label" });
  const hint = el("div", { class: "olw-dlg-hint" }, [
    hintLabel,
    el("span", { class: "olw-dlg-caret", text: "▾", attrs: { "aria-hidden": "true" } }),
  ]);
  const box = el("div", { class: "olw-panel olw-dlg-box", attrs: { role: "dialog", "aria-live": "polite" } }, [name, text, hint]);
  // full-screen catcher so a tap anywhere advances (as in UIScene)
  const wrap = d.node(el("div", { class: "olw-dlg olw-hidden" }, [box]));
  ctx.layer.append(wrap);

  let lines: string[] = [];
  let index = 0;
  let openedAt = 0;
  let npc: string | undefined;
  let typing = false;
  let cancelType: (() => void) | null = null;

  const stopTyping = () => {
    cancelType?.();
    cancelType = null;
    typing = false;
    text.textContent = lines[index] ?? "";
    box.classList.remove("olw-dlg--typing");
  };

  const showLine = () => {
    const full = lines[index] ?? "";
    cancelType?.();
    if (prefersReducedMotion() || full.length < 2) {
      text.textContent = full;
      typing = false;
      return;
    }
    typing = true;
    box.classList.add("olw-dlg--typing");
    let n = 0;
    const step = () => {
      n = Math.min(full.length, n + 1);
      text.textContent = full.slice(0, n);
      if (n >= full.length) {
        stopTyping();
        return;
      }
      cancelType = d.timeout(step, CHAR_MS);
    };
    step();
  };

  const close = () => {
    stopTyping();
    wrap.classList.add("olw-hidden");
    ctx.dialogueOpen = false;
  };

  const api: DialogueApi = {
    open(who, ls, npcId) {
      lines = ls && ls.length ? ls.map((l) => `${l}`) : ["..."];
      index = 0;
      npc = npcId;
      openedAt = performance.now();
      name.textContent = who ?? "";
      hintLabel.textContent = ctx.touch ? "tap to continue" : "Space to continue";
      name.classList.toggle("olw-hidden", !who);
      wrap.classList.remove("olw-hidden");
      ctx.dialogueOpen = true;
      ctx.lock();
      ctx.changed();
      showLine();
    },
    advance() {
      if (!ctx.dialogueOpen) return;
      const now = performance.now();
      if (now - openedAt < DEBOUNCE_MS) return;
      openedAt = now;
      if (typing) {
        stopTyping(); // first press completes the line
        return;
      }
      index++;
      if (index >= lines.length) {
        close();
        const pending = npc;
        npc = undefined;
        ctx.changed();
        ctx.unlockIfIdle();
        onFinished(pending);
      } else {
        showLine();
      }
    },
    reset() {
      npc = undefined;
      if (ctx.dialogueOpen) close();
    },
  };

  d.listen(wrap, "click", (e) => {
    e.preventDefault();
    api.advance();
  });
  return api;
}
