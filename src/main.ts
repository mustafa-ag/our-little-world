import Phaser from "phaser";
import { registerSW } from "virtual:pwa-register";
import { BootScene } from "./game/scenes/BootScene";
import { PreloadScene } from "./game/scenes/PreloadScene";
import { TitleScene } from "./game/scenes/TitleScene";
import { WorldScene } from "./game/scenes/WorldScene";
import { HouseScene } from "./game/scenes/HouseScene";
import { WorldMapScene } from "./game/scenes/WorldMapScene";
import { DrivingScene } from "./game/scenes/DrivingScene";
import { UIScene } from "./game/scenes/UIScene";

const isAppleTouchDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const config: Phaser.Types.Core.GameConfig = {
  // Mobile Safari can terminate the WebGL process after the world scene opens.
  type: isAppleTouchDevice ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  backgroundColor: "#8ecae6",
  // Canvas has one global sampling mode. Favor legible type and smooth HD scenery
  // on the mobile reliability fallback; desktop retains per-texture WebGL filters.
  pixelArt: !isAppleTouchDevice,
  roundPixels: true,
  render: {
    antialias: isAppleTouchDevice,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  // UI is last so it always renders on top of gameplay scenes.
  scene: [BootScene, PreloadScene, TitleScene, WorldScene, HouseScene, WorldMapScene, DrivingScene, UIScene],
};

const game = new Phaser.Game(config);

// expose the game in dev for debugging in the console
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

// Always activate a newer release immediately so installed copies do not remain
// stranded on an old Netlify Drop deployment.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    void registration?.update();
  },
});
