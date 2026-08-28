import Phaser from "phaser";
import { SceneKeys } from "../constants";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create() {
    this.cameras.main.setBackgroundColor("#8ecae6");
    this.scene.start(SceneKeys.Preload);
  }
}
