// Bobbing pickups: collectible flowers, secrets (heart / coins / note /
// postcard / star), quest items, and the little cat that follows you.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { KitContext } from "../assets/AssetManager";
import { blob, box, cyl, merge, sphere, tintVertices } from "../assets/kit/util";
import { PALETTE } from "../rendering/materials";
import type { PickupKind } from "../systems/worldController";

function heart(k: KitContext) {
  const s = k.scene;
  const m = k.mats.flat("#ff5c8a", { emissive: 0.25 });
  const a = sphere(s, 0.3, m, -0.13, 0.12, 0, 8);
  const b = sphere(s, 0.3, m, 0.13, 0.12, 0, 8);
  const c = box(s, 0.3, 0.3, 0.26, m, 0, -0.1, 0);
  c.rotation.z = Math.PI / 4;
  return merge("heart", [a, b, c]);
}

function coin(k: KitContext) {
  const s = k.scene;
  const m = k.mats.flat(PALETTE.mutedYellow, { emissive: 0.3 });
  const c = cyl(s, 0.36, 0.36, 0.08, m, 0, 0, 0, 12);
  c.rotation.x = Math.PI / 2;
  const rim = cyl(s, 0.24, 0.24, 0.1, k.mats.flat("#d9a83a"), 0, 0, 0, 12);
  rim.rotation.x = Math.PI / 2;
  return merge("coin", [c, rim]);
}

function note(k: KitContext, hex = "#fff8e6") {
  const s = k.scene;
  const p = box(s, 0.4, 0.5, 0.03, k.mats.flat(hex), 0, 0, 0);
  p.rotation.x = 0.4;
  const line = box(s, 0.26, 0.03, 0.01, k.mats.flat("#c9a27a"), 0, 0.1, -0.02);
  line.rotation.x = 0.4;
  return merge("note", [p, line]);
}

function star(k: KitContext) {
  const s = k.scene;
  const m = k.mats.flat("#f4c95d", { emissive: 0.4 });
  const parts: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const b = box(s, 0.12, 0.42, 0.08, m, 0, 0, 0);
    b.rotation.z = (i / 5) * Math.PI * 2;
    parts.push(b);
  }
  parts.push(sphere(s, 0.2, m, 0, 0, 0, 6));
  return merge("star", parts);
}

function card(k: KitContext) {
  const s = k.scene;
  const p = box(s, 0.5, 0.32, 0.03, k.mats.flat("#3f6fd0"), 0, 0, 0);
  p.rotation.x = 0.5;
  const chip = box(s, 0.12, 0.09, 0.01, k.mats.flat(PALETTE.mutedYellow), -0.14, 0.02, -0.02);
  chip.rotation.x = 0.5;
  return merge("card", [p, chip]);
}

/**
 * A single storybook flower (cosmos-like): flat petal ring round a golden
 * heart on a leafy stem. Vertex-coloured on one material = one draw call.
 * Stays readable as a collectible without reading as a bunch of balloons.
 */
function flowerPickup(k: KitContext, hex: string) {
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const tint = <T extends Mesh>(m: T, c: string) => (tintVertices(m, c), m);
  const parts: Mesh[] = [tint(cyl(s, 0.03, 0.035, 0.34, white, 0, 0, 0, 4), "#5f7f4a")];
  for (const [x, y, z, r] of [
    [0.07, 0.1, 0, 0.5],
    [-0.07, 0.17, 0.02, -0.5],
  ]) {
    const lf = tint(blob(s, 0.16, white, x, y, z, 0.3, 4), "#6f8a4c");
    lf.rotation.z = r;
    parts.push(lf);
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pt = tint(sphere(s, 0.15, white, Math.cos(a) * 0.1, 0.36, Math.sin(a) * 0.1, 5), i % 2 ? hex : shadeHex(hex, 0.1));
    pt.scaling.set(1, 0.32, 0.62);
    pt.rotation.y = -a;
    parts.push(pt);
  }
  parts.push(tint(sphere(s, 0.1, white, 0, 0.38, 0, 5), "#d9a83a"));
  // a little tuft at the foot so it reads as a flower growing between the flags
  for (const [x, z, d, c] of [
    [0, 0, 0.17, "#6f8a4c"],
    [0.07, 0.04, 0.12, "#7f9a58"],
    [-0.06, -0.03, 0.11, "#5f7f4a"],
  ] as const) {
    const t = tint(blob(s, d, white, x, 0.02, z, 0.5, 4), c);
    parts.push(t);
  }
  const f = merge("flowerPickup", parts);
  // ~0.3 u tall: a flower at Juju's knee, not a sunflower (baked: the idle sway scales y)
  f.scaling.setAll(0.8);
  f.bakeCurrentTransformIntoVertices();
  return f;
}

function shadeHex(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.min(255, Math.max(0, t >= 0 ? v + (255 - v) * t : v * (1 + t))));
  return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * The little ginger cat that follows you: sitting, big head, pointed ears,
 * cream muzzle / chest, a tail curled round its paws. One material, vertex
 * colours (one draw call).
 */
