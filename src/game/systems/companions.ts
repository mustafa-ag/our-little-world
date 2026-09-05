import { NPCS } from "../data/npcs";
import { store } from "./store";

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
