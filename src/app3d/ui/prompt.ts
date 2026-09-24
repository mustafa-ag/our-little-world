// Interaction prompt ("E — Talk to Baba"). On touch devices the pill is a
// real button that emits exactly what the Phaser "A" button emitted: "action".
import { uiEvents } from "../../game/systems/controls";
import { cleanPrompt, el } from "./dom";
import type { UIContext } from "./context";

export function mountPrompt(ctx: UIContext) {
  const { d } = ctx;
  const key = el("span", { class: "olw-key", text: "E", attrs: { "aria-hidden": "true" } });
  const tap = el("span", { class: "olw-prompt-tap", text: "Tap", attrs: { "aria-hidden": "true" } });
  const label = el("span", { class: "olw-prompt-label" });
  const pill = d.node(
    el("button", { class: "olw-prompt olw-play-only", attrs: { type: "button", tabindex: "-1" } }, [key, tap, label]),
  );
  ctx.layer.append(pill);

  let current: string | null = null;
  const render = () => {
    // UIScene.setPrompt hid the prompt while a dialogue was open.
    const show = !!current && ctx.started && !ctx.anyModal();
    pill.classList.toggle("olw-show", show);
    pill.setAttribute("aria-hidden", show ? "false" : "true");
    if (current) label.textContent = cleanPrompt(current);
  };

  d.listen(pill, "click", (e) => {
    e.preventDefault();
    if (!ctx.touch) return; // desktop: purely informational, use E / Space
    uiEvents.emit("action");
  });
  d.on(uiEvents, "prompt", (p: string | null) => {
    current = p || null;
    render();
  });
  ctx.bus.on("change", render);

  return {
    set(p: string | null) {
      current = p;
      render();
    },
  };
}
