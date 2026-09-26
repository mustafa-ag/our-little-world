import { store } from "./store";

export type OutfitTag = "casual" | "formal" | "sleepwear" | "pirate" | "work" | "fancy" | "silly" | "sporty";

export const OUTFIT_TAGS: Record<string, OutfitTag[]> = {
  casual: ["casual"], cozy: ["sleepwear", "casual"], summer: ["casual"], sporty: ["sporty", "casual"],
  elegant: ["formal", "fancy"], winter: ["casual"], london_coat: ["formal"], pink_dress: ["fancy"],
  edi_hoodie: ["casual"], sneakers: ["sporty"], red_bottom_boots: ["fancy", "silly"], city_bag: ["fancy"],
  secret_gold: ["formal", "fancy"], mall_dress: ["fancy"], sparkle_set: ["fancy", "silly"], weekend_jacket: ["casual"],
  pirate_chic: ["pirate", "silly"], engineer_blue: ["work"], executive_blue: ["work", "formal"], ceo_blue: ["work", "formal", "fancy"],
};

const EXACT: Record<string, string[]> = {
  red_bottom_boots: ["Those boots mean business. Or a very fast coffee run."],
  pink_dress: ["You look lovely. I noticed immediately, obviously."],
  london_coat: ["That coat is properly London-ready."],
  edi_hoodie: ["Edinburgh weather has met its match."],
  secret_gold: ["Okay, golden hour. You cannot just show up looking like that."],
};

const NPC_TAG_LINES: Record<string, Partial<Record<OutfitTag, string[]>>> = {
  mama: { pirate: ["No."], sleepwear: ["Habibti. Outside? In that? At least take a jacket."], formal: ["Mashallah. Turn around, let me see properly."] },
  baba: { pirate: ["I have decided not to ask."], fancy: ["Very smart. Is my card involved?"], work: ["Work clothes. Good. Proud of you."] },
  fadwa: { fancy: ["Okay. Outfit. ♥", "Wait. Turn around. I need the full look."], pirate: ["You kept the moustache-adjacent energy. Incredible."], sleepwear: ["Pajamas outside? Honestly, commitment."] },
  moomoo: { work: ["Big day?", "Meeting? Juju: No."], fancy: ["You look like a weekend. I have forgotten what I was saying."], pirate: ["Captain. I have questions. None of them feel safe."] },
  chloe: { work: ["You look employed. Please rescue me from academia."], sleepwear: ["Correct thesis attire."] },
  rhiannon: { fancy: ["In this weather? Iconic."], pirate: ["That is one way to handle the wind."] },
  hazel: { fancy: ["Okay, main character. I see you."], sleepwear: ["Cuppa first. Clothes later."] },
  nour: { work: ["You brought the office to coffee."], fancy: ["Very Frankfurt. Very you."] },
};

/** One small, once-a-day acknowledgement keeps outfits expressive without dialogue spam. */
export function outfitReaction(npcId: string) {
  const tags = OUTFIT_TAGS[store.state.outfit] ?? ["casual"];
  const tag = tags.find((candidate) => NPC_TAG_LINES[npcId]?.[candidate]?.length);
  const lines = (tag && NPC_TAG_LINES[npcId]?.[tag]) || EXACT[store.state.outfit];
  const key = `outfit_reaction_${npcId}_${store.state.outfit}`;
  if (!lines?.length || store.hasDaily(key)) return null;
  store.setDaily(key);
  return lines[(store.state.currentDay + npcId.length) % lines.length];
}
