import Phaser from "phaser";
import { controls, uiEvents } from "../systems/controls";

const FONT = "monospace";

export type MiniKind = "stairs" | "salon" | "coffee" | "bouquet" | "photo" | "showdown" | "shopping" | "safe" | "lab" | "pitch" | "lockpick" | "badge_photo";

export interface MiniSpec {
  kind: MiniKind;
  title: string;
  hint: string;
  taps?: number;
  difficulty?: number;
  skipLabel?: string;
  photoLabel?: string;
  photoTex?: string;
  photoBuddy?: string;
  onDone: (ok: boolean) => void;
}

export function openActivity(scene: Phaser.Scene, spec: MiniSpec): Phaser.GameObjects.Container {
  if (spec.kind === "salon") return salonGame(scene, spec);
  if (spec.kind === "coffee") return coffeeGame(scene, spec);
  if (spec.kind === "bouquet") return bouquetGame(scene, spec);
  if (spec.kind === "photo") return photoGame(scene, spec);
  if (spec.kind === "showdown") return showdownGame(scene, spec);
  if (spec.kind === "stairs") return stairsGame(scene, spec);
  if (spec.kind === "shopping") return shoppingGame(scene, spec);
  if (spec.kind === "lockpick") return lockpickGame(scene, spec);
  if (spec.kind === "safe") return safeGame(scene, spec);
  if (spec.kind === "badge_photo") return badgePhotoGame(scene, spec);
  return tapGame(scene, spec);
}

function badgePhotoGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, width } = panel(scene, Math.min(scene.scale.gameSize.width - 28, 370), 370);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 34));
  const poses = [
    { face: ":)", label: "REASONABLE SMILE", good: true },
    { face: ":|", label: "SERIOUS ENGINEER", good: true },
    { face: ":O", label: "BADGE PANIC", good: false },
    { face: ":?", label: "SUSPICIOUS OF CAMERA", good: false },
    { face: "-_-", label: "FIRST-DAY NAP", good: false },
  ];
  let pose = 0;
  let finished = false;
  const frame = scene.add.graphics();
  frame.fillStyle(0x2f6fd0, 1).fillRoundedRect(width / 2 - 92, py + 84, 184, 154, 10);
  frame.fillStyle(0xdff3ff, 1).fillRoundedRect(width / 2 - 78, py + 98, 156, 112, 6);
  frame.fillStyle(0xfff4e6, 1).fillRect(width / 2 - 70, py + 216, 140, 14);
  const face = scene.add.text(width / 2, py + 151, poses[0].face, { fontFamily: FONT, fontSize: "45px", color: "#3a2b3a", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
  const label = scene.add.text(width / 2, py + 252, poses[0].label, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", align: "center", resolution: 2 }).setOrigin(0.5);
  const result = scene.add.text(width / 2, py + 281, "Wait for something vaguely professional.", { fontFamily: FONT, fontSize: "10px", color: "#8a6b58", align: "center", resolution: 2 }).setOrigin(0.5);
  items.push(frame, face, label, result);
  const cycle = scene.time.addEvent({ delay: 520, loop: true, callback: () => {
    if (finished) return;
    pose = (pose + 1) % poses.length;
    face.setText(poses[pose].face).setScale(0.78);
    label.setText(poses[pose].label);
    scene.tweens.add({ targets: face, scale: 1, duration: 120, ease: "Back.out" });
  } });
  const snap = () => {
    if (finished) return;
    finished = true;
    cycle.remove();
    const good = poses[pose].good;
    result.setColor(good ? "#57a56d" : "#e46d94").setText(good ? "CLICK! A surprisingly usable photograph." : "CLICK! Officially ridiculous. Approved anyway.");
    const flash = scene.add.rectangle(width / 2, py + 155, 170, 130, 0xffffff, 0.9);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 260 });
    scene.time.delayedCall(700, () => spec.onDone(good));
  };
  items.push(btn(scene, width / 2, py + 328, "TAKE BADGE PHOTO", "#2f6fd0", snap));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  container.once(Phaser.GameObjects.Events.DESTROY, () => cycle.remove());
  bindAction(scene, container, snap);
  return container;
}

function bindAction(scene: Phaser.Scene, container: Phaser.GameObjects.Container, action: () => void) {
  const keyHandler = (event: KeyboardEvent) => {
    if (event.code === "Space" || event.code === "KeyE" || event.code === "KeyA") action();
  };
  scene.input.keyboard?.on("keydown", keyHandler);
  uiEvents.on("minigameAction", action);
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.keyboard?.off("keydown", keyHandler);
    uiEvents.off("minigameAction", action);
  });
}

function stairsGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, width } = panel(scene, Math.min(scene.scale.gameSize.width - 32, 360), 366);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 32));
  const need = Math.max(6, Math.round((spec.taps ?? 20) / 2));
  let progress = 0;
  let seconds = 18;
  let finished = false;
  let phase = 0;
  let marker = 0;
  let assist = false;
  const stairs = scene.add.graphics();
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const sx = px + 42 + i * 28;
    const sy = py + 230 - i * 17;
    stairs.fillStyle(i % 2 ? 0xb87558 : 0xd79f7a, 1).fillRect(sx, sy, 30, 17);
    stairs.lineStyle(1, 0x7a5238, 1).strokeRect(sx, sy, 30, 17);
  }
  stairs.fillStyle(0x8a5c3b, 1).fillRect(px + w - 66, py + 92, 42, 28);
  stairs.fillStyle(0xffe08a, 1).fillRect(px + w - 50, py + 104, 8, 16);
  items.push(stairs);
  const her = scene.add.sprite(px + 54, py + 230, "char_her", 0).setScale(1.7).setOrigin(0.5, 1);
  const timer = scene.add.text(width / 2, py + 76, "", { fontFamily: FONT, fontSize: "16px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  const status = scene.add.text(width / 2, py + 272, "", { fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  const puff = scene.add.text(width / 2, py + 292, "", { fontFamily: FONT, fontSize: "11px", color: "#a06d5b", resolution: 2 }).setOrigin(0.5);
  const bar = scene.add.graphics();
  items.push(her, timer, status, puff, bar);
  const draw = () => {
    const ratio = progress / need;
    her.setPosition(px + 54 + ratio * (w - 110), py + 230 - ratio * 112);
    her.play(`char_her-${progress % 2 ? "walk-up" : "idle-up"}`, true);
    timer.setText(`RACE ${seconds.toFixed(1)}s`);
    status.setText(`${progress} / ${need} LANDINGS`);
    bar.clear();
    const trackX = px + 26;
    const trackW = w - 52;
    const zoneW = assist ? 84 : 58;
    bar.fillStyle(0x3a2b3a, 1).fillRoundedRect(trackX, py + 310, trackW, 14, 6);
    bar.fillStyle(0x7be0a3, 1).fillRoundedRect(trackX + trackW / 2 - zoneW / 2, py + 312, zoneW, 10, 5);
    bar.fillStyle(0xffffff, 1).fillRect(trackX + marker * trackW - 3, py + 304, 6, 26);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    tick.remove();
    puff.setColor("#57a56d").setText("TOP FLOOR! Tiny victory dance.");
    scene.tweens.add({ targets: her, y: her.y - 8, duration: 110, yoyo: true, repeat: 2 });
    scene.time.delayedCall(450, () => spec.onDone(true));
  };
  const action = () => {
    if (finished) return;
    const half = (assist ? 84 : 58) / (w - 52) / 2;
    if (Math.abs(marker - 0.5) <= half) {
      progress += 1;
      phase += 0.35;
      puff.setColor("#57a56d").setText(progress > need - 3 ? "TOP FLOOR ENERGY" : progress % 3 === 0 ? "the girls: WAIT FOR US" : "perfect landing!");
      scene.cameras.main.shake(35, 0.0015);
    } else {
      puff.setColor("#e46d94").setText("missed the landing — no fall, try the next glow");
    }
    draw();
    if (progress >= need) finish();
  };
  const button = btn(scene, width / 2, py + 344, "STEP IN THE LIGHT", "#2f6fd0", action);
  items.push(button);
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  const tick = scene.time.addEvent({ delay: 50, loop: true, callback: () => {
    if (finished) return;
    seconds = Math.max(0, seconds - 0.05);
    phase += assist ? 0.035 : 0.052;
    marker = (Math.sin(phase) + 1) / 2;
    if (seconds <= 0 && !assist) {
      assist = true;
      seconds = 10;
      puff.setColor("#a06d5b").setText("Rhiannon holds the door. The timing zone gets kinder.");
    } else if (seconds <= 0 && assist) finish();
    draw();
  } });
  container.once(Phaser.GameObjects.Events.DESTROY, () => tick.remove());
  bindAction(scene, container, action);
  draw();
  return container;
}

function shoppingGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, width } = panel(scene, Math.min(scene.scale.gameSize.width - 28, 370), 370);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 32));
  const products = ["DRESS", "CUTE TOP", "JACKET", "SHOES", "HANDBAG", "NECKLACE", "BANGLE", "EARRINGS"];
  let taps = 0;
  let seconds = 25;
  let finished = false;
  const target = products.length;
  const timer = scene.add.text(width / 2, py + 74, "", { fontFamily: FONT, fontSize: "16px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  const status = scene.add.text(width / 2, py + 100, "", { fontFamily: FONT, fontSize: "14px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  const bags = scene.add.graphics();
  const burst = scene.add.text(width / 2, py + 252, "", { fontFamily: FONT, fontSize: "12px", color: "#e46d94", resolution: 2 }).setOrigin(0.5);
  const bar = scene.add.graphics();
  items.push(timer, status, bags, burst, bar);
  const count = () => Math.min(target, Math.floor(taps / 3));
  const draw = () => {
    const itemsBought = count();
    timer.setText(`TIME ${seconds.toFixed(1)}`);
    status.setText(`ITEMS: ${itemsBought} / ${target}`);
    bags.clear();
    for (let i = 0; i < itemsBought; i++) {
      const x = px + 48 + (i % 4) * 70;
      const y = py + 210 - Math.floor(i / 4) * 26;
      bags.fillStyle(i % 2 ? 0xf4c95d : 0xe46d94, 1).fillRect(x, y, 22, 20);
      bags.fillStyle(0x8a5c3b, 1).fillRect(x + 6, y - 5, 10, 5);
    }
    bar.clear();
    bar.fillStyle(0xe8dcc8, 1).fillRoundedRect(px + 28, py + 280, w - 56, 12, 5);
    bar.fillStyle(0xe46d94, 1).fillRoundedRect(px + 28, py + 280, Math.max(3, (w - 56) * itemsBought / target), 12, 5);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    tick.remove();
    burst.setColor("#57a56d").setText("BAGS SECURED!");
    scene.time.delayedCall(500, () => spec.onDone(true));
  };
  const action = () => {
    if (finished) return;
    taps += 1;
    const itemsBought = count();
    if (taps % 3 === 0) burst.setText(`+ ${products[itemsBought - 1]}`);
    else if (taps % 7 === 0) burst.setText("BABA'S CARD: OH NO");
    draw();
    if (itemsBought >= target) finish();
  };
  items.push(btn(scene, width / 2, py + 326, "GRAB IT!", "#2f6fd0", action));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  const tick = scene.time.addEvent({ delay: 100, loop: true, callback: () => {
    if (finished) return;
    seconds = Math.max(0, seconds - 0.1);
    if (seconds <= 0) {
      taps = 0;
      seconds = 25;
      burst.setText("Not enough shopping. Impossible. Retry!");
    }
    draw();
  } });
  container.once(Phaser.GameObjects.Events.DESTROY, () => tick.remove());
  bindAction(scene, container, action);
  draw();
  return container;
}

function lockpickGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, width } = panel(scene, Math.min(scene.scale.gameSize.width - 28, 370), 350);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 34));
  const total = Phaser.Math.Clamp(spec.taps ?? 3, 3, 5);
  const difficulty = Phaser.Math.Clamp(spec.difficulty ?? 1, 1, 3);
  const trackX = px + 34;
  const trackW = w - 68;
  const trackY = py + 180;
  let pin = 0;
  let phase = 0;
  let marker = 0;
  let finished = false;
  const targetPattern = [0.24, 0.67, 0.42, 0.78, 0.31];
  const gauge = scene.add.graphics();
  const lock = scene.add.graphics();
  const status = scene.add.text(width / 2, py + 238, "Pin 1 is pretending not to be nervous.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", align: "center", resolution: 2 }).setOrigin(0.5);
  const pinText = scene.add.text(width / 2, py + 104, "", { fontFamily: FONT, fontSize: "13px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
  items.push(lock, gauge, status, pinText);

  const draw = () => {
    const target = targetPattern[pin];
    const zoneW = Math.max(24, 46 - difficulty * 6 - pin * 2);
    lock.clear();
    lock.fillStyle(0xf4c95d, 1).fillRoundedRect(width / 2 - 30, py + 76, 60, 52, 8);
    lock.lineStyle(5, 0x8a6b38, 1).strokeCircle(width / 2, py + 78, 19);
    for (let i = 0; i < total; i++) {
      lock.fillStyle(i < pin ? 0x57a56d : i === pin ? 0xfff4e6 : 0x8a6b38, 1).fillCircle(width / 2 - (total - 1) * 9 + i * 18, py + 111, 5);
    }
    gauge.clear();
    gauge.fillStyle(0x3a2b3a, 1).fillRoundedRect(trackX, trackY, trackW, 18, 8);
    gauge.fillStyle(0x7be0a3, 1).fillRoundedRect(trackX + target * trackW - zoneW / 2, trackY + 2, zoneW, 14, 6);
    gauge.fillStyle(0xffffff, 1).fillRect(trackX + marker * trackW - 3, trackY - 5, 6, 28);
    pinText.setText(`CARTOON PIN ${Math.min(pin + 1, total)} / ${total}`);
  };
  const action = () => {
    if (finished) return;
    const zone = Math.max(24, 46 - difficulty * 6 - pin * 2) / trackW / 2;
    if (Math.abs(marker - targetPattern[pin]) <= zone) {
      pin += 1;
      phase = 0;
      status.setColor("#57a56d").setText(pin >= total ? "CLICK... unlocked!" : "CLICK! Next pin is faster.");
      scene.cameras.main.shake(45, 0.002);
      if (pin >= total) {
        finished = true;
        draw();
        scene.time.delayedCall(440, () => spec.onDone(true));
        return;
      }
    } else {
      phase = 0;
      status.setColor("#e46d94").setText("CLUNK. The lock remains deeply unimpressed.");
    }
    draw();
  };
  const update = (_time: number, delta: number) => {
    if (finished) return;
    phase += delta * (0.00115 + pin * 0.00018 + difficulty * 0.00012);
    marker = (Math.sin(phase * Math.PI * 2) + 1) / 2;
    draw();
  };
  items.push(btn(scene, width / 2, py + 298, "HIT THE GREEN ZONE", "#2f6fd0", action));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  container.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
  bindAction(scene, container, action);
  draw();
  return container;
}

function safeGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, width } = panel(scene, Math.min(scene.scale.gameSize.width - 24, 382), 390);
  items.push(...titleHint(scene, spec, width / 2, py + 12, w - 30));
  const dialX = width / 2;
  const dialY = py + 158;
  const trackX = px + 34;
  const trackW = w - 68;
  const trackY = py + 232;
  const targets = [0.22, 0.7, 0.39, 0.82];
  let stage: "dial" | "pins" = "dial";
  let phase = 0;
  let marker = 0;
  let pin = 0;
  let finished = false;
  const graphic = scene.add.graphics();
  const status = scene.add.text(width / 2, py + 286, "Find the glowing cartoon dial zone.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", align: "center", resolution: 2 }).setOrigin(0.5);
  const tension = scene.add.text(width / 2, py + 86, "FADWA COULD COME BACK ANY SECOND", { fontFamily: FONT, fontSize: "10px", color: "#d84652", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
  items.push(graphic, status, tension);
  const tensionTween = scene.tweens.add({ targets: tension, alpha: 0.35, duration: 520, yoyo: true, repeat: -1 });

  const draw = () => {
    graphic.clear();
    graphic.fillStyle(0x59616d, 1).fillRoundedRect(width / 2 - 88, py + 108, 176, 160, 10);
    graphic.lineStyle(4, 0x2b2233, 1).strokeRoundedRect(width / 2 - 88, py + 108, 176, 160, 10);
    if (stage === "dial") {
      graphic.lineStyle(10, 0x3a2b3a, 1).strokeCircle(dialX, dialY, 38);
      graphic.lineStyle(9, 0x7be0a3, 1).beginPath().arc(dialX, dialY, 38, -0.25, 0.28).strokePath();
      const angle = marker * Math.PI * 2 - Math.PI / 2;
      graphic.lineStyle(4, 0xffffff, 1).lineBetween(dialX, dialY, dialX + Math.cos(angle) * 31, dialY + Math.sin(angle) * 31);
      graphic.fillStyle(0xf4c95d, 1).fillCircle(dialX, dialY, 7);
    } else {
      const target = targets[pin];
      const zoneW = Math.max(20, 34 - pin * 2);
      graphic.fillStyle(0x2b2233, 1).fillRoundedRect(trackX, trackY, trackW, 18, 7);
      graphic.fillStyle(0x7be0a3, 1).fillRoundedRect(trackX + target * trackW - zoneW / 2, trackY + 2, zoneW, 14, 5);
      graphic.fillStyle(0xffffff, 1).fillRect(trackX + marker * trackW - 3, trackY - 5, 6, 28);
      for (let i = 0; i < targets.length; i++) graphic.fillStyle(i < pin ? 0x57a56d : 0x8a6b38, 1).fillCircle(width / 2 - 30 + i * 20, py + 190, 5);
    }
  };
  const action = () => {
    if (finished) return;
    if (stage === "dial") {
      if (Math.abs(marker - 0.25) < 0.085) {
        stage = "pins";
        phase = 0;
        status.setColor("#57a56d").setText("BZZT! Fictional dial accepted. Now hit four pins.");
      } else status.setColor("#e46d94").setText("The dial says: not even slightly.");
    } else {
      const half = Math.max(20, 34 - pin * 2) / trackW / 2;
      if (Math.abs(marker - targets[pin]) <= half) {
        pin += 1;
        phase = 0;
        status.setColor("#57a56d").setText(pin >= targets.length ? "CLICK" : `CLICK! ${pin} / ${targets.length}`);
        if (pin >= targets.length) {
          finished = true;
          scene.cameras.main.flash(240, 255, 224, 138, false);
          scene.time.delayedCall(500, () => spec.onDone(true));
          return;
        }
      } else {
        phase = 0;
        status.setColor("#e46d94").setText("CLUNK. Grandma's safe judges your timing.");
      }
    }
    draw();
  };
  const update = (_time: number, delta: number) => {
    if (finished) return;
    phase += delta * (stage === "dial" ? 0.00055 : 0.00135 + pin * 0.00017);
    marker = stage === "dial" ? phase % 1 : (Math.sin(phase * Math.PI * 2) + 1) / 2;
    draw();
  };
  items.push(btn(scene, width / 2, py + 342, "STOP / CLICK", "#e46d94", action));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    tensionTween.stop();
  });
  bindAction(scene, container, action);
  draw();
  return container;
}

