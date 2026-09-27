// Shared, cached flat-shaded materials with a hand-painted feel: small
// procedural DynamicTextures (<=256px) for stone, roof tiles, cobbles, grass
// and wood; StandardMaterial with black specular so nothing looks plastic.

//
// Key surfaces (buildings, ground, characters, street furniture) use a
// *stylized* PBRMaterial instead (see `stylizedPBR` / `Materials.pbrFlat`):
// roughness / metalness per surface type, but the same gamma-authored colours
// and the same diffuse light response as the StandardMaterials around them.

import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Constants } from "@babylonjs/core/Engines/constants";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { WorldArtProfile } from "../world/artProfile";

export const PALETTE = {
  cream: "#f0e2c6",
  creamLight: "#f8efdb",
  greyStone: "#b8b0a2",
  greyStoneDark: "#8f877a",
  terracotta: "#c8643c",
  burntOrange: "#d9824a",
  slate: "#6f7480",
  sage: "#8fa87c",
  moss: "#6b8a4e",
  grass: "#93a86e",
  grassLight: "#a4b47c",
  olive: "#7f8b56",
  mossDark: "#55703f",
  stoneWarm: "#c9b89a",
  slateBlue: "#66707c",
  terracottaMuted: "#b8694a",
  carTeal: "#5f8f8a",
  awning: "#b34d47",
  heather: "#9b7fb0",
  wood: "#8a5a3a",
  woodLight: "#a8764f",
  dustyRose: "#d49a9a",
  lavender: "#b59bd1",
  mutedYellow: "#e6c96a",
  sky: "#a8cbe8",
  lamp: "#ffd98a",
  iron: "#2d2b2e",
  cobble: "#c4b39a",
  cobbleDark: "#8c8072",
  paving: "#dcc7a0",
  pavement: "#dccfb8",
  water: "#7fb5d6",
  glass: "#cfe3ee",
  postRed: "#c03a3a",
  brick: "#b06a52",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * Hue-neutral light grey the Blender "detail" textures are painted with: the
 * *_abs slots multiply it by COLOR_0 (absolute colour ÷ 0.91, see
 * tools/blender/lib/olw.py DETAIL_HEX / DETAIL_TINT).
 */
export const DETAIL_HEX = "#e8e8e8";

let seed = 1234;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgb(r: number, g: number, b: number) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Mix a hex colour toward black (t<0) or white (t>0) and add hue-neutral jitter. */
function vary(hex: string, t: number, jitter = 0) {
  const c = hexToRgb(hex);
  const j = (rnd() - 0.5) * 2 * jitter * 255;
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  return rgb(c.r + (to - c.r) * k + j, c.g + (to - c.g) * k + j, c.b + (to - c.b) * k + j);
}

export type TexStyle = "noise" | "stone" | "cobble" | "roof" | "slate" | "planks" | "grass" | "awning" | "paving" | "bark" | "canvas";

/**
 * Runtime material slots (see assets/hero/slots.ts). `Materials.slot(name)`
 * returns the shared material for a slot so AssetManager's remap table can be
 * a one-liner. Textured slots use the hand-painted textures; flat slots are
 * white so vertex colours carry the hue.
 */
export const SLOT_STYLE: Record<string, { style: TexStyle | "flat"; hex: string; scale?: number; emissive?: number }> = {
  olw_stone: { style: "stone", hex: PALETTE.stoneWarm, scale: 1.2 },
  olw_stone_dark: { style: "stone", hex: PALETTE.greyStoneDark, scale: 1.2 },
  olw_roof_tile: { style: "roof", hex: PALETTE.terracottaMuted, scale: 1 },
  olw_slate: { style: "slate", hex: PALETTE.slate, scale: 1 },
  olw_wood: { style: "planks", hex: PALETTE.woodLight, scale: 1.5 },
  olw_wood_dark: { style: "planks", hex: "#6e4a33", scale: 1.5 },
  olw_bark: { style: "bark", hex: "#8a6a4e", scale: 1.5 },
  olw_awning: { style: "canvas", hex: "#ffffff", scale: 2 },
  olw_glass: { style: "flat", hex: PALETTE.glass },
  olw_glass_emissive: { style: "flat", hex: PALETTE.lamp, emissive: 0.2 },
  olw_light_emissive: { style: "flat", hex: PALETTE.lamp, emissive: 0.85 },
  olw_rubber: { style: "flat", hex: "#34322f" },
  olw_flower: { style: "flat", hex: "#ffffff" },
};

// ---------------------------------------------------------------------------
// Regional palette. `applyRegionPalette(profile)` swaps the wall / roof slot
// colours (SLOT_STYLE, used by the hero GLB slot remap) and publishes the
// active ground / road colours (ACTIVE_REGION). The Scotland profile maps
// onto exactly the defaults below, so Edinburgh is unchanged.

/** Wall slot colours per wall material (olw_stone / olw_stone_dark). */
const WALL_HEX: Record<WorldArtProfile["wallMaterial"], { stone: string; dark: string }> = {
  stone: { stone: PALETTE.stoneWarm, dark: PALETTE.greyStoneDark },
  render_white: { stone: "#f1efe9", dark: "#cfcac0" },
  render_cream: { stone: "#eadcc0", dark: "#c9b894" },
  brick_london: { stone: "#a8664e", dark: "#7c4a3a" },
  limestone: { stone: "#e3d6b8", dark: "#bfae8a" },
  marble: { stone: "#eeeae4", dark: "#c8c2b8" },
};

/** Roof slot colours per roof style (olw_roof_tile / olw_slate). */
const ROOF_HEX: Record<WorldArtProfile["roofStyle"], { tile: string; slate: string }> = {
  slate: { tile: PALETTE.terracottaMuted, slate: PALETTE.slate },
  terracotta: { tile: PALETTE.terracotta, slate: PALETTE.terracottaMuted },
  flat_parapet: { tile: "#d8ccb6", slate: "#bcb3a4" },
  lead_flat: { tile: "#8a8f94", slate: "#6f7479" },
  glass: { tile: "#9fb8c6", slate: "#7f98a8" },
};

// ---------------------------------------------------------------------------
// Stylized PBR.

/** Roughness / metalness of one surface type. */
export interface Surface {
  roughness: number;
  metallic?: number;
}

/**
 * Surface types. Colours stay with the callers (palette / vertex tint); this
 * table only says how light a surface is and how much it glints.
 */
const SURFACE_TABLE = {
  // buildings
  glass: { roughness: 0.05, metallic: 0.1 },
  stucco: { roughness: 0.88 },
  brick: { roughness: 0.92 },
  stone: { roughness: 0.95 },
  marble: { roughness: 0.4 },
  flatRoof: { roughness: 0.78 },
  terracotta: { roughness: 0.9 },
  slate: { roughness: 0.8 },
  leadRoof: { roughness: 0.6, metallic: 0.15 },
  paint: { roughness: 0.85 },
  // roads & ground
  asphalt: { roughness: 0.97 },
  setts: { roughness: 0.9 },
  pavement: { roughness: 0.9 },
  plaza: { roughness: 0.22, metallic: 0.05 },
  sand: { roughness: 0.98 },
  grass: { roughness: 0.96 },
  // street furniture
  metal: { roughness: 0.5, metallic: 0.7 },
  steel: { roughness: 0.45, metallic: 0.8 },
  wood: { roughness: 0.85 },
  rubber: { roughness: 0.9 },
  // characters
  skin: { roughness: 0.72 },
  fabric: { roughness: 0.88 },
  hair: { roughness: 0.68 },
  leather: { roughness: 0.6 },
  jewellery: { roughness: 0.35, metallic: 0.3 },
} satisfies Record<string, Surface>;

export type SurfaceKind = keyof typeof SURFACE_TABLE;
export const SURFACES: Readonly<Record<SurfaceKind, Surface>> = SURFACE_TABLE;

/**
 * Makes a PBRMaterial read gamma-authored inputs the way StandardMaterial
 * does, so PBR and Standard meshes sit side by side without a seam:
 *  - vertex / instance colours are sRGB (the kit tints in palette hex), so
 *    they are linearised (the shader multiplies by c, we add c^1.2 → c^2.2);
 *  - the summed diffuse light is raised to 2.2 before the output gamma, so
 *    shaded sides stay as deep as under the StandardMaterial-tuned lighting
 *    presets instead of lifting to a flat grey;
 *  - emissive (lighting.registerGlow lerps palette hex) is linearised.
 * Specular / Fresnel / metalness stay physically based: that is the upgrade.
 */
class GammaAuthoredPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "OlwGammaAuthored", 250, {}, true, true);
  }
  getClassName() {
    return "OlwGammaAuthoredPlugin";
  }
  isCompatible(shaderLanguage: ShaderLanguage) {
    return shaderLanguage === ShaderLanguage.GLSL;
  }
  getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
