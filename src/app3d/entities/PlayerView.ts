// The player (Juju): the skinned juju.glb (idle / walk / run / wave clips,
// crossfaded by ground speed with the playback rate synced so her feet stay
// planted), falling back to the procedural hero rig until / unless it loads,
// + a soft blob shadow. Reads PlayerState each frame; her clothes follow
// store.state.outfit (see JUJU_LOOKS in assets/kit/characters.ts).

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PLAYER } from "../../game/data/npcs";
import { Outfits, type CharColors } from "../../game/palette";
import { store } from "../../game/systems/store";
import type { AssetManager, KitContext } from "../assets/AssetManager";
import { createPlayerRig, type CharacterRig } from "../assets/kit/characters";
import type { PlayerState } from "../systems/playerController";
import { DECAL_ALPHA_INDEX } from "../rendering/occlusion";

export function playerColors(): CharColors {
  const o = Outfits[store.state.outfit as keyof typeof Outfits];
  return o ? { ...PLAYER.colors, top: o.top, topShade: o.topShade, bottom: o.bottom, shoes: o.shoes } : PLAYER.colors;
}

export function createBlobShadow(k: KitContext, d = 0.8): Mesh {
  const disc = CreateDisc("blobShadow", { radius: d / 2, tessellation: 14 }, k.scene);
  disc.rotation.x = Math.PI / 2;
  let mat = k.scene.getMaterialByName("blobShadowMat") as StandardMaterial | null;
  if (!mat) {
    mat = new StandardMaterial("blobShadowMat", k.scene);
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.alpha = 0.22;
    mat.disableLighting = true;
    mat.freeze();
  }
  disc.material = mat;
  disc.isPickable = false;
  disc.alphaIndex = DECAL_ALPHA_INDEX; // before a faded building's depth twin
  return disc;
}

export class PlayerView {
  rig: CharacterRig;
  shadow: Mesh;
  private onOutfit = () => {
    this.rig.setColors(playerColors());
    this.rig.setOutfit?.(store.state.outfit);
  };

  constructor(k: KitContext, am: AssetManager, x: number, z: number) {
    this.rig = createPlayerRig(k, am, playerColors(), "player", () => store.state.outfit);
    this.rig.root.position.set(x, 0, z);
    this.rig.root.rotation.y = Math.PI;
    this.shadow = createBlobShadow(k, 0.6);
    store.on("outfit", this.onOutfit);
    store.on("changed", this.onOutfit);
  }

  update(dt: number, s: PlayerState, groundY: number) {
    const r = this.rig.root;
    r.position.set(s.x, groundY, s.z);
    r.rotation.y = s.yaw;
    this.rig.animate(dt, s.moving, Math.hypot(s.vx, s.vz));
    this.shadow.position.set(s.x, groundY + 0.015, s.z);
  }

  /** A little wave (interactions, greetings). */
  wave() {
    this.rig.gesture("wave");
  }

  dispose() {
    store.off("outfit", this.onOutfit);
    store.off("changed", this.onOutfit);
    this.rig.dispose();
    this.shadow.dispose();
  }
}
