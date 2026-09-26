import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { ADNOC_WORK_TASKS, type AdnocFloor, type AdnocRank, type AdnocWorkTaskId } from "../data/adnoc";
import { Player } from "../objects/Player";
import { controls, minimap, uiEvents } from "../systems/controls";
import * as quests from "../systems/quests";
import { awardStoryXpOnce, incrementAdnocStat, recordWorkTask, setAdnocRank } from "../systems/adnoc";
import { store } from "../systems/store";

interface TaskSceneData {
  taskId: string;
  returnFloor?: AdnocFloor;
  storyTarget?: string;
  workday?: boolean;
}

interface TaskInteractable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  active: boolean;
  trigger: () => void;
}

interface MovingHazard {
  view: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
  vx: number;
  vy: number;
  hostile: boolean;
  radius: number;
}

const COLORS = [0x4f91d2, 0xf4c95d, 0x57a56d, 0xe46d94];
const COLOR_NAMES = ["BLUE", "GOLD", "GREEN", "PINK"];

export class AdnocTaskScene extends Phaser.Scene {
  private taskData!: TaskSceneData;
  private player!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private interactables: TaskInteractable[] = [];
  private current?: TaskInteractable;
  private lastAction = 0;
  private statusText = "";
  private count = 0;
  private needed = 1;
  private mistakes = 0;
  private completed = false;
  private timerEndsAt = 0;
  private timerLabel = "";
  private held = -1;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private hazards: MovingHazard[] = [];
  private retryOverlay?: Phaser.GameObjects.Container;
  private sequence: number[] = [];
  private sequenceIndex = 0;
  private sequenceVisibleUntil = 0;
  private pipeStates: number[] = [];
  private pipeTargets: number[] = [];
  private pipeViews: Phaser.GameObjects.Container[] = [];
  private rival?: Phaser.GameObjects.Container;
  private rivalEgo = 6;
  private patience = 4;
  private nextHazardAt = 0;
  private invulnerableUntil = 0;
  private cone?: Phaser.GameObjects.Graphics;
  private finalStage = 0;
  private readonly blockMap = () => store.toast("No map. The task has achieved local importance.", "#8ecae6");

  constructor() {
    super(SceneKeys.AdnocTask);
  }

