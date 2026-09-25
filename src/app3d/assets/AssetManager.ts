// Central registry for kit pieces. A piece is either a procedural factory
// (builds a prototype Mesh once per variant) or a GLB file (loaded lazily via
// @babylonjs/loaders) with a procedural FALLBACK, so gameplay never depends on
// a GLB being present. Gameplay only ever calls `instantiate(key, opts)` or
// `thinInstances(key, placements)`; both behave identically for GLB and
// procedural pieces because a loaded GLB is merged into one prototype mesh
// with the same slot-named MultiMaterial the hero builders produce.
//
// Hybrid asset strategy (Track B):
//   - hero assets are authored in code (assets/hero/*.ts), exported to
//     public/assets/models/<key>.glb by scripts/build-hero-assets.mjs and
//     registered here with `registerGlb(key, url, { fallback })`;
//   - materials inside a hero mesh are named SLOTS ("olw_stone", "olw_wood",
//     "olw_foliage"…); after loading (or building the fallback) `remapSlots`
//     swaps them for the shared hand-painted runtime Materials;
//   - `preload(keys)` races every GLB against a timeout and silently falls
//     back to the procedural builder, so a missing/slow file just costs a
//     build on the main thread.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import type { Materials } from "../rendering/materials";
import { PALETTE } from "../rendering/materials";
import type { Lighting } from "../rendering/lighting";
import { type Slot, heroCtx, isSlot } from "./hero/slots";
import { slotsOf, tagSlots } from "./hero/geo";
import { HERO_ASSETS, HERO_ALIASES, HERO_KEYS, type HeroEntry, type HeroKey } from "./hero/index";

export { HERO_ASSETS, HERO_KEYS, HERO_ALIASES, type HeroKey, type HeroEntry };

export interface KitContext {
  scene: Scene;
  mats: Materials;
  lighting: Lighting | null;
}

/** Builds a prototype mesh for `variant`. The mesh must be at the origin, with its base at y=0. */
export type PieceFactory = (ctx: KitContext, variant: string) => Mesh;
/** Builds an unmerged node hierarchy (player rig) at the origin. */
export type HierarchyFactory = (ctx: KitContext) => TransformNode;

/** Applies a variant string to a fresh prototype clone (hero pieces: "c=#hex" retints). */
export type VariantFn = (mesh: Mesh, variant: string) => void;

export interface PieceOptions {
  /** Instances can be tinted per-instance (registers an instanced colour buffer). */
  tintable?: boolean;
  /** Prototype (and hence every instance) casts shadows. */
  shadow?: boolean;
}

