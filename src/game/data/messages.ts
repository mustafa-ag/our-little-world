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
];

export const messageById = (id: string) => MESSAGES.find((m) => m.id === id);
