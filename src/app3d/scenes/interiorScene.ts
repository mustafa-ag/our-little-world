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
import { BUILD_CATALOG } from "../../game/data/furnitureCatalog";
import { ACTIVE_REGION, PALETTE } from "../rendering/materials";
import type { GridCollider } from "../world/gridCollider";
import { InteractionSystem } from "../systems/interaction";
import { createLabel, type Label } from "../entities/Label";

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
  /** Only the player's owned primary home shows editable saved pieces. */
  showFurniture: boolean;
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

/**
 * Configuration for non-home interior variants.
 * Pass as the optional third constructor argument.
 * Omitting it (or `type: 'home'`) uses the existing home-bedroom build.
 */
export interface InteriorConfig {
  type: "home" | "cafe" | "campus-corridor" | "office" | "mall-lobby";
  region?: "gulf" | "scotland" | "london" | "default";
  /** Room width (X). Default 6. */
  width?: number;
  /** Room depth (Z). Default 5. */
  depth?: number;
  /** Room height. Default 2.8. */
  height?: number;
  propertyId?: string;
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
  private furnitureMeshes: Mesh[] = [];
  private furnitureLabels: Label[] = [];
  private propertyId: string;
  private propertyWidth: number;
  private propertyHeight: number;
  private showFurniture: boolean;
  private lastInteract = 0;
  private disposed = false;
  /** Tigor curled up on the rug (only built once he's part of the family). */
  private tigor: TransformNode | null = null;
  private tigorLabel: Label | null = null;

