import type { Engine } from "@babylonjs/core/Engines/engine";

export type GraphicsQuality = "auto" | "high" | "medium" | "low";
export type FrameRatePreference = 60 | 30 | "uncapped";

export interface GraphicsSettings {
  quality: GraphicsQuality;
  frameRate: FrameRatePreference;
  dynamicResolution: boolean;
}

export interface QualityProfile {
  id: Exclude<GraphicsQuality, "auto">;
  label: string;
  maxRenderDpr: number;
  minRenderDpr: number;
  shadowMapSize: number;
  shadowQuality: "medium" | "low";
  pointLights: number;
}

const STORAGE_KEY = "olw.graphics.v1";
const DEFAULTS: GraphicsSettings = { quality: "auto", frameRate: 60, dynamicResolution: true };

export const QUALITY_PROFILES: Record<QualityProfile["id"], QualityProfile> = {
  high: { id: "high", label: "High", maxRenderDpr: 2, minRenderDpr: 1.25, shadowMapSize: 2048, shadowQuality: "medium", pointLights: 4 },
  medium: { id: "medium", label: "Medium", maxRenderDpr: 1.35, minRenderDpr: 0.9, shadowMapSize: 1024, shadowQuality: "low", pointLights: 2 },
  low: { id: "low", label: "Low", maxRenderDpr: 1, minRenderDpr: 0.75, shadowMapSize: 512, shadowQuality: "low", pointLights: 1 },
};

function validSettings(value: unknown): GraphicsSettings {
  if (!value || typeof value !== "object") return { ...DEFAULTS };
  const v = value as Partial<GraphicsSettings>;
  const quality = v.quality === "high" || v.quality === "medium" || v.quality === "low" || v.quality === "auto" ? v.quality : "auto";
  const frameRate = v.frameRate === 30 || v.frameRate === 60 || v.frameRate === "uncapped" ? v.frameRate : 60;
  return { quality, frameRate, dynamicResolution: v.dynamicResolution !== false };
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    return validSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveGraphicsSettings(settings: GraphicsSettings) {
  const clean = validSettings(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage may be unavailable in private/embedded browsing; settings still
    // apply for the current session through QualityController.
  }
  return clean;
}

/** Capability/viewport based initial choice. No user-agent sniffing. */
export function chooseAutoQuality(): QualityProfile["id"] {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? 4;
  const pixels = innerWidth * innerHeight * Math.min(devicePixelRatio || 1, 3) ** 2;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (cores <= 4 || memory <= 3 || pixels > 7_000_000) return "low";
  if (coarse || cores <= 6 || memory <= 5 || pixels > 3_500_000) return "medium";
  return "high";
}

export class QualityController {
  settings: GraphicsSettings;
  profile: QualityProfile;
  private renderDpr = 1;
  private lowFor = 0;
  private highFor = 0;
  private sampleFor = 0;

  constructor(private readonly engine: Engine, initial = loadGraphicsSettings()) {
    this.settings = validSettings(initial);
    this.profile = QUALITY_PROFILES[this.settings.quality === "auto" ? chooseAutoQuality() : this.settings.quality];
    this.applyDpr(Math.min(devicePixelRatio || 1, this.profile.maxRenderDpr));
  }

  get label() {
    const requested = this.settings.quality === "auto" ? `Auto → ${this.profile.label}` : this.profile.label;
    return `${requested} · ${this.renderDpr.toFixed(2)}×`;
  }

  get frameIntervalMs() {
    return this.settings.frameRate === "uncapped" ? 0 : 1000 / this.settings.frameRate;
  }

  set(settings: GraphicsSettings) {
    this.settings = saveGraphicsSettings(settings);
    this.profile = QUALITY_PROFILES[this.settings.quality === "auto" ? chooseAutoQuality() : this.settings.quality];
    this.lowFor = this.highFor = this.sampleFor = 0;
    this.applyDpr(Math.min(devicePixelRatio || 1, this.profile.maxRenderDpr));
  }

  /** Conservative 1 Hz sampling with 6 s down / 18 s up hysteresis. */
  update(dt: number) {
    if (this.settings.quality !== "auto" || !this.settings.dynamicResolution || document.hidden) return;
    this.sampleFor += dt;
    if (this.sampleFor < 1) return;
    const elapsed = this.sampleFor;
    this.sampleFor = 0;
    const fps = this.engine.getFps();
    const target = this.settings.frameRate === 30 ? 30 : 60;
    if (fps < target * 0.8) {
      this.lowFor += elapsed;
      this.highFor = 0;
    } else if (fps > target * 0.96) {
      this.highFor += elapsed;
      this.lowFor = 0;
    } else {
      this.lowFor = Math.max(0, this.lowFor - elapsed);
      this.highFor = Math.max(0, this.highFor - elapsed);
    }
    if (this.lowFor >= 6 && this.renderDpr > this.profile.minRenderDpr + 0.02) {
      this.applyDpr(Math.max(this.profile.minRenderDpr, this.renderDpr - 0.15));
      this.lowFor = 0;
    } else if (this.highFor >= 18) {
      const max = Math.min(devicePixelRatio || 1, this.profile.maxRenderDpr);
      if (this.renderDpr < max - 0.02) this.applyDpr(Math.min(max, this.renderDpr + 0.1));
      this.highFor = 0;
    }
  }

  private applyDpr(dpr: number) {
    this.renderDpr = Math.max(0.5, dpr);
    this.engine.setHardwareScalingLevel(1 / this.renderDpr);
    this.engine.resize();
  }
}
