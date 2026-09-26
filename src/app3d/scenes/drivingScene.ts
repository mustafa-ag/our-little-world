// Arcade road trip (port of src/game/scenes/DrivingScene.ts): the Jeep on an
// endless, gently scrolling country road. No physics: the car only slides
// left / right, the road texture, verges, roadside trees, drifting rocks and
// oncoming traffic scroll toward the camera. Reach the goal distance and the
// trip ends (the DOM layer fades and Game3D.travelTo loads the destination).
//
// Like the house interior it lives in the shared Babylon scene, far from
// every map (DRIVE_ORIGIN), so the exterior stays loaded underneath and an
// aborted drive (Esc / End drive) drops you back where you parked.
//
// Local axes follow world/coords.ts: +X east, +Z north. The follow camera
// sits south looking north, so the car (hero "car", front at -Z, turned
// around) drives "into" the screen and the world scrolls toward -Z.
//
// Performance: the road and verges are three planes with their own small
// DynamicTextures (scrolled via vOffset); trees and rocks are one
// thin-instance batch each with a dynamic matrix buffer; traffic is a pool
// of two car instances.

import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { controls, uiEvents } from "../../game/systems/controls";
import { store } from "../../game/systems/store";
import * as quests from "../../game/systems/quests";
import { NPCS, type NpcDef } from "../../game/data/npcs";
import type { AssetManager, KitContext, PieceInstance } from "../assets/AssetManager";
import type { WorldArtProfile } from "../world/artProfile";
import { NpcView } from "../entities/NpcView";

/** Far from every map and from INTERIOR_ORIGIN, beyond the camera's maxZ from any other view. */
export const DRIVE_ORIGIN = { x: -2400, z: 2400 } as const;

const ROAD_W = 6.6; // three lanes
const ROAD_HALF = ROAD_W / 2;
const LANE = ROAD_W / 3;
const ROAD_TILE = 8; // world units per road-texture repeat
const NEAR = -18; // props recycle once they pass this (behind the camera)
const FAR = 95; // ...and respawn out here
const SPAN = FAR - NEAR;
const BASE_SPEED = 14; // units / s
const BOOST_SPEED = 23;
const STEER_SPEED = 7.5;
const GOAL = 440; // ~30 s at cruising speed
const TREE_COUNT = 28;
const ROCK_COUNT = 6;
const HIDDEN_Y = -60;
const FUEL_COST = 12;

const CHAT: Record<string, string[]> = {
  moomoo: ["aux?", "absolutely not", "😔", "this road always feels longer with you", "i'll drive next time. maybe."],
  fadwa: ["can we stop for food", "we just started", "so that's a yes"],
  mama: ["Habibti, slower.", "I'm going the limit.", "The limit is a suggestion, no?"],
  baba: ["Good car.", "Thanks Baba.", "Don't tell Mama I said that."],
};
const CHAT_DEFAULT = ["nice night for a drive", "mm.", "yeah"];
const RADIO = ["NOW PLAYING: definitely not copyrighted music", "TINY FM: coffee, weather, feelings", "ROAD RADIO: one song, no lawyers", "JUJU AUX: passenger approval pending"];
/** Who might be waving from the verge (the Phaser build only had lastPassenger). */
const HITCHERS = ["moomoo", "fadwa", "mama", "baba"];

export interface DriveOptions {
  destId: string;
  destName: string;
  passenger?: string;
  profile: WorldArtProfile;
  night: boolean;
}

export interface DriveHud {
  destName: string;
  progress: number;
  /** metres left, legacy HUD units */
  remaining: number;
  fuel: number;
  boost: number;
  boosting: boolean;
  passenger: string | null;
  /** 0..5, only meaningful with a passenger */
  composure: number;
  radio: string;
}

