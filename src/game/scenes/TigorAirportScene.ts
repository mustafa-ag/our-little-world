import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { controls, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { store } from "../systems/store";
import { getVisualTexture } from "../visual";

const FONT = "monospace";

/** Dedicated arrivals reunion and Tigor's first permanent home moment. */
export class TigorAirportScene extends Phaser.Scene {
  private beat = 0;
  private stage?: Phaser.GameObjects.Container;
  private juju?: Phaser.GameObjects.Image;
  private chloe?: Phaser.GameObjects.Image;
  private tigor?: Phaser.GameObjects.Image;
  private carrier?: Phaser.GameObjects.Container;
  private completed = false;

  constructor() {
    super(SceneKeys.TigorAirport);
  }

  create() {
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("sceneReset");
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.on("action", this.advance, this);
    this.input.keyboard?.on("keydown-SPACE", this.advance, this);
    this.input.keyboard?.on("keydown-ENTER", this.advance, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownAirport, this);
    this.drawArrivals();
  }

  private shutdownAirport() {
    uiEvents.off("action", this.advance, this);
    this.input.keyboard?.off("keydown-SPACE", this.advance, this);
    this.input.keyboard?.off("keydown-ENTER", this.advance, this);
    uiEvents.emit("dedicatedStatus", null);
    controls.locked = false;
  }

  private drawArrivals() {
    if (this.stage) this.tweens.killTweensOf(this.stage.getAll());
    this.stage?.destroy(true);
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#273b54");
    this.stage = this.add.container(0, 0);
    const glass = this.add.rectangle(width / 2, height * 0.32, width, height * 0.64, 0x5b7d99);
    const floor = this.add.rectangle(width / 2, height * 0.79, width, height * 0.42, 0xb9b7ad);
    const reflection = this.add.rectangle(width / 2, height * 0.76, width * 0.72, 3, 0xeaf5ff, 0.4);
    const title = this.add.text(width / 2, 19, "ABU DHABI ARRIVALS", { fontFamily: FONT, fontSize: "27px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 6, fontStyle: "bold", resolution: 2 }).setOrigin(0.5, 0);
    const board = this.add.text(width / 2, 63, "LONDON  EY020  ·  ARRIVED", { fontFamily: FONT, fontSize: "11px", color: "#8df0bb", backgroundColor: "#182531", padding: { x: 14, y: 5 }, resolution: 2 }).setOrigin(0.5, 0);
    this.stage.add([glass, floor, reflection, title, board]);
    for (let index = 0; index < 7; index += 1) {
      const post = this.add.rectangle(index * width / 6, height * 0.38, 4, height * 0.48, 0xdce7ed, 0.65);
      this.stage.add(post);
    }
    const family = ["mama", "baba", "moomoo"];
    family.forEach((id, index) => {
      const person = this.add.image(width / 2 + (index - 1) * 58, height * 0.72, getVisualTexture(this, `char_${id}`)).setScale(2).setOrigin(0.5, 1);
      this.stage?.add(person);
      this.tweens.add({ targets: person, y: "-=3", duration: 680 + index * 110, yoyo: true, repeat: -1 });
    });
    this.juju = this.add.image(width * 0.22, height * 0.69, getVisualTexture(this, "char_her")).setScale(2).setOrigin(0.5, 1).setAlpha(0.25);
    this.chloe = this.add.image(width * 0.14, height * 0.69, getVisualTexture(this, "char_chloe")).setScale(2).setOrigin(0.5, 1).setAlpha(0.25);
    this.tigor = this.add.image(width * 0.09, height * 0.69, "o_tigor").setScale(2.5).setOrigin(0.5, 1).setAlpha(0.25);
    this.stage.add([this.juju, this.chloe, this.tigor]);
    this.showBeat("The arrivals doors remain closed for exactly long enough to become personal.", "A · watch the doors");
  }

  private showBeat(text: string, status = "A · continue") {
    const { width, height } = this.scale.gameSize;
    const old = this.stage?.getAll().find((child) => child.name === "airport-card") as Phaser.GameObjects.Text | undefined;
    old?.destroy();
    const card = this.add.text(width / 2, height - 102, text, {
      fontFamily: FONT, fontSize: width < 620 ? "10px" : "12px", color: "#3a2b3a", backgroundColor: "rgba(255,249,240,0.96)",
      padding: { x: 13, y: 10 }, fixedWidth: Math.min(width - 26, 660), wordWrap: { width: Math.min(width - 58, 625) }, align: "center", lineSpacing: 3, resolution: 2,
    }).setOrigin(0.5, 0).setName("airport-card");
    this.stage?.add(card);
    uiEvents.emit("dedicatedStatus", status, status.includes("HOME") ? "#f4c95d" : "#fff4e6");
  }

  private advance() {
    if (this.completed) {
      uiEvents.emit("sceneReset");
      this.scene.start(SceneKeys.House, { propertyId: store.state.primaryHomeId, title: "TIGOR'S HOME" });
      return;
    }
    this.beat += 1;
    if (this.beat === 1) this.openDoors();
    else if (this.beat === 2) this.tigorRun();
    else if (this.beat === 3) this.tearFlood();
    else if (this.beat === 4) this.familyPile();
    else this.bringTigorHome();
  }

  private openDoors() {
    const { width, height } = this.scale.gameSize;
    const left = this.add.rectangle(width / 2 - 42, height * 0.42, 84, height * 0.52, 0xaed4e5, 0.85).setStrokeStyle(3, 0xeaf5ff);
    const right = this.add.rectangle(width / 2 + 42, height * 0.42, 84, height * 0.52, 0xaed4e5, 0.85).setStrokeStyle(3, 0xeaf5ff);
    this.stage?.add([left, right]);
    this.tweens.add({ targets: left, x: left.x - 83, duration: 620, ease: "Cubic.inOut" });
    this.tweens.add({ targets: right, x: right.x + 83, duration: 620, ease: "Cubic.inOut" });
    this.juju?.setAlpha(1);
    this.chloe?.setAlpha(1);
    this.tigor?.setAlpha(1);
    this.tweens.add({ targets: [this.juju, this.chloe, this.tigor], x: "+=55", duration: 720, ease: "Sine.out" });
    const carrierG = this.add.graphics();
    carrierG.lineStyle(3, 0x3a2b3a, 0.85).strokeRoundedRect(-19, -18, 38, 23, 4).beginPath().arc(0, -18, 9, Math.PI, Math.PI * 2).strokePath();
    for (let bar = -12; bar <= 12; bar += 8) carrierG.lineBetween(bar, -16, bar, 3);
    this.carrier = this.add.container((this.tigor?.x ?? width * 0.09) + 55, (this.tigor?.y ?? height * 0.69) - 2, [carrierG]).setDepth(40);
    const luggage = this.add.rectangle((this.chloe?.x ?? width * 0.14) + 73, (this.chloe?.y ?? height * 0.69) - 10, 29, 34, 0x8b5a7b).setStrokeStyle(3, 0x3a2b3a).setDepth(38);
    const folder = this.add.text(luggage.x + 25, luggage.y - 5, "FORMS\n×47", { fontFamily: FONT, fontSize: "8px", color: "#3a2b3a", backgroundColor: "#ffe08a", padding: { x: 5, y: 3 }, align: "center", resolution: 2 }).setOrigin(0, 0.5).setAngle(4).setDepth(39);
    this.stage?.add([this.carrier, luggage, folder]);
    this.showBeat("The doors open. Chloe appears with the document folder. Juju appears with the carrier.\nOne orange face presses against the little window.", "A · TIGOR!");
  }

  private tigorRun() {
    const { width, height } = this.scale.gameSize;
    if (!this.tigor) return;
    this.carrier?.destroy(true);
    this.carrier = undefined;
    const start = { x: this.tigor.x, y: this.tigor.y };
    this.tweens.add({ targets: this.tigor, x: width / 2 + 58, y: height * 0.7, scale: 3, angle: 3, duration: 900, ease: "Cubic.in", onUpdate: () => {
      if (this.tigor) this.tigor.y = start.y + Math.sin(this.tweens.getTweensOf(this.tigor)[0]?.progress * Math.PI * 7) * 8;
    } });
    for (let index = 0; index < 13; index += 1) {
      const heart = this.add.text(width / 2 + Phaser.Math.Between(-115, 115), height * 0.48 + Phaser.Math.Between(-38, 55), index % 3 ? "♥" : "♡", { fontFamily: FONT, fontSize: `${13 + index % 4 * 3}px`, color: index % 2 ? "#ff8fae" : "#fff4e6", resolution: 2 }).setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: heart, y: heart.y - 35, alpha: 0, duration: 900 + index * 45, delay: 300, onComplete: () => heart.destroy() });
    }
    this.showBeat("Tigor recognises everybody at once.\nHe runs like the airport floor personally offended him.", "A · attempt emotional composure");
  }

  private tearFlood() {
    const { width, height } = this.scale.gameSize;
    const water = this.add.rectangle(width / 2, height + 20, width, 1, 0x71c8ef, 0.58).setOrigin(0.5, 1);
    this.stage?.add(water);
    this.tweens.add({ targets: water, height: height * 0.23, duration: 1100, ease: "Sine.out" });
    for (let index = 0; index < 22; index += 1) {
      const drop = this.add.text(Phaser.Math.Between(15, width - 15), Phaser.Math.Between(100, height - 90), "💧", { fontFamily: '"Apple Color Emoji", system-ui', fontSize: "16px" }).setDepth(60).setAlpha(0);
      this.tweens.add({ targets: drop, alpha: 1, y: drop.y + 45, duration: 550, delay: index * 45, yoyo: true, onComplete: () => drop.destroy() });
    }
    this.cameras.main.shake(180, 0.003);
    this.showBeat("Everyone cries. Tigor cries because the carrier had rules.\nBaba claims the airport air conditioning is unusually emotional.\nThe tears reach baggage claim.", "A · group hug before flotation devices");
  }

  private familyPile() {
    const { width, height } = this.scale.gameSize;
    const pile = this.add.text(width / 2, height * 0.48, "BIGGEST\nFAMILY HUG", { fontFamily: FONT, fontSize: "25px", color: "#fff4e6", stroke: "#e46d94", strokeThickness: 8, fontStyle: "bold", align: "center", resolution: 2 }).setOrigin(0.5).setScale(0.2).setDepth(100);
    this.stage?.add(pile);
    this.tweens.add({ targets: pile, scale: 1, angle: -2, duration: 520, ease: "Back.out" });
    this.showBeat("Moomoo: You two know he was only in the UK, right?\nJuju + Chloe: SHUT UP.\nTigor: mrrp\nJuju: We did it. We actually brought him home.", "A · TAKE TIGOR HOME");
  }

  private bringTigorHome() {
    if (!this.completed) this.completeMission();
    if (this.stage) this.tweens.killTweensOf(this.stage.getAll());
    this.stage?.destroy(true);
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#d9b995");
    this.stage = this.add.container(0, 0);
    const wall = this.add.rectangle(width / 2, height * 0.36, width, height * 0.72, 0xf0dfc9);
    const floor = this.add.rectangle(width / 2, height * 0.84, width, height * 0.32, 0xbe926d);
    const rug = this.add.ellipse(width / 2, height * 0.77, Math.min(width * 0.56, 460), 68, 0xd98aa2, 0.72);
    const title = this.add.text(width / 2, 25, "TIGOR IS HOME", { fontFamily: FONT, fontSize: "31px", color: "#e46d94", stroke: "#fff4e6", strokeThickness: 5, fontStyle: "bold", resolution: 2 }).setOrigin(0.5, 0);
    const tigor = this.add.image(width / 2, height * 0.69, "o_tigor").setScale(4).setOrigin(0.5, 1);
    const bowl = this.add.ellipse(width / 2 + 86, height * 0.72, 52, 18, 0x4d87a9).setStrokeStyle(3, 0x2b3d52);
    const box = this.add.rectangle(width / 2 - 105, height * 0.68, 70, 52, 0xbc8757).setStrokeStyle(3, 0x7a5238).setAngle(-3);
    this.stage.add([wall, floor, rug, title, bowl, box, tigor]);
    this.tweens.add({ targets: tigor, y: "-=5", angle: 3, duration: 650, yoyo: true, repeat: -1 });
    this.showBeat("Juju: Come on, Tigor. You're home.\n\nPermanent pet unlocked: TIGOR\nBring him exploring from Phone › People, or let him nap at home beside Mishmish. Human companions keep their own slot.", "A · ENTER TIGOR'S HOME");
    this.completed = true;
  }

  private completeMission() {
    const firstCanonicalCompletion = !store.isQuestReplay && !store.state.tigor.unlocked;
    store.setLocation("abudhabi_yas");
    store.setInJeep(false);
    store.unlockTigor();
    if (firstCanonicalCompletion) {
      store.capturePhoto({
        id: "tigor_arrival",
        title: "Tigor Comes Home",
        locationId: "abudhabi_yas",
        day: store.state.currentDay,
        timeOfDay: store.state.timeOfDay,
        companionId: "moomoo",
        participantIds: ["tigor", "chloe", "moomoo", "mama", "baba"],
        pose: "hug",
        frame: "hearts",
        caption: "Two governments, one flight, and enough tears to delay baggage claim.",
      });
      store.addRelationship("moomoo", 4);
    }
    quests.onMinigame("retrieve_tigor_campaign");
  }
}
