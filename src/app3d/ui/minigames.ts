// DOM minigames for the 3D build's minigame modal. Each kind is a small,
// self-contained HTML/CSS game rendered into the modal body. The runner shows
// a short intro, starts the game, and reports the result through onDone.
//
// Keyboard input arrives through uiEvents ("minigameKey" from the overlay's
// capture-phase key handler, "minigameAction" from the A button / prompt),
// because the overlay swallows keys while any modal is open.
import { uiEvents, type MiniGameSpec } from "../../game/systems/controls";
import { el } from "./dom";

type Kind = MiniGameSpec["kind"];
type Tone = "good" | "bad" | "info";

/** Optional extras a caller may attach to a spec (not part of MiniGameSpec). */
type ShopEntry = string | { name: string; price?: number; icon?: string; joy?: number };
type ExtSpec = MiniGameSpec & { items?: ShopEntry[]; budget?: number };

const PRESS_KEYS = new Set(["Space", "Enter", "NumpadEnter", "KeyE"]);

/** Keys the overlay forwards to the running minigame (and hides from the world). */
export const MINIGAME_KEYS = new Set([
  "Space",
  "Enter",
  "NumpadEnter",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  ...Array.from({ length: 9 }, (_, i) => `Digit${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `Numpad${i + 1}`),
]);

const INTRO_MS = 1500;

// ---- small helpers ---------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const hearts = (left: number, max: number) => "♥".repeat(Math.max(0, left)) + "♡".repeat(Math.max(0, max - left));
const fmtTime = (s: number) => `${Math.max(0, Math.ceil(s))}s`;

/** 1-based number from Digit/Numpad key codes, else 0. */
function digitOf(code: string): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : 0;
}

/** Restart a one-shot CSS animation class. */
function pulse(node: Element, cls: string) {
  node.classList.remove(cls);
  void (node as HTMLElement).offsetWidth;
  node.classList.add(cls);
}

// ---- game kit --------------------------------------------------------------

class Game {
  readonly stage: HTMLDivElement;
  readonly controls: HTMLDivElement;
  readonly difficulty: number;
  over = false;
  private readonly hudEl: HTMLDivElement;
  private readonly msgEl: HTMLParagraphElement;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    readonly spec: ExtSpec,
    root: HTMLElement,
    private readonly end: (ok: boolean, msg: string) => void,
  ) {
    this.difficulty = clamp(Math.round(spec.difficulty ?? 1), 1, 3);
    this.hudEl = el("div", { class: "olw-mg-hud" });
    this.stage = el("div", { class: "olw-mg-stage" });
    this.msgEl = el("p", { class: "olw-mg-msg", attrs: { "aria-live": "polite" } });
    this.controls = el("div", { class: "olw-mg-controls" });
    root.append(this.hudEl, this.stage, this.msgEl, this.controls);
  }

  add(fn: () => void) {
    this.cleanups.push(fn);
  }

  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  }

  after(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      if (!this.over) fn();
    }, ms);
    this.add(() => window.clearTimeout(id));
  }

  /** requestAnimationFrame loop; dt in seconds (capped). Stops when the game ends. */
  loop(fn: (dt: number) => void) {
    let last = performance.now();
    let id = 0;
    let alive = true;
    const step = (now: number) => {
      if (!alive || this.over) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      fn(dt);
      if (alive && !this.over) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    this.add(() => {
      alive = false;
      cancelAnimationFrame(id);
    });
  }

  onKey(fn: (code: string, down: boolean, repeat: boolean) => void) {
    const h = (code: string, down: boolean, repeat: boolean) => {
      if (!this.over) fn(code, down, !!repeat);
    };
    uiEvents.on("minigameKey", h);
    this.add(() => uiEvents.off("minigameKey", h));
  }

  onAction(fn: () => void) {
    const h = () => {
      if (!this.over) fn();
    };
    uiEvents.on("minigameAction", h);
    this.add(() => uiEvents.off("minigameAction", h));
  }

  /** Space / Enter / E (no repeats) and the A button. */
  press(fn: () => void) {
    this.onKey((code, down, repeat) => {
      if (down && !repeat && PRESS_KEYS.has(code)) fn();
    });
    this.onAction(fn);
  }

  /** Press-and-hold on a target element or Space/Enter/E. The A button toggles. */
  hold(target: HTMLElement, onDown: () => void, onUp: () => void) {
    let held = false;
    const down = () => {
      if (held || this.over) return;
      held = true;
      target.classList.add("is-held");
      onDown();
    };
    const up = () => {
      if (!held) return;
      held = false;
      target.classList.remove("is-held");
      if (!this.over) onUp();
    };
    this.onKey((code, isDown, repeat) => {
      if (!PRESS_KEYS.has(code)) return;
      if (isDown) {
        if (!repeat) down();
      } else up();
    });
    this.onAction(() => (held ? up() : down()));
    this.listen(target, "pointerdown", (e) => {
      e.preventDefault();
      down();
    });
    this.listen(target, "contextmenu", (e) => e.preventDefault());
    this.listen(window, "pointerup", up);
    this.listen(window, "pointercancel", up);
    this.listen(window, "blur", up);
    return {
      isHeld: () => held,
      /** Force-release without triggering onUp (e.g. an automatic slip). */
      drop: () => {
        held = false;
        target.classList.remove("is-held");
      },
    };
  }

  /** A button. `fast` fires on pointerdown (timing games) instead of click. */
  button(label: string, cls: string, fn: () => void, fast = false): HTMLButtonElement {
    const b = el("button", { class: cls, text: label, attrs: { type: "button" } });
    if (fast) {
      this.listen(b, "pointerdown", (e) => {
        e.preventDefault();
        if (!this.over) fn();
      });
      // keyboard-less click (e.g. assistive tech) still works
      this.listen(b, "click", (e) => {
        if ((e as MouseEvent).detail === 0 && !this.over) fn();
      });
    } else {
      this.listen(b, "click", () => {
        if (!this.over) fn();
      });
    }
    return b;
  }

  hud(chips: Array<[string, string]>) {
    this.hudEl.replaceChildren(
      ...chips.map(([k, v]) => el("span", { class: "olw-mg-chip" }, [el("span", { class: "olw-mg-chip-k", text: k }), el("b", { text: v })])),
    );
  }

  say(text: string, tone: Tone = "info") {
    this.msgEl.textContent = text;
    this.msgEl.className = `olw-mg-msg olw-mg-msg--${tone}`;
  }

  win(msg: string) {
    if (this.over) return;
    this.over = true;
    this.end(true, msg);
  }

  lose(msg: string) {
    if (this.over) return;
    this.over = true;
    this.end(false, msg);
  }

  dispose() {
    this.over = true;
    const fns = this.cleanups.splice(0).reverse();
    for (const fn of fns) {
      try {
        fn();
      } catch {
        /* keep tearing down */
      }
    }
  }
}

/** Horizontal track with a highlighted zone and a moving marker. */
function meter(extra = "") {
  const zone = el("div", { class: "olw-mg-zone" });
  const marker = el("div", { class: "olw-mg-marker" });
  const track = el("div", { class: `olw-mg-track ${extra}` }, [zone, marker]);
  return {
    track,
    setZone(center: number, width: number) {
      zone.style.left = `${(center - width / 2) * 100}%`;
      zone.style.width = `${width * 100}%`;
    },
    setMarker(p: number) {
      marker.style.left = `${clamp(p, 0, 1) * 100}%`;
    },
  };
}

// ---- the games -------------------------------------------------------------

/** Generic timing bar. Also the fallback for unknown kinds. */
function timingGame(g: Game) {
  const need = clamp(Math.round(g.spec.taps ?? 3), 2, 5);
  const maxMiss = 3;
  const width = 0.17 - 0.02 * g.difficulty;
  let hits = 0;
  let misses = 0;
  let pos = 0;
  let dir = 1;
  let lock = 0;
  let speed = 0.5 + 0.12 * g.difficulty;
  let center = rand(0.2, 0.8);
  const m = meter("olw-mg-track--big");
  m.setZone(center, width);
  g.stage.append(el("div", { class: "olw-mg-pad" }, [m.track]));
  const hud = () => g.hud([["Hits", `${hits}/${need}`], ["Misses", `${misses}/${maxMiss}`]]);
  hud();
  g.say("Tap when the marker is inside the glow.");
  const act = () => {
    if (lock > 0) return;
    lock = 0.18;
    if (Math.abs(pos - center) <= width / 2 + 0.015) {
      hits++;
      hud();
      pulse(m.track, "is-good");
      if (hits >= need) return g.win("Perfect timing!");
      g.say(["Got it!", "Lovely.", "Right on the beat."][hits % 3], "good");
      speed += 0.1;
      let next = center;
      while (Math.abs(next - center) < 0.2) next = rand(0.15, 0.85);
      center = next;
      m.setZone(center, width);
    } else {
      misses++;
      hud();
      pulse(m.track, "is-bad");
      if (misses >= maxMiss) return g.lose("Three misses — the moment slipped away.");
      g.say("Almost! Wait for the glow.", "bad");
    }
  };
  g.press(act);
  g.controls.append(g.button("Tap!", "olw-btn olw-btn--big", act, true));
  g.loop((dt) => {
    lock = Math.max(0, lock - dt);
    pos += dir * speed * dt;
    if (pos >= 1) {
      pos = 1;
      dir = -1;
    } else if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    m.setMarker(pos);
  });
}

/** Rhythm climb: steps scroll up; tap as each one crosses the foot line. */
function stairsGame(g: Game) {
  const need = 8;
  const maxMiss = 3;
  const LINE = 0.72;
  const WIN = 0.08;
  let hits = 0;
  let misses = 0;
  let lock = 0;
  let spawnIn = 0.25;
  let speed = 0.4 + 0.06 * g.difficulty;
  const steps: { y: number; node: HTMLDivElement; live: boolean }[] = [];

  const lane = el("div", { class: "olw-mg-stairs-lane" }, [el("div", { class: "olw-mg-stairs-line" })]);
  const climber = el("div", { class: "olw-mg-stairs-climber", text: "👟" });
  const ladder = el("div", { class: "olw-mg-stairs-ladder" }, [
    ...Array.from({ length: need }, (_, i) => el("span", { class: "olw-mg-stairs-rung", style: { bottom: `${(i / (need - 1)) * 100}%` } })),
    climber,
    el("span", { class: "olw-mg-stairs-top", text: "🚪" }),
  ]);
  g.stage.append(el("div", { class: "olw-mg-stairs" }, [lane, ladder]));

  const hud = () => g.hud([["Steps", `${hits}/${need}`], ["Stumbles", hearts(maxMiss - misses, maxMiss)]]);
  hud();
  g.say("Tap as each step reaches the glowing line.");

  const miss = (text: string) => {
    misses++;
    hud();
    pulse(lane, "is-bad");
    if (misses >= maxMiss) return g.lose("Three stumbles. The stairs win this round.");
    g.say(text, "bad");
  };
  const act = () => {
    if (lock > 0) return;
    lock = 0.15;
    let best: (typeof steps)[number] | undefined;
    for (const s of steps) if (s.live && Math.abs(s.y - LINE) <= WIN && (!best || Math.abs(s.y - LINE) < Math.abs(best.y - LINE))) best = s;
    if (!best) return miss("Too early — wait for the step.");
    best.live = false;
    best.node.classList.add("is-hit");
    hits++;
    hud();
    climber.style.bottom = `${(hits / need) * 100}%`;
    pulse(climber, "is-hop");
    if (hits >= need) return g.win("Top floor! Tiny victory dance.");
    speed += 0.02;
    g.say(hits > need - 3 ? "Nearly there!" : ["Step!", "Nice rhythm.", "Up we go."][hits % 3], "good");
  };
  g.press(act);
  g.controls.append(g.button("Step!", "olw-btn olw-btn--big", act, true));

  g.loop((dt) => {
    lock = Math.max(0, lock - dt);
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const node = el("div", { class: "olw-mg-step" });
      lane.append(node);
      steps.push({ y: -0.08, node, live: true });
      spawnIn = rand(0.72, 1.05) - 0.05 * g.difficulty;
    }
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      s.y += speed * dt;
      s.node.style.bottom = `${s.y * 100}%`;
      if (s.live && s.y > LINE + WIN) {
        s.live = false;
        s.node.classList.add("is-miss");
        miss("Missed a step!");
        if (g.over) return;
      }
      if (s.y > 1.1) {
        s.node.remove();
        steps.splice(i, 1);
      }
    }
  });
}

const HAIR_COLOURS = [
  { name: "Rose", hex: "#e46d94" },
  { name: "Blush", hex: "#f4a6c0" },
  { name: "Honey", hex: "#e6b65c" },
  { name: "Chestnut", hex: "#8a5a3a" },
  { name: "Lilac", hex: "#a98bc7" },
  { name: "Midnight", hex: "#3a2b3a" },
  { name: "Mint", hex: "#7be0a3" },
  { name: "Copper", hex: "#c46a3a" },
];

/** Colour match: memorise the look, then pick its three colours in order. */
function salonGame(g: Game) {
  const maxLives = 3;
  const PARTS = ["Hair", "Highlight", "Clip"];
  const palette = shuffle(HAIR_COLOURS).slice(0, 6);
  const target = shuffle(palette).slice(0, 3);
  let lives = maxLives;
  let idx = 0;
  let cursor = 0;
  let time = 25;

  const head = (label: string) => {
    const parts = [el("div", { class: "olw-mg-hair" }), el("div", { class: "olw-mg-streak" }), el("div", { class: "olw-mg-clip" })];
    const cover = el("div", { class: "olw-mg-head-cover", text: "?" });
    const box = el("div", { class: "olw-mg-head" }, [parts[0], el("div", { class: "olw-mg-face", text: "◡" }), parts[1], parts[2], cover]);
    const wrap = el("figure", { class: "olw-mg-look" }, [box, el("figcaption", { text: label })]);
    return { wrap, box, parts };
  };
  const goal = head("Her look");
  const mine = head("Your work");
  goal.parts.forEach((p, i) => (p.style.background = target[i].hex));
  const legend = el("p", { class: "olw-mg-salon-order", text: `Order: ${PARTS.join(" → ")}` });
  g.stage.append(el("div", { class: "olw-mg-salon" }, [goal.wrap, mine.wrap]), legend);

  const swatches = palette.map((c, i) => {
    const b = g.button(`${i + 1}`, "olw-mg-swatch", () => choose(i));
    b.style.background = c.hex;
    b.setAttribute("aria-label", c.name);
    b.title = c.name;
    return b;
  });
  g.controls.append(el("div", { class: "olw-mg-swatches" }, swatches));

  const hud = () => g.hud([["Colour", `${Math.min(idx + 1, 3)}/3 · ${PARTS[Math.min(idx, 2)]}`], ["Lives", hearts(lives, maxLives)], ["Time", fmtTime(time)]]);
  const setCursor = (i: number) => {
    cursor = (i + swatches.length) % swatches.length;
    swatches.forEach((s, j) => s.classList.toggle("is-cursor", j === cursor));
  };
  let peekToken = 0;
  const peek = (ms: number) => {
    const token = ++peekToken;
    goal.box.classList.remove("is-hidden");
    g.after(ms, () => {
      if (token === peekToken) goal.box.classList.add("is-hidden");
    });
  };
  const choose = (i: number) => {
    const c = palette[i];
    if (!c) return;
    setCursor(i);
    if (c === target[idx]) {
      mine.parts[idx].style.background = c.hex;
      pulse(mine.box, "is-pop");
      idx++;
      if (idx >= 3) {
        goal.box.classList.remove("is-hidden");
        hud();
        return g.win("A perfect match. She looks so pretty.");
      }
      g.say(`${c.name}! Now the ${PARTS[idx].toLowerCase()}.`, "good");
    } else {
      lives--;
      pulse(swatches[i], "is-shake");
      if (lives <= 0) {
        hud();
        return g.lose(`Not ${c.name}… three wrong colours.`);
      }
      g.say(`Not ${c.name}. Here's another peek.`, "bad");
      peek(1200);
    }
    hud();
  };
  hud();
  setCursor(0);
  g.say("Memorise her look…");
  peek(2600);
  g.after(2600, () => g.say(`Pick the ${PARTS[idx].toLowerCase()} colour.`));
  g.onKey((code, down) => {
    if (!down) return;
    const n = digitOf(code);
    if (n) return choose(n - 1);
    if (code === "ArrowRight" || code === "ArrowDown") setCursor(cursor + 1);
    else if (code === "ArrowLeft" || code === "ArrowUp") setCursor(cursor - 1);
    else if (PRESS_KEYS.has(code)) choose(cursor);
  });
  g.onAction(() => choose(cursor));
  g.loop((dt) => {
    const before = Math.ceil(time);
    time -= dt;
    if (Math.ceil(time) !== before) hud();
    if (time <= 0) g.lose("Time's up — the appointment ran over.");
  });
}

