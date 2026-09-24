// Engine-free player movement: merges keyboard (WASD / arrows) with the shared
// `controls.moveX/moveY` joystick state exactly like WorldScene.update does,
// normalises the vector, respects `controls.locked`, and adds a little
// acceleration/deceleration so the character feels weighty. Space / E emit
// the same `uiEvents "action"` that the on-screen A button emits.

import { controls, uiEvents } from "../../game/systems/controls";
import type { Facing } from "../../game/data/npcs";
import type { GridCollider } from "../world/gridCollider";
import { lerpAngle, yawFor } from "../world/coords";

/** 90 px/s in the 2D game -> 5.625 units/s. */
export const BASE_SPEED = 90 / 16;
export const PLAYER_RADIUS = 0.28;

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  /** current speed magnitude 0..1 (for walk animation) */
  moving: number;
  facing: Facing;
  speed: number;
}

export class PlayerController {
  state: PlayerState;
  private keys = new Set<string>();
  private lastAction = 0;
  private onKeyDown = (e: KeyboardEvent) => {
    // The UI layer listens in the capture phase and swallows keys while a
    // dialogue / panel is open; respect that and `controls.locked`.
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
    if (k === " " || k === "e") {
      if (e.repeat || controls.locked) return;
      const now = performance.now();
      if (now - this.lastAction < 200) return;
      this.lastAction = now;
      uiEvents.emit("action");
      return;
    }
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.delete(k);
  };
  private onBlur = () => this.keys.clear();

  constructor(
    private collider: GridCollider,
    x: number,
    z: number,
  ) {
    this.state = { x, z, vx: 0, vz: 0, yaw: Math.PI, moving: 0, facing: "down", speed: BASE_SPEED };
  }

  attach(target: Window = window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  detach(target: Window = window) {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
    target.removeEventListener("blur", this.onBlur);
    this.keys.clear();
  }

  teleport(x: number, z: number) {
    this.state.x = x;
    this.state.z = z;
    this.state.vx = 0;
    this.state.vz = 0;
  }

  /** Desired input vector in world units (X east, Z north), normalised. */
  inputVector(): { x: number; z: number } {
    if (controls.locked) return { x: 0, z: 0 };
    let ix = 0;
    let iy = 0; // 2D "down" is +y
    const k = this.keys;
    if (k.has("ArrowLeft") || k.has("a")) ix -= 1;
    if (k.has("ArrowRight") || k.has("d")) ix += 1;
    if (k.has("ArrowUp") || k.has("w")) iy -= 1;
    if (k.has("ArrowDown") || k.has("s")) iy += 1;
    ix += controls.moveX;
    iy += controls.moveY;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    return { x: ix, z: -iy };
  }

  update(dt: number, frozen = false) {
    const s = this.state;
    const inp = frozen ? { x: 0, z: 0 } : this.inputVector();
    const targetVx = inp.x * s.speed;
    const targetVz = inp.z * s.speed;
    const accel = inp.x || inp.z ? 28 : 34; // units/s^2: quick to start, quicker to stop
    const k = Math.min(1, accel * dt);
    s.vx += (targetVx - s.vx) * k;
    s.vz += (targetVz - s.vz) * k;
    if (Math.abs(s.vx) < 0.01) s.vx = 0;
    if (Math.abs(s.vz) < 0.01) s.vz = 0;

    const dx = s.vx * dt;
    const dz = s.vz * dt;
    if (dx || dz) {
      const r = this.collider.move(s.x, s.z, dx, dz, PLAYER_RADIUS);
      s.x = r.x;
      s.z = r.z;
    }

    const mag = Math.hypot(s.vx, s.vz) / s.speed;
    s.moving = Math.min(1, mag);
    if (inp.x || inp.z) {
      const target = yawFor(inp.x, inp.z);
      s.yaw = lerpAngle(s.yaw, target, Math.min(1, 14 * dt));
      // facing = dominant axis, like Player.move in 2D
      if (Math.abs(inp.x) > Math.abs(inp.z)) s.facing = inp.x < 0 ? "left" : "right";
      else s.facing = inp.z > 0 ? "up" : "down";
    }
  }
}
