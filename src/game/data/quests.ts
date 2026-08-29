// ---------------------------------------------------------------------------
// Cute little side quests. Each quest is a list of steps that complete in
// order. EDIT ME to invent your own real-life adventures together.
//
// Step types:
//   talk     -> talk to an npc (target = npc id)
//   collect  -> collect N tagged items in the world (target = item tag)
//   visit    -> travel to a location or city (target = location/city id)
//   interact -> interact with a tagged object, e.g. the cafe (target = tag)
//   giveItem -> give an item to someone (target = "npcId:itemId")
//   takePhoto / playMinigame / receiveMessage / driveWithPassenger
// ---------------------------------------------------------------------------

export type StepType =
  | "talk"
  | "collect"
  | "visit"
  | "interact"
  | "giveItem"
  | "takePhoto"
  | "playMinigame"
  | "reachRelationship"
  | "buyItem"
  | "equipOutfit"
  | "decorate"
  | "discoverMemory"
  | "waitUntilDay"
  | "receiveMessage"
  | "driveWithPassenger";

export interface QuestStep {
  type: StepType;
  target: string;
  count?: number;
  hint: string;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  intro: string;
  steps: QuestStep[];
  complete: string;
  rewardHearts: number;
  rewardCoins: number;
  rewardNpc?: string;
  rewardRel?: number;
  rewardMemory?: string;
  rewardItem?: string;
}

