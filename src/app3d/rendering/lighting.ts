// Sun, ambient, fog, shadows, lamps and the sky palette, driven by
// store.state.timeOfDay. A time change blends every parameter over a few
// seconds (lamps and windows fade in through the evening instead of popping).
//
// Mood per preset ("cool world + warm human spaces"):
//  - morning / afternoon: soft warm sun, warm-neutral hemi fill, gentle shadows;
//  - evening: low golden sun from the west, lavender-cool fill (so shadows read
//    cool), windows and lamps coming on at ~70 %;
//  - night: a low, cool moonlit ambient (not blue-everything) plus strong warm
//    pools: emissive windows / lamp heads, the additive lamp-glow discs and a
//    small pool of real PointLights reassigned to the lamps nearest the player.

import type { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Scene as SceneClass } from "@babylonjs/core/scene";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { store } from "../../game/systems/store";
import type { TimeOfDay } from "../../game/systems/save";
import type { QualityProfile } from "../performance/quality";

/** Sky / horizon colours shared with sky.ts and backdrop.ts (linear-ish 0..1 RGB). */
export interface Atmosphere {
  zenith: Color3;
  horizon: Color3;
  /** Fog / haze colour at ground level (equals scene.fogColor). */
  haze: Color3;
  /** Warm glow around the sun's azimuth (evening). */
  sunGlow: Color3;
  sunGlowStrength: number;
  /** Direction the sunlight travels (normalised). */
  sunDir: Vector3;
  /** Light level on the distant scenery (1 day, ~0.35 night) and its tint. */
  light: Color3;
  cloudLit: Color3;
  cloudShade: Color3;
  /** 0 = day, 1 = full night (stars / moon, lamp emphasis). */
  night: number;
}

interface Preset {
  zenith: string;
  horizon: string;
  fog: string;
  fogDensity: number;
  sunGlow: string;
  sunGlowStrength: number;
  sunDir: Vector3;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Babylon shadow darkness: 0 = black shadow, 1 = no shadow. */
  shadow: number;
  exposure: number;
  contrast: number;
  vignette: number;
  vignetteColor: string;
  /** Distant scenery light level/tint. */
  farLight: string;
  cloudLit: string;
  cloudShade: string;
  /** 0..1: windows & lamp heads emissive, lamp-glow discs, point lights. */
  lamps: number;
  /** Point-light intensity at lamps = 1. */
  pool: number;
  night: number;
}

const PRESETS: Record<TimeOfDay, Preset> = {
  morning: {
    zenith: "#86b2d8",
    horizon: "#e6e6da",
    fog: "#dde2dc",
    fogDensity: 0.0085,
    sunGlow: "#fff0d2",
    sunGlowStrength: 0.35,
    sunDir: new Vector3(-0.78, -0.5, 0.3),
    sunColor: "#ffe2b8",
    sunIntensity: 1.2,
    hemiSky: "#d4dfe8",
    hemiGround: "#b39474",
    hemiIntensity: 0.55,
    shadow: 0.45,
    exposure: 1.05,
    contrast: 1.08,
    vignette: 1.1,
    vignetteColor: "#3a2c24",
    farLight: "#ffffff",
    cloudLit: "#fffaf0",
    cloudShade: "#c9d2dc",
    lamps: 0,
    pool: 0,
    night: 0,
  },
  afternoon: {
    zenith: "#78acdc",
    horizon: "#dfe8e8",
    fog: "#d7e0e2",
    fogDensity: 0.0075,
    sunGlow: "#fff4dc",
    sunGlowStrength: 0.25,
    sunDir: new Vector3(-0.66, -0.7, 0.26),
    sunColor: "#ffe8c8",
    sunIntensity: 1.2,
    hemiSky: "#cddcea",
    hemiGround: "#b09070",
    hemiIntensity: 0.55,
    shadow: 0.42,
    exposure: 1.05,
    contrast: 1.08,
    vignette: 1.1,
    vignetteColor: "#3a2c24",
    farLight: "#ffffff",
    cloudLit: "#ffffff",
    cloudShade: "#c6d0dc",
    lamps: 0,
    pool: 0,
    night: 0,
  },
  evening: {
    zenith: "#7d8cbc",
    horizon: "#f3c8a0",
    fog: "#e6bfa2",
    fogDensity: 0.009,
    sunGlow: "#ffb070",
    sunGlowStrength: 0.8,
    sunDir: new Vector3(0.8, -0.3, 0.42),
    sunColor: "#ffb674",
    sunIntensity: 1.1,
    hemiSky: "#a9a8cc",
    hemiGround: "#8a6a5c",
    hemiIntensity: 0.55,
    shadow: 0.6,
    exposure: 1.05,
    contrast: 1.08,
    vignette: 1.3,
    vignetteColor: "#3c2224",
    farLight: "#f0d2c0",
    cloudLit: "#ffd2b0",
    cloudShade: "#a890a8",
    lamps: 0.7,
    pool: 1.0,
    night: 0.25,
  },
  night: {
    zenith: "#101830",
    horizon: "#34436a",
    fog: "#2c3858",
    fogDensity: 0.011,
    sunGlow: "#50608c",
    sunGlowStrength: 0.2,
    sunDir: new Vector3(0.35, -0.8, 0.45),
    sunColor: "#8ea4d8",
    sunIntensity: 0.34,
    hemiSky: "#6a7fb4",
    hemiGround: "#3c3644",
    hemiIntensity: 0.46,
    shadow: 0.72,
    exposure: 1.12,
    contrast: 1.1,
    vignette: 1.5,
    vignetteColor: "#141a30",
    farLight: "#5a6890",
    cloudLit: "#5a6a90",
    cloudShade: "#34405e",
    lamps: 1,
    pool: 1.9,
    night: 1,
  },
};

