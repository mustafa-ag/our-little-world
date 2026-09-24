// Boot: load the save, mount the DOM UI (title screen, HUD, dialogue, joystick)
// and start the Babylon world when the UI emits "startGame". The world is
// preloaded behind the title so the first frame after Start is instant.

import { store } from "../game/systems/store";
import { uiEvents } from "../game/systems/controls";
import { mountUI } from "./ui";
import { Game3D } from "./game3d";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";

function boot() {
  const host = document.getElementById("game") ?? document.body;
  store.init();
  const ui = mountUI(host);
  const game = new Game3D(host);

  // build the session's location behind the title screen
  let ready: Promise<void> = game.loadLocation(Game3D.sessionLocation());
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    void ready.then(() => {
      // a New game may have reset the save while the world was pre-built
      const want = Game3D.sessionLocation();
      if (game.current?.id !== want) ready = game.loadLocation(want);
    });
  };
  uiEvents.on("startGame", start);

  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.__game = game;
    w.__store = store;
    w.__uiEvents = uiEvents;
    w.__ui = ui;
    w.__startGame = () => {
      store.state.started = true;
      store.save();
      uiEvents.emit("startGame");
    };
    w.__stats = () => game.stats();
    w.__bab = { CreateBox }; // handy for console experiments
  }
}

boot();