export const QUESTS: QuestDef[] = [
  {
    id: "q_start",
    title: "A Weekend Visit",
    giver: "baba",
    intro: "Habibti, drive over to Dubai. See Mama at Damac Lagoons, then Moomoo in Silicon Oasis — they're on opposite sides of the city.",
    steps: [
      { type: "visit", target: "dubai", hint: "Travel to Dubai" },
      { type: "talk", target: "mama", hint: "Find Mama at her white-and-blue townhouse" },
      { type: "talk", target: "moomoo", hint: "Cross the city to Moomoo in Silicon Oasis" },
    ],
    complete: "That's my girl. Drive back safe, we'll have tea on the weekend.",
    rewardHearts: 3,
    rewardCoins: 20,
    rewardNpc: "baba",
    rewardRel: 6,
    rewardMemory: "mem_yas_baba",
  },
  {
    id: "q_date",
    title: "Coffee from the Mall",
    giver: "moomoo",
    intro: "Grab us two coffees from Dubai Mall — that's Downtown, under the Burj — then bring them all the way back here to Silicon Oasis 🤍",
    steps: [
      { type: "interact", target: "dubai_mall", hint: "Get coffee at Dubai Mall (Downtown)" },
      { type: "talk", target: "moomoo", hint: "Bring the coffee back to Silicon Oasis" },
    ],
    complete: "Perfect. Two coffees, and a whole little world just for us.",
    rewardHearts: 3,
    rewardCoins: 25,
    rewardNpc: "moomoo",
    rewardRel: 8,
    rewardMemory: "mem_oasis_coffee",
    rewardItem: "coffee",
  },
  {
    id: "q_flowers",
    title: "Flowers for Mama",
    giver: "mama",
    intro: "Would you pick me 3 flowers from the garden, habibti?",
    steps: [
      { type: "collect", target: "flower", count: 3, hint: "Pick flowers around Damac Lagoons" },
      { type: "talk", target: "mama", hint: "Give the flowers to Mama" },
    ],
    complete: "Oh they're beautiful! You always know how to make me smile.",
    rewardHearts: 2,
    rewardCoins: 15,
    rewardNpc: "mama",
    rewardRel: 8,
    rewardMemory: "mem_mama_flowers",
    rewardItem: "bouquet",
  },
  {
    id: "q_corniche",
    title: "Corniche coffee",
    giver: "baba",
    intro: "The Corniche cafe does the best karak. Walk west through the city and bring me one?",
    steps: [
      { type: "visit", target: "abudhabi_corniche", hint: "Walk west to the Corniche" },
      { type: "interact", target: "corniche_cafe", hint: "Order at Corniche Cafe" },
      { type: "talk", target: "baba", hint: "Bring it back to Yas Magnolias" },
    ],
    complete: "Ah, that's the one. Sit with me a while.",
    rewardHearts: 2,
    rewardCoins: 18,
    rewardNpc: "baba",
    rewardRel: 5,
    rewardMemory: "mem_corniche",
    rewardItem: "karak",
  },
  {
    id: "q_residences",
    title: "Apartment 1701",
    giver: "moomoo",
    intro: "Your Downtown apartment — The Residences, Tower 8, 1701 — I left something by the door. Go see?",
    steps: [
      { type: "visit", target: "dubai_downtown", hint: "Go to Downtown Dubai" },
      { type: "interact", target: "cafe", hint: "Stop by Dubai Mall while you're there" },
    ],
    complete: "Home is wherever you are. Even on the 17th floor.",
    rewardHearts: 2,
    rewardCoins: 20,
    rewardNpc: "moomoo",
    rewardRel: 4,
    rewardMemory: "mem_downtown",
  },
  {
    id: "q_london",
    title: "Sisters in London",
    giver: "moomoo",
    intro: "Fadwa misses you. Fly over to London — she's in the West End, not by Big Ben.",
    steps: [
      { type: "visit", target: "london", hint: "Fly to London" },
      { type: "talk", target: "fadwa", hint: "Find Fadwa in the West End" },
    ],
    complete: "Sister time is the best time. London's always better with family.",
    rewardHearts: 3,
    rewardCoins: 25,
    rewardNpc: "fadwa",
    rewardRel: 8,
    rewardMemory: "mem_fadwa_soho",
  },
  {
    id: "q_westminster",
    title: "Big Ben with Fadwa",
    giver: "fadwa",
    intro: "Walk west to Westminster with me — I want a photo in front of Big Ben.",
    steps: [
      { type: "visit", target: "london_westminster", hint: "Walk west to Westminster" },
      { type: "takePhoto", target: "bigben", hint: "Take a photo at Big Ben" },
      { type: "talk", target: "fadwa", hint: "Show Fadwa the photo" },
    ],
    complete: "That's the one. Us two, London, forever.",
    rewardHearts: 2,
    rewardCoins: 20,
    rewardNpc: "fadwa",
    rewardRel: 10,
    rewardMemory: "mem_bigben",
    rewardItem: "postcard",
  },
  {
    id: "q_edinburgh",
    title: "The Girls in Edi",
    giver: "hazel",
    intro: "The gang's in the city, not out at Heriot-Watt. Find Rhiannon, then go west to the old house in Dean Village.",
    steps: [
      { type: "talk", target: "rhiannon", hint: "Find Rhiannon in Old Town" },
      { type: "visit", target: "edinburgh_dean", hint: "Walk west to Dean Village" },
      { type: "interact", target: "well_court", hint: "Climb the stairs at 18 Well Court (or skip)" },
    ],
    complete: "Reunited! Royal Mile stroll and cuppas, just like old times.",
    rewardHearts: 2,
    rewardCoins: 20,
    rewardNpc: "hazel",
    rewardRel: 6,
    rewardMemory: "mem_edi_girls",
  },
  {
    id: "q_nour",
    title: "Brother in Germany",
    giver: "moomoo",
    intro: "Nour's been asking about you. Pop over to Frankfurt — his flat is near the Römer.",
    steps: [
      { type: "visit", target: "germany", hint: "Travel to Frankfurt" },
      { type: "talk", target: "nour", hint: "Find Nour's flat" },
    ],
    complete: "He's so happy you came. Family, no matter the distance 🤍",
    rewardHearts: 3,
    rewardCoins: 25,
    rewardNpc: "nour",
    rewardRel: 8,
    rewardMemory: "mem_nour",
  },
  {
    id: "q_chloe",
    title: "Tea in Oadby",
    giver: "hazel",
    intro: "Chloe's been texting. She's in Oadby now, doing her PhD. Surprise her.",
    steps: [
      { type: "visit", target: "leicester", hint: "Travel to Oadby" },
      { type: "talk", target: "chloe", hint: "Find Chloe" },
    ],
    complete: "She screamed. In a good way. Tea was, in fact, on her.",
    rewardHearts: 2,
    rewardCoins: 20,
    rewardNpc: "chloe",
    rewardRel: 8,
    rewardMemory: "mem_chloe_tea",
  },
  {
    id: "q_saadiyat",
    title: "Saadiyat glow",
    giver: "baba",
    intro: "Drive up to Saadiyat — nails and brows. You always come back glowing.",
    steps: [
      { type: "visit", target: "abudhabi_saadiyat", hint: "Go to Saadiyat (north of the Corniche)" },
      { type: "interact", target: "saadiyat_salon", hint: "Nails or brows at the salon (skip if you want)" },
    ],
    complete: "Beautiful. That's my girl.",
    rewardHearts: 2,
    rewardCoins: 18,
    rewardMemory: "mem_saadiyat",
  },
  {
    id: "q_hudayriyat",
    title: "Food trucks",
    giver: "moomoo",
    intro: "Let's drive to Hudayriyat. Food trucks, Saddle if we see it, eat by the water.",
    steps: [
      { type: "visit", target: "abudhabi_hudayriyat", hint: "Drive to Hudayriyat" },
      { type: "interact", target: "hudayriyat_trucks", hint: "Eat at the food trucks" },
    ],
    complete: "Best drive. Best trucks. Best you.",
    rewardHearts: 2,
    rewardCoins: 18,
    rewardNpc: "moomoo",
    rewardRel: 4,
    rewardMemory: "mem_hudayriyat",
  },
  {
    id: "q_coffee_run",
    title: "His order",
    giver: "moomoo",
    intro: "You already know. Two coffees. Make them properly this time — I'll taste the difference.",
    steps: [
      { type: "playMinigame", target: "coffee", hint: "Make coffee at Saddle or any cafe" },
      { type: "giveItem", target: "moomoo:coffee", hint: "Give Moomoo the coffee" },
    ],
    complete: "You remembered my order. Come sit. The rest of the world can wait.",
    rewardHearts: 3,
    rewardCoins: 22,
    rewardNpc: "moomoo",
    rewardRel: 10,
    rewardMemory: "mem_saddle",
  },
];

export const questById = (id: string) => QUESTS.find((q) => q.id === id);
