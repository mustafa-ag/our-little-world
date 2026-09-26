// ADNOC career centre — the 3D build's replacement for the Phaser
// AdnocHQScene (floors, reception, badge camera, desk, lab, elevator, career
// board, boardroom, rooftop) and AdnocTaskScene (daily jobs + story missions).
// Instead of a separate walkable HQ it is one tabbed modal; every job and
// story mission runs as a DOM minigame. Career rules (ranks, XP, salary,
// workdays, promotions) come straight from game/systems/adnoc.ts.
//
// Flow: worldController's ADNOC HQ zone emits "enterAdnoc" -> this modal.
// Playing a minigame closes the modal, and its onDone reopens it on the same
// tab with a notice card describing what happened.
import { store } from "../../game/systems/store";
import { uiEvents, type MiniGameSpec } from "../../game/systems/controls";
import * as quests from "../../game/systems/quests";
import {
  ADNOC_RANKS,
  ADNOC_WORK_TASKS,
  adnocRankAtLeast,
  adnocRankDef,
  adnocRankIndex,
  type AdnocFloor,
  type AdnocRank,
  type AdnocWorkTaskId,
} from "../../game/data/adnoc";
import { questById } from "../../game/data/quests";
import {
  addAdnocXp,
  awardStoryXpOnce,
  beginWorkday,
  finishWorkday,
  incrementAdnocStat,
  promotionTarget,
  recordWorkTask,
  refreshAdnocUnlockFlags,
  setAdnocRank,
  type WorkdayReward,
} from "../../game/systems/adnoc";
import { button, el, type Disposer } from "./dom";
import type { UIContext } from "./context";
import type { ModalHost } from "./modal";

type Kind = MiniGameSpec["kind"];
export type AdnocTab = "hq" | "tasks" | "career" | "control" | "board";
type TaskType = "lab" | "meeting" | "data" | "inspection" | "pitch";

interface Notice {
  title: string;
  lines: string[];
  tone: "info" | "good" | "promo";
}

// ---- static data -----------------------------------------------------------

const FLOOR_LABELS: Record<AdnocFloor, string> = {
  ground: "Ground floor · Lobby",
  engineering: "Engineering floor",
  operations: "Operations floor",
  management: "Management floor",
  executive: "Executive floor",
};

const TYPE_LABELS: Record<TaskType, string> = {
  lab: "Lab work",
  meeting: "Meeting",
  data: "Data entry",
  inspection: "Inspection",
  pitch: "Pitch",
};

/** Which DOM minigame each repeatable ADNOC job plays (AdnocTaskScene builders). */
const TASK_PLAY: Record<AdnocWorkTaskId, { type: TaskType; kind: Kind; hint: string }> = {
  sample_sort: { type: "lab", kind: "lab", hint: "Match each cartoon sample to its analyser, in order." },
  valve_panic: { type: "inspection", kind: "timing", hint: "Hit each flashing valve the moment it glows." },
  pipe_route: { type: "lab", kind: "lockpick", hint: "Nudge each pipe section until it clicks into the route." },
  printer_boss: { type: "data", kind: "showdown", hint: "The printer blinks. Press the big green button before it does." },
  inbox_defence: { type: "data", kind: "timing", hint: "Catch the urgent cards. Let the barrel-prize spam fly past." },
  safety_walk: { type: "inspection", kind: "stairs", hint: "Walk the floor and step over every suspicious banana peel." },
  lost_badge: { type: "inspection", kind: "safe", hint: "Khalid's locker. Three digits. He definitely wrote them down somewhere." },
  coffee_run: { type: "meeting", kind: "coffee", hint: "Three coffees for the meeting room. The tray has opinions." },
  control_lights: { type: "inspection", kind: "lab", hint: "Watch the console sequence, then run it back." },
  meeting_escape: { type: "pitch", kind: "pitch", hint: "Present your way to the door before somebody adds another slide." },
  hard_hat_hunt: { type: "inspection", kind: "stairs", hint: "Five wandering hard hats. Keep moving before the timer notices." },
  paperwork_stack: { type: "data", kind: "timing", hint: "File each report the moment it lands over its bay." },
};

const DEPARTMENTS: Record<AdnocRank, string> = {
  visitor: "Lobby guest · no department (yet)",
  new_hire: "Graduate Programme · Engineering",
  chemical_engineer: "Process Engineering · Lab Team",
  senior_engineer: "Operations · Process Safety",
  team_lead: "Operations · Team Juju (four engineers and one tiny plant)",
  engineering_manager: "Engineering Management",
  director: "Engineering Directorate",
  ceo: "Executive Office",
};

const UNLOCKS: Record<AdnocRank, string[]> = {
  visitor: ["A visitor sticker"],
  new_hire: ["Employee badge", "Engineering floor access", "One desk, one pen, one tiny plant"],
  chemical_engineer: ["Paid workdays at the task board", "Engineering Blue outfit", "Eight daily job types"],
  senior_engineer: ["Operations floor access", "Control Room tab", "Control Room Lights + Hard Hat Hunt jobs"],
  team_lead: ["Team-lead desk (the plant came too)", "Escaping the Meeting job"],
  engineering_manager: ["Management floor + Juju's own office", "Paperwork Stack job"],
  director: ["Executive floor access", "Boardroom tab", "Executive Blue outfit"],
  ceo: ["The big office", "CEO Blue outfit", "Authority to cancel half the meetings"],
};

const STORY_QUESTS = [
  "q_adnoc_pressure_problem",
  "q_adnoc_paperclip_incident",
  "q_adnoc_team_lead",
  "q_adnoc_control_room",
  "q_adnoc_director",
  "q_adnoc_ceo",
];

const BADGE_POSES = ["surprisingly reasonable", "very serious", "visibly alarmed", "suspicious of cameras", "almost asleep"];

interface StoryStep {
  /** Button label. */
  label: string;
  /** Where in HQ this happens (flavour). */
  place: string;
  /** Minigame steps: which DOM game plays and its title. */
  game?: { kind: Kind; title: string; hint: string; taps?: number };
  /** Lines shown in the notice once the step is done. */
  lines: string[];
  /** Extra career effects after the quest advances. Returns a promotion, if any. */
  after?: () => AdnocRank | void;
}

