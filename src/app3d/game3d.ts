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
import { createLighting, type Lighting, type WarmSpot } from "./rendering/lighting";
import { createSky, type Sky } from "./rendering/sky";
import { createBackdrop, type Backdrop } from "./rendering/backdrop";
import { createOcclusion, occludersFromThinMeshes, type Occlusion } from "./rendering/occlusion";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TimeOfDay } from "../game/systems/save";
import { Materials, applyRegionPalette } from "./rendering/materials";
import { getArtProfile, type WorldArtProfile } from "./world/artProfile";
import { buildEnvironment, type Environment } from "./rendering/environment";
import { AssetManager, HERO_PRELOAD_KEYS, remapSlots, type KitContext } from "./assets/AssetManager";
import * as architecture from "./assets/kit/architecture";
import { registerProps } from "./assets/kit/props";
import { registerFoliage } from "./assets/kit/foliage";
import { registerVehicles } from "./assets/kit/vehicles";
import { CHARACTER_KEYS, registerCharacters } from "./assets/kit/characters";
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
  backdrop: Backdrop;
  profile: WorldArtProfile;
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
  sky: Sky;
  occlusion: Occlusion;
  private stopAtmo: () => void;
  private backdrop: Backdrop | null = null;
  private playerPos = new Vector3();
  private kit: KitContext;
  private loaded: Loaded | null = null;
  private loading = false;
  /** Hero GLBs preloaded (or fallen back) — awaited before the first location build. */
  private heroReady: Promise<void> = Promise.resolve();
  private stopUpdate: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.host = createRenderHost(root);
    const { scene, canvas, isMobile } = this.host;
    this.mats = new Materials(scene);
    this.lighting = createLighting(scene, isMobile);
    this.camera = createFollowCamera(scene, canvas, isMobile);
    this.sky = createSky(scene);
    this.occlusion = createOcclusion(scene, {
      addCaster: (m) => this.lighting.addCaster(m),
      removeCaster: (m) => this.lighting.removeCaster(m),
    });
    this.stopAtmo = this.lighting.onAtmosphere((a) => {
      this.sky.setAtmosphere(a);
      this.backdrop?.setAtmosphere(a);
    });
    this.kit = { scene, mats: this.mats, lighting: this.lighting };
    this.am = new AssetManager(this.kit);
    architecture.registerArchitecture(this.am);
    registerProps(this.am);
    registerFoliage(this.am);
    registerVehicles(this.am);
    registerCharacters(this.am);
    this.registerArchitectureHeroes();
    // hero props + the skinned characters load together behind the title
    // screen; the first location waits for both (each bounded by
    // GLB_TIMEOUT_MS) so Juju and the NPCs appear with their real rigs
    this.heroReady = Promise.all([this.am.preload(HERO_PRELOAD_KEYS), this.am.preloadAnimated(CHARACTER_KEYS)]).then(([fell, fellChars]) => {
      if (fell.length) console.info(`hero assets using procedural fallback: ${fell.join(", ")}`);
      if (fellChars.length) console.info(`characters not loaded yet (procedural until they arrive): ${fellChars.join(", ")}`);
    });
    this.stopUpdate = this.host.onUpdate((dt, now) => this.update(dt, now));
    this.host.start();
  }

  /** Track C's cottage / café heroes (pure-geometry builders in kit/architecture.ts) as GLB + fallback. */
  private registerArchitectureHeroes() {
    const arch = architecture as unknown as {
      buildCottageHero?: (scene: KitContext["scene"], variant: "1s" | "2s") => import("@babylonjs/core/Meshes/mesh").Mesh;
      buildCafeHero?: (scene: KitContext["scene"]) => import("@babylonjs/core/Meshes/mesh").Mesh;
    };
    const wrap = (build: (k: KitContext) => import("@babylonjs/core/Meshes/mesh").Mesh) => (k: KitContext) => {
      const m = build(k);
      remapSlots(k, m);
      return m;
    };
    if (arch.buildCottageHero) {
      this.am.registerHero("cottage-1s", wrap((k) => arch.buildCottageHero!(k.scene, "1s")));
      this.am.registerHero("cottage-2s", wrap((k) => arch.buildCottageHero!(k.scene, "2s")));
    }
    if (arch.buildCafeHero) this.am.registerHero("cafe", wrap((k) => arch.buildCafeHero!(k.scene)));
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
      await this.heroReady;
      const def = getLocation(id);
      // regional art direction: palette, ground, vegetation, landmark, backdrop, sky
      const profile = getArtProfile(id);
      applyRegionPalette(profile);
      this.sky.setRegion({ horizon: profile.skyHorizonColor, zenith: profile.skyZenithColor, fog: profile.fogColor, fogDensity: profile.fogDensity, strength: profile.atmosphereStrength });
      const world = generateWorld(def);
      const collider = createGridCollider(world.blocked.map((r) => r.slice()));
      const env = buildEnvironment(this.host.scene, this.mats, this.lighting, world, profile);
      const bctx = { am: this.am, collider, env, def, world, profile };
      const built = buildWorld(bctx);
      dressWorld(bctx, built);
      built.placer.flush(this.am);
      const glow = this.am.thinInstances("lamp-glow", built.lamps);
      const unregisterGlow = glow ? this.lighting.registerNightMesh(glow) : null;
      // warm point-light pool: street lamps + café fronts (weighted so the
      // café's pool of light wins at night)
      const warm: WarmSpot[] = [...built.lamps];
      for (const b of built.buildings) {
        if (b.kind !== "cafe") continue;
        warm.push({ x: b.tx, y: 0, z: -(b.ty + 1) - 1.4, h: 2.2, weight: 2.2, range: 11 });
      }
      this.lighting.setLamps(warm);

      // distant skyline beyond the map; the castle-on-its-rock silhouette only
      // when the location has no castle of its own
      const hasCastle = built.buildings.some((b) => b.kind === "castle");
      const backdrop = createBackdrop(this.host.scene, { mapW: world.w, mapH: world.h, castle: !hasCastle, style: profile.backdropStyle });
      this.backdrop = backdrop;
      backdrop.setAtmosphere(this.lighting.atmosphere());

      // buildings that fade when they hide the player (filled by placer.flush()
      // above; the thin-instance scan is a fallback for an empty list)
      const occluders = built.occluders.length ? built.occluders : occludersFromThinMeshes(this.host.scene.meshes, (m) => /^(building|castle|landmark)#/.test(m.name));
      this.occlusion.setOccluders(occluders);

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
      const playerView = new PlayerView(this.kit, this.am, sp.x, sp.z);
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
          // the parked hero car (driving isn't ported): the interaction zone stays where the controller put it
          // parked side-on (parallel to the street): the 3/4 side silhouette reads as a
          // car from the high camera (nose-on it read as a teal bell); nudged east so its
          // tail clears the spawn point (the zone radius still covers it)
          // Kerbside: if the spot is on a sidewalk / square with a street within
          // 2.5 tiles north or south, the car parks on the street's near lane
          // against the kerb instead of on the paving (visual only).
          const tx = Math.floor(x);
          const ty0 = Math.floor(-z);
          let cz = z;
          if (!env.isRoad(tx, ty0)) {
            for (const d of [-1, 1, -2, 2]) {
              const ty = ty0 + d;
              if (env.isRoad(tx, ty) && env.isRoad(tx + 1, ty) && env.isRoad(tx - 1, ty)) {
                // tile ty spans z in (-(ty+1), -ty]; hug its kerb-side edge
                cz = d < 0 ? -(ty + 1) + 0.62 : -ty - 0.62;
                break;
              }
            }
          }
          this.am.thinInstances("car", [{ x: x + 0.7, y: groundY(x, cz), z: cz, rotationY: Math.PI / 2 + 0.06 }]);
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
        backdrop,
        profile,
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
    this.occlusion.clear();
    l.backdrop.dispose();
    this.backdrop = null;
    this.lighting.setLamps([]);
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
    this.lighting.update(dt);
    const l = this.loaded;
    if (!l) {
      this.sky.update(dt, this.camera.camera.position);
      return;
    }
    const dtMs = dt * 1000;
    l.player.update(dt);
    const s = l.player.state;
    const gy = l.env.heightAt(Math.floor(s.x), Math.floor(-s.z));
    l.playerView.update(dt, s, gy);
    if (!l.setupPending) l.controller.update(dtMs, now); // no rules (time ticks, exits) behind the title
    this.camera.setTarget(s.x, s.z);
    this.camera.update(dt);
    this.lighting.follow(s.x, s.z);
    const cam = this.camera.camera.position;
    this.sky.update(dt, cam);
    l.backdrop.update(cam);
    this.occlusion.update(dt, cam, this.playerPos.set(s.x, gy, s.z));
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
    // per-frame draw calls (incl. the shadow pass), sampled right after a few renders
    const inst = this.instrumentation;
    const frames: number[] = [];
    await new Promise<void>((resolve) => {
      const obs = scene.onAfterRenderObservable.add(() => {
        frames.push(inst.drawCallsCounter.current);
        if (frames.length >= 5) {
          scene.onAfterRenderObservable.remove(obs);
          resolve();
        }
      });
    });
    frames.sort((a, b) => a - b);
    return {
      fps: Math.round(this.host.engine.getFps()),
      drawCalls: frames[2],
      drawCallsMax: frames[4],
      activeMeshes: scene.getActiveMeshes().length,
      totalMeshes: scene.meshes.length,
      materials: scene.materials.length,
      renderMs: +this.instrumentation.renderTimeCounter.lastSecAverage.toFixed(1),
    };
  }

  // ---- debug / screenshot helpers (window.__game in dev) ----

  /** Override camera composition: elev (deg), fov (rad), lookY, lookAhead, lead; dist = zoom. */
  setCamera(o: { elev?: number; fov?: number; lookY?: number; lookAhead?: number; lead?: number; dist?: number } = {}) {
    const { dist, ...t } = o;
    if (dist !== undefined) this.camera.setDistance(dist, true);
    return this.camera.tune(t);
  }

  /** Jump to a time of day (instant by default, for screenshots). */
  setTime(t: TimeOfDay, instant = true) {
    store.state.timeOfDay = t;
    this.lighting.apply(t, instant);
    store.emit("time", t);
    if (instant) this.lighting.apply(t, true);
  }

  /** Occlusion / lighting state for debugging. */
  renderInfo() {
    return {
      fadedOccluders: this.occlusion.fadedCount,
      camera: this.camera.camera.position.asArray().map((v) => +v.toFixed(2)),
      fov: +this.camera.camera.fov.toFixed(3),
      lampPool: this.lighting.poolSize,
    };
  }

  dispose() {
    this.stopUpdate?.();
    this.unload();
    this.stopAtmo();
    this.occlusion.dispose();
    this.sky.dispose();
    this.am.disposeScene();
    this.camera.dispose();
    this.lighting.dispose();
    this.mats.dispose();
    this.host.dispose();
  }
}
