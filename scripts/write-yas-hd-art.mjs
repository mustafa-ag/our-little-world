import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = (rel, svg) => {
  const p = join(root, "public", rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, svg);
};

const svg = (w, h, inner) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${inner}\n</svg>\n`;

function blob(cx, cy, rx, ry, rot, fill, op = 1) {
  const a = (rot * Math.PI) / 180;
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const j = 0.72 + ((i * 37) % 17) / 40;
    const x = cx + Math.cos(t + a) * rx * j;
    const y = cy + Math.sin(t + a) * ry * j;
    pts.push([x, y]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    const p2 = pts[(i + 2) % n];
    const c1x = p0[0] + (p1[0] - pts[(i + n - 1) % n][0]) / 6;
    const c1y = p0[1] + (p1[1] - pts[(i + n - 1) % n][1]) / 6;
    const c2x = p1[0] - (p2[0] - p0[0]) / 6;
    const c2y = p1[1] - (p2[1] - p0[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
  }
  d += " Z";
  return `<path d="${d}" fill="${fill}" opacity="${op}"/>`;
}

function grass() {
  let g = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#79c862"/><stop offset=".5" stop-color="#6bb856"/><stop offset="1" stop-color="#74c45e"/>
  </linearGradient>
</defs>
<rect width="512" height="512" fill="url(#g)"/>`;
  const cols = ["#5aa346", "#8ed56f", "#4e8f3c", "#9ae07a", "#6aaa4e", "#87d06a", "#c4d46a"];
  for (let i = 0; i < 220; i++) {
    const x = (i * 47 + 11) % 512;
    const y = (i * 89 + 19) % 512;
    g += blob(x, y, 10 + (i % 7), 6 + (i % 5), i * 23, cols[i % cols.length], 0.08 + (i % 6) * 0.02);
  }
  for (let i = 0; i < 90; i++) {
    const x = (i * 51 + 8) % 512;
    const y = (i * 67 + 12) % 512;
    g += `<path d="M${x} ${y} q ${2 + (i % 3)} ${-8 - (i % 4)} ${1} ${-12}" stroke="#3d7a32" stroke-width="1.1" fill="none" opacity=".28"/>`;
  }
  for (let i = 0; i < 14; i++) {
    const x = (i * 89 + 30) % 500;
    const y = (i * 61 + 50) % 500;
    const c = i % 2 ? "#ff8fb3" : "#ffe08a";
    g += `<g transform="translate(${x} ${y})">
      <circle cx="0" cy="0" r="1.6" fill="${c}"/>
      <circle cx="2.4" cy="-0.8" r="1.4" fill="${c}" opacity=".85"/>
      <circle cx="-2.2" cy="-0.9" r="1.4" fill="${c}" opacity=".85"/>
      <circle cx="0" cy="0" r="0.8" fill="#fff3b0"/>
    </g>`;
  }
  return svg(512, 512, g);
}

function grassDetail() {
  let g = `<rect width="256" height="256" fill="#6fbf58" opacity="0"/>`;
  for (let i = 0; i < 16; i++) {
    g += blob(40 + (i % 4) * 55, 40 + Math.floor(i / 4) * 55, 28, 16, i * 20, i % 2 ? "#4e8f3c" : "#8ed56f", 0.35);
  }
  return svg(256, 256, g);
}

