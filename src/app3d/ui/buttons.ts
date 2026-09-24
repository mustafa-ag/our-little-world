// Bottom-right buttons: A (touch only; emits "action" exactly like the Phaser
// A button), Phone (opens the phone panel, with an unread badge) and Map
// (emits "openMap", as the Phaser Map button did).
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import { el, icon } from "./dom";
import type { UIContext } from "./context";

export function mountButtons(ctx: UIContext, openPhone: () => void) {
  const { d } = ctx;
  const mk = (cls: string, label: string, children: (Node | string)[]) =>
    el("button", { class: `olw-round ${cls}`, attrs: { type: "button", "aria-label": label } }, children);

  const badge = el("span", { class: "olw-badge olw-hidden" });
  const phone = mk("olw-round--small", "Phone", [icon("phone"), badge]);
  const map = mk("olw-round--small", "Map", [icon("map")]);
  const action = mk("olw-round--action olw-touch-only", "Interact", [el("span", { text: "A" })]);
  const bar = d.node(el("div", { class: "olw-buttons olw-play-only" }, [el("div", { class: "olw-buttons-nav" }, [map, phone]), action]));
  ctx.layer.append(bar);

  // pointerdown (not click) so the A button feels instant, as in Phaser
  d.listen(action, "pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uiEvents.emit("action");
  });
  d.listen(phone, "click", () => {
    if (!ctx.anyModal()) openPhone();
  });
  d.listen(map, "click", () => {
    if (!ctx.anyModal()) uiEvents.emit("openMap");
  });

  const refreshBadge = () => {
    const n = store.unreadCount();
    badge.textContent = n > 9 ? "9+" : `${n}`;
    badge.classList.toggle("olw-hidden", n === 0);
    phone.setAttribute("aria-label", n ? `Phone, ${n} unread` : "Phone");
  };
  refreshBadge();
  d.on(store, "message", refreshBadge);
  d.on(store, "changed", refreshBadge);
  return { refreshBadge };
}