/** The blended, numeric form of a Preset. */
interface Live {
  zenith: Color3;
  horizon: Color3;
  fog: Color3;
  fogDensity: number;
  sunGlow: Color3;
  sunGlowStrength: number;
  sunDir: Vector3;
  sunColor: Color3;
  sunIntensity: number;
  hemiSky: Color3;
  hemiGround: Color3;
  hemiIntensity: number;
  shadow: number;
  exposure: number;
  contrast: number;
  vignette: number;
  vignetteColor: Color3;
  farLight: Color3;
  cloudLit: Color3;
  cloudShade: Color3;
  lamps: number;
  pool: number;
  night: number;
}

const C = (h: string) => Color3.FromHexString(h);
const live = (p: Preset): Live => ({
  zenith: C(p.zenith),
  horizon: C(p.horizon),
  fog: C(p.fog),
  fogDensity: p.fogDensity,
  sunGlow: C(p.sunGlow),
  sunGlowStrength: p.sunGlowStrength,
  sunDir: p.sunDir.clone().normalize(),
  sunColor: C(p.sunColor),
  sunIntensity: p.sunIntensity,
  hemiSky: C(p.hemiSky),
  hemiGround: C(p.hemiGround),
  hemiIntensity: p.hemiIntensity,
  shadow: p.shadow,
  exposure: p.exposure,
  contrast: p.contrast,
  vignette: p.vignette,
  vignetteColor: C(p.vignetteColor),
  farLight: C(p.farLight),
  cloudLit: C(p.cloudLit),
  cloudShade: C(p.cloudShade),
  lamps: p.lamps,
  pool: p.pool,
  night: p.night,
});

function lerpLive(a: Live, b: Live, t: number, out: Live) {
  for (const k of Object.keys(out) as (keyof Live)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === "number") (out as unknown as Record<string, number>)[k] = va + ((vb as number) - va) * t;
    else if (va instanceof Color3) Color3.LerpToRef(va, vb as Color3, t, out[k] as Color3);
    else if (va instanceof Vector3) Vector3.LerpToRef(va, vb as Vector3, t, out[k] as Vector3);
  }
  out.sunDir.normalize();
}
const cloneLive = (l: Live): Live => {
  const o = { ...l } as Live;
  for (const k of Object.keys(o) as (keyof Live)[]) {
    const v = o[k];
    if (v instanceof Color3 || v instanceof Vector3) (o as unknown as Record<string, unknown>)[k] = v.clone();
  }
  return o;
};

