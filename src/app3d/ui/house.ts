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
import { button, el, prefersReducedMotion } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";
import { wardrobeView } from "./wardrobe";

type Sleep = (opts?: { fromBed?: boolean }) => void;

export function mountHouse(ctx: UIContext, host: ModalHost, sleep: Sleep) {
  const { d } = ctx;
  const label = el("span", { class: "olw-travel-fade-label" });
  const fade = d.node(el("div", { class: "olw-sleep-fade olw-travel-fade", attrs: { "aria-hidden": "true" } }, [label]));
  ctx.layer.append(fade);
  let busy = false;

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

  d.on(uiEvents, "enterHouse", (opts: { title: string; interior?: "cream" | "brown" }) => {
    if (ctx.indoors || ctx.anyModal()) return;
    const title = opts?.title ?? "Home";
    transition(
      title,
      (done) => uiEvents.emit("interiorEnter", { title, interior: opts?.interior ?? "cream" }, done),
      (ok) => {
        if (!ok) {
          store.toast(`${title} — couldn't go inside right now`, "#f4a6c0");
          return;
        }
        setIndoors(true);
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
        if (ok) setIndoors(false);
      },
    );
  });

  d.on(uiEvents, "interiorClosed", () => setIndoors(false));

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
