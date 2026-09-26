import Phaser from "phaser";
import { Depths, SceneKeys } from "../constants";
import {
  ADNOC_RANKS,
  adnocRankAtLeast,
  adnocRankDef,
  floorAccessRank,
  type AdnocFloor,
  type AdnocRank,
  type AdnocWorkTaskId,
} from "../data/adnoc";
import { Player } from "../objects/Player";
import { controls, minimap, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import {
  addAdnocXp,
  awardStoryXpOnce,
  beginWorkday,
  careerProgressText,
  finishWorkday,
  rankLabel,
  refreshAdnocUnlockFlags,
  setAdnocRank,
} from "../systems/adnoc";
import { store } from "../systems/store";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

interface HqArrivalData {
  floor?: AdnocFloor;
  promotion?: AdnocRank;
  workTaskDone?: boolean;
}

const FLOOR_LABELS: Record<AdnocFloor, string> = {
  ground: "GROUND FLOOR · LOBBY",
  engineering: "ENGINEERING FLOOR",
  operations: "OPERATIONS FLOOR",
  management: "MANAGEMENT FLOOR",
  executive: "EXECUTIVE FLOOR",
};

const STORY_QUESTS = [
  "q_adnoc_pressure_problem",
  "q_adnoc_paperclip_incident",
  "q_adnoc_team_lead",
  "q_adnoc_control_room",
  "q_adnoc_director",
  "q_adnoc_ceo",
];

export class AdnocHQScene extends Phaser.Scene {
  private floor: AdnocFloor = "ground";
  private player!: Player;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private interactables: Interactable[] = [];
  private current?: Interactable;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInteract = 0;
  private workOverlay!: Phaser.GameObjects.Graphics;
  private elevatorOverlay?: Phaser.GameObjects.Container;
  private elevatorRows: Phaser.GameObjects.Rectangle[] = [];
  private elevatorIndex = 0;
  private pendingDialogue?: () => void;
  private arrivalData: HqArrivalData = {};
  private readonly blockMap = () => store.toast("The HQ map says: YOU ARE IN HQ. Extremely helpful.", "#8ecae6");

  constructor() {
    super(SceneKeys.AdnocHQ);
  }

  create(data: HqArrivalData = {}) {
    this.arrivalData = data;
    this.floor = data.floor ?? "ground";
    this.interactables = [];
    this.current = undefined;
    this.elevatorOverlay = undefined;
    this.elevatorRows = [];
    this.pendingDialogue = undefined;
    this.lastInteract = 0;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    minimap.on = false;
    uiEvents.emit("sceneReset");
    uiEvents.emit("prompt", null);
    refreshAdnocUnlockFlags();

    const worldW = 760;
    const worldH = 500;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH).setBackgroundColor("#dbeaf3");
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.scale.gameSize.height / 560, 0.9, 1.65));
    this.solids = this.physics.add.staticGroup();
    this.drawFloorShell(worldW, worldH);
    this.buildFloor();

    const spawn = this.floor === "ground" ? new Phaser.Math.Vector2(380, 438) : new Phaser.Math.Vector2(108, 390);
    this.player = new Player(this, spawn.x, spawn.y, "char_her");
    this.player.setDepth(this.player.y);
    this.physics.add.collider(this.player, this.solids);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.workOverlay = this.add.graphics();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E,ENTER,ESC") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.blockMap, this);
    const uiWasActive = this.scene.isActive(SceneKeys.UI);
    if (!uiWasActive) this.scene.launch(SceneKeys.UI);
    const announce = () => {
      uiEvents.emit("locationTitle", "ADNOC HQ", this.firstDayActive() ? "Juju's First Day" : FLOOR_LABELS[this.floor]);
      this.refreshHud();
    };
    if (uiWasActive) announce();
    else this.time.delayedCall(0, announce);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.time.delayedCall(180, () => this.handleArrival());
  }

  private drawFloorShell(width: number, height: number) {
    const colors: Record<AdnocFloor, [number, number]> = {
      ground: [0xe9f3f8, 0xc8e0ed],
      engineering: [0xdceaf1, 0xbfd4df],
      operations: [0xd6e4e6, 0xacc8cc],
      management: [0xeee6db, 0xd9c8b1],
      executive: [0xe7e2d9, 0xb9d5e4],
    };
    const [base, stripe] = colors[this.floor];
    const floor = this.add.graphics().setDepth(Depths.ground);
    floor.fillStyle(base, 1).fillRect(0, 0, width, height);
    for (let y = 28; y < height; y += 28) floor.fillStyle(stripe, 0.32).fillRect(0, y, width, 2);
    floor.fillStyle(0x173e63, 1).fillRect(0, 0, width, 24).fillRect(0, 0, 22, height).fillRect(width - 22, 0, 22, height).fillRect(0, height - 22, width, 22);
    floor.fillStyle(0x2f6fd0, 1).fillRect(22, 24, width - 44, 8);
    for (let x = 35; x < width - 40; x += 74) {
      floor.fillStyle(0x9ed4ed, 0.75).fillRoundedRect(x, 38, 56, 38, 4);
      floor.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x, 38, 56, 38, 4);
    }
    this.add.text(width / 2, 88, FLOOR_LABELS[this.floor], { fontFamily: "monospace", fontSize: "18px", color: "#173e63", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(4);
    this.addSolid(0, 0, width, 24);
    this.addSolid(0, height - 22, width, 22);
    this.addSolid(0, 0, 22, height);
    this.addSolid(width - 22, 0, 22, height);
    if (this.floor !== "ground") this.addElevator(108, 130);
  }

  private buildFloor() {
    if (this.floor === "ground") this.buildGroundFloor();
    else if (this.floor === "engineering") this.buildEngineeringFloor();
    else if (this.floor === "operations") this.buildOperationsFloor();
    else if (this.floor === "management") this.buildManagementFloor();
    else this.buildExecutiveFloor();
  }

  private buildGroundFloor() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(245, 120, 270, 78, 9);
    g.fillStyle(0x2f6fd0, 1).fillRect(245, 120, 270, 15);
    g.fillStyle(0x7b583f, 1).fillRoundedRect(280, 184, 200, 36, 5);
    this.addSolid(280, 184, 200, 36);
    this.add.text(380, 145, "RECEPTION · SECURITY", { fontFamily: "monospace", fontSize: "12px", color: "#173e63", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addNpc(380, 246, "char_adnoc_recruiter", "ALYA", () => this.useReception());

    g.fillStyle(0x59616d, 1).fillRoundedRect(548, 132, 92, 90, 7);
    g.fillStyle(0xdff3ff, 1).fillRect(563, 147, 62, 48);
    g.fillStyle(0xe46d94, 1).fillCircle(594, 207, 7);
    this.add.text(594, 118, "BADGE CAMERA", { fontFamily: "monospace", fontSize: "9px", color: "#173e63", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addInteractable(594, 232, 40, this.badgePrompt(), () => this.useBadgeCamera());

    this.addElevator(108, 150);
    this.drawCoffeeArea(605, 350);
    this.addNpc(520, 350, "char_mall_concierge", "KHALID", () => this.coworkerTalk("Khalid"));
    this.addInteractable(380, 466, 34, "Leave ADNOC HQ", () => this.leaveHq());
    this.add.text(380, 470, "EXIT", { fontFamily: "monospace", fontSize: "10px", color: "#fff", backgroundColor: "#173e63", padding: { x: 8, y: 3 }, resolution: 2 }).setOrigin(0.5).setDepth(20);
  }

  private buildEngineeringFloor() {
    this.addDeskArea(190, 175);
    const lab = this.add.graphics().setDepth(6);
    lab.fillStyle(0xfafcff, 1).fillRoundedRect(425, 122, 265, 128, 8);
    lab.lineStyle(3, 0x2f6fd0, 1).strokeRoundedRect(425, 122, 265, 128, 8);
    for (let x = 455; x <= 635; x += 60) {
      lab.fillStyle(0x627786, 1).fillRoundedRect(x, 158, 42, 48, 5);
      lab.fillStyle([0x4f91d2, 0xf4c95d, 0x57a56d, 0xe46d94][Math.floor((x - 455) / 60)], 1).fillCircle(x + 21, 177, 8);
    }
    this.add.text(558, 134, "FICTIONAL SAMPLE LAB", { fontFamily: "monospace", fontSize: "11px", color: "#173e63", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addInteractable(558, 268, 72, this.labPrompt(), () => this.useLab());

    this.drawPrinter(560, 350);
    this.addNpc(660, 372, "char_adnoc_recruiter", "ALYA", () => this.useManager());
    this.addNpc(395, 350, "char_mall_cafe_worker", "NOOR", () => this.coworkerTalk("Noor"));
    this.drawMissionBoard(315, 355);
    this.addStoryEngineeringInteractions();
  }

  private buildOperationsFloor() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0x233e52, 1).fillRoundedRect(205, 120, 500, 175, 8);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
      const x = 235 + col * 88;
      const y = 145 + row * 67;
      g.fillStyle(0x426c7d, 1).fillRoundedRect(x, y, 70, 48, 4);
      g.fillStyle((row + col) % 3 === 0 ? 0xe46d94 : (row + col) % 2 ? 0x7be0a3 : 0xf4c95d, 1).fillCircle(x + 16, y + 17, 5);
      g.fillStyle(0xbde5f4, 1).fillRect(x + 29, y + 13, 28, 5).fillRect(x + 29, y + 24, 20, 4);
    }
    this.add.text(455, 132, "CONTROL ROOM · EVERYTHING IS FINE", { fontFamily: "monospace", fontSize: "12px", color: "#fff4e6", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addSolid(205, 120, 500, 175);
    this.addNpc(300, 365, "char_mall_concierge", "OMAR", () => this.coworkerTalk("Omar"));
    this.addNpc(520, 370, "char_mall_cafe_worker", "DANA", () => this.coworkerTalk("Dana"));
    this.drawMissionBoard(650, 370);
    this.addWorkConsole(185, 390);
    this.addStoryOperationsInteractions();
  }

  private buildManagementFloor() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0xfffbf2, 1).fillRoundedRect(205, 116, 230, 170, 8);
    g.lineStyle(3, 0xb58a52, 1).strokeRoundedRect(205, 116, 230, 170, 8);
    g.fillStyle(0x7b583f, 1).fillRoundedRect(255, 174, 134, 54, 6);
    this.add.image(390, 145, "f_plant").setScale(1.6).setDepth(160);
    this.add.text(320, 132, "JUJU'S OFFICE", { fontFamily: "monospace", fontSize: "12px", color: "#765333", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addSolid(255, 174, 134, 54);
    g.fillStyle(0x314f69, 1).fillRoundedRect(470, 116, 238, 170, 8);
    g.fillStyle(0xe9f3f8, 1).fillRoundedRect(500, 160, 178, 70, 5);
    this.add.text(589, 132, "CONFERENCE ROOM", { fontFamily: "monospace", fontSize: "11px", color: "#fff", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addNpc(320, 345, "char_adnoc_recruiter", "ALYA", () => this.useManager());
    this.drawMissionBoard(570, 365);
    this.addWorkConsole(205, 390);
    this.addStoryManagementInteractions();
  }

  private buildExecutiveFloor() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0x183e62, 1).fillRoundedRect(205, 112, 290, 176, 10);
    g.fillStyle(0xddebf2, 1).fillRoundedRect(238, 155, 224, 76, 7);
    for (let x = 265; x <= 435; x += 42) g.fillStyle(0xf4c95d, 1).fillCircle(x, 245, 7);
    this.add.text(350, 130, "BOARDROOM", { fontFamily: "monospace", fontSize: "13px", color: "#fff", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addInteractable(350, 305, 62, this.boardroomPrompt(), () => this.useBoardroom());

    g.fillStyle(0xfffbf2, 1).fillRoundedRect(520, 112, 188, 208, 10);
    g.lineStyle(4, 0xf4c95d, 1).strokeRoundedRect(520, 112, 188, 208, 10);
    g.fillStyle(0x704b35, 1).fillRoundedRect(548, 176, 134, 58, 7);
    this.addSolid(548, 176, 134, 58);
    this.add.image(665, 151, "f_plant").setScale(1.8).setDepth(170);
    this.add.text(614, 130, store.state.adnocRank === "ceo" ? "CEO JUJU" : "FUTURE BIG OFFICE", { fontFamily: "monospace", fontSize: "11px", color: "#765333", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addInteractable(614, 254, 50, store.state.adnocRank === "ceo" ? "Sit dramatically in the CEO chair" : "Inspect the suspiciously large office", () => this.useCeoChair());

    this.addNpc(430, 375, "char_adnoc_recruiter", "ALYA", () => this.useManager());
    this.drawMissionBoard(250, 370);
    this.addWorkConsole(610, 390);
    this.addInteractable(700, 390, 38, "Visit the rooftop", () => this.useRooftop());
    this.add.text(700, 421, "ROOFTOP", { fontFamily: "monospace", fontSize: "9px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 5, y: 2 }, resolution: 2 }).setOrigin(0.5).setDepth(8);
  }

  private addDeskArea(x: number, y: number) {
    const level = Math.max(1, adnocRankDef(store.state.adnocRank) ? ADNOC_RANKS.findIndex((r) => r.id === store.state.adnocRank) : 1);
    const scale = level >= 4 ? 2.05 : level >= 2 ? 1.7 : 1.35;
    this.add.image(x, y, "f_desk").setScale(scale).setDepth(y + 5);
    this.add.image(x + 39, y - 21, "f_plant").setScale(level >= 4 ? 1.25 : 0.8).setDepth(y + 7);
    const monitors = level >= 3 ? 2 : 1;
    for (let i = 0; i < monitors; i++) this.add.rectangle(x - 12 + i * 25, y - 19, 22, 14, 0x244d72, 1).setStrokeStyle(2, 0x8ecae6).setDepth(y + 8);
    this.add.text(x, y - 52, level >= 4 ? "TEAM LEAD JUJU" : "JUJU'S DESK", { fontFamily: "monospace", fontSize: "10px", color: "#173e63", backgroundColor: "#fff4e6", padding: { x: 5, y: 2 }, resolution: 2 }).setOrigin(0.5).setDepth(y + 9);
    this.addSolid(x - 55, y - 30, 110, 56);
    this.addInteractable(x, y + 48, 50, this.deskPrompt(), () => this.useDesk());
  }

  private addElevator(x: number, y: number) {
    const g = this.add.graphics().setDepth(7);
    g.fillStyle(0x8b9aa4, 1).fillRoundedRect(x - 55, y - 60, 110, 120, 6);
    g.fillStyle(0xc9d4da, 1).fillRect(x - 45, y - 50, 42, 100).fillRect(x + 3, y - 50, 42, 100);
    g.lineStyle(3, 0x59616d, 1).lineBetween(x, y - 50, x, y + 50);
    g.fillStyle(0x173e63, 1).fillRoundedRect(x - 35, y - 83, 70, 18, 4);
    this.add.text(x, y - 80, this.floor === "ground" ? "FLOOR G" : `FLOOR ${["ground", "engineering", "operations", "management", "executive"].indexOf(this.floor)}`, { fontFamily: "monospace", fontSize: "9px", color: "#7be0a3", resolution: 2 }).setOrigin(0.5).setDepth(9);
    this.addSolid(x - 55, y - 60, 110, 120);
    this.addInteractable(x, y + 84, 48, "Use the elevator", () => this.openElevator());
  }

  private drawCoffeeArea(x: number, y: number) {
    const g = this.add.graphics().setDepth(7);
    g.fillStyle(0x59616d, 1).fillRoundedRect(x - 42, y - 40, 84, 78, 6);
    g.fillStyle(0x2b2233, 1).fillRect(x - 29, y - 25, 58, 24);
    g.fillStyle(0xf4c95d, 1).fillCircle(x + 21, y + 14, 5);
    this.add.text(x, y - 54, "COFFEE KNOWS YOUR ID", { fontFamily: "monospace", fontSize: "8px", color: "#173e63", resolution: 2 }).setOrigin(0.5).setDepth(8);
    this.addInteractable(x, y + 54, 42, "Request emergency karak", () => uiEvents.emit("dialogue", "Coffee Machine", ["EMPLOYEE DETECTED.", "Stress level: engineering.", "Dispensing emotional support karak."]));
  }

  private drawPrinter(x: number, y: number) {
    const g = this.add.graphics().setDepth(y);
    g.fillStyle(0xd9d9d9, 1).fillRoundedRect(x - 43, y - 38, 86, 70, 7);
    g.fillStyle(0x59616d, 1).fillRect(x - 31, y - 24, 62, 24);
    g.fillStyle(0x7be0a3, 1).fillCircle(x + 29, y + 15, 5);
    g.fillStyle(0xffffff, 1).fillRect(x - 25, y + 1, 50, 42);
    this.add.text(x, y - 52, "HP LASERJET OF DOOM", { fontFamily: "monospace", fontSize: "8px", color: "#173e63", resolution: 2 }).setOrigin(0.5).setDepth(y + 2);
    this.addInteractable(x, y + 58, 44, "Check whether the printer is behaving", () => uiEvents.emit("dialogue", "Printer", ["READY.", "Juju: Stay that way."]));
  }

  private drawMissionBoard(x: number, y: number) {
    this.add.rectangle(x, y, 120, 72, 0xfff4e6, 1).setStrokeStyle(4, 0x2f6fd0).setDepth(y);
    this.add.text(x, y - 17, "CAREER BOARD", { fontFamily: "monospace", fontSize: "10px", color: "#173e63", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(y + 1);
    this.add.text(x, y + 10, "Missions · XP ·\nvery normal alarms", { fontFamily: "monospace", fontSize: "8px", color: "#59616d", align: "center", resolution: 2 }).setOrigin(0.5).setDepth(y + 1);
    this.addInteractable(x, y + 52, 48, "Check career mission board", () => this.useMissionBoard());
  }

  private addWorkConsole(x: number, y: number) {
    this.add.rectangle(x, y, 92, 50, 0x244d72, 1).setStrokeStyle(3, 0x8ecae6).setDepth(y);
    this.add.text(x, y, "WORK\nA DAY", { fontFamily: "monospace", fontSize: "10px", color: "#fff", align: "center", resolution: 2 }).setOrigin(0.5).setDepth(y + 1);
    this.addInteractable(x, y + 50, 44, store.state.adnocWorkday ? "Resume today's workday" : "Start Work Day", () => this.useDesk(true));
  }

  private addNpc(x: number, y: number, texture: string, label: string, action: () => void) {
    const sprite = this.add.sprite(x, y, texture, 0).setOrigin(0.5, 0.85).setScale(1.18).setDepth(y);
    sprite.play(`${texture}-idle-down`, true);
    this.add.text(x, y - 28, label, { fontFamily: "monospace", fontSize: "8px", color: "#fff4e6", backgroundColor: "#173e63", padding: { x: 4, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(y + 2);
    this.addInteractable(x, y, 32, `Talk to ${label === "ALYA" ? "Alya" : label[0] + label.slice(1).toLowerCase()}`, action);
  }

  private addSolid(x: number, y: number, width: number, height: number) {
    const zone = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0);
    this.physics.add.existing(zone, true);
    this.solids.add(zone);
  }

  private addInteractable(x: number, y: number, radius: number, prompt: string, trigger: () => void) {
    this.interactables.push({ x, y, radius, prompt, trigger });
  }

  private firstDayActive() {
    return quests.statusOf("q_adnoc_engineer") === "active";
  }

  private currentCareerTarget() {
    for (const id of ["q_adnoc_engineer", ...STORY_QUESTS]) {
      if (quests.statusOf(id) !== "active") continue;
      const step = quests.currentStep(id);
      if (step) return step.target;
    }
    return undefined;
  }

  private badgePrompt() {
    return this.currentCareerTarget() === "adnoc_badge_photo" ? "Take employee badge photo" : "Inspect Juju's badge photo";
  }

  private deskPrompt() {
    if (this.currentCareerTarget() === "adnoc_desk") return "Find Juju's assigned desk";
    return store.state.adnocWorkday ? "Resume today's Work Day" : "Start Work Day";
  }

  private labPrompt() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_sample_sort") return "Begin the first sample sort";
    if (target === "adnoc_results") return "Pick up the finished report";
    return "Inspect the fictional sample lab";
  }

  private boardroomPrompt() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_boardroom_walk") return "Walk to the presentation area";
    if (target === "adnoc_board_return") return "Return to the waiting board";
    if (target === "adnoc_board_info" || target === "adnoc_board_questions" || target === "adnoc_ceo_crisis") return "Continue the final promotion";
    return "Visit the boardroom";
  }

  private useReception() {
    if (this.currentCareerTarget() === "adnoc_reception") {
      quests.onTalk("adnoc_reception", []);
      uiEvents.emit("dialogue", "Receptionist", ["Name?", "Juju: Juju.", "Department?", "Juju: ...yes.", "Receptionist: Engineering. Badge camera is on your right."]);
      return;
    }
    this.useMissionBoard();
  }

  private useBadgeCamera() {
    if (this.currentCareerTarget() !== "adnoc_badge_photo") {
      const poses = ["surprisingly reasonable", "very serious", "visibly alarmed", "suspicious of cameras", "almost asleep"];
      uiEvents.emit("dialogue", "Employee Badge", [`The photo is ${poses[store.state.adnocBadgePhoto] ?? poses[0]}.`, "Security has decided this is official."]);
      return;
    }
    uiEvents.emit("minigame", {
      kind: "badge_photo",
      title: "SECURITY BADGE PHOTO",
      hint: "Press A / Space when Juju has a vaguely reasonable expression.",
      onDone: (reasonable?: boolean) => {
        if (quests.currentStep("q_adnoc_engineer")?.target !== "adnoc_badge_photo") return;
        store.state.adnocBadgePhoto = reasonable ? 0 : 3;
        if (!store.hasItem("adnoc_badge")) store.addItem("adnoc_badge");
        setAdnocRank("new_hire");
        quests.onMinigame("adnoc_badge_photo");
        store.save();
        uiEvents.emit("dialogue", "Security", [reasonable ? "EMPLOYEE BADGE ACQUIRED." : "EMPLOYEE BADGE ACQUIRED. The photograph will be discussed forever.", "Find the elevator. Engineering is upstairs."]);
        this.refreshHud();
      },
    });
  }

  private useDesk(workConsole = false) {
    const target = this.currentCareerTarget();
    if (target === "adnoc_desk") {
      quests.onInteract("adnoc_desk");
      uiEvents.emit("dialogue", "Juju's Desk", ["Computer. Chair. One pen.", "A tiny plant that has already seen too much.", "The laboratory is across the floor."]);
      return;
    }
    if (!workConsole && !adnocRankAtLeast(store.state.adnocRank, "chemical_engineer")) {
      store.toast("First find the desk, then earn the actual job.", "#e46d94");
      return;
    }
    const pending = store.state.adnocWorkday;
    if (pending && !pending.paid && pending.index >= pending.tasks.length) {
      const reward = finishWorkday();
      if (reward) this.reportWorkdayReward(reward);
      return;
    }
    const result = beginWorkday();
    if (!result.state) {
      uiEvents.emit("dialogue", "Work Day", [result.reason ?? "The task board is taking a coffee break."]);
      return;
    }
    const names = result.state.tasks.map((id, index) => `${index + 1}. ${id.replace(/_/g, " ").toUpperCase()}`);
    this.afterDialogue(() => this.launchNextWorkTask());
    uiEvents.emit("dialogue", "TODAY'S THREE JOBS", result.state.index ? [`Resuming at task ${result.state.index + 1}.`, ...names] : ["Three jobs. One salary. Several avoidable printer emotions.", ...names]);
  }

  private launchNextWorkTask() {
    const workday = store.state.adnocWorkday;
    if (!workday || workday.paid || workday.index >= workday.tasks.length) return;
    this.scene.start(SceneKeys.AdnocTask, { taskId: workday.tasks[workday.index], returnFloor: this.floor, workday: true });
  }

  private useLab() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_sample_sort") {
      this.launchStoryTask("sample_sort", "adnoc_sample_sort", "engineering");
      return;
    }
    if (target === "adnoc_results") {
      quests.onInteract("adnoc_results");
      store.setFlag("adnoc_carrying_results");
      uiEvents.emit("dialogue", "Lab Machine", ["RESULT: PERFECT.", "Second machine: SOMEHOW ALSO PERFECT.", "Carry the report to Alya. It will not walk itself."]);
      return;
    }
    uiEvents.emit("dialogue", "Fictional Sample Lab", ["All bottles are abstract, all procedures are imaginary, and every warning light is emotionally dramatic."]);
  }

  private useManager() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_manager") {
      const result = quests.onTalk("adnoc_manager", ["Clean results. Clear notes."]);
      store.setFlag("adnoc_carrying_results", false);
      setAdnocRank("chemical_engineer");
      addAdnocXp(15);
      store.unlockOutfit("engineer_blue");
      this.afterDialogue(() => this.showPromotion("chemical_engineer"));
      uiEvents.emit("dialogue", "Alya", ["Clean results. Clear notes.", "Welcome to the engineering team.", result.completedQuest?.complete ?? "Chemical Engineer Juju."]);
      return;
    }
    this.useMissionBoard();
  }

  private useMissionBoard() {
    const active = STORY_QUESTS.find((id) => quests.statusOf(id) === "active");
    if (active) {
      const step = quests.currentStep(active);
      uiEvents.emit("dialogue", "Career Board", [`ACTIVE: ${active.replace("q_adnoc_", "").replace(/_/g, " ").toUpperCase()}`, step?.hint ?? "Report to Alya."]);
      return;
    }
    const startable = STORY_QUESTS.find((id) => quests.canStartQuest(id));
    if (startable) {
      const started = quests.startQuest(startable);
      uiEvents.emit("dialogue", "Alya", started ? [started.intro] : ["Your quest tracker is full. Finish one active story, then check this board again."]);
      return;
    }
    uiEvents.emit("dialogue", "Career Board", [rankLabel().toUpperCase(), careerProgressText(), store.state.adnocLastPaidDay === store.state.currentDay ? "Paid workday complete for today." : "Work a day at your desk to earn salary and XP."]);
  }

  private addStoryEngineeringInteractions() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_paperclip_start") {
      this.addNpc(300, 245, "char_fashion_assistant", "RAMI", () => {
        quests.onInteract("adnoc_paperclip_start");
        this.afterDialogue(() => this.launchStoryTask("paperclip_boss", "adnoc_paperclip_boss", "engineering"));
        uiEvents.emit("dialogue", "Rami", ["I'll present this report.", "Juju: You'll present MY report?", "Rami: Our report.", "*paperclip flick*", "Juju: ...right."]);
      });
    } else if (target === "adnoc_paperclip_boss") {
      this.addInteractable(300, 245, 48, "Enter the extremely official paperclip arena", () => this.launchStoryTask("paperclip_boss", "adnoc_paperclip_boss", "engineering"));
    } else if (target === "adnoc_rival_problem") {
      this.addInteractable(480, 300, 48, "Fix the problem Rami did not understand", () => this.launchStoryTask("rival_problem", "adnoc_rival_problem", "engineering"));
    } else if (target === "adnoc_move_plant") {
      this.addInteractable(190, 225, 58, "Move the tiny plant to the team-lead desk", () => {
        const done = quests.onInteract("adnoc_move_plant");
        awardStoryXpOnce("adnoc_paperclip_story_xp", 35);
        setAdnocRank("team_lead");
        store.setFlag("adnoc_tiny_plant_moved");
        this.afterDialogue(() => this.showPromotion("team_lead"));
        uiEvents.emit("dialogue", "Juju", ["The desk is bigger.", "The tiny plant is coming with me.", done?.complete ?? "Team Lead Juju."]);
      });
    }
  }

  private addStoryOperationsInteractions() {
    const target = this.currentCareerTarget();
    const station = (targetId: string, x: number, y: number, prompt: string, taskId: string) => {
      if (target !== targetId) return;
      this.addInteractable(x, y, 65, prompt, () => this.launchStoryTask(taskId, targetId, "operations"));
      this.add.text(x, y - 35, "!", { fontFamily: "monospace", fontSize: "28px", color: "#e46d94", stroke: "#fff", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setDepth(300);
    };
    if (target === "adnoc_pressure_alarm") {
      this.addInteractable(455, 315, 72, "Answer the BEEP BEEP BEEP alarm", () => {
        quests.onInteract("adnoc_pressure_alarm");
        this.afterDialogue(() => this.launchStoryTask("pipe_route", "adnoc_pressure_pipe", "operations"));
        uiEvents.emit("dialogue", "Operations", ["BEEP BEEP BEEP.", "Coworker: Don't panic.", "Everyone else: *immediately panics*", "Route the blinking pipes first."]);
      });
    }
    station("adnoc_pressure_pipe", 455, 315, "Route the pressure pipes", "pipe_route");
    station("adnoc_pressure_valves", 455, 315, "Run the emergency valve sequence", "valve_panic");
    station("adnoc_pressure_console", 455, 315, "Hit the final emergency console", "control_lights");
    if (target === "adnoc_team_lead_start") {
      this.addInteractable(455, 315, 70, "Start Team Lead for a Day", () => {
        quests.onInteract("adnoc_team_lead_start");
        this.afterDialogue(() => this.launchStoryTask("team_lead_tasks", "adnoc_team_lead_tasks", "operations"));
        uiEvents.emit("dialogue", "Team Board", ["TASKS REMAINING: 4", "TEAM MORALE: cautiously optimistic", "Solve what you can. Perfection has been removed from the calendar."]);
      });
    }
    station("adnoc_team_lead_tasks", 455, 315, "Help four coworkers before the meeting grows", "team_lead_tasks");
    if (target === "adnoc_control_start") {
      this.addInteractable(455, 315, 70, "Enter the maintenance corridor", () => {
        quests.onInteract("adnoc_control_start");
        this.afterDialogue(() => this.launchStoryTask("steam_corridor", "adnoc_steam_corridor", "operations"));
        uiEvents.emit("dialogue", "Operations", ["Several fictional systems are cascading.", "Juju: Before lunch?", "Operations: Ideally before the coffee gets cold."]);
      });
    }
    station("adnoc_steam_corridor", 455, 315, "Run the steam corridor", "steam_corridor");
    station("adnoc_control_circuits", 455, 315, "Repair three circuit routes", "control_circuits");
    station("adnoc_control_memory", 455, 315, "Repeat the control sequence", "control_lights");
    station("adnoc_console_race", 455, 315, "Race to the final console", "console_race");
  }

  private addStoryManagementInteractions() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_director_start") {
      this.addInteractable(570, 310, 62, "Begin the Director's rounds", () => {
        quests.onInteract("adnoc_director_start");
        this.afterDialogue(() => this.launchStoryTask("director_inspection", "adnoc_director_inspection", "management"));
        uiEvents.emit("dialogue", "Alya", ["Morning, Director Juju.", "Juju: Please never say it that seriously.", "Three employee requests need an actual walk around HQ."]);
      });
    } else if (target === "adnoc_director_inspection") {
      this.addInteractable(570, 310, 62, "Inspect HQ and solve employee requests", () => this.launchStoryTask("director_inspection", "adnoc_director_inspection", "management"));
    } else if (target === "adnoc_director_briefing") {
      this.addInteractable(570, 310, 62, "Deliver the Director's briefing", () => {
        const done = quests.onInteract("adnoc_director_briefing");
        awardStoryXpOnce("adnoc_director_story_xp", 25);
        uiEvents.emit("dialogue", "Alya", ["Inspection complete. Teams supported. Snack drawer noted.", done?.complete ?? "The board would like a word."]);
      });
    }
  }

  private useBoardroom() {
    const target = this.currentCareerTarget();
    if (target === "adnoc_boardroom_walk") {
      quests.onInteract("adnoc_boardroom_walk");
      uiEvents.emit("dialogue", "Boardroom", ["The presentation screen wakes up.", "BOARD CONFIDENCE: cautiously blue.", "Find the missing information before slide 14 becomes only shawarma."]);
      return;
    }
    if (target === "adnoc_board_info") this.launchStoryTask("board_info", target, "executive");
    else if (target === "adnoc_board_questions") this.launchStoryTask("board_questions", target, "executive");
    else if (target === "adnoc_ceo_crisis") this.launchStoryTask("ceo_crisis", target, "executive");
    else if (target === "adnoc_board_return") {
      quests.onInteract("adnoc_board_return");
      awardStoryXpOnce("adnoc_ceo_story_xp", 40);
      setAdnocRank("ceo");
      store.unlockOutfit("ceo_blue");
      this.afterDialogue(() => this.showPromotion("ceo"));
      uiEvents.emit("dialogue", "Board Member", ["Congratulations.", "Juju: Do I get the big office?", "Yes.", "And control of the meeting schedule?", "Yes.", "Juju: Cancel half of them."]);
    } else uiEvents.emit("dialogue", "Boardroom", ["A very serious table. A very unserious slide about shawarma."]);
  }

  private useRooftop() {
    if (this.currentCareerTarget() === "adnoc_rooftop") {
      const done = quests.onInteract("adnoc_rooftop");
      store.setFlag("adnoc_ceo_office_unlocked");
      uiEvents.emit("dialogue", "ADNOC Rooftop", ["Blue glass. Gold sunset. Coworkers cheering below.", "CEO Juju: Tomorrow we work. Today we dramatically look at the skyline.", done?.complete ?? "CEO Juju."]);
      this.celebrationBurst();
      return;
    }
    uiEvents.emit("dialogue", "ADNOC Rooftop", ["The city looks very blue from up here."]);
  }

  private useCeoChair() {
    if (store.state.adnocRank !== "ceo") {
      uiEvents.emit("dialogue", "Future Office", ["Huge desk. Fancy chair. One suspiciously familiar tiny plant."]);
      return;
    }
    controls.locked = true;
    this.player.move(0, 0);
    this.tweens.add({ targets: this.player, angle: 360, duration: 650, ease: "Cubic.inOut", onComplete: () => this.player.setAngle(0) });
    this.afterDialogue(() => { controls.locked = false; });
    uiEvents.emit("dialogue", "CEO Activity", ["Sit dramatically.", "Spin once.", "Consider cancelling another meeting."]);
  }

  private launchStoryTask(taskId: string, storyTarget: string, returnFloor: AdnocFloor) {
    this.scene.start(SceneKeys.AdnocTask, { taskId, storyTarget, returnFloor });
  }

  private coworkerTalk(name: string) {
    const high = adnocRankAtLeast(store.state.adnocRank, "director");
    const lines: Record<string, string[]> = {
      Khalid: high ? ["Morning, boss.", "I found my badge. It was attached to me."] : ["Have you seen my badge?", "The elevator has displayed FLOOR 4 for six minutes."],
      Noor: high ? ["Director Juju! The printer is behaving out of respect."] : ["Lab is left of the printer.", "Juju: Which printer?", "Noor: Exactly."],
      Omar: high ? ["Everything is under control because I saw you arrive."] : ["Printer's jammed again.", "I have been in this meeting since Tuesday."],
      Dana: high ? ["The coffee machine knows your title now."] : ["The coffee machine knows my employee number.", "I do not know whether to be comforted."],
    };
    uiEvents.emit("dialogue", name, lines[name] ?? ["Busy day. Good snacks."]);
  }

  private openElevator() {
    if (this.elevatorOverlay) return;
    controls.locked = true;
    const { width, height } = this.scale.gameSize;
    const zoom = this.cameras.main.zoom;
    this.cameras.main.stopFollow();
    const center = this.cameras.main.getWorldPoint(width / 2, height / 2);
    const scale = 1 / zoom;
    const children: Phaser.GameObjects.GameObject[] = [];
    const shade = this.add.rectangle(0, 0, width, height, 0x13293b, 0.75);
    const panel = this.add.rectangle(0, 0, 330, 370, 0xfff4e6, 1).setStrokeStyle(5, 0x2f6fd0);
    const title = this.add.text(0, -157, "ADNOC HQ ELEVATOR", { fontFamily: "monospace", fontSize: "18px", color: "#173e63", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const hint = this.add.text(0, -132, "UP/DOWN + A, or tap a floor", { fontFamily: "monospace", fontSize: "9px", color: "#59616d", resolution: 2 }).setOrigin(0.5);
    children.push(shade, panel, title, hint);
    const floors: AdnocFloor[] = ["ground", "engineering", "operations", "management", "executive"];
    this.elevatorIndex = Math.max(0, floors.indexOf(this.floor));
    floors.forEach((floor, index) => {
      const unlocked = this.canAccessFloor(floor);
      const y = -92 + index * 52;
      const row = this.add.rectangle(0, y, 278, 42, index === this.elevatorIndex ? 0x2f6fd0 : unlocked ? 0xdceaf1 : 0xb8b2ad, 1).setStrokeStyle(2, 0x173e63).setInteractive({ useHandCursor: true });
      const required = floorAccessRank(floor);
      const label = unlocked ? `${index === 0 ? "G" : index} · ${FLOOR_LABELS[floor]}` : `${index} · ACCESS DENIED · REQUIRES ${adnocRankDef(required).shortLabel}`;
      const text = this.add.text(0, y, label, { fontFamily: "monospace", fontSize: "9px", color: index === this.elevatorIndex ? "#fff" : "#173e63", align: "center", resolution: 2 }).setOrigin(0.5);
      row.on("pointerup", () => { this.elevatorIndex = index; this.chooseElevatorFloor(); });
      this.elevatorRows.push(row);
      children.push(row, text);
    });
    const close = this.add.text(0, 151, "CLOSE", { fontFamily: "monospace", fontSize: "11px", color: "#fff", backgroundColor: "#59616d", padding: { x: 14, y: 6 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on("pointerup", () => this.closeElevator());
    children.push(close);
    this.elevatorOverlay = this.add.container(center.x, center.y, children).setScale(scale).setDepth(1000);
  }

  private canAccessFloor(floor: AdnocFloor) {
    if (adnocRankAtLeast(store.state.adnocRank, floorAccessRank(floor))) return true;
    const target = this.currentCareerTarget();
    if (floor === "engineering" && target === "adnoc_engineering_floor") return true;
    if (floor === "operations" && !!target && (target.includes("pressure") || target.includes("team_lead") || target.includes("control") || target.includes("steam") || target.includes("console_race"))) return true;
    if (floor === "executive" && !!target && (target.includes("final_promotion") || target.includes("board") || target.includes("ceo") || target.includes("rooftop"))) return true;
    return false;
  }

  private chooseElevatorFloor() {
    if (!this.elevatorOverlay) return;
    const floors: AdnocFloor[] = ["ground", "engineering", "operations", "management", "executive"];
    const floor = floors[this.elevatorIndex];
    if (!this.canAccessFloor(floor)) {
      const requirement = adnocRankDef(floorAccessRank(floor)).label;
      store.toast(`ACCESS DENIED · Requires ${requirement}`, "#e46d94");
      this.cameras.main.shake(55, 0.002);
      return;
    }
    const target = this.currentCareerTarget();
    if (floor === "engineering" && target === "adnoc_engineering_floor") quests.onInteract("adnoc_engineering_floor");
    if (floor === "executive" && target === "adnoc_final_promotion") quests.onInteract("adnoc_final_promotion");
    this.closeElevator(false);
    this.cameras.main.flash(180, 47, 111, 208);
    this.time.delayedCall(190, () => this.scene.restart({ floor }));
  }

  private closeElevator(resume = true) {
    this.elevatorOverlay?.destroy(true);
    this.elevatorOverlay = undefined;
    this.elevatorRows = [];
    controls.locked = false;
    if (resume) this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
  }

  private leaveHq() {
    if (store.state.adnocWorkday && store.state.adnocWorkday.index < store.state.adnocWorkday.tasks.length) {
      store.toast("Workday paused. Return to any work console to resume.", "#f4c95d");
    }
    uiEvents.emit("sceneReset");
    this.scene.start(SceneKeys.World, { locationId: "abudhabi_city", spawn: { x: 94 * 16, y: 36 * 16 }, driving: false });
  }

  private handleArrival() {
    if (!this.sys.isActive()) return;
    if (this.arrivalData.promotion) this.showPromotion(this.arrivalData.promotion);
    if (!this.arrivalData.workTaskDone) return;
    const workday = store.state.adnocWorkday;
    if (workday && workday.index < workday.tasks.length) {
      this.afterDialogue(() => this.launchNextWorkTask());
      uiEvents.emit("dialogue", "TASK COMPLETE", [`${workday.index} / ${workday.tasks.length} jobs complete.`, "Next problem approaching at office speed."]);
      return;
    }
    const reward = finishWorkday();
    if (!reward) return;
    this.reportWorkdayReward(reward);
  }

  private reportWorkdayReward(reward: NonNullable<ReturnType<typeof finishWorkday>>) {
    const stars = "★".repeat(reward.stars) + "☆".repeat(3 - reward.stars);
    uiEvents.emit("dialogue", "WORK DAY COMPLETE", [stars, `Base salary: +${reward.salary}`, `Performance bonus: +${reward.bonus}`, `Career XP: +${reward.xp}`, "Time moved forward. The printer remains under observation."]);
    this.refreshHud();
  }

  private showPromotion(rank: AdnocRank) {
    if (!this.sys.isActive()) return;
    store.setFlag(`adnoc_${rank}_promoted`);
    const { width, height } = this.scale.gameSize;
    const zoom = this.cameras.main.zoom;
    const center = this.cameras.main.getWorldPoint(width / 2, height / 2);
    const scale = 1 / zoom;
    const shade = this.add.rectangle(0, 0, width, height, 0x173e63, 0.72);
    const badge = this.add.graphics();
    badge.fillStyle(0xf4c95d, 1).fillCircle(0, -38, 42);
    badge.fillStyle(0x2f6fd0, 1).fillCircle(0, -38, 31);
    badge.fillStyle(0xffffff, 1).fillCircle(0, -38, 18);
    badge.fillStyle(0xf4c95d, 1).fillRect(-6, -47, 12, 18);
    const promoted = this.add.text(0, 25, rank === "ceo" ? "PROMOTED\nCHIEF EXECUTIVE OFFICER\nCEO JUJU" : `PROMOTED!\n${adnocRankDef(rank).label.toUpperCase()}`, { fontFamily: "monospace", fontSize: rank === "ceo" ? "19px" : "23px", color: "#f4c95d", align: "center", stroke: "#173e63", strokeThickness: 6, resolution: 2 }).setOrigin(0.5);
    const clap = this.add.text(0, 103, rank === "ceo" ? "CLAP!  FLASH!  FEWER MEETINGS!" : "CLAP!  CLAP!  TINY PLANT APPROVES!", { fontFamily: "monospace", fontSize: "10px", color: "#fff4e6", resolution: 2 }).setOrigin(0.5);
    const overlay = this.add.container(center.x, center.y, [shade, badge, promoted, clap]).setScale(0.2 * scale).setAlpha(0).setDepth(1200);
    this.tweens.add({ targets: overlay, alpha: 1, scale, duration: 480, ease: "Back.out", hold: 1700, yoyo: true, onComplete: () => overlay.destroy(true) });
    this.tweens.add({ targets: badge, angle: 360, duration: 900, ease: "Cubic.out" });
    this.tweens.add({ targets: this.player, y: this.player.y - 10, duration: 130, yoyo: true, repeat: 2 });
    for (let i = 0; i < 20; i++) {
      const sparkle = this.add.image(center.x, center.y, "ui_star").setScale(0.25 * scale).setDepth(1199);
      const angle = i * Math.PI * 2 / 20;
      this.tweens.add({ targets: sparkle, x: center.x + Math.cos(angle) * Phaser.Math.Between(80, 170) * scale, y: center.y + Math.sin(angle) * Phaser.Math.Between(65, 150) * scale, angle: 180, alpha: 0, duration: 950, delay: i * 25, onComplete: () => sparkle.destroy() });
    }
    this.refreshHud();
  }

  private celebrationBurst() {
    const center = this.cameras.main.getWorldPoint(this.scale.gameSize.width / 2, this.scale.gameSize.height / 2);
    for (let i = 0; i < 36; i++) {
      const bit = this.add.rectangle(center.x + Phaser.Math.Between(-150, 150), center.y - 160, Phaser.Math.Between(4, 8), Phaser.Math.Between(7, 13), i % 2 ? 0x2f6fd0 : 0xf4c95d, 1).setDepth(900);
      this.tweens.add({ targets: bit, y: center.y + 180, x: bit.x + Phaser.Math.Between(-80, 80), angle: 360, duration: Phaser.Math.Between(1400, 2400), delay: i * 30, onComplete: () => bit.destroy() });
    }
  }

  private refreshHud() {
    const workday = store.state.adnocWorkday;
    const work = workday ? ` · WORK ${Math.min(3, workday.index + 1)}/3` : "";
    uiEvents.emit("dedicatedStatus", `JUJU · ${adnocRankDef(store.state.adnocRank).shortLabel} · XP ${store.state.adnocXp}${work}\n${FLOOR_LABELS[this.floor]}`, "#fff4e6");
  }

  private afterDialogue(callback: () => void) {
    if (this.pendingDialogue) uiEvents.off("dialogueClosed", this.pendingDialogue);
    this.pendingDialogue = () => {
      this.pendingDialogue = undefined;
      callback();
    };
    uiEvents.once("dialogueClosed", this.pendingDialogue);
  }

  private tryInteract() {
    if (this.elevatorOverlay) {
      this.chooseElevatorFloor();
      return;
    }
    if (controls.locked || !this.current || this.time.now - this.lastInteract < 220) return;
    this.lastInteract = this.time.now;
    this.current.trigger();
  }

  private updateElevatorInput() {
    if (!this.elevatorOverlay) return false;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.closeElevator();
      return true;
    }
    const direction = Phaser.Input.Keyboard.JustDown(this.cursors.up) ? -1 : Phaser.Input.Keyboard.JustDown(this.cursors.down) ? 1 : 0;
    if (direction) {
      this.elevatorIndex = Phaser.Math.Wrap(this.elevatorIndex + direction, 0, 5);
      this.elevatorRows.forEach((row, index) => row.setFillStyle(index === this.elevatorIndex ? 0x2f6fd0 : this.canAccessFloor((["ground", "engineering", "operations", "management", "executive"] as AdnocFloor[])[index]) ? 0xdceaf1 : 0xb8b2ad));
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) this.chooseElevatorFloor();
    return true;
  }

  private movePlayer() {
    if (controls.locked) {
      this.player.move(0, 0);
      return;
    }
    let x = controls.moveX;
    let y = controls.moveY;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    this.player.move(x * this.player.speed, y * this.player.speed);
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.tryInteract();
  }

  private refreshCurrent() {
    if (this.elevatorOverlay) return;
    let closest: Interactable | undefined;
    let distance = Infinity;
    for (const item of this.interactables) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (d <= item.radius && d < distance) { closest = item; distance = d; }
    }
    if (closest === this.current) return;
    this.current = closest;
    uiEvents.emit("prompt", closest?.prompt ?? null);
  }

  private updateWorkOverlay() {
    this.workOverlay.clear();
    if (store.state.adnocRank === "visitor") return;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y - 10);
    this.workOverlay.fillStyle(0xffffff, 0.88).fillRect(x - 7, y + 8, 3, 10).fillRect(x + 4, y + 8, 3, 10);
    this.workOverlay.fillStyle(0x2f6fd0, 1).fillRect(x + 2, y + 8, 4, 5);
    this.workOverlay.fillStyle(0xffffff, 1).fillRect(x + 3, y + 9, 2, 2);
    if (adnocRankAtLeast(store.state.adnocRank, "senior_engineer") && !adnocRankAtLeast(store.state.adnocRank, "director")) {
      this.workOverlay.fillStyle(0xf4c95d, 1).fillRect(x - 7, y - 6, 14, 4).fillRoundedRect(x - 5, y - 10, 10, 7, 3);
    }
    if (adnocRankAtLeast(store.state.adnocRank, "director")) this.workOverlay.fillStyle(0xf4c95d, 1).fillRect(x - 1, y + 12, 2, 2);
    this.workOverlay.setDepth(this.player.y + 2);
  }

  private shutdown() {
    if (this.pendingDialogue) uiEvents.off("dialogueClosed", this.pendingDialogue);
    this.pendingDialogue = undefined;
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("openMap", this.blockMap, this);
    uiEvents.emit("dedicatedStatus", null);
    uiEvents.emit("prompt", null);
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
  }

  update() {
    if (!this.player) return;
    if (this.updateElevatorInput()) {
      this.player.move(0, 0);
      return;
    }
    this.movePlayer();
    this.updateWorkOverlay();
    this.refreshCurrent();
  }
}
