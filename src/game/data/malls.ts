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