interface GlowEntry {
  mat: StandardMaterial;
  lit: Color3;
  dark: Color3;
}

export interface WarmSpot {
  x: number;
  y: number;
  z: number;
  /** Light height above y (default 2.7, a lamp head). */
  h?: number;
  /** Priority (default 1): distance is divided by it when picking. */
  weight?: number;
  /** Range override (default 10). */
  range?: number;
}

interface PoolLight {
  light: PointLight;
  lamp: number;
  f: number;
}

export interface Lighting {
  hemi: HemisphericLight;
  sun: DirectionalLight;
  shadows: ShadowGenerator | null;
  /** Add a shadow caster (buildings, trees, characters near the camera). */
  addCaster(mesh: AbstractMesh): void;
  removeCaster(mesh: AbstractMesh): void;
  /** Materials whose emissive turns on in the evening/night (lamps, windows). */
  registerGlow(mat: StandardMaterial, litHex: string, darkHex?: string): void;
  /** Show `mesh` only while lamps are lit (faded via visibility). Returns an unregister function. */
  registerNightMesh(mesh: AbstractMesh): () => void;
  /**
   * Warm spots the point-light pool snaps to: lamp-post feet (light at +2.7),
   * or e.g. a café front with its own light height `h` and a `weight` > 1 that
   * makes it win over nearer plain lamps.
   */
  setLamps(lamps: WarmSpot[]): void;
  /** Keep the shadow frustum (and the lamp pool) centred on the player. */
  follow(x: number, z: number): void;
  /** Switch preset; `instant` skips the blend (loads / screenshots). */
  apply(time?: TimeOfDay, instant?: boolean): void;
  /** Per-frame blend + lamp pool update. */
  update(dt: number): void;
  /** Current sky palette (live object, updated in place). */
  atmosphere(): Atmosphere;
  /** Called whenever the blended palette changes. */
  onAtmosphere(fn: (a: Atmosphere) => void): () => void;
  isNight(): boolean;
  /** Number of pooled point lights. */
  readonly poolSize: number;
  dispose(): void;
}