export interface GlbOptions extends PieceOptions {
  /** Procedural builder used when the GLB is missing, slow or broken (and until it is preloaded). */
  fallback?: PieceFactory | HierarchyFactory;
  /** Merge the GLB into one prototype mesh (default true). false keeps the node hierarchy (player). */
  merge?: boolean;
  /** Variant handler applied to a per-variant clone of the prototype (both GLB and fallback). */
  variant?: VariantFn;
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

/** A cloned node hierarchy (unmerged GLB or procedural build), e.g. the player. */
export interface HierarchyInstance {
  root: TransformNode;
  meshes: Mesh[];
  /** true when it came from the GLB, false for the procedural fallback. */
  fromGlb: boolean;
  dispose(): void;
}

interface Registration {
  factory?: PieceFactory | HierarchyFactory;
  glbUrl?: string;
  opts: GlbOptions;
  /** Loaded GLB, merged into a base prototype (merge !== false). */
  glbBase?: Mesh;
  /** Loaded GLB kept as a hierarchy (merge === false). */
  glbRoot?: TransformNode;
  /** true once the GLB failed/timed out: use the fallback for good. */
  glbFailed?: boolean;
}

export const GLB_TIMEOUT_MS = 4000;

let glowRegistered: WeakSet<Material> = new WeakSet();

/**
 * The runtime material for a hero slot. Textured slots come from the shared
 * hand-painted textures; flat slots are white so vertex colours carry the hue.
 */
export function slotMaterial(k: KitContext, slot: Slot): Material {
  const m = k.mats;
  switch (slot) {
    case "olw_stone":
      return m.textured("stone", PALETTE.stoneWarm, 1.2);
    case "olw_roof_tile":
      return m.textured("roof", PALETTE.terracottaMuted, 1);
    case "olw_slate":
      return m.textured("slate", PALETTE.slate, 1);
    case "olw_wood":
      return m.textured("planks", PALETTE.woodLight, 1.5);
    case "olw_glass":
      return m.flat(PALETTE.glass);
    case "olw_glass_emissive": {
      const g = m.flat(PALETTE.lamp, { emissive: 0.2 });
      if (k.lighting && !glowRegistered.has(g)) {
        glowRegistered.add(g);
        k.lighting.registerGlow(g as StandardMaterial, PALETTE.lamp, "#4a3d26");
      }
      return g;
    }
    default:
      // olw_paint, olw_foliage, olw_metal, character roles, face: vertex colours × white
      return m.flat("#ffffff");
  }
}

/**
 * Replace slot-named materials on a mesh (single or multi) with the runtime
 * materials, remembering the slot per submesh in `metadata.olwSlots`.
 * Meshes without slot materials are left alone.
 */
export function remapSlots(k: KitContext, mesh: Mesh) {
  const mat = mesh.material;
  if (!mat) return;
  if (mat instanceof MultiMaterial) {
    if (!mat.subMaterials.some((s) => s && isSlot(s.name))) return;
    if (!(mesh.metadata as { olwSlots?: string[] } | null)?.olwSlots) tagSlots(mesh);
    const mm = new MultiMaterial(`${mesh.name}:mm`, k.scene);
    mm.subMaterials = mat.subMaterials.map((s) => (s && isSlot(s.name) ? slotMaterial(k, s.name) : s));
    mesh.material = mm;
  } else if (isSlot(mat.name)) {
    tagSlots(mesh);
    mesh.material = slotMaterial(k, mat.name);
  }
}

/** Build a hero fallback with placeholder slot materials, then remap to runtime materials. */
export function heroFactory(build: (ctx: ReturnType<typeof heroCtx>) => Mesh | TransformNode): PieceFactory {
  return (k) => {
    const out = build(heroCtx(k.scene));
    if (!(out instanceof Mesh)) throw new Error("hero fallback must return a Mesh");
    remapSlots(k, out);
    return out;
  };
}

export class AssetManager {
  private regs = new Map<string, Registration>();
  private aliases = new Map<string, (variant: string) => string>();
  private protos = new Map<string, Mesh>();
  private loading = new Map<string, Promise<void>>();
  private containers = new Map<string, Promise<AssetContainer | null>>();
  private instances = new Set<PieceInstance>();
  private hierarchies = new Set<HierarchyInstance>();
  private thinMeshes: Mesh[] = [];

  constructor(private ctx: KitContext) {}

  register(key: string, factory: PieceFactory, opts: PieceOptions = {}) {
    this.regs.set(key, { factory, opts });
  }

  /**
   * Register a GLB piece with a procedural fallback. Until `preload` resolves
   * the GLB (or if it fails) the fallback is used, so the key is usable at
   * once. Replaces any earlier registration with the same key.
   */
  registerGlb(key: string, url: string, opts: GlbOptions = {}) {
    this.regs.set(key, { glbUrl: url, factory: opts.fallback, opts });
  }

  /** Register a hero asset from the HERO_ASSETS table (optionally with a builder for entries without one). */
  registerHero(key: HeroKey, fallback?: PieceFactory | HierarchyFactory) {
    const e = HERO_ASSETS[key] as HeroEntry;
    const fb = fallback ?? (e.build ? heroFactory(e.build) : undefined);
    this.registerGlb(key, e.url, { fallback: fb, shadow: e.shadow, merge: e.merge, variant: e.variant });
  }

