import Phaser from "phaser";
import { BUILD_CATALOG, type BuildCatalogItem, type BuildCategory } from "../data/furnitureCatalog";
import type { HomeCell, HomeLayout, PlacedFurniture } from "./save";
import { store } from "./store";
import { controls } from "./controls";
import * as quests from "./quests";

type Tool = "build" | "break" | "move" | "store";

interface BuildModeOptions {
  widthCells: number;
  heightCells: number;
  layout: HomeLayout;
  onLayoutChanged: (layout: HomeLayout) => void;
  onFurniturePlaced: (piece: PlacedFurniture) => void;
  onFurnitureBreak: (x: number, y: number, storeIt: boolean) => boolean;
  storedCount: (texture: string) => number;
  takeStored: (texture: string) => boolean;
  onExit: () => void;
}

export class BuildModeController {
  private root?: Phaser.GameObjects.Container;
  private ghost?: Phaser.GameObjects.Rectangle;
  private structural?: Phaser.GameObjects.Graphics;
  private tool: Tool = "build";
  private category: BuildCategory = "furniture";
  private selected: BuildCatalogItem = BUILD_CATALOG.find((item) => item.id === "chair")!;
  private history: HomeLayout[] = [];
  private catalogPage = 0;
  private active = false;
  private uiCamera?: Phaser.Cameras.Scene2D.Camera;

  constructor(private scene: Phaser.Scene, private options: BuildModeOptions) {}

  open() {
    if (this.active) return;
    this.active = true;
    controls.buildModeActive = true;
    this.drawStructure();
    this.buildPalette();
    this.uiCamera = this.scene.cameras.add(0, 0, this.scene.scale.gameSize.width, this.scene.scale.gameSize.height).setScroll(0, 0).setZoom(1);
    this.syncPaletteCamera();
    this.scene.input.on("pointermove", this.preview, this);
    this.scene.input.on("pointerdown", this.place, this);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    controls.buildModeActive = false;
    this.scene.input.off("pointermove", this.preview, this);
    this.scene.input.off("pointerdown", this.place, this);
    this.root?.destroy(true);
    this.ghost?.destroy();
    this.structural?.destroy();
    if (this.uiCamera) this.scene.cameras.remove(this.uiCamera);
    this.root = undefined;
    this.ghost = undefined;
    this.structural = undefined;
    this.uiCamera = undefined;
    this.options.onExit();
  }

  destroy() {
    this.close();
  }

  private cloneLayout(): HomeLayout {
    return {
      floors: this.options.layout.floors.map((cell) => ({ ...cell })),
      walls: this.options.layout.walls.map((cell) => ({ ...cell })),
      doors: this.options.layout.doors.map((cell) => ({ ...cell })),
    };
  }

  private pushUndo() {
    this.history.push(this.cloneLayout());
    this.history = this.history.slice(-12);
  }

  private undo() {
    const prior = this.history.pop();
    if (!prior) { store.toast("Nothing to undo yet.", "#a08a70"); return; }
    this.options.layout.floors = prior.floors;
    this.options.layout.walls = prior.walls;
    this.options.layout.doors = prior.doors;
    this.changed();
  }

