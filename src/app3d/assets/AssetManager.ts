// Central registry for kit pieces. A piece is either a procedural factory
// (builds a prototype Mesh once per variant) or a GLB file (loaded lazily via
// @babylonjs/loaders). Gameplay only ever calls `instantiate(key, opts)`, so a
// procedural piece can be swapped for a GLB later by changing one register call.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import type { Materials } from "../rendering/materials";
import type { Lighting } from "../rendering/lighting";

export interface KitContext {
  scene: Scene;
  mats: Materials;
  lighting: Lighting | null;
}

/** Builds a prototype mesh for `variant`. The mesh must be at the origin, with its base at y=0. */
export type PieceFactory = (ctx: KitContext, variant: string) => Mesh;

export interface PieceOptions {
  /** Instances can be tinted per-instance (registers an instanced colour buffer). */
  tintable?: boolean;
  /** Prototype (and hence every instance) casts shadows. */
  shadow?: boolean;
}

export interface InstantiateOpts {
  position?: { x: number; y?: number; z: number };
  rotationY?: number;
  scale?: number;
  variant?: string;
  /** hex tint (only if the piece is tintable) */
  tint?: string;
  name?: string;
}

export interface PieceInstance {
  root: TransformNode;
  meshes: AbstractMesh[];
  key: string;
  dispose(): void;
}

export interface ThinPlacement {
  x: number;
  y?: number;
  z: number;
  rotationY?: number;
  scale?: number;
}

interface Registration {
  factory?: PieceFactory;
  glbUrl?: string;
  opts: PieceOptions;
}

export class AssetManager {
  private regs = new Map<string, Registration>();
  private protos = new Map<string, Mesh>();
  private glbProtos = new Map<string, TransformNode>();
  private loading = new Map<string, Promise<void>>();
  private instances = new Set<PieceInstance>();
  private thinMeshes: Mesh[] = [];

  constructor(private ctx: KitContext) {}

  register(key: string, factory: PieceFactory, opts: PieceOptions = {}) {
    this.regs.set(key, { factory, opts });
  }

  /** Register a GLB piece; it replaces any procedural factory with the same key. */
  registerGlb(key: string, url: string, opts: PieceOptions = {}) {
    this.regs.set(key, { glbUrl: url, opts });
  }

  has(key: string) {
    return this.regs.has(key);
  }

  /** Ensure GLB pieces are loaded and procedural prototypes are built. */
  async preload(keys: string[]) {
    await Promise.all(
      keys.map(async (k) => {
        const reg = this.regs.get(k);
        if (!reg) return;
        if (reg.glbUrl) await this.loadGlb(k, reg.glbUrl);
        else this.proto(k, "");
      }),
    );
  }

  private async loadGlb(key: string, url: string) {
    if (this.glbProtos.has(key)) return;
    let p = this.loading.get(key);
    if (!p) {
      p = (async () => {
        await import("@babylonjs/loaders/glTF");
        const { LoadAssetContainerAsync } = await import("@babylonjs/core/Loading/sceneLoader");
        const container = await LoadAssetContainerAsync(url, this.ctx.scene);
        container.addAllToScene();
        const root = new TransformNode(`glb:${key}`, this.ctx.scene);
        for (const m of container.meshes) {
          if (!m.parent) m.parent = root;
          m.isVisible = false;
        }
        root.setEnabled(false);
        this.glbProtos.set(key, root);
      })();
      this.loading.set(key, p);
    }
    await p;
  }

  private proto(key: string, variant: string): Mesh {
    const id = `${key}#${variant}`;
    let m = this.protos.get(id);
    if (m) return m;
    const reg = this.regs.get(key);
    if (!reg?.factory) throw new Error(`AssetManager: no procedural piece "${key}"`);
    m = reg.factory(this.ctx, variant);
    m.name = id;
    m.isVisible = false;
    m.isPickable = false;
    // The invisible prototype stays at the origin. Note: shadow maps skip an
    // invisible source, so every InstancedMesh is registered as a caster itself
    // (see instantiate); thin-instance batches are visible meshes and just work.
    m.freezeWorldMatrix();
    if (reg.opts.tintable) {
      m.registerInstancedBuffer("color", 4);
      m.instancedBuffers.color = new Color4(1, 1, 1, 1);
    }
    if (reg.opts.shadow !== false) this.ctx.lighting?.addCaster(m);
    this.protos.set(id, m);
    return m;
  }