/** Hold to pour; release in the green band. */
function coffeeGame(g: Game) {
  const text = `${g.spec.title} ${g.spec.hint}`.toLowerCase();
  const need = /\btwo\b|\bpair\b|yours too|2 cups/.test(text) ? 2 : 1;
  const maxLives = 3;
  const rate = 0.4 + 0.05 * g.difficulty;
  let lives = maxLives;
  let cups = 0;
  let fill = 0;
  let pouring = false;
  let resolving = false;
  let lo = 0;
  let hi = 0;

  const liquid = el("div", { class: "olw-mg-liquid" });
  const band = el("div", { class: "olw-mg-band" });
  const stream = el("div", { class: "olw-mg-stream" });
  const cup = el("div", { class: "olw-mg-cup" }, [band, liquid, el("div", { class: "olw-mg-cup-handle" })]);
  const done = el("div", { class: "olw-mg-cups-done" });
  g.stage.append(el("div", { class: "olw-mg-coffee" }, [el("div", { class: "olw-mg-machine", text: "☕" }), stream, cup, done]));

  const newCup = () => {
    fill = 0;
    lo = rand(0.6, 0.74);
    hi = lo + 0.14 - 0.02 * (g.difficulty - 1);
    band.style.bottom = `${lo * 100}%`;
    band.style.height = `${(hi - lo) * 100}%`;
    liquid.style.height = "0%";
    cup.classList.remove("is-spill", "is-good");
    resolving = false;
  };
  const hud = () => g.hud([["Cups", `${cups}/${need}`], ["Attempts", hearts(lives, maxLives)]]);
  const judge = (spilled: boolean) => {
    pouring = false;
    stream.classList.remove("is-on");
    if (fill < 0.04 && !spilled) return; // accidental tap: ignore
    resolving = true;
    if (!spilled && fill >= lo && fill <= hi) {
      cups++;
      cup.classList.add("is-good");
      done.append(el("span", { text: "☕" }));
      hud();
      if (cups >= need) return g.win(need > 1 ? "Two perfect coffees. Two sugars each." : "A perfect pour.");
      g.say("Perfect! Next cup…", "good");
    } else {
      lives--;
      hud();
      if (spilled) cup.classList.add("is-spill");
      const why = spilled || fill > hi ? "Overfilled — splash!" : "Underfilled — a bit sad.";
      if (lives <= 0) return g.lose(`${why} Out of attempts.`);
      g.say(`${why} Try again.`, "bad");
    }
    g.after(900, () => {
      newCup();
      g.say("Hold to pour, release in the green.");
    });
  };
  const pourBtn = el("button", { class: "olw-btn olw-btn--big olw-mg-hold", text: "Hold to pour", attrs: { type: "button" } });
  const h = g.hold(
    pourBtn,
    () => {
      if (resolving) return;
      pouring = true;
      stream.classList.add("is-on");
    },
    () => {
      if (pouring) judge(false);
    },
  );
  g.controls.append(pourBtn);
  newCup();
  hud();
  g.say(need > 1 ? "Two cups. Hold to pour, release in the green." : "Hold to pour, release in the green.");
  g.loop((dt) => {
    if (!pouring) return;
    fill += rate * dt * (0.8 + fill * 0.5);
    liquid.style.height = `${clamp(fill, 0, 1) * 100}%`;
    if (fill >= 1.02) {
      h.drop();
      judge(true);
    }
  });
}

