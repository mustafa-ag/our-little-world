import type { Career, TimeOfDay } from "../systems/save";

export interface MessageUnlock {
  minDay?: number;
  onWake?: boolean;
  location?: string;
  city?: string;
  questDone?: string;
  questActive?: string;
  relationship?: { npc: string; min: number };
  memory?: string;
  flag?: string;
  eventDone?: string;
  stat?: { id: string; min: number };
  career?: Career;
  outfit?: string;
  time?: TimeOfDay;
  catStage?: number;
}

export interface MessageDef {
  id: string;
  sender: string;
  body: string;
  questId?: string;
  unlock: MessageUnlock;
}

export const MESSAGES: MessageDef[] = [
  {
    id: "msg_wake_1",
    sender: "moomoo",
    body: "morning. drink water. i love you. that's the text.",
    unlock: { onWake: true, minDay: 1 },
  },
  {
    id: "msg_mama_safe",
    sender: "mama",
    body: "Get home safe habibti ❤️ have you eaten??",
    unlock: { onWake: true, minDay: 2 },
  },
  {
    id: "msg_moomoo_coffee",
    sender: "moomoo",
    body: "coffee? 🥺 saddle if you see it. or the mall. i am not picky i am lying",
    questId: "q_coffee_run",
    unlock: { questDone: "q_date", minDay: 1 },
  },
  {
    id: "msg_fadwa_where",
    sender: "fadwa",
    body: "where are you?? I'm literally around the corner 😂 come to the West End",
    unlock: { city: "london" },
  },
  {
    id: "msg_baba_weekend",
    sender: "baba",
    body: "Yas is quiet this weekend. Come if you can. I'll put the kettle on.",
    unlock: { onWake: true, minDay: 3 },
  },
  {
    id: "msg_hazel_edi",
    sender: "hazel",
    body: "JUJU. the girls are in old town. no excuses.",
    unlock: { city: "edinburgh" },
  },
  {
    id: "msg_chloe",
    sender: "chloe",
    body: "if you ever find yourself in Oadby… tea is on me. phd tears included",
    unlock: { questDone: "q_edinburgh" },
  },
  {
    id: "msg_nour",
    sender: "nour",
    body: "Frankfurt miss you. Coffee is cheaper if you visit. Just saying.",
    unlock: { relationship: { npc: "nour", min: 10 } },
  },
  {
    id: "msg_moomoo_close",
    sender: "moomoo",
    body: "i keep thinking about downtown with you. come back when you can.",
    unlock: { relationship: { npc: "moomoo", min: 30 } },
  },
  {
    id: "msg_mama_proud",
    sender: "mama",
    body: "The garden looks happy. Like someone who is loved. That's you.",
    unlock: { relationship: { npc: "mama", min: 40 } },
  },
  {
    id: "msg_fadwa_photo",
    sender: "fadwa",
    body: "we still don't have a proper Big Ben photo and I will die about this",
    unlock: { questDone: "q_london", city: "london" },
  },
  {
    id: "msg_night",
    sender: "moomoo",
    body: "it's late. text me when you're in bed. no i will not be normal about it",
    unlock: { flag: "night_walk" },
  },
  {
    id: "msg_adnoc_pressure",
    sender: "Alya · ADNOC HQ",
    body: "Can you come in tomorrow? Something is making a noise that definitely should not make a noise.",
    questId: "q_adnoc_pressure_problem",
    unlock: { questDone: "q_adnoc_engineer", flag: "adnoc_pressure_ready" },
  },
  {
    id: "msg_adnoc_paperclip",
    sender: "ADNOC HQ",
    body: "Please attend a calm conversation about report ownership. Paperclips have been counted.",
    questId: "q_adnoc_paperclip_incident",
    unlock: { flag: "adnoc_paperclip_ready" },
  },
  {
    id: "msg_adnoc_teamlead",
    sender: "Alya · ADNOC HQ",
    body: "Team Lead meeting. 9:00. Juju: blocked. Alya: you are leading it.",
    questId: "q_adnoc_team_lead",
    unlock: { flag: "adnoc_teamlead_ready" },
  },
  {
    id: "msg_adnoc_control",
    sender: "Operations",
    body: "The control room would like to formally apologise in advance.",
    questId: "q_adnoc_control_room",
    unlock: { flag: "adnoc_control_ready" },
  },
  {
    id: "msg_adnoc_board",
    sender: "ADNOC Board",
    body: "Executive Floor. One serious presentation. Slide 14 may not be only shawarma.",
    questId: "q_adnoc_ceo",
    unlock: { flag: "adnoc_ceo_ready" },
  },
  {
    id: "msg_after_pirate_fadwa",
    sender: "fadwa",
    body: "Why did Mama just tell me you came to London on a pirate ship. Transportation.",
    unlock: { questDone: "q_family_jewel_heist" },
  },
  {
    id: "msg_after_shark_moomoo",
    sender: "moomoo",
    body: "You fought WHAT? I need you to start telling me these things before the shark part.",
    unlock: { memory: "mem_great_white" },
  },
  {
    id: "msg_ceo_baba",
    sender: "baba",
    body: "Mashallah. Proud of you, CEO Juju.",
    unlock: { career: "ceo" },
  },
  {
    id: "msg_ceo_baba_discount",
    sender: "baba",
    body: "Do you get discounts?",
    unlock: { questDone: "q_adnoc_ceo", minDay: 2 },
  },
  {
    id: "msg_spree_baba",
    sender: "baba",
    body: "Juju.",
    unlock: { questDone: "q_baba_spree" },
  },
  {
    id: "msg_rain_rhiannon",
    sender: "rhiannon",
    body: "My umbrella is still broken. The weather has shown no remorse.",
    unlock: { eventDone: "world_rain" },
  },
  {
    id: "msg_chloe_page47",
    sender: "chloe",
    body: "Page 47 survived. Academia continues for reasons nobody can explain.",
    unlock: { questDone: "q_chloe" },
  },
  {
    id: "msg_seagull_moomoo",
    sender: "moomoo",
    body: "He took my fry. Juju: our fry.",
    unlock: { questDone: "q_hudayriyat" },
  },
  {
    id: "msg_cat_mama",
    sender: "mama",
    body: "I heard there is a cat. I am bringing food. For you also, obviously.",
    unlock: { catStage: 4 },
  },
  {
    id: "msg_phd_emergency",
    sender: "chloe",
    body: "PhD emergency. Not a real emergency. Coffee-shaped. Are you free?",
    unlock: { relationship: { npc: "chloe", min: 35 } },
  },
  {
    id: "msg_ceo_outside_work",
    sender: "moomoo",
    body: "are you wearing CEO clothes for coffee. meeting? no? perfect.",
    unlock: { outfit: "ceo_blue" },
  },
  {
    id: "msg_first_camera",
    sender: "fadwa",
    body: "Send the photo immediately. I need to inspect everyone's pose.",
    unlock: { stat: { id: "photos_taken", min: 1 } },
  },
  {
    id: "msg_lost_phone_owner",
    sender: "baba",
    body: "Good you returned that phone. Now please answer yours when Mama calls.",
    unlock: { eventDone: "world_lost_phone" },
  },
];

export const messageById = (id: string) => MESSAGES.find((m) => m.id === id);
