// Phone panel — DOM port of ui/PhoneOverlay.ts (texts, quests, camera,
// album, stats, people, notes, bag, wardrobe, homes, memories, world map).
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import { markRead } from "../../game/systems/phone";
import { activateFromMessage, canStartQuest, prerequisiteHint, startQuest, statusOf } from "../../game/systems/quests";
import { QUESTS } from "../../game/data/quests";
import { NPCS } from "../../game/data/npcs";
import { ITEMS } from "../../game/data/items";
import { MEMORIES } from "../../game/data/memories";
import { CITIES } from "../../game/data/locations";
import { PROPERTIES } from "../../game/data/properties";
import { setPrimaryHome } from "../../game/systems/properties";
import { button, el, type Disposer } from "./dom";
import { worldMapView } from "./worldMap";
import { wardrobeView } from "./wardrobe";
import { storyRequestForStep, type StorySceneId } from "./storyScenes";
import { albumView, cameraView, contactsView, notesView, resetPhoneTabs, statsView, type PhoneNav } from "./phoneTabs";

type Tab = "messages" | "quests" | "camera" | "album" | "stats" | "contacts" | "notes" | "bag" | "wardrobe" | "homes" | "memories" | "map";
const TABS: { id: Tab; label: string }[] = [
  { id: "messages", label: "Texts" },
  { id: "quests", label: "Quests" },
  { id: "camera", label: "Camera" },
  { id: "album", label: "Album" },
  { id: "stats", label: "Stats" },
  { id: "contacts", label: "People" },
  { id: "notes", label: "Notes" },
  { id: "bag", label: "Bag" },
  { id: "wardrobe", label: "Wardrobe" },
  { id: "homes", label: "Homes" },
  { id: "memories", label: "Memories" },
  { id: "map", label: "Map" },
];

let lastTab: Tab = "messages";
/** Texts tab filtered to one sender (set from People › Message). */
let textsFrom: string | undefined;

/** Story scenes that can start from the quest card (the rest are place-bound). */
const PHONE_STORIES = new Set<StorySceneId>(["romance", "wedding", "tigor", "pirate"]);

const npcName = (id: string) => NPCS.find((n) => n.id === id)?.name ?? id;

