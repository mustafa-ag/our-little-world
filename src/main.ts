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
import { isHd } from "./game/visual/mode";

const hd = isHd();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#8ecae6",
  pixelArt: !hd,
  roundPixels: !hd,
  antialias: hd,
  antialiasGL: hd,
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

// register the service worker so the game works offline / installs to home screen
registerSW({ immediate: true });
