import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { controls, uiEvents } from "../systems/controls";
import { store } from "../systems/store";
import * as quests from "../systems/quests";
import { getVisualTexture } from "../visual";

type RomanceActivity = "romance_us" | "romance_future" | "romance_proposal" | "wedding_planning_one" | "wedding_planning_two";

const CHAPTERS: Record<RomanceActivity, { title: string; subtitle: string; beats: string[][]; finish: string }> = {
  romance_us: { title: "US", subtitle: "A proper date · just Juju and Moomoo", beats: [["Two coffees. Phones face-down. No errands disguised as romance."], ["Moomoo: I like the ordinary parts with you most.", "Juju: Even the part where you steal my coffee?", "Moomoo: Especially that part."], ["They take one slightly crooked Polaroid. It is perfect."]], finish: "Our day, kept." },
  romance_future: { title: "ONE MORE PLACE", subtitle: "Downtown at golden hour", beats: [["They walk until the city lights begin switching on."], ["Work. Travel. Family. The homes they might make together."], ["Moomoo: One more place after this?", "Juju: Always one more place."]], finish: "The future sounds like us." },
  romance_proposal: { title: "ONE QUESTION", subtitle: "A quiet balcony above their noisy little world", beats: [["Moomoo has prepared a speech. He forgets half of it when Juju arrives."], ["Moomoo: I don't need a perfect life. I want our life."], ["Moomoo kneels. The city becomes very quiet.", "Will you marry me?"], ["Juju: Yes. Obviously yes.", "He laughs into the hug like he has been holding his breath for years."]], finish: "ENGAGED ♡" },
  wedding_planning_one: { title: "THE LIST", subtitle: "Invitations, flowers, and forty opinions", beats: [["Juju texts the family. Three replies arrive before the message shows as sent."], ["They choose lanterns, winter flowers and rugs warm enough for a desert evening."], ["Moomoo: We could elope.", "Juju: Too late. Mama made a spreadsheet."]], finish: "Invitations sent. Nerves acquired." },
  wedding_planning_two: { title: "THREE LOOKS", subtitle: "Fitting day · cake day · almost-there day", beats: [["Moroccan celebration. Jordanian celebration. White ceremony. Three beautiful looks, one Juju."], ["Cake tasting becomes a highly scientific process involving seven forks."], ["Moomoo: At the end of all this, I get to call you my wife.", "Everything slows down for one good second."], ["The desert venue is ready. Tomorrow is theirs."]], finish: "WEDDING READY" },
};

export class RomanceScene extends Phaser.Scene {
  private activity: RomanceActivity = "romance_us";
  private beat = 0;
  private panel!: Phaser.GameObjects.Text;
  private finished = false;

  constructor() { super(SceneKeys.Romance); }

  create(data: { activity?: RomanceActivity } = {}) {
    this.activity = data.activity && CHAPTERS[data.activity] ? data.activity : "romance_us";
    const chapter = CHAPTERS[this.activity];
    controls.locked = true;
    this.cameras.main.setBackgroundColor(this.activity === "romance_proposal" ? "#17203b" : "#efb487");
    const { width, height } = this.scale.gameSize;
    for (let i = 0; i < 9; i++) {
      const glow = this.add.circle((i + 0.5) * width / 9, height * 0.23 + Math.sin(i) * 18, 3, i % 2 ? 0xffd37a : 0xfff4e6, 0.8);
      this.tweens.add({ targets: glow, alpha: 0.35, scale: 1.4, duration: 900 + i * 70, yoyo: true, repeat: -1 });
    }
    this.add.rectangle(width / 2, height * 0.68, width, height * 0.64, this.activity === "romance_proposal" ? 0x344b6b : 0xd9b27f, 1);
    const juju = this.add.image(width / 2 - 35, height * 0.62, getVisualTexture(this, "char_her")).setScale(2.4).setOrigin(0.5, 1);
    const moomoo = this.add.image(width / 2 + 35, height * 0.62, getVisualTexture(this, "char_moomoo")).setScale(2.4).setOrigin(0.5, 1);
    this.tweens.add({ targets: [juju, moomoo], y: "-=3", duration: 850, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.add.text(width / 2, 38, chapter.title, { fontFamily: "monospace", fontSize: "32px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 7, fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    this.add.text(width / 2, 78, chapter.subtitle, { fontFamily: "monospace", fontSize: "12px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5);
    this.panel = this.add.text(width / 2, height - 100, "", { fontFamily: "monospace", fontSize: "13px", color: "#3a2b3a", backgroundColor: "rgba(255,249,240,0.95)", padding: { x: 16, y: 12 }, align: "center", wordWrap: { width: Math.min(width - 60, 540) }, fixedWidth: Math.min(width - 40, 560), resolution: 2 }).setOrigin(0.5);
    this.showBeat();
    uiEvents.on("action", this.advance, this);
    this.input.keyboard?.on("keydown-SPACE", this.advance, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.emit("dedicatedStatus", "A · continue the moment", "#fff4e6");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { uiEvents.off("action", this.advance, this); this.input.keyboard?.off("keydown-SPACE", this.advance, this); uiEvents.emit("dedicatedStatus", null); controls.locked = false; });
  }

  private showBeat() { this.panel.setText(this.finished ? CHAPTERS[this.activity].finish : CHAPTERS[this.activity].beats[this.beat].join("\n\n")); }

  private advance() {
    if (this.finished) { uiEvents.emit("sceneReset"); this.scene.start(SceneKeys.World, { locationId: store.state.currentLocation, driving: false }); return; }
    const chapter = CHAPTERS[this.activity];
    if (this.beat < chapter.beats.length - 1) { this.beat += 1; this.showBeat(); return; }
    this.finished = true;
    quests.onMinigame(this.activity);
    if (this.activity === "romance_us") {
      store.unlockMemory("mem_romance_us");
      store.capturePhoto({ id: `romance_us_${store.state.currentDay}`, title: "Us", locationId: store.state.currentLocation, day: store.state.currentDay, timeOfDay: store.state.timeOfDay, companionId: "moomoo", participantIds: ["moomoo"], pose: "hug", frame: "hearts", caption: "Two coffees. One crooked photo. Their ordinary magic." });
      store.incrementStat("dates_completed");
    }
    if (this.activity === "romance_proposal") {
      store.state.relationshipStage = "engaged";
      store.setFlag("engaged");
      store.unlockMemory("mem_proposal");
      store.state.unlockedAccessories.push("engagement_ring");
      store.save();
    }
    this.showBeat();
    uiEvents.emit("dedicatedStatus", "A · return to your little world", "#f4c95d");
  }
}