/** Every ADNOC story step (q_adnoc_engineer + the six career stories). */
const STORY: Record<string, StoryStep> = {
  adnoc_hq: {
    label: "Walk into HQ",
    place: "Main entrance",
    lines: ["Blue glass, cold air, a lobby the size of a small country."],
  },
  adnoc_reception: {
    label: "Report to reception",
    place: "Ground floor · Reception",
    lines: ["Receptionist: Name?", "Juju: Juju.", "Receptionist: Department?", "Juju: ...yes.", "Receptionist: Engineering. Badge camera is on your right."],
  },
  adnoc_badge_photo: {
    label: "Take the badge photo",
    place: "Ground floor · Badge camera",
    game: { kind: "badge_photo", title: "SECURITY BADGE PHOTO", hint: "Pick the pose Security will have to look at forever." },
    lines: [],
  },
  adnoc_engineering_floor: {
    label: "Take the elevator to Engineering",
    place: "Elevator",
    lines: ["The elevator displays FLOOR 4 for a worrying amount of time.", "Engineering. Finally."],
  },
  adnoc_desk: {
    label: "Find Juju's desk",
    place: "Engineering floor",
    lines: ["Computer. Chair. One pen.", "A tiny plant that has already seen too much.", "The laboratory is across the floor."],
  },
  adnoc_sample_sort: {
    label: "Sort the first samples",
    place: "Engineering floor · Sample lab",
    game: { kind: "lab", title: "FIRST SAMPLE SORT", hint: "Calm hands, clear notes. Repeat the flask order." },
    lines: ["The analysers hum approvingly.", "Now pick up the finished report."],
  },
  adnoc_results: {
    label: "Pick up the finished report",
    place: "Engineering floor · Sample lab",
    lines: ["Lab machine: RESULT: PERFECT.", "Second machine: SOMEHOW ALSO PERFECT.", "Carry the report to Alya. It will not walk itself."],
    after: () => store.setFlag("adnoc_carrying_results"),
  },
  adnoc_manager: {
    label: "Give Alya the report",
    place: "Engineering floor · Alya",
    lines: ["Alya: Clean results. Clear notes.", "Welcome to the engineering team."],
    after: () => {
      store.setFlag("adnoc_carrying_results", false);
      setAdnocRank("chemical_engineer");
      addAdnocXp(15);
      store.unlockOutfit("engineer_blue");
      return "chemical_engineer";
    },
  },
  // ---- The Pressure Problem ----
  adnoc_pressure_alarm: {
    label: "Answer the alarm",
    place: "Operations floor",
    lines: ["BEEP BEEP BEEP.", "Coworker: Don't panic.", "Everyone else: *immediately panics*", "Route the blinking pipes first."],
  },
  adnoc_pressure_pipe: {
    label: "Route the pressure pipes",
    place: "Operations floor · Pipe wall",
    game: { kind: "lockpick", title: "PRESSURE PIPES", hint: "Line each blinking pipe section up with the route." },
    lines: ["The pipes stop blinking. One of them sighs."],
  },
  adnoc_pressure_valves: {
    label: "Run the valve sequence",
    place: "Operations floor · Valves",
    game: { kind: "timing", title: "VALVE PANIC", hint: "Turn each valve the moment it glows." },
    lines: ["Valves: closed. Coworkers: slightly less panicked."],
  },
  adnoc_pressure_console: {
    label: "Hit the emergency console",
    place: "Control room",
    game: { kind: "lab", title: "EMERGENCY CONSOLE", hint: "Remember the console lights, then run them back." },
    lines: ["Everything is quiet. Except one tiny psssss.", "You handled that too."],
    after: () => {
      awardStoryXpOnce("adnoc_pressure_story_xp", 30);
      setAdnocRank("senior_engineer");
      return "senior_engineer";
    },
  },
  // ---- The Paperclip Incident ----
  adnoc_paperclip_start: {
    label: "Confront Rami",
    place: "Engineering floor · Cubicles",
    lines: ["Rami: I'll present this report.", "Juju: You'll present MY report?", "Rami: Our report.", "*paperclip flick*", "Juju: ...right."],
  },
  adnoc_paperclip_boss: {
    label: "Enter the paperclip arena",
    place: "Engineering floor · Cubicles",
    game: { kind: "showdown", title: "OFFICE BOSS · THE CREDIT STEALER", hint: "Flick your harmless paperclip before Rami does." },
    lines: ["Rami's ego: deflated. Rami's paperclip: confiscated."],
  },
  adnoc_rival_problem: {
    label: "Fix what Rami didn't understand",
    place: "Engineering floor",
    game: { kind: "safe", title: "THIRTY-SECOND ENGINEERING FIX", hint: "Find the three numbers Rami never checked." },
    lines: ["Fixed in thirty seconds. Rami's position was open for almost four."],
  },
  adnoc_move_plant: {
    label: "Move the tiny plant to the team-lead desk",
    place: "Engineering floor · New desk",
    lines: ["The desk is bigger.", "The tiny plant is coming with me."],
    after: () => {
      awardStoryXpOnce("adnoc_paperclip_story_xp", 35);
      setAdnocRank("team_lead");
      store.setFlag("adnoc_tiny_plant_moved");
      return "team_lead";
    },
  },
  // ---- Team Lead for a Day ----
  adnoc_team_lead_start: {
    label: "Start the team-lead rush",
    place: "Operations floor · Team board",
    lines: ["TASKS REMAINING: 4", "TEAM MORALE: cautiously optimistic", "Solve what you can. Perfection has been removed from the calendar."],
  },
  adnoc_team_lead_tasks: {
    label: "Help four coworkers",
    place: "Operations floor",
    game: { kind: "stairs", title: "TEAM LEAD FOR A DAY", hint: "Desk to desk to desk before the meeting grows.", taps: 12 },
    lines: ["The team survived, morale survived, and the printer is considering its choices."],
    after: () => {
      awardStoryXpOnce("adnoc_teamlead_story_xp", 35);
      setAdnocRank("engineering_manager");
      return "engineering_manager";
    },
  },
  // ---- The Control Room Gauntlet ----
  adnoc_control_start: {
    label: "Enter the maintenance corridor",
    place: "Operations floor",
    lines: ["Operations: Several fictional systems are cascading.", "Juju: Before lunch?", "Operations: Ideally before the coffee gets cold."],
  },
  adnoc_steam_corridor: {
    label: "Run the steam corridor",
    place: "Maintenance corridor",
    game: { kind: "timing", title: "MAINTENANCE CORRIDOR", hint: "Move between the dramatic steam bursts." },
    lines: ["Through the steam. Hair: survived, mostly."],
  },
  adnoc_control_circuits: {
    label: "Repair the circuit routes",
    place: "Control room · Circuit wall",
    game: { kind: "lockpick", title: "CONTROL CIRCUIT ROUTE", hint: "Seat each circuit contact on the green." },
    lines: ["Three circuits, three satisfying clicks."],
  },
  adnoc_control_memory: {
    label: "Repeat the control sequence",
    place: "Control room",
    game: { kind: "lab", title: "CONTROL ROOM LIGHTS", hint: "Remember the light sequence, then run it back." },
    lines: ["Sequence accepted. The alarms get quieter."],
  },
  adnoc_console_race: {
    label: "Race to the final console",
    place: "Control room · Locked console",
    game: { kind: "showdown", title: "FINAL CONSOLE RACE", hint: "Slam the console the instant it unlocks." },
    lines: ["The countdown stopped.", "The coffee machine produced one perfect cup."],
    after: () => {
      awardStoryXpOnce("adnoc_control_story_xp", 40);
      setAdnocRank("director");
      store.unlockOutfit("executive_blue");
      return "director";
    },
  },
  // ---- Director's Rounds ----
  adnoc_director_start: {
    label: "Begin the Director's rounds",
    place: "Management floor",
    lines: ["Alya: Morning, Director Juju.", "Juju: Please never say it that seriously.", "Three employee requests need an actual walk around HQ."],
  },
  adnoc_director_inspection: {
    label: "Inspect HQ",
    place: "Every floor",
    game: { kind: "photo", title: "DIRECTOR'S HQ INSPECTION", hint: "Snap each fixed request for the report — wait for a clean frame." },
    lines: ["Printer: fixed. Coffee: flowing. Snack drawer: noted."],
  },
  adnoc_director_briefing: {
    label: "Deliver the Director's briefing",
    place: "Management floor · Conference room",
    lines: ["Alya: Inspection complete. Teams supported. Snack drawer noted.", "The board would like a word."],
    after: () => {
      awardStoryXpOnce("adnoc_director_story_xp", 25);
    },
  },
  // ---- The Final Promotion ----
  adnoc_final_promotion: {
    label: "Take the executive elevator",
    place: "Elevator · Executive floor",
    lines: ["The executive elevator plays very calm music.", "It does not help."],
  },
  adnoc_boardroom_walk: {
    label: "Walk to the presentation area",
    place: "Boardroom",
    lines: ["The presentation screen wakes up.", "BOARD CONFIDENCE: cautiously blue.", "Find the missing information before slide 14 becomes only shawarma."],
  },
  adnoc_board_info: {
    label: "Collect the missing information",
    place: "Boardroom",
    game: { kind: "lab", title: "BOARDROOM · MISSING INFORMATION", hint: "Put the missing figures back in the right order." },
    lines: ["Slide 14: restored. Shawarma content: reduced to tasteful."],
  },
  adnoc_board_questions: {
    label: "Survive the question gauntlet",
    place: "Boardroom",
    game: { kind: "pitch", title: "QUESTION GAUNTLET", hint: "Answer each question while the board's confidence is green." },
    lines: ["The board nods. Several of them at the same time."],
  },
  adnoc_ceo_crisis: {
    label: "Pass the final career crisis",
    place: "Boardroom",
    game: { kind: "lockpick", title: "THE FINAL CAREER CRISIS", hint: "Steady hands. One pin at a time." },
    lines: ["Crisis: handled. The board has left the room to whisper."],
  },
  adnoc_board_return: {
    label: "Return to the waiting board",
    place: "Boardroom",
    lines: ["Board member: Congratulations.", "Juju: Do I get the big office?", "Yes.", "Juju: And control of the meeting schedule?", "Yes.", "Juju: Cancel half of them."],
    after: () => {
      awardStoryXpOnce("adnoc_ceo_story_xp", 40);
      setAdnocRank("ceo");
      store.unlockOutfit("ceo_blue");
      return "ceo";
    },
  },
  adnoc_rooftop: {
    label: "Take the rooftop victory lap",
    place: "Rooftop",
    lines: ["Blue glass. Gold sunset. Coworkers cheering below.", "CEO Juju: Tomorrow we work. Today we dramatically look at the skyline."],
    after: () => store.setFlag("adnoc_ceo_office_unlocked"),
  },
};

