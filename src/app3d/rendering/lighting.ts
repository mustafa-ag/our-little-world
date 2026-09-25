// Sky, sun, fog and shadows, driven by store.state.timeOfDay.
// Night stays cozy and readable (blue-ish ambient, warm lamps), never black.

import type { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene as SceneClass } from "@babylonjs/core/scene";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { store } from "../../game/systems/store";
import type { TimeOfDay } from "../../game/systems/save";

interface Preset {
  sky: string;
  fog: string;
  fogDensity: number;
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
  lamps: boolean;
}

// Storybook grading: warm, gently desaturated days; a golden evening with long
// soft shadows; a blue but readable night lit by warm lamps and windows.
const PRESETS: Record<TimeOfDay, Preset> = {
  morning: {
    sky: "#bfd5e6",
    fog: "#dfe3e0",
    fogDensity: 0.011,
    sunDir: new Vector3(-0.78, -0.5, 0.26),
    sunColor: "#ffe9c8",
    sunIntensity: 1.1,
    hemiSky: "#d4e0ea",
    hemiGround: "#b09070",
    hemiIntensity: 0.62,
    shadow: 0.6,
    exposure: 1.05,
    contrast: 1.08,
    vignette: 1.2,
    vignetteColor: "#3a2c24",
    lamps: false,
  },
  afternoon: {
    sky: "#b3cfe4",
    fog: "#d6dfe2",
    fogDensity: 0.009,
    sunDir: new Vector3(-0.55, -0.74, 0.3),
    sunColor: "#fff0d8",
    sunIntensity: 1.15,
    hemiSky: "#cddcea",
    hemiGround: "#b09070",
    hemiIntensity: 0.6,
    shadow: 0.62,
    exposure: 1.05,
    contrast: 1.08,
    vignette: 1.2,
    vignetteColor: "#3a2c24",
    lamps: false,
  },
  evening: {
    sky: "#e9b38f",
    fog: "#e8bc9c",
    fogDensity: 0.012,
    sunDir: new Vector3(0.78, -0.34, 0.4),
    sunColor: "#ffba78",
    sunIntensity: 1.05,
    hemiSky: "#dcb0b4",
    hemiGround: "#8a6a5c",
    hemiIntensity: 0.58,
    shadow: 0.66,
    exposure: 1.05,
    contrast: 1.07,
    vignette: 1.35,
    vignetteColor: "#3c2224",
    lamps: true,
  },
  night: {
    sky: "#34466c",
    fog: "#3d5076",
    fogDensity: 0.013,
    sunDir: new Vector3(0.35, -0.8, 0.45),
    sunColor: "#98b0e6",
    sunIntensity: 0.48,
    hemiSky: "#7890cc",
    hemiGround: "#5a4e5c",
    hemiIntensity: 0.7,
    shadow: 0.68,
    exposure: 1.12,
    contrast: 1.06,
    vignette: 1.5,
    vignetteColor: "#141a30",
    lamps: true,
  },
};

interface GlowEntry {
  mat: StandardMaterial;
  lit: Color3;
  dark: Color3;
}

export interface Lighting {
  hemi: HemisphericLight;
  sun: DirectionalLight;
  shadows: ShadowGenerator | null;
  /** Add a shadow caster (buildings, trees, characters near the camera). */
  addCaster(mesh: AbstractMesh): void;
  /** Materials whose emissive turns on in the evening/night (lamps, windows). */
  registerGlow(mat: StandardMaterial, litHex: string, darkHex?: string): void;
  /** Meshes shown only while lamps are lit (evening/night). */
  /** Show `mesh` only at night. Returns an unregister function. */
  registerNightMesh(mesh: AbstractMesh): () => void;
  /** Keep the shadow frustum centred on the player. */
  follow(x: number, z: number): void;
  apply(time?: TimeOfDay): void;
  isNight(): boolean;
  dispose(): void;
}

