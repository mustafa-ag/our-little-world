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
  return merge("flowerPickup", parts);
}

function shadeHex(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.min(255, Math.max(0, t >= 0 ? v + (255 - v) * t : v * (1 + t))));
  return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function catMesh(k: KitContext) {
  const s = k.scene;
  const fur = k.mats.flat("#f0a860");
  const dark = k.mats.flat("#c47f3a");
  const parts: Mesh[] = [];
  const body = sphere(s, 0.4, fur, 0, 0.22, 0.05, 8);
  body.scaling.set(1, 0.8, 1.4);
  parts.push(body);
  parts.push(sphere(s, 0.3, fur, 0, 0.36, -0.25, 8));
  for (const x of [-0.08, 0.08]) {
    const ear = cyl(s, 0.01, 0.1, 0.12, dark, x, 0.46, -0.26, 4);
    parts.push(ear);
    parts.push(sphere(s, 0.05, k.mats.flat("#2a2230"), x, 0.38, -0.38, 4));
  }
  const tail = cyl(s, 0.05, 0.07, 0.4, dark, 0, 0.3, 0.3, 5);
  tail.rotation.x = -0.9;
  parts.push(tail);
  for (const [x, z] of [
    [-0.1, -0.12],
    [0.1, -0.12],
    [-0.1, 0.18],
    [0.1, 0.18],
  ])
    parts.push(cyl(s, 0.08, 0.08, 0.14, fur, x, 0, z, 5));
  return merge("cat", parts);
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
