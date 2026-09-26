export type AdnocRank =
  | "visitor"
  | "new_hire"
  | "chemical_engineer"
  | "senior_engineer"
  | "team_lead"
  | "engineering_manager"
  | "director"
  | "ceo";

export type AdnocFloor = "ground" | "engineering" | "operations" | "management" | "executive";

export type AdnocWorkTaskId =
  | "sample_sort"
  | "valve_panic"
  | "pipe_route"
  | "printer_boss"
  | "inbox_defence"
  | "safety_walk"
  | "lost_badge"
  | "coffee_run"
  | "control_lights"
  | "meeting_escape"
  | "hard_hat_hunt"
  | "paperwork_stack";

export interface AdnocRankDef {
  id: AdnocRank;
  label: string;
  shortLabel: string;
  floor: AdnocFloor;
  salary: [number, number];
}

export const ADNOC_RANKS: AdnocRankDef[] = [
  { id: "visitor", label: "Future Engineering Legend", shortLabel: "VISITOR", floor: "ground", salary: [0, 0] },
  { id: "new_hire", label: "Graduate Engineer · New Hire", shortLabel: "NEW HIRE", floor: "engineering", salary: [45, 60] },
  { id: "chemical_engineer", label: "Chemical Engineer", shortLabel: "ENGINEER", floor: "engineering", salary: [55, 75] },
  { id: "senior_engineer", label: "Senior Chemical Engineer", shortLabel: "SENIOR", floor: "operations", salary: [75, 100] },
  { id: "team_lead", label: "Engineering Team Lead", shortLabel: "TEAM LEAD", floor: "operations", salary: [95, 125] },
  { id: "engineering_manager", label: "Engineering Manager", shortLabel: "MANAGER", floor: "management", salary: [125, 160] },
  { id: "director", label: "Engineering Director", shortLabel: "DIRECTOR", floor: "executive", salary: [165, 210] },
  { id: "ceo", label: "Chief Executive Officer", shortLabel: "CEO", floor: "executive", salary: [220, 280] },
];

export interface AdnocWorkTaskDef {
  id: AdnocWorkTaskId;
  title: string;
  blurb: string;
  minRank: AdnocRank;
  stat: string;
}

export const ADNOC_WORK_TASKS: AdnocWorkTaskDef[] = [
  { id: "sample_sort", title: "Sample Sort", blurb: "Carry the cartoon samples to their matching analysers.", minRank: "chemical_engineer", stat: "samples_sorted" },
  { id: "valve_panic", title: "Valve Panic", blurb: "Run to the flashing valves in the displayed order.", minRank: "chemical_engineer", stat: "valves_rescued" },
  { id: "pipe_route", title: "Pipe Route", blurb: "Rotate the abstract floor pipes into one happy route.", minRank: "chemical_engineer", stat: "pipe_routes" },
  { id: "printer_boss", title: "Printer Boss", blurb: "Dodge paper, recover three pages, press the big green button.", minRank: "chemical_engineer", stat: "printer_jams_defeated" },
  { id: "inbox_defence", title: "Inbox Defence", blurb: "Catch urgent cards and keep the barrel-prize spam away.", minRank: "chemical_engineer", stat: "inboxes_defended" },
  { id: "safety_walk", title: "Safety Walk", blurb: "Find the banana peel and its equally suspicious friends.", minRank: "chemical_engineer", stat: "hazards_spotted" },
  { id: "lost_badge", title: "Lost Badge", blurb: "Search the office before Khalid has to admit where he left it.", minRank: "chemical_engineer", stat: "badges_found" },
  { id: "coffee_run", title: "Coffee Emergency", blurb: "Deliver three coffees while the tray develops opinions.", minRank: "chemical_engineer", stat: "coffees_delivered" },
  { id: "control_lights", title: "Control Room Lights", blurb: "Remember the console sequence, then run it back.", minRank: "senior_engineer", stat: "console_sequences" },
  { id: "meeting_escape", title: "Escaping the Meeting", blurb: "Reach the door before somebody adds another slide.", minRank: "team_lead", stat: "meetings_escaped" },
  { id: "hard_hat_hunt", title: "Hard Hat Hunt", blurb: "Collect five wandering hard hats before the timer notices.", minRank: "senior_engineer", stat: "hard_hats_recovered" },
  { id: "paperwork_stack", title: "Paperwork Stack", blurb: "Catch and file the reports into their matching bays.", minRank: "engineering_manager", stat: "reports_filed" },
];

export function adnocRankIndex(rank: AdnocRank) {
  return Math.max(0, ADNOC_RANKS.findIndex((entry) => entry.id === rank));
}

export function adnocRankAtLeast(rank: AdnocRank, required: AdnocRank) {
  return adnocRankIndex(rank) >= adnocRankIndex(required);
}

export function adnocRankDef(rank: AdnocRank) {
  return ADNOC_RANKS[adnocRankIndex(rank)];
}

export function floorAccessRank(floor: AdnocFloor): AdnocRank {
  if (floor === "engineering") return "new_hire";
  if (floor === "operations") return "senior_engineer";
  if (floor === "management") return "engineering_manager";
  if (floor === "executive") return "director";
  return "visitor";
}
