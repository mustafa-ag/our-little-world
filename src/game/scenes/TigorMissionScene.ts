import Phaser from "phaser";
import { SceneKeys } from "../constants";
import {
  TIGOR_ALL_NIGHT_TASKS,
  TIGOR_LEGAL_NAME,
  TIGOR_UAE_PHASES,
  TIGOR_VET_TASKS,
  type AllNighterAction,
} from "../data/tigorMission";
import { controls, uiEvents } from "../systems/controls";
import { store } from "../systems/store";
import { getVisualTexture } from "../visual";

const FONT = "monospace";

/** Multi-chapter, mobile-first story campaign for bringing Tigor home. */
export class TigorMissionScene extends Phaser.Scene {
  private stage?: Phaser.GameObjects.Container;
  private actionHandler: () => void = () => undefined;
  private busy = false;
  private vetIndex = 0;
  private vetResistance = 100;
  private jujuStress = 8;
  private babaStress = 5;
  private taskDeadline = 0;
  private vetAssist = { juju: false, moomoo: false, chloe: false };
  private uaeIndex = 0;
  private uaeResistance = 120;
  private rejectionCount = 0;
  private nameInput?: Phaser.GameObjects.DOMElement;
  private allIndex = 0;
  private allDeadline = 100;
  private allEnergy = 100;
  private allUpload = 0;
  private allCheckpoint = 0;
  private allLastTick = 0;
  private coffeeUses = 3;
  private callUses = 2;
  private hudBars?: Phaser.GameObjects.Graphics;
  private hudText?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.TigorMission);
  }

  create() {
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    uiEvents.emit("sceneReset");
    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
    uiEvents.on("action", this.handleAction, this);
    this.input.keyboard?.on("keydown-SPACE", this.handleAction, this);
    this.input.keyboard?.on("keydown-ENTER", this.handleAction, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownMission, this);

    const chapter = store.state.tigor.missionChapter;
    if (chapter >= 4) {
      this.scene.start(SceneKeys.TigorAirport);
      return;
    }
    if (chapter === 1) this.beginVet();
    else if (chapter === 2) this.beginUae();
    else if (chapter === 3) this.beginAllNighter();
    else this.beginSetup();
  }

  private shutdownMission() {
    uiEvents.off("action", this.handleAction, this);
    this.input.keyboard?.off("keydown-SPACE", this.handleAction, this);
    this.input.keyboard?.off("keydown-ENTER", this.handleAction, this);
    uiEvents.emit("dedicatedStatus", null);
    this.nameInput?.destroy();
    this.nameInput = undefined;
    controls.locked = false;
  }

  private handleAction() {
    if (!this.busy) this.actionHandler();
  }

  private resetStage(background: number, title: string, subtitle: string) {
    this.nameInput = undefined;
    if (this.stage) this.tweens.killTweensOf(this.stage.getAll());
    this.stage?.destroy(true);
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor(background);
    this.stage = this.add.container(0, 0);
    const floor = this.add.rectangle(width / 2, height * 0.69, width, height * 0.62, Phaser.Display.Color.IntegerToColor(background).brighten(18).color);
    const top = this.add.rectangle(width / 2, 44, width, 88, 0x241f2e, 0.62);
    const heading = this.add.text(width / 2, 15, title, {
      fontFamily: FONT, fontSize: `${Phaser.Math.Clamp(width / 24, 20, 32)}px`, color: "#fff4e6", stroke: "#3a2b3a", strokeThickness: 6,
      fontStyle: "bold", align: "center", resolution: 2,
    }).setOrigin(0.5, 0);
    const sub = this.add.text(width / 2, 56, subtitle, {
      fontFamily: FONT, fontSize: "11px", color: "#ffe08a", stroke: "#3a2b3a", strokeThickness: 3, align: "center",
      wordWrap: { width: width - 36 }, resolution: 2,
    }).setOrigin(0.5, 0);
    this.stage.add([floor, top, heading, sub]);
    this.addAmbientDetails(background);
  }

  private addAmbientDetails(background: number) {
    if (!this.stage) return;
    const { width, height } = this.scale.gameSize;
    const tone = Phaser.Display.Color.IntegerToColor(background).brighten(35).color;
    for (let index = 0; index < 10; index += 1) {
      const glow = this.add.circle((index + 0.5) * width / 10, height * 0.22 + Math.sin(index) * 8, 2 + index % 3, index % 2 ? 0xffe08a : tone, 0.65);
      this.tweens.add({ targets: glow, alpha: 0.2, scale: 1.7, duration: 800 + index * 60, yoyo: true, repeat: -1 });
      this.stage.add(glow);
    }
  }

  private addCard(text: string, y: number, color = "#3a2b3a", background = "rgba(255,249,240,0.96)") {
    const { width } = this.scale.gameSize;
    const card = this.add.text(width / 2, y, text, {
      fontFamily: FONT, fontSize: width < 620 ? "10px" : "12px", color, backgroundColor: background, padding: { x: 13, y: 9 },
      fixedWidth: Math.min(width - 28, 670), wordWrap: { width: Math.min(width - 58, 630) }, align: "center", lineSpacing: 3, resolution: 2,
    }).setOrigin(0.5, 0);
    this.stage?.add(card);
    return card;
  }

  private addButton(x: number, y: number, width: number, label: string, onPress: () => void, accent = 0x2f6fd0, height = 42) {
    const button = this.add.text(x, y, label, {
      fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: `#${accent.toString(16).padStart(6, "0")}`,
      fixedWidth: width, fixedHeight: height, padding: { x: 7, y: 7 }, align: "center", wordWrap: { width: width - 14 }, resolution: 2,
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    button.on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
      event?.stopPropagation?.();
      if (!this.busy) onPress();
    });
    this.stage?.add(button);
    return button;
  }

  private beginSetup() {
    let beat = 0;
    const beats = [
      "CHLOE · OADBY\nMinor issue: Tigor needs to move to Abu Dhabi.\nMajor issue: the forms have formed a government.",
      "Juju opens a group call.\nMoomoo brings coffee. Baba brings a folder labelled CAT PROBLEM.",
      "EDINBURGH → OADBY\nRain. Train windows. Eleven voice notes. One cat who has no idea he is becoming international.",
      "Tigor sits directly on the first form.\nThe mission has officially begun.",
    ];
    const draw = () => {
      this.resetStage(0x536b67, "RETRIEVE TIGOR", "CHAPTER 0 · Edinburgh to Oadby");
      const { width, height } = this.scale.gameSize;
      const chloe = this.add.image(width / 2 - 58, height * 0.59, getVisualTexture(this, "char_chloe")).setScale(2.25).setOrigin(0.5, 1);
      const juju = this.add.image(width / 2 + 6, height * 0.59, getVisualTexture(this, "char_her")).setScale(2.25).setOrigin(0.5, 1);
      const tigor = this.add.image(width / 2 + 64, height * 0.59, "o_tigor").setScale(2.4).setOrigin(0.5, 1);
      this.stage?.add([chloe, juju, tigor]);
      this.tweens.add({ targets: tigor, y: "-=4", angle: 3, duration: 520, yoyo: true, repeat: -1 });
      this.addCard(beats[beat], Math.max(96, height - 124));
      uiEvents.emit("dedicatedStatus", beat === beats.length - 1 ? "A · ENTER THE VET BOSS" : "A · continue", "#fff4e6");
      this.actionHandler = () => {
        if (beat < beats.length - 1) { beat += 1; draw(); }
        else { store.setTigorChapter(1); this.beginVet(); }
      };
    };
    draw();
  }

  private beginVet() {
    this.vetIndex = 0;
    this.vetResistance = 100;
    this.jujuStress = 8;
    this.babaStress = 5;
    this.vetAssist = { juju: false, moomoo: false, chloe: false };
    this.renderVet();
  }

  private renderVet(message?: string) {
    const task = TIGOR_VET_TASKS[this.vetIndex];
    if (!task) { this.winVet(); return; }
    this.resetStage(0x48616b, "UK VET BOSS", `CHAPTER 1 · Checklist ${this.vetIndex + 1}/${TIGOR_VET_TASKS.length}`);
    const { width, height } = this.scale.gameSize;
    const compact = height < 430;
    const vet = this.add.image(width * 0.18, compact ? 164 : 192, getVisualTexture(this, "char_hazel")).setScale(compact ? 1.5 : 2).setOrigin(0.5, 1).setTint(0xbfd5db);
    const tigor = this.add.image(width * 0.82, compact ? 163 : 192, "o_tigor").setScale(compact ? 2 : 2.5).setOrigin(0.5, 1);
    this.stage?.add([vet, tigor]);
    this.drawBossMeter("APPOINTMENT RESISTANCE", this.vetResistance, 100, 88, 0xe46d94);
    this.drawCardStress();
    this.addCard(`${task.label.toUpperCase()}\n${message ?? task.prompt}`, compact ? 138 : 145);
    const buttonY = compact ? height - 92 : height - 115;
    const gap = Math.min(178, (width - 22) / 3);
    task.choices.forEach((choice, index) => this.addButton(width / 2 + (index - 1) * gap, buttonY, gap - 7, choice, () => this.chooseVet(index), index === task.correct ? 0x2f6fd0 : 0x6c6472, compact ? 48 : 56));
    const assistY = compact ? height - 31 : height - 42;
    const assistW = Math.min(132, (width - 32) / 3);
    this.addButton(width / 2 - assistW - 4, assistY, assistW, this.vetAssist.juju ? "JUJU · USED" : `MELTDOWN BEAM ${this.jujuStress}%`, () => this.useVetAssist("juju"), this.jujuStress >= 100 ? 0xcf1737 : 0x8a7a6a, 28);
    this.addButton(width / 2, assistY, assistW, this.vetAssist.moomoo ? "MOOMOO · USED" : "MOOMOO · CALL AGAIN", () => this.useVetAssist("moomoo"), this.vetAssist.moomoo ? 0x8a7a6a : 0xe46d94, 28);
    this.addButton(width / 2 + assistW + 4, assistY, assistW, this.vetAssist.chloe ? "CHLOE · USED" : "PhD PERSISTENCE", () => this.useVetAssist("chloe"), this.vetAssist.chloe ? 0x8a7a6a : 0x8154a7, 28);
    this.taskDeadline = this.time.now + (this.vetAssist.chloe ? 12500 : 8500);
    this.actionHandler = () => this.chooseVet(task.correct);
    uiEvents.emit("dedicatedStatus", `A · push checklist   JUJU ${this.jujuStress}% · BABA ${this.babaStress}%`, "#fff4e6");
  }

  private chooseVet(choice: number) {
    const task = TIGOR_VET_TASKS[this.vetIndex];
    if (!task || this.busy) return;
    if (choice !== task.correct) {
      this.jujuStress = Math.min(100, this.jujuStress + 11);
      this.babaStress = Math.min(100, this.babaStress + 6);
      this.vetResistance = Math.min(100, this.vetResistance + 3);
      this.rejectionBurst("PLEASE COMPLETE FORM VET-9B");
      this.renderVet("Rejected. The appointment moves backward by one emotional year. Try again.");
      return;
    }
    this.busy = true;
    const priorBabaStress = this.babaStress;
    this.jujuStress = Math.min(100, this.jujuStress + 15);
    this.babaStress = Math.min(100, this.babaStress + (task.id === "certificate" || task.id === "fit" ? 14 : 8));
    if (priorBabaStress < 35 && this.babaStress >= 35) store.toast("Baba: Why did Etihad just charge WHAT?", "#ffe08a");
    if (priorBabaStress < 65 && this.babaStress >= 65) store.toast("Baba: IS TIGOR FLYING THE PLANE?", "#ffe08a");
    this.vetResistance = Math.max(0, this.vetResistance - (this.vetIndex === TIGOR_VET_TASKS.length - 1 ? 18 : 12));
    this.successBurst(task.success);
    this.time.delayedCall(650, () => {
      this.vetIndex += 1;
      this.busy = false;
      this.renderVet();
    });
  }

  private useVetAssist(who: keyof typeof this.vetAssist) {
    if (this.vetAssist[who]) return;
    if (who === "juju" && this.jujuStress < 100) { store.toast("Juju's meltdown beam unlocks at 100% stress.", "#ffe08a"); return; }
    this.vetAssist[who] = true;
    if (who === "juju") { this.vetResistance = Math.max(8, this.vetResistance - 18); this.jujuStress = 10; this.playMeltdownBeam(); this.successBurst("JUJU MELTDOWN BEAM\nI HAVE THE STAMPED ORIGINAL.\nOkay. I feel better."); }
    if (who === "moomoo") { this.vetResistance = Math.max(8, this.vetResistance - 9); this.babaStress = Math.max(0, this.babaStress - 12); this.successBurst("MOOMOO CALLS AGAIN\nHe is extremely polite and somehow terrifying."); }
    if (who === "chloe") { this.vetResistance = Math.max(8, this.vetResistance - 9); this.successBurst("PhD PERSISTENCE\nChloe has survived Reviewer Two. This desk cannot scare her."); }
    this.time.delayedCall(520, () => this.renderVet());
  }

  private winVet() {
    this.taskDeadline = 0;
    this.resetStage(0x406f67, "VET BOSS DEFEATED", "Every box ticked · every stamp acquired");
    this.drawChecklist(TIGOR_VET_TASKS.map((task) => `✓ ${task.label}`));
    this.addCard("Tigor: mrrp. Fit to fly.\nChloe: not fit to remain awake.\nBaba: How much was the blood test?", this.scale.gameSize.height - 108);
    uiEvents.emit("dedicatedStatus", "A · FACE UAE BUREAUCRACY", "#f4c95d");
    this.actionHandler = () => { store.setTigorChapter(2); this.beginUae(); };
  }

  private beginUae() {
    this.uaeIndex = 0;
    this.uaeResistance = 120;
    this.rejectionCount = 0;
    this.renderUae();
  }

  private renderUae(message?: string) {
    const phase = TIGOR_UAE_PHASES[this.uaeIndex];
    if (!phase) { this.winUae(); return; }
    this.resetStage(0x334e78, "UAE BUREAUCRACY BOSS", `CHAPTER 2 · ${phase.label} · phase ${this.uaeIndex + 1}/${TIGOR_UAE_PHASES.length}`);
    const { width, height } = this.scale.gameSize;
    this.drawBossMeter("PORTAL RESISTANCE", this.uaeResistance, 120, 88, 0x45b9e6);
    for (let index = 0; index < 5; index += 1) {
      const tab = this.add.text(18 + index * Math.min(112, (width - 36) / 5), 120, ["FORM", "PDF", "TAMM", "CALL", "STAMP"][index], {
        fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: index === this.uaeIndex ? "#e46d94" : "#586b8b", padding: { x: 8, y: 4 }, resolution: 2,
      });
      this.stage?.add(tab);
    }
    this.addCard(`${message ?? phase.prompt}\n\nRejection stamps survived: ${this.rejectionCount}`, 154);
    if (this.uaeIndex === 3) this.renderNameChallenge();
    else {
      const choices = phase.choices!;
      const compact = height < 430;
      const gap = Math.min(190, (width - 22) / 3);
      choices.forEach((choice, index) => this.addButton(width / 2 + (index - 1) * gap, compact ? height - 75 : height - 92, gap - 7, choice, () => this.chooseUae(index), index === phase.correct ? 0x2f6fd0 : 0x6c6472, compact ? 54 : 64));
      this.actionHandler = () => this.chooseUae(phase.correct ?? 0);
    }
    this.taskDeadline = this.time.now + 10000;
    uiEvents.emit("dedicatedStatus", "A · deploy the correct evidence   the portal retaliates", "#fff4e6");
  }

  private chooseUae(choice: number) {
    const phase = TIGOR_UAE_PHASES[this.uaeIndex];
    if (!phase || this.busy) return;
    if (choice !== phase.correct) {
      this.rejectionCount += 1;
      this.uaeResistance = Math.min(120, this.uaeResistance + 5);
      this.jujuStress = Math.min(100, this.jujuStress + 8);
      this.rejectionBurst(["RETURNED", "INVALID PDF", "PLEASE CALL AGAIN"][this.rejectionCount % 3]);
      this.renderUae("The portal has returned the application for reasons known only to the portal.");
      return;
    }
    this.advanceUae(20, phase.success);
  }

  private renderNameChallenge() {
    const { width, height } = this.scale.gameSize;
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "name";
    input.placeholder = "Full legal name";
    input.maxLength = 60;
    input.setAttribute("aria-label", "Enter Chloe's full legal name");
    input.style.cssText = `width:${Math.min(width - 76, 430)}px;height:42px;border:3px solid #2f6fd0;border-radius:8px;padding:0 12px;font:16px system-ui;background:#fff;color:#241f2e;box-sizing:border-box;`;
    this.nameInput = this.add.dom(width / 2, Math.min(height - 118, 275), input);
    this.stage?.add(this.nameInput);
    this.addButton(width / 2, Math.min(height - 64, 330), Math.min(width - 70, 280), "SUBMIT LEGAL NAME", () => this.submitName(), 0xe46d94, 44);
    this.actionHandler = () => this.submitName();
    this.time.delayedCall(250, () => input.focus());
  }

  private submitName() {
    const value = ((this.nameInput?.node as HTMLInputElement | undefined)?.value ?? "").trim().replace(/\s+/g, " ");
    if (value.toLocaleLowerCase() !== TIGOR_LEGAL_NAME.toLocaleLowerCase()) {
      this.rejectionCount += 1;
      this.rejectionBurst(value ? "NAME DOES NOT MATCH" : "NAME REQUIRED");
      store.toast("Use Chloe's full legal name: Chloe Louise Cranfield", "#ffe08a");
      return;
    }
    this.nameInput?.destroy();
    this.nameInput = undefined;
    this.comboWords(["CHLOE", "LOUISE", "CRANFIELD", "IDENTITY COMBO!"]);
    this.advanceUae(40, "IDENTITY COMBO ACCEPTED.", 1150);
  }

  private advanceUae(damage: number, success: string, delay = 650) {
    if (this.busy) return;
    this.busy = true;
    this.uaeResistance = Math.max(0, this.uaeResistance - damage);
    this.successBurst(success);
    this.time.delayedCall(delay, () => { this.uaeIndex += 1; this.busy = false; this.renderUae(); });
  }

  private winUae() {
    this.taskDeadline = 0;
    this.resetStage(0x285a78, "IMPORT PERMIT APPROVED", "TAMM · ministry · identity combo · defeated");
    this.comboWords(["APPLICATION", "STAMPED", "CLEARED", "APPROVED"]);
    this.addCard("Juju screenshots the approval twelve times.\nMoomoo saves it to three clouds.\nBaba prints it. Of course Baba prints it.", this.scale.gameSize.height - 110);
    uiEvents.emit("dedicatedStatus", "A · BEGIN THE TWO-ALL-NIGHTER", "#f4c95d");
    this.actionHandler = () => { store.setTigorChapter(3); this.beginAllNighter(); };
  }

  private beginAllNighter() {
    this.allIndex = 0;
    this.allDeadline = 100;
    this.allEnergy = 100;
    this.allUpload = 0;
    this.allCheckpoint = 0;
    this.coffeeUses = 3;
    this.callUses = 2;
    this.allLastTick = this.time.now;
    this.renderAllNighter();
  }

  private renderAllNighter(message?: string) {
    const task = TIGOR_ALL_NIGHT_TASKS[this.allIndex];
    if (!task) { this.finishAllNighter(); return; }
    const cycle = ["EVENING ONE", "2:13 AM", "DAWN ONE", "EVENING TWO", "3:47 AM", "FINAL DAWN"][Math.min(5, Math.floor(this.allIndex / 3))];
    this.resetStage(0x202744, "THE TWO-ALL-NIGHTER", `CHAPTER 3 · ${cycle} · task ${this.allIndex + 1}/${TIGOR_ALL_NIGHT_TASKS.length}`);
    const { width, height } = this.scale.gameSize;
    this.drawAllNighterHud();
    const tigor = this.add.image(width - 58, 159, "o_tigor").setScale(2.4).setAngle(-4);
    const zzz = this.add.text(width - 75, 116, "z  z  z", { fontFamily: FONT, fontSize: "10px", color: "#c4d6ff", resolution: 2 });
    this.stage?.add([tigor, zzz]);
    for (let cup = 0; cup < Math.min(7, Math.floor(this.allIndex / 2)); cup += 1) {
      const coffee = this.add.text(20 + cup * 23, 121 + (cup % 2) * 20, "☕", { fontFamily: "system-ui", fontSize: "15px", color: "#ffe08a" }).setAngle(cup % 2 ? 7 : -5);
      this.stage?.add(coffee);
    }
    this.tweens.add({ targets: zzz, y: "-=10", alpha: 0.2, duration: 1000, yoyo: true, repeat: -1 });
    this.addCard(`${task.label.toUpperCase()}\n${message ?? task.note}`, 154);
    const actions: AllNighterAction[] = ["CALL", "UPLOAD", "STAMP", "CHECK"];
    const cols = width < 650 ? 2 : 4;
    const rows = Math.ceil(actions.length / cols);
    const buttonW = Math.min(140, (width - 30) / cols - 5);
    const startY = height - (rows === 2 ? 101 : 70);
    actions.forEach((action, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const totalW = cols * (buttonW + 5) - 5;
      const bx = width / 2 - totalW / 2 + buttonW / 2 + col * (buttonW + 5);
      this.addButton(bx, startY + row * 43, buttonW, action, () => this.chooseAllNighter(action), action === task.action ? 0x2f6fd0 : 0x5d596f, 36);
    });
    const assistY = startY - 34;
    this.addButton(width / 2 - 83, assistY, 156, `COFFEE BURST ×${this.coffeeUses}`, () => this.useCoffee(), this.coffeeUses ? 0xb56b3d : 0x8a7a6a, 27);
    this.addButton(width / 2 + 83, assistY, 156, `MOOMOO TAKES CALL ×${this.callUses}`, () => this.useCall(), this.callUses ? 0xe46d94 : 0x8a7a6a, 27);
    this.actionHandler = () => this.chooseAllNighter(task.action);
    uiEvents.emit("dedicatedStatus", "A · complete highlighted task   protect DEADLINE + ENERGY", "#fff4e6");
  }

  private chooseAllNighter(action: AllNighterAction) {
    const task = TIGOR_ALL_NIGHT_TASKS[this.allIndex];
    if (!task || this.busy) return;
    if (action !== task.action) {
      this.allDeadline = Math.max(0, this.allDeadline - 10);
      this.allEnergy = Math.max(0, this.allEnergy - 8);
      this.rejectionBurst("WRONG TAB · DEADLINE -10");
      this.renderAllNighter("That was the wrong tab. It was open for emotional support.");
      return;
    }
    this.busy = true;
    this.allIndex += 1;
    this.allUpload = Math.min(100, Math.round(this.allIndex / TIGOR_ALL_NIGHT_TASKS.length * 100));
    this.allEnergy = Math.max(0, this.allEnergy - 4);
    if (this.allIndex === 5 || this.allIndex === 10) {
      this.allCheckpoint = this.allIndex;
      this.allDeadline = Math.max(this.allDeadline, 48);
      this.successBurst(`CHECKPOINT SAVED · ${this.allIndex}/${TIGOR_ALL_NIGHT_TASKS.length}`);
    } else this.successBurst(task.note);
    this.time.delayedCall(480, () => { this.busy = false; this.renderAllNighter(); });
  }

  private useCoffee() {
    if (!this.coffeeUses) return;
    this.coffeeUses -= 1;
    this.allEnergy = Math.min(100, this.allEnergy + 26);
    this.successBurst("COFFEE BURST · ENERGY +26");
    this.renderAllNighter();
  }

  private useCall() {
    if (!this.callUses) return;
    this.callUses -= 1;
    this.allDeadline = Math.min(100, this.allDeadline + 20);
    this.successBurst("MOOMOO TAKES THE CALL · DEADLINE +20");
    this.renderAllNighter();
  }

  private recoverCheckpoint() {
    this.busy = true;
    this.rejectionBurst("DEADLINE HIT · TEAM RECOVERY");
    this.time.delayedCall(800, () => {
      this.allIndex = this.allCheckpoint;
      this.allUpload = Math.round(this.allCheckpoint / TIGOR_ALL_NIGHT_TASKS.length * 100);
      this.allDeadline = 42;
      this.allEnergy = 36;
      this.busy = false;
      this.renderAllNighter("Nobody restarts from zero. Chloe saved twelve copies.");
    });
  }

  private finishAllNighter() {
    this.taskDeadline = 0;
    this.allUpload = 100;
    this.resetStage(0x3b4b79, "CLEARANCE RECEIVED", "Two nights · sixteen tasks · zero functional sleep schedules");
    this.addCard("EMAIL RECEIVED: TIGOR CLEARED TO FLY\n\nChloe screams. Juju screams. Moomoo wakes up and screams because everyone else is screaming.", 132);
    uiEvents.emit("dedicatedStatus", "A · BOARD THE FLIGHT", "#f4c95d");
    this.actionHandler = () => this.beginFlightMontage();
  }

  private beginFlightMontage() {
    let beat = 0;
    const beats = [
      "OADBY → HEATHROW\nOne carrier. Four document folders. Tigor has the most luggage.",
      "HEATHROW\nEvery paper is checked. Then checked by someone who checks the check.",
      "ABOVE THE CLOUDS\nTigor sleeps. Chloe finally sleeps. Juju watches the little plane move east.",
      "ABU DHABI ARRIVALS\nMoomoo, Mama and Baba are waiting behind the barrier.",
    ];
    const draw = () => {
      this.resetStage(0x26395d, "TIGOR TAKES FLIGHT", `FLIGHT MONTAGE · ${beat + 1}/${beats.length}`);
      const { width, height } = this.scale.gameSize;
      const plane = this.add.text(width * 0.18, height * 0.46, "✈", { fontFamily: "system-ui", fontSize: "48px", color: "#fff4e6" }).setOrigin(0.5);
      const trail = this.add.text(width * 0.18 - 65, height * 0.46, "· · · ·", { fontFamily: FONT, fontSize: "18px", color: "#8ecae6" }).setOrigin(0.5);
      this.stage?.add([trail, plane]);
      this.tweens.add({ targets: [plane, trail], x: `+=${width * 0.64}`, duration: 1900, ease: "Sine.inOut" });
      this.addCard(beats[beat], height - 116);
      uiEvents.emit("dedicatedStatus", beat === beats.length - 1 ? "A · ENTER ARRIVALS" : "A · continue flight", "#fff4e6");
      this.actionHandler = () => {
        if (beat < beats.length - 1) { beat += 1; draw(); }
        else { store.setTigorChapter(4); this.scene.start(SceneKeys.TigorAirport); }
      };
    };
    draw();
  }

  private drawBossMeter(label: string, value: number, max: number, y: number, fill: number) {
    if (!this.stage) return;
    const { width } = this.scale.gameSize;
    const meterW = Math.min(width - 50, 520);
    const g = this.add.graphics();
    g.fillStyle(0x241f2e, 0.9).fillRoundedRect(width / 2 - meterW / 2, y, meterW, 25, 8);
    g.fillStyle(fill, 1).fillRoundedRect(width / 2 - meterW / 2 + 5, y + 5, (meterW - 10) * Math.max(0, value / max), 15, 5);
    const text = this.add.text(width / 2, y + 12, `${label}  ${Math.round(value)}/${max}`, { fontFamily: FONT, fontSize: "10px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    this.stage.add([g, text]);
  }

  private drawCardStress() {
    const { width } = this.scale.gameSize;
    const meterW = Math.min(190, (width - 42) / 2);
    const values = [
      { label: "JUJU'S CARD / STRESS", value: this.jujuStress, color: 0xe46d94 },
      { label: "BABA'S CARD / STRESS", value: this.babaStress, color: 0xf4c95d },
    ];
    values.forEach((meter, index) => {
      const x = width / 2 + (index ? 1 : -1) * (meterW / 2 + 5) - meterW / 2;
      const g = this.add.graphics();
      g.fillStyle(0x241f2e, 0.88).fillRoundedRect(x, 116, meterW, 17, 4);
      g.fillStyle(meter.color, 1).fillRoundedRect(x + 3, 119, (meterW - 6) * meter.value / 100, 11, 3);
      const label = this.add.text(x + meterW / 2, 124, `${meter.label} ${meter.value}%`, { fontFamily: FONT, fontSize: width < 560 ? "7px" : "8px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
      this.stage?.add([g, label]);
    });
  }

  private drawChecklist(lines: string[]) {
    const { width } = this.scale.gameSize;
    const cols = width < 600 ? 1 : 2;
    const colW = Math.min(290, (width - 50) / cols);
    lines.forEach((line, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const totalW = cols * colW;
      const x = width / 2 - totalW / 2 + col * colW;
      const t = this.add.text(x, 105 + row * 27, line, { fontFamily: FONT, fontSize: "11px", color: "#fff4e6", backgroundColor: "rgba(36,31,46,0.7)", padding: { x: 6, y: 4 }, fixedWidth: colW - 6, resolution: 2 });
      this.stage?.add(t);
    });
  }

  private drawAllNighterHud() {
    const { width } = this.scale.gameSize;
    const meterW = Math.min(150, (width - 48) / 3);
    const values = [{ label: "DEADLINE", value: this.allDeadline, color: 0xcf1737 }, { label: "ENERGY", value: this.allEnergy, color: 0xf4c95d }, { label: "UPLOAD", value: this.allUpload, color: 0x45b9e6 }];
    this.hudBars = this.add.graphics();
    values.forEach((meter, index) => {
      const x = width / 2 + (index - 1) * (meterW + 7) - meterW / 2;
      this.hudBars!.fillStyle(0x241f2e, 0.85).fillRoundedRect(x, 91, meterW, 25, 6);
      this.hudBars!.fillStyle(meter.color, 1).fillRoundedRect(x + 4, 95, (meterW - 8) * meter.value / 100, 17, 4);
    });
    this.hudText = this.add.text(width / 2, 103, values.map((meter) => `${meter.label} ${Math.round(meter.value)}`).join("       "), { fontFamily: FONT, fontSize: width < 580 ? "8px" : "9px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    this.stage?.add([this.hudBars, this.hudText]);
  }

  private refreshAllNighterHud() {
    if (!this.hudBars || !this.hudText) return;
    const { width } = this.scale.gameSize;
    const meterW = Math.min(150, (width - 48) / 3);
    const values = [{ label: "DEADLINE", value: this.allDeadline, color: 0xcf1737 }, { label: "ENERGY", value: this.allEnergy, color: 0xf4c95d }, { label: "UPLOAD", value: this.allUpload, color: 0x45b9e6 }];
    this.hudBars.clear();
    values.forEach((meter, index) => {
      const x = width / 2 + (index - 1) * (meterW + 7) - meterW / 2;
      this.hudBars!.fillStyle(0x241f2e, 0.85).fillRoundedRect(x, 91, meterW, 25, 6);
      this.hudBars!.fillStyle(meter.color, 1).fillRoundedRect(x + 4, 95, (meterW - 8) * Math.max(0, meter.value) / 100, 17, 4);
    });
    this.hudText.setText(values.map((meter) => `${meter.label} ${Math.round(meter.value)}`).join("       "));
  }

  private rejectionBurst(label: string) {
    const { width, height } = this.scale.gameSize;
    for (let index = 0; index < 6; index += 1) {
      const stamp = this.add.text(width / 2 + Phaser.Math.Between(-100, 100), height / 2 + Phaser.Math.Between(-45, 45), label, {
        fontFamily: FONT, fontSize: index ? "10px" : "15px", color: "#cf1737", backgroundColor: "rgba(255,244,230,0.9)", padding: { x: 5, y: 3 }, fontStyle: "bold", resolution: 2,
      }).setOrigin(0.5).setAngle(Phaser.Math.Between(-18, 18)).setDepth(1000);
      this.tweens.add({ targets: stamp, y: stamp.y + 30, alpha: 0, scale: 1.2, duration: 720 + index * 60, onComplete: () => stamp.destroy() });
    }
    this.cameras.main.shake(100, 0.005);
  }

  private successBurst(label: string) {
    const { width, height } = this.scale.gameSize;
    const banner = this.add.text(width / 2, height / 2, label, {
      fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", backgroundColor: "#ffe08a", padding: { x: 12, y: 8 }, align: "center", wordWrap: { width: width - 60 }, resolution: 2,
    }).setOrigin(0.5).setDepth(1100).setScale(0.3);
    this.tweens.add({ targets: banner, scale: 1, duration: 230, ease: "Back.out", onComplete: () => this.tweens.add({ targets: banner, y: banner.y - 28, alpha: 0, duration: 520, delay: 180, onComplete: () => banner.destroy() }) });
  }

  private comboWords(words: string[]) {
    const { width, height } = this.scale.gameSize;
    words.forEach((word, index) => {
      const text = this.add.text(width / 2, height * 0.34 + index * 34, word, { fontFamily: FONT, fontSize: index === words.length - 1 ? "24px" : "18px", color: index === words.length - 1 ? "#ffe08a" : "#fff", stroke: "#3a2b3a", strokeThickness: 5, fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(1200).setScale(0);
      this.tweens.add({ targets: text, scale: 1, angle: index % 2 ? 2 : -2, duration: 260, delay: index * 190, ease: "Back.out", onComplete: () => this.tweens.add({ targets: text, alpha: 0, duration: 280, delay: 420, onComplete: () => text.destroy() }) });
    });
  }

  private playMeltdownBeam() {
    const { width, height } = this.scale.gameSize;
    const beam = this.add.rectangle(-width * 0.35, height * 0.46, width * 0.62, 54, 0xffe6f1, 0.95).setDepth(1180).setAngle(-3);
    const core = this.add.rectangle(-width * 0.35, height * 0.46, width * 0.62, 18, 0xff5c9b, 1).setDepth(1181).setAngle(-3);
    const yell = this.add.text(width * 0.2, height * 0.32, "AAAAAAAA", { fontFamily: FONT, fontSize: "23px", color: "#fff", stroke: "#cf1737", strokeThickness: 6, fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(1190);
    this.tweens.add({ targets: [beam, core], x: width * 1.22, duration: 620, ease: "Cubic.in", onComplete: () => { beam.destroy(); core.destroy(); } });
    this.tweens.add({ targets: yell, scale: 1.3, angle: 4, alpha: 0, duration: 820, onComplete: () => yell.destroy() });
    for (let index = 0; index < 18; index += 1) {
      const form = this.add.text(width * 0.62, height * 0.44, index % 3 ? "▱" : "STAMP", { fontFamily: FONT, fontSize: index % 3 ? "14px" : "8px", color: index % 2 ? "#fff4e6" : "#ffe08a", resolution: 2 }).setDepth(1185);
      this.tweens.add({ targets: form, x: width * 0.62 + Phaser.Math.Between(-180, 210), y: height * 0.44 + Phaser.Math.Between(-120, 120), angle: Phaser.Math.Between(-240, 240), alpha: 0, duration: 720 + index * 18, onComplete: () => form.destroy() });
    }
    this.cameras.main.shake(430, 0.013);
  }

  update(time: number) {
    if (this.taskDeadline && time > this.taskDeadline && !this.busy) {
      this.taskDeadline = 0;
      if (store.state.tigor.missionChapter === 1) {
        this.jujuStress = Math.min(100, this.jujuStress + 8);
        this.babaStress = Math.min(100, this.babaStress + 4);
        this.rejectionBurst("NEXT APPOINTMENT: SIX WEEKS");
        this.renderVet("The vet boss moved the appointment. Moomoo put it back. Choose quickly.");
      } else if (store.state.tigor.missionChapter === 2) {
        this.rejectionCount += 1;
        this.rejectionBurst("SESSION EXPIRED");
        this.renderUae("The portal timed out while everybody was looking directly at it.");
      }
    }
    if (store.state.tigor.missionChapter === 3 && this.allIndex < TIGOR_ALL_NIGHT_TASKS.length && !this.busy && time - this.allLastTick >= 1000) {
      const seconds = (time - this.allLastTick) / 1000;
      this.allLastTick = time;
      this.allDeadline = Math.max(0, this.allDeadline - seconds * 0.7);
      this.allEnergy = Math.max(0, this.allEnergy - seconds * 0.5);
      if (this.allEnergy <= 0) this.allDeadline = Math.max(0, this.allDeadline - seconds * 1.4);
      this.refreshAllNighterHud();
      if (this.allDeadline <= 0) this.recoverCheckpoint();
    }
  }
}
