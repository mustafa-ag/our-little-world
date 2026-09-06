import {
  ADNOC_RANKS,
  ADNOC_WORK_TASKS,
  adnocRankAtLeast,
  adnocRankDef,
  adnocRankIndex,
  type AdnocRank,
  type AdnocWorkTaskId,
} from "../data/adnoc";
import type { AdnocWorkdayState } from "./save";
import { store } from "./store";
import { tryDeliverMessages } from "./phone";

export interface WorkdayReward {
  salary: number;
  bonus: number;
  xp: number;
  stars: number;
}

const PROMOTION_TARGETS: Partial<Record<AdnocRank, { xp: number; days: number; quest: string }>> = {
  chemical_engineer: { xp: 30, days: 2, quest: "The Pressure Problem" },
  senior_engineer: { xp: 70, days: 4, quest: "The Paperclip Incident" },
  team_lead: { xp: 100, days: 5, quest: "Team Lead for a Day" },
  engineering_manager: { xp: 145, days: 7, quest: "The Control Room Gauntlet" },
  director: { xp: 200, days: 9, quest: "The Final Promotion" },
};

function hashSeed(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
  return value >>> 0;
}

function nextSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

export function setAdnocRank(rank: AdnocRank) {
  if (store.state.adnocRank === rank) return false;
  const previous = store.state.adnocRank;
  store.state.adnocRank = rank;
  store.state.adnocCareerStats.promotions_earned = (store.state.adnocCareerStats.promotions_earned ?? 0) + 1;
  if (rank === "ceo") store.setCareer("ceo");
  else if (adnocRankAtLeast(rank, "chemical_engineer")) store.setCareer("chemical_engineer");
  refreshAdnocUnlockFlags();
  store.emit("adnocRank", rank, previous);
  tryDeliverMessages({ limit: 1 });
  store.save();
  return true;
}

export function addAdnocXp(amount: number) {
  const value = Math.max(0, Math.round(amount));
  if (!value) return;
  store.state.adnocXp += value;
  store.emit("adnocXp", store.state.adnocXp);
  store.toast(`Career XP +${value}`, "#f4c95d");
  refreshAdnocUnlockFlags();
  store.save();
}

export function refreshAdnocUnlockFlags() {
  const { adnocRank: rank, adnocXp: xp, adnocWorkdays: days } = store.state;
  if (adnocRankAtLeast(rank, "chemical_engineer") && xp >= 30 && days >= 2) store.setFlag("adnoc_pressure_ready");
  if (adnocRankAtLeast(rank, "senior_engineer") && xp >= 70 && days >= 4) store.setFlag("adnoc_paperclip_ready");
  if (adnocRankAtLeast(rank, "team_lead") && xp >= 100 && days >= 5) store.setFlag("adnoc_teamlead_ready");
  if (adnocRankAtLeast(rank, "engineering_manager") && xp >= 145 && days >= 7) store.setFlag("adnoc_control_ready");
  if (adnocRankAtLeast(rank, "director") && xp >= 200 && days >= 9) store.setFlag("adnoc_ceo_ready");
}

export function awardStoryXpOnce(flag: string, amount: number) {
  if (store.hasFlag(flag)) return false;
  store.setFlag(flag);
  addAdnocXp(amount);
  return true;
}

export function incrementAdnocStat(key: string, amount = 1) {
  store.state.adnocCareerStats[key] = (store.state.adnocCareerStats[key] ?? 0) + amount;
  store.save();
}

export function rankLabel(rank = store.state.adnocRank) {
  return adnocRankDef(rank).label;
}

export function careerProgressText() {
  const target = PROMOTION_TARGETS[store.state.adnocRank];
  if (!target) return store.state.adnocRank === "ceo" ? "CAREER COMPLETE · WORK DAYS STILL AVAILABLE" : "FIRST DAY IN PROGRESS";
  const xp = Math.min(store.state.adnocXp, target.xp);
  const days = Math.min(store.state.adnocWorkdays, target.days);
  return `${xp}/${target.xp} XP · ${days}/${target.days} DAYS → ${target.quest.toUpperCase()}`;
}