export function createLighting(scene: Scene, isMobile: boolean): Lighting {
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  const sun = new DirectionalLight("sun", PRESETS.afternoon.sunDir.clone(), scene);
  sun.position = new Vector3(0, 40, 0);
  sun.autoUpdateExtends = false;
  sun.shadowMinZ = 5;
  sun.shadowMaxZ = 90;
  const ext = 22;
  sun.orthoLeft = -ext;
  sun.orthoRight = ext;
  sun.orthoTop = ext;
  sun.orthoBottom = -ext;

  let shadows: ShadowGenerator | null = null;
  try {
    shadows = new ShadowGenerator(isMobile ? 1024 : 2048, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = isMobile ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
    shadows.bias = 0.0015;
    shadows.normalBias = 0.02;
    shadows.darkness = 0.6;
    shadows.transparencyShadow = false;
  } catch {
    shadows = null;
  }

  // colour grading inside the material shaders (no extra post-process pass)
  const ip = scene.imageProcessingConfiguration;
  ip.isEnabled = true;
  ip.vignetteEnabled = true;
  ip.vignetteStretch = 0.6;
  ip.vignetteCameraFov = 0.8;
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  ip.toneMappingEnabled = false;

  scene.fogMode = SceneClass.FOGMODE_EXP2;
  scene.fogStart = 30;
  scene.fogEnd = 90;

  const glows: GlowEntry[] = [];
  const nightMeshes: AbstractMesh[] = [];
  let current: TimeOfDay = store.state.timeOfDay;
  let focus = { x: 0, z: 0 };

  const apply = (time: TimeOfDay = store.state.timeOfDay) => {
    current = time;
    const p = PRESETS[time] ?? PRESETS.afternoon;
    scene.clearColor = Color4.FromHexString(p.sky + "ff");
    scene.fogColor = Color3.FromHexString(p.fog);
    scene.fogDensity = p.fogDensity;
    scene.ambientColor = Color3.FromHexString(p.hemiSky).scale(0.22);
    sun.direction = p.sunDir.clone().normalize();
    sun.diffuse = Color3.FromHexString(p.sunColor);
    sun.specular = Color3.Black();
    sun.intensity = p.sunIntensity;
    hemi.diffuse = Color3.FromHexString(p.hemiSky);
    hemi.groundColor = Color3.FromHexString(p.hemiGround);
    hemi.specular = Color3.Black();
    hemi.intensity = p.hemiIntensity;
    if (shadows) shadows.darkness = p.shadow;
    const ip = scene.imageProcessingConfiguration;
    ip.exposure = p.exposure;
    ip.contrast = p.contrast;
    ip.vignetteWeight = p.vignette;
    const vc = Color3.FromHexString(p.vignetteColor);
    ip.vignetteColor.set(vc.r, vc.g, vc.b, 1);
    for (const g of glows) {
      g.mat.unfreeze();
      g.mat.emissiveColor = p.lamps ? g.lit : g.dark;
      g.mat.freeze();
    }
    for (const m of nightMeshes) m.setEnabled(p.lamps);
    follow(focus.x, focus.z);
  };

  const follow = (x: number, z: number) => {
    focus = { x, z };
    const d = sun.direction;
    // the camera looks north, so centre the shadow frustum a little ahead
    sun.position.set(x - d.x * 45, -d.y * 45, z + 3 - d.z * 45);
  };

  const onTime = (t: TimeOfDay) => apply(t);
  store.on("time", onTime);
  const onChanged = () => apply();
  store.on("changed", onChanged);
  apply();

  return {
    hemi,
    sun,
    shadows,
    addCaster(mesh) {
      shadows?.addShadowCaster(mesh, false);
    },
    registerGlow(mat, litHex, darkHex = "#000000") {
      const e = { mat, lit: Color3.FromHexString(litHex), dark: Color3.FromHexString(darkHex) };
      glows.push(e);
      const p = PRESETS[current];
      mat.unfreeze();
      mat.emissiveColor = p.lamps ? e.lit : e.dark;
      mat.freeze();
    },
    registerNightMesh(mesh) {
      nightMeshes.push(mesh);
      mesh.setEnabled(PRESETS[current].lamps);
      return () => {
        const i = nightMeshes.indexOf(mesh);
        if (i >= 0) nightMeshes.splice(i, 1);
      };
    },
    follow,
    apply,
    isNight: () => PRESETS[current].lamps,
    dispose() {
      store.off("time", onTime);
      store.off("changed", onChanged);
      nightMeshes.length = 0;
      shadows?.dispose();
      sun.dispose();
      hemi.dispose();
    },
  };
}
