import Phaser from "phaser";
import { CITIES } from "../data/locations";
import { getLocation } from "../data/locations";
import { MEMORIES } from "../data/memories";
import { NPCS } from "../data/npcs";
import { ITEMS } from "../data/items";
import { Outfits } from "../palette";
import { OUTFIT_UNLOCKS } from "../data/outfits";
import { rebuildPlayerTexture } from "../textures";
import { REL_MAX } from "../data/relationships";
import { bandFor } from "../data/relationships";
import { KEEPSAKES } from "../data/relationshipMilestones";
import { SECRETS } from "../data/secrets";
import { QUESTS } from "../data/quests";
import { store } from "../systems/store";
import { activateFromMessage as startQuest, canStartQuest, prerequisiteHint } from "../systems/quests";
import { controls, uiEvents } from "../systems/controls";
import { LIFE_STATS } from "../data/stats";
import { SOUVENIRS } from "../data/souvenirs";
import { SceneKeys } from "../constants";
import { chatContacts, markThreadRead, sendChat, suggestionsFor, threadFor } from "../systems/chat";
import { PROPERTIES } from "../data/properties";
import { buyProperty, propertyStatus, setPrimaryHome, visitProperty } from "../systems/properties";

const FONT = "monospace";
export type PhoneTab = "messages" | "quests" | "camera" | "album" | "stats" | "map" | "contacts" | "car" | "homes" | "notes" | "bag" | "style" | "debug";

export class PhoneOverlay {
  root: Phaser.GameObjects.Container;
  open = false;
  private tab: PhoneTab = "messages";
  private body: Phaser.GameObjects.GameObject[] = [];
  private badge?: Phaser.GameObjects.Text;
  private readonly debugQuestTour = new URLSearchParams(window.location.search).has("debugQuests");
  private debugQuestIndex = 0;
  private albumFilter = "all";
  private selectedChat?: string;
  private chatContactPage = 0;
  private propertyPage = 0;
  private questSection: "active" | "available" | "completed" = "active";
  private questPage = 0;

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

