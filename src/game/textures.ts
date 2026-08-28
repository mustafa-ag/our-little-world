import Phaser from "phaser";
import { Palette, Outfits } from "./palette";
import { TILE } from "./constants";
import { makeCharacterTexture, makeCharacterAnims } from "./characters";
import { CHARACTERS } from "./data/npcs";

type Ctx = CanvasRenderingContext2D;

function createTex(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: Ctx) => void,
) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
  tex.refresh();
}

const px = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

const circle = (ctx: Ctx, cx: number, cy: number, r: number, c: string) => {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
};

// deterministic little speckle helper
function speckle(ctx: Ctx, w: number, h: number, color: string, n: number, seed: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    px(ctx, x, y, 1, 1, color);
  }
}

// ---------------------------------------------------------------------------
// Ground tiles (16x16)
// ---------------------------------------------------------------------------
function buildTiles(scene: Phaser.Scene) {
  createTex(scene, "t_grass", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.grass);
    speckle(ctx, TILE, TILE, Palette.grassDark, 10, 7);
    speckle(ctx, TILE, TILE, Palette.grassLight, 8, 13);
  });
  createTex(scene, "t_grass2", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.grass);
    speckle(ctx, TILE, TILE, Palette.grassDark, 6, 21);
    // tiny flower
    px(ctx, 7, 7, 2, 2, "#fff3b0");
    px(ctx, 6, 8, 1, 1, "#ff9db0");
    px(ctx, 9, 8, 1, 1, "#ff9db0");
  });
  createTex(scene, "t_path", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.path);
    speckle(ctx, TILE, TILE, Palette.pathDark, 14, 5);
  });
  createTex(scene, "t_sand", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.sand);
    speckle(ctx, TILE, TILE, "#e8cf9c", 12, 9);
  });
  createTex(scene, "t_water", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.water);
    px(ctx, 2, 4, 5, 1, Palette.waterDark);
    px(ctx, 9, 9, 5, 1, Palette.waterDark);
    px(ctx, 4, 12, 3, 1, "#8fdcf3");
  });
  createTex(scene, "t_road", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.road);
    speckle(ctx, TILE, TILE, "#5c606a", 10, 3);
  });
  createTex(scene, "t_snow", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, "#eef3f7");
    speckle(ctx, TILE, TILE, "#dbe6ef", 8, 11);
  });
  createTex(scene, "t_cobble", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, "#9aa0ab");
    for (let y = 0; y < TILE; y += 4)
      for (let x = 0; x < TILE; x += 4) {
        px(ctx, x, y, 3, 3, ((x + y) / 4) % 2 ? "#8a909b" : "#a7adb8");
      }
  });
  // interiors
  createTex(scene, "t_wood", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, Palette.wood);
    px(ctx, 0, 0, TILE, 1, Palette.woodDark);
    px(ctx, 0, 5, TILE, 1, Palette.woodDark);
    px(ctx, 0, 10, TILE, 1, Palette.woodDark);
    px(ctx, 0, 15, TILE, 1, Palette.woodDark);
  });
  createTex(scene, "t_tile", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, "#e7e2d8");
    px(ctx, 0, 0, 8, 8, "#f2eee6");
    px(ctx, 8, 8, 8, 8, "#f2eee6");
  });
  createTex(scene, "t_carpet", TILE, TILE, (ctx) => {
    px(ctx, 0, 0, TILE, TILE, "#c98aa8");
    px(ctx, 0, 0, TILE, 1, "#b3758f");
    px(ctx, 0, 0, 1, TILE, "#b3758f");
  });
}