const CONTROL_LINES = [
  ["Pressure: steady.", "Flow: steady.", "One screen is showing a screensaver of a very calm fish."],
  ["Every gauge is green except one, which is teal, which is technically fine."],
  ["Night shift left a note: 'Nothing happened. Suspiciously nothing.'"],
  ["The big wall map pulses gently, like the building is breathing."],
  ["Omar reports everything is under control because he saw you arrive."],
];

const CONTROL_ACTIONS = [
  { id: "sweep", label: "Run the morning systems sweep", xp: 8, line: "Sweep complete. Every light reported in, even the shy one." },
  { id: "drill", label: "Call a surprise safety drill", xp: 10, line: "Everyone found the assembly point. Khalid found his badge on the way." },
  { id: "coach", label: "Coach the night shift handover", xp: 9, line: "Handover notes: now legible. Morale: noticeably up." },
];

interface Decision {
  title: string;
  prompt: string;
  options: { label: string; detail: string; xp: number; coins?: number; hearts?: number; result: string }[];
}

const DECISIONS: Decision[] = [
  {
    title: "The Research Budget",
    prompt: "The board wants one flagship project funded this quarter.",
    options: [
      { label: "Cleaner process labs", detail: "Safe, steady, very Juju.", xp: 18, result: "Approved unanimously. The lab team sends a thank-you plant." },
      { label: "A bold new pilot plant", detail: "Big risk, big headline.", xp: 26, coins: -10, result: "Bold. Expensive. The press release has three exclamation marks." },
      { label: "Train every graduate", detail: "Invest in people first.", xp: 22, hearts: 1, result: "Forty graduates now quote you in meetings." },
    ],
  },
  {
    title: "The Meeting Problem",
    prompt: "An audit found the average engineer spends 11 hours a week in meetings.",
    options: [
      { label: "Cancel half of them", detail: "The people's choice.", xp: 20, hearts: 1, result: "Productivity up. Calendar finally has white space." },
      { label: "Standing meetings only", detail: "Short by design.", xp: 16, result: "Meetings now last exactly as long as people's patience." },
      { label: "One meeting to discuss it", detail: "Deeply ironic.", xp: 10, result: "The meeting about meetings ran over. Nobody is surprised." },
    ],
  },
  {
    title: "The Snack Drawer",
    prompt: "The executive snack budget has become a board-level topic. Again.",
    options: [
      { label: "Karak for every floor", detail: "Morale is infrastructure.", xp: 18, coins: -5, result: "The coffee machine now dispenses karak by title." },
      { label: "Healthy snacks only", detail: "Bold. Unpopular.", xp: 14, result: "Dates and almonds. A quiet mourning for the chocolate." },
      { label: "Keep the budget, add dates", detail: "A diplomatic middle.", xp: 20, result: "Everyone is equally, mildly happy. Diplomacy." },
    ],
  },
  {
    title: "The Partnership",
    prompt: "A university wants to partner on a joint research programme.",
    options: [
      { label: "Sign a five-year deal", detail: "Long-term thinking.", xp: 24, result: "The university names a scholarship after the tiny plant." },
      { label: "Start with a summer pilot", detail: "Measured and sensible.", xp: 18, result: "A dozen interns arrive. The printer is nervous." },
      { label: "Politely decline", detail: "Focus on the core.", xp: 10, result: "Focus maintained. A slightly awkward email sent." },
    ],
  },
];

