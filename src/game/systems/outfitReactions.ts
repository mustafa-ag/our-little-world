import { store } from "./store";

const REACTIONS: Record<string, string[]> = {
  red_bottom_boots: ["Those boots mean business. Or a very fast coffee run."],
  pink_dress: ["You look lovely. I noticed immediately, obviously."],
  london_coat: ["That coat is properly London-ready."],
  edi_hoodie: ["Edinburgh weather has met its match."],
  secret_gold: ["Okay, golden hour. You cannot just show up looking like that."],
};

/** One small, once-a-day acknowledgement keeps outfits expressive without dialogue spam. */
export function outfitReaction(npcId: string) {
  const lines = REACTIONS[store.state.outfit];
  const key = `outfit_reaction_${npcId}_${store.state.outfit}`;
  if (!lines?.length || store.hasDaily(key)) return null;
  store.setDaily(key);
  return lines[(store.state.currentDay + npcId.length) % lines.length];
}
