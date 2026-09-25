// Sky: a camera-centred gradient dome (zenith -> horizon haze, with a warm
// glow toward the sun's azimuth in the evening) plus a handful of stylised
// low-poly cloud puffs drifting slowly near the horizon, and a moon at night.
// Everything is unlit (emissive x vertex colour), fog-free and recoloured from
// the lighting's Atmosphere, so it costs ~3 draw calls and no lights.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Atmosphere } from "./lighting";

export interface Sky {
  /** Recolour from the lighting palette. */
  setAtmosphere(a: Atmosphere): void;
  /** Per frame: follow the camera, drift the clouds. */
  update(dt: number, cam: Vector3): void;
  dispose(): void;
}

export const SKY_RADIUS = 470;

function rand(i: number, s: number) {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function unlitMaterial(scene: Scene, name: string, vertexColors = true): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.White();
  m.fogEnabled = false;
  if (!vertexColors) return m;
  return m;
}

export function createSky(scene: Scene): Sky {
  // ---- gradient dome ----
  const dome = CreateSphere("skyDome", { diameter: SKY_RADIUS * 2, segments: 20, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.renderingGroupId = 0;
  const domeMat = unlitMaterial(scene, "skyDomeMat");
  domeMat.backFaceCulling = false;
  domeMat.disableDepthWrite = true;
  dome.material = domeMat;
  const dpos = dome.getVerticesData("position")!;
  const dcol = new Float32Array((dpos.length / 3) * 4);
  // render first (before the opaque world)
  dome.alphaIndex = -1000;

  // ---- clouds: one merged puff shape, thin-instanced & drifting ----
  const parts: Mesh[] = [];
  const puff = (x: number, y: number, z: number, sx: number, sy: number, sz: number, i: number) => {
    const p = CreateIcoSphere("cloudPuff", { radius: 1, subdivisions: 2, flat: true }, scene);
    p.scaling.set(sx, sy, sz);
    p.position.set(x, y, z);
    p.rotation.y = i * 0.7;
    parts.push(p);
  };
  // a long, flat-bottomed storybook cloud: big central puff and shoulders
  puff(0, 1.2, 0, 7.5, 4.6, 5, 0);
  puff(-7, 0.4, 0.6, 5.5, 3.4, 4, 1);
  puff(7.5, 0.2, -0.4, 6, 3.2, 4.2, 2);
  puff(-12.5, -0.3, 0.2, 3.8, 2.2, 3, 3);
  puff(12.5, -0.4, 0.3, 3.6, 2.1, 3, 4);
  puff(3, 2.8, 0.5, 4.2, 3.2, 3.4, 5);
  const cloud = Mesh.MergeMeshes(parts, true, true)!;
  cloud.name = "clouds";
  // flatten the underside and bake a top-lit / bottom-shade gradient
  const cp = cloud.getVerticesData("position")!;
  const cc = new Float32Array((cp.length / 3) * 4);
  for (let i = 0; i < cp.length; i += 3) {
    if (cp[i + 1] < -1.2) cp[i + 1] = -1.2 + (cp[i + 1] + 1.2) * 0.15;
    const t = Math.max(0, Math.min(1, (cp[i + 1] + 1.2) / 6));
    const v = 0.72 + 0.28 * Math.pow(t, 0.6);
    const j = (i / 3) * 4;
    cc[j] = v;
    cc[j + 1] = v;
    cc[j + 2] = v;
    cc[j + 3] = 1;
  }
  cloud.setVerticesData("position", cp);
  cloud.setVerticesData("color", cc);
  cloud.isPickable = false;
  cloud.applyFog = false;
  const cloudMat = unlitMaterial(scene, "cloudMat");
  cloud.material = cloudMat;
  const clouds = Array.from({ length: 9 }, (_, i) => ({
    x: (rand(i, 1) - 0.5) * 900,
    // distance ahead (north) of the camera and height above it
    d: 300 + rand(i, 2) * 110,
    h: 8 + rand(i, 3) * 26,
    s: 0.9 + rand(i, 4) * 1.1,
    sy: 0.7 + rand(i, 5) * 0.4,
    rot: (rand(i, 6) - 0.5) * 0.5,
    speed: 0.9 + rand(i, 7) * 0.8,
  }));
  const cdata = new Float32Array(16 * clouds.length);
  cloud.thinInstanceSetBuffer("matrix", cdata, 16, false);
  cloud.alwaysSelectAsActiveMesh = true;

  // ---- moon (night only) ----
  const moon = CreateDisc("moon", { radius: 5, tessellation: 24 }, scene);
  const moonMat = unlitMaterial(scene, "moonMat", false);
  moonMat.emissiveColor = Color3.FromHexString("#f4ecd0");
  moon.material = moonMat;
  moon.applyFog = false;
  moon.isPickable = false;
  moon.setEnabled(false);

  const tmpM = new Matrix();
  const tmpQ = new Quaternion();
  const tmpS = new Vector3();
  const tmpP = new Vector3();
  const c = new Color3();
  let glowDir = new Vector3(-1, 0, 0);
  let atmo: Atmosphere | null = null;

  const recolourDome = (a: Atmosphere) => {
    // the glow sits where the sun is: opposite the light's travel direction
    glowDir = new Vector3(-a.sunDir.x, 0, -a.sunDir.z).normalize();
    for (let i = 0, j = 0; i < dpos.length; i += 3, j += 4) {
      const x = dpos[i] / SKY_RADIUS;
      const y = dpos[i + 1] / SKY_RADIUS;
      const z = dpos[i + 2] / SKY_RADIUS;
      // horizon band is tight, the zenith colour takes over by ~35 deg
      const t = Math.max(0, Math.min(1, (y + 0.02) / 0.5));
      const k = Math.pow(t, 0.55);
      Color3.LerpToRef(a.horizon, a.zenith, k, c);
      // below the horizon: melt into the ground haze
      if (y < 0) Color3.LerpToRef(c, a.haze, Math.min(1, -y * 8), c);
      // warm sun glow around the sun's azimuth, strongest low in the sky
      const h = Math.hypot(x, z) || 1;
      const facing = Math.max(0, (x / h) * glowDir.x + (z / h) * glowDir.z);
      const g = a.sunGlowStrength * Math.pow(facing, 3) * Math.max(0, 1 - Math.abs(y) * 2.2);
      Color3.LerpToRef(c, a.sunGlow, Math.min(1, g), c);
      dcol[j] = c.r;
      dcol[j + 1] = c.g;
      dcol[j + 2] = c.b;
      dcol[j + 3] = 1;
    }
    dome.setVerticesData("color", dcol, true);
  };

  return {
    setAtmosphere(a) {
      atmo = a;
      recolourDome(a);
      cloudMat.emissiveColor = a.cloudLit.clone();
      moon.setEnabled(a.night > 0.6);
    },
    update(dt, cam) {
      for (let i = 0; i < clouds.length; i++) {
        const cl = clouds[i];
        cl.x += cl.speed * dt;
        // wrap around the camera so the sky never runs out
        let rx = cl.x - cam.x * 0.95;
        rx = ((((rx + 450) % 900) + 900) % 900) - 450;
        cl.x = rx + cam.x * 0.95;
        tmpP.set(cam.x + rx, cam.y + cl.h, cam.z + cl.d);
        tmpS.set(cl.s, cl.s * cl.sy, cl.s);
        Quaternion.RotationYawPitchRollToRef(cl.rot, 0, 0, tmpQ);
        Matrix.ComposeToRef(tmpS, tmpQ, tmpP, tmpM);
        tmpM.copyToArray(cdata, i * 16);
      }
      cloud.thinInstanceBufferUpdated("matrix");
      if (moon.isEnabled()) moon.position.set(cam.x + 120, cam.y + 55, cam.z + 360);
      void atmo;
    },
    dispose() {
      dome.dispose();
      cloud.dispose();
      moon.dispose();
      domeMat.dispose();
      cloudMat.dispose();
      moonMat.dispose();
    },
  };
}

/** Build a vertex-coloured mesh from raw arrays (shared by the backdrop). */
export function meshFromArrays(scene: Scene, name: string, positions: number[], indices: number[], colors: number[]): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.colors = colors;
  vd.applyToMesh(m);
  m.isPickable = false;
  m.applyFog = false;
  return m;
}