  show(tab?: PhoneTab) {
    if (controls.cameraMode) {
      controls.cameraMode = false;
      uiEvents.emit("cameraExit");
    }
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

    const tabs: { id: PhoneTab; label: string }[] = [
      { id: "messages", label: "Msgs" },
      { id: "quests", label: "Quests" },
      { id: "camera", label: "Cam" },
      { id: "album", label: "Album" },
      { id: "stats", label: "Stats" },
      { id: "map", label: "Map" },
      { id: "contacts", label: "Ppl" },
      { id: "car", label: "Car" },
      { id: "homes", label: "Homes" },
      { id: "notes", label: "Notes" },
      { id: "bag", label: "Bag" },
      { id: "style", label: "Fit" },
    ];
    if (this.debugQuestTour) tabs.push({ id: "debug", label: "Debug" });
    const tabCols = 4;
    const tabW = (w - 32) / tabCols;
    tabs.forEach((t, i) => {
      const on = this.tab === t.id;
      const col = i % tabCols;
      const row = Math.floor(i / tabCols);
      const b = this.scene.add
        .text(px + 16 + col * tabW, py + 64 + row * 25, t.label, {
          fontFamily: FONT,
          fontSize: "9px",
          color: on ? "#fff" : "#3a2b3a",
          backgroundColor: on ? "#e46d94" : "#efe4d4",
          padding: { x: 6, y: 4 },
          fixedWidth: tabW - 3,
          align: "center",
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

    const tabRows = Math.ceil(tabs.length / tabCols);
    const innerTop = py + 70 + tabRows * 25;
    const innerH = py + h - 52 - innerTop;
    if (this.tab === "messages") this.drawMessages(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "quests") this.drawQuests(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "camera") this.drawCamera(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "album") this.drawAlbum(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "stats") this.drawStats(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "map") this.drawMap(px + 16, innerTop, w - 32);
    if (this.tab === "contacts") this.drawContacts(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "car") this.drawCar(px + 16, innerTop, w - 32);
    if (this.tab === "homes") this.drawHomes(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "notes") this.drawNotes(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "bag") this.drawBag(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "style") this.drawStyle(px + 16, innerTop, w - 32, innerH);
    if (this.tab === "debug" && this.debugQuestTour) this.drawQuestTour(px + 16, innerTop, w - 32, innerH);

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

  private drawMessages(x: number, y: number, w: number, maxH: number) {
    if (this.selectedChat) {
      this.drawConversation(this.selectedChat, x, y, w, maxH);
      return;
    }
    let yy = y;
    this.add(this.scene.add.text(x, yy, "CHATS", { fontFamily: FONT, fontSize: "13px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    const contacts = chatContacts();
    const pageSize = maxH < 210 ? 3 : 6;
    const pages = Math.max(1, Math.ceil(contacts.length / pageSize));
    this.chatContactPage %= pages;
    if (pages > 1) {
      const next = this.scene.add.text(x + w, yy, `${this.chatContactPage + 1}/${pages}  NEXT ›`, { fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 5, y: 3 }, resolution: 2 }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      next.on("pointerdown", () => { this.chatContactPage = (this.chatContactPage + 1) % pages; this.rebuild(); });
      this.add(next);
    }
    yy += 20;
    for (const contact of contacts.slice(this.chatContactPage * pageSize, (this.chatContactPage + 1) * pageSize)) {
      if (yy > y + maxH - 34) break;
      const thread = threadFor(contact.id);
      const last = thread[thread.length - 1];
      const unread = thread.filter((entry) => entry.direction === "incoming" && !entry.read).length;
      const preview = last?.body ?? "Start a conversation ♡";
      const row = this.scene.add.text(x, yy, `${contact.id === "moomoo" ? "♥ " : ""}${contact.name}${unread ? `  ●${unread}` : ""}\n${preview.slice(0, 45)}`, {
        fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", backgroundColor: contact.id === "moomoo" ? "#fff0f5" : "#f1e8dc",
        padding: { x: 7, y: 5 }, fixedWidth: w, wordWrap: { width: w - 16 }, resolution: 2,
      }).setInteractive({ useHandCursor: true });
      row.on("pointerdown", () => {
        this.selectedChat = contact.id;
        const attachment = [...thread].reverse().find((entry) => entry.questId)?.questId;
        if (attachment) startQuest(attachment);
        markThreadRead(contact.id);
        this.rebuild();
      });
      this.add(row);
      yy += maxH < 210 ? 35 : 40;
    }
  }

  private drawConversation(contactId: string, x: number, y: number, w: number, maxH: number) {
    const contact = NPCS.find((npc) => npc.id === contactId);
    const back = this.scene.add.text(x, y, "‹ CHATS", { fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 7, y: 4 }, resolution: 2 }).setInteractive({ useHandCursor: true });
    back.on("pointerdown", () => { this.selectedChat = undefined; this.rebuild(); });
    this.add(back);
    this.add(this.scene.add.text(x + w, y + 3, `${contactId === "moomoo" ? "♥ " : ""}${contact?.name ?? contactId} · ${store.state.relationshipStage}`, { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(1, 0));
    const suggestions = suggestionsFor(contactId).slice(0, 3);
    const compact = maxH < 170;
    const thread = threadFor(contactId).slice(compact ? -2 : maxH < 220 ? -2 : -4);
    let yy = y + 27;
    for (const entry of thread) {
      const mine = entry.direction === "outgoing";
      const bubble = this.scene.add.text(mine ? x + w : x, yy, entry.body, {
        fontFamily: FONT, fontSize: compact ? "9px" : "10px", color: mine ? "#fff" : "#3a2b3a", backgroundColor: mine ? "#e46d94" : "#e9dfd2",
        padding: { x: compact ? 5 : 7, y: compact ? 3 : 5 }, wordWrap: { width: w * (compact ? 0.86 : 0.72) }, fixedWidth: w * (compact ? 0.9 : 0.76), align: mine ? "right" : "left", resolution: 2,
      }).setOrigin(mine ? 1 : 0, 0);
      this.add(bubble);
      yy += Math.max(compact ? 22 : 29, bubble.height + (compact ? 2 : 4));
    }
    const suggestY = y + maxH - 72;
    suggestions.forEach((body, index) => {
      const button = this.scene.add.text(x + index * (w / 3), suggestY, body, { fontFamily: FONT, fontSize: "8px", color: "#3a2b3a", backgroundColor: "#fff0bd", padding: { x: 4, y: 5 }, fixedWidth: w / 3 - 3, align: "center", wordWrap: { width: w / 3 - 10 }, resolution: 2 }).setInteractive({ useHandCursor: true });
      button.on("pointerdown", () => { sendChat(contactId, body); markThreadRead(contactId); this.rebuild(); });
      this.add(button);
    });
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type a text…";
    input.maxLength = 280;
    input.setAttribute("aria-label", `Message ${contact?.name ?? contactId}`);
    input.style.cssText = "width:220px;height:30px;border:2px solid #e4c8ce;border-radius:12px;padding:0 10px;font:13px system-ui;background:#fff;color:#3a2b3a;box-sizing:border-box;";
    const inputX = x + Math.min(120, w * 0.35);
    const inputY = y + maxH - 25;
    const dom = this.scene.add.dom(inputX, inputY, input).setOrigin(0.5).setScrollFactor(0);
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Enter") return;
      if (sendChat(contactId, input.value)) { markThreadRead(contactId); this.rebuild(); }
    });
    this.add(dom);
    const send = this.scene.add.text(x + w, inputY - 13, "SEND", { fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 8, y: 6 }, resolution: 2 }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    send.on("pointerdown", () => { if (sendChat(contactId, input.value)) { markThreadRead(contactId); this.rebuild(); } });
    this.add(send);
  }

  private drawCar(x: number, y: number, w: number) {
    this.add(this.scene.add.text(x, y, "BLUE JEEP", { fontFamily: FONT, fontSize: "15px", color: "#2f6fd0", fontStyle: "bold", resolution: 2 }));
    this.add(this.scene.add.text(x, y + 28, "Your existing Jeep can come find Juju during normal outdoor exploration.", { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", wordWrap: { width: w }, resolution: 2 }));
    const call = this.scene.add.text(x + w / 2, y + 92, "CALL JEEP", { fontFamily: FONT, fontSize: "16px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 20, y: 10 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    call.on("pointerdown", () => { this.close(); uiEvents.emit("callJeep"); });
    this.add(call);
    this.add(this.scene.add.text(x + w / 2, y + 132, "No duplicate cars. Jeep promises.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", resolution: 2 }).setOrigin(0.5));
  }

  private drawHomes(x: number, y: number, w: number, maxH: number) {
    let yy = y;
    this.add(this.scene.add.text(x, yy, "OUR HOMES", { fontFamily: FONT, fontSize: "13px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    const pageSize = maxH < 180 ? 2 : maxH < 260 ? 3 : 5;
    const pages = Math.ceil(PROPERTIES.length / pageSize);
    this.propertyPage %= pages;
    const next = this.scene.add.text(x + w, yy, `${this.propertyPage + 1}/${pages}  NEXT ›`, { fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 5, y: 3 }, resolution: 2 }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    next.on("pointerdown", () => { this.propertyPage = (this.propertyPage + 1) % pages; this.rebuild(); });
    this.add(next);
    yy += 20;
    for (const def of PROPERTIES.slice(this.propertyPage * pageSize, (this.propertyPage + 1) * pageSize)) {
      if (yy > y + maxH - 48) break;
      const { state, locked, affordable } = propertyStatus(def.id);
      const status = state.owned ? (store.state.primaryHomeId === def.id ? "OUR HOME" : "OWNED") : locked ? "AFTER WEDDING" : `${def.price} coins`;
      this.add(this.scene.add.text(x, yy, `${def.name} · ${def.bedrooms}BR\n${def.location} · ${status}`, { fontFamily: FONT, fontSize: "9px", color: "#3a2b3a", wordWrap: { width: w - 108 }, resolution: 2 }));
      const label = state.owned ? (store.state.primaryHomeId === def.id ? "Visit" : "Set home") : state.visited ? (affordable ? "Buy" : "Save") : "Tour";
      const button = this.scene.add.text(x + w, yy + 2, label, { fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: locked ? "#8a7a6a" : state.owned ? "#e46d94" : "#2f6fd0", padding: { x: 6, y: 5 }, fixedWidth: 82, align: "center", resolution: 2 }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      button.on("pointerdown", () => {
        if (locked) { store.toast("Plan this one together after the wedding.", "#a08a70"); return; }
        if (state.owned && store.state.primaryHomeId !== def.id) { setPrimaryHome(def.id); store.toast(`${def.name} is now home ♡`, "#f4a6c0"); this.rebuild(); return; }
        if (state.visited && !state.owned) { const result = buyProperty(def.id); store.toast(result.reason, result.ok ? "#f4c95d" : "#a08a70"); this.rebuild(); return; }
        visitProperty(def.id);
        this.close();
        const active = this.scene.scene.manager.getScene(SceneKeys.World);
        if (active?.scene.isActive()) active.scene.start(SceneKeys.House, { propertyId: def.id, tour: !state.owned, title: def.name });
        else store.toast("Finish this adventure before booking a tour.", "#a08a70");
      });
      this.add(button);
      yy += 42;
    }
  }

  private drawCamera(x: number, y: number, w: number, _maxH: number) {
    this.add(this.scene.add.text(x, y, "PHONE CAMERA", { fontFamily: FONT, fontSize: "15px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    this.add(this.scene.add.text(x, y + 26, "Choose a mood, then frame the actual scene.\nMove the view with keys or joystick. Action takes it.", { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", wordWrap: { width: w }, lineSpacing: 3, resolution: 2 }));
    const poses = [
      { id: "smile", label: "☺ Smile" },
      { id: "peace", label: "V Peace" },
      { id: "silly", label: ":P Silly" },
      { id: "hug", label: "♡ Hug" },
    ] as const;
    poses.forEach((pose, index) => {
      const selected = controls.cameraPose === pose.id;
      const col = index % 2;
      const row = Math.floor(index / 2);
      const button = this.scene.add.text(x + col * (w / 2), y + 86 + row * 42, pose.label, {
        fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: selected ? "#e46d94" : "#8a7a6a",
        padding: { x: 9, y: 6 }, fixedWidth: w / 2 - 8, align: "center", resolution: 2,
      }).setInteractive({ useHandCursor: true });
      button.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
        event?.stopPropagation?.();
        controls.cameraPose = pose.id;
        this.rebuild();
      });
      this.add(button);
    });
    const start = this.scene.add.text(x + w / 2, y + 186, "OPEN CAMERA", {
      fontFamily: FONT, fontSize: "15px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 18, y: 9 }, resolution: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
      event?.stopPropagation?.();
      const manager = this.scene.scene.manager;
      if (!manager.isActive(SceneKeys.World) && !manager.isActive(SceneKeys.House)) {
        store.toast("Camera is available while walking around.", "#a08a70");
        return;
      }
      const pose = controls.cameraPose;
      this.close();
      controls.cameraMode = true;
      uiEvents.emit("cameraStart", pose);
    });
    this.add(start);
    this.add(this.scene.add.text(x + w / 2, y + 222, "ESC or the on-screen exit closes camera mode.\nPhotos save scene metadata—not giant image files.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", align: "center", wordWrap: { width: w }, resolution: 2 }).setOrigin(0.5, 0));
  }

  private drawStats(x: number, y: number, w: number, maxH: number) {
    this.add(this.scene.add.text(x, y, "JUJU'S VERY SERIOUS STATS", { fontFamily: FONT, fontSize: "13px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    this.add(this.scene.add.text(x, y + 20, `Countries visited  ${store.getStat("countries_visited")}   ·   Cities  ${store.getStat("cities_visited")}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", resolution: 2 }));
    const shoppingHistory = store.state.shoppingHistory;
    const latestShopping = shoppingHistory[shoppingHistory.length - 1];
    if (latestShopping) this.add(this.scene.add.text(x, y + 36, `LAST MALL REPORT  ${latestShopping.productIds.length} bags · Baba ${latestShopping.babaStress}% · ${latestShopping.ultimateUsed ? "Moomoo rescued" : latestShopping.babaBattle}`, { fontFamily: FONT, fontSize: "9px", color: "#2f6fd0", wordWrap: { width: w }, resolution: 2 }));
    let yy = y + (latestShopping ? 60 : 48);
    for (const def of LIFE_STATS) {
      if (yy > y + maxH - 18) break;
      const value = def.id === "workdays_completed"
        ? store.state.adnocWorkdays
        : def.id === "promotions_earned"
          ? store.state.adnocCareerStats.promotions_earned ?? store.getStat(def.id)
        : store.getStat(def.id) || store.state.adnocCareerStats[def.id] || 0;
      this.add(this.scene.add.text(x, yy, `${def.icon}  ${def.label}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", resolution: 2 }));
      this.add(this.scene.add.text(x + w, yy, `${value}`, { fontFamily: FONT, fontSize: "11px", color: value ? "#2f6fd0" : "#a08a70", fontStyle: "bold", resolution: 2 }).setOrigin(1, 0));
      yy += 18;
    }
  }

  private drawAlbum(x: number, y: number, w: number, maxH: number) {
    const filters = ["all", "abudhabi", "dubai", "london", "edinburgh", "germany", "family", "friends", "career", "chaos"];
    if (!filters.includes(this.albumFilter)) this.albumFilter = "all";
    const filterIndex = filters.indexOf(this.albumFilter);
    const setFilter = (offset: number) => {
      this.albumFilter = filters[(filterIndex + offset + filters.length) % filters.length];
      this.rebuild();
    };
    const left = this.scene.add.text(x, y, "‹", { fontFamily: FONT, fontSize: "18px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 7, y: 1 }, resolution: 2 }).setInteractive({ useHandCursor: true });
    const right = this.scene.add.text(x + w, y, "›", { fontFamily: FONT, fontSize: "18px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 7, y: 1 }, resolution: 2 }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    left.on("pointerdown", () => setFilter(-1));
    right.on("pointerdown", () => setFilter(1));
    this.add(left); this.add(right);
    this.add(this.scene.add.text(x + w / 2, y + 4, `SCRAPBOOK · ${this.albumFilter.toUpperCase()}`, { fontFamily: FONT, fontSize: "12px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(0.5, 0));

    const familyIds = ["mama", "baba", "fadwa", "nour", "jad", "shan"];
    const socialCategories = (ids: string[]) => [
      ...(ids.some((id) => familyIds.includes(id)) ? ["family"] : []),
      ...(ids.some((id) => !familyIds.includes(id)) ? ["friends"] : []),
    ];
    const matches = (cityId: string, categories: string[] = []) => this.albumFilter === "all" || this.albumFilter === cityId || categories.includes(this.albumFilter);
    const photos = Object.values(store.state.photos)
      .filter((photo) => {
        const people = photo.participantIds ?? (photo.companionId ? [photo.companionId] : []);
        return matches(getLocation(photo.locationId).cityId, [...socialCategories(people), ...(photo.frame === "chaos" ? ["chaos"] : [])]);
      })
      .sort((a, b) => b.day - a.day);
    let yy = y + 34;
    for (const [index, photo] of photos.slice(0, 2).entries()) {
      const card = this.scene.add.rectangle(x + w / 2, yy + 23, w - 6, 46, 0xfffdf8).setStrokeStyle(2, index % 2 ? 0xf4a6c0 : 0xd9c7ab).setAngle(index % 2 ? 0.45 : -0.45).setInteractive({ useHandCursor: true });
      const participants = (photo.participantIds ?? (photo.companionId ? [photo.companionId] : []))
        .map((id) => NPCS.find((npc) => npc.id === id)?.name ?? id).join(" + ");
      const label = this.scene.add.text(x + 12, yy + 5, `▣  ${photo.title}${photo.surprise ? `  ·  ${photo.surprise}!` : ""}\nDay ${photo.day} · ${photo.timeOfDay} · ${photo.pose ?? "smile"}${participants ? ` · ${participants}` : ""}`, { fontFamily: FONT, fontSize: "9px", color: "#3a2b3a", wordWrap: { width: w - 24 }, resolution: 2 });
      card.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, e?: Phaser.Types.Input.EventData) => {
        e?.stopPropagation?.();
        this.showPhotoViewer(photo.title, `${photo.caption ?? "A little moment, kept."}${photo.surprise ? `\nPhotobomb: ${photo.surprise}.` : ""}`);
      });
      this.add(card); this.add(label);
      yy += 53;
    }
    if (!photos.length) {
      this.add(this.scene.add.text(x, yy, "No camera Polaroids in this tab yet.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", resolution: 2 }));
      yy += 24;
    }
    if (yy > y + maxH - 60) return;
    const memories = MEMORIES.filter((memory) => matches(memory.cityId, [...socialCategories(memory.npcs), ...(memory.category ? [memory.category] : [])]));
    const have = memories.filter((memory) => store.hasMemory(memory.id)).length;
    this.add(this.scene.add.text(x, yy, `MEMORY PAGES  ${have}/${memories.length}   ✦ stickers included`, { fontFamily: FONT, fontSize: "10px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    yy += 18;
    for (const memory of memories.slice(0, Math.max(1, Math.floor((y + maxH - yy) / 49)))) {
      const unlocked = store.hasMemory(memory.id);
      const title = unlocked ? memory.title : (memory.hiddenClue ?? "TORN EMPTY POLAROID");
      const caption = unlocked ? (memory.caption ?? memory.description) : "??? · keep looking";
      const card = this.scene.add.rectangle(x + w / 2, yy + 20, w - 8, memory.spread ? 44 : 40, unlocked ? 0xfff7df : 0xeee5da).setStrokeStyle(memory.spread ? 3 : 2, unlocked ? 0xf4c95d : 0xc9b9a8).setInteractive({ useHandCursor: unlocked });
      const sticker = memory.sticker ? `[${memory.sticker}] ` : unlocked ? "♡ " : "· ";
      const text = this.scene.add.text(x + 12, yy + 5, `${sticker}${title}\n${caption}`, { fontFamily: FONT, fontSize: "9px", color: unlocked ? "#3a2b3a" : "#8a7a6a", fontStyle: memory.spread ? "bold" : "normal", wordWrap: { width: w - 28 }, resolution: 2 });
      if (unlocked) card.on("pointerdown", () => this.showPhotoViewer(memory.title, `${memory.description}\n\n${memory.caption ?? "kept forever"}`));
      this.add(card); this.add(text);
      yy += memory.spread ? 51 : 47;
    }
  }

  private showPhotoViewer(title: string, caption: string) {
    const { width, height } = this.scene.scale.gameSize;
    const overlay = this.scene.add.container(0, 0).setDepth(80);
    const shade = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x1a1420, 0.72).setInteractive();
    const paper = this.scene.add.rectangle(width / 2, height / 2, Math.min(width - 64, 330), 220, 0xfffdf8).setStrokeStyle(4, 0xd9c7ab);
    const heading = this.scene.add.text(width / 2, height / 2 - 72, title, { fontFamily: FONT, fontSize: "16px", color: "#e46d94", fontStyle: "bold", resolution: 2 }).setOrigin(0.5);
    const body = this.scene.add.text(width / 2, height / 2 - 18, caption, { fontFamily: FONT, fontSize: "12px", color: "#3a2b3a", align: "center", wordWrap: { width: 240 }, resolution: 2 }).setOrigin(0.5);
    const close = this.scene.add.text(width / 2, height / 2 + 70, "Tap to close", { fontFamily: FONT, fontSize: "11px", color: "#fff", backgroundColor: "#e46d94", padding: { x: 8, y: 4 }, resolution: 2 }).setOrigin(0.5);
    overlay.add([shade, paper, heading, body, close]);
    shade.on("pointerdown", () => overlay.destroy());
    close.setInteractive({ useHandCursor: true }).on("pointerdown", () => overlay.destroy());
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
        const title = on ? mem.title : mem.hidden ? "???" : "???";
        const desc = on ? mem.description : "Not yet.";
        this.add(this.scene.add.text(x + 6, yy, `${on ? "♡" : "·"} ${title}`, { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", wordWrap: { width: w - 12 }, resolution: 2 }));
        yy += on ? 16 : 16;
        if (on) {
          this.add(this.scene.add.text(x + 16, yy, desc, { fontFamily: FONT, fontSize: "10px", color: "#a08a70", wordWrap: { width: w - 20 }, resolution: 2 }));
          yy += 22;
        }
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
    if (store.state.tigor.unlocked) {
      const withYou = store.state.tigor.following;
      this.add(this.scene.add.text(x, yy, "PETS", { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
      yy += 19;
      this.add(this.scene.add.text(x, yy, `Tigor  ♡  ${withYou ? "Exploring with Juju" : "Waiting at home"}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", resolution: 2 }));
      const petButton = this.scene.add.text(x + w - 4, yy - 4, withYou ? "Send home" : "Bring Tigor", {
        fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: withYou ? "#8a7a6a" : "#d28b36",
        padding: { x: 7, y: 5 }, resolution: 2,
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      petButton.on("pointerdown", () => { store.setTigorFollowing(!withYou); this.rebuild(); });
      this.add(petButton);
      yy += 31;
      this.add(this.scene.add.text(x, yy, "PEOPLE", { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
      yy += 19;
    }
    for (const n of NPCS) {
      if (yy > y + maxH - 34) break;
      const rel = store.getRelationship(n.id);
      const hearts = "♡".repeat(Math.max(1, Math.round((rel / REL_MAX) * 5)));
      const unlocked = store.state.unlockedCompanions.includes(n.id);
      const active = store.state.activeCompanionId === n.id;
      const stage = n.id === "moomoo" ? ` · ${store.state.relationshipStage}` : "";
      this.add(this.scene.add.text(x, yy, `${n.name}  ${hearts}  ${rel} · ${bandFor(rel)}${stage}`, { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", resolution: 2 }));
      if (unlocked) {
        const button = this.scene.add.text(x + w - 84, yy - 2, active ? "With you" : "Invite", {
          fontFamily: FONT,
          fontSize: "9px",
          color: "#fff",
          backgroundColor: active ? "#e46d94" : "#2f6fd0",
          padding: { x: 5, y: 3 },
          resolution: 2,
        }).setInteractive({ useHandCursor: true });
        button.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event?: Phaser.Types.Input.EventData) => {
          event?.stopPropagation?.();
          store.setActiveCompanion(active ? undefined : n.id);
          uiEvents.emit("companionChanged");
          store.toast(active ? "You are exploring solo for now." : `${n.name} is coming along.`, "#e46d94");
          this.rebuild();
        });
        this.add(button);
      }
      yy += 24;
    }
    this.add(this.scene.add.text(x, yy + 4, "Talk, gift, travel. Stronger bonds unlock outings.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", wordWrap: { width: w }, resolution: 2 }));
  }

  private drawQuests(x: number, y: number, w: number, maxH: number) {
    let yy = y;
    const replay = store.questReplay;
    if (replay) {
      const target = QUESTS.find((quest) => quest.id === replay.questId);
      this.add(this.scene.add.text(x, yy, `REPLAY MODE · ${target?.title ?? replay.questId}\nNothing here changes your real save.`, {
        fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 7, y: 5 },
        fixedWidth: w - 96, wordWrap: { width: w - 112 }, resolution: 2,
      }));
      const exit = this.scene.add.text(x + w, yy, "EXIT\nREPLAY", {
        fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: "#b34b62", padding: { x: 8, y: 7 }, align: "center", resolution: 2,
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      exit.on("pointerdown", () => { this.close(); store.exitQuestReplay(false); });
      this.add(exit);
      yy += 47;
    }

    const sections: Array<{ id: "active" | "available" | "completed"; label: string }> = [
      { id: "active", label: "ACTIVE" }, { id: "available", label: "AVAILABLE" }, { id: "completed", label: "COMPLETED" },
    ];
    sections.forEach((section, index) => {
      const selected = section.id === this.questSection;
      const tab = this.scene.add.text(x + index * (w / 3), yy, section.label, {
        fontFamily: FONT, fontSize: "8px", color: selected ? "#fff" : "#3a2b3a", backgroundColor: selected ? "#e46d94" : "#eee5da",
        padding: { x: 3, y: 5 }, fixedWidth: w / 3 - 3, align: "center", resolution: 2,
      }).setInteractive({ useHandCursor: true });
      tab.on("pointerdown", () => { this.questSection = section.id; this.questPage = 0; this.rebuild(); });
      this.add(tab);
    });
    yy += 26;

    const list = QUESTS.filter((quest) => {
      const status = store.state.quests[quest.id]?.status ?? "available";
      return this.questSection === "completed" ? status === "done" : this.questSection === "active" ? status === "active" : status === "available";
    });
    const compactCards = maxH < 230;
    const cardH = compactCards ? 45 : 76;
    const pageSize = Math.max(1, Math.min(3, Math.floor((y + maxH - yy - 26) / cardH)));
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    this.questPage = Math.min(this.questPage, pages - 1);
    const shown = list.slice(this.questPage * pageSize, (this.questPage + 1) * pageSize);
    if (!shown.length) {
      this.add(this.scene.add.text(x, yy + 14, this.questSection === "active" ? "No active quests. Pick an adventure from Available." : "Nothing here yet.", {
        fontFamily: FONT, fontSize: "11px", color: "#7a6a5a", wordWrap: { width: w }, resolution: 2,
      }));
    }
    for (const quest of shown) {
      const progress = store.state.quests[quest.id];
      const isReady = canStartQuest(quest.id);
      const active = progress?.status === "active";
      const step = active ? quest.steps[progress.step] : undefined;
      const line = active ? step?.hint ?? "Ready" : this.questSection === "available" ? prerequisiteHint(quest) : quest.complete;
      const card = this.scene.add.text(x, yy, `${quest.title}\n${line}`, {
        fontFamily: FONT, fontSize: compactCards ? "8px" : "9px", color: "#3a2b3a", fontStyle: "bold", backgroundColor: "#f1e8dc", padding: { x: 7, y: compactCards ? 4 : 6 },
        fixedWidth: w - 91, fixedHeight: cardH - (compactCards ? 4 : 7), wordWrap: { width: w - 108 }, resolution: 2,
      });
      this.add(card);
      const actionLabel = active && quest.id === "q_retrieve_tigor" ? "PLAY" : this.questSection === "available" ? (isReady ? "START" : "LOCKED") : this.questSection === "completed" ? "REPLAY" : "ACTIVE";
      const enabled = (active && quest.id === "q_retrieve_tigor") || (this.questSection === "available" && isReady) || (this.questSection === "completed" && !replay);
      const action = this.scene.add.text(x + w, yy + 8, actionLabel, {
        fontFamily: FONT, fontSize: "9px", color: "#fff", backgroundColor: enabled ? "#2f6fd0" : "#8a7a6a", padding: { x: 8, y: compactCards ? 7 : 10 },
        fixedWidth: 82, fixedHeight: compactCards ? 35 : undefined, align: "center", resolution: 2,
      }).setOrigin(1, 0);
      if (enabled) {
        action.setInteractive({ useHandCursor: true });
        action.on("pointerdown", () => {
          if (active && quest.id === "q_retrieve_tigor") this.launchQuestScene(quest.id);
          else if (this.questSection === "available") { startQuest(quest.id); this.rebuild(); }
          else if (this.questSection === "completed" && store.beginQuestReplay(quest.id, this.activeGameplaySceneKey())) this.launchQuestScene(quest.id);
        });
      }
      this.add(action);
      yy += cardH;
    }
    if (pages > 1) {
      const pager = this.scene.add.text(x + w / 2, y + maxH - 20, `‹  ${this.questPage + 1}/${pages}  ›`, {
        fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 12, y: 4 }, resolution: 2,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      pager.on("pointerdown", () => { this.questPage = (this.questPage + 1) % pages; this.rebuild(); });
      this.add(pager);
    }
  }

  private activeGameplaySceneKey() {
    return this.scene.scene.manager.getScenes(true).map((active) => active.scene.key).find((key) => key !== SceneKeys.UI);
  }

  private launchQuestScene(questId: string) {
    this.close();
    const active = this.scene.scene.manager.getScenes(true).find((candidate) => candidate.scene.key !== SceneKeys.UI);
    if (!active) return;
    if (questId === "q_retrieve_tigor") {
      active.scene.start(SceneKeys.TigorMission);
      return;
    }
    active.scene.start(SceneKeys.World, { locationId: store.state.currentLocation, driving: store.state.inJeep });
    store.toast("Replay ready · follow the quest card", "#8ecae6");
  }

  private drawNotes(x: number, y: number, w: number, maxH: number) {
    let yy = y;
    this.add(this.scene.add.text(x, yy, `SOUVENIR SHELF  ${store.state.displayedSouvenirs.length}/5 displayed`, { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    yy += 21;
    const souvenirs = SOUVENIRS.filter((souvenir) => store.state.souvenirs.includes(souvenir.id));
    if (!souvenirs.length) {
      this.add(this.scene.add.text(x, yy, "Travel leaves little things behind.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", resolution: 2 }));
      yy += 22;
    }
    for (const souvenir of souvenirs.slice(0, 3)) {
      const shown = store.state.displayedSouvenirs.includes(souvenir.id);
      const row = this.scene.add.text(x, yy, `${souvenir.icon} ${souvenir.name}  ${shown ? "ON SHELF" : "STORED"}`, { fontFamily: FONT, fontSize: "9px", color: "#3a2b3a", backgroundColor: shown ? "#fff0bd" : "#eee5da", padding: { x: 5, y: 3 }, fixedWidth: w, resolution: 2 }).setInteractive({ useHandCursor: true });
      row.on("pointerdown", () => { store.toggleSouvenirDisplay(souvenir.id); this.rebuild(); });
      this.add(row);
      yy += 20;
    }
    yy += 5;
    const discovered = SECRETS.filter((secret) => store.state.discoveredNotes.includes(secret.id));
    this.add(this.scene.add.text(x, yy, `FOUND NOTES  ${discovered.length}/${SECRETS.length}`, { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    yy += 20;
    if (!discovered.length) {
      this.add(this.scene.add.text(x, yy, "No hidden notes yet.\nLook for the small things other people walk past.", { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", wordWrap: { width: w }, resolution: 2 }));
      yy += 46;
    }
    for (const secret of discovered) {
      if (yy > y + maxH - 22) break;
      this.add(this.scene.add.text(x, yy, `• ${secret.title}\n  ${secret.hint}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", wordWrap: { width: w - 8 }, resolution: 2 }));
      yy += 30;
    }
    if (yy > y + maxH - 30) return;
    this.add(this.scene.add.text(x, yy + 4, "KEEPSAKES", { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    yy += 24;
    const keepsakes = store.state.keepsakes.map((id) => KEEPSAKES[id]).filter(Boolean);
    if (!keepsakes.length) {
      this.add(this.scene.add.text(x, yy, "Grow your relationships to fill this shelf.", { fontFamily: FONT, fontSize: "10px", color: "#a08a70", wordWrap: { width: w }, resolution: 2 }));
      return;
    }
    for (const keepsake of keepsakes) {
      if (yy > y + maxH - 28) break;
      this.add(this.scene.add.text(x, yy, `♡ ${keepsake.name}\n  ${keepsake.description}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", wordWrap: { width: w - 8 }, resolution: 2 }));
      yy += 31;
    }
  }

  private drawQuestTour(x: number, y: number, w: number, maxH: number) {
    const quest = QUESTS[this.debugQuestIndex];
    if (!quest) return;
    const status = store.state.quests[quest.id]?.status ?? "available";
    const giver = NPCS.find((npc) => npc.id === quest.giver)?.name ?? quest.giver;
    this.add(this.scene.add.text(x, y, `QUEST TOUR  ${this.debugQuestIndex + 1}/${QUESTS.length}`, { fontFamily: FONT, fontSize: "11px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    this.add(this.scene.add.text(x, y + 22, quest.title, { fontFamily: FONT, fontSize: "15px", color: "#3a2b3a", fontStyle: "bold", wordWrap: { width: w }, resolution: 2 }));
    this.add(this.scene.add.text(x, y + 43, `Giver: ${giver} · ${status}`, { fontFamily: FONT, fontSize: "10px", color: "#a08a70", resolution: 2 }));
    this.add(this.scene.add.text(x, y + 64, quest.intro, { fontFamily: FONT, fontSize: "11px", color: "#3a2b3a", wordWrap: { width: w }, resolution: 2 }));
    let yy = y + 118;
    this.add(this.scene.add.text(x, yy, "OBJECTIVES", { fontFamily: FONT, fontSize: "10px", color: "#e46d94", fontStyle: "bold", resolution: 2 }));
    yy += 18;
    for (const [index, step] of quest.steps.entries()) {
      this.add(this.scene.add.text(x, yy, `${index + 1}. ${step.hint}`, { fontFamily: FONT, fontSize: "10px", color: "#3a2b3a", wordWrap: { width: w - 4 }, resolution: 2 }));
      yy += 26;
    }
    if (yy < y + maxH - 72) this.add(this.scene.add.text(x, yy + 2, `FINISH: ${quest.complete}`, { fontFamily: FONT, fontSize: "10px", color: "#7a6a5a", wordWrap: { width: w }, resolution: 2 }));
    const controlsY = y + maxH - 26;
    const start = this.scene.add.text(x + w / 2, controlsY - 34, status === "available" ? "Start this quest" : status === "active" ? "Quest already active" : "Quest completed", {
      fontFamily: FONT,
      fontSize: "10px",
      color: "#fff",
      backgroundColor: status === "available" ? "#e46d94" : "#8a7a6a",
      padding: { x: 8, y: 4 },
      resolution: 2,
    }).setOrigin(0.5);
    if (status === "available") {
      start.setInteractive({ useHandCursor: true });
      start.on("pointerdown", () => {
        startQuest(quest.id);
        store.toast(`Debug started: ${quest.title}`, "#f4c95d");
        this.rebuild();
      });
    }
    const previous = this.scene.add.text(x + 38, controlsY, "Previous", { fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#8a7a6a", padding: { x: 7, y: 4 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const next = this.scene.add.text(x + w - 30, controlsY, "Next", { fontFamily: FONT, fontSize: "10px", color: "#fff", backgroundColor: "#2f6fd0", padding: { x: 7, y: 4 }, resolution: 2 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    previous.on("pointerdown", () => {
      this.debugQuestIndex = (this.debugQuestIndex - 1 + QUESTS.length) % QUESTS.length;
      this.rebuild();
    });
    next.on("pointerdown", () => {
      this.debugQuestIndex = (this.debugQuestIndex + 1) % QUESTS.length;
      this.rebuild();
    });
    this.add(start);
    this.add(previous);
    this.add(next);
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

  private drawStyle(x: number, y: number, w: number, maxH: number) {
    const sprinting = store.state.outfit === "red_bottom_boots";
    this.add(
      this.scene.add.text(x, y, sprinting ? "SPRINT ACTIVE  +65% speed" : "Choose a fit. Red-bottom boots unlock sprint.", {
        fontFamily: FONT,
        fontSize: "12px",
        color: sprinting ? "#cf1737" : "#3a2b3a",
        fontStyle: "bold",
        wordWrap: { width: w },
        resolution: 2,
      }),
    );
    let yy = y + 30;
    const entries = Object.entries(Outfits);
    for (let i = 0; i < entries.length; i += 2) {
      if (yy > y + maxH - 44) break;
      for (let col = 0; col < 2; col++) {
        const entry = entries[i + col];
        if (!entry) continue;
        const [id, outfit] = entry;
        const unlocked = store.isOutfitUnlocked(id);
        const cx = x + col * (w / 2);
        const hint = OUTFIT_UNLOCKS.find((u) => u.id === id)?.hint ?? "";
        const swatch = this.scene.add.rectangle(cx + 11, yy + 13, 20, 20, Phaser.Display.Color.HexStringToColor(outfit.top).color).setStrokeStyle(2, 0x3a2b3a).setAlpha(unlocked ? 1 : 0.3);
        const button = this.scene.add
          .text(cx + 26, yy, unlocked ? outfit.label : "Locked", {
            fontFamily: FONT,
            fontSize: "10px",
            color: "#fff",
            backgroundColor: unlocked ? (id === "red_bottom_boots" ? "#cf1737" : "#2f6fd0") : "#8a7a6a",
            padding: { x: 5, y: 5 },
            resolution: 2,
          })
          .setInteractive({ useHandCursor: true });
        button.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, e?: Phaser.Types.Input.EventData) => {
          e?.stopPropagation?.();
          if (!unlocked) {
            store.toast(hint, "#a08a70");
            return;
          }
          rebuildPlayerTexture(this.scene, id);
          store.setOutfit(id);
          store.toast(id === "red_bottom_boots" ? "Red-bottom sprint active" : `Now wearing: ${outfit.label}`, id === "red_bottom_boots" ? "#cf1737" : "#f4a6c0");
          this.rebuild();
        });
        this.add(swatch);
        this.add(button);
      }
      yy += 38;
    }
  }
}
