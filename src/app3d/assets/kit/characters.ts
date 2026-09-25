// Storybook characters for the browser: builds (or adopts a GLB clone of)
// the hero character rig from assets/hero/character.ts, swaps its slot
// materials for the runtime ones, applies the game's CharColors and drives
// the pivots procedurally (idle breathing, walk swing, a little wave). No
// skeleton: pivots are TransformNodes named head / armL / armR / legL / legR.

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { CharColors } from "../../../game/palette";
import { type AssetManager, type HierarchyInstance, type KitContext, remapSlots } from "../AssetManager";
import { heroCtx } from "../hero/slots";
import { buildCharacter, rigFromRoot, type CharacterBuild, type CharacterColors, type CharacterOpts, type HairStyle, HAIR_STYLES, retintCharacter, CHAR_HEIGHT as HERO_HEIGHT, HEAD_Y as HERO_HEAD_Y } from "../hero/character";
import { strHash } from "./util";

export interface CharacterRig {
  root: TransformNode;
  meshes: Mesh[];
  /** Advance the animation. `moving` 0..1 blends idle bob -> walk swing. */
  animate(dt: number, moving: number): void;
  setColors(c: CharColors): void;
  /** Play a short gesture (e.g. a wave when interacting). */
  gesture(kind?: "wave" | "nod"): void;
  dispose(): void;
}

export const CHAR_HEIGHT = HERO_HEIGHT;
export const HEAD_Y = HERO_HEAD_Y;

export function toHeroColors(c: CharColors): CharacterColors {
  return { skin: c.skin, hair: c.hair, top: c.top, bottom: c.bottom, shoes: c.shoes };
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

/** Wrap a built/cloned hierarchy into an animated rig. */
function makeRig(k: KitContext, b: CharacterBuild, colors: CharColors, onDispose: () => void): CharacterRig {
  const { root, body, head, armL, armR, legL, legR, meshes } = b;
  retintCharacter(root, toHeroColors(colors));
  for (const m of meshes) {
    m.isPickable = false;
    k.lighting?.addCaster(m);
  }
  let t = Math.random() * 10;
  let gestureT = 0;
  let gestureKind: "wave" | "nod" = "wave";
  const rig: CharacterRig = {
    root,
    meshes,
    animate(dt, moving) {
      dt = Math.min(dt, 0.05); // slow frames must not skip the gesture / swing
      t += dt * (1 + moving * 7.5);
      const idle = 1 - moving;
      const swing = Math.sin(t) * 0.8 * moving;
      // walk: arms/legs swing, a bounce, a lean into the step
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      legL.rotation.x = -swing * 0.95;
      legR.rotation.x = swing * 0.95;
      // idle: relaxed arms with a slow sway, breathing, a soft head tilt
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
    setColors(c) {
      colors = c;
      retintCharacter(root, toHeroColors(c));
    },
    gesture(kind = "wave") {
      gestureKind = kind;
      gestureT = 1.1;
    },
    dispose() {
      onDispose();
    },
  };
  rig.animate(0, 0);
  return rig;
}

/** Procedural character (NPCs): built in the browser, no GLB needed. */
export function createCharacter(k: KitContext, colors: CharColors, name = "char", opts: CharacterOpts = {}): CharacterRig {
  const b = buildCharacter(heroCtx(k.scene), { name, hair: "long", skirt: true, ...opts });
  for (const m of b.meshes) remapSlots(k, m);
  return makeRig(k, b, colors, () => b.root.dispose(false, true));
}

/** The player rig from a preloaded GLB (or the same builder as fallback) via AssetManager. */
export function createPlayerRig(k: KitContext, am: AssetManager, colors: CharColors, name = "player"): CharacterRig {
  const hi: HierarchyInstance = am.instantiateHierarchy("player", name);
  const b = rigFromRoot(hi.root);
  if (!b) {
    hi.dispose();
    return createCharacter(k, colors, name, styleFor("her"));
  }
  return makeRig(k, b, colors, () => hi.dispose());
}

/** Register the player hero (GLB + procedural fallback) with the asset manager. */
export function registerCharacters(am: AssetManager) {
  am.registerHero("player", (k: KitContext) => {
    const b = buildCharacter(heroCtx(k.scene), { name: "player", ...styleFor("her") });
    for (const m of b.meshes) remapSlots(k, m);
    return b.root;
  });
}
