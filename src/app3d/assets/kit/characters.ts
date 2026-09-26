// Storybook characters for the browser.
//
// Primary path: skinned, animated GLBs authored in Blender
// (tools/blender/characters/build_characters.py):
//   - juju.glb      the player (Juju), with her own hair / face / outfit pieces;
//   - npc-base.glb  a neutral body on the SAME rig + clips, six hair variants
//                   (hair_long / bob / short / bun / ponytail / curly) and
//                   skirt / jeans / cardigan pieces toggled per person.
// Both carry the clips idle / walk / run / wave / nod. Materials are named
// slots (olw_skin, olw_hair, olw_top, olw_outer, olw_bottom, olw_shoes,
// olw_accent, olw_face); vertex colours (COLOR_0) are shading multipliers, so
// every slot is retinted with a flat runtime material and the face is a
// small painted texture.
//
// Fallback: the procedural pivot rig from assets/hero/character.ts (scaled to
// the world contract) until / unless the GLB loads. A rig built on the
// fallback upgrades itself in place once the GLB arrives, so callers can keep
// the same CharacterRig object.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { CharColors } from "../../../game/palette";
import { Outfits } from "../../../game/palette";
import { JUJU_HEIGHT } from "../../world/scale";
import { DECAL_ALPHA_INDEX } from "../../rendering/occlusion";
import { type AnimatedInstance, type AssetManager, type HierarchyInstance, type KitContext, remapSlots } from "../AssetManager";
import { heroCtx } from "../hero/slots";
import { buildCharacter, rigFromRoot, type CharacterBuild, type CharacterColors, type CharacterOpts, type HairStyle, HAIR_STYLES, retintCharacter, CHAR_HEIGHT as HERO_HEIGHT } from "../hero/character";
import { strHash } from "./util";
import { proceduralFaceMaterial, type FaceKind } from "./faces";

export interface CharacterRig {
  /** Stable holder: position / rotation.y this. */
  root: TransformNode;
  meshes: Mesh[];
  /**
   * Advance the animation. `moving` 0..1 (idle -> locomotion); `speed` is the
   * ground speed in units/s (drives the walk/run blend and playback rate so
   * the feet stay planted). Without `speed`, full `moving` means a run.
   */
  animate(dt: number, moving: number, speed?: number): void;
  setColors(c: CharColors): void;
  /** Player only: switch Juju's outfit (store outfit id). */
  setOutfit?(id: string): void;
  /** Play a short gesture (a wave when interacting, a nod when talked to). */
  gesture(kind?: "wave" | "nod"): void;
  /** true once the skinned GLB drives this rig (false: procedural fallback). */
  readonly skinned: boolean;
  dispose(): void;
}

/** Character height (world units, feet at 0) and head centre height. */
export const CHAR_HEIGHT = JUJU_HEIGHT;
export const HEAD_Y = 0.875;

export const JUJU_KEY = "juju";
export const NPC_BASE_KEY = "npc-base";
/** Same rig + clips as npc-base with a boyish build (broader shoulders, no bust) and short / curly hair. */
export const NPC_MALE_KEY = "npc-male";
/** People who use the npc-male body (their hair must be "short" or "curly"). */
const MALE_IDS = new Set(["baba", "moomoo"]);
const glb = (n: string) => `assets/models/${n}.glb`;

// Authored locomotion (printed by build_characters.py): in-place loops whose
// stance foot slides back at constant speed, so rate = speed / natural speed
// keeps the feet planted.
/** walk: 0.5487 u per 1.0 s loop (two steps); used below ~1.3 u/s (half-pushed joystick). */
export const WALK_SPEED = 0.5487;
/**
 * run: a light, bouncy jog, 1.6043 u per 0.6667 s loop (two steps with a real
 * flight phase) = 2.41 u/s at rate 1, i.e. exactly the keyboard stroll
 * (STROLL_SPEED) - ~3 steps/s; the Shift / full-joystick jog plays it at 1.5x.
 */
export const RUN_SPEED = 1.6043 / 0.6667;

/** Fallback builder is 1.5 u tall; the world contract says 1.05. */
const PROC_SCALE = JUJU_HEIGHT / HERO_HEIGHT;

export function toHeroColors(c: CharColors): CharacterColors {
  return { skin: c.skin, hair: c.hair, top: c.top, bottom: c.bottom, shoes: c.shoes };
}

// ------------------------------------------------------------ appearance ----

/** What the skinned rig needs to dress a character. */
export interface Appearance {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  /** Cardigan / jacket colour; omitted = no outer layer. */
  outer?: string;
  bottomKind: "skirt" | "jeans";
  /** NPC hair mesh variant (npc-base only). */
  hairStyle?: HairStyle;
  /** Juju: pearl choker, beaded strand, flower claw clip. */
  accessories?: boolean;
  /** Paint the face decal procedurally (faces.ts) instead of using the GLB's baked face. */
  face?: FaceKind;
  /** Hide every hair mesh (e.g. under a hijab). */
  hideHair?: boolean;
  /** Jewellery / accessory metal (olw_accent); omitted = plain white. Juju only for now. */
  accent?: string;
}

