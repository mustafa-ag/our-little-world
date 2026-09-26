// House interior (port of the cosy core of src/game/scenes/HouseScene.ts):
// one warm rectangular room built from procedural boxes / cylinders in the
// storybook palette, lit by its own hemi + 3 point lights (the exterior sun,
// hemi and lamp pool are excluded from it). It lives in the same Babylon
// scene as the exterior, far away at INTERIOR_ORIGIN, so the exterior world
// stays loaded (no rebuild on exit) and is simply out of the camera's reach.
//
// Hotspots (bed, wardrobe, photo wall, door) go through an InteractionSystem;
// triggering one only emits a uiEvent — the DOM layer (ui/house.ts) owns the
// Rest / Wardrobe / Photo wall panels and the fade in / out.
//
// Local room axes follow world/coords.ts: +X east, +Z north. The back wall is
// north (the follow camera sits south), the door is in the low south wall.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { controls, uiEvents } from "../../game/systems/controls";
import { store } from "../../game/systems/store";
import { propertyById } from "../../game/data/properties";
import { ACTIVE_REGION, PALETTE } from "../rendering/materials";
import type { GridCollider } from "../world/gridCollider";
import { InteractionSystem } from "../systems/interaction";

/** Far from every map (maps are < 200 tiles), beyond the camera's maxZ from any exterior view. */
export const INTERIOR_ORIGIN = { x: 2400, z: 2400 } as const;

const W = 8; // x: -4..4
const D = 6; // z: -3..3
const H = 2.7;

export type InteriorStyle = "cream" | "brown";

export interface InteriorOptions {
  title: string;
  interior: InteriorStyle;
  propertyId: string;
  /** The outside region's backdrop / horizon colour, seen through the window. */
  windowHex: string;
  night: boolean;
  shadows: boolean;
}

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const hex6 = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function mix(a: string, b: string, t: number) {
  return Color3.Lerp(Color3.FromHexString(a), Color3.FromHexString(b), t).toHexString();
}

/** Warm floorboards: staggered planks with soft seams and a little grain (own texture, so its tiling is ours). */
function plankTexture(scene: Scene, hex: string): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("int:planks", { width: size, height: size }, scene, true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const base = Color3.FromHexString(hex);
  const shade = (k: number) => base.scale(k).toHexString();
  const rows = 8;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (size / 2) + (r % 3) * 37;
    for (let i = -1; i < 2; i++) {
      const x = ((offset + i * (size / 2)) % size + size) % size;
      ctx.fillStyle = shade(0.94 + ((r * 7 + i * 3) % 5) * 0.03);
      ctx.fillRect(x, r * rh, size / 2, rh);
      ctx.fillRect(x - size, r * rh, size / 2, rh);
    }
    ctx.fillStyle = shade(0.72);
    ctx.fillRect(0, r * rh, size, 2); // seam between rows
    for (let i = 0; i < 2; i++) ctx.fillRect((offset + i * (size / 2)) % size, r * rh, 2, rh); // butt joints
    ctx.fillStyle = shade(0.88);
    for (let g = 0; g < 3; g++) ctx.fillRect(0, r * rh + 8 + g * 8, size, 1); // grain
  }
  t.update(false);
  return t;
}

/** Circle-vs-AABB room collider with axis-separated sliding (PlayerController only calls move()). */
function roomCollider(bounds: Box, boxes: Box[]): GridCollider {
  const hits = (x: number, z: number, r: number) => {
    if (x - r < bounds.x0 || x + r > bounds.x1 || z - r < bounds.z0 || z + r > bounds.z1) return true;
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  };
  return {
    w: 0,
    h: 0,
    blocked: [],
    isBlockedAt: (x, z) => hits(x, z, 0),
    isBlockedTile: () => false,
    move(x, z, dx, dz, r) {
      let nx = x;
      let nz = z;
      if (dx && !hits(x + dx, nz, r)) nx = x + dx;
      if (dz && !hits(nx, nz + dz, r)) nz = nz + dz;
      return { x: nx, z: nz };
    },
    block() {},
    unblock() {},
  };
}

export class InteriorScene {
  readonly collider: GridCollider;
  readonly interaction = new InteractionSystem();
  /** World-space spawn just inside the door, facing into the room. */
  readonly spawn: { x: number; z: number };
  readonly title: string;
  readonly subtitle: string;

