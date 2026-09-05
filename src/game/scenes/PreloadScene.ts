import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { buildAllTextures, rebuildPlayerTexture } from "../textures";
import { store } from "../systems/store";
import { applyVisualFilters, diagnoseVisualAssets, queueVisualAssets } from "../visual";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload() {
    // External HD art must finish loading before legacy procedural fallback is built in create().
    queueVisualAssets(this);
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

    // Legacy procedural visuals remain active until each gameplay key is migrated.
    store.init();
    buildAllTextures(this);
    rebuildPlayerTexture(this, store.state.outfit); // apply saved outfit
    applyVisualFilters(this);
    diagnoseVisualAssets(this);

    let titleStarted = false;
    const startTitle = () => {
      if (titleStarted) return;
      titleStarted = true;
      this.scene.start(SceneKeys.Title);
    };

    // Let an existing account reconcile its saves before showing story cards,
    // but never make an offline game wait on a network request.
    const fallback = this.time.delayedCall(900, startTitle);
    void store.syncCloud().finally(() => {
      fallback.remove(false);
      this.time.delayedCall(120, startTitle);
    });
  }
}
