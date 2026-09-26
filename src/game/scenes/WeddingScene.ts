import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { controls, uiEvents } from "../systems/controls";
import { store } from "../systems/store";
import * as quests from "../systems/quests";
import { Player } from "../objects/Player";
import { getVisualTexture } from "../visual";

type WeddingPhase = "arrival" | "moroccan" | "cartoon" | "boss" | "jordanian" | "ceremony" | "party" | "complete";

export class WeddingScene extends Phaser.Scene {
  private player!: Player;
  private moomoo!: Phaser.GameObjects.Image;
  private phase: WeddingPhase = "arrival";
  private card!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private mischief = 100;
  private boss?: Phaser.GameObjects.Container;
  private bossBar?: Phaser.GameObjects.Graphics;
  private attackCooldown = 0;
  private hazards: { go: Phaser.GameObjects.Arc; vx: number; vy: number }[] = [];
  private hits = 0;
  private lastAction = 0;
  private bossDefeated = false;

  constructor() { super(SceneKeys.Wedding); }

  create() {
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor("#46506e");
    this.add.rectangle(width / 2, height * 0.72, width, height * 0.56, 0xdab779);
    for (let i = 0; i < 5; i++) this.add.ellipse(width * (i * 0.27 - 0.05), height * 0.63 + (i % 2) * 18, width * 0.42, height * 0.22, i % 2 ? 0xc99d5f : 0xe8ca8b);
    for (let i = 0; i < 10; i++) {
      const lantern = this.add.circle(18 + i * (width - 36) / 9, 88 + Math.sin(i) * 12, 4, 0xffd36b, 0.92);
      this.tweens.add({ targets: lantern, alpha: 0.45, scale: 1.35, duration: 760 + i * 55, yoyo: true, repeat: -1 });
    }
    this.add.text(width / 2, 28, "JUJU + MOOMOO", { fontFamily: "monospace", fontSize: "26px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 6, fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const guestIds = ["mama", "baba", "fadwa", "nour", "jad", "shan", "hazel", "rhiannon", "chloe"];
    guestIds.forEach((id, index) => {
      const x = 28 + (index % 5) * Math.max(42, (width - 56) / 4);
      const y = height * 0.48 + Math.floor(index / 5) * 48;
      const guest = this.add.image(x, y, getVisualTexture(this, `char_${id}`)).setOrigin(0.5, 1).setScale(1.25).setDepth(y);
      this.tweens.add({ targets: guest, y: y - 2, duration: 800 + index * 60, yoyo: true, repeat: -1 });
    });
    this.player = new Player(this, width / 2 - 26, height * 0.66, getVisualTexture(this, "char_her"));
    this.player.setScale(1.9).setDepth(height * 0.7);
    this.moomoo = this.add.image(width / 2 + 28, height * 0.66, getVisualTexture(this, "char_moomoo")).setOrigin(0.5, 1).setScale(1.9).setDepth(height * 0.7);
    this.card = this.add.text(width / 2, height - 64, "", { fontFamily: "monospace", fontSize: "12px", color: "#3a2b3a", backgroundColor: "rgba(255,249,240,0.96)", padding: { x: 14, y: 9 }, align: "center", fixedWidth: Math.min(width - 30, 600), wordWrap: { width: Math.min(width - 60, 560) }, resolution: 2 }).setOrigin(0.5);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.onAction, this);
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    this.showPhase();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { uiEvents.off("action", this.onAction, this); uiEvents.emit("dedicatedStatus", null); this.clearHazards(); controls.locked = false; });
  }

  private showPhase() {
    const lines: Record<Exclude<WeddingPhase, "boss">, string> = {
      arrival: "DUBAI DESERT · WINTER SUNSET\nThe lanterns wake one by one. Everyone important is here.\nA · begin",
      moroccan: "MOROCCAN CELEBRATION\nJuju steps out in gold, green and warm jewel tones. Moomoo forgets the sentence he prepared.\nA · celebrate",
      cartoon: "Mama and Baba see each other.\nPause. Red faces. Tiny steam.\nA · oh no",
      jordanian: "JORDANIAN CELEBRATION\nA deep red embroidered look, dancing, family, and the ring box safely—\nWait. Where is the ring box?\nA · look toward the dune",
      ceremony: "WHITE CEREMONY\nThe jokes stop. Desert stars come out. Moomoo takes Juju's hands.\nA · vows",
      party: "Rings. Kiss. Family cheering. Mabrouk eating cake in the background.\nThe whole little world feels close enough to hold.\nA · one last dance",
      complete: "MARRIED ♡\nThe wedding was the end of waiting. Their bigger life begins now.\nA · go home together",
    };
    if (this.phase !== "boss") this.card.setText(lines[this.phase]);
    uiEvents.emit("dedicatedStatus", this.phase === "boss" ? "MOVE · dodge   A · toss a wedding sweet" : "A · continue", this.phase === "complete" ? "#f4c95d" : "#fff4e6");
  }

