// Engine + Scene lifecycle: canvas creation, resize/orientation handling,
// render loop with a fixed-step-friendly delta, and disposal.

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";

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

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 720;
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: false, antialias: true, powerPreference: "high-performance" },
    !isMobile,
  );
  // Cap device pixel ratio: retina phones don't need 3x for a stylised scene.
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.66, 0.8, 0.91, 1);
  scene.skipPointerMovePicking = true;
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;
  scene.blockMaterialDirtyMechanism = true;

  const updaters = new Set<(dt: number, now: number) => void>();
  let last = performance.now();
  let running = false;

  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const fn of updaters) fn(dt, now);
    if (scene.activeCamera) scene.render();
  };

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(host);

  return {
    engine,
    scene,
    canvas,
    isMobile,
    onUpdate(fn) {
      updaters.add(fn);
      return () => updaters.delete(fn);
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      engine.runRenderLoop(frame);
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
      scene.dispose();
      engine.dispose();
      canvas.remove();
    },
  };
}