// ---- helpers ---------------------------------------------------------------

function hash(seed: string) {
  let v = 2166136261;
  for (let i = 0; i < seed.length; i++) v = Math.imul(v ^ seed.charCodeAt(i), 16777619);
  return v >>> 0;
}

const rank = () => store.state.adnocRank;
const def = () => adnocRankDef(rank());
const weekIndex = () => Math.floor(Math.max(0, store.state.currentDay - 1) / 7);
const difficulty = () => (adnocRankAtLeast(rank(), "director") ? 3 : adnocRankAtLeast(rank(), "senior_engineer") ? 2 : 1);
const taskDef = (id: AdnocWorkTaskId) => ADNOC_WORK_TASKS.find((t) => t.id === id)!;

/** The current ADNOC story step, first-day quest first (AdnocHQScene.currentCareerTarget). */
function careerTarget(): { questId: string; target: string; hint: string } | undefined {
  for (const id of ["q_adnoc_engineer", ...STORY_QUESTS]) {
    if (quests.statusOf(id) !== "active") continue;
    const step = quests.currentStep(id);
    if (step) return { questId: id, target: step.target, hint: step.hint };
  }
  return undefined;
}

function stars(n: number) {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));
}

function rewardNotice(reward: WorkdayReward): Notice {
  return {
    title: "Work day complete",
    tone: "good",
    lines: [
      stars(reward.stars),
      `Base salary +${reward.salary} · bonus +${reward.bonus}`,
      `Career XP +${reward.xp}`,
      "Time moved forward. The printer remains under observation.",
    ],
  };
}

function promoNotice(r: AdnocRank): Notice {
  return {
    title: r === "ceo" ? "Promoted · Chief Executive Officer" : `Promoted · ${adnocRankDef(r).label}`,
    tone: "promo",
    lines: [r === "ceo" ? "CLAP! FLASH! FEWER MEETINGS!" : "CLAP! CLAP! TINY PLANT APPROVES!", ...UNLOCKS[r].map((u) => `Unlocked: ${u}`)],
  };
}

// ---- mount -----------------------------------------------------------------