surfaceAlbedo *= pow(max(vColor.rgb, vec3(0.0)), vec3(1.2));
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifndef UNLIT
finalDiffuse *= pow(max(diffuseBase, vec3(0.0)), vec3(1.2));
#endif
finalEmissive = toLinearSpace(max(finalEmissive, vec3(0.0)));
`,
    };
  }
}

/**
 * A PBRMaterial tuned for the painterly look: low environment contribution,
 * Lambert diffuse, standard light falloff, no radiance occlusion. `color` is
 * sRGB like every palette colour (it is linearised here).
 */
export function stylizedPBR(scene: Scene, name: string, color: Color3, roughness: number, metallic = 0): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color.toLinearSpace();
  mat.roughness = roughness;
  mat.metallic = metallic;
  mat.environmentIntensity = 0.4; // keep it stylized, not a product render
  mat.directIntensity = 1.0;
  mat.useRadianceOcclusion = false; // cheaper
  mat.useHorizonOcclusion = false;
  mat.useSpecularOverAlpha = false;
  mat.usePhysicalLightFalloff = false; // the lamp pool is tuned for linear range falloff
  mat.brdf.baseDiffuseModel = Constants.MATERIAL_DIFFUSE_MODEL_LAMBERT; // match StandardMaterial shading
  new GammaAuthoredPlugin(mat);
  return mat;
}

// ---------------------------------------------------------------------------
// PBR helpers: uncached factories over `stylizedPBR` for one-off surfaces
// (share them through `MaterialCache` or `Materials.pbrFlat`). None of them
// freeze the material: callers freeze static ones once configured, and must
// never freeze `makeWater` (its UV scroll updates the texture every frame).

/** A colour as palette hex ("#rrggbb", sRGB) or a Color3 (also sRGB). */
export type ColorInput = Color3 | string;

const toColor3 = (c: ColorInput): Color3 => (typeof c === "string" ? Color3.FromHexString(c) : c.clone());

export interface PBROptions {
  /** sRGB albedo. Default white, so vertex colours carry the hue. */
  albedo?: ColorInput;
  albedoTexture?: BaseTexture;
  /** Default 0.8. */
  roughness?: number;
  /** Default 0. */
  metallic?: number;
  /** Tangent-space normal map: a texture, or a URL loaded (and owned) by the material. */
  normalMap?: BaseTexture | string;
  /** Normal map strength (`bumpTexture.level`). Default 1. */
  normalStrength?: number;
  /** sRGB emissive colour. */
  emissive?: ColorInput;
  /** < 1 switches the material to alpha blending. */
  alpha?: number;
  backFaceCulling?: boolean;
}

/** Stylized PBR material (environmentIntensity 0.4) with optional textures. */
export function makePBR(scene: Scene, name: string, opts: PBROptions = {}): PBRMaterial {
  const albedo = opts.albedo !== undefined ? toColor3(opts.albedo) : Color3.White();
  const mat = stylizedPBR(scene, name, albedo, opts.roughness ?? 0.8, opts.metallic ?? 0);
  mat.environmentIntensity = 0.4; // stylized, not a product render
  if (opts.albedoTexture) mat.albedoTexture = opts.albedoTexture;
  if (opts.normalMap !== undefined) {
    const owned = typeof opts.normalMap === "string";
    const n = typeof opts.normalMap === "string" ? new Texture(opts.normalMap, scene) : opts.normalMap;
    if (owned || opts.normalStrength !== undefined) n.level = opts.normalStrength ?? 1;
    mat.bumpTexture = n;
    if (owned) mat.onDisposeObservable.addOnce(() => n.dispose());
  }
  if (opts.emissive !== undefined) mat.emissiveColor = toColor3(opts.emissive);
  if (opts.alpha !== undefined && opts.alpha < 1) {
    mat.alpha = opts.alpha;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (opts.backFaceCulling !== undefined) mat.backFaceCulling = opts.backFaceCulling;
  return mat;
}

export interface GlassOptions {
  /** sRGB tint. Default PALETTE.glass. */
  tint?: ColorInput;
  /** Default 0.2. */
  alpha?: number;
  /** Default 0.05. */
  roughness?: number;
}

/** Clear, double-sided window glass: blended, with reflections kept over the alpha. */
export function makeGlass(scene: Scene, name: string, opts: GlassOptions = {}): PBRMaterial {
  const mat = makePBR(scene, name, { albedo: opts.tint ?? PALETTE.glass, roughness: opts.roughness ?? 0.05, metallic: 0 });
  mat.alpha = opts.alpha ?? 0.2;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.alphaMode = Constants.ALPHA_COMBINE; // === Engine.ALPHA_COMBINE, without pulling in Engine
  mat.backFaceCulling = false;
  mat.separateCullingPass = true; // back faces first, then front: stable sorting on double-sided panes
  mat.useSpecularOverAlpha = true; // highlights and reflections stay visible on a nearly clear pane
  mat.useRadianceOverAlpha = true;
  return mat;
}

/** Rendered / painted walls: matte, with a faint trowelled bump. */
export function makeStucco(scene: Scene, name: string, color: ColorInput = PALETTE.cream): PBRMaterial {
  const mat = makePBR(scene, name, { albedo: color, roughness: 0.85, metallic: 0 });
  mat.bumpTexture = stuccoNormalTexture(scene); // shared per scene: not disposed with the material
  return mat;
}

/** Road surface: dark grey, almost fully rough. */
export function makeAsphalt(scene: Scene, name: string, color: ColorInput = "#3b3b3d"): PBRMaterial {
  return makePBR(scene, name, { albedo: color, roughness: 0.9, metallic: 0 });
}

export function makeGrass(scene: Scene, name: string, color: ColorInput = PALETTE.grass): PBRMaterial {
  return makePBR(scene, name, { albedo: color, roughness: 0.8, metallic: 0 });
}

export interface WaterOptions {
  /** sRGB colour. Default PALETTE.water. */
  color?: ColorInput;
  /** Default 0.7. */
  alpha?: number;
  /** Ripple UV scroll in texture repeats per second. Default (0.02, 0.012). */
  flowU?: number;
  flowV?: number;
  /** Ripple repeats across the surface's UV range. Default 4. */
  tiling?: number;
}

/**
 * Glossy translucent water with a ripple normal map that scrolls every frame.
 * The ripple texture is owned by the material (disposed with it) and the
 * per-frame observer is removed on dispose. Do not freeze this material.
 */
export function makeWater(scene: Scene, name: string, opts: WaterOptions = {}): PBRMaterial {
  const mat = makePBR(scene, name, { albedo: opts.color ?? PALETTE.water, roughness: 0.1, metallic: 0, alpha: opts.alpha ?? 0.7 });
  mat.useSpecularOverAlpha = true; // sun glints read through the translucency
  mat.useRadianceOverAlpha = true;
  const ripple = proceduralNormalMap(scene, `${name}:ripple`, 128, 4, 0.9, 97);
  const tiling = opts.tiling ?? 4;
  ripple.uScale = tiling;
  ripple.vScale = tiling;
  ripple.level = 0.6;
  mat.bumpTexture = ripple;
  const flowU = opts.flowU ?? 0.02;
  const flowV = opts.flowV ?? 0.012;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime(), 100) / 1000;
    ripple.uOffset = (ripple.uOffset + flowU * dt) % 1;
    ripple.vOffset = (ripple.vOffset + flowV * dt) % 1;
  });
  mat.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(obs);
    ripple.dispose();
  });
  return mat;
}

/** Painted / weathered metal (railings, lamp posts, signs): glossy and metallic. */
export function makeMetal(scene: Scene, name: string, color: ColorInput = PALETTE.iron): PBRMaterial {
  return makePBR(scene, name, { albedo: color, roughness: 0.3, metallic: 0.9 });
}

export function makeWood(scene: Scene, name: string, color: ColorInput = PALETTE.wood): PBRMaterial {
  return makePBR(scene, name, { albedo: color, roughness: 0.7, metallic: 0 });
}

/**
 * Keyed cache of PBR materials. Materials disposed elsewhere drop out of the
 * cache automatically. `dispose()` leaves textures alone (they may be shared,
 * e.g. the stucco normal map); textures a helper created privately (water
 * ripples, URL normal maps) are released by the material's own dispose hook.
 */
export class MaterialCache {
  private readonly cache = new Map<string, PBRMaterial>();

  get size(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** The cached material, or (with `create`) a new one made and cached on a miss. */
  get(key: string): PBRMaterial | undefined;
  get(key: string, create: (key: string) => PBRMaterial): PBRMaterial;
  get(key: string, create?: (key: string) => PBRMaterial): PBRMaterial | undefined {
    const hit = this.cache.get(key);
    if (hit || !create) return hit;
    const mat = create(key);
    this.set(key, mat);
    return mat;
  }

  /** Cache `mat` under `key` (replacing, not disposing, any previous entry). */
  set(key: string, mat: PBRMaterial): PBRMaterial {
    this.cache.set(key, mat);
    mat.onDisposeObservable.addOnce(() => {
      if (this.cache.get(key) === mat) this.cache.delete(key);
    });
    return mat;
  }

  /** Remove an entry; disposes the material unless `dispose` is false. */
  delete(key: string, dispose = true): boolean {
    const mat = this.cache.get(key);
    if (!mat) return false;
    this.cache.delete(key);
    if (dispose) mat.dispose(false, false);
    return true;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  dispose(): void {
    const all = [...this.cache.values()];
    this.cache.clear();
    for (const m of all) m.dispose(false, false);
  }
}

const STUCCO_NORMAL = new WeakMap<Scene, DynamicTexture>();

/** Shared faint trowel-noise normal map for stucco (one per scene). */
function stuccoNormalTexture(scene: Scene): DynamicTexture {
  const cached = STUCCO_NORMAL.get(scene);
  if (cached && cached.getInternalTexture()) return cached;
  const t = proceduralNormalMap(scene, "stucco:normal", 128, 8, 0.35, 311);
  t.level = 0.5;
  STUCCO_NORMAL.set(scene, t);
  return t;
}

/**
 * Tileable tangent-space normal map from a few octaves of wrapped value
 * noise. `freq` = base noise cells across the tile, `strength` scales slopes.
 */
function proceduralNormalMap(scene: Scene, name: string, size: number, freq: number, strength: number, noiseSeed: number): DynamicTexture {
  const h = new Float32Array(size * size);
  const lattice = (ix: number, iy: number, cells: number, s: number) => {
    const x = ((ix % cells) + cells) % cells;
    const y = ((iy % cells) + cells) % cells;
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let o = 0, cells = freq, amp = 1; o < 3; o++, cells *= 2, amp *= 0.5) {
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const iy = Math.floor(fy);
      const ty = fade(fy - iy);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const ix = Math.floor(fx);
        const tx = fade(fx - ix);
        const s = noiseSeed + o * 17;
        const a = lattice(ix, iy, cells, s);
        const b = lattice(ix + 1, iy, cells, s);
        const c = lattice(ix, iy + 1, cells, s);
        const d = lattice(ix + 1, iy + 1, cells, s);
        h[y * size + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
  }
  const t = new DynamicTexture(name, { width: size, height: size }, scene, true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  t.update(false);
  return t;
}

/** Wall surface per region wall material (olw_stone slots, cottage walls). */
const WALL_SURFACE: Record<WorldArtProfile["wallMaterial"], SurfaceKind> = {
  stone: "stone",
  render_white: "stucco",
  render_cream: "stucco",
  brick_london: "brick",
  limestone: "stone",
  marble: "marble",
};

/** Surface of the olw_roof_tile slot per region roof style. */
const ROOF_SURFACE: Record<WorldArtProfile["roofStyle"], SurfaceKind> = {
  slate: "terracotta", // Scotland's pantiles; the slate slot is SURFACES.slate
  terracotta: "terracotta",
  flat_parapet: "flatRoof",
  lead_flat: "leadRoof",
  glass: "glass",
};

export interface RegionPalette {
  ground: string;
  path: string;
  road: string;
  sidewalk: string;
  sand: string;
  wall: string;
  wallDark: string;
  roofTile: string;
  slate: string;
  accent: string;
  /** PBR surface of walls (olw_stone) and of the olw_roof_tile slot. */
  wallSurface: SurfaceKind;
  roofSurface: SurfaceKind;
}

/** The palette of the region currently loaded (Scotland until a profile is applied). */
export const ACTIVE_REGION: RegionPalette = {
  ground: PALETTE.grass,
  path: "#ada08b",
  road: "#9d978e",
  sidewalk: "#d2c6b1",
  sand: "#e2cfa3",
  wall: PALETTE.stoneWarm,
  wallDark: PALETTE.greyStoneDark,
  roofTile: PALETTE.terracottaMuted,
  slate: PALETTE.slate,
  accent: PALETTE.wood,
  wallSurface: "stone",
  roofSurface: "terracotta",
};

/**
 * Swap the ground / road / wall / roof colours for a region. Affects slot
 * materials created from now on (Materials caches by hex, so each region gets
 * its own cached materials and switching back restores the originals).
 */
export function applyRegionPalette(profile: WorldArtProfile): RegionPalette {
  const wall = WALL_HEX[profile.wallMaterial];
  const roof = ROOF_HEX[profile.roofStyle];
  ACTIVE_REGION.ground = profile.groundColor;
  ACTIVE_REGION.path = profile.pathColor;
  ACTIVE_REGION.road = profile.roadColor;
  ACTIVE_REGION.sidewalk = profile.sidewalkColor;
  ACTIVE_REGION.sand = profile.sandColor;
  ACTIVE_REGION.wall = wall.stone;
  ACTIVE_REGION.wallDark = wall.dark;
  ACTIVE_REGION.roofTile = roof.tile;
  ACTIVE_REGION.slate = roof.slate;
  ACTIVE_REGION.accent = profile.accentColor;
  ACTIVE_REGION.wallSurface = WALL_SURFACE[profile.wallMaterial];
  ACTIVE_REGION.roofSurface = ROOF_SURFACE[profile.roofStyle];
  SLOT_STYLE.olw_stone.hex = wall.stone;
  SLOT_STYLE.olw_stone_dark.hex = wall.dark;
  SLOT_STYLE.olw_roof_tile.hex = roof.tile;
  SLOT_STYLE.olw_slate.hex = roof.slate;
  return ACTIVE_REGION;
}

export class Materials {
  private mats = new Map<string, StandardMaterial>();
  private pbrs = new Map<string, PBRMaterial>();
  private texes = new Map<string, DynamicTexture>();

  constructor(private scene: Scene) {}

  /** Flat colour material (cached by hex + emissive flag). */
  flat(hex: string, opts: { emissive?: number; alpha?: number; backFace?: boolean } = {}) {
    const key = `flat:${hex}:${opts.emissive ?? 0}:${opts.alpha ?? 1}:${opts.backFace ? 1 : 0}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new StandardMaterial(key, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(opts.emissive);
    if (opts.alpha !== undefined && opts.alpha < 1) m.alpha = opts.alpha;
    if (opts.backFace) m.backFaceCulling = false;
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  /** Textured material; texture generated once per (style, hex). `scale` = repeats per unit. */
  textured(style: TexStyle, hex: string, scale = 1, opts: { emissive?: number; vertexColor?: boolean } = {}) {
    const key = `tex:${style}:${hex}:${scale}:${opts.emissive ?? 0}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new StandardMaterial(key, this.scene);
    const t = this.texture(style, hex);
    t.uScale = scale;
    t.vScale = scale;
    m.diffuseTexture = t;
    m.specularColor = Color3.Black();
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(opts.emissive);
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  /**
   * Flat stylized-PBR material for a surface type (cached by hex + surface +
   * options). White hex = vertex colours carry the hue, as with `flat`.
   */
  pbrFlat(hex: string, surface: SurfaceKind, opts: { emissive?: number } = {}) {
    const key = `pbr:${surface}:${hex}:${opts.emissive ?? 0}`;
    let m = this.pbrs.get(key);
    if (m) return m;
    const s = SURFACES[surface];
    m = stylizedPBR(this.scene, key, Color3.FromHexString(hex), s.roughness, s.metallic ?? 0);
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(opts.emissive);
    m.freeze();
    this.pbrs.set(key, m);
    return m;
  }

  /** Hand-painted texture (shared with `textured`) on a stylized-PBR material. */
  pbrTextured(style: TexStyle, hex: string, scale: number, surface: SurfaceKind) {
    const key = `pbrtex:${surface}:${style}:${hex}:${scale}`;
    let m = this.pbrs.get(key);
    if (m) return m;
    const s = SURFACES[surface];
    m = stylizedPBR(this.scene, key, Color3.White(), s.roughness, s.metallic ?? 0);
    // own Texture wrapper per scale over the shared canvas (uScale is per texture)
    const t = this.texture(style, hex).clone();
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 4;
    t.uScale = scale;
    t.vScale = scale;
    m.albedoTexture = t;
    m.freeze();
    this.pbrs.set(key, m);
    return m;
  }

  /**
   * Shared material for a named slot (olw_stone, olw_roof_tile, olw_slate,
   * olw_wood, olw_stone_dark, olw_wood_dark, olw_bark, olw_awning,
   * olw_light_emissive, olw_rubber, olw_flower, …). Unknown slots (olw_paint,
   * olw_foliage, olw_metal, character roles) are flat white × vertex colour.
   * Emissive slots still need `lighting.registerGlow` by the caller for the
   * night glow.
   */
  slot(name: string) {
    const d = SLOT_STYLE[name];
    if (!d) return this.flat("#ffffff");
    if (d.style === "flat") return this.flat(d.hex, d.emissive ? { emissive: d.emissive } : {});
    return this.textured(d.style, d.hex, d.scale ?? 1, d.emissive ? { emissive: d.emissive } : {});
  }

  texture(style: TexStyle, hex: string): DynamicTexture {
    const key = `${style}:${hex}`;
    let t = this.texes.get(key);
    if (t) return t;
    const size = style === "roof" || style === "slate" || style === "stone" ? 512 : style === "cobble" || style === "planks" || style === "bark" ? 256 : 128;
    t = new DynamicTexture(`dt:${key}`, { width: size, height: size }, this.scene, true);
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 4;
    const ctx = t.getContext() as CanvasRenderingContext2D;
    seed = 7 + key.length * 131;
    paint(ctx, size, style, hex);
    t.update(false);
    this.texes.set(key, t);
    return t;
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    for (const m of this.pbrs.values()) m.dispose(false, true);
    for (const t of this.texes.values()) t.dispose();
    this.mats.clear();
    this.pbrs.clear();
    this.texes.clear();
  }
}

// ---------------------------------------------------------------------------
function paint(ctx: CanvasRenderingContext2D, s: number, style: TexStyle, hex: string) {
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, s, s);
  switch (style) {
    case "noise":
      blotches(ctx, s, hex, 40, 0.05, s / 6);
      break;
    case "grass":
      blotches(ctx, s, hex, 60, 0.07, s / 5);
      // a few brush strokes
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = vary(hex, rnd() > 0.5 ? 0.12 : -0.1, 0.02);
        ctx.lineWidth = 1.5;
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 6, y - 3 - rnd() * 5);
        ctx.stroke();
      }
      break;
    case "stone": {
      // irregular coursed rubble / ashlar: courses of varying height, stones of
      // varying length with warm/cool hue shifts, the odd darker stone, lit top
      // edges, shaded bottoms and chipped corners over soft mortar
      ctx.fillStyle = vary(hex, -0.13, 0);
      ctx.fillRect(0, 0, s, s);
      const hs: number[] = [];
      for (let i = 0; i < 7; i++) hs.push(0.7 + rnd() * 0.7);
      const hsum = hs.reduce((a, v) => a + v, 0);
      let y = 0;
      for (const hr of hs) {
        const bh = (hr / hsum) * s;
        let x = -rnd() * bh;
        while (x < s) {
          const bw = Math.min(bh * (1.1 + rnd() * 1.5), s - x + bh * 0.3);
          const dark = rnd() > 0.9;
          const hueShift = (rnd() - 0.5) * 0.06;
          const base = hexToRgb(hex);
          const t = dark ? -0.12 - rnd() * 0.05 : (rnd() - 0.45) * 0.1;
          const to = t < 0 ? 0 : 255;
          const k = Math.abs(t);
          const r = base.r + (to - base.r) * k + hueShift * 120;
          const g = base.g + (to - base.g) * k + hueShift * 20;
          const b2 = base.b + (to - base.b) * k - hueShift * 90;
          const ix = x + 2 + (rnd() - 0.5) * 1.5;
          const iy = y + 2 + (rnd() - 0.5) * 1.5;
          const iw = bw - 4;
          const ih = bh - 4;
          const draw = (ox: number) => {
            ctx.fillStyle = rgb(r, g, b2);
            roundRect(ctx, ix + ox, iy, iw, ih, 4 + rnd() * 5);
            ctx.fill();
            // lit top edge, shaded bottom edge (hand-painted bevel)
            ctx.fillStyle = "rgba(255,248,232,0.09)";
            roundRect(ctx, ix + ox + 2, iy + 1.5, iw - 4, ih * 0.22, 3);
            ctx.fill();
            ctx.fillStyle = "rgba(40,30,20,0.09)";
            roundRect(ctx, ix + ox + 1, iy + ih * 0.8, iw - 2, ih * 0.2, 3);
            ctx.fill();
            // a few soft pits / lichen dots
            for (let i = 0; i < 3; i++) {
              ctx.fillStyle = rnd() > 0.8 ? "rgba(120,130,80,0.18)" : "rgba(60,50,40,0.1)";
              ctx.beginPath();
              ctx.arc(ix + ox + rnd() * iw, iy + rnd() * ih, 1.5 + rnd() * 3, 0, Math.PI * 2);
              ctx.fill();
            }
          };
          draw(0);
          if (ix + iw > s) draw(-s);
          if (ix < 0) draw(s);
          x += bw;
        }
        y += bh;
      }
      break;
    }
    case "cobble": {
      // multi-tone rounded cobbles, imperfect rows, soft worn tops, moss in some joints
      ctx.fillStyle = vary(hex, -0.3, 0);
      ctx.fillRect(0, 0, s, s);
      const n = 9;
      const cw = s / n;
      for (let r = 0; r < n; r++)
        for (let c = 0; c <= n; c++) {
          const x = c * cw + (r % 2 ? cw / 2 : 0) + (rnd() - 0.5) * 5 - cw / 2;
          const y = r * cw + (rnd() - 0.5) * 4;
          const w = cw * (0.82 + rnd() * 0.16);
          const h = cw * (0.8 + rnd() * 0.16);
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.3, 0.03);
          roundRect(ctx, x + 1.5, y + 1.5, w, h, cw * 0.38);
          ctx.fill();
          ctx.fillStyle = "rgba(255,250,240,0.14)";
          ctx.beginPath();
          ctx.ellipse(x + w * 0.45, y + h * 0.4, w * 0.25, h * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
          if (rnd() > 0.86) {
            ctx.fillStyle = "rgba(96,118,62,0.55)";
            ctx.fillRect(x + w, y + 2, 3, h * 0.7);
          }
        }
      break;
    }
    case "paving": {
      const n = 4;
      const cw = s / n;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          ctx.fillStyle = vary(hex, (rnd() - 0.5) * 0.12, 0.015);
          roundRect(ctx, c * cw + 1.5, r * cw + 1.5, cw - 3, cw - 3, 2);
          ctx.fill();
        }
      break;
    }
    case "roof": {
      // pantile / clay tile rows: each row casts a soft shadow on the one below,
      // controlled colour drift (sun-bleached, orange, darker) and uneven edges
      const rows = 12;
      const th = s / rows;
      const tw = th * 0.95;
      for (let r = 0; r <= rows; r++) {
        const off = r % 2 ? tw / 2 : 0;
        const rowT = (rnd() - 0.5) * 0.08;
        for (let x = -tw; x < s + tw; x += tw) {
          const x0 = x + off + (rnd() - 0.5) * 2;
          const y0 = r * th + (rnd() - 0.5) * 1.5;
          const pick = rnd();
          const t = rowT + (pick > 0.93 ? -0.18 : pick > 0.85 ? 0.12 : (rnd() - 0.5) * 0.12);
          ctx.fillStyle = vary(hex, t, 0.02);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + tw, y0);
          ctx.lineTo(x0 + tw, y0 + th * 0.78);
          ctx.arc(x0 + tw / 2, y0 + th * 0.78, tw / 2, 0, Math.PI);
          ctx.closePath();
          ctx.fill();
          // rounded highlight down the tile's crown
          ctx.fillStyle = "rgba(255,240,220,0.13)";
          ctx.fillRect(x0 + tw * 0.3, y0 + 2, tw * 0.22, th * 0.9);
          // soft shadow the next row casts
          ctx.fillStyle = "rgba(40,20,10,0.16)";
          ctx.fillRect(x0, y0, tw, th * 0.16);
        }
      }
      break;
    }
    case "slate": {
      // slates of varying width in staggered courses; blue-grey / purple /
      // green-grey drift, uneven bottom edges, the odd replaced lighter slate
      const rows = 10;
      const th = s / rows;
      for (let r = 0; r <= rows; r++) {
        let x = -rnd() * th;
        const rowT = (rnd() - 0.5) * 0.06;
        while (x < s + th) {
          const tw = th * (0.9 + rnd() * 0.7);
          const y0 = r * th;
          const pick = rnd();
          const t = rowT + (pick > 0.94 ? 0.16 : pick > 0.86 ? -0.14 : (rnd() - 0.5) * 0.1);
          const c = hexToRgb(hex);
          const tint = (rnd() - 0.5) * 14;
          const to = t < 0 ? 0 : 255;
          const k = Math.abs(t);
          ctx.fillStyle = rgb(c.r + (to - c.r) * k + tint * 0.6, c.g + (to - c.g) * k - tint * 0.2, c.b + (to - c.b) * k + tint);
          const drop = th * (1.12 + rnd() * 0.12);
          ctx.beginPath();
          ctx.moveTo(x + 0.8, y0);
          ctx.lineTo(x + tw - 0.8, y0);
          ctx.lineTo(x + tw - 1.2, y0 + drop + (rnd() - 0.5) * 3);
          ctx.lineTo(x + 1.2, y0 + drop + (rnd() - 0.5) * 3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.07)";
          ctx.fillRect(x + 2, y0 + drop * 0.55, tw - 4, drop * 0.3);
          ctx.fillStyle = "rgba(10,12,20,0.22)";
          ctx.fillRect(x, y0, tw, th * 0.12);
          x += tw;
        }
      }
      break;
    }
    case "planks": {
      // broad painted boards: hue drift per board, long soft grain strokes, a knot or two
      const n = 5;
      const pw = s / n;
      ctx.fillStyle = vary(hex, -0.35, 0);
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < n; i++) {
        const c = hexToRgb(hex);
        const t = (rnd() - 0.5) * 0.18;
        const hue = (rnd() - 0.5) * 16;
        const to = t < 0 ? 0 : 255;
        ctx.fillStyle = rgb(c.r + (to - c.r) * Math.abs(t) + hue, c.g + (to - c.g) * Math.abs(t), c.b + (to - c.b) * Math.abs(t) - hue * 0.5);
        ctx.fillRect(i * pw + 1.5, 0, pw - 3, s);
        ctx.lineCap = "round";
        for (let g = 0; g < 7; g++) {
          ctx.strokeStyle = rnd() > 0.4 ? "rgba(50,30,15,0.12)" : "rgba(255,240,220,0.1)";
          ctx.lineWidth = 1 + rnd() * 2.2;
          const x = i * pw + 4 + rnd() * (pw - 8);
          const y0 = rnd() * s;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, y0 + s * 0.2, x + (rnd() - 0.5) * 6, y0 + s * 0.4, x + (rnd() - 0.5) * 4, y0 + s * (0.3 + rnd() * 0.5));
          ctx.stroke();
        }
        if (rnd() > 0.5) {
          ctx.fillStyle = "rgba(60,35,20,0.35)";
          ctx.beginPath();
          ctx.ellipse(i * pw + pw * (0.3 + rnd() * 0.4), rnd() * s, 2.5, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "bark": {
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = vary(hex, (rnd() - 0.6) * 0.35, 0.02);
        ctx.lineWidth = 2 + rnd() * 5;
        const x = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (rnd() - 0.5) * 12, s * 0.33, x + (rnd() - 0.5) * 12, s * 0.66, x, s);
        ctx.stroke();
      }
      break;
    }
    case "canvas": {
      blotches(ctx, s, hex, 20, 0.03, s / 5);
      for (let i = 0; i < s; i += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.025)";
        ctx.fillRect(0, i, s, 1);
      }
      break;
    }
    case "awning": {
      const stripes = 8;
      const sw = s / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? PALETTE.creamLight : hex;
        ctx.fillRect(i * sw, 0, sw, s);
      }
      blotches(ctx, s, hex, 10, 0.03, s / 4);
      break;
    }
  }
}

function blotches(ctx: CanvasRenderingContext2D, s: number, hex: string, n: number, amount: number, r: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = vary(hex, (rnd() - 0.5) * 2 * amount, 0.01);
    ctx.beginPath();
    ctx.ellipse(rnd() * s, rnd() * s, r * (0.5 + rnd()), r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
