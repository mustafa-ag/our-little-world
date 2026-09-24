// Scene lifecycle: engine, shared materials/lighting/assets, and per-location
// loading (world build + dressing + controller + views), update loop wiring
// and district travel. Gameplay rules live in systems/worldController.ts.

import { TILE } from "../game/constants";
import { getLocation, type Cardinal } from "../game/data/locations";
import type { NpcDef } from "../game/data/npcs";
import { store } from "../game/systems/store";
import { generateWorld, type WorldData } from "../game/worldgen";
import { createRenderHost, type RenderHost } from "./rendering/engine";
import { createFollowCamera, type FollowCamera } from "./rendering/camera";
import { createLighting, type Lighting } from "./rendering/lighting";
import { Materials } from "./rendering/materials";
import { buildEnvironment, type Environment } from "./rendering/environment";
import { AssetManager, type KitContext } from "./assets/AssetManager";
import { registerArchitecture } from "./assets/kit/architecture";
import { registerProps } from "./assets/kit/props";
import { registerFoliage } from "./assets/kit/foliage";
import { registerVehicles } from "./assets/kit/vehicles";
import { createGridCollider, type GridCollider } from "./world/gridCollider";
import { buildWorld, type BuiltWorld } from "./world/worldBuilder";
import { dressWorld } from "./world/dressing";
import { pxToXZ } from "./world/coords";
import { InteractionSystem } from "./systems/interaction";
import { PlayerController } from "./systems/playerController";
import { PORTED_LOCATIONS, WorldController, type PickupKind } from "./systems/worldController";
import { PlayerView } from "./entities/PlayerView";
import { NpcView } from "./entities/NpcView";
import { PickupView, petalBurst } from "./entities/Pickup";
import { createLabel, type Label } from "./entities/Label";

interface Loaded {
  id: string;
  world: WorldData;
  collider: GridCollider;
  env: Environment;
  built: BuiltWorld;
  controller: WorldController;
  player: PlayerController;
  playerView: PlayerView;
  npcs: Map<string, NpcView>;
  pickups: Map<string, PickupView>;
  labels: Label[];
  cat: PickupView | null;
  effects: ((dt: number) => boolean)[];
  timers: number[];
  /** Gameplay setup still pending (world pre-built behind the title). */
  setupPending: boolean;
  travelled: boolean;
  unregisterGlow: (() => void) | null;
}

export interface LoadOptions {
  from?: Cardinal;
  spawn?: { x: number; y: number };
  /** Build visuals only; gameplay setup waits for `beginSession()`. */
  deferSetup?: boolean;
}

export const DEFAULT_LOCATION = "edinburgh_oldtown";

