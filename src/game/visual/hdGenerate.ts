import Phaser from "phaser";
import { HD_TILE_SRC } from "./mode";

type Ctx = CanvasRenderingContext2D;

export const HD_TILESET = "hd_tileset";
export const HD_WATER = "hd_water";
export const HD_GLOW = "hd_glow";
export const HD_SHADOW = "hd_shadow";
export const HD_HEADLIGHT = "hd_headlight";

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
  tex.refresh();
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function grad(ctx: Ctx, x: number, y: number, x2: number, y2: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x, y, x2, y2);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function tileGrass(ctx: Ctx, x: number, y: number, s: number, seed: number, kind: "grass" | "lawn" | "golf" | "flower") {
  const rnd = (i: number) => {
    const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  const base =
    kind === "lawn" ? ["#7ecf6a", "#6bb85a"] : kind === "golf" ? ["#8ed97a", "#74c462"] : ["#6fc45c", "#5aac4a"];
  ctx.fillStyle = grad(ctx, x, y, x, y + s, [
    [0, base[0]],
    [1, base[1]],
  ]);
  ctx.fillRect(x, y, s, s);
  for (let i = 0; i < 18; i++) {
    const px = x + rnd(i) * s;
    const py = y + rnd(i + 40) * s;
    ctx.strokeStyle = `rgba(40,90,30,${0.12 + rnd(i + 3) * 0.18})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + 1, py - 4, px + rnd(i + 7) * 3 - 1, py - 6 - rnd(i) * 4);
    ctx.stroke();
  }
  if (kind === "flower" || (kind === "grass" && rnd(9) > 0.65)) {
    const fx = x + 10 + rnd(11) * (s - 20);
    const fy = y + 10 + rnd(12) * (s - 20);
    ctx.fillStyle = rnd(13) > 0.5 ? "#ffb3c7" : "#ffe08a";
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2;
      ellipse(ctx, fx + Math.cos(ang) * 3, fy + Math.sin(ang) * 3, 2.2, 2.2, ctx.fillStyle as string);
    }
    ellipse(ctx, fx, fy, 1.6, 1.6, "#fff6c9");
  }
}

function tilePave(ctx: Ctx, x: number, y: number, s: number, light: boolean) {
  ctx.fillStyle = light ? "#d8d2c6" : "#c4bdb0";
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = "rgba(90,80,70,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * (s / 4), y);
    ctx.lineTo(x + i * (s / 4), y + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + i * (s / 4));
    ctx.lineTo(x + s, y + i * (s / 4));
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x + 2, y + 2, s - 4, 3);
}

function tileRoad(ctx: Ctx, x: number, y: number, s: number, lane: boolean) {
  ctx.fillStyle = grad(ctx, x, y, x + s, y, [
    [0, "#5a5f66"],
    [0.5, "#6a7078"],
    [1, "#555a62"],
  ]);
  ctx.fillRect(x, y, s, s);
  if (lane) {
    ctx.fillStyle = "#f4e38a";
    ctx.fillRect(x + s / 2 - 2, y + 6, 4, s - 12);
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x, y + 2, s, 2);
}

function tileSand(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = grad(ctx, x, y, x, y + s, [
    [0, "#f0d7a4"],
    [1, "#e2c07e"],
  ]);
  ctx.fillRect(x, y, s, s);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = "rgba(180,140,70,0.15)";
    ctx.beginPath();
    ctx.arc(x + ((i * 17) % s), y + ((i * 29) % s), 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tileWater(ctx: Ctx, x: number, y: number, s: number, phase: number) {
  ctx.fillStyle = grad(ctx, x, y, x, y + s, [
    [0, "#5ec6e4"],
    [0.55, "#3aa8d0"],
    [1, "#2b8fb8"],
  ]);
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const yy = y + 12 + i * 16 + phase * 4;
    ctx.beginPath();
    ctx.moveTo(x + 4, yy);
    ctx.quadraticCurveTo(x + s / 2, yy - 5, x + s - 4, yy);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(x + 18 + phase * 6, y + 20, 2, 0, Math.PI * 2);
  ctx.fill();
}

function tilePath(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = "#d2b48a";
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = "rgba(160,110,60,0.18)";
  for (let i = 0; i < 8; i++) ctx.fillRect(x + (i * 13) % s, y + (i * 19) % s, 5, 3);
}

export const TILESET_KEYS = [
  "t_grass",
  "t_grass_var",
  "t_grass2",
  "t_lawn",
  "t_golf",
  "t_sand",
  "t_path",
  "t_pavement",
  "t_paving_light",
  "t_paving_dark",
  "t_road",
  "t_road_lane",
  "t_water",
  "t_water1",
  "t_water2",
  "t_water3",
  "t_plaza_stone",
  "t_parking",
  "t_hedge",
  "t_asphalt",
  "t_crossing",
  "t_cobble",
  "t_brick_path",
  "t_snow",
] as const;

export function tilesetIndex(key: string) {
  const i = TILESET_KEYS.indexOf(key as (typeof TILESET_KEYS)[number]);
  if (i >= 0) return i;
  if (key === "t_grass") return 0;
  return 0;
}

export function buildHdTileset(scene: Phaser.Scene) {
  const s = HD_TILE_SRC;
  const cols = 8;
  const rows = 3;
  canvas(scene, HD_TILESET, cols * s, rows * s, (ctx) => {
    const cell = (i: number) => ({ x: (i % cols) * s, y: Math.floor(i / cols) * s });
    const c0 = cell(0);
    tileGrass(ctx, c0.x, c0.y, s, 1, "grass");
    const c1 = cell(1);
    tileGrass(ctx, c1.x, c1.y, s, 2, "grass");
    const c2 = cell(2);
    tileGrass(ctx, c2.x, c2.y, s, 3, "flower");
    const c3 = cell(3);
    tileGrass(ctx, c3.x, c3.y, s, 4, "lawn");
    const c4 = cell(4);
    tileGrass(ctx, c4.x, c4.y, s, 5, "golf");
    const c5 = cell(5);
    tileSand(ctx, c5.x, c5.y, s);
    const c6 = cell(6);
    tilePath(ctx, c6.x, c6.y, s);
    const c7 = cell(7);
    tilePave(ctx, c7.x, c7.y, s, false);
    const c8 = cell(8);
    tilePave(ctx, c8.x, c8.y, s, true);
    const c9 = cell(9);
    tilePave(ctx, c9.x, c9.y, s, false);
    const c10 = cell(10);
    tileRoad(ctx, c10.x, c10.y, s, false);
    const c11 = cell(11);
    tileRoad(ctx, c11.x, c11.y, s, true);
    for (let p = 0; p < 4; p++) {
      const c = cell(12 + p);
      tileWater(ctx, c.x, c.y, s, p);
    }
    const c16 = cell(16);
    tilePave(ctx, c16.x, c16.y, s, true);
    const c17 = cell(17);
    tilePave(ctx, c17.x, c17.y, s, false);
    const c18 = cell(18);
    ctx.fillStyle = "#3d7a3a";
    ctx.fillRect(c18.x, c18.y, s, s);
    const c19 = cell(19);
    tileRoad(ctx, c19.x, c19.y, s, false);
    const c20 = cell(20);
    tileRoad(ctx, c20.x, c20.y, s, false);
    ctx.fillStyle = "#f2f0ea";
    for (let i = 0; i < 5; i++) ctx.fillRect(c20.x + 6 + i * 10, c20.y + 4, 6, s - 8);
    const c21 = cell(21);
    tilePave(ctx, c21.x, c21.y, s, false);
    const c22 = cell(22);
    tilePath(ctx, c22.x, c22.y, s);
    const c23 = cell(23);
    ctx.fillStyle = "#eef6ff";
    ctx.fillRect(c23.x, c23.y, s, s);
  });

  canvas(scene, HD_WATER, s, s, (ctx) => tileWater(ctx, 0, 0, s, 1));
  canvas(scene, "hd_grass_big", 256, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, "#7ed36a");
    g.addColorStop(0.5, "#6bc25a");
    g.addColorStop(1, "#74c864");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 80; i++) {
      const x = (i * 47) % 256;
      const y = (i * 89) % 256;
      ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,200,0.12)" : "rgba(40,110,40,0.1)";
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + (i % 5) * 3, 10 + (i % 4) * 2, i * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = i % 2 ? "#ffb3c7" : "#ffe08a";
      ctx.beginPath();
      ctx.arc((i * 73) % 256, (i * 51) % 256, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function buildShadow(scene: Phaser.Scene) {
  canvas(scene, HD_SHADOW, 64, 28, (ctx) => {
    const g = ctx.createRadialGradient(32, 14, 2, 32, 14, 28);
    g.addColorStop(0, "rgba(40,28,36,0.28)");
    g.addColorStop(1, "rgba(40,28,36,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(32, 14, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas(scene, "hd__o_shadow", 64, 28, (ctx) => {
    const g = ctx.createRadialGradient(32, 14, 2, 32, 14, 28);
    g.addColorStop(0, "rgba(40,28,36,0.28)");
    g.addColorStop(1, "rgba(40,28,36,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(32, 14, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function buildLights(scene: Phaser.Scene) {
  canvas(scene, HD_GLOW, 96, 96, (ctx) => {
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 46);
    g.addColorStop(0, "rgba(255,220,140,0.55)");
    g.addColorStop(0.45, "rgba(255,180,80,0.18)");
    g.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
  });
  canvas(scene, HD_HEADLIGHT, 80, 48, (ctx) => {
    const g = ctx.createRadialGradient(12, 24, 2, 48, 24, 40);
    g.addColorStop(0, "rgba(255,245,200,0.45)");
    g.addColorStop(1, "rgba(255,245,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(8, 16);
    ctx.lineTo(78, 4);
    ctx.lineTo(78, 44);
    ctx.lineTo(8, 32);
    ctx.closePath();
    ctx.fill();
  });
}

function buildTree(scene: Phaser.Scene) {
  canvas(scene, "hd__o_tree", 160, 200, (ctx) => {
    ellipse(ctx, 80, 188, 28, 8, "rgba(40,30,20,0.22)");
    ctx.fillStyle = grad(ctx, 72, 110, 88, 190, [
      [0, "#8a5a32"],
      [1, "#5c3a1e"],
    ]);
    rr(ctx, 72, 118, 16, 70, 6);
    ctx.fill();
    ellipse(ctx, 80, 78, 54, 48, "#3f8a3a");
    ellipse(ctx, 54, 96, 32, 28, "#4ea04a");
    ellipse(ctx, 108, 94, 30, 26, "#357834");
    ellipse(ctx, 80, 58, 28, 22, "#6fbe5c");
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(66, 62, 14, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function buildPalm(scene: Phaser.Scene) {
  canvas(scene, "hd__o_palm", 180, 280, (ctx) => {
    ellipse(ctx, 90, 268, 26, 7, "rgba(40,30,20,0.2)");
    ctx.strokeStyle = "#c4a06a";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(90, 250);
    ctx.quadraticCurveTo(96, 160, 90, 88);
    ctx.stroke();
    ctx.strokeStyle = "#8a6238";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(86, 220 - i * 18);
      ctx.lineTo(96, 210 - i * 18);
      ctx.stroke();
    }
    const frond = (ang: number, len: number) => {
      ctx.save();
      ctx.translate(90, 86);
      ctx.rotate(ang);
      ctx.fillStyle = grad(ctx, 0, 0, 0, len, [
        [0, "#7ed96a"],
        [1, "#2f8a3a"],
      ]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(18, len * 0.4, 4, len);
      ctx.quadraticCurveTo(-16, len * 0.45, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    for (let i = 0; i < 7; i++) frond(-1.2 + i * 0.4, 70 + (i % 2) * 8);
  });
}

function buildFlower(scene: Phaser.Scene, key: string, petal: string) {
  canvas(scene, `hd__${key}`, 48, 48, (ctx) => {
    ctx.strokeStyle = "#4a9a3a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, 42);
    ctx.quadraticCurveTo(26, 28, 24, 22);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - 0.4;
      ellipse(ctx, 24 + Math.cos(a) * 7, 18 + Math.sin(a) * 7, 6, 5, petal);
    }
    ellipse(ctx, 24, 18, 4, 4, "#ffe08a");
  });
}

function buildLamp(scene: Phaser.Scene) {
  canvas(scene, "hd__o_lamp", 64, 160, (ctx) => {
    ellipse(ctx, 32, 152, 12, 4, "rgba(30,20,20,0.25)");
    ctx.fillStyle = "#4a4450";
    rr(ctx, 28, 50, 8, 100, 3);
    ctx.fill();
    ctx.fillStyle = "#3a3440";
    rr(ctx, 20, 20, 24, 36, 8);
    ctx.fill();
    const g = ctx.createRadialGradient(32, 36, 2, 32, 36, 16);
    g.addColorStop(0, "#fff4c8");
    g.addColorStop(1, "#f0b84a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 38, 10, 0, Math.PI * 2);
    ctx.fill();
  });
}

function buildFence(scene: Phaser.Scene) {
  canvas(scene, "hd__o_fence_h", 64, 64, (ctx) => {
    ctx.fillStyle = "#d8c4a0";
    ctx.fillRect(4, 28, 56, 6);
    ctx.fillRect(4, 42, 56, 6);
    for (let x = 8; x < 60; x += 14) {
      rr(ctx, x, 16, 7, 40, 2);
      ctx.fillStyle = "#c4ae86";
      ctx.fill();
    }
  });
  canvas(scene, "hd__o_fence_v", 64, 64, (ctx) => {
    ctx.fillStyle = "#c4ae86";
    rr(ctx, 28, 6, 8, 52, 2);
    ctx.fill();
    ctx.fillStyle = "#d8c4a0";
    ctx.fillRect(16, 20, 32, 5);
    ctx.fillRect(16, 36, 32, 5);
  });
}

function buildJeep(scene: Phaser.Scene) {
  canvas(scene, "hd__v_jeep_blue", 160, 240, (ctx) => {
    ellipse(ctx, 80, 220, 40, 12, "rgba(20,20,30,0.25)");
    const body = grad(ctx, 30, 20, 130, 20, [
      [0, "#1f5cb8"],
      [0.5, "#2f6fd0"],
      [1, "#1a4e9a"],
    ]);
    ctx.fillStyle = "#1a1a22";
    rr(ctx, 18, 48, 18, 42, 6);
    ctx.fill();
    rr(ctx, 124, 48, 18, 42, 6);
    ctx.fill();
    rr(ctx, 18, 150, 18, 42, 6);
    ctx.fill();
    rr(ctx, 124, 150, 18, 42, 6);
    ctx.fill();
    ctx.fillStyle = body;
    rr(ctx, 28, 24, 104, 192, 16);
    ctx.fill();
    ctx.fillStyle = "#163e80";
    rr(ctx, 40, 86, 80, 58, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.75)";
    rr(ctx, 42, 40, 76, 36, 8);
    ctx.fill();
    rr(ctx, 42, 156, 76, 36, 8);
    ctx.fill();
    ctx.fillStyle = "#111318";
    for (let i = 0; i < 7; i++) ctx.fillRect(48 + i * 10, 26, 5, 10);
    ctx.fillStyle = "#fff6c9";
    rr(ctx, 36, 22, 16, 8, 3);
    ctx.fill();
    rr(ctx, 108, 22, 16, 8, 3);
    ctx.fill();
    ctx.fillStyle = "#e46d94";
    rr(ctx, 36, 208, 14, 6, 2);
    ctx.fill();
    rr(ctx, 110, 208, 14, 6, 2);
    ctx.fill();
  });
}

function buildVilla(scene: Phaser.Scene) {
  canvas(scene, "hd__b_villa_terra2", 360, 320, (ctx) => {
    ellipse(ctx, 180, 308, 90, 12, "rgba(40,30,20,0.18)");
    ctx.fillStyle = "#efe6d4";
    rr(ctx, 40, 110, 280, 190, 8);
    ctx.fill();
    ctx.fillStyle = "#dccdb4";
    ctx.fillRect(40, 110, 280, 16);
    ctx.fillStyle = "#d0663a";
    ctx.beginPath();
    ctx.moveTo(24, 124);
    ctx.lineTo(180, 36);
    ctx.lineTo(336, 124);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b05028";
    ctx.beginPath();
    ctx.moveTo(24, 124);
    ctx.lineTo(180, 36);
    ctx.lineTo(180, 52);
    ctx.lineTo(48, 124);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#efe6d4";
    rr(ctx, 16, 150, 70, 140, 8);
    ctx.fill();
    ctx.fillStyle = "#d0663a";
    ctx.fillRect(10, 146, 82, 14);
    const win = (x: number, y: number) => {
      ctx.fillStyle = "#bfe6ff";
      rr(ctx, x, y, 36, 32, 4);
      ctx.fill();
      ctx.strokeStyle = "#efe6d4";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, 34, 30);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + 4, y + 4, 12, 8);
    };
    win(70, 150);
    win(250, 150);
    win(70, 210);
    win(250, 210);
    ctx.fillStyle = "#7a5238";
    rr(ctx, 156, 236, 48, 64, 4);
    ctx.fill();
    ctx.fillStyle = "#f4c95d";
    ctx.beginPath();
    ctx.arc(192, 270, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6fbe5c";
    ctx.beginPath();
    ctx.ellipse(48, 292, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function buildMosque(scene: Phaser.Scene) {
  canvas(scene, "hd__b_mosque_acres", 400, 320, (ctx) => {
    ellipse(ctx, 200, 308, 110, 12, "rgba(40,30,20,0.16)");
    ctx.fillStyle = "#f3ead8";
    rr(ctx, 70, 150, 260, 150, 6);
    ctx.fill();
    ctx.fillStyle = "#e8d8b4";
    rr(ctx, 40, 190, 50, 110, 6);
    ctx.fill();
    rr(ctx, 310, 190, 50, 110, 6);
    ctx.fill();
    ctx.fillStyle = "#d8c49a";
    ctx.beginPath();
    ctx.arc(200, 150, 70, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#c9a24a";
    ctx.fillRect(196, 48, 8, 36);
    ctx.beginPath();
    ctx.arc(200, 48, 8, 0, Math.PI * 2);
    ctx.fill();
    const arch = (x: number) => {
      ctx.fillStyle = "#8fb8c8";
      ctx.fillRect(x, 210, 28, 50);
      ctx.beginPath();
      ctx.arc(x + 14, 210, 14, Math.PI, 0);
      ctx.fill();
    };
    arch(110);
    arch(186);
    arch(262);
    ctx.fillStyle = "#7a5238";
    rr(ctx, 176, 250, 48, 50, 4);
    ctx.fill();
  });
}

export function buildHdEnvironment(scene: Phaser.Scene) {
  buildHdTileset(scene);
  buildShadow(scene);
  buildLights(scene);
  buildTree(scene);
  buildPalm(scene);
  buildFlower(scene, "o_flower_pink", "#ff9db8");
  buildFlower(scene, "o_flower_yellow", "#ffe08a");
  buildLamp(scene);
  buildFence(scene);
  buildJeep(scene);
  buildVilla(scene);
  buildMosque(scene);
}
