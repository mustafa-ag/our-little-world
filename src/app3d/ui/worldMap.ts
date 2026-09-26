// World map: every location grouped by city, with lock state and a
// "Travel here" button. Plain DOM (no Babylon) so it works inside the phone
// and as the Map button's panel.
//
// Access rules (mirroring the 2D globe + district walking):
//   - a city's hub is always reachable by globe travel (2D WorldMapScene lists
//     every city hub and unlocks it on arrival);
//   - a district is reachable once it's in store.unlockedLocations (visited),
//     or when an active quest step sends you there, or when nothing walks into
//     it (e.g. Last Exit, which its quest says to reach "from the world map");
//   - otherwise it shows how to unlock it: walk in from a neighbour, and which
//     quests need it.
//   - only locations with a 3D scene (PORTED_LOCATIONS) can be travelled to.
import { store } from "../../game/systems/store";
import { currentStep, statusOf } from "../../game/systems/quests";
import { QUESTS } from "../../game/data/quests";
import { CITIES, LOCATIONS, districtsOf, type LocationDef } from "../../game/data/locations";
import { PORTED_LOCATIONS } from "../systems/worldController";
import { mapFeed } from "../systems/mapFeed";
import { button, el, type Disposer } from "./dom";

/** Display order + labels for the city groups. */
const CITY_ORDER: { id: string; label: string }[] = [
  { id: "edinburgh", label: "Edinburgh" },
  { id: "abudhabi", label: "Abu Dhabi" },
  { id: "dubai", label: "Dubai" },
  { id: "london", label: "London" },
  { id: "amman", label: "Amman" },
  { id: "leicester", label: "Leicester" },
  { id: "germany", label: "Germany" },
  { id: "italy", label: "Italy" },
  { id: "greece", label: "Greece" },
];

export type Access =
  | { state: "here" }
  | { state: "open"; quest?: string }
  | { state: "locked"; reason: string }
  | { state: "unbuilt"; reason: string };

/** The location the 3D world is actually showing (falls back to the save's). */
export function hereId() {
  return mapFeed.locationId || store.state.currentLocation;
}

const isHub = (id: string) => CITIES.some((c) => c.hub === id);

/** Locations with an exit that walks into `id`. */
const walkInFrom = (id: string) => Object.values(LOCATIONS).filter((l) => Object.values(l.exits ?? {}).includes(id));

/** Quests (not finished) with a visit step to `id`; `active` = the current step is that visit. */
function questsNeeding(id: string) {
  const out: { title: string; active: boolean }[] = [];
  for (const q of QUESTS) {
    const status = statusOf(q.id);
    if (status === "done") continue;
    if (!q.steps.some((s) => s.type === "visit" && s.target === id)) continue;
    const step = status === "active" ? currentStep(q.id) : undefined;
    out.push({ title: q.title, active: step?.type === "visit" && step.target === id });
  }
  return out;
}

export function accessOf(loc: LocationDef): Access {
  if (loc.id === hereId()) return { state: "here" };
  if (!PORTED_LOCATIONS.has(loc.id)) return { state: "unbuilt", reason: "Not built in 3D yet" };
  const quests = questsNeeding(loc.id);
  const questNow = quests.find((q) => q.active);
  const neighbours = walkInFrom(loc.id);
  if (store.isUnlocked(loc.id) || isHub(loc.id) || questNow || neighbours.length === 0) return { state: "open", quest: questNow?.title };
  const parts = [`Walk in from ${neighbours.map((n) => n.name).join(" or ")} to unlock`];
  if (quests.length) parts.push(`needed for ${quests.map((q) => `"${q.title}"`).join(", ")}`);
  return { state: "locked", reason: parts.join(" · ") };
}

/** The grouped, scrollable world map list. `travel(id)` is called for unlocked destinations. */
export function worldMapView(md: Disposer, travel: (id: string) => void): HTMLElement {
  const wrap = el("div", { class: "olw-world" });
  const render = () => {
    const here = hereId();
    const hereCity = LOCATIONS[here]?.cityId;
    const groups: HTMLElement[] = [];
    for (const c of CITY_ORDER) {
      const locs = districtsOf(c.id);
      if (!locs.length) continue;
      // hub first, then the rest in data order
      const hub = CITIES.find((m) => m.id === c.id)?.hub;
      locs.sort((a, b) => Number(b.id === hub) - Number(a.id === hub));
      const rows = locs.map((loc) => {
        const a = accessOf(loc);
        const chip =
          a.state === "here" ? "You're here" : a.state === "open" ? (a.quest ? "Quest" : "Unlocked") : a.state === "locked" ? "Locked" : "Soon";
        const detail = a.state === "locked" || a.state === "unbuilt" ? a.reason : a.state === "open" && a.quest ? `Quest: ${a.quest}` : loc.subtitle;
        const go =
          a.state === "open"
            ? button(md, "Travel here", "olw-btn olw-btn--rose olw-world-go", () => travel(loc.id))
            : null;
        return el("li", { class: `olw-world-loc olw-world-loc--${a.state}` }, [
          el("div", { class: "olw-world-loc-head" }, [
            el("span", { class: "olw-world-loc-name", text: loc.name }),
            el("span", { class: `olw-world-chip olw-world-chip--${a.state}`, text: chip }),
          ]),
          el("span", { class: "olw-world-loc-detail", text: detail }),
          go,
        ]);
      });
      const builtCount = locs.filter((l) => PORTED_LOCATIONS.has(l.id)).length;
      groups.push(
        el("section", { class: c.id === hereCity ? "olw-world-city olw-world-city--here" : "olw-world-city" }, [
          el("h3", { class: "olw-world-city-name" }, [
            c.label,
            el("span", { class: "olw-world-city-count", text: builtCount ? ` ${builtCount}/${locs.length} in 3D` : " coming soon" }),
          ]),
          el("ul", { class: "olw-world-list" }, rows),
        ]),
      );
    }
    wrap.replaceChildren(...groups);
  };
  render();
  md.on(store, "questUpdated", render);
  md.on(mapFeed, "location", render);
  return wrap;
}