  constructor(
    private scene: Scene,
    opts: InteriorOptions,
    config?: InteriorConfig,
  ) {
    const O = INTERIOR_ORIGIN;
    this.root = new TransformNode("interior", scene);
    this.root.position.set(O.x, 0, O.z);

    // ── Non-home variant: build the config-driven room and return early ──────
    const effectiveType = config?.type ?? "home";
    if (effectiveType !== "home") {
      const W  = config?.width  ?? 6;
      const D  = config?.depth  ?? 5;
      const H  = config?.height ?? 2.8;

      this.propertyId     = config?.propertyId ?? "";
      this.propertyWidth  = W;
      this.propertyHeight = D;
      this.showFurniture  = false;

      const typeLabel: Record<string, string> = {
        "cafe": "Café", "campus-corridor": "Campus Corridor",
        "office": "Office", "mall-lobby": "Mall Lobby",
      };
      this.title    = typeLabel[effectiveType] ?? effectiveType;
      this.subtitle = effectiveType;

      // -- Shared shell: void, floor, walls, ceiling --------------------------
      this.unlit("void",
        CreateBox("int:void", { width: 90, height: 0.02, depth: 90 }, scene),
        "#2b2233", 0, -0.08, 0);

      const floorColors: Record<string, string> = {
        "cafe": "#7a4f28", "campus-corridor": "#d8d8d8",
        "office": "#6a6a72", "mall-lobby": "#d8d4cc",
      };
      const wallColors: Record<string, string> = {
        "cafe": "#f5f0e0", "campus-corridor": "#f0f0f0",
        "office": "#f0f0f0", "mall-lobby": "#f5f5f0",
      };
      const floorHex = floorColors[effectiveType] ?? "#c0c0c0";
      const wallHex  = wallColors[effectiveType]  ?? "#f0f0f0";

      if (effectiveType === "cafe") {
        const planks = plankTexture(scene, floorHex);
        planks.uScale = 2; planks.vScale = 1.5;
        this.textures.push(planks);
        const fm = this.mat("floor", floorHex);
        fm.diffuseTexture = planks;
        this.box("floor", W, 0.1, D, fm, 0, -0.05, 0).receiveShadows = true;
      } else {
        this.box("floor", W, 0.1, D, this.mat("floor", floorHex), 0, -0.05, 0).receiveShadows = true;
      }

      const wallMat = this.mat("wall", wallHex);
      this.box("wallN", W + 0.2, H, 0.2, wallMat, 0, H / 2, D / 2 + 0.1).receiveShadows = true;
      this.box("wallS", W + 0.2, H, 0.2, wallMat, 0, H / 2, -D / 2 - 0.1).receiveShadows = true;
      this.box("wallE", 0.2, H, D + 0.2, wallMat, W / 2 + 0.1, H / 2, 0).receiveShadows = true;
      this.box("wallW", 0.2, H, D + 0.2, wallMat, -W / 2 - 0.1, H / 2, 0).receiveShadows = true;
      this.box("ceiling", W + 0.2, 0.1, D + 0.2, this.mat("ceiling", "#f0f0ec"), 0, H + 0.05, 0);

      // -- Type-specific content ----------------------------------------------
      if (effectiveType === "cafe")             this.buildCafe(W, D, H);
      else if (effectiveType === "campus-corridor") this.buildCampusCorridor(W, D, H);
      else if (effectiveType === "office")      this.buildOffice(W, D, H);
      else if (effectiveType === "mall-lobby")  this.buildMallLobby(W, D, H);

      // -- Lights -------------------------------------------------------------
      const toWorld = (x: number, y: number, z: number) => new Vector3(O.x + x, y, O.z + z);
      const hemi = new HemisphericLight("int:hemi", new Vector3(0, 1, 0.1), scene);
      hemi.diffuse = Color3.FromHexString("#fff4e8");
      hemi.groundColor = Color3.FromHexString("#c8b890");
      hemi.specular = Color3.Black();
      hemi.intensity = 0.5;
      const ceiling = new PointLight("int:ceiling", toWorld(0, H - 0.2, 0), scene);
      ceiling.diffuse = Color3.FromHexString("#ffe4a8");
      ceiling.specular = Color3.Black();
      ceiling.intensity = 0.9;
      ceiling.range = Math.max(W, D) * 2;
      this.lights = [hemi, ceiling];

      if (effectiveType === "cafe") {
        // 3 pendant point lights: warm #ffe4b0, intensity 1.2, at y=2.4
        const pendantXZ: [number, number][] = [[-W / 4, D / 4], [0, 0], [-W / 4, -D / 4]];
        pendantXZ.forEach(([px, pz], i) => {
          const pl = new PointLight(`int:pendant${i}`, toWorld(px, 2.4, pz), scene);
          pl.diffuse = Color3.FromHexString("#ffe4b0");
          pl.specular = Color3.Black();
          pl.intensity = 1.2;
          pl.range = 4;
          this.lights.push(pl);
        });
      }

      // Interior light isolation
      for (const l of this.lights) l.includedOnlyMeshes = [...this.meshes];
      for (const l of scene.lights) {
        if (this.lights.includes(l)) continue;
        l.excludedMeshes = [...l.excludedMeshes, ...this.meshes];
        this.excludedFrom.push(l);
      }

      // -- Collision + spawn --------------------------------------------------
      const ox = (x: number) => O.x + x;
      const oz = (z: number) => O.z + z;
      const mkbox = (x0: number, x1: number, z0: number, z1: number): Box =>
        ({ x0: ox(x0), x1: ox(x1), z0: oz(z0), z1: oz(z1) });
      const obs = this.variantObstacles(effectiveType, W, D);
      this.collider = roomCollider(
        mkbox(-W / 2 + 0.05, W / 2 - 0.05, -D / 2 + 0.15, D / 2 - 0.05),
        obs.map(([x0, x1, z0, z1]) => mkbox(x0, x1, z0, z1)),
      );
      this.spawn = { x: ox(0), z: oz(-D / 2 + 0.5) };

      // Door hotspot (leave back to exterior)
      this.interaction.add({
        id: "int:door", x: ox(0), z: oz(-D / 2 + 0.4),
        radius: 0.75, prompt: "Go outside", kind: "zone",
        trigger: () => uiEvents.emit("leaveHouse"),
      });

      uiEvents.on("action", this.tryInteract, this);
      uiEvents.on("uiClosed", this.onUiClosed, this);
      uiEvents.on("furnitureChanged", this.onFurnitureChanged, this);
      return;
    }
    // ── End non-home branch ───────────────────────────────────────────────────

    const def = propertyById(opts.propertyId);
    this.propertyId = opts.propertyId;
    this.propertyWidth = def.width;
    this.propertyHeight = def.height;
    this.showFurniture = opts.showFurniture;
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

    // ---- Tigor (HouseScene.spawnHomeTigor): a little orange cat on the rug, home only ----
    const tigorAt = { x: -1.0, z: 0.25 };
    if (!brown && store.state.tigor.unlocked) {
      const node = new TransformNode("int:tigor", scene);
      node.parent = this.root;
      node.position.set(tigorAt.x, 0, tigorAt.z);
      node.rotation.y = 0.5;
      this.tigor = node;
      const fur = this.mat("tigorFur", "#e98a3a");
      const stripe = this.mat("tigorStripe", "#b8601f");
      const cream = this.mat("tigorBelly", PALETTE.creamLight);
      const cat: Mesh[] = [
        this.box("tigorBody", 0.42, 0.2, 0.26, fur, 0, 0.12, 0),
        this.box("tigorStripe0", 0.05, 0.205, 0.265, stripe, -0.08, 0.121, 0),
        this.box("tigorStripe1", 0.05, 0.205, 0.265, stripe, 0.06, 0.121, 0),
        this.box("tigorHead", 0.2, 0.18, 0.2, fur, 0.26, 0.2, 0),
        this.box("tigorMuzzle", 0.04, 0.07, 0.1, cream, 0.37, 0.16, 0),
        this.box("tigorEarL", 0.05, 0.08, 0.05, fur, 0.26, 0.32, -0.06),
        this.box("tigorEarR", 0.05, 0.08, 0.05, fur, 0.26, 0.32, 0.06),
        this.box("tigorTail", 0.3, 0.06, 0.06, stripe, -0.3, 0.07, 0.1),
      ];
      for (const m of cat) m.parent = node;
      casters.push(cat[0], cat[3]);
      const label = createLabel(scene, "Tigor 🐱", { scale: 0.8 });
      label.mesh.parent = this.root;
      label.setPosition(tigorAt.x, 0.72, tigorAt.z);
      this.tigorLabel = label;
      this.showTigor();
      store.on("petChanged", this.showTigor, this);
    }

    // Player-chosen furniture shares the legacy per-property save data. The
    // stored 2D room coordinates are projected into this room without changing
    // the save format, so old homes immediately appear furnished in 3D.
    this.renderFurniturePlacements();

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
      ...(this.tigor ? [box(tigorAt.x - 0.28, tigorAt.x + 0.28, tigorAt.z - 0.22, tigorAt.z + 0.22)] : []), // Tigor
    ]);
    this.spawn = { x: ox(0), z: oz(-1.7) };

    const hot = (id: string, x: number, z: number, radius: number, prompt: string, event: string) =>
      this.interaction.add({ id, x: ox(x), z: oz(z), radius, prompt, kind: "zone", trigger: () => uiEvents.emit(event) });
    hot("int:bed", -1.9, 1.5, 1.0, "Rest in bed", "houseRest");
    hot("int:wardrobe", wardX, 1.75, 0.9, "Open the wardrobe", "openWardrobe");
    hot("int:photos", 1.25, 2.45, 0.85, "Look at the photo wall", "openPhotoWall");
    hot("int:door", 0, -2.5, 0.75, "Go outside", "leaveHouse");
    if (!brown) {
      // the pouf by the rug: ui/house.ts opens the "who's nearby?" picker
      hot("int:invite", 1.8, -1.0, 1.0, "Invite someone over", "houseInvite");
      if (this.tigor) {
        this.interaction.add({
          id: "int:tigor",
          x: ox(tigorAt.x),
          z: oz(tigorAt.z),
          radius: 0.85,
          prompt: "Pet Tigor",
          kind: "zone",
          enabled: () => store.state.tigor.atHome,
          trigger: () => uiEvents.emit("petHomeTigor"),
        });
      }
    }

    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("uiClosed", this.onUiClosed, this);
    uiEvents.on("furnitureChanged", this.onFurnitureChanged, this);
  }

  /** Tigor is only in the room while he's waiting at home (not out following Juju). */
  private showTigor() {
    const home = store.state.tigor.unlocked && store.state.tigor.atHome;
    this.tigor?.setEnabled(home);
    this.tigorLabel?.mesh.setEnabled(home);
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

  private onFurnitureChanged(propertyId?: string) {
    if (!this.showFurniture) return;
    if (propertyId && propertyId !== this.propertyId) return;
    this.renderFurniturePlacements();
  }

  private renderFurniturePlacements() {
    if (this.furnitureMeshes.length) {
      const removing = new Set<AbstractMesh>(this.furnitureMeshes);
      this.meshes = this.meshes.filter((mesh) => !removing.has(mesh));
      for (const light of this.lights) light.includedOnlyMeshes = light.includedOnlyMeshes.filter((mesh) => !removing.has(mesh));
      for (const light of this.excludedFrom) light.excludedMeshes = light.excludedMeshes.filter((mesh) => !removing.has(mesh));
      for (const mesh of this.furnitureMeshes) mesh.dispose();
    }
    for (const label of this.furnitureLabels) label.dispose();
    this.furnitureMeshes = [];
    this.furnitureLabels = [];

    const placements = this.showFurniture ? store.state.properties[this.propertyId]?.furniture ?? [] : [];
    const palette = [PALETTE.dustyRose, PALETTE.sage, PALETTE.mutedYellow, PALETTE.sky, PALETTE.lavender, PALETTE.terracottaMuted];
    placements.forEach((piece, index) => {
      const nx = Math.max(0.08, Math.min(0.92, piece.x / (this.propertyWidth * 16)));
      const ny = Math.max(0.12, Math.min(0.88, piece.y / (this.propertyHeight * 16)));
      const x = (nx - 0.5) * 6.5;
      const z = (0.5 - ny) * 4.25;
      const isRug = piece.tex === "f_rug";
      const isTall = piece.tex === "f_bookshelf" || piece.tex === "f_fridge" || piece.tex === "f_vanity";
      let width = isRug ? 1.5 : piece.tex === "f_sofa" || piece.tex === "f_bed" ? 1.25 : 0.82;
      let depth = isRug ? 1.05 : piece.tex === "f_sofa" || piece.tex === "f_bed" ? 0.72 : 0.66;
      const height = isRug ? 0.04 : isTall ? 1.05 : piece.tex === "f_lamp" || piece.tex === "f_plant" ? 0.78 : 0.58;
      if (piece.rot) [width, depth] = [depth, width];
      const material = this.mat(`placed:${piece.tex}`, palette[index % palette.length]);
      const mesh = this.box(`placed:${index}:${piece.tex}`, width, height, depth, material, x, height / 2 + 0.02, z);
      mesh.receiveShadows = true;
      this.furnitureMeshes.push(mesh);
      for (const light of this.lights) if (!light.includedOnlyMeshes.includes(mesh)) light.includedOnlyMeshes.push(mesh);
      for (const light of this.excludedFrom) if (!light.excludedMeshes.includes(mesh)) light.excludedMeshes.push(mesh);

      const name = BUILD_CATALOG.find((item) => item.texture === piece.tex)?.name ?? piece.tex.replace(/^f_/, "").replace(/_/g, " ");
      const label = createLabel(this.scene, name, { scale: 0.62 });
      label.mesh.parent = this.root;
      label.setPosition(x, height + 0.38, z);
      this.furnitureLabels.push(label);
    });
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

  // ──────────────────────────────────────────────────────────────────────────
  // Variant room builders (called from the non-home constructor branch)
  // ──────────────────────────────────────────────────────────────────────────

  private buildCafe(W: number, D: number, H: number): void {
    // Warm timber floor already applied in shell; cream walls.
    // L-shaped counter in northeast corner
    const counterExt = this.mat("counterExt", "#f0e8d8");
    const counterTop = this.mat("counterTop", "#8a5a3a");
    const cx = W / 2 - 1.5;
    const cz = D / 2 - 0.4;
    this.box("counterLong",    2.0, 0.9, 0.5,  counterExt, cx,          0.45, cz);
    this.box("counterLongTop", 2.05, 0.06, 0.55, counterTop, cx,         0.93, cz);
    const sx2 = W / 2 - 0.25, sz2 = D / 2 - 1.2;
    this.box("counterShort",    0.5, 0.9, 1.0,  counterExt, sx2,  0.45, sz2);
    this.box("counterShortTop", 0.55, 0.06, 1.05, counterTop, sx2, 0.93, sz2);

    // 3 tables (cylinder r=0.4, h=0.75) + 2 chairs each
    const tableMat = this.mat("cafeTable", "#d8ceba");
    const chairMat = this.mat("cafeChair", "#a87858");
    const tables: [number, number][] = [
      [-W / 2 + 1.5,  D / 4],
      [-W / 2 + 1.5, -D / 4],
      [0.5,          -D / 4 + 0.2],
    ];
    tables.forEach(([tx, tz], i) => {
      this.cyl(`cafeTab${i}`, 0.4, 0.4, 0.75, tableMat, tx, 0.375, tz, 18);
      this.box(`cafeChA${i}`, 0.38, 0.42, 0.38, chairMat, tx + 0.65, 0.21, tz);
      this.box(`cafeChB${i}`, 0.38, 0.42, 0.38, chairMat, tx - 0.65, 0.21, tz);
    });

    // Window emissive panel on south wall
    this.unlit("cafeWin",
      CreateBox("int:cafeWin", { width: 1.5, height: 0.9, depth: 0.05 }, this.scene),
      "#fff8e0", 0, 1.6, -D / 2 + 0.03);

    // Pendant lamp shades (visual; matching point lights added in constructor)
    const pendantXZ: [number, number][] = [[-W / 4, D / 4], [0, 0], [-W / 4, -D / 4]];
    pendantXZ.forEach(([px, pz], i) => {
      this.unlit(`cafShade${i}`,
        CreateCylinder(`int:cafShd${i}`, { diameterTop: 0.15, diameterBottom: 0.36, height: 0.2, tessellation: 12 }, this.scene),
        "#ffe4a0", px, H - 0.45, pz);
    });
  }

  private buildCampusCorridor(W: number, D: number, H: number): void {
    // Locker row: 6 units along west wall, blue-grey
    const lockerMat = this.mat("locker", "#7a8fa0");
    const lockerLineMat = this.mat("lockerLine", "#5a6f80");
    const nLock = 6;
    const lSpacing = D / nLock;
    for (let i = 0; i < nLock; i++) {
      const lz = -D / 2 + lSpacing * 0.5 + i * lSpacing;
      this.box(`locker${i}`, 0.45, 1.6, lSpacing * 0.88, lockerMat,     -W / 2 + 0.325, 0.8, lz);
      this.box(`lkLine${i}`, 0.47, 0.02, lSpacing * 0.88, lockerLineMat, -W / 2 + 0.325, 1.36, lz);
    }

    // Notice board on east wall with 4 coloured rect patches
    this.box("noticeBoard", 1.2, 0.8, 0.06, this.mat("board", "#d4b87a"), W / 2 - 0.06, 1.5, 0);
    const patchColors = ["#d46060", "#60a0d4", "#80c870", "#e8c048"];
    patchColors.forEach((c, i) => {
      const pz = (i % 2 === 0 ? -0.24 : 0.24);
      const py = i < 2 ? 1.62 : 1.36;
      this.box(`patch${i}`, 0.38, 0.22, 0.02, this.mat(`ptch${i}`, c), W / 2 - 0.025, py, pz);
    });

    // Ceiling strip lights: 3 emissive boxes (fluorescent #f0f0ff)
    for (let i = 0; i < 3; i++) {
      const lz = -D / 3 + i * (D / 3);
      this.unlit(`strip${i}`,
        CreateBox(`int:strip${i}`, { width: W - 0.4, height: 0.06, depth: 0.28 }, this.scene),
        "#f0f0ff", 0, H - 0.04, lz);
    }

    // 2 doorway suggestion panels per side wall (east/west) – decorative recesses
    for (const sx of [-W / 2 + 0.02, W / 2 - 0.02]) {
      for (const dz of [-D / 4, D / 4]) {
        this.box(`dframe${sx > 0 ? "E" : "W"}${dz > 0 ? "n" : "s"}`,
          0.04, 2.0, 0.8, this.mat("doorArch", "#e0dcd8"), sx, 1.0, dz);
      }
    }

    void H; // used above via H - 0.04
  }

  private buildOffice(W: number, D: number, H: number): void {
    // Glass partition strips
    const glassMat = this.mat("offGlass", "#cfe3ee", 0.4);
    glassMat.backFaceCulling = false;
    for (let i = 0; i < 2; i++) {
      const gx = -W / 4 + i * (W / 2);
      this.box(`partition${i}`, 0.05, 1.5, D - 0.3, glassMat, gx, 0.75, 0);
    }

    // 3×2 desk grid with box monitors
    const deskMat    = this.mat("desk",    "#c8c0b0");
    const deskLegMat = this.mat("deskLeg", "#d0c8b8");
    const monMat     = this.mat("monitor", "#2a2a2a");
    const cols = 3, rows = 2;
    const colStep = (W - 1.6) / cols;
    const rowStep = (D - 1.0) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = -W / 2 + 0.9 + c * colStep;
        const dz = -D / 2 + 0.7 + r * rowStep;
        this.box(`deskTop${r}${c}`, 1.0, 0.05, 0.6, deskMat,    dx, 0.75, dz);
        this.box(`deskBod${r}${c}`, 1.0, 0.74, 0.6, deskLegMat, dx, 0.37, dz);
        this.box(`mon${r}${c}`,     0.5, 0.4, 0.05, monMat,      dx, 1.15, dz - 0.1);
        this.box(`monBase${r}${c}`, 0.14, 0.08, 0.2, deskMat,    dx, 0.79, dz - 0.1);
      }
    }

    void H;
  }

  private buildMallLobby(W: number, D: number, H: number): void {
    // Central pot plant
    this.cyl("lobPot",   0.5, 0.4, 0.5, this.mat("lobPot",  "#c0b090"), 0, 0.25, 0, 14);
    this.cyl("lobTrunk", 0.1, 0.12, 1.0, this.mat("lobTrunk", "#7a5a3a"), 0, 1.0, 0, 6);
    this.sphere("lobLeaf0", 1.2, this.mat("lobLeaf",  "#6b8a4e"), 0,   1.7, 0);
    this.sphere("lobLeaf1", 0.85, this.mat("lobLeaf2", "#8fa87c"), 0.3, 2.0, 0.2);

    // Reception desk near south wall
    this.box("recDesk", W * 0.4, 0.9, 0.5, this.mat("recDesk", "#e8e0d0"), 0, 0.45, -D / 2 + 1.0);

    void H;
  }

  /**
   * Returns [x0,x1,z0,z1] obstacle tuples (room-local) for each variant type,
   * used to build the circle-vs-AABB room collider.
   */
  private variantObstacles(type: InteriorConfig["type"], W: number, D: number): [number, number, number, number][] {
    switch (type) {
      case "cafe":
        return [
          // L-shaped counter (northeast)
          [W / 2 - 2.55, W / 2 - 0.05, D / 2 - 0.7, D / 2 - 0.05],
          [W / 2 - 0.6,  W / 2 - 0.05, D / 2 - 1.7, D / 2 - 0.7 ],
        ];
      case "campus-corridor":
        return [[-W / 2 + 0.05, -W / 2 + 0.6, -D / 2 + 0.05, D / 2 - 0.05]];
      case "office":
        return [
          [-W / 2 + 0.3, -W / 2 + 1.4, -D / 4 - 0.4, D / 4 + 0.4],
          [W / 2 - 1.4,  W / 2 - 0.3,  -D / 4 - 0.4, D / 4 + 0.4],
        ];
      case "mall-lobby":
        return [[-0.6, 0.6, -0.6, 0.6]];
      default:
        return [];
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("uiClosed", this.onUiClosed, this);
    store.off("petChanged", this.showTigor, this);
    uiEvents.off("furnitureChanged", this.onFurnitureChanged, this);
    if (this.interaction.currentPrompt) uiEvents.emit("prompt", null);
    this.interaction.clear();
    const mine = new Set<AbstractMesh>(this.meshes);
    for (const l of this.excludedFrom) l.excludedMeshes = l.excludedMeshes.filter((m) => !mine.has(m));
    this.shadowGen?.dispose();
    for (const l of this.lights) l.dispose();
    for (const m of this.meshes) m.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.tigorLabel?.dispose();
    this.tigorLabel = null;
    this.tigor?.dispose();
    this.tigor = null;
    for (const label of this.furnitureLabels) label.dispose();
    this.root.dispose();
    this.meshes = [];
  }
}
