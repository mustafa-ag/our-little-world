// Third-person orbit camera with a FREE and a LOCK mode (replaces the old
// fixed-yaw follow camera in rendering/camera.ts).
//
// Orbit maths (world/coords.ts axes: +X east, +Y up, +Z north): the camera sits
// on a sphere around a look point at chest height above Juju:
//   position = look + radius * (cos(alpha) sin(beta), cos(beta), sin(alpha) sin(beta))
// alpha = -PI/2 puts the camera SOUTH of Juju looking north (the old framing);
// beta is measured from straight up (0 = overhead, PI/2 = level).
// A plain TargetCamera is placed by hand every frame (no ArcRotateCamera: its
// position/target setters rebuild the angles, and the sky, backdrop and
// occlusion need the final position in the same frame).
//
// Input (all on the canvas, which the pointer-events:none DOM layer lets through):
//  - mouse: right or middle drag orbits, wheel zooms, double right-click resets;
//  - touch: one finger orbits, two fingers pinch-zoom and twist alpha,
//    double-tap resets;
//  - keys: Tab toggles FREE / LOCK, R resets (both ignored while the UI owns
//    the keyboard or `controls.locked` is set).
// FREE: the camera stays where the player put it. LOCK: alpha turns toward
// Juju's heading at LOCK_RATE; manual orbit overrides it and it drifts back
// after MANUAL_HOLD_MS. On desktop LOCK asks for pointer lock (mouse look).
//
// Collision: every frame a ray from the look point toward the wanted camera
// position is slab-tested against the building AABBs (setColliders: the same
// boxes the occlusion fade uses, so thin-instanced buildings count and Juju is
// never in the list). A hit pulls the radius in to hit - COLLISION_MARGIN
// (eased in quickly, out slowly); the camera also never dips below the ground.
//
// The HUD talks over uiEvents: it emits "cameraToggleLock" / "cameraReset" and
// listens to "cameraMode" (mode) for the FREE / LOCK indicator.