function grassTuft() {
  let g = "";
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 12;
    g += `<path d="M${x} 108 C ${x - 4} 70, ${x + 6} 40, ${x + (i % 3) - 1} 18" stroke="#4a8a38" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    g += `<path d="M${x} 108 C ${x + 8} 72, ${x + 14} 48, ${x + 10} 22" stroke="#7ed56a" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/>`;
  }
  g += `<ellipse cx="80" cy="112" rx="48" ry="8" fill="#3a6a30" opacity=".18"/>`;
  return svg(160, 120, g);
}

function pavement() {
  return svg(
    256,
    256,
    `<defs>
  <pattern id="p" width="42" height="42" patternUnits="userSpaceOnUse">
    <rect width="42" height="42" fill="#d7cfc0"/>
    <path d="M1 1h40v40h-40z" fill="none" stroke="#b7ad9c" stroke-width="1.4"/>
    <path d="M8 18h8M22 30h10" stroke="#c9c0b0" stroke-width="1" opacity=".5"/>
  </pattern>
</defs>
<rect width="256" height="256" fill="url(#p)"/>
<rect width="256" height="256" fill="#c4b8a4" opacity=".08"/>
<path d="M0 210h256" stroke="#a89c88" stroke-width="7" opacity=".35"/>
<path d="M18 40c20 8 10 22-4 18" fill="none" stroke="#b0a494" stroke-width="1.2" opacity=".4"/>`,
  );
}

function road() {
  return svg(
    256,
    256,
    `<defs>
  <linearGradient id="r" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#4e535b"/><stop offset=".5" stop-color="#5c626b"/><stop offset="1" stop-color="#4a4f57"/>
  </linearGradient>
</defs>
<rect width="256" height="256" fill="url(#r)"/>
<g opacity=".12" fill="#2a2d32">
  <ellipse cx="40" cy="60" rx="30" ry="12"/><ellipse cx="180" cy="140" rx="40" ry="16"/><ellipse cx="90" cy="210" rx="28" ry="10"/>
</g>
<rect x="0" y="0" width="256" height="10" fill="#c9c0b0"/>
<rect x="0" y="246" width="256" height="10" fill="#b7ad9c"/>
<rect x="0" y="8" width="256" height="4" fill="#8a8274" opacity=".45"/>
<g stroke="#e8d98a" stroke-width="5" stroke-dasharray="22 18" fill="none" opacity=".75">
  <path d="M0 128h256"/>
</g>
<rect x="200" y="30" width="18" height="10" rx="2" fill="#3d4248" opacity=".5"/>`,
  );
}

function sand() {
  let g = `<rect width="256" height="256" fill="#edd4a0"/>`;
  for (let i = 0; i < 50; i++) {
    g += `<circle cx="${(i * 41) % 256}" cy="${(i * 73) % 256}" r="${1 + (i % 3)}" fill="#d4b57a" opacity=".35"/>`;
  }
  g += blob(80, 90, 50, 20, 20, "#f6e2b4", 0.25);
  g += blob(180, 160, 40, 16, -10, "#d8b878", 0.2);
  return svg(256, 256, g);
}

function waterBase() {
  return svg(
    256,
    256,
    `<defs>
  <linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7ed7ef"/><stop offset=".45" stop-color="#3aa8c8"/><stop offset="1" stop-color="#247a9c"/>
  </linearGradient>
</defs>
<rect width="256" height="256" fill="url(#w)"/>
<path d="M-10 70 C40 50,90 90,140 70 S220 40,270 70" fill="none" stroke="#dff6ff" stroke-width="3" opacity=".25"/>
<path d="M-10 140 C50 120,100 160,160 140 S240 110,270 140" fill="none" stroke="#9fe4f5" stroke-width="4" opacity=".2"/>
<path d="M-10 200 C60 180,110 220,170 200 S250 170,270 200" fill="none" stroke="#fff" stroke-width="2" opacity=".15"/>`,
  );
}

function waterWave() {
  return svg(
    256,
    256,
    `<path d="M-20 80 C40 60,80 100,140 80 S220 50,280 80 V256 H-20Z" fill="#9fe4f5" opacity=".18"/>
<path d="M-20 160 C50 140,100 180,170 160 S250 130,280 160 V256 H-20Z" fill="#ffffff" opacity=".08"/>`,
  );
}

function waterShine() {
  return svg(
    256,
    256,
    `<g fill="#fff">
  <ellipse cx="70" cy="60" rx="10" ry="3" opacity=".35"/>
  <ellipse cx="180" cy="110" rx="16" ry="3.5" opacity=".28"/>
  <ellipse cx="40" cy="170" rx="8" ry="2.4" opacity=".3"/>
  <ellipse cx="210" cy="200" rx="12" ry="2.8" opacity=".22"/>
</g>`,
  );
}

function tree(variant) {
  const w = variant === 3 ? 300 : variant === 2 ? 260 : 280;
  const h = variant === 3 ? 350 : variant === 2 ? 340 : 360;
  const lean = variant === 2 ? -8 : variant === 3 ? 10 : 0;
  const greens = variant === 2 ? ["#2f6d38", "#4e9a4a", "#7ed56a", "#24582c"] : variant === 3 ? ["#3a7a32", "#8fbf4a", "#5aaa40", "#2a5a28"] : ["#2d6b34", "#4c9a48", "#86d46a", "#1f4d28"];
  let g = `<ellipse cx="${w / 2 + 8}" cy="${h - 14}" rx="${w * 0.28}" ry="12" fill="#2a2418" opacity=".22"/>`;
  g += `<path d="M${w / 2 + lean} ${h - 18} C ${w / 2 - 10} ${h * 0.55}, ${w / 2 + 6 + lean} ${h * 0.4}, ${w / 2 + lean} ${h * 0.38}" stroke="#6a4224" stroke-width="16" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M${w / 2 - 4 + lean} ${h * 0.62} C ${w / 2 - 28} ${h * 0.5}, ${w / 2 - 36} ${h * 0.48}, ${w / 2 - 22} ${h * 0.44}" stroke="#5a361c" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M${w / 2 + 4 + lean} ${h * 0.58} C ${w / 2 + 26} ${h * 0.48}, ${w / 2 + 34} ${h * 0.46}, ${w / 2 + 20} ${h * 0.42}" stroke="#7a4e2c" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  const clusters = [
    [w * 0.5 + lean, h * 0.28, 78, 58, 0],
    [w * 0.32 + lean, h * 0.34, 54, 42, -20],
    [w * 0.68 + lean, h * 0.33, 52, 40, 18],
    [w * 0.42 + lean, h * 0.22, 40, 32, -8],
    [w * 0.58 + lean, h * 0.2, 38, 30, 12],
    [w * 0.5 + lean, h * 0.38, 60, 36, 6],
    [w * 0.28 + lean, h * 0.42, 36, 28, -30],
    [w * 0.74 + lean, h * 0.4, 34, 26, 24],
    [w * 0.5 + lean, h * 0.16, 28, 22, 0],
  ];
  clusters.forEach((c, i) => {
    g += blob(c[0], c[1], c[2], c[3], c[4], greens[i % greens.length], 0.92);
  });
  g += blob(w * 0.46 + lean, h * 0.2, 22, 14, -20, "#c8f09a", 0.35);
  return svg(w, h, g);
}

