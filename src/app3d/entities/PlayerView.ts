// The player's chibi + a soft blob shadow. Reads PlayerState each frame;
// outfit colours follow store.state.outfit (same palette as the 2D game).

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PLAYER } from "../../game/data/npcs";
import { Outfits, type CharColors } from "../../game/palette";
import { store } from "../../game/systems/store";
import type { KitContext } from "../assets/AssetManager";
import { createCharacter, type CharacterRig } from "../assets/kit/characters";
import type { PlayerState } from "../systems/playerController";

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
  return disc;
}

export class PlayerView {
  rig: CharacterRig;
  shadow: Mesh;
  private onOutfit = () => this.rig.setColors(playerColors());

  constructor(
    private k: KitContext,
    x: number,
    z: number,
  ) {
    this.rig = createCharacter(k, playerColors(), "player");
    this.rig.root.position.set(x, 0, z);
    this.rig.root.rotation.y = Math.PI;
    for (const m of this.rig.meshes) k.lighting?.addCaster(m);
    this.shadow = createBlobShadow(k);
    store.on("outfit", this.onOutfit);
    store.on("changed", this.onOutfit);
  }

  update(dt: number, s: PlayerState, groundY: number) {
    const r = this.rig.root;
    r.position.set(s.x, groundY, s.z);
    r.rotation.y = s.yaw;
    this.rig.animate(dt, s.moving);
    this.shadow.position.set(s.x, groundY + 0.015, s.z);
  }

  dispose() {
    store.off("outfit", this.onOutfit);
    store.off("changed", this.onOutfit);
    this.rig.dispose();
    this.shadow.dispose();
  }
}