export function mountAdnoc(ctx: UIContext, host: ModalHost) {
  const { d } = ctx;
  let lastTab: AdnocTab = "hq";
  let notices: Notice[] = [];

  // Promotion bookkeeping (dates for the timeline; the legacy
  // `adnoc_<rank>_promoted` flags gate outfits like Executive Blue).
  d.on(store, "adnocRank", (r: AdnocRank) => {
    store.setFlag(`adnoc_${r}_promoted`);
    if (!store.state.adnocCareerStats[`promoted_day_${r}`]) {
      store.state.adnocCareerStats[`promoted_day_${r}`] = store.state.currentDay;
      store.save();
    }
  });

  const tabUnlocked = (tab: AdnocTab) =>
    tab === "control" ? adnocRankAtLeast(rank(), "senior_engineer") : tab === "board" ? adnocRankAtLeast(rank(), "director") : true;

  // ---- minigame hand-off: close the modal, play, reopen on the same tab ----
  const play = (spec: Omit<MiniGameSpec, "onDone">, tab: AdnocTab, onDone: (ok: boolean) => void) => {
    host.closeAny();
    const opened = uiEvents.emit("minigame", {
      difficulty: difficulty(),
      ...spec,
      onDone: (ok?: boolean) => {
        onDone(!!ok);
        open(tab);
      },
    } satisfies MiniGameSpec);
    if (!opened) {
      notices.push({ title: "Not available", tone: "info", lines: ["That minigame isn't available right now."] });
      open(tab);
    }
  };

  // ---- story steps ----
  const runStory = (tab: AdnocTab) => {
    const cur = careerTarget();
    if (!cur) return;
    const step = STORY[cur.target];
    if (!step) return;
    const settle = (advanced: boolean, extra: string[] = []) => {
      if (!advanced) return;
      const promo = step.after?.();
      const q = questById(cur.questId);
      const done = quests.statusOf(cur.questId) === "done";
      notices.push({
        title: step.label,
        tone: "good",
        lines: [...step.lines, ...extra, ...(done && q ? [q.complete] : [])],
      });
      if (promo) notices.push(promoNotice(promo));
      refreshAdnocUnlockFlags();
    };

    if (cur.target === "adnoc_badge_photo") {
      play({ ...step.game!, skipLabel: "Just smile" }, tab, (reasonable) => {
        if (quests.currentStep("q_adnoc_engineer")?.target !== "adnoc_badge_photo") return;
        store.state.adnocBadgePhoto = reasonable ? 0 : 2;
        if (!store.hasItem("adnoc_badge")) store.addItem("adnoc_badge");
        setAdnocRank("new_hire");
        quests.onMinigame("adnoc_badge_photo");
        store.save();
        notices.push({
          title: "Employee badge acquired",
          tone: "good",
          lines: [reasonable ? "Security: EMPLOYEE BADGE ACQUIRED." : "Security: EMPLOYEE BADGE ACQUIRED. The photograph will be discussed forever.", "Find the elevator. Engineering is upstairs."],
        });
        notices.push(promoNotice("new_hire"));
      });
      return;
    }

    if (step.game) {
      play({ ...step.game, skipLabel: "Not yet" }, tab, (ok) => {
        if (!ok) {
          notices.push({ title: step.label, tone: "info", lines: ["Not quite. Catch your breath and try again from the career centre."] });
          return;
        }
        if (quests.currentStep(cur.questId)?.target !== cur.target) return;
        quests.onMinigame(cur.target);
        incrementAdnocStat(`story_${cur.target}`);
        settle(true);
      });
      return;
    }

    // talk / interact steps resolve right here
    const kind = questById(cur.questId)?.steps.find((s) => s.target === cur.target)?.type;
    if (kind === "talk") {
      const res = quests.onTalk(cur.target, []);
      settle(true, res.completedQuest ? [] : []);
    } else {
      quests.onInteract(cur.target);
      settle(true);
    }
    rerender?.();
  };

  // ---- workday ----
  const reportForDuty = () => {
    const pending = store.state.adnocWorkday;
    if (pending && !pending.paid && pending.index >= pending.tasks.length) {
      const reward = finishWorkday();
      if (reward) notices.push(rewardNotice(reward));
      return;
    }
    const res = beginWorkday();
    if (!res.state) notices.push({ title: "Work day", tone: "info", lines: [res.reason ?? "The task board is taking a coffee break."] });
    else if (res.state.index === 0) notices.push({ title: "Today's three jobs", tone: "info", lines: ["Three jobs. One salary. Several avoidable printer emotions."] });
  };

  const playWorkTask = (id: AdnocWorkTaskId) => {
    const t = taskDef(id);
    const p = TASK_PLAY[id];
    play({ kind: p.kind, title: t.title.toUpperCase(), hint: `${t.blurb} ${p.hint}`, taps: 10, skipLabel: "Muddle through" }, "tasks", (ok) => {
      // a clean win is three stars; muddling through still counts, badly
      if (!recordWorkTask(id, ok ? 3 : 1)) return;
      const w = store.state.adnocWorkday;
      if (w && w.index >= w.tasks.length) {
        const reward = finishWorkday();
        if (reward) notices.push(rewardNotice(reward));
      } else if (w) {
        notices.push({ title: `${t.title} · ${stars(ok ? 3 : 1)}`, tone: "good", lines: [`${w.index} / ${w.tasks.length} jobs complete.`, "Next problem approaching at office speed."] });
      }
    });
  };

  // ---- promotion request (starts the next career story) ----
  const requestPromotion = () => {
    const active = STORY_QUESTS.find((id) => quests.statusOf(id) === "active");
    if (active) {
      notices.push({ title: "Already on it", tone: "info", lines: [`${questById(active)?.title}: ${quests.currentStep(active)?.hint ?? "Report to Alya."}`] });
      return;
    }
    const startable = STORY_QUESTS.find((id) => quests.canStartQuest(id));
    if (!startable) return;
    const started = quests.startQuest(startable);
    notices.push(
      started
        ? { title: `Alya · ${started.title}`, tone: "good", lines: [started.intro] }
        : { title: "Alya", tone: "info", lines: ["Your quest tracker is full. Finish one active story, then ask again."] },
    );
  };

  let rerender: (() => void) | null = null;

  // ---- views ----
  const noticeCards = (md: Disposer) => {
    if (!notices.length) return null;
    const list = notices;
    const wrap = el("div", { class: "olw-adnoc-notices" });
    for (const n of list) {
      const card = el("div", { class: `olw-adnoc-notice olw-adnoc-notice--${n.tone}`, attrs: { role: "status" } }, [
        n.tone === "promo" ? el("div", { class: "olw-adnoc-medal", attrs: { "aria-hidden": "true" } }) : null,
        el("div", { class: "olw-adnoc-notice-body" }, [
          el("p", { class: "olw-adnoc-notice-title", text: n.title }),
          ...n.lines.map((l) => el("p", { class: "olw-adnoc-notice-line", text: l })),
        ]),
      ]);
      wrap.append(card);
    }
    wrap.append(
      el("div", { class: "olw-adnoc-notice-actions" }, [
        button(md, "Got it", "olw-btn olw-btn--ghost olw-btn--small", () => {
          notices = [];
          rerender?.();
        }),
      ]),
    );
    return wrap;
  };

  const missionCard = (md: Disposer, tab: AdnocTab) => {
    const cur = careerTarget();
    const step = cur && STORY[cur.target];
    if (!cur || !step) return null;
    const q = questById(cur.questId);
    return el("section", { class: "olw-adnoc-card olw-adnoc-mission" }, [
      el("p", { class: "olw-adnoc-kicker", text: `Career mission · ${q?.title ?? ""}` }),
      el("p", { class: "olw-adnoc-mission-hint", text: cur.hint }),
      el("p", { class: "olw-adnoc-muted", text: step.place }),
      el("div", { class: "olw-adnoc-row" }, [
        button(md, step.game ? `▶ ${step.label}` : step.label, "olw-btn olw-btn--gold", () => {
          runStory(tab);
          rerender?.();
        }),
      ]),
    ]);
  };

  const statRow = (label: string, value: string) =>
    el("div", { class: "olw-adnoc-stat" }, [el("span", { class: "olw-adnoc-stat-l", text: label }), el("span", { class: "olw-adnoc-stat-v", text: value })]);

  const xpBar = () => {
    const target = promotionTarget();
    const xp = store.state.adnocXp;
    if (!target) {
      return el("div", { class: "olw-adnoc-xp" }, [
        el("div", { class: "olw-adnoc-xp-head" }, [
          el("span", { text: "Career XP" }),
          el("span", { text: rank() === "ceo" ? `${xp} XP · career complete` : `${xp} XP · first day in progress` }),
        ]),
        el("div", { class: "olw-adnoc-xp-track" }, [el("div", { class: "olw-adnoc-xp-fill", style: { width: rank() === "ceo" ? "100%" : "8%" } })]),
      ]);
    }
    const pct = Math.min(100, Math.round((xp / target.xp) * 100));
    const days = Math.min(store.state.adnocWorkdays, target.days);
    return el("div", { class: "olw-adnoc-xp" }, [
      el("div", { class: "olw-adnoc-xp-head" }, [el("span", { text: "Career XP" }), el("span", { text: `${Math.min(xp, target.xp)} / ${target.xp}` })]),
      el("div", { class: "olw-adnoc-xp-track", attrs: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": `${target.xp}`, "aria-valuenow": `${Math.min(xp, target.xp)}` } }, [
        el("div", { class: "olw-adnoc-xp-fill", style: { width: `${pct}%` } }),
      ]),
      el("p", { class: "olw-adnoc-muted", text: `Workdays ${days} / ${target.days} · next: ${target.quest}` }),
    ]);
  };

  const hqView = (md: Disposer, setTab: (t: AdnocTab) => void) => {
    const r = def();
    const floors = (["ground", "engineering", "operations", "management", "executive"] as AdnocFloor[]).filter((f) =>
      adnocRankAtLeast(rank(), f === "engineering" ? "new_hire" : f === "operations" ? "senior_engineer" : f === "management" ? "engineering_manager" : f === "executive" ? "director" : "visitor"),
    );
    const salary = r.salary[1] ? `${r.salary[0]}–${r.salary[1]} coins / day` : "Unpaid (visitor)";
    const cur = careerTarget();
    const badgeTarget = cur?.target === "adnoc_badge_photo";
    const hasBadge = adnocRankAtLeast(rank(), "new_hire");

    return el("div", { class: "olw-adnoc-panel" }, [
      el("section", { class: "olw-adnoc-card olw-adnoc-id" }, [
        el("div", { class: "olw-adnoc-badge", attrs: { "aria-hidden": "true" } }, [el("span", { text: r.shortLabel })]),
        el("div", { class: "olw-adnoc-id-text" }, [
          el("p", { class: "olw-adnoc-kicker", text: "ADNOC HQ · Abu Dhabi" }),
          el("h3", { class: "olw-adnoc-rank", text: rank() === "ceo" ? "CEO Juju" : `Juju · ${r.label}` }),
          el("p", { class: "olw-adnoc-muted", text: FLOOR_LABELS[r.floor] }),
        ]),
      ]),
      xpBar(),
      el("div", { class: "olw-adnoc-stats" }, [
        statRow("Salary", salary),
        statRow("Workdays", `${store.state.adnocWorkdays}`),
        statRow("Floor access", floors.map((f) => (f === "ground" ? "G" : f[0].toUpperCase() + f.slice(1))).join(" · ")),
        statRow("Badge photo", hasBadge ? BADGE_POSES[store.state.adnocBadgePhoto] ?? BADGE_POSES[0] : "Not taken yet"),
      ]),
      missionCard(md, "hq"),
      el("div", { class: "olw-adnoc-row" }, [
        button(md, "Report for duty", "olw-btn", () => {
          if (adnocRankAtLeast(rank(), "chemical_engineer")) reportForDuty();
          else notices.push({ title: "Work day", tone: "info", lines: ["Complete Juju's first day before starting regular work."] });
          setTab("tasks");
        }),
        (() => {
          const b = button(md, badgeTarget ? "Take badge photo" : "Retake badge photo", "olw-btn olw-btn--ghost", () => {
            if (badgeTarget) return runStory("hq");
            play({ kind: "badge_photo", title: "BADGE PHOTO RETAKE", hint: "Security allows one retake. Maybe.", skipLabel: "Keep the old one" }, "hq", (ok) => {
              if (!ok) return;
              store.state.adnocBadgePhoto = 0;
              store.save();
              notices.push({ title: "New badge photo", tone: "good", lines: ["Security: the new photo is surprisingly reasonable. Filed."] });
            });
          });
          b.disabled = !badgeTarget && !hasBadge;
          if (b.disabled) b.title = "Report to reception first";
          return b;
        })(),
      ]),
    ]);
  };

  const tasksView = (md: Disposer) => {
    const out = el("div", { class: "olw-adnoc-panel" });
    if (!adnocRankAtLeast(rank(), "chemical_engineer")) {
      out.append(
        el("p", { class: "olw-empty", text: "The task board unlocks once Juju's first day is done and she's a Chemical Engineer." }),
        missionCard(md, "tasks") ?? "",
      );
      return out;
    }
    const w = store.state.adnocWorkday;
    const r = def();
    out.append(
      el("p", { class: "olw-adnoc-muted", text: `Day ${store.state.currentDay} · pay ${r.salary[0]}–${r.salary[1]} coins + bonus · 11–17 XP` }),
    );
    if (!w) {
      const paid = store.state.adnocLastPaidDay === store.state.currentDay;
      out.append(
        el("section", { class: "olw-adnoc-card" }, [
          el("p", {
            class: "olw-adnoc-mission-hint",
            text: paid ? "Today's paid workday is complete. The board refreshes tomorrow." : "Three fresh jobs are waiting. Report for duty to draw today's board.",
          }),
          paid
            ? null
            : el("div", { class: "olw-adnoc-row" }, [
                button(md, "Report for duty", "olw-btn olw-btn--gold", () => {
                  reportForDuty();
                  rerender?.();
                }),
              ]),
        ]),
      );
      const upcoming = ADNOC_WORK_TASKS.filter((t) => adnocRankAtLeast(rank(), t.minRank));
      out.append(el("p", { class: "olw-adnoc-kicker", text: `Jobs on your rota (${upcoming.length})` }));
      out.append(
        el(
          "div",
          { class: "olw-adnoc-chips" },
          upcoming.map((t) => el("span", { class: `olw-adnoc-chip olw-adnoc-chip--${TASK_PLAY[t.id].type}`, text: t.title })),
        ),
      );
      return out;
    }
    const list = el("ol", { class: "olw-adnoc-tasks" });
    w.tasks.forEach((id, i) => {
      const t = taskDef(id);
      const p = TASK_PLAY[id];
      const state = i < w.index ? "done" : i === w.index ? "next" : "later";
      const teamLead = adnocRankIndex(t.minRank) >= adnocRankIndex("team_lead");
      const actions = el("div", { class: "olw-adnoc-task-go" });
      if (state === "next" && !w.paid) actions.append(button(md, "▶ Start", "olw-btn olw-btn--small", () => playWorkTask(id)));
      else actions.append(el("span", { class: "olw-adnoc-task-state", text: state === "done" ? "✓ Done" : "Up next after" }));
      list.append(
        el("li", { class: `olw-adnoc-task olw-adnoc-task--${state}` }, [
          el("div", { class: "olw-adnoc-task-main" }, [
            el("div", { class: "olw-adnoc-task-tags" }, [
              el("span", { class: `olw-adnoc-chip olw-adnoc-chip--${p.type}`, text: TYPE_LABELS[p.type] }),
              teamLead ? el("span", { class: "olw-adnoc-chip olw-adnoc-chip--lead", text: "Team Lead" }) : null,
            ]),
            el("p", { class: "olw-adnoc-task-title", text: `${i + 1}. ${t.title}` }),
            el("p", { class: "olw-adnoc-muted", text: t.blurb }),
          ]),
          actions,
        ]),
      );
    });
    out.append(list);
    if (w.index >= w.tasks.length && !w.paid) {
      out.append(
        el("div", { class: "olw-adnoc-row" }, [
          button(md, "Clock out & collect salary", "olw-btn olw-btn--gold", () => {
            const reward = finishWorkday();
            if (reward) notices.push(rewardNotice(reward));
            rerender?.();
          }),
        ]),
      );
    }
    return out;
  };

  const careerView = (md: Disposer) => {
    const idx = adnocRankIndex(rank());
    const timeline = el("ol", { class: "olw-adnoc-timeline" });
    ADNOC_RANKS.slice(1).forEach((r) => {
      const i = adnocRankIndex(r.id);
      const reached = i <= idx;
      const day = store.state.adnocCareerStats[`promoted_day_${r.id}`];
      timeline.append(
        el("li", { class: `olw-adnoc-tl olw-adnoc-tl--${reached ? (i === idx ? "now" : "done") : "future"}` }, [
          el("span", { class: "olw-adnoc-tl-dot", attrs: { "aria-hidden": "true" } }),
          el("div", {}, [
            el("p", { class: "olw-adnoc-tl-title", text: r.label }),
            el("p", { class: "olw-adnoc-muted", text: reached ? (day ? `Day ${day}` : "Earlier in the story") : `${r.salary[0]}–${r.salary[1]} coins / day` }),
            reached ? el("p", { class: "olw-adnoc-tl-unlocks", text: UNLOCKS[r.id].join(" · ") }) : null,
          ]),
        ]),
      );
    });

    const active = STORY_QUESTS.find((id) => quests.statusOf(id) === "active");
    const startable = STORY_QUESTS.find((id) => quests.canStartQuest(id));
    const nextId = STORY_QUESTS.find((id) => quests.statusOf(id) !== "done");
    const nextDef = nextId ? questById(nextId) : undefined;
    let promoNote = "";
    if (quests.statusOf("q_adnoc_engineer") !== "done") promoNote = "Finish Juju's first day to join the promotion track.";
    else if (active) promoNote = `In progress: ${questById(active)?.title}.`;
    else if (startable) promoNote = `Ready: ${questById(startable)?.title}.`;
    else if (nextDef) promoNote = quests.prerequisiteHint(nextDef);
    else promoNote = "Every promotion earned. The big office is yours.";

    const req = button(md, "Request promotion", "olw-btn olw-btn--gold", () => {
      requestPromotion();
      rerender?.();
    });
    req.disabled = !startable && !active;

    const stats = store.state.adnocCareerStats;
    const statLine = ADNOC_WORK_TASKS.filter((t) => stats[t.stat]).map((t) => `${t.title} ×${stats[t.stat]}`);

    return el("div", { class: "olw-adnoc-panel" }, [
      el("div", { class: "olw-adnoc-stats" }, [statRow("Department", DEPARTMENTS[rank()]), statRow("Promotions", `${stats.promotions_earned ?? 0}`)]),
      el("section", { class: "olw-adnoc-card" }, [
        el("p", { class: "olw-adnoc-kicker", text: "Next promotion" }),
        el("p", { class: "olw-adnoc-mission-hint", text: promoNote }),
        el("div", { class: "olw-adnoc-row" }, [req]),
      ]),
      el("p", { class: "olw-adnoc-kicker", text: "Promotion history" }),
      timeline,
      statLine.length ? el("p", { class: "olw-adnoc-kicker", text: "Jobs done" }) : null,
      statLine.length ? el("p", { class: "olw-adnoc-muted", text: statLine.join(" · ") }) : null,
    ]);
  };

  const lockedView = (need: AdnocRank, what: string) =>
    el("div", { class: "olw-adnoc-panel" }, [el("p", { class: "olw-empty", text: `${what} unlocks at ${adnocRankDef(need).label}.` })]);

  const controlView = (md: Disposer) => {
    if (!tabUnlocked("control")) return lockedView("senior_engineer", "The Control Room");
    const day = store.state.currentDay;
    const lines = CONTROL_LINES[hash(`control:${day}`) % CONTROL_LINES.length];
    const done = store.hasDaily("adnoc_control_room");
    const scale = adnocRankAtLeast(rank(), "director") ? 1.5 : 1;
    const panel = el("div", { class: "olw-adnoc-panel" }, [
      el("section", { class: "olw-adnoc-card olw-adnoc-control" }, [
        el("p", { class: "olw-adnoc-kicker", text: "Operations · Control Room" }),
        el("h3", { class: "olw-adnoc-rank", text: "Overseeing operations" }),
        el("div", { class: "olw-adnoc-screens", attrs: { "aria-hidden": "true" } }, Array.from({ length: 10 }, (_, i) => el("span", { class: `olw-adnoc-screen olw-adnoc-screen--${(i + day) % 3}` }))),
        ...lines.map((l) => el("p", { class: "olw-adnoc-muted", text: l })),
      ]),
    ]);
    if (done) {
      panel.append(el("p", { class: "olw-empty", text: "Today's check-in is logged. The control room hums along without you (for now)." }));
      return panel;
    }
    panel.append(el("p", { class: "olw-adnoc-kicker", text: "Today's check-in (once a day)" }));
    panel.append(
      el(
        "div",
        { class: "olw-adnoc-options" },
        CONTROL_ACTIONS.map((a) =>
          button(md, `${a.label} · +${Math.round(a.xp * scale)} XP`, "olw-btn olw-btn--ghost olw-adnoc-option", () => {
            if (store.hasDaily("adnoc_control_room")) return;
            store.setDaily("adnoc_control_room");
            incrementAdnocStat("control_room_checkins");
            addAdnocXp(a.xp * scale);
            notices.push({ title: "Control room", tone: "good", lines: [a.line] });
            rerender?.();
          }),
        ),
      ),
    );
    return panel;
  };

  const boardView = (md: Disposer) => {
    if (!tabUnlocked("board")) return lockedView("director", "The Boardroom");
    const week = weekIndex();
    const decision = DECISIONS[week % DECISIONS.length];
    const decided = (store.state.adnocCareerStats.boardroom_week ?? 0) === week + 1;
    const panel = el("div", { class: "olw-adnoc-panel" });
    const cur = careerTarget();
    if (cur?.questId === "q_adnoc_ceo") panel.append(missionCard(md, "board") ?? "");
    panel.append(
      el("section", { class: "olw-adnoc-card olw-adnoc-board" }, [
        el("p", { class: "olw-adnoc-kicker", text: `Week ${week + 1} · strategic decision` }),
        el("h3", { class: "olw-adnoc-rank", text: decision.title }),
        el("p", { class: "olw-adnoc-muted", text: decision.prompt }),
      ]),
    );
    if (decided) {
      panel.append(el("p", { class: "olw-empty", text: "This week's decision is signed. The board reconvenes next week." }));
      return panel;
    }
    panel.append(
      el(
        "div",
        { class: "olw-adnoc-options" },
        decision.options.map((o) => {
          const b = el("button", { class: "olw-btn olw-btn--ghost olw-adnoc-option olw-adnoc-decision", attrs: { type: "button" } }, [
            el("span", { class: "olw-adnoc-decision-l", text: o.label }),
            el("span", { class: "olw-adnoc-decision-d", text: `${o.detail} · +${o.xp} XP${o.coins ? ` · ${o.coins > 0 ? "+" : ""}${o.coins} coins` : ""}${o.hearts ? ` · +${o.hearts} ♥` : ""}` }),
          ]);
          md.listen(b, "click", () => {
            if ((store.state.adnocCareerStats.boardroom_week ?? 0) === week + 1) return;
            store.state.adnocCareerStats.boardroom_week = week + 1;
            incrementAdnocStat("boardroom_decisions");
            if (o.coins && o.coins > 0) store.addCoins(o.coins);
            if (o.coins && o.coins < 0) store.spendCoins(-o.coins);
            if (o.hearts) store.addHearts(o.hearts);
            addAdnocXp(o.xp);
            notices.push({ title: `Boardroom · ${o.label}`, tone: "good", lines: [o.result] });
            rerender?.();
          });
          return b;
        }),
      ),
    );
    return panel;
  };

  // ---- modal ----
  const TABS: { id: AdnocTab; label: string }[] = [
    { id: "hq", label: "HQ" },
    { id: "tasks", label: "Task Board" },
    { id: "career", label: "Career" },
    { id: "control", label: "Control Room" },
    { id: "board", label: "Boardroom" },
  ];

  const open = (tab: AdnocTab = lastTab) => {
    if (ctx.anyModal()) return false;
    refreshAdnocUnlockFlags();
    host.open({
      kind: "adnoc",
      title: "ADNOC HQ",
      subtitle: "Career centre · Abu Dhabi City",
      className: "olw-adnoc-modal",
      onClose: () => {
        rerender = null;
      },
      body: (md) => {
        let current: AdnocTab = tabUnlocked(tab) ? tab : "hq";
        const bar = el("div", { class: "olw-adnoc-tabs", attrs: { role: "tablist" } });
        const content = el("div", { class: "olw-adnoc-content", attrs: { role: "tabpanel" } });
        const tabButtons = new Map<AdnocTab, HTMLButtonElement>();
        for (const t of TABS) {
          const b = button(md, "", "olw-adnoc-tab", () => setTab(t.id));
          b.setAttribute("role", "tab");
          tabButtons.set(t.id, b);
          bar.append(b);
        }
        const setTab = (t: AdnocTab) => {
          current = t;
          lastTab = t;
          render();
        };
        const render = () => {
          for (const t of TABS) {
            const b = tabButtons.get(t.id)!;
            const locked = !tabUnlocked(t.id);
            b.textContent = locked ? `🔒 ${t.label}` : t.label;
            b.setAttribute("aria-selected", String(t.id === current));
            b.classList.toggle("olw-adnoc-tab--on", t.id === current);
            b.classList.toggle("olw-adnoc-tab--locked", locked);
          }
          const view =
            current === "hq" ? hqView(md, setTab) : current === "tasks" ? tasksView(md) : current === "career" ? careerView(md) : current === "control" ? controlView(md) : boardView(md);
          content.replaceChildren(...[noticeCards(md), view].filter((n): n is HTMLDivElement => !!n));
          content.scrollTop = 0;
        };
        rerender = render;
        render();
        return el("div", { class: "olw-adnoc" }, [bar, content]);
      },
    });
    return true;
  };

  d.on(uiEvents, "enterAdnoc", (opts?: { tab?: AdnocTab }) => {
    // arriving at HQ ticks the first-day "Enter ADNOC HQ" step (WorldScene.useOffice)
    if (quests.currentStep("q_adnoc_engineer")?.target === "adnoc_hq") {
      quests.onInteract("adnoc_hq");
      notices.push({ title: "First day", tone: "info", lines: [...STORY.adnoc_hq.lines, "Reception is straight ahead."] });
    }
    open(opts?.tab ?? (careerTarget() ? "hq" : lastTab));
  });

  return { open };
}
