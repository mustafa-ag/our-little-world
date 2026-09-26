// An NPC: npc-base.glb (same rig and clips as Juju) retinted to the NpcDef
// colours, with a hair variant / skirt or jeans / cardigan picked per person
// (procedural fallback until the GLB loads), idle breathing, a name tag above
// the head, and "face the player" when talked to (turns smoothly, waves the
// first time, nods after that).

import type { NpcDef } from "../../game/data/npcs";
import type { AssetManager, KitContext } from "../assets/AssetManager";
import { characterAssets, createCharacter, createNpcRig, styleFor, type CharacterRig, CHAR_HEIGHT } from "../assets/kit/characters";
import { lerpAngle, yawFor, yawForFacing } from "../world/coords";
import { createBlobShadow } from "./PlayerView";
import { createLabel, type Label } from "./Label";

export class NpcView {
  rig: CharacterRig;
  label: Label;
  private shadow;
  private targetYaw: number;
  private restYaw: number;
  private lookTimer = 0;
  private greeted = false;

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
    this.restYaw = yawForFacing(def.facing ?? "down");
    this.targetYaw = this.restYaw;
    this.rig.root.rotation.y = this.restYaw;
    this.shadow = createBlobShadow(k, 0.56);
    this.shadow.position.set(x, groundY + 0.015, z);
    this.label = createLabel(k.scene, def.name, { scale: 0.85 });
    this.label.setPosition(x, groundY + CHAR_HEIGHT + 0.32, z);
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
    this.label.setPosition(x, groundY + CHAR_HEIGHT + 0.32, z);
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