import type { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { controls, uiEvents } from "../../game/systems/controls";

export type CameraMode = "free" | "lock";

/** Composition overrides (interior / road trip / debug). */
export interface CameraTuning {
  /** Default elevation of the camera above the look point, degrees (sets beta). */
  elev: number;
  /** Vertical field of view, radians (landscape). */
  fov: number;
  /** Look point height above Juju's feet. */
  lookY: number;
  /** Look point offset along the camera's ground-projected forward. */
  lookAhead: number;
  /** Max extra look-ahead in the walking direction. */
  lead: number;
}

/** Chest height of the look point (Juju is ~1.05 u tall). */
export const CAMERA_TARGET_Y = 0.7;
export const DEFAULT_ALPHA = -Math.PI / 2;
export const DEFAULT_BETA = Math.PI / 3.5;
export const DEFAULT_RADIUS = 6;
/** Beta limits: 0.1 = nearly overhead, PI/2.2 = just above level (never under the ground). */
export const MIN_BETA = 0.1;
export const MAX_BETA = Math.PI / 2.2;
export const MIN_RADIUS = 1.5;
export const MAX_RADIUS = 12;

/** LOCK mode: max turn rate of alpha toward Juju's heading (rad/s). */
const LOCK_RATE = 3;
/** LOCK mode: slower drift back once a manual orbit is released. */
const RETURN_RATE = 1.6;
/** LOCK mode: while moving, only follow headings within this angle of the view. */
const LOCK_MAX_CHASE = 2.2;
/** LOCK mode: grace period after the last manual orbit before auto-follow resumes. */
const MANUAL_HOLD_MS = 900;
/** Collision: keep the camera this far in front of whatever it hit. */
const COLLISION_MARGIN = 0.3;
/** Collision never pulls the camera closer than this. */
const COLLISION_MIN = 0.8;
/** Keep the lens this far above the ground. */
const GROUND_CLEARANCE = 0.35;
const DOUBLE_TAP_MS = 320;

const MOUSE_ALPHA = 0.0055;
const MOUSE_BETA = 0.0045;
const TOUCH_ALPHA = 0.008;
const TOUCH_BETA = 0.006;

const FREE: CameraTuning = { elev: 90 - (DEFAULT_BETA * 180) / Math.PI, fov: 0.8, lookY: CAMERA_TARGET_Y, lookAhead: 0, lead: 0 };
const PHONE_FOV = 0.86;
/** Portrait phones see a narrow slice: wider lens, a touch further out. */
const PORTRAIT_FOV = 1.0;

export interface CameraBox {
  min: Vector3;
  max: Vector3;
}

export interface CameraControllerOptions {
  isMobile: boolean;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Alpha that puts the camera behind a mesh facing `yaw` (yaw = atan2(dx, dz)). */
export const alphaBehind = (yaw: number) => Math.atan2(-Math.cos(yaw), -Math.sin(yaw));

export class CameraController {
  readonly camera: TargetCamera;
  /** The player point the camera frames (feet), for occlusion tests. */
  readonly focus = new Vector3();

  private mode: CameraMode = "free";
  /** Player-requested orbit (the camera eases toward these). */
  private goalAlpha = DEFAULT_ALPHA;
  private goalBeta = DEFAULT_BETA;
  private goalRadius = DEFAULT_RADIUS;
  /** Rendered orbit. */
  private alpha = DEFAULT_ALPHA;
  private beta = DEFAULT_BETA;
  private radius = DEFAULT_RADIUS;

  private readonly target = new Vector3();
  private readonly smoothTarget = new Vector3();
  private readonly lastTarget = new Vector3();
  private readonly lead = new Vector3();
  private readonly leadGoal = new Vector3();
  private readonly look = new Vector3();
  private readonly dir = new Vector3();
  private heading = Math.PI; // Juju's yaw (facing south on spawn)

  private override: Partial<CameraTuning> = {};
  private stash: { alpha: number; beta: number } | null = null;
  private orbitEnabled = true;
  private alphaRange: [number, number] | null = null;
  private collisionEnabled = true;
  private colliders: CameraBox[] = [];
  private groundAt: ((x: number, z: number) => number) | null = null;

  // input state
  private readonly touches = new Map<number, { x: number; y: number; t0: number; x0: number; y0: number }>();
  private mouseDrag: number | null = null; // pointerId of the right/middle drag
  private pinchDist = 0;
  private pinchAngle = 0;
  private lastRightDown = 0;
  private lastTap = { t: 0, x: 0, y: 0 };
  private manualUntil = 0;
  private resetting = false;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: CameraControllerOptions,
  ) {
    const camera = new TargetCamera("follow", new Vector3(0, 10, -10), scene);
    camera.minZ = 0.3; // close zoom + collision pull-in; keeps depth precision out to maxZ
    camera.maxZ = 520; // the sky dome / far skyline live out to ~400
    scene.activeCamera = camera;
    this.camera = camera;
    this.bindInput();
    this.place();
  }

  // ---------------------------------------------------------------- public API

  get cameraMode(): CameraMode {
    return this.mode;
  }

  /**
   * Yaw the camera looks along, projected on the ground (same convention as
   * coords.yawFor: 0 = north, PI/2 = east). Feed it to the PlayerController so
   * WASD / the joystick move relative to the view.
   */
  get viewYaw(): number {
    return Math.atan2(-Math.cos(this.alpha), -Math.sin(this.alpha));
  }

  /** Move the followed point (Juju's feet or the car); y = ground height. */
  setTarget(x: number, z: number, snap = false, y = 0) {
    this.target.set(x, y, z);
    if (snap) {
      this.smoothTarget.copyFrom(this.target);
      this.lastTarget.copyFrom(this.target);
      this.lead.setAll(0);
      this.leadGoal.setAll(0);
      this.alpha = this.goalAlpha;
      this.beta = this.goalBeta;
      this.radius = Math.min(this.goalRadius, this.collisionLimit(this.goalRadius));
      this.place();
    }
  }

  /** Juju's facing yaw (LOCK mode turns behind it, reset snaps behind it). */
  setHeading(yaw: number) {
    this.heading = yaw;
  }

  /** Follow distance (orbit radius), clamped to the zoom range; snap = no easing. */
  setDistance(d: number, snap = false) {
    this.goalRadius = clamp(d, MIN_RADIUS, MAX_RADIUS);
    if (snap) {
      this.radius = this.goalRadius;
      this.place();
    }
  }

  getDistance() {
    return this.goalRadius;
  }

  /**
   * Override the composition (interior / drive / screenshots). `elev` resets
   * the pitch and the view to the classic "looking north" framing.
   */
  tune(t: Partial<CameraTuning>): CameraTuning {
    // remember the free-roam orbit so clearTune() hands it back
    if (!this.stash && t.elev !== undefined) this.stash = { alpha: this.goalAlpha, beta: this.goalBeta };
    this.override = { ...this.override, ...t };
    if (t.elev !== undefined) {
      this.goalBeta = this.beta = this.betaFor(this.tuning().elev);
      this.goalAlpha = this.alpha = DEFAULT_ALPHA;
    }
    this.place();
    return this.tuning();
  }

  /** Drop every tune() override (back to the free-roam composition and orbit). */
  clearTune() {
    this.override = {};
    const s = this.stash;
    this.stash = null;
    this.goalBeta = this.beta = s ? s.beta : DEFAULT_BETA;
    this.goalAlpha = this.alpha = s ? s.alpha : alphaBehind(this.heading);
    this.place();
  }

  /** Player orbit on/off (off on the road trip: the view is scripted). */
  setOrbitEnabled(on: boolean) {
    this.orbitEnabled = on;
    if (!on) {
      this.touches.clear();
      this.mouseDrag = null;
      this.releasePointerLock();
    }
  }

  /** Limit alpha to [min, max] (the three-walled interior), or null for a full circle. */
  setAlphaRange(range: [number, number] | null) {
    this.alphaRange = range;
    this.goalAlpha = this.clampAlpha(this.goalAlpha);
  }

  /** Building AABBs the camera must not pass through (empty = no collision). */
  setColliders(boxes: CameraBox[]) {
    this.colliders = boxes;
  }

  setCollisionEnabled(on: boolean) {
    this.collisionEnabled = on;
  }

  /** Terrain height lookup (keeps the lens above hills). */
  setGround(fn: ((x: number, z: number) => number) | null) {
    this.groundAt = fn;
  }

  setMode(mode: CameraMode, fromGesture = false) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "lock") {
      this.manualUntil = 0;
      // pointer lock needs a user gesture (Tab / the HUD button click)
      if (fromGesture) this.requestPointerLock();
    } else {
      this.releasePointerLock();
    }
    uiEvents.emit("cameraMode", mode);
  }

  toggleMode(fromGesture = false) {
    this.setMode(this.mode === "free" ? "lock" : "free", fromGesture);
  }

  /** Swing back behind Juju at the default pitch (eased, not a cut). */
  reset() {
    if (!this.orbitEnabled) return;
    this.goalAlpha = this.clampAlpha(this.alpha + wrap(alphaBehind(this.heading) - this.alpha));
    this.goalBeta = this.betaFor(this.tuning().elev);
    this.manualUntil = 0;
    this.resetting = true;
  }

  update(dt: number) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const now = performance.now();
    if (controls.locked && this.pointerLocked) this.releasePointerLock();

    // walking direction -> optional look-ahead (drive / tuned framings)
    const t = this.tuning();
    const vx = (this.target.x - this.lastTarget.x) / dt;
    const vz = (this.target.z - this.lastTarget.z) / dt;
    this.lastTarget.copyFrom(this.target);
    const sp = Math.hypot(vx, vz);
    if (t.lead > 0 && sp > 0.5 && sp < 40) this.leadGoal.set((vx / sp) * t.lead, 0, (vz / sp) * t.lead);
    else if (sp <= 0.5 || t.lead <= 0) this.leadGoal.scaleInPlace(Math.exp(-dt * 0.8));
    const kl = 1 - Math.exp(-dt * 1.4);
    this.lead.x += (this.leadGoal.x - this.lead.x) * kl;
    this.lead.z += (this.leadGoal.z - this.lead.z) * kl;

    // LOCK: turn behind Juju unless the player is (or just was) orbiting
    const manual = this.mouseDrag !== null || this.touches.size > 0 || now < this.manualUntil;
    if (this.mode === "lock" && this.orbitEnabled && !manual && !this.resetting) {
      const want = alphaBehind(this.heading);
      const diff = wrap(want - this.goalAlpha);
      const moving = sp > 0.3;
      // running at the camera (S held): don't chase a 180 swing, or the
      // camera-relative controls would spin her in circles
      if (!moving || Math.abs(diff) < LOCK_MAX_CHASE) {
        const rate = moving ? LOCK_RATE : RETURN_RATE;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
        this.goalAlpha = this.clampAlpha(this.goalAlpha + step);
      }
    }

    // ease the rendered orbit toward the goal (a reset swings a little slower)
    const ka = 1 - Math.exp(-dt * (this.resetting ? 7 : 16));
    this.alpha += wrap(this.goalAlpha - this.alpha) * ka;
    this.beta += (this.goalBeta - this.beta) * ka;
    if (this.resetting && Math.abs(wrap(this.goalAlpha - this.alpha)) < 0.01) this.resetting = false;
    this.alpha = wrap(this.alpha);
    this.goalAlpha = this.alpha + wrap(this.goalAlpha - this.alpha);

    const kt = 1 - Math.exp(-dt * 10);
    this.smoothTarget.x += (this.target.x - this.smoothTarget.x) * kt;
    this.smoothTarget.y += (this.target.y - this.smoothTarget.y) * kt;
    this.smoothTarget.z += (this.target.z - this.smoothTarget.z) * kt;

    // collision: pull in fast, ease back out slowly
    const want = Math.min(this.goalRadius, this.collisionLimit(this.goalRadius));
    const kr = 1 - Math.exp(-dt * (want < this.radius ? 14 : 3));
    this.radius += (want - this.radius) * kr;
    this.place();
  }

  dispose() {
    for (const f of this.off) f();
    this.off.length = 0;
    this.releasePointerLock();
    this.camera.dispose();
  }

  // ---------------------------------------------------------------- placement

  private tuning(): CameraTuning {
    const portrait = this.scene.getEngine().getAspectRatio(this.camera) < 0.9;
    const fov = portrait ? PORTRAIT_FOV : this.opts.isMobile ? PHONE_FOV : FREE.fov;
    return { ...FREE, fov, ...this.override };
  }

  private betaFor(elevDeg: number) {
    return clamp(Math.PI / 2 - (elevDeg * Math.PI) / 180, MIN_BETA, MAX_BETA);
  }

  private clampAlpha(a: number) {
    if (!this.alphaRange) return a;
    const [lo, hi] = this.alphaRange;
    const mid = (lo + hi) / 2;
    return mid + clamp(wrap(a - mid), lo - mid, hi - mid);
  }

  /** Look point: chest height above the smoothed target + look-ahead + lead. */
  private lookPoint(out: Vector3) {
    const t = this.tuning();
    // ground-projected forward = -(cos alpha, sin alpha)
    const fx = -Math.cos(this.alpha);
    const fz = -Math.sin(this.alpha);
    out.set(
      this.smoothTarget.x + fx * t.lookAhead + this.lead.x,
      this.smoothTarget.y + t.lookY,
      this.smoothTarget.z + fz * t.lookAhead + this.lead.z,
    );
    return out;
  }

  private place() {
    const t = this.tuning();
    const portrait = this.scene.getEngine().getAspectRatio(this.camera) < 0.9;
    this.camera.fov = t.fov;
    const r = this.radius * (portrait ? 1.08 : 1);
    const look = this.lookPoint(this.look);
    let beta = this.beta;
    // keep the lens above the terrain: lift (smaller beta) if it would dip under
    if (this.groundAt) {
      const sb = Math.sin(beta);
      const gx = look.x + Math.cos(this.alpha) * sb * r;
      const gz = look.z + Math.sin(this.alpha) * sb * r;
      const minY = this.groundAt(gx, gz) + GROUND_CLEARANCE;
      if (Number.isFinite(minY) && look.y + Math.cos(beta) * r < minY) beta = Math.acos(clamp((minY - look.y) / r, -1, 1));
    }
    const sb = Math.sin(beta);
    this.camera.position.set(look.x + Math.cos(this.alpha) * sb * r, look.y + Math.cos(beta) * r, look.z + Math.sin(this.alpha) * sb * r);
    this.camera.setTarget(look);
    this.focus.copyFrom(this.smoothTarget);
  }

  /** Largest radius the camera can sit at without passing through a collider. */
  private collisionLimit(radius: number): number {
    if (!this.collisionEnabled || !this.colliders.length) return radius;
    const o = this.lookPoint(this.look);
    const sb = Math.sin(this.goalBeta);
    const d = this.dir.set(Math.cos(this.goalAlpha) * sb, Math.cos(this.goalBeta), Math.sin(this.goalAlpha) * sb);
    let best = radius;
    for (const b of this.colliders) {
      const hit = rayBox(o, d, b.min, b.max, best + COLLISION_MARGIN);
      if (hit !== null) best = Math.min(best, hit - COLLISION_MARGIN);
    }
    return Math.max(COLLISION_MIN, Math.min(radius, best));
  }

  // ---------------------------------------------------------------- input

  private get pointerLocked() {
    return document.pointerLockElement === this.canvas;
  }

  private requestPointerLock() {
    if (this.opts.isMobile || this.pointerLocked || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => undefined);
    } catch {
      /* not allowed here (no gesture / sandboxed iframe) */
    }
  }

  private releasePointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  private orbitBy(dAlpha: number, dBeta: number) {
    if (!this.orbitEnabled || controls.locked) return;
    this.resetting = false;
    this.goalAlpha = this.clampAlpha(this.goalAlpha + dAlpha);
    this.goalBeta = clamp(this.goalBeta + dBeta, MIN_BETA, MAX_BETA);
    this.manualUntil = performance.now() + MANUAL_HOLD_MS;
  }

  private zoomBy(factor: number) {
    if (!this.orbitEnabled || controls.locked) return;
    this.goalRadius = clamp(this.goalRadius * factor, MIN_RADIUS, MAX_RADIUS);
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window | Document,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private bindInput() {
    const c = this.canvas;

    this.listen(c, "contextmenu", (e) => e.preventDefault());

    this.listen(
      c,
      "wheel",
      (e) => {
        e.preventDefault();
        const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        this.zoomBy(Math.exp(clamp(px, -200, 200) * 0.0015));
      },
      { passive: false },
    );

    this.listen(c, "pointerdown", (e) => {
      if (!this.orbitEnabled) return;
      const now = performance.now();
      if (e.pointerType === "mouse") {
        if (e.button === 2 || e.button === 1) {
          e.preventDefault(); // no middle-click autoscroll
          if (e.button === 2) {
            if (now - this.lastRightDown < DOUBLE_TAP_MS) this.reset();
            this.lastRightDown = now;
          }
          this.mouseDrag = e.pointerId;
          try {
            c.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic */
          }
        } else if (e.button === 0 && this.mode === "lock" && !controls.locked) {
          this.requestPointerLock(); // re-enter mouse look after Esc
        }
        return;
      }
      // touch / pen
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
      }
    });

    this.listen(c, "pointermove", (e) => {
      if (e.pointerType === "mouse") {
        if (this.pointerLocked) {
          this.orbitBy(-e.movementX * MOUSE_ALPHA, -e.movementY * MOUSE_BETA);
        } else if (this.mouseDrag === e.pointerId) {
          this.orbitBy(-e.movementX * MOUSE_ALPHA, -e.movementY * MOUSE_BETA);
        }
        return;
      }
      const p = this.touches.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.touches.size === 1) {
        this.orbitBy(-dx * TOUCH_ALPHA, -dy * TOUCH_BETA);
      } else if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (this.pinchDist > 0 && dist > 0) this.zoomBy(this.pinchDist / dist);
        this.orbitBy(wrap(ang - this.pinchAngle), 0);
        this.pinchDist = dist;
        this.pinchAngle = ang;
      }
    });

    const up = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        if (this.mouseDrag === e.pointerId) this.mouseDrag = null;
        return;
      }
      const p = this.touches.get(e.pointerId);
      if (!p) return;
      this.touches.delete(e.pointerId);
      this.pinchDist = 0;
      // double-tap (two short, still taps close together) -> reset
      const now = performance.now();
      const still = Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 12 && now - p.t0 < 250;
      if (e.type === "pointerup" && still && this.touches.size === 0) {
        const lt = this.lastTap;
        if (now - lt.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 48) {
          this.reset();
          lt.t = 0;
        } else {
          lt.t = now;
          lt.x = e.clientX;
          lt.y = e.clientY;
        }
      }
    };
    this.listen(c, "pointerup", up);
    this.listen(c, "pointercancel", up);
    this.listen(c, "lostpointercapture", (e) => {
      if (this.mouseDrag === e.pointerId) this.mouseDrag = null;
    });

    this.listen(window, "keydown", (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (controls.locked || !this.orbitEnabled) return;
      if (e.key === "Tab") {
        // keep Tab for focus navigation while a UI control has focus
        const a = document.activeElement;
        if (a && a !== document.body && a !== c) return;
        e.preventDefault();
        this.toggleMode(true);
      } else if (e.key === "r" || e.key === "R") {
        this.reset();
      }
    });

    const onToggle = () => this.toggleMode(true);
    const onReset = () => this.reset();
    uiEvents.on("cameraToggleLock", onToggle);
    uiEvents.on("cameraReset", onReset);
    this.off.push(() => {
      uiEvents.off("cameraToggleLock", onToggle);
      uiEvents.off("cameraReset", onReset);
    });
  }
}

/** Ray (origin o, unit dir d) vs AABB: entry distance in (0, maxT], or null. Rays starting inside a box ignore it. */
function rayBox(o: Vector3, d: Vector3, min: Vector3, max: Vector3, maxT: number): number | null {
  let t0 = 0;
  let t1 = maxT;
  const axes: ["x", "y", "z"] = ["x", "y", "z"];
  for (const k of axes) {
    const od = o[k];
    const dd = d[k];
    if (Math.abs(dd) < 1e-9) {
      if (od < min[k] || od > max[k]) return null;
      continue;
    }
    let ta = (min[k] - od) / dd;
    let tb = (max[k] - od) / dd;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  // t0 === 0 means the look point is inside the box (e.g. under an arch): ignore it
  return t0 > 0 ? t0 : null;
}
