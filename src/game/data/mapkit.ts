import type { PathPoint, PathSpec, Poi, Rect, SurfaceSpec } from "./locations";

export function pt(x: number, y: number): PathPoint {
  return { x, y };
}

/** Thick polyline → unique 1×1 tiles (circle stamp along the line). */
export function stroke(points: PathPoint[], width: number): Rect[] {
  const cells = new Map<string, Rect>();
  if (points.length < 2 || width <= 0) return [];
  const r = Math.max(0.45, width / 2);
  const ir = Math.ceil(r);
  const stamp = (cx: number, cy: number) => {
    for (let oy = -ir; oy <= ir; oy++) {
      for (let ox = -ir; ox <= ir; ox++) {
        if (ox * ox + oy * oy > r * r + 0.35) continue;
        const x = Math.round(cx + ox);
        const y = Math.round(cy + oy);
        cells.set(`${x},${y}`, { x, y, w: 1, h: 1 });
      }
    }
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.max(1, Math.ceil(len * 3));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stamp(a.x + dx * t, a.y + dy * t);
    }
  }
  return [...cells.values()];
}

export function mergeCells(cells: Rect[]): Rect[] {
  const byY = new Map<number, number[]>();
  for (const c of cells) {
    const row = byY.get(c.y) ?? [];
    row.push(c.x);
    byY.set(c.y, row);
  }
  const out: Rect[] = [];
  for (const [y, xs] of byY) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i];
      if (x === prev + 1) {
        prev = x;
        continue;
      }
      out.push({ x: start, y, w: prev - start + 1, h: 1 });
      start = x;
      prev = x;
    }
  }
  return out;
}

export function polyline(
  points: PathPoint[],
  width: number,
  tex: string,
  kind: PathSpec["kind"] = "street",
  walkable = true,
): PathSpec {
  return { points, width, tex, kind, walkable };
}

export function street(points: PathPoint[], width = 3, tex = "t_road"): PathSpec {
  return polyline(points, width, tex, "street", true);
}

export function alley(points: PathPoint[], width = 2, tex = "t_brick_path"): PathSpec {
  return polyline(points, width, tex, "alley", true);
}

export function walkPath(points: PathPoint[], width = 2, tex = "t_pavement"): PathSpec {
  return polyline(points, width, tex, "path", true);
}

export function promenade(points: PathPoint[], width = 3, tex = "t_paving_light"): PathSpec {
  return polyline(points, width, tex, "promenade", true);
}

export function sidewalk(points: PathPoint[], width = 2, tex = "t_pavement"): PathSpec {
  return polyline(points, width, tex, "sidewalk", true);
}

export function waterway(points: PathPoint[], width: number): PathSpec {
  return { points, width, tex: "t_water", kind: "path", walkable: false };
}

export function plaza(x: number, y: number, w: number, h: number, tex = "t_pavement", alt?: string): SurfaceSpec {
  return { x, y, w, h, tex, alt, walkable: true };
}

export function park(x: number, y: number, w: number, h: number): SurfaceSpec {
  return { x, y, w, h, tex: "t_grass", alt: "t_grass2", walkable: true };
}

export function bed(x: number, y: number, w: number, h: number, tex = "t_sand"): SurfaceSpec {
  return { x, y, w, h, tex, walkable: true };
}

/** Average unit normal at a polyline vertex (screen y-down). */
function normals(points: PathPoint[]): PathPoint[] {
  const n = points.length;
  const out: PathPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    out.push({ x: -dy / len, y: dx / len });
  }
  return out;
}

export function offsetPoly(points: PathPoint[], dist: number): PathPoint[] {
  const ns = normals(points);
  return points.map((p, i) => ({ x: p.x + ns[i].x * dist, y: p.y + ns[i].y * dist }));
}

/** Road + a sidewalk on each side. */
export function boulevard(
  points: PathPoint[],
  roadW: number,
  walkW: number,
  roadTex = "t_road",
  walkTex = "t_pavement",
): PathSpec[] {
  const half = roadW / 2 + walkW / 2;
  return [
    street(points, roadW, roadTex),
    sidewalk(offsetPoly(points, half), walkW, walkTex),
    sidewalk(offsetPoly(points, -half), walkW, walkTex),
  ];
}

export function sampleAlong(points: PathPoint[], step: number): { x: number; y: number; nx: number; ny: number }[] {
  const ns = normals(points);
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  if (points.length < 2 || step <= 0) return out;
  let acc = 0;
  let next = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let t = 0;
    while (acc + (1 - t) * len >= next) {
      const dt = (next - acc) / len;
      const u = t + dt;
      out.push({
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        nx: ns[i].x,
        ny: ns[i].y,
      });
      next += step;
      if (next > 4000) break;
    }
    acc += len;
    t = 1;
  }
  return out;
}

/** Buildings sitting beside a street. `side` +1 / −1 picks the bank; `dist` is tiles from centreline. */
export function frontage(
  points: PathPoint[],
  side: 1 | -1,
  dist: number,
  texes: string[],
  step: number,
  extra?: Partial<Poi>,
): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  let i = 0;
  for (const s of sampleAlong(points, step)) {
    const tx = Math.round(s.x + s.nx * dist * side);
    const ty = Math.round(s.y + s.ny * dist * side);
    const k = `${Math.round(tx / 2)},${Math.round(ty / 2)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ tex: texes[i % texes.length], tx, ty, role: "deco", ...extra });
    i++;
  }
  return out;
}

export function dotsAlong(points: PathPoint[], tex: string, step: number, extra?: Partial<Poi>): Poi[] {
  return sampleAlong(points, step).map((s) => ({
    tex,
    tx: Math.round(s.x),
    ty: Math.round(s.y),
    role: "deco" as const,
    ...extra,
  }));
}

/** Arc as points (angle 0 = east, π/2 = south). */
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n?: number): PathPoint[] {
  const span = Math.abs(a1 - a0);
  const steps = n ?? Math.max(8, Math.round(r * span * 1.2));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * (i / steps);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

/** Road ring. Centre stays as whatever ground is already there (grass island). */
export function roundabout(cx: number, cy: number, r = 5, thick = 2): Rect[] {
  return stroke(arcPts(cx, cy, r, 0, Math.PI * 2, Math.max(24, r * 10)), thick);
}

/** Arc of road tiles. Angle 0 = east, π/2 = south (screen y-down). */
export function arcRoad(cx: number, cy: number, r: number, a0: number, a1: number, thick = 2): Rect[] {
  return stroke(arcPts(cx, cy, r, a0, a1), thick);
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
  return frontage(arcPts(cx, cy, r, a0, a1, Math.max(n, 8)), 1, 5, texes, (r * Math.abs(a1 - a0)) / Math.max(1, n - 1) || 8, extra);
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
