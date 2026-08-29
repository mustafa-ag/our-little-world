import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { buildAllTextures, rebuildPlayerTexture } from "../textures";
import { store } from "../systems/store";
import { applyHdPipeline } from "../visual/preloadHd";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  create() {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#8ecae6");
    this.add
      .text(width / 2, height / 2, "loading our world...", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#3a2b3a",
        resolution: 2,
      })
      .setOrigin(0.5);

    // all art is generated procedurally, so "loading" is instant
    store.init();
    buildAllTextures(this);
    rebuildPlayerTexture(this, store.state.outfit);
    applyHdPipeline(this);

    this.time.delayedCall(120, () => this.scene.start(SceneKeys.Title));
  }
}
