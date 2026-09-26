// Mall layouts shared by the Phaser MallScene and the 3D mall directory modal
// (src/app3d/ui/mall.ts). Pure data: no Phaser imports.
import { TILE } from "../constants";

export type MallStoreKind = "fashion" | "jewelry" | "cafe" | "aquarium" | "cinema" | "accessories";

export type MallId = "dubai_mall" | "dubai_hills_mall" | "yas_mall";

export interface MallConfig {
  id: MallId;
  title: string;
  subtitle: string;
  exterior: string;
  exit: { x: number; y: number };
  floor: number;
  accent: number;
  stores: { kind: MallStoreKind; label: string; x: number; y: number; w: number; h: number }[];
}

export const MALLS: Record<MallId, MallConfig> = {
  dubai_mall: {
    id: "dubai_mall",
    title: "Dubai Mall",
    subtitle: "Fashion Avenue · aquarium gallery · fountain coffee",
    exterior: "dubai_downtown",
    exit: { x: 22 * TILE + TILE / 2, y: 42 * TILE },
    floor: 0xf1e6d2,
    accent: 0xb58a52,
    stores: [
      { kind: "fashion", label: "FASHION AVENUE", x: 62, y: 54, w: 132, h: 72 },
      { kind: "jewelry", label: "GOLD & GLEAM", x: 290, y: 54, w: 118, h: 72 },
      { kind: "aquarium", label: "AQUARIUM VIEW", x: 420, y: 52, w: 150, h: 116 },
      { kind: "cafe", label: "FOUNTAIN COFFEE", x: 208, y: 280, w: 150, h: 62 },
    ],
  },
  dubai_hills_mall: {
    id: "dubai_hills_mall",
    title: "Dubai Hills Mall",
    subtitle: "Easy strolls · accessories · garden cafe",
    exterior: "dubai_hills",
    exit: { x: 54 * TILE + TILE / 2, y: 34 * TILE },
    floor: 0xe8efd9,
    accent: 0x6eaa73,
    stores: [
      { kind: "fashion", label: "WEEKEND FITS", x: 56, y: 66, w: 150, h: 70 },
      { kind: "accessories", label: "LITTLE EXTRAS", x: 250, y: 66, w: 132, h: 70 },
      { kind: "cafe", label: "GARDEN CAFE", x: 416, y: 70, w: 138, h: 70 },
      { kind: "jewelry", label: "SOFT SPARKLE", x: 178, y: 274, w: 160, h: 64 },
    ],
  },
  yas_mall: {
    id: "yas_mall",
    title: "Yas Mall",
    subtitle: "Cinema lights · fashion · jewelry · food court",
    exterior: "abudhabi_yasmall",
    exit: { x: 52 * TILE + TILE / 2, y: 30 * TILE },
    floor: 0xe2e6ed,
    accent: 0x4b7fb4,
    stores: [
      { kind: "fashion", label: "YAS STYLE", x: 54, y: 58, w: 142, h: 72 },
      { kind: "jewelry", label: "BRIGHT THINGS", x: 260, y: 58, w: 126, h: 72 },
      { kind: "cinema", label: "TINY CINEMA", x: 420, y: 48, w: 150, h: 108 },
      { kind: "cafe", label: "FOOD COURT", x: 196, y: 278, w: 178, h: 62 },
    ],
  },
};

export const mallById = (id: string): MallConfig | undefined => (MALLS as Record<string, MallConfig>)[id];

// ---- 3D mall directory catalogue (src/app3d/ui/mall.ts) ----------------------
export type MallDepartment = "fashion" | "cafe" | "jewellery" | "electronics" | "food";

export type MallRewardType = "outfit" | "accessory" | "item" | "keepsake";

export interface MallProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  rewardType: MallRewardType;
  /** Outfit / accessory / item / keepsake id granted on purchase. */
  rewardId: string;
}

export interface MallDepartmentDef {
  id: MallDepartment;
  label: string;
  /** Storefront name when this mall has no store of the matching kind. */
  fallbackName: string;
  blurb: string;
  products: MallProduct[];
}

/**
 * Outfits the fashion store sells. Buying sets the same `shopping_reward_*` /
 * `bought_sneakers` flag OUTFIT_UNLOCKS keys on, so refreshOutfitUnlocks agrees.
 */
export const MALL_OUTFITS: { id: string; price: number; flag: string; description: string }[] = [
  { id: "sneakers", price: 18, flag: "bought_sneakers", description: "Cloud-soft and suspiciously practical." },
  { id: "weekend_jacket", price: 38, flag: "shopping_reward_weekend_jacket", description: "The jacket that makes plans by itself." },
  { id: "shopping_sandals", price: 34, flag: "shopping_reward_shopping_sandals", description: "Sunny, shiny, not remotely necessary." },
  { id: "sparkle_set", price: 44, flag: "shopping_reward_sparkle_set", description: "Two pieces pretending to be one sensible choice." },
  { id: "shopping_heels", price: 48, flag: "shopping_reward_shopping_heels", description: "Elegant enough for denial." },
  { id: "mall_dress", price: 55, flag: "shopping_reward_mall_dress", description: "Polished, dramatic, and technically one item." },
];

