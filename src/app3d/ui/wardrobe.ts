// Wardrobe / outfit picker, shared by the house wardrobe panel and the phone's
// Wardrobe tab. Lists every outfit in data/outfits.ts with a colour swatch
// (palette.ts Outfits), owned / locked state and the equipped one highlighted.
// Equipping goes through store.setOutfit (emits "outfit": PlayerView re-dresses
// Juju) and, if someone is walking with her, shows their outfitReaction line.
import { store } from "../../game/systems/store";
import { OUTFIT_UNLOCKS } from "../../game/data/outfits";
import { NPCS } from "../../game/data/npcs";
import { Outfits } from "../../game/palette";
import { outfitReaction } from "../../game/systems/outfitReactions";
import { button, el, type Disposer } from "./dom";

const FALLBACK_EMOJI: Record<string, string> = {
  red_bottom_boots: "👢",
  city_bag: "👜",
  sneakers: "👟",
  shopping_heels: "👠",
  shopping_sandals: "🩴",
};

function swatch(id: string): HTMLElement {
  const o = Outfits[id];
  if (!o) return el("span", { class: "olw-ward-swatch olw-ward-swatch--emoji", text: FALLBACK_EMOJI[id] ?? "👗", attrs: { "aria-hidden": "true" } });
  return el("span", {
    class: "olw-ward-swatch",
    attrs: { "aria-hidden": "true" },
    style: { background: `linear-gradient(180deg, ${o.top} 0 48%, ${o.topShade} 48% 54%, ${o.bottom} 54% 86%, ${o.shoes} 86% 100%)` },
  });
}

/** Equip an owned outfit; returns the companion's reaction line, if any. */
export function equipOutfit(id: string): string | null {
  if (!store.isOutfitUnlocked(id) || store.state.outfit === id) return null;
  store.setOutfit(id);
  const label = OUTFIT_UNLOCKS.find((o) => o.id === id)?.label ?? id;
  store.toast(`Wearing ${label}`, "#f4a6c0");
  const buddy = store.state.activeCompanionId;
  const line = buddy ? outfitReaction(buddy) : null;
  if (buddy && line) store.toast(`${NPCS.find((n) => n.id === buddy)?.name ?? buddy}: ${line}`, "#ffdbe7");
  return line;
}

export function wardrobeView(md: Disposer): HTMLElement {
  const wrap = el("div", { class: "olw-wardrobe" });
  const render = () => {
    const owned = OUTFIT_UNLOCKS.filter((o) => store.isOutfitUnlocked(o.id)).length;
    const ul = el("ul", { class: "olw-ward-grid" });
    for (const o of OUTFIT_UNLOCKS) {
      const have = store.isOutfitUnlocked(o.id);
      const on = store.state.outfit === o.id;
      const status = on ? "Wearing" : have ? "Owned" : "Locked";
      const action = have && !on ? button(md, "Wear", "olw-btn olw-btn--rose olw-btn--small olw-ward-btn", () => equipOutfit(o.id)) : null;
      ul.append(
        el("li", { class: `olw-ward-item${on ? " olw-ward-item--on" : ""}${have ? "" : " olw-ward-item--locked"}` }, [
          swatch(o.id),
          el("span", { class: "olw-ward-text" }, [
            el("span", { class: "olw-ward-name", text: o.label }),
            el("span", { class: "olw-ward-status", text: have ? status : `${status} · ${o.hint}` }),
          ]),
          action,
        ]),
      );
    }
    wrap.replaceChildren(el("p", { class: "olw-ward-count", text: `${owned} of ${OUTFIT_UNLOCKS.length} outfits` }), ul);
  };
  render();
  md.on(store, "outfit", render);
  md.on(store, "unlock", render);
  return wrap;
}
