// Story scenes for the Babylon build — DOM ports of the Phaser story scenes:
//
//   romance        RomanceScene       (romance_us / romance_future / romance_proposal /
//                                      wedding_planning_one / wedding_planning_two)
//   wedding        WeddingScene       (desert_wedding)
//   tigor          TigorMissionScene  (chapters 0-3) + TigorAirportScene (chapter 4)
//   heist          SisterHeistScene   (q_family_jewel_heist, house_lock → escape)
//   pirate         PirateVoyageScene  (pirate_voyage + great_white_boss)
//   questActivity  QuestActivityScene (apartment_1701 / chloe_thesis / nour_visit / fry_thief)
//
// Every scene is one self-contained modal ("story" kind). The quest hooks and
// save side effects are the ones the Phaser scenes used, so quest steps advance
// exactly as they did in 2D. Scenes that need a generic DOM minigame (lock pick,
// safe) close themselves, run it through the "minigame" event, and reopen on the
// same state afterwards (the ADNOC modal does the same).
//
// Entry: uiEvents.emit("storyScene", { scene, activity? }).
import { store } from "../../game/systems/store";
import { uiEvents, type MiniGameSpec } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import { NPCS } from "../../game/data/npcs";
import { deliverMessage } from "../../game/systems/phone";
import { TIGOR_ALL_NIGHT_TASKS, TIGOR_LEGAL_NAME, TIGOR_UAE_PHASES, TIGOR_VET_TASKS, type AllNighterAction } from "../../game/data/tigorMission";
import { button, el, prefersReducedMotion, type Disposer } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";

// ---------------------------------------------------------------------------
// public contract

export type StorySceneId = "romance" | "wedding" | "tigor" | "heist" | "pirate" | "questActivity";
export interface StoryRequest {
  scene: StorySceneId;
  /** romance chapter or quest-activity id */
  activity?: string;
}

export const ROMANCE_ACTIVITIES = ["romance_us", "romance_future", "romance_proposal", "wedding_planning_one", "wedding_planning_two"] as const;
type RomanceActivity = (typeof ROMANCE_ACTIVITIES)[number];
export const HEIST_HOUSE_TARGETS = ["house_lock", "enter_fadwa_house", "reach_fadwa_room", "drawer_lock", "family_safe", "escape_fadwa_house"];
export const QUEST_ACTIVITIES = ["apartment_1701", "chloe_thesis", "nour_visit", "fry_thief"] as const;
type QuestActivityId = (typeof QUEST_ACTIVITIES)[number];

/** Which story scene plays a quest step target (null = not a story step). */
export function storyRequestForStep(target: string | undefined): StoryRequest | null {
  if (!target) return null;
  if ((ROMANCE_ACTIVITIES as readonly string[]).includes(target)) return { scene: "romance", activity: target };
  if (target === "desert_wedding") return { scene: "wedding" };
  if (target === "retrieve_tigor_campaign") return { scene: "tigor" };
  if (target === "pirate_voyage" || target === "great_white_boss") return { scene: "pirate" };
  if (HEIST_HOUSE_TARGETS.includes(target)) return { scene: "heist" };
  if (target === "chloe_thesis") return { scene: "questActivity", activity: "chloe_thesis" };
  if (target === "nour_snacks") return { scene: "questActivity", activity: "nour_visit" };
  if (target === "fry_thief") return { scene: "questActivity", activity: "fry_thief" };
  if (target === "apartment_1701_package") return { scene: "questActivity", activity: "apartment_1701" };
  return null;
}

// ---------------------------------------------------------------------------
// shell + widgets

interface Env {
  ctx: UIContext;
  host: ModalHost;
  travelTo: (id: string) => void;
}

interface Shell {
  md: Disposer;
  root: HTMLElement;
  close(): void;
  /** Replace the scene content; `vd` lives until the next view / close. */
  view(render: (vd: Disposer) => (Node | null | false | undefined)[], opts?: { keepScroll?: boolean }): void;
  /** Transient banner over the scene. */
  flash(text: string, tone?: "good" | "bad" | "info"): void;
}

function openShell(env: Env, o: { title: string; subtitle?: string; tone: string; build: (sh: Shell) => void; onClose?: () => void }) {
  env.host.open({
    kind: "story",
    title: o.title,
    subtitle: o.subtitle,
    className: `olw-story-modal olw-story-modal--${o.tone}`,
    // × / Esc step away; quest progress lives in the quest steps + save flags
    dismissable: true,
    onClose: o.onClose,
    body: (md, close) => {
      const root = el("div", { class: `olw-story olw-story--${o.tone}` });
      const stage = el("div", { class: "olw-story-stage" });
      const banner = el("div", { class: "olw-story-flash olw-hidden", attrs: { role: "status", "aria-live": "polite" } });
      root.append(stage, banner);
      let vd: Disposer | null = null;
      let clearFlash: (() => void) | null = null;
      const sh: Shell = {
        md,
        root,
        close,
        view(render, opts) {
          vd?.dispose();
          vd = md.child();
          const body = root.parentElement;
          const keep = opts?.keepScroll ? (body?.scrollTop ?? 0) : 0;
          const nodes = render(vd).filter((n): n is Node => !!n);
          stage.replaceChildren(...nodes);
          if (body) body.scrollTop = keep;
        },
        flash(text, tone = "info") {
          clearFlash?.();
          banner.textContent = text;
          banner.className = `olw-story-flash olw-story-flash--${tone}`;
          clearFlash = md.timeout(() => banner.classList.add("olw-hidden"), 1300);
        },
      };
      o.build(sh);
      return root;
    },
  });
}

function head(kicker: string, title: string, sub?: string) {
  return el("div", { class: "olw-story-head" }, [
    el("p", { class: "olw-story-kicker", text: kicker }),
    el("h3", { class: "olw-story-title", text: title }),
    sub ? el("p", { class: "olw-story-sub", text: sub }) : null,
  ]);
}

