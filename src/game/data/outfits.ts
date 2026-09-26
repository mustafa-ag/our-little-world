export interface OutfitUnlock {
  id: string;
  label: string;
  hint: string;
  /** Always available on new and old saves. */
  starter?: boolean;
  questDone?: string;
  memoryCity?: string;
  relationship?: { npc: string; min: number };
  flag?: string;
}

export const OUTFIT_UNLOCKS: OutfitUnlock[] = [
  { id: "casual", label: "Casual", hint: "Yours from the start.", starter: true },
  { id: "cozy", label: "Cozy", hint: "Yours from the start.", starter: true },
  { id: "summer", label: "Summer", hint: "Yours from the start.", starter: true },
  { id: "sporty", label: "Sporty", hint: "Yours from the start.", starter: true },
  { id: "elegant", label: "Elegant", hint: "Yours from the start.", starter: true },
  { id: "winter", label: "Winter", hint: "Yours from the start.", starter: true },
  { id: "london_coat", label: "London Coat", hint: "Finish the London quest line.", questDone: "q_westminster" },
  { id: "pink_dress", label: "Pink Dress", hint: "Grow close with Mama (50).", relationship: { npc: "mama", min: 50 } },
  { id: "edi_hoodie", label: "Edinburgh Hoodie", hint: "Collect every Edinburgh memory.", memoryCity: "edinburgh" },
  { id: "sneakers", label: "Mall sneakers", hint: "Buy them at a shop.", flag: "bought_sneakers" },
  { id: "red_bottom_boots", label: "Red-bottom boots", hint: "Open Phone > Style to equip sprint boots.", starter: true },
  { id: "city_bag", label: "City bag", hint: "Finish the mall coffee run.", questDone: "q_date" },
  { id: "secret_gold", label: "Golden hour", hint: "A quiet forever with Moomoo (100).", relationship: { npc: "moomoo", min: 100 } },
  { id: "mall_dress", label: "Mall Dress", hint: "Choose it during Baba's Shopping Nightmare.", flag: "shopping_reward_mall_dress" },
  { id: "sparkle_set", label: "Sparkle Set", hint: "Choose it during Baba's Shopping Nightmare.", flag: "shopping_reward_sparkle_set" },
  { id: "weekend_jacket", label: "Weekend Jacket", hint: "Choose it during Baba's Shopping Nightmare.", flag: "shopping_reward_weekend_jacket" },
  { id: "shopping_heels", label: "Evening Heels", hint: "Choose them during Baba's Shopping Nightmare.", flag: "shopping_reward_shopping_heels" },
  { id: "shopping_sandals", label: "Golden Sandals", hint: "Choose them during Baba's Shopping Nightmare.", flag: "shopping_reward_shopping_sandals" },
  { id: "pirate_chic", label: "Pirate Chic", hint: "Finish the family jewel heist.", questDone: "q_family_jewel_heist" },
  { id: "engineer_blue", label: "Engineering Blue", hint: "Complete Juju's first day at ADNOC HQ.", questDone: "q_adnoc_engineer" },
  { id: "executive_blue", label: "Executive Blue", hint: "Become Engineering Director.", flag: "adnoc_director_promoted" },
  { id: "ceo_blue", label: "CEO Blue", hint: "Complete the final ADNOC promotion.", questDone: "q_adnoc_ceo" },
  { id: "wedding_moroccan", label: "Moroccan Celebration", hint: "Complete the desert wedding.", questDone: "q_desert_wedding" },
  { id: "wedding_jordanian", label: "Jordanian Celebration", hint: "Complete the desert wedding.", questDone: "q_desert_wedding" },
  { id: "wedding_white", label: "Wedding White", hint: "Complete the desert wedding.", questDone: "q_desert_wedding" },
];
