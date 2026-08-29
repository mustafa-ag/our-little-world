import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { LAND, LOCKED_CITIES, MAP_H, MAP_W, PLACE_NAMES, geoToMap } from "../data/continents";
import { CITIES, districtsOf, getLocation } from "../data/locations";
import { store } from "../systems/store";
import { uiEvents } from "../systems/controls";

interface Pin {
  name: string;
  lat: number;
  lng: number;
  hub: string;
  minZoom: number;
  major: boolean;
}

export class WorldMapScene extends Phaser.Scene {
  private zoom = 2.4;
  private dragging = false;
  private lastPtr = { x: 0, y: 0 };
  private pinLayer!: Phaser.GameObjects.Container;
  private nameLayer!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private pins: Pin[] = [];

  constructor() {
    super(SceneKeys.WorldMap);
  }

  create() {
    uiEvents.emit("prompt", null);
    this.cameras.main.setBackgroundColor("#1e6aa3");
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.zoom = 0.72;
    this.cameras.main.setZoom(this.zoom);

    this.drawAtlas();
    this.nameLayer = this.add.container(0, 0).setDepth(8);
    this.drawPlaceNames();
    this.buildPins();
    this.pinLayer = this.add.container(0, 0).setDepth(20);
    this.drawPins();

    const start = geoToMap(20, 20);
    this.cameras.main.centerOn(start.x, start.y);

    this.buildHud();
    this.bindInput();

    if (!this.scene.isActive(SceneKeys.UI)) this.scene.launch(SceneKeys.UI);
  }

  private drawAtlas() {
    const g = this.add.graphics();
    g.fillStyle(0x1e6aa3, 1);
    g.fillRect(0, 0, MAP_W, MAP_H);
    g.fillStyle(0x2f8fc4, 0.35);
    g.fillRect(0, MAP_H * 0.42, MAP_W, MAP_H * 0.2);

    for (const land of LAND) {
      for (const ring of land.rings) {
        const pts = ring.map(([lat, lng]) => geoToMap(lat, lng));
        g.fillStyle(land.color, 1);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.fillPath();
        g.lineStyle(1.2, 0x3a2b3a, 0.25);
        g.strokePath();
      }
    }

    // latitude / longitude grid (faint)
    g.lineStyle(1, 0xffffff, 0.07);
    for (let lat = -60; lat <= 80; lat += 15) {
      const y = geoToMap(lat, 0).y;
      g.lineBetween(0, y, MAP_W, y);
    }
    for (let lng = -150; lng <= 150; lng += 15) {
      const x = geoToMap(0, lng).x;
      g.lineBetween(x, 0, x, MAP_H);
    }
  }