const FLOWERS = [
  { e: "🌹", n: "Rose" },
  { e: "🌷", n: "Tulip" },
  { e: "🌼", n: "Daisy" },
  { e: "🌻", n: "Sunflower" },
  { e: "🌸", n: "Blossom" },
  { e: "🌺", n: "Hibiscus" },
  { e: "🌿", n: "Fern" },
  { e: "🍀", n: "Clover" },
];

/** Fill the five bouquet slots with exactly the flowers on Mama's card. */
function bouquetGame(g: Game) {
  const SLOTS = 5;
  const kinds = shuffle(FLOWERS.map((_, i) => i)).slice(0, 3);
  const counts = shuffle([2, 2, 1]);
  const needed = new Map<number, number>(kinds.map((k, i) => [k, counts[i]]));
  const placed: (number | null)[] = Array(SLOTS).fill(null);
  let time = 20;
  let cursor = 0;

  const card = el(
    "div",
    { class: "olw-mg-order" },
    [el("span", { class: "olw-mg-order-k", text: "Mama's order" }), ...kinds.map((k) => el("span", { class: "olw-mg-order-item", text: `${FLOWERS[k].e} ${FLOWERS[k].n} ×${needed.get(k)}` }))],
  );
  const slotEls = placed.map((_, i) => g.button("", "olw-mg-slot", () => remove(i)));
  const vase = el("div", { class: "olw-mg-vase" }, [el("div", { class: "olw-mg-slots" }, slotEls), el("div", { class: "olw-mg-ribbon", text: "🎀" })]);
  g.stage.append(card, vase);
  const options = FLOWERS.map((f, i) => {
    const b = g.button("", "olw-mg-flower", () => add(i));
    b.append(el("span", { class: "olw-mg-flower-e", text: f.e }), el("span", { class: "olw-mg-flower-n", text: `${i + 1} ${f.n}` }));
    b.setAttribute("aria-label", f.n);
    return b;
  });
  g.controls.append(el("div", { class: "olw-mg-flowers" }, options));

  const count = (k: number) => placed.filter((p) => p === k).length;
  const filled = () => placed.filter((p) => p !== null).length;
  const hud = () => g.hud([["Bouquet", `${filled()}/${SLOTS}`], ["Time", fmtTime(time)]]);
  const render = () => {
    slotEls.forEach((s, i) => {
      const p = placed[i];
      s.textContent = p === null ? "" : FLOWERS[p].e;
      s.classList.toggle("is-empty", p === null);
      s.setAttribute("aria-label", p === null ? `Empty slot ${i + 1}` : `Remove ${FLOWERS[p].n}`);
    });
    hud();
  };
  const setCursor = (i: number) => {
    cursor = (i + options.length) % options.length;
    options.forEach((o, j) => o.classList.toggle("is-cursor", j === cursor));
  };
  const add = (k: number) => {
    setCursor(k);
    const want = needed.get(k) ?? 0;
    if (count(k) >= want) {
      time -= 2;
      pulse(options[k], "is-shake");
      g.say(want ? `Enough ${FLOWERS[k].n}s already. −2s` : `No ${FLOWERS[k].n}s on the card. −2s`, "bad");
      hud();
      return;
    }
    const slot = placed.indexOf(null);
    if (slot < 0) return;
    placed[slot] = k;
    render();
    pulse(slotEls[slot], "is-pop");
    if (filled() >= SLOTS) return g.win("A bouquet Mama will love.");
    g.say(`${FLOWERS[k].e} in!`, "good");
  };
  const remove = (i: number) => {
    if (placed[i] === null) return;
    placed[i] = null;
    render();
    g.say("Took one out.");
  };
  render();
  setCursor(0);
  g.say("Tap flowers to add them. Tap a slot to take one out.");
  g.onKey((code, down) => {
    if (!down) return;
    const n = digitOf(code);
    if (n >= 1 && n <= FLOWERS.length) return add(n - 1);
    if (code === "ArrowRight" || code === "ArrowDown") setCursor(cursor + 1);
    else if (code === "ArrowLeft" || code === "ArrowUp") setCursor(cursor - 1);
    else if (PRESS_KEYS.has(code)) add(cursor);
    else if (code === "Backspace") {
      for (let i = SLOTS - 1; i >= 0; i--)
        if (placed[i] !== null) {
          remove(i);
          break;
        }
    }
  });
  g.onAction(() => add(cursor));
  g.loop((dt) => {
    const before = Math.ceil(time);
    time -= dt;
    if (Math.ceil(time) !== before) hud();
    if (time <= 0) g.lose("Time's up — the florist is closing.");
  });
}

