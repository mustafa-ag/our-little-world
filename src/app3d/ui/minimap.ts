// Overhead dot map of the current 3D location, drawn on a 2D canvas from
// `mapFeed` (terrain one pixel per tile, scaled to fit). Used twice: the small
// HUD minimap (tap = open the district map) and the big district map modal.
// The player is a DOM dot on top of the canvas so its pulse is a CSS animation.
import { store } from "../../game/systems/store";
import { mapFeed, type MapPoiKind } from "../systems/mapFeed";
import { el, type Disposer } from "./dom";
import type { UIContext } from "./context";

/** Relationship bands -> NPC dot colour (strongest first). */
export const NPC_BANDS: { min: number; color: string; label: string }[] = [
  { min: 75, color: "#ff5c8a", label: "Very close" },
  { min: 35, color: "#f2b84b", label: "Friends" },
  { min: 10, color: "#6fa85a", label: "Friendly" },
  { min: -Infinity, color: "#8f98ad", label: "New" },
];
export const npcColor = (id: string) => {
  const r = store.getRelationship(id);
  return NPC_BANDS.find((b) => r >= b.min)!.color;
};

/** Interaction-point colours, grouped for the legend. */
const POI_STYLE: Record<MapPoiKind, { color: string; group: string }> = {
  cafe: { color: "#a0643c", group: "Café / food" },
  shop: { color: "#3f7fd0", group: "Shop" },
  fuel: { color: "#3f7fd0", group: "Shop" },
  salon: { color: "#c9679a", group: "Salon" },
  home: { color: "#e0703c", group: "Home" },
  stairs: { color: "#e0703c", group: "Home" },
  office: { color: "#2f6fd0", group: "Work" },
  landmark: { color: "#d4a018", group: "Landmark" },
  info: { color: "#6d6d7a", group: "Info" },
  exit: { color: "#ffffff", group: "Way out" },
  drive: { color: "#6d6d7a", group: "Info" },
};
export const POI_LEGEND = [...new Map(Object.values(POI_STYLE).map((s) => [s.group, s.color])).entries()].filter(([g]) => g !== "Info");

export interface LocalMap {
  el: HTMLElement;
  /** Redraw terrain + dots (on location / NPC changes). */
  redraw(): void;
  /** Move the player dot only. */
  movePlayer(): void;
}

/**
 * A fitted map of the current location, `maxW` x `maxH` CSS px (aspect kept).
 * `detail` draws larger POI markers (the modal).
 */
export function createLocalMap(md: Disposer, maxW: number, maxH: number, detail = false): LocalMap {
  const canvas = el("canvas", { class: "olw-lmap-canvas" });
  const dot = el("span", { class: "olw-lmap-player", attrs: { "aria-hidden": "true" } });
  const box = el("div", { class: detail ? "olw-lmap olw-lmap--big" : "olw-lmap" }, [canvas, dot]);
  const terrain = document.createElement("canvas");
  let terrainVersion = -1;
  let scale = 1;

  const fit = () => {
    scale = Math.min(maxW / mapFeed.w, maxH / mapFeed.h);
    const w = Math.max(1, Math.round(mapFeed.w * scale));
    const h = Math.max(1, Math.round(mapFeed.h * scale));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    return dpr;
  };

  const redraw = () => {
    box.classList.toggle("olw-hidden", !mapFeed.ready);
    if (!mapFeed.ready || !mapFeed.terrain) return;
    const dpr = fit();
    const g = canvas.getContext("2d");
    if (!g) return;
    if (terrainVersion !== mapFeed.version) {
      terrainVersion = mapFeed.version;
      terrain.width = mapFeed.w;
      terrain.height = mapFeed.h;
      const tg = terrain.getContext("2d");
      tg?.putImageData(new ImageData(new Uint8ClampedArray(mapFeed.terrain), mapFeed.w, mapFeed.h), 0, 0);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(terrain, 0, 0, mapFeed.w * scale, mapFeed.h * scale);

    // interaction points: small squares (exits: white rings)
    const ps = detail ? 5 : 3;
    for (const p of mapFeed.pois) {
      const x = p.x * scale;
      const y = -p.z * scale;
      const st = POI_STYLE[p.kind];
      if (p.kind === "exit") {
        g.beginPath();
        g.arc(x, y, ps * 0.8, 0, Math.PI * 2);
        g.lineWidth = detail ? 2 : 1.5;
        g.strokeStyle = "#ffffff";
        g.stroke();
        continue;
      }
      g.fillStyle = "rgba(40, 28, 20, 0.55)";
      g.fillRect(x - ps / 2 - 1, y - ps / 2 - 1, ps + 2, ps + 2);
      g.fillStyle = st.color;
      g.fillRect(x - ps / 2, y - ps / 2, ps, ps);
    }
    if (detail) {
      g.font = "600 11px Nunito, system-ui, sans-serif";
      g.textAlign = "center";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255, 250, 240, 0.9)";
      g.fillStyle = "#4a3426";
      for (const p of mapFeed.pois) {
        if (p.kind !== "exit" && p.kind !== "landmark") continue;
        const x = Math.min(Math.max(p.x * scale, 40), mapFeed.w * scale - 40);
        const y = Math.min(Math.max(-p.z * scale - 8, 12), mapFeed.h * scale - 4);
        g.strokeText(p.label, x, y);
        g.fillText(p.label, x, y);
      }
    }

    // NPCs: dots coloured by relationship
    const nr = detail ? 4.5 : 2.6;
    for (const n of mapFeed.npcs) {
      g.beginPath();
      g.arc(n.x * scale, -n.z * scale, nr, 0, Math.PI * 2);
      g.fillStyle = npcColor(n.id);
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "rgba(255, 255, 255, 0.9)";
      g.stroke();
      if (detail) {
        g.font = "700 11px Nunito, system-ui, sans-serif";
        g.textAlign = "center";
        g.lineWidth = 3;
        g.strokeStyle = "rgba(255, 250, 240, 0.9)";
        g.strokeText(n.name, n.x * scale, -n.z * scale - 8);
        g.fillStyle = "#4a3426";
        g.fillText(n.name, n.x * scale, -n.z * scale - 8);
      }
    }
    movePlayer();
  };

  const movePlayer = () => {
    if (!mapFeed.ready) return;
    const x = Math.min(Math.max(mapFeed.player.x, 0), mapFeed.w) * scale;
    const y = Math.min(Math.max(-mapFeed.player.z, 0), mapFeed.h) * scale;
    dot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };

  md.on(mapFeed, "location", redraw);
  md.on(mapFeed, "player", movePlayer);
  md.on(store, "relationship", redraw);
  redraw();
  return { el: box, redraw, movePlayer };
}

/** HUD minimap (top-left, under the stats). Tap to open the district map. */
export function mountMinimap(ctx: UIContext, openLocalMap: () => void): HTMLElement {
  const small = window.matchMedia?.("(max-width: 600px)").matches;
  const map = createLocalMap(ctx.d, small ? 104 : 150, small ? 84 : 118);
  const btn = el("button", { class: "olw-minimap", attrs: { type: "button", "aria-label": "Open district map" } }, [map.el]);
  ctx.d.listen(btn, "click", () => {
    if (!ctx.anyModal()) openLocalMap();
  });
  const sync = () => btn.classList.toggle("olw-hidden", !mapFeed.ready);
  ctx.d.on(mapFeed, "location", sync);
  sync();
  return btn;
}