  private buildPalette() {
    const { width, height } = this.scene.scale.gameSize;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const shade = this.scene.add.rectangle(width / 2, height - 48, width, 96, 0x241d2a, 0.95).setScrollFactor(0).setDepth(95000).setInteractive();
    objects.push(shade);
    const tools: { id: Tool; label: string }[] = [{ id: "build", label: "BUILD" }, { id: "break", label: "BREAK" }, { id: "move", label: "MOVE" }, { id: "store", label: "STORE" }];
    tools.forEach((tool, index) => {
      const button = this.scene.add.text(8 + index * 62, height - 89, tool.label, { fontFamily: "monospace", fontSize: "9px", color: "#fff", backgroundColor: this.tool === tool.id ? "#e46d94" : "#65566d", padding: { x: 5, y: 5 }, fixedWidth: 56, align: "center", resolution: 2 }).setScrollFactor(0).setDepth(95002).setInteractive({ useHandCursor: true });
      button.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.tool = tool.id; this.buildPalette(); });
      objects.push(button);
    });
    const cats: BuildCategory[] = ["furniture", "decor", "floor", "wall", "door"];
    cats.forEach((category, index) => {
      const button = this.scene.add.text(8 + index * 58, height - 57, category.slice(0, 5).toUpperCase(), { fontFamily: "monospace", fontSize: "8px", color: "#3a2b3a", backgroundColor: this.category === category ? "#fff0bd" : "#e9dfd2", padding: { x: 4, y: 4 }, fixedWidth: 53, align: "center", resolution: 2 }).setScrollFactor(0).setDepth(95002).setInteractive({ useHandCursor: true });
      button.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.category = category; this.catalogPage = 0; this.selected = BUILD_CATALOG.find((item) => item.category === category && (!item.special || store.state.flags.wedding_completed))!; this.buildPalette(); });
      objects.push(button);
    });
    const choices = BUILD_CATALOG.filter((item) => item.category === this.category && (!item.special || store.state.flags.wedding_completed));
    const pageSize = 4;
    const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
    this.catalogPage = Phaser.Math.Clamp(this.catalogPage, 0, pageCount - 1);
    choices.slice(this.catalogPage * pageSize, this.catalogPage * pageSize + pageSize).forEach((item, index) => {
      const on = this.selected.id === item.id;
      const owned = item.texture ? this.options.storedCount(item.texture) : 0;
      const button = this.scene.add.text(8 + index * 76, height - 27, `${item.name.slice(0, 9)}\n${owned ? `owned ×${owned}` : item.price ? `${item.price}c` : "reward"}`, { fontFamily: "monospace", fontSize: "8px", color: on ? "#fff" : "#3a2b3a", backgroundColor: on ? "#2f6fd0" : "#fff9f0", padding: { x: 4, y: 3 }, fixedWidth: 70, align: "center", resolution: 2 }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(95002).setInteractive({ useHandCursor: true });
      button.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.selected = item; this.tool = "build"; this.buildPalette(); });
      objects.push(button);
    });
    if (pageCount > 1) {
      const previous = this.scene.add.text(width - 73, height - 30, "◀", { fontFamily: "sans-serif", fontSize: "13px", color: "#fff", backgroundColor: "#65566d", padding: { x: 7, y: 5 }, resolution: 2 }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(95003).setInteractive({ useHandCursor: true });
      previous.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.catalogPage = (this.catalogPage + pageCount - 1) % pageCount; this.buildPalette(); });
      const next = this.scene.add.text(width - 39, height - 30, "▶", { fontFamily: "sans-serif", fontSize: "13px", color: "#fff", backgroundColor: "#65566d", padding: { x: 7, y: 5 }, resolution: 2 }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(95003).setInteractive({ useHandCursor: true });
      next.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.catalogPage = (this.catalogPage + 1) % pageCount; this.buildPalette(); });
      const page = this.scene.add.text(width - 8, height - 30, `${this.catalogPage + 1}/${pageCount}`, { fontFamily: "monospace", fontSize: "8px", color: "#e9dfd2", resolution: 2 }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(95003);
      objects.push(previous, next, page);
    }
    const undo = this.scene.add.text(width - 94, height - 86, "UNDO", { fontFamily: "monospace", fontSize: "9px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 7, y: 5 }, resolution: 2 }).setScrollFactor(0).setDepth(95003).setInteractive({ useHandCursor: true });
    undo.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.undo(); });
    const done = this.scene.add.text(width - 8, height - 86, "DONE", { fontFamily: "monospace", fontSize: "10px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 9, y: 5 }, resolution: 2 }).setOrigin(1, 0).setScrollFactor(0).setDepth(95003).setInteractive({ useHandCursor: true });
    done.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); this.close(); });
    objects.push(undo, done);
    this.root?.destroy(true);
    this.root = this.scene.add.container(0, 0, objects).setScrollFactor(0).setDepth(95000);
    this.syncPaletteCamera();
  }

  private syncPaletteCamera() {
    if (!this.root || !this.uiCamera) return;
    this.scene.cameras.main.ignore(this.root);
    this.uiCamera.ignore(this.scene.children.list.filter((child) => child !== this.root));
  }

  private preview(pointer: Phaser.Input.Pointer) {
    if (!this.active || pointer.y > this.scene.scale.gameSize.height - 100) return;
    const cell = this.cellAt(pointer.worldX, pointer.worldY);
    const valid = this.validCell(cell.x, cell.y);
    if (!this.ghost) this.ghost = this.scene.add.rectangle(0, 0, 16, 16, 0x7be0a3, 0.35).setDepth(94000);
    this.ghost.setPosition(cell.x * 16 + 8, cell.y * 16 + 8).setFillStyle(valid ? 0x7be0a3 : 0xff6b6b, 0.4);
  }

  private place(pointer: Phaser.Input.Pointer) {
    if (!this.active || pointer.y > this.scene.scale.gameSize.height - 100) return;
    const { x, y } = this.cellAt(pointer.worldX, pointer.worldY);
    if (!this.validCell(x, y)) { store.toast("Keep the exit and Juju's path clear.", "#ff8fae"); return; }
    if (this.tool === "break") { this.breakAt(x, y, false); return; }
    if (this.tool === "store") { this.breakAt(x, y, true); return; }
    if (this.tool === "move") { store.toast("Drag furniture directly, then tap it again to rotate.", "#fff4e6"); return; }
    if (this.selected.special && !store.state.flags.wedding_completed) return;
    const usingStored = !!this.selected.texture && this.options.storedCount(this.selected.texture) > 0;
    if (!usingStored && this.selected.price && !store.spendCoins(this.selected.price)) { store.toast(`Need ${this.selected.price - store.state.coins} more coins.`, "#a08a70"); return; }
    if (usingStored && this.selected.texture) this.options.takeStored(this.selected.texture);
    this.pushUndo();
    if (this.selected.texture) {
      this.options.onFurniturePlaced({ tex: this.selected.texture, x: x * 16 + 8, y: y * 16 + 15 });
      if (!usingStored) store.incrementStat("furniture_bought");
      if (!usingStored) quests.onBuy(this.selected.texture);
    } else {
      const list = this.listFor(this.selected.category);
      const prior = list.find((cell) => cell.x === x && cell.y === y);
      if (prior) prior.style = this.selected.style ?? this.selected.id;
      else list.push({ x, y, style: this.selected.style ?? this.selected.id });
      if (this.selected.category === "door") this.options.layout.walls = this.options.layout.walls.filter((cell) => cell.x !== x || cell.y !== y);
      store.incrementStat("blocks_placed");
      if (this.selected.category === "wall" && !this.hasExitPath()) {
        const prior = this.history.pop();
        if (prior) {
          this.options.layout.floors = prior.floors;
          this.options.layout.walls = prior.walls;
          this.options.layout.doors = prior.doors;
        }
        if (this.selected.price) store.addCoins(this.selected.price);
        store.toast("That wall would trap Juju. Add a door or leave a route.", "#ff8fae");
        this.changed();
        return;
      }
    }
    this.changed();
  }

  private breakAt(x: number, y: number, storeIt: boolean) {
    if (y >= this.options.heightCells - 2 && Math.abs(x - this.options.widthCells / 2) < 2) { store.toast("The front door stays. Escape routes are cute.", "#ff8fae"); return; }
    this.pushUndo();
    let removed = false;
    for (const key of ["walls", "doors", "floors"] as const) {
      const before = this.options.layout[key].length;
      this.options.layout[key] = this.options.layout[key].filter((cell) => cell.x !== x || cell.y !== y);
      removed ||= before !== this.options.layout[key].length;
    }
    removed ||= this.options.onFurnitureBreak(x * 16 + 8, y * 16 + 8, storeIt);
    if (removed) { store.incrementStat("blocks_removed"); this.changed(); }
    else store.toast("Nothing here to remove.", "#a08a70");
  }

  private changed() {
    this.options.onLayoutChanged(this.options.layout);
    this.drawStructure();
  }

  private listFor(category: BuildCategory): HomeCell[] {
    if (category === "floor") return this.options.layout.floors;
    if (category === "door") return this.options.layout.doors;
    return this.options.layout.walls;
  }

  private cellAt(worldX: number, worldY: number) { return { x: Math.floor(worldX / 16), y: Math.floor(worldY / 16) }; }

  private validCell(x: number, y: number) {
    if (x < 1 || y < 2 || x >= this.options.widthCells - 1 || y >= this.options.heightCells - 1) return false;
    const exitX = Math.floor(this.options.widthCells / 2);
    if (y >= this.options.heightCells - 3 && Math.abs(x - exitX) <= 1) return false;
    return true;
  }

  private hasExitPath() {
    const start = { x: Math.floor(this.options.widthCells / 2), y: this.options.heightCells - 3 };
    const goal = { x: Math.floor(this.options.widthCells / 2), y: 3 };
    const blocked = new Set(this.options.layout.walls.map((cell) => `${cell.x},${cell.y}`));
    for (const door of this.options.layout.doors) blocked.delete(`${door.x},${door.y}`);
    const queue = [start];
    const seen = new Set([`${start.x},${start.y}`]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current.x === goal.x && current.y === goal.y) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = current.x + dx, ny = current.y + dy, key = `${nx},${ny}`;
        if (nx < 1 || ny < 2 || nx >= this.options.widthCells - 1 || ny >= this.options.heightCells - 1 || blocked.has(key) || seen.has(key)) continue;
        seen.add(key); queue.push({ x: nx, y: ny });
      }
    }
    return false;
  }

  private drawStructure() {
    this.structural?.destroy();
    const g = this.scene.add.graphics().setDepth(8);
    const floorColors: Record<string, number> = { wood: 0xc69b6d, cream: 0xe8d7bd, coastal: 0xb8dce5 };
    for (const cell of this.options.layout.floors) g.fillStyle(floorColors[cell.style] ?? 0xc69b6d, 0.7).fillRect(cell.x * 16, cell.y * 16, 16, 16);
    const wallColors: Record<string, number> = { plaster: 0xeadcc8, sage: 0xa9b8a0, luxury: 0x6f6178 };
    for (const cell of this.options.layout.walls) g.fillStyle(wallColors[cell.style] ?? 0xeadcc8, 1).fillRoundedRect(cell.x * 16, cell.y * 16 + 2, 16, 12, 2);
    for (const cell of this.options.layout.doors) { g.fillStyle(cell.style === "blue" ? 0x3f79a8 : 0x8a5b3f, 1).fillRect(cell.x * 16 + 2, cell.y * 16, 12, 16); g.fillStyle(0xf4c95d, 1).fillCircle(cell.x * 16 + 11, cell.y * 16 + 8, 1.5); }
    this.structural = g;
  }
}
