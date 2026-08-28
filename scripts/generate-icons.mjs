// Generates the PWA / home-screen icons as real PNGs (no native deps).
// Draws a cute pixel heart on a soft gradient so the home-screen icon
// matches the game's vibe. Run automatically before dev/build.
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");

// 16 x 13 pixel heart. "X" = heart pixel.
const HEART = [
  "..XXX......XXX..",
  ".XXXXX....XXXXX.",
  "XXXXXXX..XXXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXXX",
  ".XXXXXXXXXXXXXX.",
  "..XXXXXXXXXXXX..",
  "...XXXXXXXXXX...",
  "....XXXXXXXX....",
  ".....XXXXXX.....",
  "......XXXX......",
  ".......XX.......",
];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  const top = [142, 202, 230]; // soft blue  #8ecae6
  const bot = [244, 166, 192]; // soft pink  #f4a6c0
  const heartMain = [255, 92, 138];
  const heartShade = [214, 51, 108];
  const heartHi = [255, 173, 194];

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (size * y + x) << 2;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  };

  // gradient background
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = lerp(top[0], bot[0], t);
    const g = lerp(top[1], bot[1], t);
    const b = lerp(top[2], bot[2], t);
    for (let x = 0; x < size; x++) set(x, y, r, g, b);
  }

  // heart, centered, occupying ~66% of the icon
  const cols = HEART[0].length;
  const rows = HEART.length;
  const scale = Math.floor((size * 0.66) / cols);
  const drawW = cols * scale;
  const drawH = rows * scale;
  const offX = Math.floor((size - drawW) / 2);
  const offY = Math.floor((size - drawH) / 2);

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      if (HEART[ry][rx] !== "X") continue;
      // shading: bottom rows darker, a highlight blob near top-left
      let col = heartMain;
      if (ry >= rows - 3) col = heartShade;
      if (rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4) col = heartHi;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          set(offX + rx * scale + px, offY + ry * scale + py, col[0], col[1], col[2]);
        }
      }
    }
  }

  return PNG.sync.write(png);
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["favicon.png", 64],
];

for (const [name, size] of targets) {
  writeFileSync(join(outDir, name), makeIcon(size));
}

console.log("Generated icons:", targets.map((t) => t[0]).join(", "));