  /** `alias` behaves like `target` (which may depend on the variant string). */
  registerAlias(alias: string, target: string | ((variant: string) => string)) {
    this.aliases.set(alias, typeof target === "string" ? () => target : target);
  }

  private resolve(key: string, variant = ""): string {
    const a = this.aliases.get(key);
    return a ? a(variant) : key;
  }

  has(key: string) {
    return this.regs.has(this.resolve(key)) || this.aliases.has(key);
  }

  /** Whether `key` currently renders from its GLB (false: procedural / fallback). */
  isGlbLoaded(key: string) {
    const r = this.regs.get(this.resolve(key));
    return !!(r?.glbBase || r?.glbRoot);
  }

  /**
   * Ensure GLB pieces are loaded and procedural prototypes are built. Each GLB
   * races a timeout; failures fall back to the procedural builder and never
   * reject. Resolves with the keys that ended up procedural.
   */
  async preload(keys: string[], timeoutMs = GLB_TIMEOUT_MS): Promise<string[]> {
    const fell: string[] = [];
    await Promise.allSettled(
      keys.map(async (k0) => {
        const k = this.resolve(k0);
        const reg = this.regs.get(k);
        if (!reg) return;
        if (reg.glbUrl && !reg.glbFailed && !reg.glbBase && !reg.glbRoot) {
          const ok = await Promise.race([
            this.loadGlb(k, reg).then(
              () => true,
              (e) => {
                console.warn(`AssetManager: GLB "${k}" failed, using fallback`, e);
                return false;
              },
            ),
            new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
          ]);
          if (!ok) {
            reg.glbFailed = true;
            fell.push(k);
          }
        }
        if (!reg.glbBase && !reg.glbRoot && reg.factory && reg.opts.merge !== false) this.proto(k, "");
      }),
    );
    return fell;
  }

  private loadContainer(url: string): Promise<AssetContainer | null> {
    let p = this.containers.get(url);
    if (!p) {
      p = (async () => {
        await import("@babylonjs/loaders/glTF");
        const { LoadAssetContainerAsync } = await import("@babylonjs/core/Loading/sceneLoader");
        return LoadAssetContainerAsync(url, this.ctx.scene);
      })();
      this.containers.set(url, p);
    }
    return p;
  }

  private async loadGlb(key: string, reg: Registration) {
    let p = this.loading.get(key);
    if (!p) {
      p = (async () => {
        const container = await this.loadContainer(reg.glbUrl!);
        if (!container) throw new Error("no container");
        if (reg.glbBase || reg.glbRoot || reg.glbFailed) return; // timed out meanwhile: keep the fallback
        container.addAllToScene();
        const roots = container.meshes.filter((m) => !m.parent);
        const root = roots.length === 1 ? roots[0] : container.transformNodes.find((t) => !t.parent);
        const meshes = container.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
        for (const m of meshes) {
          m.hasVertexAlpha = false;
          normalizeColors(m);
        }
        const disposeSlotMaterials = () => {
          for (const mat of container.materials) if (isSlot(mat.name)) mat.dispose();
        };
        if (reg.opts.merge === false) {
          for (const m of meshes) remapSlots(this.ctx, m);
          disposeSlotMaterials();
          const holder = new TransformNode(`glb:${key}`, this.ctx.scene);
          if (root) root.parent = holder;
          for (const m of meshes) m.isVisible = false;
          holder.setEnabled(false);
          reg.glbRoot = holder;
          return;
        }
        // bake the hierarchy (incl. the loader's handedness root) into ONE mesh
        for (const m of meshes) m.computeWorldMatrix(true);
        // merge while the materials still carry their slot names, then remap the merged mesh
        const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
        if (!merged) throw new Error("merge failed");
        merged.name = `glb:${key}`;
        tagSlots(merged);
        remapSlots(this.ctx, merged);
        disposeSlotMaterials();
        root?.dispose(false, false);
        for (const t of container.transformNodes) if (!t.isDisposed()) t.dispose(false, false);
        merged.isVisible = false;
        merged.isPickable = false;
        merged.freezeWorldMatrix();
        reg.glbBase = merged;
        // the fallback prototype (if it was already built) is superseded
        for (const [id, m] of [...this.protos]) {
          if (id.startsWith(`${key}#`)) {
            m.dispose();
            this.protos.delete(id);
          }
        }
      })();
      this.loading.set(key, p);
    }
    await p;
  }