export function createLighting(scene: Scene, quality: QualityProfile): Lighting {
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  const sun = new DirectionalLight("sun", PRESETS.afternoon.sunDir.clone(), scene);
  sun.position = new Vector3(0, 40, 0);
  sun.autoUpdateExtends = false;
  sun.shadowMinZ = 5;
  sun.shadowMaxZ = 110;
  // the lower camera sees further north: a wider, north-shifted shadow frustum
  const ext = quality.id === "high" ? 30 : 26;
  sun.orthoLeft = -ext;
  sun.orthoRight = ext;
  sun.orthoTop = ext;
  sun.orthoBottom = -ext;

  let shadows: ShadowGenerator | null = null;
  try {
    shadows = new ShadowGenerator(quality.shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = quality.shadowQuality === "medium" ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    shadows.bias = 0.0012;
    shadows.normalBias = 0.02;
    shadows.darkness = 0.6;
    shadows.frustumEdgeFalloff = 0.35;
    shadows.transparencyShadow = false;
  } catch {
    shadows = null;
  }

  // warm pooled point lights (always present so light counts / shaders never change)
  const POOL = quality.pointLights;
  const pool: PoolLight[] = [];
  for (let i = 0; i < POOL; i++) {
    const l = new PointLight(`lampPool${i}`, new Vector3(0, -50, 0), scene);
    l.diffuse = Color3.FromHexString("#ffb862");
    l.specular = Color3.Black();
    l.range = 10;
    l.intensity = 0;
    l.falloffType = Light.FALLOFF_STANDARD;
    pool.push({ light: l, lamp: -1, f: 0 });
  }
  // every material must accept hemi + sun + the pool
  const maxLights = 2 + POOL;
  const bumpLights = (m: Material) => {
    const mm = m as Material & { maxSimultaneousLights?: number };
    if (typeof mm.maxSimultaneousLights === "number" && mm.maxSimultaneousLights < maxLights) mm.maxSimultaneousLights = maxLights;
  };
  for (const m of scene.materials) bumpLights(m);
  const matObs = scene.onNewMaterialAddedObservable.add(bumpLights);

  // colour grading inside the material shaders (no extra post-process pass)
  const ip = scene.imageProcessingConfiguration;
  ip.isEnabled = true;
  ip.vignetteEnabled = true;
  ip.vignetteStretch = 0.6;
  ip.vignetteCameraFov = 0.8;
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  ip.toneMappingEnabled = false;

  scene.fogMode = SceneClass.FOGMODE_EXP2;

  const glows: GlowEntry[] = [];
  const nightMeshes: AbstractMesh[] = [];
  let lamps: WarmSpot[] = [];
  let current: TimeOfDay = store.state.timeOfDay;
  let focusX = 0;
  let focusZ = 0;

  let from = live(PRESETS[current] ?? PRESETS.afternoon);
  let to = cloneLive(from);
  const cur = cloneLive(from);
  let blend = 1;
  const BLEND_S = 3.2;
  let lastGlow = -1;

  const atmo: Atmosphere = {
    zenith: new Color3(),
    horizon: new Color3(),
    haze: new Color3(),
    sunGlow: new Color3(),
    sunGlowStrength: 0,
    sunDir: new Vector3(0, -1, 0),
    light: new Color3(1, 1, 1),
    cloudLit: new Color3(),
    cloudShade: new Color3(),
    night: 0,
  };
  const atmoListeners = new Set<(a: Atmosphere) => void>();

  const push = () => {
    const p = cur;
    scene.clearColor = new Color4(p.horizon.r, p.horizon.g, p.horizon.b, 1);
    scene.fogColor = p.fog.clone();
    scene.fogDensity = p.fogDensity;
    scene.ambientColor = p.hemiSky.scale(0.2);
    sun.direction.copyFrom(p.sunDir);
    sun.diffuse = p.sunColor.clone();
    sun.specular = Color3.Black();
    sun.intensity = p.sunIntensity;
    hemi.diffuse = p.hemiSky.clone();
    hemi.groundColor = p.hemiGround.clone();
    hemi.specular = Color3.Black();
    hemi.intensity = p.hemiIntensity;
    if (shadows) shadows.darkness = p.shadow;
    ip.exposure = p.exposure;
    ip.contrast = p.contrast;
    ip.vignetteWeight = p.vignette;
    ip.vignetteColor.set(p.vignetteColor.r, p.vignetteColor.g, p.vignetteColor.b, 1);
    // windows / lamp heads (skip the unfreeze when the level didn't move)
    const g = Math.round(p.lamps * 100) / 100;
    if (g !== lastGlow) {
      lastGlow = g;
      for (const e of glows) setGlow(e, g);
      for (const m of nightMeshes) setNight(m, g);
    }
    atmo.zenith.copyFrom(p.zenith);
    atmo.horizon.copyFrom(p.horizon);
    atmo.haze.copyFrom(p.fog);
    atmo.sunGlow.copyFrom(p.sunGlow);
    atmo.sunGlowStrength = p.sunGlowStrength;
    atmo.sunDir.copyFrom(p.sunDir);
    atmo.light.copyFrom(p.farLight);
    atmo.cloudLit.copyFrom(p.cloudLit);
    atmo.cloudShade.copyFrom(p.cloudShade);
    atmo.night = p.night;
    for (const fn of atmoListeners) fn(atmo);
    follow(focusX, focusZ);
  };

  const setGlow = (e: GlowEntry, g: number) => {
    e.mat.unfreeze();
    e.mat.emissiveColor = Color3.Lerp(e.dark, e.lit, g);
    e.mat.freeze();
  };
  const setNight = (m: AbstractMesh, g: number) => {
    m.setEnabled(g > 0.02);
    m.visibility = Math.min(1, g * 1.1);
  };

  const apply = (time: TimeOfDay = store.state.timeOfDay, instant = false) => {
    current = time;
    from = cloneLive(cur);
    to = live(PRESETS[time] ?? PRESETS.afternoon);
    blend = instant ? 1 : 0;
    if (instant) lerpLive(from, to, 1, cur);
    push();
  };

  const follow = (x: number, z: number) => {
    focusX = x;
    focusZ = z;
    const d = sun.direction;
    // the camera looks north: centre the shadow frustum ahead of the player
    sun.position.set(x - d.x * 55, -d.y * 55, z + 9 - d.z * 55);
  };

  // ---- warm lamp pool ----
  let poolTimer = 0;
  const wanted: number[] = [];
  const updatePool = (dt: number) => {
    const level = cur.pool * cur.lamps;
    poolTimer -= dt;
    if (poolTimer <= 0) {
      poolTimer = 0.25;
      wanted.length = 0;
      if (level > 0.01 && lamps.length) {
        // nearest lamps to a point a little north of the player (what the camera sees most)
        const fx = focusX;
        const fz = focusZ + 3;
        const order = lamps.map((l, i) => ({ i, d: ((l.x - fx) ** 2 + (l.z - fz) ** 2) / (l.weight ?? 1) ** 2 })).filter((o) => o.d < 22 * 22);
        order.sort((a, b) => a.d - b.d);
        for (let i = 0; i < Math.min(POOL, order.length); i++) wanted.push(order[i].i);
      }
    }
    for (const pl of pool) {
      const keep = pl.lamp >= 0 && wanted.includes(pl.lamp);
      pl.f = keep ? Math.min(1, pl.f + dt * 2.5) : Math.max(0, pl.f - dt * 3);
      if (!keep && pl.f === 0) {
        const free = wanted.find((w) => !pool.some((o) => o.lamp === w));
        pl.lamp = free ?? -1;
        if (free !== undefined) {
          const l = lamps[free];
          pl.light.position.set(l.x, l.y + (l.h ?? 2.7), l.z - 0.15);
          pl.light.range = l.range ?? 10;
        }
      }
      pl.light.intensity = pl.lamp >= 0 ? level * pl.f * ((lamps[pl.lamp]?.weight ?? 1) > 1 ? 1.25 : 1) : 0;
    }
  };

  const onTime = (t: TimeOfDay) => apply(t);
  store.on("time", onTime);
  const onChanged = () => {
    if (store.state.timeOfDay !== current) apply();
  };
  store.on("changed", onChanged);
  apply(current, true);

  return {
    hemi,
    sun,
    shadows,
    poolSize: POOL,
    addCaster(mesh) {
      shadows?.addShadowCaster(mesh, false);
    },
    removeCaster(mesh) {
      shadows?.removeShadowCaster(mesh, false);
    },
    registerGlow(mat, litHex, darkHex = "#000000") {
      const e = { mat, lit: Color3.FromHexString(litHex), dark: Color3.FromHexString(darkHex) };
      glows.push(e);
      setGlow(e, lastGlow < 0 ? cur.lamps : lastGlow);
    },
    registerNightMesh(mesh) {
      nightMeshes.push(mesh);
      setNight(mesh, cur.lamps);
      return () => {
        const i = nightMeshes.indexOf(mesh);
        if (i >= 0) nightMeshes.splice(i, 1);
      };
    },
    setLamps(list) {
      lamps = list;
      for (const pl of pool) {
        pl.lamp = -1;
        pl.f = 0;
        pl.light.intensity = 0;
      }
      poolTimer = 0;
    },
    follow,
    apply,
    update(dt) {
      if (blend < 1) {
        blend = Math.min(1, blend + dt / BLEND_S);
        const t = blend * blend * (3 - 2 * blend);
        lerpLive(from, to, t, cur);
        push();
      }
      updatePool(dt);
    },
    atmosphere: () => atmo,
    onAtmosphere(fn) {
      atmoListeners.add(fn);
      fn(atmo);
      return () => atmoListeners.delete(fn);
    },
    isNight: () => (PRESETS[current]?.lamps ?? 0) > 0,
    dispose() {
      store.off("time", onTime);
      store.off("changed", onChanged);
      scene.onNewMaterialAddedObservable.remove(matObs);
      nightMeshes.length = 0;
      atmoListeners.clear();
      for (const pl of pool) pl.light.dispose();
      shadows?.dispose();
      sun.dispose();
      hemi.dispose();
    },
  };
}
