// Engine + Scene lifecycle: canvas creation, resize/orientation handling,
// render loop with a fixed-step-friendly delta, and disposal.

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { QualityController } from "../performance/quality";

export interface RenderHost {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Register a per-frame callback (dt in seconds, clamped). */
  onUpdate(fn: (dt: number, now: number) => void): () => void;
  start(): void;
  stop(): void;
  dispose(): void;
  isMobile: boolean;
  quality: QualityController;
}

export function createRenderHost(host: HTMLElement): RenderHost {
  const canvas = document.createElement("canvas");
  canvas.id = "game-canvas";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.style.touchAction = "none";
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.zIndex = "0";
  host.insertBefore(canvas, host.firstChild);

  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const isMobile = (coarse || navigator.maxTouchPoints > 0) && Math.min(window.innerWidth, window.innerHeight) < 900;
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: false, antialias: true, powerPreference: "high-performance" },
    !isMobile,
  );
  const quality = new QualityController(engine);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.66, 0.8, 0.91, 1);
  scene.skipPointerMovePicking = true;
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;
  scene.blockMaterialDirtyMechanism = true;

  const updaters = new Set<(dt: number, now: number) => void>();
  let last = performance.now();
  let running = false;
  let visible = !document.hidden;

  const frame = () => {
    const now = performance.now();
    const interval = quality.frameIntervalMs;
    if (interval > 0 && now - last < interval * 0.9) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const fn of updaters) fn(dt, now);
    if (scene.activeCamera) scene.render();
    quality.update(dt);
  };

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(host);
  const onVisibility = () => {
    visible = !document.hidden;
    last = performance.now();
    if (!running) return;
    if (visible) engine.runRenderLoop(frame);
    else engine.stopRenderLoop(frame);
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    engine,
    scene,
    canvas,
    isMobile,
    quality,
    onUpdate(fn) {
      updaters.add(fn);
      return () => updaters.delete(fn);
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      if (visible) engine.runRenderLoop(frame);
    },
    stop() {
      running = false;
      engine.stopRenderLoop(frame);
    },
    dispose() {
      this.stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.dispose();
      engine.dispose();
      canvas.remove();
    },
  };
}
