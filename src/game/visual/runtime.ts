import Phaser from "phaser";
import { ALLOW_LEGACY_ENVIRONMENT_FALLBACK, getVisualAssetDef, requiredFilter, VISUAL_ASSETS } from "./catalog";
import type { VisualAssetDef } from "./types";

const isDevelopment = import.meta.env.DEV;
const queuedHdKeys = new Set<string>();

function report(message: string) {
  if (isDevelopment) console.warn(`[visual] ${message}`);
}

function reportCritical(message: string) {
  if (isDevelopment) console.error(`[visual] ${message}`);
}

/** Queue only manifest-marked boot assets during Scene.preload. Procedural fallback remains built in create. */
export function queueVisualAssets(scene: Phaser.Scene) {
  const expectedHdKeys = new Set<string>();
  queuedHdKeys.clear();

  for (const asset of VISUAL_ASSETS) {
    if (asset.sourceType === "procedural" || asset.sourceType === "alias") continue;
    if (asset.preload !== "boot") continue;
    if (!asset.sourcePath || !asset.filter) {
      report(`Skipping invalid manifest entry "${asset.key}": sourcePath and filter are required.`);
      continue;
    }
    expectedHdKeys.add(asset.textureKey);
    queuedHdKeys.add(asset.textureKey);
    const extension = asset.sourcePath.split(".").pop()?.toLowerCase();
    if (extension === "svg") {
      scene.load.svg(asset.textureKey, asset.sourcePath, { width: asset.sourceWidth, height: asset.sourceHeight });
    } else if (extension === "png" || extension === "webp") {
      scene.load.image(asset.textureKey, asset.sourcePath);
    } else {
      report(`Unsupported asset type for "${asset.key}": ${asset.sourcePath}`);
    }
  }

  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    if (expectedHdKeys.has(file.key)) report(`Expected HD asset failed to load: "${file.key}".`);
  });
}

/** Apply per-asset filtering after Phaser has created the texture objects. */
export function applyVisualFilters(scene: Phaser.Scene) {
  for (const asset of VISUAL_ASSETS) {
    applyVisualFilter(scene, asset);
  }
  // Character sheets are generated from NPC data, so they are resolved dynamically.
  for (const texture of scene.textures.getTextureKeys()) {
    if (texture.startsWith("char_")) {
      scene.textures.get(texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

export function applyVisualFilter(scene: Phaser.Scene, asset: VisualAssetDef) {
  if (!asset.filter) {
    report(`Visual asset "${asset.key}" is missing filter metadata.`);
    return;
  }
  if (!scene.textures.exists(asset.textureKey)) return;
  const mode = asset.filter === "nearest" ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;
  scene.textures.get(asset.textureKey).setFilter(mode);
  if (asset.filter !== requiredFilter(asset.renderClass)) {
    report(`Visual asset "${asset.key}" has an explicit filter exception: ${asset.filter}.`);
  }
}

/** The authoritative mapping from a gameplay visual key to a Phaser texture key. */
export function getVisualTexture(scene: Phaser.Scene, gameplayKey: string): string {
  const asset = getVisualAssetDef(gameplayKey);
  if (!asset) {
    report(`Visual key "${gameplayKey}" bypassed the registry or has not been registered.`);
    return gameplayKey;
  }
  if (!scene.textures.exists(asset.textureKey)) {
    report(`Visual key "${gameplayKey}" resolved to missing texture "${asset.textureKey}".`);
  }
  if (!ALLOW_LEGACY_ENVIRONMENT_FALLBACK && asset.auditState === "LEGACY_FALLBACK" && asset.renderClass !== "pixel-character") {
    reportCritical(`ENVIRONMENT VISUAL REQUIRED: "${gameplayKey}" still resolves to procedural legacy fallback. Register a FINAL_HD replacement.`);
  }
  return asset.textureKey;
}

/** Development-only completion check for the manifest-backed preload pass. */
export function diagnoseVisualAssets(scene: Phaser.Scene) {
  if (!isDevelopment) return;
  for (const key of queuedHdKeys) {
    if (!scene.textures.exists(key)) report(`Expected HD asset is missing after preload: "${key}".`);
  }
  if (!ALLOW_LEGACY_ENVIRONMENT_FALLBACK) {
    for (const asset of VISUAL_ASSETS) {
      if (asset.auditState === "LEGACY_FALLBACK" && asset.renderClass !== "pixel-character") {
        reportCritical(`ENVIRONMENT VISUAL REQUIRED: "${asset.key}" remains procedural legacy fallback. Register a FINAL_HD replacement.`);
      }
    }
  }
}
