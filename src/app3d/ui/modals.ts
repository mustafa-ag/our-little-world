// Modal panels wired to uiEvents: shop, phone, gift, world map (travel),
// district map (live overhead map), minigame (stub until the 3D version lands).
import { store } from "../../game/systems/store";
import { minimap, uiEvents, type MiniGameSpec } from "../../game/systems/controls";
import { cityMeta, getLocation } from "../../game/data/locations";
import { mapFeed } from "../systems/mapFeed";
import { button, el, prefersReducedMotion } from "./dom";
import type { UIContext } from "./context";
import { ModalHost } from "./modal";
import { shopBody, shopTitle, type ShopMode } from "./shop";
import { phoneBody } from "./phone";
import { giftBody, giftName } from "./gift";
import { worldMapView } from "./worldMap";
import { NPC_BANDS, POI_LEGEND, createLocalMap } from "./minimap";

export function mountModals(ctx: UIContext) {
  const host = new ModalHost(ctx);
  const { d } = ctx;

  const openShop = (mode: ShopMode = "home") => {
    if (ctx.anyModal()) return;
    host.open({ kind: "shop", ...shopTitle(mode), className: `olw-shop olw-shop--${mode}`, body: (md) => shopBody(md, mode) });
  };

  const openPhone = () => {
    if (ctx.anyModal()) return;
    host.open({ kind: "phone", title: "Phone", className: "olw-phone-modal", body: (md, close) => phoneBody(md, close, travelTo) });
  };

  const openGift = (npcId: string) => {
    if (!store.giftableItems().length) return false;
    host.open({ kind: "gift", title: `Give ${giftName(npcId)} something`, className: "olw-gift-modal", body: (md, close) => giftBody(md, close, npcId) });
    return true;
  };

  // ---- world-map travel: close panels -> fade out -> load -> fade in ----
  const fadeLabel = el("span", { class: "olw-travel-fade-label" });
  const fade = d.node(el("div", { class: "olw-sleep-fade olw-travel-fade", attrs: { "aria-hidden": "true" } }, [fadeLabel]));
  ctx.layer.append(fade);
  let travelling = false;
  const travelTo = (id: string) => {
    if (travelling) return;
    travelling = true;
    host.closeAny();
    ctx.lock();
    uiEvents.emit("prompt", null);
    fadeLabel.textContent = `Travelling to ${getLocation(id).name}…`;
    const ms = prefersReducedMotion() ? 0 : 700;
    fade.classList.add("olw-sleep-fade--on");
    d.timeout(() => {
      const finish = (ok: boolean) => {
        d.timeout(() => {
          fade.classList.remove("olw-sleep-fade--on");
          travelling = false;
          ctx.unlockIfIdle();
          if (!ok) store.toast(`Couldn't get to ${getLocation(id).name} right now`, "#e46d94");
        }, ms ? 250 : 0);
      };
      // main.ts answers "travelTo" (Game3D.travelTo); no listener = no world
      if (!uiEvents.emit("travelTo", id, finish)) finish(false);
    }, ms);
  };

  const openMap = () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "map",
      title: "Our map",
      subtitle: "Every place we've been, and the ones still waiting.",
      className: "olw-map-modal",
      body: (md) => worldMapView(md, travelTo),
    });
  };

  // District map: the live overhead map of the current 3D location.
  const openLocalMap = () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "localMap",
      title: mapFeed.name || minimap.cityName || minimap.name || "District map",
      subtitle: cityMeta(mapFeed.cityId)?.name,
      className: "olw-map-modal olw-lmap-modal",
      body: (md, close) => {
        const big = window.matchMedia?.("(max-width: 600px)").matches;
        const map = createLocalMap(md, big ? Math.min(window.innerWidth - 64, 340) : 520, big ? 300 : 380, true);
        const swatch = (color: string, label: string, ring = false) =>
          el("li", { class: "olw-lmap-key" }, [
            el("span", { class: ring ? "olw-lmap-sw olw-lmap-sw--ring" : "olw-lmap-sw", style: { background: ring ? "transparent" : color } }),
            label,
          ]);
        const legend = el("ul", { class: "olw-lmap-legend" }, [
          el("li", { class: "olw-lmap-key" }, [el("span", { class: "olw-lmap-sw olw-lmap-sw--you" }), "You"]),
          ...NPC_BANDS.map((b) => swatch(b.color, b.label)),
          ...POI_LEGEND.map(([g, c]) => swatch(c, g, g === "Way out")),
        ]);
        const body = mapFeed.ready
          ? el("div", { class: "olw-lmap-wrap" }, [map.el, legend])
          : el("p", { class: "olw-empty", text: "The map is still loading." });
        return el("div", {}, [
          body,
          el("div", { class: "olw-modal-actions" }, [
            button(md, "World map", "olw-btn", () => {
              close();
              openMap();
            }),
            button(md, "Close", "olw-btn olw-btn--rose", close),
          ]),
        ]);
      },
    });
  };

  // TODO(3d): port ui/minigames.ts activities. Stub: title + hint + Done.
  const openMiniGame = (spec: MiniGameSpec) => {
    if (ctx.anyModal() && ctx.modal !== "minigame") return;
    host.open({
      kind: "minigame",
      title: spec.title,
      className: "olw-minigame-modal",
      body: (md, close) => {
        const play = button(md, "Play (coming soon)", "olw-btn olw-btn--ghost", () => {});
        play.disabled = true;
        const done = button(md, spec.skipLabel ?? "Done", "olw-btn", () => {
          close();
          spec.onDone(true);
        });
        return el("div", { class: "olw-minigame" }, [
          el("p", { class: "olw-minigame-hint", text: spec.hint }),
          el("div", { class: "olw-modal-actions" }, [play, done]),
        ]);
      },
    });
  };

  d.on(uiEvents, "openShop", (mode?: ShopMode) => openShop(mode));
  d.on(uiEvents, "openPhone", openPhone);
  d.on(uiEvents, "openMap", openMap);
  d.on(uiEvents, "openLocalMap", openLocalMap);
  d.on(uiEvents, "minigame", openMiniGame);

  return { host, openPhone, openGift, openLocalMap, travelTo };
}
