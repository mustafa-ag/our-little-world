import Phaser from "phaser";
import { controls, uiEvents } from "../systems/controls";

const FONT = "monospace";

export type MiniKind = "stairs" | "salon" | "coffee" | "bouquet" | "photo" | "showdown" | "shopping" | "safe" | "lab" | "pitch" | "lockpick";

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
  if (spec.kind === "coffee") return coffeeGame(scene, spec);
  if (spec.kind === "bouquet") return bouquetGame(scene, spec);
  if (spec.kind === "photo") return photoGame(scene, spec);
  if (spec.kind === "showdown") return showdownGame(scene, spec);
  if (spec.kind === "stairs") return stairsGame(scene, spec);
  if (spec.kind === "shopping") return shoppingGame(scene, spec);
  if (spec.kind === "lockpick") return lockpickGame(scene, spec);
  if (spec.kind === "safe") return safeGame(scene, spec);
  return tapGame(scene, spec);
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
  const need = spec.taps ?? 20;
  let progress = 0;
  let seconds = 13;
  let finished = false;
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
    timer.setText(`TIME ${seconds.toFixed(1)}`);
    status.setText(`${progress} / ${need} STEPS`);
    bar.clear();
    bar.fillStyle(0xe8dcc8, 1).fillRoundedRect(px + 26, py + 310, w - 52, 12, 5);
    bar.fillStyle(0xe46d94, 1).fillRoundedRect(px + 26, py + 310, Math.max(3, (w - 52) * ratio), 12, 5);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    tick.remove();
    puff.setColor("#57a56d").setText("TOP FLOOR! Tiny victory dance.");
    scene.tweens.add({ targets: her, y: her.y - 8, duration: 110, yoyo: true, repeat: 2 });
    scene.time.delayedCall(450, () => spec.onDone(true));
  };
  const retry = () => {
    if (finished) return;
    progress = 0;
    seconds = 13;
    puff.setText("slid down. again! again!");
    draw();
  };
  const action = () => {
    if (finished) return;
    progress += 1;
    puff.setText(progress % 6 === 0 ? "why are there so many" : progress > need - 5 ? "almost there" : "huff");
    draw();
    if (progress >= need) finish();
  };
  const button = btn(scene, width / 2, py + 344, "CLIMB!", "#2f6fd0", action);
  items.push(button);
  const container = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  const tick = scene.time.addEvent({ delay: 100, loop: true, callback: () => {
    if (finished) return;
    seconds = Math.max(0, seconds - 0.1);
    if (seconds <= 0) retry();
    else draw();
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
  const { items, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 36, 360), 340);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 36));
  const steps = ["Cup", "Espresso", "Milk", "Lid"];
  let next = 0;
  let brewing = false;
  const status = scene.add
    .text(width / 2, py + 78, "Build it in order.", { fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", resolution: 2 })
    .setOrigin(0.5);
  items.push(status);
  const machine = scene.add.rectangle(width / 2, py + 108, 104, 36, 0x3a2b3a).setStrokeStyle(2, 0xcaa27a);
  const nozzle = scene.add.rectangle(width / 2, py + 132, 8, 12, 0x6f5b4c);
  const cup = scene.add.rectangle(width / 2, py + 150, 52, 58, 0xf4e8d4).setStrokeStyle(3, 0x3a2b3a);
  const coffee = scene.add.rectangle(width / 2, py + 165, 38, 0, 0x5a3a22).setOrigin(0.5, 1);
  const foam = scene.add.rectangle(width / 2, py + 158, 34, 0, 0xfff4e6).setOrigin(0.5, 1);
  const stream = scene.add.rectangle(width / 2, py + 142, 5, 0, 0x5a3a22).setOrigin(0.5, 0);
  const steam = scene.add.text(width / 2, py + 112, "~ ~", { fontFamily: FONT, fontSize: "12px", color: "#fff", resolution: 2 }).setOrigin(0.5).setAlpha(0);
  items.push(machine, nozzle, cup, coffee, foam, stream, steam);
  steps.forEach((label, i) => {
    const b = btn(scene, width / 2 - 120 + (i % 2) * 240, py + 210 + Math.floor(i / 2) * 36, label, "#e46d94", () => {
      if (brewing) return;
      if (i !== next) {
        status.setText("Not yet — " + steps[next] + " first.");
        return;
      }
      brewing = true;
      b.setAlpha(0.45);
      status.setText(i === 0 ? "Picking the cup..." : `${label} pouring...`);
      if (i === 0) {
        cup.setX(width / 2 - 48);
        scene.tweens.add({ targets: cup, x: width / 2, duration: 360, ease: "Back.out" });
      } else if (i === 1) {
        stream.setFillStyle(0x5a3a22).setSize(5, 0);
        scene.tweens.add({ targets: stream, displayHeight: 30, duration: 180, yoyo: true, repeat: 2 });
        scene.tweens.add({ targets: coffee, displayHeight: 22, duration: 620, ease: "Sine.inOut" });
      } else if (i === 2) {
        stream.setFillStyle(0xfff4e6).setSize(5, 0);
        scene.tweens.add({ targets: stream, displayHeight: 26, duration: 160, yoyo: true, repeat: 2 });
        scene.tweens.add({ targets: foam, displayHeight: 9, duration: 580, ease: "Sine.inOut" });
      } else {
        const lid = scene.add.ellipse(width / 2, py + 137, 48, 10, 0xe46d94).setAlpha(0).setScale(1.4);
        items.push(lid);
        scene.tweens.add({ targets: lid, alpha: 1, scaleX: 1, scaleY: 1, duration: 360, ease: "Back.out" });
      }
      scene.tweens.add({ targets: steam, alpha: 0.8, y: py + 96, duration: 450, yoyo: true, repeat: 1 });
      scene.time.delayedCall(680, () => {
        next += 1;
        brewing = false;
        status.setText(next >= steps.length ? "Perfect. That's the order." : `${label} in. Next: ${steps[next]}`);
        if (next >= steps.length) scene.time.delayedCall(420, () => spec.onDone(true));
      });
    });
    items.push(b);
  });
  items.push(btn(scene, width / 2, py + h - 26, spec.skipLabel ?? "Cancel", "#8a7a6a", () => spec.onDone(false)));
  return scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
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
  flowers.forEach((f, i) => {
    const x = width / 2 - 120 + (i % 5) * 60;
    const b = btn(scene, x, py + 130, f, "#f4a6c0", () => {
      if (picked.includes(f) || picked.length >= 3) return;
      picked.push(f);
      b.setAlpha(0.45);
      status.setText(`${picked.length}/3 · ${picked.join(", ")}`);
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

  const snap = () => {
    tw.stop();
    const mid = (her.x + buddy.x) / 2;
    const aligned = Math.abs(mid - vx) < 18;
    const flash = scene.add.rectangle(width / 2, scene.scale.gameSize.height / 2, width, scene.scale.gameSize.height, 0xffffff, 0.85).setScrollFactor(0).setDepth(90);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });
    status.setText(aligned ? "That's the one." : "A little crooked. Still keeping it.");
    scene.time.delayedCall(360, () => spec.onDone(true));
  };
  items.push(btn(scene, width / 2, py + 278, "Capture", "#2f6fd0", snap));
  items.push(
    btn(scene, width / 2, py + h - 26, spec.skipLabel ?? "Cancel", "#8a7a6a", () => {
      tw.stop();
      spec.onDone(false);
    }),
  );
  const c = scene.add.container(0, 0, items).setScrollFactor(0).setDepth(80);
  c.once(Phaser.GameObjects.Events.DESTROY, () => tw.stop());
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
