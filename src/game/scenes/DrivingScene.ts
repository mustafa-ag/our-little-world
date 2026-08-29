import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { getLocation } from "../data/locations";
import { store } from "../systems/store";
import { controls, uiEvents } from "../systems/controls";
import { NPCS } from "../data/npcs";
import { worldTint } from "../systems/life";
import { applyVisual, getVisualTexture } from "../visual/assets";
import { HD_HEADLIGHT } from "../visual/hdGenerate";
import { FONT_UI } from "../visual/theme";
import { resolvePortrait } from "../visual/portraits";
import { isHd } from "../visual/mode";

// A gentle top-down highway drive. Steer with the joystick / arrow keys,
// dodge the other cars, scoop up hearts, and cruise to your destination.
export class DrivingScene extends Phaser.Scene {
  private car!: Phaser.GameObjects.Image;
  private road!: Phaser.GameObjects.TileSprite;
  private grassL!: Phaser.GameObjects.TileSprite;
  private grassR!: Phaser.GameObjects.TileSprite;
  private lines!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private obstacles: Phaser.GameObjects.Image[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private speed = 220;
  private distance = 0;
  private goal = 2200;
  private roadX = 0;
  private roadW = 0;
  private lineOffset = 0;
  private spawnT = 0;
  private heartT = 0;
  private distText!: Phaser.GameObjects.Text;
  private destId = "";
  private destName = "home";
  private finished = false;
  private passenger?: string;
  private chatAt = 0;
  private chatI = 0;
  private chatText?: Phaser.GameObjects.Text;
  private bumps = 0;
  private near = 0;
  private rain = false;

  constructor() {
    super(SceneKeys.Driving);
  }

  create(data: { destId?: string; passenger?: string } = {}) {
    const dest = data.destId ?? store.state.currentLocation;
    this.destId = dest;
    this.destName = getLocation(dest).name;
    this.passenger = data.passenger ?? store.state.lastPassenger;
    this.bumps = 0;
    this.near = 0;
    this.chatI = 0;
    this.rain = store.state.timeOfDay === "night" || Math.random() < 0.18;
    const { width, height } = this.scale.gameSize;
    this.roadW = Math.min(width * 0.62, 280);
    this.roadX = width / 2;
    this.finished = false;
    this.distance = 0;

    this.grassL = this.add.tileSprite(0, 0, width, height, "t_grass").setOrigin(0, 0);
    this.grassR = this.add.tileSprite(0, 0, width, height, "t_grass").setOrigin(0, 0).setVisible(false);
    this.road = this.add
      .tileSprite(this.roadX, 0, this.roadW, height, "t_road")
      .setOrigin(0.5, 0);
    this.lines = this.add.graphics();

    // scenery: roadside trees as tilesprite? keep simple: side stripes
    const kerb = this.add.graphics();
    kerb.fillStyle(0xffffff, 0.85);
    kerb.fillRect(this.roadX - this.roadW / 2 - 3, 0, 3, height);
    kerb.fillRect(this.roadX + this.roadW / 2, 0, 3, height);

    this.add
      .rectangle(0, 0, width, height, worldTint(), store.state.timeOfDay === "night" ? 0.2 : 0.08)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(4);
    if (this.rain) {
      const rain = this.add.graphics().setDepth(20).setScrollFactor(0);
      for (let i = 0; i < 40; i++) rain.fillStyle(0xffffff, 0.18).fillRect(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height), 1, 8);
    }
    this.car = this.add.image(this.roadX, height - 90, getVisualTexture(this, "v_jeep_blue")).setDepth(10);
    applyVisual(this.car, "v_jeep_blue");
    this.car.setDisplaySize(48, 72);
    if (isHd() && store.state.timeOfDay === "night" && this.textures.exists(HD_HEADLIGHT)) {
      this.add.image(this.roadX, height - 150, HD_HEADLIGHT).setDepth(8).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.chatText = this.add
      .text(width / 2, height - 36, "", {
        fontFamily: FONT_UI,
        fontSize: "13px",
        color: "#fff",
        backgroundColor: "rgba(58,43,58,0.7)",
        padding: { x: 8, y: 4 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setScrollFactor(0)
      .setVisible(false);

    this.distText = this.add
      .text(12, 12, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#fff",
        stroke: "#3a2b3a",
        strokeThickness: 4,
        resolution: 2,
      })
      .setDepth(50)
      .setScrollFactor(0);

    const exit = this.add
      .text(width - 12, 12, "End drive", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#fff",
        backgroundColor: "#e46d94",
        padding: { x: 10, y: 6 },
        resolution: 2,
      })
      .setOrigin(1, 0)
      .setDepth(50)
      .setInteractive({ useHandCursor: true });
    exit.on("pointerdown", () => this.leave());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;

    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("prompt", null);
    uiEvents.emit("locationTitle", "Road trip", `Driving to ${this.destName}`);
  }

  private leaveToWorld() {
    store.setInJeep(true);
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.World, { locationId: this.destId, driving: true });
  }

  private leave() {
    if (this.finished) return;
    this.finished = true;
    this.leaveToWorld();
  }

  private spawnObstacle(height: number) {
    const lane = Phaser.Math.Between(-1, 1);
    const x = this.roadX + lane * (this.roadW / 3);
    const kinds = ["v_car_red", "v_car_blue", "v_jeep_blue"] as const;
    const tex = kinds[Phaser.Math.Between(0, kinds.length - 1)];
    const bike = Math.random() < 0.15;
    const car = this.add.image(x, -40, tex).setScale(bike ? 1.2 : 2).setDepth(9).setFlipY(true);
    this.obstacles.push(car);
  }

  private spawnHeart() {
    const x = this.roadX + Phaser.Math.Between(-1, 1) * (this.roadW / 3);
    const h = this.add.image(x, -20, "ui_heart").setScale(2).setDepth(9);
    this.hearts.push(h);
  }

  update(_t: number, deltaMs: number) {
    if (this.finished) return;
    const dt = deltaMs / 1000;
    const { width, height } = this.scale.gameSize;

    // steering
    let dx = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) dx += 1;
    dx += controls.moveX;
    let accel = 0;
    if (this.cursors.up.isDown || this.keys.W.isDown) accel += 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) accel -= 1;
    accel += -controls.moveY; // push up to speed up

