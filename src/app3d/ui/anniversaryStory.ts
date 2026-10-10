// Anniversary story arc (Oct 11 only): Mama's visit, the fight with Moomoo,
// realising, the Heart Boss fought together, and "I adore you". Plays as a
// single full-screen overlay after the opening card, before the world.
import { el, button, prefersReducedMotion, type Disposer } from "./dom";
import type { UIContext } from "./context";

type Speaker = "juju" | "moomoo" | "mama" | "narrator";
type Line = { who: Speaker; text: string };

const FACES: Record<Speaker, { emoji: string; name: string }> = {
  juju: { emoji: "👧🏻", name: "Juju" },
  moomoo: { emoji: "🧔🏻", name: "Moomoo" },
  mama: { emoji: "👩🏻‍🦱", name: "Mama" },
  narrator: { emoji: "✨", name: "" },
};

const ACT1: Line[] = [
  { who: "juju", text: "I'm going to visit Mama today 🏠" },
  { who: "moomoo", text: "Okay, have fun! 👍" },
  { who: "narrator", text: "(he's completely oblivious)" },
  { who: "juju", text: "…goes to Mama's house alone." },
  { who: "mama", text: "Where is Mustafa? Why didn't he come with you?" },
  { who: "juju", text: "He… didn't offer." },
  { who: "mama", text: "Hmm." },
  { who: "narrator", text: "Time passes… Juju comes home." },
];

const ACT3: Line[] = [
  { who: "moomoo", text: "Wait… did you want me to come?" },
  { who: "juju", text: "…" },
  { who: "moomoo", text: "I didn't know I could! I thought you wanted time with Mama alone!" },
  { who: "juju", text: "You could have just ASKED, Mustafa." },
  { who: "moomoo", text: "You're right. I'm sorry. I'm an idiot." },
  { who: "juju", text: "(softens) …Yes. You are." },
  { who: "moomoo", text: "Can I make it up to you?" },
  { who: "juju", text: "You have until midnight." },
];

type Fighter = { who: Speaker; moves: string[] };
type Battle = {
  title: string;
  heroes: Fighter[];
  boss: { emoji: string; name: string; hp: number; moves: string[] };
};

const FIGHT: Battle = {
  title: "Act 2 — The Fight",
  heroes: [{ who: "juju", moves: ["The Look 👀", "The Silence 😶", "You KNEW I wanted you there"] }],
  boss: { emoji: "🙄", name: "🙄 Moomoo (being dumb)", hp: 100, moves: ["Forgot to offer 🤦", "Was watching YouTube", "Said 'it's fine'"] },
};

const HEART: Battle = {
  title: "Act 4 — The Heart Boss",
  heroes: [
    { who: "juju", moves: ["Fine, I forgive you 💕", "I know you're trying", "Hug 🤗"] },
    { who: "moomoo", moves: ["I'm sorry 🌹", "I'll always come next time", "I adore you ✨"] },
  ],
  boss: { emoji: "💔", name: "💔 The Cold Shoulder", hp: 120, moves: ["Grudge", "Lingering Hurt", "What if he does it again"] },
};

const SEEN_KEY = "olw-anniv-story-seen";

