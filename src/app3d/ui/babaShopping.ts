// Baba's Shopping Nightmare — DOM port of src/game/scenes/BabaShoppingScene.ts.
//
// The Phaser scene is a scrolling runner through BABA_SHOPPING_STORES; this
// modal keeps its rules and data but plays as a four-phase shopping trip:
//   1. The list      — Baba's route: every store in BABA_SHOPPING_STORES is a
//                      mandatory stop (one purchase each), grouped by floor.
//   2. The floor     — stops unlock in order (the scene's store gates). Each
//                      product adds its own `stress`; return visits to a pricey
//                      store, pedestrian collisions and dawdling add more.
//                      The Baba checkpoint after floor 3 is a receipt battle at
//                      >= 50 stress, otherwise "...that's it?". Moomoo's Bag
//                      Rescue (ultimate meter) halves the damage afterwards.
//   3. Checkout      — basket vs list, score, rewards (the product rewards via
//                      the same rewardType rules as persistShoppingResults,
//                      plus hearts / Baba relationship by performance).
//   4. Ultimate      — every stop stamped with stress at or under the lowest
//                      possible route total unlocks the "Ultimate Shopper" title.
import { store } from "../../game/systems/store";
import { uiEvents } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import {
  BABA_LINES,
  BABA_SHOPPING_STORES,
  COLLISION_LINES,
  JUJU_LINES,
  type ShoppingMallId,
  type ShoppingProductDef,
  type ShoppingStoreDef,
} from "../../game/data/babaShopping";
import { mallById } from "../../game/data/malls";
import { button, el, type Disposer } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";

// ---- rules lifted from BabaShoppingScene -----------------------------------
const START_STRESS = 4;
/** Scene: CHECKPOINT_Y = 11390 — every store above it must be stamped first. */
const CHECKPOINT_Y = 11390;
const CHECKPOINT_STRESS = 50;
const ULTIMATE_PER_PURCHASE = 16;
const ULTIMATE_PER_FLIRT = 8;
const ULTIMATE_CHECKPOINT = 40;
const BOSS_DEFENSE = 54;
/** Lowest total a run can finish on without Moomoo: start + cheapest product per store. */
export const ULTIMATE_SHOPPER_MAX = Math.min(
  100,
  START_STRESS + BABA_SHOPPING_STORES.reduce((sum, s) => sum + Math.min(...s.products.map((p) => p.stress)), 0),
);
export const ULTIMATE_SHOPPER_FLAG = "title_ultimate_shopper";

const FLOOR_NAMES: Record<number, string> = {
  1: "LEVEL 1 · THE SENSIBLE BEGINNING",
  2: "LEVEL 2 · RECEIPTS GET SERIOUS",
  3: "LEVEL 3 · BAG CHAOS",
  4: "LEVEL 4 · FINAL SPRINT",
};
const FLOOR_ACTS: Record<number, [string, string]> = {
  1: ["ACT 1 · NORMAL SHOPPING", "This seems manageable."],
  2: ["ACT 2 · BAG CHAOS", "It is no longer manageable."],
  3: ["ACT 3 · BABA", "The bank notifications have arrived."],
  4: ["ACT 4 · MOOMOO", "MOCK LIGHT SPEED awaits."],
};

const FLIRT_CHOICES = [
  { id: "kiss", label: "Kiss him", description: "One kiss. Three hearts. Shopping resumes.", icon: "♥" },
  { id: "tease", label: "Tease him", description: "Ask whether he volunteered to carry everything.", icon: "✦" },
  { id: "pull", label: "Pull him closer", description: "The bags politely look away.", icon: "♡" },
];
const FLIRT_LINES: Record<string, string> = {
  kiss: "Moomoo brushes her hair back and kisses her. The entire mall politely waits.",
  tease: "Moomoo: That was a deeply unfair negotiating tactic.",
  pull: "Juju pulls him closer. Moomoo forgets the original question completely.",
};

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const stopIndex = (def: ShoppingStoreDef) => BABA_SHOPPING_STORES.indexOf(def) + 1;
const cheapest = (def: ShoppingStoreDef) => Math.min(...def.products.map((p) => p.stress));

type Phase = "list" | "floor" | "battle" | "checkout";
type Tone = "baba" | "juju" | "moomoo" | "info" | "good";