/** Juju's own look: warm dark olive skin, very long dark-brown wavy hair (vertex colours add darker roots / chestnut ends). */
export const JUJU_SKIN = "#8B5E3C";
export const JUJU_HAIR = "#3D2010";
/** The chestnut highlight streak painted into one side of her hair. */
export const JUJU_HAIR_STREAK = "#6B3A1F";

export interface JujuLook {
  top: string;
  bottom: string;
  bottomKind: "skirt" | "jeans";
  outer?: string;
  shoes: string;
}

/**
 * Outfit id (store.state.outfit) -> Juju's clothes. "casual" (the default) is
 * her signature look: white ruffle top, dark fitted jeans, white sneakers.
 * "cozy" is the storybook-reference look: dusty-pink cardigan over the cream
 * top with jeans. Other outfits derive from the shared Outfits palette.
 */
export const JUJU_LOOKS: Record<string, JujuLook> = {
  casual: { top: "#F5F0EB", bottom: "#2D2D3A", bottomKind: "jeans", shoes: "#fbfaf7" },
  cozy: { top: "#f7f0e3", outer: "#dc9eaa", bottom: "#6d8dc0", bottomKind: "jeans", shoes: "#fbfaf7" },
  summer: { top: "#ffe7a0", bottom: "#9fd3f5", bottomKind: "skirt", shoes: "#fbfaf7" },
  sneakers: { top: "#f7f0e3", bottom: "#6d8dc0", bottomKind: "jeans", shoes: "#ffffff" },
};
const JEANS_OUTFITS = new Set(["sporty", "winter", "london_coat", "edi_hoodie", "city_bag", "weekend_jacket", "pirate_chic", "sparkle_set", "secret_gold"]);
const COAT_OUTFITS = new Set(["winter", "london_coat", "edi_hoodie", "weekend_jacket"]);

export function jujuLook(outfit: string): JujuLook {
  const own = JUJU_LOOKS[outfit];
  if (own) return own;
  const o = Outfits[outfit as keyof typeof Outfits];
  if (!o) return JUJU_LOOKS.casual;
  const coat = COAT_OUTFITS.has(outfit);
  return {
    top: coat ? "#f7f0e3" : o.top,
    outer: coat ? o.top : undefined,
    bottom: o.bottom,
    bottomKind: JEANS_OUTFITS.has(outfit) ? "jeans" : "skirt",
    shoes: o.shoes,
  };
}

/** Juju's jewellery metal per outfit (earrings / bracelet / clip: the olw_accent slot). */
const ACCENT_BY_OUTFIT: Record<string, string> = {
  casual: "#d4a843", // warm gold
  cozy: "#e8b4c0", // rose gold
  summer: "#f5d090", // pale gold
  london_prep: "#c0bdb0", // silver
  sparkle_night: "#e8d060", // bright gold
};

export function accentForOutfit(outfit: string): string {
  return ACCENT_BY_OUTFIT[outfit] ?? "#d4a843";
}

export function jujuAppearance(outfit: string): Appearance {
  const l = jujuLook(outfit);
  return {
    skin: JUJU_SKIN,
    hair: JUJU_HAIR,
    top: l.top,
    bottom: l.bottom,
    shoes: l.shoes,
    outer: l.outer,
    bottomKind: l.bottomKind,
    accessories: true,
    face: "juju",
    accent: accentForOutfit(outfit),
  };
}

/** Hair styles for the people we know; everyone else hashes into the list. */
const HAIR_BY_ID: Record<string, HairStyle> = {
  her: "long",
  moomoo: "short",
  baba: "short",
  mama: "bun",
  fadwa: "ponytail",
  nour: "curly",
  hazel: "bob",
  rhiannon: "long",
  chloe: "ponytail",
};
const SKIRT_BY_ID: Record<string, boolean> = { moomoo: false, baba: true, her: true, mama: true };

/** Per-person silhouette + headwear for the people we know (everyone else: default build). */
export interface NpcBuild {
  /** Holder scaling (width, height, depth). */
  scale: [number, number, number];
  /** Hijab colour (hides the hair). */
  hijab?: string;
  /** Beard colour. */
  beard?: string;
  /** false: never layer a cardigan over the top (a plain shirt / thobe / dress). */
  outer?: false;
  /** Fixed clothing colours that override their CharColors (a signature outfit). */
  look?: { top?: string; outer?: string; bottom?: string; shoes?: string };
  /** Highlight streak colour painted into the front-left of their hair. */
  hairStreak?: string;
}

