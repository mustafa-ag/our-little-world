import { QUESTS, questById, type QuestDef, type StepType } from "../data/quests";
import { adnocRankAtLeast } from "../data/adnoc";
import type { QuestProgress } from "./save";
import { store } from "./store";
import { tryDeliverMessages } from "./phone";

// Quest logic layered on top of the store. Scenes call the on* hooks when the
// player does something; this returns any dialogue to show and fires store
// events so the UI tracker + toasts update.

export interface TalkResult {
  lines: string[];
  completedQuest?: QuestDef;
  acceptedQuest?: QuestDef;
}

export interface ActiveQuest {
  def: QuestDef;
  step: QuestDef["steps"][number];
  hint: string;
  progress: number;
}

const MAX_ACTIVE_QUESTS = 2;

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

export function isActive(id: string) {
  return statusOf(id) === "active";
}

export function currentStep(id: string) {
  const progress = store.state.quests[id];
  const def = questById(id);
  return progress && def ? def.steps[progress.step] : undefined;
}

function prerequisitesMet(def: QuestDef) {
  if (!(def.requiresQuests ?? []).every((id) => statusOf(id) === "done")) return false;
  if (def.requiresAdnocRank && !adnocRankAtLeast(store.state.adnocRank, def.requiresAdnocRank)) return false;
  if (def.requiresAdnocXp && store.state.adnocXp < def.requiresAdnocXp) return false;
  if (def.requiresAdnocWorkdays && store.state.adnocWorkdays < def.requiresAdnocWorkdays) return false;
  return true;
}

export function canStartQuest(id: string) {
  const def = questById(id);
  return !!def && statusOf(id) === "available" && prerequisitesMet(def);
}

/** Start one known quest explicitly, without accepting a different quest from the same giver. */
export function startQuest(id: string) {
  const def = questById(id);
  if (!def || !canStartQuest(id) || activeQuests().length >= MAX_ACTIVE_QUESTS) return undefined;
  const p = ensure(id);
  p.status = "active";
  p.step = 0;
  p.progress = 0;
  store.emit("questUpdated");
  store.save();
  store.toast(`New quest: ${def.title}`, "#f4c95d");
  return def;
}

export function activeQuests(): ActiveQuest[] {
  const out: ActiveQuest[] = [];
  for (const def of QUESTS) {
    const p = store.state.quests[def.id];
    if (p?.status !== "active") continue;
    const step = def.steps[p.step];
    if (!step) continue;
    let hint = step.hint;
    if (step.type === "collect" && step.count) hint = `${step.hint} (${p.progress}/${step.count})`;
    out.push({ def, step, hint, progress: p.progress });
  }
  return out;
}

function grantExtras(def: QuestDef) {
  if (def.rewardNpc && def.rewardRel) store.addRelationship(def.rewardNpc, def.rewardRel);
  if (def.rewardMemory) store.unlockMemory(def.rewardMemory);
  if (def.rewardItem) store.addItem(def.rewardItem);
  if (def.rewardCareer) store.setCareer(def.rewardCareer);
  store.refreshOutfitUnlocks();
  tryDeliverMessages({ limit: 1 });
}

function completeQuest(def: QuestDef, p: QuestProgress) {
  p.status = "done";
  store.addHearts(def.rewardHearts);
  store.addCoins(def.rewardCoins);
  grantExtras(def);
  store.emit("questCompleted", def);
  store.emit("questUpdated");
  store.save();
}

function advance(def: QuestDef, p: QuestProgress) {
  const finishedStep = def.steps[p.step];
  if (finishedStep) store.emit("questStepComplete", def, finishedStep);
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

function matchTarget(stepTarget: string, target: string) {
  if (stepTarget === target) return true;
  if (stepTarget.includes(":")) return stepTarget === target;
  return false;
}

// Try to advance any active quest whose current step matches (type,target).
function tryAdvance(type: StepType, target: string): QuestDef | undefined {
  for (const def of QUESTS) {
    const p = store.state.quests[def.id];
    if (p?.status !== "active") continue;
    const step = def.steps[p.step];
    if (!step || step.type !== type) continue;
    if (!matchTarget(step.target, target)) continue;

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

  // 2) Offer one new story only when the player has room to follow it.
  // This keeps conversations warm instead of silently filling the tracker.
  if (activeQuests().length < MAX_ACTIVE_QUESTS) {
    for (const def of QUESTS) {
      if (def.giver !== npcId) continue;
      if (statusOf(def.id) === "available" && prerequisitesMet(def)) {
        const accepted = startQuest(def.id);
        if (!accepted) continue;
        if (def.id === "q_family_jewel_heist") {
          result.lines.push(
            "Fadwa still has my gold bangles...",
            "And Grandma's jewelry.",
            "Juju: ...she has WHAT?",
            "Juju. Do not get any ideas.",
          );
        } else result.lines.push(def.intro);
        result.acceptedQuest = def;
        break;
      }
    }
  }

  if (result.lines.length === 0) result.lines = defaultLines;
  if (!result.acceptedQuest && !result.completedQuest && !store.hasDaily(`talk_${npcId}`)) {
    store.setDaily(`talk_${npcId}`);
    store.addRelationship(npcId, 1);
  }
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

export function onGive(npcId: string, itemId: string): QuestDef | undefined {
  return tryAdvance("giveItem", `${npcId}:${itemId}`) ?? tryAdvance("giveItem", itemId);
}

export function onPhoto(tag: string): QuestDef | undefined {
  return tryAdvance("takePhoto", tag);
}

export function onMinigame(kind: string): QuestDef | undefined {
  return tryAdvance("playMinigame", kind);
}

export function onBuy(itemId: string): QuestDef | undefined {
  return tryAdvance("buyItem", itemId);
}

export function onDecorate(target = "home"): QuestDef | undefined {
  return tryAdvance("decorate", target);
}

export function onMessage(id: string): QuestDef | undefined {
  return tryAdvance("receiveMessage", id);
}

export function onDriveWith(npcId: string): QuestDef | undefined {
  return tryAdvance("driveWithPassenger", npcId);
}

export function activateFromMessage(questId: string) {
  const def = questById(questId);
  if (!def) return;
  const p = ensure(def.id);
  if (p.status !== "available") return;
  p.status = "active";
  p.step = 0;
  p.progress = 0;
  store.emit("questUpdated");
  store.toast(`New quest: ${def.title}`, "#f4c95d");
  store.save();
}

export { questById };
