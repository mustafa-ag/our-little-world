// Procedural face decals (Canvas 2D), painted into the same 0.24 x 0.24
// window in front of the head that build_characters.py maps the GLB face
// decal's planar UVs onto: u = (x + 0.12) / 0.24, v = (z - (HC.z - 0.13)) / 0.24
// with x / z relative to the head centre (HC). Painting happens in those
// "design units" directly (ctx transform below), so features line up with the
// authored face shell. The canvas is uploaded with invertY = false to match
// the glTF convention (row 0 = top of the face).
//
// Three looks:
//   juju   large dark almond eyes with kohl wings + lashes, full brows, a nose
//          highlight and defined lips (#C07060), tuned for warm olive skin;
//   female simpler: eyes + one lash flick + brows + a soft smile line;
//   male   smaller eyes, straighter heavier brows, a smile line.

import type { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export type FaceKind = "juju" | "female" | "male";

const FACE_W = 0.24;
/** Top of the window relative to the head centre (0.24 - 0.13). */
const FACE_TOP = 0.11;

type Ctx = CanvasRenderingContext2D;

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

/** A brow as a filled crescent (thick at the inner end, tapering out). */
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

interface EyeOpts {
  ew: number;
  eh: number;
  iris: [string, string];
  liner: number;
  lashes: number;
  wing: boolean;
}

function eye(ctx: Ctx, s: number, cx: number, ez: number, o: EyeOpts) {
  const { ew, eh } = o;
  const lid = ez + eh * 0.72;
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
  // iris: darker at the top
  const g = ctx.createLinearGradient(0, ez - eh, 0, ez + eh);
  g.addColorStop(0, o.iris[0]);
  g.addColorStop(1, o.iris[1]);
  ctx.fillStyle = g;
  ellipse(ctx, cx + s * 0.0005, ez - 0.001, ew * 0.8, eh * 0.92);
  ctx.fill();
  ctx.fillStyle = "#0d0705";
  ellipse(ctx, cx, ez - 0.002, ew * 0.4, eh * 0.46);
  ctx.fill();
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
  // lashes: short strokes fanning out from the outer half of the lid
  ctx.lineWidth = o.liner * 0.45;
  for (let i = 0; i < o.lashes; i++) {
    const u = 0.25 + (0.7 * i) / Math.max(1, o.lashes - 1);
    const bx = cx + s * ew * u;
    const bz = lid + eh * 0.28 * (1 - u * u) + 0.001;
    ctx.beginPath();
    ctx.moveTo(bx, bz);
    ctx.lineTo(bx + s * ew * (0.18 + 0.3 * u), bz + eh * (0.42 - 0.12 * u));
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

function paint(ctx: Ctx, size: number, kind: FaceKind) {
  ctx.clearRect(0, 0, size, size);
  const k = size / FACE_W;
  // design units, y up, origin at the head centre
  ctx.setTransform(k, 0, 0, -k, (FACE_W / 2) * k, FACE_TOP * k);

  const juju = kind === "juju";
  const male = kind === "male";
  // cheeks: warm rose on olive / brown skin (subtle for NPCs)
  for (const s of [-1, 1]) glow(ctx, s * 0.074, -0.05, 0.03, 0.019, juju ? "176,78,66" : "190,95,85", male ? 0.12 : juju ? 0.32 : 0.24);

  const ex = 0.047;
  const ez = -0.01;
  const eyeOpts: EyeOpts = juju
    ? { ew: 0.0195, eh: 0.0235, iris: ["#6a3a1c", "#1e0f07"], liner: 0.0034, lashes: 4, wing: true }
    : male
      ? { ew: 0.0152, eh: 0.0185, iris: ["#5a3a24", "#20130b"], liner: 0.0018, lashes: 0, wing: false }
      : { ew: 0.0168, eh: 0.0205, iris: ["#5e3a22", "#1f120a"], liner: 0.0024, lashes: 1, wing: false };
  for (const s of [-1, 1]) {
    const cx = s * ex;
    eye(ctx, s, cx, ez, eyeOpts);
    if (juju) brow(ctx, s, cx, ez + 0.044, 0.0072, 0.0068, "rgba(38,20,11,0.95)");
    else if (male) brow(ctx, s, cx, ez + 0.041, 0.0078, 0.002, "rgba(34,22,15,0.92)");
    else brow(ctx, s, cx, ez + 0.042, 0.0056, 0.0055, "rgba(44,26,16,0.9)");
  }

  // nose: a soft shadow under the tip; Juju also gets a highlight on the tip
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(80,42,24,0.45)";
  ctx.lineWidth = 0.0022;
  ctx.beginPath();
  ctx.moveTo(-0.0085, -0.041);
  ctx.quadraticCurveTo(0, -0.0475, 0.0085, -0.041);
  ctx.stroke();
  if (juju) {
    glow(ctx, 0, -0.032, 0.0075, 0.0095, "255,214,180", 0.45);
    glow(ctx, 0, -0.012, 0.0045, 0.012, "255,214,180", 0.18);
  }

  const mz = -0.071;
  if (juju) {
    // defined lips (#C07060): fuller lower lip, a cupid's bow on top
    ctx.fillStyle = "#c07060";
    ctx.beginPath();
    ctx.moveTo(-0.0185, mz + 0.0015);
    ctx.quadraticCurveTo(-0.009, mz + 0.0075, -0.0025, mz + 0.0058);
    ctx.quadraticCurveTo(0, mz + 0.0048, 0.0025, mz + 0.0058);
    ctx.quadraticCurveTo(0.009, mz + 0.0075, 0.0185, mz + 0.0015);
    ctx.quadraticCurveTo(0, mz - 0.0165, -0.0185, mz + 0.0015);
    ctx.closePath();
    ctx.fill();
    // lip line (a soft smile) + upper-lip shade
    ctx.strokeStyle = "#7e3f36";
    ctx.lineWidth = 0.0016;
    ctx.beginPath();
    ctx.moveTo(-0.0195, mz + 0.0022);
    ctx.quadraticCurveTo(0, mz - 0.0035, 0.0195, mz + 0.0022);
    ctx.stroke();
    ctx.fillStyle = "rgba(120,50,44,0.28)";
    ctx.beginPath();
    ctx.moveTo(-0.017, mz + 0.0015);
    ctx.quadraticCurveTo(0, mz + 0.0085, 0.017, mz + 0.0015);
    ctx.quadraticCurveTo(0, mz - 0.003, -0.017, mz + 0.0015);
    ctx.fill();
    // lower-lip highlight
    glow(ctx, 0.002, mz - 0.0082, 0.0065, 0.0022, "255,215,205", 0.55);
  } else {
    ctx.strokeStyle = male ? "rgba(96,50,40,0.85)" : "rgba(150,70,64,0.9)";
    ctx.lineWidth = male ? 0.0018 : 0.0021;
    ctx.beginPath();
    ctx.moveTo(-0.014, mz + 0.002);
    ctx.quadraticCurveTo(0, mz - 0.007, 0.014, mz + 0.002);
    ctx.stroke();
  }
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