/** A scene scrolls past; snap when the subject is inside the frame. */
function photoGame(g: Game) {
  const shots = 5;
  const need = 3;
  const t = `${g.spec.title} ${g.spec.photoTex ?? ""}`.toLowerCase();
  const landmark = /ben|clock|london|westminster/.test(t) ? "🕰️" : /mosque|zayed/.test(t) ? "🕌" : /tower|burj|downtown/.test(t) ? "🏙️" : /castle|edinburgh/.test(t) ? "🏰" : "⛲";
  let taken = 0;
  let good = 0;
  let x = 118;
  let bob = 0;
  let speed = 20 + 4 * g.difficulty;
  let frozen = false;
  let pigeon: { x: number; node: HTMLDivElement } | null = null;

  const decor = Array.from({ length: 6 }, (_, i) => {
    const node = el("div", { class: "olw-mg-photo-decor", text: i % 2 ? "🌳" : "☁️" });
    node.classList.add(i % 2 ? "is-ground" : "is-sky");
    return { x: i * 22, node, speed: i % 2 ? 14 : 5 };
  });
  const subject = el("div", { class: "olw-mg-photo-subject" }, [el("span", { text: landmark }), el("span", { text: "👫" })]);
  const frame = el("div", { class: "olw-mg-photo-frame" });
  const flash = el("div", { class: "olw-mg-photo-flash" });
  const view = el("div", { class: "olw-mg-photo" }, [...decor.map((d) => d.node), subject, frame, flash]);
  const strip = el("div", { class: "olw-mg-film" }, Array.from({ length: shots }, () => el("span", { class: "olw-mg-film-cell" })));
  g.stage.append(view, g.spec.photoLabel ? el("p", { class: "olw-mg-caption", text: g.spec.photoLabel }) : "", strip);

  const hud = () => g.hud([["Good shots", `${good}/${need}`], ["Film", `${shots - taken} left`]]);
  const record = (ok: boolean, msg: string) => {
    const cell = strip.children[taken] as HTMLElement | undefined;
    if (cell) {
      cell.textContent = ok ? "✓" : "✗";
      cell.classList.add(ok ? "is-good" : "is-bad");
    }
    taken++;
    if (ok) good++;
    hud();
    if (good >= need) return g.win("That's the one. Keep it.");
    if (taken - good > shots - need) return g.lose("Out of film. Blurry memories are still memories.");
    g.say(msg, ok ? "good" : "bad");
    frozen = true;
    g.after(550, () => {
      frozen = false;
      x = 118;
      speed += 3;
      if (pigeon) pigeon.node.remove();
      pigeon = null;
      if (taken >= 1 && Math.random() < 0.45) {
        const node = el("div", { class: "olw-mg-photo-pigeon", text: "🐦" });
        view.append(node);
        pigeon = { x: -12, node };
      }
    });
  };
  const snap = () => {
    if (frozen) return;
    pulse(flash, "is-flash");
    const inFrame = Math.abs(x - 50) <= 8;
    const bombed = !!pigeon && Math.abs(pigeon.x - 50) <= 14;
    if (bombed) record(false, "Pigeon photobomb! Wait for it to pass.");
    else if (inFrame) record(true, "Lovely shot!");
    else record(false, x > 50 ? "Too soon — they weren't in the frame yet." : "Too late — they walked past.");
  };
  g.press(snap);
  g.controls.append(g.button("📸 Capture", "olw-btn olw-btn--big", snap, true));
  hud();
  g.say("Capture when you're both inside the pink frame.");
  g.loop((dt) => {
    for (const d of decor) {
      d.x -= d.speed * dt;
      if (d.x < -12) d.x += 132;
      d.node.style.left = `${d.x}%`;
    }
    if (frozen) return;
    bob += dt * 6;
    x -= speed * dt;
    subject.style.left = `${x}%`;
    subject.style.transform = `translate(-50%, ${Math.sin(bob) * 3}px)`;
    if (pigeon) {
      pigeon.x += 30 * dt;
      pigeon.node.style.left = `${pigeon.x}%`;
    }
    if (x < -14) record(false, "They walked right out of shot.");
  });
}