function palm(variant) {
  const w = variant === 2 ? 240 : 260;
  const h = variant === 2 ? 380 : 400;
  const lean = variant === 2 ? 14 : -8;
  let g = `<ellipse cx="${w / 2 + 10}" cy="${h - 12}" rx="46" ry="10" fill="#2a2418" opacity=".2"/>`;
  g += `<path d="M${w / 2} ${h - 16} C ${w / 2 + lean * 0.4} ${h * 0.65}, ${w / 2 + lean} ${h * 0.35}, ${w / 2 + lean} ${h * 0.22}" stroke="#c4a06a" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 8; i++) {
    const y = h * 0.28 + i * 22;
    g += `<path d="M${w / 2 + lean - 7} ${y} L ${w / 2 + lean + 7} ${y - 6}" stroke="#8a6238" stroke-width="2"/>`;
  }
  const fronds = variant === 2 ? [-1.5, -1.1, -0.6, -0.1, 0.4, 0.9, 1.35] : [-1.4, -0.95, -0.45, 0.05, 0.5, 1.0, 1.4];
  fronds.forEach((ang, i) => {
    const len = 88 + (i % 3) * 10;
    const x = w / 2 + lean;
    const y = h * 0.2;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len * 0.85 + 20;
    const mx = x + Math.cos(ang - 0.25) * len * 0.55;
    const my = y + Math.sin(ang) * len * 0.4;
    g += `<path d="M${x} ${y} Q ${mx} ${my} ${x2} ${y2} Q ${x + Math.cos(ang + 0.3) * 20} ${y + 8} ${x} ${y}" fill="${i % 2 ? "#2f8a3a" : "#6fbe52"}" opacity=".92"/>`;
  });
  g += `<circle cx="${w / 2 + lean - 6}" cy="${h * 0.22 + 8}" r="5" fill="#6b3a18"/><circle cx="${w / 2 + lean + 6}" cy="${h * 0.22 + 12}" r="4.5" fill="#8a4a20"/>`;
  return svg(w, h, g);
}

