import Phaser from "phaser";
import type { CharColors } from "../palette";
import { CHARACTERS, PLAYER } from "../data/npcs";

export type PortraitMood = "neutral" | "happy" | "laugh" | "surprised" | "concerned" | "emotional";

const ALIAS: Record<string, string> = {
  her: "juju",
  juju: "juju",
  Juju: "juju",
  baba: "baba",
  Baba: "baba",
  mama: "mama",
  Mama: "mama",
  moomoo: "moomoo",
  Moomoo: "moomoo",
  fadwa: "fadwa",
  Fadwa: "fadwa",
};

function portraitKey(id: string, mood: PortraitMood = "neutral") {
  const who = ALIAS[id] ?? id.toLowerCase();
  return mood === "neutral" ? `portrait_${who}` : `portrait_${who}_${mood}`;
}

export function resolvePortrait(scene: Phaser.Scene, nameOrId?: string, mood: PortraitMood = "neutral") {
  if (!nameOrId) return undefined;
  const id = ALIAS[nameOrId] ?? ALIAS[nameOrId.toLowerCase()] ?? nameOrId.toLowerCase();
  const wanted = portraitKey(id, mood);
  if (scene.textures.exists(wanted)) return wanted;
  const neutral = portraitKey(id, "neutral");
  if (scene.textures.exists(neutral)) return neutral;
  return undefined;
}

function paintPortrait(ctx: CanvasRenderingContext2D, c: CharColors, mood: PortraitMood) {
  const w = 160;
  const h = 200;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#fff4e8");
  bg.addColorStop(1, "#f0d4c4");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 18);
  ctx.fill();

  ctx.fillStyle = c.top;
  ctx.beginPath();
  ctx.ellipse(80, 200, 70, 50, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.ellipse(80, 98, 48, 56, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = c.hair;
  ctx.beginPath();
  ctx.ellipse(80, 58, 52, 36, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(36, 88, 16, 28, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(124, 88, 16, 28, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2a2230";
  const eyeOpen = mood === "laugh" ? 1.2 : 3.4;
  ctx.beginPath();
  ctx.ellipse(62, 100, 3.2, eyeOpen, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(98, 100, 3.2, eyeOpen, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f7a6b8";
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.ellipse(50, 118, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(110, 118, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#c07880";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (mood === "concerned") ctx.arc(80, 136, 8, 0.4, Math.PI - 0.4, true);
  else if (mood === "surprised") ctx.ellipse(80, 130, 4, 6, 0, 0, Math.PI * 2);
  else ctx.arc(80, 124, 10, 0.15, Math.PI - 0.15);
  ctx.stroke();
}

export function buildPortraits(scene: Phaser.Scene) {
  const people: { id: string; colors: CharColors }[] = [
    { id: "juju", colors: PLAYER.colors },
    ...CHARACTERS.filter((c) => ["baba", "mama", "moomoo", "fadwa"].includes(c.id)).map((c) => ({
      id: c.id,
      colors: c.colors,
    })),
  ];
  const moods: PortraitMood[] = ["neutral", "happy"];
  for (const p of people) {
    for (const mood of moods) {
      const key = portraitKey(p.id, mood);
      if (scene.textures.exists(key)) continue;
      const tex = scene.textures.createCanvas(key, 160, 200)!;
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = true;
      paintPortrait(ctx, p.colors, mood);
      tex.refresh();
    }
  }
}
