// October 11 — Moomoo & Juju's anniversary. A rose-gold welcome after the
// title, a bouquet from Moomoo, the "Anniversary Celebration" quest (visit 3
// of our special places), and a fireworks love letter when Juju rests for the
// night. Mounted only when isAnniversary() (see ui/index.ts).
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import {
  ANNIVERSARY_NIGHT_MESSAGE,
  ANNIVERSARY_QUEST_GOAL,
  SPECIAL_PLACES,
  anniversaryYear,
  isAnniversary,
  loadAnniversaryProgress,
  saveAnniversaryProgress,
  specialPlace,
} from "../../game/data/anniversary";
import { button, el, icon, prefersReducedMotion } from "./dom";
import type { UIContext } from "./context";

const PETALS = 18;

function floatingHearts(count: number): HTMLElement {
  const sky = el("div", { class: "olw-anniv-sky", attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < count; i++) {
    const p = el("span", { class: i % 3 === 0 ? "olw-anniv-petal olw-anniv-petal--heart" : "olw-anniv-petal" });
    p.style.left = `${(i * 53 + 5) % 98}%`;
    p.style.animationDelay = `${-((i * 0.9) % 7).toFixed(1)}s`;
    p.style.animationDuration = `${6 + (i % 5)}s`;
    if (i % 3 === 0) p.append(icon("heart"));
    sky.append(p);
  }
  return sky;
}

export function mountAnniversary(ctx: UIContext) {
  const { d } = ctx;
  if (!isAnniversary()) return;
  const progress = loadAnniversaryProgress();
  const year = anniversaryYear();
  let nightShown = false;

  /** A full-screen rose-gold card; resolves via `onClose`. */
  const showCard = (opts: { cls?: string; content: Node[]; cta: string; onClose: () => void }) => {
    const md = d.child();
    ctx.lock();
    uiEvents.emit("prompt", null);
    const cta = button(md, opts.cta, "olw-btn olw-anniv-cta", () => close());
    const card = el("div", { class: "olw-anniv-card" }, [...opts.content, cta]);
    const root = md.node(
      el("div", { class: `olw-anniv ${opts.cls ?? ""}`, attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Happy Anniversary" } }, [
        floatingHearts(PETALS),
        card,
      ]),
    );
    ctx.layer.append(root);
    requestAnimationFrame(() => root.classList.add("olw-anniv--on"));
    cta.focus({ preventScroll: true });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      root.classList.remove("olw-anniv--on");
      md.timeout(
        () => {
          md.dispose();
          ctx.unlockIfIdle();
          opts.onClose();
        },
        prefersReducedMotion() ? 0 : 500,
      );
    };
    md.listen(window, "keydown", (e) => {
      if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    }, { capture: true });
  };

  const placesList = () =>
    el(
      "ul",
      { class: "olw-anniv-places" },
      SPECIAL_PLACES.map((p) =>
        el("li", { class: progress.visited.includes(p.id) ? "olw-anniv-place olw-anniv-place--done" : "olw-anniv-place" }, [
          el("span", { class: "olw-anniv-star", text: progress.visited.includes(p.id) ? "★" : "☆" }),
          el("span", { text: p.name }),
        ]),
      ),
    );

  const bouquet = () => {
    store.toast("Today is a special day ✨", "#f4c95d");
    if (!progress.greeted) {
      progress.greeted = true;
      saveAnniversaryProgress(progress);
      store.addHearts(5);
    }
    d.timeout(() => {
      uiEvents.emit("dialogue", "Moomoo", [
        "Juju… close your eyes for a second. 🌹",
        "Okay, open them. A bouquet — roses, peonies, and one sunflower because you're my sunshine.",
        `Happy anniversary, my love. Year ${year} of us, and I'd choose you again every single day.`,
        `New quest: Anniversary Celebration — visit ${ANNIVERSARY_QUEST_GOAL} of our special places (look for the gold stars ★ on the map).`,
      ]);
      store.toast("Quest unlocked: Anniversary Celebration", "#ff8fae");
    }, 400);
  };

  // ---- B. opening sequence, right after the title ----
  d.on(uiEvents, "startGame", () => {
    d.timeout(() => {
      const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" });
      showCard({
        content: [
          el("div", { class: "olw-anniv-heart" }, [icon("heart")]),
          el("p", { class: "olw-anniv-kicker", text: `Year ${year} — ${date}` }),
          el("h1", { class: "olw-anniv-title", text: "Happy Anniversary, Jasmin 💕" }),
          el("p", { class: "olw-anniv-sub", text: "One more year of our little world together" }),
          el("p", { class: "olw-anniv-small", text: "Our special places are glowing gold today:" }),
          placesList(),
        ],
        cta: "Let's celebrate 🎉",
        onClose: bouquet,
      });
    }, 450);
  });

  // ---- D/E. quest: arrive at a special place ----
  d.on(uiEvents, "anniversaryArrived", (id: string) => {
    const place = specialPlace(id);
    if (!place) return;
    if (progress.visited.includes(id)) {
      store.toast(`★ ${place.name} — one of our special places`, "#f4c95d");
      return;
    }
    progress.visited.push(id);
    saveAnniversaryProgress(progress);
    const n = progress.visited.length;
    store.toast(`★ Special place ${Math.min(n, ANNIVERSARY_QUEST_GOAL)}/${ANNIVERSARY_QUEST_GOAL}: ${place.name}`, "#f4c95d");
    const lines = [place.memory];
    if (n === ANNIVERSARY_QUEST_GOAL) {
      store.addHearts(10);
      store.addCoins(100);
      lines.push("Anniversary Celebration complete ♡ Three places, a thousand memories, and many more still to make.");
      d.timeout(() => store.toast("Quest complete: Anniversary Celebration", "#ff5c8a"), 600);
    }
    d.timeout(() => uiEvents.emit("dialogue", "Our Special Place", lines), 900);
  });

  // ---- F. resting for the night: fireworks + a letter from Moomoo ----
  d.on(store, "newDay", () => {
    if (nightShown || !ctx.started) return;
    nightShown = true;
    d.timeout(() => {
      uiEvents.emit("anniversaryFireworks");
      const burst = el("div", { class: "olw-anniv-fireworks", attrs: { "aria-hidden": "true" } });
      for (let i = 0; i < 6; i++) {
        const f = el("span", { class: "olw-anniv-firework" });
        f.style.left = `${12 + ((i * 29) % 76)}%`;
        f.style.top = `${10 + ((i * 17) % 40)}%`;
        f.style.animationDelay = `${(i * 0.45).toFixed(2)}s`;
        burst.append(f);
      }
      showCard({
        cls: "olw-anniv--night",
        content: [
          burst,
          el("div", { class: "olw-anniv-heart" }, [icon("heart")]),
          el("p", { class: "olw-anniv-kicker", text: "A letter, left on your pillow" }),
          el("p", { class: "olw-anniv-letter", text: ANNIVERSARY_NIGHT_MESSAGE }),
        ],
        cta: "I love you too 💕",
        onClose: () => store.toast("Happy Anniversary, Juju 🌹", "#ff8fae"),
      });
    }, prefersReducedMotion() ? 200 : 2200);
  });
}
