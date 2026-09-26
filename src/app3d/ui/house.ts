// House interior UI (HouseScene port, DOM side): the fade in / out around
// entering and leaving the 3D interior, and the three hotspot panels —
// the bed's "Rest?" prompt, the wardrobe and the photo wall placeholder.
//
// Flow: worldController emits "enterHouse" -> fade out -> "interiorEnter"
// (main.ts -> Game3D.enterInterior) -> fade in. The interior's door emits
// "leaveHouse" -> fade -> "interiorExit" -> fade in. Game3D emits
// "interiorClosed" whenever the interior goes away (also on travel).
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import { getNpcsAtLocation, homeComment, npcWhere } from "../../game/systems/life";
import * as quests from "../../game/systems/quests";
import { LOCATIONS, getLocation } from "../../game/data/locations";
import { NPCS, type NpcDef } from "../../game/data/npcs";
import { BUILD_CATALOG, type BuildCatalogItem } from "../../game/data/furnitureCatalog";
import { button, el, icon, prefersReducedMotion, type Disposer } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";
import { wardrobeView } from "./wardrobe";

type Sleep = (opts?: { fromBed?: boolean }) => void;

const DECOR_SLOTS = [
  { x: 40, y: 128 }, { x: 88, y: 152 }, { x: 144, y: 140 }, { x: 200, y: 152 }, { x: 248, y: 128 },
  { x: 64, y: 96 }, { x: 112, y: 104 }, { x: 176, y: 104 }, { x: 224, y: 96 }, { x: 144, y: 176 },
] as const;

function decorItems() {
  return BUILD_CATALOG.filter((item): item is BuildCatalogItem & { texture: string } =>
    !!item.texture && (!item.special || store.state.flags.wedding_completed));
}

function propertyFurniture() {
  return store.state.properties[store.state.primaryHomeId]?.furniture ?? [];
}

function storedCount(texture: string) {
  return (store.state.properties[store.state.primaryHomeId]?.storedFurniture ?? []).filter((id) => id === texture).length;
}

