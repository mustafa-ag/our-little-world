import type { LocationDef } from "../data/locations";

export interface LightingProfile {
  directionX: number;
  directionY: number;
  castLength: number;
  opacity: number;
  ambient: number;
  warmth: number;
}

export interface WorldVisualTheme {
  id: string;
  /** A lightweight screen wash keeps lighting global without changing world or collision data. */
  ambientColor: number;
  ambientAlpha: number;
  lightDirection: "northwest" | "northeast";
  groundStyle: string;
  vegetationStyle: string;
  architectureStyle: string;
  lighting: LightingProfile;
}

const THEMES: Record<string, WorldVisualTheme> = {
  abudhabi: { id: "abudhabi-sun", ambientColor: 0xffc978, ambientAlpha: 0.05, lightDirection: "northwest", groundStyle: "warm paving and sand", vegetationStyle: "desert palms and irrigated planting", architectureStyle: "light stone and villas", lighting: { directionX: 0.8, directionY: 0.45, castLength: 28, opacity: 0.3, ambient: 0.1, warmth: 0.9 } },
  dubai: { id: "dubai-sun", ambientColor: 0xffdf9e, ambientAlpha: 0.035, lightDirection: "northwest", groundStyle: "bright paving and asphalt", vegetationStyle: "landscaped urban greenery", architectureStyle: "glass towers and contemporary facades", lighting: { directionX: 0.78, directionY: 0.42, castLength: 25, opacity: 0.27, ambient: 0.09, warmth: 0.8 } },
  london: { id: "london-soft", ambientColor: 0xb8c7d8, ambientAlpha: 0.045, lightDirection: "northeast", groundStyle: "cool pavement and brick", vegetationStyle: "temperate street trees", architectureStyle: "terraces and civic stone", lighting: { directionX: 0.62, directionY: 0.5, castLength: 20, opacity: 0.22, ambient: 0.15, warmth: 0.25 } },
  edinburgh: { id: "edinburgh-soft", ambientColor: 0xb5c1cf, ambientAlpha: 0.055, lightDirection: "northeast", groundStyle: "cool cobbles and stone", vegetationStyle: "temperate greenery", architectureStyle: "historic sandstone", lighting: { directionX: 0.6, directionY: 0.5, castLength: 22, opacity: 0.24, ambient: 0.16, warmth: 0.2 } },
  leicester: { id: "leicester-soft", ambientColor: 0xc7d1c1, ambientAlpha: 0.04, lightDirection: "northeast", groundStyle: "pavement and brick", vegetationStyle: "parkland greenery", architectureStyle: "suburban brick", lighting: { directionX: 0.62, directionY: 0.46, castLength: 20, opacity: 0.22, ambient: 0.14, warmth: 0.35 } },
  germany: { id: "frankfurt-clear", ambientColor: 0xc5d4de, ambientAlpha: 0.035, lightDirection: "northwest", groundStyle: "clean paving and road", vegetationStyle: "urban trees", architectureStyle: "central European facades", lighting: { directionX: 0.7, directionY: 0.4, castLength: 21, opacity: 0.22, ambient: 0.12, warmth: 0.3 } },
  amman: { id: "amman-sun", ambientColor: 0xf0c27a, ambientAlpha: 0.055, lightDirection: "northwest", groundStyle: "warm limestone and dust", vegetationStyle: "dry-climate planting", architectureStyle: "limestone urban forms", lighting: { directionX: 0.8, directionY: 0.46, castLength: 29, opacity: 0.3, ambient: 0.1, warmth: 0.9 } },
};

const DEFAULT_THEME = THEMES.dubai;
export const DEFAULT_LIGHTING_PROFILE = DEFAULT_THEME.lighting;

/** All locations use this renderer/theme path; city metadata changes presentation, not technology. */
export function getWorldVisualTheme(location: Pick<LocationDef, "cityId">): WorldVisualTheme {
  return THEMES[location.cityId] ?? DEFAULT_THEME;
}