interface Prop {
  x: number;
  z: number;
  vx: number;
  rot: number;
  scale: number;
  active: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const npcName = (id: string) => NPCS.find((n) => n.id === id)?.name ?? id;

/** Asphalt with white edge lines and dashed lane dividers; one repeat = ROAD_TILE units. */
function roadTexture(k: KitContext, asphalt: string): DynamicTexture {
  const w = 128;
  const h = 256;
  const t = new DynamicTexture("drive:road", { width: w, height: h }, k.scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.fillStyle = asphalt;
  c.fillRect(0, 0, w, h);
  // speckle
  for (let i = 0; i < 420; i++) {
    c.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  c.fillStyle = "#f3eee2";
  c.fillRect(3, 0, 4, h);
  c.fillRect(w - 7, 0, 4, h);
  c.fillStyle = "#f4d35e";
  for (const x of [w / 3, (2 * w) / 3]) c.fillRect(x - 2, 20, 4, h / 2 - 40);
  t.wrapU = Texture.CLAMP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.update(false);
  return t;
}

/** Soft mottled verge (grass or sand), tiled; scrolls with the road. */
function vergeTexture(k: KitContext, hex: string, name: string): DynamicTexture {
  const s = 128;
  const t = new DynamicTexture(`drive:${name}`, { width: s, height: s }, k.scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.fillStyle = hex;
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < 160; i++) {
    c.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    const r = 2 + Math.random() * 5;
    c.beginPath();
    c.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
    c.fill();
  }
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.update(false);
  return t;
}

function plane(k: KitContext, name: string, w: number, d: number, tex: DynamicTexture, uScale: number, vScale: number, x: number, y: number, zc: number): { mesh: Mesh; mat: StandardMaterial } {
  const mesh = CreateGround(name, { width: w, height: d }, k.scene);
  const mat = new StandardMaterial(`${name}:mat`, k.scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  tex.uScale = uScale;
  tex.vScale = vScale;
  mesh.material = mat;
  mesh.position.set(DRIVE_ORIGIN.x + x, y, DRIVE_ORIGIN.z + zc);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();
  return { mesh, mat };
}

/** A thin-instance batch whose matrices are rewritten every frame. */
class MovingBatch {
  readonly data: Float32Array;
  private m = new Matrix();
  private q = new Quaternion();
  private s = new Vector3();
  private p = new Vector3();

  constructor(
    readonly mesh: Mesh,
    readonly count: number,
  ) {
    this.data = new Float32Array(16 * count);
    mesh.thinInstanceSetBuffer("matrix", this.data, 16, false);
    // positions change every frame: skip per-frame bounding refreshes
    mesh.alwaysSelectAsActiveMesh = true;
  }

  set(i: number, x: number, y: number, z: number, rotY: number, scale: number) {
    Quaternion.RotationYawPitchRollToRef(rotY, 0, 0, this.q);
    this.s.setAll(scale);
    this.p.set(DRIVE_ORIGIN.x + x, y, DRIVE_ORIGIN.z + z);
    Matrix.ComposeToRef(this.s, this.q, this.p, this.m);
    this.m.copyToArray(this.data, i * 16);
  }

  flush() {
    this.mesh.thinInstanceBufferUpdated("matrix");
  }
}

export class DrivingScene {
  private car: PieceInstance;
  private roadTex: DynamicTexture;
  private vergeTexL: DynamicTexture;
  private vergeTexR: DynamicTexture;
  private planes: { mesh: Mesh; mat: StandardMaterial }[] = [];
  private treeBatches: { batch: MovingBatch; props: Prop[] }[] = [];
  private rockBatch: MovingBatch | null = null;
  private rocks: Prop[] = [];
  private traffic: { inst: PieceInstance; p: Prop }[] = [];
  private hitcher: { view: NpcView; id: string; z: number } | null = null;
  private hitcherDone = false;

  private carX = 0;
  private steerVis = 0;
  private bounce = 0;
  private distance = 0;
  private speed = BASE_SPEED;
  private boost = 1;
  private boosting = false;
  private rockT = 1.2;
  private trafficT = 2.5;
  private chatT = 4;
  private chatI = 0;
  private radioT = 0;
  private radioI: number;
  private hudT = 0;
  private lastHonk = 0;
  private bumps = 0;
  private near = 0;
  private finished = false;
  private passenger: string | undefined;
  private readonly startFuel: number;

  private keys = new Set<string>();
  private touchBoost = false;
  private offs: (() => void)[] = [];

  constructor(
    private k: KitContext,
    private am: AssetManager,
    private opts: DriveOptions,
    private events: { onArrive(): void },
  ) {
    const prof = opts.profile;
    this.passenger = opts.passenger;
    this.startFuel = store.state.fuel;
    this.radioI = store.state.currentDay % RADIO.length;

    // ---- road + verges ----
    this.roadTex = roadTexture(k, prof.roadSurface === "setts" ? "#77716a" : "#5d5a58");
    const vergeHex = prof.hasSand ? prof.sandColor : prof.groundColor;
    this.vergeTexL = vergeTexture(k, vergeHex, "vergeL");
    this.vergeTexR = vergeTexture(k, vergeHex, "vergeR");
    const zc = (NEAR + FAR) / 2;
    const vergeW = 40;
    this.planes.push(plane(k, "drive:road", ROAD_W, SPAN, this.roadTex, 1, SPAN / ROAD_TILE, 0, 0.02, zc));
    this.planes.push(plane(k, "drive:vergeL", vergeW, SPAN, this.vergeTexL, vergeW / 6, SPAN / 6, -ROAD_HALF - vergeW / 2, 0, zc));
    this.planes.push(plane(k, "drive:vergeR", vergeW, SPAN, this.vergeTexR, vergeW / 6, SPAN / 6, ROAD_HALF + vergeW / 2, 0, zc));
    // kerb strips
    for (const side of [-1, 1]) {
      const kerb = CreateGround(`drive:kerb${side}`, { width: 0.25, height: SPAN }, k.scene);
      kerb.material = k.mats.flat(prof.sidewalkColor);
      kerb.position.set(DRIVE_ORIGIN.x + side * (ROAD_HALF + 0.12), 0.03, DRIVE_ORIGIN.z + zc);
      kerb.isPickable = false;
      kerb.receiveShadows = true;
      kerb.freezeWorldMatrix();
      this.planes.push({ mesh: kerb, mat: kerb.material as StandardMaterial });
    }

    // ---- roadside trees (two kinds, thin instances) ----
    const kinds = treeKinds(prof);
    const per = Math.ceil(TREE_COUNT / kinds.length);
    for (const key of kinds) {
      const mesh = am.thinInstances(key, [{ x: DRIVE_ORIGIN.x, y: HIDDEN_Y, z: DRIVE_ORIGIN.z }]);
      if (!mesh) continue;
      // thinInstances() built a 1-slot static batch: swap in a dynamic one
      const batch = new MovingBatch(mesh, per);
      const props: Prop[] = [];
      for (let i = 0; i < per; i++) {
        const side = i % 2 ? 1 : -1;
        props.push({ x: side * (ROAD_HALF + rnd(1.6, 11)), z: NEAR + Math.random() * SPAN, vx: 0, rot: rnd(0, Math.PI * 2), scale: rnd(0.85, 1.25), active: true });
      }
      this.treeBatches.push({ batch, props });
    }

    // ---- rocks drifting across the road ----
    const rockMesh = am.thinInstances("rock", [{ x: DRIVE_ORIGIN.x, y: HIDDEN_Y, z: DRIVE_ORIGIN.z }]);
    if (rockMesh) {
      this.rockBatch = new MovingBatch(rockMesh, ROCK_COUNT);
      for (let i = 0; i < ROCK_COUNT; i++) this.rocks.push({ x: 0, z: FAR, vx: 0, rot: 0, scale: 1, active: false });
    }

    // ---- the Jeep + a pool of oncoming cars ----
    this.car = am.instantiate("car", { variant: "c=#3f6fd0", position: { x: DRIVE_ORIGIN.x, y: 0, z: DRIVE_ORIGIN.z }, rotationY: Math.PI, name: "drive:jeep" });
    for (const c of ["#c0392b", "#e6c96a"]) {
      const inst = am.instantiate("car", { variant: `c=${c}`, position: { x: DRIVE_ORIGIN.x, y: HIDDEN_Y, z: DRIVE_ORIGIN.z }, rotationY: 0, name: "drive:traffic" });
      this.traffic.push({ inst, p: { x: 0, z: FAR, vx: 0, rot: 0, scale: 1, active: false } });
    }

    this.writeProps();

    // ---- input ----
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      if ((e.code === "Space" || e.code === "KeyE") && !e.repeat) this.honk();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    this.offs.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    });
    const onBoost = (on: boolean) => (this.touchBoost = !!on);
    const onHonk = () => this.honk();
    uiEvents.on("driveBoost", onBoost);
    uiEvents.on("driveHonk", onHonk);
    uiEvents.on("action", onHonk);
    this.offs.push(() => {
      uiEvents.off("driveBoost", onBoost);
      uiEvents.off("driveHonk", onHonk);
      uiEvents.off("action", onHonk);
    });

    this.emitHud();
  }

  /** World position of the car (camera target). */
  get carPos() {
    return { x: DRIVE_ORIGIN.x + this.carX, z: DRIVE_ORIGIN.z };
  }

  get arrived() {
    return this.finished;
  }

  // -------------------------------------------------------------------------
  private honk() {
    const t = performance.now();
    if (this.finished || controls.locked || t - this.lastHonk < 550) return;
    this.lastHonk = t;
    store.incrementStat("jeep_honks");
    this.bounce = 1;
    uiEvents.emit("driveChat", this.passenger ? `${npcName(this.passenger)}: !   BEEP!` : "BEEP · a cow in a field looks up");
  }

  private emitHud() {
    const progress = Math.min(1, this.distance / GOAL);
    uiEvents.emit("driveHud", {
      destName: this.opts.destName,
      progress,
      remaining: Math.max(0, Math.ceil((GOAL - this.distance) * 5)),
      fuel: Math.max(0, Math.round(this.startFuel - FUEL_COST * progress)),
      boost: this.boost,
      boosting: this.boosting,
      passenger: this.passenger ? npcName(this.passenger) : null,
      composure: Math.max(0, 5 - this.bumps),
      radio: RADIO[this.radioI],
    } satisfies DriveHud);
  }

  private bump() {
    this.bumps += 1;
    this.speed = Math.max(BASE_SPEED * 0.45, this.speed * 0.5);
    this.bounce = 1.6;
    uiEvents.emit("driveBump");
    if (this.passenger) uiEvents.emit("driveChat", `${npcName(this.passenger)}: !`);
  }

  private spawnRock() {
    const r = this.rocks.find((p) => !p.active);
    if (!r) return;
    const lane = Math.floor(Math.random() * 3) - 1;
    r.active = true;
    r.x = lane * LANE;
    r.z = FAR - 5;
    // some tumble slowly across the lanes
    r.vx = Math.random() < 0.45 ? rnd(0.5, 1.2) * (Math.random() < 0.5 ? -1 : 1) : 0;
    r.rot = rnd(0, Math.PI * 2);
    r.scale = rnd(0.7, 1.05);
  }

  private spawnTraffic() {
    const t = this.traffic.find((c) => !c.p.active);
    if (!t) return;
    t.p.active = true;
    t.p.x = (Math.floor(Math.random() * 3) - 1) * LANE;
    t.p.z = FAR;
    t.p.vx = 0;
  }

  private maybeSpawnHitcher() {
    if (this.hitcher || this.hitcherDone || this.passenger && Math.random() < 0.6) {
      this.hitcherDone = true;
      return;
    }
    this.hitcherDone = true;
    const pool = HITCHERS.filter((id) => id !== this.passenger);
    const id = pool[Math.floor(Math.random() * pool.length)];
    const def: NpcDef | undefined = NPCS.find((n) => n.id === id);
    if (!def) return;
    const z = FAR - 10;
    const x = ROAD_HALF + 0.9;
    const view = new NpcView(this.k, { ...def, facing: "left" }, DRIVE_ORIGIN.x + x, DRIVE_ORIGIN.z + z, 0, this.am);
    view.rig.gesture("wave");
    this.hitcher = { view, id, z };
    uiEvents.emit("driveChat", `${def.name} is waving from the roadside! Keep right to pick them up.`);
  }

  private pickUp(id: string) {
    this.passenger = id;
    store.state.lastPassenger = id;
    store.addRelationship(id, 1);
    store.save();
    quests.onDriveWith(id);
    this.chatT = 3;
    uiEvents.emit("driveChat", `${npcName(id)} hopped in ♡`);
    uiEvents.emit("drivePickup", id);
  }

  private nextChat() {
    if (!this.passenger) return;
    const lines = CHAT[this.passenger] ?? CHAT_DEFAULT;
    const line = lines[this.chatI % lines.length];
    this.chatI += 1;
    uiEvents.emit("driveChat", `${npcName(this.passenger)}: ${line}`);
  }

  private arrive() {
    this.finished = true;
    store.useFuel(FUEL_COST);
    store.addHearts(2);
    if (this.bumps === 0) {
      store.addCoins(10);
      store.toast("Perfect drive", "#7be0a3");
    } else if (this.near > 4) store.toast("A few near misses", "#f4c95d");
    if (this.passenger) store.addRelationship(this.passenger, this.bumps === 0 ? 2 : 1);
    store.toast(`You made it to ${this.opts.destName}`, "#ff8fae");
    // arrive in the Jeep (WorldScene { driving: true })
    store.setInJeep(true);
    this.events.onArrive();
  }

  // -------------------------------------------------------------------------
  update(dt: number) {
    dt = Math.min(dt, 0.05);
    const paused = controls.locked;

    // speed: cruise, Shift = floor it (a short burst that recharges)
    const wantBoost = !paused && !this.finished && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchBoost);
    this.boosting = wantBoost && this.boost > 0.02;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt / 2.2);
    else this.boost = Math.min(1, this.boost + dt / 5);
    const target = paused ? 0 : this.finished ? BASE_SPEED * 0.35 : this.boosting ? BOOST_SPEED : BASE_SPEED;
    this.speed += (target - this.speed) * Math.min(1, dt * (paused ? 6 : 1.6));

    // steering
    let steer = 0;
    if (!paused && !this.finished) {
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) steer -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) steer += 1;
      steer += controls.moveX;
      steer = Math.max(-1, Math.min(1, steer));
    }
    const lim = ROAD_HALF - 0.62;
    this.carX = Math.max(-lim, Math.min(lim, this.carX + steer * STEER_SPEED * dt));
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 8);
    this.bounce = Math.max(0, this.bounce - dt * 4);

    const scroll = this.speed * dt;
    this.distance += paused ? 0 : scroll;
    this.roadTex.vOffset = (this.roadTex.vOffset + scroll / ROAD_TILE) % 1;
    this.vergeTexL.vOffset = (this.vergeTexL.vOffset + scroll / 6) % 1;
    this.vergeTexR.vOffset = this.vergeTexL.vOffset;

    const cr = this.car.root;
    cr.position.x = DRIVE_ORIGIN.x + this.carX;
    cr.position.y = Math.abs(Math.sin(this.bounce * 9)) * 0.08 * this.bounce;
    cr.rotation.y = Math.PI + this.steerVis * 0.14;
    cr.rotation.z = -this.steerVis * 0.03;

    if (!paused) {
      // roadside trees wrap around
      for (const tb of this.treeBatches) {
        for (const p of tb.props) {
          p.z -= scroll;
          if (p.z < NEAR) {
            p.z += SPAN;
            const side = p.x < 0 ? -1 : 1;
            p.x = side * (ROAD_HALF + rnd(1.6, 11));
          }
        }
      }

      if (!this.finished) {
        this.rockT -= dt;
        if (this.rockT <= 0) {
          this.spawnRock();
          this.rockT = rnd(0.9, 1.9) * (BASE_SPEED / Math.max(BASE_SPEED, this.speed));
        }
        this.trafficT -= dt;
        if (this.trafficT <= 0) {
          this.spawnTraffic();
          this.trafficT = rnd(3, 6);
        }
        if (this.distance > GOAL * 0.3) this.maybeSpawnHitcher();
      }

      // rocks
      for (const r of this.rocks) {
        if (!r.active) continue;
        r.z -= scroll;
        r.x += r.vx * dt;
        if (Math.abs(r.x) > ROAD_HALF - 0.4) r.vx = -r.vx;
        const dx = Math.abs(r.x - this.carX);
        if (!this.finished && Math.abs(r.z) < 1.3 * r.scale + 0.2 && dx < 0.55 + 0.6 * r.scale) {
          this.bump();
          r.active = false;
        } else if (!this.finished && Math.abs(r.z) < 0.4 && dx < 1.7) this.near += 1;
        if (r.z < NEAR) r.active = false;
      }

      // oncoming cars: faster than the road
      for (const t of this.traffic) {
        const p = t.p;
        if (!p.active) continue;
        p.z -= scroll + 7 * dt;
        if (!this.finished && Math.abs(p.z) < 2.1 && Math.abs(p.x - this.carX) < 1.05) {
          this.bump();
          p.active = false;
        } else if (!this.finished && Math.abs(p.z) < 0.5 && Math.abs(p.x - this.carX) < 2) this.near += 1;
        if (p.z < NEAR) p.active = false;
      }

      // the hitcher on the right verge
      const h = this.hitcher;
      if (h) {
        h.z -= scroll;
        h.view.moveTo(DRIVE_ORIGIN.x + ROAD_HALF + 0.9, 0, DRIVE_ORIGIN.z + h.z);
        h.view.update(dt, cr.position.x, cr.position.z);
        if (Math.abs(h.z) < 1.6 && this.carX > ROAD_HALF - LANE - 0.2) {
          h.view.dispose();
          this.hitcher = null;
          this.pickUp(h.id);
        } else if (h.z < NEAR) {
          h.view.dispose();
          this.hitcher = null;
          uiEvents.emit("driveChat", `Missed ${npcName(h.id)} — next time!`);
        }
      }

      // passenger chatter + radio
      this.chatT -= dt;
      if (this.chatT <= 0) {
        this.chatT = 7.5;
        this.nextChat();
      }
      this.radioT += dt;
      if (this.radioT > 10) {
        this.radioT = 0;
        this.radioI = (this.radioI + 1) % RADIO.length;
      }
    }

    this.writeProps();

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
    }

    if (!this.finished && this.distance >= GOAL) {
      this.emitHud();
      this.arrive();
    }
  }

  private writeProps() {
    for (const tb of this.treeBatches) {
      tb.props.forEach((p, i) => tb.batch.set(i, p.x, 0, p.z, p.rot, p.scale));
      tb.batch.flush();
    }
    if (this.rockBatch) {
      this.rocks.forEach((r, i) => this.rockBatch!.set(i, r.x, r.active ? 0 : HIDDEN_Y, r.z, r.rot, r.scale));
      this.rockBatch.flush();
    }
    for (const t of this.traffic) {
      t.inst.root.position.set(DRIVE_ORIGIN.x + t.p.x, t.p.active ? 0 : HIDDEN_Y, DRIVE_ORIGIN.z + t.p.z);
    }
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.hitcher?.view.dispose();
    this.hitcher = null;
    this.car.dispose();
    for (const t of this.traffic) t.inst.dispose();
    for (const tb of this.treeBatches) {
      this.k.lighting?.removeCaster(tb.batch.mesh);
      tb.batch.mesh.dispose();
    }
    if (this.rockBatch) {
      this.k.lighting?.removeCaster(this.rockBatch.mesh);
      this.rockBatch.mesh.dispose();
    }
    for (const p of this.planes) {
      p.mesh.dispose();
      // kerbs share the cached flat material: only dispose our own
      if (p.mat.name.startsWith("drive:")) p.mat.dispose();
    }
    this.roadTex.dispose();
    this.vergeTexL.dispose();
    this.vergeTexR.dispose();
  }
}

function treeKinds(p: WorldArtProfile): string[] {
  const primary = p.treePrimary === "palm" ? "tree-palm" : p.treePrimary === "mediterranean" ? "tree-cypress" : p.treePrimary === "bare_urban" ? "tree-small" : "tree-oak-a";
  const secondary = p.treeSecondary === "pine" ? "tree-pine" : p.treeSecondary === "cypress" ? "tree-cypress" : p.treeSecondary === "olive" ? "tree-small" : p.hasPalms && primary !== "tree-palm" ? "tree-palm" : "bush-a";
  return primary === secondary ? [primary] : [primary, secondary];
}
