export interface RelationshipMilestone {
  id: string;
  npcId: string;
  threshold: number;
  title: string;
  dialogue: string;
  companionUnlock?: boolean;
  keepsake?: string;
  memoryId?: string;
}

export const KEEPSAKES: Record<string, { name: string; description: string }> = {
  pressed_flower: { name: "Pressed flower", description: "Mama saved the prettiest one between two pages." },
  tea_cup: { name: "Baba's tea cup", description: "A tiny cup that makes the kitchen feel occupied." },
  sister_polaroid: { name: "Sister Polaroid", description: "Proof that Fadwa will always make you stop for a photo." },
  folded_note: { name: "Folded note", description: "Coffee later. Or now. Or always." },
  moomoo_keepsake: { name: "Our little world charm", description: "A tiny forever made from all the places you kept." },
  shopping_cloud_plush: { name: "Cloud plush", description: "No practical function. Perfect shopping performance." },
  shopping_gold_frame: { name: "Little gold frame", description: "For a photo of everybody surviving Baba's Shopping Nightmare." },
};

export const RELATIONSHIP_MILESTONES: RelationshipMilestone[] = [
  { id: "moomoo_companion", npcId: "moomoo", threshold: 20, title: "Come with me", dialogue: "Moomoo is ready to come along on little adventures.", companionUnlock: true },
  { id: "moomoo_keepsake", npcId: "moomoo", threshold: 50, title: "A folded note", dialogue: "He leaves you a note to keep somewhere important.", keepsake: "folded_note" },
  { id: "moomoo_forever", npcId: "moomoo", threshold: 100, title: "Our little world", dialogue: "The room feels full of every place you chose together.", keepsake: "moomoo_keepsake", memoryId: "mem_oasis_coffee" },
  { id: "mama_companion", npcId: "mama", threshold: 20, title: "Garden walks", dialogue: "Mama will come along when you want company.", companionUnlock: true },
  { id: "mama_flower", npcId: "mama", threshold: 50, title: "Pressed flower", dialogue: "Mama presses a flower for your shelf.", keepsake: "pressed_flower" },
  { id: "baba_companion", npcId: "baba", threshold: 20, title: "Tea and a drive", dialogue: "Baba is happy to come with you for a little drive.", companionUnlock: true },
  { id: "baba_cup", npcId: "baba", threshold: 50, title: "The good tea cup", dialogue: "Baba gives you the little cup he always reaches for.", keepsake: "tea_cup" },
  { id: "fadwa_companion", npcId: "fadwa", threshold: 20, title: "Sister time", dialogue: "Fadwa is now ready for spontaneous city walks.", companionUnlock: true },
  { id: "fadwa_polaroid", npcId: "fadwa", threshold: 50, title: "A sister Polaroid", dialogue: "Fadwa insists this one belongs on the wall.", keepsake: "sister_polaroid" },
];