function flowerBed() {
  let g = `<ellipse cx="100" cy="100" rx="88" ry="18" fill="#5a4030" opacity=".2"/>
<ellipse cx="100" cy="92" rx="86" ry="22" fill="#6a8f3a"/>`;
  const flowers = [
    [40, 88, "#ff8fb3"],
    [70, 80, "#ffe08a"],
    [100, 84, "#ff8fb3"],
    [130, 78, "#c9a0ff"],
    [160, 86, "#ffe08a"],
    [55, 98, "#fff"],
    [115, 96, "#ff8fb3"],
    [145, 100, "#fff"],
  ];
  for (const [x, y, c] of flowers) {
    g += `<g transform="translate(${x} ${y})">
      <circle cx="-4" cy="-2" r="4" fill="${c}"/><circle cx="4" cy="-2" r="4" fill="${c}"/>
      <circle cx="0" cy="3" r="4" fill="${c}"/><circle cx="0" cy="-5" r="4" fill="${c}"/>
      <circle cx="0" cy="0" r="2.2" fill="#fff3b0"/>
    </g>`;
  }
  return svg(200, 120, g);
}

function lamp() {
  return svg(
    90,
    220,
    `<ellipse cx="45" cy="210" rx="16" ry="5" fill="#2a2418" opacity=".22"/>
<rect x="40" y="70" width="10" height="138" rx="3" fill="#4a4452"/>
<rect x="38" y="68" width="14" height="8" rx="2" fill="#3a3440"/>
<path d="M22 28 h46 l-6 40 H28 z" fill="#3a3440"/>
<ellipse cx="45" cy="48" rx="14" ry="16" fill="#fff4c4"/>
<ellipse cx="45" cy="48" rx="10" ry="12" fill="#ffe08a" opacity=".85"/>
<circle cx="45" cy="48" r="5" fill="#fff"/>`,
  );
}

function fence() {
  return svg(
    128,
    80,
    `<rect x="6" y="36" width="116" height="7" rx="2" fill="#d8c4a0"/>
<rect x="6" y="52" width="116" height="7" rx="2" fill="#c4ae86"/>
${[12, 36, 60, 84, 108]
  .map((x) => `<rect x="${x}" y="18" width="10" height="50" rx="2" fill="#cbb896"/>`)
  .join("")}`,
  );
}

function bench() {
  return svg(
    160,
    90,
    `<ellipse cx="80" cy="82" rx="50" ry="7" fill="#2a2418" opacity=".18"/>
<rect x="18" y="48" width="124" height="12" rx="3" fill="#b8894a"/>
<rect x="22" y="28" width="116" height="10" rx="3" fill="#c99a58"/>
<rect x="28" y="58" width="10" height="22" rx="2" fill="#7a5230"/>
<rect x="122" y="58" width="10" height="22" rx="2" fill="#7a5230"/>`,
  );
}

function yasHome() {
  return svg(
    480,
    420,
    `<ellipse cx="250" cy="404" rx="150" ry="14" fill="#2a2418" opacity=".2"/>
<path d="M40 250 L240 70 L440 250 L420 250 L240 96 L60 250 Z" fill="#c45a2e"/>
<path d="M40 250 L240 70 L240 96 L60 250 Z" fill="#a84422"/>
<path d="M70 248 h340 v150 h-340 z" fill="#f3ead8"/>
<path d="M70 248 h18 v150 h-18 z" fill="#e0d2b8"/>
<path d="M392 248 h18 v150 h-18 z" fill="#d8c8ae"/>
<rect x="70" y="248" width="340" height="14" fill="#e8dcc6"/>
<path d="M28 270 h70 v128 h-70 z" fill="#efe6d4"/>
<path d="M20 262 h86 v16 h-86 z" fill="#c45a2e"/>
<g fill="#8ecae6" stroke="#efe6d4" stroke-width="4">
  <rect x="110" y="278" width="52" height="44" rx="4"/>
  <rect x="318" y="278" width="52" height="44" rx="4"/>
  <rect x="110" y="336" width="40" height="32" rx="3"/>
  <rect x="330" y="336" width="40" height="32" rx="3"/>
</g>
<rect x="118" y="284" width="16" height="14" fill="#fff" opacity=".35"/>
<rect x="326" y="284" width="16" height="14" fill="#fff" opacity=".35"/>
<path d="M208 318 h64 v80 h-64 z" fill="#7a4a30"/>
<circle cx="260" cy="360" r="3.5" fill="#f4c95d"/>
<path d="M208 318 h64 v8 h-64 z" fill="#5a3220"/>
<rect x="220" y="398" width="40" height="6" fill="#c4b49a"/>
<ellipse cx="86" cy="396" rx="22" ry="10" fill="#5aaa40"/>
<ellipse cx="400" cy="396" rx="18" ry="9" fill="#4e9a3a"/>
<rect x="300" y="220" width="10" height="28" fill="#c45a2e"/>`,
  );
}