  private proto(key0: string, variant: string): Mesh {
    const key = this.resolve(key0, variant);
    const id = `${key}#${variant}`;
    let m = this.protos.get(id);
    if (m) return m;
    const reg = this.regs.get(key);
    if (!reg) throw new Error(`AssetManager: unknown piece "${key0}"`);
    if (reg.glbBase) {
      if (!variant || !reg.opts.variant) return reg.glbBase;
      m = reg.glbBase.clone(id, null, true) as Mesh;
      m.makeGeometryUnique();
      m.metadata = { ...(reg.glbBase.metadata ?? {}) };
      m.unfreezeWorldMatrix();
      reg.opts.variant(m, variant);
    } else {
      if (!reg.factory) throw new Error(`AssetManager: no procedural piece "${key0}"`);
      const built = (reg.factory as PieceFactory)(this.ctx, variant);
      if (!(built instanceof Mesh)) throw new Error(`AssetManager: "${key0}" is a hierarchy piece, use instantiateHierarchy`);
      m = built;
      if (variant && reg.opts.variant) reg.opts.variant(m, variant);
    }
    m.name = id;
    m.isVisible = false;
    m.isPickable = false;
    // The invisible prototype stays at the origin. Note: shadow maps skip an
    // invisible source, so every InstancedMesh is registered as a caster itself
    // (see instantiate); thin-instance batches are visible meshes and just work.
    m.freezeWorldMatrix();
    if (reg.opts.tintable && !m.instancedBuffers?.color) {
      m.registerInstancedBuffer("color", 4);
      m.instancedBuffers.color = new Color4(1, 1, 1, 1);
    }
    if (reg.opts.shadow !== false) this.ctx.lighting?.addCaster(m);
    this.protos.set(id, m);
    return m;
  }

