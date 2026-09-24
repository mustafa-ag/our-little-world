// Modal panels wired to uiEvents: shop, phone, gift (ported) and map,
// local map, minigame (stubs until the real 3D versions land).
import { store } from "../../game/systems/store";
import { minimap, uiEvents, type MiniGameSpec } from "../../game/systems/controls";
import { CITIES, LOCATIONS } from "../../game/data/locations";
import { button, el } from "./dom";
import type { UIContext } from "./context";
import { ModalHost } from "./modal";
import { shopBody, shopTitle, type ShopMode } from "./shop";
import { phoneBody } from "./phone";
import { giftBody, giftName } from "./gift";

export function mountModals(ctx: UIContext) {
  const host = new ModalHost(ctx);
  const { d } = ctx;

  const openShop = (mode: ShopMode = "home") => {
    if (ctx.anyModal()) return;
    host.open({ kind: "shop", ...shopTitle(mode), className: `olw-shop olw-shop--${mode}`, body: (md) => shopBody(md, mode) });
  };

  const openPhone = () => {
    if (ctx.anyModal()) return;
    host.open({ kind: "phone", title: "Phone", className: "olw-phone-modal", body: phoneBody });
  };

  const openGift = (npcId: string) => {
    if (!store.giftableItems().length) return false;
    host.open({ kind: "gift", title: `Give ${giftName(npcId)} something`, className: "olw-gift-modal", body: (md, close) => giftBody(md, close, npcId) });
    return true;
  };

  // TODO(3d): replace with the real globe / travel picker. In 2D "openMap" was
  // handled by WorldScene (not the UI); this read-only panel is a placeholder.
  const openMap = () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "map",
      title: "Our map",
      subtitle: "Travel by globe is coming to the 3D world soon.",
      className: "olw-map-modal",
      body: (md, close) => {
        const here = store.state.currentLocation;
        const ul = el("ul", { class: "olw-map-list" });
        for (const city of CITIES) {
          const districts = Object.values(LOCATIONS).filter((l) => l.cityId === city.id && store.isUnlocked(l.id));
          const open = store.isUnlocked(city.id) || districts.length > 0;
          ul.append(
            el("li", { class: open ? "olw-map-city" : "olw-map-city olw-map-city--locked" }, [
              el("span", { class: "olw-map-city-name", text: open ? city.name : `${city.name} · locked` }),
              open && districts.length
                ? el("span", {
                    class: "olw-map-districts",
                    text: districts.map((l) => (l.id === here ? `${l.name} (you're here)` : l.name)).join(" · "),
                  })
                : null,
            ]),
          );
        }
        return el("div", {}, [ul, el("div", { class: "olw-modal-actions" }, [button(md, "Close", "olw-btn olw-btn--rose", close)])]);
      },
    });
  };

  // TODO(3d): draw the real district map. Placeholder lists the areas the
  // world wrote into `minimap`.
  const openLocalMap = () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "localMap",
      title: minimap.cityName || minimap.name || "District map",
      subtitle: "A proper drawn map is on its way.",
      className: "olw-map-modal",
      body: (md, close) => {
        const areas = minimap.areas.length
          ? el(
              "ul",
              { class: "olw-map-list" },
              minimap.areas.map((a) => el("li", { class: a.here ? "olw-map-city olw-map-here" : "olw-map-city", text: a.here ? `${a.name} — you're here` : a.name })),
            )
          : el("p", { class: "olw-empty", text: "No GPS signal here yet." });
        return el("div", {}, [areas, el("div", { class: "olw-modal-actions" }, [button(md, "Close", "olw-btn olw-btn--rose", close)])]);
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

  return { host, openPhone, openGift };
}
