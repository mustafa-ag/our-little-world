import Phaser from "phaser";
import { isHd } from "./mode";

const shown = new Set<string>();

export function applyHdCamera(cam: Phaser.Cameras.Scene2D.Camera) {
  cam.setRoundPixels(!isHd());
}

export class CameraRig {
  private anchor: Phaser.GameObjects.Rectangle;
  private revealing = false;

  constructor(
    private scene: Phaser.Scene,
    private cam: Phaser.Cameras.Scene2D.Camera,
    x: number,
    y: number,
  ) {
    applyHdCamera(cam);
    this.anchor = scene.add.rectangle(x, y, 2, 2, 0, 0).setVisible(false);
    const round = !isHd();
    cam.startFollow(this.anchor, round, isHd() ? 0.1 : 0.15, isHd() ? 0.1 : 0.15);
  }

  update(px: number, py: number, vx: number, vy: number) {
    if (this.revealing) return;
    const look = isHd() ? 0.07 : 0;
    this.anchor.setPosition(px + vx * look, py + vy * look);
  }

  maybeReveal(id: string, lx: number, ly: number, px: number, py: number) {
    if (!isHd() || this.revealing || shown.has(id)) return;
    if (Phaser.Math.Distance.Between(px, py, lx, ly) > 80) return;
    shown.add(id);
    this.revealing = true;
    applyHdCamera(this.cam);
    const startZ = this.cam.zoom;
    this.cam.stopFollow();
    this.cam.pan(lx, ly, 720, "Sine.inOut");
    this.scene.tweens.add({
      targets: this.cam,
      zoom: startZ * 0.92,
      duration: 720,
      yoyo: true,
      hold: 360,
      ease: "Sine.inOut",
    });
    this.scene.time.delayedCall(1400, () => {
      if (!this.scene.sys.isActive()) return;
      this.cam.pan(px, py, 720, "Sine.inOut");
      this.scene.time.delayedCall(740, () => {
        if (!this.scene.sys.isActive()) return;
        applyHdCamera(this.cam);
        this.cam.startFollow(this.anchor, false, 0.1, 0.1);
        this.revealing = false;
      });
    });
  }
}
