export const REL_MAX = 100;

export const REL_THRESHOLDS = {
  talk: 10,
  personal: 20,
  memory: 30,
  gift: 40,
  unlock: 50,
  special: 75,
  max: 100,
} as const;

export type DialogueBand = "low" | "mid" | "high" | "max";

export function bandFor(value: number): DialogueBand {
  if (value >= REL_THRESHOLDS.max) return "max";
  if (value >= REL_THRESHOLDS.unlock) return "high";
  if (value >= REL_THRESHOLDS.talk) return "mid";
  return "low";
}

export interface NpcVoice {
  low: string[];
  mid: string[];
  high: string[];
  max: string[];
  gifts: Record<string, string>;
  giftFallback: Record<string, string>;
}

export const VOICES: Record<string, NpcVoice> = {
  moomoo: {
    low: [
      "Hi Juju. I built this whole little world for you 🤍",
      "Every city, every quest... it's all us.",
    ],
    mid: [
      "You came. I was trying to be cool about it. Failed.",
      "Coffee later? Or now. Or always.",
      "I keep a list of places I want to take you. It's getting long.",
    ],
    high: [
      "Okay I missed you. That's the news.",
      "Stay a minute. The world can wait. It literally can — I coded it.",
      "You look like a weekend. In a good way.",
    ],
    max: [
      "This is it. You, me, a silly little map. I'm not asking for more.",
      "If I could pause a day I would pause this one.",
      "Love you. Always. That's the whole game.",
    ],
    gifts: {
      coffee: "You remembered my order.",
      karak: "Corniche-strength. You get me.",
      note: "I wrote that in a hurry and now I'm shy. Keep it anyway.",
      chocolate: "Sharing. Dangerous. I'll allow it.",
      flower: "A flower. For me. I am going to be so annoying about this.",
    },
    giftFallback: {
      favorite: "Okay. I'm keeping this forever. Don't look at me.",
      liked: "You thought of me. That's the present.",
      funny: "Juju. Why. I love it. Why.",
      ok: "I'll put it somewhere important. Like next to the other important things.",
    },
  },
  mama: {
    low: ["Habibti! Have you eaten?", "The garden at Damac Lagoons is blooming."],
    mid: [
      "Come sit. Tell me everything. Start with whether you ate.",
      "The townhouse looks happier when you're in it.",
    ],
    high: [
      "I picked a flower for you and then I got shy. Imagine.",
      "You make this house feel finished.",
    ],
    max: [
      "My girl. That's all. My girl.",
      "If I could wrap a day in tissue paper I would give you this one.",
    ],
    gifts: {
      bouquet: "For me? 🥹 I am going to put these in the good vase.",
      flower: "You always know. Come, I'll make tea.",
      chocolate: "We'll share. I will take the bigger piece. Mother rules.",
      karak: "Sit. Drink. Talk. That's the whole plan.",
      coffee: "Coffee? At this hour? Fine. You're lucky I like you.",
    },
    giftFallback: {
      favorite: "Ya habibti. You remembered.",
      liked: "This is so sweet I might cry and then ask if you've eaten.",
      funny: "What is this. I love you. What is this.",
      ok: "I'll find a place for it. Next to the photos of you.",
    },
  },
  baba: {
    low: ["Ahlan, my dear. I'm home Fridays and Saturdays.", "Yas is quiet and lovely this weekend."],
    mid: [
      "Come. Tea first, stories second.",
      "The golf looks good today. Don't walk on it. I will pretend I didn't see.",
    ],
    high: [
      "I told the neighbours my daughter was visiting. They already knew. Of course they did.",
      "Stay for dinner. I will not take no. I will take maybe.",
    ],
    max: [
      "This house is yours. The quiet is yours. I am just the man with the kettle.",
      "Proud of you. I don't say it enough so I'm saying it now.",
    ],
    gifts: {
      karak: "Ah. That's the one. Sit with me a while.",
      coffee: "Not karak, but I'll allow it. Don't tell the Corniche.",
      postcard: "You thought of your baba from far away. That's enough.",
    },
    giftFallback: {
      favorite: "Good. Very good.",
      liked: "Thank you, dear. I'll put it by the window.",
      funny: "Interesting choice. I will display it with honour.",
      ok: "Kind of you. Come, sit.",
    },
  },
  fadwa: {
    low: ["Sis!! You're in London!", "Come on, let's get food and walk by the river."],
    mid: [
      "I saw you and I screamed inside a Pret. That's love.",
      "West End first. Westminster if we feel cultured. We will not.",
    ],
    high: [
      "Don't leave without a photo. I will hunt you.",
      "You being here makes London make sense again.",
    ],
    max: [
      "That's the one. Us two, London, forever.",
      "I would fly to you. You flew to me. Even better.",
    ],
    gifts: {
      chocolate: "YES. This is a sister tax I accept.",
      postcard: "I'm putting this on the fridge like a mum.",
      coffee: "Finally someone who understands the assignment.",
      karak: "Juju... why did you bring this all the way to London 😂 I love it.",
    },
    giftFallback: {
      favorite: "Okay you're my favourite. Don't tell anyone. Tell everyone.",
      liked: "You get me. It's embarrassing how much.",
      funny: "I'm laughing. I'm keeping it. Both can be true.",
      ok: "Cute. Very you. Come on, walk with me.",
    },
  },
  nour: {
    low: ["Hey from Frankfurt!", "Miss you, sis. Stay for a coffee?"],
    mid: ["The Römer is nicer when you're complaining about the weather next to it.", "Sit. I'll make something warm."],
    high: ["You came all this way. I'm not being normal about it.", "Stay longer than you planned. That's an order."],
    max: ["Family, no matter the distance. That's not a slogan. That's you on my sofa."],
    gifts: {
      coffee: "Correct. This is the only correct gift.",
      chocolate: "German chocolate is right there and you still brought this. Respect.",
    },
    giftFallback: {
      favorite: "Okay. You win.",
      liked: "Thanks, sis. Really.",
      funny: "I don't know what this is but I'm putting it on the shelf.",
      ok: "You thought of me. That's the bit that matters.",
    },
  },
  hazel: {
    low: ["Juju!! Back in Edi!", "The girls are around here somewhere..."],
    mid: ["Cuppa first, gossip second, stairs never.", "I missed your face. That's the update."],
    high: ["Don't you dare do Edinburgh without us again.", "Well Court can wait. We cannot."],
    max: ["This is the gang. This is the city. This is the bit I keep."],
    gifts: {
      chocolate: "Emergency chocolate. You understand Scotland.",
      coffee: "Yes. Immediately. Don't walk and talk, just drink.",
    },
    giftFallback: {
      favorite: "I love you I love this I love Edi right now.",
      liked: "You're a menace and a gift.",
      funny: "Why would you. I'm obsessed.",
      ok: "I'll allow it. Come here.",
    },
  },
  rhiannon: {
    low: ["There she is! Missed you loads.", "Royal Mile stroll, then a cuppa?"],
    mid: ["Wind in our faces, as tradition demands.", "You look like you survived a flight. Proud of you."],
    high: ["Don't rush off. Dean Village isn't going anywhere. We might."],
    max: ["I like us best when we're here, being ridiculous."],
    gifts: {
      flower: "You brought me a flower in this weather. Iconic.",
      bouquet: "Okay I'm emotional. Blame the wind.",
    },
    giftFallback: {
      favorite: "This is so sweet I might trip on cobbles.",
      liked: "Love. Actual love.",
      funny: "I'm putting this in the flat and judging it kindly.",
      ok: "Thank you. Walk with me.",
    },
  },
  chloe: {
    low: ["Juju!! All the way to Oadby for me?", "PhD life is a lot. Tea's on me."],
    mid: ["You came. I have to sit down. I am already sitting down."],
    high: ["Stay for another cup. The thesis can wait. It always waits."],
    max: ["Oadby feels like a capital city when you're in it."],
    gifts: {
      coffee: "Caffeine and a friend. That's a complete degree.",
      chocolate: "This will be gone in four minutes. Science.",
    },
    giftFallback: {
      favorite: "I needed this more than the chapter I was avoiding.",
      liked: "You're the best surprise this postcode has had.",
      funny: "I don't have a shelf for this and I don't care.",
      ok: "Thank you. Sit. Tell me everything.",
    },
  },
};

export const GIFT_GENERIC: Record<string, string> = {
  favorite: "You remembered.",
  liked: "This is really sweet.",
  funny: "I... okay. I love it?",
  ok: "Thank you. I'll keep it.",
};

export function pickLine(lines: string[], seed = 0) {
  if (!lines.length) return "...";
  return lines[Math.abs(seed) % lines.length];
}

export const HOME_COMMENTS = [
  { test: (tex: Record<string, number>) => (tex.f_lamp ?? 0) >= 3, line: "WHY are there six lamps?" },
  { test: (tex: Record<string, number>) => (tex.f_plant ?? 0) >= 2, line: "Good. It needed more green." },
  { test: (tex: Record<string, number>) => (tex.f_sofa ?? 0) >= 1 && (tex.f_tv ?? 0) >= 1, line: "Okay wait this is actually cute." },
  { test: (n: Record<string, number>, total: number) => total >= 8, line: "It's getting busy in here. In a lived-in way." },
  { test: (_t: Record<string, number>, total: number) => total <= 1, line: "Minimalist. Or you just moved in. I'll allow it." },
];