/** Story lines; "Name: words" lines get a speaker label. */
function lines(ls: string[], cls = "") {
  return el(
    "div",
    { class: `olw-story-lines ${cls}` },
    ls.map((line) => {
      const m = /^([A-Z][A-Za-z +']{1,18}): (.+)$/.exec(line);
      if (!m) return el("p", { text: line });
      return el("p", { class: "olw-story-said" }, [el("strong", { text: m[1] }), ` ${m[2]}`]);
    }),
  );
}

function actions(...nodes: (Node | null | false)[]) {
  return el("div", { class: "olw-story-actions" }, nodes);
}

function primary(vd: Disposer, label: string, fn: () => void, cls = "olw-btn olw-btn--rose") {
  return button(vd, label, cls, () => fn());
}

interface ChoiceOpt {
  label: string;
  sub?: string;
  icon?: string;
  onPick: () => void;
  selected?: boolean;
  disabled?: boolean;
}
function choices(vd: Disposer, opts: ChoiceOpt[], cls = "") {
  return el(
    "div",
    { class: `olw-story-choices ${cls}` },
    opts.map((o) => {
      const b = button(vd, "", `olw-story-choice${o.selected ? " olw-story-choice--on" : ""}`, () => o.onPick());
      if (o.disabled) b.disabled = true;
      if (o.icon) b.append(el("span", { class: "olw-story-choice-icon", text: o.icon, attrs: { "aria-hidden": "true" } }));
      b.append(el("span", { class: "olw-story-choice-text" }, [el("span", { class: "olw-story-choice-label", text: o.label }), o.sub ? el("span", { class: "olw-story-choice-sub", text: o.sub }) : null]));
      if (o.selected) b.setAttribute("aria-pressed", "true");
      return b;
    }),
  );
}

function meter(label: string, value: number, max: number, tone: string) {
  const fill = el("span", { class: "olw-story-meter-fill" });
  const num = el("span", { class: "olw-story-meter-num" });
  const wrap = el("div", { class: `olw-story-meter olw-story-meter--${tone}` }, [
    el("span", { class: "olw-story-meter-label", text: label }),
    el("span", { class: "olw-story-meter-track" }, [fill]),
    num,
  ]);
  const set = (v: number) => {
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    fill.style.width = `${pct}%`;
    num.textContent = `${Math.round(Math.max(0, v))}`;
  };
  set(value);
  return { el: wrap, set };
}

function pips(label: string, n: number, max: number, full = "♥", empty = "♡", tone = "rose") {
  return el("div", { class: `olw-story-pips olw-story-pips--${tone}`, attrs: { "aria-label": `${label} ${n} of ${max}` } }, [
    el("span", { class: "olw-story-pips-label", text: label }),
    el("span", { class: "olw-story-pips-row", text: full.repeat(Math.max(0, n)) + empty.repeat(Math.max(0, max - n)) }),
  ]);
}

function onKey(vd: Disposer, fn: (code: string) => void) {
  vd.on(uiEvents, "storyKey", (code: string) => fn(code));
}
const PRESS = new Set(["Space", "KeyE", "Enter", "NumpadEnter", "Action"]);

function loop(vd: Disposer, fn: (dt: number, now: number) => void) {
  let last = performance.now();
  let alive = true;
  let id = 0;
  const tick = (now: number) => {
    if (!alive) return;
    const dt = Math.min(64, now - last);
    last = now;
    fn(dt, now);
    if (alive) id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  vd.add(() => {
    alive = false;
    cancelAnimationFrame(id);
  });
}

type Hit = "perfect" | "good" | "miss";
/**
 * A marker sweeps a track; press inside the glowing zone. Space / E / the
 * button all press. `zone` is the zone width (0-1); the inner third is perfect.
 */
function timingBar(vd: Disposer, o: { label: string; speed: number; zone: number; onPress: (hit: Hit) => void }) {
  const zoneEl = el("span", { class: "olw-story-timing-zone" }, [el("span", { class: "olw-story-timing-perfect" })]);
  const marker = el("span", { class: "olw-story-timing-marker" });
  const track = el("div", { class: "olw-story-timing-track", attrs: { "aria-hidden": "true" } }, [zoneEl, marker]);
  let zone = o.zone;
  let speed = o.speed;
  let pos = 0;
  let dir = 1;
  let cooldown = 0;
  const place = () => {
    zoneEl.style.left = `${(0.5 - zone / 2) * 100}%`;
    zoneEl.style.width = `${zone * 100}%`;
  };
  place();
  const press = () => {
    const now = performance.now();
    if (now < cooldown) return;
    cooldown = now + 320;
    const off = Math.abs(pos - 0.5);
    const hit: Hit = off <= zone / 6 ? "perfect" : off <= zone / 2 ? "good" : "miss";
    track.classList.remove("olw-story-timing--perfect", "olw-story-timing--good", "olw-story-timing--miss");
    void track.offsetWidth;
    track.classList.add(`olw-story-timing--${hit}`);
    o.onPress(hit);
  };
  const btn = button(vd, o.label, "olw-btn olw-btn--gold olw-story-timing-btn", press);
  onKey(vd, (code) => {
    if (PRESS.has(code)) press();
  });
  const reduced = prefersReducedMotion();
  loop(vd, (dt) => {
    pos += dir * speed * (dt / 1000) * (reduced ? 0.7 : 1);
    if (pos >= 1) {
      pos = 1;
      dir = -1;
    } else if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    marker.style.left = `${pos * 100}%`;
  });
  return {
    el: el("div", { class: "olw-story-timing" }, [track, btn]),
    setZone(z: number) {
      zone = z;
      place();
    },
    setSpeed(s: number) {
      speed = s;
    },
  };
}

/** A countdown strip; calls `onEnd` once when it runs out. */
function countdown(vd: Disposer, ms: number, onEnd: () => void) {
  const fill = el("span", { class: "olw-story-count-fill" });
  const wrap = el("div", { class: "olw-story-count", attrs: { "aria-hidden": "true" } }, [fill]);
  const start = performance.now();
  let done = false;
  loop(vd, (_dt, now) => {
    if (done) return;
    const left = Math.max(0, 1 - (now - start) / ms);
    fill.style.width = `${left * 100}%`;
    wrap.classList.toggle("olw-story-count--low", left < 0.3);
    if (left <= 0) {
      done = true;
      onEnd();
    }
  });
  return wrap;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Close this scene, run a generic DOM minigame, then come back. */
function runExternal(env: Env, sh: Shell, spec: Omit<MiniGameSpec, "onDone">, after: (ok: boolean) => void, reopen: () => void) {
  sh.close();
  const ran = uiEvents.emit("minigame", {
    ...spec,
    onDone: (ok?: boolean) => {
      after(!!ok);
      reopen();
    },
  } satisfies MiniGameSpec);
  if (!ran) {
    after(false);
    reopen();
  }
}

// ===========================================================================
// ROMANCE — RomanceScene chapters, with choices between the beats
// ===========================================================================

// Verbatim from RomanceScene.CHAPTERS.
const CHAPTERS: Record<RomanceActivity, { title: string; subtitle: string; beats: string[][]; finish: string; milestone: string }> = {
  romance_us: { milestone: "MILESTONE · FIRST PROPER DATE", title: "US", subtitle: "A proper date · just Juju and Moomoo", beats: [["Two coffees. Phones face-down. No errands disguised as romance."], ["Moomoo: I like the ordinary parts with you most.", "Juju: Even the part where you steal my coffee?", "Moomoo: Especially that part."], ["They take one slightly crooked Polaroid. It is perfect."]], finish: "Our day, kept." },
  romance_future: { milestone: "MILESTONE · SAYING THE FUTURE OUT LOUD", title: "ONE MORE PLACE", subtitle: "Downtown at golden hour", beats: [["They walk until the city lights begin switching on."], ["Work. Travel. Family. The homes they might make together."], ["Moomoo: One more place after this?", "Juju: Always one more place."]], finish: "The future sounds like us." },
  romance_proposal: { milestone: "MILESTONE · THE PROPOSAL", title: "ONE QUESTION", subtitle: "A quiet balcony above their noisy little world", beats: [["Moomoo has prepared a speech. He forgets half of it when Juju arrives."], ["Moomoo: I don't need a perfect life. I want our life."], ["Moomoo kneels. The city becomes very quiet.", "Will you marry me?"], ["Juju: Yes. Obviously yes.", "He laughs into the hug like he has been holding his breath for years."]], finish: "ENGAGED ♡" },
  wedding_planning_one: { milestone: "WEDDING PLANNING · PART ONE", title: "THE LIST", subtitle: "Invitations, flowers, and forty opinions", beats: [["Juju texts the family. Three replies arrive before the message shows as sent."], ["They choose lanterns, winter flowers and rugs warm enough for a desert evening."], ["Moomoo: We could elope.", "Juju: Too late. Mama made a spreadsheet."]], finish: "Invitations sent. Nerves acquired." },
  wedding_planning_two: { milestone: "WEDDING PLANNING · PART TWO", title: "THREE LOOKS", subtitle: "Fitting day · cake day · almost-there day", beats: [["Moroccan celebration. Jordanian celebration. White ceremony. Three beautiful looks, one Juju."], ["Cake tasting becomes a highly scientific process involving seven forks."], ["Moomoo: At the end of all this, I get to call you my wife.", "Everything slows down for one good second."], ["The desert venue is ready. Tomorrow is theirs."]], finish: "WEDDING READY" },
};

interface RomanceOption {
  label: string;
  reply: string[];
  hearts: number;
  flag?: string;
}
type RomanceStep = { kind: "beat"; lines: string[] } | { kind: "choice"; prompt: string; group?: string; options: RomanceOption[] };

const beat = (a: RomanceActivity, i: number): RomanceStep => ({ kind: "beat", lines: CHAPTERS[a].beats[i] });

const ROMANCE_STEPS: Record<RomanceActivity, RomanceStep[]> = {
  romance_us: [
    beat("romance_us", 0),
    {
      kind: "choice",
      prompt: "Moomoo slides his coffee a little closer to her side of the table.",
      options: [
        { label: "Steal a sip. Obviously.", reply: ["Moomoo pretends to be outraged for exactly one second."], hearts: 2 },
        { label: "Ask how his week really was", reply: ["He talks. She listens. The coffee goes cold and nobody minds."], hearts: 2 },
        { label: "Check her phone. Just once.", reply: ["One notification. She puts it face-down again. He noticed, and smiles anyway."], hearts: 0 },
      ],
    },
    beat("romance_us", 1),
    {
      kind: "choice",
      prompt: "The café owner offers to take a Polaroid.",
      options: [
        { label: "Kiss his cheek as the shutter clicks", reply: ["Moomoo's face goes pink in real time. The photo will prove it."], hearts: 2 },
        { label: "Pull the silliest face she owns", reply: ["Moomoo matches it immediately. Two idiots, one frame."], hearts: 1 },
        { label: "Let him choose the pose", reply: ["He chooses 'holding hands like it's nothing'. It is not nothing."], hearts: 1 },
      ],
    },
    beat("romance_us", 2),
  ],
  romance_future: [
    beat("romance_future", 0),
    {
      kind: "choice",
      prompt: "Moomoo: What do you picture? Honestly.",
      options: [
        { label: "A balcony with far too many plants", reply: ["Moomoo: Then I'm learning which ones not to kill."], hearts: 2 },
        { label: "Wherever the work takes us — together", reply: ["Moomoo: Together is the only part of that sentence I need."], hearts: 2 },
        { label: "More days exactly like this one", reply: ["He doesn't answer. He just holds her hand a little tighter."], hearts: 1 },
      ],
    },
    beat("romance_future", 1),
    {
      kind: "choice",
      prompt: "He goes quiet for a moment, looking at the lights.",
      options: [
        { label: "Take his hand", reply: ["The quiet turns into the comfortable kind."], hearts: 2 },
        { label: "Ask what he's thinking", reply: ["Moomoo: That I'd move anywhere, as long as you're in the next room."], hearts: 2 },
        { label: "Joke about Mama's spreadsheet", reply: ["He laughs so hard a pigeon files a complaint."], hearts: 1 },
      ],
    },
    beat("romance_future", 2),
  ],
  romance_proposal: [
    beat("romance_proposal", 0),
    {
      kind: "choice",
      prompt: "His hands are shaking a little.",
      options: [
        { label: "Squeeze his hand", reply: ["Moomoo breathes out. Some of the speech comes back."], hearts: 2 },
        { label: "Ask if he's okay", reply: ["Moomoo: I'm perfect. I'm terrified. Both."], hearts: 2 },
        { label: "Pretend not to notice", reply: ["She absolutely notices. She is very kind about it."], hearts: 1 },
      ],
    },
    beat("romance_proposal", 1),
    beat("romance_proposal", 2),
    {
      kind: "choice",
      prompt: "Will you marry me?",
      options: [
        { label: "Yes. Obviously yes.", reply: ["Juju: Yes. Obviously yes."], hearts: 3 },
        { label: "Yes — now get up before I cry", reply: ["Juju: Yes. Get up. I'm already crying."], hearts: 3 },
        { label: "Say nothing. Nod. Cry.", reply: ["Juju nods so hard it counts as a yes in every language."], hearts: 3 },
      ],
    },
    { kind: "beat", lines: [CHAPTERS.romance_proposal.beats[3][1]] },
  ],
  wedding_planning_one: [
    beat("wedding_planning_one", 0),
    {
      kind: "choice",
      prompt: "Flowers for a desert evening:",
      group: "wedding_flowers_",
      options: [
        { label: "Winter flowers", reply: ["Soft, pale and very brave for the desert."], hearts: 1, flag: "wedding_flowers_winter" },
        { label: "Desert roses", reply: ["Deep pink. Mama approves before the photo loads."], hearts: 1, flag: "wedding_flowers_roses" },
        { label: "White jasmine", reply: ["The whole venue will smell like Teta's garden."], hearts: 1, flag: "wedding_flowers_jasmine" },
      ],
    },
    {
      kind: "choice",
      prompt: "How do the guests arrive?",
      group: "wedding_guests_",
      options: [
        { label: "Everyone Mama invited", reply: ["Moomoo: How many is everyone?", "Juju: Yes."], hearts: 1, flag: "wedding_guests_everyone" },
        { label: "Family and the Edi girls", reply: ["Hazel is already planning the dance floor."], hearts: 1, flag: "wedding_guests_close" },
        { label: "Small and close", reply: ["Mama reads the list twice and adds nine cousins."], hearts: 1, flag: "wedding_guests_small" },
      ],
    },
    beat("wedding_planning_one", 1),
    beat("wedding_planning_one", 2),
  ],
  wedding_planning_two: [
    beat("wedding_planning_two", 0),
    {
      kind: "choice",
      prompt: "Which look does Moomoo get to see first?",
      options: [
        { label: "Moroccan gold and green", reply: ["He forgets the sentence he had prepared."], hearts: 1 },
        { label: "Jordanian red embroidery", reply: ["Moomoo: I'm going to need a minute."], hearts: 1 },
        { label: "Save them all for the day", reply: ["Moomoo: That's cruel. I love it."], hearts: 2 },
      ],
    },
    beat("wedding_planning_two", 1),
    {
      kind: "choice",
      prompt: "The seventh fork decides:",
      options: [
        { label: "Pistachio rose", reply: ["Unanimous. Even Baba had seconds."], hearts: 1 },
        { label: "Chocolate, obviously", reply: ["Moomoo steals the last bite and calls it quality control."], hearts: 1 },
        { label: "Let Moomoo pick", reply: ["He picks her favourite without asking. Of course he does."], hearts: 2 },
      ],
    },
    beat("wedding_planning_two", 2),
    beat("wedding_planning_two", 3),
  ],
};

function openRomance(env: Env, activityArg?: string) {
  const activity: RomanceActivity = (ROMANCE_ACTIVITIES as readonly string[]).includes(activityArg ?? "") ? (activityArg as RomanceActivity) : "romance_us";
  const chapter = CHAPTERS[activity];
  const steps = ROMANCE_STEPS[activity];
  const maxHearts = steps.reduce((sum, s) => sum + (s.kind === "choice" ? Math.max(...s.options.map((o) => o.hearts)) : 0), 0);
  const st = { i: 0, hearts: 0, reply: null as string[] | null, done: false };

  const finish = () => {
    // RomanceScene.advance() side effects
    st.done = true;
    quests.onMinigame(activity);
    if (activity === "romance_us") {
      store.unlockMemory("mem_romance_us");
      store.capturePhoto({ id: `romance_us_${store.state.currentDay}`, title: "Us", locationId: store.state.currentLocation, day: store.state.currentDay, timeOfDay: store.state.timeOfDay, companionId: "moomoo", participantIds: ["moomoo"], pose: "hug", frame: "hearts", caption: "Two coffees. One crooked photo. Their ordinary magic." });
      store.incrementStat("dates_completed");
    }
    if (activity === "romance_proposal") {
      store.state.relationshipStage = "engaged";
      store.setFlag("engaged");
      store.unlockMemory("mem_proposal");
      if (!store.state.unlockedAccessories.includes("engagement_ring")) store.state.unlockedAccessories.push("engagement_ring");
      store.save();
    }
    if (st.hearts > 0) store.addRelationship("moomoo", st.hearts);
  };

  openShell(env, {
    title: chapter.title,
    subtitle: chapter.subtitle,
    tone: activity === "romance_proposal" ? "night" : "romance",
    build: (sh) => {
      const render = () =>
        sh.view((vd) => {
          const top = [head(chapter.milestone, chapter.title, chapter.subtitle), pips("Closeness", st.hearts, maxHearts)];
          if (st.done) {
            return [
              ...top,
              el("div", { class: "olw-story-finale" }, [el("p", { class: "olw-story-finale-big", text: chapter.finish })]),
              lines([st.hearts >= maxHearts - 1 ? "Moomoo will be thinking about today for a long time." : "A good day. The kind you keep.", `Moomoo ♥ +${st.hearts}`], "olw-story-lines--soft"),
              actions(primary(vd, "Return to your little world", () => sh.close())),
            ];
          }
          if (st.reply) {
            const reply = st.reply;
            return [
              ...top,
              lines(reply),
              actions(
                primary(vd, "Continue", () => {
                  st.reply = null;
                  st.i += 1;
                  if (st.i >= steps.length) finish();
                  render();
                }),
              ),
            ];
          }
          const step = steps[st.i];
          if (step.kind === "beat") {
            return [
              ...top,
              lines(step.lines),
              actions(
                primary(vd, st.i === steps.length - 1 ? "Keep this moment" : "Continue", () => {
                  st.i += 1;
                  if (st.i >= steps.length) finish();
                  render();
                }),
              ),
            ];
          }
          return [
            ...top,
            lines([step.prompt], "olw-story-lines--prompt"),
            choices(
              vd,
              step.options.map((o) => ({
                label: o.label,
                icon: o.hearts >= 2 ? "♥" : "♡",
                onPick: () => {
                  st.hearts += o.hearts;
                  if (o.flag) {
                    for (const other of step.options) if (other.flag) store.setFlag(other.flag, false);
                    store.setFlag(o.flag);
                  }
                  st.reply = o.reply;
                  render();
                },
              })),
            ),
          ];
        });
      render();
      onKeyAdvance(sh);
    },
  });
}

/** Space / E press the scene's first primary button when no choice is up. */
function onKeyAdvance(sh: Shell) {
  sh.md.on(uiEvents, "storyKey", (code: string) => {
    if (!PRESS.has(code)) return;
    const btn = sh.root.querySelector<HTMLButtonElement>(".olw-story-actions .olw-btn--rose:not(:disabled)");
    if (btn && !sh.root.querySelector(".olw-story-timing")) btn.click();
  });
}

// ===========================================================================
// WEDDING — plan → ceremony → Mabrouk timing game → vows → celebration
// ===========================================================================

const WEDDING_VENUES = [
  { id: "dunes", label: "The dune ridge", sub: "Sunset over the sand, lanterns in the dips", line: "The dune ridge glows gold, then pink, then lantern-yellow." },
  { id: "courtyard", label: "Lantern courtyard", sub: "Rugs, low tables, a thousand little lights", line: "The courtyard is all rugs, cushions and tiny swinging lights." },
  { id: "oasis", label: "By the oasis", sub: "Palms, water, and a breeze that behaves", line: "Palms lean over the water like they came to watch." },
];
const WEDDING_FLOWERS = [
  { id: "winter", label: "Winter flowers", sub: "Pale and brave", line: "Winter flowers line the aisle, pale and brave." },
  { id: "roses", label: "Desert roses", sub: "Deep pink, Mama-approved", line: "Desert roses everywhere. Mama is very pleased with herself." },
  { id: "jasmine", label: "White jasmine", sub: "Smells like Teta's garden", line: "The jasmine makes the whole desert smell like Teta's garden." },
];
const WEDDING_GUESTS = [
  { id: "everyone", label: "Everyone Mama invited", sub: "Nobody knows the final number", line: "Every cousin, neighbour and aunt Mama has ever met is here." },
  { id: "close", label: "Family and the Edi girls", sub: "A dance floor with opinions", line: "Family on one side, the Edi girls already claiming the dance floor." },
  { id: "small", label: "Small and close", sub: "Plus nine cousins", line: "Small and close. Plus the nine cousins Mama added." },
];

function pickedFlag(prefix: string, ids: string[], fallback: string) {
  return ids.find((id) => store.hasFlag(`${prefix}${id}`)) ?? fallback;
}

function openWedding(env: Env) {
  type Phase = "plan" | "story" | "boss" | "bossWon" | "vows" | "party" | "done";
  const st = {
    phase: "plan" as Phase,
    venue: "dunes",
    flowers: pickedFlag("wedding_flowers_", WEDDING_FLOWERS.map((f) => f.id), "winter"),
    guests: pickedFlag("wedding_guests_", WEDDING_GUESTS.map((g) => g.id), "everyone"),
    beat: 0,
    mischief: 100,
    misses: 0,
    hits: 0,
    vow: "",
    first: false,
  };
  const venueDef = () => WEDDING_VENUES.find((v) => v.id === st.venue) ?? WEDDING_VENUES[0];
  const flowerDef = () => WEDDING_FLOWERS.find((v) => v.id === st.flowers) ?? WEDDING_FLOWERS[0];
  const guestDef = () => WEDDING_GUESTS.find((v) => v.id === st.guests) ?? WEDDING_GUESTS[0];

  const storyBeats = (): { kicker: string; lines: string[] }[] => [
    { kicker: "DUBAI DESERT · WINTER SUNSET", lines: ["The lanterns wake one by one. Everyone important is here.", venueDef().line, flowerDef().line, guestDef().line] },
    { kicker: "MOROCCAN CELEBRATION", lines: ["Juju steps out in gold, green and warm jewel tones. Moomoo forgets the sentence he prepared."] },
    { kicker: "OH NO", lines: ["Mama and Baba see each other.", "Pause. Red faces. Tiny steam.", "A cartoon cloud of stars and POWs rolls across the rugs.", "Guest reaction: of course this is happening."] },
    { kicker: "JORDANIAN CELEBRATION", lines: ["A deep red embroidered look, dancing, family, and the ring box safely—", "Wait. Where is the ring box?"] },
  ];

  const completeWedding = () => {
    // WeddingScene.completeWedding
    st.first = !store.state.flags.wedding_completed;
    store.state.relationshipStage = "married";
    store.setFlag("wedding_completed");
    store.unlockMemory("mem_wedding");
    for (const outfit of ["wedding_moroccan", "wedding_jordanian", "wedding_white"]) {
      if (!store.state.unlockedOutfits.includes(outfit)) store.state.unlockedOutfits.push(outfit);
    }
    for (const keepsake of ["wedding_rings", "mabrouk_cake_friend"]) {
      if (!store.state.keepsakes.includes(keepsake)) store.state.keepsakes.push(keepsake);
    }
    if (st.first) {
      store.capturePhoto({ id: `wedding_${store.state.currentDay}`, title: "Our desert wedding", locationId: "abudhabi_yas", day: store.state.currentDay, timeOfDay: "night", companionId: "moomoo", participantIds: ["moomoo", "mama", "baba", "fadwa", "nour", "jad", "shan"], pose: "hug", frame: "hearts", caption: "Three looks, one cartoon cloud, one Dune Puff, two rings, forever." });
      store.incrementStat("wedding_completed");
      store.addRelationship("moomoo", 20);
    }
    quests.onMinigame("desert_wedding");
    store.save();
  };

  openShell(env, {
    title: "Juju + Moomoo",
    subtitle: "Our desert wedding",
    tone: "wedding",
    build: (sh) => {
      let keepScroll = false;
      const render = () => {
        const keep = keepScroll;
        keepScroll = false;
        sh.view((vd) => {
          if (st.phase === "plan") {
            const group = (label: string, opts: { id: string; label: string; sub: string }[], cur: string, set: (id: string) => void) =>
              el("div", { class: "olw-story-group" }, [
                el("p", { class: "olw-story-group-label", text: label }),
                choices(vd, opts.map((o) => ({ label: o.label, sub: o.sub, selected: o.id === cur, onPick: () => { set(o.id); keepScroll = true; render(); } })), "olw-story-choices--pills"),
              ]);
            return [
              head("THE MORNING OF", "Final touches", "Three last decisions. Everything else is already perfect (Mama checked)."),
              group("Venue", WEDDING_VENUES, st.venue, (id) => (st.venue = id)),
              group("Flowers", WEDDING_FLOWERS, st.flowers, (id) => (st.flowers = id)),
              group("Guests", WEDDING_GUESTS, st.guests, (id) => (st.guests = id)),
              actions(primary(vd, "Light the lanterns", () => { st.phase = "story"; st.beat = 0; render(); })),
            ];
          }
          if (st.phase === "story") {
            const beats = storyBeats();
            const b = beats[st.beat];
            return [
              head(b.kicker, "Juju + Moomoo", `${st.beat + 1} / ${beats.length}`),
              lines(b.lines),
              actions(
                primary(vd, st.beat === beats.length - 1 ? "Look toward the dune" : "Continue", () => {
                  if (st.beat < beats.length - 1) st.beat += 1;
                  else st.phase = "boss";
                  render();
                }),
              ),
            ];
          }
          if (st.phase === "boss") {
            const bar = meter("MISCHIEF", st.mischief, 100, "rose");
            const status = el("p", { class: "olw-story-status", text: st.hits === 0 ? "Toss a wedding sweet when the marker crosses the glow." : "Keep going — Mabrouk is wobbling." });
            const puff = el("div", { class: "olw-story-puff", attrs: { "aria-hidden": "true" } }, [el("span", { text: "MABROUK" })]);
            const tb = timingBar(vd, {
              label: "Toss a wedding sweet",
              speed: 0.9,
              zone: 0.3,
              onPress: (hit) => {
                if (hit === "miss") {
                  st.misses += 1;
                  status.textContent = st.misses % 2 ? "CUSHION ATTACK · still adorable" : "Heart-shaped sand. Rude.";
                  sh.flash(status.textContent, "bad");
                  if (st.misses % 3 === 0) {
                    st.mischief = Math.min(100, st.mischief + 10);
                    status.textContent = "Mabrouk rolls in the sand and feels refreshed. Mischief +10.";
                  }
                } else {
                  st.hits += 1;
                  st.mischief = Math.max(0, st.mischief - (hit === "perfect" ? 25 : 14));
                  status.textContent = hit === "perfect" ? "PERFECT TOSS · Mabrouk squishes delightedly." : "Sweet delivered. Mabrouk chews thoughtfully.";
                  puff.classList.remove("olw-story-puff--hit");
                  void puff.offsetWidth;
                  puff.classList.add("olw-story-puff--hit");
                }
                bar.set(st.mischief);
                // the zone tightens and the marker speeds up as Mabrouk tires
                tb.setZone(0.3 - (1 - st.mischief / 100) * 0.12);
                tb.setSpeed(0.9 + (1 - st.mischief / 100) * 0.6);
                if (st.mischief <= 0) {
                  store.incrementStat("wedding_boss_wins");
                  st.phase = "bossWon";
                  vd.timeout(render, 450);
                }
              },
            });
            return [
              head("BOSS · MABROUK THE DUNE PUFF", "Get the ring box back", "A gigantic fluffy creature erupts from the dune, steals the shiny ring box, and looks delighted with itself."),
              puff,
              bar.el,
              tb.el,
              status,
            ];
          }
          if (st.phase === "bossWon") {
            return [
              head("MISCHIEF DEFEATED", "Ring box recovered"),
              lines(["Mabrouk drops the ring box, looks embarrassed, and accepts cake as a peace treaty.", `Sweets tossed: ${st.hits} · sand puffs survived: ${st.misses}`]),
              actions(primary(vd, "Return to the ceremony", () => { st.phase = "vows"; render(); })),
            ];
          }
          if (st.phase === "vows") {
            return [
              head("WHITE CEREMONY", "The vows", "The jokes stop. Desert stars come out. Moomoo takes Juju's hands."),
              lines(["Moomoo: I don't need a perfect life. I want our life."]),
              lines(["Juju's turn:"], "olw-story-lines--prompt"),
              choices(vd, [
                { label: "\"You are my favourite ordinary day.\"", icon: "♥", onPick: () => { st.vow = "Juju: You are my favourite ordinary day. Every single one."; st.phase = "party"; render(); } },
                { label: "\"One more place. Always.\"", icon: "♥", onPick: () => { st.vow = "Juju: One more place. Then another. Always with you."; st.phase = "party"; render(); } },
                { label: "\"You can keep stealing my coffee.\"", icon: "♡", onPick: () => { st.vow = "Juju: You can keep stealing my coffee. Forever. That's the vow."; st.phase = "party"; render(); } },
              ]),
            ];
          }
          if (st.phase === "party") {
            return [
              head("MABROUK!", "Rings. Kiss. Family cheering."),
              lines([st.vow, "Moomoo laughs, then cries, then does both at once.", "Rings. Kiss. Family cheering. Mabrouk eating cake in the background.", "The whole little world feels close enough to hold."]),
              actions(primary(vd, "One last dance", () => { completeWedding(); st.phase = "done"; render(); })),
            ];
          }
          // done — celebration + rewards
          const rewards = [
            "Relationship: MARRIED ♡",
            "Outfits: Moroccan, Jordanian and White wedding looks",
            "Keepsakes: wedding rings · Mabrouk cake friend",
            "Memory: Our Desert Wedding",
            st.first ? "Photo: Our desert wedding · Moomoo ♥ +20" : "",
          ].filter(Boolean);
          return [
            el("div", { class: "olw-story-finale olw-story-finale--confetti" }, [el("p", { class: "olw-story-finale-big", text: "MARRIED ♡" }), el("p", { text: "The wedding was the end of waiting. Their bigger life begins now." })]),
            el("ul", { class: "olw-story-rewards" }, rewards.map((r) => el("li", { text: r }))),
            actions(
              primary(vd, "Go home together", () => {
                sh.close();
                if (store.state.currentLocation !== "abudhabi_yas") env.travelTo("abudhabi_yas");
              }),
            ),
          ];
        }, { keepScroll: keep });
      };
      render();
      onKeyAdvance(sh);
    },
  });
}

// ===========================================================================
// TIGOR — TigorMissionScene chapters 0-3 + TigorAirportScene
// ===========================================================================

type Stealth = "Wait" | "Creep" | "Distract";
interface StealthCheckpoint {
  where: string;
  tell: string;
  answer: string;
  outcomes: Record<string, string>;
}

// Chapter 0: getting Tigor into the carrier at Chloe's in Oadby.
const CARRIER_CHECKPOINTS: StealthCheckpoint[] = [
  {
    where: "THE HALLWAY",
    tell: "Tigor is loafed on the radiator, eyes three-quarters closed.",
    answer: "Creep",
    outcomes: {
      Wait: "You wait. He wakes up fully, stretches, and relocates on principle.",
      Creep: "Sock feet. Zero creaks. Tigor stays loafed.",
      Distract: "The treat bag crinkles. Tigor opens one eye and knows exactly what you are doing.",
    },
  },
  {
    where: "THE LIVING ROOM",
    tell: "His ears swivel toward the floorboard you are about to step on.",
    answer: "Wait",
    outcomes: {
      Wait: "You freeze mid-step. His ears relax. The floorboard lives to creak another day.",
      Creep: "CREEEAK. Tigor's head snaps round. That floorboard has always hated you.",
      Distract: "Chloe waves a feather. Tigor looks at her with deep, personal pity.",
    },
  },
  {
    where: "THE KITCHEN",
    tell: "Tigor is staring straight at you. Tail flicking. He suspects.",
    answer: "Distract",
    outcomes: {
      Wait: "You stand still. He keeps staring. This is now a contest you are losing.",
      Creep: "You creep forward while he watches. He watches you creep. It's humiliating.",
      Distract: "Chloe shakes the treat bag by the fridge. Tigor's loyalty lasts 0.4 seconds.",
    },
  },
  {
    where: "THE CARRIER",
    tell: "He turns his back to sit directly on the first form. Now.",
    answer: "Creep",
    outcomes: {
      Wait: "You wait too long. He finishes the form and leaves for the curtains.",
      Creep: "One smooth scoop. Tigor is in the carrier. He is furious. He is ready.",
      Distract: "You shake the treat bag. He's sitting on the form; he doesn't need treats. He has power.",
    },
  },
];

// Chapter 4: Heathrow with Tigor in his carrier.
const AIRPORT_CHECKPOINTS: StealthCheckpoint[] = [
  {
    where: "BAG SCAN",
    tell: "The belt rumbles. Tigor has started a low, operatic growl at the scanner.",
    answer: "Distract",
    outcomes: {
      Hide: "You can't hide a carrier from an X-ray. Security stares at you with professional sadness.",
      Walk: "You walk on. The growl becomes an aria. A queue of strangers turns around.",
      Distract: "Chloe slips the crinkle toy through the bars. The aria stops. The scanner survives.",
    },
  },
  {
    where: "GATE CHECK",
    tell: "'Pet passengers, documents please.' Tigor is, miraculously, asleep.",
    answer: "Walk",
    outcomes: {
      Hide: "You try to hide behind the folder. It is a very suspicious folder now.",
      Walk: "Calm walk. Folder open. Forty-seven forms. The agent stamps without blinking.",
      Distract: "You rattle the toy. You woke him up. He will remember this.",
    },
  },
  {
    where: "BOARDING",
    tell: "A golden retriever is boarding just ahead. Tigor's pupils are the size of coins.",
    answer: "Hide",
    outcomes: {
      Hide: "Chloe's scarf goes over the carrier window. No retriever exists. Tigor settles.",
      Walk: "You walk right behind the retriever. The carrier hisses like a kettle.",
      Distract: "Treats. The retriever smells them first. Everyone is now involved.",
    },
  },
];

function openTigor(env: Env) {
  type View =
    | { v: "done" }
    | { v: "intro"; i: number }
    | { v: "stealth"; set: "carrier" | "airport"; i: number; strikes: number; result?: { ok: boolean; text: string } }
    | { v: "stealthFail"; set: "carrier" | "airport" }
    | { v: "carrierDone" }
    | { v: "vet" }
    | { v: "vetFail" }
    | { v: "vetWin" }
    | { v: "uae" }
    | { v: "uaeFail" }
    | { v: "uaeWin" }
    | { v: "night" }
    | { v: "nightDone" }
    | { v: "flight"; i: number }
    | { v: "arrivals"; i: number }
    | { v: "home" };

  const SETUP_BEATS = [
    "CHLOE · OADBY\nMinor issue: Tigor needs to move to Abu Dhabi.\nMajor issue: the forms have formed a government.",
    "Juju opens a group call.\nMoomoo brings coffee. Baba brings a folder labelled CAT PROBLEM.",
    "EDINBURGH → OADBY\nRain. Train windows. Eleven voice notes. One cat who has no idea he is becoming international.",
  ];
  const FLIGHT_BEATS = [
    "OADBY → HEATHROW\nOne carrier. Four document folders. Tigor has the most luggage.",
    "HEATHROW\nEvery paper is checked. Then checked by someone who checks the check.",
    "ABOVE THE CLOUDS\nTigor sleeps. Chloe finally sleeps. Juju watches the little plane move east.",
    "ABU DHABI ARRIVALS\nMoomoo, Mama and Baba are waiting behind the barrier.",
  ];
  const ARRIVAL_BEATS = [
    "The arrivals doors remain closed for exactly long enough to become personal.",
    "The doors open. Chloe appears with the document folder. Juju appears with the carrier.\nOne orange face presses against the little window.",
    "Tigor recognises everybody at once.\nHe runs like the airport floor personally offended him.",
    "Everyone cries. Tigor cries because the carrier had rules.\nBaba claims the airport air conditioning is unusually emotional.\nThe tears reach baggage claim.",
    "Moomoo: You two know he was only in the UK, right?\nJuju + Chloe: SHUT UP.\nTigor: mrrp\nJuju: We did it. We actually brought him home.",
  ];
  const ARRIVAL_BUTTONS = ["Watch the doors", "TIGOR!", "Attempt emotional composure", "Group hug before flotation devices", "Take Tigor home"];

  const chapterNow = () => store.state.tigor.missionChapter;
  const viewForChapter = (): View => {
    const c = chapterNow();
    if (store.isQuestReplay && c >= 5) return { v: "intro", i: 0 };
    if (c >= 5 || (store.state.tigor.unlocked && !store.isQuestReplay)) return { v: "done" };
    if (c === 1) return { v: "vet" };
    if (c === 2) return { v: "uae" };
    if (c === 3) return { v: "night" };
    if (c === 4) return { v: "flight", i: 0 };
    return { v: "intro", i: 0 };
  };

  // chapter state
  const vet = { index: 0, resistance: 100, juju: 8, baba: 5, strikes: 0, moomoo: false, chloe: false, order: [] as number[], msg: "" };
  const uae = { index: 0, resistance: 120, strikes: 0, rejections: 0, order: [] as number[], msg: "", nameTries: 0 };
  const night = { index: 0, deadline: 100, energy: 100, upload: 0, checkpoint: 0, coffee: 3, calls: 2, msg: "" };
  const resetVet = () => Object.assign(vet, { index: 0, resistance: 100, juju: 8, baba: 5, strikes: 0, moomoo: false, chloe: false, order: [], msg: "" });
  const resetUae = () => Object.assign(uae, { index: 0, resistance: 120, strikes: 0, rejections: 0, order: [], msg: "", nameTries: 0 });
  const resetNight = () => Object.assign(night, { index: 0, deadline: 100, energy: 100, upload: 0, checkpoint: 0, coffee: 3, calls: 2, msg: "" });

  let view: View = viewForChapter();

  const completeMission = () => {
    // TigorAirportScene.completeMission
    const firstCanonicalCompletion = !store.isQuestReplay && !store.state.tigor.unlocked;
    store.unlockTigor();
    if (firstCanonicalCompletion) {
      store.capturePhoto({ id: "tigor_arrival", title: "Tigor Comes Home", locationId: "abudhabi_yas", day: store.state.currentDay, timeOfDay: store.state.timeOfDay, companionId: "moomoo", participantIds: ["tigor", "chloe", "moomoo", "mama", "baba"], pose: "hug", frame: "hearts", caption: "Two governments, one flight, and enough tears to delay baggage claim." });
      store.addRelationship("moomoo", 4);
    }
    quests.onMinigame("retrieve_tigor_campaign");
  };

  const CHAPTER_NAMES = ["Oadby", "UK vet", "UAE permit", "All-nighter", "Airport"];
  const progress = () => {
    const c = Math.min(4, chapterNow());
    return el(
      "ol",
      { class: "olw-story-chapters", attrs: { "aria-label": "Mission checkpoints" } },
      CHAPTER_NAMES.map((n, i) => el("li", { class: i < c ? "olw-story-chapter--done" : i === c ? "olw-story-chapter--now" : "", text: n })),
    );
  };

  openShell(env, {
    title: "Retrieve Tigor",
    subtitle: "Two governments. One cat. Zero sleep.",
    tone: "tigor",
    build: (sh) => {
      const go = (v: View) => {
        view = v;
        render();
      };

      const stealthView = (vd: Disposer, v: Extract<View, { v: "stealth" }>) => {
        const set = v.set === "carrier" ? CARRIER_CHECKPOINTS : AIRPORT_CHECKPOINTS;
        const cp = set[v.i];
        const verbs: string[] = v.set === "carrier" ? (["Wait", "Creep", "Distract"] satisfies Stealth[]) : ["Hide", "Walk", "Distract"];
        const title = v.set === "carrier" ? "Operation: Carrier" : "Heathrow, with a cat";
        const top = [
          progress(),
          head(`CHECKPOINT ${v.i + 1}/${set.length} · ${cp.where}`, title, v.set === "carrier" ? "Get Tigor into the carrier. Two slips and he bolts under the bed." : "Get Tigor through the airport. Two scenes and security gets involved."),
          pips("Strikes", v.strikes, 2, "✕", "·", "ink"),
        ];
        if (v.result) {
          const res = v.result;
          return [
            ...top,
            lines([res.text], res.ok ? "olw-story-lines--good" : "olw-story-lines--bad"),
            actions(
              primary(vd, res.ok ? (v.i === set.length - 1 ? "Checkpoint cleared" : "Next checkpoint") : "Try that again", () => {
                if (!res.ok) return go({ ...v, result: undefined });
                if (v.i < set.length - 1) return go({ v: "stealth", set: v.set, i: v.i + 1, strikes: v.strikes });
                if (v.set === "carrier") go({ v: "carrierDone" });
                else go({ v: "flight", i: 2 });
              }),
            ),
          ];
        }
        return [
          ...top,
          lines([cp.tell], "olw-story-lines--prompt"),
          choices(
            vd,
            verbs.map((verb) => ({
              label: verb,
              icon: verb === "Wait" ? "⏸" : verb === "Creep" || verb === "Walk" ? "👣" : verb === "Hide" ? "🧣" : "🧶",
              onPick: () => {
                const ok = verb === cp.answer;
                const strikes = v.strikes + (ok ? 0 : 1);
                if (!ok && strikes >= 2) return go({ v: "stealthFail", set: v.set });
                go({ ...v, strikes, result: { ok, text: cp.outcomes[verb] } });
              },
            })),
            "olw-story-choices--row",
          ),
        ];
      };

      const render = () => {
        // a finished chapter's last task rolls straight into its win card
        if (view.v === "vet" && !TIGOR_VET_TASKS[vet.index]) view = { v: "vetWin" };
        if (view.v === "uae" && !TIGOR_UAE_PHASES[uae.index]) view = { v: "uaeWin" };
        if (view.v === "night" && !TIGOR_ALL_NIGHT_TASKS[night.index]) view = { v: "nightDone" };
        sh.view((vd) => {
          switch (view.v) {
            case "done":
              return [
                head("MISSION COMPLETE", "Tigor is home"),
                lines(["Tigor is napping somewhere warm in Abu Dhabi. The forms are defeated.", "Bring him exploring from Phone › People, or let him nap at home beside Mishmish."]),
                actions(primary(vd, "Close", () => sh.close())),
              ];
            case "intro": {
              const i = view.i;
              return [
                progress(),
                head("CHAPTER 0 · Edinburgh to Oadby", "RETRIEVE TIGOR"),
                lines(SETUP_BEATS[i].split("\n")),
                actions(primary(vd, i === SETUP_BEATS.length - 1 ? "Find the cat" : "Continue", () => (i < SETUP_BEATS.length - 1 ? go({ v: "intro", i: i + 1 }) : go({ v: "stealth", set: "carrier", i: 0, strikes: 0 })))),
              ];
            }
            case "stealth":
              return stealthView(vd, view);
            case "stealthFail": {
              const set = view.set;
              return [
                progress(),
                head("CAUGHT", set === "carrier" ? "Tigor bolts under Chloe's bed" : "Security would like a word"),
                lines(set === "carrier" ? ["Tigor is now a loaf of pure refusal under the bed.", "Chloe: Give him five minutes. Then we go again."] : ["Security escorts you to the back of the queue, very politely.", "Tigor: mrrp. (smug)"]),
                actions(primary(vd, "Try again", () => go({ v: "stealth", set, i: 0, strikes: 0 }))),
              ];
            }
            case "carrierDone":
              return [
                progress(),
                head("CHAPTER 0 · Complete", "The mission has officially begun"),
                lines(["Tigor sits directly on the first form.", "The mission has officially begun."]),
                actions(primary(vd, "Enter the vet boss", () => { store.setTigorChapter(1); resetVet(); go({ v: "vet" }); })),
              ];
            case "vet": {
              const task = TIGOR_VET_TASKS[vet.index];
              if (!task) return [];
              if (vet.order.length !== task.choices.length) vet.order = shuffle(task.choices.map((_, i) => i));
              const msg = vet.msg;
              vet.msg = "";
              const choose = (idx: number) => {
                if (idx !== task.correct) return strike("PLEASE COMPLETE FORM VET-9B", "Rejected. The appointment moves backward by one emotional year. Try again.");
                const priorBaba = vet.baba;
                vet.juju = Math.min(100, vet.juju + 15);
                vet.baba = Math.min(100, vet.baba + (task.id === "certificate" || task.id === "fit" ? 14 : 8));
                if (priorBaba < 35 && vet.baba >= 35) store.toast("Baba: Why did Etihad just charge WHAT?", "#ffe08a");
                if (priorBaba < 65 && vet.baba >= 65) store.toast("Baba: IS TIGOR FLYING THE PLANE?", "#ffe08a");
                vet.resistance = Math.max(0, vet.resistance - (vet.index === TIGOR_VET_TASKS.length - 1 ? 18 : 12));
                sh.flash(task.success, "good");
                vet.index += 1;
                vet.order = [];
                render();
              };
              const strike = (stamp: string, text: string) => {
                vet.juju = Math.min(100, vet.juju + 11);
                vet.baba = Math.min(100, vet.baba + 6);
                vet.resistance = Math.min(100, vet.resistance + 3);
                vet.strikes += 1;
                sh.flash(stamp, "bad");
                if (vet.strikes >= 2) return go({ v: "vetFail" });
                vet.msg = text;
                vet.order = [];
                render();
              };
              return [
                progress(),
                head(`CHAPTER 1 · Checklist ${vet.index + 1}/${TIGOR_VET_TASKS.length}`, "UK VET BOSS"),
                meter("APPOINTMENT RESISTANCE", vet.resistance, 100, "rose").el,
                el("div", { class: "olw-story-meter-pair" }, [meter("JUJU STRESS", vet.juju, 100, "pink").el, meter("BABA'S CARD", vet.baba, 100, "gold").el]),
                pips("Strikes", vet.strikes, 2, "✕", "·", "ink"),
                lines([task.label.toUpperCase(), msg || task.prompt], "olw-story-lines--prompt"),
                countdown(vd, vet.chloe ? 12500 : 8500, () => strike("NEXT APPOINTMENT: SIX WEEKS", "The vet boss moved the appointment. Moomoo put it back. Choose quickly.")),
                choices(vd, vet.order.map((i) => ({ label: task.choices[i], onPick: () => choose(i) }))),
                el("div", { class: "olw-story-assists" }, [
                  (() => {
                    const b = button(vd, vet.moomoo ? "Moomoo · used" : "Moomoo calls again", "olw-btn olw-btn--ghost olw-btn--small", () => {
                      vet.moomoo = true;
                      vet.strikes = Math.max(0, vet.strikes - 1);
                      vet.resistance = Math.max(8, vet.resistance - 9);
                      vet.baba = Math.max(0, vet.baba - 12);
                      sh.flash("MOOMOO CALLS AGAIN · He is extremely polite and somehow terrifying.", "good");
                      render();
                    });
                    b.disabled = vet.moomoo;
                    return b;
                  })(),
                  (() => {
                    const b = button(vd, vet.chloe ? "Chloe · used" : "PhD persistence", "olw-btn olw-btn--ghost olw-btn--small", () => {
                      vet.chloe = true;
                      vet.resistance = Math.max(8, vet.resistance - 9);
                      sh.flash("PhD PERSISTENCE · Chloe has survived Reviewer Two. This desk cannot scare her.", "good");
                      render();
                    });
                    b.disabled = vet.chloe;
                    return b;
                  })(),
                ]),
              ];
            }
            case "vetFail":
              return [
                progress(),
                head("REJECTED TWICE", "The vet boss wins this round"),
                lines(["NEXT APPOINTMENT: SIX WEEKS.", "Moomoo rings back and gets tomorrow at 8:10 AM. Chloe re-prints everything."]),
                actions(primary(vd, "Try the checklist again", () => { resetVet(); go({ v: "vet" }); })),
              ];
            case "vetWin":
              return [
                progress(),
                head("Every box ticked · every stamp acquired", "VET BOSS DEFEATED"),
                el("ul", { class: "olw-story-checklist" }, TIGOR_VET_TASKS.map((t) => el("li", { text: `✓ ${t.label}` }))),
                lines(["Tigor: mrrp. Fit to fly.", "Chloe: not fit to remain awake.", "Baba: How much was the blood test?"]),
                actions(primary(vd, "Face UAE bureaucracy", () => { store.setTigorChapter(2); resetUae(); go({ v: "uae" }); })),
              ];
            case "uae": {
              const phase = TIGOR_UAE_PHASES[uae.index];
              if (!phase) return [];
              const msg = uae.msg;
              uae.msg = "";
              const strike = (stamp: string, text: string) => {
                uae.rejections += 1;
                uae.strikes += 1;
                uae.resistance = Math.min(120, uae.resistance + 5);
                sh.flash(stamp, "bad");
                if (uae.strikes >= 2) return go({ v: "uaeFail" });
                uae.msg = text;
                uae.order = [];
                render();
              };
              const advance = (damage: number, success: string) => {
                uae.resistance = Math.max(0, uae.resistance - damage);
                sh.flash(success, "good");
                uae.index += 1;
                uae.order = [];
                render();
              };
              const top = [
                progress(),
                head(`CHAPTER 2 · ${phase.label} · phase ${uae.index + 1}/${TIGOR_UAE_PHASES.length}`, "UAE BUREAUCRACY BOSS"),
                meter("PORTAL RESISTANCE", uae.resistance, 120, "blue").el,
                pips("Strikes", uae.strikes, 2, "✕", "·", "ink"),
                lines([msg || phase.prompt, `Rejection stamps survived: ${uae.rejections}`], "olw-story-lines--prompt"),
              ];
              if (!phase.choices) {
                // OWNER NAME CHECK — type Chloe's full legal name
                const input = el("input", { class: "olw-story-input", attrs: { type: "text", autocomplete: "off", placeholder: "Full legal name", maxlength: "60", "aria-label": "Enter Chloe's full legal name" } });
                const submit = () => {
                  const value = input.value.trim().replace(/\s+/g, " ");
                  if (value.toLocaleLowerCase() === TIGOR_LEGAL_NAME.toLocaleLowerCase()) return advance(40, "CHLOE · LOUISE · CRANFIELD · IDENTITY COMBO!");
                  uae.nameTries += 1;
                  strike(value ? "NAME DOES NOT MATCH" : "NAME REQUIRED", "Use Chloe's full legal name. All three parts. The portal can smell nicknames.");
                };
                vd.listen(input, "keydown", (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                });
                vd.timeout(() => input.focus({ preventScroll: true }), 60);
                return [
                  ...top,
                  uae.nameTries > 0 || uae.strikes > 0 ? lines([`Hint: it's on every form. ${TIGOR_LEGAL_NAME.split(" ")[0]} ${TIGOR_LEGAL_NAME.split(" ")[1][0]}… ${TIGOR_LEGAL_NAME.split(" ")[2]}.`], "olw-story-lines--soft") : null,
                  el("div", { class: "olw-story-inputrow" }, [input, primary(vd, "Submit legal name", submit)]),
                ];
              }
              if (uae.order.length !== phase.choices.length) uae.order = shuffle(phase.choices.map((_, i) => i));
              const opts = phase.choices;
              return [
                ...top,
                countdown(vd, 10000, () => strike("SESSION EXPIRED", "The portal timed out while everybody was looking directly at it.")),
                choices(vd, uae.order.map((i) => ({ label: opts[i], onPick: () => (i === phase.correct ? advance(20, phase.success) : strike(["RETURNED", "INVALID PDF", "PLEASE CALL AGAIN"][uae.rejections % 3], "The portal has returned the application for reasons known only to the portal.")) }))),
              ];
            }
            case "uaeFail":
              return [
                progress(),
                head("APPLICATION RETURNED", "The portal wins this round"),
                lines(["Status: returned for clarification. Again.", "Baba prints a fresh copy of everything. Of course Baba prints it."]),
                actions(primary(vd, "Resubmit from the start", () => { resetUae(); go({ v: "uae" }); })),
              ];
            case "uaeWin":
              return [
                progress(),
                head("TAMM · ministry · identity combo · defeated", "IMPORT PERMIT APPROVED"),
                lines(["Juju screenshots the approval twelve times.", "Moomoo saves it to three clouds.", "Baba prints it. Of course Baba prints it."]),
                actions(primary(vd, "Begin the two-all-nighter", () => { store.setTigorChapter(3); resetNight(); go({ v: "night" }); })),
              ];
            case "night": {
              const task = TIGOR_ALL_NIGHT_TASKS[night.index];
              if (!task) return [];
              const cycle = ["EVENING ONE", "2:13 AM", "DAWN ONE", "EVENING TWO", "3:47 AM", "FINAL DAWN"][Math.min(5, Math.floor(night.index / 3))];
              const dl = meter("DEADLINE", night.deadline, 100, "rose");
              const en = meter("ENERGY", night.energy, 100, "gold");
              const up = meter("UPLOAD", night.upload, 100, "blue");
              const msg = night.msg;
              night.msg = "";
              let recovering = false;
              loop(vd, (dt) => {
                if (recovering) return;
                const s = dt / 1000;
                night.deadline = Math.max(0, night.deadline - s * 0.7);
                night.energy = Math.max(0, night.energy - s * 0.5);
                if (night.energy <= 0) night.deadline = Math.max(0, night.deadline - s * 1.4);
                dl.set(night.deadline);
                en.set(night.energy);
                if (night.deadline <= 0) {
                  recovering = true;
                  sh.flash("DEADLINE HIT · TEAM RECOVERY", "bad");
                  vd.timeout(() => {
                    night.index = night.checkpoint;
                    night.upload = Math.round((night.checkpoint / TIGOR_ALL_NIGHT_TASKS.length) * 100);
                    night.deadline = 42;
                    night.energy = 36;
                    night.msg = "Nobody restarts from zero. Chloe saved twelve copies.";
                    render();
                  }, 800);
                }
              });
              const choose = (action: AllNighterAction) => {
                if (recovering) return;
                if (action !== task.action) {
                  night.deadline = Math.max(0, night.deadline - 10);
                  night.energy = Math.max(0, night.energy - 8);
                  sh.flash("WRONG TAB · DEADLINE -10", "bad");
                  night.msg = "That was the wrong tab. It was open for emotional support.";
                  return render();
                }
                night.index += 1;
                night.upload = Math.min(100, Math.round((night.index / TIGOR_ALL_NIGHT_TASKS.length) * 100));
                night.energy = Math.max(0, night.energy - 4);
                if (night.index === 5 || night.index === 10) {
                  night.checkpoint = night.index;
                  night.deadline = Math.max(night.deadline, 48);
                  sh.flash(`CHECKPOINT SAVED · ${night.index}/${TIGOR_ALL_NIGHT_TASKS.length}`, "good");
                } else sh.flash(task.note, "good");
                render();
              };
              return [
                progress(),
                head(`CHAPTER 3 · ${cycle} · task ${night.index + 1}/${TIGOR_ALL_NIGHT_TASKS.length}`, "THE TWO-ALL-NIGHTER", "Protect DEADLINE and ENERGY. Pick the right tab for each task."),
                dl.el,
                en.el,
                up.el,
                lines([task.label.toUpperCase(), msg || "Which tab does this need?"], "olw-story-lines--prompt"),
                choices(vd, (["CALL", "UPLOAD", "STAMP", "CHECK"] as AllNighterAction[]).map((a) => ({ label: a, icon: a === "CALL" ? "☎" : a === "UPLOAD" ? "⇪" : a === "STAMP" ? "▣" : "✓", onPick: () => choose(a) })), "olw-story-choices--grid"),
                el("div", { class: "olw-story-assists" }, [
                  (() => {
                    const b = button(vd, `Coffee burst ×${night.coffee}`, "olw-btn olw-btn--ghost olw-btn--small", () => {
                      night.coffee -= 1;
                      night.energy = Math.min(100, night.energy + 26);
                      sh.flash("COFFEE BURST · ENERGY +26", "good");
                      render();
                    });
                    b.disabled = night.coffee <= 0;
                    return b;
                  })(),
                  (() => {
                    const b = button(vd, `Moomoo takes the call ×${night.calls}`, "olw-btn olw-btn--ghost olw-btn--small", () => {
                      night.calls -= 1;
                      night.deadline = Math.min(100, night.deadline + 20);
                      sh.flash("MOOMOO TAKES THE CALL · DEADLINE +20", "good");
                      render();
                    });
                    b.disabled = night.calls <= 0;
                    return b;
                  })(),
                ]),
              ];
            }
            case "nightDone":
              return [
                progress(),
                head("Two nights · sixteen tasks · zero functional sleep schedules", "CLEARANCE RECEIVED"),
                lines(["EMAIL RECEIVED: TIGOR CLEARED TO FLY", "Chloe screams. Juju screams. Moomoo wakes up and screams because everyone else is screaming."]),
                actions(primary(vd, "Board the flight", () => { store.setTigorChapter(4); go({ v: "flight", i: 0 }); })),
              ];
            case "flight": {
              const i = view.i;
              const next = (): View => (i === 1 ? { v: "stealth", set: "airport", i: 0, strikes: 0 } : i < FLIGHT_BEATS.length - 1 ? { v: "flight", i: i + 1 } : { v: "arrivals", i: 0 });
              return [
                progress(),
                head(`FLIGHT · ${i + 1}/${FLIGHT_BEATS.length}`, "TIGOR TAKES FLIGHT"),
                el("div", { class: "olw-story-plane", attrs: { "aria-hidden": "true" }, text: "✈" }),
                lines(FLIGHT_BEATS[i].split("\n")),
                actions(primary(vd, i === 1 ? "Through security" : i === FLIGHT_BEATS.length - 1 ? "Enter arrivals" : "Continue", () => go(next()))),
              ];
            }
            case "arrivals": {
              const i = view.i;
              return [
                head("LONDON EY020 · ARRIVED", "ABU DHABI ARRIVALS"),
                lines(ARRIVAL_BEATS[i].split("\n")),
                i >= 2 ? el("div", { class: "olw-story-hearts-burst", attrs: { "aria-hidden": "true" }, text: "♥ ♡ ♥ ♡ ♥" }) : null,
                actions(
                  primary(vd, ARRIVAL_BUTTONS[i], () => {
                    if (i < ARRIVAL_BEATS.length - 1) return go({ v: "arrivals", i: i + 1 });
                    completeMission();
                    go({ v: "home" });
                  }),
                ),
              ];
            }
            case "home":
              return [
                el("div", { class: "olw-story-finale" }, [el("p", { class: "olw-story-finale-big", text: "TIGOR IS HOME" })]),
                lines(["Juju: Come on, Tigor. You're home.", "Permanent pet unlocked: TIGOR", "Bring him exploring from Phone › People, or let him nap at home beside Mishmish. Human companions keep their own slot."]),
                actions(
                  primary(vd, "Enter Tigor's home", () => {
                    sh.close();
                    if (store.state.currentLocation !== "abudhabi_yas") env.travelTo("abudhabi_yas");
                  }),
                ),
              ];
          }
        });
      };
      render();
      onKeyAdvance(sh);
    },
  });
}

// ===========================================================================
// HEIST — SisterHeistScene: door → grid stealth → drawer → safe → grid escape
// ===========================================================================

type Dir = 0 | 1 | 2 | 3; // up right down left
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const ARROWS = ["▲", "▶", "▼", "◀"];

interface HeistMap {
  rows: string[];
  patrol: [number, number][]; // waypoints (row, col), looped
  stepMs: number;
  range: number;
  sideGlance: boolean;
  item: { icon: string; name: string };
  goalIcon: string;
  goalName: string;
}

// '#' wall · '.' floor · 'H' hiding furniture · 'C' checkpoint · 'S' start · 'G' goal · 'K' item
const HEIST_IN: HeistMap = {
  rows: [
    "###########",
    "#K..#.C..G#",
    "#...#.H...#",
    "#.H.#...#.#",
    "#...C...#.#",
    "#.###.###.#",
    "#.........#",
    "#S..H.....#",
    "###########",
  ],
  patrol: [[6, 5], [6, 9], [2, 9], [2, 7], [4, 7], [4, 5]],
  stepMs: 640,
  range: 4,
  sideGlance: false,
  item: { icon: "🔑", name: "Fadwa's room key" },
  goalIcon: "🚪",
  goalName: "FADWA'S ROOM",
};
const HEIST_OUT: HeistMap = {
  rows: [
    "###########",
    "#...#....S#",
    "#.H.#.H...#",
    "#...#...#.#",
    "#.C...C.#.#",
    "#.###.###.#",
    "#..K......#",
    "#G..H.....#",
    "###########",
  ],
  patrol: [[2, 9], [6, 9], [6, 5], [4, 5], [4, 7], [2, 7]],
  stepMs: 470,
  range: 5,
  sideGlance: true,
  item: { icon: "🎩", name: "your pirate hat" },
  goalIcon: "🚪",
  goalName: "FRONT DOOR",
};
const HIDE_ICONS = ["🛋", "🪴", "🪞"];

function expandPatrol(points: [number, number][]) {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const [r0, c0] = points[i];
    const [r1, c1] = points[(i + 1) % points.length];
    const dr = Math.sign(r1 - r0);
    const dc = Math.sign(c1 - c0);
    let r = r0;
    let c = c0;
    while (r !== r1 || c !== c1) {
      out.push([r, c]);
      r += dr;
      c += dc;
    }
  }
  return out;
}

function openHeist(env: Env) {
  const reopen = () => openHeist(env);
  const target = () => quests.currentStep("q_family_jewel_heist")?.target;

  openShell(env, {
    title: "The Great Family Jewel Heist",
    subtitle: "Fadwa's house · London · absolutely no crimes",
    tone: "heist",
    build: (sh) => {
      const external = (spec: Omit<MiniGameSpec, "onDone">, after: (ok: boolean) => void) => runExternal(env, sh, spec, after, reopen);

      const stealth = (map: HeistMap, escaping: boolean) => {
        const R = map.rows.length;
        const C = map.rows[0].length;
        const at = (r: number, c: number) => (r >= 0 && r < R && c >= 0 && c < C ? map.rows[r][c] : "#");
        const find = (ch: string): [number, number] => {
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (map.rows[r][c] === ch) return [r, c];
          return [1, 1];
        };
        const path = expandPatrol(map.patrol);
        const start = find("S");
        const s = {
          pr: start[0],
          pc: start[1],
          cp: start as [number, number],
          lives: 3,
          item: false,
          gi: 0,
          facing: 1 as Dir,
          graceUntil: 0,
          over: false,
          reached: new Set<string>(),
          msg: escaping ? "Grab your hat on the way out. Fadwa is faster now, and she glances sideways." : "Find Fadwa's room key, then sneak to her door. Furniture hides you.",
        };

        sh.view((vd) => {
          const cells: HTMLElement[] = [];
          const grid = el("div", { class: "olw-heist-grid", attrs: { role: "grid", "aria-label": "Fadwa's house floor plan" } });
          grid.style.gridTemplateColumns = `repeat(${C}, 1fr)`;
          let hideN = 0;
          for (let r = 0; r < R; r++) {
            for (let c = 0; c < C; c++) {
              const ch = at(r, c);
              const cell = el("div", { class: `olw-heist-cell olw-heist-cell--${ch === "#" ? "wall" : ch === "H" ? "hide" : "floor"}` });
              const icon = ch === "H" ? HIDE_ICONS[hideN++ % HIDE_ICONS.length] : ch === "C" ? "★" : ch === "G" ? map.goalIcon : "";
              cell.append(el("span", { class: "olw-heist-fixture", text: icon }));
              grid.append(cell);
              cells.push(cell);
            }
          }
          const livesEl = el("div", { class: "olw-heist-lives" });
          const status = el("p", { class: "olw-story-status", attrs: { "aria-live": "polite" } });
          const guardPos = () => path[s.gi % path.length];
          const guardFacing = (): Dir => {
            const [r0, c0] = path[s.gi % path.length];
            const [r1, c1] = path[(s.gi + 1) % path.length];
            if (r1 < r0) return 0;
            if (c1 > c0) return 1;
            if (r1 > r0) return 2;
            return 3;
          };
          const sight = () => {
            const seen = new Set<string>();
            const [gr, gc] = guardPos();
            const ray = (d: Dir, len: number) => {
              for (let k = 1; k <= len; k++) {
                const r = gr + DR[d] * k;
                const c = gc + DC[d] * k;
                const ch = at(r, c);
                if (ch === "#" || ch === "H") break;
                seen.add(`${r},${c}`);
              }
            };
            const f = guardFacing();
            ray(f, map.range);
            if (map.sideGlance) ray(((f + 1) % 4) as Dir, 2);
            return seen;
          };
          const draw = () => {
            const seen = sight();
            const [gr, gc] = guardPos();
            const f = guardFacing();
            for (let r = 0; r < R; r++) {
              for (let c = 0; c < C; c++) {
                const cell = cells[r * C + c];
                cell.classList.toggle("olw-heist-cell--sight", seen.has(`${r},${c}`));
                const token = cell.querySelector(".olw-heist-token");
                token?.remove();
                const itemHere = at(r, c) === "K" && !s.item;
                cell.classList.toggle("olw-heist-cell--item", itemHere);
                const fx = cell.querySelector(".olw-heist-fixture");
                if (fx && at(r, c) === "K") fx.textContent = s.item ? "" : map.item.icon;
                if (r === s.pr && c === s.pc) cell.append(el("span", { class: `olw-heist-token olw-heist-token--juju${at(r, c) === "H" ? " olw-heist-token--hidden" : ""}`, text: "J" }));
                if (r === gr && c === gc) cell.append(el("span", { class: "olw-heist-token olw-heist-token--fadwa", text: `F${ARROWS[f]}` }));
              }
            }
            livesEl.replaceChildren(pips("Checkpoints", s.lives, 3, "★", "☆", "gold"), el("span", { class: "olw-heist-item", text: s.item ? `${map.item.icon} got it` : `${map.item.icon} not yet` }));
            status.textContent = s.msg;
          };
          const caught = () => {
            if (s.over || performance.now() < s.graceUntil) return;
            store.incrementStat("heist_fadwa_alerts");
            s.lives -= 1;
            if (s.lives <= 0) {
              s.over = true;
              sh.view((vd2) => [
                head("FADWA CAUGHT YOU!", escaping ? "Three times. With the jewelry." : "Three times. In a moustache."),
                lines(escaping ? ["Fadwa: IS THAT GRANDMA'S JEWELRY?", "Juju: No.", "Parrot: JEWELRY!", "Back to the room door. I cannot believe this."] : ["Fadwa: Juju...", "Fadwa: Why are you dressed like a pirate?", "Please return to your last extremely stealthy checkpoint."]),
                actions(primary(vd2, escaping ? "Restart from the room door" : "Restart from the front door", () => stealth(map, escaping)), button(vd2, "Step outside for now", "olw-btn olw-btn--ghost", () => sh.close())),
              ]);
              return;
            }
            sh.flash(escaping ? "Fadwa: IS THAT GRANDMA'S JEWELRY?" : "Fadwa: Juju... why are you dressed like a pirate?", "bad");
            s.pr = s.cp[0];
            s.pc = s.cp[1];
            s.gi = 0;
            s.graceUntil = performance.now() + 1200;
            s.msg = `Caught! Back to your last checkpoint. ${s.lives} left.`;
            draw();
          };
          const check = () => {
            const [gr, gc] = guardPos();
            const hidden = at(s.pr, s.pc) === "H";
            if ((gr === s.pr && gc === s.pc) || (!hidden && sight().has(`${s.pr},${s.pc}`))) caught();
          };
          const win = () => {
            s.over = true;
            if (escaping) finishEscape();
            else {
              quests.onInteract("reach_fadwa_room");
              store.setFlag("heist_room_reached");
              sh.flash("FADWA'S ROOM · The treasure is close.", "good");
              vd.timeout(() => renderStage(), 900);
            }
          };
          const move = (d: Dir) => {
            if (s.over) return;
            const r = s.pr + DR[d];
            const c = s.pc + DC[d];
            const ch = at(r, c);
            if (ch === "#") return;
            s.pr = r;
            s.pc = c;
            if (ch === "K" && !s.item) {
              s.item = true;
              s.msg = `Got ${map.item.name}! Now the ${map.goalName.toLowerCase()}.`;
            } else if (ch === "C" && !s.reached.has(`${r},${c}`)) {
              s.reached.add(`${r},${c}`);
              s.cp = [r, c];
              s.msg = escaping ? "CHECKPOINT · the jewelry is still in the bag" : s.reached.size === 1 ? "HALLWAY CHECKPOINT · still not caught" : "UPSTAIRS CHECKPOINT · moustache holding";
              if (!escaping) store.setFlag(s.reached.size === 1 ? "heist_checkpoint_2" : "heist_checkpoint_3");
            } else if (ch === "H") s.msg = escaping ? "INCREDIBLY STEALTHY · behind the furniture" : "INCREDIBLY STEALTHY · hiding";
            else if (ch === "G") {
              if (s.item) return (draw(), win());
              s.msg = `Not without ${map.item.name}.`;
            } else s.msg = escaping ? "ESCAPE WITHOUT GETTING CAUGHT" : "WAIT · HIDE · MOVE WHEN SHE TURNS";
            draw();
            check();
          };
          let acc = 0;
          loop(vd, (dt) => {
            if (s.over) return;
            acc += dt;
            if (acc < map.stepMs) return;
            acc = 0;
            s.gi = (s.gi + 1) % path.length;
            draw();
            check();
          });
          onKey(vd, (code) => {
            const d: Dir | -1 = code === "ArrowUp" || code === "KeyW" ? 0 : code === "ArrowRight" || code === "KeyD" ? 1 : code === "ArrowDown" || code === "KeyS" ? 2 : code === "ArrowLeft" || code === "KeyA" ? 3 : -1;
            if (d !== -1) move(d);
          });
          const pad = el("div", { class: "olw-heist-pad" }, [
            button(vd, "▲", "olw-heist-key olw-heist-key--up", () => move(0)),
            button(vd, "◀", "olw-heist-key olw-heist-key--left", () => move(3)),
            button(vd, "▶", "olw-heist-key olw-heist-key--right", () => move(1)),
            button(vd, "▼", "olw-heist-key olw-heist-key--down", () => move(2)),
          ]);
          for (const b of pad.querySelectorAll("button")) b.setAttribute("aria-label", `Move ${b.textContent === "▲" ? "up" : b.textContent === "▼" ? "down" : b.textContent === "◀" ? "left" : "right"}`);
          draw();
          return [
            head(escaping ? "ESCAPE" : "STEALTH", escaping ? "Escape without getting caught" : "Sneak to Fadwa's room", "Arrow keys / WASD or the pad. One step at a time. Yellow tiles are Fadwa's line of sight."),
            livesEl,
            grid,
            status,
            pad,
          ];
        });
      };

      const finishEscape = () => {
        if (target() !== "escape_fadwa_house") return renderStage();
        quests.onInteract("escape_fadwa_house");
        const alerts = store.getStat("heist_fadwa_alerts");
        store.setFlag("pirate_disguise", false);
        for (const f of ["heist_voyage_complete", "heist_arrived_london", "heist_front_door_open", "heist_checkpoint_1", "heist_checkpoint_2", "heist_checkpoint_3", "heist_room_reached", "heist_drawer_open", "heist_safe_checkpoint"]) store.setFlag(f, false);
        sh.view((vd) => [
          el("div", { class: "olw-story-finale olw-story-finale--confetti" }, [el("p", { class: "olw-story-finale-big", text: "MISSION COMPLETE" }), el("p", { text: "THE GREAT FAMILY JEWEL HEIST" })]),
          el("ul", { class: "olw-story-rewards" }, [
            el("li", { text: "SHARKS DEFEATED: 1" }),
            el("li", { text: "LOCKS DEFINITELY NOT PICKED: 3" }),
            el("li", { text: `FADWAS ALERTED: ${alerts}` }),
            el("li", { text: "JEWELRY RECOVERED: 100%" }),
          ]),
          lines(["hat off... moustache retired... eye patch returned to active duty never.", "Parrot: ARR!  (flies into the sunset)", "Absolutely no crimes occurred."], "olw-story-lines--soft"),
          actions(primary(vd, "Back to the West End", () => sh.close())),
        ]);
      };

      const renderStage = () => {
        const t = target();
        if (t === "reach_fadwa_room") return stealth(HEIST_IN, false);
        if (t === "escape_fadwa_house") return stealth(HEIST_OUT, true);
        sh.view((vd) => {
          if (t === "house_lock" || t === "enter_fadwa_house") {
            const lock = t === "house_lock";
            return [
              head("FADWA'S HOUSE · LONDON", "Totally normal door opening", "Rain. A blue front door. A parrot on your shoulder that cannot keep a secret."),
              lines(lock ? ["Juju: Completely normal. People open doors all the time."] : ["click...", "Professional.", "Parrot: ARR!"]),
              actions(
                primary(vd, lock ? "Pick the completely normal door lock" : "Enter Fadwa's house", () => {
                  if (!lock) {
                    quests.onInteract("enter_fadwa_house");
                    store.setFlag("heist_checkpoint_1");
                    return renderStage();
                  }
                  external({ kind: "lockpick", title: "TOTALLY NORMAL DOOR OPENING", hint: "Stop the marker in each green cartoon zone. No real locks were consulted.", taps: 3, difficulty: 1, skipLabel: "Not yet" }, (ok) => {
                    if (!ok || target() !== "house_lock") return;
                    quests.onInteract("house_lock");
                    store.setFlag("heist_front_door_open");
                  });
                }),
                button(vd, "Leave", "olw-btn olw-btn--ghost", () => sh.close()),
              ),
            ];
          }
          if (t === "drawer_lock" || t === "family_safe") {
            const safe = t === "family_safe";
            const joke = (title: string, line: string) => sh.flash(`${title}: ${line}`, "info");
            return [
              head("FADWA'S ROOM", safe ? "Grandma's safe · final lock" : "Find the correct drawer", safe ? "A safe inside a drawer. Fadwa understands drama." : "Five drawers. One of them is suspiciously correct."),
              choices(
                vd,
                [
                  { label: "Sock drawer", icon: "🧦", onPick: () => joke("Sock drawer", "Not the treasure. An extremely aggressive amount of socks.") },
                  { label: "Skincare drawer", icon: "🧴", onPick: () => joke("Skincare drawer", "Seven serums. Zero grandmothers.") },
                  { label: "Snack drawer", icon: "🍪", onPick: () => joke("Snack drawer", "Emergency biscuits. Respect.") },
                  { label: "Receipt drawer", icon: "🧾", onPick: () => joke("Receipt drawer", "Receipts from 2019. This is the real crime scene.") },
                  {
                    label: safe ? "Grandma's hidden safe" : "Suspiciously correct drawer",
                    icon: safe ? "🔐" : "✨",
                    onPick: () => {
                      if (!safe) {
                        return external({ kind: "lockpick", title: "THE SUSPICIOUS DRAWER", hint: "Four smaller cartoon timing zones. Still not real lock advice.", taps: 4, difficulty: 2, skipLabel: "Not yet" }, (ok) => {
                          if (!ok || target() !== "drawer_lock") return;
                          quests.onMinigame("drawer_lock");
                          store.setFlag("heist_drawer_open");
                          store.toast("CLICK. A safe inside a drawer.", "#f4c95d");
                        });
                      }
                      external({ kind: "safe", title: "GRANDMA'S FAMILY SAFE", hint: "Stage 1: stop the fictional dial. Stage 2: hit four arcade pins.", difficulty: 3, skipLabel: "Not yet" }, (ok) => {
                        if (!ok || target() !== "family_safe") return;
                        if (!store.hasFlag("heist_jewelry_claimed")) {
                          if (!store.hasItem("grandmas_jewelry")) store.addItem("grandmas_jewelry");
                          if (!store.hasItem("mamas_bangle")) store.addItem("mamas_bangle");
                          store.unlockAccessory("bangle");
                          store.setAccessory("bangle");
                          store.setFlag("heist_jewelry_claimed");
                        }
                        quests.onMinigame("family_safe");
                        store.setFlag("heist_safe_checkpoint");
                        store.toast("Mama's gold bangles! Grandma's jewelry! ...OURS.", "#f4c95d");
                      });
                    },
                  },
                ],
                "olw-story-choices--grid",
              ),
              button(vd, "Leave", "olw-btn olw-btn--ghost olw-btn--small", () => sh.close()),
            ];
          }
          return [
            head("FADWA'S HOUSE", "Nothing to sneak into right now"),
            lines(["The house is quiet. Fadwa is watching television. The parrot is judging you."]),
            actions(primary(vd, "Close", () => sh.close())),
          ];
        });
      };
      renderStage();
      onKeyAdvance(sh);
    },
  });
}

// ===========================================================================
// PIRATE VOYAGE — node-graph route to London with the Great White at the end
// ===========================================================================

type PirateEvent = "storm" | "merchant" | "treasure" | "boss";
interface PirateNode {
  id: string;
  name: string;
  event: PirateEvent;
  blurb: string;
}
const PIRATE_LAYERS: PirateNode[][] = [
  [
    { id: "storm_front", name: "Storm Front", event: "storm", blurb: "Big waves. Very nautical." },
    { id: "merchant_cove", name: "Merchant's Cove", event: "merchant", blurb: "A flag that says HONEST PRICES in suspicious handwriting." },
  ],
  [
    { id: "treasure_isle", name: "Treasure Isle", event: "treasure", blurb: "An X, a palm tree and a small locked chest." },
    { id: "siren_rocks", name: "Siren Rocks", event: "storm", blurb: "The rocks sing. The rocks are rude." },
  ],
  [
    { id: "doldrums_market", name: "Doldrums Market", event: "merchant", blurb: "No wind. Lots of opinions." },
    { id: "squall_line", name: "Squall Line", event: "storm", blurb: "STRONG CURRENT → extremely nautical." },
  ],
  [
    { id: "sunken_galleon", name: "Sunken Galleon", event: "treasure", blurb: "Something shiny glints below the waves." },
    { id: "channel_fog", name: "Fog of the Channel", event: "merchant", blurb: "A very polite English boat approaches." },
  ],
  [{ id: "great_white", name: "The Great White", event: "boss", blurb: "Something enormous is being dramatic nearby..." }],
];

const MERCHANTS: Record<string, { intro: string[]; options: { label: string; reply: string; morale: number; coins?: number }[] }> = {
  merchant_cove: {
    intro: ["A merchant ship pulls alongside. Its flag says HONEST PRICES in suspicious handwriting.", "Merchant: Rope? Maps? A second, backup parrot?"],
    options: [
      { label: "Trade Baba's receipts for rope", reply: "The merchant has never seen receipts this long. Rope acquired. The crew cheers.", morale: 1 },
      { label: "Haggle like Mama", reply: "The merchant pays YOU to leave. +15 coins.", morale: 1, coins: 15 },
      { label: "Let the parrot negotiate", reply: "Parrot: ARR! The merchant is deeply offended. The crew is embarrassed.", morale: -1 },
    ],
  },
  doldrums_market: {
    intro: ["No wind for miles. A floating market bobs in the stillness.", "Vendor: Snacks? Sunscreen? Emotional support oars?"],
    options: [
      { label: "Buy snacks for the whole crew", reply: "Morale improves instantly. Snacks are the real wind.", morale: 1 },
      { label: "Row with the emotional support oars", reply: "Slow, but everyone feels very supported.", morale: 0 },
      { label: "Wait for wind while complaining", reply: "The wind does not come faster. The crew sulks.", morale: -1 },
    ],
  },
  channel_fog: {
    intro: ["A very polite English boat drifts out of the fog.", "Captain: Terribly sorry — are you pirates?"],
    options: [
      { label: "No, we're a family errand", reply: "Captain: Jolly good. He points the way to London and offers a biscuit.", morale: 1 },
      { label: "Yes, and we're ADORABLE", reply: "He's charmed. He gives directions and a tin of shortbread. +10 coins in the tin.", morale: 1, coins: 10 },
      { label: "Hide behind the sail", reply: "The sail is see-through. Everybody saw. Awkward.", morale: -1 },
    ],
  },
};
const SHARK_ATTACKS = ["CHARGE INCOMING → move out of the warning lane!", "FIN CHASE! Keep moving until it loses interest.", "LEAP ZONE! The huge yellow circle is a subtle hint."];

function openPirate(env: Env, st?: PirateState) {
  const state: PirateState = st ?? newPirate();
  const reopen = () => openPirate(env, state);

  openShell(env, {
    title: "Pirate Voyage → London",
    subtitle: "Pirate Juju · one ship · one parrot · many floaty problems",
    tone: "pirate",
    build: (sh) => {
      const moraleEl = () => pips("Crew morale", state.morale, 5, "⚓", "·", "sea");
      const routeMap = () =>
        el(
          "ol",
          { class: "olw-pirate-route", attrs: { "aria-label": "Route" } },
          [
            el("li", { class: "olw-pirate-node olw-pirate-node--done", text: "Yas Marina" }),
            ...PIRATE_LAYERS.map((layer, i) => {
              const picked = state.path[i];
              const name = picked ? (layer.find((n) => n.id === picked)?.name ?? "?") : i === state.layer ? "choose" : "?";
              return el("li", { class: `olw-pirate-node ${picked ? "olw-pirate-node--done" : i === state.layer ? "olw-pirate-node--now" : ""}`, text: name });
            }),
            el("li", { class: `olw-pirate-node ${state.layer > PIRATE_LAYERS.length - 1 ? "olw-pirate-node--done" : ""}`, text: "London" }),
          ],
        );

      const loseMorale = (n = 1) => {
        state.morale = Math.max(0, state.morale - n);
        if (state.morale <= 0) {
          sink();
          return true;
        }
        return false;
      };

      const sink = () => {
        const wasBoss = state.layer === PIRATE_LAYERS.length - 1;
        sh.view((vd) => [
          head("SPLASH", "PIRATE JUJU HAS EXPERIENCED A MINOR NAVIGATIONAL INCIDENT"),
          lines([wasBoss ? "The Great White looks smug. The ship reassembles out of pure spite." : state.checkpoint > 0 ? "MID-OCEAN CHECKPOINT. No one saw that." : "SHIP REASSEMBLED. Carry on."]),
          actions(
            primary(vd, "Set sail again", () => {
              state.morale = 3;
              if (!wasBoss) {
                state.layer = state.checkpoint;
                state.path = state.path.slice(0, state.checkpoint);
              }
              state.event = null;
              render();
            }),
          ),
        ]);
      };

      const nodeDone = () => {
        const node = state.event;
        if (!node) return;
        state.path[state.layer] = node.id;
        state.event = null;
        state.layer += 1;
        if (state.layer === 3) state.checkpoint = 3;
        if (state.layer === PIRATE_LAYERS.length - 1 && quests.currentStep("q_family_jewel_heist")?.target === "pirate_voyage") {
          store.setFlag("heist_voyage_complete");
          quests.onMinigame("pirate_voyage");
          sh.flash("VOYAGE COMPLETE · London is close. Something is circling.", "good");
        }
        render();
      };

      const arrive = () => {
        // PirateVoyageScene.arriveLondon
        if (quests.currentStep("q_family_jewel_heist")?.target === "great_white_boss") quests.onMinigame("great_white_boss");
        store.unlockLocation("london");
        store.unlockLocation("london_westend");
        store.setInJeep(false);
        store.setFlag("heist_arrived_london");
        sh.view((vd) => [
          el("div", { class: "olw-story-finale" }, [el("p", { class: "olw-story-finale-big", text: "SOMEHOW... LONDON" }), el("p", { text: "Operation: Get Grandma's Jewelry Back" })]),
          lines([`Route: ${state.path.map((id) => PIRATE_LAYERS.flat().find((n) => n.id === id)?.name ?? id).join(" → ")}`, `Crew morale on arrival: ${state.morale}/5 · coins found: ${state.coins}`], "olw-story-lines--soft"),
          actions(
            primary(vd, "Go ashore in the West End", () => {
              sh.close();
              if (store.state.currentLocation === "london_westend") {
                if (quests.currentStep("q_family_jewel_heist")?.target === "london") quests.onVisit("london");
              } else env.travelTo("london_westend");
            }),
          ),
        ]);
      };

      const eventView = (node: PirateNode) =>
        sh.view((vd) => {
          const top = [routeMap(), moraleEl(), head(node.event === "boss" ? "BOSS BATTLE" : node.event.toUpperCase(), node.name, node.blurb)];
          if (node.event === "storm") {
            let wave = state.sub;
            const status = el("p", { class: "olw-story-status", text: `Wave ${wave + 1}/3 · steer when the marker hits the calm water.` });
            const tb = timingBar(vd, {
              label: "Steer!",
              speed: 0.85 + wave * 0.2,
              zone: 0.3 - wave * 0.04,
              onPress: (hit) => {
                if (hit === "miss") {
                  sh.flash("SPLASH! The ship has filed a complaint.", "bad");
                  if (loseMorale()) return;
                } else sh.flash(hit === "perfect" ? "Perfect line through the swell!" : "Over the wave. Very nautical.", "good");
                wave += 1;
                state.sub = wave;
                if (wave >= 3) {
                  state.sub = 0;
                  return nodeDone();
                }
                status.textContent = `Wave ${wave + 1}/3 · ${wave === 2 ? "← STRONG CURRENT  extremely nautical" : "the next one is bigger."}`;
                tb.setSpeed(0.85 + wave * 0.2);
                tb.setZone(0.3 - wave * 0.04);
                const m = sh.root.querySelector(".olw-story-pips--sea .olw-story-pips-row");
                if (m) m.textContent = "⚓".repeat(state.morale) + "·".repeat(5 - state.morale);
              },
            });
            return [...top, tb.el, status];
          }
          if (node.event === "merchant") {
            const m = MERCHANTS[node.id] ?? MERCHANTS.merchant_cove;
            if (state.reply) {
              const reply = state.reply;
              return [
                ...top,
                lines([reply]),
                actions(primary(vd, "Sail on", () => { state.reply = null; nodeDone(); })),
              ];
            }
            return [
              ...top,
              lines(m.intro),
              choices(
                vd,
                m.options.map((o) => ({
                  label: o.label,
                  sub: o.morale > 0 ? "crew will like this" : undefined,
                  onPick: () => {
                    state.morale = Math.min(5, state.morale + Math.max(0, o.morale));
                    if (o.coins) {
                      store.addCoins(o.coins);
                      state.coins += o.coins;
                    }
                    if (o.morale < 0 && loseMorale(-o.morale)) return;
                    state.reply = o.reply;
                    eventView(node);
                  },
                })),
              ),
            ];
          }
          if (node.event === "treasure") {
            if (state.reply) {
              const reply = state.reply;
              return [...top, lines([reply]), actions(primary(vd, "Sail on", () => { state.reply = null; nodeDone(); }))];
            }
            return [
              ...top,
              lines(["A small, extremely locked chest. The parrot is very excited.", "Parrot: TREASURE!"]),
              actions(
                primary(vd, "Crack the chest", () =>
                  runExternal(env, sh, { kind: "safe", title: `${node.name.toUpperCase()} · CHEST`, hint: "Stop the dial, then hit the pins. Pirate rules.", difficulty: 2, skipLabel: "Leave it" }, (ok) => {
                    if (ok) {
                      store.addCoins(25);
                      state.coins += 25;
                      state.morale = Math.min(5, state.morale + 1);
                      state.reply = "Gold coins and one very old biscuit. +25 coins. The crew is thrilled.";
                    } else {
                      state.morale = Math.max(1, state.morale - 1);
                      state.reply = "The chest was mostly sand. The crew pretends it's fine.";
                    }
                  }, reopen),
                ),
                button(vd, "Leave it", "olw-btn olw-btn--ghost", () => { state.reply = "You leave the chest. The parrot will never forgive you."; eventView(node); }),
              ),
            ];
          }
          // boss — THE GREAT WHITE
          const shark = meter("THE GREAT WHITE", state.shark, 5, "sea");
          const status = el("p", { class: "olw-story-status", text: SHARK_ATTACKS[state.attack % 3] });
          const tb = timingBar(vd, {
            label: "Fire the cannon",
            speed: 1,
            zone: 0.26,
            onPress: (hit) => {
              if (hit === "miss") {
                sh.flash("POW! Excellent shot at the general idea of a shark.", "bad");
                if (loseMorale()) return;
                const m = sh.root.querySelector(".olw-story-pips--sea .olw-story-pips-row");
                if (m) m.textContent = "⚓".repeat(state.morale) + "·".repeat(5 - state.morale);
              } else {
                state.shark = Math.max(0, state.shark - (hit === "perfect" ? 2 : 1));
                shark.set(state.shark);
                sh.flash(["BONK!", "POW!", "SPLASH!"][state.shark % 3] + ` · ${state.shark} bonks remaining`, "good");
                if (state.shark <= 0) {
                  state.path[state.layer] = node.id;
                  state.layer += 1;
                  state.event = null;
                  sh.flash("BOSS DEFEATED · The Great White has reconsidered its life choices.", "good");
                  vd.timeout(arrive, 900);
                  return;
                }
              }
              state.attack += 1;
              status.textContent = SHARK_ATTACKS[state.attack % 3];
              tb.setSpeed(1 + (5 - state.shark) * 0.12);
            },
          });
          return [...top, el("div", { class: "olw-pirate-shark", attrs: { "aria-hidden": "true" }, text: "🦈" }), shark.el, tb.el, status];
        });

      const render = () => {
        if (state.event) return eventView(state.event);
        if (state.layer >= PIRATE_LAYERS.length) return arrive();
        const layer = PIRATE_LAYERS[state.layer];
        sh.view((vd) => [
          routeMap(),
          moraleEl(),
          head(`LEG ${state.layer + 1}/${PIRATE_LAYERS.length}`, layer.length > 1 ? "Choose your heading" : "Straight ahead", "Reach London with crew morale above zero."),
          choices(
            vd,
            layer.map((n) => ({
              label: n.name,
              sub: n.blurb,
              icon: n.event === "storm" ? "🌊" : n.event === "merchant" ? "⛵" : n.event === "treasure" ? "💰" : "🦈",
              onPick: () => {
                state.event = n;
                state.sub = 0;
                state.reply = null;
                if (n.event === "boss") {
                  state.shark = 5;
                  state.attack = 0;
                }
                render();
              },
            })),
          ),
        ]);
      };
      render();
      onKeyAdvance(sh);
    },
  });
}

interface PirateState {
  layer: number;
  path: string[];
  morale: number;
  checkpoint: number;
  event: PirateNode | null;
  sub: number;
  reply: string | null;
  shark: number;
  attack: number;
  coins: number;
}
function newPirate(): PirateState {
  const st: PirateState = { layer: 0, path: [], morale: 3, checkpoint: 0, event: null, sub: 0, reply: null, shark: 5, attack: 0, coins: 0 };
  // already past the voyage (PirateVoyageScene jumps straight to the boss)
  if (quests.currentStep("q_family_jewel_heist")?.target === "great_white_boss") {
    st.layer = PIRATE_LAYERS.length - 1;
    st.checkpoint = st.layer;
    st.path = PIRATE_LAYERS.slice(0, -1).map((l) => l[0].id);
  }
  return st;
}

// ===========================================================================
// QUEST ACTIVITIES — QuestActivityScene
// ===========================================================================

function openQuestActivity(env: Env, activityArg?: string) {
  const activity: QuestActivityId = (QUEST_ACTIVITIES as readonly string[]).includes(activityArg ?? "") ? (activityArg as QuestActivityId) : "apartment_1701";
  const titles: Record<QuestActivityId, [string, string]> = {
    apartment_1701: ["The Residences · T8", "Apartment 1701"],
    chloe_thesis: ["Oadby · thesis chase", "Tea in Oadby"],
    nour_visit: ["Frankfurt · doorbells", "Brother in Germany"],
    fry_thief: ["Hudayriyat · fry patrol", "Food trucks"],
  };
  openShell(env, {
    title: titles[activity][1],
    subtitle: titles[activity][0],
    tone: "activity",
    build: (sh) => {
      const done = (name: string, ls: string[]) =>
        sh.view((vd) => [head("QUEST MOMENT", name), lines(ls), actions(primary(vd, "Back to the world", () => sh.close()))]);

      // ---- apartment 1701 ----
      const apartment = () => {
        const hallway = () => {
          const doors = [
            { n: "1703", line: "A tiny dog barks with the confidence of a building manager." },
            { n: "1702", line: "Someone whispers: delivery? Then remembers they ordered nothing." },
            { n: "1701", line: "" },
          ];
          sh.view((vd) => [
            head("FLOOR 17 · FIND 1701", "Three doors. One package.", "Two opportunities to be politely wrong."),
            choices(
              vd,
              doors.map((d) => ({
                label: `Apartment ${d.n}`,
                icon: d.n === "1701" ? "📦" : "🚪",
                onPick: () => {
                  if (d.n !== "1701") return sh.flash(d.line, "info");
                  quests.onInteract("apartment_1701_package");
                  store.addNote("note_apartment_1701");
                  store.unlockMemory("mem_downtown");
                  store.capturePhoto({ id: "photo_apartment_1701", title: "The view from 1701", locationId: "dubai_downtown", day: store.state.currentDay, timeOfDay: store.state.timeOfDay, companionId: "moomoo", caption: "A tiny framed Downtown view left outside apartment 1701." });
                  deliverMessage({ id: "msg_apartment_1701", sender: "moomoo", body: "did you find it? home is wherever you are 🤍", unlock: {} });
                  done("Moomoo's package", ["Inside: a tiny framed photo of the Downtown view.", "The note says: ‘Home is wherever you are. Even on the 17th floor.’", "Message from Moomoo: Did you find it? 🤍"]);
                },
              })),
              "olw-story-choices--row",
            ),
          ]);
        };
        if (quests.currentStep("q_residences")?.target !== "apartment_1701_package") {
          return done("The Residences", ["The lobby smells like new marble. Nothing waiting for you here right now."]);
        }
        const wrong = ["Floor {n}. A man with a yoga mat nods at you.", "Floor {n}. Wrong. The elevator seems pleased.", "Floor {n}. Someone's hallway smells amazing. Not yours.", "Floor {n}. The doors open onto a very serious meeting."];
        let tries = 0;
        sh.view((vd) => {
          const display = el("div", { class: "olw-elevator-display", text: "G" });
          const keys = el("div", { class: "olw-elevator-keys" });
          let riding = false;
          for (let f = 17; f >= 1; f--) {
            keys.append(
              button(vd, `${f}`, "olw-elevator-key", () => {
                if (riding) return;
                if (f !== 17) {
                  display.textContent = `${f}`;
                  sh.flash(wrong[tries++ % wrong.length].replace("{n}", `${f}`), "info");
                  return;
                }
                riding = true;
                const floors = [2, 5, 8, 11, 14, 16, 17];
                floors.forEach((n, i) => vd.timeout(() => (display.textContent = `${n}`), 230 * (i + 1)));
                vd.timeout(() => {
                  sh.flash("DING. Floor 17. Please collect your dignity.", "good");
                  vd.timeout(hallway, 700);
                }, 1850);
              }),
            );
          }
          return [head("THE RESIDENCES · T8", "Find floor 17", "The elevator has seventeen opinions."), display, keys];
        });
      };

      // ---- floating targets arena (thesis pages / snacks) ----
      const arena = (vd: Disposer, o: { count: number; glyphs: string[]; label: string; fall: boolean; onCatch: (caught: number) => void }) => {
        const box = el("div", { class: `olw-arena${o.fall ? " olw-arena--fall" : ""}` });
        let caught = 0;
        const items = Array.from({ length: o.count }, (_, i) => {
          const b = button(vd, o.glyphs[i % o.glyphs.length], "olw-arena-item", () => {
            if (o.fall) {
              it.x = 0.08 + Math.random() * 0.84;
              it.y = -0.1 - Math.random() * 0.4;
            } else {
              b.remove();
              it.gone = true;
            }
            caught += 1;
            b.classList.add("olw-arena-item--pop");
            o.onCatch(caught);
          });
          b.setAttribute("aria-label", `${o.label} ${i + 1}`);
          const it = { b, x: 0.1 + ((i * 0.37) % 0.8), y: o.fall ? -Math.random() * 0.9 : 0.15 + ((i * 0.53) % 0.7), phase: i * 0.65, speed: 0.12 + Math.random() * 0.12, gone: false };
          box.append(b);
          return it;
        });
        loop(vd, (dt, now) => {
          for (const it of items) {
            if (it.gone) continue;
            let x = it.x;
            let y = it.y;
            if (o.fall) {
              it.y += it.speed * (dt / 1000);
              if (it.y > 1.05) {
                it.y = -0.1 - Math.random() * 0.3;
                it.x = 0.08 + Math.random() * 0.84;
              }
              x = it.x + Math.sin(now * 0.003 + it.phase) * 0.02;
              y = it.y;
            } else {
              x = it.x + Math.sin(now * 0.0012 + it.phase) * 0.08;
              y = it.y + Math.cos(now * 0.0016 + it.phase) * 0.06;
            }
            it.b.style.left = `${Math.max(0.03, Math.min(0.97, x)) * 100}%`;
            it.b.style.top = `${y * 100}%`;
            it.b.style.transform = `translate(-50%, -50%) rotate(${Math.sin(now * 0.003 + it.phase) * 12}deg)`;
          }
        });
        return box;
      };

      // ---- Chloe's thesis ----
      const chloe = () => {
        const def = NPCS.find((n) => n.id === "chloe");
        const talk = quests.onTalk("chloe", def?.dialogue ?? ["JUJU?!"]);
        const intro = ["JUJU?! You actually came!", "A gust of wind chooses this exact moment to submit my thesis to the entire neighbourhood.", ...talk.lines.filter((l) => !l.startsWith("(New objective"))];
        const play = () =>
          sh.view((vd) => {
            const status = el("p", { class: "olw-story-status", text: "THESIS PAGES  0/8   ·   Tap them before peer review does" });
            let finished = false;
            return [
              head("OADBY · THESIS CHASE", "Catch the escaped pages"),
              arena(vd, {
                count: 8,
                glyphs: ["📄"],
                label: "Thesis page",
                fall: false,
                onCatch: (n) => {
                  status.textContent = `THESIS PAGES  ${n}/8   ·   Wind: academically unhelpful`;
                  if (n >= 8 && !finished) {
                    finished = true;
                    quests.onMinigame("chloe_thesis");
                    vd.timeout(() => done("Chloe", ["Eight pages rescued. One abstract slightly damp.", "Come inside. Tea is on me, and my thesis is staying under a mug."]), 400);
                  }
                },
              }),
              status,
            ];
          });
        if (quests.currentStep("q_chloe")?.target !== "chloe_thesis") return done("Chloe", intro);
        sh.view((vd) => [head("OADBY", "Chloe"), lines(intro), actions(primary(vd, "Chase the pages", play))]);
      };

      // ---- Nour ----
      const nour = () => {
        const snacks = () =>
          sh.view((vd) => {
            let caught = 0;
            let finished = false;
            const status = el("p", { class: "olw-story-status" });
            const finish = (skipped: boolean) => {
              if (finished) return;
              finished = true;
              quests.onMinigame("nour_snacks");
              done("Nour", [skipped ? "Snack catching skipped. The sibling chatting begins immediately." : "Excellent catch. Nour pretends every snack was thrown perfectly.", "Family, no matter the distance."]);
            };
            const start = performance.now();
            loop(vd, (_dt, now) => {
              const left = Math.max(0, 20 - Math.floor((now - start) / 1000));
              status.textContent = `SNACKS CAUGHT  ${caught}/8   ·   0:${String(left).padStart(2, "0")}`;
              if (left <= 0) finish(false);
            });
            return [
              head("NOUR'S SNACK WELCOME", "Catch the flying snacks"),
              arena(vd, { count: 7, glyphs: ["🥨", "🍪", "🥐", "🍫"], label: "Snack", fall: true, onCatch: (n) => { caught = n; if (n >= 8) finish(false); } }),
              status,
              actions(button(vd, "Skip snacks and chat", "olw-btn olw-btn--ghost", () => finish(true))),
            ];
          });
        const doors = [
          { n: "2B", line: "Wrong flat. A very serious accordion answers." },
          { n: "2C", line: "correct" },
          { n: "2D", line: "Wrong flat. Someone offers directions and one potato." },
        ];
        sh.view((vd) => [
          head("FRANKFURT · DOORBELLS", "Find Nour's flat", "Wrong doors are harmless and unusually hospitable."),
          choices(
            vd,
            doors.map((d) => ({
              label: `Ring ${d.n}`,
              icon: "🔔",
              onPick: () => {
                if (d.line !== "correct") return sh.flash(d.line, "info");
                const def = NPCS.find((n) => n.id === "nour");
                const talk = quests.onTalk("nour", def?.dialogue ?? []);
                sh.view((vd2) => [
                  head("FLAT 2C", "Nour"),
                  lines(["The correct door opens. Immediate sibling hug. Zero personal space.", "Nour: I knew you'd find it! Ignore the other flats. They are part of the experience.", ...talk.lines.filter((l) => !l.startsWith("(New objective"))]),
                  actions(primary(vd2, quests.currentStep("q_nour")?.target === "nour_snacks" ? "Snack time" : "Hug again", () => (quests.currentStep("q_nour")?.target === "nour_snacks" ? snacks() : done("Nour", ["Family, no matter the distance."])))),
                ]);
              },
            })),
            "olw-story-choices--row",
          ),
        ]);
      };

      // ---- fry thief ----
      const fries = () => {
        const play = () =>
          sh.view((vd) => {
            let saves = 0;
            let finished = false;
            let phase = 0;
            const start = performance.now();
            const gull = el("div", { class: "olw-gull", attrs: { "aria-hidden": "true" }, text: "🕊" });
            const box = el("div", { class: "olw-arena olw-arena--beach" }, [gull, el("div", { class: "olw-fries", text: "🍟 FRIES" })]);
            const status = el("p", { class: "olw-story-status" });
            let dive = 0;
            const finish = () => {
              if (finished) return;
              finished = true;
              quests.onMinigame("fry_thief");
              done("Hudayriyat", [saves >= 4 ? "All fries accounted for. The seagull leaves with professional respect." : "A few fries were lost in action. The important fries survived.", "Moomoo: Best drive. Best trucks. Most dramatic chips."]);
            };
            const guard = () => {
              if (finished) return;
              if (dive > 0.62) {
                saves += 1;
                phase += Math.PI;
                sh.flash(saves >= 4 ? "Fries defended!" : "Not today, tiny pirate.", "good");
                if (saves >= 4) vd.timeout(finish, 500);
              } else sh.flash("Too early. The seagull files this information.", "bad");
            };
            loop(vd, (_dt, now) => {
              const elapsed = (now - start) / 1000;
              const left = Math.max(0, 22 - Math.floor(elapsed));
              const t = elapsed * 1.8 + phase;
              dive = (Math.sin(t) + 1) / 2;
              gull.style.left = `${50 + Math.cos(t * 0.7) * (40 - dive * 26)}%`;
              gull.style.top = `${8 + dive * 62}%`;
              gull.classList.toggle("olw-gull--dive", dive > 0.62);
              status.textContent = `FRIES SAVED  ${saves}/4   ·   guard when the gull dives   ·   0:${String(left).padStart(2, "0")}`;
              if (left <= 0) finish();
            });
            onKey(vd, (code) => {
              if (PRESS.has(code)) guard();
            });
            return [head("HUDAYRIYAT · FRY PATROL", "Defend the fries"), box, status, actions(button(vd, "Guard the fries!", "olw-btn olw-btn--gold olw-story-timing-btn", guard))];
          });
        sh.view((vd) => [
          head("HUDAYRIYAT", "Food trucks by the water"),
          lines(["Order up. Food trucks by the water were the plan.", "A seagull has also reviewed the menu and selected: your fries."]),
          actions(primary(vd, "Guard the fries", play)),
        ]);
      };

      if (activity === "apartment_1701") apartment();
      else if (activity === "chloe_thesis") chloe();
      else if (activity === "nour_visit") nour();
      else fries();
      onKeyAdvance(sh);
    },
  });
}

// ===========================================================================
// mount
// ===========================================================================

export function mountStoryScenes(ctx: UIContext, host: ModalHost, travelTo: (id: string) => void) {
  const { d } = ctx;
  const env: Env = { ctx, host, travelTo };

  const open = (req: StoryRequest) => {
    switch (req.scene) {
      case "romance":
        return openRomance(env, req.activity);
      case "wedding":
        return openWedding(env);
      case "tigor":
        return openTigor(env);
      case "heist":
        return openHeist(env);
      case "pirate":
        return openPirate(env);
      case "questActivity":
        return openQuestActivity(env, req.activity);
    }
  };

  /** Wait for an open dialogue to finish (a quest-accept conversation, say). */
  const whenIdle = (fn: () => void) => {
    if (!ctx.dialogueOpen) return fn();
    const id = d.interval(() => {
      if (ctx.dialogueOpen) return;
      window.clearInterval(id);
      fn();
    }, 150);
  };

  d.on(uiEvents, "storyScene", (req?: StoryRequest) => {
    if (!req?.scene) return;
    whenIdle(() => open(req));
  });

  return { open };
}