/** Reaction duel: tap when the target appears, before the rival's bar fills. */
function showdownGame(g: Game) {
  const targets = ["🍟", "⭐", "🍩", "🎯"];
  const target = targets[randInt(0, targets.length - 1)];
  const decoys = ["🐦", "🧦", "🥦", "📎", "🌵", "🧀"];
  let you = 0;
  let rival = 0;
  let round = 0;
  let phase: "wait" | "go" | "done" = "done";
  let goElapsed = 0;
  let rivalTime = 0.6;
  let token = 0;

  const prompt = el("div", { class: "olw-mg-duel-prompt", text: "…" });
  const youBar = el("div", { class: "olw-mg-duel-fill" });
  const rivalBar = el("div", { class: "olw-mg-duel-fill olw-mg-duel-fill--rival" });
  g.stage.append(
    el("p", { class: "olw-mg-duel-rule", text: `Tap the moment you see ${target}. Anything else is a trick!` }),
    prompt,
    el("div", { class: "olw-mg-duel-bars" }, [
      el("span", { text: "You" }),
      el("div", { class: "olw-mg-duel-bar" }, [youBar]),
      el("span", { text: "Rival" }),
      el("div", { class: "olw-mg-duel-bar" }, [rivalBar]),
    ]),
  );
  const hud = () => g.hud([["Round", `${Math.min(round, 3)}/3`], ["You", `${you}`], ["Rival", `${rival}`]]);

  const startRound = () => {
    round++;
    hud();
    phase = "wait";
    const my = ++token;
    youBar.style.width = "0%";
    rivalBar.style.width = "0%";
    prompt.className = "olw-mg-duel-prompt";
    prompt.textContent = "…";
    g.say(`Round ${round}. Wait for ${target}…`);
    const total = rand(1.4, 3.0);
    let t = rand(0.45, 0.8);
    while (t < total - 0.3) {
      const at = t;
      g.after(at * 1000, () => {
        if (my !== token || phase !== "wait") return;
        prompt.textContent = decoys[randInt(0, decoys.length - 1)];
        pulse(prompt, "is-pop");
      });
      t += rand(0.45, 0.8);
    }
    g.after(total * 1000, () => {
      if (my !== token || phase !== "wait") return;
      phase = "go";
      goElapsed = 0;
      rivalTime = rand(0.42, 0.68) - 0.05 * (g.difficulty - 1);
      prompt.textContent = target;
      prompt.classList.add("is-go");
      pulse(prompt, "is-pop");
      g.say("NOW!", "good");
    });
  };
  const endRound = (youWon: boolean, msg: string) => {
    phase = "done";
    token++;
    if (youWon) you++;
    else rival++;
    hud();
    if (you >= 2) return g.win(`You win ${you}–${rival}! ${msg}`);
    if (rival >= 2) return g.lose(`Rival wins ${rival}–${you}. ${msg}`);
    g.say(msg, youWon ? "good" : "bad");
    g.after(1100, startRound);
  };
  const tap = () => {
    if (phase === "wait") {
      prompt.classList.add("is-foul");
      endRound(false, "False start — that wasn't it!");
    } else if (phase === "go") {
      youBar.style.width = "100%";
      endRound(true, `${Math.round(goElapsed * 1000)} ms. Lightning!`);
    }
  };
  g.press(tap);
  g.controls.append(g.button("Tap!", "olw-btn olw-btn--big", tap, true));
  g.loop((dt) => {
    if (phase !== "go") return;
    goElapsed += dt;
    rivalBar.style.width = `${clamp(goElapsed / rivalTime, 0, 1) * 100}%`;
    if (goElapsed >= rivalTime) endRound(false, "Too slow — the rival got there first.");
  });
  hud();
  startRound();
}

const DEFAULT_SHOP = [
  { name: "Dress", icon: "👗", price: 180, joy: 5 },
  { name: "Cute top", icon: "👚", price: 70, joy: 3 },
  { name: "Jacket", icon: "🧥", price: 210, joy: 5 },
  { name: "Heels", icon: "👠", price: 150, joy: 4 },
  { name: "Handbag", icon: "👜", price: 240, joy: 6 },
  { name: "Necklace", icon: "📿", price: 90, joy: 3 },
  { name: "Ring", icon: "💍", price: 45, joy: 1 },
  { name: "Sunglasses", icon: "🕶️", price: 80, joy: 2 },
];

/** Knapsack: best joy reachable within the budget. */
function bestJoy(items: { price: number; joy: number }[], budget: number) {
  const cap = Math.max(0, Math.floor(budget));
  const dp = new Array<number>(cap + 1).fill(0);
  for (const it of items) {
    const p = Math.max(0, Math.round(it.price));
    for (let b = cap; b >= p; b--) dp[b] = Math.max(dp[b], dp[b - p] + it.joy);
  }
  return dp[cap];
}

/** Budget pick: choose items for the most joy without going over. */
function shoppingGame(g: Game) {
  const budget = Math.max(1, Math.round(g.spec.budget ?? 500));
  const items = (g.spec.items?.length ? g.spec.items : DEFAULT_SHOP).slice(0, 9).map((it, i) => {
    const o = typeof it === "string" ? { name: it } : it;
    const price = Math.max(5, Math.round(o.price ?? randInt(4, 24) * 10));
    return { name: o.name, icon: o.icon ?? "🛍️", price, joy: Math.max(1, Math.round(o.joy ?? price / 45 + (i % 2))) };
  });
  const best = Math.max(1, bestJoy(items, budget));
  const chosen = new Set<number>();
  let cursor = 0;
  let time = 40;

  const rows = items.map((it, i) => {
    const b = g.button("", "olw-mg-shop-row", () => toggle(i));
    b.append(
      el("span", { class: "olw-mg-shop-icon", text: it.icon }),
      el("span", { class: "olw-mg-shop-name", text: `${i + 1}. ${it.name}` }),
      el("span", { class: "olw-mg-shop-joy", text: "♥".repeat(Math.min(it.joy, 7)) }),
      el("span", { class: "olw-mg-shop-price", text: `${it.price}` }),
    );
    return b;
  });
  const fill = el("div", { class: "olw-mg-budget-fill" });
  const label = el("span", { class: "olw-mg-budget-label" });
  g.stage.append(el("div", { class: "olw-mg-shop" }, rows), el("div", { class: "olw-mg-budget" }, [fill, label]));
  const confirm = g.button("Check out", "olw-btn olw-btn--rose", () => checkout());
  g.controls.append(confirm);

  const total = () => [...chosen].reduce((s, i) => s + items[i].price, 0);
  const joy = () => [...chosen].reduce((s, i) => s + items[i].joy, 0);
  const render = () => {
    const tot = total();
    rows.forEach((r, i) => {
      r.classList.toggle("is-on", chosen.has(i));
      r.classList.toggle("is-cursor", i === cursor);
      r.setAttribute("aria-pressed", chosen.has(i) ? "true" : "false");
    });
    fill.style.width = `${clamp(tot / budget, 0, 1) * 100}%`;
    fill.classList.toggle("is-over", tot > budget);
    label.textContent = `${tot} / ${budget} coins`;
    confirm.disabled = tot > budget || chosen.size === 0;
    g.hud([["Joy", `${joy()} ♥`], ["Left", `${budget - tot}`], ["Time", fmtTime(time)]]);
  };
  const toggle = (i: number) => {
    if (!items[i]) return;
    cursor = i;
    if (chosen.has(i)) chosen.delete(i);
    else chosen.add(i);
    render();
    if (total() > budget) g.say("Over budget! Baba's card is sweating.", "bad");
    else g.say(chosen.size ? "Checkout when you're happy." : "Pick what makes you happiest.");
  };
  const checkout = () => {
    if (total() > budget || !chosen.size) return;
    const pct = Math.round((joy() / best) * 100);
    g.win(`${joy()} joy for ${total()} coins — ${pct}% Baba-approved.`);
  };
  render();
  g.say(`Budget: ${budget}. Get the most ♥ without going over.`);
  g.onKey((code, down) => {
    if (!down) return;
    const n = digitOf(code);
    if (n) return toggle(n - 1);
    if (code === "ArrowDown" || code === "ArrowRight") cursor = (cursor + 1) % items.length;
    else if (code === "ArrowUp" || code === "ArrowLeft") cursor = (cursor - 1 + items.length) % items.length;
    else if (code === "Space" || code === "KeyE") return toggle(cursor);
    else if (code === "Enter" || code === "NumpadEnter") return checkout();
    render();
  });
  g.onAction(() => toggle(cursor));
  g.loop((dt) => {
    const before = Math.ceil(time);
    time -= dt;
    if (Math.ceil(time) !== before) render();
    if (time <= 0) {
      if (total() <= budget && chosen.size) checkout();
      else g.lose(chosen.size ? "The shop closed while you were over budget." : "The shop closed with an empty bag!");
    }
  });
}

