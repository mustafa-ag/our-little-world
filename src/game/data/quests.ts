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
  rewardCareer?: "chemical_engineer" | "ceo";
  requiresQuests?: string[];
}

export const QUESTS: QuestDef[] = [
  {
    id: "q_adnoc_engineer",
    title: "First Day, Big Blue Building",
    giver: "mama",
    intro: "ADNOC HQ called, habibti. They need a chemical engineer with a calm head and your very specific kind of brilliance.",
    steps: [
      { type: "visit", target: "abudhabi_city", hint: "Travel to Abu Dhabi City and find ADNOC HQ" },
      { type: "interact", target: "adnoc_lab", hint: "Complete the sample check at ADNOC HQ" },
      { type: "talk", target: "adnoc_recruiter", hint: "Tell the recruiter the results" },
    ],
    complete: "Badge printed. Lab coat fitted. Chemical Engineer Juju has officially entered the chat.",
    rewardHearts: 4,
    rewardCoins: 35,
    rewardCareer: "chemical_engineer",
  },
  {
    id: "q_baba_card",
    title: "Baba's Card",
    giver: "baba",
    intro: "Why are you looking at my wallet like that? ...Juju. Fine. Take the card, but only for something sensible.",
    steps: [
      { type: "interact", target: "take_baba_card", hint: "Pick up Baba's card near Yas Magnolias" },
      { type: "interact", target: "enter_mall", hint: "Take Baba's card to Dubai Mall, Dubai Hills Mall, or Yas Mall" },
      { type: "interact", target: "mall_fashion", hint: "Reach the fashion area" },
    ],
    complete: "One tiny bag is acceptable. The second quest is absolutely not my idea.",
    rewardHearts: 2,
    rewardCoins: 0,
    rewardNpc: "baba",
    rewardRel: 4,
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
    id: "q_baba_spree",
    title: "Shopping Spree",
    giver: "baba",
    requiresQuests: ["q_baba_card"],
    intro: "I said one bag. You heard: a timed shopping challenge. Please do not make me regret this.",
    steps: [
      { type: "playMinigame", target: "shopping_spree", hint: "Start a shopping spree in any mall fashion area" },
    ],
    complete: "The bags have their own postcode now. Enjoy the new looks, habibti.",
    rewardHearts: 4,
    rewardCoins: 0,
    rewardNpc: "baba",
    rewardRel: 6,
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
    id: "q_saadiyat_truck_hop",
    title: "Saadiyat snack crawl",
    giver: "baba",
    intro: "Saadiyat has more than the salon now. Try the MLT truck and save room for gelato.",
    steps: [
      { type: "visit", target: "abudhabi_saadiyat", hint: "Head to Saadiyat" },
      { type: "interact", target: "saadiyat_mlt", hint: "Visit the MLT truck" },
      { type: "interact", target: "saadiyat_gelato", hint: "Finish with gelato" },
    ],
    complete: "A snack crawl is a perfectly valid plan for the day.",
    rewardHearts: 2,
    rewardCoins: 18,
    rewardMemory: "mem_saadiyat_trucks",
    rewardItem: "mlt_bites",
  },
  {
    id: "q_last_exit",
    title: "Last Exit detour",
    giver: "moomoo",
    intro: "Let's make a proper roadside stop. Last Exit has burgers, coffee, and no schedule.",
    steps: [
      { type: "visit", target: "abudhabi_last_exit", hint: "Travel to Last Exit from the world map" },
      { type: "interact", target: "last_exit_burgers", hint: "Order at the burger truck" },
      { type: "interact", target: "last_exit_coffee", hint: "Grab a road coffee" },
    ],
    complete: "No plan, one detour, great food. That is a successful day.",
    rewardHearts: 2,
    rewardCoins: 20,
    rewardNpc: "moomoo",
    rewardRel: 4,
    rewardMemory: "mem_last_exit",
    rewardItem: "last_exit_treat",
  },
  {
    id: "q_yas_showdown",
    title: "Family chaos championship",
    giver: "baba",
    intro: "If Jad or Shan happens to be around Yas, settle the family bragging rights with a tap race.",
    steps: [
      { type: "visit", target: "abudhabi_yas", hint: "Return to Yas and look for a brother visiting home" },
      { type: "playMinigame", target: "sibling_showdown", hint: "Win or play a family tap showdown" },
    ],
    complete: "Officially ridiculous. Officially a family tradition now.",
    rewardHearts: 2,
    rewardCoins: 16,
    rewardMemory: "mem_yas_showdown",
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
  {
    id: "q_family_jewel_heist",
    title: "The Great Family Jewel Heist",
    giver: "mama",
    requiresQuests: ["q_baba_spree", "q_london"],
    intro: "Fadwa still has my gold bangles... and Grandma's jewelry. Juju. Do not get any ideas.",
    steps: [
      { type: "interact", target: "pirate_idea", hint: "Have a completely normal idea" },
      { type: "playMinigame", target: "pirate_voyage", hint: "Steer Pirate Juju's ship toward London" },
      { type: "playMinigame", target: "great_white_boss", hint: "Outwit The Great White" },
      { type: "visit", target: "london", hint: "Arrive in London via a perfectly normal route" },
      { type: "interact", target: "house_lock", hint: "Open Fadwa's front door very normally" },
      { type: "interact", target: "enter_fadwa_house", hint: "Enter Fadwa's London house" },
      { type: "interact", target: "reach_fadwa_room", hint: "Sneak through the house to Fadwa's room" },
      { type: "playMinigame", target: "drawer_lock", hint: "Open the suspiciously correct drawer" },
      { type: "playMinigame", target: "family_safe", hint: "Open Grandma's hidden family safe" },
      { type: "interact", target: "escape_fadwa_house", hint: "Escape without getting caught" },
    ],
    complete: "Absolutely no crimes occurred. Mama's gold bangles are sparkling, Grandma's jewelry is safe, and that moustache is staying in the drawer.",
    rewardHearts: 6,
    rewardCoins: 30,
    rewardNpc: "fadwa",
    rewardRel: 12,
  },
  {
    id: "q_home_refresh",
    title: "Make It Yours",
    giver: "adnoc_recruiter",
    requiresQuests: ["q_flowers"],
    intro: "You solve complicated things at HQ. Your home deserves the same care: somewhere soft to sit and something green.",
    steps: [
      { type: "buyItem", target: "f_sofa", hint: "Buy a sofa for your home" },
      { type: "buyItem", target: "f_plant", hint: "Buy a plant for your home" },
      { type: "decorate", target: "home", hint: "Place your new pieces while editing your home" },
    ],
    complete: "There. It looks lived in now. It looks like you.",
    rewardHearts: 3,
    rewardCoins: 25,
    rewardItem: "home_sketch",
  },
  {
    id: "q_adnoc_ceo",
    title: "CEO, Apparently",
    giver: "adnoc_recruiter",
    requiresQuests: ["q_adnoc_engineer", "q_family_jewel_heist"],
    intro: "The board saw your lab work, your calm under pressure, and... the pirate story. They would like you to present one very serious plan.",
    steps: [
      { type: "interact", target: "adnoc_boardroom", hint: "Give your big blue boardroom presentation" },
      { type: "interact", target: "adnoc_rooftop", hint: "Take the CEO victory lap on the rooftop" },
    ],
    complete: "Congratulations, CEO Juju. The board has agreed the company should have more snacks and fewer meetings.",
    rewardHearts: 8,
    rewardCoins: 100,
    rewardCareer: "ceo",
  },
];

export const questById = (id: string) => QUESTS.find((q) => q.id === id);
