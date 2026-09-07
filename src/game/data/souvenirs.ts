export interface SouvenirDef {
  id: string;
  cityId: string;
  name: string;
  icon: string;
  caption: string;
}

export const SOUVENIRS: SouvenirDef[] = [
  { id: "souvenir_abudhabi_skyline", cityId: "abudhabi", name: "Abu Dhabi skyline", icon: "▥", caption: "Corniche light, blue glass, and a full tank." },
  { id: "souvenir_dubai_tower", cityId: "dubai", name: "Tiny Dubai tower", icon: "♢", caption: "Tall enough to remember. Small enough for the shelf." },
  { id: "souvenir_london_bus", cityId: "london", name: "Red bus magnet", icon: "▰", caption: "Fadwa said the tiny Big Ben was tacky. She bought this instead." },
  { id: "souvenir_edinburgh_castle", cityId: "edinburgh", name: "Castle miniature", icon: "♜", caption: "Cobbles, rain, girls. The good kind of dramatic." },
  { id: "souvenir_leicester_postcard", cityId: "leicester", name: "Oadby postcard", icon: "▱", caption: "Tea, thesis pages, and one very welcome scream." },
  { id: "souvenir_germany_mug", cityId: "germany", name: "Little coffee mug", icon: "▣", caption: "A warm cup from a cold-weather visit with Nour." },
];

export const souvenirForCity = (cityId: string) => SOUVENIRS.find((souvenir) => souvenir.cityId === cityId);
export const souvenirById = (id: string) => SOUVENIRS.find((souvenir) => souvenir.id === id);