export function phoneBody(md: Disposer, close: () => void, travel: (id: string) => void): Node {
  const tabs = el("div", { class: "olw-tabs", attrs: { role: "tablist" } });
  const pane = el("div", { class: "olw-tabpane" });
  const tabBtns = new Map<Tab, HTMLButtonElement>();

  const messages = () => {
    const from = textsFrom;
    const list = from ? store.state.messages.filter((m) => m.sender === from) : store.state.messages;
    const filterBar = from
      ? el("div", { class: "olw-msg-filter" }, [
          el("span", { text: `Texts with ${npcName(from)}` }),
          button(md, "Show all", "olw-btn olw-btn--ghost olw-btn--small", () => {
            textsFrom = undefined;
            render();
          }),
        ])
      : null;
    if (!list.length)
      return el("div", {}, [
        filterBar,
        el("p", { class: "olw-empty", text: from ? `No texts from ${npcName(from)} yet. Go say hi in person!` : "No texts yet. Sleep, travel, talk — they'll find you." }),
      ]);
    const ul = el("ul", { class: "olw-msgs" });
    for (const m of list.slice(0, 30)) {
      const row = button(md, "", `olw-msg ${m.read ? "" : "olw-msg--unread"}`, () => {
        markRead(m.id);
        if (m.questId) activateFromMessage(m.questId);
        render();
      });
      row.append(
        el("span", { class: "olw-msg-from" }, [npcName(m.sender), el("span", { class: "olw-msg-day", text: ` · day ${m.day}` })]),
        el("span", { class: "olw-msg-body", text: m.body }),
      );
      ul.append(el("li", {}, [row]));
    }
    return filterBar ? el("div", {}, [filterBar, ul]) : ul;
  };

  const questList = () => {
    const wrap = el("div", { class: "olw-phone-quests" });
    const replay = store.questReplay;
    if (replay) {
      const title = QUESTS.find((q) => q.id === replay.questId)?.title ?? replay.questId;
      wrap.append(el("p", { class: "olw-quest-replay", text: `Replay mode · ${title}. Nothing here changes your real save.` }));
    }
    const active = QUESTS.filter((q) => statusOf(q.id) === "active");
    const available = QUESTS.filter((q) => statusOf(q.id) === "available");
    const done = QUESTS.filter((q) => statusOf(q.id) === "done");
    // ready-to-start stories first, locked ones after
    available.sort((a, b) => Number(canStartQuest(b.id)) - Number(canStartQuest(a.id)));

    const section = (title: string, count: number) => wrap.append(el("h3", { class: "olw-quest-head", text: `${title}  ${count}` }));
    const card = (cls: string, title: string, line: string, action?: HTMLElement | null) =>
      el("li", { class: `olw-quest ${cls}` }, [
        el("span", { class: "olw-quest-title", text: title }),
        el("span", { class: "olw-quest-line", text: line }),
        action ?? null,
      ]);

    section("Active", active.length);
    if (!active.length) wrap.append(el("p", { class: "olw-empty", text: "No active quests. Start one below, or talk to people." }));
    else {
      const ul = el("ul", { class: "olw-quest-list" });
      for (const q of active) {
        const p = store.state.quests[q.id];
        const step = p ? q.steps[p.step] : undefined;
        let hint = step?.hint ?? "Ready";
        if (step?.type === "collect" && step.count) hint = `${hint} (${p?.progress ?? 0}/${step.count})`;
        const n = p ? Math.min(p.step + 1, q.steps.length) : 1;
        // story steps that play from the phone (legacy: Phone › Quests launched Retrieve Tigor)
        const story = storyRequestForStep(step?.target);
        const play =
          story && PHONE_STORIES.has(story.scene)
            ? button(md, "Play", "olw-btn olw-btn--rose olw-quest-btn", () => {
                close();
                uiEvents.emit("storyScene", story);
              })
            : null;
        ul.append(card("olw-quest--active", q.title, `Step ${n}/${q.steps.length} · ${hint}`, play));
      }
      wrap.append(ul);
    }

    section("Available", available.length);
    if (!available.length) wrap.append(el("p", { class: "olw-empty", text: "Nothing new right now." }));
    else {
      const ul = el("ul", { class: "olw-quest-list" });
      for (const q of available) {
        const ready = canStartQuest(q.id);
        const start = button(md, ready ? "Start" : "Locked", ready ? "olw-btn olw-btn--rose olw-quest-btn" : "olw-btn olw-btn--ghost olw-quest-btn", () => {
          // startQuest enforces the two-active-quests cap
          if (!startQuest(q.id)) store.toast("Finish an active quest first", "#ffe08a");
          render();
        });
        start.disabled = !ready;
        ul.append(card(ready ? "olw-quest--ready" : "olw-quest--locked", q.title, ready ? q.intro : prerequisiteHint(q), start));
      }
      wrap.append(ul);
    }

    section("Completed", done.length);
    if (!done.length) wrap.append(el("p", { class: "olw-empty", text: "Your finished stories will live here." }));
    else {
      const ul = el("ul", { class: "olw-quest-list" });
      for (const q of done) ul.append(card("olw-quest--done", q.title, q.complete));
      wrap.append(ul);
    }
    return wrap;
  };

  const bag = () => {
    const ids = Object.keys(store.state.inventory).filter((id) => store.state.inventory[id] > 0);
    if (!ids.length) return el("p", { class: "olw-empty", text: "Your bag is empty. Flowers, coffee, little treasures — they'll land here." });
    const ul = el("ul", { class: "olw-bag" });
    for (const id of ids) {
      const def = ITEMS[id];
      ul.append(
        el("li", { class: "olw-bag-item" }, [
          el("span", { class: "olw-bag-name", text: `${def?.name ?? id} ×${store.state.inventory[id]}` }),
          def?.desc ? el("span", { class: "olw-bag-desc", text: def.desc }) : null,
        ]),
      );
    }
    return ul;
  };

  // Homes: owned properties; the chosen one is where Juju lives (primary +
  // active home, HouseScene / systems/properties.setPrimaryHome)
  const homes = () => {
    const owned = PROPERTIES.filter((p) => store.state.properties[p.id]?.owned);
    if (!owned.length) {
      const quest = QUESTS.find((q) => q.id === "q_first_property");
      return el("div", { class: "olw-homes-empty" }, [
        el("p", { class: "olw-empty", text: "You don't own a home yet." }),
        button(md, quest ? `Estate agent: ${quest.title}` : "See quests", "olw-btn olw-btn--ghost olw-btn--small", () => {
          lastTab = "quests";
          render();
        }),
      ]);
    }
    const ul = el("ul", { class: "olw-homes" });
    for (const p of owned) {
      const home = store.state.primaryHomeId === p.id;
      const set = home
        ? el("span", { class: "olw-home-badge", text: "Home ♡" })
        : button(md, "Live here", "olw-btn olw-btn--rose olw-btn--small olw-home-btn", () => {
            if (setPrimaryHome(p.id)) store.toast(`${p.name} is home now`, "#f4a6c0");
            render();
          });
      ul.append(
        el("li", { class: `olw-home${home ? " olw-home--on" : ""}` }, [
          el("span", { class: "olw-home-text" }, [
            el("span", { class: "olw-home-name", text: p.name }),
            el("span", { class: "olw-home-meta", text: `${p.location} · ${p.type} · ${p.bedrooms} bed` }),
          ]),
          set,
        ]),
      );
    }
    return el("div", {}, [el("p", { class: "olw-home-hint", text: "Your home is where you wake up and where the front door leads." }), ul]);
  };

  const memories = () => {
    const wrap = el("div", { class: "olw-memories" });
    for (const city of CITIES) {
      const group = MEMORIES.filter((m) => m.cityId === city.id);
      if (!group.length) continue;
      const have = group.filter((m) => store.hasMemory(m.id)).length;
      wrap.append(el("h3", { class: "olw-mem-city", text: `${city.name}  ${have}/${group.length}` }));
      const ul = el("ul", { class: "olw-mem-list" });
      for (const mem of group) {
        const on = store.hasMemory(mem.id);
        ul.append(
          el("li", { class: on ? "olw-mem olw-mem--on" : "olw-mem" }, [
            el("span", { class: "olw-mem-title", text: `${on ? "♡" : "·"} ${on ? mem.title : "???"}` }),
            on ? el("span", { class: "olw-mem-desc", text: mem.description }) : null,
          ]),
        );
      }
      wrap.append(ul);
    }
    return wrap;
  };

  // world map: grouped places with lock state; "Travel here" closes the phone
  // and hands off to the fade -> loadLocation -> fade-in sequence
  const map = () =>
    el("div", { class: "olw-phone-map" }, [
      button(md, "Open district map", "olw-btn olw-btn--ghost olw-btn--small", () => {
        close();
        uiEvents.emit("openLocalMap");
      }),
      worldMapView(md, (id) => {
        close();
        travel(id);
      }),
    ]);

  const nav: PhoneNav = {
    render: () => render(),
    messageContact: (npcId) => {
      textsFrom = npcId;
      lastTab = "messages";
      render();
    },
  };

  let tabD: Disposer | null = null;
  const render = () => {
    for (const [id, b] of tabBtns) {
      b.classList.toggle("olw-tab--on", id === lastTab);
      b.setAttribute("aria-selected", `${id === lastTab}`);
    }
    // the wardrobe listens to store events: scope them to the tab being shown
    tabD?.dispose();
    tabD = md.child();
    const scoped = tabD;
    const views: Record<Tab, () => Node> = {
      messages,
      quests: questList,
      camera: () => cameraView(scoped, nav, () => {
        lastTab = "album";
        render();
      }),
      album: () => albumView(scoped, nav),
      stats: statsView,
      contacts: () => contactsView(scoped, nav),
      notes: () => notesView(scoped, nav),
      bag,
      wardrobe: () => wardrobeView(scoped),
      homes,
      memories,
      map,
    };
    const view = views[lastTab]();
    pane.replaceChildren(view);
  };

  resetPhoneTabs();
  textsFrom = undefined;
  for (const t of TABS) {
    const b = button(md, t.label, "olw-tab", () => {
      if (t.id === "messages" && lastTab === "messages") textsFrom = undefined;
      lastTab = t.id;
      render();
    });
    b.setAttribute("role", "tab");
    tabBtns.set(t.id, b);
    tabs.append(b);
  }
  render();
  md.on(store, "message", () => {
    if (lastTab === "messages") render();
  });
  md.on(store, "questUpdated", () => {
    if (lastTab === "quests") render();
  });
  md.on(store, "inventory", () => {
    if (lastTab === "bag") render();
  });
  md.on(store, "relationship", () => {
    if (lastTab === "contacts" || lastTab === "stats") render();
  });
  return el("div", { class: "olw-phone" }, [el("p", { class: "olw-phone-clock", text: store.clockLabel() }), tabs, pane]);
}
