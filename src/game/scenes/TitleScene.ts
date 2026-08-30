import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { store } from "../systems/store";
import { resetControls } from "../systems/controls";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Title);
  }

  create() {
    const { width, height } = this.scale.gameSize;
    resetControls();

    // soft sky gradient
    const g = this.add.graphics();
    for (let i = 0; i < height; i++) {
      const t = i / height;
      const r = Math.round(142 + (244 - 142) * t);
      const gg = Math.round(202 + (166 - 202) * t);
      const b = Math.round(230 + (192 - 230) * t);
      g.fillStyle(Phaser.Display.Color.GetColor(r, gg, b), 1).fillRect(0, i, width, 1);
    }

    // floating hearts
    for (let i = 0; i < 10; i++) {
      const h = this.add.image(Phaser.Math.Between(20, width - 20), Phaser.Math.Between(40, height - 40), "ui_heart").setScale(Phaser.Math.FloatBetween(1, 2.4)).setAlpha(0.5);
      this.tweens.add({ targets: h, y: h.y - Phaser.Math.Between(20, 50), duration: Phaser.Math.Between(1800, 3200), yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }

    this.add.image(width / 2, height * 0.32, "ui_heart").setScale(6);
    this.add
      .text(width / 2, height * 0.46, "Juju's World", {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#fff",
        stroke: "#e46d94",
        strokeThickness: 7,
        resolution: 2,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.53, "made for Jasmin, with love — Moomoo", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#fff",
        stroke: "#3a2b3a",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5);

    const play = this.add
      .text(width / 2, height * 0.66, store.state.started ? "Continue" : "Start our story", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#fff",
        backgroundColor: "#e46d94",
        padding: { x: 20, y: 12 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: play, scale: 1.06, duration: 800, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    play.on("pointerdown", () => this.startGame());

    if (store.state.started) {
      const reset = this.add
        .text(width / 2, height * 0.78, "New game", {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#fff",
          backgroundColor: "rgba(58,43,58,0.55)",
          padding: { x: 10, y: 6 },
          resolution: 2,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      reset.on("pointerdown", () => {
        store.reset();
        this.scene.restart();
      });
    }

    this.input.keyboard?.once("keydown-SPACE", () => this.startGame());
    this.input.keyboard?.once("keydown-ENTER", () => this.startGame());
  }

  private startGame() {
    store.state.started = true;
    store.save();
    this.cameras.main.fadeOut(300, 142, 202, 230);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SceneKeys.World, { locationId: store.state.currentLocation, driving: store.state.inJeep });
    });
  }
}
