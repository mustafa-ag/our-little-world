// Keeps the player visible: buildings between the camera and the player fade
// out smoothly and come back once the line of sight is clear.
//
// Approach (cheap, works for both thin-instanced batches and standalone meshes):
//  - every ~0.1 s the camera->player segments (to the feet, the head and both
//    sides of the waist, AABBs inflated by a small radius) are slab-tested
//    against the occluder AABBs (a flat scan: a location has ~100-200
//    buildings). A building the camera itself is almost inside (closer than
//    `nearRadius`) fades too, so near façades never wall off the frame;
//  - a standalone mesh (hero GLB building) simply animates `mesh.visibility`
//    (Babylon then renders it in the alpha-blended pass);
//  - a thin instance can't be faded on its own, so it is "lifted out": its
//    matrix in the batch is collapsed to zero scale and a proxy mesh sharing the
//    batch's geometry, sub-meshes and (frozen) materials draws that one copy with
//    `visibility` < 1. The proxy keeps casting the shadow. (Material clones with
//    a depth pre-pass were tried to hide inner walls, but clones of the kit /
//    GLB materials rendered black, so the faded house shows a soft ghost of its
//    interior faces.)
//    Proxies are cached per occluder; batch buffers are made dynamic the first
//    time one of their instances fades.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";

/** A building (or other big static piece) that may hide the player. */
export interface OccluderInfo {
  id: string;
  /** World-space AABB. */
  min: Vector3;
  max: Vector3;
  /** The batch mesh (thin-instanced) or the standalone mesh. */
  mesh: Mesh;
  /** Index of the thin instance inside `mesh`, when thin-instanced. */
  thinIndex?: number;
}

export interface OcclusionOptions {
  /** Alpha of a fully faded occluder. */
  fadedAlpha?: number;
  /** Seconds between line-of-sight tests. */
  interval?: number;
  /** Occluders closer than this to the camera fade as well (0 = off). */
  nearRadius?: number;
  /** Casters to keep the proxy's shadow (optional). */
  addCaster?: (m: AbstractMesh) => void;
  removeCaster?: (m: AbstractMesh) => void;
}

export interface Occlusion {
  setOccluders(list: OccluderInfo[]): void;
  /** Camera position and the player's feet position (world). */
  update(dt: number, cam: Vector3, player: Vector3, playerHeight?: number): void;
  /** Number of occluders currently (partly) faded. */
  readonly fadedCount: number;
  /** Restore everything and drop the occluder list (before a location unload). */
  clear(): void;
  dispose(): void;
}

interface State {
  occ: OccluderInfo;
  alpha: number;
  want: number;
  proxy: Mesh | null;
  /** original matrix of the thin instance (16 floats) */
  saved: Float32Array | null;
  lifted: boolean;
}

const tmpDir = new Vector3();

