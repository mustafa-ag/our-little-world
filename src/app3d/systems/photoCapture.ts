// Phone camera for the 3D build: grabs the Babylon canvas as a small JPEG
// thumbnail. The save keeps only SavedPhoto metadata (see save.ts); pixels
// live in a separate, capped localStorage bucket so saves and cloud sync
// stay tiny. Missing pixels always degrade to a text Polaroid.
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { store } from "../../game/systems/store";
import { getLocation } from "../../game/data/locations";

const KEY = "olw3d.photoPixels.v1";
const MAX_IMAGES = 24;
const THUMB_W = 320;

type PixelBucket = Record<string, { at: number; src: string }>;

function readBucket(): PixelBucket {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as PixelBucket) : {};
  } catch {
    return {};
  }
}

function writeBucket(bucket: PixelBucket) {
  // drop the oldest until it fits (quota) or the cap is met
  const entries = Object.entries(bucket).sort((a, b) => a[1].at - b[1].at);
  while (entries.length > MAX_IMAGES) entries.shift();
  while (entries.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
      return true;
    } catch {
      entries.shift();
    }
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  return false;
}

export function photoImage(id: string): string | undefined {
  // only report pixels for photos that still exist in the save
  if (!store.state.photos[id]) return undefined;
  return readBucket()[id]?.src;
}

export function forgetPhotoImage(id: string) {
  const bucket = readBucket();
  if (!(id in bucket)) return;
  delete bucket[id];
  writeBucket(bucket);
}

/** Render one frame and read it back as a downscaled JPEG data URL. */
function grabFrame(): string | null {
  try {
    const scene = EngineStore.LastCreatedScene;
    const canvas = scene?.getEngine().getRenderingCanvas();
    if (!scene || !canvas || !scene.activeCamera || !canvas.width || !canvas.height) return null;
    // preserveDrawingBuffer is off: render and read back in the same task
    scene.render();
    const w = Math.min(THUMB_W, canvas.width);
    const h = Math.round((canvas.height / canvas.width) * w);
    const thumb = document.createElement("canvas");
    thumb.width = w;
    thumb.height = h;
    const g = thumb.getContext("2d");
    if (!g) return null;
    g.drawImage(canvas, 0, 0, w, h);
    const url = thumb.toDataURL("image/jpeg", 0.72);
    return url.startsWith("data:image/jpeg") ? url : null;
  } catch {
    return null;
  }
}

export interface SnapResult {
  id: string;
  withImage: boolean;
}

/**
 * Take a phone photo of the current view. Falls back to a text-only
 * "memory snap" (location + time) when the canvas can't be read.
 */
export function snapPhoto(): SnapResult | null {
  const s = store.state;
  const place = getLocation(s.currentLocation).name;
  const id = `snap_${s.currentDay}_${Date.now().toString(36)}`;
  const src = grabFrame();
  const participants = s.activeCompanionId ? [s.activeCompanionId] : undefined;
  const ok = store.capturePhoto({
    id,
    title: place,
    locationId: s.currentLocation,
    day: s.currentDay,
    timeOfDay: s.timeOfDay,
    companionId: s.activeCompanionId,
    participantIds: participants,
    pose: "smile",
    frame: "classic",
  });
  if (!ok) return null;
  let withImage = false;
  if (src) {
    const bucket = readBucket();
    bucket[id] = { at: Date.now(), src };
    withImage = writeBucket(bucket) && !!readBucket()[id];
  }
  return { id, withImage };
}
