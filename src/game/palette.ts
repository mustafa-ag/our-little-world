// Shared colours. Kept in one place so the whole game feels cohesive
// and cute (soft pastels + friendly greens/blues).

export const Palette = {
  // ground / nature
  grass: "#7bc86c",
  grassDark: "#66b556",
  grassLight: "#93d67f",
  path: "#e3c79a",
  pathDark: "#d1b183",
  water: "#63c6e8",
  waterDark: "#4bb0d6",
  sand: "#f2dcae",
  road: "#6b6f7a",
  roadLine: "#f4d35e",

  // buildings
  wall: "#f3ddc9",
  wallDark: "#e0c3a8",
  roofRed: "#e26d5c",
  roofBlue: "#5c8ce2",
  roofPurple: "#a06de2",
  roofGreen: "#5cb06d",
  door: "#7a5238",
  windowGlass: "#bfe6ff",
  wood: "#a9744f",
  woodDark: "#8a5c3b",

  // ui
  ink: "#3a2b3a",
  cream: "#fff4e6",
  panel: "#fff9f0",
  panelBorder: "#caa27a",
  pink: "#f4a6c0",
  pinkDeep: "#e46d94",
  heart: "#ff5c8a",
  gold: "#f4c95d",
  sky: "#8ecae6",
  night: "#2b2d42",
  shadow: "rgba(0,0,0,0.18)",
} as const;

// A character colour set. Everyone is drawn from the same template,
// just recoloured, so we can make you / her / family / friends easily.
export interface CharColors {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  top: string; // shirt / dress
  topShade: string;
  bottom: string; // trousers / skirt
  shoes: string;
}

const shade = (base: string) => base; // placeholder; explicit shades below read nicer

// Handy outfit palettes reused by the wardrobe system.
export const Outfits: Record<string, { top: string; topShade: string; bottom: string; shoes: string; label: string }> = {
  casual: { label: "Casual", top: "#f28ab2", topShade: "#d96e98", bottom: "#5b6ee1", shoes: "#3a2b3a" },
  cozy: { label: "Cozy", top: "#c98adf", topShade: "#a86dbf", bottom: "#6b4f9e", shoes: "#4a3a2a" },
  summer: { label: "Summer", top: "#ffe08a", topShade: "#e6c25f", bottom: "#8ad0ff", shoes: "#ffffff" },
  sporty: { label: "Sporty", top: "#7be0a3", topShade: "#57bf82", bottom: "#333a45", shoes: "#f4f4f4" },
  elegant: { label: "Elegant", top: "#e2637a", topShade: "#bf4a60", bottom: "#3a2b3a", shoes: "#2a2230" },
  winter: { label: "Winter", top: "#8ecae6", topShade: "#6aa9c8", bottom: "#3d5a80", shoes: "#2a2230" },
  london_coat: { label: "London Coat", top: "#3d4a6b", topShade: "#2a334d", bottom: "#2a2230", shoes: "#1a1420" },
  pink_dress: { label: "Pink Dress", top: "#ff8fb8", topShade: "#e46d94", bottom: "#ff8fb8", shoes: "#fff4e6" },
  edi_hoodie: { label: "Edinburgh Hoodie", top: "#3d8b6e", topShade: "#2d6b54", bottom: "#333a45", shoes: "#2a2230" },
  sneakers: { label: "Mall sneakers", top: "#fff4e6", topShade: "#e8d6be", bottom: "#5b6ee1", shoes: "#ffffff" },
  city_bag: { label: "City bag", top: "#c9a27a", topShade: "#a8845c", bottom: "#3a2b3a", shoes: "#2a2230" },
  secret_gold: { label: "Golden hour", top: "#f4c95d", topShade: "#d4a83a", bottom: "#3a2b3a", shoes: "#fff4e6" },
};

export type OutfitId = keyof typeof Outfits;

export function baseColors(overrides: Partial<CharColors> = {}): CharColors {
  return {
    skin: "#f6c9a0",
    skinShade: "#e0a980",
    hair: "#4a342a",
    hairShade: "#33241d",
    top: "#f28ab2",
    topShade: "#d96e98",
    bottom: "#5b6ee1",
    shoes: "#3a2b3a",
    ...overrides,
  };
}
