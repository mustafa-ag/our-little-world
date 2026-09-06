import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { controls, minimap, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";

type VoyageMode = "sailing" | "boss-intro" | "boss" | "sinking" | "victory" | "arrival";
type BossAttack = "idle" | "charge-warning" | "charge" | "fin" | "leap-warning" | "leap";

interface OceanObstacle {
  view: Phaser.GameObjects.Container;
  radius: number;
  drift: number;
}

export class PirateVoyageScene extends Phaser.Scene {
  private mode: VoyageMode = "sailing";
  private attackState: BossAttack = "idle";
  private boat!: Phaser.GameObjects.Container;
  private boatParrot!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private waves: Phaser.GameObjects.Graphics[] = [];
  private obstacles: OceanObstacle[] = [];
  private health = 4;
  private readonly maxHealth = 4;
  private healthInvulnerableUntil = 0;
  private courseDistance = 0;
  private courseCheckpoint = 0;
  private readonly courseLength = 3900;
  private obstacleClock = 0;
  private currentUntil = 0;
  private currentPush = 0;
  private nextCurrentAt = 5200;
  private status!: Phaser.GameObjects.Text;
  private healthGraphic!: Phaser.GameObjects.Graphics;
  private progressGraphic!: Phaser.GameObjects.Graphics;
  private bossGraphic!: Phaser.GameObjects.Graphics;
  private bossLabel!: Phaser.GameObjects.Text;
  private shark?: Phaser.GameObjects.Container;
  private sharkHealth = 7;
  private readonly sharkMaxHealth = 7;
  private sharkInvulnerableUntil = 0;
  private cannonReadyAt = 0;
  private attackNumber = 0;
  private attackToken = 0;
  private finEndsAt = 0;
  private leapTarget?: Phaser.Math.Vector2;
  private warning?: Phaser.GameObjects.Graphics;

  constructor() {
    super(SceneKeys.PirateVoyage);
  }

  create() {
    this.mode = "sailing";
    this.attackState = "idle";
    this.waves = [];
    this.obstacles = [];
    this.health = this.maxHealth;
    this.healthInvulnerableUntil = 0;
    this.courseDistance = 0;
    this.courseCheckpoint = 0;
    this.obstacleClock = 0;
    this.currentUntil = 0;
    this.currentPush = 0;
    this.nextCurrentAt = this.time.now + 5200;
    this.shark = undefined;
    this.sharkHealth = this.sharkMaxHealth;
    this.sharkInvulnerableUntil = 0;
    this.cannonReadyAt = 0;
    this.attackNumber = 0;
    this.attackToken = 0;
    this.finEndsAt = 0;
    this.leapTarget = undefined;
    this.warning = undefined;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    minimap.on = false;
    uiEvents.emit("sceneReset");
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#237da5");
    this.drawOcean(width, height);
    this.boat = this.makeBoat(width / 2, Math.max(230, height * 0.66));
    this.healthGraphic = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.progressGraphic = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.bossGraphic = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.add.text(22, 110, "SHIP HEALTH", { fontFamily: "monospace", fontSize: "9px", color: "#fff4e6", resolution: 2 }).setScrollFactor(0).setDepth(102);
    this.bossLabel = this.add.text(width / 2, 161, "THE GREAT WHITE", { fontFamily: "monospace", fontSize: "11px", color: "#fff4e6", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setVisible(false);
    this.status = this.add.text(width / 2, 64, "STEER AROUND THE FLOATY PROBLEMS", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#fff4e6",
      align: "center",
      stroke: "#163c59",
      strokeThickness: 4,
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.add.text(width / 2, 18, "PIRATE VOYAGE  →  LONDON", {
      fontFamily: "monospace",
      fontSize: "19px",
      color: "#f4c95d",
      stroke: "#2b2233",
      strokeThickness: 5,
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.add.text(width / 2, 86, "MOVE: joystick / WASD / arrows   ·   CANNON: A / Space / E", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#fff4e6",
      stroke: "#163c59",
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.fireCannon, this);
    uiEvents.on("openMap", this.blockMap, this);
    this.input.keyboard?.on("keydown", this.keyAttack, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.drawHud();

    const target = quests.currentStep("q_family_jewel_heist")?.target;
    if (target === "great_white_boss") {
      this.time.delayedCall(450, () => this.beginBossIntro());
    } else if (target !== "pirate_voyage") {
      this.time.delayedCall(250, () => this.returnToLondon());
    }
  }

  private drawOcean(width: number, height: number) {
    const sea = this.add.graphics().setDepth(-20);
    sea.fillGradientStyle(0x3db3d6, 0x3db3d6, 0x176f9c, 0x176f9c, 1);
    sea.fillRect(0, 0, width, height);
    for (let i = 0; i < 22; i++) {
      const wave = this.add.graphics().setDepth(-10);
      const dark = i % 5 === 0;
      wave.fillStyle(dark ? 0x155f89 : 0xa6e8f4, dark ? 0.24 : 0.52);
      wave.fillEllipse(0, 0, dark ? Phaser.Math.Between(80, 150) : Phaser.Math.Between(26, 58), dark ? Phaser.Math.Between(18, 34) : 4);
      wave.setPosition(Phaser.Math.Between(-30, width + 20), Phaser.Math.Between(105, height + 40)).setAngle(Phaser.Math.Between(-8, 8));
      this.waves.push(wave);
    }
  }

  private makeBoat(x: number, y: number) {
    const shadow = this.add.ellipse(0, 17, 112, 34, 0x123e59, 0.35);
    const hull = this.add.graphics();
    hull.fillStyle(0x5a382c, 1).fillTriangle(-55, -9, 55, -9, 35, 26).fillTriangle(-55, -9, -34, 26, 35, 26);
    hull.fillStyle(0x8a5c3b, 1).fillRoundedRect(-43, -15, 86, 15, 4);
    hull.lineStyle(3, 0x3f2922, 1).lineBetween(-42, 7, 40, 7).lineBetween(-32, 17, 32, 17);
    hull.fillStyle(0x7a5238, 1).fillRect(-3, -88, 6, 78);
    hull.fillStyle(0xfff4e6, 1).fillTriangle(4, -82, 4, -24, 46, -28);
    hull.fillStyle(0xe6d4bb, 1).fillTriangle(-4, -76, -4, -28, -34, -32);
    hull.fillStyle(0x2a2230, 1).fillRect(3, -91, 29, 17);
    hull.fillStyle(0xd84652, 1).fillRect(3, -80, 29, 6);
    hull.fillStyle(0xffffff, 1).fillCircle(18, -84, 4).fillRect(14, -84, 8, 2);
    hull.fillStyle(0x2a2230, 1).fillCircle(18, -84, 2);
    const juju = this.add.sprite(-14, -20, "char_her", 0).setScale(1.65).setOrigin(0.5, 1);
    const pirate = this.add.graphics();
    pirate.fillStyle(0x2a2230, 1).fillRect(-23, -46, 18, 4);
    pirate.fillStyle(0xd84652, 1).fillRect(-20, -52, 12, 7);
    pirate.fillStyle(0x2a2230, 1).fillRect(-19, -34, 10, 2).fillCircle(-11, -38, 2);
    pirate.fillRect(-20, -31, 4, 2).fillRect(-12, -31, 4, 2);
    const parrotBody = this.add.graphics();
    parrotBody.fillStyle(0xd84652, 1).fillCircle(0, 0, 6).fillStyle(0x2f9a62, 1).fillRect(-4, 3, 8, 8);
    parrotBody.fillStyle(0xf4c95d, 1).fillTriangle(5, -2, 12, 1, 5, 2).fillStyle(0xffffff, 1).fillCircle(2, -2, 2);
    parrotBody.fillStyle(0x2a2230, 1).fillCircle(2, -2, 1);
    this.boatParrot = this.add.container(23, -28, [parrotBody]);
    this.tweens.add({ targets: this.boatParrot, y: -34, angle: 6, duration: 330, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const boat = this.add.container(x, y, [shadow, hull, juju, pirate, this.boatParrot]).setDepth(30);
    this.tweens.add({ targets: boat, angle: { from: -1.8, to: 1.8 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    return boat;
  }

  private drawHud() {
    const { width } = this.scale.gameSize;
    this.healthGraphic.clear();
    this.healthGraphic.fillStyle(0x163c59, 0.9).fillRoundedRect(12, 105, 142, 42, 8);
    for (let i = 0; i < this.maxHealth; i++) {
      this.healthGraphic.fillStyle(i < this.health ? 0xff8fae : 0x59616d, 1).fillCircle(31 + i * 27, 131, 8);
      this.healthGraphic.fillCircle(38 + i * 27, 131, 8).fillTriangle(23 + i * 27, 132, 46 + i * 27, 132, 34 + i * 27, 144);
    }
    this.progressGraphic.clear();
    if (this.mode === "sailing") {
      const barW = Math.min(210, width * 0.34);
      const x = width - barW - 14;
      this.progressGraphic.fillStyle(0x163c59, 0.9).fillRoundedRect(x, 105, barW, 42, 8);
      this.progressGraphic.fillStyle(0xffffff, 1).fillRoundedRect(x + 12, 127, barW - 24, 9, 4);
      this.progressGraphic.fillStyle(0xf4c95d, 1).fillRoundedRect(x + 12, 127, Math.max(5, (barW - 24) * Math.min(1, this.courseDistance / this.courseLength)), 9, 4);
    }
    this.bossGraphic.clear();
    const showBoss = this.mode === "boss" || this.mode === "victory";
    this.bossLabel.setVisible(showBoss);
    if (showBoss) {
      const barW = Math.min(330, width - 44);
      const x = (width - barW) / 2;
      this.bossGraphic.fillStyle(0x163c59, 0.94).fillRoundedRect(x, 155, barW, 46, 8);
      this.bossGraphic.fillStyle(0xffffff, 1).fillRoundedRect(x + 14, 181, barW - 28, 10, 5);
      this.bossGraphic.fillStyle(0xd84652, 1).fillRoundedRect(x + 14, 181, Math.max(0, (barW - 28) * this.sharkHealth / this.sharkMaxHealth), 10, 5);
    }
  }

  private blockMap() {
    store.toast("The map is damp. Keep sailing.", "#8ecae6");
  }

  private keyAttack(event: KeyboardEvent) {
    if (event.code === "Space" || event.code === "KeyE") this.fireCannon();
  }

  private steer(delta: number) {
    let x = controls.moveX;
    let y = controls.moveY;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    if (this.time.now < this.currentUntil) x += this.currentPush;
    const speed = this.mode === "boss" ? 155 : 135;
    this.boat.x += x * speed * delta / 1000;
    this.boat.y += y * speed * delta / 1000;
    const { width, height } = this.scale.gameSize;
    this.boat.x = Phaser.Math.Clamp(this.boat.x, 62, width - 62);
    this.boat.y = Phaser.Math.Clamp(this.boat.y, 190, height - 145);
  }

  private scrollSea(delta: number) {
    const { width, height } = this.scale.gameSize;
    const speed = this.mode === "sailing" ? 135 : 70;
    for (const wave of this.waves) {
      wave.y += speed * delta / 1000;
      wave.x += Math.sin((wave.y + this.time.now * 0.02) * 0.02) * 0.18;
      if (wave.y > height + 45) wave.setPosition(Phaser.Math.Between(-20, width + 20), 100 - Phaser.Math.Between(0, 80));
    }
  }

  private spawnObstacle() {
    const { width } = this.scale.gameSize;
    const kinds = ["rock", "crate", "driftwood", "buoy", "reef"] as const;
    const kind = kinds[(Math.floor(this.courseDistance / 170) + this.obstacles.length) % kinds.length];
    const g = this.add.graphics();
    let radius = 23;
    if (kind === "rock" || kind === "reef") {
      radius = kind === "reef" ? 31 : 23;
      g.fillStyle(kind === "reef" ? 0x426f70 : 0x59616d, 1).fillEllipse(0, 4, radius * 2, radius * 1.3);
      g.fillStyle(0x7b8b91, 1).fillEllipse(-6, -3, radius, radius * 0.7);
    } else if (kind === "crate") {
      g.fillStyle(0x8a5c3b, 1).fillRect(-17, -17, 34, 34).lineStyle(3, 0x5a382c, 1).strokeRect(-17, -17, 34, 34).lineBetween(-16, -16, 16, 16).lineBetween(16, -16, -16, 16);
    } else if (kind === "driftwood") {
      g.lineStyle(9, 0x7a5238, 1).lineBetween(-29, 9, 29, -9).lineStyle(4, 0x5a382c, 1).lineBetween(-5, 1, 4, -14);
      radius = 28;
    } else {
      g.fillStyle(0xffffff, 1).fillCircle(0, 0, 13).fillStyle(0xd84652, 1).fillRect(-13, -4, 26, 8).fillRect(-3, -30, 6, 21);
      radius = 19;
    }
    const foam = this.add.ellipse(0, radius * 0.45, radius * 2.25, 8, 0xffffff, 0.42);
    const view = this.add.container(Phaser.Math.Between(60, Math.max(61, width - 60)), 92, [foam, g]).setDepth(15).setAngle(Phaser.Math.Between(-12, 12));
    this.tweens.add({ targets: view, angle: view.angle + Phaser.Math.Between(-5, 5), duration: 950, yoyo: true, repeat: -1 });
    this.obstacles.push({ view, radius, drift: Phaser.Math.FloatBetween(-9, 9) });
  }

  private updateSailing(delta: number) {
    this.courseDistance += 135 * delta / 1000;
    if (this.courseDistance > this.courseLength * 0.52) this.courseCheckpoint = this.courseLength * 0.5;
    this.obstacleClock += delta;
    const interval = Math.max(680, 1180 - this.courseDistance * 0.08);
    if (this.obstacleClock >= interval) {
      this.obstacleClock = 0;
      this.spawnObstacle();
    }
    if (this.time.now >= this.nextCurrentAt) {
      this.currentPush = Phaser.Math.RND.sign() * 0.7;
      this.currentUntil = this.time.now + 1250;
      this.nextCurrentAt = this.time.now + Phaser.Math.Between(5200, 7200);
      this.status.setText(this.currentPush > 0 ? "STRONG CURRENT →  very nautical" : "← STRONG CURRENT  extremely nautical");
      this.cameras.main.shake(80, 0.002);
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      obstacle.view.y += 145 * delta / 1000;
      obstacle.view.x += obstacle.drift * delta / 1000;
      if (Phaser.Math.Distance.Between(this.boat.x, this.boat.y, obstacle.view.x, obstacle.view.y) < obstacle.radius + 29) {
        this.hitBoat(obstacle.view.x);
        obstacle.view.destroy(true);
        this.obstacles.splice(i, 1);
      } else if (obstacle.view.y > this.scale.gameSize.height + 65) {
        obstacle.view.destroy(true);
        this.obstacles.splice(i, 1);
      }
    }
    if (this.courseDistance >= this.courseLength) {
      store.setFlag("heist_voyage_complete");
      quests.onMinigame("pirate_voyage");
      this.beginBossIntro();
    }
    this.drawHud();
  }

  private hitBoat(sourceX: number) {
    if (this.time.now < this.healthInvulnerableUntil || this.mode === "sinking" || this.mode === "victory") return;
    this.healthInvulnerableUntil = this.time.now + 1250;
    this.health -= 1;
    this.status.setText(this.health > 0 ? "SPLASH! The ship has filed a complaint." : "That was the ship's last complaint.");
    this.cameras.main.shake(150, 0.008);
    this.splash(this.boat.x, this.boat.y + 18, 11);
    this.boat.x += this.boat.x < sourceX ? -38 : 38;
    this.tweens.add({ targets: this.boat, alpha: 0.35, duration: 90, yoyo: true, repeat: 5 });
    this.drawHud();
    if (this.health <= 0) this.sinkAndRetry();
  }

  private sinkAndRetry() {
    const wasBoss = this.mode === "boss" || quests.currentStep("q_family_jewel_heist")?.target === "great_white_boss";
    this.mode = "sinking";
    this.attackToken += 1;
    controls.moveX = 0;
    controls.moveY = 0;
    const { width, height } = this.scale.gameSize;
    const card = this.add.text(width / 2, height * 0.35, "PIRATE JUJU HAS EXPERIENCED\nA MINOR NAVIGATIONAL INCIDENT", {
      fontFamily: "monospace",
      fontSize: "17px",
      color: "#fff4e6",
      align: "center",
      backgroundColor: "#3a2b3a",
      padding: { x: 12, y: 9 },
      resolution: 2,
    }).setOrigin(0.5).setDepth(210).setScale(0.5);
    this.tweens.add({ targets: card, scale: 1, duration: 360, ease: "Back.out" });
    this.tweens.add({ targets: this.boat, y: this.boat.y + 55, angle: 18, alpha: 0, duration: 1000, ease: "Quad.in" });
    this.splash(this.boat.x, this.boat.y, 20);
    this.time.delayedCall(1900, () => {
      card.destroy();
      this.clearDanger();
      this.health = this.maxHealth;
      this.healthInvulnerableUntil = this.time.now + 900;
      this.boat.setPosition(width / 2, Math.max(230, height * 0.66)).setAlpha(1).setAngle(0);
      if (wasBoss) {
        this.sharkHealth = this.sharkMaxHealth;
        this.beginBossIntro();
      } else {
        this.mode = "sailing";
        this.courseDistance = this.courseCheckpoint;
        this.obstacleClock = 0;
        this.status.setText(this.courseCheckpoint > 0 ? "MID-OCEAN CHECKPOINT. No one saw that." : "SHIP REASSEMBLED. Carry on.");
      }
      this.drawHud();
    });
  }

  private beginBossIntro() {
    if (this.mode === "boss-intro" || this.mode === "boss" || this.mode === "victory") return;
    this.mode = "boss-intro";
    this.clearDanger();
    this.attackToken += 1;
    this.drawHud();
    this.status.setText("Something enormous is being dramatic nearby...");
    const { width, height } = this.scale.gameSize;
    const fin = this.add.graphics().setDepth(45);
    fin.fillStyle(0x536b78, 1).fillTriangle(-26, 12, 0, -45, 24, 12);
    fin.setPosition(-40, height * 0.48);
    this.tweens.add({ targets: fin, x: width + 40, duration: 1500, ease: "Sine.inOut", onComplete: () => fin.destroy() });
    this.cameras.main.shake(220, 0.006);
    const first = this.add.text(width / 2, height * 0.3, "BOSS BATTLE", { fontFamily: "monospace", fontSize: "28px", color: "#d84652", stroke: "#fff4e6", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(210).setScale(0.2);
    const second = this.add.text(width / 2, height * 0.3 + 45, "THE GREAT WHITE", { fontFamily: "monospace", fontSize: "22px", color: "#fff4e6", stroke: "#2b2233", strokeThickness: 6, resolution: 2 }).setOrigin(0.5).setDepth(210).setAlpha(0);
    this.tweens.add({ targets: first, scale: 1.25, duration: 420, ease: "Back.out" });
    this.tweens.add({ targets: second, alpha: 1, y: second.y + 8, delay: 500, duration: 420, ease: "Back.out" });
    this.time.delayedCall(2100, () => {
      first.destroy();
      second.destroy();
      this.mode = "boss";
      this.attackState = "idle";
      this.sharkHealth = this.sharkMaxHealth;
      this.spawnShark(width + 120, height * 0.43);
      this.status.setText("THE GREAT WHITE · cannon when the shark is visible!");
      this.drawHud();
      this.time.delayedCall(650, () => this.beginNextAttack());
    });
  }

  private spawnShark(x: number, y: number) {
    this.shark?.destroy(true);
    const g = this.add.graphics();
    g.fillStyle(0x536b78, 1).fillEllipse(0, 0, 118, 45);
    g.fillTriangle(-7, -14, 12, -57, 29, -11).fillTriangle(-51, -5, -83, -36, -72, 5);
    g.fillStyle(0xe8eef2, 1).fillEllipse(20, 11, 70, 20);
    g.fillStyle(0xffffff, 1).fillCircle(37, -7, 5).fillStyle(0x2a2230, 1).fillCircle(39, -7, 2);
    g.lineStyle(3, 0x2a2230, 1).beginPath().arc(44, 5, 12, 0.4, 1.7).strokePath();
    this.shark = this.add.container(x, y, [g]).setDepth(40);
  }

  private beginNextAttack() {
    if (this.mode !== "boss") return;
    const token = ++this.attackToken;
    this.attackNumber += 1;
    const kind = this.attackNumber % 3;
    if (kind === 1) this.chargeAttack(token);
    else if (kind === 2) this.finAttack(token);
    else this.leapAttack(token);
  }

  private chargeAttack(token: number) {
    if (!this.shark) return;
    const { width, height } = this.scale.gameSize;
    const left = this.attackNumber % 2 === 1;
    const laneY = Phaser.Math.Clamp(this.boat.y + Phaser.Math.Between(-45, 45), 190, height - 150);
    this.attackState = "charge-warning";
    this.shark.setPosition(left ? -110 : width + 110, laneY).setScale(left ? 1 : -1, 1).setAlpha(1);
    this.status.setText(`CHARGE INCOMING ${left ? "→" : "←"}  move out of the warning lane!`);
    this.warning?.destroy();
    this.warning = this.add.graphics().setDepth(25);
    this.warning.fillStyle(0xffe08a, 0.2).fillRect(0, laneY - 48, width, 96).lineStyle(3, 0xffe08a, 0.75).lineBetween(0, laneY - 48, width, laneY - 48).lineBetween(0, laneY + 48, width, laneY + 48);
    this.time.delayedCall(1250, () => {
      if (token !== this.attackToken || this.mode !== "boss" || !this.shark) return;
      this.warning?.destroy();
      this.warning = undefined;
      this.attackState = "charge";
      const shark = this.shark;
      let hit = false;
      this.tweens.add({
        targets: shark,
        x: left ? width + 130 : -130,
        duration: 1050,
        ease: "Cubic.in",
        onUpdate: () => {
          if (!hit && Phaser.Math.Distance.Between(shark.x, shark.y, this.boat.x, this.boat.y) < 66) {
            hit = true;
            this.hitBoat(shark.x);
          }
        },
        onComplete: () => this.scheduleAttack(token, 650),
      });
    });
  }

  private finAttack(token: number) {
    if (!this.shark) return;
    this.attackState = "fin";
    this.finEndsAt = this.time.now + 3300;
    this.shark.setPosition(this.boat.x + 170, this.boat.y - 100).setScale(0.7).setAlpha(0.72);
    this.status.setText("FIN CHASE! Keep moving until it loses interest.");
    this.time.delayedCall(3400, () => {
      if (token !== this.attackToken || this.mode !== "boss" || !this.shark) return;
      this.splash(this.shark.x, this.shark.y, 14);
      if (Phaser.Math.Distance.Between(this.shark.x, this.shark.y, this.boat.x, this.boat.y) < 86) this.hitBoat(this.shark.x);
      this.shark.setAlpha(1).setScale(1);
      this.scheduleAttack(token, 750);
    });
  }

  private leapAttack(token: number) {
    if (!this.shark) return;
    this.attackState = "leap-warning";
    this.leapTarget = new Phaser.Math.Vector2(this.boat.x + Phaser.Math.Between(-25, 25), this.boat.y + Phaser.Math.Between(-20, 20));
    this.shark.setAlpha(0).setPosition(-100, -100);
    this.warning?.destroy();
    this.warning = this.add.graphics().setDepth(25);
    this.warning.lineStyle(5, 0xffe08a, 0.85).strokeCircle(this.leapTarget.x, this.leapTarget.y, 70);
    this.status.setText("LEAP ZONE! The huge yellow circle is a subtle hint.");
    this.time.delayedCall(1250, () => {
      if (token !== this.attackToken || this.mode !== "boss" || !this.shark || !this.leapTarget) return;
      this.attackState = "leap";
      this.warning?.destroy();
      this.warning = undefined;
      const target = this.leapTarget;
      this.shark.setPosition(target.x, target.y + 20).setAlpha(1).setScale(0.9).setAngle(-18);
      this.splash(target.x, target.y, 18);
      this.tweens.add({ targets: this.shark, y: target.y - 80, angle: 18, duration: 330, yoyo: true, ease: "Quad.out" });
      this.time.delayedCall(330, () => {
        if (Phaser.Math.Distance.Between(target.x, target.y, this.boat.x, this.boat.y) < 78) this.hitBoat(target.x);
      });
      this.time.delayedCall(760, () => this.scheduleAttack(token, 720));
    });
  }

  private scheduleAttack(token: number, delay: number) {
    if (token !== this.attackToken || this.mode !== "boss") return;
    this.attackState = "idle";
    this.status.setText("The Great White is reconsidering its angle of approach...");
    this.time.delayedCall(delay, () => {
      if (token === this.attackToken) this.beginNextAttack();
    });
  }

  private updateBoss(delta: number) {
    if (this.attackState === "fin" && this.shark && this.time.now < this.finEndsAt) {
      const angle = Phaser.Math.Angle.Between(this.shark.x, this.shark.y, this.boat.x, this.boat.y);
      this.shark.x += Math.cos(angle) * 72 * delta / 1000;
      this.shark.y += Math.sin(angle) * 72 * delta / 1000;
      this.shark.setAngle(Phaser.Math.RadToDeg(angle));
      if (Phaser.Math.Distance.Between(this.shark.x, this.shark.y, this.boat.x, this.boat.y) < 54) {
        this.hitBoat(this.shark.x);
        this.shark.x -= Math.cos(angle) * 90;
        this.shark.y -= Math.sin(angle) * 90;
      }
    }
  }

  private fireCannon() {
    if (this.mode !== "boss" || !this.shark || this.time.now < this.cannonReadyAt) return;
    this.cannonReadyAt = this.time.now + 560;
    const targetable = this.shark.alpha > 0.5 && this.shark.x > -90 && this.shark.x < this.scale.gameSize.width + 90;
    const direction = this.shark.x < this.boat.x ? -1 : 1;
    this.tweens.add({ targets: this.boat, x: this.boat.x - direction * 8, duration: 70, yoyo: true, ease: "Quad.out" });
    const smoke = this.add.circle(this.boat.x + direction * 40, this.boat.y - 3, 8, 0xffffff, 0.85).setDepth(55);
    this.tweens.add({ targets: smoke, scale: 2, alpha: 0, x: smoke.x + direction * 22, duration: 360, onComplete: () => smoke.destroy() });
    const shot = this.add.circle(this.boat.x + direction * 35, this.boat.y - 5, 6, 0x2a2230, 1).setStrokeStyle(2, 0xf4c95d).setDepth(56);
    const tx = targetable ? this.shark.x : this.boat.x + direction * 330;
    const ty = targetable ? this.shark.y : this.boat.y - 80;
    this.tweens.add({
      targets: shot,
      x: tx,
      y: ty,
      scale: 0.75,
      duration: 380,
      ease: "Quad.out",
      onComplete: () => {
        shot.destroy();
        if (!targetable || this.mode !== "boss" || this.time.now < this.sharkInvulnerableUntil) {
          if (this.mode === "boss") this.status.setText("POW! Excellent shot at the general idea of a shark.");
          return;
        }
        this.hitShark();
      },
    });
  }

  private hitShark() {
    if (!this.shark || this.mode !== "boss") return;
    this.sharkInvulnerableUntil = this.time.now + 470;
    this.sharkHealth -= 1;
    const words = ["BONK!", "POW!", "SPLASH!"];
    const word = this.add.text(this.shark.x, this.shark.y - 38, words[this.sharkHealth % words.length], { fontFamily: "monospace", fontSize: "20px", color: "#f4c95d", stroke: "#2b2233", strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(120);
    this.tweens.add({ targets: word, y: word.y - 35, alpha: 0, scale: 1.5, duration: 620, ease: "Back.out", onComplete: () => word.destroy() });
    this.tweens.add({ targets: this.shark, alpha: 0.25, duration: 70, yoyo: true, repeat: 2 });
    this.splash(this.shark.x, this.shark.y, 8);
    this.status.setText(`DIRECT CARTOON HIT · ${this.sharkHealth} bonks remaining`);
    this.drawHud();
    if (this.sharkHealth <= 0) this.defeatBoss();
  }

  private defeatBoss() {
    if (!this.shark) return;
    this.mode = "victory";
    this.attackToken += 1;
    this.warning?.destroy();
    this.warning = undefined;
    this.status.setText("THE GREAT WHITE has reconsidered its life choices.");
    const { width, height } = this.scale.gameSize;
    const shark = this.shark;
    shark.setAlpha(1).setScale(1).setAngle(0);
    for (let i = 0; i < 6; i++) {
      const star = this.add.image(shark.x, shark.y - 35, "ui_star").setScale(0.55).setDepth(80);
      const angle = i * Math.PI / 3;
      this.tweens.add({ targets: star, x: shark.x + Math.cos(angle) * 48, y: shark.y - 35 + Math.sin(angle) * 20, angle: 180, duration: 520, yoyo: true, repeat: 2, delay: i * 60, onComplete: () => star.destroy() });
    }
    this.tweens.add({ targets: shark, x: width + 170, y: shark.y - 70, angle: 12, duration: 1900, delay: 800, ease: "Sine.in", onComplete: () => shark.destroy(true) });
    this.tweens.add({ targets: this.boat, y: this.boat.y - 14, duration: 150, yoyo: true, repeat: 5, ease: "Back.out" });
    this.tweens.add({ targets: this.boatParrot, angle: 360, scale: 1.3, duration: 620, ease: "Back.out" });
    const win = this.add.text(width / 2, height * 0.3, "BOSS DEFEATED", { fontFamily: "monospace", fontSize: "29px", color: "#f4c95d", stroke: "#2b2233", strokeThickness: 7, resolution: 2 }).setOrigin(0.5).setDepth(210).setScale(0.25);
    this.tweens.add({ targets: win, scale: 1.1, duration: 450, ease: "Back.out", hold: 1700, yoyo: true, onComplete: () => win.destroy() });
    this.drawHud();
    this.time.delayedCall(2800, () => this.arriveLondon());
  }

  private arriveLondon() {
    if (quests.currentStep("q_family_jewel_heist")?.target === "great_white_boss") quests.onMinigame("great_white_boss");
    store.unlockLocation("london");
    store.unlockLocation("london_westend");
    store.setLocation("london_westend");
    store.setInJeep(false);
    if (quests.currentStep("q_family_jewel_heist")?.target === "london") quests.onVisit("london");
    store.setFlag("heist_arrived_london");
    this.mode = "arrival";
    this.clearDanger();
    const { width, height } = this.scale.gameSize;
    const wash = this.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0).setDepth(190);
    this.tweens.add({ targets: wash, alpha: 0.72, duration: 420 });
    const card = this.add.text(width / 2, height * 0.42, "SOMEHOW... LONDON\n\nOperation: Get Grandma's Jewelry Back", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#fff4e6",
      align: "center",
      stroke: "#2b2233",
      strokeThickness: 6,
      resolution: 2,
    }).setOrigin(0.5).setDepth(200).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, scale: 1, duration: 520, ease: "Back.out" });
    this.time.delayedCall(2300, () => {
      uiEvents.emit("sceneReset");
      this.scene.start(SceneKeys.SisterHeist);
    });
  }

  private returnToLondon() {
    store.setLocation("london_westend");
    this.scene.start(SceneKeys.World, { locationId: "london_westend", driving: false });
  }

  private splash(x: number, y: number, amount: number) {
    for (let i = 0; i < amount; i++) {
      const drop = this.add.circle(x, y, Phaser.Math.Between(2, 5), i % 3 ? 0xffffff : 0x8fdcf3, 0.85).setDepth(70);
      const angle = Phaser.Math.FloatBetween(Math.PI * 1.05, Math.PI * 1.95);
      const distance = Phaser.Math.Between(20, 62);
      this.tweens.add({ targets: drop, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.3, duration: Phaser.Math.Between(380, 720), ease: "Quad.out", onComplete: () => drop.destroy() });
    }
  }

  private clearDanger() {
    this.warning?.destroy();
    this.warning = undefined;
    for (const obstacle of this.obstacles) obstacle.view.destroy(true);
    this.obstacles = [];
    this.shark?.destroy(true);
    this.shark = undefined;
  }

  private shutdown() {
    uiEvents.off("action", this.fireCannon, this);
    uiEvents.off("openMap", this.blockMap, this);
    this.input.keyboard?.off("keydown", this.keyAttack, this);
    this.clearDanger();
    controls.moveX = 0;
    controls.moveY = 0;
  }

  update(_time: number, delta: number) {
    if (!this.boat) return;
    this.scrollSea(delta);
    if (this.mode === "sailing" || this.mode === "boss") this.steer(delta);
    if (this.mode === "sailing") this.updateSailing(delta);
    else if (this.mode === "boss") this.updateBoss(delta);
  }
}
