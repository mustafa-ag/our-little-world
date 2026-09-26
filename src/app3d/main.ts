// Boot: load the save, mount the DOM UI (title screen, HUD, dialogue, joystick)
// and start the Babylon world when the UI emits "startGame". The world is
// preloaded behind the title so the first frame after Start is instant.

import { store } from "../game/systems/store";
import { uiEvents } from "../game/systems/controls";
import { mountUI } from "./ui";
import { Game3D } from "./game3d";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { TimeOfDay } from "../game/systems/save";

function boot() {
  const host = document.getElementById("game") ?? document.body;
  store.init();
  const ui = mountUI(host);
  const game = new Game3D(host);
  const params = new URLSearchParams(location.search);
  const benchmarkTime = params.get("benchmarkTime") as TimeOfDay | null;
  const benchmark = params.get("benchmark") === "1";
  const memoryTest = params.get("memoryTest") === "1";

  // Profiler code is an async chunk. Development builds expose F3; production
  // requires the explicit ?perf=1 opt-in before the key is armed.
  const perfRequested = params.get("perf") === "1";
  const allowProfiler = import.meta.env.DEV || perfRequested;
  if (perfRequested) void game.toggleProfiler(true);
  if (allowProfiler && !perfRequested) {
    const onProfilerKey = (event: KeyboardEvent) => {
      if (event.key !== "F3" || event.repeat) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.removeEventListener("keydown", onProfilerKey, { capture: true });
      window.setTimeout(() => void game.toggleProfiler(true), 0);
    };
    window.addEventListener("keydown", onProfilerKey, { capture: true });
  }

  // build the session's location behind the title screen: visuals only, the
  // gameplay setup (save writes, quests, messages, encounters) waits for Start
  let ready: Promise<void> = game.loadLocation(benchmark ? Game3D.DEFAULT_LOCATION : Game3D.sessionLocation(), { deferSetup: true });
  if (benchmarkTime && ["morning", "afternoon", "evening", "night"].includes(benchmarkTime)) {
    ready = ready.then(() => game.setTime(benchmarkTime));
  }
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
      if (game.current?.id !== want && !benchmark) ready = game.loadLocation(want, { deferSetup: true }).then(() => game.beginSession({ fresh }));
      else game.beginSession({ fresh, benchmark });
    });
  };
  uiEvents.on("startGame", start);

  if (memoryTest && allowProfiler) {
    void ready.then(async () => {
      const samples = await game.runDistrictMemoryTest(10);
      const out = document.createElement("pre");
      out.id = "olw-memory-test-results";
      out.style.cssText = "position:fixed;inset:8px;z-index:20000;overflow:auto;background:#101817ee;color:#d9ffe4;padding:12px;font:11px/1.4 monospace;white-space:pre-wrap";
      out.textContent = JSON.stringify(samples, null, 2);
      document.body.append(out);
    });
  }

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
