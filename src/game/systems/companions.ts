import { NPCS } from "../data/npcs";
import { store } from "./store";
import { uiEvents } from "./controls";

export function canCompanionTravel(id: string) {
  return store.state.unlockedCompanions.includes(id) && !!NPCS.find((npc) => npc.id === id);
}

export function companionComment(id: string, locationId: string) {
  const key = `companion_comment_${id}_${locationId}`;
  if (store.hasDaily(key)) return null;
  const lines: Record<string, string[]> = {
    moomoo: ["I like seeing your favourite places with you.", "Okay, this one goes on our list."],
    mama: ["Walk slowly, habibti. We have all day.", "Take a picture. You'll want to remember this."],
    baba: ["Good place. Good company.", "Tea would improve this, naturally."],
    fadwa: ["No leaving without a photo.", "This is exactly the sort of detour I approve of."],
  };
  const pool = lines[id] ?? ["Nice little place, isn't it?"];
  const line = pool[(store.state.currentDay + locationId.length) % pool.length];
  store.setDaily(key);
  return line;
}

/** The NPC currently travelling with Juju (undefined when exploring solo). */
export function current(): string | undefined {
  const id = store.state.activeCompanionId;
  return id && canCompanionTravel(id) ? id : undefined;
}

/** Bring an unlocked companion along (the 3D phone's People tab). Returns false if they can't travel. */
export function invite(id: string): boolean {
  if (!canCompanionTravel(id)) return false;
  if (!store.setActiveCompanion(id)) return false;
  uiEvents.emit("companionChanged");
  return true;
}

/** Drop the current companion off: Juju explores solo again. */
export function release(): string | undefined {
  const was = store.state.activeCompanionId;
  if (!was) return undefined;
  store.setActiveCompanion(undefined);
  uiEvents.emit("companionChanged");
  return was;
}
