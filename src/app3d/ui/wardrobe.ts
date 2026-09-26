// Wardrobe / outfit picker, shared by the house wardrobe panel and the phone's
// Wardrobe tab. Lists every outfit in data/outfits.ts with a mini Juju
// silhouette swatch (inline SVG dressed from jujuLook / palette.ts Outfits),
// owned / locked state and the equipped one highlighted.
// Equipping goes through store.setOutfit (emits "outfit": PlayerView re-dresses
// Juju) and, if someone is walking with her, shows their outfitReaction line.
import { store } from "../../game/systems/store";
import { OUTFIT_UNLOCKS } from "../../game/data/outfits";
import { NPCS } from "../../game/data/npcs";
import { Outfits } from "../../game/palette";
import { JUJU_HAIR, JUJU_HAIR_STREAK, JUJU_SKIN, jujuLook } from "../assets/kit/characters";
import { outfitReaction } from "../../game/systems/outfitReactions";
import { button, el, type Disposer } from "./dom";

const FALLBACK_EMOJI: Record<string, string> = {
  red_bottom_boots: "👢",
  city_bag: "👜",
  sneakers: "👟",
  shopping_heels: "👠",
  shopping_sandals: "🩴",
};

const HEX = /^#[0-9a-f]{3,8}$/i;
const hex = (c: string | undefined, fb: string) => (c && HEX.test(c) ? c : fb);

/** A 40 x 56 feminine silhouette (Juju: long dark hair, olive skin) wearing outfit `id`. */
function silhouetteSvg(id: string): string {
  const o = Outfits[id];
  const look = jujuLook(id);
  const top = hex(look.top, "#f5f0eb");
  const shade = hex(o?.topShade, top);
  const outer = look.outer ? hex(look.outer, top) : null;
  const bottom = hex(look.bottom, "#2d2d3a");
  const shoes = hex(look.shoes, "#fbfaf7");
  const skin = JUJU_SKIN;
  const hair = JUJU_HAIR;
  const lower =
    look.bottomKind === "skirt"
      ? `<rect x="16.4" y="44" width="2.6" height="7.5" rx="1.2" fill="${skin}"/><rect x="21" y="44" width="2.6" height="7.5" rx="1.2" fill="${skin}"/>` +
        `<path d="M15 30 L25 30 L28.6 46.5 Q20 48.6 11.4 46.5 Z" fill="${bottom}"/>` +
        `<path d="M20 30 L25 30 L28.6 46.5 Q24.5 47.8 21 48 Z" fill="#000" opacity="0.12"/>`
      : `<path d="M15 30 L20.2 30 L19.7 51.2 L16.1 51.2 Z" fill="${bottom}"/><path d="M19.8 30 L25 30 L23.9 51.2 L20.3 51.2 Z" fill="${bottom}"/>` +
        `<path d="M21.5 30 L25 30 L23.9 51.2 L22.4 51.2 Z" fill="#000" opacity="0.12"/>`;
  const coat = outer
    ? `<path d="M13.6 18.2 L17.6 17.6 L17.2 37.5 L13 37 Z" fill="${outer}"/><path d="M26.4 18.2 L22.4 17.6 L22.8 37.5 L27 37 Z" fill="${outer}"/>`
    : "";
  const sleeve = outer ?? top;
  return (
    `<svg viewBox="0 0 40 56" width="40" height="56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    // long wavy hair behind the shoulders
    `<path d="M20 4 C11.5 4 10 11 10.8 19 C11.3 25 9.6 29 11.8 33 Q13.5 31.5 14 29 L26 29 Q26.5 31.5 28.2 33 C30.4 29 28.7 25 29.2 19 C30 11 28.5 4 20 4 Z" fill="${hair}"/>` +
    `<path d="M26.2 9 C28.6 13 27.6 20 28.4 26 Q28.8 29.5 28.2 33 C26.6 31 26.8 27 26.4 22 C26 17 26.9 12 26.2 9 Z" fill="${JUJU_HAIR_STREAK}"/>` +
    // arms (sleeves) + hands
    `<path d="M14.2 19 L11.4 30.5" stroke="${sleeve}" stroke-width="3.1" stroke-linecap="round"/><path d="M25.8 19 L28.6 30.5" stroke="${sleeve}" stroke-width="3.1" stroke-linecap="round"/>` +
    `<circle cx="11.1" cy="32" r="1.4" fill="${skin}"/><circle cx="28.9" cy="32" r="1.4" fill="${skin}"/>` +
    lower +
    `<ellipse cx="17.7" cy="52.4" rx="2.7" ry="1.5" fill="${shoes}" stroke="rgba(58,43,58,0.35)" stroke-width="0.5"/><ellipse cx="22.3" cy="52.4" rx="2.7" ry="1.5" fill="${shoes}" stroke="rgba(58,43,58,0.35)" stroke-width="0.5"/>` +
    // fitted top (narrow waist, a little shade on one side)
    `<rect x="18.6" y="13.5" width="2.8" height="4.5" fill="${skin}"/>` +
    `<path d="M14 18.3 Q20 16.4 26 18.3 L24.6 25 Q24.4 27.5 25.2 30.4 Q20 31.4 14.8 30.4 Q15.6 27.5 15.4 25 Z" fill="${top}"/>` +
    `<path d="M21 17.3 Q24 17.6 26 18.3 L24.6 25 Q24.4 27.5 25.2 30.4 Q23 30.9 21 31 Z" fill="${shade}" opacity="0.7"/>` +
    coat +
    // head, fringe, face
    `<ellipse cx="20" cy="10.4" rx="4.9" ry="5.5" fill="${skin}"/>` +
    `<path d="M14.9 11 C14.4 5.2 25.6 5.2 25.1 11 C24 7.8 19.5 7.2 17.6 8.6 C16.6 9.3 15.6 10.2 14.9 11 Z" fill="${hair}"/>` +
    `<ellipse cx="18.2" cy="10.9" rx="0.7" ry="0.85" fill="#1e0f07"/><ellipse cx="21.8" cy="10.9" rx="0.7" ry="0.85" fill="#1e0f07"/>` +
    `<path d="M19 13.4 Q20 14.1 21 13.4" stroke="#c07060" stroke-width="0.7" fill="none" stroke-linecap="round"/>` +
    `</svg>`
  );
}

export function swatch(id: string): HTMLElement {
  const o = Outfits[id];
  if (!o) return el("span", { class: "olw-ward-swatch olw-ward-swatch--emoji", text: FALLBACK_EMOJI[id] ?? "👗", attrs: { "aria-hidden": "true" } });
  const node = el("span", {
    class: "olw-ward-swatch olw-ward-swatch--figure",
    attrs: { "aria-hidden": "true" },
    style: {
      width: "40px",
      height: "56px",
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      background: `radial-gradient(circle at 50% 40%, #fffaf3 0 55%, ${o.topShade}33 100%)`,
    },
  });
  node.innerHTML = silhouetteSvg(id);
  return node;
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
