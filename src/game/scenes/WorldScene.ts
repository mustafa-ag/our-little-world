import Phaser from "phaser";
import { Depths, SceneKeys, TILE } from "../constants";
import { districtsOf, getLocation, type Cardinal } from "../data/locations";
import { NPCS } from "../data/npcs";
import { Player } from "../objects/Player";
import { NPC } from "../objects/NPC";
import { generateWorld, blockedToRects, type WorldData } from "../worldgen";
import { store } from "../systems/store";
import { controls, uiEvents, minimap } from "../systems/controls";
import * as quests from "../systems/quests";
import { fillCityMinimap } from "../systems/minimapAtlas";

interface Interactable {
  x: number;
  y: number;
  radius: number;
  prompt: string;
  trigger: () => void;
}

export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private npcs: NPC[] = [];
  private interactables: Interactable[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInteract = 0;
  private currentPrompt: Interactable | null = null;
  private locationId = "abudhabi_yas";
  private driving = false;
  private baseSpeed = 90;
  private rideJeep?: Phaser.GameObjects.Image;
  private parkedJeep?: Phaser.GameObjects.Image;
  private transitioning = false;
  private driveMenu?: Phaser.GameObjects.Container;
  private worldW = 0;
  private worldH = 0;

  constructor() {
    super(SceneKeys.World);
  }

  create(data: { locationId?: string; spawn?: { x: number; y: number }; from?: Cardinal }) {
    this.interactables = [];
    this.npcs = [];
    this.currentPrompt = null;
    this.transitioning = false;
    this.driving = false;
    this.rideJeep = undefined;
    this.driveMenu = undefined;
    uiEvents.emit("prompt", null);

    this.locationId = data.locationId ?? store.state.currentLocation ?? "abudhabi_yas";
    const def = getLocation(this.locationId);
    store.setLocation(def.id);
    store.unlockLocation(def.cityId);
    store.unlockLocation(def.id);

    const world = generateWorld(this, def);
    this.worldW = world.w * TILE;
    this.worldH = world.h * TILE;

    this.cameras.main.setBackgroundColor("#7bc86c");
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.drawGround(world);
    this.buildCollision(world);
    this.buildProps(world);
    this.buildLabels(world);
    this.buildCollectibles(world);
    this.buildNpcs(world);

    let spawn = data.spawn ?? world.spawn;
    if (data.from && def.city?.entry?.[data.from]) {
      const e = def.city.entry[data.from]!;
      spawn = { x: e.tx * TILE + TILE / 2, y: (e.ty + 1) * TILE };
    }
    this.player = new Player(this, spawn.x, spawn.y, "char_her");
    this.player.setDepth(spawn.y);
    this.baseSpeed = this.player.speed;

    this.physics.add.collider(this.player, this.solids);

    for (const z of world.zones) this.addZoneInteractable(z);

    this.setupMinimap(def);

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as Record<string, Phaser.Input.Keyboard.Key>;
    uiEvents.on("action", this.tryInteract, this);
    uiEvents.on("openMap", this.openMap, this);

    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);

    quests.onVisit(def.id);
    quests.onVisit(def.cityId);
    uiEvents.emit("locationTitle", def.name, def.subtitle);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private solids!: Phaser.Physics.Arcade.StaticGroup;

  private drawGround(world: WorldData) {
    const rt = this.add.renderTexture(0, 0, world.w * TILE, world.h * TILE);
    rt.setOrigin(0, 0).setDepth(Depths.ground);
    rt.beginDraw();
    for (let y = 0; y < world.h; y++)
      for (let x = 0; x < world.w; x++) rt.batchDraw(world.ground[y][x], x * TILE, y * TILE);
    rt.endDraw();
  }

  private buildCollision(world: WorldData) {
    this.solids = this.physics.add.staticGroup();
    const rects = blockedToRects(world.blocked);
    for (const r of rects) {
      const go = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0xff0000, 0);
      this.physics.add.existing(go, true);
      this.solids.add(go);
    }
  }

  private buildProps(world: WorldData) {
    for (const p of world.props) {
      const img = this.add.image(p.x, p.y, p.tex);
      img.setOrigin(p.originX ?? 0.5, p.originY ?? 1);
      img.setDepth(p.y);
    }
  }

  private buildLabels(world: WorldData) {
    for (const l of world.labels) {
      this.add
        .text(l.x, l.y, l.text, {
          fontFamily: "monospace",
          fontSize: l.big ? "13px" : "9px",
          color: l.big ? "#fff2cf" : "#fff",
          backgroundColor: l.big ? "rgba(58,43,58,0.55)" : "rgba(58,43,58,0.72)",
          padding: { x: l.big ? 6 : 3, y: l.big ? 3 : 1 },
          stroke: "#3a2b3a",
          strokeThickness: l.big ? 3 : 0,
          resolution: 3,
        })
        .setOrigin(0.5, l.big ? 0.5 : 1)
        .setDepth(l.big ? 55000 : 60000)
        .setAlpha(l.big ? 0.9 : 1);
    }
  }

  private buildCollectibles(world: WorldData) {
    for (const c of world.collectibles) {
      if (store.state.collected[c.id]) continue;
      const img = this.add.image(c.x, c.y, c.tex).setOrigin(0.5, 0.9).setDepth(c.y);
      this.tweens.add({ targets: img, y: c.y - 2, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const it: Interactable = {
        x: c.x,
        y: c.y,
        radius: 16,
        prompt: "Pick this flower",
        trigger: () => {
          if (!store.collect(c.id)) return;
          img.destroy();
          this.interactables = this.interactables.filter((i) => i !== it);
          if (this.currentPrompt === it) this.currentPrompt = null;
          store.addCoins(1);
          quests.onCollect(c.tag);
          store.toast("Picked a flower", "#ff8fae");
        },
      };
      this.interactables.push(it);
    }
  }

  private buildNpcs(world: WorldData) {
    for (const spot of world.npcSpots) {
      const def = NPCS.find((n) => n.id === spot.id);
      if (!def) continue;
      const npc = new NPC(this, def);
      npc.place(spot.x, spot.y);
      this.npcs.push(npc);
      this.interactables.push({
        x: spot.x,
        y: spot.y,
        radius: 26,
        prompt: `Talk to ${def.name}`,
        trigger: () => {
          npc.faceTowards(this.player.x, this.player.y);
          const res = quests.onTalk(def.id, def.dialogue);
          uiEvents.emit("dialogue", def.name, res.lines);
        },
      });
    }
  }

  private addZoneInteractable(z: import("../worldgen").ZoneSpec) {
    const trigger = () => {
      switch (z.action) {
        case "cafe":
          quests.onInteract("cafe");
          if (z.tag) quests.onInteract(z.tag);
          if (z.tag === "saddle") {
            uiEvents.emit("dialogue", "Saddle", ["Anytime you see it, you stop. Two coffees."]);
          } else if (z.tag === "hudayriyat_trucks") {
            uiEvents.emit("dialogue", "Hudayriyat", ["Food trucks by the water. You drove out for this."]);
          } else {
            uiEvents.emit("dialogue", "Cafe", ["You grab two warm coffees to go. One for each of us."]);
          }
          break;
        case "shop":
          uiEvents.emit("openShop");
          break;
        case "home":
          this.scene.start(SceneKeys.House, { title: getLocation(this.locationId).homeName ?? "Home", interior: "cream" });
          break;
        case "stairs": {
          const d = (z.data as { name?: string; tag?: string }) ?? {};
          const brown = d.tag === "well_court";
          if (z.tag) quests.onInteract(z.tag);
          uiEvents.emit("minigame", {
            kind: "stairs",
            title: d.name ?? "Stairs",
            hint: brown
              ? "Top floor. The stairs are so much. Tap to climb — or skip, she always gets tired."
              : "Stairs up to the lobby. Tap to climb, or skip.",
            taps: brown ? 14 : 8,
            skipLabel: brown ? "Skip — she's tired" : "Skip",
            onDone: () =>
              this.scene.start(SceneKeys.House, {
                title: d.name ?? "Inside",
                interior: brown ? "brown" : "cream",
              }),
          });
          break;
        }
        case "salon": {
          if (z.tag) quests.onInteract(z.tag);
          uiEvents.emit("minigame", {
            kind: "salon",
            title: "Saadiyat",
            hint: "Nails or brows. Tap along — or skip if she's not in the mood.",
            taps: 10,
            skipLabel: "Skip",
            onDone: () => {
              store.addHearts(1);
              uiEvents.emit("dialogue", "Saadiyat", ["Fresh set. Eyebrows neat. She looks so pretty."]);
            },
          });
          break;
        }
        case "drive":
          if (this.driving) this.hopOut();
          else this.openDriveMenu();
          break;
        case "exit": {
          const d = z.data as { to: string; from: Cardinal };
          this.goDistrict(d.to, d.from);
          break;
        }
        case "landmark": {
          const loc = getLocation(this.locationId);
          const title = typeof z.data === "string" ? z.data : (loc.landmarkName ?? loc.name);
          uiEvents.emit("dialogue", title, [
            `${title} — ${loc.name}.`,
            "Wish you were really here with me.",
          ]);
          break;
        }
        case "info": {
          const d = z.data as { name: string; desc?: string } | undefined;
          if (d) uiEvents.emit("dialogue", d.name, [d.desc ?? d.name]);
          break;
        }
      }
    };
    if (z.action === "drive") {
      this.parkedJeep = this.add.image(z.x, z.y, "v_jeep_blue").setOrigin(0.5, 1).setDepth(z.y);
    }
    this.interactables.push({ x: z.x, y: z.y, radius: z.radius, prompt: z.prompt, trigger });
  }

  private hopIn() {
    this.closeDriveMenu();
    this.driving = true;
    this.player.speed = this.baseSpeed * 2.8;
    this.player.setVisible(false);
    this.player.setAlpha(0);
    this.parkedJeep?.setVisible(false);
    this.rideJeep = this.add.image(this.player.x, this.player.y, "v_jeep_blue").setDepth(this.player.y + 1);
    store.toast("Jeep time — hold a direction. A to hop out.", "#2f6fd0");
    uiEvents.emit("prompt", "A · hop out of the Jeep");
  }

  private hopOut() {
    this.driving = false;
    this.player.speed = this.baseSpeed;
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.rideJeep?.destroy();
    this.rideJeep = undefined;
    this.parkedJeep?.setPosition(this.player.x, this.player.y).setVisible(true);
    store.toast("Parked the Jeep", "#2f6fd0");
  }

  private openDriveMenu() {
    this.closeDriveMenu();
    const loc = getLocation(this.locationId);
    const others = districtsOf(loc.cityId).filter((d) => d.id !== loc.id);
    const cam = this.cameras.main;
    const cx = cam.worldView.centerX;
    const cy = cam.worldView.centerY;
    const items = [{ label: "Cruise around here", id: "__cruise" }, ...others.map((d) => ({ label: `Drive to ${d.name}`, id: d.id }))];
    const h = 36 + items.length * 28;
    const w = 240;
    const g = this.add.graphics();
    g.fillStyle(0x3a2b3a, 0.92);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineStyle(2, 0xf4a6c0, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const title = this.add
      .text(0, -h / 2 + 10, "Blue Jeep Sport", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffe08a",
        resolution: 2,
      })
      .setOrigin(0.5, 0);
    const rows: Phaser.GameObjects.GameObject[] = [g, title];
    items.forEach((item, i) => {
      const t = this.add
        .text(0, -h / 2 + 32 + i * 28, item.label, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#fff",
          backgroundColor: "#e46d94",
          padding: { x: 10, y: 4 },
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => {
        if (item.id === "__cruise") this.hopIn();
        else this.driveTo(item.id);
      });
      rows.push(t);
    });
    this.driveMenu = this.add.container(cx, cy, rows).setDepth(80000).setScrollFactor(1);
    controls.locked = true;
  }

  private closeDriveMenu() {
    this.driveMenu?.destroy();
    this.driveMenu = undefined;
    controls.locked = false;
  }

  private driveTo(destId: string) {
    this.closeDriveMenu();
    this.transitioning = true;
    this.cameras.main.fadeOut(220, 20, 30, 50);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SceneKeys.Driving, { destId });
    });
  }

  private goDistrict(to: string, from: Cardinal) {
    if (this.transitioning) return;
    this.transitioning = true;
    const dest = getLocation(to);
    this.cameras.main.fadeOut(180, 40, 60, 90);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      uiEvents.emit("prompt", null);
      this.scene.start(SceneKeys.World, { locationId: dest.id, from });
    });
  }

  private applyZoom() {
    const h = this.scale.gameSize.height;
    this.cameras.main.setZoom(Phaser.Math.Clamp(h / (42 * TILE), 1.35, 2.15));
  }

  private tryInteract() {
    if (this.driveMenu) {
      this.closeDriveMenu();
      return;
    }
    if (controls.locked) return;
    const now = this.time.now;
    if (now - this.lastInteract < 250) return;
    if (this.driving) {
      this.lastInteract = now;
      this.hopOut();
      return;
    }
    if (this.currentPrompt) {
      this.lastInteract = now;
      this.currentPrompt.trigger();
    }
  }

  private openMap() {
    this.closeDriveMenu();
    this.scene.start(SceneKeys.WorldMap, {});
  }

  private onShutdown() {
    minimap.on = false;
    this.closeDriveMenu();
    uiEvents.off("action", this.tryInteract, this);
    uiEvents.off("openMap", this.openMap, this);
    this.scale.off("resize", this.applyZoom, this);
  }

  update(time: number) {
    if (!this.player) return;

    let vx = 0;
    let vy = 0;
    if (!controls.locked && !this.transitioning) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
      vx += controls.moveX;
      vy += controls.moveY;
      const len = Math.hypot(vx, vy);
      if (len > 1) {
        vx /= len;
        vy /= len;
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.E)) {
        this.tryInteract();
      }
    }
    this.player.move(vx * this.player.speed, vy * this.player.speed);

    if (this.rideJeep) {
      this.rideJeep.setPosition(this.player.x, this.player.y);
      this.rideJeep.setDepth(this.player.y + 2);
      this.rideJeep.setAngle(vx !== 0 ? vx * 8 : 0);
    }

    for (const npc of this.npcs) npc.update(time);

    if (!this.driving && !this.transitioning) {
      let best: Interactable | null = null;
      let bestD = Infinity;
      for (const it of this.interactables) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
        if (d <= it.radius && d < bestD) {
          best = it;
          bestD = d;
        }
      }
      if (best !== this.currentPrompt) {
        this.currentPrompt = best;
        uiEvents.emit("prompt", best ? best.prompt : null);
      }
    }

    if (!this.transitioning) this.checkMapEdge();
    this.syncMinimap();
  }

  private checkMapEdge() {
    const loc = getLocation(this.locationId);
    const pad = 10;
    if (this.player.y < pad && loc.exits?.north) this.goDistrict(loc.exits.north, "south");
    else if (this.player.y > this.worldH - pad && loc.exits?.south) this.goDistrict(loc.exits.south, "north");
    else if (this.player.x < pad && loc.exits?.west) this.goDistrict(loc.exits.west, "east");
    else if (this.player.x > this.worldW - pad && loc.exits?.east) this.goDistrict(loc.exits.east, "west");
  }

  private setupMinimap(def: ReturnType<typeof getLocation>) {
    fillCityMinimap(def.id, this.player.x, this.player.y, this.player.facing);
  }

  private syncMinimap() {
    minimap.px = minimap.ox + this.player.x;
    minimap.py = minimap.oy + this.player.y;
    minimap.facing = this.player.facing;
  }
}