interface Run {
  mallId: ShoppingMallId;
  replay: boolean;
  phase: Phase;
  stress: number;
  ultimate: number;
  purchases: { store: ShoppingStoreDef; product: ShoppingProductDef }[];
  visits: Map<string, number>;
  openStore: string | null;
  viewFloor: number;
  collisions: number;
  flirty: number;
  pendingFlirt: "first" | "lingerie" | null;
  firstFlirtShown: boolean;
  lingerieFlirtShown: boolean;
  checkpoint: "none" | "won" | "avoided";
  rescue: boolean;
  startedAt: number;
  lastTimeStress: number;
  feed: { who: string; text: string; tone: Tone }[];
  actsShown: Set<number>;
  // battle
  bossDefense: number;
  bossPhase: number;
  shieldUntil: number;
  receipts: number;
  lastThrow: number;
  lane: number;
  attack: { lane: number; label: string; at: number } | null;
  nextAttack: number;
  finished: boolean;
}

function newRun(mallId: ShoppingMallId, replay: boolean): Run {
  const now = performance.now();
  return {
    mallId,
    replay,
    phase: "list",
    stress: START_STRESS,
    ultimate: 0,
    purchases: [],
    visits: new Map(),
    openStore: null,
    viewFloor: 1,
    collisions: 0,
    flirty: 0,
    pendingFlirt: null,
    firstFlirtShown: false,
    lingerieFlirtShown: false,
    checkpoint: "none",
    rescue: false,
    startedAt: now,
    lastTimeStress: now,
    feed: [],
    actsShown: new Set(),
    bossDefense: BOSS_DEFENSE,
    bossPhase: 1,
    shieldUntil: 0,
    receipts: 0,
    lastThrow: 0,
    lane: 1,
    attack: null,
    nextAttack: 0,
    finished: false,
  };
}

export function mountBabaShopping(ctx: UIContext, host: ModalHost) {
  const { d } = ctx;

  const open = (opts: { mallId?: string; replay?: boolean } = {}) => {
    if (ctx.dialogueOpen) return false;
    const mallId = (mallById(opts.mallId ?? "")?.id ?? "dubai_mall") as ShoppingMallId;
    const replay = opts.replay ?? quests.statusOf("q_baba_spree") === "done";
    const run = newRun(mallId, replay);
    host.open({
      kind: "babaShopping",
      title: "Baba's Shopping Nightmare",
      subtitle: `${mallById(mallId)?.title ?? "The mall"} · one card · ${BABA_SHOPPING_STORES.length} mandatory stores · no financial peace`,
      className: "olw-baba-modal",
      dismissable: false,
      body: (md, close) => shoppingBody(md, close, run),
    });
    return true;
  };

  d.on(uiEvents, "enterBabaShopping", (opts?: { mallId?: string; replay?: boolean }) => {
    if (ctx.anyModal() && ctx.modal !== "mall") return;
    open(opts ?? {});
  });

  return { open };
}