function mosque() {
  return svg(
    520,
    400,
    `<ellipse cx="260" cy="386" rx="170" ry="12" fill="#2a2418" opacity=".18"/>
<path d="M80 230 h360 v150 h-360 z" fill="#f4ead6"/>
<path d="M80 230 h24 v150 h-24 z" fill="#e6d8bc"/>
<rect x="80" y="230" width="360" height="16" fill="#e8d8b8"/>
<path d="M140 230 A120 90 0 0 1 380 230" fill="#e8d4a8"/>
<path d="M160 230 A100 74 0 0 1 360 230" fill="#f3e6c4"/>
<rect x="252" y="70" width="16" height="70" fill="#c9a24a"/>
<circle cx="260" cy="66" r="10" fill="#c9a24a"/>
<rect x="48" y="250" width="56" height="130" fill="#efe2c6"/>
<rect x="416" y="250" width="56" height="130" fill="#efe2c6"/>
<rect x="66" y="150" width="20" height="100" fill="#e8d4a8"/>
<rect x="434" y="150" width="20" height="100" fill="#e8d4a8"/>
<g fill="#7eb8c8">
  <path d="M150 300 h36 v70 h-36 z"/><path d="M150 300 a18 16 0 0 1 36 0"/>
  <path d="M242 300 h36 v70 h-36 z"/><path d="M242 300 a18 16 0 0 1 36 0"/>
  <path d="M334 300 h36 v70 h-36 z"/><path d="M334 300 a18 16 0 0 1 36 0"/>
</g>
<path d="M236 330 h48 v70 h-48 z" fill="#7a4a30"/>
<circle cx="274" cy="368" r="3" fill="#f4c95d"/>
<ellipse cx="70" cy="378" rx="16" ry="8" fill="#5aaa40"/>`,
  );
}

function jeep() {
  return svg(
    220,
    280,
    `<ellipse cx="110" cy="262" rx="58" ry="12" fill="#1a1820" opacity=".28"/>
<rect x="28" y="70" width="22" height="48" rx="8" fill="#1c1c22"/>
<rect x="170" y="70" width="22" height="48" rx="8" fill="#1c1c22"/>
<rect x="28" y="170" width="22" height="48" rx="8" fill="#1c1c22"/>
<rect x="170" y="170" width="22" height="48" rx="8" fill="#1c1c22"/>
<path d="M40 36 h140 q16 0 16 16 v176 q0 16-16 16 h-140 q-16 0-16-16 v-176 q0-16 16-16z" fill="#2a6fd0"/>
<path d="M40 36 h20 v208 h-20 z" fill="#1e5bb0"/>
<path d="M160 36 h20 v208 h-20 z" fill="#245fc0"/>
<rect x="56" y="56" width="108" height="44" rx="8" fill="#b9e4ff" opacity=".88"/>
<rect x="56" y="168" width="108" height="40" rx="8" fill="#9fd4f2" opacity=".8"/>
<rect x="62" y="108" width="96" height="50" rx="6" fill="#1a4e9a"/>
<g fill="#111318">${[62, 76, 90, 104, 118, 132, 146].map((x) => `<rect x="${x}" y="40" width="6" height="12" rx="1"/>`).join("")}</g>
<rect x="48" y="36" width="22" height="10" rx="3" fill="#fff6c9"/>
<rect x="150" y="36" width="22" height="10" rx="3" fill="#fff6c9"/>
<rect x="48" y="228" width="18" height="8" rx="2" fill="#e46d94"/>
<rect x="154" y="228" width="18" height="8" rx="2" fill="#e46d94"/>
<rect x="70" y="118" width="80" height="4" fill="#2f6fd0" opacity=".5"/>`,
  );
}

function charShadow() {
  return svg(120, 48, `<ellipse cx="60" cy="24" rx="48" ry="12" fill="#2a2418" opacity=".28"/>`);
}
function treeShadow() {
  return svg(200, 80, `<ellipse cx="108" cy="42" rx="86" ry="18" fill="#2a2418" opacity=".22"/>`);
}
function glow() {
  return svg(
    160,
    160,
    `<defs><radialGradient id="lg" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffe7a8" stop-opacity=".7"/>
      <stop offset=".45" stop-color="#ffc066" stop-opacity=".22"/>
      <stop offset="1" stop-color="#ffb040" stop-opacity="0"/>
    </radialGradient></defs>
    <circle cx="80" cy="80" r="78" fill="url(#lg)"/>`,
  );
}

