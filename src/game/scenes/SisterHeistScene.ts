import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { Player } from "../objects/Player";
import { controls, minimap, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";

type HeistMode = "exterior" | "stealth" | "room" | "escape" | "caught" | "victory";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

interface HidingSpot extends Phaser.Geom.Rectangle {
  label: string;
}

export class SisterHeistScene extends Phaser.Scene {
  private mode: HeistMode = "exterior";
  private player!: Player;
  private fadwa?: Phaser.GameObjects.Sprite;
  private cone?: Phaser.GameObjects.Graphics;
  private extraCone?: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private interactables: Interactable[] = [];
  private current?: Interactable;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInteract = 0;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private wallRects: Phaser.Geom.Rectangle[] = [];
  private hidingSpots: HidingSpot[] = [];
  private checkpoint = new Phaser.Math.Vector2(80, 500);
  private patrol: Phaser.Math.Vector2[] = [];
  private patrolIndex = 0;
  private fadwaFacing = -Math.PI / 2;
  private caughtCooldown = 0;
  private roomSafe?: Phaser.GameObjects.Container;
  private caughtOverlay?: Phaser.GameObjects.Container;
  private pendingDialogueHandler?: () => void;
  private broadcastStatus = "";
  private statusColor = "#fff4e6";
  private readonly blockMap = () => store.toast("The map is under the moustache. Stay stealthy.", "#e46d94");

  constructor() {
    super(SceneKeys.SisterHeist);
  }

  create() {
    this.interactables = [];
    this.current = undefined;
    this.wallRects = [];
    this.hidingSpots = [];
    this.patrol = [];
    this.patrolIndex = 0;
    this.fadwa = undefined;
    this.cone = undefined;
    this.extraCone = undefined;
    this.roomSafe = undefined;
    this.caughtOverlay = undefined;
    this.broadcastStatus = "";
    this.caughtCooldown = 0;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    minimap.on = false;
    uiEvents.emit("sceneReset");
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.blockMap, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const target = quests.currentStep("q_family_jewel_heist")?.target;
    if (target === "house_lock" || target === "enter_fadwa_house") this.buildExterior();
    else if (target === "reach_fadwa_room") this.buildStealth(false);
    else if (target === "drawer_lock" || target === "family_safe") this.buildRoom();
    else if (target === "escape_fadwa_house") this.buildStealth(true);
    else {
      this.scene.start(SceneKeys.World, { locationId: "london_westend", driving: false });
      return;
    }
    this.time.delayedCall(80, () => {
      if (!this.sys.isActive() || !this.status?.text) return;
      this.broadcastStatus = "";
      this.setStatus(this.status.text, this.statusColor);
    });
  }

  private configureWorld(width: number, height: number, zoomBase: number) {
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setBackgroundColor("#25202e");
    const zoom = Phaser.Math.Clamp(this.scale.gameSize.height / Math.min(height, zoomBase), 0.85, 1.9);
    this.cameras.main.setZoom(zoom);
  }

  private buildExterior() {
    this.mode = "exterior";
    const worldW = 640;
    const worldH = 450;
    this.configureWorld(worldW, worldH, 500);
    const g = this.add.graphics().setDepth(Depths.ground);
    g.fillStyle(0x5e7182, 1).fillRect(0, 0, worldW, worldH);
    for (let y = 330; y < worldH; y += 24) {
      for (let x = 0; x < worldW; x += 48) g.fillStyle((x / 48 + y / 24) % 2 ? 0x8c969c : 0x9fa8ad, 1).fillRect(x, y, 46, 22);
    }
    g.fillStyle(0x8f574d, 1).fillRect(105, 65, 430, 270);
    g.fillStyle(0xb56d5d, 1).fillTriangle(75, 72, 320, 15, 565, 72);
    for (let x = 150; x <= 450; x += 100) {
      g.fillStyle(0xc9e5ef, 1).fillRect(x, 105, 54, 70);
      g.lineStyle(5, 0xfff4e6, 1).strokeRect(x, 105, 54, 70).lineBetween(x + 27, 105, x + 27, 175).lineBetween(x, 140, x + 54, 140);
    }
    g.fillStyle(0x244d72, 1).fillRect(280, 220, 80, 115);
    g.fillStyle(0xf4c95d, 1).fillCircle(344, 278, 5);
    g.fillStyle(0x326641, 1).fillCircle(95, 286, 48).fillCircle(545, 286, 48);
    g.fillStyle(0x7a5238, 1).fillRect(88, 284, 14, 48).fillRect(538, 284, 14, 48);
    const rain = this.add.graphics().setDepth(4);
    rain.lineStyle(2, 0xbfe7f6, 0.4);
    for (let i = 0; i < 50; i++) {
      const rx = Phaser.Math.Between(0, worldW);
      const ry = Phaser.Math.Between(0, worldH);
      rain.lineBetween(rx, ry, rx - 8, ry + 14);
    }
    this.tweens.add({ targets: rain, y: 14, x: -8, duration: 420, repeat: -1 });
    this.player = new Player(this, worldW / 2, worldH - 52, "char_her");
    this.player.setDepth(this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    const hudScale = 1 / this.cameras.main.zoom;
    this.status = this.add.text(this.scale.gameSize.width * hudScale / 2, 70 * hudScale, "FADWA'S HOUSE · LONDON", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#fff4e6",
      backgroundColor: "rgba(43,34,51,0.86)",
      padding: { x: 9, y: 5 },
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setScale(hudScale).setDepth(100);
    this.add.text(this.scale.gameSize.width * hudScale / 2, 100 * hudScale, "TOTALLY NORMAL DOOR OPENING", { fontFamily: "monospace", fontSize: "11px", color: "#f4c95d", stroke: "#2b2233", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setScale(hudScale).setDepth(100);
    this.interactables.push({
      x: 320,
      y: 285,
      radius: 42,
      prompt: quests.currentStep("q_family_jewel_heist")?.target === "house_lock" ? "Pick the completely normal door lock" : "Enter Fadwa's house",
      trigger: () => this.useExteriorDoor(),
    });
    this.setStatus("FADWA'S HOUSE · TOTALLY NORMAL DOOR OPENING");
  }

  private useExteriorDoor() {
    const target = quests.currentStep("q_family_jewel_heist")?.target;
    if (target === "house_lock") {
      uiEvents.emit("minigame", {
        kind: "lockpick",
        title: "TOTALLY NORMAL DOOR OPENING",
        hint: "Stop the marker in each green cartoon zone. No real locks were consulted.",
        taps: 3,
        difficulty: 1,
        onDone: (ok?: boolean) => {
          if (!ok || quests.currentStep("q_family_jewel_heist")?.target !== "house_lock") return;
          quests.onInteract("house_lock");
          store.setFlag("heist_front_door_open");
          this.afterDialogue(() => this.scene.restart());
          uiEvents.emit("dialogue", "Juju", ["click...", "Professional.", "Parrot: ARR!"]);
        },
      });
      return;
    }
    if (target === "enter_fadwa_house") {
      quests.onInteract("enter_fadwa_house");
      store.setFlag("heist_checkpoint_1");
      this.cameras.main.fadeOut(420, 43, 34, 51);
      this.time.delayedCall(440, () => this.scene.restart());
    }
  }

  private buildStealth(escaping: boolean) {
    this.mode = escaping ? "escape" : "stealth";
    const worldW = 820;
    const worldH = 560;
    this.configureWorld(worldW, worldH, 590);
    this.solids = this.physics.add.staticGroup();
    this.drawHouseFloor(worldW, worldH);
    this.buildHouseGeometry();
    this.checkpoint = escaping ? new Phaser.Math.Vector2(730, 110) : this.savedCheckpoint();
    this.player = new Player(this, this.checkpoint.x, this.checkpoint.y, "char_her");
    this.player.setDepth(this.player.y);
    this.physics.add.collider(this.player, this.solids);
    this.cameras.main.startFollow(this.player, true, 0.13, 0.13);
    this.fadwa = this.add.sprite(430, escaping ? 225 : 315, "char_fadwa", 0).setOrigin(0.5, 0.85).setDepth(320).setScale(1.12);
    this.fadwa.play("char_fadwa-idle-side", true);
    this.cone = this.add.graphics().setDepth(3);
    this.extraCone = this.add.graphics().setDepth(3);
    this.patrol = escaping
      ? [new Phaser.Math.Vector2(650, 155), new Phaser.Math.Vector2(530, 230), new Phaser.Math.Vector2(430, 365), new Phaser.Math.Vector2(220, 430), new Phaser.Math.Vector2(110, 300)]
      : [new Phaser.Math.Vector2(520, 360), new Phaser.Math.Vector2(530, 190), new Phaser.Math.Vector2(690, 235), new Phaser.Math.Vector2(405, 250), new Phaser.Math.Vector2(235, 410)];
    const hudScale = 1 / this.cameras.main.zoom;
    this.status = this.add.text(this.scale.gameSize.width * hudScale / 2, 74 * hudScale, escaping ? "ESCAPE WITHOUT GETTING CAUGHT" : "FADWA'S HOUSE · BE INCREDIBLY STEALTHY", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: escaping ? "#ff8fae" : "#fff4e6",
      backgroundColor: "rgba(43,34,51,0.9)",
      padding: { x: 9, y: 5 },
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setScale(hudScale).setDepth(100);
    if (escaping) {
      this.interactables.push({ x: 82, y: 510, radius: 42, prompt: "Escape through the front door", trigger: () => this.finishHeist() });
    } else {
      this.interactables.push({ x: 735, y: 83, radius: 42, prompt: "Enter Fadwa's room", trigger: () => this.enterFadwasRoom() });
    }
    this.setStatus(escaping ? "ESCAPE WITHOUT GETTING CAUGHT" : "WAIT · HIDE · MOVE WHEN SHE TURNS", escaping ? "#ff8fae" : "#fff4e6");
  }

  private drawHouseFloor(worldW: number, worldH: number) {
    const floor = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0).setDepth(Depths.ground);
    floor.fill(0xb98a63, 1, 0, 0, worldW, worldH);
    for (let y = 0; y < worldH; y += TILE) for (let x = 0; x < worldW; x += TILE) floor.draw("t_wood", x, y);
    const rugs = this.add.graphics().setDepth(1);
    rugs.fillStyle(0x9d5274, 1).fillRoundedRect(60, 360, 175, 120, 8);
    rugs.fillStyle(0x426f70, 1).fillRoundedRect(330, 170, 205, 130, 8);
    rugs.fillStyle(0x72528f, 1).fillRoundedRect(620, 110, 140, 120, 8);
  }

  private addWall(x: number, y: number, width: number, height: number) {
    const wall = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x443240, 1).setDepth(12);
    wall.setStrokeStyle(2, 0x2b2233);
    this.physics.add.existing(wall, true);
    this.solids.add(wall);
    this.wallRects.push(new Phaser.Geom.Rectangle(x, y, width, height));
  }

  private addFurniture(x: number, y: number, texture: string, width: number, height: number, label?: string) {
    const image = this.add.image(x, y, texture).setScale(1.6).setDepth(y + 6);
    const body = this.add.rectangle(x, y + 4, width, height, 0x000000, 0);
    this.physics.add.existing(body, true);
    this.solids.add(body);
    this.wallRects.push(new Phaser.Geom.Rectangle(x - width / 2, y + 4 - height / 2, width, height));
    if (label) {
      const spot = new Phaser.Geom.Rectangle(x - width / 2 - 12, y - height / 2 - 18, width + 24, height + 36) as HidingSpot;
      spot.label = label;
      this.hidingSpots.push(spot);
      this.add.text(x, y - height / 2 - 15, label, { fontFamily: "monospace", fontSize: "8px", color: "#fff4e6", backgroundColor: "rgba(43,34,51,0.7)", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(y + 8);
    }
    return image;
  }

  private buildHouseGeometry() {
    this.addWall(0, 0, 820, 24);
    this.addWall(0, 536, 820, 24);
    this.addWall(0, 0, 24, 560);
    this.addWall(796, 0, 24, 560);
    this.addWall(255, 24, 20, 250);
    this.addWall(255, 340, 20, 196);
    this.addWall(275, 325, 175, 18);
    this.addWall(520, 325, 276, 18);
    this.addWall(595, 24, 18, 130);
    this.addWall(595, 220, 18, 105);
    this.addWall(690, 24, 18, 46);
    this.addWall(760, 24, 18, 46);
    this.addFurniture(135, 420, "f_sofa", 92, 44, "SOFA SHADOW");
    this.addFurniture(175, 170, "f_bookshelf", 54, 78, "HILARIOUS CURTAIN");
    this.addFurniture(390, 390, "f_plant", 46, 48, "PLANT DISGUISE");
    this.addFurniture(530, 260, "f_table", 78, 48, "TABLE SHADOW");
    this.addFurniture(690, 205, "f_plant", 48, 50, "VERY CONVINCING PLANT");
    this.add.text(735, 52, "FADWA'S ROOM", { fontFamily: "monospace", fontSize: "9px", color: "#fff4e6", backgroundColor: "#9d5274", padding: { x: 4, y: 2 }, resolution: 2 }).setOrigin(0.5).setDepth(30);
    this.add.text(82, 515, "FRONT DOOR", { fontFamily: "monospace", fontSize: "9px", color: "#fff4e6", backgroundColor: "#244d72", padding: { x: 4, y: 2 }, resolution: 2 }).setOrigin(0.5).setDepth(30);
  }

  private savedCheckpoint() {
    if (store.hasFlag("heist_checkpoint_3")) return new Phaser.Math.Vector2(625, 245);
    if (store.hasFlag("heist_checkpoint_2")) return new Phaser.Math.Vector2(355, 395);
    return new Phaser.Math.Vector2(82, 500);
  }

  private updateCheckpoints() {
    if (this.mode !== "stealth") return;
    const checkpoints = [
      { flag: "heist_checkpoint_2", x: 355, y: 395, text: "HALLWAY CHECKPOINT · still not caught" },
      { flag: "heist_checkpoint_3", x: 625, y: 245, text: "UPSTAIRS CHECKPOINT · moustache holding" },
    ];
    for (const point of checkpoints) {
      if (store.hasFlag(point.flag) || Phaser.Math.Distance.Between(this.player.x, this.player.y, point.x, point.y) > 55) continue;
      store.setFlag(point.flag);
      this.checkpoint.set(point.x, point.y);
      store.toast(point.text, "#7be0a3");
      const star = this.add.image(point.x, point.y - 18, "ui_star").setScale(0.6).setDepth(point.y + 20);
      this.tweens.add({ targets: star, y: star.y - 30, alpha: 0, scale: 1.4, duration: 700, onComplete: () => star.destroy() });
    }
  }

  private updateFadwa(delta: number) {
    if (!this.fadwa || this.patrol.length === 0 || this.mode === "caught") return;
    const target = this.patrol[this.patrolIndex];
    const angle = Phaser.Math.Angle.Between(this.fadwa.x, this.fadwa.y, target.x, target.y);
    const speed = this.mode === "escape" ? 73 : 48;
    this.fadwa.x += Math.cos(angle) * speed * delta / 1000;
    this.fadwa.y += Math.sin(angle) * speed * delta / 1000;
    this.fadwaFacing = angle;
    this.fadwa.setFlipX(Math.cos(angle) < 0).setDepth(this.fadwa.y + 4);
    this.fadwa.play(Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? "char_fadwa-walk-side" : angle < 0 ? "char_fadwa-walk-up" : "char_fadwa-walk-down", true);
    if (Phaser.Math.Distance.Between(this.fadwa.x, this.fadwa.y, target.x, target.y) < 8) this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
  }

  private drawVision() {
    if (!this.fadwa || !this.cone || !this.extraCone) return;
    const range = this.mode === "escape" ? 180 : 145;
    const half = this.mode === "escape" ? 0.7 : 0.58;
    const drawOne = (g: Phaser.GameObjects.Graphics, facing: number, alpha: number, length: number) => {
      g.clear();
      const x = this.fadwa!.x;
      const y = this.fadwa!.y - 8;
      g.fillStyle(0xffe08a, alpha);
      g.fillTriangle(x, y, x + Math.cos(facing - half) * length, y + Math.sin(facing - half) * length, x + Math.cos(facing + half) * length, y + Math.sin(facing + half) * length);
    };
    drawOne(this.cone, this.fadwaFacing, 0.22, range);
    if (this.mode === "escape") drawOne(this.extraCone, this.fadwaFacing + 0.9, 0.12, range * 0.72);
    else this.extraCone.clear();
  }

  private isHidden() {
    return this.hidingSpots.find((spot) => spot.contains(this.player.x, this.player.y));
  }

  private lineBlocked(fromX: number, fromY: number) {
    const line = new Phaser.Geom.Line(fromX, fromY, this.player.x, this.player.y);
    return this.wallRects.some((wall) => Phaser.Geom.Intersects.LineToRectangle(line, wall));
  }

  private seenFrom(facing: number, range: number, half: number) {
    if (!this.fadwa) return false;
    const distance = Phaser.Math.Distance.Between(this.fadwa.x, this.fadwa.y, this.player.x, this.player.y);
    if (distance > range) return false;
    const angle = Phaser.Math.Angle.Between(this.fadwa.x, this.fadwa.y, this.player.x, this.player.y);
    if (Math.abs(Phaser.Math.Angle.Wrap(angle - facing)) > half) return false;
    return !this.lineBlocked(this.fadwa.x, this.fadwa.y - 8);
  }

  private checkDetection() {
    if ((this.mode !== "stealth" && this.mode !== "escape") || !this.fadwa || this.time.now < this.caughtCooldown) return;
    const hidden = this.isHidden();
    if (hidden) {
      this.setStatus(`INCREDIBLY STEALTHY · ${hidden.label}`, "#7be0a3");
      return;
    }
    this.setStatus(this.mode === "escape" ? "ESCAPE WITHOUT GETTING CAUGHT" : "WAIT · HIDE · MOVE WHEN SHE TURNS", this.mode === "escape" ? "#ff8fae" : "#fff4e6");
    const range = this.mode === "escape" ? 180 : 145;
    const seen = this.seenFrom(this.fadwaFacing, range, this.mode === "escape" ? 0.7 : 0.58)
      || (this.mode === "escape" && this.seenFrom(this.fadwaFacing + 0.9, range * 0.72, 0.54));
    if (seen) this.getCaught();
  }

  private getCaught() {
    if (this.mode !== "stealth" && this.mode !== "escape") return;
    const escaping = this.mode === "escape";
    this.mode = "caught";
    this.caughtCooldown = this.time.now + 1200;
    store.incrementStat("heist_fadwa_alerts");
    controls.locked = true;
    this.player.move(0, 0);
    this.cameras.main.shake(150, 0.007);
    this.afterDialogue(() => this.showCaughtRestart(escaping));
    if (escaping) {
      uiEvents.emit("dialogue", "Fadwa", ["IS THAT GRANDMA'S JEWELRY?", "Juju: No.", "Parrot: JEWELRY!", "Back to the room door. I cannot believe this."]);
    } else {
      uiEvents.emit("dialogue", "Fadwa", ["Juju...", "Why are you dressed like a pirate?", "Please return to your last extremely stealthy checkpoint."]);
    }
  }

  private showCaughtRestart(escaping: boolean) {
    if (!this.sys.isActive() || this.mode !== "caught" || this.caughtOverlay) return;
    const { width, height } = this.scale.gameSize;
    const hudScale = 1 / this.cameras.main.zoom;
    this.cameras.main.stopFollow();
    const center = this.cameras.main.getWorldPoint(width / 2, height / 2);
    const shade = this.add.rectangle(0, 0, width, height, 0x2b2233, 0.7).setOrigin(0.5);
    const panel = this.add.rectangle(0, 0, 310, 176, 0xfff4e6, 1).setStrokeStyle(5, 0xe46d94);
    const title = this.add.text(0, -57, "FADWA CAUGHT YOU!", {
      fontFamily: "monospace",
      fontSize: "21px",
      color: "#9d315d",
      fontStyle: "bold",
      resolution: 2,
    }).setOrigin(0.5);
    const detail = this.add.text(0, -19, escaping ? "The jewelry is safe. Try the escape again." : "Your latest checkpoint is safe.", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#443240",
      align: "center",
      resolution: 2,
    }).setOrigin(0.5);
    const button = this.add.rectangle(0, 44, 250, 54, 0xe46d94, 1).setStrokeStyle(3, 0x9d315d).setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(0, 44, "RESTART FROM CHECKPOINT", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#fff4e6",
      fontStyle: "bold",
      resolution: 2,
    }).setOrigin(0.5);
    button.on("pointerover", () => button.setFillStyle(0xf07da1));
    button.on("pointerout", () => button.setFillStyle(0xe46d94));
    button.on("pointerup", () => this.restartFromCaught());
    this.caughtOverlay = this.add.container(center.x, center.y, [shade, panel, title, detail, button, buttonText])
      .setScale(hudScale)
      .setDepth(250);
    this.setStatus("CAUGHT · RESTART FROM CHECKPOINT", "#ff8fae");
  }

  private restartFromCaught() {
    if (this.mode !== "caught" || !this.caughtOverlay || !this.sys.isActive()) return;
    this.caughtOverlay.disableInteractive();
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    this.scene.restart();
  }

  private enterFadwasRoom() {
    if (this.mode !== "stealth" || quests.currentStep("q_family_jewel_heist")?.target !== "reach_fadwa_room") return;
    quests.onInteract("reach_fadwa_room");
    store.setFlag("heist_room_reached");
    controls.locked = true;
    const { width, height } = this.scale.gameSize;
    const hudScale = 1 / this.cameras.main.zoom;
    const card = this.add.text(width * hudScale / 2, height * 0.38 * hudScale, "FADWA'S ROOM\nThe treasure is close.", { fontFamily: "monospace", fontSize: "22px", color: "#fff4e6", align: "center", backgroundColor: "#9d5274", padding: { x: 14, y: 9 }, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(150).setScale(0.4 * hudScale);
    this.tweens.add({ targets: card, scale: hudScale, duration: 430, ease: "Back.out" });
    this.time.delayedCall(1400, () => this.scene.restart());
  }

  private buildRoom() {
    this.mode = "room";
    const worldW = 640;
    const worldH = 460;
    this.configureWorld(worldW, worldH, 510);
    const floor = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0).setDepth(Depths.ground);
    floor.fill(0x9d704e, 1, 0, 0, worldW, worldH);
    for (let y = 0; y < worldH; y += TILE) for (let x = 0; x < worldW; x += TILE) floor.draw("t_wood", x, y);
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x443240, 1).fillRect(0, 0, worldW, 28).fillRect(0, 0, 20, worldH).fillRect(worldW - 20, 0, 20, worldH).fillRect(0, worldH - 20, worldW, 20);
    g.fillStyle(0xb87594, 1).fillRoundedRect(175, 245, 270, 115, 10);
    this.add.image(110, 145, "f_bookshelf").setScale(1.8).setDepth(150);
    this.add.image(170, 340, "f_sofa").setScale(1.55).setDepth(345);
    this.add.image(470, 335, "f_plant").setScale(1.5).setDepth(340);
    const dresser = this.add.graphics().setDepth(180);
    dresser.fillStyle(0x7a5238, 1).fillRoundedRect(415, 105, 155, 105, 6);
    for (let row = 0; row < 3; row++) {
      dresser.fillStyle(0x9b6b49, 1).fillRoundedRect(425, 115 + row * 30, 135, 24, 3);
      dresser.fillStyle(0xf4c95d, 1).fillCircle(492, 127 + row * 30, 3);
    }
    this.player = new Player(this, worldW / 2, worldH - 48, "char_her");
    this.player.setDepth(this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.13, 0.13);
    const hudScale = 1 / this.cameras.main.zoom;
    this.status = this.add.text(this.scale.gameSize.width * hudScale / 2, 72 * hudScale, quests.currentStep("q_family_jewel_heist")?.target === "drawer_lock" ? "FIND THE CORRECT DRAWER" : "GRANDMA'S SAFE · FINAL LOCK", { fontFamily: "monospace", fontSize: "14px", color: "#fff4e6", backgroundColor: "rgba(43,34,51,0.9)", padding: { x: 9, y: 5 }, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setScale(hudScale).setDepth(100);
    this.interactables.push(
      { x: 445, y: 127, radius: 32, prompt: "Search sock drawer", trigger: () => this.roomJoke("Sock drawer", "Not the treasure. An extremely aggressive amount of socks.") },
      { x: 540, y: 127, radius: 32, prompt: "Search skincare drawer", trigger: () => this.roomJoke("Skincare drawer", "Seven serums. Zero grandmothers.") },
      { x: 445, y: 157, radius: 32, prompt: "Search snack drawer", trigger: () => this.roomJoke("Snack drawer", "Emergency biscuits. Respect.") },
      { x: 540, y: 157, radius: 32, prompt: "Search receipt drawer", trigger: () => this.roomJoke("Receipt drawer", "Receipts from 2019. This is the real crime scene.") },
      { x: 492, y: 190, radius: 40, prompt: "Open suspiciously correct drawer", trigger: () => this.useCorrectDrawer() },
    );
    if (quests.currentStep("q_family_jewel_heist")?.target === "family_safe") this.revealSafe();
    this.setStatus(quests.currentStep("q_family_jewel_heist")?.target === "drawer_lock" ? "FIND THE CORRECT DRAWER" : "GRANDMA'S SAFE · FINAL LOCK");
  }

  private roomJoke(title: string, line: string) {
    uiEvents.emit("dialogue", title, [line]);
  }

  private useCorrectDrawer() {
    const target = quests.currentStep("q_family_jewel_heist")?.target;
    if (target === "drawer_lock") {
      uiEvents.emit("minigame", {
        kind: "lockpick",
        title: "THE SUSPICIOUS DRAWER",
        hint: "Four smaller cartoon timing zones. Still not real lock advice.",
        taps: 4,
        difficulty: 2,
        onDone: (ok?: boolean) => {
          if (!ok || quests.currentStep("q_family_jewel_heist")?.target !== "drawer_lock") return;
          quests.onMinigame("drawer_lock");
          store.setFlag("heist_drawer_open");
          this.afterDialogue(() => this.scene.restart());
          uiEvents.emit("dialogue", "Juju", ["CLICK.", "A safe inside a drawer. Fadwa understands drama."]);
        },
      });
    } else if (target === "family_safe") {
      store.toast("The drawer is already open. The safe is glowing suspiciously.", "#f4c95d");
    }
  }

  private revealSafe() {
    const safe = this.add.graphics();
    safe.fillStyle(0x59616d, 1).fillRoundedRect(-40, -31, 80, 62, 6).lineStyle(3, 0x2b2233, 1).strokeRoundedRect(-40, -31, 80, 62, 6);
    safe.fillStyle(0xf4c95d, 1).fillCircle(0, 0, 12).fillStyle(0x3a2b3a, 1).fillCircle(0, 0, 4);
    const glow = this.add.ellipse(0, 0, 104, 80, 0xf4c95d, 0.15);
    this.roomSafe = this.add.container(312, 150, [glow, safe]).setDepth(190).setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: this.roomSafe, scale: 1, alpha: 1, duration: 520, ease: "Back.out" });
    this.tweens.add({ targets: glow, alpha: 0.4, scale: 1.12, duration: 650, yoyo: true, repeat: -1 });
    this.interactables.push({ x: 312, y: 150, radius: 50, prompt: "Open Grandma's hidden safe", trigger: () => this.openFamilySafe() });
  }

  private openFamilySafe() {
    if (quests.currentStep("q_family_jewel_heist")?.target !== "family_safe") return;
    uiEvents.emit("minigame", {
      kind: "safe",
      title: "GRANDMA'S FAMILY SAFE",
      hint: "Stage 1: stop the fictional dial. Stage 2: hit four arcade pins.",
      difficulty: 3,
      onDone: (ok?: boolean) => {
        if (!ok || quests.currentStep("q_family_jewel_heist")?.target !== "family_safe") return;
        if (!store.hasFlag("heist_jewelry_claimed")) {
          if (!store.hasItem("grandmas_jewelry")) store.addItem("grandmas_jewelry");
          if (!store.hasItem("mamas_bangle")) store.addItem("mamas_bangle");
          store.unlockAccessory("bangle");
          store.setAccessory("bangle");
          store.setFlag("heist_jewelry_claimed");
        }
        quests.onMinigame("family_safe");
        store.setFlag("heist_safe_checkpoint");
        this.treasureBurst(312, 145);
        this.afterDialogue(() => this.scene.restart());
        uiEvents.emit("dialogue", "Juju", ["CLICK.", "Mama's gold bangles! Grandma's jewelry!", "Mine—", "...OURS.", "Parrot: ARR."]);
      },
    });
  }

  private treasureBurst(x: number, y: number) {
    const jewelry = this.add.image(x - 18, y, "i_jewelry").setScale(2).setDepth(220);
    const bangles = this.add.image(x + 18, y, "i_bangle").setScale(2).setDepth(220);
    this.tweens.add({ targets: [jewelry, bangles], y: y - 55, angle: 180, scale: 3, duration: 760, ease: "Back.out", yoyo: true, hold: 350, onComplete: () => { jewelry.destroy(); bangles.destroy(); } });
    for (let i = 0; i < 14; i++) {
      const star = this.add.image(x, y, "ui_star").setScale(0.35).setDepth(219);
      const angle = i * Math.PI * 2 / 14;
      this.tweens.add({ targets: star, x: x + Math.cos(angle) * Phaser.Math.Between(45, 90), y: y + Math.sin(angle) * Phaser.Math.Between(35, 75), alpha: 0, scale: 0.9, duration: 760, delay: i * 30, onComplete: () => star.destroy() });
    }
  }

  private finishHeist() {
    if (this.mode !== "escape" || quests.currentStep("q_family_jewel_heist")?.target !== "escape_fadwa_house") return;
    quests.onInteract("escape_fadwa_house");
    this.mode = "victory";
    controls.locked = true;
    this.player.move(0, 0);
    const { width, height } = this.scale.gameSize;
    const door = this.add.rectangle(this.player.x, this.player.y - 24, 64, 86, 0x244d72, 1).setDepth(this.player.y + 12).setScale(0, 1);
    this.tweens.add({ targets: door, scaleX: 1, duration: 260, ease: "Back.out" });
    this.tweens.add({ targets: this.player, x: this.player.x - 70, y: this.player.y + 4, duration: 620, ease: "Quad.out" });
    this.cameras.main.shake(80, 0.003);
    const hudScale = 1 / this.cameras.main.zoom;
    const shade = this.add.rectangle(width * hudScale / 2, height * hudScale / 2, width, height, 0x2b2233, 0).setScrollFactor(0).setScale(hudScale).setDepth(180);
    this.tweens.add({ targets: shade, alpha: 0.78, delay: 650, duration: 450 });
    const title = this.add.text(width * hudScale / 2, height * 0.24 * hudScale, "MISSION COMPLETE", { fontFamily: "monospace", fontSize: "28px", color: "#f4c95d", stroke: "#2b2233", strokeThickness: 7, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setScale(0.2 * hudScale).setAlpha(0);
    const subtitle = this.add.text(width * hudScale / 2, (height * 0.24 + 46) * hudScale, "THE GREAT FAMILY JEWEL HEIST", { fontFamily: "monospace", fontSize: "16px", color: "#fff4e6", stroke: "#2b2233", strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setScale(hudScale).setAlpha(0);
    const alerts = store.getStat("heist_fadwa_alerts");
    const stats = this.add.text(width * hudScale / 2, height * 0.53 * hudScale, `SHARKS DEFEATED: 1\nLOCKS DEFINITELY NOT PICKED: 3\nFADWAS ALERTED: ${alerts}\nJEWELRY RECOVERED: 100%`, {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#3a2b3a",
      align: "left",
      backgroundColor: "#fff4e6",
      padding: { x: 14, y: 10 },
      lineSpacing: 7,
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0).setScale(0.8 * hudScale);
    this.tweens.add({ targets: title, alpha: 1, scale: hudScale, delay: 850, duration: 440, ease: "Back.out" });
    this.tweens.add({ targets: subtitle, alpha: 1, delay: 1150, duration: 420 });
    this.tweens.add({ targets: stats, alpha: 1, scale: hudScale, delay: 1550, duration: 440, ease: "Back.out" });
    for (let i = 0; i < 30; i++) {
      const confetti = this.add.rectangle(Phaser.Math.Between(20, width - 20) * hudScale, -20 * hudScale, Phaser.Math.Between(4, 8), Phaser.Math.Between(8, 15), [0xf4c95d, 0xe46d94, 0x7be0a3, 0x8ecae6][i % 4], 1).setScrollFactor(0).setScale(hudScale).setDepth(205).setAngle(Phaser.Math.Between(0, 180));
      this.tweens.add({ targets: confetti, y: (height + 30) * hudScale, x: confetti.x + Phaser.Math.Between(-60, 60) * hudScale, angle: confetti.angle + 360, duration: Phaser.Math.Between(1800, 3000), delay: 900 + i * 45, onComplete: () => confetti.destroy() });
    }
    const removal = this.add.text(width * hudScale / 2, (height - 76) * hudScale, "", { fontFamily: "monospace", fontSize: "12px", color: "#fff4e6", stroke: "#2b2233", strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setScrollFactor(0).setScale(hudScale).setDepth(210);
    this.time.delayedCall(2850, () => removal.setText("hat off..."));
    this.time.delayedCall(3250, () => removal.setText("moustache retired..."));
    this.time.delayedCall(3650, () => removal.setText("eye patch returned to active duty never."));
    this.time.delayedCall(3950, () => {
      store.setFlag("pirate_disguise", false);
      removal.setText("Parrot: ARR!  (flies into the sunset)");
    });
    this.time.delayedCall(5000, () => {
      store.setFlag("heist_voyage_complete", false);
      store.setFlag("heist_arrived_london", false);
      store.setFlag("heist_front_door_open", false);
      store.setFlag("heist_checkpoint_1", false);
      store.setFlag("heist_checkpoint_2", false);
      store.setFlag("heist_checkpoint_3", false);
      store.setFlag("heist_room_reached", false);
      store.setFlag("heist_drawer_open", false);
      store.setFlag("heist_safe_checkpoint", false);
      uiEvents.emit("sceneReset");
      this.scene.start(SceneKeys.World, { locationId: "london_westend", driving: false });
    });
  }

  private tryInteract() {
    if (this.mode === "caught") {
      this.restartFromCaught();
      return;
    }
    if (controls.locked || this.mode === "victory" || !this.current || this.time.now - this.lastInteract < 220) return;
    this.lastInteract = this.time.now;
    this.current.trigger();
  }

  private afterDialogue(callback: () => void) {
    if (this.pendingDialogueHandler) uiEvents.off("dialogueClosed", this.pendingDialogueHandler);
    const handler = () => {
      this.pendingDialogueHandler = undefined;
      callback();
    };
    this.pendingDialogueHandler = handler;
    uiEvents.once("dialogueClosed", handler);
  }

  private setStatus(message: string, color = "#fff4e6") {
    this.status?.setText(message).setColor(color);
    this.statusColor = color;
    const key = `${color}:${message}`;
    if (key === this.broadcastStatus) return;
    this.broadcastStatus = key;
    uiEvents.emit("dedicatedStatus", message, color);
  }

  private refreshInteractable() {
    let nearest: Interactable | undefined;
    let best = Infinity;
    for (const item of this.interactables) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (distance < item.radius && distance < best) {
        nearest = item;
        best = distance;
      }
    }
    if (nearest === this.current) return;
    this.current = nearest;
    uiEvents.emit("prompt", nearest?.prompt ?? null);
  }

  private movePlayer() {
    let vx = 0;
    let vy = 0;
    if (this.mode === "caught") {
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.restartFromCaught();
      this.player.move(0, 0);
      return;
    }
    if (!controls.locked && this.mode !== "victory") {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.tryInteract();
    }
    const length = Math.hypot(vx, vy);
    if (length > 1) { vx /= length; vy /= length; }
    this.player.move(vx * this.player.speed, vy * this.player.speed);
    if (this.mode === "exterior") {
      this.player.x = Phaser.Math.Clamp(this.player.x, 24, 616);
      this.player.y = Phaser.Math.Clamp(this.player.y, 110, 425);
    } else if (this.mode === "room") {
      this.player.x = Phaser.Math.Clamp(this.player.x, 28, 612);
      this.player.y = Phaser.Math.Clamp(this.player.y, 48, 430);
    }
  }

  private shutdown() {
    if (this.pendingDialogueHandler) uiEvents.off("dialogueClosed", this.pendingDialogueHandler);
    this.pendingDialogueHandler = undefined;
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("openMap", this.blockMap, this);
    uiEvents.emit("prompt", null);
    uiEvents.emit("dedicatedStatus", null);
    controls.moveX = 0;
    controls.moveY = 0;
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    this.movePlayer();
    if (this.mode === "stealth" || this.mode === "escape") {
      this.updateFadwa(delta);
      this.drawVision();
      this.updateCheckpoints();
      this.checkDetection();
    }
    this.refreshInteractable();
  }
}