function panel(scene: Phaser.Scene, w: number, h: number) {
  const { width, height } = scene.scale.gameSize;
  const px = (width - w) / 2;
  const py = (height - h) / 2;
  const items: Phaser.GameObjects.GameObject[] = [];
  const catcher = scene.add.rectangle(width / 2, height / 2, width, height, 0x2b2233, 0.55).setInteractive();
  const g = scene.add.graphics();
  g.fillStyle(0xfff9f0, 1).fillRoundedRect(px, py, w, h, 14);
  g.lineStyle(3, 0xcaa27a).strokeRoundedRect(px, py, w, h, 14);
  items.push(catcher, g);
  return { items, px, py, w, h, width, height };
}

function titleHint(scene: Phaser.Scene, spec: MiniSpec, cx: number, y: number, wrap: number) {
  const t = scene.add
    .text(cx, y, spec.title, { fontFamily: FONT, fontSize: "18px", color: "#e46d94", fontStyle: "bold", resolution: 2 })
    .setOrigin(0.5, 0);
  const h = scene.add
    .text(cx, y + 26, spec.hint, {
      fontFamily: FONT,
      fontSize: "12px",
      color: "#3a2b3a",
      align: "center",
      wordWrap: { width: wrap },
      resolution: 2,
    })
    .setOrigin(0.5, 0);
  return [t, h];
}

