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

  // build the session's location behind the title screen: visuals only, the
  // gameplay setup (save writes, quests, messages, encounters) waits for Start
  let ready: Promise<void> = game.loadLocation(Game3D.sessionLocation(), { deferSetup: true });
  let started = false;
  // A save that had not been started before this session (or was reset via
  // "New game", which replaces store.state) is fresh: its first 3D location
  // becomes currentLocation. Captured now because the title flips
  // state.started before emitting "startGame".
  const bootState = store.state;
  const bootFresh = !store.state.started;
  const start = () => {
    if (started) return;
    started = true;
    void ready.then(() => {
      // a New game may have reset the save while the world was pre-built; the
      // save-dependent entities (pickups, secrets, NPCs...) are only created
      // by the deferred setup, so rebuilding is needed only if the location changed
      const fresh = bootFresh || store.state !== bootState;
      const want = Game3D.sessionLocation();
      if (game.current?.id !== want) ready = game.loadLocation(want, { deferSetup: true }).then(() => game.beginSession({ fresh }));
      else game.beginSession({ fresh });
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
