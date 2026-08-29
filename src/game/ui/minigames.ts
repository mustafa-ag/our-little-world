import Phaser from "phaser";
import { controls } from "../systems/controls";

import { FONT_UI } from "../visual/theme";
import { applyVisual } from "../visual/assets";

const FONT = FONT_UI;

export type MiniKind = "stairs" | "salon" | "coffee" | "bouquet" | "photo";

export interface MiniSpec {
  kind: MiniKind;
  title: string;
  hint: string;
  taps?: number;
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
  return tapGame(scene, spec);
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

function coffeeGame(scene: Phaser.Scene, spec: MiniSpec) {
  const { items, py, w, h, width } = panel(scene, Math.min(scene.scale.gameSize.width - 36, 360), 340);
  items.push(...titleHint(scene, spec, width / 2, py + 14, w - 36));
  const steps = ["Cup", "Espresso", "Milk", "Lid"];
  let next = 0;
  const status = scene.add
    .text(width / 2, py + 78, "Build it in order.", { fontFamily: FONT, fontSize: "13px", color: "#3a2b3a", resolution: 2 })
    .setOrigin(0.5);
  items.push(status);
  const cup = scene.add.rectangle(width / 2, py + 150, 52, 58, 0xf4e8d4).setStrokeStyle(3, 0x3a2b3a);
  items.push(cup);
  const layers: Phaser.GameObjects.Rectangle[] = [];
  steps.forEach((label, i) => {
    const b = btn(scene, width / 2 - 120 + (i % 2) * 240, py + 210 + Math.floor(i / 2) * 36, label, "#e46d94", () => {
      if (i !== next) {
        status.setText("Not yet — " + steps[next] + " first.");
        return;
      }
      next += 1;
      const col = [0xf4e8d4, 0x5a3a22, 0xfff4e6, 0xe46d94][i];
      const layer = scene.add.rectangle(width / 2, py + 168 - i * 8, 40 - i * 2, 10, col);
      layers.push(layer);
      items.push(layer);
      status.setText(next >= steps.length ? "Perfect. That's the order." : `${label} in. Next: ${steps[next]}`);
      if (next >= steps.length) scene.time.delayedCall(400, () => spec.onDone(true));
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
  applyVisual(landmark, mark);
  landmark.setDisplaySize(Math.min(64, landmark.displayWidth), Math.min(72, landmark.displayHeight));
  items.push(landmark);
  const viewfinder = scene.add.rectangle(vx, vy, vw, vh, 0x000000, 0).setStrokeStyle(4, 0xf4f0e6);
  items.push(viewfinder);
  items.push(scene.add.rectangle(vx - vw / 2 + 8, vy - vh / 2 + 8, 14, 2, 0xf4f0e6));
  items.push(scene.add.rectangle(vx - vw / 2 + 8, vy - vh / 2 + 8, 2, 14, 0xf4f0e6));
  items.push(scene.add.rectangle(vx + vw / 2 - 8, vy - vh / 2 + 8, 14, 2, 0xf4f0e6));
  items.push(scene.add.rectangle(vx + vw / 2 - 8, vy - vh / 2 + 8, 2, 14, 0xf4f0e6));

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
