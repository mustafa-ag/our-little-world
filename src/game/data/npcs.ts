import { baseColors, type CharColors } from "../palette";

// ---------------------------------------------------------------------------
// The people in Jasmin's world 🤍
//
// The player is Jasmin ("Juju"). Everyone else is placed in the city they
// live in. EDIT ME freely to tweak looks, positions (tx, ty), and lines.
// ---------------------------------------------------------------------------

export type Facing = "down" | "up" | "left" | "right";

export interface NpcDef {
  id: string;
  name: string;
  colors: CharColors;
  location: string; // location id from locations.ts
  tx: number;
  ty: number;
  facing?: Facing;
  /** casual lines shown when there's no active quest business. */
  dialogue: string[];
  /** quest this person offers (see data/quests.ts). */
  questId?: string;
}

// The playable character — Jasmin (Juju).
export const PLAYER: { id: string; name: string; colors: CharColors } = {
  id: "her",
  name: "Juju",
  colors: baseColors({
    skin: "#f0c49a",
    skinShade: "#daa87c",
    hair: "#3a251b",
    hairShade: "#26160f",
    top: "#f28ab2",
    topShade: "#d96e98",
    bottom: "#5b6ee1",
  }),
};

export const NPCS: NpcDef[] = [
  // ---- Moomoo (me) — Dubai, Silicon Oasis ----
  {
    id: "moomoo",
    name: "Moomoo",
    colors: baseColors({ hair: "#1c130d", hairShade: "#0f0a06", skin: "#d9a06f", skinShade: "#c1885a", top: "#3f6fd0", topShade: "#2f57a8", bottom: "#2a2f38" }),
    location: "dubai_oasis",
    tx: 52,
    ty: 62,
    facing: "down",
    dialogue: [
      "Hi Juju. I built this whole little world for you 🤍",
      "Every city, every quest... it's all us.",
      "Wherever you go, I'm right here. Love you, always. - Moomoo",
    ],
    questId: "q_date",
  },

  // ---- Family ----
  {
    id: "mama",
    name: "Mama",
    colors: baseColors({ hair: "#5a5a5a", hairShade: "#3f3f3f", skin: "#e6b58c", skinShade: "#cf9a70", top: "#c98adf", topShade: "#a86dbf", bottom: "#6b4f9e" }),
    location: "dubai_damac",
    tx: 14,
    ty: 24,
    facing: "down",
    dialogue: ["Habibti! Have you eaten?", "The garden at Damac Lagoons is blooming."],
    questId: "q_flowers",
  },
  {
    id: "baba",
    name: "Baba",
    colors: baseColors({ hair: "#33312e", hairShade: "#1f1d1b", skin: "#d9a679", skinShade: "#c08d60", top: "#5cb06d", topShade: "#489158", bottom: "#3a2b3a" }),
    location: "abudhabi_yas",
    tx: 96,
    ty: 52,
    facing: "down",
    dialogue: ["Ahlan, my dear. I'm home Fridays and Saturdays.", "Yas is quiet and lovely this weekend."],
    questId: "q_start",
  },
  {
    id: "fadwa",
    name: "Fadwa",
    colors: baseColors({ hair: "#2a1c14", hairShade: "#180f0a", skin: "#eab98f", skinShade: "#d29c70", top: "#e2637a", topShade: "#bf4a60", bottom: "#3a2b3a" }),
    location: "london_westend",
    tx: 18,
    ty: 16,
    facing: "down",
    dialogue: ["Sis!! You're in London!", "Come on, let's get food and walk by the river."],
  },
  {
    id: "nour",
    name: "Nour",
    colors: baseColors({ hair: "#241811", hairShade: "#130c07", skin: "#d9a97c", skinShade: "#c08f62", top: "#f4c95d", topShade: "#e0b23f", bottom: "#333a45" }),
    location: "germany",
    tx: 82,
    ty: 62,
    facing: "down",
    dialogue: ["Hey from Frankfurt!", "Miss you, sis. Stay for a coffee?"],
  },

  // ---- Friends ----
  {
    id: "hazel",
    name: "Hazel",
    colors: baseColors({ hair: "#8a5a2a", hairShade: "#6b451f", skin: "#f2d3b0", skinShade: "#dab48f", top: "#7be0a3", topShade: "#57bf82", bottom: "#333a45" }),
    location: "edinburgh_oldtown",
    tx: 72,
    ty: 52,
    facing: "down",
    dialogue: ["Juju!! Back in Edi!", "The girls are around here somewhere..."],
    questId: "q_edinburgh",
  },
  {
    id: "rhiannon",
    name: "Rhiannon",
    colors: baseColors({ hair: "#3a2a1a", hairShade: "#241a10", skin: "#f0cba6", skinShade: "#d7ac83", top: "#8ecae6", topShade: "#6aa9c8", bottom: "#3d5a80" }),
    location: "edinburgh_oldtown",
    tx: 28,
    ty: 66,
    facing: "down",
    dialogue: ["There she is! Missed you loads.", "Royal Mile stroll, then a cuppa?"],
  },
  {
    id: "chloe",
    name: "Chloe",
    colors: baseColors({ hair: "#c9a24a", hairShade: "#a8842f", skin: "#f4d9bd", skinShade: "#e0be9b", top: "#f28ab2", topShade: "#d96e98", bottom: "#5b6ee1" }),
    location: "leicester",
    tx: 28,
    ty: 62,
    facing: "down",
    dialogue: ["Juju!! All the way to Oadby for me?", "PhD life is a lot. Tea's on me."],
  },
];

// Everyone that needs a drawn sprite (player + npcs).
export const CHARACTERS = [
  { id: PLAYER.id, colors: PLAYER.colors },
  ...NPCS.map((n) => ({ id: n.id, colors: n.colors })),
];
