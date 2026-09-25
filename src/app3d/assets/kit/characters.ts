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

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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
}

/** Juju's own look: warm tan skin, very long dark-brown hair (vertex colours add darker roots / chestnut ends). */
export const JUJU_SKIN = "#d9a27c";
export const JUJU_HAIR = "#523428";

export interface JujuLook {
  top: string;
  bottom: string;
  bottomKind: "skirt" | "jeans";
  outer?: string;
  shoes: string;
}

/**
 * Outfit id (store.state.outfit) -> Juju's clothes. "casual" (the default) is
 * her signature look: cream ruffle top, pale denim maxi skirt, white sneakers.
 * "cozy" is the storybook-reference look: dusty-pink cardigan over the cream
 * top with jeans. Other outfits derive from the shared Outfits palette.
 */
export const JUJU_LOOKS: Record<string, JujuLook> = {
  casual: { top: "#f7f0e3", bottom: "#a7c2de", bottomKind: "skirt", shoes: "#fbfaf7" },
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

export function jujuAppearance(outfit: string): Appearance {
  const l = jujuLook(outfit);
  return { skin: JUJU_SKIN, hair: JUJU_HAIR, top: l.top, bottom: l.bottom, shoes: l.shoes, outer: l.outer, bottomKind: l.bottomKind, accessories: true };
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
const SKIRT_BY_ID: Record<string, boolean> = { moomoo: false, baba: false, her: true, mama: true };

export function styleFor(id: string): CharacterOpts {
  const h = strHash(id);
  return {
    hair: HAIR_BY_ID[id] ?? HAIR_STYLES[h % HAIR_STYLES.length],
    skirt: SKIRT_BY_ID[id] ?? (h >> 3) % 3 !== 0,
    scarf: id === "her" || (h >> 5) % 4 === 0,
  };
}

/** An NPC's appearance from their CharColors + per-person style. */
export function npcAppearance(c: CharColors, opts: CharacterOpts): Appearance {
  const layered = !!opts.scarf;
  return {
    skin: c.skin,
    hair: c.hair,
    // layered people wear a cream tee under a cardigan in their colour
    top: layered ? "#f3ebdd" : c.top,
    outer: layered ? c.top : undefined,
    bottom: c.bottom,
    shoes: c.shoes,
    bottomKind: opts.skirt === false ? "jeans" : "skirt",
    hairStyle: opts.hair ?? "long",
  };
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
    olw_accent: "#ffffff",
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
    else if (name.startsWith("hair_")) on = name === `hair_${a.hairStyle ?? "long"}`;
    else if (name === "jewelry" || name === "clip") on = !!a.accessories;
    m.setEnabled(on);
    const slot = meta.olwSlot;
    if (slot === "olw_face") {
      m.material = faceMaterial(k, meta.olwFaceSrc ?? null);
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

/** A skinned rig (GLB instance) inside `holder`. */
function skinnedRig(k: KitContext, ai: AnimatedInstance, holder: TransformNode, look: Appearance) {
  ai.root.parent = holder;
  dress(k, ai, look);
  for (const m of ai.meshes) k.lighting?.addCaster(m);
  const mixer = new ClipMixer(ai.animations);
  return {
    meshes: ai.meshes,
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
      ai.dispose();
    },
  };
}

// --------------------------------------------------------- procedural rig --

/** Drive a built/cloned procedural hierarchy (the fallback). */
function proceduralRig(k: KitContext, b: CharacterBuild, colors: CharColors, onDispose: () => void) {
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
      body.position.y = Math.abs(Math.sin(t)) * 0.055 * moving + breathe * 0.008 * idle;
      body.scaling.y = 1 + breathe * 0.012 * idle;
      body.rotation.x = 0.09 * moving;
      body.rotation.z = Math.sin(t) * 0.035 * moving;
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
    skin = skinnedRig(k, ai, holder, appearance());
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
  let cur = colors;
  const rig = hybridRig(k, am, MALE_IDS.has(id) && am.hasAnimated(NPC_MALE_KEY) ? NPC_MALE_KEY : NPC_BASE_KEY, name, () => npcAppearance(cur, opts), () => {
    const b = buildCharacter(heroCtx(k.scene), { name, hair: "long", skirt: true, ...opts });
    for (const m of b.meshes) remapSlots(k, m);
    return { impl: proceduralRig(k, b, colors, () => b.root.dispose(false, true)), node: b.root };
  });
  const set = rig.setColors.bind(rig);
  rig.setColors = (c) => {
    cur = c;
    set(c);
  };
  return rig;
}

/** The player (Juju): juju.glb, else the hero GLB / procedural rig. */
export function createPlayerRig(k: KitContext, am: AssetManager, colors: CharColors, name = "player", outfit: () => string = () => "casual"): CharacterRig {
  return hybridRig(k, am, JUJU_KEY, name, () => jujuAppearance(outfit()), () => {
    const hi: HierarchyInstance = am.instantiateHierarchy("player", `${name}:fallback`);
    const b = rigFromRoot(hi.root);
    if (b) return { impl: proceduralRig(k, b, colors, () => hi.dispose()), node: hi.root };
    hi.dispose();
    const b2 = buildCharacter(heroCtx(k.scene), { name, ...styleFor("her") });
    for (const m of b2.meshes) remapSlots(k, m);
    return { impl: proceduralRig(k, b2, colors, () => b2.root.dispose(false, true)), node: b2.root };
  });
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
