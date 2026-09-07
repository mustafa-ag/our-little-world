export type ShoppingMallId = "dubai_mall" | "dubai_hills_mall" | "yas_mall";

export type ShoppingRewardType = "outfit" | "accessory" | "item" | "keepsake";

export interface ShoppingProductDef {
  id: string;
  name: string;
  description: string;
  stress: number;
  icon: string;
  rewardType: ShoppingRewardType;
  rewardId: string;
}

export interface ShoppingStoreDef {
  id: string;
  name: string;
  subtitle: string;
  side: "left" | "right";
  floor: 1 | 2 | 3 | 4;
  y: number;
  color: number;
  accent: number;
  bagLabel: string;
  bonus?: boolean;
  flirtOnPurchase?: boolean;
  products: ShoppingProductDef[];
}

/**
 * The promenade is one continuous physical space. Floor numbers are visual acts;
 * escalators and stairs connect their Y ranges without changing logical TILE size.
 */
export const BABA_SHOPPING_STORES: ShoppingStoreDef[] = [
  {
    id: "fashion",
    name: "THE LOOK",
    subtitle: "Dresses · sets · going-out decisions",
    side: "left",
    floor: 1,
    y: 330,
    color: 0xe46d94,
    accent: 0xffd7e6,
    bagLabel: "LOOK",
    products: [
      { id: "fashion_elegant_dress", name: "Elegant dress", description: "Polished, dramatic, and technically one item.", stress: 9, icon: "♢", rewardType: "outfit", rewardId: "mall_dress" },
      { id: "fashion_matching_set", name: "Cute matching set", description: "Two pieces pretending to be one sensible choice.", stress: 7, icon: "✦", rewardType: "outfit", rewardId: "sparkle_set" },
      { id: "fashion_weekend_jacket", name: "Going-out jacket", description: "The jacket that creates plans by itself.", stress: 6, icon: "◇", rewardType: "outfit", rewardId: "weekend_jacket" },
    ],
  },
  {
    id: "shoes",
    name: "SOLE PURPOSE",
    subtitle: "Excellent reasons to need another shelf",
    side: "right",
    floor: 1,
    y: 330,
    color: 0x527fc4,
    accent: 0xdceaff,
    bagLabel: "SOLE",
    products: [
      { id: "shoes_heels", name: "Evening heels", description: "Fast enough for shopping. Elegant enough for denial.", stress: 10, icon: "⌁", rewardType: "outfit", rewardId: "shopping_heels" },
      { id: "shoes_sneakers", name: "Cloud sneakers", description: "The genuinely practical choice. Suspicious.", stress: 5, icon: "≈", rewardType: "outfit", rewardId: "sneakers" },
      { id: "shoes_sandals", name: "Golden sandals", description: "Sunny, shiny, and not remotely necessary.", stress: 8, icon: "═", rewardType: "outfit", rewardId: "shopping_sandals" },
    ],
  },
  {
    id: "cartier",
    name: "CARTIER",
    subtitle: "A tasteful text sign · an alarming receipt",
    side: "left",
    floor: 2,
    y: 1160,
    color: 0x7c1828,
    accent: 0xf3d7a0,
    bagLabel: "C",
    products: [
      { id: "cartier_love_bracelet", name: "Love Bracelet", description: "A forever-shaped disturbance in Baba's budget.", stress: 18, icon: "○", rewardType: "accessory", rewardId: "love_bracelet" },
      { id: "cartier_gold_necklace", name: "Gold Textured Necklace", description: "Warm gold, tiny sparkles, several receipt zeroes.", stress: 20, icon: "⌄", rewardType: "accessory", rewardId: "gold_textured_necklace" },
      { id: "cartier_nail_bracelet", name: "Juste un Clou / Nail Bracelet", description: "Sharp idea. Soft velvet box. Baba felt that.", stress: 19, icon: "∿", rewardType: "accessory", rewardId: "nail_bracelet" },
    ],
  },
  {
    id: "beauty",
    name: "GLOW THEORY",
    subtitle: "Perfume · lipstick · excellent lighting",
    side: "right",
    floor: 2,
    y: 1160,
    color: 0xb65d87,
    accent: 0xffe7f0,
    bagLabel: "GLOW",
    products: [
      { id: "beauty_perfume", name: "Rose-night perfume", description: "Smells expensive because it has confidence.", stress: 9, icon: "♧", rewardType: "item", rewardId: "shopping_perfume" },
      { id: "beauty_lipstick", name: "Berry lipstick", description: "A tiny tube of main-character behavior.", stress: 6, icon: "▮", rewardType: "item", rewardId: "shopping_lipstick" },
      { id: "beauty_hair_clip", name: "Pearl hair clip", description: "Small, luminous, and wearable immediately.", stress: 5, icon: "✧", rewardType: "accessory", rewardId: "pearl_hair_clip" },
    ],
  },
  {
    id: "lingerie",
    name: "SOFT SECRETS",
    subtitle: "Tasteful sets · elegant packaging · no comments",
    side: "left",
    floor: 3,
    y: 2035,
    color: 0x2d2737,
    accent: 0xf1c7d6,
    bagLabel: "S♡",
    flirtOnPurchase: true,
    products: [
      { id: "lingerie_black_lace", name: "Black lace set", description: "Elegant black tissue paper. Moomoo forgets language.", stress: 11, icon: "◆", rewardType: "item", rewardId: "black_lace_set" },
      { id: "lingerie_blush_satin", name: "Blush satin set", description: "Soft pink packaging and one very loud silence.", stress: 9, icon: "♥", rewardType: "item", rewardId: "blush_satin_set" },
      { id: "lingerie_soft_white", name: "Soft white set", description: "Simple, pretty, and apparently fascinating to Moomoo.", stress: 7, icon: "◇", rewardType: "item", rewardId: "soft_white_set" },
    ],
  },
  {
    id: "handbags",
    name: "BAG LOGIC",
    subtitle: "A bag that arrives inside another bag",
    side: "right",
    floor: 3,
    y: 2035,
    color: 0x8c5b45,
    accent: 0xf2dcc7,
    bagLabel: "BAG",
    products: [
      { id: "bag_mini", name: "Mini bag", description: "Carries one key and a disproportionate amount of attitude.", stress: 7, icon: "▣", rewardType: "accessory", rewardId: "mini_bag" },
      { id: "bag_shoulder", name: "Shoulder bag", description: "The sensible bag, inside an unnecessary shopping bag.", stress: 9, icon: "▰", rewardType: "accessory", rewardId: "shoulder_bag" },
      { id: "bag_tote", name: "Big tote", description: "Can carry the smaller bag. The recursion begins.", stress: 12, icon: "▥", rewardType: "accessory", rewardId: "big_tote" },
    ],
  },
  {
    id: "home_hugs",
    name: "HOME & HUGS",
    subtitle: "Final-floor objects nobody planned to buy",
    side: "left",
    floor: 4,
    y: 2705,
    color: 0x5f9b7d,
    accent: 0xddf4e8,
    bagLabel: "HOME",
    bonus: true,
    products: [
      { id: "home_cloud", name: "Cloud plush", description: "No practical function. Perfect performance.", stress: 6, icon: "☁", rewardType: "keepsake", rewardId: "shopping_cloud_plush" },
      { id: "home_candle", name: "Fancy candle", description: "Smells like a hotel lobby with boundaries.", stress: 8, icon: "♨", rewardType: "item", rewardId: "shopping_candle" },
      { id: "home_frame", name: "Little gold frame", description: "For a photo of everyone surviving this mall.", stress: 7, icon: "▧", rewardType: "keepsake", rewardId: "shopping_gold_frame" },
    ],
  },
  {
    id: "snacks",
    name: "EMERGENCY TREATS",
    subtitle: "Mock-light-speed fuel",
    side: "right",
    floor: 4,
    y: 2705,
    color: 0xc98642,
    accent: 0xffedc7,
    bagLabel: "YUM",
    bonus: true,
    products: [
      { id: "snack_macarons", name: "Tiny macarons", description: "Six colors. Gone before the exit.", stress: 5, icon: "●", rewardType: "item", rewardId: "shopping_macarons" },
      { id: "snack_chocolate", name: "Fancy chocolate", description: "For recovery from financial discussion.", stress: 6, icon: "■", rewardType: "item", rewardId: "shopping_fancy_chocolate" },
      { id: "snack_crisps", name: "Emergency crisps", description: "The genuinely useful purchase at last.", stress: 4, icon: "✦", rewardType: "item", rewardId: "shopping_crisps" },
    ],
  },
];

export const shoppingStoreById = (id: string) => BABA_SHOPPING_STORES.find((entry) => entry.id === id);
export const shoppingProductById = (id: string) => BABA_SHOPPING_STORES.flatMap((entry) => entry.products).find((entry) => entry.id === id);
