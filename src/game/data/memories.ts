export interface MemoryDef {
  id: string;
  title: string;
  description: string;
  cityId: string;
  locationId: string;
  npcs: string[];
  icon?: string;
  photo?: boolean;
  hidden?: boolean;
}

export const MEMORIES: MemoryDef[] = [
  {
    id: "mem_yas_baba",
    title: "Baba at Yas",
    description: "Friday light on the golf. He made tea like it was nothing.",
    cityId: "abudhabi",
    locationId: "abudhabi_yas",
    npcs: ["baba"],
  },
  {
    id: "mem_corniche",
    title: "Karak on the Corniche",
    description: "The water, the cups, the quiet. Abu Dhabi doing what it does.",
    cityId: "abudhabi",
    locationId: "abudhabi_corniche",
    npcs: ["baba"],
  },
  {
    id: "mem_saadiyat",
    title: "Saadiyat glow",
    description: "Nails done. Brows neat. You walked out looking like the weekend.",
    cityId: "abudhabi",
    locationId: "abudhabi_saadiyat",
    npcs: [],
  },
  {
    id: "mem_hudayriyat",
    title: "Trucks by the water",
    description: "You drove out just to eat standing up. Worth it.",
    cityId: "abudhabi",
    locationId: "abudhabi_hudayriyat",
    npcs: ["moomoo"],
  },
  {
    id: "mem_saddle",
    title: "Coffee at Saddle",
    description: "Anytime you see it, you stop. Two cups. Same order.",
    cityId: "dubai",
    locationId: "dubai_hills",
    npcs: ["moomoo"],
    photo: true,
  },
  {
    id: "mem_mama_flowers",
    title: "Flowers with Mama",
    description: "She held them like they were jewellery.",
    cityId: "dubai",
    locationId: "dubai_damac",
    npcs: ["mama"],
  },
  {
    id: "mem_downtown",
    title: "Downtown, just us",
    description: "Burj in the background. You in the middle of it.",
    cityId: "dubai",
    locationId: "dubai_downtown",
    npcs: ["moomoo"],
    photo: true,
  },
  {
    id: "mem_oasis_coffee",
    title: "His order",
    description: "You remembered. He pretended he wasn't going to cry about it.",
    cityId: "dubai",
    locationId: "dubai_oasis",
    npcs: ["moomoo"],
  },
  {
    id: "mem_fadwa_soho",
    title: "Fadwa in Soho",
    description: "She spotted you from a block away. Obviously.",
    cityId: "london",
    locationId: "london_westend",
    npcs: ["fadwa"],
  },
  {
    id: "mem_bigben",
    title: "Big Ben Photo",
    description: "That's the one. Us two, London, forever.",
    cityId: "london",
    locationId: "london_westminster",
    npcs: ["fadwa"],
    photo: true,
  },
  {
    id: "mem_edi_girls",
    title: "The girls in Edi",
    description: "Royal Mile wind and too much laughing.",
    cityId: "edinburgh",
    locationId: "edinburgh_oldtown",
    npcs: ["hazel", "rhiannon"],
  },
  {
    id: "mem_well_court",
    title: "18 Well Court",
    description: "The stairs were so much. You went anyway.",
    cityId: "edinburgh",
    locationId: "edinburgh_dean",
    npcs: ["hazel"],
    hidden: true,
  },
  {
    id: "mem_chloe_tea",
    title: "Tea in Oadby",
    description: "She screamed. In a good way.",
    cityId: "leicester",
    locationId: "leicester",
    npcs: ["chloe"],
  },
  {
    id: "mem_nour",
    title: "Coffee with Nour",
    description: "Frankfurt, a brother, and a flat that somehow feels like home.",
    cityId: "germany",
    locationId: "germany",
    npcs: ["nour"],
  },
  {
    id: "mem_secret_night",
    title: "A night walk",
    description: "Nobody else was out. The city belonged to you for a minute.",
    cityId: "dubai",
    locationId: "dubai_szr",
    npcs: [],
    hidden: true,
  },
];

export const memoryById = (id: string) => MEMORIES.find((m) => m.id === id);

export function memoriesForCity(cityId: string) {
  return MEMORIES.filter((m) => m.cityId === cityId);
}
