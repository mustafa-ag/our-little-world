import Phaser from "phaser";
import { CITIES } from "../data/locations";
import { MEMORIES } from "../data/memories";
import { NPCS } from "../data/npcs";
import { ITEMS } from "../data/items";
import { REL_MAX } from "../data/relationships";
import { store } from "../systems/store";
import { markRead } from "../systems/phone";
import { activateFromMessage as startQuest } from "../systems/quests";
import { controls, uiEvents } from "../systems/controls";

import { FONT_UI } from "../visual/theme";
import { resolvePortrait } from "../visual/portraits";

const FONT = FONT_UI;
type Tab = "messages" | "memories" | "map" | "contacts" | "bag";

export class PhoneOverlay {
  root: Phaser.GameObjects.Container;
  open = false;
  private tab: Tab = "messages";
  private body: Phaser.GameObjects.GameObject[] = [];
  private badge?: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(70);
    this.root.setVisible(false).setPosition(100000, 100000);
  }

  setBadge(t: Phaser.GameObjects.Text) {
    this.badge = t;
    this.refreshBadge();
  }

  refreshBadge() {
    const n = store.unreadCount();
    if (!this.badge) return;
    this.badge.setText(n > 0 ? `${n}` : "").setVisible(n > 0);
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  show(tab?: Tab) {
    this.open = true;
    this.tab = tab ?? this.tab;
    controls.locked = true;
    controls.moveX = 0;
    controls.moveY = 0;
    this.root.setVisible(true).setPosition(0, 0);
    this.rebuild();
  }

  close() {
    this.open = false;
    controls.locked = false;
    this.root.setVisible(false).setPosition(100000, 100000);
    this.clearBody();
  }

  private clearBody() {
    for (const o of this.body) o.destroy();
    this.body = [];
    this.root.removeAll(true);
  }

  private add(o: Phaser.GameObjects.GameObject) {
    this.body.push(o);
    this.root.add(o);
    return o;
  }

  private rebuild() {
    this.clearBody();
    const { width, height } = this.scene.scale.gameSize;
    const w = Math.min(width - 24, 400);
    const h = Math.min(height - 48, 520);
    const px = (width - w) / 2;
    const py = (height - h) / 2;

    const catcher = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x1a1420, 0.55).setInteractive();
    catcher.on("pointerdown", () => this.close());
    this.add(catcher);

    const g = this.scene.add.graphics();
    g.fillStyle(0x2b2233, 1).fillRoundedRect(px, py, w, h, 18);
    g.fillStyle(0xfff9f0, 1).fillRoundedRect(px + 8, py + 28, w - 16, h - 36, 14);
    g.fillStyle(0x3a2b3a, 1).fillRoundedRect(px + w / 2 - 24, py + 10, 48, 8, 4);
    this.add(g);

    const title = this.scene.add
      .text(px + 20, py + 40, "Phone", { fontFamily: FONT, fontSize: "16px", color: "#e46d94", fontStyle: "bold", resolution: 2 });
    this.add(title);
    const clock = this.scene.add
      .text(px + w - 20, py + 42, store.clockLabel(), { fontFamily: FONT, fontSize: "9px", color: "#a08a70", resolution: 2 })
      .setOrigin(1, 0);
    this.add(clock);

    const tabs: { id: Tab; label: string }[] = [
      { id: "messages", label: "Msgs" },
      { id: "memories", label: "Mem" },
      { id: "map", label: "Map" },
      { id: "contacts", label: "Ppl" },
      { id: "bag", label: "Bag" },
    ];
    tabs.forEach((t, i) => {
      const on = this.tab === t.id;
      const b = this.scene.add
        .text(px + 16 + i * 70, py + 64, t.label, {
          fontFamily: FONT,
          fontSize: "11px",
          color: on ? "#fff" : "#3a2b3a",
          backgroundColor: on ? "#e46d94" : "#efe4d4",
          padding: { x: 8, y: 4 },
          resolution: 2,
        })
        .setInteractive({ useHandCursor: true });
      b.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e?: Phaser.Types.Input.EventData) => {
        e?.stopPropagation?.();
        this.tab = t.id;
        this.rebuild();
      });
      this.add(b);
    });

    const innerTop = py + 96;
    const innerH = h - 140;
    if (this.tab === "messages") this.drawMessages(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "memories") this.drawMemories(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "map") this.drawMap(px + 16, innerTop, w - 32);
    if (this.tab === "contacts") this.drawContacts(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "bag") this.drawBag(px + 16, innerTop, w - 32, innerH);

    const close = this.scene.add
      .text(width / 2, py + h - 22, "Close", {
        fontFamily: FONT,
        fontSize: "13px",
        color: "#fff",
        backgroundColor: "#e46d94",
        padding: { x: 12, y: 5 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.close());
    this.add(close);
    this.refreshBadge();
  }

  private drawMessages(x: number, y: number, _w: number, maxH: number) {
    const list = store.state.messages;
    if (!list.length) {
      this.add(this.scene.add.text(x, y, "No texts yet.\nSleep, travel, talk — they'll find you.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 }));
      return;
    }
    let yy = y;
    for (const m of list.slice(0, 8)) {
      if (yy > y + maxH - 40) break;
      const name = NPCS.find((n) => n.id === m.sender)?.name ?? m.sender;
      const row = this.scene.add
        .text(x, yy, `${m.read ? "  " : "● "}${name} · day ${m.day}\n  ${m.body}`, {
          fontFamily: FONT,
          fontSize: "11px",
          color: "#3a2b3a",
          wordWrap: { width: _w - 8 },
          resolution: 2,
        })
        .setInteractive({ useHandCursor: true });
      row.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, e?: Phaser.Types.Input.EventData) => {
        e?.stopPropagation?.();
        markRead(m.id);
        if (m.questId) startQuest(m.questId);
        this.rebuild();
      });
      this.add(row);
      yy += 46;
    }
  }

  private drawMemories(x: number, y: number, w: number, maxH: number) {
    let yy = y;
    for (const city of CITIES) {
      const group = MEMORIES.filter((m) => m.cityId === city.id);
      if (!group.length) continue;
      const have = group.filter((m) => store.hasMemory(m.id)).length;
      this.add(this.scene.add.text(x, yy, `${city.name}  ${have}/${group.length}`, { fontFamily: FONT, fontSize: "12px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
      yy += 18;
      for (const mem of group) {
        if (yy > y + maxH - 20) return;
        const on = store.hasMemory(mem.id);
        const title = on ? mem.title : "???";
        const desc = on ? mem.description : "Not yet.";
        const card = this.scene.add.graphics();
        card.fillStyle(0xfffaf3, 1).fillRoundedRect(x, yy, w - 8, on ? 52 : 28, 6);
        card.lineStyle(1, 0xe8d8c0).strokeRoundedRect(x, yy, w - 8, on ? 52 : 28, 6);
        this.add(card);
        const port = resolvePortrait(this.scene, mem.npcs[0]);
        if (on && port) {
          this.add(this.scene.add.image(x + 22, yy + 26, port).setDisplaySize(28, 36));
        }
        this.add(this.scene.add.text(x + (on && port ? 44 : 8), yy + 6, title, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 }));
        if (on) {
          this.add(this.scene.add.text(x + (port ? 44 : 8), yy + 24, `Day ${store.state.memories[mem.id]?.day ?? "—"}  ·  ${desc}`, { fontFamily: FONT, fontSize: "10px", color: "#a08a70", wordWrap: { width: w - 56 }, resolution: 2 }));
          yy += 58;
        } else yy += 34;
      }
      yy += 8;
    }
  }

  private drawMap(x: number, y: number, w: number) {
    this.add(this.scene.add.text(x, y, "Globe or the little GPS.\nBoth still work.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", wordWrap: { width: w }, resolution: 2 }));
    const globe = this.scene.add
      .text(x, y + 50, "Open globe", { fontFamily: FONT, fontSize: "13px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 10, y: 6 }, resolution: 2 })
      .setInteractive({ useHandCursor: true });
    globe.on("pointerdown", () => {
      this.close();
      uiEvents.emit("openMap");
    });
    this.add(globe);
    const local = this.scene.add
      .text(x, y + 90, "Open district map", { fontFamily: FONT, fontSize: "13px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 10, y: 6 }, resolution: 2 })
      .setInteractive({ useHandCursor: true });
    local.on("pointerdown", () => {
      this.close();
      uiEvents.emit("openLocalMap");
    });
    this.add(local);
  }

  private drawContacts(x: number, y: number, w: number, maxH: number) {
    let yy = y;
    for (const n of NPCS) {
      if (yy > y + maxH - 16) break;
      const rel = store.getRelationship(n.id);
      const hearts = "♡".repeat(Math.max(1, Math.round((rel / REL_MAX) * 5)));
      this.add(this.scene.add.text(x, yy, `${n.name}  ${hearts}  ${rel}`, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", resolution: 2 }));
      yy += 20;
    }
    this.add(this.scene.add.text(x, yy + 8, "Talk, gift, travel. They remember.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", wordWrap: { width: w }, resolution: 2 }));
  }

  private drawBag(x: number, y: number, w: number, maxH: number) {
    const ids = Object.keys(store.state.inventory).filter((id) => store.getItemQuantity(id) > 0);
    if (!ids.length) {
      this.add(this.scene.add.text(x, y, "Bag's empty.\nPick flowers. Make coffee. Find secrets.", { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", wordWrap: { width: w }, resolution: 2 }));
      return;
    }
    let yy = y;
    for (const id of ids) {
      if (yy > y + maxH - 20) break;
      const def = ITEMS[id];
      this.add(this.scene.add.text(x, yy, `${def?.name ?? id}  ×${store.getItemQuantity(id)}\n  ${def?.desc ?? ""}`, { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", wordWrap: { width: w - 8 }, resolution: 2 }));
      yy += 36;
    }
  }
}
