// Procedural face decals (Canvas 2D), painted into the same 0.24 x 0.24
// window in front of the head that build_characters.py maps the GLB face
// decal's planar UVs onto: u = (x + 0.12) / 0.24, v = (z - (HC.z - 0.13)) / 0.24
// with x / z relative to the head centre (HC). Painting happens in those
// "design units" directly (ctx transform below), so features line up with the
// authored face shell. The canvas is uploaded with invertY = false to match
// the glTF convention (row 0 = top of the face).
//
// Looks:
//   juju          large dark almond eyes (amber ring round the pupil, catchlights,
//                 six curled lashes, kohl wings, a warm crease shadow), arched
//                 tapering brows, a nose highlight, cupid's bow lips (#C07060
//                 upper / #C87868 lower), delicate high blush, forehead + chin
//                 light/shade; tuned for warm olive skin;
//   female        the default NPC: eyes + one lash flick + brows + a soft smile;
//   female_soft   rounder eyes, soft low brows, a gentle upturned smile (Mama);
//   female_sharp  almond eyes with a small wing, strongly arched brows, defined lips;
//   female_young  big bright eyes, light fine brows, a small smile;
//   male          smaller eyes, straighter heavier brows, a smile line.

import type { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export type FaceKind = "juju" | "female" | "female_soft" | "female_sharp" | "female_young" | "male";

const FACE_W = 0.24;
/** Top of the window relative to the head centre (0.24 - 0.13). */
const FACE_TOP = 0.11;

type Ctx = CanvasRenderingContext2D;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

/** A soft radial glow (blush / highlight). */
function glow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rgb: string, a: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A brow as a filled crescent (thick at the inner end, tapering out). Straight-ish: male / default female. */
function brow(ctx: Ctx, s: number, cx: number, bz: number, thick: number, arch: number, color: string) {
  const x0 = cx - s * 0.021;
  const x1 = cx + s * 0.025;
  const xm = cx + s * 0.003;
  ctx.beginPath();
  ctx.moveTo(x0, bz - 0.003);
  ctx.quadraticCurveTo(xm, bz + arch + thick * 0.5, x1, bz - 0.004);
  ctx.quadraticCurveTo(xm, bz + arch - thick * 0.9, x0, bz - 0.003 - thick);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

interface ArchOpts {
  /** Thickness at the head of the brow. */
  thick: number;
  /** Height of the peak above the inner end. */
  arch: number;
  /** Where the peak sits along the brow, 0 (inner) .. 1 (tail). */
  peak: number;
  /** "r,g,b" and the opacity at the head (the tail fades a little). */
  rgb: string;
  alpha: number;
}

/**
 * An arched brow: a blunt head by the nose rising to a peak about two thirds
 * out, then tapering down to a fine point at the tail.
 */
function archedBrow(ctx: Ctx, s: number, cx: number, bz: number, o: ArchOpts) {
  const { thick: t, arch: a } = o;
  const xi = cx - s * 0.022; // head (towards the nose)
  const xt = cx + s * 0.027; // tail point
  const xp = lerp(xi, xt, o.peak);
  ctx.beginPath();
  ctx.moveTo(xi, bz - t * 0.45);
  // blunt, slightly rounded head
  ctx.quadraticCurveTo(xi - s * t * 0.3, bz + t * 0.05, xi + s * 0.0012, bz + t * 0.55);
  // upper edge up to the peak
  ctx.quadraticCurveTo(lerp(xi, xp, 0.5), bz + a * 0.85 + t * 0.62, xp, bz + a + t * 0.42);
  // down to a fine tail point
  ctx.quadraticCurveTo(lerp(xp, xt, 0.55), bz + a * 0.72 + t * 0.18, xt, bz + a * 0.05 - 0.0042);
  // lower edge back under the peak (thin towards the tail)
  ctx.quadraticCurveTo(lerp(xp, xt, 0.42), bz + a * 0.62 - t * 0.22, xp, bz + a - t * 0.38);
  // and back to the head
  ctx.quadraticCurveTo(lerp(xi, xp, 0.5), bz + a * 0.55 - t * 0.58, xi, bz - t * 0.45);
  ctx.closePath();
  const g = ctx.createLinearGradient(xi, 0, xt, 0);
  g.addColorStop(0, `rgba(${o.rgb},${o.alpha * 0.82})`);
  g.addColorStop(0.3, `rgba(${o.rgb},${o.alpha})`);
  g.addColorStop(0.75, `rgba(${o.rgb},${o.alpha * 0.92})`);
  g.addColorStop(1, `rgba(${o.rgb},${o.alpha * 0.55})`);
  ctx.fillStyle = g;
  ctx.fill();
}

interface EyeOpts {
  ew: number;
  eh: number;
  iris: [string, string];
  liner: number;
  lashes: number;
  wing: boolean;
  /** Warm ring round the pupil (radial iris gradient). */
  ring?: string;
  /** Upper lashes drawn as curled strokes spread along the lid (length multiplier). */
  curl?: number;
  /** Soft warm-brown crease shadow above the lid ("r,g,b,a"). */
  crease?: string;
  /** Size of one texel in design units: adds a 2x2 texel catchlight. */
  catchPx?: number;
}

function eye(ctx: Ctx, s: number, cx: number, ez: number, o: EyeOpts) {
  const { ew, eh } = o;
  const lid = ez + eh * 0.72;

  // eyeshadow crease: a soft arc above the lid (two passes for a feathered edge)
  if (o.crease) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(${o.crease})`;
    for (const [w, a] of [[eh * 0.46, 0.5], [eh * 0.24, 0.5]] as const) {
      ctx.globalAlpha = a;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx - s * ew * 0.9, lid + eh * 0.3);
      ctx.quadraticCurveTo(cx + s * ew * 0.05, lid + eh * 0.95, cx + s * ew * 1.12, lid + eh * 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  // eye opening: an ellipse with the top shaved off by the upper lid
  ctx.save();
  ellipse(ctx, cx, ez, ew, eh);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(cx - ew * 1.2, lid - 0.004);
  ctx.quadraticCurveTo(cx, lid + 0.004, cx + ew * 1.2, lid - 0.004);
  ctx.lineTo(cx + ew * 1.2, ez - eh * 1.2);
  ctx.lineTo(cx - ew * 1.2, ez - eh * 1.2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#fbf5ee";
  ctx.fillRect(cx - ew, ez - eh, ew * 2, eh * 2);
  const ix = cx + s * 0.0005;
  const iz = ez - 0.001;
  const irx = ew * 0.8;
  const iry = eh * 0.92;
  if (o.ring) {
    // radial iris: warm amber ring round the pupil into a deep brown, darker limbal edge
    ctx.save();
    ctx.translate(ix, iz);
    ctx.scale(1, iry / irx);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, irx);
    rg.addColorStop(0, o.ring);
    rg.addColorStop(0.64, o.ring);
    rg.addColorStop(0.86, o.iris[0]);
    rg.addColorStop(1, o.iris[1]);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, irx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // iris: darker at the top
    const g = ctx.createLinearGradient(0, ez - eh, 0, ez + eh);
    g.addColorStop(0, o.iris[0]);
    g.addColorStop(1, o.iris[1]);
    ctx.fillStyle = g;
    ellipse(ctx, ix, iz, irx, iry);
    ctx.fill();
  }
  ctx.fillStyle = "#0d0705";
  ellipse(ctx, cx, ez - 0.002, ew * 0.4, eh * 0.46);
  ctx.fill();
  if (o.ring) {
    // the upper lid shades the top of the eyeball
    const sh = ctx.createLinearGradient(0, lid, 0, ez);
    sh.addColorStop(0, "rgba(40,18,8,0.5)");
    sh.addColorStop(1, "rgba(40,18,8,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(cx - ew, ez, ew * 2, eh);
  }
  // warm lower glint + highlights
  ctx.fillStyle = "rgba(170,105,60,0.5)";
  ellipse(ctx, cx + s * 0.002, ez - eh * 0.55, ew * 0.45, eh * 0.17);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ellipse(ctx, cx - ew * 0.33, ez + eh * 0.36, ew * 0.3, eh * 0.28);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ellipse(ctx, cx + ew * 0.36, ez - eh * 0.4, ew * 0.14, ew * 0.14);
  ctx.fill();
  if (o.catchPx) {
    // a crisp 2x2 texel catchlight in the iris
    const p = o.catchPx;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(cx + ew * 0.5 - p, ez + eh * 0.26 - p, p * 2, p * 2);
  }
  ctx.restore();

  // upper lid line (kohl), heavier towards the outer corner
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#140a06";
  ctx.lineWidth = o.liner;
  ctx.beginPath();
  ctx.moveTo(cx - s * ew * 1.02, ez + eh * 0.15);
  ctx.quadraticCurveTo(cx - s * ew * 0.1, lid + eh * 0.42, cx + s * ew * 1.02, ez + eh * 0.38);
  ctx.stroke();
  if (o.wing) {
    ctx.fillStyle = "#140a06";
    ctx.beginPath();
    ctx.moveTo(cx + s * ew * 0.55, lid + eh * 0.12);
    ctx.lineTo(cx + s * ew * 1.55, ez + eh * 0.72);
    ctx.lineTo(cx + s * ew * 0.95, ez + eh * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  // lashes: roots sit on the kohl line itself (the same quadratic as above)
  ctx.lineWidth = o.liner * 0.45;
  const p0x = cx - s * ew * 1.02, p0z = ez + eh * 0.15;
  const p1x = cx - s * ew * 0.1, p1z = lid + eh * 0.42;
  const p2x = cx + s * ew * 1.02, p2z = ez + eh * 0.38;
  const n = o.lashes;
  // a full set spreads along the lid; a few lashes stay on the outer half
  const u0 = n >= 5 ? 0.1 : 0.45;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.7 : u0 + ((0.95 - u0) * i) / (n - 1);
    const t = 0.28 + 0.68 * u;
    const mt = 1 - t;
    const bx = mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x;
    const bz = mt * mt * p0z + 2 * mt * t * p1z + t * t * p2z + o.liner * 0.25;
    ctx.beginPath();
    ctx.moveTo(bx, bz);
    if (o.curl) {
      // curled: up, then the tip flicks outward; short by the nose, longest at the outer corner
      const len = o.curl * (0.35 + 0.65 * u);
      const out = 0.08 + 0.42 * u;
      ctx.quadraticCurveTo(bx + s * ew * out * 0.3 * len, bz + eh * 0.44 * len, bx + s * ew * (out + 0.16) * len, bz + eh * (0.5 - 0.1 * u) * len);
    } else {
      ctx.lineTo(bx + s * ew * (0.18 + 0.3 * u), bz + eh * (0.42 - 0.12 * u));
    }
    ctx.stroke();
  }
  // soft lower lash line
  ctx.strokeStyle = "rgba(60,30,20,0.4)";
  ctx.lineWidth = o.liner * 0.35;
  ctx.beginPath();
  ctx.moveTo(cx - s * ew * 0.55, ez - eh * 0.8);
  ctx.quadraticCurveTo(cx, ez - eh * 1.06, cx + s * ew * 0.85, ez - eh * 0.62);
  ctx.stroke();
}

/** Per-kind tuning for the NPC faces. */
interface NpcStyle {
  eye: Omit<EyeOpts, "catchPx">;
  catchlight?: boolean;
  /** Straight crescent brow [thick, arch, color] or an arched one. */
  brow: { kind: "straight"; thick: number; arch: number; color: string } | ({ kind: "arched" } & ArchOpts);
  browZ: number;
  blush: { rgb: string; a: number; x: number; z: number; rx: number; ry: number };
  mouth: { w: number; curve: number; color: string; width: number; lower?: string };
}

const NPC_STYLES: Record<Exclude<FaceKind, "juju">, NpcStyle> = {
  female: {
    eye: { ew: 0.0168, eh: 0.0205, iris: ["#5e3a22", "#1f120a"], liner: 0.0024, lashes: 1, wing: false },
    brow: { kind: "straight", thick: 0.0056, arch: 0.0055, color: "rgba(44,26,16,0.9)" },
    browZ: 0.042,
    blush: { rgb: "190,95,85", a: 0.24, x: 0.074, z: -0.05, rx: 0.03, ry: 0.019 },
    mouth: { w: 0.014, curve: 0.007, color: "rgba(150,70,64,0.9)", width: 0.0021 },
  },
  female_soft: {
    // round, open eyes; soft low brows; a gentle upturned smile
    eye: { ew: 0.0172, eh: 0.0228, iris: ["#5a3822", "#22140b"], liner: 0.002, lashes: 3, wing: false, curl: 0.7 },
    brow: { kind: "arched", thick: 0.0052, arch: 0.0032, peak: 0.55, rgb: "52,32,20", alpha: 0.78 },
    browZ: 0.041,
    blush: { rgb: "200,105,90", a: 0.26, x: 0.07, z: -0.047, rx: 0.026, ry: 0.018 },
    mouth: { w: 0.0155, curve: 0.0085, color: "rgba(150,74,66,0.88)", width: 0.0022 },
  },
  female_sharp: {
    // almond eyes with a small wing, strongly arched dark brows, defined lips
    eye: { ew: 0.0182, eh: 0.0192, iris: ["#4e2e1a", "#170c06"], liner: 0.003, lashes: 4, wing: true, curl: 0.95, crease: "100,55,30,0.14" },
    brow: { kind: "arched", thick: 0.0064, arch: 0.0088, peak: 0.68, rgb: "30,17,10", alpha: 0.95 },
    browZ: 0.043,
    blush: { rgb: "180,85,75", a: 0.18, x: 0.072, z: -0.042, rx: 0.022, ry: 0.012 },
    mouth: { w: 0.0135, curve: 0.005, color: "rgba(130,56,50,0.95)", width: 0.0022, lower: "rgba(176,96,86,0.55)" },
  },
  female_young: {
    // big bright eyes, light fine brows set a little higher, a small sweet smile
    eye: { ew: 0.0196, eh: 0.0248, iris: ["#6e4428", "#26160b"], liner: 0.0022, lashes: 3, wing: false, curl: 0.75, ring: "#86542e" },
    catchlight: true,
    brow: { kind: "arched", thick: 0.0044, arch: 0.005, peak: 0.6, rgb: "74,46,30", alpha: 0.7 },
    browZ: 0.047,
    blush: { rgb: "215,110,95", a: 0.28, x: 0.07, z: -0.048, rx: 0.024, ry: 0.017 },
    mouth: { w: 0.0118, curve: 0.0065, color: "rgba(160,78,70,0.88)", width: 0.002 },
  },
  male: {
    eye: { ew: 0.0152, eh: 0.0185, iris: ["#5a3a24", "#20130b"], liner: 0.0018, lashes: 0, wing: false },
    brow: { kind: "straight", thick: 0.0078, arch: 0.002, color: "rgba(34,22,15,0.92)" },
    browZ: 0.041,
    blush: { rgb: "190,95,85", a: 0.12, x: 0.074, z: -0.05, rx: 0.03, ry: 0.019 },
    mouth: { w: 0.014, curve: 0.007, color: "rgba(96,50,40,0.85)", width: 0.0018 },
  },
};

const EX = 0.047;
const EZ = -0.01;
const MZ = -0.071;

function nose(ctx: Ctx) {
  // a soft shadow under the tip
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(80,42,24,0.45)";
  ctx.lineWidth = 0.0022;
  ctx.beginPath();
  ctx.moveTo(-0.0085, -0.041);
  ctx.quadraticCurveTo(0, -0.0475, 0.0085, -0.041);
  ctx.stroke();
}

function paintJuju(ctx: Ctx, px: number) {
  // forehead light: a warm sheen falling from the top of the face
  glow(ctx, 0, FACE_TOP - 0.008, 0.052, 0.05, "255,220,190", 0.12);

  // delicate blush, high on the cheekbones
  for (const s of [-1, 1]) glow(ctx, s * 0.066, -0.035, 0.018, 0.0105, "200,100,80", 0.18);

  const eyeOpts: EyeOpts = {
    ew: 0.0195,
    eh: 0.0235,
    iris: ["#4a2510", "#1e0d05"],
    ring: "#7a4a28",
    liner: 0.0034,
    lashes: 6,
    wing: true,
    curl: 1.15,
    crease: "100,55,30,0.18",
    catchPx: px,
  };
  for (const s of [-1, 1]) {
    const cx = s * EX;
    eye(ctx, s, cx, EZ, eyeOpts);
    archedBrow(ctx, s, cx, EZ + 0.043, { thick: 0.0074, arch: 0.0078, peak: 0.64, rgb: "38,20,11", alpha: 0.95 });
  }

  nose(ctx);
  glow(ctx, 0, -0.032, 0.0075, 0.0095, "255,214,180", 0.45);
  glow(ctx, 0, -0.012, 0.0045, 0.012, "255,214,180", 0.18);

  const mz = MZ;
  // chin shadow under the lower lip
  glow(ctx, 0, mz - 0.0145, 0.013, 0.0036, "80,40,25", 0.12);
  // a hint of light on the philtrum above the bow
  glow(ctx, 0, mz + 0.0098, 0.0032, 0.0034, "255,214,180", 0.2);

  const L = -0.0185;
  const R = 0.0185;
  const cz = mz + 0.0015;
  // lower lip (#C87868): fuller and a touch lighter than the upper lip
  ctx.fillStyle = "#c87868";
  ctx.beginPath();
  ctx.moveTo(L, cz);
  ctx.quadraticCurveTo(0, mz - 0.0035, R, cz);
  ctx.bezierCurveTo(0.0125, mz - 0.0118, -0.0125, mz - 0.0118, L, cz);
  ctx.closePath();
  ctx.fill();
  // upper lip (#C07060): a proper cupid's bow
  ctx.fillStyle = "#c07060";
  ctx.beginPath();
  ctx.moveTo(L, cz);
  ctx.quadraticCurveTo(-0.0095, mz + 0.0074, -0.0029, mz + 0.0064);
  ctx.quadraticCurveTo(0, mz + 0.0046, 0.0029, mz + 0.0064);
  ctx.quadraticCurveTo(0.0095, mz + 0.0074, R, cz);
  ctx.quadraticCurveTo(0, mz - 0.0035, L, cz);
  ctx.closePath();
  ctx.fill();
  // upper-lip shade towards the seam (the lip turns under)
  ctx.fillStyle = "rgba(120,50,44,0.26)";
  ctx.beginPath();
  ctx.moveTo(-0.017, cz);
  ctx.quadraticCurveTo(0, mz + 0.0035, 0.017, cz);
  ctx.quadraticCurveTo(0, mz - 0.003, -0.017, cz);
  ctx.fill();
  // lip seam (a soft smile), deepening into the corners
  ctx.lineCap = "round";
  ctx.strokeStyle = "#7e3f36";
  ctx.lineWidth = 0.0015;
  ctx.beginPath();
  ctx.moveTo(-0.0195, mz + 0.0024);
  ctx.quadraticCurveTo(0, mz - 0.0035, 0.0195, mz + 0.0024);
  ctx.stroke();
  // lower-lip volume: a soft highlight
  glow(ctx, 0.0015, mz - 0.0074, 0.0072, 0.0024, "255,218,206", 0.55);
}

function paintNpc(ctx: Ctx, px: number, st: NpcStyle) {
  const b = st.blush;
  for (const s of [-1, 1]) glow(ctx, s * b.x, b.z, b.rx, b.ry, b.rgb, b.a);

  const eyeOpts: EyeOpts = { ...st.eye, catchPx: st.catchlight ? px : undefined };
  for (const s of [-1, 1]) {
    const cx = s * EX;
    eye(ctx, s, cx, EZ, eyeOpts);
    const br = st.brow;
    if (br.kind === "straight") brow(ctx, s, cx, EZ + st.browZ, br.thick, br.arch, br.color);
    else archedBrow(ctx, s, cx, EZ + st.browZ, br);
  }

  nose(ctx);

  const m = st.mouth;
  if (m.lower) {
    // a hint of lower-lip colour under the smile line
    ctx.fillStyle = m.lower;
    ctx.beginPath();
    ctx.moveTo(-m.w * 0.8, MZ + 0.0005);
    ctx.quadraticCurveTo(0, MZ - m.curve * 0.5, m.w * 0.8, MZ + 0.0005);
    ctx.bezierCurveTo(m.w * 0.5, MZ - 0.0095, -m.w * 0.5, MZ - 0.0095, -m.w * 0.8, MZ + 0.0005);
    ctx.fill();
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = m.color;
  ctx.lineWidth = m.width;
  ctx.beginPath();
  ctx.moveTo(-m.w, MZ + 0.002);
  ctx.quadraticCurveTo(0, MZ - m.curve, m.w, MZ + 0.002);
  ctx.stroke();
}

function paint(ctx: Ctx, size: number, kind: FaceKind) {
  ctx.clearRect(0, 0, size, size);
  const k = size / FACE_W;
  // design units, y up, origin at the head centre
  ctx.setTransform(k, 0, 0, -k, (FACE_W / 2) * k, FACE_TOP * k);
  const px = FACE_W / size;
  if (kind === "juju") paintJuju(ctx, px);
  else paintNpc(ctx, px, NPC_STYLES[kind]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const cache = new WeakMap<Scene, Map<FaceKind, StandardMaterial>>();

/** The face decal material for `kind` (one per scene, shared by every character). */
export function proceduralFaceMaterial(scene: Scene, kind: FaceKind): StandardMaterial {
  let per = cache.get(scene);
  if (!per) cache.set(scene, (per = new Map()));
  let m = per.get(kind);
  if (m) return m;
  const size = kind === "juju" ? 512 : 256;
  const tex = new DynamicTexture(`olw_face_tex:${kind}`, { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  paint(tex.getContext() as Ctx, size, kind);
  tex.update(false);
  m = new StandardMaterial(`olw_face:${kind}`, scene);
  m.diffuseTexture = tex;
  m.useAlphaFromDiffuseTexture = true;
  m.specularColor = Color3.Black();
  m.transparencyMode = 2; // Material.MATERIAL_ALPHABLEND
  m.zOffset = -2;
  m.freeze();
  per.set(kind, m);
  return m;
}