/** Three-digit combination: listen for the warmth, set each digit, 3 tries. */
function safeGame(g: Game) {
  const code = [randInt(0, 9), randInt(0, 9), randInt(0, 9)];
  const entry: (number | null)[] = [null, null, null];
  const locked = [false, false, false];
  const maxTries = 3;
  let tries = maxTries;
  let slot = 0;
  let dial = randInt(0, 9);
  let time = 50;
  let checking = false;

  const slots = entry.map(() => el("span", { class: "olw-mg-safe-slot" }));
  const ring = el(
    "div",
    { class: "olw-mg-dial-ring" },
    Array.from({ length: 10 }, (_, i) => el("span", { class: "olw-mg-dial-num", text: `${i}`, style: { transform: `rotate(${i * 36}deg) translateY(-54px) rotate(${-i * 36}deg)` } })),
  );
  const centre = el("div", { class: "olw-mg-dial-centre" });
  const warmth = el("div", { class: "olw-mg-warmth-fill" });
  const warmthLabel = el("span", { class: "olw-mg-warmth-label" });
  g.stage.append(
    el("div", { class: "olw-mg-safe-slots" }, slots),
    el("div", { class: "olw-mg-safe" }, [el("div", { class: "olw-mg-dial" }, [ring, centre, el("span", { class: "olw-mg-dial-pointer", text: "▼" })])]),
    el("div", { class: "olw-mg-warmth" }, [el("span", { text: "🩺" }), el("div", { class: "olw-mg-warmth-bar" }, [warmth]), warmthLabel]),
  );
  const left = g.button("◀", "olw-btn olw-btn--ghost olw-mg-spin", () => spin(-1));
  const right = g.button("▶", "olw-btn olw-btn--ghost olw-mg-spin", () => spin(1));
  const set = g.button("Set digit", "olw-btn olw-btn--rose", () => setDigit());
  g.controls.append(left, set, right);

  let rot = -dial * 36;
  const hud = () => g.hud([["Digit", `${Math.min(slot + 1, 3)}/3`], ["Tries", hearts(tries, maxTries)], ["Time", fmtTime(time)]]);
  const render = () => {
    ring.style.transform = `rotate(${rot}deg)`;
    centre.textContent = `${dial}`;
    slots.forEach((s, i) => {
      s.textContent = entry[i] === null ? "_" : `${entry[i]}`;
      s.classList.toggle("is-active", i === slot && !checking);
      s.classList.toggle("is-locked", locked[i]);
    });
    const dist = slot < 3 ? Math.min(Math.abs(dial - code[slot]), 10 - Math.abs(dial - code[slot])) : 5;
    const heat = [1, 0.7, 0.45, 0.25, 0.1, 0.05][dist];
    warmth.style.width = `${heat * 100}%`;
    warmth.classList.toggle("is-hot", dist === 0);
    warmthLabel.textContent = dist === 0 ? "*click*" : dist <= 2 ? "warm" : "cold";
  };
  const spin = (dir: number) => {
    if (checking || slot > 2) return;
    dial = (dial + dir + 10) % 10;
    rot -= dir * 36;
    render();
  };
  const nextOpen = (from: number) => {
    for (let i = from; i < 3; i++) if (!locked[i]) return i;
    return 3;
  };
  const setDigit = () => {
    if (checking || slot > 2) return;
    entry[slot] = dial;
    pulse(slots[slot], "is-pop");
    slot = nextOpen(slot + 1);
    if (slot <= 2) {
      g.say(`Digit set. Now digit ${slot + 1}.`);
      render();
      hud();
      return;
    }
    // all three set: try the handle
    checking = true;
    const correct = entry.map((d, i) => d === code[i]);
    render();
    if (correct.every(Boolean)) return g.win(`Clunk… the door swings open! (${code.join("")})`);
    tries--;
    hud();
    slots.forEach((s, i) => s.classList.add(correct[i] ? "is-good" : "is-bad"));
    if (tries <= 0) return g.lose(`The safe stays shut. It was ${code.join("")}.`);
    g.say(`${correct.filter(Boolean).length}/3 right. Green digits stay put.`, "bad");
    g.after(1100, () => {
      correct.forEach((ok, i) => {
        locked[i] = ok;
        if (!ok) entry[i] = null;
      });
      slots.forEach((s) => s.classList.remove("is-good", "is-bad"));
      slot = nextOpen(0);
      checking = false;
      render();
      hud();
    });
  };
  render();
  hud();
  g.say("Spin until the stethoscope clicks, then set the digit.");
  g.onKey((c, down) => {
    if (!down) return;
    if (c === "ArrowLeft" || c === "ArrowDown") spin(-1);
    else if (c === "ArrowRight" || c === "ArrowUp") spin(1);
    else if (PRESS_KEYS.has(c)) setDigit();
    else if (c === "Backspace" && !checking) {
      for (let i = Math.min(slot, 3) - 1; i >= 0; i--)
        if (!locked[i]) {
          entry[i] = null;
          slot = i;
          break;
        }
      render();
      hud();
    }
  });
  g.onAction(setDigit);
  g.loop((dt) => {
    const before = Math.ceil(time);
    time -= dt;
    if (Math.ceil(time) !== before) hud();
    if (time <= 0) g.lose("Footsteps! Out of time.");
  });
}

const FLASKS = [
  { name: "Pink", hex: "#e46d94", key: "ArrowUp" },
  { name: "Mint", hex: "#57b889", key: "ArrowRight" },
  { name: "Gold", hex: "#e6b65c", key: "ArrowDown" },
  { name: "Blue", hex: "#5b8fd6", key: "ArrowLeft" },
];

/** Simon-style sequence memory: 3, 4, 5, 6 flashes. */
function labGame(g: Game) {
  const rounds = 4;
  const maxLives = 3;
  const gap = 640 - 60 * (g.difficulty - 1);
  const seq = [randInt(0, 3), randInt(0, 3), randInt(0, 3)];
  let round = 1;
  let pos = 0;
  let lives = maxLives;
  let phase: "show" | "input" | "wait" = "wait";

  const flasks = FLASKS.map((f, i) => {
    const b = g.button("", "olw-mg-flask", () => input(i), true);
    b.style.setProperty("--flask", f.hex);
    b.append(el("span", { class: "olw-mg-flask-e", text: "🧪" }), el("span", { class: "olw-mg-flask-n", text: `${i + 1}` }));
    b.setAttribute("aria-label", `${f.name} flask`);
    return b;
  });
  g.stage.append(el("div", { class: "olw-mg-flasks" }, flasks));
  const hud = () => g.hud([["Round", `${round}/${rounds}`], ["Step", `${pos}/${seq.length}`], ["Lives", hearts(lives, maxLives)]]);

  const light = (i: number, ms = 380) => {
    const f = flasks[i];
    f.classList.add("is-lit");
    g.after(ms, () => f.classList.remove("is-lit"));
  };
  const show = () => {
    phase = "show";
    pos = 0;
    hud();
    g.say(`Watch the sequence (${seq.length})…`);
    seq.forEach((k, i) => g.after(300 + i * gap, () => light(k)));
    g.after(300 + seq.length * gap, () => {
      phase = "input";
      g.say("Your turn — repeat it!");
    });
  };
  const input = (i: number) => {
    if (phase !== "input") return;
    light(i, 200);
    if (i === seq[pos]) {
      pos++;
      hud();
      if (pos < seq.length) return;
      if (round >= rounds) return g.win("Samples sorted. Clean results!");
      phase = "wait";
      g.say("Correct! One more this time.", "good");
      round++;
      seq.push(randInt(0, 3));
      g.after(800, show);
    } else {
      lives--;
      phase = "wait";
      pulse(flasks[i], "is-shake");
      hud();
      if (lives <= 0) return g.lose("The samples fizzed over. Out of lives.");
      g.say("Oops, wrong flask. Watch again.", "bad");
      g.after(900, show);
    }
  };
  g.onKey((code, down, repeat) => {
    if (!down || repeat) return;
    const n = digitOf(code);
    if (n >= 1 && n <= 4) return input(n - 1);
    const k = FLASKS.findIndex((f) => f.key === code);
    if (k >= 0) input(k);
  });
  hud();
  g.after(200, show);
}