  private root: TransformNode;
  private meshes: Mesh[] = [];
  private mats = new Map<string, StandardMaterial>();
  private textures: DynamicTexture[] = [];
  private lights: Light[] = [];
  private shadowGen: ShadowGenerator | null = null;
  private excludedFrom: Light[] = [];
  private lastInteract = 0;
  private disposed = false;

  constructor(
    private scene: Scene,
    opts: InteriorOptions,
  ) {
    const O = INTERIOR_ORIGIN;
    this.root = new TransformNode("interior", scene);
    this.root.position.set(O.x, 0, O.z);

    const def = propertyById(opts.propertyId);
    const brown = opts.interior === "brown";
    this.title = opts.title;
    this.subtitle = brown ? "Inside · mind the stairs" : `${def.location} · ${def.type}`;

    // ---- palette (storybook: warm creams, soft wood, dusty rose accents) ----
    const wallHex = brown ? "#8a5f48" : hex6(def.wallColor);
    const wainscotHex = brown ? "#6b4535" : mix(wallHex, PALETTE.woodLight, 0.45);
    const trimHex = brown ? "#5a382c" : PALETTE.creamLight;
    const floorTint = brown ? "#b88a68" : hex6(def.floorTint);
    const skyHex = opts.night ? mix(opts.windowHex, "#1d2447", 0.72) : opts.windowHex;
    const groundHex = opts.night ? mix(ACTIVE_REGION.ground, "#141a30", 0.7) : ACTIVE_REGION.ground;
    const voidHex = brown ? "#2a1810" : "#2b2233";

    // ---- shell ----
    this.unlit("void", CreateBox("int:void", { width: 90, height: 0.02, depth: 90 }, scene), voidHex, 0, -0.08, 0);

    const planks = plankTexture(scene, brown ? PALETTE.wood : PALETTE.woodLight);
    planks.uScale = 2;
    planks.vScale = 1.5;
    this.textures.push(planks);
    const floorMat = this.mat("floor", floorTint);
    floorMat.diffuseTexture = planks;
    const floor = this.box("floor", W, 0.1, D, floorMat, 0, -0.05, 0);
    floor.receiveShadows = true;

    const wall = this.mat("wall", wallHex);
    const wainscot = this.mat("wainscot", wainscotHex);
    const trim = this.mat("trim", trimHex);
    this.box("wallN", W + 0.4, H, 0.2, wall, 0, H / 2, D / 2 + 0.1).receiveShadows = true;
    this.box("wallW", 0.2, H, D + 0.2, wall, -W / 2 - 0.1, H / 2, 0).receiveShadows = true;
    this.box("wallE", 0.2, H, D + 0.2, wall, W / 2 + 0.1, H / 2, 0).receiveShadows = true;
    // lower wainscot panels + skirting + crown trim
    this.box("wainN", W, 0.85, 0.03, wainscot, 0, 0.425, D / 2 - 0.015);
    this.box("wainW", 0.03, 0.85, D, wainscot, -W / 2 + 0.015, 0.425, 0);
    this.box("wainE", 0.03, 0.85, D, wainscot, W / 2 - 0.015, 0.425, 0);
    this.box("railN", W, 0.06, 0.06, trim, 0, 0.86, D / 2 - 0.03);
    this.box("railW", 0.06, 0.06, D, trim, -W / 2 + 0.03, 0.86, 0);
    this.box("railE", 0.06, 0.06, D, trim, W / 2 - 0.03, 0.86, 0);
    this.box("crownN", W + 0.4, 0.1, 0.3, trim, 0, H + 0.05, D / 2 + 0.05);
    this.box("crownW", 0.3, 0.1, D + 0.2, trim, -W / 2 - 0.05, H + 0.05, 0);
    this.box("crownE", 0.3, 0.1, D + 0.2, trim, W / 2 + 0.05, H + 0.05, 0);
    // low south wall with the doorway (kept low so the camera sees in)
    const doorHalf = 0.7;
    const sideW = W / 2 - doorHalf + 0.2;
    this.box("wallSW", sideW, 0.45, 0.2, wall, -(doorHalf + sideW / 2), 0.225, -D / 2 - 0.1);
    this.box("wallSE", sideW, 0.45, 0.2, wall, doorHalf + sideW / 2, 0.225, -D / 2 - 0.1);
    this.box("capSW", sideW, 0.05, 0.26, trim, -(doorHalf + sideW / 2), 0.47, -D / 2 - 0.1);
    this.box("capSE", sideW, 0.05, 0.26, trim, doorHalf + sideW / 2, 0.47, -D / 2 - 0.1);
    const doorWood = this.mat("doorWood", PALETTE.wood);
    // gate-height door posts (a full frame would hide Juju from the camera)
    this.box("postW", 0.16, 0.8, 0.26, doorWood, -doorHalf, 0.4, -D / 2 - 0.1);
    this.box("postE", 0.16, 0.8, 0.26, doorWood, doorHalf, 0.4, -D / 2 - 0.1);
    this.sphere("postCapW", 0.2, this.mat("gold", PALETTE.lamp), -doorHalf, 0.86, -D / 2 - 0.1);
    this.sphere("postCapE", 0.2, this.mat("gold", PALETTE.lamp), doorHalf, 0.86, -D / 2 - 0.1);
    this.box("doormat", 1.1, 0.02, 0.55, this.mat("doormat", PALETTE.sage), 0, 0.01, -D / 2 + 0.4);

    // ---- window (back wall, left of centre) showing the region's sky ----
    const wx = -1.0;
    const wy = 1.6;
    this.box("winFrame", 1.66, 1.26, 0.08, trim, wx, wy, D / 2 - 0.02);
    this.unlit("winSky", CreateBox("int:winSky", { width: 1.5, height: 0.8, depth: 0.02 }, scene), skyHex, wx, wy + 0.15, D / 2 - 0.07);
    this.unlit("winLand", CreateBox("int:winLand", { width: 1.5, height: 0.3, depth: 0.02 }, scene), groundHex, wx, wy - 0.4, D / 2 - 0.07);
    this.box("winMullV", 0.06, 1.1, 0.03, trim, wx, wy, D / 2 - 0.09);
    this.box("winMullH", 1.5, 0.06, 0.03, trim, wx, wy, D / 2 - 0.09);
    this.box("winSill", 1.84, 0.07, 0.24, trim, wx, wy - 0.63, D / 2 - 0.1);
    const curtain = this.mat("curtain", PALETTE.dustyRose);
    this.box("curtainL", 0.34, 1.55, 0.06, curtain, wx - 0.95, wy - 0.05, D / 2 - 0.12);
    this.box("curtainR", 0.34, 1.55, 0.06, curtain, wx + 0.95, wy - 0.05, D / 2 - 0.12);
    this.box("curtainRod", 2.4, 0.04, 0.04, doorWood, wx, wy + 0.75, D / 2 - 0.12);

    // ---- bed (back-left corner) ----
    const wood = this.mat("wood", PALETTE.woodLight);
    const woodDark = this.mat("woodDark", PALETTE.wood);
    const bx = -3.1;
    const casters: AbstractMesh[] = [];
    casters.push(this.box("bedFrame", 1.5, 0.34, 2.2, wood, bx, 0.17, 1.85));
    this.box("mattress", 1.4, 0.18, 2.1, this.mat("mattress", PALETTE.creamLight), bx, 0.43, 1.85);
    casters.push(this.box("duvet", 1.48, 0.1, 1.45, this.mat("duvet", brown ? PALETTE.heather : PALETTE.dustyRose), bx, 0.56, 1.42));
    this.box("duvetFold", 1.48, 0.07, 0.22, this.mat("fold", PALETTE.cream), bx, 0.59, 2.18);
    const pillow = this.mat("pillow", "#fffaf0");
    this.box("pillowL", 0.56, 0.14, 0.36, pillow, bx - 0.34, 0.6, 2.62);
    this.box("pillowR", 0.56, 0.14, 0.36, pillow, bx + 0.34, 0.6, 2.62);
    this.box("headboard", 1.62, 1.1, 0.1, woodDark, bx, 0.55, D / 2 - 0.06);
    this.box("footboard", 1.52, 0.5, 0.08, woodDark, bx, 0.25, 0.74);

    // nightstand + lamp
    casters.push(this.box("nightstand", 0.5, 0.55, 0.45, wood, -2.0, 0.275, 2.7));
    this.box("drawer", 0.4, 0.16, 0.02, woodDark, -2.0, 0.34, 2.47);
    this.cyl("lampBase", 0.12, 0.12, 0.22, this.mat("brass", PALETTE.mutedYellow), -2.0, 0.66, 2.7);
    this.unlit("lampShade", CreateCylinder("int:lampShade", { diameterTop: 0.2, diameterBottom: 0.36, height: 0.26, tessellation: 14 }, scene), "#ffe2a8", -2.0, 0.9, 2.7);

    // ---- photo wall (back wall, right of centre) ----
    const photos = Object.values(store.state.photos);
    const frameMat = this.mat("frame", PALETTE.woodLight);
    const blank = this.mat("photoBlank", PALETTE.cream);
    const tints = [PALETTE.sky, PALETTE.dustyRose, PALETTE.sage, PALETTE.mutedYellow, PALETTE.lavender];
    const frames: [number, number, number, number][] = [
      [0.72, 1.78, 0.42, 0.52],
      [1.26, 1.9, 0.46, 0.36],
      [1.76, 1.7, 0.36, 0.46],
      [0.96, 1.26, 0.36, 0.32],
      [1.5, 1.3, 0.42, 0.32],
    ];
    frames.forEach(([x, y, w, h], i) => {
      this.box(`photoFrame${i}`, w + 0.06, h + 0.06, 0.04, frameMat, x, y, D / 2 - 0.02);
      const inner = photos[i] ? this.mat(`photo${i}`, tints[i % tints.length]) : blank;
      this.box(`photo${i}`, w - 0.04, h - 0.04, 0.02, inner, x, y, D / 2 - 0.05);
    });
    // a little bunting of hearts above the frames
    const heart = this.mat("heart", "#e46d94");
    for (let i = 0; i < 6; i++) this.sphere(`bunting${i}`, 0.07, heart, 0.55 + i * 0.28, 2.28 - Math.sin((i / 5) * Math.PI) * 0.08, D / 2 - 0.06);

    // ---- wardrobe (back-right corner) ----
    const wardX = 3.1;
    casters.push(this.box("wardrobe", 1.3, 2.1, 0.7, wood, wardX, 1.05, D / 2 - 0.37));
    const doorPanel = this.mat("wardDoor", mix(PALETTE.woodLight, PALETTE.creamLight, 0.25));
    this.box("wardDoorL", 0.6, 1.86, 0.03, doorPanel, wardX - 0.31, 1.07, D / 2 - 0.735);
    this.box("wardDoorR", 0.6, 1.86, 0.03, doorPanel, wardX + 0.31, 1.07, D / 2 - 0.735);
    this.box("wardCrown", 1.42, 0.08, 0.8, woodDark, wardX, 2.14, D / 2 - 0.37);
    const gold = this.mat("gold", PALETTE.lamp);
    this.sphere("knobL", 0.07, gold, wardX - 0.07, 1.1, D / 2 - 0.76);
    this.sphere("knobR", 0.07, gold, wardX + 0.07, 1.1, D / 2 - 0.76);
    this.box("hatbox", 0.46, 0.26, 0.4, this.mat("hatbox", PALETTE.lavender), wardX + 0.25, 2.31, D / 2 - 0.4);

    // ---- shelf (east wall) with small items ----
    const sz = 0.2;
    this.box("shelfTop", 0.3, 0.05, 1.5, woodDark, W / 2 - 0.16, 1.5, sz);
    this.box("shelfLow", 0.3, 0.05, 1.5, woodDark, W / 2 - 0.16, 1.05, sz);
    const books = [PALETTE.awning, PALETTE.carTeal, PALETTE.mutedYellow, PALETTE.heather];
    books.forEach((c, i) => this.box(`book${i}`, 0.2, 0.26 - (i % 2) * 0.04, 0.07, this.mat(`book${i}`, c), W / 2 - 0.17, 1.655 - (i % 2) * 0.02, sz - 0.6 + i * 0.09));
    this.cyl("potSmall", 0.14, 0.11, 0.14, this.mat("terracotta", PALETTE.terracotta), W / 2 - 0.17, 1.595, sz + 0.2);
    this.sphere("plantSmall", 0.2, this.mat("leaf", PALETTE.sage), W / 2 - 0.17, 1.74, sz + 0.2);
    this.cyl("candle", 0.08, 0.08, 0.12, this.mat("candle", PALETTE.creamLight), W / 2 - 0.17, 1.585, sz + 0.52);
    this.box("keepsakeBox", 0.22, 0.14, 0.26, this.mat("keepsake", PALETTE.dustyRose), W / 2 - 0.17, 1.145, sz - 0.35);
    this.cyl("jar", 0.14, 0.14, 0.2, this.mat("glass", PALETTE.glass, 0.75), W / 2 - 0.17, 1.175, sz + 0.25);

    // ---- rug, pouf, corner plant ----
    const rug = this.cyl("rug", 2.6, 2.6, 0.02, this.mat("rug", brown ? PALETTE.terracottaMuted : PALETTE.lavender), 0.4, 0.012, 0.1, 32);
    rug.scaling.x = 1.3;
    rug.receiveShadows = true;
    const rugInner = this.cyl("rugInner", 1.8, 1.8, 0.022, this.mat("rugInner", PALETTE.creamLight), 0.4, 0.014, 0.1, 32);
    rugInner.scaling.x = 1.3;
    rugInner.receiveShadows = true;
    casters.push(this.cyl("pouf", 0.62, 0.62, 0.36, this.mat("pouf", PALETTE.mutedYellow), 1.8, 0.18, -1.0, 18));
    casters.push(this.cyl("pot", 0.44, 0.34, 0.42, this.mat("terracotta", PALETTE.terracotta), -3.45, 0.21, -2.35));
    const leaf = this.mat("leafBig", PALETTE.moss);
    casters.push(this.sphere("leaf0", 0.62, leaf, -3.45, 0.72, -2.35));
    casters.push(this.sphere("leaf1", 0.42, this.mat("leaf", PALETTE.sage), -3.3, 0.98, -2.28));

    // ---- lights: warm ceiling + bedside + window (+ a soft warm hemi) ----
    const toWorld = (x: number, y: number, z: number) => new Vector3(O.x + x, y, O.z + z);
    const hemi = new HemisphericLight("int:hemi", new Vector3(0.1, 1, -0.2), scene);
    hemi.diffuse = Color3.FromHexString("#ffe9cf");
    hemi.groundColor = Color3.FromHexString(brown ? "#4a2e22" : "#7a5a48");
    hemi.specular = Color3.Black();
    hemi.intensity = brown ? 0.42 : opts.night ? 0.45 : 0.55;
    const main = new PointLight("int:ceiling", toWorld(0.2, 2.45, 0.3), scene);
    main.diffuse = Color3.FromHexString("#ffd9a8");
    main.specular = Color3.Black();
    main.intensity = opts.night ? 0.95 : 0.75;
    main.range = 14;
    const bedside = new PointLight("int:bedside", toWorld(-2.0, 1.05, 2.45), scene);
    bedside.diffuse = Color3.FromHexString("#ffb46e");
    bedside.specular = Color3.Black();
    bedside.intensity = opts.night ? 0.8 : 0.45;
    bedside.range = 4.5;
    const windowLight = new PointLight("int:window", toWorld(wx, 1.6, 2.4), scene);
    windowLight.diffuse = Color3.FromHexString(skyHex);
    windowLight.specular = Color3.Black();
    windowLight.intensity = opts.night ? 0.2 : 0.55;
    windowLight.range = 6;
    this.lights = [hemi, main, bedside, windowLight];

    // interior meshes see only interior lights; exterior lights skip them
    for (const l of this.lights) l.includedOnlyMeshes = [...this.meshes];
    for (const l of scene.lights) {
      if (this.lights.includes(l)) continue;
      l.excludedMeshes = [...l.excludedMeshes, ...this.meshes];
      this.excludedFrom.push(l);
    }

    // soft shadows from the ceiling light (desktop only; cube maps are 6 passes)
    if (opts.shadows) {
      try {
        const sg = new ShadowGenerator(512, main);
        sg.usePoissonSampling = true;
        sg.darkness = 0.45;
        sg.bias = 0.004;
        for (const m of casters) sg.addShadowCaster(m, false);
        this.shadowGen = sg;
      } catch {
        this.shadowGen = null;
      }
    }

    // ---- collision + hotspots (world space) ----
    const ox = (x: number) => O.x + x;
    const oz = (z: number) => O.z + z;
    const box = (x0: number, x1: number, z0: number, z1: number): Box => ({ x0: ox(x0), x1: ox(x1), z0: oz(z0), z1: oz(z1) });
    this.collider = roomCollider(box(-W / 2 + 0.05, W / 2 - 0.05, -D / 2 + 0.15, D / 2 - 0.05), [
      box(-4, -2.34, 0.72, 3), // bed
      box(-2.26, -1.74, 2.46, 3), // nightstand
      box(2.44, 3.76, 2.2, 3), // wardrobe
      box(-3.7, -3.2, -2.6, -2.1), // plant
      box(1.5, 2.1, -1.3, -0.7), // pouf
      box(W / 2 - 0.32, W / 2, sz - 0.76, sz + 0.76), // shelf (head height, keep her off the wall)
    ]);
    this.spawn = { x: ox(0), z: oz(-1.7) };

    const hot = (id: string, x: number, z: number, radius: number, prompt: string, event: string) =>
      this.interaction.add({ id, x: ox(x), z: oz(z), radius, prompt, kind: "zone", trigger: () => uiEvents.emit(event) });
    hot("int:bed", -1.9, 1.5, 1.0, "Rest in bed", "houseRest");
    hot("int:wardrobe", wardX, 1.75, 0.9, "Open the wardrobe", "openWardrobe");
    hot("int:photos", 1.25, 2.45, 0.85, "Look at the photo wall", "openPhotoWall");
    hot("int:door", 0, -2.5, 0.75, "Go outside", "leaveHouse");

    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("uiClosed", this.onUiClosed, this);
  }

