import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { RegisterEnginesExtensionsEngineQuery } from "@babylonjs/core/Engines/Extensions/engine.query.pure";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Scene } from "@babylonjs/core/scene";

export interface ProfilerContext {
  engine: AbstractEngine;
  scene: Scene;
  location: () => string;
  quality: () => string;
  loadedGlbs: () => number;
  loadMs: () => number;
}

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  renderMs: number;
  cpuMs: number;
  gpuMs: number | null;
  drawCalls: number;
  activeMeshes: number;
  totalMeshes: number;
  activeParticles: number;
  triangles: number;
  vertices: number;
  materials: number;
  textures: number;
  animations: number;
  loadedGlbs: number;
  loadMs: number;
  location: string;
  quality: string;
  hardwareScaling: number;
  backend: string;
  heapMb: number | null;
}

const ms = (value: number) => (Number.isFinite(value) ? value : 0);
const gpuMs = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return null;
  // EXT_disjoint_timer_query values are nanoseconds. Keep this defensive for
  // engines/backends that already report milliseconds.
  return value > 1000 ? value / 1_000_000 : value;
};
const fixed = (value: number | null, digits = 1) => (value === null ? "n/a" : value.toFixed(digits));

export class PerformanceProfiler {
  private readonly sceneInstrumentation: SceneInstrumentation;
  private readonly engineInstrumentation: EngineInstrumentation;
  private readonly node: HTMLPreElement;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private timer: number | null = null;
  private visible = false;
  private readonly gpuTimingAvailable: boolean;

  constructor(private readonly context: ProfilerContext) {
    RegisterEnginesExtensionsEngineQuery();
    this.sceneInstrumentation = new SceneInstrumentation(context.scene);
    this.sceneInstrumentation.captureFrameTime = true;
    this.sceneInstrumentation.captureRenderTime = true;
    this.sceneInstrumentation.captureAnimationsTime = true;
    this.sceneInstrumentation.captureParticlesRenderTime = true;

    this.engineInstrumentation = new EngineInstrumentation(context.engine);
    this.gpuTimingAvailable = typeof (context.engine as unknown as { getGPUFrameTimeCounter?: unknown }).getGPUFrameTimeCounter === "function";
    try {
      if (this.gpuTimingAvailable) this.engineInstrumentation.captureGPUFrameTime = true;
    } catch {
      // Timer queries are optional (notably on software/older mobile WebGL).
    }

    this.node = document.createElement("pre");
    this.node.id = "olw-performance-profiler";
    this.node.dataset.testid = "performance-profiler";
    this.node.setAttribute("aria-live", "off");
    Object.assign(this.node.style, {
      position: "fixed",
      left: "max(8px, env(safe-area-inset-left))",
      bottom: "max(8px, env(safe-area-inset-bottom))",
      zIndex: "10000",
      display: "none",
      margin: "0",
      padding: "10px 12px",
      maxWidth: "min(430px, calc(100vw - 16px))",
      maxHeight: "calc(100vh - 16px)",
      overflow: "auto",
      border: "1px solid rgba(156, 255, 191, .7)",
      borderRadius: "8px",
      background: "rgba(7, 13, 12, .88)",
      color: "#d9ffe4",
      boxShadow: "0 5px 24px rgba(0,0,0,.35)",
      font: "600 11px/1.38 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      whiteSpace: "pre",
      pointerEvents: "none",
    });
    document.body.append(this.node);

    this.onKeyDown = (event) => {
      if (event.key !== "F3" || event.repeat) return;
      event.preventDefault();
      this.toggle();
    };
    window.addEventListener("keydown", this.onKeyDown, { capture: true });
  }

  toggle(force?: boolean) {
    this.visible = force ?? !this.visible;
    this.node.style.display = this.visible ? "block" : "none";
    if (this.visible) {
      this.refresh();
      if (this.timer === null) this.timer = window.setInterval(() => this.refresh(), 350);
    } else if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    return this.visible;
  }

  snapshot(): PerformanceSnapshot {
    const { scene, engine } = this.context;
    const frame = ms(this.sceneInstrumentation.frameTimeCounter.lastSecAverage);
    const render = ms(this.sceneInstrumentation.renderTimeCounter.lastSecAverage);
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const webgl = "webGLVersion" in engine ? (engine as { webGLVersion?: number }).webGLVersion : undefined;
    const backend = webgl ? `WebGL ${webgl}` : engine.getClassName().replace(/Engine$/, "") || "unknown";
    const gpu = this.gpuTimingAvailable ? gpuMs(this.engineInstrumentation.gpuFrameTimeCounter.lastSecAverage) : null;
    return {
      fps: engine.getFps(),
      frameMs: frame,
      renderMs: render,
      cpuMs: Math.max(0, frame - (gpu ?? 0)),
      gpuMs: gpu,
      drawCalls: this.sceneInstrumentation.drawCallsCounter.current,
      activeMeshes: scene.getActiveMeshes().length,
      totalMeshes: scene.meshes.length,
      activeParticles: scene.getActiveParticles(),
      triangles: Math.round(scene.getActiveIndices() / 3),
      vertices: scene.getTotalVertices(),
      materials: scene.materials.length,
      textures: scene.textures.length,
      animations: scene.animatables.length + scene.animationGroups.filter((group) => group.isStarted).length,
      loadedGlbs: this.context.loadedGlbs(),
      loadMs: this.context.loadMs(),
      location: this.context.location(),
      quality: this.context.quality(),
      hardwareScaling: engine.getHardwareScalingLevel(),
      backend,
      heapMb: memory.memory ? memory.memory.usedJSHeapSize / 1_048_576 : null,
    };
  }

  private refresh() {
    const s = this.snapshot();
    this.node.textContent = [
      `OUR LITTLE WORLD · PERFORMANCE  [F3]`,
      `FPS ${fixed(s.fps)}   frame ${fixed(s.frameMs)} ms`,
      `render ${fixed(s.renderMs)} ms   CPU ${fixed(s.cpuMs)} ms   GPU ${fixed(s.gpuMs)} ms`,
      `draws ${s.drawCalls}   meshes ${s.activeMeshes}/${s.totalMeshes} active/total`,
      `triangles ${s.triangles.toLocaleString()}   vertices ${s.vertices.toLocaleString()}`,
      `particles ${s.activeParticles}   animations ${s.animations}`,
      `materials ${s.materials}   textures ${s.textures}   GLBs ${s.loadedGlbs}`,
      `location ${s.location}   last load ${s.loadMs.toFixed(0)} ms`,
      `quality ${s.quality}   scaling ${s.hardwareScaling.toFixed(2)}`,
      `backend ${s.backend}${s.heapMb === null ? "" : `   heap ${s.heapMb.toFixed(1)} MB`}`,
    ].join("\n");
  }

  dispose() {
    if (this.timer !== null) window.clearInterval(this.timer);
    window.removeEventListener("keydown", this.onKeyDown, { capture: true });
    this.sceneInstrumentation.dispose();
    this.engineInstrumentation.dispose();
    this.node.remove();
  }
}