export class Game3D {
  host: RenderHost;
  mats: Materials;
  lighting: Lighting;
  am: AssetManager;
  camera: FollowCamera;
  private kit: KitContext;
  private loaded: Loaded | null = null;
  private loading = false;
  private stopUpdate: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.host = createRenderHost(root);
    const { scene, canvas, isMobile } = this.host;
    this.mats = new Materials(scene);
    this.lighting = createLighting(scene, isMobile);
    this.camera = createFollowCamera(scene, canvas, isMobile);
    this.kit = { scene, mats: this.mats, lighting: this.lighting };
    this.am = new AssetManager(this.kit);
    registerArchitecture(this.am);
    registerProps(this.am);
    registerFoliage(this.am);
    registerVehicles(this.am);
    this.stopUpdate = this.host.onUpdate((dt, now) => this.update(dt, now));
    this.host.start();
  }

  /** The location a session should open in: the save's, if ported, else the default (save untouched). */
  static sessionLocation() {
    const id = store.state.currentLocation;
    return PORTED_LOCATIONS.has(id) ? id : DEFAULT_LOCATION;
  }

  get current() {
    return this.loaded;
  }

  async loadLocation(id: string, opts: LoadOptions = {}) {
    if (this.loading) return;
    this.loading = true;
    try {
      this.unload();
      const def = getLocation(id);
      const world = generateWorld(def);
      const collider = createGridCollider(world.blocked.map((r) => r.slice()));
      const env = buildEnvironment(this.host.scene, this.mats, this.lighting, world);
      const bctx = { am: this.am, collider, env, def, world };
      const built = buildWorld(bctx);
      dressWorld(bctx, built);
      built.placer.flush(this.am);
      const glow = this.am.thinInstances("lamp-glow", built.lamps);
      const unregisterGlow = glow ? this.lighting.registerNightMesh(glow) : null;

      // spawn (WorldScene.create semantics)
      let spawn = opts.spawn ?? built.world.spawn;
      if (opts.from && def.city?.entry?.[opts.from]) {
        const e = def.city.entry[opts.from]!;
        let sx = e.tx * TILE + TILE / 2;
        let sy = (e.ty + 1) * TILE;
        const inset = TILE * 3;
        if (opts.from === "north") sy = Math.max(sy, inset);
        if (opts.from === "south") sy = Math.min(sy, world.h * TILE - inset);
        if (opts.from === "west") sx = Math.max(sx, inset);
        if (opts.from === "east") sx = Math.min(sx, world.w * TILE - inset);
        spawn = { x: sx, y: sy };
      }
      const sp = pxToXZ(spawn.x, spawn.y);
      const player = new PlayerController(collider, sp.x, sp.z);
      player.attach();
      const playerView = new PlayerView(this.kit, sp.x, sp.z);
      this.camera.setTarget(sp.x, sp.z, true);
      this.lighting.follow(sp.x, sp.z);

      const interaction = new InteractionSystem();

      // the hooks only run from setup()/update(), after `loaded` below exists
      const groundY = (x: number, z: number) => env.heightAt(Math.floor(x), Math.floor(-z));
      const controller = new WorldController(id, built.world, interaction, {
        spawnNpc: (ndef: NpcDef, x, z) => loaded.npcs.set(ndef.id, new NpcView(this.kit, ndef, x, z, groundY(x, z))),
        npcFacePlayer: (npcId) => loaded.npcs.get(npcId)?.faceTowards(player.state.x, player.state.z),
        spawnPickup: (pid, kind: PickupKind, x, z) => loaded.pickups.set(pid, new PickupView(this.kit, kind, x, groundY(x, z), z)),
        removePickup: (pid) => {
          loaded.pickups.get(pid)?.dispose();
          loaded.pickups.delete(pid);
        },
        spawnCat: (x, z) => {
          loaded.cat?.dispose();
          loaded.cat = new PickupView(this.kit, "cat", x, groundY(x, z), z);
          store.toast("A cat decided to follow you", "#f4a6c0");
        },
        spawnJeep: (x, z) => {
          // a static prop for now (driving isn't ported); thin batch of one
          this.am.thinInstances("car", [{ x, y: groundY(x, z), z, rotationY: 0.25 }], "c=#3f6fd0,kind=jeep");
        },
        petalBurst: (x, z) => petalBurst(this.host.scene, this.kit, x, groundY(x, z), z, (tick) => loaded.effects.push(tick)),
        requestTravel: (to, from) => {
          const t = window.setTimeout(() => void this.loadLocation(to, { from }), 120);
          loaded.timers.push(t);
        },
        playerPos: () => ({ x: player.state.x, z: player.state.z }),
        setTimeout: (ms, fn) => {
          const t = window.setTimeout(() => {
            if (this.loaded === loaded) fn();
          }, ms);
          loaded.timers.push(t);
        },
      });
      const loaded: Loaded = {
        id,
        world: built.world,
        collider,
        env,
        built,
        controller,
        player,
        playerView,
        npcs: new Map(),
        pickups: new Map(),
        labels: [],
        cat: null,
        effects: [],
        timers: [],
        setupPending: true,
        travelled: !!opts.from,
        unregisterGlow,
      };

      // building / district labels (building names float above their roof)
      for (const l of built.world.labels) {
        const b = built.buildings.find((bb) => bb.name === l.text);
        const p = b ? { x: b.tx, z: -(b.ty + 1) + b.d / 2 } : pxToXZ(l.x, l.y);
        const lab = createLabel(this.host.scene, l.text, { big: l.big });
        lab.setPosition(p.x, l.big ? 2.4 : b?.kind === "castle" ? 8.5 : b?.tex === "b_tenement" ? 6.6 : 4.6, p.z);
        loaded.labels.push(lab);
      }

      // publish only once everything is built
      this.loaded = loaded;
      if (!opts.deferSetup) this.beginSession();
    } finally {
      this.loading = false;
    }
  }

  /** Run the pending gameplay setup of a pre-built location (save writes, quests, encounters). */
  beginSession(opts: { fresh?: boolean } = {}) {
    const l = this.loaded;
    if (!l || !l.setupPending) return;
    l.setupPending = false;
    l.controller.setup(performance.now(), { travelled: l.travelled, fresh: opts.fresh });
  }

  unload() {
    const l = this.loaded;
    if (!l) return;
    this.loaded = null;
    for (const t of l.timers) window.clearTimeout(t);
    l.unregisterGlow?.();
    l.controller?.dispose();
    l.player.detach();
    l.playerView.dispose();
    for (const n of l.npcs.values()) n.dispose();
    for (const p of l.pickups.values()) p.dispose();
    for (const lab of l.labels) lab.dispose();
    l.cat?.dispose();
    this.am.disposeInstances();
    l.env.dispose();
  }

  private update(dt: number, now: number) {
    const l = this.loaded;
    if (!l) return;
    const dtMs = dt * 1000;
    l.player.update(dt);
    const s = l.player.state;
    const gy = l.env.heightAt(Math.floor(s.x), Math.floor(-s.z));
    l.playerView.update(dt, s, gy);
    if (!l.setupPending) l.controller.update(dtMs, now); // no rules (time ticks, exits) behind the title
    this.camera.setTarget(s.x, s.z);
    this.camera.update(dt);
    this.lighting.follow(s.x, s.z);
    for (const n of l.npcs.values()) n.update(dt, s.x, s.z);
    for (const p of l.pickups.values()) p.update(dt);
    if (l.cat) {
      const c = l.cat.root.position;
      c.x += (s.x - 0.9 - c.x) * Math.min(1, dt * 2.5);
      c.z += (s.z - 0.3 - c.z) * Math.min(1, dt * 2.5);
      l.cat.update(dt);
    }
    if (l.effects.length) l.effects = l.effects.filter((fx) => !fx(dt));
  }

  private instrumentation: import("@babylonjs/core/Instrumentation/sceneInstrumentation").SceneInstrumentation | null = null;

  /** Rough perf numbers for the dev console (draw calls need a frame after the first call). */
  async stats() {
    const scene = this.host.scene;
    if (!this.instrumentation) {
      const { SceneInstrumentation } = await import("@babylonjs/core/Instrumentation/sceneInstrumentation");
      this.instrumentation = new SceneInstrumentation(scene);
      this.instrumentation.captureRenderTime = true;
      await new Promise((r) => setTimeout(r, 600));
    }
    return {
      fps: Math.round(this.host.engine.getFps()),
      drawCalls: Math.round(this.instrumentation.drawCallsCounter.lastSecAverage),
      drawCallsNow: this.instrumentation.drawCallsCounter.current,
      activeMeshes: scene.getActiveMeshes().length,
      totalMeshes: scene.meshes.length,
      materials: scene.materials.length,
      renderMs: +this.instrumentation.renderTimeCounter.lastSecAverage.toFixed(1),
    };
  }

  dispose() {
    this.stopUpdate?.();
    this.unload();
    this.am.disposeScene();
    this.camera.dispose();
    this.lighting.dispose();
    this.mats.dispose();
    this.host.dispose();
  }
}