// ---------------------------------------------------------------------------
// Nature + town props
// ---------------------------------------------------------------------------
function buildProps(scene: Phaser.Scene) {
  createTex(scene, "o_tree", 20, 24, (ctx) => {
    px(ctx, 9, 14, 3, 9, Palette.woodDark);
    circle(ctx, 10, 9, 9, "#4b9e4f");
    circle(ctx, 6, 8, 5, "#5cb85f");
    circle(ctx, 14, 10, 5, "#3f8a44");
    circle(ctx, 9, 5, 4, "#63c46a");
  });
  createTex(scene, "o_pine", 18, 26, (ctx) => {
    px(ctx, 8, 18, 3, 8, Palette.woodDark);
    const g = "#2f7d4f";
    ctx.fillStyle = g;
    const tri = (cy: number, half: number) => {
      ctx.beginPath();
      ctx.moveTo(9, cy);
      ctx.lineTo(9 - half, cy + 8);
      ctx.lineTo(9 + half, cy + 8);
      ctx.closePath();
      ctx.fill();
    };
    tri(2, 7);
    tri(7, 8);
    tri(12, 9);
  });
  createTex(scene, "o_bush", 18, 14, (ctx) => {
    circle(ctx, 6, 9, 5, "#4b9e4f");
    circle(ctx, 12, 9, 5, "#4b9e4f");
    circle(ctx, 9, 7, 5, "#5cb85f");
    px(ctx, 5, 5, 1, 1, "#ff8fae");
    px(ctx, 12, 6, 1, 1, "#ffe08a");
  });
  createTex(scene, "o_rock", 16, 12, (ctx) => {
    circle(ctx, 8, 8, 6, "#9aa0ab");
    circle(ctx, 6, 7, 3, "#b3b8c1");
  });
  createTex(scene, "o_flower_pink", 8, 8, (ctx) => {
    px(ctx, 3, 3, 2, 2, "#ff8fae");
    px(ctx, 1, 3, 2, 2, "#ffb3c8");
    px(ctx, 5, 3, 2, 2, "#ffb3c8");
    px(ctx, 3, 1, 2, 2, "#ffb3c8");
    px(ctx, 3, 5, 2, 2, "#ffb3c8");
  });
  createTex(scene, "o_flower_yellow", 8, 8, (ctx) => {
    px(ctx, 3, 3, 2, 2, "#ffcf3f");
    px(ctx, 1, 3, 2, 2, "#ffe08a");
    px(ctx, 5, 3, 2, 2, "#ffe08a");
    px(ctx, 3, 1, 2, 2, "#ffe08a");
    px(ctx, 3, 5, 2, 2, "#ffe08a");
  });
  createTex(scene, "o_fence_h", TILE, TILE, (ctx) => {
    px(ctx, 0, 6, TILE, 2, Palette.wood);
    px(ctx, 2, 3, 2, 9, Palette.woodDark);
    px(ctx, 12, 3, 2, 9, Palette.woodDark);
  });
  createTex(scene, "o_fence_v", TILE, TILE, (ctx) => {
    px(ctx, 7, 0, 2, TILE, Palette.wood);
    px(ctx, 4, 3, 8, 2, Palette.woodDark);
    px(ctx, 4, 11, 8, 2, Palette.woodDark);
  });
  createTex(scene, "o_bench", 20, 12, (ctx) => {
    px(ctx, 1, 4, 18, 3, Palette.wood);
    px(ctx, 1, 3, 18, 1, Palette.woodDark);
    px(ctx, 2, 7, 2, 4, Palette.woodDark);
    px(ctx, 16, 7, 2, 4, Palette.woodDark);
  });
  createTex(scene, "o_lamp", 10, 24, (ctx) => {
    px(ctx, 4, 4, 2, 20, "#3a3f4a");
    circle(ctx, 5, 4, 4, "#ffe08a");
    px(ctx, 3, 3, 1, 1, "#fff6c9");
  });
  createTex(scene, "o_sign", 16, 18, (ctx) => {
    px(ctx, 7, 8, 2, 10, Palette.woodDark);
    px(ctx, 1, 2, 14, 7, Palette.wood);
    px(ctx, 1, 2, 14, 1, Palette.woodDark);
    px(ctx, 3, 4, 10, 1, "#5b3a24");
    px(ctx, 3, 6, 7, 1, "#5b3a24");
  });
  createTex(scene, "o_well", 20, 20, (ctx) => {
    circle(ctx, 10, 12, 7, "#9aa0ab");
    circle(ctx, 10, 12, 5, Palette.water);
    px(ctx, 3, 2, 2, 8, Palette.woodDark);
    px(ctx, 15, 2, 2, 8, Palette.woodDark);
    px(ctx, 2, 1, 16, 3, Palette.roofRed);
  });
  createTex(scene, "o_portal", 24, 28, (ctx) => {
    // little glowing archway used to travel out to the world map
    px(ctx, 2, 6, 20, 22, "#7a5238");
    px(ctx, 5, 9, 14, 19, "#c9a2f0");
    px(ctx, 7, 11, 10, 17, "#a06de2");
    circle(ctx, 12, 5, 6, "#f4c95d");
    px(ctx, 10, 14, 1, 1, "#fff");
    px(ctx, 14, 18, 1, 1, "#fff");
  });
  createTex(scene, "o_shadow", 16, 8, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(8, 4, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Palm tree (Gulf cities)
  createTex(scene, "o_palm", 26, 44, (ctx) => {
    px(ctx, 11, 16, 4, 28, "#9a6f3f");
    for (let y = 18; y < 42; y += 4) px(ctx, 11, y, 4, 1, "#7d5730");
    const frond = (ex: number, ey: number) => {
      ctx.strokeStyle = "#3f8a44";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(13, 16);
      ctx.quadraticCurveTo((13 + ex) / 2, ey - 6, ex, ey);
      ctx.stroke();
    };
    frond(1, 10);
    frond(25, 10);
    frond(3, 20);
    frond(23, 20);
    frond(13, 0);
    circle(ctx, 13, 15, 4, "#57bf82");
    px(ctx, 11, 13, 4, 3, "#c9a24a"); // dates
  });

  // Red telephone box (London)
  createTex(scene, "o_phonebox", 14, 30, (ctx) => {
    px(ctx, 1, 2, 12, 28, "#c0392b");
    px(ctx, 1, 2, 12, 3, "#9e2b20");
    px(ctx, 2, 6, 10, 16, "#2b2230");
    for (let y = 6; y < 22; y += 4) px(ctx, 2, y, 10, 1, "#c0392b");
    for (let x = 2; x < 12; x += 3) px(ctx, x, 6, 1, 16, "#c0392b");
    px(ctx, 3, 3, 8, 2, "#f4d35e"); // "TELEPHONE"
  });

  // Red double-decker bus (top-down, London)
  createTex(scene, "o_bus_red", 22, 46, (ctx) => {
    px(ctx, 2, 2, 18, 42, "#c0392b");
    px(ctx, 2, 2, 18, 3, "#9e2b20");
    px(ctx, 2, 41, 18, 3, "#9e2b20");
    px(ctx, 4, 6, 14, 5, "#bfe6ff"); // front window
    px(ctx, 4, 34, 14, 5, "#bfe6ff"); // rear window
    for (let y = 14; y < 32; y += 5) px(ctx, 4, y, 14, 3, "#dff0ff"); // side windows (roof view)
    px(ctx, 1, 8, 2, 6, "#2a2230");
    px(ctx, 19, 8, 2, 6, "#2a2230");
    px(ctx, 1, 32, 2, 6, "#2a2230");
    px(ctx, 19, 32, 2, 6, "#2a2230");
  });
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
function house(scene: Phaser.Scene, key: string, roof: string, roofDark: string) {
  createTex(scene, key, 48, 56, (ctx) => {
    // walls
    px(ctx, 4, 22, 40, 34, Palette.wall);
    px(ctx, 4, 22, 40, 2, Palette.wallDark);
    px(ctx, 4, 54, 40, 2, Palette.wallDark);
    // roof
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(24, 2);
    ctx.lineTo(48, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = roofDark;
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(24, 2);
    ctx.lineTo(24, 6);
    ctx.lineTo(4, 24);
    ctx.closePath();
    ctx.fill();
    // door
    px(ctx, 20, 40, 8, 16, Palette.door);
    px(ctx, 26, 48, 1, 2, Palette.gold);
    // windows
    px(ctx, 9, 30, 8, 8, Palette.windowGlass);
    px(ctx, 31, 30, 8, 8, Palette.windowGlass);
    px(ctx, 9, 30, 8, 1, "#8fbfe0");
    px(ctx, 31, 30, 8, 1, "#8fbfe0");
    px(ctx, 12, 30, 2, 8, "#dff0ff");
    px(ctx, 34, 30, 2, 8, "#dff0ff");
  });
}

function buildBuildings(scene: Phaser.Scene) {
  house(scene, "b_house_red", Palette.roofRed, "#c85748");
  house(scene, "b_house_blue", Palette.roofBlue, "#456fc0");
  house(scene, "b_house_purple", Palette.roofPurple, "#8451c0");
  house(scene, "b_house_green", Palette.roofGreen, "#489158");

  createTex(scene, "b_shop", 56, 56, (ctx) => {
    px(ctx, 4, 20, 48, 36, Palette.wall);
    px(ctx, 2, 12, 52, 10, "#e2637a");
    // awning stripes
    for (let x = 4; x < 52; x += 8) px(ctx, x, 22, 4, 4, "#fff");
    for (let x = 4; x < 52; x += 8) px(ctx, x, 22, 4, 4, x % 16 ? "#fff" : "#e2637a");
    px(ctx, 22, 38, 12, 18, Palette.door);
    px(ctx, 8, 30, 10, 8, Palette.windowGlass);
    px(ctx, 38, 30, 10, 8, Palette.windowGlass);
    // heart sign
    px(ctx, 26, 14, 4, 3, "#fff");
  });

  // The Residences — a tall modern Downtown apartment tower
  createTex(scene, "b_tower", 30, 72, (ctx) => {
    px(ctx, 4, 6, 22, 66, "#9fb7c9");
    px(ctx, 4, 6, 22, 2, "#82a0b5");
    px(ctx, 4, 6, 2, 66, "#b6c9d8");
    // rows of lit windows
    for (let y = 12; y < 66; y += 8) {
      for (let x = 8; x < 24; x += 6) {
        px(ctx, x, y, 4, 5, (x + y) % 12 ? "#cfeaff" : "#ffe9a8");
      }
    }
    // rooftop + door
    px(ctx, 6, 2, 18, 4, "#6d879a");
    px(ctx, 12, 64, 6, 8, "#5a6b78");
  });

  // The Residences — Emaar cream/beige apartment towers (Downtown)
  createTex(scene, "b_residence", 26, 84, (ctx) => {
    px(ctx, 2, 6, 22, 78, "#d9c4a0");
    px(ctx, 2, 6, 22, 3, "#c4ad88");
    px(ctx, 2, 6, 3, 78, "#ead7b4");
    px(ctx, 8, 2, 10, 6, "#c4ad88");
    for (let y = 12; y < 78; y += 7)
      for (let x = 6; x < 22; x += 6) {
        px(ctx, x, y, 4, 5, (x + y) % 14 === 0 ? "#ffe9a8" : "#cfe6f5");
        px(ctx, x + 1, y, 1, 5, "#ead7b4");
      }
    px(ctx, 10, 76, 6, 8, "#7a5238");
  });

  // Dubai Mall / Yas Mall — wide modern mall
  createTex(scene, "b_mall", 88, 52, (ctx) => {
    px(ctx, 2, 10, 84, 42, "#e8eef4");
    px(ctx, 2, 10, 84, 4, "#c5d0dc");
    px(ctx, 0, 6, 88, 8, "#2c5f8a");
    px(ctx, 6, 8, 76, 4, "#3d7eb0");
    for (let x = 8; x < 80; x += 10) {
      px(ctx, x, 18, 8, 10, "#bfe6ff");
      px(ctx, x, 32, 8, 10, "#bfe6ff");
    }
    px(ctx, 38, 38, 12, 14, "#5a6b78");
    px(ctx, 40, 8, 8, 4, "#f4c95d");
  });

  // Spinneys — UAE supermarket, dark green + gold wordmark
  createTex(scene, "b_spinneys", 52, 44, (ctx) => {
    px(ctx, 2, 12, 48, 32, "#e8e2d4");
    px(ctx, 0, 4, 52, 12, "#1a5c3a");
    px(ctx, 0, 4, 52, 3, "#147a3c");
    // leaf mark
    ctx.fillStyle = "#c6e86a";
    ctx.beginPath();
    ctx.ellipse(10, 10, 5, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 16, 8, 3, 5, "#f4d35e");
    px(ctx, 20, 8, 3, 5, "#f4d35e");
    px(ctx, 24, 8, 2, 5, "#f4d35e");
    px(ctx, 28, 8, 3, 5, "#f4d35e");
    px(ctx, 32, 8, 3, 5, "#f4d35e");
    px(ctx, 36, 8, 2, 5, "#f4d35e");
    px(ctx, 40, 8, 3, 5, "#f4d35e");
    px(ctx, 8, 20, 14, 10, Palette.windowGlass);
    px(ctx, 30, 20, 14, 10, Palette.windowGlass);
    px(ctx, 22, 32, 10, 12, "#1a5c3a");
  });

  // Waitrose — Magnolias Community Centre supermarket (dark green + gold)
  createTex(scene, "b_waitrose", 64, 48, (ctx) => {
    px(ctx, 2, 14, 60, 34, "#efe8d8");
    px(ctx, 0, 4, 64, 14, "#1f5c38");
    px(ctx, 0, 4, 64, 3, "#2a7a48");
    px(ctx, 6, 8, 6, 6, "#e6c35c");
    px(ctx, 7, 9, 4, 4, "#1f5c38");
    px(ctx, 16, 8, 4, 6, "#f4e6a8");
    px(ctx, 21, 8, 3, 6, "#f4e6a8");
    px(ctx, 25, 8, 4, 6, "#f4e6a8");
    px(ctx, 30, 8, 3, 6, "#f4e6a8");
    px(ctx, 34, 8, 4, 6, "#f4e6a8");
    px(ctx, 39, 8, 3, 6, "#f4e6a8");
    px(ctx, 43, 8, 4, 6, "#f4e6a8");
    px(ctx, 48, 8, 3, 6, "#f4e6a8");
    px(ctx, 52, 8, 4, 6, "#f4e6a8");
    px(ctx, 8, 22, 16, 12, Palette.windowGlass);
    px(ctx, 40, 22, 16, 12, Palette.windowGlass);
    px(ctx, 26, 34, 12, 14, "#1f5c38");
  });

  // ADNOC — red / white / black petrol station + canopy
  createTex(scene, "b_adnoc", 60, 42, (ctx) => {
    px(ctx, 4, 22, 52, 20, "#f4f1ea");
    px(ctx, 2, 8, 56, 16, "#e6e6e6");
    px(ctx, 0, 6, 60, 6, "#c8102e");
    px(ctx, 4, 10, 52, 3, "#000");
    px(ctx, 8, 12, 3, 5, "#c8102e");
    px(ctx, 12, 12, 3, 5, "#fff");
    px(ctx, 16, 12, 3, 5, "#000");
    px(ctx, 20, 12, 3, 5, "#c8102e");
    px(ctx, 24, 12, 3, 5, "#fff");
    px(ctx, 10, 26, 6, 12, "#2a2a2a");
    px(ctx, 28, 26, 6, 12, "#2a2a2a");
    px(ctx, 44, 26, 6, 12, "#2a2a2a");
    px(ctx, 11, 24, 4, 3, "#c8102e");
    px(ctx, 29, 24, 4, 3, "#c8102e");
    px(ctx, 45, 24, 4, 3, "#c8102e");
  });

  // Yas Acres neighbourhood mosque (Ja'mee) — not the Grand Mosque
  createTex(scene, "b_mosque_acres", 72, 58, (ctx) => {
    const white = "#f4f1ea";
    const shade = "#ddd8ce";
    px(ctx, 14, 28, 44, 30, white);
    px(ctx, 14, 28, 44, 3, shade);
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.arc(36, 28, 14, Math.PI, 0);
    ctx.fill();
    px(ctx, 35, 10, 2, 6, "#e9c56a");
    const minaret = (cx: number) => {
      px(ctx, cx - 2, 8, 4, 50, white);
      px(ctx, cx - 3, 18, 6, 2, "#e9c56a");
      ctx.fillStyle = "#e9c56a";
      ctx.beginPath();
      ctx.moveTo(cx - 3, 8);
      ctx.lineTo(cx, 0);
      ctx.lineTo(cx + 3, 8);
      ctx.closePath();
      ctx.fill();
    };
    minaret(10);
    minaret(62);
    px(ctx, 32, 44, 8, 14, "#7a5238");
    ctx.fillStyle = "#7a5238";
    ctx.beginPath();
    ctx.arc(36, 44, 4, Math.PI, 0);
    ctx.fill();
  });

  // University of Wollongong — academic building with a small clock
  createTex(scene, "b_uni", 60, 52, (ctx) => {
    px(ctx, 4, 20, 52, 32, "#e7d8bd");
    px(ctx, 4, 20, 52, 2, "#d3c1a1");
    // pediment
    ctx.fillStyle = "#c9563f";
    ctx.beginPath();
    ctx.moveTo(18, 20);
    ctx.lineTo(30, 8);
    ctx.lineTo(42, 20);
    ctx.closePath();
    ctx.fill();
    // little clock in the pediment
    circle(ctx, 30, 16, 3, "#fff");
    px(ctx, 30, 16, 1, 2, "#333");
    // columns
    for (let x = 8; x < 52; x += 8) px(ctx, x, 24, 4, 24, "#f3e9d6");
    for (let x = 8; x < 52; x += 8) px(ctx, x, 24, 1, 24, "#d3c1a1");
    px(ctx, 6, 22, 48, 2, "#d3c1a1"); // architrave
    px(ctx, 26, 38, 8, 14, "#7a5238"); // door
  });

  createTex(scene, "b_cafe", 56, 52, (ctx) => {
    px(ctx, 4, 18, 48, 34, "#f0e2c8");
    ctx.fillStyle = "#8a5c3b";
    ctx.beginPath();
    ctx.moveTo(2, 20);
    ctx.lineTo(28, 4);
    ctx.lineTo(54, 20);
    ctx.closePath();
    ctx.fill();
    px(ctx, 22, 36, 12, 16, Palette.door);
    px(ctx, 8, 26, 12, 10, Palette.windowGlass);
    px(ctx, 36, 26, 12, 10, Palette.windowGlass);
    px(ctx, 24, 8, 8, 6, "#fff"); // little cup sign
    px(ctx, 25, 9, 6, 4, "#c98aa8");
  });
}

// ---------------------------------------------------------------------------
// City-specific buildings — so every place has its own architecture. These are
// tall so a row of them reads as a proper skyline behind the streets.
// ---------------------------------------------------------------------------
function glassTower(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  glass: string,
  glassD: string,
  lit: string,
) {
  createTex(scene, key, w, h, (ctx) => {
    px(ctx, 0, 4, w, h - 4, glassD);
    px(ctx, 2, 4, w - 4, h - 4, glass);
    // rooftop cap
    px(ctx, Math.floor(w * 0.25), 0, Math.floor(w * 0.5), 6, glassD);
    // vertical mullions
    for (let x = 4; x < w - 3; x += 5) px(ctx, x, 6, 1, h - 8, glassD);
    // window rows, some lit
    for (let y = 9; y < h - 4; y += 7)
      for (let x = 4; x < w - 5; x += 5)
        px(ctx, x + 1, y, 3, 4, (x + y) % 3 === 0 ? lit : (x * y) % 5 === 0 ? "#e9f7ff" : glass);
  });
}

function pitchedHouse(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  wall: string,
  wallLine: string,
  roof: string,
  roofD: string,
  opts: { brick?: boolean; chimney?: boolean } = {},
) {
  createTex(scene, key, w, h, (ctx) => {
    const roofH = Math.floor(h * 0.28);
    // walls
    px(ctx, 2, roofH, w - 4, h - roofH, wall);
    if (opts.brick) for (let y = roofH + 4; y < h - 2; y += 5) px(ctx, 2, y, w - 4, 1, wallLine);
    // chimney
    if (opts.chimney) px(ctx, w - 12, 2, 6, roofH + 4, roofD);
    // roof
    px(ctx, 0, roofH - 4, w, 6, roofD);
    px(ctx, 0, roofH - 4, w, 2, roof);
    px(ctx, 2, roofH - 8, w - 4, 5, roof);
    // windows (2x2)
    const winW = Math.floor((w - 16) / 2);
    const win = (x: number, y: number) => {
      px(ctx, x, y, winW, 12, "#efe3c6");
      px(ctx, x + 1, y + 1, winW - 2, 9, "#bfe6ff");
      px(ctx, x + Math.floor(winW / 2), y + 1, 1, 9, "#efe3c6");
      px(ctx, x + 1, y + 4, winW - 2, 1, "#efe3c6");
    };
    win(6, roofH + 6);
    win(w - 6 - winW, roofH + 6);
    win(6, roofH + 22);
    win(w - 6 - winW, roofH + 22);
    // door
    px(ctx, Math.floor(w / 2) - 5, h - 16, 10, 16, "#3a2b3a");
    px(ctx, Math.floor(w / 2) + 3, h - 9, 1, 2, "#f4c95d");
  });
}

function buildCityBuildings(scene: Phaser.Scene) {
  // Dubai — glass skyscrapers
  glassTower(scene, "b_glass_a", 28, 118, "#5aa0bf", "#3f7d97", "#ffe9a8");
  glassTower(scene, "b_glass_b", 34, 96, "#6bb3c9", "#4a8aa0", "#cfeaff");
  glassTower(scene, "b_glass_c", 24, 78, "#7fc0d1", "#579aa8", "#ffe9a8");

  // London — Georgian brick townhouses
  pitchedHouse(scene, "b_townhouse_red", 46, 64, "#a5462f", "#8a3a26", "#4a2c1e", "#382116", { brick: true, chimney: true });
  pitchedHouse(scene, "b_townhouse_cream", 46, 64, "#e4d3b0", "#cdb98f", "#5a5560", "#454049", { brick: false, chimney: true });

  // Edinburgh — tall grey stone tenement
  createTex(scene, "b_tenement", 42, 98, (ctx) => {
    const stone = "#9a958a";
    const stoneD = "#807b70";
    px(ctx, 2, 8, 38, 90, stone);
    px(ctx, 2, 8, 38, 3, "#a9a498");
    for (let y = 12; y < 96; y += 6) px(ctx, 2, y, 38, 1, stoneD);
    // chimney stack row
    px(ctx, 6, 0, 30, 10, stoneD);
    for (let x = 8; x < 34; x += 6) px(ctx, x, 0, 3, 6, "#5f5a50");
    // 4 storeys of windows
    for (let y = 16; y < 90; y += 20)
      for (let x = 7; x < 36; x += 11) {
        px(ctx, x, y, 7, 12, "#efe3c6");
        px(ctx, x + 1, y + 1, 5, 9, "#9fc2d6");
        px(ctx, x + 3, y + 1, 1, 9, "#efe3c6");
      }
    px(ctx, 18, 84, 8, 14, "#3a2b3a"); // door
  });

  // Germany — colourful timber-framed (Fachwerk) houses
  const fachwerk = (key: string, wall: string, roof: string, roofD: string) =>
    createTex(scene, key, 40, 68, (ctx) => {
      const beam = "#5f4227";
      px(ctx, 2, 22, 36, 46, wall);
      // steep roof
      px(ctx, 0, 24, 40, 4, roofD);
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(20, 2);
      ctx.lineTo(40, 24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = roofD;
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(20, 2);
      ctx.lineTo(20, 6);
      ctx.lineTo(6, 24);
      ctx.closePath();
      ctx.fill();
      // timber frame
      px(ctx, 2, 22, 36, 2, beam);
      px(ctx, 2, 44, 36, 2, beam);
      px(ctx, 2, 66, 36, 2, beam);
      px(ctx, 2, 22, 2, 46, beam);
      px(ctx, 36, 22, 2, 46, beam);
      px(ctx, 19, 22, 2, 46, beam);
      // diagonal braces
      ctx.strokeStyle = beam;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 44);
      ctx.lineTo(18, 24);
      ctx.moveTo(38, 44);
      ctx.lineTo(22, 24);
      ctx.stroke();
      // windows
      px(ctx, 7, 28, 8, 8, "#bfe6ff");
      px(ctx, 25, 28, 8, 8, "#bfe6ff");
      // door
      px(ctx, 16, 52, 8, 16, "#6a4a2f");
    });
  fachwerk("b_fachwerk_a", "#f0e6d2", "#c25a3f", "#a4472f");
  fachwerk("b_fachwerk_b", "#e7d7a8", "#3f7d5a", "#2f6146");

  // UAE — flat-roofed sandy villa with arches + small dome
  createTex(scene, "b_villa_sand", 56, 54, (ctx) => {
    const sand = "#e6cf9f";
    const sandD = "#d2b77e";
    px(ctx, 4, 16, 48, 38, sand);
    px(ctx, 2, 12, 52, 6, sandD); // parapet
    for (let x = 4; x < 52; x += 6) px(ctx, x, 12, 3, 3, sand); // crenellations
    // small dome
    ctx.fillStyle = "#e8dcc2";
    ctx.beginPath();
    ctx.arc(28, 12, 8, Math.PI, 0);
    ctx.fill();
    px(ctx, 27, 2, 2, 3, "#c9a24a");
    // arched windows
    const arch = (x: number) => {
      px(ctx, x, 26, 8, 14, "#9fbcd0");
      ctx.fillStyle = sandD;
      ctx.beginPath();
      ctx.arc(x + 4, 26, 4, Math.PI, 0);
      ctx.fill();
      px(ctx, x + 3, 22, 2, 4, "#9fbcd0");
    };
    arch(10);
    arch(38);
    // door (arched)
    px(ctx, 24, 40, 9, 14, "#7a5238");
    ctx.fillStyle = "#7a5238";
    ctx.beginPath();
    ctx.arc(28, 40, 4, Math.PI, 0);
    ctx.fill();
  });

  // Yas Magnolias — white walls, terracotta tiled roofs (three cousins, not clones)
  const yasVilla = (
    key: string,
    w: number,
    h: number,
    wall: string,
    wallD: string,
    roof: string,
    roofD: string,
    extra: "garage" | "wing" | "none",
  ) =>
    createTex(scene, key, w, h, (ctx) => {
      const roofH = 16;
      px(ctx, 6, roofH, w - 12, h - roofH, wall);
      px(ctx, 6, roofH, w - 12, 3, wallD);
      px(ctx, 4, roofH - 2, w - 8, 8, roofD);
      px(ctx, 2, roofH - 6, w - 4, 6, roof);
      px(ctx, 8, roofH - 10, w - 16, 5, roofD);
      if (extra === "garage") {
        px(ctx, w - 18, roofH + 18, 14, h - roofH - 18, wallD);
        px(ctx, w - 16, h - 10, 10, 8, "#4a3a32");
      }
      if (extra === "wing") {
        px(ctx, 2, roofH + 8, 12, h - roofH - 10, wall);
        px(ctx, 2, roofH + 4, 14, 5, roof);
      }
      px(ctx, 10, roofH + 8, 8, 10, "#bfe6ff");
      px(ctx, w - 20, roofH + 8, 8, 10, "#bfe6ff");
      px(ctx, Math.floor(w / 2) - 5, h - 16, 10, 16, "#7a5238");
      px(ctx, Math.floor(w / 2) + 3, h - 10, 2, 2, "#f4c95d");
    });
  yasVilla("b_villa_terra", 52, 50, "#f4eee4", "#e4d8c8", "#c45c32", "#a84828", "none");
  yasVilla("b_villa_terra2", 60, 54, "#efe6d4", "#dccdb4", "#d0663a", "#b05028", "wing");
  yasVilla("b_villa_terra3", 56, 52, "#f7f0e6", "#e8dcc8", "#b84a28", "#933c20", "garage");

  // Occasional modern flat-roof villa in the same neighbourhoods
  createTex(scene, "b_villa_modern", 54, 48, (ctx) => {
    px(ctx, 4, 10, 46, 38, "#ece7dc");
    px(ctx, 2, 8, 50, 6, "#3a3a3a");
    px(ctx, 8, 16, 16, 12, "#bfe6ff");
    px(ctx, 30, 16, 14, 12, "#bfe6ff");
    px(ctx, 8, 32, 10, 8, "#cfeaff");
    px(ctx, 22, 36, 10, 12, "#5a6b78");
  });

  // Damac Santorini — white townhouse, blue door / shutters
  createTex(scene, "b_town_blue", 44, 58, (ctx) => {
    px(ctx, 4, 16, 36, 42, "#f7f4ee");
    px(ctx, 4, 16, 36, 3, "#e6e0d4");
    px(ctx, 2, 12, 40, 8, "#f7f4ee");
    ctx.fillStyle = "#2f6fd0";
    ctx.beginPath();
    ctx.arc(22, 14, 8, Math.PI, 0);
    ctx.fill();
    px(ctx, 8, 24, 8, 12, "#2f6fd0");
    px(ctx, 28, 24, 8, 12, "#2f6fd0");
    px(ctx, 9, 26, 6, 8, "#cfeaff");
    px(ctx, 29, 26, 6, 8, "#cfeaff");
    px(ctx, 16, 42, 12, 16, "#1e4fa8");
    px(ctx, 24, 50, 2, 2, "#f4c95d");
  });
  createTex(scene, "b_town_blue2", 40, 52, (ctx) => {
    px(ctx, 3, 12, 34, 40, "#fff8ef");
    px(ctx, 3, 12, 34, 4, "#2f6fd0");
    px(ctx, 7, 20, 8, 10, "#bfe6ff");
    px(ctx, 25, 20, 8, 10, "#bfe6ff");
    px(ctx, 14, 36, 12, 16, "#2f6fd0");
  });

  // DSO S.O.2 — beige mid-rise apartment
  createTex(scene, "b_so2", 48, 88, (ctx) => {
    px(ctx, 2, 8, 44, 80, "#d8c4a4");
    px(ctx, 2, 8, 44, 4, "#c4ad88");
    px(ctx, 10, 2, 28, 8, "#c4ad88");
    for (let y = 16; y < 80; y += 8)
      for (let x = 8; x < 42; x += 8) px(ctx, x, y, 5, 5, (x + y) % 16 ? "#cfeaff" : "#ffe9a8");
    px(ctx, 18, 78, 12, 10, "#5a6b78");
    px(ctx, 14, 4, 4, 5, "#3a2b3a");
    px(ctx, 20, 4, 4, 5, "#3a2b3a");
    px(ctx, 26, 4, 3, 5, "#3a2b3a");
  });
  createTex(scene, "b_so1", 44, 80, (ctx) => {
    px(ctx, 2, 10, 40, 70, "#cbb79a");
    px(ctx, 2, 10, 40, 3, "#b39e80");
    for (let y = 16; y < 72; y += 8)
      for (let x = 8; x < 38; x += 8) px(ctx, x, y, 5, 5, "#cfe6f5");
    px(ctx, 16, 70, 12, 10, "#5a6b78");
  });

  // Dean Village — 18 Well Court, red sandstone courtyard
  createTex(scene, "b_wellcourt", 64, 78, (ctx) => {
    const stone = "#b05a3f";
    const stoneD = "#8f4530";
    px(ctx, 2, 18, 60, 60, stone);
    px(ctx, 2, 18, 60, 4, stoneD);
    px(ctx, 24, 4, 16, 18, stoneD);
    px(ctx, 26, 0, 12, 8, "#5a4030");
    for (let y = 24; y < 70; y += 12)
      for (let x = 8; x < 56; x += 12) {
        px(ctx, x, y, 8, 10, "#efe3c6");
        px(ctx, x + 1, y + 1, 6, 7, "#9fc2d6");
      }
    px(ctx, 26, 64, 12, 14, "#3a2b3a");
  });

  // Saddle coffee — brown kiosk / truck window
  createTex(scene, "b_saddle", 44, 36, (ctx) => {
    px(ctx, 2, 10, 40, 26, "#6b4a32");
    px(ctx, 0, 6, 44, 8, "#4a3222");
    px(ctx, 8, 14, 16, 10, "#efe3c6");
    px(ctx, 10, 16, 12, 6, "#cfeaff");
    px(ctx, 28, 16, 10, 14, "#3a2b3a");
    px(ctx, 6, 8, 4, 4, "#f4c95d");
  });

  // Saadiyat salon
  createTex(scene, "b_salon", 52, 42, (ctx) => {
    px(ctx, 2, 10, 48, 32, "#fff4f0");
    px(ctx, 0, 6, 52, 10, "#f4a6c0");
    px(ctx, 8, 16, 14, 10, "#cfeaff");
    px(ctx, 30, 16, 14, 10, "#cfeaff");
    px(ctx, 20, 28, 12, 14, "#e46d94");
    px(ctx, 10, 8, 4, 4, "#fff");
  });

  createTex(scene, "o_foodtruck", 48, 32, (ctx) => {
    px(ctx, 4, 10, 36, 18, "#e8b84a");
    px(ctx, 2, 8, 40, 6, "#d4a230");
    px(ctx, 10, 14, 14, 8, "#cfeaff");
    px(ctx, 38, 16, 8, 12, "#3a2b3a");
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.arc(12, 30, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(34, 30, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Amman — stacked sandstone hillside house
  createTex(scene, "b_sandstone", 46, 60, (ctx) => {
    const sand = "#ddc79b";
    const sandD = "#c6ac79";
    px(ctx, 2, 22, 42, 38, sand);
    px(ctx, 2, 12, 26, 12, sandD); // upper stacked block
    px(ctx, 2, 22, 42, 2, sandD);
    for (let y = 26; y < 58; y += 6) px(ctx, 2, y, 42, 1, "#cbb385");
    // windows
    for (let y = 28; y < 54; y += 12)
      for (let x = 8; x < 40; x += 12) px(ctx, x, y, 7, 8, "#8fb0c6");
    px(ctx, 6, 14, 6, 8, "#8fb0c6");
    px(ctx, 20, 46, 9, 14, "#6a5535"); // door
  });

  // Leicester — brick terrace
  pitchedHouse(scene, "b_terrace_brick", 42, 58, "#b05a3f", "#8f4530", "#4a2c1e", "#382116", { brick: true, chimney: true });
}

// ---------------------------------------------------------------------------
// Landmarks — big, recognisable silhouettes for each city. Drawn tall so they
// tower over the streets and read instantly as "that place".
// ---------------------------------------------------------------------------
function buildLandmarks(scene: Phaser.Scene) {
  // ---- Big Ben (London): tall Gothic clock tower ----
  createTex(scene, "lm_bigben", 44, 150, (ctx) => {
    const stone = "#c6a463";
    const stoneD = "#a9853f";
    const trim = "#8a6b3a";
    // tower shaft
    px(ctx, 12, 40, 20, 110, stone);
    px(ctx, 12, 40, 3, 110, stoneD);
    px(ctx, 29, 40, 3, 110, stoneD);
    px(ctx, 15, 40, 2, 110, trim);
    px(ctx, 27, 40, 2, 110, trim);
    // lancet windows down the shaft
    for (let y = 74; y < 146; y += 18) {
      px(ctx, 19, y, 6, 12, "#5c4626");
      px(ctx, 20, y + 1, 4, 8, "#a9c7dd");
      px(ctx, 21, y + 1, 2, 8, "#cfe6f5");
    }
    // clock stage
    px(ctx, 9, 34, 26, 22, stone);
    px(ctx, 9, 34, 26, 2, stoneD);
    px(ctx, 12, 36, 20, 18, "#efe3c6"); // clock face bg
    circle(ctx, 22, 45, 8, "#fff");
    circle(ctx, 22, 45, 8, "#fbf6e8");
    px(ctx, 22, 45, 1, 8, "#333"); // minute hand
    px(ctx, 22, 40, 5, 1, "#333"); // hour hand
    circle(ctx, 22, 45, 1, "#333");
    // belfry
    px(ctx, 8, 22, 28, 12, stoneD);
    for (let x = 11; x < 33; x += 6) px(ctx, x, 24, 3, 8, "#4a3a24");
    // spire
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(8, 22);
    ctx.lineTo(22, 0);
    ctx.lineTo(36, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9c7c46";
    ctx.beginPath();
    ctx.moveTo(8, 22);
    ctx.lineTo(22, 0);
    ctx.lineTo(22, 6);
    ctx.lineTo(14, 22);
    ctx.closePath();
    ctx.fill();
    px(ctx, 21, 0, 2, 5, "#f4c95d");
  });

  // ---- Edinburgh Castle: multi-tower fortress on a crag ----
  createTex(scene, "lm_castle", 122, 96, (ctx) => {
    // crag
    ctx.fillStyle = "#6f6a5c";
    ctx.beginPath();
    ctx.moveTo(0, 96);
    ctx.lineTo(10, 78);
    ctx.lineTo(112, 78);
    ctx.lineTo(122, 96);
    ctx.closePath();
    ctx.fill();
    px(ctx, 0, 90, 122, 6, "#5f5a4e");
    const wall = "#9aa0ab";
    const wallD = "#7f8794";
    // curtain wall
    px(ctx, 10, 44, 102, 36, wall);
    px(ctx, 10, 44, 102, 3, "#aeb4be");
    for (let x = 12; x < 110; x += 8) px(ctx, x, 40, 4, 6, wall); // battlements
    // windows in wall
    for (let x = 22; x < 100; x += 12) {
      px(ctx, x, 54, 4, 8, "#3a2b3a");
      px(ctx, x, 66, 4, 6, "#3a2b3a");
    }
    // gate
    px(ctx, 54, 60, 14, 20, "#2b2230");
    ctx.fillStyle = "#2b2230";
    ctx.beginPath();
    ctx.arc(61, 60, 7, Math.PI, 0);
    ctx.fill();
    // towers (varying heights)
    const tower = (x: number, top: number, w: number) => {
      px(ctx, x, top, w, 80 - top + 20, wallD);
      px(ctx, x, top, 2, 80 - top + 20, "#6d7581");
      for (let bx = x; bx < x + w; bx += 5) px(ctx, bx, top - 4, 3, 5, wallD);
      // conical roof
      ctx.fillStyle = "#4f6fae";
      ctx.beginPath();
      ctx.moveTo(x - 2, top - 4);
      ctx.lineTo(x + w / 2, top - 18);
      ctx.lineTo(x + w + 2, top - 4);
      ctx.closePath();
      ctx.fill();
      px(ctx, x + w / 2 - 1, top - 24, 2, 8, "#3a2b3a");
      px(ctx, x + w / 2, top - 24, 4, 3, "#e2637a"); // flag
    };
    tower(6, 30, 16);
    tower(100, 24, 16);
    tower(52, 16, 18);
  });

  // ---- Burj Khalifa (Dubai): towering tapered spire ----
  createTex(scene, "lm_burj", 44, 170, (ctx) => {
    const glass = "#bcd6e8";
    const glassD = "#93b7d1";
    const setbacks = 60;
    for (let i = 0; i < setbacks; i++) {
      // tapered width, with occasional step-ins for the spiralling setbacks
      let w = 34 - Math.floor((i / setbacks) * 28);
      if (i > 20 && i % 7 === 0) w -= 2;
      w = Math.max(4, w);
      const x = 22 - Math.floor(w / 2);
      const y = 170 - (i + 1) * 2.4;
      px(ctx, x, y, w, 3, i % 2 ? glass : glassD);
      // vertical window seams
      if (w > 8) {
        px(ctx, x + 2, y, 1, 3, glassD);
        px(ctx, x + w - 3, y, 1, 3, glassD);
        px(ctx, x + Math.floor(w / 2), y, 1, 3, glassD);
      }
    }
    // antenna spire
    px(ctx, 21, 2, 2, 30, "#dff0ff");
    px(ctx, 20, 0, 4, 4, "#fff");
  });

  // ---- Amman Citadel: Roman columns + Umayyad arch on a hill ----
  createTex(scene, "lm_citadel", 100, 62, (ctx) => {
    const sand = "#dcc79c";
    const sandD = "#c7b083";
    const light = "#e8d8b2";
    px(ctx, 2, 46, 96, 16, sandD); // ruined base / hill
    px(ctx, 2, 46, 96, 2, "#b89f72");
    // Temple of Hercules columns
    for (let x = 8; x < 66; x += 13) {
      px(ctx, x, 12, 7, 34, light);
      px(ctx, x + 1, 12, 2, 34, "#f2e6c8");
      px(ctx, x - 2, 9, 11, 3, sand); // capital
      px(ctx, x - 2, 44, 11, 3, sand); // base
    }
    px(ctx, 4, 6, 66, 4, sandD); // architrave
    // Umayyad palace domed hall on the right
    px(ctx, 72, 24, 24, 22, light);
    ctx.fillStyle = sandD;
    ctx.beginPath();
    ctx.arc(84, 24, 12, Math.PI, 0);
    ctx.fill();
    px(ctx, 80, 30, 8, 16, "#6a5535"); // arched doorway
    ctx.fillStyle = "#6a5535";
    ctx.beginPath();
    ctx.arc(84, 30, 4, Math.PI, 0);
    ctx.fill();
  });

  // ---- Sheikh Zayed Grand Mosque (Abu Dhabi): grand white domes + minarets ----
  createTex(scene, "lm_mosque", 132, 104, (ctx) => {
    const white = "#f6f3ea";
    const shade = "#e2e4e9";
    const shadeD = "#cdd0d8";
    const gold = "#e9c56a";
    // main prayer hall
    px(ctx, 26, 60, 80, 44, white);
    px(ctx, 26, 60, 80, 3, shade);
    // arched arcade along the front
    for (let x = 30; x < 102; x += 12) {
      px(ctx, x, 78, 8, 26, shade);
      ctx.fillStyle = "#c7cbd2";
      ctx.beginPath();
      ctx.arc(x + 4, 82, 4, Math.PI, 0);
      ctx.fill();
      px(ctx, x + 2, 82, 4, 22, "#b9bdc6");
    }
    // grand central dome
    const dome = (cx: number, cy: number, r: number) => {
      ctx.fillStyle = white;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.fill();
      px(ctx, cx - r, cy, r * 2, 5, white);
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.4);
      ctx.fill();
      ctx.fillStyle = shadeD;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 1.75, Math.PI * 2);
      ctx.fill();
      px(ctx, cx - 1, cy - r - 8, 2, 8, gold); // finial
      px(ctx, cx - 2, cy - r - 10, 4, 3, gold);
    };
    dome(66, 52, 20);
    dome(38, 60, 11);
    dome(94, 60, 11);
    // four minarets
    [8, 40, 92, 124].forEach((cx, i) => {
      const tall = i === 0 || i === 3 ? 92 : 74;
      const top = 104 - tall;
      px(ctx, cx - 3, top, 6, tall, white);
      px(ctx, cx - 3, top, 2, tall, shade);
      px(ctx, cx - 4, top + 14, 8, 3, gold);
      px(ctx, cx - 4, top + 30, 8, 3, gold);
      // balcony + cap
      px(ctx, cx - 4, top - 2, 8, 3, shadeD);
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(cx - 4, top - 2);
      ctx.lineTo(cx, top - 12);
      ctx.lineTo(cx + 4, top - 2);
      ctx.closePath();
      ctx.fill();
      px(ctx, cx - 1, top - 18, 2, 6, gold);
    });
    // grand doorway
    px(ctx, 60, 88, 12, 16, "#b79a6a");
    ctx.fillStyle = "#b79a6a";
    ctx.beginPath();
    ctx.arc(66, 88, 6, Math.PI, 0);
    ctx.fill();
  });

  // ---- Brandenburg Gate (Germany): neoclassical, columns + quadriga ----
  createTex(scene, "lm_brandenburg", 116, 84, (ctx) => {
    const stone = "#dccda9";
    const stoneD = "#c3b48c";
    const stoneL = "#e8ddc2";
    // base platform
    px(ctx, 2, 78, 112, 6, stoneD);
    // two column screens (6 columns each side of the central passage)
    for (let x = 8; x <= 100; x += 12) {
      if (x > 40 && x < 72) continue; // central taller archway gap
      px(ctx, x, 26, 8, 52, stone);
      px(ctx, x, 26, 2, 52, stoneL);
      px(ctx, x + 6, 26, 2, 52, stoneD);
      px(ctx, x - 1, 24, 10, 3, stoneD); // capital
      px(ctx, x - 1, 76, 10, 3, stoneD); // base
    }
    // central passage columns (taller)
    px(ctx, 42, 20, 8, 58, stone);
    px(ctx, 66, 20, 8, 58, stone);
    // entablature
    px(ctx, 4, 16, 108, 12, stoneL);
    px(ctx, 4, 16, 108, 3, stone);
    px(ctx, 2, 14, 112, 3, stoneD);
    // triglyph detailing
    for (let x = 8; x < 108; x += 8) px(ctx, x, 20, 2, 6, stoneD);
    // quadriga (chariot + 4 horses)
    px(ctx, 48, 6, 20, 8, "#8a7850");
    for (let hx = 46; hx <= 64; hx += 6) {
      px(ctx, hx, 2, 4, 10, "#7a6a44");
      px(ctx, hx + 3, 4, 2, 4, "#7a6a44");
    }
    px(ctx, 56, 0, 2, 6, "#9c8a5c"); // charioteer
    px(ctx, 54, 2, 6, 2, "#9c8a5c");
  });

  // Frankfurt Römer — stepped-gable town hall on Römerberg
  createTex(scene, "lm_roemer", 72, 80, (ctx) => {
    const wall = "#c45c3a";
    const wallD = "#a84828";
    px(ctx, 8, 28, 56, 52, wall);
    px(ctx, 8, 28, 56, 4, wallD);
    ctx.fillStyle = wallD;
    ctx.beginPath();
    ctx.moveTo(8, 28);
    ctx.lineTo(20, 6);
    ctx.lineTo(32, 28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, 28);
    ctx.lineTo(36, 2);
    ctx.lineTo(48, 28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40, 28);
    ctx.lineTo(52, 8);
    ctx.lineTo(64, 28);
    ctx.closePath();
    ctx.fill();
    for (let y = 34; y < 72; y += 12)
      for (let x = 14; x < 58; x += 12) px(ctx, x, y, 7, 8, "#cfeaff");
    px(ctx, 30, 66, 12, 14, "#3a2b3a");
  });

  // ---- Leicester Clock Tower: ornate Gothic memorial spire ----
  createTex(scene, "lm_clocktower", 34, 92, (ctx) => {
    const stone = "#bdb6a6";
    const stoneD = "#a49c8a";
    const stoneL = "#d0cabb";
    // stepped base
    px(ctx, 4, 78, 26, 14, stoneD);
    px(ctx, 7, 70, 20, 10, stone);
    // shaft
    px(ctx, 9, 30, 16, 42, stone);
    px(ctx, 9, 30, 2, 42, stoneL);
    px(ctx, 23, 30, 2, 42, stoneD);
    // four clock faces area
    px(ctx, 7, 32, 20, 16, stoneL);
    px(ctx, 10, 34, 14, 12, "#efe7d2");
    circle(ctx, 17, 40, 5, "#fff");
    px(ctx, 17, 40, 1, 5, "#333");
    px(ctx, 17, 36, 4, 1, "#333");
    // decorative bands
    px(ctx, 7, 52, 20, 2, stoneD);
    px(ctx, 7, 62, 20, 2, stoneD);
    // corner pinnacles
    px(ctx, 5, 24, 3, 10, stoneD);
    px(ctx, 26, 24, 3, 10, stoneD);
    // gothic spire
    ctx.fillStyle = "#8f8878";
    ctx.beginPath();
    ctx.moveTo(8, 30);
    ctx.lineTo(17, 2);
    ctx.lineTo(26, 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a49c8a";
    ctx.beginPath();
    ctx.moveTo(8, 30);
    ctx.lineTo(17, 2);
    ctx.lineTo(17, 8);
    ctx.lineTo(12, 30);
    ctx.closePath();
    ctx.fill();
    px(ctx, 16, 0, 2, 5, "#f4c95d");
  });
}

// ---------------------------------------------------------------------------
// Vehicles (top-down cars)
// ---------------------------------------------------------------------------
function car(scene: Phaser.Scene, key: string, body: string, bodyDark: string) {
  // drawn pointing UP (north). 20 wide x 34 tall.
  createTex(scene, key, 20, 34, (ctx) => {
    px(ctx, 3, 2, 14, 30, body);
    px(ctx, 3, 2, 14, 2, bodyDark);
    px(ctx, 3, 30, 14, 2, bodyDark);
    // windows
    px(ctx, 5, 6, 10, 6, "#bfe6ff");
    px(ctx, 5, 20, 10, 6, "#bfe6ff");
    // roof strip
    px(ctx, 5, 13, 10, 6, bodyDark);
    // headlights
    px(ctx, 4, 2, 3, 2, "#fff6c9");
    px(ctx, 13, 2, 3, 2, "#fff6c9");
    // wheels
    px(ctx, 1, 6, 2, 6, "#2a2230");
    px(ctx, 17, 6, 2, 6, "#2a2230");
    px(ctx, 1, 22, 2, 6, "#2a2230");
    px(ctx, 17, 22, 2, 6, "#2a2230");
  });
}

// A chunky top-down Jeep Sport (pointing UP / north). 24 wide x 38 tall.
function jeep(scene: Phaser.Scene, key: string, body: string, bodyDark: string) {
  createTex(scene, key, 24, 38, (ctx) => {
    // boxy body
    px(ctx, 3, 2, 18, 34, body);
    px(ctx, 3, 2, 18, 2, bodyDark);
    px(ctx, 3, 34, 18, 2, bodyDark);
    px(ctx, 3, 2, 2, 34, bodyDark);
    px(ctx, 19, 2, 2, 34, bodyDark);
    // windscreen + rear window
    px(ctx, 6, 7, 12, 6, "#bfe6ff");
    px(ctx, 6, 24, 12, 6, "#bfe6ff");
    // roof with rack lines
    px(ctx, 6, 14, 12, 9, bodyDark);
    px(ctx, 7, 16, 10, 1, body);
    px(ctx, 7, 19, 10, 1, body);
    // 7-slot Jeep grille
    for (let x = 6; x < 18; x += 2) px(ctx, x, 3, 1, 3, "#2a2230");
    // headlights
    px(ctx, 5, 3, 2, 2, "#fff6c9");
    px(ctx, 17, 3, 2, 2, "#fff6c9");
    // spare tyre on the back
    px(ctx, 9, 35, 6, 3, "#2a2230");
    // chunky wheels
    px(ctx, 1, 7, 3, 7, "#1f1a24");
    px(ctx, 20, 7, 3, 7, "#1f1a24");
    px(ctx, 1, 23, 3, 7, "#1f1a24");
    px(ctx, 20, 23, 3, 7, "#1f1a24");
  });
}

// ---------------------------------------------------------------------------
// Furniture (house interior)
// ---------------------------------------------------------------------------
function buildFurniture(scene: Phaser.Scene) {
  createTex(scene, "f_bed", 30, 40, (ctx) => {
    px(ctx, 2, 2, 26, 36, "#c98aa8");
    px(ctx, 4, 4, 22, 14, "#fff4e6"); // pillow area
    px(ctx, 4, 6, 22, 4, "#ffd1e0");
    px(ctx, 4, 18, 22, 18, "#f28ab2");
    px(ctx, 2, 2, 26, 2, "#a86d86");
  });
  createTex(scene, "f_table", 34, 20, (ctx) => {
    px(ctx, 2, 4, 30, 8, Palette.wood);
    px(ctx, 2, 4, 30, 2, Palette.woodDark);
    px(ctx, 4, 12, 3, 7, Palette.woodDark);
    px(ctx, 27, 12, 3, 7, Palette.woodDark);
  });
  createTex(scene, "f_chair", 14, 18, (ctx) => {
    px(ctx, 3, 2, 8, 3, Palette.woodDark);
    px(ctx, 3, 5, 8, 6, Palette.wood);
    px(ctx, 4, 11, 2, 6, Palette.woodDark);
    px(ctx, 8, 11, 2, 6, Palette.woodDark);
  });
  createTex(scene, "f_sofa", 40, 22, (ctx) => {
    px(ctx, 2, 4, 36, 16, "#6d8fe2");
    px(ctx, 2, 2, 36, 4, "#8aa6ea");
    px(ctx, 2, 4, 4, 16, "#5877c0");
    px(ctx, 34, 4, 4, 16, "#5877c0");
    px(ctx, 8, 8, 10, 8, "#8aa6ea");
    px(ctx, 22, 8, 10, 8, "#8aa6ea");
  });
  createTex(scene, "f_tv", 30, 22, (ctx) => {
    px(ctx, 1, 1, 28, 16, "#2a2230");
    px(ctx, 3, 3, 24, 12, "#5cc6e8");
    px(ctx, 5, 5, 8, 4, "#bfe6ff");
    px(ctx, 12, 17, 6, 3, "#3a3f4a");
  });
  createTex(scene, "f_plant", 16, 22, (ctx) => {
    px(ctx, 5, 15, 6, 7, "#c86d4f");
    circle(ctx, 8, 9, 6, "#4b9e4f");
    circle(ctx, 5, 7, 3, "#5cb85f");
    circle(ctx, 11, 8, 3, "#3f8a44");
  });
  createTex(scene, "f_rug", 44, 30, (ctx) => {
    px(ctx, 0, 0, 44, 30, "#e2637a");
    px(ctx, 3, 3, 38, 24, "#f4a6c0");
    px(ctx, 8, 8, 28, 14, "#ffd1e0");
  });
  createTex(scene, "f_fridge", 18, 28, (ctx) => {
    px(ctx, 1, 1, 16, 26, "#eef3f7");
    px(ctx, 1, 1, 16, 2, "#d7e0e8");
    px(ctx, 2, 12, 14, 1, "#c3ccd6");
    px(ctx, 13, 5, 2, 5, "#aab3bd");
    px(ctx, 13, 15, 2, 5, "#aab3bd");
  });
  createTex(scene, "f_bookshelf", 26, 30, (ctx) => {
    px(ctx, 1, 1, 24, 28, Palette.woodDark);
    for (let y = 3; y < 27; y += 8) {
      px(ctx, 3, y, 20, 6, Palette.wood);
      const cols = ["#e2637a", "#5c8ce2", "#5cb06d", "#f4c95d", "#a06de2"];
      for (let x = 4; x < 22; x += 3) px(ctx, x, y, 2, 6, cols[(x + y) % cols.length]);
    }
  });
  createTex(scene, "f_lamp", 12, 26, (ctx) => {
    px(ctx, 5, 6, 2, 20, "#7a6440");
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.moveTo(1, 8);
    ctx.lineTo(11, 8);
    ctx.lineTo(9, 1);
    ctx.lineTo(3, 1);
    ctx.closePath();
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Small UI icons
// ---------------------------------------------------------------------------
function buildUI(scene: Phaser.Scene) {
  createTex(scene, "ui_heart", 14, 12, (ctx) => {
    const on = Palette.heart;
    const grid = [
      "..XX.XX..",
      ".XXXXXXX.",
      ".XXXXXXX.",
      "..XXXXX..",
      "...XXX...",
      "....X....",
    ];
    grid.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === "X") px(ctx, x + 2, y + 2, 1, 1, on);
      }),
    );
  });
  createTex(scene, "ui_coin", 12, 12, (ctx) => {
    circle(ctx, 6, 6, 5, Palette.gold);
    circle(ctx, 6, 6, 3, "#ffe08a");
    px(ctx, 5, 3, 2, 6, "#e0a800");
  });
  createTex(scene, "ui_star", 14, 14, (ctx) => {
    ctx.fillStyle = "#ffe08a";
    const cx = 7,
      cy = 7,
      spikes = 5,
      outer = 6,
      inner = 2.6;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  createTex(scene, "ui_joy_base", 96, 96, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(48, 48, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(48, 48, 44, 0, Math.PI * 2);
    ctx.stroke();
  });
  createTex(scene, "ui_joy_thumb", 48, 48, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(24, 24, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(244,166,192,0.9)";
    ctx.beginPath();
    ctx.arc(24, 24, 12, 0, Math.PI * 2);
    ctx.fill();
  });
  createTex(scene, "ui_btn", 64, 64, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = Palette.pinkDeep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// Public entry point: build EVERYTHING once, in Preload.
// ---------------------------------------------------------------------------
export function buildAllTextures(scene: Phaser.Scene) {
  buildTiles(scene);
  buildProps(scene);
  buildBuildings(scene);
  buildCityBuildings(scene);
  buildLandmarks(scene);
  buildFurniture(scene);
  buildUI(scene);

  car(scene, "v_car_red", "#e2637a", "#bf4a60");
  car(scene, "v_car_blue", "#5c8ce2", "#456fc0");
  jeep(scene, "v_jeep_blue", "#2f6fd0", "#22539f");

  // characters (player + everyone in npcs.ts). Player uses the saved outfit.
  for (const ch of CHARACTERS) {
    makeCharacterTexture(scene, `char_${ch.id}`, ch.colors);
    makeCharacterAnims(scene, `char_${ch.id}`);
  }
}

/** Rebuild the player's texture after an outfit change. */
export function rebuildPlayerTexture(scene: Phaser.Scene, outfitId: string) {
  const player = CHARACTERS.find((c) => c.id === "her");
  if (!player) return;
  const o = Outfits[outfitId] ?? Outfits.casual;
  const colors = { ...player.colors, top: o.top, topShade: o.topShade, bottom: o.bottom, shoes: o.shoes };
  makeCharacterTexture(scene, "char_her", colors);
  makeCharacterAnims(scene, "char_her");
}
