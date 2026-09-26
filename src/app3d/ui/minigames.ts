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

/** 3-2-1 countdown before play (1s per number). */
const COUNTDOWN_S = 3;
/** How long the win / lose banner shows before the game settles. */
const RESULT_MS = 1200;
const CONFETTI_COLOURS = ["#e46d94", "#f4a6c0", "#e6b65c", "#7be0a3", "#5b8fd6", "#a98bc7", "#ffd166"];

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

/** Set a progress bar's width; it pulses/glows once it's in the last 20%. */
function setBar(node: HTMLElement, frac: number) {
  const f = clamp(frac, 0, 1);
  node.style.width = `${f * 100}%`;
  node.classList.toggle("is-near", f >= 0.8);
}

/** A burst of 20 confetti bits that fly up, spin, and remove themselves. */
function confetti(host: HTMLElement) {
  const box = el("div", { class: "olw-mg-confetti", attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < 20; i++) {
    const bit = el("span", { class: "olw-mg-confetti-bit" });
    bit.style.left = `${rand(20, 80)}%`;
    bit.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
    bit.style.setProperty("--dx", `${rand(-140, 140).toFixed(0)}px`);
    bit.style.setProperty("--dy", `${rand(-260, -140).toFixed(0)}px`);
    bit.style.setProperty("--rot", `${rand(-720, 720).toFixed(0)}deg`);
    bit.style.animationDelay = `${rand(0, 120).toFixed(0)}ms`;
    if (i % 3 === 0) bit.style.borderRadius = "50%";
    box.append(bit);
  }
  host.append(box);
  window.setTimeout(() => box.remove(), 1500);
}

// ---- tiny Web Audio synth (no asset files) ---------------------------------

let audioCtx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Short 80 Hz sine thump (~50 ms) — a footstep. */
function footstep() {
  const ctx = audio();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {
    /* audio is a nicety */
  }
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
  /** The main "fast" button; keyboard presses pop it too. */
  private primary: HTMLButtonElement | null = null;

  constructor(
    readonly spec: ExtSpec,
    root: HTMLElement,
    private readonly end: (ok: boolean, msg: string) => void,
    /** 1 on the first try, 2+ after "Try again". */
    readonly attempt = 1,
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
    const go = () => {
      if (this.primary) pulse(this.primary, "is-tap");
      fn();
    };
    this.onKey((code, down, repeat) => {
      if (down && !repeat && PRESS_KEYS.has(code)) go();
    });
    this.onAction(go);
  }

  /** Satisfying press feedback: scale down while pressed, spring back on release. */
  pressFx(b: HTMLElement) {
    b.classList.add("olw-mg-tap");
    const off = () => b.classList.remove("is-pressed");
    this.listen(b, "pointerdown", () => b.classList.add("is-pressed"));
    this.listen(b, "pointerup", off);
    this.listen(b, "pointerleave", off);
    this.listen(b, "pointercancel", off);
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
    target.classList.add("olw-mg-tap");
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
    this.pressFx(b);
    if (fast) {
      if (!this.primary && cls.includes("olw-btn--big")) this.primary = b;
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
  // Perfect = 18% of the bar (gold), near-miss band = 30% (amber), rest = miss (red).
  const PERFECT = 0.18;
  const NEAR = 0.3;
  let hits = 0;
  let misses = 0;
  let score = 0;
  let mult = 1;
  let pos = 0;
  let dir = 1;
  let lock = 0;
  let speed = 0.62 + 0.14 * g.difficulty;
  let center = rand(0.2, 0.8);

  const near = el("div", { class: "olw-mg-zone olw-mg-zone--near" });
  const perfect = el("div", { class: "olw-mg-zone olw-mg-zone--perfect" });
  const marker = el("div", { class: "olw-mg-marker olw-mg-marker--trail" });
  const track = el("div", { class: "olw-mg-track olw-mg-track--big olw-mg-track--timing" }, [near, perfect, marker]);
  const burst = el("div", { class: "olw-mg-perfect", attrs: { "aria-hidden": "true" } });
  const place = () => {
    near.style.left = `${(center - NEAR / 2) * 100}%`;
    near.style.width = `${NEAR * 100}%`;
    perfect.style.left = `${(center - PERFECT / 2) * 100}%`;
    perfect.style.width = `${PERFECT * 100}%`;
  };
  place();
  g.stage.append(el("div", { class: "olw-mg-pad olw-mg-timing" }, [track, burst]));
  const hud = () =>
    g.hud([
      ["Hits", `${hits}/${need}`],
      ["Score", `${score}`],
      ["Combo", `×${mult}`],
      ["Misses", `${misses}/${maxMiss}`],
    ]);
  hud();
  g.say("Tap when the marker is in the gold. Amber still counts.");
  const flash = (text: string, cls: string) => {
    burst.textContent = text;
    burst.className = `olw-mg-perfect ${cls}`;
    pulse(burst, "is-show");
  };
  const act = () => {
    if (lock > 0) return;
    lock = 0.18;
    const off = Math.abs(pos - center);
    if (off <= NEAR / 2 + 0.01) {
      const isPerfect = off <= PERFECT / 2 + 0.01;
      hits++;
      if (isPerfect) {
        score += 100 * mult;
        flash(`PERFECT! ×${mult}`, "is-gold");
        mult = Math.min(mult + 1, 5);
        pulse(track, "is-perfect");
      } else {
        score += 50;
        mult = 1;
        flash("Good", "is-amber");
        pulse(track, "is-good");
      }
      hud();
      if (hits >= need) return g.win(isPerfect ? "Perfect timing!" : "Right on time!");
      g.say(isPerfect ? ["Golden!", "Spot on!", "Flawless."][hits % 3] : "Close enough — aim for the gold.", "good");
      speed += 0.1;
      let next = center;
      while (Math.abs(next - center) < 0.2) next = rand(0.18, 0.82);
      center = next;
      place();
    } else {
      misses++;
      mult = 1;
      hud();
      flash("Miss", "is-red");
      pulse(track, "is-bad");
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
    marker.style.left = `${pos * 100}%`;
    marker.classList.toggle("is-left", dir < 0);
  });
}

/** Rhythm climb: steps scroll up; tap as each one crosses the foot line. */
function stairsGame(g: Game) {
  const need = 8;
  const maxMiss = 3;
  const LINE = 0.72;
  /** Forgiveness: a tap within 150 ms of a step crossing the line counts. */
  const GRACE_S = 0.15;
  let hits = 0;
  let misses = 0;
  let lock = 0;
  let spawnIn = 0.25;
  let speed = 0.4 + 0.06 * g.difficulty;
  // steady beat so the rhythm guide means something
  const beat = 0.92 - 0.06 * g.difficulty;
  const steps: { y: number; node: HTMLDivElement; live: boolean }[] = [];
  const win = () => speed * GRACE_S;

  const beatDot = el("div", { class: "olw-mg-beat", attrs: { "aria-hidden": "true" } }, [el("span", { class: "olw-mg-beat-dot" })]);
  const lane = el("div", { class: "olw-mg-stairs-lane" }, [el("div", { class: "olw-mg-stairs-line" }), beatDot]);
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

  const miss = (text: string, step?: HTMLDivElement) => {
    misses++;
    hud();
    if (step) pulse(step, "is-wrong");
    else pulse(lane, "is-bad");
    if (misses >= maxMiss) return g.lose("Three stumbles. The stairs win this round.");
    g.say(text, "bad");
  };
  const act = () => {
    if (lock > 0) return;
    lock = 0.12;
    let best: (typeof steps)[number] | undefined;
    let nearest: (typeof steps)[number] | undefined;
    for (const s of steps) {
      if (!s.live) continue;
      const d = Math.abs(s.y - LINE);
      if (!nearest || d < Math.abs(nearest.y - LINE)) nearest = s;
      if (d <= win() && (!best || d < Math.abs(best.y - LINE))) best = s;
    }
    if (!best) return miss("Too early — wait for the step.", nearest?.node);
    best.live = false;
    best.node.classList.add("is-hit");
    pulse(best.node, "is-lit");
    footstep();
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
      spawnIn += beat;
    }
    let closest = Infinity;
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      const prev = s.y;
      s.y += speed * dt;
      s.node.style.bottom = `${s.y * 100}%`;
      if (s.live) {
        closest = Math.min(closest, Math.abs(s.y - LINE));
        // the rhythm guide beats exactly as a step meets the line
        if (prev < LINE && s.y >= LINE) pulse(beatDot, "is-beat");
      }
      if (s.live && s.y > LINE + win()) {
        s.live = false;
        s.node.classList.add("is-miss");
        miss("Missed a step!", s.node);
        if (g.over) return;
      }
      if (s.y > 1.1) {
        s.node.remove();
        steps.splice(i, 1);
      }
    }
    // the guide swells as the next step approaches the line
    beatDot.style.setProperty("--near", `${clamp(1 - closest / 0.25, 0, 1).toFixed(3)}`);
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

const COFFEE_BITS = {
  cup: { e: "🥤", n: "Cup" },
  espresso: { e: "☕", n: "Espresso" },
  milk: { e: "🥛", n: "Milk" },
  sugar: { e: "🍬", n: "Sugar" },
  cinnamon: { e: "🌰", n: "Cinnamon" },
  ice: { e: "🧊", n: "Ice" },
  lid: { e: "🔘", n: "Lid" },
} as const;
type CoffeeBit = keyof typeof COFFEE_BITS;
/** Ingredients with their own tap button (espresso is pulled with the hold button). */
const COFFEE_SHELF: CoffeeBit[] = ["cup", "milk", "sugar", "cinnamon", "ice", "lid"];
const COFFEE_RECIPES: { name: string; steps: CoffeeBit[] }[] = [
  { name: "Latte", steps: ["cup", "espresso", "milk", "lid"] },
  { name: "Sweet latte", steps: ["cup", "espresso", "milk", "sugar", "lid"] },
  { name: "Iced latte", steps: ["cup", "ice", "espresso", "milk", "lid"] },
  { name: "Cinnamon cappuccino", steps: ["cup", "espresso", "cinnamon", "milk", "lid"] },
];

/** Espresso bar: build each drink in recipe order; pull the espresso shot into the green band. */
function coffeeGame(g: Game) {
  const text = `${g.spec.title} ${g.spec.hint}`.toLowerCase();
  const need = /\btwo\b|\bpair\b|yours too|2 cups/.test(text) ? 2 : 1;
  const maxLives = 3;
  const rate = 0.4 + 0.05 * g.difficulty;
  // at least 8 seconds per step; more on easier settings
  const stepTime = 8 + (3 - g.difficulty);
  const relaxed = g.attempt <= 1; // no rush penalty on the first attempt
  let lives = maxLives;
  let cups = 0;
  let recipe = COFFEE_RECIPES[0];
  let step = 0;
  let timeLeft = stepTime;
  let fill = 0;
  let pouring = false;
  let busy = false;
  let lo = 0;
  let hi = 0;

  // -- the counter: machine, stream, cup (+ lid and steam)
  const liquid = el("div", { class: "olw-mg-liquid" });
  const band = el("div", { class: "olw-mg-band" });
  const stream = el("div", { class: "olw-mg-stream" });
  const extras = el("div", { class: "olw-mg-cup-extras" });
  const lid = el("div", { class: "olw-mg-lid" });
  const steam = el("div", { class: "olw-mg-steam", attrs: { "aria-hidden": "true" } }, [el("span"), el("span"), el("span")]);
  const cup = el("div", { class: "olw-mg-cup" }, [band, liquid, extras, el("div", { class: "olw-mg-cup-handle" }), lid, steam]);
  const done = el("div", { class: "olw-mg-cups-done" });
  const counter = el("div", { class: "olw-mg-coffee-bar" }, [el("div", { class: "olw-mg-machine", text: "☕" }), stream, cup, done]);

  // -- the recipe card
  const recipeTitle = el("p", { class: "olw-mg-recipe-title" });
  const recipeList = el("ol", { class: "olw-mg-recipe-list" });
  const stepTimer = el("div", { class: "olw-mg-step-timer-fill" });
  const card = el("div", { class: "olw-mg-recipe" }, [recipeTitle, recipeList, el("div", { class: "olw-mg-step-timer" }, [stepTimer])]);
  g.stage.append(el("div", { class: "olw-mg-coffee" }, [counter, card]));

  let rows: HTMLLIElement[] = [];
  const renderRecipe = () => {
    recipeTitle.textContent = need > 1 ? `${recipe.name} · cup ${cups + 1}/${need}` : recipe.name;
    rows = recipe.steps.map((s, i) =>
      el("li", { class: "olw-mg-recipe-step" }, [
        el("span", { class: "olw-mg-recipe-e", text: COFFEE_BITS[s].e }),
        el("span", { class: "olw-mg-recipe-n", text: s === "espresso" ? "Espresso (hold)" : `${COFFEE_SHELF.indexOf(s) + 1}. ${COFFEE_BITS[s].n}` }),
        el("span", { class: "olw-mg-recipe-check", text: "✓" }),
      ]),
    );
    rows.forEach((r, i) => r.classList.toggle("is-done", i < step));
    recipeList.replaceChildren(...rows);
    markActive();
  };
  const markActive = () => rows.forEach((r, i) => r.classList.toggle("is-active", i === step));

  const hud = () =>
    g.hud([
      ["Cups", `${cups}/${need}`],
      ["Mistakes", hearts(lives, maxLives)],
      ["Step", `${Math.min(step + 1, recipe.steps.length)}/${recipe.steps.length}`],
    ]);
  const renderTimer = () => {
    const f = timeLeft / stepTime;
    stepTimer.style.width = `${clamp(f, 0, 1) * 100}%`;
    stepTimer.classList.toggle("is-low", f <= 0.25);
  };

  const newCup = () => {
    recipe = COFFEE_RECIPES[randInt(0, COFFEE_RECIPES.length - 1)];
    step = 0;
    fill = 0;
    timeLeft = stepTime;
    busy = false;
    liquid.style.height = "0%";
    liquid.classList.remove("has-milk");
    extras.replaceChildren();
    cup.classList.remove("is-good", "is-spill", "is-placed");
    lid.classList.remove("is-on");
    steam.classList.remove("is-on");
    band.classList.remove("is-on");
    renderRecipe();
    hud();
    renderTimer();
    prompt();
  };
  const prompt = () => {
    const s = recipe.steps[step];
    if (!s) return;
    g.say(s === "espresso" ? "Hold to pull the espresso — release in the green." : `Next: ${COFFEE_BITS[s].n}.`);
    if (s === "espresso") {
      fill = 0;
      liquid.style.height = "0%";
      lo = rand(0.46, 0.58);
      hi = lo + 0.16 - 0.02 * (g.difficulty - 1);
      band.style.bottom = `${lo * 100}%`;
      band.style.height = `${(hi - lo) * 100}%`;
      band.classList.add("is-on");
    }
  };

  const mistake = (why: string, spill = false) => {
    lives--;
    hud();
    const row = rows[step];
    if (row) pulse(row, "is-wrong");
    if (spill) pulse(cup, "is-spill");
    if (lives <= 0) return g.lose(`${why} The barista takes over.`);
    g.say(why, "bad");
  };

  const advance = () => {
    const row = rows[step];
    if (row) row.classList.add("is-done");
    step++;
    timeLeft = stepTime;
    renderTimer();
    hud();
    if (step < recipe.steps.length) {
      markActive();
      prompt();
      return;
    }
    // drink complete
    markActive();
    busy = true;
    cups++;
    cup.classList.add("is-good");
    done.append(el("span", { text: "☕" }));
    hud();
    if (cups >= need) {
      g.say(need > 1 ? "Two perfect coffees. Two sugars each." : "Lid on, steam rising. Perfect.", "good");
      g.after(900, () => g.win(need > 1 ? "Two perfect coffees. Two sugars each." : "A perfect cup."));
    } else {
      g.say("One down! Next order…", "good");
      g.after(1200, newCup);
    }
  };

  const applyVisual = (s: CoffeeBit) => {
    if (s === "cup") cup.classList.add("is-placed");
    else if (s === "milk") {
      liquid.classList.add("has-milk");
      liquid.style.height = `${clamp(Math.max(fill, 0.3) + 0.14, 0, 0.95) * 100}%`;
    } else if (s === "lid") {
      lid.classList.add("is-on");
      g.after(380, () => steam.classList.add("is-on"));
    } else {
      const bit = el("span", { class: "olw-mg-cup-bit", text: COFFEE_BITS[s].e });
      extras.append(bit);
    }
  };

  const useIngredient = (s: CoffeeBit) => {
    if (busy || pouring) return;
    const want = recipe.steps[step];
    const btn = shelf[COFFEE_SHELF.indexOf(s)];
    if (s !== want) {
      if (btn) pulse(btn, "is-shake");
      return mistake(want === "espresso" ? "Wrong order — the espresso comes next." : `Not yet — ${COFFEE_BITS[want].n} comes next.`);
    }
    if (btn) pulse(btn, "is-right");
    applyVisual(s);
    advance();
  };

  const shelf = COFFEE_SHELF.map((s, i) => {
    const b = g.button("", "olw-mg-ingredient", () => useIngredient(s));
    b.append(el("span", { class: "olw-mg-ingredient-e", text: COFFEE_BITS[s].e }), el("span", { class: "olw-mg-ingredient-n", text: `${i + 1} ${COFFEE_BITS[s].n}` }));
    b.setAttribute("aria-label", COFFEE_BITS[s].n);
    return b;
  });

  const judgePour = (spilled: boolean) => {
    pouring = false;
    stream.classList.remove("is-on");
    if (fill < 0.04 && !spilled) return; // accidental tap: ignore
    if (!spilled && fill >= lo && fill <= hi) {
      band.classList.remove("is-on");
      advance();
      return;
    }
    const why = spilled || fill > hi ? "Overpoured — splash!" : "Too short a shot.";
    mistake(`${why} Pull it again.`, spilled || fill > hi);
    if (g.over) return;
    busy = true;
    g.after(700, () => {
      busy = false;
      fill = 0;
      liquid.style.height = "0%";
    });
  };
  const pourBtn = el("button", { class: "olw-btn olw-btn--big olw-mg-hold", text: "Hold: pull espresso", attrs: { type: "button" } });
  const h = g.hold(
    pourBtn,
    () => {
      if (busy) return;
      if (recipe.steps[step] !== "espresso") {
        h.drop();
        mistake(`Not yet — ${COFFEE_BITS[recipe.steps[step]].n} comes first.`);
        return;
      }
      pouring = true;
      stream.classList.add("is-on");
    },
    () => {
      if (pouring) judgePour(false);
    },
  );
  g.controls.append(el("div", { class: "olw-mg-ingredients" }, shelf), pourBtn);

  g.onKey((code, down) => {
    if (!down) return;
    const n = digitOf(code);
    if (n >= 1 && n <= COFFEE_SHELF.length) useIngredient(COFFEE_SHELF[n - 1]);
  });

  newCup();
  if (need > 1) g.say("Two orders. Follow each recipe — tap ingredients, hold for espresso.");
  g.loop((dt) => {
    if (pouring) {
      fill += rate * dt * (0.8 + fill * 0.5);
      liquid.style.height = `${clamp(fill, 0, 1) * 100}%`;
      if (fill >= 1.02) {
        h.drop();
        judgePour(true);
      }
      return;
    }
    if (busy) return;
    timeLeft -= dt;
    renderTimer();
    if (timeLeft <= 0) {
      timeLeft = stepTime;
      if (relaxed) {
        g.say(`No rush — ${COFFEE_BITS[recipe.steps[step]].n} is next.`);
        const row = rows[step];
        if (row) pulse(row, "is-nudge");
      } else mistake("Too slow — the customer is tapping the counter.");
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
  let complete = false;

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
    if (complete) return;
    setCursor(k);
    const want = needed.get(k) ?? 0;
    if (count(k) >= want) {
      time -= 2;
      pulse(options[k], "is-wrong");
      g.say(want ? `Enough ${FLOWERS[k].n}s already. −2s` : `No ${FLOWERS[k].n}s on the card. −2s`, "bad");
      hud();
      return;
    }
    const slot = placed.indexOf(null);
    if (slot < 0) return;
    placed[slot] = k;
    render();
    pulse(options[k], "is-right");
    pulse(slotEls[slot], "is-spring");
    if (filled() >= SLOTS) {
      // a little wave from the whole bouquet before the win card
      complete = true;
      slotEls.forEach((s, i) => {
        s.style.animationDelay = `${i * 70}ms`;
        pulse(s, "is-wave");
      });
      g.say("Perfect bouquet!", "good");
      g.after(800, () => g.win("A bouquet Mama will love."));
      return;
    }
    g.say(`${FLOWERS[k].e} in!`, "good");
  };
  const remove = (i: number) => {
    if (complete || placed[i] === null) return;
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
    if (complete) return;
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
  const subject = el("div", { class: "olw-mg-photo-subject" }, [
    el("span", { class: "olw-mg-photo-landmark", text: landmark }),
    el("span", { class: "olw-mg-photo-couple", text: "👫" }),
  ]);
  const frame = el(
    "div",
    { class: "olw-mg-photo-frame" },
    ["tl", "tr", "bl", "br"].map((c) => el("span", { class: `olw-mg-photo-corner is-${c}` })),
  );
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
    // focus assist: brackets pull in while the subject is centred
    frame.classList.toggle("is-focus", Math.abs(x - 50) <= 8);
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
  // best of 3: first to 2 round wins; each lost round costs half a health bar
  const ROUNDS_TO_WIN = 2;
  const vs = /\bvs\.?\s+(.+)$/i.exec(g.spec.title);
  const rivalName = vs ? vs[1].trim() : "Rival";
  const sibling = /^(jad|shan)$/i.test(rivalName);

  const fighter = (name: string, face: string, cls: string) => {
    const hp = el("div", { class: `olw-mg-hp-fill ${cls}` });
    const hpBar = el("div", { class: "olw-mg-hp" }, [hp]);
    const avatar = el("div", { class: "olw-mg-fighter-avatar", text: face });
    const wrap = el("div", { class: `olw-mg-fighter ${cls}` }, [avatar, el("div", { class: "olw-mg-fighter-name", text: name }), hpBar]);
    return { wrap, hp, hpBar, avatar };
  };
  const juju = fighter("Juju", "👧", "is-you");
  const foe = fighter(rivalName, sibling ? "🧒" : "😼", "is-rival");
  const prompt = el("div", { class: "olw-mg-duel-prompt", text: "…" });
  const youBar = el("div", { class: "olw-mg-duel-fill" });
  const rivalBar = el("div", { class: "olw-mg-duel-fill olw-mg-duel-fill--rival" });
  g.stage.append(
    el("div", { class: "olw-mg-fighters" }, [juju.wrap, el("span", { class: "olw-mg-vs", text: "VS" }), foe.wrap]),
    el("p", { class: "olw-mg-duel-rule", text: `Tap the moment you see ${target}. Anything else is a trick!` }),
    prompt,
    el("div", { class: "olw-mg-duel-bars" }, [
      el("span", { text: "Juju" }),
      el("div", { class: "olw-mg-duel-bar" }, [youBar]),
      el("span", { text: rivalName }),
      el("div", { class: "olw-mg-duel-bar" }, [rivalBar]),
    ]),
  );
  const renderHp = () => {
    juju.hp.style.width = `${clamp(1 - rival / ROUNDS_TO_WIN, 0, 1) * 100}%`;
    foe.hp.style.width = `${clamp(1 - you / ROUNDS_TO_WIN, 0, 1) * 100}%`;
  };
  renderHp();
  const hud = () => g.hud([["Round", `${Math.min(round, 3)}/3`], ["Juju", `${you}`], [rivalName, `${rival}`]]);

  const startRound = () => {
    round++;
    hud();
    phase = "wait";
    const my = ++token;
    setBar(youBar, 0);
    setBar(rivalBar, 0);
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
    renderHp();
    const winner = youWon ? juju : foe;
    const loser = youWon ? foe : juju;
    pulse(winner.hpBar, "is-glow");
    pulse(loser.hpBar, "is-shake");
    if (you >= ROUNDS_TO_WIN || rival >= ROUNDS_TO_WIN) {
      // final: the champion does a little victory wiggle before the card
      phase = "done";
      winner.avatar.classList.add("is-victory");
      g.say(youWon ? `Juju takes it ${you}–${rival}!` : `${rivalName} takes it ${rival}–${you}.`, youWon ? "good" : "bad");
      g.after(900, () => (youWon ? g.win(`You win ${you}–${rival}! ${msg}`) : g.lose(`${rivalName} wins ${rival}–${you}. ${msg}`)));
      return;
    }
    g.say(msg, youWon ? "good" : "bad");
    g.after(1100, startRound);
  };
  const tap = () => {
    if (phase === "wait") {
      prompt.classList.add("is-foul");
      endRound(false, "False start — that wasn't it!");
    } else if (phase === "go") {
      setBar(youBar, 1);
      endRound(true, `${Math.round(goElapsed * 1000)} ms. Lightning!`);
    }
  };
  g.press(tap);
  g.controls.append(g.button("Tap!", "olw-btn olw-btn--big", tap, true));
  g.loop((dt) => {
    if (phase !== "go") return;
    goElapsed += dt;
    setBar(rivalBar, goElapsed / rivalTime);
    if (goElapsed >= rivalTime) endRound(false, `Too slow — ${rivalName} got there first.`);
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
    setBar(fill, tot / budget);
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
    setBar(warmth, heat);
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
    setBar(tensionFill, 0);
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
    setBar(tensionFill, tension / maxTension);
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
  coffee: { icon: "☕", how: "Follow the recipe in order. Tap ingredients; hold to pull the espresso and release in the green. 3 mistakes allowed.", keys: "1–6 for ingredients, hold Space / Enter for espresso" },
  bouquet: { icon: "💐", how: "Fill 5 slots with exactly the flowers on the card. 20 seconds.", keys: "1–8, arrows + Enter, Backspace, or tap" },
  photo: { icon: "📸", how: "Capture when you're both inside the frame. 3 good shots from 5.", keys: "Space / Enter or tap" },
  showdown: { icon: "⚡", how: "Tap the instant the target appears — before the rival. Best of 3.", keys: "Space / Enter or tap" },
  shopping: { icon: "🛍️", how: "Pick the most joy you can without going over budget, then check out.", keys: "1–9 or arrows + Space, Enter to pay" },
  safe: { icon: "🔐", how: "Spin the dial, listen for the click, set 3 digits. 3 tries.", keys: "← → to spin, Enter to set" },
  lab: { icon: "🧪", how: "Repeat the flask sequence. It grows each round — 4 rounds.", keys: "1–4, arrows, or tap" },
  pitch: { icon: "📊", how: "Advance each slide while confidence is in the green. 5 slides.", keys: "Space / Enter or tap" },
  lockpick: { icon: "🗝️", how: "Hold for tension, release when the pick is on the green. 3 pins.", keys: "Hold Space / Enter or the button" },
  badge_photo: { icon: "🪪", how: "Choose the most professional pose for your badge.", keys: "1–4, arrows + Enter, or tap" },
  timing: { icon: "✨", how: "Tap when the marker is in the gold for a PERFECT (amber still counts). 3 misses and it's over.", keys: "Space / Enter or tap" },
};

// ---- runner ----------------------------------------------------------------

/**
 * Run a minigame inside `container`. Shows the intro with a 3-2-1 countdown,
 * then plays. Success shows "Nailed it!" + confetti for 1.2s, then calls
 * onDone(true); failure shows "So close!" for 1.2s, then offers a retry, and
 * leaving calls onDone(false). Returns a cleanup function.
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

  let attempt = 0;
  const intro = () => {
    stopGame();
    resultKeys = null;
    attempt++;
    const info = INFO[kind];
    const num = el("div", { class: "olw-mg-count-num", attrs: { "aria-live": "assertive" } });
    wrap.replaceChildren(
      el("div", { class: "olw-mg-intro" }, [
        el("div", { class: "olw-mg-intro-icon", text: info.icon }),
        el("p", { class: "olw-mg-intro-hint", text: spec.hint }),
        el("p", { class: "olw-mg-intro-how", text: info.how }),
        el("p", { class: "olw-mg-intro-keys", text: info.keys }),
      ]),
      el("div", { class: "olw-mg-countdown", attrs: { "aria-hidden": "false" } }, [num]),
    );
    // 3 - 2 - 1, one second each, then play
    const tick = (n: number) => {
      if (n <= 0) {
        wrap.replaceChildren();
        game = new Game(spec, wrap, finish, attempt);
        GAMES[kind](game);
        return;
      }
      num.textContent = `${n}`;
      pulse(num, "is-count");
      later(() => tick(n - 1), 1000);
    };
    tick(COUNTDOWN_S);
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
      el("div", { class: "olw-mg-result-icon", text: ok ? "✓" : "✗" }),
      el("p", { class: "olw-mg-result-title", text: ok ? "Nailed it!" : "So close!" }),
      el("p", { class: "olw-mg-result-msg", text: msg }),
    ]);
    wrap.append(card);
    if (ok) {
      confetti(wrap);
      later(() => done(true), RESULT_MS);
      return;
    }
    // hold the "So close!" beat, then offer a retry (a mashed key can't skip it)
    later(() => {
      const retry = el("button", { class: "olw-btn olw-btn--rose olw-mg-tap", text: "Try again", attrs: { type: "button" } });
      const leave = el("button", { class: "olw-btn olw-btn--ghost olw-mg-tap", text: "Leave", attrs: { type: "button" } });
      retry.addEventListener("click", intro);
      leave.addEventListener("click", () => done(false));
      card.append(el("div", { class: "olw-mg-result-actions" }, [retry, leave]));
      resultKeys = (code) => {
        if (PRESS_KEYS.has(code)) intro();
        else if (code === "Backspace") done(false);
      };
    }, RESULT_MS);
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