function btn(scene: Phaser.Scene, x: number, y: number, label: string, bg: string, on: () => void) {
  const t = scene.add
    .text(x, y, label, {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#fff",
      backgroundColor: bg,
      padding: { x: 12, y: 6 },
      resolution: 2,
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  t.on("pointerdown", on);
  return t;
}

function tapGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 40, 340), spec.kind === "salon" ? 320 : 280);
  items.push(...titleHint(scene, spec, width / 2, py + 16, w - 36));
  const need = spec.taps ?? 10;
  let progress = 0;
  let mode = spec.kind === "salon" ? "" : "go";
  const barG = scene.add.graphics();
  items.push(barG);
  const status = scene.add.text(width / 2, py + (spec.kind === "salon" ? 168 : 130), "", { fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  items.push(status);
  const draw = () => {
    barG.clear();
    const bw = w - 48;
    const bx = px + 24;
    const by = py + (spec.kind === "salon" ? 148 : 110);
    barG.fillStyle(0xe8dcc8, 1).fillRoundedRect(bx, by, bw, 14, 6);
    barG.fillStyle(0xe46d94, 1).fillRoundedRect(bx, by, Math.max(4, (bw * progress) / need), 14, 6);
    status.setText(mode ? `${progress} / ${need}` : "Pick one to start");
  };
  draw();
  if (spec.kind === "salon") {
    items.push(btn(scene, width / 2 - 60, py + 108, "Nails", "#e46d94", () => { mode = "nails"; draw(); }));
    items.push(btn(scene, width / 2 + 60, py + 108, "Brows", "#7be0a3", () => { mode = "brows"; draw(); }));
  }
  items.push(
    btn(scene, width / 2, py + h - 78, spec.kind === "stairs" ? "Tap to climb" : "Tap", "#2f6fd0", () => {
      if (!mode) return;
      progress += 1;
      draw();
      if (progress >= need) spec.onDone(true);
    }),
  );
  items.push(btn(scene, width / 2, py + h - 28, spec.skipLabel ?? "Skip", "#8a7a6a", () => spec.onDone(true)));
  return scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
}

function showdownGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 36, 360), 330);
  items.push(...titleHint(scene, spec, width / 2, py + 16, w - 36));
  const need = spec.taps ?? 16;
  let juju = 0;
  let rival = 0;
  let ended = false;
  const bar = scene.add.graphics();
  const score = scene.add
    .text(width / 2, py + 182, "", { fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", align: "center", resolution: 2 })
    .setOrigin(0.5);
  items.push(bar, score);

  const draw = () => {
    const barW = w - 64;
    const x = px + 32;
    bar.clear();
    bar.fillStyle(0xe8dcc8, 1).fillRoundedRect(x, py + 118, barW, 16, 7);
    bar.fillStyle(0xf28ab2, 1).fillRoundedRect(x, py + 118, Math.max(4, (barW * juju) / need), 16, 7);
    bar.fillStyle(0xe8dcc8, 1).fillRoundedRect(x, py + 152, barW, 16, 7);
    bar.fillStyle(0x2f6fd0, 1).fillRoundedRect(x, py + 152, Math.max(4, (barW * rival) / need), 16, 7);
    score.setText(`JUJU  ${juju}/${need}\nRIVAL  ${rival}/${need}`);
  };
  const finish = (jujuWon: boolean) => {
    if (ended) return;
    ended = true;
    rivalTimer.remove(false);
    spec.onDone(jujuWon);
  };
  const rivalTimer = scene.time.addEvent({
    delay: 220,
    loop: true,
    callback: () => {
      rival = Math.min(need, rival + Phaser.Math.Between(1, 2));
      draw();
      if (rival >= need) finish(false);
    },
  });
  draw();
  items.push(
    btn(scene, width / 2, py + h - 76, "Tap fast!", "#e46d94", () => {
      if (ended) return;
      juju = Math.min(need, juju + 1);
      draw();
      if (juju >= need) finish(true);
    }),
  );
  items.push(btn(scene, width / 2, py + h - 26, spec.skipLabel ?? "Leave it", "#8a7a6a", () => finish(false)));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  container.once("destroy", () => rivalTimer.remove(false));
  return container;
}

function coffeeGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 36, 380), 390);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 36));
  const stages = ["ESPRESSO", "MILK", "SUGAR 1", "SUGAR 2", "LID"];
  let cupNo = 1;
  let stage = 0;
  let phase = 0;
  let marker = 0;
  let quality = 0;
  let finished = false;
  const status = scene.add
    .text(width / 2, py + 78, "Cup 1 · time the espresso.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 })
    .setOrigin(0.5);
  items.push(status);
  const machine = scene.add.rectangle(width / 2, py + 118, 126, 42, 0x3a2b3a).setStrokeStyle(3, 0xcaa27a);
  const nozzle = scene.add.rectangle(width / 2, py + 150, 8, 22, 0x6f5b4c);
  const cups = [-42, 42].map((dx, i) => {
    const body = scene.add.rectangle(width / 2 + dx, py + 196, 56, 62, 0xf4e8d4).setStrokeStyle(3, 0x3a2b3a);
    const fill = scene.add.rectangle(width / 2 + dx, py + 216, 42, 0, 0x6b4327).setOrigin(0.5, 1);
    const label = scene.add.text(width / 2 + dx, py + 198, `${i + 1}`, { fontFamily: FONT, fontSize: "12px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    items.push(body, fill, label);
    return { body, fill, label };
  });
  const steam = scene.add.text(width / 2, py + 142, "~  ~", { fontFamily: FONT, fontSize: "12px", color: "#fff", resolution: 2 }).setOrigin(0.5).setAlpha(0);
  const gauge = scene.add.graphics();
  const ingredients = scene.add.text(width / 2, py + 258, "CUP 1   ·   CUP 2", { fontFamily: FONT, fontSize: "11px", color: "#8a6b58", resolution: 2 }).setOrigin(0.5);
  items.push(machine, nozzle, steam, gauge, ingredients);
  const draw = () => {
    const tx = px + 32;
    const tw = w - 64;
    gauge.clear();
    gauge.fillStyle(0x3a2b3a, 1).fillRoundedRect(tx, py + 286, tw, 17, 7);
    gauge.fillStyle(0x7be0a3, 1).fillRoundedRect(tx + tw / 2 - 34, py + 288, 68, 13, 6);
    gauge.fillStyle(0xffffff, 1).fillRect(tx + marker * tw - 3, py + 280, 6, 29);
  };
  const action = () => {
    if (finished) return;
    const good = Math.abs(marker - 0.5) < 0.13;
    if (good) quality += 1;
    const current = stages[stage];
    const currentCup = cups[cupNo - 1];
    status.setColor(good ? "#57a56d" : "#e46d94").setText(good ? `${current}: perfect timing.` : `${current}: a little splashy. Still delicious.`);
    if (current === "ESPRESSO") scene.tweens.add({ targets: currentCup.fill, displayHeight: 23, duration: 280 });
    if (current === "MILK") scene.tweens.add({ targets: currentCup.fill, displayHeight: 37, duration: 280 });
    if (current.startsWith("SUGAR")) {
      const sugar = scene.add.text(width / 2, py + 150, "✦", { fontFamily: FONT, fontSize: "13px", color: "#fff", resolution: 2 }).setOrigin(0.5);
      container.add(sugar);
      scene.tweens.add({ targets: sugar, x: currentCup.body.x, y: py + 195, alpha: 0, duration: 320, onComplete: () => sugar.destroy() });
    }
    if (current === "LID") {
      const lid = scene.add.ellipse(currentCup.body.x, py + 168, 52, 11, 0xe46d94).setScale(1.35);
      container.add(lid);
      scene.tweens.add({ targets: lid, scale: 1, duration: 260, ease: "Back.out" });
    }
    scene.tweens.add({ targets: steam, alpha: 0.9, y: py + 126, duration: 220, yoyo: true });
    stage += 1;
    phase += 0.7;
    if (stage >= stages.length) {
      if (cupNo === 1) {
        cupNo = 2;
        stage = 0;
        scene.time.delayedCall(430, () => status.setColor("#3a2b3a").setText("Cup 1 ready. Cup 2 · same exact order."));
      } else {
        finished = true;
        tick.remove();
        scene.time.delayedCall(520, () => {
          status.setColor("#57a56d").setText(quality >= 7 ? "Two perfect coffees. Two sugars each." : "Two charmingly handmade coffees. Order remembered.");
          scene.time.delayedCall(520, () => spec.onDone(true));
        });
      }
    } else scene.time.delayedCall(360, () => status.setColor("#3a2b3a").setText(`Cup ${cupNo} · next: ${stages[stage]}`));
  };
  items.push(btn(scene, width / 2, py + 333, "POUR IN THE GREEN ZONE", "#2f6fd0", action));
  items.push(btn(scene, width / 2, py + h - 26, spec.skipLabel ?? "Cancel", "#8a7a6a", () => spec.onDone(false)));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  const tick = scene.time.addEvent({ delay: 35, loop: true, callback: () => { if (!finished) { phase += 0.065; marker = (Math.sin(phase) + 1) / 2; draw(); } } });
  container.once(Phaser.GameObjects.Events.DESTROY, () => tick.remove());
  bindAction(scene, container, action);
  draw();
  return container;
}

function salonGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, px, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 34, 370), 370);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 34));
  let mode: "nails" | "brows" | undefined;
  let progress = 0;
  let phase = 0;
  let marker = 0;
  let finished = false;
  const status = scene.add.text(width / 2, py + 82, "Choose today's glow.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  const mirror = scene.add.ellipse(width / 2, py + 172, 102, 126, 0xdff3ff).setStrokeStyle(5, 0xf4c95d);
  const face = scene.add.text(width / 2, py + 172, "◡", { fontFamily: FONT, fontSize: "38px", color: "#3a2b3a", resolution: 2 }).setOrigin(0.5);
  const gauge = scene.add.graphics();
  items.push(status, mirror, face, gauge);
  const choose = (next: "nails" | "brows") => { mode = next; progress = 0; status.setText(`${next === "nails" ? "Nail" : "Brow"} timing · hit 5 green moments.`); };
  items.push(btn(scene, width / 2 - 72, py + 112, "NAILS", "#e46d94", () => choose("nails")));
  items.push(btn(scene, width / 2 + 72, py + 112, "BROWS", "#7e64a8", () => choose("brows")));
  const draw = () => {
    const tx = px + 30;
    const tw = w - 60;
    gauge.clear();
    gauge.fillStyle(0x3a2b3a, 1).fillRoundedRect(tx, py + 252, tw, 16, 7);
    gauge.fillStyle(mode === "brows" ? 0xa98bc7 : 0x7be0a3, 1).fillRoundedRect(tx + tw * 0.5 - 35, py + 254, 70, 12, 6);
    gauge.fillStyle(0xffffff, 1).fillRect(tx + marker * tw - 3, py + 246, 6, 28);
  };
  const action = () => {
    if (!mode || finished) { if (!mode) status.setText("Pick nails or brows first."); return; }
    if (Math.abs(marker - 0.5) < 0.14) {
      progress += 1;
      status.setColor("#57a56d").setText(`${mode === "nails" ? "Polish" : "Shape"} ${progress}/5 · sparkle!`);
      face.setText(progress % 2 ? "◠" : "◡");
      scene.cameras.main.shake(30, 0.001);
    } else status.setColor("#e46d94").setText("Tiny wobble. No problem—wait for the glow.");
    if (progress >= 5) {
      finished = true;
      tick.remove();
      scene.tweens.add({ targets: [mirror, face], scale: 1.12, duration: 220, yoyo: true, repeat: 1, ease: "Back.out" });
      status.setColor("#57a56d").setText(`${mode === "nails" ? "Nails" : "Brows"} reveal: flawless little glow.`);
      scene.time.delayedCall(720, () => spec.onDone(true));
    }
  };
  items.push(btn(scene, width / 2, py + 301, "STYLE IN THE GREEN ZONE", "#2f6fd0", action));
  items.push(btn(scene, width / 2, py + h - 23, spec.skipLabel ?? "Skip today", "#8a7a6a", () => spec.onDone(false)));
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  const tick = scene.time.addEvent({ delay: 35, loop: true, callback: () => { if (!finished) { phase += 0.07; marker = (Math.sin(phase) + 1) / 2; draw(); } } });
  container.once(Phaser.GameObjects.Events.DESTROY, () => tick.remove());
  bindAction(scene, container, action);
  draw();
  return container;
}

function bouquetGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 36, 360), 360);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 36));
  const flowers = ["pink", "yellow", "white", "rose", "lilac"];
  const picked: string[] = [];
  const ribbon = { color: "" };
  const status = scene.add
    .text(width / 2, py + 78, "Pick 3 flowers, then a ribbon.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 })
    .setOrigin(0.5);
  items.push(status);
  const preview = scene.add.container(width / 2, py + 168);
  items.push(preview);
  flowers.forEach((f, i) => {
    const x = width / 2 - 120 + (i % 5) * 60;
    const b = btn(scene, x, py + 130, f, "#f4a6c0", () => {
      if (picked.includes(f) || picked.length >= 3) return;
      picked.push(f);
      b.setAlpha(0.45);
      status.setText(`${picked.length}/3 · ${picked.join(", ")}`);
      const colors = [0xf4a6c0, 0xf4c95d, 0xfff9ef, 0xe46d94, 0xa98bc7];
      const bloom = scene.add.circle((picked.length - 2) * 20, -picked.length * 3, 12, colors[i]).setStrokeStyle(2, 0xffffff);
      preview.add(bloom);
      scene.tweens.add({ targets: bloom, scale: { from: 0.25, to: 1 }, angle: 18, duration: 240, ease: "Back.out" });
    });
    items.push(b);
  });
  ["blush", "gold", "cream"].forEach((r, i) => {
    items.push(
      btn(scene, width / 2 - 80 + i * 80, py + 200, r, "#f4c95d", () => {
        ribbon.color = r;
        status.setText(`Ribbon: ${r}. ${picked.length}/3 flowers.`);
      }),
    );
  });
  items.push(
    btn(scene, width / 2, py + 260, "Finish bouquet", "#7be0a3", () => {
      if (picked.length < 3 || !ribbon.color) {
        status.setText("Need 3 flowers and a ribbon.");
        return;
      }
      spec.onDone(true);
    }),
  );
  items.push(btn(scene, width / 2, py + h - 26, spec.skipLabel ?? "Cancel", "#8a7a6a", () => spec.onDone(false)));
  return scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
}

function photoGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 36, 360), 360);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 36));
  const vx = width / 2;
  const vy = py + 168;
  const vw = 176;
  const vh = 108;
  const g = scene.add.graphics();
  g.fillStyle(0x8ecae6, 1).fillRect(vx - vw / 2, vy - vh / 2, vw, vh);
  g.fillStyle(0x7bc86c, 1).fillRect(vx - vw / 2, vy + 8, vw, vh / 2 - 8);
  g.fillStyle(0x63c6e8, 1).fillRect(vx - vw / 2, vy + 22, vw, 18);
  items.push(g);

  const mark = spec.photoTex && scene.textures.exists(spec.photoTex) ? spec.photoTex : scene.textures.exists("o_fountain") ? "o_fountain" : "ui_heart";
  const landmark = scene.add.image(vx, vy - 6, mark);
  const src = scene.textures.get(mark).getSourceImage() as HTMLCanvasElement;
  const ls = Math.min(2.2, 52 / Math.max(src.width, 8));
  landmark.setScale(ls);
  items.push(landmark);

  const her = scene.textures.exists("char_her")
    ? scene.add.sprite(vx - 18, vy + 28, "char_her", 0).setScale(2)
    : scene.add.image(vx - 18, vy + 28, "ui_heart").setScale(2);
  const buddyKey = spec.photoBuddy && scene.textures.exists(spec.photoBuddy) ? spec.photoBuddy : scene.textures.exists("char_moomoo") ? "char_moomoo" : "ui_heart";
  const buddy = scene.textures.exists(buddyKey) && buddyKey.startsWith("char_")
    ? scene.add.sprite(vx + 18, vy + 28, buddyKey, 0).setScale(2)
    : scene.add.image(vx + 18, vy + 28, buddyKey).setScale(1.6);
  items.push(her, buddy);
  const bigBen = spec.title.toLowerCase().includes("ben") || spec.photoBuddy === "char_fadwa";
  const pigeon = bigBen ? scene.add.text(vx - 110, vy - 28, "<(' )", { fontFamily: FONT, fontSize: "15px", color: "#f4f4f4", stroke: "#3a2b3a", strokeThickness: 3, resolution: 2 }).setOrigin(0.5) : undefined;
  if (pigeon) items.push(pigeon);

  const frame = scene.add.rectangle(vx, vy, vw, vh, 0x000000, 0).setStrokeStyle(3, 0xe46d94);
  items.push(frame);
  const status = scene.add
    .text(width / 2, py + 236, spec.photoLabel ?? "Tap when you're both in the frame.", {
      fontFamily: FONT,
      fontSize: "12px",
      color: "#3a2b3a",
      resolution: 2,
    })
    .setOrigin(0.5);
  items.push(status);

  const pair = [her, buddy];
  const tw = scene.tweens.add({
    targets: pair,
    x: "+=28",
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: "Sine.inOut",
  });
  const birdTw = pigeon ? scene.tweens.add({ targets: pigeon, x: vx + 110, y: "+=18", duration: 1550, yoyo: true, repeat: -1, ease: "Sine.inOut" }) : undefined;
  let snapping = false;

  const snap = () => {
    if (snapping) return;
    snapping = true;
    tw.pause();
    birdTw?.pause();
    const mid = (her.x + buddy.x) / 2;
    const aligned = Math.abs(mid - vx) < 18;
    const photobombed = !!pigeon && Math.abs(pigeon.x - vx) < 48;
    const flash = scene.add.rectangle(width / 2, scene.scale.gameSize.height / 2, width, scene.scale.gameSize.height, 0xffffff, 0.85).setScrollFactor(0).setDepth(90);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });
    if (aligned && !photobombed) {
      status.setColor("#57a56d").setText(bigBen ? "That's the one. Fadwa approves. Pigeon absent." : "That's the one.");
      scene.time.delayedCall(480, () => spec.onDone(true));
    } else {
      status.setColor("#e46d94").setText(photobombed ? "PIGEON PHOTOBOMB. Fadwa demands a retry." : "Almost! Shuffle back into the centre and retry.");
      scene.time.delayedCall(520, () => { snapping = false; tw.resume(); birdTw?.resume(); });
    }
  };
  items.push(btn(scene, width / 2, py + 278, "Capture", "#2f6fd0", snap));
  items.push(
    btn(scene, width / 2, py + h - 26, spec.skipLabel ?? "Cancel", "#8a7a6a", () => {
      tw.stop();
      birdTw?.stop();
      spec.onDone(false);
    }),
  );
  const c = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  c.once(Phaser.GameObjects.Events.DESTROY, () => { tw.stop(); birdTw?.stop(); });
  bindAction(scene, c, snap);
  return c;
}

export function lockInput() {
  controls.locked = true;
  controls.moveX = 0;
  controls.moveY = 0;
}

export function unlockInput() {
  controls.locked = false;
}
