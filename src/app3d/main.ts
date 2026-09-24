// Babylon.js 3D renderer — Phase 1 placeholder boot.
// Uses subpath imports (not the @babylonjs/core barrel) so the bundle stays tree-shaken.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

function boot() {
  const host = document.getElementById("game") ?? document.body;
  const canvas = document.createElement("canvas");
  canvas.id = "game-canvas";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0x8e / 255, 0xca / 255, 0xe6 / 255, 1); // sky blue (#8ecae6)

  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 24, Vector3.Zero(), scene);
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 80;
  camera.attachControl(canvas, true);

  const light = new HemisphericLight("sun", new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 1;

  const ground = CreateGround("ground", { width: 40, height: 40 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = Color3.FromHexString("#7cc576");
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  if (import.meta.env.DEV) {
    (window as unknown as { __engine: Engine; __scene: Scene }).__engine = engine;
    (window as unknown as { __scene: Scene }).__scene = scene;
  }
}

boot();