function chooseTasks(): AdnocWorkTaskId[] {
  const available = ADNOC_WORK_TASKS.filter((task) => adnocRankAtLeast(store.state.adnocRank, task.minRank));
  let seed = hashSeed(`${store.state.currentDay}:${store.state.adnocWorkdays}:${store.state.adnocRank}`);
  const pool = [...available];
  const chosen: AdnocWorkTaskId[] = [];
  while (chosen.length < 3 && pool.length) {
    seed = nextSeed(seed);
    const index = seed % pool.length;
    chosen.push(pool.splice(index, 1)[0].id);
  }
  if (chosen.join("|") === store.state.adnocLastTasks.join("|") && chosen.length === 3) chosen.push(chosen.shift()!);
  return chosen;
}

export function beginWorkday(): { state?: AdnocWorkdayState; reason?: string } {
  if (!adnocRankAtLeast(store.state.adnocRank, "chemical_engineer")) return { reason: "Complete Juju's first day before starting regular work." };
  // A fully completed but unsettled workday can exist if the app closes during
  // the short completion animation. Keep it intact so HQ can settle it rather
  // than replacing three finished tasks with a fresh set.
  if (store.state.adnocWorkday && !store.state.adnocWorkday.paid) return { state: store.state.adnocWorkday };
  if (store.state.adnocLastPaidDay === store.state.currentDay) return { reason: "Today's paid workday is complete. Advance to a new day for another salary." };
  const tasks = chooseTasks();
  if (tasks.length < 3) return { reason: "The task board is still warming up." };
  store.state.adnocWorkday = {
    id: `adnoc-${store.state.currentDay}-${store.state.adnocWorkdays + 1}`,
    day: store.state.currentDay,
    tasks,
    index: 0,
    stars: 0,
    paid: false,
  };
  store.state.adnocLastTasks = [...tasks];
  store.save();
  return { state: store.state.adnocWorkday };
}

export function recordWorkTask(taskId: AdnocWorkTaskId, stars: number) {
  const workday = store.state.adnocWorkday;
  if (!workday || workday.paid || workday.index >= workday.tasks.length || workday.tasks[workday.index] !== taskId) return false;
  workday.stars += Math.min(3, Math.max(1, Math.round(stars)));
  workday.index += 1;
  const def = ADNOC_WORK_TASKS.find((task) => task.id === taskId);
  if (def) incrementAdnocStat(def.stat);
  store.save();
  return true;
}

export function finishWorkday(): WorkdayReward | undefined {
  const workday = store.state.adnocWorkday;
  if (!workday || workday.paid || workday.index < workday.tasks.length) return undefined;
  if (store.state.adnocLastPaidDay === store.state.currentDay) {
    workday.paid = true;
    store.state.adnocWorkday = undefined;
    store.save();
    return undefined;
  }
  const average = Math.max(1, Math.round(workday.stars / workday.tasks.length));
  const salaryRange = adnocRankDef(store.state.adnocRank).salary;
  const span = Math.max(1, salaryRange[1] - salaryRange[0] + 1);
  const salary = salaryRange[0] + hashSeed(workday.id) % span;
  const bonus = average === 3 ? 8 : average === 2 ? 4 : 0;
  const xp = average === 3 ? 17 : average === 2 ? 14 : 11;

  // Mark the persisted transaction before any reward method saves. A reload
  // can therefore never re-run this salary callback for the same game day.
  workday.paid = true;
  store.state.adnocLastPaidDay = store.state.currentDay;
  store.state.adnocWorkdays += 1;
  store.state.adnocCareerStats.workdays_completed = (store.state.adnocCareerStats.workdays_completed ?? 0) + 1;
  store.state.adnocWorkday = undefined;
  store.addCoins(salary + bonus);
  addAdnocXp(xp);
  if (average === 3 && store.state.adnocWorkdays % 2 === 0) store.addHearts(1);
  store.advanceTime();
  tryDeliverMessages({ limit: 1 });
  store.save();
  return { salary, bonus, xp, stars: average };
}

export function nextRank() {
  return ADNOC_RANKS[Math.min(ADNOC_RANKS.length - 1, adnocRankIndex(store.state.adnocRank) + 1)].id;
}