export function playAnniversaryStory(ctx: UIContext, parent: Disposer, onDone: () => void) {
  const md = parent.child();
  const fast = prefersReducedMotion();
  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    /* storage unavailable */
  }
  ctx.lock();

  const stage = el("div", { class: "olw-story-stage" });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    root.classList.remove("olw-anniv--on");
    md.timeout(() => {
      md.dispose();
      ctx.unlockIfIdle();
      onDone();
    }, fast ? 0 : 600);
  };
  const skip = button(md, seen ? "Skip story ⏭" : "Skip ⏭", "olw-story-skip", () => finish());
  const root = md.node(
    el("div", { class: "olw-anniv olw-story", attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Our anniversary story" } }, [skip, stage]),
  );
  ctx.layer.append(root);
  requestAnimationFrame(() => root.classList.add("olw-anniv--on"));

  // Enter advances the current "Next" button, if any.
  let primary: HTMLButtonElement | null = null;
  md.listen(window, "keydown", (e) => {
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (!primary) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      primary?.click();
    } else if (e.code === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      finish();
    }
  }, { capture: true });

  /** Replace the stage contents with a fade. */
  const show = (sd: Disposer, nodes: Node[]) => {
    stage.replaceChildren(...nodes);
    stage.classList.remove("olw-story-in");
    void stage.offsetWidth;
    stage.classList.add("olw-story-in");
    void sd;
  };

  const heartBreak = (label: string, next: () => void) => {
    const sd = md.child();
    primary = null;
    show(sd, [el("div", { class: "olw-story-interlude" }, [el("div", { class: "olw-story-bigheart", text: "💗" }), el("p", { class: "olw-story-act", text: label })])]);
    sd.timeout(() => {
      sd.dispose();
      next();
    }, fast ? 600 : 2200);
  };

  const dialogue = (lines: Line[], next: () => void) => {
    let i = 0;
    const sd = md.child();
    const face = el("div", { class: "olw-story-face" });
    const name = el("p", { class: "olw-story-name" });
    const text = el("p", { class: "olw-story-text" });
    const nextBtn = button(sd, "Next →", "olw-btn olw-anniv-cta", () => {
      i++;
      if (i >= lines.length) {
        sd.dispose();
        next();
      } else render();
    });
    const card = el("div", { class: "olw-story-card" }, [face, el("div", { class: "olw-story-body" }, [name, text, nextBtn])]);
    const render = () => {
      const l = lines[i]!;
      const f = FACES[l.who];
      face.textContent = f.emoji;
      name.textContent = f.name;
      text.textContent = l.text;
      card.className = `olw-story-card olw-story-card--${l.who}`;
      card.classList.remove("olw-story-pop");
      void card.offsetWidth;
      card.classList.add("olw-story-pop");
    };
    show(sd, [card]);
    render();
    primary = nextBtn;
    nextBtn.focus({ preventScroll: true });
  };

  const battle = (b: Battle, next: () => void) => {
    const sd = md.child();
    let bossHp = b.boss.hp;
    let heroHp = 100;
    let turn = 0;
    let busy = false;
    const bar = (cls: string) => el("div", { class: `olw-story-hp ${cls}` }, [el("div", { class: "olw-story-hp-fill" })]);
    const heroBar = bar("olw-story-hp--hero");
    const bossBar = bar("olw-story-hp--boss");
    const setBar = (b2: HTMLElement, pct: number) => {
      (b2.firstChild as HTMLElement).style.width = `${Math.max(0, pct)}%`;
    };
    const heroFace = el("div", { class: "olw-story-fighter-face" });
    const heroName = el("p", { class: "olw-story-name" });
    const bossFace = el("div", { class: "olw-story-fighter-face olw-story-boss-face", text: b.boss.emoji });
    const flash = el("div", { class: "olw-story-flash", attrs: { "aria-live": "polite" } });
    const moves = el("div", { class: "olw-story-moves" });

    const renderTurn = () => {
      const hero = b.heroes[turn % b.heroes.length]!;
      heroFace.textContent = b.heroes.length > 1 ? b.heroes.map((h) => FACES[h.who].emoji).join("") : FACES[hero.who].emoji;
      heroName.textContent = b.heroes.length > 1 ? `${FACES[hero.who].name}'s turn` : FACES[hero.who].name;
      moves.replaceChildren(
        ...hero.moves.map((m) =>
          button(sd, m, "olw-story-move", () => attack(m)),
        ),
      );
      primary = null;
      (moves.firstChild as HTMLButtonElement | null)?.focus({ preventScroll: true });
    };

    const say = (msg: string, cls: string) => {
      flash.textContent = msg;
      flash.className = `olw-story-flash ${cls}`;
      void flash.offsetWidth;
      flash.classList.add("olw-story-flash--on");
    };

    const attack = (move: string) => {
      if (busy) return;
      busy = true;
      const dmg = 18 + Math.floor(Math.random() * 10);
      bossHp -= dmg;
      setBar(bossBar, (bossHp / b.boss.hp) * 100);
      bossFace.classList.remove("olw-story-hit");
      void bossFace.offsetWidth;
      bossFace.classList.add("olw-story-hit");
      say(`${move}! −${dmg}`, "olw-story-flash--hero");
      if (bossHp <= 0) {
        sd.timeout(() => {
          if (b === HEART) bossFace.textContent = "❤️";
          bossFace.classList.add("olw-story-healed");
          say(b === HEART ? "The heart is whole again 💖" : "Moomoo has been defeated 😵", "olw-story-flash--win");
          sd.timeout(() => {
            sd.dispose();
            next();
          }, fast ? 800 : 2400);
        }, fast ? 200 : 900);
        return;
      }
      sd.timeout(() => {
        const counter = b.boss.moves[Math.floor(Math.random() * b.boss.moves.length)]!;
        heroHp = Math.max(25, heroHp - (8 + Math.floor(Math.random() * 8)));
        setBar(heroBar, heroHp);
        root.classList.remove("olw-story-shake");
        void root.offsetWidth;
        root.classList.add("olw-story-shake");
        say(`${b.boss.emoji} ${counter}!`, "olw-story-flash--boss");
        sd.timeout(() => {
          turn++;
          busy = false;
          renderTurn();
        }, fast ? 300 : 1100);
      }, fast ? 300 : 1100);
    };

    show(sd, [
      el("div", { class: `olw-story-battle${b === HEART ? " olw-story-battle--heart" : ""}` }, [
        el("p", { class: "olw-story-act", text: b.title }),
        el("div", { class: "olw-story-arena" }, [
          el("div", { class: "olw-story-side" }, [heroFace, heroName, heroBar]),
          el("div", { class: "olw-story-vs", text: "VS" }),
          el("div", { class: "olw-story-side" }, [bossFace, el("p", { class: "olw-story-name", text: b.boss.name }), bossBar]),
        ]),
        flash,
        moves,
      ]),
    ]);
    setBar(heroBar, 100);
    setBar(bossBar, 100);
    renderTurn();
  };

  const victory = () => {
    const sd = md.child();
    const sparkles = el("div", { class: "olw-story-sparkles", attrs: { "aria-hidden": "true" } });
    for (let i = 0; i < 24; i++) {
      const s = el("span", { class: "olw-story-sparkle", text: i % 2 ? "✨" : "💕" });
      s.style.left = `${(i * 41 + 3) % 97}%`;
      s.style.animationDelay = `${((i * 0.37) % 4).toFixed(2)}s`;
      sparkles.append(s);
    }
    const cta = button(sd, "Enter our world 🌹", "olw-btn olw-anniv-cta olw-story-late", () => finish());
    show(sd, [
      el("div", { class: "olw-story-victory" }, [
        sparkles,
        el("div", { class: "olw-story-bigheart olw-story-glow", text: "❤️" }),
        el("h1", { class: "olw-story-adore", text: "I adore you." }),
        el("p", { class: "olw-story-signoff", text: "Happy Anniversary, Jasmin. — Moomoo 💕" }),
        cta,
      ]),
    ]);
    primary = cta;
    sd.timeout(() => cta.focus({ preventScroll: true }), fast ? 0 : 2500);
  };

  heartBreak("Act 1 — Going to Mama's Alone", () =>
    dialogue(ACT1, () =>
      heartBreak("Juju comes home upset… 😤", () =>
        battle(FIGHT, () =>
          heartBreak("Act 3 — Realising", () =>
            dialogue(ACT3, () =>
              heartBreak("Something cold is still between them… 💔", () =>
                battle(HEART, () => heartBreak("Act 5", victory)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
