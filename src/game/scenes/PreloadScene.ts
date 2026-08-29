import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { buildAllTextures, rebuildPlayerTexture } from "../textures";
import { store } from "../systems/store";
import { applyHdPipeline } from "../visual/preloadHd";
import { HD_FILES } from "../visual/hdManifest";
import { isHd } from "../visual/mode";
import { markArtStatus } from "../visual/assets";
import { FONT_UI } from "../visual/theme";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload() {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#8ecae6");
    this.add
      .text(width / 2, height / 2 - 28, "loading our world...", {
        fontFamily: FONT_UI,
        fontSize: "18px",
        color: "#3a2b3a",
        resolution: 2,
      })
      .setOrigin(0.5);

    const track = this.add.rectangle(width / 2, height / 2 + 8, 220, 8, 0xffffff, 0.45).setOrigin(0.5);
    const bar = this.add.rectangle(track.x - 110, track.y, 2, 8, 0xe46d94, 1).setOrigin(0, 0.5);

    if (!isHd()) return;

    for (const f of HD_FILES) {
      this.load.svg(f.key, f.path, { width: f.w, height: f.h });
    }

    this.load.on("progress", (p: number) => {
      bar.width = Math.max(2, 220 * p);
    });
    this.load.on("filecomplete", (key: string) => {
      const f = HD_FILES.find((x) => x.key === key);
      if (f?.mapsTo) markArtStatus(f.mapsTo, f.status);
    });
  }

  create() {
    store.init();
    buildAllTextures(this);
    rebuildPlayerTexture(this, store.state.outfit);
    applyHdPipeline(this);
    this.time.delayedCall(80, () => this.scene.start(SceneKeys.Title));
  }
}