  private onAction() {
    if (this.phase === "boss") {
      if (this.bossDefeated) { this.phase = "ceremony"; this.showPhase(); }
      else this.hitBoss();
      return;
    }
    if (this.phase === "complete") { uiEvents.emit("sceneReset"); this.scene.start(SceneKeys.World, { locationId: "abudhabi_yas", driving: false }); return; }
    if (this.phase === "cartoon") this.playCartoonFight();
    const order: WeddingPhase[] = ["arrival", "moroccan", "cartoon", "jordanian", "boss", "ceremony", "party", "complete"];
    this.phase = order[order.indexOf(this.phase) + 1] ?? "complete";
    if (this.phase === "complete") this.completeWedding();
    if (this.phase === "boss") this.startBoss();
    else this.showPhase();
  }

  private playCartoonFight() {
    const { width, height } = this.scale.gameSize;
    const cloud = this.add.container(width / 2, height * 0.47).setDepth(5000);
    for (let i = 0; i < 11; i++) cloud.add(this.add.circle(Phaser.Math.Between(-42, 42), Phaser.Math.Between(-24, 24), Phaser.Math.Between(13, 25), 0xf4eee5, 0.95));
    for (let i = 0; i < 8; i++) cloud.add(this.add.text(Phaser.Math.Between(-40, 40), Phaser.Math.Between(-25, 25), ["★", "!", "✦", "POW"][i % 4], { fontFamily: "monospace", fontSize: `${12 + i % 3 * 4}px`, color: i % 2 ? "#e46d94" : "#f4c95d", resolution: 2 }).setOrigin(0.5));
    this.tweens.add({ targets: cloud, x: "+=8", angle: 5, duration: 90, yoyo: true, repeat: 12, onComplete: () => this.tweens.add({ targets: cloud, alpha: 0, scale: 1.4, duration: 380, onComplete: () => cloud.destroy() }) });
    store.toast("Guest reaction: of course this is happening.", "#fff4e6");
  }