export function mountHouse(ctx: UIContext, host: ModalHost, sleep: Sleep) {
  const { d } = ctx;
  const label = el("span", { class: "olw-travel-fade-label" });
  const fade = d.node(el("div", { class: "olw-sleep-fade olw-travel-fade", attrs: { "aria-hidden": "true" } }, [label]));
  ctx.layer.append(fade);
  let busy = false;
  let canDecorate = false;

  const decorateButton = d.node(button(d, "Decorate", "olw-btn olw-btn--rose olw-decorate-button", () => openDecorate()));
  decorateButton.prepend(icon("sparkle"));
  decorateButton.hidden = true;
  ctx.layer.append(decorateButton);

  const refreshFurnitureScene = () => uiEvents.emit("furnitureChanged", store.state.primaryHomeId);

  const placeItem = (item: BuildCatalogItem & { texture: string }) => {
    const furniture = propertyFurniture();
    if (furniture.length >= DECOR_SLOTS.length) {
      store.toast("The room is delightfully full. Remove something first.", "#f4a6c0");
      return false;
    }
    const usingStored = storedCount(item.texture) > 0;
    if (usingStored) store.takeStoredFurniture(item.texture);
    else if (item.price && !store.spendCoins(item.price)) {
      store.toast(`Need ${item.price - store.state.coins} more coins.`, "#e46d94");
      return false;
    }
    const slot = DECOR_SLOTS.find((candidate) => !furniture.some((piece) => piece.x === candidate.x && piece.y === candidate.y)) ?? DECOR_SLOTS[furniture.length];
    store.placeFurniture({ tex: item.texture, x: slot.x, y: slot.y });
    if (!usingStored) {
      store.incrementStat("furniture_bought");
      quests.onBuy(item.texture);
    }
    quests.onDecorate("home");
    quests.onInteract("home_refresh");
    store.incrementStat("rooms_redesigned");
    store.toast(`${item.name} placed ♡`, "#7be0a3");
    refreshFurnitureScene();
    return true;
  };

  const removeItem = (item: BuildCatalogItem & { texture: string }) => {
    const furniture = propertyFurniture();
    const index = furniture.map((piece) => piece.tex).lastIndexOf(item.texture);
    if (index < 0) return false;
    const next = furniture.slice();
    next.splice(index, 1);
    store.storeFurniture(item.texture);
    store.setFurniture(next);
    store.toast(`${item.name} moved to storage.`, "#8ecae6");
    refreshFurnitureScene();
    return true;
  };

  const decorateView = (md: Disposer): Node => {
    const root = el("div", { class: "olw-decorate" });
    let renderD: Disposer | undefined;
    const render = () => {
      renderD?.dispose();
      renderD = md.child();
      const rd = renderD;
      const property = store.state.properties[store.state.primaryHomeId];
      const furniture = property?.furniture ?? [];
      const wallet = el("p", { class: "olw-shop-wallet", text: `${store.state.coins} coins · ${furniture.length}/${DECOR_SLOTS.length} pieces placed` });
      const grid = el("ul", { class: "olw-decor-grid" });
      for (const item of decorItems()) {
        const placed = furniture.filter((piece) => piece.tex === item.texture).length;
        const stored = storedCount(item.texture);
        const place = button(rd, stored ? "Place owned" : item.price ? `Buy & place · ${item.price}` : "Place reward", "olw-btn olw-btn--rose olw-btn--small", () => {
          if (placeItem(item)) render();
        });
        place.disabled = furniture.length >= DECOR_SLOTS.length;
        const remove = button(rd, "Remove", "olw-btn olw-btn--ghost olw-btn--small", () => {
          if (removeItem(item)) render();
        });
        remove.disabled = placed === 0;
        grid.append(el("li", { class: "olw-decor-item" }, [
          el("span", { class: "olw-decor-glyph", text: item.name.charAt(0), attrs: { "aria-hidden": "true" } }),
          el("span", { class: "olw-decor-copy" }, [
            el("span", { class: "olw-shop-name", text: item.name }),
            el("span", { class: "olw-shop-kind", text: `${placed} placed · ${stored} stored` }),
          ]),
          el("div", { class: "olw-decor-actions" }, [place, remove]),
        ]));
      }
      root.replaceChildren(wallet, el("p", { class: "olw-home-hint", text: "Choose Place to add a piece to the room. Remove sends the latest one back to storage." }), grid);
    };
    render();
    return root;
  };

  function openDecorate() {
    if (!canDecorate || ctx.anyModal()) return;
    host.open({
      kind: "decorate",
      title: "Decorate your home",
      subtitle: "Make the room feel like yours.",
      className: "olw-decorate-modal",
      body: (md) => decorateView(md),
    });
  }

  const setIndoors = (on: boolean) => {
    if (ctx.indoors === on) return;
    ctx.indoors = on;
    ctx.layer.classList.toggle("olw-indoors", on);
    ctx.changed();
  };

  /** Fade to black, run `step` (which reports back), fade in. */
  const transition = (text: string, step: (done: (ok: boolean) => void) => boolean, after: (ok: boolean) => void) => {
    if (busy) return;
    busy = true;
    host.closeAny();
    ctx.lock();
    uiEvents.emit("prompt", null);
    label.textContent = text;
    const ms = prefersReducedMotion() ? 0 : 600;
    fade.classList.add("olw-sleep-fade--on");
    d.timeout(() => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        after(ok);
        d.timeout(() => {
          fade.classList.remove("olw-sleep-fade--on");
          busy = false;
          ctx.unlockIfIdle();
        }, ms ? 200 : 0);
      };
      if (!step(finish)) finish(false);
    }, ms);
  };

  d.on(uiEvents, "enterHouse", (opts: { title: string; interior?: "cream" | "brown"; primaryHome?: boolean }) => {
    if (ctx.indoors || ctx.anyModal()) return;
    const title = opts?.title ?? "Home";
    transition(
      title,
      (done) => uiEvents.emit("interiorEnter", { title, interior: opts?.interior ?? "cream", primaryHome: !!opts?.primaryHome }, done),
      (ok) => {
        if (!ok) {
          store.toast(`${title} — couldn't go inside right now`, "#f4a6c0");
          return;
        }
        setIndoors(true);
        const primary = store.state.properties[store.state.primaryHomeId];
        canDecorate = !!opts?.primaryHome && !!primary?.owned;
        decorateButton.hidden = !canDecorate;
        uiEvents.emit("locationTitle", title, opts?.interior === "brown" ? "Inside" : "Home");
        // HouseScene: a small note about the place once Moomoo knows it well
        const note = opts?.interior !== "brown" ? homeComment() : null;
        if (note && store.getRelationship("moomoo") >= 10) d.timeout(() => uiEvents.emit("dialogue", "Home", [note]), 900);
      },
    );
  });

  d.on(uiEvents, "leaveHouse", () => {
    if (!ctx.indoors || ctx.anyModal()) return;
    transition(
      "Outside…",
      (done) => uiEvents.emit("interiorExit", done),
      (ok) => {
        if (ok) {
          setIndoors(false);
          canDecorate = false;
          decorateButton.hidden = true;
        }
      },
    );
  });

  d.on(uiEvents, "interiorClosed", () => {
    setIndoors(false);
    canDecorate = false;
    decorateButton.hidden = true;
  });

  // ---- bed: "Rest?" ----
  d.on(uiEvents, "houseRest", () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "rest",
      title: "Rest?",
      subtitle: store.clockLabel(),
      className: "olw-rest-modal",
      body: (md, close) =>
        el("div", { class: "olw-rest-body" }, [
          el("p", { class: "olw-rest-line", text: "The duvet is exactly the right amount of heavy." }),
          el("div", { class: "olw-modal-actions" }, [
            button(md, "Just lie down", "olw-btn olw-btn--ghost", close),
            button(md, "Sleep until morning", "olw-btn olw-btn--rose", () => {
              close();
              sleep({ fromBed: true });
            }),
          ]),
        ]),
    });
  });

  // ---- wardrobe ----
  const openWardrobe = () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "wardrobe",
      title: "Wardrobe",
      subtitle: "Pick something to wear today.",
      className: "olw-wardrobe-modal",
      body: (md) => wardrobeView(md),
    });
  };
  d.on(uiEvents, "openWardrobe", openWardrobe);

  // ---- photo wall (placeholder for the Phase 4 camera / album) ----
  d.on(uiEvents, "openPhotoWall", () => {
    if (ctx.anyModal()) return;
    host.open({
      kind: "photoWall",
      title: "Photo wall",
      subtitle: "Little moments, kept.",
      className: "olw-photos-modal",
      body: () => {
        const photos = Object.values(store.state.photos).sort((a, b) => b.day - a.day);
        if (!photos.length) return el("p", { class: "olw-empty olw-photos-empty", text: "Your memories will live here." });
        const frameIcon = { classic: "▢", hearts: "♡", city: "▥", chaos: "✦" } as const;
        return el(
          "ul",
          { class: "olw-photo-grid" },
          photos.map((p) =>
            el("li", { class: `olw-photo olw-photo--${p.frame ?? "classic"}` }, [
              el("span", { class: "olw-photo-pic", text: frameIcon[p.frame ?? "classic"], attrs: { "aria-hidden": "true" } }),
              el("span", { class: "olw-photo-title", text: p.title }),
              p.caption ? el("span", { class: "olw-photo-caption", text: p.caption }) : null,
              el("span", { class: "olw-photo-meta", text: `Day ${p.day} · ${getLocation(p.locationId)?.name ?? p.locationId}` }),
            ]),
          ),
        );
      },
    });
  });

  // ---- "Invite someone over" (HouseScene visitor hangout) ----
  /** Everyone whose schedule has them somewhere in this city right now (mall staff stay at work). */
  const nearbyPeople = (): NpcDef[] => {
    const cityId = getLocation(store.state.currentLocation)?.cityId;
    if (!cityId) return [];
    const ids = new Set<string>();
    for (const loc of Object.values(LOCATIONS)) {
      if (loc.cityId !== cityId) continue;
      for (const id of getNpcsAtLocation(loc.id)) ids.add(id);
    }
    return NPCS.filter((n) => ids.has(n.id) && n.location !== "mall");
  };

  const placeOf = (n: NpcDef) => {
    const id = npcWhere(n).location;
    return getLocation(id)?.name ?? id;
  };

  /** HouseScene's married-Moomoo hangout choices, with lines for anyone. */
  const HANGOUTS: { id: string; label: string; line: (name: string) => string }[] = [
    { id: "hug", label: "Hug", line: (name) => `${name} hugs Juju at the door like it has been a year, not a week.` },
    { id: "coffee", label: "Make coffee", line: () => "Two cups. One sofa. The timing is somehow perfect." },
    { id: "sofa", label: "Sit together", line: (name) => `Juju and ${name} sink into the sofa. Feet up. The world can wait outside.` },
    { id: "home", label: "Talk about the home", line: (name) => homeComment() ?? `${name} walks the room slowly. "It feels like you in here."` },
  ];

  const openHangout = (npc: NpcDef) => {
    host.open({
      kind: "visitor",
      title: `${npc.name} is here`,
      subtitle: "Keep it short, cozy, and completely optional.",
      className: "olw-rest-modal",
      body: (md, close) =>
        el("div", { class: "olw-rest-body" }, [
          el("div", { class: "olw-modal-actions" }, HANGOUTS.map((h) =>
            button(md, h.label, "olw-btn olw-btn--ghost", () => {
              close();
              uiEvents.emit("dialogue", npc.name, [h.line(npc.name)]);
            }),
          )),
        ]),
    });
  };

  const inviteOver = (npc: NpcDef) => {
    quests.onInteract("home_visit");
    // one bond point per person per day (the visit itself can repeat)
    if (!store.hasDaily(`home_visit_${npc.id}`)) {
      store.setDaily(`home_visit_${npc.id}`);
      store.addRelationship(npc.id, 1);
    }
    store.toast(`${npc.name} came over!`, "#f4a6c0");
    openHangout(npc);
  };

  d.on(uiEvents, "houseInvite", () => {
    if (ctx.anyModal()) return;
    const people = nearbyPeople();
    host.open({
      kind: "visitor",
      title: "Invite someone over",
      subtitle: people.length ? "Who's around the city right now?" : store.clockLabel(),
      className: "olw-rest-modal",
      body: (md, close) =>
        el("div", { class: "olw-rest-body" }, [
          people.length
            ? el("div", { class: "olw-modal-actions" }, people.map((n) =>
                button(md, `${n.name} · ${placeOf(n)}`, "olw-btn olw-btn--rose", () => {
                  close();
                  inviteOver(n);
                }),
              ))
            : el("p", { class: "olw-rest-line", text: "Nobody's around this part of the world right now. Try another time of day." }),
          el("div", { class: "olw-modal-actions" }, [button(md, "Never mind", "olw-btn olw-btn--ghost", close)]),
        ]),
    });
  });

  // ---- Tigor at home ----
  d.on(uiEvents, "petHomeTigor", () => {
    if (ctx.anyModal() || !store.state.tigor.atHome) return;
    store.petTigor();
    quests.onInteract("tigor_home");
    uiEvents.emit("dialogue", "Tigor", ["Tigor curls up on your lap. Purring loudly."]);
  });

  return { openWardrobe };
}
