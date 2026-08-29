export type ItemKind = "gift" | "quest" | "keepsake" | "food" | "flower";

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: ItemKind;
  icon: string;
  giftable?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  flower: { id: "flower", name: "Flower", desc: "Picked from someone's garden.", kind: "flower", icon: "o_flower_pink", giftable: true },
  bouquet: { id: "bouquet", name: "Bouquet", desc: "Three flowers and a ribbon. Made by you.", kind: "gift", icon: "o_flower_yellow", giftable: true },
  coffee: { id: "coffee", name: "Coffee", desc: "Warm. Two sugars. You know the order.", kind: "food", icon: "ui_coin", giftable: true },
  karak: { id: "karak", name: "Karak", desc: "Corniche-strength. The good kind.", kind: "food", icon: "ui_coin", giftable: true },
  chocolate: { id: "chocolate", name: "Chocolate", desc: "A little square of peace.", kind: "gift", icon: "ui_heart", giftable: true },
  postcard: { id: "postcard", name: "Postcard", desc: "Wish you were here. You are.", kind: "gift", icon: "ui_star", giftable: true },
  note: { id: "note", name: "Note", desc: "Folded twice. His handwriting.", kind: "quest", icon: "ui_star", giftable: true },
  keepsake_ring: { id: "keepsake_ring", name: "Tiny ring charm", desc: "A permanent little forever.", kind: "keepsake", icon: "ui_heart" },
  heart_fragment: { id: "heart_fragment", name: "Heart fragment", desc: "A secret tucked into the city.", kind: "keepsake", icon: "ui_heart" },
};

export const itemById = (id: string) => ITEMS[id];

/** How much an NPC likes a gift. favorite > liked > ok > funny. */
export type GiftTier = "favorite" | "liked" | "ok" | "funny";

export interface GiftTaste {
  favorite: string[];
  liked: string[];
  funny?: string[];
}

export const GIFT_TASTE: Record<string, GiftTaste> = {
  moomoo: { favorite: ["coffee", "karak"], liked: ["note", "chocolate", "postcard"], funny: ["flower"] },
  mama: { favorite: ["bouquet", "flower"], liked: ["chocolate", "karak"], funny: ["coffee"] },
  baba: { favorite: ["karak"], liked: ["coffee", "postcard"], funny: ["chocolate"] },
  fadwa: { favorite: ["chocolate", "postcard"], liked: ["coffee", "bouquet"], funny: ["karak"] },
  nour: { favorite: ["coffee"], liked: ["chocolate", "postcard"], funny: ["bouquet"] },
  hazel: { favorite: ["chocolate"], liked: ["coffee", "postcard"], funny: ["karak"] },
  rhiannon: { favorite: ["flower", "bouquet"], liked: ["coffee", "chocolate"] },
  chloe: { favorite: ["coffee", "chocolate"], liked: ["postcard"], funny: ["karak"] },
};

export function giftTier(npcId: string, itemId: string): GiftTier {
  const t = GIFT_TASTE[npcId];
  if (!t) return "ok";
  if (t.favorite.includes(itemId)) return "favorite";
  if (t.liked.includes(itemId)) return "liked";
  if (t.funny?.includes(itemId)) return "funny";
  return "ok";
}

export function giftRelGain(tier: GiftTier) {
  if (tier === "favorite") return 4;
  if (tier === "liked") return 3;
  if (tier === "funny") return 1;
  return 2;
}
