export type VisualRenderClass =
  | "pixel-character"
  | "hd-terrain"
  | "hd-building"
  | "hd-prop"
  | "hd-foliage"
  | "hd-interior"
  | "hd-vehicle"
  | "hd-ui"
  | "hd-effect";

export type VisualFilter = "nearest" | "linear";
export type VisualSourceType = "procedural" | "svg" | "image" | "alias";
export type VisualAuditState = "FINAL_HD" | "FINAL_PIXEL_CHARACTER" | "PARTIAL" | "LEGACY_FALLBACK" | "MISSING" | "TEMPORARY" | "UNUSED";
export type VisualShadowType = "none" | "contact" | "cast" | "both";

export interface VisualShadowDef {
  shadowEnabled: boolean;
  shadowType: VisualShadowType;
  shadowLength?: number;
  shadowDirectionX?: number;
  shadowDirectionY?: number;
  shadowOpacity?: number;
  shadowScale?: number;
  shadowOrigin?: { x: number; y: number };
}

export interface VisualAssetDef {
  /** Logical gameplay key. Scenes resolve this key instead of source-specific texture names. */
  key: string;
  textureKey: string;
  sourceType: VisualSourceType;
  sourcePath?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  /** Boot assets are needed for the first playable scene; deferred art avoids mobile GPU pressure. */
  preload?: "boot" | "deferred";
  renderClass: VisualRenderClass;
  filter: VisualFilter;
  auditState: VisualAuditState;
  fallbackKey?: string;
  shadow?: VisualShadowDef;
}