/** Segment p0->p1 vs AABB (inflated by r). */
function segHitsBox(p0: Vector3, p1: Vector3, min: Vector3, max: Vector3, r: number) {
  tmpDir.copyFrom(p1).subtractInPlace(p0);
  let t0 = 0;
  let t1 = 1;
  const o = [p0.x, p0.y, p0.z];
  const d = [tmpDir.x, tmpDir.y, tmpDir.z];
  const lo = [min.x - r, min.y - r, min.z - r];
  const hi = [max.x + r, max.y + r, max.z + r];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-6) {
      if (o[a] < lo[a] || o[a] > hi[a]) return false;
      continue;
    }
    let ta = (lo[a] - o[a]) / d[a];
    let tb = (hi[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  // ignore boxes that only touch the far end (the player standing in a doorway)
  return t0 < 0.97;
}

export function createOcclusion(scene: Scene, opts: OcclusionOptions = {}): Occlusion {
  const fadedAlpha = opts.fadedAlpha ?? 0.28;
  const interval = opts.interval ?? 0.1;
  const nearR = opts.nearRadius ?? 2.2;
  let states: State[] = [];
  let timer = 0;
  const dynamicBatches = new WeakSet<Mesh>();
  const p0 = new Vector3();
  const pts = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  let faded = 0;

  const matrixData = (m: Mesh): Float32Array | null =>
    (m as unknown as { _thinInstanceDataStorage?: { matrixData: Float32Array | null } })._thinInstanceDataStorage?.matrixData ?? null;

  const writeInstance = (m: Mesh, index: number, src: Float32Array) => {
    const data = matrixData(m);
    if (!data) return;
    data.set(src, index * 16);
    if (!dynamicBatches.has(m)) {
      // the batch was uploaded as a static buffer: re-upload it once as dynamic
      const keepBounds = m.doNotSyncBoundingInfo;
      m.doNotSyncBoundingInfo = true;
      m.thinInstanceSetBuffer("matrix", data, 16, false);
      m.doNotSyncBoundingInfo = keepBounds;
      dynamicBatches.add(m);
    } else {
      m.thinInstancePartialBufferUpdate("matrix", 1, index);
    }
  };

  const makeProxy = (st: State): Mesh | null => {
    const src = st.occ.mesh;
    const data = matrixData(src);
    const i = st.occ.thinIndex ?? 0;
    if (!data || !src.geometry || i * 16 + 16 > data.length) return null;
    const proxy = new Mesh(`${st.occ.id}:fade`, scene);
    src.geometry.applyToMesh(proxy);
    proxy.subMeshes = [];
    for (const sm of src.subMeshes ?? []) new SubMesh(sm.materialIndex, sm.verticesStart, sm.verticesCount, sm.indexStart, sm.indexCount, proxy);
    proxy.material = src.material;
    proxy.isPickable = false;
    proxy.receiveShadows = src.receiveShadows;
    proxy.freezeWorldMatrix(Matrix.FromArray(data, i * 16));
    proxy.refreshBoundingInfo();
    proxy.setEnabled(false);
    return proxy;
  };

  const collapse = (src: Float32Array): Float32Array => {
    const z = src.slice();
    for (let k = 0; k < 11; k++) if (k !== 3 && k !== 7) z[k] = 0;
    return z;
  };

  const meshesOf = (m: Mesh): AbstractMesh[] => [m, ...m.getChildMeshes(false)];

  const setAlpha = (st: State, a: number) => {
    st.alpha = a;
    const thin = st.occ.thinIndex !== undefined;
    if (!thin) {
      for (const m of meshesOf(st.occ.mesh)) {
        m.visibility = a >= 0.999 ? 1 : a;
      }
      return;
    }
    if (a >= 0.999) {
      if (st.lifted && st.saved) {
        writeInstance(st.occ.mesh, st.occ.thinIndex!, st.saved);
        st.lifted = false;
      }
      if (st.proxy) {
        st.proxy.setEnabled(false);
        opts.removeCaster?.(st.proxy);
      }
      return;
    }
    if (!st.lifted) {
      if (!st.proxy) st.proxy = makeProxy(st);
      const data = matrixData(st.occ.mesh);
      if (!st.proxy || !data) return;
      const i = st.occ.thinIndex!;
      st.saved = data.slice(i * 16, i * 16 + 16);
      writeInstance(st.occ.mesh, i, collapse(st.saved));
      st.proxy.setEnabled(true);
      opts.addCaster?.(st.proxy);
      st.lifted = true;
    }
    if (st.proxy) st.proxy.visibility = a;
  };

  const restoreAll = () => {
    for (const st of states) {
      if (st.alpha < 1) setAlpha(st, 1);
      if (st.proxy) {
        opts.removeCaster?.(st.proxy);
        st.proxy.dispose(false, false);
        st.proxy = null;
      }
    }
    faded = 0;
  };

  return {
    get fadedCount() {
      return faded;
    },
    setOccluders(list) {
      restoreAll();
      states = list.map((occ) => ({ occ, alpha: 1, want: 1, proxy: null, saved: null, lifted: false }));
    },
    update(dt, cam, player, playerHeight = 1.7) {
      if (!states.length) return;
      timer -= dt;
      if (timer <= 0) {
        timer = interval;
        p0.copyFrom(cam);
        // feet, head and both sides of the waist (perpendicular to the view in XZ)
        let sx = player.z - cam.z;
        let sz = cam.x - player.x;
        const sl = Math.hypot(sx, sz) || 1;
        sx = (sx / sl) * 0.45;
        sz = (sz / sl) * 0.45;
        const wy = player.y + playerHeight * 0.55;
        pts[0].set(player.x, player.y + 0.25, player.z);
        pts[1].set(player.x + sx, wy, player.z + sz);
        pts[2].set(player.x - sx, wy, player.z - sz);
        pts[3].set(player.x, player.y + playerHeight, player.z);
        // broad phase: the segment's own AABB
        const bx0 = Math.min(cam.x, player.x) - 1.5;
        const bx1 = Math.max(cam.x, player.x) + 1.5;
        const bz0 = Math.min(cam.z, player.z) - 1.5;
        const bz1 = Math.max(cam.z, player.z) + 1.5;
        for (const st of states) {
          const { min, max } = st.occ;
          let hit = false;
          if (max.x >= bx0 && min.x <= bx1 && max.z >= bz0 && min.z <= bz1 && !st.occ.mesh.isDisposed()) {
            if (nearR > 0) {
              const dx = Math.max(min.x - cam.x, 0, cam.x - max.x);
              const dy = Math.max(min.y - cam.y, 0, cam.y - max.y);
              const dz = Math.max(min.z - cam.z, 0, cam.z - max.z);
              hit = dx * dx + dy * dy + dz * dz < nearR * nearR;
            }
            if (!hit) for (const p of pts) {
              if (segHitsBox(p0, p, min, max, 0.3)) {
                hit = true;
                break;
              }
            }
          }
          st.want = hit ? fadedAlpha : 1;
        }
      }
      // smooth fades (~0.25 s out, ~0.45 s back in)
      let n = 0;
      for (const st of states) {
        if (st.alpha === st.want) {
          if (st.alpha < 1) n++;
          continue;
        }
        const out = st.want < st.alpha;
        const step = dt * (out ? 3 : 1.6);
        const a = out ? Math.max(st.want, st.alpha - step) : Math.min(st.want, st.alpha + step);
        if (!st.occ.mesh.isDisposed()) setAlpha(st, a);
        if (a < 1) n++;
      }
      faded = n;
    },
    clear() {
      restoreAll();
      states = [];
    },
    dispose() {
      this.clear();
    },
  };
}

/**
 * Fallback occluder list built from thin-instanced batches (used until the world
 * builder publishes its own `occluders`): one AABB per instance from the batch's
 * local geometry bounds.
 */
export function occludersFromThinMeshes(meshes: Iterable<AbstractMesh>, accept: (m: Mesh) => boolean): OccluderInfo[] {
  const out: OccluderInfo[] = [];
  const corner = new Vector3();
  const w = new Vector3();
  const mat = new Matrix();
  for (const am of meshes) {
    if (!(am instanceof Mesh) || !am.hasThinInstances || !accept(am)) continue;
    const pos = am.getVerticesData("position");
    const data = (am as unknown as { _thinInstanceDataStorage?: { matrixData: Float32Array | null; instancesCount: number } })._thinInstanceDataStorage;
    if (!pos || !data?.matrixData) continue;
    const lmin = new Vector3(Infinity, Infinity, Infinity);
    const lmax = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < pos.length; i += 3) {
      lmin.minimizeInPlaceFromFloats(pos[i], pos[i + 1], pos[i + 2]);
      lmax.maximizeInPlaceFromFloats(pos[i], pos[i + 1], pos[i + 2]);
    }
    for (let i = 0; i < data.instancesCount; i++) {
      Matrix.FromArrayToRef(data.matrixData, i * 16, mat);
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (let c = 0; c < 8; c++) {
        corner.set(c & 1 ? lmax.x : lmin.x, c & 2 ? lmax.y : lmin.y, c & 4 ? lmax.z : lmin.z);
        Vector3.TransformCoordinatesToRef(corner, mat, w);
        min.minimizeInPlace(w);
        max.maximizeInPlace(w);
      }
      out.push({ id: `${am.name}@${i}`, min, max, mesh: am, thinIndex: i });
    }
  }
  return out;
}
