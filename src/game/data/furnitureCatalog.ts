export type BuildCategory = "floor" | "wall" | "door" | "furniture" | "decor";

export interface BuildCatalogItem {
  id: string;
  name: string;
  category: BuildCategory;
  price: number;
  texture?: string;
  style?: string;
  special?: boolean;
}

export const BUILD_CATALOG: BuildCatalogItem[] = [
  { id: "basic_floor", name: "Warm wood", category: "floor", price: 3, style: "wood" },
  { id: "cream_tile", name: "Cream tile", category: "floor", price: 5, style: "cream" },
  { id: "coastal_tile", name: "Coastal blue tile", category: "floor", price: 8, style: "coastal" },
  { id: "basic_wall", name: "Soft plaster wall", category: "wall", price: 8, style: "plaster" },
  { id: "green_wall", name: "Sage wall", category: "wall", price: 11, style: "sage" },
  { id: "luxury_wall", name: "Statement wall", category: "wall", price: 20, style: "luxury" },
  { id: "wood_door", name: "Warm wood door", category: "door", price: 25, style: "wood" },
  { id: "blue_door", name: "Coastal blue door", category: "door", price: 35, style: "blue" },
  { id: "chair", name: "Little chair", category: "furniture", price: 35, texture: "f_chair" },
  { id: "plant", name: "Happy plant", category: "decor", price: 28, texture: "f_plant" },
  { id: "lamp", name: "Warm lamp", category: "decor", price: 45, texture: "f_lamp" },
  { id: "rug", name: "Soft rug", category: "decor", price: 75, texture: "f_rug" },
  { id: "table", name: "Dinner table", category: "furniture", price: 120, texture: "f_table" },
  { id: "bookshelf", name: "Keepsake shelf", category: "furniture", price: 135, texture: "f_bookshelf" },
  { id: "study_desk", name: "Study desk", category: "furniture", price: 145, texture: "f_desk" },
  { id: "sofa", name: "Good sofa", category: "furniture", price: 190, texture: "f_sofa" },
  { id: "bed", name: "Cloud bed", category: "furniture", price: 240, texture: "f_bed" },
  { id: "kitchen_fridge", name: "Kitchen fridge", category: "furniture", price: 260, texture: "f_fridge" },
  { id: "vanity", name: "Getting-ready vanity", category: "furniture", price: 285, texture: "f_vanity" },
  { id: "cinema_tv", name: "Movie-night TV", category: "furniture", price: 360, texture: "f_tv" },
  { id: "travel_photos", name: "Travel photo wall", category: "decor", price: 90, texture: "f_wallart" },
  { id: "amalfi_souvenir", name: "Amalfi keepsakes", category: "decor", price: 110, texture: "f_bookshelf" },
  { id: "designer_lamp", name: "Designer light", category: "decor", price: 210, texture: "f_lamp" },
  { id: "wedding_lantern", name: "Wedding lantern", category: "decor", price: 0, texture: "f_lamp", special: true },
  { id: "wedding_portrait", name: "Wedding portrait", category: "decor", price: 0, texture: "f_wallart", special: true },
];

export const buildItemById = (id: string) => BUILD_CATALOG.find((item) => item.id === id);