export function catMesh(k: KitContext) {
  const s = k.scene;
  const white = k.mats.flat("#ffffff");
  const tint = <T extends Mesh>(m: T, c: string) => (tintVertices(m, c), m);
  const FUR = "#e89a52";
  const DARK = "#c0712f";
  const CREAM = "#f6e3c6";
  const parts: Mesh[] = [];
  // sitting body (egg), cream chest
  const body = tint(sphere(s, 0.3, white, 0, 0.16, 0.04, 10), FUR);
  body.scaling.set(1, 1.1, 1.05);
  parts.push(body);
  const chest = tint(sphere(s, 0.17, white, 0, 0.2, -0.08, 8), CREAM);
  chest.scaling.set(1, 1.3, 0.7);
  parts.push(chest);
  // head
  const head = tint(sphere(s, 0.27, white, 0, 0.41, -0.05, 10), FUR);
  head.scaling.set(1.08, 0.94, 1);
  parts.push(head);
  const muzzle = tint(sphere(s, 0.12, white, 0, 0.37, -0.16, 8), CREAM);
  muzzle.scaling.set(1.2, 0.8, 0.8);
  parts.push(muzzle);
  parts.push(tint(sphere(s, 0.03, white, 0, 0.395, -0.215, 5), "#d77a86")); // nose
  for (const x of [-0.07, 0.07]) {
    // pointed ears (3-sided cones) with a pink inside
    const ear = tint(cyl(s, 0.0, 0.1, 0.11, white, x * 1.25, 0.56, -0.04, 3), FUR);
    ear.rotation.z = -x * 2.2;
    ear.rotation.y = Math.PI / 6;
    parts.push(ear);
    const inner = tint(cyl(s, 0.0, 0.06, 0.07, white, x * 1.25, 0.55, -0.06, 3), "#e7a1a0");
    inner.rotation.z = -x * 2.2;
    inner.rotation.y = Math.PI / 6;
    parts.push(inner);
    // eyes
    const eye = tint(sphere(s, 0.045, white, x, 0.44, -0.16, 6), "#2a2230");
    eye.scaling.set(1, 1.25, 0.6);
    parts.push(eye);
    // front paws
    const paw = tint(sphere(s, 0.08, white, x * 0.9, 0.03, -0.11, 6), CREAM);
    paw.scaling.set(1, 0.7, 1.3);
    parts.push(paw);
  }
  // tabby stripes on the back
  for (const y of [0.13, 0.21]) {
    const st = tint(cyl(s, 0.315, 0.315, 0.025, white, 0, y, 0.04, 10), DARK);
    st.scaling.set(1.02, 1, 0.9);
    parts.push(st);
  }
  // tail curled round the paws on the ground
  for (let i = 0; i < 6; i++) {
    const a = -0.4 + i * 0.42;
    const r = 0.19;
    parts.push(tint(sphere(s, 0.075 - i * 0.004, white, Math.sin(a) * r, 0.035, 0.08 - Math.cos(a) * r * 0.9, 6), i === 5 ? DARK : FUR));
  }
  const cat = merge("cat", parts);
  // ~0.45 u sitting (Juju is 1.05): baked so the idle breathing scale stays relative
  cat.scaling.setAll(0.78);
  cat.bakeCurrentTransformIntoVertices();
  return cat;
}

export class PickupView {
  root: TransformNode;
  private mesh: Mesh;
  private t = Math.random() * 6;
  constructor(k: KitContext, kind: PickupKind, x: number, y: number, z: number) {
    this.root = new TransformNode(`pickup:${kind}`, k.scene);
    this.root.position.set(x, y, z);
    this.mesh =
      kind === "heart"
        ? heart(k)
        : kind === "coins"
          ? coin(k)
          : kind === "note"
            ? note(k)
            : kind === "postcard"
              ? note(k, "#d8ecf8")
              : kind === "star"
                ? star(k)
                : kind === "card"
                  ? card(k)
                  : kind === "cat"
                    ? catMesh(k)
                    : flowerPickup(k, kind === "flower_yellow" ? "#e6c96a" : "#e3a3b4");
    this.mesh.parent = this.root;
    this.mesh.isPickable = false;
    this.mesh.position.y = kind === "cat" || kind.startsWith("flower") ? 0 : 0.45;
    if (kind === "cat" || kind.startsWith("flower")) this.floating = false;
  }
  private floating = true;
  update(dt: number) {
    this.t += dt;
    if (this.floating) {
      this.mesh.position.y = 0.45 + Math.sin(this.t * 2.2) * 0.08;
      this.mesh.rotation.y += dt * 1.2;
    } else {
      this.mesh.scaling.y = 1 + Math.sin(this.t * 2.5) * 0.04;
    }
  }
  dispose() {
    this.root.dispose(false, false);
    this.mesh.dispose();
  }
}

/** A short-lived petal burst when a flower is picked. */
export function petalBurst(scene: Scene, k: KitContext, x: number, y: number, z: number, onDone: (tick: (dt: number) => boolean) => void) {
  const petals: { m: Mesh; vx: number; vy: number; vz: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const m = sphere(scene, 0.12, k.mats.flat(i % 2 ? "#e6c96a" : "#e3a3b4"), x, y + 0.3, z, 4);
    m.isPickable = false;
    const a = (i / 7) * Math.PI * 2;
    petals.push({ m, vx: Math.cos(a) * 1.4, vy: 2.2 + (i % 3) * 0.4, vz: Math.sin(a) * 1.4 });
  }
  let life = 0.7;
  onDone((dt) => {
    life -= dt;
    for (const p of petals) {
      p.vy -= 6 * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      p.m.visibility = Math.max(0, life / 0.7);
    }
    if (life <= 0) {
      for (const p of petals) p.m.dispose();
      return true;
    }
    return false;
  });
}
