// An NPC: the shared storybook character rig (procedural build, no GLB
// needed) in the NpcDef colours with a hair style / outfit picked per person,
// idle breathing, a name tag above the head, and "face the player" when
// talked to (turns smoothly, with a little nod).

import type { NpcDef } from "../../game/data/npcs";
import type { KitContext } from "../assets/AssetManager";
import { createCharacter, styleFor, type CharacterRig, CHAR_HEIGHT } from "../assets/kit/characters";
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

  constructor(
    k: KitContext,
    readonly def: NpcDef,
    readonly x: number,
    readonly z: number,
    groundY: number,
  ) {
    this.rig = createCharacter(k, def.colors, `npc:${def.id}`, styleFor(def.id));
    this.rig.root.position.set(x, groundY, z);
    this.restYaw = yawForFacing(def.facing ?? "down");
    this.targetYaw = this.restYaw;
    this.rig.root.rotation.y = this.restYaw;
    this.shadow = createBlobShadow(k, 0.75);
    this.shadow.position.set(x, groundY + 0.015, z);
    this.label = createLabel(k.scene, def.name, { scale: 0.85 });
    this.label.setPosition(x, groundY + CHAR_HEIGHT + 0.45, z);
  }

  faceTowards(px: number, pz: number) {
    this.targetYaw = yawFor(px - this.x, pz - this.z);
    this.lookTimer = 6;
    this.rig.gesture("nod");
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