    this.speed = Phaser.Math.Clamp(this.speed + accel * 120 * dt, 120, 360);
    this.car.x = Phaser.Math.Clamp(
      this.car.x + dx * 180 * dt,
      this.roadX - this.roadW / 2 + 12,
      this.roadX + this.roadW / 2 - 12,
    );
    this.car.setAngle(dx * 6);

    // scroll world
    const scroll = this.speed * dt;
    this.grassL.tilePositionY -= scroll;
    this.road.tilePositionY -= scroll;
    this.lineOffset = (this.lineOffset + scroll) % 40;
    this.distance += scroll;

    // dashed centre lines
    this.lines.clear();
    this.lines.fillStyle(0xf4d35e, 1);
    for (let y = -40 + this.lineOffset; y < height; y += 40) {
      this.lines.fillRect(this.roadX - 3, y, 6, 20);
    }

    // spawn traffic + hearts
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnObstacle(height);
      this.spawnT = Phaser.Math.FloatBetween(0.8, 1.6);
    }
    this.heartT -= dt;
    if (this.heartT <= 0) {
      this.spawnHeart();
      this.heartT = Phaser.Math.FloatBetween(1.5, 3);
    }

    // move obstacles
    for (const o of this.obstacles) {
      o.y += (scroll + 40 * dt) * 1.0;
      const dxo = Math.abs(o.x - this.car.x);
      const dyo = Math.abs(o.y - this.car.y);
      if (dxo < 24 && dyo < 34) {
        this.cameras.main.shake(150, 0.008);
        this.speed = Math.max(120, this.speed - 60);
        this.bumps += 1;
        o.y = height + 100;
      } else if (dxo < 36 && dyo < 50 && o.y > this.car.y - 80 && o.y < this.car.y + 10) {
        this.near += 1;
      }
    }
    this.obstacles = this.obstacles.filter((o) => {
      if (o.y > height + 60) {
        o.destroy();
        return false;
      }
      return true;
    });

    // move hearts
    for (const h of this.hearts) {
      h.y += scroll;
      if (Math.abs(h.x - this.car.x) < 22 && Math.abs(h.y - this.car.y) < 26) {
        store.addCoins(5);
        h.y = height + 100;
      }
    }
    this.hearts = this.hearts.filter((h) => {
      if (h.y > height + 40) {
        h.destroy();
        return false;
      }
      return true;
    });

    this.chatAt += dt;
    if (this.chatAt > 7.5) {
      this.chatAt = 0;
      this.nextChat();
    }

    const remaining = Math.max(0, Math.ceil((this.goal - this.distance) / 20));
    this.distText.setText(`${this.destName} in ${remaining}m`);

    if (this.distance >= this.goal) {
      this.finished = true;
      store.addHearts(2);
      if (this.bumps === 0) {
        store.addCoins(10);
        store.toast("Perfect drive", "#7be0a3");
      } else if (this.near > 4) store.toast("A few near misses", "#f4c95d");
      store.toast(`You made it to ${this.destName}`, "#ff8fae");
      this.leaveArrived();
    }
  }

  private nextChat() {
    if (!this.passenger || !this.chatText) return;
    const name = NPCS.find((n) => n.id === this.passenger)?.name ?? this.passenger;
    const lines =
      this.passenger === "moomoo"
        ? ["aux?", "absolutely not", "😔", "this road always feels longer with you", "i'll drive next time. maybe."]
        : this.passenger === "fadwa"
          ? ["can we stop for food", "we just started", "so that's a yes"]
          : this.passenger === "mama"
            ? ["Habibti, slower.", "I'm going the limit.", "The limit is a suggestion, no?"]
            : this.passenger === "baba"
              ? ["Good car.", "Thanks Baba.", "Don't tell Mama I said that."]
              : ["nice night for a drive", "mm.", "yeah"];
    const line = lines[this.chatI % lines.length];
    this.chatI += 1;
    this.chatText.setText(`${name}: ${line}`).setVisible(true);
    const pk = resolvePortrait(this, this.passenger);
    if (pk && !this.children.getByName("drivePort")) {
      this.add.image(28, this.scale.gameSize.height - 48, pk).setName("drivePort").setDisplaySize(36, 44).setDepth(50).setScrollFactor(0);
    }
    this.time.delayedCall(3200, () => this.chatText?.setVisible(false));
  }

  private leaveArrived() {
    this.leaveToWorld();
  }
}
