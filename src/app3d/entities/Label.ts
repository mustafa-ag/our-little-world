// Billboard text label (name tags, building names, district banners) drawn
// once into a small DynamicTexture on a Y-billboard plane. Styled like the
// 2D labels: cream text on a translucent plum pill.

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export interface Label {
  mesh: Mesh;
  setPosition(x: number, y: number, z: number): void;
  dispose(): void;
}

export function createLabel(scene: Scene, text: string, opts: { big?: boolean; scale?: number } = {}): Label {
  const font = opts.big ? "bold 40px Nunito, Trebuchet MS, sans-serif" : "bold 30px Nunito, Trebuchet MS, sans-serif";
  const probe = new DynamicTexture("probe", { width: 8, height: 8 }, scene, false);
  const pctx = probe.getContext() as CanvasRenderingContext2D;
  pctx.font = font;
  const tw = Math.ceil(pctx.measureText(text).width);
  probe.dispose();
  const padX = 22;
  const w = Math.min(1024, tw + padX * 2);
  const h = opts.big ? 72 : 56;
  const tex = new DynamicTexture(`label:${text}`, { width: w, height: h }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.big ? "rgba(58,43,58,0.62)" : "rgba(58,43,58,0.78)";
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.lineTo(w - r, 4);
  ctx.arc(w - r, r + 2, r - 2, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, h);
  ctx.arc(r, r + 2, r - 2, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fill();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = opts.big ? "#fff2cf" : "#fff8ea";
  ctx.fillText(text, w / 2, h / 2 + 2);
  tex.update(false);
  tex.uScale = -1; // the billboard shows the plane's back to the camera

  const mat = new StandardMaterial(`labelMat:${text}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  mat.specularColor = Color3.Black();
  mat.fogEnabled = true;

  const scale = (opts.scale ?? 1) * (opts.big ? 0.012 : 0.0095);
  const mesh = CreatePlane(`label:${text}`, { width: w * scale, height: h * scale }, scene);
  mesh.material = mat;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.renderingGroupId = 0;

  return {
    mesh,
    setPosition(x, y, z) {
      mesh.position.set(x, y, z);
    },
    dispose() {
      mesh.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
