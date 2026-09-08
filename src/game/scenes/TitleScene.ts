import Phaser from "phaser";
import { SceneKeys } from "../constants";
import { store } from "../systems/store";
import { resetControls, uiEvents, type MiniGameSpec } from "../systems/controls";
import type { QuestActivityId } from "./QuestActivityScene";
import { QUESTS } from "../data/quests";
import type { SaveSlot } from "../systems/save";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Title);
  }

  create() {
    const { width, height } = this.scale.gameSize;
    resetControls();

    if (import.meta.env.DEV) {
      const query = new URLSearchParams(window.location.search);
      const life = query.get("debugLife");
      if (life === "wedding") { this.scene.start(SceneKeys.Wedding); return; }
      if (life === "tigor") {
        store.state.tigor.missionChapter = Phaser.Math.Clamp(Number(query.get("chapter") ?? 0), 0, 4);
        this.scene.start(store.state.tigor.missionChapter === 4 ? SceneKeys.TigorAirport : SceneKeys.TigorMission);
        return;
      }
      if (life === "romance") { this.scene.start(SceneKeys.Romance, { activity: "romance_proposal" }); return; }
      if (life === "home") { this.scene.start(SceneKeys.House, { propertyId: query.get("property") ?? "starter_yas", title: "BUILD MODE QA" }); return; }
      if (life === "positano" || life === "santorini") { this.scene.start(SceneKeys.World, { locationId: life === "positano" ? "italy_positano" : "greece_santorini", driving: false }); return; }
      const activity = query.get("debugActivity") as QuestActivityId | "shopping_spree" | null;
      const activities: Array<QuestActivityId | "shopping_spree"> = ["shopping_spree", "apartment_1701", "chloe_thesis", "nour_visit", "fry_thief"];
      if (activity && activities.includes(activity)) {
        if (activity === "shopping_spree") this.scene.start(SceneKeys.BabaShopping, { mallId: "dubai_mall", debugStage: Number(query.get("debugStage") ?? 0) });
        else this.scene.start(SceneKeys.QuestActivity, { activity, returnLocation: "abudhabi_yas" });
        return;
      }
      const mini = query.get("debugMini") as MiniGameSpec["kind"] | null;
      const minis: MiniGameSpec["kind"][] = ["stairs", "salon", "coffee", "bouquet", "photo", "showdown", "shopping", "safe", "lab", "pitch", "lockpick", "badge_photo"];
      if (mini && minis.includes(mini)) {
        this.scene.launch(SceneKeys.UI);
        this.time.delayedCall(80, () => uiEvents.emit("minigame", { kind: mini, title: `QA · ${mini}`, hint: "Development-only activity preview. A and touch controls should both work.", taps: 20, photoBuddy: "char_fadwa", photoTex: "o_fountain", onDone: () => store.toast("QA activity completed", "#7be0a3") } satisfies MiniGameSpec));
      }
    }

    // soft sky gradient
    const g = this.add.graphics();
    for (let i = 0; i < height; i++) {
      const t = i / height;
      const r = Math.round(142 + (244 - 142) * t);
      const gg = Math.round(202 + (166 - 202) * t);
      const b = Math.round(230 + (192 - 230) * t);
      g.fillStyle(Phaser.Display.Color.GetColor(r, gg, b), 1).fillRect(0, i, width, 1);
    }

    // floating hearts
    for (let i = 0; i < 10; i++) {
      const h = this.add.image(Phaser.Math.Between(20, width - 20), Phaser.Math.Between(40, height - 40), "ui_heart").setScale(Phaser.Math.FloatBetween(1, 2.4)).setAlpha(0.5);
      this.tweens.add({ targets: h, y: h.y - Phaser.Math.Between(20, 50), duration: Phaser.Math.Between(1800, 3200), yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }

    this.add.image(width / 2, height * 0.17, "ui_heart").setScale(4.2);
    this.add
      .text(width / 2, height * 0.27, "Juju's World", {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#fff",
        stroke: "#e46d94",
        strokeThickness: 7,
        resolution: 2,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.34, "made for Jasmin, with love — Moomoo", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#fff",
        stroke: "#3a2b3a",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5);

    this.buildCloudControl(width / 2, height * 0.40);

    this.add
      .text(width / 2, height * 0.45, "CHOOSE A STORY", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#fff4e6",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    const rowHeight = 62;
    const listTop = Math.min(height * 0.52, height - rowHeight * 3 - 26);
    store.getSaveSlots().forEach((slot, index) => this.buildSaveCard(slot, index, width / 2, listTop + index * (rowHeight + 8), Math.min(360, width - 28), rowHeight));

    this.input.keyboard?.once("keydown-SPACE", () => this.startGame());
    this.input.keyboard?.once("keydown-ENTER", () => this.startGame());
  }

  private buildCloudControl(x: number, y: number) {
    const label = this.add
      .text(x, y, this.cloudLabel(), {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#fff4e6",
        backgroundColor: "#3a2b3a88",
        padding: { x: 8, y: 5 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const refresh = () => label.setText(this.cloudLabel());
    store.on("cloud", refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => store.off("cloud", refresh));

    label.on("pointerdown", async () => {
      if (store.cloudStatus === "disabled") {
        store.toast("Cloud saves will be available in the next live update.", "#fff4e6");
        return;
      }
      if (store.cloudStatus === "synced") {
        const signOut = window.confirm("Sign out of cloud saves on this device? Your local saves will remain here.");
        if (signOut) await store.signOutOfCloud();
        return;
      }
      const saveName = window.prompt("Choose a private cloud-save name. Use this same name on phone, tablet, and laptop:");
      if (!saveName) return;
      const password = window.prompt("Create or enter your cloud-save password (at least 8 characters). Keep it private and use the same one on every device:");
      if (!password) return;
      try {
        const created = await store.connectCloudSave(saveName, password);
        store.toast(created ? "Cloud save created and synced." : "Cloud save connected and synced.", "#8ecae6");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not connect cloud saves.";
        store.toast(message, "#ff8fae");
      }
    });
  }

  private cloudLabel() {
    if (store.cloudStatus === "disabled") return "CLOUD SAVES · SETTING UP";
    if (store.cloudStatus === "syncing") return "CLOUD SAVES · SYNCING";
    if (store.cloudStatus === "synced") return "CLOUD SAVES · SYNCED · TAP TO SIGN OUT";
    if (store.cloudStatus === "error") return "CLOUD SAVES · COULDN'T CONNECT · TAP TO RETRY";
    return "CLOUD SAVES · TAP TO CONNECT";
  }

  private startGame() {
    store.state.started = true;
    store.save();
    this.cameras.main.fadeOut(300, 142, 202, 230);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SceneKeys.World, { locationId: store.state.currentLocation, driving: store.state.inJeep });
    });
  }

  private buildSaveCard(slot: SaveSlot, index: number, x: number, y: number, width: number, height: number) {
    const active = slot.id === store.activeSaveSlotId;
    const complete = QUESTS.filter((quest) => slot.state.quests[quest.id]?.status === "done").length;
    const percentage = QUESTS.length === 0 ? 0 : Math.round((complete / QUESTS.length) * 100);
    const started = slot.state.started;
    const card = this.add
      .rectangle(x, y, width, height, active ? 0xfff4e6 : 0xffffff, active ? 0.98 : 0.88)
      .setStrokeStyle(2, active ? 0xe46d94 : 0x3a2b3a, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x - width / 2 + 14, y - 18, `STORY ${index + 1}${active ? " · SELECTED" : ""}`, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#3a2b3a",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0, 0.5);
    const detail = this.add
      .text(x - width / 2 + 14, y + 10, started ? `Day ${slot.state.currentDay} · ${complete}/${QUESTS.length} quests · ${percentage}% complete` : "Fresh story · tap to begin", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#6d5665",
        resolution: 2,
      })
      .setOrigin(0, 0.5);
    const action = this.add
      .text(x + width / 2 - 12, y, started ? "Play" : "Start", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#fff",
        backgroundColor: started ? "#2f6fd0" : "#e46d94",
        padding: { x: 7, y: 5 },
        resolution: 2,
      })
      .setOrigin(1, 0.5);

    const select = () => {
      if (started) store.loadSaveSlot(slot.id);
      else store.startNewSaveSlot(slot.id);
      this.startGame();
    };
    card.on("pointerdown", select);
    action.setInteractive({ useHandCursor: true }).on("pointerdown", select);
    const cardParts = [card, label, detail, action];
    for (const part of cardParts) part.setAlpha(0);
    this.tweens.add({ targets: cardParts, alpha: 1, duration: 180, delay: index * 90, ease: "Sine.out" });
  }
}
