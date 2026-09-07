import type { RelationshipStage, TimeOfDay } from "../systems/save";

export type ChatIntent = "hello" | "morning" | "night" | "love" | "miss" | "where" | "doing" | "work" | "tired" | "hungry" | "coffee" | "home" | "travel" | "date" | "family" | "wedding" | "car" | "outfit" | "joke" | "generic";

export interface ChatContext {
  stage: RelationshipStage;
  time: TimeOfDay;
  locationName: string;
}

export const SUGGESTED_TEXTS: Record<string, string[]> = {
  moomoo: ["Good morning, handsome ♡", "I miss you", "Coffee date?", "What are you doing?", "Come home please"],
  baba: ["Hi Baba ♡", "I ate, promise", "Want tea?", "Please don't check the receipts"],
  mama: ["Morning Mama ♡", "I ate, promise", "Come over?", "I miss you"],
  fadwa: ["Where are you??", "Coffee immediately", "I have gossip", "Trip soon?"],
  jad: ["Hello trouble", "How are you?", "Coffee?", "Tell me a joke"],
  shan: ["Hi Shan ♡", "What are you doing?", "Travel soon?", "Tell me everything"],
  nour: ["Miss you sis", "Coffee?", "How is work?", "When are we travelling?"],
};

const GENERIC: Record<ChatIntent, string[]> = {
  hello: ["Hii ♡ how are you?", "Hello you. Perfect timing."],
  morning: ["Morning ♡ Drink water before the day starts making requests."],
  night: ["Good night. Text me tomorrow, okay?"],
  love: ["Love you too ♡", "That just improved my entire day."],
  miss: ["Miss you more. This is not a competition but I won."],
  where: ["Somewhere near coffee, probably."],
  doing: ["Trying to look productive. You?"],
  work: ["You've got this. Then you are legally required to rest."],
  tired: ["Tiny break. Water. Snack. Then decide what the world gets from you."],
  hungry: ["Eat first. Adventures after."],
  coffee: ["Yes. The answer to coffee is structurally yes."],
  home: ["Home sounds good. Put the kettle on."],
  travel: ["Send the place. I am already mentally packing."],
  date: ["Cute. When and where?"],
  family: ["Family group chat levels of danger. Tell me everything."],
  wedding: ["That word comes with flowers and approximately forty opinions."],
  car: ["The Jeep has more social freedom than all of us."],
  outfit: ["Wear the one that makes you do the little mirror turn."],
  joke: ["I had a good joke. It left when responsibility arrived."],
  generic: ["Tell me more ♡", "I am listening. Fully. Mostly. Continue.", "Okay wait, I love this update."],
};

const MOOMOO: Partial<Record<ChatIntent, string[]>> = {
  morning: ["morning, my Juju ♡ coffee first, world second.", "Good morning. I missed you overnight which feels inefficient."],
  night: ["Come home safe. I saved your side of the sofa.", "Good night, baby. One more heart before sleep: ♡"],
  love: ["I love you. In every version of our little world.", "You cannot just send that while I am trying to act normal 🫪"],
  miss: ["I miss you too. Come here so I can stop being dramatic.", "Distance rejected. When do I see you?"],
  coffee: ["Date. Coffee. You. I accept all agenda items.", "Saddle or home? Actually both. This is a two-coffee plan."],
  date: ["Yes. I will pretend I needed time to decide.", "Pick a place. I will bring the extremely subtle heart eyes."],
  home: ["Our house? I like saying that.", "Come home. I am making coffee and absolutely no promises about the kitchen."],
  wedding: ["I only care that at the end I get to call you my wife.", "Current wedding plan: you, me, no family cartoon clouds. Ambitious."],
  outfit: ["The answer is yes. I have not seen it yet. Still yes.", "Wear the one that makes me forget the sentence I prepared."],
  travel: ["Balcony, sea, you stealing my coffee. Book it.", "You saw a sunset photo and now we own imaginary property there, don't we?"],
  doing: ["Thinking about you. Also pretending that counts as a task."],
};

export function responsePool(contactId: string, intent: ChatIntent, context: ChatContext) {
  if (contactId === "moomoo") {
    const stageLines = context.stage === "married"
      ? ["Wife update received. Husband is on his way home.", "Noted for our extremely serious household meeting on the sofa."]
      : context.stage === "engaged"
        ? ["My fiancée texted me. I am going to be unbearable about that word.", "Adding this beside flowers and seating charts in my brain."]
        : [];
    return [...(MOOMOO[intent] ?? []), ...stageLines, ...(GENERIC[intent] ?? GENERIC.generic)];
  }
  return GENERIC[intent] ?? GENERIC.generic;
}