  create(data: TaskSceneData) {
    this.taskData = { ...data, returnFloor: data.returnFloor ?? "engineering" };
    this.interactables = [];
    this.current = undefined;
    this.objects = [];
    this.hazards = [];
    this.count = 0;
    this.needed = 1;
    this.mistakes = 0;
    this.completed = false;
    this.timerEndsAt = 0;
    this.timerLabel = "";
    this.held = -1;
    this.retryOverlay = undefined;
    this.sequence = [];
    this.sequenceIndex = 0;
    this.sequenceVisibleUntil = 0;
    this.pipeStates = [];
    this.pipeTargets = [];
    this.pipeViews = [];
    this.rival = undefined;
    this.rivalEgo = 6;
    this.patience = 4;
    this.nextHazardAt = 0;
    this.invulnerableUntil = 0;
    this.cone = undefined;
    this.finalStage = 0;
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
    minimap.on = false;
    uiEvents.emit("sceneReset");
    uiEvents.emit("prompt", null);

    const width = 720;
    const height = 480;
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height).setBackgroundColor("#dceaf1");
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.scale.gameSize.height / 560, 0.9, 1.65));
    this.drawArena(width, height);
    this.player = new Player(this, width / 2, height - 58, "char_her");
    this.player.setDepth(this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E,ENTER") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.action, this);
    uiEvents.on("openMap", this.blockMap, this);
    const uiWasActive = this.scene.isActive(SceneKeys.UI);
    if (!uiWasActive) this.scene.launch(SceneKeys.UI);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const builders: Record<string, () => void> = {
      sample_sort: () => this.buildSampleSort(),
      valve_panic: () => this.buildValvePanic(),
      pipe_route: () => this.buildPipeRoute(6),
      printer_boss: () => this.buildPrinterBoss(),
      inbox_defence: () => this.buildInboxDefence(false),
      safety_walk: () => this.buildSafetyWalk(false),
      lost_badge: () => this.buildLostBadge(),
      coffee_run: () => this.buildCoffeeRun(),
      control_lights: () => this.buildControlLights(),
      meeting_escape: () => this.buildMeetingEscape(),
      hard_hat_hunt: () => this.buildHardHatHunt(),
      paperwork_stack: () => this.buildInboxDefence(true),
      paperclip_boss: () => this.buildPaperclipBoss(),
      rival_problem: () => this.buildRivalProblem(),
      team_lead_tasks: () => this.buildTeamLeadTasks(),
      steam_corridor: () => this.buildSteamCorridor(),
      control_circuits: () => this.buildPipeRoute(8),
      console_race: () => this.buildConsoleRace(),
      director_inspection: () => this.buildSafetyWalk(true),
      board_info: () => this.buildBoardInfo(),
      board_questions: () => this.buildBoardQuestions(),
      ceo_crisis: () => this.buildCeoCrisis(),
    };
    (builders[this.taskData.taskId] ?? builders.safety_walk)();
    const announce = () => {
      this.setStatus(this.statusText);
      uiEvents.emit("locationTitle", this.taskTitle(), this.taskData.workday ? "Today's ADNOC workday" : "Career mission");
    };
    if (uiWasActive) announce();
    else this.time.delayedCall(0, announce);
  }

  private drawArena(width: number, height: number) {
    const g = this.add.graphics().setDepth(-20);
    g.fillStyle(0xdceaf1, 1).fillRect(0, 0, width, height);
    for (let y = 26; y < height; y += 28) g.fillStyle(y % 56 ? 0xbfd4df : 0xcbdfe8, 0.55).fillRect(0, y, width, 2);
    g.fillStyle(0x173e63, 1).fillRect(0, 0, width, 24).fillRect(0, 0, 20, height).fillRect(width - 20, 0, 20, height).fillRect(0, height - 20, width, 20);
    g.fillStyle(0x2f6fd0, 1).fillRect(20, 24, width - 40, 7);
    for (let x = 50; x < width - 50; x += 88) {
      g.fillStyle(0xa8daed, 0.8).fillRoundedRect(x, 42, 64, 34, 4);
      g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x, 42, 64, 34, 4);
    }
  }

  private taskTitle() {
    const repeat = ADNOC_WORK_TASKS.find((task) => task.id === this.taskData.taskId);
    const story: Record<string, string> = {
      paperclip_boss: "OFFICE BOSS · THE CREDIT STEALER",
      rival_problem: "THIRTY-SECOND ENGINEERING FIX",
      team_lead_tasks: "TEAM LEAD FOR A DAY",
      steam_corridor: "MAINTENANCE CORRIDOR",
      control_circuits: "CONTROL CIRCUIT ROUTE",
      console_race: "FINAL CONSOLE RACE",
      director_inspection: "DIRECTOR'S HQ INSPECTION",
      board_info: "BOARDROOM · MISSING INFORMATION",
      board_questions: "QUESTION GAUNTLET",
      ceo_crisis: "THE FINAL CAREER CRISIS",
    };
    return repeat?.title.toUpperCase() ?? story[this.taskData.taskId] ?? "ADNOC TASK";
  }

  private setStatus(message: string, color = "#fff4e6") {
    this.statusText = message;
    const timer = this.timerEndsAt ? ` · ${Math.max(0, Math.ceil((this.timerEndsAt - this.time.now) / 1000))}s` : "";
    uiEvents.emit("dedicatedStatus", `${this.taskTitle()}${timer}\n${message}`, color);
  }

  private addInteractable(x: number, y: number, radius: number, prompt: string, trigger: () => void) {
    const item: TaskInteractable = { x, y, radius, prompt, trigger, active: true };
    this.interactables.push(item);
    return item;
  }

  private marker(x: number, y: number, color: number, label: string, size = 24) {
    const shadow = this.add.ellipse(0, size * 0.42, size * 1.5, size * 0.55, 0x173e63, 0.25);
    const shape = this.add.rectangle(0, 0, size, size, color, 1).setStrokeStyle(3, 0xffffff);
    const text = this.add.text(0, size * 0.8, label, { fontFamily: "monospace", fontSize: "8px", color: "#173e63", backgroundColor: "#fff4e6", padding: { x: 3, y: 1 }, align: "center", resolution: 2 }).setOrigin(0.5, 0);
    const container = this.add.container(x, y, [shadow, shape, text]).setDepth(y);
    this.objects.push(container);
    return container;
  }

  private buildSampleSort() {
    this.needed = 4;
    const stations = [110, 275, 445, 610];
    const bottles = [0, 2, 1, 3];
    stations.forEach((x, color) => {
      const station = this.marker(x, 125, COLORS[color], `${COLOR_NAMES[color]}\nANALYSER`, 42);
      this.addInteractable(x, 165, 45, `Place ${COLOR_NAMES[color]} sample`, () => {
        if (this.held < 0) { store.toast("Pick up a sample first.", "#8ecae6"); return; }
        if (this.held !== color) {
          this.mistakes += 1;
          this.effectText(x, 165, "BEEP!\nThat feels judgmental.", "#e46d94");
          return;
        }
        this.held = -1;
        this.count += 1;
        station.setAlpha(0.55);
        this.effectText(x, 155, "PERFECT!", "#57a56d");
        this.setStatus(`SAMPLES SORTED ${this.count} / ${this.needed}`);
        if (this.count >= this.needed) this.completeTask();
      });
    });
    bottles.forEach((color, index) => {
      const x = 145 + index * 145;
      const bottle = this.marker(x, 330, COLORS[color], `${COLOR_NAMES[color]} SAMPLE`, 24);
      const action = this.addInteractable(x, 340, 34, `Pick up ${COLOR_NAMES[color]} sample`, () => {
        if (this.held >= 0) { store.toast("One sample at a time, engineer.", "#f4c95d"); return; }
        this.held = color;
        action.active = false;
        bottle.setVisible(false);
        this.effectText(x, 320, "PICKED UP", "#2f6fd0");
        this.setStatus(`CARRYING ${COLOR_NAMES[color]} · FIND ITS ANALYSER`);
      });
    });
    this.setStatus("MOVE TO A SAMPLE · A TO PICK UP · MATCH THE ANALYSER");
  }

  private buildValvePanic() {
    this.needed = 4;
    this.sequence = [2, 0, 3, 1];
    this.timerEndsAt = this.time.now + 28000;
    const spots = [[125, 145], [595, 145], [145, 330], [575, 330]];
    spots.forEach(([x, y], index) => {
      const valve = this.add.graphics().setDepth(y);
      valve.lineStyle(7, index === this.sequence[0] ? 0xe46d94 : 0x59616d, 1).strokeCircle(x, y, 23).lineBetween(x - 24, y, x + 24, y).lineBetween(x, y - 24, x, y + 24);
      this.objects.push(valve);
      this.add.text(x, y + 35, `VALVE ${index + 1}`, { fontFamily: "monospace", fontSize: "9px", color: "#173e63", resolution: 2 }).setOrigin(0.5).setDepth(y + 2);
      this.addInteractable(x, y, 42, `Turn valve ${index + 1}`, () => {
        if (index !== this.sequence[this.sequenceIndex]) {
          this.mistakes += 1;
          this.player.x = Phaser.Math.Clamp(this.player.x + (this.player.x < x ? -36 : 36), 35, 685);
          this.effectText(x, y, "PSHHH! WRONG VALVE", "#e46d94");
          return;
        }
        this.sequenceIndex += 1;
        valve.clear().lineStyle(7, 0x57a56d, 1).strokeCircle(x, y, 23).lineBetween(x - 24, y, x + 24, y).lineBetween(x, y - 24, x, y + 24);
        this.setStatus(`PRESSURE ${"█".repeat(4 - this.sequenceIndex)}${"░".repeat(this.sequenceIndex)} · NEXT ${this.sequence[this.sequenceIndex] !== undefined ? this.sequence[this.sequenceIndex] + 1 : "DONE"}`);
        if (this.sequenceIndex >= this.sequence.length) this.completeTask();
      });
    });
    this.setStatus(`PRESSURE ████ · SEQUENCE ${this.sequence.map((n) => n + 1).join(" → ")}`);
  }

  private buildPipeRoute(count: number) {
    this.needed = count;
    const columns = count > 6 ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const x = 200 + (i % columns) * 110;
      const y = 145 + Math.floor(i / columns) * 145;
      const target = i % 2;
      const state = (i * 3 + 1) % 4;
      this.pipeTargets.push(target);
      this.pipeStates.push(state);
      const tile = this.pipeTile(x, y, i);
      this.pipeViews.push(tile);
      this.addInteractable(x, y, 42, `Rotate pipe ${i + 1}`, () => {
        this.pipeStates[i] = (this.pipeStates[i] + 1) % 4;
        tile.setAngle(this.pipeStates[i] * 90);
        this.effectText(x, y - 30, "CLICK!", "#2f6fd0");
        const correct = this.pipeStates.filter((value, index) => value % 2 === this.pipeTargets[index]).length;
        this.setStatus(`PIPE ROUTE ${correct} / ${count} ALIGNED`);
        if (correct === count) this.completeTask();
      });
    }
    this.setStatus("WALK BETWEEN PIPE TILES · ROTATE BLUE LINES TO GOLD MARKS");
  }

  private pipeTile(x: number, y: number, index: number) {
    const box = this.add.rectangle(0, 0, 64, 64, 0xf7fbfd, 1).setStrokeStyle(3, 0xf4c95d);
    const pipe = this.add.graphics();
    pipe.lineStyle(13, 0x2f6fd0, 1).lineBetween(-32, 0, 32, 0);
    pipe.fillStyle(0x8ecae6, 1).fillCircle(0, 0, 9);
    const label = this.add.text(0, 0, `${index + 1}`, { fontFamily: "monospace", fontSize: "9px", color: "#fff", resolution: 2 }).setOrigin(0.5);
    return this.add.container(x, y, [box, pipe, label]).setAngle(this.pipeStates[index] * 90).setDepth(y);
  }

  private buildPrinterBoss() {
    this.needed = 3;
    const printer = this.add.graphics().setDepth(140);
    printer.fillStyle(0xd9d9d9, 1).fillRoundedRect(305, 90, 110, 82, 8);
    printer.fillStyle(0x59616d, 1).fillRect(325, 105, 70, 30);
    printer.fillStyle(0x7be0a3, 1).fillCircle(391, 151, 7);
    this.add.text(360, 82, "HP LASERJET OF DOOM", { fontFamily: "monospace", fontSize: "12px", color: "#173e63", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(142);
    const pageSpots = [[115, 175], [600, 225], [250, 340]];
    pageSpots.forEach(([x, y], index) => {
      const page = this.marker(x, y, 0xffffff, `MISSING PAGE ${index + 1}`, 26);
      const pickup = this.addInteractable(x, y, 35, `Collect report page ${index + 1}`, () => {
        pickup.active = false;
        page.setVisible(false);
        this.count += 1;
        this.setStatus(`REPORT PAGES ${this.count} / 3 · ${this.count === 3 ? "HIT PRINT" : "KEEP DODGING"}`);
      });
    });
    this.addInteractable(360, 188, 52, "Smack the giant green PRINT button", () => {
      if (this.count < 3) { store.toast("The printer demands all three pages.", "#e46d94"); return; }
      this.effectText(360, 170, "READY", "#57a56d");
      this.completeTask();
    });
    this.nextHazardAt = this.time.now + 500;
    this.setStatus("BOSS BATTLE · DODGE PAPER · COLLECT 3 PAGES");
  }

  private buildInboxDefence(paperwork: boolean) {
    this.needed = paperwork ? 6 : 5;
    this.timerEndsAt = this.time.now + 38000;
    const labels = paperwork ? ["SAFETY", "PEOPLE", "PLAN"] : ["URGENT", "LATER", "SPAM"];
    const binX = [150, 360, 570];
    binX.forEach((x, index) => {
      this.marker(x, 120, COLORS[index], labels[index], 54);
      this.addInteractable(x, 170, 48, `File under ${labels[index]}`, () => {
        if (this.held < 0) { store.toast("Catch a card first.", "#8ecae6"); return; }
        if (this.held !== index) {
          this.mistakes += 1;
          this.effectText(x, 170, paperwork ? "WRONG TRAY" : "INBOX DISAGREES", "#e46d94");
          return;
        }
        this.held = -1;
        this.count += 1;
        this.setStatus(`${paperwork ? "REPORTS FILED" : "MESSAGES SORTED"} ${this.count} / ${this.needed}`);
        if (this.count >= this.needed) this.completeTask();
      });
    });
    for (let i = 0; i < this.needed; i++) {
      const type = (i * 2 + 1) % 3;
      const x = 105 + (i % 3) * 245;
      const y = 285 + Math.floor(i / 3) * 90;
      const card = this.marker(x, y, 0xffffff, paperwork ? `${labels[type]} REPORT` : type === 0 ? "CONTROL ROOM" : type === 1 ? "MEETING ABOUT MEETING" : "WIN 900 BARRELS", 30);
      const pickup = this.addInteractable(x, y, 38, "Pick up incoming card", () => {
        if (this.held >= 0) return;
        this.held = type;
        pickup.active = false;
        card.setVisible(false);
        this.setStatus(`CARRYING ${labels[type]} · FIND THE MATCHING BAY`);
      });
    }
    this.setStatus(`CATCH AND SORT: ${labels.join(" · ")}`);
  }

  private buildSafetyWalk(director: boolean) {
    const hazards = director
      ? ["LOCKED OUT INTERN", "BROKEN COFFEE", "WORRIED PRINTER", "MISSING REPORT"]
      : ["BANANA PEEL", "FLOOR CABLE", "COFFEE BY KEYBOARD", "ROLLING CHAIR", "BLOCKED DOOR"];
    this.needed = director ? 4 : 5;
    const spots = [[105, 145], [610, 145], [180, 315], [530, 330], [360, 235]];
    hazards.forEach((label, index) => {
      const item = this.marker(spots[index][0], spots[index][1], director ? 0x8ecae6 : COLORS[index % 4], label, 28);
      const action = this.addInteractable(spots[index][0], spots[index][1], 38, director ? `Help: ${label}` : `Fix hazard: ${label}`, () => {
        action.active = false;
        item.setAlpha(0.25);
        this.count += 1;
        this.effectText(spots[index][0], spots[index][1] - 28, director ? "SORTED!" : "SAFE!", "#57a56d");
        this.setStatus(`${director ? "EMPLOYEE REQUESTS" : "HAZARDS"} ${this.count} / ${this.needed}`);
        if (this.count >= this.needed) this.completeTask();
      });
    });
    this.setStatus(director ? "RUN THE FLOOR · SOLVE FOUR EMPLOYEE REQUESTS" : "EXPLORE · FIND EVERY SILLY HAZARD");
  }

  private buildLostBadge() {
    const labels = ["PRINTER", "COFFEE MACHINE", "PLANT", "MEETING TABLE", "ELEVATOR"];
    const spots = [[110, 145], [610, 145], [155, 330], [560, 330], [360, 230]];
    const correct = (store.state.currentDay + store.state.adnocWorkdays) % labels.length;
    spots.forEach(([x, y], index) => {
      this.marker(x, y, index === correct ? 0xf4c95d : 0x8ecae6, labels[index], 36);
      this.addInteractable(x, y, 42, `Search near ${labels[index].toLowerCase()}`, () => {
        if (index !== correct) {
          this.mistakes += 1;
          this.effectText(x, y - 30, index === 2 ? "JUST SOIL" : "NO BADGE", "#e46d94");
          return;
        }
        this.effectText(x, y - 34, "BADGE FOUND!", "#57a56d");
        this.completeTask();
      });
    });
    this.setStatus("KHALID'S BADGE IS SOMEWHERE · SEARCH THE OFFICE");
  }

  private buildCoffeeRun() {
    this.needed = 3;
    this.held = 0;
    this.timerEndsAt = this.time.now + 42000;
    const coffee = this.marker(360, 130, 0x8a5c3b, "COFFEE TRAY", 42);
    this.addInteractable(360, 165, 44, "Pick up three coffees", () => {
      if (this.held > 0) return;
      this.held = 3;
      coffee.setVisible(false);
      this.player.speed = 108;
      this.setStatus("TRAY WOBBLE ░░░░ · DELIVER 3 COFFEES");
    });
    [[125, 310], [595, 300], [360, 275]].forEach(([x, y], index) => {
      const coworker = this.marker(x, y, 0x2f6fd0, ["NOOR", "OMAR", "DANA"][index], 30);
      const deliver = this.addInteractable(x, y, 40, `Deliver coffee to ${["Noor", "Omar", "Dana"][index]}`, () => {
        if (this.held <= 0) { store.toast("The tray is still at the coffee machine.", "#e46d94"); return; }
        deliver.active = false;
        coworker.setAlpha(0.55);
        this.held -= 1;
        this.count += 1;
        this.effectText(x, y - 30, "COFFEE!", "#57a56d");
        this.setStatus(`COFFEES DELIVERED ${this.count} / 3 · WOBBLE ${"█".repeat(Math.min(4, this.mistakes))}${"░".repeat(Math.max(0, 4 - this.mistakes))}`);
        if (this.count >= this.needed) this.completeTask();
      });
    });
    this.setStatus("PICK UP THE COFFEE TRAY");
  }

  private buildControlLights() {
    this.needed = 5;
    this.sequence = [1, 3, 0, 2, 1];
    this.sequenceVisibleUntil = this.time.now + 3200;
    const spots = [[150, 160], [570, 160], [170, 330], [550, 330]];
    spots.forEach(([x, y], index) => {
      this.marker(x, y, COLORS[index], `CONSOLE ${index + 1}`, 46);
      this.addInteractable(x, y, 48, `Press console ${index + 1}`, () => this.pressSequence(index));
    });
    this.setStatus(`MEMORISE: ${this.sequence.map((n) => n + 1).join(" · ")}`);
  }

  private pressSequence(index: number) {
    if (this.time.now < this.sequenceVisibleUntil) { store.toast("Memorise first. Then panic calmly.", "#f4c95d"); return; }
    if (index !== this.sequence[this.sequenceIndex]) {
      this.mistakes += 1;
      this.sequenceIndex = 0;
      this.effectText(this.player.x, this.player.y - 28, "BEEP! RESET", "#e46d94");
      this.setStatus("WRONG CONSOLE · SEQUENCE RESTARTED");
      return;
    }
    this.sequenceIndex += 1;
    this.effectText(this.player.x, this.player.y - 28, "DING!", "#57a56d");
    this.setStatus(`SEQUENCE ${this.sequenceIndex} / ${this.sequence.length}`);
    if (this.sequenceIndex >= this.sequence.length) this.completeTask();
  }

  private buildMeetingEscape() {
    this.timerEndsAt = this.time.now + 32000;
    this.cone = this.add.graphics().setDepth(3);
    this.marker(360, 120, 0x7be0a3, "EXIT BEFORE SLIDE 48", 50);
    this.addInteractable(360, 120, 55, "Escape the meeting", () => this.completeTask());
    for (const [x, y] of [[235, 230], [485, 230], [360, 320]]) {
      this.add.rectangle(x, y, 105, 42, 0x7b583f, 1).setStrokeStyle(3, 0x4d3527).setDepth(y);
    }
    this.setStatus("ESCAPE BEFORE SOMEONE ADDS ANOTHER SLIDE · AVOID THE VISION CONE");
  }

  private buildHardHatHunt() {
    this.needed = 5;
    this.timerEndsAt = this.time.now + 30000;
    const spots = [[100, 140], [620, 150], [165, 330], [555, 345], [360, 235]];
    spots.forEach(([x, y], index) => {
      const hat = this.marker(x, y, 0xf4c95d, `HARD HAT ${index + 1}`, 28);
      const pickup = this.addInteractable(x, y, 38, `Collect hard hat ${index + 1}`, () => {
        pickup.active = false;
        hat.setVisible(false);
        this.count += 1;
        this.setStatus(`HARD HATS ${this.count} / 5`);
        if (this.count >= 5) this.completeTask();
      });
    });
    this.setStatus("FIVE ENGINEERS · ZERO HATS · FIX THE EQUATION");
  }

  private buildPaperclipBoss() {
    this.needed = 6;
    this.player.setPosition(360, 400);
    this.rival = this.makeRival(360, 125);
    this.nextHazardAt = this.time.now + 900;
    for (const [x, y] of [[190, 245], [530, 245]]) this.add.rectangle(x, y, 110, 42, 0x7b583f, 1).setStrokeStyle(3, 0x4d3527).setDepth(y);
    this.setStatus("JUJU'S PATIENCE ♥♥♥♥ · RIVAL'S EGO ██████ · A TO FLICK");
  }

  private makeRival(x: number, y: number) {
    const chair = this.add.graphics();
    chair.fillStyle(0x59616d, 1).fillRoundedRect(-19, -3, 38, 34, 7).fillRect(-4, 28, 8, 20);
    chair.fillCircle(-13, 49, 6).fillCircle(13, 49, 6);
    const rival = this.add.sprite(0, 5, "char_fashion_assistant", 0).setOrigin(0.5, 0.85).setScale(1.45);
    rival.play("char_fashion_assistant-idle-down", true);
    const label = this.add.text(0, -33, "THE CREDIT STEALER", { fontFamily: "monospace", fontSize: "9px", color: "#fff", backgroundColor: "#9d315d", padding: { x: 5, y: 2 }, resolution: 2 }).setOrigin(0.5);
    return this.add.container(x, y, [chair, rival, label]).setDepth(y);
  }

  private buildRivalProblem() {
    this.timerEndsAt = this.time.now + 35000;
    this.buildPipeRoute(4);
    this.setStatus("RIVAL'S PROJECT IS BLINKING · JUJU: GIVE ME THIRTY SECONDS");
  }

  private buildTeamLeadTasks() {
    this.needed = 4;
    this.timerEndsAt = this.time.now + 52000;
    const problems = ["MISSING REPORT", "PRINTER EXPLODED", "LOCKED OUT", "COFFEE BROKEN"];
    const spots = [[120, 150], [600, 150], [155, 330], [565, 330]];
    problems.forEach((problem, index) => {
      const view = this.marker(spots[index][0], spots[index][1], COLORS[index], problem, 42);
      const solve = this.addInteractable(spots[index][0], spots[index][1], 48, `Solve: ${problem}`, () => {
        solve.active = false;
        view.setAlpha(0.35);
        this.count += 1;
        this.effectText(spots[index][0], spots[index][1] - 35, ["FILED!", "UNEXPLODED!", "ACCESS!", "CAFFEINATED!"][index], "#57a56d");
        this.setStatus(`TEAM MORALE ${"★".repeat(this.count)}${"☆".repeat(4 - this.count)} · TASKS ${4 - this.count}`);
        if (this.count >= 4) this.completeTask();
      });
    });
    this.setStatus("TEAM MORALE ☆☆☆☆ · TASKS REMAINING 4");
  }

  private buildSteamCorridor() {
    this.timerEndsAt = this.time.now + 36000;
    this.player.setPosition(360, 410);
    for (let i = 0; i < 5; i++) {
      const y = 330 - i * 55;
      const jet = this.add.graphics().setDepth(y);
      jet.fillStyle(0x8ecae6, 0.55).fillRoundedRect(i % 2 ? 0 : -340, -10, 340, 20, 8).setPosition(i % 2 ? 360 : 360, y);
      jet.setData("phase", i * 650);
      jet.setData("right", i % 2 === 1);
      this.objects.push(jet);
    }
    this.marker(360, 78, 0x7be0a3, "CONTROL ROOM DOOR", 48);
    this.addInteractable(360, 78, 55, "Reach the control room", () => this.completeTask());
    this.setStatus("DODGE THE STEAM BURSTS · REACH THE CONTROL ROOM");
  }

  private buildConsoleRace() {
    this.timerEndsAt = this.time.now + 26000;
    this.sequence = [0, 2, 1, 3];
    this.sequenceIndex = 0;
    const spots = [[115, 150], [605, 150], [155, 330], [565, 330]];
    spots.forEach(([x, y], index) => {
      this.marker(x, y, COLORS[index], `RACE CONSOLE ${index + 1}`, 42);
      this.addInteractable(x, y, 46, `Hit race console ${index + 1}`, () => {
        if (index !== this.sequence[this.sequenceIndex]) {
          this.mistakes += 1;
          this.effectText(x, y - 32, "LOCKED!", "#e46d94");
          return;
        }
        this.sequenceIndex += 1;
        this.setStatus(`COUNTDOWN ${Math.max(0, 4 - this.sequenceIndex)} · CONSOLES ${this.sequenceIndex}/4`);
        if (this.sequenceIndex >= 4) {
          this.effectText(x, y - 35, "BIG RED BUTTON!", "#57a56d");
          this.completeTask();
        }
      });
    });
    this.setStatus(`COUNTDOWN ACTIVE · ORDER ${this.sequence.map((n) => n + 1).join(" → ")}`);
  }

  private buildBoardInfo() {
    this.needed = 4;
    const labels = ["SAFETY", "PEOPLE", "EFFICIENCY", "MORE SNACKS"];
    const spots = [[120, 145], [600, 145], [155, 330], [565, 330]];
    labels.forEach((label, index) => {
      const terminal = this.marker(spots[index][0], spots[index][1], COLORS[index], label, 44);
      const collect = this.addInteractable(spots[index][0], spots[index][1], 48, `Collect slide data: ${label}`, () => {
        collect.active = false;
        terminal.setAlpha(0.4);
        this.count += 1;
        this.effectText(spots[index][0], spots[index][1] - 34, index === 3 ? "BOARD: ...ACCEPTED" : "CONFIDENCE +", "#57a56d");
        this.setStatus(`BOARD CONFIDENCE ${"█".repeat(this.count)}${"░".repeat(4 - this.count)} · INFO ${this.count}/4`);
        if (this.count >= 4) this.completeTask();
      });
    });
    this.setStatus("BOARD CONFIDENCE ░░░░ · FIND FOUR MISSING SLIDE COMPONENTS");
  }

  private buildBoardQuestions() {
    this.needed = 4;
    this.sequence = [0, 1, 2, 3];
    const answers = ["BACKUP PLAN", "PEOPLE", "TIMELINE", "NEXT QUESTION"];
    const questions = ["What if it fails?", "How will teams use it?", "What is the timeline?", "Why is slide 14 shawarma?"];
    const spots = [[125, 155], [595, 155], [165, 335], [555, 335]];
    answers.forEach((answer, index) => {
      this.marker(spots[index][0], spots[index][1], COLORS[index], answer, 46);
      this.addInteractable(spots[index][0], spots[index][1], 50, `Answer: ${answer}`, () => {
        if (index !== this.sequence[this.sequenceIndex]) {
          this.mistakes += 1;
          this.effectText(spots[index][0], spots[index][1] - 35, "BOARD MURMUR", "#e46d94");
          return;
        }
        this.sequenceIndex += 1;
        this.setStatus(this.sequenceIndex >= 4 ? "QUESTION GAUNTLET SURVIVED" : `QUESTION ${this.sequenceIndex + 1}/4 · ${questions[this.sequenceIndex]}`);
        if (this.sequenceIndex >= 4) this.completeTask();
      });
    });
    this.setStatus(`QUESTION 1/4 · ${questions[0]}`);
  }

  private buildCeoCrisis() {
    this.needed = 4;
    this.timerEndsAt = this.time.now + 65000;
    this.finalStage = 0;
    const stations = [
      { x: 115, y: 150, label: "DODGE LANE", prompt: "Clear the fallen folders" },
      { x: 605, y: 150, label: "PIPE ROUTE", prompt: "Route the final pipe" },
      { x: 150, y: 335, label: "VALVE", prompt: "Close the final valve" },
      { x: 570, y: 335, label: "COMMAND", prompt: "Deliver the final command" },
    ];
    stations.forEach((station, index) => {
      const view = this.marker(station.x, station.y, COLORS[index], station.label, 48);
      this.addInteractable(station.x, station.y, 52, station.prompt, () => {
        if (index !== this.finalStage) {
          this.mistakes += 1;
          this.effectText(station.x, station.y - 38, "NOT YET!", "#e46d94");
          return;
        }
        view.setAlpha(0.4);
        this.finalStage += 1;
        this.effectText(station.x, station.y - 38, ["WHOOSH!", "CLICK!", "PSSSS...", "SYSTEM QUIET"][index], "#57a56d");
        this.setStatus(this.finalStage >= 4 ? "FINAL CRISIS SOLVED" : `FINAL EXAM ${this.finalStage}/4 · NEXT: ${stations[this.finalStage].label}`);
        if (this.finalStage >= 4) this.completeTask();
      });
    });
    this.setStatus("JUJU: SERIOUSLY? · FINAL EXAM 0/4 · START AT DODGE LANE");
  }

  private action() {
    if (this.retryOverlay) {
      this.scene.restart(this.taskData);
      return;
    }
    if (controls.locked || this.completed || this.time.now - this.lastAction < 180) return;
    this.lastAction = this.time.now;
    if (this.taskData.taskId === "paperclip_boss") {
      this.throwPaperclip();
      return;
    }
    this.current?.trigger();
  }

  private throwPaperclip() {
    if (!this.rival) return;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.rival.x, this.rival.y);
    const clip = this.add.text(this.player.x, this.player.y - 16, "⊂", { fontFamily: "monospace", fontSize: "15px", color: "#2f6fd0", stroke: "#fff", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(600);
    this.hazards.push({ view: clip, vx: Math.cos(angle) * 260, vy: Math.sin(angle) * 260, hostile: false, radius: 8 });
    incrementAdnocStat("paperclips_thrown");
    this.effectText(this.player.x, this.player.y - 32, "PING!", "#2f6fd0");
  }

  private spawnHostilePaper() {
    if (this.taskData.taskId === "printer_boss") {
      const x = Phaser.Math.Between(320, 400);
      const paper = this.add.rectangle(x, 155, 19, 27, 0xffffff, 1).setStrokeStyle(2, 0x59616d).setDepth(500).setAngle(Phaser.Math.Between(-30, 30));
      const angle = Phaser.Math.Angle.Between(x, 155, this.player.x, this.player.y);
      this.hazards.push({ view: paper, vx: Math.cos(angle) * 125, vy: Math.sin(angle) * 125, hostile: true, radius: 13 });
      this.nextHazardAt = this.time.now + 780;
      return;
    }
    if (!this.rival) return;
    const binder = this.rivalEgo <= 3 && (this.rivalEgo + this.hazards.length) % 3 === 0;
    const view = binder
      ? this.add.rectangle(this.rival.x, this.rival.y + 18, 30, 20, 0x9d315d, 1).setStrokeStyle(2, 0xffffff).setDepth(500)
      : this.add.text(this.rival.x, this.rival.y + 18, "⊃", { fontFamily: "monospace", fontSize: "15px", color: "#9d315d", stroke: "#fff", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(500);
    const angle = Phaser.Math.Angle.Between(this.rival.x, this.rival.y, this.player.x, this.player.y);
    this.hazards.push({ view, vx: Math.cos(angle) * (binder ? 145 : 180), vy: Math.sin(angle) * (binder ? 145 : 180), hostile: true, radius: binder ? 18 : 9 });
    this.nextHazardAt = this.time.now + (binder ? 1400 : 950);
  }

  private updateHazards(delta: number) {
    if ((this.taskData.taskId === "printer_boss" || this.taskData.taskId === "paperclip_boss") && this.time.now >= this.nextHazardAt && !this.completed) this.spawnHostilePaper();
    if (this.rival) {
      this.rival.x = 360 + Math.sin(this.time.now * 0.0015) * 170;
      this.rival.setDepth(this.rival.y);
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hazard = this.hazards[i];
      hazard.view.x += hazard.vx * delta / 1000;
      hazard.view.y += hazard.vy * delta / 1000;
      hazard.view.angle += delta * 0.25;
      const out = hazard.view.x < 0 || hazard.view.x > 720 || hazard.view.y < 20 || hazard.view.y > 480;
      if (!hazard.hostile && this.rival && Phaser.Math.Distance.Between(hazard.view.x, hazard.view.y, this.rival.x, this.rival.y) < 28) {
        hazard.view.destroy();
        this.hazards.splice(i, 1);
        this.rivalEgo -= 1;
        this.effectText(this.rival.x, this.rival.y - 35, ["PING!", "BONK!", "CLIP!"][this.rivalEgo % 3], "#f4c95d");
        this.setStatus(`JUJU'S PATIENCE ${"♥".repeat(this.patience)}${"·".repeat(4 - this.patience)} · RIVAL'S EGO ${"█".repeat(this.rivalEgo)}${"░".repeat(6 - this.rivalEgo)}`);
        if (this.rivalEgo <= 0) {
          this.tweens.add({ targets: this.rival, angle: 720, x: 610, duration: 750, ease: "Cubic.in", onComplete: () => this.completeTask() });
        }
        continue;
      }
      if (hazard.hostile && this.time.now >= this.invulnerableUntil && Phaser.Math.Distance.Between(hazard.view.x, hazard.view.y, this.player.x, this.player.y - 8) < hazard.radius + 9) {
        hazard.view.destroy();
        this.hazards.splice(i, 1);
        this.invulnerableUntil = this.time.now + 850;
        this.mistakes += 1;
        this.cameras.main.shake(70, this.scale.gameSize.width < 600 ? 0.002 : 0.004);
        if (this.taskData.taskId === "paperclip_boss") {
          this.patience -= 1;
          this.effectText(this.player.x, this.player.y - 30, "PATIENCE -1", "#e46d94");
          if (this.patience <= 0) this.showRetry("JUJU'S PATIENCE HAS REACHED CRITICAL LEVELS");
        } else this.effectText(this.player.x, this.player.y - 30, "PAPER CUT DAMAGE: EMOTIONAL", "#e46d94");
        continue;
      }
      if (out) {
        hazard.view.destroy();
        this.hazards.splice(i, 1);
      }
    }
  }

  private updateMeetingVision() {
    if (!this.cone || this.completed) return;
    const x = 360;
    const y = 205;
    const facing = Math.PI / 2 + Math.sin(this.time.now * 0.0012) * 1.1;
    const half = 0.52;
    const range = 235;
    this.cone.clear().fillStyle(0xf4c95d, 0.22).fillTriangle(x, y, x + Math.cos(facing - half) * range, y + Math.sin(facing - half) * range, x + Math.cos(facing + half) * range, y + Math.sin(facing + half) * range);
    const distance = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    if (distance < range && Math.abs(Phaser.Math.Angle.Wrap(angle - facing)) < half && this.time.now >= this.invulnerableUntil) {
      this.mistakes += 1;
      this.invulnerableUntil = this.time.now + 1100;
      this.player.setPosition(360, 408);
      this.effectText(360, 380, "ANOTHER SLIDE!", "#e46d94");
    }
  }

  private updateSteam() {
    if (this.taskData.taskId !== "steam_corridor" || this.completed) return;
    for (const object of this.objects) {
      if (!(object instanceof Phaser.GameObjects.Graphics) || object.getData("phase") === undefined) continue;
      const active = Math.sin((this.time.now + Number(object.getData("phase"))) * 0.004) > 0.35;
      object.setAlpha(active ? 0.8 : 0.12);
      const y = object.y;
      const inJet = object.getData("right") ? this.player.x >= 350 : this.player.x <= 370;
      if (active && inJet && Math.abs(this.player.y - y) < 16 && this.time.now >= this.invulnerableUntil) {
        this.invulnerableUntil = this.time.now + 850;
        this.mistakes += 1;
        this.player.y = Math.min(420, this.player.y + 45);
        this.effectText(this.player.x, this.player.y - 25, "PSHHH!", "#e46d94");
      }
    }
  }

  private effectText(x: number, y: number, text: string, color: string) {
    const fx = this.add.text(x, y, text, { fontFamily: "monospace", fontSize: "11px", color, align: "center", stroke: "#fff", strokeThickness: 3, resolution: 2 }).setOrigin(0.5).setDepth(900);
    this.tweens.add({ targets: fx, y: y - 28, alpha: 0, scale: 1.25, duration: 750, onComplete: () => fx.destroy() });
  }

  private completeTask(forcedStars?: number) {
    if (this.completed) return;
    this.completed = true;
    controls.locked = true;
    this.player.move(0, 0);
    const stars = forcedStars ?? (this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1);
    let promotion: AdnocRank | undefined;
    if (this.taskData.workday) {
      recordWorkTask(this.taskData.taskId as AdnocWorkTaskId, stars);
    } else if (this.taskData.storyTarget) {
      quests.onMinigame(this.taskData.storyTarget);
      incrementAdnocStat(`story_${this.taskData.storyTarget}`);
      if (this.taskData.storyTarget === "adnoc_pressure_console") {
        awardStoryXpOnce("adnoc_pressure_story_xp", 30);
        setAdnocRank("senior_engineer");
        promotion = "senior_engineer";
      } else if (this.taskData.storyTarget === "adnoc_team_lead_tasks") {
        awardStoryXpOnce("adnoc_teamlead_story_xp", 35);
        setAdnocRank("engineering_manager");
        promotion = "engineering_manager";
      } else if (this.taskData.storyTarget === "adnoc_console_race") {
        awardStoryXpOnce("adnoc_control_story_xp", 40);
        setAdnocRank("director");
        store.unlockOutfit("executive_blue");
        promotion = "director";
      }
    }
    const center = this.cameras.main.getWorldPoint(this.scale.gameSize.width / 2, this.scale.gameSize.height / 2);
    const hudScale = 1 / this.cameras.main.zoom;
    const shade = this.add.rectangle(center.x, center.y, 310, 132, 0x173e63, 0.96).setStrokeStyle(5, 0xf4c95d).setScale(0.35 * hudScale).setDepth(1200);
    const title = this.add.text(center.x, center.y - 28, this.taskData.taskId === "meeting_escape" ? "MEETING SURVIVED" : "TASK COMPLETE", { fontFamily: "monospace", fontSize: "22px", color: "#f4c95d", fontStyle: "bold", resolution: 2 }).setOrigin(0.5).setDepth(1201);
    const rating = this.add.text(center.x, center.y + 19, `${"★".repeat(stars)}${"☆".repeat(3 - stars)}\n${this.mistakes ? `${this.mistakes} tiny mistake${this.mistakes === 1 ? "" : "s"}` : "PERFECT"}`, { fontFamily: "monospace", fontSize: "13px", color: "#fff4e6", align: "center", resolution: 2 }).setOrigin(0.5).setDepth(1201);
    title.setScale(0.35 * hudScale);
    rating.setScale(0.35 * hudScale);
    this.tweens.add({ targets: [shade, title, rating], scale: hudScale, duration: 380, ease: "Back.out" });
    this.time.delayedCall(1250, () => {
      if (!this.sys.isActive()) return;
      this.scene.start(SceneKeys.AdnocHQ, { floor: this.taskData.returnFloor, promotion, workTaskDone: !!this.taskData.workday });
    });
  }

  private showRetry(message: string) {
    if (this.retryOverlay || this.completed) return;
    controls.locked = true;
    this.player.move(0, 0);
    const center = this.cameras.main.getWorldPoint(this.scale.gameSize.width / 2, this.scale.gameSize.height / 2);
    const panel = this.add.rectangle(0, 0, 330, 170, 0xfff4e6, 1).setStrokeStyle(5, 0xe46d94);
    const title = this.add.text(0, -46, message, { fontFamily: "monospace", fontSize: "14px", color: "#9d315d", align: "center", wordWrap: { width: 285 }, fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const retry = this.add.rectangle(0, 39, 255, 52, 0xe46d94, 1).setStrokeStyle(3, 0x9d315d).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 39, "RETRY THIS ENCOUNTER", { fontFamily: "monospace", fontSize: "13px", color: "#fff", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    retry.on("pointerup", () => this.scene.restart(this.taskData));
    this.retryOverlay = this.add.container(center.x, center.y, [panel, title, retry, label]).setScale(1 / this.cameras.main.zoom).setDepth(1400);
    this.setStatus("RETRY AVAILABLE · TAP BUTTON OR A", "#ff8fae");
  }

  private updateTimer() {
    if (!this.timerEndsAt || this.completed || this.retryOverlay) return;
    const remaining = this.timerEndsAt - this.time.now;
    const second = Math.max(0, Math.ceil(remaining / 1000));
    const label = `${second}`;
    if (label !== this.timerLabel) {
      this.timerLabel = label;
      this.setStatus(this.statusText, second <= 7 ? "#ff8fae" : "#fff4e6");
    }
    if (remaining <= 0) this.showRetry(this.taskData.taskId === "printer_boss" ? "THE PRINTER WINS THIS ROUND" : "ENGINEERING HAS BECOME SLIGHTLY MORE EXCITING");
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
    const speed = this.taskData.taskId === "coffee_run" && this.held > 0 ? 104 : this.player.speed;
    this.player.move(x * speed, y * speed);
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) this.action();
    this.player.x = Phaser.Math.Clamp(this.player.x, 32, 688);
    this.player.y = Phaser.Math.Clamp(this.player.y, 88, 448);
    if (this.taskData.taskId === "coffee_run" && this.held > 0 && length > 0.8 && Math.sin(this.time.now * 0.012) > 0.985) {
      this.mistakes = Math.min(4, this.mistakes + 1);
      this.effectText(this.player.x, this.player.y - 28, "WOBBLE!", "#f4c95d");
    }
  }

  private refreshCurrent() {
    let closest: TaskInteractable | undefined;
    let distance = Infinity;
    for (const item of this.interactables) {
      if (!item.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (d <= item.radius && d < distance) { closest = item; distance = d; }
    }
    if (closest === this.current) return;
    this.current = closest;
    uiEvents.emit("prompt", closest?.prompt ?? (this.taskData.taskId === "paperclip_boss" ? "Throw paperclip" : null));
  }

  private shutdown() {
    uiEvents.off("action", this.action, this);
    uiEvents.off("openMap", this.blockMap, this);
    uiEvents.emit("prompt", null);
    uiEvents.emit("dedicatedStatus", null);
    controls.locked = false;
    controls.moveX = 0;
    controls.moveY = 0;
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    this.movePlayer();
    this.refreshCurrent();
    this.updateTimer();
    this.updateHazards(delta);
    this.updateMeetingVision();
    this.updateSteam();
    if (this.taskData.taskId === "control_lights" && this.sequenceVisibleUntil && this.time.now >= this.sequenceVisibleUntil && this.sequenceIndex === 0 && !this.completed) {
      this.sequenceVisibleUntil = 0;
      this.setStatus("SEQUENCE HIDDEN · RUN BETWEEN THE CONSOLES");
    }
  }
}
