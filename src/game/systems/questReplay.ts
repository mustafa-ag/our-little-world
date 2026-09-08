import type { GameState } from "./save";

export interface QuestReplaySession {
  questId: string;
  canonical: GameState;
  returnLocation: string;
  returnInJeep: boolean;
  originScene?: string;
}

let session: QuestReplaySession | undefined;

const PROPERTY_REPLAY_TARGETS: Partial<Record<string, { propertyId: string; budget: number }>> = {
  q_first_property: { propertyId: "dubailand_2br", budget: 900 },
  q_positano_life: { propertyId: "positano_home", budget: 5500 },
  q_santorini_life: { propertyId: "santorini_villa", budget: 7500 },
};

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * Creates a disposable quest sandbox. The canonical object is deliberately
 * retained untouched so ending a replay is a byte-for-byte state restoration,
 * not a best-effort save migration.
 */
export function beginQuestReplay(
  canonical: GameState,
  questId: string,
  originScene?: string,
): { sandbox: GameState; session: QuestReplaySession } | undefined {
  if (session) return undefined;
  const sandbox = cloneState(canonical);
  sandbox.quests[questId] = { status: "active", step: 0, progress: 0 };
  const propertyReplay = PROPERTY_REPLAY_TARGETS[questId];
  if (propertyReplay) {
    const property = sandbox.properties[propertyReplay.propertyId];
    if (property) {
      property.owned = false;
      property.visited = false;
      delete property.purchasedDay;
    }
    sandbox.coins = Math.max(sandbox.coins, propertyReplay.budget);
  }
  // Purchase objectives need disposable spending money; the canonical balance
  // is restored verbatim as soon as the replay ends.
  if (questId === "q_home_refresh") sandbox.coins = Math.max(sandbox.coins, 500);
  if (questId === "q_retrieve_tigor") sandbox.tigor.missionChapter = 0;
  if (questId === "q_family_jewel_heist") {
    for (const key of Object.keys(sandbox.flags)) if (key.startsWith("heist_") || key === "pirate_disguise") delete sandbox.flags[key];
  }
  session = {
    questId,
    canonical,
    returnLocation: canonical.currentLocation,
    returnInJeep: canonical.inJeep,
    originScene,
  };
  return { sandbox, session };
}

export function activeQuestReplay() {
  return session;
}

export function finishQuestReplay() {
  const finished = session;
  session = undefined;
  return finished;
}