// ---------------------------------------------------------------------------
function shoppingBody(md: Disposer, close: () => void, run: Run): Node {
  const root = el("div", { class: "olw-baba" });
  const hud = el("div", { class: "olw-baba-hud" });
  const main = el("div", { class: "olw-baba-main" });
  const feed = el("ul", { class: "olw-baba-feed", attrs: { "aria-live": "polite" } });
  root.append(hud, main, feed);

  const say = (who: string, text: string, tone: Tone = "baba") => {
    run.feed.push({ who, text, tone });
    if (run.feed.length > 5) run.feed.shift();
    renderFeed();
  };

  const addStress = (amount: number, line?: string) => {
    const before = run.stress;
    run.stress = Math.max(0, Math.min(100, run.stress + amount));
    if (run.stress > before) {
      root.classList.remove("olw-baba--flash");
      void root.offsetWidth;
      root.classList.add("olw-baba--flash");
      if (line) say("Baba", line);
      else if ((before < 25 && run.stress >= 25) || (before < 50 && run.stress >= 50) || (before < 75 && run.stress >= 75)) {
        say("Baba", run.stress >= 75 ? "JUJU WHAT DID YOU BUY" : run.stress >= 50 ? "Baba is watching the bank notifications." : "How many bags is that?");
      }
    }
    renderHud();
  };

  const addUltimate = (amount: number) => {
    const before = run.ultimate;
    run.ultimate = Math.min(100, run.ultimate + amount);
    if (before < 100 && run.ultimate >= 100 && ultimateAllowed()) say("Moomoo", "ULTIMATE READY · Moomoo is on his way to carry the bags.", "moomoo");
    renderHud();
  };

  const ultimateAllowed = () => run.checkpoint !== "none" || run.phase === "battle";
  const ultimateReady = () => run.ultimate >= 100 && !run.rescue && ultimateAllowed();
  const nextStore = () => BABA_SHOPPING_STORES.find((s) => !run.purchases.some((p) => p.store.id === s.id));
  const beforeCheckpoint = BABA_SHOPPING_STORES.filter((s) => s.y < CHECKPOINT_Y);
  const checkpointDue = () => run.checkpoint === "none" && beforeCheckpoint.every((s) => run.purchases.some((p) => p.store.id === s.id));
  const elapsed = () => Math.max(0, Math.round((performance.now() - run.startedAt) / 1000));

  // ---- HUD ----------------------------------------------------------------
  const renderHud = () => {
    const stress = Math.round(run.stress);
    const tier = stress >= 75 ? "red" : stress >= 50 ? "amber" : stress >= 25 ? "gold" : "calm";
    const meter = (label: string, value: number, cls: string, text: string) =>
      el("div", { class: `olw-baba-meter ${cls}` }, [
        el("span", { class: "olw-baba-meter-label", text: label }),
        el("span", { class: "olw-baba-meter-track", attrs: { role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(value), "aria-label": label } }, [
          el("span", { class: "olw-baba-meter-fill", style: { width: `${value}%` } }),
        ]),
        el("span", { class: "olw-baba-meter-val", text }),
      ]);
    const children: Node[] = [
      meter("Baba stress", stress, `olw-baba-meter--stress olw-baba-meter--${tier}`, `${stress}%`),
      meter("Card patience", 100 - stress, "olw-baba-meter--budget", `${100 - stress} left`),
      meter(run.rescue ? "Moomoo rescue" : "Ultimate", run.ultimate, `olw-baba-meter--ult${run.rescue ? " olw-baba-meter--on" : ""}`, run.rescue ? "ACTIVE" : `${Math.round(run.ultimate)}%`),
      el("div", { class: "olw-baba-stats" }, [
        el("span", { text: `🛍 ${run.purchases.length}/${BABA_SHOPPING_STORES.length} stamps` }),
        el("span", { text: `⏱ ${fmtTime(elapsed())}` }),
        run.collisions ? el("span", { text: `💥 ${run.collisions}` }) : null,
      ]),
    ];
    if (ultimateReady() && run.phase !== "checkout") {
      children.push(button(md, "Summon Moomoo · Bag Rescue", "olw-btn olw-btn--rose olw-btn--small olw-baba-ult-btn", activateRescue));
    }
    hud.replaceChildren(...children);
  };

  const renderFeed = () => {
    feed.replaceChildren(
      ...run.feed.map((f) => el("li", { class: `olw-baba-line olw-baba-line--${f.tone}` }, [el("b", { text: `${f.who}: ` }), f.text])),
    );
    feed.hidden = run.feed.length === 0;
  };

  const activateRescue = () => {
    if (!ultimateReady()) return;
    run.rescue = true;
    store.incrementStat("shopping_ultimate_uses");
    say("Moomoo", "MOOMOO BAG RESCUE · every bag transfer initiated. WHY ARE THERE SO MANY", "moomoo");
    say("Juju", "MOCK LIGHT SPEED. Remaining receipts only hurt half as much.", "juju");
    render();
  };

  // ---- phase 1: the list --------------------------------------------------
  const renderList = () => {
    const floors = [1, 2, 3, 4].map((floor) =>
      el("section", { class: "olw-baba-listfloor" }, [
        el("h3", { class: "olw-baba-h3", text: FLOOR_NAMES[floor] }),
        el(
          "ol",
          { class: "olw-baba-list", attrs: { start: String(stopIndex(BABA_SHOPPING_STORES.find((s) => s.floor === floor)!)) } },
          BABA_SHOPPING_STORES.filter((s) => s.floor === floor).map((s) =>
            el("li", { class: "olw-baba-listitem" }, [
              el("span", { class: "olw-baba-bag", text: s.bagLabel, style: { background: hex(s.color), color: hex(s.accent) } }),
              el("span", {}, [el("b", { text: s.name }), el("small", { text: ` — ${s.subtitle}${s.bonus ? " · bonus floor" : ""}` })]),
            ]),
          ),
        ),
      ]),
    );
    return el("div", { class: "olw-baba-phase" }, [
      el("p", { class: "olw-baba-kicker", text: "PHASE 1 · BABA'S LIST" }),
      el("div", { class: "olw-baba-quote" }, [
        el("p", { text: "Baba: One store, Juju. One." }),
        el("p", { text: "Juju: Of course, Baba." }),
        el("p", { text: run.replay ? "The staff recognize her. This is not reassuring." : "Every store stamps the route. No purchase means the next corridor stays closed." }),
        el("p", { text: `${BABA_SHOPPING_STORES.length} stops. Four floors. Baba is already checking the card.` }),
      ]),
      ...floors,
      el("p", {
        class: "olw-baba-note",
        text: `Every product adds its own Baba stress. Reach the checkpoint at ${CHECKPOINT_STRESS}%+ and it becomes a receipt battle. Finish at ${ULTIMATE_SHOPPER_MAX}% or less for the Ultimate Shopper title.`,
      }),
      el("div", { class: "olw-modal-actions" }, [
        button(md, "Not today", "olw-btn olw-btn--ghost", close),
        button(md, "Take the card · start shopping", "olw-btn olw-btn--rose", () => {
          run.phase = "floor";
          run.startedAt = performance.now();
          run.lastTimeStress = run.startedAt;
          say("Baba", "BABA STRESS has entered the mall.");
          render();
        }),
      ]),
    ]);
  };

  // ---- phase 2: the shopping floor ---------------------------------------
  const purchase = (def: ShoppingStoreDef, product: ShoppingProductDef) => {
    if (run.purchases.some((p) => p.store.id === def.id)) return;
    run.purchases.push({ store: def, product });
    run.openStore = null;
    const amount = run.rescue ? Math.ceil(product.stress / 2) : product.stress;
    say(def.name, `CHA-CHING · ${product.name} ✓ · bag ${run.purchases.length}/${BABA_SHOPPING_STORES.length}`, "info");
    if (def.id === "cartier") addStress(amount, "Somewhere in the mall, Baba felt a disturbance in the Force.");
    else addStress(amount);
    // Baba's verdict: the cheapest product in a store is the "suspiciously sensible" pick
    if (product.stress === cheapest(def)) say("Baba", "...that's it? Genuinely practical. Suspicious.", "good");
    else if (def.id !== "cartier") say("Baba", BABA_LINES[(run.purchases.length + Math.round(run.stress)) % BABA_LINES.length]);
    say("Juju", JUJU_LINES[run.purchases.length % JUJU_LINES.length], "juju");
    addUltimate(ULTIMATE_PER_PURCHASE);

    // walking to the next storefront: the promenade traffic (scene hazards)
    const next = nextStore();
    if (next && !run.rescue && (run.purchases.length * 7 + run.collisions * 3) % 4 === 1) {
      run.collisions += 1;
      addStress(2);
      say("Juju", COLLISION_LINES[run.collisions % COLLISION_LINES.length], "juju");
    }
    if (def.flirtOnPurchase && !run.lingerieFlirtShown) {
      run.lingerieFlirtShown = true;
      run.pendingFlirt = "lingerie";
    } else if (!run.firstFlirtShown && run.purchases.length >= 3 && next && next.floor >= 2) {
      run.firstFlirtShown = true;
      run.pendingFlirt = "first";
    }
    if (next) run.viewFloor = next.floor;
    render();
  };

  const leaveStore = (def: ShoppingStoreDef) => {
    run.openStore = null;
    say("Juju", `Keep browsing… ${def.name} will still be there.`, "juju");
    render();
  };

  const enterStore = (def: ShoppingStoreDef) => {
    const visits = (run.visits.get(def.id) ?? 0) + 1;
    run.visits.set(def.id, visits);
    if (visits > 1 && (def.id === "cartier" || def.products.some((p) => p.stress >= 12))) addStress(1, "Baba noticed the return visit.");
    run.openStore = def.id;
    render();
  };

  const renderStoreInside = (def: ShoppingStoreDef) =>
    el("div", { class: "olw-baba-store-inside", style: { borderColor: hex(def.color) } }, [
      el("p", { class: "olw-baba-kicker", text: `FLOOR ${def.floor} · ${def.side.toUpperCase()} STOREFRONT` }),
      el("p", { class: "olw-baba-store-prompt", text: `${def.subtitle}. Choose one. Baba receives the notification immediately.` }),
      el(
        "ul",
        { class: "olw-baba-products" },
        def.products.map((p) => {
          const cost = run.rescue ? Math.ceil(p.stress / 2) : p.stress;
          const b = button(md, "", "olw-baba-product", () => purchase(def, p));
          b.append(
            el("span", { class: "olw-baba-product-icon", text: p.icon, style: { background: hex(def.accent), color: hex(def.color) } }),
            el("span", { class: "olw-baba-product-text" }, [el("b", { text: p.name }), el("small", { text: p.description })]),
            el("span", { class: `olw-baba-badge${cost >= 12 ? " olw-baba-badge--hot" : ""}`, text: `STRESS +${cost}` }),
          );
          return el("li", {}, [b]);
        }),
      ),
      el("div", { class: "olw-modal-actions" }, [button(md, "Keep browsing", "olw-btn olw-btn--ghost olw-btn--small", () => leaveStore(def))]),
    ]);

  const renderFlirt = () => {
    const kind = run.pendingFlirt!;
    return el("div", { class: "olw-baba-phase olw-baba-flirt" }, [
      el("p", { class: "olw-baba-kicker", text: kind === "lingerie" ? "SOFT SECRETS · MOOMOO HAS ARRIVED" : "ESCALATOR LANDING · TINY ROMANCE DELAY" }),
      el("h3", { class: "olw-baba-h3", text: kind === "lingerie" ? "Extremely Supportive Shopping" : "Moomoo Distraction" }),
      el("p", {
        text: kind === "lingerie" ? "Moomoo has suddenly become extremely supportive of shopping." : "Moomoo catches up, kisses Juju, and looks at the growing bag situation.",
      }),
      el(
        "div",
        { class: "olw-baba-choices" },
        FLIRT_CHOICES.map((c) => {
          const b = button(md, "", "olw-baba-product", () => {
            run.flirty += 1;
            run.pendingFlirt = null;
            say("Moomoo", FLIRT_LINES[c.id], "moomoo");
            addUltimate(ULTIMATE_PER_FLIRT);
            render();
          });
          b.append(el("span", { class: "olw-baba-product-icon", text: c.icon }), el("span", { class: "olw-baba-product-text" }, [el("b", { text: c.label }), el("small", { text: c.description })]));
          return b;
        }),
      ),
      el("div", { class: "olw-modal-actions" }, [
        button(md, "Behave (impossible)", "olw-btn olw-btn--ghost olw-btn--small", () => {
          run.pendingFlirt = null;
          render();
        }),
      ]),
    ]);
  };

  const renderCheckpoint = () => {
    const battle = run.stress >= CHECKPOINT_STRESS;
    return el("div", { class: "olw-baba-phase olw-baba-checkpoint" }, [
      el("p", { class: "olw-baba-kicker", text: "BABA CHECKPOINT" }),
      el("h3", { class: "olw-baba-h3", text: battle ? "BABA RECEIPT BATTLE" : "Baba is waiting at the escalator" }),
      el("p", {
        text: battle
          ? `${run.purchases.length} receipts · Baba stress ${Math.round(run.stress)}%. ${run.purchases.some((p) => p.store.id === "cartier") ? "Baba: CARTIER??" : "Baba: YOU SAID ONE STORE."}`
          : "Baba: ...that's it?",
      }),
      el("div", { class: "olw-modal-actions" }, [
        battle
          ? button(md, "SHOW ME THE RECEIPTS", "olw-btn olw-btn--rose", startBattle)
          : button(md, "Juju: Do you want me to go back?", "olw-btn olw-btn--rose", () => {
              run.checkpoint = "avoided";
              say("Baba", "KEEP WALKING.");
              say("Juju", "BABA BATTLE AVOIDED · suspiciously sensible", "good");
              addUltimate(ULTIMATE_CHECKPOINT);
              render();
            }),
      ]),
    ]);
  };

  const renderFloor = () => {
    if (run.pendingFlirt) return renderFlirt();
    const next = nextStore();
    if (checkpointDue()) return renderCheckpoint();
    const floorNow = next?.floor ?? 4;
    if (!run.actsShown.has(floorNow)) {
      run.actsShown.add(floorNow);
      const [t, s] = FLOOR_ACTS[floorNow];
      say(t, s, "info");
    }
    const tabs = el(
      "div",
      { class: "olw-baba-tabs", attrs: { role: "tablist" } },
      [1, 2, 3, 4].map((f) => {
        const b = button(md, `Floor ${f}`, `olw-baba-tab${run.viewFloor === f ? " olw-baba-tab--on" : ""}`, () => {
          run.viewFloor = f;
          render();
        });
        b.disabled = f > floorNow;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(run.viewFloor === f));
        return b;
      }),
    );
    const stores = BABA_SHOPPING_STORES.filter((s) => s.floor === run.viewFloor).map((s) => {
      const bought = run.purchases.find((p) => p.store.id === s.id);
      const isNext = next?.id === s.id;
      const state = bought ? "done" : isNext ? "next" : "locked";
      const card = el("li", { class: `olw-baba-stop olw-baba-stop--${state}`, style: { borderColor: hex(s.color) } }, [
        el("div", { class: "olw-baba-stop-head", style: { background: hex(s.color) } }, [
          el("span", { class: "olw-baba-stop-num", text: `STOP ${stopIndex(s)}/${BABA_SHOPPING_STORES.length}` }),
          el("span", { class: "olw-baba-stop-name", text: s.name }),
          el("span", { class: "olw-baba-stop-mark", text: bought ? "✓" : isNext ? "▼" : "🔒" }),
        ]),
        el("div", { class: "olw-baba-stop-body" }, [
          el("small", { text: bought ? `${bought.product.icon} ${bought.product.name}` : s.subtitle }),
          isNext && run.openStore !== s.id ? button(md, `Enter ${s.name}`, "olw-btn olw-btn--gold olw-btn--small", () => enterStore(s)) : null,
          !bought && !isNext ? el("small", { class: "olw-baba-gate", text: "STOP REQUIRED · corridor closed until the previous store stamps the route" }) : null,
        ]),
        isNext && run.openStore === s.id ? renderStoreInside(s) : null,
      ]);
      return card;
    });
    const done = !next && run.checkpoint !== "none";
    return el("div", { class: "olw-baba-phase" }, [
      el("p", { class: "olw-baba-kicker", text: `PHASE 2 · ${FLOOR_NAMES[run.viewFloor]}` }),
      tabs,
      el("ol", { class: "olw-baba-stops" }, stores),
      done
        ? el("div", { class: "olw-baba-checkout-cta" }, [
            el("p", { text: "CHECKOUT / ESCAPE · Receipts printed. Baba notified." }),
            button(md, "Checkout & exit", "olw-btn olw-btn--rose", () => {
              run.phase = "checkout";
              render();
            }),
          ])
        : null,
      el("div", { class: "olw-modal-actions" }, [button(md, "Abandon the trip", "olw-btn olw-btn--ghost olw-btn--small", abandon)]),
    ]);
  };

  let abandonArmed = false;
  const abandon = () => {
    if (!abandonArmed) {
      abandonArmed = true;
      say("Baba", "Leaving already? Tap again to go home — nothing bought today is kept.");
      md.timeout(() => (abandonArmed = false), 3500);
      return;
    }
    close();
  };

  // ---- the Baba receipt battle (three phases, lane dodging) ---------------
  const LANES = ["Left", "Centre", "Right"];
  const ATTACKS = ["NO MORE SHOPPING", "80085", "BUDGET WARNING", "CALCULATOR", "WALLET SHIELD"];
  const startBattle = () => {
    run.phase = "battle";
    run.bossDefense = BOSS_DEFENSE;
    run.bossPhase = 1;
    run.shieldUntil = 0;
    run.receipts = Math.max(BOSS_DEFENSE, run.purchases.length * 6);
    run.nextAttack = performance.now() + 1800;
    say("Juju", "It was basically an investment.", "juju");
    say("Baba", "SHOW ME THE RECEIPTS.");
    render();
  };

  const throwReceipt = () => {
    const now = performance.now();
    const cooldown = run.rescue ? 420 : 850;
    if (run.phase !== "battle" || run.receipts <= 0 || now - run.lastThrow < cooldown) return;
    run.lastThrow = now;
    if (now < run.shieldUntil) {
      say("Baba", "WALLET SHIELD · DODGE UNTIL IT BREAKS");
      return;
    }
    run.receipts -= 1;
    run.bossDefense -= 1;
    if (run.bossDefense % 6 === 0) say("Baba", BABA_LINES[(run.purchases.length + run.bossDefense) % BABA_LINES.length]);
    if (run.bossDefense <= 0) return finishBattle();
    if ((run.bossPhase === 1 && run.bossDefense <= 36) || (run.bossPhase === 2 && run.bossDefense <= 18)) {
      run.bossPhase += 1;
      run.shieldUntil = now + 6000;
      say(
        run.bossPhase === 3 ? "PHASE 3 · BABA HAS THE CALCULATOR" : "PHASE 2 · WALLET SHIELD",
        run.bossPhase === 3 ? "I HAVE OPENED THE BANKING APP." : "YOU CANNOT RECEIPT YOUR WAY THROUGH A WALLET SHIELD.",
      );
    }
    renderBattleState();
  };

  const finishBattle = () => {
    run.checkpoint = "won";
    run.phase = "floor";
    run.attack = null;
    store.incrementStat("baba_budget_battles_won");
    say("BABA DEFEATED", "financially, emotionally, spiritually", "good");
    say("Baba", "Fine. ONE more store.");
    say("Juju", `You always say that. ${JUJU_LINES[run.purchases.length % JUJU_LINES.length]}`, "juju");
    addUltimate(ULTIMATE_CHECKPOINT);
    render();
  };

  let battleBox: HTMLElement | null = null;
  const renderBattle = () => {
    battleBox = el("div", { class: "olw-baba-phase olw-baba-battle" });
    renderBattleState();
    return battleBox;
  };
  const renderBattleState = () => {
    if (!battleBox) return;
    const now = performance.now();
    const shield = now < run.shieldUntil;
    const lanes = el(
      "div",
      { class: "olw-baba-lanes" },
      LANES.map((name, i) => {
        const warn = run.attack?.lane === i;
        const b = button(md, "", `olw-baba-lane${run.lane === i ? " olw-baba-lane--juju" : ""}${warn ? " olw-baba-lane--warn" : ""}`, () => {
          run.lane = i;
          renderBattleState();
        });
        b.setAttribute("aria-label", `Move ${name}${warn ? " (incoming!)" : ""}`);
        b.append(el("span", { class: "olw-baba-lane-warn", text: warn ? run.attack!.label : "" }), el("span", { text: run.lane === i ? "Juju 🛍" : name }));
        return b;
      }),
    );
    battleBox.replaceChildren(
      el("p", { class: "olw-baba-kicker", text: `BABA RECEIPT BATTLE · ROUND ${run.bossPhase}/3` }),
      el("div", { class: "olw-baba-meter olw-baba-meter--boss" }, [
        el("span", { class: "olw-baba-meter-label", text: shield ? "Budget · WALLET SHIELD" : "Baba's budget defense" }),
        el("span", { class: "olw-baba-meter-track" }, [el("span", { class: "olw-baba-meter-fill", style: { width: `${(Math.max(0, run.bossDefense) / BOSS_DEFENSE) * 100}%` } })]),
        el("span", { class: "olw-baba-meter-val", text: `${Math.max(0, run.bossDefense)}/${BOSS_DEFENSE}` }),
      ]),
      el("p", { class: "olw-baba-note", text: "Throw crumpled receipts. When a warning lights a lane, move out of it before it lands." }),
      lanes,
      el("div", { class: "olw-modal-actions" }, [
        (() => {
          const b = button(md, shield ? "Receipts bounce off the shield…" : `Throw receipt (${run.receipts})`, "olw-btn olw-btn--gold", throwReceipt);
          b.disabled = run.receipts <= 0;
          return b;
        })(),
      ]),
    );
  };

  const battleTick = () => {
    if (run.phase !== "battle") return;
    const now = performance.now();
    const slow = run.rescue ? 1.6 : 1;
    if (run.attack && now >= run.attack.at) {
      if (run.attack.lane === run.lane) {
        addStress(1);
        run.collisions += 0;
        say("Juju", run.bossPhase === 3 ? "CALCULATOR COMBO! JUJU PLEASE." : "Budget warning! The bags disagree.", "juju");
      }
      run.attack = null;
      run.nextAttack = now + (run.bossPhase === 1 ? 1500 : run.bossPhase === 2 ? 1150 : 850) * slow;
      renderBattleState();
    } else if (!run.attack && now >= run.nextAttack) {
      const lane = (run.bossDefense + run.lane + run.bossPhase + Math.floor(now / 97)) % 3;
      run.attack = { lane, label: ATTACKS[(run.bossDefense + run.collisions) % ATTACKS.length], at: now + (run.bossPhase === 3 ? 900 : 1200) * slow };
      renderBattleState();
    } else if (run.shieldUntil && now >= run.shieldUntil) {
      run.shieldUntil = 0;
      renderBattleState();
    }
  };

  // ---- phase 3 / 4: checkout, rewards, Ultimate Shopper -------------------
  const settle = () => {
    if (run.finished) return;
    run.finished = true;
    const stress = Math.round(run.stress);
    for (const { product } of run.purchases) {
      if (product.rewardType === "outfit") {
        store.setFlag(`shopping_reward_${product.rewardId}`);
        store.unlockOutfit(product.rewardId, true);
      } else if (product.rewardType === "accessory") store.unlockAccessory(product.rewardId);
      else if (product.rewardType === "item") store.addItem(product.rewardId);
      else store.unlockKeepsake(product.rewardId);
    }
    if (run.purchases.length) store.incrementStat("shopping_bags", run.purchases.length);
    if (run.collisions) store.incrementStat("mall_collisions", run.collisions);
    if (run.flirty) store.incrementStat("flirty_moments", run.flirty);
    store.recordShoppingRun({
      id: `shopping-${Date.now()}`,
      mallId: run.mallId,
      day: store.state.currentDay,
      productIds: run.purchases.map((p) => p.product.id),
      babaStress: stress,
      babaBattle: run.checkpoint === "won" ? "won" : "avoided",
      collisions: run.collisions,
      flirtyMoments: run.flirty,
      ultimateUsed: run.rescue,
      seconds: Math.max(1, elapsed()),
    });
    const ultimate = run.purchases.length === BABA_SHOPPING_STORES.length && stress <= ULTIMATE_SHOPPER_MAX;
    const grade = ultimate ? 3 : stress < 90 ? 2 : 1;
    if (!run.replay) {
      store.addHearts(grade);
      store.addRelationship("baba", grade);
    }
    if (ultimate) {
      store.incrementStat("ultimate_shopper_runs");
      if (!store.hasFlag(ULTIMATE_SHOPPER_FLAG)) {
        store.setFlag(ULTIMATE_SHOPPER_FLAG);
        store.toast("Title unlocked · Ultimate Shopper", "#f4c95d");
      }
    }
    quests.onMinigame("shopping_spree");
    return { stress, ultimate, grade };
  };

  const renderCheckout = () => {
    const result = settle() ?? { stress: Math.round(run.stress), ultimate: store.hasFlag(ULTIMATE_SHOPPER_FLAG), grade: 0 };
    const rows = BABA_SHOPPING_STORES.map((s) => {
      const got = run.purchases.find((p) => p.store.id === s.id);
      return el("tr", {}, [
        el("td", { text: `${stopIndex(s)}. ${s.name}` }),
        el("td", { text: got ? `${got.product.icon} ${got.product.name}` : "—" }),
        el("td", { class: got ? "olw-baba-ok" : "olw-baba-miss", text: got ? `✓ +${got.product.stress}` : "✗" }),
      ]);
    });
    const verdict = result.ultimate
      ? "Every stop stamped, and Baba's stress never left the sensible zone."
      : result.stress < 90
        ? "Sensible-ish. Baba needs tea, not a lie-down."
        : "Financial menace. Baba has stopped checking the receipts.";
    return el("div", { class: "olw-baba-phase" }, [
      el("p", { class: "olw-baba-kicker", text: "PHASE 3 · THE CARD SURVIVED · BABA NEEDS TEA" }),
      el("h3", { class: "olw-baba-h3", text: "BABA SHOPPING REPORT" }),
      el("table", { class: "olw-baba-report" }, [
        el("thead", {}, [el("tr", {}, [el("th", { text: "Baba's list" }), el("th", { text: "In the bags" }), el("th", { text: "Stress" })])]),
        el("tbody", {}, rows),
      ]),
      el("ul", { class: "olw-baba-score" }, [
        el("li", { text: `Matched: ${run.purchases.length}/${BABA_SHOPPING_STORES.length} stores · ${run.purchases.length} bags` }),
        el("li", { text: `Baba stress: ${result.stress}% · card patience left: ${100 - result.stress}` }),
        el("li", { text: `Baba battle: ${run.checkpoint === "won" ? "WON" : "AVOIDED"} · pedestrian collisions: ${run.collisions}` }),
        el("li", { text: `Flirty moments: ${run.flirty} · Ultimate: ${run.rescue ? "MOOMOO BAG RESCUE" : "saved for another day"}` }),
        el("li", { text: `Shopping time: ${fmtTime(Math.max(1, elapsed()))}` }),
        el("li", { text: run.replay ? "Replay: purchases kept, quest rewards do not repeat." : `Rewards: every purchase · +${result.grade} ❤ · Baba ♡ +${result.grade}` }),
      ]),
      el("p", { class: "olw-baba-verdict", text: verdict }),
      result.ultimate
        ? el("div", { class: "olw-baba-ultimate" }, [
            el("p", { class: "olw-baba-kicker", text: "PHASE 4 · ULTIMATE UNLOCK" }),
            el("h3", { class: "olw-baba-h3", text: "✦ ULTIMATE SHOPPER ✦" }),
            el("p", { text: `All ${BABA_SHOPPING_STORES.length} stops matched at ${result.stress}% stress (the best possible route is ${ULTIMATE_SHOPPER_MAX}%). Baba is proud and slightly afraid.` }),
          ])
        : el("p", { class: "olw-baba-note", text: `Ultimate Shopper: finish every stop at ${ULTIMATE_SHOPPER_MAX}% stress or less.` }),
      el("div", { class: "olw-modal-actions" }, [
        button(md, "Return to the mall", "olw-btn olw-btn--rose", () => {
          close();
          uiEvents.emit("dialogue", "Baba", [
            result.ultimate ? "...Ultimate Shopper. I don't know whether to be proud or call the bank." : "I have stopped checking the receipts.",
            "Moomoo can carry the bags. I am going home.",
          ]);
        }),
      ]),
    ]);
  };

  // ---- render / tick ------------------------------------------------------
  const render = () => {
    renderHud();
    renderFeed();
    battleBox = null;
    const view = run.phase === "list" ? renderList() : run.phase === "battle" ? renderBattle() : run.phase === "checkout" ? renderCheckout() : renderFloor();
    main.replaceChildren(view);
    root.dataset.phase = run.phase;
  };

  md.interval(() => {
    if (run.phase === "battle") battleTick();
    if (run.phase === "floor" || run.phase === "battle") {
      const now = performance.now();
      // scene: after the first minute Baba checks the time every 30s
      if (run.phase === "floor" && now - run.startedAt > 60000 && now - run.lastTimeStress > 30000 && run.stress < 99) {
        run.lastTimeStress = now;
        addStress(1, "Baba checked the time. This is not a timer. It is judgment.");
      } else renderHud();
    }
  }, 250);

  render();
  return root;
}
