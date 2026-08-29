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
  { id: "city_bag", label: "City bag", hint: "Finish the mall coffee run.", questDone: "q_date" },
  { id: "secret_gold", label: "Golden hour", hint: "A quiet forever with Moomoo (100).", relationship: { npc: "moomoo", min: 100 } },
];