const SLIDES = [
  "Hello, Board 👋",
  "Q3: Vibes Up 📈",
  "Coffee Is Infrastructure ☕",
  "Safer Systems 🛡️",
  "Smarter Labs 🧪",
  "The Snack Budget 🍪",
  "Synergy, But Real 🤝",
  "Thank You ✨",
];

/** Presentation pacing: advance each slide while confidence is in the green. */
function pitchGame(g: Game) {
  const need = 5;
  const maxMiss = 3;
  const rate = 1 / (2.3 - 0.25 * (g.difficulty - 1));
  let hits = 0;
  let misses = 0;
  let conf = 0;
  let lock = 0;
  let lo = 0;
  let hi = 0;
  let slide = 0;

  const slideEl = el("div", { class: "olw-mg-slide" });
  const m = meter("olw-mg-track--big olw-mg-confidence");
  g.stage.append(slideEl, el("p", { class: "olw-mg-meter-label", text: "Confidence" }), m.track);
  const hud = () => g.hud([["Slides", `${hits}/${need}`], ["Stumbles", hearts(maxMiss - misses, maxMiss)]]);
  const newSlide = () => {
    conf = 0;
    lo = rand(0.52, 0.66);
    hi = lo + 0.2 - 0.02 * (g.difficulty - 1);
    m.setZone((lo + hi) / 2, hi - lo);
    slideEl.textContent = SLIDES[slide % SLIDES.length];
    slideEl.dataset.n = `${(slide % SLIDES.length) + 1}`;
    pulse(slideEl, "is-in");
  };
  const miss = (msg: string) => {
    misses++;
    hud();
    pulse(m.track, "is-bad");
    if (misses >= maxMiss) return g.lose(`${msg} The board looks unconvinced.`);
    g.say(msg, "bad");
    conf = 0;
  };
  const next = () => {
    if (lock > 0) return;
    lock = 0.25;
    if (conf < lo) return miss("Too rushed!");
    if (conf > hi) return miss("Waited a beat too long.");
    hits++;
    slide++;
    hud();
    pulse(m.track, "is-good");
    if (hits >= need) return g.win("The board has never seen a slide about snacks this persuasive.");
    g.say(["Smooth.", "Nailed it.", "The board nods."][hits % 3], "good");
    newSlide();
  };
  g.press(next);
  g.controls.append(g.button("Next slide ▶", "olw-btn olw-btn--big", next, true));
  newSlide();
  hud();
  g.say("Click Next when confidence is in the green.");
  g.loop((dt) => {
    lock = Math.max(0, lock - dt);
    conf += rate * dt;
    m.setMarker(conf);
    if (conf >= 1) miss("Awkward silence…");
  });
}

/** Hold for tension; the pick sweeps; release over the pin's sweet spot. */
function lockpickGame(g: Game) {
  const pins = 3;
  const maxSlips = 5;
  const maxTension = 3.2;
  const width = 0.15 - 0.02 * (g.difficulty - 1);
  let set = 0;
  let slips = 0;
  let pos = 0;
  let dir = 1;
  let tension = 0;
  let holding = false;
  let center = rand(0.3, 0.85);
  let speed = 0.55 + 0.1 * g.difficulty;

  const pinEls = Array.from({ length: pins }, () => el("div", { class: "olw-mg-pin" }, [el("span", { class: "olw-mg-pin-top" })]));
  const tensionFill = el("div", { class: "olw-mg-tension-fill" });
  const m = meter("olw-mg-track--big");
  g.stage.append(
    el("div", { class: "olw-mg-lock" }, [el("div", { class: "olw-mg-lock-body" }, pinEls), el("span", { class: "olw-mg-lock-emoji", text: "🔒" })]),
    el("p", { class: "olw-mg-meter-label", text: "Pick" }),
    m.track,
    el("p", { class: "olw-mg-meter-label", text: "Tension" }),
    el("div", { class: "olw-mg-tension" }, [tensionFill]),
  );
  const hud = () => g.hud([["Pins", `${set}/${pins}`], ["Slips", `${slips}/${maxSlips}`]]);
  const render = () => {
    pinEls.forEach((p, i) => {
      p.classList.toggle("is-set", i < set);
      p.classList.toggle("is-active", i === set);
    });
    m.setZone(center, width);
  };
  const reset = () => {
    holding = false;
    pos = 0;
    dir = 1;
    tension = 0;
    m.setMarker(0);
    tensionFill.style.width = "0%";
  };
  const slip = (msg: string) => {
    slips++;
    hud();
    pulse(m.track, "is-bad");
    reset();
    if (slips >= maxSlips) return g.lose("Five slips. The lock stays deeply unimpressed.");
    g.say(msg, "bad");
  };
  const release = () => {
    if (!holding) return;
    const ok = Math.abs(pos - center) <= width / 2 + 0.01;
    if (!ok) return slip("Slipped! Release over the pin's sweet spot.");
    set++;
    reset();
    hud();
    render();
    pulse(m.track, "is-good");
    if (set >= pins) return g.win("Click… click… CLICK. Unlocked!");
    center = rand(0.3, 0.85);
    speed += 0.12;
    render();
    g.say(`Pin ${set} set! Next one is jumpier.`, "good");
  };
  const holdBtn = el("button", { class: "olw-btn olw-btn--big olw-mg-hold", text: "Hold for tension", attrs: { type: "button" } });
  const h = g.hold(
    holdBtn,
    () => {
      holding = true;
      pos = 0;
      dir = 1;
      tension = 0;
      g.say("Steady… release on the green.");
    },
    release,
  );
  g.controls.append(holdBtn);
  render();
  hud();
  g.say("Hold to apply tension, release when the pick is on the green.");
  g.loop((dt) => {
    if (!holding) return;
    tension += dt;
    pos += dir * speed * dt;
    if (pos >= 1) {
      pos = 1;
      dir = -1;
    } else if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    m.setMarker(pos);
    tensionFill.style.width = `${clamp(tension / maxTension, 0, 1) * 100}%`;
    tensionFill.classList.toggle("is-hot", tension > maxTension * 0.7);
    if (tension >= maxTension) {
      h.drop();
      slip("Too much tension — the pick snapped back!");
    }
  });
}

