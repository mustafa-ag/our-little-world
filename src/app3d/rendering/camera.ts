// Soft elevated third-person follow camera. Sits SOUTH of the target
// (negative Z, see world/coords.ts) looking north so the framing matches the
// 2D map. Fixed yaw, ~38 degrees downward pitch (36 on phones), damped follow, and a gentle
// clamped zoom on wheel / pinch. No orbit.

import type { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface FollowCamera {
  camera: TargetCamera;
  /** Move the look-at target (world units). */
  setTarget(x: number, z: number, snap?: boolean): void;
  /** Set the follow distance (clamped to the wheel/pinch range); snap = no easing. Used by screenshots/debug. */
  setDistance(d: number, snap?: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

const MIN_DIST = 7.5;
const MAX_DIST = 13;
/** How far above the feet the camera looks (keeps faces & façades framed). */
const LOOK_Y = 0.6;

export function createFollowCamera(scene: Scene, canvas: HTMLCanvasElement, isMobile: boolean): FollowCamera {
  const camera = new TargetCamera("follow", new Vector3(0, 10, -10), scene);
  const PITCH = ((isMobile ? 36 : 38) * Math.PI) / 180;
  camera.fov = isMobile ? 0.72 : 0.62;
  camera.minZ = 0.5;
  camera.maxZ = 260;
  scene.activeCamera = camera;

  let distance = isMobile ? 11.5 : 10.5;
  let targetDistance = distance;
  const target = new Vector3(0, 0, 0);
  const smoothTarget = target.clone();
  const lookAt = new Vector3();

  const place = () => {
    // portrait phones see a narrow slice: widen the view and pull back a bit
    const aspect = scene.getEngine().getAspectRatio(camera);
    const portrait = aspect < 1;
    camera.fov = portrait ? 0.9 : isMobile ? 0.72 : 0.62;
    const dist = distance * (portrait ? 1.05 : 1);
    const y = Math.sin(PITCH) * dist;
    const back = Math.cos(PITCH) * dist;
    camera.position.set(smoothTarget.x, smoothTarget.y + y, smoothTarget.z - back);
    lookAt.copyFrom(smoothTarget);
    lookAt.y += LOOK_Y;
    camera.setTarget(lookAt);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    targetDistance = Math.max(MIN_DIST, Math.min(MAX_DIST, targetDistance + Math.sign(e.deltaY) * 0.8));
  };
  let pinch = 0;
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !pinch) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    targetDistance = Math.max(MIN_DIST, Math.min(MAX_DIST, targetDistance - (d - pinch) * 0.02));
    pinch = d;
  };
  const onTouchEnd = () => (pinch = 0);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd);

  place();

  return {
    camera,
    setTarget(x, z, snap = false) {
      target.set(x, 0, z);
      if (snap) {
        smoothTarget.copyFrom(target);
        place();
      }
    },
    setDistance(d, snap = false) {
      targetDistance = Math.max(MIN_DIST, Math.min(MAX_DIST, d));
      if (snap) {
        distance = targetDistance;
        place();
      }
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * 6);
      smoothTarget.x += (target.x - smoothTarget.x) * k;
      smoothTarget.z += (target.z - smoothTarget.z) * k;
      distance += (targetDistance - distance) * Math.min(1, dt * 5);
      place();
    },
    dispose() {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      camera.dispose();
    },
  };
}
