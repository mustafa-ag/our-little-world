import type { Poi, Rect } from "./locations";

/** Road ring. Centre stays as whatever ground is already there (grass island). */
export function roundabout(cx: number, cy: number, r = 5, thick = 2): Rect[] {
  const cells = new Map<string, Rect>();
  const steps = Math.max(28, r * 14);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    for (let t = 0; t < thick; t++) {
      const rr = r - t;
      const x = Math.round(cx + Math.cos(a) * rr);
      const y = Math.round(cy + Math.sin(a) * rr);
      cells.set(`${x},${y}`, { x, y, w: 1, h: 1 });
    }
  }
  return [...cells.values()];
}

/** Arc of road tiles. Angle 0 = east, π/2 = south (screen y-down). */
export function arcRoad(cx: number, cy: number, r: number, a0: number, a1: number, thick = 2): Rect[] {
  const cells = new Map<string, Rect>();
  const span = Math.abs(a1 - a0);
  const steps = Math.max(16, Math.round(r * span * 4));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    for (let t = 0; t < thick; t++) {
      const rr = r - t + (thick > 1 ? 0.5 : 0);
      const x = Math.round(cx + Math.cos(a) * rr);
      const y = Math.round(cy + Math.sin(a) * rr);
      cells.set(`${x},${y}`, { x, y, w: 1, h: 1 });
    }
  }
  return [...cells.values()];
}

export function mixAlongArc(
  texes: string[],
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  n: number,
  extra?: Partial<Poi>,
): Poi[] {
  const out: Poi[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = a0 + (a1 - a0) * t;
    const tx = Math.round(cx + Math.cos(a) * r);
    const ty = Math.round(cy + Math.sin(a) * r);
    const k = `${Math.round(tx / 2)},${Math.round(ty / 2)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ tex: texes[i % texes.length], tx, ty, role: "deco", ...extra });
  }
  return out;
}

export function mixRow(texes: string[], x0: number, y: number, n: number, dx: number, extra?: Partial<Poi>): Poi[] {
  return Array.from({ length: n }, (_, i) => ({
    tex: texes[i % texes.length],
    tx: x0 + i * dx,
    ty: y,
    role: "deco" as const,
    ...extra,
  }));
}

export function mixCol(texes: string[], x: number, y0: number, n: number, dy: number, extra?: Partial<Poi>): Poi[] {
  return Array.from({ length: n }, (_, i) => ({
    tex: texes[i % texes.length],
    tx: x,
    ty: y0 + i * dy,
    role: "deco" as const,
    ...extra,
  }));
}

export function palms(x0: number, y: number, n: number, dx: number): Poi[] {
  return mixRow(["o_palm"], x0, y, n, dx);
}

export function jeep(tx: number, ty: number): Poi {
  return { tex: "v_jeep_blue", tx, ty, role: "drive" };
}
