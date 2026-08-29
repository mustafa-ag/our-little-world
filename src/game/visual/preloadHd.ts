import Phaser from "phaser";
import { Outfits } from "../palette";
import { PLAYER, NPCS } from "../data/npcs";
import { store } from "../systems/store";
import { isHd } from "./mode";
import { buildHdEnvironment } from "./hdGenerate";
import { buildHdHeroes, makeHdCharacter } from "./hdCharacters";
import { buildPortraits } from "./portraits";

export function applyHdPipeline(scene: Phaser.Scene) {
  if (!isHd()) return;
  buildHdEnvironment(scene);
  const outfit = Outfits[store.state.outfit] ?? Outfits.casual;
  const juju = { ...PLAYER.colors, top: outfit.top, topShade: outfit.topShade, bottom: outfit.bottom, shoes: outfit.shoes };
  const baba = NPCS.find((n) => n.id === "baba")!.colors;
  buildHdHeroes(scene, juju, baba);
  buildPortraits(scene);
}

export function rebuildHdPlayer(scene: Phaser.Scene, outfitId: string) {
  if (!isHd()) return false;
  const o = Outfits[outfitId] ?? Outfits.casual;
  makeHdCharacter(scene, "char_her", {
    ...PLAYER.colors,
    top: o.top,
    topShade: o.topShade,
    bottom: o.bottom,
    shoes: o.shoes,
  });
  return true;
}