  /** Create one placed instance. Procedural pieces are synchronous; GLBs must be preloaded. */
  instantiate(key: string, opts: InstantiateOpts = {}): PieceInstance {
    const reg = this.regs.get(key);
    if (!reg) throw new Error(`AssetManager: unknown piece "${key}"`);
    const scene = this.ctx.scene;
    const variant = opts.variant ?? "";
    let root: TransformNode;
    const meshes: AbstractMesh[] = [];

    if (reg.glbUrl) {
      const proto = this.glbProtos.get(key);
      if (!proto) throw new Error(`AssetManager: GLB "${key}" not preloaded`);
      root = new TransformNode(opts.name ?? key, scene);
      for (const child of proto.getChildMeshes()) {
        if (child instanceof Mesh) {
          const inst = child.createInstance(`${key}:i`);
          inst.parent = root;
          inst.position.copyFrom(child.position);
          inst.rotationQuaternion = child.rotationQuaternion?.clone() ?? null;
          inst.rotation.copyFrom(child.rotation);
          inst.scaling.copyFrom(child.scaling);
          meshes.push(inst);
        }
      }
    } else {
      const proto = this.proto(key, variant);
      const inst = proto.createInstance(opts.name ?? `${key}:i`);
      inst.isPickable = false;
      if (reg.opts.shadow !== false) this.ctx.lighting?.addCaster(inst);
      if (reg.opts.tintable) inst.instancedBuffers.color = opts.tint ? Color4.FromHexString(opts.tint.length === 7 ? opts.tint + "ff" : opts.tint) : new Color4(1, 1, 1, 1);
      root = inst;
      meshes.push(inst);
    }

    root.position.set(opts.position?.x ?? 0, opts.position?.y ?? 0, opts.position?.z ?? 0);
    root.rotation.y = opts.rotationY ?? 0;
    if (opts.scale && opts.scale !== 1) root.scaling.setAll(opts.scale);

    const pi: PieceInstance = {
      root,
      meshes,
      key,
      dispose: () => {
        this.instances.delete(pi);
        root.dispose();
      },
    };
    this.instances.add(pi);
    return pi;
  }

  /** Freeze a static instance's world matrix once it's placed. */
  freeze(pi: PieceInstance) {
    pi.root.computeWorldMatrix(true);
    for (const m of pi.meshes) m.freezeWorldMatrix();
    if (pi.root instanceof Mesh || pi.root instanceof TransformNode) pi.root.freezeWorldMatrix();
  }

  /** Many copies of one piece as thin instances (cheapest option; no per-copy tint). */
  thinInstances(key: string, placements: ThinPlacement[], variant = ""): Mesh | null {
    if (!placements.length) return null;
    const proto = this.proto(key, variant);
    const mesh = proto.clone(`${key}#${variant}:thin`, null, true) as Mesh;
    mesh.isVisible = true;
    mesh.isPickable = false;
    mesh.position.set(0, 0, 0);
    mesh.unfreezeWorldMatrix();
    const data = new Float32Array(16 * placements.length);
    const m = new Matrix();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    placements.forEach((pl, i) => {
      Quaternion.RotationYawPitchRollToRef(pl.rotationY ?? 0, 0, 0, q);
      s.setAll(pl.scale ?? 1);
      p.set(pl.x, pl.y ?? 0, pl.z);
      Matrix.ComposeToRef(s, q, p, m);
      m.copyToArray(data, i * 16);
    });
    mesh.thinInstanceSetBuffer("matrix", data, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.freezeWorldMatrix();
    const reg = this.regs.get(key);
    if (reg?.opts.shadow !== false) this.ctx.lighting?.addCaster(mesh);
    this.thinMeshes.push(mesh);
    return mesh;
  }

  /** Dispose every instance and thin-instance batch, keep registrations and prototypes. */
  disposeInstances() {
    for (const i of [...this.instances]) i.dispose();
    for (const m of this.thinMeshes) m.dispose();
    this.thinMeshes = [];
  }

  /** Dispose everything (scene teardown). */
  disposeScene() {
    this.disposeInstances();
    for (const p of this.protos.values()) p.dispose();
    for (const p of this.glbProtos.values()) p.dispose();
    this.protos.clear();
    this.glbProtos.clear();
    this.loading.clear();
  }
}
