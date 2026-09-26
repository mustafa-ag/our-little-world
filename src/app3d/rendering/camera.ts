// Soft elevated third-person follow camera. Sits SOUTH of the target
// (negative Z, see world/coords.ts) looking north so the framing matches the
// 2D map. Fixed yaw, no orbit.
//
// Composition (storybook "diorama" framing, see docs/VISUAL_STYLE.md):
//  - the camera sits `elev` degrees above the player (27 deg desktop, a bit
//    higher in portrait) at `distance`;
//  - it looks at a point `lookY` above the ground and `lookAhead` units north
//    of the player (plus a slow, damped nudge in the walking direction), so
//    the view axis is shallower than the elevation: the player sits in the
//    lower half of the frame, façades read, and a band of sky / distant hills
//    shows at the top of the frame;
//  - zoom (wheel / pinch) moves along a short arc: closer = a touch lower.
// All motion is exponentially damped (no snapping, no bob) to avoid motion
// sickness.

import type { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface CameraTuning {
  /** Elevation of the camera above the player, degrees. */
  elev: number;
  /** Vertical field of view, radians (landscape). */
  fov: number;
  /** Look-at height above the ground. */
  lookY: number;
  /** Look-at offset north of the player (world units). */
  lookAhead: number;
  /** Max extra look-ahead in the walking direction. */
  lead: number;
}

export interface FollowCamera {
  camera: TargetCamera;
  /** Move the look-at target (world units). */
  setTarget(x: number, z: number, snap?: boolean): void;
  /** Set the follow distance (clamped to the wheel/pinch range); snap = no easing. Used by screenshots/debug. */
  setDistance(d: number, snap?: boolean): void;
  /** Override composition numbers (debug / screenshots); returns the active tuning. */
  tune(t: Partial<CameraTuning>): CameraTuning;
  /** Drop every tune() override (back to the device's default composition). */
  clearTune(): void;
  /** Current target follow distance (wheel / pinch / setDistance). */
  getDistance(): number;
  /** The player point the camera frames (feet), for occlusion tests. */
  readonly focus: Vector3;
  update(dt: number): void;
  dispose(): void;
}

const MIN_DIST = 7.5;
const MAX_DIST = 15;

// Tested 25-32 deg (docs/screenshots/wip/w1-cam*): ~27 deg with a 0.8 rad fov
// and a look point 3.5 m ahead keeps façades square-on, leaves a band of
// sky / hills at the top and puts Juju just below the frame centre.
const DESKTOP: CameraTuning = { elev: 27, fov: 0.8, lookY: 1.0, lookAhead: 3.5, lead: 1.5 };
const PHONE: CameraTuning = { elev: 28, fov: 0.84, lookY: 1.0, lookAhead: 3.5, lead: 1.3 };
/** Portrait phones see a narrow slice: a little higher and wider. */
const PORTRAIT: CameraTuning = { elev: 30, fov: 1.0, lookY: 1.0, lookAhead: 4.2, lead: 1.1 };

export function createFollowCamera(scene: Scene, canvas: HTMLCanvasElement, isMobile: boolean): FollowCamera {
  const camera = new TargetCamera("follow", new Vector3(0, 10, -10), scene);
  camera.minZ = 0.5;
  camera.maxZ = 520; // the sky dome / far skyline live out to ~400
  scene.activeCamera = camera;

  const base = isMobile ? PHONE : DESKTOP;
  let override: Partial<CameraTuning> = {};
  const tuningFor = (portrait: boolean): CameraTuning => ({ ...(portrait ? PORTRAIT : base), ...override });

  const defaultDist = isMobile ? 10.5 : 10;
  let distance = defaultDist;
  let targetDistance = distance;
  const target = new Vector3(0, 0, 0);
  const smoothTarget = target.clone();
  const lastTarget = target.clone();
  // damped look-ahead in the walking direction
  const lead = new Vector3();
  const leadGoal = new Vector3();
  const lookAt = new Vector3();
  const focus = new Vector3();

  const place = () => {
    const aspect = scene.getEngine().getAspectRatio(camera);
    const portrait = aspect < 0.9;
    const t = tuningFor(portrait);
    camera.fov = t.fov;
    const dist = distance * (portrait ? 1.08 : 1);
    // zooming in lowers the camera a little (more "in the street"), out raises it
    const elev = ((t.elev + (distance - defaultDist) * 0.9) * Math.PI) / 180;
    const y = Math.sin(elev) * dist;
    const back = Math.cos(elev) * dist;
    camera.position.set(smoothTarget.x + lead.x * 0.35, smoothTarget.y + y, smoothTarget.z - back + lead.z * 0.35);
    lookAt.set(smoothTarget.x + lead.x, smoothTarget.y + t.lookY, smoothTarget.z + t.lookAhead + lead.z);
    camera.setTarget(lookAt);
    focus.copyFrom(smoothTarget);
  };

  const clampD = (d: number) => Math.max(MIN_DIST, Math.min(MAX_DIST, d));
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    targetDistance = clampD(targetDistance + Math.sign(e.deltaY) * 0.9);
  };
  let pinch = 0;
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !pinch) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    targetDistance = clampD(targetDistance - (d - pinch) * 0.02);
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
    focus,
    setTarget(x, z, snap = false) {
      target.set(x, 0, z);
      if (snap) {
        smoothTarget.copyFrom(target);
        lastTarget.copyFrom(target);
        lead.setAll(0);
        leadGoal.setAll(0);
        place();
      }
    },
    setDistance(d, snap = false) {
      targetDistance = clampD(d);
      if (snap) {
        distance = targetDistance;
        place();
      }
    },
    tune(t) {
      override = { ...override, ...t };
      place();
      return tuningFor(scene.getEngine().getAspectRatio(camera) < 0.9);
    },
    clearTune() {
      override = {};
      place();
    },
    getDistance() {
      return targetDistance;
    },
    update(dt) {
      if (dt <= 0) return;
      // walking direction -> a slow look-ahead (moving south pulls the frame back
      // so the player can see where they're going)
      const vx = (target.x - lastTarget.x) / dt;
      const vz = (target.z - lastTarget.z) / dt;
      lastTarget.copyFrom(target);
      const sp = Math.hypot(vx, vz);
      const t = tuningFor(scene.getEngine().getAspectRatio(camera) < 0.9);
      if (sp > 0.5 && sp < 40) leadGoal.set((vx / sp) * t.lead, 0, (vz / sp) * t.lead * (vz < 0 ? 1.6 : 1));
      else if (sp <= 0.5) leadGoal.scaleInPlace(Math.exp(-dt * 0.8));
      const kl = 1 - Math.exp(-dt * 1.4);
      lead.x += (leadGoal.x - lead.x) * kl;
      lead.z += (leadGoal.z - lead.z) * kl;

      const k = 1 - Math.exp(-dt * 6);
      smoothTarget.x += (target.x - smoothTarget.x) * k;
      smoothTarget.z += (target.z - smoothTarget.z) * k;
      distance += (targetDistance - distance) * (1 - Math.exp(-dt * 5));
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
