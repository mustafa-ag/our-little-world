// October 11 world dressing: rose petals drifting down around the camera
// target, little hearts rising around Juju, and a warm golden-rose tint on the
// ambient light. Only created when isAnniversary() (see game3d.ts).
import type { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Particles/particleSystemComponent";

export interface AnniversaryFx {
  /** Follow the player (petals + hearts are centred here). */
  update(x: number, y: number, z: number): void;
  /** Re-apply the rose tint after the lighting blend wrote the hemi colours. */
  tint(hemi: HemisphericLight): void;
  /** One-shot firework bursts above the player (end of the day). */
  fireworks(): void;
  dispose(): void;
}

function spriteTexture(scene: Scene, name: string, draw: (c: CanvasRenderingContext2D, s: number) => void): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, size, size);
  draw(c, size);
  tex.update();
  return tex;
}

const drawPetal = (c: CanvasRenderingContext2D, s: number) => {
  const g = c.createRadialGradient(s * 0.45, s * 0.4, 2, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0.6)");
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(s / 2, s / 2, s * 0.28, s * 0.44, 0.5, 0, Math.PI * 2);
  c.fill();
};

const drawHeart = (c: CanvasRenderingContext2D, s: number) => {
  c.fillStyle = "#ffffff";
  c.beginPath();
  const top = s * 0.3;
  c.moveTo(s / 2, s * 0.86);
  c.bezierCurveTo(s * 0.05, s * 0.55, s * 0.08, top - s * 0.18, s / 2, top);
  c.bezierCurveTo(s * 0.92, top - s * 0.18, s * 0.95, s * 0.55, s / 2, s * 0.86);
  c.fill();
};

const drawSpark = (c: CanvasRenderingContext2D, s: number) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
};

const ROSE_SKY = new Color3(1.0, 0.78, 0.8);
const GOLD_GROUND = new Color3(1.0, 0.82, 0.55);

export function createAnniversaryFx(scene: Scene, isMobile: boolean): AnniversaryFx {
  const petalTex = spriteTexture(scene, "anniv:petal", drawPetal);
  const heartTex = spriteTexture(scene, "anniv:heart", drawHeart);
  const sparkTex = spriteTexture(scene, "anniv:spark", drawSpark);

  // ---- rose petals: a wide box high above the player, drifting down ----
  const petalOrigin = new Vector3();
  const petals = new ParticleSystem("anniv:petals", isMobile ? 260 : 600, scene);
  petals.particleTexture = petalTex;
  petals.emitter = petalOrigin;
  petals.minEmitBox = new Vector3(-16, 9, -16);
  petals.maxEmitBox = new Vector3(16, 12, 16);
  petals.color1 = new Color4(1.0, 0.45, 0.6, 1); // rose pink
  petals.color2 = new Color4(0.85, 0.1, 0.25, 1); // deep red
  petals.colorDead = new Color4(1, 1, 1, 0); // fades to white mist
  petals.minSize = 0.12;
  petals.maxSize = 0.26;
  petals.minLifeTime = 5;
  petals.maxLifeTime = 8;
  petals.emitRate = isMobile ? 30 : 70;
  petals.gravity = new Vector3(0.25, -1.1, 0.1);
  petals.direction1 = new Vector3(-0.6, -0.4, -0.3);
  petals.direction2 = new Vector3(0.6, -0.2, 0.3);
  petals.minEmitPower = 0.2;
  petals.maxEmitPower = 0.6;
  petals.minAngularSpeed = -2.5;
  petals.maxAngularSpeed = 2.5;
  petals.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  petals.start();

  // ---- hearts floating up around Juju ----
  const heartOrigin = new Vector3();
  const hearts = new ParticleSystem("anniv:hearts", 60, scene);
  hearts.particleTexture = heartTex;
  hearts.emitter = heartOrigin;
  hearts.minEmitBox = new Vector3(-0.8, 0.4, -0.8);
  hearts.maxEmitBox = new Vector3(0.8, 1.2, 0.8);
  hearts.color1 = new Color4(1, 0.36, 0.54, 1);
  hearts.color2 = new Color4(1, 0.7, 0.8, 1);
  hearts.colorDead = new Color4(1, 0.8, 0.9, 0);
  hearts.minSize = 0.12;
  hearts.maxSize = 0.24;
  hearts.minLifeTime = 1.6;
  hearts.maxLifeTime = 2.6;
  hearts.emitRate = 5;
  hearts.gravity = new Vector3(0, 0.5, 0);
  hearts.direction1 = new Vector3(-0.15, 0.6, -0.15);
  hearts.direction2 = new Vector3(0.15, 1, 0.15);
  hearts.minEmitPower = 0.3;
  hearts.maxEmitPower = 0.6;
  hearts.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  hearts.start();

  const bursts: ParticleSystem[] = [];
  const timers: number[] = [];
  const lastPos = new Vector3();

  const burst = (offset: Vector3, c1: Color4, c2: Color4) => {
    const ps = new ParticleSystem("anniv:firework", 220, scene);
    ps.particleTexture = sparkTex;
    ps.emitter = lastPos.add(offset);
    ps.createSphereEmitter(0.3);
    ps.color1 = c1;
    ps.color2 = c2;
    ps.colorDead = new Color4(1, 0.9, 0.6, 0);
    ps.minSize = 0.15;
    ps.maxSize = 0.35;
    ps.minLifeTime = 1.2;
    ps.maxLifeTime = 2;
    ps.manualEmitCount = 200;
    ps.minEmitPower = 4;
    ps.maxEmitPower = 7;
    ps.gravity = new Vector3(0, -3, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.disposeOnStop = true;
    ps.targetStopDuration = 2.2;
    ps.start();
    bursts.push(ps);
  };

  return {
    update(x, y, z) {
      lastPos.set(x, y, z);
      petalOrigin.set(x, y, z);
      heartOrigin.set(x, y, z);
    },
    tint(hemi) {
      hemi.diffuse = Color3.Lerp(hemi.diffuse, ROSE_SKY, 0.35);
      hemi.groundColor = Color3.Lerp(hemi.groundColor, GOLD_GROUND, 0.3);
    },
    fireworks() {
      const palette: [Color4, Color4][] = [
        [new Color4(1, 0.4, 0.6, 1), new Color4(1, 0.85, 0.4, 1)],
        [new Color4(1, 0.85, 0.5, 1), new Color4(1, 1, 1, 1)],
        [new Color4(0.95, 0.2, 0.35, 1), new Color4(1, 0.6, 0.75, 1)],
      ];
      for (let i = 0; i < 7; i++) {
        const t = window.setTimeout(() => {
          const [a, b] = palette[i % palette.length];
          burst(new Vector3((Math.random() - 0.5) * 14, 9 + Math.random() * 5, (Math.random() - 0.5) * 14), a, b);
        }, i * 550);
        timers.push(t);
      }
    },
    dispose() {
      for (const t of timers) window.clearTimeout(t);
      petals.dispose();
      hearts.dispose();
      for (const b of bursts) b.dispose();
      petalTex.dispose();
      heartTex.dispose();
      sparkTex.dispose();
    },
  };
}