  private drawPlaceNames() {
    this.nameLayer.removeAll(true);
    const z = this.cameras.main.zoom;
    for (const p of PLACE_NAMES) {
      if (p.kind === "continent" && z > 2.4) continue;
      if (p.kind === "country" && z < 0.6) continue;
      if (p.kind === "country" && z > 4.5) continue;
      const { x, y } = geoToMap(p.lat, p.lng);
      const t = this.add
        .text(x, y, p.name, {
          fontFamily: "monospace",
          fontSize: p.kind === "continent" ? "16px" : "11px",
          color: p.kind === "continent" ? "#fff8e8" : "#3a2b3a",
          stroke: p.kind === "continent" ? "#3a2b3a" : "#fff8e8",
          strokeThickness: p.kind === "continent" ? 4 : 3,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setAlpha(p.kind === "continent" ? 0.85 : 0.75)
        .setScale(1 / Math.max(0.7, Math.min(z, 2.2)));
      this.nameLayer.add(t);
    }
  }

  private buildPins() {
    this.pins = CITIES.map((c) => ({
      name: c.name,
      lat: c.geo.lat,
      lng: c.geo.lng,
      hub: c.hub,
      minZoom: 0,
      major: true,
    }));
    for (const city of CITIES) {
      for (const d of districtsOf(city.id)) {
        if (d.id === city.hub) continue;
        this.pins.push({
          name: d.name,
          lat: d.geo.lat,
          lng: d.geo.lng,
          hub: d.id,
          minZoom: 3.2,
          major: false,
        });
      }
    }
  }

  private drawPins() {
    this.pinLayer.removeAll(true);
    const here = getLocation(store.state.currentLocation);
    const z = this.cameras.main.zoom;

    const visible = this.pins.filter((p) => z >= p.minZoom);
    const placed: { x: number; y: number }[] = [];

    for (const pin of visible) {
      const { x, y } = geoToMap(pin.lat, pin.lng);
      const screenDist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot((a.x - b.x) * z, (a.y - b.y) * z);
      if (!pin.major && placed.some((q) => screenDist(q, { x, y }) < 28)) continue;
      placed.push({ x, y });

      const dest = getLocation(pin.hub);
      const active = pin.major ? dest.cityId === here.cityId : dest.id === here.id;
      const marker = this.add.image(x, y - 4, "ui_heart").setScale((active ? 1.8 : pin.major ? 1.4 : 1.1) / Math.max(0.7, Math.min(z, 2.4)));
      marker.setTint(active ? 0xffe08a : 0xffffff);

      const label = this.add
        .text(x, y + 6, pin.name, {
          fontFamily: "monospace",
          fontSize: pin.major ? "11px" : "9px",
          color: "#fff",
          backgroundColor: "rgba(58,43,58,0.82)",
          padding: { x: 4, y: 2 },
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setScale(1 / Math.max(0.85, Math.min(z, 2.2)));

      const hitR = 18 / Math.max(0.7, Math.min(z, 2));
      const hit = this.add.circle(x, y, hitR, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.travel(pin.hub));
      this.pinLayer.add([marker, label, hit]);
    }

    if (z >= 1.1) {
      for (const city of LOCKED_CITIES) {
        const { x, y } = geoToMap(city.lat, city.lng);
        const marker = this.add.image(x, y - 3, "ui_heart").setScale(0.9 / Math.max(0.7, Math.min(z, 2.4)));
        marker.setTint(0x9aa0ab);
        marker.setAlpha(0.7);
        const label = this.add
          .text(x, y + 5, `${city.name}  · soon`, {
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#d8dde6",
            backgroundColor: "rgba(58,43,58,0.55)",
            padding: { x: 3, y: 1 },
            resolution: 2,
          })
          .setOrigin(0.5, 0)
          .setScale(1 / Math.max(0.85, Math.min(z, 2.2)));
        const hit = this.add.circle(x, y, 14 / Math.max(0.7, Math.min(z, 2)), 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on("pointerdown", () => store.toast(`${city.name} isn't in the story yet — soon 🤍`, "#8ecae6"));
        this.pinLayer.add([marker, label, hit]);
      }
    }
  }

  private buildHud() {
    const { width, height } = this.scale.gameSize;
    const title = this.add
      .text(width / 2, 18, "The world", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#fff",
        stroke: "#3a2b3a",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    const hint = this.add
      .text(width / 2, 42, "hearts you can visit  ·  grey = coming soon  ·  + − zoom", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#fff",
        stroke: "#3a2b3a",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    const mkBtn = (x: number, y: number, label: string, fn: () => void) => {
      const t = this.add
        .text(x, y, label, {
          fontFamily: "monospace",
          fontSize: "18px",
          color: "#fff",
          backgroundColor: "#e46d94",
          padding: { x: 12, y: 6 },
          resolution: 2,
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        fn();
      });
      return t;
    };

    const plus = mkBtn(width - 16, 56, "+", () => this.nudgeZoom(1.35));
    const minus = mkBtn(width - 16, 96, "−", () => this.nudgeZoom(1 / 1.35));

    const stay = this.add
      .text(width / 2, height - 28, "Stay here", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#fff",
        backgroundColor: "#e46d94",
        padding: { x: 14, y: 8 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    stay.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.travel(store.state.currentLocation);
    });

    this.hud = this.add.container(0, 0, [title, hint, plus, minus, stay]).setDepth(50);
    this.hud.setScrollFactor(0);
  }

  private bindInput() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.y < 50 || p.y > this.scale.gameSize.height - 50) return;
      if (p.x > this.scale.gameSize.width - 56 && p.y < 140) return;
      this.dragging = true;
      this.lastPtr = { x: p.x, y: p.y };
    });
    this.input.on("pointerup", () => {
      this.dragging = false;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - this.lastPtr.x) / cam.zoom;
      cam.scrollY -= (p.y - this.lastPtr.y) / cam.zoom;
      this.lastPtr = { x: p.x, y: p.y };
    });
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _g: unknown[], _dx: number, dy: number) => {
      this.nudgeZoom(dy > 0 ? 1 / 1.12 : 1.12);
    });
  }

  private nudgeZoom(factor: number) {
    const cam = this.cameras.main;
    const mid = { x: cam.worldView.centerX, y: cam.worldView.centerY };
    this.zoom = Phaser.Math.Clamp(this.zoom * factor, 0.4, 8);
    cam.setZoom(this.zoom);
    cam.centerOn(mid.x, mid.y);
    this.drawPlaceNames();
    this.drawPins();
  }

  private travel(id: string) {
    this.cameras.main.fadeOut(220, 40, 60, 90);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const loc = getLocation(id);
      store.unlockLocation(loc.cityId);
      store.unlockLocation(loc.id);
      uiEvents.emit("prompt", null);
      this.scene.start(SceneKeys.World, { locationId: loc.id, driving: store.state.inJeep });
    });
  }
}