  /** The player's meshes cast the ceiling light's shadow while indoors. */
  addShadowCasters(meshes: AbstractMesh[]) {
    if (!this.shadowGen) return;
    for (const m of meshes) this.shadowGen.addShadowCaster(m, false);
  }

  update(px: number, pz: number) {
    if (this.disposed) return;
    this.interaction.update(px, pz);
  }

  private onUiClosed() {
    this.lastInteract = performance.now();
  }

  private tryInteract() {
    if (controls.locked || this.disposed) return;
    const t = performance.now();
    if (t - this.lastInteract < 250) return;
    if (this.interaction.currentPrompt) {
      this.lastInteract = t;
      this.interaction.triggerCurrent();
    }
  }

  // ---- mesh helpers ----
  private mat(name: string, hex: string, alpha = 1) {
    const key = `${name}:${hex}:${alpha}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new StandardMaterial(`int:${key}`, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    m.fogEnabled = false;
    m.maxSimultaneousLights = Math.max(m.maxSimultaneousLights, 4);
    if (alpha < 1) m.alpha = alpha;
    this.mats.set(key, m);
    return m;
  }

  private place(mesh: Mesh, x: number, y: number, z: number) {
    mesh.parent = this.root;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    this.meshes.push(mesh);
    return mesh;
  }

  private box(name: string, w: number, h: number, d: number, mat: StandardMaterial, x: number, y: number, z: number) {
    const m = CreateBox(`int:${name}`, { width: w, height: h, depth: d }, this.scene);
    m.material = mat;
    return this.place(m, x, y, z);
  }

  private cyl(name: string, top: number, bottom: number, h: number, mat: StandardMaterial, x: number, y: number, z: number, tess = 14) {
    const m = CreateCylinder(`int:${name}`, { diameterTop: top, diameterBottom: bottom, height: h, tessellation: tess }, this.scene);
    m.material = mat;
    return this.place(m, x, y, z);
  }

  private sphere(name: string, d: number, mat: StandardMaterial, x: number, y: number, z: number) {
    const m = CreateSphere(`int:${name}`, { diameter: d, segments: 8 }, this.scene);
    m.material = mat;
    return this.place(m, x, y, z);
  }

  /** Self-lit surface (window view, lamp shade, the dark void around the room). */
  private unlit(name: string, mesh: Mesh, hex: string, x: number, y: number, z: number) {
    const m = new StandardMaterial(`int:unlit:${name}`, this.scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(hex);
    m.fogEnabled = false;
    this.mats.set(`unlit:${name}`, m);
    mesh.material = m;
    return this.place(mesh, x, y, z);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("uiClosed", this.onUiClosed, this);
    if (this.interaction.currentPrompt) uiEvents.emit("prompt", null);
    this.interaction.clear();
    const mine = new Set<AbstractMesh>(this.meshes);
    for (const l of this.excludedFrom) l.excludedMeshes = l.excludedMeshes.filter((m) => !mine.has(m));
    this.shadowGen?.dispose();
    for (const l of this.lights) l.dispose();
    for (const m of this.meshes) m.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.root.dispose();
    this.meshes = [];
  }
}