/** Pick the professional badge photo. The right answer is always the smile. */
function badgePhotoGame(g: Game) {
  const maxLives = 2;
  const poses = shuffle([
    { face: "🙂", label: "Reasonable smile", good: true, note: "Friendly. Employable. Approved." },
    { face: "😱", label: "Badge panic", good: false, note: "HR has concerns about the screaming." },
    { face: "🤨", label: "Suspicious of camera", good: false, note: "Security flagged you as a spy." },
    { face: "😴", label: "First-day nap", good: false, note: "Eyes are traditionally open at work." },
  ]);
  let lives = maxLives;
  let sel = -1;
  let time = 30;

  const face = el("div", { class: "olw-mg-badge-face", text: "📷" });
  const name = el("div", { class: "olw-mg-badge-name", text: "Pick a pose" });
  g.stage.append(
    el("div", { class: "olw-mg-badge" }, [el("div", { class: "olw-mg-badge-strip", text: "EMPLOYEE" }), face, name, el("div", { class: "olw-mg-badge-bar" })]),
  );
  const opts = poses.map((p, i) => {
    const b = g.button("", "olw-mg-pose", () => choose(i));
    b.append(el("span", { class: "olw-mg-pose-e", text: p.face }), el("span", { class: "olw-mg-pose-n", text: `${i + 1}. ${p.label}` }));
    return b;
  });
  const confirm = g.button("Take badge photo", "olw-btn olw-btn--rose", () => snap());
  confirm.disabled = true;
  g.controls.append(el("div", { class: "olw-mg-poses" }, opts), confirm);

  const hud = () => g.hud([["Retakes", hearts(lives, maxLives)], ["Time", fmtTime(time)]]);
  const choose = (i: number) => {
    if (!poses[i]) return;
    sel = i;
    opts.forEach((o, j) => o.classList.toggle("is-on", j === i));
    face.textContent = poses[i].face;
    name.textContent = poses[i].label;
    pulse(face, "is-pop");
    confirm.disabled = false;
    g.say("Happy with it? Take the photo.");
  };
  const snap = () => {
    if (sel < 0) return;
    const p = poses[sel];
    if (p.good) return g.win(p.note);
    lives--;
    hud();
    pulse(opts[sel], "is-shake");
    if (lives <= 0) return g.lose(`${p.note} Badge denied.`);
    g.say(`${p.note} Retake!`, "bad");
  };
  hud();
  g.say("Choose the most professional pose.");
  g.onKey((code, down) => {
    if (!down) return;
    const n = digitOf(code);
    if (n >= 1 && n <= poses.length) return choose(n - 1);
    if (code === "ArrowRight" || code === "ArrowDown") choose((sel + 1 + poses.length) % poses.length);
    else if (code === "ArrowLeft" || code === "ArrowUp") choose((sel - 1 + poses.length) % poses.length);
    else if (PRESS_KEYS.has(code)) {
      if (sel < 0) choose(0);
      else snap();
    }
  });
  g.onAction(() => (sel < 0 ? choose(0) : snap()));
  g.loop((dt) => {
    const before = Math.ceil(time);
    time -= dt;
    if (Math.ceil(time) !== before) hud();
    if (time <= 0) g.lose("The photographer went on lunch break.");
  });
}

const GAMES: Record<Kind, (g: Game) => void> = {
  stairs: stairsGame,
  salon: salonGame,
  coffee: coffeeGame,
  bouquet: bouquetGame,
  photo: photoGame,
  showdown: showdownGame,
  shopping: shoppingGame,
  safe: safeGame,
  lab: labGame,
  pitch: pitchGame,
  lockpick: lockpickGame,
  badge_photo: badgePhotoGame,
  timing: timingGame,
};

const INFO: Record<Kind, { icon: string; how: string; keys: string }> = {
  stairs: { icon: "🪜", how: "Tap as each step crosses the line. 8 steps to the top; 3 stumbles and you're out.", keys: "Space / Enter or tap" },
  salon: { icon: "💇‍♀️", how: "Memorise her look, then pick its 3 colours in order. 3 lives.", keys: "1–6, arrows + Enter, or tap" },
  coffee: { icon: "☕", how: "Hold to pour and release in the green band. 3 attempts.", keys: "Hold Space / Enter or the button" },
  bouquet: { icon: "💐", how: "Fill 5 slots with exactly the flowers on the card. 20 seconds.", keys: "1–8, arrows + Enter, Backspace, or tap" },
  photo: { icon: "📸", how: "Capture when you're both inside the frame. 3 good shots from 5.", keys: "Space / Enter or tap" },
  showdown: { icon: "⚡", how: "Tap the instant the target appears — before the rival. Best of 3.", keys: "Space / Enter or tap" },
  shopping: { icon: "🛍️", how: "Pick the most joy you can without going over budget, then check out.", keys: "1–9 or arrows + Space, Enter to pay" },
  safe: { icon: "🔐", how: "Spin the dial, listen for the click, set 3 digits. 3 tries.", keys: "← → to spin, Enter to set" },
  lab: { icon: "🧪", how: "Repeat the flask sequence. It grows each round — 4 rounds.", keys: "1–4, arrows, or tap" },
  pitch: { icon: "📊", how: "Advance each slide while confidence is in the green. 5 slides.", keys: "Space / Enter or tap" },
  lockpick: { icon: "🗝️", how: "Hold for tension, release when the pick is on the green. 3 pins.", keys: "Hold Space / Enter or the button" },
  badge_photo: { icon: "🪪", how: "Choose the most professional pose for your badge.", keys: "1–4, arrows + Enter, or tap" },
  timing: { icon: "✨", how: "Tap when the marker is in the glow. 3 misses and it's over.", keys: "Space / Enter or tap" },
};

// ---- runner ----------------------------------------------------------------

/**
 * Run a minigame inside `container`. Shows the intro for 1.5s, then plays.
 * Success calls onDone(true) after a short celebration; failure offers a
 * retry, and leaving calls onDone(false). Returns a cleanup function.
 */
export function runMinigame(spec: MiniGameSpec, container: HTMLElement, onDone: (success: boolean) => void): () => void {
  const kind: Kind = spec.kind in GAMES ? spec.kind : "timing";
  const wrap = el("div", { class: `olw-mg olw-mg--${kind}` });
  container.append(wrap);
  let game: Game | null = null;
  let disposed = false;
  let finished = false;
  let resultKeys: ((code: string) => void) | null = null;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
  };
  const stopGame = () => {
    game?.dispose();
    game = null;
  };

  const intro = () => {
    stopGame();
    resultKeys = null;
    const info = INFO[kind];
    const bar = el("div", { class: "olw-mg-ready-fill" });
    wrap.replaceChildren(
      el("div", { class: "olw-mg-intro" }, [
        el("div", { class: "olw-mg-intro-icon", text: info.icon }),
        el("p", { class: "olw-mg-intro-hint", text: spec.hint }),
        el("p", { class: "olw-mg-intro-how", text: info.how }),
        el("p", { class: "olw-mg-intro-keys", text: info.keys }),
        el("div", { class: "olw-mg-ready" }, [bar]),
      ]),
    );
    bar.style.animationDuration = `${INTRO_MS}ms`;
    later(() => {
      wrap.replaceChildren();
      game = new Game(spec, wrap, finish);
      GAMES[kind](game);
    }, INTRO_MS);
  };

  const done = (ok: boolean) => {
    if (finished || disposed) return;
    finished = true;
    onDone(ok);
  };

  const finish = (ok: boolean, msg: string) => {
    // stop loops + listeners but keep the final board visible under the card
    const g = game;
    game = null;
    queueMicrotask(() => g?.dispose());
    const card = el("div", { class: `olw-mg-result olw-mg-result--${ok ? "win" : "lose"}`, attrs: { role: "status" } }, [
      el("div", { class: "olw-mg-result-icon", text: ok ? "🎉" : "💫" }),
      el("p", { class: "olw-mg-result-title", text: ok ? "Success!" : "Not this time" }),
      el("p", { class: "olw-mg-result-msg", text: msg }),
    ]);
    if (ok) {
      later(() => done(true), 1200);
    } else {
      const retry = el("button", { class: "olw-btn olw-btn--rose", text: "Try again", attrs: { type: "button" } });
      const leave = el("button", { class: "olw-btn olw-btn--ghost", text: "Leave", attrs: { type: "button" } });
      retry.addEventListener("click", intro);
      leave.addEventListener("click", () => done(false));
      card.append(el("div", { class: "olw-mg-result-actions" }, [retry, leave]));
      // a short grace period so a mashed key doesn't instantly retry
      later(() => {
        resultKeys = (code) => {
          if (PRESS_KEYS.has(code)) intro();
          else if (code === "Backspace") done(false);
        };
      }, 450);
    }
    wrap.append(card);
  };

  const onKey = (code: string, down: boolean) => {
    if (down && resultKeys) resultKeys(code);
  };
  const onAction = () => resultKeys?.("Space");
  uiEvents.on("minigameKey", onKey);
  uiEvents.on("minigameAction", onAction);

  intro();

  return () => {
    if (disposed) return;
    disposed = true;
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
    uiEvents.off("minigameKey", onKey);
    uiEvents.off("minigameAction", onAction);
    stopGame();
    wrap.remove();
  };
}