function chibi({ who, face, step }) {
  const juju = who === "juju";
  const skin = juju ? "#f0c49a" : "#d9a679";
  const skinD = juju ? "#daa87c" : "#c08d60";
  const hair = juju ? "#3a251b" : "#33312e";
  const hairD = juju ? "#26160f" : "#1f1d1b";
  const top = juju ? "#f28ab2" : "#5cb06d";
  const topD = juju ? "#d96e98" : "#489158";
  const bot = juju ? "#5b6ee1" : "#3a2b3a";
  const shoe = "#2a2230";
  const lift = step ? 8 : 0;
  const liftR = step ? 0 : 6;
  const sway = face === "side" && step ? 4 : 0;
  const cx = 96 + sway;
  let g = `<ellipse cx="${cx + 4}" cy="242" rx="28" ry="7" fill="#2a2418" opacity=".2"/>`;
  if (face !== "side") {
    g += `<path d="M${cx - 22} ${200 - lift} q 8 22 0 36" stroke="${bot}" stroke-width="13" fill="none" stroke-linecap="round"/>`;
    g += `<path d="M${cx + 16} ${200 - liftR} q 6 22 0 36" stroke="${bot}" stroke-width="13" fill="none" stroke-linecap="round"/>`;
    g += `<ellipse cx="${cx - 20}" cy="${236 - lift}" rx="10" ry="5" fill="${shoe}"/>`;
    g += `<ellipse cx="${cx + 18}" cy="${236 - liftR}" rx="10" ry="5" fill="${shoe}"/>`;
  } else {
    g += `<path d="M${cx - 4} ${198 - lift} q 10 24 2 38" stroke="${bot}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
    g += `<ellipse cx="${cx + 8}" cy="${236 - lift}" rx="12" ry="5" fill="${shoe}"/>`;
  }
  g += `<path d="M${cx - 28} 168 q 0 40 28 44 q 28-4 28-44 q 0-16-28-16 q-28 0-28 16z" fill="${topD}"/>`;
  g += `<path d="M${cx - 24} 166 q 0 36 24 40 q 24-4 24-40 q 0-14-24-14 q-24 0-24 14z" fill="${top}"/>`;
  if (face !== "up") {
    g += `<path d="M${cx - 30} 172 q -8 16 -2 28" stroke="${skin}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    g += `<path d="M${cx + 30} 172 q 8 14 2 ${26 - (step ? 4 : 0)}" stroke="${skin}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
  }
  g += `<ellipse cx="${cx}" cy="108" rx="40" ry="46" fill="${skin}"/>`;
  g += `<ellipse cx="${cx}" cy="128" rx="22" ry="10" fill="${skinD}" opacity=".25"/>`;
  if (face === "up") {
    g += `<path d="M${cx - 42} 118 q 8-70 42-70 q 34 0 42 70 q-16-24-42-24 q-26 0-42 24z" fill="${hair}"/>`;
    g += `<ellipse cx="${cx}" cy="100" rx="38" ry="36" fill="${hair}"/>`;
  } else {
    g += `<path d="M${cx - 44} 100 q 6-62 44-64 q 38 2 44 64 q-8-30-44-30 q-36 0-44 30z" fill="${hair}"/>`;
    g += `<path d="M${cx - 46} 92 q -6 40 8 58 q 10-20 14-40z" fill="${hairD}"/>`;
    g += `<path d="M${cx + 46} 92 q 6 40 -8 58 q -10-20 -14-40z" fill="${hair}"/>`;
    if (juju) g += `<path d="M${cx - 30} 78 q 20 16 36 4 q 8 10-4 16 q-28 6-40-8z" fill="${hair}"/>`;
    const ex = face === "side" ? 8 : 14;
    g += `<ellipse cx="${cx - (face === "side" ? -6 : ex)}" cy="112" rx="4" ry="6" fill="#2a2230"/>`;
    if (face === "down") g += `<ellipse cx="${cx + ex}" cy="112" rx="4" ry="6" fill="#2a2230"/>`;
    g += `<ellipse cx="${cx - 20}" cy="124" rx="7" ry="4" fill="#f7a6b8" opacity=".7"/>`;
    if (face === "down") g += `<ellipse cx="${cx + 20}" cy="124" rx="7" ry="4" fill="#f7a6b8" opacity=".7"/>`;
    g += `<path d="M${cx - 8} 136 q 8 8 16 0" fill="none" stroke="#c07880" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return svg(192, 256, g);
}

function portrait(who) {
  const juju = who === "juju";
  const skin = juju ? "#f0c49a" : "#d9a679";
  const hair = juju ? "#3a251b" : "#33312e";
  const top = juju ? "#f28ab2" : "#5cb06d";
  return svg(
    200,
    250,
    `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff4e8"/><stop offset="1" stop-color="#efd2c0"/>
    </linearGradient></defs>
    <rect width="200" height="250" rx="22" fill="url(#pg)"/>
    <ellipse cx="100" cy="250" rx="80" ry="56" fill="${top}"/>
    <ellipse cx="100" cy="124" rx="58" ry="66" fill="${skin}"/>
    <path d="M42 120 q 10-80 58-82 q 48 2 58 82 q-14-36-58-36 q-44 0-58 36z" fill="${hair}"/>
    <path d="M40 110 q -8 50 12 70 q 12-28 16-50z" fill="${hair}"/>
    <path d="M160 110 q 8 50 -12 70 q -12-28 -16-50z" fill="${hair}"/>
    ${juju ? `<path d="M58 88 q 28 20 50 6 q 10 14-6 20 q-36 8-52-10z" fill="${hair}"/>` : ""}
    <ellipse cx="78" cy="126" rx="5" ry="7" fill="#2a2230"/>
    <ellipse cx="122" cy="126" rx="5" ry="7" fill="#2a2230"/>
    <ellipse cx="64" cy="146" rx="9" ry="5" fill="#f7a6b8" opacity=".65"/>
    <ellipse cx="136" cy="146" rx="9" ry="5" fill="#f7a6b8" opacity=".65"/>
    <path d="M88 164 q 12 12 24 0" fill="none" stroke="#c07880" stroke-width="3" stroke-linecap="round"/>`,
  );
}

out("assets/hd/terrain/grass.svg", grass());
out("assets/hd/terrain/grass-detail-01.svg", grassDetail());
out("assets/hd/terrain/grass-detail-02.svg", grassTuft());
out("assets/hd/terrain/pavement.svg", pavement());
out("assets/hd/terrain/road.svg", road());
out("assets/hd/terrain/sand.svg", sand());
out("assets/hd/terrain/water-base.svg", waterBase());
out("assets/hd/terrain/water-wave.svg", waterWave());
out("assets/hd/terrain/water-shine.svg", waterShine());
out("assets/hd/props/tree-01.svg", tree(1));
out("assets/hd/props/tree-02.svg", tree(2));
out("assets/hd/props/tree-03.svg", tree(3));
out("assets/hd/props/palm-01.svg", palm(1));
out("assets/hd/props/palm-02.svg", palm(2));
out("assets/hd/props/flower-bed.svg", flowerBed());
out("assets/hd/props/street-lamp.svg", lamp());
out("assets/hd/props/fence.svg", fence());
out("assets/hd/props/bench.svg", bench());
out("assets/hd/buildings/yas-home.svg", yasHome());
out("assets/hd/buildings/yas-landmark.svg", mosque());
out("assets/hd/vehicles/jeep.svg", jeep());
out("assets/hd/effects/character-shadow.svg", charShadow());
out("assets/hd/effects/tree-shadow.svg", treeShadow());
out("assets/hd/effects/light-glow.svg", glow());

for (const who of ["juju", "baba"]) {
  out(`assets/hd/characters/${who}-down.svg`, chibi({ who, face: "down", step: false }));
  out(`assets/hd/characters/${who}-down-step.svg`, chibi({ who, face: "down", step: true }));
  out(`assets/hd/characters/${who}-up.svg`, chibi({ who, face: "up", step: false }));
  out(`assets/hd/characters/${who}-up-step.svg`, chibi({ who, face: "up", step: true }));
  out(`assets/hd/characters/${who}-side.svg`, chibi({ who, face: "side", step: false }));
  out(`assets/hd/characters/${who}-side-step.svg`, chibi({ who, face: "side", step: true }));
  out(`assets/hd/portraits/${who}.svg`, portrait(who));
}

console.log("Wrote Yas HD SVG set");