  private startBoss() {
    const { width, height } = this.scale.gameSize;
    this.card.setText("MABROUK THE DUNE PUFF\nA gigantic fluffy creature erupts from the dune, steals the shiny ring box, and looks delighted with itself.\nReduce MISCHIEF with wedding sweets. Dodge the soft sand puffs.");
    this.mischief = 100;
    this.bossDefeated = false;
    const puff = this.add.graphics();
    puff.fillStyle(0xf3dfb8, 1).fillCircle(0, 0, 43).fillCircle(-30, 2, 25).fillCircle(30, 2, 25).fillCircle(-17, -25, 24).fillCircle(17, -25, 24);
    puff.fillStyle(0x3a2b3a, 1).fillCircle(-13, -4, 4).fillCircle(13, -4, 4);
    puff.fillStyle(0xe46d94, 1).fillCircle(0, 8, 5);
    const label = this.add.text(0, -62, "MABROUK", { fontFamily: "monospace", fontSize: "13px", color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 4, fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    this.boss = this.add.container(width / 2, height * 0.32, [puff, label]).setDepth(4000).setScale(0.2);
    this.tweens.add({ targets: this.boss, scale: 1, duration: 620, ease: "Back.out" });
    this.bossBar = this.add.graphics().setDepth(6000);
    this.drawBossBar();
    this.attackCooldown = this.time.now + 1200;
    this.hits = 0;
    this.showPhase();
  }

  private hitBoss() {
    if (!this.boss || this.time.now - this.lastAction < 420) return;
    this.lastAction = this.time.now;
    const sweet = this.add.circle(this.player.x, this.player.y - 18, 5, 0xe46d94).setDepth(5000);
    this.tweens.add({ targets: sweet, x: this.boss.x, y: this.boss.y, angle: 360, duration: 360, onComplete: () => { sweet.destroy(); this.mischief = Math.max(0, this.mischief - 9); this.drawBossBar(); this.tweens.add({ targets: this.boss, scaleX: 1.12, scaleY: 0.88, duration: 100, yoyo: true }); if (this.mischief <= 0) this.winBoss(); } });
  }

  private drawBossBar() {
    const { width } = this.scale.gameSize;
    this.bossBar?.clear().fillStyle(0x2b2233, 0.9).fillRoundedRect(width / 2 - 132, 70, 264, 28, 8).fillStyle(0xe46d94, 1).fillRoundedRect(width / 2 - 126, 76, 252 * (this.mischief / 100), 16, 5);
    this.bossBar?.lineStyle(2, 0xfff4e6).strokeRoundedRect(width / 2 - 132, 70, 264, 28, 8);
  }

  private spawnAttack() {
    if (!this.boss) return;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed = Phaser.Math.Between(48, 75);
    const hazard = this.add.circle(this.boss.x, this.boss.y + 20, Phaser.Math.Between(8, 13), Phaser.Math.Between(0, 1) ? 0xffc0d2 : 0xf4d38a, 0.8).setStrokeStyle(2, 0xffffff, 0.8).setDepth(3000);
    this.hazards.push({ go: hazard, vx: Math.cos(angle) * speed, vy: Math.abs(Math.sin(angle) * speed) + 28 });
  }

  private winBoss() {
    this.clearHazards();
    this.bossBar?.destroy();
    this.bossBar = undefined;
    this.tweens.add({ targets: this.boss, y: "+=12", scale: 0.76, duration: 480 });
    const ring = this.add.text(this.boss!.x, this.boss!.y, "▢♡", { fontFamily: "monospace", fontSize: "22px", color: "#f4c95d", stroke: "#3a2b3a", strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setDepth(6000);
    this.tweens.add({ targets: ring, x: this.player.x, y: this.player.y - 30, duration: 720, ease: "Sine.inOut" });
    this.card.setText("MISCHIEF DEFEATED\nMabrouk drops the ring box, looks embarrassed, and accepts cake as a peace treaty.\nA · return to the ceremony");
    this.bossDefeated = true;
    store.incrementStat("wedding_boss_wins");
  }

  private clearHazards() { for (const hazard of this.hazards) hazard.go.destroy(); this.hazards = []; }

  update(time: number, delta: number) {
    if (this.phase !== "boss" || this.bossDefeated) return;
    let x = controls.moveX, y = controls.moveY;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;
    const length = Math.max(1, Math.hypot(x, y));
    this.player.setPosition(Phaser.Math.Clamp(this.player.x + x / length * delta * 0.16, 24, this.scale.gameSize.width - 24), Phaser.Math.Clamp(this.player.y + y / length * delta * 0.16, 120, this.scale.gameSize.height - 105));
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.hitBoss();
    if (time >= this.attackCooldown) { this.spawnAttack(); this.attackCooldown = time + Math.max(480, 950 - (100 - this.mischief) * 3); }
    for (const hazard of this.hazards) {
      hazard.go.x += hazard.vx * delta / 1000;
      hazard.go.y += hazard.vy * delta / 1000;
      if (Phaser.Math.Distance.Between(hazard.go.x, hazard.go.y, this.player.x, this.player.y - 10) < hazard.go.radius + 10) {
        hazard.go.destroy(); this.hits += 1; this.cameras.main.shake(100, 0.004); store.toast(this.hits % 2 ? "CUSHION ATTACK · still adorable" : "Heart-shaped sand. Rude.", "#ff8fae");
      }
    }
    this.hazards = this.hazards.filter((hazard) => hazard.go.active && hazard.go.y < this.scale.gameSize.height + 30);
    if (this.boss) this.boss.x = this.scale.gameSize.width / 2 + Math.sin(time / 700) * this.scale.gameSize.width * 0.25;
    this.moomoo.x = Phaser.Math.Linear(this.moomoo.x, this.player.x + 35, 0.03);
    this.moomoo.y = Phaser.Math.Linear(this.moomoo.y, this.player.y + 3, 0.03);
  }

  private completeWedding() {
    const firstCompletion = !store.state.flags.wedding_completed;
    store.state.relationshipStage = "married";
    store.setFlag("wedding_completed");
    store.unlockMemory("mem_wedding");
    for (const outfit of ["wedding_moroccan", "wedding_jordanian", "wedding_white"]) {
      if (!store.state.unlockedOutfits.includes(outfit)) store.state.unlockedOutfits.push(outfit);
    }
    for (const keepsake of ["wedding_rings", "mabrouk_cake_friend"]) {
      if (!store.state.keepsakes.includes(keepsake)) store.state.keepsakes.push(keepsake);
    }
    if (firstCompletion) {
      store.capturePhoto({ id: `wedding_${store.state.currentDay}`, title: "Our desert wedding", locationId: "abudhabi_yas", day: store.state.currentDay, timeOfDay: "night", companionId: "moomoo", participantIds: ["moomoo", "mama", "baba", "fadwa", "nour", "jad", "shan"], pose: "hug", frame: "hearts", caption: "Three looks, one cartoon cloud, one Dune Puff, two rings, forever." });
      store.incrementStat("wedding_completed");
      store.addRelationship("moomoo", 20);
    }
    quests.onMinigame("desert_wedding");
    store.save();
  }
}
