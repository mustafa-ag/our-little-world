import { QUESTS, questById, type QuestDef, type StepType } from "../data/quests";
import type { QuestProgress } from "./save";
import { store } from "./store";

// Quest logic layered on top of the store. Scenes call the on* hooks when the
// player does something; this returns any dialogue to show and fires store
// events so the UI tracker + toasts update.

export interface TalkResult {
  lines: string[];
  completedQuest?: QuestDef;
  acceptedQuest?: QuestDef;
}

function ensure(id: string): QuestProgress {
  let p = store.state.quests[id];
  if (!p) {
    p = { status: "available", step: 0, progress: 0 };
    store.state.quests[id] = p;
  }
  return p;
}

export function statusOf(id: string) {
  return store.state.quests[id]?.status ?? "available";
}

export function activeQuests(): { def: QuestDef; hint: string }[] {
  const out: { def: QuestDef; hint: string }[] = [];
  for (const def of QUESTS) {
    const p = store.state.quests[def.id];
    if (p?.status !== "active") continue;
    const step = def.steps[p.step];
    if (!step) continue;
    let hint = step.hint;
    if (step.type === "collect" && step.count) hint = `${step.hint} (${p.progress}/${step.count})`;
    out.push({ def, hint });
  }
  return out;
}

function completeQuest(def: QuestDef, p: QuestProgress) {
  p.status = "done";
  store.addHearts(def.rewardHearts);
  store.addCoins(def.rewardCoins);
  store.emit("questUpdated");
  store.save();
}

function advance(def: QuestDef, p: QuestProgress) {
  p.step += 1;
  p.progress = 0;
  if (p.step >= def.steps.length) {
    completeQuest(def, p);
    return true; // completed
  }
  store.emit("questUpdated");
  store.save();
  return false;
}

// Try to advance any active quest whose current step matches (type,target).
function tryAdvance(type: StepType, target: string): QuestDef | undefined {
  for (const def of QUESTS) {
    const p = store.state.quests[def.id];
    if (p?.status !== "active") continue;
    const step = def.steps[p.step];
    if (!step || step.type !== type) continue;
    if (step.target !== target) continue;

    if (type === "collect") {
      p.progress += 1;
      store.emit("questUpdated");
      store.save();
      if (p.progress >= (step.count ?? 1)) {
        if (advance(def, p)) return def;
      }
      return undefined;
    } else {
      if (advance(def, p)) return def;
      return undefined;
    }
  }
  return undefined;
}

export function onTalk(npcId: string, defaultLines: string[]): TalkResult {
  const result: TalkResult = { lines: [] };

  // 1) advance an active talk-step targeting this npc
  for (const def of QUESTS) {
    const p = store.state.quests[def.id];
    if (p?.status !== "active") continue;
    const step = def.steps[p.step];
    if (step?.type === "talk" && step.target === npcId) {
      const done = advance(def, p);
      if (done) {
        result.lines.push(def.complete);
        result.completedQuest = def;
      } else {
        const next = def.steps[p.step];
        if (next) result.lines.push(`(New objective: ${next.hint})`);
      }
    }
  }

  // 2) offer ONE new quest from this npc if available (so repeat visits
  //    hand out quests one at a time instead of dumping them all at once)
  for (const def of QUESTS) {
    if (def.giver !== npcId) continue;
    const p = ensure(def.id);
    if (p.status === "available") {
      p.status = "active";
      p.step = 0;
      p.progress = 0;
      store.emit("questUpdated");
      store.save();
      result.lines.push(def.intro);
      result.acceptedQuest = def;
      store.toast(`New quest: ${def.title}`, "#f4c95d");
      break;
    }
  }

  if (result.lines.length === 0) result.lines = defaultLines;
  return result;
}

export function onInteract(tag: string): QuestDef | undefined {
  return tryAdvance("interact", tag);
}

export function onCollect(tag: string): QuestDef | undefined {
  return tryAdvance("collect", tag);
}

export function onVisit(locationId: string): QuestDef | undefined {
  return tryAdvance("visit", locationId);
}

export { questById };
