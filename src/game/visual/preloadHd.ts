import Phaser from "phaser";
import { Outfits } from "../palette";
import { PLAYER, NPCS } from "../data/npcs";
import { store } from "../systems/store";
import { isHd } from "./mode";
import { buildHdEnvironment } from "./hdGenerate";
import { makeHdCharacter } from "./hdCharacters";
import { assembleCharacterSheet } from "./assembleCharacters";
import { buildPortraits } from "./portraits";

function jujuFrames() {
  return {
    down: ["hd_juju_down", "hd_juju_down_b"] as [string, string],
    up: ["hd_juju_up", "hd_juju_up_b"] as [string, string],
    side: ["hd_juju_side", "hd_juju_side_b"] as [string, string],
  };
}

function babaFrames() {
  return {
    down: ["hd_baba_down", "hd_baba_down_b"] as [string, string],
    up: ["hd_baba_up", "hd_baba_up_b"] as [string, string],
    side: ["hd_baba_side", "hd_baba_side_b"] as [string, string],
  };
}

export function applyHdPipeline(scene: Phaser.Scene) {
  if (!isHd()) return;
  buildHdEnvironment(scene);
  const outfit = Outfits[store.state.outfit] ?? Outfits.casual;
  const juju = { ...PLAYER.colors, top: outfit.top, topShade: outfit.topShade, bottom: outfit.bottom, shoes: outfit.shoes };
  const baba = NPCS.find((n) => n.id === "baba")!.colors;
  assembleCharacterSheet(scene, "char_her", jujuFrames(), juju);
  assembleCharacterSheet(scene, "char_baba", babaFrames(), baba);
  buildPortraits(scene);
}

export function rebuildHdPlayer(scene: Phaser.Scene, outfitId: string) {
  if (!isHd()) return false;
  const o = Outfits[outfitId] ?? Outfits.casual;
  const juju = {
    ...PLAYER.colors,
    top: o.top,
    topShade: o.topShade,
    bottom: o.bottom,
    shoes: o.shoes,
  };
  assembleCharacterSheet(scene, "char_her", jujuFrames(), juju);
  return true;
}

export { makeHdCharacter };
