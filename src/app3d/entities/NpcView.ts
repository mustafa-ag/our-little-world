// An NPC: npc-base.glb (same rig and clips as Juju) retinted to the NpcDef
// colours, with a hair variant / skirt or jeans / cardigan picked per person
// (procedural fallback until the GLB loads), idle breathing, a name tag above
// the head, and "face the player" when talked to (turns smoothly, waves the
// first time, nods after that). Family members get their own silhouette
// (npcBuild: Moomoo tall and broad, Mama with a hijab, Baba stocky with a
// beard); the name tag shows the NpcDef display name just above their head.

import type { NpcDef } from "../../game/data/npcs";
import type { AssetManager, KitContext } from "../assets/AssetManager";
import { characterAssets, createCharacter, createNpcRig, npcBuild, npcHeight, styleFor, type CharacterRig } from "../assets/kit/characters";
import { lerpAngle, yawFor, yawForFacing } from "../world/coords";
import { createBlobShadow } from "./PlayerView";
import { createLabel, type Label } from "./Label";

/** Companion follow distances (world units) and top speed (units/s, a bit above Juju's jog). */
const FOLLOW_NEAR = 2;
const FOLLOW_FAR = 3;
const FOLLOW_LOST = 9;
const FOLLOW_MAX_SPEED = 4.2;

export class NpcView {
  rig: CharacterRig;
  label: Label;
  private shadow;
  private targetYaw: number;
  private restYaw: number;
  private lookTimer = 0;
  private greeted = false;
  private trailing = false;
  private labelY: number;

  constructor(
    k: KitContext,
    readonly def: NpcDef,
    public x: number,
    public z: number,
    groundY: number,
    am?: AssetManager,
  ) {
    const am2 = am ?? characterAssets();
    this.rig = am2 ? createNpcRig(k, am2, def.id, def.colors) : createCharacter(k, def.colors, `npc:${def.id}`, styleFor(def.id));
    this.rig.root.position.set(x, groundY, z);
    const [sx, sy, sz] = npcBuild(def.id).scale;
    this.rig.root.scaling.set(sx, sy, sz);
    this.labelY = npcHeight(def.id) + 0.32;
    this.restYaw = yawForFacing(def.facing ?? "down");
    this.targetYaw = this.restYaw;
    this.rig.root.rotation.y = this.restYaw;
    this.shadow = createBlobShadow(k, 0.56);
    this.shadow.position.set(x, groundY + 0.015, z);
    this.label = createLabel(k.scene, def.name, { scale: 0.85 });
    this.label.setPosition(x, groundY + this.labelY, z);
  }

  faceTowards(px: number, pz: number) {
    this.targetYaw = yawFor(px - this.x, pz - this.z);
    this.lookTimer = 6;
    this.rig.gesture(this.greeted ? "nod" : "wave");
    this.greeted = true;
  }

  /** Move the whole NPC (rig, blob shadow, name tag), e.g. a roadside passenger scrolling past. */
  moveTo(x: number, groundY: number, z: number) {
    this.x = x;
    this.z = z;
    this.rig.root.position.set(x, groundY, z);
    this.shadow.position.set(x, groundY + 0.015, z);
    this.label.setPosition(x, groundY + this.labelY, z);
  }

  /**
   * Companion follow (Phase 6B): trail loosely 2-3 units behind the player,
   * walking with the run clip scaled to the actual ground speed, sliding along
   * walls via `move`, and popping in behind Juju when left far behind.
   */
  follow(
    dt: number,
    player: { x: number; z: number; yaw: number },
    groundAt: (x: number, z: number) => number,
    move: (x: number, z: number, dx: number, dz: number) => { x: number; z: number },
  ) {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const d = Math.hypot(dx, dz);
    let v = 0;
    if (d > FOLLOW_LOST) {
      // lost behind a wall / after a warp: reappear just behind the player
      const p = move(player.x, player.z, -Math.sin(player.yaw) * FOLLOW_NEAR, -Math.cos(player.yaw) * FOLLOW_NEAR);
      this.moveTo(p.x, groundAt(p.x, p.z), p.z);
    } else if (d > FOLLOW_FAR || (this.trailing && d > FOLLOW_NEAR)) {
      this.trailing = true;
      const speed = Math.min(FOLLOW_MAX_SPEED, 1.8 + (d - FOLLOW_NEAR) * 2.2);
      const step = Math.min(d - FOLLOW_NEAR, speed * Math.min(dt, 0.1));
      const p = move(this.x, this.z, (dx / d) * step, (dz / d) * step);
      v = dt > 0 ? Math.hypot(p.x - this.x, p.z - this.z) / dt : 0;
      this.moveTo(p.x, groundAt(p.x, p.z), p.z);
      if (v > 0.05) this.targetYaw = yawFor(dx, dz);
      this.lookTimer = 0;
    } else {
      this.trailing = false;
      if (this.lookTimer > 0) this.lookTimer -= dt;
      else this.targetYaw = yawFor(dx, dz);
    }
    const r = this.rig.root;
    r.rotation.y = lerpAngle(r.rotation.y, this.targetYaw, Math.min(1, dt * 6));
    this.rig.animate(dt, Math.min(1, v / FOLLOW_MAX_SPEED), v);
  }

  update(dt: number, px: number, pz: number) {
    // glance at the player when they're close, otherwise drift back to rest
    const d = Math.hypot(px - this.x, pz - this.z);
    if (this.lookTimer > 0) this.lookTimer -= dt;
    else if (d < 2.2) this.targetYaw = yawFor(px - this.x, pz - this.z);
    else this.targetYaw = this.restYaw;
    const r = this.rig.root;
    r.rotation.y = lerpAngle(r.rotation.y, this.targetYaw, Math.min(1, dt * 6));
    this.rig.animate(dt, 0);
  }

  dispose() {
    this.rig.dispose();
    this.shadow.dispose();
    this.label.dispose();
  }
}