// Scales stay subtle (within +-8% per axis, family builds aside) so everyone
// still reads as the same storybook cast.
const NPC_BUILDS: Record<string, NpcBuild> = {
  // taller, broader shoulders; plain blue shirt
  moomoo: { scale: [1.08, 1.1, 1.05], outer: false },
  // medium height; cream modest dress under a navy outer layer, matching navy hijab
  mama: {
    scale: [1.02, 0.97, 1.02],
    hijab: "#2f3a56",
    look: { top: "#f4f1e8", outer: "#2f3a56", bottom: "#7a8a96", shoes: "#e8e0d0" },
  },
  // stocky, grey beard, white thobe
  baba: { scale: [1.14, 0.98, 1.14], beard: "#a9a6a0", outer: false },
  // (the player uses createPlayerRig; this applies only if "her" is ever spawned as an NPC)
  her: { scale: [0.98, 1.04, 0.98], hairStreak: "#5a3810" },
  // slightly shorter
  fadwa: { scale: [1.0, 0.96, 1.0] },
  // petite, with a fun gold streak in her curls
  nour: { scale: [0.97, 0.99, 0.97], hairStreak: "#d4a040" },
  // a slightly bigger build (lighter hair: no streak)
  chloe: { scale: [1.02, 1.02, 1.02] },
  // taller, auburn streak in her bob
  hazel: { scale: [1.01, 1.05, 1.0], hairStreak: "#7a3020" },
  // tall
  rhiannon: { scale: [1.03, 1.06, 1.0] },
};

export function npcBuild(id: string): NpcBuild {
  return NPC_BUILDS[id] ?? { scale: [1, 1, 1] };
}

export function isMaleNpc(id: string) {
  return MALE_IDS.has(id);
}

/** Top of an NPC's head (world units), for the name tag. */
export function npcHeight(id: string) {
  return CHAR_HEIGHT * npcBuild(id).scale[1];
}

/** Feminine head shape (slightly oval: taller, a touch shallower) and hip sway amplitude (radians). */
const FEM_HEAD: [number, number, number] = [1.0, 1.1, 0.95];
const JUJU_HIP_SWAY = (8 * Math.PI) / 180;
const NPC_HIP_SWAY = (5 * Math.PI) / 180;

export function styleFor(id: string): CharacterOpts {
  const h = strHash(id);
  return {
    hair: HAIR_BY_ID[id] ?? HAIR_STYLES[h % HAIR_STYLES.length],
    skirt: SKIRT_BY_ID[id] ?? (h >> 3) % 3 !== 0,
    scarf: id === "her" || (h >> 5) % 4 === 0,
  };
}

/** An NPC's appearance from their CharColors + per-person style. */
export function npcAppearance(c: CharColors, opts: CharacterOpts, id = ""): Appearance {
  const b = npcBuild(id);
  const layered = !!opts.scarf && b.outer !== false;
  const look = b.look ?? {};
  return {
    skin: c.skin,
    hair: c.hair,
    // layered people wear a cream tee under a cardigan in their colour
    top: look.top ?? (layered ? "#f3ebdd" : c.top),
    outer: look.outer ?? (layered ? c.top : undefined),
    bottom: look.bottom ?? c.bottom,
    shoes: look.shoes ?? c.shoes,
    bottomKind: opts.skirt === false ? "jeans" : "skirt",
    hairStyle: opts.hair ?? "long",
    hideHair: !!b.hijab,
    face: isMaleNpc(id) ? "male" : npcFaceKind(id),
  };
}

/** Face variants for the women we know (everyone else: the default "female"). */
const NPC_FACE_KINDS: Record<string, FaceKind> = {
  mama: "female_soft",
  fadwa: "female_soft",
  hazel: "female_sharp",
  rhiannon: "female_sharp",
  nour: "female_young",
  chloe: "female_young",
};

export function npcFaceKind(id: string): FaceKind {
  return NPC_FACE_KINDS[id] ?? "female";
}

// ------------------------------------------------- unnamed NPC palettes ----

/** The people we know keep their hand-picked NpcDef colours. */
const NAMED_IDS = new Set(["her", "moomoo", "mama", "baba", "fadwa", "nour", "jad", "shan", "hazel", "rhiannon", "chloe"]);

/** Hair for everyone else: the existing dark / black options plus warm browns, a cool dark, red-brown and sandy. */
const NPC_HAIR_COLORS = [
  "#2b1d16", "#33312e", "#2f2a3d", "#1c130d", // dark / near-black
  "#5a382c", "#7b4f35", "#7a5030", "#9a6840", // warm browns
  "#2a2535", // cool dark with a blue tint
  "#8a3820", // warm red-brown
  "#c8a870", // sandy light
];

/** Skin tones for everyone else: fair through deep warm. */
const NPC_SKIN_TONES = ["#f8d5b0", "#f2d3b0", "#f0c49a", "#e8b888", "#e6b58c", "#d9a679", "#c49060", "#a8714a", "#8a6040"];

/** Tops for everyone else: the cooler European shades alongside warm Gulf / Levant tones. */
const NPC_TOP_COLORS = [
  "#2f6fd0", "#5c8ce2", "#60a0d0", "#7be0a3", "#f28ab2", "#f4c95d",
  "#e8a060", "#4a8060", "#c86880", "#8060c0",
];

