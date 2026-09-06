import Phaser from "phaser";

const FONT = "monospace";

export function worldEmote(scene: Phaser.Scene, x: number, y: number, symbol: string, color = "#fff4e6") {
  const bubble = scene.add.text(x, y, symbol, { fontFamily: FONT, fontSize: "17px", color: "#3a2b3a", backgroundColor: color, padding: { x: 6, y: 4 }, resolution: 2 }).setOrigin(0.5, 1).setDepth(y + 100);
  scene.tweens.add({ targets: bubble, y: y - 13, scale: { from: 0.7, to: 1.08 }, alpha: { from: 1, to: 0 }, duration: 1050, ease: "Cubic.out", onComplete: () => bubble.destroy() });
}

export function worldSparkles(scene: Phaser.Scene, x: number, y: number, symbol = "✦") {
  for (let i = 0; i < 10; i += 1) {
    const bit = scene.add.text(x, y, symbol, { fontFamily: FONT, fontSize: "11px", color: i % 2 ? "#f4c95d" : "#ff8fae", resolution: 2 }).setOrigin(0.5).setDepth(y + 110);
    const a = (Math.PI * 2 * i) / 10;
    scene.tweens.add({ targets: bit, x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 24, alpha: 0, angle: i % 2 ? 70 : -70, duration: 650, onComplete: () => bit.destroy() });
  }
}

export function reunionBounce(scene: Phaser.Scene, a: Phaser.GameObjects.GameObject & { x: number; y: number }, b: Phaser.GameObjects.GameObject & { x: number; y: number }) {
  const ax = a.x;
  const bx = b.x;
  const middle = (ax + bx) / 2;
  scene.tweens.add({ targets: a, x: middle - 5, y: a.y - 6, angle: -3, duration: 250, yoyo: true, hold: 250, repeat: 1, ease: "Sine.inOut", onComplete: () => { a.x = ax; } });
  scene.tweens.add({ targets: b, x: middle + 5, y: b.y - 6, angle: 3, duration: 250, yoyo: true, hold: 250, repeat: 1, ease: "Sine.inOut", onComplete: () => { b.x = bx; } });
  worldSparkles(scene, middle, Math.min(a.y, b.y) - 16, "♥");
}