export const MALL_DEPARTMENTS: MallDepartmentDef[] = [
  { id: "fashion", label: "Fashion", fallbackName: "FASHION AVENUE", blurb: "Try it on in the mirror first. The mirror always says yes.", products: [] },
  {
    id: "cafe",
    label: "Café",
    fallbackName: "MALL CAFÉ",
    blurb: "Order at the counter, or make his exact order yourself.",
    products: [
      { id: "cafe_coffee", name: "Coffee", description: "Warm. Two sugars. You know the order.", price: 5, icon: "☕", rewardType: "item", rewardId: "coffee" },
      { id: "cafe_karak", name: "Karak", description: "Corniche-strength. The good kind.", price: 4, icon: "☕", rewardType: "item", rewardId: "karak" },
      { id: "cafe_iced", name: "Victory iced coffee", description: "Fuel for the final six hundred metres.", price: 7, icon: "🧊", rewardType: "item", rewardId: "victory_iced_coffee" },
      { id: "cafe_macarons", name: "Tiny macarons", description: "Six colors. Gone before the exit.", price: 8, icon: "●", rewardType: "item", rewardId: "shopping_macarons" },
    ],
  },
  {
    id: "jewellery",
    label: "Jewellery",
    fallbackName: "GOLD & GLEAM",
    blurb: "Necklace, bracelet, hair clip. Extremely necessary.",
    products: [
      { id: "jewel_hair_clip", name: "Pearl hair clip", description: "Small, luminous, wearable immediately.", price: 24, icon: "✧", rewardType: "accessory", rewardId: "pearl_hair_clip" },
      { id: "jewel_mini_bag", name: "Mini bag", description: "One key and a disproportionate amount of attitude.", price: 40, icon: "▣", rewardType: "accessory", rewardId: "mini_bag" },
      { id: "jewel_love_bracelet", name: "Love Bracelet", description: "A forever-shaped disturbance in the budget.", price: 120, icon: "○", rewardType: "accessory", rewardId: "love_bracelet" },
      { id: "jewel_nail_bracelet", name: "Nail Bracelet", description: "Sharp idea. Soft velvet box.", price: 130, icon: "∿", rewardType: "accessory", rewardId: "nail_bracelet" },
      { id: "jewel_gold_necklace", name: "Gold Textured Necklace", description: "Warm gold, tiny sparkles, several zeroes.", price: 140, icon: "⌄", rewardType: "accessory", rewardId: "gold_textured_necklace" },
    ],
  },
  {
    id: "electronics",
    label: "Electronics",
    fallbackName: "CHARGE & CHAOS",
    blurb: "Headphones, cameras, and devices Baba can price-check.",
    products: [
      { id: "tech_power_bank", name: "Heart power bank", description: "Practical, pink, slightly overpriced.", price: 20, icon: "↯", rewardType: "item", rewardId: "heart_power_bank" },
      { id: "tech_headphones", name: "Cloud headphones", description: "Noise cancellation for budget discussions.", price: 42, icon: "◉", rewardType: "item", rewardId: "cloud_headphones" },
      { id: "tech_camera", name: "Pocket camera", description: "For photographing the evidence beautifully.", price: 65, icon: "▣", rewardType: "keepsake", rewardId: "pocket_camera" },
    ],
  },
  {
    id: "food",
    label: "Food court",
    fallbackName: "FOOD COURT",
    blurb: "Every cuisine, one tray, zero regrets.",
    products: [
      { id: "food_crisps", name: "Emergency crisps", description: "The genuinely useful purchase at last.", price: 3, icon: "✦", rewardType: "item", rewardId: "shopping_crisps" },
      { id: "food_gelato", name: "Gelato", description: "Cold, sunny, gone far too quickly.", price: 6, icon: "🍨", rewardType: "item", rewardId: "gelato" },
      { id: "food_wrap", name: "Grill wrap", description: "Smoky, messy, worth the napkins.", price: 8, icon: "🌯", rewardType: "item", rewardId: "grill_wrap" },
      { id: "food_chocolate", name: "Fancy chocolate", description: "For recovery from financial discussion.", price: 9, icon: "■", rewardType: "item", rewardId: "shopping_fancy_chocolate" },
      { id: "food_cake", name: "Celebration cake box", description: "Too large. Completely correct.", price: 14, icon: "▰", rewardType: "item", rewardId: "celebration_cake_box" },
    ],
  },
];

/** Store kind in MallConfig.stores that stands for each directory department. */
export const DEPARTMENT_KINDS: Record<MallDepartment, MallStoreKind[]> = {
  fashion: ["fashion"],
  cafe: ["cafe"],
  jewellery: ["jewelry", "accessories"],
  electronics: [],
  food: [],
};