/** 32-bit integer finaliser (lowbias32): decorrelates nearby hash inputs. */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function darken(hex: string, f = 0.82): string {
  const [r, g, b] = hexRgb(hex).map((v) => Math.round(v * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * The colours an NPC is drawn with: the people we know keep their own; anyone
 * else (shop staff, recruiters, passers-by) hashes their id into the wider
 * hair / skin / top palettes, so background characters stop sharing a look.
 */
export function npcColors(id: string, c: CharColors): CharColors {
  if (NAMED_IDS.has(id)) return c;
  const h = strHash(id);
  // independent picks per trait, so two ids never drift into the same look together
  const hair = NPC_HAIR_COLORS[mix32(h ^ 1) % NPC_HAIR_COLORS.length];
  const skin = NPC_SKIN_TONES[mix32(h ^ 2) % NPC_SKIN_TONES.length];
  const top = NPC_TOP_COLORS[mix32(h ^ 3) % NPC_TOP_COLORS.length];
  return { ...c, hair, hairShade: darken(hair, 0.7), skin, skinShade: darken(skin), top, topShade: darken(top) };
}

// ------------------------------------------------------------- skinned rig --

const faceMats = new WeakMap<BaseTexture, StandardMaterial>();

/** The painted face decal: texture colour, alpha from the texture, no specular. */
function faceMaterial(k: KitContext, src: Material | null): Material {
  const tex = (src as unknown as { albedoTexture?: BaseTexture } | null)?.albedoTexture;
  if (!tex) return k.mats.flat("#ffffff");
  let m = faceMats.get(tex);
  if (!m) {
    m = new StandardMaterial(`olw_face:${tex.name}`, k.scene);
    tex.hasAlpha = true;
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
    m.specularColor = Color3.Black();
    m.transparencyMode = 2; // Material.MATERIAL_ALPHABLEND
    m.zOffset = -2;
    m.freeze();
    faceMats.set(tex, m);
  }
  return m;
}

interface SlotMeta {
  olwName?: string;
  olwSlot?: string;
  olwFaceSrc?: Material | null;
}

function dress(k: KitContext, ai: AnimatedInstance, a: Appearance) {
  const col: Record<string, string | undefined> = {
    olw_skin: a.skin,
    olw_hair: a.hair,
    olw_top: a.top,
    olw_outer: a.outer ?? a.top,
    olw_bottom: a.bottom,
    olw_shoes: a.shoes,
    // Juju's jewellery metal (set per outfit in jujuAppearance); NPCs keep plain white
    olw_accent: a.accent ?? "#ffffff",
  };
  for (const m of ai.meshes) {
    const meta = (m.metadata ?? (m.metadata = {})) as SlotMeta;
    if (meta.olwSlot === undefined) {
      meta.olwSlot = m.material?.name ?? "";
      if (meta.olwSlot === "olw_face") meta.olwFaceSrc = m.material;
    }
    const name = meta.olwName ?? m.name;
    let on = true;
    if (name === "jeans") on = a.bottomKind === "jeans";
    else if (name === "skirt" || name === "legs") on = a.bottomKind === "skirt";
    else if (name === "cardigan") on = !!a.outer;
    else if (name.startsWith("hair_")) on = !a.hideHair && name === `hair_${a.hairStyle ?? "long"}`;
    else if (name === "hair") on = !a.hideHair;
    else if (name === "jewelry" || name === "clip") on = !!a.accessories;
    m.setEnabled(on);
    const slot = meta.olwSlot;
    if (slot === "olw_face") {
      m.material = a.face ? proceduralFaceMaterial(k.scene, a.face) : faceMaterial(k, meta.olwFaceSrc ?? null);
      m.alphaIndex = DECAL_ALPHA_INDEX; // before a faded building's depth twin
    }
    else if (col[slot]) m.material = k.mats.flat(col[slot]!);
  }
}

type Clip = "idle" | "walk" | "run" | "wave" | "nod";
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Blends the GLB's clips: idle <-> walk <-> run by ground speed, gestures on top. */
class ClipMixer {
  private w = new Map<Clip, number>();
  private gestureKind: "wave" | "nod" | null = null;
  private gestureT = 0;
  private gestureLen = 0;

  constructor(private anims: Map<string, AnimationGroup>) {
    for (const g of anims.values()) g.stop();
    const idle = this.g("idle");
    if (idle) {
      idle.start(true, 1);
      idle.weight = 1;
      idle.goToFrame(idle.from + Math.random() * (idle.to - idle.from));
      this.w.set("idle", 1);
    }
  }

  private g(c: Clip) {
    return this.anims.get(c) ?? null;
  }

  gesture(kind: "wave" | "nod") {
    const g = this.g(kind);
    if (!g) return;
    if (this.gestureKind && this.gestureKind !== kind) this.set(this.gestureKind, 0);
    this.gestureKind = kind;
    this.gestureLen = (g.to - g.from) / 24;
    this.gestureT = this.gestureLen;
    g.stop();
    g.start(false, 1);
    g.weight = this.w.get(kind) ?? 0;
  }

  private set(c: Clip, target: number, rate = 1, k = 1) {
    const g = this.g(c);
    if (!g) return;
    const cur = this.w.get(c) ?? 0;
    const nw = cur + (target - cur) * k;
    const w = nw < 0.002 && target === 0 ? 0 : nw;
    this.w.set(c, w);
    if (w > 0) {
      if (!g.isPlaying) g.start(c !== "wave" && c !== "nod", rate);
      g.weight = w;
      g.speedRatio = rate;
    } else if (g.isPlaying && c !== this.gestureKind) {
      g.stop();
    }
  }

  update(dt: number, v: number) {
    const k = Math.min(1, dt * 10);
    const loco = smooth(0.06, 0.4, v);
    const runT = smooth(0.95, 1.7, v);
    let gw = 0;
    if (this.gestureKind) {
      this.gestureT -= dt;
      const t = this.gestureLen - this.gestureT;
      gw = Math.max(0, Math.min(1, t / 0.18, this.gestureT / 0.25));
      // a gesture while running only borrows the upper body a little
      gw *= 1 - 0.6 * loco;
      if (this.gestureT <= 0) {
        this.set(this.gestureKind, 0, 1, 1);
        this.g(this.gestureKind)?.stop();
        this.gestureKind = null;
        gw = 0;
      } else {
        this.set(this.gestureKind, gw, 1, 1);
      }
    }
    const rest = 1 - gw;
    this.set("idle", (1 - loco) * rest, 1, k);
    this.set("walk", loco * (1 - runT) * rest, Math.min(3, Math.max(0.4, v / WALK_SPEED)), k);
    this.set("run", loco * runT * rest, Math.min(4, Math.max(0.5, v / RUN_SPEED)), k);
  }
}

// ------------------------------------------------------ skinned rig extras --

/** Per-rig additions on top of the GLB: head shape, hip sway, headwear, a hair streak. */
export interface RigExtras {
  /** Head bone scaling (x lateral, y up, z depth). */
  headScale?: [number, number, number];
  /** Pelvic tilt amplitude (radians) synced to the walk cycle; a faint weight shift at idle. */
  hipSway?: number;
  hijab?: string;
  beard?: string;
  /**
   * Recolour one side of the hair towards this colour: Juju's "hair" mesh, or
   * an NPC's hair variant (hair_long / bob / ...). `mesh` limits it to one
   * hair mesh by name (the variant the NPC wears); omitted = every hair mesh.
   */
  hairStreak?: { base: string; streak: string; mesh?: string };
}

const streaked = new WeakSet<Geometry>();

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A highlight streak down the front-left curtain of the hair: the hair's
 * vertex colours are shading multipliers under a flat material, so vertices
 * in the streak band get multiplied by streak / base (GLB bind-pose model
 * space: x lateral, y up, z forward). Geometry already streaked (a second
 * Juju instance) is left alone; geometry shared with other meshes (every NPC
 * instance of npc-base.glb) is made unique first so the streak stays on this
 * person.
 */
function paintHairStreak(mesh: Mesh, base: string, streak: string) {
  if (!mesh.geometry || streaked.has(mesh.geometry)) return;
  if (mesh.geometry.meshes.length > 1) mesh.makeGeometryUnique();
  const geo = mesh.geometry;
  if (!geo) return;
  streaked.add(geo);
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
  const col = mesh.getVerticesData(VertexBuffer.ColorKind);
  if (!pos || !col) return;
  const n = pos.length / 3;
  const stride = Math.round(col.length / n);
  if (stride < 3) return;
  const b = hexRgb(base);
  const h = hexRgb(streak);
  const ratio = [0, 1, 2].map((c) => h[c] / Math.max(1, b[c]));
  const out = Float32Array.from(col);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3];
    const z = pos[i * 3 + 2];
    const bx = 1 - ((x - 0.1) / 0.032) ** 2;
    if (bx <= 0) continue;
    const front = Math.min(1, Math.max(0, (z + 0.01) / 0.05));
    const w = bx * front * 0.9;
    for (let c = 0; c < 3; c++) out[i * stride + c] = col[i * stride + c] * (1 + (ratio[c] - 1) * w);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, out, false, stride);
}

/** Bone-local head centre (Y up, Z forward) in every character GLB. */
const HEAD_C = { y: 0.145, z: -0.004 };

function addHeadwear(k: KitContext, ai: AnimatedInstance, head: TransformNode, chest: TransformNode | undefined, x: RigExtras): Mesh[] {
  const out: Mesh[] = [];
  const name = ai.root.name;
  if (x.hijab) {
    const mat = k.mats.flat(x.hijab);
    // a hood around the head, open towards the face (sphere slice turned to face +Z, tilted a little down)
    const hood = CreateSphere(`${name}:hijab`, { diameter: 2, segments: 16, slice: 0.76, sideOrientation: Mesh.DOUBLESIDE }, k.scene);
    hood.parent = head;
    hood.position.set(0, HEAD_C.y + 0.004, HEAD_C.z - 0.01);
    hood.rotation.x = -Math.PI / 2 + 0.2;
    hood.scaling.set(0.152, 0.152, 0.16);
    hood.material = mat;
    out.push(hood);
    // the wrap over the neck and shoulders
    if (chest) {
      const drape = CreateCylinder(`${name}:hijabDrape`, { height: 0.11, diameterTop: 0.19, diameterBottom: 0.3, tessellation: 18 }, k.scene);
      drape.parent = chest;
      drape.position.set(0, 0.105, -0.008);
      drape.scaling.z = 0.86;
      drape.material = mat;
      out.push(drape);
    }
  }
  if (x.beard) {
    const mat = k.mats.flat(x.beard);
    const beard = CreateBox(`${name}:beard`, { width: 0.12, height: 0.066, depth: 0.06 }, k.scene);
    beard.parent = head;
    beard.position.set(0, HEAD_C.y - 0.114, HEAD_C.z + 0.078);
    beard.material = mat;
    const moustache = CreateBox(`${name}:moustache`, { width: 0.052, height: 0.011, depth: 0.018 }, k.scene);
    moustache.parent = head;
    moustache.position.set(0, HEAD_C.y - 0.057, HEAD_C.z + 0.112);
    moustache.material = mat;
    out.push(beard, moustache);
  }
  for (const m of out) {
    m.isPickable = false;
    k.lighting?.addCaster(m);
  }
  return out;
}

/**
 * Applies the extras. Head scale and hip sway run after the clips each frame
 * (the clips key every bone, so the offsets never accumulate): the hips roll
 * about their forward axis and the spine + thighs are counter-rotated in the
 * hips' frame, so only the pelvis tilts (one hip up, the other down) while the
 * torso stays upright and the feet stay planted.
 */
function applyExtras(k: KitContext, ai: AnimatedInstance, x: RigExtras): { meshes: Mesh[]; dispose(): void } {
  const nodes = new Map<string, TransformNode>();
  for (const n of ai.root.getDescendants(false)) {
    if (!(n instanceof TransformNode) || n instanceof Mesh) continue;
    const nm = (n.metadata as SlotMeta | null)?.olwName;
    if (nm) nodes.set(nm, n);
  }
  const head = nodes.get("head");
  if (x.hairStreak) {
    const { base, streak, mesh } = x.hairStreak;
    for (const m of ai.meshes) {
      const nm = (m.metadata as SlotMeta | null)?.olwName ?? m.name;
      const isHair = nm === "hair" || nm.startsWith("hair_");
      if (isHair && (!mesh || nm === mesh)) paintHairStreak(m, base, streak);
    }
  }
  const meshes = head ? addHeadwear(k, ai, head, nodes.get("chest"), x) : [];

  const hips = nodes.get("hips");
  const counter = ["spine", "thigh.L", "thigh.R"].map((n) => nodes.get(n)).filter((n): n is TransformNode => !!n);
  const walk = ai.animations.get("walk");
  const idle = ai.animations.get("idle");
  const sway = x.hipSway ?? 0;
  const R = new Quaternion();
  const Ri = new Quaternion();
  let t = Math.random() * 10;
  const obs = x.headScale || sway ? k.scene.onAfterAnimationsObservable.add(() => {
    if (head && x.headScale) head.scaling.set(x.headScale[0], x.headScale[1], x.headScale[2]);
    if (!sway || !hips?.rotationQuaternion) return;
    t += Math.min(0.1, k.scene.getEngine().getDeltaTime() / 1000);
    let s = 0;
    if (walk?.isPlaying && walk.weight > 0) {
      const span = walk.to - walk.from;
      const ph = span > 0 ? (walk.getCurrentFrame() - walk.from) / span : 0;
      // left foot is the stance foot for the first half of the loop: lift that hip
      s += walk.weight * Math.sin(2 * Math.PI * ph);
    }
    if (idle?.isPlaying && idle.weight > 0) s += idle.weight * 0.18 * Math.sin(t * 0.8);
    if (Math.abs(s) < 1e-4) return;
    Quaternion.RotationAxisToRef(Axis.Z, sway * s, R);
    R.conjugateToRef(Ri);
    hips.rotationQuaternion.multiplyToRef(R, hips.rotationQuaternion);
    for (const c of counter) if (c.rotationQuaternion) Ri.multiplyToRef(c.rotationQuaternion, c.rotationQuaternion);
  }) : null;
  return {
    meshes,
    dispose() {
      if (obs) k.scene.onAfterAnimationsObservable.remove(obs);
      for (const m of meshes) k.lighting?.removeCaster(m);
    },
  };
}

/** A skinned rig (GLB instance) inside `holder`. */
function skinnedRig(k: KitContext, ai: AnimatedInstance, holder: TransformNode, look: Appearance, extras: RigExtras = {}) {
  ai.root.parent = holder;
  dress(k, ai, look);
  for (const m of ai.meshes) k.lighting?.addCaster(m);
  const ex = applyExtras(k, ai, extras);
  const mixer = new ClipMixer(ai.animations);
  return {
    meshes: [...ai.meshes, ...ex.meshes],
    animate(dt: number, moving: number, speed?: number) {
      const v = speed ?? moving * RUN_SPEED;
      mixer.update(Math.min(dt, 0.1), v);
    },
    dress(a: Appearance) {
      dress(k, ai, a);
    },
    gesture(kind: "wave" | "nod") {
      mixer.gesture(kind);
    },
    dispose() {
      ex.dispose();
      ai.dispose();
    },
  };
}

// --------------------------------------------------------- procedural rig --

/** Drive a built/cloned procedural hierarchy (the fallback). */
function proceduralRig(k: KitContext, b: CharacterBuild, colors: CharColors, onDispose: () => void, feminine = false) {
  // Juju: a subtler bob and a little more side-to-side sway
  const bob = feminine ? 0.02 : 0.055;
  const roll = feminine ? 0.06 : 0.035;
  const { root, body, head, armL, armR, legL, legR, meshes } = b;
  retintCharacter(root, toHeroColors(colors));
  for (const m of meshes) {
    m.isPickable = false;
    k.lighting?.addCaster(m);
  }
  let t = Math.random() * 10;
  let gestureT = 0;
  let gestureKind: "wave" | "nod" = "wave";
  const r = {
    root,
    meshes,
    animate(dt: number, moving: number) {
      dt = Math.min(dt, 0.05); // slow frames must not skip the gesture / swing
      t += dt * (1 + moving * 7.5);
      const idle = 1 - moving;
      const swing = Math.sin(t) * 0.8 * moving;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legL.rotation.x = -swing * 0.95;
      legR.rotation.x = swing * 0.95;
      armL.rotation.z = 0.14 + Math.sin(t * 0.55) * 0.035 * idle;
      armR.rotation.z = -0.14 - Math.sin(t * 0.55 + 1) * 0.035 * idle;
      const breathe = Math.sin(t * 1.4);
      body.position.y = Math.abs(Math.sin(t)) * bob * moving + breathe * 0.008 * idle;
      body.scaling.y = 1 + breathe * 0.012 * idle;
      body.rotation.x = 0.09 * moving;
      body.rotation.z = Math.sin(t) * roll * moving;
      head.rotation.z = Math.sin(t * 0.7) * 0.05 * idle - Math.sin(t) * 0.02 * moving;
      head.rotation.x = Math.sin(t * 1.1 + 0.5) * 0.03 * idle;
      if (gestureT > 0) {
        gestureT -= dt;
        const k2 = Math.min(1, gestureT / 0.25, (1.1 - gestureT) * 4);
        if (gestureKind === "wave") {
          armR.rotation.x = -2.5 * k2 + (1 - k2) * armR.rotation.x;
          armR.rotation.z = -0.5 * k2 - Math.sin(gestureT * 22) * 0.45 * k2;
        } else {
          head.rotation.x = Math.sin(gestureT * 14) * 0.12 * k2;
        }
      }
    },
    setColors(c: CharColors) {
      retintCharacter(root, toHeroColors(c));
    },
    gesture(kind: "wave" | "nod" = "wave") {
      gestureKind = kind;
      gestureT = 1.1;
    },
    dispose() {
      onDispose();
    },
  };
  r.animate(0, 0);
  return r;
}

type Impl = {
  meshes: Mesh[];
  animate(dt: number, moving: number, speed?: number): void;
  gesture(kind: "wave" | "nod"): void;
  dispose(): void;
};

/**
 * A CharacterRig whose body is the skinned GLB when loaded, else the
 * procedural fallback (upgraded in place once the GLB arrives).
 */
function hybridRig(
  k: KitContext,
  am: AssetManager,
  key: string,
  name: string,
  appearance: () => Appearance,
  fallback: () => { impl: Impl & { setColors(c: CharColors): void }; node: TransformNode },
  extras: RigExtras = {},
): CharacterRig {
  const holder = new TransformNode(name, k.scene);
  let impl: Impl | null = null;
  let proc: (Impl & { setColors(c: CharColors): void }) | null = null;
  let skin: ReturnType<typeof skinnedRig> | null = null;
  let disposed = false;
  let lastColors: CharColors | null = null;

  const useSkinned = () => {
    const ai = am.instantiateAnimated(key, `${name}:glb`);
    if (!ai) return false;
    proc?.dispose();
    proc = null;
    skin = skinnedRig(k, ai, holder, appearance(), extras);
    impl = skin;
    rig.meshes.length = 0;
    rig.meshes.push(...skin.meshes);
    return true;
  };

  const rig: CharacterRig = {
    root: holder,
    meshes: [],
    get skinned() {
      return !!skin;
    },
    animate(dt, moving, speed) {
      impl?.animate(dt, moving, speed);
    },
    setColors(c) {
      lastColors = c;
      if (skin) skin.dress(appearance());
      else proc?.setColors(c);
    },
    setOutfit() {
      if (skin) skin.dress(appearance());
      else if (lastColors) proc?.setColors(lastColors);
    },
    gesture(kind = "wave") {
      impl?.gesture(kind);
    },
    dispose() {
      disposed = true;
      impl?.dispose();
      impl = null;
      holder.dispose(false, false);
    },
  };

  if (!useSkinned()) {
    const fb = fallback();
    fb.node.parent = holder;
    fb.node.scaling.setAll(PROC_SCALE);
    proc = fb.impl;
    impl = proc;
    rig.meshes.push(...proc.meshes);
    void am.whenAnimated(key).then((ok) => {
      if (ok && !disposed && !skin) useSkinned();
    });
  }
  return rig;
}

// ------------------------------------------------------------ public API ----

/** Procedural character without the asset manager (no GLB). */
export function createCharacter(k: KitContext, colors: CharColors, name = "char", opts: CharacterOpts = {}): CharacterRig {
  const holder = new TransformNode(name, k.scene);
  const b = buildCharacter(heroCtx(k.scene), { name, hair: "long", skirt: true, ...opts });
  for (const m of b.meshes) remapSlots(k, m);
  b.root.parent = holder;
  b.root.scaling.setAll(PROC_SCALE);
  const p = proceduralRig(k, b, colors, () => b.root.dispose(false, true));
  return {
    root: holder,
    meshes: p.meshes,
    skinned: false,
    animate: (dt, moving) => p.animate(dt, moving),
    setColors: (c) => p.setColors(c),
    gesture: (kind = "wave") => p.gesture(kind),
    dispose() {
      p.dispose();
      holder.dispose(false, false);
    },
  };
}

/** An NPC: npc-base.glb retinted to their CharColors (procedural until it loads). */
export function createNpcRig(k: KitContext, am: AssetManager, id: string, colors: CharColors, name = `npc:${id}`): CharacterRig {
  const opts = styleFor(id);
  colors = npcColors(id, colors);
  let cur = colors;
  const male = MALE_IDS.has(id);
  const build = npcBuild(id);
  const extras: RigExtras = {
    headScale: male ? undefined : FEM_HEAD,
    hipSway: male ? undefined : NPC_HIP_SWAY,
    hijab: build.hijab,
    beard: build.beard,
    hairStreak: build.hairStreak && !build.hijab ? { base: colors.hair, streak: build.hairStreak, mesh: `hair_${opts.hair ?? "long"}` } : undefined,
  };
  const rig = hybridRig(
    k,
    am,
    male && am.hasAnimated(NPC_MALE_KEY) ? NPC_MALE_KEY : NPC_BASE_KEY,
    name,
    () => npcAppearance(cur, opts, id),
    () => {
      const b = buildCharacter(heroCtx(k.scene), { name, hair: "long", skirt: true, ...opts });
      for (const m of b.meshes) remapSlots(k, m);
      return { impl: proceduralRig(k, b, colors, () => b.root.dispose(false, true)), node: b.root };
    },
    extras,
  );
  const set = rig.setColors.bind(rig);
  rig.setColors = (c) => {
    cur = npcColors(id, c);
    set(cur);
  };
  return rig;
}

/** The player (Juju): juju.glb (oval head, hip sway, hair streak, painted face), else the hero GLB / procedural rig. */
export function createPlayerRig(k: KitContext, am: AssetManager, colors: CharColors, name = "player", outfit: () => string = () => "casual"): CharacterRig {
  const extras: RigExtras = { headScale: FEM_HEAD, hipSway: JUJU_HIP_SWAY, hairStreak: { base: JUJU_HAIR, streak: JUJU_HAIR_STREAK } };
  return hybridRig(
    k,
    am,
    JUJU_KEY,
    name,
    () => jujuAppearance(outfit()),
    () => {
      const hi: HierarchyInstance = am.instantiateHierarchy("player", `${name}:fallback`);
      const b = rigFromRoot(hi.root);
      if (b) return { impl: proceduralRig(k, b, colors, () => hi.dispose(), true), node: hi.root };
      hi.dispose();
      const b2 = buildCharacter(heroCtx(k.scene), { name, ...styleFor("her") });
      for (const m of b2.meshes) remapSlots(k, m);
      return { impl: proceduralRig(k, b2, colors, () => b2.root.dispose(false, true), true), node: b2.root };
    },
    extras,
  );
}

let registeredAssets: AssetManager | null = null;

/** The asset manager the characters were registered with (NPC views use it for npc-base.glb). */
export function characterAssets(): AssetManager | null {
  return registeredAssets;
}

/** Register the characters: the skinned GLBs (Game3D preloads CHARACTER_KEYS) + the player hero fallback. */
export function registerCharacters(am: AssetManager) {
  registeredAssets = am;
  am.registerHero("player", (k: KitContext) => {
    const b = buildCharacter(heroCtx(k.scene), { name: "player", ...styleFor("her") });
    for (const m of b.meshes) remapSlots(k, m);
    return b.root;
  });
  am.registerAnimated(JUJU_KEY, glb("juju"));
  am.registerAnimated(NPC_BASE_KEY, glb("npc-base"));
  am.registerAnimated(NPC_MALE_KEY, glb("npc-male"));
}

/** The skinned character GLBs Game3D waits for (behind the title) before the world appears. */
export const CHARACTER_KEYS = [JUJU_KEY, NPC_BASE_KEY, NPC_MALE_KEY];
