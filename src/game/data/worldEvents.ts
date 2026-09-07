import type { TimeOfDay } from "../systems/save";

export type WorldEventKind =
  | "balloon"
  | "lost_bag"
  | "tourist"
  | "cat_box"
  | "cat_snack"
  | "cat_friend"
  | "rain"
  | "street_dance"
  | "vehicle_start"
  | "coffee_spill"
  | "runaway_cart"
  | "lost_phone"
  | "loose_dog"
  | "delivery_boxes";

export interface WorldEventDefinition {
  id: string;
  kind: WorldEventKind;
  title: string;
  prompt: string;
  icon: string;
  allowedCities?: string[];
  allowedLocations?: string[];
  times?: TimeOfDay[];
  cooldownDays: number;
  weight: number;
  requiresCatStage?: number;
  maxCatStage?: number;
  reward?: { hearts?: number; coins?: number; relationship?: { npc: string; amount: number }; memory?: string };
  completionLines: string[];
}

/**
 * Tiny, optional happenings. The runtime deliberately chooses only 0–2 per
 * day and renders one nearby, so this table stays cheap on mobile.
 */
export const WORLD_EVENTS: WorldEventDefinition[] = [
  {
    id: "world_balloon",
    kind: "balloon",
    title: "Runaway balloon",
    prompt: "Grab the balloon string",
    icon: "●",
    cooldownDays: 4,
    weight: 1,
    reward: { hearts: 1 },
    completionLines: ["Juju catches the string just before the balloon develops international travel plans.", "The child jumps. Tiny heart. No paperwork."],
  },
  {
    id: "world_torn_bag",
    kind: "lost_bag",
    title: "Bag emergency",
    prompt: "Pick up the runaway things",
    icon: "▱",
    cooldownDays: 4,
    weight: 0.9,
    completionLines: ["Three things recovered. The fourth rolls away on principle.", "Thank you! The bag is now being held with both hands."],
  },
  {
    id: "world_tourist",
    kind: "tourist",
    title: "A slightly lost tourist",
    prompt: "Help with directions",
    icon: "?",
    cooldownDays: 3,
    weight: 1,
    completionLines: ["Thank you!", "They walk away with the confidence of someone who definitely understood the second half."],
  },
  {
    id: "world_cat_box",
    kind: "cat_box",
    title: "A suspicious box",
    prompt: "Inspect the shaking box",
    icon: "□",
    allowedCities: ["abudhabi", "dubai"],
    cooldownDays: 2,
    weight: 1.5,
    requiresCatStage: 0,
    maxCatStage: 0,
    completionLines: ["Two ears appear. Then two eyes.", "Cat: !", "The tiny stranger vanishes around the corner."],
  },
  {
    id: "world_cat_snack",
    kind: "cat_snack",
    title: "The same cat",
    prompt: "Offer a harmless snack",
    icon: "=^.^=",
    allowedCities: ["abudhabi", "dubai"],
    cooldownDays: 2,
    weight: 1.7,
    requiresCatStage: 1,
    maxCatStage: 1,
    completionLines: ["The cat takes one careful step closer.", "Snack accepted. Trust under review."],
  },
  {
    id: "world_cat_friend",
    kind: "cat_friend",
    title: "A familiar little face",
    prompt: "Crouch beside the cat",
    icon: "=^.^=",
    allowedCities: ["abudhabi", "dubai"],
    cooldownDays: 2,
    weight: 1.8,
    requiresCatStage: 2,
    maxCatStage: 2,
    reward: { hearts: 1 },
    completionLines: ["This time, the cat does not run.", "She bumps Juju's hand, then follows for half a street. ♥"],
  },
  {
    id: "world_rain",
    kind: "rain",
    title: "Sudden rain",
    prompt: "Watch the weather happen",
    icon: "☂",
    allowedCities: ["london", "edinburgh", "leicester"],
    cooldownDays: 3,
    weight: 1,
    completionLines: ["Umbrellas appear everywhere.", "One immediately turns inside out. The rain considers its work complete."],
  },
  {
    id: "world_street_dance",
    kind: "street_dance",
    title: "A tiny crowd",
    prompt: "Watch or join the dance",
    icon: "♪",
    allowedCities: ["dubai", "london", "edinburgh"],
    times: ["afternoon", "evening", "night"],
    cooldownDays: 4,
    weight: 0.8,
    completionLines: ["Juju catches the last beat.", "The little crowd claps like she has just headlined somewhere enormous."],
  },
  {
    id: "world_vehicle_start",
    kind: "vehicle_start",
    title: "Parking-lot drama",
    prompt: "Help with the very fictional starter",
    icon: "⚙",
    allowedCities: ["abudhabi", "dubai", "germany"],
    cooldownDays: 5,
    weight: 0.75,
    reward: { coins: 5 },
    completionLines: ["TRY AGAIN becomes VROOOM.", "The owner celebrates as if the vehicle has won a championship."],
  },
  {
    id: "world_coffee_spill",
    kind: "coffee_spill",
    title: "Coffee down",
    prompt: "Help with the napkins",
    icon: "☕",
    allowedCities: ["dubai", "london", "germany", "edinburgh"],
    cooldownDays: 3,
    weight: 0.9,
    completionLines: ["Napkins: deployed.", "The coffee is gone, but dignity has been partially recovered."],
  },
  {
    id: "world_runaway_cart",
    kind: "runaway_cart",
    title: "Runaway cart",
    prompt: "Catch the rolling cart",
    icon: "▣",
    allowedCities: ["abudhabi", "dubai", "london"],
    cooldownDays: 4,
    weight: 0.75,
    completionLines: ["Juju catches it with one extremely casual hand.", "The boxes wobble anyway, for dramatic closure."],
  },
  {
    id: "world_lost_phone",
    kind: "lost_phone",
    title: "BZZ. BZZZ.",
    prompt: "Follow the buzz",
    icon: "▯",
    cooldownDays: 4,
    weight: 0.85,
    completionLines: ["Found it beneath a bench.", "The owner checks the screen, sees twelve missed calls, and decides gratitude comes first."],
  },
  {
    id: "world_loose_dog",
    kind: "loose_dog",
    title: "Tiny dog, huge agenda",
    prompt: "Catch up with the dog",
    icon: "ᴥ",
    allowedCities: ["abudhabi", "dubai", "london", "edinburgh"],
    cooldownDays: 5,
    weight: 0.7,
    reward: { hearts: 1 },
    completionLines: ["The dog sits the instant Juju arrives, as if none of that happened.", "The owner: Thank you. The dog: no comment."],
  },
  {
    id: "world_delivery_boxes",
    kind: "delivery_boxes",
    title: "Wobble delivery",
    prompt: "Carry the top box",
    icon: "▤",
    allowedCities: ["abudhabi", "dubai", "london", "germany"],
    cooldownDays: 4,
    weight: 0.8,
    reward: { coins: 4 },
    completionLines: ["Left. Right. Tiny correction.", "The stack arrives upright. The delivery worker bows to the box-balancing champion."],
  },
];