  /** Create one placed instance. Procedural pieces are synchronous; GLBs fall back until preloaded. */
  instantiate(key0: string, opts: InstantiateOpts = {}): PieceInstance {
    const variant = opts.variant ?? "";
    const key = this.resolve(key0, variant);
    const reg = this.regs.get(key);
    if (!reg) throw new Error(`AssetManager: unknown piece "${key0}"`);
    const scene = this.ctx.scene;
    let root: TransformNode;
    const meshes: AbstractMesh[] = [];

    if (reg.glbRoot) {
      const h = this.instantiateHierarchy(key, opts.name);
      root = h.root;
      meshes.push(...h.meshes);
    } else {
      const proto = this.proto(key, variant);
      const inst = proto.createInstance(opts.name ?? `${key}:i`);
      inst.isPickable = false;
      if (reg.opts.shadow !== false) this.ctx.lighting?.addCaster(inst);
      if (reg.opts.tintable) inst.instancedBuffers.color = opts.tint ? Color4.FromHexString(opts.tint.length === 7 ? opts.tint + "ff" : opts.tint) : new Color4(1, 1, 1, 1);
      root = inst;
      meshes.push(inst);
    }
    void scene;

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

  /**
   * Clone an unmerged piece's node hierarchy (the player). Uses the GLB when
   * loaded, else builds the procedural fallback. Meshes share geometry with
   * the prototype; materials are the runtime ones.
   */
  instantiateHierarchy(key0: string, name?: string): HierarchyInstance {
    const key = this.resolve(key0);
    const reg = this.regs.get(key);
    if (!reg) throw new Error(`AssetManager: unknown piece "${key0}"`);
    let root: TransformNode;
    let fromGlb = false;
    if (reg.glbRoot) {
      const src = reg.glbRoot;
      root = new TransformNode(name ?? key, this.ctx.scene);
      for (const child of src.getChildren()) {
        const c = child instanceof TransformNode ? (child as TransformNode).instantiateHierarchy(root, { doNotInstantiate: true }) : null;
        if (c) c.parent = root;
      }
      // Babylon names clones "Clone of <name>": restore the authored names so rigs can find their pivots
      for (const n of root.getDescendants(false)) n.name = n.name.replace(/^Clone of /, "");
      root.setEnabled(true);
      fromGlb = true;
    } else {
      if (!reg.factory) throw new Error(`AssetManager: no procedural piece "${key0}"`);
      root = (reg.factory as HierarchyFactory)(this.ctx);
      if (name) root.name = name;
    }
    const meshes = root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
    for (const m of meshes) {
      m.isVisible = true;
      m.isPickable = false;
      m.setEnabled(true);
      if (reg.opts.shadow !== false) this.ctx.lighting?.addCaster(m);
    }
    const hi: HierarchyInstance = {
      root,
      meshes,
      fromGlb,
      dispose: () => {
        this.hierarchies.delete(hi);
        root.dispose(false, false);
      },
    };
    this.hierarchies.add(hi);
    return hi;
  }

  /** Freeze a static instance's world matrix once it's placed. */
  freeze(pi: PieceInstance) {
    pi.root.computeWorldMatrix(true);
    for (const m of pi.meshes) m.freezeWorldMatrix();
    if (pi.root instanceof Mesh || pi.root instanceof TransformNode) pi.root.freezeWorldMatrix();
  }

  /** Many copies of one piece as thin instances (cheapest option; no per-copy tint). */
  thinInstances(key0: string, placements: ThinPlacement[], variant = ""): Mesh | null {
    if (!placements.length) return null;
    const key = this.resolve(key0, variant);
    const proto = this.proto(key, variant);
    const mesh = proto.clone(`${key}#${variant}:thin`, null, true) as Mesh;
    mesh.metadata = proto.metadata;
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
    for (const h of [...this.hierarchies]) h.dispose();
    for (const m of this.thinMeshes) m.dispose();
    this.thinMeshes = [];
  }

  /** Dispose everything (scene teardown). */
  disposeScene() {
    this.disposeInstances();
    for (const p of this.protos.values()) p.dispose();
    this.protos.clear();
    for (const r of this.regs.values()) {
      r.glbBase?.dispose();
      r.glbRoot?.dispose(false, true);
      r.glbBase = undefined;
      r.glbRoot = undefined;
      r.glbFailed = false;
    }
    this.containers.clear();
    this.loading.clear();
    glowRegistered = new WeakSet();
  }
}

/**
 * glTF vertex colours arrive as VEC3 (often normalized bytes); Babylon's
 * VertexData/merge assumes 4 floats per vertex, so expand to an updatable
 * RGBA float buffer.
 */
function normalizeColors(m: Mesh) {
  const vb = m.getVertexBuffer(VertexBuffer.ColorKind);
  if (!vb) return;
  const size = vb.getSize();
  const data = m.getVerticesData(VertexBuffer.ColorKind);
  if (!data) return;
  const n = m.getTotalVertices();
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = data[i * size];
    out[i * 4 + 1] = data[i * size + 1];
    out[i * 4 + 2] = data[i * size + 2];
    out[i * 4 + 3] = 1;
  }
  m.setVerticesData(VertexBuffer.ColorKind, out, true, 4);
}

/** Debug helper: the slot names a prototype ended up with. */
export function debugSlots(m: Mesh) {
  return slotsOf(m);
}
