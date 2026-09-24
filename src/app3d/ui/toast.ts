// Floating toasts for store "toast" (text, color) events.
import { store } from "../../game/systems/store";
import { el } from "./dom";
import type { UIContext } from "./context";

const MAX = 4;
const LIFE_MS = 1900;

export function mountToasts(ctx: UIContext) {
  const { d } = ctx;
  const stack = d.node(el("div", { class: "olw-toasts", attrs: { "aria-live": "polite" } }));
  ctx.layer.append(stack);

  const show = (text: string, color?: string) => {
    const dot = el("span", { class: "olw-toast-dot" });
    if (color) dot.style.background = color;
    const t = el("div", { class: "olw-toast" }, [dot, el("span", { text: `${text ?? ""}` })]);
    stack.append(t);
    while (stack.childElementCount > MAX) stack.firstElementChild?.remove();
    d.timeout(() => t.classList.add("olw-toast--out"), LIFE_MS - 350);
    d.timeout(() => t.remove(), LIFE_MS);
  };
  d.on(store, "toast", show);
  return { show };
}
