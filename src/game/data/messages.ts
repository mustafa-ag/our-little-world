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
];

export const messageById = (id: string) => MESSAGES.find((m) => m.id === id);
